import { colors } from "./colors";

export const TIPOS = ["Llamada", "Reunión", "Contrato", "Compra", "Inspección", "Aprobación", "Visita a obra", "Otro"];

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
  pendiente: { label: "Sin empezar", color: colors.muted, viejo: true },
};

export const ESTADO_NUEVO = "en-progreso";
/** Los que se pueden elegir; los de antes solo se muestran si ya los tenía. */
export const estadosElegibles = actual =>
  Object.entries(ESTADO).filter(([k, v]) => !v.viejo || k === actual);
