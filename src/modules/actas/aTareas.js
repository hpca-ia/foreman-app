import { supabase } from "../../lib/supabase";
import { paraTarea, tareaDelCompromiso, alCerrarLaTarea, quienLoSigue } from "./compromisos.js";

// Del compromiso del acta a la bandeja de quien lo tiene que seguir.
//
// Un compromiso vive dentro del acta. La bandeja donde la gente mira lo que le
// toca cada día es otra, y ahí no aparecía: "Lizeth queda en pedir la proforma
// para el viernes" dependía de que Lizeth se acordara, o de que alguien se lo
// preguntara en la reunión siguiente — que es cuando ya es tarde.
//
// SE CREAN AL DAR EL VISTO, no antes. Mientras el acta es borrador lo escrito
// todavía se puede cambiar, y una tarea que aparece y desaparece de la bandeja
// de alguien es peor que ninguna.
//
// Y LAS QUE TIENEN QUIÉN LAS SIGA. Si lo sigue alguien del equipo, es su
// tarea. Si es de un tercero —el cliente, la fiscalización, el proveedor—,
// nadie del equipo la hace, pero alguien la tiene que reclamar: queda en
// «Espero de otros» de quien lleva el proyecto. Las que no tienen a nadie
// elegido siguen viviendo solo en el acta.
//
// Las reglas —qué tarea le toca a cada una— están en compromisos.js.

export { paraTarea };

const SIN_173 = "Falta correr la migración 173 en Supabase.";
const falta = e => /tercero|column|schema cache/i.test(e?.message || "");

/** Crea la tarea de un compromiso y la deja enganchada. @returns { tarea } | { error } | {} si no le toca */
export async function crearTareaDe(c, { acta, lead, quien }) {
  const fila = tareaDelCompromiso({ c, acta, lead, quien });
  if (!fila) return {};
  // La tabla exige quién la creó: si no hay nadie más, quien abrió el proyecto.
  if (fila.created_by == null) fila.created_by = lead?.created_by ?? null;
  const { data, error } = await supabase.from("tasks").insert(fila).select("id").single();
  if (error) return { error: error.message };
  await supabase.from("acta_compromisos").update({ tarea_id: data.id }).eq("id", c.id);
  return { tarea: data };
}

/** @returns { creadas, delEquipo, deTerceros } o { error, creadas } */
export async function crearTareas({ compromisos = [], acta, lead, quien }) {
  const van = paraTarea(compromisos);
  let delEquipo = 0, deTerceros = 0;
  for (const c of van) {
    const r = await crearTareaDe(c, { acta, lead, quien });
    if (r.error) return { error: r.error, creadas: delEquipo + deTerceros };
    if (r.tarea) { if (quienLoSigue(c) === "equipo") delEquipo++; else deTerceros++; }
  }
  return { creadas: delEquipo + deTerceros, delEquipo, deTerceros };
}

/**
 * Cerrar —o reabrir— el compromiso en el acta hace lo mismo con su tarea: no
 * puede quedar hecho en el acta y pendiente en la bandeja de alguien.
 */
export async function cerrarTareaDe(c, estado, quien) {
  if (!c?.tarea_id) return null;
  const campos = alCerrarLaTarea(estado, quien?.name || null);
  let { error } = await supabase.from("tasks").update(campos).eq("id", c.tarea_id);
  // Sin la migración 172 no existe `descartada`: se cierra igual, sin la marca.
  if (error && /descartada/.test(error.message)) {
    const { descartada, ...resto } = campos;
    ({ error } = await supabase.from("tasks").update(resto).eq("id", c.tarea_id));
  }
  return error ? error.message : null;
}

/** Decir quién sigue un compromiso. @returns el error, si lo hubo */
export async function decirQuienLoSigue(c, decision) {
  let { error } = await supabase.from("acta_compromisos").update(decision).eq("id", c.id);
  // Sin la migración 173 no existe `tercero`. Elegir a alguien del equipo no
  // la necesita: se guarda igual. Elegir «un tercero» sí, y se dice.
  if (error && falta(error) && !decision.tercero) {
    ({ error } = await supabase.from("acta_compromisos").update({ asignado_a: decision.asignado_a }).eq("id", c.id));
  }
  return error ? (falta(error) ? SIN_173 : error.message) : null;
}

/** Todos los compromisos de las actas de un proyecto, para saber cuáles siguen abiertos de verdad. */
export async function compromisosDelProyecto(actas = []) {
  if (!actas.length) return [];
  const { data, error } = await supabase.from("acta_compromisos").select("*").in("acta_id", actas.map(a => a.id)).order("orden");
  return error ? [] : data || [];
}

/**
 * Qué pasó con las tareas que salieron de este acta.
 *
 * Es lo que deja que el repaso de la próxima reunión diga "ya se hizo" sin que
 * nadie lo marque dos veces: el que la hizo la cerró en su bandeja, que es
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
