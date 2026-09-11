// Exportación de reportes: Excel para los datos, PDF para el documento
// que se presenta o se envía (con las facturas adjuntas).

import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

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
export function exportarExcel(nombreArchivo, hojas) {
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
 * @param bloques     [{titulo, columnas, filas, anchos?}]
 * @param adjuntos    [{titulo, url}] imágenes de facturas
 */
export async function construirPDF({ titulo, subtitulo, resumen = [], bloques = [], adjuntos = [], onProgreso }) {
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
      doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...MARCA);
      doc.text(b.titulo, 40, y); y += 8;
    }
    autoTable(doc, {
      startY: y,
      head: [b.columnas],
      body: b.filas,
      margin: { left: 40, right: 40 },
      styles: { fontSize: 7.5, cellPadding: 4, textColor: TINTA, lineColor: [235, 235, 232], lineWidth: 0.5 },
      headStyles: { fillColor: [231, 241, 239], textColor: MARCA, fontStyle: "bold", fontSize: 7 },
      alternateRowStyles: { fillColor: [252, 252, 251] },
      columnStyles: b.anchos || {},
      didParseCell: d => {
        if (d.section === "body" && b.filasDestacadas?.includes(d.row.index)) {
          d.cell.styles.fillColor = [231, 241, 239];
          d.cell.styles.fontStyle = "bold";
        }
      },
    });
    y = doc.lastAutoTable.finalY + 22;
    if (y > doc.internal.pageSize.getHeight() - 80) { doc.addPage(); y = 42; }
  }

  // Facturas escaneadas, una por página
  let n = 0;
  for (const adj of adjuntos) {
    n++;
    onProgreso?.(n, adjuntos.length);
    const img = await cargarImagen(adj.url);
    if (!img) continue;
    doc.addPage();
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...TINTA);
    doc.text(adj.titulo || `Factura ${n}`, 40, 42);
    const maxW = ancho - 80, maxH = doc.internal.pageSize.getHeight() - 100;
    const escala = Math.min(maxW / img.width, maxH / img.height, 1);
    doc.addImage(img.dataUrl, "JPEG", 40, 56, img.width * escala, img.height * escala);
  }

  return doc;
}

/** Construye el PDF y lo descarga. */
export async function exportarPDF(opciones) {
  const doc = await construirPDF(opciones);
  doc.save(`${limpiarNombre(opciones.nombreArchivo)}.pdf`);
}

/** Descarga la imagen y la pasa a JPEG para que jsPDF pueda incrustarla. */
async function cargarImagen(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith("image/")) return null; // los PDF adjuntos no se incrustan
    const bitmap = await createImageBitmap(blob);
    const escala = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    return { dataUrl: canvas.toDataURL("image/jpeg", 0.8), width: canvas.width, height: canvas.height };
  } catch {
    return null;
  }
}
