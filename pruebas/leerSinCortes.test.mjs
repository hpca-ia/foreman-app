import test from "node:test";
import assert from "node:assert/strict";
import { leerSinCortes, continuacion, renglonesDeTexto } from "../src/modules/controlObra/leerProforma.js";
import { revisarLectura } from "../src/modules/lectura/aritmetica.js";
import { reclamo, enRangos } from "../src/modules/lectura/insistir.js";

// La proforma de SOLEK: 69 ítems en dos páginas. La respuesta se cortaba en el
// 31, se tiraba la línea a medio escribir y se seguía como si terminara ahí.
const parte1 = `PROVEEDOR | SOLEK C&P S.A.S
1 | Suministro de 1 tablero eléctrico industrial | 1 | Mes | 115,56 | 115,56 | -
2 | Reflectores iluminación LED de 100w | 4 | U | 40,81 | 163,25 | -
3 | Cable preensamblado 3x6 AWG + 6 AWG. | 30 | ML | 4,9`;   // cortada a media línea
const parte2 = `2 | Reflectores iluminación LED de 100w | 4 | U | 40,81 | 163,25 | -
3 | Cable preensamblado 3x6 AWG + 6 AWG. | 30 | ML | 4,93 | 148,01 | -
4 | Suministro de cable sucre 2x16 | 50 | ML | 2,17 | 108,68 | -
TOTALES | 535,50 | - | -`;

test("una respuesta cortada se sigue donde quedó, y el papel se lee hasta el final", async () => {
  const llamadas = [];
  const pedir = async cuerpo => {
    llamadas.push(cuerpo);
    return llamadas.length === 1 ? { texto: parte1, cortado: true } : { texto: parte2, cortado: false };
  };
  const r = await leerSinCortes({ pedir, cuerpoPara: sigue => ({ sigue }) });
  assert.deepEqual(r.items.map(x => x.item), [1, 2, 3, 4]);   // el 2 repetido en el empalme no entra dos veces
  assert.equal(r.items[2].monto, 148.01);                     // y el 3 es el entero, no el "4,9" cortado
  assert.equal(r.cortado, false);
  assert.equal(r.partes, 2);
  assert.equal(r.proveedor, "SOLEK C&P S.A.S");
  assert.equal(r.totales.subtotal, 535.5);
  assert.equal(llamadas[0].sigue, null);
  assert.match(llamadas[1].sigue, /ítem 2/);
  assert.match(llamadas[1].sigue, /Reflectores iluminación LED/);
});

test("si se corta sin avanzar deja de pedir, y avisa que no llegó al final", async () => {
  let n = 0;
  const pedir = async () => { n += 1; return { texto: parte1, cortado: true }; };
  const r = await leerSinCortes({ pedir, cuerpoPara: s => ({ s }) });
  assert.equal(n, 2);
  assert.equal(r.cortado, true);
  assert.equal(r.items.length, 2);
});

test("el número de ítem se lee cuando viene, y un renglón sin él se lee igual", () => {
  const { items } = renglonesDeTexto(`32 | Punto de red Categoría 6 (APS) | 7 | U | 127,28 | 890,97 | -
- | Mano de obra | 1 | glb | 250,00 | 250,00 | -
Alimentador 3X12 THHN | 200 | ML | 4,36 | 871,70 | 95`);
  assert.equal(items[0].item, 32);
  assert.equal(items[0].monto, 890.97);
  assert.equal(items[1].item, undefined);            // el papel no lo numeró
  assert.equal(items[1].descripcion, "Mano de obra");
  assert.equal(items[2].item, undefined);            // el formato viejo, sin ítem
  assert.equal(items[2].rubro_id, 95);
});

test("el subtotal del pie puede estar antes o después del descuento: cuadra con cualquiera de los dos", () => {
  // SOLEK: SUBTOTAL $18.298,27, DESCUENTO $1.049,41, y recién después el
  // subtotal descontado. Se le sumaba el descuento y se exigían $19.347,68.
  const antes = revisarLectura([{ monto: 18298.27 }], { subtotal: 18298.27 }, 1049.41);
  assert.equal(antes.cuadra, true);
  assert.equal(antes.esperado, 18298.27);
  // El papel que escribe el subtotal ya descontado sigue cuadrando.
  const despues = revisarLectura([{ monto: 600 }, { monto: 400 }], { subtotal: 900 }, 100);
  assert.equal(despues.cuadra, true);
  assert.equal(despues.esperado, 1000);
  // Y cuando falta, falta contra el que queda más cerca.
  const corta = revisarLectura([{ monto: 12014.61 }], { subtotal: 18298.27 }, 1049.41);
  assert.equal(corta.cuadra, false);
  assert.equal(corta.falta, 6283.66);
});

test("cuando falta plata, el reclamo dice qué ítems numerados no se transcribieron", () => {
  const items = [1, 2, 3, 4, 5, 9, 10].map(k => ({ item: k, monto: 10 }));
  const r = revisarLectura(items, { subtotal: 100 }, 0);
  assert.deepEqual(r.saltados, [6, 7, 8]);
  assert.equal(enRangos([35, 36, 37, 40, 67, 68]), "35 a 37, 40, 67 a 68");
  assert.match(reclamo(r), /no transcribiste los ítems 6 a 8/);
  assert.equal(continuacion([]), null);
});
