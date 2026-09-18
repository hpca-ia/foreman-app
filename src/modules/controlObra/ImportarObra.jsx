import { useState, useRef, useMemo, useEffect } from "react";
import { Upload, Sparkles, Trash2, ArrowLeft, CheckCircle2, AlertTriangle, SlidersHorizontal, BookmarkCheck } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import PreguntasNova from "../../components/PreguntasNova";
import { fmt } from "./calculos";
import { alimentarBase } from "../../lib/baseRubros";
import { subirArchivo } from "../../lib/archivos";
import { asegurarProyecto } from "../../lib/proyectoDeObra";
import { reconocerExcel, recordarFormato, pedirNova, parseJSONTolerante } from "../../lib/leerExcelPresupuesto";
import { RESPUESTAS_VACIAS, faltanRespuestas, unidadRespondida, unidadParaBase } from "../../lib/preguntasNova";
import { interpretarPresupuesto, aplicarDecisiones } from "./leerPresupuesto";
import RevisionPresupuesto from "./RevisionPresupuesto";
import EditorColumnas from "./EditorColumnas";

const n = v => Number(v) || 0;
const CAP_CARGOS = "HONORARIOS Y CARGOS";

// El presupuesto que se controla NO es el que se cotiza: puede ser el
// aprobado por el cliente, el del contratista, otro documento. Por eso
// esta importación crea la obra directamente, sin pasar por Presupuestos.
const PROMPT = `Replica este presupuesto de construcción TAL CUAL, sin resumir ni reagrupar.
Devuelve SOLO JSON compacto, sin markdown:
{"nombre":"","cliente":"","emisor":"","rubros":[{"c":"CAPITULO","d":"descripcion","u":"unidad","q":0,"p":0,"t":0}]}
Reglas:
- "emisor" es la empresa que hizo el documento (quien cotiza); "cliente", a quién va dirigido.
- Un objeto por rubro, en el MISMO ORDEN del documento.
- "c" = el capítulo/sección al que pertenece ese rubro (repite el nombre en cada rubro).
- Las filas de encabezado de capítulo y las de subtotal NO son rubros: no las incluyas.
- "q" cantidad, "p" precio unitario, "t" total de la fila. Si falta "t", omítelo.
- No inventes rubros ni cambies descripciones.`;

// Este mismo lector sirve para el presupuesto inicial, en Presupuestos: se lee
// igual —formato aprendido, capítulos, revisión de errores, preguntas de
// NOVA— y lo único que cambia es qué se crea al final. Un presupuesto se sigue
// trabajando (se ajusta, se completa con cotizaciones, se exporta); una obra se
// controla.
const normal = t => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
const r2 = v => Math.round(v * 100) / 100;

export default function ImportarObra({ currentUser, onVolver, onCreada, destino = "obra" }) {
  const paraPresupuesto = destino === "presupuesto";
  // Los precios del presupuesto inicial entran a la base salvo que se diga lo
  // contrario: un precio que no se guarda es un precio que se pierde, pero hay
  // presupuestos de prueba que no deben contar.
  const [guardarEnBase, setGuardarEnBase] = useState(true);
  const [leyendo, setLeyendo] = useState(false);
  const [paso, setPaso] = useState("");
  const [error, setError] = useState("");
  const [archivo, setArchivo] = useState(null);
  const [rubros, setRubros] = useState([]);
  const [cargos, setCargos] = useState([]);
  const [omitidas, setOmitidas] = useState([]);
  const [control, setControl] = useState(null);     // lo que declaraba el Excel, para comparar
  const [advertencias, setAdvertencias] = useState([]);
  // { índice de advertencia: "aceptar" | "corregir" }. Lo leído no se toca:
  // los rubros que se crean salen de aplicar estas decisiones.
  const [decisiones, setDecisiones] = useState({});
  // Para poder corregir columnas y recordar el formato hay que conservar las
  // filas del Excel y el mapa con que se leyeron.
  const [filasExcel, setFilasExcel] = useState(null);
  const [mapaActual, setMapaActual] = useState(null);
  const [origenMapa, setOrigenMapa] = useState(null);  // { tipo: "recordado" | "nova" | "manual", veces, archivo }
  const [verColumnas, setVerColumnas] = useState(false);
  const [nombre, setNombre] = useState("");
  // Lo que NOVA pregunta antes de guardar: de dónde vienen los precios, de
  // qué cliente o proveedor, y las unidades que no se entienden.
  const [preguntas, setPreguntas] = useState(RESPUESTAS_VACIAS);
  const [sugerencia, setSugerencia] = useState({});
  const [clientesLista, setClientesLista] = useState([]);
  const [proveedoresLista, setProveedoresLista] = useState([]);
  // Sin valor por defecto a propósito. El control de obra se hace con IVA
  // porque las facturas lo traen; si la línea base entra sin IVA, el avance
  // sale inflado cerca de un 15 %. Venía marcado "ya incluye IVA" y así se
  // importó mal una obra cuyo Excel no lo incluía.
  const [incluyeIva, setIncluyeIva] = useState(null);
  const [sugerenciaIva, setSugerenciaIva] = useState("");
  const [ivaPct, setIvaPct] = useState(15);
  const [incluirCargos, setIncluirCargos] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    supabase.from("clientes").select("id,nombre").order("nombre").then(({ data }) => setClientesLista(data || []));
    // Sin la migración 016 no hay tabla de proveedores: la lista queda vacía.
    supabase.from("proveedores").select("id,nombre").order("nombre").then(({ data }) => setProveedoresLista(data || []));
  }, []);

  function limpiar() {
    setRubros([]); setCargos([]); setOmitidas([]); setControl(null); setAdvertencias([]); setDecisiones({});
    setFilasExcel(null); setMapaActual(null); setOrigenMapa(null); setVerColumnas(false);
    setIncluyeIva(null); setSugerenciaIva(""); setIncluirCargos(true);
    setPreguntas(RESPUESTAS_VACIAS); setSugerencia({});
  }

  // Lee las filas con un mapa de columnas y deja todo listo para la vista
  // previa. Se usa al leer, al reconocer un formato y al corregir a mano.
  function aplicarMapa(filas, mapa, origen) {
    const r = interpretarPresupuesto(filas, mapa, { conPendientes: paraPresupuesto });
    setFilasExcel(filas); setMapaActual(r.mapa); setOrigenMapa(origen);
    setRubros(r.rubros); setCargos(r.cargos); setOmitidas(r.omitidas);
    setControl({ subtotal: r.subtotalExcel, total: r.totalExcel, iva: r.ivaExcel, descuadres: r.descuadres });
    setAdvertencias(r.advertencias || []); setDecisiones({});
    if (r.ivaExcel) {
      if (r.ivaExcel.pct) setIvaPct(r.ivaExcel.pct);
      setSugerenciaIva(`El Excel suma el IVA aparte al final ($${fmt(r.ivaExcel.total)}), así que sus rubros vienen sin IVA.`);
    } else if (r.preciosIncluyenIva === false) {
      setSugerenciaIva("Las columnas del Excel indican precios sin IVA.");
    } else if (r.preciosIncluyenIva === true) {
      setSugerenciaIva("Las columnas del Excel indican precios con IVA.");
    } else {
      setSugerenciaIva("El Excel no tiene una línea de IVA. Si el total final no lo suma, sus valores vienen sin IVA.");
    }
    return r.rubros.length;
  }

  async function leer(e) {
    const file = e.target.files[0];
    if (!file) return;
    limpiar(); setArchivo(file);
    setLeyendo(true); setError(""); setPaso("Abriendo el archivo...");
    const ctrl = new AbortController();
    const reloj = setTimeout(() => ctrl.abort(), 5 * 60 * 1000);
    try {
      if (/\.(xlsx|xls|csv)$/i.test(file.name)) {
        // Con un formato ya aprendido se lee igual que la vez anterior; si es
        // nuevo, NOVA reconoce las columnas.
        const lectura = await reconocerExcel(file, { signal: ctrl.signal, onPaso: setPaso });
        setNombre(lectura.datos.nombre || file.name.replace(/\.[^.]+$/, ""));
        setSugerencia({ emisor: lectura.datos.emisor || "", cliente: lectura.datos.cliente || "" });
        setPreguntas({ ...RESPUESTAS_VACIAS, cliente: lectura.datos.cliente || "" });
        const cuantos = aplicarMapa(lectura.filas, lectura.mapa, lectura.origen);
        // Si con esas columnas no salen rubros, no se adivina más: se muestran
        // las columnas para corregirlas, con la opción de que NOVA lea todo.
        if (cuantos < 3) setVerColumnas(true);
      } else {
        await leerConNova(file, null, ctrl.signal);
      }
    } catch (err) {
      setError(err.name === "AbortError"
        ? "La lectura pasó de cinco minutos y se cortó. Prueba subir el presupuesto por capítulos, o en Excel en vez de PDF."
        : "Error leyendo el archivo: " + err.message);
    }
    clearTimeout(reloj);
    setLeyendo(false); setPaso("");
    e.target.value = "";
  }

  // El camino lento: NOVA transcribe el documento entero. Para PDF y fotos, o
  // para un Excel cuyas columnas no se pudieron reconocer ni corregir.
  async function leerConNova(file, filas, señal) {
    setLeyendo(true); setError("");
    const esImagen = file.type.startsWith("image/");
    const esPDF = file.type === "application/pdf";
    let contenido;
    if (esImagen || esPDF) {
      setPaso("NOVA está leyendo el documento, puede tardar un par de minutos...");
      const b64 = await new Promise(res => { const rd = new FileReader(); rd.onload = () => res(rd.result.split(",")[1]); rd.readAsDataURL(file); });
      contenido = [
        esPDF ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
              : { type: "image", source: { type: "base64", media_type: file.type, data: b64 } },
        { type: "text", text: PROMPT },
      ];
    } else {
      setPaso("NOVA está leyendo el Excel entero, puede tardar un par de minutos...");
      const txt = filas ? filas.map(f => f.map(c => String(c ?? "")).join(",")).join("\n").slice(0, 60000) : (await file.text()).slice(0, 60000);
      contenido = [{ type: "text", text: `Presupuesto:\n\n${txt}\n\n${PROMPT}` }];
    }

    const data = await pedirNova({ model: "claude-sonnet-4-5", max_tokens: 16000, messages: [{ role: "user", content: contenido }] }, señal);
    const parsed = parseJSONTolerante(data.content?.[0]?.text || "");
    if (!parsed?.rubros?.length) {
      setError("NOVA no pudo leer el presupuesto. Si es muy grande, prueba subirlo por capítulos.");
      setLeyendo(false); setPaso(""); return;
    }
    // Leído por NOVA ya no hay columnas que corregir ni formato que recordar.
    setFilasExcel(null); setMapaActual(null); setOrigenMapa(null); setVerColumnas(false);
    setControl(null); setAdvertencias([]); setDecisiones({}); setCargos([]); setOmitidas([]);
    setRubros(parsed.rubros.map((r, i) => ({
      fila: i,
      capitulo: (r.c || r.capitulo || "SIN CAPÍTULO").toString().trim().toUpperCase(),
      codigo: "",
      descripcion: (r.d || r.descripcion || "").toString().trim(),
      unidad: (r.u || r.unidad || "").toString().trim(),
      cantidad: n(r.q ?? r.cantidad),
      precio_unitario: n(r.p ?? r.precio_unitario),
      total: n(r.t ?? r.total) || n(r.q ?? r.cantidad) * n(r.p ?? r.precio_unitario),
    })).filter(r => r.descripcion));
    setSugerenciaIva("Revisa el documento: si su total no suma IVA, los valores vienen sin IVA.");
    setNombre(parsed.nombre || file.name.replace(/\.[^.]+$/, ""));
    setSugerencia({ emisor: parsed.emisor || "", cliente: parsed.cliente || "" });
    setPreguntas({ ...RESPUESTAS_VACIAS, cliente: parsed.cliente || "" });
    setLeyendo(false); setPaso("");
  }

  function corregirColumnas(nuevoMapa) {
    aplicarMapa(filasExcel, nuevoMapa, { tipo: "manual" });
  }

  // ── Lo que se va a crear: lo leído con las decisiones aplicadas ──
  const final = useMemo(() => aplicarDecisiones({ rubros, cargos, omitidas, advertencias }, decisiones), [rubros, cargos, omitidas, advertencias, decisiones]);
  const pendientes = advertencias.filter((a, i) => a.nivel === "error" && !decisiones[i]).length;
  const decidir = (i, v) => setDecisiones(d => { const x = { ...d }; if (v) x[i] = v; else delete x[i]; return x; });
  const faltanPreguntas = faltanRespuestas(preguntas, final.rubros);

  // ── Cuentas de la vista previa ──
  const factor = incluyeIva === false ? 1 + n(ivaPct) / 100 : 1;
  const sumaRubros = final.rubros.reduce((s, r) => s + r.total, 0);
  const sumaTodosCargos = final.cargos.reduce((s, c) => s + c.total, 0);
  const sumaCargos = incluirCargos ? sumaTodosCargos : 0;
  const base = sumaRubros + sumaCargos;
  const ivaSumado = base * (factor - 1);
  const lineaBase = base * factor;
  const capitulos = [...new Set(final.rubros.map(r => r.capitulo))];

  // Contra el Excel: los rubros contra su SUBTOTAL; rubros + cargos (+ su línea
  // de IVA, si tenía) contra su TOTAL. Con las decisiones ya aplicadas.
  const difSubtotal = control?.subtotal != null ? sumaRubros - control.subtotal : null;
  const difTotal = control?.total != null ? sumaRubros + sumaTodosCargos + (control.iva?.total || 0) - control.total : null;

  async function crearObra() {
    if (!rubros.length || !nombre.trim() || incluyeIva === null || pendientes || faltanPreguntas.length) return;
    setGuardando(true); setError("");
    const pct = incluyeIva ? 0 : n(ivaPct);
    const faltan = [];
    const cliente = preguntas.cliente.trim();

    const datosObra = {
      nombre: nombre.trim(), cliente_nombre: cliente || null,
      notas: "Presupuesto importado con NOVA", created_by: currentUser.id,
    };
    const extras = {
      subtotal_excel: control?.subtotal ?? null, total_excel: control?.total ?? null,
      iva_incluido: incluyeIva, iva_pct: pct,
    };
    let { data: obra, error: e1 } = await supabase.from("obras").insert({ ...datosObra, ...extras }).select().single();
    let sinMigracion = false;
    if (e1 && /column|schema cache/i.test(e1.message)) {
      // Sin la migración 013 la obra se crea igual; solo no guarda el original.
      sinMigracion = true;
      faltan.push("013 (archivo original e IVA)");
      ({ data: obra, error: e1 } = await supabase.from("obras").insert(datosObra).select().single());
    }
    if (e1 || !obra) { setError("No se pudo crear la obra: " + (e1?.message || "")); setGuardando(false); return; }

    const todos = [
      ...final.rubros,
      ...(incluirCargos ? final.cargos.map(c => ({ capitulo: CAP_CARGOS, codigo: "", descripcion: c.descripcion, unidad: "glb", cantidad: 1, precio_unitario: c.total, total: c.total })) : []),
    ];
    const ordenCap = {}; let capN = 0; const idxCap = {};
    const filas = todos.map((r, i) => {
      if (!(r.capitulo in ordenCap)) ordenCap[r.capitulo] = ++capN;
      const c = ordenCap[r.capitulo];
      idxCap[c] = (idxCap[c] || 0) + 1;
      return {
        obra_id: obra.id, numero: i + 1, codigo: r.codigo || null, capitulo: r.capitulo,
        capitulo_orden: c, orden: c * 1000 + idxCap[c],
        // La unidad como está en el Excel, salvo las que NOVA preguntó.
        descripcion: r.descripcion, unidad: unidadRespondida(r, preguntas),
        cantidad: r.cantidad, precio_unitario: r.precio_unitario,
        iva_pct: pct,
        total_base: Math.round(r.total * factor * 100) / 100,
      };
    });
    for (let i = 0; i < filas.length; i += 50) {
      const { error: e2 } = await supabase.from("obra_rubros").insert(filas.slice(i, i + 50));
      if (e2) { setError("Fallaron algunos rubros: " + e2.message); setGuardando(false); return; }
    }

    await supabase.from("planillas").insert({
      obra_id: obra.id, numero: 1, nombre: "Planilla N°1", fecha_desde: new Date().toISOString().split("T")[0],
    });

    // El archivo tal cual, para poder abrir siempre el presupuesto original.
    if (archivo && !sinMigracion) {
      const ext = (archivo.name.split(".").pop() || "xlsx").toLowerCase();
      const ruta = `obras/${obra.id}/presupuesto-original-${Date.now()}.${ext}`;
      const { error: eUp } = await subirArchivo(ruta, archivo);
      if (!eUp) await supabase.from("obras").update({ archivo_presupuesto_url: ruta, archivo_presupuesto_nombre: archivo.name }).eq("id", obra.id);
    }

    // La revisión queda con la obra, para volver a verla en la pestaña Presupuesto.
    if (!sinMigracion) {
      const ahora = new Date().toISOString();
      const conDecision = advertencias.map((a, i) => decisiones[i]
        ? { ...a, decision: decisiones[i], decidido_por: currentUser.name || null, decidido_at: ahora }
        : a);
      const { error: eAdv } = await supabase.from("obras").update({ advertencias: conDecision }).eq("id", obra.id);
      if (eAdv) faltan.push("014 (revisión del Excel)");
    }

    // La obra se creó bien: el formato con que se leyó queda aprendido.
    const eFormato = await recordarFormato({ filas: filasExcel, mapa: mapaActual, archivo: archivo?.name, usuarioId: currentUser.id });
    if (eFormato) faltan.push("015 (recordar el formato)");

    // El presupuesto que se controla también es conocimiento: sus rubros y sus
    // precios entran a la base con su origen. Los ajustes no son rubros de verdad.
    const base = await alimentarBase(
      final.rubros.filter(r => r.origen !== "ajuste").map(r => ({ ...r, unidad: unidadParaBase(r, preguntas) })),
      { tipo: preguntas.tipo, cliente, proveedor: preguntas.proveedor, proyecto: nombre.trim(), fuente: "obra", obraId: obra.id, ivaIncluido: incluyeIva, ivaPct: n(ivaPct), utilidad: preguntas.utilidad });
    if (base.faltaMigracion) faltan.push(`${base.faltaMigracion} (${base.faltaMigracion === "016" ? "origen" : "utilidad"} de los precios)`);

    // Toda obra es un proyecto: así el pipeline muestra la oficina entera y no
    // solo lo que todavía no se ha ganado.
    await asegurarProyecto(obra, currentUser);

    setGuardando(false);
    if (faltan.length) alert(`La obra se creó, pero falta correr en Supabase la migración ${faltan.join(", ")}.`);
    onCreada(obra);
  }

  async function crearPresupuesto() {
    if (!rubros.length || !nombre.trim() || incluyeIva === null || pendientes || faltanPreguntas.length) return;
    setGuardando(true); setError("");
    const faltan = [];
    const cliente = preguntas.cliente.trim();

    // El cliente de la lista si ya existe, escrito como sea; si no, se crea.
    let cliente_id = null;
    if (cliente) {
      const ya = clientesLista.find(c => normal(c.nombre) === normal(cliente));
      if (ya) cliente_id = ya.id;
      else {
        const { data: nc } = await supabase.from("clientes").insert({ nombre: cliente }).select().single();
        cliente_id = nc?.id ?? null;
      }
    }

    const todos = [
      ...final.rubros,
      ...(incluirCargos ? final.cargos.map(c => ({ capitulo: CAP_CARGOS, descripcion: c.descripcion, unidad: "glb", cantidad: 1, precio_unitario: c.total, total: c.total })) : []),
    ];
    // Si los precios ya traían IVA, el presupuesto no se lo vuelve a sumar: el
    // total tiene que ser el mismo del Excel.
    const pctIva = incluyeIva ? 0 : n(ivaPct);
    const subtotal = r2(todos.reduce((s, r) => s + n(r.total), 0));
    const iva_monto = r2(subtotal * pctIva / 100);
    const { data: pre, error: e1 } = await supabase.from("presupuestos").insert({
      nombre: nombre.trim(), cliente_id, cliente_nombre: cliente || "Sin cliente",
      honorarios_pct: 0, iva_pct: pctIva, estado: "borrador", created_by: currentUser.id,
      notas: incluyeIva ? "Los precios del Excel original ya incluían IVA." : "",
      subtotal, honorarios_monto: 0, iva_monto, total: r2(subtotal + iva_monto),
    }).select().single();
    if (e1 || !pre) { setError("No se pudo crear el presupuesto: " + (e1?.message || "")); setGuardando(false); return; }

    // Mismo orden que al armarlo a mano: capítulo × 1000 + posición.
    const ordenCap = {}; let capN = 0; const pos = {};
    const filas = todos.map(r => {
      if (!(r.capitulo in ordenCap)) ordenCap[r.capitulo] = ++capN;
      const c = ordenCap[r.capitulo];
      pos[c] = (pos[c] ?? -1) + 1;
      return {
        presupuesto_id: pre.id, capitulo: r.capitulo, descripcion: r.descripcion,
        unidad: r.unidad === "glb" && r.capitulo === CAP_CARGOS ? "glb" : unidadRespondida(r, preguntas),
        cantidad: n(r.cantidad), precio_unitario: r2(n(r.precio_unitario)), total: r2(n(r.total)),
        orden: c * 1000 + pos[c],
      };
    });
    for (let i = 0; i < filas.length; i += 100) {
      const { error: e2 } = await supabase.from("presupuesto_items").insert(filas.slice(i, i + 100));
      if (e2) { setError("Se creó el presupuesto pero fallaron algunos rubros: " + e2.message); setGuardando(false); return; }
    }

    const eFormato = await recordarFormato({ filas: filasExcel, mapa: mapaActual, archivo: archivo?.name, usuarioId: currentUser.id });
    if (eFormato) faltan.push("015 (recordar el formato)");

    if (guardarEnBase) {
      const base = await alimentarBase(
        final.rubros.filter(r => r.origen !== "ajuste" && !r.pendiente && n(r.precio_unitario) > 0).map(r => ({ ...r, unidad: unidadParaBase(r, preguntas) })),
        { tipo: preguntas.tipo, cliente, proveedor: preguntas.proveedor, proyecto: nombre.trim(), fuente: "presupuesto", ivaIncluido: incluyeIva, ivaPct: n(ivaPct), utilidad: preguntas.utilidad });
      if (base.faltaMigracion) faltan.push(`${base.faltaMigracion} (${base.faltaMigracion === "016" ? "origen" : "utilidad"} de los precios)`);
    }

    setGuardando(false);
    if (faltan.length) alert(`El presupuesto se creó, pero falta correr en Supabase la migración ${faltan.join(", ")}.`);
    onCreada(pre);
  }

  const lbl = { fontSize: 11, color: colors.muted, display: "block", marginBottom: 4 };
  const Linea = ({ t, v, fuerte, color }) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: fuerte ? 13 : 12, fontWeight: fuerte ? 700 : 400, color: color || (fuerte ? colors.ink : colors.inkSoft), padding: "3px 0" }}>
      <span>{t}</span><span>${fmt(v)}</span>
    </div>
  );
  const Cuadra = ({ t, dif }) => dif == null ? null : (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: Math.abs(dif) <= 1 ? colors.success : colors.warning, padding: "2px 0" }}>
      {Math.abs(dif) <= 1 ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
      {t} {Math.abs(dif) <= 1 ? "cuadra" : "no cuadra"}{Math.abs(dif) > 0.009 && <> ({dif > 0 ? "+" : ""}${fmt(dif)})</>}
    </div>
  );

  const origenTexto = !origenMapa ? null
    : origenMapa.tipo === "recordado"
      ? `Formato reconocido: se leyó igual que ${origenMapa.archivo ? `"${origenMapa.archivo}"` : "un presupuesto anterior"} (usado ${origenMapa.veces} ${origenMapa.veces === 1 ? "vez" : "veces"}). NOVA no tuvo que adivinar las columnas.`
      : origenMapa.tipo === "manual"
        ? "Columnas corregidas a mano. Al crear la obra, este formato queda aprendido."
        : "Formato nuevo: NOVA reconoció las columnas. Al crear la obra, queda aprendido.";

  return (
    <div style={{ fontFamily: colors.font }}>
      {/* En Presupuestos el encabezado lo pone el módulo, con su propio "Volver". */}
      {!paraPresupuesto && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <Button variant="secondary" size="sm" onClick={onVolver}><ArrowLeft size={13} /> Volver</Button>
          <div style={{ fontSize: 16, fontWeight: 700, color: colors.ink }}>Importar presupuesto de obra</div>
        </div>
      )}

      <div style={{ fontSize: 12, color: colors.inkSoft, marginBottom: 14 }}>
        {paraPresupuesto
          ? <>Sube el presupuesto inicial. NOVA lo lee con sus capítulos, lo revisas acá y queda en FOREMAN para <strong>seguir trabajándolo</strong>: ajustar cantidades, completarlo con cotizaciones de proveedores y exportarlo.</>
          : <>Sube el presupuesto que vas a <strong>ejecutar y controlar</strong> — el aprobado por el cliente, el del contratista, el que sea. Se guarda también el archivo original, para verlo tal cual cuando haga falta.</>}
      </div>

      {rubros.length === 0 && !filasExcel && (
        <div style={{ background: colors.brandSoft, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 20, textAlign: "center" }}>
          <Sparkles size={22} color={colors.brand} style={{ marginBottom: 8 }} />
          <div style={{ fontSize: 13, color: colors.brand, marginBottom: 12 }}>
            {leyendo ? (paso || "NOVA está leyendo el presupuesto...") : "Sube el presupuesto en Excel, PDF, CSV o foto. El Excel se lee en segundos; PDF y fotos tardan más."}
          </div>
          <Button variant="primary" onClick={() => fileRef.current?.click()} disabled={leyendo}>
            <Upload size={13} /> {leyendo ? "Leyendo..." : "Subir presupuesto"}
          </Button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.pdf,image/*,.txt" onChange={leer} style={{ display: "none" }} />
        </div>
      )}

      {error && <div style={{ color: colors.danger, fontSize: 12, marginTop: 10 }}>{error}</div>}

      {/* Excel cuyas columnas no dieron rubros: corregir antes de seguir */}
      {filasExcel && rubros.length < 3 && (
        <div style={{ background: colors.surface, border: `1.5px solid ${colors.warningBorder}`, borderRadius: colors.radiusMd, padding: 16, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <AlertTriangle size={16} color={colors.warning} />
            <div style={{ fontSize: 13, fontWeight: 600, color: colors.ink }}>No pude leer los rubros con estas columnas</div>
          </div>
          <div style={{ fontSize: 12, color: colors.inkSoft, marginBottom: 12 }}>
            Elige qué columna es cada cosa. La lista de abajo se recalcula al instante; cuando aparezcan los rubros, sigue con la importación y este formato queda aprendido.
          </div>
          <EditorColumnas filas={filasExcel} mapa={mapaActual || {}} onCambiar={corregirColumnas} />
          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            <Button variant="outline" onClick={() => { limpiar(); setError(""); }}>Subir otro archivo</Button>
            <Button variant="outline" onClick={() => leerConNova(archivo, filasExcel).catch(err => { setError("Error leyendo el archivo: " + err.message); setLeyendo(false); setPaso(""); })} disabled={leyendo}>
              <Sparkles size={13} /> {leyendo ? (paso || "Leyendo...") : "Que NOVA lo lea entero (lento)"}
            </Button>
          </div>
        </div>
      )}

      {rubros.length >= 3 && (
        <>
          <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 16, marginBottom: 14 }}>
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>{paraPresupuesto ? "NOMBRE DEL PRESUPUESTO" : "NOMBRE DE LA OBRA"}</label><input value={nombre} onChange={e => setNombre(e.target.value)} style={inputStyle} />
            </div>

            {origenTexto && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12, color: colors.inkSoft, background: colors.bg, borderRadius: colors.radiusSm, padding: "8px 10px", marginBottom: 14 }}>
                <BookmarkCheck size={14} color={origenMapa.tipo === "recordado" ? colors.success : colors.brand} />
                <span style={{ flex: 1, minWidth: 200 }}>{origenTexto}</span>
                <button onClick={() => setVerColumnas(v => !v)}
                  style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "none", border: `1px solid ${colors.border}`, borderRadius: colors.radiusSm, padding: "5px 9px", fontSize: 11, color: colors.inkSoft, cursor: "pointer", fontFamily: colors.font }}>
                  <SlidersHorizontal size={12} /> {verColumnas ? "Ocultar columnas" : "Ver o corregir columnas"}
                </button>
                {verColumnas && (
                  <div style={{ width: "100%", marginTop: 8 }}>
                    <EditorColumnas filas={filasExcel} mapa={mapaActual || {}} onCambiar={corregirColumnas} />
                  </div>
                )}
              </div>
            )}

            {/* IVA: pregunta obligatoria */}
            <div style={{ background: incluyeIva === null ? colors.warningSoft : colors.bg, border: `1.5px solid ${incluyeIva === null ? colors.warningBorder : colors.border}`, borderRadius: colors.radiusMd, padding: 12, marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: colors.ink, marginBottom: 4 }}>¿Los valores del Excel incluyen IVA?</div>
              <div style={{ fontSize: 11, color: colors.inkSoft, marginBottom: 8 }}>
                {paraPresupuesto ? "Si no lo incluyen, el presupuesto lo suma al final, como en el Excel." : "El control de obra se hace con IVA, porque las facturas lo traen."} {sugerenciaIva}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {[[true, "Sí, ya incluyen IVA"], [false, "No, sumarle IVA"]].map(([v, t]) => (
                  <button key={t} onClick={() => setIncluyeIva(v)}
                    style={{ padding: "7px 14px", borderRadius: colors.radiusSm, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: colors.font,
                      border: `1.5px solid ${incluyeIva === v ? colors.brand : colors.border}`,
                      background: incluyeIva === v ? colors.brand : "#fff", color: incluyeIva === v ? "#fff" : colors.inkSoft }}>
                    {t}
                  </button>
                ))}
                {incluyeIva === false && (
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: colors.inkSoft }}>
                    IVA
                    <input type="number" value={ivaPct} onChange={e => setIvaPct(e.target.value)} style={{ ...inputStyle, width: 64, padding: "6px 8px" }} /> %
                  </label>
                )}
              </div>
            </div>

            <PreguntasNova rubros={final.rubros} respuestas={preguntas} onCambiar={setPreguntas} sugerencia={sugerencia}
              clientes={clientesLista} proveedores={proveedoresLista} cargos={final.cargos} ivaIncluido={incluyeIva} ivaPct={ivaPct} />

            {/* Totales y comparación con el Excel */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
              <div>
                <Linea t={`${final.rubros.length} rubros en ${capitulos.length} capítulos`} v={sumaRubros} />
                {final.cargos.length > 0 && (
                  <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                    <input type="checkbox" checked={incluirCargos} onChange={e => setIncluirCargos(e.target.checked)} />
                    <span style={{ flex: 1 }}><Linea t={final.cargos.map(c => c.descripcion).join(" · ").slice(0, 60)} v={sumaTodosCargos} /></span>
                  </label>
                )}
                {incluyeIva === false && <Linea t={`IVA ${n(ivaPct)} %`} v={ivaSumado} />}
                <div style={{ borderTop: `1px solid ${colors.border}`, marginTop: 4, paddingTop: 4 }}>
                  <Linea t={incluyeIva === null ? `${paraPresupuesto ? "Total" : "Línea base"} (falta responder lo del IVA)` : paraPresupuesto ? "Total con IVA" : "Línea base con IVA"} v={lineaBase} fuerte color={incluyeIva === null ? colors.warning : undefined} />
                </div>
              </div>
              {control && (control.subtotal != null || control.total != null) && (
                <div style={{ fontSize: 12, color: colors.inkSoft }}>
                  <div style={{ fontWeight: 600, color: colors.ink, marginBottom: 4 }}>Contra el Excel</div>
                  {control.subtotal != null && <div>Subtotal del Excel: ${fmt(control.subtotal)}</div>}
                  <Cuadra t="Rubros contra el subtotal:" dif={difSubtotal} />
                  {control.total != null && <div style={{ marginTop: 4 }}>Total del Excel: ${fmt(control.total)}</div>}
                  <Cuadra t="Rubros y cargos contra el total:" dif={difTotal} />
                </div>
              )}
            </div>

            {control && (
              <div style={{ marginTop: 14 }}>
                <RevisionPresupuesto advertencias={advertencias} decisiones={decisiones} onDecidir={decidir} />
              </div>
            )}

            {paraPresupuesto && final.rubros.some(r => r.pendiente) && (
              <div style={{ marginTop: 12, fontSize: 12, color: colors.inkSoft, background: colors.warningSoft, border: `1px solid ${colors.warningBorder}`, borderRadius: colors.radiusSm, padding: "8px 10px" }}>
                <strong>{final.rubros.filter(r => r.pendiente).length} rubros sin precio todavía.</strong> Entran en $0 para completarlos después con cotizaciones. Si alguno no es un rubro sino una línea de detalle —como el despiece de ventanas—, quítalo con el tacho en la lista de abajo.
              </div>
            )}

            {/* Las filas con cantidad y precio sin total ya aparecen en la revisión. */}
            {omitidas.filter(o => o.motivo !== "sin_total").length > 0 && (
              <div style={{ marginTop: 12, fontSize: 11, color: colors.inkSoft, background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: colors.radiusSm, padding: "8px 10px" }}>
                <strong>{omitidas.filter(o => o.motivo !== "sin_total").length} filas</strong> no entraron por ser líneas de detalle sin monto, como el despiece de ventanas. No cambian el total.
                <div style={{ color: colors.muted, marginTop: 3 }}>Por ejemplo: {omitidas.filter(o => o.motivo !== "sin_total").slice(0, 2).map(d => String(d.descripcion).slice(0, 40)).join(" · ")}</div>
              </div>
            )}
          </div>

          <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, maxHeight: 400, overflowY: "auto", marginBottom: 14 }}>
            {[...capitulos, ...(incluirCargos && final.cargos.length ? [CAP_CARGOS] : [])].map(cap => {
              const lista = cap === CAP_CARGOS
                ? final.cargos.map((c, i) => ({ ...c, codigo: "", unidad: "glb", cantidad: 1, precio_unitario: c.total, _cargo: i }))
                : final.rubros.map((r, i) => ({ ...r, _i: i })).filter(r => r.capitulo === cap);
              return (
                <div key={cap}>
                  <div style={{ background: colors.brandSoft, padding: "7px 14px", fontSize: 11, fontWeight: 700, color: colors.brand, position: "sticky", top: 0, display: "flex", justifyContent: "space-between" }}>
                    <span>{cap} <span style={{ fontWeight: 400, opacity: .7 }}>({lista.length})</span></span>
                    <span>${fmt(lista.reduce((s, r) => s + r.total, 0))}</span>
                  </div>
                  {lista.map(r => (
                    <div key={cap + (r._i ?? r._cargo)} style={{ display: "grid", gridTemplateColumns: "48px 1fr 44px 64px 84px 90px 26px", gap: 8, padding: "6px 14px", borderBottom: `1px solid ${colors.neutralSoft}`, fontSize: 12, alignItems: "center" }}>
                      <span style={{ color: colors.muted, fontSize: 10 }}>{r.codigo}</span>
                      <span style={{ color: r.origen === "ajuste" ? colors.warning : colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.descripcion}>
                        {r.origen && r.origen !== "ajuste" && <span style={{ fontSize: 9, fontWeight: 700, color: colors.warning, marginRight: 5 }}>{r.origen === "agregado" ? "AGREGADO" : "CORREGIDO"}</span>}
                        {r.pendiente && <span style={{ fontSize: 9, fontWeight: 700, color: colors.warning, marginRight: 5 }}>SIN PRECIO</span>}
                        {r.descripcion}
                      </span>
                      <span style={{ color: colors.muted, fontSize: 11 }}>{r._cargo != null ? r.unidad : unidadRespondida(r, preguntas)}</span>
                      <span style={{ color: colors.muted, textAlign: "right" }}>{fmt(r.cantidad)}</span>
                      <span style={{ color: colors.inkSoft, textAlign: "right" }}>${fmt(r.precio_unitario)}</span>
                      <span style={{ color: colors.ink, textAlign: "right", fontWeight: 600 }}>${fmt(r.total)}</span>
                      {r._i != null && !r.origen ? (
                        <button onClick={() => setRubros(rs => rs.filter(x => x.fila !== r.fila))}
                          style={{ background: "none", border: "none", color: colors.muted, cursor: "pointer", display: "flex" }}><Trash2 size={12} /></button>
                      ) : <span />}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          {paraPresupuesto && (
            <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: colors.inkSoft, background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: "10px 12px", marginBottom: 12, cursor: "pointer" }}>
              <input type="checkbox" checked={guardarEnBase} onChange={e => setGuardarEnBase(e.target.checked)} style={{ marginTop: 2 }} />
              <span><strong style={{ color: colors.ink }}>Guardar estos precios en la base de rubros</strong><br />
                Desmárcalo si es un presupuesto de prueba o con precios que no quieres que cuenten para otros.</span>
            </label>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="outline" style={{ flex: 1 }} onClick={() => { limpiar(); setError(""); }}>Descartar</Button>
            <Button variant="primary" size="lg" style={{ flex: 2 }} onClick={paraPresupuesto ? crearPresupuesto : crearObra} disabled={guardando || !nombre.trim() || incluyeIva === null || pendientes > 0 || faltanPreguntas.length > 0}>
              {guardando ? (paraPresupuesto ? "Creando presupuesto..." : "Creando obra...")
                : pendientes ? `Acepta o no acepta ${pendientes === 1 ? "el error" : `los ${pendientes} errores`} para continuar`
                : faltanPreguntas.length ? "Responde las preguntas de NOVA para continuar"
                : incluyeIva === null ? "Responde lo del IVA para continuar"
                : paraPresupuesto ? `Crear presupuesto · total $${fmt(lineaBase)}` : `Crear obra · línea base $${fmt(lineaBase)}`}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
