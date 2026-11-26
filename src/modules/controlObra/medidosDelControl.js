// LO QUE LA LIQUIDACIÓN DICE DE CADA RUBRO DEL CONTROL.
//
// Hernán, 24/11/2026: «esas cantidades del presupuesto de liquidación deberían
// mandar». Y el 26/11, de los rubros de las órdenes de cambio: que también la
// tomen.
//
// El presupuesto de liquidación y el control no tienen los mismos renglones, y
// por eso hace falta este puente:
//
//   · UN RUBRO DEL CONTRATO es un renglón en los dos, con el mismo id. La
//     cantidad ejecutada que se le carga a ese renglón es la suya.
//
//   · UNA PARTIDA NUEVA DE UNA ORDEN —el picado de la OC-01— es un renglón en
//     el bloque de su orden, en la liquidación, y un rubro propio en el
//     capítulo «ADICIONALES · OC-01», en el control. El control no guarda de
//     qué partida salió cada rubro: se reconoce por su orden, su descripción y
//     su cantidad, que son las de la partida.
//
//   · LA PARTIDA QUE LE SUMA CANTIDAD A UN RUBRO DEL CONTRATO —las «de más»—
//     no tiene renglón propio en la liquidación: va sumada al del rubro. En el
//     control sí es un rubro aparte. La cantidad ejecutada de ese renglón es
//     de los dos juntos: el rubro de la orden se sigue midiendo contra lo que
//     la orden aprobó, y al del contrato le toca el resto. Sin ese descuento,
//     lo que la orden sumó quedaría presupuestado dos veces.
//
// Lo que resta una orden —el «(–)»— y los honorarios no se miden.
//
// Sin base ni pantalla: se puede probar (pruebas/medidosDelControl.test.mjs).

import { ordenCuenta } from "./cuentaOrdenCambio.js";

const n = v => Number(v) || 0;
const c2 = v => Math.round(n(v) * 100) / 100;
const c4 = v => Math.round(n(v) * 10000) / 10000;

/**
 * De qué partida de su orden salió cada rubro del control que entró por una
 * orden de cambio. La descripción del rubro empieza con la de la partida —el
 * puente le agrega el código de la orden— y la cantidad es la misma. Dos
 * partidas iguales en una orden se reparten en el orden en que están.
 *
 * @returns Map(rubro.id → { orden, linea })
 */
export function partidaDeCadaRubro({ rubros = [], ordenes = [], lineasDeOrdenes = {} } = {}) {
  const porId = new Map((ordenes || []).map(o => [String(o.id), o]));
  const usadas = new Set();
  const out = new Map();
  for (const r of rubros || []) {
    if (r?.origen !== "orden_cambio" || !(n(r.total_base) > 0)) continue;
    const orden = porId.get(String(r.orden_cambio_id));
    if (!orden) continue;
    const linea = (lineasDeOrdenes[orden.id] || []).find(l => l && l.tipo !== "quita" && l.id != null
      && !usadas.has(`${orden.id}-${l.id}`)
      && c4(l.cantidad) === c4(r.cantidad)
      && String(r.descripcion || "").startsWith(String(l.descripcion || "").trim() || "\u0000"));
    if (!linea) continue;
    usadas.add(`${orden.id}-${linea.id}`);
    out.set(r.id, { orden, linea });
  }
  return out;
}

/**
 * @param liq      lo que devuelve liquidacion() o liquidacionDeLaObra()
 * @param rubros   los del control, con los que entraron por órdenes
 * @returns { [rubro.id]: { medida, ejecutada, cobra, enOrdenes } }: solo los
 *   rubros que tienen cantidad ejecutada cargada. `enOrdenes` es la cantidad
 *   que las órdenes le sumaron a un rubro del contrato y que ya está contada
 *   en los rubros de esas órdenes.
 */
export function medidosPorRubro({ liq = null, rubros = [], ordenes = [], lineasDeOrdenes = {} } = {}) {
  const porFila = liq?.porFila || {};
  const out = {};
  // Los del contrato, por su id; menos lo que sus órdenes ya cuentan aparte.
  for (const r of rubros || []) {
    if (!r || r.origen === "orden_cambio") continue;
    const f = porFila[String(r.id)];
    if (!f?.medida) continue;
    const sumado = f.sumado || { cantidad: 0, total: 0 };
    out[String(r.id)] = {
      medida: true,
      ejecutada: c4(Math.max(0, n(f.ejecutada) - n(sumado.cantidad))),
      cobra: c2(Math.max(0, n(f.cobra) - n(sumado.total))),
      enOrdenes: c4(sumado.cantidad),
    };
  }
  // Los de las órdenes que cuentan, por el renglón de su partida.
  const cuentan = (ordenes || []).filter(ordenCuenta);
  for (const [id, { orden, linea }] of partidaDeCadaRubro({ rubros, ordenes: cuentan, lineasDeOrdenes })) {
    const f = porFila[`o${orden.id}-${linea.id}`];
    if (!f?.medida) continue;
    out[String(id)] = { medida: true, ejecutada: c4(f.ejecutada), cobra: c2(f.cobra), enOrdenes: 0 };
  }
  return out;
}
