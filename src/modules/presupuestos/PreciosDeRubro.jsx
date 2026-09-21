import { useState, useMemo } from "react";
import { X, Loader2, Database, Search } from "lucide-react";
import Modal from "../../components/ui/Modal";
import { colors } from "../../theme/colors";
import { parecidosA } from "../../lib/buscarRubros";
import { normalizarUnidad, etiquetaUnidad } from "../../lib/unidades";
import ResultadosBase from "./ResultadosBase";

// Los precios que la base de rubros conoce para un rubro del presupuesto.
//
// El precio base del presupuesto no se mueve solo: queda como está hasta que
// alguien elige uno de estos y lo usa. La utilidad del rubro se conserva y el
// precio final se recalcula con ella.
//
// Un rubro casi nunca está escrito igual en dos presupuestos, así que además
// del rubro idéntico se muestran los parecidos de la base —"Pintura de caucho
// en paredes" y "Pintura caucho interior"— y se puede buscar cualquier otro
// rubro a mano.

const fmt = n => (Number(n) || 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PreciosDeRubro({ item, base, onElegir, onCerrar }) {
  const rubro = base?.buscar(item) || null;
  const precios = rubro?.precios || [];
  const actual = Number(item.precio_base) > 0 ? Number(item.precio_base) : Number(item.precio_unitario) || 0;
  const pct = Number(item.utilidad_pct) || 0;
  const [busqueda, setBusqueda] = useState("");
  const miUnidad = normalizarUnidad(item.unidad).canon;
  const parecidos = useMemo(() => parecidosA(item, (base?.todos || []).filter(r => r.id !== rubro?.id), {
    mismaUnidad: r => !miUnidad || normalizarUnidad(r.unidad).canon === miUnidad,
  }), [item, base, rubro, miUnidad]);

  return (
    <Modal onClose={onCerrar} maxWidth={560}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: colors.ink, display: "flex", alignItems: "center", gap: 7 }}><Database size={15} /> Precios en la base</div>
          <div style={{ fontSize: 12, color: colors.inkSoft, marginTop: 3, overflowWrap: "anywhere" }}>{item.descripcion} · {item.unidad || "sin unidad"}</div>
        </div>
        <button onClick={onCerrar} style={{ marginLeft: "auto", background: "none", border: "none", color: colors.muted, cursor: "pointer", display: "flex" }}><X size={18} /></button>
      </div>

      <div style={{ fontSize: 12, color: colors.inkSoft, background: colors.bg, borderRadius: colors.radiusSm, padding: "8px 10px", marginBottom: 12 }}>
        Precio base actual: <strong style={{ color: colors.ink }}>{actual ? `$${fmt(actual)}` : "sin precio"}</strong>
        {pct !== 0 && <> · utilidad {pct} %</>}
        <div style={{ color: colors.muted, marginTop: 2 }}>No cambia hasta que elijas uno de abajo.</div>
      </div>

      {!base ? (
        <div style={{ padding: "30px 0", textAlign: "center", color: colors.muted, fontSize: 13 }}><Loader2 size={15} /> Leyendo la base de rubros…</div>
      ) : base.error ? (
        <div style={{ padding: "18px 0", textAlign: "center", color: colors.danger, fontSize: 13 }}>
          No se pudo leer la base de rubros: {base.error}
        </div>
      ) : !precios.length ? (
        <div style={{ padding: "16px 0", textAlign: "center", color: colors.muted, fontSize: 13 }}>
          Este rubro, escrito así, todavía no tiene precios en la base.
        </div>
      ) : (
        <div style={{ border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, maxHeight: 360, overflowY: "auto" }}>
          {precios.map((p, i) => {
            const valor = Number(p.precio_unitario);
            const dif = actual ? (valor / actual - 1) * 100 : null;
            const quien = p.proveedor_nombre || p.cliente_nombre || p.proyecto_ref || "Sin origen";
            const tipo = p.origen_tipo === "proveedor" ? "proveedor" : p.origen_tipo === "cliente" ? "cliente" : "";
            const igual = actual && Math.abs(valor - actual) < 0.005;
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderBottom: `1px solid ${colors.neutralSoft}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: colors.ink }}>
                    ${fmt(valor)}
                    {dif != null && !igual && (
                      <span style={{ fontSize: 11, fontWeight: 600, marginLeft: 8, color: dif > 0 ? colors.danger : colors.success }}>{dif > 0 ? "+" : ""}{dif.toFixed(1)} %</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: colors.inkSoft, overflowWrap: "anywhere" }}>
                    {quien}{tipo && <span style={{ color: colors.muted }}> · {tipo}</span>}{p.fecha && <span style={{ color: colors.muted }}> · {p.fecha}</span>}
                  </div>
                  {p.proyecto_ref && p.proyecto_ref !== quien && <div style={{ fontSize: 10, color: colors.muted }}>{p.proyecto_ref}</div>}
                </div>
                {igual ? (
                  <span style={{ fontSize: 11, color: colors.muted }}>Es el actual</span>
                ) : (
                  <button onClick={() => onElegir(valor)}
                    title={pct ? `Con tu utilidad del ${pct} %, el precio final queda en $${fmt(valor * (1 + pct / 100))}` : "Usar como precio base"}
                    style={{ background: colors.ink, color: "#fff", border: "none", borderRadius: colors.radiusSm, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: colors.font, flexShrink: 0 }}>
                    Usar
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Rubros parecidos: el mismo trabajo escrito de otra forma. */}
      {base && !base.error && parecidos.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: colors.ink }}>Rubros parecidos en la base</div>
          <div style={{ fontSize: 11, color: colors.muted, marginBottom: 6 }}>El mismo trabajo escrito de otra forma. Revisa la unidad antes de usar el precio.</div>
          <div style={{ border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, maxHeight: 240, overflowY: "auto" }}>
            {parecidos.map(r => {
              const valor = r.precios?.[0] ? Number(r.precios[0].precio_unitario) : Number(r.precio_referencia) || 0;
              const otraUnidad = miUnidad && normalizarUnidad(r.unidad).canon !== miUnidad;
              return (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderBottom: `1px solid ${colors.neutralSoft}` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, color: colors.ink, overflowWrap: "anywhere" }}>{r.descripcion}</div>
                    <div style={{ fontSize: 10.5, color: otraUnidad ? colors.warning : colors.muted }}>
                      {etiquetaUnidad(r.unidad) || "sin unidad"}{otraUnidad && " · otra unidad"} · se parece {r.parecido} %
                    </div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: colors.ink, whiteSpace: "nowrap" }}>${fmt(valor)}</div>
                  <button onClick={() => onElegir(valor)} disabled={!valor}
                    title={otraUnidad ? "Ojo: está en otra unidad" : "Usar este precio como precio base"}
                    style={{ background: valor ? colors.ink : colors.neutralSoft, color: valor ? "#fff" : colors.muted, border: "none", borderRadius: colors.radiusSm, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: valor ? "pointer" : "default", fontFamily: colors.font, flexShrink: 0 }}>
                    Usar
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Buscar cualquier otro rubro de la base. */}
      {base && !base.error && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
            <Search size={13} color={colors.muted} />
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar otro rubro en la base por nombre"
              style={{ flex: 1, minWidth: 0, background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 8, padding: "7px 10px", fontSize: 12.5, fontFamily: colors.font, color: colors.ink, outline: "none" }} />
          </div>
          {busqueda.trim() && (
            <ResultadosBase base={base} texto={busqueda} alto={260} accion="Usar" titulo="Usar este precio como precio base"
              onAgregar={(r, precio) => onElegir(precio)} />
          )}
        </div>
      )}
    </Modal>
  );
}
