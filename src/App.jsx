import { useState, useRef, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://qxoincfvscvbqvoxamdi.supabase.co";
const SUPABASE_KEY = "sb_publishable_UXB8WueKrn1zBSXfsTqJ0w_C61L3b77";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const USERS_DEFAULT = [
  { id: 1, name: "Hernan",     role: "owner",     pin: "1234", avatar: "HE", color: "#E8622A" },
  { id: 2, name: "Johanna",    role: "assistant",  pin: "2345", avatar: "JO", color: "#7C3AED" },
  { id: 3, name: "Hector",     role: "member",     pin: "3001", avatar: "HC", color: "#2563EB" },
  { id: 4, name: "Josh",       role: "member",     pin: "3002", avatar: "JS", color: "#2563EB" },
  { id: 5, name: "Guillermo",  role: "member",     pin: "3003", avatar: "GU", color: "#2563EB" },
  { id: 6, name: "Camila",     role: "member",     pin: "3004", avatar: "CA", color: "#2563EB" },
  { id: 7, name: "Santiago",   role: "member",     pin: "3005", avatar: "SA", color: "#2563EB" },
  { id: 8, name: "Gerardo",    role: "member",     pin: "3006", avatar: "GE", color: "#2563EB" },
  { id: 9, name: "Luis Guala", role: "member",     pin: "3007", avatar: "LG", color: "#2563EB" },
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

const esAdmin = role => role==="owner"||role==="assistant";

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
function timeAgo(ts) {
  const m = Math.floor((new Date() - new Date(ts)) / 60000);
  if (m < 1) return "ahora"; if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  return `${Math.floor(h/24)}d`;
}
function initials(name) {
  return name.split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2);
}

function Avatar({ name, size=32, color="#E8622A" }) {
  return <div style={{width:size,height:size,borderRadius:"50%",background:color,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.32,fontWeight:700,flexShrink:0}}>{initials(name||"?")}</div>;
}

function FechaBadge({ due, status }) {
  if (status === "listo") return null;
  const d = daysUntil(due);
  const s = {fontSize:11,fontWeight:600,padding:"2px 8px",borderRadius:20};
  if (d < 0)  return <span style={{...s,color:"#DC2626",background:"#FEE2E2"}}>Vencida {Math.abs(d)}d</span>;
  if (d === 0) return <span style={{...s,color:"#D97706",background:"#FEF3C7"}}>Hoy</span>;
  if (d <= 2)  return <span style={{...s,color:"#D97706",background:"#FEF3C7",fontWeight:500}}>en {d}d</span>;
  return <span style={{...s,color:"#6B7280",background:"#F3F4F6",fontWeight:400}}>en {d}d</span>;
}

// ── LOGIN ──────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin, users }) {
  const [sel, setSel] = useState(null);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [step, setStep] = useState("pick");

  useEffect(() => {
    try {
      const s = localStorage.getItem("foreman_session");
      if (s) { const {userId,expires} = JSON.parse(s); if (new Date(expires) > new Date()) { const u = users.find(u=>u.id===userId); if (u) onLogin(u); } }
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
          saveToStorage("foreman_session", {userId:sel.id, expires:exp.toISOString()});
          onLogin(sel);
        } else { setErr("PIN incorrecto"); setPin(""); }
      }, 200);
    }
  }

  const btnS = {width:"100%",background:"#fff",border:"1.5px solid #E5E7EB",borderRadius:12,padding:"12px 16px",marginBottom:8,display:"flex",alignItems:"center",gap:14,cursor:"pointer",transition:"all 0.15s",fontFamily:"'Inter',sans-serif"};

  return (
    <div style={{minHeight:"100vh",background:"#F8F9FB",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');*{box-sizing:border-box}@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        .nova-briefing-container h3{font-size:13px;font-weight:600;color:#E8622A;margin:12px 0 6px;font-family:Inter,sans-serif}
        .nova-briefing-container table{width:100%;border-collapse:collapse;margin-bottom:12px;font-size:12px}
        .nova-briefing-container th{background:#FFF4F0;color:#E8622A;padding:6px 10px;text-align:left;font-weight:600;border:1px solid #FED7AA;font-family:Inter,sans-serif}
        .nova-briefing-container td{padding:5px 10px;border:1px solid #F3F4F6;color:#374151;font-family:Inter,sans-serif}
        .nova-briefing-container tr:nth-child(even) td{background:#FAFAFA}
        .nova-briefing-container ol{padding-left:18px;margin:0}
        .nova-briefing-container li{margin-bottom:4px;color:#374151;font-family:Inter,sans-serif;font-size:12px}@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
      <div style={{marginBottom:32,textAlign:"center"}}>
        <div style={{display:"inline-flex",alignItems:"center",gap:0,marginBottom:10}}>
          <div style={{width:10,height:28,background:"#E8622A",borderRadius:"4px 0 0 4px"}}/>
          <div style={{width:10,height:28,background:"#FF9500"}}/>
          <div style={{width:10,height:28,background:"#FFD60A",borderRadius:"0 4px 4px 0",marginRight:8}}/>
          <span style={{color:"#1F2937",fontSize:22,fontWeight:700,fontFamily:"'Inter',sans-serif",letterSpacing:0.5}}>FOREMAN</span>
          <span style={{background:"#F3F4F6",color:"#9CA3AF",fontSize:9,fontWeight:600,padding:"1px 6px",borderRadius:4,marginLeft:6}}>BETA</span>
        </div>
        <div style={{fontSize:12,color:"#9CA3AF",fontFamily:"'Inter',sans-serif"}}>Sesión guardada por 7 días</div>
      </div>

      {step === "pick" && (
        <div style={{width:"100%",maxWidth:400}}>
          <div style={{fontSize:10,color:"#9CA3AF",fontFamily:"'Inter',sans-serif",letterSpacing:1,marginBottom:10,textAlign:"center",fontWeight:600}}>SELECCIONA TU PERFIL</div>
          {users.map(u => (
            <button key={u.id} onClick={() => selectUser(u)} style={btnS}
              onMouseEnter={e=>{e.currentTarget.style.borderColor="#E8622A";e.currentTarget.style.boxShadow="0 4px 12px rgba(232,98,42,0.1)";}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor="#E5E7EB";e.currentTarget.style.boxShadow="none";}}>
              <Avatar name={u.name} size={40} color={u.color||"#2563EB"}/>
              <div style={{textAlign:"left"}}>
                <div style={{color:"#111",fontSize:15,fontWeight:600,fontFamily:"'Inter',sans-serif"}}>{u.name}</div>
                <div style={{color:"#9CA3AF",fontSize:12,fontFamily:"'Inter',sans-serif"}}>{u.role==="owner"?"👑 Director":u.role==="assistant"?"🤝 Asistente":"👷 Equipo"}</div>
              </div>
              <div style={{marginLeft:"auto",color:"#D1D5DB",fontSize:18}}>›</div>
            </button>
          ))}
        </div>
      )}

      {step === "pin" && sel && (
        <div style={{width:"100%",maxWidth:280,textAlign:"center",fontFamily:"'Inter',sans-serif"}}>
          <button onClick={()=>{setStep("pick");setErr("");}} style={{background:"none",border:"none",color:"#9CA3AF",cursor:"pointer",fontSize:13,marginBottom:20,display:"flex",alignItems:"center",gap:4,margin:"0 auto 20px"}}>← Volver</button>
          <Avatar name={sel.name} size={60} color={sel.color||"#E8622A"}/>
          <div style={{color:"#111",fontSize:18,fontWeight:700,marginTop:12}}>{sel.name}</div>
          <div style={{color:"#9CA3AF",fontSize:13,marginBottom:28,marginTop:6}}>Ingresa tu PIN</div>
          <div style={{display:"flex",justifyContent:"center",gap:16,marginBottom:28}}>
            {[0,1,2,3].map(i=><div key={i} style={{width:12,height:12,borderRadius:"50%",background:pin.length>i?"#E8622A":"#E5E7EB",transition:"background 0.15s"}}/>)}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,maxWidth:220,margin:"0 auto"}}>
            {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((d,i)=>(
              <button key={i} onClick={()=>{if(d==="⌫")setPin(p=>p.slice(0,-1));else if(d!=="")handlePin(d);}}
                style={{background:d===""?"transparent":"#fff",border:d===""?"none":"1.5px solid #E5E7EB",borderRadius:12,height:54,color:"#111",fontSize:18,fontWeight:500,cursor:d===""?"default":"pointer",fontFamily:"'Inter',sans-serif",transition:"all 0.1s"}}
                onMouseEnter={e=>{if(d!==""){e.currentTarget.style.background="#FFF7F0";e.currentTarget.style.borderColor="#E8622A";}}}
                onMouseLeave={e=>{if(d!==""){e.currentTarget.style.background="#fff";e.currentTarget.style.borderColor="#E5E7EB";}}}
              >{d}</button>
            ))}
          </div>
          {err && <div style={{color:"#DC2626",fontSize:12,marginTop:14}}>{err}</div>}
        </div>
      )}
    </div>
  );
}

// ── NOVA INPUT ─────────────────────────────────────────────────────────────
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
    const proyList = projects.map(p=>`${p.id}=${p.name}`).join(",");
    const userList = users.map(u=>`${u.id}=${u.name}`).join(",");
    try {
      const res = await fetch("/api/nova", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          model:"claude-sonnet-4-20250514", max_tokens:500,
          system:`Eres NOVA. Extrae datos y responde SOLO JSON sin markdown:
{"title":"...","project_id":N,"assignee_id":N_OR_NULL,"type":"...","due_date":"YYYY-MM-DD","priority":"urgente|alta|media|baja","notes":"..."}
Proyectos: ${proyList}. Usuarios: ${userList}.
Tipos: Llamada,Reunión,Contrato,Compra,Inspección,Aprobación,Visita a obra,Otro.
Hoy: ${new Date().toISOString().split("T")[0]}.`,
          messages:[{role:"user",content:texto}]
        })
      });
      const data = await res.json();
      const t = data.content?.[0]?.text || "{}";
      setResult(JSON.parse(t.replace(/```json|```/g,"").trim()));
    } catch { setResult({error:"No pude entender. Intenta de nuevo."}); }
    setLoading(false);
  }

  async function confirmar() {
    if (!result || result.error) return;
    await supabase.from("tasks").insert({...result, created_by:currentUser.id});
    setTexto(""); setResult(null); onTaskCreated();
  }

  const gP = id => projects.find(p=>p.id===id);
  const gU = id => users.find(u=>u.id===id);

  return (
    <div style={{background:"#fff",border:"1.5px solid #FED7AA",borderRadius:12,padding:14,marginBottom:14}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
        <div style={{width:26,height:26,flexShrink:0}}><svg width="24" height="24" viewBox="0 0 80 80"><circle cx="40" cy="40" r="38" fill="#1F2937"/><text x="40" y="55" textAnchor="middle" fontFamily="Inter,sans-serif" fontSize="40" fontWeight="700" fill="#E8622A">N</text><circle cx="58" cy="20" r="10" fill="#E8622A"/></svg></div>
        <span style={{fontSize:13,fontWeight:600,color:"#E8622A"}}>NOVA — Crear tarea</span>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:8}}>
        <input value={texto} onChange={e=>setTexto(e.target.value)} onKeyDown={e=>e.key==="Enter"&&procesar()} placeholder='"Tarea para Hector, inspección BdP Condado, urgente mañana"'
          style={{flex:1,background:"#FFF7F0",border:"1.5px solid #FED7AA",borderRadius:8,color:"#111",fontSize:13,fontFamily:"'Inter',sans-serif",padding:"8px 12px",outline:"none"}}/>
        <button onClick={startVoice} style={{width:36,background:grabando?"#FEE2E2":"#FFF7F0",border:`1.5px solid ${grabando?"#DC2626":"#FED7AA"}`,borderRadius:8,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,animation:grabando?"pulse 1s infinite":"none"}}>🎤</button>
        <button onClick={procesar} disabled={!texto.trim()||loading} style={{background:texto.trim()&&!loading?"#E8622A":"#F3F4F6",border:"none",borderRadius:8,padding:"8px 14px",color:texto.trim()&&!loading?"#fff":"#9CA3AF",fontSize:12,fontWeight:600,cursor:texto.trim()&&!loading?"pointer":"default",fontFamily:"'Inter',sans-serif",whiteSpace:"nowrap"}}>
          {loading?"...":"Crear →"}
        </button>
      </div>
      {result && !result.error && (
        <div style={{background:"#F0FDF4",border:"1.5px solid #BBF7D0",borderRadius:8,padding:10}}>
          <div style={{fontSize:11,color:"#059669",fontWeight:600,marginBottom:4}}>✓ NOVA entendió:</div>
          <div style={{fontSize:13,fontWeight:600,color:"#111",marginBottom:2}}>{result.title}</div>
          <div style={{fontSize:11,color:"#6B7280"}}>{gP(result.project_id)?.name} · {result.assignee_id?gU(result.assignee_id)?.name:"Sin asignar"} · {result.due_date} · {result.priority}</div>
          <div style={{display:"flex",gap:8,marginTop:8}}>
            <button onClick={()=>setResult(null)} style={{flex:1,background:"#fff",border:"1.5px solid #E5E7EB",borderRadius:6,padding:6,color:"#6B7280",fontSize:12,cursor:"pointer"}}>Cancelar</button>
            <button onClick={confirmar} style={{flex:2,background:"#059669",border:"none",borderRadius:6,padding:6,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}>✓ Confirmar</button>
          </div>
        </div>
      )}
      {result?.error && <div style={{color:"#DC2626",fontSize:12,marginTop:6}}>{result.error}</div>}
    </div>
  );
}

// ── BRIEFING ───────────────────────────────────────────────────────────────
function AIBriefing({ tasks, currentUser, users, projects }) {
  const [texto, setTexto] = useState("");
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const gP = id => projects.find(p=>p.id===id);
  const gU = id => users.find(u=>u.id===id);

  async function obtener() {
    setLoading(true); setVisible(true);
    const todas = tasks.length ? tasks.map(t => {
      const d = daysUntil(t.due_date);
      const estado = t.status==="listo"?"✅ COMPLETA":t.status==="en-progreso"?"🔧 EN PROGRESO":t.status==="bloqueado"?"🚫 BLOQUEADA":"⏳ PENDIENTE";
      const fecha = t.status==="listo"?"completada":d<0?`vencida ${Math.abs(d)}d`:d===0?"vence HOY":`vence en ${d}d`;
      return `• ${t.title} | ${gP(t.project_id)?.name} | ${t.assignee_id?gU(t.assignee_id)?.name:"sin asignar"} | ${estado} | ${fecha} | ${t.priority}`;
    }).join("\n") : "Sin tareas.";
    try {
      const res = await fetch("/api/nova", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          model:"claude-sonnet-4-20250514", max_tokens:700,
          system:`Eres NOVA, asistente de ${currentUser.name} de HCA Studio. Genera un briefing completo en español con estas secciones:

🔴 VENCIDAS Y URGENTES — lista cada tarea vencida con nombre, responsable y días de retraso
🔧 EN PROGRESO — tareas actualmente en progreso con responsable
⏳ PENDIENTES — todas las tareas pendientes con responsable y fecha límite  
✅ COMPLETADAS — tareas terminadas recientemente
💡 RECOMENDACIÓN — qué hacer primero hoy

Sé específico con nombres de personas y proyectos. Si no hay tareas en alguna categoría, escribe "Ninguna". NUNCA omitas tareas vencidas.`,
          messages:[{role:"user",content:`Analiza TODAS estas tareas cuidadosamente:\n${todas}\n\nIMPORTANTE: Si hay tareas VENCIDAS o URGENTES, menciónalas explícitamente. NUNCA digas que todo está en orden si hay tareas vencidas o pendientes. Sé específico con nombres y fechas.`}]
        })
      });
      const data = await res.json();
      const respuesta = data.content?.[0]?.text;
      if (!respuesta) {
        setTexto("⚠️ NOVA no respondió. Verifica que tienes créditos en console.anthropic.com");
      } else {
        setTexto(respuesta);
      }
    } catch(e) { setTexto("⚠️ Error de conexión: " + (e.message||"intenta de nuevo")); }
    setLoading(false);
  }

  if (!visible) return (
    <button onClick={obtener} style={{background:"linear-gradient(135deg,#E8622A,#FF9500)",border:"none",borderRadius:10,padding:"12px 16px",color:"#fff",fontFamily:"'Inter',sans-serif",fontSize:13,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:10,width:"100%",boxShadow:"0 4px 12px rgba(232,98,42,0.2)",marginBottom:14}}>
      <div style={{width:22,height:22,flexShrink:0}}><svg width="24" height="24" viewBox="0 0 80 80"><circle cx="40" cy="40" r="38" fill="#1F2937"/><text x="40" y="55" textAnchor="middle" fontFamily="Inter,sans-serif" fontSize="40" fontWeight="700" fill="#E8622A">N</text><circle cx="58" cy="20" r="10" fill="#E8622A"/></svg></div>
      <div style={{textAlign:"left"}}><div>NOVA — Briefing del día</div><div style={{fontSize:10,opacity:0.8}}>Resumen completo de proyectos y responsables</div></div>
      <span style={{marginLeft:"auto"}}>→</span>
    </button>
  );

  return (
    <div style={{background:"#fff",border:"1.5px solid #FED7AA",borderRadius:12,padding:14,marginBottom:14}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
        <div style={{width:26,height:26,flexShrink:0}}><svg width="24" height="24" viewBox="0 0 80 80"><circle cx="40" cy="40" r="38" fill="#1F2937"/><text x="40" y="55" textAnchor="middle" fontFamily="Inter,sans-serif" fontSize="40" fontWeight="700" fill="#E8622A">N</text><circle cx="58" cy="20" r="10" fill="#E8622A"/></svg></div>
        <span style={{fontSize:13,fontWeight:600,color:"#E8622A"}}>NOVA — Briefing</span>
        <button onClick={()=>setVisible(false)} style={{marginLeft:"auto",background:"none",border:"none",color:"#9CA3AF",cursor:"pointer",fontSize:18}}>×</button>
      </div>
      {loading ? <div style={{color:"#9CA3AF",fontSize:13}}>Analizando {tasks.length} tareas...</div>
        : <div dangerouslySetInnerHTML={{__html: texto}} style={{fontSize:13,lineHeight:1.6}} className="nova-briefing-container"/>}
      {!loading && <button onClick={obtener} style={{marginTop:10,background:"#FFF7F0",border:"1.5px solid #FED7AA",borderRadius:6,padding:"5px 12px",color:"#E8622A",fontSize:11,cursor:"pointer",fontWeight:600}}>↺ Actualizar</button>}
    </div>
  );
}

// ── FILE UPLOAD & VIEWER ───────────────────────────────────────────────────
function FileSection({ taskId }) {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => { fetchFiles(); }, [taskId]);

  async function fetchFiles() {
    const { data } = await supabase.storage.from("task-files").list(`task-${taskId}/`, { sortBy:{column:"created_at",order:"desc"} });
    setFiles(data || []);
  }

  async function uploadFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `task-${taskId}/${Date.now()}-${safeName}`;
      const { error } = await supabase.storage.from("task-files").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || "application/octet-stream"
      });
      if (error) { console.error("Upload error:", error); alert("Error subiendo: " + error.message); }
      else { await fetchFiles(); }
    } catch(err) { console.error(err); alert("Error: " + err.message); }
    setUploading(false);
    e.target.value = "";
  }

  async function uploadFromClipboard(e) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) return;
        setUploading(true);
        try {
          const path = `task-${taskId}/${Date.now()}-captura.png`;
          const { error } = await supabase.storage.from("task-files").upload(path, file, {
            cacheControl: "3600", upsert: false, contentType: "image/png"
          });
          if (error) alert("Error: " + error.message);
          else { await fetchFiles(); }
        } catch(err) { alert("Error: " + err.message); }
        setUploading(false);
        break;
      }
    }
  }

  function getUrl(name) {
    const { data } = supabase.storage.from("task-files").getPublicUrl(`task-${taskId}/${name}`);
    return data.publicUrl;
  }

  function fileIcon(name) {
    const ext = name.split(".").pop().toLowerCase();
    if (["jpg","jpeg","png","gif","webp","heic"].includes(ext)) return "🖼";
    if (["pdf"].includes(ext)) return "📄";
    if (["doc","docx"].includes(ext)) return "📝";
    if (["xls","xlsx"].includes(ext)) return "📊";
    return "📎";
  }

  function isImage(name) {
    return ["jpg","jpeg","png","gif","webp","heic"].includes(name.split(".").pop().toLowerCase());
  }

  async function deleteFile(name) {
    await supabase.storage.from("task-files").remove([`task-${taskId}/${name}`]);
    fetchFiles();
  }

  return (
    <div style={{marginTop:14,paddingTop:12,borderTop:"1px solid #F3F4F6"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
        <div style={{fontSize:12,fontWeight:600,color:"#6B7280"}}>📎 Archivos ({files.length})</div>
        <button onClick={()=>fileRef.current?.click()} disabled={uploading} style={{background:"#F3F4F6",border:"1px solid #E5E7EB",borderRadius:6,padding:"4px 10px",color:"#374151",fontSize:11,cursor:"pointer",fontWeight:500}}>
          {uploading?"Subiendo...":"+ Subir archivo"}
        </button>
        <input ref={fileRef} type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={uploadFile} style={{display:"none"}}/>
      </div>
      <div 
        onPaste={uploadFromClipboard} 
        tabIndex={0}
        contentEditable={true}
        suppressContentEditableWarning={true}
        onKeyDown={e=>{if(e.key!=="v"||!e.metaKey&&!e.ctrlKey)e.preventDefault();}}
        style={{background:"#F9FAFB",border:"1.5px dashed #E5E7EB",borderRadius:8,padding:"8px 12px",fontSize:11,color:"#9CA3AF",cursor:"pointer",outline:"none",marginBottom:8,userSelect:"none"}}
        onClick={e=>e.currentTarget.focus()}
      >
        {uploading?"Subiendo captura...":"📋 Click aquí y pega captura (Cmd+V o Ctrl+V)"}
      </div>
      {files.length > 0 && (
        <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
          {files.map(f => (
            <div key={f.name} style={{background:"#F9FAFB",border:"1px solid #E5E7EB",borderRadius:8,overflow:"hidden",width:isImage(f.name)?90:160}}>
              {isImage(f.name) ? (
                <a href={getUrl(f.name)} target="_blank" rel="noreferrer">
                  <img src={getUrl(f.name)} alt={f.name} style={{width:"100%",height:70,objectFit:"cover",display:"block"}}/>
                </a>
              ) : (
                <a href={getUrl(f.name)} target="_blank" rel="noreferrer" download style={{display:"flex",alignItems:"center",gap:6,padding:"8px 10px",textDecoration:"none"}}>
                  <span style={{fontSize:18}}>{fileIcon(f.name)}</span>
                  <span style={{fontSize:11,color:"#374151",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name.replace(/^\d+-/,"")}</span>
                </a>
              )}
              <div style={{display:"flex",justifyContent:"space-between",padding:"4px 6px",borderTop:"1px solid #F3F4F6"}}>
                <a href={getUrl(f.name)} download target="_blank" rel="noreferrer" style={{fontSize:10,color:"#2563EB",textDecoration:"none",fontWeight:500}}>⬇ Descargar</a>
                <button onClick={()=>deleteFile(f.name)} style={{background:"none",border:"none",color:"#DC2626",fontSize:10,cursor:"pointer",padding:0}}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── CHAT ───────────────────────────────────────────────────────────────────
function ChatTarea({ task, currentUser, users, projects, onClose }) {
  const [texto, setTexto] = useState("");
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);

  const bottomRef = useRef(null);
  const channelRef = useRef(null);
  const gU = id => users.find(u=>u.id===id);
  const gP = id => projects.find(p=>p.id===id);
  const proy = gP(task.project_id);

  useEffect(() => {
    fetchComments();
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    const chName = `chat-task-${task.id}-${Math.random().toString(36).slice(2)}`;
    const ch = supabase
      .channel(chName)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "comments",
        filter: `task_id=eq.${task.id}`
      }, payload => {
        setComments(prev => {
          if (prev.some(c => c.id === payload.new.id)) return prev;
          return [...prev, payload.new];
        });
      })
      .subscribe((status) => {
        console.log("Chat channel status:", status);
      });
    channelRef.current = ch;
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [task.id]);

  useEffect(() => { bottomRef.current?.scrollIntoView({behavior:"smooth"}); }, [comments]);

  async function fetchComments() {
    const { data, error } = await supabase.from("comments").select("*").eq("task_id", task.id).order("created_at", {ascending:true});
    if (!error) setComments(data || []);
    setLoading(false);
  }

  async function enviar() {
    if (!texto.trim()) return;
    const msg = texto.trim(); setTexto("");
    const { error } = await supabase.from("comments").insert({ task_id: task.id, user_id: currentUser.id, text: msg });
    if (error) console.error("Error sending comment:", error);
  }

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.25)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:200}}>
      <div style={{background:"#fff",borderRadius:"20px 20px 0 0",width:"100%",maxWidth:580,maxHeight:"88vh",display:"flex",flexDirection:"column",boxShadow:"0 -10px 40px rgba(0,0,0,0.1)",fontFamily:"'Inter',sans-serif"}}>
        <div style={{padding:"12px 18px 0",flexShrink:0}}>
          <div style={{width:36,height:4,background:"#E5E7EB",borderRadius:2,margin:"0 auto 12px"}}/>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
            <div style={{width:4,height:32,borderRadius:2,background:proy?.color,flexShrink:0}}/>
            <div style={{flex:1}}>
              <div style={{fontSize:14,fontWeight:600,color:"#111"}}>{task.title}</div>
              <div style={{fontSize:11,color:"#9CA3AF"}}>{proy?.name} · Chat en vivo</div>
            </div>
            <button onClick={onClose} style={{background:"#F3F4F6",border:"none",borderRadius:8,width:30,height:30,color:"#6B7280",cursor:"pointer",fontSize:15}}>×</button>
          </div>
          <div style={{display:"flex",gap:4,borderBottom:"1px solid #F3F4F6",marginBottom:0}}>
            <button style={{padding:"7px 14px",border:"none",borderBottom:"2px solid #E8622A",background:"transparent",color:"#E8622A",fontSize:12,fontWeight:600,cursor:"default",marginBottom:-1}}>
              💬 Chat en vivo
            </button>
          </div>
        </div>

        {true && (
          <>
            <div style={{flex:1,overflowY:"auto",padding:"12px 18px",display:"flex",flexDirection:"column",gap:10,minHeight:200}}>
              {loading && <div style={{textAlign:"center",color:"#9CA3AF",fontSize:12,padding:"20px 0"}}>Cargando...</div>}
              {!loading && comments.length === 0 && <div style={{textAlign:"center",color:"#9CA3AF",fontSize:12,padding:"30px 0"}}>💬 Sin mensajes aún. Escribe el primero.</div>}
              {comments.map(c => {
                const autor = gU(c.user_id);
                const esMio = c.user_id === currentUser.id;
                return (
                  <div key={c.id} style={{display:"flex",flexDirection:esMio?"row-reverse":"row",gap:8,alignItems:"flex-end"}}>
                    {!esMio && <Avatar name={autor?.name||"?"} size={26} color={autor?.color||"#2563EB"}/>}
                    <div style={{maxWidth:"72%"}}>
                      {!esMio && <div style={{fontSize:10,color:"#9CA3AF",marginBottom:3,paddingLeft:2}}>{autor?.name}</div>}
                      <div style={{background:esMio?"#E8622A":"#F3F4F6",borderRadius:esMio?"14px 3px 14px 14px":"3px 14px 14px 14px",padding:"8px 12px"}}>
                        <div style={{color:esMio?"#fff":"#111",fontSize:13,lineHeight:1.5}}>{c.text}</div>
                      </div>
                      <div style={{fontSize:10,color:"#D1D5DB",marginTop:2,textAlign:esMio?"right":"left"}}>{timeAgo(c.created_at)}</div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef}/>
            </div>
            <div style={{padding:"10px 14px 18px",borderTop:"1px solid #F3F4F6",flexShrink:0,display:"flex",gap:8,alignItems:"center"}}>
              <Avatar name={currentUser.name} size={30} color={currentUser.color||"#E8622A"}/>
              <input value={texto} onChange={e=>setTexto(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();enviar();}}} placeholder="Escribe un mensaje... (Enter para enviar)"
                style={{flex:1,background:"#F9FAFB",border:"1.5px solid #E5E7EB",borderRadius:10,color:"#111",fontSize:13,fontFamily:"'Inter',sans-serif",padding:"9px 12px",outline:"none"}}/>
              <button onClick={enviar} disabled={!texto.trim()} style={{background:texto.trim()?"#E8622A":"#F3F4F6",border:"none",borderRadius:10,width:38,height:38,color:texto.trim()?"#fff":"#9CA3AF",cursor:texto.trim()?"pointer":"default",fontSize:16,flexShrink:0}}>↑</button>
            </div>
          </>
        )}


      </div>
    </div>
  );
}

// ── WHATSAPP ───────────────────────────────────────────────────────────────
function WhatsApp({ task, users, projects }) {
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const gU = id => users.find(u=>u.id===id);
  const gP = id => projects.find(p=>p.id===id);
  const m = task.assignee_id ? gU(task.assignee_id) : null;
  const p = gP(task.project_id);
  const d = daysUntil(task.due_date);
  const followup = task.priority==="urgente"?"cada 3h":task.priority==="alta"?"cada 6h":"diario";

  async function generar() {
    setLoading(true); setOpen(true);
    const vence = task.status==="listo"?"está completada":d<0?`tiene ${Math.abs(d)} días de retraso`:d===0?"vence HOY":`vence en ${d} días`;
    try {
      const res = await fetch("/api/nova",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:300,system:"Recordatorio WhatsApp para director de construcción. Español. Máx 3 oraciones. Directo. Solo el mensaje.",messages:[{role:"user",content:`Para ${m?.name||"equipo"}: "${task.title}" en ${p?.name}. ${vence}. Prioridad: ${task.priority}.`}]})});
      const data = await res.json(); setMsg(data.content?.[0]?.text||"");
    } catch { setMsg("Error."); }
    setLoading(false);
  }

  return (
    <>
      <button onClick={generar} style={{background:"#22C55E",border:"none",borderRadius:6,padding:"5px 10px",color:"#fff",fontSize:11,fontFamily:"'Inter',sans-serif",fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>📲 WA</button>
      {open && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.3)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,padding:20}} onClick={()=>setOpen(false)}>
          <div style={{background:"#fff",borderRadius:16,padding:20,maxWidth:400,width:"100%",boxShadow:"0 20px 60px rgba(0,0,0,0.15)",fontFamily:"'Inter',sans-serif"}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
              <span style={{fontSize:22}}>📲</span>
              <div><div style={{fontSize:14,fontWeight:700,color:"#111"}}>WhatsApp</div>{m&&<div style={{color:"#6B7280",fontSize:12}}>{m.name} · seguimiento {followup}</div>}</div>
              <button onClick={()=>setOpen(false)} style={{marginLeft:"auto",background:"none",border:"none",color:"#9CA3AF",cursor:"pointer",fontSize:20}}>×</button>
            </div>
            {loading ? <div style={{color:"#9CA3AF",fontSize:12,padding:"16px 0",textAlign:"center"}}>NOVA redactando...</div>
              : <>
                  <textarea value={msg} onChange={e=>setMsg(e.target.value)} style={{width:"100%",minHeight:90,background:"#F9FAFB",border:"1.5px solid #E5E7EB",borderRadius:10,color:"#111",fontSize:13,fontFamily:"'Inter',sans-serif",padding:10,resize:"vertical",boxSizing:"border-box",lineHeight:1.5,outline:"none"}}/>
                  <div style={{display:"flex",gap:8,marginTop:10}}>
                    <button onClick={generar} style={{flex:1,background:"#F9FAFB",border:"1.5px solid #E5E7EB",borderRadius:8,padding:8,color:"#6B7280",fontSize:12,cursor:"pointer"}}>↺</button>
                    {m ? <button onClick={()=>window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`,"_blank")} style={{flex:2,background:"#22C55E",border:"none",borderRadius:8,padding:8,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}}>Abrir WhatsApp →</button>
                      : <div style={{flex:2,color:"#9CA3AF",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center"}}>Sin asignado</div>}
                  </div>
                </>}
          </div>
        </div>
      )}
    </>
  );
}

// ── TARJETA TAREA ──────────────────────────────────────────────────────────
function TarjetaTarea({ task, currentUser, users, projects, onCambiarEstado, onEditar, onAbrirChat, commentCount }) {
  const gP = id => projects.find(p=>p.id===id);
  const gU = id => users.find(u=>u.id===id);
  const proy = gP(task.project_id);
  const asig = task.assignee_id ? gU(task.assignee_id) : null;
  const crea = gU(task.created_by);
  const pC = PRIORIDAD[task.priority] || PRIORIDAD.media;
  const eC = ESTADO[task.status] || ESTADO.pendiente;
  const admin = esAdmin(currentUser.role);
  // Solo el asignado puede cambiar SU tarea. Admins pueden todo. Nadie puede cambiar la tarea de otro miembro.
  const esMiTarea = task.assignee_id === currentUser.id;
  const puedeCambiar = admin || esMiTarea;
  const esListo = task.status === "listo";

  function handleEstado(nuevoEstado) {
    if (!puedeCambiar) return;
    onCambiarEstado(task.id, nuevoEstado);
  }

  return (
    <div style={{background:"#fff",border:"1px solid #E5E7EB",borderRadius:10,padding:"12px 14px",marginBottom:8,borderLeft:`3px solid ${proy?.color||"#E8622A"}`,opacity:esListo?0.65:1,fontFamily:"'Inter',sans-serif",transition:"opacity 0.2s"}}>
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8,marginBottom:8}}>
        <div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center"}}>
          <span style={{background:pC.bg,color:pC.color,fontSize:11,fontWeight:600,padding:"2px 8px",borderRadius:20}}>{pC.label}</span>
          <span style={{background:"#F3F4F6",color:"#6B7280",fontSize:11,padding:"2px 8px",borderRadius:20}}>{task.type}</span>
          <span style={{color:eC.color,fontSize:11}}>{eC.icon} {eC.label}</span>
        </div>
        <FechaBadge due={task.due_date} status={task.status}/>
      </div>
      <div style={{fontSize:14,fontWeight:600,color:"#111",marginBottom:task.notes?6:8,lineHeight:1.4}}>{task.title}</div>
      {task.notes && <div style={{color:"#6B7280",fontSize:12,marginBottom:8,lineHeight:1.5}}>{task.notes}</div>}
      <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:10}}>
        <span style={{background:`${proy?.color}18`,color:proy?.color,fontSize:11,padding:"2px 8px",borderRadius:20,fontWeight:600}}>{proy?.name}</span>
        {asig ? <div style={{display:"flex",alignItems:"center",gap:4}}><Avatar name={asig.name} size={18} color={asig.color||proy?.color}/><span style={{color:"#374151",fontSize:12}}>{asig.name}</span></div>
          : <span style={{color:"#DC2626",fontSize:11}}>⚠ Sin asignar</span>}
        {!esListo && admin && <span style={{color:"#D1D5DB",fontSize:10}}>{task.priority==="urgente"?"c/3h":task.priority==="alta"?"c/6h":"diario"}</span>}
        {crea && <span style={{color:"#D1D5DB",fontSize:10}}>por {crea.name}</span>}
      </div>
      <FileSection taskId={task.id}/>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",paddingTop:8,borderTop:"1px solid #F9FAFB"}}>
        {puedeCambiar && (
          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
            {Object.entries(ESTADO).map(([k,v])=>(
              <button key={k} onClick={()=>handleEstado(k)}
                style={{background:task.status===k?v.color:"#F3F4F6",border:`1px solid ${task.status===k?v.color:"#E5E7EB"}`,borderRadius:6,padding:"4px 8px",color:task.status===k?"#fff":"#6B7280",fontSize:10,fontWeight:task.status===k?600:400,cursor:"pointer",fontFamily:"'Inter',sans-serif",whiteSpace:"nowrap",transition:"all 0.15s"}}>
                {v.icon} {v.label}
              </button>
            ))}
          </div>
        )}
        <button onClick={()=>onAbrirChat(task)} style={{background:"#F9FAFB",border:"1px solid #E5E7EB",borderRadius:6,padding:"5px 10px",color:"#374151",fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",gap:4,fontFamily:"'Inter',sans-serif"}}>
          💬 {commentCount>0?<span style={{background:"#E8622A",color:"#fff",fontSize:9,fontWeight:700,padding:"0 5px",borderRadius:10}}>{commentCount}</span>:"Chat"}
        </button>
        {admin && <button onClick={()=>onEditar(task)} style={{background:"#F9FAFB",border:"1px solid #E5E7EB",borderRadius:6,padding:"5px 10px",color:"#6B7280",fontSize:11,cursor:"pointer"}}>✏️</button>}
        {admin && <WhatsApp task={task} users={users} projects={projects}/>}
      </div>
    </div>
  );
}

// ── MODAL TAREA ────────────────────────────────────────────────────────────
function ModalTarea({ onCerrar, onGuardar, editTask, currentUser, users, projects }) {
  const admin = esAdmin(currentUser.role);
  const [form, setForm] = useState(editTask ? {
    title:editTask.title, project_id:editTask.project_id, assignee_id:editTask.assignee_id,
    type:editTask.type, due_date:editTask.due_date, priority:editTask.priority,
    status:editTask.status, notes:editTask.notes||""
  } : { title:"", project_id:projects[0]?.id||1, assignee_id:currentUser.id, type:"Llamada", due_date:"", priority:"media", status:"pendiente", notes:"" });
  const inp = (f,v) => setForm(p=>({...p,[f]:v}));
  const lS = {color:"#6B7280",fontSize:11,fontWeight:500,marginBottom:4,display:"block"};
  const iS = {width:"100%",background:"#F9FAFB",border:"1px solid #E5E7EB",borderRadius:8,color:"#111",padding:"9px 12px",fontSize:13,fontFamily:"'Inter',sans-serif",boxSizing:"border-box",outline:"none"};

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.25)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:150,padding:20}} onClick={onCerrar}>
      <div style={{background:"#fff",borderRadius:16,padding:22,maxWidth:480,width:"100%",boxShadow:"0 20px 60px rgba(0,0,0,0.12)",maxHeight:"90vh",overflowY:"auto",fontFamily:"'Inter',sans-serif"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
          <div style={{fontSize:15,fontWeight:700,color:"#111"}}>{editTask?"Editar tarea":"Nueva tarea"}</div>
          <button onClick={onCerrar} style={{background:"#F3F4F6",border:"none",borderRadius:6,width:28,height:28,color:"#6B7280",cursor:"pointer",fontSize:15}}>×</button>
        </div>
        <div style={{display:"grid",gap:12}}>
          <div><label style={lS}>Título *</label><input value={form.title} onChange={e=>inp("title",e.target.value)} placeholder="¿Qué hay que hacer?" style={iS} onFocus={e=>e.target.style.borderColor="#E8622A"} onBlur={e=>e.target.style.borderColor="#E5E7EB"}/></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div><label style={lS}>Proyecto</label><select value={form.project_id} onChange={e=>inp("project_id",Number(e.target.value))} style={iS}>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
            <div><label style={lS}>Tipo</label><select value={form.type} onChange={e=>inp("type",e.target.value)} style={iS}>{TIPOS.map(t=><option key={t}>{t}</option>)}</select></div>
            <div><label style={lS}>Asignar a</label><select value={form.assignee_id||""} onChange={e=>inp("assignee_id",e.target.value?Number(e.target.value):null)} style={iS}><option value="">Sin asignar</option>{users.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
            <div><label style={lS}>Prioridad</label><select value={form.priority} onChange={e=>inp("priority",e.target.value)} style={iS} disabled={!admin}>{Object.entries(PRIORIDAD).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></div>
          </div>
          <div><label style={lS}>Fecha límite *</label><input type="date" value={form.due_date} onChange={e=>inp("due_date",e.target.value)} style={iS} onFocus={e=>e.target.style.borderColor="#E8622A"} onBlur={e=>e.target.style.borderColor="#E5E7EB"}/></div>
          <div><label style={lS}>Notas</label><textarea value={form.notes} onChange={e=>inp("notes",e.target.value)} placeholder="Proveedor, contacto, contexto..." style={{...iS,minHeight:60,resize:"vertical"}}/></div>
        </div>
        {(!form.title||!form.due_date) ? <div style={{color:"#9CA3AF",fontSize:11,marginTop:12,textAlign:"center"}}>Completa título y fecha</div>
          : <button onClick={()=>{onGuardar(form,editTask?.id);onCerrar();}} style={{width:"100%",marginTop:16,background:"#E8622A",border:"none",borderRadius:10,padding:12,color:"#fff",fontFamily:"'Inter',sans-serif",fontSize:14,fontWeight:600,cursor:"pointer",boxShadow:"0 4px 12px rgba(232,98,42,0.25)"}}>
              {editTask?"Guardar cambios":"Agregar tarea"}
            </button>}
      </div>
    </div>
  );
}

// ── PANEL AJUSTES ──────────────────────────────────────────────────────────
function PanelAjustes({ users, setUsers, projects, setProjects, onClose }) {
  const [tab, setTab] = useState("usuarios");
  const [editU, setEditU] = useState(null);
  const [editP, setEditP] = useState(null);
  const [newU, setNewU] = useState(false);
  const [newP, setNewP] = useState(false);
  const emptyUser = { id:Date.now(), name:"", role:"member", pin:"", avatar:"", color:"#2563EB" };
  const emptyProject = { id:Date.now(), name:"", color:"#E8622A" };

  function saveUsers(updated) { setUsers(updated); saveToStorage("foreman_users", updated); }
  function saveProjects(updated) { setProjects(updated); saveToStorage("foreman_projects", updated); }

  function saveUser(u) {
    const updated = users.find(x=>x.id===u.id) ? users.map(x=>x.id===u.id?{...u,avatar:initials(u.name)}:x) : [...users,{...u,id:Date.now(),avatar:initials(u.name)}];
    saveUsers(updated); setEditU(null); setNewU(false);
  }
  function deleteUser(id) { if(window.confirm("¿Eliminar este usuario?")) saveUsers(users.filter(u=>u.id!==id)); }
  function saveProject(p) {
    const updated = projects.find(x=>x.id===p.id) ? projects.map(x=>x.id===p.id?p:x) : [...projects,{...p,id:Date.now()}];
    saveProjects(updated); setEditP(null); setNewP(false);
  }
  function deleteProject(id) { if(window.confirm("¿Eliminar este proyecto?")) saveProjects(projects.filter(p=>p.id!==id)); }

  const tabS = a => ({padding:"7px 16px",borderRadius:6,border:"none",cursor:"pointer",fontFamily:"'Inter',sans-serif",fontSize:12,fontWeight:600,background:a?"#E8622A":"transparent",color:a?"#fff":"#6B7280"});
  const iS = {width:"100%",background:"#F9FAFB",border:"1px solid #E5E7EB",borderRadius:8,color:"#111",padding:"8px 10px",fontSize:13,fontFamily:"'Inter',sans-serif",boxSizing:"border-box",outline:"none"};

  function UserForm({ u, onSave, onCancel }) {
    const [f, setF] = useState({...u});
    return (
      <div style={{background:"#F9FAFB",borderRadius:10,padding:12,marginBottom:8,border:"1.5px solid #E8622A"}}>
        <div style={{display:"grid",gap:8}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <input value={f.name} onChange={e=>setF(p=>({...p,name:e.target.value}))} placeholder="Nombre completo" style={iS}/>
            <input value={f.pin} onChange={e=>setF(p=>({...p,pin:e.target.value}))} placeholder="PIN (4 dígitos)" maxLength={4} style={iS}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:8,alignItems:"center"}}>
            <select value={f.role} onChange={e=>setF(p=>({...p,role:e.target.value}))} style={iS}>
              <option value="owner">👑 Director</option>
              <option value="assistant">🤝 Asistente</option>
              <option value="member">👷 Equipo</option>
            </select>
            <input type="color" value={f.color||"#2563EB"} onChange={e=>setF(p=>({...p,color:e.target.value}))} style={{width:38,height:38,border:"1px solid #E5E7EB",borderRadius:6,cursor:"pointer",padding:2}}/>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>f.name&&f.pin&&onSave(f)} disabled={!f.name||!f.pin} style={{flex:2,background:f.name&&f.pin?"#E8622A":"#F3F4F6",border:"none",borderRadius:6,padding:"8px",color:f.name&&f.pin?"#fff":"#9CA3AF",fontSize:12,fontWeight:600,cursor:f.name&&f.pin?"pointer":"default"}}>Guardar</button>
            <button onClick={onCancel} style={{flex:1,background:"#F3F4F6",border:"none",borderRadius:6,padding:"8px",color:"#6B7280",fontSize:12,cursor:"pointer"}}>Cancelar</button>
          </div>
        </div>
      </div>
    );
  }

  function ProjectForm({ p, onSave, onCancel }) {
    const [f, setF] = useState({...p});
    return (
      <div style={{background:"#F9FAFB",borderRadius:10,padding:12,marginBottom:8,border:"1.5px solid #E8622A"}}>
        <div style={{display:"grid",gap:8}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:8,alignItems:"center"}}>
            <input value={f.name} onChange={e=>setF(p=>({...p,name:e.target.value}))} placeholder="Nombre del proyecto" style={iS}/>
            <input type="color" value={f.color||"#E8622A"} onChange={e=>setF(p=>({...p,color:e.target.value}))} style={{width:38,height:38,border:"1px solid #E5E7EB",borderRadius:6,cursor:"pointer",padding:2}}/>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>f.name&&onSave(f)} disabled={!f.name} style={{flex:2,background:f.name?"#E8622A":"#F3F4F6",border:"none",borderRadius:6,padding:"8px",color:f.name?"#fff":"#9CA3AF",fontSize:12,fontWeight:600,cursor:f.name?"pointer":"default"}}>Guardar</button>
            <button onClick={onCancel} style={{flex:1,background:"#F3F4F6",border:"none",borderRadius:6,padding:"8px",color:"#6B7280",fontSize:12,cursor:"pointer"}}>Cancelar</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.3)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:150,padding:20}} onClick={onClose}>
      <div style={{background:"#fff",borderRadius:16,padding:22,maxWidth:500,width:"100%",boxShadow:"0 20px 60px rgba(0,0,0,0.12)",maxHeight:"90vh",overflowY:"auto",fontFamily:"'Inter',sans-serif"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:15,fontWeight:700,color:"#111"}}>⚙️ Ajustes</div>
          <button onClick={onClose} style={{background:"#F3F4F6",border:"none",borderRadius:6,width:28,height:28,color:"#6B7280",cursor:"pointer",fontSize:15}}>×</button>
        </div>
        <div style={{display:"flex",gap:4,marginBottom:16,background:"#F3F4F6",borderRadius:8,padding:4}}>
          <button onClick={()=>setTab("usuarios")} style={tabS(tab==="usuarios")}>👥 Usuarios</button>
          <button onClick={()=>setTab("proyectos")} style={tabS(tab==="proyectos")}>🏗 Proyectos</button>
        </div>

        {tab === "usuarios" && (
          <div>
            {users.map(u => editU?.id===u.id ? (
              <UserForm key={u.id} u={editU} onSave={saveUser} onCancel={()=>setEditU(null)}/>
            ) : (
              <div key={u.id} style={{background:"#F9FAFB",borderRadius:10,padding:"10px 12px",marginBottom:8,display:"flex",alignItems:"center",gap:10}}>
                <Avatar name={u.name} size={36} color={u.color||"#2563EB"}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:14,fontWeight:600,color:"#111"}}>{u.name}</div>
                  <div style={{fontSize:11,color:"#9CA3AF"}}>{u.role==="owner"?"👑 Director":u.role==="assistant"?"🤝 Asistente":"👷 Equipo"} · PIN: {u.pin}</div>
                </div>
                <button onClick={()=>setEditU({...u})} style={{background:"#fff",border:"1px solid #E5E7EB",borderRadius:6,padding:"4px 8px",color:"#6B7280",fontSize:11,cursor:"pointer",marginRight:4}}>✏️</button>
                {u.role!=="owner"&&<button onClick={()=>deleteUser(u.id)} style={{background:"#FEE2E2",border:"1px solid #FECACA",borderRadius:6,padding:"4px 8px",color:"#DC2626",fontSize:11,cursor:"pointer"}}>✕</button>}
              </div>
            ))}
            {newU ? <UserForm u={emptyUser} onSave={saveUser} onCancel={()=>setNewU(false)}/> : (
              <button onClick={()=>setNewU(true)} style={{width:"100%",background:"#F9FAFB",border:"1.5px dashed #E5E7EB",borderRadius:10,padding:"10px",color:"#6B7280",fontSize:13,cursor:"pointer",fontWeight:500}}>+ Agregar usuario</button>
            )}
          </div>
        )}

        {tab === "proyectos" && (
          <div>
            {projects.map(p => editP?.id===p.id ? (
              <ProjectForm key={p.id} p={editP} onSave={saveProject} onCancel={()=>setEditP(null)}/>
            ) : (
              <div key={p.id} style={{background:"#F9FAFB",borderRadius:10,padding:"10px 12px",marginBottom:8,display:"flex",alignItems:"center",gap:10,borderLeft:`3px solid ${p.color}`}}>
                <div style={{width:12,height:12,borderRadius:"50%",background:p.color,flexShrink:0}}/>
                <div style={{flex:1,fontSize:14,fontWeight:600,color:"#111"}}>{p.name}</div>
                <button onClick={()=>setEditP({...p})} style={{background:"#fff",border:"1px solid #E5E7EB",borderRadius:6,padding:"4px 8px",color:"#6B7280",fontSize:11,cursor:"pointer",marginRight:4}}>✏️</button>
                <button onClick={()=>deleteProject(p.id)} style={{background:"#FEE2E2",border:"1px solid #FECACA",borderRadius:6,padding:"4px 8px",color:"#DC2626",fontSize:11,cursor:"pointer"}}>✕</button>
              </div>
            ))}
            {newP ? <ProjectForm p={emptyProject} onSave={saveProject} onCancel={()=>setNewP(false)}/> : (
              <button onClick={()=>setNewP(true)} style={{width:"100%",background:"#F9FAFB",border:"1.5px dashed #E5E7EB",borderRadius:10,padding:"10px",color:"#6B7280",fontSize:13,cursor:"pointer",fontWeight:500}}>+ Agregar proyecto</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── APP PRINCIPAL ──────────────────────────────────────────────────────────
export default function App() {
  const [users, setUsers] = useState(() => loadFromStorage("foreman_users", USERS_DEFAULT));
  const [projects, setProjects] = useState(() => loadFromStorage("foreman_projects", PROJECTS_DEFAULT));
  const [usuario, setUsuario] = useState(null);
  const [tareas, setTareas] = useState([]);
  const [commentCounts, setCommentCounts] = useState({});
  const [cargando, setCargando] = useState(false);
  const [vista, setVista] = useState("tareas");
  const [filtro, setFiltro] = useState("todas");
  const [filtroP, setFiltroP] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [chatTarea, setChatTarea] = useState(null);
  const [showAjustes, setShowAjustes] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const gP = id => projects.find(p=>p.id===id);
  const gU = id => users.find(u=>u.id===id);

  useEffect(() => {
    if (!usuario) return;
    fetchTareas();
    const tCh = supabase.channel(`tasks-main-${usuario.id}-${Date.now()}`)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"tasks"}, p => setTareas(prev=>[p.new,...prev]))
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"tasks"}, p => setTareas(prev=>prev.map(t=>t.id===p.new.id?p.new:t)))
      .on("postgres_changes",{event:"DELETE",schema:"public",table:"tasks"}, p => setTareas(prev=>prev.filter(t=>t.id!==p.old.id)))
      .subscribe();
    const cCh = supabase.channel(`counts-main-${usuario.id}-${Date.now()}`)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"comments"}, p => setCommentCounts(prev=>({...prev,[p.new.task_id]:(prev[p.new.task_id]||0)+1})))
      .subscribe();
    // Polling silencioso cada 15s - sin mostrar loading
    const poll = setInterval(async () => {
      const { data } = await supabase.from("tasks").select("*").order("created_at",{ascending:false});
      if (data) setTareas(data);
    }, 15000);
    return () => { supabase.removeChannel(tCh); supabase.removeChannel(cCh); clearInterval(poll); };
  }, [usuario]);

  async function fetchTareas() {
    setCargando(true);
    const { data } = await supabase.from("tasks").select("*").order("created_at",{ascending:false});
    setTareas(data||[]);
    if (data?.length) {
      const counts = {};
      await Promise.all(data.map(async t => { const{count}=await supabase.from("comments").select("*",{count:"exact",head:true}).eq("task_id",t.id); counts[t.id]=count||0; }));
      setCommentCounts(counts);
    }
    setCargando(false);
  }

  async function cambiarEstado(id, estado) {
    setTareas(prev => prev.map(t => t.id===id ? {...t, status:estado} : t));
    const { error } = await supabase.from("tasks").update({status:estado}).eq("id",id);
    if (error) { console.error("Error updating status:", error); fetchTareas(); }
  }

  async function guardarTarea(form, id) {
    if (id) await supabase.from("tasks").update(form).eq("id",id);
    else await supabase.from("tasks").insert({...form, created_by:usuario.id});
    setEditTask(null);
  }

  function logout() { saveToStorage("foreman_session", null); localStorage.removeItem("foreman_session"); setUsuario(null); }

  if (!usuario) return <LoginScreen onLogin={setUsuario} users={users}/>;

  const admin = esAdmin(usuario.role);
  // Alertas personalizadas por usuario
  const misAlertasTareas = admin 
    ? tareas.filter(t => t.status !== "listo" && (daysUntil(t.due_date) < 0 || daysUntil(t.due_date) <= 2))
    : tareas.filter(t => (t.assignee_id === usuario.id || t.created_by === usuario.id) && t.status !== "listo" && (daysUntil(t.due_date) < 0 || daysUntil(t.due_date) <= 2));
  const alertCount = misAlertasTareas.length;
  let visibles = admin ? tareas : tareas.filter(t=>t.assignee_id===usuario.id||t.created_by===usuario.id);
  if (busqueda.trim()) {
    const q = busqueda.toLowerCase();
    visibles = visibles.filter(t => 
      t.title?.toLowerCase().includes(q) ||
      t.notes?.toLowerCase().includes(q) ||
      projects.find(p=>p.id===t.project_id)?.name?.toLowerCase().includes(q) ||
      users.find(u=>u.id===t.assignee_id)?.name?.toLowerCase().includes(q)
    );
  }
  if (filtro==="pendiente") visibles = visibles.filter(t=>t.status==="pendiente");
  if (filtro==="urgente")   visibles = visibles.filter(t=>t.status!=="listo"&&(t.priority==="urgente"||daysUntil(t.due_date)<=1));
  if (filtro==="listo")     visibles = visibles.filter(t=>t.status==="listo");
  if (filtroP!=="all")      visibles = visibles.filter(t=>t.project_id===Number(filtroP));

  const pendientes = tareas.filter(t=>t.status!=="listo");
  const vencidas   = pendientes.filter(t=>daysUntil(t.due_date)<0);
  const urgentes   = pendientes.filter(t=>t.priority==="urgente"||daysUntil(t.due_date)<=1);
  const totalMsg   = Object.values(commentCounts).reduce((s,v)=>s+v,0);

  const navItem = (v,label,icon) => (
    <button onClick={()=>setVista(v)} style={{width:"100%",background:vista===v?"#FFF4F0":"transparent",border:"none",borderRight:vista===v?"3px solid #E8622A":"3px solid transparent",padding:"9px 14px",display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontFamily:"'Inter',sans-serif",fontSize:13,fontWeight:vista===v?600:400,color:vista===v?"#E8622A":"#6B7280",textAlign:"left",transition:"all 0.15s"}}>
      <span style={{fontSize:14}}>{icon}</span>{label}
    </button>
  );

  const filtS = a => ({padding:"6px 14px",borderRadius:20,border:a?"none":"1px solid #E5E7EB",cursor:"pointer",fontFamily:"'Inter',sans-serif",fontSize:12,fontWeight:600,background:a?"#1F2937":"#fff",color:a?"#fff":"#6B7280",flexShrink:0});

  return (
    <div style={{minHeight:"100vh",background:"#F8F9FB",fontFamily:"'Inter',sans-serif",display:"flex",flexDirection:"column"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');*{box-sizing:border-box}select option{background:#fff}input,select,textarea{outline:none}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#E5E7EB;border-radius:2px}`}</style>

      {/* HEADER */}
      <div style={{background:"#fff",borderBottom:"1.5px solid #F0F1F3",padding:"0 16px",position:"sticky",top:0,zIndex:100,boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
        <div style={{display:"flex",alignItems:"center",height:54,gap:12,maxWidth:1100,margin:"0 auto",width:"100%"}}>
          <div style={{display:"inline-flex",alignItems:"center",gap:0,flexShrink:0}}>
            <div style={{width:10,height:26,background:"#E8622A",borderRadius:"4px 0 0 4px"}}/>
            <div style={{width:10,height:26,background:"#FF9500"}}/>
            <div style={{width:10,height:26,background:"#FFD60A",borderRadius:"0 4px 4px 0",marginRight:8}}/>
            <span style={{color:"#1F2937",fontSize:16,fontWeight:700,letterSpacing:0.5}}>FOREMAN</span>
            <span style={{background:"#F3F4F6",color:"#9CA3AF",fontSize:9,fontWeight:600,padding:"1px 5px",borderRadius:4,marginLeft:6}}>BETA</span>
          </div>
          <div style={{flex:1,background:"#F3F4F6",borderRadius:8,padding:"4px 12px",display:"flex",alignItems:"center",gap:8,maxWidth:280}}>
            <span style={{fontSize:13}}>🔍</span>
            <input value={busqueda} onChange={e=>setBusqueda(e.target.value)} placeholder="Buscar tareas..." style={{background:"transparent",border:"none",outline:"none",fontSize:12,color:"#374151",width:"100%",fontFamily:"'Inter',sans-serif"}}/>
            {busqueda&&<button onClick={()=>setBusqueda("")} style={{background:"none",border:"none",color:"#9CA3AF",cursor:"pointer",fontSize:14,padding:0}}>×</button>}
          </div>
          <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8}}>
            {alertCount>0&&<button onClick={()=>{setVista("tareas");setFiltro("urgente");setShowAlerts(true);}} style={{background:"#FEE2E2",border:"none",borderRadius:20,padding:"3px 10px",color:"#DC2626",fontSize:11,fontWeight:600,cursor:"pointer"}}>⚠ {alertCount}</button>}
            {admin&&<button onClick={()=>setShowAjustes(true)} style={{background:"#F3F4F6",border:"none",borderRadius:8,padding:"6px 10px",color:"#6B7280",fontSize:12,cursor:"pointer",fontWeight:500}}>⚙️ Ajustes</button>}
            <Avatar name={usuario.name} size={30} color={usuario.color||"#E8622A"}/>
            <button onClick={logout} style={{background:"none",border:"none",color:"#9CA3AF",cursor:"pointer",fontSize:12}}>salir</button>
            <button onClick={()=>{setEditTask(null);setShowModal(true);}} style={{background:"#E8622A",border:"none",borderRadius:8,padding:"7px 14px",color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer",boxShadow:"0 4px 12px rgba(232,98,42,0.25)",display:"flex",alignItems:"center",gap:5,whiteSpace:"nowrap"}}>
              + Nueva tarea
            </button>
          </div>
        </div>
      </div>

      {/* LAYOUT */}
      <div style={{display:"flex",flex:1,maxWidth:1100,margin:"0 auto",width:"100%"}}>
        {/* SIDEBAR */}
        <div style={{width:176,background:"#fff",borderRight:"1px solid #F0F1F3",padding:"16px 0",flexShrink:0,minHeight:"calc(100vh - 54px)"}}>
          <div style={{padding:"0 12px",marginBottom:14}}>
            <div style={{display:"flex",alignItems:"center",gap:8,background:"#F9FAFB",borderRadius:8,padding:"8px 10px"}}>
              <Avatar name={usuario.name} size={26} color={usuario.color||"#E8622A"}/>
              <div>
                <div style={{fontSize:12,fontWeight:600,color:"#111"}}>{usuario.name}</div>
                <div style={{fontSize:10,color:"#9CA3AF"}}>{usuario.role==="owner"?"Director":usuario.role==="assistant"?"Asistente":"Equipo"}</div>
              </div>
            </div>
          </div>
          {navItem("tareas","Tareas","📋")}
          {admin&&navItem("equipo","Equipo","👷")}
          {admin&&navItem("proyectos","Proyectos","🏗")}
          {admin&&(
            <div style={{margin:"14px 12px 0",paddingTop:14,borderTop:"1px solid #F0F1F3"}}>
              <div style={{fontSize:10,color:"#9CA3AF",fontWeight:600,letterSpacing:0.5,marginBottom:8}}>HOY</div>
              {[{l:"Activas",v:pendientes.length,c:"#374151"},{l:"Urgentes",v:urgentes.length,c:"#DC2626"},{l:"Mensajes",v:totalMsg,c:"#2563EB"}].map(s=>(
                <div key={s.l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                  <span style={{fontSize:12,color:"#6B7280"}}>{s.l}</span>
                  <span style={{fontSize:13,fontWeight:700,color:s.c}}>{s.v}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* CONTENT */}
        <div style={{flex:1,padding:"18px 20px",overflowY:"auto",minHeight:"calc(100vh - 54px)"}}>
          {admin&&vista==="tareas"&&<><NovaInput currentUser={usuario} projects={projects} users={users} onTaskCreated={fetchTareas}/><AIBriefing tasks={tareas} currentUser={usuario} users={users} projects={projects}/></>}

          {vista==="tareas"&&(
            <>
              <div style={{display:"flex",gap:6,marginBottom:12,overflowX:"auto",paddingBottom:4}}>
                {[["todas","Todas"],["urgente","Urgentes"],["pendiente","Pendientes"],["listo","Completadas"]].map(([f,l])=>(
                  <button key={f} onClick={()=>setFiltro(f)} style={filtS(filtro===f)}>{l}</button>
                ))}
                {admin&&<select value={filtroP} onChange={e=>setFiltroP(e.target.value)} style={{background:"#fff",border:`1px solid ${filtroP!=="all"?"#E8622A":"#E5E7EB"}`,borderRadius:20,color:filtroP!=="all"?"#E8622A":"#6B7280",padding:"6px 12px",fontSize:12,fontFamily:"'Inter',sans-serif",cursor:"pointer",flexShrink:0}}>
                  <option value="all">Todos los proyectos</option>
                  {projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                </select>}
              </div>
              {cargando?<div style={{textAlign:"center",color:"#9CA3AF",padding:"40px 0",fontSize:13}}>Cargando...</div>
                :visibles.length===0?<div style={{textAlign:"center",color:"#9CA3AF",padding:"60px 0",fontSize:13}}><div style={{fontSize:36,marginBottom:10}}>🏗</div>Sin tareas. Toca "+ Nueva tarea" o dile a NOVA.</div>
                :visibles.sort((a,b)=>{const o={urgente:0,alta:1,media:2,baja:3};if(a.status==="listo"&&b.status!=="listo")return 1;if(b.status==="listo"&&a.status!=="listo")return -1;return(o[a.priority]-o[b.priority])||(daysUntil(a.due_date)-daysUntil(b.due_date));})
                    .map(t=><TarjetaTarea key={t.id} task={t} currentUser={usuario} users={users} projects={projects} onCambiarEstado={cambiarEstado} onEditar={t=>{setEditTask(t);setShowModal(true);}} onAbrirChat={setChatTarea} commentCount={commentCounts[t.id]||0}/>)}
            </>
          )}

          {admin&&vista==="equipo"&&(
            <div style={{display:"grid",gap:10}}>
              {users.map(m=>{
                const mt=tareas.filter(t=>t.assignee_id===m.id&&t.status!=="listo");
                const mo=mt.filter(t=>daysUntil(t.due_date)<0);
                return(
                  <div key={m.id} style={{background:"#fff",borderRadius:12,padding:14,border:"1px solid #E5E7EB"}}>
                    <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:mt.length?12:0}}>
                      <Avatar name={m.name} size={40} color={mo.length>0?"#DC2626":m.color||"#2563EB"}/>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:700,fontSize:14,color:"#111"}}>{m.name}</div>
                        <div style={{fontSize:11,color:"#9CA3AF"}}>{m.role==="owner"?"👑 Director":m.role==="assistant"?"🤝 Asistente":"👷 Equipo"}</div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{color:mo.length>0?"#DC2626":"#E8622A",fontSize:20,fontWeight:700}}>{mt.length}</div>
                        <div style={{color:"#9CA3AF",fontSize:9,fontWeight:600,letterSpacing:0.5}}>ABIERTAS</div>
                      </div>
                    </div>
                    {mt.map(t=>(
                      <div key={t.id} style={{background:"#F9FAFB",borderRadius:8,padding:"7px 10px",marginBottom:5,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <div><div style={{fontSize:12,fontWeight:500,color:"#111"}}>{t.title}</div><div style={{fontSize:11,color:"#9CA3AF"}}>{gP(t.project_id)?.name}</div></div>
                        <FechaBadge due={t.due_date} status={t.status}/>
                      </div>
                    ))}
                    {mt.length===0&&<div style={{color:"#9CA3AF",fontSize:12,textAlign:"center",padding:"4px 0"}}>✓ Sin pendientes</div>}
                  </div>
                );
              })}
            </div>
          )}

          {admin&&vista==="proyectos"&&(
            <div style={{display:"grid",gap:10}}>
              {projects.map(p=>{
                const pt=tareas.filter(t=>t.project_id===p.id);
                const pPen=pt.filter(t=>t.status!=="listo");
                const pOk=pt.filter(t=>t.status==="listo");
                const pct=pt.length>0?Math.round((pOk.length/pt.length)*100):0;
                return(
                  <div key={p.id} style={{background:"#fff",borderRadius:12,padding:14,border:"1px solid #E5E7EB",borderLeft:`4px solid ${p.color}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                      <div style={{fontWeight:700,fontSize:14,color:"#111"}}>{p.name}</div>
                      <div style={{color:p.color,fontSize:16,fontWeight:700}}>{pct}%</div>
                    </div>
                    <div style={{background:"#F3F4F6",borderRadius:4,height:6,marginBottom:10}}>
                      <div style={{background:p.color,height:6,borderRadius:4,width:`${pct}%`,transition:"width 0.5s"}}/>
                    </div>
                    <div style={{display:"flex",gap:16}}>
                      <span style={{fontSize:12,color:"#6B7280"}}><span style={{color:p.color,fontWeight:700}}>{pPen.length}</span> abiertas</span>
                      <span style={{fontSize:12,color:"#6B7280"}}><span style={{color:"#059669",fontWeight:700}}>{pOk.length}</span> completadas</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showAlerts&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.25)",display:"flex",alignItems:"flex-start",justifyContent:"flex-end",zIndex:200,padding:"60px 16px 0"}} onClick={()=>setShowAlerts(false)}>
          <div style={{background:"#fff",borderRadius:16,padding:20,width:360,maxHeight:"80vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.15)",fontFamily:"'Inter',sans-serif"}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div style={{fontSize:14,fontWeight:600,color:"#111"}}>⚠️ Alertas de {usuario.name}</div>
              <button onClick={()=>setShowAlerts(false)} style={{background:"#F3F4F6",border:"none",borderRadius:6,width:28,height:28,color:"#6B7280",cursor:"pointer",fontSize:15}}>×</button>
            </div>
            {misAlertasTareas.length===0?<div style={{color:"#9CA3AF",fontSize:13,textAlign:"center",padding:"20px 0"}}>✅ Sin alertas pendientes</div>:(
              <div>
                {misAlertasTareas.filter(t=>daysUntil(t.due_date)<0).length>0&&(
                  <div style={{marginBottom:16}}>
                    <div style={{fontSize:11,fontWeight:600,color:"#DC2626",letterSpacing:0.5,marginBottom:8}}>🔴 VENCIDAS</div>
                    {misAlertasTareas.filter(t=>daysUntil(t.due_date)<0).map(t=>(
                      <div key={t.id} style={{background:"#FEE2E2",borderRadius:8,padding:"8px 12px",marginBottom:6,borderLeft:"3px solid #DC2626"}}>
                        <div style={{fontSize:13,fontWeight:600,color:"#111"}}>{t.title}</div>
                        <div style={{fontSize:11,color:"#6B7280",marginTop:2}}>{projects.find(p=>p.id===t.project_id)?.name} · {users.find(u=>u.id===t.assignee_id)?.name||"Sin asignar"} · Vencida {Math.abs(daysUntil(t.due_date))}d</div>
                      </div>
                    ))}
                  </div>
                )}
                {misAlertasTareas.filter(t=>daysUntil(t.due_date)>=0&&daysUntil(t.due_date)<=2).length>0&&(
                  <div>
                    <div style={{fontSize:11,fontWeight:600,color:"#D97706",letterSpacing:0.5,marginBottom:8}}>🟠 POR VENCER</div>
                    {misAlertasTareas.filter(t=>daysUntil(t.due_date)>=0&&daysUntil(t.due_date)<=2).map(t=>(
                      <div key={t.id} style={{background:"#FEF3C7",borderRadius:8,padding:"8px 12px",marginBottom:6,borderLeft:"3px solid #D97706"}}>
                        <div style={{fontSize:13,fontWeight:600,color:"#111"}}>{t.title}</div>
                        <div style={{fontSize:11,color:"#6B7280",marginTop:2}}>{projects.find(p=>p.id===t.project_id)?.name} · {users.find(u=>u.id===t.assignee_id)?.name||"Sin asignar"} · {daysUntil(t.due_date)===0?"Hoy":`en ${daysUntil(t.due_date)}d`}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {showModal&&<ModalTarea editTask={editTask} currentUser={usuario} users={users} projects={projects} onCerrar={()=>{setShowModal(false);setEditTask(null);}} onGuardar={guardarTarea}/>}
      {chatTarea&&<ChatTarea task={chatTarea} currentUser={usuario} users={users} projects={projects} onClose={()=>setChatTarea(null)}/>}
      {showAjustes&&<PanelAjustes users={users} setUsers={setUsers} projects={projects} setProjects={setProjects} onClose={()=>setShowAjustes(false)}/>}
    </div>
  );
}
