import { useEffect, useMemo, useState } from "react";
import { Sparkles, CheckCircle2, Users, Truck } from "lucide-react";
import { supabase } from "../lib/supabase";
import { colors } from "../theme/colors";
import { inputStyle } from "./ui/Input";
import { UNIDADES, etiquetaUnidad } from "../lib/unidades";
import { buscarNombre, sugerirTipo, faltanRespuestas, unidadesPorResolver, unidadParaBase, IGUAL } from "../lib/preguntasNova";
import { compararConBase } from "../lib/analisisUtilidad";

// Las preguntas de NOVA antes de que un presupuesto entre a la base: de dónde
// vienen los precios, de quién, si traen utilidad, y las unidades que no se
// entienden. Controlado: las respuestas viven en el componente que guarda.

async function todas(tabla, select, filtrar = q => q) {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await filtrar(supabase.from(tabla).select(select)).range(desde, desde + 999);
    if (error || !data) return filas;
    filas.push(...data);
    if (data.length < 1000) return filas;
  }
}

const pct = v => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(Math.round(v * 100))} %`;
const CARGO_UTILIDAD = /honorario|utilidad|indirecto|administraci|gerencia|direcci[oó]n t[eé]cnica|fee/i;

export default function PreguntasNova({ rubros = [], respuestas, onCambiar, sugerencia = {}, clientes = [], proveedores = [], cargos = [], ivaIncluido = null, ivaPct = 15 }) {
  const [verVacias, setVerVacias] = useState(false);
  const [verCapitulos, setVerCapitulos] = useState(false);
  const [verEjemplos, setVerEjemplos] = useState(false);
  const [base, setBase] = useState(null);

  // La base contra la que se comparan los precios, leída una vez al abrir.
  useEffect(() => {
    let vivo = true;
    Promise.all([
      todas("rubros", "id,descripcion,unidad", q => q.eq("activo", true)),
      todas("precios_historial", "*"),
    ]).then(([rs, ps]) => { if (vivo) setBase({ rubros: rs, precios: ps }); });
    return () => { vivo = false; };
  }, []);

  const falta = faltanRespuestas(respuestas, rubros);
  const { raras, vacias } = unidadesPorResolver(rubros);
  const tipoSugerido = sugerirTipo(sugerencia);
  const set = cambios => onCambiar({ ...respuestas, ...cambios });
  const utilidad = respuestas.utilidad || { estado: null, pct: "", porCapitulo: {} };
  const setUtilidad = cambios => set({ utilidad: { ...utilidad, ...cambios } });

  const analisis = useMemo(() => {
    if (!base) return null;
    const conUnidad = rubros.filter(r => r.origen !== "ajuste").map(r => ({ ...r, unidad: unidadParaBase(r, respuestas) }));
    return compararConBase(conUnidad, base, { ivaIncluido: ivaIncluido === true, ivaPct });
  }, [base, rubros, respuestas, ivaIncluido, ivaPct]);
  const capitulos = useMemo(() => [...new Set(rubros.filter(r => r.origen !== "ajuste").map(r => r.capitulo).filter(Boolean))], [rubros]);
  const cargoUtilidad = cargos.find(c => CARGO_UTILIDAD.test(c.descripcion));
  const difSugerida = analisis?.referencia === "costo" && analisis.diferencia > 0.03 ? Math.round(analisis.diferencia * 100) : null;

  const elegirTipo = tipo => {
    const cambios = { tipo };
    if (tipo === "proveedor" && !respuestas.proveedor && sugerencia.emisor) cambios.proveedor = sugerencia.emisor;
    if (!respuestas.cliente && sugerencia.cliente) cambios.cliente = sugerencia.cliente;
    set(cambios);
  };
  const elegirUtilidad = estado => setUtilidad({ estado, ...(estado === "con_utilidad" && !utilidad.pct && difSugerida ? { pct: String(difSugerida) } : {}) });

  const lbl = { fontSize: 12, fontWeight: 600, color: colors.ink, display: "block", marginBottom: 6 };
  const campo = { ...inputStyle, padding: "7px 10px", fontSize: 13 };
  const bloque = { padding: "12px 0", borderTop: `1px solid ${colors.neutralSoft}` };
  const nota = { fontSize: 11, color: colors.inkSoft, marginTop: 6, lineHeight: 1.5 };

  return (
    <div style={{ background: colors.surface, border: `1.5px solid ${falta.length ? colors.brand : colors.successBorder}`, borderRadius: colors.radiusMd, padding: "12px 14px 2px", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
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
          {[["cliente", <Users size={14} />, "De un cliente", "Lo que HCA le cotizó"], ["proveedor", <Truck size={14} />, "De un proveedor o contratista", "Lo que le cobran a HCA"]].map(([v, icono, t, sub]) => (
            <Opcion key={v} activa={respuestas.tipo === v} onClick={() => elegirTipo(v)} icono={icono} texto={t} sub={sub} />
          ))}
        </div>
        {tipoSugerido && !respuestas.tipo && (
          <div style={nota}>
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

      {/* Utilidad: se compara con lo que ya hay en la base y se pregunta */}
      <div style={bloque}>
        <label style={lbl}>¿Estos precios son al costo o ya traen utilidad?</label>
        <div style={{ fontSize: 12, color: colors.inkSoft, lineHeight: 1.5, marginBottom: 8 }}>
          {!analisis ? "NOVA está comparando con los precios de la base…"
            : analisis.n === 0 ? "Ninguno de estos rubros está todavía en la base: NOVA no tiene con qué comparar."
            : analisis.referencia === "costo" ? (
              <>Comparados con lo que ya sabes que cuestan, en <strong>{analisis.n} rubros</strong> estos precios están{" "}
                <strong style={{ color: Math.abs(analisis.diferencia) < 0.05 ? colors.success : colors.warning }}>
                  {Math.abs(analisis.diferencia) < 0.05 ? "prácticamente iguales" : `${pct(analisis.diferencia)} en promedio`}
                </strong>
                {analisis.rango && Math.abs(analisis.diferencia) >= 0.05 && <> (la mitad de ellos entre {pct(analisis.rango[0])} y {pct(analisis.rango[1])})</>}.
              </>
            ) : (
              <>No hay precios al costo de estos rubros. Contra los precios anteriores ({analisis.n} rubros, sin saber si eran al costo) están{" "}
                <strong>{Math.abs(analisis.diferencia) < 0.05 ? "prácticamente iguales" : `${pct(analisis.diferencia)} en promedio`}</strong>.</>
            )}
          {ivaIncluido === null && analisis?.n > 0 && <span style={{ color: colors.muted }}> Responde lo del IVA para comparar sin IVA.</span>}
          {cargoUtilidad && <div style={{ marginTop: 4 }}>El presupuesto suma aparte <strong>"{cargoUtilidad.descripcion}"</strong>: cuando la utilidad va al final, los rubros suelen ir al costo.</div>}
          {analisis?.n > 0 && (
            <div style={{ marginTop: 4 }}>
              <button onClick={() => setVerEjemplos(v => !v)} style={enlace}>{verEjemplos ? "Ocultar ejemplos" : "Ver ejemplos"}</button>
              {analisis.descartados > 0 && <span style={{ color: colors.muted }}> · {analisis.descartados} rubros no se usaron por estar al doble o a la mitad: parecen otro alcance.</span>}
            </div>
          )}
          {verEjemplos && analisis?.ejemplos.map((e, i) => (
            <div key={i} style={{ fontSize: 11, color: colors.inkSoft, display: "flex", gap: 8, padding: "2px 0" }}>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.descripcion}</span>
              <span style={{ flexShrink: 0 }}>${e.nuevo.toFixed(2)} contra ${e.referencia.toFixed(2)} ({pct(e.ratio - 1)})</span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Opcion activa={utilidad.estado === "costo"} onClick={() => elegirUtilidad("costo")} texto="Al costo" sub="Sin utilidad en los rubros" />
          <Opcion activa={utilidad.estado === "con_utilidad"} onClick={() => elegirUtilidad("con_utilidad")} texto="Con utilidad" sub={difSugerida ? `NOVA calcula ${difSugerida} %` : "Dices cuánto %"} />
          <Opcion activa={utilidad.estado === "desconocida"} onClick={() => elegirUtilidad("desconocida")} texto="Con utilidad, no sé cuánto" sub="No cuenta al comparar costos" />
        </div>

        {utilidad.estado === "con_utilidad" && (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: colors.inkSoft }}>Utilidad</span>
              <input type="number" value={utilidad.pct} onChange={e => setUtilidad({ pct: e.target.value })} placeholder="%" style={{ ...campo, width: 80 }} />
              <span style={{ fontSize: 12, color: colors.inkSoft }}>% sobre el costo</span>
              {capitulos.length > 1 && <button onClick={() => setVerCapitulos(v => !v)} style={enlace}>{verCapitulos ? "Ocultar capítulos" : "Es distinta por capítulo"}</button>}
            </div>
            {verCapitulos && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, color: colors.muted, marginBottom: 4 }}>
                  Deja vacío el capítulo que lleva el % general.
                  {analisis?.referencia === "costo" && analisis.porCapitulo.some(c => c.n >= 2) && (
                    <> <button onClick={() => setUtilidad({ porCapitulo: Object.fromEntries(analisis.porCapitulo.filter(c => c.n >= 2 && c.diferencia > 0.03).map(c => [c.capitulo, String(Math.round(c.diferencia * 100))])) })} style={enlace}>Usar lo que calcula NOVA por capítulo</button></>
                  )}
                </div>
                {capitulos.map(c => {
                  const a = analisis?.porCapitulo.find(x => x.capitulo === c);
                  return (
                    <div key={c} style={{ display: "grid", gridTemplateColumns: "minmax(180px, 1fr) 130px 80px", gap: 8, alignItems: "center", padding: "2px 0" }}>
                      <span style={{ fontSize: 12, color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c}>{c}</span>
                      <span style={{ fontSize: 11, color: colors.muted }}>{a ? `${pct(a.diferencia)} en ${a.n} rubros` : "sin con qué comparar"}</span>
                      <input type="number" value={utilidad.porCapitulo?.[c] ?? ""} placeholder={utilidad.pct || "%"}
                        onChange={e => setUtilidad({ porCapitulo: { ...utilidad.porCapitulo, [c]: e.target.value } })} style={{ ...campo, padding: "5px 8px", fontSize: 12 }} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

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

function Opcion({ activa, onClick, icono, texto, sub }) {
  return (
    <button onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 8, textAlign: "left", padding: "8px 12px", borderRadius: colors.radiusSm, cursor: "pointer", fontFamily: colors.font,
        border: `1.5px solid ${activa ? colors.brand : colors.border}`, background: activa ? colors.brand : "#fff", color: activa ? "#fff" : colors.ink }}>
      {icono}
      <span><span style={{ display: "block", fontSize: 12, fontWeight: 600 }}>{texto}</span>{sub && <span style={{ display: "block", fontSize: 10, opacity: 0.8 }}>{sub}</span>}</span>
    </button>
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
