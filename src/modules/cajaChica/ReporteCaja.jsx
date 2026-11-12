import { useState, useMemo } from "react";
import { FileSpreadsheet, FileText, Loader2, Mail, Check } from "lucide-react";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import SelectorContenido, { CONTENIDO, contenidoQueSale } from "../../components/ui/SelectorContenido";
import { exportarExcel, exportarPDF, construirPDF, money } from "../../lib/exportar";
import { enlaceArchivo, enlacesArchivos, subirArchivo } from "../../lib/archivos";
import { contenidoDelReporte, cierresParaElegir } from "./reporte.js";

const primerDiaMes = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split("T")[0]; };
const hoy = () => new Date().toISOString().split("T")[0];

// POR PERÍODO O POR CIERRE (qué entra en cada uno: reporte.js). `cierreInicial`
// es el cierre desde el que se abrió el reporte, si se abrió desde uno.
export default function ReporteCaja({ caja, gastos, anticipos, cierres = [], usuarios = [], cierreInicial = null }) {
  const elegibles = useMemo(() => cierresParaElegir(cierres), [cierres]);
  const [modo, setModo] = useState(cierreInicial ? "cierre" : "periodo");
  const [cierreId, setCierreId] = useState(cierreInicial ? String(cierreInicial) : "");
  const [desde, setDesde] = useState(primerDiaMes());
  const [hasta, setHasta] = useState(hoy());
  const [generando, setGenerando] = useState("");
  const [progreso, setProgreso] = useState("");
  const [envio, setEnvio] = useState(null);   // {ok, mensaje}
  const [extra, setExtra] = useState("");
  const [contenido, setContenido] = useState("completo");

  const porCierre = modo === "cierre";
  // Sin elegir, el último: es el que se acaba de rendir.
  const elegido = cierreId || (elegibles[0] ? String(elegibles[0].id) : "");
  const r = useMemo(() => contenidoDelReporte({ gastos, anticipos, cierres, modo, desde, hasta, cierreId: elegido }),
    [gastos, anticipos, cierres, modo, desde, hasta, elegido]);
  const { gastosF, devueltosF, anticiposF, reposiciones, cierresF, totalGastos, totalAnticipos, totalDevueltos, totalReposicion, queEs, difiere } = r;

  const periodo = r.etiqueta;
  // Cómo se nombra en el papel y en el archivo.
  const rotulo = porCierre ? periodo : `Período: ${periodo}`;
  const archivo = `Caja Chica - ${caja.proyecto_nombre} - ${r.nombre}`;
  // Lo firmado contra lo de hoy, cuando no coinciden.
  const aviso = difiere
    ? `Este cierre se firmó con ${difiere.firmado.gastos} ${difiere.firmado.gastos === 1 ? "gasto" : "gastos"} por $${money(difiere.firmado.total)} y $${money(difiere.firmado.entregado)} entregados. `
      + `Hoy tiene ${difiere.hoy.gastos} por $${money(difiere.hoy.total)} y $${money(difiere.hoy.entregado)} entregados: algo se corrigió después de cerrar.`
    : "";
  const conAdjunto = gastosF.filter(g => g.archivo_url).length;
  // Lo que va a salir en el PDF: lo elegido, o solo el reporte si en lo que se
  // pide no hay ningún sustento.
  const sale = contenidoQueSale(contenido, conAdjunto);

  async function generarExcel() {
    setGenerando("excel");
    try {
      const filasGastos = [
        [`CAJA CHICA — ${caja.proyecto_nombre}`],
        [`Responsable: ${caja.responsable_nombre}`, "", rotulo],
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
        [`${porCierre ? "ENTREGADO PARA ESTA VUELTA" : "ANTICIPOS"} — ${caja.proyecto_nombre}`],
        [rotulo],
        [],
        ["FECHA", "QUÉ ES", "DESCRIPCIÓN", "ENTREGADO POR", "MONTO"],
        ...anticiposF.map(a => [a.fecha, queEs(a), a.descripcion || "", a.entregado_por_nombre || "", Number(a.monto) || 0]),
        [],
        ["", "", "", porCierre ? "TOTAL ENTREGADO" : "TOTAL ANTICIPOS", totalAnticipos],
        // La reposición no es plata de esta vuelta: es la que llegó después,
        // por lo que se rindió en ella.
        ...(porCierre ? [
          [],
          ["REPOSICIÓN DE ESTE CIERRE"],
          ...(reposiciones.length
            ? [...reposiciones.map(a => [a.fecha, queEs(a), a.descripcion || "", a.entregado_por_nombre || "", Number(a.monto) || 0]),
               ["", "", "", "TOTAL REPUESTO", totalReposicion]]
            : [["Todavía no hay una reposición cargada después de este cierre."]]),
        ] : []),
      ];

      const filasCierres = [
        [`${porCierre ? "EL CIERRE" : "CIERRES DE CAJA"} — ${caja.proyecto_nombre}`],
        [rotulo],
        [],
        ["N°", "HASTA", "GASTOS", "ENTREGADO", "GASTADO", "SALDO", "CERRÓ", "NOTA"],
        ...cierresF.map(c => [c.numero, c.hasta, c.gastos, Number(c.total_abonado) || 0, Number(c.total_gastado) || 0,
          Number(c.saldo) || 0, c.cerrado_nombre || "", c.nota || ""]),
      ];

      const filasResumen = [
        ["RESUMEN DE CAJA CHICA", ""],
        [caja.proyecto_nombre, ""],
        [`Responsable: ${caja.responsable_nombre}`, ""],
        [rotulo, ""],
        [],
        ["Concepto", "Valor"],
        ...(porCierre ? [
          ["Entregado para esta vuelta", totalAnticipos],
          ["Gastado en esta vuelta", totalGastos],
          ["Saldo del cierre", totalAnticipos - totalGastos],
          [reposiciones.length ? `Reposición recibida (${reposiciones.map(a => a.fecha).join(", ")})` : "Reposición: todavía no cargada", totalReposicion],
          ...(devueltosF.length ? [["Devueltos al residente después de cerrar, fuera de la cuenta", totalDevueltos]] : []),
          ...(r.cierre?.cerrado_nombre ? [[`Cerró: ${r.cierre.cerrado_nombre}`, ""]] : []),
          ...(r.cierre?.nota ? [[`Nota del cierre: ${r.cierre.nota}`, ""]] : []),
          ...(aviso ? [[aviso, ""]] : []),
        ] : [
          ["Anticipos recibidos en el período", totalAnticipos],
          ["Gastos del período", totalGastos],
          ["Diferencia del período", totalAnticipos - totalGastos],
          ...(devueltosF.length ? [["Devueltos al residente, fuera de la cuenta", totalDevueltos]] : []),
          ...cierresF.map(c => [`Cierre ${c.numero} hasta el ${c.hasta}: gastado`, Number(c.total_gastado) || 0]),
        ]),
        [],
        ["Saldo total entregado (histórico)", Number(caja.saldo_total) || 0],
        ["Total gastado (histórico)", Number(caja.saldo_gastado) || 0],
        ["Saldo disponible", Number(caja.saldo_disponible) || 0],
      ];

      await exportarExcel(archivo, [
        { nombre: "Gastos", filas: filasGastos, anchos: [11, 28, 14, 18, 42, 24, 12, 12, 12, 16, 9] },
        { nombre: porCierre ? "Entregado" : "Anticipos", filas: filasAnticipos, anchos: [11, 30, 40, 20, 12] },
        ...(cierresF.length ? [{ nombre: porCierre ? "Cierre" : "Cierres", filas: filasCierres, anchos: [5, 11, 8, 12, 12, 12, 18, 30] }] : []),
        { nombre: "Resumen", filas: filasResumen, anchos: [36, 16] },
      ]);
    } finally { setGenerando(""); }
  }

  async function datosPDF(modo = sale) {
    const bloques = [{
        titulo: porCierre ? `Gastos del cierre N° ${r.cierre?.numero}` : "Gastos del período",
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
          titulo: porCierre ? "Entregado para esta vuelta" : "Anticipos recibidos",
          columnas: ["Fecha", "Qué es", "Descripción", "Entregado por", "Monto"],
          filas: anticiposF.map(a => [a.fecha, queEs(a), a.descripcion || "—", a.entregado_por_nombre || "—", money(a.monto)]),
          anchos: { 4: { halign: "right" } },
        });
      }
      if (reposiciones.length) {
        bloques.push({
          titulo: "Reposición de este cierre",
          columnas: ["Fecha", "Qué es", "Descripción", "Entregado por", "Monto"],
          filas: reposiciones.map(a => [a.fecha, queEs(a), a.descripcion || "—", a.entregado_por_nombre || "—", money(a.monto)]),
          anchos: { 4: { halign: "right" } },
        });
      }
      if (cierresF.length) {
        bloques.push({
          titulo: porCierre ? "El cierre, como se firmó" : "Cierres de caja del período",
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
        nombreArchivo: `${archivo}${sufijo}`,
        titulo: soloAnexos ? `Anexos — Caja Chica ${caja.proyecto_nombre}` : `Caja Chica — ${caja.proyecto_nombre}`,
        pie: { elemento: `${soloAnexos ? "Anexos de caja chica" : "Caja chica"} · ${porCierre ? periodo : `período ${periodo}`}`, proyecto: caja.proyecto_nombre },
        subtitulo: `Responsable: ${caja.responsable_nombre} · ${porCierre ? periodo : `Período ${periodo}`}${aviso ? ` · ${aviso}` : ""}`,
        indiceAdjuntos: soloAnexos,
        bloques: soloAnexos ? [] : bloques,
        adjuntos: modo === "reporte" ? [] : adjuntos,
        // Un cierre es una foto: el saldo que hoy tiene la caja no va en ella.
        resumen: soloAnexos ? [] : porCierre ? [
          { label: "Entregado", valor: `$${money(totalAnticipos)}` },
          { label: "Gastado", valor: `$${money(totalGastos)}`, color: [185, 28, 28] },
          ...(devueltosF.length ? [{ label: "Devueltos, fuera", valor: `$${money(totalDevueltos)}` }] : []),
          { label: "Saldo del cierre", valor: `$${money(totalAnticipos - totalGastos)}` },
          { label: "Reposición", valor: reposiciones.length ? `$${money(totalReposicion)}` : "sin cargar", color: [21, 128, 61] },
        ] : [
          { label: "Anticipos período", valor: `$${money(totalAnticipos)}` },
          { label: "Gastos período", valor: `$${money(totalGastos)}`, color: [185, 28, 28] },
          ...(devueltosF.length ? [{ label: "Devueltos, fuera", valor: `$${money(totalDevueltos)}` }] : []),
          { label: "Diferencia", valor: `$${money(totalAnticipos - totalGastos)}` },
          { label: "Saldo disponible", valor: `$${money(caja.saldo_disponible)}`, color: [21, 128, 61] },
        ],
        onProgreso: (i, t) => setProgreso(`Adjuntando sustentos ${i}/${t}...`),
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
      const doc = await construirPDF(await datosPDF(sale === "anexos" ? "completo" : sale));
      const base64 = doc.output("datauristring").split(",")[1];
      const pesoMB = (base64.length * 0.75) / (1024 * 1024);

      // Si pesa demasiado para el correo, se sube y va como enlace.
      let pdfBase64 = base64, pdfUrl = null;
      if (pesoMB > 8) {
        setProgreso("El PDF es grande, subiéndolo...");
        const ruta = `caja-${caja.id}/reporte-${porCierre ? `cierre-${r.cierre?.numero}` : desde}-${Date.now()}.pdf`;
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
            // Por cierre, los tres números son los de esa vuelta; por período,
            // los de la caja entera, como siempre.
            recibido: porCierre ? totalAnticipos : caja.saldo_total,
            gastado: porCierre ? totalGastos : caja.saldo_gastado,
            saldo: porCierre ? totalAnticipos - totalGastos : caja.saldo_disponible,
            gastos: gastosF.map((g, i) => ({ fecha: g.fecha, descripcion: g.descripcion,
              montoTotal: g.monto, tieneFactura: !!g.archivo_url, fotoUrl: fotos[i] })),
            emailAsistente: admins, emailResponsable: responsable?.email || null,
            destinatariosExtra: extras,
            pdfBase64, pdfUrl, pdfNombre: `${archivo}.pdf`,
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
  const pastilla = { border: "none", borderRadius: 20, padding: "5px 12px", fontSize: 11, cursor: "pointer", fontWeight: 600, fontFamily: colors.font };

  return (
    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: colors.ink, marginBottom: 12 }}>Reporte de caja chica</div>

      {/* POR PERÍODO O POR CIERRE. Solo se ofrece si la caja ya tiene alguno. */}
      {elegibles.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {[["periodo", "Por período"], ["cierre", "Por cierre"]].map(([m, txt]) => (
            <button key={m} onClick={() => setModo(m)} aria-pressed={modo === m}
              style={{ ...pastilla, background: modo === m ? colors.brand : colors.neutralSoft, color: modo === m ? "#fff" : colors.inkSoft }}>
              {txt}
            </button>
          ))}
        </div>
      )}

      {porCierre ? (
        <div style={{ marginBottom: 14 }}>
          <label style={lbl} htmlFor="reporte-cierre">CIERRE</label>
          <select id="reporte-cierre" value={elegido} onChange={e => setCierreId(e.target.value)} style={inputStyle}>
            {elegibles.map(c => (
              <option key={c.id} value={String(c.id)}>
                {`Cierre N° ${c.numero} — hasta el ${String(c.hasta || "").slice(0, 10)} · ${c.gastos} ${Number(c.gastos) === 1 ? "gasto" : "gastos"} · $${money(c.total_gastado)}`}
              </option>
            ))}
          </select>
          <div style={{ fontSize: 11, color: colors.muted, marginTop: 6 }}>
            Sale lo que se rindió en esa vuelta, no un rango de fechas: lo devuelto al residente o cargado después quedó para otro cierre.
          </div>
        </div>
      ) : (<>
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
              style={{ ...pastilla, background: desde === d ? colors.brandSoft : colors.neutralSoft, color: desde === d ? colors.brand : colors.inkSoft }}>
              {txt}
            </button>
          ))}
        </div>
      </>)}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 8, marginBottom: 14 }}>
        <Mini label="Gastos" valor={gastosF.length} moneda={false} />
        <Mini label="Total gastado" valor={totalGastos} destacado />
        <Mini label={porCierre ? "Entregado" : "Anticipos"} valor={totalAnticipos} />
        {porCierre && <Mini label="Saldo del cierre" valor={totalAnticipos - totalGastos} />}
        {porCierre && <Mini label="Reposición" valor={reposiciones.length ? totalReposicion : "sin cargar"} moneda={reposiciones.length > 0} />}
        {devueltosF.length > 0 && <Mini label="Devueltos, fuera" valor={totalDevueltos} />}
        <Mini label="Con factura" valor={`${conAdjunto}/${gastosF.length}`} moneda={false} />
      </div>

      {aviso && (
        <div role="status" style={{ fontSize: 11.5, color: colors.warning, background: colors.warningSoft, borderRadius: colors.radiusSm, padding: "8px 10px", marginBottom: 14 }}>
          {aviso}
        </div>
      )}

      <SelectorContenido valor={contenido} onChange={setContenido} conAdjunto={conAdjunto} />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button variant="outline" onClick={generarExcel} disabled={!!generando || !gastosF.length}>
          <FileSpreadsheet size={14} /> {generando === "excel" ? "Generando..." : "Excel"}
        </Button>
        <Button variant="primary" onClick={generarPDF} disabled={!!generando || !gastosF.length}>
          {generando === "pdf" ? <Loader2 size={14} /> : <FileText size={14} />}
          {generando === "pdf" ? (progreso || "Generando...") : `PDF · ${CONTENIDO[sale].label}`}
        </Button>
      </div>

      {!gastosF.length && <div style={{ fontSize: 11, color: colors.muted, marginTop: 10 }}>{porCierre ? "Ese cierre no tiene gastos." : "No hay gastos en este período."}</div>}

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
