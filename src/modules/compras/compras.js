import { supabase } from "../../lib/supabase";

// El flujo de una compra, de punta a punta.
//
// Cinco estados y una regla: cada paso deja escrito quién lo dio y cuándo, y le
// deja una tarea al que sigue. La tarea es el aviso —aparece en su tablero, le
// llega el correo y entra al resumen de la mañana—; la solicitud es el registro.
//
//   borrador → pendiente_aprobacion → (requiere_info ↺) → aprobada → comprada → recibida
//
// Quien pide no compra y quien compra no aprueba: son tres personas distintas y
// el sistema lo sostiene, que es lo que hace que sirva de respaldo después.

export const ESTADOS = {
  borrador:             { label: "Borrador",        color: "#9CA3AF", quien: "quien la pidió" },
  pendiente_aprobacion: { label: "Esperando visto", color: "#B45309", quien: "el gerente" },
  requiere_info:        { label: "Devuelta",        color: "#B91C1C", quien: "quien la pidió" },
  aprobada:             { label: "Aprobada",        color: "#15803D", quien: "compras" },
  comprada:             { label: "Comprada",        color: "#0F3D3E", quien: "quien la pidió" },
  recibida:             { label: "Recibida",        color: "#6B7280", quien: null },
  anulada:              { label: "Anulada",         color: "#9CA3AF", quien: null },
};

export const ABIERTAS = ["pendiente_aprobacion", "requiere_info", "aprobada", "comprada"];

const falta = e => /relation|column|does not exist|schema cache/i.test(e?.message || "");

/** @returns { solicitudes, sinTablas } */
export async function cargarSolicitudes(leadId = null) {
  let q = supabase.from("compras_solicitudes").select("*").order("created_at", { ascending: false });
  if (leadId) q = q.eq("lead_id", leadId);
  const { data, error } = await q;
  if (error) return { solicitudes: [], sinTablas: falta(error) };
  return { solicitudes: data || [], sinTablas: false };
}

export async function historialDe(solicitudId) {
  const { data } = await supabase.from("compras_historial")
    .select("*").eq("solicitud_id", solicitudId).order("created_at");
  return data || [];
}

export async function adjuntosDe(solicitudId) {
  const { data } = await supabase.from("compras_adjuntos")
    .select("*").eq("solicitud_id", solicitudId).order("created_at");
  return data || [];
}

export async function crearSolicitud(datos, quien) {
  const { data, error } = await supabase.from("compras_solicitudes").insert({
    lead_id: datos.lead_id, obra_id: datos.obra_id || null,
    descripcion: datos.descripcion.trim(), justificacion: datos.justificacion?.trim() || null,
    necesita_para: datos.necesita_para || null, urgente: !!datos.urgente,
    estado: "borrador", solicitante_id: quien?.id ?? null, solicitante_nombre: quien?.name || null,
  }).select().single();
  if (error) return { error: falta(error) ? "Falta correr la migración 048." : error.message };
  await anotar(data.id, null, "borrador", quien, null);
  return { solicitud: data };
}

export async function guardarSolicitud(id, datos) {
  const { error } = await supabase.from("compras_solicitudes").update({
    descripcion: datos.descripcion.trim(), justificacion: datos.justificacion?.trim() || null,
    necesita_para: datos.necesita_para || null, urgente: !!datos.urgente,
  }).eq("id", id);
  return error ? error.message : null;
}

/** Cada paso queda escrito: sin esto el flujo es una conversación de WhatsApp. */
export async function anotar(solicitudId, antes, despues, quien, comentario) {
  const { error } = await supabase.from("compras_historial").insert({
    solicitud_id: solicitudId, estado_anterior: antes, estado_nuevo: despues,
    usuario_id: quien?.id ?? null, usuario_nombre: quien?.name || null,
    comentario: comentario || null,
  });
  return error ? error.message : null;
}

/**
 * Mover la solicitud al siguiente paso y avisarle al que sigue.
 *
 * El aviso es una tarea de FOREMAN: así aparece en el tablero de esa persona,
 * le llega el correo y entra a su resumen de la mañana, sin inventar un segundo
 * sistema de alertas que después nadie mira.
 */
export async function moverA(solicitud, estado, { quien, comentario, paraQuien, titulo, extra = {} }) {
  const campos = { estado, ...extra };
  if (estado === "aprobada") { campos.aprobador_id = quien?.id ?? null; campos.aprobador_nombre = quien?.name || null; campos.aprobado_at = new Date().toISOString(); }
  if (estado === "comprada") { campos.comprado_por = quien?.id ?? null; campos.comprado_nombre = quien?.name || null; campos.comprado_at = new Date().toISOString(); }
  if (estado === "recibida") { campos.recibido_por = quien?.id ?? null; campos.recibido_nombre = quien?.name || null; campos.recibido_at = new Date().toISOString(); }

  // La tarea anterior ya se cumplió: se cierra para que no quede dando vueltas
  // en el tablero de alguien que ya hizo lo suyo.
  if (solicitud.tarea_id) {
    await supabase.from("tasks").update({ status: "listo" }).eq("id", solicitud.tarea_id);
  }

  let tarea = null;
  if (paraQuien) {
    const { data } = await supabase.from("tasks").insert({
      title: titulo, lead_id: solicitud.lead_id, assignee_id: paraQuien,
      due_date: solicitud.necesita_para || null,
      priority: solicitud.urgente ? "urgente" : "media",
      status: "en-progreso", type: "Gestión",
      notes: `Gestión de compras · ${solicitud.descripcion}`,
      created_by: quien?.id ?? null,
      ...(estado === "pendiente_aprobacion" ? { es_aprobacion: true, aprobacion_estado: "pendiente" } : {}),
    }).select().single();
    tarea = data;
  }
  campos.tarea_id = tarea?.id ?? null;

  const { error } = await supabase.from("compras_solicitudes").update(campos).eq("id", solicitud.id);
  if (error) return { error: error.message };
  await anotar(solicitud.id, solicitud.estado, estado, quien, comentario);

  // Y la bitácora del proyecto se entera, que es donde se lee la historia.
  await supabase.from("lead_movimientos").insert({
    lead_id: solicitud.lead_id, tipo: "compra", automatico: true,
    detalle: `${ESTADOS[estado]?.label || estado}: ${solicitud.descripcion}${comentario ? ` — ${comentario}` : ""}`,
    autor_id: quien?.id ?? null, autor_nombre: quien?.name || null,
  }).select();

  // El correo lo manda el servidor, igual que cualquier tarea encargada.
  if (tarea?.id) {
    fetch("/api/aviso?de=tarea", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tareaId: tarea.id }),
    }).catch(() => {});
  }
  return { ok: true };
}
