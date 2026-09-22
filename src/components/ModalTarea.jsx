import { useState } from "react";
import { guardarProyecto } from "../lib/equipo";
import { esAdmin } from "../lib/roles";
import { TIPOS, PRIORIDAD, ESTADO_NUEVO } from "../theme/constants";
import { colors } from "../theme/colors";
import Modal from "./ui/Modal";
import Button from "./ui/Button";
import { inputStyle } from "./ui/Input";
import ComentariosTarea from "./ComentariosTarea";

export default function ModalTarea({ puede, onCerrar, onGuardar, editTask, currentUser, users, projects, proyectosElegibles, asignables: asignablesApp, onProyectoCreado, onEliminar }) {
  const admin = puede("tareas.asignar");
  const [form, setForm] = useState(editTask ? {
    title: editTask.title, project_id: editTask.project_id, assignee_id: editTask.assignee_id,
    type: editTask.type, due_date: editTask.due_date, priority: editTask.priority,
    status: editTask.status, notes: editTask.notes || "", privada: !!editTask.privada,
  } : { title: "", project_id: (proyectosElegibles || projects)[0]?.id ?? null, assignee_id: currentUser.id, type: "Llamada", due_date: "", priority: "media", status: ESTADO_NUEVO, notes: "", privada: false });
  const inp = (f, v) => setForm(p => ({ ...p, [f]: v }));
  const soyAdmin = esAdmin(currentUser.role);
  // A quién se puede asignar. Con el permiso de asignar, a cualquiera. Sin él,
  // manda el proyecto: si hay uno elegido, solo sus miembros —para no mandarle
  // a alguien una tarea de una obra donde no está—; sin proyecto, uno mismo y
  // todos sus compañeros, la misma lista que usa NOVA. Al editar se agrega el
  // asignado actual para que el menú no lo muestre en blanco.
  const puedeAsignarATodos = puede("tareas.asignar");
  const asignablesPara = projectId => {
    if (puedeAsignarATodos) return users;
    const p = projects.find(x => x.id === projectId);
    if (p) return users.filter(u => (p.miembros || []).includes(u.id));
    return asignablesApp || users.filter(u => u.id === currentUser.id);
  };
  const baseAsignables = asignablesPara(form.project_id);
  const actualAsignado = users.find(u => u.id === editTask?.assignee_id);
  const asignables = actualAsignado && !baseAsignables.some(u => u.id === actualAsignado.id) ? [...baseAsignables, actualAsignado] : baseAsignables;

  function elegirProyecto(valor) {
    if (valor === "__nuevo__") { setCreandoP(true); return; }
    const id = valor ? Number(valor) : null;
    const lista = asignablesPara(id);
    setForm(f => ({
      ...f, project_id: id,
      // Si el asignado no es de ese proyecto, la tarea vuelve a quien la crea.
      assignee_id: f.assignee_id == null || lista.some(u => u.id === f.assignee_id) ? f.assignee_id
        : (lista.some(u => u.id === currentUser.id) ? currentUser.id : null),
    }));
  }
  // Ver no es tocar: la tarea de otra persona se abre, pero solo la cambia
  // quien la tiene asignada, quien la creó o un admin.
  const soloLectura = !!editTask && !soyAdmin && editTask.assignee_id !== currentUser.id && editTask.created_by !== currentUser.id;
  const [creandoP, setCreandoP] = useState(false);
  const [nombreP, setNombreP] = useState("");
  const [errP, setErrP] = useState("");
  const puedeCrearProyecto = esAdmin(currentUser.role);

  // Solo los proyectos donde uno está, más el de la tarea si se está editando
  // una que viene de otro proyecto: si no, el menú la mostraría en blanco.
  const base = proyectosElegibles || projects;
  const actual = projects.find(p => p.id === form.project_id);
  const opciones = actual && !base.some(p => p.id === actual.id) ? [...base, actual] : base;

  // Crear el proyecto sin salir de la tarea. Quedan como miembros quien lo
  // crea y a quien se le asigna, que es lo mínimo para que ambos lo vean.
  async function crearProyecto() {
    const nombre = nombreP.trim();
    if (!nombre) return;
    const id = Date.now();
    const { error } = await guardarProyecto(
      { id, name: nombre, color: "#0F3D3E", tipo: "otro", miembros: [currentUser.id, form.assignee_id].filter(Boolean) },
      currentUser.id
    );
    if (error) { setErrP("No se pudo crear: " + error.message); return; }
    await onProyectoCreado?.();
    inp("project_id", id); setCreandoP(false); setNombreP(""); setErrP("");
  }
  const lS = { color: colors.muted, fontSize: 11, fontWeight: 500, marginBottom: 4, display: "block" };

  return (
    <Modal onClose={onCerrar} maxWidth={480}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: colors.ink }}>{soloLectura ? "Tarea" : editTask ? "Editar tarea" : "Nueva tarea"}</div>
        <button onClick={onCerrar} style={{ background: colors.neutralSoft, border: "none", borderRadius: colors.radiusSm, width: 28, height: 28, color: colors.inkSoft, cursor: "pointer", fontSize: 15 }}>×</button>
      </div>
      <fieldset disabled={soloLectura} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: "grid", gap: 12 }}>
        <div><label style={lS}>Título *</label><input value={form.title} onChange={e => inp("title", e.target.value)} placeholder="¿Qué hay que hacer?" style={inputStyle} /></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div><label style={lS}>Proyecto</label><select value={form.project_id ?? ""} onChange={e => elegirProyecto(e.target.value)} style={inputStyle}>
            <option value="">Sin proyecto</option>
            {opciones.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            {puedeCrearProyecto && <option value="__nuevo__">+ Nuevo proyecto…</option>}
          </select></div>
          <div><label style={lS}>Tipo</label><select value={form.type} onChange={e => inp("type", e.target.value)} style={inputStyle}>{TIPOS.map(t => <option key={t}>{t}</option>)}</select></div>
          <div><label style={lS}>Asignar a</label><select value={form.assignee_id || ""} onChange={e => inp("assignee_id", e.target.value ? Number(e.target.value) : null)} style={inputStyle}><option value="">Sin asignar</option>{asignables.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
          <div><label style={lS}>Prioridad</label><select value={form.priority} onChange={e => inp("priority", e.target.value)} style={inputStyle} disabled={!admin}>{Object.entries(PRIORIDAD).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
        </div>
        {creandoP && (
          <div style={{ background: colors.brandSoft, borderRadius: colors.radiusMd, padding: 10 }}>
            <label style={lS}>Nombre del proyecto nuevo</label>
            <div style={{ display: "flex", gap: 6 }}>
              <input value={nombreP} onChange={e => setNombreP(e.target.value)} onKeyDown={e => e.key === "Enter" && crearProyecto()} placeholder="Ej: Mensajería oficina" style={{ ...inputStyle, flex: 1 }} autoFocus />
              <Button variant="primary" size="sm" onClick={crearProyecto} disabled={!nombreP.trim()}>Crear</Button>
              <Button variant="outline" size="sm" onClick={() => { setCreandoP(false); setErrP(""); }}>×</Button>
            </div>
            {errP && <div style={{ color: colors.danger, fontSize: 11, marginTop: 5 }}>{errP}</div>}
            <div style={{ fontSize: 10, color: colors.muted, marginTop: 5 }}>El tipo y los miembros se ajustan después en Ajustes → Proyectos.</div>
          </div>
        )}
        <div><label style={lS}>Fecha límite *</label><input type="date" value={form.due_date} onChange={e => inp("due_date", e.target.value)} style={inputStyle} /></div>
        {soyAdmin && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: colors.inkSoft, cursor: "pointer" }}>
            <input type="checkbox" checked={!!form.privada} onChange={e => inp("privada", e.target.checked)} />
            Privada — solo la ven los admins y la persona asignada
          </label>
        )}
        <div><label style={lS}>Notas</label><textarea value={form.notes} onChange={e => inp("notes", e.target.value)} placeholder="Proveedor, contacto, contexto..." style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} /></div>
      </fieldset>

      {/* Comentar se puede siempre: justamente el que no puede editar la tarea
          es el que más necesita decir por qué está parada. */}
      {editTask && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${colors.neutralSoft}` }}>
          <ComentariosTarea taskId={editTask.id} currentUser={currentUser} />
        </div>
      )}

      {soloLectura ? (
        <div style={{ color: colors.muted, fontSize: 12, marginTop: 14, textAlign: "center" }}>
          Solo lectura: es una tarea de {users.find(u => u.id === editTask.assignee_id)?.name || "otra persona"}. La puede cambiar esa persona o un admin.
        </div>
      ) : (!form.title || !form.due_date) ? <div style={{ color: colors.muted, fontSize: 11, marginTop: 12, textAlign: "center" }}>Completa título y fecha</div>
        : <Button variant="primary" size="lg" style={{ width: "100%", marginTop: 16 }} onClick={() => { onGuardar(form, editTask?.id); onCerrar(); }}>
            {editTask ? "Guardar cambios" : "Agregar tarea"}
          </Button>}
      {editTask && soyAdmin && onEliminar && (
        <button onClick={async () => { if (await onEliminar(editTask.id)) onCerrar(); }}
          style={{ width: "100%", marginTop: 10, background: "transparent", border: `1px solid ${colors.dangerBorder}`, color: colors.danger, borderRadius: colors.radiusMd, padding: "9px 0", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: colors.font }}>
          Borrar tarea
        </button>
      )}
    </Modal>
  );
}
