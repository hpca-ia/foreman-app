import test from "node:test";
import assert from "node:assert/strict";
import { seguimientoDeRubro, perdidasEnRubros, resultadoDeLaObra } from "../src/modules/controlObra/resultadoDeLaObra.js";

// Diners Aeropuerto: el 9101 de la OC-01 sin costo y pasado; las mamparas con
// costo y sin empezar; y una pintura terminada que compró mejor que su costo.
const rubros = [
  // Los de una orden de cambio ya están sin IVA en el control; los base no.
  { id: 1434, numero: 9101, descripcion: "Picado", total_base: 511.28, iva_pct: 15, cantidad: 95.61, origen: "orden_cambio" },
  { id: 1325, numero: 58, descripcion: "Mamparas", total_base: 6900, iva_pct: 15, cantidad: 1, costo_unitario: 150 },
  { id: 7, numero: 7, descripcion: "Pintura", total_base: 1150, iva_pct: 15, cantidad: 1, costo_unitario: 600, avance_pct: 100 },
  { id: 8, numero: 8, descripcion: "Tachado", total_base: 100, anulado_por_oc: 3 },
];
const porRubro = { 1434: { acumulado: 671.64 }, 7: { acumulado: 650 }, 8: { acumulado: 500 } };

test("un rubro pasado de su presupuesto es una pérdida de la obra, se lo siga o no", () => {
  const p = perdidasEnRubros(rubros, porRubro);
  assert.deepEqual(p.filas.map(f => f.id), [1434]);   // el tachado no cuenta
  // Se cobra $511,28 sin IVA; los $671,64 de facturas son $584,03 sin IVA.
  assert.equal(p.total, -72.75);
});

test("todo sin IVA, como los beneficios: lo que se cobra, el costo y el gasto de las facturas", () => {
  const mamparas = seguimientoDeRubro(rubros[1], { 1325: { acumulado: 1150 } });
  assert.equal(mamparas.cobrado, 6000);     // 6.900 con IVA → 6.000
  assert.equal(mamparas.costo, 150);        // el costo ya viene sin IVA
  assert.equal(mamparas.gastado, 1000);     // 1.150 de facturas → 1.000
});

test("se mide contra el costo si está cargado; si no, contra lo que se cobra", () => {
  const pintura = seguimientoDeRubro(rubros[2], porRubro);
  assert.equal(pintura.contra, "costo");
  assert.equal(pintura.presupuestado, 600);     // el costo, sin IVA
  assert.equal(pintura.gastado, 565.22);        // 650 de facturas, sin su 15%
  assert.equal(pintura.resultado, 34.78);
  assert.equal(pintura.estado, "terminado");
  assert.equal(pintura.cuenta, true);
  const picado = seguimientoDeRubro(rubros[0], porRubro);
  assert.equal(picado.contra, "cobrado");
  assert.equal(picado.resultado, -72.75);
  assert.equal(picado.estado, "pasado");
});

test("el resultado: lo ganado comprando, menos las pérdidas, más lo que dejaron los seguidos terminados", () => {
  const r = resultadoDeLaObra({
    beneficios: [{ presupuestado: 720, real: 450 }, { presupuestado: 14300.02, real: 9500 }],
    rubros, porRubro,
    seguidos: [{ id: 1, obra_rubro_id: 7 }, { id: 2, obra_rubro_id: 1325 }, { id: 3, obra_rubro_id: 999 }],
  });
  assert.equal(r.conPapel, 5070.02);
  assert.equal(r.perdidasTotal, -72.75);
  assert.equal(r.ganadoEnSeguidos, 34.78);
  assert.equal(r.neto, 5032.05);
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
  assert.equal(r.perdidasTotal, -72.75);
  assert.equal(r.ganadoEnSeguidos, 0);
  assert.equal(r.neto, -72.75);
});

test("la reducción de una orden de cambio, en negativo y sin gasto, no es una pérdida", () => {
  // El 9190 "(–) Piso de microcemento" de la OC-01: total −$8.658,68, sin facturas.
  const reduccion = { id: 1440, numero: 9190, descripcion: "(–) Piso de microcemento", total_base: -8658.68, iva_pct: 15, cantidad: 95.61, origen: "orden_cambio" };
  const f = seguimientoDeRubro(reduccion, {});
  assert.equal(f.estado, "sin_empezar");
  assert.equal(f.cuenta, false);
  const p = perdidasEnRubros([reduccion, ...rubros], porRubro);
  assert.deepEqual(p.filas.map(x => x.id), [1434]);
  assert.equal(p.total, -72.75);
});
