import { useState, useEffect, useCallback, useRef } from "react";
import { ListTodo } from "lucide-react";
import { supabase } from "./lib/supabase";
import { loadFromStorage, saveToStorage } from "./lib/storage";
import { daysUntil } from "./lib/dates";
import { esAdmin } from "./lib/roles";
import { cargarPermisos, crearPuede } from "./lib/permisos";
import { equipoEnCache, cargarEquipo } from "./lib/equipo";
import { colors } from "./theme/colors";
import { PRIORIDAD, CLASES, claseDe } from "./theme/constants";

import LoginScreen from "./components/LoginScreen";
import { salir, mensajeError } from "./lib/sesion";
import NovaInput from "./components/NovaInput";
import AIBriefing from "./components/AIBriefing";
import TarjetaTarea from "./components/TarjetaTarea";
import TareasListaMovil from "./components/TareasListaMovil";
import AvisoTareas from "./components/AvisoTareas";
import ModuloLeads from "./modules/leads/ModuloLeads";
import TareasTabla from "./components/TareasTabla";
import TareasKanban from "./components/TareasKanban";
import TareasCalendario from "./components/TareasCalendario";
import TareasDeLosDemas from "./components/TareasDeLosDemas";
import { leerResponsables, guardarResponsables, leerDependencias, destrabarLasQueEsperaban } from "./lib/tareasEquipo";
import ModalTarea from "./components/ModalTarea";
import PanelAjustes from "./components/PanelAjustes";
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";

import ModuloPresupuestos from "./modules/ModuloPresupuestos";
import ModuloControlObra from "./modules/controlObra/ModuloControlObra";
import ModuloCajaChica from "./modules/ModuloCajaChica";

export default function App() {
  // Arranca con la copia guardada en el navegador y se refresca desde la base:
  // así la pantalla de ingreso no espera, pero todos los equipos terminan
  // viendo la misma lista.
  const [users, setUsers] = useState(() => equipoEnCache().usuarios);
  const [projects, setProjects] = useState(() => equipoEnCache().proyectos);
  const [equipoRemoto, setEquipoRemoto] = useState(true);
  const [empresa, setEmpresa] = useState(() => loadFromStorage("foreman_empresa", {
    nombre: "HCA Studio", tipo: "Construcción", email: "", telefono: "", web: "", ciudad: "Quito", moneda: "USD", color: colors.brand, logoUrl: "",
  }));
  const [usuario, setUsuario] = useState(null);
  const [tareas, setTareas] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [vista, setVista] = useState("tareas");
  const [vistaTareas, setVistaTareas] = useState("lista");
  // Quién acompaña a cada tarea, y qué tarea espera a cuál.
  const [acompanantes, setAcompanantes] = useState(new Map());
  // Lo último de las tareas, para poder leer sus acompañantes sin volver a
  // armar la función cada vez que cambia la lista.
  const tareasRef = useRef([]);
  const [dependencias, setDependencias] = useState({ espera: new Map(), destraba: new Map() });
  const [filtro, setFiltro] = useState("todas");
  // Lo completado se guarda, no se tira: se ve cuando alguien lo pide.
  const [verListas, setVerListas] = useState(false);
  const [filtroP, setFiltroP] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [showAjustes, setShowAjustes] = useState(false);
  const [permisos, setPermisos] = useState(null);
  const [showAlerts, setShowAlerts] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => { setShowAlerts(false); setShowAjustes(false); setShowModal(false); }, [usuario]);
  useEffect(() => { cargarPermisos().then(setPermisos); }, []);
  useEffect(() => { recargarEquipo(); }, []);

  // Si la sesión se vence, la app lo dice y manda a entrar de nuevo. Antes se
  // quedaba abierta y todo lo que uno escribía fallaba con un error de la base
  // que no significa nada para quien lo lee.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((evento, sesion) => {
      if (!sesion && (evento === "SIGNED_OUT" || evento === "TOKEN_REFRESHED")) setUsuario(null);
    });
    return () => data?.subscription?.unsubscribe();
  }, []);

  async function recargarEquipo() {
    const eq = await cargarEquipo();
    setUsers(eq.usuarios); setProjects(eq.proyectos); setEquipoRemoto(eq.remoto);
    // Si a alguien lo desactivaron desde otro equipo, deja de poder usar la app.
    // Si no cambió nada suyo se conserva el mismo objeto: antes cambiaba de
    // identidad en cada recarga, y eso cerraba el panel de Ajustes a media
    // configuración.
    setUsuario(u => {
      if (!u) return u;
      const actual = eq.usuarios.find(x => x.id === u.id);
      if (!actual) return eq.remoto ? null : u;
      return JSON.stringify(actual) === JSON.stringify(u) ? u : actual;
    });
  }

  // El pipeline aparece en el menú si ve todo, o si le compartieron algún
  // proyecto: el acceso es por persona, no por rol.
  // Los proyectos del pipeline no están en Ajustes, pero sus etapas son tareas
  // de alguien: sin su nombre, esas tareas aparecían sin proyecto.
  const [leadsPorId, setLeadsPorId] = useState({});
  const [proyectosPipeline, setProyectosPipeline] = useState([]);
  const [comentarios, setComentarios] = useState({});   // task_id -> cuántos
  const tienePipeline = Object.keys(leadsPorId).length > 0;
  useEffect(() => {
    if (!usuario) return;
    // El pipeline es la lista de proyectos de la oficina: los que se persiguen
    // y los que se están haciendo. Las tareas se cuelgan de ahí igual que de
    // los proyectos de Ajustes, para que no haya dos listas con el mismo
    // nombre y haya que adivinar cuál elegir.
    supabase.from("leads").select("id,nombre,tunel,es_lead,resultado")
      .then(({ data, error }) => {
        const filas = error ? [] : data || [];
        setLeadsPorId(Object.fromEntries(filas.map(l => [l.id, l.nombre])));
        setProyectosPipeline(filas.filter(l => l.resultado !== "perdido"));
      });
    supabase.from("tarea_comentarios").select("task_id").then(({ data }) => {
      const c = {};
      (data || []).forEach(x => { c[x.task_id] = (c[x.task_id] || 0) + 1; });
      setComentarios(c);
    });
  }, [usuario]);

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

  // Quién acompaña cada tarea y qué espera a qué. Va aparte de las tareas
  // porque son sus propias tablas, y sin la migración 035 devuelven vacío.
  const cargarEquipoDeTareas = useCallback(async () => {
    const ids = tareasRef.current.map(t => t.id);
    if (!ids.length) return;
    const [resp, dep] = await Promise.all([leerResponsables(ids), leerDependencias(ids)]);
    setAcompanantes(resp);
    setDependencias(dep);
    // eslint-disable-next-line
  }, []);

  useEffect(() => { tareasRef.current = tareas; }, [tareas]);
  useEffect(() => { if (tareas.length) cargarEquipoDeTareas(); }, [tareas.length, cargarEquipoDeTareas]);

  async function fetchTareas() {
    setCargando(true);
    const { data } = await supabase.from("tasks").select("*").order("created_at", { ascending: false });
    setTareas(data || []);
    setCargando(false);
  }

  /** Le avisa por correo a quien quedó a cargo. Devuelve el motivo si no pudo. */
  async function avisarPorCorreo(tareaId) {
    try {
      const r = await fetch("/api/aviso-tarea", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tareaId }),
      });
      const d = await r.json().catch(() => ({}));
      return d.ok ? null : (d.error || "el servidor no contestó");
    } catch (e) {
      return e.message;
    }
  }

  async function sendEmail(to, subject, html) {
    if (!to) return;
    try {
      await fetch("/api/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to, subject, html }) });
    } catch (e) { console.error("Email error:", e); }
  }

  // Antes un error al guardar se tragaba: el formulario se cerraba y la tarea
  // simplemente no aparecía, sin saber por qué.
  const mensajeErrorTarea = e => /out of range/i.test(e.message)
    ? "No se pudo guardar: falta correr la migración 012 en Supabase. Los proyectos y usuarios nuevos tienen un número de identificación que la tabla de tareas todavía no acepta."
    : /null value|not-null/i.test(e.message)
    ? "No se pudo guardar: falta correr la migración 011 en Supabase. Mientras tanto, elige un proyecto para la tarea."
    : "No se pudo guardar la tarea: " + e.message;

  async function eliminarTarea(id) {
    if (!window.confirm("¿Borrar esta tarea? No se puede deshacer.")) return false;
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) { alert("No se pudo borrar: " + error.message); return false; }
    // Si salió de una gestión del pipeline, se corta el vínculo: si no, esa
    // gestión queda apuntando a una tarea que ya no existe y editarla no
    // guardaba en ningún lado.
    await supabase.from("lead_etapa_items").update({ tarea_id: null }).eq("tarea_id", id);
    setTareas(prev => prev.filter(t => t.id !== id));
    return true;
  }

  async function cambiarEstado(id, estado, cierre = null) {
    const tarea = tareas.find(t => t.id === id);
    // Lo que se deja al cerrarla: la prueba de lo que se hizo, o la decisión
    // de quien aprueba. Sin la migración 038 se guarda solo el estado.
    const campos = { status: estado };
    if (cierre) {
      if (cierre.enlace) campos.prueba_enlace = cierre.enlace;
      if (cierre.decision === "aprobar" || cierre.decision === "devolver") {
        campos.aprobacion_estado = cierre.decision === "aprobar" ? "aprobada" : "devuelta";
        campos.aprobacion_por = usuario.id;
        campos.aprobacion_nombre = usuario.name;
        campos.aprobacion_at = new Date().toISOString();
        campos.aprobacion_nota = cierre.nota || null;
      }
    }
    setTareas(prev => prev.map(t => t.id === id ? { ...t, ...campos } : t));
    let { error } = await supabase.from("tasks").update(campos).eq("id", id);
    if (error && /column|schema cache/i.test(error.message)) {
      alert("Falta correr la migración 038 en Supabase: por ahora se guarda el estado, pero no la prueba ni quién aprobó.");
      ({ error } = await supabase.from("tasks").update({ status: estado }).eq("id", id));
    }
    // La nota de cierre queda como comentario: es la conversación de la tarea,
    // y así le llega a quien la creó y a quien la estaba esperando.
    if (cierre?.nota) {
      await supabase.from("tarea_comentarios").insert({
        task_id: id, autor_id: usuario.id, autor_nombre: usuario.name,
        texto: `${cierre.decision === "aprobar" ? "Aprobada" : cierre.decision === "devolver" ? "Devuelta" : "Completada"}: ${cierre.nota}`,
      });
    }
    if (error) { console.error("Error updating status:", error); fetchTareas(); return; }

    // Si la tarea salió de un punto del checklist de un proyecto, ese punto
    // queda marcado: si no, habría que acordarse de ir a marcarlo a mano.
    if (estado === "listo") {
      await supabase.from("lead_etapa_items")
        .update({ hecho: true, hecho_at: new Date().toISOString(), hecho_por: usuario.name })
        .eq("tarea_id", id);
    }

    // Al completarla, las que la estaban esperando se destraban solas.
    if (estado === "listo") {
      const destrabadas = await destrabarLasQueEsperaban(id);
      if (destrabadas.length) fetchTareas();
    }

    // Si la tarea es de un proyecto del pipeline, su bitácora se entera: quien
    // la trabaja la marca desde sus tareas, no entrando al proyecto.
    if (tarea?.lead_id && estado !== "pendiente") {
      await supabase.from("lead_movimientos").insert({
        lead_id: tarea.lead_id, tipo: "nota", automatico: true,
        detalle: `${estado === "listo" ? "Hecho" : "No se hizo"}: ${tarea.title}`,
        autor_id: usuario.id, autor_nombre: usuario.name,
      });
    }
  }

  async function guardarTarea(formEntero, id) {
    // Los acompañantes no son columnas de la tarea: van en su propia tabla.
    const { _acompanantes: conmigo = [], ...form } = formEntero;
    // Si falta la migración 038, la tarea se guarda igual: sin la marca de
    // aprobación, y se avisa.
    const sinNuevas = ({ es_aprobacion, enlace, hora, ...resto }) => resto;
    const guardar = async campos => {
      const r = id ? await supabase.from("tasks").update(campos).eq("id", id)
                   : await supabase.from("tasks").insert({ ...campos, created_by: usuario.id }).select().single();
      if (r.error && /column|schema cache/i.test(r.error.message)) {
        alert("Faltan migraciones en Supabase (037, 038, 045): la tarea se guarda, pero sin el enlace, el pedido de aprobación ni la hora.");
        return id ? await supabase.from("tasks").update(sinNuevas(campos)).eq("id", id)
                  : await supabase.from("tasks").insert({ ...sinNuevas(campos), created_by: usuario.id }).select().single();
      }
      return r;
    };
    if (id) {
      const antes = tareas.find(t => t.id === id);
      const { error } = await guardar(form);
      if (error) { alert(mensajeErrorTarea(error)); return; }
      await guardarResponsables(id, conmigo, form.assignee_id);
      cargarEquipoDeTareas();
      // Si cambió de manos, el nuevo se entera: enterarse por casualidad de que
      // algo era tuyo es la forma más cara de perder una semana.
      if (form.assignee_id && form.assignee_id !== antes?.assignee_id) await avisarPorCorreo(id);
    } else {
      const { data: creada, error } = await guardar({ ...form, ...(form.es_aprobacion ? { aprobacion_estado: "pendiente" } : {}) });
      if (error) { alert(mensajeErrorTarea(error)); return; }
      if (creada && conmigo.length) { await guardarResponsables(creada.id, conmigo, form.assignee_id); cargarEquipoDeTareas(); }
      // El aviso lo manda el servidor, que es el único que ve los correos y
      // sabe de qué proyecto es. Si no se pudo mandar, se dice: antes el error
      // se tragaba y la persona nunca se enteraba de que tenía algo.
      if (creada?.id && form.assignee_id) {
        const fallo = await avisarPorCorreo(creada.id);
        if (fallo) alert(`La tarea se guardó, pero no se pudo avisar por correo: ${fallo}`);
      }
    }
    setEditTask(null);
  }

  function logout() { saveToStorage("foreman_session", null); localStorage.removeItem("foreman_session"); salir(); setUsuario(null); }

  if (!usuario) return <LoginScreen onLogin={u => { setUsuario(u); recargarEquipo(); }} users={users} />;

  const admin = esAdmin(usuario.role);
  const puede = crearPuede(usuario, permisos);
  // Se calcula acá y no antes: `puede` todavía no existe más arriba.
  const verPipeline = puede("leads.ver") || tienePipeline;
  // El nombre del proyecto de una tarea: el del pipeline si viene de ahí, el de
  // Ajustes si no. (Se llamaba a sí misma: al buscar por texto una tarea con
  // proyecto normal, el navegador se quedaba sin pila y la pantalla se caía.)
  const nombreProyecto = t => (t.lead_id ? (leadsPorId[t.lead_id] || "Pipeline") : projects.find(p => p.id === t.project_id)?.name || "");
  // Lo que dice el botón que quita un filtro encendido desde los avisos.
const ETIQUETA_FILTRO = { vencidas: "Vencidas", hoy: "Para hoy", urgentes: "Urgentes", urgente: "Urgentes", atrasadas: "Atrasadas", pausadas: "Pausadas", listo: "Completadas" };
const VACIO = 'Nada pendiente. Toca "+ Nueva tarea" o dile a NOVA.';

const ordenPrioridad = { urgente: 0, alta: 1, media: 2, baja: 3 };
  const veTodo = puede("tareas.todas");
  // Quien no ve todo solo elige entre los proyectos donde es miembro.
  const proyectosElegibles = veTodo ? projects : projects.filter(p => (p.miembros || []).includes(usuario.id));
  // A quién puede asignarle tareas. Con el permiso de asignar, a cualquiera.
  // Sin él, a sí mismo y a sus compañeros: quienes comparten con él al menos un
  // proyecto. Así se coordinan en obra sin poder cargarle tareas a un admin o a
  // gente de otras obras.
  const compañeros = new Set(projects.filter(p => (p.miembros || []).includes(usuario.id)).flatMap(p => p.miembros || []));
  const asignables = puede("tareas.asignar") ? users : users.filter(u => u.id === usuario.id || compañeros.has(u.id));
  // Una gestión de proyecto que nadie tomó no es tarea de nadie: no entra a
  // "Mis tareas" por haberla escrito yo —eso llenaría la lista de cosas que no
  // me tocan—, pero tampoco se pierde: vive en su propio cuadro, abajo.
  // Qué es cada cosa lo dice su tipo, no de dónde vino: una tarea del pipeline
  // asignada a Camila es una tarea, no una gestión, y aparecía abajo entre las
  // gestiones solo por tener proyecto. Las de antes de esta distinción se
  // reparten por lo único que las separaba entonces: si tenían dueño o no.
  // Una reunión es una reunión porque se creó como tal, no porque tenga hora:
  // ponerle hora a una gestión —"llamar al municipio a las 9"— la mandaba a
  // Reuniones y desaparecía de donde el que la escribió la fue a buscar.
  const esReunion = t => claseDe(t) === "reunion";
  // Del tubo salen las tres, y cada una lo dice: en su tipo y en su nota. Las
  // de antes de la distinción decían "Actividad de …" y se toman como
  // gestiones, que es donde viven —dentro de una etapa—; si alguna era una
  // tarea, se corrige en un clic desde el proyecto.
  const esGestion = t => claseDe(t) === "gestion";
  // Lo que no tiene dueño no se guarda en un cajón aparte: va en su lista, con
  // todo lo demás y marcado en rojo. En un cuadro al fondo titulado "Sin
  // responsable" nadie entendía de dónde salía ni qué había que hacer con eso.
  const misAlertasTareas = veTodo
    ? tareas.filter(t => t.status !== "listo" && (daysUntil(t.due_date) < 0 || daysUntil(t.due_date) <= 2))
    : tareas.filter(t => (t.assignee_id === usuario.id || t.created_by === usuario.id) && t.status !== "listo" && (daysUntil(t.due_date) < 0 || daysUntil(t.due_date) <= 2));
  const alertCount = misAlertasTareas.length;
  // Quien no es admin ve lo suyo en "Mis tareas". Al elegir uno de sus
  // proyectos ve también lo de sus compañeros ahí —para coordinarse—, salvo lo
  // marcado como privado. Lo privado solo lo ven los admins y el asignado.
  // Mía es también la que me sumaron como acompañante: si la puedo mover, la
  // tengo que ver.
  const esMia = t => t.assignee_id === usuario.id || t.created_by === usuario.id || (acompanantes.get(t.id) || []).includes(usuario.id);
  const misProyectos = new Set(proyectosElegibles.map(p => p.id));
  let visibles = veTodo
    ? tareas.filter(t => !t.privada || admin || esMia(t))
    : tareas.filter(t => esMia(t) || (filtroP !== "all" && !t.privada && misProyectos.has(t.project_id) && t.project_id === Number(filtroP)));
  if (busqueda.trim()) {
    const q = busqueda.toLowerCase();
    visibles = visibles.filter(t =>
      t.title?.toLowerCase().includes(q) ||
      t.notes?.toLowerCase().includes(q) ||
      nombreProyecto(t)?.toLowerCase().includes(q) ||
      users.find(u => u.id === t.assignee_id)?.name?.toLowerCase().includes(q)
    );
  }
  // El aviso mira todo lo del usuario, no lo que dejó el filtro: si al tocar
  // "Completadas" desapareciera el conteo de vencidas, la señal se apagaría
  // justo cuando sigue siendo cierta.
  // El aviso de arriba es sobre lo que te toca a ti: a María no se le prende
  // la alarma por una tarea vencida de Héctor.
  const baseAviso = veTodo ? visibles : visibles.filter(esMia);
  const paraAvisar = filtroP === "all" ? baseAviso : baseAviso.filter(t => t.project_id === Number(filtroP));

  if (filtro === "atrasadas") visibles = visibles.filter(t => t.status !== "listo" && t.due_date && daysUntil(t.due_date) < 0);
  if (filtro === "pausadas") visibles = visibles.filter(t => t.status === "bloqueado");
  if (filtro === "urgente") visibles = visibles.filter(t => t.status !== "listo" && (t.priority === "urgente" || daysUntil(t.due_date) <= 1));
  if (filtro === "listo") visibles = visibles.filter(t => t.status === "listo");
  // Los que se activan tocando los avisos de arriba: mismas reglas que sus conteos.
  if (filtro === "vencidas") visibles = visibles.filter(t => t.status !== "listo" && t.due_date && daysUntil(t.due_date) < 0);
  if (filtro === "hoy") visibles = visibles.filter(t => t.status !== "listo" && t.due_date && daysUntil(t.due_date) === 0);
  if (filtro === "urgentes") visibles = visibles.filter(t => t.status !== "listo" && t.priority === "urgente" && !(t.due_date && daysUntil(t.due_date) <= 0));
  if (filtroP !== "all") visibles = visibles.filter(t => t.project_id === Number(filtroP));
  // Lo terminado no se mezcla con lo que falta: se ve cuando se lo pide.
  if (!verListas) visibles = visibles.filter(t => t.status !== "listo");

  // Manda la fecha, y lo terminado al fondo: una lista de pendientes que no
  // mira la fecha no sirve, y elegir entre cuatro órdenes era una decisión más
  // para algo que casi siempre se quiere igual.
  // Sin fecha va al fondo: Infinity menos Infinity da NaN y el orden se rompía.
  const cuantoFalta = t => (t.due_date ? daysUntil(t.due_date) : Number.MAX_SAFE_INTEGER);
  const porFecha = (a, b) => (cuantoFalta(a) - cuantoFalta(b)) || (ordenPrioridad[a.priority] - ordenPrioridad[b.priority]);
  const ordenadas = visibles.slice().sort((a, b) => {
    if (a.status === "listo" && b.status !== "listo") return 1;
    if (b.status === "listo" && a.status !== "listo") return -1;
    return porFecha(a, b);
  });

  // Las tres cosas de uno, en el orden en que aprietan: una reunión tiene hora
  // y no espera, una tarea tiene dueño, una actividad es del proyecto.
  const sinNadie = t => !t.assignee_id && !t.responsable_externo && t.status !== "listo";
  const bloques = [
    { clase: "reunion", titulo: "Reuniones", etiqueta: "REUNIÓN", tareas: ordenadas.filter(esReunion) },
    { clase: "tarea", titulo: "Tareas", etiqueta: "TAREA", tareas: ordenadas.filter(t => claseDe(t) === "tarea") },
    { clase: "gestion", titulo: "Gestiones de proyectos", etiqueta: "GESTIÓN", tareas: ordenadas.filter(esGestion) },
  ].filter(b => b.tareas.length).map(b => ({ ...b, sueltas: b.tareas.filter(sinNadie).length }));
  const bloquesMovil = bloques.map(b => ({ clave: b.titulo, titulo: b.titulo, tareas: b.tareas }));

  const filtS = a => ({ padding: "6px 14px", borderRadius: 20, border: a ? "none" : `1px solid ${colors.border}`, cursor: "pointer", fontFamily: colors.font, fontSize: 12, fontWeight: 600, background: a ? colors.ink : "#fff", color: a ? "#fff" : colors.inkSoft, flexShrink: 0 });

  return (
    <div style={{ minHeight: "100vh", background: colors.bg, fontFamily: colors.font, display: "flex", flexDirection: "column" }}>
      <Header
        busqueda={busqueda} setBusqueda={setBusqueda}
        alertCount={alertCount} onOpenAlerts={() => { setVista("tareas"); setFiltro("urgente"); setShowAlerts(true); }}
        admin={puede("ajustes.ver")} onOpenAjustes={() => setShowAjustes(true)}
        usuario={usuario} onLogout={logout}
        onNuevaTarea={() => { setEditTask(null); setShowModal(true); }}
      />

      <div className="app-shell-layout" style={{ display: "flex", flex: 1, maxWidth: 1600, margin: "0 auto", width: "100%" }}>
        <Sidebar puede={puede} usuario={usuario} empresa={empresa} vista={vista} setVista={setVista} admin={admin} verPipeline={verPipeline} />

        <div className="app-content" style={{ flex: 1, overflowY: "auto", minHeight: "calc(100vh - 54px)" }}>
          {vista === "tareas" && (
            <>
              {/* Lo primero de la pantalla y para todos los roles: antes las
                  herramientas de NOVA se comían el tope y una tarea vencida
                  aparecía cuarta, debajo del pliegue en el teléfono. */}
              <AvisoTareas tasks={paraAvisar} filtro={filtro} onFiltrar={setFiltro} />

              {/* NOVA para todos: cualquiera puede dictar "terminé la inspección".
                  Solo cierra tareas que esa persona puede cambiar. */}
              <NovaInput currentUser={usuario} projects={proyectosElegibles}
                users={asignables} puedeAsignarATodos={puede("tareas.asignar")}
                tareas={tareas.filter(t => t.status !== "listo" && (admin || t.assignee_id === usuario.id))}
                onCambiarEstado={cambiarEstado} onTaskCreated={fetchTareas} />
              {admin && <AIBriefing tasks={tareas} currentUser={usuario} users={users} projects={projects} />}

              {/* La barra, en dos renglones y en el orden en que se piensa:
                  primero cómo quiero verlas, después cuáles quiero ver. Antes
                  los filtros, el orden, el proyecto y las vistas estaban todos
                  mezclados en la misma fila y no se sabía qué hacía qué. */}
              {/* Una sola barra: cómo se ve y de qué proyecto. El orden ya no se
                  elige —manda la fecha, que es lo que importa de una lista de
                  pendientes— y los estados tampoco se filtran: lo terminado se
                  muestra con un interruptor y lo urgente ya está en los avisos
                  de arriba. Antes eran tres filas de controles sobre la lista. */}
              <div className="tareas-barra">
                <div className="tareas-vistas">
                  {[["lista", "Lista"], ["tablero", "Tablero"], ["calendario", "Calendario"]].map(([v, l]) => (
                    <button key={v} onClick={() => setVistaTareas(v)} style={{ padding: "5px 12px", borderRadius: 6, border: "none", cursor: "pointer", fontFamily: colors.font, fontSize: 12, fontWeight: 600, background: vistaTareas === v ? colors.surface : "transparent", color: vistaTareas === v ? colors.brand : colors.inkSoft }}>{l}</button>
                  ))}
                </div>
                {proyectosElegibles.length > 0 && <select value={filtroP} onChange={e => setFiltroP(e.target.value)} style={{ background: "#fff", border: `1px solid ${filtroP !== "all" ? colors.brand : colors.border}`, borderRadius: 20, color: filtroP !== "all" ? colors.brand : colors.inkSoft, padding: "6px 12px", fontSize: 12, fontFamily: colors.font, cursor: "pointer", flexShrink: 0 }}>
                  <option value="all">{veTodo ? "Todos los proyectos" : "Mis tareas"}</option>
                  {proyectosElegibles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>}
                <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: colors.inkSoft, cursor: "pointer", flexShrink: 0 }}>
                  <input type="checkbox" checked={verListas} onChange={e => setVerListas(e.target.checked)} /> Ver completadas
                </label>
                {filtro !== "todas" && (
                  <button onClick={() => setFiltro("todas")} style={{ ...filtS(true), padding: "5px 12px" }}>
                    {ETIQUETA_FILTRO[filtro] || filtro} ✕
                  </button>
                )}
              </div>

              {cargando ? <div style={{ textAlign: "center", color: colors.muted, padding: "40px 0", fontSize: 13 }}>Cargando...</div> : (
                <>
                  {/* Lo tuyo, todo a la vista y separado por lo que es: las
                      reuniones primero —tienen hora y no se posponen solas—,
                      después las tareas y al final las gestiones de los
                      proyectos —pedir una cotización, esperar un documento—. Antes eran tres pestañas: para saber qué tenías
                      hoy había que abrir las tres. */}
                  <div className="tasks-view-desktop">
                    {ordenadas.length === 0 ? <div style={{ textAlign: "center", color: colors.muted, padding: "60px 0", fontSize: 13 }}>{VACIO}</div>
                      : vistaTareas === "calendario"
                        ? <TareasCalendario tasks={ordenadas} users={users} projects={projects} leads={leadsPorId} currentUser={usuario} onEditar={t => { setEditTask(t); setShowModal(true); }} />
                      : vistaTareas === "tablero"
                        ? <TareasKanban tasks={ordenadas} users={users} projects={projects} leads={leadsPorId} currentUser={usuario} onCambiarEstado={cambiarEstado} onEditar={t => { setEditTask(t); setShowModal(true); }} />
                        : bloques.map(b => (
                            <div key={b.titulo} style={{ marginBottom: 16 }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: CLASES[b.clase].color, letterSpacing: 0.5, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ width: 8, height: 8, borderRadius: 2, background: CLASES[b.clase].color }} />
                                {b.titulo.toUpperCase()} · {b.tareas.length}
                                {b.sueltas > 0 && <span style={{ color: colors.danger }}> · {b.sueltas} SIN RESPONSABLE</span>}
                              </div>
                              <TareasTabla tasks={b.tareas} users={users} projects={projects} leads={leadsPorId} etiqueta={b.etiqueta} clase={b.clase}
                                onEditar={t => { setEditTask(t); setShowModal(true); }} />
                            </div>
                          ))}
                  </div>
                  {/* Lo primero son las tareas de uno; en qué anda el resto va
                      abajo, en su propio cuadro, sin lo marcado como privado. */}
                  <TareasDeLosDemas
                    tasks={tareas.filter(t => t.assignee_id !== usuario.id && (!t.privada || admin || t.created_by === usuario.id))}
                    users={users.filter(u => u.id !== usuario.id)} projects={projects} leads={leadsPorId}
                    onEditar={t => { setEditTask(t); setShowModal(true); }} />

                  <div className="tasks-view-mobile">
                    {ordenadas.length === 0 ? <div style={{ textAlign: "center", color: colors.muted, padding: "60px 0", fontSize: 13, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}><ListTodo size={32} />{VACIO}</div>
                      : vistaTareas === "calendario"
                        ? <TareasCalendario tasks={ordenadas} users={users} projects={projects} leads={leadsPorId} currentUser={usuario} onEditar={t => { setEditTask(t); setShowModal(true); }} />
                      : vistaTareas === "lista"
                        ? <TareasListaMovil tasks={ordenadas} grupos={bloquesMovil} users={users} projects={projects} leads={leadsPorId} comentarios={comentarios} onEditar={t => { setEditTask(t); setShowModal(true); }} />
                        : ordenadas.map(t => <TarjetaTarea key={t.id} task={t} puede={puede} currentUser={usuario} users={users} projects={projects} leads={leadsPorId} comentarios={comentarios[t.id] || 0}
                            acompanantes={acompanantes.get(t.id) || []}
                            espera={(dependencias.espera.get(t.id) || []).map(id => tareas.find(x => x.id === id)).filter(x => x && x.status !== "listo")}
                            onCambiarEstado={cambiarEstado} onEditar={t => { setEditTask(t); setShowModal(true); }} onEliminar={eliminarTarea} />)}
                  </div>
                </>
              )}
            </>
          )}

          {puede("presupuestos.ver") && vista === "presupuestos" && (
            <ModuloPresupuestos currentUser={usuario} puede={puede} projects={projects} />
          )}
          {puede("controlObra.ver") && vista === "controlObra" && (
            <ModuloControlObra currentUser={usuario} puede={puede} projects={projects} />
          )}
          {verPipeline && vista === "leads" && (
            <ModuloLeads currentUser={usuario} users={users} puede={puede} onIrAObra={() => setVista("controlObra")} />
          )}

          {puede("cajaChica.ver") && vista === "cajaChica" && (
            <ModuloCajaChica currentUser={usuario} puede={puede} projects={projects} users={users} />
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
                        <div style={{ fontSize: 11, color: colors.inkSoft, marginTop: 2 }}>{nombreProyecto(t)} · {users.find(u => u.id === t.assignee_id)?.name || "Sin asignar"} · Vencida {Math.abs(daysUntil(t.due_date))}d</div>
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
                        <div style={{ fontSize: 11, color: colors.inkSoft, marginTop: 2 }}>{nombreProyecto(t)} · {users.find(u => u.id === t.assignee_id)?.name || "Sin asignar"} · {daysUntil(t.due_date) === 0 ? "Hoy" : `en ${daysUntil(t.due_date)}d`}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {showModal && <ModalTarea editTask={editTask} pipeline={proyectosPipeline} acompanantes={editTask ? (acompanantes.get(editTask.id) || []) : []} tareas={tareas} onCambio={() => { fetchTareas(); cargarEquipoDeTareas(); }} puede={puede} currentUser={usuario} users={users} projects={projects} proyectosElegibles={proyectosElegibles} asignables={asignables} onProyectoCreado={recargarEquipo} onEliminar={eliminarTarea} onCerrar={() => { setShowModal(false); setEditTask(null); }} onGuardar={guardarTarea} />}
      {showAjustes && <PanelAjustes puede={puede} usuario={usuario} permisos={permisos} setPermisos={setPermisos} equipoRemoto={equipoRemoto} onEquipoCambio={recargarEquipo} users={users} setUsers={setUsers} projects={projects} setProjects={setProjects} empresa={empresa} setEmpresa={setEmpresa} onClose={() => setShowAjustes(false)} />}
    </div>
  );
}
