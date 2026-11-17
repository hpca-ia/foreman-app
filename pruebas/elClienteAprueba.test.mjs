// El cliente aprueba un punto del checklist desde su enlace. Hernán,
// 17/11/2026: «¿dónde se sube archivos relacionados? Estos debe poder ver
// cliente para que apruebe». Le propuse que en cada punto tuviera «Lo apruebo»
// / «Tengo observaciones», que quedara en el historial y avisara por correo, y
// contestó «sí».
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { listaDelCliente, loDelCliente, aprobacionDe, respuestaDelCliente, correoDeLaRespuesta, correoDeLaLista } from "../api/_listaDelCliente.js";
import { dichoAdentro, historialDe } from "../src/modules/leads/historialDeTarea.js";

const leer = ruta => readFileSync(new URL(ruta, import.meta.url), "utf8");
const codigoDe = ruta => leer(ruta).split("\n").filter(l => !l.trim().startsWith("//")).join("\n");

const punto = (id, title, extra = {}) => ({ id, title, status: "en-progreso", visible_cliente: true, ruta_orden: id, ...extra });
const FOGA = punto(196, "FOGA", { cliente_aprueba: true, assignee_id: 1, created_by: 1 });
const AHORA = new Date("2026-11-18T15:00:00Z");

test("LO QUE PIDIÓ: al punto se le pide la aprobación, y el cliente lo ve como algo que espera su respuesta", () => {
  assert.equal(aprobacionDe(punto(195, "MADEVAL")), null);
  assert.equal(aprobacionDe(null), null);
  assert.deepEqual(aprobacionDe(FOGA), { estado: "pendiente", respondido_el: null, nota: "" });
  // Viaja en el punto, y nada más del punto cambia.
  const [t] = listaDelCliente([FOGA]);
  assert.deepEqual(t.aprobar, { estado: "pendiente", respondido_el: null, nota: "" });
  assert.equal(t.estado, "pendiente");
  assert.equal(listaDelCliente([punto(195, "MADEVAL")])[0].aprobar, null);
  // Y en lo que arma el enlace, con sus archivos al lado: es lo que tiene que mirar.
  const { lista } = loDelCliente({
    tareas: [FOGA], archivos: [{ id: 1, task_id: 196, nombre: "Diseño FOGA.pdf", storage_path: "a", visible_cliente: true, created_at: "2026-11-18T14:00:00Z" }],
    enlaces: { a: "https://deposito.test/1" },
  });
  assert.equal(lista[0].aprobar.estado, "pendiente");
  assert.equal(lista[0].archivos[0].nombre, "Diseño FOGA.pdf");
});

test("lo aprueba: queda en la tarea con su fecha, en el historial del punto y en la historia del proyecto", () => {
  const r = respuestaDelCliente({ tarea: FOGA, conforme: true, ahora: AHORA });
  assert.deepEqual(r, {
    aprobado: true, nota: "",
    campos: { cliente_respuesta: "aprobado", cliente_respuesta_at: "2026-11-18T15:00:00.000Z", cliente_respuesta_nota: null },
    anotacion: "El cliente lo aprobó desde su enlace.",
    bitacora: 'El cliente aprobó "FOGA" desde su enlace.',
  });
  // Puede decir algo al aprobar: viaja con la aprobación.
  const conNota = respuestaDelCliente({ tarea: FOGA, conforme: true, nota: "  Perfecto, adelante  ", ahora: AHORA });
  assert.equal(conNota.campos.cliente_respuesta_nota, "Perfecto, adelante");
  assert.equal(conNota.anotacion, "El cliente lo aprobó desde su enlace. Dijo: «Perfecto, adelante»");
  // Después se lee así, en su enlace y en el correo.
  const contestado = { ...FOGA, ...r.campos };
  assert.deepEqual(aprobacionDe(contestado), { estado: "aprobado", respondido_el: "2026-11-18", nota: "" });
});

test("deja observaciones: tiene que decir cuáles, y quedan escritas", () => {
  assert.deepEqual(respuestaDelCliente({ tarea: FOGA, conforme: false, nota: "   " }), { error: "Contanos qué hay que cambiar.", codigo: 400 });
  const r = respuestaDelCliente({ tarea: FOGA, conforme: false, nota: "El mesón va en cuarzo blanco, no gris.", ahora: AHORA });
  assert.equal(r.aprobado, false);
  assert.deepEqual(r.campos, { cliente_respuesta: "observado", cliente_respuesta_at: "2026-11-18T15:00:00.000Z", cliente_respuesta_nota: "El mesón va en cuarzo blanco, no gris." });
  assert.equal(r.anotacion, "El cliente dejó observaciones desde su enlace: «El mesón va en cuarzo blanco, no gris.»");
  assert.equal(r.bitacora, 'El cliente dejó observaciones en "FOGA" desde su enlace: «El mesón va en cuarzo blanco, no gris.»');
  assert.deepEqual(aprobacionDe({ ...FOGA, ...r.campos }), { estado: "observado", respondido_el: "2026-11-18", nota: "El mesón va en cuarzo blanco, no gris." });
  // Un texto larguísimo se corta: es una nota, no un archivo.
  assert.equal(respuestaDelCliente({ tarea: FOGA, conforme: false, nota: "x".repeat(5000) }).campos.cliente_respuesta_nota.length, 2000);
});

test("no se aprueba lo que no se pidió, ni lo que no ve, ni dos veces", () => {
  assert.deepEqual(respuestaDelCliente({ tarea: null, conforme: true }), { error: "No se encontró ese punto.", codigo: 404 });
  assert.deepEqual(respuestaDelCliente({ tarea: { ...FOGA, visible_cliente: false }, conforme: true }), { error: "No se encontró ese punto.", codigo: 404 });
  assert.deepEqual(respuestaDelCliente({ tarea: { ...FOGA, descartada: true }, conforme: true }), { error: "No se encontró ese punto.", codigo: 404 });
  assert.deepEqual(respuestaDelCliente({ tarea: punto(195, "MADEVAL"), conforme: true }), { error: "Este punto no está esperando tu aprobación.", codigo: 409 });
  assert.deepEqual(respuestaDelCliente({ tarea: { ...FOGA, cliente_respuesta: "aprobado" }, conforme: false, nota: "mejor no" }),
    { error: "Este punto ya tiene tu respuesta.", codigo: 409 });
  assert.deepEqual(respuestaDelCliente(), { error: "No se encontró ese punto.", codigo: 404 });
});

test("el servidor busca el punto por el proyecto de la llave y vuelve a filtrar al escribir", () => {
  const portal = codigoDe("../api/portal.js");
  const rama = portal.slice(portal.indexOf('if (que === "punto")'), portal.indexOf('if (que === "orden")'));
  // El punto de otro proyecto no se encuentra.
  assert.match(rama, /`tasks\?id=eq\.\$\{Number\(id\)\}&lead_id=eq\.\$\{lead\.id\}`/);
  assert.match(rama, /const r = respuestaDelCliente\(\{ tarea, conforme: !!conforme, nota \}\);/);
  assert.match(rama, /if \(r\.error\) return res\.status\(r\.codigo\)\.json\(\{ error: r\.error \}\);/);
  // Solo se escribe si sigue pedido y sin contestar: dos toques no dejan dos respuestas.
  assert.match(rama, /&lead_id=eq\.\$\{lead\.id\}&visible_cliente=eq\.true&cliente_aprueba=eq\.true&cliente_respuesta=is\.null`/);
  assert.match(rama, /if \(!Array\.isArray\(escritas\) \|\| !escritas\.length\) return res\.status\(409\)/);
  // Queda en el historial del punto y en la historia del proyecto, y se avisa.
  assert.match(rama, /rest\("tarea_comentarios", \{ method: "POST", body: JSON\.stringify\(\{ task_id: tarea\.id, texto: r\.anotacion,/);
  assert.match(rama, /detalle: r\.bitacora/);
  assert.match(rama, /await avisarLaRespuesta\(lead, tarea, r\);/);
  // Si el aviso falla, la respuesta ya quedó: no se le dice al cliente que falló.
  assert.ok(rama.indexOf("escritas.length") < rama.indexOf("try {"));
  // A quien tiene el punto, a quien lo creó y a quien lleva el proyecto.
  assert.match(portal, /\[tarea\.assignee_id, tarea\.created_by, lead\.responsable_id\]/);
  // Y el enlace lee lo pedido; sin la 186, sale sin la aprobación.
  assert.match(portal, /`\$\{paraEl178\},cliente_aprueba,cliente_respuesta,cliente_respuesta_at,cliente_respuesta_nota`/);
  assert.match(portal, /if \(!Array\.isArray\(marcadas\)\) marcadas = await json\(await rest\(paraEl178\)\);/);
});

test("el correo le avisa al equipo qué contestó, con lo que escribió escapado", () => {
  const si = correoDeLaRespuesta({ proyecto: "RES BG", punto: "FOGA", aprobado: true, app: "https://foreman.test" });
  assert.equal(si.asunto, "RES BG · el cliente aprobó «FOGA»");
  assert.ok(si.cuerpo.includes("El cliente lo aprobó desde su enlace."));
  assert.ok(si.cuerpo.includes('href="https://foreman.test"'));
  const no = correoDeLaRespuesta({ proyecto: "RES BG", punto: "FOGA", aprobado: false, nota: 'Cambiar <b>el mesón</b> "ya"' });
  assert.equal(no.asunto, "RES BG · el cliente dejó observaciones en «FOGA»");
  assert.ok(no.cuerpo.includes("Cambiar &lt;b&gt;el mesón&lt;/b&gt; &quot;ya&quot;"));
  assert.equal(no.cuerpo.includes("<b>el mesón</b>"), false);
  assert.ok(no.cuerpo.includes("se le vuelve a pedir la aprobación"));
});

test("el correo del checklist dice qué punto espera su aprobación", () => {
  const lista = listaDelCliente([FOGA, punto(195, "MADEVAL"), punto(197, "Window world", { cliente_aprueba: true, cliente_respuesta: "aprobado", cliente_respuesta_at: "2026-11-18T15:00:00Z" })]);
  const { cuerpo } = correoDeLaLista({ proyecto: "RES BG", lista, enlace: "https://x.test/?cliente=abc" });
  assert.equal((cuerpo.match(/Necesitamos tu aprobación/g) || []).length, 1);
  assert.ok(cuerpo.includes("entrá al enlace de abajo para aprobarlo o dejar tus observaciones"));
  assert.ok(cuerpo.includes("Lo aprobaste el 18 de noviembre de 2026."));
  const correo = codigoDe("../api/_aviso-checklist.js");
  assert.match(correo, /`\$\{conTextos\},cliente_aprueba,cliente_respuesta,cliente_respuesta_at,cliente_respuesta_nota`/);
});

test("en el checklist se le pide adentro de lo que ve el cliente, y la fila dice en qué está", () => {
  const lista = codigoDe("../src/modules/leads/ListaDeTareas.jsx");
  assert.ok(lista.includes("<span>¿LO TIENE QUE APROBAR?</span>"));
  const caja = lista.slice(lista.indexOf('className="para-el-cliente"'), lista.indexOf('className="no-lo-ve-el-cliente"'));
  assert.match(caja, /className="pedir-aprobacion" onClick=\{\(\) => hacer\(\(\) => pedirAprobacion\(item, true, currentUser\)\)\}/);
  assert.match(caja, /className="no-pedir-aprobacion" onClick=\{\(\) => hacer\(\(\) => pedirAprobacion\(item, false, currentUser\)\)\}/);
  // La fila: espera, aprobado u observaciones; solo si el cliente ve el punto.
  assert.match(lista, /\{laVeElCliente && aprobacion && \(\s+<span className="aprobacion-del-cliente" data-estado=\{aprobacion\.estado\}/);
  assert.match(lista, /aprobacion=\{aprobaciones\[item\.id\] \|\| null\} sinAprobacion=\{sinAprobacion\}/);
  // Guardar: pedir de nuevo borra la respuesta anterior, y queda en el historial del punto.
  const datos = codigoDe("../src/modules/leads/proyecto.js");
  assert.match(datos, /\? \{ cliente_aprueba: true, cliente_respuesta: null, cliente_respuesta_at: null, cliente_respuesta_nota: null \}\s+: \{ cliente_aprueba: false \};/);
  assert.match(datos, /detalle: pedir \? `Le pidió al cliente que apruebe "\$\{item\.texto\}"` : `Dejó de pedirle al cliente que apruebe "\$\{item\.texto\}"`,\s+quien, extra: \{ task_id: item\.id \},/);
  // Sin la 186 todo lo demás anda, y solo no se ofrece.
  assert.match(datos, /sinAprobacion: !!ePedidas && !eVistas,/);
});

test("en el historial del punto se lee que se le pidió y qué contestó", () => {
  assert.equal(dichoAdentro('Le pidió al cliente que apruebe "FOGA"'), "Se le pidió al cliente que lo apruebe");
  assert.equal(dichoAdentro('Dejó de pedirle al cliente que apruebe "FOGA"'), "Se dejó de pedirle la aprobación al cliente");
  const h = historialDe({
    tarea: { id: 196, title: "FOGA", status: "en-progreso", created_at: "2026-11-13T18:27:00Z", created_by: 1 },
    movimientos: [{ id: 1, detalle: 'Le pidió al cliente que apruebe "FOGA"', autor_nombre: "Hernan Cueva", automatico: true, created_at: "2026-11-18T14:00:00Z" }],
    comentarios: [{ id: 20, task_id: 196, texto: "El cliente lo aprobó desde su enlace.", autor_id: null, autor_nombre: null, created_at: "2026-11-18T15:00:00Z" }],
    nombreDe: () => "Hernan Cueva",
  });
  assert.deepEqual(h.map(f => [f.texto, f.quien, f.automatico]), [
    ["Se agregó al checklist", "Hernan Cueva", true],
    ["Se le pidió al cliente que lo apruebe", "Hernan Cueva", true],
    ["El cliente lo aprobó desde su enlace.", null, false],
  ]);
  // Lo que contestó él no lleva el botón de mostrárselo: ya lo ve en su enlace.
  assert.equal(h[2].delCliente, true);
  // Una anotación del equipo que empiece igual no se confunde: tiene autor.
  const delEquipo = historialDe({ tarea: null, comentarios: [{ id: 21, texto: "El cliente lo aprobó desde su enlace, ya avisé a FOGA", autor_id: 1, created_at: "2026-11-18T16:00:00Z" }] });
  assert.equal(delEquipo[0].delCliente, false);
});

test("el cliente contesta en el punto y en «Para aprobar», con los mismos botones que una entrega", () => {
  const pantalla = codigoDe("../src/portal/PortalCliente.jsx");
  assert.match(pantalla, /<Aprobacion punto=\{t\} onContestar=\{onContestar\} enviando=\{enviando\} \/>/);
  assert.match(pantalla, /className="lo-apruebo" disabled=\{enviando\} onClick=\{\(\) => onContestar\?\.\(punto, true, nota\)\}/);
  assert.match(pantalla, /onClick=\{\(\) => \(abierto \? onContestar\?\.\(punto, false, nota\) : setAbierto\(true\)\)\}/);
  assert.match(pantalla, /const contestarPunto = \(t, conforme, nota\) => contestar\(\{ que: "punto", id: t\.id, conforme, nota \}\);/);
  // Cuenta en la solapa «Para aprobar», y ahí están.
  assert.match(pantalla, /\+ ocPendientes\.length \+ puntosPendientes\.length;/);
  assert.match(pantalla, /\{puntosParaAprobar\.map\(t => \(\s+<div key=\{`punto-\$\{t\.id\}`\} className="punto-para-aprobar"/);
  // Con la respuesta puesta ya no hay botones.
  assert.match(pantalla, /if \(a\.estado !== "pendiente"\) \{/);
});

test("la migración 186 solo suma cuatro datos a la tarea: ningún punto queda pidiendo aprobación", () => {
  const sql = leer("../supabase/migrations/186_el_cliente_aprueba_un_punto.sql");
  assert.match(sql, /add column if not exists cliente_aprueba boolean not null default false,/);
  assert.match(sql, /add column if not exists cliente_respuesta text,/);
  assert.match(sql, /check \(cliente_respuesta is null or cliente_respuesta in \('aprobado', 'observado'\)\);/);
  const ordenes = sql.split("\n").filter(l => !l.trim().startsWith("--")).join("\n");
  assert.doesNotMatch(ordenes, /^\s*(delete|update|drop|truncate|insert)\b/im);
});
