import test from "node:test";
import assert from "node:assert/strict";
import { vigenciaDe, plazosQueAvisan, tienePlazo } from "../src/modules/controlObra/vigenciaDeOrden.js";

const HOY = "2026-10-29";
// El alquiler del generador de Plaza Lagos: quince días desde el 20.
const generador = { id: 8, cubre_que: "el alquiler del generador 20KVA", cubre_desde: "2026-10-20", cubre_hasta: "2026-11-03" };

test("una orden sin plazo no avisa nada", () => {
  assert.equal(vigenciaDe({ id: 1 }, HOY), null);
  assert.equal(tienePlazo({ id: 1 }), false);
});

test("quince días son quince, contando los dos extremos", () => {
  assert.equal(vigenciaDe(generador, HOY).cuantos, 15);
});

test("faltando una semana no molesta", () => {
  const v = vigenciaDe(generador, HOY);
  assert.equal(v.faltan, 5);
  assert.equal(v.avisa, false);
  assert.match(v.texto, /cubierto hasta el 2026-11-03/);
});

test("tres días antes avisa, para poder devolverlo o pedir la extensión", () => {
  const v = vigenciaDe(generador, "2026-11-01");
  assert.equal(v.porVencer, true);
  assert.equal(v.vencida, false);
  assert.equal(v.texto, "el alquiler del generador 20KVA vence en 2 días");
});

test("el último día dice hoy", () => {
  assert.equal(vigenciaDe(generador, "2026-11-03").texto, "el alquiler del generador 20KVA vence hoy");
});

test("pasado el plazo cuenta los días de más: eso es plata que ya salió", () => {
  const v = vigenciaDe(generador, "2026-11-10");
  assert.equal(v.vencida, true);
  assert.equal(v.faltan, -7);
  assert.equal(v.texto, "el alquiler del generador 20KVA se pasó 7 días de lo que cubre esta orden");
});

test("devuelto el equipo, deja de avisar sin borrar las fechas", () => {
  assert.equal(vigenciaDe({ ...generador, cubre_cerrado_at: "2026-11-04T10:00:00Z" }, "2026-11-10"), null);
});

test("una orden anulada no avisa de un alquiler que no existe", () => {
  assert.equal(vigenciaDe({ ...generador, anulada: true }, "2026-11-10"), null);
});

test("primero la más vencida, después la que está por vencer", () => {
  const otra = { id: 9, cubre_que: "el andamio", cubre_hasta: "2026-10-31" };
  const lista = plazosQueAvisan([generador, otra, { id: 10 }], "2026-11-05");
  assert.deepEqual(lista.map(x => x.orden.id), [9, 8]);
  assert.equal(lista[0].v.faltan, -5);
});

test("sin nombre de lo alquilado igual se entiende", () => {
  assert.match(vigenciaDe({ cubre_hasta: "2026-10-20" }, HOY).texto, /^lo cotizado se pasó 9 días/);
});
