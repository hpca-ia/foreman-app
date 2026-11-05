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

// ── UN RENGLÓN DEL PAPEL ES UNA SOLA SITUACIÓN ─────────────────────────────
//
// 12 U a $48,50 contratadas contra 16 U a $51,00 cotizadas. Es una diferencia
// de CANTIDAD —4 de más, que van a la orden— y nada más. Antes salía dos
// veces, una por la cantidad y otra por el precio, y eso duplicaba lo que se
// decidía y lo que iba a la orden. El precio distinto se dice en la misma
// tarjeta (ver precioSobreLoContratado), sin abrir otra diferencia.
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

test("con otra cantidad el renglón sale UNA vez: no se repite como diferencia de precio", () => {
  assert.equal(dos.otroPrecio.length, 0);
  assert.equal(dos.subieron.length, 0);
  assert.equal(dos.todo.length, 1, "una sola diferencia para decidir");
  assert.equal(partidasParaOrden(dos, 20).length, 1, "y una sola partida en la orden");
});

test("el precio de ese renglón se dice sobre la cantidad ya contratada, sin abrir otra diferencia", async () => {
  const { precioSobreLoContratado } = await import("../src/modules/controlObra/cuentaDiferencias.js");
  const d = dos.demas[0];
  const linea = { hallazgo: d.hallazgo, cantidad_papel: d.cantidadPapel, monto_papel: d.montoPapel, unidad: d.unidad };
  // SOBRE LAS 12 DEL CONTRATO, NO SOBRE LAS 16 COTIZADAS: las 4 de más ya se
  // cuentan como cantidad, al precio que el cliente firmó.
  const p = precioSobreLoContratado(linea, conPrecio[0], 68);
  assert.equal(p.comun, 12);
  assert.equal(p.monto, 30, "2,50 de más × las 12 que los dos tienen");
  assert.equal(p.sube, true, "subió: es una alerta para conversar con el proveedor");
  assert.equal(p.contraPrecio, false, "contra el costo cargado");
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

test("mas cantidad y ademas mas barato: una diferencia, y la eficiencia se dice en ella", async () => {
  // El rubro son 12 y la proforma trae 15, y encima mas baratas. Es UNA
  // situacion: tres de mas, que van a la orden. Lo que el precio nuevo deja
  // sobre las 12 que ya estaban es eficiencia del proyecto, y lo dice la misma
  // tarjeta: no es otra diferencia que decidir.
  const { precioSobreLoContratado } = await import("../src/modules/controlObra/cuentaDiferencias.js");
  const h = loQueNoEstaPresupuestado(compararContraPresupuesto(
    [{ descripcion: "Luminarias LED", cantidad: 15, unidad: "U", monto: 660, rubro_id: 1 }], conPrecio));
  assert.equal(h.demas.length, 1);
  assert.equal(h.bajaron.length, 0);
  assert.equal(h.todo.length, 1);
  // 44 contra 48,50 cargado: bajo 4,50, y sobre las 12 que los dos tienen.
  const d = h.demas[0];
  const p = precioSobreLoContratado(
    { hallazgo: "mas_cantidad", cantidad_papel: d.cantidadPapel, monto_papel: d.montoPapel }, conPrecio[0], 68);
  assert.equal(p.comun, 12);
  assert.equal(p.monto, 54);
  assert.equal(p.sube, false);
});

test("la diferencia de precio se mide sobre la cantidad comun, no sobre la cotizada", async () => {
  const h = loQueNoEstaPresupuestado(compararContraPresupuesto(
    [{ descripcion: "Luminarias LED", cantidad: 15, unidad: "U", monto: 900, rubro_id: 1 }], conPrecio));
  // 60 por unidad contra 48,50 cargado: subio 11,50 sobre las 12 del contrato.
  // No es otra diferencia: es la alerta que lleva la tarjeta de la cantidad.
  assert.equal(h.subieron.length, 0);
  assert.equal(h.sobreprecio, 0);
  const { precioSobreLoContratado } = await import("../src/modules/controlObra/cuentaDiferencias.js");
  const d = h.demas[0];
  const p = precioSobreLoContratado(
    { hallazgo: "mas_cantidad", cantidad_papel: d.cantidadPapel, monto_papel: d.montoPapel }, conPrecio[0], 68);
  assert.equal(p.comun, 12);
  assert.equal(p.monto, 138);
  assert.equal(p.sube, true);
});

test("revisado no es decidido: una mirada y dejada a proposito no es una sin abrir", async () => {
  // Las dos se veian igual en la pantalla, asi que al volver al dia siguiente
  // no habia forma de saber donde se habia quedado uno: se empezaba de nuevo
  // desde arriba, y por eso los ultimos renglones no los revisaba nadie.
  const { comoVa } = await import("../src/modules/controlObra/cuentaDiferencias.js");
  const v = comoVa([
    { decision: "cobrar" },
    { decision: "pendiente", revisado_at: "2026-11-01T10:00:00Z", nota: "hablar con Jorge el lunes" },
    { decision: "pendiente" },
    { decision: "pendiente" },
  ]);
  assert.equal(v.sinDecidir, 3);
  assert.equal(v.revisadas, 2);          // la decidida cuenta como revisada
  assert.equal(v.miradasSinDecidir, 1);
  assert.equal(v.sinMirar, 2);
  assert.equal(v.anotadas, 1);
});

test("al señalarle el rubro, el renglon deja de ser trabajo nuevo", async () => {
  // Un renglon sin rubro entra como nuevo, y esta bien. Pero cuando alguien le
  // señala el rubro a mano, el contrato SI lo cubre: lo que corresponde cobrar
  // —o lo que queda a favor— es la diferencia, no el monto entero.
  const { recalcularContra } = await import("../src/modules/controlObra/cuentaDiferencias.js");
  const rubro = { cantidad: 1, unidad: "U", total_base: 195.78, iva_pct: 15 };
  // El tablero: contratado a $170,24 sin IVA y cotizado a $154,76.
  const r = recalcularContra({ cantidad_papel: 1, monto_papel: 154.76 }, rubro, 170.24);
  assert.equal(r.hallazgo, "bajo_precio");
  assert.equal(r.monto, 15.48);
  assert.match(r.por, /el cliente lo vio a \$170\.24/);
});

test("con costo cargado, la vara es el costo y no el precio al cliente", async () => {
  const { recalcularContra } = await import("../src/modules/controlObra/cuentaDiferencias.js");
  const rubro = { cantidad: 1, unidad: "U", costo_unitario: 140 };
  const r = recalcularContra({ cantidad_papel: 1, monto_papel: 154.76 }, rubro, 170.24);
  assert.equal(r.hallazgo, "subio_precio");
  assert.equal(r.monto, 14.76);
  assert.match(r.por, /costaba \$140/);
});

test("si contra ese rubro calza, no hay diferencia que mostrar", async () => {
  const { recalcularContra } = await import("../src/modules/controlObra/cuentaDiferencias.js");
  assert.equal(recalcularContra({ cantidad_papel: 1, monto_papel: 170.24 },
    { cantidad: 1, unidad: "U" }, 170.24), null);
});

test("y si cambia la cantidad, vuelve a ser una diferencia de cantidad", async () => {
  const { recalcularContra } = await import("../src/modules/controlObra/cuentaDiferencias.js");
  const r = recalcularContra({ cantidad_papel: 12, monto_papel: 600 }, { cantidad: 8, unidad: "U" }, 50);
  assert.equal(r.hallazgo, "mas_cantidad");
  assert.equal(r.cantidad, 4);
  assert.equal(r.monto, 200);
});

test("lo que se devuelve no se suma con lo que se cobra", async () => {
  // Un renglon con menos cantidad decidido "se cobra" quiere decir que entra en
  // la orden COMO REDUCCION, no que le sumamos plata al cliente. En el mismo
  // total, el titular decia que se le cobran $500 cuando se le cobran $300 y se
  // le devuelven $200: otra conversacion.
  const { comoVa } = await import("../src/modules/controlObra/cuentaDiferencias.js");
  const v = comoVa([
    { hallazgo: "nuevo", decision: "cobrar", monto: 300 },
    { hallazgo: "menos_cantidad", decision: "cobrar", monto: 200 },
  ]);
  assert.equal(v.aCobrar, 1);
  assert.equal(v.monto, 300);
  assert.equal(v.aDevolver, 1);
  assert.equal(v.montoDevuelto, 200);
  // Las dos entran en la orden: una suma y la otra resta.
  assert.equal(v.enLaOrden, 2);
});

test("al emparejar se dice si la orden va a ser de mas o de menos", async () => {
  // Emparejar no es solo decir "este renglon es ese rubro": es decidir si la
  // orden de cambio va a ser de mas o de menos, y eso se decide en ese momento.
  const { queSaleDe } = await import("../src/modules/controlObra/cuentaDiferencias.js");
  const rubro = { cantidad: 65, unidad: "U", total_base: 2149.81 };
  const pu = 2149.81 / 65;
  assert.match(queSaleDe({ cantidad_papel: 111, monto_papel: 3671.21 }, rubro, pu), /46 U de MÁS/);
  assert.match(queSaleDe({ cantidad_papel: 40, monto_papel: 1322.96 }, rubro, pu), /25 U de MENOS/);
  assert.match(queSaleDe({ cantidad_papel: 65, monto_papel: 2000 }, rubro, pu), /a favor/);
  assert.equal(queSaleDe({ cantidad_papel: 1 }, null, 0), "entra como trabajo nuevo");
});

test("dos renglones al mismo precio sobre un rubro se suman; a precios distintos, uno vuelve sin rubro", async () => {
  const { agruparPorRubro } = await import("../src/modules/controlObra/extraParaCobrar.js");
  const rubro = { id: 111, descripcion: "Punto de tomacorriente doble normal", cantidad: 30, unidad: "U" };
  const juntos = agruparPorRubro([
    { descripcion: "Punto de tomacorriente doble normal", cantidad: 70, cotizado: 2339.33, puProforma: 33.42, puRubro: 36.76, rubro, cantidadRubro: 30, unidadRubro: "U" },
    { descripcion: "Punto de tomacorriente doble EN PISO", cantidad: 2, cotizado: 66.84, puProforma: 33.42, puRubro: 36.76, rubro, cantidadRubro: 30, unidadRubro: "U" },
  ]);
  assert.equal(juntos.length, 1);
  assert.equal(juntos[0].cantidad, 72);
  assert.equal(juntos[0].cotizado, 2406.17);
  assert.match(juntos[0].porJuntos, /70 \+ 2 = 72/);
  // 111 puntos de luz a $33,07 y 3 puntos de sensor a $19,77 sobre el rubro de
  // 65: el sensor no es el mismo trabajo, y antes salía "62 de menos".
  const luz = { id: 106, descripcion: "Punto de iluminación", cantidad: 65, unidad: "U" };
  const aparte = agruparPorRubro([
    { descripcion: "Punto de iluminación", cantidad: 111, cotizado: 3671.21, puProforma: 33.07, puRubro: 36.38, rubro: luz, cantidadRubro: 65 },
    { descripcion: "Punto para Sensor de iluminación", cantidad: 3, cotizado: 59.31, puProforma: 19.77, puRubro: 36.38, rubro: luz, cantidadRubro: 65 },
  ]);
  assert.equal(aparte.length, 2);
  assert.equal(aparte[0].cantidad, 111);
  assert.equal(aparte[0].rubro, luz);
  assert.equal(aparte[1].rubro, null);
  assert.match(aparte[1].dudoso, /otro trabajo/);
});
