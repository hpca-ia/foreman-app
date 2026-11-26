// La matriz para comparar cotizaciones, capítulo por capítulo.
//
// Hernán, 26/11/2026, con las dos primeras cotizaciones de verdad cargadas
// (Dekorando, 28 ventanas itemizadas, $39.956; y otra que mandó una sola
// suma, $40.660): «Aquí hay un error grande... Dekorando sí está itemizado,
// aun así no salen los $39.000 de su proforma». «Son varias cotizaciones...
// pueden ser dos o tres de cocinas o puertas o vidrios... una de ellas iría
// al presupuesto. La comparativa se la categoriza por capítulos del
// presupuesto. Una vez escogida una, los rubros de la proforma alimentarían
// el capítulo». «Con las actualizaciones se irán emparejando los rubros».
// «Eventualmente se mueve la oferta itemizada al presupuesto... o se empareja
// con los rubros».
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  matrizDeCotizaciones, repartir, elegir, planDeAplicar, elegidosPorCotizacion, elegidosDe, totalDelRenglon, renglonesDe,
  filasParaUbicar, alCapitulo, marcaDelRubro, SIN_CAPITULO,
} from "../src/modules/presupuestos/matrizDeCotizaciones.js";

const VIDRIO = "HERRERÍA, ALUMINIO, VIDRIO";
const CAPITULOS = [{ nombre: "CARPINTERIA", orden: 1 }, { nombre: VIDRIO, orden: 2 }, { nombre: "PINTURA", orden: 3 }];
const rubro = (id, capitulo, orden, descripcion, unidad, cantidad, precio_unitario, mas = {}) =>
  ({ id, capitulo, orden, descripcion, unidad, cantidad, precio_unitario, precio_base: 0, utilidad_pct: 0, total: Math.round(cantidad * precio_unitario * 100) / 100, ...mas });
// Lo que el presupuesto ya tenía: rubros escritos a su manera, que no calzan con lo que cotizan las empresas.
const ITEMS = [
  rubro(501, "CARPINTERIA", 1000, "Puerta principal", "u", 1, 800),
  rubro(601, VIDRIO, 2000, "Ventana vidrio claro Baño Master PB 2,60x3,26m", "u", 0, 1649.37),
  rubro(602, VIDRIO, 2001, "Pasamanos de escalera", "ml", 0, 120),
  rubro(701, "PINTURA", 3000, "Pintura de caucho", "m2", 210, 6),
];
const linea = (descripcion, unidad, cantidad, precio_unitario, mas = {}) => ({ descripcion, unidad, cantidad, precio_unitario, ...mas });
// Dekorando: itemizada, por el código de cada ventana. (Cuatro de sus 28.)
const DEKORANDO = { id: 1, proveedor: "Dekorando", archivo_id: 71, renglones: [
  linea("V1 Dormitorio de servicio - Ventana abatible", "u", 1, 929, { capitulo: VIDRIO }),
  linea("V3 Máquinas - Mampara 2 cuerpos", "u", 1, 1266, { capitulo: VIDRIO }),
  linea("V9 Family room - Mampara 3 cuerpos", "u", 1, 2761, { capitulo: VIDRIO }),
  linea("V16 Sala - Mampara 6 cuerpos", "u", 1, 6566, { capitulo: VIDRIO }),
] };
// Window World: «envió solo una sumatoria».
const WINDOW = { id: 2, proveedor: "Window World", archivo_id: 72, renglones: [linea("Sistema corredizo europeo minimal", "glb", 1, 11900, { capitulo: VIDRIO })] };
const LAS_DE_DEKORANDO = ["c1-0", "c1-1", "c1-2", "c1-3"];
const WINDOW_UBICADA = { ...WINDOW, renglones: [{ ...WINDOW.renglones[0], filas: LAS_DE_DEKORANDO }] };
// Aluvid: itemizada y ya emparejada con las filas de Dekorando; no cotiza la V9 y trae algo más.
const ALUVID = { id: 3, proveedor: "Aluvid", archivo_id: 73, renglones: [
  linea("Ventana V1", "u", 1, 880, { capitulo: VIDRIO, filas: ["c1-0"] }),
  linea("Mampara V3", "u", 1, 1310, { capitulo: VIDRIO, filas: ["c1-1"] }),
  linea("Mampara V16", "u", 1, 6480, { capitulo: VIDRIO, filas: ["c1-3"] }),
  linea("Mosquiteros", "glb", 1, 300, { capitulo: VIDRIO }),
] };
const armar = (cotizaciones, items = ITEMS) => matrizDeCotizaciones({ capitulos: CAPITULOS, items, cotizaciones });
/** El presupuesto después de pasarle un plan, como lo escribe ModuloPresupuestos. */
function conLoPasado(items, plan) {
  const cambia = new Map(plan.cambian.map(c => [c.id, c]));
  const fuera = new Set([...plan.quitan.map(q => q.id)]);
  const sueltos = new Set(plan.sueltan.map(q => q.id));
  const valores = c => ({ descripcion: c.descripcion, unidad: c.unidad, cantidad: c.cantidad, precio_base: c.precio_base, precio_unitario: c.precio_unitario, total: c.total,
    comparativa_fila: c.comparativa_fila, cotizacion_proveedor: c.cotizacion_proveedor, cotizacion_renglon: c.cotizacion_renglon });
  return [
    ...items.filter(i => !fuera.has(i.id)).map(i => (cambia.has(i.id) ? { ...i, ...valores(cambia.get(i.id)) } : sueltos.has(i.id) ? { ...i, comparativa_fila: null } : i)),
    ...plan.entran.map((c, k) => ({ id: 9000 + items.length + k, capitulo: c.capitulo, orden: 9000 + k, utilidad_pct: 0, ...valores(c) })),
  ];
}

test("EL ERROR GRANDE: la cotización itemizada muestra TODO lo que cotizó, aunque sus renglones no calcen con los rubros del presupuesto", () => {
  const m = armar([DEKORANDO, WINDOW]);
  // Una sola sección: el capítulo al que van las dos, con el número que tiene en el presupuesto.
  assert.deepEqual(m.grupos.map(g => [g.numero, g.capitulo]), [["2", VIDRIO]]);
  const g = m.grupos[0];
  // ARRIBA, EL TOTAL DE CADA OFERTA en ese capítulo. Dekorando: sus cuatro renglones, 929 + 1.266 + 2.761 + 6.566.
  assert.deepEqual(g.sub[1], { total: 11522, cubre: 4, faltan: 1, estimado: false });
  assert.deepEqual(g.sub[2], { total: 11900, cubre: 1, faltan: 4, estimado: false });
  assert.deepEqual(m.empresas.map(e => [e.proveedor, e.cotizado, e.comparado, e.capitulos, e.sinCapitulo]),
    [["Dekorando", 11522, 11522, [VIDRIO], 0], ["Window World", 11900, 11900, [VIDRIO], 0]]);
  // LAS FILAS SON LO QUE SE COTIZÓ, no los rubros del presupuesto: las cuatro ventanas, y la suma de la otra.
  assert.deepEqual(g.filas.map(f => [f.clave, f.descripcion, f.cantidad, Object.keys(f.celdas)]), [
    ["c1-0", "V1 Dormitorio de servicio - Ventana abatible", 1, ["1"]], ["c1-1", "V3 Máquinas - Mampara 2 cuerpos", 1, ["1"]],
    ["c1-2", "V9 Family room - Mampara 3 cuerpos", 1, ["1"]], ["c1-3", "V16 Sala - Mampara 6 cuerpos", 1, ["1"]],
    ["c2-0", "Sistema corredizo europeo minimal", 1, ["2"]],
  ]);
  assert.deepEqual(g.filas[0].celdas[1], { tipo: "rubro", renglon: 0, descripcion: "V1 Dormitorio de servicio - Ventana abatible", unidad: "u", cantidad: 1, unitario: 929, total: 929, otraCantidad: false });
  // Lo que el capítulo tiene hoy en el presupuesto va al lado: dos rubros, sin cantidades todavía.
  assert.deepEqual(g.referencia, { total: 0, rubros: 2 });
  // NADIE GANA POR HABER COTIZADO MENOS COSAS: sin emparejar, ninguna cubre todas las filas, y no se marca un menor.
  assert.equal(g.menor, null);
});

test("«ENVIÓ SOLO UNA SUMATORIA»: la suma cubre lo que la otra detalló, se comparan por el total, y su parte en cada fila se marca como estimada", () => {
  const m = armar([DEKORANDO, WINDOW_UBICADA]);
  const g = m.grupos[0];
  assert.equal(g.filas.length, 4);
  assert.deepEqual([g.sub[1], g.sub[2]], [{ total: 11522, cubre: 4, faltan: 0, estimado: false }, { total: 11900, cubre: 4, faltan: 0, estimado: false }]);
  // Ahora sí se comparan sobre lo mismo: el menor del capítulo es Dekorando.
  assert.equal(g.menor, "1");
  // Su parte en cada fila sale en proporción a lo que detalló la otra, y cierra al centavo.
  const partes = g.filas.map(f => f.celdas[2].parte);
  assert.deepEqual(partes, [959.48, 1307.53, 2851.58, 6781.41]);
  assert.equal(Math.round(partes.reduce((t, x) => t + x, 0) * 100) / 100, 11900);
  assert.deepEqual([g.filas[0].celdas[2].tipo, g.filas[0].celdas[2].totalDelPaquete, g.filas[0].celdas[2].filas, g.filas[0].celdas[2].pesoDe], ["paquete", 11900, LAS_DE_DEKORANDO, "otras"]);
  // En una fila, el menor se marca solo entre los que dieron un precio propio: la parte de una suma es una estimación.
  assert.deepEqual(g.filas.map(f => f.menor), [null, null, null, null]);
  // Si la cotización que había puesto esas filas se quita, la suma vuelve a su propia fila en vez de quedar colgada.
  const sola = armar([WINDOW_UBICADA]);
  assert.deepEqual(sola.grupos[0].filas.map(f => [f.clave, f.celdas[2].tipo, f.celdas[2].total]), [["c2-0", "rubro", 11900]]);
});

test("«SE IRÁN EMPAREJANDO LOS RUBROS»: la V1 de una con la V1 de la otra, y lo que solo cotizó una queda en su fila", () => {
  const m = armar([DEKORANDO, ALUVID]);
  const g = m.grupos[0];
  assert.deepEqual(g.filas.map(f => [f.clave, f.celdas[1]?.total ?? null, f.celdas[3]?.total ?? null, f.menor]), [
    ["c1-0", 929, 880, "3"], ["c1-1", 1266, 1310, "1"], ["c1-2", 2761, null, null], ["c1-3", 6566, 6480, "3"], ["c3-3", null, 300, null],
  ]);
  // La fila se llama como la nombró quien la puso primero.
  assert.equal(g.filas[0].descripcion, "V1 Dormitorio de servicio - Ventana abatible");
  assert.equal(g.filas[0].celdas[3].descripcion, "Ventana V1");
  // A cada una le falta una fila que la otra sí cotizó: se dice, y no hay menor del capítulo.
  assert.deepEqual([g.sub[1], g.sub[3]], [{ total: 11522, cubre: 4, faltan: 1, estimado: false }, { total: 8970, cubre: 4, faltan: 1, estimado: false }]);
  assert.equal(g.menor, null);
  // Si cotiza otra cantidad que la de la fila, se avisa.
  const otra = { ...ALUVID, renglones: [linea("Ventana V1", "u", 2, 880, { capitulo: VIDRIO, filas: ["c1-0"] })] };
  assert.deepEqual([armar([DEKORANDO, otra]).grupos[0].filas[0].celdas[3].otraCantidad, armar([DEKORANDO, otra]).grupos[0].filas[0].celdas[3].total], [true, 1760]);
  // Una fila no se repite dentro de la misma empresa: el segundo renglón que la nombra abre la suya.
  const repetida = { id: 4, proveedor: "Repite", renglones: [linea("a", "u", 1, 10, { capitulo: VIDRIO, filas: ["c1-0"] }), linea("b", "u", 1, 20, { capitulo: VIDRIO, filas: ["c1-0"] })] };
  assert.deepEqual(renglonesDe(repetida).map(r => r.filas), [["c1-0"], ["c4-1"]]);
});

test("«SE LA CATEGORIZA POR CAPÍTULOS DEL PRESUPUESTO»: cada renglón va a su capítulo; el que no dice, al de la mayoría de su papel", () => {
  // Un mismo papel con dos capítulos.
  const DOS = { id: 5, proveedor: "Contratista", renglones: [
    linea("Puerta de baño", "u", 2, 150, { capitulo: "CARPINTERIA" }), linea("Pintura de puertas", "glb", 1, 90, { capitulo: "PINTURA" }), linea("Puerta de closet", "u", 1, 200),
  ] };
  const m = armar([DEKORANDO, DOS]);
  // En el orden del presupuesto, con su número.
  assert.deepEqual(m.grupos.map(g => [g.numero, g.capitulo, g.filas.length]), [["1", "CARPINTERIA", 2], ["2", VIDRIO, 4], ["3", "PINTURA", 1]]);
  assert.deepEqual(m.empresas[1].capitulos, ["CARPINTERIA", "PINTURA"]);
  assert.deepEqual([m.grupos[0].sub[5].total, m.grupos[2].sub[5].total, m.grupos[0].referencia, m.grupos[2].referencia],
    [500, 90, { total: 800, rubros: 1 }, { total: 1260, rubros: 1 }]);
  // LO QUE YA ESTABA CARGADO de la primera versión —renglones que apuntaban a rubros del presupuesto— cae solo en su capítulo.
  const DE_ANTES = { id: 6, proveedor: "Cargada antes", renglones: [linea("V11 Baño máster", "u", 1, 1191, { items: [601] }), linea("V12 Deck", "u", 1, 1727, { items: [] }), linea("V13 Gym", "u", 1, 3026)] };
  assert.deepEqual(armar([DE_ANTES]).grupos.map(g => [g.capitulo, g.filas.length, g.sub[6].total]), [[VIDRIO, 3, 5944]]);
  // Y si nada dice a qué capítulo va, queda aparte, al final, para decírselo.
  const SUELTA = { id: 7, proveedor: "Sin capítulo", renglones: [linea("Cocina completa", "glb", 1, 9000)] };
  const con = armar([DEKORANDO, SUELTA]);
  assert.deepEqual(con.grupos.map(g => [g.numero, g.capitulo]), [["2", VIDRIO], ["", SIN_CAPITULO]]);
  assert.equal(con.empresas[1].sinCapitulo, 1);
  // Toda la cotización a un capítulo, de un toque.
  assert.deepEqual(alCapitulo(SUELTA.renglones, "CARPINTERIA").map(r => r.capitulo), ["CARPINTERIA"]);
  assert.deepEqual(armar([{ ...SUELTA, renglones: alCapitulo(SUELTA.renglones, "CARPINTERIA") }]).grupos.map(g => g.capitulo), ["CARPINTERIA"]);
  // Un capítulo que el presupuesto todavía no tiene también sirve: va después de los que sí.
  assert.deepEqual(armar([DEKORANDO, { ...SUELTA, renglones: alCapitulo(SUELTA.renglones, "COCINAS") }]).grupos.map(g => [g.numero, g.capitulo]), [["2", VIDRIO], ["", "COCINAS"]]);
});

test("a NOVA se le dice qué filas ya cotizaron las otras, para que ubique la cotización nueva", () => {
  assert.deepEqual(filasParaUbicar(armar([DEKORANDO])), [
    { n: 1, clave: "c1-0", capitulo: VIDRIO, descripcion: "V1 Dormitorio de servicio - Ventana abatible", unidad: "u", cantidad: 1 },
    { n: 2, clave: "c1-1", capitulo: VIDRIO, descripcion: "V3 Máquinas - Mampara 2 cuerpos", unidad: "u", cantidad: 1 },
    { n: 3, clave: "c1-2", capitulo: VIDRIO, descripcion: "V9 Family room - Mampara 3 cuerpos", unidad: "u", cantidad: 1 },
    { n: 4, clave: "c1-3", capitulo: VIDRIO, descripcion: "V16 Sala - Mampara 6 cuerpos", unidad: "u", cantidad: 1 },
  ]);
  assert.deepEqual(filasParaUbicar(armar([])), []);
});

test("SE ELIGE POR CAPÍTULO —«una de ellas iría al presupuesto»— o fila por fila; y una suma se elige o se suelta entera", () => {
  const m = armar([DEKORANDO, ALUVID]);
  // Tocar el total de Dekorando en el capítulo: todas sus filas.
  let e = elegir(m, {}, 1, { capitulo: VIDRIO });
  assert.deepEqual(e, { "c1-0": 1, "c1-1": 1, "c1-2": 1, "c1-3": 1 });
  // Tocar el de Aluvid: se queda con las suyas; la V9, que no cotizó, sigue siendo de Dekorando.
  e = elegir(m, e, 3, { capitulo: VIDRIO });
  assert.deepEqual(e, { "c1-0": 3, "c1-1": 3, "c1-2": 1, "c1-3": 3, "c3-3": 3 });
  // Fila por fila: la V3 vuelve a Dekorando, que era la menor ahí.
  e = elegir(m, e, 1, { fila: "c1-1" });
  assert.equal(e["c1-1"], 1);
  // Volver a tocar lo que ya está, lo suelta.
  assert.equal("c1-1" in elegir(m, e, 1, { fila: "c1-1" }), false);
  assert.deepEqual(elegir(m, elegir(m, {}, 3, { capitulo: VIDRIO }), 3, { capitulo: VIDRIO }), {});
  // LA SUMA, ENTERA: tocar cualquiera de sus partes la elige toda...
  const conSuma = armar([DEKORANDO, WINDOW_UBICADA]);
  const todo = elegir(conSuma, {}, 2, { fila: "c1-2" });
  assert.deepEqual(todo, { "c1-0": 2, "c1-1": 2, "c1-2": 2, "c1-3": 2 });
  // ...y darle una de sus filas a otra empresa la suelta entera: no se le adjudica una parte que no cotizó por separado.
  assert.deepEqual(elegir(conSuma, todo, 1, { fila: "c1-0" }), { "c1-0": 1 });
  // Una empresa que no cotizó ahí no cambia nada.
  assert.deepEqual(elegir(m, { "c1-0": 1 }, 3, { fila: "c1-2" }), { "c1-0": 1 });
});

test("«LOS RUBROS DE LA PROFORMA ALIMENTARÍAN EL CAPÍTULO»: cada renglón elegido entra como rubro, y lo que el capítulo ya tenía no se toca", () => {
  const m = armar([DEKORANDO, WINDOW_UBICADA]);
  const plan = planDeAplicar({ matriz: m, elegidos: elegir(m, {}, 1, { capitulo: VIDRIO }), items: ITEMS });
  // Entran sus cuatro renglones, con sus palabras, su cantidad y su precio como COSTO.
  assert.deepEqual(plan.entran.map(x => [x.capitulo, x.descripcion, x.unidad, x.cantidad, x.precio_base, x.costo, x.comparativa_fila, x.cotizacion_proveedor, x.cotizacion_archivo_id]), [
    [VIDRIO, "V1 Dormitorio de servicio - Ventana abatible", "u", 1, 929, 929, "c1-0", "Dekorando", 71],
    [VIDRIO, "V3 Máquinas - Mampara 2 cuerpos", "u", 1, 1266, 1266, "c1-1", "Dekorando", 71],
    [VIDRIO, "V9 Family room - Mampara 3 cuerpos", "u", 1, 2761, 2761, "c1-2", "Dekorando", 71],
    [VIDRIO, "V16 Sala - Mampara 6 cuerpos", "u", 1, 6566, 6566, "c1-3", "Dekorando", 71],
  ]);
  assert.deepEqual([plan.cambian, plan.quitan, plan.sueltan, plan.yaEstan, plan.costo, plan.porPasar], [[], [], [], 0, 11522, 4]);
  // PASA. Los rubros que el capítulo ya tenía —la ventana del baño, el pasamanos— siguen ahí, sin tocar.
  const pasado = conLoPasado(ITEMS, plan);
  assert.deepEqual(pasado.filter(i => i.capitulo === VIDRIO).map(i => [i.descripcion.slice(0, 12), i.comparativa_fila ?? null]),
    [["Ventana vidr", null], ["Pasamanos de", null], ["V1 Dormitori", "c1-0"], ["V3 Máquinas ", "c1-1"], ["V9 Family ro", "c1-2"], ["V16 Sala - M", "c1-3"]]);
  // Se vuelve a la matriz: ya está todo así, no hay nada que pasar; y cada fila dice lo que el presupuesto tiene de ella.
  const m2 = armar([DEKORANDO, WINDOW_UBICADA], pasado);
  const otraVez = planDeAplicar({ matriz: m2, elegidos: elegir(m2, {}, 1, { capitulo: VIDRIO }), items: pasado });
  assert.deepEqual([otraVez.rubros.length, otraVez.yaEstan, otraVez.porPasar], [4, 4, 0]);
  assert.deepEqual(m2.grupos[0].filas[0].referencia, { unitario: 929, total: 929, deQuien: "Dekorando", paquete: false });
  assert.deepEqual(m2.grupos[0].referencia, { total: 11522, rubros: 6 });

  // SE VUELVE A ESCOGER: ahora Window World, que mandó una suma. Entra SU renglón —uno solo—, y los cuatro de Dekorando se quitan.
  const elB = elegir(m2, elegir(m2, {}, 1, { capitulo: VIDRIO }), 2, { capitulo: VIDRIO });
  const planB = planDeAplicar({ matriz: m2, elegidos: elB, items: pasado });
  assert.deepEqual(planB.entran.map(x => [x.descripcion, x.cantidad, x.precio_base, x.costo, x.repartido, x.comparativa_fila]),
    [["Sistema corredizo europeo minimal", 1, 11900, 11900, true, "c1-0,c1-1,c1-2,c1-3"]]);
  assert.deepEqual(planB.quitan.map(q => [q.descripcion.slice(0, 3), q.proveedor, q.total]), [["V1 ", "Dekorando", 929], ["V3 ", "Dekorando", 1266], ["V9 ", "Dekorando", 2761], ["V16", "Dekorando", 6566]]);
  const pasadoB = conLoPasado(pasado, planB);
  assert.deepEqual(pasadoB.filter(i => i.capitulo === VIDRIO).map(i => i.descripcion.slice(0, 12)), ["Ventana vidr", "Pasamanos de", "Sistema corr"]);
  assert.deepEqual(armar([DEKORANDO, WINDOW_UBICADA], pasadoB).grupos[0].filas[0].referencia, { unitario: null, total: null, deQuien: "Window World", paquete: true });
  // Y si no queda nadie elegido, lo que había salido de la comparativa se quita; lo demás, no.
  const nadie = planDeAplicar({ matriz: m2, elegidos: {}, items: pasado });
  assert.deepEqual([nadie.rubros.length, nadie.quitan.length, nadie.porPasar], [0, 4, 4]);
});

test("otra versión u otra empresa EN LA MISMA FILA actualiza el rubro que ya estaba, en vez de entrar otro igual", () => {
  const m = armar([DEKORANDO, ALUVID]);
  const pasado = conLoPasado(ITEMS, planDeAplicar({ matriz: m, elegidos: elegir(m, {}, 1, { capitulo: VIDRIO }), items: ITEMS }));
  const v1 = pasado.find(i => i.comparativa_fila === "c1-0");
  // Le pusieron utilidad al rubro en el presupuesto.
  const conUtilidad = pasado.map(i => (i.id === v1.id ? { ...i, utilidad_pct: 20, precio_unitario: 1114.8, total: 1114.8 } : i));
  // La V1 pasa a Aluvid, que la cotizó en 880.
  const m2 = armar([DEKORANDO, ALUVID], conUtilidad);
  const plan = planDeAplicar({ matriz: m2, elegidos: elegir(m2, elegir(m2, {}, 1, { capitulo: VIDRIO }), 3, { fila: "c1-0" }), items: conUtilidad });
  assert.deepEqual([plan.entran.length, plan.quitan.length, plan.yaEstan], [0, 0, 3]);
  // Es el mismo rubro: toma el costo y las palabras de Aluvid, y CONSERVA SU UTILIDAD.
  assert.deepEqual(plan.cambian.map(x => [x.id, x.descripcion, x.proveedor, x.proveedorAntes, x.precio_base, x.precio_unitario, x.total, x.costo, x.costoAntes]),
    [[v1.id, "Ventana V1", "Aluvid", "Dekorando", 880, 1056, 1056, 880, 929]]);
  // Una versión nueva de Dekorando con la V3 más barata: cambia ese rubro y nada más.
  const D2 = { ...DEKORANDO, id: 8, version: 2, reemplaza_a: 1, renglones: DEKORANDO.renglones.map((r, k) => ({ ...r, filas: [`c1-${k}`], precio_unitario: k === 1 ? 1200 : r.precio_unitario })) };
  const m3 = armar([{ ...DEKORANDO, reemplazada_at: "2026-11-27T10:00:00Z" }, D2], pasado);
  const plan3 = planDeAplicar({ matriz: m3, elegidos: { "c1-0": 8, "c1-1": 8, "c1-2": 8, "c1-3": 8 }, items: pasado });
  assert.deepEqual([plan3.entran.length, plan3.yaEstan, plan3.cambian.map(x => [x.descripcion.slice(0, 2), x.precio_base, x.costoAntes])], [0, 3, [["V3", 1200, 1266]]]);
});

test("«...O SE EMPAREJA CON LOS RUBROS»: un renglón puede ir a un rubro que ya está, que conserva sus palabras; y al soltarlo, ese rubro queda", () => {
  const m = armar([DEKORANDO]);
  const elegidos = elegir(m, {}, 1, { capitulo: VIDRIO });
  // La V1 es, en el presupuesto, la «Ventana vidrio claro Baño Master» (rubro 601).
  const plan = planDeAplicar({ matriz: m, elegidos, items: ITEMS, enlaces: { "c1-0": 601 } });
  assert.deepEqual(plan.entran.length, 3);
  // Ese rubro conserva sus palabras; no tenía cantidad, así que toma la de la proforma; y recibe el costo.
  assert.deepEqual(plan.cambian.map(x => [x.id, x.emparejado, x.descripcion, x.cantidad, x.precio_base, x.costo, x.comparativa_fila, x.cotizacion_renglon]),
    [[601, true, "Ventana vidrio claro Baño Master PB 2,60x3,26m", 1, 929, 929, "=c1-0", "V1 Dormitorio de servicio - Ventana abatible"]]);
  const pasado = conLoPasado(ITEMS, plan);
  assert.deepEqual(marcaDelRubro(pasado.find(i => i.id === 601)), { marca: "c1-0", emparejado: true });
  assert.deepEqual(marcaDelRubro(pasado.find(i => i.comparativa_fila === "c1-1")), { marca: "c1-1", emparejado: false });
  assert.equal(marcaDelRubro(ITEMS[0]), null);
  // Ya está: no hay nada que pasar, y el rubro sigue llamándose como en el presupuesto.
  const m2 = armar([DEKORANDO], pasado);
  const otraVez = planDeAplicar({ matriz: m2, elegidos, items: pasado });
  assert.deepEqual([otraVez.porPasar, otraVez.rubros.find(x => x.id === 601).descripcion], [0, "Ventana vidrio claro Baño Master PB 2,60x3,26m"]);
  // El rubro con cantidad propia la conserva: «la cantidad del presupuesto manda».
  const conCantidad = ITEMS.map(i => (i.id === 601 ? { ...i, cantidad: 2 } : i));
  assert.deepEqual(planDeAplicar({ matriz: m, elegidos, items: conCantidad, enlaces: { "c1-0": 601 } }).cambian.map(x => [x.cantidad, x.costo]), [[2, 1858]]);
  // SE SUELTA TODO: los tres que creó la comparativa se quitan; el emparejado se desengancha y QUEDA.
  const nada = planDeAplicar({ matriz: m2, elegidos: {}, items: pasado });
  assert.deepEqual([nada.quitan.length, nada.sueltan.map(x => [x.id, x.emparejado])], [3, [[601, true]]]);
  assert.equal(conLoPasado(pasado, nada).find(i => i.id === 601).comparativa_fila, null);
  // No se empareja con un rubro de otro capítulo, ni con uno que ya está emparejado.
  assert.equal(planDeAplicar({ matriz: m, elegidos, items: ITEMS, enlaces: { "c1-0": 501 } }).entran.length, 4);
  assert.equal(planDeAplicar({ matriz: m2, elegidos, items: pasado, enlaces: { "c1-1": 601 } }).cambian.length, 0);
});

test("lo elegido se guarda en cada cotización, por fila, y se vuelve a leer igual", () => {
  const elegidos = { "c1-0": 3, "c1-1": 1, "c1-2": 1, "c3-3": 3 };
  assert.deepEqual(elegidosPorCotizacion(elegidos), { 3: ["c1-0", "c3-3"], 1: ["c1-1", "c1-2"] });
  assert.deepEqual(elegidosDe([{ id: 1, elegidos: ["c1-1", "c1-2"] }, { id: 3, elegidos: ["c1-0", "c3-3"] }]), elegidos);
  // Lo que estaba elegido con la primera versión —ids de rubros del presupuesto— ya no significa nada: no se lee.
  assert.deepEqual(elegidosDe([{ id: 1, elegidos: [5778, 5779] }, { id: 2, elegidos: null }]), {});
  // Ni lo de una versión que ya fue reemplazada.
  assert.deepEqual(elegidosDe([{ id: 1, elegidos: ["c1-0"], reemplazada_at: "2026-11-27T10:00:00Z" }, { id: 8, elegidos: ["c1-1"] }]), { "c1-1": 8 });
});

test("el descuento general que ofrece el papel ya va restado, y el reparto no pierde ni inventa centavos", () => {
  const conDescuento = { ...DEKORANDO, totales: { subtotal: 11522, descuento_pct: 10 } };
  const m = armar([conDescuento]);
  assert.deepEqual([m.empresas[0].descuento, m.empresas[0].descuentoOfrecido, m.grupos[0].sub[1].total, m.grupos[0].filas[0].celdas[1].unitario], [10, 10, 10369.8, 836.1]);
  // Y se puede no restar: hay descuentos que el proveedor ofrece y después no sostiene.
  const sin = armar([{ ...conDescuento, totales: { ...conDescuento.totales, sin_descuento: true } }]);
  assert.deepEqual([sin.empresas[0].descuento, sin.empresas[0].descuentoOfrecido, sin.grupos[0].sub[1].total], [0, 10, 11522]);
  assert.deepEqual(repartir(100, [1, 1, 1]), [33.34, 33.33, 33.33]);
  assert.deepEqual(repartir(0.05, [1, 1, 1]), [0.02, 0.02, 0.01]);
  assert.equal(repartir(11900, [929, 1266, 2761, 6566]).reduce((t, x) => t + Math.round(x * 100), 0), 1190000);
  assert.equal(totalDelRenglon({ cantidad: 3, precio_unitario: 10.5 }), 31.5);
  assert.equal(totalDelRenglon({ cantidad: 3, precio_unitario: 10.5, total: 30 }), 30);
});

test("la migración 197 solo agrega la marca del rubro: no cambia ninguno", () => {
  const sql = readFileSync(new URL("../supabase/migrations/197_el_rubro_que_salio_de_la_comparativa.sql", import.meta.url), "utf8").split("\n").filter(l => !l.trim().startsWith("--")).join("\n");
  assert.match(sql, /alter table public\.presupuesto_items\s+add column if not exists comparativa_fila text;/);
  assert.match(sql, /create index if not exists presupuesto_items_de_la_comparativa/);
  assert.doesNotMatch(sql, /\b(drop|truncate)\b|\bdelete\s+from\b|\bupdate\s+public\./i);
});
