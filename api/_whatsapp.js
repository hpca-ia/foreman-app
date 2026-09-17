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
