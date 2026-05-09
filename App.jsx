import { useState, useRef, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://qxoincfvscvbqvoxamdi.supabase.co";
const SUPABASE_KEY = "sb_publishable_UXB8WueKrn1zBSXfsTqJ0w_C61L3b77";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const USERS = [
  { id: 1, name: "Hernan",     role: "owner",     pin: "1234", avatar: "HE" },
  { id: 2, name: "Johanna",    role: "assistant",  pin: "2345", avatar: "JO" },
  { id: 3, name: "Hector",     role: "member",     pin: "3001", avatar: "HC" },
  { id: 4, name: "Josh",       role: "member",     pin: "3002", avatar: "JS" },
  { id: 5, name: "Guillermo",  role: "member",     pin: "3003", avatar: "GU" },
  { id: 6, name: "Camila",     role: "member",     pin: "3004", avatar: "CA" },
  { id: 7, name: "Santiago",   role: "member",     pin: "3005", avatar: "SA" },
  { id: 8, name: "Gerardo",    role: "member",     pin: "3006", avatar: "GE" },
  { id: 9, name: "Luis Guala", role: "member",     pin: "3007", avatar: "LG" },
];

const PROJECTS = [
  { id: 10, name: "🧪 Testing",        color: "#FF2D55" },
  { id: 1,  name: "BdP Condado",       color: "#E8622A" },
  { id: 2,  name: "BdP Urdesa",        color: "#2A8CE8" },
  { id: 3,  name: "BdP Banca Seguros", color: "#AF52DE" },
  { id: 4,  name: "Fowler",            color: "#FF9500" },
  { id: 5,  name: "Banderas",          color: "#34C759" },
  { id: 6,  name: "Servipagos",        color: "#FF6B6B" },
  { id: 7,  name: "Zuleta",            color: "#00C7BE" },
  { id: 8,  name: "La Quinta",         color: "#FFD60A" },
  { id: 9,  name: "ManEugenia",        color: "#BF5AF2" },
];

const TIPOS = ["Llamada", "Reunión", "Contrato", "Compra", "Inspección", "Aprobación", "Visita a obra", "Otro"];

const PRIORIDAD = {
  urgente: { label: "URGENTE", color: "#FF3B30", bg: "rgba(255,59,48,0.12)" },
  alta:    { label: "ALTA",    color: "#FF9500", bg: "rgba(255,149,0,0.12)" },
  media:   { label: "MEDIA",   color: "#34C759", bg: "rgba(52,199,89,0.12)" },
  baja:    { label: "BAJA",    color: "#8E8E93", bg: "rgba(142,142,147,0.12)" },
};

const ESTADO = {
  pendiente:     { label: "Pendiente",   icon: "⏳" },
  "en-progreso": { label: "En progreso", icon: "🔧" },
  listo:         { label: "Listo",       icon: "✅" },
  bloqueado:     { label: "Bloqueado",   icon: "🚫" },
};

const getProject = id => PROJECTS.find(p => p.id === id);
const getUser    = id => USERS.find(u => u.id === id);
const esAdmin    = role => role === "owner" || role === "assistant";

function daysUntil(dateStr) {
  const today = new Date();
  today.setHours(0,0,0,0);
  return Math.ceil((new Date(dateStr) - today) / 86400000);
}

function timeAgo(ts) {
  const now  = new Date();
  const then = new Date(ts);
  const mins = Math.floor((now - then) / 60000);
  if (mins < 1)  return "ahora";
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `hace ${hrs}h`;
  return `hace ${Math.floor(hrs/24)}d`;
}

function Avatar({ initials, size = 32, color = "#E8622A" }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.34, fontWeight: 700, flexShrink: 0, fontFamily: "'DM Mono', monospace" }}>
      {initials}
    </div>
  );
}

function FechaBadge({ due }) {
  const d = daysUntil(due);
  if (d < 0)   return <span style={{ color: "#FF3B30", fontSize: 11, fontWeight: 700 }}>VENCIDA {Math.abs(d)}d</span>;
  if (d === 0) return <span style={{ color: "#FF9500", fontSize: 11, fontWeight: 700 }}>VENCE HOY</span>;
  if (d <= 2)  return <span style={{ color: "#FF9500", fontSize: 11 }}>en {d}d</span>;
  return <span style={{ color: "#8E8E93", fontSize: 11 }}>en {d}d</span>;
}

// ── LOGIN ──────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [selected, setSelected] = useState(null);
  const [pin, setPin]           = useState("");
  const [error, setError]       = useState("");
  const [step, setStep]         = useState("pick");

  function selectUser(u) { setSelected(u); setPin(""); setError(""); setStep("pin"); }

  function handlePin(d) {
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    if (next.length === 4) {
      setTimeout(() => {
        if (next === selected.pin) onLogin(selected);
        else { setError("PIN incorrecto. Intenta de nuevo."); setPin(""); }
      }, 200);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#000", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;600;700&display=swap'); *{box-sizing:border-box} @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
      <div style={{ marginBottom: 32, textAlign: "center" }}>
        <div style={{ fontSize: 9, color: "#E8622A", letterSpacing: 3, fontWeight: 700, fontFamily: "'DM Mono', monospace" }}>FOREMAN</div>
        <div style={{ fontSize: 28, color: "#fff", fontWeight: 700, letterSpacing: -1, fontFamily: "'DM Mono', monospace" }}>by NOVA</div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,45,85,0.15)", border: "1px solid rgba(255,45,85,0.3)", borderRadius: 20, padding: "3px 10px", marginTop: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#FF2D55", animation: "pulse 1.5s infinite" }} />
          <span style={{ color: "#FF2D55", fontSize: 10, fontFamily: "'DM Mono', monospace", fontWeight: 700, letterSpacing: 1 }}>BETA</span>
        </div>
        <div style={{ fontSize: 11, color: "#8E8E93", marginTop: 10, fontFamily: "'DM Mono', monospace", letterSpacing: 1 }}>¿QUIÉN ERES?</div>
      </div>

      {step === "pick" && (
        <div style={{ width: "100%", maxWidth: 360 }}>
          {USERS.map(u => (
            <button key={u.id} onClick={() => selectUser(u)} style={{ width: "100%", background: "#1C1C1E", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "14px 16px", marginBottom: 8, display: "flex", alignItems: "center", gap: 14, cursor: "pointer", transition: "border-color 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.borderColor = "#E8622A"}
              onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"}>
              <Avatar initials={u.avatar} size={40} color={u.role==="owner"?"#E8622A":u.role==="assistant"?"#AF52DE":"#2A8CE8"} />
              <div style={{ textAlign: "left" }}>
                <div style={{ color: "#fff", fontSize: 15, fontWeight: 600, fontFamily: "'DM Mono', monospace" }}>{u.name}</div>
                <div style={{ color: "#8E8E93", fontSize: 11, fontFamily: "'DM Mono', monospace" }}>
                  {u.role==="owner"?"👑 Director":u.role==="assistant"?"🤝 Asistente":"👷 Equipo"}
                </div>
              </div>
              <div style={{ marginLeft: "auto", color: "#8E8E93", fontSize: 20 }}>›</div>
            </button>
          ))}
        </div>
      )}

      {step === "pin" && selected && (
        <div style={{ width: "100%", maxWidth: 300, textAlign: "center" }}>
          <button onClick={() => { setStep("pick"); setError(""); }} style={{ background: "none", border: "none", color: "#8E8E93", cursor: "pointer", fontSize: 12, marginBottom: 24, fontFamily: "'DM Mono', monospace", display: "flex", alignItems: "center", gap: 6 }}>← Volver</button>
          <Avatar initials={selected.avatar} size={56} color={selected.role==="owner"?"#E8622A":selected.role==="assistant"?"#AF52DE":"#2A8CE8"} />
          <div style={{ color: "#fff", fontSize: 18, fontWeight: 700, marginTop: 12, fontFamily: "'DM Mono', monospace" }}>{selected.name}</div>
          <div style={{ color: "#8E8E93", fontSize: 12, marginBottom: 28, marginTop: 4, fontFamily: "'DM Mono', monospace" }}>Ingresa tu PIN de 4 dígitos</div>
          <div style={{ display: "flex", justifyContent: "center", gap: 14, marginBottom: 32 }}>
            {[0,1,2,3].map(i => <div key={i} style={{ width: 16, height: 16, borderRadius: "50%", background: pin.length > i ? "#E8622A" : "rgba(255,255,255,0.1)", transition: "background 0.15s" }} />)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, maxWidth: 240, margin: "0 auto" }}>
            {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((d, i) => (
              <button key={i} onClick={() => { if (d==="⌫") setPin(p=>p.slice(0,-1)); else if (d!=="") handlePin(d); }}
                style={{ background:d===""?"transparent":"#1C1C1E", border:d===""?"none":"1px solid rgba(255,255,255,0.1)", borderRadius:12, height:56, color:"#fff", fontSize:d==="⌫"?20:22, fontWeight:600, cursor:d===""?"default":"pointer", fontFamily:"'DM Mono', monospace" }}
                onMouseEnter={e=>{ if(d!=="") e.currentTarget.style.background="#2C2C2E"; }}
                onMouseLeave={e=>{ if(d!=="") e.currentTarget.style.background="#1C1C1E"; }}
              >{d}</button>
            ))}
          </div>
          {error && <div style={{ color: "#FF3B30", fontSize: 13, marginTop: 16, fontFamily: "'DM Mono', monospace" }}>{error}</div>}
        </div>
      )}
    </div>
  );
}

// ── CHAT ───────────────────────────────────────────────────────────────────
function ChatTarea({ task, currentUser, onClose }) {
  const [texto, setTexto]       = useState("");
  const [comments, setComments] = useState([]);
  const [loading, setLoading]   = useState(true);
  const bottomRef = useRef(null);

  useEffect(() => {
    fetchComments();
    const channel = supabase.channel(`comments-${task.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "comments", filter: `task_id=eq.${task.id}` },
        payload => setComments(prev => [...prev, payload.new]))
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [task.id]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [comments]);

  async function fetchComments() {
    const { data } = await supabase.from("comments").select("*").eq("task_id", task.id).order("created_at", { ascending: true });
    setComments(data || []);
    setLoading(false);
  }

  async function enviar() {
    if (!texto.trim()) return;
    const msg = texto.trim();
    setTexto("");
    await supabase.from("comments").insert({ task_id: task.id, user_id: currentUser.id, text: msg });
  }

  const proyecto = getProject(task.project_id);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 200 }}>
      <div style={{ background: "#111", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 540, maxHeight: "90vh", display: "flex", flexDirection: "column", border: "1px solid rgba(255,255,255,0.1)", borderBottom: "none" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 4, height: 36, borderRadius: 2, background: proyecto?.color, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: "#fff", fontSize: 14, fontWeight: 700, fontFamily: "'DM Mono', monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{task.title}</div>
              <div style={{ color: "#8E8E93", fontSize: 11, fontFamily: "'DM Mono', monospace" }}>{proyecto?.name} · {comments.length} comentario{comments.length !== 1 ? "s" : ""}</div>
            </div>
            <button onClick={onClose} style={{ background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 8, width: 32, height: 32, color: "#8E8E93", cursor: "pointer", fontSize: 16, flexShrink: 0 }}>×</button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          {loading && <div style={{ textAlign: "center", color: "#8E8E93", fontFamily: "'DM Mono', monospace", fontSize: 12, padding: "30px 0" }}>Cargando...</div>}
          {!loading && comments.length === 0 && <div style={{ textAlign: "center", color: "#8E8E93", fontFamily: "'DM Mono', monospace", fontSize: 12, padding: "30px 0" }}>💬 Sin comentarios aún.</div>}
          {comments.map(c => {
            const autor = getUser(c.user_id);
            const esMio = c.user_id === currentUser.id;
            return (
              <div key={c.id} style={{ display: "flex", flexDirection: esMio ? "row-reverse" : "row", gap: 10, alignItems: "flex-end" }}>
                {!esMio && <Avatar initials={autor?.avatar || "??"} size={30} color={autor?.role==="owner"?"#E8622A":autor?.role==="assistant"?"#AF52DE":"#2A8CE8"} />}
                <div style={{ maxWidth: "75%" }}>
                  {!esMio && <div style={{ color: "#8E8E93", fontSize: 10, fontFamily: "'DM Mono', monospace", marginBottom: 4, paddingLeft: 4 }}>{autor?.name}</div>}
                  <div style={{ background: esMio ? "#E8622A" : "#2C2C2E", borderRadius: esMio ? "16px 16px 4px 16px" : "16px 16px 16px 4px", padding: "10px 14px" }}>
                    <div style={{ color: "#fff", fontSize: 14, lineHeight: 1.5, fontFamily: "Georgia, serif" }}>{c.text}</div>
                  </div>
                  <div style={{ color: "#8E8E93", fontSize: 10, fontFamily: "'DM Mono', monospace", marginTop: 3, textAlign: esMio ? "right" : "left" }}>{timeAgo(c.created_at)}</div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
        <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,0.08)", flexShrink: 0, display: "flex", gap: 10, alignItems: "flex-end" }}>
          <Avatar initials={currentUser.avatar} size={34} color={currentUser.role==="owner"?"#E8622A":currentUser.role==="assistant"?"#AF52DE":"#2A8CE8"} />
          <textarea value={texto} onChange={e => setTexto(e.target.value)} onKeyDown={e => { if (e.key==="Enter"&&!e.shiftKey) { e.preventDefault(); enviar(); } }} placeholder="Escribe un comentario..." rows={1}
            style={{ flex: 1, background: "#2C2C2E", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#E8E8E0", fontSize: 14, fontFamily: "Georgia, serif", padding: "10px 14px", resize: "none", outline: "none", lineHeight: 1.5 }} />
          <button onClick={enviar} disabled={!texto.trim()} style={{ background: texto.trim() ? "#E8622A" : "#2C2C2E", border: "none", borderRadius: 10, width: 40, height: 40, color: texto.trim() ? "#fff" : "#8E8E93", cursor: texto.trim() ? "pointer" : "default", fontSize: 18, flexShrink: 0 }}>↑</button>
        </div>
      </div>
    </div>
  );
}

// ── WHATSAPP ───────────────────────────────────────────────────────────────
function WhatsApp({ task }) {
  const [msg, setMsg]     = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen]   = useState(false);
  const m = task.assignee_id ? getUser(task.assignee_id) : null;
  const p = getProject(task.project_id);
  const d = daysUntil(task.due_date);

  async function generar() {
    setLoading(true); setOpen(true);
    const vence = d < 0 ? `tiene ${Math.abs(d)} días de retraso` : d === 0 ? "vence HOY" : `vence en ${d} días`;
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 1000,
          system: "Escribes recordatorios de WhatsApp cortos y directos para un director de construcción. En español. Máx 3 oraciones. Profesional y cercano. Solo el mensaje, nada más.",
          messages: [{ role: "user", content: `Recordatorio para ${m?.name||"el equipo"} sobre: "${task.title}" en ${p?.name}. La tarea ${vence}. Prioridad: ${task.priority}. Notas: ${task.notes||"ninguna"}.` }]
        })
      });
      const data = await res.json();
      setMsg(data.content?.[0]?.text || "");
    } catch { setMsg("Error al generar."); }
    setLoading(false);
  }

  return (
    <>
      <button onClick={generar} style={{ background: "#25D366", border: "none", borderRadius: 8, padding: "7px 12px", color: "#fff", fontSize: 12, fontFamily: "'DM Mono', monospace", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>📲 WA</button>
      {open && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: 20 }} onClick={() => setOpen(false)}>
          <div style={{ background: "#1C1C1E", borderRadius: 16, padding: 24, maxWidth: 420, width: "100%", border: "1px solid rgba(255,255,255,0.1)" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <span style={{ fontSize: 22 }}>📲</span>
              <div><div style={{ color: "#fff", fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700 }}>Recordatorio WhatsApp</div>{m && <div style={{ color: "#8E8E93", fontSize: 12, fontFamily: "'DM Mono', monospace" }}>{m.name}</div>}</div>
              <button onClick={() => setOpen(false)} style={{ marginLeft: "auto", background: "none", border: "none", color: "#8E8E93", cursor: "pointer", fontSize: 20 }}>×</button>
            </div>
            {loading ? <div style={{ color: "#8E8E93", fontFamily: "'DM Mono', monospace", fontSize: 12, padding: "20px 0", textAlign: "center" }}>✍️ NOVA redactando...</div>
              : <>
                  <textarea value={msg} onChange={e => setMsg(e.target.value)} style={{ width: "100%", minHeight: 100, background: "#2C2C2E", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#E8E8E0", fontSize: 14, fontFamily: "Georgia, serif", padding: 12, resize: "vertical", boxSizing: "border-box", lineHeight: 1.6, outline: "none" }} />
                  <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                    <button onClick={generar} style={{ flex: 1, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: 10, color: "#8E8E93", fontFamily: "'DM Mono', monospace", fontSize: 12, cursor: "pointer" }}>↺</button>
                    {m ? <button onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank")} style={{ flex: 2, background: "#25D366", border: "none", borderRadius: 8, padding: 10, color: "#fff", fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Abrir WhatsApp →</button>
                      : <div style={{ flex: 2, color: "#8E8E93", fontSize: 12, fontFamily: "'DM Mono', monospace", display: "flex", alignItems: "center", justifyContent: "center" }}>Sin asignado</div>}
                  </div>
                </>
            }
          </div>
        </div>
      )}
    </>
  );
}

// ── AI BRIEFING ────────────────────────────────────────────────────────────
function AIBriefing({ tasks, currentUser }) {
  const [texto, setTexto]   = useState("");
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);

  async function obtener() {
    setLoading(true); setVisible(true);
    const resumen = tasks.map(t => {
      const d = daysUntil(t.due_date);
      return `- [${t.priority.toUpperCase()}] ${t.title} | ${getProject(t.project_id)?.name} | ${t.assignee_id?getUser(t.assignee_id)?.name:"sin asignar"} | ${d<0?`VENCIDA ${Math.abs(d)}d`:d===0?"HOY":`en ${d}d`} | ${t.status}`;
    }).join("\n");
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 1000,
          system: `Eres NOVA, asistente IA de Hernan, director de constructora. Briefings directos en español. Máx 4 puntos. Crítico primero. Sin rodeos.`,
          messages: [{ role: "user", content: `Tareas:\n${resumen}\n\nBriefing para ${currentUser.name}.` }]
        })
      });
      const data = await res.json();
      setTexto(data.content?.[0]?.text || "Todo en orden.");
    } catch { setTexto("⚠️ Sin conexión."); }
    setLoading(false);
  }

  if (!visible) return (
    <button onClick={obtener} style={{ background: "linear-gradient(135deg,#E8622A,#FF9500)", border: "none", borderRadius: 12, padding: "13px 18px", color: "#fff", fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, width: "100%", boxShadow: "0 4px 20px rgba(232,98,42,0.3)", marginBottom: 20 }}>
      <span style={{ fontSize: 18 }}>🤖</span><span>NOVA — BRIEFING DEL DÍA</span><span style={{ marginLeft: "auto", opacity: 0.6, fontSize: 11 }}>Analizar todo</span>
    </button>
  );

  return (
    <div style={{ background: "rgba(232,98,42,0.08)", border: "1px solid rgba(232,98,42,0.25)", borderRadius: 12, padding: 16, marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span>🤖</span>
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 700, color: "#E8622A" }}>NOVA</span>
        <button onClick={() => setVisible(false)} style={{ marginLeft: "auto", background: "none", border: "none", color: "#8E8E93", cursor: "pointer", fontSize: 18 }}>×</button>
      </div>
      {loading ? <div style={{ color: "#8E8E93", fontFamily: "'DM Mono', monospace", fontSize: 12 }}>Analizando {tasks.length} tareas...</div>
        : <div style={{ color: "#E8E8E0", fontFamily: "Georgia, serif", fontSize: 14, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{texto}</div>}
      {!loading && <button onClick={obtener} style={{ marginTop: 10, background: "none", border: "1px solid rgba(232,98,42,0.3)", borderRadius: 8, padding: "6px 12px", color: "#E8622A", fontFamily: "'DM Mono', monospace", fontSize: 11, cursor: "pointer" }}>↺ Actualizar</button>}
    </div>
  );
}

// ── TARJETA TAREA ──────────────────────────────────────────────────────────
function TarjetaTarea({ task, currentUser, onCambiarEstado, onEditar, onAbrirChat, commentCount }) {
  const proyecto = getProject(task.project_id);
  const asignado = task.assignee_id ? getUser(task.assignee_id) : null;
  const creador  = getUser(task.created_by);
  const pC = PRIORIDAD[task.priority] || PRIORIDAD.media;
  const eC = ESTADO[task.status] || ESTADO.pendiente;
  const admin = esAdmin(currentUser.role);
  const esMia = task.assignee_id === currentUser.id;
  const puedeCambiar = admin || esMia;

  return (
    <div style={{ background: "#1C1C1E", border: `1px solid rgba(255,255,255,${task.status==="listo"?"0.04":"0.09"})`, borderLeft: `3px solid ${proyecto?.color||"#E8622A"}`, borderRadius: 12, padding: 16, marginBottom: 10, opacity: task.status==="listo"?0.55:1 }}>
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 6 }}>
        <span style={{ background: pC.bg, color: pC.color, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, fontFamily: "'DM Mono', monospace" }}>{pC.label}</span>
        <span style={{ background: "rgba(255,255,255,0.05)", color: "#8E8E93", fontSize: 10, padding: "2px 7px", borderRadius: 4, fontFamily: "'DM Mono', monospace" }}>{(task.type||"").toUpperCase()}</span>
        <span style={{ color: "#8E8E93", fontSize: 11 }}>{eC.icon} {eC.label}</span>
      </div>
      <div style={{ color: "#E8E8E0", fontSize: 15, fontWeight: 600, marginBottom: 4, fontFamily: "Georgia, serif" }}>{task.title}</div>
      {task.notes && <div style={{ color: "#8E8E93", fontSize: 12, marginBottom: 8, lineHeight: 1.5 }}>{task.notes}</div>}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ background: `${proyecto?.color}20`, color: proyecto?.color, fontSize: 11, padding: "2px 8px", borderRadius: 20, fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{proyecto?.name}</span>
        {asignado ? <div style={{ display:"flex", alignItems:"center", gap:5 }}><Avatar initials={asignado.avatar} size={18} color={proyecto?.color}/><span style={{ color:"#8E8E93", fontSize:12 }}>{asignado.name}</span></div>
          : <span style={{ color:"#FF3B30", fontSize:11, fontFamily:"'DM Mono', monospace" }}>⚠ Sin asignar</span>}
        <FechaBadge due={task.due_date} />
        {creador && <span style={{ color:"#8E8E93", fontSize:10, fontFamily:"'DM Mono', monospace" }}>por {creador.name}</span>}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
        {puedeCambiar && (
          <select value={task.status} onChange={e => onCambiarEstado(task.id, e.target.value)} style={{ background:"#2C2C2E", border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, color:"#E8E8E0", padding:"6px 10px", fontSize:12, fontFamily:"'DM Mono', monospace", cursor:"pointer", outline:"none" }}>
            {Object.entries(ESTADO).map(([k,v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
          </select>
        )}
        <button onClick={() => onAbrirChat(task)} style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:8, padding:"6px 12px", color:"#E8E8E0", fontSize:12, fontFamily:"'DM Mono', monospace", cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>
          💬 Chat {commentCount > 0 && <span style={{ background:"rgba(255,255,255,0.15)", color:"#fff", fontSize:10, fontWeight:700, padding:"1px 6px", borderRadius:10 }}>{commentCount}</span>}
        </button>
        {admin && <button onClick={() => onEditar(task)} style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, padding:"6px 12px", color:"#8E8E93", fontSize:12, fontFamily:"'DM Mono', monospace", cursor:"pointer" }}>✏️</button>}
        {admin && <WhatsApp task={task} />}
      </div>
    </div>
  );
}

// ── MODAL TAREA ────────────────────────────────────────────────────────────
function ModalTarea({ onCerrar, onGuardar, editTask, currentUser }) {
  const admin = esAdmin(currentUser.role);
  const [form, setForm] = useState(editTask ? {
    title: editTask.title, project_id: editTask.project_id, assignee_id: editTask.assignee_id,
    type: editTask.type, due_date: editTask.due_date, priority: editTask.priority,
    status: editTask.status, notes: editTask.notes || ""
  } : { title:"", project_id:10, assignee_id:currentUser.id, type:"Llamada", due_date:"", priority:"media", status:"pendiente", notes:"" });

  const inp = (f,v) => setForm(p => ({...p,[f]:v}));
  const lS = { color:"#8E8E93", fontSize:11, fontFamily:"'DM Mono', monospace", letterSpacing:0.5, marginBottom:4, display:"block" };
  const iS = { width:"100%", background:"#2C2C2E", border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, color:"#E8E8E0", padding:"10px 12px", fontSize:14, fontFamily:"Georgia, serif", boxSizing:"border-box", outline:"none" };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.8)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:150, padding:20 }} onClick={onCerrar}>
      <div style={{ background:"#1C1C1E", borderRadius:16, padding:24, maxWidth:480, width:"100%", border:"1px solid rgba(255,255,255,0.1)", maxHeight:"90vh", overflowY:"auto" }} onClick={e=>e.stopPropagation()}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <div style={{ color:"#fff", fontFamily:"'DM Mono', monospace", fontSize:14, fontWeight:700 }}>{editTask?"EDITAR TAREA":"NUEVA TAREA"}</div>
          <button onClick={onCerrar} style={{ background:"none", border:"none", color:"#8E8E93", cursor:"pointer", fontSize:20 }}>×</button>
        </div>
        <div style={{ display:"grid", gap:14 }}>
          <div><label style={lS}>TÍTULO *</label><input value={form.title} onChange={e=>inp("title",e.target.value)} placeholder="¿Qué hay que hacer?" style={iS}/></div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <div><label style={lS}>PROYECTO</label><select value={form.project_id} onChange={e=>inp("project_id",Number(e.target.value))} style={iS}>{PROJECTS.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
            <div><label style={lS}>TIPO</label><select value={form.type} onChange={e=>inp("type",e.target.value)} style={iS}>{TIPOS.map(t=><option key={t}>{t}</option>)}</select></div>
            <div><label style={lS}>ASIGNAR A</label><select value={form.assignee_id||""} onChange={e=>inp("assignee_id",e.target.value?Number(e.target.value):null)} style={iS}><option value="">Sin asignar</option>{USERS.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
            <div><label style={lS}>PRIORIDAD</label><select value={form.priority} onChange={e=>inp("priority",e.target.value)} style={iS} disabled={!admin}>{Object.keys(PRIORIDAD).map(k=><option key={k} value={k}>{k.toUpperCase()}</option>)}</select></div>
          </div>
          <div><label style={lS}>FECHA LÍMITE *</label><input type="date" value={form.due_date} onChange={e=>inp("due_date",e.target.value)} style={iS}/></div>
          <div><label style={lS}>NOTAS</label><textarea value={form.notes} onChange={e=>inp("notes",e.target.value)} placeholder="Proveedor, contacto, contexto..." style={{...iS,minHeight:70,resize:"vertical"}}/></div>
        </div>
        {(!form.title||!form.due_date)
          ? <div style={{ color:"#8E8E93", fontSize:11, fontFamily:"'DM Mono', monospace", marginTop:14, textAlign:"center" }}>Completa título y fecha para guardar</div>
          : <button onClick={()=>{ onGuardar(form, editTask?.id); onCerrar(); }} style={{ width:"100%", marginTop:20, background:"linear-gradient(135deg,#E8622A,#FF9500)", border:"none", borderRadius:10, padding:14, color:"#fff", fontFamily:"'DM Mono', monospace", fontSize:14, fontWeight:700, cursor:"pointer" }}>
              {editTask?"GUARDAR CAMBIOS":"AGREGAR TAREA"}
            </button>
        }
      </div>
    </div>
  );
}

// ── APP PRINCIPAL ──────────────────────────────────────────────────────────
export default function App() {
  const [usuario, setUsuario]   = useState(null);
  const [tareas, setTareas]     = useState([]);
  const [commentCounts, setCommentCounts] = useState({});
  const [cargando, setCargando] = useState(false);
  const [vista, setVista]       = useState("tareas");
  const [filtro, setFiltro]     = useState("todas");
  const [filtroP, setFiltroP]   = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [editTask, setEditTask]   = useState(null);
  const [chatTarea, setChatTarea] = useState(null);

  useEffect(() => {
    if (!usuario) return;
    fetchTareas();
    const channel = supabase.channel("tasks-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => fetchTareas())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [usuario]);

  async function fetchTareas() {
    setCargando(true);
    const { data } = await supabase.from("tasks").select("*").order("created_at", { ascending: false });
    setTareas(data || []);
    if (data) {
      const counts = {};
      await Promise.all(data.map(async t => {
        const { count } = await supabase.from("comments").select("*", { count: "exact", head: true }).eq("task_id", t.id);
        counts[t.id] = count || 0;
      }));
      setCommentCounts(counts);
    }
    setCargando(false);
  }

  async function cambiarEstado(id, estado) {
    await supabase.from("tasks").update({ status: estado }).eq("id", id);
    setTareas(ts => ts.map(t => t.id===id ? {...t, status:estado} : t));
  }

  async function guardarTarea(form, id) {
    if (id) {
      await supabase.from("tasks").update(form).eq("id", id);
    } else {
      await supabase.from("tasks").insert({ ...form, created_by: usuario.id });
    }
    fetchTareas();
    setEditTask(null);
  }

  if (!usuario) return <LoginScreen onLogin={setUsuario} />;

  const admin = esAdmin(usuario.role);

  let visibles = admin ? tareas : tareas.filter(t => t.assignee_id===usuario.id || t.created_by===usuario.id);
  if (filtro==="pendiente")  visibles = visibles.filter(t=>t.status==="pendiente");
  if (filtro==="urgente")    visibles = visibles.filter(t=>t.status!=="listo"&&(t.priority==="urgente"||daysUntil(t.due_date)<=1));
  if (filtro==="listo")      visibles = visibles.filter(t=>t.status==="listo");
  if (filtroP!=="all")       visibles = visibles.filter(t=>t.project_id===Number(filtroP));

  const pendientes = tareas.filter(t=>t.status!=="listo");
  const vencidas   = pendientes.filter(t=>daysUntil(t.due_date)<0);
  const urgentes   = pendientes.filter(t=>t.priority==="urgente"||daysUntil(t.due_date)<=1);
  const totalComentarios = Object.values(commentCounts).reduce((s,v)=>s+v,0);

  const tabS = a => ({ padding:"8px 14px", borderRadius:8, border:"none", cursor:"pointer", fontFamily:"'DM Mono', monospace", fontSize:12, fontWeight:600, background:a?"#E8622A":"rgba(255,255,255,0.05)", color:a?"#fff":"#8E8E93", transition:"all 0.15s" });

  return (
    <div style={{ minHeight:"100vh", background:"#000", color:"#E8E8E0", fontFamily:"Georgia, serif", paddingBottom:40 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;600;700&display=swap');
        *{box-sizing:border-box} select option{background:#1C1C1E} input,select,textarea{outline:none}
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:2px}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
      `}</style>

      {/* CABECERA */}
      <div style={{ background:"#111", borderBottom:"1px solid rgba(255,255,255,0.08)", padding:"16px 16px 0", position:"sticky", top:0, zIndex:100 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
          <div>
            <div style={{ fontFamily:"'DM Mono', monospace", fontSize:9, color:"#E8622A", letterSpacing:3, fontWeight:700 }}>FOREMAN</div>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ fontSize:20, fontWeight:700, color:"#fff", letterSpacing:-0.5, fontFamily:"'DM Mono', monospace" }}>by NOVA</div>
              <div style={{ display:"inline-flex", alignItems:"center", gap:4, background:"rgba(255,45,85,0.15)", border:"1px solid rgba(255,45,85,0.3)", borderRadius:20, padding:"2px 8px" }}>
                <div style={{ width:5, height:5, borderRadius:"50%", background:"#FF2D55", animation:"pulse 1.5s infinite" }}/>
                <span style={{ color:"#FF2D55", fontSize:9, fontFamily:"'DM Mono', monospace", fontWeight:700, letterSpacing:1 }}>BETA</span>
              </div>
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            {vencidas.length>0&&admin&&<div style={{ background:"rgba(255,59,48,0.15)", border:"1px solid rgba(255,59,48,0.3)", borderRadius:20, padding:"4px 10px", color:"#FF3B30", fontFamily:"'DM Mono', monospace", fontSize:11, fontWeight:700 }}>⚠ {vencidas.length}</div>}
            <Avatar initials={usuario.avatar} size={32} color={usuario.role==="owner"?"#E8622A":usuario.role==="assistant"?"#AF52DE":"#2A8CE8"}/>
            <button onClick={()=>setUsuario(null)} style={{ background:"none", border:"none", color:"#8E8E93", cursor:"pointer", fontSize:11, fontFamily:"'DM Mono', monospace" }}>salir</button>
            <button onClick={()=>{setEditTask(null);setShowModal(true);}} style={{ background:"#E8622A", border:"none", borderRadius:10, width:34, height:34, color:"#fff", fontSize:22, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 4px 15px rgba(232,98,42,0.4)" }}>+</button>
          </div>
        </div>

        {admin && (
          <div style={{ display:"flex", gap:8, marginBottom:14, overflowX:"auto" }}>
            {[{l:"ACTIVAS",v:pendientes.length,c:"#E8622A"},{l:"URGENTES",v:urgentes.length,c:"#FF9500"},{l:"VENCIDAS",v:vencidas.length,c:"#FF3B30"},{l:"MENSAJES",v:totalComentarios,c:"#2A8CE8"}].map(s=>(
              <div key={s.l} style={{ background:"#1C1C1E", borderRadius:10, padding:"8px 12px", border:"1px solid rgba(255,255,255,0.07)", flexShrink:0 }}>
                <div style={{ color:s.c, fontSize:20, fontWeight:700, fontFamily:"'DM Mono', monospace", lineHeight:1 }}>{s.v}</div>
                <div style={{ color:"#8E8E93", fontSize:9, fontFamily:"'DM Mono', monospace", letterSpacing:1 }}>{s.l}</div>
              </div>
            ))}
          </div>
        )}

        {!admin && (
          <div style={{ marginBottom:14 }}>
            <div style={{ background:"rgba(42,140,232,0.12)", border:"1px solid rgba(42,140,232,0.25)", borderRadius:8, padding:"6px 12px", color:"#2A8CE8", fontFamily:"'DM Mono', monospace", fontSize:11 }}>
              👷 {usuario.name} — puedes crear tareas y comentar en las tuyas
            </div>
          </div>
        )}

        <div style={{ display:"flex", gap:6 }}>
          <button onClick={()=>setVista("tareas")} style={tabS(vista==="tareas")}>TAREAS</button>
          {admin&&<button onClick={()=>setVista("equipo")} style={tabS(vista==="equipo")}>EQUIPO</button>}
          {admin&&<button onClick={()=>setVista("proyectos")} style={tabS(vista==="proyectos")}>PROYECTOS</button>}
        </div>
      </div>

      <div style={{ padding:"20px 16px" }}>
        {admin&&vista==="tareas"&&<AIBriefing tasks={tareas} currentUser={usuario}/>}

        {vista==="tareas"&&(
          <>
            <div style={{ display:"flex", gap:6, marginBottom:16, overflowX:"auto", paddingBottom:4 }}>
              {[["todas","TODAS"],["urgente","URGENTES"],["pendiente","PENDIENTES"],["listo","LISTAS"]].map(([f,l])=>(
                <button key={f} onClick={()=>setFiltro(f)} style={{...tabS(filtro===f),flexShrink:0,fontSize:11,padding:"6px 12px"}}>{l}</button>
              ))}
              {admin&&(
                <select value={filtroP} onChange={e=>setFiltroP(e.target.value)} style={{ background:filtroP!=="all"?"rgba(232,98,42,0.15)":"rgba(255,255,255,0.05)", border:`1px solid ${filtroP!=="all"?"#E8622A":"rgba(255,255,255,0.1)"}`, borderRadius:8, color:filtroP!=="all"?"#E8622A":"#8E8E93", padding:"6px 10px", fontSize:11, fontFamily:"'DM Mono', monospace", cursor:"pointer", flexShrink:0 }}>
                  <option value="all">TODOS LOS PROYECTOS</option>
                  {PROJECTS.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
            </div>
            {cargando ? <div style={{ textAlign:"center", color:"#8E8E93", padding:"40px 0", fontFamily:"'DM Mono', monospace", fontSize:13 }}>Cargando tareas...</div>
              : visibles.length===0 ? <div style={{ textAlign:"center", color:"#8E8E93", padding:"40px 0", fontFamily:"'DM Mono', monospace", fontSize:13 }}>Sin tareas. Toca + para crear una. 🏗</div>
              : visibles.sort((a,b)=>{ const o={urgente:0,alta:1,media:2,baja:3}; return(o[a.priority]-o[b.priority])||(daysUntil(a.due_date)-daysUntil(b.due_date)); })
                  .map(t=><TarjetaTarea key={t.id} task={t} currentUser={usuario} onCambiarEstado={cambiarEstado} onEditar={t=>{setEditTask(t);setShowModal(true);}} onAbrirChat={setChatTarea} commentCount={commentCounts[t.id]||0}/>)
            }
          </>
        )}

        {admin&&vista==="equipo"&&(
          <div>
            {USERS.map(m=>{
              const mt=tareas.filter(t=>t.assignee_id===m.id&&t.status!=="listo");
              const mo=mt.filter(t=>daysUntil(t.due_date)<0);
              return(
                <div key={m.id} style={{ background:"#1C1C1E", borderRadius:12, padding:16, marginBottom:12, border:"1px solid rgba(255,255,255,0.08)" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:10 }}>
                    <Avatar initials={m.avatar} size={42} color={mo.length>0?"#FF3B30":m.role==="owner"?"#E8622A":m.role==="assistant"?"#AF52DE":"#2A8CE8"}/>
                    <div style={{ flex:1 }}>
                      <div style={{ color:"#fff", fontWeight:700, fontSize:15, fontFamily:"'DM Mono', monospace" }}>{m.name}</div>
                      <div style={{ color:"#8E8E93", fontSize:11, fontFamily:"'DM Mono', monospace" }}>{m.role==="owner"?"👑 Director":m.role==="assistant"?"🤝 Asistente":"👷 Equipo"}</div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <div style={{ color:mo.length>0?"#FF3B30":"#E8622A", fontFamily:"'DM Mono', monospace", fontSize:20, fontWeight:700 }}>{mt.length}</div>
                      <div style={{ color:"#8E8E93", fontSize:9, fontFamily:"'DM Mono', monospace" }}>ABIERTAS</div>
                    </div>
                  </div>
                  {mt.length>0?mt.map(t=>(
                    <div key={t.id} style={{ background:"#2C2C2E", borderRadius:8, padding:"8px 12px", marginBottom:6, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <div><div style={{ color:"#E8E8E0", fontSize:13 }}>{t.title}</div><div style={{ color:"#8E8E93", fontSize:11, fontFamily:"'DM Mono', monospace" }}>{getProject(t.project_id)?.name}</div></div>
                      <FechaBadge due={t.due_date}/>
                    </div>
                  )):<div style={{ color:"#8E8E93", fontSize:12, fontFamily:"'DM Mono', monospace", textAlign:"center", padding:"6px 0" }}>✅ Sin pendientes</div>}
                </div>
              );
            })}
          </div>
        )}

        {admin&&vista==="proyectos"&&(
          <div>
            {PROJECTS.map(p=>{
              const pt=tareas.filter(t=>t.project_id===p.id);
              const pPen=pt.filter(t=>t.status!=="listo");
              const pOk=pt.filter(t=>t.status==="listo");
              const pct=pt.length>0?Math.round((pOk.length/pt.length)*100):0;
              return(
                <div key={p.id} style={{ background:"#1C1C1E", borderRadius:12, padding:16, marginBottom:12, border:`1px solid ${p.color}25`, borderLeft:`4px solid ${p.color}` }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                    <div style={{ color:"#fff", fontWeight:700, fontSize:15, fontFamily:"'DM Mono', monospace" }}>{p.name}</div>
                    <div style={{ color:p.color, fontFamily:"'DM Mono', monospace", fontSize:18, fontWeight:700 }}>{pct}%</div>
                  </div>
                  <div style={{ background:"rgba(255,255,255,0.05)", borderRadius:4, height:4, marginBottom:10 }}>
                    <div style={{ background:p.color, height:4, borderRadius:4, width:`${pct}%`, transition:"width 0.5s" }}/>
                  </div>
                  <div style={{ display:"flex", gap:12 }}>
                    <span style={{ color:"#8E8E93", fontSize:12, fontFamily:"'DM Mono', monospace" }}><span style={{ color:"#E8622A", fontWeight:700 }}>{pPen.length}</span> abiertas</span>
                    <span style={{ color:"#8E8E93", fontSize:12, fontFamily:"'DM Mono', monospace" }}><span style={{ color:"#34C759", fontWeight:700 }}>{pOk.length}</span> listas</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showModal&&<ModalTarea editTask={editTask} currentUser={usuario} onCerrar={()=>{setShowModal(false);setEditTask(null);}} onGuardar={guardarTarea}/>}
      {chatTarea&&<ChatTarea task={chatTarea} currentUser={usuario} onClose={()=>setChatTarea(null)}/>}
    </div>
  );
}
