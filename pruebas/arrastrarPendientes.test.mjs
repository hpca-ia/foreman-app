import test from "node:test";
import assert from "node:assert/strict";
import { loQueQuedo, yaEsta, propuestaDeArrastre, comoSeDice } from "../src/modules/libro/arrastrarPendientes.js";

const ANTERIOR = [
  { id: 1, tipo: "tarea", texto: "Fundir losa del eje 4", hecha: true },
  { id: 2, tipo: "tarea", texto: "Instalar tablero trifásico", hecha: false, motivo: "no llegó el tablero", cronograma_actividad_id: 77 },
  { id: 3, tipo: "tarea", texto: "Pintar fachada norte", hecha: false, nota: "pintura la trae Pintulac a las 8" },
  { id: 4, tipo: "material", texto: "20 sacos de cemento", hecha: false },
  { id: 5, tipo: "externo", texto: "El cliente define el color", hecha: false },
  { id: 6, texto: "Limpieza general", hecha: false },   // sin tipo: es tarea
];
const FECHAS = ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"];

test("lo que quedó: tareas sin hacer; ni materiales ni compromisos de afuera", () => {
  const q = loQueQuedo(ANTERIOR);
  assert.deepEqual(q.map(i => i.id), [2, 3, 6]);
});

test("se trae al primer día, con el motivo como nota y la nota vieja detrás", () => {
  const { traer, yaEstaban } = propuestaDeArrastre({ quedaron: loQueQuedo(ANTERIOR), items: [], fechas: FECHAS });
  assert.equal(traer.length, 3);
  assert.equal(yaEstaban.length, 0);
  assert.ok(traer.every(t => t.fecha === "2026-11-09"));
  const tablero = traer.find(t => /tablero/i.test(t.texto));
  assert.equal(tablero.nota, "La semana pasada no se hizo: no llegó el tablero.");
  assert.equal(tablero.cronograma_actividad_id, 77);
  const pintura = traer.find(t => /fachada/i.test(t.texto));
  assert.equal(pintura.nota, "La semana pasada quedó sin hacer. pintura la trae Pintulac a las 8");
});

test("lo que ya está en la semana nueva no se repite: por actividad o por texto", () => {
  const nueva = [
    { tipo: "tarea", texto: "Tablero trifásico (traído del cronograma)", cronograma_actividad_id: 77 },
    { tipo: "tarea", texto: "PINTAR FACHADA NORTE" },
    { tipo: "material", texto: "Limpieza general" },   // un material con el mismo texto no cuenta
  ];
  const { traer, yaEstaban } = propuestaDeArrastre({ quedaron: loQueQuedo(ANTERIOR), items: nueva, fechas: FECHAS });
  assert.deepEqual(yaEstaban.map(i => i.id), [2, 3]);
  assert.deepEqual(traer.map(t => t.texto), ["Limpieza general"]);
  assert.equal(yaEsta({ texto: "limpieza general" }, nueva), false);
});

test("se dice antes de hacerse", () => {
  const p = propuestaDeArrastre({ quedaron: loQueQuedo(ANTERIOR), items: [{ tipo: "tarea", texto: "Limpieza general" }], fechas: FECHAS });
  assert.equal(comoSeDice(p), "2 tareas que quedaron sin hacer la semana pasada · 1 ya está en esta semana");
  assert.equal(comoSeDice({ traer: [], yaEstaban: [] }), "La semana pasada no dejó nada sin hacer.");
});

test("sin días en la semana nueva no hay dónde ponerlas: fecha null, y el que llama decide", () => {
  const { traer } = propuestaDeArrastre({ quedaron: loQueQuedo(ANTERIOR), items: [], fechas: [] });
  assert.ok(traer.every(t => t.fecha === null));
});
