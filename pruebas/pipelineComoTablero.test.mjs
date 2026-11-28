// El pipeline como tablero. Hernán, 27/11/2026: «el pipeline sigue igual...
// debe ser más interactivo, más visual»; de cuatro maquetas eligió «la 1»:
// tarjetas por etapa que se arrastran, y adentro las etapas como camino y las
// actividades en En curso · En espera · Hechas. Y sobre esa maqueta: «Banderas
// tiene actividades en presupuesto, otras en ingenierías... el tablero lo
// ubica solo en presupuesto sin eso ser real».
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  estadoDeTarjeta, cuentasDelTablero, pasaElFiltro, tambienEnCurso, columnasDelTipo, columnaDelLead, alSoltarLead,
  columnaDeActividad, alSoltarActividad, loQuePaso, despuesDeSoltar, lugarDeAntes,
} from "../src/modules/leads/tablero.js";
import { antesDeAgarrar, lugarBajo } from "../src/lib/arrastrarConElDedo.js";

const codigoDe = ruta => readFileSync(new URL(ruta, import.meta.url), "utf8").split("\n").filter(l => !l.trim().startsWith("//")).join("\n");

const CATALOGO = [
  ["con_contacto", "Contacto"], ["con_levantamiento", "Levantamiento"], ["con_ingenierias", "Ingenierías"],
  ["con_presupuesto", "Presupuesto"], ["con_propuesta", "Propuesta enviada"], ["con_negociacion", "Negociación"],
].map(([id, nombre], k) => ({ id, nombre, orden: k + 1, tunel: "construccion", activa: true }))
  .concat([["dis_contacto", "Contacto"], ["dis_anteproyecto", "Anteproyecto"]].map(([id, nombre], k) => ({ id, nombre, orden: k + 1, tunel: "diseno", activa: true })));
const HOY = "2026-11-27";
const RES_BG = { id: 13, nombre: "RES BG", tunel: "construccion", etapa: "con_presupuesto" };
// Sus actividades del 27/11, como quedan con la 198: 3 abiertas en Ingenierías y 8 en Presupuesto.
const t = (id, etapa_id, extra = {}) => ({ id, lead_id: 13, title: `t${id}`, status: "en-progreso", etapa_id, ...extra });
const TAREAS_BG = [
  t(135, "con_ingenierias"), t(136, "con_ingenierias"), t(137, "con_ingenierias"),
  ...[68, 69, 70, 86, 102].map(id => t(id, "con_ingenierias", { status: "listo" })),
  t(204, "con_presupuesto", { due_date: "2026-11-30" }), ...[195, 197, 198, 199, 203, 213].map(id => t(id, "con_presupuesto")),
  t(196, "con_presupuesto", { espera: true }),
  // Una compra del proyecto no es una actividad del pipeline.
  t(900, "con_ingenierias", { type: "Compra", compra_id: 4 }),
];

test("RES BG: la tarjeta va en Presupuesto y dice que también está en curso en Ingenierías, con 3", () => {
  const cols = columnasDelTipo("construccion", [RES_BG], CATALOGO);
  assert.deepEqual(cols.map(c => c.nombre), ["Contacto", "Levantamiento", "Ingenierías", "Presupuesto", "Propuesta enviada", "Negociación"]);
  assert.equal(columnaDelLead(RES_BG, cols), "con_presupuesto");
  assert.deepEqual(tambienEnCurso(RES_BG, TAREAS_BG, CATALOGO), [{ id: "con_ingenierias", nombre: "Ingenierías", abiertas: 3 }]);
  // Lo hecho, lo de compras y lo de su misma etapa no cuenta.
  assert.deepEqual(tambienEnCurso(RES_BG, TAREAS_BG.filter(x => x.etapa_id === "con_presupuesto"), CATALOGO), []);
});

test("un proyecto en una etapa que no es de su tipo no se pierde: va en «Sin etapa», adelante", () => {
  const raro = { id: 9, nombre: "X", tunel: "construccion", etapa: "dis_anteproyecto" };
  const cols = columnasDelTipo("construccion", [RES_BG, raro], CATALOGO);
  assert.equal(cols[0].nombre, "Sin etapa");
  assert.equal(columnaDelLead(raro, cols), null);
});

test("los cuatro estados de la tarjeta, y los contadores de arriba, con sus proyectos del 27/11", () => {
  assert.equal(estadoDeTarjeta({ clase: "insistir" }), "revisar");
  assert.equal(estadoDeTarjeta({ clase: "esperando" }), "espera");
  assert.equal(estadoDeTarjeta({ clase: "vencido" }), "atrasado");
  assert.equal(estadoDeTarjeta({ clase: "al_dia" }), "curso");
  assert.equal(estadoDeTarjeta({ clase: "sin_paso" }), "curso");
  const leads = [
    RES_BG,
    { id: 22, nombre: "Concurso PRONACA", tunel: "diseno", etapa: "dis_anteproyecto", espera_desde: "2026-11-11", recordar_el: "2026-11-18" },
    { id: 18, nombre: "CHRONIX", tunel: "diseno", etapa: "dis_anteproyecto", espera_desde: "2026-11-18", recordar_el: "2026-12-01" },
    { id: 26, nombre: "Lote 7 Cedrela", tunel: "diseno", etapa: "dis_contacto" },
  ];
  const tareas = { 13: TAREAS_BG, 26: [{ id: 1, lead_id: 26, title: "Propuesta de Honorarios", status: "en-progreso", due_date: "2026-11-24" }] };
  const n = cuentasDelTablero(leads, id => tareas[id] || [], HOY);
  // «En espera» cuenta también los que toca revisar: son dos cosas que se miran por separado.
  assert.deepEqual(n, { curso: 1, espera: 2, revisar: 1, atrasado: 1 });
  assert.equal(pasaElFiltro("revisar", "espera"), true);
  assert.equal(pasaElFiltro("espera", "revisar"), false);
  assert.equal(pasaElFiltro("curso", null), true);
});

test("soltar una tarjeta: en otra etapa de su tipo la cambia; en Aprobado o Perdido pide confirmar; en otro tipo, no", () => {
  const r = alSoltarLead(RES_BG, "etapa:construccion:con_propuesta", CATALOGO);
  assert.deepEqual(r.cambio.campos, { etapa: "con_propuesta" });
  assert.equal(r.cambio.detalle, "Presupuesto → Propuesta enviada");
  assert.equal(alSoltarLead(RES_BG, "etapa:construccion:con_presupuesto", CATALOGO), null, "en la misma no pasa nada");
  assert.deepEqual(alSoltarLead(RES_BG, "cierre:ganado"), { cerrar: "ganado" });
  assert.deepEqual(alSoltarLead(RES_BG, "cierre:perdido"), { cerrar: "perdido" });
  assert.match(alSoltarLead(RES_BG, "etapa:diseno:dis_anteproyecto", CATALOGO).error, /otro tipo/);
  assert.equal(alSoltarLead(RES_BG, null), null);
});

test("las actividades, en tres columnas: en curso, en espera y hechas", () => {
  assert.equal(columnaDeActividad({ hecho: false, espera: false }), "curso");
  assert.equal(columnaDeActividad({ hecho: false, espera: true }), "espera");
  assert.equal(columnaDeActividad({ hecho: true, espera: true }), "hechas");
});

test("soltar una actividad: cada columna hace lo que dice, y sobre una etapa la pasa ahí, para adelante o para atrás", () => {
  const foga = { id: 196, texto: "FOGA", hecho: false, espera: false, etapa_id: "con_presupuesto" };
  assert.deepEqual(alSoltarActividad(foga, "col:espera"), [{ espera: true }]);
  assert.deepEqual(alSoltarActividad(foga, "col:hechas"), [{ marcar: true }]);
  assert.deepEqual(alSoltarActividad(foga, "col:curso"), [], "ya está en curso");
  assert.deepEqual(alSoltarActividad({ ...foga, espera: true }, "col:curso"), [{ espera: false }]);
  // Terminar o volver a abrir ya le saca la espera (alMarcar): no hace falta otro paso.
  assert.deepEqual(alSoltarActividad({ ...foga, espera: true }, "col:hechas"), [{ marcar: true }]);
  assert.deepEqual(alSoltarActividad({ ...foga, hecho: true }, "col:curso"), [{ marcar: false }]);
  assert.deepEqual(alSoltarActividad({ ...foga, hecho: true }, "col:espera"), [{ marcar: false }, { espera: true }]);
  // Para atrás: de Presupuesto a Ingenierías.
  assert.deepEqual(alSoltarActividad(foga, "etapa:con_ingenierias"), [{ etapa: "con_ingenierias" }]);
  assert.deepEqual(alSoltarActividad(foga, "etapa:con_presupuesto"), []);
  assert.deepEqual(alSoltarActividad(foga, "cualquier:cosa"), []);
  assert.equal(loQuePaso(foga, "col:espera"), "«FOGA» queda en espera.");
  assert.equal(loQuePaso(foga, "col:hechas"), "«FOGA» terminada.");
  assert.equal(loQuePaso(foga, "etapa:con_ingenierias", () => "Ingenierías"), "«FOGA» pasó a Ingenierías.");
});

test("deshacer: se sabe cómo quedó y adónde soltarla para que vuelva", () => {
  const foga = { id: 196, texto: "FOGA", hecho: false, espera: true, etapa_id: "con_presupuesto" };
  const pasos = alSoltarActividad(foga, "col:hechas");
  const despues = despuesDeSoltar(foga, pasos);
  assert.deepEqual([despues.hecho, despues.espera], [true, false]);
  assert.equal(lugarDeAntes(foga, "col:hechas"), "col:espera");
  // Y soltarla ahí la deja como estaba: reabierta y en espera.
  assert.deepEqual(alSoltarActividad(despues, "col:espera"), [{ marcar: false }, { espera: true }]);
  assert.equal(lugarDeAntes(foga, "etapa:con_ingenierias"), "etapa:con_presupuesto");
  assert.equal(lugarDeAntes({ ...foga, etapa_id: null }, "etapa:con_ingenierias"), null, "sin etapa antes, no hay adónde volver");
});

test("con el dedo se mantiene apretado: moverlo antes es deslizar la pantalla; con el mouse, se agarra al moverlo", () => {
  assert.equal(antesDeAgarrar({ tactil: true, dx: 3, dy: 4 }), "esperar");
  assert.equal(antesDeAgarrar({ tactil: true, dx: 0, dy: 12 }), "deslizar");
  assert.equal(antesDeAgarrar({ tactil: false, dx: 2, dy: 2 }), "esperar");
  assert.equal(antesDeAgarrar({ tactil: false, dx: 6, dy: 0 }), "agarrar");
  // Dónde se soltaría: el `data-soltar` más cercano bajo el dedo.
  const columna = { getAttribute: k => (k === "data-soltar" ? "col:hechas" : null) };
  const doc = { elementFromPoint: () => ({ closest: sel => (sel === "[data-soltar]" ? columna : null) }) };
  assert.equal(lugarBajo(10, 10, doc), "col:hechas");
  assert.equal(lugarBajo(10, 10, { elementFromPoint: () => null }), null);
  assert.equal(lugarBajo(10, 10, null), null);
});

test("la pantalla: el pipeline es el tablero, y la ficha es ancha", () => {
  const modulo = codigoDe("../src/modules/leads/ModuloLeads.jsx");
  assert.match(modulo, /<TableroDelPipeline leads=\{perseguidos\} tareasDe=\{tareasDe\}/);
  assert.match(modulo, /etapa_id";/, "trae la etapa de cada tarea");
  const tablero = codigoDe("../src/modules/leads/TableroDelPipeline.jsx");
  assert.match(tablero, /const r = alSoltarLead\(lead, destino, catalogo\);/);
  assert.match(tablero, /className="tambien-en-curso"/);
  assert.match(tablero, /data-soltar=\{lugar\}/);
  // Aprobado y perdido se confirman, sin el cuadro del navegador.
  assert.match(tablero, /className="cerrar-el-lead"/);
  assert.doesNotMatch(tablero, /window\.confirm/);
  const ficha = codigoDe("../src/modules/leads/ModalLead.jsx");
  assert.match(ficha, /maxWidth=\{editando \? 1040 : 560\}/);
  assert.match(ficha, /onMoverProyecto=\{async etapa => \{/);
  const lista = codigoDe("../src/modules/leads/ListaDeTareas.jsx");
  assert.match(lista, /className="esta-aca"/);
  assert.match(lista, /className="en-curso-aca"/);
  assert.match(lista, /className="mover-el-proyecto-aca"/);
});
