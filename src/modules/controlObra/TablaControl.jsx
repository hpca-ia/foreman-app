import { useState } from "react";
import { ChevronRight, ChevronDown, AlertTriangle } from "lucide-react";
import { colors } from "../../theme/colors";
import { fmt } from "./calculos";

const COLS = "minmax(200px,3fr) 60px 70px repeat(6, minmax(90px,1fr)) 64px";

function pctColor(pct, saldo) {
  if (saldo < 0) return colors.danger;
  if (pct >= 0.999) return colors.success;
  return colors.inkSoft;
}

function FilaRubro({ rubro: r, porRubro, sangria, comprometido = 0 }) {
  // Sacado del contrato por una orden de cambio: se lee tachado y en gris. Que
  // siga a la vista es el punto — alguien tiene que poder ver que ese trabajo
  // estaba y ya no está, sin ir a buscar la orden.
  const fuera = !!r.anulado_por_oc;
  const acc = porRubro[r.id] || { anterior: 0, periodo: 0, acumulado: 0, saldo: Number(r.total_base) || 0, pct: 0 };

  return (
    <div className="tabla-row"
      style={{ display: "grid", gridTemplateColumns: COLS, gap: 8, padding: `7px 14px 7px ${sangria}px`, borderBottom: `1px solid ${colors.neutralSoft}`, fontSize: 12, alignItems: "center",
        opacity: fuera ? 0.5 : 1, textDecoration: fuera ? "line-through" : "none" }}>
      <span style={{ color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        title={fuera ? `${r.descripcion} — sacado del contrato por una orden de cambio` : r.descripcion}>
        <span style={{ color: colors.muted, marginRight: 6 }}>{r.numero}</span>{r.descripcion}
      </span>
      <span style={{ textAlign: "right", color: colors.muted, fontSize: 11 }}>{r.unidad}</span>
      <span style={{ textAlign: "right", color: colors.muted, fontSize: 11 }}>{fmt(r.cantidad)}</span>
      <span style={{ textAlign: "right", color: colors.inkSoft }}>${fmt(r.total_base)}</span>
      <span style={{ textAlign: "right", color: colors.muted }}>${fmt(acc.anterior)}</span>
      <span style={{ textAlign: "right", color: acc.periodo > 0 ? colors.brand : colors.muted, fontWeight: acc.periodo > 0 ? 600 : 400 }}>${fmt(acc.periodo)}</span>
      <span style={{ textAlign: "right", color: colors.ink }} title={acc.estimado ? "Repartido desde una agrupación a prorrata del presupuesto — no es un monto de factura" : undefined}>
        {acc.estimado && <span style={{ color: colors.muted, marginRight: 2 }}>~</span>}${fmt(acc.acumulado)}
      </span>
      <span style={{ textAlign: "right", color: comprometido ? colors.warning : colors.muted, fontSize: 11 }}>
        {comprometido ? `$${fmt(comprometido)}` : ""}
      </span>
      <span style={{ textAlign: "right", color: acc.saldo < 0 ? colors.danger : colors.inkSoft }}>${fmt(acc.saldo)}</span>
      <span style={{ textAlign: "right", fontWeight: 600, color: pctColor(acc.pct, acc.saldo) }}>{(acc.pct * 100).toFixed(0)}%</span>
    </div>
  );
}

export default function TablaControl({ grupos, porRubro, totales, modo = "capitulo", comprometido = null }) {
  // Se guardan los CERRADOS, no los abiertos: así al cambiar de agrupación
  // los grupos nuevos aparecen abiertos en vez de colapsarse todos.
  const [cerrados, setCerrados] = useState(() => new Set());

  function toggle(cap) {
    setCerrados(prev => {
      const n = new Set(prev);
      if (n.has(cap)) n.delete(cap); else n.add(cap);
      return n;
    });
  }

  if (!grupos.length) {
    return <div style={{ textAlign: "center", color: colors.muted, padding: "40px 0", fontSize: 13 }}>Esta obra no tiene rubros.</div>;
  }


  // CUÁNTO DE LO COMPROMETIDO CAE EN UNA FILA Y CUÁNTO NO.
  //
  // Se mide contra lo que las filas REALMENTE muestran, no contra una regla:
  // así aparece cualquiera sea el motivo por el que un pedido no encontró su
  // grupo —no apunta a ningún rubro, apunta a un capítulo con un nombre que
  // esta obra no tiene, o quedó colgado del proyecto y no de la obra—.
  //
  // Sin esto, el total decía "$1.830 comprometido" con cero facturas cargadas
  // y ninguna fila en la que mirar: el número estaba ahí y no había de dónde
  // agarrarse para averiguar de qué venía.
  const ubicado = grupos.reduce((t, g) => t + ((modo === "actividad"
    ? comprometido?.porActividad?.[g.clave]
    : comprometido?.porCapitulo?.[g.capitulo]) || 0), 0);
  const sinUbicar = (comprometido?.total || 0) - ubicado;
  const detalle = comprometido?.detalle || [];
  const claves = new Set(grupos.map(g => (modo === "actividad" ? g.clave : g.capitulo)));
  const sueltos = detalle.filter(d => !claves.has(modo === "actividad" ? d.claveAct : d.capitulo));
  // De qué está hecho el comprometido. Un número solo no se puede discutir ni
  // bajar; sabiendo que son tres aprobadas y una esperando visto, se sabe a
  // quién ir a buscar. Al final de la obra tiene que quedar en cero.
  const ETIQUETA = {
    pendiente_aprobacion: "esperando visto", aprobada: "aprobadas", comprada: "compradas",
  };
  const desgloseComprometido = Object.entries(comprometido?.porEstado || {})
    .sort((a, b) => b[1] - a[1])
    .map(([e, v]) => `$${fmt(v)} ${ETIQUETA[e] || e}`)
    .join(" · ") + "\n\nPedidos de compra vivos y sin factura. Cuando la factura entra al control, dejan de estar comprometidos: al final de la obra esto queda en cero.";

  return (
    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 900 }}>

          {/* Encabezado */}
          <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 8, padding: "8px 14px", background: colors.bg, borderBottom: `1px solid ${colors.border}`, fontSize: 9, fontWeight: 700, color: colors.muted, letterSpacing: 0.3 }}>
            <span>{modo === "actividad" ? "AGRUPACIÓN / RUBRO" : "CAPÍTULO / RUBRO"}</span>
            <span style={{ textAlign: "right" }}>UND</span>
            <span style={{ textAlign: "right" }}>CANT</span>
            <span style={{ textAlign: "right" }}>PRESUPUESTO</span>
            <span style={{ textAlign: "right" }}>ACUM. ANT.</span>
            <span style={{ textAlign: "right" }}>ESTE PERÍODO</span>
            <span style={{ textAlign: "right" }}>INVERTIDO</span>
            {/* Lo pedido y todavía no facturado. Un capítulo al 80% con otro
                20% comprometido ya está gastado, aunque el papel no llegue. */}
            <span style={{ textAlign: "right" }} title="Solicitudes de compra vivas y sin factura: plata ya comprometida contra este grupo">COMPROMETIDO</span>
            <span style={{ textAlign: "right" }}>SALDO</span>
            <span style={{ textAlign: "right" }}>AVANCE</span>
          </div>

          {grupos.map(g => {
            const abierto = !cerrados.has(g.clave || g.capitulo);
            // La misma plata, leída por la vista que esté puesta: el pedido se
            // hace contra una agrupación y el contrato está por capítulos.
            const pedido = (modo === "actividad"
              ? comprometido?.porActividad?.[g.clave]
              : comprometido?.porCapitulo?.[g.capitulo]) || 0;
            const libre = g.saldo - pedido;
            return (
              <div key={g.clave || g.capitulo}>
                {/* Capítulo o actividad */}
                <div onClick={() => toggle(g.clave || g.capitulo)}
                  style={{ display: "grid", gridTemplateColumns: COLS, gap: 8, padding: "9px 14px", background: colors.brandSoft, borderBottom: `1px solid ${colors.border}`, cursor: "pointer", fontSize: 11, fontWeight: 700, color: colors.brand, alignItems: "center" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
                    {abierto ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    {g.codigo && <span style={{ opacity: 0.6 }}>{g.codigo}</span>}
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.capitulo}</span>
                    <span style={{ fontWeight: 400, opacity: 0.7 }}>({g.rubros.length})</span>
                    {/* Esto se gastó sin estar contratado: salarios, oficina,
                        logística. Que se vea distinto es el punto. */}
                    {g.sinPresupuesto && (
                      <span title="Gasto sin presupuesto: no estaba contratado, por eso el saldo va en negativo"
                        style={{ background: colors.warningSoft, color: colors.warning, borderRadius: 10,
                          padding: "1px 7px", fontSize: 9, fontWeight: 600, flexShrink: 0 }}>
                        sin presupuesto
                      </span>
                    )}
                    {g.cruzaCapitulos && (
                      <span title={`Esta agrupación toca ${g.capitulos.length} capítulos: ${g.capitulos.join(", ")}. El gasto que se le asigne se reparte entre ellos a prorrata.`}
                        style={{ display: "flex", alignItems: "center", gap: 3, background: colors.warningSoft, color: colors.warning, borderRadius: 10, padding: "1px 7px", fontSize: 9, fontWeight: 600, flexShrink: 0 }}>
                        <AlertTriangle size={9} /> {g.capitulos.length} capítulos
                      </span>
                    )}
                  </span>
                  <span /><span />
                  <span style={{ textAlign: "right" }}>${fmt(g.base)}</span>
                  <span style={{ textAlign: "right" }}>${fmt(g.anterior)}</span>
                  <span style={{ textAlign: "right" }}>${fmt(g.periodo)}</span>
                  <span style={{ textAlign: "right" }}>${fmt(g.acumulado)}</span>
                  <span style={{ textAlign: "right", color: pedido ? colors.warning : colors.muted }}>{pedido ? `$${fmt(pedido)}` : "—"}</span>
                  <span style={{ textAlign: "right", color: libre < 0 ? colors.danger : colors.brand }}
                    title={pedido ? `Quedan $${fmt(g.saldo)} sin contar lo comprometido; contándolo, $${fmt(libre)}` : undefined}>
                    ${fmt(g.saldo)}
                  </span>
                  {/* El avance es contra algo: sin presupuesto no hay contra qué. */}
                  <span style={{ textAlign: "right" }}>{g.base > 0 ? `${(g.pct * 100).toFixed(0)}%` : "—"}</span>
                </div>

                {abierto && g.rubros.map(r => <FilaRubro key={r.id} rubro={r} porRubro={porRubro} sangria={14}
                  comprometido={comprometido?.porRubro?.[r.id] || 0} />)}
              </div>
            );
          })}

          {/* LO COMPROMETIDO QUE NO CAE EN NINGUNA FILA.
              Un pedido de compra que no apunta a un rubro ni a una agrupación
              —o que apunta a un capítulo con un nombre que no existe en esta
              obra— sumaba en el TOTAL y no aparecía en ningún renglón. El que
              lo mira ve "$1.830 comprometido" sin una sola factura cargada y
              no tiene de dónde agarrarse para averiguar de qué viene.

              Se calcula contra lo que las filas REALMENTE mostraron, no contra
              una regla: así aparece cualquiera sea el motivo por el que no
              encontró su grupo. */}
          {sinUbicar > 0.005 && (
            <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 8, padding: "9px 14px",
              background: colors.warningSoft, borderBottom: `1px solid ${colors.warningBorder}`,
              fontSize: 11.5, color: colors.warning, alignItems: "center" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700 }}>
                COMPROMETIDO SIN UBICAR
              </span>
              <span /><span /><span /><span /><span /><span />
              <span style={{ textAlign: "right", fontWeight: 700 }}>${fmt(sinUbicar)}</span>
              <span /><span />
            </div>
          )}
          {sinUbicar > 0.005 && (
            <div style={{ padding: "7px 14px 9px", background: colors.warningSoft,
              borderBottom: `1px solid ${colors.border}`, fontSize: 11, color: colors.warning, lineHeight: 1.55 }}>
              {sueltos.length > 0
                ? <>Sale de {sueltos.length === 1 ? "un pedido de compra que no apunta" : `${sueltos.length} pedidos de compra que no apuntan`} a
                    ningún rubro ni agrupación de esta obra:{" "}
                    {sueltos.slice(0, 4).map(d => `${d.descripcion || "sin detalle"} ($${fmt(d.monto)})`).join(" · ")}
                    {sueltos.length > 4 ? ` y ${sueltos.length - 4} más` : ""}.
                    {" "}Asignalos a un rubro desde Compras y van a caer en su capítulo.</>
                : <>Son pedidos de compra vivos cuyo capítulo no coincide con ninguno de esta obra.
                    Revisá en Compras a qué apuntan.</>}
            </div>
          )}

          {/* LO DEVUELTO, que no es comprometido pero tampoco es nada.
              Nadie autorizó esa plata —el pedido se rebotó—, así que no entra
              en el número de arriba. Pero hay alguien que tiene que corregirlo
              o dejarlo morir, y eso es lo único que hay que saber de él. */}
          {comprometido?.devueltas > 0 && (
            <div style={{ padding: "8px 14px", background: colors.surface,
              borderBottom: `1px solid ${colors.border}`, fontSize: 11.5, color: colors.inkSoft, lineHeight: 1.5 }}>
              Hay <strong style={{ color: colors.danger }}>${fmt(comprometido.devuelto)}</strong> en{" "}
              {comprometido.devueltas === 1 ? "un pedido devuelto" : `${comprometido.devueltas} pedidos devueltos`}{" "}
              sin resolver. No cuenta como comprometido —nadie lo aprobó— pero alguien tiene que corregirlo
              o anularlo: mientras siga ahí, no es plata hablada, es una tarea sin dueño.
            </div>
          )}

          {/* Total */}
          <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 8, padding: "11px 14px", background: colors.ink, fontSize: 12, fontWeight: 700, color: "#fff", alignItems: "center" }}>
            <span>TOTAL OBRA</span>
            <span /><span />
            <span style={{ textAlign: "right" }}>${fmt(totales.base)}</span>
            <span style={{ textAlign: "right" }}>${fmt(totales.anterior)}</span>
            <span style={{ textAlign: "right" }}>${fmt(totales.periodo)}</span>
            <span style={{ textAlign: "right" }}>${fmt(totales.acumulado)}</span>
            <span style={{ textAlign: "right" }}
              title={comprometido?.total ? desgloseComprometido : undefined}>
              {comprometido?.total ? `$${fmt(comprometido.total)}` : "—"}</span>
            <span style={{ textAlign: "right" }}>${fmt(totales.saldo)}</span>
            <span style={{ textAlign: "right" }}>{(totales.pct * 100).toFixed(1)}%</span>
          </div>

        </div>
      </div>
    </div>
  );
}
