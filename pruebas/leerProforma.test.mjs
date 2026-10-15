import test from "node:test";
import assert from "node:assert/strict";
import { renglonesDeTexto, interpretarRespuesta, partirHoja } from "../src/modules/controlObra/leerProforma.js";

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
