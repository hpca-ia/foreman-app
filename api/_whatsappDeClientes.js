// api/_whatsappDeClientes.js — Lo que pasa DESPUÉS de escribirle a un cliente
// por WhatsApp: si le llegó, y qué se hace cuando contesta.
//
// Hernán, 18/11/2026: «es importante ya integrar WhatsApp». Las aprobaciones
// del cliente son, en sus palabras, «un sustento y justificación»: que FOREMAN
// diga «enviado» de un mensaje que nunca llegó es peor que no decir nada.
//
// 1. SI LLEGÓ. Meta acepta el mensaje y avisa después qué pasó: enviado,
//    entregado, leído, o que no pudo llegar. Un número sin WhatsApp no da
//    error al mandar: lo da en ese aviso. Se guarda en el mensaje, y si no
//    llegó se le avisa por correo a quien lo mandó y queda en el historial del
//    punto.
//
// 2. SI CONTESTA. El número de FOREMAN lo atiende NOVA, que habla solo con el
//    equipo. A un cliente que contesta el aviso no se le puede decir «no
//    reconozco tu número»: se le contesta que recibimos su mensaje, se le
//    recuerda su enlace —contestar por WhatsApp NO es aprobar: la aprobación
//    queda cuando toca «Lo apruebo» ahí—, y lo que escribió se le pasa por
//    correo a quien le pidió la aprobación y queda en el historial del punto.

import { rest } from "./_supabase.js";
import { enviar, clave, errorDeEntrega, esNuevo, anotarSalida, nombreDePila } from "./_whatsapp.js";
import { enviarCorreo, plantilla } from "./_correo.js";

const APP = process.env.APP_URL || "https://foreman-app-ebon.vercel.app";
const filas = async r => { try { const d = await r.json(); return Array.isArray(d) ? d : []; } catch { return []; } };
const esc = t => String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Cómo le dice Meta a cada cosa, y cómo se guarda.
export const ESTADO_DE_META = { sent: "enviado", delivered: "entregado", read: "leido", failed: "fallo" };
// Desde qué estados se pasa a cada uno. Los avisos de Meta no llegan en orden:
// un «entregado» atrasado no puede pisar un «leído», ni un «fallo» tardío
// borrar que al final se entregó.
export const VIENE_DE = { entregado: ["enviado", "fallo"], leido: ["enviado", "entregado", "fallo"], fallo: ["enviado"] };

/** Lo que se le cambia al mensaje con un aviso de entrega de Meta, o null si ese aviso no cambia nada. */
export function cambioPorEntrega(st) {
  const estado = ESTADO_DE_META[st?.status];
  const desde = VIENE_DE[estado];
  if (!desde || !st?.id) return null;
  const segundos = Number(st.timestamp);
  return {
    wa_id: String(st.id), desde, estado,
    estado_at: segundos ? new Date(segundos * 1000).toISOString() : new Date().toISOString(),
    error: estado === "fallo" ? errorDeEntrega(st.errors) : null,
  };
}

async function loDelAviso(m) {
  const [leads, tareas, usuarios] = await Promise.all([
    filas(await rest(`leads?id=eq.${Number(m.lead_id)}&select=id,nombre,portal_token,portal_activo,responsable_id`)),
    m.task_id ? filas(await rest(`tasks?id=eq.${Number(m.task_id)}&select=id,title`)) : [],
    filas(await rest("usuarios?activo=eq.true&select=id,nombre,email")),
  ]);
  const lead = leads[0] || null;
  // A quién le interesa: quien mandó el aviso y quien lleva el proyecto.
  const ids = new Set([m.usuario_id, lead?.responsable_id].map(Number).filter(Boolean));
  const equipo = usuarios.filter(u => ids.has(Number(u.id)));
  return {
    lead, titulo: tareas[0]?.title || "", quienPidio: usuarios.find(u => Number(u.id) === Number(m.usuario_id)) || null,
    correos: [...new Set(equipo.map(u => String(u.email || "").trim()).filter(Boolean))],
  };
}

/**
 * Meta avisa qué pasó con un mensaje que salió. Sin la migración 189 no hay
 * dónde guardarlo: no encuentra nada y no hace nada.
 */
export async function anotarEntrega(st) {
  const c = cambioPorEntrega(st);
  if (!c) return { cambio: false };
  const r = await rest(`whatsapp_mensajes?wa_id=eq.${encodeURIComponent(c.wa_id)}&estado=in.(${c.desde.join(",")})`, {
    method: "PATCH", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ estado: c.estado, estado_at: c.estado_at, error: c.error }),
  });
  const m = (await filas(r))[0];
  if (!m) return { cambio: false };
  // No llegó, y era un aviso a un cliente: que se entere quien lo mandó.
  if (c.estado === "fallo" && m.lead_id) {
    try { await avisarQueNoLlego(m, c.error); } catch (e) { console.error("[whatsapp] no llegó, y no se pudo avisar:", e.message); }
  }
  return { cambio: true, estado: c.estado };
}

async function avisarQueNoLlego(m, error) {
  const { lead, titulo, correos } = await loDelAviso(m);
  if (!lead) return;
  const aQuien = m.para_nombre || m.telefono;
  await rest("lead_movimientos", {
    method: "POST",
    body: JSON.stringify({
      lead_id: lead.id, task_id: m.task_id ?? null, tipo: "nota", automatico: true,
      detalle: `El WhatsApp a ${aQuien} por "${titulo}" no llegó: ${error}`,
    }),
  });
  if (!correos.length) return;
  await enviarCorreo({
    to: correos, subject: `${lead.nombre} · el WhatsApp a ${aQuien} no llegó`,
    html: plantilla({
      titulo: lead.nombre, subtitulo: "Aviso que no llegó",
      cuerpo: `
        <p style="font-size:14px;color:#B91C1C;font-weight:700;margin:0 0 6px">El WhatsApp no le llegó a ${esc(aQuien)}</p>
        ${titulo ? `<p style="font-size:14px;color:#111827;margin:0 0 8px">Era el pedido de aprobación de <strong>${esc(titulo)}</strong>.</p>` : ""}
        <p style="font-size:13.5px;color:#374151;line-height:1.5;margin:0 0 8px">${esc(error)}</p>
        <p style="font-size:12.5px;color:#6B7280;line-height:1.5;margin:0">Revisá su número en la pestaña «Gente» del proyecto y avisale de nuevo desde «Aprobaciones», o escribile vos.</p>
        <p style="margin:16px 0 0"><a href="${esc(APP)}" style="display:inline-block;background:#0F3D3E;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:7px">Abrir FOREMAN</a></p>`,
    }),
  });
}

/**
 * ¿Este número es de un cliente al que FOREMAN le escribió por un pedido?
 * @returns el último aviso que se le mandó, o null. Sin la migración 189, null.
 */
export async function avisoAlCliente(de) {
  const k = clave(de);
  if (!k) return null;
  const r = await rest(`whatsapp_mensajes?telefono=like.*${k}&direccion=eq.sale&lead_id=not.is.null`
    + "&select=id,telefono,lead_id,task_id,aprobacion_id,para_nombre,usuario_id,usuario_nombre,created_at&order=created_at.desc&limit=1");
  return (await filas(r))[0] || null;
}

// Qué mandó, cuando no es texto: se lo dice a quien lo lee en el correo.
const NO_ES_TEXTO = { audio: "una nota de voz", image: "una foto", video: "un video", document: "un archivo", sticker: "un sticker", location: "una ubicación", contacts: "un contacto" };

/** Lo que se le contesta al cliente: que llegó, a quién se le pasa y dónde se aprueba. */
export function respuestaAlCliente({ nombre = "", quien = "", enlace = "" } = {}) {
  const pila = nombreDePila(nombre);
  return `Hola${pila ? ` ${pila}` : ""}, recibimos tu mensaje${quien ? ` y se lo pasamos a ${quien}` : " y se lo pasamos al equipo"}. `
    + "Este número de HCA Studio manda avisos automáticos."
    + (enlace ? `\n\nPara aprobar o dejar una observación, entrá a tu enlace (contestar por acá no cuenta como aprobación):\n${enlace}` : "");
}

/**
 * Un cliente contestó el aviso. Se anota, se le contesta —una vez cada doce
 * horas: si manda cinco mensajes seguidos no recibe cinco veces lo mismo— y lo
 * que escribió se le pasa al equipo. @returns { repetido } si Meta reintentó.
 */
export async function atenderAlCliente({ de, texto = "", tipo = "text", mensajeId, aviso }) {
  const dijo = String(texto || "").trim() || `(mandó ${NO_ES_TEXTO[tipo] || "algo que no es texto"}: desde acá no se puede abrir)`;
  const nuevo = await esNuevo({ wa_id: mensajeId, telefono: de, usuario_nombre: aviso.para_nombre || null, texto: dijo, lead_id: aviso.lead_id, task_id: aviso.task_id ?? null });
  if (!nuevo) return { repetido: true };

  const { lead, titulo, quienPidio, correos } = await loDelAviso(aviso);
  if (!lead) return { ok: false };
  const nombre = aviso.para_nombre || "El cliente";

  // Contestarle, si no se le contestó hace poco.
  const hace12 = new Date(Date.now() - 12 * 3600000).toISOString();
  const recientes = await filas(await rest(`whatsapp_mensajes?telefono=like.*${clave(de)}&direccion=eq.sale&plantilla=is.null&created_at=gte.${hace12}&select=id&limit=1`));
  if (!recientes.length) {
    const respuesta = respuestaAlCliente({
      nombre: aviso.para_nombre, quien: quienPidio?.nombre || "",
      enlace: lead.portal_activo && lead.portal_token ? `${APP}/?cliente=${lead.portal_token}` : "",
    });
    await enviar(de, respuesta);
    await anotarSalida({ telefono: de, usuario_nombre: "FOREMAN", texto: respuesta });
  }

  // Lo que escribió, al historial del punto y al correo de quien se lo pidió.
  await rest("lead_movimientos", {
    method: "POST",
    body: JSON.stringify({
      lead_id: lead.id, task_id: aviso.task_id ?? null, tipo: "nota", automatico: true,
      detalle: `${nombre} contestó por WhatsApp sobre "${titulo}": ${dijo.slice(0, 600)}`,
    }),
  });
  if (correos.length) {
    await enviarCorreo({
      to: correos, subject: `${lead.nombre} · ${nombre} contestó por WhatsApp`,
      html: plantilla({
        titulo: lead.nombre, subtitulo: "El cliente contestó por WhatsApp",
        cuerpo: `
          <p style="font-size:14px;color:#111827;margin:0 0 6px"><strong>${esc(nombre)}</strong> contestó el aviso${titulo ? ` de <strong>${esc(titulo)}</strong>` : ""}:</p>
          <p style="font-size:14px;color:#374151;line-height:1.5;margin:0 0 10px;padding:9px 12px;background:#F9FAFB;border-radius:6px;white-space:pre-line">${esc(dijo)}</p>
          <p style="font-size:12.5px;color:#B45309;line-height:1.5;margin:0 0 6px">Esto no es una aprobación: queda aprobado cuando toca «Lo apruebo» en su enlace. Si lo que dice es que aprueba, pedile que lo haga ahí.</p>
          <p style="font-size:12.5px;color:#6B7280;line-height:1.5;margin:0">FOREMAN le contestó que recibió su mensaje y le recordó su enlace. Para seguir la conversación, escribile desde tu WhatsApp.</p>`,
      }),
    });
  }
  return { ok: true };
}
