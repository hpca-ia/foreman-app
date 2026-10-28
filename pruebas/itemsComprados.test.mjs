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

// ─── Lo que se guarda y la dotación contra la gente ───────────────────────
import { desdeLecturaDeFactura, filasDeRenglones, facturasPorLeer, dotacionContraPersonal } from "../src/modules/controlObra/itemsComprados.js";

test("los renglones de la pantalla de la factura sacan su precio unitario", () => {
  const r = desdeLecturaDeFactura([
    { descripcion: "CASCO BLANCO", cantidad: 10, unidad: "U", monto: 85 },
    { descripcion: "", cantidad: 0, monto: 0 },
    { descripcion: "TRANSPORTE", cantidad: 0, unidad: "", monto: 15 },
  ]);
  assert.equal(r.length, 2);
  assert.deepEqual(r[0], { cantidad: 10, unidad: "u", descripcion: "CASCO BLANCO", total: 85, precio_unitario: 8.5 });
  assert.equal(r[1].precio_unitario, null, "sin cantidad no hay precio unitario que inventar");
});

test("una nota de crédito devuelve cascos: resta", () => {
  const f = filasDeRenglones({ id: 7, obra_id: 3, total: -17 }, [{ cantidad: 2, unidad: "u", descripcion: "CASCO BLANCO", total: 17, precio_unitario: 8.5 }]);
  assert.equal(f[0].cantidad, -2);
  assert.equal(f[0].total, -17);
  assert.equal(f[0].familia, "casco");
  assert.equal(f[0].obra_id, 3);
  const g = agrupar([
    { cantidad: 10, unidad: "u", descripcion: "CASCO BLANCO", total: 85 },
    { cantidad: f[0].cantidad, unidad: "u", descripcion: f[0].descripcion, total: f[0].total },
  ]);
  assert.equal(g[0].cantidad, 8);
});

test("por leer: con papel, sin leer, y nunca un anticipo", () => {
  const r = facturasPorLeer([
    { id: 1, archivo_url: "a" },
    { id: 2, archivo_url: null },
    { id: 3, archivo_url: "b", renglones_estado: "leida" },
    { id: 4, archivo_url: "c", renglones_estado: "ilegible" },
    { id: 5, archivo_url: "d", clase: "anticipo" },
  ]);
  assert.deepEqual(r.map(f => f.id), [1]);
});

test("10 personas y 23 cascos: 13 de más", () => {
  const g = agrupar([
    { cantidad: 15, unidad: "u", descripcion: "CASCO BLANCO", total: 127.5 },
    { cantidad: 8, unidad: "u", descripcion: "casco amarillo", total: 68 },
    { cantidad: 10, unidad: "par", descripcion: "BOTAS PUNTA DE ACERO", total: 300 },
    { cantidad: 200, unidad: "par", descripcion: "GUANTE NITRILO", total: 100 },
  ]);
  const d = dotacionContraPersonal(g, 10);
  assert.equal(d[0].nombre, "Cascos");
  assert.equal(d[0].cantidad, 23);
  assert.equal(d[0].de_mas, 13);
  assert.equal(d.find(x => x.nombre === "Botas").de_mas, 0);
  assert.ok(!d.some(x => /guante/i.test(x.nombre)), "los guantes se gastan: no se comparan");
});

test("sin gente cargada no hay comparación inventada", () => {
  const d = dotacionContraPersonal(agrupar([{ cantidad: 5, unidad: "u", descripcion: "CASCO", total: 40 }]), 0);
  assert.equal(d[0].de_mas, null);
});
