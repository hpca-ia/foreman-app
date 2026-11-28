// Cuántos de eso se compraron (Hernán, 28/11/2026: «cuántos de esos pagos hay...
// o cuántos pagos de comida o cuánto cemento o cuántos tableros fenólicos»).
import test from "node:test";
import assert from "node:assert/strict";
import { loQueSeBusco, singular } from "../src/modules/controlObra/buscarComprado.js";

// Renglones como los del Aeropuerto el 28/11.
const R = [
  { factura_id: 1, descripcion: "EMISION PASE IMPERSONAL 19 NOVIEMBRE", cantidad: 5, unidad: "u", total: 25 },
  { factura_id: 1, descripcion: "EMISION PASE IMPERSONAL 20 NOVIEMBRE", cantidad: 5, unidad: "u", total: 25 },
  { factura_id: 2, descripcion: "EMISION PASE IMPERSONAL 26 OCTUBRE", cantidad: 1, unidad: "u", total: 5 },
  { factura_id: 3, descripcion: "EMISION PASE PROVISORIO 2 MESES", cantidad: 9, unidad: "u", total: 78.12 },
  { factura_id: 4, descripcion: "Alimentación", cantidad: 11, unidad: "u", total: 33 },
  { factura_id: 5, descripcion: "TABLERO FENOLICO 15MM", cantidad: 4, unidad: "u", total: 160 },
  { factura_id: 6, descripcion: "CEMENTO HOLCIM 50KG", cantidad: 56, unidad: "saco", total: 824.96 },
];

test("«pases impersonales» cuenta solo los impersonales, no los provisorios", () => {
  const r = loQueSeBusco(R, "pases impersonales");
  assert.equal(r.renglones.length, 3);
  assert.equal(r.cantidad, 11);
  assert.equal(r.facturas, 2);
  assert.equal(r.total, 55);
});

test("«comida» encuentra lo que en la factura dice «Alimentación»", () => {
  assert.equal(loQueSeBusco(R, "comida").total, 33);
});

test("«tableros fenólicos» y «cemento»", () => {
  assert.equal(loQueSeBusco(R, "tableros fenólicos").cantidad, 4);
  const c = loQueSeBusco(R, "cemento");
  assert.deepEqual([c.cantidad, c.unidad, c.total], [56, "saco", 824.96]);
});

test("sin búsqueda no hay suma; plural a singular sin romper palabras cortas", () => {
  assert.equal(loQueSeBusco(R, "  "), null);
  assert.deepEqual(["pases", "impersonales", "tableros", "mes", "gas"].map(singular), ["pase", "impersonal", "tablero", "mes", "gas"]);
});
