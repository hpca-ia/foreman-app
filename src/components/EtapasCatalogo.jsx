import { useState, useEffect, useCallback } from "react";
import { Plus, ChevronUp, ChevronDown, Trash2 } from "lucide-react";
import { TIPOS, ORDEN_DE_TIPOS } from "../modules/leads/pipeline";
import { supabase } from "../lib/supabase";
import { colors } from "../theme/colors";
import { inputStyle } from "./ui/Input";
import Button from "./ui/Button";

// LAS ETAPAS DEL PIPELINE, POR TIPO DE LEAD.
//
// Por dónde pasa un lead mientras se persigue. No todos pasan por lo mismo: uno
// de Diseño va del plan masa a la propuesta de honorarios; uno de Construcción,
// de las ingenierías al presupuesto. Por eso cada tipo tiene su lista, y es la
// que ofrece el desplegable de etapa de cada lead.
//
// Se edita acá y no en el código porque la define la oficina. Las etapas de
// EJECUTAR un trabajo —obra gris, acabados, entrega— no van: lo aprobado sale
// del pipeline y se lleva en Control.

const clave = nombre => nombre.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30);

export default function EtapasCatalogo() {
  const [etapas, setEtapas] = useState([]);
  const [tipo, setTipo] = useState(ORDEN_DE_TIPOS[0]);
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
    const id = `${TIPOS[tipo].prefijo}_${clave(n)}`;
    if (etapas.some(e => e.id === id)) { setError("Ya existe una etapa con ese nombre en este tipo."); setOcupado(false); return; }
    const orden = Math.max(0, ...etapas.filter(e => e.tunel === tipo).map(e => e.orden || 0)) + 10;
    const { error: e } = await supabase.from("pipeline_etapas").insert({ id, nombre: n, orden, color: "#4A7C8C", tunel: tipo, principal: true });
    if (e) setError("No se pudo agregar: " + e.message);
    setNombre(""); setOcupado(false);
    await cargar();
  }

  async function guardar(fila, campos) {
    setEtapas(es => es.map(e => e.id === fila.id ? { ...e, ...campos } : e));
    await supabase.from("pipeline_etapas").update(campos).eq("id", fila.id);
  }

  async function mover(fila, dir) {
    const lista = etapas.filter(e => e.tunel === fila.tunel);
    const i = lista.findIndex(e => e.id === fila.id);
    const otro = lista[i + dir];
    if (!otro) return;
    // Si dos tienen el mismo número, intercambiarlos no mueve nada: se
    // renumera la lista entera en el orden nuevo.
    const nueva = [...lista];
    [nueva[i], nueva[i + dir]] = [nueva[i + dir], nueva[i]];
    await Promise.all(nueva.map((e, k) => supabase.from("pipeline_etapas").update({ orden: (k + 1) * 10 }).eq("id", e.id)));
    await cargar();
  }

  // Una etapa en la que hay algún lead, o que alguna tarea lleva de etiqueta,
  // no se borra: se apaga. Borrarla dejaría leads y tareas apuntando a algo
  // que ya no tiene nombre.
  async function quitar(fila) {
    setOcupado(true); setError("");
    const [{ count: enLeads }, { count: enTareas }] = await Promise.all([
      supabase.from("leads").select("id", { count: "exact", head: true }).eq("etapa", fila.id),
      supabase.from("tasks").select("id", { count: "exact", head: true }).eq("etapa_id", fila.id),
    ]);
    if (enLeads || enTareas) {
      await guardar(fila, { activa: false });
      setError(`"${fila.nombre}" está en uso (${[enLeads ? `${enLeads} ${enLeads === 1 ? "lead" : "leads"}` : "", enTareas ? `${enTareas} ${enTareas === 1 ? "tarea" : "tareas"}` : ""].filter(Boolean).join(" y ")}): se apagó en vez de borrarse.`);
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
  // Las apagadas quedan al fondo: siguen ahí porque algún lead o tarea vieja
  // las nombra, pero ya no se ofrecen.
  const visibles = etapas.filter(e => e.tunel === tipo).sort((a, b) => (a.activa === false) - (b.activa === false) || a.orden - b.orden);

  return (
    <div>
      <div style={{ fontSize: 12, color: colors.inkSoft, marginBottom: 10, lineHeight: 1.6 }}>
        Por dónde pasa un lead mientras se persigue, según su tipo. Es la lista que ofrece el desplegable de etapa de cada
        lead, en este orden. Un lead no está obligado a recorrerlas todas ni en fila: se elige la que corresponde.
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        {ORDEN_DE_TIPOS.map(id => (
          <button key={id} onClick={() => { setTipo(id); setError(""); }}
            style={{ border: `1px solid ${tipo === id ? colors.ink : colors.border}`, background: tipo === id ? colors.ink : "#fff",
              color: tipo === id ? "#fff" : colors.inkSoft, borderRadius: 20, padding: "5px 13px", fontSize: 12, fontWeight: 600,
              cursor: "pointer", fontFamily: colors.font }}>
            {TIPOS[id].label}
          </button>
        ))}
      </div>

      <div style={{ background: colors.bg, borderRadius: colors.radiusMd, padding: 10, marginBottom: 10 }}>
        {visibles.map((e, i) => (
          <div key={e.id} style={{ display: "grid", gridTemplateColumns: "16px 1fr 76px 22px", gap: 8, alignItems: "center", padding: "4px 0", opacity: e.activa === false ? 0.5 : 1 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <button onClick={() => mover(e, -1)} disabled={i === 0} style={flechita}><ChevronUp size={10} /></button>
              <button onClick={() => mover(e, 1)} disabled={i === visibles.length - 1} style={flechita}><ChevronDown size={10} /></button>
            </div>
            <input value={e.nombre} onChange={ev => guardar(e, { nombre: ev.target.value })} style={mini} />
            <label style={casilla} title="Apagada deja de ofrecerse en el desplegable">
              <input type="checkbox" checked={e.activa !== false} onChange={ev => guardar(e, { activa: ev.target.checked })} /> activa
            </label>
            <button onClick={() => quitar(e)} disabled={ocupado} title="Quitar"
              style={{ background: "none", border: "none", color: colors.muted, cursor: "pointer", display: "flex", padding: 2 }}>
              <Trash2 size={11} />
            </button>
          </div>
        ))}
        {visibles.length === 0 && <div style={{ fontSize: 12, color: colors.muted }}>Este tipo todavía no tiene etapas.</div>}
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        <input value={nombre} onChange={e => setNombre(e.target.value)} onKeyDown={e => e.key === "Enter" && agregar()}
          placeholder={`Nueva etapa de ${TIPOS[tipo].label}`} style={{ ...mini, flex: 1 }} />
        <Button variant="primary" size="sm" onClick={agregar} disabled={!nombre.trim() || ocupado}><Plus size={12} /> Agregar</Button>
      </div>
      <div style={{ fontSize: 11, color: colors.muted, marginTop: 8, lineHeight: 1.5 }}>
        Aprobado y Perdido no son etapas: son las dos salidas del pipeline, y están al final del desplegable de cada lead.
      </div>
      {error && <div style={{ fontSize: 11, color: colors.warning, marginTop: 8 }}>{error}</div>}
    </div>
  );
}

const flechita = { background: "none", border: "none", color: colors.border, cursor: "pointer", padding: 0, display: "flex", lineHeight: 0 };
const casilla = { display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: colors.inkSoft, cursor: "pointer" };
