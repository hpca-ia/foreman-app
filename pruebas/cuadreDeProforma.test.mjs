import test from "node:test";
import assert from "node:assert/strict";
import { cuadrar, renglonesDeTexto } from "../src/modules/controlObra/leerProforma.js";

const items = [{ monto: 1000 }, { monto: 208.48 }];

test("sin totales en el papel no se puede comprobar nada", () => {
  assert.equal(cuadrar(items, null), null);
  assert.equal(cuadrar(items, { subtotal: null, total: 1389.75 }), null);
});

test("si los renglones dan el subtotal, la lectura está bien", () => {
  const c = cuadrar(items, { subtotal: 1208.48, iva: 181.27, total: 1389.75 });
  assert.equal(c.cuadra, true);
  assert.equal(c.suma, 1208.48);
  assert.equal(c.parece, null);
});

test("si dan el TOTAL, lo que pasó se sabe: se leyeron con el IVA adentro", () => {
  // Es exactamente lo que pasó con la proforma de AxiomaStudio.
  const c = cuadrar([{ monto: 1389.75 }], { subtotal: 1208.48, iva: 181.27, total: 1389.75 });
  assert.equal(c.cuadra, false);
  assert.equal(c.diferencia, 181.27);
  assert.match(c.parece, /CON el IVA adentro/);
});

test("de menos: quedó algo afuera", () => {
  const c = cuadrar([{ monto: 1000 }], { subtotal: 1208.48, total: 1389.75 });
  assert.equal(c.cuadra, false);
  assert.equal(c.diferencia, -208.48);
  assert.match(c.parece, /quedó algo afuera/);
});

test("de más sin ser el total: se coló un subtotal o un renglón repetido", () => {
  const c = cuadrar([{ monto: 1000 }, { monto: 1000 }], { subtotal: 1000, total: 1150 });
  assert.match(c.parece, /se leyó de más/);
});

test("los redondeos del proveedor son suyos: un centavo por renglón se tolera", () => {
  const c = cuadrar([{ monto: 100.01 }, { monto: 99.99 }, { monto: 50.01 }], { subtotal: 250 });
  assert.equal(c.cuadra, true);
});

test("la línea TOTALES se lee tal como viene, y el guion es no saber", () => {
  const r = renglonesDeTexto([
    "PROVEEDOR | AxiomaStudio",
    "IVA | 15",
    "TOTALES | 1208.48 | 181.27 | 1389.75",
    "Vinil blanco | 8 | u | 1208.48 | -",
  ].join("\n"));
  assert.equal(r.proveedor, "AxiomaStudio");
  assert.equal(r.iva, 15);
  assert.deepEqual(r.totales, { subtotal: 1208.48, iva: 181.27, total: 1389.75 });
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].monto, 1208.48);
});

test("si el papel no trae el IVA, el guion no se convierte en cero", () => {
  const r = renglonesDeTexto(["TOTALES | 500 | - | -", "Algo | 1 | u | 500 | -"].join("\n"));
  assert.equal(r.totales.subtotal, 500);
  assert.equal(r.totales.iva, null);
  assert.equal(r.totales.total, null);
});
