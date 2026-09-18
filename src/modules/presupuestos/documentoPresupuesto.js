// El presupuesto como documento: lo que se le entrega al cliente, o lo que se
// le manda a un contratista para que ponga sus precios.
//
// Tres formatos, porque no es lo mismo presentar que pedir:
//   detallado  — cada rubro con cantidad, precio unitario y total
//   capitulos  — solo el total de cada capítulo, para el cliente que quiere
//                ver el número y no discutir el precio del bloque
//   cotizar    — rubros y cantidades sin precios: se manda a un proveedor
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

export const CONDICIONES_COTIZAR = "Indicar precios unitarios sin IVA, tiempo de entrega y forma de pago. Las cantidades son referenciales: se pagará lo ejecutado.";

const n = v => Number(v) || 0;
const r2 = v => Math.round(v * 100) / 100;

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

const aRgb = hex => {
  const m = String(hex || "").match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [15, 61, 62];
};
const suave = ([r, g, b]) => [Math.round(r + (255 - r) * 0.9), Math.round(g + (255 - g) * 0.9), Math.round(b + (255 - b) * 0.9)];
const fechaLarga = () => new Date().toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" });
const contacto = e => [e?.ciudad, e?.telefono, e?.email, e?.web].filter(Boolean);
const cantidad = v => (Number(v) || 0).toLocaleString("es-EC", { maximumFractionDigits: 2 });

/** Las filas de la tabla principal según el formato: [celdas], y cuáles son de capítulo. */
function tabla(caps, formato) {
  if (formato === "capitulos") {
    return {
      columnas: ["N°", "Capítulo", "Total"],
      filas: caps.map(c => [c.numero, c.nombre, money(c.subtotal)]),
      deCapitulo: [],
    };
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

export function pdfPresupuesto({ presupuesto, capitulos, items, formato = "detallado", logo, empresa = {}, titulo, validez, condiciones, conIva = true }) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const M = 42;
  const marca = aRgb(empresa.color);
  const tinta = [17, 24, 39], gris = [107, 114, 128];
  const caps = estructura({ capitulos, items });
  const tot = totalesDe(items, presupuesto, conIva);
  const nombreEmpresa = empresa.nombre || "HCA Studio";

  // ── Encabezado: el logo a la izquierda, la empresa a la derecha ──
  let alto = 0;
  if (logo) {
    const esc = Math.min(150 / logo.width, 54 / logo.height);
    const w = logo.width * esc, h = logo.height * esc;
    doc.addImage(logo.dataUrl, "PNG", M, 38, w, h);
    alto = h;
  }
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...tinta);
  doc.text(nombreEmpresa, W - M, 48, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...gris);
  const lineas = contacto(empresa);
  lineas.forEach((l, i) => doc.text(l, W - M, 61 + i * 11, { align: "right" }));
  let y = Math.max(38 + alto, 61 + lineas.length * 11) + 12;
  doc.setDrawColor(...marca); doc.setLineWidth(1.2); doc.line(M, y, W - M, y);
  y += 28;

  // ── Qué es y para quién ──
  doc.setFont("helvetica", "bold"); doc.setFontSize(17); doc.setTextColor(...tinta);
  doc.text(titulo || FORMATOS[formato].titulo, M, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...gris);
  doc.text(`${empresa.ciudad ? empresa.ciudad.split(",")[0] + ", " : ""}${fechaLarga()}`, W - M, y, { align: "right" });
  y += 12;
  // Al contratista que cotiza no se le dice para quién es la obra: con el
  // nombre del cliente en la mano, puede ir directo a ofrecerle.
  const datos = [
    ["Proyecto", presupuesto.nombre || ""],
    formato !== "cotizar" && ["Cliente", presupuesto.cliente_nombre || ""],
    formato !== "cotizar" && validez && ["Validez de la oferta", validez],
  ].filter(d => d && d[1]);
  autoTable(doc, {
    startY: y, body: datos, theme: "plain", margin: { left: M, right: M },
    styles: { fontSize: 9, cellPadding: { top: 2, bottom: 2, left: 0, right: 6 }, textColor: tinta },
    columnStyles: { 0: { cellWidth: 110, textColor: gris } },
  });
  y = doc.lastAutoTable.finalY + 16;

  // ── Los rubros ──
  const t = tabla(caps, formato);
  const anchos = formato === "capitulos"
    ? { 0: { cellWidth: 34 }, 2: { cellWidth: 90, halign: "right" } }
    : { 0: { cellWidth: 34 }, 2: { cellWidth: 42, halign: "center" }, 3: { cellWidth: 54, halign: "right" }, 4: { cellWidth: 66, halign: "right" }, 5: { cellWidth: 74, halign: "right" } };
  autoTable(doc, {
    startY: y, head: [t.columnas], body: t.filas, margin: { left: M, right: M, bottom: 50 },
    styles: { fontSize: 8, cellPadding: 4, textColor: tinta, lineColor: [228, 228, 225], lineWidth: 0.4, valign: "middle" },
    headStyles: { fillColor: marca, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7.5 },
    columnStyles: anchos,
    didParseCell: d => {
      if (d.section === "head" && d.column.index >= (formato === "capitulos" ? 2 : 3)) d.cell.styles.halign = "right";
      if (d.section === "body" && t.deCapitulo.includes(d.row.index)) {
        d.cell.styles.fillColor = suave(marca);
        d.cell.styles.fontStyle = "bold";
        d.cell.styles.textColor = marca;
      }
    },
  });
  y = doc.lastAutoTable.finalY + 10;

  // ── Totales, alineados a la derecha ──
  if (formato !== "cotizar") {
    const filas = [
      ["Subtotal", money(tot.subtotal)],
      tot.honorarios_pct > 0 && [`Honorarios (${cantidad(tot.honorarios_pct)}%)`, money(tot.honorarios)],
      conIva && [`IVA (${cantidad(tot.iva_pct)}%)`, money(tot.iva)],
      ["TOTAL", `$ ${money(tot.total)}`],
    ].filter(Boolean);
    if (y > H - 120) { doc.addPage(); y = 50; }
    autoTable(doc, {
      startY: y, body: filas, theme: "plain", margin: { left: W - M - 240, right: M },
      styles: { fontSize: 9, cellPadding: 4, textColor: tinta },
      columnStyles: { 0: { halign: "right", textColor: gris }, 1: { halign: "right", cellWidth: 100 } },
      didParseCell: d => {
        if (d.row.index === filas.length - 1) {
          d.cell.styles.fontStyle = "bold"; d.cell.styles.fontSize = 11;
          d.cell.styles.textColor = d.column.index === 0 ? tinta : marca;
          d.cell.styles.fillColor = suave(marca);
        }
      },
    });
    y = doc.lastAutoTable.finalY + 22;
    if (!conIva) {
      doc.setFont("helvetica", "italic"); doc.setFontSize(8); doc.setTextColor(...gris);
      doc.text("Los valores no incluyen IVA.", W - M, y - 10, { align: "right" });
      y += 6;
    }
  } else {
    y += 12;
  }

  // ── Condiciones ──
  const texto = String(condiciones || "").trim();
  if (texto) {
    const partes = doc.splitTextToSize(texto, W - 2 * M);
    if (y + 30 + partes.length * 11 > H - 60) { doc.addPage(); y = 50; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...marca);
    doc.text("Condiciones", M, y); y += 13;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...tinta);
    doc.text(partes, M, y); y += partes.length * 11 + 14;
  }

  // ── Firma: un presupuesto se firma; una solicitud de cotización, no ──
  if (formato !== "cotizar") {
    if (y > H - 110) { doc.addPage(); y = 60; }
    y += 36;
    doc.setDrawColor(...gris); doc.setLineWidth(0.5); doc.line(M, y, M + 180, y);
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(...tinta);
    doc.text(nombreEmpresa, M, y + 12);
  }

  // ── Pie en cada página ──
  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...gris);
    doc.text(`${nombreEmpresa} · ${presupuesto.nombre || ""}`, M, H - 24);
    doc.text(`Página ${i} de ${paginas}`, W - M, H - 24, { align: "right" });
  }
  return doc;
}

/**
 * El mismo documento en Excel, para el cliente que lo pide así: con el logo,
 * los colores de la marca y las cuentas vivas. Cada total es una fórmula —si
 * el cliente mueve una cantidad para ver qué pasa, el Excel se recalcula en vez
 * de quedar con un número que ya no cuadra—. En "Para cotizar" los precios
 * unitarios vienen vacíos y marcados: el contratista los llena y el total sale
 * solo.
 *
 * ExcelJS se carga recién al exportar: pesa, y el resto de la app no lo usa.
 */
export async function excelPresupuesto({ presupuesto, capitulos, items, formato = "detallado", logo, empresa = {}, titulo, validez, condiciones, conIva = true }) {
  const ExcelJS = (await import("exceljs")).default;
  const caps = estructura({ capitulos, items });
  const tot = totalesDe(items, presupuesto, conIva);
  const cotizar = formato === "cotizar";
  const soloCapitulos = formato === "capitulos";
  const hex = aRgb(empresa.color).map(v => v.toString(16).padStart(2, "0")).join("").toUpperCase();
  const hexSuave = suave(aRgb(empresa.color)).map(v => v.toString(16).padStart(2, "0")).join("").toUpperCase();
  const nombreEmpresa = empresa.nombre || "HCA Studio";
  const MARCA = "FF" + hex, SUAVE = "FF" + hexSuave, TINTA = "FF111827", GRIS = "FF6B7280", LINEA = "FFE4E4E1", LLENAR = "FFFFF8E1";

  const wb = new ExcelJS.Workbook();
  wb.creator = nombreEmpresa;
  const ws = wb.addWorksheet(FORMATOS[formato].label, {
    views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.7, header: 0.3, footer: 0.3 } },
    headerFooter: { oddFooter: `&L&8${nombreEmpresa} · ${presupuesto.nombre || ""}&R&8Página &P de &N` },
  });
  ws.columns = [{ width: 7 }, { width: 58 }, { width: 9 }, { width: 11 }, { width: 13 }, { width: 16 }];
  const fuente = (extra = {}) => ({ name: "Calibri", size: 10, color: { argb: TINTA }, ...extra });
  const relleno = argb => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
  const linea = argb => ({ style: "thin", color: { argb } });

  // ── Encabezado: logo a la izquierda, la empresa a la derecha ──
  if (logo) {
    const id = wb.addImage({ base64: logo.dataUrl, extension: "png" });
    const esc = Math.min(200 / logo.width, 64 / logo.height);
    ws.addImage(id, { tl: { col: 0.15, row: 0.4 }, ext: { width: logo.width * esc, height: logo.height * esc } });
  }
  [nombreEmpresa, ...contacto(empresa)].slice(0, 5).forEach((t, i) => {
    ws.mergeCells(i + 1, 3, i + 1, 6);
    const c = ws.getCell(i + 1, 3);
    c.value = t;
    c.alignment = { horizontal: "right", vertical: "middle" };
    c.font = i === 0 ? fuente({ size: 12, bold: true }) : fuente({ size: 9, color: { argb: GRIS } });
  });
  for (let r = 1; r <= 5; r++) ws.getRow(r).height = 16;
  for (let c = 1; c <= 6; c++) ws.getCell(6, c).border = { bottom: { style: "medium", color: { argb: MARCA } } };
  ws.getRow(6).height = 8;

  // ── Qué es y para quién ──
  ws.mergeCells(8, 1, 8, 4);
  ws.getCell(8, 1).value = titulo || FORMATOS[formato].titulo;
  ws.getCell(8, 1).font = fuente({ size: 18, bold: true });
  ws.getRow(8).height = 28;
  ws.mergeCells(8, 5, 8, 6);
  ws.getCell(8, 5).value = `${empresa.ciudad ? empresa.ciudad.split(",")[0] + ", " : ""}${fechaLarga()}`;
  ws.getCell(8, 5).font = fuente({ size: 9, color: { argb: GRIS } });
  ws.getCell(8, 5).alignment = { horizontal: "right", vertical: "middle" };

  let fila = 9;
  const datos = [
    ["Proyecto", presupuesto.nombre],
    !cotizar && ["Cliente", presupuesto.cliente_nombre],
    !cotizar && validez && ["Validez de la oferta", validez],
  ].filter(d => d && d[1]);
  datos.forEach(([k, v]) => {
    ws.mergeCells(fila, 1, fila, 6);
    ws.getCell(fila, 1).value = { richText: [{ text: `${k}:  `, font: fuente({ color: { argb: GRIS } }) }, { text: String(v), font: fuente({ bold: true }) }] };
    fila++;
  });
  fila++;

  // ── La tabla ──
  const inicioTabla = fila;
  const cabecera = soloCapitulos ? ["N°", "Capítulo", "", "", "", "Total"] : ["N°", "Descripción", "Unidad", "Cantidad", "P. unitario", "Total"];
  cabecera.forEach((t, i) => {
    const c = ws.getCell(fila, i + 1);
    c.value = t;
    c.font = fuente({ bold: true, color: { argb: "FFFFFFFF" }, size: 9 });
    c.fill = relleno(MARCA);
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
    ws.getCell(fila, 2).value = c.nombre.toUpperCase();
    if (soloCapitulos) {
      ws.mergeCells(fila, 2, fila, 5);
      ws.getCell(fila, 6).value = c.subtotal;
    } else {
      ws.getCell(fila, 6).value = { formula: `SUM(F${rubroIni}:F${rubroFin})`, result: cotizar ? 0 : c.subtotal };
    }
    for (let k = 1; k <= 6; k++) {
      const x = ws.getCell(fila, k);
      if (!soloCapitulos) { x.fill = relleno(SUAVE); x.font = fuente({ bold: true, color: { argb: MARCA } }); }
      else x.font = fuente();
      x.border = { bottom: linea(LINEA) };
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
  const finTabla = fila - 1;

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
    e.font = fuente(fuerte ? { bold: true, size: 12 } : { color: { argb: GRIS } });
    v.font = fuente(fuerte ? { bold: true, size: 12, color: { argb: MARCA } } : {});
    if (fuerte) { [e, v].forEach(x => { x.fill = relleno(SUAVE); }); ws.getRow(fila).height = 22; }
    return `F${fila++}`;
  };
  const sub = lineaTotal("Subtotal", celdasSubtotal.length ? celdasSubtotal.join("+") : "0", cotizar ? 0 : tot.subtotal);
  let hon = null;
  if (!cotizar && tot.honorarios_pct > 0) hon = lineaTotal(`Honorarios (${cantidad(tot.honorarios_pct)}%)`, `${sub}*${tot.honorarios_pct}/100`, tot.honorarios);
  const baseIva = hon ? `(${sub}+${hon})` : sub;
  const iva = conIva ? lineaTotal(`IVA (${cantidad(tot.iva_pct)}%)`, `${baseIva}*${tot.iva_pct}/100`, cotizar ? 0 : tot.iva) : null;
  lineaTotal("TOTAL", [sub, hon, iva].filter(Boolean).join("+"), cotizar ? 0 : tot.total, { fuerte: true });
  if (!conIva) {
    ws.mergeCells(fila, 3, fila, 6);
    ws.getCell(fila, 3).value = "Los valores no incluyen IVA.";
    ws.getCell(fila, 3).font = fuente({ size: 9, italic: true, color: { argb: GRIS } });
    ws.getCell(fila, 3).alignment = { horizontal: "right" };
    fila++;
  }

  // ── Condiciones ──
  const texto = String(condiciones || "").trim();
  if (texto) {
    fila++;
    ws.getCell(fila, 1).value = "Condiciones";
    ws.getCell(fila, 1).font = fuente({ bold: true, color: { argb: MARCA } });
    fila++;
    texto.split(/\n+/).forEach(l => {
      ws.mergeCells(fila, 1, fila, 6);
      const x = ws.getCell(fila, 1);
      x.value = l;
      x.font = fuente({ size: 9.5 });
      x.alignment = { wrapText: true, vertical: "top" };
      ws.getRow(fila).height = 14 * Math.max(1, Math.ceil(l.length / 110));
      fila++;
    });
  }
  ws.pageSetup.printArea = `A1:F${Math.max(fila, finTabla)}`;
  if (inicioTabla < 1) throw new Error("tabla vacía");

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
