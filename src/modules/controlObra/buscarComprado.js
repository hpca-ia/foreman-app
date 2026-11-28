import { palabrasDe } from "./itemsComprados.js";

// CUÁNTOS DE ESO SE COMPRARON (Hernán, 28/11/2026: «tengo varios recibos de
// pases impersonales... deseo saber cuántos de esos pagos hay, o cuántos pagos
// de comida, o cuánto cemento, o cuántos tableros fenólicos»).
//
// «Qué se compró» agrupa por la primera palabra: «EMISION PASE IMPERSONAL» y
// «EMISION PASE PROVISORIO» caen juntos en «emisión», y al buscar «pase
// impersonal» se veía la familia entera con su total —el de los provisorios
// también—. Esto suma SOLO los renglones que dicen lo que se buscó.

/** Plural a singular, lo justo para que «pases impersonales» encuentre «PASE IMPERSONAL». */
export function singular(p) {
  if (p.length > 4 && /[lrndjz]es$/.test(p)) return p.slice(0, -2);
  if (p.length > 3 && p.endsWith("s")) return p.slice(0, -1);
  return p;
}

// Lo que se busca con una palabra y en la factura está escrito con otra.
const PARECIDOS = {
  comida: ["comida", "alimentacion", "almuerzo", "desayuno", "merienda", "cena", "refrigerio", "hidratacion"],
  alimentacion: ["comida", "alimentacion", "almuerzo", "desayuno", "merienda", "cena", "refrigerio"],
  fenolico: ["fenolico", "fenolica", "plywood", "triplex"],
};

const palabras = texto => palabrasDe(texto).map(singular);

/**
 * Los renglones que dicen todas las palabras buscadas, y su suma.
 *
 * @param renglones  los de `conIva` (con total con IVA y factura_id)
 * @returns null sin búsqueda; si no { renglones, cantidad, unidad, facturas, total }
 */
export function loQueSeBusco(renglones = [], texto = "") {
  const buscadas = palabras(texto);
  if (!buscadas.length) return null;
  const opciones = buscadas.map(b => PARECIDOS[b] || [b]);
  const coinciden = renglones.filter(r => {
    const tiene = palabras(r.descripcion);
    return opciones.every(ops => ops.some(o => tiene.some(w => w === o || (o.length >= 4 && w.startsWith(o)))));
  });
  const unidades = new Set(coinciden.map(r => r.unidad || "u"));
  const r2 = v => Math.round(v * 100) / 100;
  return {
    renglones: coinciden,
    cantidad: r2(coinciden.reduce((t, r) => t + (Number(r.cantidad) || 0), 0)),
    unidad: unidades.size === 1 ? [...unidades][0] : "varias",
    facturas: new Set(coinciden.map(r => String(r.factura_id))).size,
    total: r2(coinciden.reduce((t, r) => t + (Number(r.total) || 0), 0)),
  };
}
