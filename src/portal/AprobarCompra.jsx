import { useEffect, useState } from "react";

// La aprobación, en el teléfono, para el que la tiene que dar.
//
// El que aprueba una compra está caminando por una obra con el teléfono en la
// mano: lo que tiene abierto es el correo, no FOREMAN. Pedirle que entre a una
// aplicación, se acuerde de la contraseña y busque la solicitud es lo que hacía
// que el cemento esperara dos días por un sí que ya estaba decidido.
//
// Entera, no un resumen: qué se pide, para qué, cuánto, quién lo pidió y la
// proforma a un toque. Aprobar un monto sin ver el papel no es aprobar; es
// firmar lo que alguien dice que dice el papel.
//
// Y la tarea sigue existiendo en el tablero. Esto es otra manera de
// contestarla, no un segundo sistema de aprobaciones.

const C = {
  tinta: "#0F3D3E", ink: "#111827", gris: "#6B7280", borde: "#E5E7EB",
  fondo: "#F7F7F5", rojo: "#B91C1C", verde: "#15803D", ambar: "#92400E",
};
const F = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const dia = f => (f ? new Date(`${String(f).slice(0, 10)}T12:00:00`)
  .toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" }) : "");
const plata = v => `$${(Number(v) || 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function AprobarCompra({ token, devolviendo = false }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [nota, setNota] = useState("");
  // El correo trae dos botones y el de "Devolver" abre esta misma página: lo
  // único que cambia es que el motivo ya está a la vista, porque es lo primero
  // que esa persona iba a buscar.
  const [objetando, setObjetando] = useState(devolviendo);
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState(null);

  useEffect(() => {
    fetch(`/api/portal?aprobar=1&t=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(d => (d?.error ? setError(d.error) : setDatos(d)))
      .catch(() => setError("No se pudo abrir la solicitud. Probá de nuevo en un momento."));
  }, [token]);

  async function responder(aprueba) {
    if (!aprueba && !nota.trim()) { setError("Para devolverla hay que decir qué falta."); return; }
    setEnviando(true); setError("");
    const r = await fetch("/api/portal", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aprobar: 1, token, aprueba, nota: nota.trim() || null }),
    });
    const d = await r.json().catch(() => ({}));
    setEnviando(false);
    if (!r.ok || d?.error) { setError(d?.error || "No se pudo guardar."); return; }
    setListo(aprueba ? "aprobada" : "devuelta");
  }

  if (error && !datos) return <Centro>{error}</Centro>;
  if (!datos) return <Centro>Abriendo la solicitud…</Centro>;

  const { tarea, compra, obra, yo, historial = [], adjuntos = [] } = datos;
  const decidida = listo || (["aprobada", "devuelta"].includes(tarea.aprobacion_estado) ? tarea.aprobacion_estado : null);

  return (
    <div style={{ fontFamily: F, background: C.fondo, minHeight: "100vh", padding: "0 0 60px" }}>
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "22px 16px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.gris, letterSpacing: 0.6 }}>
          {compra ? "SOLICITUD DE COMPRA" : "APROBACIÓN"}
        </div>
        <h1 style={{ fontSize: 21, color: C.tinta, margin: "4px 0 2px", lineHeight: 1.3 }}>
          {compra?.descripcion || tarea.title}
        </h1>
        <div style={{ fontSize: 13, color: C.gris }}>
          {[obra, compra?.destino].filter(Boolean).join(" · ")}
        </div>

        {compra?.urgente && (
          <div style={{ marginTop: 12, background: "#FEF2F2", border: "1px solid #FCA5A5", color: C.rojo,
            borderRadius: 10, padding: "9px 14px", fontWeight: 700, fontSize: 13, textAlign: "center" }}>
            URGENTE{compra.necesita_para ? ` — se necesita para el ${dia(compra.necesita_para)}` : ""}
          </div>
        )}

        {/* LO QUE SE LE PIDE, ARRIBA. */}
        <Caja>
          {decidida === "aprobada" ? (
            <div style={{ color: C.verde, fontSize: 15, fontWeight: 600 }}>
              ✓ Aprobaste esta compra.
              <div style={{ fontSize: 12.5, color: C.gris, fontWeight: 400, marginTop: 4 }}>
                Ya está en el tablero de compras para ejecutarla. Queda registrada con tu nombre y la fecha.
              </div>
            </div>
          ) : decidida === "devuelta" ? (
            <div style={{ color: C.ambar, fontSize: 15, fontWeight: 600 }}>
              La devolviste.
              <div style={{ fontSize: 12.5, color: C.gris, fontWeight: 400, marginTop: 4 }}>
                Volvió a quien la pidió con lo que escribiste. No se compra nada hasta que la corrija.
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 14, color: C.ink, lineHeight: 1.5 }}>
                <strong>{yo.nombre || "Tu visto"}</strong>{yo.rol ? ` · ${yo.rol}` : ""}
                <div style={{ color: C.gris, fontSize: 13, marginTop: 3 }}>
                  Leé el detalle y decidí. Si falta algo, devolvela escribiendo qué: vuelve a quien la pidió
                  y no se compra nada mientras tanto.
                </div>
              </div>
              <button onClick={() => responder(true)} disabled={enviando}
                style={{ marginTop: 12, width: "100%", background: C.tinta, color: "#fff", border: "none",
                  borderRadius: 10, padding: "14px 16px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: F }}>
                {enviando ? "Guardando…" : compra?.monto_estimado ? `Apruebo esta compra · ${plata(compra.monto_estimado)}` : "Apruebo esta compra"}
              </button>
              {!objetando ? (
                <button onClick={() => setObjetando(true)}
                  style={{ marginTop: 8, width: "100%", background: "none", border: "none", color: C.ambar,
                    fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: F, padding: 6 }}>
                  Falta algo — devolverla
                </button>
              ) : (
                <>
                  <textarea value={nota} onChange={e => setNota(e.target.value)} rows={3} autoFocus
                    placeholder="¿Qué falta? Esto es lo que va a leer quien la pidió"
                    style={{ width: "100%", marginTop: 10, border: `1px solid ${C.borde}`, borderRadius: 9,
                      padding: "10px 12px", fontSize: 14, fontFamily: F, resize: "vertical", boxSizing: "border-box" }} />
                  <button onClick={() => responder(false)} disabled={enviando || !nota.trim()}
                    style={{ marginTop: 7, width: "100%", background: "#fff", color: C.ambar,
                      border: `1px solid ${C.ambar}`, borderRadius: 10, padding: "12px 16px",
                      fontSize: 14, fontWeight: 700, cursor: nota.trim() ? "pointer" : "default",
                      opacity: nota.trim() ? 1 : 0.5, fontFamily: F }}>
                    Devolverla con esta observación
                  </button>
                </>
              )}
              {error && <div style={{ color: C.rojo, fontSize: 13, marginTop: 8 }}>{error}</div>}
            </>
          )}
        </Caja>

        <Caja titulo="EL PEDIDO">
          <Dato k="Qué" v={compra?.descripcion || tarea.title} />
          <Dato k="Para qué" v={compra?.justificacion} />
          <Dato k="Dónde va" v={compra?.destino || compra?.capitulo} />
          <Dato k="Monto estimado" v={compra?.monto_estimado ? plata(compra.monto_estimado) : null} fuerte />
          <Dato k="La pidió" v={compra?.solicitante_nombre} />
          <Dato k="Se necesita para" v={compra?.necesita_para ? dia(compra.necesita_para) : (tarea.due_date ? dia(tarea.due_date) : null)} />
          <Dato k="Proyecto" v={obra} />
        </Caja>

        {/* LA PROFORMA, A UN TOQUE. Es el papel sobre el que se decide. */}
        {adjuntos.length > 0 && (
          <Caja titulo="RESPALDOS">
            {adjuntos.map(a => (
              <div key={a.id} style={{ padding: "7px 0", borderTop: `1px solid ${C.fondo}` }}>
                {a.url ? (
                  <a href={a.url} target="_blank" rel="noreferrer"
                    style={{ fontSize: 13.5, color: C.tinta, fontWeight: 600, textDecoration: "none" }}>
                    {a.nombre || a.tipo || "Respaldo"} →
                  </a>
                ) : (
                  <span style={{ fontSize: 13.5, color: C.gris }}>{a.nombre || a.tipo}</span>
                )}
              </div>
            ))}
            <div style={{ fontSize: 11.5, color: C.gris, marginTop: 8 }}>
              Van también adjuntos en el correo, para verlos sin conexión.
            </div>
          </Caja>
        )}

        {/* LO QUE SE DIJO ANTES. Una compra que ya volvió una vez se aprueba
            distinto si se sabe por qué volvió. */}
        {historial.length > 0 && (
          <Caja titulo="LO QUE SE DIJO">
            {historial.map((h, k) => (
              <div key={k} style={{ padding: "6px 0", borderTop: k ? `1px solid ${C.fondo}` : "none" }}>
                <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.5 }}>{h.comentario}</div>
                <div style={{ fontSize: 11.5, color: C.gris, marginTop: 2 }}>
                  {h.usuario_nombre || "—"} · {dia(h.created_at)}
                </div>
              </div>
            ))}
          </Caja>
        )}

        <div style={{ fontSize: 11.5, color: C.gris, textAlign: "center", marginTop: 18, lineHeight: 1.5 }}>
          Este enlace es personal: la decisión queda a tu nombre.
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

const Dato = ({ k, v, fuerte }) => (v ? (
  <div style={{ display: "flex", gap: 10, padding: "4px 0" }}>
    <div style={{ fontSize: 12.5, color: C.gris, width: 118, flexShrink: 0 }}>{k}</div>
    <div style={{ fontSize: fuerte ? 15 : 13.5, color: C.ink, fontWeight: fuerte ? 700 : 400,
      lineHeight: 1.5, whiteSpace: "pre-line", minWidth: 0 }}>{v}</div>
  </div>
) : null);
