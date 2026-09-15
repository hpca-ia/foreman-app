import { useState, useRef } from "react";
import { Pencil, X, Building2, Upload } from "lucide-react";
import { supabase } from "../lib/supabase";
import { saveToStorage } from "../lib/storage";
import { guardarUsuario, desactivarUsuario, guardarProyecto, desactivarProyecto, asignarProyectosAUsuario, TIPOS_PROYECTO } from "../lib/equipo";
import { esAdmin } from "../lib/roles";
import { rolInfo } from "../lib/roles";
import Modal from "./ui/Modal";
import Avatar from "./ui/Avatar";
import Button from "./ui/Button";
import { inputStyle } from "./ui/Input";
import UserForm from "./UserForm";
import PanelPermisos from "./PanelPermisos";
import ProjectForm from "./ProjectForm";

export default function PanelAjustes({ usuario, permisos, setPermisos, equipoRemoto = true, onEquipoCambio = () => {}, users, setUsers, projects, setProjects, empresa, setEmpresa, onClose }) {
  const [tab, setTab] = useState("empresa");
  const [editU, setEditU] = useState(null);
  const [editP, setEditP] = useState(null);
  const [newU, setNewU] = useState(false);
  const [newP, setNewP] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoRef = useRef(null);
  const emptyUser = { id: Date.now(), name: "", role: "residente", pin: "", avatar: "", color: "#0F3D3E" };
  const emptyProject = { id: Date.now(), name: "", color: "#0F3D3E", tipo: "otro", miembros: [] };
  const [errEquipo, setErrEquipo] = useState("");

  function saveEmpresa(updated) { setEmpresa(updated); saveToStorage("foreman_empresa", updated); }

  async function uploadLogo(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingLogo(true);
    const ext = file.name.split(".").pop();
    const path = `empresa/logo.${ext}`;
    await supabase.storage.from("task-files").remove([path]);
    const { error } = await supabase.storage.from("task-files").upload(path, file, { upsert: true });
    if (!error) {
      const { data } = supabase.storage.from("task-files").getPublicUrl(path);
      saveEmpresa({ ...empresa, logoUrl: data.publicUrl + "?t=" + Date.now() });
    }
    setUploadingLogo(false);
    e.target.value = "";
  }

  // Usuarios y proyectos se guardan en la base, no en este navegador: lo que se
  // cambia acá lo ven todos los equipos al refrescar.
  async function saveUser(u) {
    setErrEquipo("");
    const existe = users.some(x => x.id === u.id);
    const id = existe ? u.id : Date.now();
    const { error } = await guardarUsuario({ ...u, id });
    if (error) { setErrEquipo("No se pudo guardar el usuario: " + error.message); return; }
    // Los admins ven todo: sus membresías no se tocan desde acá.
    if (!esAdmin(u.role) && Array.isArray(u.proyectos)) {
      const r = await asignarProyectosAUsuario(id, u.proyectos, projects.map(p => p.id));
      if (r.error) { setErrEquipo("El usuario se guardó, pero sus proyectos no: " + r.error.message); onEquipoCambio(); return; }
    }
    setEditU(null); setNewU(false); onEquipoCambio();
  }
  async function deleteUser(id) {
    if (!window.confirm("¿Quitar este usuario?\n\nSu historial y sus tareas no se borran: deja de poder entrar y de aparecer en las listas.")) return;
    const { error } = await desactivarUsuario(id);
    if (error) { setErrEquipo("No se pudo quitar: " + error.message); return; }
    onEquipoCambio();
  }
  async function saveProject(p) {
    setErrEquipo("");
    const existe = projects.some(x => x.id === p.id);
    const { error } = await guardarProyecto({ ...p, id: existe ? p.id : Date.now() }, usuario?.id);
    if (error) { setErrEquipo("No se pudo guardar el proyecto: " + error.message); return; }
    setEditP(null); setNewP(false); onEquipoCambio();
  }
  async function deleteProject(id) {
    if (!window.confirm("¿Quitar este proyecto?\n\nSus tareas no se borran.")) return;
    const { error } = await desactivarProyecto(id);
    if (error) { setErrEquipo("No se pudo quitar: " + error.message); return; }
    onEquipoCambio();
  }

  const avisoEquipo = (
    <>
      {!equipoRemoto && (
        <div style={{ background: "var(--warning-soft)", border: "1px solid var(--warning-border)", color: "var(--warning)", borderRadius: "var(--radius-sm)", padding: "8px 10px", fontSize: 12, marginBottom: 10 }}>
          Falta correr la migración 009 en Supabase. Hasta entonces esta lista es solo de este equipo y no se puede guardar.
        </div>
      )}
      {errEquipo && <div style={{ color: "var(--danger)", fontSize: 12, marginBottom: 10 }}>{errEquipo}</div>}
    </>
  );

  const tabS = a => ({ padding: "7px 16px", borderRadius: "var(--radius-sm)", border: "none", cursor: "pointer", fontFamily: "var(--font)", fontSize: 12, fontWeight: 600, background: a ? "var(--brand)" : "transparent", color: a ? "#fff" : "var(--ink-soft)" });
  const lS = { color: "var(--ink-soft)", fontSize: 11, fontWeight: 500, marginBottom: 4, display: "block" };
  const iconBtn = { background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "4px 8px", color: "var(--ink-soft)", cursor: "pointer", marginRight: 4, display: "inline-flex" };
  const deleteBtn = { background: "var(--danger-soft)", border: "1px solid var(--danger-border)", borderRadius: "var(--radius-sm)", padding: "4px 8px", color: "var(--danger)", cursor: "pointer", display: "inline-flex" };

  return (
    <Modal onClose={onClose} maxWidth={500}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>Ajustes</div>
        <button onClick={onClose} style={{ background: "var(--neutral-soft)", border: "none", borderRadius: "var(--radius-sm)", width: 28, height: 28, color: "var(--ink-soft)", cursor: "pointer", fontSize: 15 }}>×</button>
      </div>
      <div style={{ display: "flex", gap: 4, marginBottom: 16, background: "var(--neutral-soft)", borderRadius: "var(--radius-sm)", padding: 4 }}>
        <button onClick={() => setTab("empresa")} style={tabS(tab === "empresa")}>Empresa</button>
        <button onClick={() => setTab("usuarios")} style={tabS(tab === "usuarios")}>Usuarios</button>
        <button onClick={() => setTab("proyectos")} style={tabS(tab === "proyectos")}>Proyectos</button>
        {usuario?.role === "owner" && <button onClick={() => setTab("permisos")} style={tabS(tab === "permisos")}>Permisos</button>}
      </div>

      {tab === "permisos" && usuario?.role === "owner" && <PanelPermisos permisos={permisos} setPermisos={setPermisos} />}

      {tab === "empresa" && (
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ background: "var(--bg)", borderRadius: "var(--radius-md)", padding: 14, border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-soft)", marginBottom: 10 }}>Logo de la empresa</div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              {empresa.logoUrl ? (
                <img src={empresa.logoUrl} alt="Logo" style={{ width: 64, height: 64, objectFit: "contain", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "#fff", padding: 4 }} />
              ) : (
                <div style={{ width: 64, height: 64, background: "var(--neutral-soft)", borderRadius: "var(--radius-sm)", border: "1.5px dashed var(--border)", display: "flex", alignItems: "center", justifyContent: "center" }}><Building2 size={22} color="var(--muted)" /></div>
              )}
              <div>
                <Button variant="primary" size="sm" style={{ marginBottom: 6 }} onClick={() => logoRef.current?.click()} disabled={uploadingLogo}>
                  <Upload size={12} /> {uploadingLogo ? "Subiendo..." : "Subir logo"}
                </Button>
                <div style={{ fontSize: 10, color: "var(--muted)" }}>PNG, JPG o SVG. Máx 2MB.</div>
                <input ref={logoRef} type="file" accept="image/*" onChange={uploadLogo} style={{ display: "none" }} />
              </div>
            </div>
          </div>
          {[
            { k: "nombre", l: "Nombre de la empresa", ph: "HCA Studio" },
            { k: "tipo", l: "Tipo de negocio", ph: "Construcción, Inmobiliaria..." },
            { k: "email", l: "Email de contacto", ph: "info@empresa.com" },
            { k: "telefono", l: "Teléfono", ph: "+593 99 999 9999" },
            { k: "web", l: "Sitio web", ph: "www.empresa.com" },
            { k: "ciudad", l: "Ciudad", ph: "Quito, Ecuador" },
            { k: "moneda", l: "Moneda", ph: "USD" },
          ].map(f => (
            <div key={f.k}>
              <label style={lS}>{f.l}</label>
              <input value={empresa?.[f.k] || ""} onChange={e => saveEmpresa({ ...empresa, [f.k]: e.target.value })} placeholder={f.ph} style={inputStyle} />
            </div>
          ))}
          <div>
            <label style={lS}>Color principal de la marca</label>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input type="color" value={empresa?.color || "#0F3D3E"} onChange={e => saveEmpresa({ ...empresa, color: e.target.value })} style={{ width: 48, height: 36, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", cursor: "pointer", padding: 2 }} />
              <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>Este color se aplica en toda la app</div>
            </div>
          </div>
        </div>
      )}

      {tab === "usuarios" && (
        <div>
          {avisoEquipo}
          {users.map(u => editU?.id === u.id ? (
            <UserForm key={u.id} u={editU} projects={projects} onSave={saveUser} onCancel={() => setEditU(null)} />
          ) : (
            <div key={u.id} style={{ background: "var(--bg)", borderRadius: "var(--radius-md)", padding: "10px 12px", marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
              <Avatar name={u.name} size={36} color={u.color || "#0F3D3E"} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{u.name}</div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>{rolInfo(u.role).label}{!esAdmin(u.role) && ` · ${projects.filter(p => (p.miembros || []).includes(u.id)).length} proyecto${projects.filter(p => (p.miembros || []).includes(u.id)).length === 1 ? "" : "s"}`}{u.email ? ` · ${u.email}` : ""}{!u.pin_hash && !u.pin && <span style={{ color: "var(--warning)" }}> · sin PIN</span>}</div>
              </div>
              <button onClick={() => setEditU({ ...u, pin: "", proyectos: projects.filter(p => (p.miembros || []).includes(u.id)).map(p => p.id) })} style={iconBtn}><Pencil size={13} /></button>
              {u.role !== "owner" && <button onClick={() => deleteUser(u.id)} style={deleteBtn}><X size={13} /></button>}
            </div>
          ))}
          {newU ? <UserForm u={emptyUser} esNuevo projects={projects} onSave={saveUser} onCancel={() => setNewU(false)} /> : (
            <button onClick={() => setNewU(true)} style={{ width: "100%", background: "var(--bg)", border: "1.5px dashed var(--border)", borderRadius: "var(--radius-md)", padding: 10, color: "var(--ink-soft)", fontSize: 13, cursor: "pointer", fontWeight: 500 }}>+ Agregar usuario</button>
          )}
        </div>
      )}

      {tab === "proyectos" && (
        <div>
          {avisoEquipo}
          {projects.map(p => editP?.id === p.id ? (
            <ProjectForm key={p.id} p={editP} users={users} onSave={saveProject} onCancel={() => setEditP(null)} />
          ) : (
            <div key={p.id} style={{ background: "var(--bg)", borderRadius: "var(--radius-md)", padding: "10px 12px", marginBottom: 8, display: "flex", alignItems: "center", gap: 10, borderLeft: `3px solid ${p.color}` }}>
              <div style={{ width: 12, height: 12, borderRadius: "50%", background: p.color, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{p.name}</div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>
                  {TIPOS_PROYECTO.find(t => t.id === p.tipo)?.label || "Otro"} · {(p.miembros || []).length ? `${p.miembros.length} miembro${p.miembros.length === 1 ? "" : "s"}` : "sin miembros — solo lo ven los admins"}
                </div>
              </div>
              <button onClick={() => setEditP({ ...p })} style={iconBtn}><Pencil size={13} /></button>
              <button onClick={() => deleteProject(p.id)} style={deleteBtn}><X size={13} /></button>
            </div>
          ))}
          {newP ? <ProjectForm p={emptyProject} users={users} onSave={saveProject} onCancel={() => setNewP(false)} /> : (
            <button onClick={() => setNewP(true)} style={{ width: "100%", background: "var(--bg)", border: "1.5px dashed var(--border)", borderRadius: "var(--radius-md)", padding: 10, color: "var(--ink-soft)", fontSize: 13, cursor: "pointer", fontWeight: 500 }}>+ Agregar proyecto</button>
          )}
        </div>
      )}
    </Modal>
  );
}
