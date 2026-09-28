import { supabase } from "./supabase";

// Toda obra es un proyecto: la que nació de una oportunidad y la que entró
// directo con su Excel. Si una obra no tiene su proyecto en el pipeline, la
// oficina termina mirando dos listas distintas de lo mismo, y la historia de
// cómo llegó ese trabajo se pierde justo cuando empieza a costar plata.
//
// Y al revés duele más: crear un proyecto nuevo para una obra que YA venía de
// un lead deja el pipeline con el mismo trabajo dos veces —el lead viejo con
// toda su historia, y un proyecto recién nacido con el mismo nombre—. Por eso
// acá primero se busca de quién viene la obra, por los tres caminos que
// existen, y solo se crea cuando de verdad no viene de ningún lado.

/** El lead del que viene esta obra, si viene de alguno. */
async function deDondeViene(obra) {
  // 1. Ya hay un proyecto apuntando a esta obra.
  const { data: ya } = await supabase.from("leads").select("*").eq("obra_id", obra.id).maybeSingle();
  if (ya) return { lead: ya, yaEstaba: true };

  // 2. La obra se activó desde un presupuesto que era de un proyecto.
  if (obra.lead_id) {
    const { data } = await supabase.from("leads").select("*").eq("id", obra.lead_id).maybeSingle();
    if (data) return { lead: data, yaEstaba: false };
  }

  // 3. Lo mismo, pero leído del presupuesto: una obra vieja puede no tener
  //    `lead_id` propio —la columna llegó después— y su presupuesto sí.
  if (obra.presupuesto_id) {
    const { data: pre } = await supabase.from("presupuestos").select("lead_id").eq("id", obra.presupuesto_id).maybeSingle();
    if (pre?.lead_id) {
      const { data } = await supabase.from("leads").select("*").eq("id", pre.lead_id).maybeSingle();
      if (data) return { lead: data, yaEstaba: false };
    }
  }
  return { lead: null, yaEstaba: false };
}

/**
 * El proyecto de una obra: el que ya existe, o uno nuevo si no hay ninguno.
 *
 * Cuando la obra viene de un lead, ese lead ES el proyecto: se le engancha la
 * obra y pasa a ejecución, con su historia entera. No se clona.
 */
export async function asegurarProyecto(obra, usuario) {
  if (!obra?.id) return null;

  const { lead, yaEstaba } = await deDondeViene(obra);
  if (lead && yaEstaba) return lead;

  if (lead) {
    // El lead se gana y se pone a ejecutar. El túnel no se toca acá: cambiarlo
    // le rearma las etapas, y eso lo decide él en el pipeline, no un botón de
    // Control de Obra.
    await supabase.from("leads").update({
      obra_id: obra.id,
      resultado: "ganado",
      actualizado_at: new Date().toISOString(),
    }).eq("id", lead.id);
    await supabase.from("lead_movimientos").insert({
      lead_id: lead.id, tipo: "nota", automatico: true,
      detalle: `Se aprobó el presupuesto y entró a ejecución como obra “${obra.nombre}”.`,
      autor_id: usuario?.id ?? null, autor_nombre: usuario?.name || null,
    });
    return { ...lead, obra_id: obra.id, resultado: "ganado" };
  }

  // No viene de ningún lado: una obra que entró directo con su Excel.
  const { data: nuevo, error } = await supabase.from("leads").insert({
    nombre: obra.nombre,
    contacto: obra.cliente_nombre || null,
    etapa: "ejecucion",
    obra_id: obra.id,
    created_by: usuario?.id ?? null,
    actualizado_at: new Date().toISOString(),
  }).select().single();
  if (error || !nuevo) return null;

  // Nace con su etapa en curso: el proyecto ya está en ejecución, no arrancando.
  await supabase.from("lead_etapas").insert({
    lead_id: nuevo.id, etapa_id: "ejecucion", orden: 1, estado: "en_curso",
    responsable_id: usuario?.id ?? null, responsable_nombre: usuario?.name || null,
  });
  await supabase.from("lead_movimientos").insert({
    lead_id: nuevo.id, tipo: "nota", automatico: true,
    detalle: "Entró al pipeline en ejecución: viene de Control de Obra.",
    autor_id: usuario?.id ?? null, autor_nombre: usuario?.name || null,
  });
  return nuevo;
}

/** Las obras que todavía no tienen proyecto en el pipeline. */
export async function obrasSueltas() {
  const [{ data: obras }, { data: leads }] = await Promise.all([
    supabase.from("obras").select("id,nombre,cliente_nombre,lead_id,presupuesto_id").order("created_at", { ascending: false }),
    supabase.from("leads").select("obra_id").not("obra_id", "is", null),
  ]);
  const conProyecto = new Set((leads || []).map(l => l.obra_id));
  return (obras || []).filter(o => !conProyecto.has(o.id));
}
