import test from "node:test";
import assert from "node:assert/strict";
import { rubrosDeLaBase, pedidoDeEmparejar, emparejar, planDeLlenado } from "../src/modules/presupuestos/llenarBase.js";

// El presupuesto está en blanco y el proveedor cotiza algunos de sus rubros:
// el precio va a cada rubro, no a un capítulo aparte.

const capitulos = [{ nombre: "PISOS", orden: 2 }, { nombre: "OBRA GRIS", orden: 1 }];
const items = [
  { id: "a", capitulo: "PISOS", orden: 2001, descripcion: "Porcelanato 60x60", unidad: "m2", cantidad: 120, precio_unitario: 0, total: 0 },
  { id: "b", capitulo: "PISOS", orden: 2002, descripcion: "Barredera", unidad: "ml", cantidad: 0, precio_unitario: 0, total: 0 },
  { id: "c", capitulo: "OBRA GRIS", orden: 1001, descripcion: "Contrapiso", unidad: "m2", cantidad: 50, precio_unitario: 10, total: 500 },
];
const base = rubrosDeLaBase({ capitulos, items });

test("la base va en el orden de la pantalla, con su número", () => {
  assert.deepEqual(base.map(b => [b.n, b.numero, b.id]), [[1, "1.1", "c"], [2, "2.1", "a"], [3, "2.2", "b"]]);
  assert.match(pedidoDeEmparejar(base), /2 \| PISOS \| Porcelanato 60x60 \| m2 \| 120/);
  assert.equal(pedidoDeEmparejar([]), "");
});

test("lo que NOVA dice se pasa a ids; lo inventado y lo repetido quedan sin rubro", () => {
  const r = emparejar([{ descripcion: "x", base: 2 }, { descripcion: "y", base: 99 }, { descripcion: "z", base: 2 }, { descripcion: "w", base: null }], base);
  assert.deepEqual(r.map(x => x.base_id), ["a", null, null, null]);
  assert.ok(!("base" in r[0]));
});

test("se escribe el precio; la cantidad del presupuesto manda", () => {
  const p = planDeLlenado([
    { descripcion: "Porcelanato", cantidad: 100, unidad: "m2", precio: 25.5, base_id: "a" },
    { descripcion: "Barredera", cantidad: 80, unidad: "ml", precio: 4, base_id: "b" },
    { descripcion: "Contrapiso", cantidad: 50, precio: 12, base_id: "c" },
    { descripcion: "Transporte", cantidad: 1, precio: 60, base_id: null },
  ], base);
  const de = id => p.cambios.find(c => c.id === id);
  assert.equal(de("a").cantidad, 120); assert.equal(de("a").total, 3060); assert.equal(de("a").ponerCantidad, false);
  // sin cantidad en el presupuesto: entra la cotizada
  assert.equal(de("b").cantidad, 80); assert.equal(de("b").total, 320); assert.equal(de("b").ponerCantidad, true);
  // ya tenía precio: lo que entra es la diferencia
  assert.equal(de("c").precioAntes, 10); assert.equal(de("c").total, 600);
  assert.equal(p.entra, 3060 + 320 + 100);
  assert.deepEqual(p.sueltos.map(s => s.descripcion), ["Transporte"]);
  assert.deepEqual(p.repetidos, []);
});

test("dos renglones al mismo rubro se avisan", () => {
  const p = planDeLlenado([{ precio: 1, base_id: "a" }, { precio: 2, base_id: "a" }], base);
  assert.deepEqual(p.repetidos, ["a"]);
});
