import test from "node:test";
import assert from "node:assert/strict";
import { contratoDe, baseSinIva, enLaBaseDelControl } from "../src/modules/controlObra/contratoDeLaObra.js";

// Los rubros reales de Diners Aéreo: el presupuesto firmado entero, y la OC-01
// con sus adiciones y su reducción, todas como renglones suyos.
const aereo = [
  { id: 1, origen: "base", iva_pct: 15, total_base: 163468.56 },
  { id: 2, origen: "base", iva_pct: 15, total_base: 8658.68 },
  // Ya con IVA, como entran al control desde la 140: la orden dice $10.877,06
  // sin IVA y al control entra por $12.508,62.
  { id: 3, origen: "orden_cambio", orden_cambio_id: 5, iva_pct: 15, total_base: 10830.23 },
  { id: 4, origen: "orden_cambio", orden_cambio_id: 5, iva_pct: 15, total_base: 511.28 },
  { id: 5, origen: "orden_cambio", orden_cambio_id: 5, iva_pct: 15, total_base: 879.61 },
  { id: 6, origen: "orden_cambio", orden_cambio_id: 5, iva_pct: 15, total_base: 287.5 },
  // La reducción: el presupuesto original no se toca, la orden resta lo suyo.
  { id: 7, origen: "orden_cambio", orden_cambio_id: 5, iva_pct: 15, total_base: -8658.68 },
];

test("el contrato original es el del control, con IVA, como se firmó", () => {
  const c = contratoDe(aereo);
  assert.equal(c.original, 172127.24);        // 163.468,56 + 8.658,68
  assert.equal(c.sinIva, 153525.8);           // y sin IVA, para la conversación
});

test("la reducción es una línea de la orden, no un tachón en el presupuesto", () => {
  const c = contratoDe(aereo);
  assert.equal(c.reducciones, 8658.68);
  assert.equal(c.cuantasReducciones, 1);
  // Y el presupuesto firmado queda entero: nadie le saca un rubro.
  assert.equal(c.original, 172127.24);
});

test("las adiciones de la orden entran al control CON IVA", () => {
  // La orden se cotiza sin IVA —$10.877,06— y el control maneja IVA: para
  // sumarlas al contrato hay que llevarlas a esa base.
  const c = contratoDe(aereo);
  assert.equal(c.adiciones, 12508.62);        // 10.877,06 × 1,15, ya guardado así
  assert.equal(c.cuantasOrdenes, 1);
});

test("el vigente es lo firmado menos lo que se sacó más lo que se agregó", () => {
  const c = contratoDe(aereo);
  assert.equal(c.neto, 3849.94);              // 12.508,62 − 8.658,68
  assert.equal(c.vigente, 175977.18);
  assert.equal(c.comoEstaGuardado, c.vigente);
});

test("las reducciones se restan del vigente: ese era el error", () => {
  // Sin la línea negativa, la orden sumaría sus 12.508,62 y no restaría nada.
  const sinLaResta = aereo.filter(r => Number(r.total_base) > 0);
  const dif = contratoDe(sinLaResta).vigente - contratoDe(aereo).vigente;
  assert.ok(Math.abs(dif - 8658.68) < 0.01, `${dif} ≠ 8658.68`);
});

test("una obra sin IVA cargado se lee tal cual", () => {
  const c = contratoDe([{ origen: "base", iva_pct: 0, total_base: 1000 }]);
  assert.equal(c.original, 1000);
  assert.equal(c.vigente, 1000);
});

test("una quita entra en negativo: suma a las reducciones, no a las adiciones", () => {
  const c = contratoDe([
    { origen: "base", iva_pct: 0, total_base: 1000 },
    { origen: "orden_cambio", orden_cambio_id: 9, total_base: -200 },
  ]);
  assert.equal(c.adiciones, 0);
  assert.equal(c.reducciones, 200);
  assert.equal(c.vigente, 800);
});

test("cada rubro se puede leer en las dos bases", () => {
  assert.equal(baseSinIva({ origen: "base", iva_pct: 15, total_base: 115 }), 100);
  assert.equal(enLaBaseDelControl({ origen: "base", iva_pct: 15, total_base: 115 }), 115);
  // El de una orden está guardado sin IVA: en el control vale con IVA.
  assert.equal(baseSinIva({ origen: "orden_cambio", iva_pct: 15, total_base: 115 }), 115);
  assert.equal(enLaBaseDelControl({ origen: "orden_cambio", iva_pct: 15, total_base: 115 }), 115);
});
