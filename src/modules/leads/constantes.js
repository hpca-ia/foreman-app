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

// La ruta que sigue un lead. Es el arranque: cada lead se lleva su copia y
// desde ahí se le cambian fechas, responsables, se agregan pasos o se borran
// los que no apliquen. Dos leads nunca terminan con la misma ruta, pero
// ninguno arranca en blanco —que es como se olvidan las cosas—.
export const RUTA_BASE = [
  { titulo: "Primer contacto",            dias: 0,  etapa: "contactado" },
  { titulo: "Visita o reunión",           dias: 3,  etapa: "visita" },
  { titulo: "Levantar alcance",           dias: 7 },
  { titulo: "Armar la propuesta",         dias: 12, etapa: "propuesta" },
  { titulo: "Presentar la propuesta",     dias: 15 },
  { titulo: "Seguimiento de la propuesta", dias: 22, etapa: "negociacion" },
  { titulo: "Cierre",                     dias: 30 },
];
