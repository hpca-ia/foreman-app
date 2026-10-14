import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, Plus, Trash2, Send, Check, Camera, Users, FileText, Printer, Sparkles } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import { actasDe, contenidoDe, abrirActa, guardarActa, borrarActa, guardarFila, borrarFila,
  convocadosDe, guardarConvocado, borrarConvocado, subirFoto, enlacesDeFotos,
  correosDe, ESTADOS, ESTADO_COMPROMISO, SIN_106 } from "./actas";
import { pdfActa } from "./pdfActa";
import { armarActa } from "./novaActa";
import { revisarActa } from "./revisarActa";

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
  // Lo que se anota al vuelo durante la reunión, antes de que NOVA lo ordene.
  const [dictado, setDictado] = useState("");
  // Lo que NOVA encontró al revisar: las correcciones se aceptan, los avisos
  // se van a preguntar.
  const [revision, setRevision] = useState(null);
  // Qué filas de asistentes se tocaron y todavía no se guardaron.
  const [sinGuardar, setSinGuardar] = useState(() => new Set());
  const [nuevo, setNuevo] = useState({
    tema: "", compromiso: "", responsable: "", limite: "",
    convocado: { nombre: "", email: "", empresa: "", cargo: "" },
  });

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
    setSinGuardar(new Set());
    setEnlaces(await enlacesDeFotos(c.fotos));
  }, []);
  useEffect(() => { if (abierta?.id) cargarActa(abierta.id); }, [abierta?.id, cargarActa]);

  const editable = !lead || nivelProyecto?.(lead.id) === "editar";
  // Revisar y enviar es del director: un acta la escribe quien lleva la obra,
  // pero el documento que sale con el nombre de la empresa lo aprueba quien
  // responde por ella.
  //
  // Preguntaba por "obras.aprobar", que no existe. Un permiso que no existe es
  // false para todo el mundo, así que el botón de dar el visto no le aparecía
  // a nadie —ni al director— y el acta no podía salir nunca. Un permiso mal
  // escrito no falla: cierra la puerta en silencio.
  const puedeEnviar = puede ? puede("actas.aprobar") : true;

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
        <Volver onClick={() => {
          // SALIR CON ALGO SIN GUARDAR AVISA. Es el caso que de verdad pierde
          // lo escrito: se llena la fila y se toca "Volver".
          if (sinGuardar.size && !window.confirm(
            `Hay ${sinGuardar.size} ${sinGuardar.size === 1 ? "asistente sin guardar" : "asistentes sin guardar"}.\n\n¿Salir igual y perder lo escrito?`)) return;
          setAbierta(null); cargarActas(lead.id);
        }} texto={`Actas · ${lead.nombre}`} />

        <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", marginBottom: 12 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: colors.ink }}>Acta N° {abierta.numero}</div>
          <Chip estado={abierta.estado} />
          <div style={{ flex: 1 }} />
          {/* VERLO ANTES DE MANDARLO. Una falta de ortografía en un acta
              enviada no se corrige nunca, y un acta es un documento que ocho
              personas van a leer con atención. Y el papel sirve para otra cosa
              que el correo: se firma en la reunión y se archiva. */}
          <Button variant="secondary" size="sm" onClick={() => verPdf("abrir")}>
            <FileText size={13} /> Ver el PDF
          </Button>
          <Button variant="secondary" size="sm" onClick={() => verPdf("imprimir")}>
            <Printer size={13} /> Imprimir
          </Button>
          {/* REVISARLA ANTES DE QUE SALGA. La van a leer ocho personas con
              atención, buscando qué objetar, y la escribió alguien apurado al
              final de una reunión de dos horas. Esa distancia es el problema:
              lo que se le escapa al que escribe no se le escapa a los que la
              reciben. */}
          {sePuede && (
            <Button variant="outline" size="sm" disabled={ocupado} onClick={revisar}>
              <Sparkles size={13} /> {ocupado ? "NOVA está leyendo…" : "Que NOVA la revise"}
            </Button>
          )}
          {/* PEDIR EL VISTO: de quien la escribe, no de quien la aprueba.
              Sin esto el acta se queda en borrador y el director se entera
              porque alguien se acuerda de avisarle por teléfono. */}
          {sePuede && !puedeEnviar && abierta.estado === "borrador" && (
            <Button variant="primary" size="sm" disabled={ocupado} onClick={async () => {
              await tocarActa({ estado: "lista" });
              setAviso("Pedido el visto. El director la revisa y la envía.");
            }}><Check size={13} /> Pedir el visto</Button>
          )}
          {sePuede && !puedeEnviar && abierta.estado === "lista" && (
            <Button variant="secondary" size="sm" disabled={ocupado} onClick={async () => {
              await tocarActa({ estado: "borrador" });
              setAviso("Volvió a borrador: se puede seguir escribiendo.");
            }}>Seguir escribiéndola</Button>
          )}
          {sePuede && puedeEnviar && (abierta.estado === "borrador" || abierta.estado === "lista") && (
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

        {aviso && <div style={{ fontSize: 12, color: colors.brand, marginBottom: 10, whiteSpace: "pre-line" }}>{aviso}</div>}

        {revision && (
          <div style={{ ...caja, borderColor: colors.brand }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
              <Sparkles size={14} color={colors.brand} />
              <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.ink, flex: 1 }}>Lo que vio NOVA</div>
              <button onClick={() => setRevision(null)}
                style={{ background: "none", border: "none", cursor: "pointer", color: colors.muted, fontSize: 11, fontFamily: colors.font }}>cerrar</button>
            </div>

            {!revision.correcciones.length && !revision.avisos.length && (
              <div style={{ fontSize: 12.5, color: colors.success }}>
                No le encontró nada. El acta puede salir así.
              </div>
            )}

            {/* LOS AGUJEROS PRIMERO: no se arreglan escribiendo mejor, se
                arreglan preguntando, y hay que preguntarlos antes de enviar el
                acta, no después. */}
            {revision.avisos.length > 0 && (
              <div style={{ marginBottom: revision.correcciones.length ? 12 : 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: colors.warning, letterSpacing: 0.3, marginBottom: 5 }}>
                  HAY QUE PREGUNTARLO · {revision.avisos.length}
                </div>
                {revision.avisos.map((a, i) => (
                  <div key={i} style={{ fontSize: 12, color: colors.ink, lineHeight: 1.45, marginBottom: 6 }}>
                    · <strong>{a.que}</strong>
                    {a.donde && <span style={{ color: colors.muted }}> — {a.donde}</span>}
                    {a.hacer && <div style={{ fontSize: 11, color: colors.muted, marginLeft: 9 }}>{a.hacer}</div>}
                  </div>
                ))}
              </div>
            )}

            {/* LA REDACCIÓN SE ACEPTA DE UN CLICK. Son mecánicas, no hay nada
                que decidir, y pedir una decisión por cada tilde es garantizar
                que no se corrija ninguna. Igual se pueden ver una por una. */}
            {revision.correcciones.length > 0 && (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: colors.brand, letterSpacing: 0.3, flex: 1 }}>
                    ORTOGRAFÍA Y REDACCIÓN · {revision.correcciones.length}
                  </div>
                  <Button variant="primary" size="sm" disabled={ocupado} onClick={() => aplicarCorrecciones(revision.correcciones)}>
                    Aceptar {revision.correcciones.length === 1 ? "la corrección" : "las " + revision.correcciones.length}
                  </Button>
                </div>
                {revision.correcciones.map((c, i) => (
                  <div key={i} style={{ fontSize: 11.5, lineHeight: 1.5, marginBottom: 7,
                    borderLeft: `2px solid ${colors.neutralSoft}`, paddingLeft: 8 }}>
                    <div style={{ color: colors.muted, textDecoration: "line-through" }}>{c.antes || "(vacío)"}</div>
                    <div style={{ color: colors.ink }}>{c.texto}</div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 2 }}>
                      {c.porque && <span style={{ fontSize: 10, color: colors.muted }}>{c.porque}</span>}
                      <button onClick={() => aplicarCorrecciones([c])}
                        style={{ background: "none", border: "none", padding: 0, cursor: "pointer",
                          fontFamily: colors.font, fontSize: 10.5, color: colors.brand }}>aceptar solo ésta</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {error && <div style={{ fontSize: 12, color: colors.danger, marginBottom: 10 }}>{error}</div>}
        {!editable && !cerrada && (
          /* POR QUÉ NO SE PUEDE ESCRIBIR. Un formulario entero en gris sin una
             palabra manda a pensar que está roto, y es lo primero que pensó
             quien lo abrió. */
          <div style={{ fontSize: 12, color: colors.warning, background: colors.warningSoft,
            border: `1px solid ${colors.warningBorder}`, borderRadius: colors.radiusMd,
            padding: "9px 12px", marginBottom: 12, lineHeight: 1.5 }}>
            No podés escribir en esta acta: no estás asignado a esta obra con permiso de editar. Se arregla en
            Ajustes → Proyectos, dándote acceso de edición a la obra.
          </div>
        )}
        {cerrada && (
          <div style={{ fontSize: 12, color: colors.inkSoft, background: colors.bg, borderRadius: colors.radiusMd,
            padding: "9px 12px", marginBottom: 12, lineHeight: 1.5 }}>
            Esta acta se envió el {dia(String(abierta.enviada_at).slice(0, 10))} a{" "}
            {(abierta.enviada_a || []).length} {(abierta.enviada_a || []).length === 1 ? "correo" : "correos"} y
            ya no se toca. Lo que haya que corregir va en la próxima: un acta que cambia después de enviada no
            sirve como prueba de nada.
          </div>
        )}

        {/* ANOTÁ AL VUELO Y QUE NOVA LO ORDENE.
            Escribir un acta después de la reunión lleva cuarenta minutos y se
            hace mal: de memoria, dos días después, y lo primero que se pierde
            son los compromisos —quién queda en hacer qué y para cuándo—, que
            son lo único del acta que sirve para reclamar algo.
            Lo que sí se puede hacer es anotar mientras se habla, en desorden y
            con las palabras que salgan. Eso NOVA lo separa en temas y
            compromisos, le pone fecha a "el viernes", y dice qué quedó al
            aire. */}
        {sePuede && (
          <div style={{ ...caja, borderColor: colors.brand }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
              <Sparkles size={14} color={colors.brand} />
              <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.ink }}>Anotá la reunión y que NOVA la ordene</div>
            </div>
            <div style={{ fontSize: 11, color: colors.muted, marginBottom: 7, lineHeight: 1.45 }}>
              Escribí mientras se habla, en desorden, como salga. NOVA separa los temas de los compromisos,
              le pone responsable y fecha a cada uno —"el viernes" lo resuelve contra el calendario— y te dice
              qué quedó al aire. No inventa: lo que no se dijo, no lo pone.
            </div>
            <textarea value={dictado} rows={4} onChange={e => setDictado(e.target.value)}
              placeholder={"Ej: la ventanería se atrasa dos semanas, el proveedor avisó ayer. Lizeth queda en pedir la proforma nueva para el viernes. El cliente aprueba el cambio de piso pero quiere ver una muestra antes. Hay humedad en el muro norte del segundo piso, el contratista lo revisa."}
              style={{ ...inputStyle, width: "100%", fontSize: 12.5, lineHeight: 1.55, resize: "vertical", padding: "8px 10px" }} />
            <div style={{ display: "flex", gap: 7, alignItems: "center", marginTop: 7, flexWrap: "wrap" }}>
              <Button variant="primary" size="sm" disabled={ocupado || dictado.trim().length < 20} onClick={ordenarConNova}>
                <Sparkles size={13} /> {ocupado ? "NOVA está ordenando…" : "Que NOVA la ordene"}
              </Button>
              {dictado.trim() && (
                <Button variant="secondary" size="sm" onClick={() => setDictado("")}>Borrar</Button>
              )}
              <span style={{ fontSize: 10.5, color: colors.muted, flex: 1, minWidth: 180 }}>
                Agrega a lo que ya haya escrito; no borra nada.
              </span>
            </div>
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
            {arrastrados.map(c => <Repaso key={c.id} c={c} sePuede={sePuede}
              onTocar={campos => tocarFila("acta_compromisos", "compromisos", c.id, campos)}
              quien={currentUser} />)}
            <div style={{ fontSize: 10.5, color: colors.muted, marginTop: 7, lineHeight: 1.45 }}>
              Lo que quede sin tildar sigue pendiente y vuelve a aparecer en la próxima reunión. Si cambió la
              fecha, cambiala acá: eso es reprogramarlo, y queda dicho que se reprogramó.
            </div>
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
          {/* SE ESCRIBE EN MEMORIA Y SE GUARDA CON UN BOTÓN.
              Se guardaba al salir de cada campo, y eso pierde lo escrito en el
              caso que de verdad pasa: se llena la fila, se toca "Volver" o se
              cierra la pestaña sin salir del último campo, y no se guardó
              nada. Peor, no avisa — la pantalla se va como si todo estuviera
              bien. Un formulario que se llena tiene que tener un botón que
              diga "Guardar", y el botón tiene que decir si falta algo. */}
          {cont.asistentes.map(a => (
            <div key={a.id} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
              <input type="checkbox" checked={!!a.asistio} disabled={!sePuede} title="¿Vino?"
                onChange={e => cambiarAsistente(a.id, { asistio: e.target.checked })} />
              <input value={a.nombre || ""} disabled={!sePuede} placeholder="Nombre"
                onChange={e => cambiarAsistente(a.id, { nombre: e.target.value })}
                style={{ ...inputStyle, flex: "1 1 130px", minWidth: 100, fontSize: 12, padding: "5px 8px", height: 28,
                  color: a.asistio ? colors.ink : colors.muted }} />
              <input value={a.empresa || ""} disabled={!sePuede} placeholder="Empresa"
                onChange={e => cambiarAsistente(a.id, { empresa: e.target.value })}
                style={{ ...inputStyle, flex: "1 1 110px", minWidth: 90, fontSize: 12, padding: "5px 8px", height: 28 }} />
              <input value={a.email || ""} disabled={!sePuede} placeholder="correo@…" type="email"
                onChange={e => cambiarAsistente(a.id, { email: e.target.value })}
                style={{ ...inputStyle, flex: "1 1 150px", minWidth: 120, fontSize: 12, padding: "5px 8px", height: 28 }} />
              <label title="Recibe el acta por correo" style={{ fontSize: 10.5, color: colors.muted, display: "flex", gap: 3, alignItems: "center" }}>
                <input type="checkbox" checked={!!a.recibe} disabled={!sePuede}
                  onChange={e => cambiarAsistente(a.id, { recibe: e.target.checked })} />
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
          {/* DÓNDE SE AGREGAN, DICHO. Con la lista vacía lo único que había
              era un botón gris al pie, y no se ve: lo que se ve es un bloque
              que dice "Asistentes · 0 de 0" y parece que no se puede tocar. */}
          {!cont.asistentes.length && (
            <div style={{ fontSize: 12, color: colors.muted, lineHeight: 1.5, marginBottom: 9 }}>
              Todavía no hay nadie. Agregalos uno por uno acá abajo, o cargá <strong>Los de siempre</strong> —
              la gente que va a todas las reuniones de esta obra— y entran solos en cada acta nueva.
            </div>
          )}
          {sePuede && (
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 7, flexWrap: "wrap" }}>
              <Button variant={cont.asistentes.length ? "secondary" : "primary"} size="sm"
                onClick={() => agregar("acta_asistentes", { nombre: "", asistio: true, recibe: true }, "asistentes")}>
                <Plus size={12} /> Agregar asistente
              </Button>
              <Button variant="primary" size="sm" disabled={ocupado || !sinGuardar.size} onClick={guardarAsistentes}>
                {ocupado ? "Guardando…" : sinGuardar.size ? `Guardar ${sinGuardar.size === 1 ? "el cambio" : `los ${sinGuardar.size} cambios`}` : "Guardado"}
              </Button>
              {sinGuardar.size > 0 && (
                <span style={{ fontSize: 10.5, color: colors.warning, fontWeight: 600 }}>
                  Sin guardar — si salís ahora se pierde
                </span>
              )}
            </div>
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
          {/* LOS TRES CAMPOS AL AGREGAR, no uno solo.
              Un compromiso sin responsable y sin fecha es una buena intención,
              y una buena intención no se puede revisar en la reunión que viene.
              Si los tres no se piden en el momento de escribirlo, se escribe
              el texto y los otros dos quedan vacíos para siempre: nadie vuelve
              a completar una fila. */}
          {sePuede && (
            <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
              <input value={nuevo.compromiso} placeholder="Qué hay que hacer"
                onChange={e => setNuevo(v => ({ ...v, compromiso: e.target.value }))}
                onKeyDown={e => { if (e.key === "Enter") ponerCompromiso(); }}
                style={{ ...inputStyle, flex: "2 1 200px", minWidth: 150, fontSize: 12.5, padding: "6px 9px" }} />
              <input value={nuevo.responsable} placeholder="¿Quién?" list="convocados-acta"
                onChange={e => setNuevo(v => ({ ...v, responsable: e.target.value }))}
                onKeyDown={e => { if (e.key === "Enter") ponerCompromiso(); }}
                style={{ ...inputStyle, flex: "1 1 120px", minWidth: 100, fontSize: 12.5, padding: "6px 9px" }} />
              {/* Los nombres que ya están en la reunión: el responsable casi
                  siempre es alguien que está sentado en la mesa. */}
              <datalist id="convocados-acta">
                {cont.asistentes.map(a => <option key={a.id} value={a.nombre} />)}
              </datalist>
              <input type="date" value={nuevo.limite} title="¿Para cuándo?"
                onChange={e => setNuevo(v => ({ ...v, limite: e.target.value }))}
                style={{ ...inputStyle, width: 148, fontSize: 12, padding: "5px 8px" }} />
              <Button variant="primary" size="sm" disabled={!nuevo.compromiso.trim()} onClick={ponerCompromiso}>
                <Plus size={12} /> Agregar
              </Button>
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

        {cerrada && (
          /* LO QUE CONTESTEN, ADONDE VA.
             El acta enviada no se toca —si cambia después de salir no sirve
             como prueba— así que una observación que llega por correo no se
             mete acá: se anota en la próxima, que es donde se discute. Decirlo
             evita la pregunta obvia y evita la tentación de editarla. */
          <div style={{ fontSize: 11.5, color: colors.muted, lineHeight: 1.5, marginBottom: 20 }}>
            Si alguien responde con una observación, la respuesta le llega a quien dio el visto. Esa
            observación va en la <strong>próxima acta</strong>, en el repaso: así queda la constancia de que
            se recibió y de qué se resolvió. Esta no se modifica.
          </div>
        )}
        {sePuede && puedeEnviar && (
          <div style={{ fontSize: 11.5, color: colors.muted, lineHeight: 1.5, marginBottom: 20 }}>
            {correos.length
              ? <>Al enviarla la reciben <strong style={{ color: colors.ink }}>{correos.length}</strong>{" "}
                 {correos.length === 1 ? "persona" : "personas"}: {correos.join(", ")}. Sale desde{" "}
                 <strong style={{ color: colors.ink }}>notificaciones@hcastudio.com</strong> y las respuestas
                 llegan a quien la escribió y a quien le dio el visto. Después de enviada no se toca — un acta que cambia después de
                 salir no sirve como prueba de nada.</>
              : "Todavía no hay ningún asistente con correo marcado para recibirla."}
          </div>
        )}
      </div>
    );

    /**
     * Lo que NOVA ordenó, puesto en el acta.
     *
     * SE AGREGA, NO SE REEMPLAZA. Lo que ya está escrito lo escribió una
     * persona, y una de las maneras más rápidas de que alguien deje de usar
     * una herramienta es que le borre lo que escribió.
     */
    /** Lo escrito queda en memoria y se marca para guardar. */
    function cambiarAsistente(id, campos) {
      setCont(c => ({ ...c, asistentes: c.asistentes.map(x => (x.id === id ? { ...x, ...campos } : x)) }));
      setSinGuardar(v => new Set(v).add(id));
    }

    async function guardarAsistentes() {
      setOcupado(true); setError("");
      const fallaron = [];
      for (const id of sinGuardar) {
        const a = cont.asistentes.find(x => x.id === id);
        if (!a) continue;
        const { error: e } = await guardarFila("acta_asistentes", {
          id, nombre: a.nombre || "", empresa: a.empresa || null, cargo: a.cargo || null,
          email: a.email || null, asistio: !!a.asistio, recibe: !!a.recibe,
        });
        if (e) fallaron.push(e);
      }
      setOcupado(false);
      if (fallaron.length) { setError(fallaron[0]); return; }
      setSinGuardar(new Set());
      setAviso("Asistentes guardados.");
    }

    async function revisar() {
      setOcupado(true); setError(""); setRevision(null);
      const r = await revisarActa({ acta: abierta, obra: lead.nombre, ...cont });
      setOcupado(false);
      if (r.error) { setError(r.error); return; }
      setRevision(r);
    }

    /**
     * Aplicar lo que NOVA corrigió.
     *
     * Solo toca el campo que corrigió, con el texto entero ya corregido: no se
     * reemplaza la fila, porque la fila tiene otras cosas que alguien escribió.
     */
    async function aplicarCorrecciones(lista) {
      setOcupado(true); setError("");
      for (const c of lista) {
        if (c.tipo === "acta") await tocarActa({ [c.campo]: c.texto });
        else await guardarFila(c.tipo === "tema" ? "acta_temas" : "acta_compromisos", { id: c.id, [c.campo]: c.texto });
      }
      setOcupado(false);
      await cargarActa(abierta.id);
      setRevision(v => (v ? { ...v, correcciones: v.correcciones.filter(x => !lista.includes(x)) } : v));
      setAviso(`${lista.length} ${lista.length === 1 ? "corrección aplicada" : "correcciones aplicadas"}.`);
    }

    async function ordenarConNova() {
      setOcupado(true); setError("");
      const r = await armarActa({
        texto: dictado, asistentes: cont.asistentes, fecha: abierta.fecha, obra: lead.nombre,
        pendientes: arrastrados.filter(c => c.estado === "pendiente" || c.estado === "reprogramado"),
      });
      if (r.error) { setOcupado(false); setError(r.error); return; }

      for (const t of r.temas) {
        await guardarFila("acta_temas", { acta_id: abierta.id, titulo: t.titulo, detalle: t.detalle, resuelto: t.resuelto, orden: 900 });
      }
      for (const c of r.compromisos) {
        const quienEs = cont.asistentes.find(a => a.nombre === c.responsable);
        await guardarFila("acta_compromisos", {
          acta_id: abierta.id, texto: c.texto, estado: "pendiente",
          responsable_nombre: c.responsable, responsable_email: quienEs?.email || null,
          fecha_limite: c.fecha, orden: 900,
        });
      }
      for (const p of r.repaso) {
        await guardarFila("acta_compromisos", {
          id: p.id,
          estado: p.hecho ? "cumplido" : "pendiente",
          nota: p.nota || null,
          cerrado_at: p.hecho ? new Date().toISOString() : null,
          cerrado_nombre: p.hecho ? currentUser?.name || null : null,
        });
      }
      if (r.avance && !abierta.avance_nota) await tocarActa({ avance_nota: r.avance });

      setOcupado(false);
      setDictado("");
      await cargarActa(abierta.id);
      setAviso([
        `${r.temas.length} ${r.temas.length === 1 ? "tema" : "temas"}`,
        `${r.compromisos.length} ${r.compromisos.length === 1 ? "compromiso" : "compromisos"}`,
        r.repaso.length ? `${r.repaso.length} del repaso` : "",
      ].filter(Boolean).join(" · ") + ". Revisalo: lo que NOVA no supo quedó vacío."
        + (r.falta.length ? `\n\nQuedó al aire: ${r.falta.join(" · ")}` : ""));
    }

    async function ponerCompromiso() {
      if (!nuevo.compromiso.trim()) return;
      const { compromiso, responsable, limite } = nuevo;
      setNuevo(v => ({ ...v, compromiso: "", responsable: "", limite: "" }));
      const quienEs = cont.asistentes.find(a => a.nombre === responsable.trim());
      await agregar("acta_compromisos", {
        texto: compromiso.trim(), estado: "pendiente",
        responsable_nombre: responsable.trim() || null,
        responsable_email: quienEs?.email || null,
        fecha_limite: limite || null,
      }, "compromisos");
    }

    async function verPdf(modo) {
      setOcupado(true); setError("");
      try {
        await pdfActa({ acta: abierta, obra: lead.nombre, ...cont, enlaces }, modo);
      } catch (e) {
        setError("No se pudo armar el PDF: " + e.message);
      }
      setOcupado(false);
    }

    async function enviar() {
      if (!correos.length) { setError("Nadie tiene correo para recibirla."); return; }
      if (!window.confirm(
        `¿Enviar el acta N° ${abierta.numero} a ${correos.length} ${correos.length === 1 ? "persona" : "personas"}?\n\n`
        + correos.join("\n")
        + "\n\nVa el acta en el cuerpo del correo y el PDF adjunto, para imprimir y firmar."
        + "\n\nDespués de enviada no se puede modificar.")) return;
      setOcupado(true); setError("");
      // EL ACTA VA EN EL CUERPO Y TAMBIÉN ADJUNTA.
      //
      // En el cuerpo porque se lee sin abrir nada —la mitad la va a leer en el
      // teléfono, caminando— y un correo que obliga a bajar un archivo para
      // saber qué dice no se lee. Adjunta porque es el documento: el que se
      // imprime, se firma, se archiva en la carpeta de la obra y se lleva a
      // una mesa cuando hay que discutir algo. Son dos usos distintos del
      // mismo contenido y hacen falta los dos.
      let adjunto = null;
      try {
        adjunto = await pdfActa({ acta: abierta, obra: lead.nombre, ...cont, enlaces }, "base64");
      } catch (e) {
        // Si el PDF no se puede armar, el acta sale igual en el cuerpo: lo que
        // no puede pasar es que un problema con el adjunto frene el envío.
        void e;
      }
      const r = await fetch("/api/aviso?de=acta", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acta_id: abierta.id, para: correos, adjunto }),
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
  const c = { borrador: colors.muted, lista: colors.brand, revisada: colors.warning, enviada: colors.success }[estado] || colors.muted;
  return (
    <span title={e.pista} style={{ fontSize: 9.5, fontWeight: 700, color: "#fff", background: c,
      borderRadius: 10, padding: "2px 8px", whiteSpace: "nowrap" }}>{e.label.toUpperCase()}</span>
  );
};

/**
 * EL REPASO DE LO QUE QUEDÓ PENDIENTE: una casilla y nada más.
 *
 * Es lo primero que pasa en una reunión de obra y pasa rápido: se lee el
 * compromiso en voz alta y alguien dice sí o no. Un desplegable de cuatro
 * estados para eso es pedir una decisión que nadie está tomando —entre
 * "pendiente" y "reprogramado" no hay diferencia práctica mientras se habla— y
 * lo que se consigue es que no se marque nada.
 *
 * Una casilla: se hizo o no se hizo. Lo que queda sin tildar sigue pendiente y
 * vuelve a aparecer en la próxima acta, que es exactamente lo que tiene que
 * pasar. Y si no se hizo, el campo que aparece es el que importa: por qué —eso
 * es lo que después explica un atraso— y para cuándo queda ahora.
 */
const Repaso = ({ c, sePuede, onTocar, quien }) => {
  const hecho = c.estado === "cumplido";
  const anulado = c.estado === "anulado";
  const vencido = !hecho && !anulado && c.fecha_limite && c.fecha_limite < hoy();
  return (
    <div style={{ borderBottom: `1px solid ${colors.neutralSoft}`, paddingBottom: 6, marginBottom: 6 }}>
      <div style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
        <input type="checkbox" checked={hecho} disabled={!sePuede} title="¿Se hizo?"
          style={{ marginTop: 3, width: 16, height: 16, flexShrink: 0 }}
          onChange={e => onTocar({
            estado: e.target.checked ? "cumplido" : "pendiente",
            cerrado_at: e.target.checked ? new Date().toISOString() : null,
            cerrado_por: quien?.id ?? null, cerrado_nombre: quien?.name || null,
          })} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, lineHeight: 1.4,
            color: hecho || anulado ? colors.muted : colors.ink,
            textDecoration: hecho || anulado ? "line-through" : "none" }}>
            {c.texto}
          </div>
          <div style={{ fontSize: 10.5, color: colors.muted, marginTop: 1 }}>
            {c.responsable_nombre || "sin responsable"}
            {c.fecha_limite && <span style={{ color: vencido ? colors.danger : colors.muted, fontWeight: vencido ? 600 : 400 }}>
              {" · "}era para el {dia(c.fecha_limite)}{vencido ? " · vencido" : ""}
            </span>}
            {hecho && c.cerrado_nombre && ` · lo dio por hecho ${c.cerrado_nombre}`}
          </div>
        </div>
        {sePuede && !hecho && (
          <button onClick={() => onTocar({ estado: anulado ? "pendiente" : "anulado" })}
            title={anulado ? "Volver a ponerlo pendiente" : "Ya no aplica: sacarlo de la cadena"}
            style={{ background: "none", border: "none", cursor: "pointer", color: colors.muted,
              fontSize: 10.5, fontFamily: colors.font, flexShrink: 0 }}>
            {anulado ? "volver a abrirlo" : "ya no aplica"}
          </button>
        )}
      </div>
      {/* SI NO SE HIZO, LO QUE HACE FALTA ES POR QUÉ Y PARA CUÁNDO.
          "Sigue pendiente" repetido cuatro actas seguidas no explica nada; "no
          se hizo porque el proveedor no entregó" sí, y es lo que después
          sostiene un reclamo o una ampliación de plazo. */}
      {!hecho && !anulado && sePuede && (
        <div style={{ display: "flex", gap: 6, marginTop: 5, marginLeft: 23, flexWrap: "wrap" }}>
          <input defaultValue={c.nota || ""} placeholder="¿Por qué no se hizo?"
            onBlur={e => onTocar({ nota: e.target.value || null })}
            style={{ ...inputStyle, flex: "1 1 200px", minWidth: 150, fontSize: 11.5, padding: "4px 7px", height: 26 }} />
          <input type="date" value={c.fecha_limite || ""} title="¿Para cuándo queda ahora?"
            onChange={e => onTocar({
              fecha_limite: e.target.value || null,
              estado: e.target.value && e.target.value !== c.fecha_limite ? "reprogramado" : c.estado,
            })}
            style={{ ...inputStyle, width: 142, fontSize: 11.5, padding: "4px 6px", height: 26 }} />
        </div>
      )}
      {!hecho && !anulado && !sePuede && c.nota && (
        <div style={{ fontSize: 11, color: colors.inkSoft, marginLeft: 23, marginTop: 3 }}>{c.nota}</div>
      )}
    </div>
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
