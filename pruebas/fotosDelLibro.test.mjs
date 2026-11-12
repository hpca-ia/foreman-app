// Las fotos del libro de obra en el PDF: grandes, enteras y sin deformar.
import test from "node:test";
import assert from "node:assert/strict";
import { filasDeFotos, ALTO_DE_FOTO, ENTRE_FOTOS } from "../src/modules/libro/fotosDelPdf.js";

const ANCHO = 595.28 - 40 * 2;                       // lo útil de una hoja A4
const vertical = { width: 563, height: 1000 };       // el teléfono parado: 39 de las 83 del Aeropuerto
const tresCuartos = { width: 750, height: 1000 };
const apaisada = { width: 1000, height: 750 };
const panoramica = { width: 1000, height: 563 };
const r1 = v => Math.round(v * 10) / 10;

test("tres fotos verticales entran en una fila, al doble del alto de antes", () => {
  const filas = filasDeFotos([vertical, vertical, vertical, vertical], { ancho: ANCHO });
  assert.equal(filas.length, 2);
  assert.deepEqual(filas[0].fotos.map(f => f.indice), [0, 1, 2]);
  assert.deepEqual(filas[1].fotos.map(f => f.indice), [3]);
  // Antes: 84 × 150. Ahora: 163 × 290.
  assert.equal(r1(filas[0].fotos[0].w), 163.3);
  assert.equal(filas[0].fotos[0].h, 290);
  assert.equal(filas[0].alto, ALTO_DE_FOTO);
});

test("van una al lado de la otra, con su separación, sin pasarse del ancho de la hoja", () => {
  const [fila] = filasDeFotos([vertical, vertical, vertical], { ancho: ANCHO });
  assert.deepEqual(fila.fotos.map(f => r1(f.x)), [0, 173.3, 346.5]);
  const ultimo = fila.fotos.at(-1);
  assert.ok(ultimo.x + ultimo.w <= ANCHO);
  assert.equal(r1(fila.fotos[1].x - (fila.fotos[0].x + fila.fotos[0].w)), ENTRE_FOTOS);
});

test("de proporción media entran dos; una apaisada va sola y sale casi a hoja entera", () => {
  const dos = filasDeFotos([tresCuartos, tresCuartos, tresCuartos], { ancho: ANCHO });
  assert.deepEqual(dos.map(f => f.fotos.length), [2, 1]);
  assert.equal(r1(dos[0].fotos[0].w), 217.5);
  const sola = filasDeFotos([apaisada, apaisada], { ancho: ANCHO });
  assert.deepEqual(sola.map(f => f.fotos.length), [1, 1]);
  assert.equal(r1(sola[0].fotos[0].w), 386.7);       // antes: 233 de ancho
  assert.equal(sola[0].fotos[0].h, 290);
});

test("la que al alto de la fila no entra en la hoja se achica a lo ancho, entera", () => {
  // Una de 16:9 entra justo al alto de la fila: 515 de ancho.
  const [justa] = filasDeFotos([panoramica], { ancho: ANCHO });
  assert.equal(r1(justa.fotos[0].w), 515.1);
  assert.equal(justa.fotos[0].h, 290);
  // Una de 2:1 ya no: ocupa el ancho de la hoja y la fila queda más baja.
  const [fila] = filasDeFotos([{ width: 1000, height: 500 }], { ancho: ANCHO });
  assert.equal(r1(fila.fotos[0].w), r1(ANCHO));
  assert.equal(r1(fila.fotos[0].h), 257.6);
  assert.equal(r1(fila.alto), 257.6);
});

test("ninguna se deforma: el ancho sobre el alto es el de la foto", () => {
  const fotos = [vertical, apaisada, tresCuartos, panoramica, { width: 708, height: 1000 }, vertical];
  for (const fila of filasDeFotos(fotos, { ancho: ANCHO })) {
    for (const f of fila.fotos) {
      const o = fotos[f.indice];
      assert.ok(Math.abs(f.w / f.h - o.width / o.height) < 0.001, `la ${f.indice} se deformó`);
      assert.ok(f.x + f.w <= ANCHO + 0.01, `la ${f.indice} se sale de la hoja`);
      assert.ok(f.h <= ALTO_DE_FOTO + 0.01);
    }
  }
});

test("van en el orden en que se subieron, y no falta ni se repite ninguna", () => {
  const fotos = [vertical, apaisada, vertical, vertical, tresCuartos, vertical, panoramica];
  const orden = filasDeFotos(fotos, { ancho: ANCHO }).flatMap(f => f.fotos.map(x => x.indice));
  assert.deepEqual(orden, [0, 1, 2, 3, 4, 5, 6]);
});

test("una vertical al lado de una apaisada no entra: cada una en su fila, sin achicar ninguna", () => {
  const filas = filasDeFotos([apaisada, vertical], { ancho: ANCHO });
  assert.deepEqual(filas.map(f => f.fotos.length), [1, 1]);
  assert.equal(filas[1].fotos[0].h, 290);
});

test("una foto sin medidas no rompe nada: va como una apaisada común", () => {
  const [fila] = filasDeFotos([{}], { ancho: ANCHO });
  assert.equal(r1(fila.fotos[0].w), 386.7);
  assert.deepEqual(filasDeFotos([], { ancho: ANCHO }), []);
});
