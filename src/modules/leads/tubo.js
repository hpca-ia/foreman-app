import { supabase } from "../../lib/supabase";

// El tubo de un proyecto: por qué hitos pasa y qué le falta a cada uno.
//
// Arquitectura y Construcción van en orden —son hitos, uno detrás de otro— y
// por eso un proyecto de esos tubos arranca con todas sus etapas puestas, en
// su orden, esperando turno. Un lead va sin orden: sus etapas se agregan
// cuando pasan, porque en un lead primero puede salir el plan masa y después
// el presupuesto.
//
// Lo vertical —el checklist de cada hito— sale de una plantilla y después es
// de ese proyecto: se le agrega y se le quita sin tocar la plantilla. Un ítem
// se puede volver tarea, y cuando la tarea se completa el ítem queda marcado.

export const TUNELES = {
  arquitectura: { label: "Arquitectura", enOrden: true, color: "#4A7C8C" },
  construccion: { label: "Construcción", enOrden: true, color: "#1F7A4D" },
  lead: { label: "Lead", enOrden: false, color: "#8B92A5" },
};

const falta = e => /relation|column|does not exist|schema cache/i.test(e?.message || "");

/** El catálogo de etapas de un tubo, en orden. */
export const etapasDelTunel = (catalogo = [], tunel) =>
  catalogo.filter(e => (e.tunel || "lead") === tunel && e.activa !== false).sort((a, b) => a.orden - b.orden);

/** @returns { etapas, items, sinTablas } */
export async function cargarTubo(leadId) {
  const [{ data: etapas, error }, { data: items, error: e2 }] = await Promise.all([
    supabase.from("lead_etapas").select("*").eq("lead_id", leadId).order("orden"),
    supabase.from("lead_etapa_items").select("*").eq("lead_id", leadId).order("orden"),
  ]);
  if (falta(error)) return { etapas: [], items: [], sinTablas: true };
  return { etapas: etapas || [], items: falta(e2) ? [] : items || [], sinTablas: false };
}

/**
 * Un proyecto de un tubo en orden tiene todas sus etapas desde el principio:
 * así se ve el camino completo y cuánto falta, no solo dónde se está.
 */
export async function asegurarEtapas(lead, catalogo) {
  const tunel = lead.tunel || "lead";
  if (!TUNELES[tunel]?.enOrden) return null;
  const delTunel = etapasDelTunel(catalogo, tunel);
  if (!delTunel.length) return null;

  const { data: puestas, error } = await supabase.from("lead_etapas").select("etapa_id").eq("lead_id", lead.id);
  if (error) return falta(error) ? "sin_tablas" : error.message;
  const ya = new Set((puestas || []).map(e => e.etapa_id));
  const faltantes = delTunel.filter(e => !ya.has(e.id));
  if (!faltantes.length) return null;

  const { error: e2 } = await supabase.from("lead_etapas").insert(
    faltantes.map(e => ({ lead_id: lead.id, etapa_id: e.id, orden: e.orden, estado: "pendiente" }))
  );
  return e2 ? e2.message : null;
}

/** El checklist de fábrica de una etapa, copiado a este proyecto. */
export async function sembrarChecklist(lead, etapa) {
  const { data: plantilla, error } = await supabase.from("pipeline_etapa_items")
    .select("texto,orden").eq("etapa_id", etapa.etapa_id).eq("activo", true).order("orden");
  if (error || !plantilla?.length) return [];
  const { data } = await supabase.from("lead_etapa_items").insert(
    plantilla.map(p => ({ lead_id: lead.id, lead_etapa_id: etapa.id, texto: p.texto, orden: p.orden }))
  ).select();
  return data || [];
}

export async function agregarItem(lead, etapa, texto, orden) {
  const { data, error } = await supabase.from("lead_etapa_items")
    .insert({ lead_id: lead.id, lead_etapa_id: etapa.id, texto: texto.trim(), orden })
    .select().single();
  return error ? { error: falta(error) ? "Falta correr la migración 040." : error.message } : { item: data };
}

export async function marcarItem(item, hecho, quien) {
  const campos = { hecho, hecho_at: hecho ? new Date().toISOString() : null, hecho_por: hecho ? quien || null : null };
  const { error } = await supabase.from("lead_etapa_items").update(campos).eq("id", item.id);
  return error ? error.message : null;
}

/**
 * Una actividad que ya se hizo de nuestro lado y ahora depende de un tercero:
 * el permiso pedido, la respuesta del cliente, la muestra del proveedor. No es
 * pendiente —no hay nada que hacer— ni hecha —todavía no llega—.
 */
export async function marcarEspera(item, espera) {
  const { error } = await supabase.from("lead_etapa_items").update({ espera }).eq("id", item.id);
  return error ? (falta(error) ? "falta_migracion" : error.message) : null;
}

export async function borrarItem(id) {
  const { error } = await supabase.from("lead_etapa_items").delete().eq("id", id);
  return error ? error.message : null;
}

/**
 * Un punto del checklist que necesita que alguien haga algo se vuelve tarea,
 * con su responsable y su fecha. Al completarse la tarea, el ítem se marca
 * solo (lo hace el módulo de tareas al cerrar una que tiene ítem).
 */
export async function itemATarea(item, { lead, titulo, assignee_id, due_date, creadoPor, responsable_externo = null }) {
  const fila = {
    title: titulo || item.texto, lead_id: lead.id, assignee_id: assignee_id || null,
    due_date: due_date || null, priority: "media", status: "en-progreso", type: "Otro",
    created_by: creadoPor ?? null, notes: `Actividad de ${lead.nombre}`,
    ...(responsable_externo ? { responsable_externo } : {}),
  };
  let { data: tarea, error } = await supabase.from("tasks").insert(fila).select().single();
  // Sin la migración 041 la tarea entra igual, con el nombre en las notas.
  if (error && /column|schema cache/i.test(error.message)) {
    const { responsable_externo: fuera, ...resto } = fila;
    ({ data: tarea, error } = await supabase.from("tasks")
      .insert({ ...resto, notes: `${resto.notes}${fuera ? ` · Responsable: ${fuera}` : ""}` }).select().single());
  }
  if (error) return { error: error.message };
  const { error: e2 } = await supabase.from("lead_etapa_items").update({ tarea_id: tarea.id }).eq("id", item.id);
  return e2 ? { tarea, error: e2.message } : { tarea };
}

/** Cerrar un hito, o volver a abrirlo. */
export async function cambiarEstadoEtapa(etapa, estado, quien) {
  const campos = { estado, hecha_at: estado === "hecha" ? new Date().toISOString() : null };
  const { error } = await supabase.from("lead_etapas").update(campos).eq("id", etapa.id);
  if (error) return error.message;
  await supabase.from("lead_movimientos").insert({
    lead_id: etapa.lead_id, tipo: "etapa", automatico: true,
    detalle: `${estado === "hecha" ? "Cerró" : estado === "en_curso" ? "Arrancó" : estado === "omitida" ? "Omitió" : "Reabrió"} la etapa`,
    autor_id: quien?.id ?? null, autor_nombre: quien?.name ?? null,
  }).select();
  return null;
}

/** Cuánto lleva hecho un hito, según sus actividades. */
export function avanceDe(items = []) {
  if (!items.length) return null;
  return Math.round(items.filter(i => i.hecho).length / items.length * 100);
}
