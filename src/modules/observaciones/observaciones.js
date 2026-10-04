import { supabase } from "../../lib/supabase";

// Las observaciones de obra: lo que se ve en la recorrida y hay que arreglar.
//
// Una observación nace con una foto del problema y se cierra con otra de cómo
// quedó. Esa es toda la idea: "ya lo arreglé" sin foto es una promesa; con
// foto es un hecho que se puede revisar seis meses después, cuando el cliente
// pregunta por qué se le facturó ese retrabajo.
//
// No es el Libro de Obra. El libro cuenta qué pasó cada día y se cierra a la
// medianoche; una observación vive hasta que se resuelve, aunque pasen seis
// semanas. Meterlas en el libro las enterraría en el día que se anotaron.

export const ESTADOS_OBS = {
  abierta:    { label: "Abierta",    color: "danger",  pista: "Se vio y nadie la tomó todavía" },
  en_proceso: { label: "En proceso", color: "warning", pista: "Alguien la está arreglando" },
  resuelta:   { label: "Resuelta",   color: "brand",   pista: "Dicen que está: falta verificarla en obra" },
  verificada: { label: "Verificada", color: "success", pista: "Se fue a ver y quedó bien" },
  anulada:    { label: "Anulada",    color: "muted",   pista: "No correspondía" },
};

/** Lo que todavía pesa: lo verificado y lo anulado ya no molestan a nadie. */
export const ABIERTAS_OBS = ["abierta", "en_proceso", "resuelta"];

export const PRIORIDADES_OBS = {
  urgente: { label: "Urgente", color: "danger" },
  alta:    { label: "Alta",    color: "warning" },
  media:   { label: "Media",   color: "inkSoft" },
  baja:    { label: "Baja",    color: "muted" },
};

export const ORIGENES_OBS = {
  recorrida: "Recorrida de obra",
  dia_a_dia: "Día a día",
  cliente:   "La pidió el cliente",
};

const falta = e => /relation|column|does not exist|schema cache/i.test(e?.message || "");

export async function cargarObservaciones(leadId) {
  const { data, error } = await supabase.from("obra_observaciones")
    .select("*").eq("lead_id", leadId).order("fecha_visto", { ascending: false });
  if (error) return { observaciones: [], fotos: {}, sinTablas: falta(error) };

  const ids = (data || []).map(o => o.id);
  const fotos = {};
  if (ids.length) {
    const { data: fs } = await supabase.from("observacion_fotos")
      .select("*").in("observacion_id", ids).order("created_at");
    (fs || []).forEach(f => { (fotos[f.observacion_id] = fotos[f.observacion_id] || []).push(f); });
  }
  return { observaciones: data || [], fotos, sinTablas: false };
}

export async function crearObservacion(lead, datos, quien) {
  const titulo = (datos.titulo || "").trim();
  if (!titulo) return { error: "Escribí qué se observó." };

  const { data, error } = await supabase.from("obra_observaciones").insert({
    lead_id: lead.id, obra_id: datos.obra_id || null,
    titulo, detalle: datos.detalle?.trim() || null,
    ubicacion: datos.ubicacion?.trim() || null,
    prioridad: datos.prioridad || "media",
    origen: datos.origen || "recorrida",
    fecha_visto: datos.fecha_visto || new Date().toISOString().split("T")[0],
    fecha_limite: datos.fecha_limite || null,
    responsable_id: datos.responsable_id ? Number(datos.responsable_id) : null,
    responsable_nombre: datos.responsable_nombre || null,
    responsable_externo: datos.responsable_externo?.trim() || null,
    visible_cliente: !!datos.visible_cliente,
    created_by: quien?.id ?? null, created_nombre: quien?.name || null,
  }).select().single();
  if (error) return { error: falta(error) ? "Falta correr la migración 062." : error.message };
  return { observacion: data };
}

/**
 * Quiénes la arreglan. Varios, porque en obra casi nunca es uno.
 *
 * Se guarda también el primero en `responsable_id`, que es lo que leen las
 * pantallas y los correos de antes: mientras convivan, las dos cosas dicen lo
 * mismo en vez de contradecirse.
 */
export async function asignarResponsables(observacionId, gente = []) {
  await supabase.from("observacion_responsables").delete().eq("observacion_id", observacionId);
  if (gente.length) {
    const { error } = await supabase.from("observacion_responsables").insert(
      gente.map(g => ({ observacion_id: observacionId, usuario_id: Number(g.id), nombre: g.name || null })));
    if (error) return falta(error) ? "Falta correr la migración 071." : error.message;
  }
  await supabase.from("obra_observaciones").update({
    responsable_id: gente[0] ? Number(gente[0].id) : null,
    responsable_nombre: gente[0]?.name || null,
  }).eq("id", observacionId);
  return null;
}

/** Los responsables de varias observaciones de una, por id de observación. */
export async function responsablesDe(ids = []) {
  if (!ids.length) return {};
  const { data, error } = await supabase.from("observacion_responsables")
    .select("observacion_id,usuario_id,nombre").in("observacion_id", ids);
  if (error) return {};
  const mapa = {};
  (data || []).forEach(r => { (mapa[r.observacion_id] = mapa[r.observacion_id] || []).push(r); });
  return mapa;
}

/**
 * Las observaciones abiertas que tiene encima esta persona.
 *
 * Es lo que se le recuerda en su pantalla. No se convierten en tareas a
 * propósito: una observación de obra es un defecto, no un encargo. Mezclarlas
 * con las tareas llena el tablero de cosas que se cierran mirando una pared, y
 * el día que alguien tilda la tarea sin arreglar nada, la observación queda
 * cerrada en el papel y abierta en la obra.
 */
export async function misObservaciones(usuarioId) {
  if (!usuarioId) return [];
  const { data, error } = await supabase.from("observacion_responsables")
    .select("observacion_id").eq("usuario_id", usuarioId);
  if (error || !data?.length) return [];
  const { data: obs } = await supabase.from("obra_observaciones")
    .select("id,titulo,estado,prioridad,lead_id,ubicacion,fecha_limite")
    .in("id", data.map(r => r.observacion_id))
    .in("estado", ["abierta", "en_proceso"]);
  return obs || [];
}

export async function guardarObservacion(id, campos) {
  const { error } = await supabase.from("obra_observaciones")
    .update({ ...campos, updated_at: new Date().toISOString() }).eq("id", id);
  return error ? error.message : null;
}

/**
 * Cerrar una observación.
 *
 * "Resuelta" la pone quien la arregló; "verificada" solo puede ponerla alguien
 * que fue a mirar. Son dos pasos a propósito: el que arregla y el que
 * comprueba casi nunca son la misma persona, y juntarlos en un botón es cómo
 * se cierran cosas que siguen mal.
 */
export async function marcarResuelta(obs, quien, nota) {
  return guardarObservacion(obs.id, {
    estado: "resuelta", cierre_nota: nota?.trim() || obs.cierre_nota || null,
    resuelta_at: new Date().toISOString(),
    resuelta_por: quien?.id ?? null, resuelta_nombre: quien?.name || null,
  });
}

export async function verificar(obs, quien) {
  return guardarObservacion(obs.id, {
    estado: "verificada",
    verificada_at: new Date().toISOString(),
    verificada_por: quien?.id ?? null, verificada_nombre: quien?.name || null,
  });
}

/** Devolverla: se fue a ver y no quedó bien. Vuelve a estar en proceso. */
export async function reabrir(obs, quien, motivo) {
  await anotar(obs.id, `Se revisó y no quedó bien${motivo ? `: ${motivo}` : "."}`, quien);
  return guardarObservacion(obs.id, {
    estado: "en_proceso", resuelta_at: null, verificada_at: null, verificada_nombre: null,
  });
}

export async function borrarObservacion(id) {
  const { error } = await supabase.from("obra_observaciones").delete().eq("id", id);
  return error ? error.message : null;
}

// ── Las fotos: el antes y el después ──────────────────────────────────────

export async function subirFotoObs(obs, archivo, { momento = "problema", descripcion, quien }) {
  const limpio = archivo.name.replace(/[^\w.\-]/g, "_").slice(-60);
  const ruta = `obs-${obs.id}/${momento}-${Date.now()}-${limpio}`;
  const { error } = await supabase.storage.from("task-files").upload(ruta, archivo, { upsert: false });
  if (error) return { error: error.message };
  const { data, error: e2 } = await supabase.from("observacion_fotos").insert({
    observacion_id: obs.id, momento, storage_path: ruta,
    descripcion: descripcion?.trim() || null,
    autor_id: quien?.id ?? null, autor_nombre: quien?.name || null,
  }).select().single();
  return e2 ? { error: e2.message } : { foto: data };
}

export async function borrarFotoObs(foto) {
  await supabase.storage.from("task-files").remove([foto.storage_path]);
  const { error } = await supabase.from("observacion_fotos").delete().eq("id", foto.id);
  return error ? error.message : null;
}

export async function enlacesDeFotosObs(fotos = []) {
  if (!fotos.length) return {};
  const { data } = await supabase.storage.from("task-files")
    .createSignedUrls(fotos.map(f => f.storage_path), 3600);
  const mapa = {};
  (data || []).forEach((x, i) => { if (x?.signedUrl) mapa[fotos[i].id] = x.signedUrl; });
  return mapa;
}

// ── Lo que se conversa ────────────────────────────────────────────────────

export async function notasDe(observacionId) {
  const { data } = await supabase.from("observacion_notas")
    .select("*").eq("observacion_id", observacionId).order("created_at");
  return data || [];
}

export async function anotar(observacionId, texto, quien, deCliente = false) {
  const limpio = String(texto || "").trim();
  if (!limpio) return "Escribí algo.";
  const { error } = await supabase.from("observacion_notas").insert({
    observacion_id: observacionId, texto: limpio,
    autor_id: quien?.id ?? null, autor_nombre: quien?.name || null,
    de_cliente: deCliente,
  });
  return error ? error.message : null;
}

// ── Las cuentas ───────────────────────────────────────────────────────────

/** Cuántos días lleva abierta. Es el número que incomoda, y por eso se muestra. */
export function diasAbierta(obs, hoy = new Date()) {
  if (!obs?.fecha_visto) return 0;
  const desde = new Date(`${String(obs.fecha_visto).slice(0, 10)}T12:00:00`);
  const hasta = new Date(hoy);
  hasta.setHours(12, 0, 0, 0);
  return Math.max(0, Math.round((hasta - desde) / 86400000));
}

export function resumenObservaciones(observaciones = []) {
  const vivas = observaciones.filter(o => ABIERTAS_OBS.includes(o.estado));
  const hoy = new Date().toISOString().split("T")[0];
  return {
    total: observaciones.length,
    abiertas: observaciones.filter(o => o.estado === "abierta").length,
    enProceso: observaciones.filter(o => o.estado === "en_proceso").length,
    porVerificar: observaciones.filter(o => o.estado === "resuelta").length,
    verificadas: observaciones.filter(o => o.estado === "verificada").length,
    vencidas: vivas.filter(o => o.fecha_limite && o.fecha_limite < hoy).length,
    urgentes: vivas.filter(o => o.prioridad === "urgente").length,
    // La más vieja sin resolver: el número que de verdad dice cómo va la obra.
    masVieja: vivas.reduce((max, o) => Math.max(max, diasAbierta(o)), 0),
  };
}

/** Primero lo que más aprieta: vencido, urgente, y lo más viejo. */
export function ordenarObservaciones(observaciones = []) {
  const hoy = new Date().toISOString().split("T")[0];
  const peso = { urgente: 0, alta: 1, media: 2, baja: 3 };
  const vivo = o => ABIERTAS_OBS.includes(o.estado);
  return [...observaciones].sort((a, b) =>
    (vivo(b) ? 1 : 0) - (vivo(a) ? 1 : 0) ||
    ((b.fecha_limite && b.fecha_limite < hoy && vivo(b)) ? 1 : 0) - ((a.fecha_limite && a.fecha_limite < hoy && vivo(a)) ? 1 : 0) ||
    (peso[a.prioridad] ?? 2) - (peso[b.prioridad] ?? 2) ||
    String(a.fecha_visto).localeCompare(String(b.fecha_visto)));
}
