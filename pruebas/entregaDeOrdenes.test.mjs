import { test } from "node:test";
import assert from "node:assert/strict";
import { sinConfirmar, porConfirmar, leReboto, claveDelEnvio, DIAS_QUE_SE_PREGUNTA }
  from "../src/modules/controlObra/entregaDeOrdenes.js";

// ── ¿LE LLEGÓ EL CORREO DE LA ORDEN DE CAMBIO? ─────────────────────────────
//
// Las órdenes guardaban el "sent" del momento de mandar y no volvían a
// preguntar: una que el servidor del cliente rechazó se veía igual que una
// entregada. Once envíos en la base, los once en "sent".

const AHORA = Date.parse("2026-11-10T22:00:00Z");
const hace = dias => new Date(AHORA - dias * 86400000).toISOString();
const firma = (id, extra = {}) => ({ id, envio_id: `correo-${id}`, envio_at: hace(1), envio_estado: "sent", aprobado_at: null, observacion: null, ...extra });

test("se vuelve a preguntar por lo que quedó en «sent»: entró el pedido, no se sabe si llegó", () => {
  assert.equal(sinConfirmar(firma(1), AHORA), true);
  assert.equal(sinConfirmar(firma(1, { envio_estado: "queued" }), AHORA), true);
  assert.equal(sinConfirmar(firma(1, { envio_estado: null }), AHORA), true);
  assert.equal(sinConfirmar(firma(1, { envio_estado: " SENT " }), AHORA), true);
});

test("lo que ya llegó, lo que ya rebotó y lo que ya contestaron no se vuelve a preguntar", () => {
  for (const e of ["delivered", "opened", "clicked", "bounced", "complained", "failed", "canceled", "Delivered"]) {
    assert.equal(sinConfirmar(firma(1, { envio_estado: e }), AHORA), false, e);
  }
  // Si aprobó u objetó, le llegó: no hay nada que averiguar.
  assert.equal(sinConfirmar(firma(1, { aprobado_at: hace(0) }), AHORA), false);
  assert.equal(sinConfirmar(firma(1, { observacion: "El precio no es ese" }), AHORA), false);
  assert.equal(sinConfirmar(firma(1, { observacion: "   " }), AHORA), true);
});

test("lo que no salió, o salió sin identificador, no tiene por qué preguntar", () => {
  assert.equal(sinConfirmar(firma(1, { envio_id: null }), AHORA), false);
  assert.equal(sinConfirmar(firma(1, { envio_at: null }), AHORA), false);
  assert.equal(sinConfirmar(null, AHORA), false);
  assert.equal(sinConfirmar(firma(1, { envio_at: "no es una fecha" }), AHORA), false);
});

test("pasada una semana ya no se pregunta: el servidor de correo no guarda el registro", () => {
  assert.equal(sinConfirmar(firma(1, { envio_at: hace(DIAS_QUE_SE_PREGUNTA - 0.5) }), AHORA), true);
  assert.equal(sinConfirmar(firma(1, { envio_at: hace(DIAS_QUE_SE_PREGUNTA + 0.5) }), AHORA), false);
});

test("se pregunta por orden, una sola vez por envío; si se reenvía, se vuelve a preguntar", () => {
  const porOrden = {
    13: [firma(1), firma(2, { envio_estado: "delivered" })],
    9: [firma(3, { aprobado_at: hace(2) })],
    7: [firma(4), firma(5)],
  };
  const ya = new Set();
  const primera = porConfirmar(porOrden, ya, AHORA);
  assert.deepEqual(primera.ordenes.sort((a, b) => a - b), [7, 13]);
  assert.deepEqual(primera.claves.sort(), ["1:correo-1", "4:correo-4", "5:correo-5"]);
  primera.claves.forEach(k => ya.add(k));
  // La pantalla se recarga después de cada cosa que se hace: no vuelve a preguntar.
  assert.deepEqual(porConfirmar(porOrden, ya, AHORA), { ordenes: [], claves: [] });
  // Se le insiste a uno: es otro correo, con otro identificador.
  porOrden[7][0] = firma(4, { envio_id: "correo-4-bis" });
  assert.deepEqual(porConfirmar(porOrden, ya, AHORA), { ordenes: [7], claves: ["4:correo-4-bis"] });
  assert.equal(claveDelEnvio(firma(4)), "4:correo-4");
  assert.deepEqual(porConfirmar(), { ordenes: [], claves: [] });
});

test("rebotó es rebotado, quejado o fallado, mientras no haya aprobado por otro lado", () => {
  assert.equal(leReboto(firma(1, { envio_estado: "bounced" })), true);
  assert.equal(leReboto(firma(1, { envio_estado: "complained" })), true);
  assert.equal(leReboto(firma(1, { envio_estado: "failed" })), true);
  assert.equal(leReboto(firma(1, { envio_estado: "bounced", aprobado_at: hace(0) })), false);
  assert.equal(leReboto(firma(1)), false);
});

// ── LA COPIA DEL SERVIDOR ──────────────────────────────────────────────────

test("el servidor decide igual que la oficina a quién preguntarle, caso por caso", async () => {
  const api = await import("../api/_entregaDeOrdenes.js");
  const casos = [];
  for (const envio_estado of ["sent", "queued", null, "delivered", "opened", "clicked", "bounced", "complained", "failed", "canceled", " SENT "])
    for (const envio_at of [hace(0.1), hace(6.9), hace(7.1), null, "x"])
      for (const envio_id of ["c1", null])
        for (const aprobado_at of [null, hace(0)])
          for (const observacion of [null, "", "  ", "No"]) casos.push({ id: 1, envio_estado, envio_at, envio_id, aprobado_at, observacion });
  for (const c of casos) {
    assert.equal(api.sinConfirmar(c, AHORA), sinConfirmar(c, AHORA), JSON.stringify(c));
    assert.equal(api.leReboto(c), leReboto(c), JSON.stringify(c));
  }
  assert.equal(casos.length, 11 * 5 * 2 * 2 * 4);
});

// ── LA PUERTA, ENTERA ──────────────────────────────────────────────────────
//
// Se levanta el aviso de órdenes de verdad contra una base y un servidor de
// correo de mentira —nada sale a la red— y se le pide que revise.

process.env.SUPABASE_URL = "http://base.prueba.invalid";
process.env.SUPABASE_SECRET_KEY = "llave-de-prueba";
process.env.RESEND_API_KEY = "llave-de-prueba";

async function revisar(firmas, estados, cuerpo) {
  const b = { firmas: firmas.map(f => ({ ...f })), preguntas: [], escrituras: [] };
  const responder = (datos, status = 200) => new Response(datos === null ? null : JSON.stringify(datos), { status });
  const antes = globalThis.fetch;
  globalThis.fetch = async (url, op = {}) => {
    const u = new URL(url);
    if (u.hostname === "api.resend.com") {
      const id = u.pathname.replace("/emails/", "");
      b.preguntas.push(id);
      return estados[id] === undefined ? responder({ message: "no existe" }, 404) : responder({ last_event: estados[id] });
    }
    assert.equal(u.hostname, "base.prueba.invalid", `la prueba no puede salir a ${u.hostname}`);
    assert.equal(u.pathname, "/rest/v1/orden_cambio_aprobaciones");
    if ((op.method || "GET") === "PATCH") {
      const id = Number(u.searchParams.get("id").replace("eq.", ""));
      const cambios = JSON.parse(op.body);
      Object.assign(b.firmas.find(f => f.id === id), cambios);
      b.escrituras.push({ id, ...cambios });
      return responder(null, 204);
    }
    const ids = u.searchParams.get("orden_id").replace("in.(", "").replace(")", "").split(",").map(Number);
    assert.equal(u.searchParams.get("envio_id"), "not.is.null");
    return responder(b.firmas.filter(f => ids.includes(f.orden_id) && f.envio_id));
  };
  const res = { codigo: 200, cuerpo: null, status(c) { res.codigo = c; return res; }, json(d) { res.cuerpo = d; return res; } };
  try {
    const { default: aviso } = await import("../api/_aviso-orden.js");
    await aviso({ method: "POST", query: { de: "orden" }, headers: {}, body: cuerpo }, res);
  } finally { globalThis.fetch = antes; }
  return { ...b, res };
}

const reciente = () => new Date(Date.now() - 3600000).toISOString();

test("al revisar, el que rebotó queda como rebotado y se avisa con nombre; el que llegó, como entregado", async () => {
  const firmas = [
    { id: 1, orden_id: 13, nombre: "Nathalie", email: "n@cliente.test", envio_id: "c1", envio_estado: "sent", envio_at: reciente() },
    { id: 2, orden_id: 13, nombre: "Gerente", email: "mal@cliente.test", envio_id: "c2", envio_estado: "sent", envio_at: reciente() },
    { id: 3, orden_id: 13, nombre: "Ya firmó", email: "f@cliente.test", envio_id: "c3", envio_estado: "sent", envio_at: reciente(), aprobado_at: reciente() },
    { id: 4, orden_id: 13, nombre: "Ya se sabía", email: "s@cliente.test", envio_id: "c4", envio_estado: "delivered", envio_at: reciente() },
    { id: 5, orden_id: 99, nombre: "De otra obra", email: "o@otro.test", envio_id: "c5", envio_estado: "sent", envio_at: reciente() },
  ];
  const r = await revisar(firmas, { c1: "delivered", c2: "bounced", c3: "delivered", c4: "opened", c5: "bounced" }, { revisar: true, orden_ids: [13] });
  assert.equal(r.res.codigo, 200);
  // Solo se preguntó por los dos de los que no se sabía, y solo de esa orden.
  assert.deepEqual(r.preguntas, ["c1", "c2"]);
  assert.deepEqual(r.escrituras, [{ id: 1, envio_estado: "delivered" }, { id: 2, envio_estado: "bounced" }]);
  assert.deepEqual(r.res.cuerpo, { revisados: 2, cambiaron: 2, rebotaron: [{ orden_id: 13, nombre: "Gerente", email: "mal@cliente.test" }] });
});

test("si el servidor de correo no sabe o sigue igual, no se toca nada y no se inventa una entrega", async () => {
  const firmas = [
    { id: 1, orden_id: 7, nombre: "A", email: "a@c.test", envio_id: "viejo", envio_estado: "sent", envio_at: reciente() },
    { id: 2, orden_id: 7, nombre: "B", email: "b@c.test", envio_id: "igual", envio_estado: "sent", envio_at: reciente() },
  ];
  const r = await revisar(firmas, { igual: "sent" }, { revisar: true, orden_ids: ["7", "7", "x", -1] });
  assert.deepEqual(r.preguntas, ["viejo", "igual"]);
  assert.deepEqual(r.escrituras, []);
  assert.deepEqual(r.res.cuerpo, { revisados: 2, cambiaron: 0, rebotaron: [] });
});

test("sin órdenes por las que preguntar contesta que faltan, y no manda ningún correo", async () => {
  const r = await revisar([], {}, { revisar: true, orden_ids: [] });
  assert.equal(r.res.codigo, 400);
  assert.deepEqual(r.preguntas, []);
});
