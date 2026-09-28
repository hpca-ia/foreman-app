import { useState } from "react";
import { colors } from "../theme/colors";
import { GRUPOS_PERMISOS, POR_DEFECTO, guardarPermisoUsuario } from "../lib/permisos";

// Los permisos de una persona, por encima de los de su rol.
//
// El rol alcanza para el caso general —un residente ve lo que ve un residente—
// pero no para la oficina de verdad: a Camila hay que dejarla ver presupuestos
// sin volverla gerente, y a un residente darle una obra y no las otras. Antes
// eso obligaba a cambiarle el rol, y con el rol le cambiaba todo de golpe.
//
// Tres estados y no dos: hereda, sí y no. "Hereda" es el que importa — si una
// persona nueva entra al equipo, su rol le da lo suyo sin que nadie marque
// veinte casillas, y el día que cambien los permisos de ese rol, los suyos
// cambian con él.

const ESTADOS = [
  [null, "Hereda", "Lo que diga su rol"],
  [true, "Sí", "Puede, aunque su rol no"],
  [false, "No", "No puede, aunque su rol sí"],
];

export default function PermisosDeUsuario({ usuario, permisos, valores = {}, onCambio }) {
  const [guardando, setGuardando] = useState(null);
  const [error, setError] = useState("");

  if (usuario.role === "owner") {
    return (
      <div style={{ fontSize: 11.5, color: colors.muted, padding: "8px 0" }}>
        El Director puede todo, siempre. No se le editan permisos: un error acá lo dejaría fuera de su propia app.
      </div>
    );
  }

  const delRol = permiso => !!(permisos?.[usuario.role]?.[permiso] ?? POR_DEFECTO[usuario.role]?.[permiso]);

  async function poner(permiso, valor) {
    setGuardando(permiso); setError("");
    const { error: e } = await guardarPermisoUsuario(usuario.id, permiso, valor);
    setGuardando(null);
    if (e) { setError(/relation|does not exist|schema cache/i.test(e.message) ? "Falta correr la migración 049." : e.message); return; }
    onCambio?.(usuario.id, permiso, valor);
  }

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${colors.neutralSoft}` }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: colors.ink, marginBottom: 2 }}>Permisos de {usuario.name}</div>
      <div style={{ fontSize: 10.5, color: colors.muted, marginBottom: 8 }}>
        Lo que se marque acá manda sobre su rol. Lo que quede en “Hereda” sigue a {`"${usuario.role}"`} y cambia cuando cambie el rol.
      </div>

      {GRUPOS_PERMISOS.map(g => (
        <div key={g.titulo} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, color: colors.muted, letterSpacing: 0.4, marginBottom: 4 }}>{g.titulo.toUpperCase()}</div>
          {g.permisos.map(p => {
            const valor = valores[p.id];
            const heredado = delRol(p.id);
            return (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderTop: `1px solid ${colors.neutralSoft}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: colors.ink }}>{p.label}</div>
                  {p.nota && <div style={{ fontSize: 10, color: colors.muted }}>{p.nota}</div>}
                </div>
                <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                  {ESTADOS.map(([v, label, ayuda]) => {
                    const activo = valor === undefined ? v === null : valor === v;
                    const color = v === null ? colors.inkSoft : v ? colors.success : colors.danger;
                    return (
                      <button key={String(v)} onClick={() => poner(p.id, v)} disabled={guardando === p.id}
                        title={v === null ? `${ayuda}: ${heredado ? "sí puede" : "no puede"}` : ayuda}
                        style={{ border: `1px solid ${activo ? color : colors.border}`, background: activo ? color : "#fff",
                          color: activo ? "#fff" : colors.inkSoft, borderRadius: 12, padding: "3px 9px", fontSize: 10.5,
                          fontWeight: 600, cursor: "pointer", fontFamily: colors.font }}>
                        {label}{v === null ? ` (${heredado ? "sí" : "no"})` : ""}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {error && <div style={{ fontSize: 11, color: colors.danger }}>{error}</div>}
    </div>
  );
}
