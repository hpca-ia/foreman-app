import { useState, useEffect, useCallback } from "react";
import { FileText, Download, Lock, Mail, Check, AlertTriangle, Eye, RefreshCw } from "lucide-react";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import { contenidoDe, enlacesDeFotos, guardarPdfDelDia, entregasDe } from "./libro";
import { pdfDiaDeObra, pdfLibroDeObra, comoSeLee } from "./pdfDiaDeObra";
import { abrirArchivo } from "../../lib/archivos";
import { convocadosDe } from "../actas/actas";

// EL LIBRO, EL DE VERDAD.
//
// Lo que se escribe día a día vive en la base, y eso alcanza para escribirlo.
// No alcanza para lo único que un libro de obra tiene que hacer cuando hace
// falta: ser un documento. En un reclamo, una planilla discutida o un juicio
// nadie entra a FOREMAN — se pide "el libro".
//
// Cada día cerrado deja su PDF, y esos PDF apilados son el libro. Acá se ven
// todos, se baja uno, o se baja el libro entero en un solo documento con su
// índice: eso es lo que se entrega.
//
// Y SE ENTREGA POR TRAMO DE FECHAS, que es como se pide de verdad: "mandame el
// libro de septiembre", "lo de la semana de la lluvia". El libro entero de una
// obra de un año no lo lee nadie, no entra en un correo, y pedirlo completo
// para discutir tres días es la forma de que nadie lo mire.

const esCorreo = e => /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(String(e || "").trim());
const fecha = d => String(d || "").slice(0, 10);

export default function LibroImpreso({ lead, dias = [], onCambio, currentUser }) {
  const [ocupado, setOcupado] = useState("");
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  const cerrados = dias.filter(d => d.estado === "cerrado" || d.estado === "aprobado");
  const ordenados = [...cerrados].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  const primero = fecha(ordenados[0]?.fecha);
  const ultimo = fecha(ordenados[ordenados.length - 1]?.fecha);

  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  // Arranca con todo lo que hay: el tramo se achica cuando alguien lo pide,
  // no de entrada. Una pantalla que empieza vacía parece rota.
  useEffect(() => {
    setDesde(d => d || primero);
    setHasta(h => h || ultimo);
  }, [primero, ultimo]);

  const enRango = ordenados.filter(d =>
    (!desde || fecha(d.fecha) >= desde) && (!hasta || fecha(d.fecha) <= hasta));
  const conPdf = enRango.filter(d => d.pdf_url).length;
  const todoElLibro = enRango.length === ordenados.length;

  // ── A quién se le manda ────────────────────────────────────────────────
  const [mandando, setMandando] = useState(false);
  const [convocados, setConvocados] = useState([]);
  const [elegidos, setElegidos] = useState(() => new Set());
  const [otros, setOtros] = useState("");
  const [nota, setNota] = useState("");

  useEffect(() => {
    if (!mandando || !lead?.id) return;
    convocadosDe(lead.id).then(cs => setConvocados((cs || []).filter(c => esCorreo(c.email))));
  }, [mandando, lead?.id]);

  // ── LO QUE YA SE ENTREGÓ ───────────────────────────────────────────────
  //
  // Un libro que rebotó sin que nadie se entere es peor que uno que no se
  // mandó: el que lo pidió cree que ya lo tiene y no lo vuelve a pedir.
  const [entregas, setEntregas] = useState([]);
  const cargarEntregas = useCallback(async () => {
    if (!lead?.id) return;
    const r = await entregasDe(lead.id);
    if (r.error) { setError(r.error); return; }
    setEntregas(r.entregas);
  }, [lead?.id]);
  useEffect(() => { cargarEntregas(); }, [cargarEntregas]);

  async function revisarEntregas() {
    setOcupado("revisando"); setError(""); setAviso("");
    try {
      const r = await fetch("/api/aviso?de=libro", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revisar: 1, lead_id: lead.id }),
      });
      const d = await r.json().catch(() => null);
      if (!d || d.error) throw new Error(d?.error || "No se pudo preguntar por las entregas.");
      await cargarEntregas();
      setAviso(d.rebotaron?.length
        ? `No le llegó a ${d.rebotaron.join(", ")}. Corregí la dirección y volvé a mandarlo.`
        : d.cambiaron ? `${d.cambiaron} ${d.cambiaron === 1 ? "entrega cambió" : "entregas cambiaron"} de estado.`
          : "Sin novedades: nada cambió desde la última vez.");
    } catch (e) { setError(e.message); }
    setOcupado("");
  }

  // Sin repetir: la misma persona puede estar dos veces en los de siempre, y
  // recibir el libro dos veces es el tipo de detalle que hace dudar de todo lo
  // demás que manda el sistema.
  const destinatarios = [...new Set([
    ...[...elegidos],
    ...String(otros).split(/[\s,;]+/).map(x => x.trim().toLowerCase()).filter(esCorreo),
  ])];

  async function contenido(dia) {
    const { entradas, fotos } = await contenidoDe(dia.id);
    return { entradas, fotos, enlaces: await enlacesDeFotos(fotos) };
  }

  /** Mirar el PDF de un día. Si no lo tiene —lo cerró el reloj, se cayó la red
      cuando se cerró— se arma ahora y queda guardado. */
  async function verDia(dia) {
    setOcupado(dia.id); setError("");
    try {
      if (dia.pdf_url) { await abrirArchivo(dia.pdf_url); }
      else {
        const datos = await contenido(dia);
        await pdfDiaDeObra({ dia, obra: lead.nombre, ...datos }, "abrir");
        const blob = await pdfDiaDeObra({ dia, obra: lead.nombre, ...datos }, "blob");
        const r = await guardarPdfDelDia(dia, blob);
        if (!r.error) onCambio?.();
      }
    } catch (e) { setError("No se pudo abrir el PDF: " + e.message); }
    setOcupado("");
  }

  async function bajarTramo() {
    setOcupado("todo"); setError("");
    try {
      // En orden, del primer día al último: un libro se lee para adelante.
      await pdfLibroDeObra({ obra: lead.nombre, dias: enRango, traerDia: contenido }, "abrir");
    } catch (e) { setError("No se pudo armar el libro: " + e.message); }
    setOcupado("");
  }

  async function enviarTramo() {
    if (!destinatarios.length) { setError("Elegí a quién mandárselo."); return; }
    if (!enRango.length) { setError("No hay días cerrados en ese tramo."); return; }
    setOcupado("correo"); setError(""); setAviso("");
    try {
      const adjunto = await pdfLibroDeObra({ obra: lead.nombre, dias: enRango, traerDia: contenido }, "base64");
      // EL PEDIDO TIENE UN TECHO Y NO ES NUESTRO.
      //
      // Vercel no acepta pedidos de más de 4,5 MB, y un libro con las fotos de
      // tres meses los pasa sin esfuerzo. Pasado eso la función se cae antes de
      // leer una línea y lo que vuelve es una página de error, no un error. Acá
      // se dice antes, con el peso a la vista y con la salida puesta: el tramo
      // de fechas, que para eso está.
      const pesa = (adjunto?.contenido?.length || 0);
      if (pesa > 4.2e6) {
        throw new Error(`El libro de ese tramo pesa ${(pesa / 1024 / 1024).toFixed(1)} MB y el máximo que`
          + " acepta el servidor es 4,5 MB. Mandalo por partes: achicá el tramo de fechas y mandá dos correos.");
      }
      // Quién es cada dirección: una entrega que dice "info@proeficaz.com" y no
      // "PROEFICAZ" obliga a traducir mentalmente cada vez que se la mira.
      const quien = {};
      for (const c of convocados) {
        const mail = String(c.email).trim().toLowerCase();
        if (destinatarios.includes(mail)) quien[mail] = c.nombre || null;
      }
      const r = await fetch("/api/aviso?de=libro", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: lead.id, desde: fecha(enRango[0].fecha), hasta: fecha(enRango[enRango.length - 1].fecha),
          dias: enRango.length, para: destinatarios, adjunto, nota: nota.trim() || null, quien,
          de: currentUser ? { id: currentUser.id ?? null, nombre: currentUser.name || null, email: currentUser.email || null } : null,
        }),
      });
      const data = await r.json().catch(() => null);
      if (!data) {
        throw new Error(r.status === 413
          ? "El libro pesa demasiado para mandarlo. Achicá el tramo de fechas."
          : `El servidor se cortó mandando el libro (${r.status}). Probá con un tramo más corto.`);
      }
      if (!r.ok || data.error) throw new Error(data.error || "No se pudo mandar el libro.");
      const fallaron = data.fallaron || [];
      setAviso(`${data.mandados} ${data.mandados === 1 ? "copia enviada" : "copias enviadas"}`
        + `${fallaron.length ? ` · ${fallaron.length} no salió: ${fallaron.map(f => f.dir).join(", ")}` : ""}.`);
      if (!fallaron.length) { setMandando(false); setOtros(""); setNota(""); setElegidos(new Set()); }
      await cargarEntregas();
    } catch (e) {
      setError(e.message);
    }
    setOcupado("");
  }

  const titulito = { fontSize: 9.5, fontWeight: 700, color: colors.muted, letterSpacing: 0.3, display: "block", marginBottom: 3 };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: colors.ink }}>
            {cerrados.length} {cerrados.length === 1 ? "día cerrado" : "días cerrados"}
          </div>
          <div style={{ fontSize: 11.5, color: colors.muted, lineHeight: 1.45, marginTop: 2 }}>
            Cada día cerrado deja su PDF. Apilados son el libro de obra: lo que se entrega cuando alguien lo pide.
            {conPdf < enRango.length && ` ${enRango.length - conPdf} todavía no tienen el PDF guardado; se arma solo al abrirlo.`}
          </div>
        </div>
      </div>

      {/* EL TRAMO. Un libro se pide por fechas —"el de septiembre", "la semana
          de la lluvia"— y se entrega por fechas. */}
      {cerrados.length > 0 && (
        <div style={{ background: colors.surface, border: `1px solid ${colors.border}`,
          borderRadius: colors.radiusMd, padding: "11px 13px", marginBottom: 12,
          display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label style={titulito}>DESDE</label>
            <input type="date" value={desde} min={primero} max={hasta || ultimo}
              onChange={e => setDesde(e.target.value)}
              style={{ ...inputStyle, fontSize: 12, padding: "6px 9px" }} />
          </div>
          <div>
            <label style={titulito}>HASTA</label>
            <input type="date" value={hasta} min={desde || primero} max={ultimo}
              onChange={e => setHasta(e.target.value)}
              style={{ ...inputStyle, fontSize: 12, padding: "6px 9px" }} />
          </div>
          <div style={{ fontSize: 11.5, color: colors.inkSoft, paddingBottom: 7 }}>
            {enRango.length} {enRango.length === 1 ? "día" : "días"}
            {todoElLibro ? " · el libro completo" : ""}
            {!todoElLibro && (
              <button onClick={() => { setDesde(primero); setHasta(ultimo); }}
                style={{ background: "none", border: "none", padding: "0 0 0 6px", cursor: "pointer",
                  color: colors.brand, fontSize: 11.5, fontFamily: colors.font, textDecoration: "underline" }}>
                todo
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 7, marginLeft: "auto", flexWrap: "wrap" }}>
            <Button variant="outline" size="sm" disabled={!enRango.length || !!ocupado} onClick={bajarTramo}>
              <Download size={13} /> {ocupado === "todo" ? "Armando…" : "Bajar el PDF"}
            </Button>
            <Button variant="primary" size="sm" disabled={!enRango.length || !!ocupado}
              onClick={() => { setMandando(m => !m); setError(""); setAviso(""); }}>
              <Mail size={13} /> Enviarlo
            </Button>
          </div>
        </div>
      )}

      {/* A QUIÉN. Los de siempre de esta obra ya están cargados: son los
          mismos que reciben las actas. Y se puede escribir cualquier otra
          dirección, porque el libro se lo pide gente que no va a las
          reuniones —un abogado, un perito, el seguro—. */}
      {mandando && (
        <div style={{ background: colors.surface, border: `1px solid ${colors.brand}`,
          borderRadius: colors.radiusMd, padding: "11px 13px", marginBottom: 12, display: "grid", gap: 9 }}>
          <div>
            <label style={titulito}>A QUIÉN</label>
            {convocados.length === 0 ? (
              <div style={{ fontSize: 11.5, color: colors.muted }}>
                Esta obra no tiene convocados con correo cargado. Escribí las direcciones abajo.
              </div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px" }}>
                {convocados.map(c => {
                  const mail = String(c.email).trim().toLowerCase();
                  return (
                    <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 5,
                      fontSize: 12, color: colors.ink, cursor: "pointer" }}>
                      <input type="checkbox" checked={elegidos.has(mail)}
                        onChange={e => setElegidos(s => {
                          const n = new Set(s);
                          if (e.target.checked) n.add(mail); else n.delete(mail);
                          return n;
                        })} />
                      {c.nombre || mail}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
          <input value={otros} placeholder="Otras direcciones, separadas por coma"
            onChange={e => setOtros(e.target.value)}
            style={{ ...inputStyle, fontSize: 12, padding: "7px 10px" }} />
          <input value={nota} placeholder="Una línea de contexto, si hace falta (opcional)"
            onChange={e => setNota(e.target.value)}
            style={{ ...inputStyle, fontSize: 12, padding: "7px 10px" }} />
          <div style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap" }}>
            <Button variant="primary" size="sm" disabled={!destinatarios.length || !!ocupado} onClick={enviarTramo}>
              <Mail size={13} />
              {ocupado === "correo" ? "Armando y mandando…"
                : `Mandar ${enRango.length} ${enRango.length === 1 ? "día" : "días"} a ${destinatarios.length} ${destinatarios.length === 1 ? "persona" : "personas"}`}
            </Button>
            <button onClick={() => setMandando(false)}
              style={{ background: "none", border: "none", cursor: "pointer", color: colors.muted,
                fontSize: 11.5, fontFamily: colors.font }}>cancelar</button>
          </div>
        </div>
      )}

      {error && <div style={{ fontSize: 12, color: colors.danger, marginBottom: 10, lineHeight: 1.45 }}>{error}</div>}
      {aviso && <div style={{ fontSize: 12, color: colors.success, marginBottom: 10 }}>{aviso}</div>}

      {/* A QUIÉN SE LE ENTREGÓ, SI LLEGÓ Y SI LO REVISÓ.
          Es lo que hace falta cuando se discute: "el libro de septiembre te lo
          mandé el 3 de octubre" no prueba nada sin el acuse al lado. */}
      {entregas.length > 0 && (
        <div style={{ background: colors.surface, border: `1px solid ${colors.border}`,
          borderRadius: colors.radiusMd, padding: "11px 13px", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.ink, flex: 1 }}>
              Entregas · {entregas.filter(e => e.conforme_at).length} de {entregas.length} dadas por revisadas
            </div>
            {/* SE ACTUALIZA CUANDO SE PIDE: esto cambia afuera de FOREMAN, en
                el servidor de correo y en el teléfono del que lo recibió. */}
            <button onClick={revisarEntregas} disabled={!!ocupado}
              style={{ background: "none", border: `1px solid ${colors.border}`, borderRadius: 6,
                padding: "3px 9px", cursor: "pointer", fontFamily: colors.font, fontSize: 11,
                color: colors.inkSoft, display: "flex", alignItems: "center", gap: 5 }}>
              <RefreshCw size={11} /> {ocupado === "revisando" ? "Preguntando…" : "¿Llegó? ¿Contestaron?"}
            </button>
          </div>
          {entregas.map(e => {
            const reboto = ["bounced", "complained", "failed"].includes(String(e.envio_estado || "").toLowerCase());
            const color = reboto ? colors.danger
              : e.observacion ? colors.warning
                : e.conforme_at ? colors.success
                  : e.visto_at ? colors.inkSoft : colors.muted;
            return (
              <div key={e.id} style={{ display: "flex", gap: 8, alignItems: "flex-start",
                padding: "6px 0", borderTop: `1px solid ${colors.bg}` }}>
                <div style={{ flexShrink: 0, color, display: "flex", paddingTop: 2 }}>
                  {reboto ? <AlertTriangle size={13} />
                    : e.observacion ? <AlertTriangle size={13} />
                      : e.conforme_at ? <Check size={13} /> : <Eye size={13} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: colors.ink }}>
                    {e.nombre || e.email}
                    <span style={{ color: colors.muted }}>
                      {" · "}{e.desde === e.hasta ? comoSeLee(e.desde) : `${comoSeLee(e.desde)} a ${comoSeLee(e.hasta)}`}
                      {e.dias ? ` · ${e.dias} ${e.dias === 1 ? "día" : "días"}` : ""}
                    </span>
                  </div>
                  <div style={{ fontSize: 10.5, color }}>
                    {reboto ? `No le llegó a ${e.email}: la dirección rebotó.`
                      : e.conforme_at ? `Lo dio por revisado el ${fecha(e.conforme_at)}`
                        : e.observacion ? "Escribió una observación"
                          : e.visto_at ? `Lo abrió el ${fecha(e.visto_at)} y no dijo nada`
                            : String(e.envio_estado || "").toLowerCase() === "delivered" ? "Le llegó y todavía no lo abrió"
                              : "Enviado, todavía sin acuse"}
                  </div>
                  {e.observacion && (
                    <div style={{ fontSize: 11.5, color: colors.ink, background: colors.warningSoft,
                      border: `1px solid ${colors.warningBorder}`, borderRadius: 6, padding: "5px 8px",
                      marginTop: 3, lineHeight: 1.45, whiteSpace: "pre-line" }}>
                      {e.observacion}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!cerrados.length ? (
        <div style={{ fontSize: 12.5, color: colors.muted, background: colors.surface, border: `1px solid ${colors.border}`,
          borderRadius: colors.radiusMd, padding: 16, lineHeight: 1.55 }}>
          Todavía no hay ningún día cerrado. El residente cierra el día cuando terminó de escribirlo —desde el
          libro del día, botón <strong>Cerrar el día</strong>— y ahí queda su PDF, con fecha y con lo que había
          escrito ese día.
        </div>
      ) : !enRango.length ? (
        <div style={{ fontSize: 12.5, color: colors.muted, background: colors.surface, border: `1px solid ${colors.border}`,
          borderRadius: colors.radiusMd, padding: 16, lineHeight: 1.55 }}>
          No hay días cerrados entre esas dos fechas.
        </div>
      ) : (
        <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, overflow: "hidden" }}>
          {enRango.map(d => (
            <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 13px",
              borderBottom: `1px solid ${colors.neutralSoft}` }}>
              <Lock size={12} color={colors.muted} style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, color: colors.ink, textTransform: "capitalize" }}>{comoSeLee(d.fecha)}</div>
                <div style={{ fontSize: 10.5, color: colors.muted }}>
                  {d.estado === "aprobado" ? "Aprobado" : "Cerrado"}
                  {d.aprobado_nombre ? ` por ${d.aprobado_nombre}` : ""}
                  {d.reabierto_at ? ` · reabierto ${Number(d.reaperturas) > 1 ? `${d.reaperturas} veces` : "una vez"}` : ""}
                  {d.pdf_url ? "" : " · sin PDF guardado"}
                </div>
              </div>
              <Button variant="outline" size="sm" disabled={!!ocupado} onClick={() => verDia(d)}>
                <FileText size={12} /> {ocupado === d.id ? "…" : "PDF"}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
