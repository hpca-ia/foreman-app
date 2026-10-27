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

// LAS HOJAS COMO BLOQUES: un capítulo se mueve dentro de su hoja y las hojas
// se mueven enteras.
import { juntarPorHoja, correrEnSuHoja, llevarEnSuHoja, moverHoja } from "../src/modules/presupuestos/moverEnGrupo.js";

const H = ["CASA · A", "CASA · B", "CASA · C", "CUIDADOR · D", "CUIDADOR · E", "EXTERIOR · F"];

test("una hoja desordenada se junta sin cambiar el orden de las hojas", () => {
  assert.deepEqual(juntarPorHoja(["CASA · A", "CUIDADOR · D", "CASA · B", "CUIDADOR · E"]),
    ["CASA · A", "CASA · B", "CUIDADOR · D", "CUIDADOR · E"]);
});

test("un capítulo no se pasa a otra hoja al subirlo o bajarlo", () => {
  assert.deepEqual(correrEnSuHoja(H, ["CUIDADOR · D"], -1), H);          // ya es el primero de su hoja
  assert.deepEqual(correrEnSuHoja(H, ["CASA · C"], 1), H);               // ya es el último de su hoja
  assert.deepEqual(correrEnSuHoja(H, ["CUIDADOR · E"], -1),
    ["CASA · A", "CASA · B", "CASA · C", "CUIDADOR · E", "CUIDADOR · D", "EXTERIOR · F"]);
});

test("al principio y al final, de su hoja", () => {
  assert.deepEqual(llevarEnSuHoja(H, ["CASA · C"], "inicio"), ["CASA · C", "CASA · A", "CASA · B", "CUIDADOR · D", "CUIDADOR · E", "EXTERIOR · F"]);
  assert.deepEqual(llevarEnSuHoja(H, ["CUIDADOR · D"], "final"), ["CASA · A", "CASA · B", "CASA · C", "CUIDADOR · E", "CUIDADOR · D", "EXTERIOR · F"]);
});

test("una hoja se mueve entera, con sus capítulos en su orden", () => {
  assert.deepEqual(moverHoja(H, "CUIDADOR", -1), ["CUIDADOR · D", "CUIDADOR · E", "CASA · A", "CASA · B", "CASA · C", "EXTERIOR · F"]);
  assert.deepEqual(moverHoja(H, "EXTERIOR", 1), H);
});
