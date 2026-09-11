import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import { inputStyle } from "../../components/ui/Input";

// Quien carga el gasto elige la actividad, igual que al planillar. No ve
// plata: ni el presupuesto de la actividad, ni su saldo, ni su avance. Un
// gasto puede tocar varias actividades, incluso de capítulos distintos.
export default function SelectorActividad({ obraId, seleccion, onChange, montoTotal }) {
  const [actividades, setActividades] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!obraId) { setActividades([]); setCargando(false); return; }
    (async () => {
      setCargando(true);
      const { data } = await supabase.from("obra_actividades")
        .select("id,codigo,nombre")           // sin montos, a propósito
        .eq("obra_id", obraId).order("orden");
      setActividades(data || []);
      setCargando(false);
    })();
  }, [obraId]);

  if (!obraId) return null;

  const disponibles = actividades.filter(a => !seleccion.some(s => s.obra_actividad_id === a.id));

  function agregar(id) {
    const usado = seleccion.reduce((s, x) => s + (Number(x.monto) || 0), 0);
    const restante = Math.max((Number(montoTotal) || 0) - usado, 0);
    onChange([...seleccion, { obra_actividad_id: id, monto: seleccion.length === 0 ? (Number(montoTotal) || 0) : restante }]);
  }

  const asignado = seleccion.reduce((s, x) => s + (Number(x.monto) || 0), 0);
  const diferencia = Math.round(((Number(montoTotal) || 0) - asignado) * 100) / 100;
  const varios = seleccion.length > 1;

  return (
    <div>
      <label style={{ fontSize: 11, color: "var(--ink-soft)", fontWeight: 500, display: "block", marginBottom: 4 }}>
        ¿A qué actividad de la obra corresponde?
      </label>

      {seleccion.map((s, i) => {
        const a = actividades.find(x => x.id === s.obra_actividad_id);
        return (
          <div key={s.obra_actividad_id} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--bg)", borderRadius: 8, padding: "8px 10px", marginBottom: 6 }}>
            <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <span style={{ color: "var(--muted)", marginRight: 5 }}>{a?.codigo}</span>{a?.nombre || "Actividad"}
            </div>
            {varios && (
              <input type="number" value={s.monto}
                onChange={e => onChange(seleccion.map((x, j) => j === i ? { ...x, monto: e.target.value } : x))}
                style={{ ...inputStyle, width: 100, padding: "6px 8px", fontSize: 12, textAlign: "right" }} />
            )}
            <button onClick={() => onChange(seleccion.filter((_, j) => j !== i))}
              style={{ background: "var(--danger-soft)", border: "none", borderRadius: 6, padding: "5px 7px", color: "var(--danger)", cursor: "pointer", display: "flex" }}>
              <X size={12} />
            </button>
          </div>
        );
      })}

      {varios && (
        <div style={{ fontSize: 11, marginBottom: 6, color: diferencia === 0 ? colors.success : colors.warning, fontWeight: 600 }}>
          {diferencia === 0 ? "El reparto cuadra con el monto" : `Faltan $${diferencia.toFixed(2)} por repartir`}
        </div>
      )}

      <select value="" disabled={cargando || !disponibles.length} onChange={e => agregar(Number(e.target.value))} style={inputStyle}>
        <option value="">
          {cargando ? "Cargando actividades..."
            : !actividades.length ? "Esta obra todavía no tiene actividades"
            : !disponibles.length ? "Ya asignaste todas las actividades"
            : "Elegir una actividad..."}
        </option>
        {disponibles.map(a => <option key={a.id} value={a.id}>{a.codigo} · {a.nombre}</option>)}
      </select>

      {seleccion.length === 0 && (
        <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
          Si no lo sabes, déjalo vacío: el gasto queda "por asignar" y alguien lo clasifica después.
        </div>
      )}
    </div>
  );
}
