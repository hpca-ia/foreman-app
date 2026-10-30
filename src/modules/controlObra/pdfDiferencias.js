import { cargarPDF } from "../../lib/exportar";
import { pieDePdf } from "../../lib/piePdf";
import { mostrarPdf } from "../../lib/abrirPdf";
import { logoParaPDF } from "../../lib/logos";
import { logoEmpresa } from "../../lib/marca";

// EL ANÁLISIS DE DIFERENCIAS, EN PAPEL.
//
// Cincuenta y un renglones no se deciden en una pantalla. Se imprimen, se
// miran en el escritorio con el presupuesto al lado, se marcan con lápiz y se
// discuten en una reunión — o se le mandan al residente para que diga cuáles
// ya estaban incluidas. Eso es trabajo de dos días y de dos personas, y hasta
// que no termina no hay orden de cambio que armar.
//
// Por eso el papel lleva TODO lo que hace falta para decidir sin la pantalla
// delante: qué trae la propuesta, contra qué rubro del contrato se comparó, con
// qué cantidad y a qué precio se contrató, y una columna en blanco para
// escribir la decisión a mano.

const TINTA = [15, 61, 62];
const NEGRO = [17, 24, 39];
const GRIS = [107, 114, 128];

const plata = v => (Number(v) || 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dia = f => (f ? new Date(`${String(f).slice(0, 10)}T12:00:00`)
  .toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" }) : "");

const GRUPOS = [
  ["nuevo", "NO ESTÁ EN EL CONTRATO", "Trabajo que el presupuesto no cubre. Hay que ponerle precio."],
  ["mas_cantidad", "MÁS CANTIDAD QUE LA CONTRATADA", "El rubro existe y su precio ya está acordado: se cobra la diferencia."],
  ["menos_cantidad", "MENOS CANTIDAD QUE LA CONTRATADA", "Trabajo contratado que no se hizo: se le devuelve al cliente."],
];

const DICE = { cobrar: "SE COBRA", incluido: "YA ESTABA", nuestro: "ES NUESTRO", pendiente: "" };

/**
 * @param analisis  la fila de obra_analisis
 * @param lineas    sus diferencias
 * @param rubros    los del contrato, para decir contra qué se comparó
 */
export async function pdfDiferencias({ analisis, lineas = [], rubros = [], obra, proyecto }, modo = "abrir") {
  const { jsPDF, autoTable } = await cargarPDF();
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const ANCHO = doc.internal.pageSize.getWidth();
  const M = 36;
  let y = 40;

  try {
    const url = logoEmpresa();
    if (url) {
      const logo = await logoParaPDF(url);
      if (logo) doc.addImage(logo.dataUrl, "PNG", M, y - 12, 70, (70 * logo.height) / logo.width);
    }
  } catch { /* sin logo se sigue */ }

  doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(...TINTA);
  doc.text("DIFERENCIAS CONTRA EL CONTRATO", ANCHO - M, y, { align: "right" });
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(...NEGRO);
  doc.text(proyecto || obra?.nombre || "", ANCHO - M, y + 14, { align: "right" });
  doc.setFontSize(8.5).setTextColor(...GRIS);
  doc.text([analisis?.archivo_nombre, analisis?.proveedor, dia(analisis?.created_at)].filter(Boolean).join("  ·  "),
    ANCHO - M, y + 27, { align: "right" });
  y += 44;

  const porRubro = new Map(rubros.map(r => [Number(r.id), r]));
  const n = v => Number(v) || 0;

  for (const [clave, titulo, pista] of GRUPOS) {
    const suyas = lineas.filter(l => l.hallazgo === clave);
    if (!suyas.length) continue;

    const suma = suyas.reduce((t, l) => t + n(l.monto), 0);
    doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...TINTA);
    doc.text(`${titulo}  ·  ${suyas.length}  ·  $${plata(suma)} de costo`, M, y);
    doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(...GRIS);
    doc.text(pista, M, y + 10);
    y += 18;

    autoTable(doc, {
      startY: y,
      head: [["QUÉ TRAE LA PROPUESTA", "CANT", "UNID", "COSTO", "CONTRA QUÉ RUBRO DEL CONTRATO", "CONTRATADO", "P. UNIT", "DECISIÓN"]],
      body: suyas.map(l => {
        const r = porRubro.get(Number(l.obra_rubro_id));
        const pu = r && n(r.cantidad) ? n(r.total_base) / n(r.cantidad) : null;
        return [
          l.descripcion,
          plata(l.cantidad), l.unidad || "",
          `$${plata(l.monto)}`,
          r ? `${r.numero || ""} ${r.descripcion || ""}`.trim()
            + (r.origen === "orden_cambio" ? "  (vino de una orden de cambio)" : "")
            : "— no hay rubro que lo cubra —",
          r ? `${plata(r.cantidad)} ${r.unidad || ""}`.trim() : "",
          pu == null ? "" : `$${plata(pu)}`,
          // La decisión tomada, o el espacio para escribirla a mano.
          DICE[l.decision] || "",
        ];
      }),
      theme: "grid",
      headStyles: { fillColor: [249, 250, 251], textColor: GRIS, fontSize: 7, fontStyle: "bold", lineColor: [229, 231, 235] },
      styles: { fontSize: 7.5, cellPadding: 4, lineColor: [229, 231, 235], textColor: NEGRO, minCellHeight: 16 },
      columnStyles: {
        0: { cellWidth: "auto" }, 1: { cellWidth: 36, halign: "right" }, 2: { cellWidth: 32, halign: "center" },
        3: { cellWidth: 52, halign: "right" }, 4: { cellWidth: 190 }, 5: { cellWidth: 60, halign: "right" },
        6: { cellWidth: 48, halign: "right" }, 7: { cellWidth: 62, halign: "center", fontStyle: "bold" },
      },
      margin: { left: M, right: M },
    });
    y = doc.lastAutoTable.finalY + 16;
  }

  // El total de lo que está en discusión, al pie: es el número de la reunión.
  const enJuego = lineas.filter(l => l.hallazgo !== "menos_cantidad").reduce((t, l) => t + n(l.monto), 0);
  const devolver = lineas.filter(l => l.hallazgo === "menos_cantidad").reduce((t, l) => t + n(l.monto), 0);
  if (y > doc.internal.pageSize.getHeight() - 70) { doc.addPage(); y = 44; }
  doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...NEGRO);
  doc.text(`En discusión: $${plata(enJuego)} de costo a cobrar`
    + (devolver ? `  ·  $${plata(devolver)} a devolver` : ""), M, y);
  doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(...GRIS);
  doc.text("Los precios son de costo, sin IVA. Lo que se le cobre al cliente sale de una orden de cambio,"
    + " con su margen y su IVA al pie.", M, y + 11);

  pieDePdf(doc, {
    elemento: `Diferencias · ${analisis?.archivo_nombre || ""}`.trim(),
    proyecto: proyecto || obra?.nombre, margen: M / 2.83, abajo: 9,
  });

  const nombre = `Diferencias - ${String(analisis?.archivo_nombre || "propuesta")
    .replace(/\.[a-z]+$/i, "").replace(/[^\w\sáéíóúñÁÉÍÓÚÑ-]/g, "").trim().slice(0, 50)}.pdf`;
  return mostrarPdf(doc, nombre, modo);
}
