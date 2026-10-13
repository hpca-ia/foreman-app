import test from "node:test";
import assert from "node:assert/strict";
import { filtrar } from "../src/modules/actas/filtrarRevision.js";

const datos = {
  temas: [{ id: 1, titulo: "Ventaneria", detalle: "atraso 2 sem", resuelto: "" }],
  compromisos: [{ id: 5, texto: "pedir proforma" }],
  acta: { id: 9, resumen: "todo bien", avance_nota: null },
};

test("una corrección de ortografía entra con el antes y el después", () => {
  const r = filtrar({ correcciones: [{ tipo: "tema", id: 1, campo: "titulo", texto: "Ventanería", porque: "tilde" }] }, datos);
  assert.equal(r.correcciones.length, 1);
  assert.equal(r.correcciones[0].antes, "Ventaneria");
  assert.equal(r.correcciones[0].texto, "Ventanería");
});

test("UNA CORRECCIÓN QUE NO CORRIGE NADA NO ENTRA", () => {
  // Una lista llena de cambios idénticos hace que uno deje de mirar los reales.
  const r = filtrar({ correcciones: [{ tipo: "tema", id: 1, campo: "titulo", texto: "Ventaneria" }] }, datos);
  assert.equal(r.correcciones.length, 0);
});

test("un id que no existe no escribe en nada", () => {
  const r = filtrar({ correcciones: [{ tipo: "tema", id: 99, campo: "titulo", texto: "X" }] }, datos);
  assert.equal(r.correcciones.length, 0);
});

test("un campo que no es de ese tipo tampoco", () => {
  const r = filtrar({ correcciones: [{ tipo: "compromiso", id: 5, campo: "resuelto", texto: "X" }] }, datos);
  assert.equal(r.correcciones.length, 0);
});

test("el acta tiene sus dos campos y nada más", () => {
  const r = filtrar({ correcciones: [
    { tipo: "acta", id: 9, campo: "resumen", texto: "Todo en orden." },
    { tipo: "acta", id: 9, campo: "lugar", texto: "Oficina" },
  ] }, datos);
  assert.deepEqual(r.correcciones.map(c => c.campo), ["resumen"]);
});

test("los avisos sin texto no son avisos", () => {
  const r = filtrar({ avisos: [{ donde: "x" }, { donde: "Compromiso", que: "No dice quién", hacer: "Preguntar" }] }, datos);
  assert.equal(r.avisos.length, 1);
  assert.equal(r.avisos[0].hacer, "Preguntar");
});

test("un acta que está bien devuelve las dos listas vacías", () => {
  const r = filtrar({ correcciones: [], avisos: [] }, datos);
  assert.deepEqual(r, { correcciones: [], avisos: [] });
});

test("una respuesta vacía no revienta", () => {
  assert.deepEqual(filtrar(null, datos), { correcciones: [], avisos: [] });
});
