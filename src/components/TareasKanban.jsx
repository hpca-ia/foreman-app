import { daysUntil } from "../lib/dates";
import { PRIORIDAD, ESTADO } from "../theme/constants";
import { colors } from "../theme/colors";
import Avatar from "./ui/Avatar";

const COLUMNAS = ["pendiente", "en-progreso", "bloqueado", "listo"];
const MAX_VISIBLE = 8;

function fechaLabel(t) {
  const d = daysUntil(t.due_date);
  if (d < 0) return `Vencida ${Math.abs(d)}d`;
  if (d === 0) return "Hoy";
  return `en ${d}d`;
}

export default function TareasKanban({ tasks, users, projects, currentUser, onCambiarEstado, onEditar }) {
  const gU = id => users.find(u => u.id === id);
  const gP = id => projects.find(p => p.id === id);

  return (
    <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 8 }}>
      {COLUMNAS.map(status => {
        const eC = ESTADO[status];
        const enColumna = tasks
          .filter(t => t.status === status)
          .sort((a, b) => daysUntil(a.due_date) - daysUntil(b.due_date));
        return (
          <div key={status} style={{ width: 270, flexShrink: 0, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 4px", marginBottom: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: eC.color }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: colors.ink }}>{eC.label}</span>
              <span style={{ fontSize: 12, color: colors.muted }}>{enColumna.length}</span>
            </div>
            <div className="kanban-col" style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "calc(100vh - 230px)", overflowY: "auto", paddingRight: 2 }}>
              {enColumna.slice(0, MAX_VISIBLE).map(t => {
                const proy = gP(t.project_id);
                const asig = t.assignee_id ? gU(t.assignee_id) : null;
                const pC = PRIORIDAD[t.priority] || PRIORIDAD.media;
                const puedeCambiar = currentUser.id === t.assignee_id || true;
                return (
                  <div key={t.id} style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderLeft: `3px solid ${proy?.color || colors.brand}`, borderRadius: colors.radiusMd, padding: 12, display: "flex", flexDirection: "column", gap: 7, cursor: "pointer" }} onClick={() => onEditar(t)}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: pC.color, background: pC.bg, padding: "2px 7px", borderRadius: 20, width: "fit-content" }}>{pC.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: colors.ink, lineHeight: 1.35 }}>{t.title}</span>
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
                        {COLUMNAS.filter(c => c !== status).map(c => (
                          <button key={c} onClick={() => onCambiarEstado(t.id, c)} style={{ background: colors.neutralSoft, border: "none", borderRadius: colors.radiusSm, padding: "3px 7px", fontSize: 9, color: colors.inkSoft, cursor: "pointer" }}>
                            → {ESTADO[c].label}
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
    </div>
  );
}
