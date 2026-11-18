// Un rubro negativo no es una pérdida. Hernán, 18/11/2026, mirando
// «Beneficios y pérdidas» del Aeropuerto: «en pérdidas y beneficios no
// debería estar este rubro... no es una pérdida, es solo un rubro negativo».
//
// Las filas son las de la obra 13 ese día. El «(–) PISO DE MICROCEMENTO ·
// OC-01» tenía dos gastos de caja chica cargados directo ($143,32 y $6,00) y
// con eso salía como «rubro pasado» por −$7.659,13: de los −$8.210,48 que
// mostraba la obra, el 93%.
import { test } from "node:test";
import assert from "node:assert/strict";
import { seguimientoDeRubro, perdidasEnRubros, resultadoDeLaObra } from "../src/modules/controlObra/resultadoDeLaObra.js";
import { eficienciaDeRubros, esNegativo, seMide } from "../src/modules/controlObra/eficienciaDeRubros.js";

// Los cinco rubros que importan, como están en la base (con IVA adentro).
const MICROCEMENTO = { id: 1440, numero: 9190, capitulo: "ADICIONALES · OC-01", descripcion: "(–) PISO DE MICROCEMENTO PULIDO COLOR BLANCO  ·  OC-01", unidad: "m2", cantidad: 95.61, precio_unitario: -90.5625, total_base: -8658.68, iva_pct: 15, costo_unitario: null, avance_pct: 0, origen: "orden_cambio", orden_cambio_id: 5 };
const GYPSUM_QUITADO = { id: 1448, numero: 9304, capitulo: "ADICIONALES · OC-03", descripcion: "(–) TUMBADO GYPSUM PLANO REGULAR  ·  OC-03", unidad: "m2", cantidad: 39, precio_unitario: -25.77, total_base: -1005.09, iva_pct: 15, costo_unitario: null, avance_pct: 0, origen: "orden_cambio", orden_cambio_id: 9 };
const PISO_MAPLE = { id: 1311, numero: 44, descripcion: "PISO PLMAINADO COLOR MAPLE", total_base: 355.79, iva_pct: 15, costo_unitario: null, avance_pct: 0 };
const PICADO = { id: 1434, numero: 9101, descripcion: "PICADO DE MASILLADO Y LOSA 7 CM  ·  OC-01", cantidad: 95.61, precio_unitario: 5.3475, total_base: 511.27, iva_pct: 15, costo_unitario: null, avance_pct: 0, origen: "orden_cambio", orden_cambio_id: 5 };
const GYPSUM_HUMEDAD = { id: 1296, numero: 29, descripcion: "TUMBADO GYPSUM HUMEDAD", total_base: 243.79, iva_pct: 15, costo_unitario: null, avance_pct: 0 };
const RUBROS = [MICROCEMENTO, GYPSUM_QUITADO, PISO_MAPLE, PICADO, GYPSUM_HUMEDAD];
// Lo cargado a cada uno, con IVA, como lo calcula el control.
const POR_RUBRO = { 1440: { acumulado: 149.32 }, 1448: { acumulado: 0 }, 1311: { acumulado: 693.11 }, 1434: { acumulado: 671.63 }, 1296: { acumulado: 380.16 } };

test("LO QUE PIDIÓ: el renglón en negativo de una orden no está entre las pérdidas, tenga gasto o no", () => {
  const p = perdidasEnRubros(RUBROS, POR_RUBRO);
  // Los tres que de verdad gastaron más de lo que tenían.
  assert.deepEqual(p.filas.map(f => [f.numero, f.resultado]), [["44", -293.32], ["9101", -139.45], ["29", -118.58]]);
  assert.equal(p.total, -551.35);
  assert.equal(p.filas.some(f => f.id === 1440), false);
  // Antes: cuatro, y el primero era el microcemento con −7.659,13.
  const comoAntes = c => Math.round((MICROCEMENTO.total_base / 1.15 - c / 1.15) * 100) / 100;
  assert.equal(comoAntes(149.32), -7659.13);
});

test("el negativo no se mide: ni pasado, ni cuenta, con el gasto que tenga", () => {
  const conGasto = seguimientoDeRubro(MICROCEMENTO, POR_RUBRO);
  assert.equal(conGasto.gastado, 129.84);
  assert.equal(conGasto.estado, "en_curso");
  assert.equal(conGasto.cuenta, false);
  const sinGasto = seguimientoDeRubro(GYPSUM_QUITADO, POR_RUBRO);
  assert.equal(sinGasto.estado, "sin_empezar");
  assert.equal(sinGasto.cuenta, false);
  // Aunque alguien lo marque terminado: no deja ni saca nada.
  assert.equal(seguimientoDeRubro({ ...MICROCEMENTO, avance_pct: 100 }, POR_RUBRO).estado, "terminado");
  assert.equal(perdidasEnRubros([{ ...MICROCEMENTO, avance_pct: 100 }], POR_RUBRO).filas.length, 0);
  // Qué es un negativo: su total, no su nombre.
  assert.equal(esNegativo(MICROCEMENTO), true);
  assert.equal(esNegativo(PICADO), false);
  assert.equal(esNegativo({ total_base: 0 }), false);
  assert.equal(esNegativo(null), false);
  assert.equal(seMide(MICROCEMENTO), false);
  assert.equal(seMide(PICADO), true);
  assert.equal(seMide({ ...PICADO, anulado_por_oc: 5 }), false);
});

test("un rubro de verdad que gastó de más sigue siendo una pérdida", () => {
  const s = seguimientoDeRubro(PISO_MAPLE, POR_RUBRO);
  assert.equal(s.estado, "pasado");
  assert.equal(s.cuenta, true);
  assert.equal(s.resultado, -293.32);
});

test("tampoco sale como sobreprecio ni resta en lo que deja la obra", () => {
  const e = eficienciaDeRubros({ rubros: RUBROS, porRubro: POR_RUBRO });
  assert.equal(e.filas.some(f => f.id === 1440 || f.id === 1448), false);
  assert.equal(e.cuantosPasados, 3);
  assert.equal(e.pasadosTotal, -551.35);
  assert.deepEqual(e.pasados.map(f => f.id), [1311, 1434, 1296]);
  // Y el resultado de la obra, que es el número de arriba, tampoco lo cuenta.
  const res = resultadoDeLaObra({ beneficios: [], rubros: RUBROS, seguidos: [], porRubro: POR_RUBRO });
  assert.equal(res.perdidas.length, 3);
  assert.equal(res.perdidasTotal, -551.35);
});
