import { useState } from "react";
import { FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { fmt, resumenPlanilla, TIPOS_GASTO } from "./calculos";
import { exportarExcel, exportarPDF, money } from "../../lib/exportar";
import { enlacesArchivos } from "../../lib/archivos";
import SelectorContenido, { CONTENIDO } from "../../components/ui/SelectorContenido";

const tipoLabel = id => TIPOS_GASTO.find(t => t.id === id)?.label || id || "—";

const opcion = activa => ({
  display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12, color: colors.ink, cursor: "pointer",
  border: `1px solid ${activa ? colors.brand : colors.border}`, background: activa ? colors.brandSoft : colors.surface,
  borderRadius: colors.radiusMd, padding: "9px 12px",
});

export default function ExportarPlanilla({ obra, planilla, planillas = [], grupos, porRubro, totales, facturas, asignaciones, rubros }) {
  const [generando, setGenerando] = useState("");
  const [progreso, setProgreso] = useState("");
  const [contenido, setContenido] = useState("completo");
  // El control va siempre; las facturas y las planillas, según para quién es
  // el reporte. Al cliente se le manda el control con sus planillas; al
  // contador, las facturas de toda la obra.
  const [conFacturas, setConFacturas] = useState(true);
  const [alcanceFacturas, setAlcanceFacturas] = useState("planilla");   // planilla | todo
  const [conPlanillas, setConPlanillas] = useState(true);

  const nombrePlanilla = planilla?.nombre || (planilla ? `Planilla N°${planilla.numero}` : "Acumulado");
  const todoElProyecto = alcanceFacturas === "todo" || !planilla;
  const delPeriodo = !conFacturas ? [] : todoElProyecto ? facturas : facturas.filter(f => f.planilla_id === planilla.id);
  const nombreFacturas = todoElProyecto ? "Todo el proyecto" : nombrePlanilla;
  const planillaDe = id => { const p = planillas.find(x => x.id === id); return p ? p.nombre || `Planilla N°${p.numero}` : "Sin planilla"; };
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
      filas.push(["", [g.codigo, g.capitulo].filter(Boolean).join("  "), "", "", "", g.base, g.anterior, g.periodo, g.acumulado, g.saldo, g.pct]);
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
      [nombreFacturas],
      [],
      ["N°", "FECHA", "PLANILLA", "RUC", "PROVEEDOR", "N° FACTURA", "N° CHEQUE", "DETALLE", "JUSTIFICACIÓN",
       "BASE 0%", "BASE 5%", "BASE 15%", "IVA", "TOTAL", "TIPO", "RUBRO ASIGNADO", "ORIGEN"],
    ];
    delPeriodo.forEach((f, i) => {
      filas.push([i + 1, f.fecha, planillaDe(f.planilla_id), f.ruc || "", f.razon_social || "", f.numero_factura || "", f.numero_cheque || "",
        f.detalle || "", f.justificacion || "",
        Number(f.subtotal_0) || 0, Number(f.subtotal_5) || 0, Number(f.subtotal_15) || 0,
        Number(f.iva) || 0, Number(f.total) || 0, tipoLabel(f.tipo),
        rubrosDeFactura(f.id) || "SIN ASIGNAR", f.origen || ""]);
    });
    filas.push([]);
    filas.push(["", "", "", "", "", "", "", "", "TOTALES",
      resumen.subtotal_0, resumen.subtotal_5, resumen.subtotal_15, resumen.iva, resumen.total, "", "", ""]);
    return filas;
  }

  // ── Planillas: cada corte con lo que se facturó y lo que quedó suelto ──
  const porPlanilla = planillas.map(p => {
    const fs = facturas.filter(f => f.planilla_id === p.id);
    const r = resumenPlanilla({ facturas: fs, asignaciones: asignaciones.filter(a => fs.some(f => f.id === a.factura_id)) });
    return { p, cantidad: fs.length, total: r.total, asignado: r.asignado, sinAsignar: r.sinAsignar };
  });
  function filasPlanillas() {
    const filas = [
      [`PLANILLAS — ${obra.nombre}`],
      [],
      ["N°", "PLANILLA", "DESDE", "HASTA", "ESTADO", "FACTURAS", "FACTURADO", "ASIGNADO A RUBROS", "SIN ASIGNAR"],
    ];
    porPlanilla.forEach(({ p, cantidad, total, asignado, sinAsignar }) => {
      filas.push([p.numero, p.nombre || `Planilla N°${p.numero}`, p.fecha_desde || "", p.fecha_hasta || "", p.estado === "cerrada" ? "Cerrada" : "Abierta",
        cantidad, total, asignado, sinAsignar]);
    });
    filas.push([]);
    filas.push(["", "TOTAL", "", "", "", porPlanilla.reduce((s, x) => s + x.cantidad, 0),
      porPlanilla.reduce((s, x) => s + x.total, 0), porPlanilla.reduce((s, x) => s + x.asignado, 0), porPlanilla.reduce((s, x) => s + x.sinAsignar, 0)]);
    return filas;
  }

  // ── Hoja 3: resumen de gasto por tasa y por tipo ──
  function filasResumen() {
    const filas = [
      ["RESUMEN DE GASTO", ""],
      [nombreFacturas, ""],
      [],
      ["Descripción", "Valor"],
      ["Subtotal base 0%", resumen.subtotal_0],
      ["Subtotal base 5%", resumen.subtotal_5],
      ["Subtotal base 15%", resumen.subtotal_15],
      ["Subtotal general", resumen.subtotal_0 + resumen.subtotal_5 + resumen.subtotal_15],
      ["IVA", resumen.iva],
      [todoElProyecto ? "TOTAL FACTURADO" : "TOTAL PLANILLA", resumen.total],
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
        conPlanillas && planillas.length > 0 && { nombre: "Planillas", filas: filasPlanillas(), anchos: [5, 26, 11, 11, 10, 10, 14, 16, 14] },
        conFacturas && { nombre: "Compendio Facturas", filas: filasFacturas(), anchos: [5, 11, 16, 14, 30, 18, 16, 40, 30, 11, 11, 11, 11, 12, 14, 30, 11] },
        conFacturas && { nombre: "Resumen Gasto", filas: filasResumen(), anchos: [32, 16] },
      ].filter(Boolean));
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
        filasTabla.push([[g.codigo, g.capitulo].filter(Boolean).join("  "), "", "", money(g.base), money(g.anterior), money(g.periodo), money(g.acumulado), money(g.saldo), `${(g.pct * 100).toFixed(0)}%`]);
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

      if (conPlanillas && planillas.length) {
        bloquesControl.push({
          titulo: "Planillas",
          columnas: ["Planilla", "Desde", "Hasta", "Estado", "Facturas", "Facturado", "Sin asignar"],
          filas: porPlanilla.map(({ p, cantidad, total, sinAsignar }) => [p.nombre || `Planilla N°${p.numero}`, p.fecha_desde || "—", p.fecha_hasta || "—",
            p.estado === "cerrada" ? "Cerrada" : "Abierta", String(cantidad), money(total), sinAsignar > 0.009 ? money(sinAsignar) : "—"]),
          anchos: { 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" } },
        });
      }

      if (delPeriodo.length) {
        bloquesControl.push({
          titulo: todoElProyecto ? "Compendio de facturas — todo el proyecto" : "Compendio de facturas",
          columnas: todoElProyecto
            ? ["Fecha", "Planilla", "Proveedor", "N° factura", "Detalle", "Rubro asignado", "Total"]
            : ["Fecha", "Proveedor", "N° factura", "Detalle", "Rubro asignado", "Total"],
          filas: delPeriodo.map(f => [f.fecha, ...(todoElProyecto ? [planillaDe(f.planilla_id)] : []), f.razon_social || "—", f.numero_factura || "—",
            (f.detalle || "").slice(0, 60), rubrosDeFactura(f.id) || "SIN ASIGNAR", money(f.total)]),
          anchos: { [todoElProyecto ? 6 : 5]: { halign: "right" } },
        });
      }

      // Los archivos son privados: se pide un enlace temporal para cada uno.
      const conArchivo = delPeriodo.filter(f => f.archivo_url);
      const urls = await enlacesArchivos(conArchivo.map(f => f.archivo_url));
      const adjuntos = conArchivo
        .map((f, i) => ({ url: urls[i], titulo: `${f.razon_social || "Factura"} — ${f.numero_factura || f.fecha} — $${money(f.total)}` }))
        .filter(a => a.url);

      const soloAnexos = conFacturas && contenido === "anexos";

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
        adjuntos: !conFacturas || contenido === "reporte" ? [] : adjuntos,
        onProgreso: (i, t) => setProgreso(`Adjuntando facturas ${i}/${t}...`),
      });
    } finally { setGenerando(""); setProgreso(""); }
  }

  const conAdjunto = delPeriodo.filter(f => f.archivo_url).length;

  return (
    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: colors.ink, marginBottom: 4 }}>Exportar {nombrePlanilla}</div>
      <div style={{ fontSize: 12, color: colors.inkSoft, marginBottom: 14 }}>
        El control de presupuesto va siempre. Lo demás, según para quién sea el reporte.
      </div>

      <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
        <label style={opcion(conPlanillas)}>
          <input type="checkbox" checked={conPlanillas} onChange={e => setConPlanillas(e.target.checked)} disabled={!planillas.length} />
          <span style={{ flex: 1 }}>
            <strong>Planillas</strong>
            <span style={{ color: colors.muted }}> · {planillas.length ? `los ${planillas.length} cortes, con lo facturado en cada uno` : "esta obra todavía no tiene planillas"}</span>
          </span>
        </label>
        <div style={opcion(conFacturas)}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flex: 1, minWidth: 180 }}>
            <input type="checkbox" checked={conFacturas} onChange={e => setConFacturas(e.target.checked)} />
            <span>
              <strong>Facturas</strong>
              <span style={{ color: colors.muted }}> · {conFacturas ? `${delPeriodo.length} · $${fmt(resumen.total)}` : "no van"}</span>
            </span>
          </label>
          {conFacturas && planilla && (
            <div style={{ display: "inline-flex", gap: 3, background: colors.neutralSoft, borderRadius: colors.radiusSm, padding: 3 }}>
              {[["planilla", `De ${nombrePlanilla}`], ["todo", "De todo el proyecto"]].map(([v, l]) => (
                <button key={v} onClick={() => setAlcanceFacturas(v)}
                  style={{ padding: "4px 10px", borderRadius: 6, border: "none", cursor: "pointer", fontFamily: colors.font, fontSize: 11, fontWeight: 600,
                    background: alcanceFacturas === v ? colors.surface : "transparent", color: alcanceFacturas === v ? colors.brand : colors.inkSoft }}>{l}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {conFacturas && <SelectorContenido valor={contenido} onChange={setContenido} conAdjunto={conAdjunto} />}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button variant="outline" onClick={generarExcel} disabled={!!generando}>
          <FileSpreadsheet size={14} /> {generando === "excel" ? "Generando..." : "Excel"}
        </Button>
        <Button variant="primary" onClick={generarPDF} disabled={!!generando}>
          {generando === "pdf" ? <Loader2 size={14} /> : <FileText size={14} />}
          {generando === "pdf" ? (progreso || "Generando...") : conFacturas ? `PDF · ${CONTENIDO[contenido].label}` : "PDF"}
        </Button>
      </div>

      <div style={{ fontSize: 11, color: colors.muted, marginTop: 10, lineHeight: 1.5 }}>
        El <strong>Excel</strong> trae una hoja por parte: control de presupuesto, planillas, compendio de facturas y resumen de gasto por tasa de IVA — solo las que marques.<br />
        El <strong>PDF</strong> arma lo mismo en un documento{conFacturas ? ", y con las facturas escaneadas si las pides" : ""}.
      </div>
    </div>
  );
}
