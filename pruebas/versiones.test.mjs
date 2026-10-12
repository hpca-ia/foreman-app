import test from "node:test";
import assert from "node:assert/strict";
import { fotoDe, comparar } from "../src/modules/cronograma/compararVersion.js";

const foto = fotoDe([
  { id: 1, nombre: "PRELIMINARES", duracion: 10, inicio: "2026-03-02", fin: "2026-03-13", critica: true },
  { id: 2, nombre: "ESTRUCTURA", duracion: 20, inicio: "2026-03-16", fin: "2026-04-08", critica: true },
  { id: 3, nombre: "PINTURA", duracion: 5, inicio: "2026-04-09", fin: "2026-04-14", critica: false },
], []);

test("una barra que no se movió no aparece como movida", () => {
  const r = comparar(foto, [
    { id: 1, nombre: "PRELIMINARES", duracion: 10, inicio: "2026-03-02", fin: "2026-03-13" },
  ], []);
  assert.equal(r.movidas.length, 0);
});

test("dice cuántos días se corrió cada barra, con signo", () => {
  const r = comparar(foto, [
    { id: 2, nombre: "ESTRUCTURA", duracion: 20, inicio: "2026-03-23", fin: "2026-04-15" },
  ], []);
  assert.equal(r.lineas[0].corrimientoFin, 7, "una semana más tarde");
  assert.equal(r.lineas[0].corrimientoInicio, 7);
});

test("adelantarse es negativo, no es lo mismo que atrasarse", () => {
  const r = comparar(foto, [
    { id: 3, nombre: "PINTURA", duracion: 5, inicio: "2026-04-04", fin: "2026-04-09" },
  ], []);
  assert.equal(r.lineas[0].corrimientoFin, -5);
});

test("CUÁNTO SE CORRIÓ LA OBRA: la última fecha contra la última", () => {
  // Es el número que se dice en una reunión.
  const r = comparar(foto, [
    { id: 1, nombre: "PRELIMINARES", duracion: 10, inicio: "2026-03-02", fin: "2026-03-13" },
    { id: 2, nombre: "ESTRUCTURA", duracion: 20, inicio: "2026-03-16", fin: "2026-04-08" },
    { id: 3, nombre: "PINTURA", duracion: 5, inicio: "2026-04-24", fin: "2026-04-29" },
  ], []);
  assert.equal(r.corrimientoObra, 15);
});

test("solo las CRÍTICAS que se atrasaron explican el atraso de la obra", () => {
  // Las demás se movieron dentro de su colchón y no mueven la fecha de fin.
  const r = comparar(foto, [
    { id: 2, nombre: "ESTRUCTURA", duracion: 20, inicio: "2026-03-23", fin: "2026-04-15", critica: true },
    { id: 3, nombre: "PINTURA", duracion: 5, inicio: "2026-04-20", fin: "2026-04-25", critica: false },
  ], []);
  assert.equal(r.movidas.length, 2);
  assert.equal(r.criticasMovidas.length, 1);
  assert.equal(r.criticasMovidas[0].nombre, "ESTRUCTURA");
});

test("una barra nueva se dice nueva, no un corrimiento infinito", () => {
  const r = comparar(foto, [{ id: 9, nombre: "DESMONTAJE", duracion: 4, inicio: "2026-03-02", fin: "2026-03-05" }], []);
  assert.equal(r.nuevas.length, 1);
  assert.equal(r.lineas[0].corrimientoFin, null);
});

test("una barra que ya no está se cuenta aparte", () => {
  const r = comparar(foto, [{ id: 1, nombre: "PRELIMINARES", duracion: 10, inicio: "2026-03-02", fin: "2026-03-13" }], []);
  assert.equal(r.borradas.length, 2);
});

test("SE EMPAREJA POR NOMBRE si el id cambió", () => {
  // Alguien borró la barra y la volvió a crear. Sin esta red aparecería como
  // una desaparecida y una nueva, escondiendo el corrimiento que se quería ver.
  const r = comparar(foto, [
    { id: 77, nombre: "ESTRUCTURA", duracion: 20, inicio: "2026-03-23", fin: "2026-04-15" },
  ], []);
  assert.equal(r.nuevas.length, 0);
  assert.equal(r.lineas[0].corrimientoFin, 7);
});

test("dice si la barra se alargó o se acortó", () => {
  const r = comparar(foto, [
    { id: 2, nombre: "ESTRUCTURA", duracion: 28, inicio: "2026-03-16", fin: "2026-04-17" },
  ], []);
  assert.equal(r.lineas[0].cambioDuracion, 8);
});

test("las peores van primero: por ahí se empieza a mirar", () => {
  const r = comparar(foto, [
    { id: 1, nombre: "PRELIMINARES", duracion: 10, inicio: "2026-03-04", fin: "2026-03-15" },
    { id: 2, nombre: "ESTRUCTURA", duracion: 20, inicio: "2026-04-06", fin: "2026-04-29" },
  ], []);
  assert.equal(r.peores[0].nombre, "ESTRUCTURA");
});

test("comparar contra una foto vacía no revienta", () => {
  const r = comparar({}, [{ id: 1, nombre: "X", duracion: 2, inicio: "2026-03-02", fin: "2026-03-03" }], []);
  assert.equal(r.nuevas.length, 1);
  assert.equal(r.corrimientoObra, null);
});
