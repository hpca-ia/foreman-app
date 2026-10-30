import test from "node:test";
import assert from "node:assert/strict";
import { compararContraPresupuesto } from "../src/modules/controlObra/compararProforma.js";
import { loQueNoEstaPresupuestado, partidasParaOrden, comoSeDice } from "../src/modules/controlObra/extraParaCobrar.js";

// El caso: se cotizó X. Se va a la obra, se mide, y hace falta X, Y y T.
const rubros = [{ id: 1, numero: "1.1", descripcion: "Vinil en fachada", unidad: "u", cantidad: 8, total_base: 1726.64 }];
const proforma = [
  { descripcion: "Vinil blanco respaldo gris", cantidad: 12, unidad: "u", monto: 1800, rubro_id: 1 },
  { descripcion: "Perfilería de aluminio", cantidad: 1, unidad: "glb", monto: 400, rubro_id: null },
  { descripcion: "Desmontaje del vinil viejo", cantidad: 1, unidad: "glb", monto: 250, rubro_id: null },
];
const h = loQueNoEstaPresupuestado(compararContraPresupuesto(proforma, rubros));

test("encuentra lo que no está en ningún rubro", () => {
  assert.equal(h.nuevos.length, 2);
  assert.deepEqual(h.nuevos.map(x => x.descripcion), ["Perfilería de aluminio", "Desmontaje del vinil viejo"]);
  assert.equal(h.sinPrecio, 2);
});

test("encuentra la cantidad de más, y cobra solo la diferencia", () => {
  assert.equal(h.demas.length, 1);
  const x = h.demas[0];
  assert.equal(x.cantidad, 4);                 // eran 8, la proforma trae 12
  assert.equal(x.costoUnitario, 150);          // 1800 / 12
  assert.equal(x.costo, 600);
  assert.match(x.por, /tiene 8 u y la proforma trae 12/);
});

test("lo que ya tiene precio acordado se cobra a ese precio, no a uno nuevo", () => {
  // Volver a ponerle precio a un rubro que el cliente ya firmó es abrir una
  // negociación que no hacía falta.
  assert.equal(h.demas[0].precioUnitario, 215.83);
  assert.equal(h.conPrecio, 863.32);           // 4 × 215,83
});

test("el costo de todo lo que hay que cobrar se suma de los dos lados", () => {
  assert.equal(h.costo, 1250);                 // 600 de más + 400 + 250
  assert.equal(h.cuantos, 3);
});

test("como partidas de una orden: el precio del contrato se respeta, lo nuevo lleva utilidad", () => {
  const p = partidasParaOrden(h, 20);
  assert.equal(p.length, 3);
  const extra = p.find(x => x.descripcion.includes("de más"));
  assert.equal(extra.precio_unitario, 215.83);     // el del contrato, sin tocar
  assert.equal(extra.costo_unitario, 150);
  assert.equal(extra.obra_rubro_id, 1);
  const nuevo = p.find(x => x.descripcion === "Perfilería de aluminio");
  assert.equal(nuevo.costo_unitario, 400);
  assert.equal(nuevo.precio_unitario, 480);        // 400 + 20%
});

test("una proforma que calza con el presupuesto no inventa un extra que cobrar", () => {
  // Las 8 unidades contratadas, sin cantidad de más ni renglones nuevos: no
  // hay nada que cobrarle al cliente.
  const sin = loQueNoEstaPresupuestado(compararContraPresupuesto(
    [{ descripcion: "Vinil", cantidad: 8, monto: 1200, rubro_id: 1 }], rubros));
  assert.equal(sin.cuantos, 0);
  assert.equal(sin.costo, 0);
  assert.equal(partidasParaOrden(sin, 20).length, 0);
});

test("pero si lo cotizan por debajo de lo que el cliente paga, eso es plata de la casa", () => {
  // El rubro se vendió en $1.726,64 y ahora lo cotizan en $1.200. Ese rubro no
  // tiene costo cargado, así que la única vara que existe es el precio que el
  // cliente ya aceptó —y contra esa vara quedan $526,64 a favor del proyecto—.
  // Callarlo porque "no hay costo" es perder la única comparación posible.
  const sin = loQueNoEstaPresupuestado(compararContraPresupuesto(
    [{ descripcion: "Vinil", cantidad: 8, monto: 1200, rubro_id: 1 }], rubros));
  assert.equal(sin.bajaron.length, 1);
  assert.equal(sin.eficiencia, 526.64);
  assert.equal(sin.bajaron[0].contraPrecio, true);
  assert.match(sin.bajaron[0].por, /el cliente lo vio a \$215\.83 y ahora lo cotizan a \$150/);
  assert.match(comoSeDice(sin), /526,64 a favor/);
});

test("menos cantidad de la presupuestada no es un extra a cobrar", () => {
  const menos = loQueNoEstaPresupuestado(compararContraPresupuesto(
    [{ descripcion: "Vinil", cantidad: 5, monto: 750, rubro_id: 1 }], rubros));
  assert.equal(menos.demas.length, 0);
});

test("el titular dice las dos cosas por separado", () => {
  assert.equal(comoSeDice(h),
    "2 renglones que no están en el presupuesto y 1 rubro con más cantidad de la presupuestada · $1.250,00 de costo");
});

test("lo que falta también es una diferencia con el cliente, y va como reducción", () => {
  // El rubro se contrató por 8 y la liquidación mide 5: tres no se hicieron.
  const menos = loQueNoEstaPresupuestado(compararContraPresupuesto(
    [{ descripcion: "Vinil", cantidad: 5, unidad: "u", monto: 750, rubro_id: 1 }], rubros));
  assert.equal(menos.menos.length, 1);
  assert.equal(menos.menos[0].cantidad, 3);
  assert.equal(menos.menos[0].precioUnitario, 215.83);
  assert.equal(menos.aDevolver, 647.49);
  const p = partidasParaOrden(menos, 20);
  assert.equal(p[0].tipo, "quita");
  assert.equal(p[0].precio_unitario, 215.83);
});

test("una obra que solo informa los adicionales pierde credibilidad: se dicen los dos", () => {
  const mezcla = loQueNoEstaPresupuestado(compararContraPresupuesto([
    { descripcion: "Vinil", cantidad: 5, unidad: "u", monto: 750, rubro_id: 1 },
    { descripcion: "Perfilería", cantidad: 1, unidad: "glb", monto: 400, rubro_id: null },
  ], rubros));
  assert.match(comoSeDice(mezcla), /1 renglón que no está en el presupuesto y 1 rubro con menos de lo contratado/);
});

test("una diferencia sobre un rubro que vino de una orden se marca, para no cobrarla dos veces", () => {
  const h = loQueNoEstaPresupuestado(compararContraPresupuesto(
    [{ descripcion: "Vinil", cantidad: 12, unidad: "u", monto: 1800, rubro_id: 7 }],
    [{ id: 7, numero: "ADIC-01", descripcion: "Vinil en fachada", unidad: "u", cantidad: 8,
       total_base: 1726.64, origen: "orden_cambio", orden_cambio_id: 6 }]));
  assert.equal(h.demas.length, 1);
  assert.match(h.demas[0].deOrden, /ya venía de una orden de cambio/);
  assert.equal(h.sobreOrdenes.length, 1);
});

test("una diferencia sobre un rubro del contrato original no lleva esa marca", () => {
  const h = loQueNoEstaPresupuestado(compararContraPresupuesto(
    [{ descripcion: "Vinil", cantidad: 12, unidad: "u", monto: 1800, rubro_id: 1 }], rubros));
  assert.equal(h.demas[0].deOrden, null);
  assert.equal(h.sobreOrdenes.length, 0);
});

test("cada diferencia dice de qué tipo es, para poder decidirla distinto", () => {
  const h = loQueNoEstaPresupuestado(compararContraPresupuesto([
    { descripcion: "Perfilería", cantidad: 1, unidad: "glb", monto: 400, rubro_id: null },
    { descripcion: "Vinil", cantidad: 12, unidad: "u", monto: 1800, rubro_id: 1 },
  ], rubros));
  assert.equal(h.nuevos[0].hallazgo, "nuevo");
  assert.equal(h.demas[0].hallazgo, "mas_cantidad");
});

test("cómo va un análisis: lo que falta decidir y lo que ya se va a cobrar", async () => {
  const { comoVa } = await import("../src/modules/controlObra/cuentaDiferencias.js");
  const v = comoVa([
    { decision: "cobrar", monto: 115.56 },
    { decision: "cobrar", monto: 163.25 },
    { decision: "incluido", monto: 50 },
    { decision: "pendiente", monto: 20 },
  ]);
  assert.equal(v.total, 4);
  assert.equal(v.sinDecidir, 1);
  assert.equal(v.aCobrar, 2);
  assert.equal(v.monto, 278.81);
  assert.equal(v.listo, false);
});

test("decidido todo, el análisis queda listo para armar su orden", async () => {
  const { comoVa } = await import("../src/modules/controlObra/cuentaDiferencias.js");
  const v = comoVa([{ decision: "cobrar", monto: 100 }, { decision: "nuestro", monto: 30 }]);
  assert.equal(v.listo, true);
  assert.equal(v.monto, 100, "lo que se le cobra al cliente, no lo que pagamos nosotros");
});

// ── CANTIDAD Y PRECIO SON DOS DIFERENCIAS ──────────────────────────────────
//
// 12 U a $48,50 contratadas contra 16 U a $51,00 cotizadas. Mirar solo el
// total, o solo la cantidad, esconde la mitad.
// El rubro con su COSTO cargado: 12 U que costaban $48,50 cada una. Sin costo
// no hay contra qué comparar el precio —el del rubro es el de venta, y contra
// ese todo proveedor parece barato: esa diferencia es el margen—.
const conPrecio = [{ id: 1, numero: "4.12", descripcion: "Luminarias LED", unidad: "U",
  cantidad: 12, total_base: 816, costo_unitario: 48.5 }];
const propuesta = [{ descripcion: "Luminarias LED", cantidad: 16, unidad: "U", monto: 816, rubro_id: 1 }];
const dos = loQueNoEstaPresupuestado(compararContraPresupuesto(propuesta, conPrecio));

test("la cantidad de más se cobra, y se cobra aparte del precio", () => {
  assert.equal(dos.demas.length, 1);
  assert.equal(dos.demas[0].cantidad, 4);
  assert.equal(dos.demas[0].precioUnitario, 68, "al precio que el cliente firmó: 816/12");
});

test("el precio distinto aparece como su propia diferencia", () => {
  assert.equal(dos.otroPrecio.length, 1);
  // SOBRE LAS 12 DEL CONTRATO, NO SOBRE LAS 16 COTIZADAS: las 4 de más ya se
  // cuentan como cantidad, al precio que el cliente firmó. Medir el precio
  // sobre las 16 las contaría dos veces.
  assert.equal(dos.otroPrecio[0].costo, 30, "2,50 de más × las 12 que los dos tienen");
  assert.equal(dos.otroPrecio[0].sube, true);
  assert.match(dos.otroPrecio[0].por, /costaba \$48\.5 y ahora lo cotizan a \$51/);
});

test("el precio NO se le cobra al cliente: el del contrato está firmado", () => {
  assert.equal(dos.otroPrecio[0].precioUnitario, null);
});

test("mismo precio y otra cantidad: no inventa una diferencia de precio", () => {
  const h = loQueNoEstaPresupuestado(compararContraPresupuesto(
    [{ descripcion: "Luminarias LED", cantidad: 16, unidad: "U", monto: 776, rubro_id: 1 }], conPrecio));
  assert.equal(h.otroPrecio.length, 0);
  assert.equal(h.demas.length, 1);
});

test("misma cantidad y otro precio: antes no se veía en ningún lado", () => {
  const h = loQueNoEstaPresupuestado(compararContraPresupuesto(
    [{ descripcion: "Luminarias LED", cantidad: 12, unidad: "U", monto: 612, rubro_id: 1 }], conPrecio));
  assert.equal(h.demas.length, 0);
  assert.equal(h.menos.length, 0);
  assert.equal(h.otroPrecio.length, 1);
  assert.equal(h.otroPrecio[0].costo, 30);     // 2,50 × 12
});

test("un centavo de redondeo no es un cambio de precio", () => {
  const h = loQueNoEstaPresupuestado(compararContraPresupuesto(
    [{ descripcion: "Luminarias LED", cantidad: 12, unidad: "U", monto: 582.05, rubro_id: 1 }], conPrecio));
  assert.equal(h.otroPrecio.length, 0);
});

test("si el proveedor cotiza por DEBAJO del costo, eso es una eficiencia nuestra", () => {
  // Costaba 48,50 y ahora lo cotizan a 44: son 4,50 × 12 = 54 a favor de la
  // obra. No es una diferencia con el cliente —no se le cobra ni se le devuelve
  // nada—: es un beneficio, y vive en Beneficios.
  const h = loQueNoEstaPresupuestado(compararContraPresupuesto(
    [{ descripcion: "Luminarias LED", cantidad: 12, unidad: "U", monto: 528, rubro_id: 1 }], conPrecio));
  assert.equal(h.bajaron.length, 1);
  assert.equal(h.subieron.length, 0);
  assert.equal(h.eficiencia, 54);
  assert.equal(h.sobreprecio, 0);
  assert.equal(h.bajaron[0].hallazgo, "bajo_precio");
});

test("si cotiza por encima, se come el margen y la conversación es con el proveedor", () => {
  const h = loQueNoEstaPresupuestado(compararContraPresupuesto(
    [{ descripcion: "Luminarias LED", cantidad: 12, unidad: "U", monto: 612, rubro_id: 1 }], conPrecio));
  assert.equal(h.subieron.length, 1);
  assert.equal(h.sobreprecio, 30);
  assert.equal(h.eficiencia, 0);
  assert.equal(h.subieron[0].hallazgo, "subio_precio");
});

test("el ahorro y el sobreprecio se cuentan por separado: un neto esconde los dos", () => {
  const h = loQueNoEstaPresupuestado(compararContraPresupuesto([
    { descripcion: "Luminarias LED", cantidad: 12, unidad: "U", monto: 528, rubro_id: 1 },
    { descripcion: "Tablero", cantidad: 1, unidad: "U", monto: 150, rubro_id: 2 },
  ], [...conPrecio, { id: 2, numero: "4.13", descripcion: "Tablero", unidad: "U", cantidad: 1, total_base: 200, costo_unitario: 100 }]));
  assert.equal(h.eficiencia, 54);
  assert.equal(h.sobreprecio, 50);
});

test("la diferencia de precio aparece aunque la cantidad tambien haya cambiado", () => {
  // El rubro son 12 y la proforma trae 15, y encima a otro precio. Son DOS
  // hallazgos: tres de mas —que se le cobran al cliente al precio que firmo— y
  // un precio distinto en las que ya estaban. Antes el de cantidad tapaba al de
  // precio y el rubro salia como si solo hubiera cambiado la cantidad.
  const h = loQueNoEstaPresupuestado(compararContraPresupuesto(
    [{ descripcion: "Luminarias LED", cantidad: 15, unidad: "U", monto: 660, rubro_id: 1 }], conPrecio));
  assert.equal(h.demas.length, 1);
  // 44 contra 48,50 cargado: bajo 4,50, y sobre las 12 que los dos tienen.
  assert.equal(h.bajaron.length, 1);
  assert.equal(h.bajaron[0].cantidad, 12);
  assert.equal(h.eficiencia, 54);
});

test("la diferencia de precio se mide sobre la cantidad comun, no sobre la cotizada", () => {
  const h = loQueNoEstaPresupuestado(compararContraPresupuesto(
    [{ descripcion: "Luminarias LED", cantidad: 15, unidad: "U", monto: 900, rubro_id: 1 }], conPrecio));
  // 60 por unidad contra 48,50 cargado: subio 11,50 sobre las 12 del contrato.
  assert.equal(h.subieron.length, 1);
  assert.equal(h.subieron[0].cantidad, 12);
  assert.equal(h.sobreprecio, 138);
});
