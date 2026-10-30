// EL TOTAL DE LA OBRA TIENE QUE SER EL DEL PRESUPUESTO.
//
// El presupuesto del aeropuerto termina en $172.127,27 y la obra decía
// $172.127,24. Tres centavos, y no es un detalle: es el número que se compara
// contra el contrato, y uno que no cuadra obliga a explicar algo que no tiene
// explicación —"son tres centavos de redondeo"— cada vez que alguien lo mira.
//
// De dónde salen: el presupuesto calcula el IVA UNA VEZ sobre el subtotal, y la
// obra lo calculaba rubro por rubro, redondeando a dos decimales ciento sesenta
// y cuatro veces. La suma de los redondeos no es el redondeo de la suma, nunca.
// En Plaza Lagos el mismo error va para el otro lado: la obra daba un centavo
// de MÁS.
//
// No se arregla con más decimales —el error se achica y no desaparece— ni
// redondeando distinto. Se arregla como lo arregla cualquier sistema que
// factura: se reparte la diferencia. Cada rubro lleva su IVA redondeado, y los
// centavos que faltan o sobran se le cargan AL RUBRO MÁS GRANDE, que es donde
// menos se notan y donde es más defendible: un centavo sobre nueve mil.
//
// Sin base de datos: números que entran, números que salen.

const n = v => Number(v) || 0;
const c2 = v => Math.round(n(v) * 100) / 100;

/**
 * Los totales de cada renglón con IVA, sumando EXACTAMENTE el total del papel.
 *
 * @param montos   el total de cada renglón, sin IVA
 * @param ivaPct   el porcentaje del presupuesto
 * @param totalDelPapel  el total con IVA que dice el presupuesto. Si no se
 *   pasa, se calcula sobre la suma —que es lo mismo que hace el presupuesto—.
 * @returns { totales, ajuste, donde }  los totales con IVA, cuánto se repartió
 *   y en qué posición quedó.
 */
export function conIvaCuadrado(montos = [], ivaPct = 0, totalDelPapel = null) {
  const factor = 1 + n(ivaPct) / 100;
  const totales = montos.map(m => c2(n(m) * factor));
  if (!totales.length) return { totales, ajuste: 0, donde: -1 };

  const objetivo = totalDelPapel == null
    ? c2(montos.reduce((t, m) => t + n(m), 0) * factor)
    : c2(totalDelPapel);
  const suma = c2(totales.reduce((t, x) => t + x, 0));
  const ajuste = c2(objetivo - suma);
  if (!ajuste) return { totales, ajuste: 0, donde: -1 };

  // AL MÁS GRANDE. Un centavo sobre nueve mil no mueve nada; el mismo centavo
  // sobre un rubro de dos dólares se ve y hay que explicarlo.
  let donde = 0;
  totales.forEach((x, i) => { if (Math.abs(x) > Math.abs(totales[donde])) donde = i; });
  totales[donde] = c2(totales[donde] + ajuste);
  return { totales, ajuste, donde };
}

/** ¿Cuánto se despegó la obra de su presupuesto? Cero es lo único aceptable. */
export const diferenciaConElPapel = (rubros = [], totalDelPapel = 0) =>
  c2(rubros.reduce((t, r) => t + n(r.total_base), 0) - n(totalDelPapel));
