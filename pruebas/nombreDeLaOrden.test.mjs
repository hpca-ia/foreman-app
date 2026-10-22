import test from "node:test";
import assert from "node:assert/strict";
import { codigoDe, nombreDelArchivo } from "../src/modules/controlObra/nombreOrden.js";

// El archivo que se baja y se le manda al cliente se guarda en la carpeta del
// proyecto. Si todas las órdenes se llaman igual, hay que abrirlas una por una.

test("el archivo se llama como la orden: código y título", () => {
  assert.equal(
    nombreDelArchivo({ numero: 3, titulo: "Cambio de ventanería al eje 4" }),
    "OC-03 - Cambio de ventanería al eje 4",
  );
});

test("respeta el código que la orden ya tiene", () => {
  assert.equal(nombreDelArchivo({ codigo: "OC-DLC-07", titulo: "Piso pulido" }), "OC-DLC-07 - Piso pulido");
});

test("sin título queda el código solo, no un guión colgado", () => {
  assert.equal(nombreDelArchivo({ numero: 1, titulo: "   " }), "OC-01");
  assert.equal(nombreDelArchivo({ numero: 1 }), "OC-01");
});

test("lo que el sistema de archivos no acepta no viaja en el nombre", () => {
  assert.equal(
    nombreDelArchivo({ numero: 2, titulo: 'Rediseño baño 2/3: "losa" <nueva>' }),
    "OC-02 - Rediseño baño 2-3- -losa- -nueva-",
  );
});

test("un título kilométrico no hace un nombre de archivo impronunciable", () => {
  const largo = nombreDelArchivo({ numero: 4, titulo: "A".repeat(200) });
  assert.ok(largo.length <= 8 + 80, largo);
});

test("una orden sin número no se llama OC-undefined", () => {
  assert.equal(codigoDe({}), "OC-00");
  assert.equal(codigoDe(null), "OC-00");
});
