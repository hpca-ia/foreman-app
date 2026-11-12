// Los sustentos que son PDF también van adentro del reporte (caja chica, planilla).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { esPdf, paginasDelPdf, dondeVa, incrustarPdfs, comoDocumento } from "../src/lib/adjuntosDelPdf.js";
import { pieDePdf } from "../src/lib/piePdf.js";

const require = createRequire(import.meta.url);
const { jsPDF } = require("jspdf");
const { PDFDocument, PDFName, degrees, StandardFonts } = require("pdf-lib");

// Una factura de mentira: A4 parada, con su texto. `giro` la deja girada como
// salen algunos escaneos; `hojas`, de varias páginas.
async function factura({ hojas = 1, ancho = 595.28, alto = 841.89, giro = 0, texto = "FACTURA 001-005-001803869" } = {}) {
  const d = await PDFDocument.create();
  const letra = await d.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < hojas; i++) {
    const p = d.addPage([ancho, alto]);
    p.drawText(`${texto} · hoja ${i + 1}`, { x: 40, y: alto - 60, size: 14, font: letra });
    if (giro) p.setRotation(degrees(giro));
  }
  return d.save();
}

test("un PDF se reconoce por cómo empieza, diga lo que diga su tipo", async () => {
  assert.equal(esPdf(await factura()), true);
  assert.equal(esPdf(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0])), false);   // un JPEG
  assert.equal(esPdf(new Uint8Array([])), false);
  assert.equal(esPdf(null), false);
});

test("de un PDF se sabe cuántas hojas tiene y cómo se ve cada una", async () => {
  const { paginas } = await paginasDelPdf(await factura({ hojas: 3 }));
  assert.equal(paginas.length, 3);
  assert.deepEqual(paginas.map(p => [Math.round(p.ancho), Math.round(p.alto), p.giro]), [[595, 842, 0], [595, 842, 0], [595, 842, 0]]);
  // Girada 90°, se ve acostada.
  const girada = (await paginasDelPdf(await factura({ giro: 90 }))).paginas[0];
  assert.deepEqual([Math.round(girada.ancho), Math.round(girada.alto), girada.giro], [842, 595, 90]);
});

test("la hoja entra entera en su hueco, arriba y a la izquierda, sin agrandarse", () => {
  // Una A4 parada en una hoja A4 parada con título y pie: se achica a lo que entra.
  const hueco = { x: 40, y: 44, ancho: 515, alto: 742 };
  const a4 = dondeVa({ ancho: 595.28, alto: 841.89, giro: 0 }, hueco);
  assert.equal(Math.round(a4.escala * 1000) / 1000, 0.865);
  assert.ok(a4.ancho <= hueco.ancho + 0.01 && a4.alto <= hueco.alto + 0.01);
  assert.equal(a4.x, 40);
  assert.equal(Math.round(a4.y + a4.alto), 786);              // pegada arriba del hueco
  // Un ticket chico queda de su tamaño.
  const ticket = dondeVa({ ancho: 200, alto: 300, giro: 0 }, hueco);
  assert.equal(ticket.escala, 1);
  assert.deepEqual([ticket.ancho, ticket.alto], [200, 300]);
});

test("una hoja girada se apoya en la esquina que le toca y ocupa el mismo hueco", () => {
  const hueco = { x: 40, y: 44, ancho: 762, alto: 495 };
  for (const giro of [0, 90, 180, 270]) {
    const acostada = giro === 90 || giro === 270;
    const hoja = { ancho: acostada ? 842 : 595, alto: acostada ? 595 : 842, giro };
    const p = dondeVa(hoja, hueco);
    const izq = 40, abajo = hueco.y + hueco.alto - p.alto;
    const esquina = { 0: [izq, abajo], 90: [izq, abajo + p.alto], 180: [izq + p.ancho, abajo + p.alto], 270: [izq + p.ancho, abajo] }[giro];
    assert.deepEqual([p.x, p.y].map(Math.round), esquina.map(Math.round), `girada ${giro}`);
    assert.ok(p.ancho <= hueco.ancho + 0.01 && p.alto <= hueco.alto + 0.01, `girada ${giro} no entra`);
  }
});

// Un reporte como el de caja chica: una hoja acostada con la tabla, y las
// hojas que se le dejan a cada sustento en PDF.
function reporteConHuecos(sustentos) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.text("Caja Chica - CAJA OFICINA", 40, 42);
  const pendientes = [];
  sustentos.forEach(({ origen, paginas }, n) => paginas.forEach((hoja, i) => {
    doc.addPage("a4", hoja.ancho > hoja.alto ? "landscape" : "portrait");
    doc.text(`Sustento ${n + 1} · hoja ${i + 1} de ${paginas.length}`, 40, 42);
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    pendientes.push({ pagina: doc.getNumberOfPages(), origen, indice: i, hoja, hueco: { x: 40, arriba: 56, ancho: W - 80, alto: H - 100 } });
  }));
  pieDePdf(doc, { elemento: "Caja chica", proyecto: "CAJA OFICINA", margen: 14, abajo: 7 });
  return { doc, pendientes };
}

test("los sustentos en PDF quedan adentro del reporte, cada hoja en la suya y en orden", async () => {
  // Como la caja de oficina de Johanna: tres sustentos, todos en PDF; uno de dos hojas.
  const sustentos = [
    await paginasDelPdf(await factura({ texto: "SRI 20261007115941682" })),
    await paginasDelPdf(await factura({ hojas: 2, texto: "RIDE PA-CO COMERCIAL" })),
    await paginasDelPdf(await factura({ giro: 90, texto: "SRI 20261030125822234" })),
  ];
  const { doc, pendientes } = reporteConHuecos(sustentos);
  assert.equal(doc.getNumberOfPages(), 5);                       // la tabla + 1 + 2 + 1
  const bytes = await incrustarPdfs(doc.output("arraybuffer"), pendientes);
  const final = await PDFDocument.load(bytes);
  assert.equal(final.getPageCount(), 5, "no se agregan ni se pierden hojas");
  // Adentro hay cuatro hojas ajenas incrustadas: una por cada hoja de sustento.
  const incrustadas = final.context.enumerateIndirectObjects()
    .filter(([, o]) => o?.dict?.get?.(PDFName.of("Subtype")) === PDFName.of("Form")).length;
  assert.equal(incrustadas, 4);
  // La hoja girada va en una hoja acostada del reporte; las otras, paradas.
  const formas = final.getPages().map(p => (p.getSize().width > p.getSize().height ? "acostada" : "parada"));
  assert.deepEqual(formas, ["acostada", "parada", "parada", "parada", "acostada"]);
  // Y pesa más que el reporte solo: los sustentos están adentro.
  assert.ok(bytes.length > doc.output("arraybuffer").byteLength);
  // Para mirarlo: si se pide, lo deja escrito.
  if (process.env.GUARDAR_PDF_DE_PRUEBA) fs.writeFileSync(process.env.GUARDAR_PDF_DE_PRUEBA, bytes);
});

test("el documento final se guarda, sale como blob y en base64, igual que el de jsPDF", async () => {
  const bytes = await factura();
  const d = comoDocumento(bytes, 1);
  assert.equal(d.getNumberOfPages(), 1);
  assert.equal(d.output("blob").size, bytes.length);
  assert.equal(d.output("arraybuffer").byteLength, bytes.length);
  const uri = d.output("datauristring");
  assert.match(uri, /^data:application\/pdf;[^,]*base64,/);
  assert.deepEqual(new Uint8Array(Buffer.from(uri.split(",")[1], "base64")), new Uint8Array(bytes));
  assert.throws(() => d.output("otra-cosa"), /No sé sacar/);
});

test("el pie se pone con el tamaño de cada hoja: en una parada no queda fuera del papel", () => {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.addPage("a4", "portrait");
  pieDePdf(doc, { elemento: "Caja chica", proyecto: "CAJA OFICINA", margen: 14, abajo: 7 });
  const crudo = Buffer.from(doc.output("arraybuffer")).toString("latin1");
  const hojas = [...crudo.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].map(m => m[1]).filter(s => /\bBT\b/.test(s));
  assert.equal(hojas.length, 2);
  const dondeElPie = s => [...s.matchAll(/BT\r?\n\/F\d+ 7 Tf[\s\S]*?(-?[\d.]+) (-?[\d.]+) Td\r?\n\(([^)]*)\) Tj/g)].map(m => ({ x: +m[1], y: +m[2], t: m[3] }));
  const acostada = dondeElPie(hojas[0]), parada = dondeElPie(hojas[1]);
  // La parada mide 595 de ancho: su «Página 2 de 2» tiene que terminar adentro.
  const derecha = parada.find(p => /P.gina 2 de 2/.test(p.t));
  assert.ok(derecha, "la hoja parada tiene su número");
  assert.ok(derecha.x < 595.28 - 100 && derecha.x > 300, `quedó en x=${derecha.x}`);
  assert.ok(acostada.find(p => /P.gina 1 de 2/.test(p.t)).x > 595, "y el de la acostada sigue a la derecha de la suya");
});
