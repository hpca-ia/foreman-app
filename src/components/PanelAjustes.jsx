import { useState, useRef } from "react";
import { Pencil, X, Building2, Upload, KeyRound } from "lucide-react";
import { supabase } from "../lib/supabase";
import EtapasCatalogo from "./EtapasCatalogo";
import { BUCKET_PUBLICO } from "../lib/archivos";
import { saveToStorage } from "../lib/storage";
import { guardarUsuario, desactivarUsuario, guardarProyecto, desactivarProyecto, asignarProyectosAUsuario, TIPOS_PROYECTO } from "../lib/equipo";
import EmparejarProyectos from "./EmparejarProyectos";
import { esAdmin } from "../lib/roles";
import { avisarPinNuevo, avisarPermisos } from "../lib/avisoCuenta";
import { rolInfo } from "../lib/roles";
import Modal from "./ui/Modal";
import Avatar from "./ui/Avatar";
import Button from "./ui/Button";
import { inputStyle } from "./ui/Input";
import UserForm from "./UserForm";
import PanelPermisos from "./PanelPermisos";
import ProjectForm from "./ProjectForm";
import ProyectosDelPipeline from "./ProyectosDelPipeline";
import PermisosDeUsuario from "./PermisosDeUsuario";

/** Hace cuánto entró a FOREMAN por última vez, en palabras. */
function cuandoEntro(ts) {
  if (!ts) return "nunca entró";
  const dias = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
  const hora = new Date(ts).toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" });
  if (dias <= 0) return `entró hoy a las ${hora}`;
  if (dias === 1) return `entró ayer a las ${hora}`;
  if (dias < 7) return `entró hace ${dias} días`;
  if (dias < 30) return `entró hace ${Math.floor(dias / 7)} ${Math.floor(dias / 7) === 1 ? "semana" : "semanas"}`;
  return `entró el ${new Date(ts).toLocaleDateString("es-EC", { day: "numeric", month: "short", year: "numeric" })}`;
}
// Tres semanas sin entrar casi siempre significa que algo no le funciona y no
// lo dijo, así que se ve distinto.
const colorConexion = ts => {
  if (!ts) return "var(--warning)";
  const dias = (Date.now() - new Date(ts).getTime()) / 86400000;
  return dias > 21 ? "var(--warning)" : "var(--muted)";
};

export default function PanelAjustes({ usuario, permisos, setPermisos, permisosUsuario = {}, setPermisosUsuario = () => {}, equipoRemoto = true, onEquipoCambio = () => {}, users, setUsers, projects, setProjects, empresa, setEmpresa, onClose }) {
  // Qué persona tiene abiertos sus permisos: uno a la vez, que son muchos.
  const [permisosDe, setPermisosDe] = useState(null);
  const [probandoResumen, setProbandoResumen] = useState(false);
  const [resumenDijo, setResumenDijo] = useState("");
  const [tab, setTab] = useState("empresa");
  const [editU, setEditU] = useState(null);
  const [editP, setEditP] = useState(null);
  const [newU, setNewU] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoRef = useRef(null);
  const emptyUser = { id: Date.now(), name: "", role: "residente", pin: "", avatar: "", color: "#0F3D3E" };
  const [errEquipo, setErrEquipo] = useState("");
  const [okEquipo, setOkEquipo] = useState("");

  function saveEmpresa(updated) { setEmpresa(updated); saveToStorage("foreman_empresa", updated); }

  async function uploadLogo(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingLogo(true);
    const ext = file.name.split(".").pop();
    const path = `empresa/logo.${ext}`;
    // El logo va al depósito público: se muestra en correos y PDF, donde un
    // enlace que caduca se vería roto. El resto de archivos es privado.
    await supabase.storage.from(BUCKET_PUBLICO).remove([path]);
    const { error } = await supabase.storage.from(BUCKET_PUBLICO).upload(path, file, { upsert: true });
    if (!error) {
      const { data } = supabase.storage.from(BUCKET_PUBLICO).getPublicUrl(path);
      saveEmpresa({ ...empresa, logoUrl: data.publicUrl + "?t=" + Date.now() });
    }
    setUploadingLogo(false);
    e.target.value = "";
  }

  // Usuarios y proyectos se guardan en la base, no en este navegador: lo que se
  // cambia acá lo ven todos los equipos al refrescar.
  async function saveUser(u) {
    setErrEquipo("");
    const antes = users.find(x => x.id === u.id);
    const existe = !!antes;
    const id = existe ? u.id : Date.now();
    const { error } = await guardarUsuario({ ...u, id });
    if (error) { setErrEquipo("No se pudo guardar el usuario: " + error.message); return; }

    // Su clave y lo que puede hacer son cosas que tiene que saber. El PIN solo
    // se puede mandar ahora: en la base queda cifrado y no hay cómo volver a
    // leerlo.
    const avisos = [];
    if (u.pin) avisos.push(await avisarPinNuevo(id, u.pin));
    if (existe && antes.role !== u.role) avisos.push(await avisarPermisos(id, rolInfo(u.role).label, [`Ahora entras como ${rolInfo(u.role).label}, antes eras ${rolInfo(antes.role).label}.`]));
    const falla = avisos.find(a => a && a.ok === false);
    if (falla) setErrEquipo("El usuario se guardó, pero no se pudo avisar por correo: " + falla.error);
    else if (avisos.length) setOkEquipo(`Se le mandó el correo a ${u.name}.`);
    // Los admins ven todo: sus membresías no se tocan desde acá.
    if (!esAdmin(u.role) && Array.isArray(u.proyectos)) {
      const r = await asignarProyectosAUsuario(id, u.proyectos, projects.map(p => p.id));
      if (r.error) { setErrEquipo("El usuario se guardó, pero sus proyectos no: " + r.error.message); onEquipoCambio(); return; }
    }
    setEditU(null); setNewU(false); onEquipoCambio();
  }
  async function deleteUser(id) {
    setErrEquipo("");
    const { count: pendientes } = await supabase.from("tasks")
      .select("id", { count: "exact", head: true }).eq("assignee_id", id).neq("status", "listo");
    if (pendientes) {
      setErrEquipo(`No se puede quitar: tiene ${pendientes} ${pendientes === 1 ? "tarea pendiente" : "tareas pendientes"} a su cargo. Pásaselas a alguien más primero.`);
      return;
    }
    if (!window.confirm("¿Quitar este usuario?\n\nSu historial y sus tareas terminadas no se borran: deja de poder entrar y de aparecer en las listas.")) return;
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
  // Un proyecto con trabajo pendiente no se quita: sus tareas quedarían
  // huérfanas, sin nombre de proyecto y fuera de los filtros.
  async function deleteProject(id) {
    setErrEquipo("");
    const { count: pendientes } = await supabase.from("tasks")
      .select("id", { count: "exact", head: true }).eq("project_id", id).neq("status", "listo");
    if (pendientes) {
      setErrEquipo(`No se puede quitar: el proyecto tiene ${pendientes} ${pendientes === 1 ? "tarea pendiente" : "tareas pendientes"}. Termínalas o pásalas a otro proyecto primero.`);
      return;
    }
    const { count: hechas } = await supabase.from("tasks")
      .select("id", { count: "exact", head: true }).eq("project_id", id);
    if (!window.confirm(`¿Quitar este proyecto?\n\n${hechas ? `Sus ${hechas} tareas terminadas no se borran: quedan en el historial.` : "No tiene tareas."}`)) return;
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
      {okEquipo && <div style={{ color: "var(--success)", fontSize: 12, marginBottom: 10 }}>{okEquipo}</div>}
    </>
  );

  const tabS = a => ({ padding: "7px 16px", borderRadius: "var(--radius-sm)", border: "none", cursor: "pointer", fontFamily: "var(--font)", fontSize: 12, fontWeight: 600, background: a ? "var(--brand)" : "transparent", color: a ? "#fff" : "var(--ink-soft)" });
  const lS = { color: "var(--ink-soft)", fontSize: 11, fontWeight: 500, marginBottom: 4, display: "block" };
  const iconBtn = { background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "4px 8px", color: "var(--ink-soft)", cursor: "pointer", marginRight: 4, display: "inline-flex" };
  const deleteBtn = { background: "var(--danger-soft)", border: "1px solid var(--danger-border)", borderRadius: "var(--radius-sm)", padding: "4px 8px", color: "var(--danger)", cursor: "pointer", display: "inline-flex" };

  return (
    <Modal onClose={onClose} maxWidth={560}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>Ajustes</div>
        <button onClick={onClose} style={{ background: "var(--neutral-soft)", border: "none", borderRadius: "var(--radius-sm)", width: 28, height: 28, color: "var(--ink-soft)", cursor: "pointer", fontSize: 15 }}>×</button>
      </div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 16, background: "var(--neutral-soft)", borderRadius: "var(--radius-sm)", padding: 4 }}>
        <button onClick={() => setTab("empresa")} style={tabS(tab === "empresa")}>Empresa</button>
        <button onClick={() => setTab("usuarios")} style={tabS(tab === "usuarios")}>Usuarios</button>
        <button onClick={() => setTab("proyectos")} style={tabS(tab === "proyectos")}>Proyectos</button>
        {usuario?.role === "owner" && <button onClick={() => setTab("permisos")} style={tabS(tab === "permisos")}>Permisos</button>}
        {usuario?.role === "owner" && <button onClick={() => setTab("etapas")} style={tabS(tab === "etapas")}>Etapas</button>}
      </div>

      {tab === "permisos" && usuario?.role === "owner" && <PanelPermisos permisos={permisos} setPermisos={setPermisos} usuarios={users} />}
      {tab === "etapas" && usuario?.role === "owner" && <EtapasCatalogo />}

      {tab === "empresa" && (
        <div style={{ display: "grid", gap: 14 }}>
          {/* El resumen de la mañana sale solo; si algo está mal uno se entera
              al día siguiente. Con esto se lo pide cuando quiere. */}
          <div style={{ background: "var(--bg)", borderRadius: "var(--radius-md)", padding: 14, border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-soft)", marginBottom: 4 }}>Resumen de la mañana</div>
            <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 10, lineHeight: 1.5 }}>
              Sale de lunes a sábado a las 7:00: a cada quien lo suyo, y a los admins la foto del equipo.
              Probalo ahora y te llega a vos solo, con los datos de hoy.
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <Button variant="outline" size="sm" disabled={probandoResumen} onClick={async () => {
                setProbandoResumen(true); setResumenDijo("");
                try {
                  const r = await fetch("/api/aviso?de=resumen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ usuarioId: usuario?.id }) });
                  const d = await r.json();
                  setResumenDijo(d.ok
                    ? (d.enviados?.length ? `Te lo mandé a ${d.enviados[0]} · ${d.tareas} tareas leídas` : "No se pudo mandar: revisá tu correo en Usuarios")
                    : d.error || "No se pudo armar el resumen");
                } catch (e) { setResumenDijo("No se pudo: " + e.message); }
                setProbandoResumen(false);
              }}>{probandoResumen ? "Mandando…" : "Mandármelo ahora"}</Button>
              {resumenDijo && <span style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>{resumenDijo}</span>}
            </div>
          </div>
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
                {/* Cuándo entró por última vez. La sesión dura siete días, así
                    que "tiene sesión" no dice nada: esto sí dice si lo usa. */}
                <div style={{ fontSize: 10.5, color: colorConexion(u.ultima_conexion) }}>{cuandoEntro(u.ultima_conexion)}</div>
              </div>
              {/* Los permisos de esta persona, por encima de los de su rol. */}
              {usuario?.role === "owner" && u.role !== "owner" && (
                <button onClick={() => setPermisosDe(permisosDe === u.id ? null : u.id)} style={iconBtn} title="Permisos de esta persona">
                  <KeyRound size={13} />
                </button>
              )}
              <button onClick={() => setEditU({ ...u, pin: "", proyectos: projects.filter(p => (p.miembros || []).includes(u.id)).map(p => p.id) })} style={iconBtn}><Pencil size={13} /></button>
              {u.role !== "owner" && <button onClick={() => deleteUser(u.id)} style={deleteBtn}><X size={13} /></button>}
            </div>
          ))}
          {permisosDe && users.find(u => u.id === permisosDe) && (
            <div style={{ background: "var(--bg)", borderRadius: "var(--radius-md)", padding: "10px 12px", marginBottom: 8, border: "1.5px solid var(--brand)" }}>
              <PermisosDeUsuario
                usuario={users.find(u => u.id === permisosDe)}
                permisos={permisos}
                valores={permisosUsuario[permisosDe] || {}}
                onCambio={(uid, permiso, valor) => setPermisosUsuario(prev => {
                  const suyos = { ...(prev[uid] || {}) };
                  if (valor === null) delete suyos[permiso]; else suyos[permiso] = valor;
                  return { ...prev, [uid]: suyos };
                })} />
            </div>
          )}
          {newU ? <UserForm u={emptyUser} esNuevo projects={projects} onSave={saveUser} onCancel={() => setNewU(false)} /> : (
            <button onClick={() => setNewU(true)} style={{ width: "100%", background: "var(--bg)", border: "1.5px dashed var(--border)", borderRadius: "var(--radius-md)", padding: 10, color: "var(--ink-soft)", fontSize: 13, cursor: "pointer", fontWeight: 500 }}>+ Agregar usuario</button>
          )}
        </div>
      )}

      {tab === "proyectos" && (
        <div>
          {avisoEquipo}
          {/* Un proyecto, una sola vez: acá se dice cuál de esta lista es cuál
              del pipeline, y dejan de ser dos cosas con el mismo nombre. */}
          <EmparejarProyectos onCambio={onEquipoCambio} />

          {/* La lista de verdad: la del pipeline. Acá el proyecto solo recibe
              lo que hace falta para trabajar en equipo —color y gente—; nace y
              se trabaja en el pipeline, con su tubo y sus etapas. */}
          <ProyectosDelPipeline users={users} permisos={permisos} permisosUsuario={permisosUsuario} onCambio={onEquipoCambio} />

          {/* Lo que todavía no se empató se sigue viendo y editando como antes:
              nada desaparece por el camino. */}
          {projects.filter(p => !p.lead_id).length > 0 && (
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.4, margin: "14px 0 7px" }}>
              LISTA VIEJA DE AJUSTES · {projects.filter(p => !p.lead_id).length}
            </div>
          )}
          {projects.filter(p => !p.lead_id).map(p => editP?.id === p.id ? (
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
          {/* Los proyectos nuevos nacen en el pipeline: ahí eligen su tubo y
              arrancan con sus etapas. Crear uno acá volvía a partir la lista en
              dos, que es el problema que estamos cerrando. */}
          <div style={{ fontSize: 11.5, color: "var(--muted)", background: "var(--bg)", border: "1px dashed var(--border)", borderRadius: "var(--radius-md)", padding: 11, textAlign: "center" }}>
            Los proyectos nuevos se crean en <strong style={{ color: "var(--ink-soft)" }}>Pipeline → Nuevo proyecto</strong>, con su tubo y sus etapas.
          </div>
        </div>
      )}
    </Modal>
  );
}
