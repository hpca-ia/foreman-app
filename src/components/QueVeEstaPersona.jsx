import { useState } from "react";
import { colors } from "../theme/colors";
import { esAdmin } from "../lib/roles";
import { POR_DEFECTO } from "../lib/permisos";
import { nivelDeArea } from "../lib/acceso";
import { esProyecto } from "../modules/leads/tubo";

// "Le di permiso y no lo ve." Tres veces seguidas, y cada vez la causa era
// otra: el presupuesto colgaba del proyecto duplicado, o el rol no le abría la
// pantalla, o el presupuesto no estaba enlazado a ningún proyecto.
//
// Esta pantalla contesta eso sin adivinar: para una persona, qué ve y qué no
// —y de lo que no ve, por qué—. Usa exactamente las mismas reglas que la app,
// así que si acá dice que lo ve, lo ve.

const PUERTA = {
  presupuesto: ["presupuestos.ver", "Presupuestos"],
  obra: ["controlObra.ver", "Control de Obra"],
  libro: ["libro.ver", "Libro de Obra"],
  // La caja chica es plata de la obra: sigue al área "Control de obra" del
  // proyecto, pero tiene su propia puerta de módulo.
  caja: ["cajaChica.ver", "Caja Chica"],
};
const AREA_DEL = { presupuesto: "presupuesto", obra: "obra", libro: "libro", caja: "obra" };

export default function QueVeEstaPersona({ users = [], leads = [], accesos = {}, presupuestos = [], obras = [], cajas = [], permisos = {}, permisosUsuario = {} }) {
  const [quien, setQuien] = useState("");
  const u = users.find(x => String(x.id) === quien);

  if (!users.length) return null;

  const tienePermiso = id => {
    if (!u) return false;
    const propio = permisosUsuario[u.id]?.[id];
    if (propio !== undefined && propio !== null) return !!propio;
    return !!(permisos?.[u.role] ?? POR_DEFECTO[u.role])?.[id];
  };
  const entraATodo = !!u && (esAdmin(u.role) || tienePermiso("tareas.todas") || tienePermiso("leads.ver"));
  const nombreDe = leadId => leads.find(l => l.id === leadId)?.nombre || "un proyecto que ya no está";

  /** Qué pasa con una cosa que cuelga (o no) de un proyecto. */
  function veredicto(leadId, area) {
    const [permisoId, pantalla] = PUERTA[area];
    if (!tienePermiso(permisoId)) return { ve: false, porque: `su rol no le abre ${pantalla}`, arreglo: `Prendele ${pantalla} en Ajustes → Permisos.` };
    if (entraATodo) return { ve: true, nivel: "editar", porque: "entra a todos los proyectos" };
    if (!leadId) return { ve: false, porque: "no está enlazado a ningún proyecto", arreglo: "Enlazalo a su proyecto acá abajo, en la ficha del proyecto." };
    const nivel = nivelDeArea(accesos[leadId]?.[u.id], AREA_DEL[area] || area);
    if (!nivel) {
      const enElProyecto = accesos[leadId]?.[u.id];
      return {
        ve: false,
        porque: enElProyecto ? `en “${nombreDe(leadId)}” le pusiste esa área en “No entra”` : `no entra a “${nombreDe(leadId)}”`,
        arreglo: `Dale el nivel que quieras en la ficha de “${nombreDe(leadId)}”.`,
      };
    }
    return { ve: true, nivel, porque: `entra a “${nombreDe(leadId)}”` };
  }

  const filas = u ? [
    ...presupuestos.filter(p => !p.archivado_at).map(p => ({ tipo: "Presupuesto", nombre: p.nombre, ...veredicto(p.lead_id, "presupuesto") })),
    ...obras.map(o => ({ tipo: "Obra", nombre: o.nombre, ...veredicto(o.lead_id, "obra") })),
    ...cajas.map(c => ({
      tipo: "Caja chica", nombre: c.proyecto_nombre || `Caja #${c.id}`,
      ...(c.responsable_id === u.id
        ? { ve: true, nivel: "editar", porque: "es su caja: él rinde esa plata" }
        : veredicto(c.lead_id, "caja")),
    })),
    ...leads.filter(esProyecto).map(l => ({ tipo: "Libro", nombre: l.nombre, ...veredicto(l.id, "libro") })),
  ] : [];
  const ve = filas.filter(f => f.ve);
  const noVe = filas.filter(f => !f.ve);

  return (
    <div style={{ background: colors.bg, borderRadius: colors.radiusMd, padding: "10px 12px", marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: colors.muted, letterSpacing: 0.4, marginBottom: 2 }}>¿QUÉ VE ESTA PERSONA?</div>
      <div style={{ fontSize: 10.5, color: colors.muted, marginBottom: 6, lineHeight: 1.5 }}>
        Si le diste permiso y dice que no lo ve, elegila acá: sale qué abre, qué no, y por qué.
      </div>
      <select value={quien} onChange={e => setQuien(e.target.value)}
        style={{ width: "100%", border: `1px solid ${colors.border}`, borderRadius: 8, padding: "6px 8px",
          fontSize: 12.5, fontFamily: colors.font, color: colors.ink, background: "#fff" }}>
        <option value="">Elegí a alguien…</option>
        {users.map(x => <option key={x.id} value={x.id}>{x.name}{esAdmin(x.role) ? " · admin" : ""}</option>)}
      </select>

      {u && (
        <div style={{ marginTop: 8 }}>
          {entraATodo && (
            <div style={{ fontSize: 11, color: colors.inkSoft, marginBottom: 6 }}>
              {u.name} entra a todos los proyectos, así que ve todo lo de las pantallas que su rol le abra.
            </div>
          )}
          {!filas.length && <div style={{ fontSize: 11.5, color: colors.muted }}>Todavía no hay presupuestos ni obras que mirar.</div>}

          {noVe.length > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, color: colors.warning, letterSpacing: 0.4, margin: "6px 0 3px" }}>NO VE · {noVe.length}</div>
              {noVe.map((f, i) => (
                <div key={i} style={{ fontSize: 11.5, color: colors.ink, padding: "3px 0", borderTop: `1px solid ${colors.neutralSoft}`, lineHeight: 1.45 }}>
                  <span style={{ color: colors.muted }}>{f.tipo}:</span> {f.nombre}
                  <div style={{ fontSize: 10.5, color: colors.warning }}>{f.porque}{f.arreglo ? ` · ${f.arreglo}` : ""}</div>
                </div>
              ))}
            </>
          )}

          {ve.length > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, color: colors.success, letterSpacing: 0.4, margin: "8px 0 3px" }}>VE · {ve.length}</div>
              {ve.map((f, i) => (
                <div key={i} style={{ fontSize: 11.5, color: colors.ink, padding: "3px 0", borderTop: `1px solid ${colors.neutralSoft}` }}>
                  <span style={{ color: colors.muted }}>{f.tipo}:</span> {f.nombre}
                  <span style={{ fontSize: 10.5, color: colors.muted }}> · {f.nivel === "editar" ? "lo trabaja" : "solo lo lee"}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
