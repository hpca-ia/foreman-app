// Los dos cuadros que Hernán encontró confusos el 17/11/2026, mirando RES BG:
// el de arriba del proyecto («¿este cuadro de diálogo al inicio qué hace?») y
// el de un punto abierto («también es confuso... ¿qué sucede cuando ya se
// completa esa tarea o gestión? ¿Si se agenda reunión o se pasa a otra
// actividad relacionada? ¿Se abre una nueva tarea, o se genera desde ahí
// mismo, por continuidad?» · «no tiene botón cerrar»).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { estadoDelLead, explicarSinPaso, loQueDice } from "../src/modules/leads/pipeline.js";
import { loQueSigue } from "../src/modules/leads/tareasDelProyecto.js";

const leer = ruta => readFileSync(new URL(ruta, import.meta.url), "utf8");
const codigoDe = ruta => leer(ruta).split("\n").filter(l => !l.trim().startsWith("//")).join("\n");

const HOY = "2026-11-17";
const RES_BG = { id: 13, nombre: "RES BG", etapa: "con_ingenierias", tunel: "construccion", resultado: null };
const t = (id, title, extra = {}) => ({ id, title, status: "en-progreso", due_date: null, lead_id: 13, ...extra });
// Como estaba RES BG: ocho abiertos, ninguno con fecha; el más viejo, Eléctrica.
const OCHO = [
  t(135, "Revision de Electrica"), t(136, "Revision de Sanitaria"), t(137, "Revision de Estructural"), t(195, "MADEVAL"),
  t(196, "FOGA"), t(197, "Window world"), t(198, "Persianas"), t(199, "Dekorando"),
  t(120, "Levantamiento", { status: "listo" }), t(300, "Pedido de tubería", { compra_id: 4 }),
];

test("LO QUE PREGUNTÓ: el cuadro de arriba dice la cuenta entera, por qué importa y qué hace el botón", () => {
  const estado = estadoDelLead(RES_BG, OCHO, HOY);
  assert.equal(estado.clase, "sin_paso");
  // La tarjeta del pipeline sigue diciéndolo corto.
  assert.equal(loQueDice(estado), "«Revision de Electrica» · sin fecha");
  // Adentro del proyecto: no es Eléctrica, son los ocho. Lo hecho y las compras no cuentan.
  assert.deepEqual(explicarSinPaso(estado, OCHO), {
    dice: "Ninguno de los 8 puntos abiertos tiene fecha.",
    ayuda: "Sin un paso con fecha nadie lo vuelve a mirar: FOREMAN lo recuerda el día que le pongas.",
    boton: "Ponerle fecha a «Revision de Electrica»",
  });
});

test("con un solo punto abierto se lo nombra; sin ninguno, se pide el próximo paso", () => {
  const uno = [t(195, "MADEVAL")];
  assert.equal(explicarSinPaso(estadoDelLead(RES_BG, uno, HOY), uno).dice, "«MADEVAL» no tiene fecha.");
  const nada = [t(120, "Levantamiento", { status: "listo" })];
  const e = explicarSinPaso(estadoDelLead(RES_BG, nada, HOY), nada);
  assert.equal(e.dice, "No queda nada abierto en el checklist.");
  assert.equal(e.boton, "Poner el próximo paso");
  assert.equal(explicarSinPaso(estadoDelLead(RES_BG, [], HOY), []).boton, "Poner el próximo paso");
});

test("si tiene un paso con fecha, o espera al cliente, no hay nada que explicar", () => {
  const conFecha = [t(195, "MADEVAL", { due_date: "2026-11-18" }), t(196, "FOGA")];
  assert.equal(explicarSinPaso(estadoDelLead(RES_BG, conFecha, HOY), conFecha), null);
  const vencido = [t(195, "MADEVAL", { due_date: "2026-11-10" })];
  assert.equal(explicarSinPaso(estadoDelLead(RES_BG, vencido, HOY), vencido), null);
  const esperando = { ...RES_BG, espera_desde: "2026-11-15", recordar_el: "2026-11-20" };
  assert.equal(explicarSinPaso(estadoDelLead(esperando, OCHO, HOY), OCHO), null);
  assert.equal(explicarSinPaso(null, OCHO), null);
});

test("el cuadro de arriba lleva sus títulos, y los botones de fecha se abren y se cierran", () => {
  const estado = codigoDe("../src/modules/leads/EstadoDelLead.jsx");
  assert.match(estado, /\{ancho && <span style=\{rotulo\}>ETAPA<\/span>\}/);
  assert.match(estado, />TIPO<\/span>/);
  assert.match(estado, />PRÓXIMO PASO<\/div>/);
  assert.match(estado, /\{ancho && falta \? falta\.dice : loQueDice\(estado\)\}/);
  // La fila de fechas ya no está siempre abierta: se pide, y tiene «Cancelar».
  assert.match(estado, /\{editable && pidiendo === "fecha" && \(/);
  assert.doesNotMatch(estado, /!pidiendo && estado\.clase === "sin_paso" && \(/);
  assert.match(estado, /<button onClick=\{cerrarPedido\} style=\{chip\(false\)\}>Cancelar<\/button>/);
  // Y al guardar se cierra sola.
  assert.equal((estado.match(/setPidiendo\(null\); setEstadoGuardado\("guardado"\);/g) || []).length, 2);
});

// ── Lo que sigue ────────────────────────────────────────────────────────────
const ELECTRICA = { id: 135, tarea_id: 135, texto: "Revision de Electrica", etapa_id: "con_ingenierias", lead_id: 13 };
const FILA = { id: 135, title: "Revision de Electrica", type: "Gestión", assignee_id: 1, responsable_externo: null };

test("LO QUE PREGUNTÓ: al terminar un punto, lo que sigue nace de él — misma etapa, misma persona", () => {
  assert.deepEqual(loQueSigue({ de: ELECTRICA, tarea: FILA, clase: "gestion", texto: "  Pedir la corrección de los planos " }), {
    titulo: "Pedir la corrección de los planos", etapaId: "con_ingenierias", tipo: "Gestión", due_date: null, hora: null,
    assignee_id: 1, responsable_externo: null, vieneDe: { id: 135, texto: "Revision de Electrica" },
  });
  // El de afuera que lo tenía lo sigue teniendo.
  const deAfuera = loQueSigue({ de: ELECTRICA, tarea: { ...FILA, assignee_id: null, responsable_externo: "Ing. Jácome" }, texto: "Entregar planos corregidos", due_date: "2026-11-21" });
  assert.equal(deAfuera.responsable_externo, "Ing. Jácome");
  assert.equal(deAfuera.assignee_id, null);
  assert.equal(deAfuera.due_date, "2026-11-21");
  // Una tarea sigue en tarea; lo demás, en gestión.
  assert.equal(loQueSigue({ de: ELECTRICA, tarea: FILA, clase: "tarea", texto: "Dibujar el detalle" }).tipo, "Otro");
  assert.equal(loQueSigue({ de: ELECTRICA, tarea: FILA, clase: "reunion", texto: "Mandar la minuta" }).tipo, "Gestión");
});

test("«si se agenda reunión»: con día y hora, lo que sigue es una reunión", () => {
  const r = loQueSigue({ de: ELECTRICA, tarea: FILA, clase: "gestion", texto: "Reunión con el ingeniero eléctrico", due_date: "2026-11-20", hora: "10:00" });
  assert.equal(r.tipo, "Reunión");
  assert.equal(r.hora, "10:00");
  // Solo con día no: «coordinar la reunión» es una gestión.
  const sinHora = loQueSigue({ de: ELECTRICA, tarea: FILA, clase: "gestion", texto: "Coordinar la reunión", due_date: "2026-11-20" });
  assert.equal(sinHora.tipo, "Gestión");
  assert.equal(sinHora.hora, null);
});

test("lo que falta se dice: sin texto no nace nada, y la hora pide el día", () => {
  assert.deepEqual(loQueSigue({ de: ELECTRICA, tarea: FILA, texto: "   " }), { error: "Escribí qué sigue, o tocá «Nada más»." });
  assert.deepEqual(loQueSigue({ de: ELECTRICA, tarea: FILA, texto: "Reunión", hora: "10:00" }), { error: "Para ponerle hora, primero elegí el día." });
  // Un punto sin etapa ni responsable sigue sin etapa ni responsable.
  const suelto = loQueSigue({ de: { id: 9, texto: "Llamar", etapa_id: null }, texto: "Volver a llamar" });
  assert.equal(suelto.etapaId, null);
  assert.equal(suelto.assignee_id, null);
});

test("al marcar un punto se pregunta qué sigue; a un envío y a una compra no", () => {
  const lista = codigoDe("../src/modules/leads/ListaDeTareas.jsx");
  assert.match(lista, /const e = await marcarItem\(item, hecho, currentUser\?\.name, currentUser\);/);
  assert.match(lista, /if \(hecho && clase !== "envio" && clase !== "compra"\) \{ preguntarQueSigue\(item\);/);
  // La casilla de la fila y el botón de adentro marcan por el mismo lado.
  assert.match(lista, /onClick=\{\(\) => editable && onMarcar\?\.\(!item\.hecho\)\}/);
  assert.match(lista, /className="marcar-hecha" onClick=\{\(\) => onMarcar\?\.\(true\)\}/);
  assert.doesNotMatch(lista, /hacer\(\(\) => marcarItem\(/);
  // Nace con lo que dice la regla, y dice de dónde viene.
  assert.match(lista, /const r = loQueSigue\(\{ de: v\.de, tarea: t, clase: claseDe\(t\), texto: v\.texto, due_date: v\.due_date, hora: v\.hora \}\);/);
  assert.match(lista, /assignee_id: r\.assignee_id, responsable_externo: r\.responsable_externo, vieneDe: r\.vieneDe,/);
  // No es obligatorio.
  assert.match(lista, /<button onClick=\{\(\) => setSigue\(null\)\} style=\{boton\(false\)\}>Nada más<\/button>/);
  // Lo del cliente no se hereda solo: se pregunta, y solo si el anterior se le mostraba.
  assert.match(lista, /\{sigue\.loVeia && !sinCompartir && \(/);
  assert.match(lista, /alCliente: false, loVeia: compartidas\.has\(item\.id\)/);
});

test("un punto abierto se lee en partes con título, y se cierra: arriba, abajo y con la flecha de la fila", () => {
  const lista = codigoDe("../src/modules/leads/ListaDeTareas.jsx");
  for (const titulo of ["¿PARA CUÁNDO?", "LO QUE LEE EL CLIENTE", "¿YA ESTÁ?"]) assert.ok(lista.includes(`>${titulo}<`), `falta el título ${titulo}`);
  assert.match(lista, /titulo="¿QUÉ PASÓ\? · EL HISTORIAL DE ESTE PUNTO"/);
  assert.equal((lista.match(/className="cerrar-punto" onClick=\{onAbrir\}/g) || []).length, 2);
  assert.match(lista, /className="abrir-o-cerrar" onClick=\{onAbrir\} aria-expanded=\{abierta\}/);
  // Agendar una reunión es en el mismo punto, y ahí mismo se avisa.
  assert.match(lista, /className="avisar-reunion" onClick=\{\(\) => onAvisar\(tarea\)\}/);
  assert.match(lista, /Para agendar una reunión no se abre otra tarea: se le pone día y hora a este punto\./);
  // Corregir un punto es una ventana encima, no un cuadro al pie de toda la lista.
  assert.match(lista, /\{aTarea && \(\s+<div className="corregir-punto"\s+style=\{\{ position: "fixed", inset: 0,/);
});
