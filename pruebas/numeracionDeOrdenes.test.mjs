import { test } from "node:test";
import assert from "node:assert/strict";
import {
  numeroPrincipal, esModificacion, siguienteNumero, numeroDeModificacion, huecosQueSeCierran,
  numerosQueFaltan, codigoPrincipal, todaviaNoSalio,
} from "../src/modules/controlObra/numeracionDeOrdenes.js";

// ── LAS ÓRDENES GUARDAN SU ORDEN ───────────────────────────────────────────
//
// El caso de Diners Aeropuerto: se armó la OC-05 con la OC-04 vieja todavía en
// borrador, se borró la vieja, y quedó una OC-05 sin que exista ninguna OC-04.
// La regla del director: guardan su orden, y la única que no lleva número
// nuevo es la modificación de una orden, que es OC-04-A, OC-04-B.

const diners = [
  { id: 5, numero: 1, codigo: "OC-01", estado: "aprobada", visto_at: "2026-10-22" },
  { id: 7, numero: 2, codigo: "OC-02", estado: "enviada", visto_at: "2026-10-29" },
  { id: 9, numero: 3, codigo: "OC-03", estado: "aprobada", visto_at: "2026-10-31" },
  { id: 13, numero: 5, codigo: "OC-05", estado: "borrador" },
];

test("falta la 04, y la 05 —en borrador, nunca mandada— baja a ocupar su lugar", () => {
  assert.deepEqual(numerosQueFaltan(diners), [4]);
  assert.deepEqual(huecosQueSeCierran(diners), [{ id: 13, de: 5, a: 4, codigoDe: "OC-05", codigoA: "OC-04" }]);
});

test("una orden nueva toma el primer número libre", () => {
  assert.equal(siguienteNumero([]), 1);
  assert.equal(siguienteNumero(diners.slice(0, 3)), 4);
  assert.equal(siguienteNumero(diners), 4, "el hueco, no la 06");
  assert.equal(codigoPrincipal(4), "OC-04");
  assert.equal(codigoPrincipal(12), "OC-12");
});

test("la que ya se mandó o se aprobó no cambia de número nunca", () => {
  const enviada = [...diners.slice(0, 3), { id: 13, numero: 5, codigo: "OC-05", estado: "enviada" }];
  assert.deepEqual(huecosQueSeCierran(enviada), []);
  assert.deepEqual(numerosQueFaltan(enviada), [4], "el hueco se dice igual: lo va a llenar la próxima");
  // Tampoco la que ya pidió el visto del Director, ni una anulada.
  assert.equal(todaviaNoSalio({ estado: "borrador" }), true);
  assert.equal(todaviaNoSalio({ estado: "borrador", visto_pedido_at: "2026-11-05" }), false);
  assert.equal(todaviaNoSalio({ estado: "borrador", anulada: true }), false);
  assert.equal(todaviaNoSalio({ estado: "aprobada" }), false);
});

test("varias en borrador bajan en cadena, de menor a mayor, sin pisarse", () => {
  const varias = [
    { id: 1, numero: 1, codigo: "OC-01", estado: "aprobada" },
    { id: 2, numero: 3, codigo: "OC-03", estado: "borrador" },
    { id: 3, numero: 4, codigo: "OC-04", estado: "enviada" },
    { id: 4, numero: 6, codigo: "OC-06", estado: "borrador" },
    { id: 5, numero: 7, codigo: "OC-07", estado: "borrador" },
  ];
  // La 03 baja a 02. La 04 está enviada y se queda. La 06 baja a 03 y la 07 a 05.
  assert.deepEqual(huecosQueSeCierran(varias).map(p => [p.codigoDe, p.codigoA]),
    [["OC-03", "OC-02"], ["OC-06", "OC-03"], ["OC-07", "OC-05"]]);
  // Aplicadas en ese orden, cada destino está libre cuando le toca.
  const ocupados = new Set(varias.map(o => o.numero));
  for (const p of huecosQueSeCierran(varias)) {
    assert.equal(ocupados.has(p.a), false, `${p.codigoA} tiene que estar libre`);
    ocupados.delete(p.de); ocupados.add(p.a);
  }
});

test("sin huecos no hay nada que mover", () => {
  assert.deepEqual(huecosQueSeCierran(diners.slice(0, 3)), []);
  assert.deepEqual(numerosQueFaltan(diners.slice(0, 3)), []);
});

test("una modificación no consume número: lleva el de su orden y una letra", () => {
  const conLetra = [...diners.slice(0, 3),
    { id: 20, numero: 1001, codigo: "OC-03-A", revision_de: 9, estado: "borrador" }];
  assert.equal(esModificacion(conLetra[3]), true);
  assert.equal(esModificacion({ codigo: "OC-01.1" }), true, "las viejas, con punto, también");
  assert.equal(esModificacion({ codigo: "OC-04" }), false);
  assert.equal(numeroPrincipal(conLetra[3]), 3, "es de la 03");
  assert.equal(numeroPrincipal({ codigo: "OC-01.2", numero: 7 }), 1);
  assert.equal(numeroPrincipal({ numero: 6 }), 6, "sin código, su número");
  // La orden que sigue es la 04: la modificación no ocupó ese lugar.
  assert.equal(siguienteNumero(conLetra), 4);
  assert.deepEqual(numerosQueFaltan(conLetra), []);
  assert.deepEqual(huecosQueSeCierran(conLetra), [], "y no se la renumera");
  // Su número interno va por encima de mil y no se repite.
  assert.equal(numeroDeModificacion(diners), 1001);
  assert.equal(numeroDeModificacion(conLetra), 1002);
});
