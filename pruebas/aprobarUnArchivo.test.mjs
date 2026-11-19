// Pedirle al cliente que apruebe UN archivo, y no todo el punto. Hernán,
// 19/11/2026, con FOGA —que tenía «HERNAN CUEVA (1).pdf» y acababa de subir
// «Cot. Sr. Hernán Cueva.pdf»—: «cada vez que se sube un archivo se puede
// pedir aprobación de ese archivo nuevo, el anterior ya se aprobó... se sube
// la cotización, se debe poder pedir que se apruebe específicamente esa
// cotización, no lo anterior que ya estaba».
//
// El pedido era del punto entero: la ventana decía «va a ver este punto con 2
// archivos», el cliente tenía «Lo apruebo» delante de los dos, y en el
// registro quedaban los dos como aprobados otra vez.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { filaDelPedido, queSePide, archivosDelPedido as delPedido, registroDeAprobaciones } from "../src/modules/leads/aprobaciones.js";
import { archivosDelPedido, loDelCliente, archivosAprobados } from "../api/_listaDelCliente.js";

const leer = ruta => readFileSync(new URL(ruta, import.meta.url), "utf8");

const PLANO = { id: 41, task_id: 196, nombre: "HERNAN CUEVA (1).pdf", storage_path: "p/41.pdf", visible_cliente: true, created_at: "2026-11-17T15:00:00Z" };
const COTIZACION = { id: 52, task_id: 196, nombre: "Cot. Sr. Hernán Cueva.pdf", storage_path: "p/52.pdf", visible_cliente: true, created_at: "2026-11-19T14:00:00Z" };
const FOGA = { id: 196, lead_id: 13, title: "FOGA", status: "en-progreso", visible_cliente: true, cliente_aprueba: true, cliente_respuesta: null };
// El primer pedido: aprobó el plano el 18.
const PRIMERO = { id: 1, task_id: 196, lead_id: 13, titulo: "FOGA", pedida_at: "2026-11-17T16:00:00Z", respuesta: "aprobado", respuesta_at: "2026-11-18T15:00:00Z", archivos: archivosAprobados([PLANO]) };

test("al abrir la ventana sale tildado lo nuevo; lo que ya aprobó dice cuándo y no se le vuelve a pedir", () => {
  const q = queSePide([PLANO, COTIZACION], [PRIMERO]);
  assert.deepEqual(q.tildados, [52]);
  assert.deepEqual(q.aprobados, { 41: "2026-11-18T15:00:00Z" });
  // Sin historia, todo. Y si no hay nada nuevo —vuelve a pedir lo mismo—, también todo.
  assert.deepEqual(queSePide([PLANO, COTIZACION], []).tildados, [41, 52]);
  assert.deepEqual(queSePide([PLANO], [PRIMERO]).tildados, [41]);
  // Lo que dejó con observaciones no está aprobado: sigue saliendo tildado.
  assert.deepEqual(queSePide([PLANO, COTIZACION], [{ ...PRIMERO, respuesta: "observado" }]).tildados, [41, 52]);
});

test("el pedido guarda qué archivos son; si son todos, no guarda nada y es del punto entero, como antes", () => {
  const item = { id: 196, lead_id: 13, texto: "FOGA" };
  assert.deepEqual(filaDelPedido({ item, archivos: [52] }).pide_archivos, [52]);
  assert.equal("pide_archivos" in filaDelPedido({ item }), false);
  assert.equal("pide_archivos" in filaDelPedido({ item, archivos: [] }), false);
  const ventana = leer("../src/modules/leads/PedirAprobacion.jsx");
  assert.match(ventana, /archivos: soloAlgunos \? losQuePide\.map\(a => a\.id\) : null/);
  // No se pide con todo destildado.
  assert.match(ventana, /if \(archivos\.length && !losQuePide\.length\) \{ setDijo\("Tildá qué archivo tiene que aprobar\."\); return; \}/);
});

test("el cliente tiene los botones delante de la cotización, y el plano que ya aprobó queda aparte", () => {
  const con = pedidos => loDelCliente({ tareas: [FOGA], archivos: [PLANO, COTIZACION], enlaces: { "p/41.pdf": "u41", "p/52.pdf": "u52" }, pedidos }).lista[0];
  const t = con([{ task_id: 196, pide_archivos: [52] }]);
  assert.deepEqual(t.aprobar.archivos.map(a => a.nombre), ["Cot. Sr. Hernán Cueva.pdf"]);
  assert.equal(t.archivos.length, 2, "el punto sigue teniendo los dos");
  // Un pedido que no dice cuáles es de todo el punto: no hay nada que separar.
  assert.equal(con([{ task_id: 196, pide_archivos: null }]).aprobar.archivos, undefined);
  assert.equal(con([]).aprobar.archivos, undefined);
  // Si el archivo pedido se borró o se le ocultó, no queda aprobando nada: vuelve a ser el punto.
  assert.equal(con([{ task_id: 196, pide_archivos: [99] }]).aprobar.archivos, undefined);
});

test("en el registro queda aprobado lo que se le pidió, no lo que el punto ya tenía; y el correo nombra eso", () => {
  assert.deepEqual(archivosAprobados(archivosDelPedido([PLANO, COTIZACION], [52]).archivos).map(a => a.id), [52]);
  assert.deepEqual(archivosAprobados(archivosDelPedido([PLANO, COTIZACION], null).archivos).map(a => a.id), [41, 52]);
  const portal = leer("../api/portal.js");
  assert.match(portal, /archivos: archivosAprobados\(archivosDelPedido\(suyos, abiertos\[0\]\?\.pide_archivos\)\.archivos\) \};/);
  // Sin la migración 191 el registro se sigue llenando: se pide sin esa columna.
  assert.match(portal, /if \(!Array\.isArray\(abiertos\)\) abiertos = await json\(await rest\(`\$\{elAbierto\}&select=id&order=pedida_at\.desc&limit=1`\)\);/);
  const aviso = leer("../api/_aviso-pedido.js");
  assert.match(aviso, /const suyos = archivosDelPedido\(Array\.isArray\(delPunto\) \? delPunto : \[\], abierto\?\.pide_archivos\)\.archivos;/);
  assert.match(aviso, /if \(!Array\.isArray\(abiertos\)\) abiertos = await crudo\(await rest\(`\$\{elAbierto\}&select=id,avisos&order=pedida_at\.desc&limit=1`\)\);/);
});

test("la pestaña Aprobaciones muestra, del pedido que espera, solo lo que se pidió; la regla es la misma en la pantalla y en el servidor", () => {
  const SEGUNDO = { id: 2, task_id: 196, lead_id: 13, titulo: "FOGA", pedida_at: "2026-11-19T15:00:00Z", pide_archivos: [52] };
  const [segundo, primero] = registroDeAprobaciones([PRIMERO, SEGUNDO], { 196: [PLANO, COTIZACION] });
  assert.deepEqual(segundo.archivos.map(a => a.id), [52]);
  assert.equal(segundo.soloAlgunos, true);
  assert.deepEqual(primero.archivos.map(a => a.id), [41]);
  assert.equal(primero.soloAlgunos, false);
  for (const pide of [[52], [99], null, [], [41, 52]]) {
    assert.deepEqual(delPedido([PLANO, COTIZACION], pide), archivosDelPedido([PLANO, COTIZACION], pide));
  }
});

test("la migración 191 solo agrega la columna", () => {
  const sql = leer("../supabase/migrations/191_que_archivos_se_piden_aprobar.sql").split("\n").filter(l => !l.trim().startsWith("--")).join("\n");
  assert.match(sql, /alter table public\.aprobaciones_cliente\s+add column if not exists pide_archivos jsonb;/);
  assert.doesNotMatch(sql, /\b(drop|delete|update|truncate)\b/i);
});
