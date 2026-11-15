// Lo que las órdenes de cambio de una obra quitan, para presupuestoParaGastar.
//
// Se pide aparte de los rubros porque lo usan varias pantallas que eligen un
// rubro para cargarle gasto —caja chica, la factura del control, Compras— y
// todas tienen que saber qué rubro quedó anulado por una orden.
import { supabase } from "../../lib/supabase";
import { rubrosParaGastar } from "./presupuestoParaGastar.js";

/** @returns { ordenes, lineas } */
export async function quitasDeLaObra(obraId) {
  if (!obraId) return { ordenes: [], lineas: [] };
  const { data: ordenes, error } = await supabase.from("ordenes_cambio").select("id,codigo,numero").eq("obra_id", obraId);
  if (error || !ordenes?.length) return { ordenes: [], lineas: [] };
  const { data: lineas } = await supabase.from("orden_cambio_lineas")
    .select("orden_id,tipo,obra_rubro_id,cantidad,precio_unitario").in("orden_id", ordenes.map(o => o.id)).eq("tipo", "quita");
  return { ordenes, lineas: lineas || [] };
}

/** Los rubros de una obra, con lo que quitan sus órdenes ya cancelado. */
export async function rubrosParaGastarDe(obraId, rubros = []) {
  if (!obraId || !rubros.length) return rubros;
  return rubrosParaGastar(rubros, await quitasDeLaObra(obraId)).rubros;
}
