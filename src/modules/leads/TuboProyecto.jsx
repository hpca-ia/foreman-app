import { useState, useEffect, useCallback } from "react";
import { Check, Plus, X, ListTodo, RotateCcw, Trash2, Loader2, Hourglass, ChevronLeft, ChevronRight, Mail, CircleDot } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import { inputStyle } from "../../components/ui/Input";
import Avatar from "../../components/ui/Avatar";
import { etapaInfo } from "./constantes";
import { CLASES, claseDe } from "../../theme/constants";
import {
  TUNELES, etapasDelTunel, cargarTubo, asegurarEtapas, sembrarChecklist,
  agregarItem, marcarItem, marcarEspera, guardarNota, borrarItem, itemATarea, asegurarTarea, anotarCorreccion,
  anotar, cambiarEstadoEtapa, moverEtapa,
} from "./tubo";

// El proyecto: sus etapas, y dentro de cada etapa lo que hay que hacer.
//
// Una columna por etapa, y en la columna sus pasos, uno debajo del otro. Así
// se ve todo el proyecto de una: en qué va, qué le falta a cada etapa y dónde
// está trabado. Un paso que necesita que alguien haga algo se vuelve tarea del
// equipo, con responsable y fecha, y al completarse queda marcado.
//
// Arquitectura y Construcción traen sus etapas puestas y van en orden; un lead
// las suma cuando pasan, porque ahí el plan masa puede ir antes que el
// presupuesto.

// Una fecha sin hora la lee el navegador como medianoche en Londres, y en
// Ecuador eso es el día anterior: por eso se lee al mediodía.
const cuando = f => (f ? new Date(String(f).length === 10 ? `${f}T12:00:00` : f).toLocaleDateString("es-EC", { day: "numeric", month: "short" }) : "");

export default function TuboProyecto({ lead, catalogo = [], users = [], currentUser, puede = () => true, editable = true, onBitacora }) {
  const tunel = lead.tunel || "lead";
  const info = TUNELES[tunel] || TUNELES.lead;
  const [etapas, setEtapas] = useState([]);
  const [items, setItems] = useState([]);
  const [sinTablas, setSinTablas] = useState(false);
  const [nuevo, setNuevo] = useState({});        // etapa → texto del paso que se escribe
  const [agregando, setAgregando] = useState(false);
  const [aTarea, setATarea] = useState(null);
  // A quién avisarle de una reunión: al del equipo que la tiene y a los de
  // afuera que vengan. Se elige cada vez, porque no siempre va el cliente.
  const [avisar, setAvisar] = useState(null);   // { item, tarea, a: Set }
  const [ocupado, setOcupado] = useState(false);
  // La actividad abierta: al tocarla cuenta qué se hizo, quién y cuándo, y
  // ofrece lo que se puede hacer con ella, con botones que dicen su nombre.
  const [abierta, setAbierta] = useState(null);
  const [tareas, setTareas] = useState({});
  const [errores, setErrores] = useState({});
  // Cuántas actividades predeterminadas tiene cada etapa en Ajustes: si no
  // tiene ninguna, no se ofrece traerlas y no hay botón que no haga nada.
  const [predeterminadas, setPredeterminadas] = useState({});
  // Lo que se está escribiendo en cada etapa: qué tipo, el texto y los tres
  // datos. Vive por etapa para poder tener una a medio escribir en una columna
  // mientras se mira otra.
  // La gente de afuera que ya está en el proyecto: cliente, ingeniero,
  // proveedor. Una actividad puede ser de ellos aunque no entren a FOREMAN.
  const [invitados, setInvitados] = useState([]);

  const cargar = useCallback(async () => {
    const [r, { data: inv }] = await Promise.all([
      cargarTubo(lead.id),
      supabase.from("pipeline_invitados").select("id,nombre,rol").eq("lead_id", lead.id).order("nombre"),
    ]);
    setSinTablas(r.sinTablas);
    setEtapas(r.etapas);
    setItems(r.items);
    setInvitados(inv || []);

    // En qué va la tarea que salió de una actividad: decirlo acá evita ir a
    // buscarla a la lista de tareas.
    const etapasDelProyecto = [...new Set((r.etapas || []).map(e => e.etapa_id))];
    if (etapasDelProyecto.length) {
      const { data: plantillas } = await supabase.from("pipeline_etapa_items")
        .select("etapa_id").eq("activo", true).in("etapa_id", etapasDelProyecto);
      const cuenta = {};
      (plantillas || []).forEach(p => { cuenta[p.etapa_id] = (cuenta[p.etapa_id] || 0) + 1; });
      setPredeterminadas(cuenta);
    }

    const ids = (r.items || []).map(i => i.tarea_id).filter(Boolean);
    if (ids.length) {
      // Con la 045 puesta viene la hora; sin ella, la misma consulta sin hora.
      let { data: ts, error } = await supabase.from("tasks")
        .select("id,title,status,due_date,hora,priority,type,assignee_id,responsable_externo").in("id", ids);
      if (error) {
        ({ data: ts } = await supabase.from("tasks")
          .select("id,title,status,due_date,assignee_id").in("id", ids));
      }
      setTareas(Object.fromEntries((ts || []).map(t => [t.id, t])));
    } else setTareas({});
    // eslint-disable-next-line
  }, [lead.id, catalogo]);

  useEffect(() => {
    (async () => { await asegurarEtapas(lead, catalogo); cargar(); })();
    // eslint-disable-next-line
  }, [lead.id, catalogo.length]);

  if (sinTablas) {
    return <div style={{ fontSize: 12, color: colors.warning, padding: "10px 0" }}>Falta correr la migración 040 en Supabase.</div>;
  }

  const delTunel = etapasDelTunel(catalogo, tunel);
  // Manda el orden de ESTE proyecto. El de Ajustes es con el que nace —y por
  // eso los hitos aparecen en su orden—, pero después cada proyecto va como va:
  // uno hace las ingenierías antes del anteproyecto y otro vuelve a una etapa
  // anterior. Por eso las flechas mueven las columnas y esto las respeta.
  const todas = [...etapas].sort((a, b) => a.orden - b.orden || a.id - b.id);
  // Un hito repetido es siempre un error: si quedó duplicado de antes, se
  // muestra una sola vez —la que tenga trabajo adentro— para que el proyecto no
  // aparezca con dos "Obra gris" y nadie sepa en cuál escribir.
  const columnas = info.enOrden
    ? todas.filter((e, i) => {
        const iguales = todas.filter(x => x.etapa_id === e.etapa_id);
        if (iguales.length === 1) return true;
        const conTrabajo = iguales.find(x => items.some(it => it.lead_etapa_id === x.id));
        return e.id === (conTrabajo || iguales[0]).id && todas.indexOf(e) === i;
      })
    : todas;
  // Las que están en Ajustes y este proyecto todavía no tiene.
  const faltantes = delTunel.filter(e => !etapas.some(x => x.etapa_id === e.id));
  const itemsDe = id => items.filter(i => i.lead_etapa_id === id).sort((a, b) => a.orden - b.orden);

  async function hacer(fn) {
    setOcupado(true);
    // Todo lo que se hace acá deja rastro en la bitácora, así que se la
    // refresca siempre en vez de acordarse caso por caso de avisarle.
    try { await fn(); await cargar(); onBitacora?.(); } finally { setOcupado(false); }
  }
  const agregarEtapa = etapaId => hacer(async () => {
    await supabase.from("lead_etapas").insert({ lead_id: lead.id, etapa_id: etapaId, orden: (etapas.length + 1) * 10, estado: "pendiente" });
    setAgregando(false);
  });
  // Sumar algo a una etapa, diciendo qué falta en vez de quedarse callado.
  //
  // Los tres tipos guardan lo mismo —una actividad con su fila en tareas—, lo
  // que cambia es qué se exige: una tarea es de alguien, una reunión tiene día
  // y hora, y una actividad se marca y ya. Lo demás es opcional en los tres.
  async function sumar(etapa, cuantas) {
    const n = nuevo[etapa.id] || {};
    const texto = (n.texto || "").trim();
    const tipo = n.tipo || "gestion";
    const falta = !texto ? `Escribe ${tipo === "reunion" ? "de qué es la reunión" : "qué hay que hacer"}.`
      : tipo === "tarea" && !n.assignee_id ? "Una tarea es de alguien: elige quién la hace."
      : tipo === "reunion" && !n.due_date ? "Una reunión tiene día: ponle la fecha."
      : null;
    if (falta) { setErrores(e => ({ ...e, [etapa.id]: falta })); return; }
    setErrores(e => ({ ...e, [etapa.id]: "" }));

    await hacer(async () => {
      const r = await agregarItem(lead, etapa, texto, cuantas + 1, currentUser);
      if (r?.error) { setErrores(e => ({ ...e, [etapa.id]: r.error })); return; }
      // Todo lo que se suma entra también a las tareas del proyecto, tenga
      // dueño o no: sin responsable igual es algo pendiente de ese proyecto.
      const externo = String(n.assignee_id || "").startsWith("x:") ? String(n.assignee_id).slice(2) : null;
      await itemATarea(r.item, {
        lead, titulo: texto, due_date: n.due_date || null, hora: (n.due_date && n.hora) || null,
        tipo: tipo === "reunion" ? "Reunión" : tipo === "gestion" ? "Gestión" : "Otro", urgente: !!n.urgente,
        creadoPor: currentUser?.id, quien: currentUser,
        assignee_id: n.assignee_id && !externo ? Number(n.assignee_id) : null,
        nombreResponsable: users.find(u => String(u.id) === String(n.assignee_id))?.name,
        responsable_externo: externo,
      });
      // Se queda abierto y con el tipo elegido: casi siempre se cargan varias
      // seguidas, y volver a abrir el cuadro cada vez era un clic de más.
      setNuevo(x => ({ ...x, [etapa.id]: { abierto: true, tipo, texto: "", assignee_id: "", due_date: "", hora: "", urgente: false } }));
    });
  }

  // Una fecha ya puesta solo la corre quien tenga el permiso; ponerle fecha a
  // algo que no la tenía es organizar, y eso lo puede hacer cualquiera.
  const fechaBloqueada = !!tareas[aTarea?.item?.tarea_id]?.due_date && !puede("tareas.fechas");

  const quitarEtapa = etapa => {
    const suyos = itemsDe(etapa.id);
    if (!window.confirm(`¿Quitar esta etapa del proyecto?${suyos.length ? ` Se van con ella sus ${suyos.length} ${suyos.length === 1 ? "gestión" : "gestiones"}.` : ""}`)) return;
    hacer(async () => {
      // Y sus tareas: la etapa se borra en cascada con sus gestiones, pero las
      // tareas que salieron de ellas quedaban vivas en el tablero, huérfanas.
      const tareasSuyas = suyos.map(i => i.tarea_id).filter(Boolean);
      if (tareasSuyas.length) await supabase.from("tasks").delete().in("id", tareasSuyas);
      await supabase.from("lead_etapas").delete().eq("id", etapa.id);
    });
  };

  return (
    <div>
      {/* Dos cosas distintas y hay que verlas distintas: arriba las ETAPAS
          —los hitos del proyecto— y dentro de cada una sus ACTIVIDADES. */}
      {/* Sin el párrafo de instrucciones: lo que se puede hacer ya lo dicen
          los botones por su nombre —Gestión, Tarea, Reunión— y explicarlo
          arriba era pedirle al lector que estudie antes de mirar. */}
      <div style={{ fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.5, marginBottom: 8 }}>ETAPAS DEL PROYECTO</div>

      <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 8, alignItems: "flex-start" }}>
        {columnas.map((etapa, i) => {
          const cat = etapaInfo(etapa.etapa_id, catalogo);
          const suyos = itemsDe(etapa.id);
          // Lo que falta arriba —y dentro de eso, lo que espera a un tercero
          // después de lo que hay que ponerse a hacer—; lo hecho, al fondo.
          const porHacer = suyos.filter(i => !i.hecho).sort((a, b) => (a.espera ? 1 : 0) - (b.espera ? 1 : 0));
          const hechas = suyos.filter(i => i.hecho);
          const hecha = etapa.estado === "hecha";
          // La franja de arriba de la columna: lo único que queda del estado
          // aparte del tachado y el contador.
          const tono = hecha ? colors.success : etapa.estado === "en_curso" ? (cat.color || colors.brand) : colors.border;

          return (
            <div key={etapa.id} className="tubo-columna" style={{ width: 236, flexShrink: 0, background: colors.surface, border: `1px solid ${colors.border}`,
              borderTop: `3px solid ${tono}`, borderRadius: colors.radiusMd, display: "flex", flexDirection: "column", opacity: hecha ? 0.75 : 1 }}>

              {/* La cabeza de la etapa: el hito y cómo va. Sin responsable ni
                  fecha: un hito no lo hace nadie ni se entrega un día. Quien
                  hace y para cuándo son de cada gestión de abajo. */}
              <div style={{ padding: "9px 10px", borderBottom: `1px solid ${colors.neutralSoft}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {/* El nombre entero del hito: cortado con puntos suspensivos,
                      "Permisos y ap…" no dice nada. En qué va lo dicen el
                      tachado y el "1/3"; antes lo decían también un ícono y una
                      barra de avance, cuatro señales para un solo dato. */}
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: hecha ? colors.muted : colors.ink,
                    textDecoration: hecha ? "line-through" : "none", lineHeight: 1.25, overflowWrap: "anywhere" }}>{cat.nombre}</span>
                  {suyos.length > 0 && (
                    <span style={{ fontSize: 10.5, color: colors.muted, whiteSpace: "nowrap" }}>
                      {suyos.filter(i => i.hecho).length}/{suyos.length}
                      {suyos.some(i => i.espera && !i.hecho) && <span style={{ color: colors.warning }}> · {suyos.filter(i => i.espera && !i.hecho).length} esperando</span>}
                    </span>
                  )}
                  {!info.enOrden && editable && (
                    <button onClick={() => quitarEtapa(etapa)} title="Quitar esta etapa"
                      style={{ background: "none", border: "none", color: colors.border, cursor: "pointer", display: "flex", padding: 0 }}><Trash2 size={12} /></button>
                  )}
                </div>

                {/* Mover el hito: el orden de Ajustes es el de fábrica, el de
                    este proyecto lo pone quien lo lleva. */}
                {editable && columnas.length > 1 && (
                <div className="tubo-flechas" style={{ display: "flex", gap: 2, marginTop: 4 }}>
                  <button onClick={() => hacer(() => moverEtapa(columnas, etapa, false))} disabled={ocupado || i === 0} title="Mover a la izquierda"
                    style={flecha(i === 0)}><ChevronLeft size={12} /></button>
                  <button onClick={() => hacer(() => moverEtapa(columnas, etapa, true))} disabled={ocupado || i === columnas.length - 1} title="Mover a la derecha"
                    style={flecha(i === columnas.length - 1)}><ChevronRight size={12} /></button>
                </div>
                )}


              </div>

              {/* Las actividades de esta etapa, una debajo de la otra: primero lo
                  que falta, al fondo lo hecho. Una etapa puede tener muchas. */}
              <div style={{ padding: "6px 10px 8px", display: "flex", flexDirection: "column", gap: 2, maxHeight: "60vh", overflowY: "auto" }}>
                <div style={{ fontSize: 9.5, fontWeight: 700, color: colors.muted, letterSpacing: 0.4, marginBottom: 2 }}>GESTIONES</div>
                {porHacer.map(item => (
                  <Actividad key={item.id} item={item} etapa={etapa} nombreEtapa={cat.nombre} tarea={tareas[item.tarea_id]} users={users}
                    abierta={abierta === item.id} onAbrir={() => setAbierta(a => (a === item.id ? null : item.id))}
                    ocupado={ocupado} hacer={hacer} currentUser={currentUser} editable={editable}
                    onAvisar={t => setAvisar({ item, tarea: t, a: new Set(t?.assignee_id ? ["responsable"] : []) })}
                    onTarea={() => { const t = tareas[item.tarea_id]; setATarea({ item, titulo: item.texto, tipo: claseDe(t),
                      assignee_id: t?.responsable_externo ? `x:${t.responsable_externo}` : t?.assignee_id || "", due_date: t?.due_date || "", hora: t?.hora || "" }); }} />
                ))}

                {/* Lo hecho se queda a la vista, abajo y tachado: la columna
                    tiene que mostrar todo lo de esa etapa —lo que falta y lo
                    que ya se hizo—, no solo lo pendiente. Esconderlo obligaba a
                    abrir un desplegable para saber si algo se había hecho. */}
                {hechas.map(item => (
                  <Actividad key={item.id} item={item} etapa={etapa} nombreEtapa={cat.nombre} tarea={tareas[item.tarea_id]} users={users}
                    abierta={abierta === item.id} onAbrir={() => setAbierta(a => (a === item.id ? null : item.id))}
                    ocupado={ocupado} hacer={hacer} currentUser={currentUser} editable={editable} onTarea={() => {}} />
                ))}

                {/* Las que esa etapa trae predeterminadas desde Ajustes, si tiene. */}
                {editable && !suyos.length && predeterminadas[etapa.etapa_id] > 0 && (
                  <button onClick={() => hacer(() => sembrarChecklist(lead, etapa))} disabled={ocupado}
                    title={`Trae las ${predeterminadas[etapa.etapa_id]} gestiones que esta etapa tiene puestas en Ajustes`}
                    style={{ background: "none", border: `1px dashed ${colors.border}`, borderRadius: 6, padding: "5px 8px", textAlign: "left",
                      fontSize: 11, color: colors.inkSoft, cursor: "pointer", fontFamily: colors.font, marginBottom: 2 }}>
                    Traer manualmente ({predeterminadas[etapa.etapa_id]})
                  </button>
                )}
                {!suyos.length && !predeterminadas[etapa.etapa_id] && (
                  <div style={{ fontSize: 11, color: colors.muted, padding: "2px 0" }}>Todavía sin gestiones.</div>
                )}

                {/* Agregar está guardado detrás de un botón: con el formulario
                    siempre abierto, cada columna mostraba cuatro casillas y la
                    pantalla parecía un tablero de controles en vez de la lista
                    de lo que falta. Se elige primero qué es —una gestión que se
                    marca cuando pasa, una tarea de alguien, o una reunión con
                    día y hora— y recién ahí se pide lo que ese tipo necesita.
                    "Gestión" y no "actividad": pedir una cotización o esperar
                    un documento no es lo mismo que el trabajo que alguien
                    tiene que sentarse a hacer. */}
                {editable && !nuevo[etapa.id]?.abierto && (
                  <button onClick={() => setNuevo(n => ({ ...n, [etapa.id]: { abierto: true, tipo: "gestion", texto: "" } }))}
                    style={{ background: "none", border: `1px dashed ${colors.border}`, borderRadius: 6, padding: "5px 8px", marginTop: 6,
                      fontSize: 11, color: colors.inkSoft, cursor: "pointer", fontFamily: colors.font, display: "flex", alignItems: "center", gap: 4 }}>
                    <Plus size={11} /> Agregar
                  </button>
                )}

                {editable && nuevo[etapa.id]?.abierto && (<>
                <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                  {TIPOS_NUEVO.map(([id, label]) => {
                    const activo = (nuevo[etapa.id]?.tipo || "gestion") === id;
                    return (
                      <button key={id} onClick={() => setNuevo(n => ({ ...n, [etapa.id]: { ...n[etapa.id], tipo: id } }))}
                        style={{ ...mini(false), padding: "3px 8px", borderColor: activo ? CLASES[id].color : colors.border,
                          background: activo ? CLASES[id].color : "#fff", color: activo ? "#fff" : colors.inkSoft }}>
                        {label}
                      </button>
                    );
                  })}
                </div>

                <input value={nuevo[etapa.id]?.texto || ""} autoFocus
                  onChange={e => setNuevo(n => ({ ...n, [etapa.id]: { ...n[etapa.id], texto: e.target.value } }))}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); sumar(etapa, suyos.length); } }}
                  placeholder={PISTA[nuevo[etapa.id]?.tipo || "gestion"]}
                  style={{ ...chico, width: "100%", boxSizing: "border-box", marginTop: 5 }} />

                {/* Los tres campos están siempre: una actividad también puede
                    tener dueño o fecha. Lo que cambia es qué se exige para
                    guardar, y eso lo dice la línea de abajo. */}
                <select value={nuevo[etapa.id]?.assignee_id || ""} onChange={e => setNuevo(n => ({ ...n, [etapa.id]: { ...n[etapa.id], assignee_id: e.target.value } }))}
                  style={{ ...chico, width: "100%", boxSizing: "border-box", marginTop: 4 }}>
                  <option value="">¿Quién la hace?{(nuevo[etapa.id]?.tipo || "gestion") === "tarea" ? "" : " (opcional)"}</option>
                  <optgroup label="Del equipo">{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</optgroup>
                  {invitados.length > 0 && <optgroup label="De afuera">{invitados.map(i => <option key={`x${i.id}`} value={`x:${i.nombre}`}>{i.nombre}</option>)}</optgroup>}
                </select>

                <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                  <input type="date" value={nuevo[etapa.id]?.due_date || ""} title="Para cuándo"
                    onChange={e => setNuevo(n => ({ ...n, [etapa.id]: { ...n[etapa.id], due_date: e.target.value } }))}
                    style={{ ...chico, flex: 1, minWidth: 0 }} />
                  {/* La hora de una lista y no del relojito del navegador: en el
                      teléfono ese control es una ruleta, y en el escritorio hay
                      que pelear con am/pm. Acá se elige "Todo el día" o una
                      hora de trabajo, que es lo que se usa. */}
                  <select value={nuevo[etapa.id]?.hora || ""} title="A qué hora"
                    onChange={e => setNuevo(n => ({ ...n, [etapa.id]: { ...n[etapa.id], hora: e.target.value } }))}
                    style={{ ...chico, width: 104 }}>
                    <option value="">Todo el día</option>
                    {HORAS.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>

                {/* Lo urgente se marca cuando se escribe, que es cuando se sabe. */}
                <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: colors.inkSoft, marginTop: 5, cursor: "pointer" }}>
                  <input type="checkbox" checked={!!nuevo[etapa.id]?.urgente}
                    onChange={e => setNuevo(n => ({ ...n, [etapa.id]: { ...n[etapa.id], urgente: e.target.checked } }))} />
                  Urgente
                </label>

                <div style={{ fontSize: 10, color: colors.muted, marginTop: 4 }}>{PIDE[nuevo[etapa.id]?.tipo || "gestion"]}</div>

                <div style={{ display: "flex", gap: 4, marginTop: 5 }}>
                  {/* El botón no se apaga por falta de datos: apagado no explica
                      nada. Se toca, y dice qué falta. */}
                  <button onClick={() => sumar(etapa, suyos.length)} disabled={ocupado}
                    style={{ ...mini(false), padding: "4px 9px", background: colors.ink, color: "#fff", borderColor: colors.ink }}>
                    <Plus size={11} /> Agregar
                  </button>
                  <button onClick={() => { setNuevo(n => ({ ...n, [etapa.id]: { abierto: false } })); setErrores(e => ({ ...e, [etapa.id]: "" })); }}
                    style={{ ...mini(false), padding: "4px 9px" }}>Cancelar</button>
                </div>

                {errores[etapa.id] && <div style={{ fontSize: 10.5, color: colors.danger, marginTop: 4 }}>{errores[etapa.id]}</div>}
                </>)}
              </div>

              {/* El hito arranca y cierra solo, con sus actividades. Acá queda
                  únicamente lo que una máquina no puede decidir: darlo por
                  cerrado aunque falten cosas, o reabrirlo. */}
              {editable && (
              <div style={{ padding: "8px 10px", borderTop: `1px solid ${colors.neutralSoft}` }}>
                {hecha ? (
                  <button onClick={() => hacer(async () => { await cambiarEstadoEtapa(etapa, "en_curso", currentUser, true, cat.nombre); onBitacora?.(); })} disabled={ocupado} style={boton(false)}>
                    <RotateCcw size={12} /> Reabrir
                  </button>
                ) : (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {/* Decir en qué hito va el proyecto sin tener que marcar
                        una gestión: uno que ya venía andando entra al tubo en el
                        punto donde está, no al principio. Lo anterior queda
                        cerrado, porque si está en Contrato ya pasó lo de antes. */}
                    {etapa.estado === "en_curso" ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
                        color: cat.color || colors.brand, border: `1px solid ${cat.color || colors.brand}`, borderRadius: 14, padding: "3px 9px" }}>
                        <CircleDot size={11} /> ETAPA ACTUAL
                      </span>
                    ) : (
                      <button onClick={() => hacer(async () => {
                        for (const previa of columnas.filter(e => e.orden < etapa.orden && e.estado !== "hecha" && e.estado !== "omitida")) {
                          await cambiarEstadoEtapa(previa, "hecha", currentUser, false, etapaInfo(previa.etapa_id, catalogo).nombre);
                        }
                        await cambiarEstadoEtapa(etapa, "en_curso", currentUser, true, cat.nombre);
                        onBitacora?.();
                      })} disabled={ocupado} style={boton(true)}
                        title="Pone el proyecto en este hito y da por cerrados los anteriores">
                        {ocupado ? <Loader2 size={12} /> : <CircleDot size={12} />} Marcar etapa actual
                      </button>
                    )}
                    <button onClick={() => hacer(async () => {
                      const faltan = suyos.filter(i => !i.hecho).length;
                      if (faltan && !window.confirm(`Quedan ${faltan} ${faltan === 1 ? "gestión" : "gestiones"} sin marcar. ¿Cerrar la etapa igual?`)) return;
                      await cambiarEstadoEtapa(etapa, "hecha", currentUser, true, cat.nombre);
                      onBitacora?.();
                    })} disabled={ocupado} style={boton(false)}>
                      {ocupado ? <Loader2 size={12} /> : <Check size={12} />} {suyos.some(i => !i.hecho) ? "Cerrar igual" : "Cerrar"}
                    </button>
                  </div>
                )}
              </div>
              )}
            </div>
          );
        })}

        {/* En un lead las etapas se suman cuando pasan. */}
        {!info.enOrden && editable && (
          <div style={{ width: 180, flexShrink: 0 }}>
            <button onClick={() => setAgregando(a => !a)}
              style={{ width: "100%", background: colors.bg, border: `1px dashed ${colors.border}`, borderRadius: colors.radiusMd,
                padding: "12px 10px", color: colors.inkSoft, fontSize: 12.5, cursor: "pointer", fontFamily: colors.font,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <Plus size={14} /> Etapa
            </button>
            {agregando && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
                {delTunel.map(e => (
                  <button key={e.id} onClick={() => agregarEtapa(e.id)}
                    style={{ border: `1px solid ${colors.border}`, background: "#fff", borderRadius: 8, padding: "5px 10px",
                      fontSize: 12, color: colors.inkSoft, cursor: "pointer", fontFamily: colors.font, textAlign: "left" }}>
                    {e.nombre}
                  </button>
                ))}
                {!delTunel.length && <span style={{ fontSize: 11.5, color: colors.muted }}>Sin etapas en Ajustes.</span>}
              </div>
            )}
          </div>
        )}

        {/* Lo que se agregó en Ajustes después de crear el proyecto no entra
            solo: entra cuando quien lo lleva lo decide, y dice cuántas trae. */}
        {info.enOrden && editable && faltantes.length > 0 && (
          <div style={{ width: 180, flexShrink: 0 }}>
            <button onClick={() => hacer(async () => { await asegurarEtapas(lead, catalogo); })}
              style={{ width: "100%", background: colors.bg, border: `1px dashed ${colors.border}`, borderRadius: colors.radiusMd,
                padding: "12px 10px", color: colors.inkSoft, fontSize: 12, cursor: "pointer", fontFamily: colors.font,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6, lineHeight: 1.3 }}>
              <Plus size={14} /> Traer {faltantes.length} {faltantes.length === 1 ? "etapa nueva" : "etapas nuevas"} de Ajustes
            </button>
          </div>
        )}

        {!columnas.length && info.enOrden && (
          <div style={{ fontSize: 12, color: colors.muted, padding: "16px 0" }}>Este proyecto todavía no tiene etapas.</div>
        )}
      </div>

      {/* Volver un paso en tarea del equipo: quién y para cuándo. */}
      {aTarea && (
        <div style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 12, marginTop: 4 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.ink, marginBottom: 2 }}>¿Quién y para cuándo?</div>
          {/* El mismo cuadro sirve para arreglar lo que se escribió mal: el
              texto, el responsable y la fecha se corrigen acá, y el arreglo
              queda en la bitácora del proyecto. */}
          <div style={{ fontSize: 10.5, color: colors.muted, marginBottom: 8 }}>También se corrige acá lo que esté mal escrito, y qué es. El cambio queda en la bitácora.</div>
          <div style={{ display: "grid", gap: 8 }}>
            {/* Qué es se corrige acá: lo que se cargó mal —o lo que se cargó
                antes de que existiera la distinción— cambia de lista con un
                clic, en vez de haber que borrarlo y volver a escribirlo. */}
            <div style={{ display: "flex", gap: 4 }}>
              {TIPOS_NUEVO.map(([id, label]) => {
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
                await asegurarTarea(aTarea.item, {
                  lead, titulo: aTarea.titulo, due_date: aTarea.due_date || null, hora: (aTarea.due_date && aTarea.hora) || null,
                  tipo: aTarea.tipo === "reunion" ? "Reunión" : aTarea.tipo === "tarea" ? "Otro" : "Gestión",
                  creadoPor: currentUser?.id, quien: currentUser,
                  assignee_id: externo || !aTarea.assignee_id ? null : Number(aTarea.assignee_id),
                  nombreResponsable: users.find(u => String(u.id) === String(aTarea.assignee_id))?.name,
                  responsable_externo: externo,
                });
                // Lo que cambió queda escrito: quién la movió y de qué a qué.
                const nombre = id => users.find(u => u.id === Number(id))?.name || null;
                const cambios = [];
                if (aTarea.titulo.trim() !== aTarea.item.texto) cambios.push(`ahora dice "${aTarea.titulo.trim()}"`);
                const antesQuien = antes?.responsable_externo || nombre(antes?.assignee_id) || "nadie";
                const ahoraQuien = externo || nombre(aTarea.assignee_id) || "nadie";
                if (antesQuien !== ahoraQuien) cambios.push(`pasa de ${antesQuien} a ${ahoraQuien}`);
                if ((antes?.due_date || "") !== (aTarea.due_date || "") || (antes?.hora || "") !== (aTarea.hora || "")) {
                  cambios.push(aTarea.due_date
                    ? `para el ${cuando(aTarea.due_date)}${aTarea.hora ? ` a las ${aTarea.hora}` : ""}`
                    : "se queda sin fecha");
                }
                if (cambios.length) {
                  await anotarCorreccion(lead, `Arregló "${aTarea.item.texto}": ${cambios.join(", ")}.`, currentUser);
                  onBitacora?.();
                }
                setATarea(null);
              })} disabled={ocupado || !aTarea.titulo.trim()} style={boton(true)}>Guardar</button>
              <button onClick={() => setATarea(null)} style={boton(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Avisar de una reunión: al del equipo que la tiene y a los de afuera
          que vengan. Va con el .ics adjunto, así al cliente le queda en su
          propio calendario sin entrar a FOREMAN. */}
      {avisar && (
        <div onClick={() => setAvisar(null)}
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
                  const r = await fetch("/api/aviso-reunion", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      tareaId: avisar.tarea.id,
                      alResponsable: avisar.a.has("responsable"),
                      invitados: [...avisar.a].filter(x => x !== "responsable"),
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

const chico = { ...inputStyle, padding: "4px 7px", fontSize: 11.5 };

// Las tres cosas que puede haber debajo de un hito, y qué pide cada una.
const TIPOS_NUEVO = [["gestion", "Gestión"], ["tarea", "Tarea"], ["reunion", "Reunión"]];

const PISTA = {
  gestion: "¿Qué hay que gestionar?",
  tarea: "¿Qué hay que hacer?",
  reunion: "¿De qué es la reunión?",
};
const PIDE = {
  gestion: "Se marca cuando pasa. Responsable y fecha, si hay.",
  tarea: "Pide responsable. La fecha, si la hay.",
  reunion: "Pide día. A una hora o todo el día.",
};

// De media en media, de siete a siete: las horas en que la oficina trabaja.
// Una lista corta se elige de un toque; el reloj del navegador no.
const HORAS = Array.from({ length: 25 }, (_, i) => {
  const minutos = 7 * 60 + i * 30;
  return `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${minutos % 60 === 0 ? "00" : "30"}`;
});

// Las flechas que mueven el hito: discretas, y apagadas en las puntas.
const flecha = apagada => ({
  border: `1px solid ${colors.border}`, background: "#fff", borderRadius: 6, padding: "1px 5px",
  color: apagada ? colors.border : colors.inkSoft, cursor: apagada ? "default" : "pointer",
  display: "flex", alignItems: "center", opacity: apagada ? 0.45 : 1,
});
const boton = fuerte => ({
  display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", fontFamily: colors.font, fontSize: 12, fontWeight: 600,
  border: `1px solid ${fuerte ? colors.ink : colors.border}`, background: fuerte ? colors.ink : "#fff",
  color: fuerte ? "#fff" : colors.inkSoft, borderRadius: 8, padding: "5px 11px",
});

// Una actividad: se toca y cuenta lo suyo.
//
// Cerrada es una línea con su casilla. Abierta dice qué se hizo, quién la
// marcó y cuándo, si está esperando a alguien, en qué va la tarea que salió de
// ella, y deja escribir lo que solo sabe quien la trabajó. Los botones dicen
// su nombre: un ⧗ y un ✓ sueltos no le enseñan a nadie cómo se usa esto.
function Actividad({ item, etapa, nombreEtapa, tarea, users = [], abierta, onAbrir, ocupado, hacer, currentUser, editable = true, onTarea, onAvisar }) {
  const [nota, setNota] = useState(item.nota || "");
  useEffect(() => { setNota(item.nota || ""); }, [item.nota]);
  // De quién es la tarea que salió de esta actividad.
  const deQuien = t => t?.responsable_externo || users.find(u => u.id === t?.assignee_id)?.name || "sin responsable";
  // Toda actividad tiene su fila en tareas para que el proyecto muestre sus
  // pendientes. Solo las que alguien tomó se anuncian como "tarea de fulano":
  // las demás son actividades, y decir "tarea de sin responsable" sería ruido.
  const tomada = t => !!(t?.assignee_id || t?.responsable_externo);
  // Una reunión es la que tiene hora o quedó marcada como tal.
  const esReunion = t => !!(t?.hora || t?.type === "Reunión");

  return (
    <div style={{ borderRadius: 6, background: abierta ? colors.bg : "transparent", padding: abierta ? "4px 6px" : 0, margin: abierta ? "2px -6px" : 0 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 7, padding: "5px 0" }}>
        <button onClick={() => editable && hacer(() => marcarItem(item, !item.hecho, currentUser?.name, currentUser, nombreEtapa))} disabled={ocupado || !editable}
          title={!editable ? "Solo mirar" : item.hecho ? "Desmarcar" : "Marcar como hecha"}
          style={{ width: 16, height: 16, flexShrink: 0, marginTop: 1, borderRadius: 4, cursor: "pointer", padding: 0,
            border: `1.5px solid ${item.hecho ? colors.success : colors.border}`, background: item.hecho ? colors.success : "#fff",
            display: "flex", alignItems: "center", justifyContent: "center" }}>
          {item.hecho && <Check size={11} color="#fff" />}
        </button>
        {/* Su color, el mismo del tablero: se ve de un vistazo si la columna
            está llena de gestiones o de reuniones. */}
        <span style={{ width: 3, alignSelf: "stretch", borderRadius: 2, background: CLASES[claseDe(tarea)].color, opacity: item.hecho ? 0.4 : 1, flexShrink: 0 }} />
        <div onClick={onAbrir} style={{ flex: 1, minWidth: 0, cursor: "pointer" }}>
          <div style={{ fontSize: 12, lineHeight: 1.35, color: item.hecho ? colors.muted : colors.ink, textDecoration: item.hecho ? "line-through" : "none", overflowWrap: "anywhere" }}>
            {/* Lo urgente se ve sin abrir nada. */}
            {!item.hecho && tarea?.priority === "urgente" && (
              <span style={{ color: colors.danger, fontWeight: 700, fontSize: 9.5, marginRight: 4, letterSpacing: 0.3 }}>URGENTE</span>
            )}
            {item.texto}
          </div>
          {!abierta && (
            <div style={{ fontSize: 9.5, color: item.espera && !item.hecho ? colors.warning : colors.muted }}>
              {item.hecho ? [item.hecho_por, cuando(item.hecho_at)].filter(Boolean).join(" · ")
                : item.espera ? "esperando respuesta"
                : tomada(tarea) ? `tarea de ${deQuien(tarea)}${tarea.due_date ? ` · ${cuando(tarea.due_date)}${tarea.hora ? ` ${tarea.hora}` : ""}` : ""}`
                : tarea?.due_date ? `para ${cuando(tarea.due_date)}${tarea.hora ? ` ${tarea.hora}` : ""}`
                : ""}
            </div>
          )}
        </div>
      </div>

      {abierta && (
        <div style={{ paddingLeft: 23, paddingBottom: 6, display: "grid", gap: 6 }}>
          {/* Qué pasó con esta actividad, en una línea. */}
          <div style={{ fontSize: 10.5, color: colors.muted, lineHeight: 1.5 }}>
            {item.hecho
              ? `Hecha${item.hecho_por ? ` por ${item.hecho_por}` : ""}${item.hecho_at ? ` el ${cuando(item.hecho_at)}` : ""}.`
              : item.espera ? "Ya se hizo lo nuestro: espera a un tercero."
              : "Todavía por hacer."}
            {tomada(tarea) ? (
              <> Salió una tarea: <strong style={{ color: colors.ink }}>{tarea.title}</strong>
                {` · ${deQuien(tarea)}${tarea.responsable_externo ? " (de afuera)" : ""}`}
                {tarea.due_date ? ` · ${cuando(tarea.due_date)}${tarea.hora ? ` a las ${tarea.hora}` : ""}` : ""}
                {tarea.status === "listo" ? " · completada" : tarea.status === "bloqueado" ? " · pausada" : " · en proceso"}.
              </>
            ) : tarea ? (
              <> Es una gestión del proyecto, todavía sin responsable.</>
            ) : null}
          </div>

          {/* Lo que solo sabe quien la trabajó. */}
          <textarea value={nota} onChange={e => setNota(e.target.value)} rows={2} readOnly={!editable}
            onBlur={() => { if (editable && (item.nota || "") !== nota) hacer(() => guardarNota(item, nota.trim())); }}
            placeholder={editable ? "Qué pasó, con quién, qué falta…" : "Sin notas."}
            style={{ ...chico, width: "100%", boxSizing: "border-box", resize: "vertical", lineHeight: 1.4 }} />

          {editable && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {!item.hecho && (
              <button onClick={() => hacer(() => marcarEspera(item, !item.espera, currentUser))} disabled={ocupado} style={mini(item.espera)}>
                <Hourglass size={11} /> {item.espera ? "Ya no espera" : "Queda esperando"}
              </button>
            )}
            {!item.hecho && (
              <button onClick={onTarea} style={mini(false)}>
                <ListTodo size={11} /> {tarea && (tarea.assignee_id || tarea.responsable_externo) ? "Cambiar responsable" : "Asignar a alguien"}
              </button>
            )}
            {/* Una reunión hay que avisarla: el del equipo la ve en FOREMAN,
                pero el cliente y el ingeniero no entran acá. */}
            {!item.hecho && esReunion(tarea) && (
              <button onClick={() => onAvisar(tarea)} style={mini(false)}><Mail size={11} /> Avisar</button>
            )}
            <button onClick={() => hacer(() => marcarItem(item, !item.hecho, currentUser?.name, currentUser, nombreEtapa))} disabled={ocupado} style={mini(false)}>
              <Check size={11} /> {item.hecho ? "Desmarcar" : "Marcar hecha"}
            </button>
            <button onClick={() => { if (window.confirm("¿Quitar esta gestión?")) hacer(() => borrarItem(item, currentUser)); }} disabled={ocupado}
              style={{ ...mini(false), color: colors.danger, marginLeft: "auto" }}><X size={11} /> Quitar</button>
          </div>
          )}
        </div>
      )}
    </div>
  );
}

const mini = activo => ({
  display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 600, cursor: "pointer", fontFamily: colors.font,
  border: `1px solid ${activo ? colors.warning : colors.border}`, background: activo ? colors.warningSoft : "#fff",
  color: activo ? colors.warning : colors.inkSoft, borderRadius: 14, padding: "3px 9px",
});
