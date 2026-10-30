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

// SOLO SE COMPARA LO MISMO CONTRA LO MISMO.
//
// Con la misma cantidad, el total contra el total: esa diferencia es beneficio
// de verdad. Con cantidades distintas lo único comparable es el precio
// unitario — si no, comprar menos material parece un ahorro.

const conCantidad = [
  { id: 1, descripcion: "Varilla 12mm", total_base: 1200, cantidad: 120, unidad: "u" },
];

test("misma cantidad, mejor precio: el beneficio es real y sale de los totales", () => {
  const l = compararContraPresupuesto([{ monto: 960, cantidad: 120, rubro_id: 1 }], conCantidad).lineas[0];
  assert.equal(l.porUnitario, false);
  assert.equal(l.diferencia, 240);
});

test("menos cantidad al mismo precio unitario NO es un ahorro", () => {
  // 80 varillas a los mismos $10 que presupuestó: no se ahorró nada, se compró
  // menos material. Comparando totales habría dicho "+$400".
  const l = compararContraPresupuesto([{ monto: 800, cantidad: 80, rubro_id: 1 }], conCantidad).lineas[0];
  assert.equal(l.porUnitario, true);
  assert.equal(l.diferencia, 0);
});

test("con cantidades distintas se compara el precio unitario", () => {
  // 80 a $7 contra $10 presupuestado: se ahorran $3 en cada una de las 80.
  const l = compararContraPresupuesto([{ monto: 560, cantidad: 80, rubro_id: 1 }], conCantidad).lineas[0];
  assert.equal(l.puRubro, 10);
  assert.equal(l.puProforma, 7);
  assert.equal(l.diferencia, 240);
  assert.equal(l.presupuestado, 800, "se compara contra lo que costarían 80, no 120");
  assert.equal(l.delRubro, 1200, "pero el rubro entero sigue a la vista");
});

test("más cantidad que la presupuestada tampoco inventa un sobreprecio", () => {
  // 150 a los mismos $10: por totales parecería que se pasó $300.
  const r = compararContraPresupuesto([{ monto: 1500, cantidad: 150, rubro_id: 1 }], conCantidad);
  assert.equal(r.lineas[0].diferencia, 0);
  assert.equal(r.sobreprecio, 0);
  assert.equal(r.porUnitario, 1);
});

test("sin cantidades se compara por totales, como siempre", () => {
  const l = compararContraPresupuesto([{ monto: 900, rubro_id: 1 }], conCantidad).lineas[0];
  assert.equal(l.porUnitario, false);
  assert.equal(l.diferencia, 300);
});

// ── LA TERCERA COLUMNA: EL COSTO CARGADO ───────────────────────────────────
//
// El presupuesto tiene dos números por rubro: el precio que ve el cliente y el
// costo que nos cuesta. Son dos preguntas distintas y antes solo se podía hacer
// la primera.

test("sin costo cargado la comparación contra el costo no existe, y no es cero", () => {
  // Es el caso de Diners Aéreo: 164 rubros que vinieron de un Excel de precios.
  const r = compararContraPresupuesto(
    [{ descripcion: "Vinil", cantidad: 8, monto: 1200, rubro_id: 1 }],
    [{ id: 1, descripcion: "Vinil en fachada", cantidad: 8, total_base: 1726.64 }]);
  assert.equal(r.lineas[0].costoCargado, null);
  assert.equal(r.lineas[0].vsCosto, null);
  assert.equal(r.conCosto, 0);
  assert.equal(r.sinCosto, 1);
  assert.equal(r.laObraSabeSusCostos, false);
  // Lo que sí se puede contestar: cuánto deja contra el precio al cliente.
  assert.equal(r.lineas[0].diferencia, 526.64);
});

test("con costo cargado se contesta la otra pregunta: si el proveedor subió", () => {
  const r = compararContraPresupuesto(
    [{ descripcion: "Vinil", cantidad: 8, monto: 1300, rubro_id: 1 }],
    [{ id: 1, descripcion: "Vinil en fachada", cantidad: 8, total_base: 1726.64, costo_unitario: 150 }]);
  const l = r.lineas[0];
  assert.equal(l.costoCargado, 1200);
  assert.equal(l.vsCosto, -100);          // cotiza $100 por encima de lo cargado
  assert.equal(l.pctCosto, -8.3);
  assert.equal(r.subioElProveedor, 100);
  assert.equal(r.bajoElProveedor, 0);
  assert.equal(r.laObraSabeSusCostos, true);
});

test("el costo cargado se mide sobre la cantidad que trae la proforma", () => {
  // El rubro son 8 paneles y la proforma cotiza 12: lo comparable es el
  // unitario, también del lado del costo.
  const r = compararContraPresupuesto(
    [{ descripcion: "Vinil", cantidad: 12, monto: 1800, rubro_id: 1 }],
    [{ id: 1, cantidad: 8, total_base: 1726.64, costo_unitario: 150 }]);
  assert.equal(r.lineas[0].costoCargado, 1800);   // 150 × 12
  assert.equal(r.lineas[0].vsCosto, 0);           // el proveedor no movió el precio
  assert.equal(r.lineas[0].porUnitario, true);    // pero son más paneles
});

test("el proveedor que baja se cuenta aparte del que sube", () => {
  const r = compararContraPresupuesto(
    [{ descripcion: "A", cantidad: 1, monto: 90, rubro_id: 1 },
     { descripcion: "B", cantidad: 1, monto: 130, rubro_id: 2 }],
    [{ id: 1, cantidad: 1, total_base: 200, costo_unitario: 100 },
     { id: 2, cantidad: 1, total_base: 200, costo_unitario: 100 }]);
  assert.equal(r.bajoElProveedor, 10);
  assert.equal(r.subioElProveedor, 30);
});
