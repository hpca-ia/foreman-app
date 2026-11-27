// Hernán, 27/11/2026: «En el presupuesto alértame valores de cantidad o precio
// en 0... punto rojo junto al rubro». En RES BG, ese día, 351 de sus 352
// rubros tenían la cantidad en 0 y 5 el precio en 0, entre ellos un renglón
// «TOTAL:» que se coló al leer el Excel.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loQueEstaEnCero, avisoDeCero, cuantosEnCero } from "../src/modules/presupuestos/rubroEnCero.js";

const codigo = readFileSync(new URL("../src/modules/ModuloPresupuestos.jsx", import.meta.url), "utf8");

test("cantidad o precio en cero, o vacío: se marca y dice cuál", () => {
  const mamposteria = { descripcion: "Mampostería de bloque 0,20 interior", unidad: "m2", cantidad: "0", precio_unitario: "18.50" };
  assert.deepEqual(loQueEstaEnCero(mamposteria), ["cantidad"]);
  assert.equal(avisoDeCero(loQueEstaEnCero(mamposteria)), "Cantidad en 0");
  const foga = { descripcion: "FOGA", cantidad: "1", precio_unitario: "0" };
  assert.deepEqual(loQueEstaEnCero(foga), ["precio"]);
  assert.equal(avisoDeCero(loQueEstaEnCero(foga)), "Precio en 0");
  const total = { descripcion: "TOTAL:", cantidad: "0", precio_unitario: "0" };
  assert.equal(avisoDeCero(loQueEstaEnCero(total)), "Cantidad y precio en 0");
  // Vacío o a medio escribir cuenta como cero.
  assert.deepEqual(loQueEstaEnCero({ cantidad: "", precio_unitario: null }), ["cantidad", "precio"]);
  assert.deepEqual(loQueEstaEnCero({ cantidad: 12.5, precio_unitario: 3 }), []);
  assert.equal(avisoDeCero([]), "");
});

test("no se marca lo que va en cero a propósito: un descuento en negativo, o lo que no se cotiza", () => {
  assert.deepEqual(loQueEstaEnCero({ descripcion: "Descuento", cantidad: 1, precio_unitario: -250 }), []);
  assert.deepEqual(loQueEstaEnCero({ descripcion: "Aire acondicionado", cantidad: 0, precio_unitario: 0, nota: "NO COTIZA - lo provee el cliente" }), []);
  assert.deepEqual(loQueEstaEnCero(null), []);
});

test("el capítulo cuenta cuántos tiene en cero", () => {
  assert.equal(cuantosEnCero([
    { cantidad: 0, precio_unitario: 10 }, { cantidad: 2, precio_unitario: 0 }, { cantidad: 2, precio_unitario: 5 },
    { cantidad: 0, precio_unitario: 0, nota: "no se cotiza" },
  ]), 2);
  assert.equal(cuantosEnCero(undefined), 0);
});

test("en la pantalla: el punto junto al rubro, el campo en rojo y la cuenta en la cabeza del capítulo", () => {
  assert.match(codigo, /const enCero=loQueEstaEnCero\(item\);/);
  assert.match(codigo, /\{enCero\.length>0&&\(\s+<span className="rubro-en-cero" role="img" title=\{avisoDeCero\(enCero\)\}/);
  // El punto va antes de la descripción, en la misma celda.
  assert.ok(codigo.indexOf('className="rubro-en-cero"') < codigo.indexOf('titulo="Toca para editar la descripción"'));
  assert.match(codigo, /background:enCero\.includes\("cantidad"\)\?"var\(--danger-soft\)":"var\(--bg\)"/);
  assert.match(codigo, /background:enCero\.includes\("precio"\)\?"var\(--danger-soft\)":"var\(--bg\)"/);
  assert.match(codigo, /const capEnCero=cuantosEnCero\(todosDelCap\);/);
  assert.match(codigo, /\{capEnCero>0&&\(\s+<span className="capitulo-con-ceros"/);
});
