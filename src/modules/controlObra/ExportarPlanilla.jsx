import { useState } from "react";
import { FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { fmt, resumenPlanilla, TIPOS_GASTO } from "./calculos";
import { exportarExcel, exportarPDF, money } from "../../lib/exportar";
import SelectorContenido, { CONTENIDO } from "../../components/ui/SelectorContenido";

const tipoLabel = id => TIPOS_GASTO.find(t => t.id === id)?.label || id || "—";

export default function ExportarPlanilla({ obra, planilla, grupos, porRubro, totales, facturas, asignaciones, rubros }) {
  const [generando, setGenerando] = useState("");
  const [progreso, setProgreso] = useState("");
  const [contenido, setContenido] = useState("completo");

  const nombrePlanilla = planilla?.nombre || (planilla ? `Planilla N°${planilla.numero}` : "Acumulado");
  const delPeriodo = planilla ? facturas.filter(f => f.planilla_id === planilla.id) : facturas;
  const asigPeriodo = asignaciones.filter(a => delPeriodo.some(f => f.id === a.factura_id));
  const resumen = resumenPlanilla({ facturas: delPeriodo, asignaciones: asigPeriodo });

  const rubroDe = id => rubros.find(r => r.id === id);
  const rubrosDeFactura = fid => asignaciones.filter(a => a.factura_id === fid)
    .map(a => { const r = rubroDe(a.obra_rubro_id); return r ? `${r.numero} ${r.descripcion}` : "?"; }).join(" · ");

  // ── Hoja 1: control de presupuesto, con la estructura del Excel ──
  function filasControl() {
    const filas = [
      [`CONTROL DE PRESUPUESTO — ${obra.nombre}`],
      [obra.cliente_nombre || "", "", "", nombrePlanilla],
      [],
      ["RUBRO", "DESCRIPCIÓN", "UNIDAD", "CANTIDAD", "P. UNITARIO", "PRESUPUESTO", "ACUM. ANTERIOR", "ESTE PERÍODO", "INVERTIDO", "SALDO", "% AVANCE"],
    ];
    for (const g of grupos) {
      filas.push(["", g.capitulo, "", "", "", g.base, g.anterior, g.periodo, g.acumulado, g.saldo, g.pct]);
      for (const r of g.rubros) {
        const acc = gAcc(g, r);
        filas.push([r.numero, r.descripcion, r.unidad, Number(r.cantidad), Number(r.precio_unitario),
          Number(r.total_base), acc.anterior, acc.periodo, acc.acumulado, acc.saldo, acc.pct]);
      }
    }
    filas.push([]);
    filas.push(["", "TOTAL OBRA", "", "", "", totales.base, totales.anterior, totales.periodo, totales.acumulado, totales.saldo, totales.pct]);
    return filas;
  }
  const gAcc = (g, r) => porRubro[r.id] || { anterior: 0, periodo: 0, acumulado: 0, saldo: Number(r.total_base) || 0, pct: 0 };

  // ── Hoja 2: compendio de facturas ──
  function filasFacturas() {
    const filas = [
      [`COMPENDIO DE FACTURAS — ${obra.nombre}`],
      [nombrePlanilla],
      [],
      ["N°", "FECHA", "RUC", "PROVEEDOR", "N° FACTURA", "N° CHEQUE", "DETALLE", "JUSTIFICACIÓN",
       "BASE 0%", "BASE 5%", "BASE 15%", "IVA", "TOTAL", "TIPO", "RUBRO ASIGNADO", "ORIGEN"],
    ];
    delPeriodo.forEach((f, i) => {
      filas.push([i + 1, f.fecha, f.ruc || "", f.razon_social || "", f.numero_factura || "", f.numero_cheque || "",
        f.detalle || "", f.justificacion || "",
        Number(f.subtotal_0) || 0, Number(f.subtotal_5) || 0, Number(f.subtotal_15) || 0,
        Number(f.iva) || 0, Number(f.total) || 0, tipoLabel(f.tipo),
        rubrosDeFactura(f.id) || "SIN ASIGNAR", f.origen || ""]);
    });
    filas.push([]);
    filas.push(["", "", "", "", "", "", "", "TOTALES",
      resumen.subtotal_0, resumen.subtotal_5, resumen.subtotal_15, resumen.iva, resumen.total, "", "", ""]);
    return filas;
  }

  // ── Hoja 3: resumen de gasto por tasa y por tipo ──
  function filasResumen() {
    const filas = [
      ["RESUMEN DE GASTO", ""],
      [nombrePlanilla, ""],
      [],
      ["Descripción", "Valor"],
      ["Subtotal base 0%", resumen.subtotal_0],
      ["Subtotal base 5%", resumen.subtotal_5],
      ["Subtotal base 15%", resumen.subtotal_15],
      ["Subtotal general", resumen.subtotal_0 + resumen.subtotal_5 + resumen.subtotal_15],
      ["IVA", resumen.iva],
      ["TOTAL PLANILLA", resumen.total],
      [],
      ["Por tipo de gasto", ""],
    ];
    Object.entries(resumen.porTipo).forEach(([t, v]) => filas.push([tipoLabel(t), v]));
    if (resumen.sinAsignar > 0.009) {
      filas.push([]);
      filas.push(["SIN ASIGNAR A RUBRO", resumen.sinAsignar]);
    }
    return filas;
  }

  function generarExcel() {
    setGenerando("excel");
    try {
      exportarExcel(`${obra.nombre} - ${nombrePlanilla}`, [
        { nombre: "Control de Presupuesto", filas: filasControl(), anchos: [8, 52, 8, 11, 12, 14, 14, 14, 14, 14, 10] },
        { nombre: "Compendio Facturas", filas: filasFacturas(), anchos: [5, 11, 14, 30, 18, 16, 40, 30, 11, 11, 11, 11, 12, 14, 30, 11] },
        { nombre: "Resumen Gasto", filas: filasResumen(), anchos: [32, 16] },
      ]);
    } finally { setGenerando(""); }
  }

  async function generarPDF() {
    setGenerando("pdf"); setProgreso("");
    try {
      const bloquesControl = [];
      const filasTabla = [];
      const destacadas = [];
      for (const g of grupos) {
        destacadas.push(filasTabla.length);
        filasTabla.push([g.capitulo, "", "", money(g.base), money(g.anterior), money(g.periodo), money(g.acumulado), money(g.saldo), `${(g.pct * 100).toFixed(0)}%`]);
        for (const r of g.rubros) {
          const a = gAcc(g, r);
          filasTabla.push([`${r.numero}  ${r.descripcion}`, r.unidad || "", fmt(r.cantidad),
            money(r.total_base), money(a.anterior), money(a.periodo), money(a.acumulado), money(a.saldo), `${(a.pct * 100).toFixed(0)}%`]);
        }
      }
      destacadas.push(filasTabla.length);
      filasTabla.push(["TOTAL OBRA", "", "", money(totales.base), money(totales.anterior), money(totales.periodo), money(totales.acumulado), money(totales.saldo), `${(totales.pct * 100).toFixed(1)}%`]);

      bloquesControl.push({
        titulo: "Control de presupuesto",
        columnas: ["Rubro", "Und", "Cant", "Presupuesto", "Acum. ant.", "Este período", "Invertido", "Saldo", "Avance"],
        filas: filasTabla,
        filasDestacadas: destacadas,
        anchos: { 0: { cellWidth: 230 }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" }, 8: { halign: "right" } },
      });

      if (delPeriodo.length) {
        bloquesControl.push({
          titulo: "Compendio de facturas",
          columnas: ["Fecha", "Proveedor", "N° factura", "Detalle", "Rubro asignado", "Total"],
          filas: delPeriodo.map(f => [f.fecha, f.razon_social || "—", f.numero_factura || "—",
            (f.detalle || "").slice(0, 60), rubrosDeFactura(f.id) || "SIN ASIGNAR", money(f.total)]),
          anchos: { 5: { halign: "right" } },
        });
      }

      const adjuntos = delPeriodo.filter(f => f.archivo_url)
        .map(f => ({ url: f.archivo_url, titulo: `${f.razon_social || "Factura"} — ${f.numero_factura || f.fecha} — $${money(f.total)}` }));

      const soloAnexos = contenido === "anexos";

      await exportarPDF({
        nombreArchivo: `${obra.nombre} - ${nombrePlanilla}${soloAnexos ? " (anexos)" : ""}`,
        titulo: soloAnexos ? `Anexos — ${obra.nombre}` : `Control de Obra — ${obra.nombre}`,
        subtitulo: `${obra.cliente_nombre ? obra.cliente_nombre + " · " : ""}${nombrePlanilla}`,
        indiceAdjuntos: soloAnexos,
        resumen: soloAnexos ? [] : [
          { label: "Presupuesto", valor: `$${money(totales.base)}` },
          { label: "Este período", valor: `$${money(totales.periodo)}`, color: [15, 61, 62] },
          { label: "Invertido", valor: `$${money(totales.acumulado)}` },
          { label: "Saldo", valor: `$${money(totales.saldo)}`, color: totales.saldo < 0 ? [185, 28, 28] : [21, 128, 61] },
          { label: "Avance", valor: `${(totales.pct * 100).toFixed(1)}%` },
        ],
        bloques: soloAnexos ? [] : bloquesControl,
        adjuntos: contenido === "reporte" ? [] : adjuntos,
        onProgreso: (i, t) => setProgreso(`Adjuntando facturas ${i}/${t}...`),
      });
    } finally { setGenerando(""); setProgreso(""); }
  }

  const conAdjunto = delPeriodo.filter(f => f.archivo_url).length;

  return (
    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: colors.ink, marginBottom: 4 }}>Exportar {nombrePlanilla}</div>
      <div style={{ fontSize: 12, color: colors.inkSoft, marginBottom: 14 }}>
        {delPeriodo.length} factura{delPeriodo.length === 1 ? "" : "s"} · ${fmt(resumen.total)} en el período
        {conAdjunto > 0 && ` · ${conAdjunto} con factura escaneada`}
      </div>

      <SelectorContenido valor={contenido} onChange={setContenido} conAdjunto={conAdjunto} />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button variant="outline" onClick={generarExcel} disabled={!!generando}>
          <FileSpreadsheet size={14} /> {generando === "excel" ? "Generando..." : "Excel"}
        </Button>
        <Button variant="primary" onClick={generarPDF} disabled={!!generando}>
          {generando === "pdf" ? <Loader2 size={14} /> : <FileText size={14} />}
          {generando === "pdf" ? (progreso || "Generando...") : `PDF · ${CONTENIDO[contenido].label}`}
        </Button>
      </div>

      <div style={{ fontSize: 11, color: colors.muted, marginTop: 10, lineHeight: 1.5 }}>
        El <strong>Excel</strong> trae tres hojas: control de presupuesto por rubro, compendio de facturas y resumen de gasto por tasa de IVA.<br />
El <strong>PDF</strong> lo armas según lo que elijas arriba: solo el reporte, solo el legajo de anexos, o ambos.
      </div>
    </div>
  );
}
