import { Fragment, useState, useEffect, useCallback, useRef } from "react";
import { Check, Plus, X, ListTodo, Hourglass, Mail, ChevronDown, ChevronUp, ChevronRight, Eye, EyeOff, ClipboardList, Send, History, RotateCcw, CornerDownRight, Paperclip, ThumbsUp, MessageSquareWarning } from "lucide-react";
import { colors } from "../../theme/colors";
import { inputStyle } from "../../components/ui/Input";
import { CLASES, claseDe, HORAS } from "../../theme/constants";
import { nombreDeEtapa, hoyISO, sumarDias, etapasDelTipo, tipoDe, sePersigue } from "./pipeline";
import {
  cargarTareas, agregarTarea, agregarVarias, mostrarAlCliente, escribirleAlCliente, enviarChecklist, marcarItem, marcarEspera, guardarNota, borrarItem, asegurarTarea, ponerFecha,
  anotarCorreccion, anotar, cargarHistorial, anotarEnLaTarea, mostrarNotaAlCliente, moverDeEtapa, cargarArchivosDelCliente, pedirAprobacion, ponerPlazoDeAprobacion,
} from "./proyecto";
import { renglonesDeLista, avanceDe, porEtapa, conTitulosDeEtapa, avancePorEtapa, estadoDeActividad, alAvanzar } from "./tareasDelProyecto";
import { gentePara } from "../controlObra/ordenesDeCambio";
import { deAfuera } from "../controlObra/directorioDelProyecto.js";
import { ultimaAnotacion } from "./historialDeTarea";
import HistorialDeTarea from "../../components/HistorialDeTarea";
import EnlaceDelCliente from "../observaciones/EnlaceDelCliente";
import FotosYArchivosDelCliente from "./FotosYArchivosDelCliente";
import PedirAprobacion from "./PedirAprobacion";
import { cuantosDice } from "./archivosDelCliente.js";
import { plazoDe } from "./aprobaciones.js";

// LAS TAREAS DEL PROYECTO: UNA LISTA.
//
// Son las mismas tareas que se ven en Tareas —la misma fila—, las de este
// proyecto. Arriba lo que falta, con lo más próximo primero: esa es el próximo
// paso. Abajo, plegado, lo que ya se hizo.
//
// Antes esto era una columna por etapa, cada una con su estado y su «estamos
// acá». El proyecto podía figurar en tres etapas a la vez y nadie sabía en
// cuál estaba. Ahora el lead está en una etapa, que se elige arriba, y la
// tarea solo lleva de etiqueta en cuál se escribió.
//
// ES EL CHECKLIST DEL PROYECTO, Y ASÍ SE LLAMA EN LA PANTALLA. Cuando se arma
// un presupuesto hay una lista de cosas por cotizar: se pega entera —una tarea
// por renglón— y arriba dice cuánto va. Y se le puede mostrar al cliente en su
// enlace, tarea por tarea: él ve qué dice cada una y si está lista, nada más.
//
// Se llamaba «Tareas» y la palabra «checklist» no aparecía en ningún lado de
// la ventana: quien venía a cargar el checklist de un lead no lo encontraba.
//
// CADA PUNTO TIENE SU HISTORIAL. «MADEVAL» no es una casilla: es contactarlos,
// fijar la reunión, recibir la cotización. Lo que se anota y lo que pasó solo
// se leen juntos, en orden, al abrir el punto; lo último anotado se lee en la
// fila sin abrirla (historialDeTarea.js).
//
// LA ETAPA LA DICE CADA PUNTO. Un proyecto tiene a la vez cosas de varias
// etapas —la revisión eléctrica es de Ingenierías, la cotización de MADEVAL es
// de Presupuesto—. Antes el punto nacía con la etapa en la que estuviera
// parado el proyecto y no se podía cambiar: para cargar algo de Presupuesto
// había que mover el proyecto, cargarlo y volverlo. Ahora la etapa se elige al
// agregar y se cambia en el punto, y la lista se lee por etapa.
//
// UN PUNTO ABIERTO SE LEE DE ARRIBA ABAJO, Y SE CIERRA. Hernán, 17/11/2026:
// «este cuadro de diálogo también es confuso... ¿qué sucede cuando ya se
// completa esa tarea o gestión? ¿Si se agenda reunión o se pasa a otra
// actividad relacionada? ¿Se abre una nueva tarea, o se genera desde ahí
// mismo, por continuidad?», y «no tiene botón cerrar». Eran controles sueltos,
// sin nombre ni orden, y la única forma de terminarlo era la casilla de la
// fila. Ahora son cuatro preguntas con su título —¿para cuándo?, ¿qué pasó?,
// lo que lee el cliente, ¿ya está?—, cada una dice qué pasa al tocarla, y hay
// «Cerrar» arriba y abajo y una flecha en cada fila.
//
// UN PUNTO ES UN TEMA QUE AVANZA: NO SE CIERRA PARA PASAR AL PASO SIGUIENTE.
// Hernán, 26/11/2026: «ya tengo la actividad FOGA, ¿el check quiere decir
// completada? En efecto se completó pero quiero que quede en stand-by hasta
// tener nuevo paso... ¿se cierra y se abre nueva?». Se cerraba y se abría
// otra, con otro nombre y sin historial (ver tareasDelProyecto.js). Ahora el ✓
// pregunta en la misma fila —«¿Qué pasó con FOGA?»— y ofrece tres botones con
// palabras: AVANZÓ (se anota en el mismo punto qué sigue), QUEDA EN ESPERA
// (sigue en la lista, al fondo) y TERMINADA (recién ahí va a «hechos»).
//
// Y LA FILA DICE EN QUÉ ESTÁ, CON PALABRAS: en curso, en espera, para el 30
// nov, venció. Se fue lo que se repetía en todas —«gestión», «la ve el
// cliente», «sin fecha» en rojo—: de dieciséis puntos abiertos, catorce eran
// gestión y once no tenían fecha. Queda lo que distingue a una de otra.
//
// EL PUNTO ABIERTO, CORTO: qué pasó, para cuándo, y su estado. Lo del cliente
// y lo que se toca poco están a un toque, plegados.
//
// LO QUE VE EL CLIENTE DE CADA PUNTO. Hernán, 17/11/2026, mirando RES BG: «el
// cliente no ve el modelado en Revit... no sé por qué. Cliente debe ver las
// actualizaciones de cada uno... ¿dónde se sube archivos relacionados? Estos
// debe poder ver cliente para que apruebe». En la base: el punto de Revit se
// había agregado dos minutos después de «mostrarle los otros abiertos» y nació
// oculto, sin que nada lo dijera; las dos anotaciones de ese día estaban en el
// historial, que el cliente no lee; y no había un solo archivo subido.
//   · EL PUNTO NUEVO DICE SI LO VE. «Agregar» lleva su tilde, y nace marcado
//     cuando el cliente ya ve todo lo abierto. La fila que no ve, lo dice.
//   · LO QUE SE ANOTA ES SU ACTUALIZACIÓN. En un punto que ve, la anotación
//     nace para él —lo dice el botón— y se elige «Solo nosotros» para lo
//     interno. Cada anotación dice si la lee y se cambia de un toque. Ya no
//     hay un cuadro aparte de «actualización» que llenar.
//   · LOS ARCHIVOS TIENEN SU TÍTULO: «Fotos y archivos para el cliente», con
//     «Subir fotos o archivos», adentro de lo que ve el cliente de ese punto.
//   · Y SE LE PIDE QUE LO APRUEBE, ahí mismo: «¿Lo tiene que aprobar?». En su
//     enlace le aparecen «Lo apruebo» y «Tengo una observación»; lo que
//     contesta queda en el historial del punto, se ve en la fila y le llega
//     por correo a quien lo lleva. Contesta una vez: si algo se corrigió, se
//     le vuelve a pedir (migración 186).
//   · PEDIR ES AVISARLE. «Cada vez que se solicite una aprobación FOREMAN
//     manda un mensaje al cliente, por WhatsApp y correo»: el botón abre una
//     ventana corta que dice qué va a ver, a quién se le avisa, y pide y manda
//     el correo de una vez; el WhatsApp queda listo para enviar
//     (PedirAprobacion). Cada pedido entra al registro de aprobaciones del
//     proyecto, que es la pestaña «Aprobaciones» (migración 187).

// Una fecha sin hora la lee el navegador como medianoche en Londres, y en
// Ecuador eso es el día anterior: por eso se lee al mediodía.
const cuando = f => (f ? new Date(String(f).length === 10 ? `${f}T12:00:00` : f).toLocaleDateString("es-EC", { day: "numeric", month: "short" }) : "");

const EN_BLANCO = { abierto: true, tipo: "gestion", texto: "", assignee_id: "", due_date: "", hora: "", destinatario: "" };
const LISTA_EN_BLANCO = { abierto: true, texto: "", assignee_id: "", due_date: "" };

/**
 * @param etapaId   en qué etapa está el lead ahora: es la etiqueta con la que
 *                  nacen las tareas que se agregan acá
 * @param onTareas  avisa cada vez que cambia la lista, con las filas enteras:
 *                  de ahí saca el encabezado cuál es el próximo paso
 */
export default function ListaDeTareas({ lead, etapaId = null, catalogo = [], users = [], currentUser, puede = () => true, editable = true, onBitacora, onTareas }) {
  const [abiertas, setAbiertas] = useState([]);
  const [hechas, setHechas] = useState([]);
  const [tareas, setTareas] = useState({});
  const [sinMigracion, setSinMigracion] = useState(false);
  const [verHechas, setVerHechas] = useState(false);
  const [nuevo, setNuevo] = useState({ abierto: false });
  // Pegar una lista entera: una tarea por renglón.
  const [pegar, setPegar] = useState({ abierto: false });
  // Cuáles ve el cliente en su enlace.
  const [compartidas, setCompartidas] = useState(() => new Set());
  const [sinCompartir, setSinCompartir] = useState(false);
  // Lo escrito para él en cada punto: qué es y qué hay de nuevo.
  const [paraElCliente, setParaElCliente] = useState({});
  const [sinReporte, setSinReporte] = useState(false);
  // Lo que se le pidió aprobar al cliente y qué contestó, por punto.
  const [aprobaciones, setAprobaciones] = useState({});
  const [sinAprobacion, setSinAprobacion] = useState(false);
  // La ventana de pedirle la aprobación, o de avisarle de nuevo: { item, modo }.
  const [pedido, setPedido] = useState(null);
  // El historial de cada punto: lo anotado y lo que la bitácora dice de él.
  const [historial, setHistorial] = useState({ comentarios: {}, movimientos: {}, sinNotasAlCliente: false });
  // Las fotos y los archivos que ve el cliente: los del proyecto y los de
  // cada punto, con el enlace de cada foto para su miniatura.
  const [paraVer, setParaVer] = useState({ delProyecto: [], porTarea: {}, enlaces: {}, sinMigracion: false });
  const cargarArchivos = useCallback(async () => { setParaVer(await cargarArchivosDelCliente(lead.id)); }, [lead.id]);
  // ARRASTRAR UN PUNTO A SU ETAPA. Las cotizaciones de RES BG habían nacido
  // todas en «Ingenierías», que era donde estaba parado el proyecto; pasarlas
  // a «Presupuesto» era abrir cada una y cambiarle la etapa. Se agarra el
  // punto y se lo suelta sobre la etapa. El desplegable de cada punto sigue
  // estando, que en el teléfono no se arrastra.
  const [arrastrando, setArrastrando] = useState(null);   // el punto
  const [sobre, setSobre] = useState(null);                // la etapa bajo el cursor
  // Mandarle el checklist por correo: a quién y con qué líneas.
  const [envio, setEnvio] = useState(null);   // { a: Set, otro, mensaje, dijo, mal }
  const [error, setError] = useState("");
  const [aTarea, setATarea] = useState(null);
  // A quién avisarle de una reunión: al del equipo que la tiene y a los de
  // afuera que vengan. Se elige cada vez, porque no siempre va el cliente.
  const [avisar, setAvisar] = useState(null);   // { item, tarea, a: Set }
  const [ocupado, setOcupado] = useState(false);
  // La tarea abierta: al tocarla cuenta qué se hizo, quién y cuándo, y ofrece
  // lo que se puede hacer con ella, con botones que dicen su nombre.
  const [abierta, setAbierta] = useState(null);
  // La gente de afuera que ya está en el proyecto: cliente, ingeniero,
  // proveedor. Una tarea puede ser de ellos aunque no entren a FOREMAN.
  //
  // SON LOS INVOLUCRADOS DEL PROYECTO —los de la pestaña «Gente»—. Antes salían
  // de una lista aparte que en toda la base tenía cero filas: para mandarle el
  // checklist al cliente había que escribir su correo cada vez, y nadie de
  // afuera aparecía para ser responsable de un punto.
  const [invitados, setInvitados] = useState([]);

  // Le avisa por correo a quien quedó a cargo, igual que en el tablero.
  const avisarPorCorreo = async tareaId => {
    if (!tareaId) return;
    try {
      await fetch("/api/aviso?de=tarea", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tareaId }),
      });
    } catch { /* el correo no puede trabar el trabajo */ }
  };

  const cargar = useCallback(async () => {
    const [r, inv] = await Promise.all([
      cargarTareas(lead.id),
      gentePara(lead.id).then(g => deAfuera(g, users)).catch(() => []),
    ]);
    setSinMigracion(!!r.sinMigracion);
    setAbiertas(r.abiertas);
    setHechas(r.hechas);
    setTareas(r.tareas || {});
    setCompartidas(r.compartidas || new Set());
    setSinCompartir(!!r.sinCompartir);
    setParaElCliente(r.paraElCliente || {});
    setSinReporte(!!r.sinReporte);
    setAprobaciones(r.aprobaciones || {});
    setSinAprobacion(!!r.sinAprobacion);
    setInvitados(inv || []);
    onTareas?.(Object.values(r.tareas || {}));
    // Van después y aparte: la lista se ve sin esperar al historial ni a las fotos.
    cargarArchivos();
    setHistorial(await cargarHistorial(lead.id, Object.values(r.tareas || {}).map(t => t.id)));
    // eslint-disable-next-line
  }, [lead.id]);

  useEffect(() => { cargar(); }, [cargar]);

  if (sinMigracion) {
    return (
      <div style={{ fontSize: 12, color: colors.warning, padding: "10px 0", lineHeight: 1.5 }}>
        Falta correr la migración 170 en Supabase. Las tareas del proyecto están a salvo y se siguen viendo en Tareas;
        acá vuelven a aparecer apenas se corra.
      </div>
    );
  }

  async function hacer(fn) {
    setOcupado(true);
    // Todo lo que se hace acá deja rastro en la bitácora, así que se la
    // refresca siempre en vez de acordarse caso por caso de avisarle.
    try { await fn(); await cargar(); onBitacora?.(); } finally { setOcupado(false); }
  }

  // TERMINAR UN PUNTO, o volver a abrirlo. Ya no abre otro con otro nombre.
  const marcar = (item, hecho) => hacer(async () => {
    const e = await marcarItem(item, hecho, currentUser?.name, currentUser);
    if (e) setError(e);
    else if (hecho) setAbierta(a => (a === item.id ? null : a));
  });

  // AVANZÓ: se anota en el MISMO punto qué pasó o qué sigue —con su fecha, si
  // se dijo—, y si estaba en espera deja de estarlo.
  // @returns null, o lo que falta
  async function avanzar(item, { texto, due_date, alCliente, vence }) {
    const r = alAvanzar({ item, texto, due_date, vence, hoy: hoyISO() });
    if (r.error) return r.error;
    let dijo = null;
    await hacer(async () => {
      const aviso = await anotarEnLaTarea(item, r.nota, currentUser, { alCliente: !!alCliente && compartidas.has(item.id) && !historial.sinNotasAlCliente });
      // No se anotó: el texto queda en el cuadro para volver a intentar.
      if (aviso && !/^Quedó anotado/.test(aviso)) { dijo = aviso; return; }
      // Desde acá ya quedó anotado: lo que falle se dice abajo de la lista y el
      // cuadro se cierra igual, para no anotarlo dos veces al reintentar.
      const despues = [aviso];
      // El día nuevo es de un paso nuevo: la hora del de antes (una reunión a
      // las 10) no pasa al día nuevo. Se pone en «Para cuándo» si hace falta.
      if (r.fecha !== undefined) despues.push(await ponerFecha(item, r.fecha, currentUser, null));
      if (r.sacarDeEspera) despues.push(await marcarEspera(item, false, currentUser));
      const problemas = despues.filter(Boolean);
      if (problemas.length) setError(problemas.join(" "));
    });
    return dijo;
  }

  // LO NUEVO NACE COMO LO DEMÁS. Si el cliente ya ve todo lo abierto, el punto
  // que se agrega también: el de Revit de RES BG se agregó dos minutos después
  // de mostrarle los otros nueve y quedó oculto sin que nada lo dijera. Si ve
  // solo algunos —o ninguno— nace sin mostrarse. En los dos casos el tilde
  // está a la vista al agregar, y se cambia.
  const naceALaVista = !sinCompartir && abiertas.length > 0 && abiertas.every(i => compartidas.has(i.id));

  // Sumar algo, diciendo qué falta en vez de quedarse callado.
  //
  // Los cuatro tipos guardan lo mismo —una tarea—, lo que cambia es qué se
  // exige: una tarea es de alguien, una reunión tiene día, un envío ya pasó y
  // dice a quién, y una gestión se marca y ya.
  async function sumar() {
    const n = nuevo;
    const texto = (n.texto || "").trim();
    const tipo = n.tipo || "gestion";
    const falta = !texto ? `Escribe ${tipo === "reunion" ? "de qué es la reunión" : tipo === "envio" ? "qué se envió" : "qué hay que hacer"}.`
      : tipo === "tarea" && !n.assignee_id ? "Una tarea es de alguien: elige quién la hace."
      : tipo === "reunion" && !n.due_date ? "Una reunión tiene día: ponle la fecha."
      // Un envío es un hecho, no un pendiente: sin a quién y cuándo no sirve de
      // nada, porque lo que se consulta seis meses después es justamente eso.
      : tipo === "envio" && !(n.destinatario || "").trim() ? "Un envío es a alguien: escribí a quién se lo mandaste."
      : tipo === "envio" && !n.due_date ? "Un envío tiene fecha: ¿cuándo se mandó?"
      : null;
    if (falta) { setError(falta); return; }
    setError("");

    await hacer(async () => {
      const externo = String(n.assignee_id || "").startsWith("x:") ? String(n.assignee_id).slice(2) : null;
      const r = await agregarTarea({
        lead, etapaId: n.etapa !== undefined ? n.etapa || null : etapaId, titulo: texto, orden: abiertas.length + hechas.length + 1,
        tipo: tipo === "reunion" ? "Reunión" : tipo === "gestion" ? "Gestión" : tipo === "envio" ? "Envío" : "Otro",
        due_date: n.due_date || null, hora: (n.due_date && n.hora) || null,
        assignee_id: n.assignee_id && !externo ? Number(n.assignee_id) : null,
        nombreResponsable: users.find(u => String(u.id) === String(n.assignee_id))?.name,
        // A quién se le mandó va en el responsable externo: es alguien de
        // afuera, y así sale en la fila y en la bitácora sin inventar otro
        // campo que después haya que mantener.
        responsable_externo: tipo === "envio" ? n.destinatario.trim() : externo,
        // Un envío ya ocurrió: nace cerrado y queda de registro.
        hecha: tipo === "envio",
        quien: currentUser,
      });
      if (r?.error) { setError(r.error); return; }
      if (!sinCompartir && (n.alCliente ?? naceALaVista)) { const e = await mostrarAlCliente(r.item, true, currentUser); if (e) setError(e); }
      if (r.tarea?.assignee_id) await avisarPorCorreo(r.tarea.id);
      if (tipo === "envio") {
        await anotar(lead.id, { tipo: "nota", detalle: `Envío a ${n.destinatario.trim()}: ${texto}.`, quien: currentUser });
      }
      // Se queda abierto y con el tipo elegido: casi siempre se cargan varias
      // seguidas, y volver a abrir el cuadro cada vez era un clic de más.
      // Y en la misma etapa, que es donde se estaba cargando.
      // Y con lo del cliente como se eligió.
      setNuevo({ ...EN_BLANCO, tipo, ...(n.etapa !== undefined ? { etapa: n.etapa } : {}), ...(n.alCliente !== undefined ? { alCliente: n.alCliente } : {}) });
    });
  }

  // La lista pegada: qué entra y qué ya estaba, dicho antes de agregar.
  const deLaLista = pegar.abierto ? renglonesDeLista(pegar.texto, abiertas.map(a => a.texto)) : { nuevos: [], repetidos: [] };

  async function sumarLista() {
    if (!deLaLista.nuevos.length) {
      setError(deLaLista.repetidos.length ? "Esos renglones ya están en la lista." : "Pegá o escribí la lista: una cosa por renglón.");
      return;
    }
    setError("");
    await hacer(async () => {
      const externo = String(pegar.assignee_id || "").startsWith("x:") ? String(pegar.assignee_id).slice(2) : null;
      const r = await agregarVarias({
        lead, etapaId: pegar.etapa !== undefined ? pegar.etapa || null : etapaId, titulos: deLaLista.nuevos, desde: abiertas.length + hechas.length,
        assignee_id: pegar.assignee_id && !externo ? Number(pegar.assignee_id) : null, responsable_externo: externo,
        nombreResponsable: users.find(u => String(u.id) === String(pegar.assignee_id))?.name,
        due_date: pegar.due_date || null, alCliente: (pegar.alCliente ?? naceALaVista) && !sinCompartir, quien: currentUser,
      });
      if (r?.error) { setError(r.error); return; }
      setPegar({ abierto: false });
    });
  }

  // Mostrarle al cliente una tarea, o varias, o dejar de mostrárselas.
  const alCliente = (items, ver) => hacer(async () => {
    const e = await mostrarAlCliente(items, ver, currentUser);
    if (e) setError(e);
  });

  // Mandárselo por correo: lo que ve en su enlace, a quien se elija.
  async function mandar() {
    const otros = String(envio.otro || "").split(/[,;\s]+/).filter(Boolean);
    setOcupado(true);
    // Los elegidos van por su correo: son los involucrados del proyecto.
    const r = await enviarChecklist({ lead, otros: [...envio.a, ...otros], mensaje: envio.mensaje, quien: currentUser });
    setOcupado(false);
    if (r.error) { setEnvio(v => ({ ...v, dijo: r.error, mal: true })); return; }
    setEnvio(v => ({ ...v, dijo: `Enviado a ${r.enviadoA.join(", ")}.`, mal: false }));
    onBitacora?.();
  }

  const avance = avanceDe(Object.values(tareas));
  const enEspera = abiertas.filter(i => i.espera).length;
  const todas = [...abiertas, ...hechas];
  const vistas = todas.filter(i => compartidas.has(i.id));
  const abiertasSinMostrar = abiertas.filter(i => !compartidas.has(i.id));

  // Una fecha ya puesta solo la corre quien tenga el permiso; ponerle fecha a
  // algo que no la tenía es organizar, y eso lo puede hacer cualquiera.
  const fechaBloqueada = !!tareas[aTarea?.item?.tarea_id]?.due_date && !puede("tareas.fechas");
  const puedeCorrer = item => !tareas[item.tarea_id]?.due_date || puede("tareas.fechas");

  // POR ETAPA. Lo abierto se lee agrupado: cada etapa con su título, en el
  // orden del tipo del proyecto. Si todo es de la etapa en la que está el
  // proyecto no hay títulos —arriba ya lo dice—.
  const etapas = etapasDelTipo(catalogo, tipoDe(lead));
  const grupos = porEtapa(abiertas, etapas, { nombreDe: id => nombreDeEtapa(id, catalogo), etapaDelProyecto: etapaId });
  const conTitulos = conTitulosDeEtapa(grupos, etapaId);
  // En lo hecho, que va plegado y sin títulos, la etapa se dice en la fila; y
  // solo si el checklist tiene puntos de más de una.
  const variasEtapas = new Set([...abiertas, ...hechas].map(i => i.etapa_id || "")).size > 1;
  const etapaDe = item => (item.hecho && variasEtapas && item.etapa_id ? nombreDeEtapa(item.etapa_id, catalogo) || "" : "");
  const cambiarEtapa = (item, id) => hacer(async () => {
    const e = await moverDeEtapa(item, id, { de: nombreDeEtapa(item.etapa_id, catalogo), a: nombreDeEtapa(id, catalogo) }, currentUser);
    if (e) setError(e);
  });
  // El desplegable de etapa de los dos cuadros de agregar: arranca en la del
  // proyecto y se queda en la que se eligió.
  const elegirEtapa = (valor, alCambiar) => etapas.length > 0 && (
    <select value={valor !== undefined ? valor : etapaId || ""} onChange={e => alCambiar(e.target.value)} aria-label="De qué etapa es"
      title="De qué etapa es" style={{ ...chico, flex: "0 1 150px", minWidth: 0 }}>
      {etapas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
      <option value="">Sin etapa</option>
    </select>
  );

  const fila = item => (
    <Actividad key={item.id} item={item} etiqueta={etapaDe(item)} tarea={tareas[item.tarea_id]} users={users}
      onAgarrar={editable && etapas.length > 0 ? agarrado => { setArrastrando(agarrado ? item : null); if (!agarrado) setSobre(null); } : null}
      abierta={abierta === item.id} onAbrir={() => setAbierta(a => (a === item.id ? null : item.id))}
      onMarcar={hecho => marcar(item, hecho)} onAvanzar={datos => avanzar(item, datos)}
      onEspera={espera => hacer(async () => { const e = await marcarEspera(item, espera, currentUser); if (e) setError(e); })}
      ocupado={ocupado} hacer={hacer} currentUser={currentUser} editable={editable} puedeCorrer={puedeCorrer(item)}
      laVeElCliente={compartidas.has(item.id)} onCliente={sinCompartir ? null : ver => alCliente(item, ver)}
      hayCliente={compartidas.size > 0} sinNotas={historial.sinNotasAlCliente}
      aprobacion={aprobaciones[item.id] || null} sinAprobacion={sinAprobacion}
      onPedirAprobacion={modo => setPedido({ item, modo })}
      delCliente={paraElCliente[item.id]} sinReporte={sinReporte}
      lead={lead} archivos={paraVer.porTarea[item.id] || []} enlaces={paraVer.enlaces} sinArchivos={paraVer.sinMigracion} onArchivos={cargarArchivos}
      etapas={etapas} onEtapa={id => cambiarEtapa(item, id)} etapaVieja={nombreDeEtapa(item.etapa_id, catalogo)}
      anotado={historial.comentarios[item.id]} pasado={historial.movimientos[item.id]}
      onAvisar={t => setAvisar({ item, tarea: t, a: new Set(t?.assignee_id ? ["responsable"] : []) })}
      onTarea={() => { const t = tareas[item.tarea_id]; setATarea({ item, titulo: item.texto, tipo: claseDe(t),
        assignee_id: t?.responsable_externo ? `x:${t.responsable_externo}` : t?.assignee_id || "", due_date: t?.due_date || "", hora: t?.hora || "" }); }} />
  );

  const tipoNuevo = nuevo.tipo || "gestion";

  // EL AVANCE POR ETAPA: el pipeline del proyecto, de un vistazo. Mientras se
  // persigue se ve el camino entero; en un aprobado, solo las etapas que
  // tienen algo.
  const camino = avancePorEtapa(Object.values(tareas), etapas, {
    nombreDe: id => nombreDeEtapa(id, catalogo), etapaDelProyecto: etapaId, elCamino: sePersigue(lead),
  });
  const conCamino = camino.length > 1 || (camino.length === 1 && camino[0].id);
  const todasLasAbiertas = abiertas.length;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.5, flex: 1 }}>
          CHECKLIST{abiertas.length ? ` · ${abiertas.length} ${abiertas.length === 1 ? "abierto" : "abiertos"}` : ""}
          {enEspera > 0 ? ` · ${enEspera} en espera` : ""}
        </div>
        {editable && !nuevo.abierto && !pegar.abierto && (
          <>
            <button onClick={() => { setPegar(LISTA_EN_BLANCO); setError(""); }} title="Pegar una lista entera: una tarea por renglón"
              style={{ ...mini(false), padding: "4px 10px" }}>
              <ClipboardList size={11} /> Pegar lista
            </button>
            <button onClick={() => { setNuevo(EN_BLANCO); setError(""); }} style={{ ...mini(false), padding: "4px 10px" }}>
              <Plus size={11} /> Agregar
            </button>
          </>
        )}
      </div>

      {/* Cuánto va: es lo que se pregunta de un checklist. */}
      {avance.total > 1 && (
        <div className="avance-de-tareas" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <div role="progressbar" aria-valuenow={avance.hechas} aria-valuemin={0} aria-valuemax={avance.total}
            style={{ flex: 1, height: 5, background: colors.neutralSoft, borderRadius: 3, overflow: "hidden" }}>
            <div style={{ width: `${Math.round((avance.hechas / avance.total) * 100)}%`, height: "100%", background: colors.success }} />
          </div>
          <span style={{ fontSize: 11, color: colors.inkSoft, whiteSpace: "nowrap" }}>{avance.hechas} de {avance.total} hechos</span>
        </div>
      )}

      {/* EL PIPELINE DEL PROYECTO: cada etapa con cuánto va. La que tiene el
          borde marcado es en la que está el proyecto. Tocar una abre «Agregar»
          ya parado en esa etapa. */}
      {conCamino && (
        <div className="camino-de-etapas" style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {camino.map(e => {
              const tono = e.estado === "lista" ? colors.success : e.estado === "en_curso" ? colors.brand : colors.muted;
              const sePuede = editable && !!e.id && etapas.some(x => x.id === e.id);
              return (
                <button key={e.id || "sin-etapa"} className="etapa-del-camino" data-estado={e.estado} data-actual={e.actual ? "si" : "no"}
                  onDragOver={ev => { if (arrastrando && sePuede) { ev.preventDefault(); if (sobre !== e.id) setSobre(e.id); } }}
                  onDragLeave={() => setSobre(x => (x === e.id ? null : x))}
                  onDrop={ev => {
                    if (!arrastrando || !sePuede) return;
                    ev.preventDefault();
                    const punto = arrastrando;
                    setArrastrando(null); setSobre(null);
                    if ((punto.etapa_id || null) !== e.id) cambiarEtapa(punto, e.id);
                  }}
                  disabled={!sePuede}
                  onClick={() => { setPegar({ abierto: false }); setError(""); setNuevo({ ...EN_BLANCO, etapa: e.id }); }}
                  title={`${e.nombre}: ${e.total ? `${e.hechas} de ${e.total} ${e.total === 1 ? "hecho" : "hechos"}` : "todavía sin puntos"}`
                    + `${e.actual ? " · es la etapa en la que está el proyecto" : ""}${sePuede ? " · tocá para agregar un punto acá" : ""}`}
                  style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: colors.font, fontSize: 11, lineHeight: 1.2,
                    padding: "4px 9px", borderRadius: 14, cursor: sePuede ? "pointer" : "default",
                    border: `${e.actual ? 2 : 1}px solid ${e.actual ? colors.brand : colors.border}`,
                    outline: sobre === e.id ? `2px dashed ${colors.brand}` : "none", outlineOffset: 2,
                    background: sobre === e.id ? colors.brandSoft : e.estado === "lista" ? colors.successSoft : "#fff", color: e.total ? colors.ink : colors.muted }}>
                  {e.estado === "lista" && <Check size={11} color={colors.success} />}
                  <span style={{ fontWeight: e.actual ? 700 : 500 }}>{e.nombre}</span>
                  {e.total > 0 && <span style={{ color: tono, fontWeight: 700 }}>{e.hechas}/{e.total}</span>}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 10.5, color: colors.muted, marginTop: 5, lineHeight: 1.45 }}>
            {editable ? "Tocá el ✓ de un punto para decir qué pasó: avanzó, queda en espera o terminó." : "Cada punto dice en qué está."}
            {editable && etapas.length > 0 && todasLasAbiertas > 0 ? " Para pasarlo a otra etapa, arrastralo hasta ella." : ""}
          </div>
        </div>
      )}

      {/* PEGAR UNA LISTA. El checklist de un presupuesto ya está escrito en
          algún lado —un correo, un Excel, una nota—: se pega entero y sale una
          tarea por renglón, en vez de cargarlas de a una. */}
      {editable && pegar.abierto && (
        <div style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 10, marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: colors.ink, marginBottom: 5 }}>Pegar una lista</div>
          <textarea value={pegar.texto} autoFocus rows={6} aria-label="La lista, una cosa por renglón"
            onChange={e => setPegar(p => ({ ...p, texto: e.target.value }))}
            placeholder={"Una cosa por renglón. Por ejemplo:\nCotizar ventanería\nCotizar cocina\nControl de iluminación"}
            style={{ ...chico, width: "100%", boxSizing: "border-box", resize: "vertical", lineHeight: 1.45 }} />
          <div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
            {elegirEtapa(pegar.etapa, v => setPegar(p => ({ ...p, etapa: v })))}
            <select value={pegar.assignee_id} onChange={e => setPegar(p => ({ ...p, assignee_id: e.target.value }))} aria-label="Quién las hace"
              style={{ ...chico, flex: "1 1 160px", minWidth: 0 }}>
              <option value="">¿Quién las hace? (opcional)</option>
              <optgroup label="Del equipo">{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</optgroup>
              {invitados.length > 0 && <optgroup label="De afuera">{invitados.map(i => <option key={`x${i.id}`} value={`x:${i.nombre}`}>{i.nombre}</option>)}</optgroup>}
            </select>
            <input type="date" value={pegar.due_date} title="Para cuándo (opcional): la misma fecha para todas" aria-label="Para cuándo"
              onChange={e => setPegar(p => ({ ...p, due_date: e.target.value }))}
              style={{ ...chico, flex: "0 1 140px", minWidth: 0 }} />
          </div>
          {!sinCompartir && (
            <label style={{ ...linea, fontSize: 11.5, marginTop: 7 }}>
              <input type="checkbox" checked={pegar.alCliente ?? naceALaVista} onChange={e => setPegar(p => ({ ...p, alCliente: e.target.checked }))} />
              El cliente las ve en su enlace <span style={{ color: colors.muted }}>· qué dice cada una y si está lista</span>
            </label>
          )}
          <div style={{ fontSize: 10.5, color: colors.muted, marginTop: 6, lineHeight: 1.5 }}>
            {deLaLista.nuevos.length
              ? `${deLaLista.nuevos.length === 1 ? "Entra 1 tarea" : `Entran ${deLaLista.nuevos.length} tareas`}`
                + (deLaLista.repetidos.length ? ` · ${deLaLista.repetidos.length} ya ${deLaLista.repetidos.length === 1 ? "estaba" : "estaban"} en la lista y no se ${deLaLista.repetidos.length === 1 ? "repite" : "repiten"}` : "")
                + "."
              : deLaLista.repetidos.length ? "Todo eso ya está en la lista." : "Las viñetas y los números de adelante se quitan solos."}
            {pegar.assignee_id ? " No sale un correo por cada una: le aparecen en su bandeja y en el correo de la mañana." : ""}
          </div>
          <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
            <button onClick={sumarLista} disabled={ocupado}
              style={{ ...mini(false), padding: "4px 10px", background: colors.ink, color: "#fff", borderColor: colors.ink }}>
              <Plus size={11} /> {deLaLista.nuevos.length > 1 ? `Agregar las ${deLaLista.nuevos.length}` : "Agregar"}
            </button>
            <button onClick={() => { setPegar({ abierto: false }); setError(""); }} style={{ ...mini(false), padding: "4px 10px" }}>Cerrar</button>
          </div>
          {error && <div style={{ fontSize: 10.5, color: colors.danger, marginTop: 5 }}>{error}</div>}
        </div>
      )}

      {/* Agregar está guardado detrás de un botón: con el formulario siempre
          abierto, la pantalla parecía un tablero de controles en vez de la
          lista de lo que falta. Se elige primero qué es y recién ahí se pide
          lo que ese tipo necesita. */}
      {editable && nuevo.abierto && (
        <div style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 10, marginBottom: 10 }}>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
            {TIPOS_NUEVO.map(([id, label]) => {
              const activo = tipoNuevo === id;
              return (
                <button key={id} onClick={() => setNuevo(n => ({ ...n, tipo: id }))}
                  style={{ ...mini(false), padding: "3px 8px", borderColor: activo ? CLASES[id].color : colors.border,
                    background: activo ? CLASES[id].color : "#fff", color: activo ? "#fff" : colors.inkSoft }}>
                  {label}
                </button>
              );
            })}
          </div>

          <input value={nuevo.texto || ""} autoFocus
            onChange={e => setNuevo(n => ({ ...n, texto: e.target.value }))}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); sumar(); } }}
            // Si lo que se pega trae varios renglones es una lista: se abre
            // el cuadro de pegar con eso adentro, en vez de aplastarlo en una.
            onPaste={e => {
              const pegado = e.clipboardData?.getData("text") || "";
              if (!/\r?\n/.test(pegado.trim())) return;
              e.preventDefault();
              setNuevo({ abierto: false }); setError("");
              setPegar({ ...LISTA_EN_BLANCO, texto: pegado.trim() });
            }}
            placeholder={PISTA[tipoNuevo]}
            style={{ ...chico, width: "100%", boxSizing: "border-box", marginTop: 6 }} />

          <div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
            {elegirEtapa(nuevo.etapa, v => setNuevo(n => ({ ...n, etapa: v })))}
            {/* En un envío no se pregunta quién lo hace sino a quién se le
                mandó: es lo único que se consulta después. Se puede elegir de
                la gente del proyecto o escribir el nombre. */}
            {tipoNuevo === "envio" ? (
              <>
                <input list="invitados-del-proyecto" value={nuevo.destinatario || ""}
                  onChange={e => setNuevo(n => ({ ...n, destinatario: e.target.value }))}
                  placeholder="¿A quién se lo mandaste?"
                  style={{ ...chico, flex: "1 1 160px", minWidth: 0 }} />
                <datalist id="invitados-del-proyecto">
                  {invitados.map(i => <option key={`x${i.id}`} value={i.nombre} />)}
                  {users.map(u => <option key={u.id} value={u.name} />)}
                </datalist>
              </>
            ) : (
              <select value={nuevo.assignee_id || ""} onChange={e => setNuevo(n => ({ ...n, assignee_id: e.target.value }))}
                style={{ ...chico, flex: "1 1 160px", minWidth: 0 }}>
                <option value="">¿Quién la hace?{tipoNuevo === "tarea" ? "" : " (opcional)"}</option>
                <optgroup label="Del equipo">{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</optgroup>
                {invitados.length > 0 && <optgroup label="De afuera">{invitados.map(i => <option key={`x${i.id}`} value={`x:${i.nombre}`}>{i.nombre}</option>)}</optgroup>}
              </select>
            )}
            <input type="date" value={nuevo.due_date || ""} title={tipoNuevo === "envio" ? "¿Cuándo se mandó?" : "Para cuándo"}
              onChange={e => setNuevo(n => ({ ...n, due_date: e.target.value }))}
              style={{ ...chico, flex: "0 1 140px", minWidth: 0 }} />
            {/* La hora de una lista y no del relojito del navegador: en el
                teléfono ese control es una ruleta. */}
            <select value={nuevo.hora || ""} title="A qué hora"
              onChange={e => setNuevo(n => ({ ...n, hora: e.target.value }))}
              style={{ ...chico, width: 104 }}>
              <option value="">Todo el día</option>
              {HORAS.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>

          {/* Las fechas de un toque: lo que más se escribe es «para mañana». */}
          {tipoNuevo !== "envio" && (
            <div style={{ display: "flex", gap: 4, marginTop: 5, flexWrap: "wrap", alignItems: "center" }}>
              {[["Hoy", 0], ["Mañana", 1], ["En una semana", 7]].map(([txt, n]) => {
                const f = sumarDias(hoyISO(), n);
                return (
                  <button key={txt} onClick={() => setNuevo(x => ({ ...x, due_date: f }))} style={mini(nuevo.due_date === f)}>{txt}</button>
                );
              })}
            </div>
          )}

          <div style={{ fontSize: 10, color: colors.muted, marginTop: 5 }}>{PIDE[tipoNuevo]}</div>

          {/* SI LO VE EL CLIENTE, dicho al agregar: nace marcado cuando ya ve
              todo lo abierto, y se cambia acá mismo. */}
          {!sinCompartir && (
            <label className="nace-a-la-vista" style={{ ...linea, fontSize: 11.5, marginTop: 7, flexWrap: "wrap" }}>
              <input type="checkbox" checked={nuevo.alCliente ?? naceALaVista} onChange={e => setNuevo(n => ({ ...n, alCliente: e.target.checked }))} />
              El cliente lo ve en su enlace
              <span style={{ color: colors.muted }}>
                · {(nuevo.alCliente ?? naceALaVista)
                  ? (nuevo.alCliente === undefined ? "ya ve todos los abiertos, así que este también" : "qué dice y si está listo")
                  : "así nace interno; se le puede mostrar después, abriéndolo"}
              </span>
            </label>
          )}

          <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
            {/* El botón no se apaga por falta de datos: apagado no explica
                nada. Se toca, y dice qué falta. */}
            <button onClick={sumar} disabled={ocupado}
              style={{ ...mini(false), padding: "4px 10px", background: colors.ink, color: "#fff", borderColor: colors.ink }}>
              <Plus size={11} /> Agregar
            </button>
            <button onClick={() => { setNuevo({ abierto: false }); setError(""); }} style={{ ...mini(false), padding: "4px 10px" }}>Cerrar</button>
          </div>
          {error && <div style={{ fontSize: 10.5, color: colors.danger, marginTop: 5 }}>{error}</div>}
        </div>
      )}

      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: "4px 12px" }}>
        {grupos.map((g, k) => (
          <div key={g.id || "sin-etapa"} className="grupo-de-etapa">
            {conTitulos && (
              <div className="etapa-del-checklist"
                style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: g.actual ? colors.brand : colors.muted,
                  padding: k ? "12px 0 3px" : "8px 0 3px" }}>
                {g.nombre.toUpperCase()} · {g.items.length}
                {g.actual && <span style={{ fontWeight: 400, letterSpacing: 0 }}> · la etapa en la que está el proyecto</span>}
              </div>
            )}
            {g.items.map(fila)}
          </div>
        ))}
        {!abiertas.length && hechas.length > 0 && (
          <div style={{ fontSize: 12, color: colors.muted, padding: "8px 0" }}>No queda nada abierto.</div>
        )}
        {/* VACÍO NO ES MUDO: dice que el checklist va acá y con qué se empieza. */}
        {!abiertas.length && !hechas.length && (
          <div className="checklist-vacio" style={{ padding: "10px 0" }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: colors.ink }}>Este proyecto todavía no tiene checklist.</div>
            <div style={{ fontSize: 11.5, color: colors.inkSoft, lineHeight: 1.5, marginTop: 2 }}>
              Acá va lo que hay que gestionar: cada proveedor por cotizar, cada reunión, cada entrega.
              Cada punto guarda su historial —qué pasó y cuándo— y es la misma tarea que se ve en Tareas.
            </div>
            {editable && !nuevo.abierto && !pegar.abierto && (
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                <button onClick={() => { setPegar(LISTA_EN_BLANCO); setError(""); }} style={boton(true)}>
                  <ClipboardList size={12} /> Pegar el checklist
                </button>
                <button onClick={() => { setNuevo(EN_BLANCO); setError(""); }} style={boton(false)}>
                  <Plus size={12} /> Agregar un punto
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Lo hecho, plegado: es la historia del proyecto, no lo que hay que
          mirar al abrirlo. */}
      {hechas.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <button onClick={() => setVerHechas(v => !v)}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: colors.font, fontSize: 11.5, color: colors.inkSoft,
              display: "inline-flex", alignItems: "center", gap: 4 }}>
            {verHechas ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {hechas.length === 1 ? "1 hecho" : `${hechas.length} hechos`}
          </button>
          {verHechas && (
            <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: "4px 12px", marginTop: 6 }}>
              {hechas.map(fila)}
            </div>
          )}
        </div>
      )}

      {/* EL CHECKLIST QUE VE EL CLIENTE. Qué ve de esta lista y su enlace, en
          el mismo lugar donde se decide. Está a la vista aunque todavía no
          haya nada que mostrarle: lo que no se ve no se encuentra. */}
      {editable && (
        <div className="lista-con-el-cliente" style={{ marginTop: 12, borderTop: `1px solid ${colors.neutralSoft}`, paddingTop: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.5, marginBottom: 5 }}>LO QUE VE EL CLIENTE</div>
          <div className="como-funciona-el-cliente" style={{ fontSize: 11, color: colors.muted, lineHeight: 1.5, marginBottom: 7 }}>
            El cliente entra con un enlace, sin usuario ni contraseña. Ve tres cosas, y nada más: los puntos que le muestres —con su estado,
            las anotaciones que marques para él y sus fotos y archivos—, las fotos y archivos del proyecto, y lo que tenga para aprobar.
          </div>
          {!todas.length ? (
            <div style={{ fontSize: 11.5, color: colors.muted, lineHeight: 1.5 }}>
              Cuando el checklist tenga puntos, acá elegís cuáles ve el cliente en su enlace y se lo mandás por correo.
            </div>
          ) : sinCompartir ? (
            <div style={{ fontSize: 11.5, color: colors.warning, lineHeight: 1.5 }}>
              Para mostrarle tareas al cliente falta correr la migración 176 en Supabase.
            </div>
          ) : (
            <>
              <div style={{ fontSize: 11.5, color: colors.inkSoft, lineHeight: 1.5 }}>
                {vistas.length
                  ? <>El cliente ve <strong style={{ color: colors.ink }}>{vistas.length} de {todas.length}</strong> en su enlace: qué dice cada punto, si está listo, y de su historial solo las anotaciones marcadas «la lee el cliente». No ve quién lo tiene ni para cuándo está.</>
                  : <>El cliente todavía no ve ningún punto. Para mostrarle uno, abrilo y tocá «Mostrar al cliente».</>}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                {abiertasSinMostrar.length > 0 && (
                  <button disabled={ocupado} onClick={() => alCliente(abiertasSinMostrar, true)} style={mini(false)}>
                    <Eye size={11} /> {vistas.length ? (abiertasSinMostrar.length === 1 ? "Mostrarle el otro abierto" : `Mostrarle los otros ${abiertasSinMostrar.length} abiertos`) : abiertasSinMostrar.length === 1 ? "Mostrarle el punto abierto" : `Mostrarle los ${abiertasSinMostrar.length} abiertos`}
                  </button>
                )}
                {vistas.length > 0 && (
                  <button disabled={ocupado} onClick={() => { if (window.confirm("¿Dejar de mostrarle al cliente todas las tareas de este proyecto?")) alCliente(vistas, false); }} style={mini(false)}>
                    <EyeOff size={11} /> Dejar de mostrarle todos
                  </button>
                )}
              </div>

              {/* MANDÁRSELO. El enlace hay que acordarse de abrirlo; el correo
                  le llega. Lleva lo mismo que ve ahí: cada punto con su
                  descripción, en qué está y la última actualización. */}
              {vistas.length > 0 && !envio && (
                <button onClick={() => setEnvio({ a: new Set(invitados.filter(i => i.email && /cliente/i.test(i.rol || "")).map(i => i.id)), otro: "", mensaje: "" })}
                  style={{ ...mini(false), padding: "5px 11px" }}>
                  <Send size={11} /> Enviarle el checklist por correo
                </button>
              )}
              {envio && (
                <div className="envio-del-checklist" style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 10, marginTop: 4 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: colors.ink, marginBottom: 2 }}>Enviarle el checklist por correo</div>
                  <div style={{ fontSize: 10.5, color: colors.muted, marginBottom: 7 }}>
                    Le llegan los {vistas.length === 1 ? "1 punto" : `${vistas.length} puntos`} que ve en su enlace, con su estado y lo que le escribiste en cada uno.
                  </div>
                  <div style={{ display: "grid", gap: 4 }}>
                    {invitados.map(i => (
                      <label key={i.id} style={{ ...linea, opacity: i.email ? 1 : 0.5 }} title={i.email || "No tiene correo cargado"}>
                        <input type="checkbox" disabled={!i.email} checked={envio.a.has(i.id)}
                          onChange={() => setEnvio(v => { const a = new Set(v.a); a.has(i.id) ? a.delete(i.id) : a.add(i.id); return { ...v, a }; })} />
                        {i.nombre} <span style={{ color: colors.muted }}>· {i.email ? `${i.rol || "de afuera"} · ${i.email}` : "sin correo"}</span>
                      </label>
                    ))}
                    {!invitados.length && (
                      <div style={{ fontSize: 11, color: colors.muted }}>Este proyecto todavía no tiene gente de afuera: agregala en la pestaña «Gente», o escribí el correo abajo.</div>
                    )}
                  </div>
                  <input value={envio.otro} aria-label="Otro correo" placeholder="Otro correo (o varios, separados por coma)"
                    onChange={e => setEnvio(v => ({ ...v, otro: e.target.value }))}
                    style={{ ...chico, width: "100%", boxSizing: "border-box", marginTop: 7 }} />
                  <textarea value={envio.mensaje} rows={2} aria-label="Unas líneas para él" placeholder="Unas líneas para él, arriba de la lista (opcional)"
                    onChange={e => setEnvio(v => ({ ...v, mensaje: e.target.value }))}
                    style={{ ...chico, width: "100%", boxSizing: "border-box", marginTop: 5, resize: "vertical", lineHeight: 1.4 }} />
                  {envio.dijo && <div role="status" style={{ fontSize: 11, color: envio.mal ? colors.danger : colors.success, marginTop: 6 }}>{envio.dijo}</div>}
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button disabled={ocupado} onClick={() => (envio.a.size || String(envio.otro).trim()
                      ? mandar() : setEnvio(v => ({ ...v, dijo: "Elegí a quién mandárselo o escribí un correo.", mal: true })))} style={boton(true)}>
                      <Send size={12} /> {ocupado ? "Enviando…" : "Enviar"}
                    </button>
                    <button onClick={() => setEnvio(null)} style={boton(false)}>Cerrar</button>
                  </div>
                </div>
              )}
            </>
          )}
          {/* LAS FOTOS Y LOS ARCHIVOS DEL PROYECTO, los que no son de un punto:
              el plano general, las fotos del terreno, la propuesta. */}
          <div className="archivos-del-proyecto-para-el-cliente" style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: colors.ink, marginBottom: 4 }}>
              Fotos y archivos del proyecto <span style={{ fontWeight: 400, color: colors.muted }}>· los que no son de un punto</span>
            </div>
            <FotosYArchivosDelCliente lead={lead} archivos={paraVer.delProyecto} enlaces={paraVer.enlaces}
              editable={editable} currentUser={currentUser} onCambio={cargarArchivos} sinMigracion={paraVer.sinMigracion} />
          </div>

          {/* SU ENLACE. A la vista en cuanto hay algo que mostrarle. */}
          {(vistas.length > 0 || paraVer.delProyecto.length > 0) && <div style={{ marginTop: 10 }}><EnlaceDelCliente lead={lead} /></div>}
          {error && !nuevo.abierto && !pegar.abierto && <div style={{ fontSize: 10.5, color: colors.danger, marginTop: 5 }}>{error}</div>}
        </div>
      )}

      {/* PEDIRLE LA APROBACIÓN, Y AVISARLE: a quién, por correo, y el
          WhatsApp listo para enviar. */}
      {pedido && (
        <PedirAprobacion lead={lead} item={pedido.item} modo={pedido.modo} users={users} currentUser={currentUser}
          archivos={paraVer.porTarea[pedido.item.id] || []} descripcion={paraElCliente[pedido.item.id]?.descripcion || ""}
          plazo={aprobaciones[pedido.item.id]?.hasta || null}
          onCambio={async () => { await cargar(); onBitacora?.(); }} onCerrar={() => setPedido(null)} />
      )}

      {/* Corregir una tarea: quién y para cuándo, qué dice y qué es. Es una
          ventana encima: antes aparecía al pie de toda la lista, debajo de lo
          del cliente, y quien tocaba «Cambiar detalles» no veía que pasara
          nada. El fondo no cierra: se sale por Cancelar. */}
      {aTarea && (
        <div className="corregir-punto"
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 16 }}>
        <div onClick={e => e.stopPropagation()}
          style={{ background: "#fff", borderRadius: colors.radiusMd, padding: 16, width: 440, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 12px 40px rgba(15,23,42,0.2)" }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.ink, marginBottom: 2 }}>¿Quién y para cuándo?</div>
          <div style={{ fontSize: 10.5, color: colors.muted, marginBottom: 8 }}>«{aTarea.item.texto}». También se corrige acá lo que esté mal escrito, y qué es. El cambio queda en la bitácora.</div>
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "flex", gap: 4 }}>
              {TIPOS_NUEVO.filter(([id]) => id !== "envio").map(([id, label]) => {
                const activo = (aTarea.tipo || "gestion") === id;
                return (
                  <button key={id} onClick={() => setATarea(a => ({ ...a, tipo: id }))}
                    style={{ ...mini(false), padding: "3px 9px", borderColor: activo ? CLASES[id].color : colors.border,
                      background: activo ? CLASES[id].color : "#fff", color: activo ? "#fff" : colors.inkSoft }}>
                    {label}
                  </button>
                );
              })}
            </div>
            <input value={aTarea.titulo} onChange={e => setATarea(a => ({ ...a, titulo: e.target.value }))} style={inputStyle} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {/* Del equipo o de afuera: el ingeniero, el proveedor, el cliente.
                  No todos los que tienen algo que hacer entran a FOREMAN. */}
              <select value={aTarea.assignee_id} onChange={e => setATarea(a => ({ ...a, assignee_id: e.target.value }))} style={inputStyle}>
                <option value="">¿Quién la hace?</option>
                <optgroup label="Del equipo">
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </optgroup>
                {invitados.length > 0 && (
                  <optgroup label="De afuera">
                    {invitados.map(i => <option key={`x${i.id}`} value={`x:${i.nombre}`}>{i.nombre}{i.rol ? ` · ${i.rol}` : ""}</option>)}
                  </optgroup>
                )}
              </select>
              {/* Ponerle fecha a algo que no la tiene es parte de organizarlo;
                  correr una fecha ya puesta es decisión de quien lleva el
                  proyecto, y para eso está el permiso. */}
              <div style={{ display: "flex", gap: 6 }}>
                <input type="date" value={aTarea.due_date || ""} onChange={e => setATarea(a => ({ ...a, due_date: e.target.value }))}
                  disabled={fechaBloqueada} title={fechaBloqueada ? "La fecha la mueve el Director o quien tenga ese permiso" : ""}
                  style={{ ...inputStyle, flex: 1, minWidth: 0, ...(fechaBloqueada ? { background: colors.bg, color: colors.inkSoft, cursor: "not-allowed" } : {}) }} />
                {aTarea.due_date && (
                  <select value={aTarea.hora || ""} onChange={e => setATarea(a => ({ ...a, hora: e.target.value }))}
                    disabled={fechaBloqueada} title="A qué hora"
                    style={{ ...inputStyle, width: 116, ...(fechaBloqueada ? { background: colors.bg, color: colors.inkSoft, cursor: "not-allowed" } : {}) }}>
                    <option value="">Todo el día</option>
                    {HORAS.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => hacer(async () => {
                const externo = String(aTarea.assignee_id).startsWith("x:") ? String(aTarea.assignee_id).slice(2) : null;
                const antes = tareas[aTarea.item.tarea_id];
                const guardada = await asegurarTarea(aTarea.item, {
                  lead, titulo: aTarea.titulo, due_date: aTarea.due_date || null, hora: (aTarea.due_date && aTarea.hora) || null,
                  tipo: aTarea.tipo === "reunion" ? "Reunión" : aTarea.tipo === "tarea" ? "Otro" : aTarea.tipo === "envio" ? "Envío" : "Gestión",
                  assignee_id: externo || !aTarea.assignee_id ? null : Number(aTarea.assignee_id),
                  responsable_externo: externo,
                });
                if (guardada?.error) { setError(guardada.error); return; }
                if (guardada?.tarea?.assignee_id && guardada.tarea.assignee_id !== antes?.assignee_id) {
                  await avisarPorCorreo(guardada.tarea.id);
                }
                // Lo que cambió queda escrito: quién la movió y de qué a qué.
                const nombre = id => users.find(u => u.id === Number(id))?.name || null;
                const cambios = [];
                if (aTarea.titulo.trim() !== aTarea.item.texto) cambios.push(`ahora dice "${aTarea.titulo.trim()}"`);
                const antesQuien = antes?.responsable_externo || nombre(antes?.assignee_id) || "nadie";
                const ahoraQuien = externo || nombre(aTarea.assignee_id) || "nadie";
                if (antesQuien !== ahoraQuien) cambios.push(`pasa de ${antesQuien} a ${ahoraQuien}`);
                // De cuándo a cuándo, no solo cuándo: seis meses después, lo
                // que hace falta saber es que la reunión se corrió y de qué día.
                if ((antes?.due_date || "") !== (aTarea.due_date || "") || (antes?.hora || "") !== (aTarea.hora || "")) {
                  const enPalabras = (f, h) => (f ? `${cuando(f)}${h ? ` a las ${h}` : ""}` : null);
                  const deCuando = enPalabras(antes?.due_date, antes?.hora);
                  const aCuando = enPalabras(aTarea.due_date, aTarea.hora);
                  cambios.push(!aCuando ? `se queda sin fecha (era ${deCuando})`
                    : deCuando ? `se mueve del ${deCuando} al ${aCuando}`
                    : `queda para el ${aCuando}`);
                }
                if (cambios.length) await anotarCorreccion(lead, `Arregló "${aTarea.item.texto}": ${cambios.join(", ")}.`, currentUser, aTarea.item.id);
                setATarea(null);
              })} disabled={ocupado || !aTarea.titulo.trim()} style={boton(true)}>Guardar</button>
              <button onClick={() => setATarea(null)} style={boton(false)}>Cancelar</button>
            </div>
          </div>
        </div>
        </div>
      )}

      {/* Avisar de una reunión: al del equipo que la tiene y a los de afuera
          que vengan. Va con el .ics adjunto, así al cliente le queda en su
          propio calendario sin entrar a FOREMAN. El fondo no cierra: se sale
          por Cerrar. */}
      {avisar && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 16 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: colors.radiusMd, padding: 16, width: 340, maxWidth: "100%", boxShadow: "0 12px 40px rgba(15,23,42,0.2)" }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.ink }}>¿A quién le aviso?</div>
            <div style={{ fontSize: 10.5, color: colors.muted, marginBottom: 8 }}>
              {avisar.item.texto}{avisar.tarea?.due_date ? ` · ${cuando(avisar.tarea.due_date)}${avisar.tarea.hora ? ` ${avisar.tarea.hora}` : ""}` : ""}
            </div>

            <div style={{ display: "grid", gap: 4 }}>
              {avisar.tarea?.assignee_id && (
                <label style={linea}>
                  <input type="checkbox" checked={avisar.a.has("responsable")}
                    onChange={() => setAvisar(v => { const a = new Set(v.a); a.has("responsable") ? a.delete("responsable") : a.add("responsable"); return { ...v, a }; })} />
                  {users.find(u => u.id === avisar.tarea.assignee_id)?.name || "Responsable"} <span style={{ color: colors.muted }}>· del equipo</span>
                </label>
              )}
              {invitados.map(i => (
                <label key={i.id} style={{ ...linea, opacity: i.email ? 1 : 0.5 }} title={i.email || "No tiene correo cargado"}>
                  <input type="checkbox" disabled={!i.email} checked={avisar.a.has(i.id)}
                    onChange={() => setAvisar(v => { const a = new Set(v.a); a.has(i.id) ? a.delete(i.id) : a.add(i.id); return { ...v, a }; })} />
                  {i.nombre} <span style={{ color: colors.muted }}>· {i.email ? i.rol || "de afuera" : "sin correo"}</span>
                </label>
              ))}
              {!invitados.length && !avisar.tarea?.assignee_id && (
                <div style={{ fontSize: 11, color: colors.muted }}>Esta reunión no tiene responsable ni gente de afuera cargada en el proyecto.</div>
              )}
            </div>

            {avisar.dijo && <div style={{ fontSize: 11, color: avisar.mal ? colors.danger : colors.success, marginTop: 8 }}>{avisar.dijo}</div>}

            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button disabled={ocupado || !avisar.a.size} onClick={async () => {
                setOcupado(true);
                try {
                  const r = await fetch("/api/aviso?de=reunion", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      tareaId: avisar.tarea.id,
                      alResponsable: avisar.a.has("responsable"),
                      correos: [...avisar.a].filter(x => x !== "responsable"),
                    }),
                  });
                  const d = await r.json();
                  if (d.ok) { setAvisar(v => ({ ...v, dijo: `Avisado a ${d.enviadoA.join(", ")}.`, mal: false })); onBitacora?.(); }
                  else setAvisar(v => ({ ...v, dijo: d.error || "No se pudo avisar.", mal: true }));
                } catch (e) {
                  setAvisar(v => ({ ...v, dijo: "No se pudo avisar: " + e.message, mal: true }));
                } finally { setOcupado(false); }
              }} style={{ ...boton(true), opacity: avisar.a.size ? 1 : 0.5 }}>
                {ocupado ? "Enviando…" : "Avisar"}
              </button>
              <button onClick={() => setAvisar(null)} style={boton(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const linea = { display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: colors.ink, cursor: "pointer" };

const chico = { ...inputStyle, padding: "5px 8px", fontSize: 12 };

// Las cuatro cosas que puede haber en un proyecto, y qué pide cada una.
const TIPOS_NUEVO = [["gestion", "Gestión"], ["tarea", "Tarea"], ["reunion", "Reunión"], ["envio", "Envío"]];

const PISTA = {
  gestion: "¿Qué hay que gestionar? Enter para agregar",
  tarea: "¿Qué hay que hacer? Enter para agregar",
  reunion: "¿De qué es la reunión?",
  envio: "¿Qué se envió? Ej: propuesta económica rev.2",
};
const PIDE = {
  gestion: "Se marca cuando pasa. Responsable y fecha, si hay.",
  tarea: "Pide responsable. La fecha, si la hay.",
  reunion: "Pide día. A una hora o todo el día.",
  envio: "Ya pasó: pide a quién y cuándo. Queda registrado, no pendiente.",
};

const boton = fuerte => ({
  display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", fontFamily: colors.font, fontSize: 12, fontWeight: 600,
  border: `1px solid ${fuerte ? colors.ink : colors.border}`, background: fuerte ? colors.ink : "#fff",
  color: fuerte ? "#fff" : colors.inkSoft, borderRadius: 8, padding: "5px 11px",
});

// Una tarea del proyecto: se toca y cuenta lo suyo.
//
// Cerrada es una línea con su casilla. Abierta dice qué se hizo, quién la
// marcó y cuándo, si está esperando a alguien, y deja escribir lo que solo sabe
// quien la trabajó. Los botones dicen su nombre: un ⧗ y un ✓ sueltos no le
// enseñan a nadie cómo se usa esto.
//
// Abierta se lee en cuatro partes, cada una con su título y diciendo qué pasa
// al tocarla: ¿PARA CUÁNDO? · ¿QUÉ PASÓ? · LO QUE VE EL CLIENTE DE ESTE PUNTO ·
// ¿YA ESTÁ?. Al pie, lo que se toca poco. Y se cierra: arriba, abajo y con la
// flecha.
function Actividad({ item, etiqueta, tarea, users = [], abierta, onAbrir, ocupado, hacer, currentUser, editable = true, puedeCorrer = true, onTarea, onAvisar, laVeElCliente = false, onCliente = null, hayCliente = false, sinNotas = false, aprobacion = null, sinAprobacion = false, onPedirAprobacion = null, delCliente = null, sinReporte = false, anotado = [], pasado = [], etapas = [], onEtapa = null, etapaVieja = null, lead = null, archivos = [], enlaces = {}, sinArchivos = false, onArchivos = null, onAgarrar = null, onMarcar = null, onAvanzar = null, onEspera = null }) {
  const [nota, setNota] = useState(item.nota || "");
  // EL ✓ PREGUNTA QUÉ PASÓ: null · "elegir" (los tres botones) · "avanzo" (se escribe qué sigue).
  const [pregunta, setPregunta] = useState(null);
  const [paso, setPaso] = useState({ texto: "", dia: "", alCliente: true, falta: "" });
  // Un Enter doble mandaba dos veces la misma anotación.
  const enviando = useRef(false);
  // Lo que se toca poco, plegado: lo del cliente, y etapa / responsable / quitar.
  const [verCliente, setVerCliente] = useState(false);
  const [mas, setMas] = useState(false);
  useEffect(() => { setNota(item.nota || ""); }, [item.nota]);
  // Lo último que alguien anotó: se lee en la fila sin abrirla.
  const ultima = ultimaAnotacion(anotado);
  // LO QUE SE ANOTA ES LA ACTUALIZACIÓN QUE LEE EL CLIENTE. En un punto que
  // él ve, la anotación nace para él —lo dice el botón— y se elige «Solo
  // nosotros» para lo interno. Antes había un tilde apagado debajo y un cuadro
  // aparte de «actualización»: se anotaba en el historial, que él no lee, y en
  // su enlace no aparecía nada.
  const puedeLeerlo = laVeElCliente && !sinNotas;
  // Devuelve null o el motivo: el cuadro del historial lo dice ahí mismo.
  const anotarPaso = async (paso, { alCliente = false } = {}) => {
    let dijo = null;
    await hacer(async () => { dijo = await anotarEnLaTarea(item, paso, currentUser, { alCliente: alCliente && puedeLeerlo }); });
    return dijo;
  };
  // Mostrarle una anotación que ya estaba, o dejar de mostrársela.
  const mostrarNota = async (nota, ver) => {
    let dijo = null;
    await hacer(async () => { dijo = await mostrarNotaAlCliente(nota, ver, { punto: item, quien: currentUser }); });
    return dijo;
  };
  // Cuántas anotaciones lee, y cómo se le dice a él en qué está el punto.
  const leidas = (anotado || []).filter(c => c.visible_cliente === true && String(c.texto || "").trim()).length;
  // El plazo del pedido que espera respuesta: cuánto le queda, o hace cuánto venció.
  const plazo = aprobacion?.estado === "pendiente" ? plazoDe(aprobacion.hasta, hoyISO()) : null;
  const estadoParaEl = item.hecho ? "Listo" : aprobacion?.estado === "pendiente" ? "Esperando su aprobación"
    : item.espera ? "En espera" : "Pendiente";
  // La descripción para el cliente: qué es este punto, dicho para él. Se
  // guarda sola al salir del casillero, y dice al lado que quedó guardada.
  const [paraEl, setParaEl] = useState({ descripcion: delCliente?.descripcion || "" });
  const [guardado, setGuardado] = useState("");
  useEffect(() => { setParaEl({ descripcion: delCliente?.descripcion || "" }); }, [delCliente?.descripcion]);
  const escribir = campo => {
    if ((delCliente?.[campo] || "") === paraEl[campo].trim()) return;
    setGuardado("guardando");
    hacer(async () => {
      const e = await escribirleAlCliente(item, { [campo]: paraEl[campo] });
      setGuardado(e || "guardado");
    });
  };
  const deQuien = t => t?.responsable_externo || users.find(u => u.id === t?.assignee_id)?.name || "sin responsable";
  // Solo las que alguien tomó se anuncian como «de fulano»: decir «de sin
  // responsable» sería ruido.
  const tomada = t => !!(t?.assignee_id || t?.responsable_externo);
  // Una reunión es la que tiene hora o quedó marcada como tal.
  const esReunion = t => !!(t?.hora || t?.type === "Reunión");
  const clase = CLASES[claseDe(tarea)];
  const hoy = hoyISO();
  // EN QUÉ ESTÁ, con palabras: es lo que dice la pastilla de la fila.
  const est = estadoDeActividad(item, tarea, hoy);
  const vencida = est.clase === "vencida";
  const guardarPaso = async () => {
    if (enviando.current) return;
    enviando.current = true;
    try {
      const falta = await onAvanzar?.({ texto: paso.texto, due_date: paso.dia, alCliente: paso.alCliente && puedeLeerlo, vence: tarea?.due_date || "" });
      if (falta) { setPaso(p => ({ ...p, falta })); return; }
      setPregunta(null); setPaso({ texto: "", dia: "", alCliente: true, falta: "" });
    } finally { enviando.current = false; }
  };
  // LO QUE DISTINGUE A ESTE PUNTO DE LOS DEMÁS, y nada más: qué es si no es una
  // gestión, de quién, y del cliente solo cuando hay algo que decir.
  const datos = [
    claseDe(tarea) !== "gestion" ? <span style={{ color: clase.color, fontWeight: 700 }}>{clase.label.toLowerCase()}</span> : null,
    item.hecho ? [item.hecho_por, cuando(item.hecho_at)].filter(Boolean).join(" · ") || null : tomada(tarea) ? deQuien(tarea) : null,
    // En qué etapa estaba el proyecto cuando se escribió.
    etiqueta || null,
    laVeElCliente && archivos.length ? <span className="archivos-del-cliente" style={{ color: colors.brand }}><Paperclip size={10} style={{ verticalAlign: "-1px" }} /> {cuantosDice(archivos)}</span> : null,
    // Si se le pidió que lo apruebe, en qué está: es lo que se viene a mirar sin abrir el punto.
    laVeElCliente && aprobacion ? (
      <span className="aprobacion-del-cliente" data-estado={aprobacion.estado} data-vencida={plazo?.vencida ? "si" : "no"}
        style={{ fontWeight: 700, color: aprobacion.estado === "aprobado" ? colors.success : aprobacion.estado === "observado" || plazo?.vencida ? colors.danger : colors.warning }}>
        {aprobacion.estado === "aprobado" ? "aprobado por el cliente" : aprobacion.estado === "observado" ? "el cliente dejó observaciones"
          // Con fecha límite, la fila dice cuánto le queda; y si se le pasó, que venció.
          : plazo?.vencida ? `el cliente no aprobó: ${plazo.dice}` : `espera que el cliente apruebe${plazo ? ` · ${plazo.dice}` : ""}`}
      </span>
    ) : null,
    // La que el cliente NO ve, en un proyecto donde ve las demás: esa sí se dice.
    !laVeElCliente && hayCliente && !item.hecho && onCliente ? (
      <span className="no-la-ve-el-cliente" title="El cliente no ve este punto. Abrilo y tocá «Para el cliente»." style={{ color: colors.warning }}>
        <EyeOff size={10} style={{ verticalAlign: "-1px" }} /> no la ve el cliente
      </span>
    ) : null,
  ].filter(Boolean);
  // Qué ve el cliente de este punto, en una línea: lo que dice el pliegue cerrado.
  const resumenDelCliente = !laVeElCliente ? "no ve este punto" : ["lo ve",
    leidas ? (leidas === 1 ? "1 anotación" : `${leidas} anotaciones`) : null,
    archivos.length ? cuantosDice(archivos) : null,
    aprobacion ? (aprobacion.estado === "aprobado" ? "lo aprobó" : aprobacion.estado === "observado" ? "dejó observaciones" : "espera su aprobación") : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="punto-del-checklist" data-id={item.id}
      // Cerrado se agarra entero para llevarlo a otra etapa; abierto no, que
      // adentro hay casilleros donde se selecciona texto.
      draggable={!!onAgarrar && !abierta}
      onDragStart={ev => { if (!onAgarrar || abierta) return; try { ev.dataTransfer.effectAllowed = "move"; ev.dataTransfer.setData("text/plain", String(item.id)); } catch { /* sin eso se arrastra igual */ } onAgarrar(true); }}
      onDragEnd={() => onAgarrar?.(false)}
      style={{ borderBottom: `1px solid ${colors.neutralSoft}`, background: abierta ? colors.bg : "transparent",
        margin: abierta ? "0 -12px" : 0, padding: abierta ? "0 12px" : 0, cursor: onAgarrar && !abierta ? "grab" : "auto" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 0" }}>
        <button className="que-paso-con-el-punto" disabled={ocupado || !editable} aria-expanded={!!pregunta}
          onClick={() => { if (!editable) return; if (item.hecho) onMarcar?.(false); else setPregunta(p => (p ? null : "elegir")); }}
          title={!editable ? "Solo mirar" : item.hecho ? "Volver a abrir" : "¿Qué pasó? Avanzó, queda en espera o terminó"}
          aria-label={item.hecho ? "Volver a abrir" : "¿Qué pasó con este punto?"}
          style={{ width: 20, height: 20, flexShrink: 0, marginTop: 0, borderRadius: "50%", cursor: editable ? "pointer" : "default", padding: 0,
            border: `1.5px solid ${item.hecho ? colors.success : pregunta ? colors.brand : vencida ? colors.danger : colors.border}`,
            background: item.hecho ? colors.success : pregunta ? colors.brand : "#fff",
            display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Check size={12} color={item.hecho || pregunta ? "#fff" : colors.muted} />
        </button>
        {/* Su color, el mismo del tablero. */}
        <span style={{ width: 3, alignSelf: "stretch", borderRadius: 2, background: clase.color, opacity: item.hecho || item.espera ? 0.4 : 1, flexShrink: 0 }} />
        <div onClick={onAbrir} style={{ flex: 1, minWidth: 0, cursor: "pointer" }}>
          <div style={{ fontSize: 13, lineHeight: 1.35, color: item.hecho ? colors.muted : item.espera ? colors.inkSoft : colors.ink, textDecoration: item.hecho ? "line-through" : "none", overflowWrap: "anywhere" }}>
            {item.texto}
          </div>
          {datos.length > 0 && (
            <div className="datos-del-punto" style={{ fontSize: 10.5, color: colors.muted, marginTop: 1 }}>
              {datos.map((d, i) => <Fragment key={i}>{i > 0 ? " · " : ""}{d}</Fragment>)}
            </div>
          )}
          {/* Lo último que se anotó: en qué va la gestión, sin abrirla. */}
          {ultima && !abierta && (
            <div className="ultima-anotacion" title={ultima.texto}
              style={{ fontSize: 11, color: colors.inkSoft, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {/* El ojo dice que esa anotación la lee el cliente. */}
              {laVeElCliente && ultima.visible_cliente === true
                ? <Eye size={10} style={{ verticalAlign: "-1px", marginRight: 3 }} color={colors.brand} />
                : <History size={10} style={{ verticalAlign: "-1px", marginRight: 3 }} color={colors.muted} />}
              <span style={{ color: colors.muted }}>{cuando(ultima.created_at)} · </span>{ultima.texto}
            </div>
          )}
        </div>
        {/* EN QUÉ ESTÁ, a la derecha y siempre en el mismo lugar. */}
        <span className="estado-de-la-actividad" data-estado={est.clase} style={pildora(est.clase)}>
          {est.clase === "espera" && <Hourglass size={10} />}{est.dice}
        </span>
        {/* La flecha dice que la fila se abre, y la cierra. */}
        <button className="abrir-o-cerrar" onClick={onAbrir} aria-expanded={abierta} aria-label={abierta ? "Cerrar este punto" : "Abrir este punto"}
          title={abierta ? "Cerrar" : "Abrir: qué pasó, para cuándo, y lo del cliente"}
          style={{ background: "none", border: "none", padding: 1, cursor: "pointer", color: colors.muted, flexShrink: 0, display: "flex", marginTop: 1 }}>
          {abierta ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
      </div>

      {/* ¿QUÉ PASÓ CON ESTE PUNTO? Lo que pregunta el ✓, ahí mismo y con palabras.
          Antes el ✓ lo cerraba sin preguntar y lo que seguía nacía como otro punto. */}
      {pregunta && editable && !item.hecho && (
        <div className="que-paso" style={{ margin: "0 0 10px 30px", background: colors.brandSoft, borderRadius: colors.radiusMd, padding: 10, display: "grid", gap: 7 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.ink, overflowWrap: "anywhere" }}>¿Qué pasó con «{item.texto}»?</div>
          {pregunta === "elegir" ? (
            <div style={{ display: "grid", gap: 6 }}>
              <button className="avanzo" onClick={() => setPregunta("avanzo")} disabled={ocupado} style={opcion}>
                <span style={icono(colors.brandSoft, colors.brand)}><CornerDownRight size={13} /></span>
                <span><strong>Avanzó: anotar qué sigue</strong><br /><span style={dice}>Sigue siendo este punto, con su historial.</span></span>
              </button>
              <button className="queda-en-espera" onClick={() => { setPregunta(null); onEspera?.(!item.espera); }} disabled={ocupado} style={opcion}>
                <span style={icono(colors.warningSoft, colors.warning)}><Hourglass size={13} /></span>
                {item.espera
                  ? <span><strong>Ya no está en espera</strong><br /><span style={dice}>Vuelve a estar en curso.</span></span>
                  : <span><strong>Queda en espera</strong><br /><span style={dice}>Se hizo lo que tocaba y todavía no hay paso nuevo. No se cierra.</span></span>}
              </button>
              <button className="terminada" onClick={() => { setPregunta(null); onMarcar?.(true); }} disabled={ocupado} style={opcion}>
                <span style={icono(colors.successSoft, colors.success)}><Check size={13} /></span>
                <span><strong>Terminada: ya no hay más que hacer</strong><br /><span style={dice}>Pasa a «hechos»{laVeElCliente ? ", y el cliente la ve como lista" : ""}. Se puede volver a abrir.</span></span>
              </button>
              <div><button className="cancelar-que-paso" onClick={() => setPregunta(null)} style={mini(false)}>Cancelar</button></div>
            </div>
          ) : (
            <>
              <input className="que-sigue-en-el-punto" value={paso.texto} autoFocus aria-label="Qué pasó, o qué sigue"
                onChange={e => setPaso(p => ({ ...p, texto: e.target.value, falta: "" }))}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); guardarPaso(); } }}
                placeholder="Qué pasó, o qué sigue. Ej: llegó la cotización; gestionar reunión para consultas"
                style={{ ...chico, width: "100%", boxSizing: "border-box", background: "#fff" }} />
              {puedeCorrer && (
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ fontSize: 10.5, color: colors.inkSoft }}>Para cuándo (opcional):</span>
                  {[["Hoy", 0], ["Mañana", 1], ["En una semana", 7]].map(([txt, n]) => {
                    const f = sumarDias(hoy, n);
                    return <button key={txt} onClick={() => setPaso(p => ({ ...p, dia: p.dia === f ? "" : f }))} style={mini(paso.dia === f)}>{txt}</button>;
                  })}
                  <input type="date" value={paso.dia} aria-label="Para cuándo queda" onChange={e => setPaso(p => ({ ...p, dia: e.target.value }))}
                    style={{ ...chico, width: 128, padding: "2px 6px", fontSize: 11.5, background: "#fff" }} />
                </div>
              )}
              {puedeLeerlo && (
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: colors.inkSoft, cursor: "pointer" }}>
                  <input type="checkbox" className="que-lo-lea-el-cliente" checked={paso.alCliente} onChange={e => setPaso(p => ({ ...p, alCliente: e.target.checked }))} />
                  Que el cliente lo lea en su enlace
                </label>
              )}
              {paso.falta && <div role="alert" style={{ fontSize: 10.5, color: colors.danger }}>{paso.falta}</div>}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button className="anotar-el-paso" onClick={guardarPaso} disabled={ocupado} style={boton(true)}><CornerDownRight size={12} /> Anotar</button>
                <button onClick={() => setPregunta("elegir")} style={boton(false)}>Volver</button>
              </div>
            </>
          )}
        </div>
      )}

      {abierta && (
        <div className="punto-abierto" style={{ paddingLeft: 30, paddingBottom: 10, display: "grid", gap: 10 }}>
          {/* Qué es, en una línea, y por dónde se sale. */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0, fontSize: 10.5, color: colors.muted, lineHeight: 1.5 }}>
              {item.hecho
                ? `Hecha${item.hecho_por ? ` por ${item.hecho_por}` : ""}${item.hecho_at ? ` el ${cuando(item.hecho_at)}` : ""}.`
                : item.espera ? "En espera." : "En curso."}
              {tomada(tarea) ? (
                <> A cargo de <strong style={{ color: colors.ink }}>{deQuien(tarea)}</strong>{tarea.responsable_externo ? " (de afuera)" : ""}.</>
              ) : tarea ? (
                <> Todavía sin responsable.</>
              ) : null}
            </div>
            <button className="cerrar-punto" onClick={onAbrir} style={mini(false)}><ChevronUp size={11} /> Cerrar</button>
          </div>

          {/* ¿QUÉ PASÓ? El historial. Qué pasó con este punto, en orden: lo que
              alguien anotó —en negro— y lo que pasó solo —en gris—. Antes eran
              un «Comentarios», una nota suelta que se pisaba y la bitácora del
              proyecto, cada cosa por su lado. */}
          <HistorialDeTarea tarea={tarea} users={users} currentUser={currentUser} editable={editable} ocupado={ocupado}
            anotado={anotado} pasado={pasado} onAnotar={anotarPaso} titulo="¿QUÉ PASÓ? · EL HISTORIAL DE ESTE PUNTO"
            paraElCliente={puedeLeerlo} onMostrarNota={mostrarNota} />

          {/* ¿PARA CUÁNDO? La fecha se cambia de un toque. AGENDAR ES ACÁ
              MISMO: los tres botones alcanzan para «mañana»; una reunión es un
              día cualquiera a una hora. El punto sigue siendo el mismo: no
              nace otra tarea para la reunión. */}
          {editable && !item.hecho && (
            <div className="para-cuando" style={parte}>
              <div style={titulito}>¿PARA CUÁNDO?</div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                {[["Hoy", 0], ["Mañana", 1], ["En una semana", 7]].map(([txt, n]) => {
                  const f = sumarDias(hoy, n);
                  return (
                    <button key={txt} disabled={ocupado || !puedeCorrer} title={puedeCorrer ? "" : "La fecha la mueve el Director o quien tenga ese permiso"}
                      onClick={() => hacer(() => ponerFecha(item, f, currentUser))}
                      style={{ ...mini(String(tarea?.due_date || "").slice(0, 10) === f), opacity: puedeCorrer ? 1 : 0.5 }}>{txt}</button>
                  );
                })}
                <input type="date" value={String(tarea?.due_date || "").slice(0, 10)} disabled={ocupado || !puedeCorrer} aria-label="Para qué día"
                  title={puedeCorrer ? "Otro día" : "La fecha la mueve el Director o quien tenga ese permiso"}
                  onChange={e => { const f = e.target.value || null; hacer(() => ponerFecha(item, f, currentUser, f ? tarea?.hora || null : null)); }}
                  style={{ ...chico, width: 128, padding: "2px 6px", fontSize: 11.5, opacity: puedeCorrer ? 1 : 0.5 }} />
                <select value={tarea?.hora || ""} disabled={ocupado || !puedeCorrer || !tarea?.due_date} aria-label="A qué hora"
                  title={tarea?.due_date ? "A qué hora" : "Primero el día"}
                  onChange={e => { const h = e.target.value || null; hacer(() => ponerFecha(item, String(tarea.due_date).slice(0, 10), currentUser, h)); }}
                  style={{ ...chico, width: 104, padding: "2px 6px", fontSize: 11.5, opacity: tarea?.due_date && puedeCorrer ? 1 : 0.5 }}>
                  <option value="">Todo el día</option>
                  {HORAS.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
                {tarea?.due_date && puedeCorrer && (
                  <button disabled={ocupado} onClick={() => hacer(() => ponerFecha(item, null, currentUser))} style={mini(false)}>Sin fecha</button>
                )}
                {/* Una reunión hay que avisarla: el del equipo la ve en FOREMAN,
                    pero el cliente y el ingeniero no entran acá. */}
                {esReunion(tarea) && tarea?.due_date && (
                  <button className="avisar-reunion" onClick={() => onAvisar(tarea)} style={{ ...mini(false), borderColor: CLASES.reunion.color, color: CLASES.reunion.color }}>
                    <Mail size={11} /> Avisar por correo
                  </button>
                )}
              </div>
            </div>
          )}

          {/* SU ESTADO: dejarlo en espera, o terminarlo. Lo mismo que pregunta el ✓ de la fila. */}
          {editable && !item.hecho && (
            <div className="ya-esta" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button className="en-espera" onClick={() => onEspera?.(!item.espera)} disabled={ocupado} style={mini(item.espera)}>
                <Hourglass size={11} /> {item.espera ? "Ya no está en espera" : "Dejar en espera"}
              </button>
              <button className="marcar-hecha" onClick={() => onMarcar?.(true)} disabled={ocupado}
                style={{ ...mini(false), background: colors.success, borderColor: colors.success, color: "#fff", padding: "4px 11px" }}>
                <Check size={11} /> Terminada
              </button>
            </div>
          )}
          {editable && item.hecho && (
            <div className="ya-esta" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button className="volver-a-abrir" onClick={() => onMarcar?.(false)} disabled={ocupado} style={mini(false)}><RotateCcw size={11} /> Volver a abrir</button>
            </div>
          )}

          {/* PARA EL CLIENTE, plegado: dice en una línea qué ve, y se abre para lo demás. */}
          {(laVeElCliente || (onCliente && editable)) && (
            <button className="ver-lo-del-cliente" aria-expanded={verCliente} onClick={() => setVerCliente(v => !v)} style={pliegue}>
              {verCliente ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              {laVeElCliente ? <Eye size={11} color={colors.brand} /> : <EyeOff size={11} />}
              <strong style={{ letterSpacing: 0.4, color: laVeElCliente ? colors.brand : colors.inkSoft }}>PARA EL CLIENTE</strong>
              <span style={{ color: colors.inkSoft, overflowWrap: "anywhere", textAlign: "left" }}>{resumenDelCliente}</span>
            </button>
          )}
          {/* LO QUE VE EL CLIENTE DE ESTE PUNTO, en su enlace y en el correo:
              el título y en qué está, las anotaciones del historial marcadas
              para él, y las fotos y archivos que se suben acá. */}
          {verCliente && laVeElCliente && (
            <div className="para-el-cliente" style={{ background: colors.brandSoft, borderRadius: colors.radiusSm, padding: "8px 10px", display: "grid", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Eye size={11} color={colors.brand} style={{ flexShrink: 0 }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: colors.brand, letterSpacing: 0.4 }}>LO QUE VE EL CLIENTE DE ESTE PUNTO</span>
                <span role="status" style={{ fontSize: 10.5, color: guardado === "guardado" || guardado === "guardando" || !guardado ? colors.muted : colors.danger }}>
                  {guardado === "guardando" ? "Guardando…" : guardado === "guardado" ? "Guardado" : guardado}
                </span>
              </div>
              <div className="que-ve-el-cliente" style={{ ...ayudita, color: colors.inkSoft }}>
                El título, que está <strong style={{ color: colors.ink }}>{estadoParaEl}</strong>
                {leidas > 0 ? <>, <strong style={{ color: colors.ink }}>{leidas === 1 ? "1 anotación" : `${leidas} anotaciones`}</strong> del historial</> : null}
                {archivos.length > 0 ? <> y <strong style={{ color: colors.ink }}>{cuantosDice(archivos)}</strong></> : null}.
                {sinNotas
                  ? " Para que también lea las anotaciones falta correr la migración 185 en Supabase."
                  : leidas > 0 ? "" : " Todavía no lee ninguna anotación: la que escribas arriba le llega, y a una que ya está se le toca «solo nosotros» para mostrársela."}
              </div>
              {/* LAS FOTOS Y LOS ARCHIVOS DE ESTE PUNTO. Lo que se sube acá lo
                  ve el cliente debajo del punto: el lugar dice para quién es. */}
              <div className="archivos-del-punto" style={{ display: "grid", gap: 5 }}>
                <div style={{ ...titulito, color: colors.brand, display: "flex", alignItems: "center", gap: 5 }}>
                  <Paperclip size={11} /> <span>FOTOS Y ARCHIVOS PARA EL CLIENTE</span>
                </div>
                <FotosYArchivosDelCliente lead={lead || { id: item.lead_id }} punto={item} archivos={archivos} enlaces={enlaces}
                  editable={editable} currentUser={currentUser} onCambio={onArchivos} sinMigracion={sinArchivos} />
                <div style={ayudita}>El plano, la cotización o la foto que tenga que revisar: los ve debajo de este punto, y los abre o los baja.</div>
              </div>
              {/* ¿LO TIENE QUE APROBAR? Se le pide acá; contesta en su enlace. */}
              {(editable || aprobacion) && (
                <div className="aprobacion-del-punto" data-estado={aprobacion?.estado || "sin-pedir"} style={{ display: "grid", gap: 5 }}>
                  <div style={{ ...titulito, color: colors.brand, display: "flex", alignItems: "center", gap: 5 }}>
                    <ThumbsUp size={11} /> <span>¿LO TIENE QUE APROBAR?</span>
                  </div>
                  {sinAprobacion ? (
                    <div style={{ ...ayudita, color: colors.warning }}>Para pedirle la aprobación al cliente falta correr la migración 186 en Supabase.</div>
                  ) : !aprobacion ? (
                    <>
                      <div>
                        <button className="pedir-aprobacion" onClick={() => onPedirAprobacion?.("pedir")} disabled={ocupado}
                          style={{ ...mini(false), borderColor: colors.brand, color: colors.brand, padding: "4px 11px" }}>
                          <ThumbsUp size={11} /> Pedirle que lo apruebe
                        </button>
                      </div>
                      <div style={ayudita}>
                        Subile antes lo que tenga que revisar. Al pedirlo se le avisa por correo y te dejo el WhatsApp listo; en su enlace le
                        aparecen «Lo apruebo» y «Tengo una observación». Lo que conteste queda en el registro de aprobaciones del proyecto.
                      </div>
                    </>
                  ) : aprobacion.estado === "pendiente" ? (
                    <>
                      <div style={{ fontSize: 12, color: colors.warning, fontWeight: 600, lineHeight: 1.4 }}>
                        <Hourglass size={11} style={{ verticalAlign: "-1px", marginRight: 4 }} />Esperando que el cliente lo apruebe.
                      </div>
                      {/* LA FECHA LÍMITE: cuánto le queda, y se cambia acá mismo. Se guarda al elegir. */}
                      <div className="plazo-del-pedido" data-vencida={plazo?.vencida ? "si" : "no"} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", fontSize: 11.5 }}>
                        <span style={{ color: plazo?.vencida ? colors.danger : plazo ? colors.ink : colors.muted, fontWeight: plazo ? 600 : 400 }}>
                          {plazo ? `${plazo.frase}.` : "Sin fecha límite."}
                        </span>
                        {editable && (
                          <>
                            <input type="date" value={plazo?.hasta || ""} disabled={ocupado} aria-label="Hasta cuándo tiene para aprobar"
                              title={plazo ? "Cambiarle la fecha límite" : "Ponerle una fecha límite"}
                              onChange={e => hacer(() => ponerPlazoDeAprobacion(item, e.target.value || null, currentUser))}
                              style={{ ...chico, width: 128, padding: "2px 6px", fontSize: 11.5 }} />
                            {plazo && <button className="quitar-plazo" disabled={ocupado} onClick={() => hacer(() => ponerPlazoDeAprobacion(item, null, currentUser))} style={mini(false)}>Sin fecha límite</button>}
                          </>
                        )}
                      </div>
                      {plazo?.vencida && (
                        <div style={{ ...ayudita, color: colors.danger }}>
                          Se le pasó el plazo sin contestar. Todavía puede aprobar desde su enlace: avisale de nuevo, o dale otra fecha.
                        </div>
                      )}
                      <div style={ayudita}>
                        En su enlace tiene «Lo apruebo» y «Tengo una observación» en este punto, y aparece en su solapa «Para aprobar».
                        Si no contesta, se le avisa de nuevo: por correo, o con el WhatsApp ya escrito.
                      </div>
                      {editable && (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button className="avisar-de-nuevo" onClick={() => onPedirAprobacion?.("avisar")} disabled={ocupado}
                            style={{ ...mini(false), borderColor: colors.brand, color: colors.brand }}>
                            <Mail size={11} /> Avisarle de nuevo
                          </button>
                          <button className="no-pedir-aprobacion" onClick={() => hacer(() => pedirAprobacion(item, false, currentUser))} disabled={ocupado} style={mini(false)}>
                            <X size={11} /> Ya no hace falta que lo apruebe
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.4, color: aprobacion.estado === "aprobado" ? colors.success : colors.danger, overflowWrap: "anywhere" }}>
                        {aprobacion.estado === "aprobado"
                          ? <><Check size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />El cliente lo aprobó{aprobacion.respondido_at ? ` el ${cuando(aprobacion.respondido_at)}` : ""}.</>
                          : <><MessageSquareWarning size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />El cliente dejó observaciones{aprobacion.respondido_at ? ` el ${cuando(aprobacion.respondido_at)}` : ""}.</>}
                        {aprobacion.nota && (
                          <div className="nota-del-cliente" style={{ fontWeight: 400, color: colors.ink, marginTop: 3, whiteSpace: "pre-wrap" }}>«{aprobacion.nota}»</div>
                        )}
                      </div>
                      {editable && (
                        <>
                          <div>
                            <button className="pedir-aprobacion" onClick={() => onPedirAprobacion?.("pedir")} disabled={ocupado} style={mini(false)}>
                              <RotateCcw size={11} /> Volver a pedirle que lo apruebe
                            </button>
                          </div>
                          <div style={ayudita}>
                            {aprobacion.estado === "aprobado"
                              ? "Quedó en el registro de aprobaciones, con los archivos que tenía para mirar. Si cambia lo que aprobó —otro plano, otra cotización—, se le vuelve a pedir y contesta de nuevo."
                              : "Quedó en el registro de aprobaciones. Cuando esté corregido, subí lo nuevo y volvé a pedirle: en su enlace le aparecen otra vez los botones."}
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
              )}
              {!sinReporte && (
                <input value={paraEl.descripcion} readOnly={!editable} aria-label="Descripción para el cliente"
                  onChange={e => { setParaEl(p => ({ ...p, descripcion: e.target.value })); setGuardado(""); }} onBlur={() => editable && escribir("descripcion")}
                  placeholder="Descripción para él: qué es este punto (opcional, se guarda solo)"
                  style={{ ...chico, width: "100%", boxSizing: "border-box" }} />
              )}
            </div>
          )}
          {/* Si no se le muestra, lo dice, y ahí mismo se le muestra. */}
          {verCliente && !laVeElCliente && onCliente && editable && (
            <div className="no-lo-ve-el-cliente" style={{ border: `1px dashed ${colors.border}`, borderRadius: colors.radiusSm, padding: "8px 10px", display: "grid", gap: 5 }}>
              <div style={{ ...titulito, display: "flex", alignItems: "center", gap: 5 }}><EyeOff size={11} /> <span>EL CLIENTE NO VE ESTE PUNTO</span></div>
              <div>
                <button className="mostrar-al-cliente" onClick={() => onCliente(true)} disabled={ocupado}
                  style={{ ...mini(false), borderColor: colors.brand, color: colors.brand, padding: "4px 11px" }}><Eye size={11} /> Mostrar al cliente</button>
              </div>
              <div style={ayudita}>
                Al mostrárselo ve el título y si está listo. Y acá mismo se abre dónde subirle fotos y archivos, y lo que anotes en el historial pasa a ser su actualización.
              </div>
            </div>
          )}

          {/* La nota suelta de antes: ya no se ofrece —lo que pasó va al
              historial, con fecha y con nombre—, pero la que alguien hubiera
              escrito no se esconde ni se pierde. */}
          {(item.nota || "").trim() !== "" && (
            <textarea value={nota} onChange={e => setNota(e.target.value)} rows={2} readOnly={!editable} aria-label="Nota de antes"
              onBlur={() => { if (editable && (item.nota || "") !== nota) hacer(() => guardarNota(item, nota.trim())); }}
              style={{ ...chico, width: "100%", boxSizing: "border-box", resize: "vertical", lineHeight: 1.4 }} />
          )}

          {/* AL PIE, lo que se toca poco y a un toque: de qué etapa es, de quién, si se le
              deja de mostrar al cliente, quitarlo. Y cerrar. */}
          {editable && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", borderTop: `1px solid ${colors.border}`, paddingTop: 8 }}>
            <button className="ver-mas" aria-expanded={mas} onClick={() => setMas(v => !v)} style={mini(false)}>
              {mas ? <ChevronDown size={11} /> : <ChevronRight size={11} />} {mas ? "Menos" : "Más: etapa, responsable, quitar"}
            </button>
            {/* DE QUÉ ETAPA ES. La dice el punto: se puede tener hoy algo de
                Presupuesto con el proyecto todavía en Ingenierías. */}
            {mas && onEtapa && etapas.length > 0 && (
              <>
                <span style={{ fontSize: 10.5, color: colors.muted }}>Etapa:</span>
                <select value={item.etapa_id || ""} aria-label="De qué etapa es este punto" disabled={ocupado}
                  onChange={e => onEtapa(e.target.value || null)}
                  style={{ ...chico, width: "auto", padding: "2px 6px", fontSize: 11.5, cursor: "pointer" }}>
                  {/* Una etapa de antes, que ya no es de este tipo: se muestra, no se pierde. */}
                  {item.etapa_id && !etapas.some(e => e.id === item.etapa_id) && <option value={item.etapa_id}>{etapaVieja || "Otra etapa"}</option>}
                  {etapas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                  <option value="">Sin etapa</option>
                </select>
              </>
            )}
            {mas && (
              <button onClick={onTarea} style={mini(false)} title="Quién lo hace, qué dice y qué es: gestión, tarea o reunión">
                <ListTodo size={11} /> {tarea && (tarea.assignee_id || tarea.responsable_externo) ? "Cambiar responsable o título" : "Asignar responsable"}
              </button>
            )}
            {/* Dejar de mostrársela al cliente: deja de ver qué dice y si
                está lista. */}
            {mas && onCliente && laVeElCliente && (
              <button onClick={() => onCliente(false)} disabled={ocupado} aria-pressed style={mini(true)}>
                <EyeOff size={11} /> Dejar de mostrarle al cliente
              </button>
            )}
            {mas && (
              <button onClick={() => { if (window.confirm("¿Borrar esta tarea? Es la misma que está en Tareas: se borra de los dos lados.")) hacer(() => borrarItem(item, currentUser)); }} disabled={ocupado}
                style={{ ...mini(false), color: colors.danger }}><X size={11} /> Quitar</button>
            )}
            <button className="cerrar-punto" onClick={onAbrir} style={{ ...mini(false), marginLeft: "auto" }}><ChevronUp size={11} /> Cerrar</button>
          </div>
          )}
        </div>
      )}
    </div>
  );
}

// Las partes de un punto abierto: su título en chico y lo que explica cada una.
const parte = { display: "grid", gap: 5 };
const titulito = { fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.4 };
const ayudita = { fontSize: 10.5, color: colors.muted, lineHeight: 1.45 };

// Las tres respuestas a «¿qué pasó?»: un botón entero cada una, con su ícono y lo que hace.
const opcion = { display: "flex", gap: 9, alignItems: "center", textAlign: "left", width: "100%", background: "#fff", border: `1px solid ${colors.border}`,
  borderRadius: 9, padding: "8px 10px", cursor: "pointer", fontFamily: colors.font, fontSize: 12.5, color: colors.ink, lineHeight: 1.35 };
const icono = (fondo, color) => ({ flex: "0 0 26px", height: 26, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: fondo, color });
const dice = { fontSize: 11, color: colors.inkSoft, fontWeight: 400 };
// El estado de una actividad, en una pastilla.
const pildora = cual => ({
  display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10.5, fontWeight: 700, borderRadius: 14, padding: "2px 9px", whiteSpace: "nowrap", flexShrink: 0, marginTop: 1,
  background: cual === "espera" ? colors.warningSoft : cual === "vencida" ? colors.dangerSoft : cual === "fecha" ? colors.brandSoft : cual === "hecha" ? colors.successSoft : colors.neutralSoft,
  color: cual === "espera" ? colors.warning : cual === "vencida" ? colors.danger : cual === "fecha" ? colors.brand : cual === "hecha" ? colors.success : colors.inkSoft,
});
// Lo que está plegado, y se abre de un toque.
const pliegue = { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", background: "none", border: "none", padding: 0, cursor: "pointer",
  fontFamily: colors.font, fontSize: 10.5, color: colors.muted };

const mini = activo => ({
  display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 600, cursor: "pointer", fontFamily: colors.font,
  border: `1px solid ${activo ? colors.warning : colors.border}`, background: activo ? colors.warningSoft : "#fff",
  color: activo ? colors.warning : colors.inkSoft, borderRadius: 14, padding: "3px 9px",
});
