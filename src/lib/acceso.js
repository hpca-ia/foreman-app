// Quién entra a qué. La regla completa de FOREMAN, en un archivo.
//
// Son dos preguntas, y ninguna depende de la otra:
//
//   1. ¿Ve el módulo?  Lo dice el permiso del rol o de la persona
//      (Ajustes → Permisos). Es la puerta del edificio.
//
//   2. ¿A qué proyectos entra, y para qué?  Lo dice Ajustes → Proyectos:
//      cada persona tiene un nivel en el proyecto y otro en cada área.
//
// Prender "Presupuestos" en Permisos no abre los presupuestos de la oficina:
// abre la pantalla, y adentro salen los de sus proyectos. Lo único que cambia
// CUÁNTOS proyectos ve es "Entra a todos los proyectos" (`leads.ver`), que es
// el permiso de los gerentes.
//
// Todo es explícito: nada se hereda, nada se deduce. Un nivel es "editar",
// "ver" o nada — y nada es no entra, sin un tercer valor que haya que recordar.

/** Las cuatro cosas de un proyecto, y la columna donde vive cada nivel. */
export const AREAS_PROYECTO = [
  { id: "proyecto",    campo: "nivel",       columna: "nivel",             label: "Proyecto y tareas" },
  { id: "presupuesto", campo: "presupuesto", columna: "nivel_presupuesto", label: "Presupuesto" },
  { id: "obra",        campo: "obra",        columna: "nivel_obra",        label: "Control de obra" },
  { id: "libro",       campo: "libro",       columna: "nivel_libro",       label: "Libro de obra" },
];

export const NIVELES = [
  { id: "no",     label: "No entra", pista: "No lo ve ni le aparece en su lista" },
  { id: "ver",    label: "Ver",      pista: "Lo lee y no lo toca" },
  { id: "editar", label: "Editar",   pista: "Lo trabaja" },
];

const CAMPO = Object.fromEntries(AREAS_PROYECTO.map(a => [a.id, a.campo]));

/**
 * El nivel de una fila de `lead_accesos` en un área: "editar", "ver" o null.
 *
 * Una fila vieja —o una base sin la migración 055— solo tiene el nivel del
 * proyecto, y ese vale para todas las áreas hasta que alguien toque un botón.
 * Así nadie gana ni pierde permisos el día que la migración corre.
 */
export function nivelDeArea(acceso, area = "proyecto") {
  if (!acceso) return null;
  const valor = acceso[CAMPO[area] || area] ?? acceso.nivel;
  return valor === "ver" || valor === "editar" ? valor : null;
}

/**
 * El nivel de una persona en un proyecto, con todo lo que lo puede cambiar.
 *
 *   entraATodo · el Director, los admins y quien tenga "Entra a todos los
 *                proyectos": entra a todo con nivel de editar.
 *   esMio      · el que creó el proyecto entra sin que nadie se lo asigne.
 */
export function nivelDeAcceso({ acceso, area = "proyecto", entraATodo = false, esMio = false }) {
  if (entraATodo || esMio) return "editar";
  return nivelDeArea(acceso, area);
}

/** Lo que se guarda al mover un botón: la fila entera, sin nulls que adivinar. */
export function filaDeAcceso(acceso, area, valor) {
  const base = acceso || { nivel: "no", presupuesto: "no", obra: "no", libro: "no" };
  return { ...base, [CAMPO[area] || area]: valor };
}

/** Las cuatro en "no" no son una fila: son no estar en el proyecto. */
export const sinNingunAcceso = acceso =>
  AREAS_PROYECTO.every(a => ((acceso || {})[a.campo] || "no") === "no");

/**
 * ¿Esta persona ve esta tarea?
 *
 * La misma regla que todo lo demás, dicha para una tarea: es tuya, o entrás a
 * su proyecto. Nada de "solo las mías salvo que además elija el proyecto en un
 * filtro", que era lo que hacía que una tarea del proyecto de uno no
 * apareciera hasta acordarse de filtrar.
 *
 *   mia    · sos el responsable, la creaste, o te sumaron de acompañante
 *   todas  · el permiso "Las tareas de todos"
 *   nivel  · tu nivel en el proyecto de la tarea (null si no entrás, o si la
 *            tarea no cuelga de ningún proyecto)
 *
 * Lo privado es privado, y eso incluye a los admins.
 *
 * Antes decía "solo el dueño y los admins": con eso, marcar personal una tarea
 * propia igual la dejaba a la vista del Director y de Admin, que son quienes
 * uno justamente no quiere que la lean. Una casilla que promete privacidad y
 * no la da es peor que no tenerla, porque alguien confía en ella.
 *
 * La ve quien la tiene asignada, quien la creó y quien fue sumado de
 * acompañante —a ese lo sumó el dueño a propósito—. Nadie más, y ni el
 * proyecto ni "las tareas de todos" la abren.
 */
export function veLaTarea({ tarea, usuarioId, admin = false, todas = false, nivel = null, acompanante = false }) {
  const mia = tarea?.assignee_id === usuarioId || tarea?.created_by === usuarioId || acompanante;
  if (tarea?.privada) return mia;
  return mia || todas || !!nivel;
}
