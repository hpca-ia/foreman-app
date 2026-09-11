import { useState, useEffect } from "react";
import { Search, X } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import { inputStyle } from "../../components/ui/Input";

// Quien carga el gasto elige a qué rubro va, pero NO ve plata: ni el
// presupuesto del rubro, ni su saldo, ni el avance. Solo el nombre.
export default function SelectorRubros({ obraId, seleccion, onChange, montoTotal }) {
  const [rubros, setRubros] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!obraId) { setRubros([]); setCargando(false); return; }
    (async () => {
      setCargando(true);
      const { data } = await supabase.from("obra_rubros")
        .select("id,numero,descripcion,capitulo,actividad")   // sin montos, a propósito
        .eq("obra_id", obraId).order("capitulo_orden").order("orden");
      setRubros(data || []);
      setCargando(false);
    })();
  }, [obraId]);

  if (!obraId) return null;

  const elegidos = seleccion.map(s => rubros.find(r => r.id === s.obra_rubro_id)).filter(Boolean);
  const coincidencias = busqueda.trim()
    ? rubros.filter(r =>
        !seleccion.some(s => s.obra_rubro_id === r.id) &&
        (r.descripcion.toLowerCase().includes(busqueda.toLowerCase()) ||
         (r.actividad || "").toLowerCase().includes(busqueda.toLowerCase()) ||
         String(r.numero) === busqueda.trim())
      ).slice(0, 8)
    : [];

  function agregar(rubro) {
    const usado = seleccion.reduce((s, x) => s + (Number(x.monto) || 0), 0);
    const restante = Math.max((Number(montoTotal) || 0) - usado, 0);
    onChange([...seleccion, { obra_rubro_id: rubro.id, monto: seleccion.length === 0 ? (Number(montoTotal) || 0) : restante }]);
    setBusqueda("");
  }

  const asignado = seleccion.reduce((s, x) => s + (Number(x.monto) || 0), 0);
  const diferencia = Math.round(((Number(montoTotal) || 0) - asignado) * 100) / 100;
  const varios = seleccion.length > 1;

  return (
    <div>
      <label style={{ fontSize: 11, color: "var(--ink-soft)", fontWeight: 500, display: "block", marginBottom: 4 }}>
        ¿A qué rubro corresponde?
      </label>

      {elegidos.map((r, i) => (
        <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--bg)", borderRadius: 8, padding: "8px 10px", marginBottom: 6 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <span style={{ color: "var(--muted)", marginRight: 5 }}>{r.numero}</span>{r.descripcion}
            </div>
            <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 1 }}>{r.actividad || r.capitulo}</div>
          </div>
          {varios && (
            <input type="number" value={seleccion[i].monto}
              onChange={e => onChange(seleccion.map((s, j) => j === i ? { ...s, monto: e.target.value } : s))}
              style={{ ...inputStyle, width: 100, padding: "6px 8px", fontSize: 12, textAlign: "right" }} />
          )}
          <button onClick={() => onChange(seleccion.filter((_, j) => j !== i))}
            style={{ background: "var(--danger-soft)", border: "none", borderRadius: 6, padding: "5px 7px", color: "var(--danger)", cursor: "pointer", display: "flex" }}>
            <X size={12} />
          </button>
        </div>
      ))}

      {varios && (
        <div style={{ fontSize: 11, marginBottom: 6, color: diferencia === 0 ? colors.success : colors.warning, fontWeight: 600 }}>
          {diferencia === 0 ? "El reparto cuadra con el monto" : `Faltan $${diferencia.toFixed(2)} por repartir`}
        </div>
      )}

      <div style={{ position: "relative" }}>
        <Search size={13} color="var(--muted)" style={{ position: "absolute", left: 10, top: 11 }} />
        <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
          placeholder={cargando ? "Cargando rubros..." : "Buscar el rubro por nombre o número..."}
          disabled={cargando}
          style={{ ...inputStyle, paddingLeft: 30 }} />
      </div>

      {coincidencias.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 8, marginTop: 4, maxHeight: 180, overflowY: "auto" }}>
          {coincidencias.map(r => (
            <div key={r.id} onClick={() => agregar(r)}
              style={{ padding: "8px 10px", fontSize: 12, cursor: "pointer", borderBottom: "1px solid var(--neutral-soft)" }}>
              <div style={{ color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <span style={{ color: "var(--muted)", marginRight: 5 }}>{r.numero}</span>{r.descripcion}
              </div>
              <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 1 }}>{r.actividad || r.capitulo}</div>
            </div>
          ))}
        </div>
      )}

      {seleccion.length === 0 && !busqueda && (
        <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
          Si no lo sabes, déjalo vacío: el gasto queda "por asignar" y alguien lo clasifica después.
        </div>
      )}
    </div>
  );
}
