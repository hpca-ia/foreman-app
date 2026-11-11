import { colors } from "../../theme/colors";
import { CATALOGO_BASE } from "./pipeline";

// El catálogo de etapas de fábrica está con las reglas del pipeline, que no
// dependen de la pantalla y por eso se pueden probar.
export { CATALOGO_BASE };

// Nombres de antes, para que un lead viejo no aparezca sin etiqueta si quedó
// alguno sin convertir.
const VIEJAS = {
  nuevo: "Lead nuevo", contactado: "Contactado", visita: "Visita",
  ganado: "Ganado", perdido: "Perdido",
};

export const etapaInfo = (id, catalogo = CATALOGO_BASE) =>
  catalogo.find(e => e.id === id) ||
  { id, nombre: VIEJAS[id] || id || "Sin etapa", color: colors.muted, orden: 0 };

export const ORIGENES = ["Referido", "Concurso", "Web", "Visita", "Cliente anterior", "Otro"];

// Qué tan cerca está de cerrarse. Es a ojo, y por eso sirve: ordena la semana.
export const TEMPERATURAS = [
  { id: "frio",     label: "Frío",     color: "#5B8FA8" },
  { id: "tibio",    label: "Tibio",    color: "#D98324" },
  { id: "caliente", label: "Caliente", color: "#C0392B" },
];
export const tempInfo = id => TEMPERATURAS.find(t => t.id === id) || null;

// Una etapa no es solo pendiente o hecha: también puede estar en curso, o
// decidirse que no se hace. Sin ese cuarto estado, una etapa descartada queda
// pendiente para siempre.
export const ESTADOS_ETAPA = {
  pendiente: { label: "Pendiente", color: colors.muted },
  en_curso:  { label: "En curso",  color: colors.brand },
  hecha:     { label: "Hecha",     color: colors.success },
  omitida:   { label: "No se hizo", color: colors.muted },
};
export const SIGUIENTE_ESTADO_ETAPA = { pendiente: "en_curso", en_curso: "hecha", hecha: "omitida", omitida: "pendiente" };

// Los pasos de la ruta (tareas): pendiente → hecho → no se hizo.
export const ESTADO_PASO = {
  pendiente: { label: "Pendiente", icono: null },
  listo:     { label: "Hecho",     icono: "check" },
  bloqueado: { label: "No se hizo", icono: "equis" },
};
export const SIGUIENTE_ESTADO = { pendiente: "listo", listo: "bloqueado", bloqueado: "pendiente" };
