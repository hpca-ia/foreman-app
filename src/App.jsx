import { useState, useEffect } from "react";
import { ListTodo } from "lucide-react";
import { supabase } from "./lib/supabase";
import { loadFromStorage, saveToStorage } from "./lib/storage";
import { daysUntil } from "./lib/dates";
import { esAdmin, puedeControlObra, puedeCajaChica, ROLES } from "./lib/roles";
import { USERS_DEFAULT, PROJECTS_DEFAULT } from "./lib/seedData";
import { colors } from "./theme/colors";

import LoginScreen from "./components/LoginScreen";
import NovaInput from "./components/NovaInput";
import AIBriefing from "./components/AIBriefing";
import TarjetaTarea from "./components/TarjetaTarea";
import TareasTabla from "./components/TareasTabla";
import TareasKanban from "./components/TareasKanban";
import ModalTarea from "./components/ModalTarea";
import PanelAjustes from "./components/PanelAjustes";
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import Avatar from "./components/ui/Avatar";
import FechaBadge from "./components/FechaBadge";

import ModuloPresupuestos from "./modules/ModuloPresupuestos";
import ModuloControlObra from "./modules/controlObra/ModuloControlObra";
import ModuloCajaChica from "./modules/ModuloCajaChica";

export default function App() {
  const [users, setUsers] = useState(() => loadFromStorage("foreman_users", USERS_DEFAULT));
  const [projects, setProjects] = useState(() => loadFromStorage("foreman_projects", PROJECTS_DEFAULT));
  const [empresa, setEmpresa] = useState(() => loadFromStorage("foreman_empresa", {
    nombre: "HCA Studio", tipo: "Construcción", email: "", telefono: "", web: "", ciudad: "Quito", moneda: "USD", color: colors.brand, logoUrl: "",
  }));
  const [usuario, setUsuario] = useState(null);
  const [tareas, setTareas] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [vista, setVista] = useState("tareas");
  const [vistaTareas, setVistaTareas] = useState("lista");
  const [filtro, setFiltro] = useState("todas");
  const [filtroP, setFiltroP] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [showAjustes, setShowAjustes] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const gP = id => projects.find(p => p.id === id);

  useEffect(() => { setShowAlerts(false); setShowAjustes(false); setShowModal(false); }, [usuario]);

  useEffect(() => {
    if (!usuario) return;
    fetchTareas();
    const tCh = supabase.channel(`tasks-main-${usuario.id}-${Date.now()}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "tasks" }, p => setTareas(prev => [p.new, ...prev]))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "tasks" }, p => setTareas(prev => prev.map(t => t.id === p.new.id ? p.new : t)))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "tasks" }, p => setTareas(prev => prev.filter(t => t.id !== p.old.id)))
      .subscribe();
    // Polling silencioso cada 15s - sin mostrar loading
    const poll = setInterval(async () => {
      const { data } = await supabase.from("tasks").select("*").order("created_at", { ascending: false });
      if (data) setTareas(data);
    }, 15000);
    return () => { supabase.removeChannel(tCh); clearInterval(poll); };
  }, [usuario]);

  async function fetchTareas() {
    setCargando(true);
    const { data } = await supabase.from("tasks").select("*").order("created_at", { ascending: false });
    setTareas(data || []);
    setCargando(false);
  }

  async function sendEmail(to, subject, html) {
    if (!to) return;
    try {
      await fetch("/api/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to, subject, html }) });
    } catch (e) { console.error("Email error:", e); }
  }

  async function eliminarTarea(id) {
    if (!window.confirm("¿Eliminar esta tarea? Esta acción no se puede deshacer.")) return;
    await supabase.from("tasks").delete().eq("id", id);
    setTareas(prev => prev.filter(t => t.id !== id));
  }

  async function cambiarEstado(id, estado) {
    setTareas(prev => prev.map(t => t.id === id ? { ...t, status: estado } : t));
    const { error } = await supabase.from("tasks").update({ status: estado }).eq("id", id);
    if (error) { console.error("Error updating status:", error); fetchTareas(); }
  }

  async function guardarTarea(form, id) {
    if (id) {
      await supabase.from("tasks").update(form).eq("id", id);
    } else {
      await supabase.from("tasks").insert({ ...form, created_by: usuario.id });
      if (form.assignee_id) {
        const asignado = users.find(u => u.id === form.assignee_id);
        const proyecto = projects.find(p => p.id === form.project_id);
        if (asignado?.email) {
          const prioridad = form.priority === "urgente" ? "URGENTE" : form.priority === "alta" ? "Alta" : form.priority === "media" ? "Media" : "Baja";
          const html = `<div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:20px"><div style="background:${colors.brand};border-radius:12px;padding:20px;margin-bottom:20px"><h1 style="color:#fff;margin:0;font-size:22px">FOREMAN</h1><p style="color:rgba(255,255,255,0.8);margin:4px 0 0;font-size:13px">Nueva tarea asignada</p></div><h2 style="color:${colors.ink};font-size:18px">Hola ${asignado.name}</h2><p style="color:${colors.inkSoft}">${usuario.name} te asignó una nueva tarea:</p><div style="background:${colors.bg};border-left:4px solid ${colors.brand};border-radius:8px;padding:16px;margin:16px 0"><h3 style="color:${colors.ink};margin:0 0 8px;font-size:16px">${form.title}</h3><p style="color:${colors.inkSoft};margin:4px 0;font-size:13px">Proyecto: <strong>${proyecto?.name}</strong></p><p style="color:${colors.inkSoft};margin:4px 0;font-size:13px">Fecha límite: <strong>${form.due_date}</strong></p><p style="color:${colors.inkSoft};margin:4px 0;font-size:13px">Prioridad: <strong>${prioridad}</strong></p>${form.notes ? `<p style="color:${colors.inkSoft};margin:8px 0 0;font-size:13px">${form.notes}</p>` : ""}</div><a href="https://foreman-app-ebon.vercel.app" style="display:inline-block;background:${colors.brand};color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Ver en FOREMAN →</a><p style="color:${colors.muted};font-size:11px;margin-top:24px">FOREMAN by HCA Studio</p></div>`;
          await sendEmail(asignado.email, `Nueva tarea: ${form.title}`, html);
        }
      }
    }
    setEditTask(null);
  }

  function logout() { saveToStorage("foreman_session", null); localStorage.removeItem("foreman_session"); setUsuario(null); }

  if (!usuario) return <LoginScreen onLogin={setUsuario} users={users} />;

  const admin = esAdmin(usuario.role);
  const misAlertasTareas = admin
    ? tareas.filter(t => t.status !== "listo" && (daysUntil(t.due_date) < 0 || daysUntil(t.due_date) <= 2))
    : tareas.filter(t => (t.assignee_id === usuario.id || t.created_by === usuario.id) && t.status !== "listo" && (daysUntil(t.due_date) < 0 || daysUntil(t.due_date) <= 2));
  const alertCount = misAlertasTareas.length;
  let visibles = admin ? tareas : tareas.filter(t => t.assignee_id === usuario.id || t.created_by === usuario.id);
  if (busqueda.trim()) {
    const q = busqueda.toLowerCase();
    visibles = visibles.filter(t =>
      t.title?.toLowerCase().includes(q) ||
      t.notes?.toLowerCase().includes(q) ||
      projects.find(p => p.id === t.project_id)?.name?.toLowerCase().includes(q) ||
      users.find(u => u.id === t.assignee_id)?.name?.toLowerCase().includes(q)
    );
  }
  if (filtro === "pendiente") visibles = visibles.filter(t => t.status === "pendiente");
  if (filtro === "urgente") visibles = visibles.filter(t => t.status !== "listo" && (t.priority === "urgente" || daysUntil(t.due_date) <= 1));
  if (filtro === "listo") visibles = visibles.filter(t => t.status === "listo");
  if (filtroP !== "all") visibles = visibles.filter(t => t.project_id === Number(filtroP));

  const filtS = a => ({ padding: "6px 14px", borderRadius: 20, border: a ? "none" : `1px solid ${colors.border}`, cursor: "pointer", fontFamily: colors.font, fontSize: 12, fontWeight: 600, background: a ? colors.ink : "#fff", color: a ? "#fff" : colors.inkSoft, flexShrink: 0 });

  return (
    <div style={{ minHeight: "100vh", background: colors.bg, fontFamily: colors.font, display: "flex", flexDirection: "column" }}>
      <Header
        busqueda={busqueda} setBusqueda={setBusqueda}
        alertCount={alertCount} onOpenAlerts={() => { setVista("tareas"); setFiltro("urgente"); setShowAlerts(true); }}
        admin={admin} onOpenAjustes={() => setShowAjustes(true)}
        usuario={usuario} onLogout={logout}
        onNuevaTarea={() => { setEditTask(null); setShowModal(true); }}
      />

      <div className="app-shell-layout" style={{ display: "flex", flex: 1, maxWidth: 1100, margin: "0 auto", width: "100%" }}>
        <Sidebar usuario={usuario} empresa={empresa} vista={vista} setVista={setVista} admin={admin} />

        <div className="app-content" style={{ flex: 1, padding: "18px 20px", overflowY: "auto", minHeight: "calc(100vh - 54px)" }}>
          {admin && vista === "tareas" && <><NovaInput currentUser={usuario} projects={projects} users={users} onTaskCreated={fetchTareas} /><AIBriefing tasks={tareas} currentUser={usuario} users={users} projects={projects} /></>}

          {vista === "tareas" && (
            <>
              <div style={{ display: "flex", gap: 6, marginBottom: 12, overflowX: "auto", paddingBottom: 4, alignItems: "center" }}>
                {[["todas", "Todas"], ["urgente", "Urgentes"], ["pendiente", "Pendientes"], ["listo", "Completadas"]].map(([f, l]) => (
                  <button key={f} onClick={() => setFiltro(f)} style={filtS(filtro === f)}>{l}</button>
                ))}
                {admin && <select value={filtroP} onChange={e => setFiltroP(e.target.value)} style={{ background: "#fff", border: `1px solid ${filtroP !== "all" ? colors.brand : colors.border}`, borderRadius: 20, color: filtroP !== "all" ? colors.brand : colors.inkSoft, padding: "6px 12px", fontSize: 12, fontFamily: colors.font, cursor: "pointer", flexShrink: 0 }}>
                  <option value="all">Todos los proyectos</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>}
                <div className="tasks-view-desktop" style={{ marginLeft: "auto", display: "flex", gap: 4, background: colors.neutralSoft, borderRadius: colors.radiusSm, padding: 3, flexShrink: 0 }}>
                  {[["lista", "Lista"], ["tablero", "Tablero"]].map(([v, l]) => (
                    <button key={v} onClick={() => setVistaTareas(v)} style={{ padding: "5px 12px", borderRadius: 6, border: "none", cursor: "pointer", fontFamily: colors.font, fontSize: 12, fontWeight: 600, background: vistaTareas === v ? colors.surface : "transparent", color: vistaTareas === v ? colors.brand : colors.inkSoft }}>{l}</button>
                  ))}
                </div>
              </div>

              {cargando ? <div style={{ textAlign: "center", color: colors.muted, padding: "40px 0", fontSize: 13 }}>Cargando...</div> : (
                <>
                  <div className="tasks-view-desktop">
                    {visibles.length === 0 ? <div style={{ textAlign: "center", color: colors.muted, padding: "60px 0", fontSize: 13 }}>Sin tareas. Toca "+ Nueva tarea" o dile a NOVA.</div>
                      : vistaTareas === "tablero"
                        ? <TareasKanban tasks={visibles} users={users} projects={projects} currentUser={usuario} onCambiarEstado={cambiarEstado} onEditar={t => { setEditTask(t); setShowModal(true); }} />
                        : <TareasTabla tasks={visibles.slice().sort((a, b) => { const o = { urgente: 0, alta: 1, media: 2, baja: 3 }; if (a.status === "listo" && b.status !== "listo") return 1; if (b.status === "listo" && a.status !== "listo") return -1; return (o[a.priority] - o[b.priority]) || (daysUntil(a.due_date) - daysUntil(b.due_date)); })} users={users} projects={projects} onEditar={t => { setEditTask(t); setShowModal(true); }} />}
                  </div>
                  <div className="tasks-view-mobile">
                    {visibles.length === 0 ? <div style={{ textAlign: "center", color: colors.muted, padding: "60px 0", fontSize: 13, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}><ListTodo size={32} />Sin tareas. Toca "+ Nueva tarea" o dile a NOVA.</div>
                      : visibles.slice().sort((a, b) => { const o = { urgente: 0, alta: 1, media: 2, baja: 3 }; if (a.status === "listo" && b.status !== "listo") return 1; if (b.status === "listo" && a.status !== "listo") return -1; return (o[a.priority] - o[b.priority]) || (daysUntil(a.due_date) - daysUntil(b.due_date)); })
                        .map(t => <TarjetaTarea key={t.id} task={t} currentUser={usuario} users={users} projects={projects} onCambiarEstado={cambiarEstado} onEditar={t => { setEditTask(t); setShowModal(true); }} onEliminar={eliminarTarea} />)}
                  </div>
                </>
              )}
            </>
          )}

          {admin && vista === "equipo" && (
            <div style={{ display: "grid", gap: 10 }}>
              {users.map(m => {
                const mt = tareas.filter(t => t.assignee_id === m.id && t.status !== "listo");
                const mo = mt.filter(t => daysUntil(t.due_date) < 0);
                return (
                  <div key={m.id} style={{ background: "#fff", borderRadius: 12, padding: 14, border: `1px solid ${colors.border}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: mt.length ? 12 : 0 }}>
                      <Avatar name={m.name} size={40} color={mo.length > 0 ? colors.danger : m.color || colors.brand} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: colors.ink }}>{m.name}</div>
                        <div style={{ fontSize: 11, color: colors.muted }}>{ROLES[m.role]?.label || "Equipo"}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ color: mo.length > 0 ? colors.danger : colors.brand, fontSize: 20, fontWeight: 700 }}>{mt.length}</div>
                        <div style={{ color: colors.muted, fontSize: 9, fontWeight: 600, letterSpacing: 0.5 }}>ABIERTAS</div>
                      </div>
                    </div>
                    {mt.map(t => (
                      <div key={t.id} style={{ background: colors.bg, borderRadius: 8, padding: "7px 10px", marginBottom: 5, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div><div style={{ fontSize: 12, fontWeight: 500, color: colors.ink }}>{t.title}</div><div style={{ fontSize: 11, color: colors.muted }}>{gP(t.project_id)?.name}</div></div>
                        <FechaBadge due={t.due_date} status={t.status} />
                      </div>
                    ))}
                    {mt.length === 0 && <div style={{ color: colors.muted, fontSize: 12, textAlign: "center", padding: "4px 0" }}>Sin pendientes</div>}
                  </div>
                );
              })}
            </div>
          )}

          {esAdmin(usuario.role) && vista === "presupuestos" && (
            <ModuloPresupuestos currentUser={usuario} projects={projects} />
          )}
          {puedeControlObra(usuario.role) && vista === "controlObra" && (
            <ModuloControlObra currentUser={usuario} projects={projects} />
          )}
          {puedeCajaChica(usuario.role) && vista === "cajaChica" && (
            <ModuloCajaChica currentUser={usuario} projects={projects} users={users} />
          )}

          {admin && vista === "proyectos" && (
            <div style={{ display: "grid", gap: 10 }}>
              {projects.map(p => {
                const pt = tareas.filter(t => t.project_id === p.id);
                const pPen = pt.filter(t => t.status !== "listo");
                const pOk = pt.filter(t => t.status === "listo");
                const pct = pt.length > 0 ? Math.round((pOk.length / pt.length) * 100) : 0;
                return (
                  <div key={p.id} style={{ background: "#fff", borderRadius: 12, padding: 14, border: `1px solid ${colors.border}`, borderLeft: `4px solid ${p.color}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: colors.ink }}>{p.name}</div>
                      <div style={{ color: p.color, fontSize: 16, fontWeight: 700 }}>{pct}%</div>
                    </div>
                    <div style={{ background: colors.neutralSoft, borderRadius: 4, height: 6, marginBottom: 10 }}>
                      <div style={{ background: p.color, height: 6, borderRadius: 4, width: `${pct}%`, transition: "width 0.5s" }} />
                    </div>
                    <div style={{ display: "flex", gap: 16 }}>
                      <span style={{ fontSize: 12, color: colors.inkSoft }}><span style={{ color: p.color, fontWeight: 700 }}>{pPen.length}</span> abiertas</span>
                      <span style={{ fontSize: 12, color: colors.inkSoft }}><span style={{ color: colors.success, fontWeight: 700 }}>{pOk.length}</span> completadas</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showAlerts && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(17,24,39,0.25)", display: "flex", alignItems: "flex-start", justifyContent: "flex-end", zIndex: 200, padding: "60px 16px 0", pointerEvents: "all" }} onClick={() => setShowAlerts(false)}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 20, width: 360, maxHeight: "80vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.15)", fontFamily: colors.font }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: colors.ink }}>Alertas de {usuario.name}</div>
              <button onClick={() => setShowAlerts(false)} style={{ background: colors.neutralSoft, border: "none", borderRadius: 6, width: 28, height: 28, color: colors.inkSoft, cursor: "pointer", fontSize: 15 }}>×</button>
            </div>
            {misAlertasTareas.length === 0 ? <div style={{ color: colors.muted, fontSize: 13, textAlign: "center", padding: "20px 0" }}>Sin alertas pendientes</div> : (
              <div>
                {misAlertasTareas.filter(t => daysUntil(t.due_date) < 0).length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: colors.danger, letterSpacing: 0.5, marginBottom: 8 }}>VENCIDAS</div>
                    {misAlertasTareas.filter(t => daysUntil(t.due_date) < 0).map(t => (
                      <div key={t.id} style={{ background: colors.dangerSoft, borderRadius: 8, padding: "8px 12px", marginBottom: 6, borderLeft: `3px solid ${colors.danger}` }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: colors.ink }}>{t.title}</div>
                        <div style={{ fontSize: 11, color: colors.inkSoft, marginTop: 2 }}>{projects.find(p => p.id === t.project_id)?.name} · {users.find(u => u.id === t.assignee_id)?.name || "Sin asignar"} · Vencida {Math.abs(daysUntil(t.due_date))}d</div>
                      </div>
                    ))}
                  </div>
                )}
                {misAlertasTareas.filter(t => daysUntil(t.due_date) >= 0 && daysUntil(t.due_date) <= 2).length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: colors.warning, letterSpacing: 0.5, marginBottom: 8 }}>POR VENCER</div>
                    {misAlertasTareas.filter(t => daysUntil(t.due_date) >= 0 && daysUntil(t.due_date) <= 2).map(t => (
                      <div key={t.id} style={{ background: colors.warningSoft, borderRadius: 8, padding: "8px 12px", marginBottom: 6, borderLeft: `3px solid ${colors.warning}` }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: colors.ink }}>{t.title}</div>
                        <div style={{ fontSize: 11, color: colors.inkSoft, marginTop: 2 }}>{projects.find(p => p.id === t.project_id)?.name} · {users.find(u => u.id === t.assignee_id)?.name || "Sin asignar"} · {daysUntil(t.due_date) === 0 ? "Hoy" : `en ${daysUntil(t.due_date)}d`}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {showModal && <ModalTarea editTask={editTask} currentUser={usuario} users={users} projects={projects} onCerrar={() => { setShowModal(false); setEditTask(null); }} onGuardar={guardarTarea} />}
      {showAjustes && <PanelAjustes users={users} setUsers={setUsers} projects={projects} setProjects={setProjects} empresa={empresa} setEmpresa={setEmpresa} onClose={() => setShowAjustes(false)} />}
    </div>
  );
}
