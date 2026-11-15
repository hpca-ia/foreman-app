// La factura de caja chica guardada con la base igual al total y sin IVA: los
// renglones que lee NOVA vienen sin IVA y no «faltan», es el IVA.
// Con la factura real de Kywi del Aeropuerto (027-909-000833486, $143,32).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { revisionDeFactura, cuadraConIva } from "../src/modules/controlObra/cuadrarFactura.js";
import { comoQuedo } from "../src/modules/lectura/aritmetica.js";
import { repartoDeRenglones } from "../src/modules/controlObra/repartoDeFactura.js";

// Así está guardada: como la guarda caja chica.
const KYWI = { subtotal_0: 0, subtotal_5: 0, subtotal_15: 143.32, iva: 0, total: 143.32 };
const RENGLONES = [
  ["Alambre recocido N18 c/kg", 2.6], ["Malla de aluminio alto=120cm c/m", 5.85], ["Pistola metálica p/silicón", 2.99],
  ["Sellador adhesivo blanco 280ml", 12.86], ["Plástico polietileno negro", 27.61], ["Plástico masking p/pintar", 11.11],
  ["Clavo acero estriado 2 1/2", 15.2], ["Tapón PVC H desagüe 110 mm", 5.08], ["Grasa multipropósito 14onz", 11.1],
  ["Flexómetro 8mt", 16.33], ["Playo 10 Truper", 13.9],
].map(([descripcion, monto]) => ({ descripcion, monto }));

test("LO QUE VIO: no faltan $18,69, es el IVA. La lectura cuadra con el total del papel", () => {
  const rev = revisionDeFactura({ items: RENGLONES, p: KYWI });
  assert.equal(comoQuedo(rev), "cuadra");
  assert.equal(rev.contra, "papel-con-iva");
  assert.equal(rev.conclusion, "11 renglones · $124.63 + IVA 15% $18.69 = $143.32: suman exactamente el total del papel");
  assert.doesNotMatch(rev.conclusion, /FALTAN/);
});

test("y ofrece dejar la base y el IVA como dice el papel", () => {
  assert.deepEqual(revisionDeFactura({ items: RENGLONES, p: KYWI }).corregirBase,
    { subtotal_0: 0, subtotal_5: 0, subtotal_15: 124.63, iva: 18.69 });
});

test("el IVA del 5% de materiales de construcción también", () => {
  const items = [{ descripcion: "Cemento", monto: 100 }];
  const c = cuadraConIva(items, { subtotal_15: 105, iva: 0, total: 105 });
  assert.deepEqual([c.tasa, c.base, c.iva, c.corregir.subtotal_5, c.corregir.subtotal_15], [5, 100, 5, 100, 0]);
});

test("si de verdad falta un renglón, lo sigue diciendo", () => {
  const rev = revisionDeFactura({ items: RENGLONES.slice(1), p: KYWI });
  assert.equal(comoQuedo(rev), "no-cuadra");
  assert.match(rev.conclusion, /FALTAN/);
});

test("una factura con su base y su IVA bien cargados se compara como siempre, contra la base", () => {
  const bien = { subtotal_15: 124.63, iva: 18.69, total: 143.32 };
  const rev = revisionDeFactura({ items: RENGLONES, p: bien });
  assert.equal(rev.contra, "papel");
  assert.equal(comoQuedo(rev), "cuadra");
  assert.equal(cuadraConIva(RENGLONES, bien), null);
});

test("lo que no se reconoce no se adivina: con IVA cargado, o base distinta del total, no hay ajuste", () => {
  assert.equal(cuadraConIva(RENGLONES, { subtotal_15: 143.32, iva: 1, total: 143.32 }), null);
  assert.equal(cuadraConIva(RENGLONES, { subtotal_15: 130, iva: 0, total: 143.32 }), null);
  assert.equal(cuadraConIva([{ monto: 100 }], { subtotal_15: 140, iva: 0, total: 140 }), null);
  assert.equal(cuadraConIva([], KYWI), null);
});

// ── Asignar unos renglones y otros no ──
test("LO QUE PASABA AL ASIGNAR 1 DE 11: el alambre de $2,60 se llevaba la factura entera; ahora su parte con IVA", () => {
  const items = RENGLONES.map((x, i) => ({ ...x, destino: i === 0 ? "rubro:1435" : null }));
  assert.deepEqual(repartoDeRenglones(items, 143.32), [{ tipo: "rubro", id: 1435, monto: 2.99 }]);
});

test("con todos asignados, suman la factura al centavo, IVA incluido", () => {
  const items = RENGLONES.map((x, i) => ({ ...x, destino: i < 5 ? "rubro:1435" : "act:195" }));
  const r = repartoDeRenglones(items, 143.32);
  assert.equal(Math.round(r.reduce((t, x) => t + x.monto, 0) * 100) / 100, 143.32);
});

test("la ventana de la factura lo dice y ofrece corregirlo", () => {
  const modal = readFileSync(new URL("../src/modules/controlObra/ModalFactura.jsx", import.meta.url), "utf8");
  assert.match(modal, /rev\.contra === "papel-con-iva"/);
  assert.match(modal, /setForm\(f => \(\{ \.\.\.f, \.\.\.rev\.corregirBase \}\)\)/);
  assert.match(modal, /const conIva = cuadraConIva\(items, form\);/);
});
