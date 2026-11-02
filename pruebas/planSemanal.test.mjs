import test from "node:test";
import assert from "node:assert/strict";

test("la semana de la obra arranca el domingo, y se escribe antes de que empiece", async () => {
  // El plan salia de miercoles a martes porque el corte se heredaba del dia en
  // que arranco la obra: un accidente del calendario convertido en regla
  // permanente que no se podia cambiar desde ninguna pantalla.
  const { proponerPeriodo } = await import("../src/modules/libro/semanaDeObra.js");
  // Miercoles 4 de noviembre de 2026: la semana en curso es la del domingo 1.
  const p = proponerPeriodo({ hoy: "2026-11-04", arranca: 0, dias: 8 });
  assert.equal(p.desde, "2026-11-01");
  assert.equal(p.hasta, "2026-11-08");
  // El domingo 8 ya es la semana siguiente: el domingo de cierre es el de
  // apertura de la que viene, que es como se habla de las semanas en obra.
  const q = proponerPeriodo({ hoy: "2026-11-08", arranca: 0, dias: 8 });
  assert.equal(q.desde, "2026-11-08");
  assert.equal(q.hasta, "2026-11-15");
});

test("el corte de la obra manda sobre el ultimo plan escrito", async () => {
  const { proponerPeriodo } = await import("../src/modules/libro/semanaDeObra.js");
  const p = proponerPeriodo({ hoy: "2026-11-04", arranca: 0, dias: 8,
    ultimoDesde: "2026-10-28", ultimoHasta: "2026-11-03" });   // miercoles a martes
  assert.equal(p.desde, "2026-11-01");
});
