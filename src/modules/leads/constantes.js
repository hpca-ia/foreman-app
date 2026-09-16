import { colors } from "../../theme/colors";

// El catálogo de etapas vive en la base (`pipeline_etapas`), porque cambia con
// el tiempo. Esto es lo mismo que siembra la migración 021: sirve mientras
// carga, y si la migración todavía no se corrió.
export const CATALOGO_BASE = [
  { id: "lead",         nombre: "Lead",                orden: 10,  color: "#8B92A5", principal: true },
  { id: "reunion",      nombre: "Reunión con cliente", orden: 15,  color: "#7A9E9F", repetible: true },
  { id: "presupuesto",  nombre: "Presupuesto",         orden: 20,  color: "#5B8FA8", principal: true },
  { id: "diseno",       nombre: "Diseño",              orden: 30,  color: "#4A7C8C" },
  { id: "anteproyecto", nombre: "Anteproyecto",        orden: 40,  color: "#4A7C8C" },
  { id: "plan_masa",    nombre: "Plan masa",           orden: 50,  color: "#4A7C8C" },
  { id: "propuesta",    nombre: "Propuesta",           orden: 60,  color: "#3D6B7D", principal: true },
  { id: "negociacion",  nombre: "Negociación",         orden: 70,  color: "#2E5A6B", principal: true },
  { id: "contrato",     nombre: "Contrato",            orden: 80,  color: "#1F7A4D", principal: true },
  { id: "ejecucion",    nombre: "Ejecución",           orden: 90,  color: "#0F3D3E", principal: true },
  { id: "cerrado",      nombre: "Cerrado",             orden: 100, color: "#8B92A5", cierra: true },
];

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

// Cuánto silencio tolera un proyecto según su etapa. Uno en negociación que
// lleva tres días sin moverse está en problemas; uno en diseño, todavía no.
export const DIAS_SIN_MOVER = {
  lead: 7, reunion: 5, presupuesto: 7, propuesta: 5, negociacion: 3, contrato: 5,
};

// Los pasos de la ruta (tareas): pendiente → hecho → no se hizo.
export const ESTADO_PASO = {
  pendiente: { label: "Pendiente", icono: null },
  listo:     { label: "Hecho",     icono: "check" },
  bloqueado: { label: "No se hizo", icono: "equis" },
};
export const SIGUIENTE_ESTADO = { pendiente: "listo", listo: "bloqueado", bloqueado: "pendiente" };
