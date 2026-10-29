import { cargarPDF } from "../../lib/exportar";
import { pieDePdf } from "../../lib/piePdf";
import { mostrarPdf } from "../../lib/abrirPdf";
import { logoParaPDF } from "../../lib/logos";
import { logoEmpresa } from "../../lib/marca";

// La solicitud de compra en una hoja: lo que se lee para decidir.
//
// Nace para el correo. El que aprueba está en una obra con el teléfono, y lo
// que abre es el adjunto: tiene que poder leer de un vistazo qué se pide, para
// qué, cuánto, contra qué parte del presupuesto y quién lo pidió. Si para eso
// hay que entrar a una aplicación, la compra espera dos días.
//
// Y DESPUÉS SIRVE PARA LO OTRO. Una compra aprobada por correo necesita un
// papel que diga qué se aprobó: con el monto, la fecha y el nombre de quien dio
// el visto. Es lo que se adjunta a la factura cuando alguien pregunta, meses
// más tarde, por qué se compró eso.
//
// Una hoja y nada más: si no entra en una hoja, no se lee en el teléfono.

const TINTA = [15, 61, 62];
const NEGRO = [17, 24, 39];
const GRIS = [107, 114, 128];
const AMBAR = [146, 64, 14];

const dia = f => (f ? new Date(`${String(f).slice(0, 10)}T12:00:00`)
  .toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" }) : "");
const plata = v => `$${(Number(v) || 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * @param modo  "base64" para adjuntarlo al correo, "abrir" para mirarlo,
 *   "bajar" para guardarlo.
 */
export async function pdfSolicitud({ solicitud, obra, pidio, historial = [], adjuntos = [] }, modo = "base64") {
  const { jsPDF } = await cargarPDF();
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const ANCHO = doc.internal.pageSize.getWidth();
  const ALTO = doc.internal.pageSize.getHeight();
  const M = 16;
  let y = 14;

  try {
    const url = logoEmpresa();
    if (url) {
      const logo = await logoParaPDF(url);
      if (logo) doc.addImage(logo.dataUrl, "PNG", M, y, 26, (26 * logo.height) / logo.width);
    }
  } catch { /* sin logo se sigue: lo que importa es el pedido */ }

  doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...TINTA);
  doc.text("SOLICITUD DE COMPRA", ANCHO - M, y + 6, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...NEGRO);
  doc.text(obra || "Gasto de oficina", ANCHO - M, y + 12, { align: "right" });
  doc.setFontSize(8.5); doc.setTextColor(...GRIS);
  doc.text(`N° ${solicitud.id}  ·  pedida el ${dia(solicitud.created_at)}`, ANCHO - M, y + 17, { align: "right" });
  y += 24;
  doc.setDrawColor(...TINTA); doc.setLineWidth(0.5);
  doc.line(M, y, ANCHO - M, y);
  y += 8;

  // LO QUE SE PIDE, GRANDE. Es lo único que se lee en la vista previa del
  // adjunto en un teléfono.
  doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...NEGRO);
  doc.splitTextToSize(String(solicitud.descripcion || ""), ANCHO - M * 2).forEach(l => {
    doc.text(l, M, y); y += 6;
  });
  y += 1;

  if (solicitud.urgente) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...AMBAR);
    doc.text(`URGENTE${solicitud.necesita_para ? ` — se necesita para el ${dia(solicitud.necesita_para)}` : ""}`, M, y);
    y += 6;
  }

  const dato = (k, v) => {
    if (!v) return;
    if (y > ALTO - 30) { doc.addPage(); y = 18; }
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...GRIS);
    doc.text(k, M, y);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...NEGRO);
    const lineas = doc.splitTextToSize(String(v), ANCHO - M * 2 - 42);
    lineas.forEach((l, i) => { doc.text(l, M + 42, y + i * 5); });
    y += Math.max(6.5, lineas.length * 5 + 1.5);
  };

  dato("Monto estimado", solicitud.monto_estimado ? plata(solicitud.monto_estimado) : "sin estimar");
  dato("Para qué", solicitud.justificacion);
  dato("Dónde va", [solicitud.destino, solicitud.capitulo].filter(Boolean).join("  ·  "));
  dato("Clase", solicitud.clase);
  dato("Se necesita para", solicitud.necesita_para ? dia(solicitud.necesita_para) : "sin fecha");
  dato("La pidió", pidio || solicitud.solicitante_nombre);

  // EL MONTO, OTRA VEZ Y APARTE. Es el número sobre el que se decide, y en una
  // lista de datos se pierde entre los otros seis.
  if (solicitud.monto_estimado) {
    y += 2;
    doc.setFillColor(244, 247, 246); doc.setDrawColor(207, 224, 220);
    doc.roundedRect(M, y, ANCHO - M * 2, 14, 2, 2, "FD");
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...GRIS);
    doc.text("LO QUE SE APRUEBA", M + 5, y + 6);
    doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...TINTA);
    doc.text(plata(solicitud.monto_estimado), ANCHO - M - 5, y + 9.5, { align: "right" });
    y += 20;
  }

  if (adjuntos.length) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(...GRIS);
    doc.text("RESPALDOS", M, y); y += 5;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(...NEGRO);
    adjuntos.forEach(a => {
      if (y > ALTO - 26) { doc.addPage(); y = 18; }
      doc.text(`·  ${a.nombre || a.tipo || "respaldo"}`, M, y); y += 5;
    });
    doc.setFontSize(8.5); doc.setTextColor(...GRIS);
    doc.text("Van adjuntos en el mismo correo.", M, y); y += 7;
  }

  // LO QUE SE DIJO ANTES. Una compra que ya volvió una vez se aprueba distinto
  // si se sabe por qué volvió.
  const dicho = (historial || []).filter(h => h.comentario);
  if (dicho.length) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(...GRIS);
    doc.text("LO QUE SE DIJO", M, y); y += 5;
    dicho.forEach(h => {
      if (y > ALTO - 26) { doc.addPage(); y = 18; }
      doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(...NEGRO);
      doc.splitTextToSize(String(h.comentario), ANCHO - M * 2).forEach(l => { doc.text(l, M, y); y += 4.6; });
      doc.setFontSize(8); doc.setTextColor(...GRIS);
      doc.text(`${h.usuario_nombre || "—"}  ·  ${dia(h.created_at)}`, M, y); y += 6;
    });
  }

  // DÓNDE FIRMA EL QUE APRUEBA EN PAPEL. El visto se da por el correo, pero el
  // papel circula igual: va a la carpeta de la obra, se engrapa a la factura.
  if (y < ALTO - 42) y = ALTO - 42;
  else { doc.addPage(); y = ALTO - 42; }
  doc.setDrawColor(...GRIS); doc.setLineWidth(0.2);
  const mitad = (ANCHO - M * 2 - 12) / 2;
  [["LO PIDE", pidio || solicitud.solicitante_nombre], ["LO APRUEBA", solicitud.aprobador_nombre]].forEach(([rotulo, nombre], i) => {
    const x = M + i * (mitad + 12);
    doc.line(x, y + 10, x + mitad, y + 10);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...GRIS);
    doc.text(rotulo, x, y + 15);
    if (nombre) { doc.setFontSize(9.5); doc.setTextColor(...NEGRO); doc.text(String(nombre), x, y + 20); }
  });

  pieDePdf(doc, {
    elemento: `Solicitud de compra N° ${solicitud.id}`,
    proyecto: obra, margen: M, abajo: 9,
  });

  const nombre = `Compra ${solicitud.id} - ${String(solicitud.descripcion || "pedido")
    .replace(/[^\w\sáéíóúñÁÉÍÓÚÑ-]/g, "").trim().slice(0, 40)}.pdf`;
  if (modo === "base64") return { nombre, contenido: doc.output("datauristring").split(",")[1] };
  return mostrarPdf(doc, nombre, modo);
}
