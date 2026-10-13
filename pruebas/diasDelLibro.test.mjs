import test from "node:test";
import assert from "node:assert/strict";
import { listaDeDias, sinEscribir } from "../src/modules/libro/diasDelLibro.js";

test("UN DÍA QUE NADIE ABRIÓ APARECE IGUAL, vacío", () => {
  const r = listaDeDias({ dias: [{ fecha: "2026-10-13", estado: "abierto" }], hoy: "2026-10-13", cuantos: 3 });
  assert.deepEqual(r.map(d => d.fecha), ["2026-10-13", "2026-10-12", "2026-10-11"]);
  assert.ok(r[0].dia, "el de hoy tiene libro");
  assert.equal(r[1].dia, null, "el de ayer no, y aparece igual");
});

test("no se va más atrás del arranque de la obra", () => {
  const r = listaDeDias({ dias: [], hoy: "2026-10-13", cuantos: 10, desde: "2026-10-11" });
  assert.deepEqual(r.map(d => d.fecha), ["2026-10-13", "2026-10-12", "2026-10-11"]);
});

test("un domingo sin nada escrito no es un agujero", () => {
  // 2026-10-11 es domingo. Se trabaja de lunes a sábado.
  const r = listaDeDias({ dias: [], hoy: "2026-10-13", cuantos: 4, laborables: [1, 2, 3, 4, 5, 6] });
  assert.ok(!r.some(d => d.fecha === "2026-10-11"));
  assert.deepEqual(r.map(d => d.fecha), ["2026-10-13", "2026-10-12", "2026-10-10"]);
});

test("pero si alguien escribió un domingo, el domingo pasó y entra", () => {
  const r = listaDeDias({
    dias: [{ fecha: "2026-10-11", estado: "cerrado" }],
    hoy: "2026-10-13", cuantos: 4, laborables: [1, 2, 3, 4, 5, 6],
  });
  assert.ok(r.some(d => d.fecha === "2026-10-11" && d.dia));
});

test("un libro viejo, fuera del rango, no se pierde", () => {
  const r = listaDeDias({ dias: [{ fecha: "2026-01-02", estado: "cerrado" }], hoy: "2026-10-13", cuantos: 2 });
  assert.equal(r[r.length - 1].fecha, "2026-01-02");
});

test("hoy se marca, porque es el único que se escribe sin permiso de nadie", () => {
  const r = listaDeDias({ dias: [], hoy: "2026-10-13", cuantos: 2 });
  assert.equal(r[0].hoy, true);
  assert.equal(r[1].hoy, false);
});

test("cuántos días quedaron sin una sola línea", () => {
  const r = listaDeDias({ dias: [{ fecha: "2026-10-12" }], hoy: "2026-10-13", cuantos: 4 });
  assert.equal(sinEscribir(r), 2);
});

test("sin fecha de hoy no revienta", () => {
  assert.deepEqual(listaDeDias({}), []);
});
