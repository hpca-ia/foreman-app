import test from "node:test";
import assert from "node:assert/strict";
import { jsonTolerante } from "../src/lib/jsonTolerante.js";

// Leer una respuesta de NOVA que llegó cortada. Pasa de verdad: una propuesta
// de cronograma con veinte agrupaciones no entra entera, y perder todo por el
// último renglón es perder media hora de cálculo por un carácter.

test("un JSON entero se lee entero", () => {
  const { datos, cortado } = jsonTolerante('{"a":1,"b":[2,3]}');
  assert.deepEqual(datos, { a: 1, b: [2, 3] });
  assert.equal(cortado, false);
});

test("lo que viene envuelto en markdown también", () => {
  assert.deepEqual(jsonTolerante('```json\n{"a":1}\n```').datos, { a: 1 });
});

test("cortado a la mitad: se salva lo que llegó completo", () => {
  const { datos, cortado } = jsonTolerante('{"actividades":[{"id":1,"dias":5},{"id":2,"dias":8},{"id":3,"di');
  assert.ok(datos, "tiene que devolver algo");
  assert.equal(cortado, true);
  assert.equal(datos.actividades.length, 2, "las dos que llegaron enteras");
});

test("texto antes del JSON no estorba", () => {
  assert.deepEqual(jsonTolerante('Acá va el cronograma:\n{"a":1}').datos, { a: 1 });
});

test("sin nada parecido a JSON, devuelve nulo y lo dice", () => {
  assert.equal(jsonTolerante("no pude armarlo").datos, null);
  assert.equal(jsonTolerante("").datos, null);
  assert.equal(jsonTolerante(undefined).datos, null);
});
