import { useState, useRef } from "react";
import { Upload, Trash2, Plus, Sparkles } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import { fmt, TIPOS_GASTO } from "./calculos";
import { buscarDuplicados, hashArchivo } from "./duplicados";
import AlertaDuplicado from "./AlertaDuplicado";

const hoy = () => new Date().toISOString().split("T")[0];
const n = v => Number(v) || 0;

export default function ModalFactura({ obra, rubros, planilla, factura, asignacionesFactura = [], currentUser, onCerrar, onGuardado }) {
  const editando = !!factura;
  const [form, setForm] = useState(factura ? { ...factura } : {
    fecha: hoy(), tipo_documento: "FACTURA", numero_factura: "", ruc: "", razon_social: "",
    detalle: "", justificacion: "", numero_cheque: "", tipo: "material",
    subtotal_0: 0, subtotal_5: 0, subtotal_15: 0, iva: 0, total: 0,
  });
  const [repartos, setRepartos] = useState(
    asignacionesFactura.length ? asignacionesFactura.map(a => ({ obra_rubro_id: a.obra_rubro_id, monto: a.monto })) : []
  );
  const [archivo, setArchivo] = useState(null);
  const [leyendo, setLeyendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [dups, setDups] = useState({ exactos: [], posibles: [] });
  const [justificacion, setJustificacion] = useState("");
  const [revisandoDups, setRevisandoDups] = useState(false);
  const [archivoHash, setArchivoHash] = useState(null);
  const fileRef = useRef(null);

  // La detección corre sobre los datos ya cargados, no sobre el criterio de NOVA.
  async function revisarDuplicados(extra = {}) {
    const datos = { ...form, ...extra };
    if (!datos.numero_factura && !datos.razon_social && !archivoHash) { setDups({ exactos: [], posibles: [] }); return; }
    setRevisandoDups(true);
    const r = await buscarDuplicados({
      obraId: obra.id, ruc: datos.ruc, numeroFactura: datos.numero_factura,
      razonSocial: datos.razon_social, monto: datos.total, fecha: datos.fecha,
      archivoHash, excluirId: factura?.id || null,
    });
    setDups(r);
    setRevisandoDups(false);
  }

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Recalcula total desde los subtotales + IVA
  function recalcTotal(next) {
    const f = { ...form, ...next };
    const total = n(f.subtotal_0) + n(f.subtotal_5) + n(f.subtotal_15) + n(f.iva);
    setForm({ ...f, total: Math.round(total * 100) / 100 });
  }

  async function leerConNova(e) {
    const file = e.target.files[0];
    if (!file) return;
    setArchivo(file);
    setLeyendo(true); setError("");
    const h = await hashArchivo(file); setArchivoHash(h);
    try {
      const b64 = await new Promise(res => {
        const r = new FileReader();
        r.onload = () => res(r.result.split(",")[1]);
        r.readAsDataURL(file);
      });
      const esPdf = file.type === "application/pdf";
      const listaRubros = rubros.slice(0, 220).map(r => `${r.id}:${r.descripcion.slice(0, 60)}`).join(" | ");

      const res = await fetch("/api/nova", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-5", max_tokens: 1200,
          system: `Eres NOVA. Lees facturas de construcción de Ecuador y devuelves SOLO JSON, sin markdown:
{"fecha":"YYYY-MM-DD","ruc":"","razon_social":"","numero_factura":"","numero_cheque":"","detalle":"","subtotal_0":0,"subtotal_5":0,"subtotal_15":0,"iva":0,"total":0,"tipo":"material|mano_obra|maquinaria|contrato|honorarios|otro","rubro_id":null}
subtotal_0/5/15 son las bases imponibles por tasa de IVA. Si no distingues la tasa, pon todo en subtotal_15.
rubro_id: el id del rubro más probable de esta lista, o null si no estás seguro. Rubros: ${listaRubros}`,
          messages: [{
            role: "user",
            content: [
              esPdf
                ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
                : { type: "image", source: { type: "base64", media_type: file.type || "image/jpeg", data: b64 } },
              { type: "text", text: "Extrae los datos de esta factura. Solo JSON." },
            ],
          }],
        }),
      });
      const data = await res.json();
      const txt = (data.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim();
      const p = JSON.parse(txt);
      setForm(f => ({
        ...f,
        fecha: p.fecha || f.fecha,
        ruc: p.ruc || f.ruc,
        razon_social: p.razon_social || f.razon_social,
        numero_factura: p.numero_factura || f.numero_factura,
        numero_cheque: p.numero_cheque || f.numero_cheque,
        detalle: p.detalle || f.detalle,
        subtotal_0: n(p.subtotal_0), subtotal_5: n(p.subtotal_5), subtotal_15: n(p.subtotal_15),
        iva: n(p.iva), total: n(p.total),
        tipo: p.tipo || f.tipo,
      }));
      if (p.rubro_id && rubros.some(r => r.id === p.rubro_id) && repartos.length === 0) {
        setRepartos([{ obra_rubro_id: p.rubro_id, monto: n(p.total) }]);
      }
      await revisarDuplicados({ ruc: p.ruc, numero_factura: p.numero_factura, razon_social: p.razon_social, total: n(p.total), fecha: p.fecha });
    } catch {
      setError("NOVA no pudo leer el archivo. Llena los datos a mano.");
    }
    setLeyendo(false);
    e.target.value = "";
  }

  function agregarReparto(rubroId) {
    if (repartos.some(r => r.obra_rubro_id === rubroId)) return;
    const restante = Math.max(n(form.total) - repartos.reduce((s, r) => s + n(r.monto), 0), 0);
    setRepartos([...repartos, { obra_rubro_id: rubroId, monto: restante }]);
    setBusqueda("");
  }

  const asignado = repartos.reduce((s, r) => s + n(r.monto), 0);
  const diferencia = Math.round((n(form.total) - asignado) * 100) / 100;

  async function guardar() {
    if (!form.total) { setError("Falta el total de la factura."); return; }
    if (dups.exactos.length && !justificacion.trim()) {
      setError("Esta factura ya está cargada. Explica por qué no es un duplicado para poder guardarla.");
      return;
    }
    setGuardando(true); setError("");

    let archivo_url = form.archivo_url || null, archivo_nombre = form.archivo_nombre || null;
    if (archivo) {
      const safe = archivo.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `obra-${obra.id}/${Date.now()}-${safe}`;
      const { error: upErr } = await supabase.storage.from("task-files").upload(path, archivo, { upsert: false, contentType: archivo.type || "application/octet-stream" });
      if (!upErr) {
        archivo_url = supabase.storage.from("task-files").getPublicUrl(path).data.publicUrl;
        archivo_nombre = archivo.name;
      }
    }

    const payload = {
      obra_id: obra.id,
      planilla_id: planilla?.id || null,
      fecha: form.fecha || hoy(),
      tipo_documento: form.tipo_documento || "FACTURA",
      numero_factura: form.numero_factura || null,
      ruc: form.ruc || null,
      razon_social: form.razon_social || null,
      detalle: form.detalle || null,
      justificacion: form.justificacion || null,
      numero_cheque: form.numero_cheque || null,
      subtotal_0: n(form.subtotal_0), subtotal_5: n(form.subtotal_5), subtotal_15: n(form.subtotal_15),
      iva: n(form.iva), total: n(form.total),
      tipo: form.tipo || "material",
      archivo_url, archivo_nombre,
      origen: archivo ? "nova" : (form.origen || "manual"),
      archivo_hash: archivoHash || form.archivo_hash || null,
      duplicado_de: dups.exactos[0]?.id || null,
      duplicado_justificacion: dups.exactos.length ? justificacion.trim() : null,
      subido_por: currentUser.id, subido_por_nombre: currentUser.name,
    };

    let facturaId = factura?.id;
    if (editando) {
      const { error: e1 } = await supabase.from("obra_facturas").update(payload).eq("id", factura.id);
      if (e1) { setError(e1.message); setGuardando(false); return; }
      await supabase.from("obra_factura_rubros").delete().eq("factura_id", factura.id);
    } else {
      const { data, error: e1 } = await supabase.from("obra_facturas").insert(payload).select().single();
      if (e1 || !data) { setError(e1?.message || "No se pudo guardar"); setGuardando(false); return; }
      facturaId = data.id;
    }

    const filas = repartos.filter(r => n(r.monto) !== 0).map(r => ({ factura_id: facturaId, obra_rubro_id: r.obra_rubro_id, monto: n(r.monto) }));
    if (filas.length) await supabase.from("obra_factura_rubros").insert(filas);

    setGuardando(false);
    onGuardado();
  }

  const coincidencias = busqueda.trim()
    ? rubros.filter(r => r.descripcion.toLowerCase().includes(busqueda.toLowerCase()) || String(r.numero) === busqueda.trim()).slice(0, 8)
    : [];

  const lbl = { fontSize: 10, color: colors.muted, fontWeight: 600, display: "block", marginBottom: 3 };
  const mini = { ...inputStyle, padding: "7px 9px", fontSize: 12 };

  return (
    <Modal onClose={onCerrar} maxWidth={640}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: colors.ink }}>{editando ? "Editar factura" : "Nueva factura"}</div>
        <button onClick={onCerrar} style={{ marginLeft: "auto", background: colors.neutralSoft, border: "none", borderRadius: 6, width: 28, height: 28, color: colors.inkSoft, cursor: "pointer", fontSize: 15 }}>×</button>
      </div>

      {!editando && (
        <div style={{ background: colors.brandSoft, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 12, marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
          <Sparkles size={16} color={colors.brand} />
          <div style={{ fontSize: 12, color: colors.brand, flex: 1 }}>
            {leyendo ? "NOVA está leyendo la factura..." : "Sube una foto o PDF y NOVA llena los datos."}
          </div>
          <Button variant="primary" size="sm" onClick={() => fileRef.current?.click()} disabled={leyendo}>
            <Upload size={12} /> {leyendo ? "Leyendo..." : "Leer con NOVA"}
          </Button>
          <input ref={fileRef} type="file" accept="image/*,.pdf" onChange={leerConNova} style={{ display: "none" }} />
        </div>
      )}

      <AlertaDuplicado exactos={dups.exactos} posibles={dups.posibles} justificacion={justificacion} setJustificacion={setJustificacion} />
      {revisandoDups && <div style={{ fontSize: 11, color: colors.muted, marginBottom: 8 }}>Revisando si ya está cargada...</div>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div><label style={lbl}>FECHA</label><input type="date" value={form.fecha || ""} onChange={e => set("fecha", e.target.value)} style={mini} /></div>
        <div><label style={lbl}>N° FACTURA</label><input value={form.numero_factura || ""} onChange={e => set("numero_factura", e.target.value)} onBlur={() => revisarDuplicados()} style={mini} /></div>
        <div><label style={lbl}>N° CHEQUE</label><input value={form.numero_cheque || ""} onChange={e => set("numero_cheque", e.target.value)} style={mini} /></div>
        <div><label style={lbl}>RUC</label><input value={form.ruc || ""} onChange={e => set("ruc", e.target.value)} style={mini} /></div>
        <div style={{ gridColumn: "span 2" }}><label style={lbl}>PROVEEDOR</label><input value={form.razon_social || ""} onChange={e => set("razon_social", e.target.value)} onBlur={() => revisarDuplicados()} style={mini} /></div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={lbl}>DETALLE</label>
        <input value={form.detalle || ""} onChange={e => set("detalle", e.target.value)} style={mini} placeholder="Qué se compró / contrató" />
      </div>
      <div style={{ marginBottom: 10 }}>
        <label style={lbl}>JUSTIFICACIÓN</label>
        <input value={form.justificacion || ""} onChange={e => set("justificacion", e.target.value)} style={mini} placeholder="Para qué se usó en la obra" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8, marginBottom: 10 }}>
        <div><label style={lbl}>BASE 0%</label><input type="number" value={form.subtotal_0 ?? 0} onChange={e => recalcTotal({ subtotal_0: e.target.value })} style={mini} /></div>
        <div><label style={lbl}>BASE 5%</label><input type="number" value={form.subtotal_5 ?? 0} onChange={e => recalcTotal({ subtotal_5: e.target.value })} style={mini} /></div>
        <div><label style={lbl}>BASE 15%</label><input type="number" value={form.subtotal_15 ?? 0} onChange={e => recalcTotal({ subtotal_15: e.target.value })} style={mini} /></div>
        <div><label style={lbl}>IVA</label><input type="number" value={form.iva ?? 0} onChange={e => recalcTotal({ iva: e.target.value })} style={mini} /></div>
        <div><label style={lbl}>TOTAL</label><input type="number" value={form.total ?? 0} onChange={e => set("total", e.target.value)} style={{ ...mini, fontWeight: 700 }} /></div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={lbl}>TIPO DE GASTO</label>
        <select value={form.tipo || "material"} onChange={e => set("tipo", e.target.value)} style={mini}>
          {TIPOS_GASTO.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>

      {/* Reparto entre rubros */}
      <div style={{ background: colors.bg, borderRadius: colors.radiusMd, padding: 12, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: colors.ink }}>Asignación a rubros</div>
          <div style={{ marginLeft: "auto", fontSize: 11, color: diferencia === 0 ? colors.success : colors.warning, fontWeight: 600 }}>
            {diferencia === 0 ? "Cuadrado" : `Faltan $${fmt(diferencia)}`}
          </div>
        </div>

        {repartos.map((r, i) => {
          const rubro = rubros.find(x => x.id === r.obra_rubro_id);
          return (
            <div key={r.obra_rubro_id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <div style={{ flex: 1, fontSize: 12, color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <span style={{ color: colors.muted, marginRight: 5 }}>{rubro?.numero}</span>{rubro?.descripcion || "Rubro"}
              </div>
              <input type="number" value={r.monto} onChange={e => setRepartos(rs => rs.map((x, j) => j === i ? { ...x, monto: e.target.value } : x))}
                style={{ ...mini, width: 110, textAlign: "right" }} />
              <button onClick={() => setRepartos(rs => rs.filter((_, j) => j !== i))}
                style={{ background: colors.dangerSoft, border: "none", borderRadius: 6, padding: "6px 8px", color: colors.danger, cursor: "pointer", display: "flex" }}>
                <Trash2 size={12} />
              </button>
            </div>
          );
        })}

        <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar rubro para asignar..." style={{ ...mini, marginTop: 6 }} />
        {coincidencias.length > 0 && (
          <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusSm, marginTop: 4, maxHeight: 160, overflowY: "auto" }}>
            {coincidencias.map(r => (
              <div key={r.id} onClick={() => agregarReparto(r.id)}
                style={{ padding: "7px 10px", fontSize: 12, cursor: "pointer", borderBottom: `1px solid ${colors.neutralSoft}`, display: "flex", gap: 8 }}>
                <span style={{ color: colors.muted }}>{r.numero}</span>
                <span style={{ flex: 1, color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.descripcion}</span>
                <span style={{ color: colors.muted, fontSize: 11 }}>{r.capitulo}</span>
              </div>
            ))}
          </div>
        )}
        {repartos.length === 0 && !busqueda && (
          <div style={{ fontSize: 11, color: colors.muted, marginTop: 6 }}>
            Si no asignas rubro ahora, la factura queda en "por asignar" y no se cuenta en el control hasta que la asignes.
          </div>
        )}
      </div>

      {error && <div style={{ color: colors.danger, fontSize: 12, marginBottom: 10 }}>{error}</div>}

      <Button variant="primary" size="lg" style={{ width: "100%" }} onClick={guardar} disabled={guardando}>
        {guardando ? "Guardando..." : editando ? "Guardar cambios" : "Agregar factura"}
      </Button>
    </Modal>
  );
}
