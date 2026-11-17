// Lo que el cliente ve en su enlace. Hernán, 17/11/2026: «que el link que ve
// el cliente funcione, el cliente ve las actualizaciones de su proyecto. Se
// pueden cargar archivos o fotos a que los vea... son relacionadas al proyecto
// y a las tareas también. Hazlo lo más didáctico y fácil posible».
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loDelCliente, listaDelCliente } from "../api/_listaDelCliente.js";
import { claseDeArchivo, esFoto, pesoLegible, porQueNoEntra, rutaParaSubir, filaAlSubir, repartir, cuantosDice, TOPE }
  from "../src/modules/leads/archivosDelCliente.js";

const leer = ruta => readFileSync(new URL(ruta, import.meta.url), "utf8");
const codigoDe = ruta => leer(ruta).split("\n").filter(l => !l.trim().startsWith("//")).join("\n");

// RES BG, como estaba: parado en Ingenierías, con siete puntos a la vista del
// cliente —tres revisiones de Ingenierías y cuatro cotizaciones de
// Presupuesto— y ninguno con actualización ni foto.
const CATALOGO = [
  { id: "con_contacto", nombre: "Contacto", orden: 10, tunel: "construccion" },
  { id: "con_ingenierias", nombre: "Ingenierías", orden: 30, tunel: "construccion" },
  { id: "con_presupuesto", nombre: "Presupuesto", orden: 40, tunel: "construccion" },
  { id: "dis_plan_masa", nombre: "Plan masa", orden: 30, tunel: "diseno" },
];
const LEAD = { id: 13, tunel: "construccion", etapa: "con_ingenierias", resultado: null };
const punto = (id, title, etapa_id, extra = {}) => ({ id, title, etapa_id, status: "en-progreso", visible_cliente: true, ruta_orden: id, ...extra });
const TAREAS = [
  punto(1, "Revisión eléctrica", "con_ingenierias", { status: "listo", hecha_at: "2026-11-14T15:00:00Z" }),
  punto(2, "Revisión sanitaria", "con_ingenierias", { cliente_actualizacion: "El ingeniero entrega el viernes.", cliente_actualizado_at: "2026-11-16T20:00:00Z" }),
  punto(3, "MADEVAL", "con_presupuesto", { cliente_descripcion: "Cocina y closets", cliente_actualizacion: "Reunión agendada para el 18.", cliente_actualizado_at: "2026-11-17T14:00:00Z" }),
  punto(4, "Persianas", "con_presupuesto", { espera: true }),
  punto(5, "Algo suelto", null),
  // No lo ve: no está marcado para él.
  punto(6, "Interno", "con_presupuesto", { visible_cliente: false }),
];
const ARCHIVOS = [
  { id: 1, task_id: 3, nombre: "cocina-planta.JPG", storage_path: "proyecto-13/cliente/a.jpg", visible_cliente: true, created_at: "2026-11-17T14:01:00Z" },
  { id: 2, task_id: 3, nombre: "Propuesta MADEVAL.pdf", descripcion: "La propuesta", storage_path: "proyecto-13/cliente/b.pdf", visible_cliente: true, created_at: "2026-11-17T14:02:00Z" },
  { id: 3, task_id: null, nombre: "terreno.png", storage_path: "proyecto-13/cliente/c.png", visible_cliente: true, created_at: "2026-11-10T10:00:00Z" },
  { id: 4, task_id: null, nombre: "Planta general.pdf", storage_path: "proyecto-13/cliente/d.pdf", visible_cliente: true, created_at: "2026-11-12T10:00:00Z" },
  // De un punto que el cliente no ve: no viaja.
  { id: 5, task_id: 6, nombre: "cotizacion-interna.pdf", storage_path: "proyecto-13/cliente/e.pdf", visible_cliente: true, created_at: "2026-11-12T10:00:00Z" },
  // Una foto del teléfono que el navegador no dibuja: se ofrece para bajar.
  { id: 6, task_id: 1, nombre: "IMG_0042.HEIC", storage_path: "proyecto-13/cliente/f.heic", visible_cliente: true, created_at: "2026-11-14T10:00:00Z" },
];
const ENLACES = Object.fromEntries(ARCHIVOS.map(a => [a.storage_path, `https://deposito.test/${a.id}`]));

test("LO QUE PIDIÓ: el cliente ve su proyecto por etapa, con cuánto va cada una y en cuál se está", () => {
  const { lista, etapas } = loDelCliente({ tareas: TAREAS, catalogo: CATALOGO, lead: LEAD });
  assert.deepEqual(lista.map(t => [t.titulo, t.etapa, t.estado]), [
    ["Revisión eléctrica", "Ingenierías", "listo"], ["Revisión sanitaria", "Ingenierías", "pendiente"],
    ["MADEVAL", "Presupuesto", "pendiente"], ["Persianas", "Presupuesto", "espera"], ["Algo suelto", null, "pendiente"],
  ]);
  assert.deepEqual(etapas, [
    { id: "con_ingenierias", nombre: "Ingenierías", total: 2, listas: 1, actual: true },
    { id: "con_presupuesto", nombre: "Presupuesto", total: 2, listas: 0, actual: false },
    { id: null, nombre: "Otros puntos", total: 1, listas: 0, actual: false },
  ]);
  // Lo que no se le muestra no aparece ni en la cuenta.
  assert.equal(lista.some(t => t.titulo === "Interno"), false);
});

test("sin etapas en los puntos la lista va de corrido, como antes; y una etapa de otro tipo va después de las suyas", () => {
  assert.deepEqual(loDelCliente({ tareas: [punto(1, "A", null), punto(2, "B", null)], catalogo: CATALOGO, lead: LEAD }).etapas, []);
  const { etapas } = loDelCliente({ tareas: [punto(1, "A", "dis_plan_masa"), punto(2, "B", "con_presupuesto"), punto(3, "C", "no_existe")], catalogo: CATALOGO, lead: LEAD });
  assert.deepEqual(etapas.map(e => e.nombre), ["Presupuesto", "Plan masa", "Otros puntos"]);
  // Un proyecto aprobado ya no está «en» ninguna etapa del pipeline.
  assert.equal(loDelCliente({ tareas: TAREAS, catalogo: CATALOGO, lead: { ...LEAD, resultado: "ganado" } }).etapas.some(e => e.actual), false);
  assert.deepEqual(loDelCliente(), { lista: [], etapas: [], novedades: [], archivos: [] });
});

test("LO QUE PIDIÓ: arriba ve lo último que pasó —lo que se le escribió y lo que quedó listo—, lo más nuevo primero", () => {
  const { novedades } = loDelCliente({ tareas: TAREAS, catalogo: CATALOGO, lead: LEAD });
  assert.deepEqual(novedades, [
    { id: 3, tipo: "actualizacion", titulo: "MADEVAL", texto: "Reunión agendada para el 18.", fecha: "2026-11-17" },
    { id: 2, tipo: "actualizacion", titulo: "Revisión sanitaria", texto: "El ingeniero entrega el viernes.", fecha: "2026-11-16" },
    { id: 1, tipo: "listo", titulo: "Revisión eléctrica", texto: "Quedó listo.", fecha: "2026-11-14" },
  ]);
  // Como estaba RES BG ese día —siete pendientes sin nada escrito—: no hay novedades que inventar.
  assert.deepEqual(loDelCliente({ tareas: [punto(1, "MADEVAL", "con_presupuesto")], catalogo: CATALOGO, lead: LEAD }).novedades, []);
  // Nunca más de seis.
  const muchas = Array.from({ length: 9 }, (_, i) => punto(i + 1, `P${i + 1}`, null, { cliente_actualizacion: "x", cliente_actualizado_at: `2026-11-0${i + 1}T10:00:00Z` }));
  assert.deepEqual(loDelCliente({ tareas: muchas }).novedades.map(n => n.titulo), ["P9", "P8", "P7", "P6", "P5", "P4"]);
});

test("LO QUE PIDIÓ: las fotos y archivos de cada punto van con su punto, y los del proyecto aparte", () => {
  const { lista, archivos } = loDelCliente({ tareas: TAREAS, catalogo: CATALOGO, lead: LEAD, archivos: ARCHIVOS, enlaces: ENLACES });
  const madeval = lista.find(t => t.titulo === "MADEVAL");
  assert.deepEqual(madeval.archivos, [
    { id: 1, nombre: "cocina-planta.JPG", descripcion: "", esFoto: true, url: "https://deposito.test/1", fecha: "2026-11-17" },
    { id: 2, nombre: "Propuesta MADEVAL.pdf", descripcion: "La propuesta", esFoto: false, url: "https://deposito.test/2", fecha: "2026-11-17" },
  ]);
  // El .heic no es foto para el navegador: va como archivo para bajar.
  assert.deepEqual(lista.find(t => t.titulo === "Revisión eléctrica").archivos.map(a => [a.nombre, a.esFoto]), [["IMG_0042.HEIC", false]]);
  assert.deepEqual(lista.find(t => t.titulo === "Persianas").archivos, []);
  // Los del proyecto: lo más nuevo arriba.
  assert.deepEqual(archivos.map(a => [a.nombre, a.esFoto]), [["Planta general.pdf", false], ["terreno.png", true]]);
  // Lo del punto que no ve no aparece en ningún lado; y la ruta del depósito nunca viaja.
  const todo = JSON.stringify({ lista, archivos });
  assert.doesNotMatch(todo, /cotizacion-interna|storage_path|proyecto-13/);
  // Sin enlace —se venció, no se pudo firmar— va sin él, y la pantalla no lo dibuja.
  assert.equal(loDelCliente({ tareas: TAREAS, archivos: ARCHIVOS, enlaces: {} }).archivos[0].url, null);
});

test("el correo del checklist sigue saliendo de la misma lista, sin etapas ni archivos", () => {
  assert.deepEqual(Object.keys(listaDelCliente(TAREAS)[0]), ["id", "titulo", "descripcion", "estado", "listo_el", "actualizacion", "actualizado_el"]);
});

test("el enlace del cliente pide solo lo marcado para él, y un archivo de un punto solo si el punto se le muestra", () => {
  const portal = codigoDe("../api/portal.js");
  assert.match(portal, /proyecto_archivos\?lead_id=eq\.\$\{lead\.id\}&visible_cliente=eq\.true/);
  assert.match(portal, /paraEl = paraEl\.filter\(a => a\.task_id == null \|\| seVen\.has\(a\.task_id\)\);/);
  assert.match(portal, /\.\.\.paraEl\.map\(a => a\.storage_path\),/);
  assert.match(portal, /etapas: delCliente\.etapas,\s+novedades: delCliente\.novedades,\s+archivos: delCliente\.archivos,/);
  // Si la migración 184 no está corrida, no hay archivos y el enlace abre igual.
  assert.match(portal, /if \(!Array\.isArray\(paraEl\)\) paraEl = \[\];/);
  const pantalla = codigoDe("../src/portal/PortalCliente.jsx");
  assert.match(pantalla, /className="lo-ultimo"/);
  assert.match(pantalla, /className="etapa-del-cliente"/);
  assert.match(pantalla, /<FotosYArchivos archivos=\{t\.archivos \|\| \[\]\} onFoto=\{onFoto\} \/>/);
  assert.match(pantalla, /\["archivos", "Fotos y archivos", archivos\.length\]/);
});

// ── SUBIR FOTOS Y ARCHIVOS PARA EL CLIENTE ─────────────────────────────────

test("qué clase de archivo es, y qué se ve en miniatura", () => {
  assert.deepEqual(["planta.DWG", "a.pdf", "foto.JPEG", "IMG.HEIC", "lista.xlsx", "nota.txt", ""].map(claseDeArchivo),
    ["cad", "pdf", "imagen", "imagen", "hoja", "otro", "otro"]);
  assert.deepEqual(["foto.JPEG", "a.png", "a.webp", "IMG.HEIC", "a.tiff", "a.pdf"].map(nombre => esFoto({ nombre })), [true, true, true, false, false, false]);
  assert.equal(pesoLegible(3.44 * 1024 * 1024), "3,4 MB");
  assert.equal(pesoLegible(2048), "2 KB");
  assert.equal(pesoLegible(0), "");
});

test("lo que no entra se dice antes de subir: lo muy pesado y lo vacío", () => {
  assert.equal(porQueNoEntra({ name: "planta.pdf", size: 2000 }), null);
  assert.equal(porQueNoEntra({ name: "video.mov", size: TOPE + 1 }), "«video.mov» pesa 50,0 MB y el tope es 50 MB.");
  assert.equal(porQueNoEntra({ name: "vacio.pdf", size: 0 }), "«vacio.pdf» está vacío.");
  assert.equal(porQueNoEntra(null), "Ese archivo no se pudo leer.");
});

test("lo que se sube para el cliente queda en el proyecto, marcado para él y con su punto", () => {
  assert.equal(rutaParaSubir(13, "Plano de cocina (rev 2).pdf", 1794900000000), "proyecto-13/cliente/1794900000000-Plano_de_cocina__rev_2_.pdf");
  // Varios en la misma tanda no se pisan.
  assert.notEqual(rutaParaSubir(13, "a.jpg", 1, 0), rutaParaSubir(13, "a.jpg", 1, 1));
  assert.deepEqual(filaAlSubir({ leadId: 13, taskId: 104, archivo: { name: "cocina.jpg", size: 2048 }, ruta: "proyecto-13/cliente/1-cocina.jpg", quien: { id: 1, name: "Hernan Cueva" } }), {
    lead_id: 13, task_id: 104, visible_cliente: true, storage_path: "proyecto-13/cliente/1-cocina.jpg", nombre: "cocina.jpg",
    tipo: "imagen", tamano: 2048, carpeta: "Para el cliente", subido_por: 1, subido_nombre: "Hernan Cueva",
  });
  // Sin punto, es del proyecto.
  assert.equal(filaAlSubir({ leadId: 13, archivo: { name: "a.pdf", size: 1 }, ruta: "r" }).task_id, null);
});

test("lo que ve el cliente se reparte entre el proyecto y cada punto, en el orden en que se subió", () => {
  const r = repartir([...ARCHIVOS, { id: 9, task_id: null, nombre: "interno.pdf", visible_cliente: false, created_at: "2026-11-01T10:00:00Z" }]);
  assert.deepEqual(r.delProyecto.map(a => a.nombre), ["terreno.png", "Planta general.pdf"]);
  assert.deepEqual(r.porTarea[3].map(a => a.nombre), ["cocina-planta.JPG", "Propuesta MADEVAL.pdf"]);
  assert.deepEqual(Object.keys(r.porTarea).sort(), ["1", "3", "6"]);
  assert.deepEqual(repartir(), { delProyecto: [], porTarea: {} });
  assert.equal(cuantosDice(r.porTarea[3]), "1 foto y 1 archivo");
  assert.equal(cuantosDice([{ nombre: "a.jpg" }, { nombre: "b.png" }]), "2 fotos");
  assert.equal(cuantosDice([{ nombre: "a.pdf" }]), "1 archivo");
  assert.equal(cuantosDice([]), "");
});

test("la migración 184 solo suma dos datos a los archivos del proyecto, y lo ya cargado sigue siendo interno", () => {
  const sql = leer("../supabase/migrations/184_archivos_y_fotos_para_el_cliente.sql");
  assert.match(sql, /add column if not exists visible_cliente boolean not null default false,/);
  assert.match(sql, /add column if not exists task_id bigint references public\.tasks\(id\) on delete set null;/);
  assert.doesNotMatch(sql.split("\n").filter(l => !l.trim().startsWith("--")).join("\n"), /^\s*(delete|update|drop|truncate|insert)\b/im);
});

test("en el checklist se adjunta adentro de «lo que lee el cliente», y en el proyecto en «lo que ve el cliente»", () => {
  const lista = codigoDe("../src/modules/leads/ListaDeTareas.jsx");
  assert.match(lista, /<FotosYArchivosDelCliente lead=\{lead \|\| \{ id: item\.lead_id \}\} punto=\{item\}/);
  assert.match(lista, /<FotosYArchivosDelCliente lead=\{lead\} archivos=\{paraVer\.delProyecto\}/);
  // El enlace se ofrece en cuanto hay algo que mostrarle: un punto o un archivo del proyecto.
  assert.match(lista, /\(vistas\.length > 0 \|\| paraVer\.delProyecto\.length > 0\) && <div style=\{\{ marginTop: 10 \}\}><EnlaceDelCliente lead=\{lead\} \/><\/div>/);
  const datos = codigoDe("../src/modules/leads/proyecto.js");
  // Si no quedó anotado, el archivo suelto se borra del depósito.
  assert.match(datos, /await supabase\.storage\.from\("task-files"\)\.remove\(\[ruta\]\);/);
  // Al borrar un punto, lo suyo deja de verse antes de que el punto se vaya.
  assert.ok(datos.indexOf('update({ visible_cliente: false }).eq("task_id", item.id)') < datos.indexOf('from("tasks").delete().eq("id", item.id)'));
  // Y el enlace se puede mirar como lo ve él.
  assert.match(codigoDe("../src/modules/observaciones/EnlaceDelCliente.jsx"), /className="ver-como-el-cliente" href=\{url\} target="_blank"/);
  // En los archivos del proyecto, cada uno con su ojo.
  assert.match(codigoDe("../src/modules/leads/ArchivosDelProyecto.jsx"), /onClick=\{\(\) => alCliente\(a, !a\.visible_cliente\)\}/);
});
