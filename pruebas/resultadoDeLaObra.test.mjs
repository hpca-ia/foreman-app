import test from "node:test";
import assert from "node:assert/strict";
import { seguimientoDeRubro, perdidasEnRubros, resultadoDeLaObra } from "../src/modules/controlObra/resultadoDeLaObra.js";

// Diners Aeropuerto: el 9101 de la OC-01 sin costo y pasado; las mamparas con
// costo y sin empezar; y una pintura terminada que compró mejor que su costo.
const rubros = [
  { id: 1434, numero: 9101, descripcion: "Picado", total_base: 511.28, iva_pct: 15, cantidad: 95.61 },
  { id: 1325, numero: 58, descripcion: "Mamparas", total_base: 6900, iva_pct: 15, cantidad: 1, costo_unitario: 150 },
  { id: 7, numero: 7, descripcion: "Pintura", total_base: 1150, iva_pct: 15, cantidad: 1, costo_unitario: 600, avance_pct: 100 },
  { id: 8, numero: 8, descripcion: "Tachado", total_base: 100, anulado_por_oc: 3 },
];
const porRubro = { 1434: { acumulado: 671.64 }, 7: { acumulado: 650 }, 8: { acumulado: 500 } };

test("un rubro pasado de su presupuesto es una pérdida de la obra, se lo siga o no", () => {
  const p = perdidasEnRubros(rubros, porRubro);
  assert.deepEqual(p.filas.map(f => f.id), [1434]);   // el tachado no cuenta
  assert.equal(p.total, -160.36);
});

test("se mide contra el costo si está cargado; si no, contra lo que se cobra", () => {
  const pintura = seguimientoDeRubro(rubros[2], porRubro);
  assert.equal(pintura.contra, "costo");
  assert.equal(pintura.presupuestado, 690);     // 600 × 1 × 1,15, en la base del gasto
  assert.equal(pintura.resultado, 40);
  assert.equal(pintura.estado, "terminado");
  assert.equal(pintura.cuenta, true);
  const picado = seguimientoDeRubro(rubros[0], porRubro);
  assert.equal(picado.contra, "cobrado");
  assert.equal(picado.resultado, -160.36);
  assert.equal(picado.estado, "pasado");
});

test("el resultado: lo ganado comprando, menos las pérdidas, más lo que dejaron los seguidos terminados", () => {
  const r = resultadoDeLaObra({
    beneficios: [{ presupuestado: 720, real: 450 }, { presupuestado: 14300.02, real: 9500 }],
    rubros, porRubro,
    seguidos: [{ id: 1, obra_rubro_id: 7 }, { id: 2, obra_rubro_id: 1325 }, { id: 3, obra_rubro_id: 999 }],
  });
  assert.equal(r.conPapel, 5070.02);
  assert.equal(r.perdidasTotal, -160.36);
  assert.equal(r.ganadoEnSeguidos, 40);
  assert.equal(r.neto, 4949.66);
  assert.deepEqual(r.seguimiento.map(f => f.id), [7, 1325]);   // el 999 ya no existe
  assert.equal(r.seguimiento[1].estado, "sin_empezar");
});

test("un seguido en curso se muestra pero no cuenta hasta terminar", () => {
  const r = resultadoDeLaObra({
    rubros: [{ ...rubros[2], avance_pct: 50 }], porRubro,
    seguidos: [{ id: 1, obra_rubro_id: 7 }],
  });
  assert.equal(r.seguimiento[0].estado, "en_curso");
  assert.equal(r.seguimiento[0].cuenta, false);
  assert.equal(r.ganadoEnSeguidos, 0);
  assert.equal(r.neto, 0);
});

test("un seguido que se pasó cuenta una sola vez, en las pérdidas", () => {
  const r = resultadoDeLaObra({ rubros, porRubro, seguidos: [{ id: 1, obra_rubro_id: 1434 }] });
  assert.equal(r.perdidasTotal, -160.36);
  assert.equal(r.ganadoEnSeguidos, 0);
  assert.equal(r.neto, -160.36);
});
