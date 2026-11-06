import { supabase } from "../../lib/supabase";
import { loQueFaltaAgrupar, ORIGEN_ORDEN } from "./agrupacionesDeOrdenes.js";

/**
 * Que los rubros de las órdenes aprobadas tengan su agrupación.
 *
 * Se llama al aprobar una orden y, además, cada vez que se abre la obra o un
 * pedido de compra: una orden puede aprobarse por el enlace del cliente —que
 * corre en el servidor y no pasa por acá—, y las que se aprobaron antes de que
 * esto existiera tampoco la tenían. Preguntar es una consulta; cuando no hay
 * nada que acomodar, no hace nada más.
 *
 * No toca un solo monto: crea agrupaciones y les muda rubros que no estaban en
 * ninguna. Nunca saca un rubro de la agrupación en la que alguien lo puso.
 *
 * @returns cuántos rubros acomodó (0 = ya estaba todo en su lugar)
 */
export async function agruparOrdenesAprobadas(obraId) {
  if (!obraId) return 0;

  // Lo barato primero: ¿hay alguna partida de una orden sin agrupación? Los
  // honorarios no cuentan para esta pregunta: pueden quedarse sin ninguna.
  const { data: sueltos, error } = await supabase.from("obra_rubros")
    .select("id").eq("obra_id", obraId).eq("origen", "orden_cambio").is("actividad_id", null)
    .not("capitulo", "ilike", "%honorario%").limit(1);
  if (error || !sueltos?.length) return 0;

  const [{ data: ordenes }, { data: rubros }, { data: actividades }] = await Promise.all([
    supabase.from("ordenes_cambio").select("id,numero,codigo,titulo,estado,anulada,reemplazada_at").eq("obra_id", obraId),
    supabase.from("obra_rubros").select("id,capitulo,descripcion,origen,actividad_id,orden_cambio_id").eq("obra_id", obraId),
    supabase.from("obra_actividades").select("id,codigo").eq("obra_id", obraId),
  ]);
  const plan = loQueFaltaAgrupar({ ordenes: ordenes || [], rubros: rubros || [], actividades: actividades || [] });
  if (!plan.mover.length) return 0;

  let creadas = [];
  if (plan.crear.length) {
    const { data, error: e1 } = await supabase.from("obra_actividades")
      .insert(plan.crear.map(a => ({ obra_id: obraId, ...a, origen: ORIGEN_ORDEN }))).select("id,codigo");
    if (e1) return 0;
    creadas = data || [];
  }

  let movidos = 0;
  for (const m of plan.mover) {
    const id = m.actividadId ?? creadas.find(a => a.codigo === m.codigo)?.id;
    if (!id) continue;
    // Solo los que siguen sin agrupación: si entre la consulta y esto alguien
    // los acomodó, lo suyo vale.
    const { error: e2 } = await supabase.from("obra_rubros")
      .update({ actividad_id: id }).in("id", m.rubros).is("actividad_id", null);
    if (!e2) movidos += m.rubros.length;
  }
  return movidos;
}
