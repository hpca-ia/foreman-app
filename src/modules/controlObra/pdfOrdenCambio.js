import { cargarPDF } from "../../lib/exportar";

// La orden de cambio en PDF, con el formato que la oficina ya firma.
//
// El correo sirve para que la lean; el PDF es el que se imprime, se firma y se
// adjunta a la liquidación. Son el mismo documento y por eso se arman con los
// mismos datos: si alguno se calculara aparte, tarde o temprano dirían cosas
// distintas y ahí no hay manera de saber cuál vale.
//
// Cuatro capítulos, adiciones y reducciones con sus subtotales, impacto en
// cronograma y el cuadro de firmas con espacio de verdad para firmar.

const TINTA = [15, 61, 62];      // el verde de la casa
const GRIS = [107, 114, 128];
const ROJO = [185, 28, 28];

const plata = v => (Number(v) || 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dia = f => (f ? new Date(`${String(f).slice(0, 10)}T12:00:00`).toLocaleDateString("es-EC", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, " / ") : "");

/** Una imagen remota a JPEG, que es lo único que jsPDF incrusta sin pelear. */
async function comoJpeg(url, maxAncho = 900) {
  const r = await fetch(url);
  const blob = await r.blob();
  const bitmap = await createImageBitmap(blob);
  const escala = Math.min(1, maxAncho / bitmap.width);
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(bitmap.width * escala);
  lienzo.height = Math.round(bitmap.height * escala);
  const ctx = lienzo.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  ctx.drawImage(bitmap, 0, 0, lienzo.width, lienzo.height);
  return { dataUrl: lienzo.toDataURL("image/jpeg", 0.82), ancho: lienzo.width, alto: lienzo.height };
}

export async function pdfDeOrden({ orden, lineas = [], fotos = [], enlaces = {}, obra, proyecto, codigo, subtotales, resumenContrato }) {
  const { jsPDF, autoTable } = await cargarPDF();
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const ancho = doc.internal.pageSize.getWidth();
  const margen = 40;
  const util = ancho - margen * 2;
  let y = 44;

  // ── Encabezado ──────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold").setFontSize(15).setTextColor(...TINTA);
  doc.text("ORDEN DE CAMBIO", margen, y);
  y += 6;

  if (orden.anulada) {
    y += 12;
    doc.setFillColor(254, 242, 242).rect(margen, y - 11, util, 18, "F");
    doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...ROJO);
    doc.text("ORDEN DE CAMBIO ANULADA — NO EJECUTADA", ancho / 2, y + 1, { align: "center" });
    y += 12;
  }
  y += 12;

  // Los datos, en dos columnas como en el papel.
  const datos = [
    ["CAMBIO N°:", codigo, "TÍTULO:", orden.titulo],
    ["FECHA:", dia(orden.fecha || orden.created_at), "EMITIDO POR:", orden.emitido_por || orden.created_nombre || ""],
    ["TIPO:", orden.tipo || "", "PROYECTO:", proyecto || obra?.nombre || ""],
    ["LUGAR:", orden.lugar || "", "CLIENTE:", obra?.cliente_nombre || ""],
  ];
  autoTable(doc, {
    startY: y,
    body: datos,
    theme: "plain",
    styles: { fontSize: 8.5, cellPadding: 2.5, textColor: [17, 24, 39] },
    columnStyles: {
      0: { cellWidth: 68, fontStyle: "bold", textColor: GRIS },
      1: { cellWidth: util / 2 - 68 },
      2: { cellWidth: 74, fontStyle: "bold", textColor: GRIS },
      3: { cellWidth: util / 2 - 74 },
    },
    margin: { left: margen, right: margen },
  });
  y = doc.lastAutoTable.finalY + 14;

  const capitulo = (n, titulo) => {
    if (y > 740) { doc.addPage(); y = 44; }
    doc.setFillColor(...TINTA).rect(margen, y - 9, util, 15, "F");
    doc.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(255, 255, 255);
    doc.text(`CAPÍTULO ${n}: ${titulo}`, margen + 6, y + 1);
    y += 18;
  };

  const parrafo = texto => {
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(55, 65, 81);
    const lineas = doc.splitTextToSize(texto || "—", util);
    lineas.forEach(l => {
      if (y > 780) { doc.addPage(); y = 44; }
      doc.text(l, margen, y);
      y += 12;
    });
    y += 4;
  };

  // ── CAPÍTULO I ──────────────────────────────────────────────────────────
  capitulo("I", "Argumentos para la solicitud.");
  doc.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(...GRIS);
  doc.text("Argumentos:", margen, y); y += 12;
  parrafo(orden.justificacion);

  if (orden.soportes) {
    doc.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(...GRIS);
    doc.text("Soportes gráficos:", margen, y); y += 12;
    parrafo(orden.soportes);
  }

  // ── CAPÍTULO II ─────────────────────────────────────────────────────────
  capitulo("II", "Propuesta de imprevisto y cotización preliminar.");
  const filasDe = tipo => lineas
    .filter(l => (tipo === "quita" ? l.tipo === "quita" : l.tipo !== "quita"))
    .map(l => [
      l.item || "", l.rubro_codigo || "",
      l.especificacion ? `${l.descripcion}\n${l.especificacion}` : l.descripcion,
      l.unidad || "", plata(l.cantidad), plata(l.precio_unitario),
      plata((Number(l.cantidad) || 0) * (Number(l.precio_unitario) || 0)),
    ]);

  const seccion = (titulo, tipo, subtotal) => {
    const filas = filasDe(tipo);
    return [
      [{ content: titulo, colSpan: 7, styles: { fillColor: [243, 244, 246], fontStyle: "bold", fontSize: 7.5, textColor: [55, 65, 81] } }],
      ...(filas.length ? filas : [[{ content: "—", colSpan: 7, styles: { textColor: GRIS } }]]),
      [{ content: `SUBTOTAL ${titulo}`, colSpan: 6, styles: { halign: "right", fontStyle: "bold", fontSize: 8 } },
       { content: `$${plata(subtotal)}`, styles: { halign: "right", fontStyle: "bold" } }],
    ];
  };

  autoTable(doc, {
    startY: y,
    head: [["ITEM", "RUBRO", "DESCRIPCIÓN", "UNIDAD", "CANT", "P. UNIT", "TOTAL"]],
    body: [
      ...seccion("ADICIONES", "aumenta", subtotales.adiciones),
      ...seccion("REDUCCIONES", "quita", subtotales.reducciones),
      [{ content: "TOTAL", colSpan: 6, styles: { halign: "right", fontStyle: "bold", fontSize: 10 } },
       { content: `${subtotales.total < 0 ? "− " : ""}$${plata(Math.abs(subtotales.total))}`,
         styles: { halign: "right", fontStyle: "bold", fontSize: 10, textColor: subtotales.total < 0 ? ROJO : TINTA } }],
    ],
    theme: "grid",
    headStyles: { fillColor: [249, 250, 251], textColor: GRIS, fontSize: 7, fontStyle: "bold", lineColor: [229, 231, 235] },
    styles: { fontSize: 8, cellPadding: 3.5, lineColor: [229, 231, 235], textColor: [17, 24, 39] },
    columnStyles: {
      0: { cellWidth: 42 }, 1: { cellWidth: 52 }, 2: { cellWidth: "auto" },
      3: { cellWidth: 38, halign: "center" }, 4: { cellWidth: 42, halign: "right" },
      5: { cellWidth: 52, halign: "right" }, 6: { cellWidth: 58, halign: "right" },
    },
    margin: { left: margen, right: margen },
  });
  y = doc.lastAutoTable.finalY + 6;

  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...GRIS);
  doc.text(subtotales.total >= 0 ? "Mayor valor del contrato." : "Menor valor del contrato.", margen, y);
  y += 16;

  // ── CAPÍTULO III ────────────────────────────────────────────────────────
  capitulo("III", "Impacto en cronograma.");
  doc.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(...GRIS);
  doc.text("Argumentos:", margen, y); y += 12;
  parrafo(orden.impacto_cronograma || (orden.dias_impacto ? `Impacto estimado de ${orden.dias_impacto} días.` : "Sin impacto en el cronograma."));

  // ── CAPÍTULO IV ─────────────────────────────────────────────────────────
  capitulo("IV", "Revisión y aprobación.");
  autoTable(doc, {
    startY: y,
    head: [["INTERESADO", "NOMBRE", "FECHA", "FIRMA", "COMENTARIOS"]],
    body: [
      ["CONTRATISTA", orden.contratista_nombre || "HCARQ SA", dia(orden.contratista_fecha), "", orden.contratista_comentario || ""],
      ["FISCALIZACIÓN", orden.fiscalizacion_nombre || "NOMBRE:", dia(orden.fiscalizacion_fecha), "", orden.fiscalizacion_comentario || ""],
      ["CONTRATANTE", orden.contratante_nombre || "NOMBRE:", dia(orden.contratante_fecha), "", orden.contratante_comentario || ""],
    ],
    theme: "grid",
    headStyles: { fillColor: [249, 250, 251], textColor: GRIS, fontSize: 7, fontStyle: "bold", lineColor: [229, 231, 235] },
    // Alto de verdad: una fila de 10pt no deja firmar a nadie.
    styles: { fontSize: 8, cellPadding: 6, minCellHeight: 34, lineColor: [229, 231, 235], valign: "middle" },
    columnStyles: { 0: { cellWidth: 74, fontStyle: "bold", textColor: [55, 65, 81] }, 2: { cellWidth: 62 }, 3: { cellWidth: 92 } },
    margin: { left: margen, right: margen },
  });
  y = doc.lastAutoTable.finalY + 14;

  // ── El contrato, antes y después ────────────────────────────────────────
  if (resumenContrato) {
    if (y > 700) { doc.addPage(); y = 44; }
    autoTable(doc, {
      startY: y,
      body: [
        ["Contrato original", `$${plata(resumenContrato.base)}`],
        ["Órdenes de cambio aprobadas", `$${plata(resumenContrato.adicionales)}`],
        ["Esta orden", `${subtotales.total < 0 ? "− " : ""}$${plata(Math.abs(subtotales.total))}`],
        [{ content: "Nuevo valor del contrato", styles: { fontStyle: "bold" } },
         { content: `$${plata(resumenContrato.base + resumenContrato.adicionales + subtotales.total)}`, styles: { fontStyle: "bold" } }],
      ],
      theme: "plain",
      styles: { fontSize: 8.5, cellPadding: 3, fillColor: [249, 250, 251] },
      columnStyles: { 0: { cellWidth: util - 110, textColor: GRIS }, 1: { cellWidth: 110, halign: "right", textColor: [17, 24, 39] } },
      margin: { left: margen, right: margen },
    });
    y = doc.lastAutoTable.finalY + 14;
  }

  doc.setFont("helvetica", "italic").setFontSize(7.5).setTextColor(...GRIS);
  doc.text("Esta orden no modifica el presupuesto contratado: se aprueba aparte y su resultado se lleva como adicional.", margen, y);

  // ── Los soportes, al final y en grande ──────────────────────────────────
  const conEnlace = fotos.filter(f => enlaces[f.id]);
  if (conEnlace.length) {
    doc.addPage();
    let py = 44;
    doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(...TINTA);
    doc.text("Soportes gráficos", margen, py);
    py += 8;
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...GRIS);
    doc.text(`${codigo} · ${proyecto || ""}`, margen, py + 6);
    py += 22;

    for (const f of conEnlace) {
      try {
        const img = await comoJpeg(enlaces[f.id]);
        const escala = Math.min(util / img.ancho, 300 / img.alto);
        const w = img.ancho * escala, h = img.alto * escala;
        if (py + h > 780) { doc.addPage(); py = 44; }
        doc.addImage(img.dataUrl, "JPEG", margen, py, w, h);
        py += h + 6;
        if (f.descripcion) {
          doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...GRIS);
          doc.splitTextToSize(f.descripcion, util).forEach(l => { doc.text(l, margen, py); py += 10; });
        }
        py += 12;
      } catch {
        // Una imagen que no se pudo traer no puede tumbar el documento entero.
      }
    }
  }

  // Pie con numeración, para que un juego impreso no se desordene.
  const paginas = doc.internal.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(...GRIS);
    doc.text(`${codigo} · ${proyecto || ""}`, margen, doc.internal.pageSize.getHeight() - 22);
    doc.text(`${i} / ${paginas}`, ancho - margen, doc.internal.pageSize.getHeight() - 22, { align: "right" });
  }

  return doc;
}
