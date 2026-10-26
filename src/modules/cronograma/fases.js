import { supabase } from "../../lib/supabase";
import { dueno, filaDe } from "./dueno";

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
  const d = dueno(leadId);
  if (!d?.id) return { fases: [], sinTabla: false };
  const { data, error } = await supabase.from("cronograma_fases")
    .select("*").eq(d.campo, d.id).order("orden");
  if (error) return { fases: [], sinTabla: falta(error) };
  return { fases: data || [], sinTabla: false };
}

export async function crearFase({ leadId, nombre, orden, quien }) {
  const { data, error } = await supabase.from("cronograma_fases").insert({
    ...filaDe(leadId), nombre: String(nombre || "").trim().slice(0, 80) || "Etapa",
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

/**
 * Mover una etapa: SE RENUMERA LA LISTA ENTERA, no se intercambian dos números.
 *
 * Intercambiar el `orden` de dos filas parece lo más barato y es lo que venía
 * fallando a veces sí y a veces no. Alcanza con que dos etapas hayan quedado
 * con el mismo número —y quedan: se crean de a una, NOVA las rehace, se borra
 * una del medio— para que intercambiarlos no cambie nada. La fila se movía o
 * no se movía según un estado que nadie podía ver, que es la peor clase de
 * error: el botón anda a veces.
 *
 * Renumerar las diez de arriba a abajo no deja lugar a empates. Son diez
 * escrituras en vez de dos, y a cambio el orden que se ve es siempre el que
 * está guardado.
 */
export async function moverFase(fases, id, direccion) {
  const lista = [...(fases || [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  const i = lista.findIndex(f => String(f.id) === String(id));
  if (i < 0) return "No encontré esa etapa. Recargá la pantalla.";
  const j = i + direccion;
  if (j < 0 || j >= lista.length) return null;
  const [movida] = lista.splice(i, 1);
  lista.splice(j, 0, movida);
  return renumerar(lista);
}

/** Dejar los `orden` en 0,1,2… tal como se ven. Sin empates posibles. */
export async function renumerar(lista = []) {
  const errores = await Promise.all(lista.map((f, k) =>
    supabase.from("cronograma_fases").update({ orden: k }).eq("id", f.id).select("id")));
  const e = errores.find(r => r.error);
  if (e) return e.error.message;
  if (errores.some(r => !r.data?.length)) return "La base no dejó mover la etapa.";
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
