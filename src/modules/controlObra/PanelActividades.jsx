import { useState, useMemo } from "react";
import { Plus, Sparkles, Check, X, Tag, Trash2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";

// Las actividades agrupan los rubros según cómo se ejecuta la obra
// ("muebles", "instalaciones eléctricas"), cruzando capítulos si hace falta.
// El capítulo viene del presupuesto y no se toca.
export default function PanelActividades({ obra, rubros, onCambio }) {
  const [seleccion, setSeleccion] = useState(new Set());
  const [busqueda, setBusqueda] = useState("");
  const [soloSinAsignar, setSoloSinAsignar] = useState(false);
  const [nueva, setNueva] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [sugiriendo, setSugiriendo] = useState(false);
  const [sugerencias, setSugerencias] = useState(null);
  const [error, setError] = useState("");

  const actividades = useMemo(() => {
    const m = new Map();
    rubros.forEach(r => {
      if (!r.actividad) return;
      m.set(r.actividad, (m.get(r.actividad) || 0) + 1);
    });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rubros]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return rubros.filter(r =>
      (!soloSinAsignar || !r.actividad) &&
      (!q || r.descripcion.toLowerCase().includes(q) || (r.capitulo || "").toLowerCase().includes(q) || String(r.numero) === q)
    );
  }, [rubros, busqueda, soloSinAsignar]);

  const sinAsignar = rubros.filter(r => !r.actividad).length;

  function alternar(id) {
    setSeleccion(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  async function asignar(actividad) {
    if (!seleccion.size) return;
    setGuardando(true); setError("");
    const orden = actividad ? (actividades.findIndex(a => a[0] === actividad) + 1 || actividades.length + 1) : null;
    const { error: e } = await supabase.from("obra_rubros")
      .update({ actividad: actividad || null, actividad_orden: orden })
      .in("id", [...seleccion]);
    if (e) setError("No se pudo asignar: " + e.message);
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

  async function eliminar(actividad) {
    if (!window.confirm(`¿Quitar la actividad "${actividad}"?\n\nLos rubros no se borran: quedan sin actividad.`)) return;
    setGuardando(true);
    await supabase.from("obra_rubros").update({ actividad: null, actividad_orden: null })
      .eq("obra_id", obra.id).eq("actividad", actividad);
    await onCambio();
    setGuardando(false);
  }

  // Con 168 rubros, clasificar a mano es inviable: NOVA propone y tú corriges.
  async function sugerirConNova() {
    setSugiriendo(true); setError(""); setSugerencias(null);
    try {
      const lista = rubros.map(r => `${r.id}|${r.descripcion.slice(0, 70)}`).join("\n");
      const res = await fetch("/api/nova", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-5", max_tokens: 8000,
          system: `Agrupas rubros de una obra en ACTIVIDADES según cómo se ejecuta el trabajo
(ejemplos: "Movimiento de tierra", "Instalaciones eléctricas", "Muebles", "Pintura", "Cubiertas").
Una actividad puede juntar rubros de distintos capítulos. Usa entre 5 y 15 actividades.
Cada rubro va en UNA sola actividad. Devuelve SOLO JSON, sin markdown:
{"actividades":[{"nombre":"...","rubros":[1,2,3]}]}
Los números son los id que van antes del "|". No inventes ids.`,
          messages: [{ role: "user", content: `Rubros (id|descripción):\n${lista}` }],
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
    } catch (e) {
      setError("Error consultando a NOVA: " + e.message);
    }
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
        Los capítulos vienen del presupuesto. Las actividades son tu forma de agrupar los mismos rubros
        según cómo se ejecuta la obra, y pueden cruzar capítulos.
        {sinAsignar > 0 && <> Quedan <strong>{sinAsignar}</strong> rubros sin actividad.</>}
      </div>

      {/* Sugerencia de NOVA */}
      {!sugerencias && (
        <div style={{ background: colors.brandSoft, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 12, marginBottom: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
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
        <div style={{ background: colors.surface, border: `1.5px solid ${colors.brand}`, borderRadius: colors.radiusMd, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: colors.ink, marginBottom: 8 }}>
            NOVA propone {sugerencias.length} actividades
          </div>
          <div style={{ maxHeight: 220, overflowY: "auto", marginBottom: 10 }}>
            {sugerencias.map((a, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: `1px solid ${colors.neutralSoft}` }}>
                <input value={a.nombre}
                  onChange={e => setSugerencias(s => s.map((x, j) => j === i ? { ...x, nombre: e.target.value } : x))}
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

      {/* Actividades existentes */}
      {actividades.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          {actividades.map(([nombre, cuenta]) => (
            <div key={nombre} style={{ display: "flex", alignItems: "center", gap: 6, background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 20, padding: "5px 8px 5px 12px", fontSize: 12 }}>
              <Tag size={11} color={colors.brand} />
              <span onClick={() => renombrar(nombre)} title="Renombrar" style={{ color: colors.ink, cursor: "pointer" }}>{nombre}</span>
              <span style={{ color: colors.muted, fontSize: 11 }}>{cuenta}</span>
              <button onClick={() => eliminar(nombre)} title="Quitar actividad"
                style={{ background: "none", border: "none", color: colors.muted, cursor: "pointer", display: "flex", padding: 0 }}><Trash2 size={11} /></button>
            </div>
          ))}
        </div>
      )}

      {error && <div style={{ color: colors.danger, fontSize: 12, marginBottom: 10 }}>{error}</div>}

      {/* Selección y asignación */}
      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar rubro..." style={{ ...inputStyle, flex: 1, minWidth: 180 }} />
        <button onClick={() => setSoloSinAsignar(v => !v)}
          style={{ background: soloSinAsignar ? colors.brandSoft : colors.neutralSoft, border: "none", borderRadius: 20, padding: "7px 14px", fontSize: 12, color: soloSinAsignar ? colors.brand : colors.inkSoft, cursor: "pointer", fontWeight: 600, fontFamily: colors.font, flexShrink: 0 }}>
          Solo sin actividad
        </button>
      </div>

      {seleccion.size > 0 && (
        <div style={{ background: colors.brandSoft, borderRadius: colors.radiusMd, padding: 12, marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: colors.brand, marginBottom: 8 }}>
            {seleccion.size} rubro{seleccion.size === 1 ? "" : "s"} seleccionado{seleccion.size === 1 ? "" : "s"} — asignar a:
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            {actividades.map(([nombre]) => (
              <button key={nombre} onClick={() => asignar(nombre)} disabled={guardando}
                style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 20, padding: "5px 12px", fontSize: 12, color: colors.ink, cursor: "pointer", fontFamily: colors.font }}>
                {nombre}
              </button>
            ))}
            <button onClick={() => asignar(null)} disabled={guardando}
              style={{ background: "transparent", border: `1px dashed ${colors.border}`, borderRadius: 20, padding: "5px 12px", fontSize: 12, color: colors.muted, cursor: "pointer", fontFamily: colors.font }}>
              Quitar actividad
            </button>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <input value={nueva} onChange={e => setNueva(e.target.value)}
              onKeyDown={e => e.key === "Enter" && nueva.trim() && asignar(nueva.trim())}
              placeholder="…o escribe una actividad nueva" style={{ ...inputStyle, flex: 1 }} />
            <Button variant="primary" onClick={() => asignar(nueva.trim())} disabled={!nueva.trim() || guardando}>
              <Plus size={13} /> Crear
            </Button>
          </div>
        </div>
      )}

      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, maxHeight: 460, overflowY: "auto" }}>
        {visibles.length === 0 && <div style={{ padding: "30px 0", textAlign: "center", color: colors.muted, fontSize: 13 }}>Sin rubros que mostrar.</div>}
        {visibles.map(r => {
          const marcado = seleccion.has(r.id);
          return (
            <div key={r.id} onClick={() => alternar(r.id)}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderBottom: `1px solid ${colors.neutralSoft}`, cursor: "pointer", background: marcado ? colors.brandSoft : "transparent" }}>
              <div style={{ width: 16, height: 16, borderRadius: 4, flexShrink: 0, border: `1.5px solid ${marcado ? colors.brand : colors.border}`, background: marcado ? colors.brand : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {marcado && <Check size={11} color="#fff" />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <span style={{ color: colors.muted, marginRight: 5 }}>{r.numero}</span>{r.descripcion}
                </div>
                <div style={{ fontSize: 10, color: colors.muted, marginTop: 1 }}>{r.capitulo}</div>
              </div>
              {r.actividad && (
                <span style={{ fontSize: 10, background: colors.neutralSoft, color: colors.inkSoft, padding: "2px 8px", borderRadius: 20, flexShrink: 0 }}>{r.actividad}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
