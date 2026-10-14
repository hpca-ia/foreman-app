import { useEffect, useState } from "react";

// El acta, para quien la tiene que firmar.
//
// Sin cuenta y sin contraseña: el cliente, la fiscalización y los contratistas
// no tienen una, y pedirles que se registren para leer un acta es garantizar
// que no la lean. Entran por un enlace propio, ven lo que se decidió y dan
// conformidad —o escriben qué no refleja lo acordado—.
//
// Eso es lo que convierte un envío en una firma. Hoy, el que está de acuerdo
// no hace nada, y el silencio no se distingue de "no lo leyó": tres meses
// después "se lo mandamos" no prueba nada. Acá queda quién, cuándo y desde
// dónde.
//
// Diseñada para el teléfono: la mitad se va a abrir caminando, desde el correo.

const C = {
  tinta: "#0F3D3E", ink: "#111827", gris: "#6B7280", borde: "#E5E7EB",
  fondo: "#F7F7F5", rojo: "#B91C1C", verde: "#15803D", ambar: "#92400E",
};
const F = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const dia = f => (f ? new Date(`${String(f).slice(0, 10)}T12:00:00`).toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" }) : "");
const hora = h => (h ? String(h).slice(0, 5) : "");

export default function FirmaDelActa({ token }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [obs, setObs] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState(null);

  useEffect(() => {
    fetch(`/api/portal?acta=1&t=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(d => (d?.error ? setError(d.error) : setDatos(d)))
      .catch(() => setError("No se pudo abrir el acta. Probá de nuevo en un momento."));
  }, [token]);

  async function responder(conforme) {
    if (!conforme && !obs.trim()) { setError("Escribí qué no refleja lo acordado."); return; }
    setEnviando(true); setError("");
    const r = await fetch("/api/portal", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acta: 1, token, conforme, observacion: obs.trim() || null }),
    });
    const d = await r.json().catch(() => ({}));
    setEnviando(false);
    if (!r.ok || d?.error) { setError(d?.error || "No se pudo guardar."); return; }
    setListo(conforme ? "conforme" : "observacion");
  }

  if (error && !datos) return <Centro>{error}</Centro>;
  if (!datos) return <Centro>Abriendo el acta…</Centro>;

  const { acta, yo, obra, asistentes, temas, compromisos, adjuntos } = datos;
  const yaFirmo = !!yo.conforme_at || listo === "conforme";
  const vinieron = asistentes.filter(a => a.asistio && a.nombre);
  const repaso = compromisos.filter(c => c.viene_de);
  const nuevos = compromisos.filter(c => !c.viene_de);

  return (
    <div style={{ fontFamily: F, background: C.fondo, minHeight: "100vh", padding: "0 0 60px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "22px 16px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.gris, letterSpacing: 0.6 }}>ACTA DE REUNIÓN DE OBRA</div>
        <h1 style={{ fontSize: 22, color: C.tinta, margin: "4px 0 2px" }}>N° {acta.numero} · {obra}</h1>
        <div style={{ fontSize: 13, color: C.gris }}>
          {dia(acta.fecha)}
          {acta.hora_inicio && ` · ${hora(acta.hora_inicio)}${acta.hora_fin ? ` a ${hora(acta.hora_fin)}` : ""}`}
          {acta.lugar && ` · ${acta.lugar}`}
        </div>

        {/* LO QUE SE LE PIDE, ARRIBA Y NO AL FINAL.
            Quien abre esto desde el correo quiere saber en dos segundos qué
            tiene que hacer. Un botón al pie de un documento de tres pantallas
            es un botón que la mitad no encuentra. */}
        <Caja>
          {yaFirmo ? (
            <div style={{ color: C.verde, fontSize: 15, fontWeight: 600 }}>
              ✓ Diste conformidad a esta acta.
              <div style={{ fontSize: 12.5, color: C.gris, fontWeight: 400, marginTop: 4 }}>
                {yo.conforme_at ? `El ${dia(yo.conforme_at)}.` : ""} Queda registrado con tu nombre y la fecha.
              </div>
            </div>
          ) : listo === "observacion" ? (
            <div style={{ color: C.ambar, fontSize: 15, fontWeight: 600 }}>
              Tu observación quedó registrada.
              <div style={{ fontSize: 12.5, color: C.gris, fontWeight: 400, marginTop: 4 }}>
                Va a tratarse en la próxima reunión, en el repaso. Quien escribió el acta y quien la aprobó
                ya la pueden ver.
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 14, color: C.ink, lineHeight: 1.5 }}>
                <strong>{yo.nombre}</strong>{yo.empresa ? ` · ${yo.empresa}` : ""}
                <div style={{ color: C.gris, fontSize: 13, marginTop: 3 }}>
                  Leé el acta y confirmá si refleja lo que se acordó. Si algo no está bien, escribilo: queda
                  como constancia y se trata en la próxima reunión.
                </div>
              </div>
              <button onClick={() => responder(true)} disabled={enviando}
                style={{ marginTop: 12, width: "100%", background: C.tinta, color: "#fff", border: "none",
                  borderRadius: 10, padding: "14px 16px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: F }}>
                {enviando ? "Guardando…" : "Doy conformidad"}
              </button>
              <textarea value={obs} onChange={e => setObs(e.target.value)} rows={3}
                placeholder="¿Algo no refleja lo acordado? Escribilo acá"
                style={{ width: "100%", marginTop: 9, border: `1px solid ${C.borde}`, borderRadius: 9,
                  padding: "10px 12px", fontSize: 14, fontFamily: F, resize: "vertical", boxSizing: "border-box" }} />
              {obs.trim() && (
                <button onClick={() => responder(false)} disabled={enviando}
                  style={{ marginTop: 7, width: "100%", background: "#fff", color: C.ambar,
                    border: `1px solid ${C.ambar}`, borderRadius: 10, padding: "12px 16px",
                    fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: F }}>
                  Enviar mi observación
                </button>
              )}
              {error && <div style={{ color: C.rojo, fontSize: 13, marginTop: 8 }}>{error}</div>}
            </>
          )}
        </Caja>

        <Caja titulo="ASISTENTES">
          {vinieron.map((a, i) => (
            <div key={i} style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.7 }}>
              {a.nombre}{a.empresa ? <span style={{ color: C.gris }}> · {a.empresa}</span> : null}
              {a.cargo ? <span style={{ color: C.gris }}> · {a.cargo}</span> : null}
              {a.conforme_at && <span style={{ color: C.verde, fontSize: 11.5 }}> · dio conformidad</span>}
            </div>
          ))}
        </Caja>

        {repaso.length > 0 && (
          <Caja titulo="REPASO DE LA REUNIÓN ANTERIOR">
            {repaso.map((c, i) => <Compromiso key={i} c={c} />)}
          </Caja>
        )}

        {temas.length > 0 && (
          <Caja titulo="TEMAS TRATADOS">
            {temas.map((t, i) => (
              <div key={i} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: C.ink }}>{i + 1}. {t.titulo}</div>
                {t.detalle && <div style={{ fontSize: 13.5, color: "#374151", lineHeight: 1.55, marginTop: 3 }}>{t.detalle}</div>}
                {t.resuelto && (
                  <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.55, marginTop: 5,
                    paddingLeft: 10, borderLeft: `3px solid ${C.tinta}` }}>
                    <strong>Se resuelve:</strong> {t.resuelto}
                  </div>
                )}
              </div>
            ))}
          </Caja>
        )}

        {nuevos.length > 0 && (
          <Caja titulo="COMPROMISOS DE ESTA REUNIÓN">
            {nuevos.map((c, i) => <Compromiso key={i} c={c} />)}
          </Caja>
        )}

        {acta.avance_nota && <Caja titulo="AVANCE DE LA OBRA"><Texto>{acta.avance_nota}</Texto></Caja>}
        {acta.resumen && <Caja titulo="OTRAS CONSTANCIAS"><Texto>{acta.resumen}</Texto></Caja>}
        {adjuntos.length > 0 && (
          <Caja titulo="ANEXOS">
            {adjuntos.map((a, i) => (
              <div key={i} style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.6 }}>
                · {a.nombre}{a.descripcion ? <span style={{ color: C.gris }}> — {a.descripcion}</span> : null}
              </div>
            ))}
            <div style={{ fontSize: 12, color: C.gris, marginTop: 6 }}>
              Los archivos van adjuntos en el correo con el que llegó este enlace.
            </div>
          </Caja>
        )}

        {acta.proxima_fecha && (
          <Caja>
            <div style={{ fontSize: 14, color: C.ink }}>
              <strong>Próxima reunión:</strong> {dia(acta.proxima_fecha)}
              {acta.proxima_hora && ` a las ${hora(acta.proxima_hora)}`}
            </div>
          </Caja>
        )}

        <div style={{ fontSize: 11.5, color: C.gris, textAlign: "center", marginTop: 18, lineHeight: 1.5 }}>
          FOREMAN · HCA Studio<br />
          Este enlace es personal: registra tu conformidad con tu nombre y la fecha.
        </div>
      </div>
    </div>
  );
}

const Centro = ({ children }) => (
  <div style={{ fontFamily: F, minHeight: "100vh", display: "flex", alignItems: "center",
    justifyContent: "center", color: C.gris, fontSize: 15, padding: 24, textAlign: "center" }}>{children}</div>
);

const Caja = ({ titulo, children }) => (
  <div style={{ background: "#fff", border: `1px solid ${C.borde}`, borderRadius: 12, padding: 16, marginTop: 14 }}>
    {titulo && <div style={{ fontSize: 10.5, fontWeight: 700, color: C.gris, letterSpacing: 0.5, marginBottom: 9 }}>{titulo}</div>}
    {children}
  </div>
);

const Texto = ({ children }) => (
  <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.55, whiteSpace: "pre-line" }}>{children}</div>
);

const Compromiso = ({ c }) => (
  <div style={{ marginBottom: 9, paddingBottom: 9, borderBottom: `1px solid ${C.fondo}` }}>
    <div style={{ fontSize: 13.5, color: c.estado === "cumplido" ? C.gris : C.ink, lineHeight: 1.45,
      textDecoration: c.estado === "cumplido" ? "line-through" : "none" }}>
      {c.urgente && c.estado !== "cumplido" && (
        <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", background: C.rojo,
          borderRadius: 9, padding: "1px 6px", marginRight: 5 }}>URGENTE</span>
      )}
      {c.texto}
    </div>
    <div style={{ fontSize: 12, color: C.gris, marginTop: 2 }}>
      {c.responsable_nombre || "sin responsable"}
      {c.fecha_limite && ` · para el ${dia(c.fecha_limite)}`}
      {c.estado === "cumplido" && " · cumplido"}
    </div>
  </div>
);
