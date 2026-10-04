import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Camera, Check, X, Eye, RotateCcw, ChevronLeft, ClipboardList, AlertTriangle } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import { esProyecto } from "../leads/tubo";
import {
  ESTADOS_OBS, PRIORIDADES_OBS, ORIGENES_OBS, ABIERTAS_OBS,
  cargarObservaciones, crearObservacion, guardarObservacion, borrarObservacion,
  marcarResuelta, verificar, reabrir, subirFotoObs, borrarFotoObs, enlacesDeFotosObs, asignarResponsables,
  notasDe, anotar, diasAbierta, resumenObservaciones, ordenarObservaciones,
} from "./observaciones";
import FotosAlVuelo from "./FotosAlVuelo";

// Observaciones de obra: lo que se ve en la recorrida y hay que arreglar.
//
// Está pensado para usarse caminando la obra con el teléfono en una mano: se
// elige la obra, se toca "+", se escribe una línea, se saca la foto y se
// sigue. Todo lo demás —responsable, fecha, prioridad— se puede poner después,
// sentado. Un formulario que pide seis campos parado frente al problema es un
// formulario que nadie usa y una observación que se pierde.
//
// Se cierra en dos pasos a propósito: quien arregla la marca RESUELTA, y quien
// va a mirar la marca VERIFICADA. Juntarlos en un botón es cómo se cierran
// cosas que siguen mal.

// Lo que se llena parado frente al problema, con el teléfono en una mano. Lo
// demás —cuándo se vio es hoy, el origen es la recorrida, si el cliente la ve
// se decide después— tiene un valor por defecto que acierta casi siempre y se
// cambia desde la observación ya creada. Cada campo de más en este formulario
// es una observación que no se anota.
const NUEVA = {
  titulo: "", detalle: "", ubicacion: "", prioridad: "media", origen: "recorrida",
  fecha_visto: new Date().toISOString().split("T")[0], fecha_limite: "",
  responsables: [], responsable_externo: "", visible_cliente: false,
  fotos: [],
};

const COLOR = { danger: colors.danger, warning: colors.warning, success: colors.success, brand: colors.brand, muted: colors.muted, inkSoft: colors.inkSoft };
const dia = f => (f ? new Date(`${String(f).slice(0, 10)}T12:00:00`).toLocaleDateString("es-EC", { day: "numeric", month: "short" }) : "");

export default function ModuloObservaciones({ currentUser, users = [], puede, nivelProyecto = () => null }) {
  const [proyectos, setProyectos] = useState([]);
  const [lead, setLead] = useState(null);
  const [observaciones, setObservaciones] = useState([]);
  const [fotos, setFotos] = useState({});
  const [enlaces, setEnlaces] = useState({});
  const [notas, setNotas] = useState([]);
  const [sinTablas, setSinTablas] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [abierta, setAbierta] = useState(null);
  const [nueva, setNueva] = useState(null);
  const [verCerradas, setVerCerradas] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState("");
  const [nota, setNota] = useState("");
  const camRef = useRef(null);
  const momentoRef = useRef("problema");

  const editable = !lead || nivelProyecto(lead.id) === "editar";

  // Las obras a las que esta persona entra. Se cargan una vez: la lista de
  // proyectos no cambia mientras se camina una obra.
  const [todos, setTodos] = useState([]);
  useEffect(() => {
    supabase.from("leads").select("id,nombre,tunel,resultado,obra_id").order("nombre").then(({ data }) => {
      setTodos((data || []).filter(l => l.resultado !== "perdido" && esProyecto(l)));
      setCargando(false);
    });
  }, []);
  // Se filtra al pintar: los accesos llegan después que la lista.
  useEffect(() => { setProyectos(todos.filter(l => !!nivelProyecto(l.id))); }, [todos, nivelProyecto]);

  const cargar = useCallback(async () => {
    if (!lead?.id) return;
    const r = await cargarObservaciones(lead.id);
    setSinTablas(r.sinTablas);
    setObservaciones(r.observaciones);
    setFotos(r.fotos);
    setEnlaces(await enlacesDeFotosObs(Object.values(r.fotos).flat()));
  }, [lead?.id]);
  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    if (abierta) notasDe(abierta).then(setNotas); else setNotas([]);
  }, [abierta]);

  async function hacer(fn) {
    setOcupado(true); setAviso("");
    const err = await fn();
    setOcupado(false);
    if (typeof err === "string" && err) { setAviso(err); return false; }
    await cargar();
    return true;
  }

  const chip = (texto, color, titulo) => (
    <span title={titulo} style={{ fontSize: 9.5, fontWeight: 700, color: "#fff", background: COLOR[color] || colors.muted,
      borderRadius: 10, padding: "2px 7px", whiteSpace: "nowrap" }}>{texto}</span>
  );

  // ── Elegir la obra ───────────────────────────────────────────────────────
  if (!lead) {
    return (
      <div style={{ fontFamily: colors.font }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: colors.ink, marginBottom: 4 }}>Observaciones de obra</div>
        <div style={{ fontSize: 12, color: colors.muted, marginBottom: 14, lineHeight: 1.5 }}>
          Lo que se ve en la recorrida y hay que arreglar. Se anota con una foto y se cierra con otra.
        </div>
        {cargando ? <div style={{ textAlign: "center", color: colors.muted, padding: "40px 0", fontSize: 13 }}>Cargando…</div>
          : !proyectos.length ? (
            <div style={{ textAlign: "center", color: colors.muted, padding: "50px 20px", fontSize: 13, background: colors.surface,
              border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <ClipboardList size={28} />
              Cuando un proyecto entre a Arquitectura o Construcción, aparece acá.
            </div>
          ) : (
            <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, overflow: "hidden" }}>
              {proyectos.map(l => (
                <div key={l.id} onClick={() => setLead(l)}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: 12, borderTop: `1px solid ${colors.neutralSoft}`, cursor: "pointer" }}>
                  <ClipboardList size={15} color={colors.muted} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: colors.ink }}>{l.nombre}</span>
                </div>
              ))}
            </div>
          )}
      </div>
    );
  }

  if (sinTablas) {
    return (
      <div style={{ fontFamily: colors.font }}>
        <button onClick={() => setLead(null)} style={{ background: "none", border: "none", color: colors.inkSoft, fontSize: 12.5, cursor: "pointer", fontFamily: colors.font, display: "flex", alignItems: "center", gap: 4, padding: 0, marginBottom: 10 }}>
          <ChevronLeft size={14} /> Observaciones
        </button>
        <div style={{ fontSize: 12.5, color: colors.warning, background: colors.warningSoft, border: `1px solid ${colors.warningBorder}`, borderRadius: colors.radiusMd, padding: 14 }}>
          Falta correr la migración 062 para usar las observaciones de obra.
        </div>
      </div>
    );
  }

  const r = resumenObservaciones(observaciones);
  const lista = ordenarObservaciones(observaciones)
    .filter(o => verCerradas || ABIERTAS_OBS.includes(o.estado));
  const hoyISO = new Date().toISOString().split("T")[0];

  return (
    <div style={{ fontFamily: colors.font }}>
      <button onClick={() => { setLead(null); setObservaciones([]); setAbierta(null); }}
        style={{ background: "none", border: "none", color: colors.inkSoft, fontSize: 12.5, cursor: "pointer", fontFamily: colors.font, display: "flex", alignItems: "center", gap: 4, padding: 0, marginBottom: 10 }}>
        <ChevronLeft size={14} /> Observaciones
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: colors.ink, flex: 1, minWidth: 140 }}>{lead.nombre}</div>
        {editable && <Button variant="primary" size="sm" onClick={() => setNueva({ ...NUEVA })}><Plus size={13} /> Observación</Button>}
      </div>

      {/* Los números que dicen cómo va la obra. El de la más vieja es el que
          incomoda, y por eso está. */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", background: colors.bg, borderRadius: colors.radiusMd, padding: "10px 13px", marginBottom: 12 }}>
        {[["ABIERTAS", r.abiertas, r.abiertas ? colors.danger : colors.muted],
          ["EN PROCESO", r.enProceso, colors.warning],
          ["POR VERIFICAR", r.porVerificar, colors.brand],
          ["VERIFICADAS", r.verificadas, colors.success]].map(([k, v, c]) => (
          <div key={k}>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: colors.muted, letterSpacing: 0.3 }}>{k}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: c }}>{v}</div>
          </div>
        ))}
        {r.masVieja > 0 && (
          <div>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: colors.muted, letterSpacing: 0.3 }}>LA MÁS VIEJA</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: r.masVieja > 30 ? colors.danger : colors.inkSoft }}>{r.masVieja} días</div>
          </div>
        )}
      </div>

      {r.vencidas > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, background: colors.warningSoft, border: `1px solid ${colors.warningBorder}`,
          borderRadius: colors.radiusMd, padding: "8px 11px", marginBottom: 10, fontSize: 12, color: colors.warning, fontWeight: 600 }}>
          <AlertTriangle size={13} /> {r.vencidas} {r.vencidas === 1 ? "pasó" : "pasaron"} la fecha que se había comprometido.
        </div>
      )}

      {aviso && <div style={{ fontSize: 12, color: colors.danger, marginBottom: 8 }}>{aviso}</div>}

      {/* Una observación nueva: lo mínimo para anotarla parada frente al
          problema. El resto se completa después, sentado. */}
      {nueva && (
        <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 13, marginBottom: 12, display: "grid", gap: 9 }}>
          {/* La foto va primero y se saca acá, no después: parado frente a la
              fisura uno tiene la cámara en la mano, y "después le saco una"
              es como se llena el módulo de observaciones sin fotos. */}
          <FotosAlVuelo fotos={nueva.fotos} onCambio={f => setNueva(n => ({ ...n, fotos: f }))} />

          <input autoFocus value={nueva.titulo} onChange={e => setNueva(n => ({ ...n, titulo: e.target.value }))}
            placeholder="¿Qué se observó? Ej: junta mal tomada en baño 2" style={inputStyle} />
          <input value={nueva.ubicacion} onChange={e => setNueva(n => ({ ...n, ubicacion: e.target.value }))}
            placeholder="¿Dónde? Planta baja, eje 3…" style={inputStyle} />

          <div style={{ display: "flex", gap: 5 }}>
            {Object.entries(PRIORIDADES_OBS).map(([id, p]) => {
              const puesta = nueva.prioridad === id;
              return (
                <button key={id} onClick={() => setNueva(n => ({ ...n, prioridad: id }))}
                  style={{ flex: 1, border: `1px solid ${puesta ? (COLOR[p.color] || colors.brand) : colors.border}`,
                    background: puesta ? (COLOR[p.color] || colors.brand) : "#fff",
                    color: puesta ? "#fff" : colors.inkSoft, borderRadius: 8, padding: "7px 4px",
                    fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: colors.font }}>
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Varios, porque en obra casi nunca es uno: la mira el residente y
              la tapa el albañil. Al que no quedaba anotado había que avisarle
              por WhatsApp y no veía nada en su pantalla. */}
          <div>
            <label style={{ fontSize: 10, color: colors.muted, display: "block", marginBottom: 3 }}>¿QUIÉN LA ARREGLA?</label>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {users.map(u => {
                const puesto = nueva.responsables.some(r => String(r.id) === String(u.id));
                return (
                  <button key={u.id}
                    onClick={() => setNueva(n => ({ ...n, responsables: puesto
                      ? n.responsables.filter(r => String(r.id) !== String(u.id))
                      : [...n.responsables, { id: u.id, name: u.name }] }))}
                    style={{ border: `1px solid ${puesto ? colors.brand : colors.border}`,
                      background: puesto ? colors.brand : "#fff", color: puesto ? "#fff" : colors.inkSoft,
                      borderRadius: 20, padding: "4px 11px", fontSize: 11.5, fontWeight: 600,
                      cursor: "pointer", fontFamily: colors.font }}>
                    {u.name}
                  </button>
                );
              })}
            </div>
            <input value={nueva.responsable_externo} onChange={e => setNueva(n => ({ ...n, responsable_externo: e.target.value }))}
              placeholder="O un contratista de afuera" style={{ ...inputStyle, marginTop: 6 }} />
          </div>

          <div style={{ display: "flex", gap: 6 }}>
            <Button variant="primary" size="sm" disabled={ocupado || !nueva.titulo.trim()}
              onClick={async () => {
                setOcupado(true);
                const res = await crearObservacion(lead, { ...nueva, obra_id: lead.obra_id || null,
                  responsable_id: nueva.responsables[0]?.id || "",
                  responsable_nombre: nueva.responsables[0]?.name || null }, currentUser);
                if (res.error) { setOcupado(false); setAviso(res.error); return; }
                // Las fotos y los responsables van con la observación recién
                // creada: así nadie tiene que volver a entrar a completarla.
                for (const f of nueva.fotos) {
                  await subirFotoObs(res.observacion, f, { momento: "problema", quien: currentUser });
                }
                if (nueva.responsables.length) await asignarResponsables(res.observacion.id, nueva.responsables);
                setOcupado(false);
                setNueva(null); setAbierta(res.observacion.id); await cargar();
              }}>{ocupado ? "Guardando…" : "Guardar"}</Button>
            <Button variant="secondary" size="sm" onClick={() => setNueva(null)}>Cancelar</Button>
          </div>
        </div>
      )}

      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: colors.inkSoft, cursor: "pointer", marginBottom: 8 }}>
        <input type="checkbox" checked={verCerradas} onChange={e => setVerCerradas(e.target.checked)} /> Ver también las cerradas
      </label>

      {!lista.length && (
        <div style={{ textAlign: "center", color: colors.muted, padding: "40px 20px", fontSize: 13, lineHeight: 1.6,
          background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd }}>
          <Check size={24} style={{ marginBottom: 6 }} />
          <div>{observaciones.length ? "No queda ninguna abierta." : "Todavía no hay observaciones en esta obra."}</div>
        </div>
      )}

      {lista.map(o => {
        const esta = abierta === o.id;
        const e = ESTADOS_OBS[o.estado] || ESTADOS_OBS.abierta;
        const vencida = o.fecha_limite && o.fecha_limite < hoyISO && ABIERTAS_OBS.includes(o.estado);
        const suyas = fotos[o.id] || [];
        const delProblema = suyas.filter(f => f.momento === "problema");
        const deLaSolucion = suyas.filter(f => f.momento === "solucion");
        const dias = diasAbierta(o);

        return (
          <div key={o.id} style={{ background: colors.surface, border: `1px solid ${vencida ? colors.warningBorder : colors.border}`,
            borderRadius: colors.radiusMd, padding: "11px 13px", marginBottom: 8 }}>
            <div onClick={() => setAbierta(esta ? null : o.id)} style={{ display: "flex", gap: 10, cursor: "pointer", alignItems: "flex-start" }}>
              {delProblema[0] && enlaces[delProblema[0].id] && (
                <img src={enlaces[delProblema[0].id]} alt="" style={{ width: 42, height: 42, objectFit: "cover", borderRadius: 7, flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: colors.ink, overflowWrap: "anywhere" }}>{o.titulo}</div>
                <div style={{ fontSize: 10.5, color: colors.muted, marginTop: 1 }}>
                  {o.ubicacion ? `${o.ubicacion} · ` : ""}vista el {dia(o.fecha_visto)}
                  {ABIERTAS_OBS.includes(o.estado) && dias > 0 && ` · ${dias} ${dias === 1 ? "día" : "días"}`}
                  {o.responsable_nombre || o.responsable_externo ? ` · ${o.responsable_nombre || o.responsable_externo}` : ""}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
                {chip(e.label.toUpperCase(), e.color, e.pista)}
                {o.prioridad === "urgente" && chip("URGENTE", "danger")}
                {vencida && chip(`VENCIÓ ${dia(o.fecha_limite)}`, "warning")}
              </div>
            </div>

            {esta && (
              <div style={{ marginTop: 10, paddingTop: 9, borderTop: `1px solid ${colors.neutralSoft}` }}>
                {o.detalle && <div style={{ fontSize: 12.5, color: colors.inkSoft, marginBottom: 8, lineHeight: 1.5 }}>{o.detalle}</div>}

                {/* El antes y el después, uno al lado del otro: es lo que
                    convierte "ya lo arreglé" en un hecho. */}
                {[["problema", "CÓMO ESTABA", delProblema], ["solucion", "CÓMO QUEDÓ", deLaSolucion]].map(([momento, titulo, cuales]) => (
                  <div key={momento} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 9.5, fontWeight: 700, color: colors.muted, letterSpacing: 0.4, marginBottom: 4 }}>{titulo}</div>
                    {cuales.length > 0 && (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))", gap: 5, marginBottom: 5 }}>
                        {cuales.map(f => (
                          <div key={f.id} style={{ position: "relative" }}>
                            {enlaces[f.id]
                              ? <a href={enlaces[f.id]} target="_blank" rel="noreferrer">
                                  <img src={enlaces[f.id]} alt={f.descripcion || titulo}
                                    style={{ width: "100%", height: 72, objectFit: "cover", borderRadius: 6, border: `1px solid ${colors.border}`, display: "block" }} />
                                </a>
                              : <div style={{ width: "100%", height: 72, borderRadius: 6, background: colors.neutralSoft }} />}
                            {editable && (
                              <button onClick={() => { if (window.confirm("¿Quitar esta foto?")) hacer(() => borrarFotoObs(f)); }}
                                style={{ position: "absolute", top: 3, right: 3, background: "rgba(17,24,39,0.7)", border: "none", borderRadius: 5, color: "#fff", cursor: "pointer", display: "flex", padding: 2 }}>
                                <X size={10} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {editable && (
                      <button onClick={() => { momentoRef.current = momento; setAbierta(o.id); camRef.current?.click(); }}
                        style={{ width: "100%", background: colors.bg, border: `1px dashed ${colors.border}`, borderRadius: 8, padding: "8px",
                          color: colors.inkSoft, fontSize: 11.5, cursor: "pointer", fontFamily: colors.font,
                          display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                        <Camera size={12} /> {momento === "problema" ? "Foto del problema" : "Foto de cómo quedó"}
                      </button>
                    )}
                  </div>
                ))}

                {/* Lo que se conversó. */}
                {notas.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    {notas.map(x => (
                      <div key={x.id} style={{ fontSize: 11.5, color: colors.ink, padding: "3px 0", borderTop: `1px solid ${colors.neutralSoft}` }}>
                        <span style={{ color: x.de_cliente ? colors.brand : colors.muted, fontWeight: 600 }}>
                          {x.autor_nombre || "—"}{x.de_cliente ? " (cliente)" : ""}
                        </span>{" "}
                        {x.texto}
                      </div>
                    ))}
                  </div>
                )}
                {editable && (
                  <div style={{ display: "flex", gap: 5, marginBottom: 9 }}>
                    <input value={nota} onChange={ev => setNota(ev.target.value)}
                      onKeyDown={async ev => { if (ev.key === "Enter" && nota.trim()) { await anotar(o.id, nota, currentUser); setNota(""); setNotas(await notasDe(o.id)); } }}
                      placeholder="Anotar algo…" style={{ ...inputStyle, flex: 1, minWidth: 0, padding: "6px 9px", fontSize: 12 }} />
                  </div>
                )}

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {editable && o.estado === "abierta" && (
                    <Button variant="outline" size="sm" disabled={ocupado} onClick={() => hacer(() => guardarObservacion(o.id, { estado: "en_proceso" }))}>
                      La están arreglando
                    </Button>
                  )}
                  {editable && ["abierta", "en_proceso"].includes(o.estado) && (
                    <Button variant="primary" size="sm" disabled={ocupado}
                      onClick={() => {
                        if (!deLaSolucion.length && !window.confirm("No hay foto de cómo quedó. ¿Marcarla resuelta igual?")) return;
                        hacer(() => marcarResuelta(o, currentUser));
                      }}>
                      <Check size={12} /> Resuelta
                    </Button>
                  )}
                  {editable && o.estado === "resuelta" && (
                    <>
                      <Button variant="primary" size="sm" disabled={ocupado} onClick={() => hacer(() => verificar(o, currentUser))}>
                        <Eye size={12} /> La fui a ver: quedó bien
                      </Button>
                      <Button variant="secondary" size="sm" disabled={ocupado}
                        onClick={() => { const m = window.prompt("¿Qué sigue mal?", ""); if (m === null) return; hacer(() => reabrir(o, currentUser, m)); }}>
                        <RotateCcw size={12} /> No quedó bien
                      </Button>
                    </>
                  )}
                  {editable && (
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: colors.inkSoft, cursor: "pointer" }}>
                      <input type="checkbox" checked={!!o.visible_cliente}
                        onChange={ev => hacer(() => guardarObservacion(o.id, { visible_cliente: ev.target.checked }))} />
                      La ve el cliente
                    </label>
                  )}
                  {editable && (
                    <button onClick={() => { if (window.confirm(`¿Borrar "${o.titulo}"? Se van también sus fotos.`)) hacer(() => borrarObservacion(o.id)); }}
                      style={{ marginLeft: "auto", background: "none", border: "none", color: colors.danger, fontSize: 11.5, cursor: "pointer", fontFamily: colors.font }}>
                      Borrar
                    </button>
                  )}
                </div>

                {o.verificada_at && (
                  <div style={{ fontSize: 10.5, color: colors.success, marginTop: 6 }}>
                    Verificada por {o.verificada_nombre || "—"} el {dia(o.verificada_at)}.
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Una sola entrada de cámara para todas: en el teléfono va directo a la
          trasera, en la computadora abre el explorador. */}
      <input ref={camRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }}
        onChange={async ev => {
          const archivo = ev.target.files?.[0]; ev.target.value = "";
          const o = observaciones.find(x => x.id === abierta);
          if (!archivo || !o) return;
          setOcupado(true);
          const res = await subirFotoObs(o, archivo, { momento: momentoRef.current, quien: currentUser });
          setOcupado(false);
          if (res.error) { setAviso(res.error); return; }
          await cargar();
        }} />
    </div>
  );
}
