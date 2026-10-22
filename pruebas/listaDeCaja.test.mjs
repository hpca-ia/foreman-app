import test from "node:test";
import assert from "node:assert/strict";
import { porFecha, deLaVuelta } from "../src/modules/cajaChica/lista.js";

test("el más nuevo arriba", () => {
  const r = porFecha([{ id: 1, fecha: "2026-10-05" }, { id: 2, fecha: "2026-10-20" }, { id: 3, fecha: "2026-10-12" }]);
  assert.deepEqual(r.map(x => x.id), [2, 3, 1]);
});

test("a igual fecha, el último cargado primero", () => {
  const r = porFecha([{ id: 7, fecha: "2026-10-12" }, { id: 9, fecha: "2026-10-12" }, { id: 8, fecha: "2026-10-12" }]);
  assert.deepEqual(r.map(x => x.id), [9, 8, 7]);
});

test("la hora que traiga la fecha no desordena el día", () => {
  const r = porFecha([{ id: 1, fecha: "2026-10-12T05:00:00.000Z" }, { id: 2, fecha: "2026-10-13" }]);
  assert.deepEqual(r.map(x => x.id), [2, 1]);
});

test("un gasto sin fecha no se pierde ni encabeza la lista", () => {
  const r = porFecha([{ id: 1, fecha: "2026-10-12" }, { id: 2, fecha: null }]);
  assert.equal(r.length, 2);
  assert.equal(r[0].id, 1);
});

test("no toca la lista que le dan", () => {
  const original = [{ id: 1, fecha: "2026-10-01" }, { id: 2, fecha: "2026-10-09" }];
  porFecha(original);
  assert.deepEqual(original.map(x => x.id), [1, 2]);
});

test("por omisión se ve lo que está por rendir", () => {
  const filas = [{ id: 1, cierre_id: 8 }, { id: 2, cierre_id: null }, { id: 3 }];
  assert.deepEqual(deLaVuelta(filas).map(x => x.id), [2, 3]);
});

test("y se puede mirar una vuelta ya cerrada", () => {
  const filas = [{ id: 1, cierre_id: "8" }, { id: 2, cierre_id: null }, { id: 3, cierre_id: 9 }];
  assert.deepEqual(deLaVuelta(filas, 8).map(x => x.id), [1]);
});
