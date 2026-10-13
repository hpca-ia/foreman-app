import { supabase } from "../../lib/supabase";

// Las órdenes de cambio que el cronograma todavía no tomó.
//
// Una orden aprobada es trabajo nuevo que alguien va a tener que hacer, y el
// cronograma sigue prometiendo la fecha del contrato. Esto es lo que convierte
// eso en una pregunta a tiempo —"¿cuántos días pide la OC-03?"— en vez de un
// atraso que aparece tres meses después, cuando ya no se puede justificar.

const falta = e => /relation|column|does not exist|schema cache/i.test(e?.message || "");

/**
 * QUÉ ÓRDENES CUENTAN: las aprobadas, no anuladas, y que no se decidió no
 * ejecutar. Una orden en borrador o rechazada no es trabajo todavía, y meterla
 * en el cronograma sería planificar algo que puede no pasar.
 */
export async function ordenesPendientes(obraId) {
  if (!obraId) return { ordenes: [], sinColumna: false };
  const campos = "id,numero,codigo,titulo,fecha,estado,ejecucion,anulada,dias_impacto,impacto_cronograma,justificacion";
  let { data, error } = await supabase.from("ordenes_cambio")
    .select(`${campos},crono_aplicada_at`).eq("obra_id", obraId).order("numero");
  // Sin la 104 no existe la columna: se lee sin ella y se muestran todas las
  // aprobadas. Es ruidoso, pero es mejor que no enterarse.
  let sinColumna = false;
  if (error && falta(error)) {
    sinColumna = true;
    ({ data, error } = await supabase.from("ordenes_cambio").select(campos).eq("obra_id", obraId).order("numero"));
  }
  if (error) return { ordenes: [], sinColumna: falta(error) };
  const ordenes = (data || []).filter(o =>
    o.estado === "aprobada" && !o.anulada && o.ejecucion !== "no_ejecutado" && !o.crono_aplicada_at);
  return { ordenes, sinColumna };
}

/** Las líneas de una orden, para saber qué toca y cuánto. */
export async function lineasDe(ids = []) {
  if (!ids.length) return [];
  const { data } = await supabase.from("orden_cambio_lineas")
    .select("orden_id,tipo,descripcion,capitulo,unidad,cantidad,precio_unitario,obra_rubro_id")
    .in("orden_id", ids);
  return data || [];
}

/**
 * Marcar que el cronograma ya la tomó.
 *
 * Se marca igual cuando se decide que no cambia nada: "esta orden no mueve el
 * plazo" es una respuesta, y dejarla sin responder convierte el aviso en
 * paisaje. Lo que no se puede es que el aviso siga prendido por algo que ya
 * se miró.
 */
export async function marcarAplicada(ids = []) {
  if (!ids.length) return null;
  const { error } = await supabase.from("ordenes_cambio")
    .update({ crono_aplicada_at: new Date().toISOString() }).in("id", ids);
  return error ? (falta(error) ? "Falta correr la migración 104." : error.message) : null;
}
