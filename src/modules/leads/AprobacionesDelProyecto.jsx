import { useState, useEffect, useCallback } from "react";
import { FileDown, FileText, ThumbsUp, Mail, Send, CalendarClock } from "lucide-react";
import { colors } from "../../theme/colors";
import { abrirArchivo } from "../../lib/archivos";
import { cargarAprobaciones } from "./proyecto";
import { registroDeAprobaciones, resumenDelRegistro, estadoDelPedido, momento, registroParaPdf, plazoDe } from "./aprobaciones.js";
import { etapasDelTipo, tipoDe, sePersigue } from "./pipeline";
import PedirAprobacion from "./PedirAprobacion";

// EL REGISTRO DE APROBACIONES DEL CLIENTE, de un proyecto.
//
// Hernán, 17/11/2026: «esta colección de aprobaciones es un sustento y
// justificación. ¿Cómo lo manejamos? ¿Desde dónde?». Y cuando el cliente
// aprueba: «que quede en el registro».
//
// SE PIDE DESDE EL PUNTO del checklist, que es donde se sube el plano o el
// presupuesto. Y SE LEE ACÁ: cada pedido con su número, quién lo pidió y
// cuándo, a quién se le avisó, qué contestó el cliente y cuándo, y los
// archivos que tenía para mirar —los de ese momento, no los de hoy—. Se baja
// en PDF, que es como sale de la oficina.
//
// No se edita: lo que el cliente contestó lo escribió él desde su enlace.
//
// Y DESDE ACÁ SE ENVÍA. Hernán, 18/11/2026: «¿desde dónde envío presupuestos,
// planos, documentos para aprobar?». Había que ir al checklist: agregar el
// punto, mostrárselo, subirle el archivo y pedirle la aprobación. «Enviar para
// aprobar» abre una ventana que pregunta qué es, qué archivos lleva y a quién
// se le avisa, y hace todo de una vez; el punto queda en el checklist. A lo
// que sigue esperando se le avisa de nuevo desde su renglón.

const TONOS = { success: colors.success, danger: colors.danger, warning: colors.warning, muted: colors.muted };

export default function AprobacionesDelProyecto({ lead, catalogo = [], users = [], currentUser = null, editable = true }) {
  const [datos, setDatos] = useState(null);
  const [bajando, setBajando] = useState(false);
  const [error, setError] = useState("");
  // La ventana: enviar algo nuevo, o avisarle de nuevo de un pedido. { modo, item, archivos }
  const [ventana, setVentana] = useState(null);
  const etapas = etapasDelTipo(catalogo, tipoDe(lead));

  const cargar = useCallback(async () => { setDatos(await cargarAprobaciones(lead.id)); }, [lead.id]);
  useEffect(() => { cargar(); }, [cargar]);

  if (!datos) return <div style={{ fontSize: 12, color: colors.muted, padding: "10px 0" }}>Leyendo el registro…</div>;
  if (datos.sinMigracion) {
    return (
      <div style={{ fontSize: 12.5, color: colors.warning, background: colors.warningSoft, border: `1px solid ${colors.warningBorder}`, borderRadius: colors.radiusMd, padding: 13 }}>
        Para llevar el registro de aprobaciones falta correr la migración 187 en Supabase.
      </div>
    );
  }

  const registro = registroDeAprobaciones(datos.filas, datos.archivosDeAhora);
  const r = resumenDelRegistro(registro);

  async function bajar() {
    setBajando(true); setError("");
    try {
      const { exportarPDF } = await import("../../lib/exportar");
      await exportarPDF(registroParaPdf(registro, { proyecto: lead.nombre }));
    } catch (e) {
      setError("No se pudo armar el PDF: " + (e?.message || e));
    } finally { setBajando(false); }
  }

  return (
    <div className="aprobaciones-del-proyecto">
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 240px", minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.5 }}>APROBACIONES DEL CLIENTE</div>
          <div style={{ fontSize: 11.5, color: colors.inkSoft, lineHeight: 1.5, marginTop: 3 }}>
            Todo lo que se le pidió aprobar al cliente en este proyecto, y qué contestó desde su enlace: es el sustento de lo que aprobó.
            Un plano, un presupuesto o un documento se le mandan con «Enviar para aprobar».
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {editable && (
            <button className="enviar-para-aprobar" onClick={() => setVentana({ modo: "enviar" })}
              style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", fontFamily: colors.font, fontSize: 12, fontWeight: 600,
                border: `1px solid ${colors.brand}`, background: colors.brand, color: "#fff", borderRadius: 8, padding: "6px 12px", whiteSpace: "nowrap" }}>
              <Send size={13} /> Enviar para aprobar
            </button>
          )}
          {registro.length > 0 && (
            <button className="bajar-registro" onClick={bajar} disabled={bajando}
              style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", fontFamily: colors.font, fontSize: 12, fontWeight: 600,
                border: `1px solid ${colors.border}`, background: "#fff", color: colors.inkSoft, borderRadius: 8, padding: "6px 12px", whiteSpace: "nowrap" }}>
              <FileDown size={13} /> {bajando ? "Armando…" : "Bajar en PDF"}
            </button>
          )}
        </div>
      </div>
      {error && <div role="alert" style={{ fontSize: 11.5, color: colors.danger, marginBottom: 8 }}>{error}</div>}
      {datos.error && <div role="alert" style={{ fontSize: 11.5, color: colors.danger, marginBottom: 8 }}>No se pudo leer el registro: {datos.error}</div>}

      {/* Cuántas hay de cada una. */}
      {registro.length > 0 && (
        <div className="resumen-del-registro" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {[[r.total, r.total === 1 ? "pedida" : "pedidas", colors.ink], [r.aprobadas, r.aprobadas === 1 ? "aprobada" : "aprobadas", colors.success],
            [r.observadas, "con observaciones", colors.danger], [r.pendientes, "esperando respuesta", colors.warning],
            [r.vencidas, "con el plazo vencido", colors.danger]]
            .filter(([n], i) => i === 0 || n > 0)
            .map(([n, dice, tono]) => (
              <span key={dice} style={{ fontSize: 11.5, color: colors.inkSoft, border: `1px solid ${colors.border}`, borderRadius: 14, padding: "3px 10px", background: "#fff" }}>
                <strong style={{ color: tono }}>{n}</strong> {dice}
              </span>
            ))}
        </div>
      )}

      {!registro.length && (
        <div className="registro-vacio" style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 13 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: colors.ink }}>Todavía no se le pidió ninguna aprobación al cliente.</div>
          <div style={{ fontSize: 11.5, color: colors.inkSoft, lineHeight: 1.55, marginTop: 3 }}>
            Tocá «Enviar para aprobar»: escribís qué es —«Plano de cocina», «Presupuesto rev. 2»—, elegís los archivos y a quién avisarle.
            Queda como un punto del checklist, el cliente lo aprueba desde su enlace y lo que conteste aparece acá.
            También se le puede pedir desde un punto que ya esté en el checklist, en «¿Lo tiene que aprobar?».
          </div>
        </div>
      )}

      {registro.map(p => {
        const e = estadoDelPedido(p.estado, p.vencida);
        const tono = TONOS[e.tono];
        const plazo = p.estado === "pendiente" ? plazoDe(p.vence_el) : null;
        return (
          <div key={p.id} className="pedido-del-registro" data-estado={p.estado} data-vencida={p.vencida ? "si" : "no"}
            style={{ background: "#fff", border: `1px solid ${colors.border}`, borderLeft: `3px solid ${tono}`, borderRadius: colors.radiusMd, padding: "9px 12px", marginBottom: 7,
              opacity: p.vigente ? 1 : 0.75 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: colors.ink, lineHeight: 1.35, overflowWrap: "anywhere" }}>
                  <span style={{ color: colors.muted, fontWeight: 400 }}>N° {p.numero} · </span>{p.titulo}
                </div>
                {p.descripcion && <div style={{ fontSize: 11.5, color: colors.inkSoft, lineHeight: 1.45, marginTop: 1, overflowWrap: "anywhere" }}>{p.descripcion}</div>}
              </div>
              <span className="estado-del-pedido" style={{ fontSize: 11, fontWeight: 700, color: tono, whiteSpace: "nowrap", flexShrink: 0 }}>{e.dice}</span>
            </div>

            <div style={{ fontSize: 11.5, color: colors.inkSoft, lineHeight: 1.55, marginTop: 5 }}>
              <div className="cuando-se-pidio">
                <ThumbsUp size={11} color={colors.muted} style={{ verticalAlign: "-1px", marginRight: 4 }} />
                Se le pidió{p.pedida_at ? ` el ${momento(p.pedida_at)}` : ""}{p.pedida_nombre ? ` · ${p.pedida_nombre}` : ""}
              </div>
              {/* El plazo que se le dio en ESTE pedido. */}
              {p.vence_el && (
                <div className="plazo-del-pedido" style={{ color: p.vencida ? colors.danger : colors.inkSoft, fontWeight: p.vencida ? 600 : 400 }}>
                  <CalendarClock size={11} color={p.vencida ? colors.danger : colors.muted} style={{ verticalAlign: "-1px", marginRight: 4 }} />
                  {plazo ? plazo.frase : `Tenía plazo hasta el ${momento(`${p.vence_el}T12:00:00`).split(",")[0]}`}
                </div>
              )}
              {p.avisos.map((a, i) => (
                <div key={i} className="aviso-del-pedido" style={{ overflowWrap: "anywhere" }}>
                  <Mail size={11} color={colors.muted} style={{ verticalAlign: "-1px", marginRight: 4 }} />
                  Se le avisó por correo a {a.correos.join(", ")} el {momento(a.cuando)}
                </div>
              ))}
              {p.estado === "pendiente" && !p.avisos.length && (
                <div style={{ color: colors.warning }}>Todavía no se le avisó por correo.</div>
              )}
              {/* Sigue esperando: se le avisa de nuevo desde acá. */}
              {editable && p.estado === "pendiente" && p.task_id != null && (
                <button className="avisar-de-nuevo" onClick={() => setVentana({ modo: "avisar", item: { id: p.task_id, tarea_id: p.task_id, lead_id: lead.id, texto: p.titulo }, archivos: p.archivos, plazo: p.vence_el })}
                  style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 4, cursor: "pointer", fontFamily: colors.font, fontSize: 11, fontWeight: 600,
                    border: `1px solid ${colors.brand}`, background: "#fff", color: colors.brand, borderRadius: 14, padding: "3px 10px" }}>
                  <Mail size={11} /> {p.avisos.length ? "Avisarle de nuevo" : "Avisarle"}
                </button>
              )}
              {p.estado !== "pendiente" && (
                <div className="lo-que-contesto" style={{ color: tono, fontWeight: 600, marginTop: 2 }}>
                  {p.estado === "aprobado" ? "El cliente lo aprobó" : p.estado === "observado" ? "El cliente dejó observaciones" : "El pedido se retiró sin respuesta"}
                  {p.respuesta_at ? ` el ${momento(p.respuesta_at)}` : ""}
                </div>
              )}
              {p.nota && <div className="nota-del-cliente" style={{ color: colors.ink, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>«{p.nota}»</div>}
            </div>

            {/* Lo que tenía para mirar: al contestar, o hoy si todavía espera. */}
            {p.estado !== "retirado" && (
              <div style={{ marginTop: 6 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.4, marginBottom: 3 }}>
                  {p.estado === "pendiente" ? "LO QUE TIENE PARA MIRAR HOY" : "LO QUE TENÍA PARA MIRAR AL CONTESTAR"}
                </div>
                {p.archivos.length ? (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {p.archivos.map((a, i) => (
                      <button key={a.id ?? i} className="archivo-del-pedido" disabled={!a.storage_path} onClick={() => a.storage_path && abrirArchivo(a.storage_path)}
                        title={a.storage_path ? `Abrir ${a.nombre}` : a.nombre}
                        style={{ display: "inline-flex", alignItems: "center", gap: 5, maxWidth: "100%", cursor: a.storage_path ? "pointer" : "default", fontFamily: colors.font,
                          fontSize: 11.5, color: colors.ink, background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 7, padding: "4px 9px" }}>
                        <FileText size={11} color={colors.muted} style={{ flexShrink: 0 }} />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.nombre}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 11.5, color: colors.muted }}>
                    {p.estado === "pendiente" ? "Ningún archivo todavía: va a aprobar solo el título." : "Ningún archivo: aprobó el punto como estaba escrito."}
                  </div>
                )}
              </div>
            )}
            {!p.vigente && (
              <div className="pedido-anterior" style={{ fontSize: 11, color: colors.muted, marginTop: 6 }}>
                Después se le volvió a pedir este punto: la respuesta que vale es la del pedido más nuevo.
              </div>
            )}
          </div>
        );
      })}

      {ventana && (
        <PedirAprobacion lead={lead} modo={ventana.modo} item={ventana.item || null} archivos={ventana.archivos || []} plazo={ventana.plazo || null}
          etapas={etapas} etapaId={sePersigue(lead) ? lead.etapa : null} users={users} currentUser={currentUser}
          onCambio={cargar} onCerrar={() => setVentana(null)} />
      )}
    </div>
  );
}
