import { colors } from "../../theme/colors";

// El túnel. El orden importa: es la ruta que recorre un lead, y la pantalla
// se lee de izquierda a derecha como el avance del negocio.
export const ETAPAS = [
  { id: "nuevo",       label: "Nuevo",       color: "#8B92A5", pct: 10 },
  { id: "contactado",  label: "Contactado",  color: "#5B8FA8", pct: 25 },
  { id: "visita",      label: "Visita",      color: "#4A7C8C", pct: 40 },
  { id: "propuesta",   label: "Propuesta",   color: "#3D6B7D", pct: 60 },
  { id: "negociacion", label: "Negociación", color: "#2E5A6B", pct: 80 },
  { id: "ganado",      label: "Ganado",      color: colors.success, pct: 100, cerrada: true },
  { id: "perdido",     label: "Perdido",     color: colors.muted,  pct: 0,   cerrada: true },
];

export const ETAPAS_ABIERTAS = ETAPAS.filter(e => !e.cerrada);

export const etapaInfo = id => ETAPAS.find(e => e.id === id) || ETAPAS[0];

export const ORIGENES = ["Referido", "Concurso", "Web", "Visita", "Cliente anterior", "Otro"];

// Cuánto silencio tolera un lead según su etapa. Uno en negociación que lleva
// cinco días sin moverse está en problemas; uno nuevo, todavía no.
export const DIAS_SIN_MOVER = {
  nuevo: 7, contactado: 7, visita: 5, propuesta: 5, negociacion: 3,
};

// Un paso de la ruta no es solo hecho o no hecho: también se puede decidir
// que no se hizo y seguir. Sin ese tercer estado, un paso que se descartó
// queda pendiente para siempre y ensucia la señal de "sin próximo paso".
export const ESTADO_PASO = {
  pendiente: { label: "Pendiente", icono: null },
  listo:     { label: "Hecho",     icono: "check" },
  bloqueado: { label: "No se hizo", icono: "equis" },
};
export const SIGUIENTE_ESTADO = { pendiente: "listo", listo: "bloqueado", bloqueado: "pendiente" };
