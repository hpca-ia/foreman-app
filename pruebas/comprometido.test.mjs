import test from "node:test";
import assert from "node:assert/strict";
import { comprometidoPorGrupo, montoDeSolicitud, solicitudesDeLaObra } from "../src/modules/controlObra/calculos.js";

// Cuánta plata hay hablada contra la obra. Todo lo de acá salió de un número
// que apareció mal en el control de una obra de verdad.

const pedido = (estado, estimado, extra = {}) =>
  ({ id: Math.random(), estado, monto_estimado: estimado, ...extra });

test("comprometido es lo pedido y lo aprobado, nada más", () => {
  const c = comprometidoPorGrupo([
    pedido("pendiente_aprobacion", 100),
    pedido("aprobada", 200),
    pedido("comprada", 300),
    pedido("requiere_info", 400),
    pedido("borrador", 500),
    pedido("anulada", 600),
  ], [], []);
  assert.equal(c.total, 300);
});

test("LO DEVUELTO NO ESTÁ COMPROMETIDO: nadie lo aprobó", () => {
  // Contarlo infló el comprometido con pedidos rechazados, y peor: una
  // devuelta que nadie arregla queda viva para siempre, así que el número no
  // bajaba a cero nunca.
  const c = comprometidoPorGrupo([pedido("requiere_info", 1500)], [], []);
  assert.equal(c.total, 0);
  assert.equal(c.devuelto, 1500, "pero se cuenta aparte: es una tarea sin dueño");
});

test("al comprar sale del comprometido sin que nadie enganche nada", () => {
  const antes = comprometidoPorGrupo([pedido("aprobada", 575)], [], []);
  const despues = comprometidoPorGrupo([pedido("comprada", 575)], [], []);
  assert.equal(antes.total, 575);
  assert.equal(despues.total, 0);
  assert.equal(despues.comprado, 575, "pasa al cajón de comprado sin factura");
});

test("con factura no está en ningún cajón: ya es gasto planillado", () => {
  const c = comprometidoPorGrupo([pedido("comprada", 575, { factura_id: 9 })], [], []);
  assert.equal(c.total + c.comprado + c.devuelto, 0);
});

test("CADA ESTADO CAE EN UN SOLO CAJÓN, nunca en dos", () => {
  // La regla que pidió Hernán: la misma plata no puede estar comprometida y
  // planillada a la vez, porque el control la contaría dos veces.
  for (const e of ["pendiente_aprobacion", "aprobada", "comprada", "recibida", "requiere_info"]) {
    const c = comprometidoPorGrupo([pedido(e, 1000)], [], []);
    const cajones = [c.total > 0, c.comprado > 0, c.devuelto > 0].filter(Boolean).length;
    assert.equal(cajones, 1, `"${e}" cayó en ${cajones} cajones`);
  }
});

test("lo asignado a una agrupación va al bloque de gasto sin presupuesto", () => {
  // Vivienda y oficina no son capítulos del contrato porque no están
  // contratados. Antes caían en "SIN CAPÍTULO", que no tiene fila: sumaban en
  // el total y no aparecían en ningún renglón.
  const c = comprometidoPorGrupo([pedido("aprobada", 575, { obra_actividad_id: 4 })], [], []);
  assert.equal(c.porCapitulo["GASTOS SIN PRESUPUESTO"], 575);
  assert.equal(c.porActividad.a4, 575);
});

test("EL DOCUMENTO LE GANA AL ESTIMADO", () => {
  // `monto` solo se escribe al ELEGIR una proforma, y casi nadie elige: se
  // suben dos o tres y ahí queda. El pedido valía cero con su precio adentro
  // de un papel subido.
  const proformas = [{ id: 11, solicitud_id: 8, monto: 575 }];
  assert.deepEqual(
    montoDeSolicitud({ id: 8, monto: null, monto_estimado: null }, proformas),
    { monto: 575, de: "su única proforma" });
});

test("lo acordado le gana a la proforma, y la elegida a las demás", () => {
  const p = [{ id: 1, solicitud_id: 9, monto: 900 }, { id: 2, solicitud_id: 9, monto: 750 }];
  assert.equal(montoDeSolicitud({ id: 9, monto: 600 }, p).monto, 600);
  assert.equal(montoDeSolicitud({ id: 9, proforma_id: 1 }, p).monto, 900);
});

test("NUNCA suma las proformas: son alternativas, no partes de un total", () => {
  const p = [{ id: 1, solicitud_id: 9, monto: 900 }, { id: 2, solicitud_id: 9, monto: 750 }];
  const r = montoDeSolicitud({ id: 9 }, p);
  assert.notEqual(r.monto, 1650);
  assert.equal(r.monto, 750, "con varias sin elegir, la cota baja honesta");
});

test("sin ningún número dice que no hay monto, no que valga cero", () => {
  // Para un control, "no cuesta nada" y "no se sabe cuánto cuesta" son cosas
  // opuestas.
  assert.equal(montoDeSolicitud({ id: 1 }, []).de, "sin monto");
});

test("un pedido es de la obra si apunta a ella, o si no apunta a ninguna y es de su proyecto", () => {
  // Las dos consultas iban en cadena con un `return` en el medio: con que UN
  // pedido tuviera obra_id, los que colgaban del proyecto no se buscaban
  // nunca. El control veía un pedido de tres.
  const obra = { id: 7, lead_id: 42 };
  const filas = [
    { id: 1, obra_id: 7, lead_id: 42 },
    { id: 2, obra_id: null, lead_id: 42 },
    { id: 3, obra_id: 9, lead_id: 42 },     // de otra obra del mismo proyecto
    { id: 4, obra_id: null, lead_id: 99 },  // de otro proyecto
  ];
  assert.deepEqual(solicitudesDeLaObra(filas, obra).map(s => s.id), [1, 2]);
});

test("los ids se comparan como números, no como texto", () => {
  // PostgREST puede devolver un bigint como texto, y "7" === 7 es falso:
  // alcanzaba eso para que un pedido no se reconociera como de su obra.
  assert.equal(solicitudesDeLaObra([{ id: 1, obra_id: "7", lead_id: 42 }], { id: 7, lead_id: 42 }).length, 1);
});
