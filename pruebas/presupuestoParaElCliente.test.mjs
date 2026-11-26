// El presupuesto y la comparativa que se le comparten al cliente.
//
// Hernán, 26/11/2026: «En este caso el dueño del proyecto es dueño del
// presupuesto. Me gustaría poder compartir con él el presupuesto y estas
// comparativas también, a manera informativa, no de edición. Aunque aquí él
// podría también elegir y aprobar presupuesto para que quede constancia del
// armado del presupuesto». Definió: el cliente ve y aprueba, y «se puede
// escoger si es con utilidad o costo... dependiendo de esto el cliente lo ve o
// no». Y la comparativa es por capítulo: «arriba se puede ver total de la
// oferta y si se despliega se ve el itemizado».
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fotoParaElCliente, mismaFoto, pedidoDelPresupuesto, estadoDeLoCompartido, elegidosSinUtilidad, MODOS } from "../src/modules/presupuestos/presupuestoParaElCliente.js";
import { fotoParaMandar, presupuestosDelCliente, respuestaDelPresupuesto, correoDeLaRespuestaDelPresupuesto } from "../api/_presupuestoCompartido.js";
import { registroDeAprobaciones, registroParaPdf } from "../src/modules/leads/aprobaciones.js";

const codigoDe = ruta => readFileSync(new URL(ruta, import.meta.url), "utf8");
const VIDRIO = "HERRERÍA, ALUMINIO, VIDRIO";
const PRESUPUESTO = { id: 33, nombre: "Casa Granja", lead_id: 7, honorarios_pct: 10, iva_pct: 15 };
const CAPITULOS = [{ nombre: "CARPINTERIA", orden: 1 }, { nombre: VIDRIO, orden: 2 }];
// Lo que el presupuesto ya tenía: una puerta con su utilidad, y un pasamanos.
const ITEMS = [
  { id: 501, capitulo: "CARPINTERIA", orden: 1000, descripcion: "Puerta principal", unidad: "u", cantidad: 1, precio_base: 640, utilidad_pct: 25, precio_unitario: 800, total: 800 },
  { id: 601, capitulo: VIDRIO, orden: 2000, descripcion: "Pasamanos de escalera", unidad: "ml", cantidad: 10, precio_base: 0, utilidad_pct: 0, precio_unitario: 120, total: 1200 },
];
const linea = (descripcion, cantidad, precio_unitario, mas = {}) => ({ descripcion, unidad: "u", cantidad, precio_unitario, capitulo: VIDRIO, ...mas });
const DEKORANDO = { id: 1, proveedor: "Dekorando", archivo_id: 71, renglones: [linea("V1 Dormitorio de servicio - Ventana abatible", 1, 929), linea("V3 Máquinas - Mampara 2 cuerpos", 1, 1266)] };
const ALUVID = { id: 3, proveedor: "Aluvid", archivo_id: 73, renglones: [linea("Ventana V1", 1, 880, { filas: ["c1-0"] }), linea("Mampara V3", 1, 1310, { filas: ["c1-1"] })] };
// Se eligió la V1 de Aluvid y la V3 de Dekorando.
const ELEGIDOS = { "c1-0": 3, "c1-1": 1 };
// Y así queda el presupuesto después de pasarlas y ponerle utilidad a cada rubro: 20 % y 10 %.
const PASADO = [...ITEMS,
  { id: 901, capitulo: VIDRIO, orden: 2001, descripcion: "V3 Máquinas - Mampara 2 cuerpos", unidad: "u", cantidad: 1, precio_base: 1266, utilidad_pct: 20, precio_unitario: 1519.2, total: 1519.2, comparativa_fila: "c1-1", cotizacion_proveedor: "Dekorando" },
  { id: 902, capitulo: VIDRIO, orden: 2002, descripcion: "Ventana V1", unidad: "u", cantidad: 1, precio_base: 880, utilidad_pct: 10, precio_unitario: 968, total: 968, comparativa_fila: "c1-0", cotizacion_proveedor: "Aluvid" },
];
const foto = (mas = {}) => fotoParaElCliente({ presupuesto: PRESUPUESTO, capitulos: CAPITULOS, items: ITEMS, cotizaciones: [DEKORANDO, ALUVID], elegidos: ELEGIDOS, ...mas });
const numerosDe = f => { const s = new Set(); JSON.stringify(f, (k, v) => { if (typeof v === "number") s.add(v); return v; }); return s; };

test("LO QUE PIDIÓ: el cliente ve el presupuesto con lo elegido y, por capítulo, el total de cada oferta y su itemizado", () => {
  const f = foto({ modo: "costo" });
  assert.deepEqual([f.modo, f.conComparativa, f.presupuesto], ["costo", true, { id: 33, nombre: "Casa Granja" }]);
  assert.deepEqual(f.empresas, [{ id: 1, proveedor: "Dekorando", version: 1, total: 2195 }, { id: 3, proveedor: "Aluvid", version: 1, total: 2190 }]);
  const [carpinteria, vidrio] = f.capitulos;
  // Un capítulo donde no se pidió precio: sus rubros, y nada que comparar.
  assert.deepEqual(carpinteria, { numero: "1", nombre: "CARPINTERIA", total: 640, comparativa: null,
    rubros: [{ numero: "1.1", descripcion: "Puerta principal", unidad: "u", cantidad: 1, unitario: 640, total: 640, noCotiza: false, deQuien: null }] });
  // EL PRESUPUESTO ES «CON LO ELEGIDO»: los renglones elegidos ya figuran como rubros del capítulo, hayan pasado o no.
  assert.deepEqual(vidrio.rubros.map(r => [r.numero, r.descripcion, r.cantidad, r.unitario, r.total, r.deQuien]), [
    ["2.1", "Pasamanos de escalera", 10, 120, 1200, null],
    ["2.2", "V3 Máquinas - Mampara 2 cuerpos", 1, 1266, 1266, "Dekorando"],
    ["2.3", "Ventana V1", 1, 880, 880, "Aluvid"],
  ]);
  assert.equal(vidrio.total, 3346);
  // LA COMPARATIVA DEL CAPÍTULO: arriba el total de cada oferta...
  assert.deepEqual(vidrio.comparativa.empresas, [
    { id: 1, total: 2195, faltan: 0, estimado: false, elegidas: 1 }, { id: 3, total: 2190, faltan: 0, estimado: false, elegidas: 1 }]);
  // ...y el itemizado: fila por fila, lo de cada una, con la elegida marcada.
  assert.deepEqual(vidrio.comparativa.filas, [
    { descripcion: "V1 Dormitorio de servicio - Ventana abatible", unidad: "u", cantidad: 1, elegida: 3,
      ofertas: [{ id: 1, cantidad: 1, unitario: 929, total: 929, estimado: false }, { id: 3, cantidad: 1, unitario: 880, total: 880, estimado: false }] },
    { descripcion: "V3 Máquinas - Mampara 2 cuerpos", unidad: "u", cantidad: 1, elegida: 1,
      ofertas: [{ id: 1, cantidad: 1, unitario: 1266, total: 1266, estimado: false }, { id: 3, cantidad: 1, unitario: 1310, total: 1310, estimado: false }] },
  ]);
  // Los totales, con la misma cuenta del PDF: 640 + 3.346, honorarios 10 % e IVA 15 %.
  assert.deepEqual([f.totales.subtotal, f.totales.honorarios_monto, f.totales.iva_pct, f.totales.iva, f.totales.total], [3986, 398.6, 15, 657.69, 5042.29]);
  assert.match(f.totales.honorarios[0].nombre, /^Honorarios \(10\s?%\)$/);
  assert.deepEqual([f.elegidos, f.cotizados], [2, 2]);
  // Ya pasado al presupuesto, la foto es la misma: es el presupuesto con lo elegido.
  const sinUtilidad = PASADO.map(i => (i.comparativa_fila ? { ...i, utilidad_pct: 0, precio_unitario: i.precio_base, total: i.precio_base } : i));
  assert.deepEqual(foto({ modo: "costo", items: sinUtilidad }).capitulos, f.capitulos);
});

test("«SE PUEDE ESCOGER SI ES CON UTILIDAD O COSTO»: con utilidad cada oferta lleva la del rubro de su fila, y el costo no entra a la foto", () => {
  const f = foto({ modo: "utilidad", items: PASADO });
  const [carpinteria, vidrio] = f.capitulos;
  // El presupuesto, al precio del cliente: la puerta a 800, la V3 a 1.266 + 20 %, la V1 a 880 + 10 %.
  assert.deepEqual(carpinteria.rubros.map(r => [r.unitario, r.total]), [[800, 800]]);
  assert.deepEqual(vidrio.rubros.map(r => [r.descripcion.slice(0, 9), r.unitario, r.total]), [["Pasamanos", 120, 1200], ["V3 Máquin", 1519.2, 1519.2], ["Ventana V", 968, 968]]);
  // En la comparativa, la oferta ELEGIDA muestra exactamente el precio de su rubro; la otra, con la misma utilidad de esa fila.
  assert.deepEqual(vidrio.comparativa.filas.map(x => [x.elegida, x.ofertas.map(o => [o.id, o.unitario, o.total])]), [
    [3, [[1, 1021.9, 1021.9], [3, 968, 968]]],
    [1, [[1, 1519.2, 1519.2], [3, 1572, 1572]]],
  ]);
  // El total de cada oferta es la suma de lo que se ve de ella.
  assert.deepEqual(vidrio.comparativa.empresas.map(e => [e.id, e.total]), [[1, 2541.1], [3, 2540]]);
  assert.deepEqual(f.empresas.map(e => e.total), [2541.1, 2540]);
  assert.deepEqual([f.totales.subtotal, f.totales.total], [4487.2, 5676.31]);
  // EL COSTO NO ESTÁ: ninguno de los precios que cotizaron, ni el costo de la puerta, aparece en la foto.
  const numeros = numerosDe(f);
  for (const costo of [929, 880, 1266, 1310, 640, 2195, 2190]) assert.equal(numeros.has(costo), false, `el costo ${costo} no viaja`);
  // Ni a costo ni con utilidad la foto lleva los campos de adentro.
  for (const m of ["costo", "utilidad"]) {
    assert.doesNotMatch(JSON.stringify(foto({ modo: m, items: PASADO })), /"(precio_base|costo|costoAntes|utilidad_pct|cotizacion_archivo_id|archivo_id|renglones|comparativa_fila|marca)":/);
  }
  // EL COSTO SOLO SALE SI SE ELIGIÓ A PROPÓSITO: sin decir cómo, o con un modo que no existe, va con utilidad.
  assert.equal(foto({ modo: "cualquiera", items: PASADO }).modo, "utilidad");
  assert.equal(foto({ items: PASADO }).capitulos[1].rubros[1].unitario, 1519.2);
  assert.deepEqual(Object.keys(MODOS), ["costo", "utilidad"]);
});

test("con utilidad, lo que no tiene de dónde sacarla no viaja; y lo elegido sin utilidad se avisa antes de compartir", () => {
  // Nada elegido en el capítulo: con utilidad su comparativa no viaja —sería mostrar el costo—; a costo, sí.
  assert.equal(foto({ modo: "utilidad", elegidos: {} }).capitulos[1].comparativa, null);
  assert.deepEqual(foto({ modo: "utilidad", elegidos: {} }).empresas, []);
  assert.equal(foto({ modo: "costo", elegidos: {} }).capitulos[1].comparativa.filas.length, 2);
  // Elegido pero todavía sin utilidad: se vería al costo. Es lo que la pantalla avisa.
  const base = { capitulos: CAPITULOS, cotizaciones: [DEKORANDO, ALUVID], elegidos: ELEGIDOS };
  assert.equal(elegidosSinUtilidad({ ...base, items: ITEMS }), 2);
  assert.equal(elegidosSinUtilidad({ ...base, items: PASADO }), 0);
  assert.equal(elegidosSinUtilidad({ ...base, items: PASADO.map(i => (i.id === 902 ? { ...i, utilidad_pct: 0, precio_unitario: 880, total: 880 } : i)) }), 1);
  // Una fila que nadie tiene elegida, en un capítulo que sí tiene elegidas, lleva la proporción del capítulo.
  const soloLaV3 = foto({ modo: "utilidad", items: PASADO.filter(i => i.id !== 902), elegidos: { "c1-1": 1 } });
  assert.deepEqual(soloLaV3.capitulos[1].comparativa.filas[0].ofertas.map(o => o.unitario), [1114.8, 1056]);
});

test("sin la comparativa, el cliente ve solo el presupuesto con lo elegido: ni empresas, ni lo que cotizó cada una", () => {
  const f = foto({ modo: "costo", conComparativa: false });
  assert.deepEqual([f.conComparativa, f.empresas, f.cotizados], [false, [], 0]);
  for (const c of f.capitulos) { assert.equal(c.comparativa, null); for (const r of c.rubros) assert.equal(r.deQuien, null); }
  assert.doesNotMatch(JSON.stringify(f), /Dekorando|Aluvid/);
  // El presupuesto es el mismo.
  assert.equal(f.totales.total, foto({ modo: "costo" }).totales.total);
  assert.equal(f.capitulos[1].rubros[1].total, 1266);
});

test("la empresa que mandó una sola suma: su renglón entra entero al presupuesto, y en el itemizado su parte va marcada como estimada", () => {
  const WINDOW = { id: 2, proveedor: "Window World", renglones: [linea("Sistema corredizo europeo minimal", 1, 2300, { unidad: "glb", filas: ["c1-0", "c1-1"] })] };
  const f = fotoParaElCliente({ presupuesto: PRESUPUESTO, capitulos: CAPITULOS, items: ITEMS, cotizaciones: [DEKORANDO, WINDOW], elegidos: { "c1-0": 2, "c1-1": 2 }, modo: "costo" });
  const vidrio = f.capitulos[1];
  assert.deepEqual(vidrio.rubros.map(r => [r.descripcion, r.cantidad, r.total, r.deQuien]), [["Pasamanos de escalera", 10, 1200, null], ["Sistema corredizo europeo minimal", 1, 2300, "Window World"]]);
  assert.deepEqual(vidrio.comparativa.empresas, [{ id: 1, total: 2195, faltan: 0, estimado: false, elegidas: 0 }, { id: 2, total: 2300, faltan: 0, estimado: false, elegidas: 2 }]);
  // 2.300 repartido en proporción a 929 y 1.266.
  assert.deepEqual(vidrio.comparativa.filas[0].ofertas[1], { id: 2, cantidad: null, unitario: null, total: 973.44, estimado: true });
  assert.equal(vidrio.comparativa.filas[0].ofertas[1].total + vidrio.comparativa.filas[1].ofertas[1].total, 2300);
});

test("SI CAMBIA LO ELEGIDO O UNA COTIZACIÓN, YA NO ES LO QUE VE EL CLIENTE: hay que compartir de nuevo", () => {
  const compartida = foto({ modo: "costo" });
  assert.equal(mismaFoto(compartida, foto({ modo: "costo" })), true);
  assert.equal(mismaFoto(JSON.parse(JSON.stringify(compartida)), foto({ modo: "costo" })), true);   // pasó por la base y volvió
  assert.equal(mismaFoto(compartida, foto({ modo: "costo", elegidos: { "c1-0": 1, "c1-1": 1 } })), false);
  const A2 = { ...ALUVID, version: 2, renglones: [linea("Ventana V1", 1, 850, { filas: ["c1-0"] }), ALUVID.renglones[1]] };
  assert.equal(mismaFoto(compartida, foto({ modo: "costo", cotizaciones: [DEKORANDO, A2] })), false);
  assert.equal(mismaFoto(compartida, foto({ modo: "utilidad" })), false);
  assert.equal(mismaFoto(compartida, null), false);
});

test("compartir es pedirle una aprobación: entra al registro del proyecto, sin punto del checklist", () => {
  const f = foto({ modo: "utilidad", items: PASADO });
  const fila = pedidoDelPresupuesto({ foto: f, leadId: 7, compartidoId: 40, quien: { id: 1, name: "Hernan Cueva" }, cuando: new Date("2026-11-26T20:00:00.000Z") });
  assert.deepEqual(fila, {
    lead_id: 7, task_id: null, presupuesto_compartido_id: 40, titulo: "Presupuesto: Casa Granja",
    descripcion: "Con la comparativa de 2 empresas · 2 rubros elegidos · total $5.676,31 · con utilidad",
    pedida_at: "2026-11-26T20:00:00.000Z", pedida_por: 1, pedida_nombre: "Hernan Cueva",
  });
  assert.equal(pedidoDelPresupuesto({ foto: foto({ conComparativa: false }), leadId: 7, compartidoId: 41 }).descripcion.startsWith("Sin la comparativa de empresas · "), true);
  // En qué está, para decirlo en la matriz.
  assert.equal(estadoDeLoCompartido(null, null).estado, "nada");
  assert.equal(estadoDeLoCompartido({ id: 40 }, { respuesta: null }).estado, "pendiente");
  assert.deepEqual(estadoDeLoCompartido({ id: 40 }, { respuesta: "aprobado" }), { estado: "aprobado", dice: "El cliente lo aprobó", tono: "success" });
  assert.equal(estadoDeLoCompartido({ id: 40 }, { respuesta: "observado" }).estado, "observado");
  assert.equal(estadoDeLoCompartido({ id: 40, retirado_at: "2026-11-27" }, { respuesta: null }).estado, "retirado");
  // Y EL REGISTRO LO LEE COMO UN PEDIDO MÁS, sabiendo que lo que tenía a la vista es la foto.
  const registro = registroDeAprobaciones([{ id: 9, ...fila, respuesta: "aprobado", respuesta_at: "2026-11-27T15:00:00.000Z", respuesta_nota: "De acuerdo", avisos: [], archivos: [] }]);
  assert.deepEqual([registro[0].titulo, registro[0].estado, registro[0].task_id, registro[0].presupuesto_compartido_id, registro[0].vigente],
    ["Presupuesto: Casa Granja", "aprobado", null, 40, true]);
  assert.equal(registroParaPdf(registro, { proyecto: "RES BG" }).bloques[0].filas[0][2], "El presupuesto y su comparativa, como se le compartieron");
  assert.equal("presupuesto_compartido_id" in registroDeAprobaciones([{ id: 1, lead_id: 7, task_id: 5, titulo: "Plano", pedida_at: "2026-11-01", archivos: [] }])[0], false);
});

// ── EL ENLACE DEL CLIENTE ──────────────────────────────────────────────────

test("POR EL ENLACE SALE SOLO LO QUE ESTÁ EN LA LISTA: un campo de más no viaja, y tampoco con qué criterio se compartió", () => {
  const guardada = JSON.parse(JSON.stringify(foto({ modo: "utilidad", items: PASADO })));
  // Alguien guardó de más: el costo, a mano, adentro de la foto.
  guardada.capitulos[1].rubros[1].precio_base = 1266;
  guardada.capitulos[1].comparativa.filas[0].ofertas[0].costo = 929;
  guardada.capitulos[1].comparativa.empresas[0].archivo_id = 71;
  guardada.interno = "no mostrar";
  const sale = fotoParaMandar(guardada);
  assert.doesNotMatch(JSON.stringify(sale), /precio_base|"costo"|archivo_id|interno|"modo"|"v"/);
  assert.deepEqual(Object.keys(sale), ["conComparativa", "presupuesto", "empresas", "capitulos", "totales", "elegidos", "cotizados"]);
  assert.deepEqual(Object.keys(sale.capitulos[1]), ["numero", "nombre", "total", "rubros", "comparativa"]);
  assert.deepEqual(Object.keys(sale.capitulos[1].rubros[1]), ["numero", "descripcion", "unidad", "cantidad", "unitario", "total", "noCotiza", "deQuien"]);
  assert.deepEqual(sale.capitulos[1].comparativa.filas[0].ofertas[0], { id: 1, cantidad: 1, unitario: 1021.9, total: 1021.9, estimado: false });
  assert.deepEqual(sale.capitulos[1].comparativa.empresas[0], { id: 1, total: 2541.1, faltan: 0, estimado: false, elegidas: 1 });
  assert.equal(sale.capitulos[0].comparativa, null);
  assert.equal(sale.totales.total, guardada.totales.total);
  assert.deepEqual(sale.presupuesto, { nombre: "Casa Granja" });
  // Lo que no es una foto no sale.
  assert.equal(fotoParaMandar(null), null);
  assert.equal(fotoParaMandar({ algo: 1 }), null);
});

test("el cliente ve UNA foto de cada presupuesto: la última que se compartió y no se retiró", () => {
  const f = foto({ modo: "costo" });
  const compartidos = [
    { id: 40, presupuesto_id: 33, foto: f, created_at: "2026-11-26T20:00:00.000Z", retirado_at: "2026-11-27T10:00:00.000Z" },
    { id: 41, presupuesto_id: 33, foto: f, created_at: "2026-11-27T10:00:00.000Z", retirado_at: null },
    { id: 42, presupuesto_id: 50, foto: foto({ modo: "utilidad", presupuesto: { ...PRESUPUESTO, id: 50, nombre: "Exteriores" } }), created_at: "2026-11-28T02:30:00.000Z", retirado_at: null },
    { id: 43, presupuesto_id: 60, foto: f, created_at: "2026-11-28T10:00:00.000Z", retirado_at: null },   // su pedido se retiró
    { id: 44, presupuesto_id: 70, foto: { roto: true }, created_at: "2026-11-28T11:00:00.000Z", retirado_at: null },
  ];
  const pedidos = [
    { id: 9, presupuesto_compartido_id: 40, titulo: "Presupuesto: Casa Granja", respuesta: "aprobado", respuesta_at: "2026-11-26T22:00:00.000Z" },
    { id: 10, presupuesto_compartido_id: 41, titulo: "Presupuesto: Casa Granja", respuesta: null },
    { id: 11, presupuesto_compartido_id: 42, titulo: "Presupuesto: Exteriores", respuesta: "observado", respuesta_at: "2026-11-28T03:10:00.000Z", respuesta_nota: " Falta el cerramiento " },
    { id: 12, presupuesto_compartido_id: 43, titulo: "Presupuesto: Otro", respuesta: null, retirada_at: "2026-11-28T12:00:00.000Z" },
    { id: 13, presupuesto_compartido_id: 44, titulo: "Presupuesto: Roto", respuesta: null },
  ];
  const ve = presupuestosDelCliente(compartidos, pedidos);
  // Lo más nuevo arriba; con el id del PEDIDO, que es con lo que contesta; y el día de Ecuador.
  assert.deepEqual(ve.map(p => [p.id, p.titulo, p.estado, p.compartido_el, p.respondido_el, p.nota]), [
    [11, "Presupuesto: Exteriores", "observado", "2026-11-27", "2026-11-27", "Falta el cerramiento"],
    [10, "Presupuesto: Casa Granja", "pendiente", "2026-11-27", null, ""],
  ]);
  assert.equal("modo" in ve[0].foto, false);
  assert.deepEqual(presupuestosDelCliente([], []), []);
  assert.deepEqual(presupuestosDelCliente(null, null), []);
});

test("CONTESTA UNA VEZ: aprueba, o deja una observación diciendo qué; lo retirado y lo ya contestado no se contestan", () => {
  const pedido = { id: 10, titulo: "Presupuesto: Casa Granja", presupuesto_compartido_id: 41, respuesta: null, retirada_at: null };
  const compartido = { id: 41, retirado_at: null };
  const ahora = new Date("2026-11-27T15:00:00.000Z");
  assert.deepEqual(respuestaDelPresupuesto({ pedido, compartido, conforme: true, nota: "  ", ahora }), {
    aprobado: true, nota: "",
    campos: { respuesta: "aprobado", respuesta_at: "2026-11-27T15:00:00.000Z", respuesta_nota: null },
    bitacora: 'El cliente aprobó "Presupuesto: Casa Granja" desde su enlace.',
  });
  const obs = respuestaDelPresupuesto({ pedido, compartido, conforme: false, nota: " Prefiero a Dekorando en la V1 ", ahora });
  assert.deepEqual(obs.campos, { respuesta: "observado", respuesta_at: "2026-11-27T15:00:00.000Z", respuesta_nota: "Prefiero a Dekorando en la V1" });
  assert.equal(obs.bitacora, 'El cliente dejó observaciones en "Presupuesto: Casa Granja" desde su enlace: «Prefiero a Dekorando en la V1»');
  assert.deepEqual(respuestaDelPresupuesto({ pedido, compartido, conforme: false, nota: "" }), { error: "Contanos qué hay que cambiar.", codigo: 400 });
  assert.equal(respuestaDelPresupuesto({ pedido: { ...pedido, respuesta: "aprobado" }, compartido, conforme: false, nota: "x" }).codigo, 409);
  assert.equal(respuestaDelPresupuesto({ pedido: { ...pedido, retirada_at: "2026-11-27" }, compartido, conforme: true }).codigo, 409);
  assert.equal(respuestaDelPresupuesto({ pedido, compartido: { id: 41, retirado_at: "2026-11-27" }, conforme: true }).codigo, 409);
  assert.equal(respuestaDelPresupuesto({ pedido: null, compartido, conforme: true }).codigo, 404);
  assert.equal(respuestaDelPresupuesto({ pedido: { id: 5, titulo: "Plano", presupuesto_compartido_id: null }, compartido, conforme: true }).codigo, 404);
  assert.equal(respuestaDelPresupuesto({ pedido, compartido: null, conforme: true }).codigo, 404);
  assert.equal(respuestaDelPresupuesto({ pedido, compartido, conforme: false, nota: "a".repeat(5000) }).campos.respuesta_nota.length, 2000);
});

test("a la oficina le llega un correo con lo que contestó, y lo que escribió va escapado", () => {
  const c = correoDeLaRespuestaDelPresupuesto({ proyecto: "RES BG", titulo: "Presupuesto: Casa <b>Granja</b>", aprobado: false, nota: "Cambiar <script>x</script>", app: "https://foreman.test" });
  assert.equal(c.asunto, "RES BG · el cliente dejó observaciones en «Presupuesto: Casa <b>Granja</b>»");
  assert.match(c.cuerpo, /Presupuesto: Casa &lt;b&gt;Granja&lt;\/b&gt;/);
  assert.match(c.cuerpo, /Cambiar &lt;script&gt;x&lt;\/script&gt;/);
  assert.doesNotMatch(c.cuerpo, /<script>/);
  assert.match(correoDeLaRespuestaDelPresupuesto({ proyecto: "RES BG", titulo: "Presupuesto: X", aprobado: true }).asunto, /el cliente aprobó «Presupuesto: X»/);
});

// ── LO QUE NO SE PUEDE PROBAR SIN BASE: que el código lo diga ──────────────

test("la migración 196 solo agrega: la tabla de lo compartido, con el acceso del equipo, y una columna al registro", () => {
  const sql = codigoDe("../supabase/migrations/196_el_presupuesto_que_ve_el_cliente.sql").split("\n").filter(l => !l.trim().startsWith("--")).join("\n");
  assert.match(sql, /create table if not exists public\.presupuesto_compartidos/);
  assert.match(sql, /presupuesto_id\s+bigint references public\.presupuestos\(id\) on delete set null/);
  assert.match(sql, /lead_id\s+bigint not null references public\.leads\(id\) on delete cascade/);
  assert.match(sql, /check \(modo in \('costo', 'utilidad'\)\)/);
  assert.match(sql, /foto\s+jsonb not null/);
  assert.match(sql, /alter table public\.presupuesto_compartidos enable row level security/);
  assert.match(sql, /create policy "equipo foreman" on public\.presupuesto_compartidos for all to authenticated using \(true\) with check \(true\)/);
  assert.doesNotMatch(sql, /to anon|to public/);
  assert.match(sql, /alter table public\.aprobaciones_cliente\s+add column if not exists presupuesto_compartido_id bigint references public\.presupuesto_compartidos\(id\) on delete set null/);
  assert.doesNotMatch(sql, /\b(drop table|truncate)\b|\bdelete\s+from\b|\bupdate\s+public\./i);
});

test("el servidor del enlace: lo compartido se busca por el proyecto de la llave, y la respuesta se escribe solo si sigue esperando", () => {
  const p = codigoDe("../api/portal.js");
  assert.match(p, /`presupuesto_compartidos\?lead_id=eq\.\$\{lead\.id\}&retirado_at=is\.null`/);
  assert.match(p, /presupuestos: presupuestosDelCliente\(compartidos, pedidosDePresupuesto\),/);
  const contesta = p.slice(p.indexOf('if (que === "presupuesto") {'), p.indexOf('if (que === "orden") {'));
  assert.match(contesta, /`aprobaciones_cliente\?id=eq\.\$\{Number\(id\)\}&lead_id=eq\.\$\{lead\.id\}&presupuesto_compartido_id=not\.is\.null`/);
  assert.match(contesta, /`presupuesto_compartidos\?id=eq\.\$\{Number\(pedido\.presupuesto_compartido_id\)\}&lead_id=eq\.\$\{lead\.id\}&select=id,retirado_at`/);
  assert.match(contesta, /`aprobaciones_cliente\?id=eq\.\$\{pedido\.id\}&lead_id=eq\.\$\{lead\.id\}&respuesta=is\.null&retirada_at=is\.null`/);
  assert.match(contesta, /if \(!Array\.isArray\(escritas\) \|\| !escritas\.length\) return res\.status\(409\)/);
  // El enlace no escribe nada en el presupuesto ni en lo compartido: solo su respuesta y la historia del proyecto.
  assert.doesNotMatch(contesta, /presupuesto_items|presupuestos\?|method: "DELETE"/);
  assert.deepEqual([...contesta.matchAll(/method: "(PATCH|POST)"/g)].map(m => m[1]), ["PATCH", "POST"]);
  assert.match(codigoDe("../api/aviso.js"), /import presupuesto from "\.\/_aviso-presupuesto\.js";/);
  const aviso = codigoDe("../api/_aviso-presupuesto.js");
  assert.match(aviso, /if \(!\(await sesionValida\(req\)\)\) return res\.status\(401\)/);
  assert.match(aviso, /if \(!lead\.portal_activo \|\| !lead\.portal_token\)/);
  assert.match(aviso, /&lead_id=eq\.\$\{lead\.id\}&presupuesto_compartido_id=not\.is\.null/);
  assert.match(aviso, /if \(pedido\.respuesta\) return res\.status\(200\)\.json\(\{ ok: false/);
});

test("las pantallas: se comparte desde la matriz, el cliente lo ve en su solapa, y el registro abre lo que tuvo a la vista", () => {
  const matriz = codigoDe("../src/modules/presupuestos/MatrizCotizaciones.jsx");
  assert.match(matriz, /<CompartirConElCliente presupuesto=\{presupuesto\} capitulos=\{capitulos\} items=\{items\} cotizaciones=\{cots\} elegidos=\{vigentes\}/);
  const compartir = codigoDe("../src/modules/presupuestos/CompartirConElCliente.jsx");
  assert.doesNotMatch(compartir, /window\.confirm|window\.alert|\bconfirm\(/);
  assert.match(compartir, /className="si-compartir"/);
  assert.match(compartir, /className="si-dejar"/);
  assert.match(compartir, /\{!leadId \? \(\s+<div className="sin-proyecto"/);
  // Con utilidad, lo que se vería al costo se avisa antes de compartir.
  assert.match(compartir, /\{sinUtilidad > 0 && \(\s+<div className="sin-utilidad"/);
  // Quitar lo compartido no borra la foto ni la respuesta: marca la fecha.
  const guardar = codigoDe("../src/modules/presupuestos/compartidosDelPresupuesto.js");
  const retirar = guardar.slice(guardar.indexOf("async function retirar"), guardar.indexOf("const anotar"));
  assert.doesNotMatch(retirar, /\.delete\(\)/);
  assert.match(retirar, /\.in\("presupuesto_compartido_id", ids\)\.is\("respuesta", null\)\.is\("retirada_at", null\)/);

  const portal = codigoDe("../src/portal/PortalCliente.jsx");
  assert.match(portal, /\["presupuesto", "Presupuesto", presupuestosPendientes\.length\]/);
  assert.match(portal, /contestar\(\{ que: "presupuesto", id: p\.id, conforme, nota \}\)/);
  // La pieza del cliente dibuja la foto: no sabe de costos ni de utilidades, ni tiene nada para editar.
  const pieza = codigoDe("../src/portal/PresupuestoCompartido.jsx");
  const sinComentarios = pieza.split("\n").filter(l => !l.trim().startsWith("//")).join("\n");
  assert.doesNotMatch(sinComentarios, /utilidad|precio_base|costo|supabase|<input|<select/i);
  assert.match(pieza, /className="lo-apruebo"/);
  // «Arriba el total de la oferta, y si se despliega el itemizado», también para él.
  assert.match(pieza, /className="ofertas-del-capitulo"/);
  assert.match(pieza, /\{abierto && cuadro && \(\s+<div className="itemizado-de-las-ofertas"/);
  const registro = codigoDe("../src/modules/leads/AprobacionesDelProyecto.jsx");
  assert.match(registro, /\{p\.presupuesto_compartido_id != null \? \(\s+<LoQueVioElCliente compartidoId=\{p\.presupuesto_compartido_id\} \/>/);
});

// Hernán, 26/11/2026, con una empresa que además de las ventanas cotizó
// cabinas de baño y claraboyas: «me gustaría tener la opción de borrar rubros
// para comparar mismas condiciones».
test("LO QUE SE SACÓ DE LA COMPARACIÓN NO LE LLEGA AL CLIENTE: ve las ofertas sobre lo mismo", () => {
  const conCabinas = { ...ALUVID, renglones: [...ALUVID.renglones, linea("Cabinas de baño", 1, 3310, { fuera: true })] };
  const sin = foto({ modo: "costo" }), con = foto({ modo: "costo", cotizaciones: [DEKORANDO, conCabinas] });
  assert.deepEqual(con.empresas, sin.empresas);
  assert.deepEqual(con.capitulos, sin.capitulos);
  assert.equal(JSON.stringify(con).includes("Cabinas"), false);
  // Si no se saca, sí la ve: una fila más, y el total de esa empresa con ella.
  const adentro = foto({ modo: "costo", cotizaciones: [DEKORANDO, { ...conCabinas, renglones: conCabinas.renglones.map(r => ({ ...r, fuera: false })) }] });
  assert.equal(adentro.empresas[1].total, 5500);
  assert.equal(adentro.capitulos[1].comparativa.filas.length, 3);
});
