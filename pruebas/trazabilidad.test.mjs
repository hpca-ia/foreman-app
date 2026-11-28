import { test } from "node:test";
import assert from "node:assert/strict";
import {
  codigoTR, codigoPR, puertaDe, traza, partesDeLaTraza, trazaEnTexto, origenEnTexto,
  codigosEnLaBusqueda, esLaBuscada,
} from "../src/lib/trazabilidad.js";

// LA TR (migración 202). Hernán, 28/11/2026: PR el proyecto, TR la
// transacción, ODC la orden de compra, CC la caja chica, PL la planilla.

test("el código lleva el proyecto delante, y sin proyecto va solo", () => {
  assert.equal(codigoTR(52, 15), "PR15-TR52");
  assert.equal(codigoTR(300, null), "TR300");
  assert.equal(codigoTR(null, 15), "");
  assert.equal(codigoPR(15), "PR15");
});

test("la puerta: la orden manda sobre la caja, y el rol y el control se distinguen", () => {
  assert.equal(puertaDe({ origen: "caja_chica", caja_gasto_id: 73 }, { odc: [12], caja: { id: 9 } }), "odc");
  assert.equal(puertaDe({ origen: "caja_chica", caja_gasto_id: 73 }, { caja: { id: 9 } }), "cc");
  assert.equal(puertaDe({ origen: "rol" }), "rol");
  assert.equal(puertaDe({ origen: "nova" }), "control");
  assert.equal(puertaDe({ origen: "manual" }, { odc: [6] }), "odc");
});

test("la traza se lee en una línea: TR, orden, caja y planilla", () => {
  const t = traza({ tr: 66, leadId: 15, odc: [12], caja: { id: 9, nombre: "Lizeth DLC" }, planilla: { numero: 2, nombre: "Planilla N°2", estado: "abierta" }, puerta: "odc" });
  assert.equal(trazaEnTexto(t), "PR15-TR66 · ODC12 · CC9 Lizeth · PL2");
  assert.equal(origenEnTexto(t), "ODC12 · CC9");
  assert.deepEqual(partesDeLaTraza(t).map(p => p.clave), ["tr", "odc", "cc", "pl"]);
});

test("sin la 202 la traza sale sin TR, con lo demás", () => {
  const t = traza({ tr: undefined, leadId: 15, caja: { id: 8, nombre: "Carlos German" }, planilla: { numero: 1 }, puerta: "cc" });
  assert.equal(trazaEnTexto(t), "CC8 Carlos · PL1");
});

test("el rol y lo cargado directo en el control dicen su puerta", () => {
  assert.equal(trazaEnTexto(traza({ tr: 90, leadId: 15, planilla: { numero: 2 }, puerta: "rol" })), "PR15-TR90 · ROL · PL2");
  assert.equal(origenEnTexto(traza({ tr: 91, leadId: 15, puerta: "control" })), "CONTROL");
  assert.equal(trazaEnTexto(traza({ tr: 300, caja: { id: 5, nombre: "PABLO GUERRERO" }, puerta: "cc" })), "TR300 · CC5 PABLO");
});

test("el buscador entiende los códigos como se escriben", () => {
  assert.deepEqual(codigosEnLaBusqueda("tr52"), { tr: 52, resto: "" });
  assert.deepEqual(codigosEnLaBusqueda("PR15-TR52"), { pr: 15, tr: 52, resto: "" });
  assert.deepEqual(codigosEnLaBusqueda("TR 52"), { tr: 52, resto: "" });
  assert.deepEqual(codigosEnLaBusqueda("odc6"), { odc: 6, resto: "" });
  assert.deepEqual(codigosEnLaBusqueda("pases CC9"), { cc: 9, resto: "pases" });
  assert.deepEqual(codigosEnLaBusqueda("pl2 cemento"), { pl: 2, resto: "cemento" });
});

test("lo que no es un código se busca como siempre", () => {
  assert.equal(codigosEnLaBusqueda("disensa cemento"), null);
  assert.equal(codigosEnLaBusqueda("0992345678001"), null);
  assert.equal(codigosEnLaBusqueda("001-002-000004518"), null);
  assert.equal(codigosEnLaBusqueda("control"), null);
  assert.equal(codigosEnLaBusqueda("electrodo"), null);
  assert.equal(codigosEnLaBusqueda(""), null);
});

test("coincide solo si todos los códigos escritos coinciden", () => {
  const t = traza({ tr: 66, leadId: 15, odc: [12], caja: { id: 9 }, planilla: { numero: 2 } });
  assert.equal(esLaBuscada(t, { tr: 66 }), true);
  assert.equal(esLaBuscada(t, { tr: 67 }), false);
  assert.equal(esLaBuscada(t, { odc: 12, pl: 2 }), true);
  assert.equal(esLaBuscada(t, { odc: 12, pl: 1 }), false);
  assert.equal(esLaBuscada(t, { pr: 16, tr: 66 }), false);
  assert.equal(esLaBuscada(t, { cc: 9 }), true);
  assert.equal(esLaBuscada(null, { tr: 66 }), false);
});

test("buscar una TR que se unió a otra lleva a la que quedó", () => {
  const t = traza({ tr: 340, leadId: 15 });
  assert.equal(esLaBuscada(t, { tr: 341 }, { 341: 340 }), true);
  assert.equal(esLaBuscada(t, { tr: 341 }, {}), false);
});
