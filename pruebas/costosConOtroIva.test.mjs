import test from "node:test";
import assert from "node:assert/strict";
import { costosConOtroIva } from "../src/modules/controlObra/cuentaOrdenCambio.js";

// La OC-01 de Plaza Lagos: cargada sin IVA ($173,7188 con IVA adentro) y
// corregida al 15% después.
const lineas = [
  { id: 1, tipo: "aumenta", descripcion: "Vinil (renombrado)", cantidad: 8, costo_unitario: 173.7188, cotizacion_id: 5 },
  { id: 2, tipo: "aumenta", descripcion: "De otra proforma", cantidad: 1, costo_unitario: 100, cotizacion_id: 6 },
  { id: 3, tipo: "aumenta", descripcion: "Sin costo", cantidad: 1, costo_unitario: null, cotizacion_id: 5 },
  { id: 4, tipo: "quita", descripcion: "Reducción", cantidad: 1, costo_unitario: 50, cotizacion_id: 5 },
];

test("al ponerle el 15% a la proforma, su partida baja al costo sin IVA aunque la hayan renombrado", () => {
  const r = costosConOtroIva(lineas, 5, 0, 15);
  assert.deepEqual(r.map(x => x.id), [1]);
  assert.equal(Math.round(r[0].costo_unitario * 8 * 100) / 100, 1208.48);
});

test("las partidas de otra proforma no se tocan", () => {
  assert.ok(!costosConOtroIva(lineas, 5, 0, 15).some(x => x.id === 2));
});

test("ir y volver deja el mismo costo", () => {
  const ida = costosConOtroIva(lineas, 5, 0, 15);
  const vuelta = costosConOtroIva([{ ...lineas[0], costo_unitario: ida[0].costo_unitario }], 5, 15, 0);
  assert.ok(Math.abs(vuelta[0].costo_unitario - 173.7188) < 0.001);
});

test("el id de la proforma puede venir como texto", () => {
  assert.equal(costosConOtroIva(lineas, "5", 0, 15).length, 1);
});

// ── El gasto borrado (migración 137) ──────────────────────────────────────
import { planDeBeneficios } from "../src/modules/controlObra/cuentaOrdenCambio.js";

test("un gasto borrado deja su beneficio confirmado y se lleva el previsto", () => {
  // Con ON DELETE SET NULL, la fila queda sin gasto ni partida.
  const existentes = [
    { id: 10, orden_cambio_id: 1, orden_cambio_gasto_id: null, orden_cambio_linea_id: null, estado: "confirmado" },
    { id: 11, orden_cambio_id: 1, orden_cambio_gasto_id: null, orden_cambio_linea_id: null, estado: "previsto" },
  ];
  const plan = planDeBeneficios({
    obraId: 1, ordenes: [{ id: 1, estado: "aprobada", ejecucion: "pendiente" }],
    existentes, codigoDe: () => "OC-01",
  });
  assert.deepEqual(plan.borrar, [11]);
});
