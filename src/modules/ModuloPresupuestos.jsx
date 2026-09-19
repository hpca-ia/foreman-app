import { useState, useRef, useEffect } from "react";
import { Trash2, Copy, Database, Archive, ArchiveRestore, Search } from "lucide-react";
import ConfirmarBorrado from "../components/ui/ConfirmarBorrado";
import { supabase } from "../lib/supabase";
import { alimentarBase, resumenAlimentacion, preciosDeLaBase } from "../lib/baseRubros";
import AdminBD from "./AdminBD";
import BaseRubros from "./presupuestos/BaseRubros";
import PreguntasNova from "../components/PreguntasNova";
import { reconocerExcel, recordarFormato } from "../lib/leerExcelPresupuesto";
import { interpretarPresupuesto } from "./controlObra/leerPresupuesto";
import { RESPUESTAS_VACIAS, faltanRespuestas, unidadParaBase } from "../lib/preguntasNova";
import CotizacionPanel from "./CotizacionPanel";
import ExportarPresupuesto from "./presupuestos/ExportarPresupuesto";
import ImportarObra from "./controlObra/ImportarObra";
import PreciosDeRubro from "./presupuestos/PreciosDeRubro";
import PasarABase from "./presupuestos/PasarABase";
import EditorHonorarios from "./presupuestos/EditorHonorarios";
import RevisarPresupuesto from "./presupuestos/RevisarPresupuesto";
import { CampoPrecio, CampoTexto, SelectorUnidad } from "./presupuestos/camposRubro";
import { lineasHonorarios, totalesPresupuesto } from "./presupuestos/honorarios";

// Los precios y totales van siempre a dos decimales: 0,75 con 10 % de
// utilidad es 0,83, no 0,825. Un presupuesto no cobra fracciones de centavo.
const centavos = v => Math.round((Number(v) || 0) * 100) / 100;

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
  // Lo último de los rubros, para cambios seguidos (aplicar varias correcciones
  // de NOVA de una vez): cada uno parte del anterior, no de una copia vieja.
  const itemsRef = useRef(items); itemsRef.current = items;
  const [exportar, setExportar] = useState(false);
  // El rubro cuyo precio base se está eligiendo de la base de rubros, y la
  // base leída (se vuelve a leer si pasó más de un minuto: una cotización
  // recién guardada tiene que aparecer).
  const [eligiendoPrecio, setEligiendoPrecio] = useState(null);
  const [pasarABase, setPasarABase] = useState(false);
  // Armar: capítulos y rubros en su orden. Revisar: la misma información en
  // una tabla que se ordena por precio, cantidad o total, con alertas y NOVA.
  const [modoDetalle, setModoDetalle] = useState("armar");
  // La lista: los que se trabajan y los históricos, que quedan de referencia.
  const [pestanaLista, setPestanaLista] = useState("activos");
  const [busquedaLista, setBusquedaLista] = useState("");
  const [baseRubros, setBaseRubros] = useState(null);
  const [uploadingCotizacion, setUploadingCotizacion] = useState(false);
  const [cotizacionResult, setCotizacionResult] = useState(null);
  const [uploadingBD, setUploadingBD] = useState(false);
  const [bdResult, setBdResult] = useState(null);
  const [bdRubros, setBdRubros] = useState([]); // editable rubros list
  const [bdMeta, setBdMeta] = useState({ proveedor:"", cliente:"", fecha:new Date().getFullYear().toString() });
  // Lo que NOVA pregunta antes de guardar (origen de los precios, unidades) y
  // lo leído del Excel, para recordar su formato.
  const [bdPreguntas, setBdPreguntas] = useState(RESPUESTAS_VACIAS);
  const [bdSugerencia, setBdSugerencia] = useState({});
  const [bdLectura, setBdLectura] = useState(null);
  const [guardandoBD, setGuardandoBD] = useState(false);
  const [proveedores, setProveedores] = useState([]);
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

  useEffect(() => { fetchPresupuestos(); fetchClientes(); fetchProveedores(); fetchCapitulosDB(); }, []);

  // Si el total guardado quedó atrás de sus rubros —un cambio que no alcanzó a
  // recalcular—, se corrige al abrirlo. Solo con los rubros de este mismo
  // presupuesto: al cambiar de uno a otro, un instante se ven los del anterior,
  // y recalcular ahí le escribiría a uno los totales del otro.
  useEffect(() => {
    if (subVista !== "detalle" || !presupuestoActivo || !items.length) return;
    if (!items.every(i => i.presupuesto_id === presupuestoActivo.id)) return;
    const suma = Math.round(items.reduce((s, i) => s + (Number(i.total) || 0), 0) * 100) / 100;
    if (Math.abs((Number(presupuestoActivo.subtotal) || 0) - suma) > 0.01) recalcTotales(items);
  }, [items, presupuestoActivo?.id, presupuestoActivo?.subtotal, subVista]); // eslint-disable-line

  async function fetchPresupuestos() {
    const { data } = await supabase.from("presupuestos").select("*").order("created_at",{ascending:false});
    setPresupuestos(data||[]);
  }
  async function fetchClientes() {
    const { data } = await supabase.from("clientes").select("*").order("nombre");
    setClientes(data||[]);
  }
  async function fetchProveedores() {
    const { data } = await supabase.from("proveedores").select("id,nombre").order("nombre");
    setProveedores(data||[]);
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
  // "Casa Fowler" → "Casa Fowler (v2)", y la siguiente "(v3)": el número sale de
  // las versiones que ya existen, no de contar clics.
  function siguienteVersion(nombre) {
    const base = nombre.replace(/\s*\(v\d+\)\s*$/i, "").trim();
    const esc = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`^${esc}(?:\\s*\\(v(\\d+)\\))?$`, "i");
    const nums = presupuestos.map(p => (p.nombre || "").trim().match(re)).filter(Boolean).map(m => Number(m[1] || 1));
    return `${base} (v${Math.max(1, ...nums) + 1})`;
  }

  async function duplicarPresupuesto(pre, nombreNuevo) {
    setDuplicando(pre.id);
    const { data: nuevo, error } = await supabase.from("presupuestos").insert({
      nombre: nombreNuevo || `${pre.nombre} (copia)`,
      cliente_id: pre.cliente_id, cliente_nombre: pre.cliente_nombre,
      honorarios_pct: pre.honorarios_pct, iva_pct: pre.iva_pct,
      ...(Array.isArray(pre.honorarios) ? { honorarios: pre.honorarios } : {}),
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

  // Un precio elegido de la base de rubros reemplaza el precio base: la
  // utilidad del rubro se conserva y el precio final se recalcula con ella.
  async function aplicarPreciosBase(cambios) {
    const porId = new Map(cambios.map(c => [c.id, Number(c.precio_base)]));
    const nuevos = items.map(i => {
      if (!porId.has(i.id)) return i;
      const base = porId.get(i.id);
      const pct = Number(i.utilidad_pct) || 0;
      const precio = centavos(base * (1 + pct / 100));
      return { ...i, precio_base: base, precio_unitario: precio, total: centavos((Number(i.cantidad) || 0) * precio) };
    });
    const cambiados = nuevos.filter(i => porId.has(i.id));
    const res = await Promise.all(cambiados.map(i => supabase.from("presupuesto_items")
      .update({ precio_base: i.precio_base, precio_unitario: i.precio_unitario, total: i.total }).eq("id", i.id)));
    const fallo = res.find(r => r.error);
    if (fallo) { alert("No se pudieron actualizar todos los precios: " + fallo.error.message); return; }
    setItems(nuevos); recalcTotales(nuevos); setEligiendoPrecio(null);
  }

  function abrirPreciosDeRubro(item) {
    setEligiendoPrecio(item);
    if (!baseRubros || Date.now() - baseRubros.leida > 60000) {
      setBaseRubros(null);
      preciosDeLaBase().then(b => setBaseRubros({ ...b, leida: Date.now() })).catch(() => setBaseRubros({ buscar: () => null, leida: Date.now() }));
    }
  }

  // Honorarios: ninguno, de administración, de diseño arquitectónico, los dos
  // u otros, en % del costo directo o monto fijo. Sin la migración 028 solo
  // se puede guardar la suma de los porcentajes, y se avisa.
  async function guardarHonorarios(lista) {
    const limpia = lista.map(h => ({ nombre: String(h.nombre || "").trim(), tipo: h.tipo === "monto" ? "monto" : "pct", valor: Number(h.valor) || 0 }));
    const sumaPct = limpia.filter(h => h.tipo === "pct").reduce((s, h) => s + h.valor, 0);
    const { error } = await supabase.from("presupuestos").update({ honorarios: limpia, honorarios_pct: sumaPct }).eq("id", presupuestoActivo.id);
    if (error && /column|schema cache/i.test(error.message)) {
      alert("Falta correr la migración 028 en Supabase para guardar varios honorarios con su nombre. Por ahora se guarda solo la suma de los porcentajes.");
      await supabase.from("presupuestos").update({ honorarios_pct: sumaPct }).eq("id", presupuestoActivo.id);
    } else if (error) { alert("No se pudieron guardar los honorarios: " + error.message); return; }
    recalcTotales(items, { honorarios: limpia, honorarios_pct: sumaPct });
  }

  // El área la escribe quien arma el presupuesto: no sale de los rubros.
  async function guardarArea(valor) {
    const area = Number(valor) > 0 ? Number(valor) : null;
    if ((presupuestoActivo.area_m2 ?? null) === area) return;
    setPresupuestoActivo(p => ({ ...p, area_m2: area }));
    const { error } = await supabase.from("presupuestos").update({ area_m2: area }).eq("id", presupuestoActivo.id);
    if (error && /column|schema cache/i.test(error.message)) alert("Falta correr la migración 029 en Supabase para guardar el área. Por ahora el valor por m² se ve, pero no queda guardado.");
    else if (error) alert("No se pudo guardar el área: " + error.message);
  }

  // Pasar a históricos no borra ni cambia nada del presupuesto: deja de estar
  // entre los que se trabajan y queda de referencia, de solo lectura.
  async function archivarPresupuesto(pre, archivar) {
    const archivado_at = archivar ? new Date().toISOString() : null;
    const { error } = await supabase.from("presupuestos").update({ archivado_at }).eq("id", pre.id);
    if (error) {
      alert(/column|schema cache/i.test(error.message) ? "Falta correr la migración 030 en Supabase para separar activos y pasados." : "No se pudo mover: " + error.message);
      return;
    }
    setPresupuestos(ps => ps.map(p => p.id === pre.id ? { ...p, archivado_at } : p));
    if (presupuestoActivo?.id === pre.id) setPresupuestoActivo(p => ({ ...p, archivado_at }));
  }

  async function renombrarPresupuesto(nombre) {
    const limpio = String(nombre || "").trim();
    if (!presupuestoActivo || !limpio || limpio === presupuestoActivo.nombre) return;
    const { error } = await supabase.from("presupuestos").update({ nombre: limpio }).eq("id", presupuestoActivo.id);
    if (error) { alert("No se pudo cambiar el nombre: " + error.message); return; }
    setPresupuestoActivo(p => ({ ...p, nombre: limpio }));
    setPresupuestos(ps => ps.map(p => p.id === presupuestoActivo.id ? { ...p, nombre: limpio } : p));
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

  // El orden de los rubros es lo único que se guarda del orden: al volver a
  // abrir el presupuesto, los capítulos se reconstruyen desde ese número
  // (capítulo × 1000 + posición). Mover un capítulo solo en pantalla, como
  // antes, se perdía al recargar.
  function numerar(caps, lista, secuencias = {}) {
    const porId = new Map(lista.map(i => [i.id, { ...i }]));
    caps.forEach(c => {
      const ids = secuencias[c.nombre] || lista.filter(i => i.capitulo === c.nombre).sort((a, b) => a.orden - b.orden).map(i => i.id);
      ids.forEach((id, k) => { const x = porId.get(id); if (x) x.orden = c.orden * 1000 + k; });
    });
    return lista.map(i => porId.get(i.id));
  }
  async function guardarOrden(nuevos) {
    const antes = new Map(items.map(i => [i.id, i.orden]));
    setItems(nuevos);
    const cambios = nuevos.filter(i => antes.get(i.id) !== i.orden);
    const res = await Promise.all(cambios.map(i => supabase.from("presupuesto_items").update({ orden: i.orden }).eq("id", i.id)));
    const fallo = res.find(r => r.error);
    if (fallo) alert("No se pudo guardar el orden: " + fallo.error.message);
  }
  async function moverRubro(item, direccion) {
    const ids = items.filter(i => i.capitulo === item.capitulo).sort((a, b) => a.orden - b.orden).map(i => i.id);
    const k = ids.indexOf(item.id), j = k + direccion;
    if (k < 0 || j < 0 || j >= ids.length) return;
    [ids[k], ids[j]] = [ids[j], ids[k]];
    await guardarOrden(numerar(capitulosActivos, items, { [item.capitulo]: ids }));
  }

  function agregarCapitulo(nombre) {
    const trimmed = nombre.trim();
    if (!trimmed || capitulosActivos.find(c=>c.nombre===trimmed)) return;
    const nuevoOrden = Math.max(0, ...capitulosActivos.map(c=>c.orden)) + 1;
    setCapitulosActivos(prev=>[...prev, { nombre:trimmed, orden:nuevoOrden }]);
    saveCapituloToDB(trimmed);
    setNuevoCapitulo(""); setShowAddCap(false);
  }

  function eliminarCapitulo(nombre) {
    if (items.some(i=>i.capitulo===nombre)) { alert(`Elimina primero los rubros de "${nombre}".`); return; }
    const updated = capitulosActivos.filter(c=>c.nombre!==nombre)
      .map((c,i)=>({...c, orden:i+1}));
    setCapitulosActivos(updated);
    guardarOrden(numerar(updated, items));
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
    guardarOrden(numerar(reordered, items));
  }

  async function agregarItem(capitulo, rubro) {
    if (!presupuestoActivo) return;
    const capOrden = capitulosActivos.find(c=>c.nombre===capitulo)?.orden || 1;
    // Después del último: contar los rubros chocaba con uno existente si se
    // había borrado alguno del medio.
    const ultimaPos = Math.max(-1, ...items.filter(i=>i.capitulo===capitulo).map(i=>(Number(i.orden)||0) % 1000));
    const orden = capOrden * 1000 + ultimaPos + 1;
    const { data } = await supabase.from("presupuesto_items").insert({
      presupuesto_id:presupuestoActivo.id,
      capitulo, rubro_id:rubro.id||null,
      descripcion:rubro.descripcion,
      unidad:rubro.unidad||"",
      cantidad:Number(rubro.cantidad)||1,
      precio_unitario:centavos(rubro.precio_unitario||rubro.precio_referencia),
      total:centavos((Number(rubro.cantidad)||1)*centavos(rubro.precio_unitario||rubro.precio_referencia)),
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
      u.total=centavos((Number(u.cantidad)||0)*(Number(u.precio_unitario)||0));
      return u;
    });
    setItems(updated);
    const item=updated.find(i=>i.id===id);
    await supabase.from("presupuesto_items").update({[campo]:valor,total:item.total}).eq("id",id);
    recalcTotales(updated);
  }

  async function actualizarItemMulti(id, campos) {
    const updated = itemsRef.current.map(i => {
      if (i.id!==id) return i;
      const u={...i,...campos};
      u.total=centavos((Number(u.cantidad)||0)*(Number(u.precio_unitario)||0));
      return u;
    });
    itemsRef.current = updated;
    setItems(updated);
    await supabase.from("presupuesto_items").update({...campos,total:updated.find(i=>i.id===id)?.total}).eq("id",id);
    recalcTotales(updated);
  }

  async function aplicarUtilidadCapitulo(capNombre, pct) {
    const capItems = items.filter(i=>i.capitulo===capNombre);
    const updated = items.map(i => {
      if (i.capitulo!==capNombre) return i;
      const base = i.precio_base||i.precio_unitario;
      const nuevo = centavos(Number(base)*(1+pct/100));
      const u={...i,utilidad_pct:pct,precio_base:base,precio_unitario:nuevo};
      u.total=centavos((Number(u.cantidad)||0)*nuevo);
      return u;
    });
    setItems(updated);
    for (const i of capItems) {
      const base=i.precio_base||i.precio_unitario;
      const nuevo=centavos(Number(base)*(1+pct/100));
      await supabase.from("presupuesto_items").update({utilidad_pct:pct,precio_base:base,precio_unitario:nuevo,total:centavos((Number(i.cantidad)||0)*nuevo)}).eq("id",i.id);
    }
    recalcTotales(updated);
  }

  async function eliminarItem(id) {
    await supabase.from("presupuesto_items").delete().eq("id",id);
    const u=items.filter(i=>i.id!==id); setItems(u); recalcTotales(u);
  }

  async function recalcTotales(itemsList, overrides={}) {
    if (!presupuestoActivo) return;
    // La misma cuenta que el PDF y el Excel (honorarios.js), a centavos:
    // guardar 353,265 de IVA hacía que la pantalla y el documento redondearan
    // distinto.
    const conCambios={...presupuestoActivo,...overrides};
    const t=totalesPresupuesto(itemsList.reduce((s,i)=>s+(Number(i.total)||0),0),{...conCambios,iva_pct:conCambios.iva_pct??12});
    const subtotal=t.subtotal, honorarios_monto=t.honorarios_monto, iva_monto=t.iva, total=t.total;
    const upd={...conCambios,subtotal,honorarios_monto,iva_monto,total};
    setPresupuestoActivo(upd);
    await supabase.from("presupuestos").update({subtotal,honorarios_monto,iva_monto,total}).eq("id",presupuestoActivo.id);
  }

  async function leerCotizacion(e) {
    const file=e.target.files[0]; if(!file) return;
    setUploadingCotizacion(true); setCotizacionResult(null);
    // Los totales escritos en la cotización vienen aparte: son la prueba de que
    // se leyeron todos los rubros, y se muestran antes de aplicarla.
    // Muchas proformas traen dos precios por rubro (P.V.P. y con descuento) o
    // un descuento general al final: NOVA trae los dos y quien importa elige.
    const prompt = 'Extrae todos los rubros. Responde UNICAMENTE con JSON valido, sin texto adicional, sin markdown: {"proveedor":"nombre o vacio","rubros":[{"descripcion":"texto","unidad":"m2 o u o glb etc","cantidad":1,"precio_unitario":0.00,"precio_pvp":null,"precio_descuento":null}],"subtotal":null,"iva":null,"total":null,"descuento_pct":null,"descuento_monto":null}. Si cada rubro trae DOS precios unitarios (por ejemplo P.V.P. o precio de lista, y precio con descuento o precio neto), pon ambos en precio_pvp y precio_descuento, y en precio_unitario el con descuento; si hay un solo precio, deja precio_pvp y precio_descuento en null. Si al final hay un descuento general, pon su porcentaje en descuento_pct y su monto en descuento_monto. En subtotal, iva y total pon los valores TAL COMO ESTAN ESCRITOS en el documento (subtotal sin IVA, el IVA, y el total a pagar), o null si no aparecen. No los calcules.';
    try {
      const base64=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(",")[1]);r.onerror=rej;r.readAsDataURL(file);});
      let msgContent;
      if (file.type.startsWith("image/")) {
        msgContent=[{type:"image",source:{type:"base64",media_type:file.type,data:base64}},{type:"text",text:prompt}];
      } else if (file.type==="application/pdf") {
        msgContent=[{type:"document",source:{type:"base64",media_type:"application/pdf",data:base64}},{type:"text",text:prompt}];
      } else if (file.name.match(/\.(xlsx|xls|csv)$/i)) {
        const XLSX = await import("xlsx");
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
        cantidad:r.cantidad||1, precio_unitario:centavos(r.precio_unitario),
        total:centavos((r.cantidad||1)*centavos(r.precio_unitario)),
        orden:capOrden*1000+newItems.length
      }).select().single();
      if (data) newItems.push(data);
    }
    const all=[...items,...newItems]; setItems(all); setCotizacionResult(null); recalcTotales(all);
  }

  async function leerParaBD(e) {
    const file=e.target.files[0]; if(!file) return;
    setUploadingBD(true); setBdResult(null); setBdLectura(null);
    const prompt='Extrae rubros del presupuesto. SOLO JSON compacto sin espacios extra: {"proveedor":"","cliente":"","capitulos":["cap1"],"rubros":[{"c":"capitulo","d":"descripcion breve max 60 chars","u":"unidad","q":1,"p":0.00}]}. "proveedor" es la empresa que hizo el documento y "cliente" a quién va dirigido; si no aparecen, vacíos. Abrevia descripciones largas. Incluye TODOS los rubros.';
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
        // La misma lectura que al importar una obra: formato aprendido o NOVA
        // reconoce las columnas, y las filas se recorren sin IA.
        const lectura = await reconocerExcel(file);
        const r = interpretarPresupuesto(lectura.filas, lectura.mapa);
        if (r.rubros.length >= 3) {
          setBdResult({ capitulos: [...new Set(r.rubros.map(x => x.capitulo))], rubros: r.rubros, cargos: r.cargos });
          setBdRubros(r.rubros.map(x => ({ fila: x.fila, capitulo: x.capitulo, descripcion: x.descripcion, unidad: x.unidad, cantidad: x.cantidad, precio_unitario: x.precio_unitario })));
          setBdLectura({ filas: lectura.filas, mapa: r.mapa, archivo: file.name, origen: lectura.origen });
          setBdSugerencia({ emisor: lectura.datos.emisor || "", cliente: lectura.datos.cliente || "" });
          setBdPreguntas({ ...RESPUESTAS_VACIAS, cliente: lectura.datos.cliente || "" });
          setBdMeta({ proveedor: lectura.datos.nombre || file.name.replace(/\.(xlsx|xls|csv)$/i, ""), cliente: "", fecha: new Date().getFullYear().toString() });
          setUploadingBD(false); e.target.value = ""; return;
        }
        // Si no salieron rubros, NOVA lee el Excel entero.
        const XLSX = await import("xlsx");
        const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const csv = workbook.SheetNames.map(h => XLSX.utils.sheet_to_csv(workbook.Sheets[h])).join("\n");
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
      setBdRubros((parsed.rubros||[]).map((r, i) => ({ ...r, fila: i })));
      setBdSugerencia({ emisor: parsed.proveedor || "", cliente: parsed.cliente || "" });
      setBdPreguntas({ ...RESPUESTAS_VACIAS, cliente: parsed.cliente || "" });
      setBdMeta({ proveedor:file.name.replace(/\.[^.]+$/, ""), cliente:"", fecha:new Date().getFullYear().toString() });
    } catch(err) { setBdResult({error:"Error: "+err.message}); }
    setUploadingBD(false); e.target.value="";
  }

  async function guardarEnBD() {
    if (!bdRubros.length || faltanRespuestas(bdPreguntas, bdRubros).length) return;
    setGuardandoBD(true);
    const res = await alimentarBase(
      bdRubros.map(r => ({ descripcion: r.descripcion, unidad: unidadParaBase(r, bdPreguntas), precio_unitario: r.precio_unitario, capitulo: r.capitulo, cantidad: r.cantidad })),
      { tipo: bdPreguntas.tipo, cliente: bdPreguntas.cliente, proveedor: bdPreguntas.proveedor, proyecto: bdMeta.proveedor, fecha: bdMeta.fecha, fuente: "alimentar", utilidad: bdPreguntas.utilidad }
    );
    // Se guardó bien: el formato del Excel queda aprendido.
    if (bdLectura && !res.error) await recordarFormato({ filas: bdLectura.filas, mapa: bdLectura.mapa, archivo: bdLectura.archivo, usuarioId: currentUser?.id });
    fetchCapitulosDB(); fetchClientes(); fetchProveedores();
    setGuardandoBD(false);
    alert(res.error ? "⚠️ " + res.error : "✅ " + (resumenAlimentacion(res) || "No había nada nuevo que guardar."));
    setBdResult(null); setBdLectura(null);
  }

  const fmt=n=>(Number(n)||0).toLocaleString("es-EC",{minimumFractionDigits:2,maximumFractionDigits:2});
  // El costo directo de lo que está en pantalla: la suma de los rubros, no el
  // subtotal guardado, que puede haber quedado atrás si algo cambió sin
  // recalcular.
  const costoDirecto=items.reduce((s,i)=>s+(Number(i.total)||0),0);
  const iS={width:"100%",background:"var(--bg)",border:"1px solid var(--border)",borderRadius:8,color:"var(--ink)",padding:"9px 12px",fontSize:13,fontFamily:"var(--font)",boxSizing:"border-box",outline:"none"};

  return (
    <div style={{fontFamily:"var(--font)"}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:8}}>
        <div>
          {subVista==="detalle"&&presupuestoActivo ? (
            // El nombre se cambia ahí mismo: al volver a trabajar uno terminado,
            // lo primero es que no se confunda con el que ya se mandó.
            <input key={presupuestoActivo.id} defaultValue={presupuestoActivo.nombre} title="Toca para cambiar el nombre" disabled={!!presupuestoActivo.archivado_at}
              onBlur={e=>renombrarPresupuesto(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter") e.currentTarget.blur(); }}
              style={{fontSize:17,fontWeight:700,color:"var(--ink)",background:"transparent",border:"none",borderBottom:"1.5px dashed var(--border)",outline:"none",padding:"0 0 1px",fontFamily:"var(--font)",width:"min(520px, 70vw)"}}/>
          ) : (
          <div style={{fontSize:17,fontWeight:700,color:"var(--ink)"}}>
            {subVista==="lista"?"Presupuestos":subVista==="nuevo"?"Nuevo presupuesto":subVista==="importar"?"Nuevo presupuesto desde Excel":subVista==="baseDatos"?"Base de rubros":"Alimentar BD"}
          </div>
          )}
          {subVista==="detalle"&&presupuestoActivo&&<div style={{fontSize:12,color:"var(--ink-soft)",marginTop:2}}>{presupuestoActivo.cliente_nombre} · Total: ${fmt(presupuestoActivo.total)}</div>}
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {subVista!=="lista"&&<button onClick={()=>setSubVista("lista")} style={{background:"var(--neutral-soft)",border:"none",borderRadius:8,padding:"7px 12px",color:"var(--ink-soft)",fontSize:12,cursor:"pointer"}}>← Volver</button>}
          {subVista==="lista"&&<>
            <button onClick={()=>{setSubVista("baseDatos");buscarRubros("");}} style={{background:"var(--neutral-soft)",border:"none",borderRadius:8,padding:"7px 12px",color:"var(--ink-soft)",fontSize:12,cursor:"pointer"}}>Base de rubros</button>
            <button onClick={()=>setSubVista("alimentarBD")} style={{background:"var(--neutral-soft)",border:"none",borderRadius:8,padding:"7px 12px",color:"var(--ink-soft)",fontSize:12,cursor:"pointer"}}>Alimentar BD</button>
            <button onClick={()=>setShowAdminBD(true)} style={{background:"var(--neutral-soft)",border:"none",borderRadius:8,padding:"7px 12px",color:"var(--ink-soft)",fontSize:12,cursor:"pointer"}}>Admin BD</button>
            <button onClick={()=>setSubVista("importar")} style={{background:"var(--brand-soft)",border:"1.5px solid var(--border)",borderRadius:8,padding:"7px 12px",color:"var(--brand)",fontSize:12,fontWeight:600,cursor:"pointer"}}>Desde Excel</button>
            <button onClick={()=>setSubVista("nuevo")} style={{background:"var(--brand)",border:"none",borderRadius:8,padding:"7px 12px",color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}>+ Nuevo presupuesto</button>
          </>}
          {subVista==="detalle"&&<>
            <button onClick={()=>duplicarPresupuesto(presupuestoActivo, siguienteVersion(presupuestoActivo.nombre))} disabled={duplicando===presupuestoActivo?.id}
              title="Copia este presupuesto para volver a trabajarlo. El original queda tal cual."
              style={{background:"#fff",border:"1.5px solid var(--border)",borderRadius:8,padding:"7px 12px",color:"var(--ink-soft)",fontSize:12,fontWeight:600,cursor:"pointer"}}>{duplicando===presupuestoActivo?.id?"Copiando…":"Nueva versión"}</button>
            {!presupuestoActivo?.archivado_at&&<button onClick={()=>document.getElementById("cotiz-input").click()} style={{background:"var(--brand-soft)",border:"1.5px solid var(--border)",borderRadius:8,padding:"7px 12px",color:"var(--brand)",fontSize:12,fontWeight:600,cursor:"pointer"}}>🤖 Subir cotización</button>}
            <button onClick={()=>setPasarABase(true)} disabled={items.length===0}
              title={presupuestoActivo?.en_base_at?`Pasado a la base el ${new Date(presupuestoActivo.en_base_at).toLocaleDateString("es-EC")}`:"Cuando lo des por bueno: sus precios entran a la base de rubros"}
              style={{background:"#fff",border:"1.5px solid var(--border)",borderRadius:8,padding:"7px 12px",color:"var(--ink-soft)",fontSize:12,fontWeight:600,cursor:"pointer"}}>
              {presupuestoActivo?.en_base_at?"✓ En la base":"Pasar a la base"}
            </button>

            <button onClick={()=>setExportar(true)} disabled={items.length===0} style={{background:"var(--brand)",border:"none",borderRadius:8,padding:"7px 12px",color:"#fff",fontSize:12,fontWeight:600,cursor:items.length?"pointer":"default",opacity:items.length?1:0.5}}>Exportar</button>
          </>}
        </div>
      </div>

      {showAdminBD&&<AdminBD onVolver={()=>setShowAdminBD(false)} currentUser={currentUser}/>}
      {pasarABase&&presupuestoActivo&&<PasarABase presupuesto={presupuestoActivo} items={items} onCerrar={()=>setPasarABase(false)}
        onHecho={t=>{setPresupuestoActivo(p=>({...p,en_base_at:t}));setPresupuestos(ps=>ps.map(p=>p.id===presupuestoActivo.id?{...p,en_base_at:t}:p));}}/>}
      {eligiendoPrecio&&<PreciosDeRubro item={items.find(i=>i.id===eligiendoPrecio.id)||eligiendoPrecio} base={baseRubros}
        onCerrar={()=>setEligiendoPrecio(null)} onElegir={v=>aplicarPreciosBase([{id:eligiendoPrecio.id,precio_base:v}])}/>}
      {exportar&&presupuestoActivo&&<ExportarPresupuesto presupuesto={presupuestoActivo} capitulos={capitulosActivos} items={items} currentUser={currentUser}
        onCerrar={()=>setExportar(false)}
        onGuardado={e=>{setPresupuestoActivo(p=>({...p,exportacion:e}));setPresupuestos(ps=>ps.map(p=>p.id===presupuestoActivo.id?{...p,exportacion:e}:p));}}/>}
      <input id="cotiz-input" type="file" accept="image/*,.pdf,.xlsx,.xls" onChange={leerCotizacion} style={{display:"none"}}/>

      {!showAdminBD&&<>
      {/* COTIZACIÓN LEÍDA */}
      {uploadingCotizacion&&<div style={{background:"var(--brand-soft)",border:"1.5px solid var(--border)",borderRadius:10,padding:12,marginBottom:12,fontSize:13,color:"var(--brand)"}}>🤖 NOVA leyendo cotización...</div>}
      {cotizacionResult?.error&&<div style={{background:"var(--danger-soft)",border:"1.5px solid var(--danger-border)",borderRadius:10,padding:12,marginBottom:12,fontSize:12,color:"var(--danger)"}}>{cotizacionResult.error} <button onClick={()=>setCotizacionResult(null)} style={{background:"none",border:"none",color:"var(--danger)",cursor:"pointer",fontSize:14,marginLeft:8}}>×</button></div>}
      {cotizacionResult&&!cotizacionResult.error&&(
        <CotizacionPanel
          result={cotizacionResult}
          presupuesto={presupuestoActivo}
          clientes={clientes}
          capitulosActivos={capitulosActivos}
          onCancelar={()=>setCotizacionResult(null)}
          onImportar={(rubros, capNombre, utilidad, guardarBD, proveedor, clienteNombre, fecha)=>{
            // Import to presupuesto
            const capN = capNombre||"COTIZACIÓN PROVEEDOR";
            // Al capítulo que ya existe, a continuación de sus rubros; si es
            // nuevo, después del último. Antes el orden salía de contar los
            // capítulos y un capítulo nuevo podía caer en el rango de otro.
            const existente = capitulosActivos.find(c=>c.nombre===capN);
            const capOrden = existente ? existente.orden : Math.max(0,...capitulosActivos.map(c=>c.orden))+1;
            const yaEnCap = items.filter(i=>i.capitulo===capN).length;
            if (!existente) setCapitulosActivos(prev=>[...prev,{nombre:capN,orden:capOrden}]);
            const newItems=[];
            const rubrosValidos=rubros.filter(r=>r.descripcion&&r.descripcion.trim());
            supabase.from("presupuesto_items").insert(rubrosValidos.map((r,idx)=>({
              presupuesto_id:presupuestoActivo.id,
              capitulo:capN,
              descripcion:r.descripcion,
              unidad:r.unidad||"",
              cantidad:r.cantidad||1,
              precio_unitario:centavos(r.precio_unitario_final||r.precio_unitario),
              total:centavos((Number(r.cantidad)||1)*centavos(r.precio_unitario_final||r.precio_unitario)),
              orden:capOrden*1000+yaEnCap+idx
            }))).select().then(({data})=>{
              if(data){
                const all=[...items,...data];
                setItems(all);
                recalcTotales(all);
              }
            });
            // A la base solo si se marcó: hay cotizaciones de prueba, o de un
            // proveedor que no se quiere tener de referencia. Lo que cotiza un
            // proveedor es costo para HCA: la utilidad se suma en el presupuesto.
            if (guardarBD) {
              alimentarBase(rubrosValidos, { tipo: "proveedor", proveedor, cliente: clienteNombre, proyecto: presupuestoActivo?.nombre || proveedor, fecha, fuente: "cotizacion", utilidad: { estado: "costo" } })
                .then(r => { if (r.rubrosNuevos || r.capitulosNuevos) fetchCapitulosDB(); });
            }
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

      {subVista==="lista"&&(()=>{
        const q=busquedaLista.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
        const coincide=p=>!q||`${p.nombre} ${p.cliente_nombre||""}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").includes(q);
        const activos=presupuestos.filter(p=>!p.archivado_at), pasados=presupuestos.filter(p=>p.archivado_at);
        const lista=(pestanaLista==="activos"?activos:pasados).filter(coincide);
        return (
        <div>
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:12}}>
            <div style={{display:"inline-flex",gap:3,background:"var(--neutral-soft)",borderRadius:8,padding:3}}>
              {[["activos",`Activos (${activos.length})`],["pasados",`Pasados (${pasados.length})`]].map(([k,l])=>(
                <button key={k} onClick={()=>setPestanaLista(k)}
                  style={{padding:"6px 14px",borderRadius:6,border:"none",cursor:"pointer",fontFamily:"var(--font)",fontSize:12,fontWeight:600,
                    background:pestanaLista===k?"#fff":"transparent",color:pestanaLista===k?"var(--ink)":"var(--ink-soft)"}}>{l}</button>
              ))}
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6,background:"#fff",border:"1px solid var(--border)",borderRadius:8,padding:"6px 10px",flex:"1 1 220px",maxWidth:360}}>
              <Search size={13} color="var(--muted)"/>
              <input value={busquedaLista} onChange={e=>setBusquedaLista(e.target.value)} placeholder="Buscar por nombre o cliente"
                style={{border:"none",outline:"none",background:"transparent",fontSize:12,fontFamily:"var(--font)",color:"var(--ink)",flex:1,minWidth:0}}/>
            </div>
          </div>
          {pestanaLista==="pasados"&&<div style={{fontSize:11,color:"var(--muted)",marginBottom:10}}>Presupuestos que ya no se trabajan y quedan de referencia: se abren, se exportan y se copian, pero no se editan.</div>}
          {lista.length===0?<div style={{textAlign:"center",padding:"50px 0",color:"var(--muted)",fontSize:13}}>
            {q?"Ningún presupuesto coincide con la búsqueda.":pestanaLista==="activos"?<><div style={{fontSize:40,marginBottom:12}}>💼</div>Sin presupuestos activos.</>:"Todavía no hay presupuestos pasados."}
          </div>
          :lista.map(p=>(
            <div key={p.id} onClick={()=>{setPresupuestoActivo(p);fetchItems(p.id);setSubVista("detalle");setModoDetalle("armar");}}
              style={{background:"#fff",border:"1px solid var(--border)",borderRadius:10,padding:"14px 16px",marginBottom:8,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,opacity:p.archivado_at?0.85:1}}
              onMouseEnter={e=>e.currentTarget.style.borderColor="var(--brand)"} onMouseLeave={e=>e.currentTarget.style.borderColor="var(--border)"}>
              <div style={{minWidth:0}}>
                <div style={{fontWeight:600,color:"var(--ink)",fontSize:14}}>{p.nombre}</div>
                <div style={{fontSize:12,color:"var(--ink-soft)",marginTop:2}}>{p.cliente_nombre} · {new Date(p.created_at).toLocaleDateString("es-EC")}{p.archivado_at&&<> · histórico desde el {new Date(p.archivado_at).toLocaleDateString("es-EC")}</>}</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
                <div style={{textAlign:"right"}}>
                  <div style={{fontWeight:700,color:"var(--brand)",fontSize:16}}>${fmt(p.total)}</div>
                  <div style={{fontSize:10,color:"var(--muted)",background:"var(--neutral-soft)",borderRadius:20,padding:"1px 8px",display:"inline-block",marginTop:2}}>{p.estado}</div>
                </div>
                <button onClick={e=>{e.stopPropagation();duplicarPresupuesto(p);}} disabled={duplicando===p.id}
                  title="Duplicar para partir de este"
                  style={{background:"transparent",border:"1px solid var(--border)",borderRadius:8,padding:"6px 7px",color:"var(--muted)",cursor:"pointer",display:"flex"}}>
                  <Copy size={13}/>
                </button>
                <button onClick={e=>{e.stopPropagation();archivarPresupuesto(p,!p.archivado_at);}}
                  title={p.archivado_at?"Reactivar: volver a los que se trabajan":"Pasar a históricos: queda de referencia, sin editarse"}
                  style={{background:"transparent",border:"1px solid var(--border)",borderRadius:8,padding:"6px 7px",color:"var(--muted)",cursor:"pointer",display:"flex"}}>
                  {p.archivado_at?<ArchiveRestore size={13}/>:<Archive size={13}/>}
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
        );
      })()}

      {/* DESDE EXCEL: el presupuesto inicial, leído con sus capítulos */}
      {subVista==="importar"&&(
        <ImportarObra destino="presupuesto" currentUser={currentUser}
          onVolver={()=>setSubVista("lista")}
          onCreada={pre=>{fetchPresupuestos();fetchClientes();setPresupuestoActivo(pre);fetchItems(pre.id);setSubVista("detalle");}}/>
      )}

      {/* NUEVO */}
      {subVista==="nuevo"&&(
        <div style={{background:"#fff",borderRadius:12,padding:20,border:"1px solid var(--border)"}}>
          <div style={{fontSize:12,color:"var(--ink-soft)",background:"var(--bg)",borderRadius:8,padding:"8px 10px",marginBottom:14}}>
            ¿Ya lo tienes en Excel? <button onClick={()=>setSubVista("importar")} style={{background:"none",border:"none",color:"var(--brand)",fontWeight:600,cursor:"pointer",padding:0,fontSize:12,fontFamily:"var(--font)"}}>Súbelo y NOVA lo lee con sus capítulos →</button>
          </div>
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
            <div style={{fontSize:11,color:"var(--muted)",marginTop:-6}}>Los honorarios —de administración, de diseño arquitectónico, otros o ninguno— se ponen después, en el recuadro de totales del presupuesto.</div>
            <div style={{display:"grid",gridTemplateColumns:"minmax(0,160px)",gap:12}}>

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
          <div style={{display:"inline-flex",gap:3,background:"var(--neutral-soft)",borderRadius:8,padding:3,marginBottom:12}}>
            {[["armar","Armar"],["revisar","Revisar"]].map(([m,l])=>(
              <button key={m} onClick={()=>setModoDetalle(m)}
                style={{padding:"6px 16px",borderRadius:6,border:"none",cursor:"pointer",fontFamily:"var(--font)",fontSize:12,fontWeight:600,
                  background:modoDetalle===m?"#fff":"transparent",color:modoDetalle===m?"var(--ink)":"var(--ink-soft)"}}>{l}</button>
            ))}
          </div>

          {presupuestoActivo.archivado_at&&(
            <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",background:"var(--neutral-soft)",border:"1px solid var(--border)",borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:12,color:"var(--ink-soft)"}}>
              <Archive size={14}/>
              <span style={{flex:1,minWidth:200}}><strong style={{color:"var(--ink)"}}>Presupuesto histórico, de solo lectura.</strong> Para trabajarlo, reactívalo o haz una nueva versión.</span>
              <button onClick={()=>archivarPresupuesto(presupuestoActivo,false)}
                style={{background:"#fff",border:"1px solid var(--border)",borderRadius:6,padding:"5px 10px",fontSize:12,fontWeight:600,cursor:"pointer",color:"var(--ink)",fontFamily:"var(--font)"}}>Reactivar</button>
            </div>
          )}

          {modoDetalle==="revisar"&&(
            <div style={{marginBottom:14}}>
              <RevisarPresupuesto items={items} capitulos={capitulosActivos} presupuesto={presupuestoActivo} soloLectura={!!presupuestoActivo.archivado_at}
                onActualizar={(id,campos)=>presupuestoActivo.archivado_at?alert("Es un presupuesto histórico: reactívalo o haz una nueva versión para cambiarlo."):actualizarItemMulti(id,campos)}/>
            </div>
          )}

          {/* Un histórico se mira, no se toca: el fieldset deshabilita cada
              casilla y cada botón de adentro de una vez. */}
          <fieldset disabled={!!presupuestoActivo.archivado_at} style={{border:0,padding:0,margin:0,minWidth:0}}>
          {modoDetalle==="armar"&&<>
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
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,padding:"8px 14px",background:"var(--brand-soft)"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,flex:"1 1 320px",minWidth:0}}>
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
                      title={cap.nombre}
                      style={{fontSize:13,fontWeight:700,color:"var(--brand)",background:"transparent",border:"none",borderBottom:"1.5px dashed var(--border)",outline:"none",flex:1,minWidth:0,width:"100%",fontFamily:"var(--font)"}}
                    />
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0,marginLeft:"auto"}}>
                    {capTotal>0&&<span style={{fontSize:12,fontWeight:600,color:"var(--ink-soft)",whiteSpace:"nowrap"}}>${fmt(capTotal)}</span>}
                    {/* Cuánto pesa el capítulo en el costo directo (sin honorarios ni IVA). */}
                    {capTotal>0&&costoDirecto>0&&(
                      <span title="Peso del capítulo en el costo directo, sin honorarios ni IVA"
                        style={{fontSize:11,fontWeight:700,color:"var(--ink)",background:"#fff",border:"1px solid var(--border)",borderRadius:10,padding:"1px 7px",whiteSpace:"nowrap"}}>
                        {(capTotal/costoDirecto*100).toLocaleString("es-EC",{maximumFractionDigits:1})} %
                      </span>
                    )}
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
                  <div className="pres-tabla">
                  <table style={{width:"100%",minWidth:860,borderCollapse:"collapse",fontSize:12,tableLayout:"fixed"}}>
                    <colgroup>
                      <col style={{width:70}}/><col/><col style={{width:64}}/><col style={{width:104}}/>
                      <col style={{width:96}}/><col style={{width:70}}/><col style={{width:112}}/><col style={{width:118}}/><col style={{width:34}}/>
                    </colgroup>
                    <thead><tr style={{background:"var(--bg)"}}>
                      {[["N°","left"],["Descripción","left"],["Unidad","left"],["Cantidad","right"],["P.Base","right"],["Util%","right"],["P.Final","right"],["Total","right"],["",""]].map(([h,al])=>(
                        <th key={h||"x"} style={{padding:"6px 8px",textAlign:al||"left",fontSize:10,color:"var(--ink-soft)",fontWeight:600,borderBottom:"1px solid var(--border)"}}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {capItems.map((item,itemIdx)=>(
                        <tr key={item.id} style={{borderBottom:"1px solid var(--neutral-soft)"}}>
                          <td style={{padding:"5px 6px",color:"var(--muted)",fontSize:11,whiteSpace:"nowrap",fontWeight:500}}>
                            <div style={{display:"flex",alignItems:"center",gap:4}}>
                              <div style={{display:"flex",flexDirection:"column"}}>
                                <button onClick={()=>moverRubro(item,-1)} disabled={itemIdx===0} title="Subir"
                                  style={{background:"none",border:"none",padding:"0 2px",lineHeight:1,fontSize:9,cursor:itemIdx===0?"default":"pointer",color:itemIdx===0?"var(--border)":"var(--muted)"}}>▲</button>
                                <button onClick={()=>moverRubro(item,1)} disabled={itemIdx===capItems.length-1} title="Bajar"
                                  style={{background:"none",border:"none",padding:"0 2px",lineHeight:1,fontSize:9,cursor:itemIdx===capItems.length-1?"default":"pointer",color:itemIdx===capItems.length-1?"var(--border)":"var(--muted)"}}>▼</button>
                              </div>
                              {cap.orden}.{itemIdx+1}
                            </div>
                          </td>
                          <td style={{padding:"3px 4px"}}>
                            <CampoTexto valor={item.descripcion} multilinea titulo="Toca para editar la descripción"
                              onGuardar={v=>actualizarItemMulti(item.id,{descripcion:v})}
                              style={{color:"var(--ink)",fontSize:12,lineHeight:1.35}}/>
                          </td>
                          <td style={{padding:"3px 4px"}}>
                            <SelectorUnidad valor={item.unidad} onCambiar={v=>actualizarItemMulti(item.id,{unidad:v})}/>
                          </td>
                          <td style={{padding:"5px 8px"}}>
                            <input type="number" className="num-limpio" value={item.cantidad} onChange={e=>actualizarItem(item.id,"cantidad",e.target.value)}
                              style={{width:"100%",boxSizing:"border-box",background:"var(--bg)",border:"1px solid var(--border)",borderRadius:6,padding:"4px 6px",fontSize:12,textAlign:"right"}}/>
                          </td>
                          <td style={{padding:"5px 6px"}}>
                            {/* La base es la referencia —el costo o el precio original— y no se
                                escribe a mano: queda fija hasta que se elige un precio de la
                                base de rubros. Cambiar el precio final no la mueve. */}
                            <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:4}}>
                              <span style={{color:"var(--muted)",fontSize:11,whiteSpace:"nowrap"}}>
                                {Number(item.precio_base)>0||Number(item.precio_unitario)>0?`$${fmt(Number(item.precio_base)>0?item.precio_base:item.precio_unitario)}`:"—"}
                              </span>
                              <button onClick={()=>abrirPreciosDeRubro(item)} title="Elegir un precio de la base de rubros"
                                style={{background:"none",border:"1px solid var(--border)",borderRadius:5,padding:"2px 3px",cursor:"pointer",color:"var(--ink-soft)",display:"flex",flexShrink:0}}>
                                <Database size={11}/>
                              </button>
                            </div>
                          </td>
                          <td style={{padding:"5px 8px"}}>
                            <input type="number" className="num-limpio" value={Math.round((Number(item.utilidad_pct)||0)*100)/100}
                              onChange={e=>{
                                const pct=Number(e.target.value);
                                const base=item.precio_base||item.precio_unitario;
                                const nuevo=centavos(Number(base)*(1+pct/100));
                                actualizarItemMulti(item.id,{utilidad_pct:pct,precio_unitario:nuevo,precio_base:base});
                              }}
                              style={{width:"100%",boxSizing:"border-box",background:"var(--brand-soft)",border:"1px solid var(--border)",borderRadius:6,padding:"4px 6px",fontSize:12,textAlign:"right"}}/>
                          </td>
                          <td style={{padding:"5px 8px"}}>
                            <CampoPrecio valor={item.precio_unitario}
                              onFoco={()=>{
                                // La primera vez que se toca el precio de un rubro que ya tiene
                                // precio, ese precio queda como base: desde ahí se mide la variación.
                                if(!(Number(item.precio_base)>0)&&Number(item.precio_unitario)>0) actualizarItemMulti(item.id,{precio_base:Number(item.precio_unitario)});
                              }}
                              onCambio={v=>{
                                const base=Number(item.precio_base);
                                // Con base, la utilidad muestra cuánto se apartó el precio final.
                                // Sin base (rubro que todavía no tenía precio), el primero que se
                                // escribe es la base.
                                if(base>0) actualizarItemMulti(item.id,{precio_unitario:v,utilidad_pct:Math.round((Number(v)/base-1)*10000)/100});
                                else actualizarItemMulti(item.id,{precio_unitario:v});
                              }}
                              onSalir={v=>{
                                // Se fija al salir, no tecla por tecla: si no, el "5" de "50"
                                // quedaba como base.
                                const base=Number(item.precio_base);
                                if(!(base>0)&&v>0) actualizarItemMulti(item.id,{precio_unitario:v,precio_base:v,utilidad_pct:0});
                                else if(v!==Number(item.precio_unitario)) actualizarItemMulti(item.id,{precio_unitario:v,...(base>0?{utilidad_pct:Math.round((v/base-1)*10000)/100}:{})});
                              }}
                              style={{width:"100%",boxSizing:"border-box",background:Number(item.precio_unitario)?"var(--bg)":"var(--warning-soft)",border:`1px solid ${Number(item.precio_unitario)?"var(--border)":"var(--warning-border)"}`,borderRadius:6,padding:"4px 6px",fontSize:12,textAlign:"right"}}/>
                          </td>
                          <td style={{padding:"5px 8px",fontWeight:600,color:"var(--ink)",whiteSpace:"nowrap",textAlign:"right"}}>${fmt(item.total)}</td>
                          <td style={{padding:"5px 4px",textAlign:"center"}}>
                            <button onClick={()=>eliminarItem(item.id)} style={{background:"none",border:"none",color:"var(--danger)",cursor:"pointer",fontSize:14,padding:0}}>✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
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

          </>}

          {/* Totales */}
          {items.length>0&&(
            <div style={{background:"#fff",border:"1px solid var(--border)",borderRadius:10,padding:16}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"1px solid var(--neutral-soft)",fontSize:13,color:"var(--ink-soft)"}}>
                <span>Subtotal <span style={{fontSize:11,color:"var(--muted)"}}>· costo directo</span></span><span>${fmt(presupuestoActivo.subtotal)}</span>
              </div>
              <EditorHonorarios lista={lineasHonorarios(presupuestoActivo)} subtotal={presupuestoActivo.subtotal} onCambiar={guardarHonorarios}/>
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
                    className="num-limpio" style={{width:64,background:"var(--bg)",border:"1px solid var(--border)",borderRadius:6,padding:"2px 6px",fontSize:12,textAlign:"right"}}/>
                  <span style={{fontSize:11}}>%</span>
                </div>
                <span>${fmt(presupuestoActivo.iva_monto)}</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",padding:"10px 0 0",fontSize:16,fontWeight:700,color:"var(--ink)"}}>
                <span>TOTAL</span><span style={{color:"var(--brand)"}}>${fmt(presupuestoActivo.total)}</span>
              </div>
              {/* Información general: el costo directo por m², para vender. */}
              <div style={{marginTop:12,paddingTop:10,borderTop:"1px dashed var(--border)",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",fontSize:12,color:"var(--ink-soft)"}}>
                <span style={{fontSize:10,fontWeight:700,letterSpacing:0.4,color:"var(--muted)"}}>INFORMACIÓN GENERAL</span>
                <label style={{display:"flex",alignItems:"center",gap:6}}>
                  Área
                  <input type="number" className="num-limpio" key={`area-${presupuestoActivo.id}`} defaultValue={presupuestoActivo.area_m2||""} placeholder="0"
                    onBlur={e=>guardarArea(e.target.value)}
                    style={{width:80,background:"var(--bg)",border:"1px solid var(--border)",borderRadius:6,padding:"3px 6px",fontSize:12,textAlign:"right"}}/>
                  m²
                </label>
                {Number(presupuestoActivo.area_m2)>0&&costoDirecto>0?(
                  <span style={{marginLeft:"auto"}}>Costo directo por m² <span style={{fontSize:11,color:"var(--muted)"}}>(sin honorarios ni IVA)</span> <strong style={{color:"var(--ink)",fontSize:14}}>${fmt(costoDirecto/Number(presupuestoActivo.area_m2))}/m²</strong></span>
                ):(
                  <span style={{marginLeft:"auto",fontSize:11,color:"var(--muted)"}}>Pon los m² del proyecto para ver el costo directo por m².</span>
                )}
              </div>
            </div>
          )}
          </fieldset>
        </div>
      )}

      {/* BASE DE RUBROS */}
      {subVista==="baseDatos"&&<BaseRubros puede={puede}/>}

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
              <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:10,marginBottom:12}}>
                <div><label style={{fontSize:11,color:"var(--ink-soft)",display:"block",marginBottom:4}}>Proyecto o referencia</label>
                  <input value={bdMeta.proveedor} onChange={e=>setBdMeta(p=>({...p,proveedor:e.target.value}))} placeholder="Ej. Casa Fowler, proforma de pisos" style={iS}/></div>
                <div><label style={{fontSize:11,color:"var(--ink-soft)",display:"block",marginBottom:4}}>Año del presupuesto</label>
                  <input value={bdMeta.fecha} onChange={e=>setBdMeta(p=>({...p,fecha:e.target.value}))} placeholder="2025" style={iS}/></div>
              </div>
              {bdLectura?.origen?.tipo==="recordado"&&<div style={{fontSize:11,color:"var(--success)",marginBottom:10}}>Formato reconocido: se leyó igual que "{bdLectura.origen.archivo}".</div>}
              <PreguntasNova rubros={bdRubros} respuestas={bdPreguntas} onCambiar={setBdPreguntas} sugerencia={bdSugerencia} clientes={clientes} proveedores={proveedores} cargos={bdResult.cargos||[]}/>

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
                {(()=>{ const falta=faltanRespuestas(bdPreguntas,bdRubros); const listo=bdRubros.length&&!falta.length&&!guardandoBD; return (
                <button onClick={guardarEnBD} disabled={!listo}
                  style={{flex:2,background:listo?"var(--brand)":"var(--neutral-soft)",border:"none",borderRadius:8,padding:10,color:listo?"#fff":"var(--muted)",fontSize:13,fontWeight:600,cursor:listo?"pointer":"default"}}>
                  {guardandoBD?"Guardando...":falta.length?"Responde las preguntas de NOVA para guardar":`✓ Guardar ${bdRubros.length} rubros en base de datos`}
                </button>); })()}
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
                    <SelectorUnidad valor={manualRubro.unidad} onCambiar={v=>setManualRubro(p=>({...p,unidad:v}))} grande/></div>
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
