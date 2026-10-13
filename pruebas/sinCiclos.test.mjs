import test from "node:test";
import assert from "node:assert/strict";
import { sinCiclos } from "../src/modules/cronograma/sinCiclos.js";

test("una cadena normal pasa entera", () => {
  const { dependencias, cortadas } = sinCiclos([{ de: 1, a: 2 }, { de: 2, a: 3 }, { de: 3, a: 4 }]);
  assert.equal(dependencias.length, 3);
  assert.equal(cortadas.length, 0);
});

test("UN CÍRCULO APAGA EL CRONOGRAMA: se corta la que lo cierra", () => {
  const { dependencias, cortadas } = sinCiclos([{ de: 1, a: 2 }, { de: 2, a: 3 }, { de: 3, a: 1 }]);
  assert.deepEqual(dependencias.map(d => [d.de, d.a]), [[1, 2], [2, 3]]);
  assert.deepEqual(cortadas.map(d => [d.de, d.a]), [[3, 1]]);
});

test("el círculo más corto: A espera a B y B espera a A", () => {
  const { dependencias, cortadas } = sinCiclos([{ de: 1, a: 2 }, { de: 2, a: 1 }]);
  assert.equal(dependencias.length, 1);
  assert.equal(cortadas.length, 1);
});

test("una actividad esperándose a sí misma no es nada", () => {
  const { dependencias, cortadas } = sinCiclos([{ de: 5, a: 5 }]);
  assert.equal(dependencias.length, 0);
  assert.equal(cortadas.length, 1);
});

test("el mismo enlace dos veces entra una sola", () => {
  const { dependencias } = sinCiclos([{ de: 1, a: 2 }, { de: 1, a: 2 }]);
  assert.equal(dependencias.length, 1);
});

test("dos caminos a la misma actividad NO son un círculo: eso es una obra", () => {
  // Estructura → mampostería y estructura → instalaciones, las dos antes del enlucido.
  const { dependencias, cortadas } = sinCiclos([
    { de: 1, a: 2 }, { de: 1, a: 3 }, { de: 2, a: 4 }, { de: 3, a: 4 },
  ]);
  assert.equal(dependencias.length, 4);
  assert.equal(cortadas.length, 0);
});

test("un círculo largo, de los que arma una obra real", () => {
  const { dependencias, cortadas } = sinCiclos([
    { de: 1, a: 2 }, { de: 2, a: 3 }, { de: 3, a: 4 }, { de: 4, a: 5 }, { de: 5, a: 2 },
  ]);
  assert.equal(dependencias.length, 4);
  assert.deepEqual(cortadas.map(d => [d.de, d.a]), [[5, 2]]);
});

test("se conserva todo lo demás de la dependencia: tipo y retardo", () => {
  const { dependencias } = sinCiclos([{ de: 1, a: 2, tipo: "CC", retardo: -5 }]);
  assert.deepEqual(dependencias[0], { de: 1, a: 2, tipo: "CC", retardo: -5 });
});

test("una lista vacía no revienta", () => {
  assert.deepEqual(sinCiclos(), { dependencias: [], cortadas: [] });
});
