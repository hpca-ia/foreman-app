import { useState, useMemo } from "react";
import { Plus, Sparkles, Check, X, ChevronRight, ChevronDown, Trash2, Pencil, CornerDownRight } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";

const SIN_ACTIVIDAD = "__sin__";

// La jerarquía es Presupuesto → Capítulo → Actividad → Rubro. Acá se
// organiza el tercer nivel: qué rubros comprende cada actividad y a cuál
// pasan si hay que moverlos.
export default function PanelActividades({ obra, rubros, onCambio }) {
  const [abiertas, setAbiertas] = useState(() => new Set([SIN_ACTIVIDAD]));
  const [seleccion, setSeleccion] = useState(new Set());
  const [busqueda, setBusqueda] = useState("");
  const [nueva, setNueva] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [sugiriendo, setSugiriendo] = useState(false);
  const [sugerencias, setSugerencias] = useState(null);
  const [error, setError] = useState("");

  // Agrupa por capítulo y, dentro, por actividad.
  const arbol = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const coincide = r => !q || r.descripcion.toLowerCase().includes(q) ||
      (r.actividad || "").toLowerCase().includes(q) || String(r.numero) === q;

    const caps = new Map();
    rubros.filter(coincide)
      .slice()
      .sort((a, b) => (a.capitulo_orden - b.capitulo_orden) || (a.orden - b.orden))
      .forEach(r => {
        const cap = r.capitulo || "SIN CAPÍTULO";
        if (!caps.has(cap)) caps.set(cap, new Map());
        const acts = caps.get(cap);
        const act = r.actividad || SIN_ACTIVIDAD;
        if (!acts.has(act)) acts.set(act, []);
        acts.get(act).push(r);
      });
    return caps;
  }, [rubros, busqueda]);

  const actividades = useMemo(
    () => [...new Set(rubros.map(r => r.actividad).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [rubros]
  );
  const sinActividad = rubros.filter(r => !r.actividad).length;

  const clave = (cap, act) => `${cap}||${act}`;
  function alternarGrupo(k) {
    setAbiertas(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });
  }
  function alternarRubro(id) {
    setSeleccion(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function seleccionarGrupo(lista) {
    const ids = lista.map(r => r.id);
    const todos = ids.every(id => seleccion.has(id));
    setSeleccion(prev => {
      const n = new Set(prev);
      ids.forEach(id => todos ? n.delete(id) : n.add(id));
      return n;
    });
  }

  async function mover(ids, actividad) {
    if (!ids.length) return;
    setGuardando(true); setError("");
    const orden = actividad ? (actividades.indexOf(actividad) + 1 || actividades.length + 1) : null;
    const { error: e } = await supabase.from("obra_rubros")
      .update({ actividad: actividad || null, actividad_orden: orden }).in("id", ids);
    if (e) setError("No se pudo mover: " + e.message);
    else { setSeleccion(new Set()); setNueva(""); await onCambio(); }
    setGuardando(false);
  }

  async function renombrar(vieja) {
    const nuevo = window.prompt(`Nuevo nombre para "${vieja}"`, vieja);
    if (!nuevo?.trim() || nuevo === vieja) return;
    setGuardando(true);
    await supabase.from("obra_rubros").update({ actividad: nuevo.trim() })
      .eq("obra_id", obra.id).eq("actividad", vieja);
    await onCambio();
    setGuardando(false);
  }

  async function disolver(actividad) {
    const cuantos = rubros.filter(r => r.actividad === actividad).length;
    if (!window.confirm(`¿Quitar la actividad "${actividad}"?\n\nSus ${cuantos} rubros no se borran: vuelven a quedar sin actividad.`)) return;
    setGuardando(true);
    await supabase.from("obra_rubros").update({ actividad: null, actividad_orden: null })
      .eq("obra_id", obra.id).eq("actividad", actividad);
    await onCambio();
    setGuardando(false);
  }

  // Clasificar cientos de rubros a mano es inviable: NOVA propone y tú corriges.
  async function sugerirConNova() {
    setSugiriendo(true); setError(""); setSugerencias(null);
    try {
      const lista = rubros.map(r => `${r.id}|${r.capitulo}|${r.descripcion.slice(0, 60)}`).join("\n");
      const res = await fetch("/api/nova", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-5", max_tokens: 8000,
          system: `Agrupas los rubros de una obra en ACTIVIDADES. La jerarquía es
Capítulo → Actividad → Rubro: la actividad es un paquete de trabajo dentro de un capítulo
(ej. en "Instalaciones": "Iluminación", "Tomacorrientes", "Tableros").
Cada rubro va en UNA sola actividad. Usa nombres cortos y concretos.
Devuelve SOLO JSON, sin markdown:
{"actividades":[{"nombre":"...","rubros":[1,2,3]}]}
Los números son los id que van antes del primer "|". No inventes ids.`,
          messages: [{ role: "user", content: `Rubros (id|capítulo|descripción):\n${lista}` }],
        }),
      });
      const data = await res.json();
      const txt = (data.content?.[0]?.text || "").replace(/```json|```/g, "").trim();
      let parsed = null;
      try { parsed = JSON.parse(txt); } catch { const m = txt.match(/\{[\s\S]*\}/); if (m) try { parsed = JSON.parse(m[0]); } catch {} }
      if (!parsed?.actividades?.length) { setError("NOVA no pudo agrupar los rubros. Intenta de nuevo o hazlo a mano."); setSugiriendo(false); return; }
      const idsValidos = new Set(rubros.map(r => r.id));
      setSugerencias(parsed.actividades
        .map(a => ({ nombre: String(a.nombre || "").trim(), rubros: (a.rubros || []).filter(id => idsValidos.has(id)) }))
        .filter(a => a.nombre && a.rubros.length));
    } catch (e) { setError("Error consultando a NOVA: " + e.message); }
    setSugiriendo(false);
  }

  async function aplicarSugerencias() {
    setGuardando(true); setError("");
    try {
      for (let i = 0; i < sugerencias.length; i++) {
        const a = sugerencias[i];
        const { error: e } = await supabase.from("obra_rubros")
          .update({ actividad: a.nombre, actividad_orden: i + 1 }).in("id", a.rubros);
        if (e) { setError("Falló al aplicar: " + e.message); setGuardando(false); return; }
      }
      setSugerencias(null);
      await onCambio();
    } finally { setGuardando(false); }
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: colors.inkSoft, marginBottom: 12 }}>
        Presupuesto → capítulo → actividad → rubro. Despliega una actividad para ver qué rubros comprende y moverlos a otra.
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
                <input value={a.nombre} onChange={e => setSugerencias(s => s.map((x, j) => j === i ? { ...x, nombre: e.target.value } : x))}
                  style={{ ...inputStyle, flex: 1, padding: "6px 9px", fontSize: 12 }} />
                <span style={{ fontSize: 11, color: colors.muted, flexShrink: 0 }}>{a.rubros.length} rubros</span>
                <button onClick={() => setSugerencias(s => s.filter((_, j) => j !== i))}
                  style={{ background: "none", border: "none", color: colors.muted, cursor: "pointer", display: "flex" }}><X size={13} /></button>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="outline" style={{ flex: 1 }} onClick={() => setSugerencias(null)}>Descartar</Button>
            <Button variant="primary" style={{ flex: 2 }} onClick={aplicarSugerencias} disabled={guardando}>
              {guardando ? "Aplicando..." : "Aplicar estas actividades"}
            </Button>
          </div>
        </div>
      )}

      {error && <div style={{ color: colors.danger, fontSize: 12, marginBottom: 10 }}>{error}</div>}

      <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar rubro o actividad..." style={{ ...inputStyle, marginBottom: 10 }} />

      {/* Barra de acción: aparece al seleccionar rubros */}
      {seleccion.size > 0 && (
        <div style={{ background: colors.brandSoft, borderRadius: colors.radiusMd, padding: 12, marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: colors.brand, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <CornerDownRight size={13} />
            Mover {seleccion.size} rubro{seleccion.size === 1 ? "" : "s"} a:
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            {actividades.map(a => (
              <button key={a} onClick={() => mover([...seleccion], a)} disabled={guardando}
                style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 20, padding: "5px 12px", fontSize: 12, color: colors.ink, cursor: "pointer", fontFamily: colors.font }}>
                {a}
              </button>
            ))}
            <button onClick={() => mover([...seleccion], null)} disabled={guardando}
              style={{ background: "transparent", border: `1px dashed ${colors.border}`, borderRadius: 20, padding: "5px 12px", fontSize: 12, color: colors.muted, cursor: "pointer", fontFamily: colors.font }}>
              Sin actividad
            </button>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <input value={nueva} onChange={e => setNueva(e.target.value)}
              onKeyDown={e => e.key === "Enter" && nueva.trim() && mover([...seleccion], nueva.trim())}
              placeholder="…o una actividad nueva" style={{ ...inputStyle, flex: 1 }} />
            <Button variant="primary" onClick={() => mover([...seleccion], nueva.trim())} disabled={!nueva.trim() || guardando}>
              <Plus size={13} /> Crear
            </Button>
          </div>
        </div>
      )}

      {/* Árbol: capítulo → actividad → rubros */}
      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, overflow: "hidden" }}>
        {[...arbol.entries()].map(([cap, acts]) => (
          <div key={cap}>
            <div style={{ background: colors.bg, padding: "8px 12px", fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.4, borderBottom: `1px solid ${colors.border}` }}>
              {cap}
            </div>

            {[...acts.entries()]
              .sort((a, b) => (a[0] === SIN_ACTIVIDAD ? 1 : 0) - (b[0] === SIN_ACTIVIDAD ? 1 : 0) || a[0].localeCompare(b[0]))
              .map(([act, lista]) => {
                const k = clave(cap, act);
                const abierta = abiertas.has(k);
                const esSin = act === SIN_ACTIVIDAD;
                const todosMarcados = lista.every(r => seleccion.has(r.id));
                return (
                  <div key={k}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: `1px solid ${colors.neutralSoft}`, background: esSin ? "transparent" : colors.brandSoft }}>
                      <button onClick={() => alternarGrupo(k)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: esSin ? colors.muted : colors.brand, display: "flex", padding: 0 }}>
                        {abierta ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                      <span onClick={() => alternarGrupo(k)} style={{ flex: 1, fontSize: 12, fontWeight: 600, color: esSin ? colors.muted : colors.brand, cursor: "pointer" }}>
                        {esSin ? "Sin actividad" : act}
                        <span style={{ fontWeight: 400, opacity: 0.75, marginLeft: 6 }}>({lista.length})</span>
                      </span>
                      <button onClick={() => seleccionarGrupo(lista)} title="Seleccionar todos"
                        style={{ background: todosMarcados ? colors.brand : "transparent", border: `1px solid ${todosMarcados ? colors.brand : colors.border}`, borderRadius: 4, width: 18, height: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                        {todosMarcados && <Check size={11} color="#fff" />}
                      </button>
                      {!esSin && (
                        <>
                          <button onClick={() => renombrar(act)} title="Renombrar"
                            style={{ background: "none", border: "none", color: colors.muted, cursor: "pointer", display: "flex", padding: 2 }}><Pencil size={12} /></button>
                          <button onClick={() => disolver(act)} title="Quitar la actividad"
                            style={{ background: "none", border: "none", color: colors.muted, cursor: "pointer", display: "flex", padding: 2 }}><Trash2 size={12} /></button>
                        </>
                      )}
                    </div>

                    {abierta && lista.map(r => {
                      const marcado = seleccion.has(r.id);
                      return (
                        <div key={r.id} onClick={() => alternarRubro(r.id)}
                          style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 12px 7px 34px", borderBottom: `1px solid ${colors.neutralSoft}`, cursor: "pointer", background: marcado ? colors.brandSoft : "transparent" }}>
                          <div style={{ width: 15, height: 15, borderRadius: 4, flexShrink: 0, border: `1.5px solid ${marcado ? colors.brand : colors.border}`, background: marcado ? colors.brand : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {marcado && <Check size={10} color="#fff" />}
                          </div>
                          <span style={{ fontSize: 12, color: colors.ink, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            <span style={{ color: colors.muted, marginRight: 6 }}>{r.numero}</span>{r.descripcion}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
          </div>
        ))}
        {arbol.size === 0 && <div style={{ padding: "30px 0", textAlign: "center", color: colors.muted, fontSize: 13 }}>Sin rubros que mostrar.</div>}
      </div>
    </div>
  );
}
