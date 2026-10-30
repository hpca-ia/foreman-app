import test from "node:test";
import assert from "node:assert/strict";
import { honorariosDe, netoDeLaOrden, rubroDeHonorarios, afectaDe, comoSeDice }
  from "../src/modules/controlObra/honorariosDeOrden.js";

const lineas = [
  { tipo: "aumenta", cantidad: 8, precio_unitario: 215.83 },   // 1.726,64
  { tipo: "aumenta", cantidad: 1, precio_unitario: 400 },
  { tipo: "quita", cantidad: 2, precio_unitario: 113.32 },     // −226,64
];

test("los honorarios se cobran sobre el neto, no sobre las adiciones", () => {
  // Cobrar el 10% de lo que se agrega e ignorar lo que se quita seria cobrar
  // honorarios por obra que no se va a hacer.
  const { adiciones, reducciones, neto } = netoDeLaOrden(lineas);
  assert.equal(adiciones, 2126.64);
  assert.equal(reducciones, 226.64);
  assert.equal(neto, 1900);
  assert.equal(honorariosDe({ lineas, pct: 10 }).honorarios, 190);
});

test("el honorario no encarece el rubro: es su propia linea al pie", () => {
  const c = honorariosDe({ lineas, pct: 10, iva: 15 });
  assert.equal(c.neto, 1900);
  assert.equal(c.honorarios, 190);
  assert.equal(c.subtotal, 2090);
  // El IVA va sobre el total, honorarios incluidos: el honorario es un
  // servicio y se factura con IVA como todo lo demas.
  assert.equal(c.iva, 313.5);
  assert.equal(c.total, 2403.5);
});

test("si la orden es negativa el honorario tambien: se administra menos", () => {
  // Cobrar el 10% cuando sube y no devolverlo cuando baja es quedarse con la
  // mitad buena de la regla.
  const c = honorariosDe({ lineas: [{ tipo: "quita", cantidad: 1, precio_unitario: 3000 }], pct: 10 });
  assert.equal(c.neto, -3000);
  assert.equal(c.honorarios, -300);
  assert.equal(c.devuelve, true);
  assert.equal(c.subtotal, -3300);
});

test("sin porcentaje acordado no se inventa ninguno", () => {
  const c = honorariosDe({ lineas, pct: 0 });
  assert.equal(c.honorarios, 0);
  assert.equal(c.hay, false);
  assert.equal(c.subtotal, 1900);
  assert.equal(rubroDeHonorarios({ id: 1, numero: 3 }, c), null);
});

test("el rubro de honorarios va a su propio capitulo, no al de la orden", () => {
  // Repartirlo dentro de los precios dejaria a cada rubro mintiendo sobre lo
  // que cuesta, y ese precio es contra el que despues se compara una proforma.
  const c = honorariosDe({ lineas, pct: 10 });
  const r = rubroDeHonorarios({ id: 7, obra_id: 13, numero: 3, codigo: "OC-03" }, c,
    { conIva: v => Math.round(v * 1.15 * 100) / 100, iva: 15 });
  assert.equal(r.capitulo, "HONORARIOS");
  assert.equal(r.total_base, 218.5);
  assert.equal(r.orden_cambio_id, 7);
  assert.match(r.descripcion, /Honorarios 10% sobre OC-03/);
});

test("una orden puede afectar varias cosas a la vez, y se dicen todas", () => {
  assert.equal(comoSeDice({ afecta: ["economica", "tiempo"] }), "Económica · Tiempo");
  assert.equal(comoSeDice({ afecta: ["tiempo", "economica", "especificacion"] }),
    "Económica, especificación y tiempo");
  assert.equal(comoSeDice({ afecta: [] }), null);
  // Lo que venga de la base y no sea una de las tres no se cuela.
  assert.deepEqual(afectaDe({ afecta: ["tiempo", "cualquier cosa"] }), ["tiempo"]);
});
