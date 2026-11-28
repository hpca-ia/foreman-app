// Lo que le falta a una compra ya hecha: la factura, una devolución.
//
// Hernán, 28/11/2026: «aún no me llega la factura... que salga que tiene algo
// pendiente... resuelto a mano, pero que se haya leído y registrado con NOVA».
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  faltaElPapel, puedeResolver, queHacerConLaFactura, abiertos, loLeido, lineaAlDejar, lineaAlResolver, aQuienSeLePuede,
} from "../src/modules/compras/pendientes.js";

// La N° 6 tal como estaba en la base el 28/11.
const N6 = { id: 6, estado: "recibida", lead_id: 15, factura_id: 52, solicitante_id: 2 };
const F52 = { id: 52, clase: "factura", numero_factura: null, archivo_url: null, total: 184.92 };

test("la N° 6: recibida, con «factura» sin papel ni número → FOREMAN lo dice solo", () => {
  assert.equal(faltaElPapel(N6, F52), "La factura del control no tiene papel");
  assert.equal(faltaElPapel(N6, { ...F52, archivo_url: "obra-13/x.pdf" }), "La factura del control no tiene número");
});

test("comprada sin documento en el control: falta la factura", () => {
  assert.equal(faltaElPapel({ ...N6, estado: "comprada", factura_id: null }), "Sin factura en el control");
});

test("lo que no se marca: aprobada, de oficina, un recibo sin número, un anticipo, factura completa", () => {
  assert.equal(faltaElPapel({ ...N6, estado: "aprobada", factura_id: null }), null);
  assert.equal(faltaElPapel({ ...N6, lead_id: null, factura_id: null }), null);
  assert.equal(faltaElPapel(N6, { clase: "recibo", archivo_url: "a.pdf", numero_factura: null }), null);
  assert.equal(faltaElPapel(N6, { clase: "anticipo", archivo_url: "a.pdf" }), null);
  assert.equal(faltaElPapel(N6, { clase: "factura", archivo_url: "a.pdf", numero_factura: "001-001-1" }), null);
  // No se sabe cómo es la factura: no se inventa un aviso.
  assert.equal(faltaElPapel(N6, null), null);
});

test("de factura: no se resuelve sin el papel leído por NOVA ni sin quedar en el control", () => {
  const p = { tipo: "factura" };
  assert.equal(puedeResolver(p).ok, false);
  assert.match(puedeResolver(p).porque, /NOVA/);
  assert.equal(puedeResolver({ ...p, doc_leido_at: "2026-11-28" }).ok, false);
  assert.equal(puedeResolver({ ...p, doc_leido_at: "2026-11-28", factura_id: 52, doc_leido: { monto: 184.92 } }, F52).ok, true);
});

test("de factura: si el papel y el control dicen montos distintos, no se cierra", () => {
  const r = puedeResolver({ tipo: "factura", doc_leido_at: "x", factura_id: 52, doc_leido: { monto: 200 } }, F52);
  assert.equal(r.ok, false);
  assert.match(r.porque, /\$200\.00.*\$184\.92/);
});

test("devolución: con el papel leído, sí; sin él, no. Otro: a mano", () => {
  assert.equal(puedeResolver({ tipo: "devolucion" }).ok, false);
  assert.equal(puedeResolver({ tipo: "devolucion", doc_leido_at: "x" }).ok, true);
  assert.equal(puedeResolver({ tipo: "otro" }).ok, true);
  assert.equal(puedeResolver({ tipo: "otro", resuelto_at: "x" }).ok, false);
});

test("la factura leída: a la N° 6 se le completa la que tiene; sin documento, entra nueva", () => {
  const leido = { clase: "factura", numero: "001-001-000000123", monto: 184.92 };
  assert.deepEqual(queHacerConLaFactura(leido, F52), { accion: "completar" });
  assert.deepEqual(queHacerConLaFactura(leido, null), { accion: "nueva" });
});

test("la factura leída: proforma, sin total, monto distinto, anticipo u otra factura ya cargada → no", () => {
  assert.match(queHacerConLaFactura({ clase: "proforma", monto: 10 }, null).error, /proforma/);
  assert.match(queHacerConLaFactura({ clase: "factura", monto: null }, null).error, /total/);
  assert.match(queHacerConLaFactura({ clase: "factura", monto: 190 }, F52).error, /\$190\.00/);
  assert.match(queHacerConLaFactura({ clase: "factura", monto: 10 }, { clase: "anticipo", total: 10 }).error, /anticipo/);
  const completa = { ...F52, archivo_url: "a.pdf", numero_factura: "001-001-000000123" };
  assert.deepEqual(queHacerConLaFactura({ clase: "factura", numero: "001-001-123".replace("123", "000000123"), monto: 184.92 }, completa), { accion: "misma" });
  assert.match(queHacerConLaFactura({ clase: "factura", numero: "002-001-9", monto: 184.92 }, completa).error, /ya tiene la factura/);
});

test("abiertos, en orden; lo leído sin renglones; las líneas del historial", () => {
  const ps = [{ id: 2, created_at: "2026-11-28T10" }, { id: 1, created_at: "2026-11-27T10" }, { id: 3, created_at: "2026-11-26", resuelto_at: "x" }];
  assert.deepEqual(abiertos(ps).map(p => p.id), [1, 2]);
  assert.deepEqual(loLeido({ numero: "1", items: [1], error: null }), { numero: "1" });
  assert.equal(lineaAlDejar({ tipo: "factura", para_nombre: "Johanna", texto: " No llega " }), "Pendiente · Falta la factura · para Johanna: No llega");
  assert.equal(lineaAlResolver({ tipo: "devolucion" }, ""), "Resuelto · Devolución");
});

test("a quién se le puede encargar: quien la pidió, después los residentes, después el resto", () => {
  const us = [
    { id: 1, name: "Hernan" }, { id: 2, name: "Johanna" }, { id: 5, name: "Lizeth" },
    { id: 6, name: "Estefania" }, { id: 9, name: "Inactivo", activo: false },
  ];
  assert.deepEqual(aQuienSeLePuede(us, { solicitud: N6, residentesIds: [5, 6] }).map(u => u.id), [2, 6, 5, 1]);
});

test("la regla de la base es la misma: sin NOVA no se resuelve uno de factura ni de devolución", () => {
  const sql = readFileSync(new URL("../supabase/migrations/200_pendientes_de_compra.sql", import.meta.url), "utf8");
  assert.match(sql, /tipo = 'otro'\s*or \(doc_leido_at is not null and \(tipo <> 'factura' or factura_id is not null\)\)/);
});

test("de factura: si se leyó con NOVA en el control —papel y número—, también se puede cerrar", () => {
  const p = { tipo: "factura" };
  const leida = { ...F52, origen: "nova", archivo_url: "obra-13/f.pdf", numero_factura: "001-001-9" };
  assert.deepEqual(puedeResolver(p, leida), { ok: true, desdeElControl: true });
  // A mano, aunque tenga papel y número, no.
  assert.equal(puedeResolver(p, { ...leida, origen: "manual" }).ok, false);
});
