import { useState, useEffect, useCallback } from "react";
import { Plus, ChevronUp, ChevronDown, Trash2, ListChecks, X } from "lucide-react";
import { TUNELES } from "../modules/leads/tubo";
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
  // Cada tubo tiene sus propias etapas: las de Arquitectura no son las de
  // Construcción, y las de un lead pasan sin orden.
  const [tubo, setTubo] = useState("arquitectura");
  // El checklist de fábrica de una etapa: lo que normalmente hay que tener
  // para cerrar ese hito. Después cada proyecto lo ajusta a lo suyo.
  const [abierta, setAbierta] = useState(null);
  const [plantilla, setPlantilla] = useState([]);
  const [punto, setPunto] = useState("");
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

  const cargarPlantilla = useCallback(async etapaId => {
    if (!etapaId) { setPlantilla([]); return; }
    const { data } = await supabase.from("pipeline_etapa_items").select("*").eq("etapa_id", etapaId).eq("activo", true).order("orden");
    setPlantilla(data || []);
  }, []);
  useEffect(() => { cargarPlantilla(abierta); }, [abierta, cargarPlantilla]);

  async function agregarPunto() {
    const t = punto.trim();
    if (!t || !abierta) return;
    await supabase.from("pipeline_etapa_items").insert({ etapa_id: abierta, texto: t, orden: plantilla.length + 1 });
    setPunto("");
    cargarPlantilla(abierta);
  }
  async function quitarPunto(id) {
    await supabase.from("pipeline_etapa_items").delete().eq("id", id);
    cargarPlantilla(abierta);
  }

  async function agregar() {
    const n = nombre.trim();
    if (!n) return;
    setOcupado(true); setError("");
    const id = clave(n);
    if (etapas.some(e => e.id === `${tubo.slice(0, 3)}_${id}` || (e.id === id && (e.tunel || "lead") === tubo))) { setError("Ya existe una etapa con ese nombre en este tubo."); setOcupado(false); return; }
    const delTubo = etapas.filter(e => (e.tunel || "lead") === tubo);
    const orden = Math.max(0, ...delTubo.filter(e => !e.cierra).map(e => e.orden || 0)) + 5;
    const { error: e } = await supabase.from("pipeline_etapas").insert({ id: `${tubo.slice(0, 3)}_${id}`, nombre: n, orden, color: "#4A7C8C", tunel: tubo });
    if (e) setError("No se pudo agregar: " + e.message);
    setNombre(""); setOcupado(false);
    await cargar();
  }

  async function guardar(fila, campos) {
    setEtapas(es => es.map(e => e.id === fila.id ? { ...e, ...campos } : e));
    await supabase.from("pipeline_etapas").update(campos).eq("id", fila.id);
  }

  async function mover(fila, dir) {
    const lista = etapas.filter(e => (e.tunel || "lead") === (fila.tunel || "lead"));
    const i = lista.findIndex(e => e.id === fila.id);
    const otro = lista[i + dir];
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
  const visibles = etapas.filter(e => (e.tunel || "lead") === tubo);

  return (
    <div>
      <div style={{ fontSize: 12, color: colors.inkSoft, marginBottom: 10, lineHeight: 1.6 }}>
        Por dónde pasa un proyecto, en orden, y qué hay que tener para cerrar cada hito.
        Arquitectura y Construcción van en orden; un lead pasa sus etapas cuando pasan.
        Cada proyecto ajusta después su propio checklist sin tocar esta plantilla.
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        {Object.entries(TUNELES).map(([id, t]) => (
          <button key={id} onClick={() => { setTubo(id); setAbierta(null); }}
            style={{ border: `1px solid ${tubo === id ? colors.ink : colors.border}`, background: tubo === id ? colors.ink : "#fff",
              color: tubo === id ? "#fff" : colors.inkSoft, borderRadius: 20, padding: "5px 13px", fontSize: 12, fontWeight: 600,
              cursor: "pointer", fontFamily: colors.font }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ background: colors.bg, borderRadius: colors.radiusMd, padding: 10, marginBottom: 10 }}>
        {visibles.map((e, i) => (
          <div key={e.id} style={{ display: "grid", gridTemplateColumns: "16px 1fr 70px 76px 22px 22px", gap: 8, alignItems: "center", padding: "4px 0", opacity: e.activa === false ? 0.5 : 1 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <button onClick={() => mover(e, -1)} disabled={i === 0} style={flechita}><ChevronUp size={10} /></button>
              <button onClick={() => mover(e, 1)} disabled={i === visibles.length - 1} style={flechita}><ChevronDown size={10} /></button>
            </div>
            <input value={e.nombre} onChange={ev => guardar(e, { nombre: ev.target.value })} style={mini} />
            <label style={casilla} title="Se puede poner varias veces en el mismo proyecto, como la reunión con cliente">
              <input type="checkbox" checked={!!e.repetible} onChange={ev => guardar(e, { repetible: ev.target.checked })} /> repetible
            </label>
            <label style={casilla} title="Apagada deja de ofrecerse en los proyectos nuevos">
              <input type="checkbox" checked={e.activa !== false} onChange={ev => guardar(e, { activa: ev.target.checked })} /> activa
            </label>
            <button onClick={() => setAbierta(abierta === e.id ? null : e.id)} title="El checklist de fábrica de este hito"
              style={{ background: "none", border: "none", color: abierta === e.id ? colors.ink : colors.muted, cursor: "pointer", display: "flex", padding: 2 }}>
              <ListChecks size={12} />
            </button>
            <button onClick={() => quitar(e)} disabled={ocupado} style={{ background: "none", border: "none", color: colors.muted, cursor: "pointer", display: "flex", padding: 2 }}>
              <Trash2 size={11} />
            </button>
          </div>
        ))}
        {abierta && visibles.some(e => e.id === abierta) && (
          <div style={{ background: "#fff", border: `1px solid ${colors.border}`, borderRadius: colors.radiusSm, padding: 10, marginTop: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: colors.ink, marginBottom: 6 }}>
              Checklist de fábrica · {visibles.find(e => e.id === abierta)?.nombre}
            </div>
            {plantilla.map(p => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", fontSize: 12, color: colors.inkSoft }}>
                <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>• {p.texto}</span>
                <button onClick={() => quitarPunto(p.id)} style={{ background: "none", border: "none", color: colors.muted, cursor: "pointer", display: "flex", padding: 2 }}><X size={12} /></button>
              </div>
            ))}
            {!plantilla.length && <div style={{ fontSize: 11.5, color: colors.muted, marginBottom: 6 }}>Sin puntos todavía. Lo que pongas acá aparece sugerido en cada proyecto nuevo.</div>}
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <input value={punto} onChange={ev => setPunto(ev.target.value)} onKeyDown={ev => ev.key === "Enter" && agregarPunto()}
                placeholder="Ej: Planos aprobados por el cliente" style={{ ...mini, flex: 1 }} />
              <Button variant="outline" size="sm" onClick={agregarPunto} disabled={!punto.trim()}><Plus size={12} /></Button>
            </div>
          </div>
        )}
        {visibles.length === 0 && <div style={{ fontSize: 12, color: colors.muted }}>Este tubo todavía no tiene etapas.</div>}
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        <input value={nombre} onChange={e => setNombre(e.target.value)} onKeyDown={e => e.key === "Enter" && agregar()}
          placeholder={`Nueva etapa de ${TUNELES[tubo].label}`} style={{ ...mini, flex: 1 }} />
        <Button variant="primary" size="sm" onClick={agregar} disabled={!nombre.trim() || ocupado}><Plus size={12} /> Agregar</Button>
      </div>
      {error && <div style={{ fontSize: 11, color: colors.warning, marginTop: 8 }}>{error}</div>}
    </div>
  );
}

const flechita = { background: "none", border: "none", color: colors.border, cursor: "pointer", padding: 0, display: "flex", lineHeight: 0 };
const casilla = { display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: colors.inkSoft, cursor: "pointer" };
