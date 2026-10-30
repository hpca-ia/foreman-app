import test from "node:test";
import assert from "node:assert/strict";
import { conIvaCuadrado, diferenciaConElPapel } from "../src/modules/controlObra/cuadrarConElPapel.js";

test("tres renglones que redondean para abajo igual dan el total del papel", () => {
  // 3 × 10,01 = 30,03 → con IVA 34,5345. Redondeado por renglón: 11,51 × 3 =
  // 34,53, y el papel dice 34,53. Acá no hay diferencia.
  const { totales, ajuste } = conIvaCuadrado([10.01, 10.01, 10.01], 15, 34.53);
  assert.equal(totales.reduce((t, x) => t + x, 0), 34.53);
  assert.equal(ajuste, 0);
});

test("la diferencia se le carga al renglón más grande", () => {
  // 0,07 × 1,15 = 0,0805 → 0,08 cada uno; tres dan 0,24 y el papel dice 0,25.
  const { totales, ajuste, donde } = conIvaCuadrado([0.07, 0.07, 9000], 15, 10350.25);
  assert.equal(donde, 2);
  assert.equal(totales.reduce((t, x) => t + x, 0), 10350.25);
  assert.ok(Math.abs(ajuste) > 0);
});

test("el caso real del aeropuerto: 164 renglones y tres centavos", () => {
  // Muchos renglones chicos que redondean para abajo.
  const montos = Array.from({ length: 164 }, (_, i) => 912.65 + i * 0.001);
  const suma = Math.round(montos.reduce((t, m) => t + m, 0) * 100) / 100;
  const papel = Math.round(suma * 1.15 * 100) / 100;
  const { totales } = conIvaCuadrado(montos, 15, papel);
  assert.equal(Math.round(totales.reduce((t, x) => t + x, 0) * 100) / 100, papel);
});

test("sin el total del papel, cuadra contra el que da la suma", () => {
  const { totales } = conIvaCuadrado([10.01, 10.01, 10.01], 15);
  const papel = Math.round(30.03 * 1.15 * 100) / 100;
  assert.equal(Math.round(totales.reduce((t, x) => t + x, 0) * 100) / 100, papel);
});

test("sin IVA no se toca nada", () => {
  const { totales, ajuste } = conIvaCuadrado([100, 200], 0, 300);
  assert.deepEqual(totales, [100, 200]);
  assert.equal(ajuste, 0);
});

test("una lista vacía no inventa un ajuste", () => {
  const { totales, ajuste, donde } = conIvaCuadrado([], 15, 0);
  assert.deepEqual(totales, []);
  assert.equal(ajuste, 0);
  assert.equal(donde, -1);
});

test("la diferencia con el papel se puede medir después", () => {
  assert.equal(diferenciaConElPapel([{ total_base: 172127.24 }], 172127.27), -0.03);
  assert.equal(diferenciaConElPapel([{ total_base: 198873.72 }], 198873.71), 0.01);
});
