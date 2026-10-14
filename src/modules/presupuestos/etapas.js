// Un presupuesto que se cobra por etapas.
//
// Una obra grande casi nunca se contrata entera: se cierra la etapa uno —obra
// gris— y la dos queda para cuando el cliente consiga la plata o decida
// seguir. Hoy eso se resuelve haciendo DOS presupuestos, y ahí empiezan los
// problemas: los rubros se duplican, los precios se desfasan entre los dos
// archivos, y nadie puede ver el total de la obra completa sin sumar a mano.
//
// Con una etiqueta por rubro el presupuesto es uno solo y se lee de las dos
// maneras: el total de la obra, y cuánto cuesta cada etapa.

const n = v => Number(v) || 0;

/** Lo que se muestra cuando un rubro no tiene etapa puesta. */
export const SIN_ETAPA = "Sin etapa";

const limpia = e => String(e || "").trim();

/**
 * Cuánto suma cada etapa, en el orden en que conviene leerlas.
 *
 * ORDEN NATURAL, no alfabético: "Etapa 2" va antes que "Etapa 10", y
 * alfabéticamente sería al revés. Son nombres escritos a mano por una persona
 * y casi siempre llevan un número adentro; ordenarlos como texto es la clase
 * de detalle que hace que una pantalla se sienta rota sin que nadie sepa
 * explicar por qué.
 *
 * Lo que no tiene etapa va al final y junto: es lo que todavía no se decidió,
 * y mezclarlo con las etapas de verdad escondería justamente eso.
 */
export function subtotalesPorEtapa(items = []) {
  const mapa = new Map();
  items.forEach(i => {
    const e = limpia(i.etapa) || SIN_ETAPA;
    if (!mapa.has(e)) mapa.set(e, { etapa: e, rubros: 0, total: 0, sinEtapa: e === SIN_ETAPA });
    const g = mapa.get(e);
    g.rubros += 1;
    g.total = Math.round((g.total + n(i.total)) * 100) / 100;
  });

  const numeroDe = t => {
    const m = String(t).match(/\d+/);
    return m ? Number(m[0]) : Number.POSITIVE_INFINITY;
  };
  return [...mapa.values()].sort((a, b) => {
    if (a.sinEtapa !== b.sinEtapa) return a.sinEtapa ? 1 : -1;
    const d = numeroDe(a.etapa) - numeroDe(b.etapa);
    return d !== 0 && Number.isFinite(d) ? d : a.etapa.localeCompare(b.etapa, "es");
  });
}

/** Las etapas que ya existen, para ofrecerlas en vez de hacer tipear de nuevo. */
export function etapasUsadas(items = []) {
  return [...new Set(items.map(i => limpia(i.etapa)).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
}

/**
 * ¿Este presupuesto se cobra por etapas?
 *
 * Con una sola etapa no lo es: alguien etiquetó un rubro y nada más. Mostrar
 * un desglose de "una etapa" le agrega una sección a una pantalla ya cargada y
 * no dice nada que el total no diga.
 */
export function tieneEtapas(items = []) {
  return etapasUsadas(items).length > 1;
}

/**
 * LA ETAPA, A LA VISTA EN LA PANTALLA DE ARMADO.
 *
 * El desglose por etapas vive en su propia pestaña, y eso alcanza para cobrar
 * pero no para armar: mientras se escriben los rubros, saber en cuál quedó
 * cada uno obliga a cambiar de pantalla, y nadie cambia de pantalla cuarenta
 * veces. El resultado es que los rubros nuevos se van quedando sin etapa, o
 * peor, en la que no era — y eso recién se ve cuando el cliente pregunta por
 * qué la etapa uno le salió más cara de lo que se habló.
 *
 * Una marca corta al lado de cada rubro. "E2" y no "Etapa 2": en una tabla de
 * cuarenta renglones lo que se lee de un vistazo es la diferencia entre dos
 * colores y un número, no una palabra repetida cuarenta veces.
 */
export function etiquetaDeEtapa(etapa) {
  const t = limpia(etapa);
  if (!t) return "";
  const m = t.match(/\d+/);
  return m ? `E${m[0]}` : t.length > 7 ? `${t.slice(0, 6)}…` : t;
}

// Colores por número de etapa, no por orden de aparición: así la etapa 2 es
// del mismo color en todos los presupuestos y en todas las pantallas. Un color
// que cambia de significado entre dos pantallas es peor que no tener color.
const PALETA = [
  { texto: "#0F3D3E", fondo: "#E4EFEE" },
  { texto: "#8A4B00", fondo: "#FBEEDC" },
  { texto: "#1D4ED8", fondo: "#E6EDFD" },
  { texto: "#7A1F6B", fondo: "#F8E8F6" },
  { texto: "#15803D", fondo: "#E6F4EA" },
];
const NEUTRO = { texto: "#6B7280", fondo: "#F1F1EF" };

export function colorDeEtapa(etapa) {
  const t = limpia(etapa);
  if (!t) return NEUTRO;
  const m = t.match(/\d+/);
  if (!m) return NEUTRO;
  const i = ((Number(m[0]) - 1) % PALETA.length + PALETA.length) % PALETA.length;
  return PALETA[i];
}
