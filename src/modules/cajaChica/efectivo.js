// QUÉ SALIÓ DE LA CAJA Y QUÉ NO.
//
// Una caja chica se rinde contando billetes, así que lo único que puede bajar
// su disponible es plata que salió. Dos cosas no lo son y se contaban como si
// lo fueran:
//
//   · Una NOTA DE CRÉDITO no devuelve billetes: devuelve un vale. El gasto
//     entraba en negativo y la caja sumaba ese monto a lo disponible, así que
//     el responsable figuraba con plata que no tiene en el bolsillo.
//   · Un gasto PAGADO CON ESE VALE no sacó efectivo, o sacó solo la diferencia.
//
// Las dos juntas se compensaban —el vale "volvía" y la compra siguiente se lo
// llevaba— y por eso el total nunca saltó. Pero ninguna de las dos líneas
// decía lo que pasó, y el vale seguía figurando a favor en Proveedores cuando
// ya estaba gastado.
//
// Sin base de datos: es la cuenta con la que alguien rinde una caja.

const n = v => Number(v) || 0;
const r2 = v => Math.round(n(v) * 100) / 100;

/** ¿Este movimiento es una nota de crédito —un vale— y no un gasto? */
export const esVale = g => g?.tipo === "nota_credito" || n(g?.monto) < 0;

/** Lo que de verdad salió de la caja por este gasto. */
export function efectivoDe(g) {
  if (esVale(g)) return 0;
  const monto = n(g?.monto);
  const conVale = Math.min(Math.max(n(g?.pagado_con_nota), 0), monto);
  return r2(monto - conVale);
}

/** Lo que salió de la caja, sumado. */
export const efectivoGastado = (gastos = []) => r2(gastos.reduce((t, g) => t + efectivoDe(g), 0));

/**
 * Lo que vale cada vale todavía: lo suyo menos lo que ya se usó con él.
 *
 * Lo usado sale de los PAGOS del control —cada pago hecho con un vale dice de
 * cuál salió—, no del gasto: un gasto se puede pagar con dos vales a la vez,
 * y fue lo que pasó con los $105,06 de KYWI repartidos entre dos compras.
 *
 * @param gastos los gastos de la caja (los negativos son los vales)
 * @param pagos  obra_pagos con `nota_credito_id`
 */
export function valesDeLaCaja(gastos = [], pagos = []) {
  const usado = {};
  pagos.forEach(p => {
    if (p?.nota_credito_id == null) return;
    usado[p.nota_credito_id] = (usado[p.nota_credito_id] || 0) + n(p.monto);
  });
  return gastos.filter(esVale).map(g => {
    const vale = Math.abs(n(g.monto));
    // Se ata por la factura que ese gasto creó en el control: es la misma
    // nota de crédito, vista desde los dos lados.
    const gastado = usado[g.obra_factura_id] || 0;
    return { ...g, vale, usado: r2(Math.min(gastado, vale)), disponible: r2(Math.max(0, vale - gastado)) };
  });
}

/** Los vales que todavía se pueden usar, y cuánto suman. */
export function valesPorUsar(gastos = [], pagos = []) {
  const vivos = valesDeLaCaja(gastos, pagos).filter(v => v.disponible > 0.005);
  return { vales: vivos, total: r2(vivos.reduce((t, v) => t + v.disponible, 0)) };
}

/**
 * El estado de la caja: lo entregado, lo que salió en efectivo, lo que queda
 * en billetes y lo que queda en vales.
 *
 * Los vales se dicen aparte porque son plata nuestra pero no son efectivo: se
 * gastan en la próxima compra con ese proveedor, no sirven para pagar a otro.
 */
export function estadoDeLaCaja({ anticipos = [], gastos = [], pagos = [] }) {
  const total = r2(anticipos.reduce((t, a) => t + n(a.monto), 0));
  const gastado = efectivoGastado(gastos);
  const { total: enVales } = valesPorUsar(gastos, pagos);
  return { total, gastado, disponible: r2(total - gastado), enVales };
}
