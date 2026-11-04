import test from "node:test";
import assert from "node:assert/strict";
import { mapeoQueCuadra, milesDelDocumento } from "../src/modules/lectura/columnas.js";
import { num, numeroDeCelda } from "../src/modules/lectura/celdas.js";

// Una proforma: descripción, cantidad, unidad, precio unitario, total.
const HOJA = [
  ["PROFORMA 0045", "", "", "", ""],
  ["DESCRIPCION", "CANT", "UNID", "P. UNIT", "TOTAL"],
  ["Punto de iluminación", "100", "U", "33", "3300"],
  ["Cable THHN 12", "500", "ML", "4", "2000"],
  ["Tablero trifásico", "1", "U", "180", "180"],
  ["Breaker 1P-16A", "20", "U", "10", "200"],
  ["Tubería EMT 1/2", "300", "ML", "2.5", "750"],
  ["SUBTOTAL", "", "", "", "6430"],
];
const MAPA = { fila_encabezado: 1, col_descripcion: 0, col_cantidad: 1, col_unidad: 2, col_unitario: 3, col_total: 4 };

test("si el mapa ya cuadra, no se toca", () => {
  const r = mapeoQueCuadra(HOJA, MAPA, { clavePrecio: "col_unitario" });
  assert.deepEqual(r.mapa, MAPA);
  assert.deepEqual(r.cambios, []);
  assert.equal(r.cuadran, 5);
});

test("el precio que no estaba en el encabezado lo encuentra la aritmética", () => {
  // El título dice "VALOR" y nadie lo reconoce como unitario: el mapa llega
  // sin esa columna. Pero cantidad × esa columna da el total en todas las
  // filas, y eso no es una opinión.
  const sinPrecio = { ...MAPA, col_unitario: null };
  const r = mapeoQueCuadra(HOJA, sinPrecio, { clavePrecio: "col_unitario" });
  assert.equal(r.mapa.col_unitario, 3);
  assert.match(r.cambios[0], /no estaba en el encabezado, es la columna D/);
  assert.equal(r.cuadran, 5);
});

test("un título que miente se corrige: el total estaba en otra columna", () => {
  // La columna E dice "TOTAL" pero trae otra cosa; el total real está en F.
  const hoja = HOJA.map((f, i) => i < 2 ? [...f, i === 1 ? "IMPORTE" : ""] : [f[0], f[1], f[2], f[3], "0", f[4]]);
  const r = mapeoQueCuadra(hoja, MAPA, { clavePrecio: "col_unitario" });
  assert.equal(r.mapa.col_total, 5);
  assert.match(r.cambios[0], /total: columna E → F/);
});

test("el mismo nombre de columna sirve para el presupuesto y para la proforma", () => {
  // El presupuesto llama col_precio a lo que la proforma llama col_unitario.
  // Es una sola función y recibe el nombre: no dos copias con dos criterios.
  const comoPresupuesto = { ...MAPA, col_precio: null, col_unitario: undefined };
  const r = mapeoQueCuadra(HOJA, comoPresupuesto, { clavePrecio: "col_precio" });
  assert.equal(r.mapa.col_precio, 3);
});

test("$ 1.200 son mil doscientos si el papel lo dice en otra celda, y un dólar veinte si no", () => {
  // La multiplicación no lo decide: 10 × 1.200 = 12.000 cuadra como mil
  // doscientos y cuadra como un dólar veinte. Lo decide una celda donde el
  // separador no es ambiguo. Acá, el subtotal con centavos.
  const europea = [
    ["DESCRIPCION", "CANT", "P. UNIT", "TOTAL"],
    ["Cable", "10", "$ 1.200", "$ 12.000"],
    ["Tubería", "4", "$ 2.500", "$ 10.000"],
    ["SUBTOTAL", "", "", "$ 22.000,00"],
  ];
  assert.equal(milesDelDocumento(europea), ".");
  assert.equal(numeroDeCelda("$ 1.200", "."), 1200);
  assert.equal(numeroDeCelda("$ 22.000,00", "."), 22000);

  // La misma hoja a la ecuatoriana: un unitario con un decimal —"2.5"— dice
  // que el punto es el decimal, y entonces "1.200" es un dólar veinte.
  const ecuatoriana = [
    ["DESCRIPCION", "CANT", "P. UNIT", "TOTAL"],
    ["Cable", "10", "1.200", "12.00"],
    ["Tubería", "4", "2.5", "10.00"],
  ];
  assert.equal(milesDelDocumento(ecuatoriana), ",");
  assert.equal(numeroDeCelda("1.200", ","), 1.2);
});

test("sin ninguna celda que lo diga, no se afirma ninguna convención", () => {
  const soloEnteros = [["DESC", "CANT", "TOTAL"], ["a", "10", "1.200"], ["b", "3", "4.500"]];
  assert.equal(milesDelDocumento(soloEnteros), null);
  assert.equal(numeroDeCelda("1.200", null), 1.2);   // como siempre
});

test("el separador repetido siempre agrupa miles", () => {
  assert.equal(num("1.234.567"), 1234567);
  assert.equal(num("1,234,567"), 1234567);
  assert.equal(num("1.234,56"), 1234.56);
});
