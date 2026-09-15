import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Merge, Trash2, Check } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import { agruparDuplicados, clavePar } from "../../lib/duplicadosRubros";
import { etiquetaUnidad, normalizarUnidad } from "../../lib/unidades";

// Rubros que parecen el mismo. Para cada grupo hay tres salidas:
//   · Fusionar: los precios de todos pasan al que se conserva.
//   · Borrar uno: deja de estar en la base, con sus precios.
//   · Son distintos: se mantienen los dos y el grupo no vuelve a salir. A veces
//     la diferencia es mínima pero es un concepto aparte.

const fmt = n => (Number(n) || 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function todas(tabla, select, filtrar = q => q) {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await filtrar(supabase.from(tabla).select(select)).range(desde, desde + 999);
    if (error) return { filas, error };
    filas.push(...(data || []));
    if (!data || data.length < 1000) return { filas };
  }
}

export default function DuplicadosRubros({ currentUser }) {
  const [cargando, setCargando] = useState(true);
  const [rubros, setRubros] = useState([]);
  const [conteo, setConteo] = useState(new Map());
  const [distintos, setDistintos] = useState(new Set());
  const [sinTabla, setSinTabla] = useState(false);
  const [conservar, setConservar] = useState({});   // clave de grupo → id
  const [confirmar, setConfirmar] = useState(null);  // { tipo: "borrar" | "distintos" | "fusionar", grupo, id }
  const [motivo, setMotivo] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState("");
  const [limite, setLimite] = useState(30);

  async function cargar() {
    setCargando(true); setError("");
    const [rs, ps, ds] = await Promise.all([
      todas("rubros", "id,descripcion,unidad,precio_referencia,capitulos(nombre)", q => q.eq("activo", true).order("id")),
      todas("precios_historial", "rubro_id"),
      supabase.from("rubros_distintos").select("rubro_a,rubro_b"),
    ]);
    if (rs.error) setError("No se pudo cargar la base: " + rs.error.message);
    const c = new Map();
    ps.filas.forEach(p => c.set(p.rubro_id, (c.get(p.rubro_id) || 0) + 1));
    setRubros(rs.filas); setConteo(c);
    setSinTabla(!!ds.error);
    setDistintos(new Set((ds.data || []).map(d => clavePar(d.rubro_a, d.rubro_b))));
    setCargando(false);
  }
  useEffect(() => { cargar(); }, []);

  const grupos = useMemo(() => agruparDuplicados(rubros, distintos), [rubros, distintos]);
  const claveGrupo = g => g.rubros.map(r => r.id).join("-");
  // Por defecto se conserva el que más precios tiene; a igualdad, el más viejo.
  const elegido = g => conservar[claveGrupo(g)] ?? g.rubros.slice().sort((a, b) => (conteo.get(b.id) || 0) - (conteo.get(a.id) || 0) || a.id - b.id)[0].id;

  async function ejecutar(fn) {
    setTrabajando(true); setError("");
    try { await fn(); setConfirmar(null); setMotivo(""); await cargar(); }
    catch (e) { setError(e.message); }
    setTrabajando(false);
  }
  const ok = ({ error }) => { if (error) throw new Error(error.message); };

  const fusionar = g => ejecutar(async () => {
    const queda = elegido(g);
    const otros = g.rubros.map(r => r.id).filter(id => id !== queda);
    ok(await supabase.from("precios_historial").update({ rubro_id: queda }).in("rubro_id", otros));
    ok(await supabase.from("rubros").update({ activo: false }).in("id", otros));
  });

  const borrar = id => ejecutar(async () => {
    ok(await supabase.from("rubros").update({ activo: false }).eq("id", id));
    // Sin la migración 016 no hay "anulado": igual dejan de verse, porque el rubro ya no está activo.
    await supabase.from("precios_historial").update({ anulado: true, anulado_motivo: "Rubro duplicado borrado" }).eq("rubro_id", id);
  });

  const marcarDistintos = g => ejecutar(async () => {
    const ids = g.rubros.map(r => r.id).sort((a, b) => a - b);
    const pares = [];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      pares.push({ rubro_a: ids[i], rubro_b: ids[j], motivo: motivo.trim() || null, creado_por: currentUser?.id ?? null });
    }
    const { error } = await supabase.from("rubros_distintos").upsert(pares, { onConflict: "rubro_a,rubro_b" });
    if (error) throw new Error(/relation|schema cache|does not exist/i.test(error.message) ? "Falta correr la migración 017 en Supabase para recordar los rubros distintos." : error.message);
  });

  if (cargando) return <div style={{ textAlign: "center", padding: "40px 0", color: colors.muted, fontSize: 13 }}>Buscando rubros parecidos…</div>;

  if (!grupos.length) {
    return (
      <div style={{ textAlign: "center", padding: "40px 0", color: colors.muted, fontSize: 13, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <CheckCircle2 size={28} color={colors.success} /> No hay rubros duplicados.
        {distintos.size > 0 && <span style={{ fontSize: 11 }}>{distintos.size} pares están marcados como distintos.</span>}
      </div>
    );
  }

  const chip = { padding: "5px 10px", borderRadius: colors.radiusSm, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: colors.font, border: `1.5px solid ${colors.border}`, background: "#fff", color: colors.inkSoft, display: "inline-flex", alignItems: "center", gap: 5 };

  return (
    <div style={{ fontFamily: colors.font }}>
      <div style={{ fontSize: 12, color: colors.inkSoft, marginBottom: 12, lineHeight: 1.5 }}>
        <strong style={{ color: colors.ink }}>{grupos.length}</strong> grupos de rubros que parecen el mismo. En cada uno elige cuál se conserva y:
        <strong> fusiona</strong> (los precios pasan al que queda), <strong>borra</strong> el que sobra, o marca que <strong>son distintos</strong> y no vuelven a salir.
        {distintos.size > 0 && <span style={{ color: colors.muted }}> Ya hay {distintos.size} pares marcados como distintos.</span>}
      </div>
      {sinTabla && <div style={{ fontSize: 11, color: colors.warning, marginBottom: 10 }}>Para recordar los rubros distintos falta correr la migración 017 en Supabase.</div>}
      {error && <div style={{ fontSize: 12, color: colors.danger, marginBottom: 10 }}>{error}</div>}

      {grupos.slice(0, limite).map(g => {
        const k = claveGrupo(g);
        const queda = elegido(g);
        const conf = confirmar?.grupo === k ? confirmar : null;
        const unidad = etiquetaUnidad(normalizarUnidad(g.rubros[0].unidad).canon || g.rubros[0].unidad);
        return (
          <div key={k} style={{ background: colors.surface, border: `1.5px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 12, marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: g.exacto ? colors.danger : colors.brand, marginBottom: 8 }}>
              {g.exacto ? "Misma descripción" : "Descripción parecida"} · {g.rubros.length} rubros{unidad ? ` · ${unidad}` : ""}
            </div>

            {g.rubros.map(r => {
              const es = r.id === queda;
              const n = conteo.get(r.id) || 0;
              return (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 9px", borderRadius: colors.radiusSm, marginBottom: 5,
                  background: es ? colors.successSoft : colors.bg, border: `1px solid ${es ? colors.successBorder : colors.border}` }}>
                  <input type="radio" name={`conservar-${k}`} checked={es} onChange={() => setConservar(c => ({ ...c, [k]: r.id }))} title="Conservar este" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {es && <div style={{ fontSize: 9, fontWeight: 700, color: colors.success, letterSpacing: 0.5 }}>SE CONSERVA</div>}
                    <div style={{ fontSize: 12, color: colors.ink }}>{r.descripcion}</div>
                    <div style={{ fontSize: 10, color: colors.muted }}>{r.capitulos?.nombre || "Sin capítulo"} · {r.unidad || "sin unidad"} · ref. ${fmt(r.precio_referencia)} · {n} {n === 1 ? "precio" : "precios"}</div>
                  </div>
                  {!es && (
                    <button onClick={() => { setConfirmar({ tipo: "borrar", grupo: k, id: r.id, n, desc: r.descripcion }); setMotivo(""); }}
                      style={{ ...chip, color: colors.danger, borderColor: colors.dangerBorder }}><Trash2 size={11} /> Borrar</button>
                  )}
                </div>
              );
            })}

            {!conf && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                <button onClick={() => setConfirmar({ tipo: "fusionar", grupo: k })} style={{ ...chip, color: colors.success, borderColor: colors.successBorder }}><Merge size={11} /> Fusionar en el que se conserva</button>
                <button onClick={() => { setConfirmar({ tipo: "distintos", grupo: k }); setMotivo(""); }} style={chip}><Check size={11} /> Son distintos, mantenerlos</button>
              </div>
            )}

            {conf && (
              <div style={{ marginTop: 8, background: conf.tipo === "borrar" ? colors.dangerSoft : colors.bg, borderRadius: colors.radiusSm, padding: "9px 10px", fontSize: 12, color: colors.ink }}>
                {conf.tipo === "fusionar" && <>Los precios de los otros {g.rubros.length - 1} pasan al que se conserva, y esos rubros salen de la base.</>}
                {conf.tipo === "borrar" && <>"{conf.desc}" sale de la base{conf.n ? ` y sus ${conf.n} precios dejan de contar` : ""}. No se fusiona con el otro.</>}
                {conf.tipo === "distintos" && (
                  <>
                    Se mantienen todos y este grupo no vuelve a salir.
                    <input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Por qué son distintos (opcional): ej. uno es nacional y el otro importado"
                      style={{ ...inputStyle, padding: "6px 9px", fontSize: 12, marginTop: 6 }} />
                  </>
                )}
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <Button variant="outline" size="sm" onClick={() => setConfirmar(null)}>Cancelar</Button>
                  <Button variant="primary" size="sm" disabled={trabajando}
                    onClick={() => conf.tipo === "fusionar" ? fusionar(g) : conf.tipo === "borrar" ? borrar(conf.id) : marcarDistintos(g)}>
                    {trabajando ? "Guardando…" : conf.tipo === "fusionar" ? "Sí, fusionar" : conf.tipo === "borrar" ? "Sí, borrar" : "Sí, son distintos"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {grupos.length > limite && (
        <div style={{ textAlign: "center", padding: 8 }}>
          <Button variant="outline" size="sm" onClick={() => setLimite(l => l + 30)}>Ver más ({grupos.length - limite} grupos)</Button>
        </div>
      )}
    </div>
  );
}
