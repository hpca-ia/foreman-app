// ============================================================
//  FOREMAN + FINANCE — HCA Studio
//  Niveles: Nivel1=owner Nivel2=assistant Nivel3=member
// ============================================================
import { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://qxoincfvscvbqvoxamdi.supabase.co";
const SUPABASE_KEY = "sb_publishable_UXB8WueKrn1zBSXfsTqJ0w_C61L3b77";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const USERS_DEFAULT = [
  { id:1, name:"Hernan",     role:"owner",     pin:"1234", color:"#E8622A", email:"hc@hcastudio.com" },
  { id:2, name:"Johanna",    role:"assistant",  pin:"2345", color:"#7C3AED", email:"jt@hcastudio.com" },
  { id:3, name:"Hector",     role:"member",     pin:"3001", color:"#2563EB", email:"" },
  { id:4, name:"Josh",       role:"member",     pin:"3002", color:"#2563EB", email:"" },
  { id:5, name:"Guillermo",  role:"member",     pin:"3003", color:"#2563EB", email:"" },
  { id:6, name:"Camila",     role:"member",     pin:"3004", color:"#2563EB", email:"" },
  { id:7, name:"Santiago",   role:"member",     pin:"3005", color:"#2563EB", email:"" },
  { id:8, name:"Gerardo",    role:"member",     pin:"3006", color:"#2563EB", email:"" },
  { id:9, name:"Luis Guala", role:"member",     pin:"3007", color:"#2563EB", email:"" },
];

const PROJECTS_DEFAULT = [
  { id:10, name:"Testing",           color:"#E8622A", tieneFinanzas:true },
  { id:1,  name:"BdP Condado",       color:"#2563EB", tieneFinanzas:true },
  { id:2,  name:"BdP Urdesa",        color:"#7C3AED", tieneFinanzas:true },
  { id:3,  name:"BdP Banca Seguros", color:"#DB2777", tieneFinanzas:true },
  { id:4,  name:"Fowler",            color:"#D97706", tieneFinanzas:true },
  { id:5,  name:"Banderas",          color:"#059669", tieneFinanzas:false },
  { id:6,  name:"Servipagos",        color:"#DC2626", tieneFinanzas:true },
  { id:7,  name:"Zuleta",            color:"#0891B2", tieneFinanzas:false },
  { id:8,  name:"La Quinta",         color:"#65A30D", tieneFinanzas:true },
  { id:9,  name:"ManEugenia",        color:"#9333EA", tieneFinanzas:true },
];

const TIPOS = ["Llamada","Reunion","Contrato","Compra","Inspeccion","Aprobacion","Visita a obra","Otro"];
const PRIORIDAD = {
  urgente:{ label:"Urgente", color:"#DC2626", bg:"#FEE2E2" },
  alta:   { label:"Alta",    color:"#D97706", bg:"#FEF3C7" },
  media:  { label:"Media",   color:"#059669", bg:"#D1FAE5" },
  baja:   { label:"Baja",    color:"#6B7280", bg:"#F3F4F6" },
};
const ESTADO = {
  pendiente:     { label:"Pendiente",   icon:"○", color:"#6B7280" },
  "en-progreso": { label:"En progreso", icon:"◑", color:"#D97706" },
  listo:         { label:"Listo",       icon:"●", color:"#059669" },
  bloqueado:     { label:"Bloqueado",   icon:"✕", color:"#DC2626" },
};
const RUBROS_DEFAULT = [
  { id:"r1",  nombre:"Obra Civil / Estructura",  presupuesto:0, categoria:"Construccion" },
  { id:"r2",  nombre:"Acabados",                  presupuesto:0, categoria:"Construccion" },
  { id:"r3",  nombre:"Instalaciones Electricas",  presupuesto:0, categoria:"Instalaciones" },
  { id:"r4",  nombre:"Instalaciones Sanitarias",  presupuesto:0, categoria:"Instalaciones" },
  { id:"r5",  nombre:"Mano de Obra",              presupuesto:0, categoria:"RRHH" },
  { id:"r6",  nombre:"Materiales",                presupuesto:0, categoria:"Materiales" },
  { id:"r7",  nombre:"Equipos y Herramientas",    presupuesto:0, categoria:"Equipos" },
  { id:"r8",  nombre:"Honorarios Profesionales",  presupuesto:0, categoria:"Servicios" },
  { id:"r9",  nombre:"Transporte y Logistica",    presupuesto:0, categoria:"Logistica" },
  { id:"r10", nombre:"Imprevistos",               presupuesto:0, categoria:"Reserva" },
];

// PERMISOS
function can(role) {
  const o = role==="owner";
  const a = role==="owner"||role==="assistant";
  return {
    verTodasTareas:a, crearTareas:a, editarEliminarTareas:o,
    enviarWA:a, verEquipo:a, verProyectos:a, usarNova:a,
    verDashboard:a, verPresupuesto:a, editarPresupuesto:o,
    verFacturas:a, registrarFacturas:a, verCotizaciones:a,
    verCajaChica:true, registrarGasto:true, verReporteCaja:a,
    gestionarEntregas:a, verAjustes:o,
  };
}
function rolBadge(role) {
  if (role==="owner")     return {label:"Nivel 1",bg:"#FFF4F0",color:"#E8622A"};
  if (role==="assistant") return {label:"Nivel 2",bg:"#EDE9FE",color:"#7C3AED"};
  return {label:"Nivel 3",bg:"#EFF6FF",color:"#2563EB"};
}

// HELPERS
function loadLS(key,fallback){try{const s=localStorage.getItem(key);return s?JSON.parse(s):fallback;}catch{return fallback;}}
function saveLS(key,val){try{localStorage.setItem(key,JSON.stringify(val));}catch{}}
function daysUntil(d){const t=new Date();t.setHours(0,0,0,0);return Math.ceil((new Date(d)-t)/86400000);}
function ini(n){return(n||"?").split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2);}
function fmt(n){return new Intl.NumberFormat("es-EC",{style:"currency",currency:"USD",minimumFractionDigits:2}).format(n||0);}
function pct(v,t){return t>0?Math.min(100,Math.round((v/t)*100)):0;}

// COMPONENTES BASE
function Avatar({name,size=32,color="#E8622A"}){
  return <div style={{width:size,height:size,borderRadius:"50%",background:color,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.32,fontWeight:700,flexShrink:0}}>{ini(name)}</div>;
}
function FechaBadge({due,status}){
  if(status==="listo")return null;
  const d=daysUntil(due);
  const s={fontSize:11,fontWeight:600,padding:"2px 8px",borderRadius:20};
  if(d<0)  return <span style={{...s,color:"#DC2626",background:"#FEE2E2"}}>Vencida {Math.abs(d)}d</span>;
  if(d===0)return <span style={{...s,color:"#D97706",background:"#FEF3C7"}}>Hoy</span>;
  if(d<=2) return <span style={{...s,color:"#D97706",background:"#FEF3C7"}}>en {d}d</span>;
  return <span style={{...s,color:"#6B7280",background:"#F3F4F6"}}>en {d}d</span>;
}
function NovaIcon({size=22}){
  return <svg width={size} height={size} viewBox="0 0 80 80" style={{flexShrink:0}}><circle cx="40" cy="40" r="38" fill="#1F2937"/><text x="40" y="55" textAnchor="middle" fontFamily="Inter,sans-serif" fontSize="40" fontWeight="700" fill="#E8622A">N</text><circle cx="58" cy="20" r="10" fill="#E8622A"/></svg>;
}
function AccesoDenegado({msg}){
  return <div style={{textAlign:"center",padding:"60px 20px",color:"#9CA3AF"}}><div style={{fontSize:40,marginBottom:12}}>🔒</div><div style={{fontSize:14,fontWeight:600,color:"#374151",marginBottom:6}}>Sin acceso</div><div style={{fontSize:12}}>{msg||"No tienes permiso para ver esta seccion."}</div></div>;
}


// LOGIN
function LoginScreen({onLogin,users}){
  const [sel,setSel]=useState(null);
  const [pin,setPin]=useState("");
  const [err,setErr]=useState("");
  const [step,setStep]=useState("pick");
  useEffect(()=>{try{const s=localStorage.getItem("foreman_session");if(s){const{userId,expires}=JSON.parse(s);if(new Date(expires)>new Date()){const u=users.find(u=>u.id===userId);if(u)onLogin(u);}}}catch{}},[]);
  function selectUser(u){setSel(u);setPin("");setErr("");setStep("pin");}
  function handlePin(d){
    if(pin.length>=4)return;
    const n=pin+d;setPin(n);
    if(n.length===4){setTimeout(()=>{if(n===sel.pin){const exp=new Date();exp.setDate(exp.getDate()+7);saveLS("foreman_session",{userId:sel.id,expires:exp.toISOString()});onLogin(sel);}else{setErr("PIN incorrecto");setPin("");}},200);}
  }
  return (
    <div style={{minHeight:"100vh",background:"#F8F9FB",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"'Inter',sans-serif"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');*{box-sizing:border-box}@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      <div style={{marginBottom:32,textAlign:"center"}}>
        <div style={{display:"inline-flex",alignItems:"center",marginBottom:8}}>
          <div style={{width:10,height:28,background:"#E8622A",borderRadius:"4px 0 0 4px"}}/><div style={{width:10,height:28,background:"#FF9500"}}/><div style={{width:10,height:28,background:"#FFD60A",borderRadius:"0 4px 4px 0",marginRight:8}}/>
          <span style={{color:"#1F2937",fontSize:22,fontWeight:700,letterSpacing:0.5}}>FOREMAN</span>
          <span style={{background:"#F3F4F6",color:"#9CA3AF",fontSize:9,fontWeight:600,padding:"1px 6px",borderRadius:4,marginLeft:5}}>BETA</span>
          <span style={{background:"#FFF4F0",color:"#E8622A",fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:4,marginLeft:4,border:"1px solid #FED7AA"}}>+ FINANCE</span>
        </div>
        <div style={{fontSize:12,color:"#9CA3AF"}}>Gestion de Obra</div>
      </div>
      {step==="pick"&&(
        <div style={{width:"100%",maxWidth:420}}>
          <div style={{fontSize:10,color:"#9CA3AF",letterSpacing:1,marginBottom:10,textAlign:"center",fontWeight:600}}>SELECCIONA TU PERFIL</div>
          {users.map(u=>{const b=rolBadge(u.role);return(
            <button key={u.id} onClick={()=>selectUser(u)} style={{width:"100%",background:"#fff",border:"1.5px solid #E5E7EB",borderRadius:12,padding:"12px 16px",marginBottom:8,display:"flex",alignItems:"center",gap:14,cursor:"pointer",transition:"all 0.15s",fontFamily:"'Inter',sans-serif"}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor="#E8622A";e.currentTarget.style.boxShadow="0 4px 12px rgba(232,98,42,0.1)";}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor="#E5E7EB";e.currentTarget.style.boxShadow="none";}}>
              <Avatar name={u.name} size={40} color={u.color}/>
              <div style={{flex:1,textAlign:"left"}}>
                <div style={{color:"#111",fontSize:15,fontWeight:600}}>{u.name}</div>
                <div style={{color:"#9CA3AF",fontSize:12,marginTop:2}}>{u.role==="owner"?"👑 Director":u.role==="assistant"?"🤝 Asistente":"👷 Equipo"}</div>
              </div>
              <span style={{background:b.bg,color:b.color,fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:20}}>{b.label}</span>
            </button>
          );})}
        </div>
      )}
      {step==="pin"&&sel&&(
        <div style={{width:"100%",maxWidth:280,textAlign:"center",fontFamily:"'Inter',sans-serif"}}>
          <button onClick={()=>{setStep("pick");setErr("");}} style={{background:"none",border:"none",color:"#9CA3AF",cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",gap:4,margin:"0 auto 20px"}}>← Volver</button>
          <Avatar name={sel.name} size={60} color={sel.color}/>
          <div style={{color:"#111",fontSize:18,fontWeight:700,marginTop:12}}>{sel.name}</div>
          <div style={{color:"#9CA3AF",fontSize:13,marginBottom:28,marginTop:4}}>Ingresa tu PIN</div>
          <div style={{display:"flex",justifyContent:"center",gap:16,marginBottom:28}}>
            {[0,1,2,3].map(i=><div key={i} style={{width:12,height:12,borderRadius:"50%",background:pin.length>i?"#E8622A":"#E5E7EB",transition:"background 0.15s"}}/>)}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,maxWidth:220,margin:"0 auto"}}>
            {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((d,i)=>(
              <button key={i} onClick={()=>{if(d==="⌫")setPin(p=>p.slice(0,-1));else if(d!=="")handlePin(d);}}
                style={{background:d===""?"transparent":"#fff",border:d===""?"none":"1.5px solid #E5E7EB",borderRadius:12,height:54,color:"#111",fontSize:18,fontWeight:500,cursor:d===""?"default":"pointer",fontFamily:"'Inter',sans-serif",transition:"all 0.1s"}}
                onMouseEnter={e=>{if(d!==""){e.currentTarget.style.background="#FFF7F0";e.currentTarget.style.borderColor="#E8622A";}}}
                onMouseLeave={e=>{if(d!==""){e.currentTarget.style.background="#fff";e.currentTarget.style.borderColor="#E5E7EB";}}}>{d}</button>
            ))}
          </div>
          {err&&<div style={{color:"#DC2626",fontSize:12,marginTop:14}}>{err}</div>}
        </div>
      )}
    </div>
  );
}

// NOVA INPUT
function NovaInput({currentUser,projects,users,onTaskCreated}){
  const [texto,setTexto]=useState("");
  const [loading,setLoading]=useState(false);
  const [result,setResult]=useState(null);
  async function procesar(){
    if(!texto.trim())return;
    setLoading(true);setResult(null);
    const proyList=projects.map(p=>p.id+"="+p.name).join(",");
    const userList=users.map(u=>u.id+"="+u.name).join(",");
    try{
            const novaSystem="Eres NOVA. Extrae tarea y responde SOLO JSON. Campos: title(str), project_id(num), assignee_id(num o null), type(str), due_date(YYYY-MM-DD), priority(urgente/alta/media/baja), notes(str). Proyectos: "+proyList+". Usuarios: "+userList+". Tipos: Llamada,Reunion,Contrato,Compra,Inspeccion,Aprobacion,Visita a obra,Otro. Hoy: "+new Date().toISOString().split("T")[0]+".";
      const res=await fetch("/api/nova",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:500,system:novaSystem,messages:[{role:"user",content:texto}]})});
      const data=await res.json();
      setResult(JSON.parse((data.content?.[0]?.text||"{}").replace(/```json|```/g,"").trim()));
    }catch{setResult({error:"No pude entender."});}
    setLoading(false);
  }
  async function confirmar(){
    if(!result||result.error)return;
    await supabase.from("tasks").insert({...result,created_by:currentUser.id});
    setTexto("");setResult(null);onTaskCreated();
  }
  const gP=id=>projects.find(p=>p.id===id);
  const gU=id=>users.find(u=>u.id===id);
  return(
    <div style={{background:"#fff",border:"1.5px solid #FED7AA",borderRadius:12,padding:14,marginBottom:14}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}><NovaIcon size={22}/><span style={{fontSize:13,fontWeight:600,color:"#E8622A"}}>NOVA — Crear tarea</span></div>
      <div style={{display:"flex",gap:8,marginBottom:8}}>
        <input value={texto} onChange={e=>setTexto(e.target.value)} onKeyDown={e=>e.key==="Enter"&&procesar()} placeholder='"Inspeccion BdP Condado con Hector, urgente manana"' style={{flex:1,background:"#FFF7F0",border:"1.5px solid #FED7AA",borderRadius:8,color:"#111",fontSize:13,padding:"8px 12px",outline:"none",fontFamily:"inherit"}}/>
        <button onClick={procesar} disabled={!texto.trim()||loading} style={{background:texto.trim()&&!loading?"#E8622A":"#F3F4F6",border:"none",borderRadius:8,padding:"8px 14px",color:texto.trim()&&!loading?"#fff":"#9CA3AF",fontSize:12,fontWeight:600,cursor:texto.trim()&&!loading?"pointer":"default",whiteSpace:"nowrap"}}>{loading?"...":"Crear →"}</button>
      </div>
      {result&&!result.error&&(
        <div style={{background:"#F0FDF4",border:"1.5px solid #BBF7D0",borderRadius:8,padding:10}}>
          <div style={{fontSize:11,color:"#059669",fontWeight:600,marginBottom:4}}>NOVA entendio:</div>
          <div style={{fontSize:13,fontWeight:600,color:"#111",marginBottom:2}}>{result.title}</div>
          <div style={{fontSize:11,color:"#6B7280"}}>{gP(result.project_id)?.name} - {result.assignee_id?gU(result.assignee_id)?.name:"Sin asignar"} - {result.due_date} - {result.priority}</div>
          <div style={{display:"flex",gap:8,marginTop:8}}>
            <button onClick={()=>setResult(null)} style={{flex:1,background:"#fff",border:"1.5px solid #E5E7EB",borderRadius:6,padding:6,color:"#6B7280",fontSize:12,cursor:"pointer"}}>Cancelar</button>
            <button onClick={confirmar} style={{flex:2,background:"#059669",border:"none",borderRadius:6,padding:6,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}>Confirmar</button>
          </div>
        </div>
      )}
      {result?.error&&<div style={{color:"#DC2626",fontSize:12,marginTop:6}}>{result.error}</div>}
    </div>
  );
}

// WHATSAPP
function WhatsApp({task,users,projects}){
  const [msg,setMsg]=useState("");const [loading,setLoading]=useState(false);const [open,setOpen]=useState(false);
  const m=users.find(u=>u.id===task.assignee_id);const p=projects.find(p=>p.id===task.project_id);const d=daysUntil(task.due_date);
  async function generar(){
    setLoading(true);setOpen(true);
    const vence=task.status==="listo"?"esta completada":d<0?Math.abs(d)+" dias de retraso":d===0?"vence HOY":"vence en "+d+" dias";
    try{const waMsg=task.title.replace(/"/g,"");const res=await fetch("/api/nova",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:200,system:"Recordatorio WhatsApp construccion. Espanol. Max 3 oraciones. Directo. Solo el mensaje.",messages:[{role:"user",content:"Para "+(m?.name||"equipo")+": "+waMsg+" en "+p?.name+". "+vence+". Prioridad: "+task.priority+"."}]})});const data=await res.json();setMsg(data.content?.[0]?.text||"");}catch{setMsg("Error.");}
    setLoading(false);
  }
  return(
    <>
      <button onClick={generar} style={{background:"#22C55E",border:"none",borderRadius:6,padding:"5px 10px",color:"#fff",fontSize:11,fontWeight:600,cursor:"pointer"}}>📲 WA</button>
      {open&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.3)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,padding:20}} onClick={()=>setOpen(false)}>
          <div style={{background:"#fff",borderRadius:16,padding:20,maxWidth:400,width:"100%",fontFamily:"'Inter',sans-serif"}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
              <span style={{fontSize:22}}>📲</span><div><div style={{fontSize:14,fontWeight:700}}>WhatsApp</div>{m&&<div style={{color:"#6B7280",fontSize:12}}>{m.name}</div>}</div>
              <button onClick={()=>setOpen(false)} style={{marginLeft:"auto",background:"none",border:"none",color:"#9CA3AF",cursor:"pointer",fontSize:20}}>x</button>
            </div>
            {loading?<div style={{color:"#9CA3AF",fontSize:12,padding:"16px 0",textAlign:"center"}}>Redactando...</div>:(
              <>
                <textarea value={msg} onChange={e=>setMsg(e.target.value)} style={{width:"100%",minHeight:90,background:"#F9FAFB",border:"1.5px solid #E5E7EB",borderRadius:10,color:"#111",fontSize:13,padding:10,resize:"vertical",boxSizing:"border-box",outline:"none",fontFamily:"inherit"}}/>
                <div style={{display:"flex",gap:8,marginTop:10}}>
                  <button onClick={generar} style={{flex:1,background:"#F9FAFB",border:"1.5px solid #E5E7EB",borderRadius:8,padding:8,color:"#6B7280",fontSize:12,cursor:"pointer"}}>↺</button>
                  <button onClick={()=>window.open("https://wa.me/?text="+encodeURIComponent(msg),"_blank")} style={{flex:2,background:"#22C55E",border:"none",borderRadius:8,padding:8,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}}>Abrir WA</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// TARJETA TAREA
function TarjetaTarea({task,currentUser,users,projects,onCambiarEstado,onEditar,onEliminar}){
  const perms=can(currentUser.role);
  const proy=projects.find(p=>p.id===task.project_id);
  const asig=users.find(u=>u.id===task.assignee_id);
  const crea=users.find(u=>u.id===task.created_by);
  const pC=PRIORIDAD[task.priority]||PRIORIDAD.media;
  const eC=ESTADO[task.status]||ESTADO.pendiente;
  const puedeCambiar=perms.verTodasTareas||task.assignee_id===currentUser.id;
  return(
    <div style={{background:"#fff",border:"1px solid #F0F1F3",borderRadius:10,padding:"10px 12px",marginBottom:6,borderLeft:"3px solid "+(proy?.color||"#E8622A"),opacity:task.status==="listo"?0.6:1,boxShadow:"0 1px 2px rgba(0,0,0,0.03)"}}>
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8,marginBottom:5}}>
        <div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center"}}>
          <span style={{background:pC.bg,color:pC.color,fontSize:11,fontWeight:600,padding:"2px 8px",borderRadius:20}}>{pC.label}</span>
          <span style={{background:"#F3F4F6",color:"#6B7280",fontSize:11,padding:"2px 8px",borderRadius:20}}>{task.type}</span>
          <span style={{color:eC.color,fontSize:11}}>{eC.icon} {eC.label}</span>
        </div>
        <FechaBadge due={task.due_date} status={task.status}/>
      </div>
      <div style={{fontSize:13,fontWeight:600,color:"#111",marginBottom:task.notes?4:6}}>{task.title}</div>
      {task.notes&&<div style={{color:"#6B7280",fontSize:12,marginBottom:8,lineHeight:1.5}}>{task.notes}</div>}
      <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap",marginBottom:6}}>
        <span style={{background:(proy?.color||"#E8622A")+"18",color:proy?.color||"#E8622A",fontSize:11,padding:"2px 8px",borderRadius:20,fontWeight:600}}>{proy?.name}</span>
        {asig?<><Avatar name={asig.name} size={16} color={asig.color}/><span style={{color:"#374151",fontSize:12}}>{asig.name}</span></>:<span style={{color:"#DC2626",fontSize:11}}>Sin asignar</span>}
        {crea&&<span style={{color:"#D1D5DB",fontSize:10}}>por {crea.name}</span>}
      </div>
      <div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center",paddingTop:6,borderTop:"1px solid #F3F4F6"}}>
        {puedeCambiar&&Object.entries(ESTADO).map(([k,v])=>(
          <button key={k} onClick={()=>onCambiarEstado(task.id,k)} style={{background:task.status===k?v.color:"#F3F4F6",border:"1px solid "+(task.status===k?v.color:"#E5E7EB"),borderRadius:6,padding:"4px 8px",color:task.status===k?"#fff":"#6B7280",fontSize:10,fontWeight:task.status===k?600:400,cursor:"pointer",whiteSpace:"nowrap"}}>{v.icon} {v.label}</button>
        ))}
        {perms.enviarWA&&<WhatsApp task={task} users={users} projects={projects}/>}
        {perms.editarEliminarTareas&&<button onClick={()=>onEditar(task)} style={{background:"#F9FAFB",border:"1px solid #E5E7EB",borderRadius:6,padding:"5px 10px",color:"#6B7280",fontSize:11,cursor:"pointer"}}>✏️</button>}
        {perms.editarEliminarTareas&&<button onClick={()=>onEliminar(task.id)} style={{background:"#FEE2E2",border:"1px solid #FECACA",borderRadius:6,padding:"5px 10px",color:"#DC2626",fontSize:11,cursor:"pointer"}}>🗑</button>}
      </div>
    </div>
  );
}

// MODAL TAREA
function ModalTarea({onCerrar,onGuardar,editTask,currentUser,users,projects}){
  const [form,setForm]=useState(editTask?{title:editTask.title,project_id:editTask.project_id,assignee_id:editTask.assignee_id,type:editTask.type,due_date:editTask.due_date,priority:editTask.priority,status:editTask.status,notes:editTask.notes||""}:{title:"",project_id:projects[0]?.id||1,assignee_id:currentUser.id,type:"Llamada",due_date:"",priority:"media",status:"pendiente",notes:""});
  const inp=(f,v)=>setForm(p=>({...p,[f]:v}));
  const iS={width:"100%",background:"#F9FAFB",border:"1px solid #E5E7EB",borderRadius:8,color:"#111",padding:"9px 12px",fontSize:13,fontFamily:"inherit",boxSizing:"border-box",outline:"none"};
  const lS={color:"#6B7280",fontSize:11,fontWeight:500,marginBottom:4,display:"block"};
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.25)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:150,padding:20}} onClick={onCerrar}>
      <div style={{background:"#fff",borderRadius:16,padding:22,maxWidth:480,width:"100%",maxHeight:"90vh",overflowY:"auto",fontFamily:"'Inter',sans-serif"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
          <div style={{fontSize:15,fontWeight:700}}>{editTask?"Editar tarea":"Nueva tarea"}</div>
          <button onClick={onCerrar} style={{background:"#F3F4F6",border:"none",borderRadius:6,width:28,height:28,color:"#6B7280",cursor:"pointer",fontSize:15}}>x</button>
        </div>
        <div style={{display:"grid",gap:12}}>
          <div><label style={lS}>Titulo *</label><input value={form.title} onChange={e=>inp("title",e.target.value)} placeholder="Que hay que hacer?" style={iS}/></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div><label style={lS}>Proyecto</label><select value={form.project_id} onChange={e=>inp("project_id",Number(e.target.value))} style={iS}>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
            <div><label style={lS}>Tipo</label><select value={form.type} onChange={e=>inp("type",e.target.value)} style={iS}>{TIPOS.map(t=><option key={t}>{t}</option>)}</select></div>
            <div><label style={lS}>Asignar a</label><select value={form.assignee_id||""} onChange={e=>inp("assignee_id",e.target.value?Number(e.target.value):null)} style={iS}><option value="">Sin asignar</option>{users.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
            <div><label style={lS}>Prioridad</label><select value={form.priority} onChange={e=>inp("priority",e.target.value)} style={iS}>{Object.entries(PRIORIDAD).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></div>
          </div>
          <div><label style={lS}>Fecha limite *</label><input type="date" value={form.due_date} onChange={e=>inp("due_date",e.target.value)} style={iS}/></div>
          <div><label style={lS}>Notas</label><textarea value={form.notes} onChange={e=>inp("notes",e.target.value)} placeholder="Proveedor, contacto, contexto..." style={{...iS,minHeight:60,resize:"vertical"}}/></div>
        </div>
        {!form.title||!form.due_date?<div style={{color:"#9CA3AF",fontSize:11,marginTop:12,textAlign:"center"}}>Completa titulo y fecha</div>
          :<button onClick={()=>{onGuardar(form,editTask?.id);onCerrar();}} style={{width:"100%",marginTop:16,background:"#E8622A",border:"none",borderRadius:10,padding:12,color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer"}}>{editTask?"Guardar cambios":"Agregar tarea"}</button>}
      </div>
    </div>
  );
}


// ============================================================
//  MODULOS FINANCIEROS
// ============================================================

// NOVA RUBROS EDITOR — con subgrupos movibles entre rubros
function NovaRubrosEditor({novaR,onConfirmar,onCancelar}){
  // Estado: rubros con sus subgrupos. Los montos se calculan solos de los subgrupos.
  const [rubros,setRubros]=useState(()=>{
    return (novaR.rubros||[]).map((r,i)=>({
      _id:Date.now()+i,
      nombre:r.nombre||r.nm||"Rubro",
      categoria:r.categoria||r.ct||"General",
      subgrupos:(r.subgrupos||[]).map((sg,j)=>({_sid:Date.now()+i*1000+j,nombre:sg.nombre||sg.n||"",monto:Number(sg.monto||sg.v||0)}))
    }));
  });
  const [moviendo,setMoviendo]=useState(null); // {rubroId, sgId}
  const [expandido,setExpandido]=useState(null); // rubro _id expandido
  const [nuevoRubro,setNuevoRubro]=useState(false);
  const [nuevoNombre,setNuevoNombre]=useState("");

  const calcTotal=r=>Math.round(r.subgrupos.reduce((s,sg)=>s+sg.monto,0)*100)/100;
  const totalGlobal=Math.round(rubros.reduce((s,r)=>s+calcTotal(r),0)*100)/100;
  const totalOriginal=novaR.total||0;
  const diff=Math.round((totalGlobal-totalOriginal)*100)/100;

  function moverSubgrupo(fromRubroId,sgId,toRubroId){
    if(fromRubroId===toRubroId){setMoviendo(null);return;}
    setRubros(prev=>{
      const sg=prev.find(r=>r._id===fromRubroId)?.subgrupos.find(s=>s._sid===sgId);
      if(!sg)return prev;
      return prev.map(r=>{
        if(r._id===fromRubroId)return{...r,subgrupos:r.subgrupos.filter(s=>s._sid!==sgId)};
        if(r._id===toRubroId)return{...r,subgrupos:[...r.subgrupos,sg]};
        return r;
      });
    });
    setMoviendo(null);
  }

  function eliminarRubro(id){
    if(!window.confirm("Eliminar este rubro? Sus subgrupos se perderan."))return;
    setRubros(prev=>prev.filter(r=>r._id!==id));
  }

  function renombrarRubro(id,val){setRubros(prev=>prev.map(r=>r._id===id?{...r,nombre:val}:r));}
  function renombrarCategoria(id,val){setRubros(prev=>prev.map(r=>r._id===id?{...r,categoria:val}:r));}

  function agregarRubro(){
    if(!nuevoNombre.trim())return;
    setRubros(prev=>[...prev,{_id:Date.now(),nombre:nuevoNombre.trim(),categoria:"General",subgrupos:[]}]);
    setNuevoNombre("");setNuevoRubro(false);
  }

  function moverRubroArriba(idx){if(idx===0)return;setRubros(prev=>{const a=[...prev];[a[idx-1],a[idx]]=[a[idx],a[idx-1]];return a;});}
  function moverRubroAbajo(idx){setRubros(prev=>{if(idx>=prev.length-1)return prev;const a=[...prev];[a[idx],a[idx+1]]=[a[idx+1],a[idx]];return a;});}

  const iS={background:"#0F172A",border:"1px solid #374151",borderRadius:5,color:"#F9FAFB",padding:"4px 7px",fontSize:11,fontFamily:"'Inter',sans-serif",outline:"none",boxSizing:"border-box"};

  return(
    <div style={{marginTop:12,background:"#111827",borderRadius:10,padding:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
        <div style={{fontSize:12,fontWeight:600,color:"#E8622A"}}>NOVA — {rubros.length} rubros | {novaR.secciones_detectadas||"?"} secciones</div>
        <div style={{fontSize:12,color:"#9CA3AF"}}>Total: <strong style={{color:Math.abs(diff)<1?"#34D399":"#FBBF24"}}>{fmt(totalGlobal)}</strong></div>
      </div>

      {novaR.observaciones&&<div style={{fontSize:10,color:"#6B7280",marginBottom:8,borderLeft:"2px solid #374151",paddingLeft:8}}>{novaR.observaciones}</div>}

      {Math.abs(diff)>1&&(
        <div style={{background:"#1C1917",borderRadius:6,padding:"5px 10px",marginBottom:8,fontSize:10,color:"#FBBF24"}}>
          Diferencia con total PDF ({fmt(totalOriginal)}): {diff>0?"+":""}{fmt(diff)} {diff<0?"(faltan secciones)":"(secciones de mas)"}
        </div>
      )}

      <div style={{fontSize:10,color:"#6B7280",marginBottom:8}}>
        Haz clic en un subgrupo para moverlo a otro rubro. Los montos se recalculan solos.
      </div>

      {moviendo&&(
        <div style={{background:"#1E3A2F",border:"1px solid #059669",borderRadius:8,padding:"8px 10px",marginBottom:8}}>
          <div style={{fontSize:11,color:"#34D399",fontWeight:600,marginBottom:3}}>
            Moviendo: <strong>{rubros.flatMap(r=>r.subgrupos).find(s=>s._sid===moviendo.sgId)?.nombre}</strong>
          </div>
          <div style={{fontSize:10,color:"#9CA3AF",marginBottom:6}}>Haz clic en el rubro destino para moverlo</div>
          <button onClick={()=>setMoviendo(null)} style={{background:"#374151",border:"none",borderRadius:5,padding:"3px 10px",color:"#9CA3AF",fontSize:10,cursor:"pointer"}}>Cancelar</button>
        </div>
      )}

      <div style={{maxHeight:420,overflowY:"auto",marginBottom:10}}>
        {rubros.map((r,idx)=>{
          const total=calcTotal(r);
          const esDestino=moviendo&&moviendo.rubroId!==r._id;
          const esFuente=moviendo&&moviendo.rubroId===r._id;
          return(
            <div key={r._id}
              style={{background:esDestino?"#1E2A3A":esFuente?"#1E3A2F":"#0F172A",border:"1px solid "+(esDestino?"#2563EB":esFuente?"#059669":"#374151"),borderRadius:8,marginBottom:6,overflow:"hidden",cursor:esDestino?"pointer":"default"}}
              onClick={esDestino?()=>moverSubgrupo(moviendo.rubroId,moviendo.sgId,r._id):undefined}>
              {/* Header del rubro */}
              <div style={{display:"flex",alignItems:"center",gap:6,padding:"7px 10px",borderBottom:"1px solid #1F2937"}}>
                <div style={{display:"flex",flexDirection:"column",gap:1}}>
                  <button onClick={e=>{e.stopPropagation();moverRubroArriba(idx);}} disabled={idx===0} style={{background:"none",border:"none",color:idx===0?"#374151":"#6B7280",cursor:idx===0?"default":"pointer",fontSize:9,padding:0,lineHeight:1}}>▲</button>
                  <button onClick={e=>{e.stopPropagation();moverRubroAbajo(idx);}} disabled={idx===rubros.length-1} style={{background:"none",border:"none",color:idx===rubros.length-1?"#374151":"#6B7280",cursor:idx===rubros.length-1?"default":"pointer",fontSize:9,padding:0,lineHeight:1}}>▼</button>
                </div>
                <div style={{flex:1,display:"grid",gridTemplateColumns:"1fr auto",gap:6,alignItems:"center"}}>
                  <div>
                    <input value={r.nombre} onChange={e=>{e.stopPropagation();renombrarRubro(r._id,e.target.value);}} onClick={e=>e.stopPropagation()} style={{...iS,width:"100%",fontSize:12,fontWeight:600}} placeholder="Nombre rubro"/>
                    <input value={r.categoria} onChange={e=>{e.stopPropagation();renombrarCategoria(r._id,e.target.value);}} onClick={e=>e.stopPropagation()} style={{...iS,width:"100%",marginTop:3,color:"#9CA3AF"}} placeholder="Categoria"/>
                  </div>
                  <div style={{textAlign:"right",minWidth:80}}>
                    <div style={{fontSize:13,fontWeight:700,color:"#E8622A"}}>{fmt(total)}</div>
                    <div style={{fontSize:9,color:"#6B7280"}}>{r.subgrupos.length} secciones</div>
                  </div>
                </div>
                <div style={{display:"flex",gap:4}}>
                  {esDestino&&<span style={{fontSize:10,color:"#60A5FA",fontWeight:700}}>→ Mover aqui</span>}
                  {!esDestino&&<button onClick={e=>{e.stopPropagation();setExpandido(expandido===r._id?null:r._id);}} style={{background:"#1F2937",border:"none",borderRadius:4,padding:"3px 7px",color:"#9CA3AF",fontSize:10,cursor:"pointer"}}>{expandido===r._id?"▲":"▼"}</button>}
                  {!esDestino&&<button onClick={e=>{e.stopPropagation();eliminarRubro(r._id);}} style={{background:"#7F1D1D",border:"none",borderRadius:4,padding:"3px 6px",color:"#FCA5A5",fontSize:10,cursor:"pointer"}}>🗑</button>}
                </div>
              </div>
              {/* Subgrupos — visible si expandido o si hay pocos */}
              {(expandido===r._id||r.subgrupos.length<=3)&&!esDestino&&(
                <div style={{padding:"6px 10px"}}>
                  {r.subgrupos.length===0&&<div style={{fontSize:10,color:"#6B7280",fontStyle:"italic"}}>Sin secciones asignadas</div>}
                  {r.subgrupos.map(sg=>(
                    <div key={sg._sid}
                      onClick={e=>{e.stopPropagation();if(moviendo)return;setMoviendo({rubroId:r._id,sgId:sg._sid});}}
                      style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"3px 6px",marginBottom:3,borderRadius:5,background:moviendo?.sgId===sg._sid?"#1E3A2F":"#1F2937",border:"1px solid "+(moviendo?.sgId===sg._sid?"#059669":"#374151"),cursor:"pointer",transition:"all 0.1s"}}>
                      <span style={{fontSize:11,color:"#D1D5DB"}}>{sg.nombre}</span>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontSize:11,color:"#E8622A",fontWeight:600}}>{fmt(sg.monto)}</span>
                        {!moviendo&&<span style={{fontSize:9,color:"#6B7280"}}>clic para mover</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {expandido!==r._id&&r.subgrupos.length>3&&!esDestino&&(
                <div style={{padding:"4px 10px",fontSize:10,color:"#6B7280"}}>
                  {r.subgrupos.slice(0,3).map(sg=>sg.nombre).join(", ")}... y {r.subgrupos.length-3} mas
                </div>
              )}
            </div>
          );
        })}
      </div>

      {nuevoRubro?(
        <div style={{display:"flex",gap:6,marginBottom:10}}>
          <input value={nuevoNombre} onChange={e=>setNuevoNombre(e.target.value)} style={{...iS,flex:1,fontSize:12}} placeholder="Nombre del nuevo rubro" autoFocus onKeyDown={e=>e.key==="Enter"&&agregarRubro()}/>
          <button onClick={agregarRubro} style={{background:"#E8622A",border:"none",borderRadius:6,padding:"5px 12px",color:"#fff",fontSize:11,fontWeight:600,cursor:"pointer"}}>Crear</button>
          <button onClick={()=>{setNuevoRubro(false);setNuevoNombre("");}} style={{background:"#374151",border:"none",borderRadius:6,padding:"5px 10px",color:"#9CA3AF",fontSize:11,cursor:"pointer"}}>Cancelar</button>
        </div>
      ):(
        <button onClick={()=>setNuevoRubro(true)} style={{width:"100%",background:"transparent",border:"1px dashed #374151",borderRadius:6,padding:"5px",color:"#9CA3AF",fontSize:11,cursor:"pointer",marginBottom:10}}>+ Nuevo rubro</button>
      )}

      <div style={{display:"flex",gap:8}}>
        <button onClick={onCancelar} style={{flex:1,background:"#374151",border:"none",borderRadius:6,padding:8,color:"#9CA3AF",fontSize:12,cursor:"pointer"}}>Cancelar</button>
        <button onClick={()=>onConfirmar(rubros.map(r=>({...r,presupuesto:calcTotal(r)})))} style={{flex:2,background:"#059669",border:"none",borderRadius:8,padding:8,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}>
          Confirmar {rubros.length} rubros → {fmt(totalGlobal)}
        </button>
      </div>
    </div>
  );
}

// PRESUPUESTO CON PDF NOVA
function ModuloPresupuesto({proyectoId,proyectos,perms}){
  const KEY="fin_rubros_"+proyectoId;
  const [rubros,setRubros]=useState(()=>loadLS(KEY,RUBROS_DEFAULT.map(r=>({...r}))));
  const facturas=loadLS("fin_facturas_"+proyectoId,[]);
  const [editando,setEditando]=useState(null);
  const [nuevo,setNuevo]=useState(false);
  const [nForm,setNForm]=useState({nombre:"",categoria:"",presupuesto:""});
  const [subiendo,setSubiendo]=useState(false);
  const [novaR,setNovaR]=useState(null);
  const [novaErr,setNovaErr]=useState("");
  const fileRef=useRef(null);
  function saveR(r){setRubros(r);saveLS(KEY,r);}
  const ejec=id=>facturas.filter(f=>f.rubroId===id).reduce((s,f)=>s+Number(f.monto||0),0);
  const totalP=rubros.reduce((s,r)=>s+Number(r.presupuesto||0),0);
  const totalE=rubros.reduce((s,r)=>s+ejec(r.id),0);
  const proy=proyectos.find(p=>p.id===proyectoId);
  const iS={width:"100%",background:"#F9FAFB",border:"1px solid #E5E7EB",borderRadius:8,color:"#111",padding:"8px 10px",fontSize:13,fontFamily:"inherit",boxSizing:"border-box",outline:"none"};

  async function procesarPDF(e){
    const file=e.target.files[0];if(!file)return;
    setSubiendo(true);setNovaR(null);setNovaErr("");
    try{
      const base64=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(",")[1]);r.onerror=rej;r.readAsDataURL(file);});
      // El servidor procesa el PDF completo en 2 pasos internamente
      const resp=await fetch("/api/nova",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({_modo:"presupuesto_pdf",pdfBase64:base64})});
      const data=await resp.json();
      if(data.error){setNovaErr("Error: "+data.error);return;}
      if(!data.rubros?.length){setNovaErr("No se encontraron rubros. Intenta de nuevo.");return;}
      setNovaR({rubros:data.rubros,secciones:data.secciones||[],total:data.total,total_con_iva:data.total_con_iva||0,secciones_detectadas:data.secciones_detectadas||0,observaciones:data.observaciones+(data.total_con_iva>0?" | Con IVA: "+fmt(data.total_con_iva):"")});
    }catch(err){setNovaErr("Error: "+err.message);}
    setSubiendo(false);e.target.value="";
  }

  function confirmarNova(rubrosEditados){
    const lista=rubrosEditados||novaR?.rubros||[];
    saveR(lista.filter(r=>(r.presupuesto||0)>0||r.subgrupos?.length>0).map((r,i)=>({
      id:"r"+Date.now()+i,
      nombre:r.nombre,
      categoria:r.categoria||"General",
      presupuesto:r.presupuesto!=null?Number(r.presupuesto):Math.round((r.subgrupos||[]).reduce((s,sg)=>s+Number(sg.monto||0),0)*100)/100
    })));
    setNovaR(null);
  }

  return(
    <div>
      <div style={{background:"#fff",borderRadius:12,padding:"14px 16px",marginBottom:14,border:"1px solid #F0F1F3",borderLeft:"4px solid "+(proy?.color||"#E8622A")}}>
        <div style={{fontSize:16,fontWeight:700,color:"#111",marginBottom:12}}>{proy?.name}</div>
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          {[{l:"Presupuesto",v:fmt(totalP),c:"#374151"},{l:"Ejecutado",v:fmt(totalE),c:totalE>totalP?"#DC2626":"#D97706"},{l:"Disponible",v:fmt(totalP-totalE),c:(totalP-totalE)<0?"#DC2626":"#059669"},{l:"Avance",v:pct(totalE,totalP)+"%",c:proy?.color||"#E8622A"}].map(s=>(
            <div key={s.l} style={{background:"#F9FAFB",borderRadius:8,padding:"8px 14px",textAlign:"center",flex:1,minWidth:70}}>
              <div style={{fontSize:16,fontWeight:700,color:s.c}}>{s.v}</div>
              <div style={{fontSize:10,color:"#9CA3AF",fontWeight:600}}>{s.l}</div>
            </div>
          ))}
        </div>
        {totalP>0&&<div style={{marginTop:10,background:"#F3F4F6",borderRadius:4,height:6}}><div style={{background:totalE>totalP?"#DC2626":proy?.color||"#E8622A",height:6,borderRadius:4,width:Math.min(100,pct(totalE,totalP))+"%",transition:"width 0.5s"}}/></div>}
      </div>

      {perms.editarPresupuesto&&(
        <div style={{background:"#1F2937",borderRadius:12,padding:14,marginBottom:14}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}><NovaIcon size={20}/><span style={{fontSize:13,fontWeight:600,color:"#E8622A"}}>NOVA — Importar presupuesto PDF</span></div>
          <div style={{fontSize:12,color:"#9CA3AF",marginBottom:10}}>Sube el PDF del presupuesto y NOVA extrae los rubros con sus montos automaticamente.</div>
          <input ref={fileRef} type="file" accept="application/pdf" onChange={procesarPDF} style={{display:"none"}}/>
          <button onClick={()=>fileRef.current?.click()} disabled={subiendo} style={{width:"100%",background:subiendo?"#374151":"#E8622A",border:"none",borderRadius:8,padding:10,color:"#fff",fontSize:13,fontWeight:600,cursor:subiendo?"default":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            {subiendo?<><span style={{animation:"spin 1s linear infinite",display:"inline-block"}}>⏳</span>Analizando... paso 1 de 2</>:"📄 Subir presupuesto PDF"}
          </button>
          {novaErr&&<div style={{color:"#F87171",fontSize:12,marginTop:8}}>{novaErr}</div>}
          {novaR&&(
            <NovaRubrosEditor
              novaR={novaR}
              onConfirmar={rubrosEditados=>{confirmarNova(rubrosEditados);}}
              onCancelar={()=>setNovaR(null)}
            />
          )}
        </div>
      )}

      {rubros.map(r=>{
        const e=ejec(r.id);const s=Number(r.presupuesto||0)-e;const rojo=Number(r.presupuesto)>0&&e>Number(r.presupuesto);
        return(
          <div key={r.id} style={{background:"#fff",borderRadius:10,padding:"10px 12px",marginBottom:8,border:"1px solid "+(rojo?"#FECACA":"#F0F1F3"),borderLeft:"3px solid "+(rojo?"#DC2626":"#059669")}}>
            {editando?.id===r.id&&perms.editarPresupuesto?(
              <div style={{display:"grid",gap:8}}>
                <input value={editando.nombre} onChange={e2=>setEditando(p=>({...p,nombre:e2.target.value}))} style={iS} placeholder="Nombre"/>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  <input value={editando.categoria} onChange={e2=>setEditando(p=>({...p,categoria:e2.target.value}))} style={iS} placeholder="Categoria"/>
                  <input type="number" value={editando.presupuesto} onChange={e2=>setEditando(p=>({...p,presupuesto:e2.target.value}))} style={iS} placeholder="USD"/>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>{saveR(rubros.map(x=>x.id===editando.id?{...editando,presupuesto:Number(editando.presupuesto)}:x));setEditando(null);}} style={{flex:2,background:"#059669",border:"none",borderRadius:6,padding:8,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}>Guardar</button>
                  <button onClick={()=>setEditando(null)} style={{flex:1,background:"#F3F4F6",border:"none",borderRadius:6,padding:8,color:"#6B7280",fontSize:12,cursor:"pointer"}}>Cancelar</button>
                </div>
              </div>
            ):(
              <>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                  <div><div style={{fontSize:13,fontWeight:600,color:"#111"}}>{r.nombre}</div><div style={{fontSize:10,color:"#9CA3AF"}}>{r.categoria}</div></div>
                  {perms.editarPresupuesto&&<button onClick={()=>setEditando({...r})} style={{background:"none",border:"none",color:"#9CA3AF",cursor:"pointer",fontSize:12}}>✏️</button>}
                </div>
                <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:6}}>
                  {[{l:"Presupuesto",v:fmt(r.presupuesto),c:"#374151"},{l:"Ejecutado",v:fmt(e),c:rojo?"#DC2626":"#D97706"},{l:"Disponible",v:fmt(s),c:s<0?"#DC2626":"#059669"}].map(x=>(
                    <div key={x.l}><div style={{fontSize:10,color:"#9CA3AF"}}>{x.l}</div><div style={{fontSize:13,fontWeight:600,color:x.c}}>{x.v}</div></div>
                  ))}
                </div>
                {Number(r.presupuesto)>0&&<div style={{background:"#F3F4F6",borderRadius:4,height:4}}><div style={{background:rojo?"#DC2626":"#059669",height:4,borderRadius:4,width:Math.min(100,pct(e,Number(r.presupuesto)))+"%"}}/></div>}
                {rojo&&<div style={{fontSize:10,color:"#DC2626",marginTop:4,fontWeight:600}}>Excedido en {fmt(Math.abs(s))}</div>}
              </>
            )}
          </div>
        );
      })}
      {perms.editarPresupuesto&&(nuevo?(
        <div style={{background:"#F9FAFB",borderRadius:10,padding:12,marginBottom:8,border:"1.5px solid #E8622A"}}>
          <div style={{display:"grid",gap:8}}>
            <input value={nForm.nombre} onChange={e=>setNForm(p=>({...p,nombre:e.target.value}))} style={iS} placeholder="Nombre del rubro"/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <input value={nForm.categoria} onChange={e=>setNForm(p=>({...p,categoria:e.target.value}))} style={iS} placeholder="Categoria"/>
              <input type="number" value={nForm.presupuesto} onChange={e=>setNForm(p=>({...p,presupuesto:e.target.value}))} style={iS} placeholder="USD"/>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>{if(nForm.nombre){saveR([...rubros,{...nForm,id:"r"+Date.now(),presupuesto:Number(nForm.presupuesto)}]);setNuevo(false);setNForm({nombre:"",categoria:"",presupuesto:""});}}} disabled={!nForm.nombre} style={{flex:2,background:nForm.nombre?"#E8622A":"#F3F4F6",border:"none",borderRadius:6,padding:8,color:nForm.nombre?"#fff":"#9CA3AF",fontSize:12,fontWeight:600,cursor:nForm.nombre?"pointer":"default"}}>Guardar</button>
              <button onClick={()=>setNuevo(false)} style={{flex:1,background:"#F3F4F6",border:"none",borderRadius:6,padding:8,color:"#6B7280",fontSize:12,cursor:"pointer"}}>Cancelar</button>
            </div>
          </div>
        </div>
      ):(
        <button onClick={()=>setNuevo(true)} style={{width:"100%",background:"#F9FAFB",border:"1.5px dashed #E5E7EB",borderRadius:10,padding:10,color:"#6B7280",fontSize:13,cursor:"pointer"}}>+ Agregar rubro</button>
      ))}
      {!perms.editarPresupuesto&&<div style={{background:"#F9FAFB",borderRadius:8,padding:"8px 12px",border:"1px dashed #E5E7EB",textAlign:"center"}}><div style={{fontSize:11,color:"#9CA3AF"}}>Solo el Director puede agregar o editar rubros</div></div>}
    </div>
  );
}

// FACTURAS
function ModuloFacturas({proyectoId,perms}){
  const rubros=loadLS("fin_rubros_"+proyectoId,RUBROS_DEFAULT);
  const [facturas,setFacturas]=useState(()=>loadLS("fin_facturas_"+proyectoId,[]));
  const [form,setForm]=useState({proveedor:"",numero:"",monto:"",fecha:new Date().toISOString().split("T")[0],rubroId:"",descripcion:""});
  const [clas,setClas]=useState(false);const [sug,setSug]=useState(null);
  const iS={width:"100%",background:"#F9FAFB",border:"1px solid #E5E7EB",borderRadius:8,color:"#111",padding:"8px 10px",fontSize:13,fontFamily:"inherit",boxSizing:"border-box",outline:"none"};
  function save(u){setFacturas(u);saveLS("fin_facturas_"+proyectoId,u);}
  async function clasificar(){
    if(!form.descripcion)return;setClas(true);setSug(null);
    try{const res=await fetch("/api/nova",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:200,system:"Clasifica en rubro de construccion. Solo JSON con campos rubroId y razon. Rubros disponibles: "+rubros.map(r=>r.id+"="+r.nombre).join(", "),messages:[{role:"user",content:form.descripcion}]})});const data=await res.json();setSug(JSON.parse((data.content?.[0]?.text||"{}").replace(/```json|```/g,"").trim()));}catch{}
    setClas(false);
  }
  function agregar(){
    if(!form.proveedor||!form.monto||!form.rubroId)return;
    save([{...form,id:Date.now(),monto:Number(form.monto),creadaEn:new Date().toISOString()},...facturas]);
    setForm({proveedor:"",numero:"",monto:"",fecha:new Date().toISOString().split("T")[0],rubroId:"",descripcion:""});setSug(null);
  }
  return(
    <div>
      {perms.registrarFacturas&&(
        <div style={{background:"#fff",border:"1.5px solid #E5E7EB",borderRadius:12,padding:14,marginBottom:14}}>
          <div style={{fontSize:13,fontWeight:600,marginBottom:10}}>🧾 Registrar factura</div>
          <div style={{display:"grid",gap:8}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <div><label style={{fontSize:11,color:"#6B7280",fontWeight:500,display:"block",marginBottom:3}}>Proveedor *</label><input value={form.proveedor} onChange={e=>setForm(p=>({...p,proveedor:e.target.value}))} style={iS} placeholder="Proveedor"/></div>
              <div><label style={{fontSize:11,color:"#6B7280",fontWeight:500,display:"block",marginBottom:3}}>Monto USD *</label><input type="number" value={form.monto} onChange={e=>setForm(p=>({...p,monto:e.target.value}))} style={iS} placeholder="0.00"/></div>
            </div>
            <div>
              <label style={{fontSize:11,color:"#6B7280",fontWeight:500,display:"block",marginBottom:3}}>Descripcion</label>
              <div style={{display:"flex",gap:8}}>
                <input value={form.descripcion} onChange={e=>setForm(p=>({...p,descripcion:e.target.value}))} style={{...iS,flex:1}} placeholder="Que incluye?"/>
                <button onClick={clasificar} disabled={clas} style={{background:"#1F2937",border:"none",borderRadius:6,padding:"8px 12px",color:"#E8622A",fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}><NovaIcon size={14}/>{clas?"...":"Clasificar"}</button>
              </div>
              {sug&&!sug.error&&(
                <div style={{background:"#F0FDF4",border:"1px solid #BBF7D0",borderRadius:8,padding:"8px 10px",marginTop:6}}>
                  <div style={{fontSize:11,color:"#059669",fontWeight:600}}>NOVA: {rubros.find(r=>r.id===sug.rubroId)?.nombre}</div>
                  <div style={{fontSize:10,color:"#6B7280",marginTop:2}}>{sug.razon}</div>
                  <button onClick={()=>setForm(p=>({...p,rubroId:sug.rubroId}))} style={{marginTop:6,background:"#059669",border:"none",borderRadius:6,padding:"4px 10px",color:"#fff",fontSize:11,fontWeight:600,cursor:"pointer"}}>Usar</button>
                </div>
              )}
            </div>
            <div><label style={{fontSize:11,color:"#6B7280",fontWeight:500,display:"block",marginBottom:3}}>Rubro *</label>
              <select value={form.rubroId} onChange={e=>setForm(p=>({...p,rubroId:e.target.value}))} style={iS}><option value="">Seleccionar rubro...</option>{rubros.map(r=><option key={r.id} value={r.id}>{r.nombre}</option>)}</select>
            </div>
            <button onClick={agregar} disabled={!form.proveedor||!form.monto||!form.rubroId} style={{background:form.proveedor&&form.monto&&form.rubroId?"#E8622A":"#F3F4F6",border:"none",borderRadius:8,padding:10,color:form.proveedor&&form.monto&&form.rubroId?"#fff":"#9CA3AF",fontSize:13,fontWeight:600,cursor:"pointer"}}>Registrar factura</button>
          </div>
        </div>
      )}
      {facturas.length===0?<div style={{textAlign:"center",color:"#9CA3AF",padding:"40px 0"}}><div style={{fontSize:32,marginBottom:8}}>🧾</div>Sin facturas</div>
        :facturas.map(f=>{const rubro=rubros.find(r=>r.id===f.rubroId);return(
          <div key={f.id} style={{background:"#fff",borderRadius:10,padding:"10px 12px",marginBottom:6,border:"1px solid #F0F1F3",display:"flex",justifyContent:"space-between",gap:10}}>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:600}}>{f.proveedor}</div>
              <div style={{fontSize:11,color:"#6B7280",marginTop:2}}>{f.fecha}{f.descripcion?" - "+f.descripcion:""}</div>
              {rubro&&<span style={{background:"#F0FDF4",color:"#059669",fontSize:10,fontWeight:600,padding:"2px 6px",borderRadius:10,marginTop:4,display:"inline-block"}}>{rubro.nombre}</span>}
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:15,fontWeight:700}}>{fmt(f.monto)}</div>
              {perms.editarEliminarTareas&&<button onClick={()=>save(facturas.filter(x=>x.id!==f.id))} style={{background:"none",border:"none",color:"#DC2626",cursor:"pointer",fontSize:11,marginTop:4}}>🗑</button>}
            </div>
          </div>
        );})}
    </div>
  );
}

// COTIZACIONES
function ModuloCotizaciones({proyectoId}){
  const rubros=loadLS("fin_rubros_"+proyectoId,RUBROS_DEFAULT);
  const [cotiz,setCotiz]=useState(()=>loadLS("fin_cotiz_"+proyectoId,[]));
  const [form,setForm]=useState({proveedor:"",descripcion:"",monto:"",rubroId:"",fecha:new Date().toISOString().split("T")[0]});
  const [anal,setAnal]=useState(null);
  const iS={width:"100%",background:"#F9FAFB",border:"1px solid #E5E7EB",borderRadius:8,color:"#111",padding:"8px 10px",fontSize:13,fontFamily:"inherit",boxSizing:"border-box",outline:"none"};
  function save(u){setCotiz(u);saveLS("fin_cotiz_"+proyectoId,u);}
  async function analizar(c){
    setAnal(c.id);
    const rubro=rubros.find(r=>r.id===c.rubroId);
    const facts=loadLS("fin_facturas_"+proyectoId,[]);
    const e=facts.filter(f=>f.rubroId===c.rubroId).reduce((s,f)=>s+Number(f.monto),0);
    const disp=Number(rubro?.presupuesto||0)-e;
    try{const res=await fetch("/api/nova",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:200,system:"Analiza cotizacion vs presupuesto disponible. Solo JSON con campos: tiene_ganancia (bool), margen_usd (numero), margen_pct (numero), alerta (texto corto), recomendacion (texto corto).",messages:[{role:"user",content:"Rubro: "+rubro?.nombre+". Disponible: "+disp+". Cotizacion: "+c.monto+" de "+c.proveedor+"."}]})});const data=await res.json();const a=JSON.parse((data.content?.[0]?.text||"{}").replace(/```json|```/g,"").trim());save(cotiz.map(x=>x.id===c.id?{...x,analisis:a}:x));}catch{}
    setAnal(null);
  }
  function agregar(){
    if(!form.proveedor||!form.monto)return;
    save([{...form,id:Date.now(),monto:Number(form.monto),creadaEn:new Date().toISOString()},...cotiz]);
    setForm({proveedor:"",descripcion:"",monto:"",rubroId:"",fecha:new Date().toISOString().split("T")[0]});
  }
  return(
    <div>
      <div style={{background:"#fff",border:"1.5px solid #E5E7EB",borderRadius:12,padding:14,marginBottom:14}}>
        <div style={{fontSize:13,fontWeight:600,marginBottom:10}}>📄 Nueva cotizacion</div>
        <div style={{display:"grid",gap:8}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <div><label style={{fontSize:11,color:"#6B7280",fontWeight:500,display:"block",marginBottom:3}}>Proveedor *</label><input value={form.proveedor} onChange={e=>setForm(p=>({...p,proveedor:e.target.value}))} style={iS} placeholder="Nombre"/></div>
            <div><label style={{fontSize:11,color:"#6B7280",fontWeight:500,display:"block",marginBottom:3}}>Monto USD *</label><input type="number" value={form.monto} onChange={e=>setForm(p=>({...p,monto:e.target.value}))} style={iS} placeholder="0.00"/></div>
          </div>
          <input value={form.descripcion} onChange={e=>setForm(p=>({...p,descripcion:e.target.value}))} style={iS} placeholder="Descripcion"/>
          <select value={form.rubroId} onChange={e=>setForm(p=>({...p,rubroId:e.target.value}))} style={iS}><option value="">Rubro (opcional)...</option>{rubros.map(r=><option key={r.id} value={r.id}>{r.nombre}</option>)}</select>
          <button onClick={agregar} disabled={!form.proveedor||!form.monto} style={{background:form.proveedor&&form.monto?"#E8622A":"#F3F4F6",border:"none",borderRadius:8,padding:10,color:form.proveedor&&form.monto?"#fff":"#9CA3AF",fontSize:13,fontWeight:600,cursor:"pointer"}}>Registrar cotizacion</button>
        </div>
      </div>
      {cotiz.length===0?<div style={{textAlign:"center",color:"#9CA3AF",padding:"40px 0"}}><div style={{fontSize:32,marginBottom:8}}>📄</div>Sin cotizaciones</div>
        :cotiz.map(c=>{const rubro=rubros.find(r=>r.id===c.rubroId);return(
          <div key={c.id} style={{background:"#fff",borderRadius:10,padding:"12px 14px",marginBottom:8,border:"1px solid #F0F1F3"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
              <div>
                <div style={{fontSize:13,fontWeight:600}}>{c.proveedor}</div>
                <div style={{fontSize:11,color:"#6B7280",marginTop:1}}>{c.fecha}{c.descripcion?" - "+c.descripcion:""}</div>
                {rubro&&<span style={{background:"#EFF6FF",color:"#2563EB",fontSize:10,fontWeight:600,padding:"2px 6px",borderRadius:10,marginTop:4,display:"inline-block"}}>{rubro.nombre}</span>}
              </div>
              <div style={{fontSize:16,fontWeight:700}}>{fmt(c.monto)}</div>
            </div>
            {c.analisis?(
              <div style={{background:c.analisis.tiene_ganancia?"#F0FDF4":"#FEF2F2",borderRadius:8,padding:"8px 10px",border:"1px solid "+(c.analisis.tiene_ganancia?"#BBF7D0":"#FECACA")}}>
                <div style={{fontSize:12,fontWeight:700,color:c.analisis.tiene_ganancia?"#059669":"#DC2626",marginBottom:3}}>{c.analisis.tiene_ganancia?"Dentro del presupuesto":"Excede presupuesto"} - Margen: {fmt(c.analisis.margen_usd)} ({c.analisis.margen_pct}%)</div>
                <div style={{fontSize:11,color:"#374151"}}>{c.analisis.recomendacion}</div>
              </div>
            ):(
              <button onClick={()=>analizar(c)} disabled={anal===c.id} style={{background:"#1F2937",border:"none",borderRadius:6,padding:"6px 12px",color:"#E8622A",fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}><NovaIcon size={14}/>{anal===c.id?"Analizando...":"Hay ganancia?"}</button>
            )}
          </div>
        );})}
    </div>
  );
}


// CAJA CHICA — con entregas, multi-rubro, foto de factura
function ModuloCajaChica({proyectoId,currentUser,perms}){
  const rubros=loadLS("fin_rubros_"+proyectoId,RUBROS_DEFAULT);
  const [gastos,setGastos]=useState(()=>loadLS("fin_caja_gastos_"+proyectoId,[]));
  const [entregas,setEntregas]=useState(()=>loadLS("fin_caja_entregas_"+proyectoId,[]));
  const [tabCC,setTabCC]=useState("gastos");
  const [modal,setModal]=useState(false);
  const [gen,setGen]=useState(false);
  const [rep,setRep]=useState(null);
  const fotoRef=useRef(null);
  const iS={width:"100%",background:"#F9FAFB",border:"1px solid #E5E7EB",borderRadius:8,color:"#111",padding:"8px 10px",fontSize:13,fontFamily:"inherit",boxSizing:"border-box",outline:"none"};

  // Form gasto con multi-rubro
  const emptyGasto={descripcion:"",montoTotal:"",responsable:"",fecha:new Date().toISOString().split("T")[0],tieneFactura:false,fotoUrl:"",partidas:[{rubroId:"",monto:""}]};
  const [gForm,setGForm]=useState(emptyGasto);
  // Form entrega
  const [eForm,setEForm]=useState({responsable:"",monto:"",fecha:new Date().toISOString().split("T")[0],nota:""});

  function saveG(g){setGastos(g);saveLS("fin_caja_gastos_"+proyectoId,g);}
  function saveE(e){setEntregas(e);saveLS("fin_caja_entregas_"+proyectoId,e);}

  // Totales por responsable
  function resumenPorResponsable(){
    const personas={};
    entregas.forEach(e=>{if(!personas[e.responsable])personas[e.responsable]={recibido:0,gastado:0};personas[e.responsable].recibido+=Number(e.monto||0);});
    gastos.forEach(g=>{if(!personas[g.responsable])personas[g.responsable]={recibido:0,gastado:0};personas[g.responsable].gastado+=Number(g.montoTotal||0);});
    return personas;
  }

  const totalEntregado=entregas.reduce((s,e)=>s+Number(e.monto||0),0);
  const totalGastado=gastos.reduce((s,g)=>s+Number(g.montoTotal||0),0);
  const saldoGlobal=totalEntregado-totalGastado;

  // Sumar partidas del form
  const sumaPartidas=gForm.partidas.reduce((s,p)=>s+Number(p.monto||0),0);
  const montoTotal=Number(gForm.montoTotal||0);
  const diferencia=montoTotal-sumaPartidas;

  function addPartida(){setGForm(p=>({...p,partidas:[...p.partidas,{rubroId:"",monto:""}]}));}
  function updatePartida(i,field,val){setGForm(p=>{const pts=[...p.partidas];pts[i]={...pts[i],[field]:val};return{...p,partidas:pts};});}
  function removePartida(i){setGForm(p=>({...p,partidas:p.partidas.filter((_,idx)=>idx!==i)}));}

  async function subirFoto(e){
    const file=e.target.files[0];if(!file)return;
    const ext=file.name.split(".").pop();
    const path="caja/"+proyectoId+"/"+Date.now()+"."+ext;
    const{error}=await supabase.storage.from("task-files").upload(path,file,{upsert:true});
    if(!error){const{data}=supabase.storage.from("task-files").getPublicUrl(path);setGForm(p=>({...p,fotoUrl:data.publicUrl}));}
    e.target.value="";
  }

  function agregarGasto(){
    if(!gForm.descripcion||!gForm.montoTotal)return;
    const resp=perms.verReporteCaja?(gForm.responsable||currentUser.name):currentUser.name;
    saveG([{...gForm,responsable:resp,id:Date.now(),montoTotal:Number(gForm.montoTotal),partidas:gForm.partidas.filter(p=>p.monto),creadoEn:new Date().toISOString()},...gastos]);
    setGForm(emptyGasto);
  }

  function agregarEntrega(){
    if(!eForm.responsable||!eForm.monto)return;
    saveE([{...eForm,id:Date.now(),monto:Number(eForm.monto),creadaEn:new Date().toISOString()},...entregas]);
    setEForm({responsable:"",monto:"",fecha:new Date().toISOString().split("T")[0],nota:""});
  }

  async function generarReporte(){
    setGen(true);setModal(true);
    const resumen=resumenPorResponsable();
    const sysPrompt="Reporte caja chica construccion. Solo JSON sin markdown: {resumen:str,por_persona:[{nombre:str,recibio:num,gasto:num,devuelve:num}],sin_factura:num,observaciones:[str],estado:ok|revisar|urgente}";
    try{
      const res=await fetch("/api/nova",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:500,system:sysPrompt,messages:[{role:"user",content:"Total entregado: "+totalEntregado+". Total gastado: "+totalGastado+". Saldo: "+saldoGlobal+". Por persona: "+JSON.stringify(resumen)+". Gastos sin factura: "+gastos.filter(g=>!g.tieneFactura).length+"."}]})});
      const data=await res.json();
      setRep(JSON.parse((data.content?.[0]?.text||"{}").replace(/```json|```/g,"").trim()));
    }catch{setRep({error:"Error."});}
    setGen(false);
  }

  const gastosVisibles=perms.verReporteCaja?gastos:gastos.filter(g=>g.responsable===currentUser.name);
  const tabS=a=>({padding:"6px 14px",borderRadius:6,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:600,background:a?"#E8622A":"transparent",color:a?"#fff":"#6B7280"});

  return(
    <div>
      {perms.verReporteCaja&&(
        <div style={{background:"#fff",borderRadius:12,padding:"12px 14px",marginBottom:12,border:"1px solid #F0F1F3"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:13,fontWeight:600}}>Caja Chica</div>
            <button onClick={generarReporte} style={{background:"#1F2937",border:"none",borderRadius:6,padding:"6px 12px",color:"#E8622A",fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}><NovaIcon size={14}/>Reporte</button>
          </div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            {[{l:"Total entregado",v:fmt(totalEntregado),c:"#374151"},{l:"Total gastado",v:fmt(totalGastado),c:"#D97706"},{l:"Saldo global",v:fmt(saldoGlobal),c:saldoGlobal<0?"#DC2626":"#059669"}].map(s=>(
              <div key={s.l} style={{background:"#F9FAFB",borderRadius:8,padding:"8px 14px",textAlign:"center",flex:1,minWidth:80}}>
                <div style={{fontSize:15,fontWeight:700,color:s.c}}>{s.v}</div>
                <div style={{fontSize:10,color:"#9CA3AF",fontWeight:600}}>{s.l}</div>
              </div>
            ))}
          </div>
          {Object.keys(resumenPorResponsable()).length>0&&(
            <div style={{marginTop:10}}>
              {Object.entries(resumenPorResponsable()).map(([nombre,d])=>(
                <div key={nombre} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderTop:"1px solid #F3F4F6"}}>
                  <span style={{fontSize:12,color:"#374151",fontWeight:500}}>{nombre}</span>
                  <div style={{display:"flex",gap:12}}>
                    <span style={{fontSize:11,color:"#6B7280"}}>Recibio: <strong>{fmt(d.recibido)}</strong></span>
                    <span style={{fontSize:11,color:"#6B7280"}}>Gasto: <strong style={{color:"#D97706"}}>{fmt(d.gastado)}</strong></span>
                    <span style={{fontSize:11,fontWeight:700,color:d.recibido-d.gastado<0?"#DC2626":"#059669"}}>Dev: {fmt(d.recibido-d.gastado)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!perms.verReporteCaja&&(
        <div style={{background:"#EFF6FF",borderRadius:8,padding:"10px 14px",marginBottom:12,border:"1px solid #BFDBFE"}}>
          <div style={{fontSize:12,color:"#2563EB",fontWeight:600}}>Registra tus gastos del dia. El Asistente y Director revisan el saldo y hacen el cierre.</div>
        </div>
      )}

      <div style={{display:"flex",gap:4,marginBottom:14,background:"#F3F4F6",borderRadius:8,padding:4}}>
        <button onClick={()=>setTabCC("gastos")} style={tabS(tabCC==="gastos")}>💳 Gastos</button>
        {perms.gestionarEntregas&&<button onClick={()=>setTabCC("entregas")} style={tabS(tabCC==="entregas")}>💵 Entregas</button>}
      </div>

      {tabCC==="gastos"&&(
        <>
          <div style={{background:"#fff",border:"1.5px solid #E5E7EB",borderRadius:12,padding:14,marginBottom:14}}>
            <div style={{fontSize:13,fontWeight:600,marginBottom:10}}>+ Registrar gasto</div>
            <div style={{display:"grid",gap:8}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <div><label style={{fontSize:11,color:"#6B7280",fontWeight:500,display:"block",marginBottom:3}}>Descripcion *</label><input value={gForm.descripcion} onChange={e=>setGForm(p=>({...p,descripcion:e.target.value}))} style={iS} placeholder="En que se gasto?"/></div>
                <div><label style={{fontSize:11,color:"#6B7280",fontWeight:500,display:"block",marginBottom:3}}>Monto total *</label><input type="number" value={gForm.montoTotal} onChange={e=>setGForm(p=>({...p,montoTotal:e.target.value}))} style={iS} placeholder="0.00"/></div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <div><label style={{fontSize:11,color:"#6B7280",fontWeight:500,display:"block",marginBottom:3}}>Responsable</label>
                  {perms.verReporteCaja?<input value={gForm.responsable} onChange={e=>setGForm(p=>({...p,responsable:e.target.value}))} style={iS} placeholder="Nombre"/>:<input value={currentUser.name} disabled style={{...iS,background:"#F3F4F6",color:"#9CA3AF"}}/>}
                </div>
                <div><label style={{fontSize:11,color:"#6B7280",fontWeight:500,display:"block",marginBottom:3}}>Fecha</label><input type="date" value={gForm.fecha} onChange={e=>setGForm(p=>({...p,fecha:e.target.value}))} style={iS}/></div>
              </div>

              <div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                  <label style={{fontSize:11,color:"#6B7280",fontWeight:500}}>Distribuir por rubros</label>
                  {montoTotal>0&&<span style={{fontSize:11,color:Math.abs(diferencia)<0.01?"#059669":diferencia>0?"#D97706":"#DC2626",fontWeight:600}}>{Math.abs(diferencia)<0.01?"Completo":diferencia>0?"Falta: "+fmt(diferencia):"Excede: "+fmt(Math.abs(diferencia))}</span>}
                </div>
                {gForm.partidas.map((p2,i)=>(
                  <div key={i} style={{display:"flex",gap:6,marginBottom:6,alignItems:"center"}}>
                    <select value={p2.rubroId} onChange={e=>updatePartida(i,"rubroId",e.target.value)} style={{...iS,flex:2}}><option value="">Rubro...</option>{rubros.map(r=><option key={r.id} value={r.id}>{r.nombre}</option>)}</select>
                    <input type="number" value={p2.monto} onChange={e=>updatePartida(i,"monto",e.target.value)} style={{...iS,flex:1}} placeholder="USD"/>
                    {gForm.partidas.length>1&&<button onClick={()=>removePartida(i)} style={{background:"none",border:"none",color:"#DC2626",cursor:"pointer",fontSize:16,flexShrink:0}}>x</button>}
                  </div>
                ))}
                <button onClick={addPartida} style={{background:"#F9FAFB",border:"1px dashed #E5E7EB",borderRadius:6,padding:"5px 12px",color:"#6B7280",fontSize:11,cursor:"pointer",width:"100%"}}>+ Agregar rubro</button>
              </div>

              <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
                <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:12,color:"#374151"}}>
                  <input type="checkbox" checked={gForm.tieneFactura} onChange={e=>setGForm(p=>({...p,tieneFactura:e.target.checked}))} style={{width:16,height:16,accentColor:"#E8622A"}}/>
                  Tiene factura/recibo
                </label>
                <input ref={fotoRef} type="file" accept="image/*" onChange={subirFoto} style={{display:"none"}}/>
                <button onClick={()=>fotoRef.current?.click()} style={{background:"#F9FAFB",border:"1px solid #E5E7EB",borderRadius:6,padding:"5px 10px",color:"#6B7280",fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>📷 Foto factura</button>
                {gForm.fotoUrl&&<span style={{fontSize:11,color:"#059669"}}>✓ Foto adjunta</span>}
              </div>

              <button onClick={agregarGasto} disabled={!gForm.descripcion||!gForm.montoTotal} style={{background:gForm.descripcion&&gForm.montoTotal?"#E8622A":"#F3F4F6",border:"none",borderRadius:8,padding:10,color:gForm.descripcion&&gForm.montoTotal?"#fff":"#9CA3AF",fontSize:13,fontWeight:600,cursor:"pointer"}}>Registrar gasto</button>
            </div>
          </div>

          {gastosVisibles.length===0?<div style={{textAlign:"center",color:"#9CA3AF",padding:"30px 0"}}><div style={{fontSize:32,marginBottom:8}}>💳</div>Sin gastos registrados</div>
            :gastosVisibles.map(g=>(
              <div key={g.id} style={{background:"#fff",borderRadius:10,padding:"10px 12px",marginBottom:6,border:"1px solid #F0F1F3"}}>
                <div style={{display:"flex",justifyContent:"space-between",gap:10}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:600}}>{g.descripcion}</div>
                    <div style={{fontSize:11,color:"#6B7280",marginTop:2}}>{g.fecha}{g.responsable?" - "+g.responsable:""}</div>
                    <div style={{display:"flex",gap:4,marginTop:4,flexWrap:"wrap"}}>
                      <span style={{background:g.tieneFactura?"#F0FDF4":"#FEF3C7",color:g.tieneFactura?"#059669":"#D97706",fontSize:10,fontWeight:600,padding:"2px 6px",borderRadius:10}}>{g.tieneFactura?"Con factura":"Sin factura"}</span>
                      {g.fotoUrl&&<a href={g.fotoUrl} target="_blank" rel="noreferrer" style={{background:"#EFF6FF",color:"#2563EB",fontSize:10,fontWeight:600,padding:"2px 6px",borderRadius:10,textDecoration:"none"}}>📷 Ver foto</a>}
                    </div>
                    {g.partidas?.filter(p=>p.monto).map((p2,i)=>{const r=rubros.find(r=>r.id===p2.rubroId);return r?<div key={i} style={{fontSize:10,color:"#9CA3AF",marginTop:2}}>{r.nombre}: {fmt(p2.monto)}</div>:null;})}
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:14,fontWeight:700,color:"#DC2626"}}>-{fmt(g.montoTotal)}</div>
                    {perms.verReporteCaja&&<button onClick={()=>saveG(gastos.filter(x=>x.id!==g.id))} style={{background:"none",border:"none",color:"#DC2626",cursor:"pointer",fontSize:11,marginTop:4}}>🗑</button>}
                  </div>
                </div>
              </div>
            ))}
        </>
      )}

      {tabCC==="entregas"&&perms.gestionarEntregas&&(
        <>
          <div style={{background:"#fff",border:"1.5px solid #E5E7EB",borderRadius:12,padding:14,marginBottom:14}}>
            <div style={{fontSize:13,fontWeight:600,marginBottom:10}}>💵 Registrar entrega de efectivo</div>
            <div style={{display:"grid",gap:8}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <div><label style={{fontSize:11,color:"#6B7280",fontWeight:500,display:"block",marginBottom:3}}>Responsable *</label>
                  <select value={eForm.responsable} onChange={e=>setEForm(p=>({...p,responsable:e.target.value}))} style={iS}><option value="">Seleccionar...</option><option>Hector</option><option>Josh</option><option>Guillermo</option><option>Camila</option><option>Santiago</option><option>Gerardo</option><option>Luis Guala</option></select>
                </div>
                <div><label style={{fontSize:11,color:"#6B7280",fontWeight:500,display:"block",marginBottom:3}}>Monto USD *</label><input type="number" value={eForm.monto} onChange={e=>setEForm(p=>({...p,monto:e.target.value}))} style={iS} placeholder="0.00"/></div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <div><label style={{fontSize:11,color:"#6B7280",fontWeight:500,display:"block",marginBottom:3}}>Fecha</label><input type="date" value={eForm.fecha} onChange={e=>setEForm(p=>({...p,fecha:e.target.value}))} style={iS}/></div>
                <div><label style={{fontSize:11,color:"#6B7280",fontWeight:500,display:"block",marginBottom:3}}>Nota</label><input value={eForm.nota} onChange={e=>setEForm(p=>({...p,nota:e.target.value}))} style={iS} placeholder="Opcional"/></div>
              </div>
              <button onClick={agregarEntrega} disabled={!eForm.responsable||!eForm.monto} style={{background:eForm.responsable&&eForm.monto?"#E8622A":"#F3F4F6",border:"none",borderRadius:8,padding:10,color:eForm.responsable&&eForm.monto?"#fff":"#9CA3AF",fontSize:13,fontWeight:600,cursor:"pointer"}}>Registrar entrega</button>
            </div>
          </div>
          {entregas.length===0?<div style={{textAlign:"center",color:"#9CA3AF",padding:"30px 0"}}><div style={{fontSize:32,marginBottom:8}}>💵</div>Sin entregas registradas</div>
            :entregas.map(e2=>(
              <div key={e2.id} style={{background:"#fff",borderRadius:10,padding:"10px 12px",marginBottom:6,border:"1px solid #F0F1F3",display:"flex",justifyContent:"space-between",gap:10}}>
                <div>
                  <div style={{fontSize:13,fontWeight:600}}>{e2.responsable}</div>
                  <div style={{fontSize:11,color:"#6B7280",marginTop:2}}>{e2.fecha}{e2.nota?" - "+e2.nota:""}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:14,fontWeight:700,color:"#059669"}}>+{fmt(e2.monto)}</div>
                  <button onClick={()=>saveE(entregas.filter(x=>x.id!==e2.id))} style={{background:"none",border:"none",color:"#DC2626",cursor:"pointer",fontSize:11,marginTop:4}}>🗑</button>
                </div>
              </div>
            ))}
        </>
      )}

      {modal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.3)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,padding:20}} onClick={()=>setModal(false)}>
          <div style={{background:"#fff",borderRadius:16,padding:22,maxWidth:480,width:"100%",maxHeight:"85vh",overflowY:"auto",fontFamily:"'Inter',sans-serif"}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}><NovaIcon size={24}/><div style={{fontSize:14,fontWeight:700}}>Reporte de Caja Chica</div><button onClick={()=>setModal(false)} style={{marginLeft:"auto",background:"none",border:"none",color:"#9CA3AF",cursor:"pointer",fontSize:20}}>x</button></div>
            {gen?<div style={{color:"#9CA3AF",fontSize:13,padding:"20px 0",textAlign:"center"}}>Generando reporte...</div>
              :rep&&!rep.error&&(
                <div>
                  <div style={{background:rep.estado==="ok"?"#F0FDF4":rep.estado==="revisar"?"#FEF3C7":"#FEF2F2",borderRadius:8,padding:"10px 14px",marginBottom:14,border:"1px solid "+(rep.estado==="ok"?"#BBF7D0":rep.estado==="revisar"?"#FDE68A":"#FECACA")}}>
                    <div style={{fontSize:12,fontWeight:700,color:rep.estado==="ok"?"#059669":rep.estado==="revisar"?"#D97706":"#DC2626",marginBottom:4}}>{rep.estado==="ok"?"OK":rep.estado==="revisar"?"Requiere revision":"Urgente"}</div>
                    <div style={{fontSize:12,color:"#374151"}}>{rep.resumen}</div>
                  </div>
                  {rep.por_persona?.map((p3,i)=>(
                    <div key={i} style={{background:"#F9FAFB",borderRadius:8,padding:"8px 12px",marginBottom:6,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div style={{fontSize:13,fontWeight:600}}>{p3.nombre}</div>
                      <div style={{display:"flex",gap:12}}>
                        <span style={{fontSize:11,color:"#6B7280"}}>Recibio: <strong>{fmt(p3.recibio)}</strong></span>
                        <span style={{fontSize:11,color:"#6B7280"}}>Gasto: <strong style={{color:"#D97706"}}>{fmt(p3.gasto)}</strong></span>
                        <span style={{fontSize:11,fontWeight:700,color:p3.devuelve>0?"#059669":"#DC2626"}}>Dev: {fmt(Math.abs(p3.devuelve))}</span>
                      </div>
                    </div>
                  ))}
                  {rep.observaciones?.length>0&&<div style={{marginTop:10}}>{rep.observaciones.map((o,i)=><div key={i} style={{fontSize:12,color:"#6B7280",marginBottom:4,paddingLeft:12,borderLeft:"2px solid #E5E7EB"}}>{o}</div>)}</div>}
                  <button onClick={()=>window.print()} style={{width:"100%",marginTop:14,background:"#1F2937",border:"none",borderRadius:8,padding:10,color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer"}}>Imprimir / Enviar</button>
                </div>
              )}
          </div>
        </div>
      )}
    </div>
  );
}

// MODULO PROYECTO (router de tabs)
function ModuloProyecto({proyectoId,proyectos,currentUser}){
  const perms=can(currentUser.role);
  const [tab,setTab]=useState(perms.verPresupuesto?"presupuesto":"cajachica");
  const proy=proyectos.find(p=>p.id===proyectoId);
  const b=rolBadge(currentUser.role);
  const tabS=a=>({padding:"6px 14px",borderRadius:6,border:"none",cursor:"pointer",fontFamily:"'Inter',sans-serif",fontSize:12,fontWeight:600,background:a?"#E8622A":"transparent",color:a?"#fff":"#6B7280"});
  return(
    <div>
      {proy&&(
        <div style={{background:"#fff",borderRadius:12,padding:"10px 14px",marginBottom:12,border:"1px solid #F0F1F3",borderLeft:"3px solid "+proy.color,display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:10,height:10,borderRadius:"50%",background:proy.color}}/>
          <div style={{fontSize:14,fontWeight:700,color:"#111"}}>{proy.name}</div>
          <span style={{background:b.bg,color:b.color,fontSize:10,fontWeight:700,padding:"2px 6px",borderRadius:10,marginLeft:"auto"}}>{b.label}</span>
        </div>
      )}
      <div style={{display:"flex",gap:4,marginBottom:14,background:"#F3F4F6",borderRadius:8,padding:4,flexWrap:"wrap"}}>
        {perms.verPresupuesto&&<button onClick={()=>setTab("presupuesto")} style={tabS(tab==="presupuesto")}>Rubros</button>}
        {perms.verFacturas&&<button onClick={()=>setTab("facturas")} style={tabS(tab==="facturas")}>Facturas</button>}
        {perms.verCotizaciones&&<button onClick={()=>setTab("cotizaciones")} style={tabS(tab==="cotizaciones")}>Cotizaciones</button>}
        {perms.verCajaChica&&<button onClick={()=>setTab("cajachica")} style={tabS(tab==="cajachica")}>Caja Chica</button>}
      </div>
      {tab==="presupuesto"&&<ModuloPresupuesto proyectoId={proyectoId} proyectos={proyectos} perms={perms}/>}
      {tab==="facturas"&&<ModuloFacturas proyectoId={proyectoId} perms={perms}/>}
      {tab==="cotizaciones"&&<ModuloCotizaciones proyectoId={proyectoId}/>}
      {tab==="cajachica"&&<ModuloCajaChica proyectoId={proyectoId} currentUser={currentUser} perms={perms}/>}
    </div>
  );
}


// ============================================================
//  APP PRINCIPAL
// ============================================================

// ── COLOR PICKER ─────────────────────────────────────────────
const COLORS=["#E8622A","#2563EB","#7C3AED","#DB2777","#D97706","#059669","#DC2626","#0891B2","#65A30D","#9333EA","#374151","#B45309"];
function ColorPicker({value,onChange}){
  return(
    <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:4}}>
      {COLORS.map(c=>(
        <div key={c} onClick={()=>onChange(c)} style={{width:24,height:24,borderRadius:"50%",background:c,cursor:"pointer",border:value===c?"3px solid #111":"3px solid transparent",transition:"border 0.1s"}}/>
      ))}
    </div>
  );
}

// ── FORM PROYECTO (fuera de PanelAjustes para evitar re-mount) ─
function ProyectoForm({data,onChange,onSave,onCancel,saveLabel,users}){
  const iS={width:"100%",background:"#F9FAFB",border:"1px solid #E5E7EB",borderRadius:8,color:"#111",padding:"8px 10px",fontSize:13,fontFamily:"'Inter',sans-serif",boxSizing:"border-box",outline:"none"};
  function toggleU(uid){
    const uids=data.usuarios||[];
    onChange({...data,usuarios:uids.includes(uid)?uids.filter(x=>x!==uid):[...uids,uid]});
  }
  return(
    <div style={{background:"#F9FAFB",borderRadius:10,padding:14,marginBottom:10,border:"1.5px solid #E8622A",fontFamily:"'Inter',sans-serif"}}>
      <div style={{display:"grid",gap:10}}>
        <div>
          <label style={{fontSize:11,color:"#6B7280",fontWeight:500,display:"block",marginBottom:3}}>Nombre del proyecto *</label>
          <input
            value={data.name}
            onChange={e=>onChange({...data,name:e.target.value})}
            style={iS}
            placeholder="Ej: BdP Panamericana"
            autoFocus
          />
        </div>
        <div>
          <label style={{fontSize:11,color:"#6B7280",fontWeight:500,display:"block",marginBottom:3}}>Color</label>
          <ColorPicker value={data.color} onChange={c=>onChange({...data,color:c})}/>
        </div>
        <div>
          <label style={{fontSize:11,color:"#6B7280",fontWeight:500,display:"block",marginBottom:6}}>Modulo financiero</label>
          <button
            type="button"
            onClick={()=>onChange({...data,tieneFinanzas:!data.tieneFinanzas})}
            style={{background:data.tieneFinanzas?"#F0FDF4":"#F3F4F6",border:"1px solid "+(data.tieneFinanzas?"#BBF7D0":"#E5E7EB"),borderRadius:20,padding:"5px 14px",color:data.tieneFinanzas?"#059669":"#9CA3AF",fontSize:12,fontWeight:600,cursor:"pointer"}}>
            {data.tieneFinanzas?"Finanzas ON":"Finanzas OFF"}
          </button>
        </div>
        <div>
          <label style={{fontSize:11,color:"#6B7280",fontWeight:500,display:"block",marginBottom:6}}>Equipo asignado</label>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {users.map(u=>{
              const sel=(data.usuarios||[]).includes(u.id);
              return(
                <button type="button" key={u.id} onClick={()=>toggleU(u.id)}
                  style={{display:"flex",alignItems:"center",gap:5,padding:"4px 10px",borderRadius:20,border:"1.5px solid "+(sel?u.color:"#E5E7EB"),background:sel?u.color+"18":"#fff",cursor:"pointer",fontSize:12,fontWeight:sel?600:400,color:sel?u.color:"#6B7280"}}>
                  <Avatar name={u.name} size={16} color={u.color}/>{u.name}
                </button>
              );
            })}
          </div>
        </div>
        <div style={{display:"flex",gap:8,marginTop:4}}>
          <button type="button" onClick={onSave} disabled={!data.name.trim()}
            style={{flex:2,background:data.name.trim()?"#E8622A":"#F3F4F6",border:"none",borderRadius:8,padding:10,color:data.name.trim()?"#fff":"#9CA3AF",fontSize:13,fontWeight:600,cursor:data.name.trim()?"pointer":"default"}}>
            {saveLabel}
          </button>
          <button type="button" onClick={onCancel}
            style={{flex:1,background:"#F3F4F6",border:"none",borderRadius:8,padding:10,color:"#6B7280",fontSize:12,cursor:"pointer"}}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── FORM USUARIO ──────────────────────────────────────────────
function UsuarioForm({data,onChange,onSave,onCancel,saveLabel}){
  const iS={width:"100%",background:"#F9FAFB",border:"1px solid #E5E7EB",borderRadius:8,color:"#111",padding:"8px 10px",fontSize:13,fontFamily:"'Inter',sans-serif",boxSizing:"border-box",outline:"none"};
  return(
    <div style={{background:"#F9FAFB",borderRadius:10,padding:14,marginBottom:10,border:"1.5px solid #7C3AED",fontFamily:"'Inter',sans-serif"}}>
      <div style={{display:"grid",gap:10}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <div>
            <label style={{fontSize:11,color:"#6B7280",fontWeight:500,display:"block",marginBottom:3}}>Nombre *</label>
            <input value={data.name} onChange={e=>onChange({...data,name:e.target.value})} style={iS} placeholder="Nombre completo" autoFocus/>
          </div>
          <div>
            <label style={{fontSize:11,color:"#6B7280",fontWeight:500,display:"block",marginBottom:3}}>PIN (4 digitos) *</label>
            <input value={data.pin} onChange={e=>onChange({...data,pin:e.target.value.slice(0,4)})} style={iS} placeholder="0000" maxLength={4} type="password"/>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <div>
            <label style={{fontSize:11,color:"#6B7280",fontWeight:500,display:"block",marginBottom:3}}>Rol</label>
            <select value={data.role} onChange={e=>onChange({...data,role:e.target.value})} style={iS}>
              <option value="owner">Director (Nivel 1)</option>
              <option value="assistant">Asistente (Nivel 2)</option>
              <option value="member">Equipo (Nivel 3)</option>
            </select>
          </div>
          <div>
            <label style={{fontSize:11,color:"#6B7280",fontWeight:500,display:"block",marginBottom:3}}>Email</label>
            <input value={data.email||""} onChange={e=>onChange({...data,email:e.target.value})} style={iS} placeholder="email@empresa.com"/>
          </div>
        </div>
        <div>
          <label style={{fontSize:11,color:"#6B7280",fontWeight:500,display:"block",marginBottom:3}}>Color</label>
          <ColorPicker value={data.color} onChange={c=>onChange({...data,color:c})}/>
        </div>
        <div style={{display:"flex",gap:8,marginTop:4}}>
          <button type="button" onClick={onSave} disabled={!data.name.trim()||!data.pin}
            style={{flex:2,background:data.name.trim()&&data.pin?"#7C3AED":"#F3F4F6",border:"none",borderRadius:8,padding:10,color:data.name.trim()&&data.pin?"#fff":"#9CA3AF",fontSize:13,fontWeight:600,cursor:data.name.trim()&&data.pin?"pointer":"default"}}>
            {saveLabel}
          </button>
          <button type="button" onClick={onCancel}
            style={{flex:1,background:"#F3F4F6",border:"none",borderRadius:8,padding:10,color:"#6B7280",fontSize:12,cursor:"pointer"}}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── PANEL AJUSTES ─────────────────────────────────────────────
function PanelAjustes({users,setUsers,projects,setProjects,empresa,setEmpresa,onClose}){
  const [tab,setTab]=useState("proyectos");
  const [editP,setEditP]=useState(null);
  const [showNewP,setShowNewP]=useState(false);
  const [newP,setNewP]=useState({name:"",color:"#2563EB",tieneFinanzas:true,usuarios:[]});
  const [editU,setEditU]=useState(null);
  const [showNewU,setShowNewU]=useState(false);
  const [newU,setNewU]=useState({name:"",pin:"",role:"member",color:"#2563EB",email:""});
  const iS={width:"100%",background:"#F9FAFB",border:"1px solid #E5E7EB",borderRadius:8,color:"#111",padding:"8px 10px",fontSize:13,fontFamily:"'Inter',sans-serif",boxSizing:"border-box",outline:"none"};
  const tabS=a=>({padding:"7px 14px",borderRadius:6,border:"none",cursor:"pointer",fontFamily:"'Inter',sans-serif",fontSize:12,fontWeight:600,background:a?"#E8622A":"transparent",color:a?"#fff":"#6B7280"});

  function saveProjects(p){setProjects(p);saveLS("foreman_projects",p);}
  function saveUsers(u){setUsers(u);saveLS("foreman_users",u);}
  function saveEmpresa(e){setEmpresa(e);saveLS("foreman_empresa",e);}

  function crearProyecto(){
    if(!newP.name.trim())return;
    saveProjects([...projects,{...newP,id:Date.now(),name:newP.name.trim()}]);
    setNewP({name:"",color:"#2563EB",tieneFinanzas:true,usuarios:[]});
    setShowNewP(false);
  }
  function guardarEdicionP(){
    if(!editP||!editP.name.trim())return;
    saveProjects(projects.map(p=>p.id===editP.id?editP:p));
    setEditP(null);
  }
  function eliminarP(pid){if(window.confirm("Eliminar proyecto?"))saveProjects(projects.filter(p=>p.id!==pid));}

  function crearUsuario(){
    if(!newU.name.trim()||!newU.pin)return;
    saveUsers([...users,{...newU,id:Date.now(),name:newU.name.trim()}]);
    setNewU({name:"",pin:"",role:"member",color:"#2563EB",email:""});
    setShowNewU(false);
  }
  function guardarEdicionU(){
    if(!editU||!editU.name.trim()||!editU.pin)return;
    saveUsers(users.map(u=>u.id===editU.id?editU:u));
    setEditU(null);
  }
  function eliminarU(uid){if(window.confirm("Eliminar usuario?"))saveUsers(users.filter(u=>u.id!==uid));}

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.3)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:150,padding:20}} onClick={onClose}>
      <div style={{background:"#fff",borderRadius:16,padding:22,maxWidth:500,width:"100%",maxHeight:"92vh",overflowY:"auto",fontFamily:"'Inter',sans-serif"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:15,fontWeight:700}}>Ajustes</div>
          <button type="button" onClick={onClose} style={{background:"#F3F4F6",border:"none",borderRadius:6,width:28,height:28,color:"#6B7280",cursor:"pointer",fontSize:15}}>x</button>
        </div>
        <div style={{display:"flex",gap:4,marginBottom:16,background:"#F3F4F6",borderRadius:8,padding:4}}>
          <button type="button" onClick={()=>setTab("proyectos")} style={tabS(tab==="proyectos")}>Proyectos</button>
          <button type="button" onClick={()=>setTab("usuarios")} style={tabS(tab==="usuarios")}>Usuarios</button>
          <button type="button" onClick={()=>setTab("empresa")} style={tabS(tab==="empresa")}>Empresa</button>
        </div>

        {tab==="proyectos"&&(
          <div>
            {projects.map(p=>(
              editP?.id===p.id?(
                <ProyectoForm key={p.id} data={editP} onChange={setEditP} onSave={guardarEdicionP} onCancel={()=>setEditP(null)} saveLabel="Guardar cambios" users={users}/>
              ):(
                <div key={p.id} style={{background:"#F9FAFB",borderRadius:10,padding:"10px 12px",marginBottom:8,borderLeft:"3px solid "+p.color}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:10,height:10,borderRadius:"50%",background:p.color,flexShrink:0}}/>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:600,color:"#111"}}>{p.name}</div>
                      <div style={{display:"flex",gap:5,marginTop:4,flexWrap:"wrap",alignItems:"center"}}>
                        <span style={{background:p.tieneFinanzas!==false?"#F0FDF4":"#F3F4F6",color:p.tieneFinanzas!==false?"#059669":"#9CA3AF",fontSize:10,fontWeight:600,padding:"1px 7px",borderRadius:10}}>{p.tieneFinanzas!==false?"Finanzas ON":"Finanzas OFF"}</span>
                        {(p.usuarios||[]).slice(0,5).map(uid=>{const u=users.find(u=>u.id===uid);return u?<Avatar key={uid} name={u.name} size={18} color={u.color}/>:null;})}
                        {(p.usuarios||[]).length>5&&<span style={{fontSize:10,color:"#9CA3AF"}}>+{(p.usuarios||[]).length-5}</span>}
                      </div>
                    </div>
                    <div style={{display:"flex",gap:4}}>
                      <button type="button" onClick={()=>setEditP({...p,usuarios:p.usuarios||[]})} style={{background:"#fff",border:"1px solid #E5E7EB",borderRadius:6,padding:"4px 8px",color:"#6B7280",fontSize:11,cursor:"pointer"}}>✏️</button>
                      <button type="button" onClick={()=>eliminarP(p.id)} style={{background:"#FEE2E2",border:"1px solid #FECACA",borderRadius:6,padding:"4px 8px",color:"#DC2626",fontSize:11,cursor:"pointer"}}>🗑</button>
                    </div>
                  </div>
                </div>
              )
            ))}
            {showNewP?(
              <ProyectoForm data={newP} onChange={setNewP} onSave={crearProyecto} onCancel={()=>{setShowNewP(false);setNewP({name:"",color:"#2563EB",tieneFinanzas:true,usuarios:[]});}} saveLabel="Crear proyecto" users={users}/>
            ):(
              <button type="button" onClick={()=>setShowNewP(true)} style={{width:"100%",background:"#F9FAFB",border:"1.5px dashed #E8622A",borderRadius:10,padding:12,color:"#E8622A",fontSize:13,fontWeight:600,cursor:"pointer",marginTop:4}}>+ Nuevo proyecto</button>
            )}
          </div>
        )}

        {tab==="usuarios"&&(
          <div>
            {users.map(u=>(
              editU?.id===u.id?(
                <UsuarioForm key={u.id} data={editU} onChange={setEditU} onSave={guardarEdicionU} onCancel={()=>setEditU(null)} saveLabel="Guardar cambios"/>
              ):(
                <div key={u.id} style={{background:"#F9FAFB",borderRadius:10,padding:"10px 12px",marginBottom:8,display:"flex",alignItems:"center",gap:10}}>
                  <Avatar name={u.name} size={36} color={u.color}/>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                      <div style={{fontSize:13,fontWeight:600}}>{u.name}</div>
                      {(()=>{const b=rolBadge(u.role);return <span style={{background:b.bg,color:b.color,fontSize:10,fontWeight:700,padding:"1px 6px",borderRadius:10}}>{b.label}</span>;})()}
                    </div>
                    <div style={{fontSize:10,color:"#9CA3AF"}}>{u.email||"Sin email"}</div>
                  </div>
                  <div style={{display:"flex",gap:4}}>
                    <button type="button" onClick={()=>setEditU({...u})} style={{background:"#fff",border:"1px solid #E5E7EB",borderRadius:6,padding:"4px 8px",color:"#6B7280",fontSize:11,cursor:"pointer"}}>✏️</button>
                    {u.role!=="owner"&&<button type="button" onClick={()=>eliminarU(u.id)} style={{background:"#FEE2E2",border:"1px solid #FECACA",borderRadius:6,padding:"4px 8px",color:"#DC2626",fontSize:11,cursor:"pointer"}}>🗑</button>}
                  </div>
                </div>
              )
            ))}
            {showNewU?(
              <UsuarioForm data={newU} onChange={setNewU} onSave={crearUsuario} onCancel={()=>{setShowNewU(false);setNewU({name:"",pin:"",role:"member",color:"#2563EB",email:""});}} saveLabel="Crear usuario"/>
            ):(
              <button type="button" onClick={()=>setShowNewU(true)} style={{width:"100%",background:"#F9FAFB",border:"1.5px dashed #7C3AED",borderRadius:10,padding:12,color:"#7C3AED",fontSize:13,fontWeight:600,cursor:"pointer",marginTop:4}}>+ Nuevo usuario</button>
            )}
          </div>
        )}

        {tab==="empresa"&&(
          <div>
            {[{k:"nombre",l:"Empresa",ph:"HCA Studio"},{k:"email",l:"Email",ph:"info@hcastudio.com"},{k:"ciudad",l:"Ciudad",ph:"Quito"},{k:"moneda",l:"Moneda",ph:"USD"}].map(f=>(
              <div key={f.k} style={{marginBottom:10}}>
                <label style={{color:"#6B7280",fontSize:11,fontWeight:500,marginBottom:4,display:"block"}}>{f.l}</label>
                <input value={empresa?.[f.k]||""} onChange={e=>saveEmpresa({...empresa,[f.k]:e.target.value})} placeholder={f.ph} style={iS}/>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}


export default function App(){
  const [users,setUsers]=useState(()=>loadLS("foreman_users",USERS_DEFAULT));
  const [projects,setProjects]=useState(()=>loadLS("foreman_projects",PROJECTS_DEFAULT));
  const [empresa,setEmpresa]=useState(()=>loadLS("foreman_empresa",{nombre:"HCA Studio",ciudad:"Quito",moneda:"USD"}));
  const [usuario,setUsuario]=useState(null);
  const [tareas,setTareas]=useState([]);
  const [cargando,setCargando]=useState(false);
  const [vista,setVista]=useState("tareas");
  const [filtro,setFiltro]=useState("todas");
  const [filtroP,setFiltroP]=useState("all");
  const [showModal,setShowModal]=useState(false);
  const [editTask,setEditTask]=useState(null);
  const [showAjustes,setShowAjustes]=useState(false);
  const [busqueda,setBusqueda]=useState("");
  const [proyFin,setProyFin]=useState(null);
  const perms=usuario?can(usuario.role):{};
  const proyectosConFinanzas=projects.filter(p=>p.tieneFinanzas!==false);

  useEffect(()=>{if(usuario)fetchTareas();},[usuario]);
  async function fetchTareas(){setCargando(true);const{data}=await supabase.from("tasks").select("*").order("created_at",{ascending:false});setTareas(data||[]);setCargando(false);}
  async function cambiarEstado(id,estado){setTareas(prev=>prev.map(t=>t.id===id?{...t,status:estado}:t));await supabase.from("tasks").update({status:estado}).eq("id",id);}
  async function guardarTarea(form,id){if(id)await supabase.from("tasks").update(form).eq("id",id);else await supabase.from("tasks").insert({...form,created_by:usuario.id});fetchTareas();setEditTask(null);}
  async function eliminarTarea(id){if(!window.confirm("Eliminar esta tarea?"))return;await supabase.from("tasks").delete().eq("id",id);setTareas(prev=>prev.filter(t=>t.id!==id));}
  function logout(){saveLS("foreman_session",null);localStorage.removeItem("foreman_session");setUsuario(null);}
  function toggleFinanzas(pid){const updated=projects.map(p=>p.id===pid?{...p,tieneFinanzas:!p.tieneFinanzas}:p);setProjects(updated);saveLS("foreman_projects",updated);}

  if(!usuario)return <LoginScreen onLogin={setUsuario} users={users}/>;

  const pendientes=tareas.filter(t=>t.status!=="listo");
  const vencidas=pendientes.filter(t=>daysUntil(t.due_date)<0);
  const urgentes=pendientes.filter(t=>t.priority==="urgente"||daysUntil(t.due_date)<=1);
  const b=rolBadge(usuario.role);

  let visibles=tareas;
  if(busqueda.trim()){const q=busqueda.toLowerCase();visibles=visibles.filter(t=>t.title?.toLowerCase().includes(q)||t.notes?.toLowerCase().includes(q)||projects.find(p=>p.id===t.project_id)?.name?.toLowerCase().includes(q));}
  if(filtro==="pendiente")visibles=visibles.filter(t=>t.status==="pendiente");
  if(filtro==="urgente")visibles=visibles.filter(t=>t.status!=="listo"&&(t.priority==="urgente"||daysUntil(t.due_date)<=1));
  if(filtro==="listo")visibles=visibles.filter(t=>t.status==="listo");
  if(filtroP!=="all")visibles=visibles.filter(t=>t.project_id===Number(filtroP));

  const navItem=(v,label,icon,badge)=>(
    <button onClick={()=>setVista(v)} style={{width:"100%",background:vista===v?"#FFF4F0":"transparent",border:"none",borderRight:vista===v?"3px solid #E8622A":"3px solid transparent",padding:"9px 14px",display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontFamily:"'Inter',sans-serif",fontSize:13,fontWeight:vista===v?600:400,color:vista===v?"#E8622A":"#6B7280",textAlign:"left",transition:"all 0.15s"}}>
      <span style={{fontSize:14}}>{icon}</span>{label}
      {badge>0&&<span style={{marginLeft:"auto",background:"#DC2626",color:"#fff",fontSize:9,fontWeight:700,padding:"1px 5px",borderRadius:10}}>{badge}</span>}
    </button>
  );
  const filtS=a=>({padding:"6px 14px",borderRadius:20,border:a?"none":"1px solid #E5E7EB",cursor:"pointer",fontFamily:"'Inter',sans-serif",fontSize:12,fontWeight:600,background:a?"#1F2937":"#fff",color:a?"#fff":"#6B7280",flexShrink:0});

  return(
    <div style={{minHeight:"100vh",background:"#F8F9FB",fontFamily:"'Inter',sans-serif",display:"flex",flexDirection:"column"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');*{box-sizing:border-box}select option{background:#fff}input,select,textarea{outline:none}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#E5E7EB;border-radius:2px}@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>

      <div style={{background:"#fff",borderBottom:"1.5px solid #F0F1F3",padding:"0 16px",position:"sticky",top:0,zIndex:100,boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
        <div style={{display:"flex",alignItems:"center",height:54,gap:12,maxWidth:1100,margin:"0 auto",width:"100%"}}>
          <div style={{display:"inline-flex",alignItems:"center",flexShrink:0}}>
            <div style={{width:10,height:26,background:"#E8622A",borderRadius:"4px 0 0 4px"}}/><div style={{width:10,height:26,background:"#FF9500"}}/><div style={{width:10,height:26,background:"#FFD60A",borderRadius:"0 4px 4px 0",marginRight:8}}/>
            <span style={{color:"#1F2937",fontSize:16,fontWeight:700,letterSpacing:0.5}}>FOREMAN</span>
            <span style={{background:"#F3F4F6",color:"#9CA3AF",fontSize:9,fontWeight:600,padding:"1px 5px",borderRadius:4,marginLeft:4}}>BETA</span>
            <span style={{background:"#FFF4F0",color:"#E8622A",fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:4,marginLeft:4,border:"1px solid #FED7AA"}}>+ FINANCE</span>
          </div>
          {perms.verTodasTareas&&(
            <div style={{flex:1,background:"#F3F4F6",borderRadius:8,padding:"4px 12px",display:"flex",alignItems:"center",gap:8,maxWidth:280}}>
              <span style={{fontSize:13}}>🔍</span>
              <input value={busqueda} onChange={e=>setBusqueda(e.target.value)} placeholder="Buscar tareas..." style={{background:"transparent",border:"none",outline:"none",fontSize:12,color:"#374151",width:"100%",fontFamily:"inherit"}}/>
              {busqueda&&<button onClick={()=>setBusqueda("")} style={{background:"none",border:"none",color:"#9CA3AF",cursor:"pointer",fontSize:14,padding:0}}>x</button>}
            </div>
          )}
          <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8}}>
            {vencidas.length>0&&perms.verTodasTareas&&<span style={{background:"#FEE2E2",color:"#DC2626",fontSize:11,fontWeight:600,padding:"3px 10px",borderRadius:20}}>{vencidas.length} vencidas</span>}
            <span style={{background:b.bg,color:b.color,fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:20}}>{b.label}</span>
            {perms.verAjustes&&<button onClick={()=>setShowAjustes(true)} style={{background:"#F3F4F6",border:"none",borderRadius:8,padding:"6px 10px",color:"#6B7280",fontSize:12,cursor:"pointer"}}>Ajustes</button>}
            <Avatar name={usuario.name} size={30} color={usuario.color}/>
            <button onClick={logout} style={{background:"none",border:"none",color:"#9CA3AF",cursor:"pointer",fontSize:12}}>salir</button>
            {vista==="tareas"&&perms.crearTareas&&(
              <button onClick={()=>{setEditTask(null);setShowModal(true);}} style={{background:"#E8622A",border:"none",borderRadius:8,padding:"7px 14px",color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer",boxShadow:"0 4px 12px rgba(232,98,42,0.25)",whiteSpace:"nowrap"}}>+ Nueva tarea</button>
            )}
          </div>
        </div>
      </div>

      <div style={{display:"flex",flex:1,maxWidth:1100,margin:"0 auto",width:"100%"}}>
        <div style={{width:182,background:"#fff",borderRight:"1px solid #F0F1F3",padding:"16px 0",flexShrink:0,minHeight:"calc(100vh - 54px)"}}>
          <div style={{padding:"0 12px",marginBottom:14}}>
            <div style={{display:"flex",alignItems:"center",gap:8,background:"#F9FAFB",borderRadius:8,padding:"8px 10px"}}>
              <Avatar name={usuario.name} size={26} color={usuario.color}/>
              <div style={{overflow:"hidden"}}>
                <div style={{fontSize:12,fontWeight:600,color:"#111",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{usuario.name}</div>
                <div style={{fontSize:10,color:"#9CA3AF"}}>{usuario.role==="owner"?"Director":usuario.role==="assistant"?"Asistente":"Equipo"}</div>
              </div>
            </div>
          </div>
          <div style={{padding:"0 12px 4px"}}><div style={{fontSize:9,color:"#D1D5DB",fontWeight:700,letterSpacing:1,marginBottom:4}}>TAREAS</div></div>
          {navItem("tareas","Mis tareas","📋",perms.verTodasTareas?vencidas.length:0)}
          {perms.verEquipo&&navItem("equipo","Equipo","👷")}
          {perms.verProyectos&&navItem("proyectos","Proyectos","🏗")}
          {proyectosConFinanzas.length>0&&(
            <>
              <div style={{padding:"12px 12px 4px",marginTop:4}}><div style={{fontSize:9,color:"#D1D5DB",fontWeight:700,letterSpacing:1,marginBottom:4}}>FINANZAS</div></div>
              {perms.verDashboard&&navItem("finanzas-dashboard","Dashboard","📊")}
              {proyectosConFinanzas.map(p=>(
                <button key={p.id} onClick={()=>{setVista("finanzas-proyecto");setProyFin(p.id);}}
                  style={{width:"100%",background:vista==="finanzas-proyecto"&&proyFin===p.id?"#FFF4F0":"transparent",border:"none",borderRight:vista==="finanzas-proyecto"&&proyFin===p.id?"3px solid #E8622A":"3px solid transparent",padding:"6px 14px 6px 24px",display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontFamily:"'Inter',sans-serif",fontSize:12,fontWeight:vista==="finanzas-proyecto"&&proyFin===p.id?600:400,color:vista==="finanzas-proyecto"&&proyFin===p.id?"#E8622A":"#9CA3AF",textAlign:"left"}}>
                  <div style={{width:6,height:6,borderRadius:"50%",background:p.color,flexShrink:0}}/><span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</span>
                </button>
              ))}
            </>
          )}
          {perms.verTodasTareas&&(
            <div style={{margin:"14px 12px 0",paddingTop:14,borderTop:"1px solid #F0F1F3"}}>
              <div style={{fontSize:10,color:"#9CA3AF",fontWeight:600,letterSpacing:0.5,marginBottom:8}}>HOY</div>
              {[{l:"Activas",v:pendientes.length,c:"#374151"},{l:"Urgentes",v:urgentes.length,c:"#DC2626"}].map(s=>(
                <div key={s.l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                  <span style={{fontSize:12,color:"#6B7280"}}>{s.l}</span><span style={{fontSize:13,fontWeight:700,color:s.c}}>{s.v}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{flex:1,padding:"18px 20px",overflowY:"auto",minHeight:"calc(100vh - 54px)"}}>

          {vista==="tareas"&&(
            <>
              {perms.usarNova&&<NovaInput currentUser={usuario} projects={projects} users={users} onTaskCreated={fetchTareas}/>}
              <div style={{display:"flex",gap:6,marginBottom:12,overflowX:"auto",paddingBottom:4}}>
                {[["todas","Todas"],["urgente","Urgentes"],["pendiente","Pendientes"],["listo","Completadas"]].map(([f,l])=>(
                  <button key={f} onClick={()=>setFiltro(f)} style={filtS(filtro===f)}>{l}</button>
                ))}
                {perms.verTodasTareas&&(
                  <select value={filtroP} onChange={e=>setFiltroP(e.target.value)} style={{background:"#fff",border:"1px solid "+(filtroP!=="all"?"#E8622A":"#E5E7EB"),borderRadius:20,color:filtroP!=="all"?"#E8622A":"#6B7280",padding:"6px 12px",fontSize:12,fontFamily:"'Inter',sans-serif",cursor:"pointer",flexShrink:0}}>
                    <option value="all">Todos los proyectos</option>
                    {projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                )}
              </div>
              {cargando?<div style={{textAlign:"center",color:"#9CA3AF",padding:"40px 0"}}>Cargando...</div>
                :visibles.length===0?<div style={{textAlign:"center",color:"#9CA3AF",padding:"60px 0"}}><div style={{fontSize:36,marginBottom:10}}>🏗</div>{perms.crearTareas?"Sin tareas. Toca Nueva tarea o dile a NOVA.":"No tienes tareas asignadas."}</div>
                :visibles.sort((a,bv)=>{const o={urgente:0,alta:1,media:2,baja:3};if(a.status==="listo"&&bv.status!=="listo")return 1;if(bv.status==="listo"&&a.status!=="listo")return -1;return(o[a.priority]-o[bv.priority])||(daysUntil(a.due_date)-daysUntil(bv.due_date));}).map(t=>(
                  <TarjetaTarea key={t.id} task={t} currentUser={usuario} users={users} projects={projects} onCambiarEstado={cambiarEstado} onEditar={t2=>{setEditTask(t2);setShowModal(true);}} onEliminar={eliminarTarea}/>
                ))}
            </>
          )}

          {vista==="equipo"&&(perms.verEquipo?(
            <div style={{display:"grid",gap:10}}>
              {users.map(m=>{
                const mt=tareas.filter(t=>t.assignee_id===m.id&&t.status!=="listo");const mo=mt.filter(t=>daysUntil(t.due_date)<0);const mb=rolBadge(m.role);
                return(<div key={m.id} style={{background:"#fff",borderRadius:12,padding:14,border:"1px solid #E5E7EB"}}>
                  <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:mt.length?12:0}}>
                    <Avatar name={m.name} size={40} color={mo.length>0?"#DC2626":m.color}/>
                    <div style={{flex:1}}><div style={{fontWeight:700,fontSize:14}}>{m.name}</div><span style={{background:mb.bg,color:mb.color,fontSize:10,fontWeight:700,padding:"2px 6px",borderRadius:10}}>{mb.label}</span></div>
                    <div style={{textAlign:"right"}}><div style={{color:mo.length>0?"#DC2626":"#E8622A",fontSize:20,fontWeight:700}}>{mt.length}</div><div style={{color:"#9CA3AF",fontSize:9,fontWeight:600}}>ABIERTAS</div></div>
                  </div>
                  {mt.map(t=><div key={t.id} style={{background:"#F9FAFB",borderRadius:8,padding:"7px 10px",marginBottom:5,display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontSize:12,fontWeight:500}}>{t.title}</div><div style={{fontSize:11,color:"#9CA3AF"}}>{projects.find(p=>p.id===t.project_id)?.name}</div></div><FechaBadge due={t.due_date} status={t.status}/></div>)}
                  {mt.length===0&&<div style={{color:"#9CA3AF",fontSize:12,textAlign:"center",padding:"4px 0"}}>Sin pendientes</div>}
                </div>);
              })}
            </div>
          ):<AccesoDenegado/>)}

          {vista==="proyectos"&&(perms.verProyectos?(
            <div style={{display:"grid",gap:10}}>
              {projects.map(p=>{
                const pt=tareas.filter(t=>t.project_id===p.id);const pOk=pt.filter(t=>t.status==="listo");const av=pt.length>0?Math.round((pOk.length/pt.length)*100):0;
                return(<div key={p.id} style={{background:"#fff",borderRadius:12,padding:14,border:"1px solid #E5E7EB",borderLeft:"4px solid "+p.color}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                    <div style={{fontWeight:700,fontSize:14}}>{p.name}</div>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      <div style={{color:p.color,fontSize:16,fontWeight:700}}>{av}%</div>
                      {p.tieneFinanzas!==false&&<button onClick={()=>{setVista("finanzas-proyecto");setProyFin(p.id);}} style={{background:"#FFF4F0",border:"1px solid #FED7AA",borderRadius:6,padding:"4px 10px",color:"#E8622A",fontSize:11,fontWeight:600,cursor:"pointer"}}>Finanzas</button>}
                      {perms.verAjustes&&<button onClick={()=>toggleFinanzas(p.id)} style={{background:p.tieneFinanzas!==false?"#F0FDF4":"#F3F4F6",border:"1px solid "+(p.tieneFinanzas!==false?"#BBF7D0":"#E5E7EB"),borderRadius:6,padding:"4px 8px",color:p.tieneFinanzas!==false?"#059669":"#9CA3AF",fontSize:10,cursor:"pointer"}}>{p.tieneFinanzas!==false?"Fin ON":"Fin OFF"}</button>}
                    </div>
                  </div>
                  <div style={{background:"#F3F4F6",borderRadius:4,height:6,marginBottom:8}}><div style={{background:p.color,height:6,borderRadius:4,width:av+"%"}}/></div>
                  <div style={{display:"flex",gap:16}}>
                    <span style={{fontSize:12,color:"#6B7280"}}><span style={{color:p.color,fontWeight:700}}>{pt.filter(t=>t.status!=="listo").length}</span> abiertas</span>
                    <span style={{fontSize:12,color:"#6B7280"}}><span style={{color:"#059669",fontWeight:700}}>{pOk.length}</span> completadas</span>
                  </div>
                </div>);
              })}
            </div>
          ):<AccesoDenegado/>)}

          {vista==="finanzas-dashboard"&&(perms.verDashboard?(
            <div>
              <div style={{fontSize:15,fontWeight:700,color:"#111",marginBottom:14}}>Resumen Financiero</div>
              {proyectosConFinanzas.map(p=>{
                const rubros=loadLS("fin_rubros_"+p.id,RUBROS_DEFAULT);const facts=loadLS("fin_facturas_"+p.id,[]);
                const presup=rubros.reduce((s,r)=>s+Number(r.presupuesto||0),0);const ejec=facts.reduce((s,f)=>s+Number(f.monto||0),0);
                if(presup===0)return null;const sd=presup-ejec;
                return(<div key={p.id} onClick={()=>{setVista("finanzas-proyecto");setProyFin(p.id);}} style={{background:"#fff",borderRadius:12,padding:"12px 16px",marginBottom:10,border:"1px solid #F0F1F3",borderLeft:"4px solid "+p.color,cursor:"pointer"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                    <div style={{fontWeight:700,fontSize:14}}>{p.name}</div>
                    <span style={{background:sd<0?"#FEE2E2":"#F0FDF4",color:sd<0?"#DC2626":"#059669",fontSize:12,fontWeight:700,padding:"2px 10px",borderRadius:20}}>{sd<0?"-"+fmt(Math.abs(sd)):"+"+fmt(sd)}</span>
                  </div>
                  <div style={{display:"flex",gap:16,marginBottom:6,flexWrap:"wrap"}}>
                    <span style={{fontSize:12,color:"#6B7280"}}>Ppto: <strong>{fmt(presup)}</strong></span>
                    <span style={{fontSize:12,color:"#6B7280"}}>Ejec: <strong style={{color:"#D97706"}}>{fmt(ejec)}</strong></span>
                    <span style={{fontSize:12,color:"#6B7280"}}>Avance: <strong style={{color:p.color}}>{pct(ejec,presup)}%</strong></span>
                  </div>
                  <div style={{background:"#F3F4F6",borderRadius:4,height:6}}><div style={{background:sd<0?"#DC2626":p.color,height:6,borderRadius:4,width:Math.min(100,pct(ejec,presup))+"%"}}/></div>
                </div>);
              }).filter(Boolean)}
            </div>
          ):<AccesoDenegado/>)}

          {vista==="finanzas-proyecto"&&proyFin&&(
            <ModuloProyecto proyectoId={proyFin} proyectos={projects} currentUser={usuario}/>
          )}

        </div>
      </div>

      {showModal&&<ModalTarea editTask={editTask} currentUser={usuario} users={users} projects={projects} onCerrar={()=>{setShowModal(false);setEditTask(null);}} onGuardar={guardarTarea}/>}

      {showAjustes&&perms.verAjustes&&<PanelAjustes users={users} setUsers={setUsers} projects={projects} setProjects={setProjects} empresa={empresa} setEmpresa={setEmpresa} onClose={()=>setShowAjustes(false)}/>}
    </div>
  );
}
