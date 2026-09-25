import { useState } from "react";
import { daysUntil } from "../lib/dates";
import CompletarTarea from "./CompletarTarea";
import { esAdmin } from "../lib/roles";
import MarcaPrivada from "./ui/MarcaPrivada";
import { PRIORIDAD } from "../theme/constants";
import { colors } from "../theme/colors";
import Avatar from "./ui/Avatar";

// Las columnas son como se trabaja: lo que está andando, lo que está parado,
// lo que se pasó de fecha y lo que ya se hizo. "Atrasada" no es un estado que
// alguien elija —sale de la fecha—, pero es la columna que primero se mira.
const COLUMNAS = [
  { id: "atrasada", label: "Atrasadas", color: colors.danger, de: t => t.status !== "listo" && t.due_date && daysUntil(t.due_date) < 0 },
  { id: "en-progreso", label: "En proceso", color: colors.warning, de: t => t.status !== "listo" && t.status !== "bloqueado" && !(t.due_date && daysUntil(t.due_date) < 0) },
  { id: "bloqueado", label: "Pausadas", color: colors.inkSoft, de: t => t.status === "bloqueado" && !(t.due_date && daysUntil(t.due_date) < 0) },
  { id: "listo", label: "Completadas", color: colors.success, de: t => t.status === "listo" },
];
// A qué estado se puede mandar una tarea desde el tablero: atrasada no es uno.
const MOVIBLES = [["en-progreso", "En proceso"], ["bloqueado", "Pausada"], ["listo", "Completada"]];
const MAX_VISIBLE = 8;

function fechaLabel(t) {
  if (!t.due_date) return "sin fecha";
  const d = daysUntil(t.due_date);
  if (d < 0) return `Vencida ${Math.abs(d)}d`;
  if (d === 0) return "Hoy";
  return `en ${d}d`;
}

export default function TareasKanban({ tasks, users, projects, leads = {}, currentUser, onCambiarEstado, onEditar }) {
  const gU = id => users.find(u => u.id === id);
  const gP = id => projects.find(p => p.id === id);
  // Completar pide la prueba también acá: si no, según por dónde se cierre la
  // tarea se pide o no se pide, y eso no se entiende.
  const [completando, setCompletando] = useState(null);
  const mover = (t, estado) => (estado === "listo" ? setCompletando(t) : onCambiarEstado(t.id, estado));

  return (
    <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 8 }}>
      {COLUMNAS.map(col => {
        const enColumna = tasks
          .filter(col.de)
          .sort((a, b) => (daysUntil(a.due_date) || 0) - (daysUntil(b.due_date) || 0) || 0);
        return (
          <div key={col.id} style={{ width: 270, flexShrink: 0, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 4px", marginBottom: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: col.color }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: colors.ink }}>{col.label}</span>
              <span style={{ fontSize: 12, color: colors.muted }}>{enColumna.length}</span>
            </div>
            <div className="kanban-col" style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "calc(100vh - 230px)", overflowY: "auto", paddingRight: 2 }}>
              {enColumna.slice(0, MAX_VISIBLE).map(t => {
                const proy = t.lead_id ? { name: leads[t.lead_id] || "Pipeline" } : gP(t.project_id);
                const asig = t.assignee_id ? gU(t.assignee_id) : null;
                const pC = PRIORIDAD[t.priority] || PRIORIDAD.media;
                // Antes decía "|| true": cualquiera podía mover la tarea de cualquiera.
                const puedeCambiar = esAdmin(currentUser.role) || currentUser.id === t.assignee_id;
                return (
                  <div key={t.id} style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderLeft: `3px solid ${proy?.color || colors.brand}`, borderRadius: colors.radiusMd, padding: 12, display: "flex", flexDirection: "column", gap: 7, cursor: "pointer" }} onClick={() => onEditar(t)}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: pC.color, background: pC.bg, padding: "2px 7px", borderRadius: 20, width: "fit-content" }}>{pC.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: colors.ink, lineHeight: 1.35 }}>{t.privada && <MarcaPrivada />}{t.title}</span>
                    {t.notes && <span style={{ fontSize: 12, color: colors.inkSoft, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{t.notes}</span>}
                    <span style={{ fontSize: 11, color: colors.muted }}>{proy?.name}</span>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      {asig ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <Avatar name={asig.name} size={18} color={asig.color || colors.brand} />
                          <span style={{ fontSize: 11, color: colors.inkSoft }}>{asig.name}</span>
                        </div>
                      ) : <span style={{ fontSize: 11, color: colors.danger }}>Sin asignar</span>}
                      {t.status !== "listo" && <span style={{ fontSize: 10, color: colors.muted }}>{fechaLabel(t)}</span>}
                    </div>
                    {puedeCambiar && (
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 2 }} onClick={e => e.stopPropagation()}>
                        {MOVIBLES.filter(([id]) => id !== t.status).map(([id, label]) => (
                          <button key={id} onClick={() => mover(t, id)} style={{ background: colors.neutralSoft, border: "none", borderRadius: colors.radiusSm, padding: "3px 7px", fontSize: 9, color: colors.inkSoft, cursor: "pointer" }}>
                            → {label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {enColumna.length > MAX_VISIBLE && (
                <div style={{ textAlign: "center", fontSize: 11, color: colors.muted, padding: "6px 0" }}>+{enColumna.length - MAX_VISIBLE} más</div>
              )}
              {enColumna.length === 0 && (
                <div style={{ textAlign: "center", fontSize: 12, color: colors.muted, padding: "20px 0" }}>Vacío</div>
              )}
            </div>
          </div>
        );
      })}
      {completando && (
        <CompletarTarea tarea={completando} modo="completar" onCerrar={() => setCompletando(null)}
          onConfirmar={datos => onCambiarEstado(completando.id, "listo", { ...datos, decision: "completar" })} />
      )}
    </div>
  );
}
