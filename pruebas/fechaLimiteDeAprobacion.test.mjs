// La fecha límite para que el cliente apruebe. Hernán, 18/11/2026: «¿hay cómo
// poner una fecha límite en que el cliente debe aprobar?». Y cuando llega y no
// contestó, lo que definió: «marcar vencida y avisarme» —en el punto, en el
// registro, en el panel de avisos y en el correo de la mañana—. No eligió que
// FOREMAN le escriba solo al cliente, ni que se dé por aprobado.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PLAZOS, plazoDe, mensajeDelPedido, filaDelPedido, registroDeAprobaciones, resumenDelRegistro, estadoDelPedido, registroParaPdf,
  aprobacionesVencidas, esMiAprobacion } from "../src/modules/leads/aprobaciones.js";
import { aprobacionesVencidas as delServidor } from "../api/_avisosDelPipeline.js";
import { aprobacionDe, listaDelCliente, correoDelPedido, correoDeLaLista, respuestaDelCliente, hoyDeAca } from "../api/_listaDelCliente.js";
import { avisosDelTablero } from "../src/lib/avisos.js";
import { armarResumen } from "../api/_resumen.js";
import { dichoAdentro } from "../src/modules/leads/historialDeTarea.js";

const leer = ruta => readFileSync(new URL(ruta, import.meta.url), "utf8");
const codigoDe = ruta => leer(ruta).split("\n").filter(l => !l.trim().startsWith("//")).join("\n");
const HOY = "2026-11-18";

test("LO QUE PREGUNTÓ: el plazo se elige de un toque, y se dice cuánto le queda o hace cuánto venció", () => {
  assert.deepEqual(PLAZOS.map(p => [p.dias, p.label]), [[3, "3 días"], [7, "Una semana"], [14, "Dos semanas"]]);
  assert.equal(plazoDe(null, HOY), null);
  assert.equal(plazoDe("", HOY), null);
  assert.deepEqual(plazoDe("2026-11-21", HOY), { hasta: "2026-11-21", faltan: 3, vencida: false, dice: "hasta el 21 nov, faltan 3 días", frase: "Tiene hasta el 21 nov, faltan 3 días" });
  assert.deepEqual([plazoDe("2026-11-19", HOY).dice, plazoDe("2026-11-19", HOY).frase], ["vence mañana", "El plazo vence mañana"]);
  // El día del plazo todavía está a tiempo: vence HOY, no está vencida.
  assert.deepEqual([plazoDe(HOY, HOY).dice, plazoDe(HOY, HOY).frase, plazoDe(HOY, HOY).vencida], ["vence hoy", "El plazo vence hoy", false]);
  assert.deepEqual(plazoDe("2026-11-17", HOY), { hasta: "2026-11-17", faltan: -1, vencida: true, dice: "venció el 17 nov, hace 1 día", frase: "El plazo venció el 17 nov, hace 1 día" });
  assert.equal(plazoDe("2026-11-10T05:00:00Z", HOY).dice, "venció el 10 nov, hace 8 días");
});

test("el cliente ve su plazo: en su enlace, en el correo y en el WhatsApp", () => {
  const punto = { id: 196, title: "Plano de cocina", status: "en-progreso", visible_cliente: true, cliente_aprueba: true, cliente_aprueba_hasta: "2026-11-21" };
  // En su enlace.
  assert.deepEqual(aprobacionDe(punto, HOY), { estado: "pendiente", respondido_el: null, nota: "", hasta: "2026-11-21", vencida: false });
  assert.deepEqual(listaDelCliente([punto], [], HOY)[0].aprobar.hasta, "2026-11-21");
  // Pasado el día sin contestar, vencida; el mismo día, todavía no.
  assert.equal(aprobacionDe(punto, "2026-11-21").vencida, false);
  assert.equal(aprobacionDe(punto, "2026-11-22").vencida, true);
  // Si ya contestó no hay nada vencido, aunque haya contestado tarde.
  assert.equal(aprobacionDe({ ...punto, cliente_respuesta: "aprobado", cliente_respuesta_at: "2026-11-25T15:00:00Z" }, "2026-11-30").vencida, false);
  // Sin plazo, nunca vence.
  assert.deepEqual([aprobacionDe({ ...punto, cliente_aprueba_hasta: null }, "2027-01-01").hasta, aprobacionDe({ ...punto, cliente_aprueba_hasta: null }, "2027-01-01").vencida], [null, false]);
  // «Hoy» se mira en Ecuador: a las 9 de la noche del 21 en Quito —ya el 22 en Londres— todavía es 21.
  assert.equal(hoyDeAca(new Date("2026-11-22T02:00:00Z")), "2026-11-21");
  // En el correo del pedido y en el del checklist.
  const pedido = correoDelPedido({ proyecto: "RES BG", punto: "Plano de cocina", enlace: "https://x.test", hasta: "2026-11-21" });
  assert.equal(pedido.asunto, "RES BG · necesitamos tu aprobación hasta el 21 nov: Plano de cocina");
  assert.ok(pedido.cuerpo.includes("Necesitamos tu aprobación hasta el 21 de noviembre de 2026"));
  assert.equal(correoDelPedido({ proyecto: "RES BG", punto: "X", enlace: "e" }).asunto, "RES BG · necesitamos tu aprobación: X");
  assert.ok(correoDeLaLista({ proyecto: "RES BG", lista: listaDelCliente([punto], [], HOY) }).cuerpo.includes("Necesitamos tu aprobación hasta el 21 de noviembre de 2026."));
  // En el WhatsApp.
  assert.ok(mensajeDelPedido({ nombre: "Xavier", proyecto: "RES BG", punto: "Plano de cocina", enlace: "e", hasta: "2026-11-21" })
    .startsWith("Hola Xavier, en RES BG necesitamos tu aprobación de «Plano de cocina», hasta el 21 de noviembre. "));
  // Y los lee el servidor, con lo de antes si la 188 todavía no está.
  const portal = codigoDe("../api/portal.js");
  assert.match(portal, /let marcadas = await json\(await rest\(`\$\{conAprobacion\},cliente_aprueba_hasta`\)\);\s+if \(!Array\.isArray\(marcadas\)\) marcadas = await json\(await rest\(conAprobacion\)\);/);
  const aviso = codigoDe("../api/_aviso-pedido.js");
  assert.match(aviso, /let tareas = await crudo\(await rest\(`\$\{deLaTarea\},cliente_aprueba_hasta`\)\);\s+if \(!Array\.isArray\(tareas\)\) tareas = await crudo\(await rest\(deLaTarea\)\);/);
  assert.match(aviso, /hasta: tarea\.cliente_aprueba_hasta \|\| null,/);
});

test("vencida no es cerrada: el cliente puede contestar después del plazo", () => {
  const punto = { id: 196, title: "Plano de cocina", visible_cliente: true, cliente_aprueba: true, cliente_aprueba_hasta: "2026-11-10" };
  const r = respuestaDelCliente({ tarea: punto, conforme: true, ahora: new Date("2026-11-18T15:00:00Z") });
  assert.equal(r.error, undefined);
  assert.equal(r.campos.cliente_respuesta, "aprobado");
  const pantalla = codigoDe("../src/portal/PortalCliente.jsx");
  assert.ok(pantalla.includes("El plazo era el {dia(a.hasta)}. Todavía podés contestar."));
});

test("el plazo queda en la tarea y en el pedido del registro, y se cambia desde el punto", () => {
  assert.deepEqual(filaDelPedido({ item: { id: 196, lead_id: 13, texto: "Plano de cocina" }, quien: { id: 1, name: "Hernan Cueva" }, hasta: "2026-11-21" }),
    { lead_id: 13, task_id: 196, titulo: "Plano de cocina", descripcion: null, pedida_por: 1, pedida_nombre: "Hernan Cueva", vence_el: "2026-11-21" });
  // Sin plazo, la fila no nombra la columna: entra igual sin la migración 188.
  assert.equal("vence_el" in filaDelPedido({ item: { id: 196, lead_id: 13, texto: "X" } }), false);
  const datos = codigoDe("../src/modules/leads/proyecto.js");
  assert.match(datos, /await supabase\.from\("tasks"\)\.update\(\{ \.\.\.campos, cliente_aprueba_hasta: plazo \}\)\.eq\("id", item\.id\);/);
  // Sin la 188 se pide igual, sin plazo, y se dice.
  assert.match(datos, /const sinPlazo = !!error && falta\(error\) && \/cliente_aprueba_hasta\/\.test\(error\.message \|\| ""\);/);
  assert.match(datos, /return plazo && sinPlazo \? `Quedó pedido, pero sin fecha límite: \$\{SIN_188\}` : null;/);
  // Al retirar el pedido, el plazo se va con él.
  assert.match(datos, /const plazo = pedir \? String\(hasta \|\| ""\)\.slice\(0, 10\) \|\| null : null;/);
  // Cambiarlo: en la tarea y en el pedido abierto.
  const cambiar = datos.slice(datos.indexOf("export async function ponerPlazoDeAprobacion"), datos.indexOf("export async function enviarParaAprobar"));
  assert.match(cambiar, /from\("tasks"\)\.update\(\{ cliente_aprueba_hasta: plazo \}\)\.eq\("id", item\.id\)/);
  assert.match(cambiar, /from\("aprobaciones_cliente"\)\.update\(\{ vence_el: plazo \}\)\.eq\("task_id", item\.id\)\.is\("respuesta", null\)\.is\("retirada_at", null\)/);
  // En el historial del punto se lee.
  assert.equal(dichoAdentro('Le pidió al cliente que apruebe "Plano de cocina", hasta el 21 nov'), "Se le pidió al cliente que lo apruebe, hasta el 21 nov");
  assert.equal(dichoAdentro('El cliente tiene hasta el 28 nov para aprobar "Plano de cocina"'), "El cliente tiene hasta el 28 nov para aprobarlo");
  assert.equal(dichoAdentro('"Plano de cocina" queda sin fecha límite para que el cliente apruebe'), "Queda sin fecha límite para que el cliente lo apruebe");
  // Se elige al pedir y al enviar; se cambia en el punto, guardándose solo.
  const ventana = codigoDe("../src/modules/leads/PedirAprobacion.jsx");
  assert.match(ventana, /\{modo !== "avisar" && \(\s+<div className="plazo-para-aprobar"/);
  const lista = codigoDe("../src/modules/leads/ListaDeTareas.jsx");
  assert.match(lista, /onChange=\{e => hacer\(\(\) => ponerPlazoDeAprobacion\(item, e\.target\.value \|\| null, currentUser\)\)\}/);
  assert.match(lista, /const plazo = aprobacion\?\.estado === "pendiente" \? plazoDe\(aprobacion\.hasta, hoyISO\(\)\) : null;/);
});

test("en el registro, el pedido con el plazo pasado sale como vencido; y el plazo de cada pedido queda escrito", () => {
  const FILAS = [
    { id: 1, lead_id: 13, task_id: 196, titulo: "Plano de cocina", pedida_at: "2026-11-05T14:00:00Z", pedida_nombre: "Hernan Cueva", avisos: [], archivos: [], vence_el: "2026-11-10" },
    { id: 2, lead_id: 13, task_id: 195, titulo: "MADEVAL", pedida_at: "2026-11-12T14:00:00Z", avisos: [], archivos: [], vence_el: "2026-11-25" },
    { id: 3, lead_id: 13, task_id: 197, titulo: "Window world", pedida_at: "2026-11-01T14:00:00Z", avisos: [], archivos: [], vence_el: "2026-11-05",
      respuesta: "aprobado", respuesta_at: "2026-11-08T15:00:00Z" },
    { id: 4, lead_id: 13, task_id: 198, titulo: "Persianas", pedida_at: "2026-11-13T14:00:00Z", avisos: [], archivos: [] },
  ];
  const registro = registroDeAprobaciones(FILAS, {}, HOY);
  const de = t => registro.find(p => p.titulo === t);
  assert.deepEqual(registro.map(p => [p.titulo, p.estado, p.vence_el, p.vencida]), [
    ["Persianas", "pendiente", null, false], ["MADEVAL", "pendiente", "2026-11-25", false],
    ["Plano de cocina", "pendiente", "2026-11-10", true],
    // Contestó tarde: está aprobado, no vencido; y su plazo queda escrito.
    ["Window world", "aprobado", "2026-11-05", false],
  ]);
  assert.deepEqual(estadoDelPedido(de("Plano de cocina").estado, de("Plano de cocina").vencida), { dice: "Vencida · sin respuesta", tono: "danger" });
  assert.equal(estadoDelPedido("pendiente", false).dice, "Esperando respuesta");
  assert.equal(estadoDelPedido("aprobado", true).dice, "Aprobado");
  assert.deepEqual(resumenDelRegistro(registro), { total: 4, aprobadas: 1, observadas: 0, pendientes: 3, retiradas: 0, vencidas: 1 });
  // En el PDF.
  const filas = registroParaPdf(registro, { proyecto: "RES BG" }).bloques[0].filas;
  const fila = t => filas.find(f => f[1] === t);
  assert.ok(fila("Plano de cocina")[3].includes("Plazo: hasta el 10 nov 2026"));
  assert.equal(fila("Plano de cocina")[4], "Vencida · sin respuesta");
  assert.ok(fila("Window world")[3].includes("Plazo: hasta el 5 nov 2026"));
  assert.equal(fila("Persianas")[3].includes("Plazo"), false);
});

// ── El aviso ────────────────────────────────────────────────────────────────

const LEADS = [
  { id: 13, nombre: "RES BG", resultado: null, responsable_id: 1, created_by: 1 },
  { id: 15, nombre: "Diners Aereo GYE", resultado: "ganado", responsable_id: 4, created_by: 1 },
  { id: 9, nombre: "Perdido", resultado: "perdido", responsable_id: 1, created_by: 1 },
];
const pide = (id, lead_id, title, hasta, extra = {}) => ({ id, lead_id, title, status: "en-progreso", visible_cliente: true, cliente_aprueba: true, cliente_respuesta: null, cliente_aprueba_hasta: hasta, assignee_id: 1, ...extra });
const TAREAS = [
  pide(1, 13, "Plano de cocina", "2026-11-10"),
  pide(2, 13, "MADEVAL", "2026-11-17", { assignee_id: 7 }),
  pide(3, 15, "Cambio de piso", "2026-11-16", { assignee_id: 4 }),
  // No avisan: vence hoy, vence después, sin plazo, ya contestó, ya no lo ve, se cerró, se descartó, proyecto perdido, no se le pidió.
  pide(4, 13, "Vence hoy", HOY), pide(5, 13, "Vence después", "2026-11-25"), pide(6, 13, "Sin plazo", null),
  pide(7, 13, "Contestó", "2026-11-10", { cliente_respuesta: "observado" }), pide(8, 13, "Ya no lo ve", "2026-11-10", { visible_cliente: false }),
  pide(9, 13, "Hecho", "2026-11-10", { status: "listo" }), pide(10, 13, "Descartado", "2026-11-10", { descartada: true }),
  pide(11, 9, "De un perdido", "2026-11-10"), pide(12, 13, "No se le pidió", "2026-11-10", { cliente_aprueba: false }),
  { id: 13, lead_id: null, title: "Suelta", cliente_aprueba: true, cliente_aprueba_hasta: "2026-11-10" },
];

test("LO QUE DEFINIÓ: se avisa lo que el cliente dejó pasar —con plazo, vencido y sin respuesta—, y nada más", () => {
  const avisos = aprobacionesVencidas({ leads: LEADS, tareas: TAREAS, hoy: HOY });
  assert.deepEqual(avisos.map(a => [a.nombre, a.titulo, a.dias, a.texto]), [
    // Primero la que lleva más días vencida.
    ["RES BG", "Plano de cocina", 8, "«Plano de cocina» venció el 10 nov, hace 8 días"],
    ["Diners Aereo GYE", "Cambio de piso", 2, "«Cambio de piso» venció el 16 nov, hace 2 días"],
    ["RES BG", "MADEVAL", 1, "«MADEVAL» venció el 17 nov, hace 1 día"],
  ]);
  // También en un proyecto ya aprobado: las aprobaciones siguen en la obra.
  assert.ok(avisos.some(a => a.lead_id === 15));
  assert.deepEqual(aprobacionesVencidas(), []);
  // LA MISMA REGLA EN EL SERVIDOR: el correo de la mañana no puede decir otra cosa.
  assert.deepEqual(delServidor({ leads: LEADS, tareas: TAREAS, hoy: HOY }), avisos);
  assert.deepEqual(delServidor(), []);
});

test("cada quien ve las suyas: quien lleva el proyecto, quien tiene el punto, y el Director todas", () => {
  const avisos = aprobacionesVencidas({ leads: LEADS, tareas: TAREAS, hoy: HOY });
  const de = (id, veTodo = false) => avisos.filter(a => esMiAprobacion(a, id, veTodo)).map(a => a.titulo);
  assert.deepEqual(de(1), ["Plano de cocina", "Cambio de piso", "MADEVAL"]);   // responsable de RES BG y quien creó los dos
  assert.deepEqual(de(4), ["Cambio de piso"]);                                  // responsable de Diners
  assert.deepEqual(de(7), ["MADEVAL"]);                                         // tiene ese punto
  assert.deepEqual(de(99), []);
  assert.deepEqual(de(99, true).length, 3);
});

test("sale en el panel de avisos del tablero, y lleva al pipeline", () => {
  const avisos = aprobacionesVencidas({ leads: LEADS, tareas: TAREAS, hoy: HOY });
  const una = avisosDelTablero({ aprobaciones: avisos.slice(0, 1) });
  assert.deepEqual(una, [{
    clave: "aprobaciones-vencidas", modulo: "Aprobaciones del cliente", vista: "leads", tono: "peligro", cuenta: 1,
    texto: "aprobación del cliente con el plazo vencido", detalle: "RES BG: «Plano de cocina» venció el 10 nov, hace 8 días",
  }]);
  const varias = avisosDelTablero({ aprobaciones: avisos })[0];
  assert.deepEqual([varias.cuenta, varias.texto, varias.detalle], [3, "aprobaciones del cliente con el plazo vencido", "RES BG · Diners Aereo GYE"]);
  // Sin ninguna, el panel no dice nada de esto.
  assert.deepEqual(avisosDelTablero({}), []);
  const app = codigoDe("../src/App.jsx");
  assert.match(app, /aprobacionesVencidas\(\{ leads: proyectosPipeline\.filter\(l => nivelProyecto\(l\.id\)\), tareas \}\)\s+\.filter\(a => esMiAprobacion\(a, usuario\.id, entraATodo\)\)/);
});

test("sale en el correo de la mañana de quien le toca, aunque no tenga nada más", () => {
  const usuarios = [
    { id: 1, nombre: "Hernan Cueva", email: "hc@oficina.test", rol: "owner", activo: true },
    { id: 7, nombre: "Camila Mena", email: "cm@oficina.test", rol: "arquitecto", activo: true },
    { id: 8, nombre: "Otra", email: "o@oficina.test", rol: "arquitecto", activo: true },
  ];
  const aprobaciones = aprobacionesVencidas({ leads: LEADS, tareas: TAREAS, hoy: HOY });
  const sobres = armarResumen({ tareas: [], usuarios, leads: LEADS, accesos: [], hoy: HOY, pipeline: [], aprobaciones });
  const de = id => sobres.find(s => s.usuario.id === id);
  assert.deepEqual(de(1).aprobaciones.map(a => a.titulo), ["Plano de cocina", "Cambio de piso", "MADEVAL"]);
  assert.deepEqual(de(7).aprobaciones.map(a => a.titulo), ["MADEVAL"]);
  // A quien no le toca ninguna y no tiene nada, no le llega un correo vacío.
  assert.equal(de(8), undefined);
  const correo = codigoDe("../api/_resumenDiario.js");
  assert.match(correo, /bloqueDeAprobaciones\(s\.aprobaciones \|\| \[\]\),/);
  assert.ok(correo.includes("APROBACIONES DEL CLIENTE CON EL PLAZO VENCIDO · ${lista.length}"));
  // Se piden aparte: sin la 188 no hay ninguna y el resumen sale igual.
  assert.match(correo, /"tasks\?cliente_aprueba=eq\.true&cliente_respuesta=is\.null&cliente_aprueba_hasta=not\.is\.null"/);
  assert.match(correo, /aprobaciones = aprobacionesVencidas\(\{ leads, tareas: conPlazo, hoy: hoyISO\(\) \}\);\s+\} catch \{/);
  // No se le escribe solo al cliente: eso no lo eligió.
  assert.doesNotMatch(correo, /correoDelPedido|de=pedido/);
});

test("la migración 188 solo suma dos fechas, vacías: ningún pedido queda con plazo", () => {
  const sql = leer("../supabase/migrations/188_la_fecha_limite_de_una_aprobacion.sql");
  assert.match(sql, /alter table public\.tasks\s+add column if not exists cliente_aprueba_hasta date;/);
  assert.match(sql, /alter table public\.aprobaciones_cliente\s+add column if not exists vence_el date;/);
  const ordenes = sql.split("\n").filter(l => !l.trim().startsWith("--")).join("\n");
  assert.doesNotMatch(ordenes, /^\s*(delete|update|drop|truncate|insert)\b/im);
});
