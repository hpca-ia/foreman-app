import { Pencil, Trash2 } from "lucide-react";
import { PRIORIDAD, ESTADO } from "../theme/constants";
import { esAdmin } from "../lib/roles";
import { colors } from "../theme/colors";
import Avatar from "./ui/Avatar";
import FechaBadge from "./FechaBadge";
import InlineFiles from "./InlineFiles";
import WhatsAppDraftModal from "./WhatsAppDraftModal";

export default function TarjetaTarea({ task, currentUser, users, projects, onCambiarEstado, onEditar, onEliminar }) {
  const gP = id => projects.find(p => p.id === id);
  const gU = id => users.find(u => u.id === id);
  const proy = gP(task.project_id);
  const asig = task.assignee_id ? gU(task.assignee_id) : null;
  const crea = gU(task.created_by);
  const pC = PRIORIDAD[task.priority] || PRIORIDAD.media;
  const eC = ESTADO[task.status] || ESTADO.pendiente;
  const admin = esAdmin(currentUser.role);
  // Solo el asignado puede cambiar SU tarea. Admins pueden todo. Nadie puede cambiar la tarea de otro miembro.
  const esMiTarea = task.assignee_id === currentUser.id;
  const puedeCambiar = admin || esMiTarea;
  const esListo = task.status === "listo";

  function handleEstado(nuevoEstado) {
    if (!puedeCambiar) return;
    onCambiarEstado(task.id, nuevoEstado);
  }

  return (
    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: "10px 12px", marginBottom: 6, borderLeft: `3px solid ${proy?.color || colors.brand}`, opacity: esListo ? 0.6 : 1, fontFamily: colors.font, transition: "opacity 0.2s", boxShadow: "0 1px 2px rgba(0,0,0,0.03)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 5 }}>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ background: pC.bg, color: pC.color, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20 }}>{pC.label}</span>
          <span style={{ background: colors.neutralSoft, color: colors.inkSoft, fontSize: 11, padding: "2px 8px", borderRadius: 20 }}>{task.type}</span>
          <span style={{ color: eC.color, fontSize: 11 }}>{eC.label}</span>
        </div>
        <FechaBadge due={task.due_date} status={task.status} />
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: colors.ink, marginBottom: task.notes ? 4 : 6, lineHeight: 1.3 }}>{task.title}</div>
      {task.notes && <div style={{ color: colors.inkSoft, fontSize: 12, marginBottom: 8, lineHeight: 1.5 }}>{task.notes}</div>}
      <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", marginBottom: 6 }}>
        <span style={{ background: `${proy?.color}18`, color: proy?.color, fontSize: 11, padding: "2px 8px", borderRadius: 20, fontWeight: 600 }}>{proy?.name}</span>
        {asig ? <div style={{ display: "flex", alignItems: "center", gap: 4 }}><Avatar name={asig.name} size={18} color={asig.color || proy?.color} /><span style={{ color: colors.inkSoft, fontSize: 12 }}>{asig.name}</span></div>
          : <span style={{ color: colors.danger, fontSize: 11 }}>Sin asignar</span>}
        {!esListo && admin && <span style={{ color: colors.border, fontSize: 10 }}>{task.priority === "urgente" ? "c/3h" : task.priority === "alta" ? "c/6h" : "diario"}</span>}
        {crea && <span style={{ color: colors.border, fontSize: 10 }}>por {crea.name}</span>}
      </div>
      <InlineFiles taskId={task.id} />
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center", paddingTop: 6, borderTop: "1px solid #F3F4F6", marginTop: 4 }}>
        {puedeCambiar && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {Object.entries(ESTADO).map(([k, v]) => (
              <button key={k} onClick={() => handleEstado(k)}
                style={{ background: task.status === k ? v.color : colors.neutralSoft, border: `1px solid ${task.status === k ? v.color : colors.border}`, borderRadius: colors.radiusSm, padding: "4px 8px", color: task.status === k ? "#fff" : colors.inkSoft, fontSize: 10, fontWeight: task.status === k ? 600 : 400, cursor: "pointer", fontFamily: colors.font, whiteSpace: "nowrap", transition: "all 0.15s" }}>
                {v.label}
              </button>
            ))}
          </div>
        )}
        {admin && <button onClick={() => onEditar(task)} style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: colors.radiusSm, padding: "5px 8px", color: colors.inkSoft, cursor: "pointer", display: "flex", alignItems: "center" }}><Pencil size={13} /></button>}
        {admin && <WhatsAppDraftModal task={task} users={users} projects={projects} />}
        {admin && <button onClick={() => onEliminar(task.id)} style={{ background: colors.dangerSoft, border: "1px solid #F3C6C6", borderRadius: colors.radiusSm, padding: "5px 8px", color: colors.danger, cursor: "pointer", display: "flex", alignItems: "center" }}><Trash2 size={13} /></button>}
      </div>
    </div>
  );
}
