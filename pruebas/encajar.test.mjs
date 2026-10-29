import test from "node:test";
import assert from "node:assert/strict";
import { encajar } from "../src/lib/encajar.js";

const hueco = { ancho: 86, alto: 70 };
const casi = (a, b) => assert.ok(Math.abs(a - b) < 0.01, `${a} ≠ ${b}`);

test("una foto apaisada entra por el ancho y no toca el tope", () => {
  const { w, h, dx } = encajar({ width: 4000, height: 3000 }, hueco);
  casi(w, 86); casi(h, 64.5); casi(dx, 0);
});

test("una foto vertical se angosta en vez de aplastarse", () => {
  // Es el caso que salía deformado: 3:4 con el ancho de la columna daba 114mm
  // de alto, se recortaba a 70 y la foto quedaba gorda y baja.
  const { w, h } = encajar({ width: 3000, height: 4000 }, hueco);
  casi(h, 70); casi(w, 52.5);
  casi(w / h, 3000 / 4000);
});

test("la que se angosta queda centrada en su columna", () => {
  const { w, dx } = encajar({ width: 3000, height: 4000 }, hueco);
  casi(dx, (86 - w) / 2);
});

test("una foto chica no se estira para llenar el hueco", () => {
  const { w, h } = encajar({ width: 1000, height: 750 }, { ancho: 2000, alto: 2000 });
  casi(w, 2000); casi(h, 1500);
});

test("sin medidas ocupa el hueco y no revienta", () => {
  const { w, h, dx } = encajar({}, hueco);
  casi(w, 86); casi(h, 70); casi(dx, 0);
});

test("también entiende ancho/alto, que es como los nombra el otro PDF", () => {
  const { w, h } = encajar({ ancho: 3000, alto: 4000 }, hueco);
  casi(h, 70); casi(w, 52.5);
});
