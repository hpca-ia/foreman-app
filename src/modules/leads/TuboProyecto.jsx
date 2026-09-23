import { useState, useEffect, useCallback } from "react";
import { Check, Plus, X, ListTodo, Circle, CircleDot, SkipForward, RotateCcw, Loader2 } from "lucide-react";
import { colors } from "../../theme/colors";
import { inputStyle } from "../../components/ui/Input";
import Avatar from "../../components/ui/Avatar";
import { etapaInfo } from "./constantes";
import {
  TUNELES, etapasDelTunel, cargarTubo, asegurarEtapas, sembrarChecklist,
  agregarItem, marcarItem, borrarItem, itemATarea, cambiarEstadoEtapa, avanceDe,
} from "./tubo";

// El tubo del proyecto: los hitos en fila y, debajo, qué le falta al que se
// esté mirando.
//
// Se mira más de lo que se lee: cada hito es una pieza que se llena a medida
// que se cierran los puntos de su checklist, y de un vistazo se ve dónde está
// el proyecto y cuánto le falta. Al tocar uno se abre su lista: lo que hay que
// tener para cerrarlo. Un punto que necesita que alguien haga algo se vuelve
// tarea, con responsable y fecha, y vive con el resto de las tareas.

const ESTADOS = {
  pendiente: { label: "Pendiente", icono: Circle },
  en_curso: { label: "En curso", icono: CircleDot },
  hecha: { label: "Cerrado", icono: Check },
  omitida: { label: "Omitido", icono: SkipForward },
};

export default function TuboProyecto({ lead, catalogo = [], users = [], currentUser, onBitacora }) {
  const tunel = lead.tunel || "lead";
  const info = TUNELES[tunel] || TUNELES.lead;
  const [etapas, setEtapas] = useState([]);
  const [items, setItems] = useState([]);
  const [sinTablas, setSinTablas] = useState(false);
  const [elegida, setElegida] = useState(null);
  const [nuevo, setNuevo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [aTarea, setATarea] = useState(null);   // ítem que se está volviendo tarea

  const cargar = useCallback(async () => {
    const r = await cargarTubo(lead.id);
    setSinTablas(r.sinTablas);
    setEtapas(r.etapas);
    setItems(r.items);
    setElegida(v => v ?? r.etapas.find(e => e.estado === "en_curso")?.id ?? r.etapas.find(e => e.estado === "pendiente")?.id ?? r.etapas[0]?.id ?? null);
  }, [lead.id]);

  useEffect(() => {
    (async () => {
      await asegurarEtapas(lead, catalogo);
      cargar();
    })();
    // eslint-disable-next-line
  }, [lead.id, catalogo.length]);

  if (sinTablas) {
    return <div style={{ fontSize: 12, color: colors.warning, padding: "10px 0" }}>Falta correr la migración 040 en Supabase para el tubo del proyecto.</div>;
  }

  const delTunel = etapasDelTunel(catalogo, tunel);
  const orden = new Map(delTunel.map((e, i) => [e.id, i]));
  const enFila = [...etapas].sort((a, b) => (orden.get(a.etapa_id) ?? 99) - (orden.get(b.etapa_id) ?? 99) || a.orden - b.orden);
  const actual = enFila.find(e => e.id === elegida) || enFila[0];
  const susItems = items.filter(i => i.lead_etapa_id === actual?.id).sort((a, b) => a.orden - b.orden);
  const itemsDe = etapaId => items.filter(i => i.lead_etapa_id === etapaId);

  async function hacer(fn) {
    setOcupado(true);
    try { await fn(); await cargar(); } finally { setOcupado(false); }
  }

  const cerradas = enFila.filter(e => e.estado === "hecha").length;

  return (
    <div>
      {/* ── Los hitos, en fila ── */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: colors.ink }}>{info.label}</span>
        <span style={{ fontSize: 11.5, color: colors.muted }}>
          {info.enOrden ? "Los hitos van en orden: del uno se pasa al otro cuando está cerrado." : "Sin orden: las etapas pasan cuando pasan."}
          {enFila.length ? ` · ${cerradas} de ${enFila.length} cerrados` : ""}
        </span>
      </div>

      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6 }}>
        {enFila.map((e, i) => {
          const cat = etapaInfo(e.etapa_id, catalogo);
          const suyos = itemsDe(e.id);
          const avance = avanceDe(suyos);
          const activa = e.id === actual?.id;
          const hecha = e.estado === "hecha";
          const Icono = (ESTADOS[e.estado] || ESTADOS.pendiente).icono;
          const tono = hecha ? colors.success : e.estado === "en_curso" ? (cat.color || colors.brand) : colors.border;
          return (
            <button key={e.id} onClick={() => setElegida(e.id)}
              style={{ flex: "1 0 140px", minWidth: 140, textAlign: "left", cursor: "pointer", fontFamily: colors.font,
                background: activa ? colors.surface : colors.bg, border: `1px solid ${activa ? colors.ink : colors.border}`,
                borderTop: `3px solid ${tono}`, borderRadius: colors.radiusSm, padding: "8px 10px", position: "relative" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
                <Icono size={12} color={hecha ? colors.success : e.estado === "en_curso" ? cat.color || colors.brand : colors.muted} />
                <span style={{ fontSize: 10, color: colors.muted }}>{i + 1}</span>
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: hecha ? colors.muted : colors.ink, lineHeight: 1.25, textDecoration: hecha ? "line-through" : "none" }}>{cat.nombre}</div>
              <div style={{ fontSize: 10, color: colors.muted, marginTop: 3, minHeight: 13 }}>
                {avance == null ? "sin checklist" : `${suyos.filter(x => x.hecho).length}/${suyos.length}`}
                {e.fecha_objetivo ? ` · ${new Date(e.fecha_objetivo + "T12:00:00").toLocaleDateString("es-EC", { day: "numeric", month: "short" })}` : ""}
              </div>
              {/* Cuánto lleva ese hito, en una barra: es lo que se mira primero. */}
              <div style={{ height: 4, borderRadius: 3, background: colors.neutralSoft, marginTop: 5, overflow: "hidden" }}>
                <div style={{ width: `${hecha ? 100 : avance || 0}%`, height: "100%", background: hecha ? colors.success : cat.color || colors.brand }} />
              </div>
              {e.responsable_nombre && (
                <div style={{ position: "absolute", top: 6, right: 6 }} title={e.responsable_nombre}>
                  <Avatar name={e.responsable_nombre} size={18} color={cat.color || colors.brand} />
                </div>
              )}
            </button>
          );
        })}
        {!enFila.length && <div style={{ fontSize: 12, color: colors.muted, padding: "12px 0" }}>Todavía no hay etapas puestas.</div>}
      </div>

      {/* ── Lo que le falta al hito elegido ── */}
      {actual && (
        <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 12, marginTop: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: colors.ink }}>{etapaInfo(actual.etapa_id, catalogo).nombre}</span>
            <span style={{ fontSize: 11, color: colors.muted }}>{(ESTADOS[actual.estado] || ESTADOS.pendiente).label}</span>
            <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
              {actual.estado !== "hecha" ? (
                <>
                  {actual.estado !== "en_curso" && (
                    <button onClick={() => hacer(() => cambiarEstadoEtapa(actual, "en_curso", currentUser))} disabled={ocupado}
                      style={boton(false)}>Arrancar</button>
                  )}
                  <button onClick={() => hacer(async () => {
                    const faltan = susItems.filter(i => !i.hecho).length;
                    if (faltan && !window.confirm(`Quedan ${faltan} ${faltan === 1 ? "punto" : "puntos"} sin marcar. ¿Cerrar el hito igual?`)) return;
                    await cambiarEstadoEtapa(actual, "hecha", currentUser);
                    onBitacora?.();
                  })} disabled={ocupado} style={boton(true)}>
                    {ocupado ? <Loader2 size={12} /> : <Check size={12} />} Cerrar hito
                  </button>
                </>
              ) : (
                <button onClick={() => hacer(() => cambiarEstadoEtapa(actual, "en_curso", currentUser))} disabled={ocupado} style={boton(false)}>
                  <RotateCcw size={12} /> Reabrir
                </button>
              )}
            </div>
          </div>

          {/* El checklist: lo que hay que tener para cerrarlo. */}
          {susItems.map(item => {
            const tarea = item.tarea_id;
            return (
              <div key={item.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 0", borderTop: `1px solid ${colors.neutralSoft}` }}>
                <button onClick={() => hacer(() => marcarItem(item, !item.hecho, currentUser?.name))} disabled={ocupado}
                  title={item.hecho ? "Desmarcar" : "Marcar como hecho"}
                  style={{ width: 18, height: 18, flexShrink: 0, marginTop: 1, borderRadius: 5, cursor: "pointer",
                    border: `1.5px solid ${item.hecho ? colors.success : colors.border}`, background: item.hecho ? colors.success : "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                  {item.hecho && <Check size={12} color="#fff" />}
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, color: item.hecho ? colors.muted : colors.ink, textDecoration: item.hecho ? "line-through" : "none", overflowWrap: "anywhere" }}>{item.texto}</div>
                  <div style={{ fontSize: 10, color: colors.muted }}>
                    {item.hecho && item.hecho_por ? `${item.hecho_por}${item.hecho_at ? ` · ${new Date(item.hecho_at).toLocaleDateString("es-EC", { day: "numeric", month: "short" })}` : ""}` : ""}
                    {tarea ? " · es una tarea" : ""}
                  </div>
                </div>
                {!tarea && !item.hecho && (
                  <button onClick={() => setATarea({ item, titulo: item.texto, assignee_id: "", due_date: "" })}
                    title="Convertirlo en tarea de alguien"
                    style={{ ...boton(false), padding: "3px 8px", fontSize: 11 }}><ListTodo size={11} /> Tarea</button>
                )}
                <button onClick={() => hacer(() => borrarItem(item.id))} disabled={ocupado} title="Quitar del checklist"
                  style={{ background: "none", border: "none", color: colors.muted, cursor: "pointer", display: "flex", padding: 2 }}><X size={13} /></button>
              </div>
            );
          })}

          {!susItems.length && (
            <div style={{ fontSize: 11.5, color: colors.muted, padding: "6px 0" }}>
              Sin checklist todavía. Escribe abajo lo que hay que tener para cerrar este hito
              <button onClick={() => hacer(() => sembrarChecklist(lead, actual))} disabled={ocupado}
                style={{ background: "none", border: "none", padding: "0 4px", color: colors.ink, textDecoration: "underline", cursor: "pointer", fontSize: 11.5, fontFamily: colors.font }}>
                o trae el de fábrica
              </button>.
            </div>
          )}

          <form onSubmit={e => { e.preventDefault(); if (nuevo.trim()) hacer(async () => { await agregarItem(lead, actual, nuevo, susItems.length + 1); setNuevo(""); }); }}
            style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <input value={nuevo} onChange={e => setNuevo(e.target.value)} placeholder="Agregar un punto a este hito"
              style={{ ...inputStyle, flex: 1, fontSize: 12.5 }} />
            <button type="submit" disabled={!nuevo.trim() || ocupado} style={boton(true)}><Plus size={12} /> Agregar</button>
          </form>
        </div>
      )}

      {/* Volver un punto en tarea: quién y para cuándo. */}
      {aTarea && (
        <div style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 12, marginTop: 8 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.ink, marginBottom: 8 }}>Convertir en tarea</div>
          <div style={{ display: "grid", gap: 8 }}>
            <input value={aTarea.titulo} onChange={e => setATarea(a => ({ ...a, titulo: e.target.value }))} style={inputStyle} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <select value={aTarea.assignee_id} onChange={e => setATarea(a => ({ ...a, assignee_id: e.target.value }))} style={inputStyle}>
                <option value="">¿Quién la hace?</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <input type="date" value={aTarea.due_date} onChange={e => setATarea(a => ({ ...a, due_date: e.target.value }))} style={inputStyle} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => hacer(async () => {
                await itemATarea(aTarea.item, { lead, titulo: aTarea.titulo, assignee_id: aTarea.assignee_id ? Number(aTarea.assignee_id) : null, due_date: aTarea.due_date || null, creadoPor: currentUser?.id });
                setATarea(null);
              })} disabled={ocupado || !aTarea.titulo.trim()} style={boton(true)}>Crear tarea</button>
              <button onClick={() => setATarea(null)} style={boton(false)}>Cancelar</button>
            </div>
            <div style={{ fontSize: 10.5, color: colors.muted }}>Va a la lista de tareas con el proyecto puesto. Al completarla, el punto queda marcado.</div>
          </div>
        </div>
      )}
    </div>
  );
}

const boton = fuerte => ({
  display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", fontFamily: colors.font, fontSize: 12, fontWeight: 600,
  border: `1px solid ${fuerte ? colors.ink : colors.border}`, background: fuerte ? colors.ink : "#fff",
  color: fuerte ? "#fff" : colors.inkSoft, borderRadius: 8, padding: "5px 11px",
});
