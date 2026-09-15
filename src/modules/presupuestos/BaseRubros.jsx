import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Download, Users, Truck, AlertTriangle, RotateCcw } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import { normalizarUnidad, etiquetaUnidad } from "../../lib/unidades";
import { normalNombre } from "../../lib/preguntasNova";
import { precioAlCosto } from "../../lib/analisisUtilidad";

// Base de rubros para ingeniería de costos: cada rubro con todos los precios
// que tuvo, de qué cliente o proveedor, en qué obra y cuándo. Los filtros
// recortan los precios —no los rubros—, así que el mínimo, el promedio y la
// variación son siempre de lo que se está mirando: "este rubro, solo
// proveedores, desde 2025".
//
// "Al costo" saca el IVA y la utilidad de cada precio. Los que traen utilidad
// sin saber cuánto —o los viejos, de los que nunca se dijo— no entran en esa
// cuenta: se ven en el detalle pero no inflan el costo.

const fmt = n => (Number(n) || 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const FILTROS = { q: "", tipo: "todos", nombre: "", proyecto: "", capitulo: "", unidad: "", desde: "", minPrecios: 1, orden: "precios" };
// "2026" y "2026-09-15" conviven en la columna de fecha.
const fechaOrden = f => { const s = String(f || ""); return s.length === 4 ? `${s}-00-00` : s; };

async function todas(tabla, select, filtrar = q => q) {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await filtrar(supabase.from(tabla).select(select)).range(desde, desde + 999);
    if (error) throw error;
    filas.push(...(data || []));
    if (!data || data.length < 1000) return filas;
  }
}

export default function BaseRubros({ puede }) {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [rubros, setRubros] = useState([]);
  const [precios, setPrecios] = useState([]);
  const [vista, setVista] = useState("rubros");
  const [f, setF] = useState(FILTROS);
  const [abierto, setAbierto] = useState(null);
  const [limite, setLimite] = useState(100);
  const [modo, setModo] = useState("vinieron");   // vinieron | costo
  const puedeEditar = puede ? puede("presupuestos.crear") : true;

  async function cargar() {
    setCargando(true); setError("");
    try {
      const [rs, ps] = await Promise.all([
        todas("rubros", "id,descripcion,unidad,precio_referencia,capitulos(nombre)", q => q.eq("activo", true)),
        todas("precios_historial", "*"),
      ]);
      setRubros(rs); setPrecios(ps);
    } catch (e) { setError("No se pudo cargar la base: " + e.message); }
    setCargando(false);
  }
  useEffect(() => { cargar(); }, []);

  // Cada precio con su origen resuelto. Los viejos sin origen_tipo son de
  // cliente si tienen cliente escrito.
  const todos = useMemo(() => {
    const porRubro = new Map(rubros.map(r => [r.id, r]));
    return precios.map(h => {
      const r = porRubro.get(h.rubro_id);
      if (!r) return null;
      const tipo = h.origen_tipo || (String(h.cliente_nombre || "").trim() ? "cliente" : null);
      const nombre = String((tipo === "proveedor" ? h.proveedor_nombre : h.cliente_nombre) || "").trim();
      const u = h.unidad ?? r.unidad;
      const pc = precioAlCosto(h);
      return { ...h, rubro: r, tipo, nombre, unidadTexto: u, costo: pc.costo, utilEstado: pc.estado, unidadCanon: normalizarUnidad(u).canon || String(u || "").trim().toLowerCase(),
        capituloNombre: h.capitulo || r.capitulos?.nombre || "", anio: String(h.fecha || "").slice(0, 4), proyecto: h.proyecto_ref || "" };
    }).filter(Boolean);
  }, [rubros, precios]);
  const vigentes = useMemo(() => todos.filter(h => !h.anulado), [todos]);

  const opciones = useMemo(() => {
    const distintos = (arr) => [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
    const deTipo = vigentes.filter(h => f.tipo === "todos" || f.tipo === h.tipo || (f.tipo === "sin" && !h.tipo));
    return {
      nombres: distintos(deTipo.map(h => h.nombre)),
      proyectos: distintos(deTipo.map(h => h.proyecto)),
      capitulos: distintos(vigentes.map(h => h.capituloNombre)),
      unidades: distintos(vigentes.map(h => h.unidadCanon)),
      anios: distintos(vigentes.map(h => h.anio)).filter(a => /^\d{4}$/.test(a)).reverse(),
    };
  }, [vigentes, f.tipo]);

  const filtrados = useMemo(() => {
    const palabras = normalNombre(f.q).split(" ").filter(Boolean);
    return vigentes.filter(h =>
      (f.tipo === "todos" || (f.tipo === "sin" ? !h.tipo : h.tipo === f.tipo)) &&
      (!f.nombre || normalNombre(h.nombre) === normalNombre(f.nombre)) &&
      (!f.proyecto || h.proyecto === f.proyecto) &&
      (!f.capitulo || h.capituloNombre === f.capitulo) &&
      (!f.unidad || h.unidadCanon === f.unidad) &&
      (!f.desde || h.anio >= f.desde) &&
      (!palabras.length || palabras.every(p => normalNombre(h.rubro.descripcion).includes(p))));
  }, [vigentes, f]);

  const filasRubros = useMemo(() => {
    const grupos = new Map();
    filtrados.forEach(h => { if (!grupos.has(h.rubro_id)) grupos.set(h.rubro_id, []); grupos.get(h.rubro_id).push(h); });
    const filas = [...grupos.values()].map(ps => {
      const ordenados = ps.slice().sort((a, b) => fechaOrden(b.fecha).localeCompare(fechaOrden(a.fecha)) || b.id - a.id);
      const validos = ordenados.filter(p => valorDe(p, modo) != null);
      if (!validos.length) return null;
      const valores = validos.map(p => valorDe(p, modo));
      const min = Math.min(...valores), max = Math.max(...valores);
      return { rubro: ps[0].rubro, precios: ordenados, n: validos.length, min, max,
        prom: valores.reduce((s, v) => s + v, 0) / valores.length,
        variacion: min > 0 ? (max - min) / min : 0,
        ultimo: validos[0], fuentes: new Set(validos.map(p => normalNombre(p.nombre) || "-")).size };
    }).filter(x => x && x.n >= Number(f.minPrecios));
    const orden = {
      precios: (a, b) => b.n - a.n,
      variacion: (a, b) => b.variacion - a.variacion,
      reciente: (a, b) => fechaOrden(b.ultimo.fecha).localeCompare(fechaOrden(a.ultimo.fecha)),
      descripcion: (a, b) => a.rubro.descripcion.localeCompare(b.rubro.descripcion, "es"),
    }[f.orden];
    return filas.sort((a, b) => orden(a, b) || a.rubro.descripcion.localeCompare(b.rubro.descripcion, "es"));
  }, [filtrados, f.minPrecios, f.orden, modo]);

  const resumen = useMemo(() => ({
    clientes: new Set(filtrados.filter(h => h.tipo === "cliente").map(h => normalNombre(h.nombre))).size,
    proveedores: new Set(filtrados.filter(h => h.tipo === "proveedor").map(h => normalNombre(h.nombre))).size,
    sinOrigen: vigentes.filter(h => !h.tipo).length,
    sinPrecios: rubros.length - new Set(vigentes.map(h => h.rubro_id)).size,
    sinCosto: filtrados.filter(h => h.costo == null).length,
  }), [filtrados, vigentes, rubros]);

  const cambiar = (k, v) => { setF(prev => ({ ...prev, [k]: v, ...(k === "tipo" ? { nombre: "", proyecto: "" } : {}) })); setLimite(100); setAbierto(null); };
  const hayFiltros = Object.keys(FILTROS).some(k => k !== "orden" && String(f[k]) !== String(FILTROS[k]));

  async function exportar() {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filasRubros.map(x => ({
      Rubro: x.rubro.descripcion, Unidad: etiquetaUnidad(x.ultimo.unidadCanon), Capítulo: x.ultimo.capituloNombre,
      Precios: x.n, Mínimo: x.min, Promedio: Math.round(x.prom * 100) / 100, Máximo: x.max, "Variación %": Math.round(x.variacion * 1000) / 10,
      [modo === "costo" ? "Último al costo" : "Último precio"]: valorDe(x.ultimo, modo), "Último de": x.ultimo.nombre, "Última fecha": x.ultimo.fecha,
    }))), modo === "costo" ? "Rubros al costo" : "Rubros");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filtrados.map(h => ({
      Rubro: h.rubro.descripcion, Origen: h.tipo === "proveedor" ? "Proveedor" : h.tipo === "cliente" ? "Cliente" : "Sin origen",
      Nombre: h.nombre, Proyecto: h.proyecto, Fecha: h.fecha, Unidad: h.unidadTexto, Cantidad: h.cantidad ?? "", Precio: Number(h.precio_unitario),
      "Con IVA": h.iva_incluido === true ? "sí" : h.iva_incluido === false ? "no" : "",
      Utilidad: etiquetaUtilidad(h), "Al costo": h.costo != null ? Math.round(h.costo * 100) / 100 : "",
    }))), "Precios");
    XLSX.writeFile(wb, `base-de-rubros-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const campo = { ...inputStyle, padding: "7px 10px", fontSize: 12 };
  const lbl = { fontSize: 10, fontWeight: 600, color: colors.muted, display: "block", marginBottom: 3, letterSpacing: 0.3 };

  if (cargando) return <div style={{ fontSize: 13, color: colors.muted, padding: 20 }}>Cargando la base de rubros…</div>;

  return (
    <div style={{ fontFamily: colors.font }}>
      {error && <div style={{ color: colors.danger, fontSize: 12, marginBottom: 10 }}>{error}</div>}

      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {[["rubros", "Rubros y precios"], ["fuentes", "Fuentes"]].map(([v, t]) => (
          <button key={v} onClick={() => setVista(v)}
            style={{ padding: "7px 14px", borderRadius: colors.radiusSm, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: colors.font,
              border: `1.5px solid ${vista === v ? colors.brand : colors.border}`, background: vista === v ? colors.brand : "#fff", color: vista === v ? "#fff" : colors.inkSoft }}>
            {t}{v === "fuentes" && resumen.sinOrigen > 0 && <span style={{ marginLeft: 6, color: vista === v ? "#fff" : colors.warning }}>· {resumen.sinOrigen} sin origen</span>}
          </button>
        ))}
      </div>

      {vista === "fuentes" ? (
        <Fuentes todos={todos} puedeEditar={puedeEditar} onCambio={cargar} setError={setError}
          onVer={(tipo, nombre, proyecto) => { setF({ ...FILTROS, tipo: tipo || "sin", nombre, proyecto }); setVista("rubros"); }} />
      ) : (
        <>
          {/* Filtros */}
          <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 12, marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
              <span style={{ fontSize: 11, color: colors.muted, fontWeight: 600 }}>PRECIOS</span>
              {[["vinieron", "Como vinieron"], ["costo", "Al costo (sin IVA ni utilidad)"]].map(([v, t]) => (
                <button key={v} onClick={() => { setModo(v); setAbierto(null); }}
                  style={{ padding: "5px 11px", borderRadius: colors.radiusSm, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: colors.font,
                    border: `1.5px solid ${modo === v ? colors.brand : colors.border}`, background: modo === v ? colors.brandSoft : "#fff", color: modo === v ? colors.brand : colors.inkSoft }}>{t}</button>
              ))}
              {modo === "costo" && resumen.sinCosto > 0 && (
                <span style={{ fontSize: 11, color: colors.warning }}>{resumen.sinCosto} precios no entran: no se sabe si traen utilidad. Corrígelos en Fuentes.</span>
              )}
            </div>
            <input value={f.q} onChange={e => cambiar("q", e.target.value)} placeholder="Buscar rubro… (ej. porcelanato 60)" style={{ ...inputStyle, marginBottom: 10 }} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
              <div><label style={lbl}>ORIGEN</label>
                <select value={f.tipo} onChange={e => cambiar("tipo", e.target.value)} style={campo}>
                  <option value="todos">Clientes y proveedores</option><option value="cliente">Solo clientes</option>
                  <option value="proveedor">Solo proveedores</option><option value="sin">Sin origen</option>
                </select></div>
              <div><label style={lbl}>{f.tipo === "proveedor" ? "PROVEEDOR" : f.tipo === "cliente" ? "CLIENTE" : "CLIENTE O PROVEEDOR"}</label>
                <select value={f.nombre} onChange={e => cambiar("nombre", e.target.value)} style={campo}>
                  <option value="">Todos</option>{opciones.nombres.map(x => <option key={x} value={x}>{x}</option>)}
                </select></div>
              <div><label style={lbl}>PROYECTO</label>
                <select value={f.proyecto} onChange={e => cambiar("proyecto", e.target.value)} style={campo}>
                  <option value="">Todos</option>{opciones.proyectos.map(x => <option key={x} value={x}>{x}</option>)}
                </select></div>
              <div><label style={lbl}>CAPÍTULO</label>
                <select value={f.capitulo} onChange={e => cambiar("capitulo", e.target.value)} style={campo}>
                  <option value="">Todos</option>{opciones.capitulos.map(x => <option key={x} value={x}>{x}</option>)}
                </select></div>
              <div><label style={lbl}>UNIDAD</label>
                <select value={f.unidad} onChange={e => cambiar("unidad", e.target.value)} style={campo}>
                  <option value="">Todas</option>{opciones.unidades.map(x => <option key={x} value={x}>{etiquetaUnidad(x)}</option>)}
                </select></div>
              <div><label style={lbl}>DESDE</label>
                <select value={f.desde} onChange={e => cambiar("desde", e.target.value)} style={campo}>
                  <option value="">Siempre</option>{opciones.anios.map(x => <option key={x} value={x}>{x}</option>)}
                </select></div>
              <div><label style={lbl}>CON AL MENOS</label>
                <select value={f.minPrecios} onChange={e => cambiar("minPrecios", e.target.value)} style={campo}>
                  <option value={1}>1 precio</option><option value={2}>2 precios</option><option value={3}>3 precios</option><option value={5}>5 precios</option>
                </select></div>
              <div><label style={lbl}>ORDENAR POR</label>
                <select value={f.orden} onChange={e => cambiar("orden", e.target.value)} style={campo}>
                  <option value="precios">Más precios</option><option value="variacion">Mayor variación</option>
                  <option value="reciente">Más reciente</option><option value="descripcion">Nombre</option>
                </select></div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 10, fontSize: 12, color: colors.inkSoft }}>
              <span><strong style={{ color: colors.ink }}>{filasRubros.length}</strong> rubros · <strong style={{ color: colors.ink }}>{filtrados.length}</strong> precios</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Users size={12} /> {resumen.clientes} clientes</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Truck size={12} /> {resumen.proveedores} proveedores</span>
              {!hayFiltros && resumen.sinPrecios > 0 && <span style={{ color: colors.muted }}>· {resumen.sinPrecios} rubros de la base todavía no tienen precios registrados</span>}
              <span style={{ flex: 1 }} />
              {hayFiltros && <button onClick={() => { setF(FILTROS); setLimite(100); }} style={enlace}>Quitar filtros</button>}
              <Button variant="outline" size="sm" onClick={exportar} disabled={!filasRubros.length}><Download size={12} /> Exportar a Excel</Button>
            </div>
          </div>

          {/* Tabla */}
          <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <div style={{ minWidth: 920 }}>
                <div style={{ ...filaGrid, padding: "8px 14px", background: colors.bg, borderBottom: `1px solid ${colors.border}`, fontSize: 9, fontWeight: 700, color: colors.muted, letterSpacing: 0.3 }}>
                  <span>RUBRO</span><span>UND</span><span style={num}>PRECIOS</span><span style={num}>MÍNIMO</span><span style={num}>PROMEDIO</span><span style={num}>MÁXIMO</span><span style={num}>VARIACIÓN</span><span style={num}>ÚLTIMO</span>
                </div>
                {filasRubros.length === 0 && <div style={{ padding: 20, fontSize: 13, color: colors.muted }}>No hay precios con estos filtros.</div>}
                {filasRubros.slice(0, limite).map(x => {
                  const open = abierto === x.rubro.id;
                  const alta = x.n > 1 && x.variacion > 0.3;
                  return (
                    <div key={x.rubro.id} style={{ borderBottom: `1px solid ${colors.neutralSoft}` }}>
                      <div onClick={() => setAbierto(open ? null : x.rubro.id)} style={{ ...filaGrid, padding: "8px 14px", fontSize: 12, alignItems: "center", cursor: "pointer", background: open ? colors.brandSoft : undefined }}>
                        <span style={{ display: "flex", gap: 6, alignItems: "center", minWidth: 0 }}>
                          {open ? <ChevronDown size={13} color={colors.muted} /> : <ChevronRight size={13} color={colors.muted} />}
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: "block", color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={x.rubro.descripcion}>{x.rubro.descripcion}</span>
                            <span style={{ display: "block", fontSize: 10, color: colors.muted }}>{x.ultimo.capituloNombre}{x.fuentes > 1 ? ` · ${x.fuentes} fuentes` : ""}</span>
                          </span>
                        </span>
                        <span style={{ color: colors.muted }}>{etiquetaUnidad(x.ultimo.unidadCanon)}</span>
                        <span style={{ ...num, color: colors.inkSoft }}>{x.n}</span>
                        <span style={{ ...num, color: colors.inkSoft }}>${fmt(x.min)}</span>
                        <span style={{ ...num, color: colors.ink, fontWeight: 600 }}>${fmt(x.prom)}</span>
                        <span style={{ ...num, color: colors.inkSoft }}>${fmt(x.max)}</span>
                        <span style={{ ...num, color: alta ? colors.warning : colors.muted, fontWeight: alta ? 700 : 400 }}>{x.n > 1 ? `${Math.round(x.variacion * 100)} %` : "—"}</span>
                        <span style={{ ...num, minWidth: 0 }}>
                          <span style={{ display: "block", color: colors.ink }}>${fmt(valorDe(x.ultimo, modo))}</span>
                          <span style={{ display: "block", fontSize: 10, color: colors.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.ultimo.nombre || "sin origen"} · {x.ultimo.anio}</span>
                        </span>
                      </div>
                      {open && <DetallePrecios x={x} modo={modo} />}
                    </div>
                  );
                })}
                {filasRubros.length > limite && (
                  <div style={{ padding: 12, textAlign: "center" }}>
                    <Button variant="outline" size="sm" onClick={() => setLimite(l => l + 200)}>Ver más ({filasRubros.length - limite} restantes)</Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// El precio que cuenta en cada modo; null si en ese modo no entra.
const valorDe = (p, modo) => (modo === "costo" ? p.costo : Number(p.precio_unitario) || 0);
const etiquetaUtilidad = p => p.utilEstado === "costo" ? "al costo"
  : p.utilEstado === "con_utilidad" ? `+${Number(p.utilidad_pct) || 0} %`
  : p.utilEstado === "desconocida" ? "desconocida" : "";

const filaGrid = { display: "grid", gridTemplateColumns: "minmax(260px,1fr) 50px 64px 90px 90px 90px 76px 150px", gap: 8 };
const num = { textAlign: "right" };
const enlace = { background: "none", border: "none", padding: 0, color: colors.brand, fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" };

function Origen({ tipo }) {
  const [txt, color, fondo] = tipo === "proveedor" ? ["Proveedor", colors.brand, colors.brandSoft]
    : tipo === "cliente" ? ["Cliente", colors.success, colors.successSoft] : ["Sin origen", colors.warning, colors.warningSoft];
  return <span style={{ display: "inline-block", fontSize: 9, fontWeight: 700, color, background: fondo, borderRadius: 4, padding: "2px 6px", whiteSpace: "nowrap" }}>{txt}</span>;
}

function DetallePrecios({ x, modo }) {
  const cols = "76px minmax(150px,1fr) minmax(130px,1fr) 76px 50px 64px 96px 80px 90px";
  return (
    <div style={{ background: colors.bg, padding: "6px 14px 10px 36px" }}>
      <div style={{ display: "grid", gridTemplateColumns: cols, gap: 8, fontSize: 9, fontWeight: 700, color: colors.muted, padding: "4px 0", letterSpacing: 0.3 }}>
        <span>ORIGEN</span><span>CLIENTE / PROVEEDOR</span><span>PROYECTO</span><span>FECHA</span><span>UND</span><span style={num}>CANT.</span><span style={num}>PRECIO</span><span>UTILIDAD</span><span style={num}>AL COSTO</span>
      </div>
      {x.precios.map(p => {
        const valor = valorDe(p, modo);
        const color = valor == null ? colors.muted : x.n > 1 && valor === x.min ? colors.success : x.n > 1 && valor === x.max ? colors.danger : colors.ink;
        return (
          <div key={p.id} style={{ display: "grid", gridTemplateColumns: cols, gap: 8, fontSize: 11, padding: "3px 0", alignItems: "center", color: colors.inkSoft }}>
            <span><Origen tipo={p.tipo} /></span>
            <span style={{ color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.nombre}>{p.nombre || "—"}</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.proyecto}>{p.proyecto || "—"}</span>
            <span>{p.fecha}</span>
            <span>{p.unidadTexto}</span>
            <span style={num}>{p.cantidad != null ? fmt(p.cantidad) : ""}</span>
            <span style={{ ...num, color: modo === "costo" ? colors.inkSoft : color, fontWeight: modo === "costo" ? 400 : 600 }}>${fmt(p.precio_unitario)}{p.iva_incluido === true && <span style={{ fontSize: 9, color: colors.muted, fontWeight: 400 }}> c/IVA</span>}</span>
            <span style={{ fontSize: 10, color: p.utilEstado === "desconocida" ? colors.warning : colors.muted }}>{etiquetaUtilidad(p) || "sin dato"}</span>
            <span style={{ ...num, color: modo === "costo" ? color : colors.inkSoft, fontWeight: modo === "costo" ? 600 : 400 }}>{p.costo != null ? `$${fmt(p.costo)}` : "—"}</span>
          </div>
        );
      })}
      {x.n > 1 && <div style={{ fontSize: 10, color: colors.muted, marginTop: 4 }}>En verde el más bajo, en rojo el más alto{modo === "costo" ? " al costo. Los que no tienen costo no cuentan" : ""}.</div>}
    </div>
  );
}

// Cada presupuesto que alimentó la base, con su origen. Aquí se corrige lo
// viejo: los precios que entraron sin origen, un cliente escrito de dos
// formas, o un presupuesto de prueba que no debería contar.
function Fuentes({ todos, puedeEditar, onCambio, setError, onVer }) {
  const [editando, setEditando] = useState(null);   // { clave, tipo, nombre }
  const [quitando, setQuitando] = useState(null);
  const [verQuitados, setVerQuitados] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const grupos = useMemo(() => {
    const m = new Map();
    todos.filter(h => !!h.anulado === verQuitados).forEach(h => {
      const clave = `${h.tipo || ""}|${normalNombre(h.nombre)}|${h.proyecto}`;
      if (!m.has(clave)) m.set(clave, { clave, tipo: h.tipo, nombre: h.nombre, proyecto: h.proyecto, ids: [], fechas: [], utilidades: new Set() });
      const g = m.get(clave); g.ids.push(h.id); g.fechas.push(h.fecha); g.utilidades.add(etiquetaUtilidad(h) || "sin dato");
    });
    return [...m.values()].sort((a, b) => (!a.tipo === !b.tipo ? b.ids.length - a.ids.length : a.tipo ? 1 : -1));
  }, [todos, verQuitados]);

  async function actualizar(ids, cambios) {
    setGuardando(true); setError("");
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await supabase.from("precios_historial").update(cambios).in("id", ids.slice(i, i + 200));
      if (error) {
        setError(/column|schema cache/i.test(error.message) ? "Faltan migraciones en Supabase (016 y 017) para guardar el origen y la utilidad de los precios." : "No se pudo guardar: " + error.message);
        setGuardando(false); return false;
      }
    }
    setGuardando(false); setEditando(null); setQuitando(null);
    await onCambio();
    return true;
  }

  const guardarOrigen = g => actualizar(g.ids, {
    ...(editando.tipo === "proveedor"
      ? { origen_tipo: "proveedor", proveedor_nombre: editando.nombre.trim() }
      : { origen_tipo: "cliente", cliente_nombre: editando.nombre.trim() }),
    // "" es no cambiar la utilidad: puede ser distinta por capítulo.
    ...(editando.util === "costo" ? { utilidad_estado: "costo", utilidad_pct: 0 }
      : editando.util === "con_utilidad" ? { utilidad_estado: "con_utilidad", utilidad_pct: Number(editando.pct) || 0 }
      : editando.util === "desconocida" ? { utilidad_estado: "desconocida", utilidad_pct: null } : {}),
  });

  const chipB = activo => ({ padding: "5px 10px", borderRadius: colors.radiusSm, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: colors.font,
    border: `1.5px solid ${activo ? colors.brand : colors.border}`, background: activo ? colors.brand : "#fff", color: activo ? "#fff" : colors.inkSoft });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, fontSize: 12, color: colors.inkSoft, flexWrap: "wrap" }}>
        <span style={{ flex: 1, minWidth: 240 }}>Cada presupuesto que alimentó la base. Corrige el origen de lo que entró sin él, une nombres escritos distinto o quita lo que no debe contar.</span>
        <button onClick={() => setVerQuitados(v => !v)} style={chipB(verQuitados)}>{verQuitados ? "Ver los que cuentan" : "Ver los quitados"}</button>
      </div>
      {grupos.length === 0 && <div style={{ fontSize: 13, color: colors.muted, padding: 12 }}>{verQuitados ? "No hay fuentes quitadas." : "Todavía no hay precios."}</div>}
      {grupos.map(g => {
        const fechas = g.fechas.map(fechaOrden).sort();
        const rango = [fechas[0], fechas[fechas.length - 1]].map(x => x.replace(/-00-00$/, "")).filter((x, i, a) => a.indexOf(x) === i).join(" a ");
        const ed = editando?.clave === g.clave;
        return (
          <div key={g.clave} style={{ background: colors.surface, border: `1px solid ${!g.tipo && !verQuitados ? colors.warningBorder : colors.border}`, borderRadius: colors.radiusMd, padding: "10px 12px", marginBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <Origen tipo={g.tipo} />
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: colors.ink }}>{g.nombre || (g.tipo ? "Sin nombre" : "¿De quién son estos precios?")}</div>
                <div style={{ fontSize: 11, color: colors.muted }}>{g.proyecto || "sin proyecto"} · {g.ids.length} precios · {rango} · utilidad: {[...g.utilidades].join(", ")}</div>
              </div>
              {!verQuitados && <button onClick={() => onVer(g.tipo, g.nombre, g.proyecto)} style={enlace}>Ver precios</button>}
              {puedeEditar && !verQuitados && !ed && quitando !== g.clave && (
                <>
                  <button onClick={() => setEditando({ clave: g.clave, tipo: g.tipo || null, nombre: g.nombre || (g.tipo ? "" : g.proyecto), util: "", pct: "" })} style={chipB(false)}>Corregir origen</button>
                  <button onClick={() => setQuitando(g.clave)} style={{ ...chipB(false), color: colors.danger }}>Quitar de la base</button>
                </>
              )}
              {puedeEditar && verQuitados && (
                <button onClick={() => actualizar(g.ids, { anulado: false, anulado_motivo: null })} disabled={guardando} style={chipB(false)}><RotateCcw size={11} /> Devolver a la base</button>
              )}
            </div>

            {quitando === g.clave && (
              <div style={{ marginTop: 10, background: colors.dangerSoft, borderRadius: colors.radiusSm, padding: "8px 10px", fontSize: 12, color: colors.ink, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <AlertTriangle size={14} color={colors.danger} />
                <span style={{ flex: 1, minWidth: 200 }}>Los {g.ids.length} precios de "{g.proyecto || g.nombre}" dejan de contar en promedios y búsquedas. No se borran: se pueden devolver.</span>
                <Button variant="outline" size="sm" onClick={() => setQuitando(null)}>Cancelar</Button>
                <Button variant="primary" size="sm" disabled={guardando} onClick={() => actualizar(g.ids, { anulado: true, anulado_motivo: "Quitado desde Base de rubros" })}>{guardando ? "Quitando…" : "Sí, quitar"}</Button>
              </div>
            )}

            {ed && (
              <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button onClick={() => setEditando(e => ({ ...e, tipo: "cliente" }))} style={chipB(editando.tipo === "cliente")}>De un cliente</button>
                <button onClick={() => setEditando(e => ({ ...e, tipo: "proveedor" }))} style={chipB(editando.tipo === "proveedor")}>De un proveedor</button>
                <input value={editando.nombre} onChange={e => setEditando(x => ({ ...x, nombre: e.target.value }))} placeholder={editando.tipo === "proveedor" ? "Nombre del proveedor" : "Nombre del cliente"}
                  style={{ ...inputStyle, padding: "6px 9px", fontSize: 12, width: 240 }} />
                <select value={editando.util} onChange={e => setEditando(x => ({ ...x, util: e.target.value }))} style={{ ...inputStyle, padding: "6px 9px", fontSize: 12, width: 200 }}>
                  <option value="">Utilidad: no cambiar</option>
                  <option value="costo">Al costo</option>
                  <option value="con_utilidad">Con utilidad de…</option>
                  <option value="desconocida">Con utilidad, no sé cuánto</option>
                </select>
                {editando.util === "con_utilidad" && (
                  <input type="number" value={editando.pct} onChange={e => setEditando(x => ({ ...x, pct: e.target.value }))} placeholder="%" style={{ ...inputStyle, padding: "6px 9px", fontSize: 12, width: 70 }} />
                )}
                <Button variant="outline" size="sm" onClick={() => setEditando(null)}>Cancelar</Button>
                <Button variant="primary" size="sm" disabled={guardando || !editando.tipo || !editando.nombre.trim() || (editando.util === "con_utilidad" && !(Number(editando.pct) > 0))} onClick={() => guardarOrigen(g)}>{guardando ? "Guardando…" : `Guardar en ${g.ids.length} precios`}</Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
