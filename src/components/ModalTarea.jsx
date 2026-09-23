import { useState } from "react";
import { guardarProyecto } from "../lib/equipo";
import { esAdmin } from "../lib/roles";
import { TIPOS, PRIORIDAD, ESTADO_NUEVO } from "../theme/constants";
import { colors } from "../theme/colors";
import Modal from "./ui/Modal";
import Button from "./ui/Button";
import { inputStyle } from "./ui/Input";
import ComentariosTarea from "./ComentariosTarea";
import InlineFiles from "./InlineFiles";
import DependenciasTarea from "./DependenciasTarea";
import Avatar from "./ui/Avatar";

export default function ModalTarea({ puede, onCerrar, onGuardar, editTask, currentUser, users, projects, proyectosElegibles, asignables: asignablesApp, onProyectoCreado, onEliminar, acompanantes = [], tareas = [], onCambio }) {
  const admin = puede("tareas.asignar");
  const [form, setForm] = useState(editTask ? {
    title: editTask.title, project_id: editTask.project_id, assignee_id: editTask.assignee_id,
    type: editTask.type, due_date: editTask.due_date, priority: editTask.priority,
    status: editTask.status, notes: editTask.notes || "", privada: !!editTask.privada, enlace: editTask.enlace || "",
    es_aprobacion: !!editTask.es_aprobacion,
  } : { title: "", project_id: (proyectosElegibles || projects)[0]?.id ?? null, assignee_id: currentUser.id, type: "Llamada", due_date: "", priority: "media", status: ESTADO_NUEVO, notes: "", privada: false, enlace: "", es_aprobacion: false });
  const inp = (f, v) => setForm(p => ({ ...p, [f]: v }));
  // Los que acompañan al responsable principal: el plano lo hacen dos.
  const [conmigo, setConmigo] = useState(acompanantes);
  const alternarAcompanante = id => setConmigo(x => (x.includes(id) ? x.filter(i => i !== id) : [...x, id]));
  const soyAdmin = esAdmin(currentUser.role);
  // A quién se puede asignar. Con el permiso de asignar, a cualquiera. Sin él,
  // manda el proyecto: si hay uno elegido, solo sus miembros —para no mandarle
  // a alguien una tarea de una obra donde no está—; sin proyecto, uno mismo y
  // todos sus compañeros, la misma lista que usa NOVA. Al editar se agrega el
  // asignado actual para que el menú no lo muestre en blanco.
  const puedeAsignarATodos = puede("tareas.asignar");
  // La fecha se pone al crear la tarea; correrla después es decisión de quien
  // lleva el proyecto. Sin el permiso, el campo queda a la vista pero cerrado:
  // esconderlo haría creer que la tarea no tiene fecha.
  const puedeMoverFecha = !editTask || puede("tareas.fechas");
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
            <div style={{ fontSize: 10, color: colors.muted, marginTop: 5 }}>Nace en el pipeline como lead (L). Ahí se le pone el tubo —Arquitectura o Construcción— cuando corresponda.</div>
          </div>
        )}
        <div>
          <label style={lS}>Con quién más</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {asignables.filter(u => u.id !== form.assignee_id).map(u => {
              const on = conmigo.includes(u.id);
              return (
                <button key={u.id} type="button" onClick={() => alternarAcompanante(u.id)}
                  style={{ display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${on ? colors.ink : colors.border}`, background: on ? colors.ink : "#fff",
                    color: on ? "#fff" : colors.inkSoft, borderRadius: 20, padding: "3px 10px 3px 4px", fontSize: 11.5, cursor: "pointer", fontFamily: colors.font }}>
                  <Avatar name={u.name} size={16} color={u.color || colors.brand} /> {u.name}
                </button>
              );
            })}
            {!asignables.filter(u => u.id !== form.assignee_id).length && <span style={{ fontSize: 11, color: colors.muted }}>No hay más gente a quien sumar.</span>}
          </div>
          <div style={{ fontSize: 10, color: colors.muted, marginTop: 5 }}>Los recordatorios y la carga se cuentan al responsable principal; los demás la ven como suya y la pueden mover.</div>
        </div>
        <div>
          <label style={lS}>Fecha límite *</label>
          <input type="date" value={form.due_date} onChange={e => inp("due_date", e.target.value)} disabled={!puedeMoverFecha}
            title={puedeMoverFecha ? "" : "La fecha la mueve el Director o quien tenga ese permiso"}
            style={{ ...inputStyle, ...(puedeMoverFecha ? {} : { background: colors.bg, color: colors.inkSoft, cursor: "not-allowed" }) }} />
          {!puedeMoverFecha && <div style={{ fontSize: 10.5, color: colors.muted, marginTop: 3 }}>La mueve el Director o quien tenga ese permiso.</div>}
        </div>
        {/* Pedir una aprobación es pedir una tarea: la misma lista, la misma
            fecha, pero se cierra aprobando o devolviendo, no con un check. */}
        <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: colors.inkSoft, cursor: "pointer", background: form.es_aprobacion ? colors.brandSoft : colors.bg, borderRadius: colors.radiusSm, padding: "8px 10px", lineHeight: 1.4 }}>
          <input type="checkbox" checked={!!form.es_aprobacion} onChange={e => inp("es_aprobacion", e.target.checked)} style={{ marginTop: 2 }} />
          <span>
            <strong style={{ color: colors.ink }}>Pide una aprobación</strong> — quien la reciba la aprueba o la devuelve con un comentario, en vez de marcarla completada. Queda anotado quién decidió y cuándo.
          </span>
        </label>
        {soyAdmin && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: colors.inkSoft, cursor: "pointer" }}>
            <input type="checkbox" checked={!!form.privada} onChange={e => inp("privada", e.target.checked)} />
            Privada — solo la ven los admins y la persona asignada
          </label>
        )}
        <div><label style={lS}>Notas</label><textarea value={form.notes} onChange={e => inp("notes", e.target.value)} placeholder="Proveedor, contacto, contexto..." style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} /></div>
        {/* Lo que hace falta para hacerla: un enlace a Drive o Dropbox, o el
            del proveedor. Subirlo otra vez sería duplicarlo. */}
        <div>
          <label style={lS}>Enlace</label>
          <input value={form.enlace || ""} onChange={e => inp("enlace", e.target.value)} placeholder="https://… plano, carpeta o documento" style={inputStyle} />
        </div>
      </fieldset>

      {/* Fotos y PDF de la tarea. Necesitan que la tarea exista: un archivo se
          guarda con su número, y una tarea sin guardar todavía no lo tiene. */}
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${colors.neutralSoft}` }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: colors.ink, marginBottom: 6 }}>Archivos</div>
        {editTask
          ? <InlineFiles taskId={editTask.id} />
          : <div style={{ fontSize: 11.5, color: colors.muted }}>Guarda la tarea y acá mismo podrás subir fotos y PDF. Mientras tanto, puedes dejar un enlace arriba.</div>}
      </div>

      {/* Comentar se puede siempre: justamente el que no puede editar la tarea
          es el que más necesita decir por qué está parada. */}
      {editTask && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${colors.neutralSoft}` }}>
          <DependenciasTarea tarea={editTask} currentUser={currentUser} users={asignables} tareas={tareas}
            soloLectura={soloLectura} onCambio={onCambio} />
        </div>
      )}

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
        : <Button variant="primary" size="lg" style={{ width: "100%", marginTop: 16 }} onClick={() => { onGuardar({ ...form, _acompanantes: conmigo }, editTask?.id); onCerrar(); }}>
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
