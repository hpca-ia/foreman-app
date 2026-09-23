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

// Dos llamadas a la vez ponían las etapas dos veces: las dos leían "faltan" y
// las dos insertaban. Pasa al abrir y cerrar rápido un proyecto, o con la app
// abierta en dos pestañas. Mientras una está trabajando, la otra espera su
// resultado en vez de empezar de nuevo.
const enCurso = new Map();

/**
 * Un proyecto de un tubo en orden tiene todas sus etapas desde el principio:
 * así se ve el camino completo y cuánto falta, no solo dónde se está.
 */
export function asegurarEtapas(lead, catalogo) {
  if (enCurso.has(lead.id)) return enCurso.get(lead.id);
  const trabajo = ponerEtapasQueFaltan(lead, catalogo).finally(() => enCurso.delete(lead.id));
  enCurso.set(lead.id, trabajo);
  return trabajo;
}

async function ponerEtapasQueFaltan(lead, catalogo) {
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
  // Su tarea va con ella: marcar la actividad y que la tarea siga abierta en el
  // tablero de alguien es la forma de que nadie vuelva a confiar en el tablero.
  if (!error && item.tarea_id) {
    await supabase.from("tasks").update({ status: hecho ? "listo" : "en-progreso" }).eq("id", item.tarea_id);
  }
  return error ? error.message : null;
}

/**
 * La tarea de una actividad: se crea si no la tiene, se actualiza si ya existe.
 * @returns { tarea } o { error }
 */
export async function asegurarTarea(item, datos) {
  if (!item.tarea_id) return itemATarea(item, datos);
  // Si le corrigieron el texto, la actividad se llama igual que su tarea: dos
  // nombres para la misma cosa es cómo se pierde la pista de qué se arregló.
  if (datos.titulo && datos.titulo !== item.texto) {
    await supabase.from("lead_etapa_items").update({ texto: datos.titulo }).eq("id", item.id);
  }
  const campos = {
    title: datos.titulo || item.texto,
    assignee_id: datos.assignee_id || null,
    due_date: datos.due_date || null,
    ...(datos.responsable_externo !== undefined ? { responsable_externo: datos.responsable_externo } : {}),
  };
  let { data, error } = await supabase.from("tasks").update(campos).eq("id", item.tarea_id).select().single();
  if (error && /column|schema cache/i.test(error.message)) {
    const { responsable_externo, ...resto } = campos;
    ({ data, error } = await supabase.from("tasks").update(resto).eq("id", item.tarea_id).select().single());
  }
  return error ? { error: error.message } : { tarea: data };
}

/**
 * Una actividad que ya se hizo de nuestro lado y ahora depende de un tercero:
 * el permiso pedido, la respuesta del cliente, la muestra del proveedor. No es
 * pendiente —no hay nada que hacer— ni hecha —todavía no llega—.
 */
/** Lo que hay que saber de esa actividad y solo sabe quien la trabajó. */
export async function guardarNota(item, nota) {
  const { error } = await supabase.from("lead_etapa_items").update({ nota: nota || null }).eq("id", item.id);
  return error ? (falta(error) ? "falta_migracion" : error.message) : null;
}

export async function marcarEspera(item, espera) {
  const { error } = await supabase.from("lead_etapa_items").update({ espera }).eq("id", item.id);
  return error ? (falta(error) ? "falta_migracion" : error.message) : null;
}

export async function borrarItem(id) {
  const { error } = await supabase.from("lead_etapa_items").delete().eq("id", id);
  return error ? error.message : null;
}

/**
 * Toda actividad es también una tarea del proyecto, tenga responsable o no.
 *
 * Una actividad sin dueño igual es algo pendiente de ese proyecto, y tiene que
 * verse entre las tareas: si solo aparecieran las asignadas, el tablero diría
 * que el proyecto está limpio cuando en realidad le faltan seis cosas.
 *
 * Con responsable y fecha es una tarea como cualquier otra; sin ellos es una
 * actividad del proyecto esperando que alguien la tome. Al completarse la
 * tarea, la actividad se marca sola, y al marcar la actividad, la tarea se
 * cierra.
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

/**
 * Lo que se corrigió, a la bitácora.
 *
 * Equivocarse escribiendo es normal y arreglarlo tiene que ser fácil; lo que
 * no puede pasar es que la tarea cambie de dueño o de fecha y nadie sepa quién
 * la movió. Por eso el arreglo se anota con nombre y hora.
 */
export async function anotarCorreccion(lead, detalle, quien) {
  const { error } = await supabase.from("lead_movimientos").insert({
    lead_id: lead.id, tipo: "actividad", automatico: true, detalle,
    autor_id: quien?.id ?? null, autor_nombre: quien?.name ?? null,
  });
  return error ? error.message : null;
}

/**
 * Mover un hito a la izquierda o a la derecha dentro de este proyecto.
 *
 * El orden de Ajustes es el predeterminado, no una ley: un proyecto puede
 * hacer las ingenierías antes que el anteproyecto, o volver a una etapa
 * anterior. El orden es de cada proyecto, y por eso se guarda acá y no en el
 * catálogo, que es de toda la oficina.
 */
export async function moverEtapa(etapa, vecina) {
  if (!vecina) return null;
  const [{ error: e1 }, { error: e2 }] = await Promise.all([
    supabase.from("lead_etapas").update({ orden: vecina.orden }).eq("id", etapa.id),
    supabase.from("lead_etapas").update({ orden: etapa.orden }).eq("id", vecina.id),
  ]);
  return e1?.message || e2?.message || null;
}

/** Cerrar un hito, o volver a abrirlo. */
export async function cambiarEstadoEtapa(etapa, estado, quien) {
  const campos = { estado, hecha_at: estado === "hecha" ? new Date().toISOString() : null };
  const { error } = await supabase.from("lead_etapas").update(campos).eq("id", etapa.id);
  if (error) return error.message;
  // En qué va el proyecto lo dice el tubo, y de ahí lo lee la lista del
  // pipeline. Sin este empate, un proyecto de Construcción seguía figurando en
  // la etapa con la que nació —"Lead"— aunque ya estuviera en obra gris.
  await alDiaLaEtapaDelProyecto(etapa, estado);
  await supabase.from("lead_movimientos").insert({
    lead_id: etapa.lead_id, tipo: "etapa", automatico: true,
    detalle: `${estado === "hecha" ? "Cerró" : estado === "en_curso" ? "Arrancó" : estado === "omitida" ? "Omitió" : "Reabrió"} la etapa`,
    autor_id: quien?.id ?? null, autor_nombre: quien?.name ?? null,
  }).select();
  return null;
}

/**
 * La etapa del proyecto sigue al hito: al arrancar uno, ese es; al cerrarlo,
 * pasa al primero que quede abierto.
 */
async function alDiaLaEtapaDelProyecto(etapa, estado) {
  let etapaId = null;
  if (estado === "en_curso") etapaId = etapa.etapa_id;
  else if (estado === "hecha") {
    const { data } = await supabase.from("lead_etapas")
      .select("etapa_id,estado,orden").eq("lead_id", etapa.lead_id).order("orden");
    etapaId = (data || []).find(e => e.id !== etapa.id && e.estado !== "hecha" && e.estado !== "omitida")?.etapa_id || null;
  }
  if (etapaId) await supabase.from("leads").update({ etapa: etapaId }).eq("id", etapa.lead_id);
}

/** Cuánto lleva hecho un hito, según sus actividades. */
export function avanceDe(items = []) {
  if (!items.length) return null;
  return Math.round(items.filter(i => i.hecho).length / items.length * 100);
}
