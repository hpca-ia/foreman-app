import { useState } from "react";
import { inputStyle } from "./ui/Input";
import Button from "./ui/Button";
import { TIPOS_PROYECTO } from "../lib/equipo";
import { esAdmin, rolInfo } from "../lib/roles";

// Los admins ven todos los proyectos sin ser miembros; los miembros solo
// importan para el resto. Por eso la lista muestra solo a quienes no son admin.
export default function ProjectForm({ p, users = [], onSave, onCancel }) {
  const [f, setF] = useState({ tipo: "otro", miembros: [], ...p });
  const candidatos = users.filter(u => !esAdmin(u.role));
  const alternar = id => setF(x => ({
    ...x, miembros: x.miembros.includes(id) ? x.miembros.filter(m => m !== id) : [...x.miembros, id],
  }));

  return (
    <div style={{ background: "var(--bg)", borderRadius: "var(--radius-md)", padding: 12, marginBottom: 8, border: "1.5px solid var(--brand)" }}>
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}>
          <input value={f.name} onChange={e => setF(x => ({ ...x, name: e.target.value }))} placeholder="Nombre del proyecto" style={inputStyle} />
          <input type="color" value={f.color || "#0F3D3E"} onChange={e => setF(x => ({ ...x, color: e.target.value }))} style={{ width: 38, height: 38, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", cursor: "pointer", padding: 2 }} />
        </div>

        <select value={f.tipo} onChange={e => setF(x => ({ ...x, tipo: e.target.value }))} style={inputStyle}>
          {TIPOS_PROYECTO.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>

        <div>
          <div style={{ fontSize: 11, color: "var(--ink-soft)", fontWeight: 500, marginBottom: 5 }}>¿Quién participa?</div>
          {candidatos.length === 0 ? (
            <div style={{ fontSize: 11, color: "var(--muted)" }}>No hay usuarios que no sean admin.</div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {candidatos.map(u => {
                const on = f.miembros.includes(u.id);
                return (
                  <button key={u.id} type="button" onClick={() => alternar(u.id)}
                    style={{ padding: "5px 11px", borderRadius: 20, fontSize: 12, cursor: "pointer", fontFamily: "var(--font)",
                      border: `1px solid ${on ? "var(--brand)" : "var(--border)"}`,
                      background: on ? "var(--brand)" : "#fff", color: on ? "#fff" : "var(--ink-soft)" }}>
                    {u.name} <span style={{ opacity: 0.7, fontSize: 10 }}>{rolInfo(u.role).label}</span>
                  </button>
                );
              })}
            </div>
          )}
          <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 5 }}>
            Los admins ven todos los proyectos. Cada miembro ve solo sus propias tareas, no las de los demás.
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="primary" style={{ flex: 2 }} onClick={() => f.name?.trim() && onSave(f)} disabled={!f.name?.trim()}>Guardar</Button>
          <Button variant="secondary" style={{ flex: 1 }} onClick={onCancel}>Cancelar</Button>
        </div>
      </div>
    </div>
  );
}
