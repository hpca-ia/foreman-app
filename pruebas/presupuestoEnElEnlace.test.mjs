// El presupuesto compartido, en el enlace del cliente, de punta a punta.
//
// Se corre el servidor de verdad (api/portal.js) contra una base de mentira
// que contesta como PostgREST, igual que en enlaceDelCliente.test.mjs: la
// llave abre UN proyecto, y de ahí sale lo que ve y lo que puede contestar.
//
// Hernán, 26/11/2026: «compartir con él el presupuesto y estas comparativas
// también, a manera informativa, no de edición. Aunque aquí él podría también
// elegir y aprobar presupuesto para que quede constancia».
import { test } from "node:test";
import assert from "node:assert/strict";
import { fotoParaElCliente } from "../src/modules/presupuestos/presupuestoParaElCliente.js";

process.env.SUPABASE_SECRET_KEY = "sb_secret_de_prueba";
const { default: portal } = await import("../api/portal.js");

const LLAVE = "k3Jd8sQw1ZpL0aXv7NcR5tYb2UeHg9Mi";
const OTRA_LLAVE = "Zz9Yy8Xx7Ww6Vv5Uu4Tt3Ss2Rr1Qq0Pp";
const ITEMS = [
  { id: 101, capitulo: "GYPSUM", orden: 1, descripcion: "Tumbado gypsum", unidad: "m2", cantidad: 100, precio_unitario: 22, precio_base: 0, utilidad_pct: 10, total: 2200 },
  { id: 201, capitulo: "PINTURA", orden: 2, descripcion: "Pintura de caucho", unidad: "m2", cantidad: 200, precio_unitario: 6, precio_base: 0, utilidad_pct: 20, total: 1200 },
];
const A = { id: 1, proveedor: "Empresa A", renglones: [{ descripcion: "Cielo raso", unidad: "m2", cantidad: 100, precio_unitario: 18, items: [101] }, { descripcion: "Pintura", unidad: "m2", cantidad: 200, precio_unitario: 5, items: [201] }] };
const C = { id: 3, proveedor: "Empresa C", renglones: [{ descripcion: "Tumbado", unidad: "m2", cantidad: 100, precio_unitario: 19.5, items: [101] }] };
const foto = modo => fotoParaElCliente({
  presupuesto: { id: 33, nombre: "Casa Granja", iva_pct: 15 }, capitulos: [{ nombre: "GYPSUM", orden: 1 }, { nombre: "PINTURA", orden: 2 }],
  items: ITEMS, cotizaciones: [A, C], elegidos: { 101: 1, 201: 1 }, modo,
});

let tablas, escrituras, correos, sinTabla;
function base() {
  sinTabla = new Set();
  tablas = {
    leads: [
      { id: 13, nombre: "RES BG", obra_id: null, portal_token: LLAVE, portal_activo: true, responsable_id: 2 },
      { id: 14, nombre: "OTRO PROYECTO", obra_id: null, portal_token: OTRA_LLAVE, portal_activo: true, responsable_id: 2 },
    ],
    tasks: [],
    usuarios: [{ id: 1, email: "quien-compartio@oficina.test", activo: true }, { id: 2, email: "responsable@oficina.test", activo: true }],
    presupuesto_compartidos: [
      // Lo que se compartió primero, ya reemplazado.
      { id: 40, presupuesto_id: 33, lead_id: 13, modo: "costo", foto: foto("costo"), created_at: "2026-11-26T20:00:00.000Z", retirado_at: "2026-11-27T10:00:00.000Z" },
      // Lo que ve hoy: con utilidad.
      { id: 41, presupuesto_id: 33, lead_id: 13, modo: "utilidad", foto: foto("utilidad"), created_at: "2026-11-27T10:00:00.000Z", retirado_at: null },
      // El de otro proyecto.
      { id: 50, presupuesto_id: 90, lead_id: 14, modo: "costo", foto: foto("costo"), created_at: "2026-11-27T11:00:00.000Z", retirado_at: null },
    ],
    aprobaciones_cliente: [
      { id: 9, lead_id: 13, task_id: null, presupuesto_compartido_id: 40, titulo: "Presupuesto: Casa Granja", pedida_por: 1, respuesta: null, retirada_at: "2026-11-27T10:00:00.000Z", archivos: [] },
      { id: 10, lead_id: 13, task_id: null, presupuesto_compartido_id: 41, titulo: "Presupuesto: Casa Granja", pedida_por: 1, respuesta: null, retirada_at: null, archivos: [] },
      { id: 20, lead_id: 14, task_id: null, presupuesto_compartido_id: 50, titulo: "Presupuesto: Otro", pedida_por: 1, respuesta: null, retirada_at: null, archivos: [] },
      // Un pedido de un punto del checklist, que no es de un presupuesto.
      { id: 30, lead_id: 13, task_id: 5, presupuesto_compartido_id: null, titulo: "Plano de cocina", pedida_por: 1, respuesta: null, retirada_at: null, archivos: [] },
    ],
    lead_movimientos: [],
  };
  escrituras = []; correos = [];
  const contesta = (status, cuerpo) => ({ ok: status < 400, status, json: async () => cuerpo, text: async () => JSON.stringify(cuerpo) });
  globalThis.fetch = async (url, op = {}) => {
    const u = new URL(url);
    if (!u.pathname.startsWith("/rest/v1/")) {
      if (u.pathname.startsWith("/storage/")) return contesta(200, []);
      correos.push({ url: String(url), cuerpo: op.body ? JSON.parse(op.body) : null });
      return contesta(200, { id: "correo-de-prueba" });
    }
    const tabla = u.pathname.replace("/rest/v1/", "");
    // Una tabla que todavía no existe —la migración sin correr— contesta un error, no una lista.
    if (sinTabla.has(tabla)) return contesta(404, { code: "42P01", message: `relation "public.${tabla}" does not exist` });
    if (!tablas[tabla]) tablas[tabla] = [];
    const metodo = op.method || "GET";
    if (metodo === "POST") {
      const fila = { id: tablas[tabla].length + 1000, ...JSON.parse(op.body) };
      tablas[tabla].push(fila); escrituras.push({ tabla, metodo, fila });
      return contesta(201, [fila]);
    }
    let filas = tablas[tabla];
    for (const [k, v] of u.searchParams) {
      if (["select", "order", "limit"].includes(k)) continue;
      const igual = v.match(/^eq\.(.*)$/), enLista = v.match(/^in\.\((.*)\)$/);
      if (igual) filas = filas.filter(f => String(f[k]) === igual[1]);
      else if (enLista) filas = filas.filter(f => enLista[1].split(",").includes(String(f[k])));
      else if (v === "is.null") filas = filas.filter(f => f[k] == null);
      else if (v === "not.is.null") filas = filas.filter(f => f[k] != null);
      else throw new Error(`la base de mentira no sabe filtrar ${k}=${v}`);
    }
    if (metodo === "PATCH") {
      const campos = JSON.parse(op.body);
      filas.forEach(f => Object.assign(f, campos));
      escrituras.push({ tabla, metodo, ids: filas.map(f => f.id), campos });
      return contesta(200, filas);
    }
    const columnas = (u.searchParams.get("select") || "*").split(",");
    return contesta(200, filas.map(f => (columnas.includes("*") ? f : Object.fromEntries(columnas.map(c => [c, f[c]])))));
  };
}
async function pedir(metodo, { llave = LLAVE, cuerpo = {} } = {}) {
  const res = { status(c) { this.codigo = c; return this; }, json(d) { this.cuerpo = d; return this; }, setHeader() {} };
  const callado = console.error; console.error = () => {};
  try {
    await portal(metodo === "GET" ? { method: "GET", query: { t: llave }, body: {}, headers: {} }
      : { method: "POST", query: {}, body: { token: llave, ...cuerpo }, headers: { "x-forwarded-for": "190.10.20.30, 10.0.0.1" } }, res);
  } finally { console.error = callado; }
  return res;
}

test("LO QUE VE: el presupuesto de SU proyecto, la última foto, con los precios que se decidió mostrarle", async () => {
  base();
  const r = await pedir("GET");
  assert.equal(r.codigo, 200);
  const ve = r.cuerpo.presupuestos;
  // Uno solo: el vigente. Ni el reemplazado ni el del otro proyecto.
  assert.deepEqual(ve.map(p => [p.id, p.titulo, p.estado, p.compartido_el]), [[10, "Presupuesto: Casa Granja", "pendiente", "2026-11-27"]]);
  const f = ve[0].foto;
  assert.deepEqual(f.empresas.map(e => e.proveedor), ["Empresa A", "Empresa C"]);
  // Se compartió CON UTILIDAD: 18 + 10 % = 19,80. El costo —18, 19,50, 5— no está en lo que recibe.
  assert.deepEqual(f.capitulos[0].rubros[0].ofertas.map(o => [o.id, o.unitario]), [[1, 19.8], [3, 21.45]]);
  assert.deepEqual([f.capitulos[0].rubros[0].unitario, f.capitulos[0].rubros[0].elegida, f.capitulos[1].rubros[0].unitario], [19.8, 1, 6]);
  const numeros = new Set();
  JSON.stringify(r.cuerpo.presupuestos, (k, v) => { if (typeof v === "number") numeros.add(v); return v; });
  for (const costo of [18, 19.5, 5, 1800, 1950, 1000]) assert.equal(numeros.has(costo), false, `el costo ${costo} no viaja`);
  // Ni con qué criterio se le compartió, ni campos de adentro.
  assert.doesNotMatch(JSON.stringify(r.cuerpo.presupuestos), /"modo"|utilidad|costo|precio_base|pedida_por|lead_id/);
  assert.deepEqual([f.totales.subtotal, f.totales.iva, f.totales.total], [3180, 477, 3657]);

  // Con la otra llave se ve el del otro proyecto, y nada de este.
  const otro = await pedir("GET", { llave: OTRA_LLAVE });
  assert.deepEqual(otro.cuerpo.presupuestos.map(p => [p.id, p.titulo]), [[20, "Presupuesto: Otro"]]);
  // Y un proyecto sin nada compartido abre igual, con la lista vacía.
  tablas.presupuesto_compartidos = [];
  assert.deepEqual((await pedir("GET")).cuerpo.presupuestos, []);
});

test("sin la migración 196 el enlace abre igual: no hay presupuesto para ver, y lo demás está", async () => {
  base();
  sinTabla.add("presupuesto_compartidos");
  const r = await pedir("GET");
  assert.equal(r.codigo, 200);
  assert.deepEqual(r.cuerpo.presupuestos, []);
  assert.deepEqual(r.cuerpo.proyecto, { nombre: "RES BG", enObra: false });
});

test("«APROBAR PRESUPUESTO PARA QUE QUEDE CONSTANCIA»: lo aprueba, queda en el registro con fecha, y se le avisa a la oficina", async () => {
  base();
  const r = await pedir("POST", { cuerpo: { que: "presupuesto", id: 10, conforme: true, nota: " De acuerdo con lo elegido " } });
  assert.deepEqual([r.codigo, r.cuerpo], [200, { ok: true }]);
  const pedido = tablas.aprobaciones_cliente.find(p => p.id === 10);
  assert.deepEqual([pedido.respuesta, pedido.respuesta_nota, pedido.respuesta_ip, /^\d{4}-\d\d-\d\dT/.test(pedido.respuesta_at)], ["aprobado", "De acuerdo con lo elegido", "190.10.20.30", true]);
  // Lo que aprobó es la foto de ese pedido, que nadie tocó.
  assert.deepEqual(tablas.presupuesto_compartidos.find(c => c.id === 41).foto, foto("utilidad"));
  // Queda en la historia del proyecto, dicho por el cliente.
  assert.deepEqual(tablas.lead_movimientos.map(m => [m.lead_id, m.autor_nombre, m.detalle]),
    [[13, "El cliente", 'El cliente aprobó "Presupuesto: Casa Granja" desde su enlace. Dijo: «De acuerdo con lo elegido»']]);
  // LO ÚNICO QUE EL ENLACE ESCRIBE: su respuesta y esa línea de la historia. Nada del presupuesto ni de lo compartido.
  assert.deepEqual(escrituras.map(e => [e.tabla, e.metodo]), [["aprobaciones_cliente", "PATCH"], ["lead_movimientos", "POST"]]);
  assert.deepEqual(escrituras[0].ids, [10]);
  // Y después lo ve como aprobado, sin botones.
  const ve = (await pedir("GET")).cuerpo.presupuestos[0];
  assert.deepEqual([ve.estado, ve.nota, /^\d{4}-\d\d-\d\d$/.test(ve.respondido_el)], ["aprobado", "De acuerdo con lo elegido", true]);
  // CONTESTA UNA VEZ.
  const otraVez = await pedir("POST", { cuerpo: { que: "presupuesto", id: 10, conforme: false, nota: "Mejor no" } });
  assert.deepEqual([otraVez.codigo, otraVez.cuerpo.error], [409, "Este presupuesto ya tiene tu respuesta."]);
  assert.equal(tablas.aprobaciones_cliente.find(p => p.id === 10).respuesta, "aprobado");
});

test("deja una observación diciendo qué; sin decir qué, no", async () => {
  base();
  const vacia = await pedir("POST", { cuerpo: { que: "presupuesto", id: 10, conforme: false, nota: "   " } });
  assert.deepEqual([vacia.codigo, vacia.cuerpo.error], [400, "Contanos qué hay que cambiar."]);
  assert.equal(escrituras.length, 0);
  const r = await pedir("POST", { cuerpo: { que: "presupuesto", id: 10, conforme: false, nota: "Prefiero a la Empresa C en el tumbado" } });
  assert.equal(r.codigo, 200);
  const pedido = tablas.aprobaciones_cliente.find(p => p.id === 10);
  assert.deepEqual([pedido.respuesta, pedido.respuesta_nota], ["observado", "Prefiero a la Empresa C en el tumbado"]);
  assert.match(tablas.lead_movimientos[0].detalle, /^El cliente dejó observaciones en "Presupuesto: Casa Granja" desde su enlace: «Prefiero a la Empresa C en el tumbado»$/);
});

test("LA LLAVE ABRE UN PROYECTO Y NADA MÁS: no contesta el presupuesto de otro, ni uno reemplazado, ni un pedido que no es de presupuesto", async () => {
  base();
  // El pedido 20 es del otro proyecto: con esta llave no existe.
  const ajeno = await pedir("POST", { cuerpo: { que: "presupuesto", id: 20, conforme: true } });
  assert.deepEqual([ajeno.codigo, ajeno.cuerpo.error], [404, "No se encontró ese presupuesto."]);
  // El 9 es el que se reemplazó.
  const viejo = await pedir("POST", { cuerpo: { que: "presupuesto", id: 9, conforme: true } });
  assert.equal(viejo.codigo, 409);
  assert.match(viejo.cuerpo.error, /hay una versión más nueva/);
  // El 30 es un punto del checklist: por acá no se contesta.
  const punto = await pedir("POST", { cuerpo: { que: "presupuesto", id: 30, conforme: true } });
  assert.equal(punto.codigo, 404);
  // Un id que no es un número, o que no existe.
  assert.equal((await pedir("POST", { cuerpo: { que: "presupuesto", id: "10 or 1=1", conforme: true } })).codigo, 404);
  assert.equal((await pedir("POST", { cuerpo: { que: "presupuesto", id: 99999, conforme: true } })).codigo, 404);
  // Y con una llave que no existe, nada.
  assert.equal((await pedir("POST", { llave: "x".repeat(32), cuerpo: { que: "presupuesto", id: 10, conforme: true } })).codigo, 404);
  // Nada de todo eso escribió.
  assert.equal(escrituras.length, 0);
  assert.equal(tablas.aprobaciones_cliente.every(p => p.respuesta == null), true);
});

test("si la oficina dejó de compartirlo mientras lo miraba, ya no se contesta", async () => {
  base();
  tablas.presupuesto_compartidos.find(c => c.id === 41).retirado_at = "2026-11-27T12:00:00.000Z";
  const r = await pedir("POST", { cuerpo: { que: "presupuesto", id: 10, conforme: true } });
  assert.equal(r.codigo, 409);
  assert.equal(escrituras.length, 0);
});
