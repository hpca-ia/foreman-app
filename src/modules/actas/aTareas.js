import { supabase } from "../../lib/supabase";

// Del compromiso del acta a la tarea de quien lo tiene que hacer.
//
// Un compromiso vive dentro del acta. El tablero donde la gente mira lo que le
// toca cada día es otro, y ahí no aparece: "Lizeth queda en pedir la proforma
// para el viernes" depende de que Lizeth se acuerde, o de que alguien se lo
// pregunte en la reunión siguiente — que es cuando ya es tarde.
//
// SE CREAN AL DAR EL VISTO, no antes. Mientras el acta es borrador lo escrito
// todavía se puede cambiar, y una tarea que aparece y desaparece del tablero
// de alguien es peor que ninguna.
//
// Y SOLO LAS ASIGNADAS. El proveedor de ascensores y la fiscalización no
// tienen cuenta acá; una tarea en el tablero de nadie es ruido. Esos
// compromisos siguen viviendo en el acta, que es donde se les reclama.

const ESTADO_NUEVO = "en-progreso";

/** Los que van a convertirse en tarea: asignados y sin una tarea ya creada. */
export function paraTarea(compromisos = []) {
  return compromisos.filter(c => c.asignado_a && !c.tarea_id && c.estado !== "cumplido" && c.estado !== "anulado");
}

export async function crearTareas({ compromisos = [], acta, lead, quien }) {
  const van = paraTarea(compromisos);
  if (!van.length) return { creadas: 0 };
  const hechas = [];
  for (const c of van) {
    const { data, error } = await supabase.from("tasks").insert({
      title: c.texto.slice(0, 200),
      lead_id: lead?.id ?? null,
      assignee_id: c.asignado_a,
      // Un tipo de los que el tablero ya conoce. "Obra" no existe en la lista
      // y la tarea aparecía sin tipo, fuera de los filtros con los que la
      // gente mira su día.
      type: "Gestión",
      due_date: c.fecha_limite || null,
      // Lo urgente del acta es lo que detiene a los demás: entra como alta.
      priority: c.urgente ? "urgente" : "media",
      status: ESTADO_NUEVO,
      // De dónde salió. Sin esto, dentro de un mes nadie sabe por qué está esa
      // tarea ahí ni con quién discutirla.
      notes: `Compromiso del acta de reunión N° ${acta.numero}${acta.fecha ? ` del ${acta.fecha}` : ""}`
        + (c.responsable_nombre ? `\nResponsable según el acta: ${c.responsable_nombre}` : ""),
      created_by: quien?.id ?? null,
    }).select("id").single();
    if (error) return { error: error.message, creadas: hechas.length };
    await supabase.from("acta_compromisos").update({ tarea_id: data.id }).eq("id", c.id);
    hechas.push(data.id);
  }
  return { creadas: hechas.length };
}

/**
 * Qué pasó con las tareas que salieron de este acta.
 *
 * Es lo que deja que el repaso de la próxima reunión diga "ya se hizo" sin que
 * nadie lo marque dos veces: el que la hizo la cerró en su tablero, que es
 * donde trabaja, y el acta se entera sola.
 */
export async function estadoDeTareas(compromisos = []) {
  const ids = compromisos.map(c => c.tarea_id).filter(Boolean);
  if (!ids.length) return {};
  const { data } = await supabase.from("tasks").select("id,status,title,due_date").in("id", ids);
  const por = {};
  (data || []).forEach(t => { por[t.id] = t; });
  return por;
}

/** Una tarea cerrada da por cumplido su compromiso al arrastrarlo. */
export function yaSeHizo(c, tareas = {}) {
  const t = c.tarea_id ? tareas[c.tarea_id] : null;
  if (!t) return false;
  return t.status === "listo";
}
