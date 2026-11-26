// Las versiones de una cotización: una empresa manda su cotización de nuevo, y
// se vuelve a elegir.
//
// Hernán, 26/11/2026: «estos presupuestos van a tener actualizaciones... quiero
// poder actualizar y volver a escoger por si cambiamos de especificación,
// cantidad o negociación. Entonces puede ir al presupuesto pero se puede
// regresar a ver nuevas versiones».
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  matrizDeCotizaciones, elegir, planDeAplicar, elegidosDe, cantidadPropia, pasadosSinElegir,
  anterioresDe, versionesDe, heredarRubros, elegidosAlActualizar, cambiosDeVersion,
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
const A = { id: 1, proveedor: "Empresa A", archivo_id: 71, version: 1, reemplaza_a: null, reemplazada_at: null, renglones: [
  linea("Cielo raso gypsum", "m2", 125.3, 18, [101]), linea("Tabique 1 cara", "m2", 63.82, 16, [102]),
  linea("Tabique 2 caras", "m2", 15, 28, [103]), linea("Pintura látex", "m2", 200, 5.95, [201]),
] };
const B = { id: 2, proveedor: "Empresa B", archivo_id: 72, version: 1, reemplaza_a: null, reemplazada_at: null,
  renglones: [linea("Drywall: tumbado y paredes", "glb", 1, 3450, [101, 102, 103])] };
const C = { id: 3, proveedor: "Empresa C", archivo_id: 73, version: 1, reemplaza_a: null, reemplazada_at: null, renglones: [
  linea("Tumbado", "m2", 125.3, 19.5, [101]), linea("Pared simple", "m2", 63.82, 17, [102]),
  linea("Pintura de caucho", "m2", 210, 5.62, [201]),
] };
// La empresa A negoció: bajó el tumbado, subió un tabique, dejó de cotizar el otro, y la pintura ahora por 210 m2.
const A2 = { id: 4, proveedor: "Empresa A", archivo_id: 81, version: 2, reemplaza_a: 1, reemplazada_at: null, renglones: [
  linea("Cielo raso gypsum", "m2", 125.3, 17, [101]), linea("Tabique 1 cara", "m2", 63.82, 16.5, [102]),
  linea("Pintura látex", "m2", 210, 5.95, [201]),
] };
const reemplazada = c => ({ ...c, reemplazada_at: "2026-11-27T15:00:00.000Z" });
const armar = (cotizaciones, items = ITEMS) => matrizDeCotizaciones({ capitulos: CAPITULOS, items, cotizaciones });
/** El presupuesto después de pasarle estos cambios, como lo escribe ModuloPresupuestos. */
const conLoPasado = (items, cambios) => items.map(i => {
  const c = cambios.find(x => x.id === i.id);
  return c ? { ...i, precio_base: c.precio_base, precio_unitario: c.precio_unitario, total: c.total, cantidad: c.cantidad,
    cotizacion_proveedor: c.cotizacion_proveedor, cotizacion_cantidad: c.cotizacion_cantidad } : i;
});

test("LO QUE PIDIÓ: la versión nueva reemplaza a la anterior en la matriz, y la anterior queda guardada", () => {
  const todas = [reemplazada(A), B, C, A2];
  const m = armar(todas);
  // En la matriz se compara lo último que mandó cada una: una columna por empresa, no dos de la misma.
  // Y la empresa se queda en su columna: la versión nueva va donde estaba la primera, no al final.
  assert.deepEqual(m.empresas.map(e => [e.id, e.proveedor, e.version, e.reemplaza_a]),
    [[4, "Empresa A", 2, 1], [2, "Empresa B", 1, null], [3, "Empresa C", 1, null]]);
  const B3 = { ...B, id: 8, version: 3, reemplaza_a: 7 }, B2v = { ...reemplazada(B), id: 7, version: 2, reemplaza_a: 2 };
  assert.deepEqual(armar([reemplazada(A), reemplazada(B), C, A2, B2v, B3]).empresas.map(e => e.id), [4, 8, 3]);
  assert.equal(m.grupos[0].filas[0].celdas[4].unitario, 17);
  assert.equal(m.celdaDe(101, 1), null);
  // La anterior sigue ahí: se arma su propia matriz para decir qué cambió, y se puede volver a mirar.
  assert.deepEqual(anterioresDe(todas).map(c => [c.id, c.reemplazada_at]), [[1, null]]);
  assert.deepEqual(versionesDe(A2, todas).map(c => c.id), [4, 1]);
  assert.deepEqual(versionesDe(B, todas).map(c => c.id), [2]);
  // Una cotización de antes de la migración 195, sin esas columnas, es la versión 1 y está vigente.
  const vieja = { id: 9, proveedor: "Vieja", renglones: [linea("Tumbado", "m2", 1, 20, [101])] };
  assert.deepEqual(armar([vieja]).empresas.map(e => [e.version, e.reemplaza_a]), [[1, null]]);
});

test("QUÉ CAMBIÓ de una versión a la otra: lo que bajó, lo que subió, lo que dejó de cotizar, y la cantidad", () => {
  const todas = [reemplazada(A), B, C, A2];
  const cambio = cambiosDeVersion({ matriz: armar(todas), anterior: armar(anterioresDe(todas)), cotId: 4, anteriorId: 1 });
  assert.deepEqual(cambio.filas, [
    { id: 101, numero: "1.1", descripcion: "Tumbado gypsum plano regular", antes: 18, ahora: 17, que: "bajo" },
    { id: 102, numero: "1.2", descripcion: "Pared una cara de gypsum", antes: 16, ahora: 16.5, que: "subio" },
    { id: 103, numero: "1.3", descripcion: "Pared doble cara de gypsum", antes: 28, ahora: null, que: "ya_no" },
    // El mismo precio, pero ahora cotiza 210 y antes 200: se dice, porque la cantidad del presupuesto no cambia sola.
    { id: 201, numero: "2.1", descripcion: "Pintura de caucho en paredes", antes: 5.95, ahora: 5.95, que: "cantidad", cantidadAntes: 200, cantidadAhora: 210 },
  ]);
  // Sobre las cantidades del presupuesto: 2.255,40 + 1.021,12 + 420 + 1.249,50 antes; 2.130,10 + 1.053,03 + 1.249,50 ahora.
  assert.deepEqual([cambio.antes, cambio.ahora, cambio.diferencia], [4946.02, 4432.63, -513.39]);
  // Y lo que antes no cotizaba y ahora sí.
  const C2 = { ...C, id: 5, version: 2, reemplaza_a: 3, renglones: [...C.renglones, linea("Pared doble", "m2", 15, 30, [103])] };
  const conC2 = [A, B, reemplazada(C), C2];
  const deC = cambiosDeVersion({ matriz: armar(conC2), anterior: armar(anterioresDe(conC2)), cotId: 5, anteriorId: 3 });
  assert.deepEqual(deC.filas, [{ id: 103, numero: "1.3", descripcion: "Pared doble cara de gypsum", antes: null, ahora: 30, que: "nuevo" }]);
  assert.equal(deC.diferencia, 450);
  // La misma cotización subida de nuevo: nada cambió.
  const igual = [reemplazada(A), { ...A, id: 6, version: 2, reemplaza_a: 1 }];
  assert.deepEqual(cambiosDeVersion({ matriz: armar(igual), anterior: armar(anterioresDe(igual)), cotId: 6, anteriorId: 1 }),
    { filas: [], antes: 4946.02, ahora: 4946.02, diferencia: 0 });
});

test("LO QUE YA SE CORRIGIÓ NO SE VUELVE A CORREGIR: el renglón que se llama igual va a los mismos rubros que se le habían puesto", () => {
  // NOVA lee la versión nueva y vuelve a proponer: se equivoca en dos, y a uno nuevo le da un rubro que ya es de otro renglón.
  const leidos = [
    linea("CIELO RASO GYPSUM.", "m2", 125.3, 17, [102]),      // se llama igual, con otra letra: va al 101, como se había corregido
    linea("Tabique 1 cara", "m2", 63.82, 16.5, []),            // NOVA no le encontró rubro: hereda el 102
    linea("Tabique 2 caras tipo RH", "m2", 15, 31, [103]),     // cambió la especificación: no se llama igual, vale lo de NOVA
    linea("Masillado y lijado", "m2", 200, 2, [101]),          // nuevo, y NOVA le dio un rubro que ya tomó otro renglón
    linea("Pintura látex", "m2", 210, 5.95, [201]),
  ];
  assert.deepEqual(heredarRubros(leidos, A.renglones).map(r => r.items), [[101], [102], [103], [], [201]]);
  // Lo demás del renglón es lo de la versión nueva.
  assert.deepEqual(heredarRubros(leidos, A.renglones).map(r => r.precio_unitario), [17, 16.5, 31, 2, 5.95]);
  // Sin versión anterior, queda lo que propuso NOVA, sin repetir un rubro.
  assert.deepEqual(heredarRubros(leidos, []).map(r => r.items), [[102], [], [103], [101], [201]]);
  // Un paquete corregido a mano se hereda entero.
  assert.deepEqual(heredarRubros([linea("Drywall: tumbado y paredes", "glb", 1, 3300, [101])], B.renglones)[0].items, [101, 102, 103]);
});

test("NO HAY QUE ELEGIR DE NUEVO: lo que tenía adjudicado y sigue cotizando sigue elegido; lo que ya no cotiza se suelta", () => {
  const base = { capitulos: CAPITULOS, items: ITEMS };
  // A tenía el tumbado, el tabique doble y la pintura. En la versión nueva ya no cotiza el tabique doble.
  assert.deepEqual(elegidosAlActualizar({ ...base, otras: [B, C], nueva: A2, elegidosAntes: [101, 103, 201] }), [101, 201]);
  // Un paquete sigue elegido solo si sigue entero: B ahora cotiza el tumbado y una pared, sin la doble.
  const B2 = { renglones: [linea("Drywall: tumbado y pared simple", "glb", 1, 3000, [101, 102])] };
  assert.deepEqual(elegidosAlActualizar({ ...base, otras: [A, C], nueva: B2, elegidosAntes: [101, 102, 103] }), [101, 102]);
  // Y si de su paquete un rubro ya es de otra empresa, el paquete no vuelve partido: no vuelve.
  const conElTumbado = { ...C, elegidos: [101] };
  assert.deepEqual(elegidosAlActualizar({ ...base, otras: [A, conElTumbado], nueva: B, elegidosAntes: [101, 102, 103] }), []);
});

test("VOLVER A LA VERSIÓN ANTERIOR: vuelve con lo que tenía elegido, menos lo que mientras tanto se le dio a otra empresa", () => {
  // Con la versión 2 de A se le dio la pintura a C. Se quita la versión 2: vuelve la 1, que guardaba el tumbado y la pintura.
  const A1 = { ...reemplazada(A), elegidos: [101, 201] };
  const otras = [B, { ...C, elegidos: [201] }];
  assert.deepEqual(elegidosAlActualizar({ capitulos: CAPITULOS, items: ITEMS, otras, nueva: A1, elegidosAntes: A1.elegidos }), [101]);
  // Lo de una versión ya reemplazada de otra empresa no cuenta como tomado.
  const cVieja = { ...reemplazada(C), elegidos: [101] };
  assert.deepEqual(elegidosAlActualizar({ capitulos: CAPITULOS, items: ITEMS, otras: [B, cVieja], nueva: A1, elegidosAntes: A1.elegidos }), [101, 201]);
});

test("lo elegido se lee solo de las versiones vigentes", () => {
  const todas = [{ ...reemplazada(A), elegidos: [101, 103] }, { ...B, elegidos: [] }, { ...C, elegidos: [102] }, { ...A2, elegidos: [101, 201] }];
  assert.deepEqual(elegidosDe(todas), { 101: 4, 102: 3, 201: 4 });
});

test("«PUEDE IR AL PRESUPUESTO PERO SE PUEDE REGRESAR»: lo que ya pasó no se vuelve a pasar, y lo que cambió con la versión nueva, sí", () => {
  // Con la versión 1 se eligió a A para el tumbado y la pintura, y pasó al presupuesto.
  const m1 = armar([A, B, C]);
  const plan1 = planDeAplicar({ matriz: m1, elegidos: { 101: 1, 201: 1 }, items: ITEMS });
  assert.deepEqual(plan1.porPasar.map(c => c.id), [101, 201]);
  const pasado = conLoPasado(ITEMS, plan1.porPasar);
  // Se vuelve a la matriz: ya está todo así, no hay nada que pasar.
  const otraVez = planDeAplicar({ matriz: armar([A, B, C], pasado), elegidos: { 101: 1, 201: 1 }, items: pasado });
  assert.deepEqual([otraVez.cambios.length, otraVez.porPasar.length], [2, 0]);
  // Llega la versión 2: bajó el tumbado, la pintura quedó igual. Lo elegido sigue elegido, y falta pasar solo el tumbado.
  const m2 = armar([reemplazada(A), B, C, A2], pasado);
  const plan2 = planDeAplicar({ matriz: m2, elegidos: { 101: 4, 201: 4 }, items: pasado });
  assert.deepEqual(plan2.porPasar.map(c => [c.id, c.precio_base, c.costo, c.costoAntes]), [[101, 17, 2130.1, 2255.4]]);
  // Pasa, y queda al día.
  const pasado2 = conLoPasado(pasado, plan2.porPasar);
  assert.equal(planDeAplicar({ matriz: armar([reemplazada(A), B, C, A2], pasado2), elegidos: { 101: 4, 201: 4 }, items: pasado2 }).porPasar.length, 0);
  // Se vuelve a escoger: la pintura ahora para C. Es otra empresa y otro precio: hay que pasarla.
  const m3 = armar([reemplazada(A), B, C, A2], pasado2);
  const reelegido = elegir(m3, { 101: 4, 201: 4 }, 3, { itemId: 201 });
  assert.deepEqual(reelegido, { 101: 4, 201: 3 });
  assert.deepEqual(planDeAplicar({ matriz: m3, elegidos: reelegido, items: pasado2 }).porPasar.map(c => [c.id, c.proveedor, c.precio_base]),
    [[201, "Empresa C", 5.62]]);
  // Cambiar la cantidad del rubro en el presupuesto no obliga a pasar de nuevo: el unitario de la empresa es el mismo.
  const conOtraCantidad = pasado2.map(i => (i.id === 201 ? { ...i, cantidad: 250 } : i));
  assert.equal(planDeAplicar({ matriz: armar([reemplazada(A), B, C, A2], conOtraCantidad), elegidos: { 101: 4, 201: 4 }, items: conOtraCantidad }).porPasar.length, 0);
});

test("un paquete que ya pasó repartido tampoco se vuelve a pasar; y si la empresa lo rebaja, se reparte de nuevo y cierra al centavo", () => {
  const m1 = armar([A, B, C]);
  const plan1 = planDeAplicar({ matriz: m1, elegidos: { 101: 2, 102: 2, 103: 2 }, items: ITEMS });
  assert.deepEqual(plan1.porPasar.map(c => c.costo), [2052.34, 986.09, 411.57]);
  const pasado = conLoPasado(ITEMS, plan1.porPasar);
  // Con los rubros ya valiendo su parte, la proporción es la misma y no queda nada por pasar.
  const otraVez = planDeAplicar({ matriz: armar([A, B, C], pasado), elegidos: { 101: 2, 102: 2, 103: 2 }, items: pasado });
  assert.deepEqual(otraVez.cambios.map(c => c.costo), [2052.34, 986.09, 411.57]);
  assert.equal(otraVez.porPasar.length, 0);
  // B rebaja el paquete a 3.300: los tres rubros cambian, y sus partes vuelven a sumar el paquete.
  const B2 = { id: 7, proveedor: "Empresa B", archivo_id: 82, version: 2, reemplaza_a: 2, reemplazada_at: null,
    renglones: [linea("Drywall: tumbado y paredes", "glb", 1, 3300, [101, 102, 103])] };
  const plan2 = planDeAplicar({ matriz: armar([A, reemplazada(B), C, B2], pasado), elegidos: { 101: 7, 102: 7, 103: 7 }, items: pasado });
  assert.equal(plan2.porPasar.length, 3);
  assert.equal(Math.round(plan2.porPasar.reduce((t, c) => t + c.costo, 0) * 100) / 100, 3300);
  plan2.porPasar.forEach(c => assert.ok(c.costo < c.costoAntes, `${c.descripcion} baja`));
});

test("con el presupuesto sin cantidades —la Residencia Banderas—, lo que pasó toma la cantidad de la cotización y queda al día", () => {
  const sinCantidades = ITEMS.map(i => ({ ...i, cantidad: 0 }));
  const m = armar([A, B, C], sinCantidades);
  const plan = planDeAplicar({ matriz: m, elegidos: { 101: 2, 102: 2, 103: 2, 201: 1 }, items: sinCantidades });
  assert.equal(plan.porPasar.length, 4);
  const pasado = conLoPasado(sinCantidades, plan.porPasar);
  assert.deepEqual(pasado.map(i => i.cantidad), [1, 1, 1, 200]);
  const otraVez = planDeAplicar({ matriz: armar([A, B, C], pasado), elegidos: { 101: 2, 102: 2, 103: 2, 201: 1 }, items: pasado });
  assert.equal(otraVez.porPasar.length, 0);
  assert.equal(otraVez.costo, plan.costo);
});

test("EL 1 QUE PUSO EL REPARTO NO ES UNA CANTIDAD DEL PRESUPUESTO: al volver, las otras empresas se siguen comparando sobre lo que cotizaron", () => {
  // Residencia Banderas: sin cantidades. Pasa el paquete de B: los tres rubros quedan en 1, con su parte como precio.
  const sinCantidades = ITEMS.map(i => ({ ...i, cantidad: 0, precio_unitario: 0 }));
  const plan = planDeAplicar({ matriz: armar([A, B, C], sinCantidades), elegidos: { 101: 2, 102: 2, 103: 2 }, items: sinCantidades });
  const pasado = sinCantidades.map(i => {
    const c = plan.porPasar.find(x => x.id === i.id);
    return c ? { ...i, cantidad: c.cantidad, precio_base: c.precio_base, precio_unitario: c.precio_unitario,
      cotizacion_proveedor: c.cotizacion_proveedor, cotizacion_renglon: c.cotizacion_renglon, cotizacion_cantidad: c.cotizacion_cantidad } : i;
  });
  assert.deepEqual(pasado.slice(0, 3).map(i => [i.cantidad, i.cotizacion_cantidad, / · repartido entre 3 rubros$/.test(i.cotizacion_renglon)]),
    [[1, null, true], [1, null, true], [1, null, true]]);
  assert.deepEqual(pasado.slice(0, 3).map(cantidadPropia), [0, 0, 0]);
  // De vuelta en la matriz, A sigue valiendo 125,30 m2 × 18 en el tumbado —no 1 × 18—.
  const m = armar([A, B, C], pasado);
  const tumbado = m.grupos[0].filas[0];
  assert.deepEqual([tumbado.cantidad, tumbado.celdas[1].cantidad, tumbado.celdas[1].total, tumbado.celdas[1].sinCantidadTuya], [0, 125.3, 2255.4, true]);
  // Lo que el presupuesto tiene hoy en ese rubro sí es su parte del paquete, y dice de quién.
  assert.deepEqual(tumbado.referencia, { unitario: plan.porPasar[0].costo, total: plan.porPasar[0].costo, deQuien: "Empresa B", repartido: true });
  // El paquete ya está así: no hay que pasarlo de nuevo.
  assert.equal(planDeAplicar({ matriz: m, elegidos: { 101: 2, 102: 2, 103: 2 }, items: pasado }).porPasar.length, 0);
  // Se vuelve a escoger: el tumbado para A. Entra con la cantidad que A cotizó, no con el 1 del reparto.
  const reelegido = elegir(m, { 101: 2, 102: 2, 103: 2 }, 1, { itemId: 101 });
  assert.deepEqual(reelegido, { 101: 1 });                    // y el paquete de B, partido, se suelta entero
  const plan2 = planDeAplicar({ matriz: m, elegidos: reelegido, items: pasado });
  assert.deepEqual(plan2.porPasar.map(c => [c.id, c.cantidad, c.precio_base, c.costo, c.ponerCantidad]), [[101, 125.3, 18, 2255.4, true]]);
  // Una cantidad de verdad —aunque sea 1— o un 1 que no vino de un reparto, cuenta.
  assert.equal(cantidadPropia({ cantidad: 1, cotizacion_renglon: "Tumbado", cotizacion_cantidad: 1 }), 1);
  assert.equal(cantidadPropia({ cantidad: 1 }), 1);
  assert.equal(cantidadPropia({ cantidad: 63.82, cotizacion_renglon: "Drywall · repartido entre 3 rubros", cotizacion_cantidad: null }), 63.82);
});

test("LO QUE YA PASÓ Y QUEDÓ SIN ELEGIR SE DICE: el presupuesto se queda con ese costo, y no se borra solo", () => {
  const cotizaciones = [A, B, C];
  // Pasó el paquete de B. Después el tumbado se le dio a A, y el paquete de B se soltó entero.
  const pasado = ITEMS.map(i => (i.capitulo === "GYPSUM"
    ? { ...i, precio_base: i.id === 101 ? 18 : 10, cotizacion_proveedor: i.id === 101 ? "Empresa A" : "Empresa B", cotizacion_archivo_id: i.id === 101 ? 71 : 72 } : i));
  assert.deepEqual(pasadosSinElegir({ elegidos: { 101: 1 }, items: pasado, cotizaciones }), [
    { id: 102, descripcion: "Pared una cara de gypsum", proveedor: "Empresa B", costo: 638.2 },
    { id: 103, descripcion: "Pared doble cara de gypsum", proveedor: "Empresa B", costo: 150 },
  ]);
  // Con todo elegido, o sin nada pasado, no hay nada que decir.
  assert.deepEqual(pasadosSinElegir({ elegidos: { 101: 1, 102: 2, 103: 2 }, items: pasado, cotizaciones }), []);
  assert.deepEqual(pasadosSinElegir({ elegidos: {}, items: ITEMS, cotizaciones }), []);
  // Un presupuesto copiado de otro trae los costos del original: no son de esta comparación.
  const copiado = ITEMS.map(i => ({ ...i, precio_base: 9, cotizacion_proveedor: "Otra Constructora", cotizacion_archivo_id: 5 }));
  assert.deepEqual(pasadosSinElegir({ elegidos: {}, items: copiado, cotizaciones }), []);
  // Y el de una versión anterior de la misma empresa sí es de acá.
  const deLaVersion1 = ITEMS.map(i => (i.id === 201 ? { ...i, precio_base: 5.95, cotizacion_proveedor: "Empresa A", cotizacion_archivo_id: 71 } : i));
  assert.deepEqual(pasadosSinElegir({ elegidos: {}, items: deLaVersion1, cotizaciones: [reemplazada(A), A2] }).map(s => [s.id, s.costo]), [[201, 1249.5]]);
});

test("LA COLUMNA DEL PRESUPUESTO: al lado de cada empresa, lo que el rubro tiene hoy, y de quién es ese costo", () => {
  const m = armar([A, B, C]);
  // Sin costo todavía: su precio de referencia.
  assert.deepEqual(m.grupos[0].filas[0].referencia, { unitario: 22.41, total: 2807.97, deQuien: null, repartido: false });
  // Lo que el presupuesto suma en lo que alguien cotizó, capítulo por capítulo.
  assert.deepEqual(m.grupos.map(g => g.referencia), [4720.22, 1260]);
  // Con un costo que ya pasó de una cotización: ese costo, y de qué empresa.
  const pasado = ITEMS.map(i => (i.id === 101 ? { ...i, precio_base: 18, cotizacion_proveedor: "Empresa A" } : i));
  assert.deepEqual(armar([A, B, C], pasado).grupos[0].filas[0].referencia, { unitario: 18, total: 2255.4, deQuien: "Empresa A", repartido: false });
  // Un rubro que nadie cotizó no entra en la suma del capítulo: se compara lo mismo contra lo mismo.
  assert.equal(armar([C]).grupos[0].referencia, 4157.12);
});

test("la migración 195 solo agrega las columnas de versión: no borra nada ni toca ningún presupuesto", () => {
  const sql = readFileSync(new URL("../supabase/migrations/195_versiones_de_una_cotizacion.sql", import.meta.url), "utf8");
  const sinComentarios = sql.split("\n").filter(l => !l.trim().startsWith("--")).join("\n");
  assert.match(sinComentarios, /alter table public\.presupuesto_cotizaciones/);
  for (const columna of ["version", "reemplaza_a", "reemplazada_at"]) assert.match(sinComentarios, new RegExp(`add column if not exists ${columna}\\b`));
  assert.match(sinComentarios, /version\s+integer\s+not null default 1/);
  assert.match(sinComentarios, /reemplaza_a\s+bigint\s+references public\.presupuesto_cotizaciones\(id\) on delete set null/);
  assert.doesNotMatch(sinComentarios, /\b(drop|truncate)\b|\bdelete\s+from\b|\bupdate\s+public\./i);
  assert.doesNotMatch(sinComentarios, /presupuesto_items|public\.presupuestos\b/);
});

test("la pantalla: cada empresa tiene su «versión nueva», la anterior no se borra, y solo pasa lo que falta pasar", () => {
  const guardar = readFileSync(new URL("../src/modules/presupuestos/cotizacionesDelPresupuesto.js", import.meta.url), "utf8");
  const nueva = guardar.slice(guardar.indexOf("export async function guardarNuevaVersion"), guardar.indexOf("export async function borrarCotizacion"));
  assert.match(nueva, /version: \(Number\(anterior\.version\) \|\| 1\) \+ 1, reemplaza_a: anterior\.id/);
  assert.match(nueva, /\.update\(\{ reemplazada_at: ahora, updated_at: ahora \}\)\.eq\("id", anterior\.id\)/);
  // Lo único que se borra ahí es la versión nueva, si no se pudo marcar la anterior: nunca la anterior.
  assert.deepEqual(nueva.match(/\.delete\(\)\.eq\("id", [a-z.]+\)/g), ['.delete().eq("id", data.id)']);

  const pantalla = readFileSync(new URL("../src/modules/presupuestos/MatrizCotizaciones.jsx", import.meta.url), "utf8");
  for (const clase of ["nueva-version", "subir-version", "contra-la-anterior", "que-cambio", "que-version", "columna-del-presupuesto", "que-falta-pasar"]) {
    assert.match(pantalla, new RegExp(`className="${clase}"`), clase);
  }
  assert.match(pantalla, /heredarRubros\(p\.leida\.renglones, anterior\.renglones/);
  assert.match(pantalla, /const van = plan\.porPasar;/);
  assert.match(pantalla, /onAplicar\(van\)/);
  // Sin la migración 195 se avisa antes de abrir el archivo, no después de que NOVA lo leyó.
  assert.match(pantalla, /!\("reemplazada_at" in cot\)\) \{ setError\(SIN_195\); return; \}/);
  // Nada de confirmaciones del navegador: se confirma en la pantalla.
  assert.doesNotMatch(pantalla, /window\.confirm|\bconfirm\(/);

  // Mientras se compara, el botón viejo de «Subir cotización» —el que la mete directo al presupuesto— no se muestra.
  const modulo = readFileSync(new URL("../src/modules/ModuloPresupuestos.jsx", import.meta.url), "utf8");
  assert.match(modulo, /\{!bloqueado&&puedeEditar&&!comparando&&<button onClick=\{\(\)=>document\.getElementById\("cotiz-input"\)\.click\(\)\}/);
});
