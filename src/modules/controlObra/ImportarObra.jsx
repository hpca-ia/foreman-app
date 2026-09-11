import { useState, useRef } from "react";
import { Upload, Sparkles, Trash2, ArrowLeft } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import { fmt } from "./calculos";

const n = v => Number(v) || 0;

// El presupuesto que se controla NO es el que se cotiza: puede ser el
// aprobado por el cliente, el del contratista, otro documento. Por eso
// esta importación crea la obra directamente, sin pasar por Presupuestos.
const PROMPT = `Replica este presupuesto de construcción TAL CUAL, sin resumir ni reagrupar.
Devuelve SOLO JSON compacto, sin markdown:
{"nombre":"","cliente":"","rubros":[{"c":"CAPITULO","d":"descripcion","u":"unidad","q":0,"p":0,"t":0}]}
Reglas:
- Un objeto por rubro, en el MISMO ORDEN del documento.
- "c" = el capítulo/sección al que pertenece ese rubro (repite el nombre en cada rubro).
- Las filas de encabezado de capítulo y las de subtotal NO son rubros: no las incluyas.
- "q" cantidad, "p" precio unitario, "t" total de la fila. Si falta "t", omítelo.
- No inventes rubros ni cambies descripciones.`;

export default function ImportarObra({ currentUser, onVolver, onCreada }) {
  const [leyendo, setLeyendo] = useState(false);
  const [paso, setPaso] = useState("");
  const [omitidas, setOmitidas] = useState([]);
  const [error, setError] = useState("");
  const [rubros, setRubros] = useState([]);
  const [nombre, setNombre] = useState("");
  const [cliente, setCliente] = useState("");
  const [yaIncluyeIva, setYaIncluyeIva] = useState(true);
  const [ivaPct, setIvaPct] = useState(15);
  const [guardando, setGuardando] = useState(false);
  const fileRef = useRef(null);

  // Un Excel ya trae los datos en columnas: pedirle a NOVA que transcriba
  // rubro por rubro tardaba tres minutos y arriesgaba truncarse. Ahora NOVA
  // solo dice qué columna es cuál —unos segundos— y el resto lo recorre JS,
  // que además no se equivoca copiando números.
  const MAPA_PROMPT = `Estas son las primeras filas de un presupuesto de construcción en Excel.
Identifica la estructura. Devuelve SOLO JSON, sin markdown:
{"fila_encabezado":0,"col_descripcion":0,"col_unidad":0,"col_cantidad":0,"col_precio":0,"col_total":0,"col_capitulo":null,"nombre":"","cliente":""}
Las columnas son índices desde 0 según el orden en que aparecen, contando las vacías.
"col_total" es la columna del importe de cada rubro. Si el capítulo está en su propia
columna usa "col_capitulo"; si en cambio va como fila de título, deja null.
"fila_encabezado" es el índice de la fila con los títulos de columna.
Si una columna no existe, ponla en null.`;

  async function nova(body, señal) {
    const res = await fetch("/api/nova", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: señal,
    });
    if (!res.ok) throw new Error(`El servidor respondió ${res.status}`);
    return res.json();
  }

  function filasDeExcel(XLSX, wb) {
    const hoja = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(hoja, { header: 1, blankrows: false, defval: "" });
  }

  // Recorre las filas aplicando el mapa. Una fila es rubro si tiene descripción
  // y algún número; si tiene descripción pero ningún número, es título de capítulo.
  function extraerConMapa(filas, m) {
    const val = (f, c) => (c == null ? "" : (f[c] ?? ""));
    const num = v => {
      if (typeof v === "number") return v;
      const t = String(v).replace(/[^0-9,.-]/g, "").replace(/\.(?=.*\.)/g, "").replace(",", ".");
      return Number(t) || 0;
    };
    const rubros = [];
    const omitidas = [];
    let capitulo = "SIN CAPÍTULO";
    for (let i = (m.fila_encabezado ?? 0) + 1; i < filas.length; i++) {
      const f = filas[i];
      const desc = String(val(f, m.col_descripcion)).trim();
      if (!desc) continue;
      const cant = num(val(f, m.col_cantidad));
      const precio = num(val(f, m.col_precio));
      const total = num(val(f, m.col_total));
      if (m.col_capitulo != null) {
        const c = String(val(f, m.col_capitulo)).trim();
        if (c) capitulo = c.toUpperCase();
      }
      if (/^(subtotal|total|suma|iva|honorarios)\b/i.test(desc)) continue;
      // Un rubro siempre tiene cantidad y precio unitario. La fila de capítulo
      // no los tiene aunque sí traiga un número: ese número es su subtotal, y
      // contarlo como rubro duplicaría la plata del presupuesto.
      if (!cant || !precio) {
        // Con monto es el subtotal de un capítulo; sin monto es una línea de
        // detalle —el despiece de ventanas, por ejemplo— que como rubro solo
        // sería un $0 que nunca avanza.
        if (total) { if (m.col_capitulo == null && desc.length < 90) capitulo = desc.toUpperCase(); }
        else omitidas.push(desc);
        continue;
      }
      rubros.push({
        capitulo, descripcion: desc,
        unidad: String(val(f, m.col_unidad)).trim(),
        cantidad: cant, precio_unitario: precio,
        total: total || cant * precio,
      });
    }
    return { rubros, omitidas };
  }

  async function leer(e) {
    const file = e.target.files[0];
    if (!file) return;
    setLeyendo(true); setError(""); setRubros([]); setOmitidas([]); setPaso("Abriendo el archivo...");
    const ctrl = new AbortController();
    const reloj = setTimeout(() => ctrl.abort(), 5 * 60 * 1000);
    try {
      const esImagen = file.type.startsWith("image/");
      const esPDF = file.type === "application/pdf";
      const esExcel = /\.(xlsx|xls|csv)$/i.test(file.name);

      let csvExcel = null;

      // ── Camino rápido: Excel ──
      if (esExcel) {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const filas = filasDeExcel(XLSX, wb);
        csvExcel = wb.SheetNames.map(h => `--- HOJA: ${h} ---\n` + XLSX.utils.sheet_to_csv(wb.Sheets[h])).join("\n").slice(0, 60000);
        setPaso("NOVA está reconociendo las columnas...");
        const muestra = filas.slice(0, 40)
          .map((f, i) => `${i}: ` + f.map(c => String(c ?? "").slice(0, 30)).join(" | ")).join("\n");
        const data = await nova({
          model: "claude-sonnet-4-5", max_tokens: 1000,
          messages: [{ role: "user", content: [{ type: "text", text: `${muestra}\n\n${MAPA_PROMPT}` }] }],
        }, ctrl.signal);
        const mapa = parseJSONTolerante(data.content?.[0]?.text || "");
        const { rubros: extraidos, omitidas } = mapa ? extraerConMapa(filas, mapa) : { rubros: [], omitidas: [] };
        if (extraidos.length >= 3) {
          setPaso("");
          setRubros(extraidos);
          setOmitidas(omitidas);
          setNombre(mapa.nombre || file.name.replace(/\.[^.]+$/, ""));
          setCliente(mapa.cliente || "");
          setLeyendo(false); clearTimeout(reloj); e.target.value = "";
          return;
        }
        setPaso("El formato no es el habitual. NOVA lo va a leer entero, puede tardar un par de minutos...");
      }

      // ── Camino lento: NOVA transcribe (PDF, imagen, o Excel raro) ──
      let contenido;
      if (esImagen || esPDF) {
        setPaso("NOVA está leyendo el documento, puede tardar un par de minutos...");
        const b64 = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result.split(",")[1]); r.readAsDataURL(file); });
        contenido = [
          esPDF ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
                : { type: "image", source: { type: "base64", media_type: file.type, data: b64 } },
          { type: "text", text: PROMPT },
        ];
      } else {
        const txt = csvExcel ?? (await file.text()).slice(0, 60000);
        contenido = [{ type: "text", text: `Presupuesto:\n\n${txt}\n\n${PROMPT}` }];
      }

      const data = await nova({ model: "claude-sonnet-4-5", max_tokens: 16000, messages: [{ role: "user", content: contenido }] }, ctrl.signal);
      const parsed = parseJSONTolerante(data.content?.[0]?.text || "");

      if (!parsed?.rubros?.length) {
        setError("NOVA no pudo leer el presupuesto. Si es muy grande, prueba subirlo por capítulos.");
        setLeyendo(false); setPaso(""); clearTimeout(reloj); e.target.value = ""; return;
      }

      setRubros(parsed.rubros.map(r => ({
        capitulo: (r.c || r.capitulo || "SIN CAPÍTULO").toString().trim().toUpperCase(),
        descripcion: (r.d || r.descripcion || "").toString().trim(),
        unidad: (r.u || r.unidad || "").toString().trim(),
        cantidad: n(r.q ?? r.cantidad),
        precio_unitario: n(r.p ?? r.precio_unitario),
        total: n(r.t ?? r.total) || n(r.q ?? r.cantidad) * n(r.p ?? r.precio_unitario),
      })).filter(r => r.descripcion));
      setNombre(parsed.nombre || file.name.replace(/\.[^.]+$/, ""));
      setCliente(parsed.cliente || "");
    } catch (err) {
      setError(err.name === "AbortError"
        ? "La lectura pasó de cinco minutos y se cortó. Prueba subir el presupuesto por capítulos, o en Excel en vez de PDF."
        : "Error leyendo el archivo: " + err.message);
    }
    clearTimeout(reloj);
    setLeyendo(false); setPaso("");
    e.target.value = "";
  }

  async function crearObra() {
    if (!rubros.length || !nombre.trim()) return;
    setGuardando(true); setError("");
    const factorIva = yaIncluyeIva ? 1 : 1 + n(ivaPct) / 100;

    const { data: obra, error: e1 } = await supabase.from("obras").insert({
      nombre: nombre.trim(), cliente_nombre: cliente.trim() || null,
      notas: "Presupuesto importado con NOVA", created_by: currentUser.id,
    }).select().single();

    if (e1 || !obra) { setError("No se pudo crear la obra: " + (e1?.message || "")); setGuardando(false); return; }

    const ordenCap = {}; let capN = 0; const idxCap = {};
    const filas = rubros.map((r, i) => {
      if (!(r.capitulo in ordenCap)) ordenCap[r.capitulo] = ++capN;
      const c = ordenCap[r.capitulo];
      idxCap[c] = (idxCap[c] || 0) + 1;
      return {
        obra_id: obra.id, numero: i + 1, capitulo: r.capitulo,
        capitulo_orden: c, orden: c * 1000 + idxCap[c],
        descripcion: r.descripcion, unidad: r.unidad,
        cantidad: r.cantidad, precio_unitario: r.precio_unitario,
        iva_pct: yaIncluyeIva ? 0 : n(ivaPct),
        total_base: Math.round(r.total * factorIva * 100) / 100,
      };
    });

    for (let i = 0; i < filas.length; i += 50) {
      const { error: e2 } = await supabase.from("obra_rubros").insert(filas.slice(i, i + 50));
      if (e2) { setError("Fallaron algunos rubros: " + e2.message); setGuardando(false); return; }
    }

    await supabase.from("planillas").insert({
      obra_id: obra.id, numero: 1, nombre: "Planilla N°1", fecha_desde: new Date().toISOString().split("T")[0],
    });

    setGuardando(false);
    onCreada(obra);
  }

  const capitulos = [...new Set(rubros.map(r => r.capitulo))];
  const subtotal = rubros.reduce((s, r) => s + r.total, 0);
  const lineaBase = subtotal * (yaIncluyeIva ? 1 : 1 + n(ivaPct) / 100);
  const lbl = { fontSize: 11, color: colors.muted, display: "block", marginBottom: 4 };

  return (
    <div style={{ fontFamily: colors.font }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <Button variant="secondary" size="sm" onClick={onVolver}><ArrowLeft size={13} /> Volver</Button>
        <div style={{ fontSize: 16, fontWeight: 700, color: colors.ink }}>Importar presupuesto de obra</div>
      </div>

      <div style={{ fontSize: 12, color: colors.inkSoft, marginBottom: 14 }}>
        Sube el presupuesto que vas a <strong>ejecutar y controlar</strong> — el aprobado por el cliente, el del contratista, el que sea. NOVA lo replica tal cual y se convierte en la línea base de la obra.
      </div>

      {rubros.length === 0 && (
        <div style={{ background: colors.brandSoft, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 20, textAlign: "center" }}>
          <Sparkles size={22} color={colors.brand} style={{ marginBottom: 8 }} />
          <div style={{ fontSize: 13, color: colors.brand, marginBottom: 12 }}>
            {leyendo ? (paso || "NOVA está leyendo el presupuesto...") : "Sube el presupuesto en Excel, PDF, CSV o foto. El Excel se lee en segundos; PDF y fotos tardan más."}
          </div>
          <Button variant="primary" onClick={() => fileRef.current?.click()} disabled={leyendo}>
            <Upload size={13} /> {leyendo ? "Leyendo..." : "Subir presupuesto"}
          </Button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.pdf,image/*,.txt" onChange={leer} style={{ display: "none" }} />
        </div>
      )}

      {error && <div style={{ color: colors.danger, fontSize: 12, marginTop: 10 }}>{error}</div>}

      {rubros.length > 0 && (
        <>
          <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 16, marginBottom: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr", gap: 10, marginBottom: 12 }}>
              <div><label style={lbl}>NOMBRE DE LA OBRA</label><input value={nombre} onChange={e => setNombre(e.target.value)} style={inputStyle} /></div>
              <div><label style={lbl}>CLIENTE</label><input value={cliente} onChange={e => setCliente(e.target.value)} style={inputStyle} placeholder="Opcional" /></div>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, cursor: "pointer" }}>
              <input type="checkbox" checked={yaIncluyeIva} onChange={e => setYaIncluyeIva(e.target.checked)} style={{ cursor: "pointer" }} />
              <span style={{ fontSize: 12, color: colors.inkSoft }}>Los totales del archivo <strong>ya incluyen IVA</strong></span>
            </label>
            {!yaIncluyeIva && (
              <div style={{ marginBottom: 10, maxWidth: 140 }}>
                <label style={lbl}>IVA % A APLICAR</label>
                <input type="number" value={ivaPct} onChange={e => setIvaPct(e.target.value)} style={inputStyle} />
              </div>
            )}

            <div style={{ display: "flex", gap: 20, flexWrap: "wrap", fontSize: 12, color: colors.inkSoft }}>
              <span><strong>{rubros.length}</strong> rubros</span>
              <span><strong>{capitulos.length}</strong> capítulos</span>
              <span>Línea base: <strong>${fmt(lineaBase)}</strong></span>
            </div>

            {omitidas.length > 0 && (
              <div style={{ marginTop: 10, fontSize: 11, color: colors.inkSoft, background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: colors.radiusSm, padding: "8px 10px" }}>
                <strong>{omitidas.length} filas</strong> del Excel no entraron porque no tienen cantidad ni precio — son líneas de detalle sin monto, como el despiece de ventanas. No cambian el total.
                <div style={{ color: colors.muted, marginTop: 3 }}>
                  Por ejemplo: {omitidas.slice(0, 2).map(d => d.slice(0, 40)).join(" · ")}
                </div>
              </div>
            )}
          </div>

          <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, maxHeight: 400, overflowY: "auto", marginBottom: 14 }}>
            {capitulos.map(cap => (
              <div key={cap}>
                <div style={{ background: colors.brandSoft, padding: "7px 14px", fontSize: 11, fontWeight: 700, color: colors.brand, position: "sticky", top: 0 }}>
                  {cap} <span style={{ fontWeight: 400, opacity: .7 }}>({rubros.filter(r => r.capitulo === cap).length})</span>
                </div>
                {rubros.map((r, i) => r.capitulo !== cap ? null : (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 50px 70px 90px 90px 30px", gap: 8, padding: "6px 14px", borderBottom: `1px solid ${colors.neutralSoft}`, fontSize: 12, alignItems: "center" }}>
                    <span style={{ color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.descripcion}>{r.descripcion}</span>
                    <span style={{ color: colors.muted, fontSize: 11 }}>{r.unidad}</span>
                    <span style={{ color: colors.muted, textAlign: "right" }}>{fmt(r.cantidad)}</span>
                    <span style={{ color: colors.inkSoft, textAlign: "right" }}>${fmt(r.precio_unitario)}</span>
                    <span style={{ color: colors.ink, textAlign: "right", fontWeight: 600 }}>${fmt(r.total)}</span>
                    <button onClick={() => setRubros(rs => rs.filter((_, j) => j !== i))}
                      style={{ background: "none", border: "none", color: colors.muted, cursor: "pointer", display: "flex" }}><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="outline" style={{ flex: 1 }} onClick={() => { setRubros([]); setError(""); }}>Descartar</Button>
            <Button variant="primary" size="lg" style={{ flex: 2 }} onClick={crearObra} disabled={guardando || !nombre.trim()}>
              {guardando ? "Creando obra..." : `Crear obra con ${rubros.length} rubros`}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function parseJSONTolerante(raw) {
  let t = raw.replace(/```json|```/g, "").trim();
  try { return JSON.parse(t); } catch {}
  const start = t.indexOf("{");
  if (start < 0) return null;
  t = t.slice(start);
  try { return JSON.parse(t); } catch {}
  try {
    const corte = t.lastIndexOf("}");
    let p = corte > 0 ? t.slice(0, corte + 1) : t;
    let llaves = 0, corchetes = 0;
    for (const c of p) { if (c === "{") llaves++; if (c === "}") llaves--; if (c === "[") corchetes++; if (c === "]") corchetes--; }
    p += "]".repeat(Math.max(corchetes, 0)) + "}".repeat(Math.max(llaves, 0));
    return JSON.parse(p);
  } catch { return null; }
}
