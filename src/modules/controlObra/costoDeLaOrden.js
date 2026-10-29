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

const n = v => Number(v) || 0;
const c2 = v => Math.round(n(v) * 100) / 100;

const tieneCosto = l => l?.costo_unitario !== null && l?.costo_unitario !== undefined && l?.costo_unitario !== "";

/**
 * @param lineas  las partidas de la orden
 * @param gastos  las filas de orden_cambio_gastos
 * @returns la cuenta entera, lista para dibujar
 */
export function costoDeLaOrden({ lineas = [], gastos = [] } = {}) {
  const adiciones = lineas.filter(l => l.tipo !== "quita");
  const reducciones = lineas.filter(l => l.tipo === "quita");

  // Lo cobrado es la diferencia sobre el contrato: lo que se agrega menos lo
  // que se quita. Una orden que saca más de lo que pone cobra en negativo, y
  // su margen también.
  const cobrado = c2(adiciones.reduce((t, l) => t + n(l.cantidad) * n(l.precio_unitario), 0)
    - reducciones.reduce((t, l) => t + n(l.cantidad) * n(l.precio_unitario), 0));

  const conCosto = adiciones.filter(tieneCosto);
  const dePartidas = c2(conCosto.reduce((t, l) => t + n(l.cantidad) * n(l.costo_unitario), 0));

  const sueltos = c2(gastos.reduce((t, g) => t + n(g.monto), 0));
  const pagados = c2(gastos.filter(g => g.estado === "real").reduce((t, g) => t + n(g.monto), 0));

  const costo = c2(dePartidas + sueltos);
  const margen = c2(cobrado - costo);

  return {
    cobrado,
    costo, dePartidas, sueltos, pagados,
    // Cuánto de lo que se gastó ya salió de verdad: una liquidación hecha solo
    // de cotizaciones es una liquidación de antes de la obra.
    porPagar: c2(sueltos - pagados),
    margen,
    pct: cobrado ? Math.round((margen / cobrado) * 1000) / 10 : null,
    // ¿Se puede creer este número? No si hay partidas sin costo.
    sinCosto: adiciones.length - conCosto.length,
    conCosto: conCosto.length,
    cuantosGastos: gastos.length,
    sabido: adiciones.length > 0 && conCosto.length === adiciones.length,
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
      + "el margen que se ve es el de las demás, no el de la orden.";
  }
  if (!cuenta.costo) return "Todavía no se le cargó ningún costo: no se sabe qué deja.";
  if (cuenta.porPagar > 0 && cuenta.pagados > 0) {
    return `De los gastos, $${cuenta.pagados.toFixed(2)} ya se pagaron y $${cuenta.porPagar.toFixed(2)} siguen siendo una cotización.`;
  }
  return null;
}
