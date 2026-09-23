import { ChevronRight } from "lucide-react";
import { colors } from "../theme/colors";
import { PRIORIDAD, ESTADO } from "../theme/constants";
import FechaBadge from "./FechaBadge";
import MarcaPrivada from "./ui/MarcaPrivada";

// La vista de lista en el teléfono. Las tarjetas sirven para trabajar una
// tarea —cambiar estado, subir un archivo—; esto sirve para ver veinte de un
// vistazo y decidir cuál abrir. Por eso cada fila es una línea y media y lo
// único que hace es abrir la tarea.
export default function TareasListaMovil({ tasks, users, projects, leads = {}, comentarios = {}, grupos = null, onEditar }) {
  return (
    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, overflow: "hidden" }}>
      {(grupos || [{ tareas: tasks }]).map((g, gi) => (
      <div key={g.clave || gi}>
      {g.titulo && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 12px", background: colors.bg, borderTop: gi ? `1px solid ${colors.border}` : "none" }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: g.color || colors.brand }} />
          <span style={{ fontSize: 11.5, fontWeight: 700, color: colors.ink }}>{g.titulo}</span>
          <span style={{ fontSize: 11, color: colors.muted }}>{g.tareas.length}</span>
        </div>
      )}
      {g.tareas.map((t, i) => {
        const listo = t.status === "listo";
        const pri = PRIORIDAD[t.priority] || PRIORIDAD.media;
        const proy = t.lead_id ? { name: leads[t.lead_id] || "Pipeline", color: null } : projects.find(p => p.id === t.project_id);
        const proyecto = proy?.name;
        const persona = users.find(u => u.id === t.assignee_id)?.name;

        return (
          <div key={t.id} onClick={() => onEditar(t)}
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "11px 12px",
              borderTop: i === 0 ? "none" : `1px solid ${colors.neutralSoft}`,
              cursor: "pointer", opacity: listo ? 0.6 : 1,
            }}>
            {/* La barra es del color del proyecto: de un vistazo se ve de cuál
                es cada tarea. La urgencia ya se ve en su etiqueta. */}
            <span style={{ width: 4, alignSelf: "stretch", borderRadius: 3, background: proy?.color || pri.color || colors.border, flexShrink: 0 }} />

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 13, fontWeight: 600, color: colors.ink,
                textDecoration: listo ? "line-through" : "none",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>{t.privada && <MarcaPrivada />}{t.title}</div>
              <div style={{ fontSize: 11, color: colors.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {[proyecto, persona, ESTADO[t.status]?.label, comentarios[t.id] ? `${comentarios[t.id]} comentario${comentarios[t.id] === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ")}
              </div>
              {t.notes && <div style={{ fontSize: 11, color: colors.inkSoft, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.notes}</div>}
            </div>

            <span style={{ flexShrink: 0 }}><FechaBadge due={t.due_date} status={t.status} /></span>
            <ChevronRight size={14} color={colors.border} style={{ flexShrink: 0 }} />
          </div>
        );
      })}
      </div>
      ))}
    </div>
  );
}
