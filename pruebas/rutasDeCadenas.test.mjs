import test from "node:test";
import assert from "node:assert/strict";
import { rutaDeCadena, ordenDeTrazado } from "../src/modules/cronograma/rutasDeCadenas.js";

// Las flechas del cronograma bajaban todas pegadas a la barra de la que salen:
// diez por la misma columna eran una sola raya, y las largas atravesaban las
// barras del medio. Esto es lo que no puede volver.

const FILA = 5.6;
const fila = k => k * FILA + FILA / 2;   // centro de la fila k
const barra = (x1, x2, k) => ({ x1, x2, y: fila(k) });

// Las x de las bajadas de una ruta (los tramos verticales).
const bajadas = puntos => puntos.slice(1).filter((p, i) => p[0] === puntos[i][0] && p[1] !== puntos[i][1]).map(p => p[0]);

test("una bajada no atraviesa una barra si hay lugar al lado", () => {
  const de = barra(10, 20, 0), a = barra(40, 50, 4);
  const estorbo = barra(15, 30, 2);   // tapa de 15 a 30 en una fila del medio
  const { puntos } = rutaDeCadena({ de, a, cajas: [de, a, estorbo], alto: FILA });
  bajadas(puntos).forEach(x => assert.ok(x > 30 + 0.4 || x < 15 - 0.4, `baja por ${x}, encima de la barra`));
});

test("dos flechas de barras distintas no bajan por la misma columna", () => {
  const verticales = [];
  const cajas = [barra(10, 20, 0), barra(10, 20, 1), barra(40, 50, 5), barra(40, 50, 6)];
  const r1 = rutaDeCadena({ de: cajas[0], a: cajas[2], cajas, verticales, alto: FILA });
  const r2 = rutaDeCadena({ de: cajas[1], a: cajas[3], cajas, verticales, alto: FILA });
  const [x1] = bajadas(r1.puntos), [x2] = bajadas(r2.puntos);
  assert.ok(Math.abs(x1 - x2) >= 0.9, `bajan a ${Math.abs(x1 - x2).toFixed(2)} mm una de otra`);
});

test("las que salen de la misma barra comparten el tronco", () => {
  const verticales = [];
  const de = barra(10, 20, 0);
  const cajas = [de, barra(40, 50, 3), barra(40, 50, 6)];
  const r1 = rutaDeCadena({ de, a: cajas[1], cajas, verticales, alto: FILA });
  const r2 = rutaDeCadena({ de, a: cajas[2], cajas, verticales, alto: FILA });
  assert.equal(bajadas(r1.puntos)[0], bajadas(r2.puntos)[0]);
});

test("con traslape la vuelta va por la línea entre filas, no por encima de las barras", () => {
  const de = barra(10, 30, 0), a = barra(20, 40, 3);   // la que espera arranca antes de que termine la otra
  const { puntos } = rutaDeCadena({ de, a, cajas: [de, a], alto: FILA });
  const tramoAtras = puntos.find((p, i) => i > 0 && p[1] === puntos[i - 1][1] && p[0] < puntos[i - 1][0]);
  assert.ok(tramoAtras, "tiene que haber un tramo hacia atrás");
  assert.equal(tramoAtras[1], a.y - FILA / 2);
  // Y termina entrando por la izquierda de la que espera.
  assert.deepEqual(puntos.at(-1), [a.x1 - 1.1, a.y]);
});

test("las cortas se trazan primero", () => {
  const donde = new Map([[1, barra(0, 5, 0)], [2, barra(10, 15, 9)], [3, barra(10, 15, 1)]]);
  const orden = ordenDeTrazado([{ depende_de_id: 1, actividad_id: 2 }, { depende_de_id: 1, actividad_id: 3 }, { depende_de_id: 1, actividad_id: 99 }], donde);
  assert.deepEqual(orden.map(x => x.d.actividad_id), [3, 2]);   // la 99 no está en la hoja: no se traza
});
