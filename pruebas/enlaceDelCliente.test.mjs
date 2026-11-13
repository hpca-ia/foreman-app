// El enlace del cliente, de punta a punta: la llave, el proyecto y lo que ve.
//
// Se corre el servidor de verdad (api/portal.js) contra una base de mentira
// que contesta como PostgREST: si se le pide una columna que la tabla no
// tiene, devuelve el error —un objeto, no una lista—, que es justo lo que
// pasaba en producción y nadie veía.
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.SUPABASE_SECRET_KEY = "sb_secret_de_prueba";
const { default: portal } = await import("../api/portal.js");

// Las columnas que `leads` tiene de verdad (leídas de la base el 13/11/2026).
// `cliente_nombre` NO está: esa es de `obras`.
const LEADS = ["id", "nombre", "cliente_id", "contacto", "telefono", "email", "origen", "etapa", "valor_estimado", "probabilidad",
  "fecha_cierre", "responsable_id", "responsable_nombre", "notas", "motivo_perdida", "presupuesto_id", "obra_id", "created_by",
  "created_at", "actualizado_at", "temperatura", "resultado", "tunel", "es_lead", "color", "portal_token", "portal_activo",
  "crono_inicio", "crono_laborables", "crono_feriados", "crono_meses", "crono_tope_mes", "crono_fin", "crono_cubre",
  "crono_presupuesto_id", "espera_desde", "espera_que", "recordar_el"];

const LLAVE = "k3Jd8sQw1ZpL0aXv7NcR5tYb2UeHg9Mi";
const tarea = (id, title, mas = {}) => ({
  id, lead_id: 13, title, status: "en-progreso", espera: false, hecha_at: null, descartada: false, compra_id: null, type: "Gestión",
  ruta_orden: id, visible_cliente: true, cliente_descripcion: null, cliente_actualizacion: null, cliente_actualizado_at: null,
  // Lo interno, que no puede salir nunca.
  nota: "no contestan, insistir", assignee_id: 1, notes: "Gestión de RES BG", ...mas,
});

let pedidos;
function base({ lead = {}, tareas = [], rota = false } = {}) {
  const tablas = {
    leads: [{ id: 13, nombre: "RES BG", obra_id: null, portal_token: LLAVE, portal_activo: true, contacto: "Familia Banderas", ...lead }],
    tasks: tareas,
  };
  pedidos = [];
  const contesta = (status, cuerpo) => ({ ok: status < 400, status, json: async () => cuerpo });
  globalThis.fetch = async url => {
    const u = new URL(url);
    if (u.pathname.startsWith("/storage/")) return contesta(200, []);
    const tabla = u.pathname.replace("/rest/v1/", "");
    pedidos.push(tabla);
    if (rota && tabla === "leads") return contesta(503, { code: "PGRST002", message: "Could not query the database for the schema cache" });
    const columnas = (u.searchParams.get("select") || "*").split(",");
    if (tabla === "leads") {
      const mala = columnas.find(c => c !== "*" && !LEADS.includes(c));
      if (mala) return contesta(400, { code: "42703", message: `column leads.${mala} does not exist` });
    }
    let filas = tablas[tabla] || [];
    for (const [k, v] of u.searchParams) {
      const igual = v.match(/^eq\.(.*)$/);
      if (igual && !["select", "order", "limit"].includes(k)) filas = filas.filter(f => String(f[k]) === igual[1]);
    }
    return contesta(200, filas.map(f => (columnas.includes("*") ? f : Object.fromEntries(columnas.map(c => [c, f[c]])))));
  };
}
async function abrir(llave = LLAVE) {
  const res = { status(c) { this.codigo = c; return this; }, json(d) { this.cuerpo = d; return this; }, setHeader() {} };
  const callado = console.error; console.error = () => {};
  try { await portal({ method: "GET", query: { t: llave }, body: {}, headers: {} }, res); } finally { console.error = callado; }
  return res;
}

test("LO QUE FALLABA: enlace prendido, siete puntos a la vista, y el cliente los ve", async () => {
  base({ tareas: [
    tarea(135, "Revision de Electrica"), tarea(136, "Revision de Sanitaria"), tarea(137, "Revision de Estructural"),
    tarea(195, "MADEVAL", { espera: true, cliente_actualizacion: "Reunión agendada para el 18 de noviembre.", cliente_actualizado_at: "2026-11-13T15:00:00Z" }),
    tarea(196, "FOGA"), tarea(197, "Window world"), tarea(198, "Persianas", { status: "listo", hecha_at: "2026-11-13T16:00:00Z" }),
    tarea(199, "Dekorando", { visible_cliente: false }),
  ] });
  const r = await abrir();
  assert.equal(r.codigo, 200);
  assert.deepEqual(r.cuerpo.proyecto, { nombre: "RES BG", enObra: false });
  assert.deepEqual(r.cuerpo.lista.map(p => [p.titulo, p.estado]), [
    ["Revision de Electrica", "pendiente"], ["Revision de Sanitaria", "pendiente"], ["Revision de Estructural", "pendiente"],
    ["MADEVAL", "espera"], ["FOGA", "pendiente"], ["Window world", "pendiente"], ["Persianas", "listo"],
  ]);
  assert.equal(r.cuerpo.lista[3].actualizacion, "Reunión agendada para el 18 de noviembre.");
  // Lo interno no viaja.
  const todo = JSON.stringify(r.cuerpo);
  assert.doesNotMatch(todo, /no contestan|Dekorando|assignee_id|Familia Banderas/);
});

test("lo que se le pide a `leads` existe en `leads`: ni una columna de más", async () => {
  base();
  const r = await abrir();
  // La base de mentira contesta un error si la columna no existe, igual que la de verdad.
  assert.equal(r.codigo, 200);
  assert.ok(pedidos.includes("leads"));
});

test("una llave inventada y un enlace apagado dicen lo mismo, y no muestran nada", async () => {
  base();
  const inventada = await abrir("ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ");
  assert.equal(inventada.codigo, 404);
  assert.equal(inventada.cuerpo.error, "Este enlace no está disponible.");
  base({ lead: { portal_activo: false } });
  const apagado = await abrir();
  assert.deepEqual([apagado.codigo, apagado.cuerpo.error], [404, "Este enlace no está disponible."]);
  assert.equal((await abrir("corta")).codigo, 404);
});

test("si la que falla es la base, no se le dice al cliente que su enlace no sirve", async () => {
  base({ rota: true });
  const r = await abrir();
  assert.equal(r.codigo, 500);
  assert.equal(r.cuerpo.error, "No se pudo abrir en este momento. Probá de nuevo en un rato.");
  assert.doesNotMatch(JSON.stringify(r.cuerpo), /schema cache|PGRST/);
});

test("sin ningún punto marcado el enlace abre igual, con la lista vacía", async () => {
  base({ tareas: [tarea(199, "Dekorando", { visible_cliente: false })] });
  const r = await abrir();
  assert.equal(r.codigo, 200);
  assert.deepEqual(r.cuerpo.lista, []);
});
