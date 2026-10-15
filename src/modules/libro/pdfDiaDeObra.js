import { cargarPDF } from "../../lib/exportar";
import { mostrarPdf } from "../../lib/abrirPdf";
import { logoParaPDF, fotoParaPDF } from "../../lib/logos";
import { logoEmpresa } from "../../lib/marca";
import { CATEGORIAS } from "./libro";

// El libro de obra, en papel.
//
// El libro se escribe en el teléfono, a lo largo del día, y vive en una base
// de datos. Eso está bien para escribirlo y no sirve para lo único que un
// libro de obra tiene que hacer cuando hace falta: ser un documento. Un
// reclamo, una planilla discutida, una multa, un juicio — ahí nadie entra a
// FOREMAN: se pide "el libro", y el libro es un PDF firmado por fecha que no
// se puede haber escrito después.
//
// Por eso el día se cierra y en ese momento se imprime. Lo que quede escrito
// en ese PDF es lo que había el día que se cerró: si después se reabre y se
// corrige, se vuelve a imprimir y la reapertura queda dicha adentro, con su
// motivo. Un libro que se puede editar en silencio no vale como registro.

const TINTA = [15, 61, 62];
const GRIS = [107, 114, 128];
const AMBAR = [146, 64, 14];
const LINEA = [225, 225, 222];

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
  "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export const comoSeLee = f => {
  const d = new Date(`${String(f).slice(0, 10)}T12:00:00`);
  return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
};
const hora = t => (t ? new Date(t).toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" }) : "");

// jsPDF escribe en WinAnsi: las comillas curvas y las rayas salen como basura.
const seguro = t => String(t ?? "")
  .replace(/[«»]/g, '"').replace(/[—–]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'");

/**
 * Un día del libro, dibujado en el documento que se le pase.
 *
 * Separado de `pdfDiaDeObra` porque el libro completo es exactamente esto,
 * repetido: si cada día se dibujara distinto en el PDF del día y en el del
 * libro, a los seis meses serían dos documentos distintos de los mismos
 * hechos, y eso es justo lo que un libro de obra no puede permitirse.
 */
export async function paginaDelDia(doc, { dia, obra, entradas = [], fotos = [], enlaces = {}, logo }) {
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  const M = 40;
  let y = 38;

  const salto = (necesita = 40) => {
    if (y + necesita > alto - 50) { doc.addPage(); y = 44; }
  };

  if (logo) {
    const h = 24;
    doc.addImage(logo.dataUrl, "PNG", M, y - 8, (logo.width / logo.height) * h, h);
  }
  doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(...TINTA);
  doc.text("Libro de obra", ancho - M, y + 2, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...GRIS);
  doc.text(seguro(obra || ""), ancho - M, y + 15, { align: "right" });
  y += 34;

  doc.setDrawColor(...TINTA); doc.setLineWidth(1);
  doc.line(M, y, ancho - M, y);
  y += 16;

  doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...TINTA);
  doc.text(seguro(comoSeLee(dia.fecha)), M, y);
  y += 14;

  // La ficha del día: estado, clima, quién lo cerró. Es lo que convierte la
  // hoja en un registro y no en una nota.
  const ficha = [
    dia.estado === "aprobado" ? "APROBADO" : dia.estado === "cerrado" ? "CERRADO" : "ABIERTO",
    dia.clima ? `clima: ${dia.clima}` : "",
    dia.cerrado_at ? `cerrado el ${String(dia.fecha).slice(0, 10)} a las ${hora(dia.cerrado_at)}` : "",
    dia.aprobado_nombre ? `aprobado por ${dia.aprobado_nombre}` : "",
  ].filter(Boolean).join("   ·   ");
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...GRIS);
  doc.text(seguro(ficha), M, y);
  y += 16;

  // UNA REAPERTURA SE DICE, Y SE DICE ARRIBA.
  //
  // Un día que se volvió a abrir y se corrigió no es lo mismo que uno escrito
  // el día que pasó, y quien lea el libro tiene que saberlo antes de leer lo
  // que dice — no después, ni en una columna de la base que nadie mira.
  if (dia.reabierto_at) {
    doc.setFillColor(253, 246, 231); doc.setDrawColor(240, 217, 168);
    const texto = doc.splitTextToSize(seguro(
      `Este día se reabrió ${Number(dia.reaperturas) > 1 ? `${dia.reaperturas} veces` : "después de cerrado"}`
      + `${dia.reabierto_nombre ? `, por ${dia.reabierto_nombre}` : ""}`
      + `${dia.reabierto_motivo ? `: ${dia.reabierto_motivo}` : "."}`), ancho - M * 2 - 16);
    const h = texto.length * 10 + 12;
    doc.roundedRect(M, y - 8, ancho - M * 2, h, 4, 4, "FD");
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...AMBAR);
    doc.text(texto, M + 8, y + 2);
    y += h + 8;
  }

  if (dia.sin_novedades) {
    doc.setFont("helvetica", "italic"); doc.setFontSize(10); doc.setTextColor(...GRIS);
    doc.text("Sin novedades: la obra trabajó segun lo previsto y no hubo nada que registrar.", M, y + 4);
    y += 20;
  }

  // Las entradas, en el orden de las categorías y no en el que se escribieron:
  // el libro se escribe salteado a lo largo del día y se lee ordenado.
  for (const cat of CATEGORIAS) {
    const suyas = entradas.filter(e => e.categoria === cat.id);
    if (!suyas.length) continue;
    salto(50);
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...TINTA);
    doc.text(seguro(cat.label.toUpperCase()), M, y);
    y += 4;
    doc.setDrawColor(...LINEA); doc.setLineWidth(0.5);
    doc.line(M, y, ancho - M, y);
    y += 11;
    for (const e of suyas) {
      const lineas = doc.splitTextToSize(seguro(e.contenido), ancho - M * 2 - 10);
      salto(lineas.length * 11 + 14);
      doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(40, 40, 40);
      doc.text(lineas, M + 8, y);
      y += lineas.length * 11 + 2;
      doc.setFontSize(7.5); doc.setTextColor(...GRIS);
      doc.text(seguro(`${e.autor_nombre || "sin firma"} · ${hora(e.created_at)}`), M + 8, y);
      y += 12;
    }
    y += 4;
  }

  // Las fotos, dos por fila. Son la mitad del valor del libro: una foto con
  // fecha discute mejor que tres párrafos.
  const conEnlace = fotos.filter(f => enlaces[f.storage_path]);
  if (conEnlace.length) {
    salto(90);
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...TINTA);
    doc.text("FOTOS DEL DIA", M, y);
    y += 4;
    doc.setDrawColor(...LINEA); doc.setLineWidth(0.5);
    doc.line(M, y, ancho - M, y);
    y += 12;
    const anchoFoto = (ancho - M * 2 - 14) / 2;
    let x = M;
    for (const f of conEnlace) {
      const img = await fotoParaPDF(enlaces[f.storage_path]);
      if (!img) continue;
      const altoFoto = Math.min((anchoFoto * img.height) / img.width, 150);
      if (y + altoFoto + 22 > alto - 50) { doc.addPage(); y = 44; x = M; }
      doc.addImage(img.dataUrl, "JPEG", x, y, anchoFoto, altoFoto);
      if (f.descripcion) {
        doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...GRIS);
        doc.text(doc.splitTextToSize(seguro(f.descripcion), anchoFoto), x, y + altoFoto + 9);
      }
      if (x === M) { x = M + anchoFoto + 14; } else { x = M; y += altoFoto + 26; }
    }
    if (x !== M) y += 170;
  }

  return y;
}

/** Numera las hojas al final, que es cuando se sabe cuántas son. */
function numerar(doc, pie) {
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  const hojas = doc.internal.getNumberOfPages();
  for (let i = 1; i <= hojas; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...GRIS);
    doc.text(seguro(pie), 40, alto - 26);
    doc.text(`${i} de ${hojas}`, ancho - 40, alto - 26, { align: "right" });
  }
}

/**
 * El PDF de un día.
 *
 * @param modo "blob" para guardarlo, "abrir" para mirarlo, "imprimir" para la
 *   impresora. El que se guarda al cerrar el día va en blob: se sube al
 *   depósito y queda colgado del día para siempre.
 */
export async function pdfDiaDeObra({ dia, obra, entradas, fotos, enlaces }, modo = "abrir") {
  const { jsPDF } = await cargarPDF();
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const logo = await logoParaPDF(logoEmpresa());
  await paginaDelDia(doc, { dia, obra, entradas, fotos, enlaces, logo });
  numerar(doc, `${obra || ""} · libro de obra del ${String(dia.fecha).slice(0, 10)}`);

  const nombre = `Libro ${obra || "obra"} ${String(dia.fecha).slice(0, 10)}.pdf`;
  // El que se guarda al cerrar el día: se sube al depósito y queda colgado del
  // día para siempre.
  if (modo === "blob") return doc.output("blob");
  // En la obra la mitad de las pantallas son teléfonos, y ahí `window.open`
  // con un blob no abre: por eso se intenta abrir y, si no, se baja.
  return mostrarPdf(doc, nombre, modo);
}

/**
 * EL LIBRO ENTERO, de corrido.
 *
 * Es lo que se entrega: un solo documento con todos los días en orden, con su
 * índice. Cada día se dibuja exactamente igual que en su PDF suelto, para que
 * nadie pueda decir que son dos versiones distintas de lo mismo.
 */
export async function pdfLibroDeObra({ obra, dias = [], traerDia }, modo = "abrir") {
  const { jsPDF } = await cargarPDF();
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const ancho = doc.internal.pageSize.getWidth();
  const logo = await logoParaPDF(logoEmpresa());
  const M = 40;

  // Portada: qué es, de qué obra y qué período cubre. Un libro sin eso es un
  // montón de hojas.
  if (logo) {
    const h = 34;
    doc.addImage(logo.dataUrl, "PNG", M, 60, (logo.width / logo.height) * h, h);
  }
  doc.setFont("helvetica", "bold"); doc.setFontSize(24); doc.setTextColor(...TINTA);
  doc.text("Libro de obra", M, 150);
  doc.setFontSize(14); doc.setTextColor(40, 40, 40);
  doc.text(seguro(obra || ""), M, 172);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...GRIS);
  if (dias.length) {
    doc.text(seguro(`${dias.length} ${dias.length === 1 ? "día registrado" : "días registrados"}, `
      + `del ${comoSeLee(dias[0].fecha)} al ${comoSeLee(dias[dias.length - 1].fecha)}.`), M, 194);
  }
  doc.text(seguro(`Impreso el ${comoSeLee(new Date().toISOString().slice(0, 10))}.`), M, 210);

  let y = 240;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...TINTA);
  doc.text("INDICE", M, y); y += 12;
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(60, 60, 60);
  for (const d of dias) {
    if (y > doc.internal.pageSize.getHeight() - 60) { doc.addPage(); y = 50; }
    doc.text(seguro(`${comoSeLee(d.fecha)}${d.estado === "aprobado" ? " · aprobado" : d.estado === "cerrado" ? " · cerrado" : " · sin cerrar"}`), M + 8, y);
    y += 11;
  }

  for (const d of dias) {
    doc.addPage();
    const contenido = traerDia ? await traerDia(d) : { entradas: [], fotos: [], enlaces: {} };
    await paginaDelDia(doc, { dia: d, obra, logo, ...contenido });
  }
  numerar(doc, `${obra || ""} · libro de obra`);

  const nombre = `Libro de obra ${obra || ""}.pdf`.replace(/\s+/g, " ");
  if (modo === "blob") return doc.output("blob");
  return mostrarPdf(doc, nombre, modo);
}
