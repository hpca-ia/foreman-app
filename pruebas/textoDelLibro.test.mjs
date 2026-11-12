// El texto del libro de obra en el PDF: que entre en la hoja, a lo ancho y a lo alto.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { seguro, partirTexto, tandasDeRenglones } from "../src/lib/textoDelPdf.js";

const { jsPDF } = createRequire(import.meta.url)("jspdf");
const hoja = () => new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
const ANCHO = 595.28 - 40 * 2 - 10;   // el de una entrada del libro

// Una entrada de verdad del libro del Aeropuerto: pegada desde Word, sin
// saltos de línea, de un tirón.
const ENTRADA = "REUNIÓN DE COORDINACIÓN DE INTERFERENCIAS TÉCNICAS: se llevó a cabo una reunión virtual (Meet) con la "
  + "participación de Angie Jaramillo, Nathalie Gabilanez, Lizeth De La Cruz, Estefania Reyes y representantes de PROEFICAZ, "
  + "en la cual se revisaron las interferencias entre los sistemas de iluminación, HVAC y rociadores, acordando las siguientes "
  + "resoluciones:   Alineación de ingenierías: se determinó que todos los sistemas se coordinan sobre el plano de cielo raso.";

test("el caso que rompía el libro: partido con la letra de la firma y escrito con la de la entrada, se sale de la hoja", () => {
  const doc = hoja();
  // Como estaba: la letra que dejó la firma de la entrada anterior.
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
  const mal = doc.splitTextToSize(seguro(ENTRADA), ANCHO);
  doc.setFontSize(9.5);
  const pasados = mal.filter(l => doc.getTextWidth(l) > ANCHO);
  assert.ok(pasados.length > 0, "así se pasaba del margen");
  assert.ok(Math.max(...mal.map(l => doc.getTextWidth(l))) > ANCHO + 100, "y por más de cien puntos");
});

test("partido con su letra, ningún renglón es más ancho que la hoja", () => {
  const doc = hoja();
  // Aunque antes haya quedado puesta otra letra, más chica.
  doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
  const lineas = partirTexto(doc, ENTRADA, ANCHO, "normal", 9.5);
  assert.ok(lineas.length >= 4);
  // Queda puesta la letra con la que se midió: lo que se escriba enseguida sale con ella.
  assert.equal(doc.getFontSize(), 9.5);
  assert.equal(doc.getFont().fontStyle, "normal");
  lineas.forEach(l => assert.ok(doc.getTextWidth(l) <= ANCHO + 0.01, `se pasa: ${l}`));
  // Y no se pierde ni una palabra.
  assert.equal(lineas.join(" ").replace(/\s+/g, " ").trim(), seguro(ENTRADA).replace(/\s+/g, " ").trim());
});

test("con cualquier letra anterior da los mismos renglones: ya no depende de lo que se escribió antes", () => {
  const con = (estilo, letra) => { const d = hoja(); d.setFont("helvetica", estilo); d.setFontSize(letra); return partirTexto(d, ENTRADA, ANCHO, "normal", 9.5); };
  assert.deepEqual(con("normal", 7.5), con("bold", 24));
  assert.deepEqual(con("normal", 7.5), con("italic", 9));
});

test("una palabra sola más larga que la hoja también se parte", () => {
  const doc = hoja();
  const lineas = partirTexto(doc, "x".repeat(400), ANCHO, "normal", 9.5);
  assert.ok(lineas.length > 1);
  lineas.forEach(l => assert.ok(doc.getTextWidth(l) <= ANCHO + 0.01));
});

test("lo que el PDF no sabe escribir se cambia por lo que sí: comillas, rayas, tabuladores", () => {
  assert.equal(seguro("«Losa» — “nivel +3,20” – ‘ok’"), '"Losa" - "nivel +3,20" - \'ok\'');
  assert.equal(seguro("o\tActividad realizada"), "o Actividad realizada");
  assert.equal(seguro("a b"), "a b");
  assert.equal(seguro(null), "");
});

// ── A lo alto ──────────────────────────────────────────────────────────────
// Hoja A4: se escribe desde 44 hasta 792 (842 − 50). Renglones de 11 puntos.
const HOJA = { paso: 11, techo: 44, piso: 792 };

test("lo que entra en lo que queda de la hoja va ahí, de una", () => {
  assert.deepEqual(tandasDeRenglones({ ...HOJA, cuantos: 10, y: 300, cola: 14 }), [{ desde: 0, hasta: 10, hojaNueva: false }]);
});

test("lo que no entra abajo pero sí en una hoja pasa entero a la siguiente, con su firma", () => {
  // Quedan 92 puntos: entran 8 renglones, no los 10 con su firma.
  assert.deepEqual(tandasDeRenglones({ ...HOJA, cuantos: 10, y: 700, cola: 14 }), [{ desde: 0, hasta: 10, hojaNueva: true }]);
  // Si los renglones entran justo pero la firma no, también pasa entera.
  assert.deepEqual(tandasDeRenglones({ ...HOJA, cuantos: 8, y: 700, cola: 14 }), [{ desde: 0, hasta: 8, hojaNueva: true }]);
});

test("una entrada más larga que una hoja se escribe hasta donde alcanza el papel y sigue en la otra", () => {
  // En una hoja vacía entran 68 renglones. Con 150, desde la mitad de la hoja:
  const t = tandasDeRenglones({ ...HOJA, cuantos: 150, y: 400, cola: 14 });
  assert.deepEqual(t, [
    { desde: 0, hasta: 35, hojaNueva: false },     // lo que queda de esta
    { desde: 35, hasta: 103, hojaNueva: true },    // una hoja entera
    { desde: 103, hasta: 150, hojaNueva: true },   // y el resto
  ]);
  // Ningún renglón queda debajo del margen, y no falta ni sobra ninguno.
  let y = 400;
  for (const x of t) {
    if (x.hojaNueva) y = HOJA.techo;
    y += (x.hasta - x.desde) * HOJA.paso;
    assert.ok(y <= HOJA.piso, `se pasó por abajo: ${y}`);
  }
  assert.equal(t.reduce((n, x) => n + x.hasta - x.desde, 0), 150);
});

test("al pie mismo de la hoja, donde no entra ni un renglón, arranca en la siguiente", () => {
  assert.deepEqual(tandasDeRenglones({ ...HOJA, cuantos: 150, y: 790, cola: 14 })[0], { desde: 0, hasta: 68, hojaNueva: true });
  assert.deepEqual(tandasDeRenglones({ ...HOJA, cuantos: 0, y: 100 }), []);
});
