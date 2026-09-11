import { useState } from "react";
import { Lock } from "lucide-react";
import { GRUPOS_PERMISOS, ROLES_EDITABLES, guardarPermiso } from "../lib/permisos";
import { rolInfo } from "../lib/roles";

// Solo el Director llega acá. Su propia columna se muestra encendida y
// bloqueada: no debe poder quitarse acceso a su propia app.
export default function PanelPermisos({ permisos, setPermisos }) {
  const [guardando, setGuardando] = useState(null);
  const [error, setError] = useState("");

  async function alternar(rol, permiso) {
    const valor = !permisos?.[rol]?.[permiso];
    setGuardando(`${rol}:${permiso}`);
    setError("");
    setPermisos(prev => ({ ...prev, [rol]: { ...prev[rol], [permiso]: valor } }));
    const { error: e } = await guardarPermiso(rol, permiso, valor);
    if (e) {
      setError("No se pudo guardar. " + e.message);
      setPermisos(prev => ({ ...prev, [rol]: { ...prev[rol], [permiso]: !valor } }));
    }
    setGuardando(null);
  }

  if (!permisos) return <div style={{ padding: "30px 0", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>Cargando permisos...</div>;

  const columnas = ["owner", ...ROLES_EDITABLES];
  const grid = { display: "grid", gridTemplateColumns: "1fr repeat(4, 56px)", gap: 6, alignItems: "center" };

  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 12 }}>
        Lo que puede hacer cada rol. Los cambios entran cuando la persona vuelve a abrir la app.
      </div>
      {error && <div style={{ color: "var(--danger)", fontSize: 12, marginBottom: 10 }}>{error}</div>}

      {/* Encabezado de roles, pegado arriba al desplazar */}
      <div style={{ ...grid, position: "sticky", top: 0, background: "#fff", zIndex: 2, paddingBottom: 8, borderBottom: "1px solid var(--border)" }}>
        <span />
        {columnas.map(r => (
          <span key={r} style={{ fontSize: 9, fontWeight: 700, color: rolInfo(r).color, textAlign: "center", lineHeight: 1.2 }}>
            {rolInfo(r).label.toUpperCase()}
          </span>
        ))}
      </div>

      {GRUPOS_PERMISOS.map(g => (
        <div key={g.titulo} style={{ marginTop: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.4, marginBottom: 6 }}>
            {g.titulo.toUpperCase()}
          </div>
          {g.permisos.map(p => (
            <div key={p.id} style={{ ...grid, padding: "7px 0", borderBottom: "1px solid var(--neutral-soft)" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, color: "var(--ink)" }}>{p.label}</div>
                {p.nota && <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 1 }}>{p.nota}</div>}
              </div>

              <div style={{ display: "flex", justifyContent: "center" }} title="El Director siempre puede todo">
                <Lock size={12} color="var(--muted)" />
              </div>

              {ROLES_EDITABLES.map(rol => {
                const activo = !!permisos[rol]?.[p.id];
                const ocupado = guardando === `${rol}:${p.id}`;
                return (
                  <div key={rol} style={{ display: "flex", justifyContent: "center" }}>
                    <button onClick={() => alternar(rol, p.id)} disabled={ocupado}
                      aria-label={`${p.label} — ${rolInfo(rol).label}`}
                      style={{
                        width: 34, height: 20, borderRadius: 10, border: "none", padding: 0, cursor: "pointer",
                        background: activo ? "var(--brand)" : "var(--neutral-soft)",
                        opacity: ocupado ? 0.5 : 1, transition: "background .15s", position: "relative",
                      }}>
                      <span style={{
                        position: "absolute", top: 2, left: activo ? 16 : 2, width: 16, height: 16,
                        borderRadius: "50%", background: "#fff", transition: "left .15s",
                        boxShadow: "0 1px 2px rgba(0,0,0,.2)",
                      }} />
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
