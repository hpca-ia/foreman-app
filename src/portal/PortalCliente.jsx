import { useEffect, useState, useCallback } from "react";
import { colors } from "../theme/colors";
import VisorFotos from "../components/VisorFotos";
import PresupuestoCompartido from "./PresupuestoCompartido";

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
//
// EL CHECKLIST, PARA QUE SE ENTIENDA SIN EXPLICARLO (17/11/2026, Hernán: «el
// cliente ve las actualizaciones de su proyecto... hazlo lo más didáctico y
// fácil posible»). Arriba lo último que pasó, con su fecha, para no buscarlo
// punto por punto. Después los puntos por etapa, con cuánto va cada una. Y
// cada punto con las fotos y los archivos que se le quisieron mostrar. Las
// fotos y archivos del proyecto en general tienen su solapa.
//
// Y LO QUE TIENE QUE APROBAR (17/11/2026: «estos debe poder ver cliente para
// que apruebe»). El punto que se le pidió aprobar lleva, debajo de sus
// archivos, «Lo apruebo» y «Tengo una observación». Aparece en el checklist,
// donde están los archivos, y en la solapa «Para aprobar», que es donde se
// busca. Contesta una vez; lo que contestó queda escrito ahí mismo.

const dia = f => (f ? new Date(`${String(f).slice(0, 10)}T12:00:00`)
  .toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" }) : "");

export default function PortalCliente({ token }) {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);
  // Sin elegir, arranca en el avance; un proyecto que todavía no está en obra
  // arranca en su lista, que es lo único que tiene para mostrar.
  const [elegida, setSolapa] = useState(null);
  const [mirando, setMirando] = useState(null);
  // Las fotos de un punto o del proyecto, abiertas en grande: { fotos, indice }.
  const [galeria, setGaleria] = useState(null);
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

  const { proyecto, recorridas, observaciones, avance, entregas, ordenes = [], lista = [], etapas = [], novedades = [], archivos = [], decisiones = [], presupuestos = [] } = info;
  const ocPendientes = ordenes.filter(o => o.cliente_respondio_at == null);
  // Los puntos del checklist que se le pidió aprobar: primero los que esperan.
  const puntosParaAprobar = lista.filter(t => t.aprobar)
    .sort((a, b) => (a.aprobar.estado === "pendiente" ? 0 : 1) - (b.aprobar.estado === "pendiente" ? 0 : 1));
  const puntosPendientes = puntosParaAprobar.filter(t => t.aprobar.estado === "pendiente");
  // El presupuesto y su comparativa, si se los compartieron: los que esperan su respuesta.
  const presupuestosPendientes = presupuestos.filter(p => p.estado === "pendiente");
  const porContestar = entregas.filter(e => e.estado === "enviado").length + ocPendientes.length + puntosPendientes.length + presupuestosPendientes.length;
  const contestarPunto = (t, conforme, nota) => contestar({ que: "punto", id: t.id, conforme, nota });
  const fotos = avance.filter(f => f.url).map(f => ({ ...f, titulo: f.titulo || dia(f.fecha) }));

  const listas = lista.filter(t => t.estado === "listo").length;
  // Un proyecto que todavía se presupuesta no tiene obra: las solapas de
  // fotos y visitas vacías serían dos puertas a ningún lado.
  const enObra = proyecto.enObra !== false || avance.length > 0 || observaciones.length > 0;
  const solapas = [
    ...(lista.length ? [["lista", "Checklist", lista.length - listas]] : []),
    ...(enObra ? [["avance", "Avance", avance.length], ["recorridas", "Recorridas", observaciones.length]] : []),
    ...(archivos.length ? [["archivos", "Fotos y archivos", archivos.length]] : []),
    ...(presupuestos.length ? [["presupuesto", "Presupuesto", presupuestosPendientes.length]] : []),
    ["aprobar", "Para aprobar", porContestar],
    // Lo que ya decidió: su copia del registro de aprobaciones.
    ...(decisiones.length ? [["decisiones", "Decisiones", decisiones.length]] : []),
  ];
  // La obra arranca en el avance, que es lo que se viene a mirar; sin obra,
  // en la lista.
  const porDefecto = enObra ? "avance" : lista.length ? "lista" : archivos.length ? "archivos" : "aprobar";
  const solapa = solapas.some(([id]) => id === elegida) ? elegida : porDefecto;

  return (
    <Marco>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 19, fontWeight: 700, color: colors.ink, lineHeight: 1.25 }}>{proyecto.nombre}</div>
        <div style={{ fontSize: 12.5, color: colors.muted, marginTop: 2 }}>
          {enObra ? "Cómo va la obra" : "Cómo va el proyecto"} · HCA Studio
        </div>
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: `1px solid ${colors.border}`, overflowX: "auto" }}>
        {solapas.map(([id, label, n]) => (
          <button key={id} onClick={() => setSolapa(id)}
            style={{ padding: "8px 13px", border: "none", background: "transparent",
              borderBottom: solapa === id ? `2px solid ${colors.brand}` : "2px solid transparent",
              color: solapa === id ? colors.brand : colors.inkSoft,
              fontSize: 13, fontWeight: solapa === id ? 600 : 400, cursor: "pointer", fontFamily: colors.font,
              display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", flexShrink: 0 }}>
            {label}
            {n > 0 && (
              <span style={{ background: id === "aprobar" ? colors.warning : colors.neutralSoft,
                color: id === "aprobar" ? "#fff" : colors.muted, borderRadius: 9, padding: "0 6px",
                fontSize: 10.5, fontWeight: 700 }}>{n}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── El checklist ───────────────────────────────────────────── */}
      {solapa === "lista" && (
        <Checklist lista={lista} listas={listas} etapas={etapas} novedades={novedades}
          onFoto={(fotos, indice) => setGaleria({ fotos, indice })}
          porAprobar={puntosPendientes} onIrAAprobar={() => setSolapa("aprobar")}
          onContestar={contestarPunto} enviando={enviando} />
      )}

      {/* ── Las fotos y los archivos del proyecto ──────────────────── */}
      {solapa === "archivos" && (
        <div style={{ background: "#fff", border: `1px solid ${colors.border}`, borderRadius: 11, padding: 12 }}>
          <div style={{ fontSize: 12.5, color: colors.inkSoft, lineHeight: 1.5, marginBottom: 10 }}>
            Lo que te compartimos del proyecto. Tocá una foto para verla en grande, o un archivo para abrirlo.
          </div>
          <FotosYArchivos archivos={archivos} grande onFoto={(fotos, indice) => setGaleria({ fotos, indice })} />
        </div>
      )}

      {/* ── El presupuesto y lo que cotizó cada empresa ────────────── */}
      {solapa === "presupuesto" && presupuestos.map(p => (
        <PresupuestoCompartido key={p.id} p={p} enviando={enviando === p.id}
          onContestar={(conforme, nota) => contestar({ que: "presupuesto", id: p.id, conforme, nota })} />
      ))}

      {/* ── Lo que ya decidió ──────────────────────────────────────── */}
      {solapa === "decisiones" && (
        <div className="decisiones-del-cliente">
          <div style={{ fontSize: 12.5, color: colors.inkSoft, lineHeight: 1.5, marginBottom: 10 }}>
            Lo que aprobaste o dejaste con observaciones, con la fecha y los archivos que tenías para revisar en ese momento.
          </div>
          {decisiones.map(d => {
            const si = d.estado === "aprobado";
            return (
              <div key={d.id} className="decision" data-estado={d.estado}
                style={{ background: "#fff", border: `1px solid ${colors.border}`, borderLeft: `3px solid ${si ? colors.success : colors.warning}`, borderRadius: 11, padding: 12, marginBottom: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: colors.ink, lineHeight: 1.35, overflowWrap: "anywhere" }}>{d.titulo}</div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: si ? colors.success : colors.warning, marginTop: 3 }}>
                  {si ? "✓ Lo aprobaste" : "Lo dejaste con observaciones"}{d.respondido_el ? ` el ${dia(d.respondido_el)}` : ""}
                </div>
                {d.nota && <div style={{ fontSize: 12.5, color: colors.ink, lineHeight: 1.5, marginTop: 3, whiteSpace: "pre-line", overflowWrap: "anywhere" }}>{d.nota}</div>}
                {d.archivos.length > 0 && (
                  <div style={{ display: "grid", gap: 4, marginTop: 8 }}>
                    {d.archivos.map((a, i) => (a.url ? (
                      <a key={i} className="archivo" href={a.url} target="_blank" rel="noreferrer"
                        style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 600, color: colors.brand, textDecoration: "none",
                          padding: "7px 10px", border: `1px solid ${colors.border}`, borderRadius: 8, background: "#fff", overflowWrap: "anywhere" }}>
                        <span aria-hidden="true">📎</span> {a.nombre}
                      </a>
                    ) : (
                      <div key={i} className="archivo" style={{ fontSize: 12.5, color: colors.inkSoft, padding: "7px 10px", border: `1px solid ${colors.border}`, borderRadius: 8, overflowWrap: "anywhere" }}>
                        <span aria-hidden="true">📎</span> {a.nombre}
                      </div>
                    )))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

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
        !entregas.length && !ordenes.length && !puntosParaAprobar.length && !presupuestosPendientes.length
          ? <Vacio>No hay nada esperando tu respuesta.</Vacio>
          : <>
            {/* El presupuesto que espera su aprobación: se revisa en su solapa, que es donde está entero. */}
            {presupuestosPendientes.map(p => (
              <button key={`presupuesto-${p.id}`} className="presupuesto-para-aprobar" onClick={() => setSolapa("presupuesto")}
                style={{ display: "block", width: "100%", textAlign: "left", background: "#fff", border: `1px solid ${colors.border}`, borderLeft: `3px solid ${colors.warning}`,
                  borderRadius: 11, padding: 12, marginBottom: 8, cursor: "pointer", fontFamily: colors.font }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: colors.ink, lineHeight: 1.35, overflowWrap: "anywhere" }}>{p.titulo}</div>
                <div style={{ fontSize: 12.5, color: colors.warning, fontWeight: 600, marginTop: 3 }}>Necesitamos tu aprobación · tocá para revisarlo</div>
              </button>
            ))}
            {/* Los puntos del checklist que hay que aprobar, cada uno con lo
                que hay que mirar: su descripción, lo último y sus archivos. */}
            {puntosParaAprobar.map(t => (
              <div key={`punto-${t.id}`} className="punto-para-aprobar"
                style={{ background: "#fff", border: `1px solid ${colors.border}`, borderRadius: 11, padding: "2px 12px", marginBottom: 8 }}>
                <Punto t={t} onFoto={(fotos, indice) => setGaleria({ fotos, indice })} onContestar={contestarPunto} enviando={enviando === t.id} />
              </div>
            ))}
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
      {galeria && (
        <VisorFotos fotos={galeria.fotos} indice={galeria.indice}
          onIndice={i => setGaleria(g => ({ ...g, indice: i }))} onCerrar={() => setGaleria(null)} />
      )}
    </Marco>
  );
}

// ── Piezas ──────────────────────────────────────────────────────

// Lo que estamos haciendo, punto por punto, y cuánto va. Solo se mira: no se
// marca desde acá.
const ESTADO_DE_LISTA = {
  listo: { dice: "Listo", color: colors.success },
  espera: { dice: "Hecho de nuestro lado · esperando respuesta", color: colors.warning },
  pendiente: { dice: "Pendiente", color: colors.muted },
};

/**
 * Las fotos y los archivos de un punto o del proyecto.
 *
 * Las fotos, en miniatura, se abren en grande; lo demás es un enlace con su
 * nombre. Lo que no tiene enlace —se venció, no se pudo firmar— no se dibuja:
 * una miniatura rota hace dudar de todo lo demás.
 */
function FotosYArchivos({ archivos = [], onFoto, grande = false }) {
  const fotos = archivos.filter(a => a.esFoto && a.url);
  const otros = archivos.filter(a => !a.esFoto && a.url);
  if (!fotos.length && !otros.length) return null;
  const lado = grande ? 104 : 72;
  const paraElVisor = fotos.map(f => ({ ...f, titulo: f.descripcion || f.nombre }));
  return (
    <div className="fotos-y-archivos" style={{ marginTop: grande ? 0 : 8 }}>
      {fotos.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {fotos.map((f, i) => (
            <img key={f.id} className="foto" src={f.url} alt={f.descripcion || f.nombre} onClick={() => onFoto?.(paraElVisor, i)}
              style={{ width: lado, height: lado, objectFit: "cover", borderRadius: 8, border: `1px solid ${colors.border}`, display: "block", cursor: "zoom-in" }} />
          ))}
        </div>
      )}
      {otros.length > 0 && (
        <div style={{ display: "grid", gap: 4, marginTop: fotos.length ? 8 : 0 }}>
          {otros.map(a => (
            <a key={a.id} className="archivo" href={a.url} target="_blank" rel="noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 600, color: colors.brand,
                textDecoration: "none", padding: "7px 10px", border: `1px solid ${colors.border}`, borderRadius: 8, background: "#fff",
                overflowWrap: "anywhere" }}>
              <span aria-hidden="true">📎</span> {a.nombre}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Las actualizaciones de un punto: lo que se anotó para el cliente, lo más
 * nuevo arriba y cada una con su fecha.
 *
 * Hernán, 17/11/2026: «cliente debe ver las actualizaciones de cada uno». Era
 * una sola, que se pisaba al escribir la siguiente; ahora es la historia del
 * punto contada para él. Se ven las tres últimas y las anteriores se abren:
 * un punto con diez anotaciones no tiene que tapar a los demás.
 */
function Actualizaciones({ punto }) {
  const [todas, setTodas] = useState(false);
  // Un enlace abierto contra la versión de antes trae solo la última.
  const lista = Array.isArray(punto.actualizaciones) ? punto.actualizaciones
    : punto.actualizacion ? [{ id: "ultima", texto: punto.actualizacion, fecha: punto.actualizado_el }] : [];
  if (!lista.length) return null;
  const A_LA_VISTA = 3;
  const visibles = todas ? lista : lista.slice(0, A_LA_VISTA);
  return (
    <div className="actualizaciones-del-punto" style={{ marginTop: 6, background: colors.bg, borderRadius: 7, padding: "3px 10px" }}>
      {visibles.map((a, i) => (
        <div key={a.id} className="actualizacion-del-punto" style={{ fontSize: 12.5, color: colors.ink, lineHeight: 1.5, padding: "5px 0",
          borderTop: i ? `1px solid ${colors.neutralSoft}` : "none", whiteSpace: "pre-line", overflowWrap: "anywhere" }}>
          {a.fecha && <div style={{ fontSize: 10.5, color: colors.muted, fontWeight: 600 }}>{dia(a.fecha)}</div>}
          {a.texto}
        </div>
      ))}
      {lista.length > A_LA_VISTA && (
        <button className="ver-anteriores" onClick={() => setTodas(v => !v)}
          style={{ background: "none", border: "none", padding: "4px 0 6px", cursor: "pointer", fontFamily: colors.font, fontSize: 11.5, fontWeight: 600, color: colors.brand }}>
          {todas ? "Ver solo las últimas" : `Ver las ${lista.length - A_LA_VISTA} anteriores`}
        </button>
      )}
    </div>
  );
}

/**
 * La aprobación de un punto: los dos botones mientras no conteste, y lo que
 * contestó después.
 *
 * Igual que una entrega: «Lo apruebo» es un toque; una observación pide decir
 * qué. Contesta una vez —con la respuesta puesta ya no hay botones—: si algo
 * se corrige, el equipo se lo vuelve a pedir y los botones vuelven.
 */
function Aprobacion({ punto, onContestar, enviando, onFoto }) {
  const [nota, setNota] = useState("");
  const [abierto, setAbierto] = useState(false);
  const a = punto.aprobar;
  if (!a) return null;
  const hayArchivos = (punto.archivos || []).some(x => x.url);
  // Se le pide aprobar algunos archivos y no todo el punto: van acá, con los botones.
  const estos = (a.archivos || []).filter(x => x.url);
  if (a.estado !== "pendiente") {
    const si = a.estado === "aprobado";
    return (
      <div className="aprobacion-del-punto" data-estado={a.estado}
        style={{ marginTop: 8, padding: "8px 10px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, lineHeight: 1.45,
          background: si ? colors.successSoft : colors.warningSoft, color: si ? colors.success : colors.warning }}>
        {si ? "✓ Lo aprobaste" : "Lo dejaste con observaciones"}{a.respondido_el ? ` el ${dia(a.respondido_el)}` : ""}
        {a.nota && <div style={{ color: colors.ink, fontWeight: 400, marginTop: 2, whiteSpace: "pre-line", overflowWrap: "anywhere" }}>{a.nota}</div>}
        {!si && <div style={{ color: colors.inkSoft, fontWeight: 400, marginTop: 3 }}>Lo estamos revisando. Cuando esté corregido te lo volvemos a mostrar acá.</div>}
      </div>
    );
  }
  return (
    <div className="aprobacion-del-punto" data-estado="pendiente"
      style={{ marginTop: 8, padding: "9px 10px", borderRadius: 8, background: colors.warningSoft, border: `1px solid ${colors.warning}` }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.warning }}>
        Necesitamos tu aprobación{a.hasta && !a.vencida ? ` hasta el ${dia(a.hasta)}` : ""}
      </div>
      {/* El plazo ya pasó: se dice, y todavía puede contestar. */}
      {a.vencida && (
        <div className="plazo-vencido" style={{ fontSize: 12, color: colors.danger, fontWeight: 600, lineHeight: 1.45 }}>
          El plazo era el {dia(a.hasta)}. Todavía podés contestar.
        </div>
      )}
      {estos.length > 0 && (
        <div className="lo-que-aprueba" style={{ margin: "6px 0 2px" }}>
          <FotosYArchivos archivos={estos} onFoto={onFoto} grande />
        </div>
      )}
      <div style={{ fontSize: 12, color: colors.inkSoft, lineHeight: 1.45, margin: "2px 0 8px" }}>
        {estos.length ? `Revisá ${estos.length === 1 ? "este archivo" : "estos archivos"} y decinos si está bien así. Tu respuesta es solo por ${estos.length === 1 ? "él" : "ellos"}.`
          : hayArchivos ? "Revisá los archivos de arriba y decinos si está bien así." : "Decinos si está bien así."}
        {" "}Si hay algo que cambiar, tocá «Tengo una observación» y contanos qué.
      </div>
      {abierto && (
        <textarea value={nota} onChange={ev => setNota(ev.target.value)} rows={2} aria-label="Qué habría que cambiar"
          placeholder="¿Qué habría que cambiar?" style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${colors.border}`, borderRadius: 8,
            padding: "7px 9px", fontSize: 12.5, fontFamily: colors.font, marginBottom: 6, resize: "vertical" }} />
      )}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button className="lo-apruebo" disabled={enviando} onClick={() => onContestar?.(punto, true, nota)} style={botonSi}>Lo apruebo</button>
        <button className="tengo-una-observacion" disabled={enviando}
          onClick={() => (abierto ? onContestar?.(punto, false, nota) : setAbierto(true))}
          style={botonNo}>{abierto ? "Mandar la observación" : "Tengo una observación"}</button>
        {abierto && <button disabled={enviando} onClick={() => { setAbierto(false); setNota(""); }} style={{ ...botonNo, border: "none" }}>Cancelar</button>}
      </div>
    </div>
  );
}

/** Un punto del checklist, como lo lee el cliente: en la lista y en «Para aprobar». */
function Punto({ t, conLinea = false, onFoto, onContestar, enviando = false }) {
  const listo = t.estado === "listo";
  // Mientras espera su respuesta, eso es lo que dice el punto.
  const e = !listo && t.aprobar?.estado === "pendiente"
    ? { dice: `Esperando tu aprobación${t.aprobar.hasta ? ` · hasta el ${dia(t.aprobar.hasta)}` : ""}`, color: t.aprobar.vencida ? colors.danger : colors.warning }
    : ESTADO_DE_LISTA[t.estado] || ESTADO_DE_LISTA.pendiente;
  return (
    <div className="punto-de-lista" style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 0",
      borderTop: conLinea ? `1px solid ${colors.neutralSoft}` : "none" }}>
      <span aria-hidden="true" style={{ width: 18, height: 18, flexShrink: 0, marginTop: 1, borderRadius: 5, boxSizing: "border-box",
        border: `1.5px solid ${listo ? colors.success : colors.border}`, background: listo ? colors.success : "#fff",
        color: "#fff", fontSize: 12, lineHeight: "15px", textAlign: "center", fontWeight: 700 }}>{listo ? "✓" : ""}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 14, color: listo ? colors.inkSoft : colors.ink, fontWeight: 600, lineHeight: 1.35, overflowWrap: "anywhere" }}>{t.titulo}</div>
        {/* Qué es este punto, dicho para él. */}
        {t.descripcion && (
          <div style={{ fontSize: 12.5, color: colors.inkSoft, lineHeight: 1.5, marginTop: 2, overflowWrap: "anywhere" }}>{t.descripcion}</div>
        )}
        <div className="estado-del-punto" style={{ fontSize: 11.5, color: e.color, marginTop: 2 }}>
          {e.dice}{listo && t.listo_el ? ` · ${dia(t.listo_el)}` : ""}
        </div>
        {/* Qué hay de nuevo, cada cosa con su fecha: cuán fresca es la noticia. */}
        <Actualizaciones punto={t} />
        {/* Las fotos y los archivos de este punto. */}
        {/* Las fotos y los archivos de este punto. Si se le pide aprobar solo
            algunos, esos van abajo, con los botones, y acá queda lo demás. */}
        <FotosYArchivos archivos={(t.archivos || []).filter(x => !(t.aprobar?.archivos || []).some(y => y.id === x.id))} onFoto={onFoto} />
        {/* Y si hay que aprobarlo, acá: debajo de lo que hay que mirar. */}
        <Aprobacion punto={t} onContestar={onContestar} enviando={enviando} onFoto={onFoto} />
      </div>
    </div>
  );
}

function Checklist({ lista, listas, etapas = [], novedades = [], onFoto, porAprobar = [], onIrAAprobar, onContestar, enviando = null }) {
  const pct = lista.length ? Math.round((listas / lista.length) * 100) : 0;
  // Con etapas, cada una con sus puntos; sin ellas, la lista de corrido.
  const grupos = etapas.length
    ? etapas.map(e => ({ ...e, puntos: lista.filter(t => (t.etapa_id || null) === e.id) })).filter(g => g.puntos.length)
    : [{ id: "todo", nombre: "", puntos: lista }];
  const punto = (t, i) => (
    <Punto key={t.id} t={t} conLinea={i > 0} onFoto={onFoto} onContestar={onContestar} enviando={enviando === t.id} />
  );
  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: colors.ink, fontWeight: 600 }}>
          {listas === lista.length ? "Todo listo" : `${listas} de ${lista.length} ${lista.length === 1 ? "punto listo" : "puntos listos"}`}
        </div>
        <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
          style={{ height: 6, background: colors.neutralSoft, borderRadius: 3, marginTop: 6, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: colors.success, borderRadius: 3 }} />
        </div>
      </div>

      {/* LO QUE ESPERA SU APROBACIÓN, antes que nada: es lo único de esta
          pantalla que depende de él. */}
      {porAprobar.length > 0 && (
        <button className="hay-para-aprobar" onClick={onIrAAprobar}
          style={{ display: "block", width: "100%", textAlign: "left", cursor: "pointer", fontFamily: colors.font, background: colors.warningSoft,
            border: `1px solid ${colors.warning}`, borderRadius: 11, padding: "10px 12px", marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: colors.warning }}>
            {porAprobar.length === 1 ? "Hay 1 punto esperando tu aprobación" : `Hay ${porAprobar.length} puntos esperando tu aprobación`}
          </div>
          <div style={{ fontSize: 12.5, color: colors.ink, lineHeight: 1.45, marginTop: 2, overflowWrap: "anywhere" }}>
            {porAprobar.map(t => t.titulo).join(" · ")}
          </div>
          <div style={{ fontSize: 12, color: colors.brand, fontWeight: 600, marginTop: 4 }}>Verlos en «Para aprobar» →</div>
        </button>
      )}

      {/* LO ÚLTIMO. Lo que cambió desde la última vez que entró, lo más nuevo
          arriba: no tiene que recorrer los puntos para enterarse. */}
      {novedades.length > 0 && (
        <div className="lo-ultimo" style={{ background: colors.brandSoft, border: `1px solid ${colors.border}`, borderRadius: 11, padding: "10px 12px", marginBottom: 12 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: colors.brand, letterSpacing: 0.4, marginBottom: 5 }}>LO ÚLTIMO</div>
          {novedades.map((n, i) => (
            <div key={`${n.tipo}-${n.id}-${i}`} className="novedad" style={{ fontSize: 12.5, color: colors.ink, lineHeight: 1.5, padding: "5px 0",
              borderTop: i ? `1px solid ${colors.border}` : "none", overflowWrap: "anywhere" }}>
              <span style={{ color: colors.muted }}>{dia(n.fecha)} · </span>
              <strong>{n.titulo}</strong>{n.tipo === "listo" ? <span style={{ color: colors.success, fontWeight: 600 }}> · listo</span> : <>: {n.texto}</>}
            </div>
          ))}
        </div>
      )}

      {grupos.map(g => (
        <div key={g.id || "otros"} className="etapa-del-cliente" style={{ marginBottom: 12 }}>
          {/* La etapa, con cuánto va. Es el camino del proyecto, dicho corto. */}
          {g.nombre && (
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", margin: "0 2px 5px" }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: g.actual ? colors.brand : colors.inkSoft }}>{g.nombre.toUpperCase()}</span>
              <span style={{ fontSize: 11.5, color: g.listas === g.total ? colors.success : colors.muted }}>
                {g.listas === g.total ? "todo listo" : `${g.listas} de ${g.total} ${g.total === 1 ? "listo" : "listos"}`}
                {g.actual ? " · en esto estamos ahora" : ""}
              </span>
            </div>
          )}
          <div style={{ background: "#fff", border: `1px solid ${colors.border}`, borderRadius: 11, padding: "2px 12px" }}>
            {g.puntos.map(punto)}
          </div>
        </div>
      ))}
    </div>
  );
}

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
                {l.clase === "nuevo" && <span style={{ color: colors.muted, fontWeight: 700 }}>Trabajo nuevo · </span>}
                {l.clase === "mas" && <span style={{ color: colors.muted, fontWeight: 700 }}>Más cantidad · </span>}
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
            <span>Neto de la orden</span>
            <span style={{ color: o.total < 0 ? colors.danger : colors.brand }}>
              {o.total < 0 ? "−" : "+"}{plata(o.total)}
            </span>
          </div>
          {/* EL HONORARIO, TAMBIÉN ACÁ. Es parte de lo que se suma al
              contrato: que el portal diga un número y el PDF otro para la
              misma orden es lo que hace que el cliente deje de mirar el
              portal y vuelva a pedir todo por correo. */}
          {o.honorarios_pct > 0 && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 10px",
                fontSize: 12.5, color: colors.muted }}>
                <span>Honorarios de administración {o.honorarios_pct}%</span>
                <span>{o.honorarios < 0 ? "−" : "+"}{plata(Math.abs(o.honorarios))}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 10px 9px",
                fontSize: 13.5, fontWeight: 700, color: colors.ink }}>
                <span>{o.total_con_honorarios < 0 ? "Se descuenta del contrato" : "Se suma al contrato"}</span>
                <span style={{ color: o.total_con_honorarios < 0 ? colors.danger : colors.brand }}>
                  {o.total_con_honorarios < 0 ? "−" : "+"}{plata(Math.abs(o.total_con_honorarios))}
                </span>
              </div>
            </>
          )}
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
