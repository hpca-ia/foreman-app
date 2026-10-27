// DE DÓNDE VINO CADA GASTO.
//
// Al control de la obra entran por dos puertas muy distintas. Una factura de
// compra pasó por un pedido, una aprobación y un pago, y alguien decidió
// contra qué rubro iba. Un gasto de caja chica lo compró alguien en la obra,
// lo pagó en el momento y entra "por asignar": el rubro se lo pone después
// quien revisa, desde una pantalla, mirando un detalle escrito a mano.
//
// Por eso es justo donde se equivoca la asignación, y por eso hay que poder
// mirar un número del control y saber cuánto de él viene de ahí. El dato ya
// estaba en la base —`origen` de la factura—; lo que faltaba era decirlo.

const n = v => Number(v) || 0;

export const CAJA_CHICA = "caja_chica";

/** La sigla con la que se marca en las listas. */
export const SIGLA_CAJA = "CCH";

/** ¿Este gasto entró por caja chica? */
export const esDeCajaChica = f => f?.origen === CAJA_CHICA;

/**
 * Cuánto de lo asignado a cada rubro vino de caja chica.
 *
 * Solo lo que apunta a un rubro con nombre y apellido: lo cargado a un
 * capítulo entero o repartido a prorrata no es de ningún rubro en particular,
 * y decir que lo es sería inventar.
 *
 * Las notas de crédito restan, porque restan en todos lados: son plata que
 * volvió.
 *
 * @returns { [rubroId]: monto } — sin los rubros en cero.
 */
export function cajaChicaPorRubro(facturas = [], asignaciones = []) {
  const deCaja = new Set(facturas.filter(esDeCajaChica).map(f => Number(f.id)));
  const out = {};
  asignaciones.forEach(a => {
    if (a?.obra_rubro_id == null || !deCaja.has(Number(a.factura_id))) return;
    const k = Number(a.obra_rubro_id);
    out[k] = (out[k] || 0) + n(a.monto);
  });
  Object.keys(out).forEach(k => {
    out[k] = Math.round(out[k] * 100) / 100;
    if (out[k] === 0) delete out[k];
  });
  return out;
}

/**
 * Lo de caja chica cargado a un CAPÍTULO entero, sin repartir entre sus
 * rubros. Es la otra mitad del problema: así entra la mayoría de los gastos
 * de caja chica —quien revisa sabe que fue "obra gris" y no cuál de sus doce
 * rubros—, y por rubro no aparecería en ningún lado.
 *
 * @returns { [capitulo]: monto }
 */
export function cajaChicaPorCapitulo(facturas = [], asignaciones = []) {
  const deCaja = new Set(facturas.filter(esDeCajaChica).map(f => Number(f.id)));
  const out = {};
  asignaciones.forEach(a => {
    if (!a?.capitulo || a.obra_rubro_id != null || !deCaja.has(Number(a.factura_id))) return;
    out[a.capitulo] = (out[a.capitulo] || 0) + n(a.monto);
  });
  Object.keys(out).forEach(k => {
    out[k] = Math.round(out[k] * 100) / 100;
    if (out[k] === 0) delete out[k];
  });
  return out;
}

/**
 * Cuánto lleva gastado la obra por caja chica, y en cuántos gastos.
 * Las proformas no son gasto: todavía no compró nadie.
 */
export function resumenCajaChica(facturas = []) {
  const suyas = facturas.filter(f => esDeCajaChica(f) && f.clase !== "proforma");
  return {
    cuantos: suyas.length,
    monto: Math.round(suyas.reduce((t, f) => t + n(f.total), 0) * 100) / 100,
  };
}
