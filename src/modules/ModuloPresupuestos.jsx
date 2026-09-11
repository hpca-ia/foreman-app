import { useState, useRef, useEffect } from "react";
import { Trash2, Copy } from "lucide-react";
import ConfirmarBorrado from "../components/ui/ConfirmarBorrado";
import { supabase } from "../lib/supabase";
import { alimentarBase, resumenAlimentacion } from "../lib/baseRubros";
import AdminBD from "./AdminBD";
import CotizacionPanel from "./CotizacionPanel";

export default function ModuloPresupuestos({ currentUser, puede }) {
  const [subVista, setSubVista] = useState("lista");
  const [presupuestos, setPresupuestos] = useState([]);
  const [borrarPre, setBorrarPre] = useState(null);
  const [duplicando, setDuplicando] = useState(null);
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
  const [bdRubros, setBdRubros] = useState([]); // editable rubros list
  const [bdMeta, setBdMeta] = useState({ proveedor:"", cliente:"", fecha:new Date().getFullYear().toString() });
  const [modalRubro, setModalRubro] = useState(null);
  const [rubroSeleccionado, setRubroSeleccionado] = useState(null); // rubro with historial expanded
  const [busquedaRubro, setBusquedaRubro] = useState("");
  const [rubrosDB, setRubrosDB] = useState([]);
  const [nuevoCapitulo, setNuevoCapitulo] = useState("");
  const [showAddCap, setShowAddCap] = useState(false);
  const [showAdminBD, setShowAdminBD] = useState(false);
  const [form, setForm] = useState({ nombre:"", cliente_id:"", cliente_nombre:"", honorarios_pct:0, iva_pct:12, notas:"" });
  const [manualRubro, setManualRubro] = useState({ descripcion:"", unidad:"", cantidad:1, precio_unitario:0 });
  const cotizRef = useRef(null);
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
  // Un presupuesto del que ya se activó una obra no se borra: la obra copió
  // sus rubros pero lo sigue apuntando como origen, y sin él se pierde de
  // dónde salió la línea base que se está controlando.
  // Casi ningún presupuesto arranca en blanco: se parte de uno parecido y se
  // ajustan cantidades y precios. Duplicar copia los rubros pero no el estado
  // ni los totales del original — el nuevo nace en borrador, como si se
  // hubiera creado a mano.
  async function duplicarPresupuesto(pre) {
    setDuplicando(pre.id);
    const { data: nuevo, error } = await supabase.from("presupuestos").insert({
      nombre: `${pre.nombre} (copia)`,
      cliente_id: pre.cliente_id, cliente_nombre: pre.cliente_nombre,
      honorarios_pct: pre.honorarios_pct, iva_pct: pre.iva_pct,
      estado: "borrador", created_by: currentUser.id,
      subtotal: pre.subtotal, honorarios_monto: pre.honorarios_monto,
      iva_monto: pre.iva_monto, total: pre.total,
    }).select().single();
    if (error || !nuevo) { alert("No se pudo duplicar: " + (error?.message || "")); setDuplicando(null); return; }

    const { data: orig } = await supabase.from("presupuesto_items").select("*").eq("presupuesto_id", pre.id).order("orden");
    const copias = (orig || []).map(({ id, presupuesto_id, created_at, ...resto }) => ({ ...resto, presupuesto_id: nuevo.id }));
    for (let i = 0; i < copias.length; i += 100) {
      const { error: e } = await supabase.from("presupuesto_items").insert(copias.slice(i, i + 100));
      if (e) { alert("Se creó la copia pero fallaron algunos rubros: " + e.message); break; }
    }
    setDuplicando(null);
    await fetchPresupuestos();
    setPresupuestoActivo(nuevo); fetchItems(nuevo.id); setSubVista("detalle");
  }

  async function revisarPresupuesto(pre) {
    const { data: obras } = await supabase.from("obras").select("nombre").eq("presupuesto_id", pre.id);
    if ((obras || []).length) {
      return { bloqueo: `No se puede borrar: de este presupuesto se activó ${obras.length === 1 ? "la obra" : "las obras"} ${obras.map(o => o.nombre).join(", ")}. Es la línea base contra la que se mide ese control.\n\nPara borrarlo, primero hay que borrar esa obra.` };
    }
    const { data: items } = await supabase.from("presupuesto_items").select("id").eq("presupuesto_id", pre.id);
    return { bloqueo: null, detalle: [
      `${(items || []).length} rubros del presupuesto`,
      `El documento por $${fmt(pre.total)}`,
      "Los capítulos y rubros de tu base de datos NO se tocan",
    ] };
  }

  async function ejecutarBorradoPresupuesto(pre) {
    await supabase.from("presupuesto_items").delete().eq("presupuesto_id", pre.id);
    const { error } = await supabase.from("presupuestos").delete().eq("id", pre.id);
    return error;
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
    let query = supabase.from("rubros").select("*, capitulos(nombre), precios_historial(precio_unitario,cliente_nombre,fecha)").eq("activo",true);
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

  async function actualizarItemMulti(id, campos) {
    const updated = items.map(i => {
      if (i.id!==id) return i;
      const u={...i,...campos};
      u.total=(Number(u.cantidad)||0)*(Number(u.precio_unitario)||0);
      return u;
    });
    setItems(updated);
    await supabase.from("presupuesto_items").update({...campos,total:updated.find(i=>i.id===id)?.total}).eq("id",id);
    recalcTotales(updated);
  }

  async function aplicarUtilidadCapitulo(capNombre, pct) {
    const capItems = items.filter(i=>i.capitulo===capNombre);
    const updated = items.map(i => {
      if (i.capitulo!==capNombre) return i;
      const base = i.precio_base||i.precio_unitario;
      const nuevo = Number(base)*(1+pct/100);
      const u={...i,utilidad_pct:pct,precio_base:base,precio_unitario:nuevo};
      u.total=(Number(u.cantidad)||0)*nuevo;
      return u;
    });
    setItems(updated);
    for (const i of capItems) {
      const base=i.precio_base||i.precio_unitario;
      const nuevo=Number(base)*(1+pct/100);
      await supabase.from("presupuesto_items").update({utilidad_pct:pct,precio_base:base,precio_unitario:nuevo,total:(i.cantidad||1)*nuevo}).eq("id",i.id);
    }
    recalcTotales(updated);
  }

  async function eliminarItem(id) {
    await supabase.from("presupuesto_items").delete().eq("id",id);
    const u=items.filter(i=>i.id!==id); setItems(u); recalcTotales(u);
  }

  async function recalcTotales(itemsList, overrides={}) {
    if (!presupuestoActivo) return;
    const subtotal=itemsList.reduce((s,i)=>s+(Number(i.total)||0),0);
    const hPct = overrides.honorarios_pct ?? presupuestoActivo.honorarios_pct ?? 0;
    const ivaPct = overrides.iva_pct ?? presupuestoActivo.iva_pct ?? 12;
    const honorarios_monto=subtotal*(Number(hPct)||0)/100;
    const base_iva=subtotal+honorarios_monto;
    const iva_monto=base_iva*(Number(ivaPct)||0)/100;
    const total=base_iva+iva_monto;
    const upd={...presupuestoActivo,...overrides,subtotal,honorarios_monto,iva_monto,total};
    setPresupuestoActivo(upd);
    await supabase.from("presupuestos").update({subtotal,honorarios_monto,iva_monto,total}).eq("id",presupuestoActivo.id);
  }

  async function leerCotizacion(e) {
    const file=e.target.files[0]; if(!file) return;
    setUploadingCotizacion(true); setCotizacionResult(null);
    const prompt = 'Extrae todos los rubros. Responde UNICAMENTE con JSON valido, sin texto adicional, sin markdown: {"proveedor":"nombre o vacio","rubros":[{"descripcion":"texto","unidad":"m2 o u o glb etc","cantidad":1,"precio_unitario":0.00}]}';
    try {
      const base64=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(",")[1]);r.onerror=rej;r.readAsDataURL(file);});
      let msgContent;
      if (file.type.startsWith("image/")) {
        msgContent=[{type:"image",source:{type:"base64",media_type:file.type,data:base64}},{type:"text",text:prompt}];
      } else if (file.type==="application/pdf") {
        msgContent=[{type:"document",source:{type:"base64",media_type:"application/pdf",data:base64}},{type:"text",text:prompt}];
      } else if (file.name.match(/\.(xlsx|xls|csv)$/i)) {
        const XLSX = await import("https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs");
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, {type:"array"});
        let csvText = "";
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          csvText += XLSX.utils.sheet_to_csv(sheet);
        }
        msgContent=[{type:"text",text:"Excel:\n\n"+csvText.slice(0,15000)+"\n\n"+prompt}];
      } else {
        const text=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsText(file);});
        msgContent=[{type:"text",text:"Archivo:\n\n"+text.slice(0,8000)+"\n\n"+prompt}];
      }
      const res=await fetch("/api/nova",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-5",max_tokens:8000,messages:[{role:"user",content:msgContent}]})});
      const data=await res.json();
      console.log("NOVA response:", JSON.stringify(data).slice(0,500));
      if(data.error){setCotizacionResult({error:"Error API: "+JSON.stringify(data.error)});setUploadingCotizacion(false);e.target.value="";return;}
      const rawText=(data.content?.[0]?.text||"").trim();
      console.log("NOVA text:", rawText.slice(0,300));
      if(!rawText){setCotizacionResult({error:"NOVA no devolvió respuesta. Intenta con una imagen más clara."});setUploadingCotizacion(false);e.target.value="";return;}
      // Parse JSON robustly
      let parsed=null;
      try {
        // Remove markdown fences
        let clean=rawText.replace(/```json|```/g,"").trim();
        // Try direct parse
        try { parsed=JSON.parse(clean); } catch {
          // Find JSON object in text
          const start=clean.indexOf("{");
          const end=clean.lastIndexOf("}");
          if(start>=0&&end>start) {
            try { parsed=JSON.parse(clean.slice(start,end+1)); } catch {}
          }
        }
      } catch(pe) { console.error("Parse error:",pe); }
      
      if(!parsed||!parsed.rubros||parsed.rubros.length===0){
        // Try to build from partial response
        if(parsed&&parsed.rubros) {
          setCotizacionResult({error:"NOVA extrajo 0 rubros del archivo."});
        } else {
          setCotizacionResult({error:"Error parseando respuesta de NOVA: "+rawText.slice(0,300)});
        }
      } else {
        // Filter valid rubros
        parsed.rubros = parsed.rubros.filter(r=>r.descripcion&&r.descripcion.trim());
        setCotizacionResult(parsed);
      }
    } catch(err) { setCotizacionResult({error:"Error: "+err.message}); }
    setUploadingCotizacion(false); e.target.value="";
  }

  async function importarCotizacion() {
    if (!cotizacionResult?.rubros||!presupuestoActivo) return;
    const capNombre = "COTIZACIÓN PROVEEDOR";
    if (!capitulosActivos.find(c=>c.nombre===capNombre)) {
      setCapitulosActivos(prev=>[...prev,{nombre:capNombre,orden:prev.length+1}]);
    }
    const newItems=[];
    // Filter out empty rubros
    const rubrosValidos = cotizacionResult.rubros.filter(r=>r.descripcion&&r.descripcion.trim()&&(r.precio_unitario||r.cantidad));
    for (const r of rubrosValidos) {
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
    const prompt='Extrae rubros del presupuesto. SOLO JSON compacto sin espacios extra: {"proveedor":"","cliente":"","capitulos":["cap1"],"rubros":[{"c":"capitulo","d":"descripcion breve max 60 chars","u":"unidad","q":1,"p":0.00}]}. Abrevia descripciones largas. Incluye TODOS los rubros.';
    try {
      let msgContent;
      const isImage = file.type.startsWith("image/");
      const isPDF = file.type==="application/pdf";
      const isExcel = file.name.match(/\.(xlsx|xls|csv)$/i);

      if (isImage) {
        const base64=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(",")[1]);r.onerror=rej;r.readAsDataURL(file);});
        msgContent=[{type:"image",source:{type:"base64",media_type:file.type,data:base64}},{type:"text",text:prompt}];
      } else if (isPDF) {
        const base64=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(",")[1]);r.onerror=rej;r.readAsDataURL(file);});
        msgContent=[{type:"document",source:{type:"base64",media_type:"application/pdf",data:base64}},{type:"text",text:prompt}];
      } else if (isExcel) {
        // Use SheetJS to extract rubros directly without NOVA
        const XLSX = await import("https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs");
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, {type:"array"});
        const rubrosExtraidos = [];
        const capitulosExtraidos = [];
        let capActual = "";

        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(sheet, {header:1, defval:""});
          
          for (const row of rows) {
            const vals = row.map(v=>String(v||"").trim()).filter(v=>v);
            if (vals.length < 2) continue;
            
            // Find item number (like "1", "1.1", "2.3")
            const item = vals.find(v=>v.match(/^\d+(\.\d+)?$/));
            // Find description (longest text that is not a number)
            const textos = vals.filter(v=>v.length>2&&!v.match(/^[\d.,\s]+$/));
            const desc = textos.reduce((a,b)=>b.length>a.length?b:a, "");
            
            if (!item || !desc) continue;

            // Detect capitulo header: integer item + no decimal prices in row
            const numeros = vals.filter(v=>v.match(/^\d+([.,]\d+)?$/)&&parseFloat(v.replace(",","."))<1000000);
            const tienePrecios = numeros.some(v=>v.includes(".")&&parseFloat(v)>0.1);
            
            if (item.match(/^\d+$/) && !tienePrecios) {
              capActual = desc;
              if (!capitulosExtraidos.includes(capActual)) capitulosExtraidos.push(capActual);
              continue;
            }
            
            // Detect rubro: item with decimal like "1.1", "2.3"
            if (item.match(/^\d+\.\d+/)) {
              // Unidad: short text matching known units
              const unidad = vals.find(v=>v.match(/^(m2|m²|ml|u|glb|gl|kg|ton|m3|m³|l|lt|hr|mes|dia|pza|pz|pp|und|vía|via|pto|punto|jgo|juego|global|GA)$/i))||"";
              
              // Precio: find all numbers, take the one that looks like unit price
              // Usually 2nd or 3rd numeric column (after cantidad)
              const todosNums = vals
                .filter(v=>v.match(/^[\d]+[.,]?[\d]*$/)&&v!==item)
                .map(v=>parseFloat(v.replace(",",".")))
                .filter(v=>v>0&&v<500000)
                .sort((a,b)=>a-b);
              
              // precio_unitario is usually the smallest non-1 number (unit price, not total)
              const cantidad = todosNums.length>0 ? todosNums[0] : 1;
              const precio_unitario = todosNums.length>1 ? todosNums[1] : (todosNums[0]||0);
              
              if (desc && precio_unitario>0) {
                rubrosExtraidos.push({
                  capitulo: capActual||"SIN CLASIFICAR",
                  descripcion: desc.slice(0,200),
                  unidad,
                  cantidad: cantidad||1,
                  precio_unitario
                });
              }
            }
          }
        }

        if (rubrosExtraidos.length > 0) {
          // Direct result without NOVA
          const directResult = {
            proveedor: file.name.replace(/\.(xlsx|xls)$/i,""),
            cliente: "",
            capitulos: capitulosExtraidos,
            rubros: rubrosExtraidos
          };
          setBdResult(directResult);
          setBdRubros(directResult.rubros);
          setBdMeta({proveedor:directResult.proveedor, cliente:"", fecha:new Date().getFullYear().toString()});
          setUploadingBD(false); e.target.value=""; return;
        }
        
        // Fallback to NOVA if direct extraction failed
        const csv = workbook.SheetNames.map(s=>XLSX.utils.sheet_to_csv(workbook.Sheets[s])).join("\n");
        msgContent=[{type:"text",text:`Excel:\n\n${csv.slice(0,12000)}\n\n${prompt}`}];
      } else {
        const text=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsText(file);});
        msgContent=[{type:"text",text:`Contenido:\n\n${text.slice(0,10000)}\n\n${prompt}`}];
      }

      const res=await fetch("/api/nova",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-5",max_tokens:16000,messages:[{role:"user",content:msgContent}]})});
      const data=await res.json();
      let rawText = (data.content?.[0]?.text||"").trim();
      let parsed = null;
      try { parsed=JSON.parse(rawText.replace(/```json|```/g,"").trim()); } catch {
        const m=rawText.match(/\{[\s\S]*\}/);
        if(m) try{parsed=JSON.parse(m[0]);}catch{}
      }
      if(!parsed) {
        // Try to recover truncated JSON
        try {
          let partial = rawText.replace(/```json|```/g,"").trim();
          const start = partial.indexOf("{");
          if (start >= 0) {
            partial = partial.slice(start);
            let opens=0, openSq=0;
            for(const c of partial){if(c==="{")opens++;if(c==="}")opens--;if(c==="[")openSq++;if(c==="]")openSq--;}
            for(let i=0;i<openSq;i++) partial+="]";
            for(let i=0;i<opens;i++) partial+="}";
            parsed=JSON.parse(partial);
          }
        } catch {}
      }
      // Normalize compact format {c,d,u,q,p} to full format
      if(parsed?.rubros) {
        parsed.rubros = parsed.rubros.map(r=>({
          capitulo: r.capitulo||r.c||"",
          descripcion: r.descripcion||r.d||"",
          unidad: r.unidad||r.u||"",
          cantidad: r.cantidad||r.q||1,
          precio_unitario: r.precio_unitario||r.p||0
        })).filter(r=>r.descripcion);
      }
      if(!parsed||!parsed.rubros?.length) { setBdResult({error:"NOVA no pudo extraer rubros. El presupuesto puede ser muy grande — intenta subir por capítulos. Respuesta: "+rawText.slice(0,200)}); setUploadingBD(false); e.target.value=""; return; }
      setBdResult(parsed);
      setBdRubros(parsed.rubros||[]);
      setBdMeta({ proveedor:parsed.proveedor||"", cliente:parsed.cliente||"", fecha:new Date().getFullYear().toString() });
    } catch(err) { setBdResult({error:"Error: "+err.message}); }
    setUploadingBD(false); e.target.value="";
  }

  async function guardarEnBD() {
    if (!bdRubros.length) return;
    const proveedor = bdMeta.proveedor;
    const fecha = bdMeta.fecha;
    let cliente = bdMeta.cliente;
    // Save new client if needed
    if (bdMeta.clienteNuevo && cliente) {
      const {data:existeCl} = await supabase.from("clientes").select("id").eq("nombre",cliente).limit(1);
      if (!existeCl||existeCl.length===0) {
        await supabase.from("clientes").insert({nombre:cliente,tipo:"otro"});
        setClientes(prev=>[...prev,{nombre:cliente}]);
      }
    }
    const res = await alimentarBase(
      bdRubros.map(r => ({ descripcion: r.descripcion, unidad: r.unidad, precio_unitario: r.precio_unitario, capitulo: r.capitulo })),
      { cliente, proyecto: proveedor, fecha }
    );
    fetchCapitulosDB();
    alert(res.error ? "⚠️ " + res.error : "✅ " + (resumenAlimentacion(res) || "No había nada nuevo que guardar."));
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
  const iS={width:"100%",background:"var(--bg)",border:"1px solid var(--border)",borderRadius:8,color:"var(--ink)",padding:"9px 12px",fontSize:13,fontFamily:"var(--font)",boxSizing:"border-box",outline:"none"};

  return (
    <div style={{fontFamily:"var(--font)"}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:8}}>
        <div>
          <div style={{fontSize:17,fontWeight:700,color:"var(--ink)"}}>
            {subVista==="lista"?"Presupuestos":subVista==="nuevo"?"Nuevo presupuesto":subVista==="detalle"?`${presupuestoActivo?.nombre}`:subVista==="baseDatos"?"Base de rubros":"Alimentar BD"}
          </div>
          {subVista==="detalle"&&presupuestoActivo&&<div style={{fontSize:12,color:"var(--ink-soft)",marginTop:2}}>{presupuestoActivo.cliente_nombre} · Total: ${fmt(presupuestoActivo.total)}</div>}
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {subVista!=="lista"&&<button onClick={()=>setSubVista("lista")} style={{background:"var(--neutral-soft)",border:"none",borderRadius:8,padding:"7px 12px",color:"var(--ink-soft)",fontSize:12,cursor:"pointer"}}>← Volver</button>}
          {subVista==="lista"&&<>
            <button onClick={()=>{setSubVista("baseDatos");buscarRubros("");}} style={{background:"var(--neutral-soft)",border:"none",borderRadius:8,padding:"7px 12px",color:"var(--ink-soft)",fontSize:12,cursor:"pointer"}}>Base de rubros</button>
            <button onClick={()=>setSubVista("alimentarBD")} style={{background:"var(--neutral-soft)",border:"none",borderRadius:8,padding:"7px 12px",color:"var(--ink-soft)",fontSize:12,cursor:"pointer"}}>Alimentar BD</button>
            <button onClick={()=>setShowAdminBD(true)} style={{background:"var(--neutral-soft)",border:"none",borderRadius:8,padding:"7px 12px",color:"var(--ink-soft)",fontSize:12,cursor:"pointer"}}>Admin BD</button>
            <button onClick={()=>setSubVista("nuevo")} style={{background:"var(--brand)",border:"none",borderRadius:8,padding:"7px 12px",color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}>+ Nuevo presupuesto</button>
          </>}
          {subVista==="detalle"&&<>
            <button onClick={()=>document.getElementById("cotiz-input").click()} style={{background:"var(--brand-soft)",border:"1.5px solid var(--border)",borderRadius:8,padding:"7px 12px",color:"var(--brand)",fontSize:12,fontWeight:600,cursor:"pointer"}}>🤖 Subir cotización</button>

            <button onClick={exportarExcel} disabled={exportando||items.length===0} style={{background:"var(--success)",border:"none",borderRadius:8,padding:"7px 12px",color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}>{exportando?"Exportando...":"Exportar Excel"}</button>
          </>}
        </div>
      </div>

      {showAdminBD&&<AdminBD onVolver={()=>setShowAdminBD(false)}/>}
      <input id="cotiz-input" type="file" accept="image/*,.pdf,.xlsx,.xls" onChange={leerCotizacion} style={{display:"none"}}/>

      {!showAdminBD&&<>
      {/* COTIZACIÓN LEÍDA */}
      {uploadingCotizacion&&<div style={{background:"var(--brand-soft)",border:"1.5px solid var(--border)",borderRadius:10,padding:12,marginBottom:12,fontSize:13,color:"var(--brand)"}}>🤖 NOVA leyendo cotización...</div>}
      {cotizacionResult?.error&&<div style={{background:"var(--danger-soft)",border:"1.5px solid var(--danger-border)",borderRadius:10,padding:12,marginBottom:12,fontSize:12,color:"var(--danger)"}}>{cotizacionResult.error} <button onClick={()=>setCotizacionResult(null)} style={{background:"none",border:"none",color:"var(--danger)",cursor:"pointer",fontSize:14,marginLeft:8}}>×</button></div>}
      {cotizacionResult&&!cotizacionResult.error&&(
        <CotizacionPanel
          result={cotizacionResult}
          clientes={clientes}
          capitulosActivos={capitulosActivos}
          onCancelar={()=>setCotizacionResult(null)}
          onImportar={(rubros, capNombre, utilidad, guardarBD, proveedor, clienteNombre, fecha)=>{
            // Import to presupuesto
            const capN = capNombre||"COTIZACIÓN PROVEEDOR";
            if (!capitulosActivos.find(c=>c.nombre===capN)) {
              setCapitulosActivos(prev=>[...prev,{nombre:capN,orden:prev.length+1}]);
            }
            const newItems=[];
            const rubrosValidos=rubros.filter(r=>r.descripcion&&r.descripcion.trim());
            supabase.from("presupuesto_items").insert(rubrosValidos.map((r,idx)=>({
              presupuesto_id:presupuestoActivo.id,
              capitulo:capN,
              descripcion:r.descripcion,
              unidad:r.unidad||"",
              cantidad:r.cantidad||1,
              precio_unitario:Number(r.precio_unitario_final||r.precio_unitario)||0,
              total:(r.cantidad||1)*(Number(r.precio_unitario_final||r.precio_unitario)||0),
              orden:(capitulosActivos.length)*1000+idx
            }))).select().then(({data})=>{
              if(data){
                const all=[...items,...data];
                setItems(all);
                recalcTotales(all);
              }
            });
            // Todo lo que entra alimenta la base, sin casilla que marcar: un
            // precio que no se guarda es un precio que se pierde.
            alimentarBase(rubrosValidos, { cliente: clienteNombre, proyecto: proveedor, fecha })
              .then(r => { if (r.rubrosNuevos || r.capitulosNuevos) fetchCapitulosDB(); });
            setCotizacionResult(null);
          }}
          fmt={fmt}
        />
      )}

      {/* LISTA */}
      {borrarPre&&(
        <ConfirmarBorrado
          titulo="Borrar este presupuesto"
          nombre={borrarPre.nombre}
          revisar={()=>revisarPresupuesto(borrarPre)}
          borrar={()=>ejecutarBorradoPresupuesto(borrarPre)}
          onCancelar={()=>setBorrarPre(null)}
          onBorrado={()=>{setBorrarPre(null);fetchPresupuestos();}}
        />
      )}

      {subVista==="lista"&&(
        <div>
          {presupuestos.length===0?<div style={{textAlign:"center",padding:"60px 0",color:"var(--muted)"}}><div style={{fontSize:40,marginBottom:12}}>💼</div>Sin presupuestos aún.</div>
          :presupuestos.map(p=>(
            <div key={p.id} onClick={()=>{setPresupuestoActivo(p);fetchItems(p.id);setSubVista("detalle");}}
              style={{background:"#fff",border:"1px solid var(--border)",borderRadius:10,padding:"14px 16px",marginBottom:8,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}
              onMouseEnter={e=>e.currentTarget.style.borderColor="var(--brand)"} onMouseLeave={e=>e.currentTarget.style.borderColor="var(--border)"}>
              <div>
                <div style={{fontWeight:600,color:"var(--ink)",fontSize:14}}>{p.nombre}</div>
                <div style={{fontSize:12,color:"var(--ink-soft)",marginTop:2}}>{p.cliente_nombre} · {new Date(p.created_at).toLocaleDateString("es-EC")}</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{textAlign:"right"}}>
                  <div style={{fontWeight:700,color:"var(--brand)",fontSize:16}}>${fmt(p.total)}</div>
                  <div style={{fontSize:10,color:"var(--muted)",background:"var(--neutral-soft)",borderRadius:20,padding:"1px 8px",display:"inline-block",marginTop:2}}>{p.estado}</div>
                </div>
                <button onClick={e=>{e.stopPropagation();duplicarPresupuesto(p);}} disabled={duplicando===p.id}
                  title="Duplicar para partir de este"
                  style={{background:"transparent",border:"1px solid var(--border)",borderRadius:8,padding:"6px 7px",color:"var(--muted)",cursor:"pointer",display:"flex"}}>
                  <Copy size={13}/>
                </button>
                {puede?.("borrar.definitivo")&&(
                  <button onClick={e=>{e.stopPropagation();setBorrarPre(p);}} title="Borrar este presupuesto"
                    style={{background:"transparent",border:"1px solid var(--border)",borderRadius:8,padding:"6px 7px",color:"var(--muted)",cursor:"pointer",display:"flex"}}>
                    <Trash2 size={13}/>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* NUEVO */}
      {subVista==="nuevo"&&(
        <div style={{background:"#fff",borderRadius:12,padding:20,border:"1px solid var(--border)"}}>
          <div style={{display:"grid",gap:14}}>
            <div><label style={{fontSize:11,color:"var(--ink-soft)",fontWeight:500,display:"block",marginBottom:4}}>Nombre *</label>
              <input value={form.nombre} onChange={e=>setForm(p=>({...p,nombre:e.target.value}))} placeholder="Ej: Remodelación BdP Condado" style={iS}/></div>
            <div><label style={{fontSize:11,color:"var(--ink-soft)",fontWeight:500,display:"block",marginBottom:4}}>Cliente *</label>
              <select value={form.cliente_id} onChange={e=>{const cl=clientes.find(c=>c.id===Number(e.target.value));setForm(p=>({...p,cliente_id:e.target.value,cliente_nombre:cl?.nombre||""}));}} style={iS}>
                <option value="">Selecciona cliente...</option>
                {clientes.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
                <option value="nuevo">+ Nuevo cliente</option>
              </select></div>
            {form.cliente_id==="nuevo"&&<div><label style={{fontSize:11,color:"var(--ink-soft)",fontWeight:500,display:"block",marginBottom:4}}>Nombre del nuevo cliente</label>
              <input value={form.cliente_nombre} onChange={e=>setForm(p=>({...p,cliente_nombre:e.target.value}))} placeholder="Nombre del cliente" style={iS}/></div>}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div><label style={{fontSize:11,color:"var(--ink-soft)",fontWeight:500,display:"block",marginBottom:4}}>Honorarios (%)</label>
                <input type="number" value={form.honorarios_pct} onChange={e=>setForm(p=>({...p,honorarios_pct:e.target.value}))} style={iS}/></div>
              <div><label style={{fontSize:11,color:"var(--ink-soft)",fontWeight:500,display:"block",marginBottom:4}}>IVA (%)</label>
                <input type="number" value={form.iva_pct} onChange={e=>setForm(p=>({...p,iva_pct:e.target.value}))} style={iS}/></div>
            </div>
            <div><label style={{fontSize:11,color:"var(--ink-soft)",fontWeight:500,display:"block",marginBottom:4}}>Notas</label>
              <textarea value={form.notas} onChange={e=>setForm(p=>({...p,notas:e.target.value}))} style={{...iS,minHeight:60,resize:"vertical"}} placeholder="Observaciones..."/></div>
          </div>
          <button onClick={crearPresupuesto} disabled={!form.nombre||!form.cliente_nombre}
            style={{width:"100%",marginTop:16,background:form.nombre&&form.cliente_nombre?"var(--brand)":"var(--neutral-soft)",border:"none",borderRadius:10,padding:12,color:form.nombre&&form.cliente_nombre?"#fff":"var(--muted)",fontSize:14,fontWeight:600,cursor:form.nombre&&form.cliente_nombre?"pointer":"default"}}>
            Crear presupuesto →
          </button>
        </div>
      )}

      {/* DETALLE */}
      {subVista==="detalle"&&presupuestoActivo&&(
        <div>
          {capitulosActivos.length===0&&(
            <div style={{textAlign:"center",padding:"30px 0",color:"var(--muted)",fontSize:13}}>
              <div style={{fontSize:28,marginBottom:8}}>📋</div>Sin capítulos aún. Agrega el primero abajo.
            </div>
          )}

          {capitulosActivos.map((cap,capIdx)=>{
            const capItems=items.filter(i=>i.capitulo===cap.nombre).sort((a,b)=>a.orden-b.orden);
            const capTotal=capItems.reduce((s,i)=>s+(Number(i.total)||0),0);
            return(
              <div key={cap.nombre} style={{marginBottom:10,background:"#fff",border:"1px solid var(--border)",borderRadius:10,overflow:"hidden"}}>
                {/* Capítulo header */}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 14px",background:"var(--brand-soft)"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    {/* Orden buttons */}
                    <div style={{display:"flex",flexDirection:"column",gap:1}}>
                      <button onClick={()=>moverCapitulo(cap.nombre,-1)} disabled={capIdx===0}
                        style={{background:"none",border:"none",color:capIdx===0?"var(--border)":"var(--muted)",cursor:capIdx===0?"default":"pointer",fontSize:10,padding:"0 2px",lineHeight:1}}>▲</button>
                      <button onClick={()=>moverCapitulo(cap.nombre,1)} disabled={capIdx===capitulosActivos.length-1}
                        style={{background:"none",border:"none",color:capIdx===capitulosActivos.length-1?"var(--border)":"var(--muted)",cursor:capIdx===capitulosActivos.length-1?"default":"pointer",fontSize:10,padding:"0 2px",lineHeight:1}}>▼</button>
                    </div>
                    <span style={{fontSize:12,fontWeight:700,color:"var(--brand)",marginRight:2}}>{cap.orden}.</span>
                    <input
                      defaultValue={cap.nombre}
                      onBlur={async e=>{
                        const nuevoNombre=e.target.value.trim();
                        if(!nuevoNombre||nuevoNombre===cap.nombre) return;
                        // Update items with old capitulo name
                        await supabase.from("presupuesto_items").update({capitulo:nuevoNombre}).eq("presupuesto_id",presupuestoActivo.id).eq("capitulo",cap.nombre);
                        setCapitulosActivos(prev=>prev.map(c=>c.nombre===cap.nombre?{...c,nombre:nuevoNombre}:c));
                        setItems(prev=>prev.map(i=>i.capitulo===cap.nombre?{...i,capitulo:nuevoNombre}:i));
                      }}
                      style={{fontSize:13,fontWeight:700,color:"var(--brand)",background:"transparent",border:"none",borderBottom:"1.5px dashed var(--border)",outline:"none",minWidth:100,maxWidth:300,fontFamily:"var(--font)"}}
                    />
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    {capTotal>0&&<span style={{fontSize:12,fontWeight:600,color:"var(--ink-soft)"}}>${fmt(capTotal)}</span>}
                    <div style={{display:"flex",alignItems:"center",gap:4,background:"var(--brand-soft)",border:"1px solid var(--border)",borderRadius:6,padding:"2px 6px"}}>
                      <span style={{fontSize:10,color:"var(--brand)"}}>Util%</span>
                      <input type="number" placeholder="0" min="0" max="100"
                        style={{width:40,background:"transparent",border:"none",outline:"none",fontSize:11,color:"var(--brand)",textAlign:"right"}}
                        onKeyDown={e=>{if(e.key==="Enter")aplicarUtilidadCapitulo(cap.nombre,Number(e.target.value));}}
                        onBlur={e=>{if(e.target.value)aplicarUtilidadCapitulo(cap.nombre,Number(e.target.value));}}/>
                    </div>
                    <button onClick={()=>{setModalRubro({capitulo:cap.nombre,modo:"bd"});setBusquedaRubro("");buscarRubros("");fetchCapitulosDB();}} style={{background:"var(--brand)",border:"none",borderRadius:6,padding:"3px 10px",color:"#fff",fontSize:11,cursor:"pointer",fontWeight:500}}>+ BD</button>
                    <button onClick={()=>{setModalRubro({capitulo:cap.nombre,modo:"manual"});setManualRubro({descripcion:"",unidad:"",cantidad:1,precio_unitario:0});}} style={{background:"var(--neutral-soft)",border:"1px solid var(--border)",borderRadius:6,padding:"3px 10px",color:"var(--ink-soft)",fontSize:11,cursor:"pointer"}}>+ Manual</button>
                    <button onClick={()=>eliminarCapitulo(cap.nombre)} style={{background:"none",border:"none",color:"var(--danger)",fontSize:14,cursor:"pointer",padding:"0 2px"}}>✕</button>
                  </div>
                </div>
                {capItems.length>0&&(
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                    <thead><tr style={{background:"var(--bg)"}}>
                      {["N°","Descripción","Unidad","Cantidad","P.Base","Util%","P.Final","Total",""].map(h=>(
                        <th key={h} style={{padding:"6px 8px",textAlign:"left",fontSize:10,color:"var(--ink-soft)",fontWeight:600,borderBottom:"1px solid var(--border)"}}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {capItems.map((item,itemIdx)=>(
                        <tr key={item.id} style={{borderBottom:"1px solid var(--neutral-soft)"}}>
                          <td style={{padding:"5px 8px",color:"var(--muted)",fontSize:11,whiteSpace:"nowrap",fontWeight:500}}>{cap.orden}.{itemIdx+1}</td>
                          <td style={{padding:"5px 8px",color:"var(--ink)",maxWidth:180,fontSize:12}}>{item.descripcion}</td>
                          <td style={{padding:"5px 8px",color:"var(--ink-soft)",whiteSpace:"nowrap"}}>{item.unidad}</td>
                          <td style={{padding:"5px 8px"}}>
                            <input type="number" value={item.cantidad} onChange={e=>actualizarItem(item.id,"cantidad",e.target.value)}
                              style={{width:55,background:"var(--bg)",border:"1px solid var(--border)",borderRadius:6,padding:"3px 6px",fontSize:12,textAlign:"right"}}/>
                          </td>
                          <td style={{padding:"5px 8px",color:"var(--muted)",fontSize:11,whiteSpace:"nowrap"}}>${fmt(item.precio_base||item.precio_unitario)}</td>
                          <td style={{padding:"5px 8px"}}>
                            <input type="number" value={item.utilidad_pct||0}
                              onChange={e=>{
                                const pct=Number(e.target.value);
                                const base=item.precio_base||item.precio_unitario;
                                const nuevo=Number(base)*(1+pct/100);
                                actualizarItemMulti(item.id,{utilidad_pct:pct,precio_unitario:nuevo,precio_base:base});
                              }}
                              style={{width:50,background:"var(--brand-soft)",border:"1px solid var(--border)",borderRadius:6,padding:"3px 6px",fontSize:12,textAlign:"right"}}/>
                          </td>
                          <td style={{padding:"5px 8px"}}>
                            <input type="number" value={item.precio_unitario} onChange={e=>actualizarItem(item.id,"precio_unitario",e.target.value)}
                              style={{width:75,background:"var(--bg)",border:"1px solid var(--border)",borderRadius:6,padding:"3px 6px",fontSize:12,textAlign:"right"}}/>
                          </td>
                          <td style={{padding:"5px 8px",fontWeight:600,color:"var(--ink)",whiteSpace:"nowrap"}}>${fmt(item.total)}</td>
                          <td style={{padding:"5px 8px"}}>
                            <button onClick={()=>eliminarItem(item.id)} style={{background:"none",border:"none",color:"var(--danger)",cursor:"pointer",fontSize:14,padding:0}}>✕</button>
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
              <button onClick={()=>{setShowAddCap(true);fetchCapitulosDB();}} style={{width:"100%",background:"#fff",border:"1.5px dashed var(--border)",borderRadius:10,padding:"10px",color:"var(--muted)",fontSize:13,cursor:"pointer"}}>
                + Agregar capítulo
              </button>
            ):(
              <div style={{background:"#fff",border:"1.5px solid var(--brand)",borderRadius:10,padding:14}}>
                <div style={{fontSize:12,fontWeight:600,color:"var(--ink-soft)",marginBottom:8}}>Selecciona de la base de datos o escribe uno nuevo:</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:12,maxHeight:120,overflowY:"auto"}}>
                  {capitulosDB.filter(c=>!capitulosActivos.find(ca=>ca.nombre===c)).map(c=>(
                    <button key={c} onClick={()=>agregarCapitulo(c)}
                      style={{background:"var(--bg)",border:"1px solid var(--border)",borderRadius:20,padding:"4px 12px",fontSize:11,color:"var(--ink-soft)",cursor:"pointer"}}
                      onMouseEnter={e=>{e.currentTarget.style.background="var(--brand-soft)";e.currentTarget.style.borderColor="var(--brand)";e.currentTarget.style.color="var(--brand)";}}
                      onMouseLeave={e=>{e.currentTarget.style.background="var(--bg)";e.currentTarget.style.borderColor="var(--border)";e.currentTarget.style.color="var(--ink-soft)";}}>
                      {c}
                    </button>
                  ))}
                </div>
                <div style={{display:"flex",gap:8}}>
                  <input value={nuevoCapitulo} onChange={e=>setNuevoCapitulo(e.target.value)}
                    onKeyDown={e=>e.key==="Enter"&&agregarCapitulo(nuevoCapitulo)}
                    placeholder="O escribe capítulo nuevo (ej: Piscina, Generador...)" style={{...iS,flex:1}}/>
                  <button onClick={()=>agregarCapitulo(nuevoCapitulo)} disabled={!nuevoCapitulo.trim()}
                    style={{background:nuevoCapitulo.trim()?"var(--brand)":"var(--neutral-soft)",border:"none",borderRadius:8,padding:"9px 14px",color:nuevoCapitulo.trim()?"#fff":"var(--muted)",fontSize:12,fontWeight:600,cursor:nuevoCapitulo.trim()?"pointer":"default",whiteSpace:"nowrap"}}>Agregar</button>
                  <button onClick={()=>{setShowAddCap(false);setNuevoCapitulo("");}} style={{background:"var(--neutral-soft)",border:"none",borderRadius:8,padding:"9px 10px",color:"var(--ink-soft)",fontSize:12,cursor:"pointer"}}>×</button>
                </div>
              </div>
            )}
          </div>

          {/* Totales */}
          {items.length>0&&(
            <div style={{background:"#fff",border:"1px solid var(--border)",borderRadius:10,padding:16}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"1px solid var(--neutral-soft)",fontSize:13,color:"var(--ink-soft)"}}>
                <span>Subtotal</span><span>${fmt(presupuestoActivo.subtotal)}</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"1px solid var(--neutral-soft)",fontSize:13,color:"var(--ink-soft)"}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span>Honorarios</span>
                  <input type="number" defaultValue={presupuestoActivo.honorarios_pct||0}
                    key={presupuestoActivo.id}
                    onBlur={async e=>{
                      const pct=Number(e.target.value);
                      await supabase.from("presupuestos").update({honorarios_pct:pct}).eq("id",presupuestoActivo.id);
                      recalcTotales(items, {honorarios_pct:pct});
                    }}
                    style={{width:50,background:"var(--bg)",border:"1px solid var(--border)",borderRadius:6,padding:"2px 6px",fontSize:12,textAlign:"right"}}/>
                  <span style={{fontSize:11}}>%</span>
                </div>
                <span>${fmt(presupuestoActivo.honorarios_monto)}</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"1px solid var(--neutral-soft)",fontSize:13,color:"var(--ink-soft)"}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span>IVA</span>
                  <input type="number" defaultValue={presupuestoActivo.iva_pct||12}
                    key={`iva-${presupuestoActivo.id}`}
                    onBlur={async e=>{
                      const pct=Number(e.target.value);
                      await supabase.from("presupuestos").update({iva_pct:pct}).eq("id",presupuestoActivo.id);
                      recalcTotales(items, {iva_pct:pct});
                    }}
                    style={{width:50,background:"var(--bg)",border:"1px solid var(--border)",borderRadius:6,padding:"2px 6px",fontSize:12,textAlign:"right"}}/>
                  <span style={{fontSize:11}}>%</span>
                </div>
                <span>${fmt(presupuestoActivo.iva_monto)}</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",padding:"10px 0 0",fontSize:16,fontWeight:700,color:"var(--ink)"}}>
                <span>TOTAL</span><span style={{color:"var(--brand)"}}>${fmt(presupuestoActivo.total)}</span>
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
            onFocus={()=>buscarRubros(busquedaRubro)}/>
          <div style={{fontSize:11,color:"var(--muted)",marginBottom:10}}>Base: 1,151+ rubros · Primeros 60 resultados</div>
          {rubrosDB.map(r=>(
            <div key={r.id} style={{background:"#fff",border:"1px solid var(--border)",borderRadius:10,marginBottom:6,overflow:"hidden"}}>
              <div onClick={()=>setRubroSeleccionado(rubroSeleccionado?.id===r.id?null:r)}
                style={{padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}
                onMouseEnter={e=>e.currentTarget.style.background="var(--bg)"} onMouseLeave={e=>e.currentTarget.style.background=""}>
                <div>
                  <div style={{fontSize:13,fontWeight:500,color:"var(--ink)"}}>{r.descripcion}</div>
                  <div style={{fontSize:11,color:"var(--muted)",marginTop:2}}>{r.capitulos?.nombre} · {r.unidad}</div>
                </div>
                <div style={{textAlign:"right",flexShrink:0,marginLeft:12}}>
                  <div style={{fontSize:13,fontWeight:600,color:"var(--brand)"}}>${fmt(r.precio_referencia)}</div>
                  <div style={{fontSize:10,color:"var(--muted)"}}>{r.precios_historial?.length||0} clientes · {rubroSeleccionado?.id===r.id?"▲":"▼"}</div>
                </div>
              </div>
              {rubroSeleccionado?.id===r.id&&(
                <div style={{background:"var(--bg)",borderTop:"1px solid var(--neutral-soft)",padding:"8px 14px"}}>
                  <div style={{fontSize:10,fontWeight:600,color:"var(--ink-soft)",marginBottom:6,letterSpacing:0.5}}>HISTORIAL POR CLIENTE</div>
                  {r.precios_historial?.length===0&&<div style={{fontSize:11,color:"var(--muted)"}}>Sin historial.</div>}
                  {[...new Map(r.precios_historial?.map(h=>[h.cliente_nombre,h])).values()].map((h,i)=>(
                    <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"4px 8px",background:"#fff",borderRadius:6,marginBottom:3,border:"1px solid var(--border)"}}>
                      <div style={{fontSize:11,color:"var(--ink-soft)"}}>{h.cliente_nombre||"Sin cliente"} <span style={{color:"var(--muted)"}}>({h.fecha})</span></div>
                      <div style={{fontWeight:600,color:"var(--brand)",fontSize:12}}>${fmt(h.precio_unitario)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ALIMENTAR BD */}
      {subVista==="alimentarBD"&&(
        <div>
          <div style={{background:"#fff",border:"1.5px solid var(--border)",borderRadius:12,padding:18,marginBottom:16}}>
            <div style={{fontSize:14,fontWeight:600,color:"var(--brand)",marginBottom:6}}>🤖 NOVA — Alimentar base de datos</div>
            <div style={{fontSize:12,color:"var(--ink-soft)",marginBottom:14}}>Sube presupuestos anteriores o cotizaciones. NOVA extrae capítulos y rubros. Los capítulos nuevos quedan disponibles para futuros presupuestos.</div>
            <button onClick={()=>fileBDRef.current?.click()} disabled={uploadingBD}
              style={{background:"var(--brand)",border:"none",borderRadius:8,padding:"10px 18px",color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer"}}>
              {uploadingBD?"🤖 NOVA analizando...":"📤 Subir archivo"}
            </button>
            <input ref={fileBDRef} type="file" accept="image/*,.pdf,.xlsx,.xls" onChange={leerParaBD} style={{display:"none"}}/>
          </div>
          {bdResult&&!bdResult.error&&(
            <div style={{background:"#fff",border:"1px solid var(--border)",borderRadius:12,padding:18}}>
              <div style={{fontSize:14,fontWeight:600,color:"var(--ink)",marginBottom:12}}>✓ NOVA analizó el archivo — revisa y edita antes de guardar</div>

              {/* Metadata */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:14}}>
                <div><label style={{fontSize:11,color:"var(--ink-soft)",display:"block",marginBottom:4}}>Proveedor / Fuente</label>
                  <input value={bdMeta.proveedor} onChange={e=>setBdMeta(p=>({...p,proveedor:e.target.value}))} placeholder="Nombre del proveedor" style={iS}/></div>
                <div><label style={{fontSize:11,color:"var(--ink-soft)",display:"block",marginBottom:4}}>Cliente de referencia</label>
                  <select value={bdMeta.clienteNuevo?"__nuevo__":bdMeta.cliente} onChange={e=>setBdMeta(p=>({...p,cliente:e.target.value==="__nuevo__"?"":e.target.value,clienteNuevo:e.target.value==="__nuevo__"}))} style={iS}>
                    <option value="">Sin cliente</option>
                    {clientes.map(c=><option key={c.id} value={c.nombre}>{c.nombre}</option>)}
                    <option value="__nuevo__">+ Nuevo cliente...</option>
                  </select>
                  {bdMeta.clienteNuevo&&<input value={bdMeta.cliente||""} onChange={e=>setBdMeta(p=>({...p,cliente:e.target.value}))} placeholder="Nombre del cliente nuevo" style={{...iS,marginTop:6}}/>}
                </div>
                <div><label style={{fontSize:11,color:"var(--ink-soft)",display:"block",marginBottom:4}}>Año del presupuesto</label>
                  <input value={bdMeta.fecha} onChange={e=>setBdMeta(p=>({...p,fecha:e.target.value}))} placeholder="2025" style={iS}/></div>
              </div>

              {/* Capítulos detectados */}
              {bdResult.capitulos?.length>0&&(
                <div style={{marginBottom:12}}>
                  <div style={{fontSize:11,fontWeight:600,color:"var(--ink-soft)",marginBottom:6}}>Capítulos detectados:</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                    {bdResult.capitulos.map((c,i)=>(
                      <span key={i} style={{background:capitulosDB.includes(c)?"var(--neutral-soft)":"var(--brand-soft)",border:`1px solid ${capitulosDB.includes(c)?"var(--border)":"var(--border)"}`,borderRadius:20,padding:"2px 10px",fontSize:11,color:capitulosDB.includes(c)?"var(--ink-soft)":"var(--brand)"}}>
                        {c}{!capitulosDB.includes(c)&&" ✨ nuevo"}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Rubros editables */}
              <div style={{fontSize:11,fontWeight:600,color:"var(--ink-soft)",marginBottom:6}}>{bdRubros.length} rubros — edita o elimina antes de guardar:</div>
              <div style={{maxHeight:300,overflowY:"auto",marginBottom:12,border:"1px solid var(--neutral-soft)",borderRadius:8}}>
                {bdRubros.map((r,i)=>(
                  <div key={i} style={{display:"grid",gridTemplateColumns:"2fr 1.5fr 0.7fr 0.8fr auto",gap:6,padding:"6px 8px",borderBottom:"1px solid var(--bg)",alignItems:"center"}}>
                    <input value={r.descripcion} onChange={e=>setBdRubros(prev=>prev.map((x,j)=>j===i?{...x,descripcion:e.target.value}:x))}
                      style={{fontSize:11,border:"1px solid var(--border)",borderRadius:4,padding:"3px 6px",color:"var(--ink)",background:"var(--bg)",outline:"none"}}/>
                    <input value={r.capitulo||""} onChange={e=>setBdRubros(prev=>prev.map((x,j)=>j===i?{...x,capitulo:e.target.value}:x))}
                      style={{fontSize:11,border:"1px solid var(--border)",borderRadius:4,padding:"3px 6px",color:"var(--ink-soft)",background:"var(--bg)",outline:"none"}} placeholder="Capítulo"/>
                    <input value={r.unidad||""} onChange={e=>setBdRubros(prev=>prev.map((x,j)=>j===i?{...x,unidad:e.target.value}:x))}
                      style={{fontSize:11,border:"1px solid var(--border)",borderRadius:4,padding:"3px 6px",color:"var(--ink-soft)",background:"var(--bg)",outline:"none"}} placeholder="m²"/>
                    <input type="number" value={r.precio_unitario||""} onChange={e=>setBdRubros(prev=>prev.map((x,j)=>j===i?{...x,precio_unitario:e.target.value}:x))}
                      style={{fontSize:11,border:"1px solid var(--border)",borderRadius:4,padding:"3px 6px",color:"var(--brand)",fontWeight:600,background:"var(--bg)",outline:"none",textAlign:"right"}}/>
                    <button onClick={()=>setBdRubros(prev=>prev.filter((_,j)=>j!==i))}
                      style={{background:"none",border:"none",color:"var(--danger)",cursor:"pointer",fontSize:14,padding:"0 4px"}}>✕</button>
                  </div>
                ))}
              </div>

              <div style={{fontSize:11,color:"var(--muted)",marginBottom:12}}>
                Columnas: Descripción · Capítulo · Unidad · Precio unitario · Eliminar
              </div>

              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>{setBdResult(null);setBdRubros([]);}} style={{flex:1,background:"var(--neutral-soft)",border:"none",borderRadius:8,padding:10,color:"var(--ink-soft)",fontSize:12,cursor:"pointer"}}>Cancelar</button>
                <button onClick={guardarEnBD} disabled={!bdRubros.length}
                  style={{flex:2,background:bdRubros.length?"var(--brand)":"var(--neutral-soft)",border:"none",borderRadius:8,padding:10,color:bdRubros.length?"#fff":"var(--muted)",fontSize:13,fontWeight:600,cursor:bdRubros.length?"pointer":"default"}}>
                  ✓ Guardar {bdRubros.length} rubros en base de datos
                </button>
              </div>
            </div>
          )}
          {bdResult?.error&&<div style={{color:"var(--danger)",fontSize:13,padding:12,background:"var(--danger-soft)",borderRadius:8}}>{bdResult.error}</div>}
        </div>
      )}

      {/* MODAL AGREGAR RUBRO */}
      {!showAdminBD&&modalRubro&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.3)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,padding:20}} onClick={()=>setModalRubro(null)}>
          <div style={{background:"#fff",borderRadius:16,padding:20,maxWidth:520,width:"100%",maxHeight:"80vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,0.15)"}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div>
                <div style={{fontSize:14,fontWeight:700,color:"var(--ink)"}}>Agregar rubro</div>
                <div style={{fontSize:12,color:"var(--brand)",marginTop:2}}>{capitulosActivos.find(c=>c.nombre===modalRubro.capitulo)?.orden}. {modalRubro.capitulo}</div>
              </div>
              <button onClick={()=>setModalRubro(null)} style={{background:"var(--neutral-soft)",border:"none",borderRadius:6,width:28,height:28,color:"var(--ink-soft)",cursor:"pointer",fontSize:15}}>×</button>
            </div>
            <div style={{display:"flex",gap:4,marginBottom:12,background:"var(--neutral-soft)",borderRadius:8,padding:4}}>
              <button onClick={()=>{setModalRubro(p=>({...p,modo:"bd"}));setBusquedaRubro("");buscarRubros("");fetchCapitulosDB();}} style={{flex:1,background:modalRubro.modo==="bd"?"var(--brand)":"transparent",border:"none",borderRadius:6,padding:"6px",color:modalRubro.modo==="bd"?"#fff":"var(--ink-soft)",fontSize:12,fontWeight:600,cursor:"pointer"}}>De la BD</button>
              <button onClick={()=>setModalRubro(p=>({...p,modo:"manual"}))} style={{flex:1,background:modalRubro.modo==="manual"?"var(--brand)":"transparent",border:"none",borderRadius:6,padding:"6px",color:modalRubro.modo==="manual"?"#fff":"var(--ink-soft)",fontSize:12,fontWeight:600,cursor:"pointer"}}>Manual</button>
            </div>
            {modalRubro.modo==="bd"&&(
              <div style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden"}}>
                <input value={busquedaRubro} onChange={e=>{setBusquedaRubro(e.target.value);buscarRubros(e.target.value);}} placeholder="Buscar rubro..." style={{...iS,marginBottom:10}}/>
                <div style={{overflowY:"auto",flex:1,border:"1px solid var(--neutral-soft)",borderRadius:8}}>
                  {rubrosDB.length===0?<div style={{textAlign:"center",color:"var(--muted)",padding:"20px 0",fontSize:13}}>Escribe para buscar en la base de datos</div>
                  :rubrosDB.map(r=>(
                    <div key={r.id} style={{borderBottom:"1px solid var(--neutral-soft)"}}>
                      <div onClick={()=>setRubroSeleccionado(rubroSeleccionado?.id===r.id?null:r)}
                        style={{padding:"10px 12px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}
                        onMouseEnter={e=>e.currentTarget.style.background="var(--brand-soft)"} onMouseLeave={e=>e.currentTarget.style.background=""}>
                        <div>
                          <div style={{fontSize:13,fontWeight:500,color:"var(--ink)"}}>{r.descripcion}</div>
                          <div style={{fontSize:11,color:"var(--muted)"}}>{r.capitulos?.nombre} · {r.unidad}</div>
                        </div>
                        <div style={{textAlign:"right",marginLeft:10,flexShrink:0}}>
                          <div style={{fontSize:13,fontWeight:600,color:"var(--brand)"}}>${fmt(r.precio_referencia)}</div>
                          <div style={{fontSize:10,color:"var(--muted)"}}>{r.precios_historial?.length||0} precios · {rubroSeleccionado?.id===r.id?"▲":"▼"}</div>
                        </div>
                      </div>
                      {rubroSeleccionado?.id===r.id&&(
                        <div style={{background:"var(--bg)",padding:"8px 12px",borderTop:"1px solid var(--neutral-soft)"}}>
                          <div style={{fontSize:10,fontWeight:600,color:"var(--ink-soft)",marginBottom:6,letterSpacing:0.5}}>PRECIOS POR CLIENTE</div>
                          {r.precios_historial?.length===0&&<div style={{fontSize:11,color:"var(--muted)"}}>Sin historial de precios.</div>}
                          {[...new Map(r.precios_historial?.map(h=>[h.cliente_nombre,h])).values()].map((h,i)=>(
                            <div key={i} onClick={()=>agregarItem(modalRubro.capitulo,{...r,precio_unitario:h.precio_unitario})}
                              style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 8px",borderRadius:6,marginBottom:3,cursor:"pointer",background:"#fff",border:"1px solid var(--border)"}}
                              onMouseEnter={e=>e.currentTarget.style.borderColor="var(--brand)"} onMouseLeave={e=>e.currentTarget.style.borderColor="var(--border)"}>
                              <div style={{fontSize:11,color:"var(--ink-soft)"}}>{h.cliente_nombre||"Sin cliente"} <span style={{color:"var(--muted)"}}>({h.fecha})</span></div>
                              <div style={{fontWeight:600,color:"var(--brand)",fontSize:12}}>${fmt(h.precio_unitario)} <span style={{fontSize:9,color:"var(--muted)"}}>usar este</span></div>
                            </div>
                          ))}
                          <div onClick={()=>agregarItem(modalRubro.capitulo,{...r,precio_unitario:r.precio_referencia})}
                            style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 8px",borderRadius:6,cursor:"pointer",background:"var(--brand-soft)",border:"1px solid var(--border)",marginTop:4}}>
                            <div style={{fontSize:11,color:"var(--brand)",fontWeight:500}}>Precio promedio / referencia</div>
                            <div style={{fontWeight:600,color:"var(--brand)",fontSize:12}}>${fmt(r.precio_referencia)} <span style={{fontSize:9}}>usar</span></div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {modalRubro.modo==="manual"&&(
              <div style={{display:"grid",gap:12}}>
                <div><label style={{fontSize:11,color:"var(--ink-soft)",display:"block",marginBottom:4}}>Descripción *</label>
                  <input value={manualRubro.descripcion} onChange={e=>setManualRubro(p=>({...p,descripcion:e.target.value}))} placeholder="Descripción del rubro" style={iS}/></div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                  <div><label style={{fontSize:11,color:"var(--ink-soft)",display:"block",marginBottom:4}}>Unidad</label>
                    <input value={manualRubro.unidad} onChange={e=>setManualRubro(p=>({...p,unidad:e.target.value}))} placeholder="m², ml, glb..." style={iS}/></div>
                  <div><label style={{fontSize:11,color:"var(--ink-soft)",display:"block",marginBottom:4}}>Cantidad</label>
                    <input type="number" value={manualRubro.cantidad} onChange={e=>setManualRubro(p=>({...p,cantidad:e.target.value}))} style={iS}/></div>
                  <div><label style={{fontSize:11,color:"var(--ink-soft)",display:"block",marginBottom:4}}>Precio unit.</label>
                    <input type="number" value={manualRubro.precio_unitario} onChange={e=>setManualRubro(p=>({...p,precio_unitario:e.target.value}))} style={iS}/></div>
                </div>
                <div style={{background:"var(--bg)",borderRadius:8,padding:"8px 12px",fontSize:12,color:"var(--ink-soft)",display:"flex",justifyContent:"space-between"}}>
                  <span>Total:</span><span style={{fontWeight:700,color:"var(--brand)"}}>${fmt((Number(manualRubro.cantidad)||0)*(Number(manualRubro.precio_unitario)||0))}</span>
                </div>
                <button onClick={()=>agregarItem(modalRubro.capitulo,{...manualRubro,precio_referencia:manualRubro.precio_unitario})} disabled={!manualRubro.descripcion}
                  style={{background:manualRubro.descripcion?"var(--brand)":"var(--neutral-soft)",border:"none",borderRadius:8,padding:"10px",color:manualRubro.descripcion?"#fff":"var(--muted)",fontSize:13,fontWeight:600,cursor:manualRubro.descripcion?"pointer":"default"}}>
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

