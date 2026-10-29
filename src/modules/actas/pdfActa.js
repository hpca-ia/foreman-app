import { cargarPDF } from "../../lib/exportar";
import { pieDePdf } from "../../lib/piePdf";
import { mostrarPdf } from "../../lib/abrirPdf";
import { logoParaPDF, fotoParaPDF } from "../../lib/logos";
import { encajar } from "../../lib/encajar";
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

const fechaDe = f => new Date(`${String(f).slice(0, 10)}T12:00:00`);
const dia = f => (f ? fechaDe(f).toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" }) : "");
const hora = h => (h ? String(h).slice(0, 5) : "");
// En una columna de 26 mm "15 de octubre de 2026" no entra y se parte en tres
// renglones. En una tabla de compromisos la fecha se mira de reojo: con el día
// y el mes alcanza, y el año está en el encabezado del acta.
const breve = f => {
  const d = fechaDe(f);
  return `${d.getDate()} ${["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][d.getMonth()]}`;
};

/**
 * @param modo  "abrir" para verlo antes de mandarlo, "imprimir" para la
 *   ventana de impresión, "bajar" para guardarlo, "base64" para adjuntarlo al
 *   correo. Previsualizar es lo que hace que alguien corrija una falta antes
 *   de que la lean ocho personas.
 */
export async function pdfActa({ acta, obra, asistentes = [], temas = [], compromisos = [], fotos = [], adjuntos = [], enlaces = {} }, modo = "abrir") {
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
  // Las filas sin nombre no se imprimen: un renglón en blanco en la lista de
  // asistentes se lee como un asistente anónimo, y lo que es en realidad es
  // una fila que alguien agregó y no llenó.
  const vinieron = asistentes.filter(a => a.asistio && String(a.nombre || "").trim());
  const faltaron = asistentes.filter(a => !a.asistio && String(a.nombre || "").trim());
  const vacias = asistentes.filter(a => !String(a.nombre || "").trim()).length;
  titulo("ASISTENTES");
  vinieron.forEach(a => parrafo(`${a.nombre}${a.empresa ? `  ·  ${a.empresa}` : ""}${a.cargo ? `  ·  ${a.cargo}` : ""}`));
  if (!vinieron.length) {
    parrafo(vacias
      ? `${vacias} ${vacias === 1 ? "fila de asistente sin llenar" : "filas de asistentes sin llenar"}: falta escribir los nombres.`
      : "—", { color: GRIS });
  }
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
  // LA TABLA DE COMPROMISOS, CON AIRE PARA LOS NOMBRES.
  //
  // "Quién" tenía treinta milímetros, y en una reunión de obra el responsable
  // se escribe "Especialidades / Instalaciones" o "Proveedor de detección de
  // incendios". En esa columna eso se parte en cuatro renglones de dos
  // palabras, desalineados contra un texto que ocupa dos: la tabla se lee
  // como un borrador, y un acta no puede verse como un borrador.
  //
  // Y todo alineado ARRIBA: con el centrado, una celda de cuatro renglones
  // deja a sus vecinas flotando en el medio y las filas dejan de leerse como
  // filas.
  const tabla = (filas, cabeza) => {
    autoTable(doc, {
      startY: y, head: [cabeza], body: filas,
      margin: { left: M, right: M },
      styles: { fontSize: 8.5, cellPadding: { top: 2.6, bottom: 2.6, left: 2.4, right: 2.4 },
        textColor: NEGRO, lineColor: [225, 222, 216], lineWidth: 0.1, valign: "top" },
      headStyles: { fillColor: TINTA, textColor: 255, fontSize: 7.5, fontStyle: "bold", valign: "middle" },
      columnStyles: {
        0: { cellWidth: "auto" },
        1: { cellWidth: 44 },
        2: { cellWidth: 26, halign: "center" },
        3: { cellWidth: 22, halign: "center", fontStyle: "bold", fontSize: 7.5 },
      },
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
      (c.urgente && c.estado !== "cumplido" ? "URGENTE · " : "")
        + c.texto + (c.estado !== "cumplido" && c.nota ? `\n(${c.nota})` : ""),
      c.responsable_nombre || "—",
      c.fecha_limite ? breve(c.fecha_limite) : "—",
      c.estado === "cumplido" ? "SÍ" : c.estado === "reprogramado" ? "repr." : "NO",
    ]), ["QUÉ SE HABÍA COMPROMETIDO", "QUIÉN", "PARA CUÁNDO", "¿SE HIZO?"]);
  }

  if (nuevos.length) {
    if (y > ALTO - 50) { doc.addPage(); y = 18; }
    titulo("COMPROMISOS DE ESTA REUNIÓN");
    tabla(nuevos.map(c => [
      (c.urgente ? "URGENTE · " : "") + c.texto, c.responsable_nombre || "—",
      c.fecha_limite ? breve(c.fecha_limite) : "—",
      { pendiente: "Pend.", cumplido: "Hecho", reprogramado: "Repr." }[c.estado] || c.estado,
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
  //
  // LA LLAVE ERA LA EQUIVOCADA Y NO SE VEÍA NINGUNA. `enlacesFirmados` las
  // indexa por el ID de la foto —así las usa la pantalla— y acá se las buscaba
  // por `storage_path`: el resultado era siempre vacío, así que el acta salía
  // SIEMPRE sin registro fotográfico y sin decir nada.
  const conFoto = [];
  for (const f of fotos) {
    const url = enlaces[f.id];
    if (!url) continue;
    try {
      const img = await fotoParaPDF(url);
      if (img) conFoto.push({ f, img });
    } catch { /* una foto que no se puede bajar no frena el acta */ }
  }

  if (conFoto.length) {
    doc.addPage(); y = 18;
    titulo("REGISTRO FOTOGRÁFICO");
    // De a dos, y la fila se mide antes de dibujarla: así ninguna queda
    // partida entre dos hojas ni se monta sobre el pie de la anterior.
    const anchoFoto = (ANCHO - M * 2 - 6) / 2;
    for (let i = 0; i < conFoto.length; i += 2) {
      const fila = conFoto.slice(i, i + 2);
      // CADA FOTO ENTERA Y SIN DEFORMAR. Antes se le daba el ancho de la
      // columna y el alto recortado al tope: una foto vertical —que es como se
      // saca casi toda foto de obra— salía gorda y baja. `encajar` recorta los
      // dos lados en la misma proporción y la centra en su columna.
      const cajas = fila.map(({ img }) => encajar(img, { ancho: anchoFoto, alto: 70 }));
      const pies = fila.map(({ f }) => (f.descripcion
        ? doc.splitTextToSize(String(f.descripcion), anchoFoto) : []));
      const altoPie = Math.max(0, ...pies.map(l => l.length * 3.6));
      const necesita = Math.max(...cajas.map(c => c.h)) + altoPie + 7;
      if (y + necesita > ALTO - 24) { doc.addPage(); y = 18; }
      fila.forEach(({ img }, k) => {
        const x = M + k * (anchoFoto + 6);
        doc.addImage(img.dataUrl, "JPEG", x + cajas[k].dx, y, cajas[k].w, cajas[k].h);
        if (pies[k].length) {
          doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...GRIS);
          doc.text(pies[k], x, y + cajas[k].h + 3.5);
        }
      });
      y += necesita;
    }
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

  // ── De quién es este documento ──
  //
  // Quien la redactó responde por lo que dice; quien le dio el visto responde
  // por que haya salido con el nombre de la empresa. Los dos nombres estaban
  // guardados desde el principio y no aparecían en ninguna parte: un acta que
  // no dice de quién es no se le puede reclamar a nadie, y es justo lo que se
  // pregunta el que la recibe seis meses después.
  if (acta.creado_nombre || acta.revisada_nombre) {
    if (y > ALTO - 30) { doc.addPage(); y = 18; }
    y += 4;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...GRIS);
    const quien = [
      acta.creado_nombre ? `Redactada por ${acta.creado_nombre}` : "",
      acta.revisada_nombre
        ? `revisada y aprobada por ${acta.revisada_nombre}${acta.revisada_at ? ` el ${dia(String(acta.revisada_at).slice(0, 10))}` : ""}`
        : "",
    ].filter(Boolean).join("  ·  ");
    doc.text(quien, M, y);
    y += 6;
  }

  // ── Anexos: nombrados, aunque no estén pegados al papel ──
  if (adjuntos.length) {
    if (y > ALTO - 40) { doc.addPage(); y = 18; }
    titulo("ANEXOS");
    adjuntos.forEach(a => parrafo(`· ${a.nombre}${a.descripcion ? `  —  ${a.descripcion}` : ""}`));
    y += 4;
  }

  // ── A QUIÉN SE LE MANDA ──
  //
  // El papel tiene que decir a quién le llegó. Es la mitad de para qué sirve
  // un acta: no alcanza con que algo esté escrito, hay que poder mostrar que
  // se le comunicó a quien correspondía. "Se lo dijimos en la reunión" no se
  // puede probar; "se envió el 14 de octubre a estas siete direcciones" sí.
  const conCorreo = asistentes.filter(a => a.recibe && a.email);
  if (conCorreo.length) {
    if (y > ALTO - 40) { doc.addPage(); y = 18; }
    y += 4;
    titulo(acta.enviada_at ? "ENVIADA A" : "SE ENVÍA A");
    conCorreo.forEach(a => parrafo(`${a.nombre || "(sin nombre)"}${a.empresa ? `  ·  ${a.empresa}` : ""}  —  ${a.email}`, { color: GRIS }));
    if (acta.enviada_at) {
      y += 1;
      parrafo(`Enviada el ${dia(String(acta.enviada_at).slice(0, 10))}.`, { color: GRIS });
    }
    y += 4;
  }

  // Pie en todas las hojas: un acta suelta sin obra ni número no se archiva.
  pieDePdf(doc, { elemento: `Acta N° ${acta.numero} del ${dia(acta.fecha)}`, proyecto: obra, margen: M, abajo: 9 });

  const nombre = `Acta ${acta.numero} - ${String(obra || "obra").replace(/[^\w\sáéíóúñÁÉÍÓÚÑ-]/g, "").trim().slice(0, 40)}.pdf`;
  // Para adjuntarlo al correo: el PDF se arma acá, en el navegador, porque es
  // donde están las fotos firmadas y la librería. Sale en base64 y viaja con
  // el pedido de envío.
  if (modo === "base64") return { nombre, contenido: doc.output("datauristring").split(",")[1] };
  // Previsualizar: se abre en una pestaña y se mira antes de que lo lean ocho
  // personas. Una falta de ortografía en un acta enviada no se corrige nunca.
  // En el teléfono la pestaña no se puede abrir y se baja el archivo, que es
  // lo que uno quiere igual para mandarlo por WhatsApp.
  return mostrarPdf(doc, nombre, modo);
}
