import { supabase } from "../../lib/supabase";
import { anotar, abrirDia } from "./libro";

// La semana que viene, escrita antes. (Los datos; la pantalla es PlanSemanal.jsx.)
//
// El nombre lleva "Datos" a propósito: este archivo y la pantalla no pueden
// llamarse igual cambiando solo una mayúscula. En macOS el resolvedor de
// módulos ignora las mayúsculas y puede traer uno por el otro —pasó: importar
// "./PlanSemanal" traía este y el build decía que no tenía default export—, y
// en el Linux de producción resolvería distinto. Dos archivos que solo se
// distinguen por una mayúscula son un error que aparece en un entorno y no en
// el otro.
//
// El Libro de Obra registra lo que pasó; esto, lo que va a pasar. Es el mismo
// día visto desde el otro lado, y por eso vive acá y no en un módulo aparte:
// un módulo aparte competiría con el libro por la atención del residente, y el
// día terminaría escrito dos veces en dos lugares que nadie compara.
//
// LO QUE SE PLANIFICÓ Y NO SE HIZO ES EL DATO. Un plan que nadie contrasta con
// la realidad es una lista de buenas intenciones. Lo que quedó sin marcar, con
// su motivo, es lo que un mes después explica un atraso — y hoy no existe en
// ningún lado: se discute de memoria.

const falta = e => /relation|column|does not exist|schema cache/i.test(e?.message || "");

/** Los días de un período, incluidos los dos extremos. */
export function diasEntre(desde, hasta, cal = null) {
  const a = new Date(`${String(desde).slice(0, 10)}T12:00:00`);
  const b = new Date(`${String(hasta).slice(0, 10)}T12:00:00`);
  if (isNaN(a) || isNaN(b) || b < a) return [];
  const out = [];
  let f = a, vueltas = 0;
  while (f <= b && vueltas++ < 400) {
    // El domingo no se planifica salvo que la obra trabaje domingos: una
    // semana con dos días vacíos obligatorios se llena de ruido.
    if (!cal || cal.trabaja(f)) out.push(f.toISOString().slice(0, 10));
    f = new Date(f.getTime() + 86400000);
  }
  return out;
}

export async function cargarPlan(leadId, desde, hasta) {
  if (!leadId) return { dias: [], items: [], sinTablas: false };
  const { data: dias, error } = await supabase.from("obra_plan_dias")
    .select("*").eq("lead_id", leadId).gte("fecha", desde).lte("fecha", hasta).order("fecha");
  if (error) return { dias: [], items: [], sinTablas: falta(error) };
  if (!dias?.length) return { dias: [], items: [], sinTablas: false };
  const { data: items } = await supabase.from("obra_plan_items")
    .select("*").in("plan_dia_id", dias.map(d => d.id)).order("orden");
  return { dias, items: items || [], sinTablas: false };
}

/** El día, creándolo si hace falta: se escribe en él apenas se toca algo. */
export async function diaDelPlan(leadId, fecha, quien) {
  const { data } = await supabase.from("obra_plan_dias")
    .select("*").eq("lead_id", leadId).eq("fecha", fecha).maybeSingle();
  if (data) return { dia: data };
  const { data: creado, error } = await supabase.from("obra_plan_dias").insert({
    lead_id: leadId, fecha,
    created_by: quien?.id ?? null, created_nombre: quien?.name || null,
  }).select().single();
  if (error) return { error: falta(error) ? "Falta correr la migración 089." : error.message };
  return { dia: creado };
}

export async function guardarDia(diaId, campos) {
  const { error } = await supabase.from("obra_plan_dias").update(campos).eq("id", diaId);
  return error ? error.message : null;
}

export async function agregarItem(dia, { tipo = "tarea", texto, cronograma_actividad_id = null, obra_actividad_id = null, orden = 0 }) {
  if (!String(texto || "").trim()) return { error: "Escribí qué hay que hacer." };
  const { data, error } = await supabase.from("obra_plan_items").insert({
    plan_dia_id: dia.id, tipo, texto: String(texto).trim().slice(0, 300),
    cronograma_actividad_id, obra_actividad_id, orden,
  }).select().single();
  return error ? { error: error.message } : { item: data };
}

export async function borrarItem(id) {
  const { error } = await supabase.from("obra_plan_items").delete().eq("id", id);
  return error ? error.message : null;
}

/**
 * Marcar una tarea del plan como hecha, y que el libro se entere.
 *
 * Esto es la mitad del valor del módulo. El residente ya marca lo que hizo;
 * pedirle además que lo redacte en el libro es pedirle que escriba dos veces lo
 * mismo, y lo que pasa cuando se pide eso es que el libro queda vacío.
 *
 * Al desmarcar NO se borra la entrada del libro: lo que se escribió el día que
 * pasó es el registro, y un registro que se puede deshacer con un clic deja de
 * servir para lo único que sirve un libro de obra. Se anota la corrección.
 */
export async function marcarHecha(item, hecha, quien, { leadId, fecha } = {}) {
  const campos = {
    hecha,
    hecha_at: hecha ? new Date().toISOString() : null,
    hecha_por: hecha ? (quien?.id ?? null) : null,
    hecha_nombre: hecha ? (quien?.name || null) : null,
  };
  // Al marcarla hecha ya no hace falta el motivo de por qué no se hizo.
  if (hecha) campos.motivo = null;

  const { data, error } = await supabase.from("obra_plan_items")
    .update(campos).eq("id", item.id).select();
  if (error) return { error: error.message };
  if (!data?.length) return { error: "No se pudo guardar: la base no dejó tocar esa tarea." };

  // Y el libro de ese día se entera. Si el día ya pasó y no tiene libro,
  // `abrirDia` devuelve null a propósito —un día pasado sin libro no se
  // inventa— y acá eso no es un error: la tarea queda marcada igual.
  if (!leadId || !fecha) return { item: data[0] };
  const { dia } = await abrirDia(leadId, fecha, quien);
  if (!dia) return { item: data[0], sinLibro: true };

  if (hecha && !item.libro_entrada_id) {
    const { entrada } = await anotar(dia, "actividades", item.texto, quien);
    if (entrada?.id) {
      await supabase.from("obra_plan_items").update({ libro_entrada_id: entrada.id }).eq("id", item.id);
    }
  } else if (!hecha && item.libro_entrada_id) {
    await anotar(dia, "observaciones", `Se había dado por hecha y se corrigió: ${item.texto}`, quien);
  }
  return { item: data[0] };
}

/** Por qué no se hizo. Sin motivo, una tarea sin marcar no dice nada. */
export async function guardarMotivo(id, motivo) {
  const { error } = await supabase.from("obra_plan_items").update({ motivo: motivo || null }).eq("id", id);
  return error ? error.message : null;
}

/**
 * Lo que el cronograma dice que toca esa semana.
 *
 * El plan no arranca en blanco: las barras ya saben qué actividades caen entre
 * esas dos fechas, y en qué día de su propia duración van. Escribir a mano lo
 * que la app ya sabe es el trabajo que hace que un módulo de planificación se
 * abandone a la tercera semana.
 */
export function loQueTocaEstaSemana(actividades = [], desde, hasta) {
  const d = String(desde).slice(0, 10);
  const h = String(hasta).slice(0, 10);
  return actividades
    .filter(a => a.inicio && a.fin && String(a.inicio).slice(0, 10) <= h && String(a.fin).slice(0, 10) >= d)
    .map(a => ({
      ...a,
      // Si arranca o termina en la semana, eso es lo que hay que decir: son
      // los dos días en que alguien tiene que estar mirando.
      arranca: String(a.inicio).slice(0, 10) >= d && String(a.inicio).slice(0, 10) <= h,
      termina: String(a.fin).slice(0, 10) >= d && String(a.fin).slice(0, 10) <= h,
    }));
}

/**
 * Cómo salió la semana: lo planificado contra lo hecho.
 *
 * El número que importa no es cuántas tareas se hicieron, es CUÁLES NO y por
 * qué. Una semana al 80% con las dos de la ruta crítica sin hacer es peor que
 * una al 60% donde lo que faltó era pintura.
 */
export function comoSalio(items = []) {
  const tareas = items.filter(i => i.tipo !== "material");
  const hechas = tareas.filter(i => i.hecha);
  const sinHacer = tareas.filter(i => !i.hecha);
  return {
    total: tareas.length,
    hechas: hechas.length,
    sinHacer,
    sinMotivo: sinHacer.filter(i => !String(i.motivo || "").trim()),
    pct: tareas.length ? Math.round((hechas.length / tareas.length) * 100) : null,
  };
}
