import { useState } from "react";
import { Search, X, Store } from "lucide-react";
import { colors } from "../theme/colors";
import { inputStyle } from "./ui/Input";
import { porProveedor, proveedoresDe } from "../lib/filtrarGastos";

// Buscar por proveedor y por monto, y ver cuánto suma lo que quedó.
//
// La suma es la mitad del asunto: "¿cuánto le compramos a Disensa este año?"
// no se contesta con una lista de doce filas, se contesta con un número. Por
// eso el total va arriba, al lado del buscador, y no al final de la lista
// donde hay que bajar a buscarlo.
//
// Los nombres que ya existen se ofrecen en una fila de botones. Nadie escribe
// bien "Ferretería El Constructor" dos veces, y de eso viven los proveedores
// duplicados que después nadie puede sumar.

export default function BuscadorDeGastos({ filas = [], filtro, setFiltro, total, cuantos, etiqueta = "gastos" }) {
  const [verResumen, setVerResumen] = useState(false);
  const proveedores = proveedoresDe(filas);
  const resumen = porProveedor(filas);
  const hayFiltro = !!(filtro.texto || filtro.min || filtro.max);

  const mini = { ...inputStyle, padding: "7px 9px", fontSize: 12.5 };
  const chip = puesto => ({
    border: `1px solid ${puesto ? colors.brand : colors.border}`,
    background: puesto ? colors.brand : "#fff", color: puesto ? "#fff" : colors.inkSoft,
    borderRadius: 20, padding: "4px 11px", fontSize: 11.5, fontWeight: 600,
    cursor: "pointer", fontFamily: colors.font, whiteSpace: "nowrap", flexShrink: 0,
  });

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(150px,1fr) 92px 92px auto", gap: 6, alignItems: "center" }}>
        <div style={{ position: "relative" }}>
          <Search size={13} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: colors.muted }} />
          <input value={filtro.texto || ""} onChange={e => setFiltro(f => ({ ...f, texto: e.target.value }))}
            placeholder="Proveedor o qué se compró" style={{ ...mini, paddingLeft: 27 }} />
        </div>
        <input type="number" step="0.01" value={filtro.min || ""} onChange={e => setFiltro(f => ({ ...f, min: e.target.value }))}
          placeholder="desde $" style={mini} />
        <input type="number" step="0.01" value={filtro.max || ""} onChange={e => setFiltro(f => ({ ...f, max: e.target.value }))}
          placeholder="hasta $" style={mini} />
        {hayFiltro && (
          <button onClick={() => setFiltro({ texto: "", min: "", max: "" })} title="Limpiar"
            style={{ background: "none", border: "none", color: colors.muted, cursor: "pointer", display: "flex", padding: 4 }}>
            <X size={14} />
          </button>
        )}
      </div>

      {/* Lo que ya se le compró a alguien, de un toque. */}
      {proveedores.length > 1 && (
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 7, maxHeight: 62, overflowY: "auto" }}>
          {proveedores.slice(0, 14).map(p => {
            const puesto = (filtro.texto || "").trim().toLowerCase() === p.toLowerCase();
            return (
              <button key={p} style={chip(puesto)}
                onClick={() => setFiltro(f => ({ ...f, texto: puesto ? "" : p }))}>
                {p}
              </button>
            );
          })}
          <button onClick={() => setVerResumen(v => !v)} style={chip(verResumen)}>
            <Store size={10} style={{ verticalAlign: -1, marginRight: 3 }} />
            ¿a quién le compramos?
          </button>
        </div>
      )}

      {/* La pregunta que hoy no se puede contestar sin exportar a Excel. */}
      {verResumen && (
        <div style={{ marginTop: 8, background: colors.surface, border: `1px solid ${colors.border}`,
          borderRadius: colors.radiusMd, overflow: "hidden", maxHeight: 220, overflowY: "auto" }}>
          {resumen.map(r => (
            <button key={r.proveedor} onClick={() => { setFiltro(f => ({ ...f, texto: r.proveedor === "Sin proveedor" ? "" : r.proveedor })); setVerResumen(false); }}
              style={{ width: "100%", display: "grid", gridTemplateColumns: "1fr 70px 100px", gap: 8, alignItems: "center",
                padding: "7px 11px", borderTop: `1px solid ${colors.neutralSoft}`, background: "none", border: "none",
                cursor: "pointer", fontFamily: colors.font, textAlign: "left" }}>
              <span style={{ fontSize: 12.5, color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.proveedor}</span>
              <span style={{ fontSize: 11, color: colors.muted, textAlign: "right" }}>{r.cuantos}</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: colors.ink, textAlign: "right" }}>
                ${r.total.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </button>
          ))}
        </div>
      )}

      {hayFiltro && (
        <div style={{ marginTop: 7, fontSize: 12, color: colors.ink, background: colors.brandSoft,
          borderRadius: 7, padding: "7px 10px" }}>
          <strong>{cuantos}</strong> {cuantos === 1 ? etiqueta.replace(/s$/, "") : etiqueta} ·{" "}
          <strong>${Number(total || 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
        </div>
      )}
    </div>
  );
}
