// Exportación de reportes: Excel para los datos, PDF para el documento
// que se presenta o se envía (con las facturas adjuntas).

// Excel y PDF se piden cuando alguien exporta, no al abrir FOREMAN. Traerlos
// siempre significaba que quien entra en el teléfono a ver sus tareas del día
// bajaba igual el motor de Excel y el de PDF: la mayor parte del peso, para
// algo que usa una persona una vez por semana.
import { pieDePdf } from "./piePdf";
import { esPdf, paginasDelPdf, incrustarPdfs, comoDocumento } from "./adjuntosDelPdf";

let XLSX, jsPDF, autoTable;
const cargarExcel = async () => { XLSX = XLSX || await import("xlsx"); return XLSX; };
export const cargarPDF = async () => {
  if (!jsPDF) {
    const [pdf, tabla] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
    jsPDF = pdf.jsPDF;
    autoTable = tabla.default;
  }
  return { jsPDF, autoTable };
};

const MARCA = [15, 61, 62];       // --brand
const TINTA = [17, 24, 39];       // --ink
const GRIS = [107, 114, 128];

export const money = v => (Number(v) || 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hoyTexto = () => new Date().toLocaleDateString("es-EC", { day: "2-digit", month: "long", year: "numeric" });
const limpiarNombre = s => (s || "reporte").replace(/[^\w\sáéíóúñÁÉÍÓÚÑ-]/g, "").trim().slice(0, 60);

/**
 * Excel con una o varias hojas.
 * @param hojas [{ nombre, filas: [[]], anchos?: [] }]
 */
export async function exportarExcel(nombreArchivo, hojas) {
  await cargarExcel();
  const wb = XLSX.utils.book_new();
  for (const hoja of hojas) {
    const ws = XLSX.utils.aoa_to_sheet(hoja.filas);
    if (hoja.anchos) ws["!cols"] = hoja.anchos.map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, hoja.nombre.slice(0, 31));
  }
  XLSX.writeFile(wb, `${limpiarNombre(nombreArchivo)}.xlsx`);
}

/**
 * PDF con encabezado, bloques de tabla y, opcionalmente, las facturas
 * escaneadas al final (una por página).
 *
 * @param titulo      título del documento
 * @param subtitulo   línea bajo el título (obra, período…)
 * @param resumen     [{label, valor}] tarjetas de totales
 * @param bloques     [{titulo, columnas, filas, anchos?, filasDestacadas?, destacarSinNegrita?, nota?}]
 * @param adjuntos    [{titulo, url}] los sustentos: fotos o PDF (adjuntosDelPdf.js)
 * @param indiceAdjuntos  agrega un índice de los anexos antes de las imágenes
 */
export async function construirPDF({ titulo, subtitulo, resumen = [], bloques = [], adjuntos = [], indiceAdjuntos = false, onProgreso, tono, pie }) {
  const FUERTE = tono?.fuerte || MARCA, SUAVE = tono?.suave || [231, 241, 239];
  await cargarPDF();
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const ancho = doc.internal.pageSize.getWidth();
  let y = 42;

  doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.setTextColor(...TINTA);
  doc.text(titulo, 40, y);
  y += 16;
  if (subtitulo) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(...GRIS);
    doc.text(subtitulo, 40, y); y += 14;
  }
  doc.setFontSize(8); doc.setTextColor(...GRIS);
  doc.text(`Generado el ${hoyTexto()} · FOREMAN`, 40, y);
  y += 18;

  if (resumen.length) {
    const anchoTarjeta = (ancho - 80) / resumen.length;
    resumen.forEach((r, i) => {
      const x = 40 + i * anchoTarjeta;
      doc.setDrawColor(228, 228, 225); doc.setFillColor(250, 250, 248);
      doc.roundedRect(x, y, anchoTarjeta - 8, 40, 4, 4, "FD");
      doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...GRIS);
      doc.text(r.label.toUpperCase(), x + 9, y + 14);
      doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...(r.color || TINTA));
      doc.text(String(r.valor), x + 9, y + 30);
    });
    y += 54;
  }

  for (const b of bloques) {
    if (b.titulo) {
      doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...FUERTE);
      doc.text(b.titulo, 40, y); y += 8;
    }
    autoTable(doc, {
      startY: y,
      head: [b.columnas],
      body: b.filas,
      margin: { left: 40, right: 40 },
      styles: { fontSize: 7.5, cellPadding: 4, textColor: TINTA, lineColor: [235, 235, 232], lineWidth: 0.5 },
      headStyles: { fillColor: SUAVE, textColor: FUERTE, fontStyle: "bold", fontSize: 7 },
      alternateRowStyles: { fillColor: [252, 252, 251] },
      columnStyles: b.anchos || {},
      rowPageBreak: "avoid",   // una fila no se parte entre dos páginas
      didParseCell: d => {
        if (d.section === "body" && b.filasDestacadas?.includes(d.row.index)) {
          d.cell.styles.fillColor = SUAVE;
          if (!b.destacarSinNegrita) d.cell.styles.fontStyle = "bold";
        }
      },
    });
    y = doc.lastAutoTable.finalY + 8;
    // LA CONDICIÓN, DEBAJO DE SU CUADRO.
    //
    // Hay cuadros que no se entienden solos: un anticipo y una nota de crédito
    // no son gastos como los otros, y quien recibe el documento —el cliente—
    // no tiene por qué deducirlo de la palabra del encabezado. Se escribe.
    if (b.nota) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...TINTA);
      const lineas = doc.splitTextToSize(b.nota, 515);
      doc.text(lineas, 40, y);
      y += lineas.length * 9 + 4;
    }
    y += 14;
    if (y > doc.internal.pageSize.getHeight() - 80) { doc.addPage(); y = 42; }
  }

  // Índice de anexos: útil cuando el PDF es solo el legajo de facturas
  if (indiceAdjuntos && adjuntos.length) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...FUERTE);
    doc.text(`Anexos (${adjuntos.length})`, 40, y); y += 8;
    autoTable(doc, {
      startY: y,
      head: [["#", "Documento"]],
      body: adjuntos.map((a, i) => [i + 1, a.titulo || `Anexo ${i + 1}`]),
      margin: { left: 40, right: 40 },
      styles: { fontSize: 8, cellPadding: 4, textColor: TINTA, lineColor: [235, 235, 232], lineWidth: 0.5 },
      headStyles: { fillColor: SUAVE, textColor: FUERTE, fontStyle: "bold", fontSize: 7 },
      columnStyles: { 0: { cellWidth: 30 } },
    });
  }

  // LOS SUSTENTOS, en el orden de la lista: cada foto en su hoja, y cada hoja
  // de un sustento en PDF en la suya. Antes solo entraban las fotos y un PDF
  // se salteaba sin decir nada (adjuntosDelPdf.js).
  const titular = texto => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...TINTA);
    doc.text(texto, 40, 42);
  };
  const porIncrustar = [];
  let n = 0;
  for (const adj of adjuntos) {
    n++;
    onProgreso?.(n, adjuntos.length);
    const nombre = adj.titulo || `Factura ${n}`;
    const a = await cargarAdjunto(adj.url);
    if (!a) {
      // No se pudo bajar o no es ni foto ni PDF: se dice, en su lugar.
      doc.addPage(); titular(nombre);
      doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...GRIS);
      doc.text("Este sustento no se pudo incluir: no se pudo abrir el archivo. Está cargado en FOREMAN, en el gasto.", 40, 62);
      continue;
    }
    if (a.tipo === "imagen") {
      doc.addPage();
      titular(nombre);
      const maxW = ancho - 80, maxH = doc.internal.pageSize.getHeight() - 100;
      const escala = Math.min(maxW / a.width, maxH / a.height, 1);
      doc.addImage(a.dataUrl, "JPEG", 40, 56, a.width * escala, a.height * escala);
      continue;
    }
    // UN PDF: una hoja del reporte por cada hoja suya, parada o acostada como
    // ella, con el mismo título. La hoja del sustento se dibuja al final.
    a.paginas.forEach((hoja, i) => {
      doc.addPage("a4", hoja.ancho > hoja.alto ? "landscape" : "portrait");
      titular(a.paginas.length > 1 ? `${nombre} · hoja ${i + 1} de ${a.paginas.length}` : nombre);
      const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
      porIncrustar.push({
        pagina: doc.getNumberOfPages(), origen: a.origen, indice: i, hoja,
        hueco: { x: 40, arriba: 56, ancho: W - 80, alto: H - 100 },
      });
    });
  }

  // Qué es, de qué proyecto y cuándo se emitió, en cada hoja.
  pieDePdf(doc, { elemento: pie?.elemento ?? titulo, proyecto: pie?.proyecto, margen: 14, abajo: 7 });
  if (!porIncrustar.length) return doc;
  // Con sustentos en PDF, el documento final lo cierra pdf-lib. Se devuelve
  // con las mismas salidas que el de jsPDF: guardar, blob y base64.
  const paginas = doc.getNumberOfPages();
  return comoDocumento(await incrustarPdfs(doc.output("arraybuffer"), porIncrustar), paginas);
}

/** Construye el PDF y lo descarga. */
export async function exportarPDF(opciones) {
  const doc = await construirPDF(opciones);
  doc.save(`${limpiarNombre(opciones.nombreArchivo)}.pdf`);
}

/**
 * Baja un sustento y dice qué es.
 *
 * @returns { tipo: "imagen", dataUrl, width, height } — pasada a JPEG para
 *          que jsPDF pueda incrustarla—, { tipo: "pdf", origen, paginas } o
 *          null si no se pudo bajar o no es ninguna de las dos cosas
 */
async function cargarAdjunto(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!String(blob.type || "").startsWith("image/")) {
      // UN PDF TAMBIÉN ES UN SUSTENTO. Se reconoce por cómo empieza el
      // archivo y no solo por el tipo que diga el depósito.
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (blob.type !== "application/pdf" && !esPdf(bytes)) return null;
      const { origen, paginas } = await paginasDelPdf(bytes);
      return paginas.length ? { tipo: "pdf", origen, paginas } : null;
    }
    const bitmap = await createImageBitmap(blob);
    const escala = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    return { tipo: "imagen", dataUrl: canvas.toDataURL("image/jpeg", 0.8), width: canvas.width, height: canvas.height };
  } catch {
    return null;
  }
}
