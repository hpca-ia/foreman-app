import test from "node:test";
import assert from "node:assert/strict";
import { porFases, tramoDe } from "../src/modules/cronograma/agruparPorFase.js";

const g = (id, faseId, extra = {}) => ({
  id, nombre: `g${id}`, hijas: [{ id: id * 10, fase_id: faseId }], ...extra,
});

test("sin etapas no se dibuja ninguna banda: la obra chica no las necesita", () => {
  const grupos = [g(1, null), g(2, null)];
  assert.deepEqual(porFases(grupos, []), [{ fase: null, grupos }]);
});

test("cada grupo cae en su etapa, y las etapas van en su orden", () => {
  const fases = [{ id: 2, nombre: "Acabados", orden: 1 }, { id: 1, nombre: "Obra gris", orden: 0 }];
  const r = porFases([g(10, 2), g(11, 1), g(12, 1)], fases);
  assert.deepEqual(r.map(x => x.fase.nombre), ["Obra gris", "Acabados"]);
  assert.deepEqual(r[0].grupos.map(x => x.id), [11, 12]);
  assert.deepEqual(r[1].grupos.map(x => x.id), [10]);
});

test("UNA ETAPA VACÍA EXISTE: así se trabaja, primero el título y después lo de adentro", () => {
  const fases = [{ id: 1, nombre: "Demoliciones", orden: 0 }, { id: 2, nombre: "Entrega", orden: 1 }];
  const r = porFases([g(5, 1)], fases);
  assert.equal(r.length, 2);
  assert.equal(r[1].fase.nombre, "Entrega");
  assert.deepEqual(r[1].grupos, []);
});

test("lo que no tiene etapa va al final y a la vista, no se pierde", () => {
  const fases = [{ id: 1, nombre: "Obra gris", orden: 0 }];
  const r = porFases([g(5, 1), g(6, null)], fases);
  assert.equal(r.length, 2);
  assert.equal(r[1].fase, null);
  assert.deepEqual(r[1].grupos.map(x => x.id), [6]);
});

test("sin huérfanos no se dibuja la banda de los huérfanos", () => {
  const fases = [{ id: 1, nombre: "Obra gris", orden: 0 }];
  const r = porFases([g(5, 1)], fases);
  assert.equal(r.length, 1);
});

test("un rubro partido sale en UN solo lugar: manda la parte que arranca antes", () => {
  const partido = { id: 9, nombre: "Ventanería", hijas: [{ id: 90, fase_id: 1 }, { id: 91, fase_id: 2 }] };
  const fases = [{ id: 1, nombre: "Obra gris", orden: 0 }, { id: 2, nombre: "Acabados", orden: 1 }];
  const r = porFases([partido], fases);
  assert.deepEqual(r[0].grupos.map(x => x.id), [9]);
  assert.deepEqual(r[1].grupos, []);
});

test("el id puede venir como texto desde la base", () => {
  const fases = [{ id: 1, nombre: "Obra gris", orden: 0 }];
  const r = porFases([g(5, "1")], fases);
  assert.deepEqual(r[0].grupos.map(x => x.id), [5]);
});

test("el tramo de una etapa sale de lo que tiene adentro, no se guarda", () => {
  const t = tramoDe([
    { inicio: "2026-03-10", fin: "2026-04-01", hijas: [1, 2], critica: false },
    { inicio: "2026-02-01", fin: "2026-03-20", hijas: [1], critica: true },
  ]);
  assert.equal(t.inicio, "2026-02-01");
  assert.equal(t.fin, "2026-04-01");
  assert.equal(t.barras, 3);
  assert.equal(t.critica, true);
});

test("una etapa vacía no tiene fechas y no revienta", () => {
  assert.deepEqual(tramoDe([]), { inicio: null, fin: null, barras: 0, critica: false });
});
