// api/login.js — Entrar a FOREMAN con PIN, verificado en el servidor.
//
// Antes la app bajaba la huella del PIN de cada usuario y comparaba en el
// teléfono: cualquiera con la dirección de la base podía leer esas huellas y
// sacar un PIN de cuatro dígitos en segundos. Ahora la huella no sale de acá.
// Si el PIN es correcto se abre una sesión de Supabase Auth, y con esa sesión
// la base responde; sin ella, no.
//
//   GET  → { configurado, usuarios: [{ id, nombre, rol, color }] }  para elegir perfil
//   POST { usuarioId, pin } → { session, usuario }

import crypto from "crypto";
import { configurado, rest, auth } from "./_supabase.js";

// Freno a quien prueba PIN tras PIN. Vive en la memoria de la función: no es
// perfecto, pero sube mucho el costo de probar los 10.000 PIN posibles.
const intentos = new Map();
const VENTANA = 10 * 60 * 1000;
const MAXIMO = 5;

// Una cuenta de acceso por usuario. El correo no existe ni se usa para escribir:
// ".invalid" es un dominio reservado que nunca recibe correo.
const correoDe = id => `usuario-${id}@foreman.invalid`;

async function json(r) {
  try { return await r.json(); } catch { return {}; }
}

async function cuentaAuth(u) {
  const email = correoDe(u.id);
  // app_metadata solo la puede escribir el servidor: sirve para reglas por rol.
  const app_metadata = { usuario_id: u.id, rol: u.rol };

  if (u.auth_user_id) {
    const r = await auth(`admin/users/${u.auth_user_id}`, { method: "PUT", body: JSON.stringify({ app_metadata }) });
    if (r.ok) return { email, id: u.auth_user_id };
  }

  const creada = await auth("admin/users", { method: "POST", body: JSON.stringify({ email, email_confirm: true, app_metadata }) });
  let id = creada.ok ? (await json(creada)).id : null;
  if (!id) {
    // Ya existía y no quedó anotada en usuarios: se busca por correo.
    for (let pagina = 1; pagina <= 20 && !id; pagina++) {
      const lista = (await json(await auth(`admin/users?page=${pagina}&per_page=200`))).users || [];
      id = lista.find(x => x.email === email)?.id || null;
      if (lista.length < 200) break;
    }
    if (id) await auth(`admin/users/${id}`, { method: "PUT", body: JSON.stringify({ app_metadata }) });
  }
  // Sin la migración 018 no hay columna donde anotarla; se vuelve a buscar la próxima vez.
  if (id && id !== u.auth_user_id) await rest(`usuarios?id=eq.${u.id}`, { method: "PATCH", body: JSON.stringify({ auth_user_id: id }) });
  return id ? { email, id } : null;
}

// Un enlace de acceso generado y canjeado en el mismo momento, sin enviar nada.
async function sesionPara(email) {
  const link = await json(await auth("admin/generate_link", { method: "POST", body: JSON.stringify({ type: "magiclink", email }) }));
  const token_hash = link.hashed_token || link.properties?.hashed_token;
  if (!token_hash) return { error: link.msg || link.error_description || "sin enlace de acceso" };
  for (const type of [...new Set([link.verification_type || "magiclink", "email"])]) {
    const v = await auth("verify", { method: "POST", body: JSON.stringify({ type, token_hash }) });
    const s = await json(v);
    if (v.ok && s.access_token) return { session: s };
  }
  return { error: "no se pudo canjear el enlace de acceso" };
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    if (!configurado()) return res.status(200).json({ configurado: false });
    const r = await rest("usuarios?activo=not.is.false&select=id,nombre,rol,color&order=nombre");
    const usuarios = r.ok ? await json(r) : [];
    return res.status(200).json({ configurado: true, usuarios: Array.isArray(usuarios) ? usuarios : [] });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  if (!configurado()) return res.status(503).json({ error: "El ingreso por servidor todavía no está configurado" });

  const { usuarioId, pin } = req.body || {};
  const id = Number(usuarioId);
  if (!id || !/^\d{4,8}$/.test(String(pin || ""))) return res.status(400).json({ error: "Faltan datos" });

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "?";
  const clave = `${ip}|${id}`;
  const ahora = Date.now();
  const previo = intentos.get(clave);
  if (previo && previo.hasta > ahora && previo.n >= MAXIMO) {
    return res.status(429).json({ error: "Demasiados intentos. Espera unos minutos." });
  }

  try {
    // select=* para no depender de si ya existe la columna auth_user_id.
    const r = await rest(`usuarios?id=eq.${id}&select=*`);
    const [u] = r.ok ? await json(r) : [];
    const huella = crypto.createHash("sha256").update(`foreman:${id}:${pin}`).digest("hex");
    const correcto = !!(u && u.activo !== false && u.pin_hash && u.pin_hash.length === huella.length
      && crypto.timingSafeEqual(Buffer.from(u.pin_hash), Buffer.from(huella)));
    if (!correcto) {
      intentos.set(clave, { n: previo && previo.hasta > ahora ? previo.n + 1 : 1, hasta: ahora + VENTANA });
      return res.status(401).json({ error: "PIN incorrecto" });
    }
    intentos.delete(clave);

    const cuenta = await cuentaAuth(u);
    if (!cuenta) return res.status(502).json({ error: "No se pudo crear la cuenta de acceso" });
    const { session, error } = await sesionPara(cuenta.email);
    if (!session) return res.status(502).json({ error: "No se pudo abrir la sesión: " + error });

    const { pin_hash, ...usuario } = u;
    return res.status(200).json({
      session: { access_token: session.access_token, refresh_token: session.refresh_token, expires_at: session.expires_at },
      usuario,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
