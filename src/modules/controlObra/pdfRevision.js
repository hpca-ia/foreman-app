import { cargarPDF } from "../../lib/exportar";
import { pieDePdf } from "../../lib/piePdf";
import { mostrarPdf } from "../../lib/abrirPdf";
import { logoParaPDF } from "../../lib/logos";
import { logoEmpresa } from "../../lib/marca";
import { seguro, partirTexto } from "../../lib/textoDelPdf.js";

// LO QUE EL EXCEL TRAE MAL, EN UNA HOJA PARA MANDAR.
//
// La revisión encuentra sumas que no dan, filas que el propio Excel no suma,
// códigos repetidos, capítulos mal numerados. Eso se mira en la pantalla de
// quien importa y ahí se queda — y el que tiene que arreglarlo es otro: el
// contratista que armó la planilla, el proveedor que la mandó.
//
// Decírselo por teléfono no sirve: son catorce renglones con números de fila.
// Mandarle una captura de pantalla tampoco: no se puede buscar ni ordenar.
// Lo que sirve es una hoja con el número de fila de Excel al lado de cada
// cosa, para abrirla en la pantalla de al lado y corregir de arriba abajo.

const TINTA = [15, 61, 62];
const GRIS = [107, 114, 128];
const ROJO = [185, 28, 28];
const AMBAR = [146, 64, 14];
const LINEA = [225, 225, 222];

const hoy = () => new Date().toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" });

/**
 * @param modo "abrir" para mirarlo, "base64" para mandarlo por correo.
 */
export async function pdfRevision({ nombre, archivo, advertencias = [], quien }, modo = "abrir") {
  const { jsPDF } = await cargarPDF();
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const ANCHO = doc.internal.pageSize.getWidth();
  const ALTO = doc.internal.pageSize.getHeight();
  const M = 16;
  let y = 18;

  let logo = null;
  try { logo = await logoParaPDF(logoEmpresa()); } catch { /* sin logo se sigue */ }
  if (logo) {
    const h = 9;
    doc.addImage(logo.dataUrl, "PNG", M, y - 6, (logo.width / logo.height) * h, h);
  }
  doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...TINTA);
  doc.text("Revisión del presupuesto", ANCHO - M, y, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...GRIS);
  doc.text(seguro(nombre || ""), ANCHO - M, y + 5, { align: "right" });
  y += 12;
  doc.setDrawColor(...TINTA); doc.setLineWidth(0.5);
  doc.line(M, y, ANCHO - M, y);
  y += 7;

  const errores = advertencias.filter(a => a.nivel === "error");
  const avisos = advertencias.filter(a => a.nivel !== "error");

  // TODO TEXTO LARGO SE PARTE CON `partirTexto`, que pone la letra y parte con
  // ella (lib/textoDelPdf.js cuenta por qué).
  const intro = partirTexto(doc,
    `Archivo revisado: ${archivo || "el Excel del presupuesto"}. ${hoy()}.`
    + `${quien ? ` Revisado por ${quien}.` : ""}`
    + `\n\nEstos son los puntos que no cuadran en la planilla, con el número de fila de Excel al lado de cada uno.`
    + ` No son correcciones hechas: son cosas para revisar y corregir en el archivo original.`
    + ` Los marcados como ERROR cambian el total; los marcados como AVISO no cambian la plata pero complican el control de la obra.`,
    ANCHO - M * 2, "normal", 9);
  doc.setTextColor(60, 60, 60);
  doc.text(intro, M, y);
  y += intro.length * 4.4 + 5;

  doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(...TINTA);
  doc.text(seguro(`${errores.length} ${errores.length === 1 ? "error" : "errores"}  ·  ${avisos.length} ${avisos.length === 1 ? "aviso" : "avisos"}`), M, y);
  y += 7;

  const salto = (necesita = 20) => {
    if (y + necesita > ALTO - 18) { doc.addPage(); y = 18; }
  };

  const bloque = (titulo, lista, color) => {
    if (!lista.length) return;
    salto(16);
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(...color);
    doc.text(seguro(titulo), M, y);
    y += 2;
    doc.setDrawColor(...LINEA); doc.setLineWidth(0.3);
    doc.line(M, y, ANCHO - M, y);
    y += 5;

    lista.forEach((a, i) => {
      // CON SU LETRA, la de 9 con la que se escribe. Se partía con la que
      // hubiera quedado de lo anterior: desde el segundo punto, la de 7,8 de
      // las filas del punto de arriba. Cada renglón salía un sexto más largo
      // que su ancho —hasta 27 mm—: adentro del margen derecho y, si el corte
      // caía justo, 11 mm fuera del papel.
      const texto = partirTexto(doc, `${i + 1}. ${a.titulo}`, ANCHO - M * 2 - 4, "normal", 9);
      salto(texto.length * 4.2 + 8);
      doc.setTextColor(30, 30, 30);
      doc.text(texto, M + 4, y);
      y += texto.length * 4.2 + 1;

      // LAS FILAS, QUE ES LO QUE SE VA A BUSCAR EN EL EXCEL.
      (a.filas || []).slice(0, 40).forEach(f => {
        // Y la primera fila de cada punto se medía con la de 9 del título:
        // partía antes de llegar al margen, distinto de las que le seguían.
        const linea = partirTexto(doc, `fila ${f.fila}: ${f.texto}`, ANCHO - M * 2 - 12, "normal", 7.8);
        salto(linea.length * 3.8 + 3);
        doc.setTextColor(...GRIS);
        doc.text(linea, M + 9, y);
        y += linea.length * 3.8 + 0.6;
      });
      if ((a.filas || []).length > 40) {
        doc.setFontSize(7.8); doc.setTextColor(...GRIS);
        doc.text(seguro(`… y ${a.filas.length - 40} filas más del mismo caso.`), M + 9, y);
        y += 4;
      }
      y += 3;
    });
    y += 3;
  };

  bloque("ERRORES — cambian el total del presupuesto", errores, ROJO);
  bloque("AVISOS — no cambian la plata, complican el control", avisos, AMBAR);

  if (!advertencias.length) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...GRIS);
    doc.text("La planilla no tiene nada que corregir: las sumas dan y la numeración es consistente.", M, y);
  }

  pieDePdf(doc, { elemento: "Revisión del presupuesto", proyecto: nombre, margen: M, abajo: 9 });

  const archivoPdf = `Revisión - ${(nombre || "presupuesto").replace(/[^\w\sáéíóúñÁÉÍÓÚÑ-]/g, "").trim()}.pdf`;
  if (modo === "base64") return { nombre: archivoPdf, contenido: doc.output("datauristring").split(",")[1] };
  return mostrarPdf(doc, archivoPdf, modo);
}
