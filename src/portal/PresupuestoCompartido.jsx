import { useState } from "react";
import { colors } from "../theme/colors";

// EL PRESUPUESTO Y LA COMPARATIVA, COMO LOS VE EL CLIENTE EN SU ENLACE.
//
// Hernán, 26/11/2026: «En este caso el dueño del proyecto es dueño del
// presupuesto. Me gustaría poder compartir con él el presupuesto y estas
// comparativas también, a manera informativa, no de edición. Aunque aquí él
// podría también elegir y aprobar presupuesto para que quede constancia del
// armado del presupuesto».
//
// SOLO SE MIRA, Y SE APRUEBA. No hay nada para editar ni para elegir: elegir,
// elige la oficina, y acá se ve a quién eligió y qué cotizaron las demás. Al
// pie, «Lo apruebo» o «Tengo una observación», una vez —igual que un punto del
// checklist—.
//
// IGUAL QUE EN LA OFICINA: «arriba se puede ver total de la oferta y si se
// despliega se ve el itemizado». En cada capítulo donde se pidió precio va el
// total de cada empresa, con la elegida marcada; al desplegar, fila por fila
// lo que cotizó cada una, y los rubros del presupuesto de ese capítulo.
//
// DIBUJA UNA FOTO, NO CALCULA. Lo que llega ya trae los precios que se decidió
// mostrarle y los totales hechos (presupuestoParaElCliente.js). Este archivo
// no sabe con qué criterio se compartió: muestra lo que hay.
//
// PENSADO PARA EL TELÉFONO: nada de una tabla ancha con una columna por
// empresa. Lo de cada empresa va en un renglón.
//
// La misma pieza se usa en la matriz de cotizaciones para «ver cómo lo va a
// ver» antes de compartir, y en el registro de aprobaciones, con `soloVer`.

const n = v => Number(v) || 0;
const plata = v => n(v).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cant = v => n(v).toLocaleString("es-EC", { maximumFractionDigits: 2 });
const dia = f => (f ? new Date(`${String(f).slice(0, 10)}T12:00:00`).toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" }) : "");

const botonSi = { background: colors.brand, border: "none", color: "#fff", borderRadius: 9, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: colors.font };
const botonNo = { background: "#fff", border: `1px solid ${colors.border}`, color: colors.inkSoft, borderRadius: 9, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: colors.font };
const chico = { fontSize: 11.5, color: colors.muted, lineHeight: 1.45 };
const elegidaEs = { fontSize: 10.5, fontWeight: 700, color: colors.success, background: colors.successSoft, borderRadius: 9, padding: "1px 7px", marginLeft: 6, whiteSpace: "nowrap" };

function Respuesta({ p, onContestar, enviando }) {
  const [nota, setNota] = useState("");
  const [abierto, setAbierto] = useState(false);
  if (p.estado !== "pendiente") {
    const si = p.estado === "aprobado";
    return (
      <div className="respuesta-del-presupuesto" data-estado={p.estado}
        style={{ marginTop: 10, padding: "8px 10px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, lineHeight: 1.45,
          background: si ? colors.successSoft : colors.warningSoft, color: si ? colors.success : colors.warning }}>
        {si ? "✓ Lo aprobaste" : "Lo dejaste con observaciones"}{p.respondido_el ? ` el ${dia(p.respondido_el)}` : ""}
        {p.nota && <div style={{ color: colors.ink, fontWeight: 400, marginTop: 2, whiteSpace: "pre-line", overflowWrap: "anywhere" }}>{p.nota}</div>}
        {!si && <div style={{ color: colors.inkSoft, fontWeight: 400, marginTop: 3 }}>Lo estamos revisando. Cuando esté corregido te lo volvemos a mostrar acá.</div>}
      </div>
    );
  }
  return (
    <div className="respuesta-del-presupuesto" data-estado="pendiente"
      style={{ marginTop: 10, padding: "9px 10px", borderRadius: 8, background: colors.warningSoft, border: `1px solid ${colors.warning}` }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.warning }}>Necesitamos tu aprobación</div>
      <div style={{ fontSize: 12, color: colors.inkSoft, lineHeight: 1.45, margin: "2px 0 8px" }}>
        Revisá el presupuesto{p.foto.conComparativa && p.foto.empresas.length ? " y a quién elegimos en cada parte" : ""} y decinos si está bien así.
        {" "}Si hay algo que cambiar, tocá «Tengo una observación» y contanos qué.
      </div>
      {abierto && (
        <textarea value={nota} onChange={ev => setNota(ev.target.value)} rows={2} aria-label="Qué habría que cambiar"
          placeholder="¿Qué habría que cambiar?" style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${colors.border}`, borderRadius: 8,
            padding: "7px 9px", fontSize: 12.5, fontFamily: colors.font, marginBottom: 6, resize: "vertical" }} />
      )}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button className="lo-apruebo" disabled={enviando} onClick={() => onContestar?.(true, nota)} style={botonSi}>Lo apruebo</button>
        <button className="tengo-una-observacion" disabled={enviando}
          onClick={() => (abierto ? onContestar?.(false, nota) : setAbierto(true))}
          style={botonNo}>{abierto ? "Mandar la observación" : "Tengo una observación"}</button>
        {abierto && <button disabled={enviando} onClick={() => { setAbierto(false); setNota(""); }} style={{ ...botonNo, border: "none" }}>Cancelar</button>}
      </div>
    </div>
  );
}

/** Una fila de la comparativa: lo que se cotizó, y lo de cada empresa en un renglón. */
function FilaCotizada({ f, empresas }) {
  const nombreDe = id => empresas.find(e => e.id === id)?.proveedor || "";
  return (
    <div className="fila-de-la-comparativa" style={{ padding: "6px 0", borderTop: `1px solid ${colors.neutralSoft}` }}>
      <div style={{ fontSize: 12.5, color: colors.ink, lineHeight: 1.4, overflowWrap: "anywhere" }}>{f.descripcion}</div>
      <div style={chico}>{cant(f.cantidad)} {f.unidad}</div>
      <div style={{ marginTop: 3, display: "grid", gap: 2 }}>
        {f.ofertas.map(o => (
          <div key={o.id} className="oferta" data-elegida={f.elegida === o.id ? "si" : "no"}
            style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 12, color: f.elegida === o.id ? colors.ink : colors.inkSoft,
              background: f.elegida === o.id ? colors.successSoft : colors.bg, borderRadius: 6, padding: "3px 7px" }}>
            <div style={{ flex: 1, overflowWrap: "anywhere" }}>
              {nombreDe(o.id)}
              {f.elegida === o.id && <span style={elegidaEs}>✓ ELEGIDA</span>}
              {o.estimado && <div style={{ ...chico, fontSize: 11 }}>cotizó una sola suma: esta es la parte que le toca a esta fila</div>}
            </div>
            <div style={{ whiteSpace: "nowrap", textAlign: "right" }}>
              {o.unitario != null && <span style={{ color: colors.muted }}>{cant(o.cantidad)} × ${plata(o.unitario)} = </span>}
              <strong>{o.estimado ? "≈ " : ""}${plata(o.total)}</strong>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Capitulo({ c, empresas }) {
  const [abierto, setAbierto] = useState(false);
  const nombreDe = id => empresas.find(e => e.id === id)?.proveedor || "";
  const cuadro = c.comparativa;
  return (
    <div className="capitulo-del-presupuesto" data-con-comparativa={cuadro ? "si" : "no"}
      style={{ background: "#fff", border: `1px solid ${colors.border}`, borderRadius: 11, padding: "10px 12px", marginBottom: 8 }}>
      <button className="abrir-capitulo" onClick={() => setAbierto(v => !v)} aria-expanded={abierto}
        style={{ display: "flex", gap: 8, alignItems: "baseline", width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: colors.font, textAlign: "left" }}>
        <span style={{ color: colors.muted, fontSize: 12 }}>{abierto ? "▾" : "▸"}</span>
        <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700, color: colors.ink, lineHeight: 1.3, overflowWrap: "anywhere" }}>{c.numero} · {c.nombre}</span>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: colors.ink, whiteSpace: "nowrap" }}>${plata(c.total)}</span>
      </button>
      {/* ARRIBA, EL TOTAL DE CADA OFERTA. */}
      {cuadro && (
        <div className="ofertas-del-capitulo" style={{ marginTop: 6, display: "grid", gap: 2 }}>
          {cuadro.empresas.map(e => (
            <div key={e.id} className="oferta-del-capitulo" style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 12.5, color: colors.inkSoft }}>
              <div style={{ flex: 1, overflowWrap: "anywhere" }}>
                {nombreDe(e.id)}
                {e.elegidas > 0 && <span style={elegidaEs}>✓ ELEGIDA{e.elegidas < cuadro.filas.length ? ` EN ${e.elegidas}` : ""}</span>}
                {e.faltan > 0 && <span style={{ ...chico, marginLeft: 6 }}>no cotizó {e.faltan === 1 ? "1 cosa" : `${e.faltan} cosas`}</span>}
              </div>
              <div style={{ whiteSpace: "nowrap", fontWeight: 600, color: colors.ink }}>{e.estimado ? "≈ " : ""}${plata(e.total)}</div>
            </div>
          ))}
        </div>
      )}
      {!abierto && (
        <div style={{ ...chico, marginTop: 4 }}>
          {cuadro ? "tocá para ver el detalle de cada oferta" : `${c.rubros.length} ${c.rubros.length === 1 ? "rubro" : "rubros"} · tocá para verlos`}
        </div>
      )}
      {/* AL DESPLEGAR: el itemizado de las ofertas, y los rubros del presupuesto de este capítulo. */}
      {abierto && cuadro && (
        <div className="itemizado-de-las-ofertas" style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: colors.inkSoft }}>Lo que cotizó cada una</div>
          {cuadro.filas.map((f, i) => <FilaCotizada key={i} f={f} empresas={empresas} />)}
        </div>
      )}
      {abierto && (
        <div className="rubros-del-capitulo" style={{ marginTop: 8 }}>
          {cuadro && <div style={{ fontSize: 11.5, fontWeight: 700, color: colors.inkSoft }}>Como queda en el presupuesto</div>}
          {c.rubros.map(r => (
            <div key={r.numero} className="rubro-del-presupuesto" style={{ padding: "6px 0", borderTop: `1px solid ${colors.neutralSoft}` }}>
              <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                <div style={{ flex: 1, fontSize: 12.5, color: colors.ink, lineHeight: 1.4, overflowWrap: "anywhere" }}>
                  <span style={{ color: colors.muted }}>{r.numero}</span> {r.descripcion}
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: colors.ink, whiteSpace: "nowrap" }}>{r.noCotiza ? "No cotiza" : `$${plata(r.total)}`}</div>
              </div>
              {!r.noCotiza && (
                <div style={chico}>
                  {r.cantidad > 0 ? `${cant(r.cantidad)} ${r.unidad || ""} × $${plata(r.unitario)}` : "Sin cantidad todavía"}
                  {r.deQuien ? ` · de ${r.deQuien}` : ""}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * @param p        { id, titulo, compartido_el, estado, respondido_el, nota, foto }
 * @param soloVer  sin la caja de respuesta: es la vista previa de la oficina
 */
export default function PresupuestoCompartido({ p, onContestar, enviando = false, soloVer = false }) {
  const f = p?.foto;
  if (!f) return null;
  const t = f.totales || {};
  const empresas = f.empresas || [];
  const conEmpresas = f.conComparativa && empresas.length > 0;
  return (
    <div className="presupuesto-compartido" data-estado={p.estado} style={{ fontFamily: colors.font }}>
      <div style={{ background: "#fff", border: `1px solid ${colors.border}`, borderRadius: 11, padding: 12, marginBottom: 8 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: colors.ink, lineHeight: 1.3, overflowWrap: "anywhere" }}>{f.presupuesto.nombre || p.titulo}</div>
        {p.compartido_el && <div style={chico}>Como está al {dia(p.compartido_el)}</div>}

        <div className="totales-del-presupuesto" style={{ marginTop: 10, display: "grid", gap: 3, fontSize: 13, color: colors.inkSoft }}>
          <div style={{ display: "flex" }}><span style={{ flex: 1 }}>Subtotal</span><span>${plata(t.subtotal)}</span></div>
          {(t.honorarios || []).map((h, i) => (
            <div key={i} style={{ display: "flex" }}><span style={{ flex: 1 }}>{h.nombre}</span><span>${plata(h.monto)}</span></div>
          ))}
          {n(t.iva_pct) > 0 && <div style={{ display: "flex" }}><span style={{ flex: 1 }}>IVA {cant(t.iva_pct)} %</span><span>${plata(t.iva)}</span></div>}
          <div style={{ display: "flex", fontSize: 15, fontWeight: 700, color: colors.ink, borderTop: `1px solid ${colors.border}`, paddingTop: 5, marginTop: 2 }}>
            <span style={{ flex: 1 }}>Total</span><span className="total-del-presupuesto">${plata(t.total)}</span>
          </div>
        </div>

        {conEmpresas && (
          <div className="empresas-que-cotizaron" style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.ink }}>Las empresas que cotizaron</div>
            <div style={{ ...chico, marginBottom: 5 }}>
              Pedimos precio a {empresas.length === 1 ? "una empresa" : `${empresas.length} empresas`}. En cada capítulo marcamos con ✓ a la que elegimos; lo demás queda a la vista para que compares.
            </div>
            {empresas.map(e => (
              <div key={e.id} className="empresa-que-cotizo" style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 12.5, color: colors.inkSoft, padding: "2px 0" }}>
                <div style={{ flex: 1, overflowWrap: "anywhere" }}>{e.proveedor}</div>
                <div style={{ whiteSpace: "nowrap", fontWeight: 600, color: colors.ink }}>${plata(e.total)}</div>
              </div>
            ))}
          </div>
        )}
        {!soloVer && <Respuesta p={p} onContestar={onContestar} enviando={enviando} />}
      </div>

      {/* Primero los capítulos donde se pidió precio: es lo que viene a mirar. */}
      {[...f.capitulos.filter(c => c.comparativa), ...f.capitulos.filter(c => !c.comparativa)].map(c => (
        <Capitulo key={`${c.numero}-${c.nombre}`} c={c} empresas={empresas} />
      ))}
    </div>
  );
}
