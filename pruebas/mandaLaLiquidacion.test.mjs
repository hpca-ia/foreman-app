// En Beneficios y pérdidas MANDA LA CANTIDAD DE LA LIQUIDACIÓN.
//
// Hernán, 24/11/2026, con el rubro 44 del Aeropuerto en rojo: «este rubro sale
// como pérdida, pero voy a instalar más de lo presupuestado, como está en el
// presupuesto de liquidación, que tiene órdenes de cambio y cantidades
// actualizadas... ¿esas cantidades deberían mandar?». Sí.
//
// El piso laminado: contratado por 6,25 m² a $49,50 —$309,38—, con 28 m²
// ejecutados cargados en la liquidación —se cobran $1.386,01— y $602,70
// gastados (la factura de Stylos, $693,11 con IVA). Medido contra los 6,25
// salía perdido en $293,32.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { seguimientoDeRubro, perdidasEnRubros, resultadoDeLaObra, beneficiosConControl, notaDeControl } from "../src/modules/controlObra/resultadoDeLaObra.js";
import { liquidacionDeLaObra } from "../src/modules/controlObra/liquidacion.js";

const leer = ruta => readFileSync(new URL(ruta, import.meta.url), "utf8");
const codigoDe = ruta => leer(ruta).split("\n").filter(l => !l.trim().startsWith("//")).join("\n");

// Como están en la base (obra 13), con el IVA adentro del total.
const PISO = { id: 1311, numero: 44, descripcion: "PISO PLMAINADO COLOR MAPLE", unidad: "m2", cantidad: 6.25, precio_unitario: 49.5, total_base: 355.79, iva_pct: 15, capitulo: "PISOS", capitulo_orden: 5, orden: 1, origen: "base" };
const GYPSUM = { id: 1296, numero: 29, descripcion: "TUMBADO GYPSUM HUMEDAD", unidad: "m2", cantidad: 7.85, precio_unitario: 27.01, total_base: 243.79, iva_pct: 15, capitulo: "TUMBADOS", capitulo_orden: 4, orden: 1, origen: "base" };
const DIRECCION = { id: 1423, numero: 156, descripcion: "DIRECCIÓN DE PROYECTO", unidad: "meses", cantidad: 2, precio_unitario: 2000, total_base: 4600, iva_pct: 15, capitulo: "HONORARIOS", capitulo_orden: 9, orden: 1, origen: "base" };
const RUBROS = [PISO, GYPSUM, DIRECCION];
// Lo gastado en facturas, con IVA: $693,11 del piso, $380,16 del gypsum, $450,47 de dirección.
const GASTADO = { 1311: { acumulado: 693.11 }, 1296: { acumulado: 380.16 }, 1423: { acumulado: 450.47 } };
const liquidar = (modalidad, ejecutado = { 1311: 28 }) => liquidacionDeLaObra({ obra: { id: 13, modalidad }, rubros: RUBROS, ordenes: [], lineasDeOrdenes: {}, ejecutado });

test("SU RUBRO: con 28 m² ejecutados en la liquidación se cobran $1.386,01, y deja de salir perdido", () => {
  const liq = liquidar("rubros");
  assert.equal(liq.porFila["1311"].cobra, 1386.01);
  // Contra lo contratado, como salía.
  const antes = seguimientoDeRubro(PISO, GASTADO);
  assert.deepEqual([antes.cobrado, antes.gastado, antes.resultado, antes.estado], [309.38, 602.7, -293.32, "pasado"]);
  // Contra lo que la liquidación cobra por lo ejecutado.
  const ahora = seguimientoDeRubro(PISO, GASTADO, liq.porFila["1311"]);
  assert.deepEqual([ahora.cobrado, ahora.gastado, ahora.resultado, ahora.estado], [1386.01, 602.7, 783.31, "en_curso"]);
  // Y lleva con qué decirlo: la cantidad ejecutada y lo que se cobraba por lo firmado.
  assert.deepEqual([ahora.porLiquidacion, ahora.ejecutada, ahora.cantidad, ahora.contratado], [true, 28, 6.25, 309.38]);
});

test("los pasados de la obra: sale el que la liquidación explica, y el que gastó de más sin ejecutar más se queda", () => {
  const liq = liquidar("rubros");
  assert.deepEqual(perdidasEnRubros(RUBROS, GASTADO).filas.map(f => [f.numero, f.resultado]), [["44", -293.32], ["29", -118.58]]);
  const conLaLiquidacion = perdidasEnRubros(RUBROS, GASTADO, liq.porFila);
  assert.deepEqual(conLaLiquidacion.filas.map(f => [f.numero, f.resultado]), [["29", -118.58]]);
  assert.equal(conLaLiquidacion.total, -118.58);
});

test("sin cantidad ejecutada cargada el rubro todavía no se midió: sigue contra lo contratado", () => {
  const liq = liquidar("rubros");
  assert.equal(liq.porFila["1296"].medida, false);
  const gypsum = seguimientoDeRubro(GYPSUM, GASTADO, liq.porFila["1296"]);
  assert.deepEqual([gypsum.cobrado, gypsum.porLiquidacion, gypsum.ejecutada, gypsum.estado], [211.99, false, null, "pasado"]);
  // Cargarle exactamente lo contratado no cambia nada.
  const igual = liquidar("rubros", { 1296: 7.85 });
  assert.equal(seguimientoDeRubro(GYPSUM, GASTADO, igual.porFila["1296"]).resultado, -118.58);
});

test("ejecutar MENOS también manda: se cobra menos, y lo ya gastado puede pasar a ser pérdida", () => {
  // Una pintura de 100 m² a $10: $1.000 contratados, $391,71 gastados. Va bien.
  const PINTURA = { id: 1500, numero: 70, descripcion: "PINTURA DE CAUCHO", unidad: "m2", cantidad: 100, precio_unitario: 10, total_base: 1150, iva_pct: 15, capitulo: "PINTURA", capitulo_orden: 6, orden: 1, origen: "base" };
  const gastado = { 1500: { acumulado: 450.47 } };
  const antes = seguimientoDeRubro(PINTURA, gastado);
  assert.deepEqual([antes.cobrado, antes.gastado, antes.estado], [1000, 391.71, "en_curso"]);
  // Si en la liquidación quedan 30 m², se cobran $300: lo gastado ya es más que eso.
  const liq = liquidacionDeLaObra({ obra: { id: 13, modalidad: "rubros" }, rubros: [PINTURA], ordenes: [], lineasDeOrdenes: {}, ejecutado: { 1500: 30 } });
  const ahora = seguimientoDeRubro(PINTURA, gastado, liq.porFila["1500"]);
  assert.deepEqual([ahora.cobrado, ahora.resultado, ahora.estado], [300, -91.71, "pasado"]);
  // Los honorarios no llevan cantidad ejecutada: se miden siempre contra lo contratado.
  const conHonorarios = liquidar("rubros", { 1423: 0.1 });
  assert.equal(seguimientoDeRubro(DIRECCION, GASTADO, conHonorarios.porFila["1423"]).cobrado, 4000);
});

test("con costo cargado, el costo presupuestado también es el de la cantidad ejecutada", () => {
  const conCosto = { ...PISO, costo_unitario: 20 };
  const liq = liquidacionDeLaObra({ obra: { id: 13, modalidad: "rubros" }, rubros: [conCosto], ordenes: [], lineasDeOrdenes: {}, ejecutado: { 1311: 28 } });
  // 6,25 m² a $20 eran $125 de costo: contra eso, $602,70 gastados era una pérdida de $477,70.
  assert.equal(seguimientoDeRubro(conCosto, GASTADO).resultado, -477.7);
  // Por 28 m² el costo presupuestado es $560.
  const f = seguimientoDeRubro(conCosto, GASTADO, liq.porFila["1311"]);
  assert.deepEqual([f.contra, f.costo, f.presupuestado, f.resultado], ["costo", 560, 560, -42.7]);
});

test("LLAVE EN MANO no cambia: se cobra lo contratado, se ejecute lo que se ejecute", () => {
  const liq = liquidar("llave_en_mano");
  const r = resultadoDeLaObra({ rubros: RUBROS, porRubro: GASTADO, medidos: liq.porFila, deltas: liq.deltas, modalidad: "llave_en_mano" });
  assert.deepEqual(r.perdidas.map(f => [f.numero, f.resultado]), [["44", -293.32], ["29", -118.58]]);
  assert.equal(r.perdidas[0].porLiquidacion, false);
  // Y por rubros, con lo mismo cargado, sí.
  const porRubros = liquidar("rubros");
  const s = resultadoDeLaObra({ rubros: RUBROS, porRubro: GASTADO, medidos: porRubros.porFila, deltas: porRubros.deltas, modalidad: "rubros" });
  assert.deepEqual(s.perdidas.map(f => f.numero), ["29"]);
  assert.equal(s.perdidasTotal, -118.58);
});

// ── LOS RUBROS EN SEGUIMIENTO SUMAN SIEMPRE ─────────────────────────────────
//
// Hernán, el mismo día: «y los rubros en seguimiento deberían sumar al total
// de beneficios... creo que no están sumando». No sumaban: contaban al
// terminar —avance al 100%— y ningún rubro de la obra tenía avance anotado.
// Eligió que sumen siempre: lo presupuestado menos lo gastado hasta hoy.
test("los seguidos suman lo presupuestado menos lo gastado, estén como estén; el que se pasó, solo en las pérdidas", () => {
  const liq = liquidar("rubros");
  const seguidos = [{ id: 1, obra_rubro_id: 1423 }, { id: 2, obra_rubro_id: 1311 }, { id: 3, obra_rubro_id: 1296 }];
  const r = resultadoDeLaObra({ rubros: RUBROS, porRubro: GASTADO, seguidos, medidos: liq.porFila, deltas: liq.deltas, modalidad: "rubros" });
  // Dirección: $4.000 − $391,71. El piso, ya contra la liquidación: $1.386,01 − $602,70.
  assert.deepEqual(r.seguimiento.map(f => [f.numero, f.estado, f.resultado, f.cuenta]),
    [["156", "en_curso", 3608.29, true], ["44", "en_curso", 783.31, true], ["29", "pasado", -118.58, true]]);
  assert.equal(r.ganadoEnSeguidos, 4391.6);
  assert.equal(r.perdidasTotal, -118.58);
  assert.equal(r.neto, 4273.02);
  // Sin seguir ninguno, esos mismos rubros abiertos no suman: lo único que cuenta es el pasado.
  assert.equal(resultadoDeLaObra({ rubros: RUBROS, porRubro: GASTADO, medidos: liq.porFila, modalidad: "rubros" }).neto, -118.58);
});

test("un rubro seguido sin nada gastado suma entero lo presupuestado, y el renglón en negativo de una orden no suma nunca", () => {
  const sinGasto = resultadoDeLaObra({ rubros: [DIRECCION], porRubro: {}, seguidos: [{ id: 1, obra_rubro_id: 1423 }] });
  assert.deepEqual([sinGasto.seguimiento[0].estado, sinGasto.ganadoEnSeguidos], ["sin_empezar", 4000]);
  const negativo = { id: 50, numero: 9201, descripcion: "(–) PISO DE MICROCEMENTO", cantidad: 10, total_base: -575, iva_pct: 15, origen: "orden_cambio" };
  const r = resultadoDeLaObra({ rubros: [negativo], porRubro: {}, seguidos: [{ id: 1, obra_rubro_id: 50 }] });
  assert.deepEqual([r.seguimiento[0].cuenta, r.ganadoEnSeguidos, r.neto], [false, 0, 0]);
});

test("el rubro que se sigue no se cuenta dos veces: lo cargado a mano contra ese rubro deja de sumar", () => {
  const aMano = { id: 9, origen: "manual", obra_rubro_id: 1423, presupuestado: 4000, real: 3000 };
  const seguidos = [{ id: 1, obra_rubro_id: 1423 }];
  // Sin seguirlo, cuenta lo cargado a mano: $1.000.
  assert.equal(resultadoDeLaObra({ beneficios: [aMano], rubros: [DIRECCION], porRubro: GASTADO }).neto, 1000);
  // Siguiéndolo, cuenta el seguimiento —$4.000 menos lo gastado— y lo de mano no se suma encima.
  const r = resultadoDeLaObra({ beneficios: [aMano], rubros: [DIRECCION], porRubro: GASTADO, seguidos });
  assert.deepEqual([r.conPapel, r.ganadoEnSeguidos, r.neto], [0, 3608.29, 3608.29]);
  const [fila] = beneficiosConControl([aMano], { rubros: [DIRECCION], porRubro: GASTADO, seguidos }).beneficios;
  assert.equal(fila._control.manda, "todo");
  assert.equal(notaDeControl(fila, v => `$${v.toFixed(2)}`),
    "Manda Control de obra · 156 está en seguimiento: lleva gastados $391.71 de $4000.00, +$3608.29 por ahora · lo cargado a mano era +$1000.00 y ya no suma");
});

test("la pantalla: Beneficios y la tarjeta de la obra miden con la liquidación y suman los seguidos", () => {
  const panel = codigoDe("../src/modules/controlObra/PanelBeneficios.jsx");
  assert.match(panel, /const liq = useMemo\(\(\) => \(Object\.keys\(ejecutado\)\.length\s+\? liquidacionDeLaObra\(/);
  // Desde el 26/11 pasa por el puente que también mide los rubros de las órdenes (medidosDelControl.js).
  assert.match(panel, /deltas, medidos, modalidad: comoSeCobra \}\);/);
  // Se dice contra qué cantidad se midió, y por qué el número ya no es el del contrato.
  assert.match(panel, /\{f\.porLiquidacion && \(\s+<span className="por-lo-ejecutado"/);
  assert.match(panel, /por \{fmt\(f\.ejecutada\)\} \{f\.unidad\} ejecutados en la liquidación/);
  assert.match(panel, /: "contratado"\}: \{fmt\(f\.cantidad\)\} \{f\.unidad\}, \$\{fmt\(f\.contratado\)\}\)/);
  // Ya no dice que espera a terminar.
  assert.doesNotMatch(panel, /no cuenta hasta terminar/);
  assert.doesNotMatch(panel, /RUBROS SEGUIDOS, TERMINADOS/);
  assert.match(panel, /rubros en seguimiento, lo presupuestado menos lo gastado hasta hoy <strong>\+\$\{fmt\(res\.ganadoEnSeguidos\)\}<\/strong>/);
  const obra = codigoDe("../src/modules/controlObra/VistaObra.jsx");
  assert.match(obra, /supabase\.from\("obra_beneficios_seguimiento"\)\s+\.select\("id,obra_rubro_id"\)\.eq\("obra_id", obra\.id\);/);
  assert.match(obra, /resultadoDeLaObra\(\{ beneficios: beneficiosVivos, rubros, porRubro, seguidos,/);
  assert.match(obra, /deltas: liqDeLoEjecutado\?\.deltas \|\| \{\}, medidos: medidosDeLoEjecutado, modalidad \}\);/);
  assert.match(obra, /onSeguidos=\{setSeguidos\}/);
});
