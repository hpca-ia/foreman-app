import { supabase } from "./supabase";

// Toda obra es un proyecto: la que nació de una oportunidad y la que entró
// directo con su Excel. Si una obra no tiene su proyecto en el pipeline, la
// oficina termina mirando dos listas distintas de lo mismo, y la historia de
// cómo llegó ese trabajo se pierde justo cuando empieza a costar plata.

/** Crea el proyecto de una obra si todavía no lo tiene. Devuelve el lead o null. */
export async function asegurarProyecto(obra, usuario) {
  if (!obra?.id) return null;
  const { data: ya } = await supabase.from("leads").select("id").eq("obra_id", obra.id).maybeSingle();
  if (ya) return ya;

  const { data: lead, error } = await supabase.from("leads").insert({
    nombre: obra.nombre,
    contacto: obra.cliente_nombre || null,
    etapa: "ejecucion",
    obra_id: obra.id,
    created_by: usuario?.id ?? null,
    actualizado_at: new Date().toISOString(),
  }).select().single();
  if (error || !lead) return null;

  // Nace con su etapa en curso: el proyecto ya está en ejecución, no arrancando.
  await supabase.from("lead_etapas").insert({
    lead_id: lead.id, etapa_id: "ejecucion", orden: 1, estado: "en_curso",
    responsable_id: usuario?.id ?? null, responsable_nombre: usuario?.name || null,
  });
  await supabase.from("lead_movimientos").insert({
    lead_id: lead.id, tipo: "nota", automatico: true,
    detalle: "Entró al pipeline en ejecución: viene de Control de Obra.",
    autor_id: usuario?.id ?? null, autor_nombre: usuario?.name || null,
  });
  return lead;
}

/** Las obras que todavía no tienen proyecto en el pipeline. */
export async function obrasSueltas() {
  const [{ data: obras }, { data: leads }] = await Promise.all([
    supabase.from("obras").select("id,nombre,cliente_nombre").order("created_at", { ascending: false }),
    supabase.from("leads").select("obra_id").not("obra_id", "is", null),
  ]);
  const conProyecto = new Set((leads || []).map(l => l.obra_id));
  return (obras || []).filter(o => !conProyecto.has(o.id));
}
