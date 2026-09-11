import { ChevronRight } from "lucide-react";
import { colors } from "../theme/colors";
import { PRIORIDAD, ESTADO } from "../theme/constants";
import FechaBadge from "./FechaBadge";

// La vista de lista en el teléfono. Las tarjetas sirven para trabajar una
// tarea —cambiar estado, subir un archivo—; esto sirve para ver veinte de un
// vistazo y decidir cuál abrir. Por eso cada fila es una línea y media y lo
// único que hace es abrir la tarea.
export default function TareasListaMovil({ tasks, users, projects, onEditar }) {
  return (
    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, overflow: "hidden" }}>
      {tasks.map((t, i) => {
        const listo = t.status === "listo";
        const pri = PRIORIDAD[t.priority] || PRIORIDAD.media;
        const proyecto = projects.find(p => p.id === t.project_id)?.name;
        const persona = users.find(u => u.id === t.assignee_id)?.name;

        return (
          <div key={t.id} onClick={() => onEditar(t)}
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "11px 12px",
              borderTop: i === 0 ? "none" : `1px solid ${colors.neutralSoft}`,
              cursor: "pointer", opacity: listo ? 0.6 : 1,
            }}>
            <span style={{ width: 4, alignSelf: "stretch", borderRadius: 3, background: pri.color || colors.border, flexShrink: 0 }} />

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 13, fontWeight: 600, color: colors.ink,
                textDecoration: listo ? "line-through" : "none",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>{t.title}</div>
              <div style={{ fontSize: 11, color: colors.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {[proyecto, persona, ESTADO[t.status]?.label].filter(Boolean).join(" · ")}
              </div>
            </div>

            <span style={{ flexShrink: 0 }}><FechaBadge due={t.due_date} status={t.status} /></span>
            <ChevronRight size={14} color={colors.border} style={{ flexShrink: 0 }} />
          </div>
        );
      })}
    </div>
  );
}
