import { useEffect, useState, useCallback } from "react";
import { Link2, Plus, Check, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { colors } from "../theme/colors";
import { TUNELES, asegurarEtapas } from "../modules/leads/tubo";
import Button from "./ui/Button";

// Empatar los proyectos de Ajustes con los del pipeline.
//
// "Proyecto" llegó a significar cuatro cosas: el del pipeline —con sus etapas,
// gestiones y bitácora—, el de Ajustes —un nombre, un color y sus miembros—, la
// obra y el nombre escrito a mano en una caja chica. El mismo edificio existía
// varias veces sin cruzarse, y por eso el filtro del tablero no encontraba las
// tareas del pipeline y el presupuesto no aparecía en su proyecto.
//
// El proyecto de verdad es el del pipeline. Acá se dice cuál de Ajustes es cuál
// del pipeline, de a uno y a mano: un script que junte por nombre casaría "Casa
// HC" con "Casa HC 2", y eso después no se desarma. Al confirmar un par, las
// tareas que colgaban del proyecto de Ajustes pasan a colgar del proyecto de
// verdad; nada se borra.

const pelado = t => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Qué tan parecidos son dos nombres, de 0 a 1, por palabras compartidas. */
function parecido(a, b) {
  const pa = pelado(a).split(" ").filter(w => w.length > 2);
  const pb = pelado(b).split(" ").filter(w => w.length > 2);
  if (!pa.length || !pb.length) return 0;
  const comunes = pa.filter(w => pb.includes(w)).length;
  return comunes / Math.max(pa.length, pb.length);
}

export default function EmparejarProyectos({ onCambio }) {
  const [proyectos, setProyectos] = useState([]);
  const [leads, setLeads] = useState([]);
  const [elegido, setElegido] = useState({});     // proyecto.id -> lead.id | "nuevo"
  const [tunelNuevo, setTunelNuevo] = useState({});
  const [ocupado, setOcupado] = useState(null);
  const [error, setError] = useState("");
  const [sinColumna, setSinColumna] = useState(false);
  const [listos, setListos] = useState([]);       // los que se acaban de empatar

  const cargar = useCallback(async () => {
    const [{ data: ps, error: e1 }, { data: ls }] = await Promise.all([
      supabase.from("proyectos").select("id,name,nombre,color,lead_id,activo").eq("activo", true),
      supabase.from("leads").select("id,nombre,tunel,resultado").order("nombre"),
    ]);
    if (e1 && /column|schema cache/i.test(e1.message)) { setSinColumna(true); return; }
    setProyectos(ps || []);
    setLeads(ls || []);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  if (sinColumna) {
    return (
      <div style={{ fontSize: 12, color: colors.warning, background: colors.warningSoft, border: `1px solid ${colors.warningBorder}`, borderRadius: colors.radiusMd, padding: 12 }}>
        Falta correr la migración 046 en Supabase para poder empatar los proyectos.
      </div>
    );
  }

  const nombreDe = p => p.name || p.nombre || "";
  const pendientes = proyectos.filter(p => !p.lead_id && !listos.includes(p.id));
  if (!pendientes.length) return null;

  // La mejor coincidencia por nombre, si es lo bastante parecida para sugerirla.
  const sugerencia = p => {
    const ranking = leads.map(l => ({ l, s: parecido(nombreDe(p), l.nombre) })).sort((a, b) => b.s - a.s);
    return ranking[0]?.s >= 0.5 ? ranking[0].l : null;
  };

  async function empatar(p) {
    const opcion = elegido[p.id] ?? sugerencia(p)?.id ?? "";
    if (!opcion) { setError("Elige con cuál del pipeline es, o créalo."); return; }
    setOcupado(p.id); setError("");
    try {
      let leadId = opcion;
      if (opcion === "nuevo") {
        const tunel = tunelNuevo[p.id] || "construccion";
        const { data: creado, error: e } = await supabase.from("leads")
          .insert({ nombre: nombreDe(p), tunel, es_lead: tunel === "lead", etapa: "lead" })
          .select().single();
        if (e) throw new Error(e.message);
        leadId = creado.id;
        await asegurarEtapas(creado, []);   // el catálogo lo completa el proyecto al abrirse
      }
      const { error: e2 } = await supabase.from("proyectos").update({ lead_id: leadId }).eq("id", p.id);
      if (e2) throw new Error(e2.message);
      // Las tareas que colgaban del de Ajustes pasan a colgar del de verdad. El
      // project_id se queda donde está: si algo sale mal, se vuelve atrás.
      await supabase.from("tasks").update({ lead_id: leadId }).eq("project_id", p.id).is("lead_id", null);
      setListos(x => [...x, p.id]);
      onCambio?.();
    } catch (e) {
      setError(e.message);
    } finally { setOcupado(null); }
  }

  const fila = { display: "grid", gridTemplateColumns: "minmax(120px,1fr) 20px minmax(160px,1.4fr) auto", gap: 10, alignItems: "center", padding: "10px 12px", borderTop: `1px solid ${colors.neutralSoft}` };
  const mini = { fontSize: 12, padding: "6px 8px", borderRadius: 8, border: `1px solid ${colors.border}`, fontFamily: colors.font, background: "#fff", color: colors.ink, width: "100%" };

  return (
    <div style={{ background: colors.surface, border: `1px solid ${colors.brand}33`, borderRadius: colors.radiusMd, marginBottom: 14, overflow: "hidden" }}>
      <div style={{ padding: "11px 13px", background: colors.brandSoft }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.brand, display: "flex", alignItems: "center", gap: 6 }}>
          <Link2 size={14} /> {pendientes.length} {pendientes.length === 1 ? "proyecto sin empatar" : "proyectos sin empatar"}
        </div>
        <div style={{ fontSize: 11.5, color: colors.inkSoft, marginTop: 3, lineHeight: 1.5 }}>
          Estos son los proyectos de Ajustes. Decinos cuál es el mismo del pipeline y pasan a ser uno solo:
          sus tareas se van con él y el proyecto muestra todo junto. Nada se borra.
        </div>
      </div>

      {pendientes.map(p => {
        const sug = sugerencia(p);
        const valor = elegido[p.id] ?? (sug ? String(sug.id) : "");
        return (
          <div key={p.id} style={fila}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: p.color || colors.border, flexShrink: 0 }} />
              <span style={{ fontSize: 12.5, fontWeight: 600, color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nombreDe(p)}</span>
            </div>
            <span style={{ color: colors.muted, fontSize: 13 }}>→</span>

            <div style={{ display: "grid", gap: 5 }}>
              <select value={valor} onChange={e => setElegido(x => ({ ...x, [p.id]: e.target.value }))} style={mini}>
                <option value="">¿Cuál del pipeline?</option>
                {leads.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.nombre}{sug?.id === l.id ? "  (parece este)" : ""}
                  </option>
                ))}
                <option value="nuevo">+ No está: crearlo en el pipeline</option>
              </select>
              {valor === "nuevo" && (
                <select value={tunelNuevo[p.id] || "construccion"} onChange={e => setTunelNuevo(x => ({ ...x, [p.id]: e.target.value }))} style={mini}>
                  {Object.entries(TUNELES).map(([id, t]) => <option key={id} value={id}>{t.label}</option>)}
                </select>
              )}
            </div>

            <Button variant="primary" size="sm" onClick={() => empatar(p)} disabled={ocupado === p.id || !valor}>
              {ocupado === p.id ? "Uniendo…" : valor === "nuevo" ? <><Plus size={12} /> Crear</> : <><Check size={12} /> Es el mismo</>}
            </Button>
          </div>
        );
      })}

      {error && (
        <div style={{ padding: "8px 13px", fontSize: 11.5, color: colors.danger, display: "flex", alignItems: "center", gap: 6 }}>
          <X size={12} /> {error}
        </div>
      )}
    </div>
  );
}
