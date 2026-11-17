// Lo que el cliente ve de cada punto. Hernán, 17/11/2026, mirando RES BG ya
// publicado: «el cliente no ve el modelado en Revit... no sé por qué. Cliente
// debe ver las actualizaciones de cada uno... ¿dónde se sube archivos
// relacionados? Estos debe poder ver cliente para que apruebe».
//
// En la base, ese día: el punto de Revit se agregó dos minutos después de
// «mostrarle los otros abiertos» y nació oculto; las dos anotaciones que había
// escrito estaban en el historial, que el cliente no leía; y no había un solo
// archivo subido en toda la base.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { listaDelCliente, loDelCliente, correoDeLaLista } from "../api/_listaDelCliente.js";
import { historialDe, ultimaAnotacion } from "../src/modules/leads/historialDeTarea.js";

const leer = ruta => readFileSync(new URL(ruta, import.meta.url), "utf8");
const codigoDe = ruta => leer(ruta).split("\n").filter(l => !l.trim().startsWith("//")).join("\n");

// RES BG como estaba: nueve puntos a la vista y el de Revit, recién agregado, no.
const punto = (id, title, extra = {}) => ({ id, title, status: "en-progreso", visible_cliente: true, ruta_orden: id, etapa_id: "con_presupuesto", ...extra });
const TAREAS = [
  punto(135, "Revision de Electrica", { etapa_id: "con_ingenierias" }),
  punto(196, "FOGA"),
  punto(195, "MADEVAL"),
  punto(204, "MODELADO EN REVIT PARA VOLLUMENES DE OBRA", { visible_cliente: false }),
];
// Lo anotado. Las dos suyas son de la noche del 17 en Quito: en la base, ya el 18.
const NOTAS = [
  { id: 12, task_id: 196, texto: "Se recibe diseño preliminar, se envia para correcciones", autor_nombre: "Hernan Cueva", visible_cliente: true, created_at: "2026-11-18T02:23:36Z" },
  { id: 13, task_id: 135, texto: "Se recibe presupuesto y diseño BASE", autor_nombre: "Hernan Cueva", visible_cliente: true, created_at: "2026-11-18T02:25:59Z" },
  // Interna: no está marcada.
  { id: 14, task_id: 196, texto: "FOGA cobra 12% más que MADEVAL: negociar", autor_nombre: "Hernan Cueva", visible_cliente: false, created_at: "2026-11-18T15:00:00Z" },
  // Marcada, pero de un punto que el cliente no ve: no viaja.
  { id: 15, task_id: 204, texto: "Modelo al 40%", autor_nombre: "Hernan Cueva", visible_cliente: true, created_at: "2026-11-18T16:00:00Z" },
  // Otra de FOGA, al día siguiente.
  { id: 16, task_id: 196, texto: "Llegó el diseño corregido.", autor_nombre: "Camila Mena", visible_cliente: true, created_at: "2026-11-19T14:00:00Z" },
  // Sin la columna (antes de la 185) nada está marcado.
  { id: 17, task_id: 195, texto: "Reunión el viernes", created_at: "2026-11-19T15:00:00Z" },
];

test("LO QUE PIDIÓ: el cliente lee las actualizaciones de cada punto —lo anotado y marcado para él—, lo más nuevo arriba", () => {
  const lista = listaDelCliente(TAREAS, NOTAS);
  const de = titulo => lista.find(t => t.titulo === titulo);
  assert.deepEqual(de("FOGA").actualizaciones, [
    { id: "n16", texto: "Llegó el diseño corregido.", fecha: "2026-11-19" },
    // Anotada a las 9 de la noche del 17 en Quito: es del 17, no del 18.
    { id: "n12", texto: "Se recibe diseño preliminar, se envia para correcciones", fecha: "2026-11-17" },
  ]);
  assert.deepEqual(de("Revision de Electrica").actualizaciones, [{ id: "n13", texto: "Se recibe presupuesto y diseño BASE", fecha: "2026-11-17" }]);
  // La última es la que va en el correo.
  assert.equal(de("FOGA").actualizacion, "Llegó el diseño corregido.");
  assert.equal(de("FOGA").actualizado_el, "2026-11-19");
  // Sin nada marcado no hay nada que leer.
  assert.deepEqual(de("MADEVAL").actualizaciones, []);
  assert.equal(de("MADEVAL").actualizacion, "");
});

test("lo interno no viaja: ni la anotación sin marcar, ni la de un punto que no ve, ni quién la escribió", () => {
  const todo = JSON.stringify(loDelCliente({ tareas: TAREAS, notas: NOTAS }));
  assert.equal(todo.includes("12% más"), false);
  assert.equal(todo.includes("Modelo al 40%"), false);
  assert.equal(todo.includes("REVIT"), false);
  assert.equal(todo.includes("Hernan Cueva"), false);
  assert.equal(todo.includes("Camila"), false);
  // De cada actualización salen tres datos, y nada más.
  listaDelCliente(TAREAS, NOTAS).flatMap(t => t.actualizaciones).forEach(a => assert.deepEqual(Object.keys(a), ["id", "texto", "fecha"]));
  // Sin anotaciones —o con algo que no es una lista— el checklist sale igual.
  assert.deepEqual(listaDelCliente(TAREAS).map(t => t.actualizaciones), [[], [], []]);
  assert.deepEqual(listaDelCliente(TAREAS, { message: "column tarea_comentarios.visible_cliente does not exist" }).map(t => t.actualizaciones), [[], [], []]);
});

test("la actualización escrita aparte, de antes, no se pierde: entra en la misma lista por su fecha", () => {
  const [t] = listaDelCliente(
    [punto(1, "Pisos", { cliente_actualizacion: "Llegaron dos cotizaciones.", cliente_actualizado_at: "2026-11-12T14:30:00Z" })],
    [{ id: 5, task_id: 1, texto: "Elegimos el porcelanato.", visible_cliente: true, created_at: "2026-11-14T16:00:00Z" },
      { id: 4, task_id: 1, texto: "Pedimos muestras.", visible_cliente: true, created_at: "2026-11-10T16:00:00Z" }]);
  assert.deepEqual(t.actualizaciones.map(a => [a.texto, a.fecha]), [
    ["Elegimos el porcelanato.", "2026-11-14"], ["Llegaron dos cotizaciones.", "2026-11-12"], ["Pedimos muestras.", "2026-11-10"],
  ]);
});

test("arriba, en «lo último», cada anotación es una novedad: dos en un punto son dos", () => {
  const { novedades, lista } = loDelCliente({ tareas: TAREAS, notas: NOTAS });
  assert.deepEqual(novedades, [
    { id: 196, tipo: "actualizacion", titulo: "FOGA", texto: "Llegó el diseño corregido.", fecha: "2026-11-19" },
    // Del mismo día, la más reciente primero.
    { id: 135, tipo: "actualizacion", titulo: "Revision de Electrica", texto: "Se recibe presupuesto y diseño BASE", fecha: "2026-11-17" },
    { id: 196, tipo: "actualizacion", titulo: "FOGA", texto: "Se recibe diseño preliminar, se envia para correcciones", fecha: "2026-11-17" },
  ]);
  // Y cada punto lleva las suyas.
  assert.equal(lista.find(t => t.titulo === "FOGA").actualizaciones.length, 2);
});

test("el correo del checklist lleva la última actualización de cada punto", () => {
  const { cuerpo } = correoDeLaLista({ proyecto: "RES BG", lista: listaDelCliente(TAREAS, NOTAS) });
  assert.ok(cuerpo.includes("Llegó el diseño corregido."));
  assert.ok(cuerpo.includes("Se recibe presupuesto y diseño BASE"));
  assert.equal(cuerpo.includes("12% más"), false);
  const correo = codigoDe("../api/_aviso-checklist.js");
  assert.match(correo, /tarea_comentarios\?task_id=in\.\(\$\{ids\.join\(","\)\}\)&visible_cliente=eq\.true&select=id,task_id,texto,visible_cliente,created_at/);
  assert.match(correo, /const lista = listaDelCliente\(filas, notas\);/);
});

test("el enlace del cliente pide solo las anotaciones marcadas, de los puntos que ve, y sin el autor", () => {
  const portal = codigoDe("../api/portal.js");
  assert.match(portal, /`tarea_comentarios\?task_id=in\.\(\$\{\[\.\.\.seVen\]\.map\(Number\)\.join\(","\)\}\)&visible_cliente=eq\.true`/);
  assert.match(portal, /`&select=id,task_id,texto,visible_cliente,created_at&order=created_at\.desc`/);
  assert.doesNotMatch(portal, /tarea_comentarios\?[^`]*autor/);
  // Si la 185 no está corrida no hay ninguna, y el enlace abre igual.
  assert.match(portal, /if \(!Array\.isArray\(notas\)\) notas = \[\];/);
  assert.match(portal, /loDelCliente\(\{ tareas: marcadas, catalogo, lead, archivos: paraEl, enlaces, notas \}\)/);
  // La pantalla las dibuja todas, con su fecha; y abre contra la versión de antes.
  const pantalla = codigoDe("../src/portal/PortalCliente.jsx");
  assert.match(pantalla, /<Actualizaciones punto=\{t\} \/>/);
  assert.match(pantalla, /Array\.isArray\(punto\.actualizaciones\) \? punto\.actualizaciones/);
  assert.match(pantalla, /className="ver-anteriores"/);
});

test("en el historial, cada anotación dice si la lee el cliente", () => {
  const tarea = { id: 196, title: "FOGA", status: "en-progreso", created_at: "2026-11-13T18:27:00Z", created_by: 1 };
  const h = historialDe({ tarea, comentarios: NOTAS.filter(n => n.task_id === 196), nombreDe: () => "Hernan Cueva" });
  assert.deepEqual(h.map(f => [f.texto, f.nota ?? null, f.alCliente ?? null]), [
    ["Se agregó al checklist", null, null],
    ["Se recibe diseño preliminar, se envia para correcciones", 12, true],
    ["FOGA cobra 12% más que MADEVAL: negociar", 14, false],
    ["Llegó el diseño corregido.", 16, true],
  ]);
  // La última anotación, la que se lee en la fila, trae la marca.
  assert.equal(ultimaAnotacion(NOTAS.filter(n => n.task_id === 196)).visible_cliente, true);
  const cuadro = codigoDe("../src/components/HistorialDeTarea.jsx");
  // Se cambia de un toque, y solo donde el cliente ve el punto.
  assert.match(cuadro, /\{loLee && h\.nota != null && \(/);
  assert.match(cuadro, /className="nota-al-cliente" data-la-lee=\{h\.alCliente \? "si" : "no"\} aria-pressed=\{h\.alCliente\}/);
  assert.match(cuadro, /onClick=\{\(\) => mostrar\(h, !h\.alCliente\)\}/);
});

test("LO QUE PIDIÓ: en un punto que el cliente ve, lo que se anota nace para él; «solo nosotros» lo deja interno", () => {
  const cuadro = codigoDe("../src/components/HistorialDeTarea.jsx");
  // Lo dice la pantalla que lo dibuja o, en Tareas, la tarea misma.
  assert.match(cuadro, /const loLee = \(paraElCliente !== undefined \? !!paraElCliente : tarea\?\.visible_cliente === true\) && !traido\.sinNotasAlCliente;/);
  assert.match(cuadro, /const \[soloNosotros, setSoloNosotros\] = useState\(false\);/);
  assert.match(cuadro, /const alCliente = loLee && !soloNosotros;/);
  assert.match(cuadro, /onAnotar \? await onAnotar\(paso, \{ alCliente \}\) : await anotarEnLaTarea\(tarea, paso, currentUser, \{ alCliente \}\)/);
  // El botón dice para quién es.
  assert.match(cuadro, /\{alCliente \? "Anotar y mostrárselo" : "Anotar"\}/);
  assert.match(cuadro, /\[\[false, "La lee el cliente", Eye\], \[true, "Solo nosotros", EyeOff\]\]/);
  // Ya no hay un tilde apagado ni un cuadro aparte de «actualización».
  const lista = codigoDe("../src/modules/leads/ListaDeTareas.jsx");
  assert.doesNotMatch(lista, /queLoLea/);
  assert.doesNotMatch(lista, /Actualización para el cliente/);
  assert.match(lista, /dijo = await anotarEnLaTarea\(item, paso, currentUser, \{ alCliente: alCliente && puedeLeerlo \}\);/);
  assert.match(lista, /paraElCliente=\{puedeLeerlo\} onMostrarNota=\{mostrarNota\}/);
  // Guardar: la anotación lleva la marca; y sin la 185 se anota igual y lo dice.
  const datos = codigoDe("../src/modules/leads/proyecto.js");
  assert.match(datos, /\.insert\(alCliente \? \{ \.\.\.fila, visible_cliente: true \} : fila\)/);
  assert.match(datos, /return sinMarca \? `Quedó anotado, pero el cliente no lo lee: \$\{SIN_185\}` : null;/);
  assert.match(datos, /from\("tarea_comentarios"\)\.update\(\{ visible_cliente: !!ver \}\)\.eq\("id", nota\.id\)/);
  // Leer: con la marca, y sin ella si la columna todavía no está.
  assert.match(datos, /select\(`\$\{NOTA\},visible_cliente`\)/);
  assert.match(datos, /sinNotasAlCliente: anotado\.sinMarca/);
});

test("LO QUE PREGUNTÓ: el punto nuevo dice si lo ve el cliente, y nace a la vista cuando ya ve todo lo abierto", () => {
  const lista = codigoDe("../src/modules/leads/ListaDeTareas.jsx");
  assert.match(lista, /const naceALaVista = !sinCompartir && abiertas\.length > 0 && abiertas\.every\(i => compartidas\.has\(i\.id\)\);/);
  // El tilde está a la vista al agregar, y manda sobre la regla.
  assert.match(lista, /className="nace-a-la-vista"/);
  assert.match(lista, /checked=\{nuevo\.alCliente \?\? naceALaVista\} onChange=\{e => setNuevo\(n => \(\{ \.\.\.n, alCliente: e\.target\.checked \}\)\)\}/);
  assert.match(lista, /if \(!sinCompartir && \(n\.alCliente \?\? naceALaVista\)\) \{ const e = await mostrarAlCliente\(r\.item, true, currentUser\);/);
  // Lo mismo la lista pegada.
  assert.match(lista, /alCliente: \(pegar\.alCliente \?\? naceALaVista\) && !sinCompartir,/);
  // Y la fila que el cliente no ve, lo dice: solo donde ve las demás.
  assert.match(lista, /\{!laVeElCliente && hayCliente && !item\.hecho && onCliente && \(\s+<span className="no-la-ve-el-cliente"/);
  assert.match(lista, /hayCliente=\{compartidas\.size > 0\} sinNotas=\{historial\.sinNotasAlCliente\}/);
});

test("LO QUE PREGUNTÓ: dónde se suben los archivos tiene su título, adentro de lo que ve el cliente de ese punto", () => {
  const lista = codigoDe("../src/modules/leads/ListaDeTareas.jsx");
  assert.ok(lista.includes("<span>FOTOS Y ARCHIVOS PARA EL CLIENTE</span>"));
  const caja = lista.slice(lista.indexOf('className="para-el-cliente"'), lista.indexOf('className="no-lo-ve-el-cliente"'));
  assert.match(caja, /<FotosYArchivosDelCliente lead=\{lead \|\| \{ id: item\.lead_id \}\} punto=\{item\}/);
  // Ya no depende de la migración de los textos: basta con que el cliente vea el punto.
  assert.match(lista, /\{laVeElCliente && \(\s+<div className="para-el-cliente"/);
  // El botón dice «subir», que es como lo preguntó.
  assert.match(codigoDe("../src/modules/leads/FotosYArchivosDelCliente.jsx"), /"Subir más fotos o archivos" : "Subir fotos o archivos"/);
  // Y el punto que no ve dice que ahí se abre dónde subirlos.
  assert.ok(lista.includes("<span>EL CLIENTE NO VE ESTE PUNTO</span>"));
  assert.match(lista, /className="mostrar-al-cliente" onClick=\{\(\) => onCliente\(true\)\}/);
});

test("la migración 185 suma un dato a las anotaciones; lo ya anotado sigue interno, salvo sus dos de RES BG", () => {
  const sql = leer("../supabase/migrations/185_las_anotaciones_que_lee_el_cliente.sql");
  assert.match(sql, /add column if not exists visible_cliente boolean not null default false;/);
  const ordenes = sql.split("\n").filter(l => !l.trim().startsWith("--")).join("\n");
  assert.doesNotMatch(ordenes, /^\s*(delete|drop|truncate|insert)\b/im);
  // Un solo cambio de datos, con nombre y apellido: dos anotaciones, y solo si el punto se le muestra.
  assert.equal((ordenes.match(/^\s*update\b/gim) || []).length, 1);
  assert.match(ordenes, /and t\.visible_cliente = true\s+and t\.lead_id = 13\s+and c\.id in \(12, 13\)/);
});
