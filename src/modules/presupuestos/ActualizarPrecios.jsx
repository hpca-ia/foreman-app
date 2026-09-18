import { useState, useEffect, useMemo } from "react";
import { X, Loader2, Database } from "lucide-react";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import { colors } from "../../theme/colors";
import { preciosDeLaBase } from "../../lib/baseRubros";

// Traer a un presupuesto los precios que ya conoce la oficina.
//
// Un presupuesto se arma con precios de un momento; la base de rubros sigue
// aprendiendo con cada cotización y cada obra. Esto compara rubro por rubro y
// deja elegir cuáles actualizar: la base cambia, la utilidad se conserva y el
// precio final se recalcula. De paso llena los rubros que todavía no tenían
// precio.

const fmt = n => (Number(n) || 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const CRITERIOS = { ultimo: "El último", promedio: "El promedio", minimo: "El más bajo" };
const ORIGENES = { todos: "Todos", proveedor: "Proveedores", cliente: "Clientes" };

export default function ActualizarPrecios({ items, onCerrar, onAplicar }) {
  const [base, setBase] = useState(null);
  const [error, setError] = useState("");
  const [criterio, setCriterio] = useState("ultimo");
  const [origen, setOrigen] = useState("todos");
  const [quitados, setQuitados] = useState(new Set());     // lo que se desmarca; lo demás va
  const [aplicando, setAplicando] = useState(false);

  useEffect(() => {
    preciosDeLaBase().then(setBase).catch(e => setError("No se pudo leer la base de rubros: " + e.message));
  }, []);

  const filas = useMemo(() => {
    if (!base) return { cambios: [], iguales: 0, sinDatos: 0 };
    const cambios = []; let iguales = 0, sinDatos = 0;
    items.forEach(item => {
      const r = base.buscar(item);
      const precios = (r?.precios || []).filter(p => origen === "todos" || p.origen_tipo === origen);
      if (!precios.length) { sinDatos++; return; }
      const valores = precios.map(p => Number(p.precio_unitario));
      let valor, fuente;
      if (criterio === "promedio") {
        valor = valores.reduce((s, v) => s + v, 0) / valores.length;
        fuente = `${valores.length} ${valores.length === 1 ? "precio" : "precios"}, el último del ${precios[0].fecha || "—"}`;
      } else {
        const p = criterio === "minimo" ? precios.reduce((m, x) => (Number(x.precio_unitario) < Number(m.precio_unitario) ? x : m)) : precios[0];
        valor = Number(p.precio_unitario);
        fuente = [p.proveedor_nombre || p.cliente_nombre || p.proyecto_ref, p.fecha].filter(Boolean).join(" · ") || "—";
      }
      valor = Math.round(valor * 100) / 100;
      const actual = Number(item.precio_base) > 0 ? Number(item.precio_base) : Number(item.precio_unitario) || 0;
      if (actual && Math.abs(valor - actual) < 0.005) { iguales++; return; }
      cambios.push({ item, actual, valor, dif: actual ? (valor / actual - 1) * 100 : null, fuente });
    });
    return { cambios, iguales, sinDatos };
  }, [base, items, criterio, origen]);

  const elegidos = filas.cambios.filter(f => !quitados.has(f.item.id));
  const todosMarcados = elegidos.length === filas.cambios.length;
  const alternar = id => setQuitados(q => { const n = new Set(q); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const alternarTodos = () => setQuitados(todosMarcados ? new Set(filas.cambios.map(f => f.item.id)) : new Set());

  async function aplicar() {
    setAplicando(true);
    await onAplicar(elegidos.map(f => ({ id: f.item.id, precio_base: f.valor })));
    setAplicando(false);
  }

  const segmento = (valor, set, opciones) => (
    <div style={{ display: "inline-flex", gap: 3, background: colors.neutralSoft, borderRadius: colors.radiusSm, padding: 3 }}>
      {Object.entries(opciones).map(([id, l]) => (
        <button key={id} onClick={() => set(id)}
          style={{ padding: "5px 11px", borderRadius: 6, border: "none", cursor: "pointer", fontFamily: colors.font, fontSize: 12, fontWeight: 600,
            background: valor === id ? colors.surface : "transparent", color: valor === id ? colors.ink : colors.inkSoft }}>{l}</button>
      ))}
    </div>
  );
  const celda = { padding: "6px 8px", borderBottom: `1px solid ${colors.neutralSoft}`, fontSize: 12 };
  const etiqueta = { fontSize: 10, color: colors.muted, fontWeight: 600, letterSpacing: 0.4, marginBottom: 5 };

  return (
    <Modal onClose={onCerrar} maxWidth={920}>
      <div style={{ display: "flex", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: colors.ink, display: "flex", alignItems: "center", gap: 7 }}><Database size={16} /> Precios de la base de rubros</div>
          <div style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>Compara el precio base de cada rubro con lo que ya sabe la oficina. Se conserva la utilidad y el precio final se recalcula.</div>
        </div>
        <button onClick={onCerrar} style={{ marginLeft: "auto", background: "none", border: "none", color: colors.muted, cursor: "pointer", display: "flex" }}><X size={18} /></button>
      </div>

      {error && <div style={{ color: colors.danger, fontSize: 12, marginBottom: 10 }}>{error}</div>}

      {!base && !error ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: colors.muted, fontSize: 13 }}><Loader2 size={16} /> Leyendo la base de rubros…</div>
      ) : base && (
        <>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 12 }}>
            <div><div style={etiqueta}>QUÉ PRECIO TOMAR</div>{segmento(criterio, setCriterio, CRITERIOS)}</div>
            <div><div style={etiqueta}>DE DÓNDE</div>{segmento(origen, setOrigen, ORIGENES)}</div>
          </div>

          <div style={{ fontSize: 12, color: colors.inkSoft, marginBottom: 10 }}>
            <strong style={{ color: colors.ink }}>{filas.cambios.length}</strong> {filas.cambios.length === 1 ? "rubro tiene" : "rubros tienen"} otro precio en la base
            {filas.iguales > 0 && <> · {filas.iguales} ya coinciden</>}
            {filas.sinDatos > 0 && <> · {filas.sinDatos} no están en la base{origen !== "todos" ? " con ese origen" : ""}</>}
          </div>

          {filas.cambios.length > 0 && (
            <div className="pres-tabla" style={{ border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, maxHeight: 420, overflowY: "auto" }}>
              <table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse", tableLayout: "fixed" }}>
                <colgroup><col style={{ width: 34 }} /><col /><col style={{ width: 56 }} /><col style={{ width: 100 }} /><col style={{ width: 100 }} /><col style={{ width: 72 }} /><col style={{ width: 190 }} /></colgroup>
                <thead>
                  <tr style={{ background: colors.bg, position: "sticky", top: 0 }}>
                    <th style={celda}><input type="checkbox" checked={todosMarcados} onChange={alternarTodos} /></th>
                    {[["Rubro", "left"], ["Und", "left"], ["Base actual", "right"], ["En la base", "right"], ["Dif.", "right"], ["Fuente", "left"]].map(([h, al]) => (
                      <th key={h} style={{ ...celda, textAlign: al, fontSize: 10, color: colors.inkSoft, fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filas.cambios.map(f => {
                    const marcado = !quitados.has(f.item.id);
                    return (
                      <tr key={f.item.id} onClick={() => alternar(f.item.id)} style={{ cursor: "pointer", opacity: marcado ? 1 : 0.55 }}>
                        <td style={celda}><input type="checkbox" checked={marcado} onChange={() => alternar(f.item.id)} onClick={e => e.stopPropagation()} /></td>
                        <td style={{ ...celda, overflowWrap: "anywhere" }}>
                          <div style={{ color: colors.ink }}>{f.item.descripcion}</div>
                          <div style={{ fontSize: 10, color: colors.muted }}>{f.item.capitulo}</div>
                        </td>
                        <td style={{ ...celda, color: colors.inkSoft }}>{f.item.unidad}</td>
                        <td style={{ ...celda, textAlign: "right", color: colors.muted }}>{f.actual ? `$${fmt(f.actual)}` : "sin precio"}</td>
                        <td style={{ ...celda, textAlign: "right", fontWeight: 600, color: colors.ink }}>${fmt(f.valor)}</td>
                        <td style={{ ...celda, textAlign: "right", fontWeight: 600, color: f.dif == null ? colors.muted : f.dif > 0 ? colors.danger : colors.success }}>
                          {f.dif == null ? "—" : `${f.dif > 0 ? "+" : ""}${f.dif.toFixed(1)}%`}
                        </td>
                        <td style={{ ...celda, fontSize: 11, color: colors.inkSoft, overflowWrap: "anywhere" }}>{f.fuente}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
        <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
        <Button variant="primary" onClick={aplicar} disabled={!elegidos.length || aplicando} style={{ background: colors.ink }}>
          {aplicando ? "Actualizando…" : `Actualizar ${elegidos.length} ${elegidos.length === 1 ? "precio base" : "precios base"}`}
        </Button>
      </div>
    </Modal>
  );
}
