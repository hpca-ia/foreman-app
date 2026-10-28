import { useState } from "react";
import { X, Trash2, Plus } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import { RECARGOS } from "./nomina";

// Corregir los días de una persona dentro del período del rol.
//
// La asistencia se anota día por día en la obra, y ahí es donde se equivoca:
// un "vino" que era "faltó", unas horas extras en el día de al lado. Corregirlo
// desde "Asistencia del día" obligaba a ir fecha por fecha adivinando cuál
// estaba mal. Acá se ven todos los días de esa persona en el período, juntos,
// que es como se nota el error al armar el rol.

const dia = f => new Date(`${String(f).slice(0, 10)}T12:00:00`)
  .toLocaleDateString("es-EC", { weekday: "short", day: "numeric", month: "short" });

export default function EditorDias({ persona, dias = [], lead, periodo, quien, onCambio, onCerrar }) {
  const [nuevaFecha, setNuevaFecha] = useState("");
  const [error, setError] = useState("");
  const ordenados = [...dias].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));

  async function cambiar(d, campos) {
    setError("");
    const { error: e } = await supabase.from("obra_asistencia").update(campos).eq("id", d.id);
    if (e) setError(e.message); else onCambio();
  }

  async function borrar(d) {
    if (!window.confirm(`¿Borrar el ${dia(d.fecha)} de ${persona.nombre}?`)) return;
    const { error: e } = await supabase.from("obra_asistencia").delete().eq("id", d.id);
    if (e) setError(e.message); else onCambio();
  }

  async function agregar() {
    if (!nuevaFecha) return;
    if (dias.some(d => String(d.fecha).slice(0, 10) === nuevaFecha)) { setError("Ese día ya está anotado: corregilo en su fila."); return; }
    setError("");
    const { error: e } = await supabase.from("obra_asistencia").insert({
      lead_id: lead.id, obra_id: lead.obra_id || null, personal_id: persona.id,
      fecha: nuevaFecha, dias: 1, anotado_por: quien?.id ?? null,
    });
    if (e) setError(e.message); else { setNuevaFecha(""); onCambio(); }
  }

  const celda = { ...inputStyle, padding: "4px 5px", fontSize: 11.5, textAlign: "center" };

  return (
    <div style={{ background: colors.surface, border: `1px solid ${colors.brand}`, borderRadius: colors.radiusMd, padding: 12, marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: colors.ink }}>Días de {persona.nombre}</div>
          <div style={{ fontSize: 11, color: colors.muted }}>
            Del {periodo.desde} al {periodo.hasta}. Los cambios se guardan al salir de cada casilla.
          </div>
        </div>
        <button onClick={onCerrar} title="Cerrar"
          style={{ background: "none", border: "none", cursor: "pointer", color: colors.muted, display: "flex" }}><X size={16} /></button>
      </div>

      {error && <div style={{ fontSize: 12, color: colors.danger, marginBottom: 6 }}>{error}</div>}

      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 560 }}>
          <div style={{ display: "grid", gridTemplateColumns: `110px 70px 60px repeat(${RECARGOS.length}, 54px) 28px`, gap: 5,
            fontSize: 9, fontWeight: 700, color: colors.muted, padding: "4px 0" }}>
            <span>DÍA</span><span style={{ textAlign: "center" }}>VINO</span><span style={{ textAlign: "center" }}>HORAS</span>
            {RECARGOS.map(r => <span key={r.id} style={{ textAlign: "center" }}>H {r.label}</span>)}<span />
          </div>
          {!ordenados.length && <div style={{ fontSize: 12, color: colors.muted, padding: "8px 0" }}>No tiene días anotados en el período.</div>}
          {ordenados.map(d => (
            <div key={d.id} style={{ display: "grid", gridTemplateColumns: `110px 70px 60px repeat(${RECARGOS.length}, 54px) 28px`, gap: 5,
              alignItems: "center", padding: "3px 0", borderTop: `1px solid ${colors.neutralSoft}` }}>
              <span style={{ fontSize: 12, color: colors.ink }}>{dia(d.fecha)}</span>
              <select value={String(Number(d.dias))} onChange={e => cambiar(d, { dias: Number(e.target.value) })} style={celda}>
                <option value="1">Sí</option><option value="0.5">½</option><option value="0">Faltó</option>
              </select>
              {/* key con el valor: si la base devuelve otro número, la casilla lo muestra. */}
              <input key={`h${d.id}-${d.horas}`} type="number" min="0" step="0.5" defaultValue={d.horas ?? ""} placeholder="—"
                title="Horas normales de ese día. Vacío = el día según 'Vino'."
                onBlur={e => { const v = e.target.value === "" ? null : Number(e.target.value); if (v !== (d.horas ?? null)) cambiar(d, { horas: v }); }}
                style={celda} />
              {RECARGOS.map(r => (
                <input key={`${r.id}${d.id}-${d[r.id]}`} type="number" min="0" step="0.5" defaultValue={Number(d[r.id]) || ""} placeholder="0"
                  title={r.pista}
                  onBlur={e => { const v = Number(e.target.value) || 0; if (v !== (Number(d[r.id]) || 0)) cambiar(d, { [r.id]: v }); }}
                  style={celda} />
              ))}
              <button onClick={() => borrar(d)} title="Borrar este día"
                style={{ background: "none", border: "none", cursor: "pointer", color: colors.muted, display: "flex" }}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 10 }}>
        <input type="date" value={nuevaFecha} min={periodo.desde} max={periodo.hasta} onChange={e => setNuevaFecha(e.target.value)}
          style={{ ...inputStyle, width: 150, padding: "5px 8px", fontSize: 12 }} />
        <Button variant="outline" size="sm" disabled={!nuevaFecha} onClick={agregar}><Plus size={13} /> Sumar un día que falta</Button>
      </div>
    </div>
  );
}
