import { useState, useEffect, useCallback } from "react";
import { Link2, Plus, X, Loader2, Check } from "lucide-react";
import { colors } from "../theme/colors";
import { inputStyle } from "./ui/Input";
import Button from "./ui/Button";
import { leerDependencias, pedirLoQueFalta, quitarDependencia } from "../lib/tareasEquipo";

// Lo que le falta a esta tarea para poder hacerse.
//
// Camila tiene que hacer el plano, pero necesita el levantamiento. Hoy eso se
// pide por WhatsApp y se pierde: nadie sabe por qué el plano no avanza. Acá
// Camila crea la tarea que le falta, a nombre de quien la tiene que hacer, y
// la suya queda en pausa hasta que esa se complete. Al completarse, la de
// Camila se destraba sola.

const fecha = f => (f ? new Date(f + "T12:00:00").toLocaleDateString("es-EC", { day: "numeric", month: "short" }) : "sin fecha");

export default function DependenciasTarea({ tarea, currentUser, users = [], tareas = [], soloLectura, onCambio }) {
  const [espera, setEspera] = useState([]);       // tareas que tienen que pasar antes
  const [destraba, setDestraba] = useState([]);   // las que esperan a esta
  const [abierto, setAbierto] = useState(false);
  const [nueva, setNueva] = useState({ title: "", assignee_id: "", due_date: tarea.due_date || "" });
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState("");

  const porId = id => tareas.find(t => t.id === id);

  const cargar = useCallback(async () => {
    const { filas } = await leerDependencias([tarea.id]);
    setEspera(filas.filter(f => f.task_id === tarea.id));
    setDestraba(filas.filter(f => f.depende_de === tarea.id));
  }, [tarea.id]);
  useEffect(() => { cargar(); }, [cargar]);

  async function pedir() {
    if (!nueva.title.trim()) return;
    setTrabajando(true); setError("");
    const r = await pedirLoQueFalta({
      tareaQueEspera: tarea.id,
      nueva: { ...nueva, title: nueva.title.trim(), assignee_id: nueva.assignee_id ? Number(nueva.assignee_id) : null, project_id: tarea.project_id },
      creadaPor: currentUser.id,
    });
    setTrabajando(false);
    if (r.error) { setError(r.error); if (!r.tarea) return; }
    setAbierto(false); setNueva({ title: "", assignee_id: "", due_date: tarea.due_date || "" });
    await cargar();
    onCambio?.();
  }

  async function quitar(id) {
    const e = await quitarDependencia(id);
    if (e) { setError(e); return; }
    await cargar();
    onCambio?.();
  }

  const fila = (t, id, quePasa) => (
    <div key={id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderTop: `1px solid ${colors.neutralSoft}`, fontSize: 12 }}>
      {t?.status === "listo" ? <Check size={13} color={colors.success} style={{ flexShrink: 0 }} /> : <Loader2 size={13} color={colors.warning} style={{ flexShrink: 0 }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: colors.ink, overflowWrap: "anywhere", textDecoration: t?.status === "listo" ? "line-through" : "none" }}>{t?.title || `Tarea ${id}`}</div>
        <div style={{ fontSize: 10.5, color: colors.muted }}>
          {users.find(u => u.id === t?.assignee_id)?.name || "sin responsable"} · {fecha(t?.due_date)}{quePasa ? ` · ${quePasa}` : ""}
        </div>
      </div>
      {!soloLectura && <button onClick={() => quitar(id)} title="Soltar esta dependencia"
        style={{ background: "none", border: "none", color: colors.muted, cursor: "pointer", display: "flex" }}><X size={13} /></button>}
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
        <Link2 size={14} color={colors.ink} />
        <span style={{ fontSize: 13, fontWeight: 700, color: colors.ink }}>Depende de</span>
        {!soloLectura && !abierto && (
          <button onClick={() => setAbierto(true)} style={{ marginLeft: "auto", background: "none", border: `1px solid ${colors.border}`, borderRadius: 16, padding: "3px 10px", fontSize: 11, color: colors.inkSoft, cursor: "pointer", fontFamily: colors.font, display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Plus size={11} /> Pedir lo que falta
          </button>
        )}
      </div>

      {!espera.length && !abierto && (
        <div style={{ fontSize: 11.5, color: colors.muted }}>
          Nada la está frenando. Si necesitas algo de alguien para poder hacerla, pídelo desde acá: se le crea la tarea y esta queda en pausa hasta que la termine.
        </div>
      )}

      {espera.map(d => fila(porId(d.depende_de), d.id, ""))}

      {abierto && (
        <div style={{ display: "grid", gap: 8, background: colors.bg, borderRadius: colors.radiusMd, padding: 10, marginTop: 8 }}>
          <input autoFocus value={nueva.title} onChange={e => setNueva(n => ({ ...n, title: e.target.value }))}
            placeholder="¿Qué necesitas? Ej: Levantamiento del terreno" style={inputStyle} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <select value={nueva.assignee_id} onChange={e => setNueva(n => ({ ...n, assignee_id: e.target.value }))} style={inputStyle}>
              <option value="">¿Quién lo hace?</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <input type="date" value={nueva.due_date || ""} onChange={e => setNueva(n => ({ ...n, due_date: e.target.value }))} style={inputStyle} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="primary" size="sm" onClick={pedir} disabled={!nueva.title.trim() || trabajando}>{trabajando ? "Creando…" : "Crear y esperar"}</Button>
            <Button variant="outline" size="sm" onClick={() => { setAbierto(false); setError(""); }}>Cancelar</Button>
          </div>
          <div style={{ fontSize: 10.5, color: colors.muted }}>Esta tarea queda en pausa. Cuando la otra se complete, vuelve sola a En proceso.</div>
        </div>
      )}

      {destraba.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: colors.muted, letterSpacing: 0.3 }}>ESTÁN ESPERANDO ESTA</div>
          {destraba.map(d => fila(porId(d.task_id), d.id, "espera a esta"))}
        </div>
      )}

      {error && <div style={{ fontSize: 11.5, color: colors.danger, marginTop: 6 }}>{error}</div>}
    </div>
  );
}
