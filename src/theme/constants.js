import { colors } from "./colors";

export const TIPOS = ["Llamada", "Reunión", "Gestión", "Contrato", "Compra", "Inspección", "Aprobación", "Visita a obra", "Otro"];

// Las tres cosas que se hacen en la oficina, cada una con su color. Es el mismo
// en el pipeline y en el tablero: si en el proyecto la reunión es violeta, en el
// tablero también, y se reconoce sin leer el título.
export const CLASES = {
  gestion: { label: "Gestión", plural: "Gestiones", color: "#B45309", soft: "#FDF3E7" },
  tarea:   { label: "Tarea",   plural: "Tareas",    color: "#0F3D3E", soft: "#E7F1EF" },
  reunion: { label: "Reunión", plural: "Reuniones", color: "#6D28D9", soft: "#F1ECFD" },
};

/** Qué es una tarea guardada: su tipo manda, y las viejas se leen por su nota. */
export const claseDe = t => (t?.type === "Reunión" ? "reunion"
  : t?.type === "Gestión" ? "gestion"
  : /^Tarea de /.test(t?.notes || "") ? "tarea"
  : /^(Gestión|Actividad) de /.test(t?.notes || "") ? "gestion"
  : "tarea");

export const PRIORIDAD = {
  urgente: { label: "Urgente", color: colors.danger, bg: colors.dangerSoft },
  alta: { label: "Alta", color: colors.warning, bg: colors.warningSoft },
  media: { label: "Media", color: colors.success, bg: colors.successSoft },
  baja: { label: "Baja", color: colors.muted, bg: colors.neutralSoft },
};

// Una tarea que se acaba de crear ya está en proceso: nadie la anota para
// dejarla quieta. Lo que sí pasa es que se pause, que se atrase —eso no se
// elige, se calcula de la fecha— o que se termine.
//
// "pendiente" es de antes y se deja para las tareas viejas: no se ofrece al
// cambiar de estado, pero si una lo tiene se sigue viendo bien.
export const ESTADO = {
  "en-progreso": { label: "En proceso", color: colors.warning },
  bloqueado: { label: "Pausada", color: colors.danger, ayuda: "Detenida: espera algo de alguien" },
  listo: { label: "Completada", color: colors.success },
  // Las de antes: se leen como lo que son, en proceso. No se ofrecen al
  // cambiar de estado, y la migración 039 las pasa de una vez.
  pendiente: { label: "En proceso", color: colors.warning, viejo: true },
};

export const ESTADO_NUEVO = "en-progreso";
/** Los que se pueden elegir; los de antes solo se muestran si ya los tenía. */
export const estadosElegibles = actual =>
  Object.entries(ESTADO).filter(([k, v]) => !v.viejo || k === actual);
