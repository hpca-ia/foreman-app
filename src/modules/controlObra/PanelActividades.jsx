import { useState, useMemo } from "react";
import { Plus, Sparkles, Check, X, ChevronRight, ChevronDown, Trash2, Pencil, CornerDownRight, AlertTriangle, Merge } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";

const SIN = "__sin__";

// La actividad agrupa rubros según cómo se ejecuta la obra, cruzando capítulos
// si hace falta: "muebles" toca carpintería, herrajes e instalación. Es el
// nivel al que se asignan las facturas al armar una planilla, así que acá se
// decide qué comprende cada una y con qué código se la llama.
export default function PanelActividades({ obra, rubros, actividades = [], onCambio }) {
  const [abiertas, setAbiertas] = useState(() => new Set([SIN]));
  const [seleccion, setSeleccion] = useState(new Set());
  const [busqueda, setBusqueda] = useState("");
  const [nueva, setNueva] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [sugiriendo, setSugiriendo] = useState(false);
  const [sugerencias, setSugerencias] = useState(null);
  const [error, setError] = useState("");
  const [actsSel, setActsSel] = useState(new Set());   // actividades marcadas para fusionar

  const grupos = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const coincide = r => !q || r.descripcion.toLowerCase().includes(q) ||
      (r.capitulo || "").toLowerCase().includes(q) || String(r.numero) === q;

    const dic = new Map(actividades.map(a => [a.id, a]));
    const mapa = new Map();
    actividades.forEach(a => mapa.set(a.id, { act: a, rubros: [], capitulos: new Set() }));
    mapa.set(SIN, { act: null, rubros: [], capitulos: new Set() });

    rubros.filter(coincide)
      .slice()
      .sort((a, b) => (a.capitulo_orden - b.capitulo_orden) || (a.orden - b.orden))
      .forEach(r => {
        const clave = r.actividad_id != null && dic.has(r.actividad_id) ? r.actividad_id : SIN;
        const g = mapa.get(clave);
        g.rubros.push(r);
        g.capitulos.add(r.capitulo || "SIN CAPÍTULO");
      });

    return [...mapa.entries()]
      .filter(([k, g]) => k !== SIN || g.rubros.length)
      .map(([clave, g]) => ({ clave, ...g, capitulos: [...g.capitulos] }))
      .sort((a, b) => (a.clave === SIN ? 1 : 0) - (b.clave === SIN ? 1 : 0) || (a.act?.orden ?? 0) - (b.act?.orden ?? 0));
  }, [rubros, actividades, busqueda]);

  const sinActividad = rubros.filter(r => r.actividad_id == null).length;
  const conRubros = new Set(rubros.filter(r => r.actividad_id != null).map(r => r.actividad_id));
  const vacias = actividades.filter(a => !conRubros.has(a.id));

  function alternarGrupo(k) {
    setAbiertas(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });
  }
  function alternarRubro(id) {
    setSeleccion(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function seleccionarGrupo(lista) {
    const ids = lista.map(r => r.id);
    const todos = ids.every(id => seleccion.has(id));
    setSeleccion(prev => { const n = new Set(prev); ids.forEach(id => todos ? n.delete(id) : n.add(id)); return n; });
  }

  async function mover(ids, actividadId) {
    if (!ids.length) return;
    setGuardando(true); setError("");
    const { error: e } = await supabase.from("obra_rubros").update({ actividad_id: actividadId }).in("id", ids);
    if (e) setError("No se pudo mover: " + e.message);
    else { setSeleccion(new Set()); setNueva(""); await onCambio(); }
    setGuardando(false);
  }

  async function moverANueva() {
    const nombre = nueva.trim();
    if (!nombre) return;
    setGuardando(true); setError("");
    const { data: act, error: e1 } = await supabase.from("obra_actividades")
      .insert({ obra_id: obra.id, nombre, codigo: String(actividades.length + 1).padStart(2, "0"), orden: actividades.length + 1 })
      .select().single();
    if (e1) { setError("No se pudo crear la actividad: " + e1.message); setGuardando(false); return; }
    const { error: e2 } = await supabase.from("obra_rubros").update({ actividad_id: act.id }).in("id", [...seleccion]);
    if (e2) setError("La actividad se creó pero no se pudo asignar los rubros: " + e2.message);
    else { setSeleccion(new Set()); setNueva(""); }
    await onCambio();
    setGuardando(false);
  }

  // Fusionar se lleva también las asignaciones de plata, no solo los rubros:
  // si quedaran apuntando a una actividad borrada, el dinero se pierde del
  // control sin que nadie lo note.
  async function fusionar() {
    const ids = [...actsSel];
    if (ids.length < 2) return;
    const destino = actividades.find(a => ids.includes(a.id));
    const otras = ids.filter(id => id !== destino.id);
    const nombre = window.prompt(
      `Fusionar ${ids.length} actividades en una sola.\n\nNombre de la actividad resultante:`, destino.nombre);
    if (!nombre?.trim()) return;

    setGuardando(true); setError("");
    const { error: e1 } = await supabase.from("obra_rubros").update({ actividad_id: destino.id }).in("actividad_id", otras);
    const { error: e2 } = await supabase.from("obra_asignaciones").update({ obra_actividad_id: destino.id }).in("obra_actividad_id", otras);
    if (e1 || e2) { setError("No se pudo fusionar: " + (e1 || e2).message); setGuardando(false); return; }
    await supabase.from("obra_actividades").update({ nombre: nombre.trim() }).eq("id", destino.id);
    await supabase.from("obra_actividades").delete().in("id", otras);
    setActsSel(new Set());
    await onCambio();
    setGuardando(false);
  }

  async function limpiarVacias(vacias) {
    if (!window.confirm(`¿Borrar ${vacias.length} actividades sin ningún rubro?\n\nNo tienen nada adentro, así que no se pierde información.`)) return;
    setGuardando(true);
    await supabase.from("obra_actividades").delete().in("id", vacias.map(a => a.id));
    await onCambio();
    setGuardando(false);
  }

  async function editar(act) {
    const nombre = window.prompt("Nombre de la actividad", act.nombre);
    if (nombre === null) return;
    const codigo = window.prompt("Código de la actividad", act.codigo || "");
    if (codigo === null) return;
    setGuardando(true);
    await supabase.from("obra_actividades")
      .update({ nombre: nombre.trim() || act.nombre, codigo: codigo.trim() }).eq("id", act.id);
    await onCambio();
    setGuardando(false);
  }

  async function disolver(act, cuantos) {
    if (!window.confirm(`¿Quitar la actividad "${act.nombre}"?\n\nSus ${cuantos} rubros no se borran: vuelven a quedar sin actividad.`)) return;
    setGuardando(true);
    await supabase.from("obra_rubros").update({ actividad_id: null }).eq("actividad_id", act.id);
    await supabase.from("obra_actividades").delete().eq("id", act.id);
    await onCambio();
    setGuardando(false);
  }

  // Clasificar cientos de rubros a mano es inviable: NOVA propone y tú corriges.
  async function sugerirConNova() {
    setSugiriendo(true); setError(""); setSugerencias(null);
    try {
      const lista = rubros.map(r => `${r.id}|${r.capitulo}|${r.descripcion.slice(0, 60)}`).join("\n");
      // NOVA no recuerda nada entre llamadas. Se le pasan los nombres que la
      // oficina ya usó en otras obras para que converja a ese vocabulario en
      // vez de inventar uno nuevo cada vez.
      const { data: previas } = await supabase.from("obra_actividades")
        .select("nombre").neq("obra_id", obra.id).limit(400);
      const frec = {};
      (previas || []).forEach(a => { frec[a.nombre] = (frec[a.nombre] || 0) + 1; });
      const vocabulario = Object.entries(frec).sort((a, b) => b[1] - a[1]).slice(0, 60).map(([x]) => x);
      const res = await fetch("/api/nova", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-5", max_tokens: 8000,
          system: `Agrupas los rubros de una obra en ACTIVIDADES: paquetes de trabajo según
cómo se ejecuta la obra ("muebles", "instalaciones eléctricas", "movimiento de tierra").
Una actividad PUEDE cruzar capítulos —el capítulo es cómo se contrató, no cómo se ejecuta—
pero no la cruces sin razón: si sus rubros viven todos en un capítulo, déjala ahí.
Cada rubro va en UNA sola actividad. Nombres cortos y concretos.
Devuelve SOLO JSON, sin markdown:
{"actividades":[{"nombre":"...","rubros":[1,2,3]}]}
Los números son los id antes del primer "|". No inventes ids.${vocabulario.length
  ? `\n\nEsta oficina ya usó estos nombres en otras obras. Reutiliza el que corresponda
en vez de inventar uno parecido; solo crea un nombre nuevo si de verdad no encaja ninguno:\n${vocabulario.join(", ")}`
  : ""}`,
          messages: [{ role: "user", content: `Rubros (id|capítulo|descripción):\n${lista}` }],
        }),
      });
      const data = await res.json();
      const txt = (data.content?.[0]?.text || "").replace(/```json|```/g, "").trim();
      let parsed = null;
      try { parsed = JSON.parse(txt); } catch { const m = txt.match(/\{[\s\S]*\}/); if (m) try { parsed = JSON.parse(m[0]); } catch {} }
      if (!parsed?.actividades?.length) { setError("NOVA no pudo agrupar los rubros. Intenta de nuevo o hazlo a mano."); setSugiriendo(false); return; }
      const validos = new Map(rubros.map(r => [r.id, r]));
      setSugerencias(parsed.actividades
        .map(a => {
          const ids = (a.rubros || []).filter(id => validos.has(id));
          const caps = new Set(ids.map(id => validos.get(id).capitulo || "SIN CAPÍTULO"));
          return { nombre: String(a.nombre || "").trim(), rubros: ids, capitulos: caps.size };
        })
        .filter(a => a.nombre && a.rubros.length));
    } catch (e) { setError("Error consultando a NOVA: " + e.message); }
    setSugiriendo(false);
  }

  async function aplicarSugerencias(reemplazar) {
    setGuardando(true); setError("");
    try {
      // Aplicar dos veces sin esto deja la tanda anterior huérfana: sus rubros
      // se van a las nuevas y quedan decenas de actividades vacías.
      let base = actividades;
      if (reemplazar && actividades.length) {
        await supabase.from("obra_rubros").update({ actividad_id: null }).eq("obra_id", obra.id);
        await supabase.from("obra_asignaciones").update({ obra_actividad_id: null })
          .in("obra_actividad_id", actividades.map(a => a.id));
        await supabase.from("obra_actividades").delete().eq("obra_id", obra.id);
        base = [];
      }
      const desde = base.length;
      const filas = sugerencias.map((a, i) => ({
        obra_id: obra.id, nombre: a.nombre, codigo: String(desde + i + 1).padStart(2, "0"), orden: desde + i + 1, origen: "nova",
      }));
      const { data: creadas, error: e1 } = await supabase.from("obra_actividades").insert(filas).select();
      if (e1) { setError("Falló al crear las actividades: " + e1.message); setGuardando(false); return; }
      for (let i = 0; i < sugerencias.length; i++) {
        const { error: e2 } = await supabase.from("obra_rubros")
          .update({ actividad_id: creadas[i].id }).in("id", sugerencias[i].rubros);
        if (e2) { setError("Falló al asignar rubros: " + e2.message); setGuardando(false); return; }
      }
      setSugerencias(null);
      await onCambio();
    } finally { setGuardando(false); }
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: colors.inkSoft, marginBottom: 12 }}>
        Las actividades son cómo se ejecuta la obra y pueden cruzar capítulos. Es a ellas que se asignan las facturas al armar una planilla.
        {sinActividad > 0 && <> Quedan <strong>{sinActividad}</strong> rubros sin actividad.</>}
      </div>

      {!sugerencias && (
        <div style={{ background: colors.brandSoft, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 12, marginBottom: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Sparkles size={16} color={colors.brand} />
          <div style={{ fontSize: 12, color: colors.brand, flex: 1, minWidth: 180 }}>
            {sugiriendo ? "NOVA está agrupando los rubros..." : `Clasificar ${rubros.length} rubros a mano es lento. NOVA puede proponer las actividades y tú corriges.`}
          </div>
          <Button variant="primary" size="sm" onClick={sugerirConNova} disabled={sugiriendo || guardando}>
            {sugiriendo ? "Agrupando..." : "Agrupar con NOVA"}
          </Button>
        </div>
      )}

      {sugerencias && (
        <div style={{ background: colors.surface, border: `1.5px solid ${colors.brand}`, borderRadius: colors.radiusMd, padding: 14, marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: colors.ink, marginBottom: 8 }}>NOVA propone {sugerencias.length} actividades</div>
          <div style={{ maxHeight: 220, overflowY: "auto", marginBottom: 10 }}>
            {sugerencias.map((a, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: `1px solid ${colors.neutralSoft}` }}>
                <span style={{ fontSize: 11, color: colors.muted, width: 18, flexShrink: 0 }}>{String(i + 1).padStart(2, "0")}</span>
                <input value={a.nombre} onChange={e => setSugerencias(s => s.map((x, j) => j === i ? { ...x, nombre: e.target.value } : x))}
                  style={{ ...inputStyle, flex: 1, padding: "6px 9px", fontSize: 12 }} />
                <span style={{ fontSize: 11, color: colors.muted, flexShrink: 0 }}>{a.rubros.length} rubros</span>
                {a.capitulos > 1 && (
                  <span title={`Cruza ${a.capitulos} capítulos`}
                    style={{ fontSize: 9, color: colors.warning, background: colors.warningSoft, borderRadius: 8, padding: "1px 6px", flexShrink: 0, fontWeight: 600 }}>
                    {a.capitulos} cap.
                  </span>
                )}
                <button onClick={() => setSugerencias(s => s.filter((_, j) => j !== i))}
                  style={{ background: "none", border: "none", color: colors.muted, cursor: "pointer", display: "flex" }}><X size={13} /></button>
              </div>
            ))}
          </div>
          {actividades.length > 0 && (
            <div style={{ fontSize: 11, color: colors.warning, background: colors.warningSoft, borderRadius: colors.radiusSm, padding: "7px 10px", marginBottom: 8 }}>
              Esta obra ya tiene {actividades.length} actividades. Si agregas estas encima, las de antes quedan sin rubros.
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="outline" style={{ flex: 1 }} onClick={() => setSugerencias(null)} disabled={guardando}>Descartar</Button>
            {actividades.length > 0 && (
              <Button variant="outline" style={{ flex: 1 }} onClick={() => aplicarSugerencias(false)} disabled={guardando}>
                Agregar
              </Button>
            )}
            <Button variant="primary" style={{ flex: 2 }} onClick={() => aplicarSugerencias(actividades.length > 0)} disabled={guardando}>
              {guardando ? "Aplicando..." : actividades.length > 0 ? "Reemplazar las actuales" : "Aplicar estas actividades"}
            </Button>
          </div>
        </div>
      )}

      {error && <div style={{ color: colors.danger, fontSize: 12, marginBottom: 10 }}>{error}</div>}

      <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar rubro o capítulo..." style={{ ...inputStyle, marginBottom: 10 }} />

      {seleccion.size > 0 && (
        <div style={{ background: colors.brandSoft, borderRadius: colors.radiusMd, padding: 12, marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: colors.brand, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <CornerDownRight size={13} /> Mover {seleccion.size} rubro{seleccion.size === 1 ? "" : "s"} a:
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            {actividades.map(a => (
              <button key={a.id} onClick={() => mover([...seleccion], a.id)} disabled={guardando}
                style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 20, padding: "5px 12px", fontSize: 12, color: colors.ink, cursor: "pointer", fontFamily: colors.font }}>
                <span style={{ color: colors.muted, marginRight: 4 }}>{a.codigo}</span>{a.nombre}
              </button>
            ))}
            <button onClick={() => mover([...seleccion], null)} disabled={guardando}
              style={{ background: "transparent", border: `1px dashed ${colors.border}`, borderRadius: 20, padding: "5px 12px", fontSize: 12, color: colors.muted, cursor: "pointer", fontFamily: colors.font }}>
              Sin actividad
            </button>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <input value={nueva} onChange={e => setNueva(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && nueva.trim()) moverANueva(); }}
              placeholder="…o una actividad nueva" style={{ ...inputStyle, flex: 1 }} />
            <Button variant="primary" onClick={moverANueva} disabled={!nueva.trim() || guardando}>
              <Plus size={13} /> Crear
            </Button>
          </div>
        </div>
      )}

      {vacias.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: colors.warningSoft, border: `1px solid ${colors.warningBorder}`, borderRadius: colors.radiusMd, padding: "9px 12px", marginBottom: 10, flexWrap: "wrap" }}>
          <AlertTriangle size={14} color={colors.warning} />
          <span style={{ fontSize: 12, color: colors.warning, flex: 1, minWidth: 160 }}>
            {vacias.length} actividades quedaron sin ningún rubro.
          </span>
          <Button variant="outline" size="sm" onClick={() => limpiarVacias(vacias)} disabled={guardando}>
            <Trash2 size={12} /> Borrar las vacías
          </Button>
        </div>
      )}

      {actsSel.size > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: colors.brandSoft, borderRadius: colors.radiusMd, padding: "9px 12px", marginBottom: 10, flexWrap: "wrap" }}>
          <Merge size={14} color={colors.brand} />
          <span style={{ fontSize: 12, color: colors.brand, flex: 1, minWidth: 160 }}>
            {actsSel.size} actividad{actsSel.size === 1 ? "" : "es"} marcada{actsSel.size === 1 ? "" : "s"}
            {actsSel.size < 2 && " — marca al menos dos para fusionarlas"}
          </span>
          <Button variant="outline" size="sm" onClick={() => setActsSel(new Set())}>Quitar marcas</Button>
          <Button variant="primary" size="sm" onClick={fusionar} disabled={actsSel.size < 2 || guardando}>
            Fusionar en una
          </Button>
        </div>
      )}

      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, overflow: "hidden" }}>
        {grupos.map(g => {
          const abierta = abiertas.has(g.clave);
          const esSin = g.clave === SIN;
          const todos = g.rubros.length > 0 && g.rubros.every(r => seleccion.has(r.id));
          return (
            <div key={g.clave}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderBottom: `1px solid ${colors.neutralSoft}`, background: esSin ? "transparent" : colors.brandSoft }}>
                <button onClick={() => alternarGrupo(g.clave)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: esSin ? colors.muted : colors.brand, display: "flex", padding: 0 }}>
                  {abierta ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                <span onClick={() => alternarGrupo(g.clave)} style={{ flex: 1, fontSize: 12, fontWeight: 600, color: esSin ? colors.muted : colors.brand, cursor: "pointer", minWidth: 0 }}>
                  {!esSin && <span style={{ opacity: 0.65, marginRight: 5 }}>{g.act.codigo}</span>}
                  {esSin ? "Sin actividad" : g.act.nombre}
                  <span style={{ fontWeight: 400, opacity: 0.75, marginLeft: 5 }}>({g.rubros.length})</span>
                  {!esSin && g.capitulos.length > 1 && (
                    <span title={`Toca ${g.capitulos.length} capítulos: ${g.capitulos.join(", ")}. Lo que se le asigne se reparte entre ellos a prorrata; si necesitas el capítulo exacto, pártela en dos.`}
                      style={{ display: "inline-flex", alignItems: "center", gap: 3, background: colors.warningSoft, color: colors.warning, borderRadius: 10, padding: "1px 7px", fontSize: 9, fontWeight: 600, marginLeft: 6 }}>
                      <AlertTriangle size={9} /> {g.capitulos.length} capítulos
                    </span>
                  )}
                </span>
                <button onClick={() => seleccionarGrupo(g.rubros)} title="Seleccionar todos"
                  style={{ background: todos ? colors.brand : "transparent", border: `1px solid ${todos ? colors.brand : colors.border}`, borderRadius: 4, width: 18, height: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, flexShrink: 0 }}>
                  {todos && <Check size={11} color="#fff" />}
                </button>
                {!esSin && (
                  <>
                    <button onClick={() => setActsSel(prev => { const n = new Set(prev); n.has(g.act.id) ? n.delete(g.act.id) : n.add(g.act.id); return n; })}
                      title="Marcar para fusionar"
                      style={{ background: actsSel.has(g.act.id) ? colors.brand : "transparent", border: "none", borderRadius: 4, padding: 2, color: actsSel.has(g.act.id) ? "#fff" : colors.muted, cursor: "pointer", display: "flex" }}>
                      <Merge size={12} />
                    </button>
                    <button onClick={() => editar(g.act)} title="Nombre y código"
                      style={{ background: "none", border: "none", color: colors.muted, cursor: "pointer", display: "flex", padding: 2 }}><Pencil size={12} /></button>
                    <button onClick={() => disolver(g.act, g.rubros.length)} title="Quitar la actividad"
                      style={{ background: "none", border: "none", color: colors.muted, cursor: "pointer", display: "flex", padding: 2 }}><Trash2 size={12} /></button>
                  </>
                )}
              </div>

              {abierta && g.rubros.map(r => {
                const marcado = seleccion.has(r.id);
                return (
                  <div key={r.id} onClick={() => alternarRubro(r.id)}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 12px 7px 34px", borderBottom: `1px solid ${colors.neutralSoft}`, cursor: "pointer", background: marcado ? colors.brandSoft : "transparent" }}>
                    <div style={{ width: 15, height: 15, borderRadius: 4, flexShrink: 0, border: `1.5px solid ${marcado ? colors.brand : colors.border}`, background: marcado ? colors.brand : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {marcado && <Check size={10} color="#fff" />}
                    </div>
                    <span style={{ fontSize: 12, color: colors.ink, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <span style={{ color: colors.muted, marginRight: 6 }}>{r.numero}</span>{r.descripcion}
                    </span>
                    <span style={{ fontSize: 10, color: colors.muted, flexShrink: 0, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.capitulo}</span>
                  </div>
                );
              })}
            </div>
          );
        })}
        {grupos.length === 0 && <div style={{ padding: "30px 0", textAlign: "center", color: colors.muted, fontSize: 13 }}>Sin rubros que mostrar.</div>}
      </div>
    </div>
  );
}
