// LA BANDEJA: UNA LISTA DE PENDIENTES QUE SE PUEDA CREER.
//
// Lo que había: 23 tareas abiertas, 16 vencidas, casi todas «urgentes». Once
// eran pasos de compras copiados como tarea. Una lista donde todo está en rojo
// y es urgente se aprende a ignorar, que es lo peor que le puede pasar a una
// lista de pendientes.
//
// Cómo queda (docs/reingenieria-pipeline-tareas.md, fase 4):
//
//   · DOS PARTES. «Me toca» es lo que tengo que hacer yo. «Espero de otros» es
//     lo que le encargué a alguien, lo mío que ya depende de un tercero, y los
//     leads que esperan respuesta del cliente. Lo segundo no es trabajo mío de
//     hoy, pero tampoco puede perderse de vista.
//   · LO VENCIDO PIDE UNA DECISIÓN, de un toque: nueva fecha, delegarla, o «ya
//     no va». No se queda en rojo esperando.
//   · MANDA LA FECHA. «Urgente» no existe: con todo urgente, nada lo es.
//   · LAS COMPRAS NO SON TAREAS. Se siguen en Compras, y acá aparecen como un
//     aviso que lleva ahí. La fila que el circuito de compras deja en `tasks`
//     sigue existiendo —de ella sale el correo con los botones de aprobar—,
//     pero no se lista como pendiente de nadie.
//
// Sin base ni pantalla: se puede probar. La copia que usa el correo de la
// mañana está en api/_resumen.js; pruebas/bandeja.test.mjs cuida que las dos
// separen lo mismo.

import { estadoDelLead, loQueDice, sePersigue, sumarDias, hoyISO } from "../modules/leads/pipeline.js";

const dia = f => String(f || "").slice(0, 10);
const mismo = (a, b) => a != null && b != null && String(a) === String(b);
const porFecha = (a, b) => (dia(a.due_date) || "9999").localeCompare(dia(b.due_date) || "9999") || Number(a.id) - Number(b.id);

/** El aviso que deja el circuito de compras: no es una tarea de nadie. */
export const esDeCompras = t => !!t?.compra_id || t?.type === "Compra" || /^Gestión de compras/.test(t?.notes || "");

/** Las tareas de verdad: todo menos los avisos de compras. */
export const sinCompras = (tareas = []) => tareas.filter(t => !esDeCompras(t));

const abierta = t => t.status !== "listo";

/**
 * La bandeja de una persona.
 *
 * @param tareas        todas las que puede ver
 * @param acompanantes  Map tarea → [usuarios que la acompañan]: si la puedo
 *                      mover, es mía
 * @param leads         los leads del pipeline (para la espera del cliente)
 * @param veTodo        el Director ve lo sin responsable y los leads de toda
 *                      la oficina; el resto, lo suyo
 * @returns { meToca, espero, cuenta }
 *   cada parte es una lista de grupos { clave, titulo, tareas, leads?, pide? };
 *   `pide: "decision"` marca el grupo de lo vencido
 */
export function bandeja({ tareas = [], usuarioId, acompanantes = new Map(), leads = [], veTodo = false, hoy = hoyISO() }) {
  const abiertas = sinCompras(tareas).filter(abierta);
  const esMia = t => mismo(t.assignee_id, usuarioId) || (acompanantes.get?.(t.id) || []).some(id => mismo(id, usuarioId));
  const sinNadie = t => !t.assignee_id && !t.responsable_externo;

  // Lo mío que todavía depende de mí. Lo que marqué «espera a un tercero» ya
  // hice mi parte: va del otro lado.
  const mias = abiertas.filter(t => esMia(t) && !t.espera).sort(porFecha);
  const enUnaSemana = sumarDias(hoy, 7);
  const cuando = t => dia(t.due_date);

  // Los leads: el que espera al cliente está del otro lado; el día del
  // recordatorio pasa a ser mío.
  const misLeads = leads.filter(l => sePersigue(l) && l.espera_desde
    && (veTodo || mismo(l.responsable_id, usuarioId) || mismo(l.created_by, usuarioId)))
    .map(l => { const estado = estadoDelLead(l, [], hoy); return { lead: l, clase: estado.clase, texto: loQueDice(estado) }; });

  const meToca = [
    // Lo vencido primero, y pide una decisión: no se queda en rojo.
    { clave: "vencidas", titulo: "Vencidas", pide: "decision", tareas: mias.filter(t => cuando(t) && cuando(t) < hoy) },
    { clave: "insistir", titulo: "Insistir con el cliente", tareas: [], leads: misLeads.filter(x => x.clase === "insistir") },
    { clave: "hoy", titulo: "Hoy", tareas: mias.filter(t => cuando(t) === hoy) },
    { clave: "semana", titulo: "Esta semana", tareas: mias.filter(t => cuando(t) > hoy && cuando(t) <= enUnaSemana) },
    { clave: "despues", titulo: "Más adelante", tareas: mias.filter(t => cuando(t) > enUnaSemana) },
    { clave: "sinFecha", titulo: "Sin fecha", tareas: mias.filter(t => !cuando(t)) },
    // Lo que nadie tomó: mío si lo escribí yo, y del Director todo. Sin dueño
    // no es un detalle: es lo que hay que resolver antes de que venza.
    { clave: "sinDueno", titulo: "Sin responsable", pide: "dueno",
      tareas: abiertas.filter(t => sinNadie(t) && (veTodo || mismo(t.created_by, usuarioId))).sort(porFecha) },
  ].filter(g => g.tareas.length || g.leads?.length);

  const espero = [
    // Lo que encargué: lo escribí yo y lo tiene otro, del equipo o de afuera.
    { clave: "encargadas", titulo: "Lo que encargué",
      tareas: abiertas.filter(t => mismo(t.created_by, usuarioId) && !esMia(t) && !sinNadie(t)).sort(porFecha) },
    // Lo mío que ya hice de mi lado y depende de un tercero.
    { clave: "terceros", titulo: "Espera a un tercero", tareas: abiertas.filter(t => esMia(t) && t.espera).sort(porFecha) },
    { clave: "clientes", titulo: "Esperando al cliente", tareas: [], leads: misLeads.filter(x => x.clase === "esperando") },
  ].filter(g => g.tareas.length || g.leads?.length);

  const cuantas = partes => partes.reduce((n, g) => n + g.tareas.length + (g.leads?.length || 0), 0);
  return {
    meToca, espero,
    cuenta: {
      meToca: cuantas(meToca), espero: cuantas(espero),
      vencidas: meToca.find(g => g.clave === "vencidas")?.tareas.length || 0,
      hoy: meToca.find(g => g.clave === "hoy")?.tareas.length || 0,
      // De lo que encargué, cuánto ya pasó su fecha: es lo que hay que reclamar.
      encargadasVencidas: (espero.find(g => g.clave === "encargadas")?.tareas || []).filter(t => cuando(t) && cuando(t) < hoy).length,
    },
  };
}

// ─── Lo que se guarda al tocar ─────────────────────────────────────────────

/** Las fechas de un toque. */
export const FECHAS_RAPIDAS = [{ dias: 0, label: "Hoy" }, { dias: 1, label: "Mañana" }, { dias: 7, label: "En una semana" }];

/** Nueva fecha (o ninguna). */
export const alReprogramar = fecha => ({ due_date: dia(fecha) || null });

/** Pasa a manos de otro. */
export const alDelegar = usuarioId => ({ assignee_id: usuarioId, responsable_externo: null });

/** Hecha, de un toque. */
export const alCompletar = (quienNombre, ahora = new Date()) =>
  ({ status: "listo", hecha_at: ahora.toISOString(), hecha_por: quienNombre || null });

/**
 * «Ya no va»: se cierra sin haberse hecho. Queda cerrada —no vuelve a pedir
 * nada— y dice que se descartó, para no confundirla con trabajo terminado.
 */
export const alDescartar = (quienNombre, ahora = new Date()) =>
  ({ status: "listo", descartada: true, hecha_at: ahora.toISOString(), hecha_por: quienNombre || null });

/** Se vuelve a abrir: ni hecha ni descartada. */
export const alReabrir = () => ({ status: "en-progreso", descartada: false, hecha_at: null, hecha_por: null });

/**
 * La tarea que se agrega escribiendo y Enter: mía, con su proyecto si lo
 * elegí al lado.
 *
 * @param proyecto  { esLead, id, nombre } o null
 */
export function tareaRapida({ titulo, usuarioId, proyecto = null, fecha = null }) {
  const title = String(titulo || "").trim();
  if (!title) return { error: "Escribí qué hay que hacer." };
  return {
    fila: {
      title, assignee_id: usuarioId, created_by: usuarioId,
      lead_id: proyecto?.esLead ? proyecto.id : null,
      project_id: proyecto && !proyecto.esLead ? proyecto.id : null,
      due_date: dia(fecha) || null,
      status: "en-progreso", type: "Otro", priority: "media",
      notes: proyecto?.nombre ? `Tarea de ${proyecto.nombre}` : null,
    },
  };
}
