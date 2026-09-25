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
// Para la bitácora: "9 oct" se lee, "2026-10-09" hay que traducirlo. Al mediodía
// para que la fecha no se corra un día al leerla desde Ecuador.
const enCriollo = f => (f ? new Date(`${f}T12:00:00`).toLocaleDateString("es-EC", { day: "numeric", month: "short" }) : "");

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

export async function agregarItem(lead, etapa, texto, orden, quien) {
  const { data, error } = await supabase.from("lead_etapa_items")
    .insert({ lead_id: lead.id, lead_etapa_id: etapa.id, texto: texto.trim(), orden })
    .select().single();
  if (error) return { error: falta(error) ? "Falta correr la migración 040." : error.message };
  await anotar(lead.id, { detalle: `Sumó "${texto.trim()}"`, quien });
  await alDiaElHito(etapa.id, quien);
  return { item: data };
}

/**
 * El estado de un hito sale de sus actividades: arranca cuando se marca la
 * primera y cierra cuando se marca la última. Antes había que acordarse de
 * apretar "Arrancar" y "Cerrar", y el tubo mostraba en pendiente etapas donde
 * ya se estaba trabajando.
 *
 * Esto corre al tocar una actividad, nunca al abrir el proyecto: si corriera
 * al abrirlo, una etapa reabierta a mano —con todo marcado— se volvía a cerrar
 * sola al primer refresco y el botón "Reabrir" parecía roto. Reabrir es una
 * decisión de una persona y manda hasta que alguien vuelva a mover una
 * actividad de esa etapa.
 */
export async function alDiaElHito(leadEtapaId, quien, nombre) {
  if (!leadEtapaId) return null;
  const [{ data: etapa }, { data: suyos }] = await Promise.all([
    supabase.from("lead_etapas").select("*").eq("id", leadEtapaId).single(),
    supabase.from("lead_etapa_items").select("id,hecho").eq("lead_etapa_id", leadEtapaId),
  ]);
  if (!etapa || etapa.estado === "omitida" || !suyos?.length) return null;
  const hechas = suyos.filter(i => i.hecho).length;
  const debe = hechas === suyos.length ? "hecha" : hechas > 0 ? "en_curso" : "pendiente";
  if (debe === etapa.estado) return null;
  // El cierre sí es noticia del proyecto; arrancar no: sería una fila de
  // bitácora por cada tilde.
  return cambiarEstadoEtapa(etapa, debe, quien, debe === "hecha", nombre);
}

export async function marcarItem(item, hecho, quien, autor, nombreEtapa) {
  const campos = { hecho, hecho_at: hecho ? new Date().toISOString() : null, hecho_por: hecho ? quien || null : null };
  const { error } = await supabase.from("lead_etapa_items").update(campos).eq("id", item.id);
  if (!error) {
    await anotar(item.lead_id, { detalle: `${hecho ? "Hizo" : "Volvió a abrir"} "${item.texto}"`, quien: autor });
    await alDiaElHito(item.lead_etapa_id, autor, nombreEtapa);
  }
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
    hora: datos.hora || null,
    ...(datos.responsable_externo !== undefined ? { responsable_externo: datos.responsable_externo } : {}),
  };
  let { data, error } = await supabase.from("tasks").update(campos).eq("id", item.tarea_id).select().single();
  if (error && /column|schema cache/i.test(error.message)) {
    const { responsable_externo, hora, ...resto } = campos;
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

export async function marcarEspera(item, espera, quien) {
  const { error } = await supabase.from("lead_etapa_items").update({ espera }).eq("id", item.id);
  if (!error) {
    await anotar(item.lead_id, { detalle: `"${item.texto}" ${espera ? "queda esperando a un tercero" : "ya no espera"}`, quien });
  }
  return error ? (falta(error) ? "falta_migracion" : error.message) : null;
}

export async function borrarItem(item, quien) {
  const id = typeof item === "object" ? item.id : item;
  // La tarea se va con ella. Quedaba viva en el tablero, sin etapa ni proyecto
  // que la explique: "esto no está en ningún lugar del pipeline".
  if (typeof item === "object" && item.tarea_id) {
    await supabase.from("tasks").delete().eq("id", item.tarea_id);
  }
  const { error } = await supabase.from("lead_etapa_items").delete().eq("id", id);
  if (!error && typeof item === "object") {
    await anotar(item.lead_id, { detalle: `Quitó "${item.texto}"`, quien });
    await alDiaElHito(item.lead_etapa_id, quien);
  }
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
export async function itemATarea(item, { lead, titulo, assignee_id, due_date, hora, tipo, urgente, creadoPor, quien, nombreResponsable, responsable_externo = null }) {
  const fila = {
    title: titulo || item.texto, lead_id: lead.id, assignee_id: assignee_id || null,
    due_date: due_date || null, priority: urgente ? "urgente" : "media", status: "en-progreso", type: tipo || "Otro",
    created_by: creadoPor ?? null, notes: `Gestión de ${lead.nombre}`,
    ...(hora ? { hora } : {}),
    ...(responsable_externo ? { responsable_externo } : {}),
  };
  let { data: tarea, error } = await supabase.from("tasks").insert(fila).select().single();
  // Sin las migraciones 041 y 045 la tarea entra igual: el responsable de
  // afuera y la hora quedan escritos en las notas, que es donde se pueden leer.
  if (error && /column|schema cache/i.test(error.message)) {
    const { responsable_externo: fuera, hora: aLaHora, ...resto } = fila;
    ({ data: tarea, error } = await supabase.from("tasks")
      .insert({ ...resto, notes: `${resto.notes}${fuera ? ` · Responsable: ${fuera}` : ""}${aLaHora ? ` · ${aLaHora}` : ""}` }).select().single());
  }
  if (error) return { error: error.message };
  const { error: e2 } = await supabase.from("lead_etapa_items").update({ tarea_id: tarea.id }).eq("id", item.id);
  // Encargarle algo a alguien es de las cosas que hay que poder rastrear.
  if (assignee_id || responsable_externo) {
    await anotar(lead.id, {
      detalle: `Le encargó "${tarea.title}" a ${responsable_externo || nombreResponsable || "alguien del equipo"}`
        + (due_date ? `, para el ${enCriollo(due_date)}${hora ? ` a las ${hora}` : ""}` : ""),
      quien: quien || { id: creadoPor ?? null },
    });
  }
  return e2 ? { tarea, error: e2.message } : { tarea };
}

/**
 * La bitácora: qué pasó en este proyecto, en orden.
 *
 * Se escribe sola con el trabajo —una actividad que se agrega, una que se
 * hace, una que se le encarga a alguien, un hito que cierra, un arreglo— para
 * que a fin de mes se pueda contar la obra sin acordarse de nada. Si falta la
 * columna `automatico` (migración 024) la fila entra igual: perder el
 * movimiento por una columna sería perder justo lo que se quería guardar.
 */
export async function anotar(leadId, { tipo = "actividad", detalle, quien, automatico = true }) {
  if (!leadId || !detalle) return null;
  const fila = { lead_id: leadId, tipo, automatico, detalle, autor_id: quien?.id ?? null, autor_nombre: quien?.name ?? null };
  let { error } = await supabase.from("lead_movimientos").insert(fila);
  if (error && /column|schema cache/i.test(error.message)) {
    const { automatico: auto, ...resto } = fila;
    ({ error } = await supabase.from("lead_movimientos").insert(resto));
  }
  return error ? error.message : null;
}

/** Lo que se corrigió, a la bitácora: quién la movió y de qué a qué. */
export const anotarCorreccion = (lead, detalle, quien) => anotar(lead.id, { detalle, quien });

/**
 * Mover un hito a la izquierda o a la derecha dentro de este proyecto.
 *
 * El orden de Ajustes es el predeterminado, no una ley: un proyecto puede
 * hacer las ingenierías antes que el anteproyecto, o volver a una etapa
 * anterior. El orden es de cada proyecto, y por eso se guarda acá y no en el
 * catálogo, que es de toda la oficina.
 *
 * Se renumera la fila entera —10, 20, 30…— en vez de cambiarle el número a dos.
 * Intercambiar servía solo si los números eran distintos, y no lo eran: los
 * proyectos de antes tenían todas sus etapas en cero o repetidas, así que la
 * flecha no movía nada y parecía rota.
 */
export async function moverEtapa(columnas, etapa, haciaLaDerecha) {
  const i = columnas.findIndex(e => e.id === etapa.id);
  const j = i + (haciaLaDerecha ? 1 : -1);
  if (i < 0 || j < 0 || j >= columnas.length) return null;
  const lista = [...columnas];
  [lista[i], lista[j]] = [lista[j], lista[i]];

  const cambios = lista
    .map((e, k) => ({ id: e.id, antes: e.orden, orden: (k + 1) * 10 }))
    .filter(x => x.antes !== x.orden);
  const errores = await Promise.all(
    cambios.map(x => supabase.from("lead_etapas").update({ orden: x.orden }).eq("id", x.id))
  );
  return errores.find(r => r.error)?.error?.message || null;
}

/**
 * Cerrar un hito, o volver a abrirlo.
 *
 * Casi siempre esto pasa solo: el hito arranca cuando se marca su primera
 * actividad y se cierra cuando se marca la última. Esos cambios no se anotan
 * en la bitácora —serían una fila por cada tilde—, salvo el cierre, que sí es
 * una noticia del proyecto.
 */
export async function cambiarEstadoEtapa(etapa, estado, quien, anotarlo = true, nombre) {
  const campos = { estado, hecha_at: estado === "hecha" ? new Date().toISOString() : null };
  const { error } = await supabase.from("lead_etapas").update(campos).eq("id", etapa.id);
  if (error) return error.message;
  if (!anotarlo) { await alDiaLaEtapaDelProyecto(etapa, estado); return null; }
  // En qué va el proyecto lo dice el tubo, y de ahí lo lee la lista del
  // pipeline. Sin este empate, un proyecto de Construcción seguía figurando en
  // la etapa con la que nació —"Lead"— aunque ya estuviera en obra gris.
  await alDiaLaEtapaDelProyecto(etapa, estado);
  await supabase.from("lead_movimientos").insert({
    lead_id: etapa.lead_id, tipo: "etapa", automatico: true,
    detalle: `${estado === "hecha" ? "Cerró" : estado === "en_curso" ? "Arrancó" : estado === "omitida" ? "Omitió" : "Reabrió"} la etapa${nombre ? ` ${nombre}` : ""}`,
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
      .select("id,etapa_id,estado,orden").eq("lead_id", etapa.lead_id).order("orden");
    const abiertas = (data || []).filter(e => e.id !== etapa.id && e.estado !== "hecha" && e.estado !== "omitida");
    // La que sigue a la que se cerró; si esa era la última, la primera que
    // quede abierta. Sin esto, cerrar obra gris devolvía el proyecto a una
    // etapa anterior que nadie había cerrado, y parecía que retrocedió.
    etapaId = (abiertas.find(e => e.orden > etapa.orden) || abiertas[0])?.etapa_id || null;
  }
  if (etapaId) await supabase.from("leads").update({ etapa: etapaId }).eq("id", etapa.lead_id);
}

/** Cuánto lleva hecho un hito, según sus actividades. */
export function avanceDe(items = []) {
  if (!items.length) return null;
  return Math.round(items.filter(i => i.hecho).length / items.length * 100);
}
