import test from "node:test";
import assert from "node:assert/strict";
import { compararContraPresupuesto } from "../src/modules/controlObra/compararProforma.js";
import { loQueNoEstaPresupuestado, partidasParaOrden, comoSeDice } from "../src/modules/controlObra/extraParaCobrar.js";

// El caso: se cotizó X. Se va a la obra, se mide, y hace falta X, Y y T.
const rubros = [{ id: 1, numero: "1.1", descripcion: "Vinil en fachada", unidad: "u", cantidad: 8, total_base: 1726.64 }];
const proforma = [
  { descripcion: "Vinil blanco respaldo gris", cantidad: 12, unidad: "u", monto: 1800, rubro_id: 1 },
  { descripcion: "Perfilería de aluminio", cantidad: 1, unidad: "glb", monto: 400, rubro_id: null },
  { descripcion: "Desmontaje del vinil viejo", cantidad: 1, unidad: "glb", monto: 250, rubro_id: null },
];
const h = loQueNoEstaPresupuestado(compararContraPresupuesto(proforma, rubros));

test("encuentra lo que no está en ningún rubro", () => {
  assert.equal(h.nuevos.length, 2);
  assert.deepEqual(h.nuevos.map(x => x.descripcion), ["Perfilería de aluminio", "Desmontaje del vinil viejo"]);
  assert.equal(h.sinPrecio, 2);
});

test("encuentra la cantidad de más, y cobra solo la diferencia", () => {
  assert.equal(h.demas.length, 1);
  const x = h.demas[0];
  assert.equal(x.cantidad, 4);                 // eran 8, la proforma trae 12
  assert.equal(x.costoUnitario, 150);          // 1800 / 12
  assert.equal(x.costo, 600);
  assert.match(x.por, /tiene 8 u y la proforma trae 12/);
});

test("lo que ya tiene precio acordado se cobra a ese precio, no a uno nuevo", () => {
  // Volver a ponerle precio a un rubro que el cliente ya firmó es abrir una
  // negociación que no hacía falta.
  assert.equal(h.demas[0].precioUnitario, 215.83);
  assert.equal(h.conPrecio, 863.32);           // 4 × 215,83
});

test("el costo de todo lo que hay que cobrar se suma de los dos lados", () => {
  assert.equal(h.costo, 1250);                 // 600 de más + 400 + 250
  assert.equal(h.cuantos, 3);
});

test("como partidas de una orden: el precio del contrato se respeta, lo nuevo lleva utilidad", () => {
  const p = partidasParaOrden(h, 20);
  assert.equal(p.length, 3);
  const extra = p.find(x => x.descripcion.includes("de más"));
  assert.equal(extra.precio_unitario, 215.83);     // el del contrato, sin tocar
  assert.equal(extra.costo_unitario, 150);
  assert.equal(extra.obra_rubro_id, 1);
  const nuevo = p.find(x => x.descripcion === "Perfilería de aluminio");
  assert.equal(nuevo.costo_unitario, 400);
  assert.equal(nuevo.precio_unitario, 480);        // 400 + 20%
});

test("una proforma que calza con el presupuesto no inventa un extra", () => {
  const sin = loQueNoEstaPresupuestado(compararContraPresupuesto(
    [{ descripcion: "Vinil", cantidad: 8, monto: 1200, rubro_id: 1 }], rubros));
  assert.equal(sin.cuantos, 0);
  assert.equal(comoSeDice(sin), null);
});

test("menos cantidad de la presupuestada no es un extra a cobrar", () => {
  const menos = loQueNoEstaPresupuestado(compararContraPresupuesto(
    [{ descripcion: "Vinil", cantidad: 5, monto: 750, rubro_id: 1 }], rubros));
  assert.equal(menos.demas.length, 0);
});

test("el titular dice las dos cosas por separado", () => {
  assert.equal(comoSeDice(h),
    "2 renglones que no están en el presupuesto y 1 rubro con más cantidad de la presupuestada · $1.250,00 de costo");
});

test("lo que falta también es una diferencia con el cliente, y va como reducción", () => {
  // El rubro se contrató por 8 y la liquidación mide 5: tres no se hicieron.
  const menos = loQueNoEstaPresupuestado(compararContraPresupuesto(
    [{ descripcion: "Vinil", cantidad: 5, unidad: "u", monto: 750, rubro_id: 1 }], rubros));
  assert.equal(menos.menos.length, 1);
  assert.equal(menos.menos[0].cantidad, 3);
  assert.equal(menos.menos[0].precioUnitario, 215.83);
  assert.equal(menos.aDevolver, 647.49);
  const p = partidasParaOrden(menos, 20);
  assert.equal(p[0].tipo, "quita");
  assert.equal(p[0].precio_unitario, 215.83);
});

test("una obra que solo informa los adicionales pierde credibilidad: se dicen los dos", () => {
  const mezcla = loQueNoEstaPresupuestado(compararContraPresupuesto([
    { descripcion: "Vinil", cantidad: 5, unidad: "u", monto: 750, rubro_id: 1 },
    { descripcion: "Perfilería", cantidad: 1, unidad: "glb", monto: 400, rubro_id: null },
  ], rubros));
  assert.match(comoSeDice(mezcla), /1 renglón que no está en el presupuesto y 1 rubro con menos de lo contratado/);
});
