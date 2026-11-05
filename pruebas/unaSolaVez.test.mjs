import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sinRepetidas, precioSobreLoContratado, decisionesPara, comoVa,
} from "../src/modules/controlObra/cuentaDiferencias.js";

// ── EL MISMO RENGLÓN, UNA SOLA VEZ ─────────────────────────────────────────
//
// El caso real: el contrato tiene 2 interruptores a $7,26 y la proforma trae 8
// a $6,60. Salían dos tarjetas —"6 de más" y "bajó de precio sobre los 2"— y
// eso se leía como dos situaciones, se decidía dos veces y duplicaba la orden.

const cantidad = { id: 592, hallazgo: "mas_cantidad", decision: "cobrar", obra_rubro_id: 1363,
  cantidad: 6, unidad: "U", monto: 39.61, cantidad_papel: "8", unidad_papel: "U", monto_papel: "52.81" };
const precio = { id: 606, hallazgo: "bajo_precio", decision: "pendiente", obra_rubro_id: 1363,
  cantidad: 2, unidad: "U", monto: 1.32, cantidad_papel: "8", unidad_papel: "U", monto_papel: "52.81" };
const rubro = { id: 1363, numero: 96, cantidad: 2, unidad: "U", total_base: 16.7, iva_pct: 15, costo_unitario: null };

test("lo guardado repetido se saca: queda la de cantidad, con su decisión intacta", () => {
  const r = sinRepetidas([cantidad, precio]);
  assert.equal(r.repetidas, 1);
  assert.deepEqual(r.lineas, [cantidad]);
  assert.equal(r.lineas[0].decision, "cobrar", "lo ya decidido no se toca");
});

test("una diferencia de precio de verdad —misma cantidad— se queda", () => {
  const sola = { id: 610, hallazgo: "bajo_precio", obra_rubro_id: 1370, cantidad: 10, monto: 12,
    cantidad_papel: 10, monto_papel: 200 };
  // Otro rubro con la misma cantidad y el mismo total no la tapa.
  const otra = { id: 611, hallazgo: "mas_cantidad", obra_rubro_id: 1371, cantidad: 4, monto: 80,
    cantidad_papel: 10, monto_papel: 200 };
  const r = sinRepetidas([sola, otra, cantidad]);
  assert.equal(r.repetidas, 0);
  assert.equal(r.lineas.length, 3);
});

test("también con menos cantidad, y nunca la que ya salió en una orden", () => {
  const menos = { id: 629, hallazgo: "menos_cantidad", obra_rubro_id: 1364, cantidad: 2, monto: 17.8,
    cantidad_papel: 2, monto_papel: 17.8 };
  const suPrecio = { id: 607, hallazgo: "bajo_precio", obra_rubro_id: 1364, cantidad: 2, monto: 1.78,
    cantidad_papel: 2, monto_papel: 17.8 };
  assert.equal(sinRepetidas([menos, suPrecio]).repetidas, 1);
  assert.equal(sinRepetidas([menos, { ...suPrecio, hallazgo: "subio_precio", orden_cambio_id: 7 }]).repetidas, 0);
  // Los análisis viejos, sin lo que decía el papel, no se tocan: no hay cómo saber.
  const viejo = { id: 1, hallazgo: "bajo_precio", obra_rubro_id: 1364, cantidad: 2, monto: 1.78 };
  assert.equal(sinRepetidas([{ ...menos, cantidad_papel: null, monto_papel: null }, viejo]).repetidas, 0);
});

test("sacadas las repetidas, el análisis cuenta lo que hay que decidir de verdad", () => {
  const v = comoVa(sinRepetidas([cantidad, precio]).lineas);
  assert.equal(v.total, 1);
  assert.equal(v.sinDecidir, 0);
  assert.equal(v.listo, true);
});

test("el precio del renglón se dice en la tarjeta de la cantidad: bajó, es eficiencia", () => {
  // Sin costo cargado la vara es el precio del cliente sin IVA: 16,70 / 1,15 / 2 = 7,26.
  const p = precioSobreLoContratado(cantidad, rubro, 16.7 / 1.15 / 2);
  assert.equal(p.comun, 2, "sobre las 2 que ya estaban contratadas, no sobre las 8");
  assert.equal(p.puPapel, 6.6);
  assert.equal(p.vara, 7.26);
  assert.equal(p.monto, 1.32, "lo mismo que antes decía la tarjeta repetida");
  assert.equal(p.sube, false);
  assert.equal(p.contraPrecio, true);
});

test("con menos cantidad, la cantidad común es la del papel", () => {
  const menos = { hallazgo: "menos_cantidad", cantidad_papel: 2, monto_papel: 17.8, unidad: "U" };
  const p = precioSobreLoContratado(menos, { cantidad: 4, unidad: "U" }, 9.79);
  assert.equal(p.comun, 2);
  assert.equal(p.monto, 1.78);
});

test("con costo cargado manda el costo, y si subió es una alerta", () => {
  const p = precioSobreLoContratado(
    { hallazgo: "mas_cantidad", cantidad_papel: 16, monto_papel: 816 },
    { cantidad: 12, unidad: "U", costo_unitario: 48.5 }, 68);
  assert.equal(p.vara, 48.5);
  assert.equal(p.sube, true);
  assert.equal(p.monto, 30);
  assert.equal(p.contraPrecio, false);
});

test("mismo precio, o un renglón que no es de cantidad: no hay nada que decir", () => {
  assert.equal(precioSobreLoContratado(
    { hallazgo: "mas_cantidad", cantidad_papel: 16, monto_papel: 776 },
    { cantidad: 12, costo_unitario: 48.5 }, 68), null);
  assert.equal(precioSobreLoContratado(precio, rubro, 7.26), null, "la de precio ya es de precio");
  assert.equal(precioSobreLoContratado({ hallazgo: "nuevo", cantidad_papel: 1, monto_papel: 10 }, rubro, 7.26), null);
  assert.equal(precioSobreLoContratado(cantidad, null, 7.26), null);
});

// ── LAS CONDICIONES, COMO LAS DIJO EL DIRECTOR ─────────────────────────────
//
//   · no está el ítem              → va a la orden de cambio
//   · cambia la cantidad           → se ajusta en la orden
//   · el proveedor baja el precio  → beneficio del proyecto
//   · el proveedor sube el precio  → alerta para conversar con él
//   · lo que no se aprueba         → se anota, para conversarlo con él

test("a la orden de cambio va lo nuevo y lo que cambió de cantidad, y nada más", () => {
  const vaALaOrden = h => decisionesPara(h).includes("cobrar");
  assert.equal(vaALaOrden("nuevo"), true);
  assert.equal(vaALaOrden("mas_cantidad"), true);
  assert.equal(vaALaOrden("menos_cantidad"), true);
  assert.equal(vaALaOrden("bajo_precio"), false, "una baja de precio es beneficio, no un adicional");
  assert.equal(vaALaOrden("subio_precio"), false, "una subida es una alerta para el proveedor");
});

test("la baja de precio es beneficio; la subida y lo no aprobado se anotan para el proveedor", () => {
  assert.ok(decisionesPara("bajo_precio").includes("eficiencia"));
  assert.ok(!decisionesPara("subio_precio").includes("eficiencia"));
  assert.ok(decisionesPara("subio_precio").includes("no_se_paga"));
  assert.ok(decisionesPara("nuevo").includes("no_se_paga"));
  assert.ok(decisionesPara("mas_cantidad").includes("no_se_paga"));
});
