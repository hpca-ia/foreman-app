import { useState, useEffect, useCallback } from "react";
import { Plus, ChevronUp, ChevronDown, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { colors } from "../theme/colors";
import { inputStyle } from "./ui/Input";
import Button from "./ui/Button";

// La ruta estándar de la oficina: por dónde pasa un proyecto, en qué orden y
// cuáles son sus puntos de revisión. Cada proyecto arma después su propio
// camino con estas etapas, pero esta lista es la vara con la que se mide si
// avanza o si volvió atrás. Por eso se edita acá y no en el código.

const clave = nombre => nombre.normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30);

export default function EtapasCatalogo() {
  const [etapas, setEtapas] = useState([]);
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [sinTabla, setSinTabla] = useState(false);

  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.from("pipeline_etapas").select("*").order("orden");
    if (e && /relation|schema cache|does not exist/i.test(e.message)) { setSinTabla(true); return; }
    setEtapas(data || []);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  async function agregar() {
    const n = nombre.trim();
    if (!n) return;
    setOcupado(true); setError("");
    const id = clave(n);
    if (etapas.some(e => e.id === id)) { setError("Ya existe una etapa con ese nombre."); setOcupado(false); return; }
    const orden = Math.max(0, ...etapas.filter(e => !e.cierra).map(e => e.orden || 0)) + 5;
    const { error: e } = await supabase.from("pipeline_etapas").insert({ id, nombre: n, orden, color: "#4A7C8C" });
    if (e) setError("No se pudo agregar: " + e.message);
    setNombre(""); setOcupado(false);
    await cargar();
  }

  async function guardar(fila, campos) {
    setEtapas(es => es.map(e => e.id === fila.id ? { ...e, ...campos } : e));
    await supabase.from("pipeline_etapas").update(campos).eq("id", fila.id);
  }

  async function mover(fila, dir) {
    const i = etapas.findIndex(e => e.id === fila.id);
    const otro = etapas[i + dir];
    if (!otro) return;
    await Promise.all([
      supabase.from("pipeline_etapas").update({ orden: otro.orden }).eq("id", fila.id),
      supabase.from("pipeline_etapas").update({ orden: fila.orden }).eq("id", otro.id),
    ]);
    await cargar();
  }

  // Una etapa que algún proyecto usó no se borra: se apaga. Borrarla dejaría
  // proyectos apuntando a algo que ya no existe.
  async function quitar(fila) {
    setOcupado(true); setError("");
    const { count } = await supabase.from("lead_etapas").select("id", { count: "exact", head: true }).eq("etapa_id", fila.id);
    if (count) {
      await guardar(fila, { activa: false });
      setError(`"${fila.nombre}" está en uso en ${count} ${count === 1 ? "proyecto" : "proyectos"}: se apagó en vez de borrarse.`);
    } else {
      await supabase.from("pipeline_etapas").delete().eq("id", fila.id);
    }
    setOcupado(false);
    await cargar();
  }

  if (sinTabla) {
    return <div style={{ fontSize: 12, color: colors.warning }}>Para editar las etapas falta correr la migración 021 en Supabase.</div>;
  }

  const mini = { ...inputStyle, padding: "5px 8px", fontSize: 12 };

  return (
    <div>
      <div style={{ fontSize: 12, color: colors.inkSoft, marginBottom: 10, lineHeight: 1.6 }}>
        Por dónde pasa un proyecto, en orden. Cada proyecto arma su propio camino con estas etapas,
        y esta lista es la que dice si avanzó o si volvió atrás.
      </div>

      <div style={{ background: colors.bg, borderRadius: colors.radiusMd, padding: 10, marginBottom: 10 }}>
        {etapas.map((e, i) => (
          <div key={e.id} style={{ display: "grid", gridTemplateColumns: "16px 1fr 70px 76px 22px", gap: 8, alignItems: "center", padding: "4px 0", opacity: e.activa === false ? 0.5 : 1 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <button onClick={() => mover(e, -1)} disabled={i === 0} style={flechita}><ChevronUp size={10} /></button>
              <button onClick={() => mover(e, 1)} disabled={i === etapas.length - 1} style={flechita}><ChevronDown size={10} /></button>
            </div>
            <input value={e.nombre} onChange={ev => guardar(e, { nombre: ev.target.value })} style={mini} />
            <label style={casilla} title="Se puede poner varias veces en el mismo proyecto, como la reunión con cliente">
              <input type="checkbox" checked={!!e.repetible} onChange={ev => guardar(e, { repetible: ev.target.checked })} /> repetible
            </label>
            <label style={casilla} title="Apagada deja de ofrecerse en los proyectos nuevos">
              <input type="checkbox" checked={e.activa !== false} onChange={ev => guardar(e, { activa: ev.target.checked })} /> activa
            </label>
            <button onClick={() => quitar(e)} disabled={ocupado} style={{ background: "none", border: "none", color: colors.muted, cursor: "pointer", display: "flex", padding: 2 }}>
              <Trash2 size={11} />
            </button>
          </div>
        ))}
        {etapas.length === 0 && <div style={{ fontSize: 12, color: colors.muted }}>Sin etapas todavía.</div>}
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        <input value={nombre} onChange={e => setNombre(e.target.value)} onKeyDown={e => e.key === "Enter" && agregar()}
          placeholder="Nueva etapa: ej. Permisos municipales" style={{ ...mini, flex: 1 }} />
        <Button variant="primary" size="sm" onClick={agregar} disabled={!nombre.trim() || ocupado}><Plus size={12} /> Agregar</Button>
      </div>
      {error && <div style={{ fontSize: 11, color: colors.warning, marginTop: 8 }}>{error}</div>}
    </div>
  );
}

const flechita = { background: "none", border: "none", color: colors.border, cursor: "pointer", padding: 0, display: "flex", lineHeight: 0 };
const casilla = { display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: colors.inkSoft, cursor: "pointer" };
