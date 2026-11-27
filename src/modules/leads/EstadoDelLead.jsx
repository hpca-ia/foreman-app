import { useState } from "react";
import { Hourglass, AlertTriangle, ArrowRight, Check, CalendarPlus } from "lucide-react";
import { colors } from "../../theme/colors";
import { inputStyle } from "../../components/ui/Input";
import { HORAS } from "../../theme/constants";
import {
  TIPOS, ORDEN_DE_TIPOS, tipoDe, etapasDelTipo, estadoDelLead, enEspera, loQueDice, sePersigue, estaAprobado, estaPerdido,
  alCambiarEtapa, alCambiarTipo, alAprobar, alPerder, alReabrir, alEsperar, alResponder, alPosponer,
  RECORDAR_EN, SE_ESPERA, hoyISO, sumarDias,
} from "./pipeline";
import { aplicar, agregarTarea } from "./proyecto";

// EN QUÉ ESTÁ UN PROYECTO DEL PIPELINE, Y LO QUE SE LE PUEDE HACER DE UN TOQUE.
//
// Es la misma pieza en la tarjeta del pipeline y adentro del proyecto, para
// que se toque igual en los dos lados:
//
//   · su ETAPA, de un desplegable con las de su tipo. Al final del mismo
//     desplegable están las dos salidas: aprobado y perdido.
//   · su TIPO, que decide qué etapas ofrece.
//   · su ESTADO: EN CURSO o EN ESPERA. Los mismos dos que tiene cada
//     actividad del checklist, y se cambian igual, con un botón que dice lo
//     que hace: «Dejar en espera» y «Retomar».
//
// Se guarda solo, y dice al lado que guardó.
//
// POR QUÉ DOS ESTADOS Y NO CINCO. Hernán, 26/11/2026: «El workflow del
// pipeline es confuso». Esta pieza decía «próximo paso» y mostraba una de
// cinco cosas —al día, vencido, sin próximo paso, esperando al cliente,
// insistir—, con hasta tres botones distintos según cuál fuera; al que no
// tenía un paso con fecha lo ponía en amarillo y le pedía una. De sus nueve
// proyectos, cinco estaban en «Insistir con el cliente» en rojo desde hacía
// hasta quince días, y «Insistí hoy» no se había usado nunca: la espera era el
// estacionamiento. Ahora dejar algo en espera no obliga a poner un día —sin
// recordatorio queda en gris, estacionado—, no tener fechas no es una falta, y
// lo único que se pone en rojo es lo que venció o el día que uno mismo pidió.

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
  // (confirmar), esperar (qué se espera y si se recuerda), posponer (cuándo).
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
  const espera = enEspera(estado);
  // Lo único que avisa: llegó el día que se pidió, o venció algo con fecha.
  const avisa = estado.clase === "insistir" || estado.clase === "vencido";

  function elegirEtapa(valor) {
    if (valor === APROBAR || valor === PERDER) { setPidiendo(valor === APROBAR ? "aprobar" : "perder"); setTexto(""); setError(""); return; }
    guardar(alCambiarEtapa(lead, valor, catalogo));
  }

  // Dejarlo en espera, o seguir en espera: con un día para recordarlo, o sin ninguno.
  async function conRecordatorio(dia) {
    const cambio = pidiendo === "esperar" ? alEsperar({ que: texto, recordarEl: dia, hoy }) : alPosponer({ recordarEl: dia, hoy });
    if (await guardar(cambio)) cerrarPedido();
  }

  // AGREGAR QUÉ SIGUE ahí mismo, cuando no queda nada abierto: una actividad
  // suya, de quien lleva el proyecto. Es la misma que después aparece en Tareas.
  // La fecha es opcional. CON HORA ES UNA REUNIÓN, y también si lo dice.
  async function sumarPaso(dia = null, hora = null) {
    const titulo = paso.trim();
    if (!titulo) { setError("Escribí qué sigue."); return; }
    setError(""); setEstadoGuardado("guardando");
    const r = await agregarTarea({
      lead, etapaId: lead.etapa, titulo, tipo: (dia && hora) || /reuni[oó]n/i.test(titulo) ? "Reunión" : "Gestión",
      due_date: dia || null, hora: dia ? hora || null : null,
      assignee_id: lead.responsable_id || currentUser?.id || null, quien: currentUser,
      orden: tareas.length + 1,
    });
    if (r.error) { setError(r.error); setEstadoGuardado(""); return; }
    setPaso(""); setCuando({ dia: "", hora: "" }); setPidiendo(null); setEstadoGuardado("guardado");
    setTimeout(() => setEstadoGuardado(e => (e === "guardado" ? "" : e)), 2500);
    onTareas?.();
  }

  const tono = avisa ? colors.danger : colors.inkSoft;
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

      {/* EN QUÉ ESTÁ: en curso o en espera, y lo que hay para decir de eso. */}
      {ancho && <div style={{ ...rotulo, marginTop: 4 }}>ESTADO</div>}
      <div className="que-sigue-del-lead" data-estado={espera ? "espera" : "curso"} data-clase={estado.clase}
        style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", minWidth: 0 }}>
        <span className="estado-del-proyecto" style={pastilla(espera ? "espera" : estado.clase === "vencido" ? "vencido" : "curso")}>
          {espera ? <><Hourglass size={11} /> En espera</> : estado.clase === "vencido" ? <><AlertTriangle size={11} /> Vencido</> : "En curso"}
        </span>
        <span className="lo-que-dice" style={{ fontSize: ancho ? 12.5 : 12, color: tono, fontWeight: avisa ? 600 : 400, minWidth: 0, overflowWrap: "anywhere" }}>
          {loQueDice(estado)}
        </span>

        {editable && !pidiendo && (
          espera ? (
            <>
              <button className="retomar" onClick={() => guardar(alResponder(lead, hoy))} style={chip(estado.clase === "insistir")} title="Ya no está en espera: vuelve a estar en curso">
                <Check size={11} /> Retomar
              </button>
              <button className="seguir-en-espera" onClick={() => setPidiendo("posponer")} style={chip(false)} title="Sigue en espera: recordármelo otro día, o sin recordatorio">
                {estado.clase === "insistir" ? "Sigue en espera…" : "Recordarme…"}
              </button>
            </>
          ) : (
            <>
              {/* Sin nada abierto, lo que sigue se agrega acá mismo, sin abrir el proyecto. */}
              {!estado.paso && (
                <button className="agregar-que-sigue" onClick={() => { setPidiendo("fecha"); setError(""); }} style={chip(false)}>
                  <CalendarPlus size={11} /> Agregar qué sigue
                </button>
              )}
              <button className="dejar-en-espera" onClick={() => setPidiendo("esperar")} style={chip(false)} title="No depende de nosotros, o se retoma más adelante">
                <Hourglass size={11} /> Dejar en espera
              </button>
            </>
          )
        )}
      </div>

      {/* AGREGAR QUÉ SIGUE. Qué es y, si se sabe, para cuándo. */}
      {editable && pidiendo === "fecha" && (
        <div className="proximo-paso" style={caja}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: colors.ink }}>¿Qué sigue?</div>
          <input value={paso} onChange={e => { setPaso(e.target.value); setError(""); }} aria-label="Qué sigue" autoFocus
            placeholder="Ej: reunión con el cliente, pedir la cotización"
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); sumarPaso(cuando.dia || null, cuando.dia ? cuando.hora || null : null); } }}
            style={{ ...inputStyle, padding: "5px 8px", fontSize: 12 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: colors.muted }}>Para:</span>
            {DIAS.map(([txt, n]) => (
              <button key={txt} style={chip(false)} onClick={() => sumarPaso(sumarDias(hoy, n), cuando.hora || null)}>{txt}</button>
            ))}
            <input type="date" value={cuando.dia} min={hoy} aria-label="Otro día"
              onChange={e => { setCuando(c => ({ ...c, dia: e.target.value })); setError(""); }}
              style={{ ...inputStyle, width: 132, padding: "3px 6px", fontSize: 11.5 }} />
            {/* La hora de una lista, no la ruleta del navegador. */}
            <select value={cuando.hora} aria-label="Hora" onChange={e => setCuando(c => ({ ...c, hora: e.target.value }))}
              style={{ ...inputStyle, width: 104, padding: "3px 6px", fontSize: 11.5 }}>
              <option value="">Sin hora</option>
              {HORAS.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
            <button className="agregar-sin-fecha" style={chip(true)} onClick={() => sumarPaso(cuando.dia || null, cuando.dia ? cuando.hora || null : null)}>
              {cuando.dia ? "Agregar" : "Agregar sin fecha"}
            </button>
            <button onClick={cerrarPedido} style={chip(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* DEJARLO EN ESPERA, o seguir en espera: qué se espera, y si se recuerda. */}
      {(pidiendo === "esperar" || pidiendo === "posponer") && (
        <div className="en-espera-del-proyecto" style={caja}>
          {pidiendo === "esperar" && (
            <>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: colors.ink }}>Queda en espera. ¿Qué se espera? <span style={{ fontWeight: 400, color: colors.muted }}>(opcional)</span></div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {SE_ESPERA.map(q => <button key={q} className="se-espera" onClick={() => setTexto(v => (v === q ? "" : q))} style={chip(texto === q)}>{q}</button>)}
              </div>
              <input value={texto} onChange={e => setTexto(e.target.value)} aria-label="Qué se espera" placeholder="O escribilo: que apruebe el presupuesto, la cotización de FOGA…"
                style={{ ...inputStyle, padding: "5px 8px", fontSize: 12 }} />
            </>
          )}
          <div style={{ fontSize: 11.5, fontWeight: 600, color: colors.ink }}>{pidiendo === "esperar" ? "¿Te lo recuerdo?" : "Sigue en espera. ¿Te lo recuerdo?"}</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
            {RECORDAR_EN.map(o => (
              <button key={o.dias} onClick={() => conRecordatorio(sumarDias(hoy, o.dias))} style={chip(false)}>{o.label}</button>
            ))}
            <input type="date" value={fecha} min={hoy} onChange={e => setFecha(e.target.value)} aria-label="Otro día"
              style={{ ...inputStyle, width: 140, padding: "4px 7px", fontSize: 12 }} />
            {fecha && <button onClick={() => conRecordatorio(fecha)} style={chip(true)}>Ese día</button>}
            <button className="sin-recordatorio" onClick={() => conRecordatorio(null)} style={chip(!fecha)} title="Queda estacionado: no avisa hasta que lo retomes">Sin recordatorio</button>
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

// El estado, en una pastilla: en curso, en espera, o vencido.
const pastilla = cual => ({
  display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 700, borderRadius: 14, padding: "2px 9px", whiteSpace: "nowrap", flexShrink: 0,
  background: cual === "espera" ? colors.warningSoft : cual === "vencido" ? colors.dangerSoft : colors.brandSoft,
  color: cual === "espera" ? colors.warning : cual === "vencido" ? colors.danger : colors.brand,
});

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
