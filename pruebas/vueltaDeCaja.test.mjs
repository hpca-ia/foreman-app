import test from "node:test";
import assert from "node:assert/strict";
import { proponerCierre } from "../src/modules/cajaChica/vuelta.js";

// Una caja va por vueltas: se entrega un fondo, se gasta, se rinde, se repone.
// El abono nuevo es el acuse de que la vuelta anterior se rindió.

test("sin reposición no hay vuelta para cerrar", () => {
  const r = proponerCierre({
    anticipos: [{ id: 1, monto: 1000, fecha: "2026-10-08", cierre_id: 7 }],
    gastos: [{ id: 1, monto: 50, fecha: "2026-10-20" }],
    cierres: [{ id: 7, numero: 1, hasta: "2026-10-07", created_at: "2026-10-08T10:00:00Z" }],
  });
  assert.equal(r.puede, false);
});

test("con la reposición se cierra hasta el día anterior", () => {
  const r = proponerCierre({
    anticipos: [{ id: 2, monto: 1016.49, fecha: "2026-10-23", created_at: "2026-10-23T14:00:00Z" }],
    gastos: [{ id: 1, monto: 50, fecha: "2026-10-20" }, { id: 2, monto: 9, fecha: "2026-10-24" }],
    cierres: [],
  });
  assert.equal(r.puede, true);
  assert.equal(r.hasta, "2026-10-22");
  assert.deepEqual(r.gastos.map(g => g.id), [1]);   // el del 24 es de la vuelta nueva
});

// EL CASO QUE ARMÓ TRES VUELTAS DONDE HABÍA UNA.
test("un abono habilita una sola vuelta, no una por cada gasto atrasado", () => {
  const anticipos = [{ id: 2, monto: 1016.49, fecha: "2026-10-23", created_at: "2026-10-23T14:00:00Z" }];
  const cierres = [{ id: 10, numero: 1, hasta: "2026-10-21", created_at: "2026-10-23T22:00:00Z" }];
  // Entra un gasto atrasado, con fecha anterior al corte: ya no habilita otra vuelta.
  const r = proponerCierre({ anticipos, gastos: [{ id: 9, monto: 9, fecha: "2026-10-22" }], cierres });
  assert.equal(r.puede, false);
});

test("pero la reposición siguiente sí habilita la vuelta siguiente", () => {
  const anticipos = [
    { id: 2, monto: 1016.49, fecha: "2026-10-23", created_at: "2026-10-23T14:00:00Z" },
    { id: 3, monto: 800, fecha: "2026-11-05", created_at: "2026-11-05T09:00:00Z" },
  ];
  const cierres = [{ id: 10, numero: 1, hasta: "2026-10-21", created_at: "2026-10-23T22:00:00Z" }];
  const r = proponerCierre({ anticipos, gastos: [{ id: 9, monto: 9, fecha: "2026-10-30" }], cierres });
  assert.equal(r.puede, true);
  assert.equal(r.hasta, "2026-11-04");
  assert.equal(r.abono.id, 3);
});

test("los totales son los de lo que entra en la vuelta, no los de toda la caja", () => {
  const r = proponerCierre({
    anticipos: [
      { id: 1, monto: 1000, fecha: "2026-10-01", created_at: "2026-10-01T09:00:00Z" },
      { id: 2, monto: 800, fecha: "2026-10-20", created_at: "2026-10-20T09:00:00Z" },   // la reposición
    ],
    gastos: [
      { id: 1, monto: 300, fecha: "2026-10-02" },
      { id: 2, monto: 200, fecha: "2026-10-18" },
      { id: 3, monto: 70, fecha: "2026-10-21" },   // ya es de la vuelta nueva
    ],
    cierres: [],
  });
  assert.equal(r.hasta, "2026-10-19");
  assert.equal(r.totalAbonado, 1000);
  assert.equal(r.totalGastado, 500);
  assert.equal(r.saldo, 500);
  assert.deepEqual(r.gastos.map(g => g.id), [1, 2]);
});
