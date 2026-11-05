import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLASES, claseDePartida, claseDelHallazgo, adicionesPorClase, rubroDeLaPartida, contratadoDe,
} from "../src/modules/controlObra/clasesDePartida.js";
import { partidasParaOrden } from "../src/modules/controlObra/extraParaCobrar.js";

// ── TRABAJO NUEVO, MÁS CANTIDAD, MENOS CANTIDAD ────────────────────────────
//
// Tres conversaciones distintas con el cliente dentro de la misma orden. La
// orden solo decía ADICIONES y REDUCCIONES, y lo nuevo salía mezclado con lo
// que es más de un rubro que ya tiene precio firmado.

test("lo que resta es una reducción, diga lo que diga su clase guardada", () => {
  assert.equal(claseDePartida({ tipo: "quita", obra_rubro_id: 5 }), "menos");
  assert.equal(claseDePartida({ tipo: "quita", clase: "nuevo" }), "menos");
});

test("la clase guardada manda sobre la deducida", () => {
  // Un precio más caro que se le cobra al cliente apunta a su rubro, pero es
  // un cambio de especificación: va con lo nuevo.
  assert.equal(claseDePartida({ tipo: "aumenta", clase: "nuevo", obra_rubro_id: 106, rubro_codigo: "106" }), "nuevo");
  assert.equal(claseDePartida({ tipo: "aumenta", clase: "mas" }), "mas");
});

test("sin clase guardada se deduce: una adición que apunta a un rubro es más de ese rubro", () => {
  assert.equal(claseDePartida({ tipo: "aumenta", obra_rubro_id: 103 }), "mas");
  assert.equal(claseDePartida({ tipo: "aumenta", rubro_codigo: "4.12" }), "mas");
  assert.equal(claseDePartida({ tipo: "aumenta", rubro_codigo: "  " }), "nuevo");
  assert.equal(claseDePartida({ tipo: "aumenta" }), "nuevo");
  assert.equal(claseDePartida({ tipo: "aumenta", clase: "cualquiera" }), "nuevo", "una clase que no existe no vale");
});

test("lo que Diferencias encontró, como clase de partida", () => {
  assert.equal(claseDelHallazgo("nuevo"), "nuevo");
  assert.equal(claseDelHallazgo("mas_cantidad"), "mas");
  assert.equal(claseDelHallazgo("menos_cantidad"), "menos");
  assert.equal(claseDelHallazgo("subio_precio"), "nuevo", "mismo volumen a otro precio es otra especificación");
});

test("Diferencias arma la orden con la clase de cada partida", () => {
  const partidas = partidasParaOrden({
    todo: [
      { hallazgo: "nuevo", descripcion: "Sensor de movimiento", unidad: "u", cantidad: 6, costoUnitario: 45, precioUnitario: null },
      { hallazgo: "mas_cantidad", descripcion: "Punto de luz", unidad: "pto", cantidad: 46, costoUnitario: 14, precioUnitario: 20, rubro_id: 103, rubro_codigo: "103" },
      { hallazgo: "subio_precio", descripcion: "Punto de datos", unidad: "pto", cantidad: 20, costoUnitario: 5, precioUnitario: null, rubro_id: 106, rubro_codigo: "106" },
    ],
    menos: [{ hallazgo: "menos_cantidad", quita: true, descripcion: "Tablero", unidad: "u", cantidad: 1, costoUnitario: 350, precioUnitario: 400, rubro_id: 104, rubro_codigo: "104" }],
  }, 20);
  assert.deepEqual(partidas.map(p => [p.tipo, p.clase]),
    [["aumenta", "nuevo"], ["aumenta", "mas"], ["aumenta", "nuevo"], ["quita", "menos"]]);
  assert.deepEqual(partidas.map(claseDePartida), ["nuevo", "mas", "nuevo", "menos"]);
});

test("las adiciones se parten en lo nuevo y lo que es más cantidad, cada una con su subtotal", () => {
  const { separar, bloques } = adicionesPorClase([
    { tipo: "aumenta", clase: "nuevo", cantidad: 6, precio_unitario: 54 },
    { tipo: "aumenta", clase: "mas", obra_rubro_id: 103, cantidad: 46, precio_unitario: 20 },
    { tipo: "aumenta", clase: "nuevo", cantidad: 1, precio_unitario: 216 },
    { tipo: "quita", obra_rubro_id: 104, cantidad: 1, precio_unitario: 400 },
  ]);
  assert.equal(separar, true);
  assert.deepEqual(bloques.map(b => [b.clase, b.titulo, b.lineas.length, b.subtotal]), [
    ["nuevo", "TRABAJOS NUEVOS", 2, 540],
    ["mas", "AUMENTO DE CANTIDAD", 1, 920],
  ]);
  assert.match(CLASES.nuevo.pista, /pedido nuevo del cliente/);
});

test("un bloque sin partidas no aparece", () => {
  const { separar, bloques } = adicionesPorClase([{ tipo: "aumenta", rubro_codigo: "103", cantidad: 2, precio_unitario: 10 }]);
  assert.equal(separar, true);
  assert.deepEqual(bloques.map(b => b.clase), ["mas"]);
});

test("una orden vieja escrita a mano sale como salía: sin rótulos que nadie puso", () => {
  const { separar, bloques } = adicionesPorClase([
    { tipo: "aumenta", descripcion: "Desalojo", cantidad: 1, precio_unitario: 300 },
    { tipo: "aumenta", descripcion: "Resane", cantidad: 10, precio_unitario: 12 },
  ]);
  assert.equal(separar, false);
  assert.equal(bloques.length, 1);
  assert.equal(bloques[0].clase, null);
  assert.equal(bloques[0].subtotal, 420);
  assert.deepEqual(adicionesPorClase([{ tipo: "quita", cantidad: 1, precio_unitario: 5 }]),
    { separar: false, bloques: [] });
});

test("cuánto había contratado: por el id del rubro o por su número, nunca contra un adicional", () => {
  const rubros = [
    { id: 103, numero: "103", cantidad: 65, unidad: "pto" },
    { id: 104, numero: 104, cantidad: 10, unidad: "u" },
    { id: 900, numero: "103", cantidad: 46, unidad: "pto", origen: "orden_cambio" },
  ];
  const fmt = v => Number(v).toFixed(2);
  assert.equal(rubroDeLaPartida({ obra_rubro_id: 103 }, rubros).id, 103);
  assert.equal(rubroDeLaPartida({ rubro_codigo: "104" }, rubros).id, 104);
  assert.equal(rubroDeLaPartida({ rubro_codigo: "999" }, rubros), null);
  assert.equal(contratadoDe({ tipo: "aumenta", clase: "mas", obra_rubro_id: 103 }, rubros, fmt), "En el contrato: 65.00 pto");
  assert.equal(contratadoDe({ tipo: "quita", rubro_codigo: "104" }, rubros, fmt), "En el contrato: 10.00 u");
  // Lo nuevo no tiene contratado, aunque apunte a un rubro por su precio.
  assert.equal(contratadoDe({ tipo: "aumenta", clase: "nuevo", obra_rubro_id: 103 }, rubros, fmt), "");
  assert.equal(contratadoDe({ tipo: "aumenta", clase: "mas" }, rubros, fmt), "");
});

test("el servidor clasifica igual que la oficina, partida por partida", async () => {
  // El correo y el portal corren en el servidor con su propia copia de la
  // regla. Si una cambia y la otra no, el PDF y el correo dirían cosas
  // distintas del mismo documento que el cliente firma.
  const api = await import("../api/_clasesDePartida.js");
  const casos = [
    { tipo: "quita", obra_rubro_id: 5 }, { tipo: "quita", clase: "nuevo" }, { tipo: "quita" },
    { tipo: "aumenta" }, { tipo: "aumenta", rubro_codigo: "4.12" }, { tipo: "aumenta", rubro_codigo: "  " },
    { tipo: "aumenta", obra_rubro_id: 103 }, { tipo: "aumenta", clase: "nuevo", obra_rubro_id: 106 },
    { tipo: "aumenta", clase: "mas" }, { tipo: "aumenta", clase: "otra" }, {},
  ];
  for (const l of casos) assert.equal(api.claseDe(l), claseDePartida(l), JSON.stringify(l));
  const ordenes = [
    [{ tipo: "aumenta", cantidad: 1, precio_unitario: 300 }, { tipo: "aumenta", cantidad: 2, precio_unitario: 5 }],
    [{ tipo: "aumenta", clase: "nuevo", cantidad: 1, precio_unitario: 300 }],
    [{ tipo: "aumenta", cantidad: 1, precio_unitario: 3 }, { tipo: "aumenta", rubro_codigo: "9", cantidad: 2, precio_unitario: 5 }, { tipo: "quita", obra_rubro_id: 2 }],
    [{ tipo: "quita", obra_rubro_id: 2, cantidad: 1, precio_unitario: 9 }],
  ];
  for (const lineas of ordenes) {
    const oficina = adicionesPorClase(lineas);
    assert.equal(api.seSeparan(lineas), oficina.separar);
    const suyo = api.bloquesDeAdiciones(lineas);
    if (!oficina.separar) { assert.equal(suyo, null); continue; }
    assert.deepEqual(suyo.map(b => [b.clase, b.titulo, b.pista, b.lineas.length]),
      oficina.bloques.map(b => [b.clase, b.titulo, b.pista, b.lineas.length]));
  }
});

// ── EL PRECIO PACTADO NO SE MUEVE ──────────────────────────────────────────
//
// La OC-04 de Diners Aeropuerto: las partidas sobre rubros del contrato
// salieron un 15% por encima de lo pactado, porque el total del rubro del
// control lleva el IVA adentro y la orden lo suma otra vez al pie.

const interruptor = { id: 1363, numero: 96, unidad: "U", cantidad: 2, precio_unitario: 7.26, total_base: 16.7, iva_pct: 15, origen: "base" };
const punto = { id: 1373, numero: 106, unidad: "U", cantidad: 65, precio_unitario: 36.38, total_base: 2719.51, iva_pct: 15, origen: "base" };

test("el precio del contrato es sin IVA: $7,26, no los $8,35 que salen del total con el impuesto", async () => {
  const { precioDelContrato } = await import("../src/modules/controlObra/clasesDePartida.js");
  assert.equal(precioDelContrato(interruptor), 7.26);
  assert.equal(precioDelContrato(punto), 36.38);
  // Un rubro que entró por una orden guarda su unitario CON IVA: vale el que sale del total.
  assert.equal(precioDelContrato({ cantidad: 10, precio_unitario: 115, total_base: 1150, iva_pct: 15, origen: "orden_cambio" }), 100);
  assert.equal(precioDelContrato({ cantidad: 0, total_base: 10 }), null);
});

test("una partida por encima de lo pactado se denuncia, con cuánto y con el precio que corresponde", async () => {
  const { contraLoPactado, fueraDeLoPactado } = await import("../src/modules/controlObra/clasesDePartida.js");
  const mala = { id: 1, tipo: "aumenta", obra_rubro_id: 1363, rubro_codigo: "96", cantidad: 6, precio_unitario: 8.35, costo_unitario: 6.6017 };
  const p = contraLoPactado(mala, [interruptor, punto]);
  assert.equal(p.pactado, 7.26);
  assert.equal(p.diferencia, 1.09);
  assert.equal(p.pct, 15);
  assert.equal(p.fuera, true);
  // Al precio pactado, nada que decir. Y una reducción se mide igual.
  const buena = { id: 2, tipo: "aumenta", obra_rubro_id: 1373, cantidad: 46, precio_unitario: 36.38 };
  assert.equal(contraLoPactado(buena, [interruptor, punto]).fuera, false);
  const reduccion = { id: 3, tipo: "quita", rubro_codigo: "96", cantidad: 1, precio_unitario: 8.35 };
  assert.equal(contraLoPactado(reduccion, [interruptor, punto]).fuera, true);
  // Lo nuevo no tiene precio pactado: por eso se le pone uno.
  assert.equal(contraLoPactado({ tipo: "aumenta", cantidad: 1, precio_unitario: 420 }, [interruptor]), null);
  const fuera = fueraDeLoPactado([mala, buena, reduccion, { tipo: "aumenta", precio_unitario: 5 }], [interruptor, punto]);
  assert.deepEqual(fuera.map(x => [x.linea.id, x.pactado]), [[1, 7.26], [3, 7.26]]);
});

test("cuánto se le sube al costo, en porcentaje", async () => {
  const { porcentajeSobreCosto } = await import("../src/modules/controlObra/clasesDePartida.js");
  assert.equal(porcentajeSobreCosto({ tipo: "aumenta", precio_unitario: 420, costo_unitario: 380 }), 10.5);
  assert.equal(porcentajeSobreCosto({ tipo: "aumenta", precio_unitario: 7.26, costo_unitario: 6.6017 }), 10);
  assert.equal(porcentajeSobreCosto({ tipo: "aumenta", precio_unitario: 90, costo_unitario: 100 }), -10);
  assert.equal(porcentajeSobreCosto({ tipo: "aumenta", precio_unitario: 90 }), null, "sin costo no hay contra qué medir");
  assert.equal(porcentajeSobreCosto({ tipo: "quita", precio_unitario: 9, costo_unitario: 8 }), null);
});

test("el margen de la orden no le sube el precio a lo que ya está pactado", async () => {
  const { conMargen } = await import("../src/modules/controlObra/cuentaOrdenCambio.js");
  const r = conMargen([
    { id: 1, tipo: "aumenta", costo_unitario: 100, precio_unitario: 0 },
    { id: 2, tipo: "aumenta", clase: "mas", obra_rubro_id: 1363, costo_unitario: 6.6017, precio_unitario: 7.26 },
    { id: 3, tipo: "aumenta", rubro_codigo: "106", costo_unitario: 33.07, precio_unitario: 36.38 },
  ], 20);
  assert.deepEqual(r.map(l => l.precio_unitario), [120, 7.26, 36.38]);
});
