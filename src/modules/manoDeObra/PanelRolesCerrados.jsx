import { useState } from "react";
import { Printer, ChevronDown, ChevronRight, Check, X, Upload, Undo2 } from "lucide-react";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import { FORMAS_PAGO } from "../controlObra/pagos";
import { reabrirRol, pagarLineas, imprimirRecibos } from "./rolGuardado";
import { SOPORTES, periodoTexto, porPagar, resumenDePago } from "./rolPagado";

// Los roles cerrados: el recibo de cada uno, y quién ya cobró.
//
// Se paga persona por persona porque así se paga en la obra. Cada pago entra
// al control de obra como gasto de mano de obra, sin asignar: el rubro se lo
// pone después quien lleva el control, como a un gasto de caja chica.

const hoy = () => new Date().toISOString().split("T")[0];
const fmt = v => (Number(v) || 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fechaCorta = f => (f ? new Date(`${String(f).slice(0, 10)}T12:00:00`).toLocaleDateString("es-EC", { day: "numeric", month: "short" }) : "");

export default function PanelRolesCerrados({ roles, lead, editable, quien, onCambio }) {
  const [abierto, setAbierto] = useState(roles[0]?.id ?? null);
  const [elegidas, setElegidas] = useState(new Set());
  const [pago, setPago] = useState(null);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState("");

  if (!roles.length) {
    return (
      <div style={{ marginTop: 22 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: colors.ink, marginBottom: 2 }}>Roles cerrados</div>
        <div style={{ fontSize: 12, color: colors.muted, lineHeight: 1.55 }}>
          Todavía no cerraste ningún rol en esta obra. Al tocar <b>Cerrar rol</b> arriba, el rol aparece acá: desde acá se
          registra el pago de cada persona y ese pago entra como gasto a Control de obra.
        </div>
      </div>
    );
  }

  async function imprimir(rol, lineas) {
    setError("");
    try { await imprimirRecibos({ rol, lineas, lead }); }
    catch (e) { setError("No se pudo armar el recibo: " + e.message); }
  }

  async function reabrir(rol) {
    if (!window.confirm(`¿Reabrir el rol ${periodoTexto(rol)}? Vuelve a calcularse con la asistencia de hoy.`)) return;
    const r = await reabrirRol(rol);
    if (r.error) setError(r.error); else onCambio();
  }

  function empezarPago(rol) {
    const lineas = rol.lineas.filter(l => elegidas.has(l.id) && porPagar(l));
    if (!lineas.length) { setError("Marcá a quién se le paga."); return; }
    setError("");
    setPago({ rol, lineas, fecha: hoy(), forma: "transferencia", referencia: "", soporte: "rol", factura: { numero: "", ruc: "", razon_social: "" }, archivo: null });
  }

  async function confirmarPago() {
    setTrabajando(true); setError("");
    const r = await pagarLineas({
      rol: pago.rol, lineas: pago.lineas, soporte: pago.soporte, factura: pago.factura,
      pago: { fecha: pago.fecha, forma: pago.forma, referencia: pago.referencia },
      archivo: pago.archivo, lead, quien,
    });
    setTrabajando(false);
    if (r.error) setError(r.error);
    else { setPago(null); setElegidas(new Set()); }
    onCambio();
  }

  const alternar = id => setElegidas(s => { const x = new Set(s); x.has(id) ? x.delete(id) : x.add(id); return x; });

  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: colors.ink, marginBottom: 2 }}>Roles cerrados</div>
      <div style={{ fontSize: 11.5, color: colors.muted, marginBottom: 10 }}>
        Cada pago entra a Control de obra como gasto de mano de obra, sin asignar. Ahí se le pone el rubro o se prorratea.
      </div>
      {error && <div style={{ fontSize: 12, color: colors.danger, marginBottom: 8 }}>{error}</div>}

      {roles.map(rol => {
        const r = resumenDePago(rol.lineas);
        const abiertoEste = abierto === rol.id;
        const pagado = rol.estado === "pagado" || r.personasPendientes === 0;
        const elegidasAca = rol.lineas.filter(l => elegidas.has(l.id) && porPagar(l));
        return (
          <div key={rol.id} style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, marginBottom: 10, overflow: "hidden" }}>
            <div onClick={() => setAbierto(abiertoEste ? null : rol.id)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", cursor: "pointer", flexWrap: "wrap" }}>
              {abiertoEste ? <ChevronDown size={14} color={colors.muted} /> : <ChevronRight size={14} color={colors.muted} />}
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: colors.ink }}>
                  {rol.numero ? `Rol N° ${rol.numero} · ` : "Rol "}{periodoTexto(rol)}
                </div>
                <div style={{ fontSize: 11, color: colors.muted }}>
                  {rol.lineas.length} {rol.lineas.length === 1 ? "persona" : "personas"} · pagado ${fmt(r.pagado)}
                  {r.pendiente > 0 && <> · <b style={{ color: colors.warning }}>falta ${fmt(r.pendiente)}</b></>}
                </div>
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 99,
                background: pagado ? colors.successSoft : colors.warningSoft,
                color: pagado ? colors.success : colors.warning }}>
                {pagado ? "PAGADO" : "POR PAGAR"}
              </span>
            </div>

            {abiertoEste && (
              <div style={{ borderTop: `1px solid ${colors.neutralSoft}` }}>
                <div style={{ display: "flex", gap: 6, padding: "8px 12px", flexWrap: "wrap" }}>
                  <Button variant="outline" size="sm" onClick={() => imprimir(rol, rol.lineas)}><Printer size={13} /> Recibos de todos</Button>
                  {editable && !r.personasPagadas && (
                    <Button variant="secondary" size="sm" onClick={() => reabrir(rol)}><Undo2 size={13} /> Reabrir</Button>
                  )}
                  {editable && elegidasAca.length > 0 && !pago && (
                    <Button variant="primary" size="sm" onClick={() => empezarPago(rol)} style={{ marginLeft: "auto" }}>
                      Pagar {elegidasAca.length === 1 ? "a 1 persona" : `a ${elegidasAca.length} personas`} · ${fmt(elegidasAca.reduce((t, l) => t + Number(l.a_pagar), 0))}
                    </Button>
                  )}
                </div>

                {pago?.rol.id === rol.id && (
                  <FormularioPago pago={pago} setPago={setPago} trabajando={trabajando}
                    onConfirmar={confirmarPago} onCancelar={() => setPago(null)} />
                )}

                {rol.lineas.map(l => {
                  const debe = porPagar(l);
                  return (
                    <div key={l.id} style={{ display: "grid", gridTemplateColumns: "24px minmax(140px,1fr) 90px auto", gap: 8,
                      alignItems: "center", padding: "8px 12px", borderTop: `1px solid ${colors.neutralSoft}`, fontSize: 12 }}>
                      {debe && editable
                        ? <input type="checkbox" checked={elegidas.has(l.id)} onChange={() => alternar(l.id)} disabled={!!pago} />
                        : <span>{l.pagado_at ? <Check size={14} color={colors.success} /> : null}</span>}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.nombre}</div>
                        <div style={{ fontSize: 10.5, color: colors.muted }}>
                          {l.pagado_at
                            ? `Pagado el ${fechaCorta(l.pago_fecha)} · ${l.pago_forma || ""}${l.pago_referencia ? ` ${l.pago_referencia}` : ""} · ${SOPORTES[l.soporte]?.label || ""}`
                            : Number(l.a_pagar) > 0 ? `${l.cargo || "—"} · ${l.dias} días` : "Nada que cobrar en este rol"}
                        </div>
                      </div>
                      <span style={{ textAlign: "right", fontWeight: 700, color: colors.ink }}>${fmt(l.a_pagar)}</span>
                      <button onClick={() => imprimir(rol, [l])} title="Recibo de esta persona"
                        style={{ background: "none", border: "none", cursor: "pointer", color: colors.muted, display: "flex" }}><Printer size={13} /></button>
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

function FormularioPago({ pago, setPago, trabajando, onConfirmar, onCancelar }) {
  const total = pago.lineas.reduce((t, l) => t + Number(l.a_pagar), 0);
  const cambia = campos => setPago(p => ({ ...p, ...campos }));
  const conFactura = pago.soporte === "factura";
  const varias = pago.lineas.length > 1;
  const campo = { ...inputStyle, padding: "6px 9px", fontSize: 12.5 };

  return (
    <div style={{ margin: "0 12px 10px", padding: 12, border: `1px solid ${colors.brand}`, borderRadius: colors.radiusMd, display: "grid", gap: 9 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: colors.ink }}>
        Pago de ${fmt(total)} · {pago.lineas.map(l => l.nombre).join(", ")}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 8 }}>
        <label style={etiqueta}>Fecha del pago
          <input type="date" value={pago.fecha} onChange={e => cambia({ fecha: e.target.value })} style={campo} />
        </label>
        <label style={etiqueta}>Forma
          <select value={pago.forma} onChange={e => cambia({ forma: e.target.value })} style={campo}>
            {FORMAS_PAGO.filter(f => f !== "nota de crédito").map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
        <label style={etiqueta}>Referencia
          <input value={pago.referencia} onChange={e => cambia({ referencia: e.target.value })}
            placeholder={pago.forma === "cheque" ? "N° de cheque" : "Comprobante, banco"} style={campo} />
        </label>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {Object.entries(SOPORTES).map(([id, s]) => (
          <button key={id} onClick={() => cambia({ soporte: id })}
            style={{ border: `1px solid ${pago.soporte === id ? colors.brand : colors.border}`,
              background: pago.soporte === id ? colors.brand : "#fff", color: pago.soporte === id ? "#fff" : colors.inkSoft,
              borderRadius: 7, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: colors.font }}>
            Respaldo: {s.label}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 11, color: colors.muted }}>
        {conFactura
          ? (varias ? "Una sola factura para todas estas personas: entra como un gasto." : "La factura que entregó esta persona.")
          : (varias ? "Un gasto por persona, cada uno con su recibo." : "El recibo del rol, firmado.")}
      </div>

      {conFactura && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8 }}>
          <label style={etiqueta}>N° de factura
            <input value={pago.factura.numero} onChange={e => cambia({ factura: { ...pago.factura, numero: e.target.value } })} placeholder="001-001-000000123" style={campo} />
          </label>
          <label style={etiqueta}>RUC
            <input value={pago.factura.ruc} onChange={e => cambia({ factura: { ...pago.factura, ruc: e.target.value } })} style={campo} />
          </label>
          <label style={etiqueta}>Razón social
            <input value={pago.factura.razon_social} onChange={e => cambia({ factura: { ...pago.factura, razon_social: e.target.value } })} style={campo} />
          </label>
        </div>
      )}

      <label style={{ ...etiqueta, flexDirection: "row", alignItems: "center", gap: 8, cursor: "pointer" }}>
        <Upload size={13} />
        <span>{pago.archivo ? pago.archivo.name : conFactura ? "Subir la factura (opcional)" : "Subir el rol firmado (opcional)"}</span>
        <input type="file" accept="image/*,application/pdf" style={{ display: "none" }}
          onChange={e => cambia({ archivo: e.target.files?.[0] || null })} />
      </label>

      <div style={{ display: "flex", gap: 6 }}>
        <Button variant="primary" size="sm" disabled={trabajando} onClick={onConfirmar}>
          <Check size={13} /> {trabajando ? "Registrando…" : "Registrar el pago"}
        </Button>
        <Button variant="secondary" size="sm" disabled={trabajando} onClick={onCancelar}><X size={13} /> Cancelar</Button>
      </div>
    </div>
  );
}

const etiqueta = { display: "flex", flexDirection: "column", gap: 3, fontSize: 10.5, fontWeight: 600, color: colors.muted };
