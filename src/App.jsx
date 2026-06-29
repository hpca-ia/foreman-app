// ============================================================
//  FOREMAN + FINANCE  —  HCA Studio
//  Integración: Gestión de tareas + Control financiero de obra
// ============================================================

import { useState, useRef, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://qxoincfvscvbqvoxamdi.supabase.co";
const SUPABASE_KEY = "sb_publishable_UXB8WueKrn1zBSXfsTqJ0w_C61L3b77";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── DATOS BASE ─────────────────────────────────────────────
const USERS_DEFAULT = [
  { id: 1, name: "Hernan",     role: "owner",     pin: "1234", avatar: "HE", color: "#E8622A", email: "hc@hcastudio.com",  phone: "" },
  { id: 2, name: "Johanna",    role: "assistant",  pin: "2345", avatar: "JO", color: "#7C3AED", email: "jt@hcastudio.com",  phone: "+593987157905" },
  { id: 3, name: "Hector",     role: "member",     pin: "3001", avatar: "HC", color: "#2563EB", email: "", phone: "" },
  { id: 4, name: "Josh",       role: "member",     pin: "3002", avatar: "JS", color: "#2563EB", email: "", phone: "" },
  { id: 5, name: "Guillermo",  role: "member",     pin: "3003", avatar: "GU", color: "#2563EB", email: "", phone: "" },
  { id: 6, name: "Camila",     role: "member",     pin: "3004", avatar: "CA", color: "#2563EB", email: "", phone: "" },
  { id: 7, name: "Santiago",   role: "member",     pin: "3005", avatar: "SA", color: "#2563EB", email: "", phone: "" },
  { id: 8, name: "Gerardo",    role: "member",     pin: "3006", avatar: "GE", color: "#2563EB", email: "", phone: "" },
  { id: 9, name: "Luis Guala", role: "member",     pin: "3007", avatar: "LG", color: "#2563EB", email: "", phone: "" },
];

const PROJECTS_DEFAULT = [
  { id: 10, name: "Testing",           color: "#E8622A" },
  { id: 1,  name: "BdP Condado",       color: "#2563EB" },
  { id: 2,  name: "BdP Urdesa",        color: "#7C3AED" },
  { id: 3,  name: "BdP Banca Seguros", color: "#DB2777" },
  { id: 4,  name: "Fowler",            color: "#D97706" },
  { id: 5,  name: "Banderas",          color: "#059669" },
  { id: 6,  name: "Servipagos",        color: "#DC2626" },
  { id: 7,  name: "Zuleta",            color: "#0891B2" },
  { id: 8,  name: "La Quinta",         color: "#65A30D" },
  { id: 9,  name: "ManEugenia",        color: "#9333EA" },
];

const TIPOS = ["Llamada","Reunión","Contrato","Compra","Inspección","Aprobación","Visita a obra","Otro"];
const PRIORIDAD = {
  urgente:{ label:"Urgente", color:"#DC2626", bg:"#FEE2E2" },
  alta:   { label:"Alta",    color:"#D97706", bg:"#FEF3C7" },
  media:  { label:"Media",   color:"#059669", bg:"#D1FAE5" },
  baja:   { label:"Baja",    color:"#6B7280", bg:"#F3F4F6" },
};
const ESTADO = {
  pendiente:    { label:"Pendiente",   icon:"○", color:"#6B7280" },
  "en-progreso":{ label:"En progreso", icon:"◑", color:"#D97706" },
  listo:        { label:"Listo",       icon:"●", color:"#059669" },
  bloqueado:    { label:"Bloqueado",   icon:"✕", color:"#DC2626" },
};

// ── RUBROS FINANCIEROS DEFAULT ─────────────────────────────
const RUBROS_DEFAULT = [
  { id: "r1", nombre: "Obra Civil / Estructura",    presupuesto: 0, categoria: "Construcción" },
  { id: "r2", nombre: "Acabados",                    presupuesto: 0, categoria: "Construcción" },
  { id: "r3", nombre: "Instalaciones Eléctricas",    presupuesto: 0, categoria: "Instalaciones" },
  { id: "r4", nombre: "Instalaciones Sanitarias",    presupuesto: 0, categoria: "Instalaciones" },
  { id: "r5", nombre: "Mano de Obra",                presupuesto: 0, categoria: "RRHH" },
  { id: "r6", nombre: "Materiales",                  presupuesto: 0, categoria: "Materiales" },
  { id: "r7", nombre: "Equipos y Herramientas",      presupuesto: 0, categoria: "Equipos" },
  { id: "r8", nombre: "Honorarios Profesionales",    presupuesto: 0, categoria: "Servicios" },
  { id: "r9", nombre: "Transporte y Logística",      presupuesto: 0, categoria: "Logística" },
  { id:"r10", nombre: "Imprevistos",                  presupuesto: 0, categoria: "Reserva" },
];

// ── PERMISOS POR NIVEL ─────────────────────────────────────
// Nivel 1 (owner)     → todo: tareas + finanzas completo + ajustes
// Nivel 2 (assistant) → tareas + ver/registrar finanzas, SIN editar rubros ni ajustes
// Nivel 3 (member)    → solo tareas propias + registrar en caja chica
const can = (role) => ({
  // Tareas
  verTodasTareas:       role === "owner" || role === "assistant",
  crearTareas:          role === "owner" || role === "assistant",
  editarEliminarTareas: role === "owner",
  enviarWA:             role === "owner" || role === "assistant",
  verEquipo:            role === "owner" || role === "assistant",
  verProyectos:         role === "owner" || role === "assistant",
  usarNova:             role === "owner" || role === "assistant",
  // Finanzas
  verDashboardFinanzas: role === "owner" || role === "assistant",
  verPresupuesto:       role === "owner" || role === "assistant",
  editarPresupuesto:    role === "owner",
  verFacturas:          role === "owner" || role === "assistant",
  registrarFacturas:    role === "owner" || role === "assistant",
  verCotizaciones:      role === "owner" || role === "assistant",
  verCajaChica:         true,
  registrarGasto:       true,
  verReporteCaja:       role === "owner" || role === "assistant",
  // Sistema
  verAjustes:           role === "owner",
});

function rolBadge(role) {
  return role === "owner"     ? { label: "Nivel 1", bg: "#FFF4F0", color: "#E8622A" }
       : role === "assistant" ? { label: "Nivel 2", bg: "#EDE9FE", color: "#7C3AED" }
       :                        { label: "Nivel 3", bg: "#EFF6FF", color: "#2563EB" };
}

function AccesoDenegado({ mensaje }) {
  return (
    <div style={{ textAlign: "center", padding: "60px 20px", color: "#9CA3AF" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Sin acceso</div>
      <div style={{ fontSize: 12 }}>{mensaje || "No tienes permiso para ver esta sección."}</div>
    </div>
  );
}

// ── HELPERS ────────────────────────────────────────────────
const esAdmin = role => role === "owner" || role === "assistant";
const fmt = n => new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n || 0);
const pct = (v, t) => t > 0 ? Math.min(100, Math.round((v / t) * 100)) : 0;

function loadFromStorage(key, fallback) {
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : fallback; } catch { return fallback; }
}
function saveToStorage(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}
function daysUntil(d) {
  const t = new Date(); t.setHours(0,0,0,0);
  return Math.ceil((new Date(d) - t) / 86400000);
}
function initials(name) {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function Avatar({ name, size = 32, color = "#E8622A" }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.32, fontWeight: 700, flexShrink: 0 }}>
      {initials(name || "?")}
    </div>
  );
}

function FechaBadge({ due, status }) {
  if (status === "listo") return null;
  const d = daysUntil(due);
  const s = { fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20 };
  if (d < 0)  return <span style={{ ...s, color: "#DC2626", background: "#FEE2E2" }}>Vencida {Math.abs(d)}d</span>;
  if (d === 0) return <span style={{ ...s, color: "#D97706", background: "#FEF3C7" }}>Hoy</span>;
  if (d <= 2)  return <span style={{ ...s, color: "#D97706", background: "#FEF3C7", fontWeight: 500 }}>en {d}d</span>;
  return <span style={{ ...s, color: "#6B7280", background: "#F3F4F6", fontWeight: 400 }}>en {d}d</span>;
}

// ── LOGIN ──────────────────────────────────────────────────
function LoginScreen({ onLogin, users }) {
  const [sel, setSel] = useState(null);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [step, setStep] = useState("pick");

  useEffect(() => {
    try {
      const s = localStorage.getItem("foreman_session");
      if (s) { const { userId, expires } = JSON.parse(s); if (new Date(expires) > new Date()) { const u = users.find(u => u.id === userId); if (u) onLogin(u); } }
    } catch {}
  }, []);

  function selectUser(u) { setSel(u); setPin(""); setErr(""); setStep("pin"); }

  function handlePin(d) {
    if (pin.length >= 4) return;
    const n = pin + d; setPin(n);
    if (n.length === 4) {
      setTimeout(() => {
        if (n === sel.pin) {
          const exp = new Date(); exp.setDate(exp.getDate() + 7);
          saveToStorage("foreman_session", { userId: sel.id, expires: exp.toISOString() });
          onLogin(sel);
        } else { setErr("PIN incorrecto"); setPin(""); }
      }, 200);
    }
  }

  const btnS = { width: "100%", background: "#fff", border: "1.5px solid #E5E7EB", borderRadius: 12, padding: "12px 16px", marginBottom: 8, display: "flex", alignItems: "center", gap: 14, cursor: "pointer", transition: "all 0.15s", fontFamily: "'Inter',sans-serif" };

  return (
    <div style={{ minHeight: "100vh", background: "#F8F9FB", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');*{box-sizing:border-box}@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
      <div style={{ marginBottom: 32, textAlign: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 0, marginBottom: 10 }}>
          <div style={{ width: 10, height: 28, background: "#E8622A", borderRadius: "4px 0 0 4px" }} />
          <div style={{ width: 10, height: 28, background: "#FF9500" }} />
          <div style={{ width: 10, height: 28, background: "#FFD60A", borderRadius: "0 4px 4px 0", marginRight: 8 }} />
          <span style={{ color: "#1F2937", fontSize: 22, fontWeight: 700, fontFamily: "'Inter',sans-serif", letterSpacing: 0.5 }}>FOREMAN</span>
          <span style={{ background: "#F3F4F6", color: "#9CA3AF", fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 4, marginLeft: 6 }}>BETA</span>
        </div>
        <div style={{ fontSize: 12, color: "#9CA3AF", fontFamily: "'Inter',sans-serif" }}>Gestión de Obra · Sesión guardada 7 días</div>
      </div>
      {step === "pick" && (
        <div style={{ width: "100%", maxWidth: 400 }}>
          <div style={{ fontSize: 10, color: "#9CA3AF", fontFamily: "'Inter',sans-serif", letterSpacing: 1, marginBottom: 10, textAlign: "center", fontWeight: 600 }}>SELECCIONA TU PERFIL</div>
          {users.map(u => (
            <button key={u.id} onClick={() => selectUser(u)} style={btnS}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#E8622A"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(232,98,42,0.1)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#E5E7EB"; e.currentTarget.style.boxShadow = "none"; }}>
              <Avatar name={u.name} size={40} color={u.color || "#2563EB"} />
              <div style={{ textAlign: "left" }}>
                <div style={{ color: "#111", fontSize: 15, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>{u.name}</div>
                <div style={{ color: "#9CA3AF", fontSize: 12, fontFamily: "'Inter',sans-serif" }}>
                  {u.role === "owner" ? "👑 Director" : u.role === "assistant" ? "🤝 Asistente" : "👷 Equipo"}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                {(() => { const b = rolBadge(u.role); return <span style={{ background: b.bg, color: b.color, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20 }}>{b.label}</span>; })()}
                <div style={{ color: "#D1D5DB", fontSize: 18 }}>›</div>
              </div>
            </button>
          ))}
        </div>
      )}
      {step === "pin" && sel && (
        <div style={{ width: "100%", maxWidth: 280, textAlign: "center", fontFamily: "'Inter',sans-serif" }}>
          <button onClick={() => { setStep("pick"); setErr(""); }} style={{ background: "none", border: "none", color: "#9CA3AF", cursor: "pointer", fontSize: 13, marginBottom: 20, display: "flex", alignItems: "center", gap: 4, margin: "0 auto 20px" }}>← Volver</button>
          <Avatar name={sel.name} size={60} color={sel.color || "#E8622A"} />
          <div style={{ color: "#111", fontSize: 18, fontWeight: 700, marginTop: 12 }}>{sel.name}</div>
          <div style={{ color: "#9CA3AF", fontSize: 13, marginBottom: 28, marginTop: 6 }}>Ingresa tu PIN</div>
          <div style={{ display: "flex", justifyContent: "center", gap: 16, marginBottom: 28 }}>
            {[0, 1, 2, 3].map(i => <div key={i} style={{ width: 12, height: 12, borderRadius: "50%", background: pin.length > i ? "#E8622A" : "#E5E7EB", transition: "background 0.15s" }} />)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, maxWidth: 220, margin: "0 auto" }}>
            {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((d, i) => (
              <button key={i} onClick={() => { if (d === "⌫") setPin(p => p.slice(0, -1)); else if (d !== "") handlePin(d); }}
                style={{ background: d === "" ? "transparent" : "#fff", border: d === "" ? "none" : "1.5px solid #E5E7EB", borderRadius: 12, height: 54, color: "#111", fontSize: 18, fontWeight: 500, cursor: d === "" ? "default" : "pointer", fontFamily: "'Inter',sans-serif", transition: "all 0.1s" }}
                onMouseEnter={e => { if (d !== "") { e.currentTarget.style.background = "#FFF7F0"; e.currentTarget.style.borderColor = "#E8622A"; } }}
                onMouseLeave={e => { if (d !== "") { e.currentTarget.style.background = "#fff"; e.currentTarget.style.borderColor = "#E5E7EB"; } }}
              >{d}</button>
            ))}
          </div>
          {err && <div style={{ color: "#DC2626", fontSize: 12, marginTop: 14 }}>{err}</div>}
        </div>
      )}
    </div>
  );
}

// ── NOVA INPUT ─────────────────────────────────────────────
function NovaInput({ currentUser, projects, users, onTaskCreated }) {
  const [texto, setTexto] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [grabando, setGrabando] = useState(false);

  function startVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Usa Chrome para dictado."); return; }
    const r = new SR(); r.lang = "es-ES"; r.continuous = false; r.interimResults = false;
    r.onresult = e => { setTexto(e.results[0][0].transcript); setGrabando(false); };
    r.onerror = () => setGrabando(false); r.onend = () => setGrabando(false);
    r.start(); setGrabando(true);
  }

  async function procesar() {
    if (!texto.trim()) return;
    setLoading(true); setResult(null);
    const proyList = projects.map(p => `${p.id}=${p.name}`).join(",");
    const userList = users.map(u => `${u.id}=${u.name}`).join(",");
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6", max_tokens: 500,
          system: `Eres NOVA. Extrae datos y responde SOLO JSON sin markdown:
{"title":"...","project_id":N,"assignee_id":N_OR_NULL,"type":"...","due_date":"YYYY-MM-DD","priority":"urgente|alta|media|baja","notes":"..."}
Proyectos: ${proyList}. Usuarios: ${userList}.
Tipos: Llamada,Reunión,Contrato,Compra,Inspección,Aprobación,Visita a obra,Otro.
Hoy: ${new Date().toISOString().split("T")[0]}.`,
          messages: [{ role: "user", content: texto }]
        })
      });
      const data = await res.json();
      const t = data.content?.[0]?.text || "{}";
      setResult(JSON.parse(t.replace(/```json|```/g, "").trim()));
    } catch { setResult({ error: "No pude entender. Intenta de nuevo." }); }
    setLoading(false);
  }

  async function confirmar() {
    if (!result || result.error) return;
    await supabase.from("tasks").insert({ ...result, created_by: currentUser.id });
    setTexto(""); setResult(null); onTaskCreated();
  }

  const gP = id => projects.find(p => p.id === id);
  const gU = id => users.find(u => u.id === id);

  return (
    <div style={{ background: "#fff", border: "1.5px solid #FED7AA", borderRadius: 12, padding: 14, marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <NovaIcon size={24} />
        <span style={{ fontSize: 13, fontWeight: 600, color: "#E8622A" }}>NOVA — Crear tarea</span>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <input value={texto} onChange={e => setTexto(e.target.value)} onKeyDown={e => e.key === "Enter" && procesar()} placeholder='"Inspección BdP Condado con Hector, urgente mañana"'
          style={{ flex: 1, background: "#FFF7F0", border: "1.5px solid #FED7AA", borderRadius: 8, color: "#111", fontSize: 13, fontFamily: "'Inter',sans-serif", padding: "8px 12px", outline: "none" }} />
        <button onClick={startVoice} style={{ width: 36, background: grabando ? "#FEE2E2" : "#FFF7F0", border: `1.5px solid ${grabando ? "#DC2626" : "#FED7AA"}`, borderRadius: 8, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>🎤</button>
        <button onClick={procesar} disabled={!texto.trim() || loading} style={{ background: texto.trim() && !loading ? "#E8622A" : "#F3F4F6", border: "none", borderRadius: 8, padding: "8px 14px", color: texto.trim() && !loading ? "#fff" : "#9CA3AF", fontSize: 12, fontWeight: 600, cursor: texto.trim() && !loading ? "pointer" : "default", fontFamily: "'Inter',sans-serif", whiteSpace: "nowrap" }}>
          {loading ? "..." : "Crear →"}
        </button>
      </div>
      {result && !result.error && (
        <div style={{ background: "#F0FDF4", border: "1.5px solid #BBF7D0", borderRadius: 8, padding: 10 }}>
          <div style={{ fontSize: 11, color: "#059669", fontWeight: 600, marginBottom: 4 }}>✓ NOVA entendió:</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#111", marginBottom: 2 }}>{result.title}</div>
          <div style={{ fontSize: 11, color: "#6B7280" }}>{gP(result.project_id)?.name} · {result.assignee_id ? gU(result.assignee_id)?.name : "Sin asignar"} · {result.due_date} · {result.priority}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button onClick={() => setResult(null)} style={{ flex: 1, background: "#fff", border: "1.5px solid #E5E7EB", borderRadius: 6, padding: 6, color: "#6B7280", fontSize: 12, cursor: "pointer" }}>Cancelar</button>
            <button onClick={confirmar} style={{ flex: 2, background: "#059669", border: "none", borderRadius: 6, padding: 6, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>✓ Confirmar</button>
          </div>
        </div>
      )}
      {result?.error && <div style={{ color: "#DC2626", fontSize: 12, marginTop: 6 }}>{result.error}</div>}
    </div>
  );
}

// ── NOVA ICON ──────────────────────────────────────────────
function NovaIcon({ size = 26 }) {
  return (
    <div style={{ width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox="0 0 80 80">
        <circle cx="40" cy="40" r="38" fill="#1F2937" />
        <text x="40" y="55" textAnchor="middle" fontFamily="Inter,sans-serif" fontSize="40" fontWeight="700" fill="#E8622A">N</text>
        <circle cx="58" cy="20" r="10" fill="#E8622A" />
      </svg>
    </div>
  );
}

// ── WHATSAPP ───────────────────────────────────────────────
function WhatsApp({ task, users, projects }) {
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const gU = id => users.find(u => u.id === id);
  const gP = id => projects.find(p => p.id === id);
  const m = task.assignee_id ? gU(task.assignee_id) : null;
  const p = gP(task.project_id);
  const d = daysUntil(task.due_date);

  async function generar() {
    setLoading(true); setOpen(true);
    const vence = task.status === "listo" ? "está completada" : d < 0 ? `tiene ${Math.abs(d)} días de retraso` : d === 0 ? "vence HOY" : `vence en ${d} días`;
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 300, system: "Recordatorio WhatsApp para director de construcción. Español. Máx 3 oraciones. Directo. Solo el mensaje.", messages: [{ role: "user", content: `Para ${m?.name || "equipo"}: "${task.title}" en ${p?.name}. ${vence}. Prioridad: ${task.priority}.` }] }) });
      const data = await res.json(); setMsg(data.content?.[0]?.text || "");
    } catch { setMsg("Error."); }
    setLoading(false);
  }

  return (
    <>
      <button onClick={generar} style={{ background: "#22C55E", border: "none", borderRadius: 6, padding: "5px 10px", color: "#fff", fontSize: 11, fontFamily: "'Inter',sans-serif", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>📲 WA</button>
      {open && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: 20 }} onClick={() => setOpen(false)}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 20, maxWidth: 400, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.15)", fontFamily: "'Inter',sans-serif" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 22 }}>📲</span>
              <div><div style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>WhatsApp</div>{m && <div style={{ color: "#6B7280", fontSize: 12 }}>{m.name}</div>}</div>
              <button onClick={() => setOpen(false)} style={{ marginLeft: "auto", background: "none", border: "none", color: "#9CA3AF", cursor: "pointer", fontSize: 20 }}>×</button>
            </div>
            {loading ? <div style={{ color: "#9CA3AF", fontSize: 12, padding: "16px 0", textAlign: "center" }}>NOVA redactando...</div> : (
              <>
                <textarea value={msg} onChange={e => setMsg(e.target.value)} style={{ width: "100%", minHeight: 90, background: "#F9FAFB", border: "1.5px solid #E5E7EB", borderRadius: 10, color: "#111", fontSize: 13, fontFamily: "'Inter',sans-serif", padding: 10, resize: "vertical", boxSizing: "border-box", lineHeight: 1.5, outline: "none" }} />
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button onClick={generar} style={{ flex: 1, background: "#F9FAFB", border: "1.5px solid #E5E7EB", borderRadius: 8, padding: 8, color: "#6B7280", fontSize: 12, cursor: "pointer" }}>↺</button>
                  {m ? <button onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank")} style={{ flex: 2, background: "#22C55E", border: "none", borderRadius: 8, padding: 8, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Abrir WhatsApp →</button>
                    : <div style={{ flex: 2, color: "#9CA3AF", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>Sin asignado</div>}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ── TARJETA TAREA ──────────────────────────────────────────
function TarjetaTarea({ task, currentUser, users, projects, onCambiarEstado, onEditar, onEliminar, commentCount }) {
  const perms = can(currentUser.role);
  const proy = projects.find(p => p.id === task.project_id);
  const asig = task.assignee_id ? users.find(u => u.id === task.assignee_id) : null;
  const crea = users.find(u => u.id === task.created_by);
  const pC = PRIORIDAD[task.priority] || PRIORIDAD.media;
  const eC = ESTADO[task.status] || ESTADO.pendiente;
  const esMiTarea = task.assignee_id === currentUser.id;
  const puedeCambiar = perms.verTodasTareas || esMiTarea;
  const esListo = task.status === "listo";

  return (
    <div style={{ background: "#fff", border: "1px solid #F0F1F3", borderRadius: 10, padding: "10px 12px", marginBottom: 6, borderLeft: `3px solid ${proy?.color || "#E8622A"}`, opacity: esListo ? 0.6 : 1, fontFamily: "'Inter',sans-serif", boxShadow: "0 1px 2px rgba(0,0,0,0.03)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 5 }}>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ background: pC.bg, color: pC.color, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20 }}>{pC.label}</span>
          <span style={{ background: "#F3F4F6", color: "#6B7280", fontSize: 11, padding: "2px 8px", borderRadius: 20 }}>{task.type}</span>
          <span style={{ color: eC.color, fontSize: 11 }}>{eC.icon} {eC.label}</span>
        </div>
        <FechaBadge due={task.due_date} status={task.status} />
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#111", marginBottom: task.notes ? 4 : 6, lineHeight: 1.3 }}>{task.title}</div>
      {task.notes && <div style={{ color: "#6B7280", fontSize: 12, marginBottom: 8, lineHeight: 1.5 }}>{task.notes}</div>}
      <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", marginBottom: 6 }}>
        <span style={{ background: `${proy?.color}18`, color: proy?.color, fontSize: 11, padding: "2px 8px", borderRadius: 20, fontWeight: 600 }}>{proy?.name}</span>
        {asig ? <div style={{ display: "flex", alignItems: "center", gap: 4 }}><Avatar name={asig.name} size={18} color={asig.color || proy?.color} /><span style={{ color: "#374151", fontSize: 12 }}>{asig.name}</span></div>
          : <span style={{ color: "#DC2626", fontSize: 11 }}>⚠ Sin asignar</span>}
        {crea && <span style={{ color: "#D1D5DB", fontSize: 10 }}>por {crea.name}</span>}
      </div>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center", paddingTop: 6, borderTop: "1px solid #F3F4F6", marginTop: 4 }}>
        {puedeCambiar && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {Object.entries(ESTADO).map(([k, v]) => (
              <button key={k} onClick={() => onCambiarEstado(task.id, k)}
                style={{ background: task.status === k ? v.color : "#F3F4F6", border: `1px solid ${task.status === k ? v.color : "#E5E7EB"}`, borderRadius: 6, padding: "4px 8px", color: task.status === k ? "#fff" : "#6B7280", fontSize: 10, fontWeight: task.status === k ? 600 : 400, cursor: "pointer", fontFamily: "'Inter',sans-serif", whiteSpace: "nowrap" }}>
                {v.icon} {v.label}
              </button>
            ))}
          </div>
        )}
        {perms.enviarWA && <WhatsApp task={task} users={users} projects={projects} />}
        {perms.editarEliminarTareas && <button onClick={() => onEditar(task)} style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 6, padding: "5px 10px", color: "#6B7280", fontSize: 11, cursor: "pointer" }}>✏️</button>}
        {perms.editarEliminarTareas && <button onClick={() => onEliminar(task.id)} style={{ background: "#FEE2E2", border: "1px solid #FECACA", borderRadius: 6, padding: "5px 10px", color: "#DC2626", fontSize: 11, cursor: "pointer" }}>🗑</button>}
      </div>
    </div>
  );
}

// ── MODAL TAREA ────────────────────────────────────────────
function ModalTarea({ onCerrar, onGuardar, editTask, currentUser, users, projects }) {
  const [form, setForm] = useState(editTask ? {
    title: editTask.title, project_id: editTask.project_id, assignee_id: editTask.assignee_id,
    type: editTask.type, due_date: editTask.due_date, priority: editTask.priority,
    status: editTask.status, notes: editTask.notes || ""
  } : { title: "", project_id: projects[0]?.id || 1, assignee_id: currentUser.id, type: "Llamada", due_date: "", priority: "media", status: "pendiente", notes: "" });
  const inp = (f, v) => setForm(p => ({ ...p, [f]: v }));
  const lS = { color: "#6B7280", fontSize: 11, fontWeight: 500, marginBottom: 4, display: "block" };
  const iS = { width: "100%", background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 8, color: "#111", padding: "9px 12px", fontSize: 13, fontFamily: "'Inter',sans-serif", boxSizing: "border-box", outline: "none" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 150, padding: 20 }} onClick={onCerrar}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 22, maxWidth: 480, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.12)", maxHeight: "90vh", overflowY: "auto", fontFamily: "'Inter',sans-serif" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#111" }}>{editTask ? "Editar tarea" : "Nueva tarea"}</div>
          <button onClick={onCerrar} style={{ background: "#F3F4F6", border: "none", borderRadius: 6, width: 28, height: 28, color: "#6B7280", cursor: "pointer", fontSize: 15 }}>×</button>
        </div>
        <div style={{ display: "grid", gap: 12 }}>
          <div><label style={lS}>Título *</label><input value={form.title} onChange={e => inp("title", e.target.value)} placeholder="¿Qué hay que hacer?" style={iS} /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><label style={lS}>Proyecto</label><select value={form.project_id} onChange={e => inp("project_id", Number(e.target.value))} style={iS}>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
            <div><label style={lS}>Tipo</label><select value={form.type} onChange={e => inp("type", e.target.value)} style={iS}>{TIPOS.map(t => <option key={t}>{t}</option>)}</select></div>
            <div><label style={lS}>Asignar a</label><select value={form.assignee_id || ""} onChange={e => inp("assignee_id", e.target.value ? Number(e.target.value) : null)} style={iS}><option value="">Sin asignar</option>{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
            <div><label style={lS}>Prioridad</label><select value={form.priority} onChange={e => inp("priority", e.target.value)} style={iS}>{Object.entries(PRIORIDAD).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
          </div>
          <div><label style={lS}>Fecha límite *</label><input type="date" value={form.due_date} onChange={e => inp("due_date", e.target.value)} style={iS} /></div>
          <div><label style={lS}>Notas</label><textarea value={form.notes} onChange={e => inp("notes", e.target.value)} placeholder="Proveedor, contacto, contexto..." style={{ ...iS, minHeight: 60, resize: "vertical" }} /></div>
        </div>
        {(!form.title || !form.due_date) ? <div style={{ color: "#9CA3AF", fontSize: 11, marginTop: 12, textAlign: "center" }}>Completa título y fecha</div>
          : <button onClick={() => { onGuardar(form, editTask?.id); onCerrar(); }} style={{ width: "100%", marginTop: 16, background: "#E8622A", border: "none", borderRadius: 10, padding: 12, color: "#fff", fontFamily: "'Inter',sans-serif", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            {editTask ? "Guardar cambios" : "Agregar tarea"}
          </button>}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
//  MÓDULO FINANCIERO
// ══════════════════════════════════════════════════════════

// ── PRESUPUESTO ────────────────────────────────────────────
function ModuloPresupuesto({ proyectoId, proyectos, currentUser }) {
  const perms = can(currentUser?.role || "member");
  const storKey = `fin_rubros_${proyectoId}`;
  const [rubros, setRubros] = useState(() => loadFromStorage(storKey, RUBROS_DEFAULT.map(r => ({ ...r }))));
  const [facturas, setFacturas] = useState(() => loadFromStorage(`fin_facturas_${proyectoId}`, []));
  const [editandoRubro, setEditandoRubro] = useState(null);
  const [newRubro, setNewRubro] = useState(false);
  const [tab, setTab] = useState("presupuesto");
  const [novaSugiriendo, setNovaSugiriendo] = useState(false);
  const [novaResultado, setNovaResultado] = useState(null);

  // Factura form state
  const [factForm, setFactForm] = useState({ proveedor: "", numero: "", monto: "", fecha: new Date().toISOString().split("T")[0], rubroId: "", descripcion: "", tipo: "factura" });

  function saveRubros(updated) { setRubros(updated); saveToStorage(storKey, updated); }
  function saveFacturas(updated) { setFacturas(updated); saveToStorage(`fin_facturas_${proyectoId}`, updated); }

  const totalPresupuesto = rubros.reduce((s, r) => s + Number(r.presupuesto || 0), 0);
  const totalEjecutado = (id) => facturas.filter(f => f.rubroId === id).reduce((s, f) => s + Number(f.monto || 0), 0);
  const totalGastado = rubros.reduce((s, r) => s + totalEjecutado(r.id), 0);
  const saldoGlobal = totalPresupuesto - totalGastado;

  function getRubroById(id) { return rubros.find(r => r.id === id); }

  async function clasificarConNova(descripcion) {
    setNovaSugiriendo(true); setNovaResultado(null);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6", max_tokens: 200,
          system: `Clasifica esta factura en uno de estos rubros de construcción y responde SOLO JSON:
{"rubroId":"...", "razon":"..."}
Rubros disponibles: ${rubros.map(r => `${r.id}=${r.nombre}`).join(", ")}`,
          messages: [{ role: "user", content: `Factura/cotización: ${descripcion}` }]
        })
      });
      const data = await res.json();
      const t = data.content?.[0]?.text || "{}";
      setNovaResultado(JSON.parse(t.replace(/```json|```/g, "").trim()));
    } catch { setNovaResultado({ error: "No pude clasificar." }); }
    setNovaSugiriendo(false);
  }

  function agregarFactura() {
    if (!factForm.proveedor || !factForm.monto || !factForm.rubroId) return;
    const nueva = { ...factForm, id: Date.now(), monto: Number(factForm.monto), proyectoId, creadaEn: new Date().toISOString() };
    saveFacturas([nueva, ...facturas]);
    setFactForm({ proveedor: "", numero: "", monto: "", fecha: new Date().toISOString().split("T")[0], rubroId: "", descripcion: "", tipo: "factura" });
    setNovaResultado(null);
  }

  function eliminarFactura(id) { if (window.confirm("¿Eliminar esta factura?")) saveFacturas(facturas.filter(f => f.id !== id)); }

  const tabS = a => ({ padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer", fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 600, background: a ? "#E8622A" : "transparent", color: a ? "#fff" : "#6B7280" });
  const iS = { width: "100%", background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 8, color: "#111", padding: "8px 10px", fontSize: 13, fontFamily: "'Inter',sans-serif", boxSizing: "border-box", outline: "none" };

  const proy = proyectos.find(p => p.id === proyectoId);

  return (
    <div style={{ fontFamily: "'Inter',sans-serif" }}>
      {/* Header proyecto */}
      <div style={{ background: "#fff", borderRadius: 12, padding: "14px 16px", marginBottom: 14, border: "1px solid #F0F1F3", borderLeft: `4px solid ${proy?.color || "#E8622A"}` }}>
        <div style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 600, marginBottom: 2 }}>PROYECTO</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#111", marginBottom: 12 }}>{proy?.name}</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {[
            { l: "Presupuesto", v: fmt(totalPresupuesto), c: "#374151" },
            { l: "Ejecutado", v: fmt(totalGastado), c: totalGastado > totalPresupuesto ? "#DC2626" : "#D97706" },
            { l: "Disponible", v: fmt(saldoGlobal), c: saldoGlobal < 0 ? "#DC2626" : "#059669" },
            { l: "Avance", v: `${pct(totalGastado, totalPresupuesto)}%`, c: "#E8622A" },
          ].map(s => (
            <div key={s.l} style={{ background: "#F9FAFB", borderRadius: 8, padding: "8px 14px", textAlign: "center", flex: 1, minWidth: 80 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: s.c }}>{s.v}</div>
              <div style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600 }}>{s.l}</div>
            </div>
          ))}
        </div>
        {totalPresupuesto > 0 && (
          <div style={{ marginTop: 10, background: "#F3F4F6", borderRadius: 4, height: 6 }}>
            <div style={{ background: totalGastado > totalPresupuesto ? "#DC2626" : proy?.color || "#E8622A", height: 6, borderRadius: 4, width: `${Math.min(100, pct(totalGastado, totalPresupuesto))}%`, transition: "width 0.5s" }} />
          </div>
        )}
      </div>

      {/* RUBROS */}
      <div>
          {rubros.map(r => {
            const ejec = totalEjecutado(r.id);
            const saldo = Number(r.presupuesto || 0) - ejec;
            const avance = pct(ejec, Number(r.presupuesto || 0));
            const enRojo = Number(r.presupuesto || 0) > 0 && ejec > Number(r.presupuesto || 0);
            return (
              <div key={r.id} style={{ background: "#fff", borderRadius: 10, padding: "10px 12px", marginBottom: 8, border: `1px solid ${enRojo ? "#FECACA" : "#F0F1F3"}`, borderLeft: `3px solid ${enRojo ? "#DC2626" : "#059669"}` }}>
                {editandoRubro?.id === r.id ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    <input value={editandoRubro.nombre} onChange={e => setEditandoRubro(p => ({ ...p, nombre: e.target.value }))} style={iS} placeholder="Nombre del rubro" />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <input value={editandoRubro.categoria} onChange={e => setEditandoRubro(p => ({ ...p, categoria: e.target.value }))} style={iS} placeholder="Categoría" />
                      <input type="number" value={editandoRubro.presupuesto} onChange={e => setEditandoRubro(p => ({ ...p, presupuesto: e.target.value }))} style={iS} placeholder="Presupuesto USD" />
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => { saveRubros(rubros.map(x => x.id === editandoRubro.id ? { ...editandoRubro, presupuesto: Number(editandoRubro.presupuesto) } : x)); setEditandoRubro(null); }} style={{ flex: 2, background: "#059669", border: "none", borderRadius: 6, padding: 8, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Guardar</button>
                      <button onClick={() => setEditandoRubro(null)} style={{ flex: 1, background: "#F3F4F6", border: "none", borderRadius: 6, padding: 8, color: "#6B7280", fontSize: 12, cursor: "pointer" }}>Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>{r.nombre}</div>
                        <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 1 }}>{r.categoria}</div>
                      </div>
                      <button onClick={() => setEditandoRubro({ ...r })} style={{ background: "none", border: "none", color: "#9CA3AF", cursor: "pointer", fontSize: 12 }}>✏️</button>
                    </div>
                    <div style={{ display: "flex", gap: 12, marginBottom: 6, flexWrap: "wrap" }}>
                      <div><div style={{ fontSize: 11, color: "#9CA3AF" }}>Presupuesto</div><div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{fmt(r.presupuesto)}</div></div>
                      <div><div style={{ fontSize: 11, color: "#9CA3AF" }}>Ejecutado</div><div style={{ fontSize: 13, fontWeight: 600, color: enRojo ? "#DC2626" : "#D97706" }}>{fmt(ejec)}</div></div>
                      <div><div style={{ fontSize: 11, color: "#9CA3AF" }}>Disponible</div><div style={{ fontSize: 13, fontWeight: 700, color: saldo < 0 ? "#DC2626" : "#059669" }}>{fmt(saldo)}</div></div>
                    </div>
                    {Number(r.presupuesto) > 0 && (
                      <div style={{ background: "#F3F4F6", borderRadius: 4, height: 4 }}>
                        <div style={{ background: enRojo ? "#DC2626" : "#059669", height: 4, borderRadius: 4, width: `${Math.min(100, avance)}%` }} />
                      </div>
                    )}
                    {enRojo && <div style={{ fontSize: 10, color: "#DC2626", marginTop: 4, fontWeight: 600 }}>⚠ Rubro excedido en {fmt(Math.abs(saldo))}</div>}
                  </>
                )}
              </div>
            );
          })}
          {perms.editarPresupuesto && (newRubro ? (
            <RubroForm onSave={r => { saveRubros([...rubros, { ...r, id: `r${Date.now()}` }]); setNewRubro(false); }} onCancel={() => setNewRubro(false)} iS={iS} />
          ) : (
            <button onClick={() => setNewRubro(true)} style={{ width: "100%", background: "#F9FAFB", border: "1.5px dashed #E5E7EB", borderRadius: 10, padding: 10, color: "#6B7280", fontSize: 13, cursor: "pointer", fontWeight: 500 }}>+ Agregar rubro</button>
          ))}
          {!perms.editarPresupuesto && (
            <div style={{ background: "#F9FAFB", borderRadius: 8, padding: "8px 12px", border: "1px dashed #E5E7EB", textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "#9CA3AF" }}>🔒 Solo el Director (Nivel 1) puede agregar o editar rubros</div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
// ── COTIZACIONES ───────────────────────────────────────────
function ModuloFacturas({ proyectoId, currentUser }) {
  const rubros = loadFromStorage(`fin_rubros_${proyectoId}`, RUBROS_DEFAULT);
  const [facturas, setFacturas] = useState(() => loadFromStorage(`fin_facturas_${proyectoId}`, []));
  const [form, setForm] = useState({ proveedor: "", numero: "", monto: "", fecha: new Date().toISOString().split("T")[0], rubroId: "", descripcion: "" });
  const [clasificando, setClasificando] = useState(false);
  const [sugerencia, setSugerencia] = useState(null);
  const perms = can(currentUser?.role || "member");
  const iS = { width: "100%", background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 8, color: "#111", padding: "8px 10px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", outline: "none" };
  function save(u) { setFacturas(u); saveToStorage(`fin_facturas_${proyectoId}`, u); }
  async function clasificar() {
    if (!form.descripcion) return;
    setClasificando(true); setSugerencia(null);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 200, system: "Clasifica en rubro construccion. Solo JSON sin markdown: {rubroId, razon}. Rubros: " + rubros.map(r => r.id+"="+r.nombre).join(", "), messages: [{ role: "user", content: form.descripcion }] }) });
      const data = await res.json();
      setSugerencia(JSON.parse((data.content?.[0]?.text||"{}").replace(/```json|```/g,"").trim()));
    } catch {}
    setClasificando(false);
  }
  function agregar() {
    if (!form.proveedor || !form.monto || !form.rubroId) return;
    save([{ ...form, id: Date.now(), monto: Number(form.monto), creadaEn: new Date().toISOString() }, ...facturas]);
    setForm({ proveedor: "", numero: "", monto: "", fecha: new Date().toISOString().split("T")[0], rubroId: "", descripcion: "" });
    setSugerencia(null);
  }
  return (
    <div>
      {perms.registrarFacturas && (
        <div style={{ background: "#fff", border: "1.5px solid #E5E7EB", borderRadius: 12, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>🧾 Registrar factura</div>
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div><label style={{ fontSize: 11, color: "#6B7280", fontWeight: 500, display: "block", marginBottom: 3 }}>Proveedor *</label><input value={form.proveedor} onChange={e => setForm(p => ({...p,proveedor:e.target.value}))} style={iS} placeholder="Proveedor" /></div>
              <div><label style={{ fontSize: 11, color: "#6B7280", fontWeight: 500, display: "block", marginBottom: 3 }}>Monto USD *</label><input type="number" value={form.monto} onChange={e => setForm(p => ({...p,monto:e.target.value}))} style={iS} placeholder="0.00" /></div>
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#6B7280", fontWeight: 500, display: "block", marginBottom: 3 }}>Descripción</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={form.descripcion} onChange={e => setForm(p => ({...p,descripcion:e.target.value}))} style={{...iS,flex:1}} placeholder="¿Qué incluye?" />
                <button onClick={clasificar} disabled={clasificando} style={{ background: "#1F2937", border: "none", borderRadius: 6, padding: "8px 12px", color: "#E8622A", fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                  <NovaIcon size={14}/>{clasificando?"...":"Clasificar"}
                </button>
              </div>
              {sugerencia && !sugerencia.error && (
                <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 8, padding: "8px 10px", marginTop: 6 }}>
                  <div style={{ fontSize: 11, color: "#059669", fontWeight: 600 }}>NOVA: {rubros.find(r=>r.id===sugerencia.rubroId)?.nombre}</div>
                  <div style={{ fontSize: 10, color: "#6B7280", marginTop: 2 }}>{sugerencia.razon}</div>
                  <button onClick={() => setForm(p=>({...p,rubroId:sugerencia.rubroId}))} style={{ marginTop: 6, background: "#059669", border: "none", borderRadius: 6, padding: "4px 10px", color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Usar</button>
                </div>
              )}
            </div>
            <select value={form.rubroId} onChange={e => setForm(p=>({...p,rubroId:e.target.value}))} style={iS}>
              <option value="">Rubro *...</option>
              {rubros.map(r=><option key={r.id} value={r.id}>{r.nombre}</option>)}
            </select>
            <button onClick={agregar} disabled={!form.proveedor||!form.monto||!form.rubroId}
              style={{ background: form.proveedor&&form.monto&&form.rubroId?"#E8622A":"#F3F4F6", border: "none", borderRadius: 8, padding: 10, color: form.proveedor&&form.monto&&form.rubroId?"#fff":"#9CA3AF", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              Registrar factura
            </button>
          </div>
        </div>
      )}
      {facturas.length===0
        ? <div style={{ textAlign:"center",color:"#9CA3AF",padding:"40px 0" }}><div style={{ fontSize:32,marginBottom:8 }}>🧾</div>Sin facturas</div>
        : facturas.map(f => {
          const rubro = rubros.find(r=>r.id===f.rubroId);
          return (
            <div key={f.id} style={{ background:"#fff",borderRadius:10,padding:"10px 12px",marginBottom:6,border:"1px solid #F0F1F3",display:"flex",justifyContent:"space-between",gap:10 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13,fontWeight:600 }}>{f.proveedor}</div>
                <div style={{ fontSize:11,color:"#6B7280",marginTop:2 }}>{f.fecha}{f.descripcion&&" · "+f.descripcion}</div>
                {rubro&&<span style={{ background:"#F0FDF4",color:"#059669",fontSize:10,fontWeight:600,padding:"2px 6px",borderRadius:10,marginTop:4,display:"inline-block" }}>{rubro.nombre}</span>}
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:15,fontWeight:700 }}>{fmt(f.monto)}</div>
                {perms.editarEliminarTareas&&<button onClick={()=>save(facturas.filter(x=>x.id!==f.id))} style={{ background:"none",border:"none",color:"#DC2626",cursor:"pointer",fontSize:11,marginTop:4 }}>🗑</button>}
              </div>
            </div>
          );
        })}
    </div>
  );
}

function ModuloCotizaciones({ rubros, proyectoId, currentUser }) {
  const [cotizaciones, setCotizaciones] = useState(() => loadFromStorage(`fin_cotiz_${proyectoId}`, []));
  const [form, setForm] = useState({ proveedor: "", descripcion: "", monto: "", rubroId: "", fecha: new Date().toISOString().split("T")[0] });
  const [analizando, setAnalizando] = useState(null);
  const iS = { width: "100%", background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 8, color: "#111", padding: "8px 10px", fontSize: 13, fontFamily: "'Inter',sans-serif", boxSizing: "border-box", outline: "none" };

  function getRubro(id) { return rubros.find(r => r.id === id); }
  function ejecutadoRubro(id) {
    const facts = loadFromStorage(`fin_facturas_${proyectoId}`, []);
    return facts.filter(f => f.rubroId === id).reduce((s, f) => s + Number(f.monto || 0), 0);
  }

  function save(updated) { setCotizaciones(updated); saveToStorage(`fin_cotiz_${proyectoId}`, updated); }

  async function analizarCotizacion(cot) {
    setAnalizando(cot.id);
    const rubro = getRubro(cot.rubroId);
    const presup = Number(rubro?.presupuesto || 0);
    const ejec = ejecutadoRubro(cot.rubroId);
    const disponible = presup - ejec;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6", max_tokens: 300,
          system: `Analiza si una cotización de construcción entra dentro del presupuesto disponible. Responde SOLO JSON:
{"tiene_ganancia":true/false,"margen_usd":N,"margen_pct":N,"alerta":"texto corto","recomendacion":"texto corto"}`,
          messages: [{
            role: "user", content: `Rubro: ${rubro?.nombre}. Presupuesto: ${presup}. Ya ejecutado: ${ejec}. Disponible: ${disponible}. Cotización: ${cot.monto} de ${cot.proveedor} por ${cot.descripcion}.`
          }]
        })
      });
      const data = await res.json();
      const t = data.content?.[0]?.text || "{}";
      const analisis = JSON.parse(t.replace(/```json|```/g, "").trim());
      save(cotizaciones.map(c => c.id === cot.id ? { ...c, analisis } : c));
    } catch {}
    setAnalizando(null);
  }

  function agregar() {
    if (!form.proveedor || !form.monto) return;
    const nueva = { ...form, id: Date.now(), monto: Number(form.monto), creadaEn: new Date().toISOString() };
    save([nueva, ...cotizaciones]);
    setForm({ proveedor: "", descripcion: "", monto: "", rubroId: "", fecha: new Date().toISOString().split("T")[0] });
  }

  return (
    <div>
      <div style={{ background: "#fff", border: "1.5px solid #E5E7EB", borderRadius: 12, padding: 14, marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#111", marginBottom: 10 }}>📄 Nueva cotización</div>
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div><label style={{ fontSize: 11, color: "#6B7280", fontWeight: 500, display: "block", marginBottom: 3 }}>Proveedor *</label><input value={form.proveedor} onChange={e => setForm(p => ({ ...p, proveedor: e.target.value }))} style={iS} placeholder="Nombre" /></div>
            <div><label style={{ fontSize: 11, color: "#6B7280", fontWeight: 500, display: "block", marginBottom: 3 }}>Monto USD *</label><input type="number" value={form.monto} onChange={e => setForm(p => ({ ...p, monto: e.target.value }))} style={iS} placeholder="0.00" /></div>
          </div>
          <div><label style={{ fontSize: 11, color: "#6B7280", fontWeight: 500, display: "block", marginBottom: 3 }}>Descripción</label><input value={form.descripcion} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} style={iS} placeholder="¿Qué incluye?" /></div>
          <div><label style={{ fontSize: 11, color: "#6B7280", fontWeight: 500, display: "block", marginBottom: 3 }}>Rubro</label>
            <select value={form.rubroId} onChange={e => setForm(p => ({ ...p, rubroId: e.target.value }))} style={iS}>
              <option value="">Seleccionar rubro...</option>
              {rubros.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
            </select>
          </div>
          <button onClick={agregar} disabled={!form.proveedor || !form.monto} style={{ background: form.proveedor && form.monto ? "#E8622A" : "#F3F4F6", border: "none", borderRadius: 8, padding: 10, color: form.proveedor && form.monto ? "#fff" : "#9CA3AF", fontSize: 13, fontWeight: 600, cursor: form.proveedor && form.monto ? "pointer" : "default" }}>Registrar cotización</button>
        </div>
      </div>

      {cotizaciones.length === 0 ? (
        <div style={{ textAlign: "center", color: "#9CA3AF", padding: "40px 0", fontSize: 13 }}><div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>Sin cotizaciones</div>
      ) : cotizaciones.map(c => {
        const rubro = getRubro(c.rubroId);
        return (
          <div key={c.id} style={{ background: "#fff", borderRadius: 10, padding: "12px 14px", marginBottom: 8, border: "1px solid #F0F1F3" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>{c.proveedor}</div>
                <div style={{ fontSize: 11, color: "#6B7280", marginTop: 1 }}>{c.fecha}{c.descripcion && ` · ${c.descripcion}`}</div>
                {rubro && <span style={{ background: "#EFF6FF", color: "#2563EB", fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 10, marginTop: 4, display: "inline-block" }}>{rubro.nombre}</span>}
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#111" }}>{fmt(c.monto)}</div>
            </div>

            {c.analisis ? (
              <div style={{ background: c.analisis.tiene_ganancia ? "#F0FDF4" : "#FEF2F2", borderRadius: 8, padding: "8px 10px", border: `1px solid ${c.analisis.tiene_ganancia ? "#BBF7D0" : "#FECACA"}` }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: c.analisis.tiene_ganancia ? "#059669" : "#DC2626", marginBottom: 3 }}>
                  {c.analisis.tiene_ganancia ? "✅ Dentro del presupuesto" : "❌ Excede el presupuesto"}
                  <span style={{ marginLeft: 8, fontWeight: 400 }}>Margen: {fmt(c.analisis.margen_usd)} ({c.analisis.margen_pct}%)</span>
                </div>
                <div style={{ fontSize: 11, color: "#6B7280" }}>{c.analisis.alerta}</div>
                <div style={{ fontSize: 11, color: "#374151", marginTop: 2 }}>{c.analisis.recomendacion}</div>
              </div>
            ) : (
              <button onClick={() => analizarCotizacion(c)} disabled={analizando === c.id} style={{ background: "#1F2937", border: "none", borderRadius: 6, padding: "6px 12px", color: "#E8622A", fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                {analizando === c.id ? "Analizando..." : <><NovaIcon size={14} /> NOVA: ¿hay ganancia?</>}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── CAJA CHICA ─────────────────────────────────────────────
function ModuloCajaChica({ rubros, proyectoId, currentUser }) {
  const perms = can(currentUser?.role || "member");
  const esMember = currentUser?.role === "member";
  const [gastos, setGastos] = useState(() => loadFromStorage(`fin_caja_${proyectoId}`, []));
  const [saldoInicial, setSaldoInicial] = useState(() => loadFromStorage(`fin_caja_saldo_${proyectoId}`, 0));
  const [form, setForm] = useState({ descripcion: "", monto: "", rubroId: "", responsable: "", fecha: new Date().toISOString().split("T")[0], tieneFactura: false });
  const [reporteModal, setReporteModal] = useState(false);
  const [generandoReporte, setGenerandoReporte] = useState(false);
  const [reporte, setReporte] = useState(null);
  const iS = { width: "100%", background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 8, color: "#111", padding: "8px 10px", fontSize: 13, fontFamily: "'Inter',sans-serif", boxSizing: "border-box", outline: "none" };

  function saveGastos(g) { setGastos(g); saveToStorage(`fin_caja_${proyectoId}`, g); }
  const totalGastado = gastos.reduce((s, g) => s + Number(g.monto || 0), 0);
  const saldoActual = Number(saldoInicial) - totalGastado;

  function agregarGasto() {
    if (!form.descripcion || !form.monto) return;
    const nuevo = { ...form, id: Date.now(), monto: Number(form.monto), creadoEn: new Date().toISOString() };
    saveGastos([nuevo, ...gastos]);
    setForm({ descripcion: "", monto: "", rubroId: "", responsable: "", fecha: new Date().toISOString().split("T")[0], tieneFactura: false });
  }

  async function generarReporte() {
    setGenerandoReporte(true); setReporteModal(true);
    const resumen = gastos.map(g => ({ descripcion: g.descripcion, monto: g.monto, rubro: rubros.find(r => r.id === g.rubroId)?.nombre || "Sin rubro", responsable: g.responsable, fecha: g.fecha, tieneFactura: g.tieneFactura }));
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6", max_tokens: 600,
          system: `Genera un reporte de caja chica para construcción. Responde SOLO JSON:
{"resumen":"texto 2 oraciones","sin_factura":N,"pendiente_devolucion":N,"observaciones":["obs1","obs2"],"estado":"ok|revisar|urgente"}`,
          messages: [{
            role: "user", content: `Saldo inicial: ${saldoInicial}. Gastos: ${JSON.stringify(resumen)}. Total gastado: ${totalGastado}. Saldo actual: ${saldoActual}.`
          }]
        })
      });
      const data = await res.json();
      const t = data.content?.[0]?.text || "{}";
      setReporte(JSON.parse(t.replace(/```json|```/g, "").trim()));
    } catch { setReporte({ error: "Error generando reporte." }); }
    setGenerandoReporte(false);
  }

  return (
    <div>
      {/* Saldo — solo Nivel 1 y 2 */}
      {perms.verReporteCaja && <div style={{ background: "#fff", borderRadius: 12, padding: "12px 14px", marginBottom: 12, border: "1px solid #F0F1F3" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>💰 Control de Caja Chica</div>
          <button onClick={generarReporte} style={{ background: "#1F2937", border: "none", borderRadius: 6, padding: "6px 12px", color: "#E8622A", fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
            <NovaIcon size={14} /> Reporte
          </button>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
          {[
            { l: "Saldo inicial", v: fmt(saldoInicial), c: "#374151" },
            { l: "Gastado", v: fmt(totalGastado), c: "#D97706" },
            { l: "Disponible", v: fmt(saldoActual), c: saldoActual < 0 ? "#DC2626" : "#059669" },
          ].map(s => (
            <div key={s.l} style={{ background: "#F9FAFB", borderRadius: 8, padding: "8px 14px", textAlign: "center", flex: 1, minWidth: 80 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: s.c }}>{s.v}</div>
              <div style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600 }}>{s.l}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ fontSize: 11, color: "#6B7280", fontWeight: 500, whiteSpace: "nowrap" }}>Ajustar saldo inicial:</label>
          <input type="number" value={saldoInicial} onChange={e => { setSaldoInicial(Number(e.target.value)); saveToStorage(`fin_caja_saldo_${proyectoId}`, Number(e.target.value)); }} style={{ ...iS, maxWidth: 140 }} placeholder="USD" />
        </div>
      </div>}

      {/* Nivel 3: info banner */}
      {!perms.verReporteCaja && (
        <div style={{ background: "#EFF6FF", borderRadius: 8, padding: "10px 14px", marginBottom: 12, border: "1px solid #BFDBFE" }}>
          <div style={{ fontSize: 12, color: "#2563EB", fontWeight: 600 }}>📋 Registra tus gastos del día. El Director y Asistente revisan el saldo y cierre.</div>
        </div>
      )}

      {/* Nuevo gasto */}
      <div style={{ background: "#fff", border: "1.5px solid #E5E7EB", borderRadius: 12, padding: 14, marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#111", marginBottom: 10 }}>+ Registrar gasto diario</div>
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div><label style={{ fontSize: 11, color: "#6B7280", fontWeight: 500, display: "block", marginBottom: 3 }}>Descripción *</label><input value={form.descripcion} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} style={iS} placeholder="¿En qué se gastó?" /></div>
            <div><label style={{ fontSize: 11, color: "#6B7280", fontWeight: 500, display: "block", marginBottom: 3 }}>Monto USD *</label><input type="number" value={form.monto} onChange={e => setForm(p => ({ ...p, monto: e.target.value }))} style={iS} placeholder="0.00" /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div><label style={{ fontSize: 11, color: "#6B7280", fontWeight: 500, display: "block", marginBottom: 3 }}>Responsable</label>
              {perms.verReporteCaja
                ? <input value={form.responsable} onChange={e => setForm(p=>({...p,responsable:e.target.value}))} style={iS} placeholder="Nombre"/>
                : <input value={currentUser.name} disabled style={{...iS,background:"#F3F4F6",color:"#9CA3AF"}}/>}
            </div>
            <div><label style={{ fontSize: 11, color: "#6B7280", fontWeight: 500, display: "block", marginBottom: 3 }}>Fecha</label><input type="date" value={form.fecha} onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))} style={iS} /></div>
          </div>
          <div><label style={{ fontSize: 11, color: "#6B7280", fontWeight: 500, display: "block", marginBottom: 3 }}>Rubro</label>
            <select value={form.rubroId} onChange={e => setForm(p => ({ ...p, rubroId: e.target.value }))} style={iS}>
              <option value="">Seleccionar rubro...</option>
              {rubros.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
            </select>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, color: "#374151" }}>
            <input type="checkbox" checked={form.tieneFactura} onChange={e => setForm(p => ({ ...p, tieneFactura: e.target.checked }))} style={{ width: 16, height: 16, accentColor: "#E8622A" }} />
            Tiene factura/recibo de respaldo
          </label>
          <button onClick={agregarGasto} disabled={!form.descripcion || !form.monto} style={{ background: form.descripcion && form.monto ? "#E8622A" : "#F3F4F6", border: "none", borderRadius: 8, padding: 10, color: form.descripcion && form.monto ? "#fff" : "#9CA3AF", fontSize: 13, fontWeight: 600, cursor: form.descripcion && form.monto ? "pointer" : "default" }}>
            Registrar gasto
          </button>
        </div>
      </div>

      {/* Lista gastos */}
      {gastos.length === 0 ? (
        <div style={{ textAlign: "center", color: "#9CA3AF", padding: "30px 0", fontSize: 13 }}><div style={{ fontSize: 32, marginBottom: 8 }}>💳</div>Sin gastos registrados</div>
      ) : gastosVisibles.map(g => {
        const rubro = rubros.find(r => r.id === g.rubroId);
        return (
          <div key={g.id} style={{ background: "#fff", borderRadius: 10, padding: "10px 12px", marginBottom: 6, border: "1px solid #F0F1F3", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>{g.descripcion}</div>
              <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>{g.fecha}{g.responsable && ` · ${g.responsable}`}</div>
              <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                {rubro && <span style={{ background: "#FFF7F0", color: "#E8622A", fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 10 }}>{rubro.nombre}</span>}
                <span style={{ background: g.tieneFactura ? "#F0FDF4" : "#FEF3C7", color: g.tieneFactura ? "#059669" : "#D97706", fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 10 }}>
                  {g.tieneFactura ? "✓ Con factura" : "⚠ Sin factura"}
                </span>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#DC2626" }}>-{fmt(g.monto)}</div>
              {perms.verReporteCaja && <button onClick={() => saveGastos(gastos.filter(x => x.id !== g.id))} style={{ background: "none", border: "none", color: "#DC2626", cursor: "pointer", fontSize: 11, marginTop: 4 }}>🗑</button>}
            </div>
          </div>
        );
      })}

      {/* Modal reporte */}
      {reporteModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: 20 }} onClick={() => setReporteModal(false)}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 22, maxWidth: 460, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.15)", fontFamily: "'Inter',sans-serif", maxHeight: "85vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <NovaIcon size={26} />
              <div style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>Reporte de Caja Chica</div>
              <button onClick={() => setReporteModal(false)} style={{ marginLeft: "auto", background: "none", border: "none", color: "#9CA3AF", cursor: "pointer", fontSize: 20 }}>×</button>
            </div>
            {generandoReporte ? <div style={{ color: "#9CA3AF", fontSize: 13, padding: "20px 0", textAlign: "center" }}>NOVA generando reporte...</div> : reporte && !reporte.error && (
              <div>
                <div style={{ background: reporte.estado === "ok" ? "#F0FDF4" : reporte.estado === "revisar" ? "#FEF3C7" : "#FEF2F2", borderRadius: 8, padding: "10px 14px", marginBottom: 14, border: `1px solid ${reporte.estado === "ok" ? "#BBF7D0" : reporte.estado === "revisar" ? "#FDE68A" : "#FECACA"}` }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: reporte.estado === "ok" ? "#059669" : reporte.estado === "revisar" ? "#D97706" : "#DC2626", marginBottom: 4 }}>
                    {reporte.estado === "ok" ? "✅ Estado: OK" : reporte.estado === "revisar" ? "⚠️ Requiere revisión" : "🔴 Urgente"}
                  </div>
                  <div style={{ fontSize: 12, color: "#374151" }}>{reporte.resumen}</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                  <div style={{ background: "#FEF3C7", borderRadius: 8, padding: "10px 14px", textAlign: "center" }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: "#D97706" }}>{gastos.filter(g => !g.tieneFactura).length}</div>
                    <div style={{ fontSize: 10, color: "#D97706", fontWeight: 600 }}>SIN FACTURA</div>
                  </div>
                  <div style={{ background: "#F0FDF4", borderRadius: 8, padding: "10px 14px", textAlign: "center" }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: "#059669" }}>{fmt(reporte.pendiente_devolucion || 0)}</div>
                    <div style={{ fontSize: 10, color: "#059669", fontWeight: 600 }}>A DEVOLVER</div>
                  </div>
                </div>
                {reporte.observaciones?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Observaciones:</div>
                    {reporte.observaciones.map((o, i) => <div key={i} style={{ fontSize: 12, color: "#6B7280", marginBottom: 4, paddingLeft: 12, borderLeft: "2px solid #E5E7EB" }}>{o}</div>)}
                  </div>
                )}
                <button onClick={() => window.print()} style={{ width: "100%", marginTop: 16, background: "#1F2937", border: "none", borderRadius: 8, padding: 10, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  🖨 Imprimir / Enviar a Financiero
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── PANEL AJUSTES SIMPLIFICADO ─────────────────────────────
function PanelAjustes({ users, setUsers, projects, setProjects, empresa, setEmpresa, onClose }) {
  const [tab, setTab] = useState("empresa");
  const tabS = a => ({ padding: "7px 16px", borderRadius: 6, border: "none", cursor: "pointer", fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 600, background: a ? "#E8622A" : "transparent", color: a ? "#fff" : "#6B7280" });
  const iS = { width: "100%", background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 8, color: "#111", padding: "9px 12px", fontSize: 13, fontFamily: "'Inter',sans-serif", boxSizing: "border-box", outline: "none" };

  function saveEmpresa(e) { setEmpresa(e); saveToStorage("foreman_empresa", e); }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 150, padding: 20 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 22, maxWidth: 500, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.12)", maxHeight: "90vh", overflowY: "auto", fontFamily: "'Inter',sans-serif" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#111" }}>⚙️ Ajustes</div>
          <button onClick={onClose} style={{ background: "#F3F4F6", border: "none", borderRadius: 6, width: 28, height: 28, color: "#6B7280", cursor: "pointer", fontSize: 15 }}>×</button>
        </div>
        <div style={{ display: "flex", gap: 4, marginBottom: 16, background: "#F3F4F6", borderRadius: 8, padding: 4 }}>
          <button onClick={() => setTab("empresa")} style={tabS(tab === "empresa")}>🏢 Empresa</button>
          <button onClick={() => setTab("usuarios")} style={tabS(tab === "usuarios")}>👥 Usuarios</button>
          <button onClick={() => setTab("proyectos")} style={tabS(tab === "proyectos")}>🏗 Proyectos</button>
        </div>
        {tab === "empresa" && (
          <div style={{ display: "grid", gap: 10 }}>
            {[
              { k: "nombre", l: "Nombre", ph: "HCA Studio" },
              { k: "email", l: "Email", ph: "info@empresa.com" },
              { k: "telefono", l: "Teléfono", ph: "+593 99 999 9999" },
              { k: "ciudad", l: "Ciudad", ph: "Quito, Ecuador" },
              { k: "moneda", l: "Moneda", ph: "USD" },
            ].map(f => (
              <div key={f.k}>
                <label style={{ color: "#6B7280", fontSize: 11, fontWeight: 500, marginBottom: 4, display: "block" }}>{f.l}</label>
                <input value={empresa?.[f.k] || ""} onChange={e => saveEmpresa({ ...empresa, [f.k]: e.target.value })} placeholder={f.ph} style={iS} />
              </div>
            ))}
          </div>
        )}
        {tab === "usuarios" && (
          <div>
            {users.map(u => (
              <div key={u.id} style={{ background: "#F9FAFB", borderRadius: 10, padding: "10px 12px", marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
                <Avatar name={u.name} size={36} color={u.color || "#2563EB"} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#111" }}>{u.name}</div>
                  <div style={{ fontSize: 11, color: "#9CA3AF" }}>{u.role === "owner" ? "👑 Director" : u.role === "assistant" ? "🤝 Asistente" : "👷 Equipo"} · PIN: {u.pin}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        {tab === "proyectos" && (
          <div>
            {projects.map(p => (
              <div key={p.id} style={{ background: "#F9FAFB", borderRadius: 10, padding: "10px 12px", marginBottom: 8, display: "flex", alignItems: "center", gap: 10, borderLeft: `3px solid ${p.color}` }}>
                <div style={{ width: 12, height: 12, borderRadius: "50%", background: p.color, flexShrink: 0 }} />
                <div style={{ fontSize: 14, fontWeight: 600, color: "#111" }}>{p.name}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
//  APP PRINCIPAL
// ══════════════════════════════════════════════════════════
// ── MÓDULO PROYECTO — tabs según nivel de acceso ──────────
function ModuloProyecto({ proyectoId, proyectos, currentUser }) {
  const perms = can(currentUser.role);
  const defaultTab = perms.verPresupuesto ? "presupuesto" : "cajachica";
  const [tab, setTab] = useState(defaultTab);
  const tabS = a => ({ padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer", fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 600, background: a ? "#E8622A" : "transparent", color: a ? "#fff" : "#6B7280" });
  const proy = proyectos.find(p => p.id === proyectoId);
  return (
    <div style={{ fontFamily: "'Inter',sans-serif" }}>
      {proy && (
        <div style={{ background: "#fff", borderRadius: 12, padding: "10px 14px", marginBottom: 12, border: "1px solid #F0F1F3", borderLeft: "3px solid " + proy.color, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: proy.color }} />
          <div style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{proy.name}</div>
          {(() => { const b = rolBadge(currentUser.role); return <span style={{ background: b.bg, color: b.color, fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 10, marginLeft: "auto" }}>{b.label}</span>; })()}
        </div>
      )}
      <div style={{ display: "flex", gap: 4, marginBottom: 14, background: "#F3F4F6", borderRadius: 8, padding: 4, flexWrap: "wrap" }}>
        {perms.verPresupuesto  && <button onClick={() => setTab("presupuesto")}  style={tabS(tab === "presupuesto")}>Rubros</button>}
        {perms.verFacturas     && <button onClick={() => setTab("facturas")}     style={tabS(tab === "facturas")}>Facturas</button>}
        {perms.verCotizaciones && <button onClick={() => setTab("cotizaciones")} style={tabS(tab === "cotizaciones")}>Cotizaciones</button>}
        {perms.verCajaChica    && <button onClick={() => setTab("cajachica")}    style={tabS(tab === "cajachica")}>Caja Chica</button>}
      </div>
      {tab === "presupuesto"  && <ModuloPresupuesto  proyectoId={proyectoId} proyectos={proyectos} currentUser={currentUser} />}
      {tab === "facturas"     && <ModuloFacturas     proyectoId={proyectoId} currentUser={currentUser} />}
      {tab === "cotizaciones" && <ModuloCotizaciones  proyectoId={proyectoId} currentUser={currentUser} />}
      {tab === "cajachica"    && <ModuloCajaChica     proyectoId={proyectoId} currentUser={currentUser} />}
    </div>
  );
}

export default function App() {
  const [users, setUsers] = useState(() => loadFromStorage("foreman_users", USERS_DEFAULT));
  const [projects, setProjects] = useState(() => loadFromStorage("foreman_projects", PROJECTS_DEFAULT));
  const [empresa, setEmpresa] = useState(() => loadFromStorage("foreman_empresa", { nombre: "HCA Studio", tipo: "Construcción", email: "", telefono: "", web: "", ciudad: "Quito", moneda: "USD", color: "#E8622A", logoUrl: "" }));
  const [usuario, setUsuario] = useState(null);
  const [tareas, setTareas] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [vista, setVista] = useState("tareas");
  const [filtro, setFiltro] = useState("todas");
  const [filtroP, setFiltroP] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [showAjustes, setShowAjustes] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  // Finance state
  const [proyectoFinanzas, setProyectoFinanzas] = useState(null);

  const gP = id => projects.find(p => p.id === id);

  useEffect(() => { if (!usuario) return; fetchTareas(); }, [usuario]);

  async function fetchTareas() {
    setCargando(true);
    const { data } = await supabase.from("tasks").select("*").order("created_at", { ascending: false });
    setTareas(data || []);
    setCargando(false);
  }

  async function cambiarEstado(id, estado) {
    setTareas(prev => prev.map(t => t.id === id ? { ...t, status: estado } : t));
    await supabase.from("tasks").update({ status: estado }).eq("id", id);
  }

  async function guardarTarea(form, id) {
    if (id) { await supabase.from("tasks").update(form).eq("id", id); }
    else { await supabase.from("tasks").insert({ ...form, created_by: usuario.id }); }
    fetchTareas();
    setEditTask(null);
  }

  async function eliminarTarea(id) {
    if (!window.confirm("¿Eliminar esta tarea?")) return;
    await supabase.from("tasks").delete().eq("id", id);
    setTareas(prev => prev.filter(t => t.id !== id));
  }

  function logout() { saveToStorage("foreman_session", null); localStorage.removeItem("foreman_session"); setUsuario(null); }

  if (!usuario) return <LoginScreen onLogin={setUsuario} users={users} />;

  const perms = can(usuario.role);
  const admin = perms.verTodasTareas; // backward compat for sidebar
  const pendientes = tareas.filter(t => t.status !== "listo");
  const vencidas = pendientes.filter(t => daysUntil(t.due_date) < 0);
  const urgentes = pendientes.filter(t => t.priority === "urgente" || daysUntil(t.due_date) <= 1);

  let visibles = admin ? tareas : tareas.filter(t => t.assignee_id === usuario.id || t.created_by === usuario.id);
  if (busqueda.trim()) {
    const q = busqueda.toLowerCase();
    visibles = visibles.filter(t => t.title?.toLowerCase().includes(q) || t.notes?.toLowerCase().includes(q) || projects.find(p => p.id === t.project_id)?.name?.toLowerCase().includes(q));
  }
  if (filtro === "pendiente") visibles = visibles.filter(t => t.status === "pendiente");
  if (filtro === "urgente") visibles = visibles.filter(t => t.status !== "listo" && (t.priority === "urgente" || daysUntil(t.due_date) <= 1));
  if (filtro === "listo") visibles = visibles.filter(t => t.status === "listo");
  if (filtroP !== "all") visibles = visibles.filter(t => t.project_id === Number(filtroP));

  const navItem = (v, label, icon, badge) => (
    <button onClick={() => setVista(v)} style={{ width: "100%", background: vista === v ? "#FFF4F0" : "transparent", border: "none", borderRight: vista === v ? "3px solid #E8622A" : "3px solid transparent", padding: "9px 14px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: vista === v ? 600 : 400, color: vista === v ? "#E8622A" : "#6B7280", textAlign: "left", transition: "all 0.15s" }}>
      <span style={{ fontSize: 14 }}>{icon}</span>{label}
      {badge > 0 && <span style={{ marginLeft: "auto", background: "#DC2626", color: "#fff", fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 10 }}>{badge}</span>}
    </button>
  );

  const filtS = a => ({ padding: "6px 14px", borderRadius: 20, border: a ? "none" : "1px solid #E5E7EB", cursor: "pointer", fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 600, background: a ? "#1F2937" : "#fff", color: a ? "#fff" : "#6B7280", flexShrink: 0 });

  return (
    <div style={{ minHeight: "100vh", background: "#F8F9FB", fontFamily: "'Inter',sans-serif", display: "flex", flexDirection: "column" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');*{box-sizing:border-box}select option{background:#fff}input,select,textarea{outline:none}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#E5E7EB;border-radius:2px}@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>

      {/* HEADER */}
      <div style={{ background: "#fff", borderBottom: "1.5px solid #F0F1F3", padding: "0 16px", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
        <div style={{ display: "flex", alignItems: "center", height: 54, gap: 12, maxWidth: 1100, margin: "0 auto", width: "100%" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 0, flexShrink: 0 }}>
            <div style={{ width: 10, height: 26, background: "#E8622A", borderRadius: "4px 0 0 4px" }} />
            <div style={{ width: 10, height: 26, background: "#FF9500" }} />
            <div style={{ width: 10, height: 26, background: "#FFD60A", borderRadius: "0 4px 4px 0", marginRight: 8 }} />
            <span style={{ color: "#1F2937", fontSize: 16, fontWeight: 700, letterSpacing: 0.5 }}>FOREMAN</span>
            <span style={{ background: "#F3F4F6", color: "#9CA3AF", fontSize: 9, fontWeight: 600, padding: "1px 5px", borderRadius: 4, marginLeft: 4 }}>BETA</span>
            <span style={{ background: "#FFF4F0", color: "#E8622A", fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 4, marginLeft: 4, border: "1px solid #FED7AA" }}>+ FINANCE</span>
          </div>
          <div style={{ flex: 1, background: "#F3F4F6", borderRadius: 8, padding: "4px 12px", display: "flex", alignItems: "center", gap: 8, maxWidth: 280 }}>
            <span style={{ fontSize: 13 }}>🔍</span>
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar tareas..." style={{ background: "transparent", border: "none", outline: "none", fontSize: 12, color: "#374151", width: "100%", fontFamily: "'Inter',sans-serif" }} />
            {busqueda && <button onClick={() => setBusqueda("")} style={{ background: "none", border: "none", color: "#9CA3AF", cursor: "pointer", fontSize: 14, padding: 0 }}>×</button>}
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            {vencidas.length > 0 && perms.verTodasTareas && <span style={{ background: "#FEE2E2", color: "#DC2626", fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20 }}>⚠ {vencidas.length} vencidas</span>}
            {(() => { const b = rolBadge(usuario.role); return <span style={{ background: b.bg, color: b.color, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20 }}>{b.label}</span>; })()}
            {perms.verAjustes && <button onClick={() => setShowAjustes(true)} style={{ background: "#F3F4F6", border: "none", borderRadius: 8, padding: "6px 10px", color: "#6B7280", fontSize: 12, cursor: "pointer", fontWeight: 500 }}>⚙️</button>}
            <Avatar name={usuario.name} size={30} color={usuario.color || "#E8622A"} />
            <button onClick={logout} style={{ background: "none", border: "none", color: "#9CA3AF", cursor: "pointer", fontSize: 12 }}>salir</button>
            {vista === "tareas" && perms.crearTareas && (
              <button onClick={() => { setEditTask(null); setShowModal(true); }} style={{ background: "#E8622A", border: "none", borderRadius: 8, padding: "7px 14px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", boxShadow: "0 4px 12px rgba(232,98,42,0.25)", display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
                + Nueva tarea
              </button>
            )}
          </div>
        </div>
      </div>

      {/* LAYOUT */}
      <div style={{ display: "flex", flex: 1, maxWidth: 1100, margin: "0 auto", width: "100%" }}>
        {/* SIDEBAR */}
        <div style={{ width: 180, background: "#fff", borderRight: "1px solid #F0F1F3", padding: "16px 0", flexShrink: 0, minHeight: "calc(100vh - 54px)" }}>
          <div style={{ padding: "0 12px", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#F9FAFB", borderRadius: 8, padding: "8px 10px" }}>
              <Avatar name={usuario.name} size={26} color={usuario.color || "#E8622A"} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#111" }}>{usuario.name}</div>
                <div style={{ fontSize: 10, color: "#9CA3AF" }}>
                {usuario.role === "owner" ? "Director" : usuario.role === "assistant" ? "Asistente" : "Equipo"}
                {" · "}{rolBadge(usuario.role).label}
              </div>
              </div>
            </div>
          </div>

          {/* Nav — Tareas */}
          <div style={{ padding: "0 12px 4px", marginBottom: 2 }}>
            <div style={{ fontSize: 9, color: "#D1D5DB", fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>TAREAS</div>
          </div>
          {navItem("tareas", "Mis tareas", "📋", vencidas.length)}
          {admin && navItem("equipo", "Equipo", "👷")}
          {admin && navItem("proyectos", "Proyectos", "🏗")}

          {/* Nav — Finanzas (solo admin) */}
          {admin && (
            <>
              <div style={{ padding: "12px 12px 4px", marginBottom: 2, marginTop: 4 }}>
                <div style={{ fontSize: 9, color: "#D1D5DB", fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>FINANZAS</div>
              </div>
              {navItem("finanzas-dashboard", "Dashboard", "📊")}
              {projects.slice(0, 6).map(p => (
                <button key={p.id} onClick={() => { setVista("finanzas-proyecto"); setProyectoFinanzas(p.id); }}
                  style={{ width: "100%", background: vista === "finanzas-proyecto" && proyectoFinanzas === p.id ? "#FFF4F0" : "transparent", border: "none", borderRight: vista === "finanzas-proyecto" && proyectoFinanzas === p.id ? "3px solid #E8622A" : "3px solid transparent", padding: "6px 14px 6px 24px", display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: vista === "finanzas-proyecto" && proyectoFinanzas === p.id ? 600 : 400, color: vista === "finanzas-proyecto" && proyectoFinanzas === p.id ? "#E8622A" : "#9CA3AF", textAlign: "left" }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: p.color, flexShrink: 0 }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                </button>
            ))}
          </>

          {/* Stats sidebar */}
          {admin && (
            <div style={{ margin: "14px 12px 0", paddingTop: 14, borderTop: "1px solid #F0F1F3" }}>
              <div style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, letterSpacing: 0.5, marginBottom: 8 }}>HOY</div>
              {[{ l: "Activas", v: pendientes.length, c: "#374151" }, { l: "Urgentes", v: urgentes.length, c: "#DC2626" }].map(s => (
                <div key={s.l} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                  <span style={{ fontSize: 12, color: "#6B7280" }}>{s.l}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: s.c }}>{s.v}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* CONTENT */}
        <div style={{ flex: 1, padding: "18px 20px", overflowY: "auto", minHeight: "calc(100vh - 54px)" }}>

          {/* VISTA TAREAS */}
          {vista === "tareas" && (
            <>
              {admin && <NovaInput currentUser={usuario} projects={projects} users={users} onTaskCreated={fetchTareas} />}
              <div style={{ display: "flex", gap: 6, marginBottom: 12, overflowX: "auto", paddingBottom: 4 }}>
                {[["todas", "Todas"], ["urgente", "Urgentes"], ["pendiente", "Pendientes"], ["listo", "Completadas"]].map(([f, l]) => (
                  <button key={f} onClick={() => setFiltro(f)} style={filtS(filtro === f)}>{l}</button>
                ))}
                {admin && <select value={filtroP} onChange={e => setFiltroP(e.target.value)} style={{ background: "#fff", border: `1px solid ${filtroP !== "all" ? "#E8622A" : "#E5E7EB"}`, borderRadius: 20, color: filtroP !== "all" ? "#E8622A" : "#6B7280", padding: "6px 12px", fontSize: 12, fontFamily: "'Inter',sans-serif", cursor: "pointer", flexShrink: 0 }}>
                  <option value="all">Todos los proyectos</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>}
              </div>
              {cargando ? <div style={{ textAlign: "center", color: "#9CA3AF", padding: "40px 0", fontSize: 13 }}>Cargando...</div>
                : visibles.length === 0 ? <div style={{ textAlign: "center", color: "#9CA3AF", padding: "60px 0", fontSize: 13 }}><div style={{ fontSize: 36, marginBottom: 10 }}>🏗</div>Sin tareas. Toca "+ Nueva tarea" o dile a NOVA.</div>
                  : visibles.sort((a, b) => {
                    const o = { urgente: 0, alta: 1, media: 2, baja: 3 };
                    if (a.status === "listo" && b.status !== "listo") return 1;
                    if (b.status === "listo" && a.status !== "listo") return -1;
                    return (o[a.priority] - o[b.priority]) || (daysUntil(a.due_date) - daysUntil(b.due_date));
                  }).map(t => <TarjetaTarea key={t.id} task={t} currentUser={usuario} users={users} projects={projects} onCambiarEstado={cambiarEstado} onEditar={t => { setEditTask(t); setShowModal(true); }} onEliminar={eliminarTarea} commentCount={0} />)}
            </>
          )}

          {/* VISTA EQUIPO */}
          {admin && vista === "equipo" && (
            <div style={{ display: "grid", gap: 10 }}>
              {users.map(m => {
                const mt = tareas.filter(t => t.assignee_id === m.id && t.status !== "listo");
                const mo = mt.filter(t => daysUntil(t.due_date) < 0);
                return (
                  <div key={m.id} style={{ background: "#fff", borderRadius: 12, padding: 14, border: "1px solid #E5E7EB" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: mt.length ? 12 : 0 }}>
                      <Avatar name={m.name} size={40} color={mo.length > 0 ? "#DC2626" : m.color || "#2563EB"} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: "#111" }}>{m.name}</div>
                        <div style={{ fontSize: 11, color: "#9CA3AF" }}>{m.role === "owner" ? "👑 Director" : m.role === "assistant" ? "🤝 Asistente" : "👷 Equipo"}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ color: mo.length > 0 ? "#DC2626" : "#E8622A", fontSize: 20, fontWeight: 700 }}>{mt.length}</div>
                        <div style={{ color: "#9CA3AF", fontSize: 9, fontWeight: 600, letterSpacing: 0.5 }}>ABIERTAS</div>
                      </div>
                    </div>
                    {mt.map(t => (
                      <div key={t.id} style={{ background: "#F9FAFB", borderRadius: 8, padding: "7px 10px", marginBottom: 5, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div><div style={{ fontSize: 12, fontWeight: 500, color: "#111" }}>{t.title}</div><div style={{ fontSize: 11, color: "#9CA3AF" }}>{gP(t.project_id)?.name}</div></div>
                        <FechaBadge due={t.due_date} status={t.status} />
                      </div>
                    ))}
                    {mt.length === 0 && <div style={{ color: "#9CA3AF", fontSize: 12, textAlign: "center", padding: "4px 0" }}>✓ Sin pendientes</div>}
                  </div>
                );
              })}
            </div>
          )}

          {/* VISTA PROYECTOS */}
          {admin && vista === "proyectos" && (
            <div style={{ display: "grid", gap: 10 }}>
              {projects.map(p => {
                const pt = tareas.filter(t => t.project_id === p.id);
                const pPen = pt.filter(t => t.status !== "listo");
                const pOk = pt.filter(t => t.status === "listo");
                const avance = pt.length > 0 ? Math.round((pOk.length / pt.length) * 100) : 0;
                return (
                  <div key={p.id} style={{ background: "#fff", borderRadius: 12, padding: 14, border: "1px solid #E5E7EB", borderLeft: `4px solid ${p.color}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "#111" }}>{p.name}</div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <div style={{ color: p.color, fontSize: 16, fontWeight: 700 }}>{avance}%</div>
                        <button onClick={() => { setVista("finanzas-proyecto"); setProyectoFinanzas(p.id); }} style={{ background: "#FFF4F0", border: "1px solid #FED7AA", borderRadius: 6, padding: "4px 10px", color: "#E8622A", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>💰 Finanzas</button>
                      </div>
                    </div>
                    <div style={{ background: "#F3F4F6", borderRadius: 4, height: 6, marginBottom: 8 }}>
                      <div style={{ background: p.color, height: 6, borderRadius: 4, width: `${avance}%`, transition: "width 0.5s" }} />
                    </div>
                    <div style={{ display: "flex", gap: 16 }}>
                      <span style={{ fontSize: 12, color: "#6B7280" }}><span style={{ color: p.color, fontWeight: 700 }}>{pPen.length}</span> abiertas</span>
                      <span style={{ fontSize: 12, color: "#6B7280" }}><span style={{ color: "#059669", fontWeight: 700 }}>{pOk.length}</span> completadas</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* VISTA FINANZAS — DASHBOARD */}
          {admin && vista === "finanzas-dashboard" && (
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#111", marginBottom: 14 }}>📊 Resumen Financiero — Todos los proyectos</div>
              <div style={{ display: "grid", gap: 10 }}>
                {projects.map(p => {
                  const rubros = loadFromStorage(`fin_rubros_${p.id}`, RUBROS_DEFAULT);
                  const facturas = loadFromStorage(`fin_facturas_${p.id}`, []);
                  const presup = rubros.reduce((s, r) => s + Number(r.presupuesto || 0), 0);
                  const ejec = facturas.reduce((s, f) => s + Number(f.monto || 0), 0);
                  const saldo = presup - ejec;
                  const avance = pct(ejec, presup);
                  if (presup === 0) return null;
                  return (
                    <div key={p.id} style={{ background: "#fff", borderRadius: 12, padding: "12px 16px", border: "1px solid #F0F1F3", borderLeft: `4px solid ${p.color}`, cursor: "pointer" }} onClick={() => { setVista("finanzas-proyecto"); setProyectoFinanzas(p.id); }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: "#111" }}>{p.name}</div>
                        <span style={{ background: saldo < 0 ? "#FEE2E2" : "#F0FDF4", color: saldo < 0 ? "#DC2626" : "#059669", fontSize: 12, fontWeight: 700, padding: "2px 10px", borderRadius: 20 }}>
                          {saldo < 0 ? `⚠ -${fmt(Math.abs(saldo))}` : `+${fmt(saldo)}`}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: 16, marginBottom: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 12, color: "#6B7280" }}>Ppto: <strong>{fmt(presup)}</strong></span>
                        <span style={{ fontSize: 12, color: "#6B7280" }}>Ejec: <strong style={{ color: "#D97706" }}>{fmt(ejec)}</strong></span>
                        <span style={{ fontSize: 12, color: "#6B7280" }}>Avance: <strong style={{ color: p.color }}>{avance}%</strong></span>
                      </div>
                      <div style={{ background: "#F3F4F6", borderRadius: 4, height: 6 }}>
                        <div style={{ background: saldo < 0 ? "#DC2626" : p.color, height: 6, borderRadius: 4, width: `${Math.min(100, avance)}%` }} />
                      </div>
                    </div>
                  );
                }).filter(Boolean)}
                {projects.every(p => loadFromStorage(`fin_rubros_${p.id}`, RUBROS_DEFAULT).every(r => !r.presupuesto)) && (
                  <div style={{ textAlign: "center", color: "#9CA3AF", padding: "60px 0", fontSize: 13 }}>
                    <div style={{ fontSize: 36, marginBottom: 10 }}>💰</div>
                    Sin presupuestos configurados.<br />
                    <span style={{ fontSize: 12 }}>Selecciona un proyecto en el menú lateral para comenzar.</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* VISTA FINANZAS — PROYECTO */}
          {vista === "finanzas-proyecto" && proyectoFinanzas && (
            <ModuloProyecto proyectoId={proyectoFinanzas} proyectos={projects} currentUser={usuario} />
          )}

        </div>
      </div>

      {/* MODALES */}
      {showModal && <ModalTarea editTask={editTask} currentUser={usuario} users={users} projects={projects} onCerrar={() => { setShowModal(false); setEditTask(null); }} onGuardar={guardarTarea} />}
      {showAjustes && <PanelAjustes users={users} setUsers={setUsers} projects={projects} setProjects={setProjects} empresa={empresa} setEmpresa={setEmpresa} onClose={() => setShowAjustes(false)} />}
    </div>
  );
}
