// El formato de los demás PDF de FOREMAN, revisados uno por uno el 16/11/2026
// con datos reales (Hernán: «revisa el formato de todos los pdfs que salen de
// foreman»). Lo que se encontró y no puede volver.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const leer = ruta => readFileSync(new URL(ruta, import.meta.url), "utf8");
const codigoDe = ruta => leer(ruta).split("\n").filter(l => !l.trim().startsWith("//")).join("\n");

test("los reportes —planilla, caja chica, rol— llevan el logo y parten un título largo", () => {
  const c = codigoDe("../src/lib/exportar.js");
  assert.match(c, /const logo = await logoDeLaCasa\(\);/);
  assert.match(c, /doc\.addImage\(logo\.dataUrl, "PNG", ancho - 40 - anchoLogo, 27, anchoLogo, alto\);/);
  assert.match(c, /partirTexto\(doc, titulo, lugar, "bold", 15, medible\)/);
  // El logo se pide al armar: este archivo se sigue pudiendo cargar sin la base.
  assert.doesNotMatch(c, /^import .*from "\.\/logos"/m);
});

test("el rol se imprime para firmar: la firma es la columna ancha, cada fila con su alto, y la plata con su formato", () => {
  const c = codigoDe("../src/modules/manoDeObra/exportarRol.js");
  assert.doesNotMatch(c, /anchos: \[60, 120, 28, 52, 58, 56, 58, 90\]/);
  assert.match(c, /7: \{ cellWidth: 190 \}/);
  assert.match(c, /altoFila: 30/);
  assert.match(c, /\{ label: "A pagar", valor: `\$\$\{money\(nomina\.aPagar\)\}` \}/);
  assert.match(codigoDe("../src/lib/exportar.js"), /b\.altoFila \? \{ minCellHeight: b\.altoFila, valign: "middle" \}/);
});

test("caja chica y la planilla escriben la descripción entera, no cortada a media palabra", () => {
  const caja = codigoDe("../src/modules/cajaChica/ReporteCaja.jsx");
  assert.doesNotMatch(caja, /descripcion \|\| ""\)\.slice\(0, (55|45)\)/);
  assert.doesNotMatch(caja, /devuelto_motivo \|\| "—"\)\.slice/);
  assert.doesNotMatch(codigoDe("../src/modules/controlObra/ExportarPlanilla.jsx"), /f\.detalle \|\| ""\)\.slice\(0, 60\)/);
  assert.doesNotMatch(codigoDe("../src/modules/ModuloCajaChica.jsx"), /g\.descripcion\|\|""\)\.slice\(0,60\)/);
});

test("Diferencias: el título de un grupo no queda solo al pie, escrito encima del pie de la hoja", () => {
  const c = codigoDe("../src/modules/controlObra/pdfDiferencias.js");
  const salto = c.indexOf("if (y > doc.internal.pageSize.getHeight() - 110) { doc.addPage(); y = 44; }");
  const titulo = c.indexOf("doc.text(`${titulo}  ·  ${suyas.length}");
  assert.ok(salto > 0 && titulo > salto, "se mira si entra antes de escribir el título");
});

test("cronograma: el nombre largo se corta contando los puntos suspensivos y no se mete en los días", () => {
  const c = codigoDe("../src/modules/cronograma/pdfCronograma.js");
  assert.match(c, /const cabe = 42 - sangria;/);
  assert.match(c, /while \(anchoEscrito\(doc, `\$\{texto\.trim\(\)\}…`\) > cabe && texto\.length > 4\)/);
});

test("libro de obra: con sus tildes y el día con mayúscula", () => {
  const c = codigoDe("../src/modules/libro/pdfDiaDeObra.js");
  assert.match(c, /FOTOS DEL DÍA/);
  assert.match(c, /"ÍNDICE"/);
  assert.match(c, /trabajó según lo previsto/);
  assert.doesNotMatch(c, /FOTOS DEL DIA|"INDICE"|segun lo previsto/);
  assert.match(c, /comoSeLee\(dia\.fecha\)\.replace\(\/\^\.\/, c => c\.toUpperCase\(\)\)/);
});

test("órdenes de cambio: sin la barra que se lee como una ele, y el porcentaje con coma", () => {
  const c = codigoDe("../src/modules/controlObra/pdfOrdenCambio.js");
  assert.doesNotMatch(c, /\}  \|  /);
  assert.match(c, /String\(f\.pct\)\.replace\("\.", ","\)/);
});
