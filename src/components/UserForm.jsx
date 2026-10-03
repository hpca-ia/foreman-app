import { useState } from "react";
import { inputStyle } from "./ui/Input";
import Button from "./ui/Button";
import { esAdmin, ROLES, rolInfo } from "../lib/roles";

const etiqueta = { fontSize: 10, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.4, marginBottom: -2 };

export default function UserForm({ u, esNuevo = false, onSave, onCancel }) {
  // `proyectos` se mantiene aunque ya no se edite acá: al guardar se conserva
  // lo que la persona tuviera, en vez de vaciárselo por haber abierto la ficha.
  const [f, setF] = useState({ ...u, pin: u.pin || "", proyectos: u.proyectos || [] });

  // Al crear, el PIN es obligatorio. Al editar, vacío deja el que tenía: en la
  // base solo hay una huella del PIN, así que no hay forma de mostrarlo.
  const pinOk = f.pin ? /^\d{4,8}$/.test(f.pin) : !esNuevo;
  const listo = f.name?.trim() && pinOk;
  return (
    <div style={{ background: "var(--bg)", borderRadius: "var(--radius-md)", padding: 12, marginBottom: 8, border: "1.5px solid var(--brand)" }}>
      {/* etiqueta: los campos no decían qué eran; el rol se elegía a ciegas */}
      <div style={{ display: "grid", gap: 8 }}>
        <label style={etiqueta}>NOMBRE Y PIN</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <input value={f.name} onChange={e => setF(p => ({ ...p, name: e.target.value }))} placeholder="Nombre completo" style={inputStyle} />
          <input value={f.pin} onChange={e => setF(p => ({ ...p, pin: e.target.value.replace(/\D/g, "") }))} placeholder={esNuevo ? "PIN (de 4 a 8 dígitos)" : "Nuevo PIN (vacío: no cambia)"} maxLength={8} inputMode="numeric" style={inputStyle} />
        </div>
        {!esNuevo && (
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: -2 }}>
            El PIN actual no se puede ver. Escribe uno nuevo de 4 dígitos solo si quieres cambiarlo.
          </div>
        )}
        <label style={etiqueta}>ROL Y COLOR</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}>
          {/* Del catálogo de roles: antes estaban escritos acá y los nuevos no
              aparecían, así que el rol de esa persona se veía en blanco. */}
          <select value={f.role || ""} onChange={e => setF(p => ({ ...p, role: e.target.value }))} style={inputStyle}>
            <option value="" disabled>Elige el rol…</option>
            {Object.entries(ROLES).map(([id, r]) => <option key={id} value={id}>{r.label}</option>)}
          </select>
          <input type="color" value={f.color || "#0F3D3E"} onChange={e => setF(p => ({ ...p, color: e.target.value }))} style={{ width: 38, height: 38, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", cursor: "pointer", padding: 2 }} />
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: -4, lineHeight: 1.5 }}>
          {rolInfo(f.role).label}: lo que puede hacer se ajusta en la pestaña Permisos.
          {esAdmin(f.role) ? " Entra a todos los proyectos, salvo donde se le ponga otro nivel." : " Solo verá los proyectos que le asignes."}
        </div>
        <label style={etiqueta}>CONTACTO</label>
        <input value={f.email || ""} onChange={e => setF(p => ({ ...p, email: e.target.value }))} placeholder="Email (para notificaciones)" style={inputStyle} />
        <input value={f.phone || ""} onChange={e => setF(p => ({ ...p, phone: e.target.value }))} placeholder="WhatsApp (+593...)" style={inputStyle} />
        {/* En WhatsApp no hay clave que poner: el número es la credencial. NOVA
            solo le contesta a los que están acá. */}
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: -4, lineHeight: 1.5 }}>
          Con ese número reconoce NOVA a {f.name ? f.name.split(" ")[0] : "esta persona"} en WhatsApp. Sin número, no le contesta.
        </div>
        {/* Acá había una lista de proyectos para marcar. Ya no: los proyectos
            son los del pipeline y a qué entra cada uno —y con qué nivel en el
            presupuesto, la obra y el libro— se decide en Ajustes → Proyectos,
            proyecto por proyecto. Dos lugares para decir lo mismo terminaban
            diciendo cosas distintas, que es de donde salieron los líos de
            permisos. Lo que ya estaba marcado se conserva al guardar; solo deja
            de editarse desde acá. */}
        <div style={{ fontSize: 11, color: "var(--muted)", background: "var(--bg)", borderRadius: 8, padding: "8px 10px", lineHeight: 1.5 }}>
          A qué proyectos entra {f.name ? f.name.split(" ")[0] : "esta persona"} se decide en
          <strong style={{ color: "var(--ink-soft)" }}> Ajustes → Proyectos</strong>, uno por uno, junto con qué puede
          hacer en el presupuesto, el control de obra y el libro.
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="primary" style={{ flex: 2 }} onClick={() => listo && onSave(f)} disabled={!listo}>Guardar</Button>
          <Button variant="secondary" style={{ flex: 1 }} onClick={onCancel}>Cancelar</Button>
        </div>
      </div>
    </div>
  );
}
