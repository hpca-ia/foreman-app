import { test } from "node:test";
import assert from "node:assert/strict";

// La base no se toca acá: se prueba lo que decide con qué nombre y con qué tipo
// se le entrega al lector un archivo que ya estaba guardado en Compras. De eso
// depende que un PDF se lea como PDF y una foto como foto.
const fuente = await import("node:fs").then(fs => fs.readFileSync(
  new URL("../src/modules/controlObra/cotizacionesDeCompras.js", import.meta.url), "utf8"));
const sinBase = fuente.replace(/^import \{ supabase \} from "..\/..\/lib\/supabase";\n/, "const supabase = null;\n");
const { nombreDelArchivo, tipoDelArchivo } = await import(
  "data:text/javascript;base64," + Buffer.from(sinBase).toString("base64"));

test("el archivo se entrega con el nombre que le pusieron al subirlo", () => {
  assert.equal(nombreDelArchivo({ nombre: "Proforma kywi aeropuerto 01.pdf", storage_path: "compra-10/1-Proforma.pdf" }),
    "Proforma kywi aeropuerto 01.pdf");
  assert.equal(nombreDelArchivo({ nombre: "cotización pasajes.png", storage_path: "compra-15/2-x.png" }), "cotización pasajes.png");
});

test("si el nombre no trae extensión, se toma la de donde está guardado", () => {
  // Las fotos sacadas desde el teléfono llegan con un nombre que es un código.
  assert.equal(nombreDelArchivo({ nombre: "a23ee908-00ed-4ab7-82be-650e752d17", storage_path: "compra-22/17-a23ee908.jpg" }),
    "a23ee908-00ed-4ab7-82be-650e752d17.jpg");
  // Un punto en el medio del nombre no es una extensión.
  assert.equal(nombreDelArchivo({ nombre: "FACT MELBA BURGOS 192 HCARQ SA  07.10", storage_path: "compra-8/3-FACT.pdf" }),
    "FACT MELBA BURGOS 192 HCARQ SA  07.10.pdf");
  assert.equal(nombreDelArchivo({ nombre: "", storage_path: "compra-1/9-x.pdf" }), "cotizacion.pdf");
  assert.equal(nombreDelArchivo({ nombre: "sin nada", storage_path: "compra-1/9-x" }), "sin nada");
});

test("el tipo es el que guardó el almacenamiento, y si no dice nada, el de la extensión", () => {
  assert.equal(tipoDelArchivo("proforma.pdf", "application/pdf"), "application/pdf");
  assert.equal(tipoDelArchivo("proforma.pdf", ""), "application/pdf");
  assert.equal(tipoDelArchivo("foto.JPG", "application/octet-stream"), "image/jpeg");
  assert.equal(tipoDelArchivo("presupuesto.xlsx", ""), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.equal(tipoDelArchivo("raro.zzz", ""), "");
  assert.equal(tipoDelArchivo("foto.png", "image/webp"), "image/webp", "si el almacenamiento lo sabe, manda");
});
