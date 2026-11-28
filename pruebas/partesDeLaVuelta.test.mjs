// «Los gastos por rendir que dicen 12 no coinciden con los gastos de la caja
// abierta» (Hernán, 28/11/2026). Caja 9, Lizeth: 15 abiertos = 12 + 3 devueltos.
import test from "node:test";
import assert from "node:assert/strict";
import { partesDeLaVuelta } from "../src/modules/cajaChica/lista.js";
import { proponerCierre } from "../src/modules/cajaChica/vuelta.js";

const gastos = [
  ...Array.from({ length: 12 }, (_, i) => ({ id: i + 1, fecha: `2026-11-${String(21 + (i % 7)).padStart(2, "0")}`, monto: 10, estado: i < 2 ? "aprobado" : "pendiente" })),
  { id: 182, fecha: "2026-10-30", monto: 2.96, estado: "devuelto" },
  { id: 118, fecha: "2026-11-07", monto: 3.25, estado: "devuelto" },
  { id: 98, fecha: "2026-11-12", monto: 13.5, estado: "devuelto" },
  { id: 50, fecha: "2026-11-15", monto: 99, estado: "aprobado", cierre_id: 28 },
];

test("15 abiertos = 12 por rendir + 3 devueltos; lo rendido no está", () => {
  const p = partesDeLaVuelta(gastos);
  assert.equal(p.abiertos.length, 15);
  assert.equal(p.porRendir.length, 12);
  assert.deepEqual(p.devueltos.map(g => g.id), [182, 118, 98]);
  assert.equal(p.sinAprobar.length, 10);
});

test("entran y quedan son los del corte, y suman los por rendir", () => {
  const prop = proponerCierre({ gastos, cierres: [{ numero: 5, hasta: "2026-11-20" }], hasta: "2026-11-24", hoy: "2026-11-28" });
  const p = partesDeLaVuelta(gastos, prop);
  assert.equal(p.entran.length + p.quedan.length, p.porRendir.length);
  assert.ok(p.entran.every(g => g.fecha <= "2026-11-24"));
});
