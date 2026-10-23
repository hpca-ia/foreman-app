import test from "node:test";
import assert from "node:assert/strict";
import { compararVersiones, llaveDe, renglonesDeCambios } from "../src/modules/presupuestos/compararVersiones.js";

const item = (o) => ({ cantidad: 1, precio_unitario: 100, unidad: "u", capitulo: "OBRA", ...o });

test("un rubro nuevo se cuenta con lo que suma", () => {
  const d = compararVersiones([], [item({ descripcion: "Locker metálico", total: 450 })]);
  assert.equal(d.nuevos.length, 1);
  assert.equal(d.montoNuevos, 450);
  assert.equal(d.diferencia, 450);
});

test("un rubro que ya no está resta", () => {
  const d = compararVersiones([item({ descripcion: "Carpa", total: 300 })], []);
  assert.equal(d.quitados.length, 1);
  assert.equal(d.montoQuitados, -300);
  assert.equal(d.diferencia, -300);
});

test("el precio que subió dice de cuánto a cuánto y cuánto mueve", () => {
  const d = compararVersiones(
    [item({ descripcion: "Tabique", cantidad: 10, precio_unitario: 50, total: 500 })],
    [item({ descripcion: "Tabique", cantidad: 10, precio_unitario: 60, total: 600 })],
  );
  assert.equal(d.cambiados.length, 1);
  assert.deepEqual(d.cambiados[0].campos, [{ campo: "precio", de: 50, a: 60 }]);
  assert.equal(d.cambiados[0].delta, 100);
  assert.equal(d.diferencia, 100);
});

test("un rubro igual no es un cambio", () => {
  const uno = [item({ descripcion: "Piso", cantidad: 5, precio_unitario: 20, total: 100 })];
  const d = compararVersiones(uno, [item({ descripcion: "Piso", cantidad: 5, precio_unitario: 20, total: 100 })]);
  assert.ok(d.sinCambios);
  assert.equal(d.diferencia, 0);
});

test("se reconoce el mismo rubro aunque le cambien una coma o una tilde", () => {
  assert.equal(llaveDe({ descripcion: "Tabique de yeso, 1/2\"" }), llaveDe({ descripcion: "TABIQUE DE YESO 1/2\"" }));
  const d = compararVersiones(
    [item({ descripcion: "Mampostería" })],
    [item({ descripcion: "MAMPOSTERIA" })],
  );
  assert.ok(d.sinCambios, "no es uno nuevo más uno quitado");
});

test("si tienen rubro_id manda el id, no el texto", () => {
  const d = compararVersiones(
    [item({ rubro_id: 7, descripcion: "Pintura interior", total: 100 })],
    [item({ rubro_id: 7, descripcion: "Pintura interior y exterior", total: 100 })],
  );
  assert.equal(d.nuevos.length, 0);
  assert.equal(d.cambiados.length, 1);
  assert.equal(d.cambiados[0].campos[0].campo, "descripción");
});

test("el porcentaje no se inventa cuando antes no había nada", () => {
  const d = compararVersiones([], [item({ descripcion: "Algo", total: 10 })]);
  assert.equal(d.porcentaje, null);
});

test("el texto de los cambios se puede leer sin NOVA", () => {
  const t = renglonesDeCambios(compararVersiones(
    [item({ descripcion: "Vidrio", cantidad: 2, precio_unitario: 100, total: 200 })],
    [item({ descripcion: "Vidrio", cantidad: 3, precio_unitario: 100, total: 300 })],
  ));
  assert.match(t, /CAMBIÓ DE PRECIO O CANTIDAD/);
  assert.match(t, /cantidad: de 2 a 3/);
  assert.match(t, /TOTAL: de \$200\.00 a \$300\.00 — \+\$100\.00/);
  // Como lista: cada cambio en su renglón, con guión, para que el PDF lo
  // dibuje como lista y no como un párrafo.
  assert.ok(t.split("\n").some(l => l.startsWith("- ")));
});
