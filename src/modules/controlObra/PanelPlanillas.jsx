import { useState } from "react";
import { Plus, Lock, Pencil, ChevronRight, Unlock } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { mensajeError } from "../../lib/sesion";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { fmt } from "./calculos";

// Las planillas de una obra: cada una es un corte de período.
//
// Se abren tocándolas. Antes solo se podían cerrar —era lo único que hacía el
// botón de la fila—, y una planilla que no se abre no sirve de nada: lo que
// uno quiere es entrar a ver qué facturas tiene ese mes.

export default function PanelPlanillas({ obra, planillas, facturas, asignaciones, planillaSel, onAbrir, onCambio }) {
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState("");
  const [editando, setEditando] = useState(null);     // id de la planilla que se está renombrando
  const [nombre, setNombre] = useState("");

  const totalPorPlanilla = {};
  const cuantasPorPlanilla = {};
  const sinAsignarPorPlanilla = {};
  facturas.forEach(f => {
    if (!f.planilla_id) return;
    const asignado = asignaciones.filter(a => a.factura_id === f.id).reduce((s, a) => s + (Number(a.monto) || 0), 0);
    totalPorPlanilla[f.planilla_id] = (totalPorPlanilla[f.planilla_id] || 0) + (Number(f.total) || 0);
    cuantasPorPlanilla[f.planilla_id] = (cuantasPorPlanilla[f.planilla_id] || 0) + 1;
    if (asignado + 0.01 < (Number(f.total) || 0)) sinAsignarPorPlanilla[f.planilla_id] = (sinAsignarPorPlanilla[f.planilla_id] || 0) + 1;
  });

  const abierta = planillas.find(p => p.estado === "abierta");

  async function nuevaPlanilla() {
    setError("");
    // Dos planillas abiertas a la vez descuadran el control: las facturas del
    // período no sabrían a cuál pertenecen.
    if (abierta && !window.confirm(`${abierta.nombre || `La planilla N°${abierta.numero}`} sigue abierta. ¿Crear otra igual?`)) return;
    setCreando(true);
    const siguiente = planillas.length ? Math.max(...planillas.map(p => p.numero)) + 1 : 1;
    const { data, error: e } = await supabase.from("planillas").insert({
      obra_id: obra.id, numero: siguiente, nombre: `Planilla N°${siguiente}`,
      fecha_desde: new Date().toISOString().split("T")[0],
    }).select().single();
    setCreando(false);
    // Callado se veía como que el botón no hacía nada: si la base la rechaza,
    // hay que decirlo.
    if (e) { setError(mensajeError(e) || e.message); return; }
    onCambio();
    if (data && onAbrir) onAbrir(data);
  }

  async function cerrarPlanilla(p) {
    setError("");
    const sinAsignar = sinAsignarPorPlanilla[p.id] || 0;
    const aviso = sinAsignar > 0
      ? `\n\nOJO: ${sinAsignar} factura(s) de esta planilla todavía no están asignadas a ningún rubro y no se están contando en el control.`
      : "";
    if (!window.confirm(`¿Cerrar ${p.nombre || "la planilla N°" + p.numero}?${aviso}`)) return;
    const { error: e } = await supabase.from("planillas")
      .update({ estado: "cerrada", fecha_cierre: new Date().toISOString(), fecha_hasta: new Date().toISOString().split("T")[0] })
      .eq("id", p.id);
    if (e) { setError(mensajeError(e) || e.message); return; }
    onCambio();
  }

  // Cerrar por error dejaba la obra sin dónde cargar facturas. Se puede volver
  // atrás; la fecha de cierre se borra para que no quede un cierre que no fue.
  async function reabrir(p) {
    setError("");
    if (!window.confirm(`¿Volver a abrir ${p.nombre || "la planilla N°" + p.numero}? Las facturas nuevas del período entrarán ahí.`)) return;
    const { error: e } = await supabase.from("planillas")
      .update({ estado: "abierta", fecha_cierre: null, fecha_hasta: null }).eq("id", p.id);
    if (e) { setError(mensajeError(e) || e.message); return; }
    onCambio();
  }

  async function guardarNombre(p) {
    const limpio = nombre.trim();
    setEditando(null);
    if (!limpio || limpio === p.nombre) return;
    const { error: e } = await supabase.from("planillas").update({ nombre: limpio }).eq("id", p.id);
    if (e) { setError(mensajeError(e) || e.message); return; }
    onCambio();
  }

  const iconBtn = { background: "none", border: "none", cursor: "pointer", color: colors.muted, display: "flex", padding: 4 };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, color: colors.inkSoft, flex: 1, minWidth: 180 }}>
          Cada planilla es un corte de período. Tócala para ver sus facturas; las nuevas se cargan en la que esté abierta.
        </div>
        <Button variant="primary" size="sm" onClick={nuevaPlanilla} disabled={creando}>
          <Plus size={13} /> Nueva planilla
        </Button>
      </div>

      {error && (
        <div style={{ background: colors.dangerSoft, border: "1px solid #F3C6C6", borderRadius: colors.radiusMd, padding: 10, fontSize: 12, color: colors.danger, marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div style={{ display: "grid", gap: 8 }}>
        {planillas.length === 0 && (
          <div style={{ color: colors.muted, fontSize: 13, textAlign: "center", padding: "30px 20px", lineHeight: 1.6 }}>
            Sin planillas todavía.<br />Crea la primera para empezar a cargar facturas de este período.
          </div>
        )}
        {planillas.slice().reverse().map(p => {
          const cerrada = p.estado === "cerrada";
          const viendo = p.id === planillaSel;
          const cantidad = cuantasPorPlanilla[p.id] || 0;
          const sinAsignar = sinAsignarPorPlanilla[p.id] || 0;
          return (
            <div
              key={p.id}
              onClick={() => onAbrir && onAbrir(p)}
              style={{
                background: colors.surface,
                border: `1.5px solid ${viendo ? colors.brand : colors.border}`,
                borderRadius: colors.radiusMd, padding: "12px 14px",
                display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                cursor: onAbrir ? "pointer" : "default", opacity: cerrada ? 0.85 : 1,
              }}
            >
              <div style={{ flex: 1, minWidth: 150 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: colors.ink, display: "flex", alignItems: "center", gap: 6 }}>
                  {editando === p.id ? (
                    <input autoFocus value={nombre} onClick={e => e.stopPropagation()}
                      onChange={e => setNombre(e.target.value)}
                      onBlur={() => guardarNombre(p)}
                      onKeyDown={e => { if (e.key === "Enter") guardarNombre(p); if (e.key === "Escape") setEditando(null); }}
                      style={{ font: "inherit", color: colors.ink, background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: colors.radiusSm, padding: "3px 6px", minWidth: 0, width: 180 }} />
                  ) : (
                    <>
                      {p.nombre || `Planilla N°${p.numero}`}
                      {cerrada && <Lock size={11} color={colors.muted} />}
                      <button title="Cambiar el nombre" style={iconBtn}
                        onClick={e => { e.stopPropagation(); setNombre(p.nombre || `Planilla N°${p.numero}`); setEditando(p.id); }}>
                        <Pencil size={11} />
                      </button>
                      {viendo && <span style={{ fontSize: 9, fontWeight: 700, color: colors.brand, background: colors.brandSoft, borderRadius: 4, padding: "1px 5px" }}>VIENDO</span>}
                    </>
                  )}
                </div>
                <div style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
                  {p.fecha_desde || "—"}{p.fecha_hasta ? ` → ${p.fecha_hasta}` : ""} · {cantidad} factura{cantidad === 1 ? "" : "s"}
                  {sinAsignar > 0 && <span style={{ color: colors.warning }}> · {sinAsignar} sin asignar</span>}
                </div>
              </div>

              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: colors.ink }}>${fmt(totalPorPlanilla[p.id] || 0)}</div>
                <div style={{ fontSize: 9, color: colors.muted, fontWeight: 600 }}>{cerrada ? "CERRADA" : "ABIERTA"}</div>
              </div>

              {cerrada
                ? <Button variant="outline" size="sm" onClick={e => { e.stopPropagation(); reabrir(p); }}><Unlock size={12} /> Reabrir</Button>
                : <Button variant="outline" size="sm" onClick={e => { e.stopPropagation(); cerrarPlanilla(p); }}><Lock size={12} /> Cerrar</Button>}
              <ChevronRight size={16} color={colors.border} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
