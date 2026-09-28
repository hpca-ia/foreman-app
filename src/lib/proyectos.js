import { supabase } from "./supabase";

// La lista de proyectos, una sola, para todas las pantallas.
//
// "Proyecto" vivía en dos tablas —los del pipeline y los de Ajustes— y cada
// pantalla elegía una: el tablero mostraba los de Ajustes, Compras los del
// pipeline, la tarea nueva solo los de Ajustes. El resultado era que un
// proyecto existía o no según dónde lo buscaras.
//
// Acá se unen. Cada entrada trae una `clave` (`l7` o `p3`) para usar en un
// selector sin que se pisen los números, y dice de qué tabla viene para que
// quien guarda sepa si va en `lead_id` o en `project_id`.

/** Une las dos listas. Los de Ajustes ya empatados no se repiten: son el mismo. */
export function unirProyectos(leads = [], ajustes = [], accesos = {}) {
  const delPipeline = leads
    .filter(l => l.resultado !== "perdido")
    .map(l => ({
      clave: `l${l.id}`, id: l.id, esLead: true, name: l.nombre, nombre: l.nombre,
      color: l.color || null,
      gente: Object.keys(accesos[l.id] || {}).map(Number),
      niveles: accesos[l.id] || {},
      creador: l.created_by, obra_id: l.obra_id || null,
    }));
  const deAjustes = ajustes
    .filter(p => !p.lead_id)
    .map(p => ({
      clave: `p${p.id}`, id: p.id, esLead: false, name: p.name || p.nombre, nombre: p.name || p.nombre,
      color: p.color || null, gente: p.miembros || [], creador: null, obra_id: p.obra_id || null,
    }));
  return [...delPipeline, ...deAjustes].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
}

/** Los trae de la base, ya unidos. Para las pantallas que no los tienen a mano. */
export async function cargarProyectos() {
  const [{ data: leads }, { data: ajustes }, { data: accesos }] = await Promise.all([
    supabase.from("leads").select("id,nombre,color,resultado,created_by,obra_id").order("nombre"),
    supabase.from("proyectos").select("*").eq("activo", true),
    supabase.from("lead_accesos").select("lead_id,usuario_id"),
  ]);
  const mapa = {};
  (accesos || []).forEach(a => { (mapa[a.lead_id] = mapa[a.lead_id] || []).push(a.usuario_id); });
  return unirProyectos(leads || [], ajustes || [], mapa);
}

/** De qué proyecto es una tarea, venga de donde venga. */
export const claveDeTarea = t => (t?.lead_id ? `l${t.lead_id}` : t?.project_id ? `p${t.project_id}` : "");

/** Lo que hay que guardar en la tarea según el proyecto elegido. */
export const comoSeGuarda = proyecto => (proyecto
  ? (proyecto.esLead ? { lead_id: proyecto.id, project_id: null } : { project_id: proyecto.id, lead_id: null })
  : { lead_id: null, project_id: null });
