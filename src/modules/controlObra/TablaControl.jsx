import { useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { colors } from "../../theme/colors";
import { fmt } from "./calculos";

const COLS = "minmax(200px,3fr) 60px 70px repeat(5, minmax(90px,1fr)) 64px";

function pctColor(pct, saldo) {
  if (saldo < 0) return colors.danger;
  if (pct >= 0.999) return colors.success;
  return colors.inkSoft;
}

export default function TablaControl({ grupos, porRubro, totales, modo = "capitulo" }) {
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

  return (
    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 900 }}>

          {/* Encabezado */}
          <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 8, padding: "8px 14px", background: colors.bg, borderBottom: `1px solid ${colors.border}`, fontSize: 9, fontWeight: 700, color: colors.muted, letterSpacing: 0.3 }}>
            <span>{modo === "actividad" ? "ACTIVIDAD / RUBRO" : "RUBRO"}</span>
            <span style={{ textAlign: "right" }}>UND</span>
            <span style={{ textAlign: "right" }}>CANT</span>
            <span style={{ textAlign: "right" }}>PRESUPUESTO</span>
            <span style={{ textAlign: "right" }}>ACUM. ANT.</span>
            <span style={{ textAlign: "right" }}>ESTE PERÍODO</span>
            <span style={{ textAlign: "right" }}>INVERTIDO</span>
            <span style={{ textAlign: "right" }}>SALDO</span>
            <span style={{ textAlign: "right" }}>AVANCE</span>
          </div>

          {grupos.map(g => {
            const abierto = !cerrados.has(g.capitulo);
            return (
              <div key={g.capitulo}>
                {/* Capítulo */}
                <div onClick={() => toggle(g.capitulo)}
                  style={{ display: "grid", gridTemplateColumns: COLS, gap: 8, padding: "9px 14px", background: colors.brandSoft, borderBottom: `1px solid ${colors.border}`, cursor: "pointer", fontSize: 11, fontWeight: 700, color: colors.brand, alignItems: "center" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {abierto ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    {g.capitulo}
                    <span style={{ fontWeight: 400, opacity: 0.7 }}>({g.rubros.length})</span>
                  </span>
                  <span /><span />
                  <span style={{ textAlign: "right" }}>${fmt(g.base)}</span>
                  <span style={{ textAlign: "right" }}>${fmt(g.anterior)}</span>
                  <span style={{ textAlign: "right" }}>${fmt(g.periodo)}</span>
                  <span style={{ textAlign: "right" }}>${fmt(g.acumulado)}</span>
                  <span style={{ textAlign: "right", color: g.saldo < 0 ? colors.danger : colors.brand }}>${fmt(g.saldo)}</span>
                  <span style={{ textAlign: "right" }}>{(g.pct * 100).toFixed(0)}%</span>
                </div>

                {/* Rubros */}
                {abierto && g.rubros.map(r => {
                  const acc = porRubro[r.id] || { anterior: 0, periodo: 0, acumulado: 0, saldo: Number(r.total_base) || 0, pct: 0 };
                  return (
                    <div key={r.id} className="tabla-row"
                      style={{ display: "grid", gridTemplateColumns: COLS, gap: 8, padding: "7px 14px", borderBottom: `1px solid ${colors.neutralSoft}`, fontSize: 12, alignItems: "center" }}>
                      <span style={{ color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.descripcion}>
                        <span style={{ color: colors.muted, marginRight: 6 }}>{r.numero}</span>{r.descripcion}
                      </span>
                      <span style={{ textAlign: "right", color: colors.muted, fontSize: 11 }}>{r.unidad}</span>
                      <span style={{ textAlign: "right", color: colors.muted, fontSize: 11 }}>{fmt(r.cantidad)}</span>
                      <span style={{ textAlign: "right", color: colors.inkSoft }}>${fmt(r.total_base)}</span>
                      <span style={{ textAlign: "right", color: colors.muted }}>${fmt(acc.anterior)}</span>
                      <span style={{ textAlign: "right", color: acc.periodo > 0 ? colors.brand : colors.muted, fontWeight: acc.periodo > 0 ? 600 : 400 }}>${fmt(acc.periodo)}</span>
                      <span style={{ textAlign: "right", color: colors.ink }}>${fmt(acc.acumulado)}</span>
                      <span style={{ textAlign: "right", color: acc.saldo < 0 ? colors.danger : colors.inkSoft }}>${fmt(acc.saldo)}</span>
                      <span style={{ textAlign: "right", fontWeight: 600, color: pctColor(acc.pct, acc.saldo) }}>{(acc.pct * 100).toFixed(0)}%</span>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Total */}
          <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 8, padding: "11px 14px", background: colors.ink, fontSize: 12, fontWeight: 700, color: "#fff", alignItems: "center" }}>
            <span>TOTAL OBRA</span>
            <span /><span />
            <span style={{ textAlign: "right" }}>${fmt(totales.base)}</span>
            <span style={{ textAlign: "right" }}>${fmt(totales.anterior)}</span>
            <span style={{ textAlign: "right" }}>${fmt(totales.periodo)}</span>
            <span style={{ textAlign: "right" }}>${fmt(totales.acumulado)}</span>
            <span style={{ textAlign: "right" }}>${fmt(totales.saldo)}</span>
            <span style={{ textAlign: "right" }}>{(totales.pct * 100).toFixed(1)}%</span>
          </div>

        </div>
      </div>
    </div>
  );
}
