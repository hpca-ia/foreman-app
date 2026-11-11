import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { supabase } from "./lib/supabase";
import { loadFromStorage, saveToStorage } from "./lib/storage";
import { daysUntil } from "./lib/dates";
import { esAdmin } from "./lib/roles";
import { cargarPermisos, cargarPermisosUsuario, crearPuede, crearLeToca, hayQuienHaga } from "./lib/permisos";
import { equipoEnCache, cargarEquipo } from "./lib/equipo";
import { colors } from "./theme/colors";
import { unirProyectos } from "./lib/proyectos";
import { nivelDeAcceso, nivelDeArea, veLaTarea } from "./lib/acceso";
import { volvioAlVisto } from "./lib/estadoDeCompra";
import { misObservaciones } from "./modules/observaciones/observaciones";
import { claseDe } from "./theme/constants";

import LoginScreen from "./components/LoginScreen";
import { salir, mensajeError } from "./lib/sesion";
import NovaInput from "./components/NovaInput";
import AIBriefing from "./components/AIBriefing";
import PanelAvisos from "./components/PanelAvisos";
import Bandeja from "./components/Bandeja";
import { bandeja, sinCompras, alReprogramar, alDelegar, alDescartar, alReabrir, tareaRapida } from "./lib/bandeja";
import { avisosDelTablero } from "./lib/avisos";
import CargadorDeAvisos from "./components/CargadorDeAvisos";
import { avisosDelPipeline, esMiAviso, diaCorto } from "./modules/leads/pipeline";
import TareasCalendario from "./components/TareasCalendario";
import TareasDeLosDemas from "./components/TareasDeLosDemas";
import ModalTarea from "./components/ModalTarea";
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";

// Cada módulo se baja cuando se entra a él. Antes viajaban todos en el primer
// paquete —con el motor de Excel y el de PDF adentro—, así que quien abre
// FOREMAN en el teléfono para ver sus tareas del día esperaba por cosas que usa
// una vez por semana.
const ModuloLeads = lazy(() => import("./modules/leads/ModuloLeads"));
const ModuloEnMarcha = lazy(() => import("./modules/leads/ModuloEnMarcha"));
const ModuloPresupuestos = lazy(() => import("./modules/ModuloPresupuestos"));
const ModuloControlObra = lazy(() => import("./modules/controlObra/ModuloControlObra"));
const ModuloCajaChica = lazy(() => import("./modules/ModuloCajaChica"));
const ModuloCompras = lazy(() => import("./modules/compras/ModuloCompras"));
const ModuloLibro = lazy(() => import("./modules/libro/ModuloLibro"));
const ModuloObservaciones = lazy(() => import("./modules/observaciones/ModuloObservaciones"));
const ModuloActas = lazy(() => import("./modules/actas/ModuloActas"));
const ModuloCronograma = lazy(() => import("./modules/cronograma/ModuloCronograma"));
const ModuloManoDeObra = lazy(() => import("./modules/manoDeObra/ModuloManoDeObra"));
const PanelAjustes = lazy(() => import("./components/PanelAjustes"));

// Mientras llega el módulo: un renglón discreto, no una pantalla en blanco.
const Cargando = () => (
  <div style={{ textAlign: "center", color: colors.muted, padding: "60px 0", fontSize: 13 }}>Cargando…</div>
);

export default function App() {
  // Arranca con la copia guardada en el navegador y se refresca desde la base:
  // así la pantalla de ingreso no espera, pero todos los equipos terminan
  // viendo la misma lista.
  const [users, setUsers] = useState(() => equipoEnCache().usuarios);
  const [equipoRemoto, setEquipoRemoto] = useState(true);
  const [empresa, setEmpresa] = useState(() => loadFromStorage("foreman_empresa", {
    nombre: "HCA Studio", tipo: "Construcción", email: "", telefono: "", web: "", ciudad: "Quito", moneda: "USD", color: colors.brand, logoUrl: "",
  }));
  const [usuario, setUsuario] = useState(null);
  const [tareas, setTareas] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [vistaPedida, setVista] = useState("tareas");
  // El presupuesto cuyo cronograma se pidió abrir desde Presupuestos.
  const [cronoPedido, setCronoPedido] = useState(null);
  const [vistaTareas, setVistaTareas] = useState("lista");
  // Quién acompaña a cada tarea, y qué tarea espera a cuál.
  // Lo último de las tareas, para poder leer sus acompañantes sin volver a
  // armar la función cada vez que cambia la lista.
  // Lo completado se guarda, no se tira: se ve cuando alguien lo pide.
  const [verListas, setVerListas] = useState(false);
  const [filtroP, setFiltroP] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [showAjustes, setShowAjustes] = useState(false);
  const [permisos, setPermisos] = useState(null);
  // Las excepciones de cada persona, que mandan sobre las de su rol.
  const [permisosUsuario, setPermisosUsuario] = useState({});
  const [showAlerts, setShowAlerts] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => { setShowAlerts(false); setShowAjustes(false); setShowModal(false); }, [usuario]);
  useEffect(() => { cargarPermisos().then(setPermisos); cargarPermisosUsuario().then(setPermisosUsuario); }, []);
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
    setUsers(eq.usuarios); setEquipoRemoto(eq.remoto);
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
  const [accesosLead, setAccesosLead] = useState({});
  const [proyectosPipeline, setProyectosPipeline] = useState([]);
  const [comentarios, setComentarios] = useState({});   // task_id -> cuántos
  // Qué compra abrir al tocar su aviso en el tablero. Va acá arriba y no junto
  // a `abrirTarea`, que es donde se usa: abajo quedaría DESPUÉS del `return` de
  // la pantalla de login, y un hook después de un return temprano se saltea
  // cuando esa rama corre. React cuenta los hooks por orden y deja la app en
  // blanco. Ya pasó una vez; por eso este comentario.
  const [compraAbierta, setCompraAbierta] = useState(null);
  // Las observaciones de obra que esta persona tiene encima. No son tareas
  // —una observación es un defecto, no un encargo— pero tienen que recordarse
  // en algún lado, o se enteran cuando alguien pregunta por WhatsApp.
  const [misObs, setMisObs] = useState([]);
  const [misCompras, setMisCompras] = useState([]);
  // Lo que los demás módulos tienen para avisar: órdenes de cambio, las dos
  // revisiones de Control, alquileres y actas. Se trae después de dibujar.
  const [avisosDeModulos, setAvisosDeModulos] = useState(null);
  const tienePipeline = Object.keys(leadsPorId).length > 0;
  // Los proyectos de la oficina: los que se persiguen y los aprobados. Las
  // tareas se cuelgan de ahí igual que de los proyectos de Ajustes, para que
  // no haya dos listas con el mismo nombre y haya que adivinar cuál elegir.
  //
  // Vienen con su etapa y con si esperan al cliente: de ahí salen los avisos
  // del pipeline. Si esas columnas todavía no existen (migración 171) se
  // traen sin ellas: los nombres de los proyectos no pueden depender de eso.
  const cargarLeads = useCallback(async () => {
    const base = "id,nombre,tunel,es_lead,resultado,color,created_by,responsable_id,obra_id";
    let { data, error } = await supabase.from("leads").select(`${base},etapa,espera_desde,espera_que,recordar_el`);
    if (error) ({ data, error } = await supabase.from("leads").select(base));
    const filas = error ? [] : data || [];
    setLeadsPorId(Object.fromEntries(filas.map(l => [l.id, l.nombre])));
    setProyectosPipeline(filas.filter(l => l.resultado !== "perdido"));
  }, []);
  // Al volver al tablero se traen de nuevo: un lead que se movió en el
  // pipeline tiene que dejar de avisar acá sin recargar la página.
  useEffect(() => { if (usuario && vistaPedida === "tareas") cargarLeads(); }, [usuario, vistaPedida, cargarLeads]);
  useEffect(() => {
    if (!usuario) return;
    // Quién entra a cada proyecto del pipeline: es lo que antes decían los
    // miembros del proyecto de Ajustes.
    // Quién entra a cada proyecto y con qué nivel: ver o editar.
    supabase.from("lead_accesos").select("*").then(({ data }) => {
      const m = {};
      (data || []).forEach(a => {
        (m[a.lead_id] = m[a.lead_id] || {})[a.usuario_id] = {
          nivel: a.nivel || "editar",
          presupuesto: a.nivel_presupuesto || null,
          obra: a.nivel_obra || null,
          libro: a.nivel_libro || null,
        };
      });
      setAccesosLead(m);
    });
    misObservaciones(usuario.id).then(setMisObs).catch(() => {});
    // Lo que espera a esta persona en compras: lo que pidió y le devolvieron,
    // y lo que le toca aprobar o comprar. El módulo ya sabe decirlo; acá solo
    // hace falta el número para el menú y la línea del tablero.
    supabase.from("compras_solicitudes")
      .select("id,estado,solicitante_id,descripcion,aprobado_at")
      .in("estado", ["pendiente_aprobacion", "requiere_info", "aprobada"])
      .then(({ data }) => setMisCompras(data || []));
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
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "tasks" }, p => setTareas(prev => (prev.some(t => t.id === p.new.id) ? prev : [p.new, ...prev])))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "tasks" }, p => setTareas(prev => prev.map(t => t.id === p.new.id ? p.new : t)))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "tasks" }, p => setTareas(prev => prev.filter(t => t.id !== p.old.id)))
      .subscribe();
    // Una red por si el tiempo real se cae, no la fuente principal: cada
    // quince segundos se traía la tabla entera de tareas para siempre, con la
    // pestaña en segundo plano incluida. Ahora es cada minuto y solo cuando
    // alguien está mirando; los cambios siguen llegando al instante por el
    // canal de arriba.
    const poll = setInterval(async () => {
      if (document.hidden) return;
      const { data } = await supabase.from("tasks").select("*").order("created_at", { ascending: false });
      if (data) setTareas(data);
    }, 60000);
    return () => { supabase.removeChannel(tCh); clearInterval(poll); };
  }, [usuario]);

  async function fetchTareas() {
    setCargando(true);
    const { data } = await supabase.from("tasks").select("*").order("created_at", { ascending: false });
    setTareas(data || []);
    setCargando(false);
  }

  /** Le avisa por correo a quien quedó a cargo. Devuelve el motivo si no pudo. */
  async function avisarPorCorreo(tareaId) {
    try {
      const r = await fetch("/api/aviso?de=tarea", {
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
    const borrada = tareas.find(t => t.id === id);
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) { alert("No se pudo borrar: " + error.message); return false; }
    // Si era de un proyecto, allá deja de verse sola: es la misma fila. No
    // hay ningún vínculo que cortar ni etapa que poner al día.
    setTareas(prev => prev.filter(t => t.id !== id));
    return true;
  }

  // ── Lo que se hace desde la fila de la bandeja, sin abrir nada ──────────
  // Un cambio en la tarea, y si es de un proyecto queda escrito en su
  // historia. Se ve al instante y se guarda atrás: si no se pudo, se dice y se
  // vuelve a traer la lista.
  async function tocarTarea(t, campos, nota) {
    setTareas(prev => prev.map(x => (x.id === t.id ? { ...x, ...campos } : x)));
    let { error } = await supabase.from("tasks").update(campos).eq("id", t.id);
    // Sin la migración 172 no existe `descartada`: se cierra igual, sin la marca.
    if (error && /descartada/.test(error.message)) {
      const { descartada, ...resto } = campos;
      ({ error } = await supabase.from("tasks").update(resto).eq("id", t.id));
    }
    if (error) { alert("No se pudo guardar: " + error.message); fetchTareas(); return; }
    if (t.lead_id && nota) {
      await supabase.from("lead_movimientos").insert({
        lead_id: t.lead_id, tipo: "nota", automatico: true, detalle: nota, autor_id: usuario.id, autor_nombre: usuario.name,
      });
    }
  }
  const reabrirTarea = t => tocarTarea(t, alReabrir(), `Volvió a abrir: ${t.title}`);
  const reprogramarTarea = (t, fecha) => tocarTarea(t, alReprogramar(fecha), fecha ? `"${t.title}" queda para el ${diaCorto(fecha)}` : `"${t.title}" se queda sin fecha`);
  // «Ya no va»: se cierra sin haberse hecho, y lo dice.
  const descartarTarea = t => tocarTarea(t, alDescartar(usuario.name), `Ya no va: ${t.title}`);
  async function delegarTarea(t, usuarioId) {
    const nombre = users.find(u => u.id === usuarioId)?.name || "otra persona";
    await tocarTarea(t, alDelegar(usuarioId), `"${t.title}" pasa a ${nombre}`);
    // El nuevo se entera: enterarse por casualidad de que algo era tuyo es la
    // forma más cara de perder una semana.
    if (usuarioId !== usuario.id) avisarPorCorreo(t.id);
  }
  // Se agrega escribiendo y Enter. Devuelve el motivo si no se pudo.
  async function agregarRapida({ titulo, proyecto, fecha }) {
    const r = tareaRapida({ titulo, usuarioId: usuario.id, proyecto, fecha });
    if (r.error) return r.error;
    const { data, error } = await supabase.from("tasks").insert(r.fila).select().single();
    if (error) return mensajeErrorTarea(error);
    if (data) setTareas(prev => (prev.some(t => t.id === data.id) ? prev : [data, ...prev]));
    return null;
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
    // Cuándo se cerró y quién, escrito en la tarea. Lo lee la etapa del
    // proyecto donde esté, que muestra esta misma fila.
    const cerrada = { hecha_at: estado === "listo" ? new Date().toISOString() : null, hecha_por: estado === "listo" ? usuario.name : null };
    setTareas(prev => prev.map(t => t.id === id ? { ...t, ...campos, ...cerrada } : t));
    let { error } = await supabase.from("tasks").update({ ...campos, ...cerrada }).eq("id", id);
    // Sin la migración 170 esas dos columnas no existen: se guarda sin ellas.
    if (error && /column|schema cache/i.test(error.message)) {
      ({ error } = await supabase.from("tasks").update(campos).eq("id", id));
    }
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

    // Si la tarea es de un proyecto, allá se ve cerrada sin hacer nada más:
    // es la misma fila. Y si era su próximo paso, deja de serlo.

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
    const form = formEntero;
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
      // Si cambió de manos, el nuevo se entera: enterarse por casualidad de que
      // algo era tuyo es la forma más cara de perder una semana.
      if (form.assignee_id && form.assignee_id !== antes?.assignee_id) await avisarPorCorreo(id);
    } else {
      const { data: creada, error } = await guardar({ ...form, ...(form.es_aprobacion ? { aprobacion_estado: "pendiente" } : {}) });
      if (error) { alert(mensajeErrorTarea(error)); return; }
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
  const puede = crearPuede(usuario, permisos, permisosUsuario);
  // `puede` contesta si tenés acceso; `leToca`, si es tu trabajo. Para una
  // bandeja de pendientes manda la segunda: ver más abajo, en las compras.
  const leToca = crearLeToca(usuario, permisos, permisosUsuario);
  // Se calcula acá y no antes: `puede` todavía no existe más arriba.
  //
  // Decía `puede("leads.ver") || tienePipeline`, y `tienePipeline` es "existe
  // al menos un proyecto en la oficina". O sea: el permiso no hacía nada y
  // Pipeline se le mostraba a todo el mundo, siempre. Un arquitecto Jr. veía
  // el embudo comercial entero —otros clientes, otras obras, en qué etapa está
  // cada negociación— cuando lo único que le toca es su proyecto.
  //
  // Ahora entra quien tiene el permiso de verlos todos, o quien está asignado
  // a alguno: ahí el módulo le sirve y adentro ve solo el suyo.
  // Un permiso propio, y nada más. El Pipeline es el embudo comercial de la
  // oficina —qué se persigue, con quién, en qué etapa— y eso es de dirección,
  // gerencia y los arquitectos que llevan propuestas. Un residente o un Jr. no
  // tienen nada que hacer ahí: su proyecto lo ven en Tareas, en Control de
  // Obra y en el Libro.
  //
  // Hasta hoy lo abría "Entra a todos los proyectos", que es otra cosa: ese
  // decide a CUÁNTOS proyectos entra, no qué módulos ve. Un interruptor que
  // hace dos trabajos no deja pedir uno sin el otro.
  const verPipeline = puede("pipeline.ver");
  // El nombre del proyecto de una tarea: el del pipeline si viene de ahí, el de
  // Ajustes si no. (Se llamaba a sí misma: al buscar por texto una tarea con
  // proyecto normal, el navegador se quedaba sin pila y la pantalla se caía.)
  const nombreProyecto = t => (t.lead_id ? (leadsPorId[t.lead_id] || "Proyecto") : "");
  // Quien no entra al Tablero —un conductor, que solo rinde su caja— no puede
  // quedarse mirando una pantalla que no le toca: se lo lleva al primer módulo
  // que sí tenga.
  //
  // Se resuelve al pintar y no con un useEffect: acá arriba ya se volvió con
  // la pantalla de ingreso, así que un hook puesto después de ese return se
  // ejecuta en unos renders y en otros no, y React tumba la app entera. Eso
  // fue exactamente lo que pasó: FOREMAN quedó en blanco al entrar.
  const primeraVista = () => {
    const puertas = [
      ["tareas", "tareas.ver"], ["leads", null], ["presupuestos", "presupuestos.ver"],
      ["controlObra", "controlObra.ver"], ["libro", "libro.ver"], ["observaciones", "observaciones.ver"],
      ["actas", "actas.ver"],
      ["compras", "compras.ver"], ["cajaChica", "cajaChica.ver"],
    ];
    for (const [v, permiso] of puertas) {
      if (v === "leads" ? verPipeline : puede(permiso)) return v;
    }
    return "tareas";
  };
  const vista = vistaPedida === "tareas" && !puede("tareas.ver") ? primeraVista() : vistaPedida;

  const veTodo = puede("tareas.todas");
  // Quien no ve todo solo elige entre los proyectos donde es miembro.
  // Una sola lista de proyectos: los del pipeline —que son los de verdad— y,
  // mientras convivan, los de Ajustes que todavía no se empataron. El filtro
  // miraba solo los de Ajustes, así que una tarea del pipeline no aparecía por
  // más que se eligiera su proyecto.
  const proyectosTodos = unirProyectos(proyectosPipeline, accesosLead);
  // Los que creó esta persona: entra sin que nadie se lo asigne.
  const leadsMios = new Set(proyectosPipeline.filter(l => l.created_by === usuario.id).map(l => l.id));
  // ────────────────────────────────────────────────────────────────────────
  // Los permisos, en dos preguntas y nada más.
  //
  //   1. ¿Entra al módulo?  Lo dice el permiso del rol o de la persona
  //      (Ajustes → Permisos). Es la puerta del edificio: sin eso no ve
  //      siquiera el botón.
  //
  //   2. ¿A qué proyectos, y para qué?  Lo dice Ajustes → Proyectos, donde
  //      cada persona tiene su nivel en el proyecto y en cada área.
  //
  // Prender "ver presupuestos" no abre todos los presupuestos: abre la
  // pantalla, y adentro salen los de los proyectos que le asignaste. Quien
  // entra a todos los proyectos —Director, admins, gerentes— los trabaja
  // todos, y ahí sí el permiso del módulo es lo único que lo limita.
  //
  // `nivelEn` devuelve "editar", "ver" o null. Null es no entra, y punto: no
  // hay un tercer valor que haya que recordar.
  // ────────────────────────────────────────────────────────────────────────
  // La regla entera vive en lib/acceso.js; acá solo se le pasa el caso.
  const entraATodo = veTodo || puede("leads.ver");
  const nivelEn = (leadId, area = "proyecto") => (leadId
    ? nivelDeAcceso({ acceso: accesosLead[leadId]?.[usuario.id], area, entraATodo, esMio: leadsMios.has(leadId) })
    : entraATodo ? "editar" : null);
  const nivelProyecto = leadId => nivelEn(leadId, "proyecto");
  const nivelPresupuesto = leadId => nivelEn(leadId, "presupuesto");
  const nivelLibro = leadId => nivelEn(leadId, "libro");
  const nivelObra = leadId => nivelEn(leadId, "obra");
  // Dónde está esta persona DE VERDAD: los proyectos que alguien le asignó en
  // Ajustes → Proyectos. No los que puede mirar.
  //
  // Es otra pregunta que "¿entra?", y hay módulos que necesitan esta y no
  // aquella. "Entra a todos los proyectos" y "las tareas de todos" son
  // permisos de lectura —sirven para mirar el pipeline y coordinar—; tomados
  // como asignación, cualquiera con uno de los dos prendido podía cargarle una
  // compra a una obra en la que no pisa. Acá solo cuenta que alguien lo haya
  // puesto en ese proyecto, por la puerta del proyecto o por la de la obra.
  const leadsAsignados = new Set(
    Object.entries(accesosLead)
      .filter(([, deCadaUno]) => {
        const mio = deCadaUno?.[usuario.id];
        return !!(nivelDeArea(mio, "proyecto") || nivelDeArea(mio, "obra"));
      })
      .map(([leadId]) => Number(leadId))
  );
  const mios = proyectosTodos.filter(p => !!nivelProyecto(p.id));
  const proyectoElegido = proyectosTodos.find(p => p.clave === filtroP) || null;
  // A quién puede asignarle tareas. Con el permiso de asignar, a cualquiera.
  // Sin él, a sí mismo y a sus compañeros: quienes comparten con él al menos un
  // proyecto. Así se coordinan en obra sin poder cargarle tareas a un admin o a
  // gente de otras obras.
  // Los proyectos son los del pipeline: comparte uno con alguien si los dos
  // entran a él, o si uno lo abrió y el otro entra.
  const compañeros = new Set(mios.flatMap(p => [...p.gente, p.creador].filter(Boolean)));
  const asignables = puede("tareas.asignar") ? users : users.filter(u => u.id === usuario.id || compañeros.has(u.id));
  // Un aviso de compra no se abre como tarea.
  //
  // Lo que uno quiere hacer al tocarlo es ver el pedido: las cotizaciones, el
  // monto, contra qué va. El modal de tarea muestra el título y el responsable
  // —nada de eso— y encima deja editar un recordatorio que el circuito maneja
  // solo. Se va al pedido, que es el origen.
  //
  // `compra_id` lo pone la 069; sin ella se encuentra por la tarea, que la
  // solicitud guarda desde siempre en `tarea_id`.
  const abrirTarea = t => {
    if (claseDe(t) === "compra") {
      setCompraAbierta({ compraId: t.compra_id || null, tareaId: t.id });
      setVista("compras");
      return;
    }
    setEditTask(t); setShowModal(true);
  };
  // LAS TAREAS DE VERDAD. Los avisos que deja el circuito de compras no son
  // tarea de nadie: se siguen en Compras y acá aparecen en el panel de Avisos.
  const propias = sinCompras(tareas);
  // La campana: lo mío que venció o vence en dos días. Manda la fecha, y nada
  // más: «urgente» ya no existe.
  const apremia = t => !!t.due_date && daysUntil(t.due_date) <= 2;
  const misAlertasTareas = veTodo
    ? propias.filter(t => t.status !== "listo" && apremia(t))
    : propias.filter(t => (t.assignee_id === usuario.id || t.created_by === usuario.id) && t.status !== "listo" && apremia(t));
  const alertCount = misAlertasTareas.length;
  // A quién le toca cada paso de una compra. Es la misma regla del módulo,
  // dicha acá para poder contar sin cargar la pantalla entera.
  // A QUIÉN LE TOCA, no quién puede.
  //
  // El Director puede todo por código —y tiene que poder, si no un error de
  // permisos lo deja fuera de su app—, pero con esa regla una compra APROBADA
  // le aparecía como "espera por vos" cuando ya no espera por él: la aprobó, y
  // ahora la ejecuta quien compra. Una bandeja que siempre tiene de todo se
  // aprende a ignorar, que es lo peor que le puede pasar a un aviso.
  //
  // El visto sigue siendo suyo: ahí sí decide. Lo que sale es el paso
  // siguiente, que es de otro.
  const hayQuienCompre = hayQuienHaga("compras.gestionar", users, permisos, permisosUsuario, usuario.id);
  const comprasQueMeTocan = misCompras.filter(c => {
    if (c.estado === "pendiente_aprobacion") return puede("compras.aprobar");
    // Si no hay nadie que compre, vuelve a ser del Director: lo que no tiene
    // dueño no puede quedar esperando a nadie.
    if (c.estado === "aprobada") return leToca("compras.gestionar") || !hayQuienCompre;
    return c.solicitante_id === usuario.id;        // requiere_info: se la devolvieron
  });
  // LOS AVISOS: todo lo activo que pide que esta persona haga algo. Del
  // pipeline, los leads a los que llega; cada quien ve los suyos y el Director
  // los de toda la oficina. Es la misma regla que arma el correo de la mañana.
  const avisos = avisosDelTablero({
    pipeline: verPipeline
      ? avisosDelPipeline({ leads: proyectosPipeline.filter(l => nivelProyecto(l.id)), tareas })
          .filter(a => esMiAviso(a, usuario.id, entraATodo))
      : [],
    compras: puede("compras.ver") ? comprasQueMeTocan : [],
    devueltas: puede("compras.ver") ? comprasQueMeTocan.filter(volvioAlVisto).length : 0,
    observaciones: puede("observaciones.ver") ? misObs : [],
    modulos: avisosDeModulos,
  });
  // El nivel de esta persona en el proyecto de una tarea. Una tarea sin
  // proyecto no es de ninguno: la ve quien la tiene o quien la escribió.
  const nivelDeTarea = t => (t.lead_id ? nivelEn(t.lead_id, "proyecto") : null);
  // Una sola regla, la misma de todo FOREMAN: es tuya, o entrás a su proyecto.
  // Antes había que acordarse de filtrar por proyecto para ver lo del equipo.
  // Todo lo que esta persona puede ver, sin filtros de pantalla encima. De acá
  // sale el cuadro "en qué anda el resto", que no debe achicarse porque uno
  // prendió un filtro para mirar lo suyo.
  const visiblesTodas = propias.filter(t => veLaTarea({
    tarea: t, usuarioId: usuario.id, admin, todas: veTodo, nivel: nivelDeTarea(t),
  }));
  let visibles = visiblesTodas;
  if (busqueda.trim()) {
    const q = busqueda.toLowerCase();
    visibles = visibles.filter(t =>
      t.title?.toLowerCase().includes(q) ||
      t.notes?.toLowerCase().includes(q) ||
      nombreProyecto(t)?.toLowerCase().includes(q) ||
      users.find(u => u.id === t.assignee_id)?.name?.toLowerCase().includes(q)
    );
  }
  if (proyectoElegido) visibles = visibles.filter(t => t.lead_id === proyectoElegido.id);

  // LA BANDEJA: «Me toca» y «Espero de otros». Qué va en cada parte lo decide
  // src/lib/bandeja.js. Los leads que esperan al cliente entran también —del
  // otro lado mientras esperan, de este el día del recordatorio—, salvo que se
  // esté mirando un solo proyecto o buscando una tarea.
  const filtrando = !!proyectoElegido || !!busqueda.trim();
  const datosBandeja = bandeja({
    tareas: visibles, usuarioId: usuario.id, veTodo,
    leads: verPipeline && !filtrando ? proyectosPipeline.filter(l => nivelProyecto(l.id)) : [],
  });
  // Lo que cerré o se cerró de lo que encargué, lo más nuevo arriba. Solo si se pide.
  const hechas = !verListas ? [] : visibles
    .filter(t => t.status === "listo" && (t.assignee_id === usuario.id || t.created_by === usuario.id))
    .sort((a, b) => String(b.hecha_at || b.updated_at || "").localeCompare(String(a.hecha_at || a.updated_at || "")))
    .slice(0, 40);
  // El calendario muestra todo lo que esta persona ve, con su fecha.
  const paraCalendario = visibles.filter(t => verListas || t.status !== "listo");

  return (
    <div style={{ minHeight: "100vh", background: colors.bg, fontFamily: colors.font, display: "flex", flexDirection: "column" }}>
      <Header
        busqueda={busqueda} setBusqueda={setBusqueda}
        alertCount={alertCount} onOpenAlerts={() => { setVista("tareas"); setShowAlerts(true); }}
        admin={puede("ajustes.ver")} onOpenAjustes={() => setShowAjustes(true)}
        usuario={usuario} onLogout={logout}
        onNuevaTarea={() => { setEditTask(null); setShowModal(true); }}
        // El buscador del encabezado busca en el tablero; en los otros módulos
        // cada pantalla tiene el suyo y dos buscadores arriba del otro hacen
        // dudar de cuál usar. El botón grande solo donde crea lo de ahí.
        buscaAca={vista === "tareas"}
        accion={vista === "tareas" ? { label: "Nueva tarea", onClick: () => { setEditTask(null); setShowModal(true); } } : null}
      />

      <div className="app-shell-layout" style={{ display: "flex", flex: 1, maxWidth: 1600, margin: "0 auto", width: "100%" }}>
        <Sidebar puede={puede} usuario={usuario} empresa={empresa} vista={vista} setVista={setVista} admin={admin} verPipeline={verPipeline}
          pendientes={{ observaciones: misObs.length, compras: comprasQueMeTocan.length }} />

        <div className="app-content" style={{ flex: 1, overflowY: "auto", minHeight: "calc(100vh - 54px)" }}>
          {puede("tareas.ver") && vista === "tareas" && (
            <div className={avisos.length ? "tablero-con-avisos" : undefined}>
            <div style={{ minWidth: 0 }}>
              {/* NOVA para todos: cualquiera puede dictar "terminé la inspección".
                  Solo cierra tareas que esa persona puede cambiar. */}
              <NovaInput currentUser={usuario} projects={mios}
                users={asignables} puedeAsignarATodos={puede("tareas.asignar")}
                tareas={propias.filter(t => t.status !== "listo" && (admin || t.assignee_id === usuario.id))}
                onCambiarEstado={cambiarEstado} onTaskCreated={fetchTareas} />
              {admin && <AIBriefing tasks={propias} currentUser={usuario} users={users} leads={leadsPorId} />}

              {/* Una sola barra: cómo se ve y de qué proyecto. El orden no se
                  elige —manda la fecha— y no hay filtros de estado ni de
                  urgencia: lo vencido ya está arriba de todo en la bandeja,
                  pidiendo una decisión. */}
              <div className="tareas-barra">
                <div className="tareas-vistas">
                  {[["lista", "Bandeja"], ["calendario", "Calendario"]].map(([v, l]) => (
                    <button key={v} onClick={() => setVistaTareas(v)} style={{ padding: "5px 12px", borderRadius: 6, border: "none", cursor: "pointer", fontFamily: colors.font, fontSize: 12, fontWeight: 600, background: vistaTareas === v ? colors.surface : "transparent", color: vistaTareas === v ? colors.brand : colors.inkSoft }}>{l}</button>
                  ))}
                </div>
                {mios.length > 0 && <select value={filtroP} onChange={e => setFiltroP(e.target.value)} style={{ background: "#fff", border: `1px solid ${filtroP !== "all" ? colors.brand : colors.border}`, borderRadius: 20, color: filtroP !== "all" ? colors.brand : colors.inkSoft, padding: "6px 12px", fontSize: 12, fontFamily: colors.font, cursor: "pointer", flexShrink: 0 }}>
                  <option value="all">Todos los proyectos</option>
                  {mios.map(p => <option key={p.clave} value={p.clave}>{p.name}</option>)}
                </select>}
                <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: colors.inkSoft, cursor: "pointer", flexShrink: 0 }}>
                  <input type="checkbox" checked={verListas} onChange={e => setVerListas(e.target.checked)} /> Ver hechas
                </label>
              </div>

              {cargando ? <div style={{ textAlign: "center", color: colors.muted, padding: "40px 0", fontSize: 13 }}>Cargando...</div> : (
                <>
                  {vistaTareas === "calendario"
                    ? <TareasCalendario tasks={paraCalendario} users={users} leads={leadsPorId} currentUser={usuario} onEditar={abrirTarea} />
                    : <Bandeja datos={datosBandeja} hechas={hechas} users={users} comentarios={comentarios} usuario={usuario} puede={puede}
                        nombreDe={nombreProyecto} proyectos={mios} asignables={asignables}
                        onAbrir={abrirTarea} onCompletar={t => cambiarEstado(t.id, "listo")} onReabrir={reabrirTarea}
                        onReprogramar={reprogramarTarea} onDelegar={delegarTarea} onDescartar={descartarTarea} onAgregar={agregarRapida}
                        onIrAlPipeline={verPipeline ? () => setVista("leads") : null} />}
                  {/* Lo primero son las tareas de uno; en qué anda el resto va
                      abajo, en su propio cuadro, sin lo marcado como privado. */}
                  <TareasDeLosDemas
                    tasks={visiblesTodas.filter(t => t.assignee_id !== usuario.id)}
                    users={users.filter(u => u.id !== usuario.id)} leads={leadsPorId}
                    onEditar={abrirTarea} />
                </>
              )}
            </div>
            <CargadorDeAvisos entra={leadId => !!nivelObra(leadId)} conControl={puede("controlObra.ver")} conActas={puede("actas.ver")}
              onCargado={setAvisosDeModulos} />
            <PanelAvisos avisos={avisos} onIr={setVista} />
            </div>
          )}

          <Suspense fallback={<Cargando />}>
            {puede("presupuestos.ver") && vista === "presupuestos" && (
              <ModuloPresupuestos currentUser={usuario} puede={puede} nivelProyecto={nivelPresupuesto} entraATodo={entraATodo}
                onArmarCronograma={puede("cronograma.ver") ? pedido => { setCronoPedido(pedido); setVista("cronograma"); } : undefined} />
            )}
            {puede("controlObra.ver") && vista === "controlObra" && (
              <ModuloControlObra currentUser={usuario} puede={puede} nivelObra={nivelObra} entraATodo={entraATodo} />
            )}
            {verPipeline && vista === "leads" && (
              <ModuloLeads currentUser={usuario} users={users} puede={puede} nivelProyecto={nivelProyecto} onIrAObra={() => setVista("controlObra")}
                onIrEnMarcha={() => setVista("enMarcha")} />
            )}
            {verPipeline && vista === "enMarcha" && (
              <ModuloEnMarcha currentUser={usuario} users={users} puede={puede} nivelProyecto={nivelProyecto} onIr={setVista} />
            )}
            {puede("cajaChica.ver") && vista === "cajaChica" && (
              <ModuloCajaChica currentUser={usuario} puede={puede} users={users} nivelObra={nivelObra} entraATodo={entraATodo} />
            )}
            {puede("compras.ver") && vista === "compras" && (
              <ModuloCompras currentUser={usuario} puede={puede} leToca={leToca}
                hayQuienCompre={hayQuienCompre} users={users} asignados={leadsAsignados}
                abrir={compraAbierta} onAbierta={() => setCompraAbierta(null)} />
            )}
            {puede("libro.ver") && vista === "libro" && (
              <ModuloLibro currentUser={usuario} puede={puede} nivelProyecto={nivelLibro} />
            )}
            {puede("observaciones.ver") && vista === "observaciones" && (
              <ModuloObservaciones currentUser={usuario} users={users} puede={puede} nivelProyecto={nivelObra} />
            )}
            {puede("actas.ver") && vista === "actas" && (
              <ModuloActas currentUser={usuario} users={users} puede={puede} nivelProyecto={nivelObra} />
            )}
            {puede("cronograma.ver") && vista === "cronograma" && (
              <ModuloCronograma currentUser={usuario} puede={puede} nivelProyecto={nivelProyecto} entraATodo={entraATodo}
                abrir={cronoPedido} onAbierto={() => setCronoPedido(null)} />
            )}
            {puede("manoObra.ver") && vista === "manoObra" && (
              <ModuloManoDeObra currentUser={usuario} puede={puede} nivelProyecto={nivelObra} />
            )}
          </Suspense>

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
      {showModal && <ModalTarea editTask={editTask} proyectos={proyectosTodos} mios={mios} tareas={tareas} onCambio={fetchTareas} puede={puede} currentUser={usuario} users={users} asignables={asignables} onEliminar={eliminarTarea} onCerrar={() => { setShowModal(false); setEditTask(null); }} onGuardar={guardarTarea} />}
      {showAjustes && <Suspense fallback={null}><PanelAjustes puede={puede} usuario={usuario} permisos={permisos} setPermisos={setPermisos} permisosUsuario={permisosUsuario} setPermisosUsuario={setPermisosUsuario} equipoRemoto={equipoRemoto} onEquipoCambio={recargarEquipo} users={users} setUsers={setUsers} empresa={empresa} setEmpresa={setEmpresa} onClose={() => setShowAjustes(false)} /></Suspense>}
    </div>
  );
}
