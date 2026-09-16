import { useState } from "react";
import { Lock } from "lucide-react";
import { GRUPOS_PERMISOS, ROLES_EDITABLES, guardarPermiso } from "../lib/permisos";
import { rolInfo } from "../lib/roles";
import { colors } from "../theme/colors";

// Solo el Director llega acá.
//
// Antes esto era una tabla de roles por columna. Con cuatro roles ya iba justo
// y con seis se desarmaba, sobre todo en el teléfono. Ahora se elige un rol y
// se ven sus interruptores: entra cualquier rol nuevo sin romper nada, y se
// lee como lo que es —"qué puede hacer un residente"— en vez de como una
// cuadrícula que hay que cruzar con el dedo.

export default function PanelPermisos({ permisos, setPermisos }) {
  const [rol, setRol] = useState(ROLES_EDITABLES[0]);
  const [guardando, setGuardando] = useState(null);
  const [error, setError] = useState("");

  async function alternar(permiso) {
    const valor = !permisos?.[rol]?.[permiso];
    setGuardando(permiso);
    setError("");
    setPermisos(prev => ({ ...prev, [rol]: { ...prev[rol], [permiso]: valor } }));
    const { error: e } = await guardarPermiso(rol, permiso, valor);
    if (e) {
      setError("No se pudo guardar. " + e.message);
      setPermisos(prev => ({ ...prev, [rol]: { ...prev[rol], [permiso]: !valor } }));
    }
    setGuardando(null);
  }

  if (!permisos) return <div style={{ padding: "30px 0", textAlign: "center", color: colors.muted, fontSize: 13 }}>Cargando permisos...</div>;

  const info = rolInfo(rol);

  return (
    <div>
      <div style={{ fontSize: 12, color: colors.inkSoft, marginBottom: 10 }}>
        Elige un rol y prende o apaga lo que puede hacer. Los cambios entran cuando la persona vuelve a abrir la app.
      </div>

      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 6 }}>
        {ROLES_EDITABLES.map(r => {
          const activo = r === rol;
          const i = rolInfo(r);
          return (
            <button key={r} onClick={() => setRol(r)}
              style={{ padding: "6px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: colors.font,
                border: `1.5px solid ${activo ? i.color : colors.border}`,
                background: activo ? i.color : "#fff", color: activo ? "#fff" : colors.inkSoft }}>
              {i.label}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: colors.muted, marginBottom: 12 }}>
        <Lock size={11} /> El Director siempre puede todo: no se edita, para que un error no lo deje fuera de su propia app.
      </div>

      {error && <div style={{ color: colors.danger, fontSize: 12, marginBottom: 10 }}>{error}</div>}

      {GRUPOS_PERMISOS.map(g => (
        <div key={g.titulo} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.4, marginBottom: 4 }}>
            {g.titulo.toUpperCase()} · {info.label.toUpperCase()}
          </div>
          {g.permisos.map(p => {
            const activo = !!permisos[rol]?.[p.id];
            const ocupado = guardando === p.id;
            return (
              <label key={p.id}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${colors.neutralSoft}`, cursor: "pointer" }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 12, color: colors.ink }}>{p.label}</span>
                  {p.nota && <span style={{ display: "block", fontSize: 10, color: colors.muted, marginTop: 1, lineHeight: 1.4 }}>{p.nota}</span>}
                </span>
                <button onClick={() => alternar(p.id)} disabled={ocupado}
                  aria-label={`${p.label} — ${info.label}`} aria-pressed={activo}
                  style={{ width: 36, height: 21, borderRadius: 11, border: "none", padding: 0, cursor: "pointer", flexShrink: 0,
                    background: activo ? info.color : colors.neutralSoft, opacity: ocupado ? 0.5 : 1,
                    transition: "background .15s", position: "relative" }}>
                  <span style={{ position: "absolute", top: 2.5, left: activo ? 17 : 2.5, width: 16, height: 16,
                    borderRadius: "50%", background: "#fff", transition: "left .15s", boxShadow: "0 1px 2px rgba(0,0,0,.2)" }} />
                </button>
              </label>
            );
          })}
        </div>
      ))}
    </div>
  );
}
