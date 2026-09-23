import { useState } from "react";
import { ChevronLeft, ChevronRight, CalendarPlus, Copy, Check } from "lucide-react";
import { enlaceCalendario } from "../lib/calendarioSuscripcion";
import { colors } from "../theme/colors";
import { PRIORIDAD } from "../theme/constants";
import MarcaPrivada from "./ui/MarcaPrivada";

// El mes, con las tareas en el día en que vencen.
//
// La lista dice qué hay que hacer; el calendario dice cuándo, que es otra
// pregunta: si el jueves hay seis entregas y el viernes ninguna, eso solo se
// ve así. Cada tarea lleva el color de su proyecto.
//
// Las completadas se ven apagadas y tachadas: sirven para saber qué pasó esa
// semana, no para taparle el sitio a lo que falta.

const DIAS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const clave = f => {
  const d = new Date(f);
  return isNaN(d) ? "" : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const hoyClave = () => clave(new Date());

/** Las seis semanas que se ven en un mes, empezando en lunes. */
function semanasDe(ano, mes) {
  const primero = new Date(ano, mes, 1);
  const arranque = new Date(primero);
  arranque.setDate(1 - ((primero.getDay() + 6) % 7));
  return Array.from({ length: 6 }, (_, s) => Array.from({ length: 7 }, (_, d) => {
    const dia = new Date(arranque);
    dia.setDate(arranque.getDate() + s * 7 + d);
    return dia;
  }));
}

export default function TareasCalendario({ tasks = [], users = [], projects = [], leads = {}, currentUser, onEditar }) {
  const hoy = new Date();
  const [ano, setAno] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth());
  const [dia, setDia] = useState(null);           // el día abierto en el teléfono
  // Para verlo también en el calendario de siempre.
  const [suscripcion, setSuscripcion] = useState(null);
  const [copiado, setCopiado] = useState(false);

  async function pedirEnlace(renovar) {
    setSuscripcion({ cargando: true });
    const r = await enlaceCalendario(currentUser?.id, { renovar });
    setSuscripcion(r);
    setCopiado(false);
  }

  const gP = id => projects.find(p => p.id === id);
  const porDia = {};
  tasks.forEach(t => {
    const k = clave(t.due_date);
    if (k) (porDia[k] = porDia[k] || []).push(t);
  });

  const mover = n => {
    const d = new Date(ano, mes + n, 1);
    setAno(d.getFullYear()); setMes(d.getMonth()); setDia(null);
  };

  const sinFecha = tasks.filter(t => !clave(t.due_date));
  const semanas = semanasDe(ano, mes);
  const flecha = { background: "#fff", border: `1px solid ${colors.border}`, borderRadius: 8, padding: "5px 8px", cursor: "pointer", color: colors.inkSoft, display: "flex" };

  const pastilla = t => {
    const proy = t.lead_id ? { name: leads[t.lead_id] || "Pipeline", color: null } : gP(t.project_id);
    const color = proy?.color || colors.brand;
    const listo = t.status === "listo";
    const urgente = t.priority === "urgente";
    return (
      <div key={t.id} onClick={e => { e.stopPropagation(); onEditar?.(t); }}
        title={`${t.title}${proy?.name ? ` · ${proy.name}` : ""}${users.find(u => u.id === t.assignee_id) ? ` · ${users.find(u => u.id === t.assignee_id).name}` : ""}`}
        style={{ display: "flex", alignItems: "center", gap: 4, background: listo ? colors.neutralSoft : `${color}1A`, borderLeft: `3px solid ${listo ? colors.border : color}`,
          borderRadius: 4, padding: "2px 5px", marginBottom: 2, cursor: "pointer", fontSize: 10.5, lineHeight: 1.25,
          color: listo ? colors.muted : colors.ink, textDecoration: listo ? "line-through" : "none", overflow: "hidden" }}>
        {urgente && !listo && <span style={{ width: 5, height: 5, borderRadius: "50%", background: PRIORIDAD.urgente.color, flexShrink: 0 }} />}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.privada && <MarcaPrivada />}{t.title}</span>
      </div>
    );
  };

  return (
    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <button onClick={() => mover(-1)} style={flecha}><ChevronLeft size={14} /></button>
        <button onClick={() => mover(1)} style={flecha}><ChevronRight size={14} /></button>
        <span style={{ fontSize: 14, fontWeight: 700, color: colors.ink, textTransform: "capitalize" }}>{MESES[mes]} {ano}</span>
        <button onClick={() => { setAno(hoy.getFullYear()); setMes(hoy.getMonth()); setDia(null); }}
          style={{ ...flecha, padding: "5px 12px", fontSize: 12, fontFamily: colors.font }}>Hoy</button>
        <span style={{ marginLeft: "auto", fontSize: 11, color: colors.muted }}>{tasks.length} {tasks.length === 1 ? "tarea" : "tareas"} · cada color es un proyecto</span>
        {currentUser && (
          <button onClick={() => (suscripcion ? setSuscripcion(null) : pedirEnlace(false))}
            style={{ ...flecha, padding: "5px 11px", fontSize: 11.5, fontFamily: colors.font, alignItems: "center", gap: 5 }}>
            <CalendarPlus size={13} /> Verlo en mi calendario
          </button>
        )}
      </div>

      {/* El enlace para suscribirse desde Google, el iPhone o Outlook. */}
      {suscripcion && (
        <div style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 12, marginBottom: 10, fontSize: 12, color: colors.inkSoft, lineHeight: 1.5 }}>
          {suscripcion.cargando ? "Armando tu enlace…"
            : suscripcion.faltaMigracion ? <span style={{ color: colors.warning }}>Falta correr la migración 036 en Supabase para poder armar el enlace.</span>
            : suscripcion.error ? <span style={{ color: colors.danger }}>{suscripcion.error}</span>
            : (
            <>
              <div style={{ fontWeight: 700, color: colors.ink, marginBottom: 6 }}>Tus tareas, en el calendario que ya usas</div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                <input readOnly value={suscripcion.url} onFocus={e => e.target.select()}
                  style={{ flex: "1 1 260px", minWidth: 0, background: "#fff", border: `1px solid ${colors.border}`, borderRadius: 8, padding: "7px 9px", fontSize: 11.5, color: colors.ink, fontFamily: colors.font }} />
                <button onClick={() => { navigator.clipboard?.writeText(suscripcion.url); setCopiado(true); }}
                  style={{ ...flecha, padding: "6px 11px", fontSize: 11.5, fontFamily: colors.font, alignItems: "center", gap: 5 }}>
                  {copiado ? <><Check size={12} /> Copiado</> : <><Copy size={12} /> Copiar</>}
                </button>
              </div>
              <div><strong style={{ color: colors.ink }}>Google Calendar:</strong> Otros calendarios → + → Desde URL → pega el enlace.</div>
              <div><strong style={{ color: colors.ink }}>iPhone:</strong> Ajustes → Calendario → Cuentas → Añadir → Otra → Añadir calendario suscrito.</div>
              <div style={{ color: colors.muted, marginTop: 6 }}>
                Google lo relee cada cierto tiempo, así que un cambio puede tardar en verse ahí. Cualquiera con este enlace ve tus tareas, así que no lo publiques.{" "}
                <button onClick={() => pedirEnlace(true)} style={{ background: "none", border: "none", padding: 0, color: colors.ink, textDecoration: "underline", cursor: "pointer", fontSize: 11.5, fontFamily: colors.font }}>Cambiar el enlace</button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="cal-grid" style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 4 }}>
        {DIAS.map(d => <div key={d} style={{ fontSize: 10, fontWeight: 700, color: colors.muted, textAlign: "center", padding: "2px 0", letterSpacing: 0.3 }}>{d.toUpperCase()}</div>)}
        {semanas.flat().map(d => {
          const k = clave(d);
          const delMes = d.getMonth() === mes;
          const esHoy = k === hoyClave();
          const suyas = porDia[k] || [];
          return (
            <div key={k} onClick={() => setDia(suyas.length ? k : null)}
              style={{ minHeight: 78, border: `1px solid ${esHoy ? colors.ink : colors.neutralSoft}`, borderRadius: 6, padding: 4,
                background: delMes ? "#fff" : colors.bg, opacity: delMes ? 1 : 0.55, overflow: "hidden", cursor: suyas.length ? "pointer" : "default" }}>
              <div style={{ fontSize: 10.5, fontWeight: esHoy ? 700 : 500, color: esHoy ? colors.ink : colors.muted, marginBottom: 3 }}>{d.getDate()}</div>
              {suyas.slice(0, 3).map(pastilla)}
              {suyas.length > 3 && <div style={{ fontSize: 10, color: colors.muted, paddingLeft: 3 }}>y {suyas.length - 3} más</div>}
            </div>
          );
        })}
      </div>

      {/* En el teléfono las pastillas no entran: tocando el día se ven enteras. */}
      {dia && (
        <div style={{ marginTop: 10, borderTop: `1px solid ${colors.neutralSoft}`, paddingTop: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: colors.ink, marginBottom: 6 }}>
            {new Date(dia + "T12:00:00").toLocaleDateString("es-EC", { weekday: "long", day: "numeric", month: "long" })}
          </div>
          {(porDia[dia] || []).map(pastilla)}
        </div>
      )}

      {sinFecha.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 11, color: colors.muted }}>
          {sinFecha.length} {sinFecha.length === 1 ? "tarea no tiene fecha y no sale acá" : "tareas no tienen fecha y no salen acá"}.
        </div>
      )}
    </div>
  );
}
