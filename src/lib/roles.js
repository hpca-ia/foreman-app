import { colors } from "../theme/colors";

// Los cuatro roles reales de la empresa. Las claves se mantienen ("owner",
// "assistant") para no romper los usuarios ya guardados en cada navegador.
export const ROLES = {
  owner: { label: "Director", color: colors.brand },
  assistant: { label: "Admin", color: "#5B5F97" },
  gerente: { label: "Gerente de Proyecto", color: "#3D6B7D" },
  residente: { label: "Residente", color: "#6B7F4F" },
};

// "Equipo" ya no existe: se muestra si algún usuario viejo lo tiene, pero no
// se ofrece al crear usuarios nuevos.
const LEGACY = { member: { label: "Equipo", color: colors.muted } };

export const rolInfo = role => ROLES[role] || LEGACY[role] || { label: "Equipo", color: colors.muted };

export const esAdmin = role => role === "owner" || role === "assistant";
export const esResidente = role => role === "residente";
export const puedeControlObra = role => ["owner", "assistant", "gerente"].includes(role);
export const puedeCajaChica = role => ["owner", "assistant", "gerente", "residente"].includes(role);
