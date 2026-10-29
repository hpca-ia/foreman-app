import test from "node:test";
import assert from "node:assert/strict";
import { costoDeLaOrden, gastoLimpio, queFaltaSaber } from "../src/modules/controlObra/costoDeLaOrden.js";
import { margenDeOrden } from "../src/modules/controlObra/cuentaOrdenCambio.js";

// La OC-01 de Plaza Lagos, con su proforma ya sin IVA.
const lineas = [{ id: 1, tipo: "aumenta", cantidad: 8, precio_unitario: 215.83, costo_unitario: 151.0598 }];

test("sin gastos sueltos, el costo es el de las partidas", () => {
  const c = costoDeLaOrden({ lineas });
  assert.equal(c.cobrado, 1726.64);
  assert.equal(c.costo, 1208.48);
  assert.equal(c.margen, 518.16);
  assert.equal(c.pct, 30);
  assert.equal(c.sabido, true);
});

test("el flete y la mano de obra bajan el margen de verdad", () => {
  const c = costoDeLaOrden({ lineas, gastos: [
    { monto: 120, estado: "real" },
    { monto: 80, estado: "cotizado" },
  ] });
  assert.equal(c.dePartidas, 1208.48);
  assert.equal(c.sueltos, 200);
  assert.equal(c.costo, 1408.48);
  assert.equal(c.margen, 318.16);
  assert.equal(c.pagados, 120);
  assert.equal(c.porPagar, 80);
});

test("una reducción baja lo cobrado pero no entra al margen, como en la liquidación", () => {
  // Lo que deja una reducción ya está en el presupuesto: restar su precio sin
  // restar lo que se ahorra al no hacerla inventa una pérdida.
  const c = costoDeLaOrden({ lineas: [
    { tipo: "quita", cantidad: 10, precio_unitario: 100 },
    { tipo: "aumenta", cantidad: 1, precio_unitario: 400, costo_unitario: 250 },
  ] });
  assert.equal(c.cobrado, -600);
  assert.equal(c.cobradoConCosto, 400);
  assert.equal(c.costo, 250);
  assert.equal(c.margen, 150);
  assert.equal(c.reducciones, 1);
});

test("el margen de la caja es el mismo que el de la liquidación", () => {
  // El caso que se veía: $1.200 · 60% en la caja, $200 · 20% en la liquidación.
  const lineas = [
    { tipo: "aumenta", cantidad: 1, precio_unitario: 1000, costo_unitario: 800 },
    { tipo: "aumenta", cantidad: 1, precio_unitario: 1000, costo_unitario: null },
  ];
  const c = costoDeLaOrden({ lineas });
  const m = margenDeOrden(lineas);
  assert.equal(c.cobrado, 2000);
  assert.equal(c.margen, m.margen);
  assert.equal(c.margen, 200);
  assert.equal(c.pct, 20);
});

test("una partida sin costo no se cuenta como costo cero, y se dice", () => {
  const c = costoDeLaOrden({ lineas: [
    { tipo: "aumenta", cantidad: 1, precio_unitario: 500, costo_unitario: 300 },
    { tipo: "aumenta", cantidad: 1, precio_unitario: 200 },
  ] });
  assert.equal(c.costo, 300);
  assert.equal(c.sinCosto, 1);
  assert.equal(c.sabido, false);
  assert.match(queFaltaSaber(c), /1 partida sin costo/);
});

test("un gasto escrito con IVA se guarda sin IVA, y queda dicho cuánto era", () => {
  const g = gastoLimpio({ descripcion: " Flete del generador ", monto: 115, iva: 15 });
  assert.equal(g.monto, 100);
  assert.equal(g.iva, 15);
  assert.equal(g.descripcion, "Flete del generador");
  assert.equal(g.estado, "cotizado");
});

test("sin IVA el monto se guarda tal cual", () => {
  assert.equal(gastoLimpio({ descripcion: "Andamio", monto: 90 }).monto, 90);
});

test("una orden vacía no finge un margen", () => {
  const c = costoDeLaOrden({});
  assert.equal(c.margen, 0);
  assert.equal(c.sabido, false);
  assert.equal(queFaltaSaber(c), "Todavía no tiene partidas ni gastos.");
});

test("con todo cotizado y nada pagado no sobra el aviso de lo pagado", () => {
  const c = costoDeLaOrden({ lineas, gastos: [{ monto: 50, estado: "cotizado" }] });
  assert.equal(queFaltaSaber(c), null);
});
