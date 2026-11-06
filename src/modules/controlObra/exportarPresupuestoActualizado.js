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
//
// La columna del AJUSTE A MANO va solo cuando hay una simulación: en el papel
// de todos los días no hay nada que proyectar, y dos columnas vacías son dos
// columnas que alguien pregunta para qué están.

const TINTA = [15, 61, 62];
const NEGRO = [17, 24, 39];
const GRIS = [107, 114, 128];
const ROJO = [185, 28, 28];
const VIOLETA = [109, 40, 217];

const plata = v => (Number(v) || 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hoy = () => new Date().toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" });
const nombreLimpio = s => String(s || "obra").replace(/[^\w\sáéíóúñÁÉÍÓÚÑ-]/g, "").trim().slice(0, 50);

// Un movimiento se escribe con su signo; lo que no se movió queda en blanco.
const mov = v => (!v ? "" : `${v > 0 ? "+" : "-"}${plata(Math.abs(v))}`);
const cant = v => (!v ? "" : plata(v));
const pesos = v => `${v < 0 ? "-" : ""}${plata(Math.abs(v))}`;
// Un rubro escrito a mano que todavía no tiene precio va con su aviso: en un
// papel, un renglón con el total en blanco parece un error.
const descripcion = r => r.descripcion + (r.proyectada && !r.manual.total ? " (por cotizar: todavía no suma)" : "");

const columnas = conAjuste => ["N°", "DESCRIPCIÓN", "UND", "P. UNIT",
  "CANT", "TOTAL",
  "± CANT", "± TOTAL", "ORDEN",
  "CANT", "TOTAL",
  "± CANT", "± TOTAL", "ORDEN",
  ...(conAjuste ? ["± CANT", "± TOTAL"] : []),
  "CANT", "TOTAL"];
const grupos = conAjuste => [["", 4], ["PRESUPUESTO BASE", 2], ["ÓRDENES APROBADAS", 3], ["VIGENTE", 2],
  ["ÓRDENES POR APROBAR", 3], ...(conAjuste ? [["AJUSTE A MANO", 2]] : []), ["PROYECTADO", 2]];
const ORDENES = ["ORDEN", "TÍTULO", "ESTADO", "ADICIONES", "REDUCCIONES", "NETO", "HONORARIOS", "SUBTOTAL SIN IVA", "IVA", "TOTAL"];

/** Las órdenes que entran, dichas en una línea: es lo primero que el cliente va a preguntar. */
function queOrdenes(m) {
  return [
    m.aprobadas.length ? `Aprobadas: ${m.aprobadas.join(", ")}` : "Sin órdenes de cambio aprobadas",
    m.porAprobar.length ? `Por aprobar: ${m.porAprobar.join(", ")}` : "Ninguna orden espera aprobación",
  ].join("  ·  ");
}

/** El cuadro de las órdenes, cada una con su valor entero: filas de números. */
function filasDeOrdenes(m, texto = v => v) {
  const fila = o => [o.codigo, o.titulo, o.estado, texto(o.adiciones), texto(-Math.abs(o.reducciones) || 0), texto(o.neto),
    texto(o.honorarios), texto(o.subtotal), texto(o.iva), texto(o.total)];
  const total = (etiqueta, x) => ["", etiqueta, "", "", "", texto(x.neto), texto(x.honorarios), texto(x.subtotal), texto(x.iva), texto(x.total)];
  return [
    ...m.ordenes.map(fila),
    ...(m.ordenesAprobadas.cuantas ? [total("TOTAL DE LAS APROBADAS", m.ordenesAprobadas)] : []),
    ...(m.ordenesPorAprobar.cuantas ? [total("TOTAL DE LAS QUE ESPERAN APROBACIÓN", m.ordenesPorAprobar)] : []),
  ];
}

export async function excelDelPresupuesto({ matriz, obra, simulacion = null }) {
  const conAjuste = matriz.ajuste.hay;
  const filas = [
    ["PRESUPUESTO ACTUALIZADO" + (simulacion ? ` · SIMULACIÓN: ${simulacion}` : "")],
    [obra?.nombre || ""],
    [`Al ${hoy()}  ·  ${queOrdenes(matriz)}`],
    ["Valores sin IVA. El impuesto se suma al pie."
      + (conAjuste ? " La columna AJUSTE A MANO es una proyección: no forma parte del contrato ni de ninguna orden." : "")
      + (matriz.proyectados?.filas?.length ? " Los RUBROS PROYECTADOS, al final, son trabajos estimados que todavía no se cotizaron ni tienen orden de cambio." : "")],
    [],
    grupos(conAjuste).flatMap(([t, n]) => [t, ...Array(n - 1).fill("")]),
    columnas(conAjuste),
  ];
  const aj = (c, t) => (conAjuste ? [c, t] : []);
  for (const r of renglonesDeLaMatriz(matriz)) {
    if (r.tipo === "capitulo" || r.tipo === "bloque") {
      filas.push([r.tipo === "bloque" ? r.estado : "", r.nombre + (r.aclaracion ? `  —  ${r.aclaracion}` : ""), "", "",
        "", r.sub.base || "", "", r.sub.aprobado || "", "", "", r.sub.vigente || "", "", r.sub.porAprobar || "", "",
        ...aj("", r.sub.manual || ""), "", r.sub.proyectado || ""]);
    } else if (r.tipo === "fila") {
      filas.push([r.numero, descripcion(r), r.unidad, r.precio || "",
        r.base.cantidad || "", r.base.total || "",
        r.aprobado.cantidad || "", r.aprobado.total || "", r.aprobado.ordenes.join(", "),
        r.vigente.cantidad || "", r.vigente.total || "",
        r.porAprobar.cantidad || "", r.porAprobar.total || "", r.porAprobar.ordenes.join(", "),
        ...aj(r.manual.cantidad || "", r.manual.total || ""),
        r.proyectado.cantidad || "", r.proyectado.total || ""]);
    } else {
      const v = r.valores;
      filas.push(["", r.etiqueta, "", "", "", v.base, "", v.aprobado, "", "", v.vigente, "", v.porAprobar, "",
        ...aj("", v.manual), "", v.proyectado]);
    }
  }
  const hojas = [{
    nombre: "Presupuesto actualizado", filas,
    anchos: [8, 60, 7, 11, 10, 13, 10, 13, 12, 10, 13, 10, 13, 12, ...(conAjuste ? [10, 13] : []), 10, 13],
  }];
  if (matriz.ordenes.length) {
    hojas.push({
      nombre: "Órdenes de cambio",
      filas: [["ÓRDENES DE CAMBIO, CADA UNA CON SU VALOR"], [obra?.nombre || ""], [], ORDENES, ...filasDeOrdenes(matriz)],
      anchos: [10, 60, 14, 13, 13, 13, 13, 16, 12, 13],
    });
  }
  await exportarExcel(`Presupuesto actualizado - ${nombreLimpio(obra?.nombre)}${simulacion ? ` - ${nombreLimpio(simulacion)}` : ""}`, hojas);
}

export async function pdfDelPresupuesto({ matriz, obra, simulacion = null }, modo = "bajar") {
  const { jsPDF, autoTable } = await cargarPDF();
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const ANCHO = doc.internal.pageSize.getWidth();
  const M = 28;
  const conAjuste = matriz.ajuste.hay;
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
  if (simulacion) {
    doc.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(...VIOLETA);
    doc.text(`SIMULACIÓN: ${simulacion}  ·  la columna AJUSTE A MANO es una proyección, no forma parte del contrato ni de ninguna orden`,
      ANCHO - M, y - 4, { align: "right" });
    y += 8;
  }

  const gris = [249, 250, 251];
  const borde = [229, 231, 235];
  const cabeza = { fillColor: gris, textColor: GRIS, fontSize: 6.2, fontStyle: "bold", lineColor: borde, halign: "center" };

  // ── CADA ORDEN, ENTERA ──────────────────────────────────────────────────
  // En la matriz una orden queda repartida entre los rubros, el honorario y su
  // bloque. Acá va lo que vale cada una, como en el documento que se firma.
  if (matriz.ordenes.length) {
    doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(...TINTA);
    doc.text("LAS ÓRDENES DE CAMBIO, CADA UNA CON SU VALOR", M, y);
    y += 5;
    const cuerpo = filasDeOrdenes(matriz, v => (v ? pesos(v) : "")).map(f => {
      const esTotal = !f[0];
      return f.map((c, i) => ({ content: c, styles: {
        halign: i >= 3 ? "right" : "left",
        ...(esTotal ? { fontStyle: "bold", fillColor: gris } : {}),
        ...(i === 1 && esTotal ? { halign: "right" } : {}),
      } }));
    });
    autoTable(doc, {
      startY: y, head: [ORDENES], body: cuerpo, theme: "grid",
      headStyles: { ...cabeza, halign: "left" },
      styles: { fontSize: 7, cellPadding: 2.6, lineColor: borde, textColor: NEGRO },
      columnStyles: { 0: { cellWidth: 44, fontStyle: "bold" }, 1: { cellWidth: "auto" }, 2: { cellWidth: 62, fontSize: 6.2 },
        3: { cellWidth: 60 }, 4: { cellWidth: 60 }, 5: { cellWidth: 60 }, 6: { cellWidth: 60 }, 7: { cellWidth: 70 }, 8: { cellWidth: 56 }, 9: { cellWidth: 64 } },
      margin: { left: M, right: M },
    });
    y = doc.lastAutoTable.finalY + 14;
  }

  // ── LA MATRIZ ───────────────────────────────────────────────────────────
  const aj = (c, t) => (conAjuste ? [c, t] : []);
  const body = [];
  for (const r of renglonesDeLaMatriz(matriz)) {
    if (r.tipo === "capitulo" || r.tipo === "bloque") {
      const e = { fillColor: [243, 244, 246], fontStyle: "bold", textColor: [55, 65, 81] };
      const num = v => ({ content: v ? plata(v) : "", styles: { ...e, halign: "right" } });
      const hueco = { content: "", styles: e };
      body.push([
        { content: r.tipo === "bloque" ? `${r.nombre}  ·  ${r.estado}${r.aclaracion ? `\n${r.aclaracion}` : ""}` : r.nombre,
          colSpan: 5, styles: { ...e, fontSize: r.tipo === "bloque" ? 6.3 : 6.5 } },
        num(r.sub.base), hueco, num(r.sub.aprobado), hueco, hueco, num(r.sub.vigente), hueco, num(r.sub.porAprobar), hueco,
        ...aj(hueco, num(r.sub.manual)), hueco, num(r.sub.proyectado),
      ]);
    } else if (r.tipo === "fila") {
      const rojo = v => (v < 0 ? { textColor: ROJO } : {});
      const violeta = v => (v < 0 ? { textColor: ROJO } : { textColor: VIOLETA });
      body.push([
        r.numero, descripcion(r), r.unidad, r.precio ? plata(r.precio) : "",
        cant(r.base.cantidad), r.base.total ? plata(r.base.total) : "",
        { content: mov(r.aprobado.cantidad), styles: rojo(r.aprobado.cantidad) },
        { content: mov(r.aprobado.total), styles: rojo(r.aprobado.total) }, r.aprobado.ordenes.join(", "),
        cant(r.vigente.cantidad), r.vigente.total ? plata(r.vigente.total) : "",
        { content: mov(r.porAprobar.cantidad), styles: rojo(r.porAprobar.cantidad) },
        { content: mov(r.porAprobar.total), styles: rojo(r.porAprobar.total) }, r.porAprobar.ordenes.join(", "),
        ...aj({ content: mov(r.manual.cantidad), styles: violeta(r.manual.cantidad) },
          { content: mov(r.manual.total), styles: violeta(r.manual.total) }),
        cant(r.proyectado.cantidad), r.proyectado.total ? plata(r.proyectado.total) : "",
      ]);
    } else {
      const e = { fontStyle: r.fuerte ? "bold" : "normal", fontSize: r.fuerte ? 7.5 : 6.8, textColor: r.fuerte ? NEGRO : GRIS, fillColor: gris };
      const num = v => ({ content: pesos(v), styles: { ...e, halign: "right" } });
      const hueco = { content: "", styles: e };
      const v = r.valores;
      body.push([
        { content: r.etiqueta, colSpan: 5, styles: { ...e, halign: "right" } },
        num(v.base), hueco, num(v.aprobado), hueco, hueco, num(v.vigente), hueco, num(v.porAprobar), hueco,
        ...aj(hueco, num(v.manual)), hueco, num(v.proyectado),
      ]);
    }
  }

  // Los anchos: con la columna de ajuste, todo se aprieta un poco para que la
  // descripción siga teniendo dónde escribirse.
  const A = conAjuste
    ? { n: 34, und: 20, pu: 36, c: 32, t: 46, mt: 44, o: 32 }
    : { n: 38, und: 22, pu: 40, c: 36, t: 50, mt: 48, o: 36 };
  const der = w => ({ cellWidth: w, halign: "right" });
  const anchos = [{ cellWidth: A.n }, { cellWidth: "auto" }, { cellWidth: A.und, halign: "center" }, der(A.pu),
    der(A.c), der(A.t),
    der(A.c), der(A.mt), { cellWidth: A.o, halign: "center", fontSize: 5.8 },
    der(A.c), { ...der(A.t), fontStyle: "bold" },
    der(A.c), der(A.mt), { cellWidth: A.o, halign: "center", fontSize: 5.8 },
    ...(conAjuste ? [der(A.c), der(A.mt)] : []),
    der(A.c), { ...der(A.t), fontStyle: "bold" }];

  autoTable(doc, {
    startY: y,
    head: [
      grupos(conAjuste).map(([t, n]) => ({ content: t, colSpan: n,
        styles: { ...cabeza, textColor: t === "AJUSTE A MANO" ? VIOLETA : t ? TINTA : GRIS } })),
      columnas(conAjuste),
    ],
    body, theme: "grid",
    headStyles: cabeza,
    styles: { fontSize: 6.5, cellPadding: 2.4, lineColor: borde, textColor: NEGRO, overflow: "linebreak" },
    columnStyles: Object.fromEntries(anchos.map((a, i) => [i, a])),
    margin: { left: M, right: M, bottom: 34 },
    rowPageBreak: "avoid",
  });
  y = doc.lastAutoTable.finalY + 12;

  const notas = [
    "BASE es el presupuesto contratado. APROBADAS es lo que cada orden de cambio aprobada aumentó o redujo en ese rubro. VIGENTE es la base más las aprobadas: el contrato de hoy.",
    "POR APROBAR son las órdenes de cambio que esperan aprobación: no forman parte del vigente."
      + (conAjuste ? " AJUSTE A MANO es una proyección, al precio del contrato. PROYECTADO es el vigente más lo que está por aprobar y el ajuste."
        : " PROYECTADO es el vigente más lo que está por aprobar."),
    "Los honorarios de cada orden" + (conAjuste ? " y del ajuste" : "") + " van en el rubro de honorarios. Los trabajos que no estaban en el presupuesto van al final, por su orden de cambio.",
    ...(matriz.proyectados?.filas?.length
      ? ["RUBROS PROYECTADOS, al final, son trabajos estimados que todavía no se cotizaron ni tienen orden de cambio: no forman parte del contrato y suman solo al proyectado."]
      : []),
    "Los valores de cada renglón son sin IVA; el impuesto se suma al pie.",
  ];
  if (y > doc.internal.pageSize.getHeight() - 34 - notas.length * 10) { doc.addPage(); y = 40; }
  doc.setFont("helvetica", "normal").setFontSize(7.2).setTextColor(...GRIS);
  notas.forEach((t, i) => doc.text(t, M, y + i * 10));

  pieDePdf(doc, { elemento: `Presupuesto actualizado${simulacion ? ` · simulación ${simulacion}` : ""}`,
    proyecto: obra?.nombre, margen: M / 2.83, abajo: 8 });
  return mostrarPdf(doc, `Presupuesto actualizado - ${nombreLimpio(obra?.nombre)}${simulacion ? ` - ${nombreLimpio(simulacion)}` : ""}.pdf`, modo);
}
