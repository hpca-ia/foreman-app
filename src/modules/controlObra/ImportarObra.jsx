import { useState, useRef } from "react";
import { Upload, Sparkles, Trash2, ArrowLeft, CheckCircle2, AlertTriangle, SlidersHorizontal, BookmarkCheck } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import { fmt } from "./calculos";
import { alimentarBase } from "../../lib/baseRubros";
import { MAPA_PROMPT, interpretarPresupuesto, buscarFormato, firmaEncabezado, soloColumnas } from "./leerPresupuesto";
import RevisionPresupuesto from "./RevisionPresupuesto";
import EditorColumnas from "./EditorColumnas";

const n = v => Number(v) || 0;
const CAP_CARGOS = "HONORARIOS Y CARGOS";

// El presupuesto que se controla NO es el que se cotiza: puede ser el
// aprobado por el cliente, el del contratista, otro documento. Por eso
// esta importación crea la obra directamente, sin pasar por Presupuestos.
const PROMPT = `Replica este presupuesto de construcción TAL CUAL, sin resumir ni reagrupar.
Devuelve SOLO JSON compacto, sin markdown:
{"nombre":"","cliente":"","rubros":[{"c":"CAPITULO","d":"descripcion","u":"unidad","q":0,"p":0,"t":0}]}
Reglas:
- Un objeto por rubro, en el MISMO ORDEN del documento.
- "c" = el capítulo/sección al que pertenece ese rubro (repite el nombre en cada rubro).
- Las filas de encabezado de capítulo y las de subtotal NO son rubros: no las incluyas.
- "q" cantidad, "p" precio unitario, "t" total de la fila. Si falta "t", omítelo.
- No inventes rubros ni cambies descripciones.`;

// La hoja con el presupuesto: la que se llama así, o la más larga.
function hojaPresupuesto(XLSX, wb) {
  const leer = nombre => XLSX.utils.sheet_to_json(wb.Sheets[nombre], { header: 1, blankrows: false, defval: "" });
  const porNombre = wb.SheetNames.find(s => /presupuesto/i.test(s));
  if (porNombre) return leer(porNombre);
  return wb.SheetNames.map(leer).sort((a, b) => b.length - a.length)[0] || [];
}

export default function ImportarObra({ currentUser, onVolver, onCreada }) {
  const [leyendo, setLeyendo] = useState(false);
  const [paso, setPaso] = useState("");
  const [error, setError] = useState("");
  const [archivo, setArchivo] = useState(null);
  const [rubros, setRubros] = useState([]);
  const [cargos, setCargos] = useState([]);
  const [omitidas, setOmitidas] = useState([]);
  const [control, setControl] = useState(null);     // lo que declaraba el Excel, para comparar
  const [advertencias, setAdvertencias] = useState([]);
  // Para poder corregir columnas y recordar el formato hay que conservar las
  // filas del Excel y el mapa con que se leyeron.
  const [filasExcel, setFilasExcel] = useState(null);
  const [mapaActual, setMapaActual] = useState(null);
  const [origenMapa, setOrigenMapa] = useState(null);  // { tipo: "recordado" | "nova" | "manual", veces, archivo }
  const [verColumnas, setVerColumnas] = useState(false);
  const [nombre, setNombre] = useState("");
  const [cliente, setCliente] = useState("");
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

  async function nova(body, señal) {
    const res = await fetch("/api/nova", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: señal,
    });
    if (!res.ok) throw new Error(`El servidor respondió ${res.status}`);
    return res.json();
  }

  function limpiar() {
    setRubros([]); setCargos([]); setOmitidas([]); setControl(null); setAdvertencias([]);
    setFilasExcel(null); setMapaActual(null); setOrigenMapa(null); setVerColumnas(false);
    setIncluyeIva(null); setSugerenciaIva(""); setIncluirCargos(true);
  }

  // Lee las filas con un mapa de columnas y deja todo listo para la vista
  // previa. Se usa al leer, al reconocer un formato y al corregir a mano.
  function aplicarMapa(filas, mapa, origen) {
    const r = interpretarPresupuesto(filas, mapa);
    setFilasExcel(filas); setMapaActual(r.mapa); setOrigenMapa(origen);
    setRubros(r.rubros); setCargos(r.cargos); setOmitidas(r.omitidas);
    setControl({ subtotal: r.subtotalExcel, total: r.totalExcel, iva: r.ivaExcel, descuadres: r.descuadres });
    setAdvertencias(r.advertencias || []);
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
      const esExcel = /\.(xlsx|xls|csv)$/i.test(file.name);

      if (esExcel) {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const filas = hojaPresupuesto(XLSX, wb);

        // Primero, ¿ya conocemos este formato? Si otro Excel con los mismos
        // títulos de columna se importó bien, se lee igual y NOVA no adivina.
        const { data: formatos } = await supabase.from("formatos_presupuesto").select("*");
        const recordado = buscarFormato(filas, formatos || []);
        let mapa, origen, datosNova = null;
        if (recordado) {
          mapa = recordado.mapa;
          origen = { tipo: "recordado", veces: recordado.formato.veces, archivo: recordado.formato.ejemplo_archivo };
        } else {
          setPaso("NOVA está reconociendo las columnas...");
          const muestra = filas.slice(0, 40).map((f, i) => `${i}: ` + f.map(c => String(c ?? "").slice(0, 30)).join(" | ")).join("\n");
          const data = await nova({
            model: "claude-sonnet-4-5", max_tokens: 1000,
            messages: [{ role: "user", content: [{ type: "text", text: `${muestra}\n\n${MAPA_PROMPT}` }] }],
          }, ctrl.signal);
          datosNova = parseJSONTolerante(data.content?.[0]?.text || "");
          mapa = datosNova || { fila_encabezado: 0 };
          origen = { tipo: "nova" };
        }

        setNombre(datosNova?.nombre || file.name.replace(/\.[^.]+$/, ""));
        setCliente(datosNova?.cliente || "");
        const cuantos = aplicarMapa(filas, mapa, origen);
        // Si con esas columnas no salen rubros, no se adivina más: se muestran
        // las columnas para corregirlas, con la opción de que NOVA lea todo.
        if (cuantos < 3) setVerColumnas(true);
        clearTimeout(reloj);
        setLeyendo(false); setPaso(""); e.target.value = "";
        return;
      }

      await leerConNova(file, null, ctrl.signal);
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

    const data = await nova({ model: "claude-sonnet-4-5", max_tokens: 16000, messages: [{ role: "user", content: contenido }] }, señal);
    const parsed = parseJSONTolerante(data.content?.[0]?.text || "");
    if (!parsed?.rubros?.length) {
      setError("NOVA no pudo leer el presupuesto. Si es muy grande, prueba subirlo por capítulos.");
      setLeyendo(false); setPaso(""); return;
    }
    // Leído por NOVA ya no hay columnas que corregir ni formato que recordar.
    setFilasExcel(null); setMapaActual(null); setOrigenMapa(null); setVerColumnas(false);
    setControl(null); setAdvertencias([]); setCargos([]); setOmitidas([]);
    setRubros(parsed.rubros.map(r => ({
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
    setCliente(parsed.cliente || "");
    setLeyendo(false); setPaso("");
  }

  function corregirColumnas(nuevoMapa) {
    aplicarMapa(filasExcel, nuevoMapa, { tipo: "manual" });
  }

  // ── Cuentas de la vista previa ──
  const factor = incluyeIva === false ? 1 + n(ivaPct) / 100 : 1;
  const sumaRubros = rubros.reduce((s, r) => s + r.total, 0);
  const sumaCargos = incluirCargos ? cargos.reduce((s, c) => s + c.total, 0) : 0;
  const base = sumaRubros + sumaCargos;
  const ivaSumado = base * (factor - 1);
  const lineaBase = base * factor;
  const capitulos = [...new Set(rubros.map(r => r.capitulo))];

  // Contra el Excel: los rubros contra su SUBTOTAL; rubros + cargos (+ su línea
  // de IVA, si tenía) contra su TOTAL.
  const difSubtotal = control?.subtotal != null ? sumaRubros - control.subtotal : null;
  const difTotal = control?.total != null ? sumaRubros + cargos.reduce((s, c) => s + c.total, 0) + (control.iva?.total || 0) - control.total : null;

  // Guarda el mapa como formato conocido. Si ya existía, suma un uso y se
  // queda con la última corrección.
  async function recordarFormato() {
    if (!filasExcel || !mapaActual) return null;
    const encabezado = filasExcel[mapaActual.fila_encabezado ?? 0] || [];
    const firma = firmaEncabezado(encabezado);
    if (!firma) return null;
    const { data: ya, error: eBusca } = await supabase.from("formatos_presupuesto").select("id,veces").eq("firma", firma).maybeSingle();
    if (eBusca) return eBusca;
    const datos = { firma, encabezados: encabezado, mapa: soloColumnas(mapaActual), actualizado_at: new Date().toISOString() };
    const { error } = ya
      ? await supabase.from("formatos_presupuesto").update({ ...datos, veces: (ya.veces || 1) + 1 }).eq("id", ya.id)
      : await supabase.from("formatos_presupuesto").insert({ ...datos, ejemplo_archivo: archivo?.name || null, creado_por: currentUser.id });
    return error;
  }

  async function crearObra() {
    if (!rubros.length || !nombre.trim() || incluyeIva === null) return;
    setGuardando(true); setError("");
    const pct = incluyeIva ? 0 : n(ivaPct);
    const faltan = [];

    const datosObra = {
      nombre: nombre.trim(), cliente_nombre: cliente.trim() || null,
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
      ...rubros,
      ...(incluirCargos ? cargos.map(c => ({ capitulo: CAP_CARGOS, codigo: "", descripcion: c.descripcion, unidad: "glb", cantidad: 1, precio_unitario: c.total, total: c.total })) : []),
    ];
    const ordenCap = {}; let capN = 0; const idxCap = {};
    const filas = todos.map((r, i) => {
      if (!(r.capitulo in ordenCap)) ordenCap[r.capitulo] = ++capN;
      const c = ordenCap[r.capitulo];
      idxCap[c] = (idxCap[c] || 0) + 1;
      return {
        obra_id: obra.id, numero: i + 1, codigo: r.codigo || null, capitulo: r.capitulo,
        capitulo_orden: c, orden: c * 1000 + idxCap[c],
        descripcion: r.descripcion, unidad: r.unidad,
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
      const { error: eUp } = await supabase.storage.from("task-files").upload(ruta, archivo, { upsert: false, contentType: archivo.type || "application/octet-stream" });
      if (!eUp) {
        const { data: pub } = supabase.storage.from("task-files").getPublicUrl(ruta);
        await supabase.from("obras").update({ archivo_presupuesto_url: pub.publicUrl, archivo_presupuesto_nombre: archivo.name }).eq("id", obra.id);
      }
    }

    // La revisión queda con la obra, para volver a verla en la pestaña Presupuesto.
    if (!sinMigracion) {
      const { error: eAdv } = await supabase.from("obras").update({ advertencias }).eq("id", obra.id);
      if (eAdv) faltan.push("014 (revisión del Excel)");
    }

    // La obra se creó bien: el formato con que se leyó queda aprendido.
    const eFormato = await recordarFormato();
    if (eFormato) faltan.push("015 (recordar el formato)");

    // El presupuesto que se controla también es conocimiento: sus rubros y sus
    // precios (sin IVA, como se cotizan) entran a la base de rubros.
    await alimentarBase(rubros, { cliente: cliente.trim(), proyecto: nombre.trim() });

    setGuardando(false);
    if (faltan.length) alert(`La obra se creó, pero falta correr en Supabase la migración ${faltan.join(", ")}.`);
    onCreada(obra);
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
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <Button variant="secondary" size="sm" onClick={onVolver}><ArrowLeft size={13} /> Volver</Button>
        <div style={{ fontSize: 16, fontWeight: 700, color: colors.ink }}>Importar presupuesto de obra</div>
      </div>

      <div style={{ fontSize: 12, color: colors.inkSoft, marginBottom: 14 }}>
        Sube el presupuesto que vas a <strong>ejecutar y controlar</strong> — el aprobado por el cliente, el del contratista, el que sea. Se guarda también el archivo original, para verlo tal cual cuando haga falta.
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
            <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr", gap: 10, marginBottom: 14 }}>
              <div><label style={lbl}>NOMBRE DE LA OBRA</label><input value={nombre} onChange={e => setNombre(e.target.value)} style={inputStyle} /></div>
              <div><label style={lbl}>CLIENTE</label><input value={cliente} onChange={e => setCliente(e.target.value)} style={inputStyle} placeholder="Opcional" /></div>
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
                El control de obra se hace con IVA, porque las facturas lo traen. {sugerenciaIva}
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

            {/* Totales y comparación con el Excel */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
              <div>
                <Linea t={`${rubros.length} rubros en ${capitulos.length} capítulos`} v={sumaRubros} />
                {cargos.length > 0 && (
                  <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                    <input type="checkbox" checked={incluirCargos} onChange={e => setIncluirCargos(e.target.checked)} />
                    <span style={{ flex: 1 }}><Linea t={cargos.map(c => c.descripcion).join(" · ").slice(0, 60)} v={cargos.reduce((s, c) => s + c.total, 0)} /></span>
                  </label>
                )}
                {incluyeIva === false && <Linea t={`IVA ${n(ivaPct)} %`} v={ivaSumado} />}
                <div style={{ borderTop: `1px solid ${colors.border}`, marginTop: 4, paddingTop: 4 }}>
                  <Linea t={incluyeIva === null ? "Línea base (falta responder lo del IVA)" : "Línea base con IVA"} v={lineaBase} fuerte color={incluyeIva === null ? colors.warning : undefined} />
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
                <RevisionPresupuesto advertencias={advertencias} />
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
            {[...capitulos, ...(incluirCargos && cargos.length ? [CAP_CARGOS] : [])].map(cap => {
              const lista = cap === CAP_CARGOS
                ? cargos.map((c, i) => ({ ...c, codigo: "", unidad: "glb", cantidad: 1, precio_unitario: c.total, _cargo: i }))
                : rubros.map((r, i) => ({ ...r, _i: i })).filter(r => r.capitulo === cap);
              return (
                <div key={cap}>
                  <div style={{ background: colors.brandSoft, padding: "7px 14px", fontSize: 11, fontWeight: 700, color: colors.brand, position: "sticky", top: 0, display: "flex", justifyContent: "space-between" }}>
                    <span>{cap} <span style={{ fontWeight: 400, opacity: .7 }}>({lista.length})</span></span>
                    <span>${fmt(lista.reduce((s, r) => s + r.total, 0))}</span>
                  </div>
                  {lista.map(r => (
                    <div key={cap + (r._i ?? r._cargo)} style={{ display: "grid", gridTemplateColumns: "48px 1fr 44px 64px 84px 90px 26px", gap: 8, padding: "6px 14px", borderBottom: `1px solid ${colors.neutralSoft}`, fontSize: 12, alignItems: "center" }}>
                      <span style={{ color: colors.muted, fontSize: 10 }}>{r.codigo}</span>
                      <span style={{ color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.descripcion}>{r.descripcion}</span>
                      <span style={{ color: colors.muted, fontSize: 11 }}>{r.unidad}</span>
                      <span style={{ color: colors.muted, textAlign: "right" }}>{fmt(r.cantidad)}</span>
                      <span style={{ color: colors.inkSoft, textAlign: "right" }}>${fmt(r.precio_unitario)}</span>
                      <span style={{ color: colors.ink, textAlign: "right", fontWeight: 600 }}>${fmt(r.total)}</span>
                      {r._i != null ? (
                        <button onClick={() => setRubros(rs => rs.filter((_, j) => j !== r._i))}
                          style={{ background: "none", border: "none", color: colors.muted, cursor: "pointer", display: "flex" }}><Trash2 size={12} /></button>
                      ) : <span />}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="outline" style={{ flex: 1 }} onClick={() => { limpiar(); setError(""); }}>Descartar</Button>
            <Button variant="primary" size="lg" style={{ flex: 2 }} onClick={crearObra} disabled={guardando || !nombre.trim() || incluyeIva === null}>
              {guardando ? "Creando obra..." : incluyeIva === null ? "Responde lo del IVA para continuar" : `Crear obra · línea base $${fmt(lineaBase)}`}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function parseJSONTolerante(raw) {
  let t = raw.replace(/```json|```/g, "").trim();
  try { return JSON.parse(t); } catch {}
  const start = t.indexOf("{");
  if (start < 0) return null;
  t = t.slice(start);
  try { return JSON.parse(t); } catch {}
  try {
    const corte = t.lastIndexOf("}");
    let p = corte > 0 ? t.slice(0, corte + 1) : t;
    let llaves = 0, corchetes = 0;
    for (const c of p) { if (c === "{") llaves++; if (c === "}") llaves--; if (c === "[") corchetes++; if (c === "]") corchetes--; }
    p += "]".repeat(Math.max(corchetes, 0)) + "}".repeat(Math.max(llaves, 0));
    return JSON.parse(p);
  } catch { return null; }
}
