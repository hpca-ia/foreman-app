import { useState } from "react";
import { TIPOS, PRIORIDAD } from "../theme/constants";
import { colors } from "../theme/colors";
import Modal from "./ui/Modal";
import Button from "./ui/Button";
import { inputStyle } from "./ui/Input";

export default function ModalTarea({ puede, onCerrar, onGuardar, editTask, currentUser, users, projects }) {
  const admin = puede("tareas.asignar");
  const [form, setForm] = useState(editTask ? {
    title: editTask.title, project_id: editTask.project_id, assignee_id: editTask.assignee_id,
    type: editTask.type, due_date: editTask.due_date, priority: editTask.priority,
    status: editTask.status, notes: editTask.notes || "",
  } : { title: "", project_id: projects[0]?.id || 1, assignee_id: currentUser.id, type: "Llamada", due_date: "", priority: "media", status: "pendiente", notes: "" });
  const inp = (f, v) => setForm(p => ({ ...p, [f]: v }));
  const lS = { color: colors.muted, fontSize: 11, fontWeight: 500, marginBottom: 4, display: "block" };

  return (
    <Modal onClose={onCerrar} maxWidth={480}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: colors.ink }}>{editTask ? "Editar tarea" : "Nueva tarea"}</div>
        <button onClick={onCerrar} style={{ background: colors.neutralSoft, border: "none", borderRadius: colors.radiusSm, width: 28, height: 28, color: colors.inkSoft, cursor: "pointer", fontSize: 15 }}>×</button>
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        <div><label style={lS}>Título *</label><input value={form.title} onChange={e => inp("title", e.target.value)} placeholder="¿Qué hay que hacer?" style={inputStyle} /></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div><label style={lS}>Proyecto</label><select value={form.project_id} onChange={e => inp("project_id", Number(e.target.value))} style={inputStyle}>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div><label style={lS}>Tipo</label><select value={form.type} onChange={e => inp("type", e.target.value)} style={inputStyle}>{TIPOS.map(t => <option key={t}>{t}</option>)}</select></div>
          <div><label style={lS}>Asignar a</label><select value={form.assignee_id || ""} onChange={e => inp("assignee_id", e.target.value ? Number(e.target.value) : null)} style={inputStyle}><option value="">Sin asignar</option>{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
          <div><label style={lS}>Prioridad</label><select value={form.priority} onChange={e => inp("priority", e.target.value)} style={inputStyle} disabled={!admin}>{Object.entries(PRIORIDAD).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
        </div>
        <div><label style={lS}>Fecha límite *</label><input type="date" value={form.due_date} onChange={e => inp("due_date", e.target.value)} style={inputStyle} /></div>
        <div><label style={lS}>Notas</label><textarea value={form.notes} onChange={e => inp("notes", e.target.value)} placeholder="Proveedor, contacto, contexto..." style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} /></div>
      </div>
      {(!form.title || !form.due_date) ? <div style={{ color: colors.muted, fontSize: 11, marginTop: 12, textAlign: "center" }}>Completa título y fecha</div>
        : <Button variant="primary" size="lg" style={{ width: "100%", marginTop: 16 }} onClick={() => { onGuardar(form, editTask?.id); onCerrar(); }}>
            {editTask ? "Guardar cambios" : "Agregar tarea"}
          </Button>}
    </Modal>
  );
}
