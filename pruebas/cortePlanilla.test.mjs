import test from "node:test";
import assert from "node:assert/strict";
import { partirPorFecha, siguienteDe, numeroNuevo, diaSiguiente, loQueQueda, cortePropuesto }
  from "../src/modules/controlObra/cortePlanilla.js";

// La planilla de octubre de Diners Aeropuerto: 112 facturas de octubre y dos
// del 3 de noviembre que entraron porque era la que estaba abierta.
const facturas = [
  { id: 1, planilla_id: 12, fecha: "2026-10-01", total: 100 },
  { id: 2, planilla_id: 12, fecha: "2026-10-31", total: 52.5 },
  { id: 3, planilla_id: 12, fecha: "2026-11-03", total: 287.5 },
  { id: 4, planilla_id: 12, fecha: "2026-11-03", total: 10 },
  { id: 5, planilla_id: 11, fecha: "2026-11-03", total: 999 },   // de otra planilla
];

test("al cerrar al 31 de octubre, lo del 3 de noviembre pasa a la siguiente", () => {
  const { quedan, pasan } = partirPorFecha(facturas, 12, "2026-10-31");
  assert.deepEqual(quedan.map(f => f.id), [1, 2]);
  assert.deepEqual(pasan.map(f => f.id), [3, 4]);
});

test("la planilla siguiente es la abierta con número mayor, si existe", () => {
  const p1 = { id: 12, numero: 1, estado: "abierta" };
  assert.equal(siguienteDe([p1], p1), null);
  const p2 = { id: 13, numero: 2, estado: "abierta" };
  assert.equal(siguienteDe([p1, p2], p1).id, 13);
  assert.equal(siguienteDe([p1, { ...p2, estado: "cerrada" }], p1), null);
  assert.equal(numeroNuevo([p1, p2]), 3);
  assert.equal(numeroNuevo([]), 1);
});

test("la nueva arranca el día siguiente al corte", () => {
  assert.equal(diaSiguiente("2026-10-31"), "2026-11-01");
  assert.equal(diaSiguiente("2026-12-31"), "2027-01-01");
});

test("lo que queda adentro se cuenta sobre las que quedan, no sobre toda la planilla", () => {
  const quedan = [
    { id: 1, total: 100, clase: "factura" },
    { id: 2, total: 5000, clase: "anticipo" },
    { id: 3, total: -105.06, clase: "nota_credito" },
    { id: 4, total: 40, clase: "anticipo", facturada_con_id: 9 },   // ya llegó su factura
  ];
  const q = loQueQueda(quedan, f => (f.id === 1 ? 6.01 : 0));
  assert.equal(q.cuantas, 4);
  assert.equal(q.total, 5034.94);
  assert.equal(q.sueltas, 1);
  assert.equal(q.vivo, 5000);
  assert.equal(q.favor, 105.06);
});

test("se propone el último corte de quincena o de mes si cae dentro de la planilla", () => {
  assert.equal(cortePropuesto({ fecha_desde: "2026-10-07" }, "2026-11-04"), "2026-10-31");
  assert.equal(cortePropuesto({ fecha_desde: "2026-11-01" }, "2026-11-04"), "2026-11-04");
});

test("el vale que ya se usó no queda a favor: se mide lo que le queda, no lo que decía", () => {
  // Los $105,06 de KYWI, gastados en dos compras de caja chica, se nombraban
  // enteros en cada cierre.
  const quedan = [
    { id: 103, total: -99.97, clase: "nota_credito" },
    { id: 82, total: -5.09, clase: "nota_credito" },
    { id: 7, total: -20, clase: "nota_credito" },
  ];
  const queda = { 103: 0, 82: 0, 7: 20 };
  assert.equal(loQueQueda(quedan, () => 0, f => queda[f.id]).favor, 20);
  assert.equal(loQueQueda(quedan).favor, 125.06);   // sin pagos a la vista, lo de siempre
});
