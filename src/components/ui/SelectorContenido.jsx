import { colors } from "../../theme/colors";

// Qué se mete en el PDF. Los anexos (las fotos de las facturas) son lo que
// pesa y lo que tarda, así que solo se generan cuando de verdad se quieren.
export const CONTENIDO = {
  reporte: { label: "Solo reporte", ayuda: "Los datos, sin las facturas escaneadas. Rápido y liviano." },
  anexos: { label: "Solo anexos", ayuda: "Únicamente las facturas escaneadas, con su índice." },
  completo: { label: "Completo", ayuda: "El reporte y, al final, cada factura escaneada." },
};

/**
 * Lo que de verdad sale en el PDF: sin facturas escaneadas no hay anexos que
 * poner, así que sale solo el reporte. LO ELEGIDO NO SE TOCA.
 *
 * Antes, sin facturas escaneadas se cambiaba la elección a «solo reporte» y
 * ahí quedaba. Al abrir el reporte de una caja sin gastos este mes —la de
 * Johanna— eso pasaba de entrada, y al elegir después el mes pasado o un
 * cierre, que sí tenían sus sustentos, el PDF seguía saliendo sin ninguno.
 */
export const contenidoQueSale = (elegido, conAdjunto) => (conAdjunto > 0 ? elegido : "reporte");

export default function SelectorContenido({ valor, onChange, conAdjunto = 0 }) {
  // Se muestra marcado lo que va a salir, que con cero facturas es «solo
  // reporte»; lo elegido vuelve solo apenas haya facturas en lo que se pide.
  const sale = contenidoQueSale(valor, conAdjunto);

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
                background: sale === id ? colors.surface : "transparent",
                color: deshabilitado ? colors.border : sale === id ? colors.brand : colors.inkSoft,
              }}
            >
              {c.label}
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: colors.muted, marginTop: 5 }}>
        {CONTENIDO[sale].ayuda}
        {sale !== "reporte" && conAdjunto > 0 && ` · ${conAdjunto} factura${conAdjunto === 1 ? "" : "s"} escaneada${conAdjunto === 1 ? "" : "s"}`}
        {conAdjunto === 0 && " No hay facturas escaneadas en lo que elegiste."}
      </div>
    </div>
  );
}
