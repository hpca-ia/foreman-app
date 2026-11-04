import test from "node:test";
import assert from "node:assert/strict";
import { derivar, cuentaAMano, explicar } from "../src/modules/controlObra/beneficioAMano.js";

const rubros = [
  // Cargado con el IVA adentro, como los rubros base del control: $1.150 son $1.000 sin IVA.
  { id: 46, numero: "46", descripcion: "Panelado", total_base: 1150, iva_pct: 15, cantidad: 125, unidad: "m2" },
  { id: 7, descripcion: "Flete", total_base: 300 },
];

test("cantidad × unitario llena el total", () => {
  assert.equal(derivar({ cantidad: "118", unitario: "7" }, "unitario").real, "826");
  assert.equal(derivar({ cantidad: "118", unitario: "7" }, "cantidad").real, "826");
});

test("el total con la cantidad saca el unitario", () => {
  assert.equal(derivar({ cantidad: "118", real: "95" }, "real").unitario, "0.8051");
});

test("con una sola cifra no se inventa nada", () => {
  assert.deepEqual(derivar({ cantidad: "118" }, "cantidad"), { cantidad: "118" });
  assert.deepEqual(derivar({ real: "95" }, "real"), { real: "95" });
});

test("elegir el rubro con un total ya escrito saca el unitario", () => {
  assert.equal(derivar({ real: "95", cantidad: "125" }, "cantidad").unitario, "0.76");
});

test("la cantidad medida en obra no es la del presupuesto: el beneficio sale del precio unitario", () => {
  // El rubro son 125 m2 a $8 sin IVA ($1.000 / 125). Se compraron 118 m2 a $7.
  const c = cuentaAMano({ obra_rubro_id: "46", cantidad: "118", unitario: "7", real: "826" }, rubros);
  assert.equal(c.porUnitario, true);
  assert.equal(c.puRubro, 8);
  assert.equal(c.presupuestado, 944);      // 8 × 118, no los $1.000 del rubro entero
  assert.equal(c.diferencia, 118);         // $1 en cada uno de los 118
  assert.equal(c.escrito, false);
});

test("misma cantidad: total contra total, y sin el IVA del rubro", () => {
  const c = cuentaAMano({ obra_rubro_id: "46", cantidad: "125", unitario: "7", real: "875" }, rubros);
  assert.equal(c.porUnitario, false);
  assert.equal(c.presupuestado, 1000);
  assert.equal(c.diferencia, 125);
});

test("sin cantidad se compara contra el rubro entero, sin IVA", () => {
  // Antes se tomaba total_base con el IVA adentro: $1.150 contra $900 decía
  // +$250 y eran +$100.
  const c = cuentaAMano({ obra_rubro_id: "46", real: "900" }, rubros);
  assert.equal(c.presupuestado, 1000);
  assert.equal(c.diferencia, 100);
});

test("lo presupuestado escrito a mano manda sobre la cuenta del rubro", () => {
  const c = cuentaAMano({ obra_rubro_id: "46", cantidad: "118", real: "826", presupuestado: "900" }, rubros);
  assert.equal(c.presupuestado, 900);
  assert.equal(c.diferencia, 74);
  assert.equal(c.escrito, true);
});

test("sin rubro y sin presupuestado no hay contra qué comparar", () => {
  const c = cuentaAMano({ descripcion: "Flete negociado", real: "95" }, rubros);
  assert.equal(c.presupuestado, null);
  assert.equal(c.diferencia, null);
  assert.match(explicar(c), /sin rubro/i);
});

test("el rubro sin cantidad se compara contra su total aunque se escriba cantidad", () => {
  const c = cuentaAMano({ obra_rubro_id: "7", cantidad: "3", unitario: "80", real: "240" }, rubros);
  assert.equal(c.porUnitario, false);
  assert.equal(c.presupuestado, 300);
  assert.match(explicar(c), /no tiene cantidad/i);
});

test("la explicación dice de dónde salió el número", () => {
  const c = cuentaAMano({ obra_rubro_id: "46", cantidad: "118", unitario: "7", real: "826" }, rubros);
  assert.match(explicar(c), /125 m2/);
  assert.match(explicar(c), /8 × 118 = \$944/);
});
