import test from "node:test";
import assert from "node:assert/strict";
import { correrMarcados, llevarMarcados } from "../src/modules/presupuestos/moverEnGrupo.js";

// Mover varios capítulos juntos: el bloque se mueve entero, sin mezclarse y
// sin cambiar el orden entre los marcados.

const L = ["A", "B", "C", "D", "E", "F"];

test("subir un bloque contiguo lo corre un lugar", () => {
  assert.deepEqual(correrMarcados(L, ["C", "D"], -1), ["A", "C", "D", "B", "E", "F"]);
});

test("bajar un bloque contiguo lo corre un lugar", () => {
  assert.deepEqual(correrMarcados(L, ["C", "D"], 1), ["A", "B", "E", "C", "D", "F"]);
});

test("marcados sueltos suben cada uno un lugar, sin saltarse entre ellos", () => {
  assert.deepEqual(correrMarcados(L, ["B", "E"], -1), ["B", "A", "C", "E", "D", "F"]);
});

test("en el borde, el bloque se queda quieto", () => {
  assert.deepEqual(correrMarcados(L, ["A", "B"], -1), L);
  assert.deepEqual(correrMarcados(L, ["E", "F"], 1), L);
});

test("al principio y al final, en su orden", () => {
  assert.deepEqual(llevarMarcados(L, ["E", "C"], "A"), ["C", "E", "A", "B", "D", "F"]);
  assert.deepEqual(llevarMarcados(L, ["B", "D"], null), ["A", "C", "E", "F", "B", "D"]);
});

test("soltados antes de otro capítulo, quedan juntos ahí", () => {
  assert.deepEqual(llevarMarcados(L, ["E", "F"], "B"), ["A", "E", "F", "B", "C", "D"]);
});

test("no se pierde ni se duplica ninguno", () => {
  const r = llevarMarcados(L, ["A", "D", "F"], "C");
  assert.deepEqual([...r].sort(), [...L].sort());
});
