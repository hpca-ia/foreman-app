import { useState } from "react";
import { Bell, ChevronDown, ChevronRight, ArrowRight } from "lucide-react";
import { colors } from "../theme/colors";

// EL PANEL DE AVISOS, al costado del tablero.
//
// Todo lo que está activo en FOREMAN y pide que esta persona haga algo, en un
// solo lugar: aparece mientras sea cierto y se va cuando se resuelve. Tocar un
// aviso lleva a donde se resuelve.
//
// En el escritorio va a la derecha, siempre abierto. En el teléfono va arriba
// y plegado: ahí lo primero tienen que ser las tareas de uno, y los avisos
// están a un toque.

const TONO = {
  peligro: { color: colors.danger, fondo: colors.dangerSoft, borde: colors.dangerBorder },
  atencion: { color: colors.warning, fondo: colors.warningSoft, borde: colors.warningBorder },
  normal: { color: colors.brand, fondo: colors.brandSoft, borde: colors.border },
};

const angosto = () => typeof window !== "undefined" && window.matchMedia?.("(max-width: 1100px)").matches;

/** @param avisos  lo que arma avisosDelTablero (src/lib/avisos.js) */
export default function PanelAvisos({ avisos = [], onIr }) {
  const [abierto, setAbierto] = useState(() => !angosto());
  if (!avisos.length) return null;
  const total = avisos.reduce((t, a) => t + a.cuenta, 0);

  return (
    <aside className="tablero-avisos" aria-label="Avisos"
      style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, overflow: "hidden" }}>
      <button onClick={() => setAbierto(v => !v)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "none", border: "none",
          cursor: "pointer", fontFamily: colors.font, textAlign: "left" }}>
        <Bell size={14} color={colors.inkSoft} />
        <span style={{ fontSize: 11, fontWeight: 700, color: colors.inkSoft, letterSpacing: 0.5, flex: 1 }}>AVISOS · {total}</span>
        {abierto ? <ChevronDown size={14} color={colors.muted} /> : <ChevronRight size={14} color={colors.muted} />}
      </button>

      {abierto && (
        <div style={{ padding: "0 8px 8px", display: "grid", gap: 6 }}>
          {avisos.map(a => {
            const t = TONO[a.tono] || TONO.normal;
            return (
              <button key={a.clave} onClick={() => onIr?.(a.vista)} title={`Ir a ${a.modulo}`}
                style={{ display: "block", width: "100%", textAlign: "left", background: t.fondo, border: `1px solid ${t.borde}`,
                  borderRadius: colors.radiusSm, padding: "8px 10px", cursor: "pointer", fontFamily: colors.font }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 9.5, fontWeight: 700, color: t.color, letterSpacing: 0.4, flex: 1 }}>{a.modulo.toUpperCase()}</span>
                  <ArrowRight size={12} color={t.color} />
                </div>
                <div style={{ fontSize: 12.5, color: colors.ink, marginTop: 2, lineHeight: 1.35 }}>
                  <strong style={{ color: t.color, fontSize: 14 }}>{a.cuenta}</strong> {a.texto}
                </div>
                {a.detalle && (
                  <div style={{ fontSize: 11, color: colors.inkSoft, marginTop: 2, lineHeight: 1.4, overflowWrap: "anywhere" }}>{a.detalle}</div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </aside>
  );
}
