import test from "node:test";
import assert from "node:assert/strict";
import { renglonesDeTexto, interpretarRespuesta, partirHoja, cuadrar } from "../src/modules/controlObra/leerProforma.js";

test("una proforma en líneas se vuelve renglones", () => {
  const r = renglonesDeTexto([
    "PROVEEDOR | Ferretería El Sol",
    "Cemento Holcim 50kg | 120 | sacos | 1.020,00 | 44",
    "Varilla corrugada 12mm | 80 | u | 960.50 | -",
  ].join("\n"));
  assert.equal(r.proveedor, "Ferretería El Sol");
  assert.equal(r.items.length, 2);
  assert.equal(r.items[0].monto, 1020);
  assert.equal(r.items[0].rubro_id, 44);
  assert.equal(r.items[1].monto, 960.5);
  assert.equal(r.items[1].rubro_id, null);
});

// Lo que un JSON cortado no deja: nada. Una proforma de 200 renglones que se
// corta en el 180 tiene que dejar 180 renglones que nadie copia a mano.
test("una respuesta cortada a la mitad deja lo que alcanzó a escribir", () => {
  const r = renglonesDeTexto([
    "Cemento | 10 | sacos | 100 | 1",
    "Arena | 5 | m3 | 75 | 2",
    "Varilla | 20 | u | 3",      // cortada: le falta un campo
  ].join("\n"));
  assert.equal(r.items.length, 3);           // la tercera entra como 4 campos, sin rubro
  assert.equal(r.items[2].rubro_id, null);
});

test("una descripción con barra adentro no corre las columnas", () => {
  const r = renglonesDeTexto("Tubo PVC 110mm | desagüe | 12 | u | 48,00 | 7");
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].descripcion, "Tubo PVC 110mm desagüe");
  assert.equal(r.items[0].monto, 48);
  assert.equal(r.items[0].rubro_id, 7);
});

test("ni el encabezado ni la basura entran como renglones", () => {
  const r = renglonesDeTexto([
    "Acá va la proforma:",
    "descripción | cantidad | unidad | monto | rubro_id",
    "",
    "Cemento | 10 | sacos | 100 | 1",
  ].join("\n"));
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].descripcion, "Cemento");
});

// Cambiar el formato no puede dejar sin leer una proforma por una costumbre.
test("si igual contesta en JSON, se lee en JSON", () => {
  const r = interpretarRespuesta('```json\n{"proveedor":"Disensa","items":[{"descripcion":"Bloque","cantidad":500,"unidad":"u","monto":325,"rubro_id":9}]}\n```');
  assert.equal(r.proveedor, "Disensa");
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].monto, 325);
  assert.equal(r.items[0].rubro_id, 9);
});

test("una planilla corta se manda de una sola vez", () => {
  const filas = Array.from({ length: 20 }, (_, i) => `fila ${i} | 1 | u | 10`).join("\n");
  assert.equal(partirHoja(filas, 60).length, 1);
  assert.deepEqual(partirHoja("", 60), []);
});

test("una planilla larga va por partes, y los títulos van en todas", () => {
  const lineas = ["--- hoja: Cotización ---", "DESCRIPCIÓN | CANT | UNIDAD | TOTAL", "Proveedor: Disensa"];
  for (let i = 0; i < 137; i++) lineas.push(`material ${i} | 1 | u | 10`);
  const bloques = partirHoja(lineas.join("\n"), 60);
  assert.equal(bloques.length, 3);
  for (const b of bloques) assert.match(b, /DESCRIPCIÓN \| CANT/);
  // Ningún renglón se pierde y ninguno se cuenta dos veces.
  const total = bloques.flatMap(b => renglonesDeTexto(b).items).filter(x => /^material /.test(x.descripcion));
  assert.equal(new Set(total.map(x => x.descripcion)).size, 137);
});

// UNA PLANILLA NO SE TRANSCRIBE: SE LEE. NOVA dice cuál columna es cuál —cuatro
// números— y las filas las lee el código, que no se queda sin espacio.
import { renglonesDeHoja, asignacionDeTexto } from "../src/modules/controlObra/leerProforma.js";

const MAPA = { fila_encabezado: 1, col_descripcion: 0, col_cantidad: 1, col_unidad: 2, col_total: 3 };
const HOJA = [
  ["PROFORMA 0012", "", "", ""],
  ["DESCRIPCIÓN", "CANT", "UNIDAD", "TOTAL"],
  ["Cemento Holcim 50kg", "120", "sacos", "1.020,00"],
  ["", "", "", ""],
  ["CAPÍTULO 2 — HIERRO", "", "", ""],
  ["Varilla corrugada 12mm", "80", "u", "960,50"],
  ["SUBTOTAL", "", "", "1980,50"],
  ["IVA 15%", "", "", "297,08"],
  ["TOTAL", "", "", "2277,58"],
];

test("las filas de la planilla se leen sin pasar por el modelo", () => {
  const r = renglonesDeHoja(HOJA, MAPA);
  assert.equal(r.length, 2);
  assert.equal(r[0].descripcion, "Cemento Holcim 50kg");
  assert.equal(r[0].monto, 1020);
  assert.equal(r[1].monto, 960.5);
});

// Sumar un subtotal contaría la proforma dos veces y el beneficio saldría del
// doble de lo que es.
test("los subtotales, el IVA y el total no son renglones", () => {
  const r = renglonesDeHoja(HOJA, MAPA);
  assert.equal(r.some(x => /total|iva/i.test(x.descripcion)), false);
  assert.equal(r.reduce((t, x) => t + x.monto, 0), 1980.5);
});

test("sin columnas reconocidas no se inventa nada", () => {
  assert.deepEqual(renglonesDeHoja(HOJA, { fila_encabezado: 1 }), []);
  assert.deepEqual(renglonesDeHoja([], MAPA), []);
});

test("el emparejamiento vuelve en corto y el guion no asigna", () => {
  const m = asignacionDeTexto("0:44\n1:-\n2: 19\nno entiendo esta línea\n3:7");
  assert.equal(m.get(0), 44);
  assert.equal(m.has(1), false);
  assert.equal(m.get(2), 19);
  assert.equal(m.get(3), 7);
});




test("el cuadre cuenta el descuento: los renglones van a precio de lista", () => {
  // El subtotal del papel ya viene descontado, asi que sin contarlo toda
  // proforma con descuento se denunciaba como mal leida.
  const c = cuadrar([{ monto: 600 }, { monto: 300 }, { monto: 100 }], { subtotal: 900 }, 100);
  assert.equal(c.cuadra, true);
  const malo = cuadrar([{ monto: 600 }, { monto: 300 }, { monto: 100 }], { subtotal: 900 }, 0);
  assert.equal(malo.cuadra, false);
});

test("si los renglones suman mas que el subtotal, esa diferencia es el descuento", () => {
  // En una proforma NOVA dijo el descuento y en la siguiente, el mismo papel,
  // no lo dijo: los renglones sumaban mil dolares mas que el subtotal y eso se
  // denunciaba como "se leyo de mas". Lo que pasa es lo que dice el papel.
  const items = [{ monto: 600 }, { monto: 300 }, { monto: 150 }];
  // 1.050 de renglones contra 1.000 de subtotal: 50 de descuento.
  const c = cuadrar(items, { subtotal: 1000 }, 50);
  assert.equal(c.cuadra, true);
  // Sin contarlo, el mismo papel se lee como mal leido.
  assert.equal(cuadrar(items, { subtotal: 1000 }, 0).cuadra, false);
});

test("el pie del papel se lee solo, y de ahi sale el descuento", async () => {
  const { pieDeTexto } = await import("../src/modules/controlProforma.js").catch(() => import("../src/modules/controlObra/leerProforma.js"));
  const p = pieDeTexto("SUBTOTAL | 12.237,99\nDESCUENTO | 1.049,41\nIVA | 1.835,70\nTOTAL | 13.024,28");
  assert.equal(p.subtotal, 12237.99);
  assert.equal(p.descuento, 1049.41);
  assert.equal(p.total, 13024.28);
  // Lo que no aparece viene con guion y no se inventa.
  const sin = pieDeTexto("SUBTOTAL | 100\nDESCUENTO | -\nIVA | -\nTOTAL | 115");
  assert.equal(sin.descuento, null);
});

test("el pie trae la fecha del documento, que es lo que distingue dos del mismo proveedor", async () => {
  const { pieDeTexto } = await import("../src/modules/controlObra/leerProforma.js");
  const p = pieDeTexto("FECHA | 2026-08-31\nSUBTOTAL | 12.237,99\nDESCUENTO | -\nIVA | -\nTOTAL | -");
  assert.equal(p.fecha, "2026-08-31");
  assert.equal(p.subtotal, 12237.99);
  // Sin fecha legible no se inventa una.
  assert.equal(pieDeTexto("FECHA | -\nSUBTOTAL | 100").fecha, undefined);
});

test("las columnas de un Excel se encuentran sin preguntarle a un modelo", async () => {
  // La proforma de octubre tiene 42 renglones con monto y el modelo devolvio
  // 28. Lo peor es que no se notaba: la pantalla mostraba "esto lo cotiza uno
  // solo" sobre renglones que estaban en los dos papeles.
  const { columnasDeHoja, renglonesDeHoja } = await import("../src/modules/controlObra/leerProforma.js");
  const filas = [
    ["PROFORMA N° 53"],
    [],
    ["ITEM", "D E S C R I P C I Ó N", "UNIDAD", "CANTIDAD", "PRECIO UNITARIO", "TOTAL"],
    [1, "Punto de iluminación con tubería EMT", "U", 65, 33.07, 2149.81],
    [2, "Breaker 1P-16A", "U", 20, 10.45, 209.07],
    [],
    ["", "SUBTOTAL", "", "", "", 2358.88],
  ];
  const m = columnasDeHoja(filas);
  assert.equal(m.fila_encabezado, 2);
  assert.equal(m.col_descripcion, 1);
  assert.equal(m.col_cantidad, 3);
  assert.equal(m.col_total, 5);
  const items = renglonesDeHoja(filas, m);
  assert.equal(items.length, 2);                 // el subtotal no es un renglon
  assert.equal(items[0].cantidad, 65);
  assert.equal(items[0].monto, 2149.81);
});

test("sin encabezados reconocibles no inventa un mapa: se le pregunta al modelo", async () => {
  const { columnasDeHoja } = await import("../src/modules/controlObra/leerProforma.js");
  assert.equal(columnasDeHoja([["a", "b"], [1, 2]]), null);
});

test("la aritmetica del papel dice si se leyo bien", async () => {
  const { revisarLectura } = await import("../src/modules/controlObra/leerProforma.js");
  const items = [
    { descripcion: "Punto de iluminacion", cantidad: 65, unitario: 33.07, monto: 2149.55 },
    { descripcion: "Breaker", cantidad: 20, unitario: 10.45, monto: 209 },
  ];
  const r = revisarLectura(items, { subtotal: 2358.55 });
  assert.equal(r.cuadra, true);
  assert.equal(r.confiable, true);
  assert.match(r.conclusion, /suman exactamente lo que dice el papel/);
});

test("si falta un renglon, la suma lo denuncia con el monto", async () => {
  // Es la comprobacion que descubrio que una planilla de 42 renglones se habia
  // leido con 28: un renglon que falta no se ve faltar, se ve como un dato.
  const { revisarLectura } = await import("../src/modules/controlObra/leerProforma.js");
  const r = revisarLectura([{ cantidad: 20, unitario: 10.45, monto: 209 }], { subtotal: 2358.55 });
  assert.equal(r.cuadra, false);
  assert.match(r.conclusion, /FALTAN \$2149\.55/);
  assert.equal(r.confiable, false);
});

test("un renglon que no multiplica se leyo mal, aunque el total cuadre", async () => {
  // Una coma corrida en el unitario deja un numero que sigue pareciendo un
  // numero, y no se ve mirando la lista.
  const { revisarLectura } = await import("../src/modules/controlObra/leerProforma.js");
  const r = revisarLectura([{ descripcion: "Cable", cantidad: 100, unitario: 40, monto: 400 }], null);
  assert.equal(r.malos.length, 1);
  assert.equal(r.malos[0].dice, 4000);
  assert.equal(r.malos[0].pero, 400);
  assert.equal(r.confiable, false);
  assert.match(r.conclusion, /no multiplica/);
});

test("el descuento del pie no se cuenta como un renglon que falta", async () => {
  const { revisarLectura } = await import("../src/modules/controlObra/leerProforma.js");
  const r = revisarLectura([{ monto: 1000 }], { subtotal: 900 }, 100);
  assert.equal(r.cuadra, true);
});

test("lee los renglones con unitario y tambien los de cinco campos", async () => {
  // Negarse a leer una proforma por una columna de mas o de menos es tirar la
  // lectura entera por un dato que se puede deducir dividiendo.
  const { renglonesDeTexto } = await import("../src/modules/controlObra/leerProforma.js");
  const con = renglonesDeTexto("PROVEEDOR | SOLEK\nPunto de iluminacion | 65 | U | 33.07 | 2149.55 | 106");
  assert.equal(con.items[0].unitario, 33.07);
  assert.equal(con.items[0].monto, 2149.55);
  assert.equal(con.items[0].rubro_id, 106);
  const sin = renglonesDeTexto("PROVEEDOR | SOLEK\nPunto de iluminacion | 65 | U | 2149.55 | 106");
  assert.equal(sin.items[0].unitario, null);
  assert.equal(sin.items[0].monto, 2149.55);
  assert.equal(sin.items[0].rubro_id, 106);
});

test("una celda con letras no es un numero", async () => {
  // Las proformas escriben el total en letras al pie —"CATORCE MIL ... CON
  // 50/100"— y el lector sacaba de ahi un 50100. Esa fila entro dos veces como
  // renglon y el total de la comparacion paso a decir cien mil dolares que no
  // existen en ningun papel.
  const { numeroDeCelda, columnasDeHoja, renglonesDeHoja } =
    await import("../src/modules/controlObra/leerProforma.js");
  assert.equal(numeroDeCelda("CATORCE MIL NOVECIENTOS VEINTE Y SIETE DOLARES CON 50/100"), 0);
  assert.equal(numeroDeCelda("$ 1.234,56"), 1234.56);
  assert.equal(numeroDeCelda("USD 900"), 900);
  assert.equal(numeroDeCelda(2149.81), 2149.81);

  const filas = [
    ["ITEM", "DESCRIPCION", "UNIDAD", "CANTIDAD", "P. UNITARIO", "TOTAL"],
    [1, "Punto de iluminacion", "U", 65, 33.07, 2149.81],
    ["", "SON: CATORCE MIL DOLARES CON 50/100", "", "CATORCE MIL", "", "CATORCE MIL DOLARES CON 50/100"],
  ];
  const items = renglonesDeHoja(filas, columnasDeHoja(filas));
  assert.equal(items.length, 1);
});
