// El presupuesto y la comparativa que se le comparten al cliente.
//
// Hernán, 26/11/2026: «En este caso el dueño del proyecto es dueño del
// presupuesto. Me gustaría poder compartir con él el presupuesto y estas
// comparativas también, a manera informativa, no de edición. Aunque aquí él
// podría también elegir y aprobar presupuesto para que quede constancia del
// armado del presupuesto». Definió: el cliente ve y aprueba, y «se puede
// escoger si es con utilidad o costo... dependiendo de esto el cliente lo ve o
// no».
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fotoParaElCliente, mismaFoto, pedidoDelPresupuesto, estadoDeLoCompartido, MODOS } from "../src/modules/presupuestos/presupuestoParaElCliente.js";
import { fotoParaMandar, presupuestosDelCliente, respuestaDelPresupuesto, correoDeLaRespuestaDelPresupuesto } from "../api/_presupuestoCompartido.js";
import { registroDeAprobaciones, registroParaPdf } from "../src/modules/leads/aprobaciones.js";

const codigoDe = ruta => readFileSync(new URL(ruta, import.meta.url), "utf8");
const PRESUPUESTO = { id: 33, nombre: "Casa Granja", lead_id: 7, honorarios_pct: 10, iva_pct: 15 };
const CAPITULOS = [{ nombre: "GYPSUM", orden: 1 }, { nombre: "PINTURA", orden: 2 }];
const rubro = (id, capitulo, orden, descripcion, unidad, cantidad, precio_unitario, utilidad_pct) =>
  ({ id, capitulo, orden, descripcion, unidad, cantidad, precio_unitario, precio_base: 0, utilidad_pct, total: Math.round(cantidad * precio_unitario * 100) / 100 });
const ITEMS = [
  rubro(101, "GYPSUM", 1000, "Tumbado gypsum plano regular", "m2", 125.3, 22.41, 10),
  rubro(102, "GYPSUM", 1001, "Pared una cara de gypsum", "m2", 63.82, 21.14, 10),
  rubro(103, "GYPSUM", 1002, "Pared doble cara de gypsum", "m2", 15, 37.54, 0),
  rubro(201, "PINTURA", 2000, "Pintura de caucho en paredes", "m2", 210, 6, 20),
];
const linea = (descripcion, unidad, cantidad, precio_unitario, items) => ({ descripcion, unidad, cantidad, precio_unitario, items });
const A = { id: 1, proveedor: "Empresa A", archivo_id: 71, version: 2, renglones: [
  linea("Cielo raso gypsum", "m2", 125.3, 18, [101]), linea("Tabique 1 cara", "m2", 63.82, 16, [102]),
  linea("Tabique 2 caras", "m2", 15, 28, [103]), linea("Pintura látex", "m2", 200, 5.95, [201]),
] };
const C = { id: 3, proveedor: "Empresa C", archivo_id: 73, renglones: [
  linea("Tumbado", "m2", 125.3, 19.5, [101]), linea("Pared simple", "m2", 63.82, 17, [102]), linea("Pintura de caucho", "m2", 210, 5.62, [201]),
] };
const ELEGIDOS = { 101: 1, 102: 1, 201: 3 };
const foto = (mas = {}) => fotoParaElCliente({ presupuesto: PRESUPUESTO, capitulos: CAPITULOS, items: ITEMS, cotizaciones: [A, C], elegidos: ELEGIDOS, ...mas });

test("LO QUE PIDIÓ: el cliente ve el presupuesto con lo elegido y lo que cotizó cada empresa", () => {
  const f = foto({ modo: "costo" });
  assert.deepEqual([f.modo, f.conComparativa, f.presupuesto], ["costo", true, { id: 33, nombre: "Casa Granja" }]);
  assert.deepEqual(f.empresas, [
    { id: 1, proveedor: "Empresa A", version: 2, total: 4946.02, cubre: 4 },
    { id: 3, proveedor: "Empresa C", version: 1, total: 4708.49, cubre: 3 },
  ]);
  const [gypsum, pintura] = f.capitulos;
  // EL PRESUPUESTO ES «CON LO ELEGIDO»: el tumbado va con el precio de A, haya pasado ya al presupuesto o no.
  assert.deepEqual(gypsum.rubros[0], {
    numero: "1.1", descripcion: "Tumbado gypsum plano regular", unidad: "m²", cantidad: 125.3, unitario: 18, total: 2255.4, noCotiza: false,
    elegida: 1, deQuien: "Empresa A", repartido: false,
    ofertas: [
      { id: 1, unitario: 18, cantidad: 125.3, total: 2255.4, paquete: null, estimado: false },
      { id: 3, unitario: 19.5, cantidad: 125.3, total: 2443.35, paquete: null, estimado: false },
    ],
  });
  // El que nadie eligió queda como está hoy en el presupuesto, con lo que le cotizaron a la vista.
  assert.deepEqual([gypsum.rubros[2].unitario, gypsum.rubros[2].total, gypsum.rubros[2].elegida, gypsum.rubros[2].ofertas.map(o => [o.id, o.total])],
    [37.54, 563.1, null, [[1, 420]]]);
  assert.deepEqual([pintura.rubros[0].unitario, pintura.rubros[0].total, pintura.rubros[0].elegida, pintura.rubros[0].deQuien], [5.62, 1180.2, 3, "Empresa C"]);
  // Capítulo por capítulo: lo que suma el presupuesto, y lo de cada empresa.
  assert.deepEqual([gypsum.numero, gypsum.nombre, gypsum.total], ["1", "GYPSUM", 3839.62]);
  assert.deepEqual(gypsum.empresas, [
    { id: 1, total: 3696.52, cubre: 3, faltan: 0, estimado: false, elegidos: 2 },
    { id: 3, total: 3528.29, cubre: 2, faltan: 1, estimado: false, elegidos: 0 },
  ]);
  assert.deepEqual(pintura.empresas.map(e => [e.id, e.total, e.elegidos]), [[1, 1249.5, 0], [3, 1180.2, 1]]);
  // Los totales, con la misma cuenta del PDF: subtotal, honorarios e IVA.
  assert.deepEqual([f.totales.subtotal, f.totales.honorarios_monto, f.totales.iva_pct, f.totales.iva, f.totales.total], [5019.82, 501.98, 15, 828.27, 6350.07]);
  assert.equal(f.totales.honorarios.length, 1);
  assert.match(f.totales.honorarios[0].nombre, /^Honorarios \(10\s?%\)$/);
  assert.equal(f.totales.honorarios[0].monto, 501.98);
  assert.deepEqual([f.elegidos, f.cotizados], [3, 4]);
});

test("«SE PUEDE ESCOGER SI ES CON UTILIDAD O COSTO»: con utilidad, cada precio lleva la del rubro y el costo no entra a la foto", () => {
  const f = foto({ modo: "utilidad" });
  const [gypsum, pintura] = f.capitulos;
  // Lo elegido, al precio del cliente: 18 + 10 % = 19,80; 16 + 10 % = 17,60; 5,62 + 20 % = 6,74.
  assert.deepEqual(gypsum.rubros.map(r => [r.unitario, r.total]), [[19.8, 2480.94], [17.6, 1123.23], [37.54, 563.1]]);
  assert.deepEqual([pintura.rubros[0].unitario, pintura.rubros[0].total], [6.74, 1415.4]);
  // Lo que cotizó cada empresa, también con la utilidad del rubro encima.
  assert.deepEqual(gypsum.rubros[0].ofertas.map(o => [o.id, o.unitario]), [[1, 19.8], [3, 21.45]]);
  assert.deepEqual(pintura.rubros[0].ofertas.map(o => [o.id, o.unitario, o.total]), [[1, 7.14, 1499.4], [3, 6.74, 1415.4]]);
  // El rubro sin utilidad vale lo mismo de las dos maneras: es lo que dice el presupuesto.
  assert.deepEqual(gypsum.rubros[2].ofertas.map(o => [o.unitario, o.total]), [[28, 420]]);
  // EL COSTO NO ESTÁ: ninguno de los precios que cotizaron para rubros con utilidad aparece en la foto.
  const numeros = new Set();
  JSON.stringify(f, (k, v) => { if (typeof v === "number") numeros.add(v); return v; });
  for (const costo of [18, 16, 5.62, 19.5, 17, 5.95, 2255.4, 1021.12, 1180.2, 4946.02]) assert.equal(numeros.has(costo), false, `el costo ${costo} no viaja`);
  // Y el subtotal es el de los precios al cliente.
  assert.equal(f.totales.subtotal, 5582.67);
  // Ni a costo ni con utilidad la foto lleva los campos de adentro.
  for (const m of ["costo", "utilidad"]) {
    assert.doesNotMatch(JSON.stringify(foto({ modo: m })), /"(precio_base|costo|costoAntes|utilidad_pct|cotizacion_archivo_id|archivo_id|renglones)":/);
  }
  // EL COSTO SOLO SALE SI SE ELIGIÓ A PROPÓSITO: sin decir cómo, o con un modo que no existe, va con utilidad.
  assert.equal(foto({ modo: "cualquiera" }).modo, "utilidad");
  assert.equal(foto().modo, "utilidad");
  assert.equal(foto().capitulos[0].rubros[0].unitario, 19.8);
  assert.deepEqual(Object.keys(MODOS), ["costo", "utilidad"]);
});

test("sin la comparativa, el cliente ve solo el presupuesto con lo elegido: ni empresas, ni lo que cotizó cada una", () => {
  const f = foto({ modo: "costo", conComparativa: false });
  assert.deepEqual([f.conComparativa, f.empresas, f.cotizados], [false, [], 0]);
  for (const c of f.capitulos) {
    assert.deepEqual(c.empresas, []);
    for (const r of c.rubros) assert.deepEqual(r.ofertas, []);
  }
  assert.doesNotMatch(JSON.stringify(f), /Empresa C/);
  // El presupuesto es el mismo.
  assert.equal(f.totales.total, foto({ modo: "costo" }).totales.total);
  assert.deepEqual(f.capitulos[0].rubros[0].total, 2255.4);
});

test("un paquete elegido va repartido, dice que es una parte, y el total del capítulo cierra", () => {
  const B = { id: 2, proveedor: "Empresa B", archivo_id: 72, renglones: [linea("Drywall: tumbado y paredes", "glb", 1, 3450, [101, 102, 103])] };
  const f = fotoParaElCliente({ presupuesto: PRESUPUESTO, capitulos: CAPITULOS, items: ITEMS, cotizaciones: [A, B], elegidos: { 101: 2, 102: 2, 103: 2 }, modo: "costo" });
  const gypsum = f.capitulos[0];
  assert.deepEqual(gypsum.rubros.map(r => [r.total, r.repartido, r.deQuien, r.elegida]),
    [[2052.34, true, "Empresa B", 2], [986.09, true, "Empresa B", 2], [411.57, true, "Empresa B", 2]]);
  assert.equal(gypsum.total, 3450);
  assert.deepEqual(gypsum.rubros[0].ofertas.find(o => o.id === 2), { id: 2, unitario: null, cantidad: null, total: 2052.34, paquete: "Drywall: tumbado y paredes", estimado: true });
  assert.deepEqual(gypsum.empresas.find(e => e.id === 2), { id: 2, total: 3450, cubre: 3, faltan: 0, estimado: false, elegidos: 3 });
});

test("SI CAMBIA LO ELEGIDO O UNA COTIZACIÓN, YA NO ES LO QUE VE EL CLIENTE: hay que compartir de nuevo", () => {
  const compartida = foto({ modo: "costo" });
  assert.equal(mismaFoto(compartida, foto({ modo: "costo" })), true);
  // Pasó por la base y volvió: sigue siendo la misma.
  assert.equal(mismaFoto(JSON.parse(JSON.stringify(compartida)), foto({ modo: "costo" })), true);
  assert.equal(mismaFoto(compartida, foto({ modo: "costo", elegidos: { 101: 3, 102: 1, 201: 3 } })), false);
  const A3 = { ...A, version: 3, renglones: A.renglones.map((r, k) => (k === 0 ? { ...r, precio_unitario: 17 } : r)) };
  assert.equal(mismaFoto(compartida, foto({ modo: "costo", cotizaciones: [A3, C] })), false);
  assert.equal(mismaFoto(compartida, foto({ modo: "utilidad" })), false);
  assert.equal(mismaFoto(compartida, null), false);
});

test("compartir es pedirle una aprobación: entra al registro del proyecto, sin punto del checklist", () => {
  const f = foto({ modo: "utilidad" });
  const fila = pedidoDelPresupuesto({ foto: f, leadId: 7, compartidoId: 40, quien: { id: 1, name: "Hernan Cueva" }, cuando: new Date("2026-11-26T20:00:00.000Z") });
  assert.deepEqual(fila, {
    lead_id: 7, task_id: null, presupuesto_compartido_id: 40, titulo: "Presupuesto: Casa Granja",
    descripcion: "Con la comparativa de 2 empresas · 3 rubros elegidos · total $7.062,08 · con utilidad",
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
  // Un pedido de un punto del checklist no lleva ese campo: el registro de antes no cambia.
  assert.equal("presupuesto_compartido_id" in registroDeAprobaciones([{ id: 1, lead_id: 7, task_id: 5, titulo: "Plano", pedida_at: "2026-11-01", archivos: [] }])[0], false);
});

// ── EL ENLACE DEL CLIENTE ──────────────────────────────────────────────────

test("POR EL ENLACE SALE SOLO LO QUE ESTÁ EN LA LISTA: un campo de más no viaja, y tampoco con qué criterio se compartió", () => {
  const guardada = JSON.parse(JSON.stringify(foto({ modo: "utilidad" })));
  // Alguien guardó de más: el costo, a mano, adentro de la foto.
  guardada.capitulos[0].rubros[0].precio_base = 18;
  guardada.capitulos[0].rubros[0].ofertas[0].costo = 18;
  guardada.empresas[0].archivo_id = 71;
  guardada.interno = "no mostrar";
  const sale = fotoParaMandar(guardada);
  assert.doesNotMatch(JSON.stringify(sale), /precio_base|"costo"|archivo_id|interno|"modo"|"v"/);
  assert.deepEqual(Object.keys(sale), ["conComparativa", "presupuesto", "empresas", "capitulos", "totales", "elegidos", "cotizados"]);
  assert.deepEqual(Object.keys(sale.capitulos[0].rubros[0]), ["numero", "descripcion", "unidad", "cantidad", "unitario", "total", "noCotiza", "elegida", "deQuien", "repartido", "ofertas"]);
  assert.deepEqual(sale.capitulos[0].rubros[0].ofertas[0], { id: 1, unitario: 19.8, cantidad: 125.3, total: 2480.94, paquete: null, estimado: false });
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
  const obs = respuestaDelPresupuesto({ pedido, compartido, conforme: false, nota: " Prefiero a la Empresa C en gypsum ", ahora });
  assert.deepEqual(obs.campos, { respuesta: "observado", respuesta_at: "2026-11-27T15:00:00.000Z", respuesta_nota: "Prefiero a la Empresa C en gypsum" });
  assert.equal(obs.bitacora, 'El cliente dejó observaciones en "Presupuesto: Casa Granja" desde su enlace: «Prefiero a la Empresa C en gypsum»');
  // Observar sin decir qué deja a la oficina sin saber qué cambiar.
  assert.deepEqual(respuestaDelPresupuesto({ pedido, compartido, conforme: false, nota: "" }), { error: "Contanos qué hay que cambiar.", codigo: 400 });
  assert.equal(respuestaDelPresupuesto({ pedido: { ...pedido, respuesta: "aprobado" }, compartido, conforme: false, nota: "x" }).codigo, 409);
  assert.equal(respuestaDelPresupuesto({ pedido: { ...pedido, retirada_at: "2026-11-27" }, compartido, conforme: true }).codigo, 409);
  assert.equal(respuestaDelPresupuesto({ pedido, compartido: { id: 41, retirado_at: "2026-11-27" }, conforme: true }).codigo, 409);
  // El pedido de otro proyecto no llega acá —se filtra por la llave—; y uno que no es de un presupuesto, tampoco se contesta por acá.
  assert.equal(respuestaDelPresupuesto({ pedido: null, compartido, conforme: true }).codigo, 404);
  assert.equal(respuestaDelPresupuesto({ pedido: { id: 5, titulo: "Plano", presupuesto_compartido_id: null }, compartido, conforme: true }).codigo, 404);
  assert.equal(respuestaDelPresupuesto({ pedido, compartido: null, conforme: true }).codigo, 404);
  // Una nota larguísima se corta.
  assert.equal(respuestaDelPresupuesto({ pedido, compartido, conforme: false, nota: "a".repeat(5000) }).campos.respuesta_nota.length, 2000);
});

test("a la oficina le llega un correo con lo que contestó, y lo que escribió va escapado", () => {
  const c = correoDeLaRespuestaDelPresupuesto({ proyecto: "RES BG", titulo: "Presupuesto: Casa <b>Granja</b>", aprobado: false, nota: "Cambiar <script>x</script>", app: "https://foreman.test" });
  assert.equal(c.asunto, "RES BG · el cliente dejó observaciones en «Presupuesto: Casa <b>Granja</b>»");
  assert.match(c.cuerpo, /Presupuesto: Casa &lt;b&gt;Granja&lt;\/b&gt;/);
  assert.match(c.cuerpo, /Cambiar &lt;script&gt;x&lt;\/script&gt;/);
  assert.doesNotMatch(c.cuerpo, /<script>/);
  assert.match(c.cuerpo, /se le comparte de nuevo desde la matriz de cotizaciones/);
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
  // Nada para quien no entró: el cliente no lee la tabla, la lee el servidor de su enlace.
  assert.doesNotMatch(sql, /to anon|to public/);
  assert.match(sql, /alter table public\.aprobaciones_cliente\s+add column if not exists presupuesto_compartido_id bigint references public\.presupuesto_compartidos\(id\) on delete set null/);
  assert.doesNotMatch(sql, /\b(drop table|truncate)\b|\bdelete\s+from\b|\bupdate\s+public\./i);
});

test("el servidor del enlace: lo compartido se busca por el proyecto de la llave, y la respuesta se escribe solo si sigue esperando", () => {
  const p = codigoDe("../api/portal.js");
  // Lo que ve: solo lo de su proyecto y solo lo que sigue compartido.
  assert.match(p, /`presupuesto_compartidos\?lead_id=eq\.\$\{lead\.id\}&retirado_at=is\.null`/);
  assert.match(p, /presupuestos: presupuestosDelCliente\(compartidos, pedidosDePresupuesto\),/);
  // Lo que contesta: por el id del pedido Y el proyecto de la llave, y solo un pedido de presupuesto.
  const contesta = p.slice(p.indexOf('if (que === "presupuesto") {'), p.indexOf('if (que === "orden") {'));
  assert.match(contesta, /`aprobaciones_cliente\?id=eq\.\$\{Number\(id\)\}&lead_id=eq\.\$\{lead\.id\}&presupuesto_compartido_id=not\.is\.null`/);
  assert.match(contesta, /`presupuesto_compartidos\?id=eq\.\$\{Number\(pedido\.presupuesto_compartido_id\)\}&lead_id=eq\.\$\{lead\.id\}&select=id,retirado_at`/);
  assert.match(contesta, /`aprobaciones_cliente\?id=eq\.\$\{pedido\.id\}&lead_id=eq\.\$\{lead\.id\}&respuesta=is\.null&retirada_at=is\.null`/);
  assert.match(contesta, /if \(!Array\.isArray\(escritas\) \|\| !escritas\.length\) return res\.status\(409\)/);
  // El enlace no escribe nada en el presupuesto ni en lo compartido: solo su respuesta y la historia del proyecto.
  assert.doesNotMatch(contesta, /presupuesto_items|presupuestos\?|method: "DELETE"/);
  assert.deepEqual([...contesta.matchAll(/method: "(PATCH|POST)"/g)].map(m => m[1]), ["PATCH", "POST"]);

  // El aviso al cliente entra por la puerta de avisos, con sesión, y no sale si el enlace está apagado o ya contestó.
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
  // Compartir y dejar de compartir se confirman en la pantalla, sin ventanas del navegador.
  assert.doesNotMatch(compartir, /window\.confirm|window\.alert|\bconfirm\(/);
  assert.match(compartir, /className="si-compartir"/);
  assert.match(compartir, /className="si-dejar"/);
  // Sin proyecto no hay enlace por donde verlo: se dice, en vez de ofrecer el botón.
  assert.match(compartir, /\{!leadId \? \(\s+<div className="sin-proyecto"/);
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

  const registro = codigoDe("../src/modules/leads/AprobacionesDelProyecto.jsx");
  assert.match(registro, /\{p\.presupuesto_compartido_id != null \? \(\s+<LoQueVioElCliente compartidoId=\{p\.presupuesto_compartido_id\} \/>/);
});
