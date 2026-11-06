import { supabase } from "../../lib/supabase";

// LAS SIMULACIONES GUARDADAS DEL PRESUPUESTO ACTUALIZADO.
//
// Un nombre y una lista de ajustes por rubro. Lo demás —el contrato, las
// órdenes, los honorarios— se calcula cada vez que se abre, así que una
// simulación guardada hace un mes se lee contra el contrato de hoy.

const falta = e => /relation|does not exist|schema cache|obra_presupuesto_simulaciones/i.test(e?.message || "");
export const SIN_169 = "Falta correr la migración 169 para guardar las simulaciones. Mientras tanto podés ajustar y bajar el PDF o el Excel, pero al salir se pierde.";

/** Solo lo que es un ajuste de verdad: un número distinto de cero. */
export function ajustesLimpios(ajustes = {}) {
  return Object.fromEntries(Object.entries(ajustes || {})
    .map(([k, v]) => [k, Math.round((Number(v) || 0) * 10000) / 10000])
    .filter(([, v]) => v !== 0));
}

export async function simulacionesDe(obraId) {
  const { data, error } = await supabase.from("obra_presupuesto_simulaciones")
    .select("*").eq("obra_id", obraId).order("updated_at", { ascending: false });
  if (error) return { simulaciones: [], sinTabla: falta(error), error: falta(error) ? SIN_169 : error.message };
  return { simulaciones: data || [] };
}

/** Guarda una simulación nueva, o la que ya existía si trae su id. */
export async function guardarSimulacion({ id, obraId, nombre, ajustes, quien }) {
  const fila = { nombre: String(nombre || "").trim() || "Simulación", ajustes: ajustesLimpios(ajustes), updated_at: new Date().toISOString() };
  const q = id
    ? supabase.from("obra_presupuesto_simulaciones").update(fila).eq("id", id)
    : supabase.from("obra_presupuesto_simulaciones").insert({ ...fila, obra_id: obraId,
      creado_por: quien?.id ?? null, creado_nombre: quien?.name || null });
  const { data, error } = await q.select().single();
  if (error) return { error: falta(error) ? SIN_169 : error.message };
  return { simulacion: data };
}

export async function borrarSimulacion(id) {
  const { error } = await supabase.from("obra_presupuesto_simulaciones").delete().eq("id", id);
  return error ? (falta(error) ? SIN_169 : error.message) : null;
}
