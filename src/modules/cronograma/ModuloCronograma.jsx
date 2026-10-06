import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, ChevronLeft, GanttChartSquare, AlertTriangle, Link2, CalendarClock } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import { calendario, calcular, aFecha, claveFecha } from "./cpm";
import { materiaPrima, proponerCronograma, guardarPropuesta, aprenderDelCronograma } from "./novaCronograma";
import { bajarProject } from "./exportarProject";

// El cronograma de la obra. Módulo propio, y a propósito.
//
// Control de Obra habla de plata —rubro, planilla, factura— y lo abren la
// administración y la dirección. Esto habla de tiempo —actividad, duración,
// holgura— y lo abren el residente y el cliente. Son dos idiomas, y juntarlos
// en una pantalla obliga a traducir entre ellos para hacer cualquiera de las
// dos cosas. Lo que pasa cuando se mezclan es que la gente deja de usar la
// mitad que no entiende.
//
// Están atados por un puente explícito y en un solo sentido: una actividad
// puede colgar de una agrupación del presupuesto, y de ahí sale su plata.
//
// LA RUTA CRÍTICA SE MARCA, NO SE EXPLICA. Las barras rojas son las que no
// tienen colchón: un día de atraso ahí es un día de atraso en la entrega. Lo
// demás puede correrse sin que pase nada, y saber cuál es cuál es la mitad de
// para qué sirve un cronograma.

const hoy = () => new Date().toISOString().split("T")[0];
const dia = f => (f ? aFecha(f).toLocaleDateString("es-EC", { day: "numeric", month: "short" }) : "—");

export default function ModuloCronograma({ currentUser, puede, nivelProyecto }) {
  const [proyectos, setProyectos] = useState([]);
  const [lead, setLead] = useState(null);
  const [actividades, setActividades] = useState([]);
  const [dependencias, setDependencias] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [sinTablas, setSinTablas] = useState(false);
  const [nueva, setNueva] = useState(null);
  const [error, setError] = useState("");
  const [uniendo, setUniendo] = useState(null);
  const [armando, setArmando] = useState(null);
  const [pensando, setPensando] = useState(false);
  // La escala de arriba: en fechas o en días de obra. Las dos sirven para
  // cosas distintas —"el 14 de marzo" se coordina con el cliente, "el día 62"
  // se discute con el contrato— y cuál hace falta cambia según con quién se
  // esté hablando.
  const [escala, setEscala] = useState("fecha");

  useEffect(() => {
    supabase.from("leads").select("id,nombre,tunel,resultado,obra_id,crono_inicio,es_lead").order("nombre")
      .then(({ data }) => {
        // Todo lo que no se perdió, en curso o no.
        //
        // Un cronograma no es solo de una obra en marcha: el presupuesto se
        // entrega CON un cronograma, y ese se arma antes de que el proyecto
        // sea proyecto. Filtrar por "ganado" dejaba vacía la pantalla
        // justamente cuando más se la necesita — cuando hay que mostrarle al
        // cliente en cuánto tiempo se le hace la obra.
        setProyectos((data || []).filter(l => l.resultado !== "perdido"));
        setCargando(false);
      });
  }, []);

  const cargar = useCallback(async () => {
    if (!lead?.id) return;
    const { data: act, error: e } = await supabase.from("cronograma_actividades")
      .select("*").eq("lead_id", lead.id).order("orden");
    if (e) { setSinTablas(/relation|does not exist|schema cache/i.test(e.message)); return; }
    setActividades(act || []);
    if (act?.length) {
      const { data: dep } = await supabase.from("cronograma_dependencias")
        .select("*").in("actividad_id", act.map(a => a.id));
      setDependencias(dep || []);
    } else setDependencias([]);
  }, [lead?.id]);
  useEffect(() => { cargar(); }, [cargar]);

  const editable = !lead || nivelProyecto?.(lead.id) === "editar";
  // El cronograma vive en el proyecto; la obra es de dónde salen el
  // presupuesto y sus agrupaciones. Un proyecto para cotizar todavía no tiene
  // obra, y ahí el cronograma se arma a mano — que es justamente el caso.
  const obra = lead?.obra_id ? { id: lead.obra_id, nombre: lead.nombre } : null;

  if (cargando) return <Centro>Cargando…</Centro>;

  if (!lead) {
    const mios = proyectos.filter(p => !nivelProyecto || !!nivelProyecto(p.id));
    return (
      <div style={{ fontFamily: colors.font }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: colors.ink, marginBottom: 4 }}>Cronograma</div>
        <div style={{ fontSize: 12.5, color: colors.muted, marginBottom: 14 }}>
          Qué se hace, cuándo, y qué no puede esperar.
        </div>
        {!mios.length ? <Centro>No tenés proyectos asignados.</Centro> : (
          <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, overflow: "hidden" }}>
            {mios.map(p => {
              const enCurso = p.resultado === "ganado" || !!p.obra_id;
              return (
                <button key={p.id} onClick={() => setLead(p)}
                  style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 9,
                    padding: "11px 13px", background: "none", border: "none", borderTop: `1px solid ${colors.neutralSoft}`,
                    cursor: "pointer", fontFamily: colors.font, fontSize: 13.5, color: colors.ink }}>
                  <GanttChartSquare size={15} color={enCurso ? colors.brand : colors.muted} />
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.nombre}
                  </span>
                  {/* Un cronograma para cotizar no es lo mismo que uno de una
                      obra en marcha, y conviene no confundirlos de un vistazo. */}
                  {!enCurso && (
                    <span style={{ fontSize: 9.5, fontWeight: 700, color: colors.muted, background: colors.neutralSoft,
                      borderRadius: 10, padding: "1px 7px", flexShrink: 0 }}>PARA COTIZAR</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  if (sinTablas) {
    return (
      <div style={{ fontFamily: colors.font }}>
        <Volver onClick={() => setLead(null)} />
        <Aviso>Falta correr la migración 076 para usar el cronograma.</Aviso>
      </div>
    );
  }

  const cal = calendario({
    laborables: lead.crono_laborables || [1, 2, 3, 4, 5, 6],
    feriados: lead.crono_feriados || [],
  });
  const plan = calcular({
    actividades: actividades.map(a => ({ ...a, duracion: a.duracion })),
    dependencias,
    inicio: lead.crono_inicio || hoy(),
    cal,
  });

  const porId = new Map(plan.actividades.map(a => [a.id, a]));
  const todas = plan.actividades;
  // La escala: del arranque al fin, en días hábiles, para dibujar las barras.
  const diasTotales = Math.max(1, cal.entre(plan.inicio, plan.fin));
  const posicion = f => (f ? (cal.entre(plan.inicio, f) - 1) / diasTotales : 0);
  const largo = a => (a.inicio && a.fin ? Math.max(cal.entre(a.inicio, a.fin), 1) / diasTotales : 0);

  // En qué día de obra cae una fecha. Negativo antes del arranque: el anticipo
  // de una importación es el día −18, y decirlo así es más claro que una fecha
  // suelta de diciembre en un cronograma que empieza en enero.
  const diaDeObra = f => {
    if (!f) return null;
    const d = cal.entre(plan.arranque, f);
    return aFecha(f) >= aFecha(plan.arranque) ? d : -(cal.entre(f, plan.arranque) - 1);
  };
  const hoyISO = hoy();
  const dentro = aFecha(hoyISO) >= aFecha(plan.inicio) && aFecha(hoyISO) <= aFecha(plan.fin);
  const diaHoy = diaDeObra(hoyISO);

  // Las marcas de la regla: cada cuánto se pone una depende de lo que dure la
  // obra. Con marcas cada día, una obra de ocho meses es una mancha.
  const marcas = (() => {
    const cuantas = Math.min(10, Math.max(4, Math.round(diasTotales / 20)));
    const paso = Math.max(1, Math.round(diasTotales / cuantas));
    const out = [];
    for (let d = 0; d <= diasTotales; d += paso) {
      let f = aFecha(plan.inicio), saltos = 0, vueltas = 0;
      while (saltos < d && vueltas++ < 4000) {
        f = new Date(f.getTime() + 86400000);
        if (cal.trabaja(f)) saltos += 1;
      }
      out.push({ x: d / diasTotales, fecha: claveFecha(f), dia: diaDeObra(claveFecha(f)) });
    }
    return out;
  })();

  async function agregar() {
    if (!nueva?.nombre?.trim()) return;
    setError("");
    const { error: e } = await supabase.from("cronograma_actividades").insert({
      lead_id: lead.id, obra_id: lead.obra_id || null,
      nombre: nueva.nombre.trim(), duracion: Math.max(1, Number(nueva.duracion) || 1),
      orden: actividades.length,
    });
    if (e) { setError(e.message); return; }
    setNueva({ nombre: "", duracion: nueva.duracion });
    await cargar();
  }

  async function cambiar(a, campos) {
    await supabase.from("cronograma_actividades").update(campos).eq("id", a.id);
    await cargar();
  }

  async function quitar(a) {
    if (!window.confirm(`¿Borrar "${a.nombre}"?`)) return;
    await supabase.from("cronograma_actividades").delete().eq("id", a.id);
    await cargar();
  }

  async function unir(desde, hasta) {
    if (desde === hasta) return;
    const { error: e } = await supabase.from("cronograma_dependencias")
      .insert({ actividad_id: hasta, depende_de_id: desde, tipo: "FC" });
    if (e && !/duplicate/i.test(e.message)) setError(e.message);
    setUniendo(null);
    await cargar();
  }

  async function desunir(d) {
    await supabase.from("cronograma_dependencias").delete().eq("id", d.id);
    await cargar();
  }

  return (
    <div style={{ fontFamily: colors.font }}>
      <Volver onClick={() => setLead(null)} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: colors.ink }}>{lead.nombre}</div>
          <div style={{ fontSize: 11.5, color: colors.muted }}>
            {todas.length ? (
              <>
                Del {dia(plan.arranque)} al <strong style={{ color: colors.ink }}>{dia(plan.fin)}</strong> · {plan.duracion} días de trabajo
                {plan.previos > 0 && <> · {plan.previos} días de trabajos previos</>}
                {dentro && diaHoy > 0 && (
                  <> · hoy es el <strong style={{ color: colors.danger }}>día {diaHoy}</strong> de {plan.duracion}</>
                )}
                {dentro && diaHoy <= 0 && <> · la obra arranca en {Math.abs(diaHoy) + 1} días</>}
              </>
            ) : "Sin actividades todavía"}
          </div>
        </div>
        {todas.length > 0 && (
          <div style={{ display: "inline-flex", gap: 3, background: colors.neutralSoft, borderRadius: 7, padding: 3, marginLeft: "auto" }}>
            {[["fecha", "Fechas"], ["dia", "Días"]].map(([v, l]) => (
              <button key={v} onClick={() => setEscala(v)}
                style={{ padding: "4px 10px", borderRadius: 5, border: "none", cursor: "pointer", fontFamily: colors.font,
                  fontSize: 11.5, fontWeight: 600, background: escala === v ? "#fff" : "transparent",
                  color: escala === v ? colors.brand : colors.inkSoft }}>{l}</button>
            ))}
          </div>
        )}
        {editable && (
          <input type="date" value={lead.crono_inicio || hoy()} style={{ ...inputStyle, width: 150, padding: "6px 9px", fontSize: 12 }}
            onChange={async e => {
              await supabase.from("leads").update({ crono_inicio: e.target.value }).eq("id", lead.id);
              setLead(l => ({ ...l, crono_inicio: e.target.value }));
            }} />
        )}
      </div>

      {/* Que lo arme NOVA: las agrupaciones ya dicen QUÉ hay que hacer, con
          su plata adentro. Lo que falta es el orden y la duración, y eso es
          saber de obra —la estructura antes que la mampostería, las
          instalaciones antes del enlucido o hay que picar—. No sale de ningún
          dato: sale de haber hecho obras. */}
      {editable && obra?.id && (
        armando ? (
          <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 12, marginBottom: 12, display: "grid", gap: 9 }}>
            <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 8, alignItems: "end" }}>
              <div>
                <label style={{ fontSize: 10, color: colors.muted, fontWeight: 600, display: "block", marginBottom: 3 }}>¿CUÁNTO DURA LA OBRA?</label>
                <input type="number" min="1" max="60" value={armando.meses}
                  onChange={e => setArmando(v => ({ ...v, meses: Number(e.target.value) || 1 }))}
                  style={{ ...inputStyle, padding: "7px 9px" }} />
              </div>
              <div style={{ fontSize: 11.5, color: colors.muted, lineHeight: 1.5 }}>
                meses. NOVA parte las agrupaciones del presupuesto en actividades, les pone duración y las encadena
                en el orden real de una obra.
              </div>
            </div>

            {armando.propuesta && (
              <div style={{ background: colors.bg, borderRadius: 8, padding: 11 }}>
                <div style={{ fontSize: 12.5, color: colors.ink, lineHeight: 1.55, marginBottom: 6 }}>
                  <strong>{armando.propuesta.actividades.length}</strong> actividades,{" "}
                  <strong>{armando.propuesta.dependencias.length}</strong> dependencias.
                  La obra sale en <strong>{armando.propuesta.dias} días de trabajo</strong>,
                  con {armando.propuesta.criticas} en la ruta crítica.
                  {armando.propuesta.quitadas > 0 && (
                    <span style={{ color: colors.warning }}> Le quité {armando.propuesta.quitadas} dependencias que se mordían la cola.</span>
                  )}
                </div>
                <div style={{ maxHeight: 150, overflowY: "auto", fontSize: 11.5, color: colors.inkSoft, lineHeight: 1.6 }}>
                  {armando.propuesta.actividades.slice(0, 14).map(a => (
                    <div key={a.ref}>· {a.nombre} <span style={{ color: colors.muted }}>— {a.duracion} días</span></div>
                  ))}
                  {armando.propuesta.actividades.length > 14 && <div style={{ color: colors.muted }}>…y {armando.propuesta.actividades.length - 14} más</div>}
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {!armando.propuesta ? (
                <Button variant="primary" size="sm" disabled={pensando} onClick={async () => {
                  setError(""); setPensando(true);
                  const agrupaciones = await materiaPrima(obra.id);
                  const r = await proponerCronograma({ agrupaciones, meses: armando.meses, nombreObra: lead.nombre, cal });
                  setPensando(false);
                  if (r.error) { setError(r.error); return; }
                  setArmando(v => ({ ...v, propuesta: r }));
                }}>{pensando ? "NOVA está leyendo el presupuesto…" : "Que lo arme NOVA"}</Button>
              ) : (
                <>
                  <Button variant="primary" size="sm" disabled={pensando} onClick={async () => {
                    setPensando(true);
                    const r = await guardarPropuesta({ lead, obra, propuesta: armando.propuesta, quien: currentUser });
                    setPensando(false);
                    if (r.error) { setError(r.error); return; }
                    setArmando(null); await cargar();
                  }}>
                    {todas.length ? "Reemplazar el cronograma" : "Guardarlo"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setArmando(v => ({ ...v, propuesta: null }))}>Que lo piense de nuevo</Button>
                </>
              )}
              <Button variant="secondary" size="sm" onClick={() => setArmando(null)}>Cancelar</Button>
            </div>
            {todas.length > 0 && !armando.propuesta && (
              <div style={{ fontSize: 10.5, color: colors.warning }}>
                Ya hay un cronograma: si guardás uno nuevo, reemplaza al de ahora con todo lo que le hayas corregido.
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            <Button variant={todas.length ? "outline" : "primary"} size="sm"
              onClick={() => { setArmando({ meses: 6, propuesta: null }); setError(""); }}>
              {todas.length ? "Rearmarlo con NOVA" : "Que lo arme NOVA del presupuesto"}
            </Button>
            {todas.length > 0 && (
              <>
                {/* A veces hay que entregarlo: una fiscalización lo pide en
                    Project, un contrato público lo exige. Negarse obliga a
                    llevar dos cronogramas, y el segundo queda viejo siempre. */}
                <Button variant="outline" size="sm" onClick={() => bajarProject({
                  nombre: `Cronograma ${lead.nombre}`, actividades: todas, dependencias,
                  inicio: plan.inicio, fin: plan.fin, cal,
                })}>
                  Bajar para Project
                </Button>
                <Button variant="outline" size="sm" onClick={async () => {
                  const n = await aprenderDelCronograma(todas, currentUser);
                  setError(""); window.alert(`NOVA anotó la duración de ${n} actividades para la próxima obra.`);
                }}>
                  Que NOVA lo aprenda
                </Button>
              </>
            )}
          </div>
        )
      )}

      {plan.ciclos.length > 0 && (
        <Aviso>
          Hay {plan.ciclos.length} actividades esperándose entre sí —A espera a B que espera a A—, así que no
          se les puede calcular fecha. Quitá una de esas dependencias.
        </Aviso>
      )}

      {error && <div style={{ fontSize: 12, color: colors.danger, marginBottom: 8 }}>{error}</div>}

      {!todas.length ? (
        <Centro>
          Todavía no hay actividades. Empezá por las grandes —movimiento de tierra, estructura, mampostería— y
          después las partís.
        </Centro>
      ) : (
        <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(200px,1.4fr) 54px 80px 80px 58px minmax(220px,2fr) 30px",
            gap: 7, padding: "8px 12px", background: colors.bg, fontSize: 9, fontWeight: 700, color: colors.muted, letterSpacing: 0.3 }}>
            <span>ACTIVIDAD</span>
            <span style={{ textAlign: "center" }}>DÍAS</span>
            <span>EMPIEZA</span>
            <span>TERMINA</span>
            <span style={{ textAlign: "center" }}>HOLGURA</span>
            {/* La regla. Sin ella las barras flotan: se ve que una es más
                larga que otra y no cuándo empieza ninguna. */}
            <span style={{ position: "relative", height: 12 }}>
              {marcas.map((m, k) => (
                <span key={k} style={{ position: "absolute", left: `${m.x * 100}%`, transform: "translateX(-50%)",
                  fontSize: 8.5, color: m.dia === 1 ? colors.brand : colors.muted, whiteSpace: "nowrap",
                  fontWeight: m.dia === 1 ? 700 : 400 }}>
                  {escala === "fecha" ? dia(m.fecha) : (m.dia > 0 ? `d${m.dia}` : m.dia === 0 ? "" : `${m.dia}`)}
                </span>
              ))}
            </span>
            <span />
          </div>

          {todas.map(a => {
            const deps = dependencias.filter(d => d.actividad_id === a.id);
            return (
              <div key={a.id} style={{ display: "grid", gridTemplateColumns: "minmax(200px,1.4fr) 54px 80px 80px 58px minmax(220px,2fr) 30px",
                gap: 7, padding: "7px 12px", borderTop: `1px solid ${colors.neutralSoft}`, alignItems: "center", fontSize: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {a.critica && <span title="Ruta crítica: no tiene colchón" style={{ color: colors.danger, marginRight: 4 }}>●</span>}
                    {a.nombre}
                  </div>
                  {deps.length > 0 && (
                    <div style={{ fontSize: 10, color: colors.muted, marginTop: 1 }}>
                      {a.inicio_fijo && <span style={{ color: colors.brand }}>fija el {dia(a.inicio_fijo)} · </span>}
                      después de {deps.map(d => porId.get(d.depende_de_id)?.nombre || "?").join(", ")}
                      {editable && deps.map(d => (
                        <button key={d.id} onClick={() => desunir(d)} title="Quitar esta dependencia"
                          style={{ background: "none", border: "none", color: colors.border, cursor: "pointer", padding: "0 3px" }}>×</button>
                      ))}
                    </div>
                  )}
                </div>
                <input type="number" min="1" value={a.duracion} disabled={!editable}
                  onChange={e => cambiar(a, { duracion: Math.max(1, Number(e.target.value) || 1) })}
                  style={{ ...inputStyle, padding: "4px 6px", fontSize: 11.5, textAlign: "center" }} />
                <span style={{ color: colors.inkSoft, fontSize: 11.5 }}>{dia(a.inicio)}</span>
                <span style={{ color: colors.inkSoft, fontSize: 11.5 }}>{dia(a.fin)}</span>
                <span style={{ textAlign: "center", fontSize: 11.5, fontWeight: a.critica ? 700 : 400,
                  color: a.critica ? colors.danger : colors.muted }}>
                  {a.enCiclo ? "—" : a.critica ? "0" : `${a.holgura}d`}
                </span>

                {/* La barra. Es para lo que se abre esta pantalla. */}
                <div style={{ position: "relative", height: 16, background: colors.neutralSoft, borderRadius: 4 }}>
                  {/* Hoy, cruzando todas las barras: la pregunta que uno trae
                      al abrir un cronograma es dónde estamos parados. */}
                  {dentro && (
                    <div style={{ position: "absolute", top: -4, bottom: -4, left: `${posicion(hoyISO) * 100}%`,
                      width: 2, background: colors.danger, opacity: 0.75, zIndex: 1 }} />
                  )}
                  {a.inicio && (
                    <div title={`${dia(a.inicio)} → ${dia(a.fin)}${a.critica ? " · ruta crítica" : ` · ${a.holgura} días de colchón`}`}
                      style={{ position: "absolute", top: 0, bottom: 0,
                        left: `${posicion(a.inicio) * 100}%`, width: `${Math.max(largo(a) * 100, 2)}%`,
                        background: a.critica ? colors.danger : colors.brand, borderRadius: 4,
                        display: "flex", alignItems: "center", overflow: "hidden" }}>
                      {/* Lo hecho, adentro de la barra: se lee el atraso sin
                          comparar dos columnas de números. */}
                      {a.avance_pct > 0 && (
                        <div style={{ width: `${Math.min(100, a.avance_pct)}%`, height: "100%", background: "rgba(255,255,255,.45)" }} />
                      )}
                    </div>
                  )}
                </div>

                {editable && (
                  <div style={{ display: "flex", gap: 2 }}>
                    <button onClick={() => (uniendo ? unir(uniendo, a.id) : setUniendo(a.id))}
                      title={uniendo === a.id ? "Elegí ahora la que va después" : uniendo ? "Esta va después de la marcada" : "Marcar: lo que siga va después de esta"}
                      style={{ background: uniendo === a.id ? colors.brand : "none", border: "none",
                        color: uniendo === a.id ? "#fff" : colors.muted, borderRadius: 4, cursor: "pointer", display: "flex", padding: 2 }}>
                      <Link2 size={12} />
                    </button>
                    {/* Empezar antes del día uno: los permisos, el anticipo de
                        una importación, el levantamiento. Son del proyecto y
                        pasan antes de que la obra arranque; con fecha del día
                        uno corren todo lo demás y dan un plazo que no es. */}
                    <button onClick={() => {
                      const f = window.prompt(
                        a.inicio_fijo
                          ? "Fecha fija de inicio (vacío para que la calcule el cronograma):"
                          : "¿En qué fecha empieza? Puede ser antes del arranque de la obra —permisos, anticipos, importaciones.",
                        a.inicio_fijo || plan.arranque);
                      if (f === null) return;
                      cambiar(a, { inicio_fijo: f.trim() || null });
                    }} title={a.inicio_fijo ? `Empieza fijo el ${dia(a.inicio_fijo)}` : "Fijarle una fecha de inicio"}
                      style={{ background: "none", border: "none", color: a.inicio_fijo ? colors.brand : colors.muted,
                        cursor: "pointer", display: "flex", padding: 2 }}>
                      <CalendarClock size={12} />
                    </button>
                    <button onClick={() => quitar(a)} style={{ background: "none", border: "none", color: colors.muted, cursor: "pointer", display: "flex", padding: 2 }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editable && (
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          <input value={nueva?.nombre || ""} onChange={e => setNueva(v => ({ ...(v || { duracion: 5 }), nombre: e.target.value }))}
            onKeyDown={e => { if (e.key === "Enter") agregar(); }}
            placeholder="Nueva actividad. Ej: estructura de la planta baja"
            style={{ ...inputStyle, flex: 1, minWidth: 220 }} />
          <input type="number" min="1" value={nueva?.duracion || 5}
            onChange={e => setNueva(v => ({ ...(v || { nombre: "" }), duracion: Number(e.target.value) || 1 }))}
            style={{ ...inputStyle, width: 80 }} />
          <Button variant="primary" size="sm" onClick={agregar}><Plus size={13} /> Agregar</Button>
        </div>
      )}

      {uniendo && (
        <div style={{ fontSize: 11.5, color: colors.brand, marginTop: 8 }}>
          Marcaste <strong>{porId.get(uniendo)?.nombre}</strong>. Tocá el eslabón de la actividad que va después.
          <button onClick={() => setUniendo(null)} style={{ background: "none", border: "none", color: colors.muted, cursor: "pointer", marginLeft: 6, fontFamily: colors.font }}>cancelar</button>
        </div>
      )}

      {todas.length > 0 && (
        <div style={{ fontSize: 10.5, color: colors.muted, marginTop: 10, lineHeight: 1.55 }}>
          Las barras <span style={{ color: colors.danger, fontWeight: 700 }}>rojas</span> son la ruta crítica: no tienen
          colchón, y un día de atraso ahí es un día de atraso en la entrega. Las azules se pueden correr lo que diga
          su holgura sin mover la fecha de fin.
        </div>
      )}
    </div>
  );
}

const Volver = ({ onClick }) => (
  <button onClick={onClick} style={{ background: "none", border: "none", color: colors.inkSoft, fontSize: 12.5,
    cursor: "pointer", fontFamily: colors.font, display: "flex", alignItems: "center", gap: 4, padding: 0, marginBottom: 10 }}>
    <ChevronLeft size={14} /> Cronograma
  </button>
);

const Centro = ({ children }) => (
  <div style={{ textAlign: "center", padding: "40px 20px", color: colors.muted, fontSize: 13, lineHeight: 1.6,
    background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd }}>{children}</div>
);

const Aviso = ({ children }) => (
  <div style={{ fontSize: 12.5, color: colors.warning, background: colors.warningSoft, display: "flex", gap: 7,
    border: `1px solid ${colors.warningBorder}`, borderRadius: colors.radiusMd, padding: 13, marginBottom: 12 }}>
    <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
    <span>{children}</span>
  </div>
);
