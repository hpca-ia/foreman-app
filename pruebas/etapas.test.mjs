import test from "node:test";
import assert from "node:assert/strict";
import { subtotalesPorEtapa, etapasUsadas, tieneEtapas, SIN_ETAPA }
  from "../src/modules/presupuestos/etapas.js";

const items = [
  { id: 1, etapa: "Etapa 1 - obra gris", total: 1200.5 },
  { id: 2, etapa: "Etapa 1 - obra gris", total: 800 },
  { id: 3, etapa: "Etapa 2 - acabados", total: 500 },
  { id: 4, etapa: null, total: 300 },
  { id: 5, etapa: "   ", total: 100 },
];

test("suma cada etapa por su cuenta", () => {
  const r = subtotalesPorEtapa(items);
  assert.equal(r.find(x => x.etapa.startsWith("Etapa 1")).total, 2000.5);
  assert.equal(r.find(x => x.etapa.startsWith("Etapa 2")).total, 500);
});

test("lo que no tiene etapa va junto y AL FINAL", () => {
  // Es lo que todavía no se decidió: mezclarlo con las etapas de verdad
  // escondería justamente eso.
  const r = subtotalesPorEtapa(items);
  assert.equal(r[r.length - 1].etapa, SIN_ETAPA);
  assert.equal(r[r.length - 1].total, 400, "el nulo y el que tiene espacios cuentan juntos");
});

test("la suma de las etapas es el total del presupuesto", () => {
  const r = subtotalesPorEtapa(items);
  const suma = r.reduce((t, x) => t + x.total, 0);
  const total = items.reduce((t, i) => t + Number(i.total), 0);
  assert.equal(Math.round(suma * 100), Math.round(total * 100));
});

test("ORDEN NATURAL: la etapa 2 va antes que la 10, no después", () => {
  // Alfabéticamente "Etapa 10" < "Etapa 2", y esa es la clase de detalle que
  // hace que una pantalla se sienta rota sin que nadie sepa explicar por qué.
  const r = subtotalesPorEtapa([
    { etapa: "Etapa 10", total: 1 }, { etapa: "Etapa 2", total: 1 }, { etapa: "Etapa 1", total: 1 },
  ]);
  assert.deepEqual(r.map(x => x.etapa), ["Etapa 1", "Etapa 2", "Etapa 10"]);
});

test("cuenta los rubros de cada etapa", () => {
  assert.equal(subtotalesPorEtapa(items).find(x => x.etapa.startsWith("Etapa 1")).rubros, 2);
});

test("ofrece las etapas que ya existen, sin repetir ni las vacías", () => {
  assert.deepEqual(etapasUsadas(items), ["Etapa 1 - obra gris", "Etapa 2 - acabados"]);
});

test("un presupuesto sin etapas no muestra el desglose", () => {
  assert.equal(tieneEtapas([{ total: 5 }, { total: 9 }]), false);
});

test("con UNA sola etapa tampoco: no dice nada que el total no diga", () => {
  assert.equal(tieneEtapas([{ etapa: "Etapa 1", total: 5 }, { total: 9 }]), false);
});

test("con dos, sí", () => {
  assert.equal(tieneEtapas(items), true);
});

test("sin rubros no revienta", () => {
  assert.deepEqual(subtotalesPorEtapa([]), []);
  assert.deepEqual(etapasUsadas([]), []);
});
