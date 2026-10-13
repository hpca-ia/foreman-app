import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import { inputStyle } from "../../components/ui/Input";

// Contra qué va un gasto de caja chica.
//
// UN GASTO DE CAJA CHICA TAMBIÉN ES UNA COMPRA, solo que ya aprobada: no pasa
// por el visto porque el monto es chico y el responsable ya tiene la plata en
// la mano. Pero descuenta del control igual que una factura, así que tiene que
// poder apuntar al mismo lugar.
//
// Antes solo dejaba elegir AGRUPACIÓN, y eso prorratea entre todos sus rubros:
// la compra de un galón de pintura terminaba repartida entre los quince rubros
// del capítulo, sumando centavos en catorce renglones que no la tuvieron. Ahora
// se puede elegir el rubro exacto, que es lo que uno sabe cuando acaba de
// comprar algo.
//
// No ve plata: ni el presupuesto de la actividad, ni su saldo, ni su avance.
// Quien carga un gasto no tiene por qué ver el presupuesto de la obra. Y si se
// eligió mal, se corrige después en el control —el gasto entra ahí como una
// factura más—, que es la red que hace que esto no tenga que ser perfecto al
// primer intento.
export default function SelectorActividad({ obraId, seleccion, onChange, montoTotal }) {
  const [actividades, setActividades] = useState([]);
  const [rubros, setRubros] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!obraId) { setActividades([]); setCargando(false); return; }
    (async () => {
      setCargando(true);
      const [{ data }, { data: rs }] = await Promise.all([
        supabase.from("obra_actividades")
          .select("id,codigo,nombre")           // sin montos, a propósito
          .eq("obra_id", obraId).order("orden"),
        supabase.from("obra_rubros")
          .select("id,numero,descripcion,capitulo,capitulo_orden,orden,actividad_id,oculto,anulado_por_oc")
          .eq("obra_id", obraId).order("capitulo_orden").order("orden"),
      ]);
      setActividades(data || []);
      setRubros((rs || []).filter(r => !r.oculto && !r.anulado_por_oc));
      setCargando(false);
    })();
  }, [obraId]);

  if (!obraId) return null;

  const disponibles = actividades.filter(a => !seleccion.some(s => s.obra_actividad_id === a.id));
  const rubrosLibres = rubros.filter(r => !seleccion.some(s => s.obra_rubro_id === r.id));

  function agregarRubro(id) {
    const n = Number(id);
    if (!n) return;
    const dado = seleccion.reduce((t, s) => t + (Number(s.monto) || 0), 0);
    const restante = Math.max((Number(montoTotal) || 0) - dado, 0);
    onChange([...seleccion, { obra_rubro_id: n, monto: seleccion.length === 0 ? (Number(montoTotal) || 0) : restante }]);
  }

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
        ¿Contra qué va este gasto?
      </label>

      {seleccion.map((s, i) => {
        const a = actividades.find(x => x.id === s.obra_actividad_id);
        const r = rubros.find(x => x.id === s.obra_rubro_id);
        return (
          <div key={s.obra_rubro_id ? `r${s.obra_rubro_id}` : `a${s.obra_actividad_id}`} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--bg)", borderRadius: 8, padding: "8px 10px", marginBottom: 6 }}>
            <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {r ? (
                <>
                  <span style={{ color: "var(--muted)", marginRight: 5 }}>rubro {r.numero}</span>{r.descripcion}
                </>
              ) : (
                <>
                  <span style={{ color: "var(--muted)", marginRight: 5 }}>{a?.codigo}</span>{a?.nombre || "Agrupación"}
                  <span style={{ color: "var(--muted)", fontSize: 10.5 }}> · se reparte entre sus rubros</span>
                </>
              )}
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

      {/* EL RUBRO EXACTO PRIMERO, la agrupación después.
          Quien acaba de comprar un galón de pintura sabe para qué era. Si lo
          único que se le ofrece es la agrupación, su gasto se reparte entre los
          quince rubros del capítulo y suma centavos en catorce renglones que no
          lo tuvieron. Lo exacto tiene que ser lo fácil. */}
      <select value="" disabled={cargando || !rubrosLibres.length}
        onChange={e => agregarRubro(e.target.value)} style={{ ...inputStyle, marginBottom: 6 }}>
        <option value="">
          {cargando ? "Cargando rubros..."
            : !rubros.length ? "Esta obra todavía no tiene rubros"
            : "Elegir el rubro exacto…"}
        </option>
        {rubrosLibres.map(r => (
          <option key={r.id} value={r.id}>{r.capitulo} · {r.numero} {r.descripcion}</option>
        ))}
      </select>

      <select value="" disabled={cargando || !disponibles.length} onChange={e => agregar(Number(e.target.value))} style={inputStyle}>
        <option value="">
          {cargando ? "Cargando agrupaciones..."
            : !actividades.length ? "Esta obra todavía no tiene agrupaciones"
            : !disponibles.length ? "Ya asignaste todas las agrupaciones"
            : "…o una agrupación entera, que se reparte entre sus rubros"}
        </option>
        {disponibles.map(a => <option key={a.id} value={a.id}>{a.codigo} · {a.nombre}</option>)}
      </select>

      {seleccion.length === 0 && (
        <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
          Si no lo sabes, déjalo vacío: el gasto queda "por asignar" y alguien lo clasifica después en el
          control de obra, donde entra como una factura más.
        </div>
      )}
    </div>
  );
}
