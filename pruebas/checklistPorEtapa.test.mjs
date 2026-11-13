// El checklist de un proyecto, leído por etapa: la etapa la dice cada punto.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { porEtapa, conTitulosDeEtapa } from "../src/modules/leads/tareasDelProyecto.js";
import { dichoAdentro } from "../src/modules/leads/historialDeTarea.js";

// Las etapas de Construcción, en su orden.
const ETAPAS = [
  { id: "con_contacto", nombre: "Contacto" }, { id: "con_levantamiento", nombre: "Levantamiento" },
  { id: "con_ingenierias", nombre: "Ingenierías" }, { id: "con_presupuesto", nombre: "Presupuesto" },
  { id: "con_propuesta", nombre: "Propuesta enviada" }, { id: "con_negociacion", nombre: "Negociación" },
];
const p = (texto, etapa_id) => ({ id: texto, texto, etapa_id });
const nombreDe = id => ({ reunion: "Reunión" }[id] || null);

test("RES BG: las revisiones son de Ingenierías y MADEVAL de Presupuesto; no se mezclan", () => {
  const g = porEtapa([
    p("MADEVAL", "con_presupuesto"), p("Revision de Electrica", "con_ingenierias"), p("FOGA", "con_presupuesto"),
    p("Revision de Sanitaria", "con_ingenierias"), p("Revision de Estructural", "con_ingenierias"),
  ], ETAPAS, { etapaDelProyecto: "con_ingenierias" });
  assert.deepEqual(g.map(x => [x.nombre, x.actual, x.items.map(i => i.texto)]), [
    ["Ingenierías", true, ["Revision de Electrica", "Revision de Sanitaria", "Revision de Estructural"]],
    ["Presupuesto", false, ["MADEVAL", "FOGA"]],
  ]);
  assert.equal(conTitulosDeEtapa(g, "con_ingenierias"), true);
});

test("van en el orden de las etapas del tipo, no en el que se cargaron", () => {
  const g = porEtapa([p("c", "con_negociacion"), p("a", "con_contacto"), p("b", "con_presupuesto")], ETAPAS);
  assert.deepEqual(g.map(x => x.nombre), ["Contacto", "Presupuesto", "Negociación"]);
});

test("adentro de cada etapa los puntos quedan como venían: el orden de la lista no se toca", () => {
  const g = porEtapa([p("3", "con_presupuesto"), p("1", "con_presupuesto"), p("2", "con_presupuesto")], ETAPAS);
  assert.deepEqual(g[0].items.map(i => i.texto), ["3", "1", "2"]);
});

test("lo de una etapa que ya no es de este tipo va después, con su nombre; lo que no tiene etapa, al final", () => {
  const g = porEtapa([p("suelta", null), p("gestionar reunion", "reunion"), p("x", "con_presupuesto"), p("rara", "borrada")], ETAPAS, { nombreDe });
  assert.deepEqual(g.map(x => [x.id, x.nombre]), [["con_presupuesto", "Presupuesto"], ["reunion", "Reunión"], ["borrada", "Otra etapa"], [null, "Sin etapa"]]);
});

test("con todo en la etapa en la que está el proyecto no hace falta título: arriba ya lo dice", () => {
  const g = porEtapa([p("a", "con_ingenierias"), p("b", "con_ingenierias")], ETAPAS, { etapaDelProyecto: "con_ingenierias" });
  assert.equal(g.length, 1);
  assert.equal(conTitulosDeEtapa(g, "con_ingenierias"), false);
});

test("todo en UNA etapa que no es la del proyecto sí lleva título: es justo lo que hay que saber", () => {
  const g = porEtapa([p("MADEVAL", "con_presupuesto")], ETAPAS, { etapaDelProyecto: "con_ingenierias" });
  assert.equal(conTitulosDeEtapa(g, "con_ingenierias"), true);
  assert.equal(g[0].actual, false);
});

test("un proyecto aprobado no está en ninguna etapa del pipeline: una sola etapa va sin título, varias con", () => {
  assert.equal(conTitulosDeEtapa(porEtapa([p("a", "con_contrato")], ETAPAS), null), false);
  assert.equal(conTitulosDeEtapa(porEtapa([p("a", "con_contrato"), p("b", null)], ETAPAS), null), true);
});

test("sin puntos no hay grupos", () => {
  assert.deepEqual(porEtapa([], ETAPAS), []);
  assert.deepEqual(porEtapa(undefined, ETAPAS), []);
  assert.equal(conTitulosDeEtapa([], "con_ingenierias"), false);
});

test("pasar un punto de etapa se lee en su historial", () => {
  assert.equal(dichoAdentro('"MADEVAL" pasa a la etapa Presupuesto (estaba en Ingenierías)'), "Pasa a la etapa Presupuesto (estaba en Ingenierías)");
  assert.equal(dichoAdentro('"MADEVAL" queda sin etapa (estaba en Presupuesto)'), "Queda sin etapa (estaba en Presupuesto)");
});

test("la etapa de lo que se agrega la elige quien lo agrega, y por defecto es la del proyecto", () => {
  const lista = readFileSync(new URL("../src/modules/leads/ListaDeTareas.jsx", import.meta.url), "utf8");
  assert.match(lista, /etapaId: n\.etapa !== undefined \? n\.etapa \|\| null : etapaId/);
  assert.match(lista, /etapaId: pegar\.etapa !== undefined \? pegar\.etapa \|\| null : etapaId/);
});
