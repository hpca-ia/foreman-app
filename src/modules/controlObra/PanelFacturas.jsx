import { useState } from "react";
import { Plus, AlertTriangle, Images } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { fmt, resumenPlanilla } from "./calculos";
import ModalFactura from "./ModalFactura";
import FilaFactura from "./FilaFactura";
import RespaldosPlanilla from "./RespaldosPlanilla";

export default function PanelFacturas({ obra, rubros, actividades = [], planillas, planillaActual, facturas, asignaciones, pagos = [], currentUser, puede, onCambio, mostrarTitulo = true, porRubro = {} }) {
  const [modal, setModal] = useState(null); // null | {factura?}
  const [verRespaldos, setVerRespaldos] = useState(false);

  const delPeriodo = facturas.filter(f => planillaActual ? f.planilla_id === planillaActual.id : !f.planilla_id);
  const sinPlanilla = facturas.filter(f => !f.planilla_id);
  const asignadasPorFactura = {};
  asignaciones.forEach(a => { asignadasPorFactura[a.factura_id] = (asignadasPorFactura[a.factura_id] || 0) + (Number(a.monto) || 0); });

  const resumen = resumenPlanilla({ facturas: delPeriodo, asignaciones: asignaciones.filter(a => delPeriodo.some(f => f.id === a.factura_id)), pagos });

  async function eliminar(f) {
    if (!window.confirm(`¿Eliminar la factura ${f.numero_factura || ""} de ${f.razon_social || "proveedor"}?`)) return;
    await supabase.from("obra_asignaciones").delete().eq("factura_id", f.id);
    await supabase.from("obra_facturas").delete().eq("id", f.id);
    onCambio();
  }


  /**
   * Un anticipo que no va a tener factura nunca deja de figurar como pendiente.
   *
   * El gasto ya cuenta —la plata salió de la caja— pero el aviso de "falta la
   * factura" quedaría prendido para siempre en algo que se pagó contra recibo.
   * Un aviso que nunca se apaga deja de leerse, y con él se dejan de leer los
   * que sí hay que atender.
   */
  async function yaEsGasto(f) {
    if (!window.confirm(
      `¿Este gasto de $${fmt(f.total)} no va a tener factura nunca?\n\n`
      + "Usalo para lo que se paga contra recibo: honorarios, un trabajo de alguien que no factura.\n\n"
      + "Ya cuenta como gasto en sus rubros —la plata salió de la caja— y esto solo apaga el aviso de que "
      + "falta el comprobante. Si la factura todavía puede llegar, dejalo como está.")) return;
    const { error } = await supabase.from("obra_facturas").update({ clase: "recibo" }).eq("id", f.id);
    if (error) { alert("No se pudo cambiar: " + error.message); return; }
    onCambio?.();
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        {mostrarTitulo && (
          <div style={{ fontSize: 12, color: colors.inkSoft }}>
            {planillaActual ? <>Facturas de <strong>{planillaActual.nombre || `Planilla N°${planillaActual.numero}`}</strong></> : "Facturas sin planilla"}
          </div>
        )}
        {/* Ver los escaneos de a uno sirve para revisar una factura; para
            revisar una planilla entera hay que verlos todos y, sobre todo,
            saber cuáles faltan. */}
        <Button variant={verRespaldos ? "primary" : "outline"} size="sm" style={{ marginLeft: "auto" }}
          onClick={() => setVerRespaldos(v => !v)}>
          <Images size={13} /> Respaldos
        </Button>
        {puede?.("facturas.registrar") !== false && <Button variant="primary" size="sm" onClick={() => setModal({})} disabled={!planillaActual || planillaActual.estado === "cerrada"}>
          <Plus size={13} /> Nueva factura
        </Button>}
      </div>

      {verRespaldos && (
        <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 13, marginBottom: 12 }}>
          <RespaldosPlanilla facturas={delPeriodo}
            titulo={planillaActual ? `Respaldos de ${planillaActual.nombre || `Planilla N°${planillaActual.numero}`}` : "Respaldos"} />
        </div>
      )}

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

      {/* RESUMEN DEL PERÍODO, EN LOS MONTONES QUE SON.
          Un anticipo y una nota de crédito no son gasto FACTURADO —uno espera
          su papel, la otra es plata a favor— y sumarlos en un solo "total"
          esconde las dos cosas que hay que mirar: cuánto falta documentar y
          cuánto crédito queda sin usar. El anticipo sí cuenta como gasto: la
          plata salió de la caja. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 8, marginBottom: 14 }}>
        <Mini label="Documentos" valor={resumen.cantidad} moneda={false} />
        <Mini label="Gasto facturado" valor={resumen.gasto} />
        {resumen.anticipos > 0.005 && <Mini label="Gasto sin factura todavía" valor={resumen.anticipos} color={colors.warning} />}
        {resumen.credito > 0.005 && <Mini label="Notas de crédito" valor={resumen.credito} color={colors.success} />}
        <Mini label="Base 0%" valor={resumen.subtotal_0} />
        <Mini label="Base 5%" valor={resumen.subtotal_5} />
        <Mini label="Base 15%" valor={resumen.subtotal_15} />
        <Mini label="IVA" valor={resumen.iva} />
        <Mini label="Total" valor={resumen.total} destacado />
      </div>

      {/* LO QUE NO CIERRA CON LA PLANILLA. Las dos cosas siguen vivas después
          del corte: el anticipo hasta que llegue su factura, el vale hasta que
          se use en una compra, que puede caer en otro período. */}
      {(resumen.anticipos > 0.005 || resumen.credito > 0.005) && (
        <div style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd,
          padding: "9px 12px", fontSize: 11.5, color: colors.inkSoft, lineHeight: 1.6, marginBottom: 12 }}>
          {resumen.anticipos > 0.005 && (
            <div>
              <strong style={{ color: colors.warning }}>${fmt(resumen.anticipos)} en {resumen.cuantosAnticipos === 1 ? "un anticipo" : `${resumen.cuantosAnticipos} anticipos`}</strong>:
              {" "}la plata salió de la caja y <strong>ya cuenta como gasto</strong> en los rubros a los que esté asignada.
              Lo que falta es el papel: cuando llegue la factura se liquida contra ella y pasa a contar por el
              documento, en el período en que se emitió.
            </div>
          )}
          {resumen.credito > 0.005 && (
            <div>
              <strong style={{ color: colors.success }}>${fmt(resumen.credito)} en {resumen.cuantasNotas === 1 ? "una nota de crédito" : `${resumen.cuantasNotas} notas de crédito`}</strong>:
              {" "}plata nuestra a favor en la casa del proveedor. Se usa en una compra, que también puede caer en otra planilla.
            </div>
          )}
        </div>
      )}

      {sinPlanilla.length > 0 && planillaActual && (
        <div style={{ fontSize: 11, color: colors.muted, marginBottom: 8 }}>
          Hay {sinPlanilla.length} factura(s) sin planilla asignada (por ejemplo, venidas de Caja Chica).
        </div>
      )}

      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, overflow: "hidden" }}>
        {delPeriodo.length === 0 ? (
          <div style={{ textAlign: "center", color: colors.muted, padding: "40px 0", fontSize: 13 }}>Sin facturas en este período.</div>
        ) : delPeriodo.map(f => (
          <FilaFactura key={f.id} f={f} asignado={asignadasPorFactura[f.id] || 0}
            onYaEsGasto={yaEsGasto}
            onEditar={() => setModal({ factura: f })} onEliminar={() => eliminar(f)} />
        ))}
      </div>

      {modal && (
        <ModalFactura actividades={actividades} control={porRubro}
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

export function Mini({ label, valor, moneda = true, destacado, color }) {
  return (
    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusSm, padding: "8px 10px" }}>
      <div style={{ fontSize: 9, color: colors.muted, fontWeight: 600, letterSpacing: 0.3 }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 13, fontWeight: destacado ? 700 : 600, color: color || (destacado ? colors.ink : colors.inkSoft), marginTop: 2 }}>
        {moneda ? `$${fmt(valor)}` : valor}
      </div>
    </div>
  );
}
