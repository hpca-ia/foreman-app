// Los rubros de las ÓRDENES DE CAMBIO también toman la cantidad de la liquidación.
//
// Hernán, 24/11/2026: «esas cantidades del presupuesto de liquidación deberían
// mandar». Quedó hecho para los rubros del contrato. El 26/11 preguntó por los
// de las órdenes —«explicame cómo es eso que los rubros de ODC también tomen
// la liquidación»— y eligió que sí.
//
// El control y la liquidación no tienen los mismos renglones. La OC-01 del
// Aeropuerto, como está en la base:
//
//   · el picado (ADIC-02) es trabajo nuevo: un renglón en el bloque de la
//     orden, en la liquidación, y el rubro 9101 en el control;
//   · el desalojo (ADIC-04) le suma 2 u al rubro 6 del contrato: en la
//     liquidación va sumado al renglón del rubro 6 —32 u—, y en el control son
//     dos rubros, el 6 con sus 30 u y el 9103 con las 2 de la orden.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { medidosPorRubro, partidaDeCadaRubro } from "../src/modules/controlObra/medidosDelControl.js";
import { liquidacionDeLaObra } from "../src/modules/controlObra/liquidacion.js";
import { seguimientoDeRubro, perdidasEnRubros, resultadoDeLaObra } from "../src/modules/controlObra/resultadoDeLaObra.js";

const leer = ruta => readFileSync(new URL(ruta, import.meta.url), "utf8");
const codigoDe = ruta => leer(ruta).split("\n").filter(l => !l.trim().startsWith("//")).join("\n");

const OBRA = { id: 13, modalidad: "rubros", honorarios_pct: 10 };
const delContrato = (id, numero, descripcion, unidad, cantidad, precio) => ({ id, numero, descripcion, unidad, cantidad, precio_unitario: precio,
  total_base: Math.round(cantidad * precio * 1.15 * 100) / 100, iva_pct: 15, capitulo: "PRELIMINARES Y VARIOS", capitulo_orden: 1, orden: numero, origen: "base" });
const DESALOJO = delContrato(1273, 6, "DESALOJO Y ESTIBAJE DE MATERIALES", "u", 30, 125);
const MICROCEMENTO = delContrato(1308, 41, "PISO DE MICROCEMENTO PULIDO COLOR BLANCO", "m2", 95.61, 78.75);
const OC01 = { id: 5, codigo: "OC-01", numero: 1, estado: "aprobada", anulada: false, reemplazada_at: null, obra_id: 13 };
const LINEAS = { 5: [
  { id: 3, orden_id: 5, tipo: "quita", item: "RED-01", obra_rubro_id: 1308, cantidad: 95.61, precio_unitario: 78.75, unidad: "m2", descripcion: "PISO DE MICROCEMENTO PULIDO COLOR BLANCO" },
  { id: 4, orden_id: 5, tipo: "aumenta", item: "ADIC-01", cantidad: 95.61, precio_unitario: 98.5, unidad: "m2", descripcion: "FUNDICIÓN DE LOSA EN CEMENTO BLANCO PULIDO" },
  { id: 5, orden_id: 5, tipo: "aumenta", item: "ADIC-02", cantidad: 95.61, precio_unitario: 4.65, unidad: "m2", descripcion: "PICADO DE MASILLADO Y LOSA 7 CM" },
  { id: 7, orden_id: 5, tipo: "aumenta", item: "ADIC-04", rubro_codigo: "6", capitulo: "PRELIMINARES Y VARIOS", cantidad: 2, precio_unitario: 125, unidad: "u", descripcion: "DESALOJO Y ESTIBAJE DE MATERIALES" },
] };
const deLaOrden = (id, numero, descripcion, unidad, cantidad, precioConIva, total, mas = {}) => ({ id, numero, descripcion, unidad, cantidad,
  precio_unitario: precioConIva, total_base: total, iva_pct: 15, capitulo: "ADICIONALES · OC-01", capitulo_orden: 9001, origen: "orden_cambio", orden_cambio_id: 5, ...mas });
const FUNDICION = deLaOrden(1433, 9100, "FUNDICIÓN DE LOSA EN CEMENTO BLANCO PULIDO  ·  OC-01", "m2", 95.61, 113.275, 10830.22);
const PICADO = deLaOrden(1434, 9101, "PICADO DE MASILLADO Y LOSA 7 CM  ·  OC-01", "m2", 95.61, 5.3475, 511.27);
const DESALOJO_OC = deLaOrden(1436, 9103, "DESALOJO Y ESTIBAJE DE MATERIALES  ·  OC-01  ·  ya existía: rubro 6 · PRELIMINARES Y VARIOS", "u", 2, 143.75, 287.5);
const MENOS = deLaOrden(1440, 9190, "(–) PISO DE MICROCEMENTO PULIDO COLOR BLANCO  ·  OC-01", "m2", 95.61, -90.5625, -8658.68);
const HONORARIOS = deLaOrden(1443, 9199, "Honorarios 10% sobre OC-01", "glb", 1, 385, 385, { capitulo: "HONORARIOS" });
const RUBROS = [DESALOJO, MICROCEMENTO, FUNDICION, PICADO, DESALOJO_OC, MENOS, HONORARIOS];
// Lo gastado en facturas, con IVA: $697,79 del picado son $606,77 sin IVA.
const GASTADO = { 1434: { acumulado: 697.79 } };
const con = (ejecutado, ordenes = [OC01]) => {
  const liq = liquidacionDeLaObra({ obra: OBRA, rubros: RUBROS, ordenes, lineasDeOrdenes: LINEAS, ejecutado });
  return { liq, medidos: medidosPorRubro({ liq, rubros: RUBROS, ordenes, lineasDeOrdenes: LINEAS }) };
};

test("cada rubro que entró por una orden encuentra su partida; el «(–)» y el honorario no tienen qué medir", () => {
  const pares = partidaDeCadaRubro({ rubros: RUBROS, ordenes: [OC01], lineasDeOrdenes: LINEAS });
  assert.deepEqual([...pares].map(([id, p]) => [id, p.linea.item]), [[1433, "ADIC-01"], [1434, "ADIC-02"], [1436, "ADIC-04"]]);
});

test("SU EJEMPLO: con 130 m² ejecutados en el renglón del picado, el 9101 se mide contra $604,50 y casi no pierde", () => {
  // Sin cargar nada, contra lo aprobado en la orden: $444,58 y $606,77 gastados.
  const sin = con({});
  assert.deepEqual(sin.medidos, {});
  assert.equal(seguimientoDeRubro(PICADO, GASTADO, sin.medidos["1434"]).resultado, -162.19);
  // Con lo ejecutado cargado en la liquidación, en el bloque de la OC-01.
  const { liq, medidos } = con({ "o5-5": 130 });
  assert.equal(liq.porFila["o5-5"].cobra, 604.5);
  assert.deepEqual(medidos, { 1434: { medida: true, ejecutada: 130, cobra: 604.5, enOrdenes: 0 } });
  const f = seguimientoDeRubro(PICADO, GASTADO, medidos["1434"]);
  assert.deepEqual([f.cobrado, f.gastado, f.resultado, f.estado], [604.5, 606.77, -2.27, "pasado"]);
  // Lo suyo no es «lo contratado»: es lo aprobado en la orden.
  assert.deepEqual([f.deOrden, f.porLiquidacion, f.ejecutada, f.cantidad, f.contratado], [true, true, 130, 95.61, 444.58]);
  // Y en el resultado de la obra: la pérdida baja con él.
  const antes = perdidasEnRubros(RUBROS, GASTADO, sin.medidos).total;
  const ahora = perdidasEnRubros(RUBROS, GASTADO, medidos).total;
  assert.deepEqual([antes, ahora], [-162.19, -2.27]);
});

test("lo que una orden le SUMA a un rubro del contrato no se cuenta dos veces", () => {
  // La liquidación junta el rubro 6 con las 2 u de la OC-01: 32 u, $4.000.
  const { liq, medidos } = con({ 1273: 35 });
  assert.deepEqual(liq.porFila["1273"].vigente, { cantidad: 32, total: 4000 });
  assert.deepEqual(liq.porFila["1273"].sumado, { cantidad: 2, total: 250 });
  assert.equal(liq.porFila["1273"].cobra, 4375);                 // 35 u a $125
  // En el control son dos rubros. Al del contrato le toca lo ejecutado menos lo de la orden…
  assert.deepEqual(medidos["1273"], { medida: true, ejecutada: 33, cobra: 4125, enOrdenes: 2 });
  // …y el de la orden se sigue midiendo contra lo que la orden aprobó: $250.
  assert.equal(medidos["1436"], undefined);
  const delContratoMedido = seguimientoDeRubro(DESALOJO, {}, medidos["1273"]);
  const deLaOrdenMedido = seguimientoDeRubro(DESALOJO_OC, {}, medidos["1436"]);
  assert.deepEqual([delContratoMedido.cobrado, deLaOrdenMedido.cobrado], [4125, 250]);
  // Entre los dos, exactamente lo que la liquidación cobra por ese renglón.
  assert.equal(delContratoMedido.cobrado + deLaOrdenMedido.cobrado, liq.porFila["1273"].cobra);
  assert.equal(delContratoMedido.enOrdenes, 2);
});

test("si se ejecutó menos que lo que la orden sumó, al rubro del contrato no le queda un presupuesto en negativo", () => {
  const { medidos } = con({ 1273: 1 });
  assert.deepEqual(medidos["1273"], { medida: true, ejecutada: 0, cobra: 0, enOrdenes: 2 });
});

test("dos partidas iguales en una orden van a dos rubros distintos, cada una con su renglón", () => {
  const OC06 = { id: 16, codigo: "OC-06", numero: 6, estado: "aprobada", anulada: false, reemplazada_at: null, obra_id: 13 };
  const lineas = { 16: [
    { id: 142, orden_id: 16, tipo: "aumenta", clase: "nuevo", item: "ADIC-07", cantidad: 18, precio_unitario: 10.25, unidad: "U", descripcion: "Soportes para tubería" },
    { id: 153, orden_id: 16, tipo: "aumenta", clase: "nuevo", item: "ADIC-18", cantidad: 18, precio_unitario: 10.25, unidad: "u", descripcion: "Soportes para tubería" },
  ] };
  const soporte = (id, numero) => ({ id, numero, descripcion: "Soportes para tubería  ·  OC-06", unidad: "U", cantidad: 18, precio_unitario: 11.79,
    total_base: 212.18, iva_pct: 15, capitulo: "ADICIONALES · OC-06", capitulo_orden: 9006, origen: "orden_cambio", orden_cambio_id: 16 });
  const rubros = [soporte(1458, 9607), soporte(1467, 9616)];
  const pares = partidaDeCadaRubro({ rubros, ordenes: [OC06], lineasDeOrdenes: lineas });
  assert.deepEqual([...pares].map(([id, p]) => [id, p.linea.id]), [[1458, 142], [1467, 153]]);
  // Lo ejecutado del segundo no se le cuela al primero.
  const liq = liquidacionDeLaObra({ obra: OBRA, rubros, ordenes: [OC06], lineasDeOrdenes: lineas, ejecutado: { "o16-153": 20 } });
  const medidos = medidosPorRubro({ liq, rubros, ordenes: [OC06], lineasDeOrdenes: lineas });
  assert.deepEqual(Object.keys(medidos), ["1467"]);
  assert.deepEqual([medidos["1467"].ejecutada, medidos["1467"].cobra], [20, 205]);
});

test("una orden que no cuenta —sin aprobar, anulada o reemplazada— no mide sus rubros", () => {
  for (const mas of [{ estado: "enviada" }, { anulada: true }, { reemplazada_at: "2026-11-20T10:00:00Z" }]) {
    const orden = { ...OC01, ...mas };
    const liq = liquidacionDeLaObra({ obra: OBRA, rubros: RUBROS, ordenes: [orden], lineasDeOrdenes: LINEAS, ejecutado: { "o5-5": 130 } });
    assert.equal(medidosPorRubro({ liq, rubros: RUBROS, ordenes: [orden], lineasDeOrdenes: LINEAS })["1434"], undefined, JSON.stringify(mas));
  }
});

test("llave en mano no cambia: tampoco para los rubros de las órdenes", () => {
  const { liq, medidos } = con({ "o5-5": 130 });
  const r = resultadoDeLaObra({ rubros: RUBROS, porRubro: GASTADO, ordenes: [OC01], lineasDeOrdenes: LINEAS, medidos, deltas: liq.deltas, modalidad: "llave_en_mano" });
  assert.deepEqual(r.perdidas.map(f => [f.numero, f.resultado]), [["9101", -162.19]]);
  const porRubros = resultadoDeLaObra({ rubros: RUBROS, porRubro: GASTADO, ordenes: [OC01], lineasDeOrdenes: LINEAS, medidos, deltas: liq.deltas, modalidad: "rubros" });
  assert.deepEqual(porRubros.perdidas.map(f => [f.numero, f.resultado]), [["9101", -2.27]]);
});

test("la pantalla: Beneficios y la tarjeta de la obra pasan por el puente, y la fila dice de dónde sale la cantidad", () => {
  const panel = codigoDe("../src/modules/controlObra/PanelBeneficios.jsx");
  assert.match(panel, /const medidos = useMemo\(\(\) => \(liq \? medidosPorRubro\(\{ liq, rubros, ordenes, lineasDeOrdenes \}\) : \{\}\),/);
  assert.match(panel, /deltas, medidos, modalidad: comoSeCobra \}\);/);
  assert.doesNotMatch(panel, /medidos: liq\?\.porFila/);
  assert.match(panel, /\(\{f\.deOrden \? "aprobado en la orden" : "contratado"\}: \{fmt\(f\.cantidad\)\} \{f\.unidad\}, \$\{fmt\(f\.contratado\)\}\)/);
  assert.match(panel, /f\.enOrdenes > 0 \? `, sin los \$\{fmt\(f\.enOrdenes\)\} que le sumaron sus órdenes y se miden en el rubro de cada una` : ""/);
  const obra = codigoDe("../src/modules/controlObra/VistaObra.jsx");
  assert.match(obra, /medidosPorRubro\(\{ liq: liqDeLoEjecutado, rubros, ordenes: ordenesEnteras\.ordenes, lineasDeOrdenes: ordenesEnteras\.lineas \}\)/);
  assert.match(obra, /medidos: medidosDeLoEjecutado, modalidad \}\);/);
  // El presupuesto actualizado anota aparte lo que las órdenes aprobadas le sumaron a un rubro.
  const matriz = codigoDe("../src/modules/controlObra/presupuestoActualizado.js");
  assert.match(matriz, /if \(columna === "aprobado" && cantidad > 0\) \{/);
});
