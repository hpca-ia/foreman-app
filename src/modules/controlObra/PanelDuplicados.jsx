import { useState, useEffect, useCallback } from "react";
import { AlertOctagon, AlertTriangle, ShieldCheck, Trash2, RefreshCw } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { fmt } from "./calculos";
import { auditarObra } from "./duplicados";

const ORIGEN = { manual: "a mano", nova: "NOVA", caja_chica: "caja chica" };

export default function PanelDuplicados({ obra, planillas, onCambio }) {
  const [grupos, setGrupos] = useState([]);
  const [cargando, setCargando] = useState(true);

  const revisar = useCallback(async () => {
    setCargando(true);
    setGrupos(await auditarObra(obra.id));
    setCargando(false);
  }, [obra.id]);

  useEffect(() => { revisar(); }, [revisar]);

  async function eliminar(f) {
    if (!window.confirm(`¿Eliminar la factura ${f.numero_factura || ""} de ${f.razon_social || "proveedor"} por $${fmt(f.total)}?\n\nSe quita del control de la obra.`)) return;
    await supabase.from("obra_facturas").delete().eq("id", f.id);
    await revisar();
    onCambio?.();
  }

  const nombrePlanilla = id => planillas.find(p => p.id === id)?.nombre || (id ? "—" : "sin planilla");
  const exactos = grupos.filter(g => g.tipo === "exacto");
  const posibles = grupos.filter(g => g.tipo === "posible");
  const montoEnRiesgo = exactos.reduce((s, g) => s + g.facturas.slice(1).reduce((a, f) => a + Number(f.total || 0), 0), 0);

  if (cargando) return <div style={{ textAlign: "center", color: colors.muted, padding: "40px 0", fontSize: 13 }}>Revisando facturas...</div>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, color: colors.inkSoft }}>
          Busca la misma factura cargada dos veces, sin importar si entró por planilla o por caja chica.
        </div>
        <Button variant="secondary" size="sm" style={{ marginLeft: "auto" }} onClick={revisar}><RefreshCw size={12} /> Revisar de nuevo</Button>
      </div>

      {grupos.length === 0 ? (
        <div style={{ background: colors.successSoft, border: `1px solid ${colors.successBorder}`, borderRadius: colors.radiusMd, padding: "30px 20px", textAlign: "center" }}>
          <ShieldCheck size={26} color={colors.success} style={{ marginBottom: 8 }} />
          <div style={{ fontSize: 13, color: colors.success, fontWeight: 600 }}>Sin duplicados detectados</div>
          <div style={{ fontSize: 11, color: colors.inkSoft, marginTop: 4 }}>Ninguna factura de esta obra se repite.</div>
        </div>
      ) : (
        <>
          {exactos.length > 0 && (
            <div style={{ background: colors.dangerSoft, border: `1px solid ${colors.dangerBorder}`, borderRadius: colors.radiusMd, padding: 12, marginBottom: 14, fontSize: 12, color: colors.danger }}>
              <strong>{exactos.length} factura{exactos.length === 1 ? "" : "s"} repetida{exactos.length === 1 ? "" : "s"}</strong> — hay ${fmt(montoEnRiesgo)} contados de más en el control de esta obra.
            </div>
          )}

          {[...exactos, ...posibles].map(g => (
            <div key={g.clave} style={{
              background: colors.surface,
              border: `1.5px solid ${g.tipo === "exacto" ? colors.dangerBorder : colors.warningBorder}`,
              borderRadius: colors.radiusMd, padding: 12, marginBottom: 10,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                {g.tipo === "exacto" ? <AlertOctagon size={14} color={colors.danger} /> : <AlertTriangle size={14} color={colors.warning} />}
                <span style={{ fontSize: 12, fontWeight: 700, color: g.tipo === "exacto" ? colors.danger : colors.warning }}>
                  {g.tipo === "exacto" ? "Misma factura, cargada " : "Parecidas: "}{g.facturas.length}{g.tipo === "exacto" ? " veces" : " facturas"}
                </span>
                {g.justificado && (
                  <span style={{ fontSize: 10, background: colors.neutralSoft, color: colors.inkSoft, padding: "2px 7px", borderRadius: 20 }}>justificado</span>
                )}
              </div>

              {g.facturas.map((f, i) => (
                <div key={f.id} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", marginBottom: 5,
                  background: i === 0 ? colors.bg : (g.tipo === "exacto" ? colors.dangerSoft : colors.warningSoft),
                  borderRadius: colors.radiusSm,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {i === 0 && <div style={{ fontSize: 9, fontWeight: 700, color: colors.success, letterSpacing: .5 }}>LA PRIMERA</div>}
                    <div style={{ fontSize: 12, fontWeight: 600, color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {f.razon_social || "Sin proveedor"}
                      {f.numero_factura && <span style={{ color: colors.muted, fontWeight: 400 }}> · #{f.numero_factura}</span>}
                    </div>
                    <div style={{ fontSize: 10, color: colors.inkSoft, marginTop: 2 }}>
                      {f.fecha} · {nombrePlanilla(f.planilla_id)} · entró {ORIGEN[f.origen] || f.origen}
                      {f.subido_por_nombre ? ` por ${f.subido_por_nombre}` : ""}
                    </div>
                    {f.duplicado_justificacion && (
                      <div style={{ fontSize: 10, color: colors.warning, marginTop: 3, fontStyle: "italic" }}>
                        Justificación: {f.duplicado_justificacion}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: colors.ink, flexShrink: 0 }}>${fmt(f.total)}</div>
                  {i > 0 && (
                    <button onClick={() => eliminar(f)} title="Eliminar esta copia"
                      style={{ background: colors.dangerSoft, border: `1px solid ${colors.dangerBorder}`, borderRadius: colors.radiusSm, padding: "5px 7px", color: colors.danger, cursor: "pointer", display: "flex" }}>
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
