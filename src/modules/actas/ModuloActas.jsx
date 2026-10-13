import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, Plus, Trash2, Send, Check, Camera, Users } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import { actasDe, contenidoDe, abrirActa, guardarActa, borrarActa, guardarFila, borrarFila,
  convocadosDe, guardarConvocado, borrarConvocado, subirFoto, enlacesDeFotos,
  correosDe, ESTADOS, ESTADO_COMPROMISO, SIN_106 } from "./actas";

// Las actas de reunión de obra.
//
// La pantalla está ordenada como transcurre la reunión, que no es como está
// ordenado el documento: primero lo que quedó pendiente de la anterior —es lo
// primero que se mira y lo que más se discute—, después lo nuevo, y al final
// lo administrativo. Un formulario ordenado como el papel obliga a saltar
// mientras se habla, y entonces se llena después, de memoria y mal.

const hoy = () => new Date().toISOString().slice(0, 10);
const dia = f => (f ? new Date(`${f}T12:00:00`).toLocaleDateString("es-EC", { day: "numeric", month: "short", year: "numeric" }) : "");

const titulito = { fontSize: 9.5, fontWeight: 700, color: colors.muted, letterSpacing: 0.3, display: "block", marginBottom: 4 };
const caja = { background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 13, marginBottom: 12 };

export default function ModuloActas({ currentUser, puede, nivelProyecto }) {
  const [proyectos, setProyectos] = useState([]);
  const [lead, setLead] = useState(null);
  const [actas, setActas] = useState([]);
  const [sinTablas, setSinTablas] = useState(false);
  const [abierta, setAbierta] = useState(null);
  const [cont, setCont] = useState({ asistentes: [], temas: [], compromisos: [], fotos: [] });
  const [enlaces, setEnlaces] = useState({});
  const [convocados, setConvocados] = useState([]);
  const [verConvocados, setVerConvocados] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [nuevo, setNuevo] = useState({ tema: "", compromiso: "", convocado: { nombre: "", email: "", empresa: "", cargo: "" } });

  useEffect(() => {
    supabase.from("leads").select("id,nombre,tunel,resultado,obra_id").order("nombre").then(({ data }) => {
      setProyectos((data || []).filter(l => l.resultado !== "perdido" && (l.tunel || "lead") !== "lead"));
    });
  }, []);

  const cargarActas = useCallback(async id => {
    const { actas: as, sinTablas: falta } = await actasDe(id);
    setActas(as); setSinTablas(falta);
    setConvocados(await convocadosDe(id));
  }, []);
  useEffect(() => { if (lead?.id) cargarActas(lead.id); }, [lead?.id, cargarActas]);

  const cargarActa = useCallback(async id => {
    const c = await contenidoDe(id);
    setCont(c);
    setEnlaces(await enlacesDeFotos(c.fotos));
  }, []);
  useEffect(() => { if (abierta?.id) cargarActa(abierta.id); }, [abierta?.id, cargarActa]);

  const editable = !lead || nivelProyecto?.(lead.id) === "editar";
  // Revisar y enviar es del director: un acta la escribe quien lleva la obra,
  // pero el documento que sale con el nombre de la empresa lo aprueba quien
  // responde por ella.
  const puedeEnviar = puede ? puede("obras.aprobar") : true;

  async function tocarActa(campos) {
    const e = await guardarActa(abierta.id, campos);
    if (e) { setError(e); return false; }
    setError("");
    setAbierta(a => ({ ...a, ...campos }));
    setActas(as => as.map(x => (x.id === abierta.id ? { ...x, ...campos } : x)));
    return true;
  }

  async function agregar(tabla, fila, lista) {
    const { fila: puesta, error: e } = await guardarFila(tabla, { ...fila, acta_id: abierta.id, orden: cont[lista].length });
    if (e) { setError(e); return; }
    setError(""); setCont(c => ({ ...c, [lista]: [...c[lista], puesta] }));
  }

  async function tocarFila(tabla, lista, id, campos) {
    const { error: e } = await guardarFila(tabla, { id, ...campos });
    if (e) { setError(e); return; }
    setError("");
    setCont(c => ({ ...c, [lista]: c[lista].map(x => (x.id === id ? { ...x, ...campos } : x)) }));
  }

  async function quitarFila(tabla, lista, id) {
    const e = await borrarFila(tabla, id);
    if (e) { setError(e); return; }
    setCont(c => ({ ...c, [lista]: c[lista].filter(x => x.id !== id) }));
  }

  // ── Elegir proyecto ──────────────────────────────────────────────────────
  if (!lead) {
    return (
      <div style={{ fontFamily: colors.font }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: colors.ink, marginBottom: 4 }}>Actas de reunión</div>
        <div style={{ fontSize: 12.5, color: colors.muted, marginBottom: 14, lineHeight: 1.5 }}>
          Lo que se decidió en la reunión de obra, con sus compromisos. Cada acta trae de vuelta lo que la
          anterior dejó pendiente.
        </div>
        <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, overflow: "hidden" }}>
          {proyectos.map(p => (
            <button key={p.id} onClick={() => setLead(p)}
              style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none",
                borderTop: `1px solid ${colors.neutralSoft}`, padding: "11px 13px", cursor: "pointer",
                fontFamily: colors.font, fontSize: 13, color: colors.ink }}>
              {p.nombre}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (sinTablas) {
    return (
      <div style={{ fontFamily: colors.font }}>
        <Volver onClick={() => setLead(null)} />
        <div style={{ fontSize: 12.5, color: colors.warning, background: colors.warningSoft,
          border: `1px solid ${colors.warningBorder}`, borderRadius: colors.radiusMd, padding: 14 }}>{SIN_106}</div>
      </div>
    );
  }

  // ── Un acta abierta ──────────────────────────────────────────────────────
  if (abierta) {
    const cerrada = abierta.estado === "enviada";
    const sePuede = editable && !cerrada;
    const correos = correosDe(cont.asistentes);
    const arrastrados = cont.compromisos.filter(c => c.viene_de);
    const nuevos = cont.compromisos.filter(c => !c.viene_de);

    return (
      <div style={{ fontFamily: colors.font }}>
        <Volver onClick={() => { setAbierta(null); cargarActas(lead.id); }} texto={`Actas · ${lead.nombre}`} />

        <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", marginBottom: 12 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: colors.ink }}>Acta N° {abierta.numero}</div>
          <Chip estado={abierta.estado} />
          <div style={{ flex: 1 }} />
          {sePuede && puedeEnviar && abierta.estado === "borrador" && (
            <Button variant="outline" size="sm" disabled={ocupado} onClick={async () => {
              await tocarActa({ estado: "revisada", revisada_at: new Date().toISOString(),
                revisada_por: currentUser?.id ?? null, revisada_nombre: currentUser?.name || null });
              setAviso("Revisada. Ya se puede enviar a los correos.");
            }}><Check size={13} /> Dar el visto</Button>
          )}
          {sePuede && puedeEnviar && abierta.estado === "revisada" && (
            <Button variant="primary" size="sm" disabled={ocupado || !correos.length} onClick={() => enviar()}>
              <Send size={13} /> {ocupado ? "Enviando…" : `Enviar a ${correos.length}`}
            </Button>
          )}
        </div>

        {aviso && <div style={{ fontSize: 12, color: colors.brand, marginBottom: 10 }}>{aviso}</div>}
        {error && <div style={{ fontSize: 12, color: colors.danger, marginBottom: 10 }}>{error}</div>}
        {cerrada && (
          <div style={{ fontSize: 12, color: colors.inkSoft, background: colors.bg, borderRadius: colors.radiusMd,
            padding: "9px 12px", marginBottom: 12, lineHeight: 1.5 }}>
            Esta acta se envió el {dia(String(abierta.enviada_at).slice(0, 10))} a{" "}
            {(abierta.enviada_a || []).length} {(abierta.enviada_a || []).length === 1 ? "correo" : "correos"} y
            ya no se toca. Lo que haya que corregir va en la próxima: un acta que cambia después de enviada no
            sirve como prueba de nada.
          </div>
        )}

        {/* 1 · CUÁNDO Y DÓNDE */}
        <div style={caja}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 9 }}>
            <Campo label="FECHA"><input type="date" value={abierta.fecha || ""} disabled={!sePuede}
              onChange={e => tocarActa({ fecha: e.target.value })} style={inputStyle} /></Campo>
            <Campo label="EMPIEZA"><input type="time" value={abierta.hora_inicio || ""} disabled={!sePuede}
              onChange={e => tocarActa({ hora_inicio: e.target.value || null })} style={inputStyle} /></Campo>
            <Campo label="TERMINA"><input type="time" value={abierta.hora_fin || ""} disabled={!sePuede}
              onChange={e => tocarActa({ hora_fin: e.target.value || null })} style={inputStyle} /></Campo>
            <Campo label="LUGAR"><input defaultValue={abierta.lugar || ""} disabled={!sePuede}
              placeholder="Ej: oficina de obra" onBlur={e => tocarActa({ lugar: e.target.value || null })}
              style={inputStyle} /></Campo>
          </div>
        </div>

        {/* 2 · LO QUE QUEDÓ PENDIENTE DE LA VEZ PASADA.
            Va primero porque es lo primero que se mira en la reunión y lo que
            más se discute. Un acta que lo deja para el final lo deja sin
            revisar, y ahí la cadena se corta. */}
        {arrastrados.length > 0 && (
          <div style={{ ...caja, borderColor: colors.warning }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.ink, marginBottom: 3 }}>
              Viene de la reunión anterior · {arrastrados.length}
            </div>
            <div style={{ fontSize: 11, color: colors.muted, marginBottom: 9, lineHeight: 1.45 }}>
              Lo primero de la reunión: compromiso por compromiso, qué se cumplió y qué sigue pendiente.
            </div>
            {arrastrados.map(c => <Compromiso key={c.id} c={c} sePuede={sePuede}
              onTocar={campos => tocarFila("acta_compromisos", "compromisos", c.id, campos)}
              onQuitar={() => quitarFila("acta_compromisos", "compromisos", c.id)} quien={currentUser} />)}
          </div>
        )}

        {/* 3 · QUIÉN VINO */}
        <div style={caja}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
            <Users size={14} color={colors.muted} />
            <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.ink, flex: 1 }}>
              Asistentes · {cont.asistentes.filter(a => a.asistio).length} de {cont.asistentes.length}
            </div>
            {editable && (
              <Button variant="secondary" size="sm" onClick={() => setVerConvocados(v => !v)}>
                Los de siempre
              </Button>
            )}
          </div>
          {/* El correo vive en el asistente: es a quien se le manda el acta. */}
          {cont.asistentes.map(a => (
            <div key={a.id} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
              <input type="checkbox" checked={!!a.asistio} disabled={!sePuede} title="¿Vino?"
                onChange={e => tocarFila("acta_asistentes", "asistentes", a.id, { asistio: e.target.checked })} />
              <input defaultValue={a.nombre} disabled={!sePuede} placeholder="Nombre"
                onBlur={e => tocarFila("acta_asistentes", "asistentes", a.id, { nombre: e.target.value })}
                style={{ ...inputStyle, flex: "1 1 130px", minWidth: 100, fontSize: 12, padding: "5px 8px", height: 28,
                  color: a.asistio ? colors.ink : colors.muted }} />
              <input defaultValue={a.empresa || ""} disabled={!sePuede} placeholder="Empresa"
                onBlur={e => tocarFila("acta_asistentes", "asistentes", a.id, { empresa: e.target.value || null })}
                style={{ ...inputStyle, flex: "1 1 110px", minWidth: 90, fontSize: 12, padding: "5px 8px", height: 28 }} />
              <input defaultValue={a.email || ""} disabled={!sePuede} placeholder="correo@…" type="email"
                onBlur={e => tocarFila("acta_asistentes", "asistentes", a.id, { email: e.target.value || null })}
                style={{ ...inputStyle, flex: "1 1 150px", minWidth: 120, fontSize: 12, padding: "5px 8px", height: 28 }} />
              <label title="Recibe el acta por correo" style={{ fontSize: 10.5, color: colors.muted, display: "flex", gap: 3, alignItems: "center" }}>
                <input type="checkbox" checked={!!a.recibe} disabled={!sePuede}
                  onChange={e => tocarFila("acta_asistentes", "asistentes", a.id, { recibe: e.target.checked })} />
                recibe
              </label>
              {sePuede && (
                <button onClick={() => quitarFila("acta_asistentes", "asistentes", a.id)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: colors.muted, display: "flex" }}>
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
          {sePuede && (
            <Button variant="secondary" size="sm" style={{ marginTop: 5 }}
              onClick={() => agregar("acta_asistentes", { nombre: "", asistio: true, recibe: true }, "asistentes")}>
              <Plus size={12} /> Agregar asistente
            </Button>
          )}
          {!cont.asistentes.some(a => !a.asistio) && cont.asistentes.length > 0 && (
            <div style={{ fontSize: 10.5, color: colors.muted, marginTop: 6 }}>
              Destildá a los que no vinieron: un convocado que falta tres reuniones seguidas es un dato, y es
              el que después explica por qué algo no se decidió.
            </div>
          )}

          {verConvocados && editable && (
            <div style={{ borderTop: `1px solid ${colors.neutralSoft}`, marginTop: 10, paddingTop: 10 }}>
              <div style={{ fontSize: 11.5, color: colors.muted, marginBottom: 7, lineHeight: 1.45 }}>
                La gente que siempre va a esta obra. Se carga una vez y entra sola en cada acta nueva — escribir
                ocho nombres y ocho correos en cada reunión es lo que hace que a la tercera acta alguien deje
                de llevarlas.
              </div>
              {convocados.map(c => (
                <div key={c.id} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 3, fontSize: 12 }}>
                  <span style={{ flex: 1, color: colors.ink }}>{c.nombre}</span>
                  <span style={{ color: colors.muted, fontSize: 11 }}>{c.empresa}</span>
                  <span style={{ color: colors.muted, fontSize: 11 }}>{c.email}</span>
                  <button onClick={async () => { await borrarConvocado(c.id); setConvocados(await convocadosDe(lead.id)); }}
                    style={{ background: "none", border: "none", cursor: "pointer", color: colors.muted, display: "flex" }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
              <div style={{ display: "flex", gap: 6, marginTop: 7, flexWrap: "wrap" }}>
                <input value={nuevo.convocado.nombre} placeholder="Nombre"
                  onChange={e => setNuevo(v => ({ ...v, convocado: { ...v.convocado, nombre: e.target.value } }))}
                  style={{ ...inputStyle, flex: "1 1 120px", fontSize: 12, padding: "5px 8px", height: 28 }} />
                <input value={nuevo.convocado.empresa} placeholder="Empresa"
                  onChange={e => setNuevo(v => ({ ...v, convocado: { ...v.convocado, empresa: e.target.value } }))}
                  style={{ ...inputStyle, flex: "1 1 100px", fontSize: 12, padding: "5px 8px", height: 28 }} />
                <input value={nuevo.convocado.email} placeholder="correo@…" type="email"
                  onChange={e => setNuevo(v => ({ ...v, convocado: { ...v.convocado, email: e.target.value } }))}
                  style={{ ...inputStyle, flex: "1 1 150px", fontSize: 12, padding: "5px 8px", height: 28 }} />
                <Button variant="secondary" size="sm" disabled={!nuevo.convocado.nombre.trim()} onClick={async () => {
                  const { error: e } = await guardarConvocado({ ...nuevo.convocado, lead_id: lead.id, orden: convocados.length });
                  if (e) { setError(e); return; }
                  setNuevo(v => ({ ...v, convocado: { nombre: "", email: "", empresa: "", cargo: "" } }));
                  setConvocados(await convocadosDe(lead.id));
                }}><Plus size={12} /> Agregar</Button>
              </div>
            </div>
          )}
        </div>

        {/* 4 · TEMAS */}
        <div style={caja}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.ink, marginBottom: 3 }}>Temas tratados</div>
          <div style={{ fontSize: 11, color: colors.muted, marginBottom: 9, lineHeight: 1.45 }}>
            Qué se trató y <strong>qué se resolvió</strong>. Lo resuelto va aparte de lo conversado a propósito:
            un acta que narra no sirve para decidir nada.
          </div>
          {cont.temas.map(t => (
            <div key={t.id} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: `1px solid ${colors.neutralSoft}` }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input defaultValue={t.titulo} disabled={!sePuede} placeholder="Tema"
                  onBlur={e => tocarFila("acta_temas", "temas", t.id, { titulo: e.target.value })}
                  style={{ ...inputStyle, flex: 1, fontSize: 12.5, fontWeight: 600, padding: "5px 8px", height: 28 }} />
                {sePuede && (
                  <button onClick={() => quitarFila("acta_temas", "temas", t.id)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: colors.muted, display: "flex" }}>
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
              <textarea defaultValue={t.detalle || ""} disabled={!sePuede} rows={2} placeholder="Qué se trató"
                onBlur={e => tocarFila("acta_temas", "temas", t.id, { detalle: e.target.value || null })}
                style={{ ...inputStyle, width: "100%", marginTop: 4, fontSize: 12, padding: "6px 8px", resize: "vertical" }} />
              <textarea defaultValue={t.resuelto || ""} disabled={!sePuede} rows={2} placeholder="Qué se resolvió"
                onBlur={e => tocarFila("acta_temas", "temas", t.id, { resuelto: e.target.value || null })}
                style={{ ...inputStyle, width: "100%", marginTop: 4, fontSize: 12, padding: "6px 8px", resize: "vertical",
                  borderColor: t.resuelto ? colors.brand : colors.border }} />
            </div>
          ))}
          {sePuede && (
            <div style={{ display: "flex", gap: 6 }}>
              <input value={nuevo.tema} placeholder="Nuevo tema. Enter para agregar"
                onChange={e => setNuevo(v => ({ ...v, tema: e.target.value }))}
                onKeyDown={async e => {
                  if (e.key !== "Enter" || !nuevo.tema.trim()) return;
                  const t = nuevo.tema; setNuevo(v => ({ ...v, tema: "" }));
                  await agregar("acta_temas", { titulo: t.trim() }, "temas");
                }}
                style={{ ...inputStyle, flex: 1, fontSize: 12.5, padding: "6px 9px" }} />
              <Button variant="secondary" size="sm" disabled={!nuevo.tema.trim()} onClick={async () => {
                const t = nuevo.tema; setNuevo(v => ({ ...v, tema: "" }));
                await agregar("acta_temas", { titulo: t.trim() }, "temas");
              }}><Plus size={12} /> Agregar</Button>
            </div>
          )}
        </div>

        {/* 5 · COMPROMISOS NUEVOS */}
        <div style={{ ...caja, borderColor: colors.brand }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.ink, marginBottom: 3 }}>
            Compromisos de esta reunión · {nuevos.length}
          </div>
          <div style={{ fontSize: 11, color: colors.muted, marginBottom: 9, lineHeight: 1.45 }}>
            Cada uno con <strong>responsable</strong> y <strong>fecha</strong>. Es lo único del acta que sirve
            para reclamar algo, y lo que la próxima reunión va a traer de vuelta.
          </div>
          {nuevos.map(c => <Compromiso key={c.id} c={c} sePuede={sePuede}
            onTocar={campos => tocarFila("acta_compromisos", "compromisos", c.id, campos)}
            onQuitar={() => quitarFila("acta_compromisos", "compromisos", c.id)} quien={currentUser} />)}
          {sePuede && (
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <input value={nuevo.compromiso} placeholder="Qué se compromete a hacer, y quién. Enter para agregar"
                onChange={e => setNuevo(v => ({ ...v, compromiso: e.target.value }))}
                onKeyDown={async e => {
                  if (e.key !== "Enter" || !nuevo.compromiso.trim()) return;
                  const t = nuevo.compromiso; setNuevo(v => ({ ...v, compromiso: "" }));
                  await agregar("acta_compromisos", { texto: t.trim(), estado: "pendiente" }, "compromisos");
                }}
                style={{ ...inputStyle, flex: 1, fontSize: 12.5, padding: "6px 9px" }} />
              <Button variant="primary" size="sm" disabled={!nuevo.compromiso.trim()} onClick={async () => {
                const t = nuevo.compromiso; setNuevo(v => ({ ...v, compromiso: "" }));
                await agregar("acta_compromisos", { texto: t.trim(), estado: "pendiente" }, "compromisos");
              }}><Plus size={12} /> Agregar</Button>
            </div>
          )}
        </div>

        {/* 6 · FOTOS */}
        <div style={caja}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
            <Camera size={14} color={colors.muted} />
            <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.ink, flex: 1 }}>
              Fotos de la reunión · {cont.fotos.length}
            </div>
            {sePuede && (
              <label style={{ cursor: "pointer" }}>
                <input type="file" accept="image/*" multiple style={{ display: "none" }}
                  onChange={async e => {
                    const files = [...e.target.files];
                    e.target.value = "";
                    setOcupado(true); setError("");
                    for (const f of files) {
                      const r = await subirFoto({ actaId: abierta.id, file: f, quien: currentUser, orden: cont.fotos.length });
                      if (r.error) { setError(r.error); break; }
                    }
                    setOcupado(false);
                    await cargarActa(abierta.id);
                  }} />
                <span style={{ fontSize: 12, color: colors.brand, fontWeight: 600 }}>
                  {ocupado ? "Subiendo…" : "+ Subir fotos"}
                </span>
              </label>
            )}
          </div>
          <div style={{ fontSize: 11, color: colors.muted, marginBottom: 8, lineHeight: 1.45 }}>
            Lo que se miró en obra ese día. Una foto acá es la diferencia entre "se observó humedad en el muro
            norte" y poder mostrarla tres meses después.
          </div>
          {cont.fotos.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(130px,1fr))", gap: 8 }}>
              {cont.fotos.map(f => (
                <div key={f.id}>
                  {enlaces[f.storage_path] && (
                    <a href={enlaces[f.storage_path]} target="_blank" rel="noreferrer">
                      <img src={enlaces[f.storage_path]} alt={f.descripcion || "Foto"}
                        style={{ width: "100%", height: 95, objectFit: "cover", borderRadius: 7, display: "block" }} />
                    </a>
                  )}
                  <input defaultValue={f.descripcion || ""} disabled={!sePuede} placeholder="¿Qué se ve?"
                    onBlur={e => tocarFila("acta_fotos", "fotos", f.id, { descripcion: e.target.value || null })}
                    style={{ ...inputStyle, width: "100%", marginTop: 3, fontSize: 11, padding: "3px 6px", height: 24 }} />
                  {sePuede && (
                    <button onClick={() => quitarFila("acta_fotos", "fotos", f.id)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: colors.muted,
                        fontSize: 10.5, padding: "2px 0", fontFamily: colors.font }}>quitar</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 7 · CIERRE */}
        <div style={caja}>
          <Campo label="CÓMO VA LA OBRA, DICHO EN LA REUNIÓN">
            <textarea defaultValue={abierta.avance_nota || ""} disabled={!sePuede} rows={2}
              placeholder="El avance que las partes aceptaron, los plazos, lo que preocupa"
              onBlur={e => tocarActa({ avance_nota: e.target.value || null })}
              style={{ ...inputStyle, width: "100%", fontSize: 12, padding: "6px 8px", resize: "vertical" }} />
          </Campo>
          <Campo label="OTRAS CONSTANCIAS">
            <textarea defaultValue={abierta.resumen || ""} disabled={!sePuede} rows={2}
              placeholder="Lo que no entra en un tema ni en un compromiso"
              onBlur={e => tocarActa({ resumen: e.target.value || null })}
              style={{ ...inputStyle, width: "100%", fontSize: 12, padding: "6px 8px", resize: "vertical" }} />
          </Campo>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 9, marginTop: 7 }}>
            <Campo label="PRÓXIMA REUNIÓN"><input type="date" value={abierta.proxima_fecha || ""} disabled={!sePuede}
              onChange={e => tocarActa({ proxima_fecha: e.target.value || null })} style={inputStyle} /></Campo>
            <Campo label="HORA"><input type="time" value={abierta.proxima_hora || ""} disabled={!sePuede}
              onChange={e => tocarActa({ proxima_hora: e.target.value || null })} style={inputStyle} /></Campo>
          </div>
        </div>

        {sePuede && puedeEnviar && (
          <div style={{ fontSize: 11.5, color: colors.muted, lineHeight: 1.5, marginBottom: 20 }}>
            {correos.length
              ? <>Al enviarla la reciben <strong style={{ color: colors.ink }}>{correos.length}</strong>{" "}
                 {correos.length === 1 ? "persona" : "personas"}: {correos.join(", ")}. Después de enviada no se
                 toca — un acta que cambia después de salir no sirve como prueba de nada.</>
              : "Todavía no hay ningún asistente con correo marcado para recibirla."}
          </div>
        )}
      </div>
    );

    async function enviar() {
      if (!correos.length) { setError("Nadie tiene correo para recibirla."); return; }
      if (!window.confirm(
        `¿Enviar el acta N° ${abierta.numero} a ${correos.length} ${correos.length === 1 ? "persona" : "personas"}?\n\n`
        + correos.join("\n")
        + "\n\nDespués de enviada no se puede modificar.")) return;
      setOcupado(true); setError("");
      const r = await fetch("/api/aviso?de=acta", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acta_id: abierta.id, para: correos }),
      });
      const data = await r.json().catch(() => ({}));
      setOcupado(false);
      if (!r.ok || data?.error) { setError(data?.error || "No se pudo enviar el acta."); return; }
      await tocarActa({ estado: "enviada", enviada_at: new Date().toISOString(), enviada_a: correos });
      setAviso(`Enviada a ${correos.length} ${correos.length === 1 ? "correo" : "correos"}.`);
    }
  }

  // ── La lista de actas ────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: colors.font }}>
      <Volver onClick={() => { setLead(null); setActas([]); }} texto="Actas de reunión" />
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: colors.ink, flex: 1 }}>{lead.nombre}</div>
        {editable && (
          <Button variant="primary" size="sm" disabled={ocupado} onClick={async () => {
            setOcupado(true); setError("");
            const r = await abrirActa({ leadId: lead.id, obraId: lead.obra_id, fecha: hoy(), quien: currentUser });
            setOcupado(false);
            if (r.error) { setError(r.error); return; }
            await cargarActas(lead.id);
            setAbierta(r.acta);
            setAviso(r.arrastrados
              ? `Acta N° ${r.acta.numero}. Traje ${r.arrastrados} ${r.arrastrados === 1 ? "compromiso pendiente" : "compromisos pendientes"} de la anterior.`
              : `Acta N° ${r.acta.numero}.`);
          }}><Plus size={13} /> Nueva reunión</Button>
        )}
      </div>
      {error && <div style={{ fontSize: 12, color: colors.danger, marginBottom: 10 }}>{error}</div>}

      {!actas.length ? (
        <div style={{ fontSize: 12.5, color: colors.muted, background: colors.surface,
          border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 18, lineHeight: 1.55 }}>
          Todavía no hay actas en esta obra. Cada acta deja por escrito lo que se decidió y, sobre todo, los
          compromisos: quién hace qué y para cuándo. La siguiente reunión los trae de vuelta y dice qué pasó
          con cada uno — eso es lo que convierte las actas en una cadena y no en una pila de papeles.
        </div>
      ) : (
        <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, overflow: "hidden" }}>
          {actas.map(a => (
            <div key={a.id} onClick={() => setAbierta(a)}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 13px",
                borderTop: `1px solid ${colors.neutralSoft}`, cursor: "pointer" }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: colors.ink, width: 56 }}>N° {a.numero}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: colors.inkSoft }}>{dia(a.fecha)}</span>
              <Chip estado={a.estado} />
              {editable && a.estado === "borrador" && (
                <button onClick={async e => {
                  e.stopPropagation();
                  if (!window.confirm(`¿Borrar el acta N° ${a.numero}?`)) return;
                  await borrarActa(a.id); await cargarActas(lead.id);
                }} style={{ background: "none", border: "none", cursor: "pointer", color: colors.muted, display: "flex" }}>
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Piezas ──────────────────────────────────────────────────────────────────

const Volver = ({ onClick, texto = "Actas de reunión" }) => (
  <button onClick={onClick}
    style={{ background: "none", border: "none", color: colors.inkSoft, fontSize: 12.5, cursor: "pointer",
      fontFamily: colors.font, display: "flex", alignItems: "center", gap: 4, padding: 0, marginBottom: 10 }}>
    <ChevronLeft size={14} /> {texto}
  </button>
);

const Campo = ({ label, children }) => (
  <div><label style={titulito}>{label}</label>{children}</div>
);

const Chip = ({ estado }) => {
  const e = ESTADOS[estado] || ESTADOS.borrador;
  const c = { borrador: colors.muted, revisada: colors.warning, enviada: colors.success }[estado] || colors.muted;
  return (
    <span title={e.pista} style={{ fontSize: 9.5, fontWeight: 700, color: "#fff", background: c,
      borderRadius: 10, padding: "2px 8px", whiteSpace: "nowrap" }}>{e.label.toUpperCase()}</span>
  );
};

/**
 * UN COMPROMISO: lo único del acta que sirve para reclamar algo.
 *
 * Texto, responsable, fecha y estado. Sin responsable y sin fecha es una buena
 * intención, y una buena intención no se puede revisar en la reunión que viene.
 */
const Compromiso = ({ c, sePuede, onTocar, onQuitar, quien }) => {
  const vencido = c.estado === "pendiente" && c.fecha_limite && c.fecha_limite < hoy();
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 5 }}>
      <input defaultValue={c.texto} disabled={!sePuede} placeholder="Qué hay que hacer"
        onBlur={e => onTocar({ texto: e.target.value })}
        style={{ ...inputStyle, flex: "2 1 200px", minWidth: 140, fontSize: 12, padding: "5px 8px", height: 28,
          textDecoration: c.estado === "cumplido" ? "line-through" : "none",
          color: c.estado === "cumplido" ? colors.muted : colors.ink }} />
      <input defaultValue={c.responsable_nombre || ""} disabled={!sePuede} placeholder="¿Quién?"
        onBlur={e => onTocar({ responsable_nombre: e.target.value || null })}
        style={{ ...inputStyle, flex: "1 1 110px", minWidth: 90, fontSize: 12, padding: "5px 8px", height: 28 }} />
      <input type="date" value={c.fecha_limite || ""} disabled={!sePuede} title="¿Para cuándo?"
        onChange={e => onTocar({ fecha_limite: e.target.value || null })}
        style={{ ...inputStyle, width: 136, fontSize: 11.5, padding: "4px 6px", height: 28,
          color: vencido ? colors.danger : colors.ink, fontWeight: vencido ? 600 : 400 }} />
      <select value={c.estado} disabled={!sePuede}
        onChange={e => onTocar({
          estado: e.target.value,
          cerrado_at: e.target.value === "pendiente" ? null : new Date().toISOString(),
          cerrado_por: quien?.id ?? null, cerrado_nombre: quien?.name || null,
        })}
        style={{ ...inputStyle, width: 128, fontSize: 11.5, padding: "4px 6px", height: 28,
          color: c.estado === "cumplido" ? colors.success : c.estado === "pendiente" ? colors.warning : colors.muted }}>
        {Object.entries(ESTADO_COMPROMISO).map(([id, e]) => <option key={id} value={id}>{e.label}</option>)}
      </select>
      {sePuede && (
        <button onClick={onQuitar}
          style={{ background: "none", border: "none", cursor: "pointer", color: colors.muted, display: "flex" }}>
          <Trash2 size={12} />
        </button>
      )}
    </div>
  );
};
