import { useState, useRef, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://qxoincfvscvbqvoxamdi.supabase.co";
const SUPABASE_KEY = "sb_publishable_UXB8WueKrn1zBSXfsTqJ0w_C61L3b77";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const USERS_DEFAULT = [
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
  { id: 10, name: "Testing",          color: "#E8622A" },
  { id: 1,  name: "BdP Condado",      color: "#2563EB" },
  { id: 2,  name: "BdP Urdesa",       color: "#7C3AED" },
  { id: 3,  name: "BdP Banca Seguros",color: "#DB2777" },
  { id: 4,  name: "Fowler",           color: "#D97706" },
  { id: 5,  name: "Banderas",         color: "#059669" },
  { id: 6,  name: "Servipagos",       color: "#DC2626" },
  { id: 7,  name: "Zuleta",           color: "#0891B2" },
  { id: 8,  name: "La Quinta",        color: "#65A30D" },
  { id: 9,  name: "ManEugenia",       color: "#9333EA" },
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

const getProject = id => PROJECTS.find(p=>p.id===id);
const getUser    = id => USERS_DEFAULT.find(u=>u.id===id);
const esAdmin    = role => role==="owner"||role==="assistant";

function daysUntil(d) {
  const t=new Date(); t.setHours(0,0,0,0);
  return Math.ceil((new Date(d)-t)/86400000);
}
function timeAgo(ts) {
  const m=Math.floor((new Date()-new Date(ts))/60000);
  if(m<1)return"ahora"; if(m<60)return`${m}m`;
  const h=Math.floor(m/60); if(h<24)return`${h}h`;
  return`${Math.floor(h/24)}d`;
}

function Avatar({initials,size=36,color="#E8622A"}){
  return <div style={{width:size,height:size,borderRadius:"50%",background:color,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.32,fontWeight:700,flexShrink:0,fontFamily:"'DM Mono',monospace"}}>{initials}</div>;
}

function FechaBadge({due}){
  const d=daysUntil(due);
  const s={fontSize:11,fontWeight:600,padding:"2px 8px",borderRadius:20};
  if(d<0) return <span style={{...s,color:"#DC2626",background:"#FEE2E2"}}>Vencida {Math.abs(d)}d</span>;
  if(d===0) return <span style={{...s,color:"#D97706",background:"#FEF3C7"}}>Hoy</span>;
  if(d<=2)  return <span style={{...s,color:"#D97706",background:"#FEF3C7",fontWeight:500}}>en {d}d</span>;
  return <span style={{...s,color:"#6B7280",background:"#F3F4F6",fontWeight:400}}>en {d}d</span>;
}

// ── LOGIN ──────────────────────────────────────────────────────────────────
function LoginScreen({onLogin}){
  const [sel,setSel]=useState(null);
  const [pin,setPin]=useState("");
  const [err,setErr]=useState("");
  const [step,setStep]=useState("pick");

  useEffect(()=>{
    try{
      const s=localStorage.getItem("foreman_session");
      if(s){const{userId,expires}=JSON.parse(s);if(new Date(expires)>new Date()){const u=USERS_DEFAULT.find(u=>u.id===userId);if(u)onLogin(u);}}
    }catch{}
  },[]);

  function sel2(u){setSel(u);setPin("");setErr("");setStep("pin");}
  function handlePin(d){
    if(pin.length>=4)return;
    const n=pin+d; setPin(n);
    if(n.length===4){setTimeout(()=>{
      if(n===sel.pin){
        const exp=new Date(); exp.setDate(exp.getDate()+7);
        localStorage.setItem("foreman_session",JSON.stringify({userId:sel.id,expires:exp.toISOString()}));
        onLogin(sel);
      }else{setErr("PIN incorrecto");setPin("");}
    },200);}
  }

  const btnS={width:"100%",background:"#fff",border:"1.5px solid #F3F4F6",borderRadius:14,padding:"12px 16px",marginBottom:8,display:"flex",alignItems:"center",gap:14,cursor:"pointer",transition:"all 0.15s",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"};

  return(
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#FFF7F0 0%,#fff 50%,#F0F4FF 100%)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500;600&family=Fraunces:ital,wght@0,300;0,600;1,300&display=swap');*{box-sizing:border-box}@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>

      <div style={{marginBottom:36,textAlign:"center",animation:"fadeUp 0.4s ease"}}>
        <div style={{display:"inline-flex",alignItems:"center",gap:8,background:"#E8622A",borderRadius:12,padding:"6px 14px",marginBottom:14}}>
          <span style={{color:"#fff",fontSize:12,fontFamily:"'DM Mono',monospace",fontWeight:600,letterSpacing:2}}>FOREMAN</span>
          <span style={{background:"rgba(255,255,255,0.3)",color:"#fff",fontSize:9,fontFamily:"'DM Mono',monospace",fontWeight:600,padding:"1px 6px",borderRadius:20}}>BETA</span>
        </div>
        <div style={{fontSize:30,fontFamily:"'Fraunces',serif",fontWeight:300,color:"#111"}}>by <em>NOVA</em></div>
        <div style={{fontSize:12,color:"#9CA3AF",marginTop:6,fontFamily:"'DM Mono',monospace"}}>Tu capataz digital · Sesión de 7 días</div>
      </div>

      {step==="pick"&&(
        <div style={{width:"100%",maxWidth:380,animation:"fadeUp 0.4s ease 0.1s both"}}>
          <div style={{fontSize:10,fontFamily:"'DM Mono',monospace",color:"#9CA3AF",letterSpacing:1,marginBottom:10,textAlign:"center"}}>SELECCIONA TU PERFIL</div>
          {USERS_DEFAULT.map((u,i)=>(
            <button key={u.id} onClick={()=>sel2(u)} style={{...btnS,animation:`fadeUp 0.4s ease ${i*0.03}s both`}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor="#E8622A";e.currentTarget.style.boxShadow="0 4px 12px rgba(232,98,42,0.1)";}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor="#F3F4F6";e.currentTarget.style.boxShadow="0 1px 4px rgba(0,0,0,0.04)";}}>
              <Avatar initials={u.avatar} size={38} color={u.role==="owner"?"#E8622A":u.role==="assistant"?"#7C3AED":"#2563EB"}/>
              <div style={{textAlign:"left"}}>
                <div style={{color:"#111",fontSize:14,fontWeight:600,fontFamily:"'DM Mono',monospace"}}>{u.name}</div>
                <div style={{color:"#9CA3AF",fontSize:11,fontFamily:"'DM Mono',monospace"}}>{u.role==="owner"?"👑 Director":u.role==="assistant"?"🤝 Asistente":"👷 Equipo"}</div>
              </div>
              <div style={{marginLeft:"auto",color:"#D1D5DB",fontSize:18}}>›</div>
            </button>
          ))}
        </div>
      )}

      {step==="pin"&&sel&&(
        <div style={{width:"100%",maxWidth:280,textAlign:"center",animation:"fadeUp 0.3s ease"}}>
          <button onClick={()=>{setStep("pick");setErr("");}} style={{background:"none",border:"none",color:"#9CA3AF",cursor:"pointer",fontSize:12,marginBottom:20,fontFamily:"'DM Mono',monospace",display:"flex",alignItems:"center",gap:4,margin:"0 auto 20px"}}>← Volver</button>
          <Avatar initials={sel.avatar} size={60} color={sel.role==="owner"?"#E8622A":sel.role==="assistant"?"#7C3AED":"#2563EB"}/>
          <div style={{color:"#111",fontSize:18,fontWeight:600,marginTop:12,fontFamily:"'DM Mono',monospace"}}>{sel.name}</div>
          <div style={{color:"#9CA3AF",fontSize:12,marginBottom:28,marginTop:6,fontFamily:"'DM Mono',monospace"}}>Ingresa tu PIN</div>
          <div style={{display:"flex",justifyContent:"center",gap:16,marginBottom:28}}>
            {[0,1,2,3].map(i=><div key={i} style={{width:13,height:13,borderRadius:"50%",background:pin.length>i?"#E8622A":"#E5E7EB",transition:"background 0.15s"}}/>)}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,maxWidth:220,margin:"0 auto"}}>
            {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((d,i)=>(
              <button key={i} onClick={()=>{if(d==="⌫")setPin(p=>p.slice(0,-1));else if(d!=="")handlePin(d);}}
                style={{background:d===""?"transparent":"#fff",border:d===""?"none":"1.5px solid #E5E7EB",borderRadius:14,height:56,color:"#111",fontSize:19,fontWeight:500,cursor:d===""?"default":"pointer",fontFamily:"'DM Mono',monospace",transition:"all 0.1s",boxShadow:d===""?"none":"0 1px 3px rgba(0,0,0,0.05)"}}
                onMouseEnter={e=>{if(d!==""){e.currentTarget.style.background="#FFF7F0";e.currentTarget.style.borderColor="#E8622A";}}}
                onMouseLeave={e=>{if(d!==""){e.currentTarget.style.background="#fff";e.currentTarget.style.borderColor="#E5E7EB";}}}
              >{d}</button>
            ))}
          </div>
          {err&&<div style={{color:"#DC2626",fontSize:12,marginTop:14,fontFamily:"'DM Mono',monospace"}}>{err}</div>}
        </div>
      )}
    </div>
  );
}

// ── NOVA INPUT ─────────────────────────────────────────────────────────────
function NovaInput({currentUser,onTaskCreated}){
  const [texto,setTexto]=useState("");
  const [loading,setLoading]=useState(false);
  const [result,setResult]=useState(null);
  const [grabando,setGrabando]=useState(false);

  function startVoice(){
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR){alert("Usa Chrome para dictado por voz.");return;}
    const r=new SR(); r.lang="es-ES"; r.continuous=false; r.interimResults=false;
    r.onresult=e=>{setTexto(e.results[0][0].transcript);setGrabando(false);};
    r.onerror=()=>setGrabando(false); r.onend=()=>setGrabando(false);
    r.start(); setGrabando(true);
  }

  async function procesar(){
    if(!texto.trim())return;
    setLoading(true); setResult(null);
    try{
      const res=await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          model:"claude-sonnet-4-20250514",max_tokens:600,
          system:`Eres NOVA. Extrae datos de la tarea y responde SOLO JSON sin markdown:
{"title":"...","project_id":N,"assignee_id":N_OR_NULL,"type":"...","due_date":"YYYY-MM-DD","priority":"urgente|alta|media|baja","notes":"..."}
Proyectos: 10=Testing,1=BdP Condado,2=BdP Urdesa,3=BdP Banca Seguros,4=Fowler,5=Banderas,6=Servipagos,7=Zuleta,8=La Quinta,9=ManEugenia.
Usuarios: 1=Hernan,2=Johanna,3=Hector,4=Josh,5=Guillermo,6=Camila,7=Santiago,8=Gerardo,9=Luis Guala.
Tipos: Llamada,Reunión,Contrato,Compra,Inspección,Aprobación,Visita a obra,Otro.
Hoy: ${new Date().toISOString().split("T")[0]}. Sin fecha clara usa mañana.`,
          messages:[{role:"user",content:texto}]
        })
      });
      const data=await res.json();
      const t=data.content?.[0]?.text||"{}";
      setResult(JSON.parse(t.replace(/```json|```/g,"").trim()));
    }catch{setResult({error:"No pude entender. Intenta de nuevo."});}
    setLoading(false);
  }

  async function confirmar(){
    if(!result||result.error)return;
    await supabase.from("tasks").insert({...result,created_by:currentUser.id});
    setTexto(""); setResult(null); onTaskCreated();
  }

  return(
    <div style={{background:"#fff",border:"1.5px solid #FED7AA",borderRadius:16,padding:16,marginBottom:20,boxShadow:"0 2px 8px rgba(232,98,42,0.06)"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
        <div style={{width:32,height:32,borderRadius:"50%",background:"linear-gradient(135deg,#E8622A,#F97316)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15}}>🤖</div>
        <div>
          <div style={{fontFamily:"'DM Mono',monospace",fontSize:12,fontWeight:600,color:"#E8622A"}}>NOVA</div>
          <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#9CA3AF"}}>Dime la tarea — escribe o dicta 🎤</div>
        </div>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:10}}>
        <textarea value={texto} onChange={e=>setTexto(e.target.value)} placeholder='"Tarea para Hector, inspección en BdP Condado, urgente para mañana"'
          style={{flex:1,background:"#FFF7F0",border:"1.5px solid #FED7AA",borderRadius:10,color:"#111",fontSize:13,fontFamily:"Georgia,serif",padding:"10px 12px",resize:"none",outline:"none",lineHeight:1.5,minHeight:56}}/>
        <button onClick={startVoice} title="Dictado por voz" style={{width:44,background:grabando?"#FEE2E2":"#FFF7F0",border:`1.5px solid ${grabando?"#DC2626":"#FED7AA"}`,borderRadius:10,cursor:"pointer",fontSize:20,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,animation:grabando?"pulse 1s infinite":"none"}}>🎤</button>
      </div>
      {!result&&<button onClick={procesar} disabled={!texto.trim()||loading} style={{width:"100%",background:texto.trim()&&!loading?"#E8622A":"#F3F4F6",border:"none",borderRadius:10,padding:10,color:texto.trim()&&!loading?"#fff":"#9CA3AF",fontFamily:"'DM Mono',monospace",fontSize:13,fontWeight:600,cursor:texto.trim()&&!loading?"pointer":"default",transition:"all 0.15s"}}>
        {loading?"NOVA procesando...":"Crear tarea →"}
      </button>}
      {result&&!result.error&&(
        <div style={{background:"#F0FDF4",border:"1.5px solid #BBF7D0",borderRadius:10,padding:12}}>
          <div style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"#059669",fontWeight:600,marginBottom:6}}>✓ NOVA entendió:</div>
          <div style={{fontSize:13,fontFamily:"'DM Mono',monospace",color:"#111",marginBottom:3}}><strong>{result.title}</strong></div>
          <div style={{fontSize:11,color:"#6B7280",fontFamily:"'DM Mono',monospace"}}>{getProject(result.project_id)?.name} · {result.assignee_id?getUser(result.assignee_id)?.name:"Sin asignar"} · {result.due_date} · {result.priority}</div>
          <div style={{display:"flex",gap:8,marginTop:10}}>
            <button onClick={()=>setResult(null)} style={{flex:1,background:"#fff",border:"1.5px solid #E5E7EB",borderRadius:8,padding:8,color:"#6B7280",fontFamily:"'DM Mono',monospace",fontSize:12,cursor:"pointer"}}>Cancelar</button>
            <button onClick={confirmar} style={{flex:2,background:"#059669",border:"none",borderRadius:8,padding:8,color:"#fff",fontFamily:"'DM Mono',monospace",fontSize:12,fontWeight:600,cursor:"pointer"}}>✓ Confirmar</button>
          </div>
        </div>
      )}
      {result?.error&&<div style={{color:"#DC2626",fontSize:12,fontFamily:"'DM Mono',monospace",marginTop:8}}>{result.error}</div>}
    </div>
  );
}

// ── AI BRIEFING ────────────────────────────────────────────────────────────
function AIBriefing({tasks,currentUser}){
  const [texto,setTexto]=useState("");
  const [loading,setLoading]=useState(false);
  const [visible,setVisible]=useState(false);

  async function obtener(){
    setLoading(true); setVisible(true);
    const resumen=tasks.length?tasks.map(t=>{const d=daysUntil(t.due_date);return`- [${(t.priority||"media").toUpperCase()}] ${t.title} | ${getProject(t.project_id)?.name} | ${t.assignee_id?getUser(t.assignee_id)?.name:"sin asignar"} | ${d<0?`VENCIDA ${Math.abs(d)}d`:d===0?"HOY":`en ${d}d`} | ${t.status}`;}).join("\n"):"Sin tareas registradas.";
    try{
      const res=await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          model:"claude-sonnet-4-20250514",max_tokens:600,
          system:`Eres NOVA, asistente personal de ${currentUser.name}, director de constructora. Briefing matutino en español. Máx 4 puntos concretos. Primero lo crítico. Menciona nombres y proyectos. Directo y útil.`,
          messages:[{role:"user",content:`Tareas:\n${resumen}\n\nBriefing del día.`}]
        })
      });
      const data=await res.json();
      setTexto(data.content?.[0]?.text||"Todo en orden.");
    }catch{setTexto("⚠️ Error de conexión. Intenta de nuevo.");}
    setLoading(false);
  }

  if(!visible)return(
    <button onClick={obtener} style={{background:"linear-gradient(135deg,#E8622A,#F97316)",border:"none",borderRadius:14,padding:"14px 18px",color:"#fff",fontFamily:"'DM Mono',monospace",fontSize:13,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:10,width:"100%",boxShadow:"0 4px 16px rgba(232,98,42,0.25)",marginBottom:20}}>
      <span style={{fontSize:20}}>🤖</span>
      <div style={{textAlign:"left"}}>
        <div>NOVA — Briefing del día</div>
        <div style={{fontSize:10,opacity:0.8,marginTop:1}}>Analizar todos tus proyectos</div>
      </div>
      <span style={{marginLeft:"auto",fontSize:18}}>→</span>
    </button>
  );

  return(
    <div style={{background:"#fff",border:"1.5px solid #FED7AA",borderRadius:16,padding:16,marginBottom:20,boxShadow:"0 2px 8px rgba(232,98,42,0.06)"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
        <div style={{width:36,height:36,borderRadius:"50%",background:"linear-gradient(135deg,#E8622A,#F97316)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>🤖</div>
        <div>
          <div style={{fontFamily:"'DM Mono',monospace",fontSize:13,fontWeight:600,color:"#E8622A"}}>NOVA — Briefing del día</div>
        </div>
        <button onClick={()=>setVisible(false)} style={{marginLeft:"auto",background:"none",border:"none",color:"#9CA3AF",cursor:"pointer",fontSize:18}}>×</button>
      </div>
      {loading?<div style={{color:"#9CA3AF",fontFamily:"'DM Mono',monospace",fontSize:12}}>Analizando {tasks.length} tareas...</div>
        :<div style={{color:"#374151",fontFamily:"Georgia,serif",fontSize:14,lineHeight:1.7,whiteSpace:"pre-wrap"}}>{texto}</div>}
      {!loading&&<button onClick={obtener} style={{marginTop:12,background:"#FFF7F0",border:"1.5px solid #FED7AA",borderRadius:8,padding:"6px 14px",color:"#E8622A",fontFamily:"'DM Mono',monospace",fontSize:11,cursor:"pointer",fontWeight:600}}>↺ Actualizar</button>}
    </div>
  );
}

// ── WHATSAPP ───────────────────────────────────────────────────────────────
function WhatsApp({task}){
  const [msg,setMsg]=useState("");
  const [loading,setLoading]=useState(false);
  const [open,setOpen]=useState(false);
  const m=task.assignee_id?getUser(task.assignee_id):null;
  const p=getProject(task.project_id);
  const d=daysUntil(task.due_date);
  const followup=task.priority==="urgente"?"cada 3h":task.priority==="alta"?"cada 6h":"diario";

  async function generar(){
    setLoading(true);setOpen(true);
    const vence=d<0?`tiene ${Math.abs(d)} días de retraso`:d===0?"vence HOY":`vence en ${d} días`;
    try{
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:400,system:"Recordatorios WhatsApp para director de construcción. Español. Máx 3 oraciones. Directo. Solo el mensaje.",messages:[{role:"user",content:`Para ${m?.name||"equipo"}: "${task.title}" en ${p?.name}. ${vence}. Prioridad: ${task.priority}.`}]})});
      const data=await res.json();setMsg(data.content?.[0]?.text||"");
    }catch{setMsg("Error.");}
    setLoading(false);
  }

  return(
    <>
      <button onClick={generar} style={{background:"#22C55E",border:"none",borderRadius:8,padding:"6px 12px",color:"#fff",fontSize:12,fontFamily:"'DM Mono',monospace",fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>📲 WA</button>
      {open&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.3)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,padding:20}} onClick={()=>setOpen(false)}>
          <div style={{background:"#fff",borderRadius:20,padding:24,maxWidth:420,width:"100%",boxShadow:"0 20px 60px rgba(0,0,0,0.15)"}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
              <span style={{fontSize:24}}>📲</span>
              <div><div style={{fontFamily:"'DM Mono',monospace",fontSize:13,fontWeight:700,color:"#111"}}>WhatsApp</div>{m&&<div style={{color:"#6B7280",fontSize:11,fontFamily:"'DM Mono',monospace"}}>{m.name} · seguimiento {followup}</div>}</div>
              <button onClick={()=>setOpen(false)} style={{marginLeft:"auto",background:"none",border:"none",color:"#9CA3AF",cursor:"pointer",fontSize:20}}>×</button>
            </div>
            {loading?<div style={{color:"#9CA3AF",fontFamily:"'DM Mono',monospace",fontSize:12,padding:"20px 0",textAlign:"center"}}>NOVA redactando...</div>
              :<>
                <textarea value={msg} onChange={e=>setMsg(e.target.value)} style={{width:"100%",minHeight:100,background:"#F9FAFB",border:"1.5px solid #E5E7EB",borderRadius:12,color:"#111",fontSize:14,fontFamily:"Georgia,serif",padding:12,resize:"vertical",boxSizing:"border-box",lineHeight:1.6,outline:"none"}}/>
                <div style={{display:"flex",gap:8,marginTop:12}}>
                  <button onClick={generar} style={{flex:1,background:"#F9FAFB",border:"1.5px solid #E5E7EB",borderRadius:10,padding:10,color:"#6B7280",fontFamily:"'DM Mono',monospace",fontSize:12,cursor:"pointer"}}>↺</button>
                  {m?<button onClick={()=>window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`,"_blank")} style={{flex:2,background:"#22C55E",border:"none",borderRadius:10,padding:10,color:"#fff",fontFamily:"'DM Mono',monospace",fontSize:13,fontWeight:700,cursor:"pointer"}}>Abrir WhatsApp →</button>
                    :<div style={{flex:2,color:"#9CA3AF",fontSize:12,fontFamily:"'DM Mono',monospace",display:"flex",alignItems:"center",justifyContent:"center"}}>Sin asignado</div>}
                </div>
              </>}
          </div>
        </div>
      )}
    </>
  );
}

// ── CHAT ───────────────────────────────────────────────────────────────────
function ChatTarea({task,currentUser,onClose}){
  const [texto,setTexto]=useState("");
  const [comments,setComments]=useState([]);
  const [loading,setLoading]=useState(true);
  const bottomRef=useRef(null);
  const chRef=useRef(null);

  useEffect(()=>{
    fetchComments();
    if(chRef.current)supabase.removeChannel(chRef.current);
    const ch=supabase.channel(`chat-${task.id}-${Date.now()}`)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"comments",filter:`task_id=eq.${task.id}`},
        payload=>setComments(prev=>prev.find(c=>c.id===payload.new.id)?prev:[...prev,payload.new]))
      .subscribe();
    chRef.current=ch;
    return()=>{if(chRef.current)supabase.removeChannel(chRef.current);};
  },[task.id]);

  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});},[comments]);

  async function fetchComments(){
    const{data}=await supabase.from("comments").select("*").eq("task_id",task.id).order("created_at",{ascending:true});
    setComments(data||[]);setLoading(false);
  }

  async function enviar(){
    if(!texto.trim())return;
    const msg=texto.trim();setTexto("");
    await supabase.from("comments").insert({task_id:task.id,user_id:currentUser.id,text:msg});
  }

  const proy=getProject(task.project_id);

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.25)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:200}}>
      <div style={{background:"#fff",borderRadius:"24px 24px 0 0",width:"100%",maxWidth:560,maxHeight:"85vh",display:"flex",flexDirection:"column",boxShadow:"0 -10px 40px rgba(0,0,0,0.1)"}}>
        <div style={{padding:"14px 20px 10px",borderBottom:"1px solid #F3F4F6",flexShrink:0}}>
          <div style={{width:40,height:4,background:"#E5E7EB",borderRadius:2,margin:"0 auto 12px"}}/>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:4,height:34,borderRadius:2,background:proy?.color,flexShrink:0}}/>
            <div style={{flex:1}}>
              <div style={{color:"#111",fontSize:14,fontWeight:600,fontFamily:"'DM Mono',monospace"}}>{task.title}</div>
              <div style={{color:"#9CA3AF",fontSize:11,fontFamily:"'DM Mono',monospace"}}>{proy?.name} · {comments.length} mensajes · tiempo real</div>
            </div>
            <button onClick={onClose} style={{background:"#F3F4F6",border:"none",borderRadius:8,width:32,height:32,color:"#6B7280",cursor:"pointer",fontSize:16}}>×</button>
          </div>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"14px 20px",display:"flex",flexDirection:"column",gap:10}}>
          {loading&&<div style={{textAlign:"center",color:"#9CA3AF",fontFamily:"'DM Mono',monospace",fontSize:12,padding:"20px 0"}}>Cargando...</div>}
          {!loading&&comments.length===0&&<div style={{textAlign:"center",color:"#9CA3AF",fontFamily:"'DM Mono',monospace",fontSize:12,padding:"30px 0"}}>💬 Sin mensajes aún.</div>}
          {comments.map(c=>{
            const autor=getUser(c.user_id);
            const esMio=c.user_id===currentUser.id;
            return(
              <div key={c.id} style={{display:"flex",flexDirection:esMio?"row-reverse":"row",gap:8,alignItems:"flex-end"}}>
                {!esMio&&<Avatar initials={autor?.avatar||"??"} size={28} color={autor?.role==="owner"?"#E8622A":autor?.role==="assistant"?"#7C3AED":"#2563EB"}/>}
                <div style={{maxWidth:"72%"}}>
                  {!esMio&&<div style={{color:"#9CA3AF",fontSize:10,fontFamily:"'DM Mono',monospace",marginBottom:3,paddingLeft:2}}>{autor?.name}</div>}
                  <div style={{background:esMio?"#E8622A":"#F3F4F6",borderRadius:esMio?"16px 4px 16px 16px":"4px 16px 16px 16px",padding:"10px 14px"}}>
                    <div style={{color:esMio?"#fff":"#111",fontSize:14,lineHeight:1.5,fontFamily:"Georgia,serif"}}>{c.text}</div>
                  </div>
                  <div style={{color:"#D1D5DB",fontSize:10,fontFamily:"'DM Mono',monospace",marginTop:3,textAlign:esMio?"right":"left"}}>{timeAgo(c.created_at)}</div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef}/>
        </div>
        <div style={{padding:"10px 16px 20px",borderTop:"1px solid #F3F4F6",flexShrink:0,display:"flex",gap:10,alignItems:"flex-end"}}>
          <Avatar initials={currentUser.avatar} size={32} color={currentUser.role==="owner"?"#E8622A":currentUser.role==="assistant"?"#7C3AED":"#2563EB"}/>
          <textarea value={texto} onChange={e=>setTexto(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();enviar();}}} placeholder="Escribe un mensaje..." rows={1}
            style={{flex:1,background:"#F9FAFB",border:"1.5px solid #E5E7EB",borderRadius:12,color:"#111",fontSize:14,fontFamily:"Georgia,serif",padding:"10px 14px",resize:"none",outline:"none",lineHeight:1.5}}/>
          <button onClick={enviar} disabled={!texto.trim()} style={{background:texto.trim()?"#E8622A":"#F3F4F6",border:"none",borderRadius:12,width:42,height:42,color:texto.trim()?"#fff":"#9CA3AF",cursor:texto.trim()?"pointer":"default",fontSize:18,flexShrink:0,transition:"all 0.15s"}}>↑</button>
        </div>
      </div>
    </div>
  );
}

// ── TARJETA TAREA ──────────────────────────────────────────────────────────
function TarjetaTarea({task,currentUser,onCambiarEstado,onEditar,onAbrirChat,commentCount}){
  const proy=getProject(task.project_id);
  const asig=task.assignee_id?getUser(task.assignee_id):null;
  const crea=getUser(task.created_by);
  const pC=PRIORIDAD[task.priority]||PRIORIDAD.media;
  const eC=ESTADO[task.status]||ESTADO.pendiente;
  const admin=esAdmin(currentUser.role);
  const puedeCambiar=admin||task.assignee_id===currentUser.id;
  const followup=task.priority==="urgente"?"Seguimiento c/3h":task.priority==="alta"?"Seguimiento c/6h":"Seguimiento diario";

  return(
    <div style={{background:"#fff",border:"1.5px solid #F3F4F6",borderRadius:16,padding:16,marginBottom:10,boxShadow:"0 1px 4px rgba(0,0,0,0.04)",borderLeft:`3px solid ${proy?.color||"#E8622A"}`,opacity:task.status==="listo"?0.6:1,transition:"opacity 0.2s"}}>
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8,marginBottom:8}}>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          <span style={{background:pC.bg,color:pC.color,fontSize:11,fontWeight:600,padding:"3px 10px",borderRadius:20,fontFamily:"'DM Mono',monospace"}}>{pC.label}</span>
          <span style={{background:"#F3F4F6",color:"#6B7280",fontSize:11,padding:"3px 10px",borderRadius:20,fontFamily:"'DM Mono',monospace"}}>{task.type}</span>
          <span style={{color:eC.color,fontSize:11,fontFamily:"'DM Mono',monospace"}}>{eC.icon} {eC.label}</span>
        </div>
        <FechaBadge due={task.due_date}/>
      </div>
      <div style={{color:"#111",fontSize:15,fontWeight:600,marginBottom:6,fontFamily:"'DM Mono',monospace",lineHeight:1.4}}>{task.title}</div>
      {task.notes&&<div style={{color:"#6B7280",fontSize:13,marginBottom:10,lineHeight:1.5,fontFamily:"Georgia,serif"}}>{task.notes}</div>}
      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:12}}>
        <span style={{background:`${proy?.color}15`,color:proy?.color,fontSize:11,padding:"3px 10px",borderRadius:20,fontFamily:"'DM Mono',monospace",fontWeight:600}}>{proy?.name}</span>
        {asig?<div style={{display:"flex",alignItems:"center",gap:5}}><Avatar initials={asig.avatar} size={18} color={proy?.color}/><span style={{color:"#374151",fontSize:12,fontFamily:"'DM Mono',monospace"}}>{asig.name}</span></div>
          :<span style={{color:"#DC2626",fontSize:11,fontFamily:"'DM Mono',monospace"}}>⚠ Sin asignar</span>}
        {admin&&<span style={{color:"#D1D5DB",fontSize:10,fontFamily:"'DM Mono',monospace"}}>{followup}</span>}
        {crea&&<span style={{color:"#D1D5DB",fontSize:10,fontFamily:"'DM Mono',monospace"}}>por {crea.name}</span>}
      </div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",paddingTop:10,borderTop:"1px solid #F9FAFB"}}>
        {puedeCambiar&&(
          <select value={task.status} onChange={e=>onCambiarEstado(task.id,e.target.value)} style={{background:"#F9FAFB",border:"1.5px solid #E5E7EB",borderRadius:8,color:"#374151",padding:"6px 10px",fontSize:12,fontFamily:"'DM Mono',monospace",cursor:"pointer",outline:"none"}}>
            {Object.entries(ESTADO).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}
          </select>
        )}
        <button onClick={()=>onAbrirChat(task)} style={{background:"#F9FAFB",border:"1.5px solid #E5E7EB",borderRadius:8,padding:"6px 12px",color:"#374151",fontSize:12,fontFamily:"'DM Mono',monospace",cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
          💬 {commentCount>0?<span style={{background:"#E8622A",color:"#fff",fontSize:10,fontWeight:700,padding:"0 6px",borderRadius:10}}>{commentCount}</span>:"Chat"}
        </button>
        {admin&&<button onClick={()=>onEditar(task)} style={{background:"#F9FAFB",border:"1.5px solid #E5E7EB",borderRadius:8,padding:"6px 12px",color:"#6B7280",fontSize:12,fontFamily:"'DM Mono',monospace",cursor:"pointer"}}>✏️</button>}
        {admin&&<WhatsApp task={task}/>}
      </div>
    </div>
  );
}

// ── MODAL TAREA ────────────────────────────────────────────────────────────
function ModalTarea({onCerrar,onGuardar,editTask,currentUser}){
  const admin=esAdmin(currentUser.role);
  const [form,setForm]=useState(editTask?{title:editTask.title,project_id:editTask.project_id,assignee_id:editTask.assignee_id,type:editTask.type,due_date:editTask.due_date,priority:editTask.priority,status:editTask.status,notes:editTask.notes||""}:{title:"",project_id:10,assignee_id:currentUser.id,type:"Llamada",due_date:"",priority:"media",status:"pendiente",notes:""});
  const inp=(f,v)=>setForm(p=>({...p,[f]:v}));
  const lS={color:"#6B7280",fontSize:11,fontFamily:"'DM Mono',monospace",letterSpacing:0.5,marginBottom:5,display:"block",fontWeight:500};
  const iS={width:"100%",background:"#F9FAFB",border:"1.5px solid #E5E7EB",borderRadius:10,color:"#111",padding:"10px 12px",fontSize:14,fontFamily:"Georgia,serif",boxSizing:"border-box",outline:"none",transition:"border-color 0.15s"};

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.25)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:150,padding:20}} onClick={onCerrar}>
      <div style={{background:"#fff",borderRadius:20,padding:24,maxWidth:500,width:"100%",boxShadow:"0 20px 60px rgba(0,0,0,0.12)",maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div style={{fontFamily:"'DM Mono',monospace",fontSize:14,fontWeight:700,color:"#111"}}>{editTask?"EDITAR TAREA":"NUEVA TAREA"}</div>
          <button onClick={onCerrar} style={{background:"#F3F4F6",border:"none",borderRadius:8,width:30,height:30,color:"#6B7280",cursor:"pointer",fontSize:16}}>×</button>
        </div>
        <div style={{display:"grid",gap:14}}>
          <div><label style={lS}>TÍTULO *</label><input value={form.title} onChange={e=>inp("title",e.target.value)} placeholder="¿Qué hay que hacer?" style={iS} onFocus={e=>e.target.style.borderColor="#E8622A"} onBlur={e=>e.target.style.borderColor="#E5E7EB"}/></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div><label style={lS}>PROYECTO</label><select value={form.project_id} onChange={e=>inp("project_id",Number(e.target.value))} style={iS}>{PROJECTS.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
            <div><label style={lS}>TIPO</label><select value={form.type} onChange={e=>inp("type",e.target.value)} style={iS}>{TIPOS.map(t=><option key={t}>{t}</option>)}</select></div>
            <div><label style={lS}>ASIGNAR A</label><select value={form.assignee_id||""} onChange={e=>inp("assignee_id",e.target.value?Number(e.target.value):null)} style={iS}><option value="">Sin asignar</option>{USERS_DEFAULT.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
            <div><label style={lS}>PRIORIDAD</label><select value={form.priority} onChange={e=>inp("priority",e.target.value)} style={iS} disabled={!admin}>{Object.entries(PRIORIDAD).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></div>
          </div>
          <div><label style={lS}>FECHA LÍMITE *</label><input type="date" value={form.due_date} onChange={e=>inp("due_date",e.target.value)} style={iS} onFocus={e=>e.target.style.borderColor="#E8622A"} onBlur={e=>e.target.style.borderColor="#E5E7EB"}/></div>
          <div><label style={lS}>NOTAS</label><textarea value={form.notes} onChange={e=>inp("notes",e.target.value)} placeholder="Proveedor, contacto, contexto..." style={{...iS,minHeight:70,resize:"vertical"}} onFocus={e=>e.target.style.borderColor="#E8622A"} onBlur={e=>e.target.style.borderColor="#E5E7EB"}/></div>
        </div>
        {(!form.title||!form.due_date)?<div style={{color:"#9CA3AF",fontSize:11,fontFamily:"'DM Mono',monospace",marginTop:14,textAlign:"center"}}>Completa título y fecha</div>
          :<button onClick={()=>{onGuardar(form,editTask?.id);onCerrar();}} style={{width:"100%",marginTop:20,background:"#E8622A",border:"none",borderRadius:12,padding:14,color:"#fff",fontFamily:"'DM Mono',monospace",fontSize:14,fontWeight:700,cursor:"pointer",boxShadow:"0 4px 12px rgba(232,98,42,0.3)"}}>
            {editTask?"GUARDAR CAMBIOS":"AGREGAR TAREA"}
          </button>}
      </div>
    </div>
  );
}

// ── APP PRINCIPAL ──────────────────────────────────────────────────────────
export default function App(){
  const [usuario,setUsuario]=useState(null);
  const [tareas,setTareas]=useState([]);
  const [commentCounts,setCommentCounts]=useState({});
  const [cargando,setCargando]=useState(false);
  const [vista,setVista]=useState("tareas");
  const [filtro,setFiltro]=useState("todas");
  const [filtroP,setFiltroP]=useState("all");
  const [showModal,setShowModal]=useState(false);
  const [editTask,setEditTask]=useState(null);
  const [chatTarea,setChatTarea]=useState(null);

  useEffect(()=>{
    if(!usuario)return;
    fetchTareas();
    const tCh=supabase.channel(`tasks-${usuario.id}-${Date.now()}`)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"tasks"},p=>setTareas(prev=>[p.new,...prev]))
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"tasks"},p=>setTareas(prev=>prev.map(t=>t.id===p.new.id?p.new:t)))
      .on("postgres_changes",{event:"DELETE",schema:"public",table:"tasks"},p=>setTareas(prev=>prev.filter(t=>t.id!==p.old.id)))
      .subscribe();
    const cCh=supabase.channel(`counts-${usuario.id}-${Date.now()}`)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"comments"},p=>setCommentCounts(prev=>({...prev,[p.new.task_id]:(prev[p.new.task_id]||0)+1})))
      .subscribe();
    return()=>{supabase.removeChannel(tCh);supabase.removeChannel(cCh);};
  },[usuario]);

  async function fetchTareas(){
    setCargando(true);
    const{data}=await supabase.from("tasks").select("*").order("created_at",{ascending:false});
    setTareas(data||[]);
    if(data?.length){
      const counts={};
      await Promise.all(data.map(async t=>{const{count}=await supabase.from("comments").select("*",{count:"exact",head:true}).eq("task_id",t.id);counts[t.id]=count||0;}));
      setCommentCounts(counts);
    }
    setCargando(false);
  }

  async function cambiarEstado(id,estado){await supabase.from("tasks").update({status:estado}).eq("id",id);}

  async function guardarTarea(form,id){
    if(id)await supabase.from("tasks").update(form).eq("id",id);
    else await supabase.from("tasks").insert({...form,created_by:usuario.id});
    setEditTask(null);
  }

  function logout(){localStorage.removeItem("foreman_session");setUsuario(null);}

  if(!usuario)return <LoginScreen onLogin={setUsuario}/>;

  const admin=esAdmin(usuario.role);
  let visibles=admin?tareas:tareas.filter(t=>t.assignee_id===usuario.id||t.created_by===usuario.id);
  if(filtro==="pendiente")visibles=visibles.filter(t=>t.status==="pendiente");
  if(filtro==="urgente")visibles=visibles.filter(t=>t.status!=="listo"&&(t.priority==="urgente"||daysUntil(t.due_date)<=1));
  if(filtro==="listo")visibles=visibles.filter(t=>t.status==="listo");
  if(filtroP!=="all")visibles=visibles.filter(t=>t.project_id===Number(filtroP));

  const pendientes=tareas.filter(t=>t.status!=="listo");
  const vencidas=pendientes.filter(t=>daysUntil(t.due_date)<0);
  const urgentes=pendientes.filter(t=>t.priority==="urgente"||daysUntil(t.due_date)<=1);
  const totalMsg=Object.values(commentCounts).reduce((s,v)=>s+v,0);

  const tabS=a=>({padding:"8px 16px",borderRadius:20,border:"none",cursor:"pointer",fontFamily:"'DM Mono',monospace",fontSize:12,fontWeight:600,background:a?"#E8622A":"transparent",color:a?"#fff":"#6B7280",transition:"all 0.15s"});
  const filtS=a=>({padding:"6px 14px",borderRadius:20,border:a?"none":"1.5px solid #E5E7EB",cursor:"pointer",fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:600,background:a?"#111":"#fff",color:a?"#fff":"#6B7280",flexShrink:0,transition:"all 0.15s"});

  return(
    <div style={{minHeight:"100vh",background:"#F9FAFB",color:"#111",fontFamily:"Georgia,serif"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500;600&family=Fraunces:ital,wght@0,300;0,600;1,300&display=swap');*{box-sizing:border-box}select option{background:#fff}input,select,textarea{outline:none}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#E5E7EB;border-radius:2px}@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>

      {/* HEADER */}
      <div style={{background:"#fff",borderBottom:"1px solid #F3F4F6",padding:"0 16px",position:"sticky",top:0,zIndex:100,boxShadow:"0 1px 8px rgba(0,0,0,0.04)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",height:56,maxWidth:680,margin:"0 auto"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{background:"#E8622A",borderRadius:10,padding:"4px 10px"}}><span style={{color:"#fff",fontSize:11,fontFamily:"'DM Mono',monospace",fontWeight:700,letterSpacing:1}}>FOREMAN</span></div>
            <span style={{fontFamily:"'Fraunces',serif",fontSize:14,fontWeight:300,color:"#9CA3AF"}}>by <em>NOVA</em></span>
            <span style={{background:"#FEE2E2",color:"#DC2626",fontSize:9,fontFamily:"'DM Mono',monospace",fontWeight:700,padding:"1px 6px",borderRadius:20}}>BETA</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {vencidas.length>0&&admin&&<div style={{background:"#FEE2E2",borderRadius:20,padding:"3px 10px",color:"#DC2626",fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:600}}>⚠ {vencidas.length}</div>}
            <Avatar initials={usuario.avatar} size={30} color={usuario.role==="owner"?"#E8622A":usuario.role==="assistant"?"#7C3AED":"#2563EB"}/>
            <button onClick={logout} style={{background:"none",border:"none",color:"#9CA3AF",cursor:"pointer",fontSize:11,fontFamily:"'DM Mono',monospace"}}>salir</button>
            <button onClick={()=>{setEditTask(null);setShowModal(true);}} style={{background:"#E8622A",border:"none",borderRadius:10,width:32,height:32,color:"#fff",fontSize:20,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 4px 12px rgba(232,98,42,0.3)",fontWeight:300}}>+</button>
          </div>
        </div>

        <div style={{maxWidth:680,margin:"0 auto"}}>
          {admin&&(
            <div style={{display:"flex",gap:6,paddingBottom:10,overflowX:"auto"}}>
              {[{l:"Activas",v:pendientes.length,c:"#374151"},{l:"Urgentes",v:urgentes.length,c:"#DC2626"},{l:"Vencidas",v:vencidas.length,c:"#D97706"},{l:"Mensajes",v:totalMsg,c:"#2563EB"}].map(s=>(
                <div key={s.l} style={{background:"#F9FAFB",borderRadius:10,padding:"6px 12px",border:"1px solid #F3F4F6",flexShrink:0,display:"flex",alignItems:"center",gap:6}}>
                  <span style={{color:s.c,fontSize:16,fontWeight:700,fontFamily:"'DM Mono',monospace"}}>{s.v}</span>
                  <span style={{color:"#9CA3AF",fontSize:10,fontFamily:"'DM Mono',monospace"}}>{s.l}</span>
                </div>
              ))}
            </div>
          )}
          {!admin&&<div style={{paddingBottom:10}}><div style={{background:"#EFF6FF",border:"1px solid #BFDBFE",borderRadius:8,padding:"6px 12px",color:"#2563EB",fontFamily:"'DM Mono',monospace",fontSize:11}}>👷 {usuario.name} — puedes crear y actualizar tus tareas</div></div>}
          <div style={{display:"flex",gap:2,paddingBottom:6}}>
            <button onClick={()=>setVista("tareas")} style={tabS(vista==="tareas")}>Tareas</button>
            {admin&&<button onClick={()=>setVista("equipo")} style={tabS(vista==="equipo")}>Equipo</button>}
            {admin&&<button onClick={()=>setVista("proyectos")} style={tabS(vista==="proyectos")}>Proyectos</button>}
          </div>
        </div>
      </div>

      {/* BODY */}
      <div style={{padding:"20px 16px",maxWidth:680,margin:"0 auto"}}>
        {admin&&vista==="tareas"&&<><NovaInput currentUser={usuario} onTaskCreated={fetchTareas}/><AIBriefing tasks={tareas} currentUser={usuario}/></>}

        {vista==="tareas"&&(
          <>
            <div style={{display:"flex",gap:6,marginBottom:16,overflowX:"auto",paddingBottom:4}}>
              {[["todas","Todas"],["urgente","Urgentes"],["pendiente","Pendientes"],["listo","Listas"]].map(([f,l])=>(
                <button key={f} onClick={()=>setFiltro(f)} style={filtS(filtro===f)}>{l}</button>
              ))}
              {admin&&<select value={filtroP} onChange={e=>setFiltroP(e.target.value)} style={{background:"#fff",border:`1.5px solid ${filtroP!=="all"?"#E8622A":"#E5E7EB"}`,borderRadius:20,color:filtroP!=="all"?"#E8622A":"#6B7280",padding:"6px 12px",fontSize:11,fontFamily:"'DM Mono',monospace",cursor:"pointer",flexShrink:0}}>
                <option value="all">Todos los proyectos</option>
                {PROJECTS.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
              </select>}
            </div>
            {cargando?<div style={{textAlign:"center",color:"#9CA3AF",padding:"40px 0",fontFamily:"'DM Mono',monospace",fontSize:13}}>Cargando...</div>
              :visibles.length===0?<div style={{textAlign:"center",color:"#9CA3AF",padding:"60px 0",fontFamily:"'DM Mono',monospace",fontSize:13}}><div style={{fontSize:40,marginBottom:12}}>🏗</div>Sin tareas. Toca + o dile a NOVA.</div>
              :visibles.sort((a,b)=>{const o={urgente:0,alta:1,media:2,baja:3};return(o[a.priority]-o[b.priority])||(daysUntil(a.due_date)-daysUntil(b.due_date));})
                  .map((t,i)=><div key={t.id} style={{animation:`fadeUp 0.3s ease ${i*0.03}s both`}}><TarjetaTarea task={t} currentUser={usuario} onCambiarEstado={cambiarEstado} onEditar={t=>{setEditTask(t);setShowModal(true);}} onAbrirChat={setChatTarea} commentCount={commentCounts[t.id]||0}/></div>)}
          </>
        )}

        {admin&&vista==="equipo"&&(
          <div>{USERS_DEFAULT.map(m=>{
            const mt=tareas.filter(t=>t.assignee_id===m.id&&t.status!=="listo");
            const mo=mt.filter(t=>daysUntil(t.due_date)<0);
            return(
              <div key={m.id} style={{background:"#fff",borderRadius:16,padding:16,marginBottom:10,border:"1.5px solid #F3F4F6",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
                <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:mt.length?12:0}}>
                  <Avatar initials={m.avatar} size={42} color={mo.length>0?"#DC2626":m.role==="owner"?"#E8622A":m.role==="assistant"?"#7C3AED":"#2563EB"}/>
                  <div style={{flex:1}}>
                    <div style={{color:"#111",fontWeight:700,fontSize:15,fontFamily:"'DM Mono',monospace"}}>{m.name}</div>
                    <div style={{color:"#9CA3AF",fontSize:11,fontFamily:"'DM Mono',monospace"}}>{m.role==="owner"?"👑 Director":m.role==="assistant"?"🤝 Asistente":"👷 Equipo"}</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{color:mo.length>0?"#DC2626":"#E8622A",fontFamily:"'DM Mono',monospace",fontSize:22,fontWeight:700}}>{mt.length}</div>
                    <div style={{color:"#9CA3AF",fontSize:9,fontFamily:"'DM Mono',monospace"}}>ABIERTAS</div>
                  </div>
                </div>
                {mt.length>0?mt.map(t=>(
                  <div key={t.id} style={{background:"#F9FAFB",borderRadius:10,padding:"8px 12px",marginBottom:6,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div><div style={{color:"#111",fontSize:13,fontFamily:"'DM Mono',monospace"}}>{t.title}</div><div style={{color:"#9CA3AF",fontSize:11,fontFamily:"'DM Mono',monospace"}}>{getProject(t.project_id)?.name}</div></div>
                    <FechaBadge due={t.due_date}/>
                  </div>
                )):<div style={{color:"#9CA3AF",fontSize:12,fontFamily:"'DM Mono',monospace",textAlign:"center",padding:"4px 0"}}>✓ Sin pendientes</div>}
              </div>
            );
          })}</div>
        )}

        {admin&&vista==="proyectos"&&(
          <div>{PROJECTS.map(p=>{
            const pt=tareas.filter(t=>t.project_id===p.id);
            const pPen=pt.filter(t=>t.status!=="listo");
            const pOk=pt.filter(t=>t.status==="listo");
            const pct=pt.length>0?Math.round((pOk.length/pt.length)*100):0;
            return(
              <div key={p.id} style={{background:"#fff",borderRadius:16,padding:16,marginBottom:10,border:"1.5px solid #F3F4F6",borderLeft:`4px solid ${p.color}`,boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div style={{color:"#111",fontWeight:700,fontSize:15,fontFamily:"'DM Mono',monospace"}}>{p.name}</div>
                  <div style={{color:p.color,fontFamily:"'DM Mono',monospace",fontSize:18,fontWeight:700}}>{pct}%</div>
                </div>
                <div style={{background:"#F3F4F6",borderRadius:4,height:6,marginBottom:10}}>
                  <div style={{background:p.color,height:6,borderRadius:4,width:`${pct}%`,transition:"width 0.5s"}}/>
                </div>
                <div style={{display:"flex",gap:16}}>
                  <span style={{color:"#6B7280",fontSize:12,fontFamily:"'DM Mono',monospace"}}><span style={{color:p.color,fontWeight:700}}>{pPen.length}</span> abiertas</span>
                  <span style={{color:"#6B7280",fontSize:12,fontFamily:"'DM Mono',monospace"}}><span style={{color:"#059669",fontWeight:700}}>{pOk.length}</span> listas</span>
                </div>
              </div>
            );
          })}</div>
        )}
      </div>

      {showModal&&<ModalTarea editTask={editTask} currentUser={usuario} onCerrar={()=>{setShowModal(false);setEditTask(null);}} onGuardar={guardarTarea}/>}
      {chatTarea&&<ChatTarea task={chatTarea} currentUser={usuario} onClose={()=>setChatTarea(null)}/>}
    </div>
  );
}
