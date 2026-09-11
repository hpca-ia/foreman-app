import { useState, useRef, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { esAdmin, puedeControlObra, rolInfo } from "../lib/roles";
import { buscarDuplicados, hashArchivo } from "./controlObra/duplicados";
import AlertaDuplicado from "./controlObra/AlertaDuplicado";
import ReporteCaja from "./cajaChica/ReporteCaja";
import { comprimirImagen, pesoLegible } from "../lib/imagenes";

export default function ModuloCajaChica({ currentUser, projects, users }) {
  const [subVista, setSubVista] = useState("lista");
  const [cajas, setCajas] = useState([]);
  const [cajaActiva, setCajaActiva] = useState(null);
  const [gastos, setGastos] = useState([]);
  const [anticipos, setAnticipos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [novaLeyendo, setNovaLeyendo] = useState(false);
  const [gastoForm, setGastoForm] = useState({ descripcion:"", proveedor:"", ruc:"", numero_factura:"", monto:"", fecha:new Date().toISOString().split("T")[0], tipo:"factura", notas:"", presupuesto_id:"" });
  const [novaError, setNovaError] = useState("");
  const [dupsGasto, setDupsGasto] = useState({exactos:[],posibles:[]});
  const [dupJustificacion, setDupJustificacion] = useState("");
  const [archivoHash, setArchivoHash] = useState(null);
  const [pesoOriginal, setPesoOriginal] = useState("");
  const [anticipoForm, setAnticipoForm] = useState({ monto:"", descripcion:"", fecha:new Date().toISOString().split("T")[0] });
  const [nuevaCajaForm, setNuevaCajaForm] = useState({ obra_id:"", proyecto_nombre:"", responsable_id:"", responsable_nombre:"", limite_alerta:50 });
  const [obras, setObras] = useState([]);
  const [archivoGasto, setArchivoGasto] = useState(null);
  const [archivoPreview, setArchivoPreview] = useState(null);
  const [presupuestosProyecto, setPresupuestosProyecto] = useState([]);
  const [capitulosPresupuesto, setCapitulosPresupuesto] = useState([]);
  const [capitulosSeleccionados, setCapitulosSeleccionados] = useState([]);
  const fileRef = useRef(null);
  const admin = esAdmin(currentUser.role);
  const gerente = puedeControlObra(currentUser.role);
  const fmt = n => (Number(n)||0).toLocaleString("es-EC",{minimumFractionDigits:2,maximumFractionDigits:2});
  const iS = {width:"100%",background:"var(--bg)",border:"1px solid var(--border)",borderRadius:8,color:"var(--ink)",padding:"9px 12px",fontSize:13,fontFamily:"var(--font)",boxSizing:"border-box",outline:"none"};

  useEffect(() => { fetchCajas(); fetchObras(); }, []);
  async function fetchObras() {
    const { data } = await supabase.from("obras").select("id,nombre").eq("estado","activa").order("created_at",{ascending:false});
    setObras(data||[]);
  }
  async function fetchCajas() {
    let q = supabase.from("cajas_chicas").select("*").order("created_at",{ascending:false});
    if (!admin && !gerente) q = q.eq("responsable_id", currentUser.id);
    const { data } = await q; setCajas(data||[]);
  }
  async function fetchGastos(id) { const { data } = await supabase.from("cajas_gastos").select("*").eq("caja_id",id).order("fecha",{ascending:false}); setGastos(data||[]); }
  async function fetchPresupuestosProyecto(proyectoNombre) {
    const { data } = await supabase.from("presupuestos").select("id,nombre,cliente_nombre").ilike("cliente_nombre",`%${proyectoNombre}%`).order("created_at",{ascending:false});
    setPresupuestosProyecto(data||[]);
  }
  async function fetchCapitulosPresupuesto(presupuestoId) {
    const { data } = await supabase.from("presupuesto_items").select("capitulo").eq("presupuesto_id",presupuestoId);
    const caps=[...new Set((data||[]).map(i=>i.capitulo).filter(Boolean))].sort();
    setCapitulosPresupuesto(caps);
    setCapitulosSeleccionados([]);
  }
  async function fetchAnticipos(id) { const { data } = await supabase.from("cajas_anticipos").select("*").eq("caja_id",id).order("fecha",{ascending:false}); setAnticipos(data||[]); }

  async function crearCaja() {
    const resUser = users.find(u=>u.id===Number(nuevaCajaForm.responsable_id));
    const { data, error } = await supabase.from("cajas_chicas").insert({
      proyecto_nombre:nuevaCajaForm.proyecto_nombre, obra_id:Number(nuevaCajaForm.obra_id)||null, responsable_id:Number(nuevaCajaForm.responsable_id),
      responsable_nombre:resUser?.name||"", limite_alerta:Number(nuevaCajaForm.limite_alerta)||50, created_by:currentUser.id
    }).select().single();
    if (!error && data) { setCajaActiva(data); setGastos([]); setAnticipos([]); setSubVista("detalle"); fetchCajas(); fetchPresupuestosProyecto(data.proyecto_nombre); }
  }

  async function agregarAnticipo() {
    if (!cajaActiva||!anticipoForm.monto) return;
    const { data } = await supabase.from("cajas_anticipos").insert({
      caja_id:cajaActiva.id, monto:Number(anticipoForm.monto), descripcion:anticipoForm.descripcion,
      entregado_por:currentUser.id, entregado_por_nombre:currentUser.name, fecha:anticipoForm.fecha
    }).select().single();
    if (data) {
      const nuevoTotal=(cajaActiva.saldo_total||0)+Number(anticipoForm.monto);
      const nuevoDisp=nuevoTotal-(cajaActiva.saldo_gastado||0);
      await supabase.from("cajas_chicas").update({saldo_total:nuevoTotal,saldo_disponible:nuevoDisp}).eq("id",cajaActiva.id);
      setCajaActiva(prev=>({...prev,saldo_total:nuevoTotal,saldo_disponible:nuevoDisp}));
      setAnticipos(prev=>[data,...prev]);
      setAnticipoForm({monto:"",descripcion:"",fecha:new Date().toISOString().split("T")[0]});
      fetchCajas();
    }
  }

  async function leerFacturaNOVA(file, hash=null) {
    setNovaLeyendo(true); setNovaError("");
    try {
      const esImagen = file.type.startsWith("image/");
      const esPDF = file.type==="application/pdf";
      if (!esImagen && !esPDF) {
        setNovaError("NOVA lee fotos y PDFs. Para otros archivos, llena los datos a mano.");
        setNovaLeyendo(false); return;
      }
      const base64=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(",")[1]);r.onerror=rej;r.readAsDataURL(file);});
      const adjunto = esPDF
        ? {type:"document",source:{type:"base64",media_type:"application/pdf",data:base64}}
        : {type:"image",source:{type:"base64",media_type:file.type,data:base64}};
      const content=[adjunto,{type:"text",text:'Lee esta factura de Ecuador. SOLO JSON, sin markdown: {"descripcion":"","proveedor":"","ruc":"","numero_factura":"","monto":0,"fecha":"YYYY-MM-DD","tipo":"factura|recibo|otro"}. "numero_factura" es el número impreso de la factura (formato 001-001-000000123). "monto" es el TOTAL a pagar.'}];
      const res=await fetch("/api/nova",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-5",max_tokens:700,messages:[{role:"user",content}]})});
      if (!res.ok) { setNovaError(`NOVA no respondió (error ${res.status}). Llena los datos a mano.`); setNovaLeyendo(false); return; }
      const d=await res.json();
      if (d.error) { setNovaError("NOVA: "+(d.error.message||JSON.stringify(d.error))); setNovaLeyendo(false); return; }
      const texto=(d.content?.[0]?.text||"").replace(/```json|```/g,"").trim();
      let parsed=null;
      try { parsed=JSON.parse(texto); } catch { const m=texto.match(/\{[\s\S]*\}/); if(m) try{parsed=JSON.parse(m[0]);}catch{} }
      if (!parsed) { setNovaError("NOVA no pudo leer esta factura. Llena los datos a mano."); setNovaLeyendo(false); return; }
      setGastoForm(prev=>({...prev,
        descripcion:parsed.descripcion||prev.descripcion, proveedor:parsed.proveedor||prev.proveedor,
        ruc:parsed.ruc||prev.ruc, numero_factura:parsed.numero_factura||prev.numero_factura,
        monto:parsed.monto||prev.monto, fecha:parsed.fecha||prev.fecha, tipo:parsed.tipo||prev.tipo}));
      await revisarDuplicadosGasto({ruc:parsed.ruc,numero_factura:parsed.numero_factura,proveedor:parsed.proveedor,monto:parsed.monto,fecha:parsed.fecha}, hash);
    } catch(e) { setNovaError("Error leyendo el archivo: "+e.message); }
    setNovaLeyendo(false);
  }

  async function handleFileSelect(e) {
    const original=e.target.files[0]; if(!original) return;
    // El hash va sobre el archivo original: es la identidad del documento.
    const h = await hashArchivo(original); setArchivoHash(h);
    const file = await comprimirImagen(original);
    setArchivoGasto(file);
    setPesoOriginal(original.size!==file.size ? `${pesoLegible(original.size)} → ${pesoLegible(file.size)}` : "");
    if(file.type.startsWith("image/")){setArchivoPreview(URL.createObjectURL(file));}else{setArchivoPreview(null);}
    await leerFacturaNOVA(file, h); e.target.value="";
  }

  // Misma detección que en Control de Obra: exacta, no interpretativa.
  async function revisarDuplicadosGasto(extra={}, hash=archivoHash) {
    if (!cajaActiva?.obra_id) return;
    const d = {...gastoForm, ...extra};
    if (!d.numero_factura && !d.proveedor && !hash) { setDupsGasto({exactos:[],posibles:[]}); return; }
    const r = await buscarDuplicados({ obraId:cajaActiva.obra_id, ruc:d.ruc, numeroFactura:d.numero_factura,
      razonSocial:d.proveedor, monto:d.monto, fecha:d.fecha, archivoHash:hash });
    setDupsGasto(r);
  }

  async function agregarGasto() {
    if (!cajaActiva||!gastoForm.monto||!gastoForm.descripcion) return;
    if (dupsGasto.exactos.length && !dupJustificacion.trim()) {
      setNovaError("Esta factura ya está cargada en la obra. Explica por qué no es un duplicado para poder guardarla.");
      return;
    }
    setUploading(true);
    let archivoUrl=null, archivoNombre=null;
    if (archivoGasto) {
      const safeName=archivoGasto.name.replace(/[^a-zA-Z0-9._-]/g,"_");
      const path=`caja-${cajaActiva.id}/${Date.now()}-${safeName}`;
      const{error}=await supabase.storage.from("task-files").upload(path,archivoGasto,{upsert:false});
      if(!error){const{data:u}=supabase.storage.from("task-files").getPublicUrl(path);archivoUrl=u.publicUrl;archivoNombre=archivoGasto.name;}
    }
    const monto=Number(gastoForm.monto);
    const capitulosList = capitulosSeleccionados.length>0 ? capitulosSeleccionados : ["SIN CLASIFICAR"];
    const{data}=await supabase.from("cajas_gastos").insert({
      caja_id:cajaActiva.id,descripcion:gastoForm.descripcion,proveedor:gastoForm.proveedor,ruc:gastoForm.ruc||null,numero_factura:gastoForm.numero_factura||null,monto,
      capitulo:capitulosList.join(", "),proyecto_nombre:cajaActiva.proyecto_nombre,fecha:gastoForm.fecha,
      tipo:gastoForm.tipo,archivo_url:archivoUrl,archivo_nombre:archivoNombre,notas:gastoForm.notas,
      subido_por:currentUser.id,subido_por_nombre:currentUser.name
    }).select().single();
    if(data){
      // El gasto entra al control de la obra como factura "por asignar":
      // nadie le pone rubro desde el celular, se asigna después en Control de Obra.
      if (cajaActiva.obra_id) {
        const {data:planillaAbierta} = await supabase.from("planillas")
          .select("id").eq("obra_id",cajaActiva.obra_id).eq("estado","abierta")
          .order("numero",{ascending:false}).limit(1).maybeSingle();
        const {data:facturaObra} = await supabase.from("obra_facturas").insert({
          obra_id:cajaActiva.obra_id, planilla_id:planillaAbierta?.id||null,
          fecha:gastoForm.fecha, tipo_documento:(gastoForm.tipo||"factura").toUpperCase(),
          razon_social:gastoForm.proveedor||null, ruc:gastoForm.ruc||null,
          numero_factura:gastoForm.numero_factura||null, archivo_hash:archivoHash||null,
          duplicado_de:dupsGasto.exactos[0]?.id||null,
          duplicado_justificacion:dupsGasto.exactos.length?dupJustificacion.trim():null,
          detalle:gastoForm.descripcion,
          justificacion:gastoForm.notas||null, total:monto, subtotal_15:monto,
          tipo:"material", archivo_url:archivoUrl, archivo_nombre:archivoNombre,
          origen:"caja_chica", caja_gasto_id:data.id,
          subido_por:currentUser.id, subido_por_nombre:currentUser.name
        }).select().single();
        if (facturaObra) await supabase.from("cajas_gastos").update({obra_factura_id:facturaObra.id}).eq("id",data.id);
      }
      const nuevoGastado=(cajaActiva.saldo_gastado||0)+monto;
      const nuevoDisp=(cajaActiva.saldo_total||0)-nuevoGastado;
      await supabase.from("cajas_chicas").update({saldo_gastado:nuevoGastado,saldo_disponible:nuevoDisp}).eq("id",cajaActiva.id);
      setCajaActiva(prev=>({...prev,saldo_gastado:nuevoGastado,saldo_disponible:nuevoDisp}));
      setGastos(prev=>[data,...prev]);
      setGastoForm({descripcion:"",proveedor:"",ruc:"",numero_factura:"",monto:"",fecha:new Date().toISOString().split("T")[0],tipo:"factura",notas:"",presupuesto_id:""});
      setDupsGasto({exactos:[],posibles:[]}); setDupJustificacion(""); setArchivoHash(null); setNovaError("");
      setCapitulosSeleccionados([]);
      setArchivoGasto(null);setArchivoPreview(null);fetchCajas();
      if(nuevoDisp<=(cajaActiva.limite_alerta||50))alert(`⚠️ Saldo bajo en caja de ${cajaActiva.responsable_nombre}: $${fmt(nuevoDisp)} — Johanna debe revisar.`);
    }
    setUploading(false);
  }

  async function aprobarGasto(id) {
    await supabase.from("cajas_gastos").update({estado:"aprobado",aprobado_por:currentUser.id,aprobado_por_nombre:currentUser.name}).eq("id",id);
    setGastos(prev=>prev.map(g=>g.id===id?{...g,estado:"aprobado"}:g));
  }

  const saldoColor=c=>c>(cajaActiva?.limite_alerta||50)*2?"var(--success)":c>(cajaActiva?.limite_alerta||50)?"var(--warning)":"var(--danger)";

  return(
    <div style={{fontFamily:"var(--font)"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:8}}>
        <div style={{fontSize:17,fontWeight:700,color:"var(--ink)"}}>
          {subVista==="lista"?"Caja Chica":subVista==="nueva"?"Nueva caja":subVista==="gasto"?"Nuevo gasto":subVista==="anticipo"?"Anticipo":subVista==="reporte"?"Reporte":`${cajaActiva?.proyecto_nombre} — ${cajaActiva?.responsable_nombre}`}
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {subVista!=="lista"&&<button onClick={()=>setSubVista(subVista==="reporte"?"detalle":"lista")} style={{background:"var(--neutral-soft)",border:"none",borderRadius:8,padding:"7px 12px",color:"var(--ink-soft)",fontSize:12,cursor:"pointer"}}>← Volver</button>}
          {subVista==="lista"&&admin&&<button onClick={()=>setSubVista("nueva")} style={{background:"var(--brand)",border:"none",borderRadius:8,padding:"7px 12px",color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}>+ Nueva caja</button>}
          {subVista==="detalle"&&<>
            {admin&&<button onClick={()=>setSubVista("anticipo")} style={{background:"#7C3AED",border:"none",borderRadius:8,padding:"7px 12px",color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}>+ Anticipo</button>}
            <button onClick={()=>setSubVista("gasto")} style={{background:"var(--brand)",border:"none",borderRadius:8,padding:"7px 12px",color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}>+ Gasto</button>
            <button onClick={()=>setSubVista("reporte")} style={{background:"var(--neutral-soft)",border:"none",borderRadius:8,padding:"7px 12px",color:"var(--ink-soft)",fontSize:12,fontWeight:600,cursor:"pointer"}}>Reporte</button>
          </>}
        </div>
      </div>

      {subVista==="reporte"&&cajaActiva&&(
        <ReporteCaja caja={cajaActiva} gastos={gastos} anticipos={anticipos} usuarios={users}/>
      )}

      {subVista==="lista"&&(
        <div>
          {cajas.length===0?<div style={{textAlign:"center",padding:"60px 0",color:"var(--muted)"}}><div style={{fontSize:40,marginBottom:12}}>💰</div>Sin cajas chicas.</div>
          :cajas.map(c=>(
            <div key={c.id} onClick={()=>{setCajaActiva(c);fetchGastos(c.id);fetchAnticipos(c.id);fetchPresupuestosProyecto(c.proyecto_nombre);setSubVista("detalle");}}
              style={{background:"#fff",border:"1px solid var(--border)",borderRadius:10,padding:"14px 16px",marginBottom:8,cursor:"pointer"}}
              onMouseEnter={e=>e.currentTarget.style.borderColor="var(--brand)"} onMouseLeave={e=>e.currentTarget.style.borderColor="var(--border)"}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div><div style={{fontWeight:600,color:"var(--ink)",fontSize:14}}>{c.proyecto_nombre}</div>
                  <div style={{fontSize:12,color:"var(--ink-soft)",marginTop:2}}>🏗 {c.responsable_nombre}</div></div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:10,color:"var(--ink-soft)"}}>Saldo disponible</div>
                  <div style={{fontWeight:700,fontSize:18,color:saldoColor(c.saldo_disponible)}}>${fmt(c.saldo_disponible)}</div>
                  <div style={{fontSize:10,color:"var(--muted)"}}>de ${fmt(c.saldo_total)}</div>
                </div>
              </div>
              <div style={{marginTop:8,background:"var(--neutral-soft)",borderRadius:4,height:5}}>
                <div style={{background:saldoColor(c.saldo_disponible),height:5,borderRadius:4,width:`${Math.min(100,(c.saldo_disponible/(c.saldo_total||1))*100)}%`}}/>
              </div>
            </div>
          ))}
        </div>
      )}

      {subVista==="nueva"&&(
        <div style={{background:"#fff",borderRadius:12,padding:20,border:"1px solid var(--border)"}}>
          <div style={{display:"grid",gap:14}}>
            <div><label style={{fontSize:11,color:"var(--ink-soft)",fontWeight:500,display:"block",marginBottom:4}}>Obra *</label>
              <select value={nuevaCajaForm.obra_id} onChange={e=>{const o=obras.find(x=>x.id===Number(e.target.value));setNuevaCajaForm(p=>({...p,obra_id:e.target.value,proyecto_nombre:o?.nombre||""}));}} style={iS}>
                <option value="">Selecciona la obra...</option>
                {obras.map(o=><option key={o.id} value={o.id}>{o.nombre}</option>)}
              </select>
              <div style={{fontSize:10,color:"var(--muted)",marginTop:4}}>Los gastos de esta caja entran al control de esa obra como facturas por asignar.</div>
              {obras.length===0&&<div style={{fontSize:11,color:"var(--warning)",marginTop:4}}>No hay obras en curso. Crea una primero en Control de Obra.</div>}</div>
            <div><label style={{fontSize:11,color:"var(--ink-soft)",fontWeight:500,display:"block",marginBottom:4}}>Responsable *</label>
              <select value={nuevaCajaForm.responsable_id} onChange={e=>{const u=users.find(x=>x.id===Number(e.target.value));setNuevaCajaForm(p=>({...p,responsable_id:e.target.value,responsable_nombre:u?.name||""}));}} style={iS}>
                <option value="">Selecciona...</option>
                {users.map(u=><option key={u.id} value={u.id}>{u.name} — {rolInfo(u.role).label}</option>)}
              </select></div>
            <div><label style={{fontSize:11,color:"var(--ink-soft)",fontWeight:500,display:"block",marginBottom:4}}>Alerta cuando saldo baje de ($)</label>
              <input type="number" value={nuevaCajaForm.limite_alerta} onChange={e=>setNuevaCajaForm(p=>({...p,limite_alerta:e.target.value}))} style={iS}/></div>
          </div>
          <button onClick={crearCaja} disabled={!nuevaCajaForm.obra_id||!nuevaCajaForm.responsable_id}
            style={{width:"100%",marginTop:16,background:nuevaCajaForm.obra_id&&nuevaCajaForm.responsable_id?"var(--brand)":"var(--neutral-soft)",border:"none",borderRadius:10,padding:12,color:nuevaCajaForm.obra_id&&nuevaCajaForm.responsable_id?"#fff":"var(--muted)",fontSize:14,fontWeight:600,cursor:"pointer"}}>
            Crear caja chica →
          </button>
        </div>
      )}

      {subVista==="anticipo"&&(
        <div style={{background:"#fff",borderRadius:12,padding:20,border:"1.5px solid #7C3AED"}}>
          <div style={{fontSize:14,fontWeight:600,color:"#7C3AED",marginBottom:14}}>Registrar anticipo para {cajaActiva?.responsable_nombre}</div>
          <div style={{display:"grid",gap:14}}>
            <div><label style={{fontSize:11,color:"var(--ink-soft)",fontWeight:500,display:"block",marginBottom:4}}>Monto *</label>
              <input type="number" value={anticipoForm.monto} onChange={e=>setAnticipoForm(p=>({...p,monto:e.target.value}))} placeholder="$0.00" style={iS}/></div>
            <div><label style={{fontSize:11,color:"var(--ink-soft)",fontWeight:500,display:"block",marginBottom:4}}>Descripción</label>
              <input value={anticipoForm.descripcion} onChange={e=>setAnticipoForm(p=>({...p,descripcion:e.target.value}))} placeholder="Anticipo semana, etc." style={iS}/></div>
            <div><label style={{fontSize:11,color:"var(--ink-soft)",fontWeight:500,display:"block",marginBottom:4}}>Fecha</label>
              <input type="date" value={anticipoForm.fecha} onChange={e=>setAnticipoForm(p=>({...p,fecha:e.target.value}))} style={iS}/></div>
          </div>
          <button onClick={()=>{agregarAnticipo();setSubVista("detalle");}} disabled={!anticipoForm.monto}
            style={{width:"100%",marginTop:16,background:anticipoForm.monto?"#7C3AED":"var(--neutral-soft)",border:"none",borderRadius:10,padding:12,color:anticipoForm.monto?"#fff":"var(--muted)",fontSize:14,fontWeight:600,cursor:"pointer"}}>
            Registrar anticipo
          </button>
        </div>
      )}

      {subVista==="gasto"&&(
        <div style={{background:"#fff",borderRadius:12,padding:20,border:"1px solid var(--border)"}}>
          <div style={{fontSize:14,fontWeight:600,color:"var(--ink)",marginBottom:14}}>Nuevo gasto — {cajaActiva?.proyecto_nombre}</div>
          <div style={{background:"var(--brand-soft)",border:"1.5px solid var(--border)",borderRadius:10,padding:12,marginBottom:14}}>
            <div style={{fontSize:12,fontWeight:600,color:"var(--brand)",marginBottom:6}}>🤖 NOVA lee tu factura</div>
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
              <button onClick={()=>fileRef.current?.click()} style={{background:"var(--brand)",border:"none",borderRadius:8,padding:"8px 14px",color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}>📷 Subir factura</button>
              <input ref={fileRef} type="file" accept="image/*,.pdf" onChange={handleFileSelect} style={{display:"none"}}/>
              {novaLeyendo&&<span style={{fontSize:12,color:"var(--brand)"}}>🤖 Leyendo...</span>}
              {archivoGasto&&!novaLeyendo&&<span style={{fontSize:11,color:"var(--success)"}}>✓ {archivoGasto.name}{pesoOriginal&&<span style={{color:"var(--muted)"}}> · {pesoOriginal}</span>}</span>}
            </div>
            {archivoPreview&&<img src={archivoPreview} alt="preview" style={{width:"100%",maxHeight:140,objectFit:"contain",borderRadius:8,marginTop:8,border:"1px solid var(--border)"}}/>}
            {novaError&&<div style={{background:"var(--danger-soft)",border:"1px solid var(--danger-border)",borderRadius:8,padding:"8px 10px",marginTop:8,fontSize:12,color:"var(--danger)"}}>{novaError}</div>}
          </div>

          <AlertaDuplicado exactos={dupsGasto.exactos} posibles={dupsGasto.posibles} justificacion={dupJustificacion} setJustificacion={setDupJustificacion}/>
          <div style={{display:"grid",gap:12}}>
            <div><label style={{fontSize:11,color:"var(--ink-soft)",fontWeight:500,display:"block",marginBottom:4}}>Descripción *</label>
              <input value={gastoForm.descripcion} onChange={e=>setGastoForm(p=>({...p,descripcion:e.target.value}))} placeholder="¿Qué se compró?" style={iS}/></div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div><label style={{fontSize:11,color:"var(--ink-soft)",fontWeight:500,display:"block",marginBottom:4}}>Proveedor</label>
                <input value={gastoForm.proveedor} onChange={e=>setGastoForm(p=>({...p,proveedor:e.target.value}))} placeholder="Proveedor" style={iS}/></div>
              <div><label style={{fontSize:11,color:"var(--ink-soft)",fontWeight:500,display:"block",marginBottom:4}}>Monto *</label>
                <input type="number" value={gastoForm.monto} onChange={e=>setGastoForm(p=>({...p,monto:e.target.value}))} placeholder="$0.00" style={iS}/></div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div><label style={{fontSize:11,color:"var(--ink-soft)",fontWeight:500,display:"block",marginBottom:4}}>RUC</label>
                <input value={gastoForm.ruc} onChange={e=>setGastoForm(p=>({...p,ruc:e.target.value}))} onBlur={()=>revisarDuplicadosGasto()} placeholder="RUC del proveedor" style={iS}/></div>
              <div><label style={{fontSize:11,color:"var(--ink-soft)",fontWeight:500,display:"block",marginBottom:4}}>N° de factura</label>
                <input value={gastoForm.numero_factura} onChange={e=>setGastoForm(p=>({...p,numero_factura:e.target.value}))} onBlur={()=>revisarDuplicadosGasto()} placeholder="001-001-000000123" style={iS}/></div>
            </div>
            {/* Presupuesto */}
            <div><label style={{fontSize:11,color:"var(--ink-soft)",fontWeight:500,display:"block",marginBottom:4}}>Presupuesto del proyecto</label>
              <select value={gastoForm.presupuesto_id} onChange={e=>{setGastoForm(p=>({...p,presupuesto_id:e.target.value}));if(e.target.value)fetchCapitulosPresupuesto(e.target.value);else{setCapitulosPresupuesto([]);setCapitulosSeleccionados([]);}}} style={iS}>
                <option value="">Sin asignar a presupuesto</option>
                {presupuestosProyecto.map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select></div>
            {/* Capítulos */}
            {capitulosPresupuesto.length>0&&(
              <div>
                <label style={{fontSize:11,color:"var(--ink-soft)",fontWeight:500,display:"block",marginBottom:6}}>Capítulo(s) al que aplica <span style={{color:"var(--muted)"}}>(selecciona uno o varios)</span></label>
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {capitulosPresupuesto.map(cap=>{
                    const sel=capitulosSeleccionados.includes(cap);
                    return(
                      <button key={cap} onClick={()=>setCapitulosSeleccionados(prev=>sel?prev.filter(c=>c!==cap):[...prev,cap])}
                        style={{background:sel?"var(--brand)":"var(--bg)",border:`1.5px solid ${sel?"var(--brand)":"var(--border)"}`,borderRadius:20,padding:"4px 12px",fontSize:11,color:sel?"#fff":"var(--ink-soft)",cursor:"pointer",fontWeight:sel?600:400}}>
                        {sel?"✓ ":""}{cap}
                      </button>
                    );
                  })}
                </div>
                {capitulosSeleccionados.length>1&&<div style={{fontSize:10,color:"var(--muted)",marginTop:4}}>El monto se dividirá en {capitulosSeleccionados.length} capítulos (${((Number(gastoForm.monto)||0)/capitulosSeleccionados.length).toFixed(2)} c/u)</div>}
                {capitulosSeleccionados.length===0&&<div style={{fontSize:10,color:"var(--warning)",marginTop:4}}>⚠ Selecciona al menos un capítulo para el control de obra</div>}
              </div>
            )}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div><label style={{fontSize:11,color:"var(--ink-soft)",fontWeight:500,display:"block",marginBottom:4}}>Tipo</label>
                <select value={gastoForm.tipo} onChange={e=>setGastoForm(p=>({...p,tipo:e.target.value}))} style={iS}>
                  <option value="factura">Factura</option><option value="recibo">Recibo</option><option value="otro">Otro</option>
                </select></div>
              <div><label style={{fontSize:11,color:"var(--ink-soft)",fontWeight:500,display:"block",marginBottom:4}}>Fecha</label>
                <input type="date" value={gastoForm.fecha} onChange={e=>setGastoForm(p=>({...p,fecha:e.target.value}))} style={iS}/></div>
            </div>
            <div><label style={{fontSize:11,color:"var(--ink-soft)",fontWeight:500,display:"block",marginBottom:4}}>Notas</label>
              <textarea value={gastoForm.notas} onChange={e=>setGastoForm(p=>({...p,notas:e.target.value}))} style={{...iS,minHeight:50,resize:"vertical"}} placeholder="Observaciones..."/></div>
          </div>
          <button onClick={()=>{agregarGasto();setSubVista("detalle");}} disabled={!gastoForm.descripcion||!gastoForm.monto||uploading}
            style={{width:"100%",marginTop:16,background:gastoForm.descripcion&&gastoForm.monto&&!uploading?"var(--brand)":"var(--neutral-soft)",border:"none",borderRadius:10,padding:12,color:gastoForm.descripcion&&gastoForm.monto&&!uploading?"#fff":"var(--muted)",fontSize:14,fontWeight:600,cursor:"pointer"}}>
            {uploading?"Guardando...":"Registrar gasto →"}
          </button>
        </div>
      )}

      {subVista==="detalle"&&cajaActiva&&(
        <div>
          <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
            {[{l:"Total entregado",v:cajaActiva.saldo_total,c:"var(--ink-soft)",bg:"var(--neutral-soft)"},{l:"Gastado",v:cajaActiva.saldo_gastado,c:"var(--danger)",bg:"var(--danger-soft)"},{l:"Disponible",v:cajaActiva.saldo_disponible,c:saldoColor(cajaActiva.saldo_disponible),bg:"var(--success-soft)"}].map(s=>(
              <div key={s.l} style={{background:s.bg,borderRadius:10,padding:"10px 14px",flex:1,minWidth:100}}>
                <div style={{fontSize:10,color:"var(--ink-soft)",fontWeight:600,marginBottom:2}}>{s.l}</div>
                <div style={{fontSize:18,fontWeight:700,color:s.c}}>${fmt(s.v)}</div>
              </div>
            ))}
          </div>
          {cajaActiva.saldo_disponible<=cajaActiva.limite_alerta&&(
            <div style={{background:"var(--danger-soft)",border:"1.5px solid var(--danger-border)",borderRadius:10,padding:"10px 14px",marginBottom:12,display:"flex",gap:8,alignItems:"center"}}>
              <span style={{fontSize:18}}>⚠️</span>
              <div><div style={{fontSize:13,fontWeight:600,color:"var(--danger)"}}>Saldo bajo — requiere reposición</div>
                <div style={{fontSize:11,color:"var(--danger)"}}>Johanna debe revisar y entregar más dinero</div></div>
            </div>
          )}
          {anticipos.length>0&&<div style={{marginBottom:14}}>
            <div style={{fontSize:12,fontWeight:600,color:"#7C3AED",marginBottom:6}}>Anticipos</div>
            {anticipos.map(a=>(
              <div key={a.id} style={{background:"#F5F3FF",border:"1px solid #DDD6FE",borderRadius:8,padding:"8px 12px",marginBottom:5,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div><div style={{fontSize:12,color:"var(--ink)"}}>{a.descripcion||"Anticipo"}</div>
                  <div style={{fontSize:10,color:"var(--muted)"}}>{a.fecha} · {a.entregado_por_nombre}</div></div>
                <div style={{fontWeight:700,color:"#7C3AED",fontSize:13}}>${fmt(a.monto)}</div>
              </div>
            ))}
          </div>}
          <div style={{fontSize:12,fontWeight:600,color:"var(--ink-soft)",marginBottom:8}}>📋 Gastos ({gastos.length})</div>
          {gastos.length===0?<div style={{textAlign:"center",padding:"20px 0",color:"var(--muted)",fontSize:13}}>Sin gastos aún.</div>
          :gastos.map(g=>(
            <div key={g.id} style={{background:"#fff",border:`1px solid ${g.estado==="aprobado"?"var(--success-border)":"var(--border)"}`,borderRadius:10,padding:"10px 14px",marginBottom:6}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:500,color:"var(--ink)"}}>{g.descripcion}</div>
                  <div style={{fontSize:11,color:"var(--muted)",marginTop:2}}>{g.fecha} {g.proveedor?`· ${g.proveedor}`:""} {g.capitulo?`· ${g.capitulo}`:""} · {g.tipo}</div>
                  {g.archivo_url&&<a href={g.archivo_url} target="_blank" rel="noreferrer" style={{fontSize:11,color:"var(--brand)",textDecoration:"none",display:"block",marginTop:3}}>Ver archivo</a>}
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontWeight:700,color:"var(--danger)",fontSize:14}}>${fmt(g.monto)}</div>
                  <div style={{fontSize:10,color:g.estado==="aprobado"?"var(--success)":"var(--warning)",fontWeight:600,marginTop:2}}>{g.estado}</div>
                  {admin&&g.estado==="pendiente"&&<button onClick={()=>aprobarGasto(g.id)} style={{background:"var(--success)",border:"none",borderRadius:6,padding:"3px 8px",color:"#fff",fontSize:10,cursor:"pointer",marginTop:4,fontWeight:600,display:"block"}}>✓ Aprobar</button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── MÓDULO CONTROL DE OBRA ────────────────────────────────────────────────
