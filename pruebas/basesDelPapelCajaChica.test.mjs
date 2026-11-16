// Caja chica guarda la base y el IVA del papel, no todo el monto como «base
// 15%» con el IVA en cero. Lo lee NOVA; lo deja entrar la aritmética.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { basesDelPapel, basesAlGuardar, basesAlCorregir, comoAntes, lineaDeBases } from "../src/modules/cajaChica/basesDelPapel.js";

test("la de Kywi del Aeropuerto: base 15% $124,63 + IVA $18,69 = $143,32, así entra", () => {
  const leido = { subtotal_0: 0, subtotal_5: 0, subtotal_15: 124.63, iva: 18.69 };
  assert.deepEqual(basesDelPapel(leido, 143.32), { subtotal_0: 0, subtotal_5: 0, subtotal_15: 124.63, iva: 18.69 });
  assert.equal(lineaDeBases(basesDelPapel(leido, 143.32)), "Base 15% $124.63 + IVA $18.69");
});

test("una factura que mezcla tarifas (la 132: 15%, 5% y 0%) entra con cada base en su lugar", () => {
  const leido = { subtotal_0: 3.25, subtotal_5: 20.82, subtotal_15: 102.34, iva: 16.39 };
  assert.deepEqual(basesDelPapel(leido, 142.8), { subtotal_0: 3.25, subtotal_5: 20.82, subtotal_15: 102.34, iva: 16.39 });
});

test("una nota de venta o un recibo, sin IVA: base 0%, no «base 15% sin IVA»", () => {
  assert.deepEqual(basesDelPapel({ subtotal_0: 33, iva: 0 }, 33), { subtotal_0: 33, subtotal_5: 0, subtotal_15: 0, iva: 0 });
});

test("una nota de crédito resta, y sus bases también", () => {
  const b = basesDelPapel({ subtotal_15: 86.93, iva: 13.04 }, -99.97);
  assert.deepEqual(b, { subtotal_0: 0, subtotal_5: 0, subtotal_15: -86.93, iva: -13.04 });
  assert.ok(Object.is(b.subtotal_0, 0), "sin «−0»");
});

test("el centavo de redondeo va al IVA: base más IVA da el total exacto", () => {
  const b = basesDelPapel({ subtotal_15: 10, iva: 1.49 }, 11.5);
  assert.equal(b.iva, 1.5);
  assert.equal(b.subtotal_15 + b.iva, 11.5);
});

test("lo que no cuadra no entra: queda como antes, sin inventar", () => {
  // Leyó el total como base y además el IVA: suma más que lo pagado.
  assert.equal(basesDelPapel({ subtotal_15: 143.32, iva: 18.69 }, 143.32), null);
  // Restaurante: base + IVA + 10% de servicio. La suma no da.
  assert.equal(basesDelPapel({ subtotal_15: 20, iva: 3 }, 25), null);
  // Suma bien pero el IVA no es el de su base (una tarifa vieja del 12%).
  assert.equal(basesDelPapel({ subtotal_15: 100, iva: 12 }, 112), null);
  // No leyó nada.
  assert.equal(basesDelPapel({}, 50), null);
  assert.equal(basesDelPapel(undefined, 50), null);
  assert.equal(basesDelPapel({ subtotal_15: 10, iva: 1.5 }, 0), null);
  assert.deepEqual(basesAlGuardar({ subtotal_15: 20, iva: 3 }, 25), comoAntes(25));
  assert.deepEqual(comoAntes(25), { subtotal_0: 0, subtotal_5: 0, subtotal_15: 25, iva: 0 });
});

test("si cambió el monto escrito a mano y el papel ya no cuadra, como antes", () => {
  assert.deepEqual(basesAlGuardar({ subtotal_15: 124.63, iva: 18.69 }, 150), comoAntes(150));
});

test("al corregir sin volver a leer el papel y con el mismo monto, no se tocan: pueden estar corregidas en el control", () => {
  assert.deepEqual(basesAlCorregir(undefined, 143.32, 143.32), {});
  assert.deepEqual(basesAlCorregir(undefined, -99.97, "-99.97"), {});
});

test("al corregir el monto sin papel, como antes y con el IVA en cero: base vieja + IVA viejo no daba el total", () => {
  assert.deepEqual(basesAlCorregir(undefined, 150, 143.32), { subtotal_0: 0, subtotal_5: 0, subtotal_15: 150, iva: 0 });
});

test("al corregir con el papel leído otra vez, las del papel", () => {
  assert.deepEqual(basesAlCorregir({ subtotal_15: 124.63, iva: 18.69 }, 143.32, 143.32),
    { subtotal_0: 0, subtotal_5: 0, subtotal_15: 124.63, iva: 18.69 });
});

test("caja chica le pide a NOVA las bases y el IVA, y ya no guarda todo el monto como base 15%", () => {
  const caja = readFileSync(new URL("../src/modules/ModuloCajaChica.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(caja, /subtotal_15:monto/);
  assert.match(caja, /"subtotal_15":0,"iva":0/);
  assert.match(caja, /\.\.\.basesAlGuardar\(gastoForm\.desglose, monto\)/);
  assert.match(caja, /\.\.\.basesAlCorregir\(gastoForm\.desglose, monto, gastoEditando\.monto\)/);
  assert.match(caja, /desglose:\{subtotal_0:parsed\.subtotal_0/);
});

// ── Las que ya estaban: migración 182 ──
test("la 182 arregla solo las de caja chica que siguen «base 15% = total, IVA 0», con la aritmética de sus renglones", () => {
  const sql = readFileSync(new URL("../supabase/migrations/182_la_base_y_el_iva_de_caja_chica.sql", import.meta.url), "utf8");
  const codigo = sql.split("\n").filter(l => !l.trim().startsWith("--")).join("\n");
  assert.match(codigo, /f\.origen = 'caja_chica'/);
  assert.match(codigo, /coalesce\(f\.iva, 0\) = 0/);
  assert.match(codigo, /abs\(coalesce\(f\.subtotal_15, 0\) - f\.total\) <= 0\.01/);
  assert.match(codigo, /abs\(round\(r\.s15 \* 1\.15 \+ r\.s5 \* 1\.05 \+ r\.s0, 2\) - abs\(f\.total\)\) <= 0\.02/);
  // El total y las asignaciones no se tocan; no borra nada.
  assert.doesNotMatch(codigo, /\btotal\s*=/);
  assert.doesNotMatch(codigo, /delete|obra_asignaciones|drop/i);
  // Base más IVA da el total exacto.
  assert.match(codigo, /iva\s+= c\.signo \* round\(c\.t - c\.s0 - c\.s5 - c\.s15, 2\)/);
});
