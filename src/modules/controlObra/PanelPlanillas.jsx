import { useState } from "react";
import { Plus, Lock } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { fmt } from "./calculos";

export default function PanelPlanillas({ obra, planillas, facturas, asignaciones, onCambio }) {
  const [creando, setCreando] = useState(false);

  const totalPorPlanilla = {};
  facturas.forEach(f => {
    if (!f.planilla_id) return;
    totalPorPlanilla[f.planilla_id] = (totalPorPlanilla[f.planilla_id] || 0) + (Number(f.total) || 0);
  });

  async function nuevaPlanilla() {
    setCreando(true);
    const siguiente = planillas.length ? Math.max(...planillas.map(p => p.numero)) + 1 : 1;
    await supabase.from("planillas").insert({
      obra_id: obra.id, numero: siguiente, nombre: `Planilla N°${siguiente}`,
      fecha_desde: new Date().toISOString().split("T")[0],
    });
    setCreando(false);
    onCambio();
  }

  async function cerrarPlanilla(p) {
    const sinAsignar = facturas.filter(f => f.planilla_id === p.id)
      .filter(f => !asignaciones.some(a => a.factura_id === f.id)).length;
    const aviso = sinAsignar > 0
      ? `\n\nOJO: ${sinAsignar} factura(s) de esta planilla todavía no están asignadas a ningún rubro y no se están contando en el control.`
      : "";
    if (!window.confirm(`¿Cerrar ${p.nombre || "la planilla N°" + p.numero}?${aviso}`)) return;
    await supabase.from("planillas").update({ estado: "cerrada", fecha_cierre: new Date().toISOString(), fecha_hasta: new Date().toISOString().split("T")[0] }).eq("id", p.id);
    onCambio();
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: colors.inkSoft }}>
          Cada planilla es un corte de período. Las facturas se cargan dentro de la planilla abierta.
        </div>
        <Button variant="primary" size="sm" style={{ marginLeft: "auto" }} onClick={nuevaPlanilla} disabled={creando}>
          <Plus size={13} /> Nueva planilla
        </Button>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {planillas.length === 0 && <div style={{ color: colors.muted, fontSize: 13, textAlign: "center", padding: "30px 0" }}>Sin planillas todavía.</div>}
        {planillas.slice().reverse().map(p => {
          const cerrada = p.estado === "cerrada";
          const cantidad = facturas.filter(f => f.planilla_id === p.id).length;
          return (
            <div key={p.id} style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, opacity: cerrada ? 0.75 : 1 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: colors.ink, display: "flex", alignItems: "center", gap: 6 }}>
                  {p.nombre || `Planilla N°${p.numero}`}
                  {cerrada && <Lock size={11} color={colors.muted} />}
                </div>
                <div style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
                  {p.fecha_desde || "—"}{p.fecha_hasta ? ` → ${p.fecha_hasta}` : ""} · {cantidad} factura{cantidad === 1 ? "" : "s"}
                </div>
              </div>
              <div style={{ marginLeft: "auto", textAlign: "right" }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: colors.ink }}>${fmt(totalPorPlanilla[p.id] || 0)}</div>
                <div style={{ fontSize: 9, color: colors.muted, fontWeight: 600 }}>{cerrada ? "CERRADA" : "ABIERTA"}</div>
              </div>
              {!cerrada && <Button variant="outline" size="sm" onClick={() => cerrarPlanilla(p)}>Cerrar</Button>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
