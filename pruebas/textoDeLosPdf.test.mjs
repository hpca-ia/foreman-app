// El texto de los demás PDF: que entre en la hoja, a lo ancho y a lo alto.
//
// El libro de obra cortaba renglones en el margen derecho porque partía el
// texto con una letra y lo escribía con otra (textoDelLibro.test.mjs). Acá
// está cada papel que tenía lo mismo, o un pariente:
//
//   · partir antes de poner la letra — la revisión del presupuesto, y al revés
//     en los pies de foto del acta;
//   · partir un texto y escribir otro — el tabulador, que jsPDF mide como un
//     signo y escribe como ocho espacios; y la orden de cambio, que limpiaba
//     después de medir;
//   · escribir renglones sin mirar dónde termina la hoja — la solicitud de
//     compra, las fotos de la orden de cambio, la nota de los reportes.
//
// Cada caso se arma como estaba, se mide con jsPDF, y después como quedó.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { medible, seguro, partirTexto, tandasDeRenglones } from "../src/lib/textoDelPdf.js";

const { jsPDF } = createRequire(import.meta.url)("jspdf");
// La revisión, el acta y la solicitud se dibujan en milímetros; la orden de
// cambio, el presupuesto y el plan semanal, en puntos.
const enMm = () => new jsPDF({ unit: "mm", format: "a4" });
const enPt = () => new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
const reportes = () => new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

const letra = (doc, estilo, tamano) => { doc.setFont("helvetica", estilo); doc.setFontSize(tamano); };
const elMasLargo = (doc, renglones, medir = (d, l) => d.getTextWidth(l)) => Math.max(...renglones.map(l => medir(doc, l)));
const sinPerder = (renglones, texto) => assert.equal(
  renglones.join(" ").replace(/\s+/g, " ").trim(), texto.replace(/\s+/g, " ").trim(), "no se pierde ni una palabra");

// Lo que un renglón ocupa EN EL PAPEL: el tabulador se escribe como ocho espacios.
const enElPapel = (doc, l) => doc.getTextWidth(String(l).replace(/\t/g, " ".repeat(8)));

// Dónde queda escrito cada renglón de un bloque partido en tandas: [hoja, y].
const dondeQuedan = (tandas, y, paso, techo) => {
  const out = []; let hoja = 0;
  for (const t of tandas) {
    if (t.hojaNueva) { hoja++; y = techo; }
    for (let i = t.desde; i < t.hasta; i++) { out.push([hoja, y]); y += paso; }
  }
  return out;
};

// ── La revisión del presupuesto (controlObra/pdfRevision.js) ───────────────
const A4 = 210, M = 16;   // la hoja y el margen de la revisión, el acta y la solicitud

// Un punto de verdad, como lo escribe leerPresupuesto.js.
const PUNTO = '2. El subtotal del capítulo "INSTALACIONES ELÉCTRICAS Y ELECTRÓNICAS" dice $48.215,30, pero sus rubros suman '
  + "$51.990,75 (diferencia $3.775,45). Suele ser una fórmula que no incluye todas las filas.";

test("revisión: el título de un punto, partido con la letra de las filas del de arriba y escrito con la suya, se pasa del margen", () => {
  const doc = enMm();
  const ancho = A4 - M * 2 - 4;
  // Como estaba: la letra de 7,8 que dejó la última fila del punto anterior.
  letra(doc, "normal", 7.8);
  const mal = doc.splitTextToSize(seguro(PUNTO), ancho);
  letra(doc, "normal", 9);
  const largo = elMasLargo(doc, mal);
  assert.ok(largo > ancho + 10, `un renglón de ${largo.toFixed(1)} mm en ${ancho} de ancho`);
  // Se escribe desde M + 4: termina adentro del margen derecho.
  assert.ok(M + 4 + largo > A4 - M + 10, "más de un centímetro adentro del margen");
});

test("revisión: partido con su letra, el título entra, venga de donde venga", () => {
  const ancho = A4 - M * 2 - 4;
  const con = (estilo, tamano) => { const d = enMm(); letra(d, estilo, tamano); return [d, partirTexto(d, PUNTO, ancho, "normal", 9)]; };
  const [doc, renglones] = con("normal", 7.8);            // después de las filas de otro punto
  assert.equal(doc.getFontSize(), 9);
  renglones.forEach(l => assert.ok(doc.getTextWidth(l) <= ancho + 0.01, `se pasa: ${l}`));
  sinPerder(renglones, seguro(PUNTO));
  // El primer punto del bloque —después del título en negrita— y el que sigue
  // a uno sin filas se parten igual: ya no depende de lo que se escribió antes.
  assert.deepEqual(renglones, con("bold", 8.5)[1]);
  assert.deepEqual(renglones, con("normal", 9)[1]);
});

test("revisión: la primera fila de cada punto doblaba antes del margen, medida con la letra del título", () => {
  const FILA = "fila 214: 12.04 Tablero de distribución trifásico de 42 espacios con barras: 3 × $1.845,20 = $5.535,60, el Excel dice $5.353,60";
  const doc = enMm();
  const ancho = A4 - M * 2 - 12;
  // Como estaba: medida con la de 9 del título, escrita en 7,8.
  letra(doc, "normal", 9);
  const mal = doc.splitTextToSize(seguro(FILA), ancho);
  assert.equal(mal.length, 2, "se partía en dos");
  const bien = partirTexto(doc, FILA, ancho, "normal", 7.8);
  assert.equal(bien.length, 1, "y entra en un renglón");
  assert.ok(doc.getTextWidth(bien[0]) <= ancho);
  // La segunda fila ya se medía bien, con la letra que dejó la primera: salían distintas.
  letra(doc, "normal", 7.8);
  assert.deepEqual(doc.splitTextToSize(seguro(FILA), ancho), bien);
});

// ── El acta (actas/pdfActa.js) ─────────────────────────────────────────────
test("acta: el pie de una foto doblaba a cuatro quintos del ancho, medido con la negrita del título", () => {
  const PIE = "Armado de la losa del nivel +3,20, vista desde el eje C hacia la escalera";
  const doc = enMm();
  const anchoFoto = (A4 - M * 2 - 6) / 2;
  // Como estaba: la negrita de 8,5 que dejó "REGISTRO FOTOGRÁFICO".
  letra(doc, "bold", 8.5);
  const mal = doc.splitTextToSize(PIE, anchoFoto);
  letra(doc, "normal", 7.5);
  assert.equal(mal.length, 2, "se partía en dos");
  assert.ok(elMasLargo(doc, mal) < anchoFoto * 0.85, "y ningún renglón llegaba al borde de la foto");
  // Con su letra entra en uno, venga de la negrita del título o de otro pie.
  letra(doc, "bold", 8.5);
  const bien = partirTexto(doc, PIE, anchoFoto, "normal", 7.5, medible);
  assert.equal(bien.length, 1);
  assert.ok(doc.getTextWidth(bien[0]) <= anchoFoto);
  assert.equal(doc.getFont().fontStyle, "normal");
});

// Un tema pegado desde Word: las columnas vienen separadas con tabuladores.
const DE_WORD = "Responsable:\tIng. Paredes\tPlazo:\tviernes 20\tPendiente:\tentrega de planos As Built de instalaciones "
  + "sanitarias — nivel 2 — para revisión de fiscalización y del cliente antes de la próxima reunión";

test("jsPDF mide el tabulador como un signo y lo escribe como ocho espacios", () => {
  const doc = enPt();
  letra(doc, "normal", 10);
  doc.text("a\tb", 40, 40);
  assert.match(doc.output(), /\(a {8}b\) Tj/, "en el papel van ocho espacios");
  assert.ok(doc.getTextWidth("a\tb") < doc.getTextWidth(`a${" ".repeat(8)}b`) - 15, "y midió quince puntos menos");
});

test("acta: un párrafo con tabuladores se medía más corto de lo que se escribe, y se salía del papel", () => {
  const doc = enMm();
  const sangria = 5, ancho = A4 - M * 2 - sangria;
  letra(doc, "normal", 9.5);
  // Como estaba: el texto tal cual llegó.
  const mal = doc.splitTextToSize(DE_WORD, ancho);
  mal.forEach(l => assert.ok(doc.getTextWidth(l) <= ancho + 0.01, "jsPDF creía que entraba"));
  const largo = elMasLargo(doc, mal, enElPapel);
  assert.ok(largo > ancho + M, `y en el papel ocupaba ${largo.toFixed(1)} mm de ${ancho}`);
  assert.ok(M + sangria + largo > A4, "más allá del borde de la hoja");
});

test("acta: sin tabuladores lo que se mide es lo que se escribe, y las rayas del acta quedan como estaban", () => {
  const doc = enMm();
  const ancho = A4 - M * 2 - 5;
  letra(doc, "bold", 8.5);
  const renglones = partirTexto(doc, DE_WORD, ancho, "normal", 9.5, medible);
  renglones.forEach(l => {
    assert.ok(!l.includes("\t"));
    assert.ok(enElPapel(doc, l) <= ancho + 0.01, `se pasa: ${l}`);
  });
  sinPerder(renglones, DE_WORD);
  // `medible` no toca las rayas ni las comillas: el acta las escribe a propósito.
  assert.ok(renglones.join(" ").includes("—"));
  assert.equal(medible("«Losa» —\t“nivel” +3,20"), "«Losa» — “nivel” +3,20");
  assert.equal(medible(null), "");
  // `seguro` sí, y saca lo mismo que `medible`.
  assert.equal(seguro("«Losa» —\t“nivel” +3,20"), '"Losa" - "nivel" +3,20');
});

// ── La orden de cambio (controlObra/pdfOrdenCambio.js) ─────────────────────
test("orden de cambio: se limpia antes de medir, con la limpieza de cada papel", () => {
  const doc = enPt();
  const util = doc.internal.pageSize.getWidth() - 40 * 2;
  const JUSTIFICACION = "Cambio pedido por el cliente:\tpiso de porcelanato en lugar de vinil…\tÁrea:\t186 m2\tSe mantiene el plazo "
    + "de entrega y se coordina con el proveedor de mobiliario la nueva fecha de instalación";
  // Como estaba: se partía el texto crudo y se escribía el limpio.
  letra(doc, "normal", 9);
  const mal = doc.splitTextToSize(JUSTIFICACION, util);
  assert.ok(elMasLargo(doc, mal, enElPapel) > util + 20, "con tabuladores, pasaba el margen");
  // La limpieza de la orden: la de todos más sus puntos suspensivos.
  const limpiar = t => medible(t).replace(/…/g, "...");
  const renglones = partirTexto(doc, JUSTIFICACION, util, "normal", 9, limpiar);
  renglones.forEach(l => assert.ok(enElPapel(doc, l) <= util + 0.01, `se pasa: ${l}`));
  assert.ok(renglones.join(" ").includes("vinil..."), "lo que se midió ya es lo que se escribe");
  assert.ok(!renglones.join(" ").includes("\t"));
});

test("orden de cambio: la foto y su pie van juntos y arriba del pie de la hoja", () => {
  // La foto más alta (300) terminando justo donde se la deja terminar (780).
  const h = 300, py = 480, paso = 10;
  const pieDeLaHoja = 841.89 - 7.8 * 72 / 25.4 - 5;          // donde empieza "Emitido el…"
  // Como estaba: renglón tras renglón debajo de la foto, sin mirar.
  const antes = n => py + h + 6 + (n - 1) * paso;
  assert.ok(antes(4) > pieDeLaHoja, "el cuarto renglón caía sobre el pie de la hoja");
  assert.ok(antes(7) > 841.89, "y el séptimo, fuera del papel");

  const tandas = n => tandasDeRenglones({ cuantos: n, y: py + h + 6, paso, techo: 44 + h + 6, piso: 820 });
  // Hasta tres renglones quedan donde estaban.
  assert.deepEqual(tandas(3), [{ desde: 0, hasta: 3, hojaNueva: false }]);
  // Con cuatro, la foto y su pie pasan enteros a la hoja siguiente.
  assert.deepEqual(tandas(4), [{ desde: 0, hasta: 4, hojaNueva: true }]);
  // Y nunca se escribe más abajo de 810, por largo que sea el pie.
  for (const n of [4, 7, 30, 120]) {
    dondeQuedan(tandas(n), py + h + 6, paso, 44 + h + 6).forEach(([, y]) => assert.ok(y <= 810, `renglón en ${y}`));
  }
  // Sin pie no hay nada que mover.
  assert.deepEqual(tandas(0), []);
});

// ── La solicitud de compra (compras/pdfSolicitud.js) ───────────────────────
test("solicitud de compra: un «para qué» largo ya no se escribe debajo de la hoja", () => {
  const ALTO = enMm().internal.pageSize.getHeight();
  const paso = 5, techo = 18, piso = ALTO - 15;
  // Como estaba: doce renglones desde 35 mm antes del borde, uno abajo del otro.
  const y = ALTO - 35;
  assert.ok(y + 11 * paso > ALTO, "el último quedaba fuera del papel");
  // Ahora pasa entero a la hoja siguiente, con su rótulo.
  assert.deepEqual(tandasDeRenglones({ cuantos: 12, y, paso, techo, piso }), [{ desde: 0, hasta: 12, hojaNueva: true }]);
  // Uno más largo que una hoja sigue en la otra; ninguno queda a menos de 2 cm del borde.
  const tandas = tandasDeRenglones({ cuantos: 70, y: 60, paso, techo, piso });
  assert.equal(tandas.length, 2);
  const quedan = dondeQuedan(tandas, 60, paso, techo);
  assert.equal(quedan.length, 70);
  quedan.forEach(([, donde]) => assert.ok(donde <= ALTO - 20, `renglón en ${donde}`));
  // Y el dato corto, que es el de siempre, queda donde estaba.
  assert.deepEqual(tandasDeRenglones({ cuantos: 3, y: 100, paso, techo, piso }), [{ desde: 0, hasta: 3, hojaNueva: false }]);
  assert.deepEqual(tandasDeRenglones({ cuantos: 1, y: ALTO - 30, paso, techo, piso }), [{ desde: 0, hasta: 1, hojaNueva: false }]);
});

test("solicitud de compra: un comentario largo no pisa el pie, y su firma no queda sola", () => {
  const ALTO = enMm().internal.pageSize.getHeight();
  const paso = 4.6, techo = 18, piso = ALTO - 15, cola = 6;
  const y = ALTO - 26;      // lo último que se dejaba empezar en la hoja
  // Como estaba: seis renglones y el nombre debajo.
  assert.ok(y + 6 * paso > ALTO, "el nombre de quien lo dijo quedaba fuera del papel");
  assert.deepEqual(tandasDeRenglones({ cuantos: 6, y, paso, techo, piso, cola }), [{ desde: 0, hasta: 6, hojaNueva: true }]);
  // El de un renglón sigue entrando ahí, con su firma.
  assert.deepEqual(tandasDeRenglones({ cuantos: 1, y, paso, techo, piso, cola }), [{ desde: 0, hasta: 1, hojaNueva: false }]);
});

test("solicitud de compra: lo pegado con tabuladores entra en su columna", () => {
  const doc = enMm();
  const ancho = A4 - M * 2 - 42;
  letra(doc, "normal", 10);
  const mal = doc.splitTextToSize(DE_WORD, ancho);
  assert.ok(elMasLargo(doc, mal, enElPapel) > ancho + M, "pasaba el margen");
  partirTexto(doc, DE_WORD, ancho, "normal", 10, medible)
    .forEach(l => assert.ok(enElPapel(doc, l) <= ancho + 0.01, `se pasa: ${l}`));
});

// ── Los reportes (lib/exportar.js) ─────────────────────────────────────────
test("reportes: la nota de un cuadro que termina al borde no se escribe sobre el pie de la hoja", () => {
  const doc = reportes();
  const H = doc.internal.pageSize.getHeight();
  // La nota del anticipo, como la escribe ExportarPlanilla.
  const NOTA = "Gasto sin factura: la plata ya se entregó al proveedor y el comprobante definitivo todavía no se emite. "
    + "Suma al total de la planilla y no se cuenta como obra ejecutada hasta que llegue su factura.";
  const renglones = partirTexto(doc, NOTA, 515, "normal", 7.5, medible);
  assert.equal(renglones.length, 2);
  // El cuadro termina donde autoTable lo deja terminar: a 40 del borde. La nota va 8 más abajo.
  const y = H - 40 + 8;
  const pieDeLaHoja = H - 7 * 72 / 25.4 - 5;                 // donde empieza "Emitido el…"
  // Como estaba: los dos renglones ahí mismo (7,5 × 1,15 de interlínea).
  assert.ok(y + 7.5 * 1.15 > pieDeLaHoja, "el segundo se montaba sobre el pie");
  const tandas = lugar => tandasDeRenglones({ cuantos: renglones.length, y: lugar, paso: 9, techo: 42, piso: H - 18 });
  assert.deepEqual(tandas(y), [{ desde: 0, hasta: 2, hojaNueva: true }]);
  // Con lugar debajo del cuadro, se queda debajo del cuadro: hasta 4 puntos
  // antes del borde, donde el segundo renglón todavía no toca el pie.
  assert.ok(H - 44 + 8 + 7.5 * 1.15 + 1.6 < pieDeLaHoja, "ahí entra, con la cola de las letras");
  assert.deepEqual(tandas(H - 44 + 8), [{ desde: 0, hasta: 2, hojaNueva: false }]);
  assert.deepEqual(tandas(300), [{ desde: 0, hasta: 2, hojaNueva: false }]);
});

// ── El presupuesto y el plan semanal ───────────────────────────────────────
// Estos dos ponían bien la letra antes de partir. Les faltaban los tabuladores.
const DE_EXCEL = "Forma de pago:\t50 % de anticipo\t30 % contra avance\t20 % contra entrega, mediante transferencia a la cuenta "
  + "de la empresa dentro de los cinco días de presentada la planilla";

test("presupuesto: una nota pegada desde Excel entra en la hoja", () => {
  const doc = enPt();
  const ancho = doc.internal.pageSize.getWidth() - 2 * 48 - 18;
  letra(doc, "normal", 8.3);
  // Como estaba: la nota tal cual.
  assert.ok(elMasLargo(doc, doc.splitTextToSize(DE_EXCEL, ancho), enElPapel) > ancho + 20, "pasaba el margen");
  // Como queda: `medible` al leer las notas y la carta, antes de partir.
  doc.splitTextToSize(medible(DE_EXCEL), ancho).forEach(l => assert.ok(enElPapel(doc, l) <= ancho + 0.01, `se pasa: ${l}`));
});

test("plan semanal: lo que quedó sin hacer y las observaciones, pegados con tabuladores, entran en la hoja", () => {
  const doc = enPt();
  const ancho = doc.internal.pageSize.getWidth() - 40 * 2;
  // Como estaba: el `seguro` del plan cambiaba comillas y rayas, y dejaba el tabulador.
  const elDeAntes = t => String(t ?? "").replace(/[«»]/g, '"').replace(/[—–]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  for (const tamano of [9, 8.5, 9.5]) {       // lo que quedó, el material y los campos del día, las observaciones
    letra(doc, "normal", tamano);
    assert.ok(elMasLargo(doc, doc.splitTextToSize(elDeAntes(DE_EXCEL), ancho), enElPapel) > ancho + 20, `a ${tamano}, pasaba el margen`);
    doc.splitTextToSize(seguro(DE_EXCEL), ancho).forEach(l => assert.ok(enElPapel(doc, l) <= ancho + 0.01, `se pasa: ${l}`));
  }
});
