// Un beneficio de compra se cuenta sobre lo que queda por hacer, cuando una
// orden aprobada le quitó cantidad al rubro. Con el gypsum real del Aeropuerto.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beneficiosSobreLoQueQueda, quitadoPorRubro, notaDelAjuste } from "../src/modules/controlObra/beneficiosConOrdenes.js";
import { netoPorRubro, totales } from "../src/modules/controlObra/cuentaBeneficios.js";

const RUBROS = [
  { id: 1295, numero: 28, descripcion: "TUMBADO GYPSUM PLANO REGULAR", unidad: "m2", cantidad: 125.3 },
  { id: 1308, numero: 41, descripcion: "PISO DE MICROCEMENTO PULIDO COLOR BLANCO", unidad: "m2", cantidad: 95.61 },
  { id: 1319, numero: 52, descripcion: "MICROCEMENTO EN PAREDES", unidad: "m2", cantidad: 45 },
];
const ORDENES = [
  { id: 5, codigo: "OC-01", estado: "aprobada", anulada: false, reemplazada_at: null },
  { id: 9, codigo: "OC-03", estado: "aprobada", anulada: false, reemplazada_at: null },
];
const LINEAS = {
  5: [{ orden_id: 5, tipo: "quita", obra_rubro_id: 1308, cantidad: 95.61 }, { orden_id: 5, tipo: "agrega", obra_rubro_id: null, cantidad: 95.61 }],
  9: [{ orden_id: 9, tipo: "quita", obra_rubro_id: 1295, cantidad: 39 }],
};
// El que él vio: confirmado el 11/11, Kevin Ormaza a $18 contra $22,41.
const GYPSUM = { id: 2966, obra_rubro_id: 1295, descripcion: "TUMBADO GYPSUM PLANO REGULAR", cantidad: 125.3, unidad: "m2", presupuestado: 2807.97, real: 2255.4, origen: "proforma", estado: "confirmado", orden_cambio_id: null };
const ctx = { rubros: RUBROS, ordenes: ORDENES, lineasDeOrdenes: LINEAS };

test("LO QUE PIDIÓ: los $552,57 del gypsum se cuentan sobre los 86,3 m² que quedan: $380,58", () => {
  const [b] = beneficiosSobreLoQueQueda([GYPSUM], ctx);
  assert.equal(b.cantidad, 86.3);
  assert.equal(Math.round((b.presupuestado - b.real) * 100) / 100, 380.58);
  assert.deepEqual(netoPorRubro([b]), { 1295: 380.58 });
  assert.equal(notaDelAjuste(b), "OC-03 eliminó 39 m2: el beneficio va sobre 86,3 m2 · cargado sobre 125,3 m2: +$552,57");
  // El registro guardado no se toca.
  assert.equal(GYPSUM.cantidad, 125.3);
  assert.equal(GYPSUM.presupuestado, 2807.97);
});

test("los totales de la obra bajan lo mismo", () => {
  const otro = { id: 1, obra_rubro_id: 1319, cantidad: 45, presupuestado: 1000, real: 900, origen: "proforma", estado: "confirmado" };
  const antes = totales([GYPSUM, otro]).neto;
  const despues = totales(beneficiosSobreLoQueQueda([GYPSUM, otro], ctx)).neto;
  assert.equal(Math.round((antes - despues) * 100) / 100, 171.99);
});

test("si el beneficio cabe en lo que queda, no cambia", () => {
  const chico = { ...GYPSUM, cantidad: 80, presupuestado: 1792.8, real: 1440 };
  assert.equal(beneficiosSobreLoQueQueda([chico], ctx)[0], chico);
});

test("varios beneficios sobre el mismo rubro que juntos se pasan se ajustan juntos, en proporción", () => {
  const a = { ...GYPSUM, id: 1, cantidad: 60, presupuestado: 1344.6, real: 1080 };
  const b = { ...GYPSUM, id: 2, cantidad: 60, presupuestado: 1344.6, real: 1080 };
  const [x, y] = beneficiosSobreLoQueQueda([a, b], ctx);
  assert.equal(Math.round((x.cantidad + y.cantidad) * 10000) / 10000, 86.3);
  assert.equal(x.cantidad, y.cantidad);
});

test("si la orden eliminó el rubro entero, el beneficio queda en cero", () => {
  const micro = { id: 3, obra_rubro_id: 1308, cantidad: 95.61, presupuestado: 7529.29, real: 7000, origen: "proforma", estado: "confirmado" };
  const [b] = beneficiosSobreLoQueQueda([micro], ctx);
  assert.deepEqual([b.cantidad, b.presupuestado, b.real], [0, 0, 0]);
  assert.match(notaDelAjuste(b), /^OC-01 eliminó 95,61 m2: el beneficio va sobre 0 m2/);
});

test("una orden que no cuenta —sin aprobar, anulada o reemplazada— no ajusta nada", () => {
  for (const cambio of [{ estado: "enviada" }, { anulada: true }, { reemplazada_at: "2026-11-14" }]) {
    const ordenes = ORDENES.map(o => (o.id === 9 ? { ...o, ...cambio } : o));
    assert.equal(beneficiosSobreLoQueQueda([GYPSUM], { ...ctx, ordenes })[0], GYPSUM);
  }
});

test("lo que sale de una orden de cambio no se toca: es lo cobrado, no lo comprado", () => {
  const deOrden = { ...GYPSUM, id: 9, origen: "orden_cambio", orden_cambio_id: 9 };
  assert.equal(beneficiosSobreLoQueQueda([deOrden], ctx)[0], deOrden);
});

test("un previsto también se cuenta sobre lo que queda", () => {
  const previsto = { ...GYPSUM, estado: "previsto" };
  assert.equal(beneficiosSobreLoQueQueda([previsto], ctx)[0].cantidad, 86.3);
});

test("sin órdenes que quiten, salen tal cual", () => {
  const lista = [GYPSUM];
  assert.equal(beneficiosSobreLoQueQueda(lista, { rubros: RUBROS, ordenes: [], lineasDeOrdenes: {} }), lista);
  assert.deepEqual(quitadoPorRubro(ORDENES, LINEAS), { 1295: { cantidad: 39, codigos: ["OC-03"] }, 1308: { cantidad: 95.61, codigos: ["OC-01"] } });
});

test("el control, la tarjeta del resultado y Beneficios usan lo ajustado; corregir usa lo cargado", () => {
  const vista = readFileSync(new URL("../src/modules/controlObra/VistaObra.jsx", import.meta.url), "utf8");
  assert.match(vista, /resultadoDeLaObra\(\{ beneficios: beneficiosVivos,/);
  assert.match(vista, /beneficios=\{beneficiosVivos\}/);
  const panel = readFileSync(new URL("../src/modules/controlObra/PanelBeneficios.jsx", import.meta.url), "utf8");
  assert.match(panel, /totalesPorOrigen\(contados\)/);
  assert.match(panel, /resultadoDeLaObra\(\{ beneficios: contados,/);
  assert.match(panel, /editarBeneficio\(guardados\.find\(x => x\.id === b\.id\) \|\| b\)/);
});
