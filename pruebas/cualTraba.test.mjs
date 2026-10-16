import test from "node:test";
import assert from "node:assert/strict";
import { cuandoDejanEmpezar, cualTraba, calendario } from "../src/modules/cronograma/cpm.js";

// "Es la que traba" sin fechas al lado hay que creerlo. Con las fechas se
// entiende, y se puede discutir — que es lo que uno hace con un cronograma.

const cal = calendario({ laborables: [1, 2, 3, 4, 5, 6] });
const porId = new Map([
  [1, { id: 1, nombre: "Paso de tubería", inicio: "2026-11-02", fin: "2026-11-06", duracion: 5 }],
  [2, { id: 2, nombre: "Ductería", inicio: "2026-10-28", fin: "2026-10-31", duracion: 4 }],
]);
const esta = { id: 9, nombre: "Estructurado de tumbados", duracion: 5, inicio: "2026-11-07" };
const deps = [
  { id: 101, actividad_id: 9, depende_de_id: 1, tipo: "FC", retardo: 0 },
  { id: 102, actividad_id: 9, depende_de_id: 2, tipo: "FC", retardo: 0 },
];

test("cada dependencia dice desde cuándo deja empezar", () => {
  const d = cuandoDejanEmpezar(esta, deps, porId, cal);
  assert.equal(d.get(101).desde, "2026-11-07", "termina el viernes 6, deja empezar el sábado 7");
  assert.equal(d.get(102).desde, "2026-11-02", "la ductería terminó antes");
  assert.equal(d.get(101).otra.nombre, "Paso de tubería");
});

test("la que traba es la de fecha más tardía, y es la misma cuenta", () => {
  assert.equal(cualTraba(esta, deps, porId, cal), 101);
});

test("una espera suma días a la fecha que deja", () => {
  const conEspera = [{ ...deps[0], retardo: 3 }, deps[1]];
  const d = cuandoDejanEmpezar(esta, conEspera, porId, cal);
  assert.equal(d.get(101).desde, "2026-11-11", "tres días hábiles de fragüe después del 7");
});

test("arrancar juntas mira el inicio de la otra, no su fin", () => {
  const juntas = [{ ...deps[0], tipo: "CC", retardo: 0 }];
  const d = cuandoDejanEmpezar(esta, juntas, porId, cal);
  assert.equal(d.get(101).desde, "2026-11-02");
});

// Decir que la traba una que ya terminó sería mentir: lo que manda es la fecha
// fija que alguien le puso.
test("si lo que manda es la fecha fija, no se señala ninguna dependencia", () => {
  // Señalar una que ya terminó manda a adelantar algo que no mueve nada.
  const conFija = { ...esta, inicio_fijo: "2026-11-20", inicio: "2026-11-20" };
  assert.equal(cualTraba(conFija, deps, porId, cal), null);
});

test("una fecha fija anterior no le saca el cartel a la que sí traba", () => {
  const conFija = { ...esta, inicio_fijo: "2026-11-02" };
  assert.equal(cualTraba(conFija, deps, porId, cal), 101);
});

test("sin fechas en la otra no se inventa una cuenta", () => {
  const sinFechas = new Map([[1, { id: 1, nombre: "Sin calcular" }]]);
  assert.equal(cuandoDejanEmpezar(esta, [deps[0]], sinFechas, cal).size, 0);
});
