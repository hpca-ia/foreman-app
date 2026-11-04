import test from "node:test";
import assert from "node:assert/strict";
import { proponerCierre, ultimoCorte } from "../src/modules/cajaChica/vuelta.js";

// La caja se cierra por fechas: entra lo que tiene fecha hasta el corte y lo
// de después queda para la planilla siguiente.

test("el último corte es el 15 o el fin de mes, el más reciente que no pase de hoy", () => {
  assert.equal(ultimoCorte("2026-11-04"), "2026-10-31");
  assert.equal(ultimoCorte("2026-11-15"), "2026-11-15");
  assert.equal(ultimoCorte("2026-11-20"), "2026-11-15");
  assert.equal(ultimoCorte("2026-10-31"), "2026-10-31");
  assert.equal(ultimoCorte("2026-01-03"), "2025-12-31");
  assert.equal(ultimoCorte("2026-02-28"), "2026-02-28");
});

// EL CASO QUE NO DEJABA HACER EL CIERRE 2: la caja de Lizeth.
test("la reposición cargada antes de formalizar el cierre 1 no traba el cierre 2", () => {
  const r = proponerCierre({
    anticipos: [
      { id: 9, monto: 1000, fecha: "2026-10-08", cierre_id: 15 },
      { id: 10, monto: 1016.49, fecha: "2026-10-23", created_at: "2026-10-23T17:00:43Z" },
    ],
    gastos: [
      { id: 1, monto: 1223.65, fecha: "2026-10-28", estado: "aprobado" },
      { id: 2, monto: 297.5, fecha: "2026-11-03", estado: "pendiente" },
      { id: 3, monto: 13.5, fecha: "2026-10-26", estado: "devuelto" },
    ],
    cierres: [{ id: 15, numero: 1, hasta: "2026-10-21", created_at: "2026-11-04T15:56:42Z" }],
    hoy: "2026-11-04",
  });
  assert.equal(r.puede, true);
  assert.equal(r.desde, "2026-10-21");
  assert.equal(r.hasta, "2026-10-31");
  assert.deepEqual(r.gastos.map(g => g.id), [1]);
  assert.deepEqual(r.quedan.map(g => g.id), [2]);       // el del 3 de noviembre: planilla siguiente
  assert.deepEqual(r.devueltos.map(g => g.id), [3]);    // devuelto: fuera hasta que se corrija
  assert.equal(r.totalAbonado, 1016.49);
  assert.equal(r.totalGastado, 1223.65);
  assert.equal(r.saldo, -207.16);
});

test("sin gastos por rendir no hay nada que cerrar, y un devuelto solo tampoco", () => {
  const cierres = [{ id: 7, numero: 1, hasta: "2026-10-31" }];
  assert.equal(proponerCierre({ gastos: [{ id: 1, monto: 5, fecha: "2026-10-20", cierre_id: 7 }], cierres }).puede, false);
  assert.equal(proponerCierre({ gastos: [{ id: 2, monto: 5, fecha: "2026-11-02", estado: "devuelto" }], cierres }).puede, false);
});

test("se cierra por fecha: lo de después queda para la siguiente, abonos incluidos", () => {
  const r = proponerCierre({
    anticipos: [{ id: 1, monto: 500, fecha: "2026-10-01" }, { id: 2, monto: 300, fecha: "2026-10-20" }],
    gastos: [{ id: 1, monto: 50, fecha: "2026-10-10" }, { id: 2, monto: 20, fecha: "2026-10-15" }, { id: 3, monto: 9, fecha: "2026-10-16" }],
    cierres: [],
    hasta: "2026-10-15",
  });
  assert.deepEqual(r.gastos.map(g => g.id), [1, 2]);
  assert.deepEqual(r.quedan.map(g => g.id), [3]);
  assert.deepEqual(r.abonos.map(a => a.id), [1]);
  assert.deepEqual(r.abonosQueQuedan.map(a => a.id), [2]);
  assert.equal(r.totalGastado, 70);
  assert.equal(r.totalAbonado, 500);
  assert.equal(r.saldo, 430);
});

test("la fecha propuesta es el último corte de quincena o de mes", () => {
  const gastos = [{ id: 1, monto: 50, fecha: "2026-11-10" }, { id: 2, monto: 9, fecha: "2026-11-18" }];
  const r = proponerCierre({ gastos, hoy: "2026-11-20" });
  assert.equal(r.hasta, "2026-11-15");
  assert.deepEqual(r.gastos.map(g => g.id), [1]);
});

test("si con ese corte no entra nada, se propone el día del último gasto", () => {
  const r = proponerCierre({ gastos: [{ id: 1, monto: 50, fecha: "2026-11-02" }, { id: 2, monto: 9, fecha: "2026-11-03" }], hoy: "2026-11-04" });
  assert.equal(r.hasta, "2026-11-03");
  assert.equal(r.gastos.length, 2);
});

test("nunca se propone un corte anterior al cierre anterior: ese tramo ya está rendido", () => {
  const r = proponerCierre({
    gastos: [{ id: 1, monto: 50, fecha: "2026-11-02" }],
    cierres: [{ id: 1, numero: 1, hasta: "2026-10-31" }],
    hoy: "2026-11-04",
  });
  assert.equal(r.hasta, "2026-11-02");
});

test("un gasto atrasado, con fecha anterior al corte, entra igual: es de esa planilla", () => {
  const r = proponerCierre({
    gastos: [{ id: 1, monto: 50, fecha: "2026-10-28" }, { id: 2, monto: 9, fecha: "2026-10-12", created_at: "2026-11-03T10:00:00Z" }],
    cierres: [{ id: 1, numero: 1, hasta: "2026-10-15" }],
    hasta: "2026-10-31",
  });
  assert.deepEqual(r.gastos.map(g => g.id).sort(), [1, 2]);
});
