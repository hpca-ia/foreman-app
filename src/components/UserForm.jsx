import { useState } from "react";
import { inputStyle } from "./ui/Input";
import Button from "./ui/Button";

export default function UserForm({ u, onSave, onCancel }) {
  const [f, setF] = useState({ ...u });
  return (
    <div style={{ background: "var(--bg)", borderRadius: "var(--radius-md)", padding: 12, marginBottom: 8, border: "1.5px solid var(--brand)" }}>
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <input value={f.name} onChange={e => setF(p => ({ ...p, name: e.target.value }))} placeholder="Nombre completo" style={inputStyle} />
          <input value={f.pin} onChange={e => setF(p => ({ ...p, pin: e.target.value }))} placeholder="PIN (4 dígitos)" maxLength={4} style={inputStyle} />
        </div>
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
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="primary" style={{ flex: 2 }} onClick={() => f.name && f.pin && onSave(f)} disabled={!f.name || !f.pin}>Guardar</Button>
          <Button variant="secondary" style={{ flex: 1 }} onClick={onCancel}>Cancelar</Button>
        </div>
      </div>
    </div>
  );
}
