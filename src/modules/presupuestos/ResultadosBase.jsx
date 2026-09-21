import { useState, useMemo } from "react";
import { Loader2, Plus, ChevronDown, ChevronRight } from "lucide-react";
import { colors } from "../../theme/colors";
import { buscarRubros } from "../../lib/buscarRubros";
import { etiquetaUnidad } from "../../lib/unidades";

// Los rubros de la base de rubros que responden a lo que se está buscando,
// listos para agregarse al presupuesto.
//
// Cada rubro trae su precio de referencia y los precios que ya se pagaron,
// el más reciente primero: se agrega con el que uno elija, no siempre con el
// mismo. La búsqueda es la de FOREMAN —por partes del nombre, sin tildes—,
// sobre la base ya leída; antes se consultaba al servidor por cada tecla.

const n = v => Number(v) || 0;
const fmt = n => (Number(n) || 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// De quién es el precio: el proveedor que lo cotizó, el cliente al que se le
// vendió, o la obra donde se pagó. Sin eso, un precio es solo un número.
export const origenDe = p => p?.proveedor_nombre || p?.cliente_nombre || p?.proyecto_ref || "sin origen";
export const cuando = f => {
  const t = String(f || "").slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(t)) return "";
  const [a, m] = t.split("-");
  return `${["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][Number(m) - 1]} ${a}`;
};

export default function ResultadosBase({ base, texto, onAgregar, alto = 320, limite = 40, accion = "Agregar", titulo = "Agregar al presupuesto con este precio" }) {
  const [abierto, setAbierto] = useState(null);
  const encontrados = useMemo(() => buscarRubros(base?.todos || [], texto, { limite }), [base, texto, limite]);

  if (!base) return <Aviso><Loader2 size={14} /> Leyendo la base de rubros…</Aviso>;
  if (base.error) return <Aviso color={colors.danger}>No se pudo leer la base de rubros: {base.error}</Aviso>;
  if (!String(texto || "").trim()) return <Aviso>Escribe parte del nombre del rubro. Por ejemplo "encofrado losa".</Aviso>;
  if (!encontrados.length) return (
    <Aviso>
      Ningún rubro de la base se parece a "{texto}".
      {base.todos?.length ? <div style={{ fontSize: 11, marginTop: 4 }}>La base tiene {base.todos.length} rubros.</div>
        : <div style={{ fontSize: 11, marginTop: 4, color: colors.danger }}>La base de rubros está vacía.</div>}
    </Aviso>
  );

  return (
    <div style={{ border: `1px solid ${colors.border}`, borderRadius: 8, maxHeight: alto, overflowY: "auto", background: "#fff" }}>
      {encontrados.map(r => {
        const precios = r.precios || [];
        const ultimo = precios[0] ? Number(precios[0].precio_unitario) : Number(r.precio_referencia) || 0;
        const abierta = abierto === r.id;
        return (
          <div key={r.id} style={{ borderBottom: `1px solid ${colors.neutralSoft}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px" }}>
              <button onClick={() => setAbierto(abierta ? null : r.id)} title={precios.length ? "Ver los precios que ya se pagaron" : "Sin precios en el historial"}
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: colors.muted, display: "flex", flexShrink: 0 }}>
                {abierta ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, color: colors.ink, overflowWrap: "anywhere" }}>{r.descripcion}</div>
                <div style={{ fontSize: 10.5, color: colors.muted }}>
                  {etiquetaUnidad(r.unidad) || "sin unidad"}
                  {precios.length
                    ? ` · ${precios.length} ${precios.length === 1 ? "precio" : "precios"}${precios.length > 1 ? ` de $${fmt(Math.min(...precios.map(p => n(p.precio_unitario))))} a $${fmt(Math.max(...precios.map(p => n(p.precio_unitario))))}` : ""}`
                    : ` · sin historial · referencia $${fmt(r.precio_referencia)}`}
                </div>
                {/* Cada precio con su cliente o proveedor, a la vista: se agrega
                    con el que corresponda sin tener que abrir nada. */}
                {precios.length > 0 && (
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 4 }}>
                    {precios.slice(0, abierta ? precios.length : 3).map((p, i) => (
                      <button key={i} onClick={() => onAgregar(r, n(p.precio_unitario))} title={`${titulo}: $${fmt(p.precio_unitario)} de ${origenDe(p)}${p.fecha ? ` (${p.fecha})` : ""}`}
                        style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 12, padding: "2px 8px", fontSize: 10.5, color: colors.inkSoft, cursor: "pointer", fontFamily: colors.font, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <strong style={{ color: colors.ink }}>${fmt(p.precio_unitario)}</strong> · {origenDe(p)}{cuando(p.fecha) && ` · ${cuando(p.fecha)}`}
                      </button>
                    ))}
                    {precios.length > 3 && !abierta && (
                      <button onClick={() => setAbierto(r.id)} style={{ background: "none", border: "none", fontSize: 10.5, color: colors.muted, cursor: "pointer", fontFamily: colors.font, textDecoration: "underline" }}>
                        y {precios.length - 3} más
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: colors.ink, whiteSpace: "nowrap" }}>${fmt(ultimo)}</div>
              <button onClick={() => onAgregar(r, ultimo)} title={titulo}
                style={{ background: colors.ink, color: "#fff", border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: colors.font, display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                {accion === "Agregar" && <Plus size={12} />} {accion}
              </button>
            </div>
            {abierta && (
              <div style={{ background: colors.bg, padding: "8px 10px 10px 32px", borderTop: `1px solid ${colors.neutralSoft}` }}>
                {!precios.length && <div style={{ fontSize: 11, color: colors.muted }}>Este rubro todavía no tiene precios pagados. Su referencia es ${fmt(r.precio_referencia)}.</div>}
                {precios.map((p, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 11.5, color: colors.inkSoft }}>
                    <span style={{ fontWeight: 700, color: colors.ink, minWidth: 74 }}>${fmt(p.precio_unitario)}</span>
                    <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
                      {origenDe(p)}{p.origen_tipo && <span style={{ color: colors.muted }}> · {p.origen_tipo}</span>}{p.fecha && <span style={{ color: colors.muted }}> · {p.fecha}</span>}
                      {p.proyecto_ref && p.proyecto_ref !== origenDe(p) && <span style={{ color: colors.muted }}> · {p.proyecto_ref}</span>}
                    </span>
                    <button onClick={() => onAgregar(r, Number(p.precio_unitario))}
                      style={{ background: "#fff", border: `1px solid ${colors.border}`, borderRadius: 6, padding: "3px 8px", fontSize: 11, cursor: "pointer", color: colors.ink, fontFamily: colors.font, flexShrink: 0 }}>
                      {accion} con este
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Aviso({ children, color }) {
  return <div style={{ padding: "18px 12px", textAlign: "center", color: color || colors.muted, fontSize: 12.5, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>{children}</div>;
}
