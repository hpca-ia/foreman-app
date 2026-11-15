import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  asignadoDe, sobraDelReparto, avisoDeSobra, quedaParaLosRubros,
  prorratearEntreRubros, repartoDeRenglones, asignadoDeMas, destinosPorFactura,
} from "../src/modules/controlObra/repartoDeFactura.js";

// ── UNA FACTURA NO PUEDE QUEDAR CON MÁS ASIGNADO QUE SU TOTAL ──────────────
//
// El caso (13/11/2026): la factura 171 de MEGAMETALES, por $590,73, en la obra
// 13. Quedó con seis asignaciones escritas en un solo guardado: una a la
// agrupación OC-03 entera por los $590,73 y cinco a rubros de esa agrupación
// que volvían a sumar $590,73. $1.181,46 asignados.
//
// No tenía pagos, así que en el control pesaba cero y nadie lo vio. Con el
// pago registrado iba a contar el doble.
//
// Los rubros de la OC-03, con su presupuesto. El 1448 es el «(–)» de la orden
// de cambio: un descuento del contrato, en negativo.
const OC03 = [
  { id: 1444, total_base: 538.20 },
  { id: 1445, total_base: 189.75 },
  { id: 1446, total_base: 79.12 },
  { id: 1447, total_base: 385.71 },
  { id: 1448, total_base: -1005.09 },
  { id: 1449, total_base: 143.75 },
];
const TOTAL = 590.73;
const marcados = ids => ids.map(id => ({ tipo: "rubro", id, monto: 0 }));
const cinco = [1444, 1445, 1446, 1447, 1449];
const c2 = v => Math.round(v * 100) / 100;

test("lo que quedó en la base se pasa del total por los $590,73 enteros, y así no se guarda", () => {
  const enLaBase = [
    { tipo: "actividad", id: 196, monto: 590.73 },
    { tipo: "rubro", id: 1444, monto: 237.88 },
    { tipo: "rubro", id: 1445, monto: 83.87 },
    { tipo: "rubro", id: 1446, monto: 34.97 },
    { tipo: "rubro", id: 1447, monto: 170.48 },
    { tipo: "rubro", id: 1449, monto: 63.53 },
  ];
  assert.equal(asignadoDe(enLaBase), 1181.46);
  assert.equal(sobraDelReparto(enLaBase, TOTAL), 590.73);
  const aviso = avisoDeSobra(enLaBase, TOTAL);
  assert.match(aviso, /1\.181,46/);
  assert.match(aviso, /sobran \$590,73/);
});

test("cargada a la agrupación entera, la prorrata entre sus rubros ya no la reparte otra vez", () => {
  // Los mismos pasos que dejaron la 171 así: agrupación entera, marcar cinco
  // rubros, «a prorrata de lo que pesa cada uno».
  const antes = [{ tipo: "actividad", id: 196, monto: TOTAL }, ...marcados(cinco)];
  const despues = prorratearEntreRubros(antes, OC03, TOTAL);
  assert.deepEqual(despues[0], { tipo: "actividad", id: 196, monto: TOTAL }, "la línea de la agrupación no se toca");
  assert.deepEqual(despues.slice(1).map(r => r.monto), [0, 0, 0, 0, 0], "no queda nada que repartir entre los rubros");
  assert.equal(asignadoDe(despues), TOTAL);
  assert.equal(sobraDelReparto(despues, TOTAL), 0);
  assert.equal(avisoDeSobra(despues, TOTAL), "");
});

test("sin la agrupación entera, la prorrata reparte la factura completa entre los rubros marcados", () => {
  // Es lo que la persona quiso hacer, y son los montos que quedaron escritos.
  const despues = prorratearEntreRubros(marcados(cinco), OC03, TOTAL);
  assert.deepEqual(despues.map(r => r.monto), [237.88, 83.87, 34.97, 170.48, 63.53]);
  assert.equal(asignadoDe(despues), TOTAL);
});

test("con una parte cargada entera a un capítulo, entre los rubros va solo lo que queda", () => {
  const antes = [{ tipo: "capitulo", id: "ALBAÑILERÍA", monto: 200 }, ...marcados(cinco)];
  assert.equal(quedaParaLosRubros(antes, TOTAL), 390.73);
  const despues = prorratearEntreRubros(antes, OC03, TOTAL);
  assert.equal(despues[0].monto, 200);
  assert.equal(c2(despues.slice(1).reduce((t, r) => t + r.monto, 0)), 390.73);
  assert.equal(asignadoDe(despues), TOTAL);
});

test("si lo cargado entero ya se pasa del total, los rubros quedan en cero y el guardado lo frena", () => {
  const antes = [{ tipo: "actividad", id: 196, monto: 700 }, ...marcados(cinco)];
  assert.equal(quedaParaLosRubros(antes, TOTAL), 0, "no queda un negativo para repartir");
  const despues = prorratearEntreRubros(antes, OC03, TOTAL);
  assert.ok(despues.slice(1).every(r => r.monto === 0));
  assert.equal(sobraDelReparto(despues, TOTAL), 109.27);
});

test("el rubro en negativo de una orden de cambio no pesa: no recibe gasto a prorrata", () => {
  const despues = prorratearEntreRubros(marcados([1444, 1448, 1449]), OC03, 100);
  assert.equal(despues[1].monto, 0, "el (–) no se lleva nada");
  assert.ok(despues[0].monto > 0 && despues[2].monto > 0);
  assert.equal(asignadoDe(despues), 100);
  // Y si lo único marcado no pesa, no hay con qué prorratear: queda como estaba.
  const solo = [{ tipo: "rubro", id: 1448, monto: 12 }];
  assert.deepEqual(prorratearEntreRubros(solo, OC03, 100), solo);
});

test("la prorrata cierra al centavo aunque la división no sea exacta", () => {
  const tres = [{ id: 1, total_base: 100 }, { id: 2, total_base: 100 }, { id: 3, total_base: 100 }];
  const despues = prorratearEntreRubros(marcados([1, 2, 3]), tres, 100.01);
  assert.equal(asignadoDe(despues), 100.01);
  assert.equal(sobraDelReparto(despues, 100.01), 0);
});

test("repartir de menos se puede: el resto queda por asignar", () => {
  assert.equal(sobraDelReparto([{ monto: 100 }], TOTAL), 0);
  assert.equal(sobraDelReparto([], TOTAL), 0);
  assert.equal(avisoDeSobra([{ monto: 590.73 }], TOTAL), "");
});

test("un centavo de más ya es de más", () => {
  assert.equal(sobraDelReparto([{ monto: 590.74 }], TOTAL), 0.01);
  assert.notEqual(avisoDeSobra([{ monto: "300" }, { monto: "290.74" }], "590.73"), "", "los montos llegan como texto desde el formulario");
});

test("una nota de crédito se mide sin signo: no se descarga de los rubros más de lo que dice", () => {
  assert.equal(sobraDelReparto([{ monto: -99.97 }], -99.97), 0);
  assert.equal(sobraDelReparto([{ monto: -60 }, { monto: -60 }], -99.97), 20.03);
  // Recién cargada, el formulario la tiene en positivo y el signo lo pone el guardado.
  assert.equal(sobraDelReparto([{ monto: 99.97 }], 99.97), 0);
  // Y la prorrata de una nota de crédito reparte en negativo, sin pasarse.
  const dos = [{ id: 1, total_base: 300 }, { id: 2, total_base: 100 }];
  const despues = prorratearEntreRubros(marcados([1, 2]), dos, -100);
  assert.deepEqual(despues.map(r => r.monto), [-75, -25]);
});

test("el aviso nombra el papel de cada pantalla", () => {
  assert.match(avisoDeSobra([{ monto: 60 }, { monto: 60 }], 89.85, "el gasto"), /el gasto es por \$89,85: sobran \$30,15/);
  assert.match(avisoDeSobra([{ monto: 1000 }], 400, "el documento"), /el documento es por \$400,00: sobran \$600,00/);
});

// ── Los renglones que NOVA leyó, cada uno a su destino ─────────────────────

test("los renglones se llevan al total de la factura: el IVA se reparte con la base", () => {
  const items = [
    { destino: "rubro:1444", monto: 100 },
    { destino: "rubro:1444", monto: 50 },
    { destino: "act:196", monto: 150 },
    { destino: "cap:ALBAÑILERÍA: MUROS", monto: 100 },
    { destino: null, monto: 999 },
  ];
  assert.deepEqual(repartoDeRenglones(items, 460), [
    { tipo: "rubro", id: 1444, monto: 172.5 },
    { tipo: "actividad", id: 196, monto: 172.5 },
    { tipo: "capitulo", id: "ALBAÑILERÍA: MUROS", monto: 115 },
  ]);
});

test("tres destinos iguales no suman un centavo más que la factura", () => {
  // Redondeando cada uno por su cuenta daba 33,34 × 3 = 100,02 contra 100,01.
  const items = [1, 2, 3].map(id => ({ destino: `rubro:${id}`, monto: 28.99 }));
  const reparto = repartoDeRenglones(items, 100.01);
  assert.equal(asignadoDe(reparto), 100.01);
  assert.equal(sobraDelReparto(reparto, 100.01), 0);
});

test("sin renglones con destino no hay reparto", () => {
  assert.deepEqual(repartoDeRenglones([{ destino: null, monto: 10 }], 11.5), []);
  assert.deepEqual(repartoDeRenglones([], 11.5), []);
});

// ── Se apriete lo que se apriete, no se pasa ───────────────────────────────

test("mezclando agrupaciones, capítulos y rubros en cualquier orden, la prorrata nunca deja más asignado que el total", () => {
  // Un azar con semilla: la misma corrida todas las veces.
  let semilla = 171;
  const azar = () => (semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648;
  const rubros = Array.from({ length: 9 }, (_, i) => ({ id: i + 1, total_base: c2(azar() * 4000 - 400) }));
  for (let vuelta = 0; vuelta < 400; vuelta++) {
    const total = c2(azar() * 5000 + 0.01);
    const lineas = [];
    const cuantas = 1 + Math.floor(azar() * 7);
    for (let k = 0; k < cuantas; k++) {
      const que = azar();
      if (que < 0.6) lineas.push({ tipo: "rubro", id: 1 + Math.floor(azar() * 9), monto: c2(azar() * total) });
      else if (que < 0.8) lineas.push({ tipo: "actividad", id: 100 + k, monto: c2(azar() * total * 0.4) });
      else lineas.push({ tipo: "capitulo", id: `C${k}`, monto: c2(azar() * total * 0.4) });
    }
    const hayPeso = lineas.some(l => l.tipo === "rubro" && rubros.find(r => r.id === l.id).total_base > 0);
    const entero = asignadoDe(lineas.filter(l => l.tipo !== "rubro"));
    const despues = prorratearEntreRubros(lineas, rubros, total);
    if (!hayPeso) { assert.deepEqual(despues, lineas); continue; }
    // Si lo cargado entero cabe en la factura, el reparto cierra exacto con el
    // total; si no cabe, los rubros quedan en cero y no agregan nada.
    assert.equal(asignadoDe(despues), entero <= total ? total : entero, `vuelta ${vuelta}`);
    assert.ok(despues.every(l => l.tipo !== "rubro" || l.monto >= 0), "ningún rubro queda en negativo");
  }
});

// ── Las tres puertas por las que se escriben asignaciones ──────────────────
//
// La regla no sirve si el guardado no la consulta. Cada pantalla que escribe en
// `obra_asignaciones` pregunta antes de escribir.

const leer = ruta => readFileSync(new URL(ruta, import.meta.url), "utf8");

test("Control de Obra: el guardado de la factura se frena antes de escribir nada", () => {
  const modal = leer("../src/modules/controlObra/ModalFactura.jsx");
  const guardar = modal.slice(modal.indexOf("async function guardar()"));
  const freno = guardar.indexOf("avisoDeSobra(repartos, form.total)");
  assert.ok(freno > 0, "el guardado consulta la regla");
  assert.ok(freno < guardar.indexOf("subirArchivo("), "antes de subir el archivo");
  assert.ok(freno < guardar.indexOf('from("obra_facturas")'), "antes de tocar la factura");
  assert.ok(freno < guardar.indexOf('from("obra_asignaciones")'), "antes de tocar las asignaciones");
  // Y el botón de prorrata usa el reparto que descuenta lo cargado entero.
  assert.match(modal, /setRepartos\(rs => prorratearEntreRubros\(rs, rubros, form\.total\)\)/);
  assert.match(modal, /setRepartos\(repartoDeRenglones\(items, form\.total\)\)/);
});

test("Compras: el documento no entra al control con renglones que suman más que él", () => {
  const compras = leer("../src/modules/compras/compras.js");
  const cuerpo = compras.slice(compras.indexOf("export async function facturarCompra("));
  const freno = cuerpo.indexOf('avisoDeSobra(repartos, total, "el documento")');
  assert.ok(freno > 0);
  assert.ok(freno < cuerpo.indexOf('from("obra_facturas").insert('), "antes de crear la factura");
  // Y la pantalla lo mira antes de mover el pedido de estado.
  const modal = leer("../src/modules/compras/ModalSolicitud.jsx");
  const comprar = modal.slice(modal.indexOf("const marcarComprada = "));
  const antes = comprar.indexOf('avisoDeSobra(repartos, total, "el documento")');
  assert.ok(antes > 0 && antes < comprar.indexOf('moverA(viva, "comprada"'));
});

test("Caja chica: el gasto no se guarda repartido por más de lo que vale", () => {
  const caja = leer("../src/modules/ModuloCajaChica.jsx");
  const cuerpo = caja.slice(caja.indexOf("async function agregarGasto()"));
  const freno = cuerpo.indexOf('avisoDeSobra(repartoDelGasto(rubrosGasto, gastoForm.monto), gastoForm.monto, "el gasto")');
  assert.ok(freno > 0);
  assert.ok(freno < cuerpo.indexOf("subirArchivo("), "antes de subir la foto");
  assert.ok(freno < cuerpo.indexOf('from("cajas_gastos")'), "antes de escribir el gasto");
});

// ── La lista dice a dónde fue cada factura, y si está asignada de más ─────
//
// La lista de facturas nombraba solo los rubros. Lo cargado a una agrupación o
// a un capítulo entero no aparecía, y la factura se veía sin destino y sin el
// aviso de «sin asignar». En la obra 13 eran 108. La 171 mostraba sus cinco
// rubros y escondía la agrupación OC-03, que era el doble.

const RUBROS_LISTA = [
  { id: 1444, numero: 9300, descripcion: "RESANE DE FIBROCEMENTO EN TUMBADO · OC-03" },
  { id: 1445, numero: 9301, descripcion: "PULIDO DE ESTRUCTURAS METÁLICAS · OC-03" },
];
const AGRUPACIONES = [
  { id: 196, codigo: "OC-03", nombre: "RESANE Y PINTURA DE CIELO EXPUESTO" },
  { id: 178, codigo: "15", nombre: "Instalaciones hidráulicas" },
];

test("la 171 muestra la agrupación entera primero, y después sus rubros", () => {
  const d = destinosPorFactura([
    { factura_id: 171, obra_rubro_id: 1444, monto: 237.88 },
    { factura_id: 171, obra_actividad_id: 196, monto: 590.73 },
    { factura_id: 171, obra_rubro_id: 1445, monto: 83.87 },
  ], RUBROS_LISTA, AGRUPACIONES);
  assert.deepEqual(d[171], [
    "agrupación OC-03 RESANE Y PINTURA DE CIELO EXPUESTO",
    "9300 RESANE DE FIBROCEMENTO EN TUMBADO · OC-03",
    "9301 PULIDO DE ESTRUCTURAS METÁLICAS · OC-03",
  ]);
});

test("una factura cargada entera a una agrupación o a un capítulo ya no se ve sin destino", () => {
  const d = destinosPorFactura([
    { factura_id: 209, obra_actividad_id: 178, monto: 30.87 },
    { factura_id: 300, capitulo: "ALBAÑILERÍA", monto: 4000 },
    { factura_id: 301, obra_actividad_id: 999, monto: 10 },
  ], RUBROS_LISTA, AGRUPACIONES);
  assert.deepEqual(d[209], ["agrupación 15 Instalaciones hidráulicas"]);
  assert.deepEqual(d[300], ["capítulo ALBAÑILERÍA"]);
  assert.deepEqual(d[301], ["una agrupación que ya no está"], "si la agrupación se borró, se dice");
  assert.equal(d[999], undefined, "una factura sin asignaciones no tiene destinos");
});

test("lo asignado de más se calcula sobre lo que ya está en la base", () => {
  assert.equal(asignadoDeMas(1181.46, 590.73), 590.73);
  assert.equal(asignadoDeMas(590.73, 590.73), 0);
  assert.equal(asignadoDeMas(100, 590.73), 0, "lo que falta no es de más: eso lo dice el aviso de sin asignar");
  assert.equal(asignadoDeMas(-30.85, -30.85), 0, "una nota de crédito bien asignada no avisa");
});

test("la fila de la lista avisa lo asignado de más, y la lista y su Excel usan los destinos completos", () => {
  const fila = leer("../src/modules/controlObra/FilaFactura.jsx");
  assert.match(fila, /const deMas = asignadoDeMas\(asignado, f\.total\);/);
  assert.match(fila, /asignados de más/);
  const libro = leer("../src/modules/controlObra/LibroFacturas.jsx");
  assert.match(libro, /destinosPorFactura\(asignaciones, rubros, actividades\)/);
  assert.match(libro, /\.\.\.\(destinosDe\[f\.id\] \|\| \[\]\)/, "la línea de la fila");
  assert.match(libro, /\(destinosDe\[f\.id\] \|\| \[\]\)\.join\(" · "\) \|\| "SIN ASIGNAR"/, "la columna del Excel");
});
