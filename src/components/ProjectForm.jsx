import { useState } from "react";
import { inputStyle } from "./ui/Input";
import Button from "./ui/Button";

export default function ProjectForm({ p, onSave, onCancel }) {
  const [f, setF] = useState({ ...p });
  return (
    <div style={{ background: "var(--bg)", borderRadius: "var(--radius-md)", padding: 12, marginBottom: 8, border: "1.5px solid var(--brand)" }}>
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}>
          <input value={f.name} onChange={e => setF(p => ({ ...p, name: e.target.value }))} placeholder="Nombre del proyecto" style={inputStyle} />
          <input type="color" value={f.color || "#0F3D3E"} onChange={e => setF(p => ({ ...p, color: e.target.value }))} style={{ width: 38, height: 38, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", cursor: "pointer", padding: 2 }} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="primary" style={{ flex: 2 }} onClick={() => f.name && onSave(f)} disabled={!f.name}>Guardar</Button>
          <Button variant="secondary" style={{ flex: 1 }} onClick={onCancel}>Cancelar</Button>
        </div>
      </div>
    </div>
  );
}
