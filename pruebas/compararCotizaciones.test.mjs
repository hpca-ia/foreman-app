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
  // El titular empieza por lo COMPARABLE —el mismo alcance en los dos— y
  // despues dice lo del alcance, que es otra conversacion. Empezar por los
  // totales es empezar por el numero que miente cuando los alcances no
  // coinciden.
  assert.match(comoSeDice(c), /En los 2 renglones que cotizan los dos/);
  assert.match(comoSeDice(c), /SOLEK cotiza 1 que AXIOMA no, por \$180/);
});

test("cada uno gana en lo suyo, renglon por renglon", () => {
  const c = compararCotizaciones(solek, axioma);
  assert.equal(c.cuantosGanaB, 1);   // el punto de iluminacion
  assert.equal(c.cuantosGanaA, 1);   // el breaker
});

test("lo mejor de cada uno se mide sobre el mismo alcance que lo demas", () => {
  // Sumando tambien lo que cotiza uno solo, este numero daba MAS que cualquiera
  // de los dos totales y quedaba como algo que no se entiende. Sobre los
  // renglones que cotizan los dos: 100 x 31 + 20 x 10 = 3.300, contra 3.500 de
  // SOLEK y 3.330 de AXIOMA en ese mismo alcance.
  const c = compararCotizaciones(solek, axioma);
  assert.equal(c.comunA, 3500);
  assert.equal(c.comunB, 3330);
  assert.equal(c.loMejor, 3300);
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

test("mas barato y ademas menos cantidad: ese es el que engaña", () => {
  // Un unitario mas bajo se lee como mejor oferta, y si encima cotiza menos
  // metros el renglon sale muy por debajo. Pero los metros que faltan hay que
  // hacerlos igual: se compran despues a un precio que ya no se negocia, o
  // aparecen como adicional.
  const uno = { proveedor: "UNO", items: [{ descripcion: "Cable THHN 12", cantidad: 120, unidad: "ML", monto: 480 }] };
  const dos = { proveedor: "DOS", items: [{ descripcion: "Cable THHN 12 AWG", cantidad: 80, unidad: "ML", monto: 304 }] };
  const c = compararCotizaciones(uno, dos);
  const f = c.filas[0];
  assert.equal(f.unitarioA, 4);
  assert.equal(f.unitarioB, 3.8);   // DOS es mas barato por unidad…
  assert.equal(f.cantidadB, 80);    // …y cotiza 40 metros menos
  assert.equal(f.engana, "b");
  assert.equal(c.cuantosEnganan, 1);
});

test("mas barato con la misma cantidad no engaña a nadie", () => {
  const uno = { proveedor: "UNO", items: [{ descripcion: "Cable THHN 12", cantidad: 100, unidad: "ML", monto: 400 }] };
  const dos = { proveedor: "DOS", items: [{ descripcion: "Cable THHN 12 AWG", cantidad: 100, unidad: "ML", monto: 380 }] };
  assert.equal(compararCotizaciones(uno, dos).filas[0].engana, null);
});
