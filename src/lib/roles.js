import { colors } from "../theme/colors";

export const ROLES = {
  owner: { label: "Director", color: colors.brand },
  assistant: { label: "Asistente", color: "#5B5F97" },
  gerente: { label: "Gerente de Proyecto", color: "#3D6B7D" },
  residente: { label: "Residente", color: "#6B7F4F" },
  member: { label: "Equipo", color: colors.muted },
};

export const esAdmin = role => role === "owner" || role === "assistant";
export const esGerente = role => role === "owner" || role === "assistant" || role === "gerente";
export const esResidente = role => role === "residente";
export const puedeControlObra = role => ["owner", "assistant", "gerente"].includes(role);
export const puedeCajaChica = role => ["owner", "assistant", "gerente", "residente"].includes(role);
