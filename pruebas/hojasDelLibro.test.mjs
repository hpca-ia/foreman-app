import test from "node:test";
import assert from "node:assert/strict";
import { firmaEncabezado } from "../src/modules/controlObra/leerPresupuesto.js";

// Un presupuesto en tres hojas que entra con una sola no da ningún error: da
// un total que parece bien y le faltan dos tercios. Lo que decide si dos hojas
// son el mismo presupuesto es su encabezado.

const encabezado = ["CÓDIGO", "DESCRIPCIÓN", "UNIDAD", "CANTIDAD", "P. UNITARIO", "TOTAL"];

test("dos hojas del mismo formato tienen la misma firma", () => {
  assert.equal(firmaEncabezado(encabezado), firmaEncabezado([...encabezado]));
});

test("una hoja con otras columnas tiene otra firma", () => {
  const resumen = ["CAPÍTULO", "MONTO", "PORCENTAJE"];
  assert.notEqual(firmaEncabezado(encabezado), firmaEncabezado(resumen));
});

// La firma usa la POSICIÓN además del título: dos planillas con las mismas
// palabras en otro orden no son el mismo formato, y leer una con el mapa de la
// otra pone el precio donde va la cantidad.
test("las mismas columnas en otro orden no son el mismo formato", () => {
  const dadasVuelta = ["CÓDIGO", "DESCRIPCIÓN", "UNIDAD", "P. UNITARIO", "CANTIDAD", "TOTAL"];
  assert.notEqual(firmaEncabezado(encabezado), firmaEncabezado(dadasVuelta));
});

test("una fila de puros números no es un encabezado", () => {
  assert.equal(firmaEncabezado(["1", "2", "3", "4"]), null);
  assert.equal(firmaEncabezado([]), null);
});

test("con menos de tres títulos no se arriesga una firma", () => {
  // Sería tan genérica que confundiría dos formatos distintos.
  assert.equal(firmaEncabezado(["TOTAL", "", ""]), null);
});
