import test from "node:test";
import assert from "node:assert/strict";
import { totales, netoPorRubro, esPrevisto, contraQueSeMide } from "../src/modules/controlObra/cuentaBeneficios.js";

const b = [
  { obra_rubro_id: 1, presupuestado: 1000, real: 800, estado: "confirmado" },   // +200
  { obra_rubro_id: 1, presupuestado: 500, real: 560, estado: "confirmado" },    // −60
  { obra_rubro_id: 2, presupuestado: 2000, real: 1500, estado: "previsto" },    // +500, todavía no
  { obra_rubro_id: null, presupuestado: 300, real: 250 },                       // +50, sin estado = confirmado
];

test("el ahorro y el sobreprecio se cuentan por separado", () => {
  const t = totales(b);
  assert.equal(t.ahorro, 250);
  assert.equal(t.sobreprecio, 60);
  assert.equal(t.neto, 190);
});

test("lo previsto no entra en el neto: es una proforma, no una compra", () => {
  const t = totales(b);
  assert.equal(t.previsto, 500);
  assert.equal(t.cuantosPrevistos, 1);
  assert.equal(t.cuantos, 3);
});

test("sin estado se cuenta como confirmado: es lo que había antes", () => {
  assert.equal(esPrevisto({ presupuestado: 1, real: 0 }), false);
  assert.equal(esPrevisto({ estado: "previsto" }), true);
});

test("por rubro solo cuenta lo comprado", () => {
  const m = netoPorRubro(b);
  assert.equal(m[1], 140);
  assert.equal(m[2], undefined);
});

test("sin beneficios no revienta y da todo en cero", () => {
  const t = totales([]);
  assert.deepEqual([t.neto, t.ahorro, t.sobreprecio, t.previsto, t.cuantos], [0, 0, 0, 0, 0]);
  assert.deepEqual(netoPorRubro([]), {});
});

test("el rubro nuevo de una orden no se mide contra el presupuesto: no estaba", () => {
  // Un rubro que no existía ni en el presupuesto ni en el control entra el rato
  // que el cliente aprueba la orden, y desde entonces su presupuesto ES el
  // precio de la orden. Buscarle una base en el presupuesto es buscar algo que
  // nunca existió, y es lo que hace pensar que el margen está mal.
  const r = contraQueSeMide(
    [{ id: 1, estado: "aprobada" }, { id: 2, estado: "borrador" }],
    { 1: [{ obra_rubro_id: 7, tipo: "aumenta" }, { tipo: "aumenta" }, { tipo: "quita", obra_rubro_id: 9 }],
      2: [{ tipo: "aumenta" }] });
  assert.equal(r.sobreRubros, 1);
  assert.equal(r.nuevas, 1);
  assert.match(r.frase, /no existía ni en el presupuesto ni en el control/);
});

test("sin órdenes aprobadas no hay nada que explicar", () => {
  assert.equal(contraQueSeMide([], {}), null);
  assert.equal(contraQueSeMide([{ id: 1, estado: "aprobada", anulada: true }], { 1: [{ tipo: "aumenta" }] }), null);
});
