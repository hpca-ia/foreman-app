import { useState, useEffect, useCallback } from "react";
import { Check, Plus, X, ListTodo, Hourglass, Mail, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import { inputStyle } from "../../components/ui/Input";
import ComentariosTarea from "../../components/ComentariosTarea";
import { CLASES, claseDe, HORAS } from "../../theme/constants";
import { nombreDeEtapa, hoyISO, sumarDias } from "./pipeline";
import {
  cargarTareas, agregarTarea, marcarItem, marcarEspera, guardarNota, borrarItem, asegurarTarea, ponerFecha,
  anotarCorreccion, anotar,
} from "./proyecto";

// LAS TAREAS DEL PROYECTO: UNA LISTA.
//
// Son las mismas tareas que se ven en Tareas —la misma fila—, las de este
// proyecto. Arriba lo que falta, con lo más próximo primero: esa es el próximo
// paso. Abajo, plegado, lo que ya se hizo.
//
// Antes esto era una columna por etapa, cada una con su estado y su «estamos
// acá». El proyecto podía figurar en tres etapas a la vez y nadie sabía en
// cuál estaba. Ahora el lead está en una etapa, que se elige arriba, y la
// tarea solo lleva de etiqueta en cuál se escribió.

// Una fecha sin hora la lee el navegador como medianoche en Londres, y en
// Ecuador eso es el día anterior: por eso se lee al mediodía.
const cuando = f => (f ? new Date(String(f).length === 10 ? `${f}T12:00:00` : f).toLocaleDateString("es-EC", { day: "numeric", month: "short" }) : "");

const EN_BLANCO = { abierto: true, tipo: "gestion", texto: "", assignee_id: "", due_date: "", hora: "", destinatario: "" };

/**
 * @param etapaId   en qué etapa está el lead ahora: es la etiqueta con la que
 *                  nacen las tareas que se agregan acá
 * @param onTareas  avisa cada vez que cambia la lista, con las filas enteras:
 *                  de ahí saca el encabezado cuál es el próximo paso
 */
export default function ListaDeTareas({ lead, etapaId = null, catalogo = [], users = [], currentUser, puede = () => true, editable = true, onBitacora, onTareas }) {
  const [abiertas, setAbiertas] = useState([]);
  const [hechas, setHechas] = useState([]);
  const [tareas, setTareas] = useState({});
  const [sinMigracion, setSinMigracion] = useState(false);
  const [verHechas, setVerHechas] = useState(false);
  const [nuevo, setNuevo] = useState({ abierto: false });
  const [error, setError] = useState("");
  const [aTarea, setATarea] = useState(null);
  // A quién avisarle de una reunión: al del equipo que la tiene y a los de
  // afuera que vengan. Se elige cada vez, porque no siempre va el cliente.
  const [avisar, setAvisar] = useState(null);   // { item, tarea, a: Set }
  const [ocupado, setOcupado] = useState(false);
  // La tarea abierta: al tocarla cuenta qué se hizo, quién y cuándo, y ofrece
  // lo que se puede hacer con ella, con botones que dicen su nombre.
  const [abierta, setAbierta] = useState(null);
  // La gente de afuera que ya está en el proyecto: cliente, ingeniero,
  // proveedor. Una tarea puede ser de ellos aunque no entren a FOREMAN.
  const [invitados, setInvitados] = useState([]);

  // Le avisa por correo a quien quedó a cargo, igual que en el tablero.
  const avisarPorCorreo = async tareaId => {
    if (!tareaId) return;
    try {
      await fetch("/api/aviso?de=tarea", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tareaId }),
      });
    } catch { /* el correo no puede trabar el trabajo */ }
  };

  const cargar = useCallback(async () => {
    const [r, { data: inv }] = await Promise.all([
      cargarTareas(lead.id),
      supabase.from("pipeline_invitados").select("id,nombre,rol,email").eq("lead_id", lead.id).order("nombre"),
    ]);
    setSinMigracion(!!r.sinMigracion);
    setAbiertas(r.abiertas);
    setHechas(r.hechas);
    setTareas(r.tareas || {});
    setInvitados(inv || []);
    onTareas?.(Object.values(r.tareas || {}));
    // eslint-disable-next-line
  }, [lead.id]);

  useEffect(() => { cargar(); }, [cargar]);

  if (sinMigracion) {
    return (
      <div style={{ fontSize: 12, color: colors.warning, padding: "10px 0", lineHeight: 1.5 }}>
        Falta correr la migración 170 en Supabase. Las tareas del proyecto están a salvo y se siguen viendo en Tareas;
        acá vuelven a aparecer apenas se corra.
      </div>
    );
  }

  async function hacer(fn) {
    setOcupado(true);
    // Todo lo que se hace acá deja rastro en la bitácora, así que se la
    // refresca siempre en vez de acordarse caso por caso de avisarle.
    try { await fn(); await cargar(); onBitacora?.(); } finally { setOcupado(false); }
  }

  // Sumar algo, diciendo qué falta en vez de quedarse callado.
  //
  // Los cuatro tipos guardan lo mismo —una tarea—, lo que cambia es qué se
  // exige: una tarea es de alguien, una reunión tiene día, un envío ya pasó y
  // dice a quién, y una gestión se marca y ya.
  async function sumar() {
    const n = nuevo;
    const texto = (n.texto || "").trim();
    const tipo = n.tipo || "gestion";
    const falta = !texto ? `Escribe ${tipo === "reunion" ? "de qué es la reunión" : tipo === "envio" ? "qué se envió" : "qué hay que hacer"}.`
      : tipo === "tarea" && !n.assignee_id ? "Una tarea es de alguien: elige quién la hace."
      : tipo === "reunion" && !n.due_date ? "Una reunión tiene día: ponle la fecha."
      // Un envío es un hecho, no un pendiente: sin a quién y cuándo no sirve de
      // nada, porque lo que se consulta seis meses después es justamente eso.
      : tipo === "envio" && !(n.destinatario || "").trim() ? "Un envío es a alguien: escribí a quién se lo mandaste."
      : tipo === "envio" && !n.due_date ? "Un envío tiene fecha: ¿cuándo se mandó?"
      : null;
    if (falta) { setError(falta); return; }
    setError("");

    await hacer(async () => {
      const externo = String(n.assignee_id || "").startsWith("x:") ? String(n.assignee_id).slice(2) : null;
      const r = await agregarTarea({
        lead, etapaId, titulo: texto, orden: abiertas.length + hechas.length + 1,
        tipo: tipo === "reunion" ? "Reunión" : tipo === "gestion" ? "Gestión" : tipo === "envio" ? "Envío" : "Otro",
        due_date: n.due_date || null, hora: (n.due_date && n.hora) || null,
        assignee_id: n.assignee_id && !externo ? Number(n.assignee_id) : null,
        nombreResponsable: users.find(u => String(u.id) === String(n.assignee_id))?.name,
        // A quién se le mandó va en el responsable externo: es alguien de
        // afuera, y así sale en la fila y en la bitácora sin inventar otro
        // campo que después haya que mantener.
        responsable_externo: tipo === "envio" ? n.destinatario.trim() : externo,
        // Un envío ya ocurrió: nace cerrado y queda de registro.
        hecha: tipo === "envio",
        quien: currentUser,
      });
      if (r?.error) { setError(r.error); return; }
      if (r.tarea?.assignee_id) await avisarPorCorreo(r.tarea.id);
      if (tipo === "envio") {
        await anotar(lead.id, { tipo: "nota", detalle: `Envío a ${n.destinatario.trim()}: ${texto}.`, quien: currentUser });
      }
      // Se queda abierto y con el tipo elegido: casi siempre se cargan varias
      // seguidas, y volver a abrir el cuadro cada vez era un clic de más.
      setNuevo({ ...EN_BLANCO, tipo });
    });
  }

  // Una fecha ya puesta solo la corre quien tenga el permiso; ponerle fecha a
  // algo que no la tenía es organizar, y eso lo puede hacer cualquiera.
  const fechaBloqueada = !!tareas[aTarea?.item?.tarea_id]?.due_date && !puede("tareas.fechas");
  const puedeCorrer = item => !tareas[item.tarea_id]?.due_date || puede("tareas.fechas");

  const fila = item => (
    <Actividad key={item.id} item={item} etiqueta={nombreDeEtapa(item.etapa_id, catalogo)} tarea={tareas[item.tarea_id]} users={users}
      abierta={abierta === item.id} onAbrir={() => setAbierta(a => (a === item.id ? null : item.id))}
      ocupado={ocupado} hacer={hacer} currentUser={currentUser} editable={editable} puedeCorrer={puedeCorrer(item)}
      onAvisar={t => setAvisar({ item, tarea: t, a: new Set(t?.assignee_id ? ["responsable"] : []) })}
      onTarea={() => { const t = tareas[item.tarea_id]; setATarea({ item, titulo: item.texto, tipo: claseDe(t),
        assignee_id: t?.responsable_externo ? `x:${t.responsable_externo}` : t?.assignee_id || "", due_date: t?.due_date || "", hora: t?.hora || "" }); }} />
  );

  const tipoNuevo = nuevo.tipo || "gestion";

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.5, flex: 1 }}>
          TAREAS{abiertas.length ? ` · ${abiertas.length} ${abiertas.length === 1 ? "abierta" : "abiertas"}` : ""}
        </div>
        {editable && !nuevo.abierto && (
          <button onClick={() => { setNuevo(EN_BLANCO); setError(""); }} style={{ ...mini(false), padding: "4px 10px" }}>
            <Plus size={11} /> Agregar
          </button>
        )}
      </div>

      {/* Agregar está guardado detrás de un botón: con el formulario siempre
          abierto, la pantalla parecía un tablero de controles en vez de la
          lista de lo que falta. Se elige primero qué es y recién ahí se pide
          lo que ese tipo necesita. */}
      {editable && nuevo.abierto && (
        <div style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 10, marginBottom: 10 }}>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
            {TIPOS_NUEVO.map(([id, label]) => {
              const activo = tipoNuevo === id;
              return (
                <button key={id} onClick={() => setNuevo(n => ({ ...n, tipo: id }))}
                  style={{ ...mini(false), padding: "3px 8px", borderColor: activo ? CLASES[id].color : colors.border,
                    background: activo ? CLASES[id].color : "#fff", color: activo ? "#fff" : colors.inkSoft }}>
                  {label}
                </button>
              );
            })}
          </div>

          <input value={nuevo.texto || ""} autoFocus
            onChange={e => setNuevo(n => ({ ...n, texto: e.target.value }))}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); sumar(); } }}
            placeholder={PISTA[tipoNuevo]}
            style={{ ...chico, width: "100%", boxSizing: "border-box", marginTop: 6 }} />

          <div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
            {/* En un envío no se pregunta quién lo hace sino a quién se le
                mandó: es lo único que se consulta después. Se puede elegir de
                la gente del proyecto o escribir el nombre. */}
            {tipoNuevo === "envio" ? (
              <>
                <input list="invitados-del-proyecto" value={nuevo.destinatario || ""}
                  onChange={e => setNuevo(n => ({ ...n, destinatario: e.target.value }))}
                  placeholder="¿A quién se lo mandaste?"
                  style={{ ...chico, flex: "1 1 160px", minWidth: 0 }} />
                <datalist id="invitados-del-proyecto">
                  {invitados.map(i => <option key={`x${i.id}`} value={i.nombre} />)}
                  {users.map(u => <option key={u.id} value={u.name} />)}
                </datalist>
              </>
            ) : (
              <select value={nuevo.assignee_id || ""} onChange={e => setNuevo(n => ({ ...n, assignee_id: e.target.value }))}
                style={{ ...chico, flex: "1 1 160px", minWidth: 0 }}>
                <option value="">¿Quién la hace?{tipoNuevo === "tarea" ? "" : " (opcional)"}</option>
                <optgroup label="Del equipo">{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</optgroup>
                {invitados.length > 0 && <optgroup label="De afuera">{invitados.map(i => <option key={`x${i.id}`} value={`x:${i.nombre}`}>{i.nombre}</option>)}</optgroup>}
              </select>
            )}
            <input type="date" value={nuevo.due_date || ""} title={tipoNuevo === "envio" ? "¿Cuándo se mandó?" : "Para cuándo"}
              onChange={e => setNuevo(n => ({ ...n, due_date: e.target.value }))}
              style={{ ...chico, flex: "0 1 140px", minWidth: 0 }} />
            {/* La hora de una lista y no del relojito del navegador: en el
                teléfono ese control es una ruleta. */}
            <select value={nuevo.hora || ""} title="A qué hora"
              onChange={e => setNuevo(n => ({ ...n, hora: e.target.value }))}
              style={{ ...chico, width: 104 }}>
              <option value="">Todo el día</option>
              {HORAS.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>

          {/* Las fechas de un toque: lo que más se escribe es «para mañana». */}
          {tipoNuevo !== "envio" && (
            <div style={{ display: "flex", gap: 4, marginTop: 5, flexWrap: "wrap", alignItems: "center" }}>
              {[["Hoy", 0], ["Mañana", 1], ["En una semana", 7]].map(([txt, n]) => {
                const f = sumarDias(hoyISO(), n);
                return (
                  <button key={txt} onClick={() => setNuevo(x => ({ ...x, due_date: f }))} style={mini(nuevo.due_date === f)}>{txt}</button>
                );
              })}
            </div>
          )}

          <div style={{ fontSize: 10, color: colors.muted, marginTop: 5 }}>{PIDE[tipoNuevo]}</div>

          <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
            {/* El botón no se apaga por falta de datos: apagado no explica
                nada. Se toca, y dice qué falta. */}
            <button onClick={sumar} disabled={ocupado}
              style={{ ...mini(false), padding: "4px 10px", background: colors.ink, color: "#fff", borderColor: colors.ink }}>
              <Plus size={11} /> Agregar
            </button>
            <button onClick={() => { setNuevo({ abierto: false }); setError(""); }} style={{ ...mini(false), padding: "4px 10px" }}>Cerrar</button>
          </div>
          {error && <div style={{ fontSize: 10.5, color: colors.danger, marginTop: 5 }}>{error}</div>}
        </div>
      )}

      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: "4px 12px" }}>
        {abiertas.map(fila)}
        {!abiertas.length && (
          <div style={{ fontSize: 12, color: colors.muted, padding: "8px 0" }}>
            {hechas.length ? "No queda nada abierto." : "Todavía sin tareas."}
          </div>
        )}
      </div>

      {/* Lo hecho, plegado: es la historia del proyecto, no lo que hay que
          mirar al abrirlo. */}
      {hechas.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <button onClick={() => setVerHechas(v => !v)}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: colors.font, fontSize: 11.5, color: colors.inkSoft,
              display: "inline-flex", alignItems: "center", gap: 4 }}>
            {verHechas ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {hechas.length === 1 ? "1 hecha" : `${hechas.length} hechas`}
          </button>
          {verHechas && (
            <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: "4px 12px", marginTop: 6 }}>
              {hechas.map(fila)}
            </div>
          )}
        </div>
      )}

      {/* Corregir una tarea: quién y para cuándo, qué dice y qué es. */}
      {aTarea && (
        <div style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 12, marginTop: 10 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.ink, marginBottom: 2 }}>¿Quién y para cuándo?</div>
          <div style={{ fontSize: 10.5, color: colors.muted, marginBottom: 8 }}>También se corrige acá lo que esté mal escrito, y qué es. El cambio queda en la bitácora.</div>
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "flex", gap: 4 }}>
              {TIPOS_NUEVO.filter(([id]) => id !== "envio").map(([id, label]) => {
                const activo = (aTarea.tipo || "gestion") === id;
                return (
                  <button key={id} onClick={() => setATarea(a => ({ ...a, tipo: id }))}
                    style={{ ...mini(false), padding: "3px 9px", borderColor: activo ? CLASES[id].color : colors.border,
                      background: activo ? CLASES[id].color : "#fff", color: activo ? "#fff" : colors.inkSoft }}>
                    {label}
                  </button>
                );
              })}
            </div>
            <input value={aTarea.titulo} onChange={e => setATarea(a => ({ ...a, titulo: e.target.value }))} style={inputStyle} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {/* Del equipo o de afuera: el ingeniero, el proveedor, el cliente.
                  No todos los que tienen algo que hacer entran a FOREMAN. */}
              <select value={aTarea.assignee_id} onChange={e => setATarea(a => ({ ...a, assignee_id: e.target.value }))} style={inputStyle}>
                <option value="">¿Quién la hace?</option>
                <optgroup label="Del equipo">
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </optgroup>
                {invitados.length > 0 && (
                  <optgroup label="De afuera">
                    {invitados.map(i => <option key={`x${i.id}`} value={`x:${i.nombre}`}>{i.nombre}{i.rol ? ` · ${i.rol}` : ""}</option>)}
                  </optgroup>
                )}
              </select>
              {/* Ponerle fecha a algo que no la tiene es parte de organizarlo;
                  correr una fecha ya puesta es decisión de quien lleva el
                  proyecto, y para eso está el permiso. */}
              <div style={{ display: "flex", gap: 6 }}>
                <input type="date" value={aTarea.due_date || ""} onChange={e => setATarea(a => ({ ...a, due_date: e.target.value }))}
                  disabled={fechaBloqueada} title={fechaBloqueada ? "La fecha la mueve el Director o quien tenga ese permiso" : ""}
                  style={{ ...inputStyle, flex: 1, minWidth: 0, ...(fechaBloqueada ? { background: colors.bg, color: colors.inkSoft, cursor: "not-allowed" } : {}) }} />
                {aTarea.due_date && (
                  <select value={aTarea.hora || ""} onChange={e => setATarea(a => ({ ...a, hora: e.target.value }))}
                    disabled={fechaBloqueada} title="A qué hora"
                    style={{ ...inputStyle, width: 116, ...(fechaBloqueada ? { background: colors.bg, color: colors.inkSoft, cursor: "not-allowed" } : {}) }}>
                    <option value="">Todo el día</option>
                    {HORAS.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => hacer(async () => {
                const externo = String(aTarea.assignee_id).startsWith("x:") ? String(aTarea.assignee_id).slice(2) : null;
                const antes = tareas[aTarea.item.tarea_id];
                const guardada = await asegurarTarea(aTarea.item, {
                  lead, titulo: aTarea.titulo, due_date: aTarea.due_date || null, hora: (aTarea.due_date && aTarea.hora) || null,
                  tipo: aTarea.tipo === "reunion" ? "Reunión" : aTarea.tipo === "tarea" ? "Otro" : aTarea.tipo === "envio" ? "Envío" : "Gestión",
                  assignee_id: externo || !aTarea.assignee_id ? null : Number(aTarea.assignee_id),
                  responsable_externo: externo,
                });
                if (guardada?.error) { setError(guardada.error); return; }
                if (guardada?.tarea?.assignee_id && guardada.tarea.assignee_id !== antes?.assignee_id) {
                  await avisarPorCorreo(guardada.tarea.id);
                }
                // Lo que cambió queda escrito: quién la movió y de qué a qué.
                const nombre = id => users.find(u => u.id === Number(id))?.name || null;
                const cambios = [];
                if (aTarea.titulo.trim() !== aTarea.item.texto) cambios.push(`ahora dice "${aTarea.titulo.trim()}"`);
                const antesQuien = antes?.responsable_externo || nombre(antes?.assignee_id) || "nadie";
                const ahoraQuien = externo || nombre(aTarea.assignee_id) || "nadie";
                if (antesQuien !== ahoraQuien) cambios.push(`pasa de ${antesQuien} a ${ahoraQuien}`);
                // De cuándo a cuándo, no solo cuándo: seis meses después, lo
                // que hace falta saber es que la reunión se corrió y de qué día.
                if ((antes?.due_date || "") !== (aTarea.due_date || "") || (antes?.hora || "") !== (aTarea.hora || "")) {
                  const enPalabras = (f, h) => (f ? `${cuando(f)}${h ? ` a las ${h}` : ""}` : null);
                  const deCuando = enPalabras(antes?.due_date, antes?.hora);
                  const aCuando = enPalabras(aTarea.due_date, aTarea.hora);
                  cambios.push(!aCuando ? `se queda sin fecha (era ${deCuando})`
                    : deCuando ? `se mueve del ${deCuando} al ${aCuando}`
                    : `queda para el ${aCuando}`);
                }
                if (cambios.length) await anotarCorreccion(lead, `Arregló "${aTarea.item.texto}": ${cambios.join(", ")}.`, currentUser);
                setATarea(null);
              })} disabled={ocupado || !aTarea.titulo.trim()} style={boton(true)}>Guardar</button>
              <button onClick={() => setATarea(null)} style={boton(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Avisar de una reunión: al del equipo que la tiene y a los de afuera
          que vengan. Va con el .ics adjunto, así al cliente le queda en su
          propio calendario sin entrar a FOREMAN. El fondo no cierra: se sale
          por Cerrar. */}
      {avisar && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 16 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: colors.radiusMd, padding: 16, width: 340, maxWidth: "100%", boxShadow: "0 12px 40px rgba(15,23,42,0.2)" }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.ink }}>¿A quién le aviso?</div>
            <div style={{ fontSize: 10.5, color: colors.muted, marginBottom: 8 }}>
              {avisar.item.texto}{avisar.tarea?.due_date ? ` · ${cuando(avisar.tarea.due_date)}${avisar.tarea.hora ? ` ${avisar.tarea.hora}` : ""}` : ""}
            </div>

            <div style={{ display: "grid", gap: 4 }}>
              {avisar.tarea?.assignee_id && (
                <label style={linea}>
                  <input type="checkbox" checked={avisar.a.has("responsable")}
                    onChange={() => setAvisar(v => { const a = new Set(v.a); a.has("responsable") ? a.delete("responsable") : a.add("responsable"); return { ...v, a }; })} />
                  {users.find(u => u.id === avisar.tarea.assignee_id)?.name || "Responsable"} <span style={{ color: colors.muted }}>· del equipo</span>
                </label>
              )}
              {invitados.map(i => (
                <label key={i.id} style={{ ...linea, opacity: i.email ? 1 : 0.5 }} title={i.email || "No tiene correo cargado"}>
                  <input type="checkbox" disabled={!i.email} checked={avisar.a.has(i.id)}
                    onChange={() => setAvisar(v => { const a = new Set(v.a); a.has(i.id) ? a.delete(i.id) : a.add(i.id); return { ...v, a }; })} />
                  {i.nombre} <span style={{ color: colors.muted }}>· {i.email ? i.rol || "de afuera" : "sin correo"}</span>
                </label>
              ))}
              {!invitados.length && !avisar.tarea?.assignee_id && (
                <div style={{ fontSize: 11, color: colors.muted }}>Esta reunión no tiene responsable ni gente de afuera cargada en el proyecto.</div>
              )}
            </div>

            {avisar.dijo && <div style={{ fontSize: 11, color: avisar.mal ? colors.danger : colors.success, marginTop: 8 }}>{avisar.dijo}</div>}

            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button disabled={ocupado || !avisar.a.size} onClick={async () => {
                setOcupado(true);
                try {
                  const r = await fetch("/api/aviso?de=reunion", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      tareaId: avisar.tarea.id,
                      alResponsable: avisar.a.has("responsable"),
                      invitados: [...avisar.a].filter(x => x !== "responsable"),
                    }),
                  });
                  const d = await r.json();
                  if (d.ok) { setAvisar(v => ({ ...v, dijo: `Avisado a ${d.enviadoA.join(", ")}.`, mal: false })); onBitacora?.(); }
                  else setAvisar(v => ({ ...v, dijo: d.error || "No se pudo avisar.", mal: true }));
                } catch (e) {
                  setAvisar(v => ({ ...v, dijo: "No se pudo avisar: " + e.message, mal: true }));
                } finally { setOcupado(false); }
              }} style={{ ...boton(true), opacity: avisar.a.size ? 1 : 0.5 }}>
                {ocupado ? "Enviando…" : "Avisar"}
              </button>
              <button onClick={() => setAvisar(null)} style={boton(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const linea = { display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: colors.ink, cursor: "pointer" };

const chico = { ...inputStyle, padding: "5px 8px", fontSize: 12 };

// Las cuatro cosas que puede haber en un proyecto, y qué pide cada una.
const TIPOS_NUEVO = [["gestion", "Gestión"], ["tarea", "Tarea"], ["reunion", "Reunión"], ["envio", "Envío"]];

const PISTA = {
  gestion: "¿Qué hay que gestionar? Enter para agregar",
  tarea: "¿Qué hay que hacer? Enter para agregar",
  reunion: "¿De qué es la reunión?",
  envio: "¿Qué se envió? Ej: propuesta económica rev.2",
};
const PIDE = {
  gestion: "Se marca cuando pasa. Responsable y fecha, si hay.",
  tarea: "Pide responsable. La fecha, si la hay.",
  reunion: "Pide día. A una hora o todo el día.",
  envio: "Ya pasó: pide a quién y cuándo. Queda registrado, no pendiente.",
};

const boton = fuerte => ({
  display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", fontFamily: colors.font, fontSize: 12, fontWeight: 600,
  border: `1px solid ${fuerte ? colors.ink : colors.border}`, background: fuerte ? colors.ink : "#fff",
  color: fuerte ? "#fff" : colors.inkSoft, borderRadius: 8, padding: "5px 11px",
});

// Una tarea del proyecto: se toca y cuenta lo suyo.
//
// Cerrada es una línea con su casilla. Abierta dice qué se hizo, quién la
// marcó y cuándo, si está esperando a alguien, y deja escribir lo que solo sabe
// quien la trabajó. Los botones dicen su nombre: un ⧗ y un ✓ sueltos no le
// enseñan a nadie cómo se usa esto.
function Actividad({ item, etiqueta, tarea, users = [], abierta, onAbrir, ocupado, hacer, currentUser, editable = true, puedeCorrer = true, onTarea, onAvisar }) {
  const [nota, setNota] = useState(item.nota || "");
  useEffect(() => { setNota(item.nota || ""); }, [item.nota]);
  const deQuien = t => t?.responsable_externo || users.find(u => u.id === t?.assignee_id)?.name || "sin responsable";
  // Solo las que alguien tomó se anuncian como «de fulano»: decir «de sin
  // responsable» sería ruido.
  const tomada = t => !!(t?.assignee_id || t?.responsable_externo);
  // Una reunión es la que tiene hora o quedó marcada como tal.
  const esReunion = t => !!(t?.hora || t?.type === "Reunión");
  const clase = CLASES[claseDe(tarea)];
  const hoy = hoyISO();
  const vencida = !item.hecho && !item.espera && tarea?.due_date && String(tarea.due_date).slice(0, 10) < hoy;

  return (
    <div style={{ borderBottom: `1px solid ${colors.neutralSoft}`, background: abierta ? colors.bg : "transparent",
      margin: abierta ? "0 -12px" : 0, padding: abierta ? "0 12px" : 0 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 0" }}>
        <button onClick={() => editable && hacer(() => marcarItem(item, !item.hecho, currentUser?.name, currentUser))} disabled={ocupado || !editable}
          title={!editable ? "Solo mirar" : item.hecho ? "Desmarcar" : "Marcar como hecha"}
          style={{ width: 18, height: 18, flexShrink: 0, marginTop: 1, borderRadius: 5, cursor: "pointer", padding: 0,
            border: `1.5px solid ${item.hecho ? colors.success : vencida ? colors.danger : colors.border}`, background: item.hecho ? colors.success : "#fff",
            display: "flex", alignItems: "center", justifyContent: "center" }}>
          {item.hecho && <Check size={12} color="#fff" />}
        </button>
        {/* Su color, el mismo del tablero. */}
        <span style={{ width: 3, alignSelf: "stretch", borderRadius: 2, background: clase.color, opacity: item.hecho ? 0.4 : 1, flexShrink: 0 }} />
        <div onClick={onAbrir} style={{ flex: 1, minWidth: 0, cursor: "pointer" }}>
          <div style={{ fontSize: 13, lineHeight: 1.35, color: item.hecho ? colors.muted : colors.ink, textDecoration: item.hecho ? "line-through" : "none", overflowWrap: "anywhere" }}>
            {item.texto}
          </div>
          <div style={{ fontSize: 10.5, color: item.espera && !item.hecho ? colors.warning : colors.muted, marginTop: 1 }}>
            <span style={{ color: clase.color, fontWeight: 700 }}>{clase.label.toLowerCase()}</span>
            {(() => {
              const resto = item.hecho ? [item.hecho_por, cuando(item.hecho_at)].filter(Boolean).join(" · ")
                : item.espera ? "esperando a un tercero"
                : tomada(tarea) ? deQuien(tarea)
                : "";
              return resto ? ` · ${resto}` : "";
            })()}
            {/* En qué etapa estaba el lead cuando se escribió. */}
            {etiqueta ? ` · ${etiqueta}` : ""}
          </div>
        </div>
        {/* La fecha, a la derecha y siempre en el mismo lugar: es lo que
            ordena la lista. */}
        {!item.hecho && (
          <span style={{ fontSize: 11.5, whiteSpace: "nowrap", flexShrink: 0, marginTop: 1,
            color: vencida ? colors.danger : tarea?.due_date ? colors.inkSoft : colors.warning, fontWeight: vencida ? 700 : 400 }}>
            {tarea?.due_date ? `${cuando(tarea.due_date)}${tarea.hora ? ` ${tarea.hora}` : ""}` : "sin fecha"}
          </span>
        )}
      </div>

      {abierta && (
        <div style={{ paddingLeft: 29, paddingBottom: 10, display: "grid", gap: 7 }}>
          <div style={{ fontSize: 10.5, color: colors.muted, lineHeight: 1.5 }}>
            {item.hecho
              ? `Hecha${item.hecho_por ? ` por ${item.hecho_por}` : ""}${item.hecho_at ? ` el ${cuando(item.hecho_at)}` : ""}.`
              : item.espera ? "Ya se hizo lo nuestro: espera a un tercero."
              : "Todavía por hacer."}
            {tomada(tarea) ? (
              <> A cargo de <strong style={{ color: colors.ink }}>{deQuien(tarea)}</strong>{tarea.responsable_externo ? " (de afuera)" : ""}.</>
            ) : tarea ? (
              <> Todavía sin responsable.</>
            ) : null}
            {" "}Es la misma tarea que se ve en Tareas.
          </div>

          {/* La fecha se cambia desde la misma fila, de un toque. */}
          {editable && !item.hecho && (
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 10.5, color: colors.muted }}>Para:</span>
              {[["Hoy", 0], ["Mañana", 1], ["En una semana", 7]].map(([txt, n]) => {
                const f = sumarDias(hoy, n);
                return (
                  <button key={txt} disabled={ocupado || !puedeCorrer} title={puedeCorrer ? "" : "La fecha la mueve el Director o quien tenga ese permiso"}
                    onClick={() => hacer(() => ponerFecha(item, f, currentUser))}
                    style={{ ...mini(String(tarea?.due_date || "").slice(0, 10) === f), opacity: puedeCorrer ? 1 : 0.5 }}>{txt}</button>
                );
              })}
              {tarea?.due_date && puedeCorrer && (
                <button disabled={ocupado} onClick={() => hacer(() => ponerFecha(item, null, currentUser))} style={mini(false)}>Sin fecha</button>
              )}
            </div>
          )}

          {/* Lo que se habla de esto: la conversación vive con la cosa, no en
              un WhatsApp aparte. Es la misma de la tarea en el tablero. */}
          {tarea?.id && <ComentariosTarea taskId={tarea.id} currentUser={currentUser} />}

          {/* Lo que solo sabe quien la trabajó. */}
          <textarea value={nota} onChange={e => setNota(e.target.value)} rows={2} readOnly={!editable}
            onBlur={() => { if (editable && (item.nota || "") !== nota) hacer(() => guardarNota(item, nota.trim())); }}
            placeholder={editable ? "Qué pasó, con quién, qué falta…" : "Sin notas."}
            style={{ ...chico, width: "100%", boxSizing: "border-box", resize: "vertical", lineHeight: 1.4 }} />

          {editable && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {!item.hecho && (
              <button onClick={() => hacer(() => marcarEspera(item, !item.espera, currentUser))} disabled={ocupado} style={mini(item.espera)}>
                <Hourglass size={11} /> {item.espera ? "Ya no espera" : "Espera a un tercero"}
              </button>
            )}
            <button onClick={onTarea} style={mini(false)}>
              <ListTodo size={11} /> {tarea && (tarea.assignee_id || tarea.responsable_externo) ? "Cambiar detalles" : "Asignar y corregir"}
            </button>
            {/* Una reunión hay que avisarla: el del equipo la ve en FOREMAN,
                pero el cliente y el ingeniero no entran acá. */}
            {!item.hecho && esReunion(tarea) && (
              <button onClick={() => onAvisar(tarea)} style={mini(false)}><Mail size={11} /> Avisar</button>
            )}
            <button onClick={() => { if (window.confirm("¿Borrar esta tarea? Es la misma que está en Tareas: se borra de los dos lados.")) hacer(() => borrarItem(item, currentUser)); }} disabled={ocupado}
              style={{ ...mini(false), color: colors.danger, marginLeft: "auto" }}><X size={11} /> Quitar</button>
          </div>
          )}
        </div>
      )}
    </div>
  );
}

const mini = activo => ({
  display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 600, cursor: "pointer", fontFamily: colors.font,
  border: `1px solid ${activo ? colors.warning : colors.border}`, background: activo ? colors.warningSoft : "#fff",
  color: activo ? colors.warning : colors.inkSoft, borderRadius: 14, padding: "3px 9px",
});
