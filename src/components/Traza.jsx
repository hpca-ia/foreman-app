import { partesDeLaTraza } from "../lib/trazabilidad";

// LA TRAZA DE UN PAPEL, EN UNA LÍNEA: «PR15-TR52 · ODC6 · CC9 Lizeth · PL2».
//
// Hernán, 28/11/2026: «cuando se buscan facturas desde control o facturas o
// caja chica, despliega en qué planilla está... o de qué caja chica viene o de
// qué compra viene». La misma pieza en la factura, en la orden de compra y en
// el gasto de caja chica, para que el código se lea igual en los tres lados.

const COLOR = {
  tr: { color: "var(--ink)", fondo: "var(--neutral-soft, #f1f1ee)", peso: 700 },
  odc: { color: "var(--brand)", fondo: "transparent", peso: 600 },
  cc: { color: "var(--brand)", fondo: "transparent", peso: 600 },
  rol: { color: "var(--brand)", fondo: "transparent", peso: 600 },
  pl: { color: "var(--ink-soft)", fondo: "transparent", peso: 600 },
};

export default function Traza({ t, onIr = null, despues = null, estilo = null }) {
  const partes = partesDeLaTraza(t);
  if (!partes.length && !despues) return null;
  return (
    <span className="traza" style={{ display: "inline-flex", flexWrap: "wrap", alignItems: "center", gap: 5, fontSize: 10.5, lineHeight: 1.5, ...estilo }}>
      {partes.map((p, i) => {
        const c = COLOR[p.clave] || COLOR.pl;
        const sePuedeIr = onIr && (p.clave === "odc" || p.clave === "cc");
        const caja = { color: c.color, background: c.fondo, fontWeight: c.peso, letterSpacing: 0.2,
          borderRadius: 5, padding: p.clave === "tr" ? "0 5px" : 0, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };
        return (
          <span key={p.clave + (p.id ?? "") + i} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            {i > 0 && <span style={{ color: "var(--muted)" }}>·</span>}
            {sePuedeIr ? (
              <button title={p.titulo} onClick={e => { e.stopPropagation(); onIr(p); }}
                style={{ ...caja, border: "none", cursor: "pointer", fontFamily: "var(--font)", fontSize: "inherit", textDecoration: "underline" }}>
                {p.texto}
              </button>
            ) : <span title={p.titulo} style={caja}>{p.texto}</span>}
          </span>
        );
      })}
      {despues}
    </span>
  );
}
