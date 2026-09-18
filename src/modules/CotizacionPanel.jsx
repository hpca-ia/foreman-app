import { useState } from "react";
import { totalesPresupuesto } from "./presupuestos/honorarios";

// La cotización de un proveedor, antes de meterla al presupuesto: a qué
// capítulo va, con cuánta utilidad, y si sus precios quedan en la base de
// rubros. Eso último se elige: una cotización de prueba, o de un proveedor que
// no se quiere tener de referencia, no tiene por qué contar.
//
// Y antes de aplicarla, el total: lo que NOVA leyó contra lo que dice la
// cotización. Si no cuadra, falta un rubro o se leyó mal un precio, y eso hay
// que verlo acá —con la cotización en la mano— y no cuando el presupuesto ya
// salió al cliente.

const n = v => Number(v) || 0;
const r2 = v => Math.round(v * 100) / 100;

// Proformas con dos precios: uno por rubro (P.V.P. y con descuento) o un
// descuento general al final. Se guardan los dos en cada rubro para poder
// cambiar de opinión sin volver a leer el documento.
function conDosPrecios(result) {
  const lista = result.rubros?.filter(r => r.descripcion?.trim()) || [];
  const porRubro = lista.some(r => r.precio_pvp != null && r.precio_descuento != null && n(r.precio_pvp) !== n(r.precio_descuento));
  const pct = !porRubro && n(result.descuento_pct) > 0 ? n(result.descuento_pct) : null;
  const rubros = lista.map(r => {
    if (porRubro && r.precio_pvp != null && r.precio_descuento != null) return { ...r, _pvp: n(r.precio_pvp), _desc: n(r.precio_descuento) };
    if (pct != null) return { ...r, _pvp: n(r.precio_unitario), _desc: r2(n(r.precio_unitario) * (1 - pct / 100)) };
    return r;
  });
  return { rubros, dos: porRubro || pct != null, pctGeneral: pct };
}

export default function CotizacionPanel({ result, clientes, capitulosActivos, presupuesto, onCancelar, onImportar, fmt }) {
  // "" = capítulo nuevo con el nombre de abajo; si no, uno que ya existe.
  const [destino, setDestino] = useState("");
  const [capNuevo, setCapNuevo] = useState(result.proveedor || "COTIZACIÓN PROVEEDOR");
  const capNombre = destino || capNuevo.trim();
  const [utilidadGlobal, setUtilidadGlobal] = useState(0);
  const [lectura] = useState(() => conDosPrecios(result));
  const [rubros, setRubros] = useState(lectura.rubros);
  // Con dos precios nada se aplica hasta elegir cuál: PVP o con descuento.
  const [precioElegido, setPrecioElegido] = useState(null);
  const [guardarBD, setGuardarBD] = useState(true);
  const [proveedor, setProveedor] = useState(result.proveedor || "");
  const [clienteNombre, setClienteNombre] = useState("");
  const [fecha, setFecha] = useState(new Date().getFullYear().toString());
  const [revisado, setRevisado] = useState(false);

  const final = r => r.precio_unitario_final ?? n(r.precio_unitario) * (1 + n(r.utilidad_pct) / 100);

  function aplicarUtilidadGlobal(pct) {
    setUtilidadGlobal(pct);
    setRubros(prev => prev.map(r => ({ ...r, utilidad_pct: pct, precio_unitario_final: n(r.precio_unitario) * (1 + pct / 100) })));
  }
  // Corregir lo que NOVA leyó mal: cantidad, precio o utilidad de una fila.
  function cambiar(idx, campo, valor) {
    setRubros(prev => prev.map((r, i) => {
      if (i !== idx) return r;
      const u = { ...r, [campo]: valor };
      u.precio_unitario_final = n(u.precio_unitario) * (1 + n(u.utilidad_pct) / 100);
      return u;
    }));
    setRevisado(false);
  }
  function quitar(idx) { setRubros(prev => prev.filter((_, i) => i !== idx)); setRevisado(false); }
  function elegirPrecio(tipo) {
    setPrecioElegido(tipo);
    setRubros(prev => prev.map(r => {
      if (r._pvp == null) return r;
      const p = tipo === "pvp" ? r._pvp : r._desc;
      return { ...r, precio_unitario: p, precio_unitario_final: p * (1 + n(r.utilidad_pct) / 100) };
    }));
    setRevisado(false);
  }
  const totalOpcion = tipo => r2(rubros.reduce((s, r) => s + n(r.cantidad || 1) * (r._pvp == null ? n(r.precio_unitario) : tipo === "pvp" ? r._pvp : r._desc), 0));

  // ── La verificación ──
  const leido = r2(rubros.reduce((s, r) => s + n(r.cantidad || 1) * n(r.precio_unitario), 0));
  const conUtilidad = r2(rubros.reduce((s, r) => s + n(r.cantidad || 1) * final(r), 0));
  const subEscrito = result.subtotal != null ? n(result.subtotal) : null;
  const restaDescuento = lectura.pctGeneral != null && precioElegido === "descuento" && subEscrito;
  const subDoc = restaDescuento
    ? r2(result.descuento_monto != null ? subEscrito - n(result.descuento_monto) : subEscrito * (1 - lectura.pctGeneral / 100))
    : subEscrito;
  const totDoc = result.total != null ? n(result.total) : null;
  const ivaDoc = result.iva != null ? n(result.iva) : null;
  const tolerancia = x => Math.max(1, Math.abs(x) * 0.001);
  let chequeo;
  // Si se eligió el PVP y la proforma suma con descuento, la diferencia es el
  // descuento, no un rubro perdido: se dice así y no se frena.
  const pvpContraDescuento = ref => lectura.dos && precioElegido === "pvp" && ref && Math.abs(totalOpcion("descuento") - ref) <= tolerancia(ref);
  if (subDoc) {
    const dif = r2(leido - subDoc);
    chequeo = { cuadra: Math.abs(dif) <= tolerancia(subDoc), contra: restaDescuento ? "el subtotal de la cotización menos su descuento" : "el subtotal de la cotización", valor: subDoc, dif };
    if (!chequeo.cuadra && pvpContraDescuento(subDoc)) chequeo = { ...chequeo, cuadra: true, nota: `La proforma suma $${fmt(subDoc)} con su descuento; tomaste el PVP, así que los $${fmt(dif)} de diferencia son el descuento.` };
    else if (!chequeo.cuadra && lectura.pctGeneral != null && precioElegido === "pvp" && Math.abs(leido - subEscrito) <= tolerancia(subEscrito)) chequeo = { ...chequeo, cuadra: true };
  } else if (totDoc) {
    const dif = r2(leido - totDoc);
    const sinIva = ivaDoc != null ? totDoc - ivaDoc : null;
    if (Math.abs(dif) <= tolerancia(totDoc)) chequeo = { cuadra: true, contra: "el total de la cotización", valor: totDoc, dif };
    else if (sinIva != null && Math.abs(leido - sinIva) <= tolerancia(sinIva)) chequeo = { cuadra: true, contra: "el total sin IVA de la cotización", valor: r2(sinIva), dif: r2(leido - sinIva) };
    else if (Math.abs(leido * 1.15 - totDoc) <= tolerancia(totDoc)) chequeo = { cuadra: true, contra: "el total de la cotización, que incluye 15% de IVA", valor: totDoc, dif: 0 };
    else chequeo = { cuadra: false, contra: "el total de la cotización", valor: totDoc, dif };
  } else {
    chequeo = { cuadra: null };
  }
  const falta = chequeo.cuadra === false && !revisado;

  // ── Cómo queda el presupuesto ──
  const totalCon = sub => totalesPresupuesto(sub, presupuesto || {}).total;
  const subAntes = n(presupuesto?.subtotal);
  const subDespues = r2(subAntes + conUtilidad);

  const faltaProveedor = guardarBD && !proveedor.trim();
  const sinCapitulo = !capNombre;
  const bloqueo = lectura.dos && !precioElegido ? "Elige qué precio tomar: PVP o con descuento"
    : faltaProveedor ? "Escribe quién cotiza para guardarlo en la base"
    : sinCapitulo ? "Ponle nombre al capítulo"
    : falta ? "Revisa la diferencia del total para continuar"
    : !rubros.length ? "No quedan rubros para importar" : null;

  const iS = { background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--ink)", padding: "5px 8px", fontSize: 12, fontFamily: "var(--font)", outline: "none" };
  const numS = { ...iS, textAlign: "right", padding: "3px 6px", boxSizing: "border-box", width: "100%" };

  return (
    <div style={{ background: "var(--success-soft)", border: "1.5px solid var(--success-border)", borderRadius: 12, padding: 16, marginBottom: 14, fontFamily: "var(--font)" }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--success)", marginBottom: 12 }}>✓ NOVA encontró {rubros.length} rubros — revisa antes de aplicarla</div>

      {lectura.dos && (
        <div style={{ background: "#fff", border: `1.5px solid ${precioElegido ? "var(--border)" : "var(--warning-border)"}`, borderRadius: 8, padding: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)", marginBottom: 2 }}>
            {lectura.pctGeneral != null ? `Esta proforma trae un descuento general del ${lectura.pctGeneral} %.` : "Esta proforma trae dos precios por rubro."} ¿Cuál tomo?
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8 }}>Se aplica a todos los rubros; después puedes corregir uno por uno en la tabla.</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
            {[["pvp", "PVP", "Precio de lista, sin descuento"], ["descuento", "Con descuento", lectura.pctGeneral != null ? `Con el ${lectura.pctGeneral} % aplicado a cada precio` : "El precio neto de la proforma"]].map(([id, label, ayuda]) => (
              <button key={id} onClick={() => elegirPrecio(id)}
                style={{ textAlign: "left", cursor: "pointer", fontFamily: "var(--font)", borderRadius: 8, padding: "8px 10px",
                  border: `1.5px solid ${precioElegido === id ? "var(--ink)" : "var(--border)"}`, background: precioElegido === id ? "var(--neutral-soft)" : "#fff" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{label} · ${fmt(totalOpcion(id))}</div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>{ayuda}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginBottom: 12 }}>
        <div>
          <label style={{ fontSize: 11, color: "var(--ink-soft)", display: "block", marginBottom: 3 }}>A qué capítulo va</label>
          <select value={destino} onChange={e => setDestino(e.target.value)} style={{ ...iS, width: "100%", boxSizing: "border-box", marginBottom: destino ? 0 : 6 }}>
            <option value="">Capítulo nuevo…</option>
            {capitulosActivos.map(c => <option key={c.nombre} value={c.nombre}>{c.orden}. {c.nombre}</option>)}
          </select>
          {!destino && <input value={capNuevo} onChange={e => setCapNuevo(e.target.value)} placeholder="Nombre del capítulo nuevo" style={{ ...iS, width: "100%", boxSizing: "border-box" }} />}
        </div>
        <div>
          <label style={{ fontSize: 11, color: "var(--ink-soft)", display: "block", marginBottom: 3 }}>Utilidad global a todos los rubros (%)</label>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="number" className="num-limpio" value={utilidadGlobal} onChange={e => setUtilidadGlobal(e.target.value)} style={{ ...iS, width: 70 }} />
            <button onClick={() => aplicarUtilidadGlobal(n(utilidadGlobal))} style={{ background: "var(--success)", border: "none", borderRadius: 6, padding: "5px 10px", color: "#fff", fontSize: 11, cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}>Aplicar %</button>
          </div>
        </div>
      </div>

      {/* Rubros, corregibles: NOVA a veces lee mal un número */}
      <div className="pres-tabla" style={{ maxHeight: 260, overflowY: "auto", marginBottom: 12, border: "1px solid var(--success-border)", borderRadius: 8, background: "#fff" }}>
        <table style={{ width: "100%", minWidth: 720, borderCollapse: "collapse", fontSize: 11, tableLayout: "fixed" }}>
          <colgroup><col /><col style={{ width: 56 }} /><col style={{ width: 72 }} /><col style={{ width: 88 }} /><col style={{ width: 60 }} /><col style={{ width: 88 }} /><col style={{ width: 96 }} /><col style={{ width: 28 }} /></colgroup>
          <thead><tr style={{ background: "var(--success-soft)" }}>
            {[["Descripción", "left"], ["Unidad", "left"], ["Cant", "right"], ["P.Original", "right"], ["Util%", "right"], ["P.Final", "right"], ["Total", "right"], ["", ""]].map(([h, al]) => (
              <th key={h || "x"} style={{ padding: "5px 8px", textAlign: al || "left", color: "var(--success)", fontWeight: 600, borderBottom: "1px solid var(--success-border)", whiteSpace: "nowrap" }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {rubros.map((r, i) => (
              <tr key={i} style={{ borderBottom: "1px solid var(--success-soft)" }}>
                <td style={{ padding: "4px 8px", color: "var(--ink)", overflowWrap: "anywhere" }}>{r.descripcion}</td>
                <td style={{ padding: "4px 8px", color: "var(--ink-soft)" }}>{r.unidad}</td>
                <td style={{ padding: "4px 6px" }}><input type="number" className="num-limpio" value={r.cantidad ?? 1} onChange={e => cambiar(i, "cantidad", e.target.value)} style={numS} /></td>
                <td style={{ padding: "4px 6px" }}><input type="number" className="num-limpio" value={r.precio_unitario ?? 0} onChange={e => cambiar(i, "precio_unitario", e.target.value)} style={numS} /></td>
                <td style={{ padding: "4px 6px" }}><input type="number" className="num-limpio" value={r.utilidad_pct || 0} onChange={e => cambiar(i, "utilidad_pct", e.target.value)} style={numS} /></td>
                <td style={{ padding: "4px 8px", fontWeight: 600, color: "var(--success)", textAlign: "right", whiteSpace: "nowrap" }}>${fmt(final(r))}</td>
                <td style={{ padding: "4px 8px", fontWeight: 600, color: "var(--ink)", textAlign: "right", whiteSpace: "nowrap" }}>${fmt(n(r.cantidad || 1) * final(r))}</td>
                <td style={{ padding: "4px 2px", textAlign: "center" }}>
                  <button onClick={() => quitar(i)} title="Quitar este rubro" style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: 13, padding: 0 }}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* El total, antes de aplicarla */}
      <div style={{ background: "#fff", border: `1.5px solid ${chequeo.cuadra === false ? "var(--warning-border)" : "var(--border)"}`, borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 12, color: "var(--ink-soft)" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink)", letterSpacing: 0.3, marginBottom: 6 }}>VERIFICACIÓN DEL TOTAL</div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}><span>NOVA leyó {rubros.length} rubros por</span><strong style={{ color: "var(--ink)" }}>${fmt(leido)}</strong></div>
        {chequeo.cuadra === null && (
          <div style={{ color: "var(--muted)", marginTop: 4 }}>La cotización no trae un total escrito que se pueda comparar. Revísalo contra el documento.</div>
        )}
        {chequeo.cuadra !== null && (
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 2 }}>
            <span>Contra {chequeo.contra}</span><strong style={{ color: "var(--ink)" }}>${fmt(chequeo.valor)}</strong>
          </div>
        )}
        {chequeo.cuadra === true && <div style={{ color: "var(--success)", fontWeight: 600, marginTop: 4 }}>✓ {chequeo.nota || "Cuadra: se leyeron todos los rubros."}</div>}
        {chequeo.cuadra === false && (
          <div style={{ marginTop: 6 }}>
            <div style={{ color: "var(--warning)", fontWeight: 600 }}>
              ⚠ No cuadra: {chequeo.dif < 0 ? `faltan $${fmt(-chequeo.dif)}` : `sobran $${fmt(chequeo.dif)}`}. Puede faltar un rubro o haber un precio mal leído — corrígelo arriba.
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, cursor: "pointer", color: "var(--ink)" }}>
              <input type="checkbox" checked={revisado} onChange={e => setRevisado(e.target.checked)} />
              Lo revisé con la cotización en la mano: importar igual
            </label>
          </div>
        )}
        <div style={{ borderTop: "1px solid var(--neutral-soft)", marginTop: 8, paddingTop: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}><span>Lo que entra al presupuesto{conUtilidad !== leido ? " (con tu utilidad)" : ""}</span><strong style={{ color: "var(--success)" }}>${fmt(conUtilidad)}</strong></div>
          {presupuesto && (
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 2 }}>
              <span>El total del presupuesto pasa de</span>
              <strong style={{ color: "var(--ink)" }}>${fmt(totalCon(subAntes))} → ${fmt(totalCon(subDespues))}</strong>
            </div>
          )}
        </div>
      </div>

      {/* Guardar en BD */}
      <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 8, padding: 10, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: guardarBD ? 10 : 0 }}>
          <input type="checkbox" id="guardar-bd" checked={guardarBD} onChange={e => setGuardarBD(e.target.checked)} style={{ cursor: "pointer" }} />
          <label htmlFor="guardar-bd" style={{ fontSize: 12, color: "var(--ink-soft)", cursor: "pointer", fontWeight: 500 }}>Guardar estos precios en la base de rubros <span style={{ fontWeight: 400, color: "var(--muted)" }}>· quedan como precio de proveedor, al costo</span></label>
        </div>
        {guardarBD && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginTop: 8 }}>
            <div>
              <label style={{ fontSize: 10, color: faltaProveedor ? "var(--warning)" : "var(--ink-soft)", display: "block", marginBottom: 2 }}>Proveedor *</label>
              <input value={proveedor} onChange={e => setProveedor(e.target.value)} placeholder="Quién cotiza" style={{ ...iS, width: "100%", boxSizing: "border-box", borderColor: faltaProveedor ? "var(--warning-border)" : undefined }} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: "var(--ink-soft)", display: "block", marginBottom: 2 }}>Cliente de referencia</label>
              <select value={clienteNombre} onChange={e => setClienteNombre(e.target.value)} style={{ ...iS, width: "100%", boxSizing: "border-box" }}>
                <option value="">Sin cliente</option>
                {clientes.map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 10, color: "var(--ink-soft)", display: "block", marginBottom: 2 }}>Año</label>
              <input value={fecha} onChange={e => setFecha(e.target.value)} placeholder="2025" style={{ ...iS, width: "100%", boxSizing: "border-box" }} />
            </div>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onCancelar} style={{ flex: 1, background: "#fff", border: "1px solid var(--border)", borderRadius: 8, padding: 10, color: "var(--ink-soft)", fontSize: 12, cursor: "pointer" }}>Cancelar</button>
        <button onClick={() => onImportar(rubros, capNombre, utilidadGlobal, guardarBD, proveedor.trim(), clienteNombre, fecha)} disabled={!!bloqueo}
          style={{ flex: 2, background: bloqueo ? "var(--neutral-soft)" : "var(--success)", border: "none", borderRadius: 8, padding: 10, color: bloqueo ? "var(--muted)" : "#fff", fontSize: 13, fontWeight: 600, cursor: bloqueo ? "default" : "pointer" }}>
          {bloqueo || `✓ Aplicar ${rubros.length} rubros ${destino ? `a ${destino}` : "al presupuesto"} · $${fmt(conUtilidad)}`}
        </button>
      </div>
    </div>
  );
}
