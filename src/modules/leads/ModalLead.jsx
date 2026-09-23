import { useState, useEffect } from "react";
import { Plus, Check, X, Trash2, GripVertical, MessageSquare, Sparkles, Mail, Mic } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import { daysUntil } from "../../lib/dates";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import ConfirmarBorrado from "../../components/ui/ConfirmarBorrado";
import InformeLead from "./InformeLead";
import ObraDelProyecto from "./ObraDelProyecto";
import { esAdmin } from "../../lib/roles";
import { mensajeError } from "../../lib/sesion";
import { etapaInfo, ORIGENES, SIGUIENTE_ESTADO, TEMPERATURAS, CATALOGO_BASE } from "./constantes";
import EtapasLead from "./EtapasLead";
import TuboProyecto from "./TuboProyecto";
import { TUNELES } from "./tubo";
import { useDictado } from "../../lib/dictado";

const hoy = () => new Date().toISOString().split("T")[0];
const iconoNota = { background: "none", border: "none", color: "#8B92A5", cursor: "pointer", fontSize: 13, padding: "0 3px", lineHeight: 1 };
const enDias = n => new Date(Date.now() + n * 86400000).toISOString().split("T")[0];

export default function ModalLead({ lead, currentUser, users = [], catalogo = CATALOGO_BASE, onIrAObra, onCerrar, onGuardado }) {
  const editando = !!lead;
  const [form, setForm] = useState(lead ? { ...lead } : {
    nombre: "", contacto: "", telefono: "", email: "", origen: "Referido",
    etapa: "lead", temperatura: "tibio", resultado: null, valor_estimado: "", fecha_cierre: "", notas: "",
    responsable_id: currentUser?.id || null, responsable_nombre: currentUser?.name || "",
  });
  const [ruta, setRuta] = useState([]);
  const [movs, setMovs] = useState([]);
  const [nota, setNota] = useState("");
  const [nuevoPaso, setNuevoPaso] = useState("");
  const [pensando, setPensando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [borrar, setBorrar] = useState(false);
  const [verEtapas, setVerEtapas] = useState(false);
  const [editNota, setEditNota] = useState({ id: null, texto: "" });
  // Todo junto en una columna era ilegible en el teléfono: ahora el proyecto
  // se abre en el plan, que es lo que uno viene a mirar, y lo demás está a un toque.
  const [seccion, setSeccion] = useState(lead ? "plan" : "datos");
  // Si le compartieron el proyecto y cae en una pestaña que no le toca, al plan.
  const seccionVisible = seccion === "datos" && editando && currentUser?.role !== "owner" && lead?.created_by !== currentUser?.id ? "plan" : seccion;
  const [informe, setInforme] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!lead) return;
    (async () => {
      const [{ data: ts }, { data: ms }] = await Promise.all([
        supabase.from("tasks").select("*").eq("lead_id", lead.id).order("ruta_orden", { nullsFirst: false }),
        supabase.from("lead_movimientos").select("*").eq("lead_id", lead.id).order("created_at", { ascending: false }).limit(30),
      ]);
      setRuta(ts || []);
      setMovs(ms || []);
    })();
  }, [lead]);

  const inp = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // automatico: lo anotó el sistema —cambió la etapa, se agregó un paso—. Eso
  // no se edita: si "pasó a Contrato el 12" se pudiera corregir, dejaría de ser
  // un registro. Lo que uno escribe a mano, sí.
  async function anotar(lead_id, tipo, detalle, extra = {}) {
    await supabase.from("lead_movimientos").insert({
      lead_id, tipo, detalle, automatico: true,
      autor_id: currentUser?.id, autor_nombre: currentUser?.name, ...extra,
    });
  }

  async function recargarBitacora() {
    const { data } = await supabase.from("lead_movimientos").select("*").eq("lead_id", lead.id)
      .order("created_at", { ascending: false }).limit(30);
    setMovs(data || []);
  }

  async function guardarNotaEditada(m) {
    const t = (editNota.texto || "").trim();
    if (!t) return;
    await supabase.from("lead_movimientos").update({ detalle: t }).eq("id", m.id);
    setEditNota({ id: null, texto: "" });
    await recargarBitacora();
  }

  async function borrarNota(m) {
    await supabase.from("lead_movimientos").delete().eq("id", m.id);
    await recargarBitacora();
  }

  async function guardar() {
    if (!form.nombre?.trim()) { setError("Ponle un nombre al lead."); return; }
    setGuardando(true); setError("");
    const payload = {
      nombre: form.nombre.trim(), contacto: form.contacto || null, telefono: form.telefono || null,
      email: form.email || null, origen: form.origen || null, etapa: form.etapa,
      temperatura: form.temperatura || null, resultado: form.resultado || null,
      valor_estimado: Number(form.valor_estimado) || null,
      fecha_cierre: form.fecha_cierre || null, notas: form.notas || null,
      responsable_id: Number(form.responsable_id) || null,
      responsable_nombre: users.find(u => u.id === Number(form.responsable_id))?.name || form.responsable_nombre || null,
      motivo_perdida: form.resultado === "perdido" ? (form.motivo_perdida || null) : null,
      actualizado_at: new Date().toISOString(),
    };

    if (editando) {
      const { error: e } = await supabase.from("leads").update(payload).eq("id", lead.id);
      if (e) { setError(e.message); setGuardando(false); return; }
      if (lead.etapa !== form.etapa) {
        await anotar(lead.id, "etapa", `${etapaInfo(lead.etapa, catalogo).nombre} → ${etapaInfo(form.etapa, catalogo).nombre}`,
          { etapa_de: lead.etapa, etapa_a: form.etapa });
      }
      setGuardando(false); onGuardado(); return;
    }

    const { data: creado, error: e } = await supabase.from("leads")
      .insert({ ...payload, created_by: currentUser?.id }).select().single();
    if (e || !creado) { setError(e?.message || "No se pudo crear"); setGuardando(false); return; }

    // El lead nace en blanco: su ruta la va escribiendo NOVA a medida que
    // aparecen los pasos. Una ruta de plantilla se llena de pasos que nadie
    // pensó, y eso entrena a ignorarla.
    await anotar(creado.id, "nota", "Lead creado");
    setGuardando(false); onGuardado();
  }

  // Tres estados, no dos: pendiente → hecho → no se hizo. Un paso que se
  // descartó y queda "pendiente" para siempre ensucia la señal de lo que
  // falta, y termina enseñando a ignorarla.
  async function alternarPaso(t) {
    const nuevo = SIGUIENTE_ESTADO[t.status] || "listo";
    await supabase.from("tasks").update({ status: nuevo }).eq("id", t.id);
    setRuta(r => r.map(x => x.id === t.id ? { ...x, status: nuevo } : x));
    await supabase.from("leads").update({ actualizado_at: new Date().toISOString() }).eq("id", lead.id);
    if (nuevo === "listo") await anotar(lead.id, "nota", `Hecho: ${t.title}`);
    if (nuevo === "bloqueado") await anotar(lead.id, "nota", `No se hizo: ${t.title}`);
  }

  async function cambiarFecha(t, fecha) {
    await supabase.from("tasks").update({ due_date: fecha || null }).eq("id", t.id);
    setRuta(r => r.map(x => x.id === t.id ? { ...x, due_date: fecha } : x));
    await anotar(lead.id, "nota", fecha ? `"${t.title}" quedó para el ${fecha}` : `"${t.title}" se quedó sin fecha`);
    await recargarBitacora();
  }

  // Se le dicta a NOVA en el idioma de uno —"enviar portafolio el viernes y
  // llamar al arquitecto el lunes"— y ella lo parte en pasos con fecha. Si no
  // entiende, el texto entra tal cual como un paso: nunca se pierde lo escrito.
  async function agregarPaso(dictado) {
    const texto = (typeof dictado === "string" ? dictado : nuevoPaso).trim();
    if (!texto || !lead) return;
    setPensando(true); setError("");
    const orden = Math.max(0, ...ruta.map(t => t.ruta_orden || 0));
    let pasos = null;
    try {
      const res = await fetch("/api/nova", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-5", max_tokens: 800,
          system: `Conviertes lo que dicta un director comercial en pasos de seguimiento de un lead.
Hoy es ${hoy()}. El lead se llama "${lead.nombre}"${form.contacto ? `, contacto ${form.contacto}` : ""}.
Puede venir más de un paso en una frase. Devuelve SOLO JSON, sin markdown:
{"pasos":[{"titulo":"Enviar portafolio","fecha":"2026-09-18"}]}
El título es corto y empieza con el verbo de la acción. La fecha en AAAA-MM-DD:
interpreta "el viernes", "mañana", "en dos semanas" contra la fecha de hoy.
Si no se dice cuándo, pon la fecha de hoy.`,
          messages: [{ role: "user", content: texto }],
        }),
      });
      const data = await res.json();
      const txt = (data.content?.[0]?.text || "").replace(/```json|```/g, "").trim();
      pasos = JSON.parse(txt.match(/\{[\s\S]*\}/)[0]).pasos;
    } catch { pasos = null; }

    const filas = (pasos?.length ? pasos : [{ titulo: texto, fecha: hoy() }])
      .filter(p => p.titulo?.trim())
      .map((p, i) => ({
        title: p.titulo.trim(), lead_id: lead.id, ruta_orden: orden + i + 1,
        due_date: /^\d{4}-\d{2}-\d{2}$/.test(p.fecha) ? p.fecha : hoy(),
        priority: "media", status: "pendiente", type: "lead",
        assignee_id: Number(form.responsable_id) || currentUser?.id, created_by: currentUser?.id,
      }));

    const { data, error: e } = await supabase.from("tasks").insert(filas).select();
    if (e) setError("No se pudo agregar el paso: " + mensajeError(e));
    else {
      setRuta(r => [...r, ...(data || [])]);
      setNuevoPaso("");
      // Los pasos también son movimientos del proyecto: quien lea la bitácora
      // tiene que ver qué se decidió hacer, no solo lo que ya se hizo.
      await anotar(lead.id, "nota", `Pasos nuevos: ${filas.map(f => `${f.title}${f.due_date ? ` (${f.due_date})` : ""}`).join(" · ")}`);
      const { data: ms } = await supabase.from("lead_movimientos").select("*").eq("lead_id", lead.id).order("created_at", { ascending: false }).limit(30);
      setMovs(ms || []);
    }
    setPensando(false);
  }

  async function borrarPaso(t) {
    await supabase.from("tasks").delete().eq("id", t.id);
    setRuta(r => r.filter(x => x.id !== t.id));
    await anotar(lead.id, "nota", `Paso quitado: ${t.title}`);
  }

  async function agregarNota() {
    const d = nota.trim();
    if (!d || !lead) return;
    await anotar(lead.id, "nota", d, { automatico: false });
    await supabase.from("leads").update({ actualizado_at: new Date().toISOString() }).eq("id", lead.id);
    const { data } = await supabase.from("lead_movimientos").select("*").eq("lead_id", lead.id).order("created_at", { ascending: false }).limit(30);
    setMovs(data || []); setNota("");
  }

  // Un lead que se borra se lleva su ruta, sus etapas y su bitácora: dejarlos
  // sueltos llenaría las tareas de pasos de algo que ya no existe.
  async function revisarBorrado() {
    if (lead.obra_id) {
      return { bloqueo: "Este proyecto ya arrancó como obra. Bórralo desde Control de Obra si de verdad quieres eliminarlo; desde acá no, para no dejar la obra sin su origen." };
    }
    const [{ count: etapas }, { count: invitados }] = await Promise.all([
      supabase.from("lead_etapas").select("id", { count: "exact", head: true }).eq("lead_id", lead.id),
      supabase.from("pipeline_invitados").select("id", { count: "exact", head: true }).eq("lead_id", lead.id),
    ]);
    return { bloqueo: null, detalle: [
      `${ruta.length} pasos de la ruta (tareas)`,
      `${etapas || 0} etapas del proyecto`,
      `${movs.length} movimientos de la bitácora`,
      `${invitados || 0} personas invitadas al proyecto`,
    ] };
  }

  async function ejecutarBorrado() {
    await supabase.from("tasks").delete().eq("lead_id", lead.id);
    await supabase.from("lead_etapas").delete().eq("lead_id", lead.id);
    await supabase.from("pipeline_invitados").delete().eq("lead_id", lead.id);
    await supabase.from("lead_movimientos").delete().eq("lead_id", lead.id);
    const { error: e } = await supabase.from("leads").delete().eq("id", lead.id);
    return e;
  }

  const { grabando, error: errorVoz, dictar } = useDictado({
    onParcial: setNuevoPaso,
    onListo: t => { setNuevoPaso(t); agregarPaso(t); },
  });
  // La nota de bitácora no se manda sola al terminar de dictar: es texto libre
  // y conviene leerlo antes, que es donde el dictado se equivoca.
  const { grabando: grabandoNota, error: errorVozNota, dictar: dictarNota } = useDictado({
    onParcial: setNota,
    onListo: setNota,
  });

  const puedeBorrar = editando && esAdmin(currentUser?.role);
  const hechos = ruta.filter(t => t.status === "listo" || t.status === "bloqueado").length;
  const lbl = { fontSize: 10, color: colors.muted, fontWeight: 600, display: "block", marginBottom: 3 };
  const mini = { ...inputStyle, padding: "7px 9px", fontSize: 12 };

  const etapaActual = etapaInfo(form.etapa, catalogo);
  const temp = TEMPERATURAS.find(t => t.id === form.temperatura);
  // Los datos del proyecto —valor, contacto, origen, resultado— son del
  // Director y de quien lo abrió. Quien trabaja una etapa ve el plan y lo suyo,
  // no cuánto vale el negocio.
  const verDatos = currentUser?.role === "owner" || !editando || lead.created_by === currentUser?.id;
  const SECCIONES = editando
    ? [["plan", "El proyecto"], ...(verDatos ? [["datos", "Datos"]] : []), ["gente", "Gente"]]
    : [["datos", "Datos"]];

  return (
    <Modal onClose={onCerrar} maxWidth={560}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: colors.ink, flex: 1, minWidth: 140 }}>
          {editando ? lead.nombre : "Nuevo proyecto"}
        </div>
        {editando && (
          <>
            {temp && <span title={temp.label} style={{ width: 8, height: 8, borderRadius: "50%", background: temp.color }} />}
            <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, color: "#fff", background: etapaActual.color || colors.muted }}>
              {etapaActual.nombre}
            </span>
          </>
        )}
      </div>

      {editando && (
        <div className="obra-tabs" style={{ marginBottom: 12 }}>
          {SECCIONES.map(([id, txt]) => (
            <button key={id} onClick={() => setSeccion(id)}
              style={{ padding: "7px 13px", border: "none", background: "transparent", cursor: "pointer", fontFamily: colors.font,
                fontSize: 12, fontWeight: seccionVisible === id ? 600 : 400, color: seccionVisible === id ? colors.brand : colors.inkSoft,
                borderBottom: `2px solid ${seccionVisible === id ? colors.brand : "transparent"}` }}>
              {txt}{id === "dia" && ruta.length > 0 ? ` ${hechos}/${ruta.length}` : ""}
            </button>
          ))}
        </div>
      )}

      {seccionVisible === "datos" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 12 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={lbl}>NOMBRE DEL PROYECTO</label>
            <input value={form.nombre} onChange={e => inp("nombre", e.target.value)} placeholder="Ej: Plaza Comercial Puembo" style={mini} autoFocus />
          </div>
          <div><label style={lbl}>CONTACTO</label><input value={form.contacto || ""} onChange={e => inp("contacto", e.target.value)} style={mini} /></div>
          <div><label style={lbl}>TELÉFONO</label><input value={form.telefono || ""} onChange={e => inp("telefono", e.target.value)} style={mini} /></div>
          <div><label style={lbl}>ORIGEN</label>
            <select value={form.origen || ""} onChange={e => inp("origen", e.target.value)} style={mini}>
              {ORIGENES.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div><label style={lbl}>RESPONSABLE</label>
            <select value={form.responsable_id || ""} onChange={e => inp("responsable_id", e.target.value)} style={mini}>
              <option value="">Sin asignar</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div><label style={lbl}>VALOR ESTIMADO</label><input type="number" value={form.valor_estimado || ""} onChange={e => inp("valor_estimado", e.target.value)} placeholder="0" style={mini} /></div>
          <div><label style={lbl}>SE DECIDE EL</label><input type="date" value={form.fecha_cierre || ""} onChange={e => inp("fecha_cierre", e.target.value)} style={mini} /></div>
          <div>
            <label style={lbl}>TEMPERATURA</label>
            <div style={{ display: "flex", gap: 4 }}>
              {TEMPERATURAS.map(t => (
                <button key={t.id} onClick={() => inp("temperatura", form.temperatura === t.id ? null : t.id)}
                  style={{ flex: 1, padding: "5px 8px", borderRadius: colors.radiusSm, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: colors.font,
                    border: `1px solid ${form.temperatura === t.id ? t.color : colors.border}`,
                    background: form.temperatura === t.id ? t.color : "transparent",
                    color: form.temperatura === t.id ? "#fff" : colors.inkSoft }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={lbl}>RESULTADO</label>
            <div style={{ display: "flex", gap: 4 }}>
              {[[null, "Abierto", colors.inkSoft], ["ganado", "Ganado", colors.success], ["perdido", "Perdido", colors.muted]].map(([v, t, c]) => (
                <button key={t} onClick={() => inp("resultado", v)}
                  style={{ flex: 1, padding: "5px 8px", borderRadius: colors.radiusSm, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: colors.font,
                    border: `1px solid ${(form.resultado || null) === v ? c : colors.border}`,
                    background: (form.resultado || null) === v ? c : "transparent",
                    color: (form.resultado || null) === v ? "#fff" : colors.inkSoft }}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          {form.resultado === "perdido" && (
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={lbl}>¿POR QUÉ SE PERDIÓ?</label>
              <input value={form.motivo_perdida || ""} onChange={e => inp("motivo_perdida", e.target.value)} placeholder="Precio, plazo, se fue con otro..." style={mini} />
            </div>
          )}
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={lbl}>ETAPA ACTUAL</label>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {catalogo.map(et => (
                <button key={et.id} onClick={() => inp("etapa", et.id)}
                  style={{ padding: "5px 11px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: colors.font,
                    border: `1px solid ${form.etapa === et.id ? et.color : colors.border}`,
                    background: form.etapa === et.id ? et.color : "transparent",
                    color: form.etapa === et.id ? "#fff" : colors.inkSoft }}>
                  {et.nombre}
                </button>
              ))}
            </div>
            {editando && <div style={{ fontSize: 10, color: colors.muted, marginTop: 4 }}>Normalmente se mueve sola, al marcar una etapa En curso en el Plan.</div>}

            {/* En qué tubo va: mientras se persigue es un lead, y al ganarlo
                recorre los hitos de Arquitectura o de Construcción. Es el mismo
                proyecto, en otro momento. */}
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, color: colors.muted, marginBottom: 5 }}>TUBO</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {Object.entries(TUNELES).map(([id, t]) => (
                  <button key={id} type="button" onClick={() => setForm(p => ({ ...p, tunel: id, es_lead: id === "lead" }))}
                    style={{ border: `1px solid ${(form.tunel || "lead") === id ? colors.ink : colors.border}`, borderRadius: 16, padding: "4px 12px",
                      background: (form.tunel || "lead") === id ? colors.ink : "#fff", color: (form.tunel || "lead") === id ? "#fff" : colors.inkSoft,
                      fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: colors.font }}>
                    {t.label}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 10, color: colors.muted, marginTop: 4 }}>
                {(form.tunel || "lead") === "lead"
                  ? "Se está persiguiendo: sus etapas pasan sin orden y aparece con una (L)."
                  : "Recorre los hitos en orden, uno detrás de otro."}
              </div>
            </div>
          </div>
        </div>
      )}

      {editando && seccionVisible === "plan" && lead.obra_id && (
        <ObraDelProyecto obraId={lead.obra_id} onIrAObra={onIrAObra} />
      )}

      {/* El tubo: los hitos del proyecto y qué le falta a cada uno. En los
          tubos con orden —Arquitectura, Construcción— se ve el camino entero.
          Un lead va sin orden, así que ahí manda la lista de abajo. */}
      {/* El tubo, igual para los tres tipos: los hitos en fila, y abajo lo que
          le falta al que se esté mirando. En un lead las etapas se agregan
          cuando pasan; en Arquitectura y Construcción vienen puestas, en orden. */}
      {editando && seccionVisible === "plan" && (
        <div style={{ marginBottom: 14 }}>
          <TuboProyecto lead={{ ...lead, tunel: form.tunel }} catalogo={catalogo} users={users} currentUser={currentUser} onBitacora={recargarBitacora} />
        </div>
      )}

      {editando && seccionVisible === "gente" && (
        <EtapasLead lead={lead} catalogo={catalogo} users={users} currentUser={currentUser}
          parte="gente"
          puedeCompartir={esAdmin(currentUser?.role) || lead.created_by === currentUser?.id}
          onBitacora={recargarBitacora}
          onEtapaCambiada={etapa => setForm(p => ({ ...p, etapa }))} />
      )}

      {editando && seccionVisible === "dia" && (
        <>
          <div style={{ fontSize: 11, color: colors.inkSoft, marginBottom: 8 }}>
            Lo suelto de esta semana. Son tareas de verdad: vencen y aparecen en la lista de quien las tiene.
          </div>
          <div style={{ background: colors.bg, borderRadius: colors.radiusMd, padding: 10, marginBottom: 12 }}>
            {ruta.length === 0 && <div style={{ fontSize: 11, color: colors.inkSoft, marginBottom: 8 }}>Todavía sin pasos. Dictale abajo a NOVA qué sigue y con qué fecha.</div>}
            {ruta.map(t => {
              const listo = t.status === "listo";
              const noHecho = t.status === "bloqueado";
              const cerrado = listo || noHecho;
              const d = t.due_date ? daysUntil(t.due_date) : null;
              const vencido = !cerrado && d != null && d < 0;
              return (
                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", flexWrap: "wrap" }}>
                  <button onClick={() => alternarPaso(t)} title="Pendiente → hecho → no se hizo"
                    style={{ width: 19, height: 19, borderRadius: 5, flexShrink: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
                      border: `1.5px solid ${listo ? colors.success : noHecho ? colors.muted : vencido ? colors.danger : colors.border}`,
                      background: listo ? colors.success : noHecho ? colors.muted : "transparent" }}>
                    {listo && <Check size={11} color="#fff" />}
                    {noHecho && <X size={11} color="#fff" />}
                  </button>
                  <span style={{ flex: 1, minWidth: 120, fontSize: 12, color: cerrado ? colors.muted : colors.ink, textDecoration: cerrado ? "line-through" : "none" }}>
                    {t.title}
                  </span>
                  <input type="date" value={t.due_date || ""} onChange={e => cambiarFecha(t, e.target.value)}
                    style={{ ...mini, width: 130, padding: "4px 6px", fontSize: 11, color: vencido ? colors.danger : colors.inkSoft, borderColor: vencido ? colors.dangerBorder : colors.border }} />
                  <button onClick={() => borrarPaso(t)} style={{ background: "none", border: "none", color: colors.muted, cursor: "pointer", display: "flex", padding: 2 }}><Trash2 size={12} /></button>
                </div>
              );
            })}
            {grabando && <div style={{ fontSize: 11, color: colors.danger, marginTop: 6 }}>Escuchando… toca el micrófono cuando termines.</div>}
            {errorVoz && <div style={{ fontSize: 11, color: colors.warning, marginTop: 6 }}>{errorVoz}</div>}
            <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
              <Sparkles size={14} color={colors.brand} style={{ flexShrink: 0 }} />
              <input value={nuevoPaso} onChange={e => setNuevoPaso(e.target.value)}
                disabled={pensando}
                placeholder={pensando ? "NOVA está anotando..." : "Enviar portafolio el viernes..."}
                style={{ ...mini, flex: 1, minWidth: 0 }} />
              <button onClick={dictar} disabled={pensando} title={grabando ? "Tocar para terminar" : "Dictar el paso"}
                style={{ background: grabando ? colors.danger : colors.neutralSoft, border: "none", borderRadius: colors.radiusSm, width: 32, height: 30, flexShrink: 0,
                  color: grabando ? "#fff" : colors.inkSoft, cursor: pensando ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Mic size={13} />
              </button>
              <Button variant="primary" size="sm" onClick={() => agregarPaso()} disabled={!nuevoPaso.trim() || pensando}>
                <Plus size={12} /> {pensando ? "..." : "Anotar"}
              </Button>
            </div>
          </div>
        </>
      )}

      {/* La bitácora es el pie del proyecto —qué pasó, en orden—, no otra
          pantalla: se lee después de ver las etapas. */}
      {editando && seccionVisible === "plan" && (
        <div style={{ borderTop: `1px solid ${colors.neutralSoft}`, marginTop: 18, paddingTop: 12, fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.5 }}>
          BITÁCORA
        </div>
      )}
      {editando && seccionVisible === "plan" && (
        <>
          <div style={{ fontSize: 11, color: colors.inkSoft, marginBottom: 8 }}>
            Qué pasó, en orden. Se llena sola con el plan y los pasos; lo que escribes tú se puede corregir.
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "flex-end" }}>
            <textarea value={nota} onChange={e => setNota(e.target.value)} rows={2}
              onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) agregarNota(); }}
              placeholder="¿Qué pasó? Una llamada, una visita, lo que dijeron..."
              style={{ ...mini, flex: 1, minWidth: 0, resize: "vertical", lineHeight: 1.5 }} />
            <button onClick={dictarNota} title={grabandoNota ? "Tocar para terminar" : "Dictar la nota"}
              style={{ background: grabandoNota ? colors.danger : colors.neutralSoft, border: "none", borderRadius: colors.radiusSm,
                width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                color: grabandoNota ? "#fff" : colors.inkSoft, cursor: "pointer" }}>
              <Mic size={13} />
            </button>
            <Button variant="outline" size="sm" onClick={agregarNota} disabled={!nota.trim()}><MessageSquare size={12} /> Anotar</Button>
          </div>
          {grabandoNota && <div style={{ fontSize: 11, color: colors.danger, marginBottom: 6 }}>Escuchando… toca el micrófono cuando termines.</div>}
          {errorVozNota && <div style={{ fontSize: 11, color: colors.warning, marginBottom: 6 }}>{errorVozNota}</div>}
          <div style={{ maxHeight: 260, overflowY: "auto", marginBottom: 12 }}>
            {movs.map(m => {
              const mio = !m.automatico && (m.autor_id === currentUser?.id || esAdmin(currentUser?.role));
              const enEdicion = editNota.id === m.id;
              return (
                <div key={m.id} style={{ fontSize: 11, color: colors.inkSoft, padding: "5px 0", borderBottom: `1px solid ${colors.neutralSoft}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ color: colors.muted, flex: 1 }}>
                      {new Date(m.created_at).toLocaleDateString("es-EC")} · {m.autor_nombre}
                      {m.automatico && <span style={{ color: colors.border }}> · automático</span>}
                    </span>
                    {mio && !enEdicion && (
                      <>
                        <button onClick={() => setEditNota({ id: m.id, texto: m.detalle || "" })} style={iconoNota} title="Corregir">✎</button>
                        <button onClick={() => borrarNota(m)} style={{ ...iconoNota, color: colors.danger }} title="Borrar">×</button>
                      </>
                    )}
                  </div>
                  {enEdicion ? (
                    <div style={{ display: "flex", gap: 5, marginTop: 4, flexWrap: "wrap" }}>
                      <input value={editNota.texto} onChange={e => setEditNota(p => ({ ...p, texto: e.target.value }))}
                        style={{ ...mini, flex: 1, minWidth: 140 }} autoFocus />
                      <Button variant="primary" size="sm" onClick={() => guardarNotaEditada(m)}>Guardar</Button>
                      <Button variant="outline" size="sm" onClick={() => setEditNota({ id: null, texto: "" })}>Cancelar</Button>
                    </div>
                  ) : m.detalle}
                </div>
              );
            })}
            {movs.length === 0 && <div style={{ fontSize: 11, color: colors.muted }}>Sin movimientos todavía.</div>}
          </div>
        </>
      )}

      {error && <div style={{ color: colors.danger, fontSize: 12, marginBottom: 10 }}>{error}</div>}

      <div className="modal-acciones">
        <Button variant="primary" onClick={guardar} disabled={guardando}>
          {guardando ? "Guardando..." : editando ? "Guardar cambios" : "Crear proyecto"}
        </Button>
        <Button variant="outline" onClick={onCerrar}>Cerrar</Button>
        {editando && (
          <Button variant="outline" onClick={() => setInforme(true)} title="Mandar un informe de avance por correo">
            <Mail size={13} /> Informe
          </Button>
        )}
        {puedeBorrar && (
          <Button variant="outline" onClick={() => setBorrar(true)} style={{ color: colors.danger, borderColor: colors.dangerBorder }}>
            <Trash2 size={13} /> Borrar
          </Button>
        )}
      </div>

      {informe && <InformeLead lead={lead} onCerrar={() => setInforme(false)} />}

      {borrar && (
        <ConfirmarBorrado
          titulo="Borrar este proyecto del pipeline" nombre={lead.nombre}
          usuarioId={currentUser?.id}
          revisar={revisarBorrado} borrar={ejecutarBorrado}
          onCancelar={() => setBorrar(false)}
          onBorrado={() => { setBorrar(false); onGuardado(); }}
        />
      )}
    </Modal>
  );
}
