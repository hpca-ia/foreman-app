import { useState } from "react";
import { Lock } from "lucide-react";
import { GRUPOS_PERMISOS, ROLES_EDITABLES, guardarPermiso, TODOS_LOS_PERMISOS } from "../lib/permisos";
import { avisarPermisos } from "../lib/avisoCuenta";
import { rolInfo } from "../lib/roles";
import { colors } from "../theme/colors";

// Solo el Director llega acá.
//
// Antes esto era una tabla de roles por columna. Con cuatro roles ya iba justo
// y con seis se desarmaba, sobre todo en el teléfono. Ahora se elige un rol y
// se ven sus interruptores: entra cualquier rol nuevo sin romper nada, y se
// lee como lo que es —"qué puede hacer un residente"— en vez de como una
// cuadrícula que hay que cruzar con el dedo.

export default function PanelPermisos({ permisos, setPermisos, usuarios = [] }) {
  const [rol, setRol] = useState(ROLES_EDITABLES[0]);
  const [guardando, setGuardando] = useState(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  async function alternar(permiso) {
    const valor = !permisos?.[rol]?.[permiso];
    setGuardando(permiso);
    setError("");
    setPermisos(prev => ({ ...prev, [rol]: { ...prev[rol], [permiso]: valor } }));
    const { error: e } = await guardarPermiso(rol, permiso, valor);
    if (e) {
      setError("No se pudo guardar. " + e.message);
      setPermisos(prev => ({ ...prev, [rol]: { ...prev[rol], [permiso]: !valor } }));
      setGuardando(null);
      return;
    }
    // A quien le cambió lo que puede hacer, se le dice. Enterarse por toparse
    // con un botón que ya no está es la peor forma.
    const que = TODOS_LOS_PERMISOS.find(p => p.id === permiso)?.label || permiso;
    const suyos = usuarios.filter(u => u.role === rol && u.activo !== false);
    const fallas = [];
    for (const u of suyos) {
      const r = await avisarPermisos(u.id, rolInfo(rol).label, [`${valor ? "Ahora puedes" : "Ya no puedes"}: ${que}`]);
      if (r && r.ok === false) fallas.push(`${u.name || u.nombre}: ${r.error}`);
    }
    setAviso(suyos.length
      ? (fallas.length ? `Guardado. No se pudo avisar a ${fallas.join("; ")}` : `Guardado y avisado a ${suyos.length} ${suyos.length === 1 ? "persona" : "personas"}.`)
      : "Guardado. Nadie tiene ese rol todavía.");
    setGuardando(null);
  }

  /**
   * Cerrar los presupuestos de un saque.
   *
   * Apagar "Crear y editar presupuestos" rol por rol son seis idas y vueltas,
   * y mientras tanto quedan medio abiertos. Esto lo hace de una: después se
   * prende a quien corresponda, de a uno, en los permisos de cada persona.
   *
   * El Director no está en la lista de roles editables: él siempre puede.
   */
  async function cerrarPresupuestos() {
    const abiertos = ROLES_EDITABLES.filter(r => permisos?.[r]?.["presupuestos.crear"] !== false);
    if (!abiertos.length) { setAviso("Ya estaban todos cerrados."); return; }
    if (!window.confirm(
      `¿Dejar los presupuestos solo para vos?\n\n` +
      `Se apaga "Crear y editar presupuestos" en: ${abiertos.map(r => rolInfo(r).label).join(", ")}.\n\n` +
      `Después se lo prendés a quien quieras, uno por uno, desde los permisos de esa persona en Ajustes → Usuarios. ` +
      `Los siguen pudiendo LEER y exportar.`
    )) return;

    setGuardando("presupuestos.crear"); setError("");
    setPermisos(prev => {
      const copia = { ...prev };
      abiertos.forEach(r => { copia[r] = { ...copia[r], "presupuestos.crear": false }; });
      return copia;
    });
    for (const r of abiertos) {
      const { error: e } = await guardarPermiso(r, "presupuestos.crear", false);
      if (e) { setError("No se pudo guardar en " + rolInfo(r).label + ". " + e.message); setGuardando(null); return; }
    }
    setAviso(`Listo: los presupuestos quedan solo para el Director. Prendéselo a quien quieras desde sus permisos.`);
    setGuardando(null);
  }

  if (!permisos) return <div style={{ padding: "30px 0", textAlign: "center", color: colors.muted, fontSize: 13 }}>Cargando permisos...</div>;

  const info = rolInfo(rol);

  return (
    <div>
      <div style={{ fontSize: 12, color: colors.inkSoft, marginBottom: 10 }}>
        Elige un rol y prende o apaga lo que puede hacer. Los cambios entran cuando la persona vuelve a abrir la app.
      </div>

      {/* Lo que se pide seguido y rol por rol son seis idas y vueltas. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, background: colors.bg, borderRadius: colors.radiusMd, padding: "9px 11px", marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200, fontSize: 11.5, color: colors.inkSoft, lineHeight: 1.5 }}>
          <strong style={{ color: colors.ink }}>Dejar los presupuestos solo para vos.</strong> Apaga “Crear y editar
          presupuestos” en todos los roles —incluido Admin—. Después se lo prendés a quien quieras desde los permisos
          de esa persona. Todos los siguen pudiendo leer y exportar.
        </div>
        <button onClick={cerrarPresupuestos} disabled={guardando === "presupuestos.crear"}
          style={{ border: `1px solid ${colors.border}`, background: "#fff", color: colors.ink, borderRadius: 20,
            padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: colors.font, whiteSpace: "nowrap" }}>
          {guardando === "presupuestos.crear" ? "Cerrando…" : "Cerrar presupuestos"}
        </button>
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
      {aviso && <div style={{ color: colors.inkSoft, fontSize: 12, marginBottom: 10 }}>{aviso}</div>}

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
