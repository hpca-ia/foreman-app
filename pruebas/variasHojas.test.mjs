import test from "node:test";
import assert from "node:assert/strict";
import { interpretarPresupuesto, interpretarVariasHojas } from "../src/modules/controlObra/leerPresupuesto.js";

// Un presupuesto repartido en hojas —casa, wellness, servicios— con el cuadro
// de áreas al pie de la primera, que es donde se rompía todo.

const MAPA = { fila_encabezado: 1, col_item: 0, col_descripcion: 1, col_unidad: 2, col_cantidad: 3, col_precio: 4, col_total: 5, col_capitulo: null };
const enc = ["RUBRO", "DESCRIPCION", "UNIDAD", "CANTIDAD", "P.UNITARIO", "TOTAL"];

const casa = [
  ["PRESUPUESTO", "", "", "", "", ""],
  enc,
  ["", "OBRAS PRELIMINARES", "", "", "", 300],
  ["1", "Cerramiento provisional", "ml", 100, 2, 200],
  ["2", "Replanteo", "m2", 50, 2, 100],
  ["", "TOTAL", "", "", "Valor total", 300],
  // EL CUADRO DE ÁREAS DEL PIE: sus celdas caen en unidad, cantidad y total.
  ["", "", "", "ÁREA (m2)", "", ""],
  ["", "", "AREA VERDE", 6499.45, "", 300],
  ["", "", "CAMINERIAS", 582, "", 120],
  ["", "", "TOTAL", 7081.45, "", 420],
];
const wellness = [
  ["PRESUPUESTO", "", "", "", "", ""],
  enc,
  ["", "OBRAS PRELIMINARES", "", "", "", 120],
  ["4", "Replanteo", "m2", 40, 3, 120],
  ["", "TOTAL", "", "", "Valor total", 120],
];

test("el cuadro de áreas del pie no es parte del presupuesto", () => {
  // Antes entraba como tres rubros que sumaban el presupuesto entero otra vez.
  const r = interpretarPresupuesto(casa, { ...MAPA });
  const suma = r.rubros.reduce((t, x) => t + Number(x.total || 0), 0);
  assert.equal(suma, 300, "solo los dos rubros de verdad");
  assert.equal(r.rubros.some(x => /AREA VERDE|CAMINERIAS/i.test(x.descripcion)), false);
  assert.equal(r.cargos.some(c => /AREA VERDE|CAMINERIAS/i.test(c.descripcion)), false);
});

test("cada hoja cuadra contra su propio total", () => {
  const r = interpretarVariasHojas([
    { nombre: "CASA", filas: casa, mapa: { ...MAPA } },
    { nombre: "WELLNESS", filas: wellness, mapa: { ...MAPA } },
  ]);
  assert.equal(r.hojas.length, 2);
  assert.equal(r.hojas[0].total, 300);
  assert.equal(r.hojas[0].declarado, 300);
  assert.equal(r.hojas[1].total, 120);
});

// Quedarse con el total de la última hoja hacía que un presupuesto de ocho
// millones se comparara contra los trescientos mil de la hoja de servicios.
test("el total declarado es la suma de los de cada hoja", () => {
  const r = interpretarVariasHojas([
    { nombre: "CASA", filas: casa, mapa: { ...MAPA } },
    { nombre: "WELLNESS", filas: wellness, mapa: { ...MAPA } },
  ]);
  assert.equal(r.totalExcel, 420);
  assert.equal(r.sumaRubros + r.sumaCargos, 420);
});

// "OBRAS PRELIMINARES" esta en las dos hojas. Fundidas en un solo capitulo,
// ya no se puede controlar cada obra por separado.
test("un capitulo que se llama igual en dos hojas no se funde", () => {
  const r = interpretarVariasHojas([
    { nombre: "CASA", filas: casa, mapa: { ...MAPA } },
    { nombre: "WELLNESS", filas: wellness, mapa: { ...MAPA } },
  ]);
  assert.equal(r.capitulos.filter(c => /PRELIMINARES/.test(c)).length, 2);
  assert.ok(r.capitulos.includes("CASA · OBRAS PRELIMINARES"));
  assert.ok(r.capitulos.includes("WELLNESS · OBRAS PRELIMINARES"));
});

test("una sola hoja se lee como siempre, sin prefijo de bloque", () => {
  const r = interpretarVariasHojas([{ nombre: "CASA", filas: casa, mapa: { ...MAPA } }]);
  assert.ok(r.capitulos.includes("OBRAS PRELIMINARES"));
  assert.equal(r.totalExcel, 300);
});
