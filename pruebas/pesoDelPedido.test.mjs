import test from "node:test";
import assert from "node:assert/strict";
import { noEntraElArchivo, TECHO_PEDIDO } from "../src/lib/imagenes.js";

// Vercel corta el pedido en 4,5 MB y devuelve su página de error en HTML. El
// navegador la lee como si fueran datos y escupe «Unexpected token 'A'...»,
// que hace pensar que se rompió el programa entero.

const base64De = bytes => "x".repeat(bytes);

test("un archivo que entra no dice nada", () => {
  assert.equal(noEntraElArchivo(base64De(1e6), { size: 750000, type: "image/jpeg" }), "");
  assert.equal(noEntraElArchivo("", { size: 0 }), "");
  assert.equal(noEntraElArchivo(null, null), "");
});

test("se mide lo que viaja —el base64— y no el archivo en disco", () => {
  // 3,5 MB en disco son 4,7 MB en base64: el archivo parece entrar y no entra.
  const aviso = noEntraElArchivo(base64De(TECHO_PEDIDO + 1), { size: 3.5e6, type: "application/pdf" });
  assert.notEqual(aviso, "");
});

test("al PDF se le dice qué hacer, porque no se puede achicar en el navegador", () => {
  const aviso = noEntraElArchivo(base64De(8e6), { size: 6 * 1024 * 1024, type: "application/pdf" });
  assert.match(aviso, /6\.0 MB/);
  assert.match(aviso, /hojas que tienen los precios/);
});

test("el peso que se nombra es el del archivo, que es el que la persona ve", () => {
  const aviso = noEntraElArchivo(base64De(8e6), { size: 5.2 * 1024 * 1024, type: "image/png" });
  assert.match(aviso, /5\.2 MB/);
  assert.doesNotMatch(aviso, /undefined|NaN/);
});
