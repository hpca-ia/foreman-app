import test from "node:test";
import assert from "node:assert/strict";
import { esDeCajaChica, cajaChicaPorRubro, resumenCajaChica } from "../src/modules/controlObra/origenGasto.js";

const facturas = [
  { id: 1, origen: "caja_chica", total: 99.97 },
  { id: 2, origen: "manual", total: 1200 },
  { id: 3, origen: "nova", total: 340 },
  { id: 4, origen: "caja_chica", total: -20, clase: null },
];

test("una factura de compra no es caja chica", () => {
  assert.equal(esDeCajaChica(facturas[1]), false);
  assert.equal(esDeCajaChica(facturas[0]), true);
  assert.equal(esDeCajaChica(null), false);
});

test("por rubro: solo lo que vino de la caja", () => {
  const r = cajaChicaPorRubro(facturas, [
    { factura_id: 1, obra_rubro_id: 10, monto: 99.97 },
    { factura_id: 2, obra_rubro_id: 10, monto: 1200 },
    { factura_id: 3, obra_rubro_id: 11, monto: 340 },
  ]);
  assert.deepEqual(r, { 10: 99.97 });
});

test("una nota de crédito de caja chica resta", () => {
  const r = cajaChicaPorRubro(facturas, [
    { factura_id: 1, obra_rubro_id: 10, monto: 99.97 },
    { factura_id: 4, obra_rubro_id: 10, monto: -20 },
  ]);
  assert.deepEqual(r, { 10: 79.97 });
});

test("un rubro que quedó en cero no se marca", () => {
  const r = cajaChicaPorRubro(facturas, [
    { factura_id: 1, obra_rubro_id: 10, monto: 20 },
    { factura_id: 4, obra_rubro_id: 10, monto: -20 },
  ]);
  assert.deepEqual(r, {});
});

test("lo cargado a un capítulo entero no es de ningún rubro", () => {
  const r = cajaChicaPorRubro(facturas, [
    { factura_id: 1, obra_rubro_id: null, capitulo: "OBRAS PRELIMINARES", monto: 99.97 },
  ]);
  assert.deepEqual(r, {});
});

test("el resumen cuenta gastos, no proformas", () => {
  const r = resumenCajaChica([...facturas, { id: 5, origen: "caja_chica", total: 500, clase: "proforma" }]);
  assert.deepEqual(r, { cuantos: 2, monto: 79.97 });
});

test("sin nada, cero y no revienta", () => {
  assert.deepEqual(resumenCajaChica(), { cuantos: 0, monto: 0 });
  assert.deepEqual(cajaChicaPorRubro(), {});
});

test("lo cargado al capítulo entero se cuenta por capítulo", async () => {
  const { cajaChicaPorCapitulo } = await import("../src/modules/controlObra/origenGasto.js");
  const r = cajaChicaPorCapitulo(
    [{ id: 1, origen: "caja_chica" }, { id: 2, origen: "manual" }],
    [
      { factura_id: 1, obra_rubro_id: null, capitulo: "OBRA GRIS", monto: 40 },
      { factura_id: 1, obra_rubro_id: null, capitulo: "OBRA GRIS", monto: 10.5 },
      { factura_id: 2, obra_rubro_id: null, capitulo: "OBRA GRIS", monto: 900 },
      { factura_id: 1, obra_rubro_id: 7, capitulo: "OBRA GRIS", monto: 60 },
    ],
  );
  assert.deepEqual(r, { "OBRA GRIS": 50.5 });
});
