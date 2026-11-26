// Las versiones de una cotización: una empresa manda su cotización de nuevo, y
// se vuelve a elegir.
//
// Hernán, 26/11/2026: «estos presupuestos van a tener actualizaciones... quiero
// poder actualizar y volver a escoger por si cambiamos de especificación,
// cantidad o negociación. Entonces puede ir al presupuesto pero se puede
// regresar a ver nuevas versiones». Y, con una empresa que mandó una sola
// suma: «con las actualizaciones se irán emparejando los rubros».
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  matrizDeCotizaciones, elegir, planDeAplicar, elegidosDe,
  anterioresDe, versionesDe, heredarFilas, elegidosAlActualizar, cambiosDeVersion,
} from "../src/modules/presupuestos/matrizDeCotizaciones.js";

const VIDRIO = "HERRERÍA, ALUMINIO, VIDRIO";
const CAPITULOS = [{ nombre: VIDRIO, orden: 1 }];
const ITEMS = [{ id: 601, capitulo: VIDRIO, orden: 1000, descripcion: "Pasamanos de escalera", unidad: "ml", cantidad: 0, precio_unitario: 120, precio_base: 0, utilidad_pct: 0, total: 0 }];
const linea = (descripcion, unidad, cantidad, precio_unitario, mas = {}) => ({ descripcion, unidad, cantidad, precio_unitario, capitulo: VIDRIO, ...mas });
const DEKORANDO = { id: 1, proveedor: "Dekorando", archivo_id: 71, version: 1, reemplaza_a: null, reemplazada_at: null, renglones: [
  linea("V1 Dormitorio de servicio - Ventana abatible", "u", 1, 929), linea("V3 Máquinas - Mampara 2 cuerpos", "u", 1, 1266),
  linea("V9 Family room - Mampara 3 cuerpos", "u", 1, 2761), linea("V16 Sala - Mampara 6 cuerpos", "u", 2, 3283),
] };
const SUS_FILAS = ["c1-0", "c1-1", "c1-2", "c1-3"];
// La que mandó una sola suma, puesta a cubrir lo que detalló Dekorando.
const WINDOW = { id: 2, proveedor: "Window World", archivo_id: 72, version: 1, reemplaza_a: null, reemplazada_at: null,
  renglones: [linea("Sistema corredizo europeo minimal", "glb", 1, 11900, { filas: SUS_FILAS })] };
const reemplazada = c => ({ ...c, reemplazada_at: "2026-11-27T15:00:00.000Z" });
const armar = (cotizaciones, items = ITEMS) => matrizDeCotizaciones({ capitulos: CAPITULOS, items, cotizaciones });
const comoLaVe = (cot, todas = [cot]) => armar(todas).empresas.find(e => e.id === cot.id).renglones;
// Dekorando negoció: bajó la V1, subió la V3, ya no cotiza la V9, y la V16 ahora es una sola en vez de dos. Y agrega mosquiteros.
const LEIDA = [
  linea("V1 DORMITORIO DE SERVICIO – ventana abatible.", "u", 1, 900, { capitulo: "", filas: [] }),
  linea("V3 Máquinas - Mampara 2 cuerpos", "u", 1, 1300, { capitulo: "", filas: [] }),
  linea("V16 Sala - Mampara 6 cuerpos", "u", 1, 3283, { capitulo: "", filas: [] }),
  linea("Mosquiteros", "glb", 1, 250, { capitulo: VIDRIO, filas: [] }),
];
const D2 = { id: 4, proveedor: "Dekorando", archivo_id: 81, version: 2, reemplaza_a: 1, reemplazada_at: null, renglones: heredarFilas(LEIDA, comoLaVe(DEKORANDO)) };

test("LO QUE YA SE UBICÓ NO SE VUELVE A UBICAR: el renglón que se llama igual queda en su capítulo y en su fila", () => {
  // La V1 viene escrita con otra letra y otra puntuación: es la misma.
  assert.deepEqual(D2.renglones.map(r => [r.capitulo, r.filas, r.precio_unitario]),
    [[VIDRIO, ["c1-0"], 900], [VIDRIO, ["c1-1"], 1300], [VIDRIO, ["c1-3"], 3283], [VIDRIO, [], 250]]);
  // Sin versión anterior, queda lo que propuso NOVA.
  assert.deepEqual(heredarFilas(LEIDA, []).map(r => [r.capitulo, r.filas]), [["", []], ["", []], ["", []], [VIDRIO, []]]);
  // «SE IRÁN EMPAREJANDO»: la que había mandado una suma manda ahora el detalle, y NOVA lo ubica en las filas de la otra.
  const detallada = heredarFilas([linea("Ventana V1", "u", 1, 950, { filas: ["c1-0"] }), linea("Mampara V3", "u", 1, 1290, { filas: ["c1-1"] })], comoLaVe(WINDOW, [DEKORANDO, WINDOW]));
  assert.deepEqual(detallada.map(r => r.filas), [["c1-0"], ["c1-1"]]);
  // Y la suma que se llama igual sigue cubriendo las mismas filas.
  assert.deepEqual(heredarFilas([linea("Sistema corredizo europeo minimal", "glb", 1, 11500, { filas: [] })], comoLaVe(WINDOW, [DEKORANDO, WINDOW]))[0].filas, SUS_FILAS);
});

test("LO QUE PIDIÓ: la versión nueva reemplaza a la anterior en su misma columna, y la anterior queda guardada", () => {
  const todas = [reemplazada(DEKORANDO), WINDOW, D2];
  const m = armar(todas);
  assert.deepEqual(m.empresas.map(e => [e.id, e.proveedor, e.version, e.reemplaza_a]), [[4, "Dekorando", 2, 1], [2, "Window World", 1, null]]);
  // Sigue en sus filas: la V1 nueva está donde estaba la V1.
  assert.deepEqual([m.celdaDe("c1-0", 4).unitario, m.celdaDe("c1-0", 1)], [900, null]);
  // La anterior sigue ahí: se arma su propia matriz para decir qué cambió, y se puede volver a mirar.
  assert.deepEqual(anterioresDe(todas).map(c => [c.id, c.reemplazada_at]), [[1, null]]);
  assert.deepEqual(versionesDe(D2, todas).map(c => c.id), [4, 1]);
  assert.deepEqual(versionesDe(WINDOW, todas).map(c => c.id), [2]);
  // Una cotización de antes de la migración 195, sin esas columnas, es la versión 1 y está vigente.
  assert.deepEqual(armar([{ id: 9, proveedor: "Vieja", renglones: [linea("x", "u", 1, 20)] }]).empresas.map(e => [e.version, e.reemplaza_a]), [[1, null]]);
  // Con dos versiones seguidas, cada empresa sigue en su lugar.
  const W2 = { ...reemplazada(WINDOW), id: 7, version: 2, reemplaza_a: 2 }, W3 = { ...WINDOW, id: 8, version: 3, reemplaza_a: 7 };
  assert.deepEqual(armar([reemplazada(DEKORANDO), reemplazada(WINDOW), D2, W2, W3]).empresas.map(e => e.id), [4, 8]);
});

test("QUÉ CAMBIÓ de una versión a la otra: lo que bajó, lo que subió, lo que dejó de cotizar, lo nuevo y la cantidad", () => {
  const todas = [reemplazada(DEKORANDO), D2];
  const cambio = cambiosDeVersion({ matriz: armar(todas), anterior: armar(anterioresDe(todas)), cotId: 4, anteriorId: 1 });
  assert.deepEqual(cambio.filas, [
    { clave: "c1-0", capitulo: VIDRIO, descripcion: "V1 DORMITORIO DE SERVICIO – ventana abatible.", antes: 929, ahora: 900, que: "bajo" },
    { clave: "c1-1", capitulo: VIDRIO, descripcion: "V3 Máquinas - Mampara 2 cuerpos", antes: 1266, ahora: 1300, que: "subio" },
    // El mismo precio, pero ahora cotiza 1 y antes 2.
    { clave: "c1-3", capitulo: VIDRIO, descripcion: "V16 Sala - Mampara 6 cuerpos", antes: 3283, ahora: 3283, que: "cantidad", cantidadAntes: 2, cantidadAhora: 1 },
    { clave: "c4-3", capitulo: VIDRIO, descripcion: "Mosquiteros", antes: null, ahora: 250, que: "nuevo" },
    { clave: "c1-2", capitulo: VIDRIO, descripcion: "V9 Family room - Mampara 3 cuerpos", antes: 2761, ahora: null, que: "ya_no" },
  ]);
  // 929 + 1.266 + 2.761 + 6.566 antes; 900 + 1.300 + 3.283 + 250 ahora.
  assert.deepEqual([cambio.antes, cambio.ahora, cambio.diferencia], [11522, 5733, -5789]);
  // La misma cotización subida de nuevo: nada cambió.
  const igual = [reemplazada(DEKORANDO), { ...DEKORANDO, id: 6, version: 2, reemplaza_a: 1, renglones: heredarFilas(DEKORANDO.renglones, comoLaVe(DEKORANDO)) }];
  assert.deepEqual(cambiosDeVersion({ matriz: armar(igual), anterior: armar(anterioresDe(igual)), cotId: 6, anteriorId: 1 }), { filas: [], antes: 11522, ahora: 11522, diferencia: 0 });
});

test("NO HAY QUE ELEGIR DE NUEVO: lo que tenía adjudicado y sigue cotizando sigue elegido; lo que ya no cotiza se suelta", () => {
  const base = { capitulos: CAPITULOS, items: ITEMS };
  // Dekorando tenía las cuatro. En la versión nueva ya no cotiza la V9.
  assert.deepEqual(elegidosAlActualizar({ ...base, otras: [WINDOW], nueva: { renglones: D2.renglones }, elegidosAntes: SUS_FILAS }), ["c1-0", "c1-1", "c1-3"]);
  // Window World tenía su suma elegida —las cuatro filas—. Con Dekorando en la versión 2 la V9 ya no existe: la suma sigue, sobre las tres que quedan.
  assert.deepEqual(elegidosAlActualizar({ ...base, otras: [D2], nueva: WINDOW, elegidosAntes: SUS_FILAS }), ["c1-0", "c1-1", "c1-3"]);
  // Y si una de sus filas ya es de otra empresa, la suma no vuelve partida: no vuelve.
  assert.deepEqual(elegidosAlActualizar({ ...base, otras: [{ ...DEKORANDO, elegidos: ["c1-0"] }], nueva: WINDOW, elegidosAntes: SUS_FILAS }), []);
});

test("VOLVER A LA VERSIÓN ANTERIOR: vuelve con lo que tenía elegido, menos lo que mientras tanto se le dio a otra empresa", () => {
  const ALUVID = { id: 3, proveedor: "Aluvid", renglones: [linea("Ventana V1", "u", 1, 880, { filas: ["c1-0"] })], elegidos: ["c1-0"] };
  const D1 = { ...reemplazada(DEKORANDO), elegidos: ["c1-0", "c1-1"] };
  assert.deepEqual(elegidosAlActualizar({ capitulos: CAPITULOS, items: ITEMS, otras: [ALUVID], nueva: D1, elegidosAntes: D1.elegidos }), ["c1-1"]);
  // Lo de una versión ya reemplazada de otra empresa no cuenta como tomado.
  assert.deepEqual(elegidosAlActualizar({ capitulos: CAPITULOS, items: ITEMS, otras: [reemplazada(ALUVID)], nueva: D1, elegidosAntes: D1.elegidos }), ["c1-0", "c1-1"]);
  // Lo elegido se lee solo de las versiones vigentes.
  assert.deepEqual(elegidosDe([{ ...D1 }, { ...D2, elegidos: ["c1-3"] }, ALUVID]), { "c1-3": 4, "c1-0": 3 });
});

test("«PUEDE IR AL PRESUPUESTO PERO SE PUEDE REGRESAR»: con la versión nueva cambia el rubro que ya estaba, entra lo nuevo y se quita lo que dejó de cotizar", () => {
  // Con la versión 1 se eligió a Dekorando para el capítulo, y pasó al presupuesto.
  const m1 = armar([DEKORANDO, WINDOW]);
  const plan1 = planDeAplicar({ matriz: m1, elegidos: elegir(m1, {}, 1, { capitulo: VIDRIO }), items: ITEMS });
  assert.equal(plan1.entran.length, 4);
  const pasado = [...ITEMS, ...plan1.entran.map((c, k) => ({ id: 900 + k, capitulo: c.capitulo, orden: 2000 + k, utilidad_pct: 0, descripcion: c.descripcion, unidad: c.unidad, cantidad: c.cantidad,
    precio_base: c.precio_base, precio_unitario: c.precio_unitario, total: c.total, comparativa_fila: c.comparativa_fila, cotizacion_proveedor: c.cotizacion_proveedor }))];
  // Llega la versión 2. Lo que seguía elegido sigue elegido.
  const todas = [reemplazada(DEKORANDO), WINDOW, D2];
  const siguen = elegidosAlActualizar({ capitulos: CAPITULOS, items: pasado, otras: [WINDOW], nueva: { renglones: D2.renglones }, elegidosAntes: SUS_FILAS });
  const m2 = armar(todas, pasado);
  const plan2 = planDeAplicar({ matriz: m2, elegidos: Object.fromEntries(siguen.map(f => [f, 4])), items: pasado });
  // La V1, la V3 y la V16 son los mismos rubros, con el precio y la cantidad nuevos.
  assert.deepEqual(plan2.cambian.map(x => [x.id, x.precio_base, x.cantidad, x.costo, x.costoAntes]), [[900, 900, 1, 900, 929], [901, 1300, 1, 1300, 1266], [903, 3283, 1, 3283, 6566]]);
  // La V9, que ya no cotiza, se quita del presupuesto. Los mosquiteros son nuevos, pero nadie los eligió todavía: no entran solos.
  assert.deepEqual([plan2.quitan.map(q => [q.id, q.descripcion.slice(0, 2)]), plan2.entran.length, plan2.yaEstan], [[[902, "V9"]], 0, 0]);
  // Lo que el presupuesto ya tenía por su cuenta —el pasamanos— no aparece en ningún lado del plan.
  assert.equal([...plan2.cambian, ...plan2.quitan, ...plan2.sueltan].some(x => x.id === 601), false);
  // Se elige el capítulo entero con la versión nueva: ahora sí entran los mosquiteros.
  const plan3 = planDeAplicar({ matriz: m2, elegidos: elegir(m2, {}, 4, { capitulo: VIDRIO }), items: pasado });
  assert.deepEqual(plan3.entran.map(x => [x.descripcion, x.comparativa_fila]), [["Mosquiteros", "c4-3"]]);
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

test("la pantalla: cada empresa tiene su «versión nueva», la anterior no se borra, y la heredada queda en sus filas", () => {
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
  // Hereda de la anterior COMO LA VE LA MATRIZ: con su capítulo y sus filas ya resueltos.
  assert.match(pantalla, /const comoEstaba = matriz\.empresas\.find\(x => x\.id === anterior\.id\)\?\.renglones \|\| \[\];\s+let renglones = heredarFilas\(p\.leida\.renglones, comoEstaba\);/);
  // Sin la migración 195 se avisa antes de abrir el archivo, no después de que NOVA lo leyó.
  assert.match(pantalla, /!\("reemplazada_at" in cot\)\) \{ setError\(SIN_195\); return; \}/);
  // Nada de confirmaciones del navegador: se confirma en la pantalla.
  assert.doesNotMatch(pantalla, /window\.confirm|\bconfirm\(/);
  // Mientras se compara, el botón viejo de «Subir cotización» —el que la mete directo al presupuesto— no se muestra.
  const modulo = readFileSync(new URL("../src/modules/ModuloPresupuestos.jsx", import.meta.url), "utf8");
  assert.match(modulo, /\{!bloqueado&&puedeEditar&&!comparando&&<button onClick=\{\(\)=>document\.getElementById\("cotiz-input"\)\.click\(\)\}/);
});
