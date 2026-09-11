import { useState } from "react";
import { Plus, Paperclip, AlertTriangle, Pencil, Trash2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { fmt, resumenPlanilla, TIPOS_GASTO } from "./calculos";
import ModalFactura from "./ModalFactura";

export default function PanelFacturas({ obra, rubros, planillas, planillaActual, facturas, asignaciones, currentUser, onCambio }) {
  const [modal, setModal] = useState(null); // null | {factura?}

  const delPeriodo = facturas.filter(f => planillaActual ? f.planilla_id === planillaActual.id : !f.planilla_id);
  const sinPlanilla = facturas.filter(f => !f.planilla_id);
  const asignadasPorFactura = {};
  asignaciones.forEach(a => { asignadasPorFactura[a.factura_id] = (asignadasPorFactura[a.factura_id] || 0) + (Number(a.monto) || 0); });

  const resumen = resumenPlanilla({ facturas: delPeriodo, asignaciones: asignaciones.filter(a => delPeriodo.some(f => f.id === a.factura_id)) });

  async function eliminar(f) {
    if (!window.confirm(`¿Eliminar la factura ${f.numero_factura || ""} de ${f.razon_social || "proveedor"}?`)) return;
    await supabase.from("obra_facturas").delete().eq("id", f.id);
    onCambio();
  }

  const tipoLabel = id => TIPOS_GASTO.find(t => t.id === id)?.label || id;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, color: colors.inkSoft }}>
          {planillaActual ? <>Facturas de <strong>{planillaActual.nombre || `Planilla N°${planillaActual.numero}`}</strong></> : "Facturas sin planilla"}
        </div>
        <Button variant="primary" size="sm" style={{ marginLeft: "auto" }} onClick={() => setModal({})} disabled={!planillaActual || planillaActual.estado === "cerrada"}>
          <Plus size={13} /> Nueva factura
        </Button>
      </div>

      {planillaActual?.estado === "cerrada" && (
        <div style={{ background: colors.warningSoft, border: `1px solid ${colors.warningBorder}`, borderRadius: colors.radiusMd, padding: 10, fontSize: 12, color: colors.warning, marginBottom: 12 }}>
          Esta planilla está cerrada. Para cargar facturas, abre una nueva planilla.
        </div>
      )}

      {resumen.sinAsignar > 0.009 && (
        <div style={{ background: colors.warningSoft, border: `1px solid ${colors.warningBorder}`, borderRadius: colors.radiusMd, padding: 10, fontSize: 12, color: colors.warning, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <AlertTriangle size={14} />
          <span>${fmt(resumen.sinAsignar)} de esta planilla todavía no está asignado a ningún rubro — no se está contando en el control.</span>
        </div>
      )}

      {/* Resumen del período */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 8, marginBottom: 14 }}>
        <Mini label="Facturas" valor={resumen.cantidad} moneda={false} />
        <Mini label="Base 0%" valor={resumen.subtotal_0} />
        <Mini label="Base 5%" valor={resumen.subtotal_5} />
        <Mini label="Base 15%" valor={resumen.subtotal_15} />
        <Mini label="IVA" valor={resumen.iva} />
        <Mini label="Total" valor={resumen.total} destacado />
      </div>

      {sinPlanilla.length > 0 && planillaActual && (
        <div style={{ fontSize: 11, color: colors.muted, marginBottom: 8 }}>
          Hay {sinPlanilla.length} factura(s) sin planilla asignada (por ejemplo, venidas de Caja Chica).
        </div>
      )}

      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, overflow: "hidden" }}>
        {delPeriodo.length === 0 ? (
          <div style={{ textAlign: "center", color: colors.muted, padding: "40px 0", fontSize: 13 }}>Sin facturas en este período.</div>
        ) : delPeriodo.map(f => {
          const asignado = asignadasPorFactura[f.id] || 0;
          const pendiente = Math.round((Number(f.total) - asignado) * 100) / 100;
          return (
            <div key={f.id} style={{ padding: "10px 14px", borderBottom: `1px solid ${colors.neutralSoft}`, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {f.razon_social || "Sin proveedor"}
                  {f.numero_factura && <span style={{ color: colors.muted, fontWeight: 400, marginLeft: 6 }}>#{f.numero_factura}</span>}
                </div>
                <div style={{ fontSize: 11, color: colors.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {f.fecha} · {tipoLabel(f.tipo)}{f.detalle ? ` · ${f.detalle}` : ""}
                </div>
                {pendiente > 0.009 && (
                  <div style={{ fontSize: 10, color: colors.warning, marginTop: 3, fontWeight: 600 }}>
                    ${fmt(pendiente)} sin asignar a rubro
                  </div>
                )}
              </div>
              {f.archivo_url && (
                <a href={f.archivo_url} target="_blank" rel="noreferrer" title={f.archivo_nombre || "Adjunto"} style={{ color: colors.muted, display: "flex" }}>
                  <Paperclip size={14} />
                </a>
              )}
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: colors.ink }}>${fmt(f.total)}</div>
              </div>
              <button onClick={() => setModal({ factura: f })} style={{ background: colors.neutralSoft, border: "none", borderRadius: colors.radiusSm, padding: "5px 7px", color: colors.inkSoft, cursor: "pointer", display: "flex" }}><Pencil size={12} /></button>
              <button onClick={() => eliminar(f)} style={{ background: colors.dangerSoft, border: "none", borderRadius: colors.radiusSm, padding: "5px 7px", color: colors.danger, cursor: "pointer", display: "flex" }}><Trash2 size={12} /></button>
            </div>
          );
        })}
      </div>

      {modal && (
        <ModalFactura
          obra={obra} rubros={rubros} planilla={planillaActual}
          factura={modal.factura}
          asignacionesFactura={modal.factura ? asignaciones.filter(a => a.factura_id === modal.factura.id) : []}
          currentUser={currentUser}
          onCerrar={() => setModal(null)}
          onGuardado={() => { setModal(null); onCambio(); }}
        />
      )}
    </div>
  );
}

function Mini({ label, valor, moneda = true, destacado }) {
  return (
    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusSm, padding: "8px 10px" }}>
      <div style={{ fontSize: 9, color: colors.muted, fontWeight: 600, letterSpacing: 0.3 }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 13, fontWeight: destacado ? 700 : 600, color: destacado ? colors.ink : colors.inkSoft, marginTop: 2 }}>
        {moneda ? `$${fmt(valor)}` : valor}
      </div>
    </div>
  );
}
