import { useState } from "react";
import { Sparkles, CheckCircle2, Users, Truck } from "lucide-react";
import { colors } from "../theme/colors";
import { inputStyle } from "./ui/Input";
import { UNIDADES, etiquetaUnidad } from "../lib/unidades";
import { buscarNombre, sugerirTipo, faltanRespuestas, unidadesPorResolver, IGUAL } from "../lib/preguntasNova";

// Las preguntas de NOVA antes de que un presupuesto entre a la base: de dónde
// vienen los precios, de quién, y las unidades que no se entienden. Controlado:
// las respuestas viven en el componente que guarda.
export default function PreguntasNova({ rubros = [], respuestas, onCambiar, sugerencia = {}, clientes = [], proveedores = [] }) {
  const [verVacias, setVerVacias] = useState(false);
  const falta = faltanRespuestas(respuestas, rubros);
  const { raras, vacias } = unidadesPorResolver(rubros);
  const tipoSugerido = sugerirTipo(sugerencia);
  const set = cambios => onCambiar({ ...respuestas, ...cambios });

  const elegirTipo = tipo => {
    const cambios = { tipo };
    if (tipo === "proveedor" && !respuestas.proveedor && sugerencia.emisor) cambios.proveedor = sugerencia.emisor;
    if (!respuestas.cliente && sugerencia.cliente) cambios.cliente = sugerencia.cliente;
    set(cambios);
  };

  const lbl = { fontSize: 12, fontWeight: 600, color: colors.ink, display: "block", marginBottom: 6 };
  const campo = { ...inputStyle, padding: "7px 10px", fontSize: 13 };
  const bloque = { padding: "12px 0", borderTop: `1px solid ${colors.neutralSoft}` };

  return (
    <div style={{ background: colors.surface, border: `1.5px solid ${falta.length ? colors.brand : colors.successBorder}`, borderRadius: colors.radiusMd, padding: "12px 14px 2px", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        {falta.length ? <Sparkles size={15} color={colors.brand} /> : <CheckCircle2 size={15} color={colors.success} />}
        <span style={{ fontSize: 13, fontWeight: 700, color: falta.length ? colors.brand : colors.success }}>
          {falta.length ? "NOVA necesita saber algunas cosas antes de guardar" : "NOVA ya no tiene preguntas"}
        </span>
        {falta.length > 0 && <span style={{ fontSize: 11, color: colors.inkSoft }}>Falta: {falta.join(", ")}</span>}
      </div>

      {/* Origen de los precios */}
      <div style={bloque}>
        <label style={lbl}>¿De dónde vienen estos precios?</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[["cliente", <Users size={14} />, "De un cliente", "Lo que HCA le cotizó"], ["proveedor", <Truck size={14} />, "De un proveedor o contratista", "Lo que le cobran a HCA"]].map(([v, icono, t, sub]) => {
            const activo = respuestas.tipo === v;
            return (
              <button key={v} onClick={() => elegirTipo(v)}
                style={{ display: "flex", alignItems: "center", gap: 8, textAlign: "left", padding: "8px 12px", borderRadius: colors.radiusSm, cursor: "pointer", fontFamily: colors.font,
                  border: `1.5px solid ${activo ? colors.brand : colors.border}`, background: activo ? colors.brand : "#fff", color: activo ? "#fff" : colors.ink }}>
                {icono}
                <span><span style={{ display: "block", fontSize: 12, fontWeight: 600 }}>{t}</span><span style={{ display: "block", fontSize: 10, opacity: 0.8 }}>{sub}</span></span>
              </button>
            );
          })}
        </div>
        {tipoSugerido && !respuestas.tipo && (
          <div style={{ fontSize: 11, color: colors.inkSoft, marginTop: 6 }}>
            NOVA cree que es de {tipoSugerido === "proveedor" ? `un proveedor${sugerencia.emisor ? `: el documento lo hizo ${sugerencia.emisor}` : ""}` : "un cliente: el documento lo hizo HCA"}.
          </div>
        )}
      </div>

      {respuestas.tipo && (
        <div style={{ ...bloque, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
          {respuestas.tipo === "proveedor" && (
            <div>
              <label style={lbl}>Proveedor o contratista <span style={{ color: colors.danger }}>*</span></label>
              <input list="nova-proveedores" value={respuestas.proveedor} onChange={e => set({ proveedor: e.target.value })} placeholder="Quién cotiza" style={campo} />
              <datalist id="nova-proveedores">{proveedores.map(p => <option key={p.id ?? p.nombre} value={p.nombre} />)}</datalist>
              <EstadoNombre nombre={respuestas.proveedor} lista={proveedores} que="proveedor" onUsar={v => set({ proveedor: v })} />
            </div>
          )}
          <div>
            <label style={lbl}>
              {respuestas.tipo === "cliente" ? <>Cliente <span style={{ color: colors.danger }}>*</span></> : "Para qué cliente era (opcional)"}
            </label>
            <input list="nova-clientes" value={respuestas.cliente} onChange={e => set({ cliente: e.target.value })} placeholder="Nombre del cliente" style={campo} />
            <datalist id="nova-clientes">{clientes.map(c => <option key={c.id ?? c.nombre} value={c.nombre} />)}</datalist>
            <EstadoNombre nombre={respuestas.cliente} lista={clientes} que="cliente" onUsar={v => set({ cliente: v })} />
          </div>
        </div>
      )}

      {/* Unidades que no se entienden */}
      {raras.length > 0 && (
        <div style={bloque}>
          <label style={lbl}>¿Qué unidad es esta?</label>
          {raras.map(u => (
            <div key={u.texto} style={{ display: "grid", gridTemplateColumns: "minmax(200px, 1fr) 220px", gap: 10, alignItems: "center", padding: "4px 0" }}>
              <div style={{ fontSize: 12, color: colors.inkSoft, minWidth: 0 }}>
                <strong style={{ color: colors.ink }}>"{u.texto}"</strong> en {u.rubros.length} {u.rubros.length === 1 ? "rubro" : "rubros"}
                {u.estado === "ambigua" && " — ¿metro lineal o cuadrado?"}
                {u.estado === "desconocida" && /^[\d.,]+$/.test(u.texto) && " — parece un número en la columna de unidad"}
                <div style={{ fontSize: 11, color: colors.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>ej. {u.rubros.slice(0, 2).map(r => r.descripcion).join(" · ")}</div>
              </div>
              <select value={respuestas.unidades[u.texto] || ""} onChange={e => set({ unidades: { ...respuestas.unidades, [u.texto]: e.target.value } })}
                style={{ ...campo, borderColor: respuestas.unidades[u.texto] ? colors.border : colors.brand }}>
                <option value="">Elegir…</option>
                {UNIDADES.map(x => <option key={x.id} value={x.id}>{etiquetaUnidad(x.id)} · {x.nombre}</option>)}
                <option value={IGUAL}>Dejar "{u.texto}" como está</option>
              </select>
            </div>
          ))}
        </div>
      )}

      {/* Rubros sin unidad */}
      {vacias.length > 0 && (
        <div style={bloque}>
          <label style={lbl}>{vacias.length} {vacias.length === 1 ? "rubro no tiene" : "rubros no tienen"} unidad</label>
          <div style={{ fontSize: 11, color: colors.inkSoft, marginBottom: 8 }}>Sin unidad, su precio no se puede comparar con otros.</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => setVerVacias(v => !v)} style={chip(false)}>{verVacias ? "Ocultar" : "Elegir la unidad de cada uno"}</button>
            <button onClick={() => set({ sinUnidadOk: !respuestas.sinUnidadOk })} style={chip(respuestas.sinUnidadOk)}>
              {respuestas.sinUnidadOk ? "✓ Se guardan sin unidad" : "Guardarlos sin unidad"}
            </button>
          </div>
          {verVacias && (
            <div style={{ marginTop: 8, maxHeight: 240, overflowY: "auto" }}>
              {vacias.map(r => (
                <div key={r.fila} style={{ display: "grid", gridTemplateColumns: "minmax(200px, 1fr) 160px", gap: 10, alignItems: "center", padding: "3px 0" }}>
                  <span style={{ fontSize: 12, color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.descripcion}>{r.descripcion}</span>
                  <select value={respuestas.unidadFila[r.fila] || ""} onChange={e => set({ unidadFila: { ...respuestas.unidadFila, [r.fila]: e.target.value } })} style={campo}>
                    <option value="">Sin unidad</option>
                    {UNIDADES.map(x => <option key={x.id} value={x.id}>{etiquetaUnidad(x.id)} · {x.nombre}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function chip(activo) {
  return { padding: "6px 11px", borderRadius: colors.radiusSm, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: colors.font,
    border: `1.5px solid ${activo ? colors.success : colors.border}`, background: activo ? colors.successSoft : "#fff", color: activo ? colors.success : colors.inkSoft };
}

// Si el nombre ya está registrado, parecido a otro, o es nuevo. Evita que el
// mismo cliente quede dos veces por una tilde ("Fowler Durán" y "Fowler Duran").
function EstadoNombre({ nombre, lista, que, onUsar }) {
  if (!String(nombre || "").trim()) return null;
  const { exacto, parecidos } = buscarNombre(nombre, lista);
  const estilo = { fontSize: 11, marginTop: 5, lineHeight: 1.5 };
  if (exacto) {
    return (
      <div style={{ ...estilo, color: colors.success }}>
        ✓ {que === "cliente" ? "Cliente" : "Proveedor"} ya registrado
        {exacto.nombre !== nombre.trim() && <> como <button onClick={() => onUsar(exacto.nombre)} style={enlace}>{exacto.nombre}</button></>}
      </div>
    );
  }
  return (
    <div style={{ ...estilo, color: colors.inkSoft }}>
      {parecidos.length > 0 ? (
        <>¿Es alguno de estos? {parecidos.map(p => <button key={p.nombre} onClick={() => onUsar(p.nombre)} style={{ ...enlace, marginRight: 8 }}>{p.nombre}</button>)}<br />Si no, se registra como {que} nuevo.</>
      ) : <>Es {que === "cliente" ? "un cliente nuevo" : "un proveedor nuevo"}: se va a registrar.</>}
    </div>
  );
}

const enlace = { background: "none", border: "none", padding: 0, color: colors.brand, fontWeight: 600, fontSize: 11, cursor: "pointer", textDecoration: "underline", fontFamily: "inherit" };
