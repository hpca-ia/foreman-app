import { useState, useMemo } from "react";
import { FileSpreadsheet, FileText, Loader2, Mail, Check } from "lucide-react";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import SelectorContenido, { CONTENIDO } from "../../components/ui/SelectorContenido";
import { exportarExcel, exportarPDF, construirPDF, money } from "../../lib/exportar";
import { enlaceArchivo, enlacesArchivos, subirArchivo } from "../../lib/archivos";
import { paraElReporte } from "./lista.js";
import { resumenDeLaCaja } from "./resumen.js";

const primerDiaMes = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split("T")[0]; };
const hoy = () => new Date().toISOString().split("T")[0];

export default function ReporteCaja({ caja, gastos, anticipos, cierres = [], usuarios = [] }) {
  const [desde, setDesde] = useState(primerDiaMes());
  const [hasta, setHasta] = useState(hoy());
  const [generando, setGenerando] = useState("");
  const [progreso, setProgreso] = useState("");
  const [envio, setEnvio] = useState(null);   // {ok, mensaje}
  const [extra, setExtra] = useState("");
  const [contenido, setContenido] = useState("completo");

  const enRango = (f) => (!desde || f >= desde) && (!hasta || f <= hasta);

  const { gastosF, devueltosF, anticiposF, cierresF, totalGastos, totalAnticipos, totalDevueltos, queEs } = useMemo(() => {
    const delPeriodo = gastos.filter(g => enRango(g.fecha)).sort((a, b) => a.fecha.localeCompare(b.fecha));
    // LOS DEVUELTOS AL RESIDENTE QUEDAN FUERA. Están mal cargados y hasta que
    // se corrijan no son un gasto de la caja: sumarlos era cobrarle a la obra
    // un papel que administración rechazó. Van aparte, para que no se pierdan.
    const { gastos: gastosF, devueltos: devueltosF } = paraElReporte(delPeriodo);
    const anticiposF = anticipos.filter(a => enRango(a.fecha)).sort((a, b) => a.fecha.localeCompare(b.fecha));
    const cierresF = cierres.filter(c => enRango(String(c.hasta || "").slice(0, 10)))
      .sort((a, b) => (Number(a.numero) || 0) - (Number(b.numero) || 0));
    // Qué es cada anticipo —el fondo, la reposición de qué cierre— dicho en el papel.
    const dice = new Map(resumenDeLaCaja({ anticipos, cierres }).filter(f => f.anticipo).map(f => [f.anticipo.id, f.dice]));
    return {
      gastosF, devueltosF, anticiposF, cierresF,
      totalGastos: gastosF.reduce((s, g) => s + (Number(g.monto) || 0), 0),
      totalAnticipos: anticiposF.reduce((s, a) => s + (Number(a.monto) || 0), 0),
      totalDevueltos: devueltosF.reduce((s, g) => s + (Number(g.monto) || 0), 0),
      queEs: a => dice.get(a.id) || "Anticipo",
    };
  }, [gastos, anticipos, cierres, desde, hasta]);

  const periodo = `${desde || "inicio"} a ${hasta || "hoy"}`;
  const conAdjunto = gastosF.filter(g => g.archivo_url).length;

  async function generarExcel() {
    setGenerando("excel");
    try {
      const filasGastos = [
        [`CAJA CHICA — ${caja.proyecto_nombre}`],
        [`Responsable: ${caja.responsable_nombre}`, "", `Período: ${periodo}`],
        [],
        ["FECHA", "PROVEEDOR", "RUC", "N° FACTURA", "DESCRIPCIÓN", "CAPÍTULO", "TIPO", "MONTO", "ESTADO", "SUBIÓ", "ADJUNTO"],
        ...gastosF.map(g => [g.fecha, g.proveedor || "", g.ruc || "", g.numero_factura || "",
          g.descripcion || "", g.capitulo || "", g.tipo || "", Number(g.monto) || 0,
          g.estado || "pendiente", g.subido_por_nombre || "", g.archivo_url ? "Sí" : "No"]),
        [],
        ["", "", "", "", "", "", "TOTAL GASTOS", totalGastos],
        ...(devueltosF.length ? [
          [],
          ["DEVUELTOS AL RESIDENTE — fuera de la cuenta hasta que se corrijan"],
          ["FECHA", "PROVEEDOR", "RUC", "N° FACTURA", "DESCRIPCIÓN", "MOTIVO", "", "MONTO"],
          ...devueltosF.map(g => [g.fecha, g.proveedor || "", g.ruc || "", g.numero_factura || "",
            g.descripcion || "", g.devuelto_motivo || "", "", Number(g.monto) || 0]),
          ["", "", "", "", "", "", "TOTAL DEVUELTO (no suma)", totalDevueltos],
        ] : []),
      ];

      const filasAnticipos = [
        [`ANTICIPOS — ${caja.proyecto_nombre}`],
        [`Período: ${periodo}`],
        [],
        ["FECHA", "QUÉ ES", "DESCRIPCIÓN", "ENTREGADO POR", "MONTO"],
        ...anticiposF.map(a => [a.fecha, queEs(a), a.descripcion || "", a.entregado_por_nombre || "", Number(a.monto) || 0]),
        [],
        ["", "", "", "TOTAL ANTICIPOS", totalAnticipos],
      ];

      const filasCierres = [
        [`CIERRES DE CAJA — ${caja.proyecto_nombre}`],
        [`Período: ${periodo}`],
        [],
        ["N°", "HASTA", "GASTOS", "ENTREGADO", "GASTADO", "SALDO", "CERRÓ", "NOTA"],
        ...cierresF.map(c => [c.numero, c.hasta, c.gastos, Number(c.total_abonado) || 0, Number(c.total_gastado) || 0,
          Number(c.saldo) || 0, c.cerrado_nombre || "", c.nota || ""]),
      ];

      const filasResumen = [
        ["RESUMEN DE CAJA CHICA", ""],
        [caja.proyecto_nombre, ""],
        [`Responsable: ${caja.responsable_nombre}`, ""],
        [`Período: ${periodo}`, ""],
        [],
        ["Concepto", "Valor"],
        ["Anticipos recibidos en el período", totalAnticipos],
        ["Gastos del período", totalGastos],
        ["Diferencia del período", totalAnticipos - totalGastos],
        ...(devueltosF.length ? [["Devueltos al residente, fuera de la cuenta", totalDevueltos]] : []),
        ...cierresF.map(c => [`Cierre ${c.numero} hasta el ${c.hasta}: gastado`, Number(c.total_gastado) || 0]),
        [],
        ["Saldo total entregado (histórico)", Number(caja.saldo_total) || 0],
        ["Total gastado (histórico)", Number(caja.saldo_gastado) || 0],
        ["Saldo disponible", Number(caja.saldo_disponible) || 0],
      ];

      await exportarExcel(`Caja Chica - ${caja.proyecto_nombre} - ${desde}`, [
        { nombre: "Gastos", filas: filasGastos, anchos: [11, 28, 14, 18, 42, 24, 12, 12, 12, 16, 9] },
        { nombre: "Anticipos", filas: filasAnticipos, anchos: [11, 30, 40, 20, 12] },
        ...(cierresF.length ? [{ nombre: "Cierres", filas: filasCierres, anchos: [5, 11, 8, 12, 12, 12, 18, 30] }] : []),
        { nombre: "Resumen", filas: filasResumen, anchos: [36, 16] },
      ]);
    } finally { setGenerando(""); }
  }

  async function datosPDF(modo = contenido) {
    const bloques = [{
        titulo: "Gastos del período",
        columnas: ["Fecha", "Proveedor", "N° factura", "Descripción", "Capítulo", "Estado", "Monto"],
        filas: gastosF.map(g => [g.fecha, g.proveedor || "—", g.numero_factura || "—",
          (g.descripcion || "").slice(0, 55), (g.capitulo || "—").slice(0, 28), g.estado || "pendiente", money(g.monto)]),
        anchos: { 6: { halign: "right" } },
      }];

      if (devueltosF.length) {
        bloques.push({
          titulo: "Devueltos al residente — fuera de la cuenta hasta que se corrijan",
          columnas: ["Fecha", "Proveedor", "N° factura", "Descripción", "Motivo", "Monto"],
          filas: devueltosF.map(g => [g.fecha, g.proveedor || "—", g.numero_factura || "—",
            (g.descripcion || "").slice(0, 45), (g.devuelto_motivo || "—").slice(0, 40), money(g.monto)]),
          anchos: { 5: { halign: "right" } },
        });
      }
      if (anticiposF.length) {
        bloques.push({
          titulo: "Anticipos recibidos",
          columnas: ["Fecha", "Qué es", "Descripción", "Entregado por", "Monto"],
          filas: anticiposF.map(a => [a.fecha, queEs(a), a.descripcion || "—", a.entregado_por_nombre || "—", money(a.monto)]),
          anchos: { 4: { halign: "right" } },
        });
      }
      if (cierresF.length) {
        bloques.push({
          titulo: "Cierres de caja del período",
          columnas: ["N°", "Hasta", "Gastos", "Entregado", "Gastado", "Saldo", "Cerró"],
          filas: cierresF.map(c => [String(c.numero), c.hasta, String(c.gastos ?? ""), money(c.total_abonado),
            money(c.total_gastado), money(c.saldo), c.cerrado_nombre || "—"]),
          anchos: { 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
        });
      }

      // Los archivos son privados: se pide un enlace temporal para cada uno.
      const conArchivo = gastosF.filter(g => g.archivo_url);
      const urls = await enlacesArchivos(conArchivo.map(g => g.archivo_url));
      const adjuntos = conArchivo
        .map((g, i) => ({ url: urls[i], titulo: `${g.proveedor || "Gasto"} — ${g.fecha} — $${money(g.monto)}` }))
        .filter(a => a.url);

      const soloAnexos = modo === "anexos";
      const sufijo = soloAnexos ? " (anexos)" : modo === "reporte" ? "" : "";

      return {
        nombreArchivo: `Caja Chica - ${caja.proyecto_nombre} - ${desde}${sufijo}`,
        titulo: soloAnexos ? `Anexos — Caja Chica ${caja.proyecto_nombre}` : `Caja Chica — ${caja.proyecto_nombre}`,
        pie: { elemento: `${soloAnexos ? "Anexos de caja chica" : "Caja chica"} · período ${periodo}`, proyecto: caja.proyecto_nombre },
        subtitulo: `Responsable: ${caja.responsable_nombre} · Período ${periodo}`,
        indiceAdjuntos: soloAnexos,
        bloques: soloAnexos ? [] : bloques,
        adjuntos: modo === "reporte" ? [] : adjuntos,
        resumen: soloAnexos ? [] : [
          { label: "Anticipos período", valor: `$${money(totalAnticipos)}` },
          { label: "Gastos período", valor: `$${money(totalGastos)}`, color: [185, 28, 28] },
          ...(devueltosF.length ? [{ label: "Devueltos, fuera", valor: `$${money(totalDevueltos)}` }] : []),
          { label: "Diferencia", valor: `$${money(totalAnticipos - totalGastos)}` },
          { label: "Saldo disponible", valor: `$${money(caja.saldo_disponible)}`, color: [21, 128, 61] },
        ],
        onProgreso: (i, t) => setProgreso(`Adjuntando facturas ${i}/${t}...`),
      };
  }

  async function generarPDF() {
    setGenerando("pdf"); setProgreso("");
    try { await exportarPDF(await datosPDF()); }
    finally { setGenerando(""); setProgreso(""); }
  }

  // El reporte llega al responsable de la caja y a los Admin.
  async function enviarPorCorreo() {
    setGenerando("mail"); setProgreso(""); setEnvio(null);
    try {
      const responsable = usuarios.find(u => u.id === caja.responsable_id);
      const admins = usuarios.filter(u => u.role === "assistant" && u.email).map(u => u.email);
      const extras = extra.split(/[,;\s]+/).filter(e => e.includes("@"));

      if (!responsable?.email && !admins.length && !extras.length) {
        setEnvio({ ok: false, mensaje: "Nadie tiene correo configurado. Agrégalo en Ajustes → Usuarios." });
        setGenerando(""); return;
      }

      setProgreso("Armando el PDF...");
      const doc = await construirPDF(await datosPDF(contenido === "anexos" ? "completo" : contenido));
      const base64 = doc.output("datauristring").split(",")[1];
      const pesoMB = (base64.length * 0.75) / (1024 * 1024);

      // Si pesa demasiado para el correo, se sube y va como enlace.
      let pdfBase64 = base64, pdfUrl = null;
      if (pesoMB > 8) {
        setProgreso("El PDF es grande, subiéndolo...");
        const ruta = `caja-${caja.id}/reporte-${desde}-${Date.now()}.pdf`;
        const { error } = await subirArchivo(ruta, doc.output("blob"), { contentType: "application/pdf" });
        pdfBase64 = null;
        // Un mes: el enlace va por correo y tiene que seguir abriendo después.
        if (!error) pdfUrl = await enlaceArchivo(ruta, 60 * 60 * 24 * 30);
      }

      // Las fotos de los gastos van al correo con enlace temporal de un mes.
      const fotos = await enlacesArchivos(gastosF.map(g => g.archivo_url), 60 * 60 * 24 * 30);

      setProgreso("Enviando...");
      const res = await fetch("/api/email", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "reporte_caja_chica",
          datos: {
            nombre: caja.responsable_nombre, proyecto: caja.proyecto_nombre, periodo,
            recibido: caja.saldo_total, gastado: caja.saldo_gastado, saldo: caja.saldo_disponible,
            gastos: gastosF.map((g, i) => ({ fecha: g.fecha, descripcion: g.descripcion,
              montoTotal: g.monto, tieneFactura: !!g.archivo_url, fotoUrl: fotos[i] })),
            emailAsistente: admins, emailResponsable: responsable?.email || null,
            destinatariosExtra: extras,
            pdfBase64, pdfUrl, pdfNombre: `Caja Chica - ${caja.proyecto_nombre} - ${desde}.pdf`,
          },
        }),
      });
      const r = await res.json();
      setEnvio(r.ok
        ? { ok: true, mensaje: `Enviado a ${(r.enviadoA || []).join(", ")}` }
        : { ok: false, mensaje: r.error || "No se pudo enviar. Revisa la configuración de correo." });
    } catch (e) {
      setEnvio({ ok: false, mensaje: "Error al enviar: " + e.message });
    } finally { setGenerando(""); setProgreso(""); }
  }

  const lbl = { fontSize: 11, color: colors.muted, display: "block", marginBottom: 4 };

  return (
    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: colors.ink, marginBottom: 12 }}>Reporte de caja chica</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        <div><label style={lbl}>DESDE</label><input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={inputStyle} /></div>
        <div><label style={lbl}>HASTA</label><input type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={inputStyle} /></div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {[
          ["Este mes", primerDiaMes(), hoy()],
          ["Mes pasado", new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().split("T")[0],
            new Date(new Date().getFullYear(), new Date().getMonth(), 0).toISOString().split("T")[0]],
          ["Todo", "", hoy()],
        ].map(([txt, d, h]) => (
          <button key={txt} onClick={() => { setDesde(d); setHasta(h); }}
            style={{ background: desde === d ? colors.brandSoft : colors.neutralSoft, border: "none", borderRadius: 20, padding: "5px 12px", fontSize: 11, color: desde === d ? colors.brand : colors.inkSoft, cursor: "pointer", fontWeight: 600, fontFamily: colors.font }}>
            {txt}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 8, marginBottom: 14 }}>
        <Mini label="Gastos" valor={gastosF.length} moneda={false} />
        <Mini label="Total gastado" valor={totalGastos} destacado />
        <Mini label="Anticipos" valor={totalAnticipos} />
        {devueltosF.length > 0 && <Mini label="Devueltos, fuera" valor={totalDevueltos} />}
        <Mini label="Con factura" valor={`${conAdjunto}/${gastosF.length}`} moneda={false} />
      </div>

      <SelectorContenido valor={contenido} onChange={setContenido} conAdjunto={conAdjunto} />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button variant="outline" onClick={generarExcel} disabled={!!generando || !gastosF.length}>
          <FileSpreadsheet size={14} /> {generando === "excel" ? "Generando..." : "Excel"}
        </Button>
        <Button variant="primary" onClick={generarPDF} disabled={!!generando || !gastosF.length}>
          {generando === "pdf" ? <Loader2 size={14} /> : <FileText size={14} />}
          {generando === "pdf" ? (progreso || "Generando...") : `PDF · ${CONTENIDO[contenido].label}`}
        </Button>
      </div>

      {!gastosF.length && <div style={{ fontSize: 11, color: colors.muted, marginTop: 10 }}>No hay gastos en este período.</div>}

      <div style={{ borderTop: `1px solid ${colors.border}`, marginTop: 16, paddingTop: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: colors.ink, marginBottom: 6 }}>Enviar por correo</div>
        <div style={{ fontSize: 11, color: colors.inkSoft, marginBottom: 8 }}>
          Va a <strong>{caja.responsable_nombre}</strong> (responsable) y a los usuarios con rol <strong>Admin</strong>.
        </div>
        <input value={extra} onChange={e => setExtra(e.target.value)} placeholder="Otro correo (opcional): contador@..." style={{ ...inputStyle, marginBottom: 8 }} />
        <Button variant="primary" onClick={enviarPorCorreo} disabled={!!generando || !gastosF.length}>
          {generando === "mail" ? <Loader2 size={14} /> : <Mail size={14} />}
          {generando === "mail" ? (progreso || "Enviando...") : "Enviar reporte"}
        </Button>
        {envio && (
          <div style={{ marginTop: 8, fontSize: 11, display: "flex", alignItems: "center", gap: 6,
            color: envio.ok ? colors.success : colors.danger }}>
            {envio.ok && <Check size={12} />}{envio.mensaje}
          </div>
        )}
      </div>
    </div>
  );
}

function Mini({ label, valor, moneda = true, destacado }) {
  return (
    <div style={{ background: colors.bg, borderRadius: colors.radiusSm, padding: "8px 10px" }}>
      <div style={{ fontSize: 9, color: colors.muted, fontWeight: 600, letterSpacing: 0.3 }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 13, fontWeight: destacado ? 700 : 600, color: destacado ? colors.ink : colors.inkSoft, marginTop: 2 }}>
        {moneda ? `$${money(valor)}` : valor}
      </div>
    </div>
  );
}
