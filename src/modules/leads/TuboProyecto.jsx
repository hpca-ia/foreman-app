import { useState, useEffect, useCallback } from "react";
import { Check, Plus, X, ListTodo, Circle, CircleDot, RotateCcw, Trash2, Loader2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import { inputStyle } from "../../components/ui/Input";
import Avatar from "../../components/ui/Avatar";
import { etapaInfo } from "./constantes";
import {
  TUNELES, etapasDelTunel, cargarTubo, asegurarEtapas, sembrarChecklist,
  agregarItem, marcarItem, borrarItem, itemATarea, cambiarEstadoEtapa, avanceDe,
} from "./tubo";

// El proyecto: sus etapas, y dentro de cada etapa lo que hay que hacer.
//
// Una columna por etapa, y en la columna sus pasos, uno debajo del otro. Así
// se ve todo el proyecto de una: en qué va, qué le falta a cada etapa y dónde
// está trabado. Un paso que necesita que alguien haga algo se vuelve tarea del
// equipo, con responsable y fecha, y al completarse queda marcado.
//
// Arquitectura y Construcción traen sus etapas puestas y van en orden; un lead
// las suma cuando pasan, porque ahí el plan masa puede ir antes que el
// presupuesto.

export default function TuboProyecto({ lead, catalogo = [], users = [], currentUser, onBitacora }) {
  const tunel = lead.tunel || "lead";
  const info = TUNELES[tunel] || TUNELES.lead;
  const [etapas, setEtapas] = useState([]);
  const [items, setItems] = useState([]);
  const [sinTablas, setSinTablas] = useState(false);
  const [nuevo, setNuevo] = useState({});        // etapa → texto del paso que se escribe
  const [agregando, setAgregando] = useState(false);
  const [aTarea, setATarea] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  // La gente de afuera que ya está en el proyecto: cliente, ingeniero,
  // proveedor. Una actividad puede ser de ellos aunque no entren a FOREMAN.
  const [invitados, setInvitados] = useState([]);

  const cargar = useCallback(async () => {
    const [r, { data: inv }] = await Promise.all([
      cargarTubo(lead.id),
      supabase.from("pipeline_invitados").select("id,nombre,rol").eq("lead_id", lead.id).order("nombre"),
    ]);
    setSinTablas(r.sinTablas);
    setEtapas(r.etapas);
    setItems(r.items);
    setInvitados(inv || []);
  }, [lead.id]);

  useEffect(() => {
    (async () => { await asegurarEtapas(lead, catalogo); cargar(); })();
    // eslint-disable-next-line
  }, [lead.id, catalogo.length]);

  if (sinTablas) {
    return <div style={{ fontSize: 12, color: colors.warning, padding: "10px 0" }}>Falta correr la migración 040 en Supabase.</div>;
  }

  const delTunel = etapasDelTunel(catalogo, tunel);
  const orden = new Map(delTunel.map((e, i) => [e.id, i]));
  // En Arquitectura y Construcción manda el orden del catálogo: son hitos, uno
  // detrás de otro. En un lead manda el orden en que se fueron poniendo, que
  // es el que tuvo ese proyecto.
  const columnas = [...etapas].sort((a, b) => (info.enOrden
    ? (orden.get(a.etapa_id) ?? 99) - (orden.get(b.etapa_id) ?? 99) || a.orden - b.orden
    : a.orden - b.orden || a.id - b.id));
  const itemsDe = id => items.filter(i => i.lead_etapa_id === id).sort((a, b) => a.orden - b.orden);

  async function hacer(fn) {
    setOcupado(true);
    try { await fn(); await cargar(); } finally { setOcupado(false); }
  }
  const guardarEtapa = (etapa, campos) => hacer(async () => { await supabase.from("lead_etapas").update(campos).eq("id", etapa.id); });
  const agregarEtapa = etapaId => hacer(async () => {
    await supabase.from("lead_etapas").insert({ lead_id: lead.id, etapa_id: etapaId, orden: (etapas.length + 1) * 10, estado: "pendiente" });
    setAgregando(false);
  });
  const quitarEtapa = etapa => {
    if (!window.confirm("¿Quitar esta etapa del proyecto? Se va con sus pasos.")) return;
    hacer(async () => { await supabase.from("lead_etapas").delete().eq("id", etapa.id); });
  };

  return (
    <div>
      {/* Dos cosas distintas y hay que verlas distintas: arriba las ETAPAS
          —los hitos del proyecto— y dentro de cada una sus ACTIVIDADES. */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.5 }}>ETAPAS DEL PROYECTO</span>
        <span style={{ fontSize: 11, color: colors.muted }}>· dentro de cada una, sus actividades</span>
      </div>

      <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 8, alignItems: "flex-start" }}>
        {columnas.map(etapa => {
          const cat = etapaInfo(etapa.etapa_id, catalogo);
          const suyos = itemsDe(etapa.id);
          const hecha = etapa.estado === "hecha";
          const enCurso = etapa.estado === "en_curso";
          const avance = avanceDe(suyos);
          const tono = hecha ? colors.success : enCurso ? (cat.color || colors.brand) : colors.border;

          return (
            <div key={etapa.id} style={{ width: 236, flexShrink: 0, background: colors.surface, border: `1px solid ${colors.border}`,
              borderTop: `3px solid ${tono}`, borderRadius: colors.radiusMd, display: "flex", flexDirection: "column", opacity: hecha ? 0.75 : 1 }}>

              {/* La cabeza de la etapa: cómo va, quién y para cuándo. */}
              <div style={{ padding: "9px 10px", borderBottom: `1px solid ${colors.neutralSoft}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {hecha ? <Check size={13} color={colors.success} /> : enCurso ? <CircleDot size={13} color={cat.color || colors.brand} /> : <Circle size={13} color={colors.muted} />}
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: hecha ? colors.muted : colors.ink,
                    textDecoration: hecha ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cat.nombre}</span>
                  {suyos.length > 0 && <span style={{ fontSize: 10.5, color: colors.muted }}>{suyos.filter(i => i.hecho).length}/{suyos.length}</span>}
                  {!info.enOrden && (
                    <button onClick={() => quitarEtapa(etapa)} title="Quitar esta etapa"
                      style={{ background: "none", border: "none", color: colors.border, cursor: "pointer", display: "flex", padding: 0 }}><Trash2 size={12} /></button>
                  )}
                </div>

                {avance != null && !hecha && (
                  <div style={{ height: 3, borderRadius: 3, background: colors.neutralSoft, margin: "6px 0 0", overflow: "hidden" }}>
                    <div style={{ width: `${avance}%`, height: "100%", background: cat.color || colors.brand }} />
                  </div>
                )}

                <div style={{ display: "flex", gap: 5, marginTop: 7 }}>
                  <select value={etapa.responsable_id || ""} title="Quién la tiene a cargo"
                    onChange={e => { const u = users.find(x => String(x.id) === e.target.value); guardarEtapa(etapa, { responsable_id: u?.id ?? null, responsable_nombre: u?.name ?? null }); }}
                    style={{ ...chico, flex: 1, minWidth: 0 }}>
                    <option value="">Sin responsable</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                  <input type="date" value={etapa.fecha_objetivo || ""} title="Para cuándo"
                    onChange={e => guardarEtapa(etapa, { fecha_objetivo: e.target.value || null })}
                    style={{ ...chico, width: 112 }} />
                </div>
              </div>

              {/* Las actividades de esta etapa, una debajo de la otra. */}
              <div style={{ padding: "6px 10px 8px", display: "flex", flexDirection: "column", gap: 2, maxHeight: 320, overflowY: "auto" }}>
                <div style={{ fontSize: 9.5, fontWeight: 700, color: colors.muted, letterSpacing: 0.4, marginBottom: 2 }}>ACTIVIDADES</div>
                {suyos.map(item => (
                  <div key={item.id} style={{ display: "flex", alignItems: "flex-start", gap: 7, padding: "5px 0" }}>
                    <button onClick={() => hacer(() => marcarItem(item, !item.hecho, currentUser?.name))} disabled={ocupado}
                      title={item.hecho ? "Desmarcar" : "Marcar como hecho"}
                      style={{ width: 16, height: 16, flexShrink: 0, marginTop: 1, borderRadius: 4, cursor: "pointer", padding: 0,
                        border: `1.5px solid ${item.hecho ? colors.success : colors.border}`, background: item.hecho ? colors.success : "#fff",
                        display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {item.hecho && <Check size={11} color="#fff" />}
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, lineHeight: 1.35, color: item.hecho ? colors.muted : colors.ink, textDecoration: item.hecho ? "line-through" : "none", overflowWrap: "anywhere" }}>{item.texto}</div>
                      {item.tarea_id && <div style={{ fontSize: 9.5, color: colors.muted }}>es una tarea</div>}
                    </div>
                    {!item.tarea_id && !item.hecho && (
                      <button onClick={() => setATarea({ item, titulo: item.texto, assignee_id: etapa.responsable_id || "", due_date: etapa.fecha_objetivo || "" })}
                        title="Convertirlo en tarea del equipo"
                        style={{ background: "none", border: "none", color: colors.muted, cursor: "pointer", display: "flex", padding: 1 }}><ListTodo size={13} /></button>
                    )}
                    <button onClick={() => hacer(() => borrarItem(item.id))} disabled={ocupado} title="Quitar"
                      style={{ background: "none", border: "none", color: colors.border, cursor: "pointer", display: "flex", padding: 1 }}><X size={12} /></button>
                  </div>
                ))}

                {!suyos.length && (
                  <button onClick={() => hacer(() => sembrarChecklist(lead, etapa))} disabled={ocupado}
                    style={{ background: "none", border: "none", padding: "4px 0", textAlign: "left", fontSize: 11, color: colors.muted, cursor: "pointer", fontFamily: colors.font }}>
                    Sin actividades · traer las de fábrica
                  </button>
                )}

                <form onSubmit={e => {
                  e.preventDefault();
                  const t = (nuevo[etapa.id] || "").trim();
                  if (t) hacer(async () => { await agregarItem(lead, etapa, t, suyos.length + 1); setNuevo(n => ({ ...n, [etapa.id]: "" })); });
                }}>
                  <input value={nuevo[etapa.id] || ""} onChange={e => setNuevo(n => ({ ...n, [etapa.id]: e.target.value }))}
                    placeholder="+ actividad" style={{ ...chico, width: "100%", marginTop: 4 }} />
                </form>
              </div>

              <div style={{ padding: "8px 10px", borderTop: `1px solid ${colors.neutralSoft}` }}>
                {hecha ? (
                  <button onClick={() => hacer(() => cambiarEstadoEtapa(etapa, "en_curso", currentUser))} disabled={ocupado} style={boton(false)}>
                    <RotateCcw size={12} /> Reabrir
                  </button>
                ) : (
                  <div style={{ display: "flex", gap: 6 }}>
                    {!enCurso && <button onClick={() => hacer(() => cambiarEstadoEtapa(etapa, "en_curso", currentUser))} disabled={ocupado} style={boton(false)}>Arrancar</button>}
                    <button onClick={() => hacer(async () => {
                      const faltan = suyos.filter(i => !i.hecho).length;
                      if (faltan && !window.confirm(`Quedan ${faltan} ${faltan === 1 ? "actividad" : "actividades"} sin marcar. ¿Cerrar la etapa igual?`)) return;
                      await cambiarEstadoEtapa(etapa, "hecha", currentUser);
                      onBitacora?.();
                    })} disabled={ocupado} style={boton(true)}>
                      {ocupado ? <Loader2 size={12} /> : <Check size={12} />} Cerrar
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* En un lead las etapas se suman cuando pasan. */}
        {!info.enOrden && (
          <div style={{ width: 180, flexShrink: 0 }}>
            <button onClick={() => setAgregando(a => !a)}
              style={{ width: "100%", background: colors.bg, border: `1px dashed ${colors.border}`, borderRadius: colors.radiusMd,
                padding: "12px 10px", color: colors.inkSoft, fontSize: 12.5, cursor: "pointer", fontFamily: colors.font,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <Plus size={14} /> Etapa
            </button>
            {agregando && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
                {delTunel.map(e => (
                  <button key={e.id} onClick={() => agregarEtapa(e.id)}
                    style={{ border: `1px solid ${colors.border}`, background: "#fff", borderRadius: 8, padding: "5px 10px",
                      fontSize: 12, color: colors.inkSoft, cursor: "pointer", fontFamily: colors.font, textAlign: "left" }}>
                    {e.nombre}
                  </button>
                ))}
                {!delTunel.length && <span style={{ fontSize: 11.5, color: colors.muted }}>Sin etapas en Ajustes.</span>}
              </div>
            )}
          </div>
        )}

        {!columnas.length && info.enOrden && (
          <div style={{ fontSize: 12, color: colors.muted, padding: "16px 0" }}>Este proyecto todavía no tiene etapas.</div>
        )}
      </div>

      {/* Volver un paso en tarea del equipo: quién y para cuándo. */}
      {aTarea && (
        <div style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 12, marginTop: 4 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.ink, marginBottom: 8 }}>Convertir en tarea</div>
          <div style={{ display: "grid", gap: 8 }}>
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
              <input type="date" value={aTarea.due_date || ""} onChange={e => setATarea(a => ({ ...a, due_date: e.target.value }))} style={inputStyle} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => hacer(async () => {
                const externo = String(aTarea.assignee_id).startsWith("x:") ? String(aTarea.assignee_id).slice(2) : null;
                await itemATarea(aTarea.item, {
                  lead, titulo: aTarea.titulo, due_date: aTarea.due_date || null, creadoPor: currentUser?.id,
                  assignee_id: externo || !aTarea.assignee_id ? null : Number(aTarea.assignee_id),
                  responsable_externo: externo,
                });
                setATarea(null);
              })} disabled={ocupado || !aTarea.titulo.trim()} style={boton(true)}>Crear tarea</button>
              <button onClick={() => setATarea(null)} style={boton(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const chico = { ...inputStyle, padding: "4px 7px", fontSize: 11.5 };
const boton = fuerte => ({
  display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", fontFamily: colors.font, fontSize: 12, fontWeight: 600,
  border: `1px solid ${fuerte ? colors.ink : colors.border}`, background: fuerte ? colors.ink : "#fff",
  color: fuerte ? "#fff" : colors.inkSoft, borderRadius: 8, padding: "5px 11px",
});
