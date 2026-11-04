import { compararContraPresupuesto } from "./compararProforma.js";
// Un beneficio cargado a mano, por unidad y por total.
//
// Lo que se compró se escribe como viene en la factura: tantas unidades a
// tanto cada una, y el total sale solo. Y se compara como en Diferencias: la
// cantidad medida en obra casi nunca es la del presupuesto —se midió de nuevo,
// sobró, faltó—, así que el beneficio real sale del PRECIO UNITARIO del rubro
// por lo que de verdad se compró, no del total del rubro entero contra el
// total de la factura. Comparar totales con cantidades distintas inventa
// ahorros que son material que no se compró, o sobreprecios que son material
// de más.
//
// Es la misma función que compara una proforma: un solo renglón, un solo
// rubro. Una cuenta, no dos que se parezcan.

const n = v => Number(v) || 0;
const c2 = v => Math.round(n(v) * 100) / 100;
const c4 = v => Math.round(n(v) * 10000) / 10000;

/**
 * Las tres cifras de una compra —cantidad, precio unitario, total— y cuál se
 * acaba de escribir. Con dos alcanza: la tercera se calcula sola, y siempre
 * se recalcula la que NO se acaba de tocar, para no pisarle el número a quien
 * escribe.
 */
export function derivar(f = {}, cambiado) {
  const cant = n(f.cantidad), pu = n(f.unitario), tot = n(f.real);
  if (cambiado === "real") {
    return cant ? { ...f, unitario: String(c4(tot / cant)) } : f;
  }
  if (cambiado === "cantidad" || cambiado === "unitario") {
    if (cant && pu) return { ...f, real: String(c2(cant * pu)) };
    // Se escribió la cantidad con un total ya puesto: de ahí sale el unitario.
    if (cambiado === "cantidad" && cant && tot) return { ...f, unitario: String(c4(tot / cant)) };
  }
  return f;
}

/**
 * Contra qué se compara y cuánto da.
 *
 * @param f       lo que hay en el formulario: obra_rubro_id, cantidad, unidad,
 *                unitario, real (el total) y, si se escribió, presupuestado
 * @param rubros  los vivos de la obra
 * @returns el renglón de compararContraPresupuesto, con `presupuestado` ya
 *          resuelto (lo escrito a mano manda) y `escrito` diciendo si fue así
 */
export function cuentaAMano(f = {}, rubros = []) {
  const l = compararContraPresupuesto([{
    descripcion: f.descripcion || "",
    cantidad: n(f.cantidad) || null,
    unidad: f.unidad || null,
    monto: n(f.real),
    rubro_id: f.obra_rubro_id ? Number(f.obra_rubro_id) : null,
  }], rubros).lineas[0];
  const escrito = n(f.presupuestado) > 0;
  const presupuestado = escrito ? c2(f.presupuestado) : l.presupuestado;
  return {
    ...l,
    presupuestado: presupuestado ?? null,
    escrito,
    diferencia: presupuestado == null ? null : c2(presupuestado - l.cotizado),
  };
}

/** De dónde salió el número, dicho donde se lo ve. */
export function explicar(c, fmt = String) {
  if (c.presupuestado == null) {
    return "Sin rubro no hay contra qué comparar: elegí uno en el presupuesto o escribí lo presupuestado a mano.";
  }
  if (c.escrito) return `Contra lo que escribiste a mano: $${fmt(c.presupuestado)}.`;
  if (c.porUnitario) {
    return `El rubro son ${fmt(c.cantidadRubro)} ${c.unidadRubro} a $${fmt(c.puRubro)}; `
      + `se compara el precio unitario: $${fmt(c.puRubro)} × ${fmt(c.cantidad)} = $${fmt(c.presupuestado)}.`;
  }
  if (c.cantidad && c.puRubro == null) {
    return `El rubro no tiene cantidad cargada: se compara contra su total, $${fmt(c.presupuestado)} sin IVA.`;
  }
  if (c.cantidad) return `Misma cantidad que el rubro: se compara el total, $${fmt(c.presupuestado)} sin IVA.`;
  return `Contra el rubro entero, $${fmt(c.presupuestado)} sin IVA. Si se compró otra cantidad, ponela: el beneficio sale del precio unitario.`;
}
