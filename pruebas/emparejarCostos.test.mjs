import test from "node:test";
import assert from "node:assert/strict";
import { emparejarCostos } from "../src/modules/controlObra/cuentaOrdenCambio.js";

// El caso real: la OC-01 de Plaza Lagos. La cotización estaba leída y el costo
// nunca bajó a la partida, así que el margen no existía.
const lineas = [{ id: 1, tipo: "aumenta", descripcion: "Vinil blanco respaldo gris 260x415", cantidad: 8, precio_unitario: 215.83 }];
const items = [{ descripcion: "Vinil blanco respaldo gris 260x415", cantidad: 8, unidad: "u", monto: 1389.75 }];

test("el renglón que se llama igual le pone el costo a su partida", () => {
  const { pone, sinCosto, sinUsar } = emparejarCostos(lineas, items);
  assert.equal(pone.length, 1);
  assert.equal(pone[0].id, 1);
  assert.equal(pone[0].costo_unitario, 173.7188);
  assert.equal(pone[0].como, "por el nombre");
  assert.deepEqual(sinCosto, []);
  assert.deepEqual(sinUsar, []);
});

test("el nombre empareja aunque cambien tildes, mayúsculas y signos", () => {
  const { pone } = emparejarCostos(
    [{ id: 7, tipo: "aumenta", descripcion: "INSTALACIÓN ELÉCTRICA (provisional)", cantidad: 1 }],
    [{ descripcion: "instalacion electrica provisional", cantidad: 1, monto: 500 }]);
  assert.equal(pone.length, 1);
  assert.equal(pone[0].costo_unitario, 500);
});

test("sin nombres que coincidan, empareja por posición si calzan los largos", () => {
  const { pone } = emparejarCostos(
    [{ id: 1, tipo: "aumenta", descripcion: "Generador 20KVA", cantidad: 1 },
     { id: 2, tipo: "aumenta", descripcion: "Traslado e instalación", cantidad: 2 }],
    [{ descripcion: "Alquiler generador diesel", cantidad: 1, monto: 1500 },
     { descripcion: "Flete ida y vuelta", cantidad: 2, monto: 280 }]);
  assert.equal(pone.length, 2);
  assert.equal(pone[0].costo_unitario, 1500);
  assert.equal(pone[1].costo_unitario, 140);
  assert.ok(pone.every(p => p.como === "por su posición en la proforma"));
});

test("con largos distintos NO adivina: pone lo que calza y dice el resto", () => {
  const { pone, sinCosto, sinUsar } = emparejarCostos(
    [{ id: 1, tipo: "aumenta", descripcion: "Vinil blanco", cantidad: 1 },
     { id: 2, tipo: "aumenta", descripcion: "Mano de obra", cantidad: 1 },
     { id: 3, tipo: "aumenta", descripcion: "Andamios", cantidad: 1 }],
    [{ descripcion: "Vinil blanco", cantidad: 1, monto: 100 },
     { descripcion: "Otra cosa que no está en la orden", cantidad: 1, monto: 50 }]);
  assert.deepEqual(pone.map(p => p.id), [1]);
  assert.deepEqual(sinCosto, ["Mano de obra", "Andamios"]);
  assert.deepEqual(sinUsar, ["Otra cosa que no está en la orden"]);
});

test("las reducciones no se cotizan y quedan afuera", () => {
  const { pone } = emparejarCostos(
    [{ id: 1, tipo: "quita", descripcion: "Piso de microcemento", cantidad: 95.61 },
     { id: 2, tipo: "aumenta", descripcion: "Fundición de losa", cantidad: 95.61 }],
    [{ descripcion: "Fundición de losa", cantidad: 95.61, monto: 7000 }]);
  assert.deepEqual(pone.map(p => p.id), [2]);
});

test("una partida que ya tiene costo no se cuenta como sin costo", () => {
  const { sinCosto } = emparejarCostos(
    [{ id: 1, tipo: "aumenta", descripcion: "Algo", cantidad: 1, costo_unitario: 9 }],
    [{ descripcion: "Otra", cantidad: 1, monto: 5 }, { descripcion: "Y otra", cantidad: 1, monto: 6 }]);
  assert.deepEqual(sinCosto, []);
});

test("el costo de una orden de cambio va sin IVA: la orden cobra sin IVA", () => {
  // La OC-01 de Plaza Lagos: $1.389,75 con IVA del 15% son $1.208,48 de costo,
  // y el margen pasa de $336,89 (19,5%) a $518,16 (30%).
  const { pone } = emparejarCostos(lineas, items, 15, false);
  assert.equal(pone[0].costo_unitario, 151.0598);
  const costo = Math.round(pone[0].costo_unitario * 8 * 100) / 100;
  assert.equal(costo, 1208.48);
  assert.equal(Math.round((1726.64 - costo) * 100) / 100, 518.16);
});

test("sin IVA declarado, el monto se usa tal cual", () => {
  assert.equal(emparejarCostos(lineas, items, 0).pone[0].costo_unitario, 173.7188);
});

test("desde la 139 la proforma se lee sin IVA y no hay nada que descontar", () => {
  // El monto que trae NOVA ya es el subtotal del renglón: aplicarle el IVA otra
  // vez lo descontaría dos veces.
  const { pone } = emparejarCostos(lineas, [{ ...items[0], monto: 1208.48 }], 15, true);
  assert.equal(pone[0].costo_unitario, 151.06);
});

test("una cotización vieja sí se netea: se leyó con el IVA adentro", () => {
  const { pone } = emparejarCostos(lineas, items, 15, false);
  assert.equal(pone[0].costo_unitario, 151.0598);
});
