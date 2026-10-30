import test from "node:test";
import assert from "node:assert/strict";
import { honorariosComoItems, totalesPresupuesto, CAPITULO_HONORARIOS } from "../src/modules/presupuestos/honorarios.js";

// Diners Aéreo: costo directo $149.675,89 y 10% de administración.
const aereo = { honorarios: [{ nombre: "Honorarios de administración", tipo: "pct", valor: 10 }], iva_pct: 15 };
const SUB = 149675.89;

test("el honorario se vuelve un renglón con su monto", () => {
  const items = honorariosComoItems(aereo, SUB);
  assert.equal(items.length, 1);
  assert.equal(items[0].capitulo, CAPITULO_HONORARIOS);
  assert.equal(items[0].descripcion, "Honorarios de administración (10 %)");
  assert.equal(items[0].total, 14967.59);
  assert.equal(items[0].cantidad, 1);
});

test("el cliente paga lo mismo: cambia dónde está, no cuánto es", () => {
  const antes = totalesPresupuesto(SUB, aereo);
  const items = honorariosComoItems(aereo, SUB);
  const subDespues = Math.round((SUB + items.reduce((t, x) => t + x.total, 0)) * 100) / 100;
  // Ya como capítulo, el presupuesto no lleva honorarios al pie.
  const despues = totalesPresupuesto(subDespues, { iva_pct: 15, honorarios: [] });
  assert.equal(antes.total, 189340);
  assert.equal(despues.total, 189340);
  assert.equal(despues.subtotal, 164643.48);
});

test("un honorario de monto fijo también entra, con su nombre", () => {
  const items = honorariosComoItems({ honorarios: [{ nombre: "Dirección técnica", tipo: "monto", valor: 5000 }] }, SUB);
  assert.equal(items[0].total, 5000);
  assert.equal(items[0].descripcion, "Dirección técnica");
});

test("un honorario en cero no ensucia el presupuesto con un renglón vacío", () => {
  assert.equal(honorariosComoItems({ honorarios: [{ nombre: "Diseño", tipo: "pct", valor: 0 }] }, SUB).length, 0);
});

test("sin honorarios no hay capítulo que crear", () => {
  assert.deepEqual(honorariosComoItems({ honorarios: [] }, SUB), []);
  assert.deepEqual(honorariosComoItems({}, SUB), []);
});

test("el 10% de un presupuesto viejo, con el porcentaje único de antes", () => {
  const items = honorariosComoItems({ honorarios_pct: 10 }, 1000);
  assert.equal(items[0].total, 100);
  assert.equal(items[0].descripcion, "Honorarios (10 %)");
});
