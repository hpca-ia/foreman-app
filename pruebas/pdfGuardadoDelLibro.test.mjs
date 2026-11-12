// El PDF guardado de cada día del libro: cuál sirve y cuál hay que rehacer.
import test from "node:test";
import assert from "node:assert/strict";
import { VERSION_DEL_DIBUJO, rutaDelPdfDelDia, versionDelPdf, pdfAlDia, pdfViejo } from "../src/modules/libro/pdfGuardado.js";

// Como están guardados hoy los del Aeropuerto: sin versión en el nombre.
const VIEJO = "libro/15/dia-2026-10-08-1760568224449.pdf";

test("un PDF guardado antes de llevar versión es del dibujo viejo, y hay que rehacerlo", () => {
  assert.equal(versionDelPdf(VIEJO), 1);
  assert.equal(pdfAlDia({ pdf_url: VIEJO }), false);
  assert.equal(pdfViejo({ pdf_url: VIEJO }), true);
});

test("el que se guarda ahora lleva la versión del dibujo, y ese sí se muestra", () => {
  const ruta = rutaDelPdfDelDia({ lead_id: 15, fecha: "2026-10-08T05:00:00.000Z" }, 1794500000000);
  assert.equal(ruta, `libro/15/dia-2026-10-08-1794500000000-v${VERSION_DEL_DIBUJO}.pdf`);
  assert.equal(versionDelPdf(ruta), VERSION_DEL_DIBUJO);
  assert.equal(pdfAlDia({ pdf_url: ruta }), true);
  assert.equal(pdfViejo({ pdf_url: ruta }), false);
});

test("un día sin PDF guardado no es viejo: es que no tiene", () => {
  assert.equal(pdfAlDia({ pdf_url: null }), false);
  assert.equal(pdfViejo({ pdf_url: null }), false);
  assert.equal(pdfViejo(null), false);
});

test("cuando el dibujo vuelva a cambiar, los de la versión anterior también se rehacen", () => {
  const anterior = `libro/15/dia-2026-10-08-1794500000000-v${VERSION_DEL_DIBUJO - 1}.pdf`;
  assert.equal(pdfViejo({ pdf_url: anterior }), VERSION_DEL_DIBUJO - 1 < VERSION_DEL_DIBUJO);
  const siguiente = `libro/15/dia-2026-10-08-1794500000000-v${VERSION_DEL_DIBUJO + 1}.pdf`;
  assert.equal(pdfAlDia({ pdf_url: siguiente }), true);
});

test("la versión se lee aunque la dirección traiga algo después del nombre, y no se confunde con la fecha", () => {
  assert.equal(versionDelPdf("https://x.test/libro/15/dia-2026-10-08-1-v2.pdf?token=abc"), 2);
  // «-2026» o el momento no son una versión.
  assert.equal(versionDelPdf("libro/15/dia-2026-10-08-1760568224449.pdf"), 1);
  assert.equal(versionDelPdf(""), 1);
});
