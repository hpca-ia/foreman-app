import { useState, useEffect, useMemo } from "react";
import { Sparkles, AlertTriangle, ArrowUp, ArrowDown, Check, X, Loader2 } from "lucide-react";
import { colors } from "../../theme/colors";
import { preciosDeLaBase } from "../../lib/baseRubros";
import { pedirNova, parseJSONTolerante } from "../../lib/leerExcelPresupuesto";
import { UNIDADES, normalizarUnidad, etiquetaUnidad } from "../../lib/unidades";

// Revisar un presupuesto antes de mandarlo: la misma información, mirada de
// otra forma.
//
// El orden real —capítulos y rubros— no se toca: esta tabla se ordena por lo
// que interesa al revisar (lo que más plata mueve, el precio más alto, la
// cantidad más grande). Las alertas salen solas, sin IA: sin precio, vendido
// bajo costo, lejos de lo que sabe la base, repetido. NOVA agrega lo que un
// programa no ve: ortografía, descripciones que no dicen lo que hay que
// hacer, unidades que no calzan, cantidades raras.

const n = v => Number(v) || 0;
const fmt = v => n(v).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cant = v => n(v).toLocaleString("es-EC", { maximumFractionDigits: 2 });
const pelado = t => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
const mediana = a => { const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

const TIPOS_NOVA = { ortografia: "Ortografía", descripcion: "Descripción", unidad: "Unidad", cantidad: "Cantidad", precio: "Precio", otro: "Otro" };

export default function RevisarPresupuesto({ items, capitulos, onActualizar }) {
  const [orden, setOrden] = useState({ campo: "total", dir: "desc" });
  const [filtro, setFiltro] = useState("todos");        // todos | alertas | nova
  const [base, setBase] = useState(null);
  const [nova, setNova] = useState({ estado: "nada", obs: [] });
  const [resueltas, setResueltas] = useState({});       // índice de observación → "aplicada" | "ignorada"

  useEffect(() => { preciosDeLaBase().then(setBase).catch(() => setBase({ buscar: () => null })); }, []);

  // ── Numeración como en pantalla, y lo que se calcula de cada rubro ──
  const filas = useMemo(() => {
    const caps = [...capitulos].sort((a, b) => a.orden - b.orden);
    const totalGeneral = items.reduce((s, i) => s + n(i.total), 0) || 1;
    const claves = {};
    items.forEach(i => { const k = pelado(i.descripcion); (claves[k] = claves[k] || []).push(i); });
    const salida = [];
    caps.forEach(c => {
      items.filter(i => i.capitulo === c.nombre).sort((a, b) => n(a.orden) - n(b.orden)).forEach((i, k) => {
        const precioBase = n(i.precio_base) > 0 ? n(i.precio_base) : n(i.precio_unitario);
        const util = n(i.utilidad_pct);
        const pct = n(i.total) / totalGeneral * 100;
        const alertas = [];
        if (n(i.precio_unitario) <= 0) alertas.push("Sin precio");
        if (n(i.cantidad) <= 0) alertas.push("Sin cantidad");
        if (!String(i.unidad || "").trim()) alertas.push("Sin unidad");
        if (n(i.precio_base) > 0 && n(i.precio_unitario) > 0 && n(i.precio_unitario) < n(i.precio_base) - 0.005) alertas.push(`Bajo el precio base (${util.toFixed(1)} %)`);
        if (util > 60) alertas.push(`Utilidad de ${util.toFixed(0)} %`);
        if (pct >= 15) alertas.push(`Concentra el ${pct.toFixed(0)} % del presupuesto`);
        const iguales = claves[pelado(i.descripcion)] || [];
        if (iguales.length > 1) {
          const unidades = new Set(iguales.map(x => pelado(x.unidad)));
          alertas.push(unidades.size > 1 ? "El mismo rubro aparece con otra unidad" : `Repetido: aparece ${iguales.length} veces`);
        }
        const deBase = base?.buscar(i)?.precios?.map(p => n(p.precio_unitario)).filter(v => v > 0) || [];
        if (deBase.length && precioBase > 0) {
          const ref = mediana(deBase), dif = (precioBase / ref - 1) * 100;
          if (Math.abs(dif) >= 40) alertas.push(`Base ${dif > 0 ? "+" : ""}${dif.toFixed(0)} % vs. la base de rubros ($${fmt(ref)})`);
        }
        salida.push({ ...i, numero: `${c.orden}.${k + 1}`, capOrden: c.orden, pos: k, precioBase, util, pct, alertas });
      });
    });
    return salida;
  }, [items, capitulos, base]);

  // Observaciones de NOVA por rubro, sin las ya resueltas.
  const obsPorId = useMemo(() => {
    const m = {};
    nova.obs.forEach((o, idx) => { if (!resueltas[idx] && o._id != null) (m[o._id] = m[o._id] || []).push({ ...o, idx }); });
    return m;
  }, [nova.obs, resueltas]);

  const vistas = useMemo(() => {
    let v = filas;
    if (filtro === "alertas") v = v.filter(f => f.alertas.length);
    if (filtro === "nova") v = v.filter(f => obsPorId[f.id]);
    const val = f => orden.campo === "numero" ? f.capOrden * 10000 + f.pos
      : orden.campo === "descripcion" ? pelado(f.descripcion)
      : orden.campo === "precio" ? n(f.precio_unitario)
      : orden.campo === "base" ? f.precioBase
      : orden.campo === "util" ? f.util
      : orden.campo === "cantidad" ? n(f.cantidad)
      : n(f.total);
    return [...v].sort((a, b) => { const x = val(a), y = val(b); const c = x < y ? -1 : x > y ? 1 : 0; return orden.dir === "asc" ? c : -c; });
  }, [filas, filtro, orden, obsPorId]);

  // Cuánto pesa cada capítulo en el costo directo (sin honorarios ni IVA).
  const pesos = useMemo(() => {
    const total = items.reduce((s, i) => s + n(i.total), 0) || 1;
    return [...capitulos].sort((a, b) => a.orden - b.orden)
      .map(c => { const m = items.filter(i => i.capitulo === c.nombre).reduce((s, i) => s + n(i.total), 0); return { ...c, monto: m, pct: m / total * 100 }; })
      .filter(c => c.monto > 0);
  }, [items, capitulos]);
  const mayor = Math.max(1, ...pesos.map(p => p.pct));

  const conAlertas = filas.filter(f => f.alertas.length).length;
  const conNova = Object.keys(obsPorId).length;

  async function revisarConNova() {
    setNova({ estado: "leyendo", obs: [], hechos: 0, lotes: 1 }); setResueltas({});
    const porNumero = new Map(filas.map(f => [f.numero, f.id]));
    const lotes = [];
    for (let i = 0; i < filas.length; i += 100) lotes.push(filas.slice(i, i + 100));
    const obs = [];
    try {
      for (let k = 0; k < lotes.length; k++) {
        setNova(x => ({ ...x, lotes: lotes.length, hechos: k }));
        const lista = lotes[k].map(f => ({ n: f.numero, cap: f.capitulo, d: f.descripcion, u: f.unidad, q: n(f.cantidad), p: n(f.precio_unitario) }));
        const prompt = `Eres un revisor de presupuestos de construcción en Ecuador. Revisa estos rubros de un presupuesto y señala solo lo que haya que corregir.

Devuelve SOLO JSON, sin markdown: {"obs":[{"n":"1.2","tipo":"ortografia|descripcion|unidad|cantidad|precio|otro","mensaje":"qué pasa, en una línea","descripcion":"texto completo corregido o null","unidad":"unidad sugerida o null"}]}

Qué revisar:
- ortografia: faltas de ortografía, tildes, gramática, mayúsculas incoherentes. En "descripcion" pon la descripción completa ya corregida.
- descripcion: descripciones ambiguas o incompletas que no dicen material, espesor, dimensión o acabado cuando hace falta para cotizar. Propón una redacción técnica clara en "descripcion", sin inventar especificaciones que no se deduzcan.
- unidad: la unidad no corresponde al rubro (por ejemplo pintura por "u" en vez de "m2"). Pon la sugerida en "unidad", SOLO una de estas: ${UNIDADES.map(u => u.id).join(", ")}.
- cantidad o precio: valores atípicos para ese tipo de rubro o incoherentes con el resto del presupuesto. Explícalo en "mensaje". No inventes precios de mercado exactos.
- otro: cualquier otra cosa rara (rubros que parecen duplicados con otra redacción, un rubro en el capítulo equivocado).

Reglas: no incluyas rubros que estén bien. No reescribas por gusto una descripción correcta. Mantén el estilo del presupuesto. Si todo está bien, devuelve {"obs":[]}.

Rubros (n = número, cap = capítulo, d = descripción, u = unidad, q = cantidad, p = precio unitario):
${JSON.stringify(lista)}`;
        const data = await pedirNova({ model: "claude-sonnet-4-5", max_tokens: 8000, messages: [{ role: "user", content: prompt }] });
        if (data?.error) throw new Error(typeof data.error === "string" ? data.error : data.error.message || "NOVA no respondió");
        const parsed = parseJSONTolerante(data?.content?.[0]?.text || "");
        (parsed?.obs || []).forEach(o => {
          const id = porNumero.get(String(o.n || "").trim());
          if (id == null) return;
          const actual = filas.find(f => f.id === id);
          // Una "corrección" igual al original no es una corrección.
          const descripcion = o.descripcion && String(o.descripcion).trim() !== String(actual.descripcion || "").trim() ? String(o.descripcion).trim() : null;
          const sugerida = o.unidad ? normalizarUnidad(o.unidad).canon : null;
          const unidad = sugerida && sugerida !== normalizarUnidad(actual.unidad).canon ? sugerida : null;
          obs.push({ ...o, _id: id, descripcion, unidad, tipo: TIPOS_NOVA[o.tipo] ? o.tipo : "otro" });
        });
      }
      setNova({ estado: "listo", obs, hechos: lotes.length, lotes: lotes.length });
    } catch (e) {
      setNova({ estado: "error", obs, error: e.message });
    }
  }

  async function aplicar(o) {
    const campos = {};
    if (o.descripcion) campos.descripcion = o.descripcion;
    if (o.unidad) campos.unidad = o.unidad;
    if (Object.keys(campos).length) await onActualizar(o._id, campos);
    setResueltas(r => ({ ...r, [o.idx]: "aplicada" }));
  }
  async function aplicarOrtografia() {
    const todas = Object.values(obsPorId).flat().filter(o => o.tipo === "ortografia" && o.descripcion);
    for (const o of todas) await aplicar(o);
  }

  const cab = (campo, label, al = "right") => (
    <th onClick={() => setOrden(o => ({ campo, dir: o.campo === campo && o.dir === "desc" ? "asc" : "desc" }))}
      style={{ padding: "7px 8px", textAlign: al, fontSize: 10, color: orden.campo === campo ? colors.ink : colors.inkSoft, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", userSelect: "none", borderBottom: `1px solid ${colors.border}`, background: colors.bg, position: "sticky", top: 0, zIndex: 1 }}>
      {label}{orden.campo === campo && (orden.dir === "desc" ? <ArrowDown size={10} style={{ marginLeft: 2, verticalAlign: -1 }} /> : <ArrowUp size={10} style={{ marginLeft: 2, verticalAlign: -1 }} />)}
    </th>
  );
  const celda = { padding: "6px 8px", borderBottom: `1px solid ${colors.neutralSoft}`, fontSize: 12, verticalAlign: "top" };
  const chip = activo => ({ padding: "5px 12px", borderRadius: 16, border: `1px solid ${activo ? colors.ink : colors.border}`, background: activo ? colors.ink : colors.surface, color: activo ? "#fff" : colors.inkSoft, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: colors.font });
  const pendientes = Object.values(obsPorId).flat();
  const deOrtografia = pendientes.filter(o => o.tipo === "ortografia" && o.descripcion).length;

  return (
    <div>
      {/* ── NOVA ── */}
      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 14, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Sparkles size={16} color={colors.ink} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: colors.ink }}>Revisión de NOVA</div>
            <div style={{ fontSize: 11, color: colors.muted }}>Ortografía, descripciones poco claras, unidades que no calzan, cantidades y precios raros.</div>
          </div>
          <button onClick={revisarConNova} disabled={nova.estado === "leyendo" || !filas.length}
            style={{ background: colors.ink, color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: colors.font, display: "flex", alignItems: "center", gap: 6 }}>
            {nova.estado === "leyendo" ? <><Loader2 size={13} /> Revisando{nova.lotes > 1 ? ` ${nova.hechos + 1} de ${nova.lotes}` : ""}…</> : nova.estado === "nada" ? "Que NOVA revise" : "Revisar de nuevo"}
          </button>
        </div>
        {nova.estado === "error" && <div style={{ fontSize: 12, color: colors.danger, marginTop: 8 }}>NOVA no pudo terminar: {nova.error}</div>}
        {nova.estado === "listo" && (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: pendientes.length ? 8 : 0 }}>
              <span style={{ fontSize: 12, color: pendientes.length ? colors.ink : colors.success, fontWeight: 600 }}>
                {pendientes.length ? `${pendientes.length} ${pendientes.length === 1 ? "observación pendiente" : "observaciones pendientes"}` : "✓ Sin observaciones pendientes"}
              </span>
              {deOrtografia > 1 && <button onClick={aplicarOrtografia} style={{ ...chip(false), padding: "3px 10px", fontSize: 11 }}>Aplicar las {deOrtografia} de ortografía</button>}
            </div>
            <div style={{ display: "grid", gap: 6, maxHeight: 320, overflowY: "auto" }}>
              {pendientes.map(o => {
                const f = filas.find(x => x.id === o._id);
                return (
                  <div key={o.idx} style={{ border: `1px solid ${colors.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 12 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: colors.inkSoft, background: colors.neutralSoft, borderRadius: 4, padding: "1px 6px" }}>{TIPOS_NOVA[o.tipo]}</span>
                      <span style={{ color: colors.muted }}>{f?.numero}</span>
                      <span style={{ color: colors.ink, flex: 1, minWidth: 160 }}>{o.mensaje}</span>
                    </div>
                    {(o.descripcion || o.unidad) && (
                      <div style={{ marginTop: 5, lineHeight: 1.45 }}>
                        {o.descripcion && <><div style={{ color: colors.muted, textDecoration: "line-through" }}>{f?.descripcion}</div><div style={{ color: colors.ink }}>{o.descripcion}</div></>}
                        {o.unidad && <div style={{ color: colors.ink }}>Unidad: <span style={{ color: colors.muted, textDecoration: "line-through" }}>{etiquetaUnidad(f?.unidad) || "—"}</span> → {etiquetaUnidad(o.unidad)}</div>}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                      {(o.descripcion || o.unidad) && <button onClick={() => aplicar(o)} style={{ ...chip(true), padding: "3px 10px", fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}><Check size={11} /> Aplicar</button>}
                      <button onClick={() => setResueltas(r => ({ ...r, [o.idx]: "ignorada" }))} style={{ ...chip(false), padding: "3px 10px", fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}><X size={11} /> {o.descripcion || o.unidad ? "Ignorar" : "Entendido"}</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Peso de cada capítulo ── */}
      {pesos.length > 0 && (
        <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 14, marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: colors.ink, marginBottom: 2 }}>Peso de cada capítulo</div>
          <div style={{ fontSize: 11, color: colors.muted, marginBottom: 10 }}>Sobre el costo directo, sin honorarios ni IVA.</div>
          <div style={{ display: "grid", gap: 5 }}>
            {[...pesos].sort((a, b) => b.pct - a.pct).map(c => (
              <div key={c.nombre} style={{ display: "grid", gridTemplateColumns: "minmax(120px, 2fr) 3fr 64px 96px", gap: 8, alignItems: "center", fontSize: 12 }}>
                <span style={{ color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.nombre}>{c.orden}. {c.nombre}</span>
                <div style={{ background: colors.neutralSoft, borderRadius: 3, height: 8 }}><div style={{ width: `${c.pct / mayor * 100}%`, background: colors.ink, borderRadius: 3, height: 8 }} /></div>
                <span style={{ textAlign: "right", fontWeight: 700, color: colors.ink }}>{c.pct.toFixed(1)} %</span>
                <span style={{ textAlign: "right", color: colors.inkSoft }}>${fmt(c.monto)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Tabla para revisar ── */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
        <button onClick={() => setFiltro("todos")} style={chip(filtro === "todos")}>Todos ({filas.length})</button>
        <button onClick={() => setFiltro("alertas")} style={chip(filtro === "alertas")}>Con alertas ({conAlertas})</button>
        {nova.estado === "listo" && <button onClick={() => setFiltro("nova")} style={chip(filtro === "nova")}>Con observaciones de NOVA ({conNova})</button>}
        <span style={{ fontSize: 11, color: colors.muted, marginLeft: "auto" }}>Toca una columna para ordenar. El orden del presupuesto no cambia.</span>
      </div>
      <div className="pres-tabla" style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10, maxHeight: "70vh", overflowY: "auto" }}>
        <table style={{ width: "100%", minWidth: 980, borderCollapse: "collapse", tableLayout: "fixed" }}>
          <colgroup><col style={{ width: 54 }} /><col /><col style={{ width: 54 }} /><col style={{ width: 84 }} /><col style={{ width: 88 }} /><col style={{ width: 62 }} /><col style={{ width: 88 }} /><col style={{ width: 100 }} /><col style={{ width: 60 }} /><col style={{ width: 200 }} /></colgroup>
          <thead>
            <tr>
              {cab("numero", "N°", "left")}{cab("descripcion", "Descripción", "left")}
              <th style={{ ...celda, fontSize: 10, color: colors.inkSoft, fontWeight: 700, background: colors.bg, position: "sticky", top: 0, zIndex: 1 }}>Und</th>
              {cab("cantidad", "Cantidad")}{cab("base", "P.Base")}{cab("util", "Util%")}{cab("precio", "P.Final")}{cab("total", "Total")}{cab("total", "% total")}
              <th style={{ ...celda, fontSize: 10, color: colors.inkSoft, fontWeight: 700, background: colors.bg, position: "sticky", top: 0, zIndex: 1, textAlign: "left" }}>Alertas</th>
            </tr>
          </thead>
          <tbody>
            {vistas.map(f => (
              <tr key={f.id} style={{ background: f.alertas.length ? colors.warningSoft : undefined }}>
                <td style={{ ...celda, color: colors.muted, fontSize: 11 }}>{f.numero}</td>
                <td style={{ ...celda, overflowWrap: "anywhere" }}>
                  <div style={{ color: colors.ink }}>{f.descripcion}{obsPorId[f.id] && <Sparkles size={11} color={colors.ink} style={{ marginLeft: 5, verticalAlign: -1 }} />}</div>
                  <div style={{ fontSize: 10, color: colors.muted }}>{f.capitulo}</div>
                </td>
                <td style={{ ...celda, color: colors.inkSoft }}>{etiquetaUnidad(f.unidad)}</td>
                <td style={{ ...celda, textAlign: "right" }}>{cant(f.cantidad)}</td>
                <td style={{ ...celda, textAlign: "right", color: colors.muted }}>{fmt(f.precioBase)}</td>
                <td style={{ ...celda, textAlign: "right", color: f.util < 0 ? colors.danger : colors.inkSoft }}>{f.util ? f.util.toFixed(1) : "0"}</td>
                <td style={{ ...celda, textAlign: "right" }}>{fmt(f.precio_unitario)}</td>
                <td style={{ ...celda, textAlign: "right", fontWeight: 600, color: colors.ink }}>{fmt(f.total)}</td>
                <td style={{ ...celda, textAlign: "right", color: colors.inkSoft }}>{f.pct.toFixed(1)}</td>
                <td style={{ ...celda, fontSize: 11 }}>
                  {f.alertas.map((a, k) => <div key={k} style={{ color: colors.warning, display: "flex", gap: 4, alignItems: "flex-start" }}><AlertTriangle size={11} style={{ flexShrink: 0, marginTop: 2 }} />{a}</div>)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!vistas.length && <div style={{ padding: 30, textAlign: "center", color: colors.muted, fontSize: 13 }}>Nada que mostrar con ese filtro.</div>}
      </div>
    </div>
  );
}
