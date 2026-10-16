import test from "node:test";
import assert from "node:assert/strict";
import { numerosDeBarras, numerarBandas, barraPorNumero } from "../src/modules/cronograma/numeros.js";
import { porFases } from "../src/modules/cronograma/agruparPorFase.js";

// El número de cada barra se ve en la pantalla y es como la persona la nombra:
// "la 2.1 va del 12 al 15". Si el programa no lo conoce, no hay conversación.

const fases = [
  { id: 15, nombre: "Preliminares", orden: 0 },
  { id: 16, nombre: "Demoliciones", orden: 1 },
  { id: 17, nombre: "Obra gris", orden: 2 },
];
const act = [
  { id: 534, nombre: "Cerramiento provisional", orden: 1, fase_id: 15, inicio: "2026-10-07" },
  { id: 567, nombre: "Lona de expectativa", orden: 3, fase_id: 15, inicio: "2026-10-08" },
  { id: 537, nombre: "Derrocamiento de pisos", orden: 2, fase_id: 16, inicio: "2026-10-15" },
  { id: 569, nombre: "Desarmado de mobiliario", orden: 4, fase_id: 16, inicio: "2026-10-15" },
  { id: 538, nombre: "Masillado", orden: 5, fase_id: 17, inicio: "2026-10-19" },
];

test("se numera por etapa y por lugar dentro de la etapa", () => {
  const n = numerosDeBarras(act, fases);
  assert.equal(n.get(534), "1.1");
  assert.equal(n.get(567), "1.2");
  assert.equal(n.get(537), "2.1");
  assert.equal(n.get(569), "2.2");
  assert.equal(n.get(538), "3.1");
});

// Un rubro partido en anticipo, fabricación e instalación es UNA cosa en la
// tabla: sus partes van seguidas y en el orden en que arrancan.
test("las partes de una misma agrupación van juntas y en orden de arranque", () => {
  const partida = [
    { id: 1, nombre: "Ventanería · instalación", orden: 9, fase_id: 16, inicio: "2026-11-20", obra_actividad_id: 77 },
    { id: 2, nombre: "Ventanería · anticipo", orden: 2, fase_id: 16, inicio: "2026-09-01", obra_actividad_id: 77 },
    { id: 3, nombre: "Otra barra", orden: 5, fase_id: 16, inicio: "2026-10-01" },
  ];
  const n = numerosDeBarras(partida, fases);
  assert.equal(n.get(2), "2.1", "el anticipo arranca antes");
  assert.equal(n.get(1), "2.2");
  assert.equal(n.get(3), "2.3");
});

test("sin etapas el número es uno solo, sin punto", () => {
  const n = numerosDeBarras([{ id: 7, orden: 1 }, { id: 8, orden: 2 }], []);
  assert.equal(n.get(7), "1");
  assert.equal(n.get(8), "2");
});

// Lo que no tiene etapa va al final y a la vista, no mezclado con la última.
test("lo que no tiene etapa se numera aparte", () => {
  const n = numerosDeBarras([...act, { id: 900, nombre: "Permiso municipal", orden: 99 }], fases);
  assert.equal(n.get(900), "—.1");
});

test("una etapa vacía igual ocupa su número", () => {
  // Si la 2 está vacía, la 3 no puede pasar a llamarse 2: la persona las ve
  // numeradas en la pantalla y las nombra por ahí.
  const n = numerosDeBarras(act.filter(a => a.fase_id !== 16), fases);
  assert.equal(n.get(538), "3.1");
});

test("la tabla y el dictado numeran igual", () => {
  const grupos = [
    { id: "a", posicion: 1, hijas: [{ id: 534, fase_id: 15 }, { id: 567, fase_id: 15 }] },
    { id: "b", posicion: 2, hijas: [{ id: 537, fase_id: 16 }] },
  ];
  const deLaTabla = numerarBandas(porFases(grupos, fases.slice(0, 2)), 2);
  assert.equal(deLaTabla.get(534), "1.1");
  assert.equal(deLaTabla.get(567), "1.2");
  assert.equal(deLaTabla.get(537), "2.1");
});

test("de «2,1» escrito a mano se llega a la barra, y de lo que no se entiende no", () => {
  const cual = barraPorNumero(numerosDeBarras(act, fases));
  assert.equal(cual("2.1"), 537);
  assert.equal(cual(" 2,1 "), 537);
  assert.equal(cual("9.9"), null);
  assert.equal(cual(""), null);
});
