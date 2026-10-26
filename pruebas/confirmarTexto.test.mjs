import test from "node:test";
import assert from "node:assert/strict";
import { igualParaConfirmar } from "../src/lib/confirmarTexto.js";

const NOMBRE = "FORMATO ÚNICO DE PRESUPUESTO  Remodelación de Oficinas CHRONIX CI";

test("el espacio de más que el navegador no muestra no puede trabar el borrado", () => {
  assert.ok(igualParaConfirmar("FORMATO ÚNICO DE PRESUPUESTO Remodelación de Oficinas CHRONIX CI", NOMBRE));
});

test("perdona mayúsculas, tildes y espacios de los bordes", () => {
  assert.ok(igualParaConfirmar("  formato unico de presupuesto remodelacion de oficinas chronix ci ", NOMBRE));
});

test("no perdona otro nombre: hay que haberlo leído", () => {
  assert.ok(!igualParaConfirmar("FORMATO ÚNICO DE PRESUPUESTO", NOMBRE));
  assert.ok(!igualParaConfirmar("Remodelación de Oficinas CHRONIX CI", NOMBRE));
  assert.ok(!igualParaConfirmar("chronix", NOMBRE));
});

test("vacío nunca confirma, ni contra un nombre vacío", () => {
  assert.ok(!igualParaConfirmar("", NOMBRE));
  assert.ok(!igualParaConfirmar("", ""));
  assert.ok(!igualParaConfirmar("   ", null));
});
