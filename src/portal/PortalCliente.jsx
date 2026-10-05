import { useEffect, useState, useCallback } from "react";
import { colors } from "../theme/colors";
import VisorFotos from "../components/VisorFotos";

// Lo que ve el cliente. Sin login, sin FOREMAN alrededor.
//
// Entra desde el teléfono, parado en cualquier lado, a mirar cómo va su obra.
// No conoce el vocabulario de adentro —rubro, planilla, agrupación— así que
// acá no aparece ninguno: las fotos del mes, lo que se levantó en la visita y
// lo que le estamos preguntando. Nada más.
//
// Tres pantallas y no una lista larga: lo que viene a hacer casi siempre es
// una de las tres cosas, y ponerlas juntas obliga a bajar hasta encontrar la
// suya. Arranca en el avance, que es lo que mira el 90% de las veces.

const dia = f => (f ? new Date(`${String(f).slice(0, 10)}T12:00:00`)
  .toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" }) : "");

export default function PortalCliente({ token }) {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);
  const [solapa, setSolapa] = useState("avance");
  const [mirando, setMirando] = useState(null);
  const [enviando, setEnviando] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await fetch(`/api/portal?t=${encodeURIComponent(token)}`);
      const d = await r.json();
      if (!r.ok) { setError(d.error || "No se pudo abrir."); setInfo(null); }
      else { setInfo(d); setError(""); }
    } catch {
      setError("No se pudo conectar. Probá de nuevo en un momento.");
    }
    setCargando(false);
  }, [token]);
  useEffect(() => { cargar(); }, [cargar]);

  async function contestar(cuerpo) {
    setEnviando(cuerpo.id);
    try {
      const r = await fetch("/api/portal", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...cuerpo }),
      });
      const d = await r.json();
      if (!r.ok) { window.alert(d.error || "No se pudo guardar."); }
      else await cargar();
    } catch {
      window.alert("No se pudo guardar. Probá de nuevo.");
    }
    setEnviando(null);
  }

  if (cargando) return <Marco><p style={{ color: colors.muted, textAlign: "center", padding: "40px 0" }}>Cargando…</p></Marco>;
  if (error || !info) {
    return (
      <Marco>
        <div style={{ textAlign: "center", padding: "50px 20px", color: colors.inkSoft }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: colors.ink, marginBottom: 6 }}>{error || "No disponible"}</div>
          <div style={{ fontSize: 13 }}>Pedile a tu contacto en la obra un enlace nuevo.</div>
        </div>
      </Marco>
    );
  }

  const { proyecto, recorridas, observaciones, avance, entregas, ordenes = [] } = info;
  const ocPendientes = ordenes.filter(o => o.cliente_respondio_at == null);
  const porContestar = entregas.filter(e => e.estado === "enviado").length + ocPendientes.length;
  const fotos = avance.filter(f => f.url).map(f => ({ ...f, titulo: f.titulo || dia(f.fecha) }));

  const solapas = [
    ["avance", "Avance", avance.length],
    ["recorridas", "Recorridas", observaciones.length],
    ["aprobar", "Para aprobar", porContestar],
  ];

  return (
    <Marco>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 19, fontWeight: 700, color: colors.ink, lineHeight: 1.25 }}>{proyecto.nombre}</div>
        <div style={{ fontSize: 12.5, color: colors.muted, marginTop: 2 }}>
          Cómo va la obra · HCA Studio
        </div>
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: `1px solid ${colors.border}` }}>
        {solapas.map(([id, label, n]) => (
          <button key={id} onClick={() => setSolapa(id)}
            style={{ padding: "8px 13px", border: "none", background: "transparent",
              borderBottom: solapa === id ? `2px solid ${colors.brand}` : "2px solid transparent",
              color: solapa === id ? colors.brand : colors.inkSoft,
              fontSize: 13, fontWeight: solapa === id ? 600 : 400, cursor: "pointer", fontFamily: colors.font,
              display: "flex", alignItems: "center", gap: 5 }}>
            {label}
            {n > 0 && (
              <span style={{ background: id === "aprobar" ? colors.warning : colors.neutralSoft,
                color: id === "aprobar" ? "#fff" : colors.muted, borderRadius: 9, padding: "0 6px",
                fontSize: 10.5, fontWeight: 700 }}>{n}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── El avance ──────────────────────────────────────────────── */}
      {solapa === "avance" && (
        !avance.length
          ? <Vacio>Todavía no hay fotos de avance cargadas.</Vacio>
          : agruparPorFecha(avance).map(g => (
            <div key={g.fecha} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: colors.ink, marginBottom: 7 }}>{dia(g.fecha)}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 7 }}>
                {g.fotos.map(f => (
                  <div key={f.id}>
                    {f.url && (
                      <img src={f.url} alt={f.titulo || ""}
                        onClick={() => setMirando(Math.max(0, fotos.findIndex(x => x.id === f.id)))}
                        style={{ width: "100%", height: 112, objectFit: "cover", borderRadius: 9,
                          border: `1px solid ${colors.border}`, display: "block", cursor: "zoom-in" }} />
                    )}
                    {(f.titulo || f.descripcion) && (
                      <div style={{ fontSize: 11.5, color: colors.inkSoft, marginTop: 4, lineHeight: 1.45 }}>
                        {f.titulo && <strong style={{ color: colors.ink }}>{f.titulo}. </strong>}
                        {f.descripcion}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
      )}

      {/* ── Las recorridas ─────────────────────────────────────────── */}
      {solapa === "recorridas" && (
        !observaciones.length
          ? <Vacio>Todavía no hay observaciones de las visitas.</Vacio>
          : recorridas.map(rec => {
            const suyas = observaciones.filter(o => o.recorrida_id === rec.id);
            if (!suyas.length) return null;
            return (
              <div key={rec.id} style={{ marginBottom: 22 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.ink }}>Visita del {dia(rec.fecha)}</div>
                {rec.participantes && <div style={{ fontSize: 11.5, color: colors.muted, marginBottom: 8 }}>{rec.participantes}</div>}
                {suyas.map(o => (
                  <Observacion key={o.id} o={o} enviando={enviando === o.id}
                    onContestar={(conforme, nota) => contestar({ que: "observacion", id: o.id, conforme, nota })} />
                ))}
              </div>
            );
          })
      )}

      {/* ── Lo que esperamos que mire ──────────────────────────────── */}
      {solapa === "aprobar" && (
        !entregas.length && !ordenes.length
          ? <Vacio>No hay nada esperando tu respuesta.</Vacio>
          : <>
            {/* Las órdenes de cambio van primero: es plata que se suma al
                contrato, y es lo único acá que cambia lo que se va a pagar. */}
            {ordenes.map(o => (
              <OrdenCambio key={o.id} o={o} enviando={enviando === o.id}
                onContestar={(acepta, nota) => contestar({ que: "orden", id: o.id, conforme: acepta, nota })} />
            ))}
            {entregas.map(e => (
              <Entrega key={e.id} e={e} enviando={enviando === e.id}
                onContestar={(estado, nota) => contestar({ que: "entrega", id: e.id, estado, nota })} />
            ))}
          </>
      )}

      {mirando !== null && (
        <VisorFotos fotos={fotos} indice={mirando} onIndice={setMirando} onCerrar={() => setMirando(null)} />
      )}
    </Marco>
  );
}

// ── Piezas ────────────────────────────────────────────────────────────────

function Observacion({ o, onContestar, enviando }) {
  const [nota, setNota] = useState("");
  const [abierto, setAbierto] = useState(false);
  const resuelta = o.estado === "resuelta" || o.estado === "verificada";
  const antes = (o.fotos || []).filter(f => f.momento !== "solucion" && f.url);
  const despues = (o.fotos || []).filter(f => f.momento === "solucion" && f.url);

  return (
    <div style={{ background: "#fff", border: `1px solid ${colors.border}`, borderRadius: 11, padding: 12, marginBottom: 8 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: colors.ink, lineHeight: 1.35 }}>{o.titulo}</div>
      {o.ubicacion && <div style={{ fontSize: 12, color: colors.muted, marginTop: 1 }}>{o.ubicacion}</div>}
      {o.detalle && <div style={{ fontSize: 12.5, color: colors.inkSoft, marginTop: 5, lineHeight: 1.5 }}>{o.detalle}</div>}

      {(antes.length > 0 || despues.length > 0) && (
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          {[...antes, ...despues].map(f => (
            <a key={f.id} href={f.url} target="_blank" rel="noreferrer">
              <img src={f.url} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 7, border: `1px solid ${colors.border}`, display: "block" }} />
            </a>
          ))}
        </div>
      )}

      {/* La respuesta del cliente solo se pide cuando ya se arregló: pedirle
          que dé por buena una fisura que todavía está ahí es pedirle que
          conteste algo que no puede saber. */}
      {resuelta && (
        o.cliente_visto_at ? (
          <div style={{ marginTop: 9, paddingTop: 8, borderTop: `1px solid ${colors.neutralSoft}`, fontSize: 12.5,
            color: o.cliente_conforme ? colors.success : colors.warning, fontWeight: 600 }}>
            {o.cliente_conforme ? "Lo diste por bueno" : "Dijiste que todavía no"}
            {o.cliente_nota && <div style={{ color: colors.inkSoft, fontWeight: 400, marginTop: 2 }}>{o.cliente_nota}</div>}
          </div>
        ) : (
          <div style={{ marginTop: 9, paddingTop: 8, borderTop: `1px solid ${colors.neutralSoft}` }}>
            <div style={{ fontSize: 12, color: colors.muted, marginBottom: 6 }}>Nos dicen que quedó arreglado. ¿Lo ves bien?</div>
            {abierto && (
              <textarea value={nota} onChange={e => setNota(e.target.value)} rows={2}
                placeholder="¿Qué falta?" style={{ width: "100%", border: `1px solid ${colors.border}`, borderRadius: 8,
                  padding: "7px 9px", fontSize: 12.5, fontFamily: colors.font, marginBottom: 6, resize: "vertical" }} />
            )}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button disabled={enviando} onClick={() => onContestar(true, nota)} style={botonSi}>Sí, quedó bien</button>
              <button disabled={enviando}
                onClick={() => (abierto ? onContestar(false, nota) : setAbierto(true))}
                style={botonNo}>{abierto ? "Mandar" : "Todavía no"}</button>
            </div>
          </div>
        )
      )}
    </div>
  );
}

/**
 * Una orden de cambio, para que el cliente la apruebe.
 *
 * Con todo lo que la compone a la vista: por qué se pide, qué se agrega o se
 * quita con su precio, cuántos días suma, y las fotos. Aprobar un número sin
 * ver qué lo forma no es aprobar, es firmar — y eso es justo lo que vuelve
 * discutible una orden tres meses después.
 */
function OrdenCambio({ o, onContestar, enviando }) {
  const [nota, setNota] = useState("");
  const [abierto, setAbierto] = useState(false);
  const contestada = !!o.cliente_respondio_at;
  const plata = v => `$${Math.abs(Number(v) || 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div style={{ background: "#fff", border: `1px solid ${colors.border}`, borderLeft: `3px solid ${colors.brand}`,
      borderRadius: 11, padding: 13, marginBottom: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.4 }}>
        ORDEN DE CAMBIO {o.codigo || `N°${o.numero}`}
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: colors.ink, lineHeight: 1.3, marginTop: 2 }}>{o.titulo}</div>
      {o.tipo && <div style={{ fontSize: 11.5, color: colors.muted, marginTop: 1 }}>{o.tipo}</div>}

      {o.justificacion && (
        <div style={{ fontSize: 12.5, color: colors.inkSoft, marginTop: 8, lineHeight: 1.55 }}>{o.justificacion}</div>
      )}

      {o.lineas?.length > 0 && (
        <div style={{ marginTop: 10, background: colors.bg, borderRadius: 8, overflow: "hidden" }}>
          {o.lineas.map((l, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, padding: "7px 10px",
              borderTop: i ? `1px solid ${colors.neutralSoft}` : "none", fontSize: 12.5 }}>
              <span style={{ color: colors.ink }}>
                {l.tipo === "quita" && <span style={{ color: colors.danger, fontWeight: 700 }}>Se quita · </span>}
                {l.descripcion}
                <span style={{ color: colors.muted }}> · {l.cantidad} {l.unidad}</span>
              </span>
              <span style={{ fontWeight: 600, color: l.monto < 0 ? colors.danger : colors.ink, whiteSpace: "nowrap" }}>
                {l.monto < 0 ? "−" : ""}{plata(l.monto)}
              </span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "9px 10px",
            borderTop: `2px solid ${colors.border}`, fontSize: 13.5, fontWeight: 700, color: colors.ink }}>
            <span>{o.total < 0 ? "Se descuenta del contrato" : "Se suma al contrato"}</span>
            <span style={{ color: o.total < 0 ? colors.danger : colors.brand }}>
              {o.total < 0 ? "−" : "+"}{plata(o.total)}
            </span>
          </div>
        </div>
      )}

      {(o.dias_impacto > 0 || o.impacto_cronograma) && (
        <div style={{ fontSize: 12, color: colors.warning, marginTop: 8 }}>
          {o.dias_impacto > 0 && <strong>Suma {o.dias_impacto} días al plazo. </strong>}
          {o.impacto_cronograma}
        </div>
      )}

      {o.fotos?.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginTop: 9, flexWrap: "wrap" }}>
          {o.fotos.filter(f => f.url).map(f => (
            <a key={f.id} href={f.url} target="_blank" rel="noreferrer">
              <img src={f.url} alt="" style={{ width: 78, height: 78, objectFit: "cover", borderRadius: 7, border: `1px solid ${colors.border}`, display: "block" }} />
            </a>
          ))}
        </div>
      )}

      {contestada ? (
        <div style={{ marginTop: 10, paddingTop: 9, borderTop: `1px solid ${colors.neutralSoft}`, fontSize: 12.5,
          color: o.cliente_acepto ? colors.success : colors.warning, fontWeight: 600 }}>
          {o.cliente_acepto ? "La aprobaste" : "La dejaste con observaciones"}
          {o.contratante_comentario && <div style={{ color: colors.inkSoft, fontWeight: 400, marginTop: 2 }}>{o.contratante_comentario}</div>}
        </div>
      ) : (
        <div style={{ marginTop: 11, paddingTop: 9, borderTop: `1px solid ${colors.neutralSoft}` }}>
          {abierto && (
            <textarea value={nota} onChange={e => setNota(e.target.value)} rows={2}
              placeholder="¿Qué habría que cambiar?" style={{ width: "100%", border: `1px solid ${colors.border}`, borderRadius: 8,
                padding: "7px 9px", fontSize: 12.5, fontFamily: colors.font, marginBottom: 6, resize: "vertical" }} />
          )}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button disabled={enviando} onClick={() => onContestar(true, nota)} style={botonSi}>Apruebo este cambio</button>
            <button disabled={enviando}
              onClick={() => (abierto ? onContestar(false, nota) : setAbierto(true))}
              style={botonNo}>{abierto ? "Mandar" : "Tengo una observación"}</button>
          </div>
          <div style={{ fontSize: 10.5, color: colors.muted, marginTop: 7, lineHeight: 1.5 }}>
            Al aprobarlo queda registrado con la fecha de hoy y este monto se incorpora al contrato.
          </div>
        </div>
      )}
    </div>
  );
}

function Entrega({ e, onContestar, enviando }) {
  const [nota, setNota] = useState("");
  const [abierto, setAbierto] = useState(false);
  const contestada = !!e.cliente_respuesta_at;

  return (
    <div style={{ background: "#fff", border: `1px solid ${colors.border}`, borderRadius: 11, padding: 12, marginBottom: 8 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: colors.ink, lineHeight: 1.35 }}>{e.titulo}</div>
      {e.descripcion && <div style={{ fontSize: 12.5, color: colors.inkSoft, marginTop: 4, lineHeight: 1.5 }}>{e.descripcion}</div>}
      {e.url && (
        <a href={e.url} target="_blank" rel="noreferrer"
          style={{ display: "inline-block", marginTop: 7, fontSize: 12.5, fontWeight: 600, color: colors.brand }}>
          Ver {e.archivo_nombre || "el archivo"} →
        </a>
      )}

      {contestada ? (
        <div style={{ marginTop: 9, paddingTop: 8, borderTop: `1px solid ${colors.neutralSoft}`, fontSize: 12.5,
          color: e.estado === "aprobado" ? colors.success : colors.warning, fontWeight: 600 }}>
          {e.estado === "aprobado" ? "Lo aprobaste" : "Lo dejaste con observaciones"}
          {e.cliente_nota && <div style={{ color: colors.inkSoft, fontWeight: 400, marginTop: 2 }}>{e.cliente_nota}</div>}
        </div>
      ) : (
        <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${colors.neutralSoft}` }}>
          {abierto && (
            <textarea value={nota} onChange={ev => setNota(ev.target.value)} rows={2}
              placeholder="¿Qué habría que cambiar?" style={{ width: "100%", border: `1px solid ${colors.border}`, borderRadius: 8,
                padding: "7px 9px", fontSize: 12.5, fontFamily: colors.font, marginBottom: 6, resize: "vertical" }} />
          )}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button disabled={enviando} onClick={() => onContestar("aprobado", nota)} style={botonSi}>Lo apruebo</button>
            <button disabled={enviando}
              onClick={() => (abierto ? onContestar("observado", nota) : setAbierto(true))}
              style={botonNo}>{abierto ? "Mandar" : "Tengo una observación"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

const Marco = ({ children }) => (
  <div style={{ minHeight: "100vh", background: colors.bg, fontFamily: colors.font, padding: "22px 16px 48px" }}>
    <div style={{ maxWidth: 680, margin: "0 auto" }}>{children}</div>
  </div>
);

const Vacio = ({ children }) => (
  <div style={{ textAlign: "center", padding: "40px 16px", color: colors.muted, fontSize: 13,
    background: "#fff", border: `1px solid ${colors.border}`, borderRadius: 11 }}>{children}</div>
);

const botonSi = {
  background: colors.brand, border: "none", color: "#fff", borderRadius: 9, padding: "9px 16px",
  fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: colors.font,
};
const botonNo = {
  background: "#fff", border: `1px solid ${colors.border}`, color: colors.inkSoft, borderRadius: 9,
  padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: colors.font,
};

function agruparPorFecha(fotos) {
  const out = [];
  fotos.forEach(f => {
    const ultimo = out[out.length - 1];
    if (ultimo && ultimo.fecha === f.fecha) ultimo.fotos.push(f);
    else out.push({ fecha: f.fecha, fotos: [f] });
  });
  return out;
}
