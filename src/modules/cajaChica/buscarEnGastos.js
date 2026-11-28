import { normal } from "../../lib/filtrarGastos.js";

// Buscar un gasto de caja chica por RUC, número de factura, local o lo que se
// compró (Hernán, 28/11/2026). Para probarlo sin pantalla
// (pruebas/buscarEnCajas.test.mjs).

const digitos = s => String(s ?? "").replace(/\D/g, "");
const CAMPOS = ["proveedor", "descripcion", "numero_factura", "ruc", "notas"];

/**
 * Los gastos que dicen todas las palabras, en cualquier campo.
 *
 * Un número se compara sin guiones ni espacios: «027-902-000015865»,
 * «027902000015865» y «15865» encuentran la misma factura, y «0991331859»
 * encuentra el RUC de ATIMASA sin el 001.
 */
export function buscarEnGastos(gastos = [], texto = "") {
  const palabras = normal(texto).split(/\s+/).filter(Boolean);
  if (!palabras.length) return [];
  return gastos.filter(g => {
    const heno = CAMPOS.map(c => normal(g[c])).join(" ");
    const numeros = digitos(g.ruc) + " " + digitos(g.numero_factura);
    return palabras.every(p => heno.includes(p) || (digitos(p).length >= 4 && digitos(p) === p.replace(/[-\s.]/g, "") && numeros.includes(digitos(p))));
  });
}
