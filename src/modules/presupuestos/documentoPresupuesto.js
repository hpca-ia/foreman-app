// El presupuesto como documento: lo que se le entrega al cliente, o lo que se
// le manda a un contratista para que ponga sus precios.
//
// Tres formatos, porque no es lo mismo presentar que pedir:
//   detallado  — cada rubro con cantidad, precio unitario y total
//   capitulos  — solo el total de cada capítulo, para el cliente que quiere
//                ver el número y no discutir el precio del bloque
//   cotizar    — rubros y cantidades sin precios: se manda a un proveedor
//
// Y cuatro plantillas de diseño. Ninguna usa el verde de la app: un documento
// que se firma se presenta sobrio, y el verde se veía informal.
//
// Todo sale de los rubros, no de los totales guardados: si alguien cambió una
// cantidad y el total del encabezado no alcanzó a recalcularse, el documento
// igual cuadra consigo mismo.

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { money } from "../../lib/exportar";

export const FORMATOS = {
  detallado: { label: "Detallado", titulo: "Presupuesto", ayuda: "Cada rubro con cantidad, precio unitario y total, agrupado por capítulo." },
  capitulos: { label: "Por capítulos", titulo: "Presupuesto", ayuda: "Solo el total de cada capítulo. Para el cliente que quiere ver el número, no el detalle." },
  cotizar: { label: "Para cotizar", titulo: "Solicitud de cotización", ayuda: "Rubros y cantidades, sin precios, para que un contratista o proveedor ponga los suyos." },
};

export const NOTAS_COTIZAR = [
  "Indicar precios unitarios sin IVA, tiempo de entrega y forma de pago.",
  "Las cantidades son referenciales: se pagará lo efectivamente ejecutado.",
];

// Colores en RGB. null = sin relleno: la plantilla se apoya en líneas.
export const PLANTILLAS = {
  clasica: {
    label: "Clásica", ayuda: "Blanco y negro, doble línea, títulos con serifa. La más formal.",
    fuenteTitulo: "times", encabezado: "doble",
    primario: [20, 20, 20], acento: [20, 20, 20], texto: [25, 25, 25], gris: [105, 105, 105], linea: [200, 200, 200],
    cabeceraFondo: [232, 232, 232], cabeceraTexto: [20, 20, 20], capFondo: [245, 245, 245], capTexto: [20, 20, 20],
    totalFondo: [20, 20, 20], totalTexto: [255, 255, 255],
  },
  ejecutiva: {
    label: "Ejecutiva", ayuda: "Azul marino sobrio, con una franja para el título.",
    fuenteTitulo: "helvetica", encabezado: "banda",
    primario: [31, 42, 68], acento: [31, 42, 68], texto: [28, 32, 42], gris: [105, 112, 125], linea: [214, 218, 226],
    cabeceraFondo: [31, 42, 68], cabeceraTexto: [255, 255, 255], capFondo: [233, 237, 244], capTexto: [31, 42, 68],
    totalFondo: [31, 42, 68], totalTexto: [255, 255, 255],
  },
  minimalista: {
    label: "Minimalista", ayuda: "Grises, mucho aire y líneas finas. Sin rellenos de color.",
    fuenteTitulo: "helvetica", encabezado: "limpio",
    primario: [30, 30, 30], acento: [30, 30, 30], texto: [30, 30, 30], gris: [125, 125, 125], linea: [222, 222, 222],
    cabeceraFondo: null, cabeceraTexto: [30, 30, 30], capFondo: null, capTexto: [30, 30, 30],
    totalFondo: null, totalTexto: [30, 30, 30],
  },
  estudio: {
    label: "Estudio", ayuda: "Grafito con un acento bronce. Para presentar como estudio de arquitectura.",
    fuenteTitulo: "times", encabezado: "acento",
    primario: [45, 45, 45], acento: [150, 118, 72], texto: [35, 35, 35], gris: [112, 112, 112], linea: [226, 221, 212],
    cabeceraFondo: [45, 45, 45], cabeceraTexto: [255, 255, 255], capFondo: [248, 245, 239], capTexto: [120, 90, 48],
    totalFondo: [45, 45, 45], totalTexto: [255, 255, 255],
  },
};

const n = v => Number(v) || 0;
const r2 = v => Math.round(v * 100) / 100;

/** "Casa Fowler (v3)" → { base: "Casa Fowler", version: 3 }. Sin "(vN)" es la versión 1. */
export function versionDe(nombre) {
  const m = String(nombre || "").match(/^(.*?)\s*\(v(\d+)\)\s*$/i);
  return m ? { base: m[1].trim(), version: Number(m[2]) } : { base: String(nombre || "").trim(), version: 1 };
}

/** Capítulos con sus rubros, numerados como en pantalla (1, 1.1, 1.2…) y sin capítulos vacíos. */
export function estructura({ capitulos = [], items = [] }) {
  const orden = [...capitulos].sort((a, b) => a.orden - b.orden).map(c => c.nombre);
  // Un rubro cuyo capítulo no está en la lista no se pierde: va al final.
  items.forEach(i => { if (i.capitulo && !orden.includes(i.capitulo)) orden.push(i.capitulo); });
  if (items.some(i => !i.capitulo)) orden.push("");
  const salida = [];
  orden.forEach(nombre => {
    const suyos = items.filter(i => (i.capitulo || "") === nombre).sort((a, b) => n(a.orden) - n(b.orden));
    if (!suyos.length) return;
    const num = salida.length + 1;
    salida.push({
      numero: String(num),
      nombre: nombre || "OTROS",
      subtotal: r2(suyos.reduce((s, i) => s + n(i.total), 0)),
      rubros: suyos.map((i, k) => ({
        numero: `${num}.${k + 1}`, descripcion: i.descripcion || "", unidad: i.unidad || "",
        cantidad: n(i.cantidad), precio_unitario: n(i.precio_unitario), total: n(i.total),
      })),
    });
  });
  return salida;
}

/**
 * Misma cuenta que la pantalla: honorarios sobre el subtotal, IVA sobre
 * subtotal más honorarios. Sin IVA es una decisión de presentación —hay
 * clientes a los que se les presenta sin—, no del presupuesto: su tasa no se
 * toca.
 */
export function totalesDe(items, presupuesto = {}, conIva = true) {
  const subtotal = r2(items.reduce((s, i) => s + n(i.total), 0));
  const honorarios_pct = n(presupuesto.honorarios_pct);
  const iva_pct = !conIva ? 0 : presupuesto.iva_pct == null ? 15 : n(presupuesto.iva_pct);
  const honorarios = r2(subtotal * honorarios_pct / 100);
  const iva = r2((subtotal + honorarios) * iva_pct / 100);
  return { subtotal, honorarios_pct, honorarios, iva_pct, iva, total: r2(subtotal + honorarios + iva) };
}

const fechaLarga = () => new Date().toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" });
const contacto = e => [e?.ciudad, e?.telefono, e?.email, e?.web].filter(Boolean);
const cantidad = v => (Number(v) || 0).toLocaleString("es-EC", { maximumFractionDigits: 2 });
const lugarYFecha = e => `${e?.ciudad ? e.ciudad.split(",")[0] + ", " : ""}${fechaLarga()}`;

/** Las filas de la tabla principal según el formato: [celdas], y cuáles son de capítulo. */
function tabla(caps, formato) {
  if (formato === "capitulos") {
    return { columnas: ["N°", "Capítulo", "Total"], filas: caps.map(c => [c.numero, c.nombre, money(c.subtotal)]), deCapitulo: [] };
  }
  const conPrecio = formato !== "cotizar";
  const filas = [], deCapitulo = [];
  caps.forEach(c => {
    deCapitulo.push(filas.length);
    filas.push([c.numero, c.nombre.toUpperCase(), "", "", "", conPrecio ? money(c.subtotal) : ""]);
    c.rubros.forEach(r => filas.push([r.numero, r.descripcion, r.unidad, cantidad(r.cantidad),
      conPrecio ? money(r.precio_unitario) : "", conPrecio ? money(r.total) : ""]));
  });
  return { columnas: ["N°", "Descripción", "Unidad", "Cantidad", "P. unitario", "Total"], filas, deCapitulo };
}

/**
 * @param notas  textos de las notas y condiciones, en orden
 * @param firma  { nombre, cargo }: quién firma, escrito a mano
 * @param aceptacion  espacio para que firme el cliente
 */
export function pdfPresupuesto({ presupuesto, capitulos, items, formato = "detallado", plantilla = "minimalista", logo, empresa = {},
  titulo, validez, conIva = true, notas = [], firma = {}, aceptacion = false, membrete }) {
  const t = PLANTILLAS[plantilla] || PLANTILLAS.minimalista;
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const M = 48;
  const caps = estructura({ capitulos, items });
  const tot = totalesDe(items, presupuesto, conIva);
  // El texto junto al logo lo escribe quien exporta, o no va: el logo ya dice
  // quién es. Sin membrete explícito, los datos de la empresa.
  const lineasMembrete = (membrete ?? [empresa.nombre || "HCA Studio", ...contacto(empresa)]).map(x => String(x || "").trim()).filter(Boolean);
  const nombreEmpresa = lineasMembrete[0] || "";
  const { base, version } = versionDe(presupuesto.nombre);
  const cotizar = formato === "cotizar";
  const tituloDoc = titulo || FORMATOS[formato].titulo;

  // Texto con espacio entre letras, centrado o a la izquierda. jsPDF no suma
  // el espaciado al centrar, así que se mide aparte.
  const espaciado = (txt, x, y, { centro = false, espacio = 0 } = {}) => {
    const ancho = doc.getTextWidth(txt) + espacio * Math.max(0, txt.length - 1);
    doc.text(txt, centro ? (W - ancho) / 2 : x, y, { charSpace: espacio });
  };

  // ── Membrete: logo a la izquierda, la empresa a la derecha ──
  let altoLogo = 0;
  if (logo) {
    const esc = Math.min(140 / logo.width, 50 / logo.height);
    doc.addImage(logo.dataUrl, "PNG", M, 40, logo.width * esc, logo.height * esc);
    altoLogo = logo.height * esc;
  }
  if (nombreEmpresa) {
    doc.setFont(t.fuenteTitulo, "bold"); doc.setFontSize(10.5); doc.setTextColor(...t.primario);
    doc.text(nombreEmpresa, W - M, 50, { align: "right" });
  }
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...t.gris);
  const lineas = lineasMembrete.slice(1);
  lineas.forEach((l, i) => doc.text(l, W - M, 62 + i * 10, { align: "right" }));
  const finMembrete = Math.max(40 + altoLogo, nombreEmpresa ? 62 + lineas.length * 10 : 40);
  const subtitulo = lugarYFecha(empresa);
  let y;

  // ── Título, según la plantilla ──
  if (t.encabezado === "doble") {
    y = finMembrete + 10;
    doc.setDrawColor(...t.primario); doc.setLineWidth(1.2); doc.line(M, y, W - M, y);
    doc.setLineWidth(0.4); doc.line(M, y + 3, W - M, y + 3);
    y += 32;
    doc.setFont("times", "bold"); doc.setFontSize(12.5); doc.setTextColor(...t.primario);
    espaciado(tituloDoc.toUpperCase(), 0, y, { centro: true, espacio: 1.8 });
    y += 13;
    doc.setFont("times", "italic"); doc.setFontSize(9); doc.setTextColor(...t.gris);
    espaciado(subtitulo, 0, y, { centro: true });
    y += 18;
  } else if (t.encabezado === "banda") {
    y = finMembrete + 16;
    doc.setFillColor(...t.primario); doc.rect(M, y, W - 2 * M, 26, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(255, 255, 255);
    espaciado(tituloDoc.toUpperCase(), M + 12, y + 16.5, { espacio: 1.2 });
    doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    doc.text(subtitulo, W - M - 12, y + 16.5, { align: "right" });
    y += 26 + 18;
  } else if (t.encabezado === "limpio") {
    y = finMembrete + 36;
    doc.setFont("helvetica", "normal"); doc.setFontSize(16); doc.setTextColor(...t.primario);
    doc.text(tituloDoc, M, y);
    y += 14;
    doc.setFontSize(8.5); doc.setTextColor(...t.gris);
    doc.text(subtitulo, M, y);
    y += 20;
  } else {
    y = finMembrete + 40;
    doc.setFont("times", "bold"); doc.setFontSize(12.5); doc.setTextColor(...t.primario);
    espaciado(tituloDoc.toUpperCase(), M, y, { espacio: 1.8 });
    doc.setDrawColor(...t.acento); doc.setLineWidth(1.4); doc.line(M, y + 8, M + 46, y + 8);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...t.gris);
    doc.text(subtitulo, W - M, y, { align: "right" });
    y += 28;
  }

  // ── Para quién y qué ──
  // Al contratista que cotiza no se le dice para quién es la obra: con el
  // nombre del cliente en la mano, puede ir directo a ofrecerle.
  const datos = [
    ["Proyecto", base],
    !cotizar && ["Cliente", presupuesto.cliente_nombre || ""],
    ["Versión", String(version)],
    !cotizar && validez && ["Validez de la oferta", validez],
  ].filter(d => d && d[1]);
  const conCaja = t.encabezado === "doble";
  autoTable(doc, {
    startY: y, body: datos, theme: "plain", margin: { left: M, right: M },
    tableLineColor: t.linea, tableLineWidth: conCaja ? 0.6 : 0,
    styles: { fontSize: 9, cellPadding: conCaja ? { top: 4, bottom: 4, left: 10, right: 6 } : { top: 2.5, bottom: 2.5, left: 0, right: 6 }, textColor: t.texto },
    columnStyles: { 0: { cellWidth: 120, textColor: t.gris }, 1: { fontStyle: "bold" } },
  });
  y = doc.lastAutoTable.finalY + 18;
  if (t.encabezado === "limpio") { doc.setDrawColor(...t.linea); doc.setLineWidth(0.6); doc.line(M, y - 8, W - M, y - 8); y += 6; }

  // ── Los rubros ──
  const tb = tabla(caps, formato);
  const soloCaps = formato === "capitulos";
  const anchos = soloCaps
    ? { 0: { cellWidth: 36 }, 2: { cellWidth: 100, halign: "right" } }
    : { 0: { cellWidth: 36 }, 2: { cellWidth: 44, halign: "center" }, 3: { cellWidth: 56, halign: "right" }, 4: { cellWidth: 66, halign: "right" }, 5: { cellWidth: 76, halign: "right" } };
  autoTable(doc, {
    startY: y, head: [tb.columnas], body: tb.filas, margin: { left: M, right: M, bottom: 56 },
    styles: { font: "helvetica", fontSize: 8, cellPadding: { top: 4.5, bottom: 4.5, left: 5, right: 5 }, textColor: t.texto,
      lineColor: t.linea, lineWidth: { bottom: 0.4 }, valign: "middle" },
    headStyles: { fillColor: t.cabeceraFondo || false, textColor: t.cabeceraTexto, fontStyle: "bold", fontSize: 7.5,
      lineColor: t.primario, lineWidth: t.cabeceraFondo ? 0 : { top: 0.8, bottom: 0.8 } },
    alternateRowStyles: { fillColor: t.cabeceraFondo ? [250, 250, 250] : false },
    columnStyles: anchos,
    didParseCell: d => {
      if (d.section === "head") {
        if (d.column.index >= (soloCaps ? 2 : 3)) d.cell.styles.halign = "right";
        if (!soloCaps && d.column.index === 2) d.cell.styles.halign = "center";
      }
      if (d.section === "body" && tb.deCapitulo.includes(d.row.index)) {
        d.cell.styles.fillColor = t.capFondo || false;
        d.cell.styles.fontStyle = "bold";
        d.cell.styles.textColor = t.capTexto;
        if (!t.capFondo) d.cell.styles.lineWidth = { top: 0.6, bottom: 0.4 };
        if (!t.capFondo) d.cell.styles.lineColor = t.primario;
      }
    },
  });
  y = doc.lastAutoTable.finalY + 12;

  // ── Totales, a la derecha ──
  if (!cotizar) {
    const filas = [
      ["Subtotal", money(tot.subtotal)],
      tot.honorarios_pct > 0 && [`Honorarios (${cantidad(tot.honorarios_pct)} %)`, money(tot.honorarios)],
      conIva && [`IVA (${cantidad(tot.iva_pct)} %)`, money(tot.iva)],
      ["TOTAL", `$ ${money(tot.total)}`],
    ].filter(Boolean);
    if (y > H - 130) { doc.addPage(); y = 56; }
    autoTable(doc, {
      startY: y, body: filas, theme: "plain", margin: { left: W - M - 250, right: M },
      styles: { fontSize: 9, cellPadding: { top: 4, bottom: 4, left: 8, right: 5 }, textColor: t.texto },
      columnStyles: { 0: { halign: "right", textColor: t.gris }, 1: { halign: "right", cellWidth: 110 } },
      didParseCell: d => {
        if (d.row.index !== filas.length - 1) return;
        d.cell.styles.fontStyle = "bold"; d.cell.styles.fontSize = 10.5;
        d.cell.styles.textColor = t.totalTexto;
        if (t.totalFondo) d.cell.styles.fillColor = t.totalFondo;
        else { d.cell.styles.lineWidth = { top: 1 }; d.cell.styles.lineColor = t.primario; }
      },
    });
    y = doc.lastAutoTable.finalY + 8;
    if (!conIva) {
      doc.setFont("helvetica", "italic"); doc.setFontSize(7.5); doc.setTextColor(...t.gris);
      doc.text("Los valores no incluyen IVA.", W - M, y + 4, { align: "right" });
      y += 10;
    }
    y += 16;
  } else {
    y += 10;
  }

  // ── Notas y condiciones, numeradas ──
  const lista = notas.map(x => String(x || "").trim()).filter(Boolean);
  if (lista.length) {
    if (y > H - 110) { doc.addPage(); y = 56; }
    doc.setFont(t.fuenteTitulo, "bold"); doc.setFontSize(9.5); doc.setTextColor(...t.acento);
    espaciado("NOTAS Y CONDICIONES", M, y, { espacio: 1.2 });
    y += 14;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.3); doc.setTextColor(...t.texto);
    lista.forEach((texto, i) => {
      const partes = doc.splitTextToSize(texto, W - 2 * M - 18);
      if (y + partes.length * 10.5 > H - 64) { doc.addPage(); y = 56; }
      doc.setTextColor(...t.gris); doc.text(`${i + 1}.`, M, y);
      doc.setTextColor(...t.texto); doc.text(partes, M + 18, y);
      y += partes.length * 10.5 + 4;
    });
    y += 10;
  }

  // ── Firmas ──
  const hayFirma = (firma.nombre || "").trim() || !cotizar;
  const conCliente = aceptacion && !cotizar;
  if (hayFirma || conCliente) {
    if (y + 86 > H - 50) { doc.addPage(); y = 70; }
    const yLinea = y + 42;
    doc.setDrawColor(...t.gris); doc.setLineWidth(0.5);
    const bloque = (x, rotulo, lineas) => {
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...t.gris);
      doc.text(rotulo.toUpperCase(), x, y);
      doc.line(x, yLinea, x + 190, yLinea);
      lineas.forEach(([txt, fuerte], k) => {
        doc.setFont("helvetica", fuerte ? "bold" : "normal"); doc.setFontSize(fuerte ? 9 : 8);
        doc.setTextColor(...(fuerte ? t.texto : t.gris));
        doc.text(txt, x, yLinea + 13 + k * 11);
      });
    };
    if (hayFirma) {
      bloque(M, "Elaborado por", [
        [(firma.nombre || "").trim() || " ", true],
        (firma.cargo || "").trim() && [firma.cargo.trim(), false],
        nombreEmpresa && [nombreEmpresa, false],
      ].filter(Boolean));
    }
    if (conCliente) {
      bloque(W - M - 190, "Aceptación del cliente", [
        [presupuesto.cliente_nombre || "Nombre:", true],
        ["Fecha:", false],
      ]);
    }
  }

  // ── Pie en cada página ──
  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setDrawColor(...t.linea); doc.setLineWidth(0.4); doc.line(M, H - 38, W - M, H - 38);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...t.gris);
    doc.text(`${tituloDoc} · ${base} · Versión ${version}`, M, H - 26);
    doc.text(`Página ${i} de ${paginas}`, W - M, H - 26, { align: "right" });
  }
  return doc;
}

const argb = c => "FF" + c.map(v => v.toString(16).padStart(2, "0")).join("").toUpperCase();

/**
 * El mismo documento en Excel, para el cliente que lo pide así: con el logo,
 * los colores de la plantilla y las cuentas vivas. Cada total es una fórmula
 * —si el cliente mueve una cantidad para ver qué pasa, el Excel se recalcula
 * en vez de quedar con un número que ya no cuadra—. En "Para cotizar" los
 * precios unitarios vienen vacíos y marcados: el contratista los llena y el
 * total sale solo.
 *
 * ExcelJS se carga recién al exportar: pesa, y el resto de la app no lo usa.
 */
export async function excelPresupuesto({ presupuesto, capitulos, items, formato = "detallado", plantilla = "minimalista", logo, empresa = {},
  titulo, validez, conIva = true, notas = [], firma = {}, aceptacion = false, membrete }) {
  const ExcelJS = (await import("exceljs")).default;
  const t = PLANTILLAS[plantilla] || PLANTILLAS.minimalista;
  const caps = estructura({ capitulos, items });
  const tot = totalesDe(items, presupuesto, conIva);
  const cotizar = formato === "cotizar";
  const soloCapitulos = formato === "capitulos";
  const lineasMembrete = (membrete ?? [empresa.nombre || "HCA Studio", ...contacto(empresa)]).map(x => String(x || "").trim()).filter(Boolean);
  const nombreEmpresa = lineasMembrete[0] || "";
  const { base, version } = versionDe(presupuesto.nombre);
  const tituloDoc = titulo || FORMATOS[formato].titulo;
  const PRIMARIO = argb(t.primario), TEXTO = argb(t.texto), GRIS = argb(t.gris), LINEA = argb(t.linea), ACENTO = argb(t.acento);
  const LLENAR = "FFFFF8E1";
  const letraTitulo = t.fuenteTitulo === "times" ? "Times New Roman" : "Calibri";

  const wb = new ExcelJS.Workbook();
  wb.creator = nombreEmpresa || "FOREMAN";
  const ws = wb.addWorksheet(FORMATOS[formato].label, {
    views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.6, right: 0.6, top: 0.6, bottom: 0.7, header: 0.3, footer: 0.3 } },
    headerFooter: { oddFooter: `&L&8${tituloDoc} · ${base} · Versión ${version}&R&8Página &P de &N` },
  });
  ws.columns = [{ width: 7 }, { width: 58 }, { width: 9 }, { width: 11 }, { width: 13 }, { width: 16 }];
  const fuente = (extra = {}) => ({ name: "Calibri", size: 10, color: { argb: TEXTO }, ...extra });
  const relleno = c => ({ type: "pattern", pattern: "solid", fgColor: { argb: typeof c === "string" ? c : argb(c) } });
  const linea = (c, style = "thin") => ({ style, color: { argb: c } });

  // ── Membrete ──
  if (logo) {
    const id = wb.addImage({ base64: logo.dataUrl, extension: "png" });
    const esc = Math.min(190 / logo.width, 60 / logo.height);
    ws.addImage(id, { tl: { col: 0.15, row: 0.4 }, ext: { width: logo.width * esc, height: logo.height * esc } });
  }
  lineasMembrete.slice(0, 5).forEach((txt, i) => {
    ws.mergeCells(i + 1, 3, i + 1, 6);
    const c = ws.getCell(i + 1, 3);
    c.value = txt;
    c.alignment = { horizontal: "right", vertical: "middle" };
    c.font = i === 0 ? fuente({ name: letraTitulo, size: 12, bold: true, color: { argb: PRIMARIO } }) : fuente({ size: 9, color: { argb: GRIS } });
  });
  for (let r = 1; r <= 5; r++) ws.getRow(r).height = 16;
  for (let c = 1; c <= 6; c++) ws.getCell(6, c).border = { bottom: linea(PRIMARIO, t.encabezado === "doble" ? "double" : "medium") };
  ws.getRow(6).height = 8;

  // ── Título ──
  ws.mergeCells(8, 1, 8, 6);
  const celdaTitulo = ws.getCell(8, 1);
  celdaTitulo.value = t.encabezado === "limpio" ? tituloDoc : tituloDoc.toUpperCase();
  celdaTitulo.font = fuente({ name: letraTitulo, size: 13, bold: t.encabezado !== "limpio", color: { argb: t.encabezado === "banda" ? "FFFFFFFF" : PRIMARIO } });
  celdaTitulo.alignment = { horizontal: t.encabezado === "doble" ? "center" : "left", vertical: "middle", indent: t.encabezado === "banda" ? 1 : 0 };
  if (t.encabezado === "banda") celdaTitulo.fill = relleno(t.primario);
  ws.getRow(8).height = 24;
  ws.mergeCells(9, 1, 9, 6);
  ws.getCell(9, 1).value = lugarYFecha(empresa);
  ws.getCell(9, 1).font = fuente({ size: 9, italic: t.encabezado === "doble", color: { argb: GRIS } });
  ws.getCell(9, 1).alignment = { horizontal: t.encabezado === "doble" ? "center" : "left" };

  let fila = 11;
  const datos = [
    ["Proyecto", base],
    !cotizar && ["Cliente", presupuesto.cliente_nombre],
    ["Versión", String(version)],
    !cotizar && validez && ["Validez de la oferta", validez],
  ].filter(d => d && d[1]);
  datos.forEach(([k, v]) => {
    ws.mergeCells(fila, 1, fila, 6);
    ws.getCell(fila, 1).value = { richText: [{ text: `${k}:  `, font: fuente({ color: { argb: GRIS } }) }, { text: String(v), font: fuente({ bold: true }) }] };
    fila++;
  });
  fila++;

  // ── La tabla ──
  const cabecera = soloCapitulos ? ["N°", "Capítulo", "", "", "", "Total"] : ["N°", "Descripción", "Unidad", "Cantidad", "P. unitario", "Total"];
  cabecera.forEach((txt, i) => {
    const c = ws.getCell(fila, i + 1);
    c.value = txt;
    c.font = fuente({ bold: true, size: 9, color: { argb: t.cabeceraFondo ? argb(t.cabeceraTexto) : PRIMARIO } });
    if (t.cabeceraFondo) c.fill = relleno(t.cabeceraFondo);
    else c.border = { top: linea(PRIMARIO), bottom: linea(PRIMARIO) };
    c.alignment = { horizontal: i >= 3 ? "right" : i === 2 ? "center" : "left", vertical: "middle" };
  });
  if (soloCapitulos) ws.mergeCells(fila, 2, fila, 5);
  ws.getRow(fila).height = 20;
  ws.pageSetup.printTitlesRow = `${fila}:${fila}`;          // se repite en cada hoja impresa
  fila++;

  const celdasSubtotal = [];
  caps.forEach(c => {
    const filaCap = fila;
    const rubroIni = fila + 1, rubroFin = fila + c.rubros.length;
    ws.getCell(fila, 1).value = c.numero;
    ws.getCell(fila, 2).value = soloCapitulos ? c.nombre : c.nombre.toUpperCase();
    if (soloCapitulos) {
      ws.mergeCells(fila, 2, fila, 5);
      ws.getCell(fila, 6).value = c.subtotal;
    } else {
      ws.getCell(fila, 6).value = { formula: `SUM(F${rubroIni}:F${rubroFin})`, result: cotizar ? 0 : c.subtotal };
    }
    for (let k = 1; k <= 6; k++) {
      const x = ws.getCell(fila, k);
      if (!soloCapitulos) {
        if (t.capFondo) x.fill = relleno(t.capFondo);
        x.font = fuente({ bold: true, color: { argb: argb(t.capTexto) } });
        x.border = t.capFondo ? { bottom: linea(LINEA) } : { top: linea(PRIMARIO), bottom: linea(LINEA) };
      } else {
        x.font = fuente();
        x.border = { bottom: linea(LINEA) };
      }
    }
    ws.getCell(fila, 6).numFmt = "#,##0.00";
    ws.getCell(fila, 6).alignment = { horizontal: "right" };
    celdasSubtotal.push(`F${filaCap}`);
    fila++;
    if (soloCapitulos) return;

    c.rubros.forEach(r => {
      const valores = [r.numero, r.descripcion, r.unidad, r.cantidad, cotizar ? null : r.precio_unitario,
        { formula: `D${fila}*E${fila}`, result: cotizar ? 0 : r2(r.cantidad * r.precio_unitario) }];
      valores.forEach((v, i) => {
        const x = ws.getCell(fila, i + 1);
        x.value = v;
        x.font = fuente();
        x.border = { bottom: linea(LINEA) };
        x.alignment = { vertical: "top", wrapText: i === 1, horizontal: i === 2 ? "center" : i >= 3 ? "right" : "left" };
        if (i === 3) x.numFmt = "#,##0.##";
        if (i >= 4) x.numFmt = "#,##0.00";
      });
      // Lo que el contratista tiene que llenar se ve distinto.
      if (cotizar) ws.getCell(fila, 5).fill = relleno(LLENAR);
      if (r.descripcion.length > 62) ws.getRow(fila).height = 15 * Math.ceil(r.descripcion.length / 62);
      fila++;
    });
  });

  // ── Totales: fórmulas, para que el Excel siga cuadrando si lo tocan ──
  fila++;
  const lineaTotal = (etiqueta, formula, result, { fuerte = false } = {}) => {
    ws.mergeCells(fila, 3, fila, 5);
    const e = ws.getCell(fila, 3), v = ws.getCell(fila, 6);
    e.value = etiqueta;
    e.alignment = { horizontal: "right", vertical: "middle" };
    v.value = { formula, result };
    v.numFmt = fuerte ? '"$ "#,##0.00' : "#,##0.00";
    v.alignment = { horizontal: "right", vertical: "middle" };
    e.font = fuente(fuerte ? { bold: true, size: 11, color: { argb: argb(t.totalTexto) } } : { color: { argb: GRIS } });
    v.font = fuente(fuerte ? { bold: true, size: 11, color: { argb: argb(t.totalTexto) } } : {});
    if (fuerte) {
      [e, v].forEach(x => { if (t.totalFondo) x.fill = relleno(t.totalFondo); else x.border = { top: linea(PRIMARIO, "medium") }; });
      ws.getRow(fila).height = 22;
    }
    return `F${fila++}`;
  };
  const sub = lineaTotal("Subtotal", celdasSubtotal.length ? celdasSubtotal.join("+") : "0", cotizar ? 0 : tot.subtotal);
  let hon = null;
  if (!cotizar && tot.honorarios_pct > 0) hon = lineaTotal(`Honorarios (${cantidad(tot.honorarios_pct)} %)`, `${sub}*${tot.honorarios_pct}/100`, tot.honorarios);
  const baseIva = hon ? `(${sub}+${hon})` : sub;
  const iva = conIva ? lineaTotal(`IVA (${cantidad(tot.iva_pct)} %)`, `${baseIva}*${tot.iva_pct}/100`, cotizar ? 0 : tot.iva) : null;
  lineaTotal("TOTAL", [sub, hon, iva].filter(Boolean).join("+"), cotizar ? 0 : tot.total, { fuerte: true });
  if (!conIva) {
    ws.mergeCells(fila, 3, fila, 6);
    ws.getCell(fila, 3).value = "Los valores no incluyen IVA.";
    ws.getCell(fila, 3).font = fuente({ size: 9, italic: true, color: { argb: GRIS } });
    ws.getCell(fila, 3).alignment = { horizontal: "right" };
    fila++;
  }

  // ── Notas y condiciones ──
  const lista = notas.map(x => String(x || "").trim()).filter(Boolean);
  if (lista.length) {
    fila++;
    ws.mergeCells(fila, 1, fila, 6);
    ws.getCell(fila, 1).value = "NOTAS Y CONDICIONES";
    ws.getCell(fila, 1).font = fuente({ name: letraTitulo, bold: true, color: { argb: ACENTO } });
    fila++;
    lista.forEach((txt, i) => {
      ws.getCell(fila, 1).value = `${i + 1}.`;
      ws.getCell(fila, 1).font = fuente({ size: 9.5, color: { argb: GRIS } });
      ws.getCell(fila, 1).alignment = { vertical: "top", horizontal: "right" };
      ws.mergeCells(fila, 2, fila, 6);
      const x = ws.getCell(fila, 2);
      x.value = txt;
      x.font = fuente({ size: 9.5 });
      x.alignment = { wrapText: true, vertical: "top" };
      ws.getRow(fila).height = 14 * Math.max(1, Math.ceil(txt.length / 100));
      fila++;
    });
  }

  // ── Firmas ──
  const hayFirma = (firma.nombre || "").trim() || !cotizar;
  const conCliente = aceptacion && !cotizar;
  if (hayFirma || conCliente) {
    fila += 3;
    const bloque = (col, lineas) => lineas.forEach(([txt, fuerte], k) => {
      const x = ws.getCell(fila + k, col);
      x.value = txt;
      x.font = fuente(fuerte ? { bold: true } : { size: 9, color: { argb: GRIS } });
      if (k === 0) x.border = { top: linea(GRIS) };
    });
    if (hayFirma) bloque(2, [[(firma.nombre || "").trim() || "Elaborado por", true], ...((firma.cargo || "").trim() ? [[firma.cargo.trim(), false]] : []), ...(nombreEmpresa ? [[nombreEmpresa, false]] : [])]);
    if (conCliente) {
      for (let k = 0; k < 3; k++) ws.mergeCells(fila + k, 4, fila + k, 6);
      bloque(4, [["Aceptación del cliente", true], [presupuesto.cliente_nombre || "Nombre:", false], ["Fecha:", false]]);
    }
    fila += 3;
  }
  ws.pageSetup.printArea = `A1:F${fila}`;

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
