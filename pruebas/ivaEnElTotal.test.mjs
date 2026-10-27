import test from "node:test";
import assert from "node:assert/strict";
import { interpretarPresupuesto, ivaMetidoEnTotales } from "../src/modules/controlObra/leerPresupuesto.js";

// EL IVA METIDO EN EL TOTAL DE CADA FILA.
//
// Un Excel de cliente traía el precio unitario sin IVA y un total por fila que
// era cantidad × precio × 1,15, sin ninguna columna de IVA. No se reconocía: el
// presupuesto entraba con el precio sin IVA y el total con IVA, y al sumarle
// el IVA al final lo cobraba dos veces.

const MAPA = { fila_encabezado: 1, col_item: 0, col_descripcion: 1, col_unidad: 2, col_cantidad: 3, col_precio: 4, col_total: 5, col_capitulo: null };
const enc = ["RUBRO", "DESCRIPCION", "UNIDAD", "CANTIDAD", "P.UNITARIO", "TOTAL"];
const r2 = v => Math.round(v * 100) / 100;
const fila = (n, d, u, c, p) => [String(n), d, u, c, p, r2(c * p * 1.15)];

test("un recargo parejo de 15 % en el total es el IVA", () => {
  const filas = [[10, 2], [5, 30], [7, 12.4], [100, 1.8], [3, 250], [12, 9.9]].map(([c, p]) => ({ cantidad: c, precio: p, total: r2(c * p * 1.15) }));
  assert.equal(ivaMetidoEnTotales(filas), 15);
});

test("si las filas multiplican, no hay IVA metido", () => {
  const filas = [[10, 2], [5, 30], [7, 12.4], [100, 1.8], [3, 250]].map(([c, p]) => ({ cantidad: c, precio: p, total: r2(c * p) }));
  assert.equal(ivaMetidoEnTotales(filas), null);
});

test("una diferencia que cambia de fila en fila no es un impuesto", () => {
  const filas = [[10, 2, 1.1], [5, 30, 1.2], [7, 12.4, 1.05], [100, 1.8, 1.22], [3, 250, 1.15]].map(([c, p, f]) => ({ cantidad: c, precio: p, total: r2(c * p * f) }));
  assert.equal(ivaMetidoEnTotales(filas), null);
});

test("el lector reconoce el IVA metido en el total y deja el precio sin IVA", () => {
  const hoja = [
    ["PRESUPUESTO", "", "", "", "", ""],
    enc,
    ["", "PRELIMINARES", "", "", "", ""],
    fila(1, "Cerramiento", "ml", 100, 9.5),
    fila(2, "Replanteo", "m2", 250, 1.2),
    fila(3, "Limpieza", "m2", 250, 1.8),
    ["", "OBRA GRIS", "", "", "", ""],
    fila(4, "Excavación", "m3", 40, 12),
    fila(5, "Hormigón en plintos", "m3", 12, 185),
    fila(6, "Mampostería", "m2", 180, 16.5),
  ];
  const r = interpretarPresupuesto(hoja, { ...MAPA });
  assert.equal(r.ivaPorFila, 15);
  // El precio es el del Excel, sin IVA: no se "corrige" para que multiplique.
  assert.deepEqual(r.rubros.map(x => x.precio_unitario), [9.5, 1.2, 1.8, 12, 185, 16.5]);
  // La base sin IVA es cantidad × precio, que es lo que tiene que entrar al presupuesto.
  const sinIva = r2([[100, 9.5], [250, 1.2], [250, 1.8], [40, 12], [12, 185], [180, 16.5]].reduce((s, [c, p]) => s + c * p, 0));
  assert.ok(Math.abs(r.baseSinIva - sinIva) <= 0.05, `base ${r.baseSinIva} contra ${sinIva}`);
});

// UN LIBRO CON VARIAS HOJAS. Se tomaba la tasa de la primera hoja: si esa
// tenía pocas filas, el presupuesto entero entraba como si no hubiera IVA.
import { interpretarVariasHojas } from "../src/modules/controlObra/leerPresupuesto.js";

test("con varias hojas, el IVA metido se reconoce aunque la primera hoja sea chica", () => {
  const chica = [
    ["PRESUPUESTO", "", "", "", "", ""], enc,
    ["", "VIVIENDA DEL CUIDADOR", "", "", "", ""],
    fila(1, "Contrapiso", "m2", 40, 14.2),
    fila(2, "Cubierta", "m2", 45, 31.5),
  ];
  const grande = [
    ["PRESUPUESTO", "", "", "", "", ""], enc,
    ["", "PRELIMINARES", "", "", "", ""],
    fila(1, "Cerramiento", "ml", 437.17, 17.16),
    fila(2, "Trazo de ejes", "u", 1, 477.4),
    fila(3, "Replanteo", "m2", 2086.29, 1.05),
    fila(4, "Desalojo", "m3", 312.9435, 10.44),
    fila(5, "Relleno", "m3", 161.311, 35.38),
    fila(6, "Mejoramiento", "m3", 232.05, 37.45),
  ];
  const r = interpretarVariasHojas([
    { nombre: "CUIDADOR", filas: chica, mapa: { ...MAPA } },
    { nombre: "CASA PRINCIPAL", filas: grande, mapa: { ...MAPA } },
  ]);
  assert.equal(r.ivaPorFila, 15);
  // Los ocho precios, sin IVA, también los de la hoja chica.
  assert.deepEqual(r.rubros.map(x => x.precio_unitario), [14.2, 31.5, 17.16, 477.4, 1.05, 10.44, 35.38, 37.45]);
});

// EL ORDEN DE LAS HOJAS. Cada hoja empieza en la fila 1: ordenar solo por fila
// mezclaba los capítulos de una hoja con los de otra.
import { aplicarDecisiones } from "../src/modules/controlObra/leerPresupuesto.js";

test("con varias hojas, el presupuesto queda en el orden del Excel", () => {
  const sinIva = (n, d, c, p) => [String(n), d, "u", c, p, r2(c * p)];
  const hoja1 = [["PRESUPUESTO", "", "", "", "", ""], enc,
    ["", "PRELIMINARES", "", "", "", ""], sinIva(1, "Cerramiento", 10, 2), sinIva(2, "Replanteo", 5, 3),
    ["", "OBRA GRIS", "", "", "", ""], sinIva(3, "Excavación", 4, 12), sinIva(4, "Plintos", 2, 185)];
  const hoja2 = [["PRESUPUESTO", "", "", "", "", ""], enc,
    ["", "CUBIERTA", "", "", "", ""], sinIva(1, "Estructura", 3, 50), sinIva(2, "Teja", 30, 9),
    ["", "ACABADOS", "", "", "", ""], sinIva(3, "Pintura", 80, 4)];
  const r = interpretarVariasHojas([
    { nombre: "CASA", filas: hoja1, mapa: { ...MAPA } },
    { nombre: "CUIDADOR", filas: hoja2, mapa: { ...MAPA } },
  ]);
  const final = aplicarDecisiones(r, {});
  assert.deepEqual([...new Set(final.rubros.map(x => x.capitulo))],
    ["CASA · PRELIMINARES", "CASA · OBRA GRIS", "CUIDADOR · CUBIERTA", "CUIDADOR · ACABADOS"]);
  assert.deepEqual(final.rubros.map(x => x.descripcion),
    ["Cerramiento", "Replanteo", "Excavación", "Plintos", "Estructura", "Teja", "Pintura"]);
});
