// LO QUE DEJA UNA ORDEN DE CAMBIO: cobrado contra costado.
//
// El costo de una orden tenía un solo lugar donde vivir —el costo unitario de
// cada partida, sacado de la proforma— y eso alcanza cuando la orden es
// comprar algo y revenderlo. No alcanza nunca más: el flete del generador, la
// mano de obra propia que lo instala, el andamio para poner el vinil, la
// segunda proforma de otro proveedor. Todo eso sale por esta orden y no tenía
// dónde ir, así que el margen de la pantalla era más alto que el de verdad.
//
// Un margen optimista es peor que ninguno: con ese número se pone el precio de
// la próxima.
//
// Entonces el costo son las dos cosas sumadas: lo que cuestan las partidas y
// los gastos que no son partidas. Y lo que no se sabe se dice: una orden con
// dos partidas sin costo no tiene margen, y el margen que no se sabe no es
// cero.
//
// TODO VA SIN IVA, porque la orden se cobra sin IVA. Medir un precio sin IVA
// contra un costo con IVA se lleva quince puntos sin que nada lo diga.

import { margenDeOrden } from "./cuentaOrdenCambio.js";

const n = v => Number(v) || 0;
const c2 = v => Math.round(n(v) * 100) / 100;

/**
 * EL MISMO MARGEN QUE LA LIQUIDACIÓN, MÁS LOS GASTOS.
 *
 * El margen sale de margenDeOrden, y no de una cuenta propia: había dos, y la
 * caja de la orden decía $1.200 · 60% donde la liquidación decía $200 · 20%
 * para la misma orden. La diferencia era sumar al cobrado las partidas sin
 * costo —su precio entraba entero y su costo no entraba nunca— y restar las
 * reducciones sin restar lo que se ahorra al no hacerlas. Las dos cosas
 * inventan un número. Dos pantallas que no cuadran son peor que una que no
 * existe: nadie sabe a cuál creerle.
 *
 * Entonces: lo que se cobra en total se dice (es lo que firma el cliente),
 * pero el margen se mide solo sobre las partidas que tienen costo.
 *
 * @param lineas  las partidas de la orden
 * @param gastos  las filas de orden_cambio_gastos
 * @returns la cuenta entera, lista para dibujar
 */
export function costoDeLaOrden({ lineas = [], gastos = [] } = {}) {
  const adiciones = lineas.filter(l => l.tipo !== "quita");
  const reducciones = lineas.filter(l => l.tipo === "quita");

  // Lo cobrado es la diferencia sobre el contrato: lo que se agrega menos lo
  // que se quita. Es lo que firma el cliente, y no es la base del margen.
  const cobrado = c2(adiciones.reduce((t, l) => t + n(l.cantidad) * n(l.precio_unitario), 0)
    - reducciones.reduce((t, l) => t + n(l.cantidad) * n(l.precio_unitario), 0));

  const m = margenDeOrden(lineas);

  const sueltos = c2(gastos.reduce((t, g) => t + n(g.monto), 0));
  const pagados = c2(gastos.filter(g => g.estado === "real").reduce((t, g) => t + n(g.monto), 0));

  const costo = c2(m.costo + sueltos);
  const margen = c2(m.cobrado - costo);

  return {
    cobrado,
    // Sobre lo que se mide el margen: el precio de las partidas con costo.
    // Si es menor que lo cobrado, hay partidas sin costo o reducciones.
    cobradoConCosto: m.cobrado,
    costo, dePartidas: m.costo, sueltos, pagados,
    // Cuánto de lo que se gastó ya salió de verdad: una liquidación hecha solo
    // de cotizaciones es una liquidación de antes de la obra.
    porPagar: c2(sueltos - pagados),
    margen,
    pct: m.cobrado ? Math.round((margen / m.cobrado) * 1000) / 10 : null,
    // ¿Se puede creer este número? No si hay partidas sin costo.
    sinCosto: m.sinCosto,
    conCosto: m.conCosto,
    reducciones: reducciones.length,
    cuantosGastos: gastos.length,
    sabido: adiciones.length > 0 && m.sinCosto === 0,
  };
}

/** Un gasto nuevo, con el IVA ya sacado: la orden cobra sin IVA. */
export function gastoLimpio({ descripcion, proveedor, monto, iva = 0, estado = "cotizado" }) {
  const bruto = n(monto);
  const pct = n(iva);
  const neto = pct > 0 ? Math.round((bruto / (1 + pct / 100)) * 100) / 100 : c2(bruto);
  return {
    descripcion: String(descripcion || "").trim().slice(0, 200),
    proveedor: String(proveedor || "").trim() || null,
    monto: neto,
    iva: pct > 0 && pct <= 30 ? pct : 0,
    estado: estado === "real" ? "real" : "cotizado",
  };
}

/** Qué le falta a esta orden para que su margen se pueda creer. */
export function queFaltaSaber(cuenta) {
  if (!cuenta.cobrado && !cuenta.costo) return "Todavía no tiene partidas ni gastos.";
  if (cuenta.sinCosto) {
    return `${cuenta.sinCosto} ${cuenta.sinCosto === 1 ? "partida" : "partidas"} sin costo: `
      + `el margen que se ve es el de las otras ${cuenta.conCosto}, no el de la orden entera.`;
  }
  if (!cuenta.costo) return "Todavía no se le cargó ningún costo: no se sabe qué deja.";
  if (cuenta.porPagar > 0 && cuenta.pagados > 0) {
    return `De los gastos, $${cuenta.pagados.toFixed(2)} ya se pagaron y $${cuenta.porPagar.toFixed(2)} siguen siendo una cotización.`;
  }
  return null;
}
