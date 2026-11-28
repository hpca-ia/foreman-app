// El pipeline y sus tareas, como los definió Hernán el 17/11/2026: «el
// pipeline es el progreso del proyecto que genera actividades... con fecha y
// estado que se transforman en tareas; aparte, las tareas externas se pueden
// llenar sin que sean parte del pipeline. El pipeline de cada proyecto tiene
// etapas... no todas las actividades tienen la misma etapa».
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { avancePorEtapa } from "../src/modules/leads/tareasDelProyecto.js";
import { etapaAlCrear } from "../src/modules/leads/pipeline.js";
import { deAfuera, armarDirectorio } from "../src/modules/controlObra/directorioDelProyecto.js";

const leer = ruta => readFileSync(new URL(ruta, import.meta.url), "utf8");
const codigoDe = ruta => leer(ruta).split("\n").filter(l => !l.trim().startsWith("//")).join("\n");

// Las etapas de un lead de Construcción, y RES BG como estaba ese día: parado
// en Ingenierías, con puntos de Ingenierías y de Presupuesto.
const ETAPAS = [
  { id: "con_contacto", nombre: "Contacto" }, { id: "con_levantamiento", nombre: "Levantamiento" },
  { id: "con_ingenierias", nombre: "Ingenierías" }, { id: "con_presupuesto", nombre: "Presupuesto" },
  { id: "con_propuesta", nombre: "Propuesta enviada" }, { id: "con_negociacion", nombre: "Negociación" },
];
const t = (id, etapa_id, status = "en-progreso", extra = {}) => ({ id, etapa_id, status, ...extra });
const TAREAS = [
  t(1, "con_contacto", "listo"), t(2, "con_contacto", "listo"),
  t(3, "con_ingenierias", "listo"), t(4, "con_ingenierias"), t(5, "con_ingenierias"),
  t(6, "con_presupuesto"),
  t(7, null), t(8, "con_documentacion", "listo"),
  // No cuentan: una compra tiene su módulo, y lo que «ya no va» ni se hizo ni falta.
  t(9, "con_ingenierias", "en-progreso", { compra_id: 3 }), t(10, "con_ingenierias", "listo", { type: "Compra" }),
  t(11, "con_presupuesto", "listo", { descartada: true }),
];

test("LO QUE DEFINIÓ: el progreso del proyecto se lee etapa por etapa, con cuánto va cada una", () => {
  const camino = avancePorEtapa(TAREAS, ETAPAS, { etapaDelProyecto: "con_ingenierias", nombreDe: id => (id === "con_documentacion" ? "Documentación" : null) });
  assert.deepEqual(camino.map(e => [e.nombre, e.hechas, e.total, e.estado, e.actual]), [
    ["Contacto", 2, 2, "lista", false],
    ["Levantamiento", 0, 0, "vacia", false],
    ["Ingenierías", 1, 3, "en_curso", true],
    ["Presupuesto", 0, 1, "en_curso", false],
    ["Propuesta enviada", 0, 0, "vacia", false],
    ["Negociación", 0, 0, "vacia", false],
    // Una etapa de antes, que ya no es de este tipo: no se pierde.
    ["Documentación", 1, 1, "lista", false],
    // Y lo que no es de ninguna etapa del pipeline.
    ["Sin etapa", 0, 1, "en_curso", false],
  ]);
});

test("en un proyecto aprobado no se dibujan las etapas vacías de perseguirlo: solo las que tienen algo", () => {
  const camino = avancePorEtapa(TAREAS, ETAPAS, { elCamino: false, nombreDe: () => "Documentación" });
  assert.deepEqual(camino.map(e => e.nombre), ["Contacto", "Ingenierías", "Presupuesto", "Documentación", "Sin etapa"]);
  // La etapa en la que está parado se ve aunque todavía no tenga puntos.
  assert.deepEqual(avancePorEtapa([], ETAPAS, { elCamino: false, etapaDelProyecto: "con_propuesta" }).map(e => [e.nombre, e.actual]),
    [["Propuesta enviada", true]]);
  assert.deepEqual(avancePorEtapa(), []);
  assert.deepEqual(avancePorEtapa([t(1, null)], []).map(e => e.nombre), ["Sin etapa"]);
});

test("la tarea que se le carga a un proyecto desde Tareas nace en la etapa en la que está el proyecto", () => {
  assert.equal(etapaAlCrear({ id: 13, etapa: "con_ingenierias", resultado: null }), "con_ingenierias");
  // RES BG: marcado a mano como proyecto, pero se persigue todavía.
  assert.equal(etapaAlCrear({ id: 13, etapa: "con_ingenierias", resultado: null, es_lead: false }), "con_ingenierias");
  // Un aprobado ya salió del pipeline, y un perdido también: sin etapa.
  assert.equal(etapaAlCrear({ id: 15, etapa: "con_documentacion", resultado: "ganado" }), null);
  assert.equal(etapaAlCrear({ id: 9, etapa: "con_contacto", resultado: "perdido" }), null);
  assert.equal(etapaAlCrear({ id: 9, etapa: null }), null);
  assert.equal(etapaAlCrear(undefined), null);
  // Y lo hacen las dos puertas de Tareas: la ventana y el renglón rápido.
  const app = codigoDe("../src/App.jsx");
  assert.match(app, /const etapaDeLaNueva = leadId => \(\{ etapa_id: leadId \? etapaAlCrear\(proyectosPipeline\.find\(l => l\.id === leadId\)\) : null \}\);/);
  assert.match(app, /\.insert\(\{ \.\.\.r\.fila, \.\.\.etapaDeLaNueva\(r\.fila\.lead_id\) \}\)/);
  assert.match(app, /guardar\(\{ \.\.\.form, \.\.\.etapaDeLaNueva\(form\.lead_id\), /);
  // Si la tarea pasa a otro proyecto, toma la etapa del nuevo.
  assert.match(app, /guardar\(\{ \.\.\.form, \.\.\.\(deOtro \? etapaDeLaNueva\(form\.lead_id\) : \{\}\) \}\)/);
});

test("la gente de afuera del checklist son los involucrados del proyecto, sin los del equipo", () => {
  const gente = armarDirectorio({
    convocados: [
      { id: 1, nombre: "Lizeth De la Cruz", empresa: "HCARQ", cargo: "Residente de obra", email: "ld@oficina.test" },
      { id: 2, nombre: "Sebastián Palomeque", empresa: "DINERS", cargo: "Coordinación", email: "seba@cliente.test" },
    ],
    delLibro: [{ nombre: null, email: "nueva@cliente.test" }],
    asistentes: [{ nombre: "Ana Fiscal", empresa: "", cargo: "Fiscalización", email: "ana@fisca.test" }],
  });
  const equipo = [{ id: 4, name: "Lizeth", email: " LD@oficina.test " }, { id: 1, name: "Hernan Cueva", email: null }];
  assert.deepEqual(deAfuera(gente, equipo), [
    { id: "ana@fisca.test", email: "ana@fisca.test", nombre: "Ana Fiscal", rol: "Fiscalización" },
    // La que todavía no tiene nombre se elige por su correo.
    { id: "nueva@cliente.test", email: "nueva@cliente.test", nombre: "nueva@cliente.test", rol: "" },
    { id: "seba@cliente.test", email: "seba@cliente.test", nombre: "Sebastián Palomeque", rol: "DINERS · Coordinación" },
  ]);
  assert.deepEqual(deAfuera(), []);
  // El checklist ya no lee la lista aparte que nadie cargaba, y manda por correo.
  const lista = codigoDe("../src/modules/leads/ListaDeTareas.jsx");
  assert.doesNotMatch(lista, /pipeline_invitados/);
  assert.match(lista, /gentePara\(lead\.id\)\.then\(g => deAfuera\(g, users\)\)/);
  assert.match(lista, /enviarChecklist\(\{ lead, otros: \[\.\.\.envio\.a, \.\.\.otros\], /);
  assert.match(lista, /correos: \[\.\.\.avisar\.a\]\.filter\(x => x !== "responsable"\)/);
  // El aviso de la reunión acepta esos correos, y sigue pidiendo sesión.
  const reunion = codigoDe("../api/_aviso-reunion.js");
  assert.match(reunion, /const \{ tareaId, alResponsable = true, invitados = \[\], correos = \[\] \} = req\.body \|\| \{\};/);
  assert.ok(reunion.indexOf("sesionValida(req)") < reunion.indexOf("correos = []"), "primero la sesión");
});

test("el checklist dibuja el avance por etapa y deja agregar un punto parado en una", () => {
  const lista = codigoDe("../src/modules/leads/ListaDeTareas.jsx");
  assert.match(lista, /avancePorEtapa\(Object\.values\(tareas\), etapas, \{/);
  assert.match(lista, /elCamino: sePersigue\(lead\)/);
  assert.match(lista, /className="etapa-del-camino"/);
  assert.match(lista, /setNuevo\(\{ \.\.\.EN_BLANCO, etapa: e\.id \}\)/);
});

test("un punto se pasa de etapa soltándolo sobre ella, y de estado soltándolo en otra columna; con el dedo, manteniéndolo apretado", () => {
  // Hernán, 27/11/2026, eligió el tablero: el arrastre del navegador no andaba
  // con el dedo en el iPad. Ahora es el de lib/arrastrarConElDedo.js.
  const lista = codigoDe("../src/modules/leads/ListaDeTareas.jsx");
  assert.match(lista, /useArrastre\(\{ alSoltar: \(item, lugar\) => soltarActividad\(item, lugar\) \}\)/);
  // Cada tarjeta se agarra entera; la fila de adentro ya no usa el arrastre viejo.
  assert.match(lista, /const props = editable \? agarrar\(item\) : \{\};/);
  assert.match(lista, /onAgarrar=\{null\} enTarjeta=\{enColumna\}/);
  // Adónde se suelta: las tres columnas y las etapas del tipo del proyecto, y solo quien puede editar.
  assert.match(lista, /data-soltar=\{editable \? lugar : undefined\}/);
  assert.match(lista, /const sePuede = editable && !!e\.id && etapas\.some\(x => x\.id === e\.id\);/);
  assert.match(lista, /data-soltar=\{sePuede \? lugar : undefined\}/);
  // Lo que pasa al soltar sale de tablero.js, con las funciones de siempre, y se puede deshacer.
  assert.match(lista, /const pasos = alSoltarActividad\(item, lugar\);/);
  assert.match(lista, /await moverDeEtapa\(item, p\.etapa, /);
  assert.match(lista, /await marcarItem\(item, p\.marcar, /);
  assert.match(lista, /await marcarEspera\(item, p\.espera, currentUser\)/);
  assert.match(lista, /soltarActividad\(despuesDeSoltar\(item, pasos\), volver, \{ deshaciendo: true \}\)/);
});
