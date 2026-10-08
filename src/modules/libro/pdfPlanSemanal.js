import { cargarPDF } from "../../lib/exportar";
import { logoParaPDF } from "../../lib/logos";
import { logoEmpresa } from "../../lib/marca";

// El plan de la semana en PDF: el que se imprime y se pega en la obra.
//
// El correo sirve para que lo lean en la oficina. En la obra no se lee un
// correo: se mira una hoja clavada en la pared del contenedor, y por eso tiene
// que entrar en una página y leerse de lejos.
//
// VA CON EL LOGO porque sale de la oficina. Un papel con las actividades de la
// semana que circula entre el contratista, el fiscalizador y el cliente sin
// decir quién lo emitió es un papel que después nadie reconoce como propio —y
// el plan semanal es justamente un documento que se discute.
//
// Y LO QUE QUEDÓ SIN HACER VA PRIMERO, igual que en el correo: un plan que
// solo dice lo que viene es optimista por construcción.

const TINTA = [15, 61, 62];
const GRIS = [107, 114, 128];
const AMBAR = [146, 64, 14];

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const comoSeLee = f => {
  const d = new Date(`${String(f).slice(0, 10)}T12:00:00`);
  return `${DIAS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
};

// jsPDF escribe en WinAnsi: las comillas curvas y las rayas salen como basura.
const seguro = t => String(t ?? "")
  .replace(/[«»]/g, '"').replace(/[—–]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'");

/**
 * @param dias   [{ fecha, horario, personal, permisos, consideraciones }]
 * @param items  [{ plan_dia_id, tipo, texto, hecha, motivo }]
 * @param quedaron lo de la semana anterior que no se hizo, con su motivo
 */
export async function pdfPlanSemanal({ proyecto, desde, hasta, dias = [], items = [], quedaron = [], logoUrl }) {
  const { jsPDF, autoTable } = await cargarPDF();
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const ancho = doc.internal.pageSize.getWidth();
  const margen = 40;
  let y = 38;

  // El logo. Si no carga —sin red, o el depósito caído— el documento sale
  // igual: un plan sin membrete sirve, un botón que no hace nada no.
  const logo = await logoParaPDF(logoUrl || logoEmpresa());
  if (logo) {
    const alto = 26;
    const w = (logo.width / logo.height) * alto;
    doc.addImage(logo.dataUrl, "PNG", margen, y - 8, w, alto);
  }

  doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.setTextColor(...TINTA);
  doc.text(seguro("Plan semanal de obra"), ancho - margen, y + 2, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...GRIS);
  doc.text(seguro(proyecto || ""), ancho - margen, y + 16, { align: "right" });
  doc.text(seguro(`Del ${comoSeLee(desde)} al ${comoSeLee(hasta)}`), ancho - margen, y + 29, { align: "right" });
  y += 48;
  doc.setDrawColor(...TINTA); doc.setLineWidth(1.2);
  doc.line(margen, y, ancho - margen, y);
  y += 16;

  if (quedaron.length) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...AMBAR);
    doc.text(seguro(`De la semana pasada quedaron ${quedaron.length} sin hacer`), margen, y);
    y += 13;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...GRIS);
    quedaron.forEach(q => {
      const t = seguro(`- ${q.texto} - ${q.motivo || "sin decir por que"}`);
      doc.splitTextToSize(t, ancho - margen * 2).forEach(linea => {
        if (y > 780) { doc.addPage(); y = 50; }
        doc.text(linea, margen, y); y += 11;
      });
    });
    y += 8;
  }

  const porDia = d => items.filter(i => i.plan_dia_id === d.id);

  dias.forEach(d => {
    const suyos = porDia(d);
    const tareas = suyos.filter(i => (i.tipo || "tarea") !== "material");
    const materiales = suyos.filter(i => i.tipo === "material");
    const campos = [
      d.horario && `Horario: ${d.horario}`,
      d.personal && `Personal: ${d.personal}`,
      d.permisos && `Permisos: ${d.permisos}`,
      d.consideraciones && `A tener en cuenta: ${d.consideraciones}`,
    ].filter(Boolean);
    if (!tareas.length && !materiales.length && !campos.length) return;

    if (y > 720) { doc.addPage(); y = 50; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...TINTA);
    doc.text(seguro(comoSeLee(d.fecha).replace(/^./, c => c.toUpperCase())), margen, y);
    y += 6;

    if (tareas.length) {
      autoTable(doc, {
        startY: y,
        // Sin encabezado: `headStyles: { fontSize: 0 }` no lo quita, lo dibuja
        // en tamaño cero y el texto igual se imprime — "Actividad" salía
        // encima de la primera fila de cada día.
        showHead: false,
        // La casilla vacía es para marcar en papel: la hoja se imprime el
        // lunes y se va tachando en la obra, donde nadie abre la app.
        body: tareas.map(t => [t.hecha ? "X" : "[ ]", seguro(t.texto)]),
        theme: "plain",
        margin: { left: margen, right: margen },
        styles: { fontSize: 9.5, cellPadding: { top: 3, bottom: 3, left: 2, right: 2 }, textColor: [17, 24, 39] },
        columnStyles: { 0: { cellWidth: 22, halign: "center", textColor: GRIS } },
      });
      y = doc.lastAutoTable.finalY + 4;
    }

    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...GRIS);
    if (materiales.length) {
      const t = seguro(`Material: ${materiales.map(m => m.texto).join(" - ")}`);
      doc.splitTextToSize(t, ancho - margen * 2).forEach(linea => {
        if (y > 790) { doc.addPage(); y = 50; }
        doc.text(linea, margen, y); y += 10;
      });
    }
    campos.forEach(c => {
      doc.splitTextToSize(seguro(c), ancho - margen * 2).forEach(linea => {
        if (y > 790) { doc.addPage(); y = 50; }
        doc.text(linea, margen, y); y += 10;
      });
    });
    y += 10;
  });

  // Pie con la página, para una hoja que se reparte y se vuelve a juntar.
  const total = doc.internal.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...GRIS);
    doc.text(seguro(`${proyecto || ""} · plan del ${comoSeLee(desde)} al ${comoSeLee(hasta)}`), margen, 820);
    doc.text(`${p} de ${total}`, ancho - margen, 820, { align: "right" });
  }
  return doc;
}
