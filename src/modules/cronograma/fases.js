import { supabase } from "../../lib/supabase";

// Las etapas del cronograma: cómo se LEE una obra de cuarenta barras.
//
// No mandan sobre las fechas —eso lo dicen las dependencias— y por eso una
// etapa puede traslaparse con la siguiente, que es como pasa en obra: los
// acabados de la planta baja arrancan mientras arriba todavía hay obra gris.
// La etapa agrupa para poder mirar, y para poder decir en una reunión "la
// etapa de instalaciones se corrió dos semanas" sin leer barra por barra.

const falta = e => /relation|column|does not exist|schema cache/i.test(e?.message || "");
export const SIN_101 = "Falta correr la migración 101 para usar etapas en el cronograma.";

export async function fasesDe(leadId) {
  if (!leadId) return { fases: [], sinTabla: false };
  const { data, error } = await supabase.from("cronograma_fases")
    .select("*").eq("lead_id", leadId).order("orden");
  if (error) return { fases: [], sinTabla: falta(error) };
  return { fases: data || [], sinTabla: false };
}

export async function crearFase({ leadId, nombre, orden, quien }) {
  const { data, error } = await supabase.from("cronograma_fases").insert({
    lead_id: leadId, nombre: String(nombre || "").trim().slice(0, 80) || "Etapa",
    orden: orden ?? 0,
    creado_por: quien?.id ?? null, creado_nombre: quien?.name || null,
  }).select();
  if (error) return { error: falta(error) ? SIN_101 : error.message };
  // UN GUARDADO QUE NO GUARDA Y NO AVISA es peor que uno que falla: la pantalla
  // vuelve igual que antes y uno queda pensando que el botón está roto. Un
  // insert que la base no deja pasar vuelve SIN error y con cero filas.
  if (!data?.length) {
    return { error: "La base no dejó crear la etapa y no dijo por qué. Puede ser el permiso de la tabla: revisá que la migración 101 haya corrido entera, incluida la política." };
  }
  return { fase: data[0] };
}

export async function renombrarFase(id, nombre) {
  const { error } = await supabase.from("cronograma_fases")
    .update({ nombre: String(nombre || "").trim().slice(0, 80) || "Etapa" }).eq("id", id);
  return error ? error.message : null;
}

/**
 * Borrar una etapa NO borra lo que tiene adentro.
 *
 * Es la equivocación más fácil de cometer: uno borra "Etapa 2" creyendo que
 * borra un título. Las actividades quedan sin etapa, que es un lugar visible
 * —van juntas al final— y no un agujero.
 */
export async function borrarFase(id) {
  const { error } = await supabase.from("cronograma_fases").delete().eq("id", id);
  return error ? error.message : null;
}

/** Mover una etapa entera: es cambiar un número, no renumerar sus actividades. */
export async function moverFase(fases, id, direccion) {
  const lista = [...(fases || [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  const i = lista.findIndex(f => String(f.id) === String(id));
  const j = i + direccion;
  // SE DICE QUE NO SE PUDO. Devolver nulo —que acá quiere decir "salió bien"—
  // cuando la etapa ya está en la punta deja una flecha que se aprieta y no
  // hace nada, que desde afuera es idéntico a un botón roto.
  if (i < 0) return "No encontré esa etapa. Recargá la pantalla.";
  if (j < 0 || j >= lista.length) return null;
  const mia = lista[i], otra = lista[j];
  // Si quedaron con el mismo orden —o sin ninguno— intercambiar no movería
  // nada: se les da el lugar que ocupan en la lista antes de cambiarlas.
  const [o1, o2] = (mia.orden ?? i) === (otra.orden ?? j) ? [j, i] : [otra.orden ?? j, mia.orden ?? i];
  const [e1, e2] = await Promise.all([
    supabase.from("cronograma_fases").update({ orden: o1 }).eq("id", mia.id).select("id"),
    supabase.from("cronograma_fases").update({ orden: o2 }).eq("id", otra.id).select("id"),
  ]);
  const e = e1.error || e2.error;
  if (e) return e.message;
  if (!e1.data?.length || !e2.data?.length) return "La base no dejó mover la etapa.";
  return null;
}

/** Meter actividades en una etapa, o sacarlas (fase nula). */
export async function asignarFase(ids = [], faseId) {
  if (!ids.length) return null;
  const { data, error } = await supabase.from("cronograma_actividades")
    .update({ fase_id: faseId }).in("id", ids).select("id");
  if (error) return falta(error) ? SIN_101 : error.message;
  // Lo mismo que arriba: sin `select()` un update que no tocó ninguna fila
  // vuelve sin error, y la actividad simplemente no se movía de etapa.
  if (!data?.length) return "La base no dejó mover esa actividad de etapa.";
  return null;
}
