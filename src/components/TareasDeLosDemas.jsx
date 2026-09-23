import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { colors } from "../theme/colors";
import { PRIORIDAD } from "../theme/constants";
import { daysUntil } from "../lib/dates";
import Avatar from "./ui/Avatar";

// Lo que está haciendo el resto.
//
// Lo primero de la pantalla son las tareas de uno: eso es lo que hay que
// hacer hoy. Pero trabajar sin saber en qué anda el resto obliga a preguntar
// por WhatsApp "¿ya hiciste lo del plano?". Acá está, en un cuadro aparte:
// una columna por persona, lo que tiene abierto y lo que vence primero.
//
// Se abre y se cierra, y se queda como se lo dejó.

const LLAVE = "foreman_ver_los_demas";
const cuando = t => {
  const d = daysUntil(t.due_date);
  if (!t.due_date) return "sin fecha";
  if (d < 0) return `vencida ${Math.abs(d)}d`;
  if (d === 0) return "hoy";
  if (d === 1) return "mañana";
  return `en ${d}d`;
};

export default function TareasDeLosDemas({ tasks = [], users = [], projects = [], leads = {}, onEditar }) {
  const [abierto, setAbierto] = useState(() => {
    try { return localStorage.getItem(LLAVE) !== "no"; } catch { return true; }
  });
  const alternar = () => {
    setAbierto(a => {
      try { localStorage.setItem(LLAVE, a ? "no" : "si"); } catch { /* sin memoria del navegador */ }
      return !a;
    });
  };

  const porPersona = users
    .map(u => ({ persona: u, suyas: tasks.filter(t => t.assignee_id === u.id && t.status !== "listo") }))
    .filter(x => x.suyas.length)
    .sort((a, b) => b.suyas.length - a.suyas.length);

  if (!porPersona.length) return null;
  const total = porPersona.reduce((s, x) => s + x.suyas.length, 0);

  return (
    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, marginTop: 14, overflow: "hidden" }}>
      <button onClick={alternar}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "none", border: "none", cursor: "pointer", fontFamily: colors.font, textAlign: "left" }}>
        {abierto ? <ChevronDown size={14} color={colors.muted} /> : <ChevronRight size={14} color={colors.muted} />}
        <span style={{ fontSize: 13, fontWeight: 700, color: colors.ink }}>En qué anda el resto</span>
        <span style={{ fontSize: 11.5, color: colors.muted }}>{porPersona.length} {porPersona.length === 1 ? "persona" : "personas"} · {total} {total === 1 ? "tarea abierta" : "tareas abiertas"}</span>
      </button>

      {abierto && (
        <div style={{ display: "flex", gap: 10, overflowX: "auto", padding: "0 14px 14px" }}>
          {porPersona.map(({ persona, suyas }) => {
            const vencidas = suyas.filter(t => t.due_date && daysUntil(t.due_date) < 0).length;
            return (
              <div key={persona.id} style={{ width: 230, flexShrink: 0, background: colors.bg, border: `1px solid ${colors.neutralSoft}`, borderRadius: colors.radiusSm, padding: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                  <Avatar name={persona.name} size={22} color={persona.color || colors.brand} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{persona.name}</div>
                    <div style={{ fontSize: 10.5, color: vencidas ? colors.danger : colors.muted }}>
                      {suyas.length} abiertas{vencidas ? ` · ${vencidas} vencida${vencidas === 1 ? "" : "s"}` : ""}
                    </div>
                  </div>
                </div>
                {suyas.slice(0, 4).map(t => {
                  const proy = t.lead_id ? { name: leads[t.lead_id] || "Pipeline", color: null } : projects.find(p => p.id === t.project_id);
                  const atrasada = t.due_date && daysUntil(t.due_date) < 0;
                  return (
                    <div key={t.id} onClick={() => onEditar?.(t)}
                      style={{ display: "flex", gap: 6, alignItems: "flex-start", padding: "5px 0", borderTop: `1px solid ${colors.neutralSoft}`, cursor: "pointer" }}>
                      <span style={{ width: 4, alignSelf: "stretch", borderRadius: 3, background: proy?.color || colors.border, flexShrink: 0 }} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 11.5, color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                        <div style={{ fontSize: 10, color: atrasada ? colors.danger : colors.muted }}>
                          {proy?.name ? `${proy.name} · ` : ""}{cuando(t)}
                          {t.priority === "urgente" && <span style={{ color: PRIORIDAD.urgente.color }}> · urgente</span>}
                          {t.status === "bloqueado" && <span> · pausada</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {suyas.length > 4 && <div style={{ fontSize: 10.5, color: colors.muted, paddingTop: 5 }}>y {suyas.length - 4} más</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
