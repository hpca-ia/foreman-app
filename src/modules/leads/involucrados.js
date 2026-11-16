import { supabase } from "../../lib/supabase";
import { fuentesDeLaGente } from "../controlObra/ordenesDeCambio";
import { armarInvolucrados, filasDe } from "../controlObra/directorioDelProyecto.js";
import { guardarConvocado, borrarConvocado } from "../actas/actas";

// LOS INVOLUCRADOS DE UN PROYECTO, del lado de la base.
//
// Qué persona es cuál, qué se muestra y qué se escribe al corregirla lo decide
// controlObra/directorioDelProyecto.js, sin base. Acá solo se lee y se guarda.

/** Todos los de afuera que tienen que ver con el proyecto, de las cinco listas. */
export async function involucradosDe(leadId) {
  return armarInvolucrados(await fuentesDeLaGente(leadId));
}

/** Aplica lo que devolvió cambiosAlEditar. @returns el error, o null */
export async function aplicarCambios(ops = []) {
  for (const op of ops) {
    const q = op.id
      ? supabase.from(op.tabla).update(op.campos).eq("id", op.id)
      : supabase.from(op.tabla).insert(op.campos);
    const { error } = await q;
    if (error) return error.message;
  }
  return null;
}

/** Agregar a alguien desde la ficha. @returns el error, o null */
export async function agregarALaFicha(fila) {
  const { error } = await supabase.from("pipeline_invitados").insert(fila);
  return error ? error.message : null;
}

/** Pasarla a los de siempre: entra sola en cada acta nueva. @returns el error, o null */
export async function ponerDeSiempre(fila) {
  const r = await guardarConvocado(fila);
  return r.error || null;
}

/**
 * Sacarla de los de siempre. No toca ninguna acta ya escrita. Si estaba
 * cargada más de una vez, salen todas: sacando una sola seguiría entrando.
 * @returns el error, o null
 */
export async function sacarDeSiempre(p) {
  for (const id of filasDe(p, "convocado")) {
    const e = await borrarConvocado(id);
    if (e) return e;
  }
  return null;
}

/**
 * Quitarla de lo cargado a mano: de los de siempre y de la ficha. Si figura en
 * un acta, una orden o el libro, de ahí no se borra —son documentos—.
 * @returns el error, o null
 */
export async function quitarDeLoCargado(p) {
  const e = await sacarDeSiempre(p);
  if (e) return e;
  for (const id of filasDe(p, "invitado")) {
    const { error } = await supabase.from("pipeline_invitados").delete().eq("id", id);
    if (error) return error.message;
  }
  return null;
}
