import { useState, useEffect, useCallback, useRef } from "react";
import { ChevronLeft, Plus, Trash2, Send, Check, Camera, Users, FileText, Printer, Sparkles, Star, Paperclip,
  Eye, Link2, RefreshCw, AlertTriangle } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import { actasDe, contenidoDe, abrirActa, guardarActa, borrarActa, guardarFila, borrarFila,
  convocadosDe, guardarConvocado, borrarConvocado, subirFoto, enlacesDeFotos,
  correosDe, ESTADOS, ESTADO_COMPROMISO, SIN_106, subirAdjunto,
  conformidadDe, llaveDeAsistente, enlaceDeFirma } from "./actas";
import { pdfActa } from "./pdfActa";
import { pedirElVisto } from "./pedirVisto";
import { repetidos, comoQuedan, correosCompartidos, cuantosDeVerdad } from "./repetidos";
import { armarActa } from "./novaActa";
import { revisarActa } from "./revisarActa";
import { crearTareas, paraTarea, estadoDeTareas, yaSeHizo } from "./aTareas";

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

export default function ModuloActas({ currentUser, users = [], puede, nivelProyecto }) {
  const [proyectos, setProyectos] = useState([]);
  const [lead, setLead] = useState(null);
  const [actas, setActas] = useState([]);
  const [sinTablas, setSinTablas] = useState(false);
  const [abierta, setAbierta] = useState(null);
  const [cont, setCont] = useState({ asistentes: [], temas: [], compromisos: [], fotos: [], adjuntos: [] });
  const [enlaces, setEnlaces] = useState({});
  const [convocados, setConvocados] = useState([]);
  // A quién le estamos corrigiendo el correo para reenviarle su copia.
  const [corrigiendo, setCorrigiendo] = useState(null);
  const [correoNuevo, setCorreoNuevo] = useState("");
  const [verConvocados, setVerConvocados] = useState(false);
  // A QUIEN SE OLVIDARON DE PONER EN LA LISTA.
  //
  // Pasa en todas las obras: el acta sale y alguien dice "¿y al fiscalizador no
  // se la mandaron?". Sin esto había que elegir entre dejarlo afuera del
  // registro o reenviarle el acta a los doce que ya la tienen —que es la forma
  // más rápida de que la gente empiece a ignorar las actas—.
  const [tarde, setTarde] = useState(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);
  // Lo que se anota al vuelo durante la reunión, antes de que NOVA lo ordene.
  const [dictado, setDictado] = useState("");
  // Lo que NOVA encontró al revisar: las correcciones se aceptan, los avisos
  // se van a preguntar.
  const [revision, setRevision] = useState(null);
  const [tareas, setTareas] = useState({});
  // Qué filas de asistentes se tocaron y todavía no se guardaron.
  const [sinGuardar, setSinGuardar] = useState(() => new Set());
  // El reloj del guardado solo: se reinicia con cada tecla y dispara cuando
  // alguien deja de escribir.
  const solo = useRef(null);
  useEffect(() => () => clearTimeout(solo.current), []);
  const [nuevo, setNuevo] = useState({
    tema: "", compromiso: "", responsable: "", limite: "", urgente: false,
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
    // Qué pasó con las tareas que salieron de este acta: es lo que deja que el
    // repaso diga "ya se hizo" sin que nadie lo marque dos veces. El que la
    // hizo la cerró en su tablero, que es donde trabaja.
    setTareas(await estadoDeTareas(c.compromisos));
    setEnlaces(await enlacesDeFotos([...c.fotos, ...(c.adjuntos || [])]));
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
    // Las filas que alguien agregó y no llenó. Existen en la base y no son
    // asistentes: ni se cuentan, ni salen en el PDF, ni reciben nada.
    const conNombre = cont.asistentes.filter(a => String(a.nombre || "").trim());
    // El conteo cuenta PERSONAS, no renglones: una persona repetida tres veces
    // sumaba tres asistentes y tres copias del acta.
    const cuantos = cuantosDeVerdad(cont.asistentes);
    const duplicados = repetidos(cont.asistentes);
    const compartidos = correosCompartidos(cont.asistentes);
    const vacias = cont.asistentes.filter(a => !String(a.nombre || "").trim());
    const arrastrados = cont.compromisos.filter(c => c.viene_de);
    /**
     * Cómo se reconoce a la misma persona en las dos listas: por el correo, y
     * si no lo tiene, por el nombre.
     *
     * VA ANTES DEL `return`, y eso no es un detalle de estilo. Estas dos
     * estaban declaradas después, con `const`: una función declarada con
     * `function` se puede usar antes de escribirla, una constante NO. El
     * dibujo las llamaba, JavaScript cortaba con "no se puede acceder antes de
     * inicializar", y React se lleva puesta la pantalla entera. Lo que se ve
     * es un módulo en blanco, sin ninguna pista de qué pasó.
     */
    // Quién puede recibir una tarea: el equipo de FOREMAN. Un externo no
    // tiene cuenta, y una tarea en el tablero de nadie es ruido.
    const equipo = users.filter(u => u.activo !== false);
    const tareaHecha = c => yaSeHizo(c, tareas);
    const clave = x => String(x.email || x.nombre || "").trim().toLowerCase();
    const esDeSiempre = a => convocados.some(c => clave(c) && clave(c) === clave(a));
    /** ¿El correo de esta persona rebotó? Va con `function` y no con `const`:
        se usa arriba del lugar donde está escrito, y una constante no se puede
        leer antes de inicializarse —eso deja la pantalla en blanco—. */
    function malLlego(a) {
      return ["bounced", "complained", "failed", "error"].includes(String(a?.envio_estado || "").toLowerCase());
    }
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
              if (!await tocarActa({ estado: "lista" })) return;
              // Y SE LE AVISA, QUE ERA LO QUE FALTABA. El botón dejaba el acta
              // "lista" y nadie se enteraba: el director lo sabía si alguien se
              // acordaba de escribirle. Ahora le llega el acta en PDF y la
              // aprueba desde el correo, en el teléfono.
              setOcupado(true);
              const r = await pedirElVisto({ acta: abierta, obra: lead?.nombre, cont, enlaces });
              setOcupado(false);
              if (!r.ok) {
                setAviso("");
                setError(`El acta quedó lista, pero el aviso no salió: ${r.error}. `
                  + "Avisale vos, o volvé a apretar el botón.");
                return;
              }
              setError("");
              setAviso(`Pedido el visto a ${r.enviadoA.join(", ") || "quien la aprueba"}. `
                + "Le llegó el acta en PDF y la puede aprobar desde el correo."
                + (r.sinPdf ? " El PDF no entró en el correo por su tamaño: queda guardado y sale con el acta." : ""));
            }}><Check size={13} /> Pedir el visto</Button>
          )}
          {sePuede && !puedeEnviar && abierta.estado === "lista" && (
            <Button variant="secondary" size="sm" disabled={ocupado} onClick={async () => {
              await tocarActa({ estado: "borrador" });
              setAviso("Volvió a borrador: se puede seguir escribiendo.");
            }}>Seguir escribiéndola</Button>
          )}
          {/* VOLVER A PEDIRLO. Un acta que quedó "lista" espera a una persona,
              y esa persona puede no haber visto el correo —o puede no haber
              existido el correo, porque antes pedir el visto no avisaba a
              nadie—. Sin este botón el acta se queda esperando para siempre y
              la única salida es devolverla a borrador y volver a empezar. */}
          {sePuede && !puedeEnviar && abierta.estado === "lista" && (
            <Button variant="primary" size="sm" disabled={ocupado} onClick={async () => {
              setOcupado(true);
              const r = await pedirElVisto({ acta: abierta, obra: lead?.nombre, cont, enlaces });
              setOcupado(false);
              if (!r.ok) { setError(`No salió el aviso: ${r.error}`); return; }
              setError("");
              setAviso(`Se le volvió a pedir el visto a ${r.enviadoA.join(", ") || "quien la aprueba"}.`);
            }}><Send size={13} /> Volver a pedir el visto</Button>
          )}
          {sePuede && puedeEnviar && (abierta.estado === "borrador" || abierta.estado === "lista") && (
            <Button variant="outline" size="sm" disabled={ocupado} onClick={async () => {
              // LAS TAREAS SE CREAN ACÁ, al dar el visto y no antes. Mientras
              // el acta es borrador lo escrito todavía se puede cambiar, y una
              // tarea que aparece y desaparece del tablero de alguien es peor
              // que ninguna.
              const van = paraTarea(cont.compromisos);
              if (van.length && !window.confirm(
                `Al dar el visto se le crea la tarea a ${van.length === 1 ? "una persona" : `${van.length} personas`}:\n\n`
                + van.map(c => `  · ${equipo.find(u => u.id === c.asignado_a)?.name || "?"} — ${c.texto.slice(0, 60)}`).join("\n")
                + "\n\nVan a su tablero de Tareas con la fecha del compromiso. ¿Seguimos?")) return;
              setOcupado(true);
              await tocarActa({ estado: "revisada", revisada_at: new Date().toISOString(),
                revisada_por: currentUser?.id ?? null, revisada_nombre: currentUser?.name || null });
              const r = van.length ? await crearTareas({ compromisos: cont.compromisos, acta: abierta, lead, quien: currentUser }) : { creadas: 0 };
              setOcupado(false);
              if (r.error) { setError("El acta quedó revisada, pero una tarea no se pudo crear: " + r.error); return; }
              await cargarActa(abierta.id);
              setAviso(`Revisada. Ya se puede enviar.${r.creadas ? ` Y ${r.creadas} ${r.creadas === 1 ? "tarea creada" : "tareas creadas"} en el tablero del equipo.` : ""}`);
            }}><Check size={13} /> Dar el visto</Button>
          )}
          {/* UNA PRUEBA A MI PROPIO CORREO, SIN TRABAR EL ACTA.
              Antes de mandarle algo a ocho personas de afuera uno quiere ver
              cómo llega: si el PDF abre, si los anexos están, si los
              compromisos se leen. La única manera era destildar a todos,
              enviar —y ahí el acta queda enviada y no se toca más— y después
              no poder mandarla de verdad. Esto manda solo a quien lo aprieta y
              no cambia el estado: se puede probar las veces que haga falta. */}
          {sePuede && puedeEnviar && currentUser?.email && abierta.estado !== "enviada" && (
            <Button variant="secondary" size="sm" disabled={ocupado}
              onClick={() => enviar({ prueba: true })}
              /* CON LA DIRECCIÓN A LA VISTA. "Probar a mi correo" manda al
                 correo del usuario de FOREMAN, que no siempre es la casilla
                 que uno tiene abierta: así "no me llegó" no se confunde con
                 "llegó a la otra". */
              title={`Manda una copia de prueba a ${currentUser.email} y no cambia el estado del acta`}>
              <Send size={13} /> Probar a {currentUser.email}
            </Button>
          )}
          {sePuede && puedeEnviar && abierta.estado === "revisada" && (
            <Button variant="primary" size="sm" disabled={ocupado || !correos.length} onClick={() => enviar()}>
              <Send size={13} /> {ocupado ? "Enviando…" : `Enviar a ${correos.length}`}
            </Button>
          )}
        </div>

        {aviso && <div style={{ fontSize: 12, color: colors.brand, marginBottom: 10, whiteSpace: "pre-line" }}>{aviso}</div>}

        {/* LO QUE HAY QUE CORREGIR, A LA VISTA.
            Si el acta volvió del visto, el motivo llegó por correo a quien la
            escribió — y un correo se lee una vez. Acá queda, en la pantalla
            donde se corrige, hasta que se vuelva a pedir el visto. */}
        {abierta.visto_nota && abierta.estado !== "enviada" && (
          <div style={{ ...caja, borderColor: colors.warning, background: colors.warningSoft, marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: colors.warning, letterSpacing: 0.3, marginBottom: 4 }}>
              VOLVIÓ DEL VISTO — HAY QUE CORREGIR ESTO
            </div>
            <div style={{ fontSize: 12.5, color: colors.ink, lineHeight: 1.55, whiteSpace: "pre-line" }}>
              {abierta.visto_nota}
            </div>
          </div>
        )}

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

        {/* ── QUIÉN DIO CONFORMIDAD ──────────────────────────────────────────
            El acta sale con un enlace propio para cada uno. Lo que vuelve es
            lo que antes no existía: quién la abrió, quién dijo que está de
            acuerdo —con fecha— y quién escribió que algo no refleja lo
            acordado.

            Las tres cosas son distintas y en una discusión se confunden. "Se
            la mandamos" no prueba nada; "la abrió el martes y no objetó nada
            en 48 horas" sí, y "objetó esto" cambia lo que hay que hacer. Por
            eso están separadas y no resumidas en un número.

            Se mira acá y no en el correo porque el correo es de ida: las
            respuestas llegan de a una, a dos casillas distintas, y a la
            tercera acta nadie sabe quién contestó qué. */}
        {cerrada && conNombre.some(a => a.token || a.email) && (
          <div style={caja}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 9, flexWrap: "wrap" }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.ink, flex: 1 }}>
                Conformidad · {conNombre.filter(a => a.conforme_at).length} de {conNombre.filter(a => a.token || a.email).length}
              </div>
              {/* SE ACTUALIZA SOLO CUANDO SE PIDE. Esto cambia afuera de
                  FOREMAN —alguien aprieta un botón en su teléfono— así que la
                  pantalla abierta desde la mañana muestra lo de la mañana. */}
              <Button variant="secondary" size="sm" disabled={ocupado} onClick={async () => {
                setOcupado(true); setError("");
                // DE PASO SE PREGUNTA SI LLEGARON. El servidor de correo
                // contesta "sent" un segundo después de mandar, que quiere
                // decir "entró el pedido": el rebote aparece minutos más tarde,
                // cuando ya nadie mira la pantalla. Acá se vuelve a preguntar.
                let entrega = null;
                try {
                  const r = await fetch("/api/aviso?de=acta", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ acta_id: abierta.id, revisar: true }),
                  });
                  entrega = await r.json().catch(() => null);
                } catch { /* si no se puede preguntar, al menos se recarga */ }
                await cargarActa(abierta.id);
                setOcupado(false);
                setAviso(entrega?.rebotaron?.length
                  ? `OJO: el acta NO le llegó a ${entrega.rebotaron.join(", ")}. Hay que hacérsela llegar por otro lado.`
                  : "Al día.");
              }}><RefreshCw size={12} /> Ver si contestaron</Button>
            </div>
            {/* QUÉ ENTRA A FOREMAN Y QUÉ NO. Las dos cosas se ven iguales
                desde afuera —las dos son "contestar el acta"— y no lo son:
                una queda registrada y vuelve sola a la próxima reunión, la
                otra es un correo en la casilla de dos personas. Quien manda el
                acta tiene que saber cuál es cuál. */}
            <div style={{ fontSize: 11.5, color: colors.muted, lineHeight: 1.5, marginBottom: 8 }}>
              Lo que escriban desde su enlace aparece acá y entra solo como primer tema de la próxima reunión.
              Si en cambio <strong>responden el correo</strong>, eso no llega a FOREMAN: llega a la casilla de
              quien escribió el acta y de quien le dio el visto, y hay que traerlo a mano.
            </div>
            {conNombre.filter(a => a.token || a.email).map(a => {
              const c = conformidadDe(a);
              const color = c.estado === "conforme" ? colors.success
                : c.estado === "observacion" ? colors.warning
                  : c.estado === "visto" ? colors.inkSoft : colors.muted;
              return (
                <div key={a.id} style={{ display: "flex", gap: 8, alignItems: "flex-start",
                  padding: "7px 0", borderTop: `1px solid ${colors.bg}` }}>
                  <div style={{ flexShrink: 0, color, display: "flex", paddingTop: 1 }}>
                    {c.estado === "conforme" ? <Check size={14} />
                      : c.estado === "observacion" ? <AlertTriangle size={14} />
                        : <Eye size={14} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, color: colors.ink }}>
                      {a.nombre}{a.empresa ? <span style={{ color: colors.muted }}> · {a.empresa}</span> : null}
                    </div>
                    {/* A QUÉ DIRECCIÓN SE LE MANDÓ, ESCRITO.
                        Cuando algo rebota, la pregunta es "¿a qué correo se lo
                        mandaste?" y la respuesta estaba a dos clics, adentro de
                        la ficha del asistente. Acá se ve al lado del estado,
                        que es donde se pregunta. */}
                    {a.email && (
                      <div style={{ fontSize: 10.5, color: colors.muted, overflow: "hidden",
                        textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.email}</div>
                    )}
                    <div style={{ fontSize: 11.5, color, lineHeight: 1.45 }}>
                      {c.estado === "conforme" ? `Dio conformidad el ${dia(String(c.cuando).slice(0, 10))}`
                        : c.estado === "observacion" ? "Escribió una observación"
                          : c.estado === "visto" ? `La abrió el ${dia(String(c.cuando).slice(0, 10))} y no dijo nada`
                            : String(a.envio_estado || "").toLowerCase() === "delivered" ? "Le llegó y todavía no la abrió"
                              : "Todavía no la abrió"}
                    </div>
                    {/* LO QUE HIZO CON EL CORREO, QUE NO ES LO MISMO QUE
                        LO QUE HIZO CON EL ACTA. La mitad de la gente lee el
                        acta en el cuerpo del correo y nunca entra por su
                        enlace: para FOREMAN eso es "no la abrió", y es falso.
                        Esto lo separa — una cosa es que el correo se haya
                        abierto, otra que haya dado conformidad. */}
                    {["opened", "clicked"].includes(String(a.envio_estado || "").toLowerCase()) && !a.conforme_at && (
                      <div style={{ fontSize: 11.5, color: colors.inkSoft, lineHeight: 1.45 }}>
                        {a.envio_estado === "clicked" ? "Entró por su enlace desde el correo" : "Abrió el correo con el acta"}
                        {!a.visto_at && " · todavía no dio conformidad"}
                      </div>
                    )}
                    {/* SI NO LE LLEGÓ, ACÁ Y EN ROJO.
                        Es lo primero que hay que saber de una persona en esta
                        lista: todo lo demás —que no contestó, que no la abrió—
                        se lee distinto si el acta nunca entró en su casilla.
                        Y el plazo de 48 horas no corre para quien no la
                        recibió. */}
                    {malLlego(a) && (
                      <div style={{ fontSize: 11.5, color: colors.danger, fontWeight: 700, lineHeight: 1.45 }}>
                        El acta NO le llegó: {a.envio_estado === "complained" ? "la marcó como no deseada"
                          : a.envio_estado === "error" ? "el envío falló" : "la dirección rebotó"}.
                        Hay que hacérsela llegar por otro lado.
                      </div>
                    )}
                    {/* CORREGIR EL SOBRE, NO EL ACTA.
                        El acta enviada se traba a propósito. Una dirección mal
                        escrita no es parte del acta: es el sobre, y dejarla
                        mal quiere decir que esa persona no la recibió nunca y
                        que el error se repite en todas las que vengan. Se
                        arregla acá, le sale su copia con su propio enlace, y a
                        los otros once no les llega nada —un reenvío a todos
                        por un correo mal escrito es la forma más rápida de que
                        la gente empiece a ignorar las actas—. */}
                    {editable && puedeEnviar && corrigiendo === a.id && (
                      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 5 }}>
                        <input value={correoNuevo} onChange={e => setCorreoNuevo(e.target.value)} type="email"
                          placeholder="correo@…" autoFocus
                          style={{ ...inputStyle, flex: "1 1 180px", minWidth: 150, fontSize: 12, padding: "5px 8px", height: 28 }} />
                        <Button variant="primary" size="sm" disabled={ocupado}
                          onClick={() => corregirYReenviar(a)}>
                          {ocupado ? "Enviando…" : "Guardar y reenviarle"}
                        </Button>
                        <button onClick={() => setCorrigiendo(null)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: colors.muted, fontSize: 11, fontFamily: colors.font }}>
                          cancelar
                        </button>
                      </div>
                    )}
                    {editable && puedeEnviar && corrigiendo !== a.id && !a.conforme_at && (
                      <button onClick={() => { setCorrigiendo(a.id); setCorreoNuevo(a.email || ""); setAviso(""); }}
                        style={{ background: "none", border: "none", padding: "2px 0", cursor: "pointer", fontFamily: colors.font,
                          fontSize: 11.5, fontWeight: malLlego(a) ? 700 : 400,
                          color: malLlego(a) ? colors.danger : colors.muted, textDecoration: "underline" }}>
                        {malLlego(a) ? "Corregir el correo y reenviarle" : "Reenviarle su copia"}
                      </button>
                    )}
                    {/* LA OBSERVACIÓN, ENTERA Y ACÁ.
                        Es lo único que obliga a hacer algo, y es lo que se
                        pierde: llega por el enlace, no por correo, y si no se
                        lee en esta pantalla no se lee en ninguna. Va al repaso
                        de la próxima reunión. */}
                    {c.texto && (
                      <div style={{ fontSize: 12, color: colors.ink, background: colors.warningSoft,
                        border: `1px solid ${colors.warningBorder}`, borderRadius: 6,
                        padding: "6px 9px", marginTop: 4, lineHeight: 1.45, whiteSpace: "pre-line" }}>
                        {c.texto}
                      </div>
                    )}
                  </div>
                  {/* EL ENLACE A MANO. La mitad de la gente de una obra
                      contesta por WhatsApp y no abre el correo. */}
                  <button onClick={async () => {
                    const r = await llaveDeAsistente(a);
                    if (r.error) { setError(r.error); return; }
                    const url = enlaceDeFirma(r.token);
                    try {
                      await navigator.clipboard.writeText(url);
                      setAviso(`Enlace de ${a.nombre} copiado. Es suyo: no se lo pases a otro.`);
                    } catch {
                      setAviso(`Enlace de ${a.nombre}: ${url}`);
                    }
                    if (!a.token) await cargarActa(abierta.id);
                  }} title="Copiar su enlace de conformidad"
                    style={{ background: "none", border: "none", cursor: "pointer", color: colors.muted,
                      display: "flex", flexShrink: 0, padding: 2 }}>
                    <Link2 size={13} />
                  </button>
                </div>
              );
            })}

            {/* FALTÓ ALGUIEN EN LA LISTA.
                El acta ya salió y alguien dice "¿y al fiscalizador no se la
                mandaron?". Las dos salidas que había eran malas: dejarlo fuera
                del registro de la reunión, o reenviarle el acta a los doce que
                ya la tienen. Acá entra, recibe SU copia con SU enlace, y queda
                en los de siempre para que no vuelva a faltar. */}
            {editable && puedeEnviar && (
              tarde ? (
                <div style={{ borderTop: `1px solid ${colors.border}`, marginTop: 8, paddingTop: 9, display: "grid", gap: 6 }}>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <input autoFocus value={tarde.nombre} placeholder="Nombre"
                      onChange={e => setTarde(t => ({ ...t, nombre: e.target.value }))}
                      style={{ ...inputStyle, flex: "1 1 150px", fontSize: 12, padding: "6px 9px" }} />
                    <input value={tarde.empresa} placeholder="Empresa"
                      onChange={e => setTarde(t => ({ ...t, empresa: e.target.value }))}
                      style={{ ...inputStyle, flex: "1 1 130px", fontSize: 12, padding: "6px 9px" }} />
                    <input value={tarde.email} placeholder="correo@…" type="email"
                      onChange={e => setTarde(t => ({ ...t, email: e.target.value }))}
                      style={{ ...inputStyle, flex: "1 1 190px", fontSize: 12, padding: "6px 9px" }} />
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    {/* VINO O NO VINO, QUE NO ES LO MISMO QUE RECIBIRLA.
                        Un acta dice quién estuvo en la reunión. Marcar como
                        asistente a alguien que no fue es falsificar el acta
                        para arreglar una lista de correo. */}
                    <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: colors.inkSoft, cursor: "pointer" }}>
                      <input type="checkbox" checked={!!tarde.asistio}
                        onChange={e => setTarde(t => ({ ...t, asistio: e.target.checked }))} />
                      Vino a la reunión
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: colors.inkSoft, cursor: "pointer" }}
                      title="Queda en «los de siempre» y entra solo en las próximas actas de esta obra">
                      <input type="checkbox" checked={!!tarde.deSiempre}
                        onChange={e => setTarde(t => ({ ...t, deSiempre: e.target.checked }))} />
                      Que quede en los de siempre
                    </label>
                    <Button variant="primary" size="sm" disabled={ocupado} onClick={agregarYMandarle}>
                      {ocupado ? "Mandando…" : "Agregarlo y mandarle el acta"}
                    </Button>
                    <button onClick={() => setTarde(null)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: colors.muted,
                        fontSize: 11.5, fontFamily: colors.font }}>cancelar</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => { setTarde({ nombre: "", empresa: "", email: "", asistio: false, deSiempre: true }); setAviso(""); }}
                  style={{ background: "none", border: "none", padding: "9px 0 0", cursor: "pointer", fontFamily: colors.font,
                    fontSize: 11.5, color: colors.brand, textDecoration: "underline" }}>
                  Faltó alguien: agregarlo y mandarle su copia
                </button>
              )
            )}
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
            {arrastrados.map(c => <Repaso key={c.id} c={c} sePuede={sePuede} tareaHecha={tareaHecha}
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
            {/* EL CONTEO CUENTA GENTE, NO FILAS.
                Decía "7 de 7" con las siete filas en blanco: contaba renglones
                de formulario, no personas. Alguien lee ese número, ve que los
                campos están vacíos y no sabe cuál de las dos cosas creer. */}
            {/* DOS NÚMEROS, PORQUE SON DOS COSAS.
                Quién vino es lo que el acta prueba; a quién se le manda es otra
                decisión —al que faltó también se le manda, y a veces a alguien
                que no estuvo en la reunión—. Con un solo número ("5 de 7") no
                se sabe a cuántos les va a llegar, que es justo lo que uno mira
                antes de apretar Enviar. */}
            <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.ink, flex: 1 }}>
              Asistentes · {cuantos.vinieron} de {cuantos.personas} vinieron
              <span style={{ fontWeight: 400, color: colors.muted }}>
                {" · "}{cuantos.reciben} {cuantos.reciben === 1 ? "copia" : "copias"} del acta
                {cuantos.sinCorreo ? ` · ${cuantos.sinCorreo} sin correo` : ""}
              </span>
            </div>
            {editable && convocados.length > 0 && (
              /* TRAERLOS A ESTA ACTA, no solo a las que vengan.
                 Los convocados entran solos cuando se abre una reunión nueva,
                 pero si se cargaron después —o si el acta se abrió antes de
                 que existieran— no hay forma de meterlos sin escribirlos de
                 nuevo uno por uno. Y son siempre los mismos: ese es el punto. */
              <Button variant="primary" size="sm" disabled={ocupado} onClick={async () => {
                const ya = new Set(cont.asistentes.map(a => String(a.email || a.nombre || "").toLowerCase()).filter(Boolean));
                const faltan = convocados.filter(c => !ya.has(String(c.email || c.nombre || "").toLowerCase()));
                if (!faltan.length) { setAviso("Ya están todos los de siempre en esta acta."); return; }
                setOcupado(true);
                for (let i = 0; i < faltan.length; i++) {
                  const c = faltan[i];
                  await guardarFila("acta_asistentes", {
                    acta_id: abierta.id, nombre: c.nombre, empresa: c.empresa, cargo: c.cargo,
                    email: c.email, asistio: true, recibe: !!c.email, orden: cont.asistentes.length + i,
                  });
                }
                setOcupado(false);
                await cargarActa(abierta.id);
                setAviso(`${faltan.length} ${faltan.length === 1 ? "convocado agregado" : "convocados agregados"}.`);
              }}>
                <Users size={12} /> Traer los de siempre
              </Button>
            )}
            {editable && (
              <Button variant="secondary" size="sm" onClick={() => setVerConvocados(v => !v)}>
                {convocados.length ? "Editar los de siempre" : "Cargar los de siempre"}
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
          {/* LA MISMA PERSONA, DOS VECES.
              La lista se arma de tres lados —los convocados que entran solos,
              el que alguien agrega a mano, el que llega tarde— y ninguno mira
              si esa persona ya estaba. Queda repetida y, peor, repetida con
              valores que se contradicen: la misma persona marcada como que vino
              y como que no. Un acta es la prueba de quién estuvo: si dice las
              dos cosas, no prueba ninguna. */}
          {sePuede && duplicados.length > 0 && (
            <div style={{ fontSize: 11.5, color: colors.warning, background: colors.warningSoft,
              border: `1px solid ${colors.warningBorder}`, borderRadius: colors.radiusSm,
              padding: "7px 10px", marginBottom: 7, lineHeight: 1.5 }}>
              {duplicados.map(g => {
                const { queda, sobran } = comoQuedan(g);
                const sePelean = g.some(a => !!a.asistio !== !!queda.asistio);
                return (
                  <div key={queda.id} style={{ marginBottom: 3 }}>
                    <strong>{queda.nombre}</strong> está {g.length} veces
                    {sePelean ? ", y las filas no dicen lo mismo sobre si vino" : ""}.{" "}
                    <button onClick={async () => {
                      // SE ESCRIBE DERECHO A LA BASE, no pasando por el estado
                      // de la pantalla: `cambiarAsistente` guarda con retardo y
                      // lee lo que había antes, así que juntar y borrar en el
                      // mismo gesto perdería lo que acaba de quedar escrito.
                      setOcupado(true); setError("");
                      const { error: e } = await guardarFila("acta_asistentes", {
                        id: queda.id, nombre: queda.nombre || "", empresa: queda.empresa || null,
                        cargo: queda.cargo || null, email: queda.email || null,
                        asistio: !!queda.asistio, recibe: !!queda.recibe,
                      });
                      if (e) { setOcupado(false); setError(`No se pudo juntar: ${e}`); return; }
                      for (const a of sobran) await quitarFila("acta_asistentes", "asistentes", a.id);
                      await cargarActa(abierta.id);
                      setOcupado(false);
                      setAviso(`${queda.nombre} quedó en una sola fila${queda.asistio ? ", marcada como que vino" : ""}.`);
                    }}
                      style={{ background: "none", border: "none", padding: 0, cursor: "pointer",
                        fontFamily: colors.font, fontSize: 11.5, color: colors.brand, textDecoration: "underline" }}>
                      juntarlas en una
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* DOS PERSONAS EN LA MISMA CASILLA. No se juntan —son dos— pero el
              acta sale de a un correo por dirección: a esa casilla le llega una
              sola copia, con el enlace de conformidad de una sola de las dos. */}
          {compartidos.length > 0 && (
            <div style={{ fontSize: 11.5, color: colors.muted, marginBottom: 7, lineHeight: 1.5 }}>
              {compartidos.map(x => (
                <div key={x.email}>
                  {x.gente.map(a => a.nombre).join(" y ")} comparten <strong>{x.email}</strong>: les va a llegar
                  una sola copia, y el enlace de conformidad va a quedar a nombre de uno solo.
                </div>
              ))}
            </div>
          )}

          {/* LAS DOS CASILLAS, DICHAS. Eran dos cuadraditos sin rótulo —uno al
              principio de la fila y otro al final— y nadie puede adivinar que
              el primero es "vino a la reunión" y el segundo "le llega el acta".
              Son las dos decisiones de este bloque y son independientes. */}
          {cont.asistentes.length > 0 && (
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 3, fontSize: 9.5,
              fontWeight: 700, color: colors.muted, letterSpacing: 0.3 }}>
              <span style={{ width: 13, textAlign: "center" }}>¿VINO?</span>
              <span style={{ flex: 1, paddingLeft: 24 }}>QUIÉN</span>
              <span>LE LLEGA EL ACTA</span>
            </div>
          )}
          {cont.asistentes.map(a => (
            <div key={a.id} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
              <input type="checkbox" checked={!!a.asistio} disabled={!sePuede} title="¿Vino a la reunión?"
                onChange={e => cambiarAsistente(a.id, { asistio: e.target.checked })} />
              <input value={a.nombre || ""} disabled={!sePuede} placeholder="Nombre"
                onChange={e => cambiarAsistente(a.id, { nombre: e.target.value })}
                style={{ ...inputStyle, flex: "1 1 130px", minWidth: 100, fontSize: 12, padding: "5px 8px", height: 28,
                  color: a.asistio ? colors.ink : colors.muted }} />
              <input value={a.empresa || ""} disabled={!sePuede} placeholder="Empresa"
                onChange={e => cambiarAsistente(a.id, { empresa: e.target.value })}
                style={{ ...inputStyle, flex: "1 1 110px", minWidth: 90, fontSize: 12, padding: "5px 8px", height: 28 }} />
              {/* DE QUÉ ES RESPONSABLE. La columna existía en la base desde el
                  principio y nunca estuvo en la pantalla. Hace falta porque en
                  una reunión de obra el responsable de un compromiso casi
                  nunca se nombra por su empresa sino por su frente: "lo ve
                  eléctrica", "eso es del área mecánica". Sin esto, el acta
                  dice un nombre propio y quien la lee tres días después no
                  sabe a qué frente pertenece. */}
              <input value={a.cargo || ""} disabled={!sePuede} placeholder="Responsable de…"
                onChange={e => cambiarAsistente(a.id, { cargo: e.target.value })}
                title="De qué es responsable, o su cargo. Ej: Eléctrica · Área mecánica · Fiscalización"
                style={{ ...inputStyle, flex: "1 1 120px", minWidth: 95, fontSize: 12, padding: "5px 8px", height: 28 }} />
              <input value={a.email || ""} disabled={!sePuede} placeholder="correo@…" type="email"
                onChange={e => cambiarAsistente(a.id, { email: e.target.value })}
                style={{ ...inputStyle, flex: "1 1 150px", minWidth: 120, fontSize: 12, padding: "5px 8px", height: 28 }} />
              {/* MARCADO Y SIN CORREO NO ES QUE LE LLEGA: es que no le llega y
                  nadie se entera. Lo dice la casilla, en el momento. */}
              <label title={String(a.email || "").trim() ? "Le llega el acta por correo" : "Falta el correo: marcado así, no le va a llegar"}
                style={{ fontSize: 10.5, display: "flex", gap: 3, alignItems: "center",
                  color: a.recibe && !String(a.email || "").trim() ? colors.warning : colors.muted }}>
                <input type="checkbox" checked={!!a.recibe} disabled={!sePuede}
                  onChange={e => cambiarAsistente(a.id, { recibe: e.target.checked })} />
                {a.recibe && !String(a.email || "").trim() ? "falta el correo" : "le llega"}
              </label>
              {/* QUE ESTA PERSONA PASE A LOS DE SIEMPRE.
                  En una reunión entra gente que viene una vez —un proveedor
                  que presenta algo, un técnico— y gente que va a estar en
                  todas. Quien llena la lista sabe cuál es cuál en el momento,
                  y es el único momento en que lo sabe: tres días después nadie
                  vuelve a una pantalla de configuración a cargar a alguien.
                  Por eso la decisión se toma acá, en la misma fila. */}
              {sePuede && (
                <button onClick={() => fijarConvocado(a)}
                  title={esDeSiempre(a) ? "Ya está en los de siempre" : "Guardarlo en los de siempre: va a entrar solo en cada reunión"}
                  disabled={esDeSiempre(a) || !String(a.nombre || "").trim()}
                  style={{ background: "none", border: "none", display: "flex", padding: 0,
                    cursor: esDeSiempre(a) || !String(a.nombre || "").trim() ? "default" : "pointer",
                    color: esDeSiempre(a) ? colors.brand : colors.border }}>
                  <Star size={13} fill={esDeSiempre(a) ? colors.brand : "none"} />
                </button>
              )}
              {sePuede && (
                <button onClick={() => quitarFila("acta_asistentes", "asistentes", a.id)}
                  title="Sacarlo de esta acta"
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
              {/* ALGUIEN DE AFUERA QUE NO VINO Y TIENE QUE SABER.
                  El gerente del cliente que no fue a la reunión, el proyectista
                  que decide sobre lo que se habló, el abogado. A todos ellos se
                  les manda el acta igual, y hasta ahora había que agregarlos
                  como asistentes y acordarse de destildar "¿vino?" — con lo que
                  el acta decía que estuvieron en una reunión a la que no fueron.
                  Eso no es un detalle: el acta es la prueba de quién estuvo. */}
              <Button variant="secondary" size="sm"
                title="Entra a la lista para recibir el acta, pero el acta no va a decir que asistió"
                onClick={() => agregar("acta_asistentes", { nombre: "", asistio: false, recibe: true }, "asistentes")}>
                <Plus size={12} /> Agregar a alguien que no vino
              </Button>
              <Button variant="primary" size="sm" disabled={ocupado || !sinGuardar.size} onClick={guardarAsistentes}>
                {ocupado ? "Guardando…" : sinGuardar.size ? `Guardar ${sinGuardar.size === 1 ? "el cambio" : `los ${sinGuardar.size} cambios`}` : "Guardado"}
              </Button>
              {sinGuardar.size > 0 && (
                <span style={{ fontSize: 10.5, color: colors.warning, fontWeight: 600 }}>
                  Guardando…
                </span>
              )}
            </div>
          )}
          {vacias.length > 0 && sePuede && (
            <div style={{ fontSize: 11, color: colors.warning, marginTop: 7, lineHeight: 1.45 }}>
              Hay {vacias.length} {vacias.length === 1 ? "fila sin llenar" : "filas sin llenar"}: no cuentan como
              asistentes, no salen en el PDF y no reciben el acta.{" "}
              <button onClick={async () => {
                for (const a of vacias) await quitarFila("acta_asistentes", "asistentes", a.id);
                setAviso(`${vacias.length} ${vacias.length === 1 ? "fila vacía quitada" : "filas vacías quitadas"}.`);
              }}
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: colors.font,
                  fontSize: 11, color: colors.brand, textDecoration: "underline" }}>quitarlas</button>
            </div>
          )}
          {!cont.asistentes.some(a => !a.asistio) && conNombre.length > 0 && (
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
              {/* SE EDITAN ACÁ MISMO. Antes solo se podían agregar y borrar:
                  para corregir un correo mal escrito había que borrar a la
                  persona y volver a escribirla entera, y eso además la saca de
                  la lista mientras tanto. Un correo cambia; una persona no se
                  borra por una letra. */}
              {convocados.map(c => (
                <div key={c.id} style={{ display: "flex", gap: 5, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
                  <input defaultValue={c.nombre} key={`cn${c.id}-${c.nombre}`} placeholder="Nombre"
                    onBlur={e => tocarConvocado(c, { nombre: e.target.value })}
                    style={{ ...inputStyle, flex: "1 1 110px", minWidth: 90, fontSize: 12, padding: "4px 7px", height: 26 }} />
                  <input defaultValue={c.empresa || ""} key={`ce${c.id}-${c.empresa}`} placeholder="Empresa"
                    onBlur={e => tocarConvocado(c, { empresa: e.target.value || null })}
                    style={{ ...inputStyle, flex: "1 1 95px", minWidth: 80, fontSize: 12, padding: "4px 7px", height: 26 }} />
                  <input defaultValue={c.cargo || ""} key={`cc${c.id}-${c.cargo}`} placeholder="Responsable de…"
                    onBlur={e => tocarConvocado(c, { cargo: e.target.value || null })}
                    style={{ ...inputStyle, flex: "1 1 105px", minWidth: 85, fontSize: 12, padding: "4px 7px", height: 26 }} />
                  <input defaultValue={c.email || ""} key={`cm${c.id}-${c.email}`} placeholder="correo@…" type="email"
                    onBlur={e => tocarConvocado(c, { email: e.target.value || null })}
                    style={{ ...inputStyle, flex: "1 1 140px", minWidth: 110, fontSize: 12, padding: "4px 7px", height: 26 }} />
                  <button onClick={async () => {
                    if (!window.confirm(`¿Sacar a ${c.nombre} de los de siempre?\n\nNo se toca ninguna acta ya escrita: deja de entrar solo en las nuevas.`)) return;
                    await borrarConvocado(c.id); setConvocados(await convocadosDe(lead.id));
                  }}
                    title="Sacarlo de los de siempre"
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
                <input value={nuevo.convocado.cargo} placeholder="Responsable de…"
                  onChange={e => setNuevo(v => ({ ...v, convocado: { ...v.convocado, cargo: e.target.value } }))}
                  title="De qué es responsable, o su cargo. Ej: Eléctrica · Área mecánica · Fiscalización"
                  style={{ ...inputStyle, flex: "1 1 110px", fontSize: 12, padding: "5px 8px", height: 28 }} />
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
          {nuevos.map(c => <Compromiso key={c.id} c={c} sePuede={sePuede} equipo={equipo}
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
              <textarea value={nuevo.compromiso} placeholder="Qué hay que hacer" rows={2}
                onChange={e => setNuevo(v => ({ ...v, compromiso: e.target.value }))}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ponerCompromiso(); } }}
                style={{ ...inputStyle, flex: "2 1 240px", minWidth: 160, fontSize: 12.5, padding: "6px 9px",
                  lineHeight: 1.4, resize: "vertical", fontFamily: colors.font }} />
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
              {/* URGENTE: SI NO SE HACE, PARA LA OBRA.
                  En un acta todos los compromisos se ven iguales —una línea
                  con un nombre y una fecha— y no lo son. Quien estuvo en la
                  reunión sabe cuál destraba todo; quien lee el acta tres días
                  después, no. Una lista de doce renglones iguales se atiende
                  de arriba hacia abajo, o no se atiende. */}
              <label title="Si no se hace, para la obra"
                style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11.5,
                  color: nuevo.urgente ? colors.danger : colors.muted, fontWeight: nuevo.urgente ? 700 : 400, cursor: "pointer" }}>
                <input type="checkbox" checked={!!nuevo.urgente}
                  onChange={e => setNuevo(v => ({ ...v, urgente: e.target.checked }))} />
                urgente
              </label>
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

        {/* ANEXOS: lo que respalda lo que se decidió.
            Un acta que dice "se aprueba el cambio según el plano presentado" y
            no lleva el plano no sirve tres meses después: nadie va a poder
            decir CUÁL plano, y la decisión queda tan floja como si no se
            hubiera escrito. El documento que respalda el acuerdo tiene que
            viajar con el acuerdo.
            Aparte de las fotos porque se usan distinto: una foto se mira, un
            anexo se abre y se guarda. */}
        <div style={caja}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
            <Paperclip size={14} color={colors.muted} />
            <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.ink, flex: 1 }}>
              Anexos · {cont.adjuntos.length}
            </div>
            {sePuede && (
              <label style={{ cursor: "pointer" }}>
                <input type="file" multiple style={{ display: "none" }}
                  onChange={async e => {
                    const files = [...e.target.files];
                    e.target.value = "";
                    setOcupado(true); setError("");
                    for (let i = 0; i < files.length; i++) {
                      const r = await subirAdjunto({ actaId: abierta.id, file: files[i], quien: currentUser, orden: cont.adjuntos.length + i });
                      if (r.error) { setError(r.error); break; }
                    }
                    setOcupado(false);
                    await cargarActa(abierta.id);
                  }} />
                <span style={{ fontSize: 12, color: colors.brand, fontWeight: 600 }}>
                  {ocupado ? "Subiendo…" : "+ Adjuntar archivos"}
                </span>
              </label>
            )}
          </div>
          <div style={{ fontSize: 11, color: colors.muted, marginBottom: 8, lineHeight: 1.45 }}>
            El plano sobre el que se decidió, la proforma que se discutió, el informe que mandó el proveedor.
            Van adjuntos en el correo, así que el que lo recibe no necesita entrar a FOREMAN.
          </div>
          {cont.adjuntos.map(f => (
            <div key={f.id} style={{ display: "flex", gap: 7, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
              <a href={enlaces[f.storage_path] || "#"} target="_blank" rel="noreferrer"
                style={{ fontSize: 12, color: colors.brand, textDecoration: "none", flex: "1 1 160px",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.nombre}</a>
              <span style={{ fontSize: 10.5, color: colors.muted, flexShrink: 0 }}>
                {f.bytes ? `${Math.max(1, Math.round(f.bytes / 1024))} KB` : ""}
              </span>
              <input defaultValue={f.descripcion || ""} disabled={!sePuede} placeholder="¿Qué es?"
                onBlur={e => tocarFila("acta_adjuntos", "adjuntos", f.id, { descripcion: e.target.value || null })}
                style={{ ...inputStyle, flex: "1 1 160px", minWidth: 110, fontSize: 11.5, padding: "4px 7px", height: 26 }} />
              {sePuede && (
                <button onClick={() => quitarFila("acta_adjuntos", "adjuntos", f.id)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: colors.muted, display: "flex" }}>
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
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
    /**
     * Lo escrito queda en memoria, se marca, y se guarda solo al rato.
     *
     * EL BOTÓN NO ALCANZA. Alguien escribe ocho nombres y ocho correos, lo
     * llaman de la obra, cierra la pestaña y no apretó nada. Lo que se pierde
     * no es un campo: es el trabajo de llenar la lista entera, y la próxima
     * vez esa persona no la llena.
     *
     * Se guarda un segundo y medio después de la última tecla —no en cada
     * letra, que serían treinta escrituras por nombre— y el botón se queda
     * igual, para quien quiere asegurarse y para ver que no quedó nada
     * pendiente.
     */
    function cambiarAsistente(id, campos) {
      setCont(c => ({ ...c, asistentes: c.asistentes.map(x => (x.id === id ? { ...x, ...campos } : x)) }));
      setSinGuardar(v => new Set(v).add(id));
      clearTimeout(solo.current);
      solo.current = setTimeout(() => { guardarAsistentes(true); }, 1500);
    }

    async function guardarAsistentes(solito = false) {
      clearTimeout(solo.current);
      if (!sinGuardar.size) return;
      if (!solito) setOcupado(true);
      setError("");
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
      if (!solito) setOcupado(false);
      if (fallaron.length) { setError(fallaron[0]); return; }
      setSinGuardar(new Set());
      if (!solito) setAviso("Asistentes guardados.");
    }

    async function fijarConvocado(a) {
      if (!String(a.nombre || "").trim() || esDeSiempre(a)) return;
      const { error: e } = await guardarConvocado({
        lead_id: lead.id, nombre: a.nombre, empresa: a.empresa || null,
        cargo: a.cargo || null, email: a.email || null, orden: convocados.length,
      });
      if (e) { setError(e); return; }
      setConvocados(await convocadosDe(lead.id));
      setAviso(`${a.nombre} queda en los de siempre: va a entrar solo en cada reunión nueva.`);
    }

    async function tocarConvocado(c, campos) {
      if (Object.entries(campos).every(([k, v]) => (c[k] || null) === (v || null))) return;
      const { error: e } = await guardarConvocado({ id: c.id, ...campos });
      if (e) { setError(e); return; }
      setError("");
      setConvocados(await convocadosDe(lead.id));
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
          acta_id: abierta.id, texto: c.texto, estado: "pendiente", urgente: !!c.urgente,
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
      const { compromiso, responsable, limite, urgente } = nuevo;
      setNuevo(v => ({ ...v, compromiso: "", responsable: "", limite: "", urgente: false }));
      const quienEs = cont.asistentes.find(a => a.nombre === responsable.trim());
      await agregar("acta_compromisos", {
        texto: compromiso.trim(), estado: "pendiente", urgente: !!urgente,
        responsable_nombre: responsable.trim() || null,
        responsable_email: quienEs?.email || null,
        fecha_limite: limite || null,
      }, "compromisos");
    }

    /**
     * EL CORREO ESTABA MAL: SE ARREGLA Y SE LE MANDA, SIN TOCAR EL ACTA.
     *
     * Un acta enviada no se modifica —ese es el punto de que se trabe— pero
     * una dirección mal escrita no es parte del acta: es el sobre. Dejarla
     * mal significa que esa persona no la recibió nunca y que el error se
     * repite en todas las actas que vengan.
     *
     * Por eso se corrige en los dos lados: en esta acta, para que su copia
     * salga ahora, y en "los de siempre", para que la próxima reunión no
     * arranque con el mismo error.
     */
    /**
     * El que faltaba en la lista: entra al acta, recibe SU copia y queda.
     *
     * Las tres cosas juntas y en ese orden. Si solo se le manda el correo, el
     * acta sigue diciendo que esa persona no estaba en la reunión y su
     * conformidad no tiene dónde anotarse. Si solo se lo agrega, nadie le
     * avisa. Y si no queda en los de siempre, el mes que viene falta de nuevo:
     * una lista que hay que corregir todos los meses no es una lista.
     */
    async function agregarYMandarle() {
      const nombre = String(tarde?.nombre || "").trim();
      const email = String(tarde?.email || "").trim().toLowerCase();
      if (!nombre) { setError("Escribí el nombre."); return; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) { setError("Ese correo no está bien escrito."); return; }
      if (cont.asistentes.some(x => String(x.email || "").trim().toLowerCase() === email)) {
        setError("Esa dirección ya está en la lista de esta acta."); return;
      }
      setOcupado(true); setError("");

      const { fila: puesta, error: e } = await guardarFila("acta_asistentes", {
        acta_id: abierta.id, nombre, empresa: String(tarde.empresa || "").trim() || null,
        email, asistio: !!tarde.asistio, recibe: true, orden: cont.asistentes.length,
      });
      if (e) { setOcupado(false); setError(e); return; }
      setCont(c => ({ ...c, asistentes: [...c.asistentes, puesta] }));

      // En los de siempre, si no estaba ya. Comparado por correo, que es lo
      // único que no se escribe de dos maneras distintas.
      if (tarde.deSiempre && !convocados.some(c2 => String(c2.email || "").trim().toLowerCase() === email)) {
        await guardarConvocado({ lead_id: lead.id, nombre, email,
          empresa: String(tarde.empresa || "").trim() || null, orden: convocados.length });
        setConvocados(await convocadosDe(lead.id));
      }

      setTarde(null);
      setOcupado(false);
      // Solo a él: los otros doce ya la tienen, y un reenvío a todos por una
      // persona que faltaba es la forma más rápida de que dejen de abrirlas.
      await enviar({ soloA: email });
    }

    async function corregirYReenviar(a) {
      const antes = String(a.email || "").trim().toLowerCase();
      const nuevo = String(correoNuevo ?? "").trim().toLowerCase() || antes;
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(nuevo)) { setError("Ese correo no está bien escrito."); return; }
      setOcupado(true); setError("");
      if (nuevo !== antes) {
        const r = await guardarFila("acta_asistentes", { id: a.id, email: nuevo });
        if (r.error) { setOcupado(false); setError(r.error); return; }
        // TODAS LAS FICHAS DE ESA PERSONA, no la primera que aparezca.
        //
        // En los de siempre la misma persona puede estar dos veces —se la
        // cargó, se la volvió a cargar con otro correo— y corrigiendo una sola
        // la otra sigue ahí con la dirección mala. La próxima acta la trae de
        // vuelta y el correo vuelve a rebotar: la corrección parecía no
        // guardarse, y lo que pasaba es que se guardaba en el lugar equivocado.
        const suyos = convocados.filter(c => clave(c)
          && (clave(c) === antes || clave(c) === String(a.nombre || "").trim().toLowerCase()));
        for (const suyo of suyos) await guardarConvocado({ id: suyo.id, lead_id: lead.id, email: nuevo });
        if (suyos.length) setConvocados(await convocadosDe(lead.id));
        setCont(c => ({ ...c, asistentes: c.asistentes.map(x => (x.id === a.id ? { ...x, email: nuevo } : x)) }));
      }
      setOcupado(false);
      await enviar({ soloA: nuevo });
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

    /**
     * @param soloA  mandársela a una sola dirección, con el acta ya enviada.
     *   Es el caso del rebote: la dirección estaba mal, se corrige y esa
     *   persona recibe su copia —con su propio enlace— sin volver a mandarle
     *   el acta a los otros once, que ya la tienen. Un reenvío a todos por un
     *   correo mal escrito es la forma más rápida de que la gente empiece a
     *   ignorar las actas.
     */
    async function enviar({ prueba = false, soloA = null } = {}) {
      const destino = prueba ? [String(currentUser.email).trim().toLowerCase()] : soloA ? [soloA] : correos;
      if (!destino.length) { setError(prueba ? "Tu usuario no tiene correo cargado." : "Nadie tiene correo para recibirla."); return; }
      if (!prueba && !soloA && !window.confirm(
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
      // EL PEDIDO TIENE UN TECHO Y NO ES NUESTRO.
      //
      // El PDF viaja adentro del pedido y Vercel no acepta pedidos de más de
      // 4,5 MB: pasado eso la función se cae antes de leer una línea, y lo que
      // llega a la pantalla es un 500 sin explicación. Un acta con fotos lo
      // pasaba sin problema.
      //
      // Antes que no mandar el acta, se manda sin el adjunto: el acta entera
      // va igual en el cuerpo del correo, que es como la va a leer la mitad de
      // la gente. Y se dice, para que quien la mandó sepa que al PDF hay que
      // mandarlo aparte.
      let sinPdf = false;
      if (adjunto?.contenido && adjunto.contenido.length > 3.6e6) { sinPdf = true; adjunto = null; }

      const r = await fetch("/api/aviso?de=acta", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acta_id: abierta.id, para: destino, adjunto, conAnexos: true, prueba }),
      });
      const data = await r.json().catch(() => ({}));
      setOcupado(false);
      // QUÉ DECIR CUANDO NO HAY NADA QUE DECIR.
      //
      // Si el servidor se corta —por tiempo o por tamaño— no devuelve JSON:
      // devuelve una página de error, y acá quedaba "No se pudo enviar el
      // acta" a secas. Eso no se puede arreglar ni contar: no distingue "una
      // dirección rebotó" de "la función se cortó a los diez segundos". El
      // código de respuesta sí lo distingue, así que se dice.
      if (!r.ok || data?.error) {
        setError(data?.error || (r.status === 504 || r.status === 502
          ? `El servidor se cortó mandando el acta (${r.status}). Si tiene muchos anexos, probá destildando "anexos" o mandala a menos gente.`
          : r.status === 413
            ? "El acta con el PDF y los anexos pesa demasiado para un correo. Saca algún anexo y volvé a intentar."
            : `No se pudo enviar el acta (${r.status}).`));
        return;
      }
      // SE MARCA ENVIADA A LOS QUE SALIERON, no a los que se intentó. Un
      // acta que dice "enviada a ocho" cuando dos rebotaron es una mentira
      // que se descubre tarde, en la reunión siguiente, cuando dos personas
      // dicen que nunca la vieron.
      const salieron = Array.isArray(data?.entregados) && data.entregados.length ? data.entregados : destino;
      if (prueba) {
        // Una prueba no cambia nada: el acta sigue donde estaba y se puede
        // probar otra vez. Si la marcara enviada, el primer ensayo la trabaría.
        setAviso(`Prueba enviada a ${destino[0]}${data?.estado ? ` · el servidor de correo dice "${data.estado}"` : ""}.`
          + " Trae el enlace de conformidad de la primera persona de la lista, para que lo puedas abrir y probar el botón."
          + " Si no llega en un par de minutos, mirá el spam: un correo nuevo de un remitente que nunca te escribió suele caer ahí la primera vez."
          + (data?.aviso ? `\n\n${data.aviso}` : "")
          + (sinPdf ? "\n\nEl PDF no viajó: pesa más de lo que admite un envío. El acta va entera en el cuerpo igual. Si lo necesitan adjunto, bajalo con «Ver el PDF» y mandalo aparte." : "")
          + " El acta sigue como está.");
        return;
      }
      if (soloA) {
        // No se vuelve a marcar enviada ni se pisa la fecha: ya lo está. Lo
        // único que cambia es que ahora la lista de a quién le llegó dice la
        // verdad.
        const ya = abierta.enviada_a || [];
        await tocarActa({ enviada_a: [...new Set([...ya, ...salieron])] });
        await cargarActa(abierta.id);
        setCorrigiendo(null);
        setAviso(`Reenviada a ${soloA}. Le llega su propio enlace para dar conformidad.`);
        return;
      }
      await tocarActa({ estado: "enviada", enviada_at: new Date().toISOString(), enviada_a: salieron });
      await cargarActa(abierta.id);
      setAviso(`Enviada a ${salieron.length} ${salieron.length === 1 ? "correo" : "correos"}.`
        + " Cada uno recibió su enlace para dar conformidad; acá abajo vas viendo quién contestó."
        + (data?.aviso ? `\n\n${data.aviso}` : "")
        + (sinPdf ? "\n\nEl PDF no viajó adjunto: pesa más de lo que admite un envío. El acta fue entera en el cuerpo del correo." : ""));
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
            setAviso([
              `Acta N° ${r.acta.numero}.`,
              r.arrastrados && `Traje ${r.arrastrados} ${r.arrastrados === 1 ? "compromiso pendiente" : "compromisos pendientes"} de la anterior.`,
              // Lo que alguien objetó por su enlace entra como primer tema: es
              // lo único del circuito que obliga a discutir algo, y si no
              // aparece acá no aparece en ningún lado.
              r.observaciones && `Y ${r.observaciones === 1 ? "una observación que hicieron" : `${r.observaciones} observaciones que hicieron`} al acta anterior, como primer tema.`,
            ].filter(Boolean).join(" "));
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
const Repaso = ({ c, sePuede, onTocar, quien, tareaHecha = () => false }) => {
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
            color: hecho || anulado ? colors.muted : c.urgente ? colors.danger : colors.ink,
            fontWeight: c.urgente && !hecho && !anulado ? 600 : 400,
            textDecoration: hecho || anulado ? "line-through" : "none" }}>
            {c.urgente && !hecho && !anulado && (
              <span style={{ fontSize: 9, fontWeight: 700, color: "#fff", background: colors.danger,
                borderRadius: 9, padding: "1px 6px", marginRight: 5 }}>URGENTE</span>
            )}
            {c.texto}
          </div>
          <div style={{ fontSize: 10.5, color: colors.muted, marginTop: 1 }}>
            {c.responsable_nombre || "sin responsable"}
            {c.fecha_limite && <span style={{ color: vencido ? colors.danger : colors.muted, fontWeight: vencido ? 600 : 400 }}>
              {" · "}era para el {dia(c.fecha_limite)}{vencido ? " · vencido" : ""}
            </span>}
            {hecho && c.cerrado_nombre && ` · lo dio por hecho ${c.cerrado_nombre}`}
            {!hecho && c.tarea_id && tareaHecha(c) && (
              <span style={{ color: colors.success, fontWeight: 600 }}> · su tarea ya está completada</span>
            )}
            {!hecho && c.tarea_id && !tareaHecha(c) && (
              <span style={{ color: colors.muted }}> · tiene tarea en el tablero</span>
            )}
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
const Compromiso = ({ c, sePuede, onTocar, onQuitar, quien, equipo = [] }) => {
  const vencido = c.estado === "pendiente" && c.fecha_limite && c.fecha_limite < hoy();
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 7 }}>
      <label title={c.urgente ? "Si no se hace, para la obra" : "Marcarlo urgente: si no se hace, para la obra"}
        style={{ display: "flex", alignItems: "center", flexShrink: 0, cursor: sePuede ? "pointer" : "default" }}>
        <input type="checkbox" checked={!!c.urgente} disabled={!sePuede}
          onChange={e => onTocar({ urgente: e.target.checked })} />
      </label>
      {/* UN COMPROMISO NO ENTRA EN UN RENGLÓN.
          "Remitir con urgencia el diseño final del cielo raso ajustado a las
          alturas existentes (2,90 m en tubo…)" es lo que de verdad se escribe
          en una reunión, y en un campo de una línea se lee la mitad. Lo que no
          se puede leer no se puede revisar, y un compromiso que no se revisa
          es un compromiso que no se reclama. */}
      <textarea defaultValue={c.texto} disabled={!sePuede} placeholder="Qué hay que hacer" rows={2}
        onBlur={e => onTocar({ texto: e.target.value })}
        style={{ ...inputStyle, flex: "2 1 240px", minWidth: 160, fontSize: 12, padding: "5px 8px",
          lineHeight: 1.4, resize: "vertical", fontFamily: colors.font,
          textDecoration: c.estado === "cumplido" ? "line-through" : "none",
          fontWeight: c.urgente && c.estado !== "cumplido" ? 600 : 400,
          color: c.estado === "cumplido" ? colors.muted : c.urgente ? colors.danger : colors.ink }} />
      <input defaultValue={c.responsable_nombre || ""} disabled={!sePuede} placeholder="¿Quién?"
        onBlur={e => onTocar({ responsable_nombre: e.target.value || null })}
        style={{ ...inputStyle, flex: "1 1 110px", minWidth: 90, fontSize: 12, padding: "5px 8px", height: 28 }} />
      <input type="date" value={c.fecha_limite || ""} disabled={!sePuede} title="¿Para cuándo?"
        onChange={e => onTocar({ fecha_limite: e.target.value || null })}
        style={{ ...inputStyle, width: 136, fontSize: 11.5, padding: "4px 6px", height: 28,
          color: vencido ? colors.danger : colors.ink, fontWeight: vencido ? 600 : 400 }} />
      {/* A QUIÉN DEL EQUIPO SE LE PONE LA TAREA.
          Quién lo hace no se puede deducir del texto: en un acta real el
          responsable se escribe "HCARQ", "Especialidades / Eléctrica", "Área
          Mecánica" —empresas y frentes, no personas— y está bien así, es como
          se habla en la reunión. Por eso la asignación es aparte y explícita.
          Vacío quiere decir que lo hace alguien de afuera y no se crea
          ninguna tarea: una tarea en el tablero de nadie es ruido. */}
      {equipo.length > 0 && (
        <select value={c.asignado_a || ""} disabled={!sePuede || !!c.tarea_id}
          onChange={e => onTocar({ asignado_a: e.target.value ? Number(e.target.value) : null })}
          title={c.tarea_id ? "Ya tiene su tarea creada" : "Si lo hace alguien del equipo, se le crea la tarea al dar el visto"}
          style={{ ...inputStyle, width: 124, fontSize: 11, padding: "4px 6px", height: 28,
            color: c.asignado_a ? colors.brand : colors.muted }}>
          <option value="">lo hace un externo</option>
          {equipo.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      )}
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
