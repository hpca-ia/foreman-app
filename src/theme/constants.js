import { colors } from "./colors";

export const TIPOS = ["Llamada", "Reunión", "Contrato", "Compra", "Inspección", "Aprobación", "Visita a obra", "Otro"];

export const PRIORIDAD = {
  urgente: { label: "Urgente", color: colors.danger, bg: colors.dangerSoft },
  alta: { label: "Alta", color: colors.warning, bg: colors.warningSoft },
  media: { label: "Media", color: colors.success, bg: colors.successSoft },
  baja: { label: "Baja", color: colors.muted, bg: colors.neutralSoft },
};

export const ESTADO = {
  pendiente: { label: "Pendiente", color: colors.muted },
  "en-progreso": { label: "En progreso", color: colors.warning },
  listo: { label: "Listo", color: colors.success },
  bloqueado: { label: "Bloqueado", color: colors.danger },
};
