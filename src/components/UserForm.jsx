import { useState } from "react";
import { inputStyle } from "./ui/Input";
import Button from "./ui/Button";
import { esAdmin } from "../lib/roles";

export default function UserForm({ u, esNuevo = false, projects = [], onSave, onCancel }) {
  const [f, setF] = useState({ ...u, pin: u.pin || "", proyectos: u.proyectos || [] });
  const alternarProyecto = id => setF(x => ({
    ...x, proyectos: x.proyectos.includes(id) ? x.proyectos.filter(p => p !== id) : [...x.proyectos, id],
  }));
  // Al crear, el PIN es obligatorio. Al editar, vacío deja el que tenía: en la
  // base solo hay una huella del PIN, así que no hay forma de mostrarlo.
  const pinOk = f.pin ? /^\d{4}$/.test(f.pin) : !esNuevo;
  const listo = f.name?.trim() && pinOk;
  return (
    <div style={{ background: "var(--bg)", borderRadius: "var(--radius-md)", padding: 12, marginBottom: 8, border: "1.5px solid var(--brand)" }}>
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <input value={f.name} onChange={e => setF(p => ({ ...p, name: e.target.value }))} placeholder="Nombre completo" style={inputStyle} />
          <input value={f.pin} onChange={e => setF(p => ({ ...p, pin: e.target.value.replace(/\D/g, "") }))} placeholder={esNuevo ? "PIN (4 dígitos)" : "Nuevo PIN (vacío: no cambia)"} maxLength={4} inputMode="numeric" style={inputStyle} />
        </div>
        {!esNuevo && (
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: -2 }}>
            El PIN actual no se puede ver. Escribe uno nuevo de 4 dígitos solo si quieres cambiarlo.
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}>
          <select value={f.role} onChange={e => setF(p => ({ ...p, role: e.target.value }))} style={inputStyle}>
            <option value="owner">Director</option>
            <option value="assistant">Admin</option>
            <option value="gerente">Gerente de Proyecto</option>
            <option value="residente">Residente</option>
          </select>
          <input type="color" value={f.color || "#0F3D3E"} onChange={e => setF(p => ({ ...p, color: e.target.value }))} style={{ width: 38, height: 38, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", cursor: "pointer", padding: 2 }} />
        </div>
        <input value={f.email || ""} onChange={e => setF(p => ({ ...p, email: e.target.value }))} placeholder="Email (para notificaciones)" style={inputStyle} />
        <input value={f.phone || ""} onChange={e => setF(p => ({ ...p, phone: e.target.value }))} placeholder="WhatsApp (+593...)" style={inputStyle} />
        {/* Para quien está en varias obras: sus proyectos se marcan acá de una
            vez, en vez de entrar proyecto por proyecto. Los admins ven todos. */}
        {esAdmin(f.role) ? (
          <div style={{ fontSize: 11, color: "var(--muted)" }}>Los admins ven todos los proyectos; no hace falta asignarles ninguno.</div>
        ) : (
          <div>
            <div style={{ fontSize: 11, color: "var(--ink-soft)", fontWeight: 500, marginBottom: 5 }}>
              Proyectos donde participa {f.proyectos.length > 0 && <span style={{ color: "var(--muted)", fontWeight: 400 }}>· {f.proyectos.length}</span>}
            </div>
            {projects.length === 0 ? (
              <div style={{ fontSize: 11, color: "var(--muted)" }}>Todavía no hay proyectos.</div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {projects.map(p => {
                  const on = f.proyectos.includes(p.id);
                  return (
                    <button key={p.id} type="button" onClick={() => alternarProyecto(p.id)}
                      style={{ padding: "5px 11px", borderRadius: 20, fontSize: 12, cursor: "pointer", fontFamily: "var(--font)",
                        border: `1px solid ${on ? (p.color || "var(--brand)") : "var(--border)"}`,
                        background: on ? (p.color || "var(--brand)") : "#fff", color: on ? "#fff" : "var(--ink-soft)" }}>
                      {p.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="primary" style={{ flex: 2 }} onClick={() => listo && onSave(f)} disabled={!listo}>Guardar</Button>
          <Button variant="secondary" style={{ flex: 1 }} onClick={onCancel}>Cancelar</Button>
        </div>
      </div>
    </div>
  );
}
