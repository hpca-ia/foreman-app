import { useEffect } from "react";
import { colors } from "../../theme/colors";

// Qué se mete en el PDF. Los anexos (las fotos de las facturas) son lo que
// pesa y lo que tarda, así que solo se generan cuando de verdad se quieren.
export const CONTENIDO = {
  reporte: { label: "Solo reporte", ayuda: "Los datos, sin las facturas escaneadas. Rápido y liviano." },
  anexos: { label: "Solo anexos", ayuda: "Únicamente las facturas escaneadas, con su índice." },
  completo: { label: "Completo", ayuda: "El reporte y, al final, cada factura escaneada." },
};

export default function SelectorContenido({ valor, onChange, conAdjunto = 0 }) {
  // Sin facturas escaneadas, las opciones con anexos no aplican: se vuelve
  // a "solo reporte" para que lo elegido y lo que dice el botón coincidan.
  useEffect(() => {
    if (conAdjunto === 0 && valor !== "reporte") onChange("reporte");
  }, [conAdjunto, valor, onChange]);

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, color: colors.muted, fontWeight: 600, letterSpacing: 0.3, marginBottom: 5 }}>
        CONTENIDO DEL PDF
      </div>
      <div style={{ display: "inline-flex", gap: 3, background: colors.neutralSoft, borderRadius: colors.radiusSm, padding: 3, flexWrap: "wrap" }}>
        {Object.entries(CONTENIDO).map(([id, c]) => {
          const deshabilitado = id !== "reporte" && conAdjunto === 0;
          return (
            <button
              key={id}
              onClick={() => !deshabilitado && onChange(id)}
              disabled={deshabilitado}
              title={deshabilitado ? "No hay facturas escaneadas en este período" : c.ayuda}
              style={{
                padding: "5px 12px", borderRadius: 6, border: "none",
                cursor: deshabilitado ? "default" : "pointer",
                fontFamily: colors.font, fontSize: 12, fontWeight: 600,
                background: valor === id ? colors.surface : "transparent",
                color: deshabilitado ? colors.border : valor === id ? colors.brand : colors.inkSoft,
              }}
            >
              {c.label}
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: colors.muted, marginTop: 5 }}>
        {CONTENIDO[valor].ayuda}
        {valor !== "reporte" && conAdjunto > 0 && ` · ${conAdjunto} factura${conAdjunto === 1 ? "" : "s"} escaneada${conAdjunto === 1 ? "" : "s"}`}
      </div>
    </div>
  );
}
