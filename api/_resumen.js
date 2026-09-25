// El repaso de cada mañana, armado. Acá no se habla con nadie ni se manda nada:
// solo se decide qué le toca ver a cada quien. Aparte para poder probarlo.
//
// Reglas:
//   · El Director y los admins ven todo: lo de cada persona, lo que nadie tomó
//     y los proyectos sin nada por delante.
//   · Cada quien ve lo suyo, y de sus proyectos lo que aprieta —lo atrasado y
//     lo de hoy—, no la lista entera de los demás.
//   · Lo de ayer también se cuenta: un resumen que solo dice lo que falta se
//     lee como un reproche. Lo que se hizo es la mitad de la noticia.

export const hoyISO = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
export const sumarDias = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return hoyISO(d); };

const ABIERTA = t => t.status !== "listo";
export const claseDe = t => (t?.type === "Reunión" ? "reunion"
  : t?.type === "Gestión" ? "gestion"
  : /^Tarea de /.test(t?.notes || "") ? "tarea"
  : /^(Gestión|Actividad) de /.test(t?.notes || "") ? "gestion"
  : "tarea");

/**
 * @param {object} d  { tareas, usuarios, leads, accesos, miembros, hoy }
 * @returns {Array} un sobre por persona: { usuario, atrasadas, hoy, manana,
 *                  sinFecha, ayer, deSusProyectos, esAdmin, equipo, sinDueno }
 */
export function armarResumen(d) {
  const hoy = d.hoy || hoyISO();
  const manana = sumarDias(hoy, 1);
  // "Lo que cerraste" mira hasta el último día hábil: el lunes eso es el
  // sábado, porque el domingo no se trabaja y el resumen no sale. Si mirara
  // solo ayer, el trabajo del sábado no lo vería nadie.
  const esLunes = new Date(`${hoy}T12:00:00`).getDay() === 1;
  const desde = sumarDias(hoy, esLunes ? -2 : -1);
  const nombreProyecto = id => d.leads.find(l => l.id === id)?.nombre || "";

  // Dónde entra cada persona: sus proyectos del pipeline y los de la lista
  // vieja, mientras las dos convivan.
  const proyectosDe = u => new Set([
    ...d.accesos.filter(a => a.usuario_id === u.id).map(a => a.lead_id),
    ...d.leads.filter(l => l.created_by === u.id || l.responsable_id === u.id).map(l => l.id),
  ]);

  const suyas = (u, lista) => lista.filter(t => t.assignee_id === u.id);
  const conProyecto = t => ({ ...t, proyecto: nombreProyecto(t.lead_id), clase: claseDe(t) });

  const abiertas = d.tareas.filter(ABIERTA);
  const cerradasAyer = d.tareas.filter(t => {
    const cuando = String(t.updated_at || "").slice(0, 10);
    return t.status === "listo" && cuando >= desde && cuando < hoy;
  });

  return d.usuarios
    .filter(u => u.email && u.activo !== false)
    .map(u => {
      const esAdmin = u.rol === "owner" || u.rol === "assistant";
      const mias = suyas(u, abiertas).map(conProyecto);
      const mios = proyectosDe(u);

      const sobre = {
        usuario: u,
        esAdmin,
        atrasadas: mias.filter(t => t.due_date && t.due_date < hoy),
        hoy: mias.filter(t => t.due_date === hoy),
        manana: mias.filter(t => t.due_date === manana),
        sinFecha: mias.filter(t => !t.due_date),
        ayer: suyas(u, cerradasAyer).map(conProyecto),
        // De sus proyectos, solo lo que aprieta y es de otro. Al admin no se lo
        // repetimos: abajo tiene la foto completa del equipo.
        deSusProyectos: esAdmin ? [] : abiertas
          .filter(t => t.assignee_id !== u.id && mios.has(t.lead_id) && t.due_date && t.due_date <= hoy)
          .map(conProyecto),
        equipo: [],
        sinDueno: [],
      };

      if (esAdmin) {
        // La foto completa: qué tiene encima cada uno y qué está sin repartir.
        sobre.equipo = d.usuarios
          .filter(o => o.activo !== false && o.id !== u.id)
          .map(o => {
            const deEl = suyas(o, abiertas).map(conProyecto);
            return {
              persona: o.nombre,
              atrasadas: deEl.filter(t => t.due_date && t.due_date < hoy),
              hoy: deEl.filter(t => t.due_date === hoy),
              abiertas: deEl.length,
              ayer: suyas(o, cerradasAyer).map(conProyecto),
            };
          })
          .filter(x => x.abiertas || x.ayer.length);
        sobre.sinDueno = abiertas.filter(t => !t.assignee_id && !t.responsable_externo).map(conProyecto);
      }
      return sobre;
    })
    .filter(s => s.atrasadas.length || s.hoy.length || s.manana.length || s.ayer.length
      || s.deSusProyectos.length || (s.esAdmin && (s.equipo.length || s.sinDueno.length)));
}
