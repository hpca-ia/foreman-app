import { cargarPDF } from "../../lib/exportar";
import { logoParaPDF } from "../../lib/logos";
import { logoEmpresa } from "../../lib/marca";

// El acta en PDF: el que se imprime, se firma y se archiva.
//
// El correo sirve para que llegue. El papel sirve para otra cosa: se firma en
// la reunión, se guarda en la carpeta de la obra, y es lo que se lleva a una
// mesa cuando hay que discutir algo. Son dos documentos del mismo contenido y
// los dos hacen falta.
//
// VA CON EL LOGO porque sale de la oficina y circula entre el cliente, la
// fiscalización y el contratista. Un acta que no dice quién la emitió es un
// papel que después nadie reconoce como propio.
//
// Y TERMINA CON LAS FIRMAS, una por asistente. Es la mitad de para qué existe
// el papel: un acta sin firmas es una versión de los hechos; con firmas es LA
// versión, y eso es lo que se puede oponer.

const TINTA = [15, 61, 62];
const NEGRO = [17, 24, 39];
const GRIS = [107, 114, 128];

const dia = f => (f
  ? new Date(`${String(f).slice(0, 10)}T12:00:00`).toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" })
  : "");
const hora = h => (h ? String(h).slice(0, 5) : "");

/**
 * @param modo  "abrir" para verlo antes de mandarlo, "imprimir" para la
 *   ventana de impresión, "bajar" para guardarlo. Previsualizar es lo que
 *   hace que alguien corrija una falta antes de que la lean ocho personas.
 */
export async function pdfActa({ acta, obra, asistentes = [], temas = [], compromisos = [], fotos = [], enlaces = {} }, modo = "abrir") {
  const { jsPDF, autoTable } = await cargarPDF();
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const ANCHO = doc.internal.pageSize.getWidth();
  const ALTO = doc.internal.pageSize.getHeight();
  const M = 16;
  let y = 14;

  // ── Encabezado ──
  try {
    const url = logoEmpresa();
    if (url) {
      const logo = await logoParaPDF(url);
      if (logo) doc.addImage(logo.dataUrl, "PNG", M, y, 26, (26 * logo.height) / logo.width);
    }
  } catch { /* sin logo se sigue: el acta importa más que el membrete */ }

  doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(...TINTA);
  doc.text(`ACTA DE REUNIÓN DE OBRA N° ${acta.numero}`, ANCHO - M, y + 6, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...NEGRO);
  doc.text(obra || "", ANCHO - M, y + 12, { align: "right" });
  doc.setFontSize(9); doc.setTextColor(...GRIS);
  const cuando = [dia(acta.fecha),
    acta.hora_inicio ? `${hora(acta.hora_inicio)}${acta.hora_fin ? ` a ${hora(acta.hora_fin)}` : ""}` : "",
    acta.lugar].filter(Boolean).join("  ·  ");
  doc.text(cuando, ANCHO - M, y + 17, { align: "right" });
  y += 24;
  doc.setDrawColor(...TINTA); doc.setLineWidth(0.5);
  doc.line(M, y, ANCHO - M, y);
  y += 7;

  const titulo = t => {
    if (y > ALTO - 34) { doc.addPage(); y = 18; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(...GRIS);
    doc.text(t, M, y); y += 5;
  };
  const parrafo = (t, { sangria = 0, negrita = false, color = NEGRO } = {}) => {
    if (!t) return;
    doc.setFont("helvetica", negrita ? "bold" : "normal"); doc.setFontSize(9.5); doc.setTextColor(...color);
    const lineas = doc.splitTextToSize(String(t), ANCHO - M * 2 - sangria);
    lineas.forEach(l => {
      if (y > ALTO - 22) { doc.addPage(); y = 18; }
      doc.text(l, M + sangria, y); y += 4.6;
    });
  };

  // ── Asistentes ──
  const vinieron = asistentes.filter(a => a.asistio);
  const faltaron = asistentes.filter(a => !a.asistio);
  titulo("ASISTENTES");
  vinieron.forEach(a => parrafo(`${a.nombre}${a.empresa ? `  ·  ${a.empresa}` : ""}${a.cargo ? `  ·  ${a.cargo}` : ""}`));
  if (!vinieron.length) parrafo("—", { color: GRIS });
  if (faltaron.length) {
    y += 1;
    parrafo(`No asistieron: ${faltaron.map(a => a.nombre).join(", ")}`, { color: GRIS });
  }
  y += 5;

  // ── Temas ──
  if (temas.length) {
    titulo("TEMAS TRATADOS");
    temas.forEach((t, i) => {
      parrafo(`${i + 1}. ${t.titulo}`, { negrita: true });
      if (t.detalle) parrafo(t.detalle, { sangria: 5 });
      if (t.resuelto) parrafo(`Se resuelve: ${t.resuelto}`, { sangria: 5, negrita: true, color: TINTA });
      y += 2.5;
    });
    y += 2;
  }

  // ── Compromisos ──
  //
  // EN DOS TABLAS Y NO EN UNA. El repaso de lo que venía de la reunión
  // anterior y los compromisos nuevos son dos cosas distintas para quien lee
  // el acta: la primera dice si la obra cumple lo que promete, la segunda dice
  // qué prometió ahora. Mezcladas, ninguna de las dos se puede leer.
  const tabla = (filas, cabeza) => {
    autoTable(doc, {
      startY: y, head: [cabeza], body: filas,
      margin: { left: M, right: M },
      styles: { fontSize: 8.5, cellPadding: 2.2, textColor: NEGRO, lineColor: [225, 222, 216], lineWidth: 0.1 },
      headStyles: { fillColor: TINTA, textColor: 255, fontSize: 7.5, fontStyle: "bold" },
      columnStyles: { 0: { cellWidth: "auto" }, 1: { cellWidth: 30 }, 2: { cellWidth: 28 }, 3: { cellWidth: 26 } },
    });
    y = doc.lastAutoTable.finalY + 7;
  };

  const vivos = compromisos.filter(c => c.estado !== "anulado");
  const repaso = vivos.filter(c => c.viene_de);
  const nuevos = vivos.filter(c => !c.viene_de);

  if (repaso.length) {
    if (y > ALTO - 50) { doc.addPage(); y = 18; }
    titulo("REPASO DE LA REUNIÓN ANTERIOR");
    tabla(repaso.map(c => [
      c.texto + (c.estado !== "cumplido" && c.nota ? `\n(${c.nota})` : ""),
      c.responsable_nombre || "—",
      c.fecha_limite ? dia(c.fecha_limite) : "—",
      c.estado === "cumplido" ? "CUMPLIDO" : c.estado === "reprogramado" ? "Reprogramado" : "PENDIENTE",
    ]), ["QUÉ SE HABÍA COMPROMETIDO", "QUIÉN", "PARA CUÁNDO", "¿SE HIZO?"]);
  }

  if (nuevos.length) {
    if (y > ALTO - 50) { doc.addPage(); y = 18; }
    titulo("COMPROMISOS DE ESTA REUNIÓN");
    tabla(nuevos.map(c => [
      c.texto, c.responsable_nombre || "—",
      c.fecha_limite ? dia(c.fecha_limite) : "—",
      { pendiente: "Pendiente", cumplido: "Cumplido", reprogramado: "Reprogramado" }[c.estado] || c.estado,
    ]), ["QUÉ", "QUIÉN", "PARA CUÁNDO", "ESTADO"]);
  }

  if (acta.avance_nota) { titulo("AVANCE DE LA OBRA"); parrafo(acta.avance_nota); y += 5; }
  if (acta.resumen) { titulo("OTRAS CONSTANCIAS"); parrafo(acta.resumen); y += 5; }

  if (acta.proxima_fecha) {
    parrafo(`Próxima reunión: ${dia(acta.proxima_fecha)}${acta.proxima_hora ? ` a las ${hora(acta.proxima_hora)}` : ""}`,
      { negrita: true, color: TINTA });
    y += 4;
  }

  // ── Fotos ──
  const conEnlace = fotos.filter(f => enlaces[f.storage_path]);
  if (conEnlace.length) {
    doc.addPage(); y = 18;
    titulo("REGISTRO FOTOGRÁFICO");
    const ancho = (ANCHO - M * 2 - 6) / 2;
    let x = M;
    for (const f of conEnlace) {
      try {
        const img = await logoParaPDF(enlaces[f.storage_path]);
        if (!img) continue;
        const alto = Math.min((ancho * img.height) / img.width, 70);
        if (y + alto > ALTO - 24) { doc.addPage(); y = 18; x = M; }
        doc.addImage(img.dataUrl, "JPEG", x, y, ancho, alto);
        if (f.descripcion) {
          doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...GRIS);
          doc.text(doc.splitTextToSize(f.descripcion, ancho), x, y + alto + 3.5);
        }
        if (x === M) { x = M + ancho + 6; } else { x = M; y += alto + 12; }
      } catch { /* una foto que no se puede bajar no frena el acta */ }
    }
    if (x !== M) y += 80;
  }

  // ── Firmas ──
  //
  // Una por asistente, en dos columnas. Un acta sin firmas es una versión de
  // los hechos; con firmas es LA versión, y es lo que se puede oponer.
  if (vinieron.length) {
    if (y > ALTO - 60) { doc.addPage(); y = 18; }
    y += 8;
    titulo("FIRMAS");
    y += 4;
    const ancho = (ANCHO - M * 2 - 12) / 2;
    vinieron.forEach((a, i) => {
      const col = i % 2;
      const x = M + col * (ancho + 12);
      if (col === 0 && y > ALTO - 28) { doc.addPage(); y = 24; }
      doc.setDrawColor(...GRIS); doc.setLineWidth(0.2);
      doc.line(x, y + 12, x + ancho, y + 12);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...NEGRO);
      doc.text(a.nombre || "", x, y + 16.5);
      if (a.empresa || a.cargo) {
        doc.setFontSize(7.5); doc.setTextColor(...GRIS);
        doc.text([a.cargo, a.empresa].filter(Boolean).join(" · "), x, y + 20);
      }
      if (col === 1) y += 28;
    });
    if (vinieron.length % 2 === 1) y += 28;
  }

  // Pie en todas las hojas: un acta suelta sin obra ni número no se archiva.
  const hojas = doc.internal.getNumberOfPages();
  for (let i = 1; i <= hojas; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...GRIS);
    doc.text(`${obra || ""} · Acta N° ${acta.numero} · ${dia(acta.fecha)}`, M, ALTO - 9);
    doc.text(`${i} de ${hojas}`, ANCHO - M, ALTO - 9, { align: "right" });
  }

  const nombre = `Acta ${acta.numero} - ${String(obra || "obra").replace(/[^\w\sáéíóúñÁÉÍÓÚÑ-]/g, "").trim().slice(0, 40)}.pdf`;
  if (modo === "bajar") { doc.save(nombre); return; }
  if (modo === "imprimir") { doc.autoPrint(); }
  // Previsualizar: se abre en una pestaña y se mira antes de que lo lean ocho
  // personas. Una falta de ortografía en un acta enviada no se corrige nunca.
  const url = doc.output("bloburl");
  window.open(url, "_blank", "noopener");
}
