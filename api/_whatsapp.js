// Hablar por WhatsApp: comprobar que el aviso venga de Meta, reconocer de
// quién es el número, contestar y dejar registro.
//
// En WhatsApp nadie pone PIN: el número es la credencial. Por eso solo se le
// contesta a los teléfonos que están en la lista del equipo, y lo que se diga
// queda guardado con el nombre de quien escribió. A un número desconocido no
// se le cuenta nada: ni que la app existe.

import crypto from "crypto";
import { rest } from "./_supabase.js";

const GRAPH = "https://graph.facebook.com/v22.0";

export const configurado = () => !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);

/**
 * Meta firma cada aviso con el secreto de la app. Sin secreto configurado no
 * se acepta nada: la dirección del webhook es pública, y sin firma cualquiera
 * podría escribirle a NOVA haciéndose pasar por el teléfono del Director.
 */
export function firmaValida(crudo, firma) {
  const secreto = process.env.WHATSAPP_APP_SECRET || "";
  if (!secreto) return false;
  const esperado = "sha256=" + crypto.createHmac("sha256", secreto).update(crudo).digest("hex");
  const a = Buffer.from(esperado);
  const b = Buffer.from(String(firma || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Los últimos nueve dígitos: el mismo celular se escribe 0991234567, +593 99 123 4567 o 593991234567. */
export function clave(tel) {
  const d = String(tel || "").replace(/\D/g, "");
  return d.length >= 9 ? d.slice(-9) : "";
}

async function filas(r) {
  try { const d = await r.json(); return Array.isArray(d) ? d : d ? [d] : []; } catch { return []; }
}

/**
 * El número como lo quiere Meta: con el código de país y sin nada más. Un
 * celular de acá escrito 0991234567 o 991234567 sale 593991234567; uno que ya
 * trae su código queda como está. Vacío si no alcanza para ser un celular.
 */
export function numeroCompleto(tel) {
  let d = String(tel || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 10 && d.startsWith("09")) return `593${d.slice(1)}`;
  if (d.length === 9 && d.startsWith("9")) return `593${d}`;
  return d.length >= 10 && d.length <= 15 ? d : "";
}

/** Quién es el dueño de este número, o null si no está en el equipo. */
export async function identificar(telefono) {
  const k = clave(telefono);
  if (!k) return null;
  const gente = await filas(await rest("usuarios?select=id,nombre,rol,telefono,activo,email&activo=eq.true"));
  return gente.find(u => clave(u.telefono) && clave(u.telefono) === k) || null;
}

/** El texto que NOVA le manda de vuelta a la persona. */
export async function enviar(a, texto) {
  if (!configurado()) return { error: "WhatsApp no está configurado" };
  const r = await fetch(`${GRAPH}/${process.env.WHATSAPP_PHONE_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: String(a).replace(/\D/g, ""),
      type: "text",
      text: { preview_url: false, body: String(texto || "").slice(0, 4000) },
    }),
  });
  if (!r.ok) return { error: `Meta respondió ${r.status}: ${(await r.text()).slice(0, 300)}` };
  return r.json();
}

// ── ESCRIBIRLE PRIMERO A UN CLIENTE: LA PLANTILLA ─────────────────────────
//
// Hernán, 18/11/2026: «es importante ya integrar WhatsApp». Pedirle una
// aprobación al cliente ya le manda un correo; por WhatsApp se abría el de
// quien lo pedía, con el mensaje escrito, para que tocara enviar.
//
// Meta solo deja mandar texto libre a quien le escribió a este número en las
// últimas 24 horas. Para ESCRIBIRLE PRIMERO a alguien —que es el caso: el
// cliente no le escribió nunca a FOREMAN— hace falta una PLANTILLA: un mensaje
// con huecos, que Meta revisa y aprueba una vez, y del que después solo se
// cambia lo que va en cada hueco.
//
// Esta es la plantilla, tal cual hay que cargarla en Meta (WhatsApp Manager →
// Plantillas de mensajes). El nombre y el idioma se pueden cambiar con
// WHATSAPP_PLANTILLA_PEDIDO y WHATSAPP_PLANTILLA_IDIOMA si en Meta quedó con
// otros; los huecos, no: lo que se manda tiene que calzar con lo aprobado, o
// Meta lo rechaza.
export const PLANTILLA_DEL_PEDIDO = {
  nombre: "pedido_de_aprobacion",
  idioma: "es",
  categoria: "Utilidad",
  cuerpo: "Hola {{1}}, en el proyecto {{2}} necesitamos tu aprobación de: {{3}}.\n\nPlazo: {{4}}.\n\n"
    + "Se revisa y se aprueba desde el botón de abajo, sin usuario ni contraseña. La respuesta queda registrada con la fecha.",
  pie: "HCA Studio · aviso automático",
  boton: { texto: "Ver y aprobar", url: "https://foreman-app-ebon.vercel.app/?cliente={{1}}" },
  // Lo que Meta pide de muestra al cargarla, para revisarla.
  ejemplos: { cuerpo: ["María", "Casa Los Arrayanes", "Plano de cocina", "hasta el martes 25 de noviembre"], boton: "ejemplo123" },
};

export const plantillaDelPedido = () => ({
  nombre: process.env.WHATSAPP_PLANTILLA_PEDIDO || PLANTILLA_DEL_PEDIDO.nombre,
  idioma: process.env.WHATSAPP_PLANTILLA_IDIOMA || PLANTILLA_DEL_PEDIDO.idioma,
});

/** Qué falta cargar en Vercel para que WhatsApp ande. Los nombres, nunca los valores. */
export function queFalta(env = process.env) {
  return ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_ID", "WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN"].filter(k => !env[k]);
}

/**
 * Lo que va en un hueco. Meta rechaza el mensaje entero si un hueco trae un
 * salto de línea, un tabulador o más de cuatro espacios seguidos, y un hueco
 * no puede ir vacío.
 */
export function paraHueco(texto, tope = 200) {
  const t = String(texto ?? "").replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim();
  return (t.length > tope ? `${t.slice(0, tope - 1).trimEnd()}…` : t) || "-";
}

/** El nombre de pila, para el saludo: «MARIA JOSE PEREZ» → «Maria». */
export function nombreDePila(nombre) {
  const p = String(nombre || "").trim().split(/\s+/)[0] || "";
  return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : "";
}

/**
 * Lo que va en cada hueco de la plantilla del pedido.
 * @returns { cuerpo: [saludo, proyecto, punto, plazo], boton: la llave del enlace }
 */
export function huecosDelPedido({ nombre = "", proyecto = "", punto = "", plazo = "", llave = "" } = {}) {
  return {
    cuerpo: [paraHueco(nombreDePila(nombre) || "qué tal", 60), paraHueco(proyecto, 80), paraHueco(punto, 160), paraHueco(plazo || "sin fecha límite", 80)],
    boton: String(llave || ""),
  };
}

/** El mensaje como lo lee el cliente, para dejarlo guardado: la plantilla con sus huecos llenos. */
export function textoDeLaPlantilla(huecos) {
  return PLANTILLA_DEL_PEDIDO.cuerpo.replace(/\{\{(\d)\}\}/g, (_, n) => huecos?.cuerpo?.[Number(n) - 1] ?? "");
}

/** Lo que se le manda a Meta para que salga una plantilla con sus huecos. */
export function cuerpoDePlantilla({ a, nombre, idioma, huecos }) {
  return {
    messaging_product: "whatsapp",
    to: String(a).replace(/\D/g, ""),
    type: "template",
    template: {
      name: nombre,
      language: { code: idioma },
      components: [
        { type: "body", parameters: (huecos?.cuerpo || []).map(text => ({ type: "text", text })) },
        // El botón «Ver y aprobar»: la dirección está fija en la plantilla y
        // acá va solo lo que le sigue, que es la llave de su enlace.
        ...(huecos?.boton ? [{ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: huecos.boton }] }] : []),
      ],
    },
  };
}

// Lo que Meta contesta cuando no sale, dicho de manera que se sepa qué hacer.
const ERRORES_DE_META = {
  190: "El token de WhatsApp venció o no sirve: hay que generar uno nuevo en Meta y cambiarlo en Vercel (WHATSAPP_TOKEN).",
  131026: "Ese número no puede recibir el mensaje: no tiene WhatsApp, o lo tiene muy desactualizado.",
  131030: "El número de FOREMAN todavía es de prueba: Meta solo deja escribirle a los teléfonos cargados en su lista de prueba.",
  131042: "Meta no lo mandó por un problema de pago en la cuenta de WhatsApp Business: revisá el medio de pago.",
  131047: "Pasaron más de 24 horas desde que esa persona escribió: solo se le puede mandar una plantilla.",
  131049: "Meta decidió no entregarlo —limita cuántos avisos recibe una persona de empresas—. Se puede probar de nuevo más tarde.",
  131056: "Demasiados mensajes seguidos al mismo número. Probá en unos minutos.",
  132000: "La plantilla aprobada en Meta no tiene los mismos huecos que manda FOREMAN: hay que cargarla igual a la de Ajustes.",
  132001: "Meta no encuentra la plantilla: todavía no está cargada o aprobada con ese nombre y en ese idioma.",
  132015: "Meta pausó la plantilla por mala calidad. Hay que revisarla en WhatsApp Manager.",
  132016: "Meta desactivó la plantilla. Hay que crear una nueva en WhatsApp Manager.",
};

/** @returns { codigo, error }: por qué Meta no lo mandó, en criollo y con lo que dijo. */
export function errorDeMeta(status, cuerpo) {
  let e = null;
  try { e = (typeof cuerpo === "string" ? JSON.parse(cuerpo) : cuerpo)?.error || null; } catch { e = null; }
  const codigo = Number(e?.code) || null;
  const dijo = String(e?.error_data?.details || e?.message || (typeof cuerpo === "string" ? cuerpo : "") || "").slice(0, 240);
  const sabido = ERRORES_DE_META[codigo];
  return { codigo, error: sabido ? `${sabido}${dijo ? ` (Meta: ${dijo})` : ""}` : `Meta respondió ${status}${dijo ? `: ${dijo}` : ""}` };
}

/** Por qué no llegó un mensaje que Meta ya había aceptado: viene en el aviso de entrega. */
export function errorDeEntrega(errores) {
  const e = Array.isArray(errores) ? errores[0] : null;
  if (!e) return "Meta no dijo por qué.";
  const dijo = String(e.error_data?.details || e.message || e.title || "").slice(0, 240);
  return ERRORES_DE_META[Number(e.code)] || dijo || `Error ${e.code}`;
}

/**
 * Manda una plantilla. @returns { id } —el id que le pone Meta, con el que
 * después avisa si llegó— o { error, codigo }.
 */
export async function enviarPlantilla(a, { nombre, idioma, huecos }) {
  if (!configurado()) return { error: "WhatsApp no está configurado" };
  try {
    const r = await fetch(`${GRAPH}/${process.env.WHATSAPP_PHONE_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(cuerpoDePlantilla({ a, nombre, idioma, huecos })),
    });
    if (!r.ok) return errorDeMeta(r.status, await r.text());
    const d = await r.json();
    const id = d?.messages?.[0]?.id || null;
    return id ? { id } : { error: "Meta aceptó el pedido pero no devolvió el mensaje." };
  } catch (e) {
    return { error: `No se pudo hablar con Meta: ${e.message}` };
  }
}

/**
 * Deja anotado un mensaje que salió por plantilla, con a quién y por qué
 * pedido: con el `wa_id`, cuando Meta avise si llegó, se sabe de qué pedido
 * era. Sin la migración 189 se anota igual, sin esos datos.
 */
export async function anotarPlantilla(fila) {
  const basica = { wa_id: fila.wa_id, telefono: fila.telefono, usuario_id: fila.usuario_id ?? null, usuario_nombre: fila.usuario_nombre ?? null, texto: fila.texto, direccion: "sale" };
  try {
    const r = await rest("whatsapp_mensajes", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ ...fila, direccion: "sale" }) });
    if (r.ok) return { ok: true, conEstado: true };
    const r2 = await rest("whatsapp_mensajes", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(basica) });
    return { ok: r2.ok, conEstado: false };
  } catch { return { ok: false, conEstado: false }; }
}

/** El doble visto azul: que se note que NOVA está leyendo, no que se colgó. */
export async function marcarLeido(id) {
  if (!configurado() || !id) return;
  await fetch(`${GRAPH}/${process.env.WHATSAPP_PHONE_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: id }),
  }).catch(() => {});
}

/**
 * Guarda el mensaje que entra y avisa si es nuevo. Meta reintenta el aviso
 * cuando la respuesta demora más de la cuenta, y NOVA no puede crear la misma
 * tarea dos veces por eso: el id único de la tabla es el que decide.
 */
export async function esNuevo(fila) {
  const r = await rest("whatsapp_mensajes", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ ...fila, direccion: "entra" }),
  });
  if (r.status === 409) return false;            // ya se había procesado
  return true;                                   // incluida la tabla sin crear: mejor contestar
}

export async function anotarSalida(fila) {
  await rest("whatsapp_mensajes", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ ...fila, direccion: "sale" }),
  }).catch(() => {});
}

/**
 * De qué se venía hablando. Solo lo de las últimas seis horas: si alguien
 * retoma al otro día, NOVA arranca limpia en vez de contestar sobre una
 * conversación que la persona ya olvidó.
 */
export async function historial(telefono, limite = 12) {
  const desde = new Date(Date.now() - 6 * 3600000).toISOString();
  const r = await rest(`whatsapp_mensajes?telefono=eq.${encodeURIComponent(telefono)}&created_at=gte.${desde}&select=direccion,texto,created_at&order=created_at.desc&limit=${limite}`);
  const previos = (await filas(r)).reverse().filter(m => m.texto);
  return previos.map(m => ({ role: m.direccion === "sale" ? "assistant" : "user", content: m.texto }));
}
