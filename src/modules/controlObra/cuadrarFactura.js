/**
 * LA FACTURA TAMBIÉN SE COMPRUEBA CON SU PROPIA ARITMÉTICA.
 *
 * NOVA lee los renglones de una factura y los reparte entre rubros: es el
 * camino de más volumen hacia el control de obra, y hasta acá nadie
 * comprobaba que esos renglones SUMARAN el subtotal del papel. El pedido lo
 * decía —"la suma de los monto tiene que dar los subtotales"— pero decirlo no
 * es comprobarlo. Un renglón leído de más o de menos entra a un rubro como un
 * dato con cara de bueno, y se nota tres meses después, si se nota.
 *
 * Mismo motor que las proformas: cantidad × unitario = total en cada renglón,
 * y suma de renglones = base imponible. La base es lo que dice el papel
 * —subtotal 0 + 5 + 15— y, cuando el SRI contestó, lo que dice el XML
 * autorizado, que no se leyó: viene firmado.
 */
import { revisarLectura } from "../lectura/aritmetica.js";

const n = v => Number(v) || 0;
const c2 = v => Math.round(n(v) * 100) / 100;

/** La base imponible impresa: las tres bases por tarifa, sumadas. Null si no hay ninguna. */
export function baseImpresa(p = {}) {
  const partes = [p.subtotal_0, p.subtotal_5, p.subtotal_15].map(n);
  if (!partes.some(x => x)) return null;
  return c2(partes.reduce((t, x) => t + x, 0));
}

/** Lo que el lazo compara contra: la base impresa, el IVA y el total del papel. */
export function totalesDeLectura(p = {}) {
  const subtotal = baseImpresa(p);
  if (subtotal == null && !n(p.total)) return null;
  return { subtotal, iva: n(p.iva) || null, total: n(p.total) || null };
}

/** Los renglones como los lee NOVA, en la forma que entiende la aritmética. */
export function renglonesDeLectura(p = {}) {
  return (Array.isArray(p.items) ? p.items : [])
    .filter(x => x && (x.descripcion || n(x.monto)))
    .map(x => ({
      descripcion: String(x.descripcion || "").trim().slice(0, 90),
      cantidad: n(x.cantidad),
      unidad: String(x.unidad || "").trim().slice(0, 10),
      monto: c2(x.monto),
      // El unitario del papel, para comprobar la multiplicación. Si no está,
      // ese renglón solo se comprueba en la suma.
      unitario: n(x.unitario) || null,
      iva: x.iva ?? null,
      rubro_id: x.rubro_id ?? null,
    }));
}

/**
 * Cómo quedó la lectura, contra lo mejor que haya para comparar.
 *
 * Si el SRI ya contestó con el XML, la base es la del XML —no se leyó, está
 * firmada— y se dice que se comparó contra el SRI. Si no, contra el papel.
 * Sin ninguna de las dos, sin comprobar: que es la verdad, no un "cuadra".
 */
export function revisionDeFactura({ items = [], p = {}, comprobante = null } = {}) {
  const delSri = comprobante && n(comprobante.totalSinImpuestos) ? c2(comprobante.totalSinImpuestos) : null;
  const delPapel = baseImpresa(p);
  const subtotal = delSri ?? delPapel;
  const r = revisarLectura(items, subtotal == null ? null : { subtotal }, 0);
  return { ...r, contra: delSri != null ? "sri" : delPapel != null ? "papel" : null };
}
