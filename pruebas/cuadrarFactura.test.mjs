import test from "node:test";
import assert from "node:assert/strict";
import { baseImpresa, totalesDeLectura, renglonesDeLectura, revisionDeFactura } from "../src/modules/controlObra/cuadrarFactura.js";
import { comoQuedo } from "../src/modules/lectura/aritmetica.js";
import { leerHastaQueCuadre } from "../src/modules/lectura/insistir.js";

// Una factura de ferretería: tres renglones, base 15% de 250, IVA 37,50.
const LEIDA = {
  subtotal_0: 0, subtotal_5: 0, subtotal_15: 250, iva: 37.5, total: 287.5,
  items: [
    { descripcion: "Cemento Holcim 50kg", cantidad: 20, unidad: "saco", unitario: 8.5, monto: 170, iva: 15 },
    { descripcion: "Varilla 12mm", cantidad: 5, unidad: "u", unitario: 12, monto: 60, iva: 15 },
    { descripcion: "Alambre recocido", cantidad: 10, unidad: "kg", unitario: 2, monto: 20, iva: 15 },
  ],
};

test("la base impresa es la suma de las tres bases por tarifa", () => {
  assert.equal(baseImpresa(LEIDA), 250);
  assert.equal(baseImpresa({ subtotal_0: 100, subtotal_15: 50 }), 150);
  assert.equal(baseImpresa({}), null);
});

test("los renglones que suman la base cuadran, contra el papel", () => {
  const r = revisionDeFactura({ items: renglonesDeLectura(LEIDA), p: LEIDA });
  assert.equal(comoQuedo(r), "cuadra");
  assert.equal(r.contra, "papel");
  assert.deepEqual(r.malos, []);
});

test("un renglón que falta se nota: no cuadra, y dice cuánto falta", () => {
  const corta = { ...LEIDA, items: LEIDA.items.slice(0, 2) };
  const r = revisionDeFactura({ items: renglonesDeLectura(corta), p: corta });
  assert.equal(comoQuedo(r), "no-cuadra");
  assert.equal(r.falta, 20);
});

test("cantidad × unitario que no da el total se nombra", () => {
  const mal = { ...LEIDA, items: LEIDA.items.map((x, i) => i === 0 ? { ...x, unitario: 9 } : x) };
  const r = revisionDeFactura({ items: renglonesDeLectura(mal), p: mal });
  assert.equal(comoQuedo(r), "no-cuadra");
  assert.equal(r.malos.length, 1);
  assert.match(r.malos[0].descripcion, /Cemento/);
});

test("si el SRI contestó, manda la base del XML, que viene firmada", () => {
  // El papel dice 250 y lo leído suma 250; pero el XML autorizado dice 300:
  // la factura impresa no es la autorizada, y eso es lo que hay que ver.
  const r = revisionDeFactura({ items: renglonesDeLectura(LEIDA), p: LEIDA, comprobante: { totalSinImpuestos: 300 } });
  assert.equal(r.contra, "sri");
  assert.equal(comoQuedo(r), "no-cuadra");
  assert.equal(r.falta, 50);
});

test("sin base impresa ni XML, no se puede comprobar: se dice", () => {
  const sinBases = { items: LEIDA.items };
  const r = revisionDeFactura({ items: renglonesDeLectura(sinBases), p: sinBases });
  assert.equal(comoQuedo(r), "sin-comprobar");
  assert.equal(r.contra, null);
  assert.equal(totalesDeLectura(sinBases), null);
});

test("el lazo: una lectura corta se reclama y la segunda, completa, cierra", async () => {
  const corta = { ...LEIDA, items: LEIDA.items.slice(0, 2) };
  const reclamos = [];
  let vez = 0;
  const leer = async (reclamo) => {
    reclamos.push(reclamo);
    const p = vez++ === 0 ? corta : LEIDA;
    return { items: renglonesDeLectura(p), totales: totalesDeLectura(p), descuento: 0, p };
  };
  const r = await leerHastaQueCuadre({ leer, vueltas: 3 });
  assert.equal(r.cerro, true);
  assert.equal(r.vuelta, 2);
  assert.equal(r.p.items.length, 3);
  assert.equal(reclamos[0], null);
  assert.match(reclamos[1], /Faltan \$20\.00/);
});
