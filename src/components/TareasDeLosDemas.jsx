import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { colors } from "../theme/colors";
import { daysUntil } from "../lib/dates";
import Avatar from "./ui/Avatar";

// El equipo: en qué anda cada quien.
//
// Lo primero de la pantalla son las tareas de uno. Esto es lo otro: una línea
// por persona, con cuántas tiene encima, cuántas se le pasaron y qué es lo
// próximo que le vence. De un vistazo se sabe a quién está ahogado y a quién
// se le puede pedir algo, sin preguntar por WhatsApp.
//
// Antes era una fila de tarjetas: ocupaban media pantalla para decir tres
// cosas de cada quien. Una tabla dice lo mismo en cinco renglones, y la
// persona que interesa se abre para ver su lista.

const LLAVE = "foreman_ver_los_demas";

const cuando = t => {
  if (!t.due_date) return "sin fecha";
  const d = daysUntil(t.due_date);
  if (d < 0) return `${Math.abs(d)}d tarde`;
  if (d === 0) return "hoy";
  if (d === 1) return "mañana";
  return `en ${d}d`;
};

export default function TareasDeLosDemas({ tasks = [], users = [], projects = [], leads = {}, onEditar }) {
  const [abierto, setAbierto] = useState(() => {
    try { return localStorage.getItem(LLAVE) !== "no"; } catch { return true; }
  });
  const [quien, setQuien] = useState(null);

  const alternar = () => setAbierto(a => {
    try { localStorage.setItem(LLAVE, a ? "no" : "si"); } catch { /* sin memoria del navegador */ }
    return !a;
  });

  const gente = users
    .map(u => {
      const suyas = tasks.filter(t => t.assignee_id === u.id && t.status !== "listo")
        .sort((a, b) => daysUntil(a.due_date) - daysUntil(b.due_date));
      return {
        persona: u, suyas,
        atrasadas: suyas.filter(t => t.due_date && daysUntil(t.due_date) < 0).length,
        urgentes: suyas.filter(t => t.priority === "urgente").length,
        pausadas: suyas.filter(t => t.status === "bloqueado").length,
      };
    })
    .filter(x => x.suyas.length)
    .sort((a, b) => b.atrasadas - a.atrasadas || b.suyas.length - a.suyas.length);

  if (!gente.length) return null;
  const total = gente.reduce((s, x) => s + x.suyas.length, 0);

  const celda = { fontSize: 12, color: colors.inkSoft, whiteSpace: "nowrap" };
  const fila = { display: "grid", gridTemplateColumns: "minmax(110px, 1.4fr) 62px 74px minmax(120px, 2fr)", gap: 10, alignItems: "center", padding: "8px 14px", borderTop: `1px solid ${colors.neutralSoft}`, cursor: "pointer" };

  return (
    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, marginTop: 14, overflow: "hidden" }}>
      <button onClick={alternar}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "none", border: "none", cursor: "pointer", fontFamily: colors.font, textAlign: "left" }}>
        {abierto ? <ChevronDown size={14} color={colors.muted} /> : <ChevronRight size={14} color={colors.muted} />}
        <span style={{ fontSize: 13, fontWeight: 700, color: colors.ink }}>El equipo</span>
        <span style={{ fontSize: 11.5, color: colors.muted }}>{gente.length} {gente.length === 1 ? "persona" : "personas"} · {total} {total === 1 ? "tarea abierta" : "tareas abiertas"}</span>
      </button>

      {abierto && gente.map(({ persona, suyas, atrasadas, urgentes, pausadas }) => {
        const desplegada = quien === persona.id;
        const proxima = suyas[0];
        return (
          <div key={persona.id}>
            <div style={fila} onClick={() => setQuien(desplegada ? null : persona.id)}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                <Avatar name={persona.name} size={20} color={persona.color || colors.brand} />
                <span style={{ fontSize: 12.5, fontWeight: 600, color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{persona.name}</span>
              </div>
              <span style={celda}>{suyas.length} abiertas</span>
              <span style={{ ...celda, color: atrasadas ? colors.danger : colors.muted, fontWeight: atrasadas ? 700 : 400 }}>
                {atrasadas ? `${atrasadas} atrasada${atrasadas === 1 ? "" : "s"}` : "al día"}
              </span>
              <span style={{ ...celda, overflow: "hidden", textOverflow: "ellipsis" }}>
                {proxima ? <>Próxima: {proxima.title} <span style={{ color: colors.muted }}>· {cuando(proxima)}</span></> : ""}
                {urgentes > 0 && <span style={{ color: colors.danger }}> · {urgentes} urgente{urgentes === 1 ? "" : "s"}</span>}
                {pausadas > 0 && <span style={{ color: colors.muted }}> · {pausadas} pausada{pausadas === 1 ? "" : "s"}</span>}
              </span>
            </div>

            {desplegada && (
              <div style={{ background: colors.bg, padding: "4px 14px 10px 41px" }}>
                {suyas.map(t => {
                  const proy = t.lead_id ? { name: leads[t.lead_id] || "Pipeline", color: null } : projects.find(p => p.id === t.project_id);
                  const tarde = t.due_date && daysUntil(t.due_date) < 0;
                  return (
                    <div key={t.id} onClick={() => onEditar?.(t)}
                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderTop: `1px solid ${colors.neutralSoft}`, cursor: "pointer", fontSize: 12 }}>
                      <span style={{ width: 4, height: 16, borderRadius: 3, background: proy?.color || colors.border, flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 0, color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
                      <span style={{ color: colors.muted, whiteSpace: "nowrap" }}>{proy?.name}</span>
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
