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

const fmt = n => (Number(n) || 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
                  {etiquetaUnidad(r.unidad) || "sin unidad"}{precios.length ? ` · ${precios.length} ${precios.length === 1 ? "precio" : "precios"} en la base` : " · sin historial"}
                </div>
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
                {precios.slice(0, 8).map((p, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 11.5, color: colors.inkSoft }}>
                    <span style={{ fontWeight: 700, color: colors.ink, minWidth: 74 }}>${fmt(p.precio_unitario)}</span>
                    <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
                      {p.proveedor_nombre || p.cliente_nombre || p.proyecto_ref || "Sin origen"}{p.fecha && <span style={{ color: colors.muted }}> · {p.fecha}</span>}
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
