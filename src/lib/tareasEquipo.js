import { supabase } from "./supabase";

// Tareas de varios, y tareas que esperan a otras.
//
// Una tarea sigue teniendo un responsable principal —de él son los
// recordatorios y de él se cuenta la carga—, pero puede tener acompañantes: el
// plano lo hacen dos, la inspección la hacen el residente y el arquitecto.
//
// Y una tarea puede estar esperando a otra. Eso hoy se resuelve por WhatsApp
// ("no puedo hacer el plano hasta que me pasen el levantamiento") y se pierde.
// Acá quien tiene la tarea crea la que le falta, a nombre de quien
// corresponda, y la suya queda esperando hasta que esa se complete.
//
// Si faltan las tablas (migración 035) nada se rompe: se devuelve vacío y la
// app funciona como antes.

const falta = e => /relation|does not exist|schema cache/i.test(e?.message || "");

// ── Responsables ──────────────────────────────────────────────────────────

/** @returns Map(task_id → [usuario_id]) */
export async function leerResponsables(taskIds = []) {
  if (!taskIds.length) return new Map();
  const { data, error } = await supabase.from("tarea_responsables").select("task_id,usuario_id").in("task_id", taskIds);
  if (error) return new Map();
  const m = new Map();
  (data || []).forEach(r => m.set(r.task_id, [...(m.get(r.task_id) || []), r.usuario_id]));
  return m;
}

/** Deja exactamente esos acompañantes, sin contar al responsable principal. */
export async function guardarResponsables(taskId, usuarioIds = [], principal = null) {
  const ids = [...new Set(usuarioIds.filter(id => id && id !== principal))];
  const { error } = await supabase.from("tarea_responsables").delete().eq("task_id", taskId);
  if (error) return falta(error) ? "falta_migracion" : error.message;
  if (!ids.length) return null;
  const { error: e2 } = await supabase.from("tarea_responsables")
    .insert(ids.map(usuario_id => ({ task_id: taskId, usuario_id })));
  return e2 ? (falta(e2) ? "falta_migracion" : e2.message) : null;
}

// ── Dependencias ──────────────────────────────────────────────────────────

/** @returns { espera: Map(task_id → [depende_de]), destraba: Map(depende_de → [task_id]), filas } */
export async function leerDependencias(taskIds = []) {
  const vacio = { espera: new Map(), destraba: new Map(), filas: [] };
  if (!taskIds.length) return vacio;
  const { data, error } = await supabase.from("tarea_dependencias").select("id,task_id,depende_de")
    .or(`task_id.in.(${taskIds.join(",")}),depende_de.in.(${taskIds.join(",")})`);
  if (error) return vacio;
  const espera = new Map(), destraba = new Map();
  (data || []).forEach(d => {
    espera.set(d.task_id, [...(espera.get(d.task_id) || []), d.depende_de]);
    destraba.set(d.depende_de, [...(destraba.get(d.depende_de) || []), d.task_id]);
  });
  return { espera, destraba, filas: data || [] };
}

/**
 * Lo que le falta a una tarea para poder hacerse: se crea la tarea que falta,
 * a nombre de quien tiene que hacerla, y la que espera queda bloqueada.
 * @returns { tarea } o { error }
 */
export async function pedirLoQueFalta({ tareaQueEspera, nueva, creadaPor }) {
  const { data: creada, error } = await supabase.from("tasks").insert({
    title: nueva.title, project_id: nueva.project_id ?? null, assignee_id: nueva.assignee_id ?? null,
    type: nueva.type || "Otro", due_date: nueva.due_date || null, priority: nueva.priority || "alta",
    status: "en-progreso", notes: nueva.notes || null, created_by: creadaPor ?? null,
  }).select().single();
  if (error) return { error: error.message };

  const { error: e2 } = await supabase.from("tarea_dependencias")
    .insert({ task_id: tareaQueEspera, depende_de: creada.id, creada_por: creadaPor ?? null });
  if (e2) return { tarea: creada, error: falta(e2) ? "Falta correr la migración 035: la tarea se creó, pero no quedó ligada." : e2.message };

  // La que espera queda pausada: no se puede avanzar hasta que llegue lo otro.
  await supabase.from("tasks").update({ status: "bloqueado" }).eq("id", tareaQueEspera);
  return { tarea: creada };
}

export async function quitarDependencia(id) {
  const { error } = await supabase.from("tarea_dependencias").delete().eq("id", id);
  return error ? error.message : null;
}

/**
 * Al completar una tarea, las que la esperaban se destraban solas si ya no les
 * falta nada más. Esperar a que alguien se acuerde de volver a moverlas es
 * pedir demasiado.
 * @returns [id] de las tareas que se destrabaron
 */
export async function destrabarLasQueEsperaban(taskIdCompletada) {
  const { data: ligadas, error } = await supabase.from("tarea_dependencias").select("task_id").eq("depende_de", taskIdCompletada);
  if (error || !ligadas?.length) return [];
  const destrabadas = [];
  for (const { task_id } of ligadas) {
    const { data: suyas } = await supabase.from("tarea_dependencias").select("depende_de").eq("task_id", task_id);
    const ids = (suyas || []).map(x => x.depende_de);
    if (!ids.length) continue;
    const { data: tareas } = await supabase.from("tasks").select("id,status").in("id", ids);
    if ((tareas || []).some(t => t.status !== "listo")) continue;      // todavía le falta algo más
    const { data: yo } = await supabase.from("tasks").select("status").eq("id", task_id).single();
    if (yo?.status !== "bloqueado") continue;
    await supabase.from("tasks").update({ status: "en-progreso" }).eq("id", task_id);
    destrabadas.push(task_id);
  }
  return destrabadas;
}
