// Buscar en todas las cajas chicas por RUC, factura o local (Hernán, 28/11/2026).
import test from "node:test";
import assert from "node:assert/strict";
import { buscarEnGastos } from "../src/modules/cajaChica/buscarEnGastos.js";

const G = [
  { id: 32, caja_id: 8, proveedor: "ATIMASA S.A.", ruc: "0991331859001", numero_factura: "075-051-000483003", descripcion: "DIESEL PREMIUM" },
  { id: 97, caja_id: 9, proveedor: "COMERCIAL KYWI S.A.", ruc: "1790041220001", numero_factura: "027-902-000015865", descripcion: "COCHE CONVERTIBLE" },
  { id: 221, caja_id: 9, proveedor: "COMERCIAL KYWI S.A.", ruc: "1790041220001", numero_factura: "027-902-000016544", descripcion: "Devolución de 4 tapones PVC" },
  { id: 5, caja_id: 11, proveedor: "Terminal Aeroportuaria de Guayaquil S.A.-TAGSA", descripcion: "Emisión de pase impersonal 18 noviembre", notas: "para los de Enetsa" },
];
const ids = r => r.map(g => g.id);

test("por local, sin importar mayúsculas ni tildes", () => {
  assert.deepEqual(ids(buscarEnGastos(G, "kywi")), [97, 221]);
  assert.deepEqual(ids(buscarEnGastos(G, "emision pase")), [5]);
});

test("por RUC, entero o sin el 001", () => {
  assert.deepEqual(ids(buscarEnGastos(G, "1790041220001")), [97, 221]);
  assert.deepEqual(ids(buscarEnGastos(G, "0991331859")), [32]);
});

test("por número de factura, con o sin guiones, o solo el final", () => {
  assert.deepEqual(ids(buscarEnGastos(G, "027-902-000015865")), [97]);
  assert.deepEqual(ids(buscarEnGastos(G, "027902000016544")), [221]);
  assert.deepEqual(ids(buscarEnGastos(G, "16544")), [221]);
});

test("varias palabras: todas; también en la nota; vacío no trae nada", () => {
  assert.deepEqual(ids(buscarEnGastos(G, "kywi tapones")), [221]);
  assert.deepEqual(ids(buscarEnGastos(G, "enetsa")), [5]);
  assert.deepEqual(buscarEnGastos(G, "  "), []);
});
