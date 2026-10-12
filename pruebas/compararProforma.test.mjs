import test from "node:test";
import assert from "node:assert/strict";
import { compararContraPresupuesto } from "../src/modules/controlObra/compararProforma.js";

const rubros = [
  { id: 1, descripcion: "Cemento", total_base: 1000 },
  { id: 2, descripcion: "Varilla", total_base: 2000 },
  { id: 3, descripcion: "Alambre", total_base: 300 },
];

test("se compra más barato: es ahorro", () => {
  const r = compararContraPresupuesto([{ monto: 800, rubro_id: 1 }], rubros);
  assert.equal(r.lineas[0].diferencia, 200);
  assert.equal(r.ahorro, 200);
  assert.equal(r.sobreprecio, 0);
});

test("se compra más caro: es sobreprecio, no un ahorro negativo", () => {
  const r = compararContraPresupuesto([{ monto: 2500, rubro_id: 2 }], rubros);
  assert.equal(r.sobreprecio, 500);
  assert.equal(r.ahorro, 0);
});

test("AHORRO Y SOBREPRECIO VAN POR SEPARADO, no solo el neto", () => {
  // Un neto de "+$300" puede esconder $4.000 de ahorro y $3.700 de
  // sobreprecio, y esas son dos obras muy distintas.
  const r = compararContraPresupuesto([
    { monto: 600, rubro_id: 1 },     // ahorro 400
    { monto: 2100, rubro_id: 2 },    // sobreprecio 100
  ], rubros);
  assert.equal(r.ahorro, 400);
  assert.equal(r.sobreprecio, 100);
  assert.equal(r.neto, 300);
});

test("lo que no apunta a un rubro no entra en ningún total, y se cuenta", () => {
  // Un beneficio calculado sobre la mitad de la proforma no es un beneficio.
  const r = compararContraPresupuesto([
    { monto: 800, rubro_id: 1 },
    { monto: 999, rubro_id: null },
  ], rubros);
  assert.equal(r.sinRubro, 1);
  assert.equal(r.cotizado, 800, "el suelto no suma");
  assert.equal(r.ahorro, 200);
});

test("un rubro_id que no existe cuenta como sin emparejar", () => {
  const r = compararContraPresupuesto([{ monto: 100, rubro_id: 999 }], rubros);
  assert.equal(r.sinRubro, 1);
  assert.equal(r.lineas[0].presupuestado, null);
});

test("el porcentaje es contra lo presupuestado", () => {
  const r = compararContraPresupuesto([{ monto: 800, rubro_id: 1 }], rubros);
  assert.equal(r.lineas[0].pct, 20);
});

test("comprar exactamente lo presupuestado no es ni ahorro ni sobreprecio", () => {
  const r = compararContraPresupuesto([{ monto: 1000, rubro_id: 1 }], rubros);
  assert.equal(r.ahorro, 0);
  assert.equal(r.sobreprecio, 0);
  assert.equal(r.neto, 0);
});

test("los totales cierran: presupuestado menos cotizado es el neto", () => {
  const r = compararContraPresupuesto([
    { monto: 600, rubro_id: 1 }, { monto: 2100, rubro_id: 2 }, { monto: 250, rubro_id: 3 },
  ], rubros);
  assert.equal(r.presupuestado - r.cotizado, r.neto);
});

test("sin renglones no revienta", () => {
  const r = compararContraPresupuesto([], rubros);
  assert.equal(r.neto, 0);
  assert.equal(r.sinRubro, 0);
});
