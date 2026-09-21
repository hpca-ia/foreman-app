import { useState, useMemo } from "react";
import { Copy, Sparkles, Loader2, Check, X, AlertTriangle } from "lucide-react";
import { colors } from "../../theme/colors";
import { principalDe } from "../../lib/agruparRepetidos";
import { pedirNova, parseJSONTolerante } from "../../lib/leerExcelPresupuesto";
import { normalizarUnidad, etiquetaUnidad, UNIDADES } from "../../lib/unidades";
import { SelectorUnidad } from "./camposRubro";

// Los rubros que aparecen dos o más veces en el mismo presupuesto, juntos.
//
// Verlos juntos es lo que permite revisar de verdad: dos cantidades sueltas
// del mismo trabajo, el mismo rubro a dos precios distintos, o el mismo
// trabajo medido en m² en un capítulo y en ml en otro. De ahí sale la
// decisión: unificarlos en uno solo con la cantidad sumada, o dejarlos
// separados porque son sitios distintos.
//
// NOVA propone qué hacer con cada grupo —unificar o no, con qué descripción,
// unidad, cantidad y precio— y quien arma el presupuesto acepta o no.

const n = v => Number(v) || 0;
const fmt = v => n(v).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cant = v => n(v).toLocaleString("es-EC", { maximumFractionDigits: 2 });
const claveDe = g => g.items.map(i => i.id).sort().join("-");

const SENSIBILIDAD = [[100, "Iguales"], [80, "Muy parecidos"], [65, "Parecidos"], [50, "De lejos"]];

export default function RubrosRepetidos({ items, grupos, minimo, onMinimo, numeroDe, soloLectura, onUnificar }) {
  const [ignorados, setIgnorados] = useState({});
  const [formularios, setFormularios] = useState({});
  const [nova, setNova] = useState({ estado: "nada", propuestas: {} });
  const [trabajando, setTrabajando] = useState("");

  const visibles = grupos.filter(g => !ignorados[claveDe(g)]);

  // Lo que quedaría al unificar un grupo, antes de que nadie lo toque.
  function porDefecto(g) {
    const jefe = principalDe(g);
    const unidades = [...new Set(g.items.map(i => normalizarUnidad(i.unidad).canon || i.unidad).filter(Boolean))];
    return {
      conservar: jefe.id,
      descripcion: g.items.map(i => i.descripcion).sort((a, b) => String(b).length - String(a).length)[0] || jefe.descripcion,
      unidad: jefe.unidad || unidades[0] || "",
      // Sumar cantidades de distinta unidad no significa nada: ahí se deja la del principal.
      cantidad: unidades.length > 1 ? n(jefe.cantidad) : g.cantidad,
      precio: n(jefe.precio_unitario) || g.precioMax,
    };
  }
  const valores = g => formularios[claveDe(g)] || porDefecto(g);
  const cambiar = (g, campos) => setFormularios(f => ({ ...f, [claveDe(g)]: { ...valores(g), ...campos } }));

  async function unificar(g, v) {
    const clave = claveDe(g);
    setTrabajando(clave);
    try {
      const quitar = g.items.filter(i => i.id !== v.conservar).map(i => i.id);
      await onUnificar(v.conservar, quitar, {
        descripcion: String(v.descripcion || "").trim(),
        unidad: v.unidad || "",
        cantidad: n(v.cantidad),
        precio_unitario: n(v.precio),
      });
      setFormularios(f => { const x = { ...f }; delete x[clave]; return x; });
    } finally { setTrabajando(""); }
  }

  // ── Lo que propone NOVA para cada grupo ──
  async function pedirPropuestas() {
    setNova({ estado: "pensando", propuestas: nova.propuestas });
    const lista = visibles.map((g, k) => ({
      g: k,
      rubros: g.items.map(i => ({ n: numeroDe?.(i.id) || "", cap: i.capitulo, d: i.descripcion, u: i.unidad, q: n(i.cantidad), p: n(i.precio_unitario) })),
    }));
    const prompt = `Eres un revisor de presupuestos de construcción en Ecuador. En este presupuesto hay grupos de rubros que parecen repetidos. Para cada grupo decide si son el mismo trabajo y conviene unificarlos en un solo rubro, o si deben quedar separados.

Devuelve SOLO JSON, sin markdown: {"grupos":[{"g":0,"unificar":true,"motivo":"en una línea, por qué","descripcion":"la descripción del rubro unificado","unidad":"unidad","cantidad":123.45,"precio":67.89}]}

Reglas:
- Unifica cuando es el mismo trabajo escrito de dos formas. Deja separados cuando el alcance es distinto (materiales, espesores o acabados distintos) o cuando el capítulo indica que son sitios distintos y conviene seguirlos por separado; explícalo en "motivo".
- "cantidad": la suma de las cantidades cuando se unifica y las unidades son la misma. Si las unidades no coinciden, di en "motivo" cuál está mal y pon la cantidad que corresponda a la unidad que elijas.
- "unidad": SOLO una de estas: ${UNIDADES.map(u => u.id).join(", ")}.
- "precio": uno de los precios que ya tienen los rubros del grupo, el que corresponda. No inventes precios de mercado.
- Si no hay que unificar: "unificar": false y el motivo; los demás campos pueden ir null.

Grupos (n = número, cap = capítulo, d = descripción, u = unidad, q = cantidad, p = precio unitario):
${JSON.stringify(lista)}`;
    try {
      const data = await pedirNova({ model: "claude-sonnet-4-5", max_tokens: 4000, messages: [{ role: "user", content: prompt }] });
      if (data?.error) throw new Error(typeof data.error === "string" ? data.error : data.error.message || "NOVA no respondió");
      const parsed = parseJSONTolerante(data?.content?.[0]?.text || "");
      const propuestas = {};
      (parsed?.grupos || []).forEach(p => {
        const g = visibles[Number(p.g)];
        if (!g) return;
        propuestas[claveDe(g)] = {
          unificar: p.unificar !== false,
          motivo: p.motivo || "",
          descripcion: p.descripcion || null,
          unidad: p.unidad ? normalizarUnidad(p.unidad).canon || p.unidad : null,
          cantidad: p.cantidad != null && Number.isFinite(Number(p.cantidad)) ? Number(p.cantidad) : null,
          precio: p.precio != null && Number.isFinite(Number(p.precio)) ? Number(p.precio) : null,
        };
      });
      setNova({ estado: "listo", propuestas });
    } catch (e) {
      setNova({ estado: "error", propuestas: {}, error: e.message });
    }
  }

  function aceptarPropuesta(g, p) {
    const base = porDefecto(g);
    unificar(g, {
      conservar: base.conservar,
      descripcion: p.descripcion || base.descripcion,
      unidad: p.unidad || base.unidad,
      cantidad: p.cantidad != null ? p.cantidad : base.cantidad,
      precio: p.precio != null ? p.precio : base.precio,
    });
  }

  const chip = activo => ({ padding: "5px 12px", borderRadius: 16, border: `1px solid ${activo ? colors.ink : colors.border}`, background: activo ? colors.ink : colors.surface, color: activo ? "#fff" : colors.inkSoft, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: colors.font, display: "flex", alignItems: "center", gap: 5 });
  const campo = { background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6, padding: "6px 8px", fontSize: 12, fontFamily: colors.font, color: colors.ink, outline: "none", width: "100%", boxSizing: "border-box" };

  return (
    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 14, marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: visibles.length ? 10 : 0 }}>
        <Copy size={16} color={colors.ink} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: colors.ink }}>Rubros repetidos ({visibles.length})</div>
          <div style={{ fontSize: 11, color: colors.muted }}>Escritos igual o casi igual, entre los {items.length} rubros del presupuesto. Míralos juntos, revisa las cantidades y déjalos en uno solo si son el mismo trabajo.</div>
        </div>
        {!soloLectura && !!visibles.length && (
          <button onClick={pedirPropuestas} disabled={nova.estado === "pensando"}
            style={{ background: colors.ink, color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: colors.font, display: "flex", alignItems: "center", gap: 6 }}>
            {nova.estado === "pensando" ? <><Loader2 size={13} /> Pensando…</> : <><Sparkles size={13} /> Que NOVA proponga</>}
          </button>
        )}
      </div>
      {/* Qué tanto se tienen que parecer dos rubros para caer en el mismo grupo. */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: visibles.length ? 10 : 0 }}>
        <span style={{ fontSize: 11, color: colors.muted }}>Buscar los</span>
        {SENSIBILIDAD.map(([v, l]) => (
          <button key={v} onClick={() => onMinimo(v)} title={v === 100 ? "Solo los escritos exactamente igual" : `Rubros que comparten al menos el ${v} % de sus palabras`}
            style={{ ...chip(minimo === v), padding: "3px 10px", fontSize: 11 }}>{l}</button>
        ))}
      </div>
      {nova.estado === "error" && <div style={{ fontSize: 12, color: colors.danger, marginBottom: 8 }}>NOVA no pudo revisarlos: {nova.error}</div>}
      {!visibles.length && (
        <div style={{ fontSize: 12, color: colors.success, marginTop: 8 }}>
          ✓ Ningún rubro repetido{minimo === 100 ? " escrito igual" : ""}.
          {minimo > 50 && <span style={{ color: colors.muted }}> Si crees que hay alguno escrito de otra forma, prueba con "{SENSIBILIDAD.find(([v]) => v < minimo)?.[1]}".</span>}
        </div>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {visibles.map(g => {
          const clave = claveDe(g), v = valores(g), p = nova.propuestas[clave];
          const variasUnidades = g.unidades.length > 1;
          const ocupado = trabajando === clave;
          return (
            <div key={clave} style={{ border: `1px solid ${colors.border}`, borderRadius: 8, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", padding: "8px 10px", background: colors.bg, borderBottom: `1px solid ${colors.border}` }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: colors.ink, flex: 1, minWidth: 180, overflowWrap: "anywhere" }}>{v.descripcion}</span>
                <span style={{ fontSize: 11, color: colors.muted }}>{g.items.length} veces{g.iguales ? "" : " · escritos distinto"}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: colors.ink }}>${fmt(g.monto)}</span>
              </div>

              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
                <tbody>
                  {g.items.map(i => (
                    <tr key={i.id} style={{ borderBottom: `1px solid ${colors.neutralSoft}` }}>
                      <td style={{ padding: "5px 8px", color: colors.muted, width: 42, whiteSpace: "nowrap" }}>{numeroDe?.(i.id)}</td>
                      <td style={{ padding: "5px 8px", overflowWrap: "anywhere" }}>
                        <div style={{ color: colors.ink }}>{i.descripcion}</div>
                        <div style={{ fontSize: 10, color: colors.muted }}>{i.capitulo}</div>
                      </td>
                      <td style={{ padding: "5px 8px", textAlign: "right", color: variasUnidades ? colors.warning : colors.inkSoft, whiteSpace: "nowrap" }}>{cant(i.cantidad)} {etiquetaUnidad(i.unidad) || "—"}</td>
                      <td style={{ padding: "5px 8px", textAlign: "right", color: colors.inkSoft, whiteSpace: "nowrap" }}>${fmt(i.precio_unitario)}</td>
                      <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 600, color: colors.ink, whiteSpace: "nowrap" }}>${fmt(i.total)}</td>
                      {!soloLectura && (
                        <td style={{ padding: "5px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
                          <label style={{ fontSize: 10.5, color: v.conservar === i.id ? colors.ink : colors.muted, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
                            <input type="radio" name={`conservar-${clave}`} checked={v.conservar === i.id} onChange={() => cambiar(g, { conservar: i.id })} />
                            dejar este
                          </label>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>

              {(variasUnidades || g.precioMin !== g.precioMax) && (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", padding: "6px 10px", fontSize: 11, color: colors.warning, background: colors.warningSoft }}>
                  {variasUnidades && <span style={{ display: "flex", gap: 4 }}><AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 1 }} /> Están en distinta unidad ({g.unidades.join(", ")}): las cantidades no se suman solas.</span>}
                  {g.precioMin !== g.precioMax && <span style={{ display: "flex", gap: 4 }}><AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 1 }} /> El mismo trabajo a dos precios: de ${fmt(g.precioMin)} a ${fmt(g.precioMax)}.</span>}
                </div>
              )}

              {p && (
                <div style={{ padding: "8px 10px", borderTop: `1px solid ${colors.neutralSoft}`, background: colors.surface }}>
                  <div style={{ display: "flex", gap: 7, alignItems: "baseline", flexWrap: "wrap", fontSize: 12 }}>
                    <Sparkles size={12} color={colors.ink} style={{ flexShrink: 0 }} />
                    <strong style={{ color: colors.ink }}>{p.unificar ? "NOVA propone unificarlos" : "NOVA propone dejarlos separados"}</strong>
                    <span style={{ color: colors.inkSoft, flex: 1, minWidth: 160 }}>{p.motivo}</span>
                  </div>
                  {p.unificar && (
                    <div style={{ fontSize: 11.5, color: colors.inkSoft, marginTop: 4, overflowWrap: "anywhere" }}>
                      {p.descripcion || v.descripcion} · {etiquetaUnidad(p.unidad || v.unidad) || "sin unidad"} · {cant(p.cantidad != null ? p.cantidad : v.cantidad)} × ${fmt(p.precio != null ? p.precio : v.precio)}
                    </div>
                  )}
                  {!soloLectura && (
                    <div style={{ display: "flex", gap: 8, marginTop: 7, flexWrap: "wrap" }}>
                      {p.unificar && <button onClick={() => aceptarPropuesta(g, p)} disabled={ocupado} style={{ ...chip(true), padding: "3px 10px", fontSize: 11 }}>{ocupado ? <Loader2 size={11} /> : <Check size={11} />} Aceptar y unificar</button>}
                      {p.unificar && <button onClick={() => cambiar(g, { descripcion: p.descripcion || v.descripcion, unidad: p.unidad || v.unidad, cantidad: p.cantidad != null ? p.cantidad : v.cantidad, precio: p.precio != null ? p.precio : v.precio })}
                        style={{ ...chip(false), padding: "3px 10px", fontSize: 11 }}>Retocar antes</button>}
                      <button onClick={() => setIgnorados(x => ({ ...x, [clave]: true }))} style={{ ...chip(false), padding: "3px 10px", fontSize: 11 }}><X size={11} /> Dejarlos separados</button>
                    </div>
                  )}
                </div>
              )}

              {!soloLectura && (
                <div style={{ padding: "9px 10px", borderTop: `1px solid ${colors.neutralSoft}` }}>
                  <div style={{ fontSize: 10.5, color: colors.muted, marginBottom: 5 }}>Queda un solo rubro, en {g.items.find(i => i.id === v.conservar)?.capitulo || g.capitulos[0]}:</div>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(160px, 3fr) 110px 90px 100px", gap: 6, alignItems: "end" }}>
                    <input value={v.descripcion} onChange={e => cambiar(g, { descripcion: e.target.value })} style={campo} />
                    <div><SelectorUnidad valor={v.unidad} grande onCambiar={u => cambiar(g, { unidad: u })} /></div>
                    <input type="number" className="num-limpio" value={v.cantidad} onChange={e => cambiar(g, { cantidad: e.target.value })} style={{ ...campo, textAlign: "right" }} title="Cantidad del rubro unificado" />
                    <input type="number" className="num-limpio" step="0.01" value={v.precio} onChange={e => cambiar(g, { precio: e.target.value })} style={{ ...campo, textAlign: "right" }} title="Precio final del rubro unificado" />
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <button onClick={() => unificar(g, v)} disabled={ocupado || !String(v.descripcion || "").trim()} style={{ ...chip(true), padding: "5px 12px" }}>
                      {ocupado ? <Loader2 size={12} /> : <Check size={12} />} Unificar en uno
                    </button>
                    <button onClick={() => setIgnorados(x => ({ ...x, [clave]: true }))} style={{ ...chip(false), padding: "5px 12px" }}>Dejarlos separados</button>
                    <span style={{ fontSize: 11, color: colors.muted }}>
                      Total: ${fmt(n(v.cantidad) * n(v.precio))} {n(v.cantidad) * n(v.precio) !== g.monto && <>· ahora suman ${fmt(g.monto)}</>}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
