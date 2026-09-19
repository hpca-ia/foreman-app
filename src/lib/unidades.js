// Unidades de medida.
//
// Cada presupuesto las escribe a su manera: "u", "u.", "UN", "c/u"; "glb",
// "GL", "Gb."; "m2", "M2", "m²". Para comparar precios hay que hablar de la
// misma unidad —$/m² contra $/ml no se compara—, así que acá se llevan a una
// forma única. Las que no se pueden adivinar ("m" puede ser lineal o cuadrado;
// "60.81" es un número en la columna equivocada) se marcan para que NOVA
// pregunte en vez de suponer.

export const UNIDADES = [
  { id: "u", nombre: "unidad" },
  { id: "m2", nombre: "metro cuadrado" },
  { id: "ml", nombre: "metro lineal" },
  { id: "m3", nombre: "metro cúbico" },
  { id: "glb", nombre: "global" },
  { id: "kg", nombre: "kilo" },
  { id: "lb", nombre: "libra" },
  { id: "ton", nombre: "tonelada" },
  { id: "l", nombre: "litro" },
  { id: "pto", nombre: "punto" },
  { id: "jgo", nombre: "juego" },
  { id: "hora", nombre: "hora" },
  { id: "dia", nombre: "día" },
  { id: "semana", nombre: "semana" },
  { id: "mes", nombre: "mes" },
  { id: "viaje", nombre: "viaje" },
];

const SINONIMOS = {
  u: ["u", "un", "und", "unid", "unidad", "unidades", "c/u", "cu", "pza", "pz", "pieza", "piezas", "ud"],
  m2: ["m2", "mt2", "mts2", "metro2", "metros2", "metrocuadrado", "metroscuadrados"],
  ml: ["ml", "m.l", "mlineal", "metrolineal", "metroslineales"],
  m3: ["m3", "mt3", "mts3", "metro3", "metrocubico", "metroscubicos"],
  glb: ["glb", "gbl", "gl", "gb", "global", "glob"],
  kg: ["kg", "kgs", "kilo", "kilos", "kilogramo", "kilogramos"],
  lb: ["lb", "lbs", "libra", "libras"],
  ton: ["ton", "tn", "tonelada", "toneladas"],
  l: ["l", "lt", "lts", "litro", "litros"],
  pto: ["pto", "ptos", "punto", "puntos"],
  jgo: ["jgo", "juego", "juegos"],
  hora: ["h", "hr", "hrs", "hora", "horas"],
  dia: ["dia", "dias"],
  semana: ["semana", "semanas", "sem"],
  mes: ["mes", "meses"],
  viaje: ["viaje", "viajes"],
};
const POR_CLAVE = new Map(Object.entries(SINONIMOS).flatMap(([id, lista]) => lista.map(s => [s, id])));
// "m" a secas: en unos presupuestos es lineal, en otros la escriben por m².
const AMBIGUAS = new Set(["m", "mt", "mts", "metro", "metros"]);

// NFKD convierte "²" en "2" y separa las tildes.
const clave = u => String(u ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/\s+/g, "").replace(/[.,;:]+$/, "");

/** { canon, estado: "ok" | "ambigua" | "desconocida" | "vacia", sugerida } */
export function normalizarUnidad(u) {
  const k = clave(u);
  if (!k) return { canon: null, estado: "vacia" };
  if (AMBIGUAS.has(k)) return { canon: null, estado: "ambigua", sugerida: "ml" };
  const id = POR_CLAVE.get(k);
  if (id) return { canon: id, estado: "ok" };
  return { canon: null, estado: "desconocida" };
}


/** Para mostrar: "m2" → "m²", "m3" → "m³"; las demás como su código. Una unidad que no se reconoce, tal cual. */
export function etiquetaUnidad(u) {
  const { canon } = normalizarUnidad(u);
  if (!canon) return String(u || "").trim();
  return canon === "m2" ? "m²" : canon === "m3" ? "m³" : canon;
}
