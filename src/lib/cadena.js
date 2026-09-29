import { supabase } from "./supabase";

// La cadena: proyecto → presupuesto → obra.
//
// Es una sola cosa en tres momentos. El trabajo nace en el pipeline con un
// nombre, después se le hace un presupuesto —que puede llamarse como quiera,
// "Base", "Adicional 2", "Implementación tal"— y si se aprueba pasa a Control
// de Obra. Sigue siendo el mismo trabajo todo el tiempo.
//
// El error que se venía arrastrando era COPIAR en cada paso en vez de DERIVAR:
// la obra se guardaba con su propio nombre copiado del presupuesto, y el
// enlace al proyecto era opcional. Entonces renombrar el presupuesto no movía
// nada, una obra podía quedar sin proyecto, y la misma obra se leía con tres
// nombres distintos según la pantalla. De ahí salían los "proyectos
// duplicados" y los permisos que no alcanzaban.
//
// Acá la regla es una: **el proyecto es la identidad**. El presupuesto y la
// obra cuelgan de él y no guardan una copia de quiénes son; su nombre propio
// es una etiqueta, no un nombre aparte.

/** Cómo se llama esto en pantalla: manda el proyecto, y el resto es detalle. */
export function comoSeLlama({ proyecto, presupuesto, obra }) {
  const titulo = proyecto?.nombre || obra?.nombre || presupuesto?.nombre || "Sin nombre";
  const detalle = [];
  if (presupuesto?.nombre && presupuesto.nombre !== titulo) detalle.push(presupuesto.nombre);
  else if (obra?.nombre && obra.nombre !== titulo) detalle.push(obra.nombre);
  return { titulo, detalle: detalle.join(" · ") };
}

const noExiste = e => /relation|column|does not exist|schema cache/i.test(e?.message || "");

/**
 * Reengancha lo que quedó suelto, cuando se puede deducir de la cadena.
 *
 * No inventa nada: solo completa el eslabón que falta cuando el de al lado ya
 * lo dice. Una obra sin proyecto cuyo presupuesto sí lo tiene, o un
 * presupuesto sin proyecto cuya obra sí lo tiene. Lo que no se puede deducir
 * vuelve en `sueltos`, para que alguien lo decida a mano.
 *
 * Es barato y se puede correr cada vez que se abre la app.
 */
export async function repararCadena() {
  const [{ data: obras, error: eo }, { data: presupuestos, error: ep }, { data: cajas }] = await Promise.all([
    supabase.from("obras").select("id,nombre,lead_id,presupuesto_id"),
    supabase.from("presupuestos").select("id,nombre,lead_id,archivado_at"),
    supabase.from("cajas_chicas").select("id,proyecto_nombre,lead_id,obra_id"),
  ]);
  if (eo || ep) return { arreglados: 0, sueltos: [], sinColumnas: noExiste(eo) || noExiste(ep) };

  const presupuestoPorId = new Map((presupuestos || []).map(p => [p.id, p]));
  const obraDePresupuesto = new Map((obras || []).filter(o => o.presupuesto_id).map(o => [o.presupuesto_id, o]));
  let arreglados = 0;

  // La obra toma el proyecto de su presupuesto.
  for (const o of obras || []) {
    if (o.lead_id || !o.presupuesto_id) continue;
    const lead = presupuestoPorId.get(o.presupuesto_id)?.lead_id;
    if (!lead) continue;
    const { error } = await supabase.from("obras").update({ lead_id: lead }).eq("id", o.id);
    if (!error) { o.lead_id = lead; arreglados++; }
  }

  // Y el presupuesto, el de su obra.
  for (const p of presupuestos || []) {
    if (p.lead_id) continue;
    const lead = obraDePresupuesto.get(p.id)?.lead_id;
    if (!lead) continue;
    const { error } = await supabase.from("presupuestos").update({ lead_id: lead }).eq("id", p.id);
    if (!error) { p.lead_id = lead; arreglados++; }
  }

  // Y la caja chica, el de su obra: la plata de la obra es de la obra.
  const obraPorId = new Map((obras || []).map(o => [o.id, o]));
  for (const c of cajas || []) {
    if (c.lead_id || !c.obra_id) continue;
    const lead = obraPorId.get(c.obra_id)?.lead_id;
    if (!lead) continue;
    const { error } = await supabase.from("cajas_chicas").update({ lead_id: lead }).eq("id", c.id);
    if (!error) { c.lead_id = lead; arreglados++; }
  }

  // Lo que sigue sin proyecto: nadie puede deducirlo, hay que elegirlo.
  const sueltos = [
    ...(presupuestos || []).filter(p => !p.lead_id && !p.archivado_at).map(p => ({ tipo: "presupuesto", id: p.id, nombre: p.nombre })),
    ...(obras || []).filter(o => !o.lead_id).map(o => ({ tipo: "obra", id: o.id, nombre: o.nombre })),
    ...(cajas || []).filter(c => !c.lead_id).map(c => ({ tipo: "caja chica", id: c.id, nombre: c.proyecto_nombre || `Caja #${c.id}` })),
  ];
  return { arreglados, sueltos, sinColumnas: false };
}

/** Enganchar a mano lo que no se pudo deducir, y arrastrar la cadena entera. */
export async function engancharAlProyecto(cosa, leadId) {
  const id = leadId ? Number(leadId) : null;
  if (cosa.tipo === "presupuesto") {
    await supabase.from("presupuestos").update({ lead_id: id }).eq("id", cosa.id);
    // Su obra —y la caja de esa obra— van con él: son el mismo trabajo.
    const { data: obras } = await supabase.from("obras").select("id").eq("presupuesto_id", cosa.id);
    await supabase.from("obras").update({ lead_id: id }).eq("presupuesto_id", cosa.id);
    for (const o of obras || []) await supabase.from("cajas_chicas").update({ lead_id: id }).eq("obra_id", o.id);
  } else if (cosa.tipo === "obra") {
    const { data: obra } = await supabase.from("obras").select("presupuesto_id").eq("id", cosa.id).maybeSingle();
    await supabase.from("obras").update({ lead_id: id }).eq("id", cosa.id);
    await supabase.from("cajas_chicas").update({ lead_id: id }).eq("obra_id", cosa.id);
    if (obra?.presupuesto_id) await supabase.from("presupuestos").update({ lead_id: id }).eq("id", obra.presupuesto_id);
  } else {
    await supabase.from("cajas_chicas").update({ lead_id: id }).eq("id", cosa.id);
  }
}
