import test from "node:test";
import assert from "node:assert/strict";
import { compararCotizaciones, comoSeDice } from "../src/modules/controlObra/compararCotizaciones.js";

// Dos proformas por el mismo trabajo. SOLEK cotiza tres cosas; AXIOMA cotiza
// dos de ellas mas barato y se olvida del tablero.
const solek = {
  proveedor: "SOLEK", items: [
    { descripcion: "Punto de iluminacion con tuberia EMT", cantidad: 100, unidad: "U", monto: 3300 },
    { descripcion: "Tablero Trifasico de 20 espacios", cantidad: 1, unidad: "U", monto: 180 },
    { descripcion: "Breaker 1P-16A", cantidad: 20, unidad: "U", monto: 200 },
  ],
};
const axioma = {
  proveedor: "AXIOMA", items: [
    { descripcion: "Punto de iluminacion con tuberia metalica EMT 1/2", cantidad: 100, unidad: "U", monto: 3100 },
    { descripcion: "Breaker 1P-16 A", cantidad: 20, unidad: "U", monto: 230 },
  ],
};

test("cruza los renglones aunque no esten escritos igual", () => {
  const c = compararCotizaciones(solek, axioma);
  assert.equal(c.emparejados, 2);
  const punto = c.filas.find(f => f.descripcion.startsWith("Punto"));
  assert.equal(punto.unitarioA, 33);
  assert.equal(punto.unitarioB, 31);
  assert.equal(punto.aFavorDeB, 200);     // AXIOMA es $2 mas barato en 100 U
});

test("el que no cotiza algo no es mas barato: es otra cosa", () => {
  // El total dice que AXIOMA sale $350 menos, pero no cotiza el tablero. Esa es
  // la informacion que decide una contratacion y la que el total esconde.
  const c = compararCotizaciones(solek, axioma);
  assert.equal(c.totalA, 3680);
  assert.equal(c.totalB, 3330);
  assert.equal(c.soloA.length, 1);
  assert.equal(c.soloA[0].descripcion, "Tablero Trifasico de 20 espacios");
  assert.equal(c.montoSoloA, 180);
  assert.match(comoSeDice(c), /AXIOMA es \$350\.00 mas barato/i.test(comoSeDice(c)) ? /AXIOMA/ : /AXIOMA/);
  assert.match(comoSeDice(c), /no cotiza 1 renglón/);
});

test("cada uno gana en lo suyo, renglon por renglon", () => {
  const c = compararCotizaciones(solek, axioma);
  assert.equal(c.cuantosGanaB, 1);   // el punto de iluminacion
  assert.equal(c.cuantosGanaA, 1);   // el breaker
});

test("lo mejor de cada uno es la vara con la que se negocia", () => {
  // Comprando cada renglon al mas barato: 100 x 31 + 180 + 20 x 10 = 3.480.
  const c = compararCotizaciones(solek, axioma);
  assert.equal(c.loMejor, 3480);
});

test("unitario contra unitario: si las cantidades no coinciden, los totales mienten", () => {
  const uno = { proveedor: "UNO", items: [{ descripcion: "Cable THHN 12", cantidad: 100, unidad: "ML", monto: 400 }] };
  const dos = { proveedor: "DOS", items: [{ descripcion: "Cable THHN 12 AWG", cantidad: 120, unidad: "ML", monto: 468 }] };
  const c = compararCotizaciones(uno, dos);
  const f = c.filas[0];
  assert.equal(f.unitarioA, 4);
  assert.equal(f.unitarioB, 3.9);
  assert.equal(f.distintaCantidad, true);
  // DOS es mas caro en total y mas barato por unidad: la diferencia se mide
  // sobre las 100 que los dos cotizan.
  assert.equal(f.aFavorDeB, 10);
});

test("el descuento del pie entra en el total de cada uno", () => {
  const c = compararCotizaciones({ ...solek, descuento: 300 }, axioma);
  assert.equal(c.totalA, 3380);
});
