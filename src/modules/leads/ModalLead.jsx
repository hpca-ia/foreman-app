import { useState, useEffect } from "react";
import { Plus, Check, X, Trash2, GripVertical, MessageSquare, Sparkles } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import { daysUntil } from "../../lib/dates";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import { ETAPAS, etapaInfo, ORIGENES, SIGUIENTE_ESTADO } from "./constantes";

const hoy = () => new Date().toISOString().split("T")[0];
const enDias = n => new Date(Date.now() + n * 86400000).toISOString().split("T")[0];

export default function ModalLead({ lead, currentUser, users = [], onCerrar, onGuardado }) {
  const editando = !!lead;
  const [form, setForm] = useState(lead ? { ...lead } : {
    nombre: "", contacto: "", telefono: "", email: "", origen: "Referido",
    etapa: "nuevo", valor_estimado: "", fecha_cierre: "", notas: "",
    responsable_id: currentUser?.id || null, responsable_nombre: currentUser?.name || "",
  });
  const [ruta, setRuta] = useState([]);
  const [movs, setMovs] = useState([]);
  const [nota, setNota] = useState("");
  const [nuevoPaso, setNuevoPaso] = useState("");
  const [pensando, setPensando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!lead) return;
    (async () => {
      const [{ data: ts }, { data: ms }] = await Promise.all([
        supabase.from("tasks").select("*").eq("lead_id", lead.id).order("ruta_orden", { nullsFirst: false }),
        supabase.from("lead_movimientos").select("*").eq("lead_id", lead.id).order("created_at", { ascending: false }).limit(30),
      ]);
      setRuta(ts || []);
      setMovs(ms || []);
    })();
  }, [lead]);

  const inp = (k, v) => setForm(p => ({ ...p, [k]: v }));

  async function anotar(lead_id, tipo, detalle, extra = {}) {
    await supabase.from("lead_movimientos").insert({
      lead_id, tipo, detalle, autor_id: currentUser?.id, autor_nombre: currentUser?.name, ...extra,
    });
  }

  async function guardar() {
    if (!form.nombre?.trim()) { setError("Ponle un nombre al lead."); return; }
    setGuardando(true); setError("");
    const payload = {
      nombre: form.nombre.trim(), contacto: form.contacto || null, telefono: form.telefono || null,
      email: form.email || null, origen: form.origen || null, etapa: form.etapa,
      valor_estimado: Number(form.valor_estimado) || null,
      fecha_cierre: form.fecha_cierre || null, notas: form.notas || null,
      responsable_id: Number(form.responsable_id) || null,
      responsable_nombre: users.find(u => u.id === Number(form.responsable_id))?.name || form.responsable_nombre || null,
      motivo_perdida: form.etapa === "perdido" ? (form.motivo_perdida || null) : null,
      actualizado_at: new Date().toISOString(),
    };

    if (editando) {
      const { error: e } = await supabase.from("leads").update(payload).eq("id", lead.id);
      if (e) { setError(e.message); setGuardando(false); return; }
      if (lead.etapa !== form.etapa) {
        await anotar(lead.id, "etapa", `${etapaInfo(lead.etapa).label} → ${etapaInfo(form.etapa).label}`,
          { etapa_de: lead.etapa, etapa_a: form.etapa });
      }
      setGuardando(false); onGuardado(); return;
    }

    const { data: creado, error: e } = await supabase.from("leads")
      .insert({ ...payload, created_by: currentUser?.id }).select().single();
    if (e || !creado) { setError(e?.message || "No se pudo crear"); setGuardando(false); return; }

    // El lead nace en blanco: su ruta la va escribiendo NOVA a medida que
    // aparecen los pasos. Una ruta de plantilla se llena de pasos que nadie
    // pensó, y eso entrena a ignorarla.
    await anotar(creado.id, "nota", "Lead creado");
    setGuardando(false); onGuardado();
  }

  // Tres estados, no dos: pendiente → hecho → no se hizo. Un paso que se
  // descartó y queda "pendiente" para siempre ensucia la señal de lo que
  // falta, y termina enseñando a ignorarla.
  async function alternarPaso(t) {
    const nuevo = SIGUIENTE_ESTADO[t.status] || "listo";
    await supabase.from("tasks").update({ status: nuevo }).eq("id", t.id);
    setRuta(r => r.map(x => x.id === t.id ? { ...x, status: nuevo } : x));
    await supabase.from("leads").update({ actualizado_at: new Date().toISOString() }).eq("id", lead.id);
    if (nuevo === "listo") await anotar(lead.id, "nota", `Hecho: ${t.title}`);
    if (nuevo === "bloqueado") await anotar(lead.id, "nota", `No se hizo: ${t.title}`);
  }

  async function cambiarFecha(t, fecha) {
    await supabase.from("tasks").update({ due_date: fecha || null }).eq("id", t.id);
    setRuta(r => r.map(x => x.id === t.id ? { ...x, due_date: fecha } : x));
  }

  // Se le dicta a NOVA en el idioma de uno —"enviar portafolio el viernes y
  // llamar al arquitecto el lunes"— y ella lo parte en pasos con fecha. Si no
  // entiende, el texto entra tal cual como un paso: nunca se pierde lo escrito.
  async function agregarPaso() {
    const texto = nuevoPaso.trim();
    if (!texto || !lead) return;
    setPensando(true); setError("");
    const orden = Math.max(0, ...ruta.map(t => t.ruta_orden || 0));
    let pasos = null;
    try {
      const res = await fetch("/api/nova", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-5", max_tokens: 800,
          system: `Conviertes lo que dicta un director comercial en pasos de seguimiento de un lead.
Hoy es ${hoy()}. El lead se llama "${lead.nombre}"${form.contacto ? `, contacto ${form.contacto}` : ""}.
Puede venir más de un paso en una frase. Devuelve SOLO JSON, sin markdown:
{"pasos":[{"titulo":"Enviar portafolio","fecha":"2026-09-18"}]}
El título es corto y empieza con el verbo de la acción. La fecha en AAAA-MM-DD:
interpreta "el viernes", "mañana", "en dos semanas" contra la fecha de hoy.
Si no se dice cuándo, pon la fecha de hoy.`,
          messages: [{ role: "user", content: texto }],
        }),
      });
      const data = await res.json();
      const txt = (data.content?.[0]?.text || "").replace(/```json|```/g, "").trim();
      pasos = JSON.parse(txt.match(/\{[\s\S]*\}/)[0]).pasos;
    } catch { pasos = null; }

    const filas = (pasos?.length ? pasos : [{ titulo: texto, fecha: hoy() }])
      .filter(p => p.titulo?.trim())
      .map((p, i) => ({
        title: p.titulo.trim(), lead_id: lead.id, ruta_orden: orden + i + 1,
        due_date: /^\d{4}-\d{2}-\d{2}$/.test(p.fecha) ? p.fecha : hoy(),
        priority: "media", status: "pendiente", type: "lead",
        assignee_id: Number(form.responsable_id) || currentUser?.id, created_by: currentUser?.id,
      }));

    const { data, error: e } = await supabase.from("tasks").insert(filas).select();
    if (e) setError("No se pudo agregar: " + e.message);
    else { setRuta(r => [...r, ...(data || [])]); setNuevoPaso(""); }
    setPensando(false);
  }

  async function borrarPaso(t) {
    await supabase.from("tasks").delete().eq("id", t.id);
    setRuta(r => r.filter(x => x.id !== t.id));
  }

  async function agregarNota() {
    const d = nota.trim();
    if (!d || !lead) return;
    await anotar(lead.id, "nota", d);
    await supabase.from("leads").update({ actualizado_at: new Date().toISOString() }).eq("id", lead.id);
    const { data } = await supabase.from("lead_movimientos").select("*").eq("lead_id", lead.id).order("created_at", { ascending: false }).limit(30);
    setMovs(data || []); setNota("");
  }

  const hechos = ruta.filter(t => t.status === "listo" || t.status === "bloqueado").length;
  const lbl = { fontSize: 10, color: colors.muted, fontWeight: 600, display: "block", marginBottom: 3 };
  const mini = { ...inputStyle, padding: "7px 9px", fontSize: 12 };

  return (
    <Modal onClose={onCerrar} maxWidth={560}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: colors.ink, flex: 1 }}>
          {editando ? lead.nombre : "Nuevo lead"}
        </div>
        {editando && ruta.length > 0 && (
          <span style={{ fontSize: 11, color: colors.muted }}>Ruta: {hechos} de {ruta.length}</span>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={lbl}>NOMBRE DEL LEAD</label>
          <input value={form.nombre} onChange={e => inp("nombre", e.target.value)} placeholder="Ej: Diners Plaza Lagos" style={mini} autoFocus />
        </div>
        <div><label style={lbl}>CONTACTO</label><input value={form.contacto || ""} onChange={e => inp("contacto", e.target.value)} style={mini} /></div>
        <div><label style={lbl}>TELÉFONO</label><input value={form.telefono || ""} onChange={e => inp("telefono", e.target.value)} style={mini} /></div>
        <div><label style={lbl}>ORIGEN</label>
          <select value={form.origen || ""} onChange={e => inp("origen", e.target.value)} style={mini}>
            {ORIGENES.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div><label style={lbl}>RESPONSABLE</label>
          <select value={form.responsable_id || ""} onChange={e => inp("responsable_id", e.target.value)} style={mini}>
            <option value="">Sin asignar</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div><label style={lbl}>VALOR ESTIMADO</label><input type="number" value={form.valor_estimado || ""} onChange={e => inp("valor_estimado", e.target.value)} placeholder="0" style={mini} /></div>
        <div><label style={lbl}>SE DECIDE EL</label><input type="date" value={form.fecha_cierre || ""} onChange={e => inp("fecha_cierre", e.target.value)} style={mini} /></div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={lbl}>ETAPA</label>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {ETAPAS.map(et => (
              <button key={et.id} onClick={() => inp("etapa", et.id)}
                style={{ padding: "5px 11px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: colors.font,
                  border: `1px solid ${form.etapa === et.id ? et.color : colors.border}`,
                  background: form.etapa === et.id ? et.color : "transparent",
                  color: form.etapa === et.id ? "#fff" : colors.inkSoft }}>
                {et.label}
              </button>
            ))}
          </div>
        </div>
        {form.etapa === "perdido" && (
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={lbl}>¿POR QUÉ SE PERDIÓ?</label>
            <input value={form.motivo_perdida || ""} onChange={e => inp("motivo_perdida", e.target.value)} placeholder="Precio, plazo, se fue con otro..." style={mini} />
          </div>
        )}
      </div>

      {editando && (
        <>
          <div style={{ fontSize: 12, fontWeight: 600, color: colors.ink, marginBottom: 6 }}>La ruta de este lead</div>
          <div style={{ background: colors.bg, borderRadius: colors.radiusMd, padding: 10, marginBottom: 12 }}>
            {ruta.length === 0 && <div style={{ fontSize: 11, color: colors.inkSoft, marginBottom: 8 }}>Todavía sin pasos. Dictale abajo a NOVA qué sigue y con qué fecha.</div>}
            {ruta.map(t => {
              const listo = t.status === "listo";
              const noHecho = t.status === "bloqueado";
              const cerrado = listo || noHecho;
              const d = t.due_date ? daysUntil(t.due_date) : null;
              const vencido = !cerrado && d != null && d < 0;
              return (
                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
                  <GripVertical size={11} color={colors.border} style={{ flexShrink: 0 }} />
                  <button onClick={() => alternarPaso(t)} title="Pendiente → hecho → no se hizo"
                    style={{ width: 17, height: 17, borderRadius: 5, flexShrink: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
                      border: `1.5px solid ${listo ? colors.success : noHecho ? colors.muted : vencido ? colors.danger : colors.border}`,
                      background: listo ? colors.success : noHecho ? colors.muted : "transparent" }}>
                    {listo && <Check size={11} color="#fff" />}
                    {noHecho && <X size={11} color="#fff" />}
                  </button>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: cerrado ? colors.muted : colors.ink, textDecoration: cerrado ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.title}
                  </span>
                  <input type="date" value={t.due_date || ""} onChange={e => cambiarFecha(t, e.target.value)}
                    style={{ ...mini, width: 132, padding: "4px 6px", fontSize: 11, color: vencido ? colors.danger : colors.inkSoft, borderColor: vencido ? colors.dangerBorder : colors.border }} />
                  <button onClick={() => borrarPaso(t)} style={{ background: "none", border: "none", color: colors.muted, cursor: "pointer", display: "flex", padding: 2 }}><Trash2 size={11} /></button>
                </div>
              );
            })}
            <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
              <Sparkles size={14} color={colors.brand} style={{ flexShrink: 0 }} />
              <input value={nuevoPaso} onChange={e => setNuevoPaso(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !pensando && agregarPaso()}
                disabled={pensando}
                placeholder={pensando ? "NOVA está anotando..." : "Enviar portafolio el viernes..."}
                style={{ ...mini, flex: 1 }} />
              <Button variant="primary" size="sm" onClick={agregarPaso} disabled={!nuevoPaso.trim() || pensando}>
                <Plus size={12} /> {pensando ? "..." : "Anotar"}
              </Button>
            </div>
          </div>

          <div style={{ fontSize: 12, fontWeight: 600, color: colors.ink, marginBottom: 6 }}>Bitácora</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <input value={nota} onChange={e => setNota(e.target.value)} onKeyDown={e => e.key === "Enter" && agregarNota()}
              placeholder="¿Qué pasó? Una llamada, una visita, lo que dijeron..." style={{ ...mini, flex: 1 }} />
            <Button variant="outline" size="sm" onClick={agregarNota} disabled={!nota.trim()}><MessageSquare size={12} /></Button>
          </div>
          <div style={{ maxHeight: 150, overflowY: "auto", marginBottom: 12 }}>
            {movs.map(m => (
              <div key={m.id} style={{ fontSize: 11, color: colors.inkSoft, padding: "5px 0", borderBottom: `1px solid ${colors.neutralSoft}` }}>
                <span style={{ color: colors.muted }}>{new Date(m.created_at).toLocaleDateString("es-EC")} · {m.autor_nombre}</span><br />
                {m.detalle}
              </div>
            ))}
            {movs.length === 0 && <div style={{ fontSize: 11, color: colors.muted }}>Sin movimientos todavía.</div>}
          </div>
        </>
      )}

      {error && <div style={{ color: colors.danger, fontSize: 12, marginBottom: 10 }}>{error}</div>}

      <div style={{ display: "flex", gap: 8 }}>
        <Button variant="outline" style={{ flex: 1 }} onClick={onCerrar}>Cerrar</Button>
        <Button variant="primary" style={{ flex: 2 }} onClick={guardar} disabled={guardando}>
          {guardando ? "Guardando..." : editando ? "Guardar cambios" : "Crear lead"}
        </Button>
      </div>
    </Modal>
  );
}
