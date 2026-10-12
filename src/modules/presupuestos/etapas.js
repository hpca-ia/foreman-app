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
