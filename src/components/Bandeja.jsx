import { useState } from "react";
import { Check, Hourglass, MessageSquare, Plus, ArrowRight, X } from "lucide-react";
import { colors } from "../theme/colors";
import { inputStyle } from "./ui/Input";
import MarcaPrivada from "./ui/MarcaPrivada";
import { CLASES, claseDe } from "../theme/constants";
import { FECHAS_RAPIDAS } from "../lib/bandeja";
import { sumarDias, hoyISO, diasEntre, diaCorto } from "../modules/leads/pipeline";

// LA BANDEJA DE TAREAS.
//
// Dos partes: «Me toca» y «Espero de otros». Manda la fecha: lo vencido va
// primero y cada vencida pide una decisión ahí mismo —nueva fecha, delegar, o
// «ya no va»—, porque una tarea que se queda en rojo es una que nadie decidió.
//
// Todo se hace desde la fila: completar es un toque, la fecha se cambia
// tocándola, y se agrega escribiendo y Enter. Abrir la tarea queda para lo
// demás —detalle, archivos, comentarios—.
//
// Qué va en cada parte lo decide src/lib/bandeja.js; esto lo dibuja.

/**
 * @param datos       lo que devuelve bandeja(): { meToca, espero, cuenta }
 * @param hechas      las que se cerraron, si se pidió verlas
 * @param nombreDe    t → nombre de su proyecto
 * @param proyectos   los que se pueden elegir al agregar: [{ clave, name, esLead, id }]
 * @param asignables  a quién se le puede delegar
 */
export default function Bandeja({
  datos, hechas = [], users = [], comentarios = {}, usuario, puede = () => false, nombreDe = () => "",
  proyectos = [], asignables = [], onAbrir, onCompletar, onReabrir, onReprogramar, onDelegar, onDescartar, onAgregar, onIrAlPipeline,
}) {
  const hoy = hoyISO();
  // Qué fila tiene abierto su cuadro de fecha o de delegar.
  const [abierta, setAbierta] = useState(null);   // { id, que: "fecha" | "delegar" }
  const [nueva, setNueva] = useState({ titulo: "", proyecto: "", fecha: "" });
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const nombre = id => users.find(u => String(u.id) === String(id))?.name || null;
  const otros = asignables.filter(u => String(u.id) !== String(usuario?.id));
  // Una fecha ya puesta solo la corre quien tenga el permiso; ponérsela a algo
  // que no la tenía es organizarse, y eso lo puede hacer cualquiera.
  const puedeCorrer = t => !t.due_date || puede("tareas.fechas");
  // «Ya no va» es decidir que algo no se hace: de quien la escribió, o de
  // quien puede mover fechas.
  const puedeDescartar = t => puede("tareas.fechas") || String(t.created_by) === String(usuario?.id);

  async function agregar() {
    if (ocupado) return;
    setOcupado(true); setError("");
    const proyecto = proyectos.find(p => p.clave === nueva.proyecto) || null;
    const e = await onAgregar?.({ titulo: nueva.titulo, proyecto: proyecto ? { esLead: !!proyecto.esLead, id: proyecto.id, nombre: proyecto.name } : null, fecha: nueva.fecha || null });
    setOcupado(false);
    if (e) { setError(e); return; }
    // El proyecto y la fecha se quedan: casi siempre se cargan varias seguidas.
    setNueva(n => ({ ...n, titulo: "" }));
  }

  const hacer = async fn => { setOcupado(true); try { await fn(); } finally { setOcupado(false); setAbierta(null); } };

  // OJO: lo de acá abajo son funciones que dibujan, NO componentes. Un
  // componente definido adentro de otro es un tipo nuevo en cada dibujo: React
  // lo desmonta y lo vuelve a montar, y el campo de «nueva tarea» perdería el
  // foco a cada letra.

  // Las salidas de una fila: fechas de un toque, delegar y «ya no va».
  const salidas = (t, conDescartar = true) => (
    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
      {FECHAS_RAPIDAS.map(f => {
        const dia = sumarDias(hoy, f.dias);
        return (
          <button key={f.label} disabled={ocupado || !puedeCorrer(t)} title={puedeCorrer(t) ? "" : "La fecha la mueve el Director o quien tenga ese permiso"}
            onClick={() => hacer(() => onReprogramar(t, dia))}
            style={{ ...chip(String(t.due_date || "").slice(0, 10) === dia), opacity: puedeCorrer(t) ? 1 : 0.5 }}>{f.label}</button>
        );
      })}
      <input type="date" aria-label="Otra fecha" disabled={ocupado || !puedeCorrer(t)} value="" min={hoy}
        onChange={e => e.target.value && hacer(() => onReprogramar(t, e.target.value))}
        style={{ ...inputStyle, width: 132, padding: "3px 6px", fontSize: 11.5 }} />
      {otros.length > 0 && (
        <select aria-label="Delegar" disabled={ocupado} value=""
          onChange={e => e.target.value && hacer(() => onDelegar(t, Number(e.target.value)))}
          style={{ ...inputStyle, width: "auto", padding: "3px 6px", fontSize: 11.5, cursor: "pointer" }}>
          <option value="">Delegar a…</option>
          {otros.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      )}
      {conDescartar && puedeDescartar(t) && (
        <button disabled={ocupado} onClick={() => hacer(() => onDescartar(t))} title="Se cierra sin haberse hecho"
          style={{ ...chip(false), color: colors.danger, borderColor: colors.dangerBorder }}><X size={11} /> Ya no va</button>
      )}
    </div>
  );

  const fila = (t, grupo) => {
    const hecha = t.status === "listo";
    const c = CLASES[claseDe(t)];
    const dias = t.due_date ? diasEntre(hoy, t.due_date) : null;
    const vencida = !hecha && dias != null && dias < 0;
    const mia = String(t.assignee_id) === String(usuario?.id);
    const quien = t.responsable_externo ? `${t.responsable_externo} · de afuera` : nombre(t.assignee_id);
    const proyecto = nombreDe(t);
    const espera = t.es_aprobacion && t.aprobacion_estado === "pendiente";
    const cuando = hecha ? "" : dias == null ? "sin fecha"
      : vencida ? `vencida hace ${-dias} ${dias === -1 ? "día" : "días"}`
      : dias === 0 ? "hoy" : dias === 1 ? "mañana" : diaCorto(t.due_date);
    const abiertaAca = abierta?.id === t.id;
    // Lo vencido y lo sin dueño muestran sus salidas sin que haya que pedirlas.
    const pideAlgo = !hecha && (grupo.pide === "decision" || grupo.pide === "dueno");

    return (
      <div key={t.id} className="bandeja-fila" style={{ borderBottom: `1px solid ${colors.neutralSoft}`, padding: "9px 12px",
        borderLeft: `3px solid ${vencida ? colors.danger : c.color}`, opacity: hecha ? 0.6 : 1 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
          <button disabled={ocupado} title={hecha ? "Volver a abrirla" : espera ? "Pide una decisión: abrirla" : "Marcar como hecha"}
            onClick={() => (hecha ? onReabrir(t) : espera ? onAbrir(t) : onCompletar(t))}
            style={{ width: 19, height: 19, flexShrink: 0, marginTop: 1, borderRadius: 5, padding: 0, cursor: "pointer",
              border: `1.5px solid ${hecha ? colors.success : vencida ? colors.danger : colors.border}`, background: hecha ? colors.success : "#fff",
              display: "flex", alignItems: "center", justifyContent: "center" }}>
            {hecha && <Check size={12} color="#fff" />}
          </button>

          <div onClick={() => onAbrir(t)} style={{ flex: 1, minWidth: 0, cursor: "pointer" }}>
            <div style={{ fontSize: 13.5, fontWeight: 500, color: colors.ink, textDecoration: hecha ? "line-through" : "none", overflowWrap: "anywhere" }}>
              {t.privada && <MarcaPrivada />}{t.title}
            </div>
            <div style={{ fontSize: 11, color: colors.muted, marginTop: 2, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ color: c.color, fontWeight: 700 }}>{c.label.toLowerCase()}</span>
              {proyecto && <span>· {proyecto}</span>}
              {/* De quién es, cuando no es mía: en lo que encargué es lo que más importa. */}
              {!mia && quien && <span style={{ color: colors.inkSoft, fontWeight: 600 }}>· {quien}</span>}
              {t.hora && !hecha && <span>· {t.hora}</span>}
              {t.espera && !hecha && <span style={{ color: colors.warning }}>· espera a un tercero</span>}
              {hecha && <span>· {t.descartada ? "ya no va" : "hecha"}{t.hecha_por ? ` · ${t.hecha_por}` : ""}</span>}
              {comentarios[t.id] > 0 && <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>· <MessageSquare size={10} /> {comentarios[t.id]}</span>}
            </div>
          </div>

          {/* La fecha, siempre a la derecha: se toca y se cambia ahí mismo. */}
          {!hecha && (
            <button onClick={() => setAbierta(abiertaAca ? null : { id: t.id })} title="Cambiar la fecha o delegarla"
              style={{ background: "none", border: `1px solid ${abiertaAca ? colors.ink : "transparent"}`, borderRadius: 14, padding: "2px 8px", cursor: "pointer",
                fontFamily: colors.font, fontSize: 11.5, whiteSpace: "nowrap", flexShrink: 0,
                color: vencida ? colors.danger : dias == null ? colors.warning : dias <= 1 ? colors.warning : colors.inkSoft, fontWeight: vencida || dias === 0 ? 700 : 500 }}>
              {cuando}
            </button>
          )}
        </div>

        {(pideAlgo || abiertaAca) && !hecha && (
          <div style={{ marginTop: 7, paddingLeft: 28 }}>
            {grupo.pide === "dueno" ? (
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                <button disabled={ocupado} onClick={() => hacer(() => onDelegar(t, usuario.id))} style={chip(true)}>La tomo yo</button>
                {salidas(t)}
              </div>
            ) : salidas(t)}
          </div>
        )}
      </div>
    );
  };

  // Un lead que espera al cliente no es una tarea: es una línea que lleva al pipeline.
  const filaLead = x => (
    <div key={`l${x.lead.id}`} className="bandeja-fila" onClick={onIrAlPipeline}
      style={{ borderBottom: `1px solid ${colors.neutralSoft}`, padding: "9px 12px", cursor: onIrAlPipeline ? "pointer" : "default",
        borderLeft: `3px solid ${x.clase === "insistir" ? colors.danger : colors.border}`, display: "flex", alignItems: "center", gap: 9 }}>
      <Hourglass size={15} color={x.clase === "insistir" ? colors.danger : colors.muted} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: colors.ink }}>{x.lead.nombre}</div>
        <div style={{ fontSize: 11.5, color: x.clase === "insistir" ? colors.danger : colors.inkSoft, marginTop: 1, overflowWrap: "anywhere" }}>{x.texto}</div>
      </div>
      <ArrowRight size={13} color={colors.muted} style={{ flexShrink: 0 }} />
    </div>
  );

  const parte = ({ titulo, cuenta, grupos, vacio, hijos = null }) => (
    <section key={titulo} style={{ marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: colors.ink }}>{titulo}</span>
        <span style={{ fontSize: 12, color: colors.muted }}>{cuenta}</span>
      </div>
      {hijos}
      {!grupos.length && <div style={{ fontSize: 13, color: colors.muted, padding: "14px 0" }}>{vacio}</div>}
      {grupos.map(g => {
        const cuantos = g.tareas.length + (g.leads?.length || 0);
        const rojo = g.clave === "vencidas" || g.clave === "insistir" || g.clave === "sinDueno";
        return (
          <div key={g.clave} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, marginBottom: 5, color: rojo ? colors.danger : colors.muted }}>
              {g.titulo.toUpperCase()} · {cuantos}
              {g.clave === "vencidas" && <span style={{ fontWeight: 400, letterSpacing: 0, color: colors.inkSoft }}> — cada una pide una decisión: nueva fecha, delegarla, o ya no va</span>}
            </div>
            <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, overflow: "hidden" }}>
              {(g.leads || []).map(filaLead)}
              {g.tareas.map(t => fila(t, g))}
            </div>
          </div>
        );
      })}
    </section>
  );

  return (
    <div>
      {parte({ titulo: "Me toca", cuenta: datos.cuenta.meToca, grupos: datos.meToca, vacio: "Nada pendiente de tu lado.", hijos: (<>
        {/* Se agrega escribiendo y Enter, con el proyecto al lado. Lo demás
            —responsable, hora, archivos— está al abrirla. */}
        {onAgregar && (
          <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 9, marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <Plus size={15} color={colors.muted} style={{ flexShrink: 0 }} />
              <input value={nueva.titulo} onChange={e => setNueva(n => ({ ...n, titulo: e.target.value }))}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); agregar(); } }}
                placeholder="Escribí una tarea y Enter" aria-label="Nueva tarea"
                style={{ ...inputStyle, flex: "2 1 220px", minWidth: 0, padding: "7px 9px", fontSize: 13 }} />
              <select value={nueva.proyecto} onChange={e => setNueva(n => ({ ...n, proyecto: e.target.value }))} aria-label="Proyecto"
                style={{ ...inputStyle, flex: "1 1 150px", minWidth: 0, padding: "7px 9px", fontSize: 12.5, cursor: "pointer" }}>
                <option value="">Sin proyecto</option>
                {proyectos.map(p => <option key={p.clave} value={p.clave}>{p.name}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center", marginTop: 7, paddingLeft: 21 }}>
              <span style={{ fontSize: 11, color: colors.muted }}>Para:</span>
              {FECHAS_RAPIDAS.map(f => {
                const dia = sumarDias(hoy, f.dias);
                return <button key={f.label} onClick={() => setNueva(n => ({ ...n, fecha: n.fecha === dia ? "" : dia }))} style={chip(nueva.fecha === dia)}>{f.label}</button>;
              })}
              <input type="date" value={nueva.fecha} onChange={e => setNueva(n => ({ ...n, fecha: e.target.value }))} aria-label="Fecha de la tarea nueva"
                style={{ ...inputStyle, width: 132, padding: "3px 6px", fontSize: 11.5 }} />
              {!nueva.fecha && <span style={{ fontSize: 11, color: colors.muted }}>sin fecha</span>}
            </div>
            {error && <div style={{ fontSize: 11.5, color: colors.danger, marginTop: 6, paddingLeft: 21 }}>{error}</div>}
          </div>
        )}
      </>) })}

      {parte({ titulo: "Espero de otros", cuenta: datos.cuenta.espero, grupos: datos.espero,
        vacio: "No le encargaste nada a nadie, ni hay nada esperando a un tercero." })}

      {hechas.length > 0 && (
        <section style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, marginBottom: 5, color: colors.muted }}>HECHAS · {hechas.length}</div>
          <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, overflow: "hidden" }}>
            {hechas.map(t => fila(t, {}))}
          </div>
        </section>
      )}
    </div>
  );
}

const chip = fuerte => ({
  display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: colors.font,
  border: `1px solid ${fuerte ? colors.ink : colors.border}`, background: fuerte ? colors.ink : "#fff",
  color: fuerte ? "#fff" : colors.inkSoft, borderRadius: 14, padding: "3px 10px", whiteSpace: "nowrap",
});
