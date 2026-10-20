import { useEffect, useState } from "react";

// El libro de obra, para quien lo tiene que dar por revisado.
//
// Sin cuenta y sin contraseña: la fiscalización, el cliente o un perito no
// tienen una, y pedirles que se registren para mirar un libro es garantizar que
// no lo miren. Entran por un enlace propio, ven los días del tramo que se les
// entregó y lo dan por revisado —o escriben qué no coincide con lo que vieron
// en obra—.
//
// EL PDF YA LES LLEGÓ POR CORREO, pero el correo se archiva y el enlace se abre
// tres semanas después, desde el teléfono. Si al entrar no se ve qué se está
// aprobando, lo que queda es un botón a ciegas, y una conformidad a ciegas no
// es una conformidad. Por eso acá están los días, con lo que se escribió.
//
// Lo que se aprueba es un PERÍODO, no un envío: "revisé el libro del 1 al 30 de
// septiembre". El mes que viene es otra entrega y otra conformidad.

const C = {
  tinta: "#0F3D3E", ink: "#111827", gris: "#6B7280", borde: "#E5E7EB",
  fondo: "#F7F7F5", rojo: "#B91C1C", verde: "#15803D", ambar: "#92400E",
};
const F = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const dia = f => (f ? new Date(`${String(f).slice(0, 10)}T12:00:00`)
  .toLocaleDateString("es-EC", { weekday: "long", day: "numeric", month: "long" }) : "");
const corta = f => (f ? new Date(`${String(f).slice(0, 10)}T12:00:00`)
  .toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" }) : "");

export default function FirmaDelLibro({ token }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [obs, setObs] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState(null);

  useEffect(() => {
    fetch(`/api/portal?libro=1&t=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(d => (d?.error ? setError(d.error) : setDatos(d)))
      .catch(() => setError("No se pudo abrir el libro. Probá de nuevo en un momento."));
  }, [token]);

  async function responder(conforme) {
    if (!conforme && !obs.trim()) { setError("Escribí qué no coincide."); return; }
    setEnviando(true); setError("");
    const r = await fetch("/api/portal", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ libro: 1, token, conforme, observacion: obs.trim() || null }),
    });
    const d = await r.json().catch(() => ({}));
    setEnviando(false);
    if (!r.ok || d?.error) { setError(d?.error || "No se pudo guardar."); return; }
    setListo(conforme ? "conforme" : "observacion");
  }

  if (error && !datos) return <Centro>{error}</Centro>;
  if (!datos) return <Centro>Abriendo el libro…</Centro>;

  const { obra, tramo, yo, dias } = datos;
  const yaFirmo = !!yo.conforme_at || listo === "conforme";
  const elTramo = tramo.desde && tramo.hasta
    ? (tramo.desde === tramo.hasta ? corta(tramo.desde) : `${corta(tramo.desde)} al ${corta(tramo.hasta)}`)
    : "";

  return (
    <div style={{ fontFamily: F, background: C.fondo, minHeight: "100vh", padding: "0 0 60px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "22px 16px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.gris, letterSpacing: 0.6 }}>LIBRO DE OBRA</div>
        <h1 style={{ fontSize: 22, color: C.tinta, margin: "4px 0 2px" }}>{obra}</h1>
        <div style={{ fontSize: 13, color: C.gris }}>
          {elTramo}{dias.length ? ` · ${dias.length} ${dias.length === 1 ? "día cerrado" : "días cerrados"}` : ""}
        </div>

        {/* LO QUE SE LE PIDE, ARRIBA Y NO AL FINAL. Quien abre esto desde el
            correo quiere saber en dos segundos qué tiene que hacer. */}
        <Caja>
          {yaFirmo ? (
            <div style={{ color: C.verde, fontSize: 15, fontWeight: 600 }}>
              ✓ Diste por revisado este tramo del libro.
              <div style={{ fontSize: 12.5, color: C.gris, fontWeight: 400, marginTop: 4 }}>
                {yo.conforme_at ? `El ${corta(yo.conforme_at)}.` : ""} Queda registrado con tu nombre y la fecha.
              </div>
            </div>
          ) : listo === "observacion" ? (
            <div style={{ color: C.ambar, fontSize: 15, fontWeight: 600 }}>
              Tu observación quedó registrada.
              <div style={{ fontSize: 12.5, color: C.gris, fontWeight: 400, marginTop: 4 }}>
                Le llegó al equipo de la obra, que es quien puede reabrir un día y corregirlo.
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 14, color: C.ink, lineHeight: 1.5 }}>
                <strong>{yo.nombre || yo.email}</strong>
                <div style={{ color: C.gris, fontSize: 13, marginTop: 3 }}>
                  Mirá los días de abajo y dalos por revisados. Si algo no coincide con lo que viste en obra,
                  escribilo: queda como constancia y le llega al equipo.
                </div>
              </div>
              <button onClick={() => responder(true)} disabled={enviando}
                style={{ marginTop: 12, width: "100%", background: C.tinta, color: "#fff", border: "none",
                  borderRadius: 10, padding: "14px 16px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: F }}>
                {enviando ? "Guardando…" : "Doy por revisado el libro"}
              </button>
              <textarea value={obs} onChange={e => setObs(e.target.value)} rows={3}
                placeholder="¿Algo no coincide con lo que viste en obra? Escribilo acá"
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

        {/* LOS DÍAS, COMO SE ESCRIBIERON. El PDF del correo es el documento;
            esto es para poder mirarlo sin bajar nada, que es lo que se hace
            desde el teléfono. */}
        {dias.map(d => (
          <Caja key={d.fecha} titulo={`${dia(d.fecha).toUpperCase()}${d.estado === "aprobado" ? " · APROBADO" : ""}`}>
            {d.entradas.length === 0 ? (
              <div style={{ fontSize: 13, color: C.gris }}>Sin novedades ese día.</div>
            ) : (
              d.entradas.map((e, k) => (
                <div key={k} style={{ marginBottom: 9 }}>
                  {e.categoria && (
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: C.gris, letterSpacing: 0.4,
                      textTransform: "uppercase", marginBottom: 2 }}>{e.categoria}</div>
                  )}
                  <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.55, whiteSpace: "pre-line" }}>{e.contenido}</div>
                </div>
              ))
            )}
          </Caja>
        ))}

        <div style={{ fontSize: 11.5, color: C.gris, textAlign: "center", marginTop: 18, lineHeight: 1.5 }}>
          Cada día lo cerró quien lo escribió y, una vez cerrado, no se cambia: si hizo falta corregir algo,
          el día dice que fue reabierto y cuándo.
          <div style={{ marginTop: 4 }}>FOREMAN · HCA Studio</div>
        </div>
      </div>
    </div>
  );
}

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
