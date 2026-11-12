import { supabase } from "../../lib/supabase";
import { cantidadEscrita } from "./liquidacion.js";

// Lo ejecutado de cada renglón del presupuesto actualizado, y cómo se cobra la
// obra. Las reglas —qué se liquida con eso— están en liquidacion.js, que no
// toca la base. Esto es lo que lee y escribe.

const falta = e => /relation|column|does not exist|schema cache/i.test(e?.message || "");
export const SIN_179 = "Falta correr la migración 179 en Supabase.";

/**
 * Las cantidades ejecutadas de la obra.
 * @returns { ejecutado: { [clave]: cantidad }, sinTabla }
 */
export async function cargarEjecutado(obraId) {
  if (!obraId) return { ejecutado: {}, sinTabla: false };
  const { data, error } = await supabase.from("obra_ejecutado").select("clave,cantidad").eq("obra_id", obraId);
  if (error) return { ejecutado: {}, sinTabla: falta(error), error: falta(error) ? SIN_179 : error.message };
  return { ejecutado: Object.fromEntries((data || []).map(f => [f.clave, Number(f.cantidad)])), sinTabla: false };
}

/**
 * Anotar lo ejecutado de un renglón. Vacío lo deja «sin medir»: se borra la
 * fila, y el renglón vuelve a liquidarse por lo vigente.
 *
 * @param clave    el renglón (claveDe)
 * @param rubroId  el rubro del contrato, si el renglón es uno
 * @returns null o el error
 */
export async function anotarEjecutado({ obra, clave, rubroId = null, valor, quien = null }) {
  const cantidad = cantidadEscrita(valor);
  if (cantidad == null) {
    if (!(valor === "" || valor == null)) return "Lo ejecutado es una cantidad: un número, cero o más.";
    const { error } = await supabase.from("obra_ejecutado").delete().eq("obra_id", obra.id).eq("clave", clave);
    return error ? (falta(error) ? SIN_179 : error.message) : null;
  }
  const { error } = await supabase.from("obra_ejecutado").upsert({
    obra_id: obra.id, clave, obra_rubro_id: rubroId, cantidad,
    anotado_por: quien?.id ?? null, anotado_nombre: quien?.name || null, updated_at: new Date().toISOString(),
  }, { onConflict: "obra_id,clave" });
  return error ? (falta(error) ? SIN_179 : error.message) : null;
}

/** Cómo se cobra la obra: por rubros o llave en mano. @returns null o el error */
export async function guardarModalidad(obra, modalidad) {
  const { error } = await supabase.from("obras").update({ modalidad }).eq("id", obra.id);
  return error ? (falta(error) ? SIN_179 : error.message) : null;
}
