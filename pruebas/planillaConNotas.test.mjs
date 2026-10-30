import test from "node:test";
import assert from "node:assert/strict";
import { resumenPlanilla } from "../src/modules/controlObra/calculos.js";

// Las dos notas de KYWI de la obra 13: $105,06 que ayer se aplicaron a dos
// compras. Después de aplicarlas no son plata disponible.
const notas = [
  { id: 82, clase: "nota_credito", total: -5.09 },
  { id: 103, clase: "nota_credito", total: -99.97 },
  { id: 98, clase: "factura", total: 97.05 },
  { id: 101, clase: "factura", total: 21.17 },
];
const pagos = [
  { factura_id: 98, monto: 97.05, nota_credito_id: 103 },
  { factura_id: 101, monto: 2.92, nota_credito_id: 103 },
  { factura_id: 101, monto: 5.09, nota_credito_id: 82 },
];

test("una nota de crédito ya usada deja de contarse como crédito disponible", () => {
  const r = resumenPlanilla({ facturas: notas, asignaciones: [], pagos });
  assert.equal(r.credito, 0);
  assert.equal(r.creditoUsado, 105.06);
  assert.equal(r.cuantasNotas, 0);
  assert.equal(r.cuantasNotasUsadas, 2);
});

test("sin pagos registrados, la nota entera sigue a favor", () => {
  const r = resumenPlanilla({ facturas: notas, asignaciones: [] });
  assert.equal(r.credito, 105.06);
  assert.equal(r.cuantasNotas, 2);
});

test("una nota usada a medias cuenta por lo que le queda", () => {
  const r = resumenPlanilla({
    facturas: [{ id: 103, clase: "nota_credito", total: -99.97 }],
    asignaciones: [], pagos: [{ factura_id: 98, monto: 40, nota_credito_id: 103 }],
  });
  assert.equal(r.credito, 59.97);
  assert.equal(r.creditoUsado, 40);
  assert.equal(r.cuantasNotas, 1);
});

test("el gasto no se confunde con el crédito ni con el anticipo", () => {
  const r = resumenPlanilla({
    facturas: [...notas, { id: 122, clase: "anticipo", total: 5000 }],
    asignaciones: [], pagos,
  });
  assert.equal(r.gasto, 118.22);
  assert.equal(r.anticipos, 5000);
  assert.equal(r.credito, 0);
});

test("un anticipo pasado a recibo ya es gasto, no anticipo", () => {
  const r = resumenPlanilla({ facturas: [{ id: 122, clase: "recibo", total: 5000 }], asignaciones: [] });
  assert.equal(r.gasto, 5000);
  assert.equal(r.anticipos, 0);
});
