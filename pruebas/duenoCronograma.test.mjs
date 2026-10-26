import test from "node:test";
import assert from "node:assert/strict";
import { dueno, filaDe, claveDe, presupuestoComoDueno, esDePresupuesto }
  from "../src/modules/cronograma/dueno.js";

// DE QUIÉN ES UN CRONOGRAMA: un proyecto o un presupuesto, nunca mezclados.

test("un número suelto es un proyecto, como antes", () => {
  assert.deepEqual(dueno(7), { tabla: "leads", campo: "lead_id", id: 7 });
  assert.deepEqual(filaDe(7), { lead_id: 7 });
});

test("un proyecto se guarda en el proyecto", () => {
  assert.deepEqual(filaDe({ id: 7, nombre: "Casa Fowler" }), { lead_id: 7 });
});

test("un presupuesto se guarda en el presupuesto, aunque tenga proyecto", () => {
  const p = presupuestoComoDueno({ id: 7, nombre: "Casa Fowler (v2)", lead_id: 3 });
  assert.ok(esDePresupuesto(p));
  assert.equal(p.obra_id, null);
  assert.deepEqual(filaDe(p), { presupuesto_id: 7 });
  assert.equal(dueno(p).tabla, "presupuestos");
});

test("el proyecto 7 y el presupuesto 7 no se confunden", () => {
  assert.notEqual(claveDe(7), claveDe(presupuestoComoDueno({ id: 7 })));
});

test("sin dueño no hay nada que leer", () => {
  assert.equal(dueno(null), null);
  assert.deepEqual(filaDe(undefined), {});
});
