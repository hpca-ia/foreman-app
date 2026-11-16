import { supabase } from "../../lib/supabase";
import { fuentesDeLaGente } from "../controlObra/ordenesDeCambio";
import { armarInvolucrados, quitadosDe, alQuitar, filasDe } from "../controlObra/directorioDelProyecto.js";
import { guardarConvocado, borrarConvocado } from "../actas/actas";

// LOS INVOLUCRADOS DE UN PROYECTO, del lado de la base.
//
// Qué persona es cuál, qué se muestra y qué se escribe al corregirla lo decide
// controlObra/directorioDelProyecto.js, sin base. Acá solo se lee y se guarda.

const falta = e => /relation|column|does not exist|schema cache|could not find/i.test(e?.message || "");
export const SIN_183 = "Falta correr la migración 183 para quitar de la lista a quien figura en un documento ya enviado.";

/**
 * Todos los de afuera que tienen que ver con el proyecto, de las cinco listas,
 * y aparte los que se quitaron.
 * @returns { personas, quitados }
 */
export async function involucradosDe(leadId) {
  const fuentes = await fuentesDeLaGente(leadId);
  return { personas: armarInvolucrados(fuentes), quitados: quitadosDe(fuentes) };
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

/** Agregar a alguien desde la ficha. Si se la había quitado, vuelve. @returns el error, o null */
export async function agregarALaFicha(fila) {
  const { error } = await supabase.from("pipeline_invitados").insert(fila);
  if (error) return error.message;
  if (fila.email) await volverAPoner(fila.lead_id, fila.email);
  return null;
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
 * Quitarla de las listas del proyecto.
 *
 * Sale de lo cargado a mano —los de siempre y la ficha— y, si figura en un
 * acta, una orden o el libro, queda anotada como quitada: de esos documentos
 * no se borra a nadie, pero deja de ofrecerse para los envíos que vengan.
 *
 * PRIMERO SE ANOTA. Si la migración 183 no está corrida, eso falla y no se
 * toca nada: sacarla de lo cargado y que siga apareciendo por el acta sería
 * peor que no hacer nada.
 *
 * @returns el error, o null
 */
export async function quitarDeLaLista(p, leadId, quien) {
  const q = alQuitar(p);
  if (q.esconder) {
    const { error } = await supabase.from("proyecto_gente_oculta").upsert({
      lead_id: leadId, email: p.email, nombre: p.nombre || null,
      oculto_por: quien?.id ?? null, oculto_nombre: quien?.name || quien?.nombre || null,
    }, { onConflict: "lead_id,email" });
    if (error) return falta(error) ? SIN_183 : error.message;
  }
  if (q.deLoCargado) {
    const e = await sacarDeSiempre(p);
    if (e) return e;
    for (const id of filasDe(p, "invitado")) {
      const { error } = await supabase.from("pipeline_invitados").delete().eq("id", id);
      if (error) return error.message;
    }
  }
  return null;
}

/** Volver a poner en las listas a quien se había quitado. @returns el error, o null */
export async function volverAPoner(leadId, email) {
  const { error } = await supabase.from("proyecto_gente_oculta").delete().eq("lead_id", leadId).eq("email", String(email || "").trim().toLowerCase());
  return error && !falta(error) ? error.message : null;
}
