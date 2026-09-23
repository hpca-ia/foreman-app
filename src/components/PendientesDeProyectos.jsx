import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { colors } from "../theme/colors";
import { daysUntil } from "../lib/dates";

// Pendientes de los proyectos: lo que hay que hacer y todavía no tiene dueño.
//
// Cada actividad de un tubo entra a tareas aunque nadie la haya tomado. Sin
// esto, el tablero mostraría al proyecto limpio mientras en su etapa quedan
// seis cosas sin hacer: el pendiente existe desde que se escribe, no desde que
// se le pone nombre.
//
// No van en "Mis tareas" —no son de nadie todavía— ni en "El equipo" —que es
// quién anda con qué—. Van acá, por proyecto, y se abren para tomarlas: al
// asignarle responsable pasan a la lista de esa persona y salen de este cuadro.

const LLAVE = "foreman_ver_pendientes_proyectos";

const cuando = t => {
  if (!t.due_date) return "sin fecha";
  const d = daysUntil(t.due_date);
  if (d < 0) return `${Math.abs(d)}d tarde`;
  if (d === 0) return "hoy";
  if (d === 1) return "mañana";
  return `en ${d}d`;
};

export default function PendientesDeProyectos({ tasks = [], projects = [], leads = {}, onEditar }) {
  const [abierto, setAbierto] = useState(() => {
    try { return localStorage.getItem(LLAVE) !== "no"; } catch { return true; }
  });
  const [cual, setCual] = useState(null);

  const alternar = () => setAbierto(a => {
    try { localStorage.setItem(LLAVE, a ? "no" : "si"); } catch { /* sin memoria del navegador */ }
    return !a;
  });

  // Agrupadas por proyecto, el que tenga más pendientes primero.
  const porProyecto = new Map();
  for (const t of tasks) {
    const clave = t.lead_id ? `l${t.lead_id}` : `p${t.project_id || 0}`;
    const proy = t.lead_id ? projects.find(p => p.lead_id === t.lead_id) : projects.find(p => p.id === t.project_id);
    if (!porProyecto.has(clave)) {
      porProyecto.set(clave, {
        clave,
        nombre: t.lead_id ? (leads[t.lead_id] || "Pipeline") : proy?.name || "Sin proyecto",
        color: proy?.color || colors.border,
        suyas: [],
      });
    }
    porProyecto.get(clave).suyas.push(t);
  }
  const grupos = [...porProyecto.values()]
    .map(g => ({ ...g, suyas: g.suyas.sort((a, b) => daysUntil(a.due_date) - daysUntil(b.due_date)) }))
    .sort((a, b) => b.suyas.length - a.suyas.length || a.nombre.localeCompare(b.nombre));

  if (!grupos.length) return null;
  const total = tasks.length;

  const fila = { display: "grid", gridTemplateColumns: "minmax(110px, 1.4fr) 78px minmax(120px, 2fr)", gap: 10, alignItems: "center", padding: "8px 14px", borderTop: `1px solid ${colors.neutralSoft}`, cursor: "pointer" };
  const celda = { fontSize: 12, color: colors.inkSoft, whiteSpace: "nowrap" };

  return (
    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, marginTop: 14, overflow: "hidden" }}>
      <button onClick={alternar}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "none", border: "none", cursor: "pointer", fontFamily: colors.font, textAlign: "left" }}>
        {abierto ? <ChevronDown size={14} color={colors.muted} /> : <ChevronRight size={14} color={colors.muted} />}
        <span style={{ fontSize: 13, fontWeight: 700, color: colors.ink }}>Pendientes de proyectos</span>
        <span style={{ fontSize: 11.5, color: colors.muted }}>
          {total} sin responsable en {grupos.length} {grupos.length === 1 ? "proyecto" : "proyectos"}
        </span>
      </button>

      {abierto && grupos.map(g => {
        const desplegado = cual === g.clave;
        const atrasadas = g.suyas.filter(t => t.due_date && daysUntil(t.due_date) < 0).length;
        const proxima = g.suyas.find(t => t.due_date) || g.suyas[0];
        return (
          <div key={g.clave}>
            <div style={fila} onClick={() => setCual(desplegado ? null : g.clave)}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                <span style={{ width: 4, height: 16, borderRadius: 3, background: g.color, flexShrink: 0 }} />
                <span style={{ fontSize: 12.5, fontWeight: 600, color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.nombre}</span>
              </div>
              <span style={{ ...celda, color: atrasadas ? colors.danger : colors.inkSoft, fontWeight: atrasadas ? 700 : 400 }}>
                {atrasadas ? `${atrasadas} atrasada${atrasadas === 1 ? "" : "s"}` : `${g.suyas.length} ${g.suyas.length === 1 ? "cosa" : "cosas"}`}
              </span>
              <span style={{ ...celda, overflow: "hidden", textOverflow: "ellipsis" }}>
                {proxima && <>Falta: {proxima.title} <span style={{ color: colors.muted }}>· {cuando(proxima)}</span></>}
              </span>
            </div>

            {desplegado && (
              <div style={{ background: colors.bg, padding: "4px 14px 10px 41px" }}>
                {g.suyas.map(t => {
                  const tarde = t.due_date && daysUntil(t.due_date) < 0;
                  return (
                    <div key={t.id} onClick={() => onEditar?.(t)}
                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderTop: `1px solid ${colors.neutralSoft}`, cursor: "pointer", fontSize: 12 }}>
                      <span style={{ flex: 1, minWidth: 0, color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
                      <span style={{ color: colors.muted, whiteSpace: "nowrap" }}>tomarla</span>
                      <span style={{ color: tarde ? colors.danger : colors.muted, whiteSpace: "nowrap", minWidth: 62, textAlign: "right" }}>{cuando(t)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
