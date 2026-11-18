import { useState, useEffect, useRef } from "react";
import { ThumbsUp, Mail, MessageCircle, Check, AlertTriangle, Paperclip, X, Send, FileText } from "lucide-react";
import { colors } from "../../theme/colors";
import { inputStyle } from "../../components/ui/Input";
import { pedirAprobacion, avisarDelPedido, enlaceDelClienteDe, enviarParaAprobar } from "./proyecto";
import { involucradosDe, agregarALaFicha } from "./involucrados";
import { personaDeLaFicha } from "../controlObra/directorioDelProyecto.js";
import { aQuienAvisar, mensajeDelPedido, enlaceDeWhatsApp, paraWhatsApp } from "./aprobaciones.js";
import { cuantosDice, porQueNoEntra, pesoLegible } from "./archivosDelCliente.js";

// PEDIRLE AL CLIENTE QUE APRUEBE UN PUNTO, Y AVISARLE.
//
// Hernán, 17/11/2026: «cada vez que se solicite una aprobación FOREMAN manda
// un mensaje al cliente, por WhatsApp y correo». El botón pedía la aprobación
// y nada más: quedaba esperando en un enlace que el cliente no sabía que tenía
// que abrir.
//
// Ahora pedir es una ventana corta: dice qué va a ver —sus archivos—, a quién
// se le avisa, y pide y avisa de una vez. EL CORREO SALE SOLO. POR WHATSAPP el
// número de FOREMAN todavía no está configurado, así que se arma el mensaje
// con su enlace y se abre el WhatsApp de quien lo pide, para que toque enviar.
//
// RES BG no tenía cargado ni el correo ni el teléfono del cliente —la pestaña
// «Gente» estaba vacía, y de los 21 clientes de la base ninguno tiene correo—.
// Por eso, si no hay a quién avisarle, se lo carga acá mismo y queda en «Gente».
//
// También sirve para avisarle de nuevo de un pedido que sigue esperando.
//
// Y PARA ENVIAR ALGO NUEVO, DE UNA VEZ (modo «enviar»). Hernán, 18/11/2026,
// con todo publicado: «¿desde dónde envío presupuestos, planos, documentos
// para aprobar?». Había que agregar el punto, mostrárselo, subirle el archivo
// y pedirle la aprobación, en dos lugares. Desde la pestaña «Aprobaciones» la
// misma ventana pregunta qué tiene que aprobar y qué archivos lleva, y hace
// los cuatro pasos seguidos; el punto queda en el checklist.

const chico = { ...inputStyle, padding: "5px 8px", fontSize: 12 };
const linea = { display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: colors.ink, cursor: "pointer" };
const boton = fuerte => ({
  display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", fontFamily: colors.font, fontSize: 12, fontWeight: 600,
  border: `1px solid ${fuerte ? colors.ink : colors.border}`, background: fuerte ? colors.ink : "#fff",
  color: fuerte ? "#fff" : colors.inkSoft, borderRadius: 8, padding: "6px 12px",
});
const VACIA = { nombre: "", email: "", telefono: "" };

/**
 * @param item         el punto, como lo ve la lista. En modo «enviar» todavía
 *                     no existe: lo crea la ventana
 * @param modo         "pedir": pedirle la aprobación y avisarle · "avisar":
 *                     ya se le pidió y sigue esperando; solo avisarle ·
 *                     "enviar": algo nuevo —se escribe qué es y se eligen sus
 *                     archivos—, que queda como punto del checklist
 * @param archivos     lo que el cliente tiene para mirar en ese punto
 * @param descripcion  lo escrito para él sobre el punto: queda en el pedido
 * @param etapas       las etapas del tipo del proyecto, para elegir en cuál
 *                     queda lo que se envía; `etapaId` es la del proyecto
 * @param onCambio     se llama cuando algo cambió, para volver a leer
 */
export default function PedirAprobacion({ lead, item = null, modo = "pedir", archivos = [], descripcion = "", etapas = [], etapaId = null, users = [], currentUser, onCambio, onCerrar }) {
  // LO QUE SE ENVÍA, en modo «enviar»: qué es, unas palabras, sus archivos y
  // en qué etapa del checklist queda. `creado` es el punto, una vez que nació.
  const [que, setQue] = useState("");
  const [paraEl, setParaEl] = useState("");
  const [etapa, setEtapa] = useState(etapaId || "");
  const [adjuntos, setAdjuntos] = useState([]);
  const [noEntran, setNoEntran] = useState([]);
  const [encima, setEncima] = useState(false);
  const [creado, setCreado] = useState(null);
  const elegir = useRef(null);
  const punto = creado || item;
  const sumarArchivos = lista => {
    const nuevos = [...(lista || [])];
    setNoEntran(nuevos.map(porQueNoEntra).filter(Boolean));
    setAdjuntos(v => [...v, ...nuevos.filter(f => !porQueNoEntra(f) && !v.some(x => x.name === f.name && x.size === f.size))]);
    setDijo("");
  };
  const [gente, setGente] = useState(null);
  // undefined mientras se lee; null si el enlace del cliente está apagado.
  const [enlace, setEnlace] = useState(undefined);
  const [elegidos, setElegidos] = useState(() => new Set());
  const [otro, setOtro] = useState("");
  const [mensaje, setMensaje] = useState("");
  // Cargar al cliente acá mismo, si no hay a quién avisarle.
  const [nueva, setNueva] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [dijo, setDijo] = useState("");
  // Lo que pasó: { pedido, enviadoA, noSalio }
  const [hecho, setHecho] = useState(modo === "avisar" ? { pedido: false } : null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const [{ personas }, url] = await Promise.all([involucradosDe(lead.id).catch(() => ({ personas: [] })), enlaceDelClienteDe(lead.id)]);
      if (!vivo) return;
      const lista = aQuienAvisar(personas, users);
      setGente(lista);
      setEnlace(url);
      // El cliente, ya tildado: es a quien se le pide.
      setElegidos(new Set(lista.filter(p => p.esCliente && p.email).map(p => p.clave)));
      // Sin nadie a quien avisarle, se abre dónde cargarlo, con el contacto del proyecto.
      if (!lista.length) setNueva({ ...VACIA, nombre: String(lead.contacto || "").trim() });
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line
  }, [lead.id]);

  const tildar = clave => setElegidos(v => { const a = new Set(v); a.has(clave) ? a.delete(clave) : a.add(clave); return a; });
  const otros = String(otro || "").split(/[,;\s]+/).map(c => c.trim().toLowerCase()).filter(Boolean);
  // El nombre viene escrito del contacto del proyecto: lo que cuenta como
  // «cargó a alguien» es que le haya puesto un correo o un WhatsApp. Si no,
  // «Pedir sin avisar» tiene que poder pedir igual.
  const conDatos = nueva && (nueva.email.trim() || nueva.telefono.trim());

  // Si se escribió a alguien nuevo, entra a «Gente» y a la lista. @returns la persona, null, o { error }
  async function cargarLaNueva() {
    if (!conDatos) return null;
    if (!nueva.email.trim() && !paraWhatsApp(nueva.telefono)) return { error: "Para avisarle hace falta su correo o su WhatsApp (un celular, con sus diez dígitos)." };
    const r = personaDeLaFicha({ ...nueva, rol: "cliente" }, lead.id);
    if (r.error) return { error: r.error };
    const e = await agregarALaFicha(r.fila);
    if (e) return { error: `No se pudo guardar a ${r.fila.nombre}: ${e}` };
    const p = { clave: r.fila.email || `nueva-${r.fila.nombre}`, nombre: r.fila.nombre, rol: "cliente", email: r.fila.email || "", whatsapp: paraWhatsApp(r.fila.telefono), esCliente: true };
    setGente(g => [p, ...(g || [])]);
    setElegidos(v => new Set([...v, p.clave]));
    setNueva(null);
    return p;
  }

  async function hacer(conAviso) {
    setDijo("");
    if (modo === "enviar" && !hecho && !que.trim()) { setDijo("Escribí qué tiene que aprobar: «Plano de cocina», «Presupuesto rev. 2»…"); return; }
    setOcupado(true);
    try {
      const sumada = await cargarLaNueva();
      if (sumada?.error) { setDijo(sumada.error); return; }
      const todos = sumada ? [sumada, ...(gente || [])] : gente || [];
      const claves = sumada ? new Set([...elegidos, sumada.clave]) : elegidos;
      const correos = [...new Set([...todos.filter(p => claves.has(p.clave) && p.email).map(p => p.email), ...otros])];
      if (conAviso && !correos.length) { setDijo(`Elegí a quién avisarle por correo, o escribí su correo. Si no tenés su correo, tocá «${modo === "enviar" ? "Enviar" : "Pedir"} sin avisar» y escribile por WhatsApp.`); return; }

      let pedido = false, el = punto, noSubieron = [];
      if (modo === "pedir" && !hecho) {
        const e = await pedirAprobacion(item, true, currentUser, { descripcion });
        if (e) { setDijo(e); return; }
        pedido = true;
      }
      // Lo nuevo: nace el punto, se le muestra, se le suben los archivos y se le pide.
      if (modo === "enviar" && !hecho) {
        const r = await enviarParaAprobar({ lead, titulo: que, descripcion: paraEl, etapaId: etapa || null, archivos: adjuntos, quien: currentUser });
        if (r.error && !r.item) { setDijo(r.error); return; }
        setCreado(r.item);
        // Quedó el punto, pero sin pedirle nada: no subió el archivo, o falló el pedido.
        if (r.error || r.sinPedir) {
          setHecho({ pedido: false, sinPedir: true, motivo: r.error || "", errores: r.errores || [] });
          await onCambio?.();
          return;
        }
        el = r.item; pedido = true; noSubieron = r.errores || [];
      }
      let enviadoA = [], noSalio = "";
      if (conAviso) {
        const r = await avisarDelPedido({ item: el, correos, mensaje, quien: currentUser });
        if (r.error) noSalio = r.error; else enviadoA = r.enviadoA;
      }
      setHecho({ pedido, enviadoA, noSalio, errores: noSubieron });
      await onCambio?.();
    } finally { setOcupado(false); }
  }

  const cargando = gente === null || enlace === undefined;
  const sinEnlace = !cargando && !enlace;
  const conWhatsApp = (gente || []).filter(p => p.whatsapp);
  const yaEsta = !!hecho && (modo !== "avisar" || hecho.enviadoA || hecho.noSalio);
  const nombreDeEtapa = id => etapas.find(e => e.id === id)?.nombre || "";

  return (
    <div className="pedir-la-aprobacion"
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 16 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: colors.radiusMd, padding: 16, width: 430, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 12px 40px rgba(15,23,42,0.2)" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: colors.ink, lineHeight: 1.35, overflowWrap: "anywhere" }}>
          {modo === "enviar" ? "Enviarle algo al cliente para que lo apruebe"
            : <>{modo === "avisar" ? "Avisarle al cliente que tiene para aprobar" : "Pedirle al cliente que apruebe"} «{item.texto}»</>}
        </div>

        {/* Qué va a mirar. Pedir una aprobación sin nada que revisar es raro: se dice. */}
        {modo !== "enviar" && (
          <div className="que-va-a-aprobar" style={{ fontSize: 11.5, lineHeight: 1.5, marginTop: 4, color: archivos.length ? colors.inkSoft : colors.warning }}>
            {archivos.length
              ? <>En su enlace va a ver este punto con <strong style={{ color: colors.ink }}>{cuantosDice(archivos)}</strong>, y debajo «Lo apruebo» y «Tengo una observación».</>
              : <><AlertTriangle size={11} style={{ verticalAlign: "-1px", marginRight: 3 }} />Este punto todavía no tiene fotos ni archivos para el cliente: va a aprobar solo el título. Si tiene que revisar un plano o un presupuesto, cerrá esto y subilo antes.</>}
          </div>
        )}

        {/* LO QUE SE ENVÍA: qué es, sus archivos y dónde queda. */}
        {modo === "enviar" && !yaEsta && (
          <div className="lo-que-se-envia" style={{ display: "grid", gap: 6, marginTop: 8 }}>
            <div style={{ fontSize: 11.5, color: colors.inkSoft, lineHeight: 1.5 }}>
              Un plano, un presupuesto, un documento. Queda como un punto del checklist del proyecto y el cliente lo ve en su enlace, con «Lo apruebo» y «Tengo una observación».
            </div>
            <input value={que} autoFocus aria-label="Qué tiene que aprobar" placeholder="¿Qué tiene que aprobar? Ej: Plano de cocina, Presupuesto rev. 2"
              onChange={e => { setDijo(""); setQue(e.target.value); }} style={{ ...chico, width: "100%", boxSizing: "border-box", fontSize: 13 }} />
            <input value={paraEl} aria-label="Unas palabras sobre lo que se envía" placeholder="Unas palabras para él sobre qué es (opcional)"
              onChange={e => setParaEl(e.target.value)} style={{ ...chico, width: "100%", boxSizing: "border-box" }} />
            <div className="archivos-a-enviar"
              onDragOver={e => { e.preventDefault(); setEncima(true); }} onDragLeave={() => setEncima(false)}
              onDrop={e => { e.preventDefault(); setEncima(false); sumarArchivos(e.dataTransfer?.files); }}
              style={{ border: `1px dashed ${encima ? colors.brand : colors.border}`, background: encima ? colors.brandSoft : colors.bg, borderRadius: colors.radiusSm, padding: "8px 10px", display: "grid", gap: 6 }}>
              {adjuntos.length > 0 && (
                <div style={{ display: "grid", gap: 4 }}>
                  {adjuntos.map((f, i) => (
                    <div key={`${f.name}-${i}`} className="archivo-elegido" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: colors.ink, minWidth: 0 }}>
                      <FileText size={12} color={colors.muted} style={{ flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                      <span style={{ color: colors.muted, fontSize: 11, flexShrink: 0 }}>{pesoLegible(f.size)}</span>
                      <button className="quitar-elegido" aria-label={`Quitar ${f.name}`} onClick={() => setAdjuntos(v => v.filter((_, k) => k !== i))}
                        style={{ background: "none", border: "none", padding: 2, cursor: "pointer", color: colors.muted, display: "flex", flexShrink: 0 }}><X size={12} /></button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <button className="elegir-archivos" onClick={() => elegir.current?.click()}
                  style={{ ...boton(false), borderColor: colors.brand, color: colors.brand, borderStyle: "dashed" }}>
                  <Paperclip size={12} /> {adjuntos.length ? "Elegir más archivos" : "Elegir los archivos"}
                </button>
                <input ref={elegir} type="file" multiple style={{ display: "none" }} aria-label="Archivos para aprobar"
                  onChange={e => { const f = [...(e.target.files || [])]; e.target.value = ""; sumarArchivos(f); }} />
                <span style={{ fontSize: 10.5, color: adjuntos.length ? colors.muted : colors.warning, lineHeight: 1.4, flex: "1 1 160px", minWidth: 0 }}>
                  {adjuntos.length ? `Va a revisar ${adjuntos.length === 1 ? "1 archivo" : `${adjuntos.length} archivos`}. Podés arrastrar más acá.`
                    : "Sin archivos va a aprobar solo el título. Elegilos o arrastralos acá."}
                </span>
              </div>
              {noEntran.length > 0 && (
                <div role="alert" style={{ fontSize: 10.5, color: colors.danger, lineHeight: 1.45 }}>{noEntran.map((e, i) => <div key={i}>{e}</div>)}</div>
              )}
            </div>
            {etapas.length > 0 && (
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: colors.muted, flexWrap: "wrap" }}>
                En el checklist queda en la etapa
                <select value={etapa} aria-label="En qué etapa queda" onChange={e => setEtapa(e.target.value)}
                  style={{ ...chico, width: "auto", padding: "2px 6px", fontSize: 11.5, cursor: "pointer" }}>
                  {etapas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                  <option value="">Sin etapa</option>
                </select>
                a tu cargo.
              </label>
            )}
          </div>
        )}

        {cargando && <div style={{ fontSize: 12, color: colors.muted, marginTop: 12 }}>Leyendo la gente del proyecto…</div>}

        {sinEnlace && (
          <div className="sin-enlace" role="alert" style={{ fontSize: 12, color: colors.danger, lineHeight: 1.5, marginTop: 10 }}>
            El enlace del cliente está apagado: sin él no tiene dónde aprobar. Prendelo en «El proyecto», al pie del checklist, en «Lo que ve el cliente», y volvé a pedirlo.
          </div>
        )}

        {!cargando && !sinEnlace && !yaEsta && (
          <>
            <div style={{ fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.4, margin: "12px 0 5px" }}>
              <Mail size={11} style={{ verticalAlign: "-1px", marginRight: 4 }} />AVISARLE POR CORREO
            </div>
            <div style={{ display: "grid", gap: 4 }}>
              {gente.map(p => (
                <label key={p.clave} className="a-quien-avisar" style={{ ...linea, opacity: p.email ? 1 : 0.55 }} title={p.email || "No tiene correo cargado: se le avisa por WhatsApp"}>
                  <input type="checkbox" disabled={!p.email} checked={elegidos.has(p.clave) && !!p.email} onChange={() => tildar(p.clave)} />
                  <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                    {p.nombre} <span style={{ color: colors.muted }}>· {[p.rol, p.email || "sin correo", p.whatsapp ? "con WhatsApp" : ""].filter(Boolean).join(" · ")}</span>
                  </span>
                </label>
              ))}
              {!gente.length && !nueva && <div style={{ fontSize: 11.5, color: colors.muted }}>Este proyecto no tiene cargado al cliente.</div>}
            </div>

            {/* CARGAR AL CLIENTE ACÁ MISMO. Queda en la pestaña «Gente». */}
            {nueva ? (
              <div className="cargar-al-cliente" style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: colors.radiusSm, padding: "8px 10px", marginTop: 6, display: "grid", gap: 5 }}>
                <div style={{ fontSize: 11.5, color: colors.inkSoft, lineHeight: 1.45 }}>
                  {gente.length ? "Otra persona a la que avisarle." : "Este proyecto todavía no tiene cargado al cliente: escribilo acá y queda guardado en la pestaña «Gente»."}
                </div>
                <input value={nueva.nombre} aria-label="Nombre del cliente" placeholder="Nombre" onChange={e => { setDijo(""); setNueva(n => ({ ...n, nombre: e.target.value })); }} style={chico} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
                  <input value={nueva.email} aria-label="Correo del cliente" placeholder="Correo" onChange={e => { setDijo(""); setNueva(n => ({ ...n, email: e.target.value })); }} style={{ ...chico, minWidth: 0 }} />
                  <input value={nueva.telefono} aria-label="WhatsApp del cliente" placeholder="WhatsApp (celular)" onChange={e => { setDijo(""); setNueva(n => ({ ...n, telefono: e.target.value })); }} style={{ ...chico, minWidth: 0 }} />
                </div>
              </div>
            ) : (
              <button className="sumar-a-alguien" onClick={() => setNueva(VACIA)}
                style={{ background: "none", border: "none", padding: 0, marginTop: 6, cursor: "pointer", fontFamily: colors.font, fontSize: 11.5, fontWeight: 600, color: colors.brand }}>
                + Avisarle a alguien que no está en la lista
              </button>
            )}

            <input value={otro} aria-label="Otro correo" placeholder="Otro correo (o varios, separados por coma)"
              onChange={e => { setDijo(""); setOtro(e.target.value); }} style={{ ...chico, width: "100%", boxSizing: "border-box", marginTop: 7 }} />
            <textarea value={mensaje} rows={2} aria-label="Unas líneas para él" placeholder="Unas líneas para él, arriba del correo (opcional)"
              onChange={e => setMensaje(e.target.value)}
              style={{ ...chico, width: "100%", boxSizing: "border-box", marginTop: 5, resize: "vertical", lineHeight: 1.4 }} />
            <div style={{ fontSize: 10.5, color: colors.muted, lineHeight: 1.45, marginTop: 5 }}>
              El correo le dice qué tiene que revisar y lleva el botón «Ver y aprobar» a su enlace. Queda anotado a quién se le avisó.
              Por WhatsApp no sale solo todavía: después de {modo === "enviar" ? "enviar" : "pedir"} te dejo el mensaje listo para mandarlo desde tu WhatsApp.
            </div>
          </>
        )}

        {/* LO QUE PASÓ, y el WhatsApp con el mensaje ya escrito. */}
        {!cargando && !sinEnlace && hecho && (
          <div className="pedido-hecho" style={{ marginTop: 12, display: "grid", gap: 6 }}>
            {hecho.pedido && modo !== "enviar" && (
              <div role="status" style={{ fontSize: 12.5, color: colors.success, fontWeight: 600 }}>
                <Check size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />Pedido. En su enlace ya tiene «Lo apruebo» y «Tengo una observación».
              </div>
            )}
            {hecho.pedido && modo === "enviar" && (
              <div className="enviado" role="status" style={{ fontSize: 12.5, color: colors.success, fontWeight: 600, lineHeight: 1.45, overflowWrap: "anywhere" }}>
                <Check size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />Enviado «{punto?.texto}»
                {adjuntos.length - (hecho.errores?.length || 0) > 0 ? `, con ${adjuntos.length - (hecho.errores?.length || 0) === 1 ? "1 archivo" : `${adjuntos.length - (hecho.errores?.length || 0)} archivos`}` : ""}.
                <div style={{ color: colors.inkSoft, fontWeight: 400 }}>
                  El cliente ya lo tiene en su enlace para aprobar. Quedó en el checklist{nombreDeEtapa(punto?.etapa_id) ? `, en ${nombreDeEtapa(punto.etapa_id)}` : ""}, y lo que conteste aparece acá.
                </div>
              </div>
            )}
            {/* Quedó el punto, pero no se le pidió nada: se dice qué falló y por dónde se sigue. */}
            {hecho.sinPedir && (
              <div className="sin-pedir" role="alert" style={{ fontSize: 12, color: colors.danger, lineHeight: 1.5, overflowWrap: "anywhere" }}>
                «{punto?.texto}» quedó en el checklist, pero <strong>no se le pidió la aprobación</strong>:{" "}
                {hecho.motivo || "no se pudo subir lo que tenía que revisar."}
                {(hecho.errores || []).map((e, i) => <div key={i}>{e}</div>)}
                <div style={{ color: colors.inkSoft }}>Abrí ese punto en «El proyecto», subí el archivo y tocá «Pedirle que lo apruebe».</div>
              </div>
            )}
            {hecho.pedido && (hecho.errores || []).length > 0 && (
              <div className="no-subieron" role="alert" style={{ fontSize: 11.5, color: colors.danger, lineHeight: 1.45, overflowWrap: "anywhere" }}>
                {hecho.errores.map((e, i) => <div key={i}>{e}</div>)}
              </div>
            )}
            {hecho.enviadoA?.length > 0 && (
              <div className="correo-enviado" role="status" style={{ fontSize: 12, color: colors.ink, lineHeight: 1.45, overflowWrap: "anywhere" }}>
                <Mail size={12} color={colors.success} style={{ verticalAlign: "-2px", marginRight: 4 }} />Correo enviado a {hecho.enviadoA.join(", ")}.
              </div>
            )}
            {hecho.noSalio && (
              <div className="correo-no-salio" role="alert" style={{ fontSize: 12, color: colors.danger, lineHeight: 1.45 }}>
                {hecho.pedido ? "El pedido quedó hecho, pero el correo no salió: " : "El correo no salió: "}{hecho.noSalio}
              </div>
            )}
            {!hecho.sinPedir && (
            <div style={{ fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.4, marginTop: 4 }}>
              <MessageCircle size={11} style={{ verticalAlign: "-1px", marginRight: 4 }} />AVISARLE POR WHATSAPP
            </div>
            )}
            {hecho.sinPedir || !punto ? null : conWhatsApp.length > 0 ? (
              <>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {conWhatsApp.map(p => (
                    <a key={p.clave} className="por-whatsapp" target="_blank" rel="noreferrer"
                      href={enlaceDeWhatsApp(p.whatsapp, mensajeDelPedido({ nombre: p.nombre, proyecto: lead.nombre, punto: punto.texto, enlace }))}
                      style={{ ...boton(false), textDecoration: "none", borderColor: colors.success, color: colors.success }}>
                      <MessageCircle size={12} /> WhatsApp a {p.nombre}
                    </a>
                  ))}
                </div>
                <div style={{ fontSize: 10.5, color: colors.muted, lineHeight: 1.45 }}>
                  Se abre tu WhatsApp con el mensaje y su enlace ya escritos: revisalo y tocá enviar. Sale de tu número, no de FOREMAN.
                </div>
              </>
            ) : (
              <div className="sin-whatsapp" style={{ fontSize: 11.5, color: colors.muted, lineHeight: 1.45 }}>
                Nadie de este proyecto tiene WhatsApp cargado. Se carga en la pestaña «Gente», y la próxima vez aparece acá el botón.
              </div>
            )}
          </div>
        )}

        {dijo && <div role="alert" style={{ fontSize: 11.5, color: colors.danger, lineHeight: 1.45, marginTop: 8 }}>{dijo}</div>}

        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          {!cargando && !sinEnlace && !yaEsta && (
            <>
              <button className="pedir-y-avisar" disabled={ocupado} onClick={() => hacer(true)} style={boton(true)}>
                {modo === "avisar" ? <Mail size={12} /> : modo === "enviar" ? <Send size={12} /> : <ThumbsUp size={12} />}{" "}
                {ocupado ? (modo === "enviar" && adjuntos.length ? "Subiendo y enviando…" : "Un momento…")
                  : modo === "avisar" ? "Avisarle por correo" : modo === "enviar" ? "Enviar y avisarle por correo" : "Pedir y avisarle por correo"}
              </button>
              {modo !== "avisar" && (
                <button className="pedir-sin-avisar" disabled={ocupado} onClick={() => hacer(false)} style={boton(false)}>{modo === "enviar" ? "Enviar sin avisar" : "Pedir sin avisar"}</button>
              )}
            </>
          )}
          <button className="cerrar-pedido" onClick={onCerrar} style={boton(false)}>{yaEsta ? "Listo" : modo === "avisar" ? "Cerrar" : "Cancelar"}</button>
        </div>
      </div>
    </div>
  );
}
