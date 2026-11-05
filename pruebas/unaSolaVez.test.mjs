import { test } from "node:test";
import assert from "node:assert/strict";
import { sinRepetidas, decisionesPara, comoVa } from "../src/modules/controlObra/cuentaDiferencias.js";
import { beneficioDeLoContratado, loYaAprobado } from "../src/modules/controlObra/costoDelRubro.js";

// ── EL MISMO RENGLÓN, UNA SOLA VEZ ─────────────────────────────────────────
//
// El caso real: el contrato tiene 2 interruptores a $7,26 y la proforma trae 8
// a $6,60. Salían dos tarjetas —"6 de más" y "bajó de precio sobre los 2"— y
// eso se leía como dos situaciones, se decidía dos veces y duplicaba la orden.

const cantidad = { id: 592, hallazgo: "mas_cantidad", decision: "cobrar", obra_rubro_id: 1363,
  cantidad: 6, unidad: "U", monto: 39.61, cantidad_papel: "8", unidad_papel: "U", monto_papel: "52.81" };
const precio = { id: 606, hallazgo: "bajo_precio", decision: "pendiente", obra_rubro_id: 1363,
  cantidad: 2, unidad: "U", monto: 1.32, cantidad_papel: "8", unidad_papel: "U", monto_papel: "52.81" };
const rubro = { id: 1363, numero: 96, cantidad: 2, unidad: "U", precio_unitario: 7.26, total_base: 16.7, iva_pct: 15, costo_unitario: null };

test("lo guardado repetido se saca: queda la de cantidad, con su decisión intacta", () => {
  const r = sinRepetidas([cantidad, precio]);
  assert.equal(r.repetidas, 1);
  assert.deepEqual(r.lineas, [cantidad]);
  assert.equal(r.lineas[0].decision, "cobrar", "lo ya decidido no se toca");
});

test("una diferencia de precio de verdad —misma cantidad— se queda", () => {
  const sola = { id: 610, hallazgo: "bajo_precio", obra_rubro_id: 1370, cantidad: 10, monto: 12,
    cantidad_papel: 10, monto_papel: 200 };
  // Otro rubro con la misma cantidad y el mismo total no la tapa.
  const otra = { id: 611, hallazgo: "mas_cantidad", obra_rubro_id: 1371, cantidad: 4, monto: 80,
    cantidad_papel: 10, monto_papel: 200 };
  const r = sinRepetidas([sola, otra, cantidad]);
  assert.equal(r.repetidas, 0);
  assert.equal(r.lineas.length, 3);
});

test("también con menos cantidad, y nunca la que ya salió en una orden", () => {
  const menos = { id: 629, hallazgo: "menos_cantidad", obra_rubro_id: 1364, cantidad: 2, monto: 17.8,
    cantidad_papel: 2, monto_papel: 17.8 };
  const suPrecio = { id: 607, hallazgo: "bajo_precio", obra_rubro_id: 1364, cantidad: 2, monto: 1.78,
    cantidad_papel: 2, monto_papel: 17.8 };
  assert.equal(sinRepetidas([menos, suPrecio]).repetidas, 1);
  assert.equal(sinRepetidas([menos, { ...suPrecio, hallazgo: "subio_precio", orden_cambio_id: 7 }]).repetidas, 0);
  // Los análisis viejos, sin lo que decía el papel, no se tocan: no hay cómo saber.
  const viejo = { id: 1, hallazgo: "bajo_precio", obra_rubro_id: 1364, cantidad: 2, monto: 1.78 };
  assert.equal(sinRepetidas([{ ...menos, cantidad_papel: null, monto_papel: null }, viejo]).repetidas, 0);
});

test("sacadas las repetidas, el análisis cuenta lo que hay que decidir de verdad", () => {
  const v = comoVa(sinRepetidas([cantidad, precio]).lineas);
  assert.equal(v.total, 1);
  assert.equal(v.sinDecidir, 0);
  assert.equal(v.listo, true);
});

// ── LO YA APROBADO DEJA BENEFICIO DESDE YA ─────────────────────────────────
//
// La regla del director: un rubro ya aprobado a un precio deja beneficio por la
// diferencia con lo que cuesta, sobre la cantidad aprobada. Si la cantidad
// aumenta, lo de más espera a su orden de cambio y lo ya aprobado cuenta igual.
// Si se reduce, lo que queda conserva su beneficio.

test("con más cantidad, lo ya aprobado cuenta sobre la cantidad del contrato, no sobre la del papel", () => {
  const b = beneficioDeLoContratado(cantidad, rubro);
  assert.equal(b.cantidad, 2, "las 2 que ya estaban aprobadas, no las 8 del papel");
  assert.equal(b.contra, "precio", "sin costo cargado, contra el precio aprobado");
  assert.equal(b.vara, 7.26);
  assert.equal(b.costoPapel, 6.6013);
  assert.equal(b.presupuestado, 14.52);
  assert.equal(b.real, 13.2);
  assert.equal(b.aFavor, 1.32);
});

test("con menos cantidad, lo que queda conserva su beneficio", () => {
  const menos = { hallazgo: "menos_cantidad", cantidad: 2, cantidad_papel: 2, monto_papel: 17.8, unidad_papel: "U" };
  const b = beneficioDeLoContratado(menos, { id: 97, cantidad: 4, unidad: "U", precio_unitario: 9.79, total_base: 45.03, iva_pct: 15 });
  assert.equal(b.cantidad, 2, "las 2 que quedan");
  assert.equal(b.aFavor, 1.78);
});

test("misma cantidad: todo el rubro, aunque el renglón esté marcado «ya estaba incluido»", () => {
  const tablero = { id: 90, cantidad: 1, unidad: "U", precio_unitario: 247.29, total_base: 284.38, iva_pct: 15 };
  const linea = { hallazgo: "bajo_precio", decision: "incluido", cantidad: 1, monto: 22.48,
    cantidad_papel: 1, unidad_papel: "U", monto_papel: 224.81 };
  const b = beneficioDeLoContratado(linea, tablero);
  assert.equal(b.cantidad, 1);
  assert.equal(b.aFavor, 22.48);
});

test("con costo cargado se anota solo lo que la propuesta mejora ese costo: el margen ya lo cuenta el rubro", () => {
  const conCosto = { ...rubro, costo_unitario: 6.6013 };
  // La misma propuesta de la que salió el costo: no mejora nada, no hay fila.
  assert.equal(beneficioDeLoContratado(cantidad, conCosto).aFavor, 0);
  assert.equal(beneficioDeLoContratado(cantidad, conCosto).contra, "costo");
  // Y lo ya aprobado se dice entero: 2 a $7,26 que cuestan $6,60.
  const a = loYaAprobado(cantidad, conCosto);
  assert.deepEqual(a, { cantidad: 2, unidad: "U", precio: 7.26, costo: 6.6013, beneficio: 1.32 });
  // Un centavo de redondeo no es una mejora.
  const casi = { hallazgo: "mas_cantidad", cantidad_papel: 3, unidad_papel: "U", monto_papel: 19.8 };
  assert.equal(beneficioDeLoContratado(casi, conCosto).aFavor, 0, "6,60 contra 6,6013 es el mismo precio");
  // Una propuesta posterior más cara que el costo cargado: en contra.
  const cara = { hallazgo: "mas_cantidad", cantidad_papel: 8, unidad_papel: "U", monto_papel: 56 };
  assert.equal(beneficioDeLoContratado(cara, conCosto).aFavor, -0.8);
});

test("lo nuevo no tiene nada aprobado, y un emparejamiento que no se sostiene tampoco", () => {
  assert.equal(beneficioDeLoContratado({ hallazgo: "nuevo", cantidad: 1, monto: 5 }, rubro), null);
  assert.equal(beneficioDeLoContratado(cantidad, null), null);
  // El alquiler mensual del tablero contra la instalación provisional.
  const provisional = { id: 3, unidad: "glb", cantidad: 1, precio_unitario: 1008, total_base: 1159.2, iva_pct: 15 };
  const alquiler = { hallazgo: "bajo_precio", cantidad_papel: 1, unidad_papel: "Mes", monto_papel: 115.56 };
  assert.equal(beneficioDeLoContratado(alquiler, provisional), null);
  assert.equal(loYaAprobado(alquiler, provisional), null);
});

test("un global, total contra total: la acometida de $1.350 que cuesta $1.088,50", () => {
  const acometida = { id: 147, unidad: "GL", cantidad: 1, precio_unitario: 1350, total_base: 1552.5, iva_pct: 15 };
  const linea = { hallazgo: "mas_cantidad", cantidad: 24, cantidad_papel: 25, unidad_papel: "GL", monto_papel: 1088.5 };
  const b = beneficioDeLoContratado(linea, acometida);
  assert.equal(b.cantidad, 1, "un global es uno, traiga el papel los tramos que traiga");
  assert.equal(b.aFavor, 261.5);
});

// ── LAS CONDICIONES, COMO LAS DIJO EL DIRECTOR ─────────────────────────────
//
//   · no está el ítem              → va a la orden de cambio
//   · cambia la cantidad           → se ajusta en la orden
//   · el proveedor baja el precio  → beneficio del proyecto
//   · el proveedor sube el precio  → alerta para conversar con él
//   · lo que no se aprueba         → se anota, para conversarlo con él

test("a la orden de cambio va lo nuevo y lo que cambió de cantidad, y nada más", () => {
  const vaALaOrden = h => decisionesPara(h).includes("cobrar");
  assert.equal(vaALaOrden("nuevo"), true);
  assert.equal(vaALaOrden("mas_cantidad"), true);
  assert.equal(vaALaOrden("menos_cantidad"), true);
  assert.equal(vaALaOrden("bajo_precio"), false, "una baja de precio es beneficio, no un adicional");
  assert.equal(vaALaOrden("subio_precio"), false, "una subida es una alerta para el proveedor");
});

test("la baja de precio es beneficio; la subida y lo no aprobado se anotan para el proveedor", () => {
  assert.ok(decisionesPara("bajo_precio").includes("eficiencia"));
  assert.ok(!decisionesPara("subio_precio").includes("eficiencia"));
  assert.ok(decisionesPara("subio_precio").includes("no_se_paga"));
  assert.ok(decisionesPara("nuevo").includes("no_se_paga"));
  assert.ok(decisionesPara("mas_cantidad").includes("no_se_paga"));
});
