import { cargarPDF, exportarExcel } from "../../lib/exportar";
import { pieDePdf } from "../../lib/piePdf";
import { mostrarPdf } from "../../lib/abrirPdf";
import { logoParaPDF } from "../../lib/logos";
import { logoEmpresa } from "../../lib/marca";
import { renglonesDeLaMatriz } from "./presupuestoActualizado.js";

// EL PRESUPUESTO ACTUALIZADO, PARA MANDARLE AL CLIENTE.
//
// La pantalla es para nosotros. Lo que el cliente pidió es un documento: el
// Excel para que lo cruce con sus números, y el PDF para que lo lea y lo
// guarde. Los dos salen de los mismos renglones que la pantalla.

const TINTA = [15, 61, 62];
const NEGRO = [17, 24, 39];
const GRIS = [107, 114, 128];
const ROJO = [185, 28, 28];

const plata = v => (Number(v) || 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hoy = () => new Date().toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" });
const nombreLimpio = s => String(s || "obra").replace(/[^\w\sáéíóúñÁÉÍÓÚÑ-]/g, "").trim().slice(0, 50);

// Un movimiento se escribe con su signo; lo que no se movió queda en blanco.
const mov = v => (!v ? "" : `${v > 0 ? "+" : "-"}${plata(Math.abs(v))}`);
const cant = v => (!v ? "" : plata(v));

const COLUMNAS = ["N°", "DESCRIPCIÓN", "UND", "P. UNIT",
  "CANT", "TOTAL",
  "± CANT", "± TOTAL", "ORDEN",
  "CANT", "TOTAL",
  "± CANT", "± TOTAL", "ORDEN",
  "CANT", "TOTAL"];
const GRUPOS = [["", 4], ["PRESUPUESTO BASE", 2], ["ÓRDENES APROBADAS", 3], ["VIGENTE", 2], ["ÓRDENES POR APROBAR", 3], ["PROYECTADO", 2]];

/** Las órdenes que entran, dichas en una línea: es lo primero que el cliente va a preguntar. */
function queOrdenes(m) {
  return [
    m.aprobadas.length ? `Aprobadas: ${m.aprobadas.join(", ")}` : "Sin órdenes de cambio aprobadas",
    m.porAprobar.length ? `Por aprobar: ${m.porAprobar.join(", ")}` : "Ninguna orden espera aprobación",
  ].join("  ·  ");
}

export async function excelDelPresupuesto({ matriz, obra }) {
  const filas = [
    ["PRESUPUESTO ACTUALIZADO"],
    [obra?.nombre || ""],
    [`Al ${hoy()}  ·  ${queOrdenes(matriz)}`],
    ["Valores sin IVA. El impuesto se suma al pie."],
    [],
    GRUPOS.flatMap(([t, n]) => [t, ...Array(n - 1).fill("")]),
    COLUMNAS,
  ];
  for (const r of renglonesDeLaMatriz(matriz)) {
    if (r.tipo === "capitulo" || r.tipo === "bloque") {
      filas.push([r.tipo === "bloque" ? r.estado : "", r.nombre, "", "",
        "", r.sub.base || "", "", r.sub.aprobado || "", "", "", r.sub.vigente || "", "", r.sub.porAprobar || "", "", "", r.sub.proyectado || ""]);
    } else if (r.tipo === "fila") {
      filas.push([r.numero, r.descripcion, r.unidad, r.precio || "",
        r.base.cantidad || "", r.base.total || "",
        r.aprobado.cantidad || "", r.aprobado.total || "", r.aprobado.ordenes.join(", "),
        r.vigente.cantidad || "", r.vigente.total || "",
        r.porAprobar.cantidad || "", r.porAprobar.total || "", r.porAprobar.ordenes.join(", "),
        r.proyectado.cantidad || "", r.proyectado.total || ""]);
    } else {
      const v = r.valores;
      filas.push(["", r.etiqueta, "", "", "", v.base, "", v.aprobado, "", "", v.vigente, "", v.porAprobar, "", "", v.proyectado]);
    }
  }
  await exportarExcel(`Presupuesto actualizado - ${nombreLimpio(obra?.nombre)}`, [{
    nombre: "Presupuesto actualizado", filas,
    anchos: [8, 60, 7, 11, 10, 13, 10, 13, 12, 10, 13, 10, 13, 12, 10, 13],
  }]);
}

export async function pdfDelPresupuesto({ matriz, obra }, modo = "bajar") {
  const { jsPDF, autoTable } = await cargarPDF();
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const ANCHO = doc.internal.pageSize.getWidth();
  const M = 28;
  let y = 38;

  try {
    const url = logoEmpresa();
    if (url) {
      const logo = await logoParaPDF(url);
      if (logo) doc.addImage(logo.dataUrl, "PNG", M, y - 12, 64, (64 * logo.height) / logo.width);
    }
  } catch { /* sin logo se sigue */ }

  doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(...TINTA);
  doc.text("PRESUPUESTO ACTUALIZADO", ANCHO - M, y, { align: "right" });
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(...NEGRO);
  doc.text(obra?.nombre || "", ANCHO - M, y + 14, { align: "right" });
  doc.setFontSize(8).setTextColor(...GRIS);
  doc.text(`Al ${hoy()}  ·  ${queOrdenes(matriz)}`, ANCHO - M, y + 26, { align: "right" });
  y += 40;

  const gris = [249, 250, 251];
  const body = [];
  for (const r of renglonesDeLaMatriz(matriz)) {
    if (r.tipo === "capitulo" || r.tipo === "bloque") {
      const e = { fillColor: [243, 244, 246], fontStyle: "bold", textColor: [55, 65, 81] };
      const num = v => ({ content: v ? plata(v) : "", styles: { ...e, halign: "right" } });
      body.push([
        { content: r.tipo === "bloque" ? `${r.nombre}  ·  ${r.estado}` : r.nombre, colSpan: 5, styles: e },
        num(r.sub.base), { content: "", styles: e }, num(r.sub.aprobado), { content: "", styles: e },
        { content: "", styles: e }, num(r.sub.vigente), { content: "", styles: e }, num(r.sub.porAprobar),
        { content: "", styles: e }, { content: "", styles: e }, num(r.sub.proyectado),
      ]);
    } else if (r.tipo === "fila") {
      const rojo = v => (v < 0 ? { textColor: ROJO } : {});
      body.push([
        r.numero, r.descripcion, r.unidad, r.precio ? plata(r.precio) : "",
        cant(r.base.cantidad), r.base.total ? plata(r.base.total) : "",
        { content: mov(r.aprobado.cantidad), styles: rojo(r.aprobado.cantidad) },
        { content: mov(r.aprobado.total), styles: rojo(r.aprobado.total) }, r.aprobado.ordenes.join(", "),
        cant(r.vigente.cantidad), r.vigente.total ? plata(r.vigente.total) : "",
        { content: mov(r.porAprobar.cantidad), styles: rojo(r.porAprobar.cantidad) },
        { content: mov(r.porAprobar.total), styles: rojo(r.porAprobar.total) }, r.porAprobar.ordenes.join(", "),
        cant(r.proyectado.cantidad), r.proyectado.total ? plata(r.proyectado.total) : "",
      ]);
    } else {
      const e = { fontStyle: r.fuerte ? "bold" : "normal", fontSize: r.fuerte ? 7.5 : 6.8, textColor: r.fuerte ? NEGRO : GRIS, fillColor: gris };
      const num = v => ({ content: `$${plata(v)}`, styles: { ...e, halign: "right" } });
      const v = r.valores;
      body.push([
        { content: r.etiqueta, colSpan: 5, styles: { ...e, halign: "right" } },
        num(v.base), { content: "", styles: e }, num(v.aprobado), { content: "", styles: e },
        { content: "", styles: e }, num(v.vigente), { content: "", styles: e }, num(v.porAprobar),
        { content: "", styles: e }, { content: "", styles: e }, num(v.proyectado),
      ]);
    }
  }

  const cabeza = { fillColor: gris, textColor: GRIS, fontSize: 6.2, fontStyle: "bold", lineColor: [229, 231, 235], halign: "center" };
  autoTable(doc, {
    startY: y,
    head: [
      GRUPOS.map(([t, n]) => ({ content: t, colSpan: n, styles: { ...cabeza, textColor: t ? TINTA : GRIS } })),
      COLUMNAS,
    ],
    body,
    theme: "grid",
    headStyles: cabeza,
    styles: { fontSize: 6.5, cellPadding: 2.4, lineColor: [229, 231, 235], textColor: NEGRO, overflow: "linebreak" },
    columnStyles: {
      0: { cellWidth: 38 }, 1: { cellWidth: "auto" }, 2: { cellWidth: 22, halign: "center" }, 3: { cellWidth: 40, halign: "right" },
      4: { cellWidth: 36, halign: "right" }, 5: { cellWidth: 50, halign: "right" },
      6: { cellWidth: 36, halign: "right" }, 7: { cellWidth: 48, halign: "right" }, 8: { cellWidth: 36, halign: "center", fontSize: 5.8 },
      9: { cellWidth: 36, halign: "right" }, 10: { cellWidth: 50, halign: "right", fontStyle: "bold" },
      11: { cellWidth: 36, halign: "right" }, 12: { cellWidth: 48, halign: "right" }, 13: { cellWidth: 36, halign: "center", fontSize: 5.8 },
      14: { cellWidth: 36, halign: "right" }, 15: { cellWidth: 50, halign: "right", fontStyle: "bold" },
    },
    margin: { left: M, right: M, bottom: 34 },
    rowPageBreak: "avoid",
  });
  y = doc.lastAutoTable.finalY + 12;

  if (y > doc.internal.pageSize.getHeight() - 60) { doc.addPage(); y = 40; }
  doc.setFont("helvetica", "normal").setFontSize(7.2).setTextColor(...GRIS);
  [
    "BASE es el presupuesto contratado. APROBADAS es lo que cada orden de cambio aprobada aumentó o redujo en ese rubro. VIGENTE es la base más las aprobadas: el contrato de hoy.",
    "POR APROBAR son las órdenes de cambio que esperan aprobación: no forman parte del vigente. PROYECTADO es el vigente más lo que está por aprobar.",
    "Los valores de cada renglón son sin IVA; el impuesto se suma al pie. Los trabajos que no estaban en el presupuesto van al final, agrupados por su orden de cambio.",
  ].forEach((t, i) => doc.text(t, M, y + i * 10));

  pieDePdf(doc, { elemento: "Presupuesto actualizado", proyecto: obra?.nombre, margen: M / 2.83, abajo: 8 });
  return mostrarPdf(doc, `Presupuesto actualizado - ${nombreLimpio(obra?.nombre)}.pdf`, modo);
}
