import { useState, useRef, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://qxoincfvscvbqvoxamdi.supabase.co";
const SUPABASE_KEY = "sb_publishable_UXB8WueKrn1zBSXfsTqJ0w_C61L3b77";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const gP = id => projects.find(p=>p.id===id);
  const gU = id => users.find(u=>u.id===id);

  async function obtener() {
    setLoading(true); setVisible(true);
    const todas = tasks.map(t => {
      const d = daysUntil(t.due_date);
      return {
        titulo: t.title,
        proyecto: gP(t.project_id)?.name || "?",
        responsable: t.assignee_id ? gU(t.assignee_id)?.name : "Sin asignar",
        estado: t.status,
        fecha: t.status==="listo" ? "completada" : d<0 ? `vencida ${Math.abs(d)}d` : d===0 ? "HOY" : `en ${d}d`,
        prioridad: t.priority,
        vencida: t.status!=="listo" && d<0,
        urgente: t.status!=="listo" && (t.priority==="urgente" || d<=1)
      };
    });

    const resumen = JSON.stringify(todas);
    try {
      const res = await fetch("/api/nova", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          model:"claude-sonnet-4-5", max_tokens:600,
          system:`Eres NOVA. Analiza las tareas y responde SOLO con JSON válido sin markdown:
{"recomendaciones":["rec1","rec2","rec3"]}
Máximo 3 recomendaciones específicas y accionables para ${currentUser.name} hoy.`,
          messages:[{role:"user",content:`Tareas: ${resumen}`}]
        })
      });
      const resp = await res.json();
      const text = resp.content?.[0]?.text || "{}";
      const parsed = JSON.parse(text.replace(/\`\`\`json|\`\`\`/g,"").trim());
      setData({ tareas: todas, recomendaciones: parsed.recomendaciones || [] });
    } catch(e) {
      setData({ tareas: todas, recomendaciones: ["Error al conectar con NOVA"] });
    }
    setLoading(false);
  }

  const vencidas = data?.tareas.filter(t=>t.vencida).length || 0;
  const urgentes = data?.tareas.filter(t=>t.urgente).length || 0;
  const listas = data?.tareas.filter(t=>t.estado==="listo").length || 0;
  const total = data?.tareas.length || 0;

  function estadoIcon(e) {
    if(e==="listo") return "✅";
    if(e==="en-progreso") return "🔧";
    if(e==="bloqueado") return "🚫";
    return "⏳";
  }
  function fechaColor(t) {
    if(t.vencida) return "#DC2626";
    if(t.fecha==="HOY") return "#D97706";
    return "#6B7280";
  }

  if (!visible) return (
    <button onClick={obtener} style={{background:"#fff",border:"1.5px solid #FED7AA",borderRadius:10,padding:"10px 16px",color:"#E8622A",fontFamily:"'Inter',sans-serif",fontSize:13,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:10,width:"100%",marginBottom:14}}>
      <div style={{width:22,height:22,flexShrink:0}}><svg width="22" height="22" viewBox="0 0 80 80"><circle cx="40" cy="40" r="38" fill="#1F2937"/><text x="40" y="55" textAnchor="middle" fontFamily="Inter,sans-serif" fontSize="40" fontWeight="700" fill="#E8622A">N</text><circle cx="58" cy="20" r="10" fill="#E8622A"/></svg></div>
      <div style={{textAlign:"left"}}><div>NOVA — Briefing del día</div><div style={{fontSize:10,opacity:0.7,fontWeight:400}}>Resumen completo con tabla de tareas</div></div>
      <span style={{marginLeft:"auto"}}>→</span>
    </button>
  );

  return (
    <div style={{background:"#fff",border:"1.5px solid #FED7AA",borderRadius:12,padding:16,marginBottom:14}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
        <div style={{width:26,height:26,flexShrink:0}}><svg width="26" height="26" viewBox="0 0 80 80"><circle cx="40" cy="40" r="38" fill="#1F2937"/><text x="40" y="55" textAnchor="middle" fontFamily="Inter,sans-serif" fontSize="40" fontWeight="700" fill="#E8622A">N</text><circle cx="58" cy="20" r="10" fill="#E8622A"/></svg></div>
        <span style={{fontSize:13,fontWeight:600,color:"#E8622A",fontFamily:"'Inter',sans-serif"}}>NOVA — Briefing</span>
        <button onClick={()=>setVisible(false)} style={{marginLeft:"auto",background:"none",border:"none",color:"#9CA3AF",cursor:"pointer",fontSize:18}}>×</button>
      </div>

      {loading ? <div style={{color:"#9CA3AF",fontFamily:"'Inter',sans-serif",fontSize:13,padding:"10px 0"}}>Analizando {tasks.length} tareas...</div> : data && (
        <>
          {/* Resumen */}
          <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
            {[{l:"VENCIDAS",v:vencidas,c:"#DC2626",bg:"#FEE2E2"},{l:"URGENTES",v:urgentes,c:"#D97706",bg:"#FEF3C7"},{l:"LISTAS",v:listas,c:"#059669",bg:"#D1FAE5"},{l:"TOTAL",v:total,c:"#374151",bg:"#F3F4F6"}].map(s=>(
              <div key={s.l} style={{background:s.bg,borderRadius:8,padding:"8px 14px",textAlign:"center",minWidth:70}}>
                <div style={{fontSize:20,fontWeight:700,color:s.c,fontFamily:"'Inter',sans-serif"}}>{s.v}</div>
                <div style={{fontSize:10,color:s.c,fontWeight:600,fontFamily:"'Inter',sans-serif"}}>{s.l}</div>
              </div>
            ))}
          </div>

          {/* Tabla */}
          <div style={{overflowX:"auto",marginBottom:14}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,fontFamily:"'Inter',sans-serif"}}>
              <thead>
                <tr style={{background:"#FFF4F0"}}>
                  {["Tarea","Proyecto","Responsable","Estado","Fecha"].map(h=>(
                    <th key={h} style={{padding:"6px 10px",textAlign:"left",fontSize:11,color:"#E8622A",fontWeight:600,borderBottom:"2px solid #FED7AA",whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.tareas.map((t,i)=>(
                  <tr key={i} style={{borderBottom:"1px solid #F3F4F6",background:i%2===0?"#fff":"#FAFAFA"}}>
                    <td style={{padding:"5px 10px",fontWeight:500,color:"#111",maxWidth:200}}>{t.titulo}</td>
                    <td style={{padding:"5px 10px",color:"#6B7280",whiteSpace:"nowrap"}}>{t.proyecto}</td>
                    <td style={{padding:"5px 10px",color:"#6B7280",whiteSpace:"nowrap"}}>{t.responsable}</td>
                    <td style={{padding:"5px 10px",whiteSpace:"nowrap"}}>{estadoIcon(t.estado)} {t.estado}</td>
                    <td style={{padding:"5px 10px",fontWeight:600,color:fechaColor(t),whiteSpace:"nowrap"}}>{t.fecha}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Recomendaciones */}
          {data.recomendaciones.length>0&&(
            <div style={{background:"#F0FDF4",borderRadius:8,padding:"10px 14px",borderLeft:"3px solid #059669"}}>
              <div style={{fontSize:11,fontWeight:600,color:"#059669",marginBottom:6,fontFamily:"'Inter',sans-serif"}}>💡 RECOMENDACIONES DE NOVA</div>
              <ol style={{margin:0,paddingLeft:16}}>
                {data.recomendaciones.map((r,i)=><li key={i} style={{fontSize:12,color:"#374151",marginBottom:3,fontFamily:"'Inter',sans-serif"}}>{r}</li>)}
              </ol>
            </div>
          )}
        </>
      )}
      {!loading&&<button onClick={obtener} style={{marginTop:10,background:"#FFF7F0",border:"1.5px solid #FED7AA",borderRadius:6,padding:"5px 12px",color:"#E8622A",fontFamily:"'Inter',sans-serif",fontSize:11,cursor:"pointer",fontWeight:600}}>↺ Actualizar</button>}
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
function InlineFiles({ taskId }) {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const pasteRef = useRef(null);

  useEffect(() => { fetchFiles(); }, [taskId]);

  async function fetchFiles() {
    const { data } = await supabase.storage.from("task-files").list(`task-${taskId}/`, { sortBy:{column:"created_at",order:"desc"} });
    setFiles(data || []);
  }

  async function uploadFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
    const path = `task-${taskId}/${Date.now()}-${safeName}`;
    const { error } = await supabase.storage.from("task-files").upload(path, file, { cacheControl:"3600", upsert:false, contentType:file.type||"application/octet-stream" });
    if (!error) fetchFiles();
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
        const path = `task-${taskId}/${Date.now()}-captura.png`;
        const { error } = await supabase.storage.from("task-files").upload(path, file, { cacheControl:"3600", upsert:false, contentType:"image/png" });
        if (!error) fetchFiles();
        setUploading(false);
        break;
      }
    }
  }

  function getUrl(name) {
    const { data } = supabase.storage.from("task-files").getPublicUrl(`task-${taskId}/${name}`);
    return data.publicUrl;
  }

  function isImage(name) {
    return ["jpg","jpeg","png","gif","webp","heic"].includes(name.split(".").pop().toLowerCase());
  }

  async function deleteFile(name) {
    await supabase.storage.from("task-files").remove([`task-${taskId}/${name}`]);
    fetchFiles();
  }

  return (
    <div style={{marginBottom:8}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
        <span style={{fontSize:11,color:"#9CA3AF"}}>📎 Archivos ({files.length})</span>
        <button onClick={()=>fileRef.current?.click()} disabled={uploading} style={{background:"#F3F4F6",border:"1px solid #E5E7EB",borderRadius:6,padding:"3px 8px",color:"#374151",fontSize:11,cursor:"pointer"}}>
          {uploading?"Subiendo...":"+ Subir archivo"}
        </button>
        <input ref={fileRef} type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={uploadFile} style={{display:"none"}}/>
      </div>
      {files.length>0&&(
        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:6}}>
          {files.map(f=>(
            <div key={f.name} style={{background:"#F9FAFB",border:"1px solid #E5E7EB",borderRadius:6,overflow:"hidden",width:isImage(f.name)?70:140}}>
              {isImage(f.name)?(
                <a href={getUrl(f.name)} target="_blank" rel="noreferrer">
                  <img src={getUrl(f.name)} alt={f.name} style={{width:"100%",height:52,objectFit:"cover",display:"block"}}/>
                </a>
              ):(
                <a href={getUrl(f.name)} target="_blank" rel="noreferrer" download style={{display:"flex",alignItems:"center",gap:4,padding:"6px 8px",textDecoration:"none"}}>
                  <span style={{fontSize:14}}>📄</span>
                  <span style={{fontSize:10,color:"#374151",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name.replace(/^\d+-/,"")}</span>
                </a>
              )}
              <div style={{display:"flex",justifyContent:"space-between",padding:"2px 5px",borderTop:"1px solid #F3F4F6"}}>
                <a href={getUrl(f.name)} download target="_blank" rel="noreferrer" style={{fontSize:9,color:"#2563EB",textDecoration:"none"}}>⬇</a>
                <button onClick={()=>deleteFile(f.name)} style={{background:"none",border:"none",color:"#DC2626",fontSize:9,cursor:"pointer",padding:0}}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div onPaste={uploadFromClipboard} tabIndex={0} contentEditable={true} suppressContentEditableWarning={true}
        onKeyDown={e=>{if(e.key!=="v"||!e.metaKey&&!e.ctrlKey)e.preventDefault();}}
        style={{background:"#F9FAFB",border:"1px dashed #E5E7EB",borderRadius:6,padding:"4px 10px",fontSize:10,color:"#C4C9D4",cursor:"pointer",outline:"none",userSelect:"none"}}
        onClick={e=>e.currentTarget.focus()}>
        {uploading?"⏳ Subiendo...":"📋 Pegar captura (Cmd+V)"}
      </div>
    </div>
  );
}

function TarjetaTarea({ task, currentUser, users, projects, onCambiarEstado, onEditar, onAbrirChat, onEliminar, commentCount }) {
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
    <div style={{background:"#fff",border:"1px solid #F0F1F3",borderRadius:10,padding:"10px 12px",marginBottom:6,borderLeft:`3px solid ${proy?.color||"#E8622A"}`,opacity:esListo?0.6:1,fontFamily:"'Inter',sans-serif",transition:"opacity 0.2s",boxShadow:"0 1px 2px rgba(0,0,0,0.03)"}}>
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8,marginBottom:5}}>
        <div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center"}}>
          <span style={{background:pC.bg,color:pC.color,fontSize:11,fontWeight:600,padding:"2px 8px",borderRadius:20}}>{pC.label}</span>
          <span style={{background:"#F3F4F6",color:"#6B7280",fontSize:11,padding:"2px 8px",borderRadius:20}}>{task.type}</span>
          <span style={{color:eC.color,fontSize:11}}>{eC.icon} {eC.label}</span>
        </div>
        <FechaBadge due={task.due_date} status={task.status}/>
      </div>
      <div style={{fontSize:13,fontWeight:600,color:"#111",marginBottom:task.notes?4:6,lineHeight:1.3}}>{task.title}</div>
      {task.notes && <div style={{color:"#6B7280",fontSize:12,marginBottom:8,lineHeight:1.5}}>{task.notes}</div>}
      <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap",marginBottom:6}}>
        <span style={{background:`${proy?.color}18`,color:proy?.color,fontSize:11,padding:"2px 8px",borderRadius:20,fontWeight:600}}>{proy?.name}</span>
        {asig ? <div style={{display:"flex",alignItems:"center",gap:4}}><Avatar name={asig.name} size={18} color={asig.color||proy?.color}/><span style={{color:"#374151",fontSize:12}}>{asig.name}</span></div>
          : <span style={{color:"#DC2626",fontSize:11}}>⚠ Sin asignar</span>}
        {!esListo && admin && <span style={{color:"#D1D5DB",fontSize:10}}>{task.priority==="urgente"?"c/3h":task.priority==="alta"?"c/6h":"diario"}</span>}
        {crea && <span style={{color:"#D1D5DB",fontSize:10}}>por {crea.name}</span>}
      </div>
      <InlineFiles taskId={task.id}/>
      <div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center",paddingTop:6,borderTop:"1px solid #F3F4F6",marginTop:4}}>
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
        {admin && <button onClick={()=>onEliminar(task.id)} style={{background:"#FEE2E2",border:"1px solid #FECACA",borderRadius:6,padding:"5px 10px",color:"#DC2626",fontSize:11,cursor:"pointer",fontFamily:"'Inter',sans-serif",fontWeight:500}}>🗑 Eliminar</button>}
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
function PanelAjustes({ users, setUsers, projects, setProjects, empresa, setEmpresa, onClose }) {
  const [tab, setTab] = useState("empresa");
  const [editU, setEditU] = useState(null);
  const [editP, setEditP] = useState(null);
  const [newU, setNewU] = useState(false);
  const [newP, setNewP] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoRef = useRef(null);
  const emptyUser = { id:Date.now(), name:"", role:"member", pin:"", avatar:"", color:"#2563EB" };
  const emptyProject = { id:Date.now(), name:"", color:"#E8622A" };

  function saveUsers(updated) { setUsers(updated); saveToStorage("foreman_users", updated); }
  function saveProjects(updated) { setProjects(updated); saveToStorage("foreman_projects", updated); }
  function saveEmpresa(updated) { setEmpresa(updated); saveToStorage("foreman_empresa", updated); }

  async function uploadLogo(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingLogo(true);
    const ext = file.name.split(".").pop();
    const path = `empresa/logo.${ext}`;
    await supabase.storage.from("task-files").remove([path]);
    const { error } = await supabase.storage.from("task-files").upload(path, file, { upsert: true });
    if (!error) {
      const { data } = supabase.storage.from("task-files").getPublicUrl(path);
      saveEmpresa({ ...empresa, logoUrl: data.publicUrl + "?t=" + Date.now() });
    }
    setUploadingLogo(false);
    e.target.value = "";
  }

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
          <input value={f.email||""} onChange={e=>setF(p=>({...p,email:e.target.value}))} placeholder="Email (para notificaciones)" style={iS}/>
          <input value={f.phone||""} onChange={e=>setF(p=>({...p,phone:e.target.value}))} placeholder="WhatsApp (+593...)" style={iS}/>
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
          <button onClick={()=>setTab("empresa")} style={tabS(tab==="empresa")}>🏢 Empresa</button>
          <button onClick={()=>setTab("usuarios")} style={tabS(tab==="usuarios")}>👥 Usuarios</button>
          <button onClick={()=>setTab("proyectos")} style={tabS(tab==="proyectos")}>🏗 Proyectos</button>
        </div>

        {tab === "empresa" && (
          <div style={{display:"grid",gap:14}}>
            {/* Logo */}
            <div style={{background:"#F9FAFB",borderRadius:10,padding:14,border:"1px solid #E5E7EB"}}>
              <div style={{fontSize:12,fontWeight:600,color:"#374151",marginBottom:10}}>Logo de la empresa</div>
              <div style={{display:"flex",alignItems:"center",gap:14}}>
                {empresa.logoUrl ? (
                  <img src={empresa.logoUrl} alt="Logo" style={{width:64,height:64,objectFit:"contain",borderRadius:8,border:"1px solid #E5E7EB",background:"#fff",padding:4}}/>
                ) : (
                  <div style={{width:64,height:64,background:"#F3F4F6",borderRadius:8,border:"1.5px dashed #E5E7EB",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24}}>🏢</div>
                )}
                <div>
                  <button onClick={()=>logoRef.current?.click()} disabled={uploadingLogo} style={{background:"#E8622A",border:"none",borderRadius:8,padding:"8px 14px",color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer",display:"block",marginBottom:6}}>
                    {uploadingLogo?"Subiendo...":"📤 Subir logo"}
                  </button>
                  <div style={{fontSize:10,color:"#9CA3AF"}}>PNG, JPG o SVG. Máx 2MB.</div>
                  <input ref={logoRef} type="file" accept="image/*" onChange={uploadLogo} style={{display:"none"}}/>
                </div>
              </div>
            </div>
            {/* Info básica */}
            {[
              {k:"nombre",l:"Nombre de la empresa",ph:"HCA Studio"},
              {k:"tipo",l:"Tipo de negocio",ph:"Construcción, Inmobiliaria..."},
              {k:"email",l:"Email de contacto",ph:"info@empresa.com"},
              {k:"telefono",l:"Teléfono",ph:"+593 99 999 9999"},
              {k:"web",l:"Sitio web",ph:"www.empresa.com"},
              {k:"ciudad",l:"Ciudad",ph:"Quito, Ecuador"},
              {k:"moneda",l:"Moneda",ph:"USD"},
            ].map(f=>(
              <div key={f.k}>
                <label style={{color:"#6B7280",fontSize:11,fontWeight:500,marginBottom:4,display:"block"}}>{f.l}</label>
                <input value={empresa?.[f.k]||""} onChange={e=>saveEmpresa({...empresa,[f.k]:e.target.value})} placeholder={f.ph}
                  style={{width:"100%",background:"#F9FAFB",border:"1px solid #E5E7EB",borderRadius:8,color:"#111",padding:"9px 12px",fontSize:13,fontFamily:"'Inter',sans-serif",boxSizing:"border-box",outline:"none"}}
                  onFocus={e=>e.target.style.borderColor="#E8622A"} onBlur={e=>e.target.style.borderColor="#E5E7EB"}/>
              </div>
            ))}
            {/* Color principal */}
            <div>
              <label style={{color:"#6B7280",fontSize:11,fontWeight:500,marginBottom:4,display:"block"}}>Color principal de la marca</label>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <input type="color" value={empresa?.color||"#E8622A"} onChange={e=>saveEmpresa({...empresa,color:e.target.value})}
                  style={{width:48,height:36,border:"1px solid #E5E7EB",borderRadius:8,cursor:"pointer",padding:2}}/>
                <div style={{fontSize:12,color:"#6B7280"}}>Este color se aplica en toda la app</div>
              </div>
            </div>
          </div>
        )}

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
  const [empresa, setEmpresa] = useState(() => loadFromStorage("foreman_empresa", {
    nombre:"HCA Studio", tipo:"Construcción", email:"", telefono:"", web:"", ciudad:"Quito", moneda:"USD", color:"#E8622A", logoUrl:""
  }));
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

  useEffect(() => { setShowAlerts(false); setShowAjustes(false); setShowModal(false); }, [usuario]);

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

  async function sendEmail(to, subject, html) {
    if (!to) return;
    try {
      await fetch("/api/email", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ to, subject, html })
      });
    } catch(e) { console.error("Email error:", e); }
  }

  async function eliminarTarea(id) {
    if (!window.confirm("¿Eliminar esta tarea? Esta acción no se puede deshacer.")) return;
    await supabase.from("tasks").delete().eq("id", id);
    setTareas(prev => prev.filter(t => t.id !== id));
  }

  async function cambiarEstado(id, estado) {
    setTareas(prev => prev.map(t => t.id===id ? {...t, status:estado} : t));
    const { error } = await supabase.from("tasks").update({status:estado}).eq("id",id);
    if (error) { console.error("Error updating status:", error); fetchTareas(); }
  }

  async function guardarTarea(form, id) {
    if (id) {
      await supabase.from("tasks").update(form).eq("id", id);
    } else {
      await supabase.from("tasks").insert({...form, created_by:usuario.id});
      if (form.assignee_id) {
        const asignado = users.find(u => u.id === form.assignee_id);
        const proyecto = projects.find(p => p.id === form.project_id);
        if (asignado?.email) {
          const prioridad = form.priority==="urgente"?"🔴 URGENTE":form.priority==="alta"?"🟠 Alta":form.priority==="media"?"🟡 Media":"⚪ Baja";
          const html = `<div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:20px"><div style="background:#E8622A;border-radius:12px;padding:20px;margin-bottom:20px"><h1 style="color:#fff;margin:0;font-size:22px">FOREMAN</h1><p style="color:rgba(255,255,255,0.8);margin:4px 0 0;font-size:13px">Nueva tarea asignada</p></div><h2 style="color:#111;font-size:18px">Hola ${asignado.name} 👋</h2><p style="color:#374151">${usuario.name} te asignó una nueva tarea:</p><div style="background:#F9FAFB;border-left:4px solid #E8622A;border-radius:8px;padding:16px;margin:16px 0"><h3 style="color:#111;margin:0 0 8px;font-size:16px">${form.title}</h3><p style="color:#6B7280;margin:4px 0;font-size:13px">📁 Proyecto: <strong>${proyecto?.name}</strong></p><p style="color:#6B7280;margin:4px 0;font-size:13px">📅 Fecha límite: <strong>${form.due_date}</strong></p><p style="color:#6B7280;margin:4px 0;font-size:13px">⚡ Prioridad: <strong>${prioridad}</strong></p>${form.notes?`<p style="color:#6B7280;margin:8px 0 0;font-size:13px">📝 ${form.notes}</p>`:""}</div><a href="https://foreman-app-ebon.vercel.app" style="display:inline-block;background:#E8622A;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Ver en FOREMAN →</a><p style="color:#9CA3AF;font-size:11px;margin-top:24px">FOREMAN by HCA Studio</p></div>`;
          await sendEmail(asignado.email, `Nueva tarea: ${form.title}`, html);
        }
      }
    }
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
          {empresa?.logoUrl && (
            <div style={{padding:"0 12px",marginBottom:12}}>
              <img src={empresa.logoUrl} alt={empresa?.nombre||"Logo"} style={{width:"100%",maxHeight:48,objectFit:"contain",borderRadius:6}}/>
            </div>
          )}
          {!empresa?.logoUrl && empresa?.nombre && (
            <div style={{padding:"0 12px",marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:600,color:"#9CA3AF",textAlign:"center"}}>{empresa?.nombre}</div>
            </div>
          )}
          {navItem("tareas","Tareas","📋")}
          {admin&&navItem("equipo","Equipo","👷")}
          {admin&&navItem("proyectos","Proyectos","🏗")}
          {admin&&navItem("presupuestos","Presupuestos","💼")}
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
                    .map(t=><TarjetaTarea key={t.id} task={t} currentUser={usuario} users={users} projects={projects} onCambiarEstado={cambiarEstado} onEditar={t=>{setEditTask(t);setShowModal(true);}} onAbrirChat={setChatTarea} onEliminar={eliminarTarea} commentCount={commentCounts[t.id]||0}/>)}
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

          {admin&&vista==="presupuestos"&&(
            <ModuloPresupuestos currentUser={usuario} projects={projects}/>
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
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.25)",display:"flex",alignItems:"flex-start",justifyContent:"flex-end",zIndex:200,padding:"60px 16px 0",pointerEvents:"all"}} onClick={()=>setShowAlerts(false)}>
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
      {showAjustes&&<PanelAjustes users={users} setUsers={setUsers} projects={projects} setProjects={setProjects} empresa={empresa} setEmpresa={setEmpresa} onClose={()=>setShowAjustes(false)}/>}
    </div>
  );
}

// ── ADMIN BASE DE DATOS ───────────────────────────────────────────────────
function AdminBD({ onVolver }) {
  const [tab, setTab] = useState("rubros"); // rubros | capitulos | duplicados
  const [capitulos, setCapitulos] = useState([]);
  const [rubros, setRubros] = useState([]);
  const [duplicados, setDuplicados] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [filtroCapitulo, setFiltroCapitulo] = useState("");
  const [editRubro, setEditRubro] = useState(null);
  const [editCapitulo, setEditCapitulo] = useState(null);
  const [nuevoCapNombre, setNuevoCapNombre] = useState("");
  const [loadingDups, setLoadingDups] = useState(false);
  const [page, setPage] = useState(0);
  const PER_PAGE = 40;

  useEffect(() => { fetchCapitulos(); }, []);
  useEffect(() => { fetchRubros(); setPage(0); }, [busqueda, filtroCapitulo]);

  async function fetchCapitulos() {
    const { data } = await supabase.from("capitulos").select("*, rubros(count)").order("nombre");
    setCapitulos(data||[]);
  }
  async function fetchRubros() {
    let q = supabase.from("rubros").select("*, capitulos(nombre,id)").eq("activo",true);
    if (busqueda) q = q.ilike("descripcion",`%${busqueda}%`);
    if (filtroCapitulo) q = q.eq("capitulo_id", filtroCapitulo);
    const { data } = await q.order("descripcion").range(page*PER_PAGE, (page+1)*PER_PAGE-1);
    setRubros(data||[]);
  }
  async function buscarDuplicados() {
    setLoadingDups(true);
    const { data: todos } = await supabase.from("rubros").select("id,descripcion,unidad,precio_referencia,capitulos(nombre)").eq("activo",true).order("descripcion");
    if (!todos) { setLoadingDups(false); return; }
    // Find similar rubros (same first 20 chars)
    const groups = {};
    todos.forEach(r => {
      const key = r.descripcion.toLowerCase().trim().slice(0,25);
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });
    const dups = Object.values(groups).filter(g=>g.length>1);
    setDuplicados(dups);
    setLoadingDups(false);
  }

  // CAPITULOS actions
  async function saveCapitulo(cap) {
    await supabase.from("capitulos").update({ nombre:cap.nombre, orden:cap.orden }).eq("id",cap.id);
    setEditCapitulo(null); fetchCapitulos();
  }
  async function deleteCapitulo(id) {
    if (!window.confirm("¿Eliminar este capítulo? Los rubros asociados quedarán sin capítulo.")) return;
    await supabase.from("capitulos").delete().eq("id",id);
    fetchCapitulos();
  }
  async function addCapitulo() {
    if (!nuevoCapNombre.trim()) return;
    await supabase.from("capitulos").insert({ nombre:nuevoCapNombre.trim(), orden:capitulos.length+1 });
    setNuevoCapNombre(""); fetchCapitulos();
  }

  // RUBROS actions
  async function saveRubro(r) {
    await supabase.from("rubros").update({
      descripcion:r.descripcion, unidad:r.unidad,
      precio_referencia:Number(r.precio_referencia),
      capitulo_id:r.capitulo_id||null
    }).eq("id",r.id);
    setEditRubro(null); fetchRubros();
  }
  async function deleteRubro(id) {
    if (!window.confirm("¿Eliminar este rubro de la base de datos?")) return;
    await supabase.from("rubros").update({activo:false}).eq("id",id);
    fetchRubros();
  }
  async function mergeDuplicados(keep, deleteIds) {
    for (const id of deleteIds) {
      // Move historial to kept rubro
      await supabase.from("precios_historial").update({rubro_id:keep}).eq("rubro_id",id);
      await supabase.from("rubros").update({activo:false}).eq("id",id);
    }
    fetchRubros(); buscarDuplicados();
  }

  const fmt = n => (Number(n)||0).toLocaleString("es-EC",{minimumFractionDigits:2,maximumFractionDigits:2});
  const iS = {width:"100%",background:"#F9FAFB",border:"1px solid #E5E7EB",borderRadius:8,color:"#111",padding:"8px 10px",fontSize:12,fontFamily:"'Inter',sans-serif",boxSizing:"border-box",outline:"none"};
  const tabS = a => ({padding:"7px 16px",border:"none",borderBottom:a?"2px solid #E8622A":"2px solid transparent",background:"transparent",color:a?"#E8622A":"#6B7280",fontSize:12,fontWeight:a?600:400,cursor:"pointer",fontFamily:"'Inter',sans-serif"});

  return (
    <div style={{fontFamily:"'Inter',sans-serif"}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
        <button onClick={onVolver} style={{background:"#F3F4F6",border:"none",borderRadius:8,padding:"7px 12px",color:"#6B7280",fontSize:12,cursor:"pointer"}}>← Volver</button>
        <div style={{fontSize:16,fontWeight:700,color:"#111"}}>🗄️ Administrar base de datos</div>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",borderBottom:"1px solid #E5E7EB",marginBottom:16}}>
        <button onClick={()=>setTab("rubros")} style={tabS(tab==="rubros")}>📋 Rubros</button>
        <button onClick={()=>setTab("capitulos")} style={tabS(tab==="capitulos")}>📂 Capítulos</button>
        <button onClick={()=>{setTab("duplicados");buscarDuplicados();}} style={tabS(tab==="duplicados")}>🔍 Duplicados</button>
      </div>

      {/* ── RUBROS ── */}
      {tab==="rubros"&&(
        <div>
          <div style={{display:"flex",gap:8,marginBottom:12}}>
            <input value={busqueda} onChange={e=>setBusqueda(e.target.value)} placeholder="Buscar rubro..." style={{...iS,flex:1}}/>
            <select value={filtroCapitulo} onChange={e=>setFiltroCapitulo(e.target.value)} style={{...iS,width:"auto",flexShrink:0}}>
              <option value="">Todos los capítulos</option>
              {capitulos.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          <div style={{fontSize:11,color:"#9CA3AF",marginBottom:8}}>Mostrando {rubros.length} rubros · <button onClick={()=>{setPage(p=>Math.max(0,p-1));fetchRubros();}} style={{background:"none",border:"none",color:"#E8622A",cursor:"pointer",fontSize:11}}>◀ Ant</button> pág {page+1} <button onClick={()=>{setPage(p=>p+1);fetchRubros();}} style={{background:"none",border:"none",color:"#E8622A",cursor:"pointer",fontSize:11}}>Sig ▶</button></div>

          {rubros.map(r=>(
            <div key={r.id} style={{background:"#fff",border:"1px solid #E5E7EB",borderRadius:8,padding:"10px 12px",marginBottom:6}}>
              {editRubro?.id===r.id?(
                <div style={{display:"grid",gap:8}}>
                  <input value={editRubro.descripcion} onChange={e=>setEditRubro(p=>({...p,descripcion:e.target.value}))} style={iS} placeholder="Descripción"/>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                    <input value={editRubro.unidad||""} onChange={e=>setEditRubro(p=>({...p,unidad:e.target.value}))} style={iS} placeholder="Unidad"/>
                    <input type="number" value={editRubro.precio_referencia||""} onChange={e=>setEditRubro(p=>({...p,precio_referencia:e.target.value}))} style={iS} placeholder="Precio ref."/>
                    <select value={editRubro.capitulo_id||""} onChange={e=>setEditRubro(p=>({...p,capitulo_id:e.target.value}))} style={iS}>
                      <option value="">Sin capítulo</option>
                      {capitulos.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>saveRubro(editRubro)} style={{flex:2,background:"#E8622A",border:"none",borderRadius:6,padding:"7px",color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}>Guardar</button>
                    <button onClick={()=>setEditRubro(null)} style={{flex:1,background:"#F3F4F6",border:"none",borderRadius:6,padding:"7px",color:"#6B7280",fontSize:12,cursor:"pointer"}}>Cancelar</button>
                  </div>
                </div>
              ):(
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:500,color:"#111"}}>{r.descripcion}</div>
                    <div style={{fontSize:11,color:"#9CA3AF",marginTop:2}}>{r.capitulos?.nombre||"Sin capítulo"} · {r.unidad}</div>
                  </div>
                  <div style={{textAlign:"right",flexShrink:0,marginRight:12}}>
                    <div style={{fontSize:13,fontWeight:600,color:"#E8622A"}}>${fmt(r.precio_referencia)}</div>
                  </div>
                  <div style={{display:"flex",gap:4}}>
                    <button onClick={()=>setEditRubro({...r,capitulo_id:r.capitulos?.id||""})} style={{background:"#F3F4F6",border:"1px solid #E5E7EB",borderRadius:6,padding:"4px 8px",color:"#374151",fontSize:11,cursor:"pointer"}}>✏️</button>
                    <button onClick={()=>deleteRubro(r.id)} style={{background:"#FEE2E2",border:"1px solid #FECACA",borderRadius:6,padding:"4px 8px",color:"#DC2626",fontSize:11,cursor:"pointer"}}>🗑</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── CAPÍTULOS ── */}
      {tab==="capitulos"&&(
        <div>
          {/* Agregar nuevo */}
          <div style={{display:"flex",gap:8,marginBottom:16}}>
            <input value={nuevoCapNombre} onChange={e=>setNuevoCapNombre(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&addCapitulo()}
              placeholder="Nuevo capítulo..." style={{...iS,flex:1}}/>
            <button onClick={addCapitulo} disabled={!nuevoCapNombre.trim()} style={{background:nuevoCapNombre.trim()?"#E8622A":"#F3F4F6",border:"none",borderRadius:8,padding:"8px 16px",color:nuevoCapNombre.trim()?"#fff":"#9CA3AF",fontSize:12,fontWeight:600,cursor:nuevoCapNombre.trim()?"pointer":"default",whiteSpace:"nowrap"}}>+ Agregar</button>
          </div>

          {capitulos.map(c=>(
            <div key={c.id} style={{background:"#fff",border:"1px solid #E5E7EB",borderRadius:8,padding:"10px 12px",marginBottom:6}}>
              {editCapitulo?.id===c.id?(
                <div style={{display:"grid",gap:8}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:8}}>
                    <input value={editCapitulo.nombre} onChange={e=>setEditCapitulo(p=>({...p,nombre:e.target.value}))} style={iS}/>
                    <input type="number" value={editCapitulo.orden} onChange={e=>setEditCapitulo(p=>({...p,orden:e.target.value}))} style={{...iS,width:60}} placeholder="Orden"/>
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>saveCapitulo(editCapitulo)} style={{flex:2,background:"#E8622A",border:"none",borderRadius:6,padding:"7px",color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}>Guardar</button>
                    <button onClick={()=>setEditCapitulo(null)} style={{flex:1,background:"#F3F4F6",border:"none",borderRadius:6,padding:"7px",color:"#6B7280",fontSize:12,cursor:"pointer"}}>Cancelar</button>
                  </div>
                </div>
              ):(
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:500,color:"#111"}}>{c.orden}. {c.nombre}</div>
                    <div style={{fontSize:11,color:"#9CA3AF",marginTop:2}}>{c.rubros?.[0]?.count||0} rubros</div>
                  </div>
                  <div style={{display:"flex",gap:4}}>
                    <button onClick={()=>setEditCapitulo({...c})} style={{background:"#F3F4F6",border:"1px solid #E5E7EB",borderRadius:6,padding:"4px 8px",color:"#374151",fontSize:11,cursor:"pointer"}}>✏️</button>
                    <button onClick={()=>deleteCapitulo(c.id)} style={{background:"#FEE2E2",border:"1px solid #FECACA",borderRadius:6,padding:"4px 8px",color:"#DC2626",fontSize:11,cursor:"pointer"}}>🗑</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── DUPLICADOS ── */}
      {tab==="duplicados"&&(
        <div>
          {loadingDups?<div style={{textAlign:"center",padding:"40px 0",color:"#9CA3AF",fontSize:13}}>🔍 Analizando duplicados...</div>
          :duplicados.length===0?<div style={{textAlign:"center",padding:"40px 0",color:"#9CA3AF",fontSize:13}}><div style={{fontSize:32,marginBottom:10}}>✅</div>Sin duplicados detectados.</div>
          :<div>
            <div style={{fontSize:12,color:"#6B7280",marginBottom:12}}>Se encontraron <strong>{duplicados.length}</strong> grupos con rubros similares. Selecciona cuál conservar y cuál eliminar.</div>
            {duplicados.map((grupo,gi)=>(
              <div key={gi} style={{background:"#fff",border:"1.5px solid #FED7AA",borderRadius:10,padding:14,marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:600,color:"#E8622A",marginBottom:10}}>Grupo {gi+1} — {grupo.length} rubros similares</div>
                {grupo.map((r,ri)=>(
                  <div key={r.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 10px",background:ri===0?"#F0FDF4":"#FFF7F0",borderRadius:8,marginBottom:6,border:`1px solid ${ri===0?"#BBF7D0":"#FED7AA"}`}}>
                    <div style={{flex:1}}>
                      {ri===0&&<div style={{fontSize:9,fontWeight:700,color:"#059669",letterSpacing:1,marginBottom:2}}>CONSERVAR</div>}
                      <div style={{fontSize:12,fontWeight:500,color:"#111"}}>{r.descripcion}</div>
                      <div style={{fontSize:10,color:"#9CA3AF"}}>{r.capitulos?.nombre} · {r.unidad} · ${fmt(r.precio_referencia)}</div>
                    </div>
                    <div style={{display:"flex",gap:4,marginLeft:8}}>
                      {ri!==0&&<button onClick={()=>mergeDuplicados(grupo[0].id,[r.id])} style={{background:"#FEE2E2",border:"1px solid #FECACA",borderRadius:6,padding:"4px 8px",color:"#DC2626",fontSize:11,cursor:"pointer",whiteSpace:"nowrap"}}>🗑 Eliminar</button>}
                      {ri===0&&grupo.length>1&&<button onClick={()=>mergeDuplicados(grupo[0].id,grupo.slice(1).map(x=>x.id))} style={{background:"#059669",border:"none",borderRadius:6,padding:"4px 10px",color:"#fff",fontSize:11,cursor:"pointer",fontWeight:600,whiteSpace:"nowrap"}}>✓ Fusionar todos</button>}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>}
        </div>
      )}
    </div>
  );
}

// ── MÓDULO PRESUPUESTOS ────────────────────────────────────────────────────
function ModuloPresupuestos({ currentUser }) {
  const [subVista, setSubVista] = useState("lista");
  const [presupuestos, setPresupuestos] = useState([]);
  const [presupuestoActivo, setPresupuestoActivo] = useState(null);
  const [clientes, setClientes] = useState([]);
  const [capitulosDB, setCapitulosDB] = useState([]);
  // capitulosActivos: [{nombre, orden}] ordenados
  const [capitulosActivos, setCapitulosActivos] = useState([]);
  const [items, setItems] = useState([]);
  const [exportando, setExportando] = useState(false);
  const [uploadingCotizacion, setUploadingCotizacion] = useState(false);
  const [cotizacionResult, setCotizacionResult] = useState(null);
  const [uploadingBD, setUploadingBD] = useState(false);
  const [bdResult, setBdResult] = useState(null);
  const [modalRubro, setModalRubro] = useState(null);
  const [busquedaRubro, setBusquedaRubro] = useState("");
  const [rubrosDB, setRubrosDB] = useState([]);
  const [nuevoCapitulo, setNuevoCapitulo] = useState("");
  const [showAddCap, setShowAddCap] = useState(false);
  const [showAdminBD, setShowAdminBD] = useState(false);
  const [form, setForm] = useState({ nombre:"", cliente_id:"", cliente_nombre:"", honorarios_pct:0, iva_pct:12, notas:"" });
  const [manualRubro, setManualRubro] = useState({ descripcion:"", unidad:"", cantidad:1, precio_unitario:0 });
  const fileRef = useRef(null);
  const fileBDRef = useRef(null);

  useEffect(() => { fetchPresupuestos(); fetchClientes(); fetchCapitulosDB(); }, []);

  async function fetchPresupuestos() {
    const { data } = await supabase.from("presupuestos").select("*").order("created_at",{ascending:false});
    setPresupuestos(data||[]);
  }
  async function fetchClientes() {
    const { data } = await supabase.from("clientes").select("*").order("nombre");
    setClientes(data||[]);
  }
  async function fetchCapitulosDB() {
    const { data } = await supabase.from("capitulos").select("*").order("nombre");
    setCapitulosDB((data||[]).map(c=>c.nombre));
  }
  async function fetchItems(pid) {
    const { data } = await supabase.from("presupuesto_items").select("*").eq("presupuesto_id",pid).order("orden");
    setItems(data||[]);
    // Rebuild capitulos with order from items
    const caps = [];
    (data||[]).forEach(i => {
      if (i.capitulo && !caps.find(c=>c.nombre===i.capitulo)) {
        caps.push({ nombre: i.capitulo, orden: Math.floor(i.orden/1000)||caps.length+1 });
      }
    });
    setCapitulosActivos(caps.sort((a,b)=>a.orden-b.orden));
  }
  async function buscarRubros(q) {
    let query = supabase.from("rubros").select("*, capitulos(nombre)").eq("activo",true);
    if (q) query = query.ilike("descripcion",`%${q}%`);
    const { data } = await query.order("descripcion").limit(60);
    setRubrosDB(data||[]);
  }
  async function saveCapituloToDB(nombre) {
    if (!capitulosDB.includes(nombre)) {
      await supabase.from("capitulos").insert({ nombre, orden: capitulosDB.length+1 });
      setCapitulosDB(prev=>[...prev, nombre]);
    }
  }

  // Get item number within capitulo: capIdx.itemIdx (e.g. 2.3)
  function getItemNum(capOrden, itemsEnCap, itemIdx) {
    return `${capOrden}.${itemIdx+1}`;
  }

  async function crearPresupuesto() {
    if (!form.nombre || !form.cliente_nombre) return;
    let cliente_id = form.cliente_id;
    if (form.cliente_id === "nuevo" && form.cliente_nombre) {
      const { data: nc } = await supabase.from("clientes").insert({ nombre:form.cliente_nombre }).select().single();
      if (nc) { cliente_id = nc.id; setClientes(prev=>[...prev,nc]); }
    }
    const { data, error } = await supabase.from("presupuestos").insert({
      nombre:form.nombre, cliente_id:cliente_id||null,
      cliente_nombre:form.cliente_nombre,
      honorarios_pct:Number(form.honorarios_pct),
      iva_pct:Number(form.iva_pct),
      notas:form.notas, created_by:currentUser.id
    }).select().single();
    if (!error && data) {
      setPresupuestoActivo(data); setItems([]); setCapitulosActivos([]);
      setSubVista("detalle"); fetchPresupuestos();
    }
  }

  function agregarCapitulo(nombre) {
    const trimmed = nombre.trim();
    if (!trimmed || capitulosActivos.find(c=>c.nombre===trimmed)) return;
    const nuevoOrden = capitulosActivos.length + 1;
    setCapitulosActivos(prev=>[...prev, { nombre:trimmed, orden:nuevoOrden }]);
    saveCapituloToDB(trimmed);
    setNuevoCapitulo(""); setShowAddCap(false);
  }

  function eliminarCapitulo(nombre) {
    if (items.some(i=>i.capitulo===nombre)) { alert(`Elimina primero los rubros de "${nombre}".`); return; }
    const updated = capitulosActivos.filter(c=>c.nombre!==nombre)
      .map((c,i)=>({...c, orden:i+1}));
    setCapitulosActivos(updated);
  }

  function moverCapitulo(nombre, direccion) {
    const idx = capitulosActivos.findIndex(c=>c.nombre===nombre);
    if (idx<0) return;
    const newIdx = idx+direccion;
    if (newIdx<0||newIdx>=capitulosActivos.length) return;
    const updated = [...capitulosActivos];
    [updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]];
    const reordered = updated.map((c,i)=>({...c,orden:i+1}));
    setCapitulosActivos(reordered);
  }

  async function agregarItem(capitulo, rubro) {
    if (!presupuestoActivo) return;
    const capOrden = capitulosActivos.find(c=>c.nombre===capitulo)?.orden || 1;
    const itemsEnCap = items.filter(i=>i.capitulo===capitulo).length;
    // orden = capOrden*1000 + itemIdx para mantener orden por capítulo
    const orden = capOrden * 1000 + itemsEnCap;
    const { data } = await supabase.from("presupuesto_items").insert({
      presupuesto_id:presupuestoActivo.id,
      capitulo, rubro_id:rubro.id||null,
      descripcion:rubro.descripcion,
      unidad:rubro.unidad||"",
      cantidad:Number(rubro.cantidad)||1,
      precio_unitario:Number(rubro.precio_unitario||rubro.precio_referencia)||0,
      total:(Number(rubro.cantidad)||1)*(Number(rubro.precio_unitario||rubro.precio_referencia)||0),
      orden
    }).select().single();
    if (data) { const ni=[...items,data]; setItems(ni); recalcTotales(ni); }
    setModalRubro(null); setBusquedaRubro(""); setRubrosDB([]);
    setManualRubro({descripcion:"",unidad:"",cantidad:1,precio_unitario:0});
  }

  async function actualizarItem(id, campo, valor) {
    const updated = items.map(i => {
      if (i.id!==id) return i;
      const u={...i,[campo]:valor};
      u.total=(Number(u.cantidad)||0)*(Number(u.precio_unitario)||0);
      return u;
    });
    setItems(updated);
    const item=updated.find(i=>i.id===id);
    await supabase.from("presupuesto_items").update({[campo]:valor,total:item.total}).eq("id",id);
    recalcTotales(updated);
  }

  async function eliminarItem(id) {
    await supabase.from("presupuesto_items").delete().eq("id",id);
    const u=items.filter(i=>i.id!==id); setItems(u); recalcTotales(u);
  }

  async function recalcTotales(itemsList) {
    if (!presupuestoActivo) return;
    const subtotal=itemsList.reduce((s,i)=>s+(Number(i.total)||0),0);
    const honorarios_monto=subtotal*(Number(presupuestoActivo.honorarios_pct)||0)/100;
    const base_iva=subtotal+honorarios_monto;
    const iva_monto=base_iva*(Number(presupuestoActivo.iva_pct)||0)/100;
    const total=base_iva+iva_monto;
    const upd={...presupuestoActivo,subtotal,honorarios_monto,iva_monto,total};
    setPresupuestoActivo(upd);
    await supabase.from("presupuestos").update({subtotal,honorarios_monto,iva_monto,total}).eq("id",presupuestoActivo.id);
  }

  async function leerCotizacion(e) {
    const file=e.target.files[0]; if(!file) return;
    setUploadingCotizacion(true); setCotizacionResult(null);
    try {
      const base64=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(",")[1]);r.onerror=rej;r.readAsDataURL(file);});
      const msgContent=file.type.startsWith("image/")?[
        {type:"image",source:{type:"base64",media_type:file.type,data:base64}},
        {type:"text",text:'Extrae todos los rubros. SOLO JSON sin markdown: {"proveedor":"","rubros":[{"descripcion":"","unidad":"","cantidad":0,"precio_unitario":0}]}'}
      ]:[{type:"text",text:'Extrae rubros. SOLO JSON sin markdown: {"proveedor":"","rubros":[{"descripcion":"","unidad":"","cantidad":0,"precio_unitario":0}]}'}];
      const res=await fetch("/api/nova",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-5",max_tokens:2000,messages:[{role:"user",content:msgContent}]})});
      const data=await res.json();
      setCotizacionResult(JSON.parse((data.content?.[0]?.text||"{}").replace(/```json|```/g,"").trim()));
    } catch { setCotizacionResult({error:"Error leyendo archivo."}); }
    setUploadingCotizacion(false); e.target.value="";
  }

  async function importarCotizacion() {
    if (!cotizacionResult?.rubros||!presupuestoActivo) return;
    const capNombre = "COTIZACIÓN PROVEEDOR";
    if (!capitulosActivos.find(c=>c.nombre===capNombre)) {
      setCapitulosActivos(prev=>[...prev,{nombre:capNombre,orden:prev.length+1}]);
    }
    const newItems=[];
    for (const r of cotizacionResult.rubros) {
      const capOrden = capitulosActivos.length + 1;
      const {data}=await supabase.from("presupuesto_items").insert({
        presupuesto_id:presupuestoActivo.id, capitulo:capNombre,
        descripcion:r.descripcion, unidad:r.unidad||"",
        cantidad:r.cantidad||1, precio_unitario:r.precio_unitario||0,
        total:(r.cantidad||1)*(r.precio_unitario||0),
        orden:capOrden*1000+newItems.length
      }).select().single();
      if (data) newItems.push(data);
    }
    const all=[...items,...newItems]; setItems(all); setCotizacionResult(null); recalcTotales(all);
  }

  async function leerParaBD(e) {
    const file=e.target.files[0]; if(!file) return;
    setUploadingBD(true); setBdResult(null);
    try {
      const base64=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(",")[1]);r.onerror=rej;r.readAsDataURL(file);});
      const msgContent=file.type.startsWith("image/")?[
        {type:"image",source:{type:"base64",media_type:file.type,data:base64}},
        {type:"text",text:'Lee este presupuesto. SOLO JSON sin markdown: {"proveedor":"","cliente":"","tipo":"residencial|oficinas|banca|otro","capitulos":["nombre1","nombre2"],"rubros":[{"capitulo":"","descripcion":"","unidad":"","cantidad":0,"precio_unitario":0}]}'}
      ]:[{type:"text",text:'Lee este presupuesto. SOLO JSON sin markdown: {"proveedor":"","cliente":"","tipo":"residencial|oficinas|banca|otro","capitulos":["nombre1"],"rubros":[{"capitulo":"","descripcion":"","unidad":"","cantidad":0,"precio_unitario":0}]}'}];
      const res=await fetch("/api/nova",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-5",max_tokens:4000,messages:[{role:"user",content:msgContent}]})});
      const data=await res.json();
      setBdResult(JSON.parse((data.content?.[0]?.text||"{}").replace(/```json|```/g,"").trim()));
    } catch { setBdResult({error:"Error leyendo archivo."}); }
    setUploadingBD(false); e.target.value="";
  }

  async function guardarEnBD(proveedor, cliente) {
    if (!bdResult?.rubros) return;
    let capsSaved=0;
    for (const cap of (bdResult.capitulos||[])) {
      if (cap && !capitulosDB.includes(cap)) {
        await supabase.from("capitulos").insert({nombre:cap,orden:capitulosDB.length+capsSaved+1});
        capsSaved++;
      }
    }
    if (capsSaved>0) fetchCapitulosDB();
    let nuevos=0, dups=0;
    for (const r of bdResult.rubros) {
      if (!r.descripcion||!r.precio_unitario) continue;
      const {data:existe}=await supabase.from("rubros").select("id").ilike("descripcion",r.descripcion).limit(1);
      if (existe&&existe.length>0) {
        dups++;
        await supabase.from("precios_historial").insert({rubro_id:existe[0].id,cliente_nombre:cliente||"",precio_unitario:r.precio_unitario,proyecto_ref:proveedor||"",fecha:new Date().getFullYear().toString()});
      } else {
        let capId=null;
        if (r.capitulo) { const {data:cap}=await supabase.from("capitulos").select("id").ilike("nombre",`%${r.capitulo}%`).limit(1); if(cap&&cap.length>0)capId=cap[0].id; }
        const {data:nr}=await supabase.from("rubros").insert({capitulo_id:capId,descripcion:r.descripcion,unidad:r.unidad||"",precio_referencia:r.precio_unitario,activo:true}).select().single();
        if (nr) { nuevos++; await supabase.from("precios_historial").insert({rubro_id:nr.id,cliente_nombre:cliente||"",precio_unitario:r.precio_unitario,proyecto_ref:proveedor||"",fecha:new Date().getFullYear().toString()}); }
      }
    }
    alert(`✅ ${capsSaved} capítulos nuevos · ${nuevos} rubros nuevos · ${dups} historial actualizado.`);
    setBdResult(null);
  }

  async function exportarExcel() {
    if (!presupuestoActivo||items.length===0) return;
    setExportando(true);
    let csv=`PRESUPUESTO: ${presupuestoActivo.nombre}\nCLIENTE: ${presupuestoActivo.cliente_nombre}\nFECHA: ${new Date().toLocaleDateString("es-EC")}\n\n`;
    csv+=`N°\tDESCRIPCIÓN\tUNIDAD\tCANTIDAD\tP.UNITARIO\tTOTAL\n`;
    for (const cap of capitulosActivos) {
      const ci=items.filter(i=>i.capitulo===cap.nombre).sort((a,b)=>a.orden-b.orden);
      if (ci.length===0) continue;
      csv+=`\n${cap.orden}. ${cap.nombre}\n`;
      ci.forEach((it,idx)=>{
        csv+=`${cap.orden}.${idx+1}\t${it.descripcion}\t${it.unidad}\t${it.cantidad}\t${it.precio_unitario}\t${it.total}\n`;
      });
      csv+=`\t\t\t\tSUBTOTAL ${cap.orden}. ${cap.nombre}\t${ci.reduce((s,i)=>s+(Number(i.total)||0),0).toFixed(2)}\n`;
    }
    csv+=`\n\t\t\t\tSUBTOTAL\t${(presupuestoActivo.subtotal||0).toFixed(2)}\n`;
    csv+=`\t\t\t\tHONORARIOS (${presupuestoActivo.honorarios_pct}%)\t${(presupuestoActivo.honorarios_monto||0).toFixed(2)}\n`;
    csv+=`\t\t\t\tIVA (${presupuestoActivo.iva_pct}%)\t${(presupuestoActivo.iva_monto||0).toFixed(2)}\n`;
    csv+=`\t\t\t\tTOTAL\t${(presupuestoActivo.total||0).toFixed(2)}\n`;
    const blob=new Blob(["\uFEFF"+csv],{type:"text/tab-separated-values;charset=utf-8"});
    const url=URL.createObjectURL(blob); const a=document.createElement("a");
    a.href=url; a.download=`${presupuestoActivo.nombre.replace(/\s+/g,"_")}.xls`; a.click(); URL.revokeObjectURL(url);
    setExportando(false);
  }

  const fmt=n=>(Number(n)||0).toLocaleString("es-EC",{minimumFractionDigits:2,maximumFractionDigits:2});
  const iS={width:"100%",background:"#F9FAFB",border:"1px solid #E5E7EB",borderRadius:8,color:"#111",padding:"9px 12px",fontSize:13,fontFamily:"'Inter',sans-serif",boxSizing:"border-box",outline:"none"};

  return (
    <div style={{fontFamily:"'Inter',sans-serif"}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:8}}>
        <div>
          <div style={{fontSize:17,fontWeight:700,color:"#111"}}>
            {subVista==="lista"?"💼 Presupuestos":subVista==="nuevo"?"💼 Nuevo presupuesto":subVista==="detalle"?`💼 ${presupuestoActivo?.nombre}`:subVista==="baseDatos"?"📊 Base de rubros":"📥 Alimentar BD"}
          </div>
          {subVista==="detalle"&&presupuestoActivo&&<div style={{fontSize:12,color:"#6B7280",marginTop:2}}>{presupuestoActivo.cliente_nombre} · Total: ${fmt(presupuestoActivo.total)}</div>}
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {subVista!=="lista"&&<button onClick={()=>setSubVista("lista")} style={{background:"#F3F4F6",border:"none",borderRadius:8,padding:"7px 12px",color:"#6B7280",fontSize:12,cursor:"pointer"}}>← Volver</button>}
          {subVista==="lista"&&<>
            <button onClick={()=>{setSubVista("baseDatos");buscarRubros("");}} style={{background:"#F3F4F6",border:"none",borderRadius:8,padding:"7px 12px",color:"#6B7280",fontSize:12,cursor:"pointer"}}>📊 Base de rubros</button>
            <button onClick={()=>setSubVista("alimentarBD")} style={{background:"#F3F4F6",border:"none",borderRadius:8,padding:"7px 12px",color:"#6B7280",fontSize:12,cursor:"pointer"}}>📥 Alimentar BD</button>
            <button onClick={()=>setShowAdminBD(true)} style={{background:"#F3F4F6",border:"none",borderRadius:8,padding:"7px 12px",color:"#6B7280",fontSize:12,cursor:"pointer"}}>🗄️ Admin BD</button>
            <button onClick={()=>setSubVista("nuevo")} style={{background:"#E8622A",border:"none",borderRadius:8,padding:"7px 12px",color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}>+ Nuevo presupuesto</button>
          </>}
          {subVista==="detalle"&&<>
            <button onClick={()=>fileRef.current?.click()} style={{background:"#FFF7F0",border:"1.5px solid #FED7AA",borderRadius:8,padding:"7px 12px",color:"#E8622A",fontSize:12,fontWeight:600,cursor:"pointer"}}>🤖 Subir cotización</button>
            <input ref={fileRef} type="file" accept="image/*,.pdf,.xlsx,.xls" onChange={leerCotizacion} style={{display:"none"}}/>
            <button onClick={exportarExcel} disabled={exportando||items.length===0} style={{background:"#059669",border:"none",borderRadius:8,padding:"7px 12px",color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}>{exportando?"Exportando...":"📥 Exportar Excel"}</button>
          </>}
        </div>
      </div>

      {showAdminBD&&<AdminBD onVolver={()=>setShowAdminBD(false)}/>}
      {!showAdminBD&&<>
      {/* COTIZACIÓN LEÍDA */}
      {subVista==="detalle"&&uploadingCotizacion&&<div style={{background:"#FFF7F0",border:"1.5px solid #FED7AA",borderRadius:10,padding:12,marginBottom:12,fontSize:13,color:"#E8622A"}}>🤖 NOVA leyendo cotización...</div>}
      {subVista==="detalle"&&cotizacionResult&&!cotizacionResult.error&&(
        <div style={{background:"#F0FDF4",border:"1.5px solid #BBF7D0",borderRadius:10,padding:14,marginBottom:14}}>
          <div style={{fontSize:13,fontWeight:600,color:"#059669",marginBottom:8}}>✓ {cotizacionResult.rubros?.length} rubros {cotizacionResult.proveedor?`— ${cotizacionResult.proveedor}`:""}</div>
          <div style={{maxHeight:120,overflowY:"auto",marginBottom:10}}>
            {cotizacionResult.rubros?.map((r,i)=><div key={i} style={{fontSize:11,color:"#374151",padding:"2px 0",borderBottom:"1px solid #E5E7EB"}}>{r.descripcion} · {r.unidad} · x{r.cantidad} · ${fmt(r.precio_unitario)}</div>)}
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setCotizacionResult(null)} style={{flex:1,background:"#fff",border:"1px solid #E5E7EB",borderRadius:6,padding:8,color:"#6B7280",fontSize:12,cursor:"pointer"}}>Cancelar</button>
            <button onClick={importarCotizacion} style={{flex:2,background:"#059669",border:"none",borderRadius:6,padding:8,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}>✓ Importar al presupuesto</button>
          </div>
        </div>
      )}

      {/* LISTA */}
      {subVista==="lista"&&(
        <div>
          {presupuestos.length===0?<div style={{textAlign:"center",padding:"60px 0",color:"#9CA3AF"}}><div style={{fontSize:40,marginBottom:12}}>💼</div>Sin presupuestos aún.</div>
          :presupuestos.map(p=>(
            <div key={p.id} onClick={()=>{setPresupuestoActivo(p);fetchItems(p.id);setSubVista("detalle");}}
              style={{background:"#fff",border:"1px solid #E5E7EB",borderRadius:10,padding:"14px 16px",marginBottom:8,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}
              onMouseEnter={e=>e.currentTarget.style.borderColor="#E8622A"} onMouseLeave={e=>e.currentTarget.style.borderColor="#E5E7EB"}>
              <div>
                <div style={{fontWeight:600,color:"#111",fontSize:14}}>{p.nombre}</div>
                <div style={{fontSize:12,color:"#6B7280",marginTop:2}}>{p.cliente_nombre} · {new Date(p.created_at).toLocaleDateString("es-EC")}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontWeight:700,color:"#E8622A",fontSize:16}}>${fmt(p.total)}</div>
                <div style={{fontSize:10,color:"#9CA3AF",background:"#F3F4F6",borderRadius:20,padding:"1px 8px",display:"inline-block",marginTop:2}}>{p.estado}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* NUEVO */}
      {subVista==="nuevo"&&(
        <div style={{background:"#fff",borderRadius:12,padding:20,border:"1px solid #E5E7EB"}}>
          <div style={{display:"grid",gap:14}}>
            <div><label style={{fontSize:11,color:"#6B7280",fontWeight:500,display:"block",marginBottom:4}}>Nombre *</label>
              <input value={form.nombre} onChange={e=>setForm(p=>({...p,nombre:e.target.value}))} placeholder="Ej: Remodelación BdP Condado" style={iS}/></div>
            <div><label style={{fontSize:11,color:"#6B7280",fontWeight:500,display:"block",marginBottom:4}}>Cliente *</label>
              <select value={form.cliente_id} onChange={e=>{const cl=clientes.find(c=>c.id===Number(e.target.value));setForm(p=>({...p,cliente_id:e.target.value,cliente_nombre:cl?.nombre||""}));}} style={iS}>
                <option value="">Selecciona cliente...</option>
                {clientes.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
                <option value="nuevo">+ Nuevo cliente</option>
              </select></div>
            {form.cliente_id==="nuevo"&&<div><label style={{fontSize:11,color:"#6B7280",fontWeight:500,display:"block",marginBottom:4}}>Nombre del nuevo cliente</label>
              <input value={form.cliente_nombre} onChange={e=>setForm(p=>({...p,cliente_nombre:e.target.value}))} placeholder="Nombre del cliente" style={iS}/></div>}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div><label style={{fontSize:11,color:"#6B7280",fontWeight:500,display:"block",marginBottom:4}}>Honorarios (%)</label>
                <input type="number" value={form.honorarios_pct} onChange={e=>setForm(p=>({...p,honorarios_pct:e.target.value}))} style={iS}/></div>
              <div><label style={{fontSize:11,color:"#6B7280",fontWeight:500,display:"block",marginBottom:4}}>IVA (%)</label>
                <input type="number" value={form.iva_pct} onChange={e=>setForm(p=>({...p,iva_pct:e.target.value}))} style={iS}/></div>
            </div>
            <div><label style={{fontSize:11,color:"#6B7280",fontWeight:500,display:"block",marginBottom:4}}>Notas</label>
              <textarea value={form.notas} onChange={e=>setForm(p=>({...p,notas:e.target.value}))} style={{...iS,minHeight:60,resize:"vertical"}} placeholder="Observaciones..."/></div>
          </div>
          <button onClick={crearPresupuesto} disabled={!form.nombre||!form.cliente_nombre}
            style={{width:"100%",marginTop:16,background:form.nombre&&form.cliente_nombre?"#E8622A":"#F3F4F6",border:"none",borderRadius:10,padding:12,color:form.nombre&&form.cliente_nombre?"#fff":"#9CA3AF",fontSize:14,fontWeight:600,cursor:form.nombre&&form.cliente_nombre?"pointer":"default"}}>
            Crear presupuesto →
          </button>
        </div>
      )}

      {/* DETALLE */}
      {subVista==="detalle"&&presupuestoActivo&&(
        <div>
          {capitulosActivos.length===0&&(
            <div style={{textAlign:"center",padding:"30px 0",color:"#9CA3AF",fontSize:13}}>
              <div style={{fontSize:28,marginBottom:8}}>📋</div>Sin capítulos aún. Agrega el primero abajo.
            </div>
          )}

          {capitulosActivos.map((cap,capIdx)=>{
            const capItems=items.filter(i=>i.capitulo===cap.nombre).sort((a,b)=>a.orden-b.orden);
            const capTotal=capItems.reduce((s,i)=>s+(Number(i.total)||0),0);
            return(
              <div key={cap.nombre} style={{marginBottom:10,background:"#fff",border:"1px solid #E5E7EB",borderRadius:10,overflow:"hidden"}}>
                {/* Capítulo header */}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 14px",background:"#FFF4F0"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    {/* Orden buttons */}
                    <div style={{display:"flex",flexDirection:"column",gap:1}}>
                      <button onClick={()=>moverCapitulo(cap.nombre,-1)} disabled={capIdx===0}
                        style={{background:"none",border:"none",color:capIdx===0?"#E5E7EB":"#9CA3AF",cursor:capIdx===0?"default":"pointer",fontSize:10,padding:"0 2px",lineHeight:1}}>▲</button>
                      <button onClick={()=>moverCapitulo(cap.nombre,1)} disabled={capIdx===capitulosActivos.length-1}
                        style={{background:"none",border:"none",color:capIdx===capitulosActivos.length-1?"#E5E7EB":"#9CA3AF",cursor:capIdx===capitulosActivos.length-1?"default":"pointer",fontSize:10,padding:"0 2px",lineHeight:1}}>▼</button>
                    </div>
                    <span style={{fontSize:13,fontWeight:700,color:"#E8622A"}}>{cap.orden}. {cap.nombre}</span>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    {capTotal>0&&<span style={{fontSize:12,fontWeight:600,color:"#374151"}}>${fmt(capTotal)}</span>}
                    <button onClick={()=>{setModalRubro({capitulo:cap.nombre,modo:"bd"});setBusquedaRubro("");buscarRubros("");fetchCapitulosDB();}} style={{background:"#E8622A",border:"none",borderRadius:6,padding:"3px 10px",color:"#fff",fontSize:11,cursor:"pointer",fontWeight:500}}>+ BD</button>
                    <button onClick={()=>{setModalRubro({capitulo:cap.nombre,modo:"manual"});setManualRubro({descripcion:"",unidad:"",cantidad:1,precio_unitario:0});}} style={{background:"#F3F4F6",border:"1px solid #E5E7EB",borderRadius:6,padding:"3px 10px",color:"#374151",fontSize:11,cursor:"pointer"}}>+ Manual</button>
                    <button onClick={()=>eliminarCapitulo(cap.nombre)} style={{background:"none",border:"none",color:"#DC2626",fontSize:14,cursor:"pointer",padding:"0 2px"}}>✕</button>
                  </div>
                </div>
                {capItems.length>0&&(
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                    <thead><tr style={{background:"#F9FAFB"}}>
                      {["N°","Descripción","Unidad","Cantidad","P.Unit","Total",""].map(h=>(
                        <th key={h} style={{padding:"6px 8px",textAlign:"left",fontSize:10,color:"#6B7280",fontWeight:600,borderBottom:"1px solid #E5E7EB"}}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {capItems.map((item,itemIdx)=>(
                        <tr key={item.id} style={{borderBottom:"1px solid #F3F4F6"}}>
                          <td style={{padding:"5px 8px",color:"#9CA3AF",fontSize:11,whiteSpace:"nowrap",fontWeight:500}}>{cap.orden}.{itemIdx+1}</td>
                          <td style={{padding:"5px 8px",color:"#111",maxWidth:200,fontSize:12}}>{item.descripcion}</td>
                          <td style={{padding:"5px 8px",color:"#6B7280",whiteSpace:"nowrap"}}>{item.unidad}</td>
                          <td style={{padding:"5px 8px"}}>
                            <input type="number" value={item.cantidad} onChange={e=>actualizarItem(item.id,"cantidad",e.target.value)}
                              style={{width:60,background:"#F9FAFB",border:"1px solid #E5E7EB",borderRadius:6,padding:"3px 6px",fontSize:12,textAlign:"right"}}/>
                          </td>
                          <td style={{padding:"5px 8px"}}>
                            <input type="number" value={item.precio_unitario} onChange={e=>actualizarItem(item.id,"precio_unitario",e.target.value)}
                              style={{width:80,background:"#F9FAFB",border:"1px solid #E5E7EB",borderRadius:6,padding:"3px 6px",fontSize:12,textAlign:"right"}}/>
                          </td>
                          <td style={{padding:"5px 8px",fontWeight:600,color:"#111",whiteSpace:"nowrap"}}>${fmt(item.total)}</td>
                          <td style={{padding:"5px 8px"}}>
                            <button onClick={()=>eliminarItem(item.id)} style={{background:"none",border:"none",color:"#DC2626",cursor:"pointer",fontSize:14,padding:0}}>✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}

          {/* Agregar capítulo */}
          <div style={{marginBottom:16}}>
            {!showAddCap?(
              <button onClick={()=>{setShowAddCap(true);fetchCapitulosDB();}} style={{width:"100%",background:"#fff",border:"1.5px dashed #E5E7EB",borderRadius:10,padding:"10px",color:"#9CA3AF",fontSize:13,cursor:"pointer"}}>
                + Agregar capítulo
              </button>
            ):(
              <div style={{background:"#fff",border:"1.5px solid #E8622A",borderRadius:10,padding:14}}>
                <div style={{fontSize:12,fontWeight:600,color:"#374151",marginBottom:8}}>Selecciona de la base de datos o escribe uno nuevo:</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:12,maxHeight:120,overflowY:"auto"}}>
                  {capitulosDB.filter(c=>!capitulosActivos.find(ca=>ca.nombre===c)).map(c=>(
                    <button key={c} onClick={()=>agregarCapitulo(c)}
                      style={{background:"#F9FAFB",border:"1px solid #E5E7EB",borderRadius:20,padding:"4px 12px",fontSize:11,color:"#374151",cursor:"pointer"}}
                      onMouseEnter={e=>{e.currentTarget.style.background="#FFF4F0";e.currentTarget.style.borderColor="#E8622A";e.currentTarget.style.color="#E8622A";}}
                      onMouseLeave={e=>{e.currentTarget.style.background="#F9FAFB";e.currentTarget.style.borderColor="#E5E7EB";e.currentTarget.style.color="#374151";}}>
                      {c}
                    </button>
                  ))}
                </div>
                <div style={{display:"flex",gap:8}}>
                  <input value={nuevoCapitulo} onChange={e=>setNuevoCapitulo(e.target.value)}
                    onKeyDown={e=>e.key==="Enter"&&agregarCapitulo(nuevoCapitulo)}
                    placeholder="O escribe capítulo nuevo (ej: Piscina, Generador...)" style={{...iS,flex:1}}/>
                  <button onClick={()=>agregarCapitulo(nuevoCapitulo)} disabled={!nuevoCapitulo.trim()}
                    style={{background:nuevoCapitulo.trim()?"#E8622A":"#F3F4F6",border:"none",borderRadius:8,padding:"9px 14px",color:nuevoCapitulo.trim()?"#fff":"#9CA3AF",fontSize:12,fontWeight:600,cursor:nuevoCapitulo.trim()?"pointer":"default",whiteSpace:"nowrap"}}>Agregar</button>
                  <button onClick={()=>{setShowAddCap(false);setNuevoCapitulo("");}} style={{background:"#F3F4F6",border:"none",borderRadius:8,padding:"9px 10px",color:"#6B7280",fontSize:12,cursor:"pointer"}}>×</button>
                </div>
              </div>
            )}
          </div>

          {/* Totales */}
          {items.length>0&&(
            <div style={{background:"#fff",border:"1px solid #E5E7EB",borderRadius:10,padding:16}}>
              {[["Subtotal",presupuestoActivo.subtotal],[`Honorarios (${presupuestoActivo.honorarios_pct}%)`,presupuestoActivo.honorarios_monto],[`IVA (${presupuestoActivo.iva_pct}%)`,presupuestoActivo.iva_monto]].map(([l,v])=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #F3F4F6",fontSize:13,color:"#6B7280"}}>
                  <span>{l}</span><span>${fmt(v)}</span>
                </div>
              ))}
              <div style={{display:"flex",justifyContent:"space-between",padding:"10px 0 0",fontSize:16,fontWeight:700,color:"#111"}}>
                <span>TOTAL</span><span style={{color:"#E8622A"}}>${fmt(presupuestoActivo.total)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* BASE DE RUBROS */}
      {subVista==="baseDatos"&&(
        <div>
          <input value={busquedaRubro} onChange={e=>{setBusquedaRubro(e.target.value);buscarRubros(e.target.value);}}
            placeholder="Buscar en base de rubros..." style={{...iS,marginBottom:12}}
            onFocus={()=>{if(!rubrosDB.length)buscarRubros("");}}/>
          <div style={{fontSize:11,color:"#9CA3AF",marginBottom:10}}>Base: 1,151+ rubros · Primeros 60 resultados</div>
          {rubrosDB.map(r=>(
            <div key={r.id} style={{background:"#fff",border:"1px solid #E5E7EB",borderRadius:8,padding:"10px 14px",marginBottom:5,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div><div style={{fontSize:13,fontWeight:500,color:"#111"}}>{r.descripcion}</div>
                <div style={{fontSize:11,color:"#9CA3AF",marginTop:2}}>{r.capitulos?.nombre} · {r.unidad}</div></div>
              <div style={{textAlign:"right",flexShrink:0,marginLeft:12}}>
                <div style={{fontSize:13,fontWeight:600,color:"#E8622A"}}>${fmt(r.precio_referencia)}</div>
                <div style={{fontSize:10,color:"#9CA3AF"}}>precio ref.</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ALIMENTAR BD */}
      {subVista==="alimentarBD"&&(
        <div>
          <div style={{background:"#fff",border:"1.5px solid #FED7AA",borderRadius:12,padding:18,marginBottom:16}}>
            <div style={{fontSize:14,fontWeight:600,color:"#E8622A",marginBottom:6}}>🤖 NOVA — Alimentar base de datos</div>
            <div style={{fontSize:12,color:"#6B7280",marginBottom:14}}>Sube presupuestos anteriores o cotizaciones. NOVA extrae capítulos y rubros. Los capítulos nuevos quedan disponibles para futuros presupuestos.</div>
            <button onClick={()=>fileBDRef.current?.click()} disabled={uploadingBD}
              style={{background:"#E8622A",border:"none",borderRadius:8,padding:"10px 18px",color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer"}}>
              {uploadingBD?"🤖 NOVA analizando...":"📤 Subir archivo"}
            </button>
            <input ref={fileBDRef} type="file" accept="image/*,.pdf,.xlsx,.xls" onChange={leerParaBD} style={{display:"none"}}/>
          </div>
          {bdResult&&!bdResult.error&&(
            <div style={{background:"#fff",border:"1px solid #E5E7EB",borderRadius:12,padding:18}}>
              <div style={{fontSize:14,fontWeight:600,color:"#111",marginBottom:8}}>✓ NOVA analizó el archivo</div>
              <div style={{display:"flex",gap:16,marginBottom:12,flexWrap:"wrap"}}>
                <div style={{fontSize:12,color:"#6B7280"}}>📋 <strong>{bdResult.rubros?.length}</strong> rubros</div>
                <div style={{fontSize:12,color:"#6B7280"}}>📂 <strong>{bdResult.capitulos?.length}</strong> capítulos</div>
                {bdResult.tipo&&<div style={{fontSize:12,color:"#6B7280"}}>🏗 <strong>{bdResult.tipo}</strong></div>}
              </div>
              {bdResult.capitulos?.length>0&&(
                <div style={{marginBottom:12}}>
                  <div style={{fontSize:11,fontWeight:600,color:"#374151",marginBottom:6}}>Capítulos detectados:</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                    {bdResult.capitulos.map((c,i)=>(
                      <span key={i} style={{background:capitulosDB.includes(c)?"#F3F4F6":"#FFF4F0",border:`1px solid ${capitulosDB.includes(c)?"#E5E7EB":"#FED7AA"}`,borderRadius:20,padding:"2px 10px",fontSize:11,color:capitulosDB.includes(c)?"#6B7280":"#E8622A"}}>
                        {c} {!capitulosDB.includes(c)&&"✨ nuevo"}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                <div><label style={{fontSize:11,color:"#6B7280",display:"block",marginBottom:4}}>Proveedor / Fuente</label>
                  <input defaultValue={bdResult.proveedor||""} id="bd-prov" placeholder="Nombre del proveedor" style={iS}/></div>
                <div><label style={{fontSize:11,color:"#6B7280",display:"block",marginBottom:4}}>Cliente de referencia</label>
                  <select id="bd-cli" style={iS}><option value="">Sin cliente</option>
                    {clientes.map(c=><option key={c.id} value={c.nombre}>{c.nombre}</option>)}</select></div>
              </div>
              <div style={{maxHeight:180,overflowY:"auto",marginBottom:12,border:"1px solid #F3F4F6",borderRadius:8}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                  <thead><tr style={{background:"#F9FAFB"}}>{["Capítulo","Descripción","Unidad","P.Unit"].map(h=><th key={h} style={{padding:"5px 8px",textAlign:"left",color:"#6B7280",fontWeight:600,borderBottom:"1px solid #E5E7EB"}}>{h}</th>)}</tr></thead>
                  <tbody>{bdResult.rubros?.map((r,i)=>(
                    <tr key={i} style={{borderBottom:"1px solid #F9FAFB"}}>
                      <td style={{padding:"4px 8px",color:"#9CA3AF",fontSize:10}}>{r.capitulo||"-"}</td>
                      <td style={{padding:"4px 8px",color:"#111"}}>{r.descripcion}</td>
                      <td style={{padding:"4px 8px",color:"#6B7280"}}>{r.unidad}</td>
                      <td style={{padding:"4px 8px",color:"#E8622A",fontWeight:600}}>${fmt(r.precio_unitario)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>setBdResult(null)} style={{flex:1,background:"#F3F4F6",border:"none",borderRadius:8,padding:10,color:"#6B7280",fontSize:12,cursor:"pointer"}}>Cancelar</button>
                <button onClick={()=>guardarEnBD(document.getElementById("bd-prov")?.value||"",document.getElementById("bd-cli")?.value||"")}
                  style={{flex:2,background:"#E8622A",border:"none",borderRadius:8,padding:10,color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer"}}>✓ Guardar en base de datos</button>
              </div>
            </div>
          )}
          {bdResult?.error&&<div style={{color:"#DC2626",fontSize:13,padding:12,background:"#FEE2E2",borderRadius:8}}>{bdResult.error}</div>}
        </div>
      )}

      {/* MODAL AGREGAR RUBRO */}
      {!showAdminBD&&modalRubro&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.3)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,padding:20}} onClick={()=>setModalRubro(null)}>
          <div style={{background:"#fff",borderRadius:16,padding:20,maxWidth:520,width:"100%",maxHeight:"80vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,0.15)"}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div>
                <div style={{fontSize:14,fontWeight:700,color:"#111"}}>Agregar rubro</div>
                <div style={{fontSize:12,color:"#E8622A",marginTop:2}}>📂 {capitulosActivos.find(c=>c.nombre===modalRubro.capitulo)?.orden}. {modalRubro.capitulo}</div>
              </div>
              <button onClick={()=>setModalRubro(null)} style={{background:"#F3F4F6",border:"none",borderRadius:6,width:28,height:28,color:"#6B7280",cursor:"pointer",fontSize:15}}>×</button>
            </div>
            <div style={{display:"flex",gap:4,marginBottom:12,background:"#F3F4F6",borderRadius:8,padding:4}}>
              <button onClick={()=>{setModalRubro(p=>({...p,modo:"bd"}));setBusquedaRubro("");buscarRubros("");fetchCapitulosDB();}} style={{flex:1,background:modalRubro.modo==="bd"?"#E8622A":"transparent",border:"none",borderRadius:6,padding:"6px",color:modalRubro.modo==="bd"?"#fff":"#6B7280",fontSize:12,fontWeight:600,cursor:"pointer"}}>🔍 De la BD</button>
              <button onClick={()=>setModalRubro(p=>({...p,modo:"manual"}))} style={{flex:1,background:modalRubro.modo==="manual"?"#E8622A":"transparent",border:"none",borderRadius:6,padding:"6px",color:modalRubro.modo==="manual"?"#fff":"#6B7280",fontSize:12,fontWeight:600,cursor:"pointer"}}>✏️ Manual</button>
            </div>
            {modalRubro.modo==="bd"&&(
              <div style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden"}}>
                <input value={busquedaRubro} onChange={e=>{setBusquedaRubro(e.target.value);buscarRubros(e.target.value);}} placeholder="Buscar rubro..." style={{...iS,marginBottom:10}}/>
                <div style={{overflowY:"auto",flex:1,border:"1px solid #F3F4F6",borderRadius:8}}>
                  {rubrosDB.length===0?<div style={{textAlign:"center",color:"#9CA3AF",padding:"20px 0",fontSize:13}}>Escribe para buscar en la base de datos</div>
                  :rubrosDB.map(r=>(
                    <div key={r.id} onClick={()=>agregarItem(modalRubro.capitulo,{...r,precio_unitario:r.precio_referencia})}
                      style={{padding:"10px 12px",borderBottom:"1px solid #F3F4F6",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}
                      onMouseEnter={e=>e.currentTarget.style.background="#FFF4F0"} onMouseLeave={e=>e.currentTarget.style.background=""}>
                      <div>
                        <div style={{fontSize:13,fontWeight:500,color:"#111"}}>{r.descripcion}</div>
                        <div style={{fontSize:11,color:"#9CA3AF"}}>{r.capitulos?.nombre} · {r.unidad}</div>
                      </div>
                      <div style={{textAlign:"right",marginLeft:10,flexShrink:0}}>
                        <div style={{fontSize:13,fontWeight:600,color:"#E8622A"}}>${fmt(r.precio_referencia)}</div>
                        <div style={{fontSize:10,color:"#9CA3AF"}}>ref.</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {modalRubro.modo==="manual"&&(
              <div style={{display:"grid",gap:12}}>
                <div><label style={{fontSize:11,color:"#6B7280",display:"block",marginBottom:4}}>Descripción *</label>
                  <input value={manualRubro.descripcion} onChange={e=>setManualRubro(p=>({...p,descripcion:e.target.value}))} placeholder="Descripción del rubro" style={iS}/></div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                  <div><label style={{fontSize:11,color:"#6B7280",display:"block",marginBottom:4}}>Unidad</label>
                    <input value={manualRubro.unidad} onChange={e=>setManualRubro(p=>({...p,unidad:e.target.value}))} placeholder="m², ml, glb..." style={iS}/></div>
                  <div><label style={{fontSize:11,color:"#6B7280",display:"block",marginBottom:4}}>Cantidad</label>
                    <input type="number" value={manualRubro.cantidad} onChange={e=>setManualRubro(p=>({...p,cantidad:e.target.value}))} style={iS}/></div>
                  <div><label style={{fontSize:11,color:"#6B7280",display:"block",marginBottom:4}}>Precio unit.</label>
                    <input type="number" value={manualRubro.precio_unitario} onChange={e=>setManualRubro(p=>({...p,precio_unitario:e.target.value}))} style={iS}/></div>
                </div>
                <div style={{background:"#F9FAFB",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#374151",display:"flex",justifyContent:"space-between"}}>
                  <span>Total:</span><span style={{fontWeight:700,color:"#E8622A"}}>${fmt((Number(manualRubro.cantidad)||0)*(Number(manualRubro.precio_unitario)||0))}</span>
                </div>
                <button onClick={()=>agregarItem(modalRubro.capitulo,{...manualRubro,precio_referencia:manualRubro.precio_unitario})} disabled={!manualRubro.descripcion}
                  style={{background:manualRubro.descripcion?"#E8622A":"#F3F4F6",border:"none",borderRadius:8,padding:"10px",color:manualRubro.descripcion?"#fff":"#9CA3AF",fontSize:13,fontWeight:600,cursor:manualRubro.descripcion?"pointer":"default"}}>
                  + Agregar al presupuesto
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      </>}
    </div>
  );
}
