import test from "node:test";
import assert from "node:assert/strict";
import { totales, netoPorRubro, esPrevisto, contraQueSeMide, eficienciaDeLaDiferencia }
  from "../src/modules/controlObra/cuentaBeneficios.js";

const b = [
  { obra_rubro_id: 1, presupuestado: 1000, real: 800, estado: "confirmado" },   // +200
  { obra_rubro_id: 1, presupuestado: 500, real: 560, estado: "confirmado" },    // −60
  { obra_rubro_id: 2, presupuestado: 2000, real: 1500, estado: "previsto" },    // +500, todavía no
  { obra_rubro_id: null, presupuestado: 300, real: 250 },                       // +50, sin estado = confirmado
];

test("el ahorro y el sobreprecio se cuentan por separado", () => {
  const t = totales(b);
  assert.equal(t.ahorro, 250);
  assert.equal(t.sobreprecio, 60);
  assert.equal(t.neto, 190);
});

test("lo previsto no entra en el neto: es una proforma, no una compra", () => {
  const t = totales(b);
  assert.equal(t.previsto, 500);
  assert.equal(t.cuantosPrevistos, 1);
  assert.equal(t.cuantos, 3);
});

test("sin estado se cuenta como confirmado: es lo que había antes", () => {
  assert.equal(esPrevisto({ presupuestado: 1, real: 0 }), false);
  assert.equal(esPrevisto({ estado: "previsto" }), true);
});

test("por rubro solo cuenta lo comprado", () => {
  const m = netoPorRubro(b);
  assert.equal(m[1], 140);
  assert.equal(m[2], undefined);
});

test("sin beneficios no revienta y da todo en cero", () => {
  const t = totales([]);
  assert.deepEqual([t.neto, t.ahorro, t.sobreprecio, t.previsto, t.cuantos], [0, 0, 0, 0, 0]);
  assert.deepEqual(netoPorRubro([]), {});
});

test("el rubro nuevo de una orden no se mide contra el presupuesto: no estaba", () => {
  // Un rubro que no existía ni en el presupuesto ni en el control entra el rato
  // que el cliente aprueba la orden, y desde entonces su presupuesto ES el
  // precio de la orden. Buscarle una base en el presupuesto es buscar algo que
  // nunca existió, y es lo que hace pensar que el margen está mal.
  const r = contraQueSeMide(
    [{ id: 1, estado: "aprobada" }, { id: 2, estado: "borrador" }],
    { 1: [{ obra_rubro_id: 7, tipo: "aumenta" }, { tipo: "aumenta" }, { tipo: "quita", obra_rubro_id: 9 }],
      2: [{ tipo: "aumenta" }] });
  assert.equal(r.sobreRubros, 1);
  assert.equal(r.nuevas, 1);
  assert.match(r.frase, /no existía ni en el presupuesto ni en el control/);
});

test("sin órdenes aprobadas no hay nada que explicar", () => {
  assert.equal(contraQueSeMide([], {}), null);
  assert.equal(contraQueSeMide([{ id: 1, estado: "aprobada", anulada: true }], { 1: [{ tipo: "aumenta" }] }), null);
});

test("lo que se paga con un rubro propio: el beneficio es el precio menos el costo", () => {
  // El tablero cuesta $380 y sale de un rubro vendido en $1.008: quedan $628
  // a favor. Restando el monto como si fuera una diferencia daba "$1.008 →
  // $628", o sea $380 de beneficio: la cuenta al reves, y justo al reves en
  // el renglon donde mas plata hay.
  const b = eficienciaDeLaDiferencia(
    { descripcion: "Tablero", cantidad: 1, unidad: "U", monto: 380, obra_rubro_id: 7 },
    { id: 7, numero: 3, cantidad: 1, total_base: 1159.2, iva_pct: 15 },
    { titulo: "Proforma noviembre" }, "precio");
  assert.equal(b.presupuestado, 1008);
  assert.equal(b.real, 380);
  assert.equal(b.presupuestado - b.real, 628);
});

test("la eficiencia de precio sigue midiendose contra el costo cargado", () => {
  // Aca el monto SI es la diferencia: costaba 48,50 y lo cotizan a 44, sobre
  // 12 unidades son 54 a favor.
  const b = eficienciaDeLaDiferencia(
    { descripcion: "Luminarias", cantidad: 12, unidad: "U", monto: 54, obra_rubro_id: 1 },
    { id: 1, cantidad: 12, costo_unitario: 48.5, total_base: 816 },
    { titulo: "Proforma" }, "costo");
  assert.equal(b.presupuestado, 582);
  assert.equal(b.real, 528);
});

test("por proveedor: lo que se le sacó a cada uno y qué se negoció, con sus totales", async () => {
  const { porProveedor } = await import("../src/modules/controlObra/cuentaBeneficios.js");
  const g = porProveedor([
    { proveedor: "Cholca", presupuestado: 720, real: 450, nota: "Negociación" },
    { proveedor: "cholca ", presupuestado: 14300.02, real: 9500, nota: "Negociación" },     // el mismo, escrito distinto
    { proveedor: "Kywi", presupuestado: 100, real: 130, nota: "Subió el acero" },
    { proveedor: "Kywi", presupuestado: 50, real: 40, estado: "previsto", nota: "flete gratis [dif:7]" },
    { presupuestado: 10, real: 8 },
  ]);
  assert.deepEqual(g.map(x => x.proveedor), ["Cholca", "Kywi", "Sin proveedor"]);
  assert.equal(g[0].filas.length, 2);
  assert.equal(g[0].neto, 5070.02);
  assert.deepEqual(g[0].negociado, ["Negociación"]);
  assert.equal(g[1].sobreprecio, 30);
  assert.equal(g[1].previsto, 10);
  assert.deepEqual(g[1].negociado, ["Subió el acero", "flete gratis"]);   // sin la marca de la máquina
});
