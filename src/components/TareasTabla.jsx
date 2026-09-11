import { daysUntil } from "../lib/dates";
import { PRIORIDAD, ESTADO } from "../theme/constants";
import { colors } from "../theme/colors";
import Avatar from "./ui/Avatar";

function fechaLabel(t) {
  if (t.status === "listo") return "—";
  const d = daysUntil(t.due_date);
  if (d < 0) return `Vencida ${Math.abs(d)}d`;
  if (d === 0) return "Hoy";
  return `en ${d}d`;
}
function fechaColor(t) {
  if (t.status === "listo") return colors.muted;
  const d = daysUntil(t.due_date);
  if (d < 0) return colors.danger;
  if (d <= 2) return colors.warning;
  return colors.muted;
}

export default function TareasTabla({ tasks, users, projects, onEditar }) {
  const gU = id => users.find(u => u.id === id);
  const gP = id => projects.find(p => p.id === id);

  const row = { display: "grid", gridTemplateColumns: "10px 3fr 1.3fr 1.1fr .9fr .9fr .8fr", gap: 14, alignItems: "center", padding: "0 16px", height: 40, borderBottom: `1px solid ${colors.neutralSoft}`, cursor: "pointer" };

  return (
    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, overflow: "hidden" }}>
      <div style={{ ...row, height: 34, background: colors.bg, cursor: "default" }}>
        <span />
        {["TAREA", "PROYECTO", "RESPONSABLE", "PRIORIDAD", "ESTADO", "VENCE"].map(h => (
          <span key={h} style={{ fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.4 }}>{h}</span>
        ))}
      </div>
      {tasks.length === 0 && <div style={{ padding: "40px 0", textAlign: "center", color: colors.muted, fontSize: 13 }}>Sin tareas.</div>}
      {tasks.map(t => {
        const proy = gP(t.project_id);
        const asig = t.assignee_id ? gU(t.assignee_id) : null;
        const pC = PRIORIDAD[t.priority] || PRIORIDAD.media;
        const eC = ESTADO[t.status] || ESTADO.pendiente;
        return (
          <div key={t.id} className="tabla-row" style={row} onClick={() => onEditar(t)}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: proy?.color || colors.brand }} />
            <span style={{ fontSize: 13, fontWeight: 500, color: colors.ink, opacity: t.status === "listo" ? 0.55 : 1, textDecoration: t.status === "listo" ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
            <span style={{ fontSize: 12, color: colors.inkSoft, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{proy?.name}</span>
            {asig ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
                <Avatar name={asig.name} size={16} color={asig.color || colors.brand} />
                <span style={{ fontSize: 12, color: colors.inkSoft, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{asig.name}</span>
              </div>
            ) : <span style={{ fontSize: 12, color: colors.danger }}>Sin asignar</span>}
            <span style={{ fontSize: 11, fontWeight: 600, color: pC.color, background: pC.bg, padding: "2px 8px", borderRadius: 20, width: "fit-content" }}>{pC.label}</span>
            <span style={{ fontSize: 12, color: eC.color }}>{eC.label}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: fechaColor(t) }}>{fechaLabel(t)}</span>
          </div>
        );
      })}
    </div>
  );
}
