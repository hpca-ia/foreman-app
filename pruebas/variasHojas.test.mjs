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

// ── EL IVA EN COLUMNA APARTE ──────────────────────────────────────────────
//
// Los honorarios y los indirectos son un porcentaje del costo directo. Si el
// costo directo trae el impuesto adentro, el honorario se cobra sobre el IVA.

const CON_IVA = { fila_encabezado: 1, col_item: 0, col_descripcion: 1, col_unidad: 2, col_cantidad: 3, col_precio: 4, col_total: 7, col_capitulo: null };
const encIva = ["RUBRO", "DESCRIPCION", "UNIDAD", "CANTIDAD", "P.UNITARIO", "IVA 15%", "P.U CON IVA", "TOTAL"];
// Seis renglones y no dos: la tasa se reconoce sobre la planilla, no sobre un
// par de filas, porque una coincidencia en dos filas no es una regla.
const hojaIva = [
  ["PRESUPUESTO", "", "", "", "", "", "", ""],
  encIva,
  ["", "PRELIMINARES", "", "", "", "", "", 6900],
  ["1", "Cerramiento", "ml", 100, 10, 1.5, 11.5, 1150],
  ["2", "Replanteo", "m2", 50, 20, 3, 23, 1150],
  ["3", "Desalojo", "m3", 20, 50, 7.5, 57.5, 1150],
  ["4", "Excavación", "m3", 10, 100, 15, 115, 1150],
  ["5", "Relleno", "m3", 25, 40, 6, 46, 1150],
  ["6", "Compactado", "m2", 5, 200, 30, 230, 1150],
  ["", "TOTAL", "", "", "Valor total", "", "", 6900],
];

test("el precio unitario entra SIN IVA, como está escrito", () => {
  const r = interpretarPresupuesto(hojaIva, { ...CON_IVA });
  const c = r.rubros.find(x => /Cerramiento/.test(x.descripcion));
  assert.equal(c.precio_unitario, 10, "no 11,5");
  assert.equal(c.iva_pct, 15);
  assert.equal(c.total, 1150, "el total sigue siendo el del Excel, con IVA");
});

test("la base sin IVA se dice, y es la de los honorarios", () => {
  const r = interpretarPresupuesto(hojaIva, { ...CON_IVA });
  assert.equal(r.ivaPorFila, 15);
  assert.equal(r.baseSinIva, 6000);
  // 10 % de honorarios: 200 sobre la base, 230 sobre el total. La diferencia
  // son honorarios cobrados sobre el impuesto.
  assert.equal(Math.round(r.baseSinIva * 0.1), 600);
});

test("cada rubro multiplica: cantidad × precio × IVA = total", () => {
  const r = interpretarPresupuesto(hojaIva, { ...CON_IVA });
  for (const x of r.rubros) {
    assert.ok(Math.abs(x.cantidad * x.precio_unitario * 1.15 - x.total) < 0.02,
      `${x.descripcion} no multiplica`);
  }
});

// Una columna que NO es un recargo parejo es una columna equivocada, y ahí sí
// hay que corregir el mapa en vez de inventar un impuesto.
test("una diferencia despareja no se confunde con IVA", () => {
  const raro = [
    ["PRESUPUESTO", "", "", "", "", "", "", ""],
    encIva,
    ["1", "Uno", "u", 10, 3, 0, 7, 70],
    ["2", "Dos", "u", 10, 5, 0, 31, 310],
    ["3", "Tres", "u", 10, 2, 0, 9, 90],
    ["4", "Cuatro", "u", 10, 8, 0, 11, 110],
    ["5", "Cinco", "u", 10, 1, 0, 40, 400],
  ];
  const r = interpretarPresupuesto(raro, { ...CON_IVA });
  assert.equal(r.ivaPorFila, null, "sin tasa pareja no se anota ningún IVA");
});
