import test from "node:test";
import assert from "node:assert/strict";
import { pendientes, pendienteDe, resumenPendientes, comoSeDice, diasEntre }
  from "../src/modules/controlObra/aprobacionesPendientes.js";

const HOY = "2026-10-29";

// El caso real: tres órdenes mandadas, una firmada, una que nadie abrió y una
// con el plazo vencido.
const firmada = { id: 1, numero: 1, estado: "aprobada", monto: 5000, enviada_at: "2026-10-01" };
const esperando = { id: 2, numero: 2, estado: "enviada", monto: 18406, enviada_at: "2026-10-09" };
const vencida = { id: 3, numero: 3, estado: "enviada", monto: 2300, enviada_at: "2026-10-20", fecha_limite_aprobacion: "2026-10-25" };
const sinMandar = { id: 4, numero: 4, estado: "borrador", monto: 900, fecha: "2026-09-15" };

const porOrden = {
  1: [{ email: "a@x.com", nombre: "Ana", aprobado_at: "2026-10-03", envio_at: "2026-10-01" }],
  2: [
    { email: "f@x.com", nombre: "Fiscalización", envio_at: "2026-10-09", visto_at: "2026-10-09" },
    { email: "c@x.com", nombre: "Cliente", envio_at: "2026-10-09", aprobado_at: "2026-10-10" },
  ],
  3: [{ email: "c@x.com", nombre: "Cliente", envio_at: "2026-10-20" }],
  4: [],
};

test("una orden aprobada no está esperando a nadie", () => {
  const lista = pendientes([firmada], porOrden, HOY);
  assert.equal(lista.length, 0);
});

test("falta uno de dos firmantes: la orden sigue esperando", () => {
  const p = pendienteDe(esperando, porOrden[2], HOY);
  assert.equal(p.firmaron.length, 1);
  assert.equal(p.faltan.length, 1);
  assert.equal(p.faltan[0].nombre, "Fiscalización");
  assert.equal(p.dias, 20);
});

test("la espera se cuenta desde el envío, no desde la orden", () => {
  const p = pendienteDe({ ...esperando, fecha: "2026-01-01" }, porOrden[2], HOY);
  assert.equal(p.dias, 20);
});

test("una orden que nunca salió no es una demora del cliente", () => {
  const p = pendienteDe(sinMandar, [], HOY);
  assert.equal(p.seMando, false);
  assert.equal(comoSeDice(p), "Nunca se mandó");
});

test("el plazo vencido va primero, por encima de la que lleva más días", () => {
  const lista = pendientes([esperando, vencida], porOrden, HOY);
  assert.equal(lista[0].orden.id, 3);
  assert.equal(lista[0].vencida, true);
  assert.equal(lista[1].orden.id, 2);
});

test("una objeción escrita también traba la orden, y se dice con nombre", () => {
  const p = pendienteDe(vencida, [{ email: "c@x.com", nombre: "Cliente", envio_at: "2026-10-20", observacion: "el precio no es ese" }], HOY);
  assert.equal(p.trabada, true);
  assert.equal(comoSeDice(p), "Objetada por Cliente");
});

test("el titular suma la plata parada y los días de la más vieja", () => {
  const r = resumenPendientes(pendientes([firmada, esperando, vencida, sinMandar], porOrden, HOY));
  assert.equal(r.cuantas, 3);
  assert.equal(r.monto, 18406 + 2300 + 900);
  assert.equal(r.dias, 44);
  assert.equal(r.vencidas, 1);
  assert.equal(r.sinMandar, 1);
});

test("los días no cuentan horas ni dan negativo", () => {
  assert.equal(diasEntre("2026-10-20T23:00:00Z", "2026-10-29"), 9);
  assert.equal(diasEntre("2026-11-05", "2026-10-29"), 0);
});

test("una fecha que llega como Date da el mismo día que el texto", () => {
  // Según de dónde venga, la misma fecha es "2026-10-20T22:45:39.538Z" o un
  // Date. String(new Date()) da "Thu Oct 29 2026…", y cortarle diez letras
  // devuelve "Thu Oct 2" — que termina en la pantalla como "NaN días".
  assert.equal(diasEntre(new Date("2026-10-20T22:45:39.538Z"), HOY), 9);
  assert.equal(diasEntre("2026-10-20T22:45:39.538Z", HOY), 9);
});

test("una orden sin ninguna fecha no dice NaN", () => {
  const p = pendienteDe({ id: 1, estado: "enviada" }, [{ email: "a@x.com" }], HOY);
  assert.equal(p.dias, 0);
  assert.ok(!String(comoSeDice(p)).includes("NaN"));
});
