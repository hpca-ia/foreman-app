// LA BASE Y EL IVA DE UN GASTO DE CAJA CHICA, COMO LOS IMPRIME EL PAPEL.
//
// Caja chica leía solo el total y lo guardaba en el control como «base 15%»,
// con el IVA en cero: las 163 facturas que entraron por acá estaban así. Al
// control de gastos no le cambia nada —cuenta el total—, pero el libro de
// facturas decía que no se pagó IVA, y los renglones que lee NOVA, que vienen
// sin IVA, parecían quedarse cortos frente a esa «base».
//
// NOVA lee del papel las bases por tarifa y el IVA; lo que entra lo decide la
// aritmética: las bases más el IVA tienen que dar lo que se pagó, y el IVA
// tiene que ser el de sus bases. Si no da —una propina, un descuento mal
// leído, una tarifa vieja—, se guarda como antes y no se inventa nada.

const n = v => Number(v) || 0;
const c2 = v => Math.round(v * 100) / 100;

// Un centavo de redondeo en la suma del papel, y en el IVA uno o dos más: el
// proveedor lo calcula por renglón y redondea cada uno.
const TOLERA_SUMA = 0.02;
const TOLERA_IVA = 0.03;

/**
 * Las bases y el IVA que leyó NOVA, si cuadran con el monto del gasto.
 *
 * `leido` trae { subtotal_0, subtotal_5, subtotal_15, iva } como los imprime
 * el papel. `monto` es lo que se guarda como total, con su signo: una nota de
 * crédito resta, y sus bases también.
 *
 * El centavo de redondeo, si lo hay, va al IVA: lo que se pagó es lo que manda,
 * y base más IVA tiene que dar el total exacto.
 *
 * @returns { subtotal_0, subtotal_5, subtotal_15, iva } o null si no cuadra
 */
export function basesDelPapel(leido, monto) {
  const total = c2(Math.abs(n(monto)));
  if (!leido || !total) return null;
  const [s0, s5, s15, iva] = [leido.subtotal_0, leido.subtotal_5, leido.subtotal_15, leido.iva]
    .map(v => c2(Math.abs(n(v))));
  const bases = c2(s0 + s5 + s15);
  if (!bases) return null;
  if (Math.abs(c2(bases + iva) - total) > TOLERA_SUMA) return null;
  if (Math.abs(c2(s15 * 0.15 + s5 * 0.05) - iva) > TOLERA_IVA) return null;
  const signo = n(monto) < 0 ? -1 : 1;
  const con = v => c2(signo * v) + 0;   // + 0: sin el «−0» de una nota de crédito sin base
  return { subtotal_0: con(s0), subtotal_5: con(s5), subtotal_15: con(s15), iva: con(c2(total - bases)) };
}

/** Lo de siempre, cuando el papel no se leyó o no cuadra: todo el monto como base 15%. */
export const comoAntes = monto => ({ subtotal_0: 0, subtotal_5: 0, subtotal_15: monto, iva: 0 });

/** Al cargar un gasto nuevo: las del papel si cuadran; si no, como antes. */
export function basesAlGuardar(leido, monto) {
  return basesDelPapel(leido, monto) || comoAntes(monto);
}

/**
 * Al corregir un gasto que ya está en el control.
 *
 * Si se volvió a leer el papel y cuadra, esas. Si no se leyó y el monto es el
 * mismo, no se tocan: pueden haberse corregido a mano en el control («Dejar
 * base e IVA»), y corregir la descripción en caja chica no puede deshacer eso.
 * Si cambió el monto sin papel, como antes —con el IVA en cero también: dejar
 * el IVA viejo al lado de una base nueva daba una factura cuyas partes no
 * suman su total—.
 */
export function basesAlCorregir(leido, monto, montoAntes) {
  const delPapel = basesDelPapel(leido, monto);
  if (delPapel) return delPapel;
  if (Math.abs(n(monto) - n(montoAntes)) < 0.005) return {};
  return comoAntes(monto);
}

/** Para mostrar debajo del monto: «Base 15% $124,63 + IVA $18,69». */
export function lineaDeBases(b, fmt = v => v.toFixed(2)) {
  if (!b) return "";
  const partes = [["Base 0%", b.subtotal_0], ["Base 5%", b.subtotal_5], ["Base 15%", b.subtotal_15]]
    .filter(([, v]) => Math.abs(v) > 0.004)
    .map(([nombre, v]) => `${nombre} $${fmt(Math.abs(v))}`);
  return [...partes, `IVA $${fmt(Math.abs(b.iva))}`].join(" + ");
}
