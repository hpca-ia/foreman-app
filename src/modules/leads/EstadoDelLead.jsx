import { useState } from "react";
import { Hourglass, AlertTriangle, ArrowRight, Check, CalendarPlus } from "lucide-react";
import { colors } from "../../theme/colors";
import { inputStyle } from "../../components/ui/Input";
import { HORAS } from "../../theme/constants";
import {
  TIPOS, ORDEN_DE_TIPOS, tipoDe, etapasDelTipo, estadoDelLead, loQueDice, explicarSinPaso, sePersigue, estaAprobado, estaPerdido,
  alCambiarEtapa, alCambiarTipo, alAprobar, alPerder, alReabrir, alEsperar, alResponder, alInsistir, alPosponer,
  RECORDAR_EN, hoyISO, sumarDias,
} from "./pipeline";
import { aplicar, agregarTarea, ponerFecha } from "./proyecto";
import { comoActividad } from "./tareasDelProyecto";

// EN QUÉ ESTÁ UN LEAD, Y LO QUE SE LE PUEDE HACER DE UN TOQUE.
//
// Es la misma pieza en la tarjeta del pipeline y adentro del proyecto, para
// que se toque igual en los dos lados:
//
//   · su ETAPA, de un desplegable con las de su tipo. Al final del mismo
//     desplegable están las dos salidas: aprobado y perdido.
//   · su TIPO, que decide qué etapas ofrece.
//   · qué sigue: su próximo paso con fecha, o desde cuándo espera al cliente.
//     Si no tiene ninguna de las dos cosas lo dice en amarillo, y ahí mismo se
//     le pone.
//
// Se guarda solo, y dice al lado que guardó.
//
// CADA COSA DICE QUÉ ES. Hernán, 17/11/2026, mirando este cuadro en RES BG:
// «¿este cuadro de diálogo al inicio qué hace?». Eran dos desplegables sin
// nombre, un aviso que nombraba un solo punto y una fila de botones de fecha
// siempre abierta. Adentro del proyecto ahora lleva sus títulos —etapa, tipo,
// próximo paso—, dice la cuenta entera («ninguno de los 8 puntos abiertos
// tiene fecha») y por qué importa, y los botones de fecha se abren al tocar
// «Ponerle fecha» y se cierran con «Cancelar».

const APROBAR = "__aprobar", PERDER = "__perder";

/**
 * @param tareas    las tareas de este lead (filas enteras)
 * @param onCambio  recibe el lead con lo que cambió, ya guardado
 * @param onTareas  se llama cuando esta pieza creó o movió una tarea
 * @param ancho     adentro del proyecto hay lugar para decir más
 */
export default function EstadoDelLead({ lead, tareas = [], catalogo = [], currentUser, editable = true, onCambio, onTareas, ancho = false }) {
  const [estadoGuardado, setEstadoGuardado] = useState("");   // "" · guardando · guardado
  const [error, setError] = useState("");
  // Lo que se está por hacer y pide un dato más: perder (motivo), aprobar
  // (confirmar), esperar / insistir / posponer (cuándo recordar).
  const [pidiendo, setPidiendo] = useState(null);
  const [texto, setTexto] = useState("");
  const [fecha, setFecha] = useState("");
  const [paso, setPaso] = useState("");
  // AGENDAR: un día cualquiera y, si es una reunión, la hora. Los tres botones
  // de un toque alcanzan para «mañana»; una reunión que se acordó con el
  // cliente es el jueves 20 a las 10, y eso no se podía poner desde acá.
  const [cuando, setCuando] = useState({ dia: "", hora: "" });

  const hoy = hoyISO();
  const tipo = tipoDe(lead);
  const etapas = etapasDelTipo(catalogo, tipo);
  const enCatalogo = etapas.some(e => e.id === lead.etapa);
  const estado = estadoDelLead(lead, tareas, hoy);
  const vivo = sePersigue(lead);

  async function guardar(cambio) {
    if (!cambio) return true;
    if (cambio.error) { setError(cambio.error); return false; }
    setError(""); setEstadoGuardado("guardando");
    const r = await aplicar(lead, cambio, currentUser);
    if (r.error) { setError(r.error); setEstadoGuardado(""); return false; }
    setEstadoGuardado("guardado");
    setTimeout(() => setEstadoGuardado(e => (e === "guardado" ? "" : e)), 2500);
    onCambio?.(r.lead);
    return true;
  }
  const cerrarPedido = () => { setPidiendo(null); setTexto(""); setFecha(""); setPaso(""); setCuando({ dia: "", hora: "" }); setError(""); };
  // Por qué no tiene próximo paso, dicho entero; null si lo tiene o espera.
  const falta = explicarSinPaso(estado, tareas);

  function elegirEtapa(valor) {
    if (valor === APROBAR || valor === PERDER) { setPidiendo(valor === APROBAR ? "aprobar" : "perder"); setTexto(""); setError(""); return; }
    guardar(alCambiarEtapa(lead, valor, catalogo));
  }

  // Los tres que piden «cuándo te lo recuerdo» comparten las mismas opciones.
  async function conRecordatorio(dia) {
    const cambio = pidiendo === "esperar" ? alEsperar({ que: texto, recordarEl: dia, hoy })
      : pidiendo === "insistir" ? alInsistir(lead, { recordarEl: dia, hoy })
      : alPosponer({ recordarEl: dia, hoy });
    if (await guardar(cambio)) cerrarPedido();
  }

  // Ponerle el próximo paso ahí mismo: una tarea suya, con fecha, de quien
  // lleva el lead. Es la misma que después aparece en Tareas.
  //
  // CON HORA ES UNA REUNIÓN, y también si lo dice: así aparece como reunión en
  // Tareas y en el checklist, y desde ahí se le manda la invitación al cliente.
  async function sumarPaso(dia, hora = null) {
    const titulo = paso.trim();
    if (!titulo) { setError("Escribí cuál es el próximo paso."); return; }
    if (!dia) { setError("Elegí el día, o tocá Hoy, Mañana o En una semana."); return; }
    setError(""); setEstadoGuardado("guardando");
    const r = await agregarTarea({
      lead, etapaId: lead.etapa, titulo, tipo: hora || /reuni[oó]n/i.test(titulo) ? "Reunión" : "Otro",
      due_date: dia, hora: hora || null,
      assignee_id: lead.responsable_id || currentUser?.id || null, quien: currentUser,
      orden: tareas.length + 1,
    });
    if (r.error) { setError(r.error); setEstadoGuardado(""); return; }
    setPaso(""); setCuando({ dia: "", hora: "" }); setPidiendo(null); setEstadoGuardado("guardado");
    setTimeout(() => setEstadoGuardado(e => (e === "guardado" ? "" : e)), 2500);
    onTareas?.();
  }
  async function fecharPaso(dia, hora = undefined) {
    if (!dia) { setError("Elegí el día, o tocá Hoy, Mañana o En una semana."); return; }
    setError(""); setEstadoGuardado("guardando");
    const e = await ponerFecha(comoActividad(estado.paso), dia, currentUser, hora);
    setCuando({ dia: "", hora: "" });
    if (e) { setError(e); setEstadoGuardado(""); return; }
    setPidiendo(null); setEstadoGuardado("guardado");
    setTimeout(() => setEstadoGuardado(x => (x === "guardado" ? "" : x)), 2500);
    onTareas?.();
  }

  const tono = estado.clase === "insistir" || estado.clase === "vencido" ? colors.danger
    : estado.clase === "sin_paso" ? colors.warning
    : colors.inkSoft;
  const sel = { ...inputStyle, width: "auto", padding: "5px 8px", fontSize: 12, fontWeight: 600, cursor: "pointer", maxWidth: "100%" };
  const parar = e => e.stopPropagation();

  // ── Cerrado: no se persigue. Dice cómo terminó y deja volver atrás. ──────
  if (!vivo) {
    return (
      <div onClick={parar} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12 }}>
        <span style={{ fontWeight: 700, color: estaAprobado(lead) ? colors.success : colors.muted }}>
          {estaAprobado(lead) ? "Aprobado" : "Perdido"}
        </span>
        {estaPerdido(lead) && lead.motivo_perdida && <span style={{ color: colors.inkSoft }}>· {lead.motivo_perdida}</span>}
        {tipo && <span style={{ color: colors.muted }}>· {TIPOS[tipo].label}</span>}
        {editable && (
          <button onClick={() => { if (window.confirm(`¿Volver "${lead.nombre}" al pipeline?`)) guardar(alReabrir()); }} style={chip(false)}>
            Volver al pipeline
          </button>
        )}
        <Guardado estado={estadoGuardado} error={error} />
      </div>
    );
  }

  return (
    <div onClick={parar} style={{ display: "grid", gap: 6, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {/* La etapa: una, de las de su tipo. Al final, las dos salidas. */}
        {ancho && <span style={rotulo}>ETAPA</span>}
        <select value={enCatalogo ? lead.etapa : ""} disabled={!editable || !tipo} aria-label="Etapa"
          title={tipo ? "En qué etapa está el proyecto. Al final de la lista: aprobado o perdido" : "Elegí primero el tipo de lead"}
          onChange={e => elegirEtapa(e.target.value)}
          style={{ ...sel, color: enCatalogo ? colors.ink : colors.warning, borderColor: enCatalogo ? colors.border : colors.warningBorder }}>
          {!enCatalogo && <option value="">{tipo ? "Elegí la etapa" : "Sin etapa"}</option>}
          {etapas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          {tipo && (
            <optgroup label="Cerrar">
              <option value={APROBAR}>Aprobado…</option>
              <option value={PERDER}>Perdido…</option>
            </optgroup>
          )}
        </select>

        {/* El tipo se cambia desde acá mismo; en la tarjeta se muestra solo
            cuando falta, porque ahí el tipo ya es el título del grupo. */}
        {(ancho || !tipo) && (
          <>
            {ancho && <span style={{ ...rotulo, marginLeft: 6 }}>TIPO</span>}
            <select value={tipo || ""} disabled={!editable} aria-label="Tipo de lead"
              title="Qué tipo de proyecto es: decide qué etapas se ofrecen"
              onChange={e => guardar(alCambiarTipo(lead, e.target.value, catalogo))}
              style={{ ...sel, fontWeight: 400, color: tipo ? colors.inkSoft : colors.warning, borderColor: tipo ? colors.border : colors.warningBorder }}>
              {!tipo && <option value="">Elegí el tipo</option>}
              {ORDEN_DE_TIPOS.map(t => <option key={t} value={t}>{TIPOS[t].label}</option>)}
            </select>
          </>
        )}
        <Guardado estado={estadoGuardado} error="" />
      </div>

      {/* Qué sigue: el próximo paso, o desde cuándo espera al cliente. */}
      {ancho && <div style={{ ...rotulo, marginTop: 4 }}>PRÓXIMO PASO</div>}
      <div className="que-sigue-del-lead" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", minWidth: 0 }}>
        <span style={{ fontSize: ancho ? 12.5 : 12, color: tono, fontWeight: estado.clase === "al_dia" || estado.clase === "esperando" ? 400 : 600,
          display: "inline-flex", alignItems: "center", gap: 5, minWidth: 0, overflowWrap: "anywhere" }}>
          {(estado.clase === "esperando" || estado.clase === "insistir") && <Hourglass size={12} style={{ flexShrink: 0 }} />}
          {estado.clase === "sin_paso" && <AlertTriangle size={12} style={{ flexShrink: 0 }} />}
          {/* Adentro del proyecto hay lugar para decir la cuenta entera. */}
          {ancho && falta ? falta.dice : loQueDice(estado)}
        </span>

        {editable && !pidiendo && (
          lead.espera_desde ? (
            <>
              <button onClick={() => guardar(alResponder(lead, hoy))} style={chip(false)}><Check size={11} /> Ya respondió</button>
              <button onClick={() => setPidiendo("insistir")} style={chip(estado.clase === "insistir")}>Insistí hoy</button>
              <button onClick={() => setPidiendo("posponer")} style={chip(false)}>Recordarme el…</button>
            </>
          ) : (
            <>
              {/* SIN PRÓXIMO PASO NI ESPERA: se le pone acá, sin abrir nada. El
                  botón dice a qué punto le pone la fecha. */}
              {falta && (
                <button className="poner-fecha" onClick={() => { setPidiendo("fecha"); setError(""); }} style={chip(true)}
                  title={estado.paso ? "Elegir el día, y la hora si es una reunión" : "Escribir qué sigue y para cuándo"}>
                  <CalendarPlus size={11} /> {ancho ? falta.boton : estado.paso ? "Ponerle fecha" : "Poner el próximo paso"}
                </button>
              )}
              <button onClick={() => setPidiendo("esperar")} style={chip(false)} title="La pelota queda del lado del cliente, y FOREMAN te lo recuerda">
                <Hourglass size={11} /> Esperar al cliente
              </button>
            </>
          )
        )}
      </div>
      {ancho && falta && !pidiendo && (
        <div className="por-que-importa" style={{ fontSize: 11, color: colors.muted, lineHeight: 1.45 }}>
          {falta.ayuda}{estado.paso ? " También se le puede poner fecha a cualquier otro punto, abriéndolo en el checklist de abajo." : ""}
          {" "}Si lo que falta depende del cliente, tocá «Esperar al cliente».
        </div>
      )}

      {/* PONERLE FECHA. Qué es, y cuándo. Los tres botones de un toque agendan
          en el acto; el día exacto y la hora, con «Agendar». Antes esta fila
          estaba siempre abierta, sin decir de qué era. */}
      {editable && pidiendo === "fecha" && (
        <div className="proximo-paso" style={caja}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: colors.ink }}>
            {estado.paso ? `¿Para cuándo «${estado.paso.title}»?` : "¿Cuál es el próximo paso, y para cuándo?"}
          </div>
          {!estado.paso && (
            <input value={paso} onChange={e => { setPaso(e.target.value); setError(""); }} aria-label="Próximo paso" autoFocus
              placeholder="Ej: reunión con el cliente"
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); sumarPaso(cuando.dia || sumarDias(hoy, 1), cuando.dia ? cuando.hora || null : null); } }}
              style={{ ...inputStyle, padding: "5px 8px", fontSize: 12 }} />
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
            {DIAS.map(([txt, n]) => (
              <button key={txt} style={chip(false)}
                onClick={() => (estado.paso ? fecharPaso(sumarDias(hoy, n), cuando.hora || undefined) : sumarPaso(sumarDias(hoy, n), cuando.hora || null))}>{txt}</button>
            ))}
            <span style={{ fontSize: 11, color: colors.muted }}>u otro día:</span>
            <input type="date" value={cuando.dia} min={hoy} aria-label="Día del próximo paso"
              onChange={e => { setCuando(c => ({ ...c, dia: e.target.value })); setError(""); }}
              style={{ ...inputStyle, width: 132, padding: "3px 6px", fontSize: 11.5 }} />
            {/* La hora de una lista, no la ruleta del navegador. */}
            <select value={cuando.hora} aria-label="Hora del próximo paso" onChange={e => setCuando(c => ({ ...c, hora: e.target.value }))}
              style={{ ...inputStyle, width: 104, padding: "3px 6px", fontSize: 11.5 }}>
              <option value="">Sin hora</option>
              {HORAS.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
            <button style={chip(true)}
              onClick={() => (estado.paso ? fecharPaso(cuando.dia, cuando.hora || undefined) : sumarPaso(cuando.dia, cuando.hora || null))}>
              Agendar
            </button>
            <button onClick={cerrarPedido} style={chip(false)}>Cancelar</button>
          </div>
          <div style={{ fontSize: 10.5, color: colors.muted, lineHeight: 1.45 }}>
            {estado.paso
              ? "«Hoy», «Mañana» y «En una semana» guardan al tocarlos. Con hora queda como reunión."
              : "Queda como tarea del proyecto, la misma que se ve en Tareas. Con hora es una reunión: desde el checklist se le manda la invitación al cliente."}
          </div>
        </div>
      )}

      {/* Esperar, insistir o correr el recordatorio: los tres piden un día. */}
      {(pidiendo === "esperar" || pidiendo === "insistir" || pidiendo === "posponer") && (
        <div style={caja}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: colors.ink }}>
            {pidiendo === "esperar" ? "Queda esperando al cliente. ¿Cuándo te lo recuerdo?"
              : pidiendo === "insistir" ? "Anotado que insististe hoy. ¿Cuándo te lo vuelvo a recordar?"
              : "¿Cuándo te lo recuerdo?"}
          </div>
          {pidiendo === "esperar" && (
            <input value={texto} onChange={e => setTexto(e.target.value)} autoFocus placeholder="¿Qué se espera? Ej: que apruebe el presupuesto (opcional)"
              style={{ ...inputStyle, padding: "5px 8px", fontSize: 12 }} />
          )}
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
            {RECORDAR_EN.map(o => (
              <button key={o.dias} onClick={() => conRecordatorio(sumarDias(hoy, o.dias))} style={chip(true)}>{o.label}</button>
            ))}
            <input type="date" value={fecha} min={hoy} onChange={e => setFecha(e.target.value)} aria-label="Otro día"
              style={{ ...inputStyle, width: 140, padding: "4px 7px", fontSize: 12 }} />
            {fecha && <button onClick={() => conRecordatorio(fecha)} style={chip(true)}>Ese día</button>}
            <button onClick={cerrarPedido} style={chip(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {pidiendo === "perder" && (
        <div style={caja}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: colors.ink }}>¿Por qué se perdió?</div>
          <input value={texto} onChange={e => setTexto(e.target.value)} autoFocus placeholder="Precio, plazo, se fue con otro…"
            onKeyDown={async e => { if (e.key === "Enter" && await guardar(alPerder(texto))) cerrarPedido(); }}
            style={{ ...inputStyle, padding: "5px 8px", fontSize: 12 }} />
          <div style={{ display: "flex", gap: 5 }}>
            <button onClick={async () => { if (await guardar(alPerder(texto))) cerrarPedido(); }} style={chip(true)}>Cerrar como perdido</button>
            <button onClick={cerrarPedido} style={chip(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {pidiendo === "aprobar" && (
        <div style={caja}>
          <div style={{ fontSize: 11.5, color: colors.ink, lineHeight: 1.5 }}>
            <strong>¿Aprobado?</strong> Sale del pipeline y pasa a los proyectos en marcha. Sus tareas siguen siendo suyas.
          </div>
          <div style={{ display: "flex", gap: 5 }}>
            <button onClick={async () => { if (await guardar(alAprobar())) cerrarPedido(); }}
              style={{ ...chip(false), background: colors.success, borderColor: colors.success, color: "#fff" }}>
              Aprobar <ArrowRight size={11} />
            </button>
            <button onClick={cerrarPedido} style={chip(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {error && <div style={{ fontSize: 11, color: colors.danger }}>{error}</div>}
    </div>
  );
}

const DIAS = [["Hoy", 0], ["Mañana", 1], ["En una semana", 7]];

// El nombre de cada cosa, en chico: sin él, dos desplegables no dicen qué son.
const rotulo = { fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.5 };

// Que guardó se dice al lado de lo que se tocó, no en un cartel aparte.
function Guardado({ estado, error }) {
  if (error) return <span style={{ fontSize: 11, color: colors.danger }}>{error}</span>;
  if (!estado) return null;
  return (
    <span style={{ fontSize: 10.5, color: estado === "guardado" ? colors.success : colors.muted }}>
      {estado === "guardado" ? "Guardado" : "Guardando…"}
    </span>
  );
}

const caja = { display: "grid", gap: 6, background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 9 };

const chip = fuerte => ({
  display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: colors.font,
  border: `1px solid ${fuerte ? colors.ink : colors.border}`, background: fuerte ? colors.ink : "#fff",
  color: fuerte ? "#fff" : colors.inkSoft, borderRadius: 14, padding: "3px 10px", whiteSpace: "nowrap",
});
