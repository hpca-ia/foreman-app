import { useEffect, useState } from "react";

// La orden de cambio, para quien la tiene que aprobar.
//
// Sin cuenta y sin contraseña: el fiscalizador, el contratante y el
// contratista no tienen una, y pedirles que se registren para aprobar un
// cambio es garantizar que el cambio no se apruebe — y mientras tanto el
// trabajo no se ejecuta y el plazo corre.
//
// Entera, no un resumen: los argumentos, lo que se agrega y lo que se quita
// con su precio, y cuántos días suma al plazo. Aprobar un documento que no se
// ve no es aprobar; es poner una firma donde alguien dice que hay que ponerla.
//
// Diseñada para el teléfono: la mitad se va a abrir caminando, desde el correo.

const C = {
  tinta: "#0F3D3E", ink: "#111827", gris: "#6B7280", borde: "#E5E7EB",
  fondo: "#F7F7F5", rojo: "#B91C1C", verde: "#15803D", ambar: "#92400E",
};
const F = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const dia = f => (f ? new Date(`${String(f).slice(0, 10)}T12:00:00`)
  .toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" }) : "");
const plata = v => (Number(v) || 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function AprobarOrdenDeCambio({ token }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [obs, setObs] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState(null);

  useEffect(() => {
    fetch(`/api/portal?odc=1&t=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(d => (d?.error ? setError(d.error) : setDatos(d)))
      .catch(() => setError("No se pudo abrir la orden de cambio. Probá de nuevo en un momento."));
  }, [token]);

  async function responder(aprueba) {
    if (!aprueba && !obs.trim()) { setError("Escribí qué objetás."); return; }
    setEnviando(true); setError("");
    const r = await fetch("/api/portal", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ odc: 1, token, aprueba, observacion: obs.trim() || null }),
    });
    const d = await r.json().catch(() => ({}));
    setEnviando(false);
    if (!r.ok || d?.error) { setError(d?.error || "No se pudo guardar."); return; }
    setListo(aprueba ? "aprobada" : "observacion");
  }

  if (error && !datos) return <Centro>{error}</Centro>;
  if (!datos) return <Centro>Abriendo la orden de cambio…</Centro>;

  const { orden, lineas, yo, obra, firmantes } = datos;
  const yaFirmo = !!yo.aprobado_at || listo === "aprobada";
  // Se agrupa por lo que la partida ES, no por el signo de su monto: una
  // reducción a la que todavía no le pusieron precio no es una adición de
  // cero pesos, y así es como la leía este cuadro.
  const agrega = lineas.filter(l => l.tipo !== "quita");
  const quita = lineas.filter(l => l.tipo === "quita");
  const suma = lineas.reduce((t, l) => t + (Number(l.total) || 0), 0);

  return (
    <div style={{ fontFamily: F, background: C.fondo, minHeight: "100vh", padding: "0 0 60px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "22px 16px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.gris, letterSpacing: 0.6 }}>ORDEN DE CAMBIO</div>
        <h1 style={{ fontSize: 22, color: C.tinta, margin: "4px 0 2px" }}>
          {orden.codigo || `N° ${orden.numero}`} · {obra}
        </h1>
        <div style={{ fontSize: 13, color: C.gris }}>
          {orden.titulo}{orden.fecha ? ` · ${dia(orden.fecha)}` : ""}{orden.lugar ? ` · ${orden.lugar}` : ""}
        </div>

        {orden.anulada && (
          <div style={{ marginTop: 12, background: "#FEF2F2", border: "1px solid #FCA5A5", color: C.rojo,
            borderRadius: 10, padding: "10px 14px", fontWeight: 700, fontSize: 13, textAlign: "center" }}>
            ORDEN ANULADA — NO EJECUTADA
          </div>
        )}

        {/* LO QUE SE LE PIDE, ARRIBA. Quien abre esto desde el correo quiere
            saber en dos segundos qué tiene que hacer. */}
        <Caja>
          {yaFirmo ? (
            <div style={{ color: C.verde, fontSize: 15, fontWeight: 600 }}>
              ✓ Aprobaste esta orden de cambio.
              <div style={{ fontSize: 12.5, color: C.gris, fontWeight: 400, marginTop: 4 }}>
                {yo.aprobado_at ? `El ${dia(yo.aprobado_at)}.` : ""} Queda registrada con tu nombre, la fecha y desde dónde.
              </div>
            </div>
          ) : listo === "observacion" ? (
            <div style={{ color: C.ambar, fontSize: 15, fontWeight: 600 }}>
              Tu observación quedó registrada.
              <div style={{ fontSize: 12.5, color: C.gris, fontWeight: 400, marginTop: 4 }}>
                Le llegó al equipo de la obra. Mientras no esté resuelta, este trabajo no se ejecuta.
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 14, color: C.ink, lineHeight: 1.5 }}>
                <strong>{yo.nombre || "Tu aprobación"}</strong>{yo.rol ? ` · ${yo.rol}` : ""}
                <div style={{ color: C.gris, fontSize: 13, marginTop: 3 }}>
                  Leé el detalle y aprobá. Si algo no está bien, escribilo: queda como constancia y el
                  trabajo no se ejecuta hasta resolverlo.
                </div>
                {/* LA FECHA LÍMITE, DONDE SE DECIDE. Sin ella, el que recibe no
                    sabe que hay una obra parada esperándolo. */}
                {orden.fecha_limite_aprobacion && (
                  <div style={{ marginTop: 7, fontSize: 13, fontWeight: 700,
                    color: String(orden.fecha_limite_aprobacion).slice(0, 10) < new Date().toISOString().slice(0, 10) ? C.rojo : C.ambar }}>
                    {String(orden.fecha_limite_aprobacion).slice(0, 10) < new Date().toISOString().slice(0, 10)
                      ? `El plazo venció el ${dia(orden.fecha_limite_aprobacion)}: la obra está esperando esta firma.`
                      : `Necesitamos tu respuesta antes del ${dia(orden.fecha_limite_aprobacion)}.`}
                  </div>
                )}
              </div>
              <button onClick={() => responder(true)} disabled={enviando}
                style={{ marginTop: 12, width: "100%", background: C.tinta, color: "#fff", border: "none",
                  borderRadius: 10, padding: "14px 16px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: F }}>
                {enviando ? "Guardando…" : "Apruebo esta orden de cambio"}
              </button>
              <textarea value={obs} onChange={e => setObs(e.target.value)} rows={3}
                placeholder="¿Algo no está bien? Escribilo acá"
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

        {orden.justificacion && (
          <Caja titulo="POR QUÉ SE PIDE">
            <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.6, whiteSpace: "pre-line" }}>
              {orden.justificacion}
            </div>
          </Caja>
        )}

        {/* LO QUE AGREGA Y LO QUE QUITA, por separado y con su precio. Un neto
            solo esconde la mitad de la conversación. */}
        {lineas.length > 0 && (
          <Caja titulo="QUÉ CAMBIA">
            {[["SE AGREGA", agrega], ["SE QUITA", quita]].map(([rotulo, lista]) => (lista.length ? (
              <div key={rotulo} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: C.gris, letterSpacing: 0.4, marginBottom: 4 }}>{rotulo}</div>
                {lista.map((l, k) => (
                  <div key={k} style={{ display: "flex", gap: 8, padding: "5px 0", borderTop: `1px solid ${C.fondo}` }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.4 }}>{l.descripcion}</div>
                      <div style={{ fontSize: 11.5, color: C.gris }}>
                        {l.item ? `${l.item} · ` : ""}{Number(l.cantidad) || 0} {l.unidad} × ${plata(l.precio_unitario)}
                      </div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: (Number(l.total) || 0) < 0 ? C.verde : C.ink, whiteSpace: "nowrap" }}>
                      ${plata(l.total)}
                    </div>
                  </div>
                ))}
              </div>
            ) : null))}
            <div style={{ borderTop: `2px solid ${C.borde}`, marginTop: 6, paddingTop: 8, display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>Diferencia sobre el contrato</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: suma < 0 ? C.verde : C.tinta }}>${plata(suma)}</span>
            </div>
            {!!orden.dias_impacto && (
              <div style={{ fontSize: 12.5, color: C.ambar, marginTop: 7, fontWeight: 600 }}>
                Suma {orden.dias_impacto} {Number(orden.dias_impacto) === 1 ? "día" : "días"} al plazo de obra.
              </div>
            )}
            {orden.impacto_cronograma && (
              <div style={{ fontSize: 12.5, color: C.gris, marginTop: 4, lineHeight: 1.5, whiteSpace: "pre-line" }}>
                {orden.impacto_cronograma}
              </div>
            )}
          </Caja>
        )}

        {/* QUIÉN MÁS TIENE QUE FIRMAR. Saber que falta la fiscalización evita
            la llamada de "¿y esto ya está aprobado?". */}
        {firmantes.length > 1 && (
          <Caja titulo="QUIÉNES APRUEBAN">
            {firmantes.map((x, k) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
                <span style={{ color: C.ink }}>{x.nombre || "—"}{x.rol ? ` · ${x.rol}` : ""}</span>
                <span style={{ color: x.aprobado_at ? C.verde : C.gris, fontSize: 12.5 }}>
                  {x.aprobado_at ? `aprobó el ${dia(x.aprobado_at)}` : "pendiente"}
                </span>
              </div>
            ))}
          </Caja>
        )}

        <div style={{ fontSize: 11.5, color: C.gris, textAlign: "center", marginTop: 18, lineHeight: 1.5 }}>
          Este enlace es personal: la aprobación queda a tu nombre.
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
