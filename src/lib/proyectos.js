// La lista de proyectos, una sola, para todas las pantallas: la del pipeline
// —los que se persiguen y los aprobados—.
//
// "Proyecto" vivía en dos tablas —los del pipeline y una lista vieja en
// Ajustes— y cada pantalla elegía una: un proyecto existía o no según dónde lo
// buscaras. La lista vieja se fue en la fase 6 de la reingeniería.
//
// Cada entrada trae una `clave` (`l7`) para usar en un selector.

/** Los proyectos del pipeline, como los usan las pantallas. */
export function unirProyectos(leads = [], accesos = {}) {
  return leads
    .filter(l => l.resultado !== "perdido")
    .map(l => ({
      clave: `l${l.id}`, id: l.id, esLead: true, name: l.nombre, nombre: l.nombre,
      color: l.color || null,
      gente: Object.keys(accesos[l.id] || {}).map(Number),
      niveles: accesos[l.id] || {},
      creador: l.created_by, obra_id: l.obra_id || null,
    }))
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
}

/** De qué proyecto es una tarea, venga de donde venga. */
export const claveDeTarea = t => (t?.lead_id ? `l${t.lead_id}` : t?.project_id ? `p${t.project_id}` : "");

/** Lo que hay que guardar en la tarea según el proyecto elegido. */
export const comoSeGuarda = proyecto => (proyecto
  ? (proyecto.esLead ? { lead_id: proyecto.id, project_id: null } : { project_id: proyecto.id, lead_id: null })
  : { lead_id: null, project_id: null });
