import { useState, useEffect, useRef } from "react";
import { FileText, FileSpreadsheet, Plus, X, Check, Loader2, Pencil } from "lucide-react";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import { colors } from "../../theme/colors";
import { loadFromStorage } from "../../lib/storage";
import { listarLogos, subirLogo, borrarLogo, logoParaPDF } from "../../lib/logos";
import { money } from "../../lib/exportar";
import { FORMATOS, PLANTILLAS, NOTAS_COTIZAR, estructura, totalesDe, versionDe, pdfPresupuesto, excelPresupuesto } from "./documentoPresupuesto";
import { GRUPOS_NOTAS, TODAS_LAS_NOTAS } from "./notasContrato";

// Sacar el presupuesto terminado: con qué plantilla, qué formato, qué logo,
// qué notas y quién firma.
//
// Lo elegido queda recordado en este navegador —la plantilla, las notas que
// se marcan casi siempre, el nombre de quien firma—: el segundo presupuesto no
// debería costar lo mismo que el primero. La vista de la derecha muestra cómo
// va a salir antes de bajarlo.

const recordar = (k, v) => { try { localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v)); } catch {} };
const recordado = (k, def) => { try { return localStorage.getItem(k) || def; } catch { return def; } };
const recordadoJSON = (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } };
const rgb = c => `rgb(${c.join(",")})`;

export default function ExportarPresupuesto({ presupuesto, capitulos, items, onCerrar }) {
  const empresa = loadFromStorage("foreman_empresa", {}) || {};
  const [plantilla, setPlantilla] = useState(() => PLANTILLAS[recordado("foreman_pres_plantilla", "")] ? recordado("foreman_pres_plantilla", "") : "minimalista");
  const [formato, setFormato] = useState(() => FORMATOS[recordado("foreman_pres_formato", "")] ? recordado("foreman_pres_formato", "") : "detallado");
  const [logos, setLogos] = useState([]);
  const [logoSel, setLogoSel] = useState(() => recordado("foreman_pres_logo", "empresa"));
  const [titulo, setTitulo] = useState(() => FORMATOS[recordado("foreman_pres_formato", "detallado")]?.titulo || "Presupuesto");
  const [tituloTocado, setTituloTocado] = useState(false);
  const [validez, setValidez] = useState("30 días");
  // Con o sin IVA depende del cliente: se decide al presentar, y se recuerda.
  const [conIva, setConIva] = useState(() => recordado("foreman_pres_iva", "si") !== "no");
  const [firma, setFirma] = useState(() => recordadoJSON("foreman_pres_firma", { nombre: "", cargo: "" }));
  // El texto junto al logo: vacío de entrada, porque el logo ya dice quién es.
  // Lo que se escriba se recuerda.
  const [membrete, setMembrete] = useState(() => recordadoJSON("foreman_pres_membrete", ["", "", ""]));
  const [aceptacion, setAceptacion] = useState(() => recordado("foreman_pres_aceptacion", "si") !== "no");
  // Las notas de contrato: cuáles van y con qué texto. Se recuerdan.
  const [marcadas, setMarcadas] = useState(() => {
    const guardadas = recordadoJSON("foreman_pres_notas", null);
    if (!guardadas) return TODAS_LAS_NOTAS.filter(x => x.marcada).map(x => x.id);
    const conocidas = recordadoJSON("foreman_pres_notas_conocidas", TODAS_LAS_NOTAS.map(x => x.id));
    const nuevas = TODAS_LAS_NOTAS.filter(x => x.marcada && !conocidas.includes(x.id)).map(x => x.id);
    return [...guardadas, ...nuevas];
  });
  useEffect(() => { recordar("foreman_pres_notas_conocidas", TODAS_LAS_NOTAS.map(x => x.id)); }, []);
  const [textos, setTextos] = useState(() => recordadoJSON("foreman_pres_notas_textos", {}));
  const [editandoNota, setEditandoNota] = useState(null);
  const [particulares, setParticulares] = useState(presupuesto.notas || "");
  const [paraCotizar, setParaCotizar] = useState(NOTAS_COTIZAR.join("\n"));
  const [generando, setGenerando] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");
  const archivoRef = useRef(null);

  useEffect(() => { listarLogos().then(setLogos); }, []);

  const logo = logoSel === "ninguno" ? null : logos.find(l => l.id === logoSel) || logos[0] || null;
  const { version } = versionDe(presupuesto.nombre);
  const textoDe = nota => textos[nota.id] ?? nota.texto;

  function elegirFormato(f) {
    setFormato(f); recordar("foreman_pres_formato", f);
    if (!tituloTocado) setTitulo(FORMATOS[f].titulo);
  }
  function elegirPlantilla(p) { setPlantilla(p); recordar("foreman_pres_plantilla", p); }
  function elegirLogo(id) { setLogoSel(id); recordar("foreman_pres_logo", id); }
  function cambiarFirma(campo, valor) { const f = { ...firma, [campo]: valor }; setFirma(f); recordar("foreman_pres_firma", f); }
  function cambiarMembrete(i, valor) { const m = [...membrete]; m[i] = valor; setMembrete(m); recordar("foreman_pres_membrete", m); }
  function alternarNota(id) {
    const m = marcadas.includes(id) ? marcadas.filter(x => x !== id) : [...marcadas, id];
    setMarcadas(m); recordar("foreman_pres_notas", m);
  }
  function cambiarTexto(id, valor) {
    const t = { ...textos, [id]: valor };
    setTextos(t); recordar("foreman_pres_notas_textos", t);
  }
  function restaurarTexto(id) {
    const t = { ...textos }; delete t[id];
    setTextos(t); recordar("foreman_pres_notas_textos", t);
  }

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

  // Las notas en el orden del catálogo, y después las de este presupuesto.
  const lineas = t => String(t || "").split(/\n+/).map(x => x.trim()).filter(Boolean);
  const notas = formato === "cotizar"
    ? lineas(paraCotizar)
    : [...TODAS_LAS_NOTAS.filter(x => marcadas.includes(x.id)).map(textoDe), ...lineas(particulares)];

  const opciones = { presupuesto, capitulos, items, formato, plantilla, empresa, titulo, validez, conIva, notas, firma, aceptacion, membrete };
  const nombreArchivo = ext => {
    const { base } = versionDe(presupuesto.nombre);
    return `${(base || "Presupuesto").replace(/[^\w\sáéíóúñÁÉÍÓÚÑ-]/g, "").trim()} - ${FORMATOS[formato].label} v${version}.${ext}`;
  };

  async function bajarPDF() {
    setGenerando("pdf"); setError("");
    try {
      const imagen = logo ? await logoParaPDF(logo.url) : null;
      if (logo && !imagen) setError("El logo no cargó: el PDF salió sin logo.");
      pdfPresupuesto({ ...opciones, logo: imagen }).save(nombreArchivo("pdf"));
    } catch (e) {
      setError("No se pudo armar el PDF: " + e.message);
    } finally { setGenerando(""); }
  }

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
  const tarjeta = activa => ({ textAlign: "left", cursor: "pointer", fontFamily: colors.font, borderRadius: colors.radiusMd, padding: "8px 10px",
    border: `1.5px solid ${activa ? colors.ink : colors.border}`, background: activa ? colors.neutralSoft : colors.surface });
  const seccion = { paddingTop: 14, borderTop: `1px solid ${colors.border}` };

  return (
    <Modal onClose={onCerrar} maxWidth={960}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: colors.ink }}>Exportar presupuesto</div>
          <div style={{ fontSize: 12, color: colors.muted }}>{presupuesto.nombre} · {presupuesto.cliente_nombre} · Versión {version}</div>
        </div>
        <button onClick={onCerrar} style={{ marginLeft: "auto", background: "none", border: "none", color: colors.muted, cursor: "pointer", display: "flex" }}><X size={18} /></button>
      </div>

      <div className="exportar-pres">
        <div style={{ display: "grid", gap: 14, alignContent: "start", minWidth: 0 }}>
          {/* ── Diseño ── */}
          <div>
            <div style={etiqueta}>PLANTILLA</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 6 }}>
              {Object.entries(PLANTILLAS).map(([id, p]) => (
                <button key={id} onClick={() => elegirPlantilla(id)} style={tarjeta(plantilla === id)} title={p.ayuda}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 14, height: 14, borderRadius: 3, background: rgb(p.cabeceraFondo || p.primario), border: `2px solid ${rgb(p.acento)}` }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: colors.ink, fontFamily: p.fuenteTitulo === "times" ? "Georgia, 'Times New Roman', serif" : colors.font }}>{p.label}</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: colors.muted, marginTop: 3, lineHeight: 1.35 }}>{p.ayuda}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={etiqueta}>FORMATO</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 6 }}>
              {Object.entries(FORMATOS).map(([id, f]) => (
                <button key={id} onClick={() => elegirFormato(id)} style={tarjeta(formato === id)} title={f.ayuda}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: colors.ink }}>{f.label}</div>
                  <div style={{ fontSize: 10.5, color: colors.muted, marginTop: 2, lineHeight: 1.35 }}>{f.ayuda}</div>
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
                    style={{ width: "100%", height: 62, cursor: "pointer", borderRadius: colors.radiusMd, padding: 6, background: "#fff",
                      border: `1.5px solid ${logo?.id === l.id ? colors.ink : colors.border}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
                    <img src={l.url} alt={l.nombre} style={{ maxWidth: "100%", maxHeight: 30, objectFit: "contain" }} />
                    <span style={{ fontSize: 9, color: colors.muted, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.nombre}</span>
                  </button>
                  {logo?.id === l.id && <span style={{ position: "absolute", top: 4, left: 4, background: colors.ink, color: "#fff", borderRadius: 10, width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center" }}><Check size={10} /></span>}
                  {l.ruta && (
                    <button onClick={() => quitarLogo(l)} title="Quitar este logo"
                      style={{ position: "absolute", top: 3, right: 3, background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10, width: 18, height: 18, cursor: "pointer", color: colors.muted, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                      <X size={10} />
                    </button>
                  )}
                </div>
              ))}
              <button onClick={() => elegirLogo("ninguno")}
                style={{ height: 62, cursor: "pointer", borderRadius: colors.radiusMd, fontFamily: colors.font, fontSize: 11, color: colors.inkSoft, background: colors.surface,
                  border: `1.5px solid ${logoSel === "ninguno" ? colors.ink : colors.border}` }}>
                Sin logo
              </button>
              <button onClick={() => archivoRef.current?.click()} disabled={subiendo}
                style={{ height: 62, cursor: "pointer", borderRadius: colors.radiusMd, fontFamily: colors.font, fontSize: 11, color: colors.inkSoft, background: colors.surface,
                  border: `1.5px dashed ${colors.border}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3 }}>
                {subiendo ? <Loader2 size={14} /> : <Plus size={14} />} {subiendo ? "Subiendo…" : "Subir otro"}
              </button>
              <input ref={archivoRef} type="file" accept="image/*" onChange={nuevoLogo} style={{ display: "none" }} />
            </div>
          </div>

          <div>
            <div style={etiqueta}>TEXTO JUNTO AL LOGO <span style={{ fontWeight: 400 }}>· opcional</span></div>
            <div style={{ display: "grid", gap: 6 }}>
              {[["Nombre (ej. HCA Studio)", true], ["Dirección o ciudad", false], ["Teléfono, correo o web", false]].map(([ph, fuerte], i) => (
                <input key={i} value={membrete[i] || ""} onChange={e => cambiarMembrete(i, e.target.value)} placeholder={ph}
                  style={{ ...campo, fontWeight: fuerte ? 600 : 400 }} />
              ))}
            </div>
          </div>

          {/* ── Datos ── */}
          <div style={{ ...seccion, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
            <div>
              <div style={etiqueta}>TÍTULO DEL DOCUMENTO</div>
              <input value={titulo} onChange={e => { setTitulo(e.target.value); setTituloTocado(true); }} style={campo} />
            </div>
            {formato !== "cotizar" && (
              <div>
                <div style={etiqueta}>VALIDEZ DE LA OFERTA</div>
                <input value={validez} onChange={e => setValidez(e.target.value)} placeholder="30 días" style={campo} />
              </div>
            )}
            <div>
              <div style={etiqueta}>IVA</div>
              <div style={{ display: "inline-flex", gap: 3, background: colors.neutralSoft, borderRadius: colors.radiusSm, padding: 3 }}>
                {[[true, "Con IVA"], [false, "Sin IVA"]].map(([v, l]) => (
                  <button key={l} onClick={() => { setConIva(v); recordar("foreman_pres_iva", v ? "si" : "no"); }}
                    style={{ padding: "5px 12px", borderRadius: 6, border: "none", cursor: "pointer", fontFamily: colors.font, fontSize: 12, fontWeight: 600,
                      background: conIva === v ? colors.surface : "transparent", color: conIva === v ? colors.ink : colors.inkSoft }}>{l}</button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Firma ── */}
          <div style={seccion}>
            <div style={etiqueta}>PIE DE FIRMA</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
              <input value={firma.nombre || ""} onChange={e => cambiarFirma("nombre", e.target.value)} placeholder="Nombre de quien firma (Arq. …)" style={campo} />
              <input value={firma.cargo || ""} onChange={e => cambiarFirma("cargo", e.target.value)} placeholder="Cargo (Director, Gerente de proyecto…)" style={campo} />
            </div>
            {formato !== "cotizar" && (
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: colors.inkSoft, marginTop: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={aceptacion} onChange={e => { setAceptacion(e.target.checked); recordar("foreman_pres_aceptacion", e.target.checked ? "si" : "no"); }} />
                Espacio para la firma de aceptación del cliente
              </label>
            )}
          </div>

          {/* ── Notas ── */}
          <div style={seccion}>
            {formato === "cotizar" ? (
              <>
                <div style={etiqueta}>INDICACIONES PARA QUIEN COTIZA</div>
                <textarea value={paraCotizar} onChange={e => setParaCotizar(e.target.value)} rows={3} style={{ ...campo, resize: "vertical", lineHeight: 1.5 }} />
                <div style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>Una por línea: cada línea sale numerada.</div>
              </>
            ) : (
              <>
                <div style={{ ...etiqueta, display: "flex", justifyContent: "space-between" }}>
                  <span>NOTAS Y CONDICIONES</span><span style={{ fontWeight: 400 }}>{notas.length} en el documento</span>
                </div>
                <div style={{ display: "grid", gap: 10 }}>
                  {GRUPOS_NOTAS.map(g => (
                    <div key={g.titulo}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: colors.inkSoft, marginBottom: 4 }}>{g.titulo}</div>
                      <div style={{ display: "grid", gap: 4 }}>
                        {g.notas.map(nota => {
                          const activa = marcadas.includes(nota.id);
                          const cambiada = textos[nota.id] != null && textos[nota.id] !== nota.texto;
                          return (
                            <div key={nota.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, color: activa ? colors.ink : colors.muted, lineHeight: 1.4 }}>
                              <input type="checkbox" checked={activa} onChange={() => alternarNota(nota.id)} style={{ marginTop: 3, flexShrink: 0 }} />
                              {editandoNota === nota.id ? (
                                <div style={{ flex: 1 }}>
                                  <textarea autoFocus value={textoDe(nota)} onChange={e => cambiarTexto(nota.id, e.target.value)} rows={3} style={{ ...campo, resize: "vertical", lineHeight: 1.45 }} />
                                  <div style={{ display: "flex", gap: 10, marginTop: 3 }}>
                                    <button onClick={() => setEditandoNota(null)} style={{ background: "none", border: "none", color: colors.ink, fontWeight: 600, fontSize: 11, cursor: "pointer", padding: 0, fontFamily: colors.font }}>Listo</button>
                                    {cambiada && <button onClick={() => restaurarTexto(nota.id)} style={{ background: "none", border: "none", color: colors.muted, fontSize: 11, cursor: "pointer", padding: 0, fontFamily: colors.font }}>Volver al texto original</button>}
                                  </div>
                                </div>
                              ) : (
                                <span style={{ flex: 1, cursor: "pointer" }} onClick={() => alternarNota(nota.id)}>
                                  {textoDe(nota)}{cambiada && <span style={{ color: colors.muted, fontStyle: "italic" }}> (editada)</span>}
                                </span>
                              )}
                              {editandoNota !== nota.id && (
                                <button onClick={() => setEditandoNota(nota.id)} title="Cambiar el texto"
                                  style={{ background: "none", border: "none", color: colors.muted, cursor: "pointer", padding: 2, display: "flex", flexShrink: 0 }}><Pencil size={12} /></button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: colors.inkSoft, marginBottom: 4 }}>De este presupuesto</div>
                    <textarea value={particulares} onChange={e => setParticulares(e.target.value)} rows={3}
                      placeholder="Plazo de esta obra, qué no incluye, acuerdos con el cliente… Una nota por línea."
                      style={{ ...campo, resize: "vertical", lineHeight: 1.5 }} />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <Vista presupuesto={presupuesto} capitulos={capitulos} items={items} formato={formato} plantilla={plantilla} logo={logo}
          empresa={empresa} titulo={titulo} validez={validez} conIva={conIva} notas={notas} firma={firma} aceptacion={aceptacion} membrete={membrete} />
      </div>

      {error && <div style={{ background: colors.warningSoft, border: `1px solid ${colors.warningBorder}`, borderRadius: colors.radiusMd, padding: 10, fontSize: 12, color: colors.warning, marginTop: 12 }}>{error}</div>}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: colors.muted, marginRight: "auto" }}>
          {formato === "cotizar" ? "En el Excel el contratista llena los precios y los totales salen solos." : "El Excel lleva la misma plantilla, con las cuentas en fórmulas."}
        </span>
        <Button variant="outline" onClick={bajarExcel} disabled={!items.length || !!generando}>
          {generando === "excel" ? <Loader2 size={14} /> : <FileSpreadsheet size={14} />} {generando === "excel" ? "Armando…" : "Descargar Excel"}
        </Button>
        <Button variant="primary" onClick={bajarPDF} disabled={!items.length || !!generando} style={{ background: colors.ink }}>
          {generando === "pdf" ? <Loader2 size={14} /> : <FileText size={14} />} {generando === "pdf" ? "Armando…" : "Descargar PDF"}
        </Button>
      </div>
    </Modal>
  );
}

/** Cómo va a salir la primera hoja, con los colores de la plantilla. */
function Vista({ presupuesto, capitulos, items, formato, plantilla, logo, empresa, titulo, validez, conIva, notas, firma, aceptacion, membrete = [] }) {
  const lineasMembrete = membrete.map(x => String(x || "").trim()).filter(Boolean);
  const t = PLANTILLAS[plantilla] || PLANTILLAS.clasica;
  const caps = estructura({ capitulos, items });
  const tot = totalesDe(items, presupuesto, conIva);
  const { base, version } = versionDe(presupuesto.nombre);
  const conPrecio = formato !== "cotizar";
  const serif = "Georgia, 'Times New Roman', serif";
  const fTitulo = t.fuenteTitulo === "times" ? serif : "Helvetica, Arial, sans-serif";
  const filas = [];
  caps.slice(0, 2).forEach(c => {
    if (formato === "capitulos") { filas.push({ cap: false, n: c.numero, d: c.nombre, t: money(c.subtotal) }); return; }
    filas.push({ cap: true, n: c.numero, d: c.nombre.toUpperCase(), t: conPrecio ? money(c.subtotal) : "" });
    c.rubros.slice(0, 3).forEach(r => filas.push({ cap: false, n: r.numero, d: r.descripcion, u: r.unidad, c: r.cantidad, pu: conPrecio ? money(r.precio_unitario) : "", t: conPrecio ? money(r.total) : "" }));
  });
  const celda = { padding: "3px 4px", borderBottom: `1px solid ${rgb(t.linea)}`, fontSize: 7, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
  const cab = { ...celda, background: t.cabeceraFondo ? rgb(t.cabeceraFondo) : "transparent", color: rgb(t.cabeceraTexto), fontWeight: 700,
    borderTop: t.cabeceraFondo ? "none" : `1px solid ${rgb(t.primario)}`, borderBottom: t.cabeceraFondo ? "none" : `1px solid ${rgb(t.primario)}` };
  const tituloTxt = titulo || FORMATOS[formato].titulo;
  const fecha = `${empresa.ciudad ? empresa.ciudad.split(",")[0] + ", " : ""}${new Date().toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" })}`;

  return (
    <div style={{ background: colors.neutralSoft, borderRadius: colors.radiusMd, padding: 12, minWidth: 0, alignSelf: "start", position: "sticky", top: 0 }}>
      <div style={{ fontSize: 10, color: colors.muted, fontWeight: 600, letterSpacing: 0.4, marginBottom: 8 }}>ASÍ VA A SALIR · {t.label.toUpperCase()}</div>
      <div style={{ background: "#fff", boxShadow: "0 2px 10px rgba(0,0,0,0.08)", borderRadius: 2, padding: "16px 16px 12px", fontFamily: "Helvetica, Arial, sans-serif", color: rgb(t.texto), minHeight: 420 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          {logo ? <img src={logo.url} alt="" style={{ maxWidth: 92, maxHeight: 32, objectFit: "contain" }} /> : <div style={{ height: 20 }} />}
          {lineasMembrete.length > 0 && (
            <div style={{ marginLeft: "auto", textAlign: "right" }}>
              <div style={{ fontSize: 8.5, fontWeight: 700, fontFamily: fTitulo, color: rgb(t.primario) }}>{lineasMembrete[0]}</div>
              {lineasMembrete.slice(1).map((l, i) => <div key={i} style={{ fontSize: 6, color: rgb(t.gris) }}>{l}</div>)}
            </div>
          )}
        </div>

        {t.encabezado === "doble" && (
          <>
            <div style={{ borderTop: `2px solid ${rgb(t.primario)}`, borderBottom: `0.5px solid ${rgb(t.primario)}`, height: 2, margin: "8px 0 10px" }} />
            <div style={{ textAlign: "center", fontFamily: serif, fontWeight: 700, fontSize: 9.5, letterSpacing: 1.5 }}>{tituloTxt.toUpperCase()}</div>
            <div style={{ textAlign: "center", fontFamily: serif, fontStyle: "italic", fontSize: 7, color: rgb(t.gris), marginBottom: 8 }}>{fecha}</div>
          </>
        )}
        {t.encabezado === "banda" && (
          <div style={{ background: rgb(t.primario), color: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", margin: "10px 0" }}>
            <span style={{ fontWeight: 700, fontSize: 8, letterSpacing: 1 }}>{tituloTxt.toUpperCase()}</span><span style={{ fontSize: 6.5 }}>{fecha}</span>
          </div>
        )}
        {t.encabezado === "limpio" && (
          <div style={{ margin: "14px 0 8px" }}>
            <div style={{ fontSize: 12, color: rgb(t.primario) }}>{tituloTxt}</div>
            <div style={{ fontSize: 7, color: rgb(t.gris) }}>{fecha}</div>
          </div>
        )}
        {t.encabezado === "acento" && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", margin: "14px 0 8px" }}>
            <div>
              <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 9.5, letterSpacing: 1.5, color: rgb(t.primario) }}>{tituloTxt.toUpperCase()}</div>
              <div style={{ width: 36, borderTop: `1.5px solid ${rgb(t.acento)}`, marginTop: 3 }} />
            </div>
            <span style={{ fontSize: 6.5, color: rgb(t.gris) }}>{fecha}</span>
          </div>
        )}

        <div style={{ fontSize: 7, lineHeight: 1.7, marginBottom: 8, border: t.encabezado === "doble" ? `0.5px solid ${rgb(t.linea)}` : "none", padding: t.encabezado === "doble" ? "3px 8px" : 0 }}>
          <div><span style={{ color: rgb(t.gris), display: "inline-block", width: 76 }}>Proyecto</span><b>{base}</b></div>
          {conPrecio && <div><span style={{ color: rgb(t.gris), display: "inline-block", width: 76 }}>Cliente</span><b>{presupuesto.cliente_nombre}</b></div>}
          <div><span style={{ color: rgb(t.gris), display: "inline-block", width: 76 }}>Versión</span><b>{version}</b></div>
          {conPrecio && validez && <div><span style={{ color: rgb(t.gris), display: "inline-block", width: 76 }}>Validez de la oferta</span><b>{validez}</b></div>}
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <thead>
            <tr>
              <th style={{ ...cab, width: 22, textAlign: "left" }}>N°</th>
              <th style={{ ...cab, textAlign: "left" }}>{formato === "capitulos" ? "Capítulo" : "Descripción"}</th>
              {formato !== "capitulos" && <th style={{ ...cab, width: 24 }}>Und</th>}
              {formato !== "capitulos" && <th style={{ ...cab, width: 30, textAlign: "right" }}>Cant</th>}
              {formato !== "capitulos" && <th style={{ ...cab, width: 40, textAlign: "right" }}>P.U.</th>}
              <th style={{ ...cab, width: 48, textAlign: "right" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => {
              const est = f.cap ? { background: t.capFondo ? rgb(t.capFondo) : "transparent", color: rgb(t.capTexto), fontWeight: 700, borderTop: t.capFondo ? undefined : `1px solid ${rgb(t.primario)}` } : null;
              return (
                <tr key={i} style={est}>
                  <td style={celda}>{f.n}</td>
                  <td style={celda}>{f.d}</td>
                  {formato !== "capitulos" && <td style={{ ...celda, textAlign: "center" }}>{f.u || ""}</td>}
                  {formato !== "capitulos" && <td style={{ ...celda, textAlign: "right" }}>{f.c ?? ""}</td>}
                  {formato !== "capitulos" && <td style={{ ...celda, textAlign: "right" }}>{f.pu || ""}</td>}
                  <td style={{ ...celda, textAlign: "right" }}>{f.t}</td>
                </tr>
              );
            })}
            <tr><td colSpan={6} style={{ ...celda, color: rgb(t.gris), textAlign: "center" }}>…</td></tr>
          </tbody>
        </table>

        {conPrecio && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
            <div style={{ fontSize: 8, fontWeight: 700, padding: "4px 8px", minWidth: 120, textAlign: "right",
              background: t.totalFondo ? rgb(t.totalFondo) : "transparent", color: rgb(t.totalTexto), borderTop: t.totalFondo ? "none" : `1px solid ${rgb(t.primario)}` }}>
              TOTAL $ {money(tot.total)}{!conIva && <span style={{ fontWeight: 400, fontStyle: "italic" }}> · sin IVA</span>}
            </div>
          </div>
        )}

        {notas.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontFamily: fTitulo, fontWeight: 700, fontSize: 7.5, letterSpacing: 1, color: rgb(t.acento), marginBottom: 3 }}>NOTAS Y CONDICIONES</div>
            {notas.slice(0, 3).map((x, i) => <div key={i} style={{ fontSize: 6.5, lineHeight: 1.4, display: "flex", gap: 4 }}><span style={{ color: rgb(t.gris) }}>{i + 1}.</span><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x}</span></div>)}
            {notas.length > 3 && <div style={{ fontSize: 6.5, color: rgb(t.gris) }}>… y {notas.length - 3} más</div>}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18, gap: 12 }}>
          <div style={{ width: "44%" }}>
            <div style={{ borderTop: `0.5px solid ${rgb(t.gris)}`, paddingTop: 2, fontSize: 7, fontWeight: 700 }}>{(firma.nombre || "").trim() || "Nombre de quien firma"}</div>
            {(firma.cargo || "").trim() && <div style={{ fontSize: 6.5, color: rgb(t.gris) }}>{firma.cargo}</div>}
          </div>
          {aceptacion && conPrecio && (
            <div style={{ width: "44%" }}>
              <div style={{ borderTop: `0.5px solid ${rgb(t.gris)}`, paddingTop: 2, fontSize: 7, fontWeight: 700 }}>{presupuesto.cliente_nombre || "Cliente"}</div>
              <div style={{ fontSize: 6.5, color: rgb(t.gris) }}>Aceptación del cliente</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
