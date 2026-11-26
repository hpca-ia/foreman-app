// La matriz para comparar las cotizaciones de varias empresas, antes de que
// entren al presupuesto.
//
// Hernán, 26/11/2026: «Al armar presupuestos se cotiza de distintas empresas y
// vienen distintos presupuestos... ¿cómo se puede comparar y posterior a eso
// escoger la mejor opción para que ingrese al presupuesto? Una especie de
// matriz». «Y no solo por rubros, porque cada empresa puede cotizar de manera
// distinta o nombrar distinto.» Cuando gana una empresa que cotizó el paquete
// entero, eligió: «1», repartido entre los rubros del grupo, en proporción.
import test from "node:test";
import assert from "node:assert/strict";
import {
  matrizDeCotizaciones, repartir, elegir, planDeAplicar, elegidosPorCotizacion, elegidosDe, totalDelRenglon,
} from "../src/modules/presupuestos/matrizDeCotizaciones.js";

const CAPITULOS = [{ nombre: "GYPSUM", orden: 1 }, { nombre: "PINTURA", orden: 2 }];
const rubro = (id, capitulo, orden, descripcion, unidad, cantidad, precio_unitario, mas = {}) =>
  ({ id, capitulo, orden, descripcion, unidad, cantidad, precio_unitario, precio_base: 0, utilidad_pct: 0, total: 0, ...mas });
const ITEMS = [
  rubro(101, "GYPSUM", 1000, "Tumbado gypsum plano regular", "m2", 125.3, 22.41),
  rubro(102, "GYPSUM", 1001, "Pared una cara de gypsum", "m2", 63.82, 21.14),
  rubro(103, "GYPSUM", 1002, "Pared doble cara de gypsum", "m2", 15, 37.54),
  rubro(201, "PINTURA", 2000, "Pintura de caucho en paredes", "m2", 210, 6),
];
const linea = (descripcion, unidad, cantidad, precio_unitario, items) => ({ descripcion, unidad, cantidad, precio_unitario, items });
// A cotiza renglón por renglón; B, el paquete entero; C, por renglón, sin una pared y con algo de más.
const A = { id: 1, proveedor: "Empresa A", archivo_id: 71, renglones: [
  linea("Cielo raso gypsum", "m2", 125.3, 18, [101]), linea("Tabique 1 cara", "m2", 63.82, 16, [102]),
  linea("Tabique 2 caras", "m2", 15, 28, [103]), linea("Pintura látex", "m2", 200, 5.95, [201]),
] };
const B = { id: 2, proveedor: "Empresa B", archivo_id: 72, renglones: [linea("Drywall: tumbado y paredes", "glb", 1, 3450, [101, 102, 103])] };
const C = { id: 3, proveedor: "Empresa C", archivo_id: 73, renglones: [
  linea("Tumbado", "m2", 125.3, 19.5, [101]), linea("Pared simple", "m2", 63.82, 17, [102]),
  linea("Pintura de caucho", "m2", 210, 5.62, [201]), linea("Andamios", "glb", 1, 150, []),
] };
const armar = (cotizaciones = [A, B, C], items = ITEMS) => matrizDeCotizaciones({ capitulos: CAPITULOS, items, cotizaciones });

test("LO QUE PIDIÓ: los rubros en filas, una columna por empresa, y el total de cada una", () => {
  const m = armar();
  assert.deepEqual(m.grupos.map(g => [g.numero, g.capitulo, g.filas.map(f => f.numero)]),
    [["1", "GYPSUM", ["1.1", "1.2", "1.3"]], ["2", "PINTURA", ["2.1"]]]);
  // Renglón por renglón: el unitario de la empresa por la cantidad DEL PRESUPUESTO.
  const tumbado = m.grupos[0].filas[0];
  assert.deepEqual([tumbado.celdas[1].tipo, tumbado.celdas[1].unitario, tumbado.celdas[1].total], ["rubro", 18, 2255.4]);
  assert.deepEqual([tumbado.celdas[3].unitario, tumbado.celdas[3].total], [19.5, 2443.35]);
  // Lo que suma cada una por capítulo.
  assert.deepEqual(Object.fromEntries(Object.entries(m.grupos[0].sub).map(([id, s]) => [id, s.total])), { 1: 3696.52, 2: 3450, 3: 3528.29 });
  // Y por empresa: lo que dice su papel, y lo que suma sobre este presupuesto.
  assert.deepEqual(m.empresas.map(e => [e.proveedor, e.cotizado, e.comparado, e.cubre]),
    [["Empresa A", 4886.52, 4946.02, 4], ["Empresa B", 3450, 3450, 3], ["Empresa C", 4858.49, 4708.49, 3]]);
});

test("NO SOLO POR RUBROS: la que cotizó el paquete entero se compara por su total contra lo que suman esos rubros", () => {
  const m = armar();
  const [tumbado, pared1, pared2] = m.grupos[0].filas;
  // Un renglón de la empresa, tres rubros del presupuesto: no tiene unitario por rubro.
  for (const f of [tumbado, pared1, pared2]) {
    assert.equal(f.celdas[2].tipo, "paquete");
    assert.equal(f.celdas[2].totalDelPaquete, 3450);
    assert.deepEqual(f.celdas[2].items, [101, 102, 103]);
  }
  // Su total se reparte en proporción a lo que esos rubros valen en el presupuesto, y cierra al centavo.
  const partes = [tumbado, pared1, pared2].map(f => f.celdas[2].parte);
  assert.deepEqual(partes, [2052.34, 986.09, 411.57]);
  assert.equal(Math.round(partes.reduce((t, x) => t + x, 0) * 100) / 100, 3450);
  assert.equal(tumbado.celdas[2].pesoDe, "presupuesto");
  // El paquete está entero adentro del capítulo: su subtotal no es estimado.
  assert.equal(m.grupos[0].sub[2].estimado, false);
});

test("NADIE GANA POR COTIZAR MENOS: el menor del capítulo se marca solo entre las que cubren todo lo cotizado ahí", () => {
  const m = armar();
  // En gypsum se cotizaron tres rubros. A y B los cubren; a C le falta la pared doble.
  assert.deepEqual(m.grupos[0].cotizados, [101, 102, 103]);
  assert.deepEqual([m.grupos[0].sub[1].faltan, m.grupos[0].sub[2].faltan, m.grupos[0].sub[3].faltan], [0, 0, 1]);
  assert.equal(m.grupos[0].menor, "2");
  // C suma menos que A —$3.528,29 contra $3.696,52— y no es la menor: le falta un rubro.
  assert.ok(m.grupos[0].sub[3].total < m.grupos[0].sub[1].total);
  // Por rubro, el menor es entre las que lo cotizaron con su propio precio: el paquete no entra.
  assert.deepEqual(m.grupos[0].filas.map(f => f.menor), ["1", "1", null]);
  assert.equal(m.grupos[1].menor, "3");
  assert.equal(m.grupos[1].filas[0].menor, "3");
});

test("si la empresa cotizó otra cantidad se avisa, y lo que no calza con ningún rubro queda a la vista", () => {
  const m = armar();
  const pintura = m.grupos[1].filas[0];
  // A cotizó 200 m² y el presupuesto tiene 210: el total va sobre los 210.
  assert.deepEqual([pintura.celdas[1].otraCantidad, pintura.celdas[1].cantidadCotizada, pintura.celdas[1].cantidad, pintura.celdas[1].total], [true, 200, 210, 1249.5]);
  assert.equal(pintura.celdas[3].otraCantidad, false);
  const c = m.empresas.find(e => e.id === 3);
  assert.deepEqual(c.sueltos.map(r => [r.descripcion, totalDelRenglon(r)]), [["Andamios", 150]]);
  assert.equal(c.sinRubro, 150);
});

test("CON EL PRESUPUESTO TODAVÍA SIN CANTIDADES —como está hoy la Residencia Banderas—, vale la que cotizó cada una", () => {
  const sinCantidad = ITEMS.map(i => ({ ...i, cantidad: 0 }));
  const m = armar([A, B, C], sinCantidad);
  const tumbado = m.grupos[0].filas[0];
  assert.deepEqual([tumbado.celdas[1].sinCantidadTuya, tumbado.celdas[1].cantidad, tumbado.celdas[1].total], [true, 125.3, 2255.4]);
  // El paquete no tiene contra qué repartirse en el presupuesto: usa lo que cotizaron las otras renglón por renglón.
  assert.equal(tumbado.celdas[2].pesoDe, "otras");
  const partes = m.grupos[0].filas.map(f => f.celdas[2].parte);
  assert.equal(Math.round(partes.reduce((t, x) => t + x, 0) * 100) / 100, 3450);
  // Tumbado: promedio de A y C. Pared doble: solo A la cotizó.
  assert.deepEqual(partes, repartir(3450, [(2255.4 + 2443.35) / 2, (1021.12 + 1084.94) / 2, 420]));
  // Y sin ninguna referencia, a partes iguales: se dice de dónde salió.
  const sola = armar([B], sinCantidad);
  assert.equal(sola.grupos[0].filas[0].celdas[2].pesoDe, "iguales");
  assert.deepEqual(sola.grupos[0].filas.map(f => f.celdas[2].parte), [1150, 1150, 1150]);
});

test("el reparto no pierde ni inventa centavos", () => {
  assert.deepEqual(repartir(100, [1, 1, 1]), [33.34, 33.33, 33.33]);
  assert.deepEqual(repartir(0.05, [1, 1, 1]), [0.02, 0.02, 0.01]);
  assert.deepEqual(repartir(3450, [0, 0]), [1725, 1725]);
  for (const [total, pesos] of [[3450, [2807.973, 1349.1548, 563.1]], [999.99, [7, 11, 13, 17]], [1, [5, 5, 5, 5, 5, 5, 5]]]) {
    assert.equal(Math.round(repartir(total, pesos).reduce((t, x) => t + x, 0) * 100) / 100, total);
  }
});

test("un rubro no se cuenta dos veces en la misma empresa, y el que ya no está en el presupuesto se saca", () => {
  const repetida = { id: 9, proveedor: "Repetida", renglones: [
    linea("Tumbado", "m2", 125.3, 18, [101]), linea("Paquete que vuelve a nombrar el tumbado", "glb", 1, 900, [101, 102, 999]),
  ] };
  const m = armar([repetida]);
  assert.equal(m.grupos[0].filas[0].celdas[9].tipo, "rubro");
  // Al segundo renglón le quedó un solo rubro: ya no es un paquete.
  assert.deepEqual([m.grupos[0].filas[1].celdas[9].tipo, m.grupos[0].filas[1].celdas[9].unitario], ["rubro", 900]);
});

// ── ELEGIR ──────────────────────────────────────────────────────────────────
test("se elige un capítulo entero para una empresa, o rubro por rubro, y volver a tocar lo suelta", () => {
  const m = armar();
  const porCapitulo = elegir(m, {}, 2, { capitulo: "GYPSUM" });
  assert.deepEqual(porCapitulo, { 101: 2, 102: 2, 103: 2 });
  const conPintura = elegir(m, porCapitulo, 3, { capitulo: "PINTURA" });
  assert.deepEqual(conPintura, { 101: 2, 102: 2, 103: 2, 201: 3 });
  // Rubro por rubro, mezclando empresas.
  const mezcla = elegir(m, elegir(m, {}, 1, { itemId: 101 }), 3, { itemId: 102 });
  assert.deepEqual(mezcla, { 101: 1, 102: 3 });
  // Tocar de nuevo lo elegido lo suelta.
  assert.deepEqual(elegir(m, mezcla, 1, { itemId: 101 }), { 102: 3 });
  assert.deepEqual(elegir(m, porCapitulo, 2, { capitulo: "GYPSUM" }), {});
  // Una empresa que no cotizó ese rubro no se puede elegir ahí.
  assert.deepEqual(elegir(m, {}, 3, { itemId: 103 }), {});
});

test("UN PAQUETE SE ELIGE O SE SUELTA ENTERO: no se le adjudica a la empresa una parte que no cotizó por separado", () => {
  const m = armar();
  // Tocar cualquiera de sus rubros elige los tres.
  assert.deepEqual(elegir(m, {}, 2, { itemId: 102 }), { 101: 2, 102: 2, 103: 2 });
  // Darle uno de esos rubros a otra empresa rompe el paquete: se suelta todo lo de B.
  const conB = elegir(m, {}, 2, { capitulo: "GYPSUM" });
  assert.deepEqual(elegir(m, conB, 1, { itemId: 103 }), { 103: 1 });
});

// ── LO QUE ENTRA AL PRESUPUESTO ─────────────────────────────────────────────
test("LO QUE ELIGIÓ: el paquete entra repartido entre los rubros, en proporción, y el total cierra al centavo", () => {
  const m = armar();
  const elegidos = { 101: 2, 102: 2, 103: 2, 201: 3 };
  const plan = planDeAplicar({ matriz: m, elegidos, items: ITEMS });
  assert.equal(plan.costo, 4630.2);          // $3.450,00 del paquete más $1.180,20 de pintura
  assert.equal(plan.repartidos, 3);
  const delPaquete = plan.cambios.filter(c => c.repartido);
  assert.deepEqual(delPaquete.map(c => [c.id, c.costo]), [[101, 2052.34], [102, 986.09], [103, 411.57]]);
  assert.equal(Math.round(delPaquete.reduce((t, c) => t + c.costo, 0) * 100) / 100, 3450);
  // La cantidad es la del presupuesto, y cantidad por unitario vuelve a dar la parte.
  for (const c of delPaquete) {
    assert.equal(c.ponerCantidad, false);
    assert.equal(Math.round(c.cantidad * c.precio_base * 100) / 100, c.costo, `rubro ${c.id}`);
  }
  // Queda dicho de quién es el precio, y que es un reparto y no un unitario cotizado.
  assert.deepEqual([delPaquete[0].cotizacion_proveedor, delPaquete[0].cotizacion_renglon, delPaquete[0].cotizacion_archivo_id, delPaquete[0].cotizacion_cantidad, delPaquete[0].pesoDe],
    ["Empresa B", "Drywall: tumbado y paredes · repartido entre 3 rubros", 72, null, "presupuesto"]);
  // El que se cotizó renglón por renglón entra con su unitario, tal cual.
  const pintura = plan.cambios.find(c => c.id === 201);
  assert.deepEqual([pintura.repartido, pintura.precio_base, pintura.cantidad, pintura.costo, pintura.cotizacion_proveedor, pintura.cotizacion_renglon, pintura.cotizacion_cantidad],
    [false, 5.62, 210, 1180.2, "Empresa C", "Pintura de caucho", 210]);
});

test("entra el COSTO: la utilidad del rubro se conserva y el precio al cliente se recalcula con ella", () => {
  const conUtilidad = ITEMS.map(i => (i.id === 201 ? { ...i, utilidad_pct: 20, precio_base: 6, precio_unitario: 7.2 } : i));
  const m = armar([A, B, C], conUtilidad);
  const [c] = planDeAplicar({ matriz: m, elegidos: { 201: 3 }, items: conUtilidad }).cambios;
  assert.deepEqual([c.precio_base, c.precio_unitario, c.total, c.costo, c.costoAntes], [5.62, 6.74, 1415.4, 1180.2, 1260]);
});

test("donde el presupuesto no tiene cantidad se usa la que cotizó la empresa, y se dice", () => {
  const sinCantidad = ITEMS.map(i => ({ ...i, cantidad: 0 }));
  const m = armar([A, B, C], sinCantidad);
  const plan = planDeAplicar({ matriz: m, elegidos: { 101: 1, 201: 3 }, items: sinCantidad });
  assert.deepEqual(plan.cambios.map(c => [c.id, c.ponerCantidad, c.cantidad, c.precio_base]), [[101, true, 125.3, 18], [201, true, 210, 5.62]]);
  assert.equal(plan.sinCantidad, 2);
});

test("lo elegido se guarda en cada cotización, y se vuelve a leer igual", () => {
  const elegidos = { 101: 2, 102: 2, 103: 2, 201: 3 };
  const guardado = elegidosPorCotizacion(elegidos);
  assert.deepEqual(guardado, { 2: [101, 102, 103], 3: [201] });
  assert.deepEqual(elegidosDe([{ id: 1, elegidos: [] }, { id: 2, elegidos: guardado[2] }, { id: 3, elegidos: guardado[3] }]), elegidos);
});

// ── EL DESCUENTO GENERAL DEL PIE ────────────────────────────────────────────
test("el descuento general que ofrece el papel ya va restado, para no elegir a otra por una diferencia que no existe", async () => {
  const { descuentoDe } = await import("../src/modules/presupuestos/matrizDeCotizaciones.js");
  const conDescuento = { ...A, id: 4, proveedor: "Con descuento", totales: { subtotal: 4886.52, descuento_pct: 10 } };
  assert.equal(descuentoDe(conDescuento), 10);
  const m = armar([A, conDescuento]);
  const tumbado = m.grupos[0].filas[0];
  // $18 de lista, $16,20 con su 10 %: es la menor, aunque el renglón diga lo mismo que A.
  assert.deepEqual([tumbado.celdas[1].unitario, tumbado.celdas[4].unitario, tumbado.celdas[4].total, tumbado.menor], [18, 16.2, 2029.86, "4"]);
  assert.deepEqual([m.empresas[1].descuento, m.empresas[1].descuentoOfrecido, m.empresas[1].cotizado], [10, 10, 4397.87]);
  // Si no se quiere contar con él, se saca, y vuelve a compararse a precio de lista.
  const sin = armar([A, { ...conDescuento, totales: { ...conDescuento.totales, sin_descuento: true } }]);
  assert.deepEqual([sin.grupos[0].filas[0].celdas[4].unitario, sin.empresas[1].descuento, sin.empresas[1].descuentoOfrecido], [18, 0, 10]);
  // Con el monto en vez del porcentaje, sale de lo que suman sus renglones.
  assert.equal(descuentoDe({ ...A, totales: { descuento_monto: 488.65 } }), 10);
});
