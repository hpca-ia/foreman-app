import { useState, useEffect, useRef } from "react";
import { FileText, FileSpreadsheet, Plus, X, Check, Loader2 } from "lucide-react";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import { colors } from "../../theme/colors";
import { loadFromStorage } from "../../lib/storage";
import { listarLogos, subirLogo, borrarLogo, logoParaPDF } from "../../lib/logos";
import { money } from "../../lib/exportar";
import { FORMATOS, CONDICIONES_COTIZAR, estructura, totalesDe, pdfPresupuesto, excelPresupuesto } from "./documentoPresupuesto";

// Sacar el presupuesto terminado: con qué formato y con qué logo.
//
// Lo elegido la última vez queda recordado en este navegador —quien siempre
// presenta con el logo de un socio no tiene que buscarlo cada vez—, y la vista
// de la derecha muestra cómo va a salir antes de bajarlo.

const recordar = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const recordado = (k, def) => { try { return localStorage.getItem(k) || def; } catch { return def; } };

export default function ExportarPresupuesto({ presupuesto, capitulos, items, onCerrar }) {
  const empresa = loadFromStorage("foreman_empresa", {}) || {};
  const [formato, setFormato] = useState(() => recordado("foreman_pres_formato", "detallado"));
  const [logos, setLogos] = useState([]);
  const [logoSel, setLogoSel] = useState(() => recordado("foreman_pres_logo", "empresa"));
  const [titulo, setTitulo] = useState(() => FORMATOS[recordado("foreman_pres_formato", "detallado")]?.titulo || "Presupuesto");
  const [tituloTocado, setTituloTocado] = useState(false);
  const [validez, setValidez] = useState("30 días");
  // Con o sin IVA depende del cliente: se decide al presentar, y se recuerda.
  const [conIva, setConIva] = useState(() => recordado("foreman_pres_iva", "si") !== "no");
  const [condiciones, setCondiciones] = useState(presupuesto.notas || "");
  const [generando, setGenerando] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");
  const archivoRef = useRef(null);

  useEffect(() => { listarLogos().then(setLogos); }, []);

  const logo = logoSel === "ninguno" ? null : logos.find(l => l.id === logoSel) || logos[0] || null;

  function elegirFormato(f) {
    setFormato(f); recordar("foreman_pres_formato", f);
    if (!tituloTocado) setTitulo(FORMATOS[f].titulo);
    // Al contratista no se le mandan las condiciones con que se le vende al cliente.
    if (f === "cotizar" && (condiciones === (presupuesto.notas || "") || !condiciones)) setCondiciones(CONDICIONES_COTIZAR);
    if (f !== "cotizar" && condiciones === CONDICIONES_COTIZAR) setCondiciones(presupuesto.notas || "");
  }
  function elegirLogo(id) { setLogoSel(id); recordar("foreman_pres_logo", id); }

  async function nuevoLogo(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const nombre = window.prompt("¿De quién es este logo?", file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
    if (nombre === null) return;
    setSubiendo(true); setError("");
    const r = await subirLogo(file, nombre);
    setSubiendo(false);
    if (r.error) { setError(r.error); return; }
    setLogos(await listarLogos());
    elegirLogo(r.id);
  }

  async function quitarLogo(l) {
    if (!window.confirm(`¿Quitar el logo "${l.nombre}"? Los documentos que ya se bajaron no cambian.`)) return;
    const e = await borrarLogo(l.ruta);
    if (e) { setError(e.message); return; }
    if (logoSel === l.id) elegirLogo("empresa");
    setLogos(await listarLogos());
  }

  const opciones = { presupuesto, capitulos, items, formato, empresa, titulo, validez, condiciones, conIva };

  async function bajarPDF() {
    setGenerando("pdf"); setError("");
    try {
      const imagen = logo ? await logoParaPDF(logo.url) : null;
      if (logo && !imagen) setError("El logo no cargó: el PDF salió sin logo.");
      const doc = pdfPresupuesto({ ...opciones, logo: imagen });
      doc.save(nombreArchivo("pdf"));
    } catch (e) {
      setError("No se pudo armar el PDF: " + e.message);
    } finally { setGenerando(""); }
  }

  const nombreArchivo = ext => `${(presupuesto.nombre || "Presupuesto").replace(/[^\w\sáéíóúñÁÉÍÓÚÑ-]/g, "").trim()} - ${FORMATOS[formato].label}.${ext}`;

  async function bajarExcel() {
    setGenerando("excel"); setError("");
    try {
      const imagen = logo ? await logoParaPDF(logo.url) : null;
      if (logo && !imagen) setError("El logo no cargó: el Excel salió sin logo.");
      const blob = await excelPresupuesto({ ...opciones, logo: imagen });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = nombreArchivo("xlsx"); a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) {
      setError("No se pudo armar el Excel: " + e.message);
    } finally { setGenerando(""); }
  }

  const campo = { width: "100%", boxSizing: "border-box", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: "8px 10px", fontSize: 12, fontFamily: colors.font, color: colors.ink, outline: "none" };
  const etiqueta = { fontSize: 10, color: colors.muted, fontWeight: 600, letterSpacing: 0.4, marginBottom: 6 };

  return (
    <Modal onClose={onCerrar} maxWidth={880}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: colors.ink }}>Exportar presupuesto</div>
          <div style={{ fontSize: 12, color: colors.muted }}>{presupuesto.nombre} · {presupuesto.cliente_nombre}</div>
        </div>
        <button onClick={onCerrar} style={{ marginLeft: "auto", background: "none", border: "none", color: colors.muted, cursor: "pointer", display: "flex" }}><X size={18} /></button>
      </div>

      <div className="exportar-pres">
        <div style={{ display: "grid", gap: 16, alignContent: "start", minWidth: 0 }}>
          <div>
            <div style={etiqueta}>FORMATO</div>
            <div style={{ display: "grid", gap: 6 }}>
              {Object.entries(FORMATOS).map(([id, f]) => (
                <button key={id} onClick={() => elegirFormato(id)}
                  style={{ textAlign: "left", cursor: "pointer", fontFamily: colors.font, borderRadius: colors.radiusMd, padding: "9px 12px",
                    border: `1.5px solid ${formato === id ? colors.brand : colors.border}`, background: formato === id ? colors.brandSoft : colors.surface }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: formato === id ? colors.brand : colors.ink }}>{f.label}</div>
                  <div style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>{f.ayuda}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={etiqueta}>LOGO</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(104px, 1fr))", gap: 6 }}>
              {logos.map(l => (
                <div key={l.id} style={{ position: "relative" }}>
                  <button onClick={() => elegirLogo(l.id)} title={l.nombre}
                    style={{ width: "100%", height: 66, cursor: "pointer", borderRadius: colors.radiusMd, padding: 6, background: "#fff",
                      border: `1.5px solid ${logo?.id === l.id ? colors.brand : colors.border}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
                    <img src={l.url} alt={l.nombre} style={{ maxWidth: "100%", maxHeight: 34, objectFit: "contain" }} />
                    <span style={{ fontSize: 9, color: colors.muted, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.nombre}</span>
                  </button>
                  {logo?.id === l.id && <span style={{ position: "absolute", top: 4, left: 4, background: colors.brand, color: "#fff", borderRadius: 10, width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center" }}><Check size={10} /></span>}
                  {l.ruta && (
                    <button onClick={() => quitarLogo(l)} title="Quitar este logo"
                      style={{ position: "absolute", top: 3, right: 3, background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10, width: 18, height: 18, cursor: "pointer", color: colors.muted, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                      <X size={10} />
                    </button>
                  )}
                </div>
              ))}
              <button onClick={() => elegirLogo("ninguno")}
                style={{ height: 66, cursor: "pointer", borderRadius: colors.radiusMd, fontFamily: colors.font, fontSize: 11, color: colors.inkSoft, background: colors.surface,
                  border: `1.5px solid ${logoSel === "ninguno" ? colors.brand : colors.border}` }}>
                Sin logo
              </button>
              <button onClick={() => archivoRef.current?.click()} disabled={subiendo}
                style={{ height: 66, cursor: "pointer", borderRadius: colors.radiusMd, fontFamily: colors.font, fontSize: 11, color: colors.brand, background: colors.surface,
                  border: `1.5px dashed ${colors.border}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3 }}>
                {subiendo ? <Loader2 size={14} /> : <Plus size={14} />} {subiendo ? "Subiendo…" : "Subir otro"}
              </button>
              <input ref={archivoRef} type="file" accept="image/*" onChange={nuevoLogo} style={{ display: "none" }} />
            </div>
          </div>

          <div>
            <div style={etiqueta}>IVA</div>
            <div style={{ display: "inline-flex", gap: 3, background: colors.neutralSoft, borderRadius: colors.radiusSm, padding: 3 }}>
              {[[true, "Con IVA"], [false, "Sin IVA"]].map(([v, l]) => (
                <button key={l} onClick={() => { setConIva(v); recordar("foreman_pres_iva", v ? "si" : "no"); }}
                  style={{ padding: "5px 14px", borderRadius: 6, border: "none", cursor: "pointer", fontFamily: colors.font, fontSize: 12, fontWeight: 600,
                    background: conIva === v ? colors.surface : "transparent", color: conIva === v ? colors.brand : colors.inkSoft }}>{l}</button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>
              {conIva ? `Suma el IVA (${presupuesto.iva_pct ?? 15}%) al final.` : "Sin línea de IVA; el documento dice que los valores no lo incluyen."}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: formato === "cotizar" ? "1fr" : "1fr 120px", gap: 8 }}>
            <div>
              <div style={etiqueta}>TÍTULO DEL DOCUMENTO</div>
              <input value={titulo} onChange={e => { setTitulo(e.target.value); setTituloTocado(true); }} style={campo} />
            </div>
            {formato !== "cotizar" && (
              <div>
                <div style={etiqueta}>VALIDEZ</div>
                <input value={validez} onChange={e => setValidez(e.target.value)} placeholder="30 días" style={campo} />
              </div>
            )}
          </div>
          <div>
            <div style={etiqueta}>CONDICIONES</div>
            <textarea value={condiciones} onChange={e => setCondiciones(e.target.value)} rows={3}
              placeholder="Forma de pago, plazo, qué incluye y qué no…" style={{ ...campo, resize: "vertical", lineHeight: 1.5 }} />
          </div>
        </div>

        <Vista presupuesto={presupuesto} capitulos={capitulos} items={items} formato={formato} logo={logo} empresa={empresa} titulo={titulo} validez={validez} conIva={conIva} />
      </div>

      {error && <div style={{ background: colors.warningSoft, border: `1px solid ${colors.warningBorder}`, borderRadius: colors.radiusMd, padding: 10, fontSize: 12, color: colors.warning, marginTop: 12 }}>{error}</div>}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: colors.muted, marginRight: "auto" }}>
          {formato === "cotizar" ? "En el Excel el contratista llena los precios y los totales salen solos." : "El Excel lleva el mismo diseño, con las cuentas en fórmulas."}
        </span>
        <Button variant="outline" onClick={bajarExcel} disabled={!items.length || !!generando}>
          {generando === "excel" ? <Loader2 size={14} /> : <FileSpreadsheet size={14} />} {generando === "excel" ? "Armando…" : "Descargar Excel"}
        </Button>
        <Button variant="primary" onClick={bajarPDF} disabled={!items.length || !!generando}>
          {generando === "pdf" ? <Loader2 size={14} /> : <FileText size={14} />} {generando === "pdf" ? "Armando…" : "Descargar PDF"}
        </Button>
      </div>
    </Modal>
  );
}

/** Cómo va a salir la primera hoja: el encabezado y el comienzo de la tabla. */
function Vista({ presupuesto, capitulos, items, formato, logo, empresa, titulo, validez, conIva }) {
  const caps = estructura({ capitulos, items });
  const tot = totalesDe(items, presupuesto, conIva);
  const marca = /^#[0-9a-f]{6}$/i.test(empresa.color || "") ? empresa.color : colors.brand;
  const conPrecio = formato !== "cotizar";
  const filas = [];
  caps.slice(0, 3).forEach(c => {
    if (formato === "capitulos") { filas.push({ cap: false, n: c.numero, d: c.nombre, t: money(c.subtotal) }); return; }
    filas.push({ cap: true, n: c.numero, d: c.nombre.toUpperCase(), t: conPrecio ? money(c.subtotal) : "" });
    c.rubros.slice(0, 2).forEach(r => filas.push({ cap: false, n: r.numero, d: r.descripcion, u: r.unidad, c: r.cantidad, pu: conPrecio ? money(r.precio_unitario) : "", t: conPrecio ? money(r.total) : "" }));
  });
  const celda = { padding: "3px 4px", borderBottom: "1px solid #EEE", fontSize: 7.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };

  return (
    <div style={{ background: colors.neutralSoft, borderRadius: colors.radiusMd, padding: 12, minWidth: 0 }}>
      <div style={{ fontSize: 10, color: colors.muted, fontWeight: 600, letterSpacing: 0.4, marginBottom: 8 }}>ASÍ VA A SALIR</div>
      <div style={{ background: "#fff", boxShadow: "0 2px 10px rgba(0,0,0,0.08)", borderRadius: 3, padding: "16px 16px 12px", fontFamily: "Helvetica, Arial, sans-serif", color: "#111827", minHeight: 300 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, paddingBottom: 8, borderBottom: `1.5px solid ${marca}` }}>
          {logo ? <img src={logo.url} alt="" style={{ maxWidth: 96, maxHeight: 36, objectFit: "contain" }} /> : <div style={{ height: 20 }} />}
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <div style={{ fontSize: 9, fontWeight: 700 }}>{empresa.nombre || "HCA Studio"}</div>
            <div style={{ fontSize: 6.5, color: "#6B7280" }}>{[empresa.ciudad, empresa.telefono, empresa.email].filter(Boolean).join(" · ")}</div>
          </div>
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, margin: "12px 0 6px" }}>{titulo || FORMATOS[formato].titulo}</div>
        <div style={{ fontSize: 7.5, lineHeight: 1.6, marginBottom: 8 }}>
          <div><span style={{ color: "#6B7280", display: "inline-block", width: 64 }}>Proyecto</span>{presupuesto.nombre}</div>
          {conPrecio && <div><span style={{ color: "#6B7280", display: "inline-block", width: 64 }}>Cliente</span>{presupuesto.cliente_nombre}</div>}
          {conPrecio && validez && <div><span style={{ color: "#6B7280", display: "inline-block", width: 64 }}>Validez</span>{validez}</div>}
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <thead>
            <tr style={{ background: marca, color: "#fff" }}>
              <th style={{ ...celda, width: 22, textAlign: "left" }}>N°</th>
              <th style={{ ...celda, textAlign: "left" }}>{formato === "capitulos" ? "Capítulo" : "Descripción"}</th>
              {formato !== "capitulos" && <th style={{ ...celda, width: 26 }}>Und</th>}
              {formato !== "capitulos" && <th style={{ ...celda, width: 30, textAlign: "right" }}>Cant</th>}
              {formato !== "capitulos" && <th style={{ ...celda, width: 44, textAlign: "right" }}>P.U.</th>}
              <th style={{ ...celda, width: 52, textAlign: "right" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={i} style={f.cap ? { background: `${marca}18`, color: marca, fontWeight: 700 } : null}>
                <td style={celda}>{f.n}</td>
                <td style={celda}>{f.d}</td>
                {formato !== "capitulos" && <td style={{ ...celda, textAlign: "center" }}>{f.u || ""}</td>}
                {formato !== "capitulos" && <td style={{ ...celda, textAlign: "right" }}>{f.c ?? ""}</td>}
                {formato !== "capitulos" && <td style={{ ...celda, textAlign: "right" }}>{f.pu || ""}</td>}
                <td style={{ ...celda, textAlign: "right" }}>{f.t}</td>
              </tr>
            ))}
            <tr><td colSpan={6} style={{ ...celda, color: "#9CA3AF", textAlign: "center" }}>…</td></tr>
          </tbody>
        </table>
        {conPrecio && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
            <div style={{ fontSize: 8, fontWeight: 700, background: `${marca}18`, color: marca, padding: "4px 8px" }}>TOTAL $ {money(tot.total)}{!conIva && <span style={{ fontWeight: 400, fontStyle: "italic" }}> · sin IVA</span>}</div>
          </div>
        )}
      </div>
    </div>
  );
}
