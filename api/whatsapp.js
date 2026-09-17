// api/whatsapp.js — el número de WhatsApp de FOREMAN.
//
// Meta manda acá cada mensaje que le escriben a NOVA. Dos cosas antes de
// pensar en contestar: que el aviso venga firmado por Meta, y que el número
// sea de alguien del equipo. A un desconocido no se le cuenta nada de la
// oficina, ni siquiera qué proyectos existen.
//
// Y siempre se le responde 200 a Meta, aunque adentro algo falle: si no,
// reintenta el mismo mensaje una y otra vez, y NOVA terminaría creando la
// misma tarea cuatro veces.

import { configurado, firmaValida, identificar, enviar, marcarLeido, esNuevo, anotarSalida, historial } from "./_whatsapp.js";
import { permisosDe } from "./_permisos.js";
import { responder } from "./_agente.js";
import { rest, configurado as baseConfigurada } from "./_supabase.js";

export const config = { api: { bodyParser: false } };   // la firma se calcula sobre el cuerpo crudo

const leerCrudo = req => new Promise((ok, mal) => {
  let d = ""; req.on("data", c => { d += c; }); req.on("end", () => ok(d)); req.on("error", mal);
});

async function filas(r) {
  try { const d = await r.json(); return Array.isArray(d) ? d : d ? [d] : []; } catch { return []; }
}

export default async function handler(req, res) {
  // El saludo de Meta al conectar el webhook: devuelve el desafío tal cual.
  if (req.method === "GET") {
    const q = req.query || {};
    const token = process.env.WHATSAPP_VERIFY_TOKEN || "";
    if (token && q["hub.mode"] === "subscribe" && q["hub.verify_token"] === token) {
      return res.status(200).send(q["hub.challenge"]);
    }
    return res.status(403).send("no");
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const crudo = await leerCrudo(req);
  if (!firmaValida(crudo, req.headers["x-hub-signature-256"])) return res.status(403).json({ error: "firma" });

  let aviso = {};
  try { aviso = JSON.parse(crudo || "{}"); } catch { return res.status(200).json({ ok: true }); }

  const valor = aviso?.entry?.[0]?.changes?.[0]?.value || {};
  const mensaje = valor.messages?.[0];
  if (!mensaje) return res.status(200).json({ ok: true });       // avisos de entrega y demás

  const de = mensaje.from;
  const texto = mensaje.type === "text" ? (mensaje.text?.body || "").trim() : "";

  try {
    await marcarLeido(mensaje.id);

    if (!baseConfigurada() || !configurado()) {
      await enviar(de, "FOREMAN todavía no está conectado de este lado. Avísale a Hernán.");
      return res.status(200).json({ ok: true });
    }

    const usuario = await identificar(de);
    if (!usuario) {
      await enviar(de, "Este número es de FOREMAN, el sistema interno de HCA Studio. No reconozco tu número: si eres del equipo, pide que lo registren en tu usuario.");
      return res.status(200).json({ ok: true });
    }

    if (!texto) {
      await enviar(de, `Por ahora solo leo texto, ${usuario.nombre.split(" ")[0]}. Las notas de voz y las fotos todavía no.`);
      await anotarSalida({ telefono: de, usuario_id: usuario.id, usuario_nombre: usuario.nombre, texto: "(no era texto)" });
      return res.status(200).json({ ok: true });
    }

    const previos = await historial(de);
    const primeraVez = await esNuevo({ wa_id: mensaje.id, telefono: de, usuario_id: usuario.id, usuario_nombre: usuario.nombre, texto });
    if (!primeraVez) return res.status(200).json({ ok: true, repetido: true });

    const [puede, equipo, proyectos] = await Promise.all([
      permisosDe(usuario),
      filas(await rest("usuarios?select=id,nombre,rol,email&activo=eq.true&order=nombre")),
      filas(await rest("proyectos?select=id,nombre&activo=eq.true&order=nombre")),
    ]);

    const { texto: respuesta } = await responder({ texto, historial: previos, ctx: { usuario, puede, equipo, proyectos } });
    await enviar(de, respuesta);
    await anotarSalida({ telefono: de, usuario_id: usuario.id, usuario_nombre: usuario.nombre, texto: respuesta });
    return res.status(200).json({ ok: true });
  } catch (e) {
    // Que el problema se vea en la conversación: si NOVA se queda muda, uno no
    // sabe si no entendió, si no llegó o si se cayó.
    await enviar(de, `Se me trabó algo acá adentro: ${String(e.message || e).slice(0, 200)}`).catch(() => {});
    return res.status(200).json({ ok: false });
  }
}
