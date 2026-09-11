import { useState, useRef } from "react";
import { Upload, Sparkles, Trash2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";

const n = v => Number(v) || 0;
const fmt = v => n(v).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Replicar fiel ≠ alimentar la base de precios.
// Acá NOVA copia el presupuesto tal cual viene: mismos capítulos, mismos
// rubros, en el mismo orden, para usarlo como línea base de una obra.
const PROMPT = `Replica este presupuesto de construcción TAL CUAL, sin resumir ni reagrupar.
Devuelve SOLO JSON compacto, sin markdown:
{"nombre":"","cliente":"","rubros":[{"c":"CAPITULO","d":"descripcion","u":"unidad","q":0,"p":0,"t":0}]}
Reglas:
- Un objeto por rubro, en el MISMO ORDEN del documento.
- "c" = el capítulo/sección al que pertenece ese rubro (repite el nombre en cada rubro).
- Las filas de encabezado de capítulo y las de subtotal NO son rubros: no las incluyas.
- "q" cantidad, "p" precio unitario, "t" total de la fila. Si falta "t", omítelo.
- No inventes rubros ni cambies descripciones.`;

export default function ImportarPresupuesto({ currentUser, onVolver, onCreado }) {
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState("");
  const [rubros, setRubros] = useState([]);
  const [nombre, setNombre] = useState("");
  const [cliente, setCliente] = useState("");
  const [ivaPct, setIvaPct] = useState(15);
  const [guardando, setGuardando] = useState(false);
  const fileRef = useRef(null);

  async function leer(e) {
    const file = e.target.files[0];
    if (!file) return;
    setLeyendo(true); setError(""); setRubros([]);
    try {
      let contenido;
      const esImagen = file.type.startsWith("image/");
      const esPDF = file.type === "application/pdf";
      const esExcel = /\.(xlsx|xls|csv)$/i.test(file.name);

      if (esImagen || esPDF) {
        const b64 = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result.split(",")[1]); r.readAsDataURL(file); });
        contenido = [
          esPDF ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
                : { type: "image", source: { type: "base64", media_type: file.type, data: b64 } },
          { type: "text", text: PROMPT },
        ];
      } else if (esExcel) {
        const XLSX = await import("https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs");
        const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const csv = wb.SheetNames.map(s => `--- HOJA: ${s} ---\n` + XLSX.utils.sheet_to_csv(wb.Sheets[s])).join("\n").slice(0, 60000);
        contenido = [{ type: "text", text: `Presupuesto en Excel:\n\n${csv}\n\n${PROMPT}` }];
      } else {
        const txt = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsText(file); });
        contenido = [{ type: "text", text: `Presupuesto:\n\n${txt.slice(0, 40000)}\n\n${PROMPT}` }];
      }

      const res = await fetch("/api/nova", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 16000, messages: [{ role: "user", content: contenido }] }),
      });
      const data = await res.json();
      const parsed = parseJSONTolerante(data.content?.[0]?.text || "");

      if (!parsed?.rubros?.length) {
        setError("NOVA no pudo leer el presupuesto. Si es muy grande, prueba subirlo por capítulos.");
        setLeyendo(false); e.target.value = ""; return;
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
      setError("Error leyendo el archivo: " + err.message);
    }
    setLeyendo(false);
    e.target.value = "";
  }

  async function guardar() {
    if (!rubros.length || !nombre.trim()) return;
    setGuardando(true); setError("");

    let clienteId = null;
    if (cliente.trim()) {
      const { data: existente } = await supabase.from("clientes").select("id").eq("nombre", cliente.trim()).maybeSingle();
      if (existente) clienteId = existente.id;
      else {
        const { data } = await supabase.from("clientes").insert({ nombre: cliente.trim() }).select().single();
        clienteId = data?.id || null;
      }
    }

    const subtotal = rubros.reduce((s, r) => s + r.total, 0);
    const { data: pres, error: e1 } = await supabase.from("presupuestos").insert({
      nombre: nombre.trim(), cliente_id: clienteId, cliente_nombre: cliente.trim() || null,
      honorarios_pct: 0, iva_pct: n(ivaPct), notas: "Importado con NOVA",
      created_by: currentUser.id, subtotal, honorarios_monto: 0,
      iva_monto: subtotal * n(ivaPct) / 100, total: subtotal * (1 + n(ivaPct) / 100), estado: "borrador",
    }).select().single();

    if (e1 || !pres) { setError("No se pudo crear el presupuesto: " + (e1?.message || "")); setGuardando(false); return; }

    // orden = capOrden*1000 + índice, la convención que ya usa el módulo
    const ordenCap = {}; let capN = 0; const idxCap = {};
    const filas = rubros.map(r => {
      if (!(r.capitulo in ordenCap)) ordenCap[r.capitulo] = ++capN;
      const c = ordenCap[r.capitulo];
      idxCap[c] = (idxCap[c] || 0) + 1;
      return {
        presupuesto_id: pres.id, capitulo: r.capitulo, descripcion: r.descripcion,
        unidad: r.unidad, cantidad: r.cantidad, precio_unitario: r.precio_unitario,
        total: Math.round(r.total * 100) / 100, orden: c * 1000 + idxCap[c],
      };
    });

    for (let i = 0; i < filas.length; i += 50) {
      const { error: e2 } = await supabase.from("presupuesto_items").insert(filas.slice(i, i + 50));
      if (e2) { setError("Fallaron algunos rubros: " + e2.message); setGuardando(false); return; }
    }

    setGuardando(false);
    onCreado(pres);
  }

  const capitulos = [...new Set(rubros.map(r => r.capitulo))];
  const total = rubros.reduce((s, r) => s + r.total, 0);
  const lbl = { fontSize: 11, color: colors.muted, display: "block", marginBottom: 4 };

  return (
    <div style={{ fontFamily: colors.font }}>
      <div style={{ fontSize: 12, color: colors.inkSoft, marginBottom: 14 }}>
        NOVA replica el presupuesto tal cual: mismos capítulos, mismos rubros, mismo orden. Sirve para usarlo como línea base de una obra.
        Esto es distinto de <strong>Alimentar BD</strong>, que extrae precios de presupuestos viejos para la base de rubros.
      </div>

      {rubros.length === 0 && (
        <div style={{ background: colors.brandSoft, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 20, textAlign: "center" }}>
          <Sparkles size={22} color={colors.brand} style={{ marginBottom: 8 }} />
          <div style={{ fontSize: 13, color: colors.brand, marginBottom: 12 }}>
            {leyendo ? "NOVA está leyendo el presupuesto..." : "Sube el presupuesto en Excel, PDF, CSV o foto."}
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
            <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 90px", gap: 10, marginBottom: 12 }}>
              <div><label style={lbl}>NOMBRE DEL PRESUPUESTO</label><input value={nombre} onChange={e => setNombre(e.target.value)} style={inputStyle} /></div>
              <div><label style={lbl}>CLIENTE</label><input value={cliente} onChange={e => setCliente(e.target.value)} style={inputStyle} placeholder="Opcional" /></div>
              <div><label style={lbl}>IVA %</label><input type="number" value={ivaPct} onChange={e => setIvaPct(e.target.value)} style={inputStyle} /></div>
            </div>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap", fontSize: 12, color: colors.inkSoft }}>
              <span><strong>{rubros.length}</strong> rubros</span>
              <span><strong>{capitulos.length}</strong> capítulos</span>
              <span>Subtotal: <strong>${fmt(total)}</strong></span>
              <span>Con IVA: <strong>${fmt(total * (1 + n(ivaPct) / 100))}</strong></span>
            </div>
          </div>

          <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, maxHeight: 420, overflowY: "auto", marginBottom: 14 }}>
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
            <Button variant="primary" size="lg" style={{ flex: 2 }} onClick={guardar} disabled={guardando || !nombre.trim()}>
              {guardando ? "Guardando..." : `Crear presupuesto con ${rubros.length} rubros`}
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
  // JSON truncado: cerrar llaves/corchetes abiertos
  try {
    const corte = t.lastIndexOf("}");
    let p = corte > 0 ? t.slice(0, corte + 1) : t;
    let llaves = 0, corchetes = 0;
    for (const c of p) { if (c === "{") llaves++; if (c === "}") llaves--; if (c === "[") corchetes++; if (c === "]") corchetes--; }
    p += "]".repeat(Math.max(corchetes, 0)) + "}".repeat(Math.max(llaves, 0));
    return JSON.parse(p);
  } catch { return null; }
}
