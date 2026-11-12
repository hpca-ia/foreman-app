// La liquidación: el presupuesto actualizado con lo que de verdad se ejecutó.
import test from "node:test";
import assert from "node:assert/strict";
import { presupuestoActualizado, renglonesDeLaMatriz } from "../src/modules/controlObra/presupuestoActualizado.js";
import {
  liquidacion, liquidacionDeLaObra, subtotalesDeLiquidacion, cantidadEscrita, modalidadDe, seMide, costosDe, comoSeDice,
} from "../src/modules/controlObra/liquidacion.js";
import { beneficioDeLoAprobado } from "../src/modules/controlObra/resultadoDeLaObra.js";

const rubro = (id, numero, cantidad, precio, extra = {}) => ({
  id, numero, descripcion: `Rubro ${numero}`, unidad: "m2", cantidad, precio_unitario: precio,
  total_base: Math.round(cantidad * precio * 1.15 * 100) / 100, iva_pct: 15,
  capitulo: "ACABADOS", capitulo_orden: 1, orden: numero, origen: "base", ...extra,
});
// Un contrato chico: piso (con costo), pintura (sin costo), y su honorario del 10 %.
const rubros = [
  rubro(1, 1, 100, 50, { costo_unitario: 40 }),
  rubro(2, 2, 200, 8),
  rubro(9, 9, 1, 660, { descripcion: "Honorarios de administración 10 %", unidad: "glb", capitulo: "HONORARIOS", capitulo_orden: 9 }),
];
const obra = { id: 13, honorarios_pct: 10 };
const ordenes = [{ id: 1, numero: 1, codigo: "OC-01", titulo: "Cielo raso", estado: "aprobada" }];
const lineasDeOrdenes = { 1: [
  { id: 11, tipo: "aumenta", clase: "nuevo", item: "ADIC-01", descripcion: "Cielo raso de gypsum", unidad: "m2", cantidad: 30, precio_unitario: 20 },
  { id: 12, tipo: "aumenta", clase: "mas", obra_rubro_id: 2, rubro_codigo: "2", cantidad: 50, precio_unitario: 8 },
] };
const matriz = presupuestoActualizado({ rubros, ordenes, lineasDeOrdenes, obra });
const costos = costosDe(rubros);

test("sin nada ejecutado cargado, la liquidación es el contrato vigente, al centavo", () => {
  const l = liquidacion({ matriz, ejecutado: {}, modalidad: "rubros", costos });
  assert.equal(l.totales.liquidacion, matriz.totales.vigente);
  assert.equal(l.totales.iva, matriz.ivas.vigente);
  assert.equal(l.totales.conIva, matriz.totalesConIva.vigente);
  assert.equal(l.totales.diferencia, 0);
  assert.deepEqual(l.diferencias, []);
  assert.deepEqual(l.deltas, {});
  assert.equal(l.totales.medidos, 0);
  // Cada renglón se cobra por lo vigente.
  assert.equal(l.porFila["1"].cobra, 5000);
  assert.equal(l.porFila["2"].cobra, 2000);   // 200 del contrato + 50 de la orden, a 8
});

test("por rubros: contratado 100, ejecutado 80, se cobran 80 al precio pactado", () => {
  const l = liquidacion({ matriz, ejecutado: { 1: 80 }, modalidad: "rubros", costos });
  const piso = l.porFila["1"];
  assert.equal(piso.ejecutada, 80); assert.equal(piso.deltaCantidad, -20);
  assert.equal(piso.deltaCobro, -1000); assert.equal(piso.cobra, 4000);
  // El honorario se mueve con lo ejecutado: 10 % de los 1.000 que no se cobran.
  assert.equal(l.honorarios.delta, -100);
  assert.equal(l.porFila["9"].cobra, matriz.capitulos.at(-1).filas[0].vigente.total - 100);
  assert.equal(l.totales.enRubros, -1000);
  assert.equal(l.totales.diferencia, -1100);
  assert.equal(l.totales.liquidacion, Math.round((matriz.totales.vigente - 1100) * 100) / 100);
  assert.equal(l.totales.conIva, Math.round((matriz.totalesConIva.vigente - 1100 * 1.15) * 100) / 100);
});

test("por rubros da lo mismo que el ajuste a mano de la proyección: son dos caminos a la misma cuenta", () => {
  const l = liquidacion({ matriz, ejecutado: { 1: 80, 2: 262.5 }, modalidad: "rubros", costos });
  const proyeccion = presupuestoActualizado({ rubros, ordenes, lineasDeOrdenes, obra, ajustes: { 1: -20, 2: 12.5 } });
  assert.equal(l.totales.liquidacion, proyeccion.totales.proyectado);
  assert.equal(l.totales.iva, proyeccion.ivas.proyectado);
  assert.equal(l.totales.conIva, proyeccion.totalesConIva.proyectado);
  assert.equal(l.totales.honorarios, proyeccion.ajuste.honorarios);
});

test("por rubros, la diferencia de cantidad sola no es beneficio: se mueve el margen de esas unidades", () => {
  const l = liquidacion({ matriz, ejecutado: { 1: 80 }, modalidad: "rubros", costos });
  // Precio 50, costo 40: se dejan de ganar 10 por cada una de las 20.
  assert.equal(l.diferencias[0].efecto, -200);
  assert.equal(l.totales.efecto, -200);
  const mas = liquidacion({ matriz, ejecutado: { 1: 120 }, modalidad: "rubros", costos });
  assert.equal(mas.diferencias[0].deltaCobro, 1000);
  assert.equal(mas.diferencias[0].efecto, 200);
});

test("llave en mano: contratado 100, ejecutado 120, se cobran los 100", () => {
  const l = liquidacion({ matriz, ejecutado: { 1: 120 }, modalidad: "llave_en_mano", costos });
  assert.equal(l.porFila["1"].cobra, 5000);
  assert.equal(l.porFila["1"].deltaCobro, 0);
  assert.equal(l.totales.liquidacion, matriz.totales.vigente);
  assert.equal(l.totales.conIva, matriz.totalesConIva.vigente);
  assert.equal(l.honorarios.delta, 0);
  // Pero costó 20 más, a 40 cada una: es pérdida.
  assert.equal(l.diferencias[0].deltaCantidad, 20);
  assert.equal(l.diferencias[0].efecto, -800);
});

test("llave en mano: ejecutar menos es beneficio por el costo que no se gastó", () => {
  const l = liquidacion({ matriz, ejecutado: { 1: 80 }, modalidad: "llave_en_mano", costos });
  assert.equal(l.porFila["1"].cobra, 5000);
  assert.equal(l.diferencias[0].efecto, 800);
  assert.equal(l.totales.efecto, 800);
});

test("sin costo cargado no se inventa qué le hace al beneficio: se dice que no se sabe", () => {
  const l = liquidacion({ matriz, ejecutado: { 2: 240 }, modalidad: "rubros", costos });
  assert.equal(l.diferencias[0].efecto, null);
  assert.equal(l.totales.sinCosto, 1);
  assert.equal(l.totales.efecto, 0);
  assert.match(comoSeDice(l.diferencias[0], "rubros", v => String(v)), /sin costo cargado no se sabe/);
});

test("lo que agregó una orden aprobada también se mide, con su propia clave", () => {
  const delBloque = matriz.bloques[0].filas[0];
  assert.equal(delBloque.id, "o1-11");
  const l = liquidacion({ matriz, ejecutado: { "o1-11": 25 }, modalidad: "rubros", costos });
  assert.equal(l.porFila["o1-11"].cobra, 500);            // 25 a 20
  assert.equal(l.porFila["o1-11"].deltaCobro, -100);
  assert.equal(l.totales.diferencia, -110);               // con su honorario
});

test("cero ejecutado no se cobra nada, aunque cantidad por precio no dé justo el total", () => {
  const raro = presupuestoActualizado({ rubros: [rubro(5, 5, 3, 33.3333, { total_base: 115 })], obra });
  assert.equal(raro.capitulos[0].filas[0].vigente.total, 100);
  const l = liquidacion({ matriz: raro, ejecutado: { 5: 0 }, modalidad: "rubros" });
  assert.equal(l.porFila["5"].cobra, 0);
  assert.equal(l.totales.liquidacion, 0);
});

test("un renglón sin medir no es una diferencia, y los honorarios no se miden", () => {
  const l = liquidacion({ matriz, ejecutado: { 1: 100, 9: 0.5 }, modalidad: "rubros", costos });
  // 100 ejecutado de 100: medido, sin diferencia. El de honorarios se ignora.
  assert.deepEqual(l.diferencias, []);
  assert.equal(l.totales.medidos, 1);
  assert.equal(l.totales.sinMedir, 2);                    // la pintura y el cielo raso de la orden
  assert.equal(seMide(matriz.capitulos.at(-1).filas[0]), false);
  assert.equal(l.totales.liquidacion, matriz.totales.vigente);
});

test("lo escrito en la casilla: vacío es sin medir; cero es cero; una coma es un decimal", () => {
  assert.equal(cantidadEscrita(""), null);
  assert.equal(cantidadEscrita(null), null);
  assert.equal(cantidadEscrita("0"), 0);
  assert.equal(cantidadEscrita("12,5"), 12.5);
  assert.equal(cantidadEscrita(80), 80);
  assert.equal(cantidadEscrita("-3"), null);
  assert.equal(cantidadEscrita("abc"), null);
});

test("sin el dato, la obra es por rubros", () => {
  assert.equal(modalidadDe({}), "rubros");
  assert.equal(modalidadDe({ modalidad: "llave_en_mano" }), "llave_en_mano");
  assert.equal(modalidadDe({ modalidad: "otra cosa" }), "rubros");
});

test("cada capítulo y cada bloque llevan su subtotal de liquidación", () => {
  const l = liquidacion({ matriz, ejecutado: { 1: 80 }, modalidad: "rubros", costos });
  const renglones = renglonesDeLaMatriz(matriz);
  const subs = subtotalesDeLiquidacion(renglones, l);
  const titulos = renglones.map((r, i) => [r.tipo, r.nombre, subs[i]]).filter(x => x[0] !== "fila" && x[0] !== "pie");
  assert.deepEqual(titulos, [
    ["capitulo", "ACABADOS", 6000],            // 4.000 del piso + 2.000 de la pintura
    ["capitulo", "HONORARIOS", l.porFila["9"].cobra],
    ["bloque", "OC-01 · Cielo raso", 600],
  ]);
  // Y la suma de los subtotales es la liquidación.
  assert.equal(Math.round(titulos.reduce((t, x) => t + x[2], 0) * 100) / 100, l.totales.liquidacion);
});

test("desde los rubros y las órdenes de la obra sale la misma liquidación", () => {
  const l = liquidacionDeLaObra({ obra: { ...obra, modalidad: "llave_en_mano" }, rubros, ordenes, lineasDeOrdenes, ejecutado: { 1: 80 } });
  assert.equal(l.modalidad, "llave_en_mano");
  assert.deepEqual(l.deltas, { 1: -20 });
  assert.equal(l.diferencias[0].efecto, 800);
});

// ── Lo que le hace al beneficio de lo ya aprobado ──────────────────────────

test("sin cantidades ejecutadas, el beneficio de lo aprobado es el de siempre", () => {
  const antes = beneficioDeLoAprobado({ rubros });
  assert.deepEqual(antes.filas.map(f => [f.numero, f.cantidad, f.seCobra, f.cuesta, f.beneficio]), [["1", 100, 5000, 4000, 1000]]);
  assert.deepEqual(beneficioDeLoAprobado({ rubros, deltas: {}, modalidad: "llave_en_mano" }).total, antes.total);
});

test("por rubros, con lo ejecutado: precio menos costo por lo que se ejecutó", () => {
  const r = beneficioDeLoAprobado({ rubros, deltas: { 1: -20 }, modalidad: "rubros" });
  assert.deepEqual(r.filas.map(f => [f.cantidad, f.ejecutada, f.seCobra, f.cuesta, f.beneficio]), [[80, 80, 4000, 3200, 800]]);
  assert.equal(r.total, 800);
});

test("llave en mano, con lo ejecutado: se cobra lo aprobado y cuesta lo ejecutado", () => {
  const menos = beneficioDeLoAprobado({ rubros, deltas: { 1: -20 }, modalidad: "llave_en_mano" });
  assert.deepEqual(menos.filas.map(f => [f.cantidad, f.ejecutada, f.seCobra, f.cuesta, f.beneficio]), [[100, 80, 5000, 3200, 1800]]);
  const mas = beneficioDeLoAprobado({ rubros, deltas: { 1: 20 }, modalidad: "llave_en_mano" });
  assert.deepEqual(mas.filas.map(f => [f.cantidad, f.ejecutada, f.seCobra, f.cuesta, f.beneficio]), [[100, 120, 5000, 4800, 200]]);
});

test("el efecto que dice la liquidación es justo lo que se mueve el beneficio de lo aprobado", () => {
  for (const modalidad of ["rubros", "llave_en_mano"]) {
    for (const ejecutada of [80, 120]) {
      const l = liquidacion({ matriz, ejecutado: { 1: ejecutada }, modalidad, costos });
      const antes = beneficioDeLoAprobado({ rubros }).total;
      const despues = beneficioDeLoAprobado({ rubros, deltas: l.deltas, modalidad }).total;
      assert.equal(Math.round((despues - antes) * 100) / 100, l.totales.efecto, `${modalidad} con ${ejecutada}`);
    }
  }
});
