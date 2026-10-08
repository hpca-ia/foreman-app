import { useEffect, useState, useCallback } from "react";
import { Plus, X, Check, AlertTriangle, CalendarDays, Send, Printer, Paperclip, FileText, Image as Imagen } from "lucide-react";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import { cargarPlan, diaDelPlan, guardarDia, agregarItem, borrarItem, marcarHecha, guardarMotivo,
  diasEntre, loQueTocaEstaSemana, comoSalio, historialDePlanes, proponerPeriodo, correrPeriodo,
  periodoDelPlan, guardarObservaciones, archivosDelPlan, subirArchivoDelPlan, borrarArchivoDelPlan,
  enlacesDeArchivos } from "./planSemanalDatos";
import { cargarPlan as cargarGantt, leerPlazo } from "../cronograma/plazo";
import { equipoEnCache } from "../../lib/equipo";
import { pdfPlanSemanal } from "./pdfPlanSemanal";

// La semana que viene, escrita antes.
//
// El Libro de Obra registra lo que pasó; esto, lo que va a pasar. Es el mismo
// día visto desde el otro lado —la misma obra, la misma fecha, la misma
// persona— y por eso vive acá adentro y no en un módulo aparte: un módulo
// aparte competiría con el libro por la atención del residente, y el día
// terminaría escrito dos veces en dos lugares que nadie compara.
//
// Y ESA COMPARACIÓN ES TODO EL VALOR. Un plan que nadie contrasta con lo que
// pasó es una lista de buenas intenciones. Lo que se planificó y NO se hizo
// —con su motivo— es el dato que un mes después explica un atraso, y el que
// hoy no existe en ningún lado: se discute de memoria.

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const comoSeLee = f => {
  const d = new Date(`${f}T12:00:00`);
  return `${DIAS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
};

const CAMPOS = [
  { id: "horario", label: "Horarios de trabajo", pista: "7h00 a 17h00 · almuerzo 12h30 a 13h30" },
  { id: "personal", label: "Ingreso de personal", pista: "Qué cuadrillas entran, subcontratos, visitas" },
  { id: "permisos", label: "Permisos especiales", pista: "Trabajo en altura, caliente, espacio confinado" },
  { id: "consideraciones", label: "Consideraciones especiales", pista: "Lo que hay que tener en cuenta ese día" },
];

export default function PlanSemanal({ lead, currentUser, puedeEscribir = true }) {
  const hoy = new Date().toISOString().slice(0, 10);
  // El período arranca en lo que propone la obra, no en el lunes del
  // calendario: si la obra empezó un miércoles, su semana es de miércoles a
  // martes. Esto es solo el primer dibujo —sin saber todavía el arranque ni el
  // último plan— y el efecto de abajo lo corrige con lo que diga la base.
  const inicial = proponerPeriodo({ hoy });
  const [desde, setDesde] = useState(inicial.desde);
  const [hasta, setHasta] = useState(inicial.hasta);
  const [corteListo, setCorteListo] = useState(false);
  const [periodo, setPeriodo] = useState(null);
  const [archivos, setArchivos] = useState([]);
  const [enlaces, setEnlaces] = useState({});
  const [subiendo, setSubiendo] = useState(false);
  const [dias, setDias] = useState([]);
  const [items, setItems] = useState([]);
  const [sinTablas, setSinTablas] = useState(false);
  const [gantt, setGantt] = useState([]);
  const [nuevo, setNuevo] = useState({});
  const [abierto, setAbierto] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  // A quién se le manda. Por defecto el gerente y el director, que son los que
  // tienen que saber qué se va a hacer esta semana sin entrar a buscarlo.
  const [mandando, setMandando] = useState(null);
  // Las semanas ya planificadas. Sin un lugar donde verlas juntas, cada
  // semana era un papel que se escribía y se perdía.
  const [historial, setHistorial] = useState([]);

  const cargar = useCallback(async () => {
    const r = await cargarPlan(lead?.id, desde, hasta);
    setDias(r.dias); setItems(r.items); setSinTablas(r.sinTablas); setPeriodo(r.periodo || null);
    const a = r.periodo ? await archivosDelPlan(r.periodo.id) : [];
    setArchivos(a);
    setEnlaces(a.length ? await enlacesDeArchivos(a) : {});
  }, [lead?.id, desde, hasta]);
  useEffect(() => { cargar(); }, [cargar]);

  // EL CORTE DE LA SEMANA LO DECIDE LA OBRA. Se lee una vez, al entrar: el
  // arranque del cronograma y el último plan escrito. Si la obra empezó un
  // miércoles, la pantalla abre en miércoles-martes sin que nadie toque las
  // dos fechas; y si quien la lleva cortó distinto la semana pasada, se
  // respeta eso, que vale más que cualquier regla.
  useEffect(() => {
    let vivo = true;
    (async () => {
      if (!lead?.id) return;
      const [{ inicio }, hist] = await Promise.all([
        leerPlazo(lead.id).catch(() => ({ inicio: null })),
        historialDePlanes(lead.id).catch(() => ({ semanas: [] })),
      ]);
      if (!vivo) return;
      const ultimo = (hist.semanas || [])[0] || null;
      const p = proponerPeriodo({
        hoy, inicioObra: inicio,
        ultimoDesde: ultimo?.desde || null, ultimoHasta: ultimo?.hasta || null,
      });
      setDesde(p.desde); setHasta(p.hasta); setCorteListo(true);
    })();
    return () => { vivo = false; };
    // Al cambiar de obra, y una vez por día. `hoy` es una fecha en texto, así
    // que no cambia entre dibujos: el efecto no pisa el período que el usuario
    // haya elegido a mano.
  }, [lead?.id, hoy]);

  // El histórico se vuelve a leer cuando cambia el plan: marcar una tarea
  // cambia el "12 de 15" de su semana, y una lista que no se entera es una
  // lista en la que uno deja de confiar.
  useEffect(() => {
    let vivo = true;
    historialDePlanes(lead?.id).then(r => { if (vivo) setHistorial(r.semanas); }).catch(() => {});
    return () => { vivo = false; };
  }, [lead?.id, items]);

  // Lo que el cronograma dice que toca. El plan no arranca en blanco: las
  // barras ya saben qué cae esta semana, y escribir a mano lo que la app ya
  // sabe es el trabajo que hace que un módulo de planificación se abandone a
  // la tercera semana.
  useEffect(() => {
    let vivo = true;
    cargarGantt(lead?.id).then(g => { if (vivo) setGantt(g.actividades || []); }).catch(() => {});
    return () => { vivo = false; };
  }, [lead?.id]);

  if (sinTablas) {
    return (
      <div style={{ fontSize: 12.5, color: colors.warning, background: colors.warningSoft,
        border: `1px solid ${colors.warningBorder}`, borderRadius: colors.radiusMd, padding: 13 }}>
        Falta correr la migración 089 para planificar la semana.
      </div>
    );
  }

  const fechas = diasEntre(desde, hasta);
  const diaDe = f => dias.find(d => d.fecha === f);
  const itemsDe = (f, tipo) => {
    const d = diaDe(f);
    return d ? items.filter(i => i.plan_dia_id === d.id && (i.tipo || "tarea") === tipo) : [];
  };
  const toca = loQueTocaEstaSemana(gantt, desde, hasta);
  const resumen = comoSalio(items);

  // El período se crea al primer dato que se escribe, no al abrir la
  // pantalla: mirar una semana no debería dejar un plan vacío en el histórico.
  async function asegurarPeriodo() {
    if (periodo) return { periodo };
    const r = await periodoDelPlan(lead.id, desde, hasta, currentUser);
    if (r.periodo) setPeriodo(r.periodo);
    return r;
  }

  async function sumar(fecha, tipo, texto, extra = {}) {
    if (!String(texto || "").trim()) return;
    setOcupado(true); setError("");
    const { periodo: p } = await asegurarPeriodo();
    const { dia, error: e } = await diaDelPlan(lead.id, fecha, currentUser, p?.id || null);
    if (e) { setOcupado(false); setError(e); return; }
    const orden = items.filter(i => i.plan_dia_id === dia.id && (i.tipo || "tarea") === tipo).length;
    const r = await agregarItem(dia, { tipo, texto, orden, ...extra });
    setOcupado(false);
    if (r.error) { setError(r.error); return; }
    setNuevo(n => ({ ...n, [`${fecha}·${tipo}`]: "" }));
    await cargar();
  }

  async function tocarCampo(fecha, campo, valor) {
    const { periodo: p } = await asegurarPeriodo();
    const { dia, error: e } = await diaDelPlan(lead.id, fecha, currentUser, p?.id || null);
    if (e) { setError(e); return; }
    const err = await guardarDia(dia.id, { [campo]: valor || null });
    if (err) { setError(err); return; }
    setError(""); await cargar();
  }

  return (
    <div style={{ fontFamily: colors.font }}>
      {/* EL PERÍODO, LIBRE. No hay una "semana" acá: hay el corte de esta obra.
          Se planifica de miércoles a martes, de lunes a domingo, de lunes a
          lunes, y si la obra empezó un miércoles su semana empieza un
          miércoles hasta que termine. Las dos fechas se escogen a mano y la
          pantalla abre en el corte que viene usando esta obra. */}
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 12,
        background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: "10px 12px" }}>
        <div>
          <label style={lbl}>DESDE</label>
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
            style={{ ...inputStyle, width: 150, padding: "6px 9px", fontSize: 12 }} />
        </div>
        <div>
          <label style={lbl}>HASTA</label>
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
            style={{ ...inputStyle, width: 150, padding: "6px 9px", fontSize: 12 }} />
        </div>
        {/* Ir y venir CONSERVANDO EL CORTE. Era lo que faltaba para volver a un
            plan ya pasado: la lista de abajo sirve para saltar lejos, pero
            para corregir el de la semana anterior —que es lo más común— uno
            quiere una flecha, no buscarse en una lista.

            Y mueve el período entero, no siete días fijos: si la semana de
            esta obra va de miércoles a martes, atrás es el miércoles anterior. */}
        <Button variant="outline" size="sm" title="El período anterior, con el mismo corte"
          onClick={() => { const p = correrPeriodo(desde, hasta, -1); setDesde(p.desde); setHasta(p.hasta); }}>◀</Button>
        <Button variant="outline" size="sm" title="El período en el que cae hoy"
          onClick={() => {
            const p = proponerPeriodo({ hoy, inicioObra: desde, ultimoDesde: desde, ultimoHasta: hasta });
            setDesde(p.desde); setHasta(p.hasta);
          }}>Hoy</Button>
        <Button variant="outline" size="sm" title="El período siguiente, con el mismo corte"
          onClick={() => { const p = correrPeriodo(desde, hasta, 1); setDesde(p.desde); setHasta(p.hasta); }}>▶</Button>

        {/* Qué corte quedó. Las dos fechas se eligen libres —de miércoles a
            martes, de lunes a domingo, de lunes a lunes— y conviene ver en
            palabras lo que se escogió antes de mandarlo. */}
        <div style={{ fontSize: 10.5, color: colors.muted, lineHeight: 1.45, paddingBottom: 2 }}>
          {DIAS[new Date(`${desde}T12:00:00`).getDay()]} a {DIAS[new Date(`${hasta}T12:00:00`).getDay()]}
          <br />{fechas.length} {fechas.length === 1 ? "día" : "días"}
        </div>

        {/* CÓMO SALIÓ. El número que importa no es cuántas se hicieron: es
            cuáles NO y por qué. Una semana al 80% con las dos de la ruta
            crítica sin hacer es peor que una al 60% donde faltó pintura. */}
        {resumen.total > 0 && (
          <div style={{ marginLeft: "auto", fontSize: 11.5, color: colors.muted, lineHeight: 1.5, textAlign: "right" }}>
            <strong style={{ color: colors.ink }}>{resumen.hechas} de {resumen.total}</strong> hechas
            {resumen.sinHacer.length > 0 && (
              <div style={{ color: resumen.sinMotivo.length ? colors.warning : colors.muted }}>
                {resumen.sinHacer.length} sin hacer
                {resumen.sinMotivo.length > 0 && `, ${resumen.sinMotivo.length} sin decir por qué`}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Que se sepa que marcar escribe el libro. Estaba solo en el tooltip
          de cada check, o sea en ningún lado: nadie pasa el mouse por encima
          de un control que ya entiende. Y es la mitad de por qué el plan vive
          acá adentro — si no se dice, el residente sigue escribiendo el libro
          a mano además de marcar. */}
      <div style={{ fontSize: 11.5, color: colors.muted, lineHeight: 1.55, marginBottom: 10 }}>
        Cada actividad que marqués hecha <strong style={{ color: colors.inkSoft }}>se escribe sola en el libro de obra
        de ese día</strong>. Lo que quede sin marcar necesita decir por qué: eso es lo que después explica un atraso.
      </div>

      {error && <div style={{ fontSize: 12, color: colors.danger, marginBottom: 9 }}>{error}</div>}

      {/* Lo que el cronograma dice que toca esta semana, para no escribirlo a
          mano: se toca y entra como tarea del día que uno elija. */}
      {toca.length > 0 && puedeEscribir && (
        <div style={{ background: colors.brandSoft, borderRadius: colors.radiusMd, padding: "10px 12px", marginBottom: 12 }}>
          <div style={{ fontSize: 11.5, color: colors.inkSoft, lineHeight: 1.5, marginBottom: 7 }}>
            <strong style={{ color: colors.ink }}>El cronograma dice que esta semana toca esto.</strong> Tocá una para
            ponerla en un día; podés editar el texto después.
          </div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {toca.map(a => (
              <button key={a.id} onClick={() => setAbierto({ actividad: a })}
                title={`${a.inicio} → ${a.fin}${a.critica ? " · ruta crítica" : ""}`}
                style={{ background: "#fff", border: `1px solid ${a.critica ? colors.danger : colors.border}`,
                  borderRadius: 14, padding: "3px 10px", fontSize: 11.5, cursor: "pointer", fontFamily: colors.font,
                  color: colors.ink }}>
                {a.critica && <span style={{ color: colors.danger }}>● </span>}
                {a.nombre}
                {a.arranca && <span style={{ color: colors.brand }}> · arranca</span>}
                {a.termina && <span style={{ color: colors.brand }}> · termina</span>}
              </button>
            ))}
          </div>
          {abierto?.actividad && (
            <div style={{ marginTop: 8, display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 11.5, color: colors.ink }}>«{abierto.actividad.nombre}» ¿en qué día?</span>
              {fechas.map(f => (
                <button key={f} onClick={async () => {
                  await sumar(f, "tarea", abierto.actividad.nombre, {
                    cronograma_actividad_id: abierto.actividad.id,
                    obra_actividad_id: abierto.actividad.obra_actividad_id || null,
                  });
                  setAbierto(null);
                }} style={{ background: "#fff", border: `1px solid ${colors.border}`, borderRadius: 7,
                  padding: "3px 9px", fontSize: 11, cursor: "pointer", fontFamily: colors.font }}>
                  {comoSeLee(f)}
                </button>
              ))}
              <button onClick={() => setAbierto(null)} style={{ background: "none", border: "none", color: colors.muted,
                cursor: "pointer", fontSize: 11, fontFamily: colors.font }}>cancelar</button>
            </div>
          )}
        </div>
      )}

      {!fechas.length && (
        <div style={{ textAlign: "center", color: colors.muted, fontSize: 13, padding: "24px 0" }}>
          Elegí un período. Hasta tiene que ser igual o posterior a desde.
        </div>
      )}

      {/* Un bloque por día. */}
      {fechas.map(f => {
        const d = diaDe(f);
        const tareas = itemsDe(f, "tarea");
        const materiales = itemsDe(f, "material");
        const esHoy = f === hoy;
        return (
          <div key={f} style={{ background: colors.surface, border: `1px solid ${esHoy ? colors.brand : colors.border}`,
            borderRadius: colors.radiusMd, padding: "11px 13px", marginBottom: 9 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              <CalendarDays size={14} color={esHoy ? colors.brand : colors.muted} />
              <strong style={{ fontSize: 13, color: esHoy ? colors.brand : colors.ink, textTransform: "capitalize" }}>
                {comoSeLee(f)}
              </strong>
              {esHoy && <span style={{ fontSize: 10, fontWeight: 700, color: colors.brand }}>HOY</span>}
              {tareas.length > 0 && (
                <span style={{ fontSize: 11, color: colors.muted }}>
                  {tareas.filter(t => t.hecha).length} de {tareas.length}
                </span>
              )}
            </div>

            {/* Las actividades del día. El check escribe el libro. */}
            <div style={{ display: "grid", gap: 4, marginBottom: 7 }}>
              {tareas.map(t => (
                <div key={t.id} style={{ display: "flex", alignItems: "flex-start", gap: 7,
                  background: t.hecha ? colors.successSoft || colors.bg : colors.bg, borderRadius: 7, padding: "6px 9px" }}>
                  <button disabled={!puedeEscribir || ocupado}
                    onClick={async () => {
                      setOcupado(true);
                      const r = await marcarHecha(t, !t.hecha, currentUser, { leadId: lead.id, fecha: f });
                      setOcupado(false);
                      if (r.error) { setError(r.error); return; }
                      setError(""); await cargar();
                    }}
                    title={t.hecha ? "Hecha. Tocá para desmarcarla." : "Marcarla hecha: se escribe sola en el libro de ese día."}
                    style={{ background: "none", border: "none", cursor: puedeEscribir ? "pointer" : "default",
                      // La cruz en ROJO. En gris, una lista de quince
                      // actividades a medio hacer se lee como quince renglones
                      // iguales: lo que falta tiene que saltar.
                      color: t.hecha ? colors.success : colors.danger, display: "flex", padding: 0, marginTop: 1, flexShrink: 0 }}>
                    {t.hecha ? <Check size={14} /> : <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1 }}>✗</span>}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, color: colors.ink, textDecoration: t.hecha ? "line-through" : "none",
                      opacity: t.hecha ? 0.65 : 1 }}>
                      {t.texto}
                    </div>
                    {/* POR QUÉ NO SE HIZO. Es el campo que hace que planificar
                        sirva: una tarea sin marcar y sin motivo es un dato
                        perdido, y es justo el que hace falta cuando hay que
                        justificar una semana. */}
                    {!t.hecha && puedeEscribir && (
                      <input defaultValue={t.motivo || ""} placeholder="¿por qué no se hizo?"
                        onBlur={async e => {
                          if ((e.target.value || "") === (t.motivo || "")) return;
                          const err = await guardarMotivo(t.id, e.target.value);
                          if (err) setError(err); else await cargar();
                        }}
                        style={{ ...inputStyle, marginTop: 3, padding: "3px 7px", fontSize: 11,
                          borderColor: t.motivo ? colors.border : colors.warningBorder }} />
                    )}
                    {!t.hecha && !puedeEscribir && t.motivo && (
                      <div style={{ fontSize: 11, color: colors.warning, marginTop: 2 }}>{t.motivo}</div>
                    )}
                  </div>
                  {puedeEscribir && (
                    <button onClick={async () => { const e = await borrarItem(t.id); if (e) setError(e); else await cargar(); }}
                      style={{ background: "none", border: "none", color: colors.border, cursor: "pointer", display: "flex", padding: 0, flexShrink: 0 }}>
                      <X size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {puedeEscribir && (
              <div style={{ display: "flex", gap: 5, marginBottom: 9 }}>
                <input value={nuevo[`${f}·tarea`] || ""} placeholder="¿qué se hace ese día?"
                  onChange={e => setNuevo(n => ({ ...n, [`${f}·tarea`]: e.target.value }))}
                  onKeyDown={e => { if (e.key === "Enter") sumar(f, "tarea", nuevo[`${f}·tarea`]); }}
                  style={{ ...inputStyle, flex: 1, padding: "5px 9px", fontSize: 12 }} />
                <Button variant="outline" size="sm" disabled={ocupado}
                  onClick={() => sumar(f, "tarea", nuevo[`${f}·tarea`])}><Plus size={12} /></Button>
              </div>
            )}

            {/* Material y compras: una lista con su marca, no un párrafo. Lo
                que hay que tener ese día se tacha cuando llega, igual que una
                tarea, y así al final del día se ve qué no llegó. */}
            {(materiales.length > 0 || puedeEscribir) && (
              <div style={{ marginBottom: 9 }}>
                <label style={lbl}>MATERIAL Y COMPRAS</label>
                <div style={{ display: "grid", gap: 3, marginBottom: 4 }}>
                  {materiales.map(m => (
                    <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12 }}>
                      <button disabled={!puedeEscribir || ocupado}
                        onClick={async () => {
                          setOcupado(true);
                          const r = await marcarHecha(m, !m.hecha, currentUser, {});
                          setOcupado(false);
                          if (r.error) setError(r.error); else await cargar();
                        }}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 0,
                          color: m.hecha ? colors.success : colors.danger, display: "flex" }}>
                        {m.hecha ? <Check size={13} /> : <span style={{ fontSize: 12, fontWeight: 700 }}>✗</span>}
                      </button>
                      <span style={{ flex: 1, color: colors.ink, textDecoration: m.hecha ? "line-through" : "none",
                        opacity: m.hecha ? 0.65 : 1 }}>{m.texto}</span>
                      {puedeEscribir && (
                        <button onClick={async () => { const e = await borrarItem(m.id); if (e) setError(e); else await cargar(); }}
                          style={{ background: "none", border: "none", color: colors.border, cursor: "pointer", display: "flex" }}>
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {puedeEscribir && (
                  <div style={{ display: "flex", gap: 5 }}>
                    <input value={nuevo[`${f}·material`] || ""} placeholder="qué tiene que estar ese día"
                      onChange={e => setNuevo(n => ({ ...n, [`${f}·material`]: e.target.value }))}
                      onKeyDown={e => { if (e.key === "Enter") sumar(f, "material", nuevo[`${f}·material`]); }}
                      style={{ ...inputStyle, flex: 1, padding: "5px 9px", fontSize: 12 }} />
                    <Button variant="outline" size="sm" disabled={ocupado}
                      onClick={() => sumar(f, "material", nuevo[`${f}·material`])}><Plus size={12} /></Button>
                  </div>
                )}
              </div>
            )}

            {/* Los campos que acompañan al día. Todos opcionales: un día normal
                no tiene permisos especiales ni horario distinto, y obligar a
                llenarlos haría que se llene cualquier cosa. */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 7 }}>
              {CAMPOS.map(c => (
                <div key={c.id}>
                  <label style={lbl}>{c.label.toUpperCase()}</label>
                  {puedeEscribir ? (
                    <input defaultValue={d?.[c.id] || ""} placeholder={c.pista}
                      onBlur={e => { if ((e.target.value || "") !== (d?.[c.id] || "")) tocarCampo(f, c.id, e.target.value); }}
                      style={{ ...inputStyle, padding: "5px 9px", fontSize: 11.5 }} />
                  ) : (
                    <div style={{ fontSize: 11.5, color: d?.[c.id] ? colors.ink : colors.muted }}>{d?.[c.id] || "—"}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* MANDARLO. Un plan que vive en una pantalla que nadie abre no es un
          plan: es una lista. El gerente y el director no entran todos los
          lunes, y lo que necesitan de la semana entra en un correo. */}
      {puedeEscribir && fechas.length > 0 && (
        <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd,
          padding: "11px 13px", marginBottom: 12 }}>
          {!mandando ? (
            <div style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap" }}>
              {/* IMPRIMIRLO. En la obra no se lee un correo: se mira una hoja
                  clavada en la pared del contenedor, con las casillas para ir
                  tachando. Y sale con el logo, porque es un papel que circula
                  entre el contratista, el fiscalizador y el cliente. */}
              <Button variant="outline" size="sm" disabled={ocupado} onClick={async () => {
                setOcupado(true); setError("");
                try {
                  // Lo que quedó sin hacer el período anterior, igual que en
                  // el correo: el plan se lee contra eso. Y el anterior es el
                  // del mismo corte —si la semana va de miércoles a martes, el
                  // miércoles de antes—, no siete días para atrás a ciegas.
                  const ant = correrPeriodo(desde, hasta, -1);
                  const previa = await cargarPlan(lead.id, ant.desde, ant.hasta);
                  const quedaron = previa.items
                    .filter(i => (i.tipo || "tarea") !== "material" && !i.hecha);
                  // Los enlaces del depósito duran una hora y los de la
                  // pantalla pueden llevar rato abiertos: se piden de nuevo,
                  // porque un plano que no carga deja el PDF sin la hoja.
                  const frescos = archivos.length ? await enlacesDeArchivos(archivos) : {};
                  const doc = await pdfPlanSemanal({
                    proyecto: lead.nombre, desde, hasta, dias, items, quedaron,
                    observaciones: periodo?.observaciones || "",
                    archivos: archivos.map(a => ({ ...a, url: frescos[a.id] || enlaces[a.id] })),
                  });
                  doc.save(`Plan ${lead.nombre} ${desde} a ${hasta}.pdf`);
                } catch (e) { setError("No se pudo armar el PDF: " + e.message); }
                setOcupado(false);
              }}><Printer size={13} /> Imprimir o bajar</Button>
              <Button variant="primary" size="sm" onClick={() => {
                const equipo = equipoEnCache() || [];
                // El gerente y el director vienen marcados; el resto del
                // equipo queda a un clic. Marcar a mano cada lunes a las
                // mismas dos personas es la clase de fricción que hace que el
                // plan deje de mandarse a la tercera semana.
                const manda = equipo.filter(u => u.email && ["gerente", "owner"].includes(u.role)).map(u => u.email);
                setMandando({ correos: manda, nota: "" });
              }}><Send size={13} /> Mandar el plan por correo</Button>
              <span style={{ fontSize: 11.5, color: colors.muted }}>
                Al gerente de proyecto y al director, con lo que quedó sin hacer la semana pasada arriba.
              </span>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              <div>
                <label style={lbl}>A QUIÉNES</label>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {(equipoEnCache() || []).filter(u => u.email).map(u => {
                    const puesto = mandando.correos.includes(u.email);
                    return (
                      <button key={u.id} onClick={() => setMandando(m => ({ ...m,
                        correos: puesto ? m.correos.filter(c => c !== u.email) : [...m.correos, u.email] }))}
                        style={{ border: `1px solid ${puesto ? colors.brand : colors.border}`,
                          background: puesto ? colors.brandSoft : "#fff", color: puesto ? colors.brand : colors.inkSoft,
                          borderRadius: 14, padding: "3px 10px", fontSize: 11.5, cursor: "pointer", fontFamily: colors.font }}>
                        {u.name}{u.role ? ` · ${u.role}` : ""}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label style={lbl}>NOTA (OPCIONAL)</label>
                <input value={mandando.nota} placeholder="lo que quieras decir arriba del plan"
                  onChange={e => setMandando(m => ({ ...m, nota: e.target.value }))}
                  style={{ ...inputStyle, padding: "6px 9px", fontSize: 12 }} />
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <Button variant="primary" size="sm" disabled={ocupado || !mandando.correos.length}
                  onClick={async () => {
                    setOcupado(true); setError("");
                    try {
                      const r = await fetch("/api/aviso?de=plan", {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ lead_id: lead.id, desde, hasta, nota: mandando.nota,
                          destinatarios: mandando.correos, de: currentUser?.name || "" }),
                      });
                      const d = await r.json();
                      setOcupado(false);
                      if (!r.ok || d.error) { setError(d.error || "No se pudo mandar."); return; }
                      setMandando(null);
                      window.alert(`Mandado a ${d.enviado} ${d.enviado === 1 ? "persona" : "personas"}.`
                        + (d.pendientes ? `\n\nIncluye las ${d.pendientes} que quedaron sin hacer la semana pasada.` : ""));
                    } catch (e) { setOcupado(false); setError("No se pudo mandar: " + e.message); }
                  }}>{ocupado ? "Mandando…" : `Mandar a ${mandando.correos.length}`}</Button>
                <Button variant="secondary" size="sm" onClick={() => setMandando(null)}>Cancelar</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* OBSERVACIONES Y ADJUNTOS. Van al pie porque se escriben al final, con
          el plan ya armado, y porque son del PLAN ENTERO y no de un día: una
          consulta abierta, lo que se acordó en obra, el plano que hay que
          mirar para ejecutar la semana.

          Y ES LA MITAD QUE FALTABA PARA QUE ESTO SEA UN INFORME. Un plan que
          dice "montar la grada según plano" sin el plano obliga al que lo
          recibe a pedirlo por aparte, y el plano que llega por aparte es el
          que un mes después nadie encuentra. Acá viaja con el plan: al PDF, al
          correo y al histórico. */}
      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`,
        borderRadius: colors.radiusMd, padding: "11px 13px", marginBottom: 12 }}>
        <label style={lbl}>OBSERVACIONES</label>
        <textarea key={`obs-${periodo?.id || desde}`} defaultValue={periodo?.observaciones || ""}
          disabled={!puedeEscribir} rows={3}
          placeholder="Consultas abiertas, lo que se acordó en obra, lo que hay que resolver antes del cierre…"
          onBlur={async e => {
            const txt = e.target.value;
            if (txt === (periodo?.observaciones || "")) return;
            const { periodo: p, error: e1 } = await asegurarPeriodo();
            if (e1) { setError(e1); return; }
            const err = await guardarObservaciones(p.id, txt);
            if (err) { setError(err); return; }
            setError(""); await cargar();
          }}
          style={{ ...inputStyle, fontSize: 12.5, padding: "7px 9px", resize: "vertical",
            lineHeight: 1.5, fontFamily: colors.font }} />

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          <label style={{ ...lbl, marginBottom: 0 }}>PLANOS, FOTOS, PDFs</label>
          {puedeEscribir && (
            <label style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: subiendo ? "wait" : "pointer",
              border: `1px solid ${colors.border}`, borderRadius: colors.radiusSm, padding: "4px 9px",
              fontSize: 11.5, color: colors.inkSoft, background: "#fff" }}>
              <Paperclip size={12} />{subiendo ? "Subiendo…" : "Adjuntar"}
              <input type="file" multiple disabled={subiendo}
                accept="image/*,application/pdf,.dwg,.dxf,.doc,.docx,.xls,.xlsx"
                onChange={async e => {
                  const elegidos = [...(e.target.files || [])];
                  e.target.value = "";
                  if (!elegidos.length) return;
                  setSubiendo(true); setError("");
                  const { periodo: p, error: e1 } = await asegurarPeriodo();
                  if (e1) { setSubiendo(false); setError(e1); return; }
                  // Uno por uno y sin cortar al primer tropiezo: si el tercero
                  // pesa 30 MB, los otros dos ya subidos tienen que quedar.
                  const malos = [];
                  for (const f of elegidos) {
                    const r = await subirArchivoDelPlan(p, f, "", currentUser);
                    if (r.error) malos.push(`${f.name}: ${r.error}`);
                  }
                  setSubiendo(false);
                  setError(malos.join(" · "));
                  await cargar();
                }}
                style={{ display: "none" }} />
            </label>
          )}
        </div>

        {archivos.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 7 }}>
            {archivos.map(a => {
              const esImagen = /^image\//.test(a.tipo || "");
              const url = enlaces[a.id];
              return (
                <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 6,
                  border: `1px solid ${colors.border}`, borderRadius: colors.radiusSm,
                  padding: "4px 5px 4px 7px", background: "#fff", maxWidth: 260 }}>
                  {/* La miniatura: un plano se reconoce mirándolo, no leyendo
                      "IMG_4821.jpg". */}
                  {esImagen && url
                    ? <img src={url} alt={a.nombre} style={{ width: 26, height: 26, objectFit: "cover",
                        borderRadius: 3, flexShrink: 0, border: `1px solid ${colors.neutralSoft}` }} />
                    : (esImagen ? <Imagen size={13} color={colors.muted} /> : <FileText size={13} color={colors.muted} />)}
                  <a href={url || "#"} target="_blank" rel="noreferrer"
                    onClick={ev => { if (!url) ev.preventDefault(); }}
                    title={a.nombre}
                    style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: url ? colors.brand : colors.muted,
                      textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {a.nombre}
                  </a>
                  <span style={{ fontSize: 10, color: colors.muted, flexShrink: 0 }}>
                    {a.tamano ? `${Math.max(1, Math.round(a.tamano / 1024))} kB` : ""}
                  </span>
                  {puedeEscribir && (
                    <button title="Quitar"
                      onClick={async () => {
                        if (!window.confirm(`¿Quitar ${a.nombre} del plan?`)) return;
                        const err = await borrarArchivoDelPlan(a);
                        if (err) { setError(err); return; }
                        setError(""); await cargar();
                      }}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 0,
                        color: colors.muted, display: "flex", flexShrink: 0 }}>
                      <X size={12} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ fontSize: 11.5, color: colors.muted, marginTop: 5, lineHeight: 1.5 }}>
            Nada adjunto. Un plano, la foto de una consulta o el detalle que hay que mirar para
            ejecutar la semana viaja con el plan: al PDF, al correo y al histórico.
          </div>
        )}
      </div>

      {/* LAS SEMANAS ANTERIORES.
          Una lista de semanas con su "12 de 15" al lado es lo que deja ver que
          la obra viene cumpliendo el 80%, y que hace tres semanas lo que falla
          es lo mismo. Eso no se ve mirando una semana sola, y es la única
          razón por la que vale la pena guardar las viejas. */}
      {historial.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.5, marginBottom: 6 }}>
            SEMANAS ANTERIORES
          </div>
          <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, overflow: "hidden" }}>
            {historial.map(sem => {
              const puesta = sem.desde === desde && sem.hasta === hasta;
              return (
                <button key={sem.clave || sem.lunes} onClick={() => { setDesde(sem.desde); setHasta(sem.hasta); }}
                  style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 9,
                    padding: "9px 12px", background: puesta ? colors.brandSoft : "none", border: "none",
                    borderTop: `1px solid ${colors.neutralSoft}`, cursor: "pointer", fontFamily: colors.font }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: colors.ink }}>
                    {comoSeLee(sem.desde)} al {comoSeLee(sem.hasta)}
                    <span style={{ color: colors.muted }}> · {sem.dias} {sem.dias === 1 ? "día" : "días"}</span>
                  </span>
                  {sem.total > 0 ? (
                    <>
                      <span style={{ fontSize: 11.5, color: colors.inkSoft }}>{sem.hechas} de {sem.total}</span>
                      <span style={{ fontSize: 11.5, fontWeight: 700, minWidth: 34, textAlign: "right",
                        color: sem.pct >= 80 ? colors.success : sem.pct >= 50 ? colors.warning : colors.danger }}>
                        {sem.pct}%
                      </span>
                    </>
                  ) : <span style={{ fontSize: 11.5, color: colors.muted }}>sin actividades</span>}
                  {sem.sinMotivo.length > 0 && (
                    <span title={`${sem.sinMotivo.length} sin hacer y sin decir por qué`}
                      style={{ fontSize: 10, fontWeight: 700, color: colors.warning }}>
                      {sem.sinMotivo.length} sin motivo
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {resumen.sinMotivo.length > 0 && (
        <div style={{ fontSize: 12, color: colors.ink, background: colors.warningSoft,
          border: `1px solid ${colors.warningBorder}`, borderRadius: colors.radiusMd, padding: "10px 12px",
          display: "flex", gap: 7, alignItems: "flex-start" }}>
          <AlertTriangle size={13} color={colors.warning} style={{ marginTop: 1, flexShrink: 0 }} />
          <span style={{ lineHeight: 1.55 }}>
            Hay <strong>{resumen.sinMotivo.length}</strong> {resumen.sinMotivo.length === 1 ? "tarea" : "tareas"} sin
            hacer y sin decir por qué. Ese es el dato que un mes después explica un atraso: escrito ahora cuesta una
            línea, reconstruido después no se puede.
          </span>
        </div>
      )}
    </div>
  );
}

const lbl = { fontSize: 9.5, fontWeight: 700, color: colors.muted, letterSpacing: 0.3, display: "block", marginBottom: 3 };
