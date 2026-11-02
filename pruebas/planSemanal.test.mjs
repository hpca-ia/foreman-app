import test from "node:test";
import assert from "node:assert/strict";

test("la semana va de lunes a domingo, y cada dia pertenece a un solo plan", async () => {
  // El plan salia de miercoles a martes porque el corte se heredaba del dia en
  // que arranco la obra: un accidente del calendario convertido en regla
  // permanente que no se podia cambiar desde ninguna pantalla.
  const { proponerPeriodo } = await import("../src/modules/libro/semanaDeObra.js");
  // Miercoles 4 de noviembre de 2026: la semana en curso es la del lunes 2.
  const p = proponerPeriodo({ hoy: "2026-11-04", arranca: 1, dias: 7 });
  assert.equal(p.desde, "2026-11-02");
  assert.equal(p.hasta, "2026-11-08");
  // El domingo 8 es el ultimo dia de esa semana, no el primero de la que
  // viene: con el domingo repetido, su tarea pertenecia a dos semanas y su
  // libro se escribia desde cualquiera de las dos.
  const q = proponerPeriodo({ hoy: "2026-11-08", arranca: 1, dias: 7 });
  assert.equal(q.desde, "2026-11-02");
  // Y el lunes 9 ya es la siguiente.
  assert.equal(proponerPeriodo({ hoy: "2026-11-09", arranca: 1, dias: 7 }).desde, "2026-11-09");
});

test("el corte de la obra manda sobre el ultimo plan escrito", async () => {
  const { proponerPeriodo } = await import("../src/modules/libro/semanaDeObra.js");
  const p = proponerPeriodo({ hoy: "2026-11-04", arranca: 1, dias: 7,
    ultimoDesde: "2026-10-28", ultimoHasta: "2026-11-03" });   // miercoles a martes
  assert.equal(p.desde, "2026-11-02");
});
