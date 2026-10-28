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
  esNotaDeCredito, valesDisponibles,
} from "./pagos";

// A quién le debemos, cuánto, y qué proformas falta facturar.
//
// Control de Obra contesta "cuánto gasté". Esta pantalla contesta las dos
// preguntas que vienen después y que hoy se contestan de memoria: "¿cuánto le
// debo a este proveedor?" y "¿qué proformas siguen sin factura?".
//
// Gastado y pagado no son lo mismo: una factura con un anticipo del 40% ya
// golpeó el rubro entero, pero el resto todavía tiene que salir de caja.

const PAGO_VACIO = { monto: "", fecha: new Date().toISOString().split("T")[0], forma: "transferencia", referencia: "", nota: "", nota_credito_id: "" };
const estiloChip = {
  border: `1px solid ${colors.border}`, background: "#fff", color: colors.inkSoft, borderRadius: 12,
  padding: "1px 8px", fontSize: 10.5, fontWeight: 600, cursor: "pointer", fontFamily: colors.font,
};
const dia = f => (f ? new Date(`${String(f).slice(0, 10)}T12:00:00`).toLocaleDateString("es-EC", { day: "numeric", month: "short" }) : "");

export default function PanelProveedores({ obra, facturas = [], currentUser, puede, onCambio }) {
  const [pagos, setPagos] = useState([]);
  const [sinTablas, setSinTablas] = useState(false);
  const [abierto, setAbierto] = useState(null);      // clave del proveedor
  const [pagando, setPagando] = useState(null);      // factura a la que se le carga un pago
  const [guardando, setGuardando] = useState(false);
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
  // UN ANTICIPO NO SE LIQUIDABA DESDE NINGUNA PANTALLA.
  //
  // El control lo descuenta de lo invertido mientras no esté liquidado —es
  // plata que salió por algo que todavía no llegó— y la liquidación no existía
  // en ningún lado: el número se quedaba arriba para siempre, restando de lo
  // invertido, sin forma de cerrarlo y sin decir de qué estaba hecho. Acá se
  // lista y se cierra, igual que una proforma cuando llega su factura.
  const anticiposPendientes = facturas.filter(f => f.clase === "anticipo" && !f.facturada_con_id);

  // LAS DE CAJA CHICA QUE FIGURAN COMO DEUDA, Y NO LO SON.
  //
  // Una caja chica es plata que ya salió: alguien compró, pagó en el momento y
  // el proveedor se fue cobrado. Pero el gasto entraba al control como una
  // factura más, sin ningún pago registrado, y entonces acá aparecía "Sin
  // pagar" y sumaba a lo que le debemos. Una deuda que no existe, que se
  // arrastra, y que en el peor caso se paga dos veces.
  //
  // Desde ahora entran pagadas. Esto es para las que ya estaban.
  //
  // UNA NOTA DE CRÉDITO NO ES UNA DEUDA Y NO SE PAGA. Es plata que volvió:
  // entra en negativo y no lleva pago, a propósito —la base ni siquiera
  // acepta un pago negativo—. Contándolas, el aviso decía "2 facturas figuran
  // como deuda por $−105,06" —una deuda en negativo, que no quiere decir
  // nada— y el botón no podía arreglarlo: las descartaba al insertar y el
  // aviso volvía a aparecer para siempre.
  const cajaSinPago = facturas.filter(f =>
    f.origen === "caja_chica" && f.clase !== "proforma" && !esNotaDeCredito(f.clase)
    && (Number(f.total) || 0) > 0.005 && (pagado[f.id] || 0) <= 0.005);

  if (sinTablas) {
    return (
      <div style={{ fontSize: 12.5, color: colors.warning, background: colors.warningSoft, border: `1px solid ${colors.warningBorder}`, borderRadius: colors.radiusMd, padding: 14 }}>
        Falta correr la migración 060 en Supabase para llevar los pagos a proveedores.
      </div>
    );
  }

  async function marcarCajaPagada() {
    if (!window.confirm(
      `¿Marcar como pagadas las ${cajaSinPago.length} ${cajaSinPago.length === 1 ? "factura" : "facturas"} que vinieron de caja chica?\n\n`
      + "Una caja chica es plata que ya salió: se compró y se pagó en el momento. Figuran como deuda "
      + "porque entraron al control sin su pago registrado.\n\n"
      + `Suma $${fmt(cajaSinPago.reduce((t, f) => t + (Number(f.total) || 0), 0))}.`)) return;
    setGuardando(true);
    const filas = cajaSinPago.map(f => ({
      obra_id: obra.id, factura_id: f.id, monto: Number(f.total) || 0,
      fecha: f.fecha || new Date().toISOString().slice(0, 10),
      nota: "Pagado de caja chica", referencia: "CAJA",
      registrado_por: currentUser?.id ?? null, registrado_nombre: currentUser?.name || null,
    })).filter(x => x.monto > 0);
    const { error: e } = await supabase.from("obra_pagos").insert(filas);
    setGuardando(false);
    if (e) { window.alert("No se pudo: " + e.message); return; }
    await cargar(); onCambio?.();
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
        {/* EL CRÉDITO NO ES UNA DEUDA MENOS: ES PLATA NUESTRA EN LA CASA DEL
            PROVEEDOR. Vale como efectivo hasta que se use en una compra, y
            por eso se muestra como lo que es, en su propio renglón. */}
        {totales.credito > 0.005 && dato("CRÉDITO A FAVOR", totales.credito, colors.success)}
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
      {cajaSinPago.length > 0 && puede && (
        <div style={{ fontSize: 12.5, color: colors.ink, background: colors.warningSoft,
          border: `1px solid ${colors.warningBorder}`, borderRadius: colors.radiusMd,
          padding: "10px 12px", marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 8, lineHeight: 1.5 }}>
            <AlertTriangle size={14} color={colors.warning} style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1 }}>
              <strong>{cajaSinPago.length}</strong> {cajaSinPago.length === 1 ? "factura de caja chica figura" : "facturas de caja chica figuran"} como
              deuda por <strong>${fmt(cajaSinPago.reduce((t, f) => t + (Number(f.total) || 0), 0))}</strong>, y no lo son:
              una caja chica es plata que ya salió. Se compró y se pagó en el momento; el proveedor ya cobró.
              Entraron sin su pago registrado.
            </div>
          </div>
          <Button variant="primary" size="sm" style={{ marginTop: 8 }} disabled={guardando} onClick={marcarCajaPagada}>
            {guardando ? "Marcando…" : "Marcarlas como pagadas"}
          </Button>
        </div>
      )}

      {anticiposPendientes.length > 0 && (
        <div style={{ background: colors.warningSoft, border: `1px solid ${colors.warningBorder}`, borderRadius: colors.radiusMd, padding: "9px 12px", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 700, color: colors.warning, marginBottom: 5 }}>
            <AlertTriangle size={13} /> ANTICIPOS SIN LIQUIDAR · {anticiposPendientes.length}
          </div>
          <div style={{ fontSize: 11.5, color: colors.inkSoft, lineHeight: 1.5, marginBottom: 6 }}>
            Están cargados con la clase <strong>«Anticipo a proveedor»</strong>: plata que ya salió por algo que
            todavía no llegó. Por eso <strong>no cuentan como invertido</strong> y aparecen aparte en el control.
            Si el documento ya es la factura de lo que se pagó, cerralo acá y el monto entra a invertido.
          </div>
          {anticiposPendientes.map(f => (
            <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: colors.ink, padding: "2px 0" }}>
              <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
                {f.razon_social || "Sin proveedor"} · {f.detalle || f.numero_factura || "—"} · {dia(f.fecha)}
              </span>
              <span style={{ fontWeight: 600 }}>${fmt(f.total)}</span>
              {puedeRegistrar && (
                <button onClick={async () => { await guardarDocumento(f.id, { clase: "factura" }); onCambio?.(); await cargar(); }}
                  title="Este documento ya es la factura de lo que se anticipó: deja de ser un anticipo y su monto entra a invertido"
                  style={{ border: `1px solid ${colors.border}`, background: "#fff", color: colors.inkSoft, borderRadius: 12,
                    padding: "2px 9px", fontSize: 10.5, fontWeight: 600, cursor: "pointer", fontFamily: colors.font, whiteSpace: "nowrap" }}>
                  Ya es factura
                </button>
              )}
            </div>
          ))}
        </div>
      )}

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
                {c.credito > 0.005 && (
                  <div title="Notas de crédito sin usar: plata nuestra que está en la casa de este proveedor. Se usa en la próxima compra."
                    style={{ fontSize: 11.5, fontWeight: 700, color: colors.success }}>
                    tenemos ${fmt(c.credito)} a favor
                  </div>
                )}
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
                        {d.clase !== "proforma" && !esNotaDeCredito(d.clase) && d.total >= 0 && chip(d.estado)}
                      </div>

                      {esNotaDeCredito(d.clase) || d.total < 0 ? (
                        <div style={{ fontSize: 11, color: colors.inkSoft, marginTop: 2, display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                          {d.facturada_con_id ? (
                            <>
                              <span>Ya se usó{(() => {
                                const en = c.documentos.find(x => Number(x.id) === Number(d.facturada_con_id));
                                return en ? `: se aplicó a ${en.numero_factura || en.detalle || dia(en.fecha)}` : "";
                              })()}.</span>
                              {puedeRegistrar && (
                                <button onClick={async () => { await guardarDocumento(d.id, { facturada_con_id: null }); await cargar(); onCambio?.(); }}
                                  title="Volver a contarla como crédito disponible"
                                  style={estiloChip}>vuelve a estar a favor</button>
                              )}
                            </>
                          ) : (
                            <>
                              <span>Crédito a favor por <strong style={{ color: colors.success }}>${fmt(Math.abs(d.total))}</strong>.
                                No es deuda ni pago: vale hasta que se use en una compra.</span>
                              {/* DÓNDE SE USÓ, NO SOLO QUE SE USÓ. Un vale que se
                                  gastó y no dice en qué factura es un vale que
                                  nadie puede cruzar con el papel del proveedor. */}
                              {puedeRegistrar && (
                                <select defaultValue="" onChange={async e => {
                                  const id = Number(e.target.value);
                                  if (!id) return;
                                  await guardarDocumento(d.id, { facturada_con_id: id });
                                  await cargar(); onCambio?.();
                                }}
                                  title="¿En qué compra de este proveedor se usó este crédito?"
                                  style={{ ...estiloChip, maxWidth: 230 }}>
                                  <option value="">se usó en…</option>
                                  {c.documentos
                                    .filter(x => Number(x.total) > 0 && x.clase !== "proforma")
                                    .map(x => (
                                      <option key={x.id} value={x.id}>
                                        {x.numero_factura || x.detalle || "sin número"} · ${fmt(x.total)} · {dia(x.fecha)}
                                      </option>
                                    ))}
                                </select>
                              )}
                            </>
                          )}
                        </div>
                      ) : d.clase !== "proforma" && (
                        <div style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
                          pagado ${fmt(d.pagado)} · falta <strong style={{ color: d.saldo > 0 ? colors.danger : colors.success }}>${fmt(d.saldo)}</strong>
                          {d.total > 0 && ` · ${Math.round(d.pct * 100)}%`}
                        </div>
                      )}

                      {suyos.map(p => (
                        <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, color: colors.inkSoft, padding: "2px 0 2px 10px" }}>
                          <span style={{ color: colors.muted }}>{dia(p.fecha)}</span>
                          <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
                            {p.forma || "pago"}{p.nota_credito_id ? " (no salió del banco)" : ""}{p.referencia ? ` · ${p.referencia}` : ""}{p.nota ? ` · ${p.nota}` : ""}
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

                      {puedeRegistrar && d.clase !== "proforma" && !esNotaDeCredito(d.clase) && d.saldo > 0.005 && (
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
                              <select value={form.forma}
                                onChange={e => setForm(f => ({ ...f, forma: e.target.value,
                                  nota_credito_id: e.target.value === "nota de crédito"
                                    ? (valesDisponibles(c.documentos, pagos)[0]?.id ?? "") : "" }))}
                                style={{ ...inputStyle, padding: "6px 8px", fontSize: 12 }}>
                                {FORMAS_PAGO.map(x => <option key={x} value={x}>{x}</option>)}
                              </select>
                              <input value={form.referencia} onChange={e => setForm(f => ({ ...f, referencia: e.target.value }))}
                                placeholder="N° de cheque o comprobante" style={{ ...inputStyle, padding: "6px 8px", fontSize: 12 }} />
                            </div>
                            {/* CON QUÉ VALE. Pagar con una nota de crédito no es
                                "otra forma de pago": es gastar un crédito que
                                teníamos, y hay que decir cuál para que deje de
                                estar disponible por ese monto. */}
                            {form.forma === "nota de crédito" && (() => {
                              const libres = valesDisponibles(c.documentos, pagos);
                              if (!libres.length) {
                                return <div style={{ fontSize: 11, color: colors.warning }}>
                                  Este proveedor no tiene ninguna nota de crédito sin usar.
                                </div>;
                              }
                              return (
                                <select value={form.nota_credito_id || libres[0].id}
                                  onChange={e => setForm(f => ({ ...f, nota_credito_id: e.target.value }))}
                                  style={{ ...inputStyle, padding: "6px 8px", fontSize: 12 }}>
                                  {libres.map(v => (
                                    <option key={v.id} value={v.id}>
                                      {v.numero_factura || v.detalle || "sin número"} · quedan ${fmt(v.disponible)}
                                    </option>
                                  ))}
                                </select>
                              );
                            })()}
                            <div style={{ display: "flex", gap: 5 }}>
                              <Button variant="primary" size="sm" disabled={ocupado || !(Number(form.monto) > 0)}
                                onClick={async () => {
                                  // PAGAR DE MÁS SE CONFIRMA, NO SE AVISA.
                                  //
                                  // Un aviso en ámbar que termina en "se guarda
                                  // igual" no frena nada: así entró un segundo
                                  // pago de $18,98 sobre una factura de $18,98
                                  // a la que le faltaban 60 centavos, y la obra
                                  // quedó diciendo que se pagó el doble.
                                  if (Number(form.monto) > d.saldo + 0.005
                                    && !window.confirm(`A este documento le faltan $${fmt(d.saldo)} y estás cargando $${fmt(Number(form.monto))}.\n\n`
                                      + `De $${fmt(d.total)}, ya hay $${fmt(d.pagado)} pagados. Con este pago quedaría en $${fmt(d.pagado + Number(form.monto))}.\n\n`
                                      + "¿Lo cargo igual?")) return;
                                  setOcupado(true); setAviso("");
                                  const vale = form.forma === "nota de crédito"
                                    ? (form.nota_credito_id || valesDisponibles(c.documentos, pagos)[0]?.id || null)
                                    : null;
                                  const r = await registrarPago(d, { ...form, nota_credito_id: vale }, currentUser);
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
