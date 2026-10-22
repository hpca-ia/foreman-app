import test from "node:test";
import assert from "node:assert/strict";
import { interpretarItems, claveDe, familiaDe, agrupar } from "../src/modules/controlObra/itemsComprados.js";

test("una línea por ítem, con su total", () => {
  const r = interpretarItems("12 | u | CASCO TIPO I CLASE G BLANCO | 8.50\n2 | rollo | CUERDA PP TRENZADA 10MM | 24.00");
  assert.equal(r.length, 2);
  assert.deepEqual(r[0], { cantidad: 12, unidad: "u", descripcion: "CASCO TIPO I CLASE G BLANCO", precio_unitario: 8.5, total: 102 });
  assert.equal(r[1].total, 48);
});

test("no inventa ítems con las líneas vacías ni con la basura", () => {
  assert.deepEqual(interpretarItems("\n | | \nSUBTOTAL\n"), []);
  assert.deepEqual(interpretarItems("ILEGIBLE"), []);
  assert.deepEqual(interpretarItems(null), []);
});

test("lee el número como lo escribe una factura ecuatoriana", () => {
  const r = interpretarItems("1.250 | u | TORNILLO | $ 1.234,56");
  assert.equal(r[0].cantidad, 1250);
  assert.equal(r[0].precio_unitario, 1234.56);
});

test("el mismo ítem escrito al revés es el mismo ítem", () => {
  assert.equal(claveDe("CASCO BLANCO"), claveDe("blanco casco"));
  assert.equal(claveDe("Casco tipo I"), claveDe("CASCO I"));
});

test("la familia es con lo que uno pregunta", () => {
  assert.equal(familiaDe("CASCO TIPO I CLASE G BLANCO"), "casco");
  assert.equal(familiaDe("3M mascarilla KN95"), "mascarilla");
});

test("suma los cascos de tres facturas y dice de cuántas vienen", () => {
  const g = agrupar([
    { factura_id: 1, cantidad: 12, unidad: "u", descripcion: "CASCO BLANCO", total: 102 },
    { factura_id: 2, cantidad: 6, unidad: "u", descripcion: "casco blanco", total: 51 },
    { factura_id: 3, cantidad: 4, unidad: "u", descripcion: "CASCO AMARILLO", total: 34 },
  ]);
  assert.equal(g.length, 1);
  assert.equal(g[0].familia, "casco");
  assert.equal(g[0].cantidad, 22);
  assert.equal(g[0].total, 187);
  assert.equal(g[0].variantes.length, 2, "blanco y amarillo son variantes distintas");
  assert.equal(g[0].facturas, 3);
});

test("no suma cajas con unidades: dice que son varias", () => {
  const g = agrupar([
    { cantidad: 3, unidad: "caja", descripcion: "GUANTE NITRILO", total: 30 },
    { cantidad: 40, unidad: "u", descripcion: "guante nitrilo", total: 40 },
  ]);
  assert.equal(g[0].unidad, "varias");
  assert.equal(g[0].total, 70, "la plata sí se suma siempre");
});

test("lo más caro primero: por ahí se empieza a mirar", () => {
  const g = agrupar([
    { cantidad: 1, unidad: "u", descripcion: "CINTA AISLANTE", total: 2 },
    { cantidad: 1, unidad: "u", descripcion: "ANDAMIO METALICO", total: 400 },
  ]);
  assert.deepEqual(g.map(x => x.familia), ["andamio", "cinta"]);
});

test("un renglón sin nombre no arma una familia vacía", () => {
  assert.deepEqual(agrupar([{ cantidad: 1, unidad: "u", descripcion: "   ", total: 5 }]), []);
});
