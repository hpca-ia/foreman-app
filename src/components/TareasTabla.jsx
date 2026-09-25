import { daysUntil } from "../lib/dates";
import { PRIORIDAD, ESTADO } from "../theme/constants";
import { colors } from "../theme/colors";
import Avatar from "./ui/Avatar";
import MarcaPrivada from "./ui/MarcaPrivada";

function fechaLabel(t) {
  if (t.status === "listo") return "—";
  if (!t.due_date) return "sin fecha";
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

export default function TareasTabla({ tasks, users, projects, leads = {}, grupos = null, etiqueta = "TAREA", onEditar }) {
  const gU = id => users.find(u => u.id === id);
  const gP = id => projects.find(p => p.id === id);

  const row = { display: "grid", gridTemplateColumns: "10px 3fr 1.3fr 1.1fr .9fr .9fr .8fr", gap: 14, alignItems: "center", padding: "6px 16px", minHeight: 40, boxSizing: "border-box", borderBottom: `1px solid ${colors.neutralSoft}`, cursor: "pointer" };

  return (
    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, overflow: "hidden" }}>
      <div style={{ ...row, minHeight: 34, padding: "0 16px", background: colors.bg, cursor: "default" }}>
        <span />
        {[etiqueta, "PROYECTO", "RESPONSABLE", "PRIORIDAD", "ESTADO", "VENCE"].map(h => (
          <span key={h} style={{ fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.4 }}>{h}</span>
        ))}
      </div>
      {tasks.length === 0 && <div style={{ padding: "40px 0", textAlign: "center", color: colors.muted, fontSize: 13 }}>Sin tareas.</div>}
      {/* Cuando se ordena por proyecto, urgencia o responsable, cada grupo
          lleva su título: si no, el orden está pero no se ve. */}
      {(grupos || [{ tareas: tasks }]).map((g, gi) => (
      <div key={g.clave || gi}>
      {g.titulo && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 16px", background: colors.bg, borderBottom: `1px solid ${colors.neutralSoft}`, borderTop: gi ? `1px solid ${colors.border}` : "none" }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: g.color || colors.brand }} />
          <span style={{ fontSize: 11.5, fontWeight: 700, color: colors.ink }}>{g.titulo}</span>
          <span style={{ fontSize: 11, color: colors.muted }}>{g.tareas.length}</span>
        </div>
      )}
      {g.tareas.map(t => {
        const proy = t.lead_id ? { name: leads[t.lead_id] || "Pipeline" } : gP(t.project_id);
        const asig = t.assignee_id ? gU(t.assignee_id) : null;
        const pC = PRIORIDAD[t.priority] || PRIORIDAD.media;
        const eC = ESTADO[t.status] || ESTADO.pendiente;
        return (
          <div key={t.id} className="tabla-row" style={row} onClick={() => onEditar(t)}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: proy?.color || colors.brand }} />
            <div style={{ minWidth: 0, opacity: t.status === "listo" ? 0.55 : 1 }}>
              <div style={{ display: "flex", alignItems: "center", minWidth: 0 }}>
                {t.privada && <MarcaPrivada />}
                <span style={{ fontSize: 13, fontWeight: 500, color: colors.ink, textDecoration: t.status === "listo" ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
              </div>
              {/* La nota automática —"Gestión de Villa Fontana"— repite la
                  columna PROYECTO que está al lado. Se muestra solo lo que
                  alguien escribió de verdad. */}
              {t.notes && !/^(Gestión|Actividad) de /.test(t.notes) && (
                <div title={t.notes} style={{ fontSize: 11, color: colors.muted, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.notes}</div>
              )}
            </div>
            <span style={{ fontSize: 12, color: colors.inkSoft, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{proy?.name}</span>
            {asig ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
                <Avatar name={asig.name} size={16} color={asig.color || colors.brand} />
                <span style={{ fontSize: 12, color: colors.inkSoft, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{asig.name}</span>
              </div>
            ) : t.responsable_externo ? (
              <span style={{ fontSize: 12, color: colors.inkSoft, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.responsable_externo} · de afuera</span>
            ) : (
              /* Sin dueño no es un detalle gris: es lo que hay que resolver
                 antes de que la fecha se venga encima. */
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.3, color: "#fff", background: colors.danger, borderRadius: 4, padding: "2px 6px", whiteSpace: "nowrap" }}>
                SIN RESPONSABLE
              </span>
            )}
            <span style={{ fontSize: 11, fontWeight: 600, color: pC.color, background: pC.bg, padding: "2px 8px", borderRadius: 20, width: "fit-content" }}>{pC.label}</span>
            <span style={{ fontSize: 12, color: eC.color }}>{eC.label}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: fechaColor(t) }}>{fechaLabel(t)}</span>
          </div>
        );
      })}
      </div>
      ))}
    </div>
  );
}
