import { supabase } from "./supabase";

// Unir dos entradas del pipeline que son el mismo trabajo.
//
// Pasaba así: un lead se perseguía, se le hacía el presupuesto, el presupuesto
// se aprobaba y se activaba como obra… y el pipeline creaba un proyecto nuevo
// con el nombre de la obra. Quedaban dos: el lead con toda su historia y un
// proyecto recién nacido. La causa está arreglada —ahora la obra se engancha
// al lead del que vino—, pero los duplicados de antes siguen ahí y hay que
// poder juntarlos sin entrar a la base a mano.
//
// Unir no borra trabajo: todo lo que cuelga del duplicado —obra, presupuestos,
// caja chica, tareas, compras, libro, gente, bitácora— pasa al que se queda, y
// recién entonces se borra la cáscara vacía. Lo único que no viaja son sus
// etapas y su checklist: el que se queda ya tiene los suyos, y dos tubos
// pegados no son un tubo.

/** Las tablas que apuntan a un proyecto y el nombre de su columna. */
const COLGADO_DE = [
  ["obras", "lead_id"],
  ["presupuestos", "lead_id"],
  ["proyectos", "lead_id"],
  ["cajas_chicas", "lead_id"],
  ["tasks", "lead_id"],
  ["compras_solicitudes", "lead_id"],
  ["libro_obra_dias", "lead_id"],
  ["lead_movimientos", "lead_id"],
  ["pipeline_invitados", "lead_id"],
];

const noExiste = e => /relation|column|does not exist|schema cache/i.test(e?.message || "");

/**
 * Pasa todo lo del proyecto `de` al proyecto `a`, y borra `de`.
 *
 * @returns { ok, movido: {tabla: n}, avisos: string[] } o { error }
 */
export async function fusionarLead(de, a) {
  if (!de?.id || !a?.id || de.id === a.id) return { error: "Hay que elegir dos proyectos distintos." };

  const movido = {};
  const avisos = [];

  for (const [tabla, columna] of COLGADO_DE) {
    const { data, error } = await supabase.from(tabla)
      .update({ [columna]: a.id }).eq(columna, de.id).select("id");
    if (error) {
      // Una tabla que todavía no existe en esta base no es un problema: la
      // migración que la trae puede no haberse corrido.
      if (noExiste(error)) continue;
      // El libro tiene un día por proyecto y por fecha: si los dos escribieron
      // el mismo día, ese día no puede mudarse encima del otro.
      avisos.push(`${tabla}: ${error.message}`);
      continue;
    }
    if (data?.length) movido[tabla] = data.length;
  }

  // Quién entra al proyecto: se lleva lo del duplicado solo para quien todavía
  // no estaba, y con el nivel más alto de los dos. Unir no le puede quitar
  // permisos a nadie ni dárselos por sorpresa.
  const { data: accesos } = await supabase.from("lead_accesos").select("*").in("lead_id", [de.id, a.id]);
  const delQueSeVa = (accesos || []).filter(x => x.lead_id === de.id);
  const delQueQueda = new Map((accesos || []).filter(x => x.lead_id === a.id).map(x => [x.usuario_id, x]));
  for (const fila of delQueSeVa) {
    if (!delQueQueda.has(fila.usuario_id)) {
      const { id, ...resto } = fila;
      await supabase.from("lead_accesos").insert({ ...resto, lead_id: a.id });
      movido.lead_accesos = (movido.lead_accesos || 0) + 1;
    }
  }
  await supabase.from("lead_accesos").delete().eq("lead_id", de.id);

  // La obra, si el que se queda no tenía una.
  const campos = { actualizado_at: new Date().toISOString() };
  if (de.obra_id && !a.obra_id) campos.obra_id = de.obra_id;
  if (de.resultado === "ganado" && a.resultado !== "ganado") campos.resultado = "ganado";
  await supabase.from("leads").update(campos).eq("id", a.id);

  await supabase.from("lead_movimientos").insert({
    lead_id: a.id, tipo: "nota", automatico: true,
    detalle: `Se unió con “${de.nombre}”, que era el mismo trabajo cargado dos veces.`,
  });

  const { error } = await supabase.from("leads").delete().eq("id", de.id);
  if (error) return { error: `Se movió todo, pero no se pudo borrar “${de.nombre}”: ${error.message}` };

  return { ok: true, movido, avisos };
}

/**
 * Los pares que parecen el mismo trabajo cargado dos veces.
 *
 * Se miran dos pistas, las dos del mismo origen: un proyecto que nació de una
 * obra cuyo presupuesto era de otro proyecto, y nombres que se parecen
 * demasiado. Es una sospecha para revisar, no una decisión.
 */
export function duplicadosProbables(leads = [], presupuestos = [], obras = []) {
  const pares = [];
  const porObra = new Map(obras.map(o => [o.id, o]));
  const leadDePresupuesto = new Map(presupuestos.filter(p => p.lead_id).map(p => [p.id, p.lead_id]));

  for (const l of leads) {
    if (!l.obra_id) continue;
    const obra = porObra.get(l.obra_id);
    if (!obra) continue;
    const origen = obra.lead_id || leadDePresupuesto.get(obra.presupuesto_id);
    if (origen && origen !== l.id && leads.some(x => x.id === origen)) pares.push({ nuevo: l.id, original: origen, porque: "la obra venía de otro proyecto" });
  }

  const limpio = t => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(p => p.length > 3);
  for (let i = 0; i < leads.length; i++) {
    for (let j = i + 1; j < leads.length; j++) {
      if (pares.some(p => (p.nuevo === leads[i].id && p.original === leads[j].id) || (p.nuevo === leads[j].id && p.original === leads[i].id))) continue;
      const a = limpio(leads[i].nombre), b = limpio(leads[j].nombre);
      if (!a.length || !b.length) continue;
      // Dos palabras propias compartidas y que sean buena parte del nombre más
      // corto. Antes se pedía casi calzar entero y se escapaban los pares
      // donde uno de los dos arrastra media frase ("IMPLEMENTACIÓN … GUAYAQUIL").
      const comunes = a.filter(p => b.includes(p)).length;
      if (comunes >= 2 && comunes >= Math.min(a.length, b.length) * 0.5) {
        pares.push({ nuevo: leads[j].id, original: leads[i].id, porque: "se llaman casi igual" });
      }
    }
  }
  return pares;
}
