import test from "node:test";
import assert from "node:assert/strict";
import { normalizarPlan, conLasFaltantes } from "../src/modules/cronograma/planDeObra.js";

const ags = [
  { id: 1, nombre: "Obra civil", monto: 50000 },
  { id: 2, nombre: "Eléctricas", monto: 30000 },
  { id: 3, nombre: "Pintura", monto: 20000 },
];

test("etapas con sus actividades adentro, que es como se piensa una obra", () => {
  const r = normalizarPlan({
    etapas: [
      { nombre: "Preliminares", actividades: [
        { nombre: "Desmontaje de lo existente", dias: 5, agrupacion: null, porque: "no es rubro" },
        { nombre: "Obra civil", dias: 13, agrupacion: 1 },
      ] },
      { nombre: "Instalaciones", actividades: [{ nombre: "Eléctricas", dias: 20, agrupacion: 2 }] },
    ],
  }, ags);
  assert.equal(r.etapas.length, 2);
  assert.equal(r.barras, 3);
  assert.equal(r.etapas[0].actividades[0].agrupacion, null);
  assert.equal(r.etapas[0].actividades[1].agrupacion, 1);
});

test("UN TRABAJO QUE NO ES RUBRO ENTRA IGUAL: es la mitad de una obra real", () => {
  const r = normalizarPlan({
    etapas: [{ nombre: "Preliminares", actividades: [
      { nombre: "Replanteo y trazado", dias: 2 },
      { nombre: "Pruebas y puesta en marcha", dias: 3, agrupacion: null },
    ] }],
  }, ags);
  assert.equal(r.barras, 2);
  assert.ok(r.etapas[0].actividades.every(a => a.agrupacion === null));
});

test("NINGUNA AGRUPACIÓN SE PIERDE: la que no nombró vuelve aparte", () => {
  const r = normalizarPlan({
    etapas: [{ nombre: "Obra", actividades: [{ nombre: "Obra civil", dias: 10, agrupacion: 1 }] }],
  }, ags);
  assert.deepEqual(r.faltantes.map(a => a.id), [2, 3]);
});

test("NINGUNA AGRUPACIÓN DOS VECES: el valorado la contaría dos veces", () => {
  const r = normalizarPlan({
    etapas: [{ nombre: "Obra", actividades: [
      { nombre: "Obra civil planta baja", dias: 10, agrupacion: 1 },
      { nombre: "Obra civil planta alta", dias: 8, agrupacion: 1 },
    ] }],
  }, ags);
  assert.equal(r.etapas[0].actividades[0].agrupacion, 1);
  assert.equal(r.etapas[0].actividades[1].agrupacion, null);
  assert.equal(r.barras, 2);
});

test("una agrupación inventada no existe: la actividad queda propia del cronograma", () => {
  const r = normalizarPlan({
    etapas: [{ nombre: "Obra", actividades: [{ nombre: "Algo", dias: 4, agrupacion: 99 }] }],
  }, ags);
  assert.equal(r.etapas[0].actividades[0].agrupacion, null);
});

test("sin nombre o sin días no entra, y una etapa vacía no se guarda", () => {
  const r = normalizarPlan({
    etapas: [
      { nombre: "Vacía", actividades: [{ nombre: "", dias: 5 }] },
      { nombre: "", actividades: [{ nombre: "X", dias: 5 }] },
      { nombre: "Buena", actividades: [{ nombre: "Y", dias: 0 }] },
    ],
  }, ags);
  assert.equal(r.etapas.length, 1);
  assert.equal(r.etapas[0].nombre, "Buena");
  // Sin días no se descarta: se le da uno. Perder la barra sería peor.
  assert.equal(r.etapas[0].actividades[0].dias, 1);
});

test("las que faltan van al final, juntas y con nombre de que hay que mirarlas", () => {
  const base = normalizarPlan({
    etapas: [{ nombre: "Obra", actividades: [{ nombre: "Obra civil", dias: 10, agrupacion: 1 }] }],
  }, ags);
  const r = conLasFaltantes(base, 50);
  assert.equal(r.etapas.length, 2);
  assert.match(r.etapas[1].nombre, /revisar/i);
  assert.deepEqual(r.etapas[1].actividades.map(a => a.agrupacion), [2, 3]);
  // A prorrata de lo que pesan: 30k y 20k de 50k sobre 50 días.
  assert.deepEqual(r.etapas[1].actividades.map(a => a.dias), [30, 20]);
  assert.match(r.etapas[1].actividades[0].porque, /revisarla/);
});

test("sin faltantes no se agrega ninguna etapa de relleno", () => {
  const base = normalizarPlan({
    etapas: [{ nombre: "Obra", actividades: [
      { nombre: "a", dias: 1, agrupacion: 1 }, { nombre: "b", dias: 1, agrupacion: 2 },
      { nombre: "c", dias: 1, agrupacion: 3 }] }],
  }, ags);
  assert.equal(conLasFaltantes(base, 50).etapas.length, 1);
});

test("una respuesta vacía no revienta y se nota que está vacía", () => {
  const r = normalizarPlan(null, ags);
  assert.deepEqual(r.etapas, []);
  assert.equal(r.barras, 0);
  assert.equal(r.faltantes.length, 3);
});

test("UN HITO NO DURA: pase lo que pase viene con un día", () => {
  const r = normalizarPlan({
    etapas: [{ nombre: "Preliminares", actividades: [
      { nombre: "Anticipo del 50%", hito: true },
      { nombre: "Llegada del contenedor", hito: true, dias: 40 },
      { nombre: "Obra civil", dias: 13, agrupacion: 1 },
    ] }],
  }, ags);
  const [h1, h2, t] = r.etapas[0].actividades;
  assert.equal(h1.hito, true);
  assert.equal(h1.dias, 1);
  assert.equal(h2.dias, 1, "ni aunque mande cuarenta");
  assert.equal(t.hito, false);
  assert.equal(t.dias, 13);
});
