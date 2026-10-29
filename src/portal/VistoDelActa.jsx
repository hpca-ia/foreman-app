import { useEffect, useState } from "react";

// El acta, para quien le da el visto.
//
// El acta se aprueba a las nueve de la noche, leyéndola en el teléfono, con el
// correo abierto. Pedirle a quien responde por ella que entre a FOREMAN,
// busque el proyecto y encuentre el botón es lo que hacía que un acta esperara
// tres días — y lo que se decidió en la reunión no tiene constancia mientras
// tanto.
//
// Entera, no un resumen: los temas con su resolución y los compromisos con su
// dueño y su fecha. Dar el visto a un documento que no se ve no es aprobarlo.
//
// Y EL PASO SIGUIENTE ESTÁ ACÁ: mandarla a los involucrados. Aprobar y después
// tener que volver a la computadora para enviarla es partir en dos una sola
// decisión, y en esa mitad se queda el acta dos días más.

const C = {
  tinta: "#0F3D3E", ink: "#111827", gris: "#6B7280", borde: "#E5E7EB",
  fondo: "#F7F7F5", rojo: "#B91C1C", verde: "#15803D", ambar: "#92400E",
};
const F = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const dia = f => (f ? new Date(`${String(f).slice(0, 10)}T12:00:00`)
  .toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" }) : "");
const hora = h => (h ? String(h).slice(0, 5) : "");

export default function VistoDelActa({ token, devolviendo = false }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [nota, setNota] = useState("");
  const [objetando, setObjetando] = useState(devolviendo);
  const [quien, setQuien] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [listo, setListo] = useState(null);
  const [enviada, setEnviada] = useState(null);

  useEffect(() => {
    fetch(`/api/portal?visto=1&t=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(d => {
        if (d?.error) { setError(d.error); return; }
        setDatos(d);
        if (d.aprueban?.length === 1) setQuien(String(d.aprueban[0].id));
      })
      .catch(() => setError("No se pudo abrir el acta. Probá de nuevo en un momento."));
  }, [token]);

  async function responder(aprueba) {
    if (!aprueba && !nota.trim()) { setError("Para devolverla hay que escribir qué corregir."); return; }
    if (!quien) { setError("Decinos quién está dando el visto."); return; }
    setOcupado(true); setError("");
    const r = await fetch("/api/portal", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visto: 1, token, aprueba, nota: nota.trim() || null, quienId: Number(quien) }),
    });
    const d = await r.json().catch(() => ({}));
    setOcupado(false);
    if (!r.ok || d?.error) { setError(d?.error || "No se pudo guardar."); return; }
    setListo(aprueba ? { estado: "revisada", creadas: d.creadas || 0 } : { estado: "devuelta" });
  }

  async function mandarla() {
    setOcupado(true); setError("");
    const r = await fetch("/api/portal", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visto: 1, token, enviar: 1 }),
    });
    const d = await r.json().catch(() => ({}));
    setOcupado(false);
    if (!r.ok || d?.error) { setError(d?.error || "No se pudo enviar el acta."); return; }
    setEnviada(d);
  }

  if (error && !datos) return <Centro>{error}</Centro>;
  if (!datos) return <Centro>Abriendo el acta…</Centro>;

  const { acta, obra, asistentes = [], temas = [], compromisos = [], aprueban = [], recibirian } = datos;
  const vinieron = asistentes.filter(a => a.asistio && String(a.nombre || "").trim());
  const faltaron = asistentes.filter(a => !a.asistio && String(a.nombre || "").trim());
  const repaso = compromisos.filter(c => c.viene_de);
  const nuevos = compromisos.filter(c => !c.viene_de);
  const yaEnviada = acta.estado === "enviada" || enviada;
  const vista = listo?.estado || (acta.estado === "revisada" || yaEnviada ? "revisada" : null);

  return (
    <div style={{ fontFamily: F, background: C.fondo, minHeight: "100vh", padding: "0 0 60px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "22px 16px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.gris, letterSpacing: 0.6 }}>ACTA DE REUNIÓN DE OBRA</div>
        <h1 style={{ fontSize: 22, color: C.tinta, margin: "4px 0 2px" }}>N° {acta.numero} · {obra || "Obra"}</h1>
        <div style={{ fontSize: 13, color: C.gris }}>
          {dia(acta.fecha)}
          {acta.hora_inicio ? ` · ${hora(acta.hora_inicio)}${acta.hora_fin ? ` a ${hora(acta.hora_fin)}` : ""}` : ""}
          {acta.lugar ? ` · ${acta.lugar}` : ""}
        </div>

        {/* LO QUE SE LE PIDE, ARRIBA. */}
        <Caja>
          {yaEnviada ? (
            <div style={{ color: C.verde, fontSize: 15, fontWeight: 600 }}>
              ✓ El acta salió a los involucrados.
              <div style={{ fontSize: 12.5, color: C.gris, fontWeight: 400, marginTop: 4 }}>
                {enviada?.enviados
                  ? `Le llegó a ${enviada.enviados} ${enviada.enviados === 1 ? "persona" : "personas"}, cada una con su enlace de conformidad.`
                  : "Ya no se modifica."}
                {enviada?.sinPdf ? " Salió sin el PDF adjunto: el acta va entera en el cuerpo del correo." : ""}
                {enviada?.aviso ? ` ${enviada.aviso}` : ""}
              </div>
            </div>
          ) : vista === "revisada" ? (
            <>
              <div style={{ color: C.verde, fontSize: 15, fontWeight: 600 }}>
                ✓ Le diste el visto.
                <div style={{ fontSize: 12.5, color: C.gris, fontWeight: 400, marginTop: 4 }}>
                  {listo?.creadas
                    ? `${listo.creadas} ${listo.creadas === 1 ? "compromiso quedó" : "compromisos quedaron"} como tarea en el tablero de quien lo tiene que hacer. `
                    : ""}
                  Falta un paso: mandarla.
                </div>
              </div>
              {recibirian > 0 ? (
                <>
                  <button onClick={mandarla} disabled={ocupado}
                    style={{ marginTop: 12, width: "100%", background: C.tinta, color: "#fff", border: "none",
                      borderRadius: 10, padding: "14px 16px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: F }}>
                    {ocupado ? "Enviando…" : `Enviar el acta a los ${recibirian} involucrados`}
                  </button>
                  <div style={{ fontSize: 11.5, color: C.gris, marginTop: 7, lineHeight: 1.5 }}>
                    Cada uno recibe su copia con su enlace de conformidad. Después de enviada, el acta no se modifica.
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 12.5, color: C.ambar, marginTop: 10 }}>
                  Ninguno de los asistentes tiene correo cargado: hay que completarlos en FOREMAN antes de enviarla.
                </div>
              )}
              {error && <div style={{ color: C.rojo, fontSize: 13, marginTop: 8 }}>{error}</div>}
            </>
          ) : listo?.estado === "devuelta" ? (
            <div style={{ color: C.ambar, fontSize: 15, fontWeight: 600 }}>
              La devolviste.
              <div style={{ fontSize: 12.5, color: C.gris, fontWeight: 400, marginTop: 4 }}>
                Volvió a borrador con lo que escribiste, y le llegó a quien la escribió. No sale a nadie
                hasta que la corrija y vuelva a pedir el visto.
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 14, color: C.ink, lineHeight: 1.5 }}>
                {acta.creado_nombre ? <strong>{acta.creado_nombre}</strong> : "El residente"} terminó esta acta y pide tu visto.
                <div style={{ color: C.gris, fontSize: 13, marginTop: 3 }}>
                  Al darle el visto, los compromisos asignados pasan al tablero de cada uno y el acta queda
                  lista para mandar. Nada sale hasta que vos lo mandes.
                </div>
              </div>

              {/* A NOMBRE DE QUIÉN QUEDA. Si puede aprobarla más de una
                  persona, el enlace les llegó a todas: el nombre que queda
                  escrito es lo único que vale cuando el acta se opone meses
                  después, y no se puede adivinar. */}
              {aprueban.length > 1 && (
                <div style={{ marginTop: 11 }}>
                  <div style={{ fontSize: 11.5, color: C.gris, marginBottom: 4 }}>¿Quién está dando el visto?</div>
                  <select value={quien} onChange={e => setQuien(e.target.value)}
                    style={{ width: "100%", padding: "10px 12px", fontSize: 14, fontFamily: F,
                      border: `1px solid ${C.borde}`, borderRadius: 9, background: "#fff", boxSizing: "border-box" }}>
                    <option value="">Elegí tu nombre</option>
                    {aprueban.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                  </select>
                </div>
              )}

              <button onClick={() => responder(true)} disabled={ocupado}
                style={{ marginTop: 12, width: "100%", background: C.tinta, color: "#fff", border: "none",
                  borderRadius: 10, padding: "14px 16px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: F }}>
                {ocupado ? "Guardando…" : "Le doy el visto"}
              </button>
              {!objetando ? (
                <button onClick={() => setObjetando(true)}
                  style={{ marginTop: 8, width: "100%", background: "none", border: "none", color: C.ambar,
                    fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: F, padding: 6 }}>
                  Hay que corregir algo — devolverla
                </button>
              ) : (
                <>
                  <textarea value={nota} onChange={e => setNota(e.target.value)} rows={3} autoFocus
                    placeholder="¿Qué hay que corregir? Esto es lo que va a leer quien la escribió"
                    style={{ width: "100%", marginTop: 10, border: `1px solid ${C.borde}`, borderRadius: 9,
                      padding: "10px 12px", fontSize: 14, fontFamily: F, resize: "vertical", boxSizing: "border-box" }} />
                  <button onClick={() => responder(false)} disabled={ocupado || !nota.trim()}
                    style={{ marginTop: 7, width: "100%", background: "#fff", color: C.ambar,
                      border: `1px solid ${C.ambar}`, borderRadius: 10, padding: "12px 16px", fontSize: 14,
                      fontWeight: 700, cursor: nota.trim() ? "pointer" : "default", opacity: nota.trim() ? 1 : 0.5, fontFamily: F }}>
                    Devolverla con esta corrección
                  </button>
                </>
              )}
              {error && <div style={{ color: C.rojo, fontSize: 13, marginTop: 8 }}>{error}</div>}
            </>
          )}
        </Caja>

        <Caja titulo="ASISTENTES">
          <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.7 }}>
            {vinieron.length
              ? vinieron.map(a => (
                <div key={a.id}>{a.nombre}{a.empresa ? <span style={{ color: C.gris }}> · {a.empresa}</span> : null}
                  {a.cargo ? <span style={{ color: C.gris }}> · {a.cargo}</span> : null}</div>
              ))
              : <span style={{ color: C.gris }}>Sin asistentes cargados.</span>}
          </div>
          {faltaron.length > 0 && (
            <div style={{ fontSize: 12.5, color: C.gris, marginTop: 7 }}>
              No asistieron: {faltaron.map(a => a.nombre).join(", ")}
            </div>
          )}
        </Caja>

        {temas.length > 0 && (
          <Caja titulo="TEMAS TRATADOS">
            {temas.map((t, k) => (
              <div key={t.id} style={{ paddingTop: k ? 10 : 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>{k + 1}. {t.titulo}</div>
                {t.detalle && <div style={{ fontSize: 13, color: "#444", lineHeight: 1.55, marginTop: 2, whiteSpace: "pre-line" }}>{t.detalle}</div>}
                {t.resuelto
                  ? <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.55, marginTop: 4, paddingLeft: 9,
                      borderLeft: `3px solid ${C.tinta}` }}><strong>Se resuelve:</strong> {t.resuelto}</div>
                  : <div style={{ fontSize: 12.5, color: C.ambar, marginTop: 4 }}>Sin resolución escrita.</div>}
              </div>
            ))}
          </Caja>
        )}

        {/* EL REPASO Y LO NUEVO, APARTE. El primero dice si la obra cumple lo
            que promete; el segundo, qué prometió ahora. Mezclados no se lee
            ninguno de los dos. */}
        {repaso.length > 0 && (
          <Caja titulo="REPASO DE LA REUNIÓN ANTERIOR">
            {repaso.map(c => (
              <Compromiso key={c.id} c={c} conEstado />
            ))}
          </Caja>
        )}

        {nuevos.length > 0 && (
          <Caja titulo="COMPROMISOS DE ESTA REUNIÓN">
            {nuevos.map(c => <Compromiso key={c.id} c={c} />)}
          </Caja>
        )}

        {acta.avance_nota && (
          <Caja titulo="AVANCE">
            <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.6, whiteSpace: "pre-line" }}>{acta.avance_nota}</div>
          </Caja>
        )}

        {acta.resumen && (
          <Caja titulo="OTRAS CONSTANCIAS">
            <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.6, whiteSpace: "pre-line" }}>{acta.resumen}</div>
          </Caja>
        )}

        {acta.proxima_fecha && (
          <div style={{ fontSize: 13, color: C.ink, marginTop: 14 }}>
            <strong>Próxima reunión:</strong> {dia(acta.proxima_fecha)}{acta.proxima_hora ? ` a las ${hora(acta.proxima_hora)}` : ""}
          </div>
        )}

        <div style={{ fontSize: 11.5, color: C.gris, textAlign: "center", marginTop: 18, lineHeight: 1.5 }}>
          Este enlace abre solo esta acta. El visto queda con nombre y fecha.
          <div style={{ marginTop: 4 }}>FOREMAN · HCA Studio</div>
        </div>
      </div>
    </div>
  );
}

const Compromiso = ({ c, conEstado }) => (
  <div style={{ display: "flex", gap: 8, padding: "6px 0", borderTop: `1px solid ${C.fondo}` }}>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 13, color: c.urgente ? C.rojo : C.ink, lineHeight: 1.45 }}>
        {c.urgente ? <strong>URGENTE · </strong> : null}{c.texto}
      </div>
      <div style={{ fontSize: 11.5, color: C.gris, marginTop: 1 }}>
        {c.responsable_nombre || "sin responsable"}
        {c.fecha_limite ? ` · para el ${dia(c.fecha_limite)}` : " · sin fecha"}
      </div>
    </div>
    {conEstado && (
      <div style={{ fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
        color: c.estado === "cumplido" ? C.verde : C.ambar }}>
        {c.estado === "cumplido" ? "se hizo" : "no"}
      </div>
    )}
  </div>
);

const Centro = ({ children }) => (
  <div style={{ fontFamily: F, background: C.fondo, minHeight: "100vh", display: "flex",
    alignItems: "center", justifyContent: "center", color: C.gris, fontSize: 15, padding: 24, textAlign: "center" }}>
    {children}
  </div>
);

const Caja = ({ titulo, children }) => (
  <div style={{ background: "#fff", border: `1px solid ${C.borde}`, borderRadius: 12, padding: 16, marginTop: 14 }}>
    {titulo && <div style={{ fontSize: 10.5, fontWeight: 700, color: C.gris, letterSpacing: 0.5, marginBottom: 9 }}>{titulo}</div>}
    {children}
  </div>
);
