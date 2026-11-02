import test from "node:test";
import assert from "node:assert/strict";
import { num, numeroDeCelda } from "../src/modules/lectura/celdas.js";
import { numeroDeCelda as deElPresupuesto } from "../src/modules/controlObra/leerPresupuesto.js";
import { numeroDeCelda as deLaProforma } from "../src/modules/controlObra/leerProforma.js";

test("el importe escrito en letras al pie no es una cifra", () => {
  // Limpiar todo lo que no sea dígito saca un 50100 del "50/100", y esa fila
  // entraba como un renglón de $50.100 que no existe en ningún papel.
  assert.equal(numeroDeCelda("SON: CATORCE MIL NOVECIENTOS VEINTE Y SIETE DÓLARES CON 50/100"), 0);
  assert.equal(numeroDeCelda("TOTAL"), 0);
  assert.equal(numeroDeCelda("Subtotal"), 0);
});

test("la unidad pegada a la cantidad no le agrega dígitos", () => {
  // "80 m2" daba 802: el 2 del metro cuadrado se pegaba al 80.
  assert.equal(numeroDeCelda("80 m2"), 80);
  assert.equal(numeroDeCelda("12,5 m3"), 12.5);
  assert.equal(numeroDeCelda("25 kg"), 25);
});

test("una unidad de tres letras o más sigue siendo una unidad", () => {
  // Descartar la celda con tres letras seguidas resolvía el importe en letras
  // y rompía esto: de 2.116 rubros cargados, 256 tienen la unidad en tres
  // letras o más. A todos les leía cantidad 0, y un 0 en la columna del total
  // hace que el renglón se descarte entero.
  assert.equal(numeroDeCelda("0.5 GLB"), 0.5);
  assert.equal(numeroDeCelda("3 MESES"), 3);
  assert.equal(numeroDeCelda("2 PTO"), 2);
  assert.equal(numeroDeCelda("1 VIAJE"), 1);
  assert.equal(numeroDeCelda("4 JGO"), 4);
  assert.equal(numeroDeCelda("3 U"), 3);
});

test("la moneda no vuelve texto a un importe", () => {
  assert.equal(numeroDeCelda("USD 340"), 340);
  assert.equal(numeroDeCelda("$ 1.250,50"), 1250.5);
});

test("los dos lectores leen igual la misma celda", () => {
  // Había dos copias de esta función con reglas distintas: "3 U" daba 3 en el
  // lector de presupuestos y 0 en el de proformas. El mismo papel leído por
  // dos módulos daba dos resultados, y el que elegía cuál valía era el módulo
  // por el que había entrado el archivo.
  const casos = ["80 m2", "3 U", "0.5 GLB", "3 MESES", "1.250,50", "USD 340",
    "CATORCE MIL CON 50/100", "TOTAL", "", "-", "100"];
  for (const c of casos) {
    assert.equal(deElPresupuesto(c), numeroDeCelda(c), `presupuesto: ${c}`);
    assert.equal(deLaProforma(c), numeroDeCelda(c), `proforma: ${c}`);
  }
});

test("el último separador es el decimal, venga como venga", () => {
  assert.equal(num("1.234,56"), 1234.56);
  assert.equal(num("1,234.56"), 1234.56);
  assert.equal(num(1234.56), 1234.56);
});
