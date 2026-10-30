import test from "node:test";
import assert from "node:assert/strict";
import { sePuedeAnotar, permisoVigente, pedidosAbiertos, cuantosDias } from "../src/modules/manoDeObra/permisoDeDias.js";

const HOY = "2026-10-28";   // un miércoles de cierre de mes

test("lo que ya pasó se anota siempre, sin pedirle permiso a nadie", () => {
  assert.equal(sePuedeAnotar("2026-10-27", [], HOY).sePuede, true);
  assert.equal(sePuedeAnotar(HOY, [], HOY).sePuede, true);
});

test("un día que no pasó no se anota: la asistencia es una firma", () => {
  const r = sePuedeAnotar("2026-10-30", [], HOY);
  assert.equal(r.sePuede, false);
  assert.equal(r.futuro, true);
  assert.match(r.porQue, /permiso del gerente o del Director/);
});

test("con el permiso dado, hasta donde llega el permiso", () => {
  const permisos = [{ estado: "dado", hasta: "2026-10-31", dado_nombre: "Hernán Cueva" }];
  assert.equal(sePuedeAnotar("2026-10-30", permisos, HOY).sePuede, true);
  assert.match(sePuedeAnotar("2026-10-30", permisos, HOY).porQue, /Autorizado por Hernán Cueva/);
  // Y ni un día más: un permiso que se estira solo no es un permiso.
  const r = sePuedeAnotar("2026-11-01", permisos, HOY);
  assert.equal(r.sePuede, false);
  assert.match(r.porQue, /llega hasta el 2026-10-31/);
});

test("un permiso pedido y todavía no dado no autoriza nada", () => {
  const permisos = [{ estado: "pedido", hasta: "2026-10-31" }];
  assert.equal(sePuedeAnotar("2026-10-30", permisos, HOY).sePuede, false);
  assert.equal(pedidosAbiertos(permisos).length, 1);
});

test("un permiso negado tampoco, y uno vencido deja de valer solo", () => {
  assert.equal(sePuedeAnotar("2026-10-30", [{ estado: "negado", hasta: "2026-10-31" }], HOY).sePuede, false);
  // Vencido: su 'hasta' ya pasó. Nadie tiene que acordarse de quitarlo.
  assert.equal(permisoVigente([{ estado: "dado", hasta: "2026-10-20" }], HOY), null);
});

test("entre dos permisos vale el que llega más lejos", () => {
  const permisos = [
    { estado: "dado", hasta: "2026-10-29" },
    { estado: "dado", hasta: "2026-10-31" },
  ];
  assert.equal(permisoVigente(permisos, HOY).hasta, "2026-10-31");
  assert.equal(sePuedeAnotar("2026-10-31", permisos, HOY).sePuede, true);
});

test("cuántos días se están pidiendo, para poder decirlo al autorizar", () => {
  assert.equal(cuantosDias("2026-10-31", HOY), 3);
  assert.equal(cuantosDias("2026-10-28", HOY), 0);
  assert.equal(cuantosDias("2026-10-20", HOY), 0);
});
