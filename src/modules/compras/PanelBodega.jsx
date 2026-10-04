import { useEffect, useState, useCallback } from "react";
import { Plus, X, PackageCheck, AlertTriangle } from "lucide-react";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import { ingresosDe, registrarIngreso, borrarIngreso, cuadre, vaABodega } from "./bodega";

// El ingreso a bodega de un pedido: qué llegó, cuánto, y contra qué papel.
//
// Arranca con una línea por lo que se pidió —la descripción del pedido— y se
// agregan las que hagan falta: una compra de "material eléctrico" llega como
// ocho cosas distintas, y contarlas de a una es el punto.
//
// La cantidad esperada se escribe también. Sin ella no hay contra qué comparar
// y el ingreso vuelve a ser un visto bueno.

const VACIO = () => ({ descripcion: "", unidad: "", cantidad_esperada: "", cantidad_recibida: "", precio_unitario: "", nota: "" });

export default function PanelBodega({ solicitud, rubros = [], currentUser, onCambio }) {
  const [ingresos, setIngresos] = useState([]);
  const [items, setItems] = useState({});
  const [sinTablas, setSinTablas] = useState(false);
  const [abriendo, setAbriendo] = useState(false);
  const [cab, setCab] = useState({ fecha: "", documento: "", nota: "", completo: false });
  const [lineas, setLineas] = useState([]);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    if (!solicitud?.id) return;
    const r = await ingresosDe(solicitud.id);
    setIngresos(r.ingresos); setItems(r.items); setSinTablas(r.sinTablas);
  }, [solicitud?.id]);
  useEffect(() => { cargar(); }, [cargar]);

  if (!solicitud?.id) return null;

  if (!vaABodega(solicitud)) {
    return (
      <div style={{ fontSize: 11, color: colors.muted, background: colors.bg, borderRadius: 8, padding: "9px 10px" }}>
        Es un servicio: no entra a bodega. Se marca recibido cuando esté hecho.
      </div>
    );
  }
  if (sinTablas) {
    return (
      <div style={{ fontSize: 11.5, color: colors.warning }}>Falta correr la migración 068 para usar bodega.</div>
    );
  }

  function abrir() {
    setCab({ fecha: new Date().toISOString().slice(0, 10), documento: solicitud.proveedor || "", nota: "", completo: true });
    // La primera línea es lo que se pidió: casi siempre es la única.
    setLineas([{ ...VACIO(), descripcion: solicitud.descripcion || "", obra_rubro_id: solicitud.obra_rubro_id || "" }]);
    setAbriendo(true); setError("");
  }

  async function guardar() {
    if (!lineas.some(l => l.descripcion?.trim())) { setError("Escribí al menos qué llegó."); return; }
    setGuardando(true); setError("");
    const r = await registrarIngreso({ solicitud, cabecera: cab, items: lineas, quien: currentUser });
    setGuardando(false);
    if (r.error) { setError(r.error); if (!r.ingreso) return; }
    setAbriendo(false);
    await cargar();
    onCambio?.();
  }

  const mini = { ...inputStyle, padding: "6px 8px", fontSize: 12 };
  const lbl = { fontSize: 10, color: colors.muted, fontWeight: 600, display: "block", marginBottom: 3 };

  return (
    <div>
      {ingresos.map(ing => {
        const c = cuadre(items[ing.id] || []);
        return (
          <div key={ing.id} style={{ background: colors.bg, borderRadius: 8, padding: "8px 10px", marginBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <PackageCheck size={13} color={c.cuadra ? colors.success : colors.warning} />
              <span style={{ fontSize: 12, fontWeight: 600, color: colors.ink }}>
                {ing.fecha}{ing.recibido_nombre ? ` · ${ing.recibido_nombre}` : ""}
              </span>
              {ing.documento && <span style={{ fontSize: 10.5, color: colors.muted }}>contra {ing.documento}</span>}
              {!ing.completo && (
                <span style={{ fontSize: 9.5, fontWeight: 700, color: colors.warning, background: colors.warningSoft, borderRadius: 10, padding: "1px 7px" }}>
                  PARCIAL
                </span>
              )}
              <button onClick={async () => { if (window.confirm("¿Borrar este ingreso?")) { await borrarIngreso(ing.id); cargar(); } }}
                style={{ marginLeft: "auto", background: "none", border: "none", color: colors.border, cursor: "pointer", display: "flex", padding: 0 }}>
                <X size={13} />
              </button>
            </div>
            {c.lineas.map(l => (
              <div key={l.id} style={{ display: "flex", gap: 8, fontSize: 11.5, color: colors.inkSoft, paddingLeft: 21, marginTop: 3 }}>
                <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{l.descripcion}</span>
                <span style={{ whiteSpace: "nowrap", color: l.dif ? colors.warning : colors.muted }}>
                  {l.recibida}{l.unidad ? ` ${l.unidad}` : ""}
                  {l.esperada != null && l.dif !== 0 && ` de ${l.esperada}`}
                </span>
              </div>
            ))}
            {/* Lo que no cuadra se dice en palabras, no en rojo y que cada uno
                adivine qué mirar. */}
            {!c.cuadra && (
              <div style={{ fontSize: 10.5, color: colors.warning, paddingLeft: 21, marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
                <AlertTriangle size={10} />
                {c.faltan.length > 0 && `Faltó material en ${c.faltan.length} ${c.faltan.length === 1 ? "línea" : "líneas"}. `}
                {c.sobran.length > 0 && `Llegó de más en ${c.sobran.length}. `}
                Se factura lo que llegó.
              </div>
            )}
          </div>
        );
      })}

      {!abriendo ? (
        <Button variant="outline" size="sm" onClick={abrir}><Plus size={13} /> Registrar lo que llegó</Button>
      ) : (
        <div style={{ background: colors.bg, borderRadius: 8, padding: 10, display: "grid", gap: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 8 }}>
            <div>
              <label style={lbl}>FECHA</label>
              <input type="date" value={cab.fecha} onChange={e => setCab(c => ({ ...c, fecha: e.target.value }))} style={mini} />
            </div>
            <div>
              <label style={lbl}>CONTRA QUÉ PAPEL</label>
              <input value={cab.documento} onChange={e => setCab(c => ({ ...c, documento: e.target.value }))}
                placeholder="N° de factura, proforma o guía de remisión" style={mini} />
            </div>
          </div>

          <div style={{ fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.4 }}>QUÉ LLEGÓ</div>
          {lineas.map((l, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 60px 70px 70px auto", gap: 5, alignItems: "center" }}>
              <input value={l.descripcion} onChange={e => setLineas(x => x.map((y, j) => j === i ? { ...y, descripcion: e.target.value } : y))}
                placeholder="Qué es" style={mini} />
              <input value={l.unidad} onChange={e => setLineas(x => x.map((y, j) => j === i ? { ...y, unidad: e.target.value } : y))}
                placeholder="und" style={mini} />
              <input type="number" step="0.01" value={l.cantidad_esperada}
                onChange={e => setLineas(x => x.map((y, j) => j === i ? { ...y, cantidad_esperada: e.target.value } : y))}
                placeholder="pedido" style={mini} />
              <input type="number" step="0.01" value={l.cantidad_recibida}
                onChange={e => setLineas(x => x.map((y, j) => j === i ? { ...y, cantidad_recibida: e.target.value } : y))}
                placeholder="llegó" style={mini} />
              <button onClick={() => setLineas(x => x.filter((_, j) => j !== i))} disabled={lineas.length === 1}
                style={{ background: "none", border: "none", color: colors.border, cursor: lineas.length === 1 ? "default" : "pointer", display: "flex", padding: 2 }}>
                <X size={12} />
              </button>
            </div>
          ))}
          <button onClick={() => setLineas(x => [...x, VACIO()])}
            style={{ background: "none", border: `1px dashed ${colors.border}`, borderRadius: 7, padding: "6px",
              color: colors.inkSoft, fontSize: 11.5, cursor: "pointer", fontFamily: colors.font }}>
            + Otra cosa que llegó
          </button>

          {rubros.length > 0 && (
            <div style={{ fontSize: 10, color: colors.muted }}>
              Lo que llegó se cuenta contra el pedido; el gasto sigue entrando por la factura en Control de Obra.
            </div>
          )}

          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: colors.inkSoft, cursor: "pointer" }}>
            <input type="checkbox" checked={cab.completo} onChange={e => setCab(c => ({ ...c, completo: e.target.checked }))} />
            Llegó todo lo que faltaba de este pedido
          </label>

          <input value={cab.nota} onChange={e => setCab(c => ({ ...c, nota: e.target.value }))}
            placeholder="Nota: estado del material, quién lo entregó…" style={mini} />

          {error && <div style={{ fontSize: 11.5, color: colors.danger }}>{error}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="primary" size="sm" onClick={guardar} disabled={guardando}>Guardar el ingreso</Button>
            <Button variant="outline" size="sm" onClick={() => setAbriendo(false)}>Cancelar</Button>
          </div>
        </div>
      )}
    </div>
  );
}
