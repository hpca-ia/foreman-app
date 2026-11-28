import { useState } from "react";
import { GitBranch, ChevronDown, ChevronRight } from "lucide-react";
import { colors } from "../../theme/colors";
import Traza from "../../components/Traza";
import { fmt } from "./calculos";
import { ERRORES_TR, ORDEN_DE_ERRORES } from "./estadoDeLasTR.js";
import { codigoODC } from "../../lib/trazabilidad";

// EL RESUMEN DE LAS TR, EN ALERTAS (Hernán, 28/11/2026: «arma resumen de TR
// con errores... creo que puede ser en Alertas»).
//
// Arriba, la cuenta: cuántas transacciones tiene el proyecto, cuántas están
// completas, cuántas en curso y a cuántas les falta algo. Abajo, las que
// tienen algo, cada una con su código y lo que le falta. Tocar un tipo de
// error deja solo esas; tocar una TR lleva a su factura.

const chip = (activo, color) => ({
  border: `1px solid ${activo ? color : colors.border}`, background: activo ? color : colors.surface,
  color: activo ? "#fff" : colors.inkSoft, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 600,
  cursor: "pointer", fontFamily: colors.font, whiteSpace: "nowrap",
});

function Cuenta({ n, texto, color }) {
  return (
    <div style={{ flex: "1 1 90px", minWidth: 90 }}>
      <div style={{ fontSize: 20, fontWeight: 700, color, lineHeight: 1.1 }}>{n}</div>
      <div style={{ fontSize: 10.5, color: colors.inkSoft }}>{texto}</div>
    </div>
  );
}

const TOPE = 40;

export default function ResumenDeTR({ resumen, onVerTR = null }) {
  const [abierto, setAbierto] = useState(true);
  const [solo, setSolo] = useState(null);       // clave de un error
  const [todas, setTodas] = useState(false);
  if (!resumen || !resumen.cuenta.total) return null;
  const { trs, cuenta } = resumen;

  const conError = trs.filter(t => t.estado === "con_error");
  const vistas = solo ? conError.filter(t => t.errores.some(e => e.clave === solo)) : conError;
  const lista = todas ? vistas : vistas.slice(0, TOPE);
  const tipos = ORDEN_DE_ERRORES.filter(k => cuenta.porError[k]);

  return (
    <div className="resumen-de-tr" style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 12, marginBottom: 14 }}>
      <button onClick={() => setAbierto(a => !a)}
        style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: colors.font, textAlign: "left" }}>
        {abierto ? <ChevronDown size={14} color={colors.inkSoft} /> : <ChevronRight size={14} color={colors.inkSoft} />}
        <GitBranch size={14} color={colors.brand} />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: colors.ink }}>Transacciones (TR) del proyecto</span>
        <span style={{ fontSize: 11, color: colors.muted }}>
          {cuenta.conError ? `${cuenta.conError} con algo por resolver` : "todas en orden"}
        </span>
      </button>

      {abierto && (
        <>
          <div style={{ fontSize: 11, color: colors.inkSoft, margin: "6px 0 10px" }}>
            Cada gasto, de punta a punta: la orden de compra o el gasto de caja chica, su factura en el control y su planilla.
            Una TR está completa cuando tiene su factura con papel y número, en una planilla y asignada a sus rubros.
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <Cuenta n={cuenta.total} texto="transacciones" color={colors.ink} />
            <Cuenta n={cuenta.completas} texto="completas" color={colors.success} />
            <Cuenta n={cuenta.enCurso} texto="en curso: sin comprar o sin aprobar" color={colors.inkSoft} />
            <Cuenta n={cuenta.conError} texto="con algo por resolver" color={cuenta.conError ? colors.danger : colors.muted} />
          </div>

          {tipos.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              <button onClick={() => { setSolo(null); setTodas(false); }} style={chip(!solo, colors.ink)}>Todas · {conError.length}</button>
              {tipos.map(k => (
                <button key={k} title={ERRORES_TR[k].hacer} onClick={() => { setSolo(solo === k ? null : k); setTodas(false); }}
                  style={chip(solo === k, ERRORES_TR[k].grave ? colors.danger : colors.warning)}>
                  {ERRORES_TR[k].corto} · {cuenta.porError[k]}
                </button>
              ))}
            </div>
          )}
          {solo && <div style={{ fontSize: 11, color: colors.inkSoft, marginBottom: 8 }}>{ERRORES_TR[solo].hacer}</div>}

          {lista.map(t => (
            <div key={t.clave} className="tr-con-error"
              style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 10px", marginBottom: 5,
                background: t.grave ? colors.dangerSoft : colors.bg, borderRadius: colors.radiusSm }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div><Traza t={t.traza} estilo={{ fontSize: 11.5 }} /></div>
                <div style={{ fontSize: 12, color: colors.ink, marginTop: 2, overflowWrap: "anywhere" }}>{t.que || "—"}</div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 4 }}>
                  {t.errores.map(e => (
                    <span key={e.clave} title={[ERRORES_TR[e.clave].hacer, e.dice].filter(Boolean).join("\n\n")}
                      style={{ fontSize: 10, fontWeight: 700, borderRadius: 9, padding: "1px 7px", whiteSpace: "nowrap",
                        color: ERRORES_TR[e.clave].grave ? "#fff" : colors.warning,
                        background: ERRORES_TR[e.clave].grave ? colors.danger : colors.warningSoft }}>
                      {ERRORES_TR[e.clave].corto}
                    </span>
                  ))}
                </div>
                {t.errores.some(e => e.dice) && (
                  <div style={{ fontSize: 10.5, color: colors.inkSoft, marginTop: 3, overflowWrap: "anywhere" }}>
                    {t.errores.filter(e => e.dice).map(e => e.dice).join(" · ")}
                  </div>
                )}
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: colors.ink }}
                  title={t.montoEsEstimado ? "Es el monto de la orden de compra: todavía no hay una factura" : ""}>
                  ${fmt(Math.abs(t.monto))}{t.montoEsEstimado ? " e" : ""}
                </div>
                {t.facturaId && t.tr && onVerTR ? (
                  <button onClick={() => onVerTR(`TR${t.tr}`)}
                    style={{ background: "none", border: "none", padding: 0, marginTop: 3, cursor: "pointer", fontFamily: colors.font,
                      fontSize: 11, color: colors.brand, textDecoration: "underline" }}>
                    ver la factura
                  </button>
                ) : !t.facturaId && t.solicitudId ? (
                  <div style={{ fontSize: 10.5, color: colors.muted, marginTop: 3 }}>en Compras: {codigoODC(t.solicitudId)}</div>
                ) : !t.facturaId && t.gastoId ? (
                  <div style={{ fontSize: 10.5, color: colors.muted, marginTop: 3 }}>en Caja chica</div>
                ) : null}
              </div>
            </div>
          ))}
          {vistas.length > lista.length && (
            <button onClick={() => setTodas(true)}
              style={{ background: "none", border: "none", padding: "4px 0", cursor: "pointer", fontFamily: colors.font, fontSize: 11.5, color: colors.brand, textDecoration: "underline" }}>
              ver las {vistas.length - lista.length} que faltan
            </button>
          )}
        </>
      )}
    </div>
  );
}
