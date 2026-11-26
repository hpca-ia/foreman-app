// COMPARTIR EL PRESUPUESTO Y LA COMPARATIVA CON EL CLIENTE, DESDE LA MATRIZ.
//
// Hernán, 26/11/2026: «En este caso el dueño del proyecto es dueño del
// presupuesto. Me gustaría poder compartir con él el presupuesto y estas
// comparativas también, a manera informativa, no de edición. Aunque aquí él
// podría también elegir y aprobar presupuesto para que quede constancia del
// armado del presupuesto». Definió: el cliente VE Y APRUEBA, y al compartir
// «se puede escoger si es con utilidad o costo... dependiendo de esto el
// cliente lo ve o no».
//
// Va acá, al pie de la matriz, porque es donde se elige: se comparte lo que
// se está mirando. El cliente lo ve en el enlace de su proyecto, en la solapa
// «Presupuesto», y contesta ahí; su respuesta queda en el registro de
// aprobaciones del proyecto (migraciones 187 y 196).
//
// LO QUE SE COMPARTE ES UNA FOTO de este momento. Si después se vuelve a
// elegir o llega otra versión de una cotización, el cliente sigue viendo la
// foto: acá se avisa que cambió, y se comparte de nuevo.
//
// Compartir y dejar de compartir se confirman acá mismo, viendo qué va a
// pasar: es lo que sale hacia afuera.
import { useState, useEffect, useMemo, useCallback } from "react";
import { Share2, X } from "lucide-react";
import { colors } from "../../theme/colors";
import { supabase } from "../../lib/supabase";
import { fotoParaElCliente, mismaFoto, estadoDeLoCompartido, elegidosSinUtilidad, MODOS } from "./presupuestoParaElCliente.js";
import { compartidosDe, compartirConElCliente, dejarDeCompartir, avisarDelPresupuesto } from "./compartidosDelPresupuesto";
import { enlaceDelClienteDe } from "../leads/proyecto";
import { involucradosDe } from "../leads/involucrados";
import { aQuienAvisar, mensajeDelPedido, enlaceDeWhatsApp, avisoDice, momento } from "../leads/aprobaciones.js";
import PresupuestoCompartido from "../../portal/PresupuestoCompartido";

const dia = f => (f ? new Date(f).toLocaleDateString("es-EC", { day: "numeric", month: "long" }) : "");
const enlace = { background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: colors.font, fontSize: 11.5, color: colors.brand, textDecoration: "underline" };
const boton = { background: colors.brand, border: "none", borderRadius: 8, padding: "7px 12px", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: colors.font };
const TONOS = { muted: colors.muted, success: colors.success, warning: colors.warning, danger: colors.danger };

export default function CompartirConElCliente({ presupuesto, capitulos = [], items = [], cotizaciones = [], elegidos = {}, currentUser, puedeEditar = true }) {
  const [compartidos, setCompartidos] = useState([]);
  const [error, setError] = useState("");
  const [dijo, setDijo] = useState("");
  // Sin elegir: a costo o con utilidad lo decide quien comparte, cada vez. No hay uno puesto de antemano.
  const [modo, setModo] = useState(null);
  const [conComparativa, setConComparativa] = useState(true);
  const [previa, setPrevia] = useState(false);
  const [confirmando, setConfirmando] = useState(null);   // "compartir" | "dejar"
  const [ocupado, setOcupado] = useState(false);
  const [suEnlace, setSuEnlace] = useState(undefined);    // undefined: todavía no se sabe; null: apagado
  const [gente, setGente] = useState([]);
  const [tildados, setTildados] = useState(new Set());
  const [mensaje, setMensaje] = useState("");
  const leadId = presupuesto?.lead_id || null;

  const cargar = useCallback(async () => {
    if (!presupuesto?.id) return;
    const r = await compartidosDe(presupuesto.id);
    if (r.error) { setError(r.error); return; }
    setCompartidos(r.compartidos);
    // Lo que sigue compartido manda en qué se ofrece: así «compartir de nuevo» es con lo mismo, salvo que se cambie.
    const vigente = r.compartidos.find(c => !c.retirado_at);
    if (vigente) { setModo(vigente.modo === "costo" ? "costo" : "utilidad"); setConComparativa(vigente.con_comparativa !== false); }
  }, [presupuesto?.id]);
  useEffect(() => { cargar(); }, [cargar]);

  // El enlace del proyecto y a quién se le puede avisar: la gente de afuera, el cliente primero.
  useEffect(() => {
    if (!leadId) { setSuEnlace(undefined); setGente([]); return undefined; }
    let vivo = true;
    (async () => {
      const [url, { personas }, equipo] = await Promise.all([
        enlaceDelClienteDe(leadId).catch(() => null),
        involucradosDe(leadId).catch(() => ({ personas: [] })),
        supabase.from("usuarios").select("email").then(r => r.data || [], () => []),
      ]);
      if (!vivo) return;
      const lista = aQuienAvisar(personas, equipo);
      setSuEnlace(url || null); setGente(lista);
      setTildados(new Set(lista.filter(p => p.esCliente && p.email).map(p => p.clave)));
    })();
    return () => { vivo = false; };
  }, [leadId]);

  const actual = compartidos.find(c => !c.retirado_at) || null;
  const estado = estadoDeLoCompartido(actual, actual?.pedido);
  // Mientras no se elija, la vista previa va con utilidad: el costo no se muestra por descuido.
  const fotoDeHoy = useMemo(() => fotoParaElCliente({ presupuesto, capitulos, items, cotizaciones, elegidos, modo: modo || "utilidad", conComparativa }),
    [presupuesto, capitulos, items, cotizaciones, elegidos, modo, conComparativa]);
  // ¿Lo que ve el cliente es lo de hoy? Se compara con lo mismo que se le compartió: su modo y su comparativa.
  const cambio = useMemo(() => !!actual && !mismaFoto(actual.foto, fotoParaElCliente({
    presupuesto, capitulos, items, cotizaciones, elegidos, modo: actual.modo, conComparativa: actual.con_comparativa !== false,
  })), [actual, presupuesto, capitulos, items, cotizaciones, elegidos]);
  // CON UTILIDAD, lo que no tiene utilidad puesta se vería al costo: se avisa antes de compartir.
  const sinUtilidad = useMemo(() => (modo === "utilidad" ? elegidosSinUtilidad({ capitulos, items, cotizaciones, elegidos }) : 0),
    [modo, capitulos, items, cotizaciones, elegidos]);
  const otraForma = !!actual && !!modo && (actual.modo !== modo || (actual.con_comparativa !== false) !== conComparativa);

  async function compartir() {
    setOcupado(true); setError(""); setDijo("");
    const r = await compartirConElCliente({ presupuesto, foto: fotoDeHoy, quien: currentUser });
    setOcupado(false); setConfirmando(null);
    if (r.error) { setError(r.error); return; }
    await cargar();
    setDijo(`Compartido. ${suEnlace ? "El cliente ya lo ve en su enlace, en la solapa «Presupuesto»" : "Cuando prendas el enlace del cliente lo va a ver ahí, en la solapa «Presupuesto»"}. Todavía no se le avisó: elegí abajo a quién.`);
  }
  async function dejar() {
    setOcupado(true); setError(""); setDijo("");
    const err = await dejarDeCompartir({ presupuesto, quien: currentUser });
    setOcupado(false); setConfirmando(null);
    if (err) { setError(err); return; }
    await cargar();
    setDijo("Se dejó de compartir: el cliente ya no lo ve. Lo que haya contestado antes sigue en el registro de aprobaciones.");
  }
  async function avisar() {
    const correos = gente.filter(p => tildados.has(p.clave) && p.email).map(p => p.email);
    if (!correos.length || !actual?.pedido) return;
    setOcupado(true); setError(""); setDijo("");
    const r = await avisarDelPresupuesto({ leadId, pedidoId: actual.pedido.id, correos, mensaje, quien: currentUser });
    setOcupado(false);
    if (r.error) { setError(r.error); return; }
    await cargar();
    setDijo(`Se le avisó por correo a ${r.enviadoA.join(", ")}.`);
  }
  const tildar = clave => setTildados(v => { const a = new Set(v); if (a.has(clave)) a.delete(clave); else a.add(clave); return a; });

  const caja = { background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: "11px 13px", marginBottom: 10 };
  const avisos = Array.isArray(actual?.pedido?.avisos) ? actual.pedido.avisos : [];
  const esperando = estado.estado === "pendiente";

  return (
    <div className="compartir-con-el-cliente" style={{ ...caja, fontFamily: colors.font }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
        <Share2 size={14} color={colors.brand} />
        <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.ink }}>Compartir con el cliente</div>
      </div>
      <div style={{ fontSize: 11.5, color: colors.inkSoft, lineHeight: 1.5, marginBottom: 8, maxWidth: 860 }}>
        El dueño del proyecto ve el presupuesto con lo elegido y lo que cotizó cada empresa, en su enlace, y contesta «lo apruebo» o deja
        observaciones. No puede cambiar nada. Su respuesta queda en el registro de aprobaciones del proyecto, con lo que tenía a la vista.
      </div>

      {error && <div className="error-al-compartir" role="alert" style={{ fontSize: 12, color: colors.danger, marginBottom: 8 }}>{error}</div>}
      {dijo && <div className="dijo-al-compartir" style={{ fontSize: 12, color: colors.success, marginBottom: 8, lineHeight: 1.45 }}>{dijo}</div>}

      {!leadId ? (
        <div className="sin-proyecto" style={{ fontSize: 12, color: colors.warning, lineHeight: 1.5 }}>
          Este presupuesto no está en ningún proyecto, y el cliente entra por el enlace de su proyecto. Asignale el proyecto arriba,
          donde dice «sin proyecto», y vas a poder compartirlo.
        </div>
      ) : (
        <>
          {/* EN QUÉ ESTÁ */}
          <div className="estado-de-lo-compartido" data-estado={estado.estado} style={{ fontSize: 12.5, fontWeight: 600, color: TONOS[estado.tono], lineHeight: 1.45 }}>
            {/* Se compartió antes y ya no: no es «todavía no se le compartió». */}
            {!actual && compartidos.length ? `Hoy no está compartido: se dejó de compartir el ${dia(compartidos[0].retirado_at || compartidos[0].created_at)}.` : estado.dice}
            {actual && estado.estado !== "nada" && (
              <span style={{ fontWeight: 400, color: colors.inkSoft }}>
                {estado.estado === "pendiente" ? ` · compartido el ${dia(actual.created_at)}` : actual.pedido?.respuesta_at ? ` el ${dia(actual.pedido.respuesta_at)}` : ""}
                {` · ${MODOS[actual.modo]?.dice.toLowerCase() || ""}${actual.con_comparativa === false ? ", sin la comparativa" : ""}`}
              </span>
            )}
          </div>
          {actual?.pedido?.respuesta_nota && (
            <div className="lo-que-escribio" style={{ fontSize: 12, color: colors.ink, lineHeight: 1.5, margin: "3px 0", padding: "6px 9px", background: colors.bg, borderRadius: 7, whiteSpace: "pre-line" }}>
              «{actual.pedido.respuesta_nota}»
            </div>
          )}
          {suEnlace === null && (
            <div className="enlace-apagado" style={{ fontSize: 11.5, color: colors.warning, lineHeight: 1.45, marginTop: 3 }}>
              El enlace del cliente de este proyecto está apagado: se prende en la ficha del proyecto, al pie del checklist. Hasta entonces no tiene dónde verlo.
            </div>
          )}
          {cambio && (
            <div className="cambio-desde-que-se-compartio" style={{ fontSize: 11.5, color: colors.warning, lineHeight: 1.45, marginTop: 3 }}>
              Lo que ve el cliente es lo del {dia(actual.created_at)}. Desde entonces cambió lo elegido o alguna cotización: compartilo de nuevo para que vea lo de hoy
              {actual.pedido?.respuesta ? ", y te vuelva a contestar" : ""}.
            </div>
          )}

          {/* CÓMO SE COMPARTE */}
          {puedeEditar && (
            <div className="como-se-comparte" style={{ marginTop: 9, display: "grid", gap: 5 }}>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
                {Object.entries(MODOS).map(([id, m]) => (
                  <label key={id} className={`modo-${id}`} style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 12, color: colors.ink, cursor: "pointer", maxWidth: 360 }}>
                    <input type="radio" name={`modo-de-compartir-${presupuesto.id}`} checked={modo === id} onChange={() => { setModo(id); setConfirmando(null); }} style={{ marginTop: 2 }} />
                    <span><strong>{m.dice}</strong><span style={{ display: "block", fontSize: 11, color: colors.inkSoft, lineHeight: 1.4 }}>{m.ayuda}</span></span>
                  </label>
                ))}
              </div>
              {sinUtilidad > 0 && (
                <div className="sin-utilidad" style={{ fontSize: 11.5, color: colors.warning, lineHeight: 1.45 }}>
                  {sinUtilidad === 1 ? "1 de los rubros elegidos todavía no tiene" : `${sinUtilidad} de los rubros elegidos todavía no tienen`} utilidad puesta: compartido así,
                  el cliente {sinUtilidad === 1 ? "lo" : "los"} vería al costo. Pasá lo elegido al presupuesto y ponele la utilidad antes de compartir.
                </div>
              )}
              <label className="con-la-comparativa" style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, color: colors.ink, cursor: "pointer" }}>
                <input type="checkbox" checked={conComparativa} onChange={ev => { setConComparativa(ev.target.checked); setConfirmando(null); }} />
                Con lo que cotizó cada empresa
                <span style={{ fontSize: 11, color: colors.inkSoft }}>— sin tildar, ve solo el presupuesto con lo elegido</span>
              </label>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 3 }}>
                {confirmando === "compartir" ? (
                  <span className="confirmar-compartir" style={{ fontSize: 12, color: colors.ink, lineHeight: 1.5 }}>
                    {actual ? "Reemplaza lo que ve hoy y le pide aprobar de nuevo. " : "Lo va a ver en el enlace de su proyecto y le pide que lo apruebe. "}
                    Total ${fotoDeHoy.totales.total.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}, {MODOS[modo]?.dice.toLowerCase()}.{" "}
                    <button className="si-compartir" style={{ ...enlace, fontSize: 12, fontWeight: 700 }} disabled={ocupado} onClick={compartir}>{ocupado ? "Compartiendo…" : "Sí, compartir"}</button>
                    {" · "}
                    <button style={{ ...enlace, fontSize: 12, color: colors.muted }} disabled={ocupado} onClick={() => setConfirmando(null)}>no</button>
                  </span>
                ) : (!actual || cambio || otraForma) ? (
                  <button className="compartir" style={{ ...boton, opacity: modo ? 1 : 0.55, cursor: modo ? "pointer" : "default" }} disabled={!modo}
                    title={modo ? "" : "Elegí primero si lo ve a costo o con utilidad"} onClick={() => { setConfirmando("compartir"); setDijo(""); }}>
                    {!modo ? "Elegí primero qué precios ve" : actual ? "Compartir de nuevo…" : "Compartir y pedirle que apruebe…"}
                  </button>
                ) : null}
                <button className="ver-como-lo-ve" style={enlace} onClick={() => setPrevia(v => !v)}>{previa ? "cerrar la vista del cliente" : "ver cómo lo va a ver"}</button>
                {actual && (confirmando === "dejar" ? (
                  <span style={{ fontSize: 12, color: colors.ink }}>
                    El cliente deja de verlo.{" "}
                    <button className="si-dejar" style={{ ...enlace, fontSize: 12, color: colors.danger }} disabled={ocupado} onClick={dejar}>sí, dejar de compartir</button>
                    {" · "}
                    <button style={{ ...enlace, fontSize: 12, color: colors.muted }} disabled={ocupado} onClick={() => setConfirmando(null)}>no</button>
                  </span>
                ) : <button className="dejar-de-compartir" style={{ ...enlace, color: colors.muted }} onClick={() => setConfirmando("dejar")}>dejar de compartir</button>)}
              </div>
            </div>
          )}

          {/* AVISARLE. Compartir no le manda nada: se elige a quién, y sale un correo con el botón a su enlace. */}
          {actual && esperando && puedeEditar && (
            <div className="avisarle-al-cliente" style={{ marginTop: 10, paddingTop: 9, borderTop: `1px solid ${colors.neutralSoft}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: colors.ink }}>Avisarle</div>
              {avisos.map((a, i) => (
                <div key={i} className="aviso-dado" style={{ fontSize: 11.5, color: colors.inkSoft }}>{avisoDice({ correos: a.correos || [] })} · {momento(a.cuando)}</div>
              ))}
              {!gente.length && (
                <div style={{ fontSize: 11.5, color: colors.inkSoft, lineHeight: 1.45 }}>
                  En la ficha del proyecto no hay nadie de afuera con correo o WhatsApp. Cargá al cliente en «Gente» y va a aparecer acá.
                </div>
              )}
              {gente.map(p => (
                <div key={p.clave} className="a-quien-avisar" style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 12, color: colors.ink, padding: "2px 0", flexWrap: "wrap" }}>
                  <label style={{ display: "flex", gap: 6, alignItems: "baseline", cursor: p.email ? "pointer" : "default", flex: 1, minWidth: 220 }}>
                    <input type="checkbox" disabled={!p.email} checked={tildados.has(p.clave) && !!p.email} onChange={() => tildar(p.clave)} />
                    <span>{p.nombre}{p.rol ? <span style={{ color: colors.muted }}> · {p.rol}</span> : null}
                      <span style={{ color: colors.inkSoft }}> · {p.email || "sin correo"}</span></span>
                  </label>
                  {p.whatsapp && suEnlace && (
                    <a className="por-whatsapp" target="_blank" rel="noreferrer" style={{ ...enlace, fontSize: 11.5 }}
                      title="Abre tu WhatsApp con el mensaje ya escrito: lo mandás vos"
                      href={enlaceDeWhatsApp(p.whatsapp, mensajeDelPedido({ nombre: p.nombre, proyecto: "tu proyecto", punto: actual.pedido?.titulo || "el presupuesto", enlace: suEnlace }))}>
                      escribirle por WhatsApp
                    </a>
                  )}
                </div>
              ))}
              {gente.some(p => p.email) && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 5 }}>
                  <input className="mensaje-del-aviso" value={mensaje} onChange={ev => setMensaje(ev.target.value)} placeholder="Unas líneas para el correo (opcional)"
                    style={{ flex: 1, minWidth: 220, border: `1px solid ${colors.border}`, borderRadius: 7, padding: "6px 9px", fontSize: 12, fontFamily: colors.font }} />
                  <button className="avisar-por-correo" style={{ ...boton, opacity: ocupado || ![...tildados].length ? 0.6 : 1 }}
                    disabled={ocupado || !gente.some(p => tildados.has(p.clave) && p.email) || suEnlace === null} onClick={avisar}>
                    {ocupado ? "Avisando…" : avisos.length ? "Avisarle de nuevo por correo" : "Avisarle por correo"}
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* CÓMO LO VA A VER: la misma pieza que usa su enlace, con la foto de hoy. */}
      {previa && (
        <div className="vista-del-cliente" style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${colors.neutralSoft}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: colors.ink }}>Así lo ve el cliente, {MODOS[modo || "utilidad"].dice.toLowerCase()}{conComparativa ? "" : " y sin la comparativa"}{modo ? "" : " (todavía no elegiste: se muestra con utilidad)"}</div>
            <button onClick={() => setPrevia(false)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: colors.muted, display: "flex" }}><X size={14} /></button>
          </div>
          <div style={{ maxWidth: 680, background: colors.bg, borderRadius: 11, padding: 12 }}>
            <PresupuestoCompartido p={{ id: 0, titulo: `Presupuesto: ${presupuesto?.nombre || ""}`, compartido_el: new Date().toISOString(), estado: "pendiente", foto: fotoDeHoy }} soloVer />
          </div>
        </div>
      )}
    </div>
  );
}
