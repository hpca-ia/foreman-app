import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, FileText, AlertTriangle } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import { abrirArchivo } from "../../lib/archivos";
import { fmt } from "./calculos";
import {
  CLASES_DOC, FORMAS_PAGO, ETIQUETA_PAGO, pagosDeObra, registrarPago, borrarPago,
  guardarDocumento, pagadoPorFactura, estadoDe, cuentasPorProveedor, totalesPorPagar,
} from "./pagos";

// A quién le debemos, cuánto, y qué proformas falta facturar.
//
// Control de Obra contesta "cuánto gasté". Esta pantalla contesta las dos
// preguntas que vienen después y que hoy se contestan de memoria: "¿cuánto le
// debo a este proveedor?" y "¿qué proformas siguen sin factura?".
//
// Gastado y pagado no son lo mismo: una factura con un anticipo del 40% ya
// golpeó el rubro entero, pero el resto todavía tiene que salir de caja.

const PAGO_VACIO = { monto: "", fecha: new Date().toISOString().split("T")[0], forma: "transferencia", referencia: "", nota: "" };
const dia = f => (f ? new Date(`${String(f).slice(0, 10)}T12:00:00`).toLocaleDateString("es-EC", { day: "numeric", month: "short" }) : "");

export default function PanelProveedores({ obra, facturas = [], currentUser, puede, onCambio }) {
  const [pagos, setPagos] = useState([]);
  const [sinTablas, setSinTablas] = useState(false);
  const [abierto, setAbierto] = useState(null);      // clave del proveedor
  const [pagando, setPagando] = useState(null);      // factura a la que se le carga un pago
  const [form, setForm] = useState(PAGO_VACIO);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState("");

  const puedeRegistrar = puede?.("facturas.registrar") !== false;

  const cargar = useCallback(async () => {
    const r = await pagosDeObra(obra.id);
    setSinTablas(r.sinTablas);
    setPagos(r.pagos);
  }, [obra.id]);
  useEffect(() => { cargar(); }, [cargar]);

  const pagado = pagadoPorFactura(pagos);
  const cuentas = cuentasPorProveedor(facturas, pagos);
  const totales = totalesPorPagar(cuentas);
  const proformasPendientes = facturas.filter(f => f.clase === "proforma" && !f.facturada_con_id);

  if (sinTablas) {
    return (
      <div style={{ fontSize: 12.5, color: colors.warning, background: colors.warningSoft, border: `1px solid ${colors.warningBorder}`, borderRadius: colors.radiusMd, padding: 14 }}>
        Falta correr la migración 060 en Supabase para llevar los pagos a proveedores.
      </div>
    );
  }

  const chip = estado => {
    const e = ETIQUETA_PAGO[estado];
    const c = { danger: colors.danger, warning: colors.warning, success: colors.success }[e.color];
    return <span style={{ fontSize: 9.5, fontWeight: 700, color: "#fff", background: c, borderRadius: 10, padding: "2px 7px", whiteSpace: "nowrap" }}>{e.label.toUpperCase()}</span>;
  };

  const dato = (titulo, valor, color) => (
    <div>
      <div style={{ fontSize: 9.5, fontWeight: 700, color: colors.muted, letterSpacing: 0.3 }}>{titulo}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: color || colors.ink }}>${fmt(valor)}</div>
    </div>
  );

  return (
    <div style={{ fontFamily: colors.font }}>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", background: colors.bg, borderRadius: colors.radiusMd, padding: "11px 14px", marginBottom: 12 }}>
        {dato("FACTURADO", totales.facturado)}
        {dato("PAGADO", totales.pagado, colors.success)}
        {dato("POR PAGAR", totales.saldo, totales.saldo > 0 ? colors.danger : colors.muted)}
        {totales.porFacturar > 0 && (
          <div>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: colors.muted, letterSpacing: 0.3 }}>PROFORMAS SIN FACTURA</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: colors.warning }}>
              {totales.porFacturar} · ${fmt(totales.proformas)}
            </div>
          </div>
        )}
      </div>

      {/* Lo que hay que reclamar: una proforma sin factura es plata gastada sin
          respaldo tributario, y se olvida sola. */}
      {proformasPendientes.length > 0 && (
        <div style={{ background: colors.warningSoft, border: `1px solid ${colors.warningBorder}`, borderRadius: colors.radiusMd, padding: "9px 12px", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 700, color: colors.warning, marginBottom: 5 }}>
            <AlertTriangle size={13} /> PROFORMAS PENDIENTES DE FACTURAR · {proformasPendientes.length}
          </div>
          {proformasPendientes.map(f => (
            <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: colors.ink, padding: "2px 0" }}>
              <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
                {f.razon_social || "Sin proveedor"} · {f.detalle || f.numero_factura || "—"} · {dia(f.fecha)}
              </span>
              <span style={{ fontWeight: 600 }}>${fmt(f.total)}</span>
              {puedeRegistrar && (
                <button onClick={async () => { await guardarDocumento(f.id, { clase: "factura" }); onCambio?.(); }}
                  title="Ya llegó la factura de esta proforma"
                  style={{ border: `1px solid ${colors.border}`, background: "#fff", color: colors.inkSoft, borderRadius: 12,
                    padding: "2px 9px", fontSize: 10.5, fontWeight: 600, cursor: "pointer", fontFamily: colors.font, whiteSpace: "nowrap" }}>
                  Ya es factura
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {aviso && <div style={{ fontSize: 12, color: colors.danger, marginBottom: 8 }}>{aviso}</div>}

      {!cuentas.length && (
        <div style={{ textAlign: "center", color: colors.muted, padding: "40px 20px", fontSize: 13, background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd }}>
          Todavía no hay facturas cargadas en esta obra.
        </div>
      )}

      {cuentas.map(c => {
        const esta = abierto === c.clave;
        return (
          <div key={c.clave} style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: "11px 13px", marginBottom: 8 }}>
            <div onClick={() => setAbierto(esta ? null : c.clave)} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 150 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: colors.ink, overflowWrap: "anywhere" }}>{c.nombre}</div>
                <div style={{ fontSize: 10.5, color: colors.muted }}>
                  {c.ruc || "sin RUC"} · {c.documentos.length} {c.documentos.length === 1 ? "documento" : "documentos"}
                  {c.porFacturar > 0 && <span style={{ color: colors.warning }}> · {c.porFacturar} sin factura</span>}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 10, color: colors.muted }}>pagado ${fmt(c.pagado)} de ${fmt(c.facturado)}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: c.saldo > 0 ? colors.danger : colors.success }}>
                  {c.saldo > 0 ? `debemos $${fmt(c.saldo)}` : "al día"}
                </div>
              </div>
            </div>

            {esta && (
              <div style={{ marginTop: 10, paddingTop: 9, borderTop: `1px solid ${colors.neutralSoft}` }}>
                {c.documentos.map(d => {
                  const suyos = pagos.filter(p => p.factura_id === d.id);
                  return (
                    <div key={d.id} style={{ padding: "7px 0", borderTop: `1px solid ${colors.neutralSoft}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 9.5, fontWeight: 700, color: d.clase === "proforma" ? colors.warning : colors.muted, letterSpacing: 0.3 }}>
                          {(CLASES_DOC[d.clase] || CLASES_DOC.factura).label.toUpperCase()}
                        </span>
                        <span style={{ flex: 1, minWidth: 120, fontSize: 12.5, color: colors.ink, overflowWrap: "anywhere" }}>
                          {d.numero_factura || d.detalle || "Sin número"} · {dia(d.fecha)}
                        </span>
                        {d.archivo_url && (
                          <button onClick={() => abrirArchivo(d.archivo_url)} title={d.archivo_nombre || "Ver el respaldo"}
                            style={{ background: "none", border: "none", color: colors.inkSoft, cursor: "pointer", display: "flex", padding: 0 }}>
                            <FileText size={14} />
                          </button>
                        )}
                        <span style={{ fontSize: 13, fontWeight: 700, color: colors.ink }}>${fmt(d.total)}</span>
                        {d.clase !== "proforma" && chip(d.estado)}
                      </div>

                      {d.clase !== "proforma" && (
                        <div style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
                          pagado ${fmt(d.pagado)} · falta <strong style={{ color: d.saldo > 0 ? colors.danger : colors.success }}>${fmt(d.saldo)}</strong>
                          {d.total > 0 && ` · ${Math.round(d.pct * 100)}%`}
                        </div>
                      )}

                      {suyos.map(p => (
                        <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, color: colors.inkSoft, padding: "2px 0 2px 10px" }}>
                          <span style={{ color: colors.muted }}>{dia(p.fecha)}</span>
                          <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
                            {p.forma || "pago"}{p.referencia ? ` · ${p.referencia}` : ""}{p.nota ? ` · ${p.nota}` : ""}
                          </span>
                          <span style={{ fontWeight: 600 }}>${fmt(p.monto)}</span>
                          {puedeRegistrar && (
                            <button onClick={async () => { if (window.confirm("¿Quitar este pago?")) { await borrarPago(p.id); await cargar(); } }}
                              style={{ background: "none", border: "none", color: colors.border, cursor: "pointer", display: "flex", padding: 0 }}>
                              <Trash2 size={11} />
                            </button>
                          )}
                        </div>
                      ))}

                      {puedeRegistrar && d.clase !== "proforma" && d.saldo > 0.005 && (
                        pagando === d.id ? (
                          <div style={{ background: colors.bg, borderRadius: 8, padding: 8, marginTop: 5, display: "grid", gap: 5 }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
                              <input type="number" step="0.01" autoFocus value={form.monto}
                                onChange={e => setForm(f => ({ ...f, monto: e.target.value }))}
                                placeholder={`Máximo ${fmt(d.saldo)}`} style={{ ...inputStyle, padding: "6px 8px", fontSize: 12 }} />
                              <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
                                style={{ ...inputStyle, padding: "6px 8px", fontSize: 12 }} />
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: 5 }}>
                              <select value={form.forma} onChange={e => setForm(f => ({ ...f, forma: e.target.value }))}
                                style={{ ...inputStyle, padding: "6px 8px", fontSize: 12 }}>
                                {FORMAS_PAGO.map(x => <option key={x} value={x}>{x}</option>)}
                              </select>
                              <input value={form.referencia} onChange={e => setForm(f => ({ ...f, referencia: e.target.value }))}
                                placeholder="N° de cheque o comprobante" style={{ ...inputStyle, padding: "6px 8px", fontSize: 12 }} />
                            </div>
                            <div style={{ display: "flex", gap: 5 }}>
                              <Button variant="primary" size="sm" disabled={ocupado || !(Number(form.monto) > 0)}
                                onClick={async () => {
                                  setOcupado(true); setAviso("");
                                  const r = await registrarPago(d, form, currentUser);
                                  setOcupado(false);
                                  if (r.error) { setAviso(r.error); return; }
                                  setPagando(null); setForm(PAGO_VACIO); await cargar();
                                }}>Guardar pago</Button>
                              <Button variant="secondary" size="sm" onClick={() => { setPagando(null); setForm(PAGO_VACIO); }}>Cancelar</Button>
                            </div>
                            {Number(form.monto) > d.saldo + 0.005 && (
                              <div style={{ fontSize: 10.5, color: colors.warning }}>
                                Eso es más de lo que falta (${fmt(d.saldo)}). Se guarda igual, pero revisá el monto.
                              </div>
                            )}
                          </div>
                        ) : (
                          <button onClick={() => { setPagando(d.id); setForm({ ...PAGO_VACIO, monto: "" }); }}
                            style={{ border: `1px solid ${colors.border}`, background: "#fff", color: colors.inkSoft, borderRadius: 12,
                              padding: "3px 10px", fontSize: 10.5, fontWeight: 600, cursor: "pointer", fontFamily: colors.font,
                              marginTop: 5, display: "inline-flex", alignItems: "center", gap: 4 }}>
                            <Plus size={11} /> Registrar un pago
                          </button>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
