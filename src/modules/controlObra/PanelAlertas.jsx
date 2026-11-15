// LAS ALERTAS DE LA OBRA: lo que hay que revisar porque la plata se está
// contando de más, o de menos.
//
// Antes esta pestaña se llamaba «Duplicados» y miraba una sola cosa: la misma
// factura dos veces. Ahora también mira los pedidos de Compras ya facturados,
// las facturas asignadas por más de lo que valen, lo pagado en Compras sin
// documento en el control, y los documentos sin asignar. La cuenta está en
// `contadoDosVeces.js`; acá solo se dibuja, con las filas que la obra ya tiene.
import { useState } from "react";
import { AlertOctagon, AlertTriangle, ShieldCheck, Trash2, Link2, FileX, Layers, Inbox } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import { fmt } from "./calculos";
import { alertasDeLaObra } from "./contadoDosVeces.js";
import { engancharYPonerAlDia } from "../compras/compras";

const ORIGEN = { manual: "a mano", nova: "NOVA", caja_chica: "caja chica", compras: "Compras" };

const caja = borde => ({ background: colors.surface, border: `1.5px solid ${borde}`, borderRadius: colors.radiusMd, padding: 12, marginBottom: 10 });
const fila = fondo => ({ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", marginBottom: 5, background: fondo, borderRadius: colors.radiusSm });
const nombre = { fontSize: 12, fontWeight: 600, color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const detalle = { fontSize: 10, color: colors.inkSoft, marginTop: 2 };
const plata = { fontSize: 13, fontWeight: 700, color: colors.ink, flexShrink: 0 };

function Titulo({ icono: I, color, children, monto }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, margin: "18px 0 8px" }}>
      <I size={14} color={color} />
      <span style={{ fontSize: 12.5, fontWeight: 700, color }}>{children}</span>
      {monto != null && <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color }}>${fmt(monto)}</span>}
    </div>
  );
}

function Explica({ children }) {
  return <div style={{ fontSize: 11, color: colors.inkSoft, margin: "-4px 0 8px" }}>{children}</div>;
}

const suma = (xs, f) => xs.reduce((t, x) => t + (Number(f(x)) || 0), 0);

export default function PanelAlertas({ obra, planillas = [], facturas = [], asignaciones = [], pagos = [], solicitudes = [], adjuntos = [], rubros = [], currentUser, onCambio, onCambioPedidos }) {
  const [trabajando, setTrabajando] = useState(null);
  const [error, setError] = useState("");

  const a = alertasDeLaObra({ solicitudes, facturas, asignaciones, adjuntos, pagos, rubros });
  const nombrePlanilla = id => planillas.find(p => p.id === id)?.nombre || (id ? "—" : "sin planilla");
  const exactos = a.repetidas.filter(g => g.tipo === "exacto");
  const posibles = a.repetidas.filter(g => g.tipo === "posible");
  const deMasRepetidas = suma(exactos, g => suma(g.facturas.slice(1), f => f.total));

  async function eliminar(f) {
    if (!window.confirm(`¿Eliminar la factura ${f.numero_factura || ""} de ${f.razon_social || "proveedor"} por $${fmt(f.total)}?\n\nSe quita del control de la obra, con lo que tenía asignado y pagado.`)) return;
    setTrabajando("f" + f.id); setError("");
    // Primero lo que cuelga de ella: al revés quedarían asignaciones y pagos
    // apuntando a una factura que ya no existe. Y si un pedido de Compras la
    // tenía enganchada, se suelta: vuelve a pedir su documento.
    await supabase.from("obra_asignaciones").delete().eq("factura_id", f.id);
    await supabase.from("obra_factura_rubros").delete().eq("factura_id", f.id);
    await supabase.from("obra_pagos").delete().eq("factura_id", f.id);
    await supabase.from("compras_solicitudes").update({ factura_id: null }).eq("factura_id", f.id);
    const { error: e } = await supabase.from("obra_facturas").delete().eq("id", f.id);
    setTrabajando(null);
    if (e) { setError("No se pudo eliminar: " + e.message); return; }
    onCambio?.();
  }

  async function enganchar(pedido, factura) {
    if (!window.confirm(`¿Enganchar el pedido «${pedido.descripcion}» a la factura de ${factura.razon_social || "proveedor"} por $${fmt(factura.total)}?\n\nEl pedido deja de contar como comprometido y pasa a «comprada».`)) return;
    setTrabajando("p" + pedido.id); setError("");
    const r = await engancharYPonerAlDia(pedido, factura, currentUser);
    setTrabajando(null);
    if (r?.error) { setError(typeof r.error === "string" ? r.error : (r.error.message || "No se pudo enganchar.")); return; }
    onCambio?.();
    onCambioPedidos?.();
  }

  if (a.cuantas === 0) {
    return (
      <div style={{ background: colors.successSoft, border: `1px solid ${colors.successBorder}`, borderRadius: colors.radiusMd, padding: "30px 20px", textAlign: "center" }}>
        <ShieldCheck size={26} color={colors.success} style={{ marginBottom: 8 }} />
        <div style={{ fontSize: 13, color: colors.success, fontWeight: 600 }}>Nada que revisar</div>
        <div style={{ fontSize: 11, color: colors.inkSoft, marginTop: 4 }}>
          Ninguna factura se repite, ninguna está asignada de más o de menos, y los pedidos de Compras cuadran con el control.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: colors.inkSoft, marginBottom: 4 }}>
        Lo que hace que el control cuente plata de más o de menos. Se revisa solo cada vez que cambia algo de la obra.
      </div>
      {error && <div style={{ background: colors.dangerSoft, color: colors.danger, borderRadius: colors.radiusSm, padding: "8px 10px", fontSize: 12, margin: "8px 0" }}>{error}</div>}

      {/* ── 1. La misma factura dos veces ── */}
      {a.repetidas.length > 0 && (
        <>
          <Titulo icono={AlertOctagon} color={colors.danger} monto={exactos.length ? deMasRepetidas : null}>
            La misma factura dos veces · {a.repetidas.length}
          </Titulo>
          <Explica>Sin importar si entró por planilla, caja chica o Compras. La primera se queda; las otras sobran.</Explica>
          {[...exactos, ...posibles].map(g => (
            <div key={g.clave} style={caja(g.tipo === "exacto" ? colors.dangerBorder : colors.warningBorder)}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                {g.tipo === "exacto" ? <AlertOctagon size={13} color={colors.danger} /> : <AlertTriangle size={13} color={colors.warning} />}
                <span style={{ fontSize: 12, fontWeight: 700, color: g.tipo === "exacto" ? colors.danger : colors.warning }}>
                  {g.tipo === "exacto" ? `Misma factura, cargada ${g.facturas.length} veces` : `Parecidas: ${g.facturas.length} facturas`}
                </span>
                {g.justificado && <span style={{ fontSize: 10, background: colors.neutralSoft, color: colors.inkSoft, padding: "2px 7px", borderRadius: 20 }}>justificado</span>}
              </div>
              {g.facturas.map((f, i) => (
                <div key={f.id} style={fila(i === 0 ? colors.bg : (g.tipo === "exacto" ? colors.dangerSoft : colors.warningSoft))}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {i === 0 && <div style={{ fontSize: 9, fontWeight: 700, color: colors.success, letterSpacing: .5 }}>LA PRIMERA</div>}
                    <div style={nombre}>
                      {f.razon_social || "Sin proveedor"}
                      {f.numero_factura && <span style={{ color: colors.muted, fontWeight: 400 }}> · #{f.numero_factura}</span>}
                    </div>
                    <div style={detalle}>
                      {f.fecha} · {nombrePlanilla(f.planilla_id)} · entró {ORIGEN[f.origen] || f.origen || "—"}
                      {f.subido_por_nombre ? ` por ${f.subido_por_nombre}` : ""}
                    </div>
                    {f.duplicado_justificacion && (
                      <div style={{ fontSize: 10, color: colors.warning, marginTop: 3, fontStyle: "italic" }}>Justificación: {f.duplicado_justificacion}</div>
                    )}
                  </div>
                  <div style={plata}>${fmt(f.total)}</div>
                  {/* LA COPIA QUE ENTRÓ POR CAJA CHICA SE BORRA EN CAJA CHICA.
                      Ahí es un gasto de la caja: borrarla solo del control
                      dejaba la caja contando un gasto que ya no está en
                      ningún lado. Allá se borran los dos y se rehace el
                      cierre, si lo tenía. */}
                  {i > 0 && f.origen === "caja_chica" && f.caja_gasto_id && (
                    <span className="borrar-en-caja-chica" style={{ fontSize: 10.5, color: colors.danger, maxWidth: 120, textAlign: "right", lineHeight: 1.35, flexShrink: 0 }}>
                      Borrala en Caja chica: es un gasto de la caja
                    </span>
                  )}
                  {i > 0 && !(f.origen === "caja_chica" && f.caja_gasto_id) && (
                    <button onClick={() => eliminar(f)} disabled={trabajando === "f" + f.id} title="Eliminar esta copia"
                      style={{ background: colors.dangerSoft, border: `1px solid ${colors.dangerBorder}`, borderRadius: colors.radiusSm, padding: "5px 7px", color: colors.danger, cursor: "pointer", display: "flex" }}>
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          ))}
        </>
      )}

      {/* ── 2. Pedido de Compras ya facturado, sin enganchar ── */}
      {a.pedidos.length > 0 && (
        <>
          <Titulo icono={Link2} color={colors.danger} monto={suma(a.pedidos, x => x.deMas)}>
            Pedidos de Compras ya facturados · {a.pedidos.length}
          </Titulo>
          <Explica>
            El pedido sigue contando como comprometido y su factura ya está en el control: la misma compra, dos veces.
            Engancharlo lo cuenta una sola vez.
          </Explica>
          {a.pedidos.map(x => (
            <div key={x.pedido.id} style={caja(x.seguro ? colors.dangerBorder : colors.warningBorder)}>
              <div style={fila(colors.bg)}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: colors.inkSoft, letterSpacing: .5 }}>PEDIDO #{x.pedido.id}{x.pedido.pagado_at ? " · PAGADO" : ""}</div>
                  <div style={nombre}>{x.pedido.descripcion}</div>
                  <div style={detalle}>{x.seguro ? "Mismo proveedor y mismo monto" : "Puede ser este: revisalo"}</div>
                </div>
                <div style={plata}>${fmt(x.monto)}</div>
              </div>
              {x.candidatas.map(c => (
                <div key={c.factura.id} style={fila(x.seguro ? colors.dangerSoft : colors.warningSoft)}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={nombre}>
                      {c.factura.razon_social || "Sin proveedor"}
                      {c.factura.numero_factura && <span style={{ color: colors.muted, fontWeight: 400 }}> · #{c.factura.numero_factura}</span>}
                      {c.factura.clase === "anticipo" && <span style={{ color: colors.warning, fontWeight: 600 }}> · anticipo</span>}
                    </div>
                    <div style={detalle}>{c.factura.fecha} · {nombrePlanilla(c.factura.planilla_id)}</div>
                  </div>
                  <div style={plata}>${fmt(c.factura.total)}</div>
                  <button onClick={() => enganchar(x.pedido, c.factura)} disabled={trabajando === "p" + x.pedido.id}
                    style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusSm, padding: "5px 9px", color: colors.brand, cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: colors.font, flexShrink: 0 }}>
                    {trabajando === "p" + x.pedido.id ? "Enganchando…" : "Es esta"}
                  </button>
                </div>
              ))}
            </div>
          ))}
        </>
      )}

      {/* ── Gasto en un rubro que una orden de cambio quitó ── */}
      {a.enQuitados.length > 0 && (
        <>
          <Titulo icono={Layers} color={colors.danger} monto={suma(a.enQuitados, x => x.asignacion.monto)}>
            Gastos en un rubro que una orden de cambio quitó · {a.enQuitados.length}
          </Titulo>
          <Explica>
            El renglón en negativo de una orden es obra que ya no se hace: ahí no va gasto. Va al rubro que sigue en el
            presupuesto original o a los rubros nuevos de la orden. Se corrige eligiéndole el rubro donde se usó
            {a.enQuitados.some(x => x.factura.origen === "caja_chica") ? " — los de caja chica, en Caja chica" : ""}.
          </Explica>
          {a.enQuitados.map(x => (
            <div key={x.asignacion.id} className="gasto-en-rubro-quitado" style={fila(colors.dangerSoft)}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={nombre}>
                  {x.factura.razon_social || "Sin proveedor"}
                  {x.factura.numero_factura && <span style={{ color: colors.muted, fontWeight: 400 }}> · #{x.factura.numero_factura}</span>}
                </div>
                <div style={detalle}>
                  {x.factura.fecha} · entró {ORIGEN[x.factura.origen] || x.factura.origen || "—"}{x.factura.subido_por_nombre ? ` por ${x.factura.subido_por_nombre}` : ""}
                  {" · "}en {x.rubro.numero} {String(x.rubro.descripcion || "").slice(0, 60)}
                </div>
              </div>
              <div style={plata}>${fmt(x.asignacion.monto)}</div>
            </div>
          ))}
        </>
      )}

      {/* ── 3. Factura asignada por más de lo que vale ── */}
      {a.sobreasignadas.length > 0 && (
        <>
          <Titulo icono={Layers} color={colors.danger} monto={suma(a.sobreasignadas, x => x.deMas)}>
            Facturas asignadas por más de lo que valen · {a.sobreasignadas.length}
          </Titulo>
          <Explica>Sus asignaciones suman más que su total: lo de más aparece gastado en los rubros y no existe. Se corrige desde Facturas.</Explica>
          {a.sobreasignadas.map(x => (
            <div key={x.factura.id} style={fila(colors.dangerSoft)}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={nombre}>
                  {x.factura.razon_social || "Sin proveedor"}
                  {x.factura.numero_factura && <span style={{ color: colors.muted, fontWeight: 400 }}> · #{x.factura.numero_factura}</span>}
                </div>
                <div style={detalle}>
                  Vale ${fmt(x.factura.total)} y está asignada por ${fmt(x.asignado)}
                  {x.aAgrupaciones > 0 && x.aRubros > 0 ? ` — a una agrupación entera y además a ${x.aRubros} rubros` : ""}
                </div>
              </div>
              <div style={{ ...plata, color: colors.danger }}>+${fmt(x.deMas)}</div>
            </div>
          ))}
        </>
      )}

      {/* ── 4. Pagado en Compras, sin documento en el control ── */}
      {a.pagados.length > 0 && (
        <>
          <Titulo icono={FileX} color={colors.warning} monto={suma(a.pagados, x => x.monto)}>
            Pagados en Compras sin documento en el control · {a.pagados.length}
          </Titulo>
          <Explica>La plata salió y el control no la tiene de ninguna forma. Falta cargar su factura desde el pedido, en Compras.</Explica>
          {a.pagados.map(x => (
            <div key={x.pedido.id} style={fila(colors.warningSoft)}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={nombre}>{x.pedido.descripcion}</div>
                <div style={detalle}>Pedido #{x.pedido.id} · pagado el {String(x.pedido.pagado_at).slice(0, 10)}{x.pedido.proveedor ? ` · ${x.pedido.proveedor}` : ""}</div>
              </div>
              <div style={plata}>${fmt(x.monto)}</div>
            </div>
          ))}
        </>
      )}

      {/* ── 5. Documento sin asignar ── */}
      {a.sinAsignar.length > 0 && (
        <>
          <Titulo icono={Inbox} color={colors.warning} monto={suma(a.sinAsignar, x => x.falta)}>
            Documentos sin asignar · {a.sinAsignar.length}
          </Titulo>
          <Explica>Están en el control y lo que les falta no descuenta de ningún rubro. Se asignan desde Facturas.</Explica>
          {a.sinAsignar.map(x => (
            <div key={x.factura.id} style={fila(colors.warningSoft)}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={nombre}>
                  {x.factura.razon_social || "Sin proveedor"}
                  {x.factura.numero_factura && <span style={{ color: colors.muted, fontWeight: 400 }}> · #{x.factura.numero_factura}</span>}
                </div>
                <div style={detalle}>
                  {x.factura.fecha} · {nombrePlanilla(x.factura.planilla_id)}
                  {x.asignado ? ` · asignado $${fmt(x.asignado)} de $${fmt(x.factura.total)}` : " · nada asignado"}
                </div>
              </div>
              <div style={plata}>${fmt(x.falta)}</div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
