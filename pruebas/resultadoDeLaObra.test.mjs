import test from "node:test";
import assert from "node:assert/strict";
import { seguimientoDeRubro, perdidasEnRubros, resultadoDeLaObra } from "../src/modules/controlObra/resultadoDeLaObra.js";

// Diners Aeropuerto: el 9101 de la OC-01 sin costo y pasado; las mamparas con
// costo y sin empezar; y una pintura terminada que compró mejor que su costo.
const rubros = [
  // Los de una orden de cambio también llevan el IVA adentro desde la 140.
  { id: 1434, numero: 9101, descripcion: "Picado", total_base: 511.28, iva_pct: 15, cantidad: 95.61, origen: "orden_cambio" },
  { id: 1325, numero: 58, descripcion: "Mamparas", total_base: 6900, iva_pct: 15, cantidad: 1, costo_unitario: 150 },
  { id: 7, numero: 7, descripcion: "Pintura", total_base: 1150, iva_pct: 15, cantidad: 1, costo_unitario: 600, avance_pct: 100 },
  { id: 8, numero: 8, descripcion: "Tachado", total_base: 100, anulado_por_oc: 3 },
];
const porRubro = { 1434: { acumulado: 671.64 }, 7: { acumulado: 650 }, 8: { acumulado: 500 } };

test("un rubro pasado de su presupuesto es una pérdida de la obra, se lo siga o no", () => {
  const p = perdidasEnRubros(rubros, porRubro);
  assert.deepEqual(p.filas.map(f => f.id), [1434]);   // el tachado no cuenta
  // Se cobra $511,28 con IVA = $444,59 sin IVA; los $671,64 de facturas son $584,03 sin IVA.
  assert.equal(p.total, -139.44);
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
  assert.equal(picado.cobrado, 444.59);
  assert.equal(picado.resultado, -139.44);
  assert.equal(picado.estado, "pasado");
});

test("el resultado: lo ganado comprando, menos las pérdidas, más lo que dejaron los seguidos terminados", () => {
  const r = resultadoDeLaObra({
    beneficios: [{ presupuestado: 720, real: 450 }, { presupuestado: 14300.02, real: 9500 }],
    rubros, porRubro,
    seguidos: [{ id: 1, obra_rubro_id: 7 }, { id: 2, obra_rubro_id: 1325 }, { id: 3, obra_rubro_id: 999 }],
  });
  assert.equal(r.conPapel, 5070.02);
  assert.equal(r.perdidasTotal, -139.44);
  assert.equal(r.ganadoEnSeguidos, 34.78);
  // LO YA APROBADO SUMA. La pintura se cobra $1.000 y tiene $600 de costo: esos
  // $400 ya son beneficio. Con los $34,78 que además se ahorró comprando, el
  // rubro dejó $434,78: lo que se cobra menos lo que se gastó. Las mamparas,
  // con $150 de costo contra $6.000 de precio, no se cuentan: costo dudoso.
  assert.equal(r.aprobados.total, 400);
  assert.equal(r.aprobados.dudosos, 1);
  assert.equal(r.neto, 5365.36);
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
  // Lo que no cuenta hasta terminar es lo que se gana o se pierde COMPRANDO.
  // El margen de lo ya aprobado —$1.000 que se cobran, $600 de costo— sí.
  assert.equal(r.neto, 400);
});

test("un seguido que se pasó cuenta una sola vez, en las pérdidas", () => {
  const r = resultadoDeLaObra({ rubros, porRubro, seguidos: [{ id: 1, obra_rubro_id: 1434 }] });
  assert.equal(r.perdidasTotal, -139.44);
  assert.equal(r.ganadoEnSeguidos, 0);
  // La pérdida del pasado, una sola vez, y aparte los $400 de la pintura ya aprobada.
  assert.equal(r.aprobados.total, 400);
  assert.equal(r.neto, 260.56);
});

test("la reducción de una orden de cambio, en negativo y sin gasto, no es una pérdida", () => {
  // El 9190 "(–) Piso de microcemento" de la OC-01: total −$8.658,68, sin facturas.
  const reduccion = { id: 1440, numero: 9190, descripcion: "(–) Piso de microcemento", total_base: -8658.68, iva_pct: 15, cantidad: 95.61, origen: "orden_cambio" };
  const f = seguimientoDeRubro(reduccion, {});
  assert.equal(f.estado, "sin_empezar");
  assert.equal(f.cuenta, false);
  const p = perdidasEnRubros([reduccion, ...rubros], porRubro);
  assert.deepEqual(p.filas.map(x => x.id), [1434]);
  assert.equal(p.total, -139.44);
});

// ── LO YA APROBADO DEJA BENEFICIO DESDE YA ─────────────────────────────────
//
// La regla del director. Un rubro que el cliente aprobó a un precio y del que
// se sabe el costo deja beneficio: precio menos costo, por la cantidad que
// sigue aprobada. Vive en el rubro, no en una proforma: en Diners Aeropuerto se
// borró el análisis de donde habían salido los costos y Beneficios quedó sin
// nada de esos treinta rubros.

test("lo ya aprobado deja precio menos costo por su cantidad, sin IVA", async () => {
  const { beneficioDeLoAprobado } = await import("../src/modules/controlObra/resultadoDeLaObra.js");
  const rubros = [
    { id: 1373, numero: 106, descripcion: "Punto de iluminación", unidad: "U", cantidad: 65, precio_unitario: 36.38, total_base: 2719.51, iva_pct: 15, costo_unitario: 33.074 },
    { id: 1414, numero: 147, descripcion: "Acometida", unidad: "GL", cantidad: 1, precio_unitario: 1350, total_base: 1552.5, iva_pct: 15, costo_unitario: 1088.5 },
    // Sin costo no se sabe qué deja: no está.
    { id: 5, numero: 5, descripcion: "Pintura", unidad: "m2", cantidad: 100, precio_unitario: 8, total_base: 920, iva_pct: 15 },
  ];
  const r = beneficioDeLoAprobado({ rubros });
  assert.deepEqual(r.filas.map(f => [f.numero, f.cantidad, f.seCobra, f.cuesta, f.beneficio]), [
    ["147", 1, 1350, 1088.5, 261.5],
    ["106", 65, 2364.7, 2149.81, 214.89],
  ]);
  assert.equal(r.total, 476.39);
});

test("lo que una orden aprobada redujo ya está descontado: lo que queda conserva su beneficio", async () => {
  const { beneficioDeLoAprobado, reduccionesAprobadas } = await import("../src/modules/controlObra/resultadoDeLaObra.js");
  const rubros = [{ id: 97, numero: 97, descripcion: "Interruptor doble", unidad: "U", cantidad: 4, precio_unitario: 9.79, total_base: 45.03, iva_pct: 15, costo_unitario: 8.9 }];
  const ordenes = [
    { id: 12, estado: "aprobada" },
    { id: 13, estado: "borrador" },            // todavía no cuenta
    { id: 14, estado: "aprobada", anulada: true },
  ];
  const lineas = {
    12: [{ tipo: "quita", obra_rubro_id: 97, cantidad: 2 }, { tipo: "aumenta", obra_rubro_id: 97, cantidad: 9 }],
    13: [{ tipo: "quita", obra_rubro_id: 97, cantidad: 1 }],
    14: [{ tipo: "quita", obra_rubro_id: 97, cantidad: 1 }],
  };
  const reducciones = reduccionesAprobadas(ordenes, lineas);
  assert.deepEqual(reducciones, { 97: 2 }, "solo la orden aprobada, y solo lo que quita");
  const r = beneficioDeLoAprobado({ rubros, reducciones });
  assert.equal(r.filas[0].contratada, 4);
  assert.equal(r.filas[0].reducida, 2);
  assert.equal(r.filas[0].cantidad, 2);
  assert.equal(r.filas[0].beneficio, 1.78, "0,89 por cada una de las 2 que quedan");
  // Si la orden lo quitó entero, no queda nada aprobado.
  assert.equal(beneficioDeLoAprobado({ rubros, reducciones: { 97: 4 } }).filas.length, 0);
});

test("lo que aumenta una orden no está acá, y un beneficio cargado a mano no se cuenta dos veces", async () => {
  const { beneficioDeLoAprobado } = await import("../src/modules/controlObra/resultadoDeLaObra.js");
  const rubros = [
    { id: 1, numero: 1, unidad: "U", cantidad: 10, precio_unitario: 100, total_base: 1150, iva_pct: 15, costo_unitario: 80 },
    // El rubro que metió una orden de cambio: su beneficio entra con la orden.
    { id: 2, numero: 9401, unidad: "U", cantidad: 5, precio_unitario: 115, total_base: 575, iva_pct: 15, costo_unitario: 80, origen: "orden_cambio" },
    { id: 3, numero: 3, unidad: "U", cantidad: 2, precio_unitario: 50, total_base: 115, iva_pct: 15, costo_unitario: 40 },
    { id: 4, numero: 4, unidad: "U", cantidad: 1, precio_unitario: 50, total_base: 57.5, iva_pct: 15, costo_unitario: 40, oculto: true },
  ];
  const beneficios = [
    { obra_rubro_id: 3, origen: "manual", presupuestado: 100, real: 70 },      // manda el escrito a mano
    { obra_rubro_id: 1, origen: "proforma", presupuestado: 800, real: 780 },   // mejora el costo: se suma, no reemplaza
  ];
  const r = beneficioDeLoAprobado({ rubros, beneficios });
  assert.deepEqual(r.filas.map(f => f.id), [1]);
  assert.equal(r.total, 200);
});

test("un rubro que cuesta más de lo que se cobra aparece en contra", async () => {
  const { beneficioDeLoAprobado } = await import("../src/modules/controlObra/resultadoDeLaObra.js");
  const r = beneficioDeLoAprobado({ rubros: [
    { id: 1, numero: 1, unidad: "U", cantidad: 3, precio_unitario: 10, total_base: 34.5, iva_pct: 15, costo_unitario: 12 }] });
  assert.equal(r.filas[0].beneficio, -6);
  assert.equal(r.total, -6);
});

test("lo ya aprobado es beneficio: suma al resultado de la obra", async () => {
  const { resultadoDeLaObra } = await import("../src/modules/controlObra/resultadoDeLaObra.js");
  const rubros = [{ id: 1, numero: 1, unidad: "U", cantidad: 10, precio_unitario: 100, total_base: 1150, iva_pct: 15, costo_unitario: 80 }];
  const res = resultadoDeLaObra({ rubros });
  assert.equal(res.aprobados.total, 200);
  assert.equal(res.neto, 200, "ya es beneficio: está en el contrato, no en una proforma");
  // Y cierra con los pasados: si el rubro gasta $900 sin IVA contra $800 de
  // costo, pierde $100, y lo que de verdad dejó es precio menos lo gastado.
  const pasado = resultadoDeLaObra({ rubros, porRubro: { 1: { acumulado: 1035 } } });
  assert.equal(pasado.perdidasTotal, -100);
  assert.equal(pasado.neto, 100, "1.000 que se cobran menos 900 gastados");
});

test("un costo que no se parece al precio no se cuenta: se lista aparte para corregirlo", async () => {
  // Las mamparas de Diners: $6.000 de precio y $150 de costo cargado.
  const { beneficioDeLoAprobado } = await import("../src/modules/controlObra/resultadoDeLaObra.js");
  const r = beneficioDeLoAprobado({ rubros: [
    { id: 58, numero: 58, unidad: "glb", cantidad: 1, precio_unitario: 6000, total_base: 6900, iva_pct: 15, costo_unitario: 150 },
    { id: 90, numero: 90, unidad: "U", cantidad: 1, precio_unitario: 247.29, total_base: 284.38, iva_pct: 15, costo_unitario: 224.81 },
  ] });
  assert.equal(r.total, 22.48, "los $5.850 de las mamparas no entran");
  assert.equal(r.cuantos, 1);
  assert.equal(r.dudosos, 1);
  assert.deepEqual(r.filas.map(f => [f.numero, f.dudoso]), [["90", false], ["58", true]]);
});

// ── LAS ÓRDENES DE CAMBIO POR APROBAR ──────────────────────────────────────
//
// Lo que una orden agrega es beneficio recién cuando el cliente la aprueba.
// Pero hace falta verlo antes, a la vista y sin sumar, como un rubro en
// seguimiento que todavía no terminó.

test("una orden por aprobar muestra lo que dejaría, y no suma al resultado", async () => {
  const { ordenesPorAprobar, resultadoDeLaObra } = await import("../src/modules/controlObra/resultadoDeLaObra.js");
  const rubros = [
    { id: 97, numero: 97, unidad: "U", cantidad: 4, precio_unitario: 9.79, total_base: 45.03, iva_pct: 15, costo_unitario: 8.9 },
    { id: 50, numero: 50, unidad: "m2", cantidad: 10, precio_unitario: 20, total_base: 230, iva_pct: 15 },   // sin costo
  ];
  const ordenes = [
    { id: 13, numero: 4, codigo: "OC-04", titulo: "Diferencias eléctricas", estado: "enviada" },
    { id: 14, numero: 5, codigo: "OC-05", titulo: "Otra", estado: "aprobada" },
    { id: 15, numero: 6, codigo: "OC-06", titulo: "Anulada", estado: "enviada", anulada: true },
    { id: 16, numero: 7, codigo: "OC-07", titulo: "Reemplazada", estado: "enviada", reemplazada_at: "2026-11-05" },
    { id: 17, numero: 8, codigo: "OC-08", titulo: "Vacía", estado: "borrador" },
  ];
  const lineasDeOrdenes = {
    13: [
      { tipo: "aumenta", cantidad: 1, precio_unitario: 456, costo_unitario: 380 },         // deja 76
      { tipo: "aumenta", cantidad: 46, precio_unitario: 36.38, costo_unitario: 33.07 },    // deja 152,26
      { tipo: "aumenta", cantidad: 2, precio_unitario: 50 },                               // sin costo: no se mide
      { tipo: "quita", obra_rubro_id: 97, cantidad: 2, precio_unitario: 9.79 },            // saca 2 × 0,89
      { tipo: "quita", obra_rubro_id: 50, cantidad: 3, precio_unitario: 20 },              // el rubro no tiene costo
    ],
    14: [{ tipo: "aumenta", cantidad: 1, precio_unitario: 100, costo_unitario: 60 }],
    15: [{ tipo: "aumenta", cantidad: 1, precio_unitario: 100, costo_unitario: 60 }],
    16: [{ tipo: "aumenta", cantidad: 1, precio_unitario: 100, costo_unitario: 60 }],
  };
  const p = ordenesPorAprobar({ ordenes, lineasDeOrdenes, rubros });
  assert.deepEqual(p.filas.map(f => f.codigo), ["OC-04"], "ni la aprobada, ni la anulada, ni la reemplazada, ni la vacía");
  const [f] = p.filas;
  assert.equal(f.partidas, 5);
  assert.equal(f.dejan, 228.26);
  assert.equal(f.sacan, 1.78);
  assert.equal(f.sinCosto, 1);
  assert.equal(f.beneficio, 226.48);
  assert.equal(p.total, 226.48);
  // Está a la vista y no cuenta: el resultado es solo lo ya aprobado.
  const res = resultadoDeLaObra({ rubros, ordenes, lineasDeOrdenes });
  assert.equal(res.porAprobar.total, 226.48);
  assert.equal(res.aprobados.total, 3.56, "los 4 interruptores del contrato: la orden enviada todavía no les quitó nada");
  assert.equal(res.neto, 3.56);
});
