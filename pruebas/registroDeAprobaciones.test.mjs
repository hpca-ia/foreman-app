// El registro de aprobaciones del cliente y el aviso al pedirle una. Hernán,
// 17/11/2026: «en este proyecto quiero implementar aprobaciones de los
// clientes... residente o nosotros subimos información, planos, presupuestos,
// y estos los aprueba el cliente. Esta colección de aprobaciones es un
// sustento y justificación. ¿Cómo lo manejamos? ¿Desde dónde?... Cada vez que
// se solicite una aprobación FOREMAN manda un mensaje al cliente, por WhatsApp
// y correo». Y: «aún no tenemos configurado FOREMAN y WP».
//
// Lo que definió cuando se lo pregunté: por WhatsApp, un botón ahora y
// automático después; cuando el cliente aprueba, que quede en el registro; y
// primero el registro de aprobaciones.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { paraWhatsApp, mensajeDelPedido, enlaceDeWhatsApp, aQuienAvisar, filaDelPedido, registroDeAprobaciones, resumenDelRegistro,
  estadoDelPedido, registroParaPdf } from "../src/modules/leads/aprobaciones.js";
import { archivosAprobados, decisionesDelCliente, correoDelPedido } from "../api/_listaDelCliente.js";
import { dichoAdentro } from "../src/modules/leads/historialDeTarea.js";

const leer = ruta => readFileSync(new URL(ruta, import.meta.url), "utf8");
const codigoDe = ruta => leer(ruta).split("\n").filter(l => !l.trim().startsWith("//")).join("\n");

// ── El aviso ────────────────────────────────────────────────────────────────

test("el WhatsApp de un celular de Ecuador se escribe de cualquier forma y es el mismo número", () => {
  for (const escrito of ["0991234567", "099 123 4567", "+593 99 123 4567", "593991234567", "00593991234567", "991234567", "(099) 123-4567"]) {
    assert.equal(paraWhatsApp(escrito), "593991234567", escrito);
  }
  // De otro país: viene con su código y se deja como está.
  assert.equal(paraWhatsApp("+1 305 555 0142"), "13055550142");
  // Lo que no parece un celular no se inventa.
  for (const no of ["", null, "2234567", "no tiene", "12345"]) assert.equal(paraWhatsApp(no), "", String(no));
});

test("LO QUE PIDIÓ: el mensaje de WhatsApp dice qué tiene que aprobar y lleva su enlace; se abre ya escrito", () => {
  const texto = mensajeDelPedido({ nombre: "XAVIER BANDERAS", proyecto: "RES BG", punto: "Plano de cocina", enlace: "https://foreman.test/?cliente=abc" });
  assert.equal(texto, "Hola Xavier, en RES BG necesitamos tu aprobación de «Plano de cocina». Lo revisás y lo aprobás acá, sin usuario ni contraseña:\nhttps://foreman.test/?cliente=abc");
  assert.ok(mensajeDelPedido({ punto: "X", enlace: "e" }).startsWith("Hola, en tu proyecto necesitamos"));
  const enlace = enlaceDeWhatsApp("099 123 4567", texto);
  assert.ok(enlace.startsWith("https://wa.me/593991234567?text=Hola%20Xavier%2C%20en%20RES%20BG"));
  assert.ok(enlace.includes(encodeURIComponent("https://foreman.test/?cliente=abc")));
  // Sin número no hay botón.
  assert.equal(enlaceDeWhatsApp("", texto), null);
});

test("a quién se le avisa: la gente de afuera con correo o WhatsApp, el cliente primero, y nadie del equipo", () => {
  const personas = [
    { clave: "ana@fisca.test", nombre: "Ana Fiscal", empresa: "", cargo: "Fiscalización", email: "ana@fisca.test", telefono: "" },
    { clave: "ld@oficina.test", nombre: "Lizeth De la Cruz", empresa: "HCARQ", cargo: "Residente de obra", email: "ld@oficina.test", telefono: "0987654321" },
    { clave: "i7", nombre: "Xavier Banderas", empresa: "", cargo: "cliente", email: "", telefono: "099 123 4567" },
    { clave: "xb@cliente.test", nombre: "Paula Banderas", empresa: "", cargo: "cliente", email: " XB@cliente.test ", telefono: "" },
    // Sin correo ni celular: no hay cómo avisarle.
    { clave: "i9", nombre: "Maestro Luis", empresa: "", cargo: "otro", email: "", telefono: "2234567" },
  ];
  const equipo = [{ id: 4, name: "Lizeth", email: "LD@oficina.test" }];
  assert.deepEqual(aQuienAvisar(personas, equipo), [
    { clave: "xb@cliente.test", nombre: "Paula Banderas", rol: "cliente", email: "xb@cliente.test", whatsapp: "", esCliente: true },
    { clave: "i7", nombre: "Xavier Banderas", rol: "cliente", email: "", whatsapp: "593991234567", esCliente: true },
    { clave: "ana@fisca.test", nombre: "Ana Fiscal", rol: "Fiscalización", email: "ana@fisca.test", whatsapp: "", esCliente: false },
  ]);
  assert.deepEqual(aQuienAvisar(), []);
});

test("el correo le dice al cliente qué tiene que revisar y lo lleva a aprobar, con todo lo escrito escapado", () => {
  const { asunto, cuerpo } = correoDelPedido({
    proyecto: "RES BG", punto: "Plano de cocina", descripcion: "Planta y alzados", archivos: ["Cocina planta.pdf", "<b>alzado</b>.pdf"],
    mensaje: "Hola Xavier,\nte paso el plano.", enlace: "https://foreman.test/?cliente=abc",
  });
  assert.equal(asunto, "RES BG · necesitamos tu aprobación: Plano de cocina");
  assert.ok(cuerpo.includes("Necesitamos tu aprobación"));
  assert.ok(cuerpo.includes("<li>Cocina planta.pdf</li>"));
  assert.ok(cuerpo.includes("&lt;b&gt;alzado&lt;/b&gt;.pdf"));
  assert.ok(cuerpo.includes('href="https://foreman.test/?cliente=abc"'));
  assert.ok(cuerpo.includes(">Ver y aprobar</a>"));
  assert.ok(cuerpo.includes("Hola Xavier,\nte paso el plano."));
  // Sin archivos no promete archivos.
  const sin = correoDelPedido({ proyecto: "RES BG", punto: "Color de fachada", enlace: "https://x.test" }).cuerpo;
  assert.equal(sin.includes("Para revisar:"), false);
  assert.ok(sin.includes("Ahí tocás «Lo apruebo»"));
});

test("el aviso lo manda el servidor solo si hay dónde aprobar, y queda anotado a quién", () => {
  const aviso = codigoDe("../api/_aviso-pedido.js");
  assert.ok(aviso.indexOf("sesionValida(req)") < aviso.indexOf("req.body"), "primero la sesión");
  assert.match(aviso, /if \(!lead\.portal_activo \|\| !lead\.portal_token\) \{/);
  assert.match(aviso, /if \(tarea\.visible_cliente !== true\)/);
  assert.match(aviso, /if \(tarea\.cliente_aprueba !== true\)/);
  assert.match(aviso, /if \(tarea\.cliente_respuesta\)/);
  // A quién se le avisó: en el pedido abierto del registro y en el historial del punto.
  // (Desde el 18/11/2026 el aviso también sale por WhatsApp: se anota por dónde salió.)
  assert.match(aviso, /const avisos = \[\.\.\.\(Array\.isArray\(abierto\.avisos\) \? abierto\.avisos : \[\]\), esteAviso\];/);
  assert.match(aviso, /correos: enviadoA, cuando, quien: quien\?\.name \|\| null,/);
  assert.match(aviso, /enviadoA\.length \? `por correo a \$\{enviadoA\.join\(", "\)\}` : "",/);
  assert.match(aviso, /detalle: `Le avisó \$\{porDonde\} que apruebe "\$\{tarea\.title\}"`,/);
  assert.equal(dichoAdentro('Le avisó por correo a xb@cliente.test que apruebe "Plano de cocina"'), "Se le avisó por correo a xb@cliente.test");
  // Entra por la misma puerta de los avisos: no es una función más de Vercel.
  const puerta = codigoDe("../api/aviso.js");
  assert.match(puerta, /import pedido from "\.\/_aviso-pedido\.js";/);
  assert.match(puerta, /visto, checklist, pedido, whatsapp \};/);
});

test("pedir es avisar: el botón abre la ventana, que pide, manda el correo y deja el WhatsApp listo", () => {
  const lista = codigoDe("../src/modules/leads/ListaDeTareas.jsx");
  assert.match(lista, /onPedirAprobacion=\{modo => setPedido\(\{ item, modo \}\)\}/);
  assert.match(lista, /<PedirAprobacion lead=\{lead\} item=\{pedido\.item\} modo=\{pedido\.modo\}/);
  const ventana = codigoDe("../src/modules/leads/PedirAprobacion.jsx");
  assert.match(ventana, /const e = await pedirAprobacion\(item, true, currentUser, \{ descripcion, hasta: hasta \|\| null \}\);/);
  assert.match(ventana, /const r = await avisarDelPedido\(\{ item: el, correos, whatsapps, mensaje, quien: currentUser \}\);/);
  // El cliente, ya tildado.
  assert.match(ventana, /setElegidos\(new Set\(lista\.filter\(p => p\.esCliente && \(p\.email \|\| \(numero\.configurado && p\.whatsapp\)\)\)\.map\(p => p\.clave\)\)\);/);
  // Si no hay a quién avisarle, se lo carga ahí mismo, con el contacto del proyecto, y queda en «Gente».
  assert.match(ventana, /if \(!lista\.length\) setNueva\(\{ \.\.\.VACIA, nombre: String\(lead\.contacto \|\| ""\)\.trim\(\) \}\);/);
  assert.match(ventana, /const r = personaDeLaFicha\(\{ \.\.\.nueva, rol: "cliente" \}, lead\.id\);/);
  assert.match(ventana, /const e = await agregarALaFicha\(r\.fila\);/);
  // El WhatsApp: el mensaje con su enlace, ya escrito.
  assert.match(ventana, /href=\{enlaceDeWhatsApp\(p\.whatsapp, mensajeDelPedido\(\{ nombre: p\.nombre, proyecto: lead\.nombre, punto: punto\.texto, enlace, hasta: hecho\.aviso \? null : hasta \}\)\)\}/);
  // Sin el enlace del cliente no se pide: no tendría dónde aprobar.
  assert.match(ventana, /const sinEnlace = !cargando && !enlace;/);
});

test("LO QUE PREGUNTÓ: «¿desde dónde envío presupuestos, planos, documentos para aprobar?» — desde la pestaña, en una sola ventana", () => {
  // Hernán, 18/11/2026, con todo publicado. Eran cuatro pasos en dos lugares.
  const pestana = codigoDe("../src/modules/leads/AprobacionesDelProyecto.jsx");
  assert.match(pestana, /className="enviar-para-aprobar" onClick=\{\(\) => setVentana\(\{ modo: "enviar" \}\)\}/);
  assert.match(pestana, /<PedirAprobacion lead=\{lead\} modo=\{ventana\.modo\} item=\{ventana\.item \|\| null\}/);
  assert.match(pestana, /etapas=\{etapas\} etapaId=\{sePersigue\(lead\) \? lead\.etapa : null\}/);
  // Lo que sigue esperando se avisa de nuevo desde su renglón.
  assert.match(pestana, /className="avisar-de-nuevo" onClick=\{\(\) => setVentana\(\{ modo: "avisar", item: \{ id: p\.task_id, tarea_id: p\.task_id, lead_id: lead\.id, texto: p\.titulo \}, archivos: p\.archivos, plazo: p\.vence_el \}\)\}/);
  // Los cuatro pasos, seguidos: nace el punto, se le muestra, se suben sus archivos y se le pide.
  const datos = codigoDe("../src/modules/leads/proyecto.js");
  const fn = datos.slice(datos.indexOf("export async function enviarParaAprobar"), datos.indexOf("export async function avisarDelPedido"));
  const orden = ["await agregarTarea({", "await mostrarAlCliente(item, true, quien)", "await subirParaElCliente({ lead, punto: item, archivos, quien })", "await pedirAprobacion(item, true, quien, { descripcion, hasta })"].map(x => fn.indexOf(x));
  assert.ok(orden.every(i => i >= 0), "están los cuatro pasos");
  assert.deepEqual([...orden].sort((a, b) => a - b), orden, "en ese orden");
  // Sin título no nace nada.
  assert.match(fn, /if \(!que\) return \{ error: "Escribí qué tiene que aprobar/);
  // Queda a cargo de quien lo envía.
  assert.match(fn, /assignee_id: quien\?\.id \?\? null, nombreResponsable: quien\?\.name \|\| null, quien,/);
  // Si eligió archivos y no subió ninguno, no se le pide: tendría los botones delante de un punto vacío.
  assert.match(fn, /if \(!subida\.subidos\) return \{ item, sinPedir: true, errores: subida\.errores \};/);
  assert.ok(fn.indexOf("sinPedir: true") < fn.indexOf("await pedirAprobacion("), "antes de pedir");
  // La ventana es la misma de «Pedirle que lo apruebe», en modo «enviar».
  const ventana = codigoDe("../src/modules/leads/PedirAprobacion.jsx");
  assert.match(ventana, /const r = await enviarParaAprobar\(\{ lead, titulo: que, descripcion: paraEl, etapaId: etapa \|\| null, archivos: adjuntos, quien: currentUser, hasta: hasta \|\| null \}\);/);
  assert.match(ventana, /if \(modo === "enviar" && !hecho && !que\.trim\(\)\) \{/);
  // Y si no se pudo pedir, lo dice y no ofrece avisarle.
  assert.match(ventana, /if \(r\.error \|\| r\.sinPedir\) \{\s+setHecho\(\{ pedido: false, sinPedir: true,/);
  assert.match(ventana, /\{hecho\.sinPedir \|\| !punto \|\| \(wa && !aMano\.length\) \? null : aMano\.length > 0 \? \(/);
});

// ── El registro ─────────────────────────────────────────────────────────────

const FILAS = [
  { id: 1, lead_id: 13, task_id: 196, titulo: "FOGA", descripcion: "Cocina", pedida_at: "2026-11-18T14:00:00Z", pedida_nombre: "Hernan Cueva",
    avisos: [{ correos: ["xb@cliente.test"], cuando: "2026-11-18T14:00:10Z", quien: "Hernan Cueva" }],
    respuesta: "observado", respuesta_at: "2026-11-18T20:00:00Z", respuesta_nota: "El mesón va en cuarzo blanco.",
    archivos: [{ id: 5, nombre: "Diseño FOGA rev1.pdf", tamano: 2048, storage_path: "proyecto-13/cliente/a.pdf", subido_at: "2026-11-18T13:50:00Z" }] },
  { id: 2, lead_id: 13, task_id: 195, titulo: "MADEVAL", pedida_at: "2026-11-19T10:00:00Z", pedida_nombre: "Camila Mena", avisos: [], archivos: [],
    retirada_at: "2026-11-19T11:00:00Z", retirada_nombre: "Camila Mena" },
  { id: 3, lead_id: 13, task_id: 196, titulo: "FOGA", pedida_at: "2026-11-20T09:00:00Z", pedida_nombre: "Hernan Cueva", avisos: [],
    respuesta: "aprobado", respuesta_at: "2026-11-20T15:00:00Z", respuesta_nota: null,
    archivos: [{ id: 8, nombre: "Diseño FOGA rev2.pdf", storage_path: "proyecto-13/cliente/b.pdf", subido_at: "2026-11-20T08:55:00Z" }] },
  { id: 4, lead_id: 13, task_id: 210, titulo: "Plano de cocina", pedida_at: "2026-11-21T09:00:00Z", pedida_nombre: "Hernan Cueva", avisos: [], archivos: [] },
];
const DE_AHORA = { 210: [{ id: 12, task_id: 210, nombre: "Cocina planta.pdf", storage_path: "proyecto-13/cliente/c.pdf", created_at: "2026-11-21T08:50:00Z" }] };

test("LO QUE PIDIÓ: la colección entera, cada pedido con su número, qué contestó y qué archivos tenía", () => {
  const registro = registroDeAprobaciones(FILAS, DE_AHORA);
  // Lo más nuevo arriba; el número es el orden en que se pidió y no cambia.
  assert.deepEqual(registro.map(p => [p.numero, p.titulo, p.estado, p.vigente]), [
    [4, "Plano de cocina", "pendiente", true],
    [3, "FOGA", "aprobado", true],
    [2, "MADEVAL", "retirado", true],
    // A FOGA se le pidió dos veces: la primera queda como historia.
    [1, "FOGA", "observado", false],
  ]);
  const de = n => registro.find(p => p.numero === n);
  // Contestado: los archivos de ESE momento, no los de hoy.
  assert.deepEqual(de(1).archivos.map(a => a.nombre), ["Diseño FOGA rev1.pdf"]);
  assert.deepEqual(de(3).archivos.map(a => a.nombre), ["Diseño FOGA rev2.pdf"]);
  assert.equal(de(1).nota, "El mesón va en cuarzo blanco.");
  assert.deepEqual(de(1).avisos, [{ correos: ["xb@cliente.test"], cuando: "2026-11-18T14:00:10Z", quien: "Hernan Cueva" }]);
  // Esperando: lo que tiene para mirar hoy.
  assert.deepEqual(de(4).archivos, [{ id: 12, nombre: "Cocina planta.pdf", storage_path: "proyecto-13/cliente/c.pdf", subido_at: "2026-11-21T08:50:00Z" }]);
  // Retirado: cuándo se retiró.
  assert.equal(de(2).respuesta_at, "2026-11-19T11:00:00Z");
  assert.deepEqual(resumenDelRegistro(registro), { total: 4, aprobadas: 1, observadas: 1, pendientes: 1, retiradas: 1, vencidas: 0 });
  assert.deepEqual(registroDeAprobaciones(), []);
  assert.deepEqual(registroDeAprobaciones({ message: "relation does not exist" }), []);
  assert.equal(estadoDelPedido("aprobado").dice, "Aprobado");
  assert.equal(estadoDelPedido("cualquiera").dice, "Esperando respuesta");
});

test("cada pedido entra al registro con cómo se llamaba el punto y quién lo pidió", () => {
  assert.deepEqual(filaDelPedido({ item: { id: 196, lead_id: 13, texto: " FOGA " }, descripcion: " Cocina ", quien: { id: 1, name: "Hernan Cueva" } }),
    { lead_id: 13, task_id: 196, titulo: "FOGA", descripcion: "Cocina", pedida_por: 1, pedida_nombre: "Hernan Cueva" });
  const datos = codigoDe("../src/modules/leads/proyecto.js");
  // Al pedir entra una fila; el pedido que estaba abierto se retira.
  assert.match(datos, /const fila = \{ \.\.\.filaDelPedido\(\{ item, descripcion, quien, hasta: sinPlazo \? null : plazo \}\), pedida_at: new Date\(\)\.toISOString\(\) \};\s+const \{ error: eFila \} = await supabase\.from\("aprobaciones_cliente"\)\.insert\(fila\);/);
  assert.match(datos, /\.update\(\{ retirada_at: new Date\(\)\.toISOString\(\), retirada_nombre: quien\?\.name \|\| null \}\)\s+\.eq\("task_id", item\.id\)\.is\("respuesta", null\)\.is\("retirada_at", null\);/);
});

test("cuando el cliente contesta, el servidor copia al registro los archivos que tenía para mirar", () => {
  assert.deepEqual(archivosAprobados([
    { id: 8, nombre: "rev2.pdf", tamano: "4096", storage_path: "p/b.pdf", created_at: "2026-11-20T08:55:00Z", visible_cliente: true },
    { id: 5, nombre: " rev1.pdf ", tamano: 2048, storage_path: "p/a.pdf", created_at: "2026-11-18T13:50:00Z" },
    { id: 9, nombre: "sin ruta" },
  ]), [
    { id: 5, nombre: "rev1.pdf", tamano: 2048, storage_path: "p/a.pdf", subido_at: "2026-11-18T13:50:00Z" },
    { id: 8, nombre: "rev2.pdf", tamano: 4096, storage_path: "p/b.pdf", subido_at: "2026-11-20T08:55:00Z" },
  ]);
  assert.deepEqual(archivosAprobados(null), []);
  const portal = codigoDe("../api/portal.js");
  const fn = portal.slice(portal.indexOf("async function alRegistro"), portal.indexOf("async function avisarLaRespuesta"));
  // Los del punto, y solo los que él veía.
  assert.match(fn, /`proyecto_archivos\?lead_id=eq\.\$\{lead\.id\}&task_id=eq\.\$\{tarea\.id\}&visible_cliente=eq\.true`/);
  assert.match(fn, /respuesta_ip: ip, archivos: archivosAprobados\(suyos\) \};/);
  // Completa el pedido abierto; si no hay, anota uno. Sin la 187, nada.
  assert.match(fn, /&respuesta=is\.null&retirada_at=is\.null`/);
  assert.match(fn, /if \(!Array\.isArray\(abiertos\)\) return;/);
  assert.match(fn, /rest\(`aprobaciones_cliente\?id=eq\.\$\{abiertos\[0\]\.id\}&respuesta=is\.null`, \{ method: "PATCH", body: JSON\.stringify\(dicho\) \}\)/);
});

test("lo que el cliente ya aprobó no se borra: deja de verse, y queda para el registro", () => {
  const datos = codigoDe("../src/modules/leads/proyecto.js");
  assert.match(datos, /\.not\("respuesta", "is", null\)\.contains\("archivos", \[\{ id: a\.id \}\]\)\.limit\(1\);/);
  const quitar = datos.slice(datos.indexOf("export async function quitarArchivoDelCliente"), datos.indexOf("export async function mostrarArchivoAlCliente"));
  assert.ok(quitar.indexOf("esDeUnaAprobacion(a)") < quitar.indexOf(".delete()"), "primero se pregunta si es de una aprobación");
  assert.match(quitar, /update\(\{ visible_cliente: false \}\)\.eq\("id", a\.id\);\s+return error \? error\.message : "guardado";/);
  // Tampoco desde la pestaña Archivos.
  const cajon = codigoDe("../src/modules/leads/ArchivosDelProyecto.jsx");
  assert.ok(cajon.indexOf("await esDeUnaAprobacion(a)") < cajon.indexOf('storage.from("task-files").remove'), "antes de borrar del depósito");
  // Y la pantalla lo dice, no lo muestra como un error.
  assert.match(codigoDe("../src/modules/leads/FotosYArchivosDelCliente.jsx"), /if \(e === "guardado"\) \{/);
});

test("el registro se lee en la pestaña «Aprobaciones» del proyecto y se baja en PDF", () => {
  const ficha = codigoDe("../src/modules/leads/ModalLead.jsx");
  assert.match(ficha, /\["archivos", "Archivos"\], \["aprobaciones", "Aprobaciones"\], \["gente", "Gente"\]\]/);
  assert.match(ficha, /seccionVisible === "aprobaciones" && \(\s+<AprobacionesDelProyecto lead=\{vivo\} catalogo=\{catalogo\} users=\{users\} currentUser=\{currentUser\} editable=\{editable\} \/>/);
  const pantalla = codigoDe("../src/modules/leads/AprobacionesDelProyecto.jsx");
  assert.match(pantalla, /const registro = registroDeAprobaciones\(datos\.filas, datos\.archivosDeAhora, undefined, datos\.estados\);/);
  assert.match(pantalla, /await exportarPDF\(registroParaPdf\(registro, \{ proyecto: lead\.nombre \}\)\);/);
  // El documento: en orden de pedido, con lo que hace falta para sustentar.
  const doc = registroParaPdf(registroDeAprobaciones(FILAS, DE_AHORA), { proyecto: "RES BG" });
  assert.equal(doc.titulo, "Registro de aprobaciones del cliente");
  assert.equal(doc.subtitulo, "RES BG");
  assert.deepEqual(doc.resumen.map(r => [r.label, r.valor]), [["Pedidas", 4], ["Aprobadas", 1], ["Con observaciones", 1], ["Esperando respuesta", 1]]);
  assert.deepEqual(doc.bloques[0].columnas, ["N°", "Qué se le pidió aprobar", "Archivos", "Pedida", "Respuesta", "Lo que escribió"]);
  assert.deepEqual(doc.bloques[0].filas.map(f => [f[0], f[1], f[2], f[5]]), [
    ["1", "FOGA\nCocina", "Diseño FOGA rev1.pdf", "El mesón va en cuarzo blanco."],
    ["2", "MADEVAL", "Sin archivos", ""],
    ["3", "FOGA", "Diseño FOGA rev2.pdf", ""],
    ["4", "Plano de cocina", "Cocina planta.pdf", ""],
  ]);
  assert.ok(doc.bloques[0].filas[0][3].includes("por Hernan Cueva"));
  assert.ok(doc.bloques[0].filas[0][3].includes("Avisado a xb@cliente.test"));
  assert.ok(doc.bloques[0].filas[0][4].startsWith("Con observaciones\n"));
  assert.ok(doc.bloques[0].filas[1][4].startsWith("Pedido retirado\n"));
  assert.ok(doc.bloques[0].filas[3][4] === "Esperando respuesta");
});

test("el cliente ve en su enlace lo que ya decidió, con los archivos que aprobó", () => {
  const enlaces = { "proyecto-13/cliente/a.pdf": "https://deposito.test/a", "proyecto-13/cliente/b.pdf": "https://deposito.test/b" };
  assert.deepEqual(decisionesDelCliente(FILAS, enlaces), [
    { id: 3, titulo: "FOGA", estado: "aprobado", respondido_el: "2026-11-20", nota: "", archivos: [{ nombre: "Diseño FOGA rev2.pdf", url: "https://deposito.test/b" }] },
    { id: 1, titulo: "FOGA", estado: "observado", respondido_el: "2026-11-18", nota: "El mesón va en cuarzo blanco.", archivos: [{ nombre: "Diseño FOGA rev1.pdf", url: "https://deposito.test/a" }] },
  ]);
  // Ni lo que espera, ni lo retirado, ni quién lo pidió, ni a quién se le avisó.
  const todo = JSON.stringify(decisionesDelCliente(FILAS, enlaces));
  for (const interno of ["Plano de cocina", "MADEVAL", "Hernan", "Camila", "xb@cliente.test", "storage_path", "proyecto-13"]) assert.equal(todo.includes(interno), false, interno);
  assert.deepEqual(decisionesDelCliente(null), []);
  const portal = codigoDe("../api/portal.js");
  assert.match(portal, /`aprobaciones_cliente\?lead_id=eq\.\$\{lead\.id\}&respuesta=not\.is\.null`/);
  assert.match(portal, /if \(!Array\.isArray\(decididas\)\) decididas = \[\];/);
  assert.match(portal, /decisiones: decisionesDelCliente\(decididas, enlaces\),/);
  const pantalla = codigoDe("../src/portal/PortalCliente.jsx");
  assert.match(pantalla, /\.\.\.\(decisiones\.length \? \[\["decisiones", "Decisiones", decisiones\.length\]\] : \[\]\),/);
});

test("la migración 187 crea el registro, anota lo que ya se había pedido y no cambia ningún dato existente", () => {
  const sql = leer("../supabase/migrations/187_el_registro_de_aprobaciones_del_cliente.sql");
  assert.match(sql, /create table if not exists public\.aprobaciones_cliente \(/);
  // Si el punto se borra, lo aprobado queda.
  assert.match(sql, /task_id\s+bigint references public\.tasks\(id\) on delete set null,/);
  assert.match(sql, /check \(respuesta is null or respuesta in \('aprobado', 'observado'\)\)/);
  assert.match(sql, /create policy "equipo foreman" on public\.aprobaciones_cliente for all to authenticated using \(true\) with check \(true\);/);
  const ordenes = sql.split("\n").filter(l => !l.trim().startsWith("--")).join("\n");
  assert.doesNotMatch(ordenes, /^\s*(delete|update|truncate)\b/im);
  assert.doesNotMatch(ordenes, /drop table/i);
  // Lo único que escribe son filas en la tabla nueva: lo pedido antes de que existiera,
  // una por punto, y solo si ese punto todavía no tiene ninguna.
  assert.deepEqual(ordenes.match(/^\s*insert into [\w.]+/gim).map(x => x.trim()), ["insert into public.aprobaciones_cliente"]);
  assert.match(ordenes, /where t\.cliente_aprueba and t\.lead_id is not null\s+and not exists \(select 1 from public\.aprobaciones_cliente r where r\.task_id = t\.id\);/);
  // Los archivos que tenía al contestar: los que veía, subidos antes de su respuesta.
  assert.match(ordenes, /where a\.task_id = t\.id and a\.visible_cliente and a\.created_at <= t\.cliente_respuesta_at/);
});
