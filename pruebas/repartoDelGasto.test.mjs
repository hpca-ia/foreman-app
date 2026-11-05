import { test } from "node:test";
import assert from "node:assert/strict";
import { repartoDelGasto } from "../src/modules/cajaChica/repartoDelGasto.js";

// ── EL RUBRO QUE SE ELIGIÓ TIENE QUE GRABARSE ──────────────────────────────
//
// El caso: un almuerzo de $89,85 en la caja chica de Diners Aeropuerto. Se
// elegía el rubro, se grababa, y el gasto seguía diciendo "sin rubro todavía".
// El renglón del rubro guardaba el monto que el documento tenía al elegirlo
// —cero, si todavía no estaba leído— y lo que vale cero no se guardaba.

test("un solo rubro se lleva el documento entero, aunque su renglón haya quedado en cero", () => {
  assert.deepEqual(repartoDelGasto([{ obra_rubro_id: 1423, monto: 0 }], "89.85"),
    [{ obra_rubro_id: 1423, monto: 89.85 }]);
  assert.deepEqual(repartoDelGasto([{ obra_actividad_id: 7, monto: "" }], 50),
    [{ obra_actividad_id: 7, monto: 50 }]);
});

test("un solo rubro sigue al documento si el monto se corrigió después de elegirlo", () => {
  assert.deepEqual(repartoDelGasto([{ obra_rubro_id: 1423, monto: 80 }], 89.85),
    [{ obra_rubro_id: 1423, monto: 89.85 }]);
});

test("sin rubro elegido no hay nada que asignar", () => {
  assert.deepEqual(repartoDelGasto([], 89.85), []);
  assert.deepEqual(repartoDelGasto([{ monto: 89.85 }], 89.85), [], "un renglón sin destino no es una asignación");
  assert.deepEqual(repartoDelGasto(null, 10), []);
});

test("repartido en varios, va lo que se escribió en cada uno", () => {
  assert.deepEqual(repartoDelGasto([{ obra_rubro_id: 1, monto: 60 }, { obra_rubro_id: 2, monto: 29.85 }], 89.85),
    [{ obra_rubro_id: 1, monto: 60 }, { obra_rubro_id: 2, monto: 29.85 }]);
});

test("si uno solo quedó en cero, se lleva lo que falta para completar el documento", () => {
  assert.deepEqual(repartoDelGasto([{ obra_rubro_id: 1, monto: 60 }, { obra_rubro_id: 2, monto: 0 }], 89.85),
    [{ obra_rubro_id: 1, monto: 60 }, { obra_rubro_id: 2, monto: 29.85 }]);
});

test("con varios en cero no se adivina: se guardan los que tienen monto", () => {
  assert.deepEqual(repartoDelGasto(
    [{ obra_rubro_id: 1, monto: 60 }, { obra_rubro_id: 2, monto: 0 }, { obra_rubro_id: 3, monto: 0 }], 89.85),
  [{ obra_rubro_id: 1, monto: 60 }]);
});

test("los montos salen positivos: el signo lo pone el documento", () => {
  assert.deepEqual(repartoDelGasto([{ obra_rubro_id: 1, monto: -99.97 }], -99.97), [{ obra_rubro_id: 1, monto: 99.97 }]);
  assert.deepEqual(repartoDelGasto([{ obra_rubro_id: 1, monto: -40 }, { obra_rubro_id: 2, monto: -59.97 }], -99.97),
    [{ obra_rubro_id: 1, monto: 40 }, { obra_rubro_id: 2, monto: 59.97 }]);
});
