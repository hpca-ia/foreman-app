import { supabase } from "../../lib/supabase";
import { barraCopiada, etapaCopiada, plazoCopiado } from "./copiaDeCronograma";

// Copiar el cronograma de un presupuesto al proyecto de su obra. Qué se copia
// y cómo se decide en `copiaDeCronograma.js`; acá solo se lee y se escribe.

const falta = e => /relation|column|does not exist|schema cache/i.test(e?.message || "");

/** ¿El presupuesto tiene cronograma? ¿Y el proyecto? Para decidir sin escribir nada. */
export async function quienTieneCronograma({ presupuestoId, leadId }) {
  const [pre, pro] = await Promise.all([
    supabase.from("cronograma_actividades").select("id", { count: "exact", head: true }).eq("presupuesto_id", presupuestoId),
    supabase.from("cronograma_actividades").select("id", { count: "exact", head: true }).eq("lead_id", leadId),
  ]);
  if (pre.error) return { faltaMigracion: falta(pre.error) ? "124" : null, error: pre.error.message };
  return { delPresupuesto: pre.count || 0, delProyecto: pro.count || 0 };
}

/**
 * Copia barras, etapas, dependencias y plazo del presupuesto al proyecto.
 *
 * SIN PISAR. Si el proyecto ya tiene cronograma no se hace nada, salvo que se
 * pida `reemplazar` —y entonces quien lo pide ya guardó una versión del que
 * había—. Copia, no mueve: el presupuesto conserva el suyo.
 *
 * @returns { copiadas, yaTenia, faltaMigracion, error }
 */
export async function copiarCronogramaDelPresupuesto({ presupuestoId, leadId, obraId = null, reemplazar = false }) {
  if (!presupuestoId || !leadId) return { copiadas: 0 };
  const { data: barras, error: eB } = await supabase.from("cronograma_actividades")
    .select("*").eq("presupuesto_id", presupuestoId).order("orden");
  if (eB) return { copiadas: 0, faltaMigracion: falta(eB) ? "124" : null, error: falta(eB) ? null : eB.message };
  if (!barras?.length) return { copiadas: 0 };

  const { count: ya } = await supabase.from("cronograma_actividades")
    .select("id", { count: "exact", head: true }).eq("lead_id", leadId);
  if (ya && !reemplazar) return { copiadas: 0, yaTenia: true };
  if (ya && reemplazar) {
    // Los rubros del control que estaban puestos en una barra de las que se
    // van quedan sin parte: apuntar a una barra que ya no existe es peor que
    // no apuntar a ninguna. Se vuelven a repartir sobre las nuevas.
    if (obraId) {
      const { data: viejas } = await supabase.from("cronograma_actividades").select("id").eq("lead_id", leadId);
      const ids = (viejas || []).map(x => x.id);
      if (ids.length) await supabase.from("obra_rubros").update({ crono_actividad_id: null }).eq("obra_id", obraId).in("crono_actividad_id", ids);
    }
    // Las dependencias se van con sus barras (on delete cascade).
    const { error: eD } = await supabase.from("cronograma_actividades").delete().eq("lead_id", leadId);
    if (eD) return { copiadas: 0, error: "No se pudo quitar el cronograma anterior: " + eD.message };
    await supabase.from("cronograma_fases").delete().eq("lead_id", leadId);
  }

  // ── Las etapas, primero: las barras apuntan a ellas ──
  const nuevaFase = new Map();
  const { data: fases } = await supabase.from("cronograma_fases").select("*").eq("presupuesto_id", presupuestoId).order("orden");
  for (const f of fases || []) {
    const { data } = await supabase.from("cronograma_fases").insert(etapaCopiada(f, { leadId })).select("id").single();
    if (data) nuevaFase.set(f.id, data.id);
  }

  // ── Las barras, de a una: cada una devuelve su id nuevo, y con eso se
  // reapuntan la barra padre y las dependencias. Un insert de todas juntas
  // no garantiza en qué orden vuelven, y un error ahí cruzaría dependencias.
  const nuevaBarra = new Map();
  for (const a of barras) {
    const fila = barraCopiada(a, { leadId, obraId, faseId: a.fase_id != null ? nuevaFase.get(a.fase_id) ?? null : null });
    const { data, error } = await supabase.from("cronograma_actividades").insert(fila).select("id").single();
    if (error) return { copiadas: nuevaBarra.size, error: `Se copiaron ${nuevaBarra.size} de ${barras.length} barras: ${error.message}` };
    nuevaBarra.set(a.id, data.id);
  }
  await Promise.all(barras.filter(a => a.padre_id != null && nuevaBarra.has(a.padre_id)).map(a =>
    supabase.from("cronograma_actividades").update({ padre_id: nuevaBarra.get(a.padre_id) }).eq("id", nuevaBarra.get(a.id))));

  // ── Las dependencias, con los ids nuevos de las dos puntas ──
  const { data: deps } = await supabase.from("cronograma_dependencias")
    .select("actividad_id,depende_de_id,tipo,retardo").in("actividad_id", barras.map(a => a.id));
  const filasDep = (deps || [])
    .filter(d => nuevaBarra.has(d.actividad_id) && nuevaBarra.has(d.depende_de_id))
    .map(d => ({ actividad_id: nuevaBarra.get(d.actividad_id), depende_de_id: nuevaBarra.get(d.depende_de_id), tipo: d.tipo, retardo: d.retardo }));
  if (filasDep.length) await supabase.from("cronograma_dependencias").insert(filasDep);

  // ── El plazo y el calendario, y de qué presupuesto salió ──
  const { data: pre } = await supabase.from("presupuestos").select("*").eq("id", presupuestoId).maybeSingle();
  const plazo = plazoCopiado(pre);
  if (Object.keys(plazo).length) await supabase.from("leads").update(plazo).eq("id", leadId);
  await supabase.from("leads").update({ crono_presupuesto_id: presupuestoId }).eq("id", leadId);

  return { copiadas: nuevaBarra.size };
}
