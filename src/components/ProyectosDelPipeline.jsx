import { useEffect, useState, useCallback } from "react";
import { Pencil, Check } from "lucide-react";
import { supabase } from "../lib/supabase";
import { colors } from "../theme/colors";
import { esAdmin } from "../lib/roles";
import { TUNELES } from "../modules/leads/tubo";

// Los proyectos, de verdad: los del pipeline.
//
// Esta lista reemplaza a la de Ajustes. El proyecto ya no se inventa acá: nace
// en el pipeline con su tubo y sus etapas, y acá se le pone lo que hace falta
// para trabajar en equipo —su color y quién participa—, que era lo único que
// Ajustes aportaba.
//
// Quién participa se guarda en `lead_accesos`, la misma tabla que decide quién
// ve el proyecto en el pipeline: así "estar en el proyecto" significa una sola
// cosa y no dos parecidas.

export default function ProyectosDelPipeline({ users = [], onCambio }) {
  const [leads, setLeads] = useState([]);
  const [accesos, setAccesos] = useState({});    // lead_id -> { usuario_id: nivel }
  const [abierto, setAbierto] = useState(null);
  const [sinColor, setSinColor] = useState(false);
  const [guardando, setGuardando] = useState(null);

  const cargar = useCallback(async () => {
    const [{ data: ls }, { data: as }] = await Promise.all([
      supabase.from("leads").select("*").order("nombre"),
      supabase.from("lead_accesos").select("*"),
    ]);
    const filas = (ls || []).filter(l => l.resultado !== "perdido");
    setSinColor(filas.length > 0 && !("color" in filas[0]));
    setLeads(filas);
    const mapa = {};
    (as || []).forEach(a => { (mapa[a.lead_id] = mapa[a.lead_id] || {})[a.usuario_id] = a.nivel || "editar"; });
    setAccesos(mapa);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const candidatos = users.filter(u => !esAdmin(u.role));

  async function pintar(lead, color) {
    setLeads(x => x.map(l => (l.id === lead.id ? { ...l, color } : l)));
    const { error } = await supabase.from("leads").update({ color }).eq("id", lead.id);
    if (error && /column|schema cache/i.test(error.message)) setSinColor(true);
    onCambio?.();
  }

  /**
   * Poner a alguien en un proyecto con su nivel, o sacarlo.
   *
   * `nivel` null lo saca. Tocar el nivel que ya tiene también lo saca: el mismo
   * botón pone y quita, que es como funciona todo lo demás en FOREMAN.
   */
  async function ponerNivel(lead, usuarioId, nivel) {
    const actual = (accesos[lead.id] || {})[usuarioId];
    const quitar = nivel === null || actual === nivel;
    setGuardando(`${lead.id}:${usuarioId}`);
    setAccesos(a => {
      const suyos = { ...(a[lead.id] || {}) };
      if (quitar) delete suyos[usuarioId]; else suyos[usuarioId] = nivel;
      return { ...a, [lead.id]: suyos };
    });
    if (quitar) {
      await supabase.from("lead_accesos").delete().eq("lead_id", lead.id).eq("usuario_id", usuarioId);
    } else {
      // Sin la migración 051 no hay columna `nivel`: entra igual, como antes.
      let { error } = await supabase.from("lead_accesos")
        .upsert({ lead_id: lead.id, usuario_id: usuarioId, nivel }, { onConflict: "lead_id,usuario_id" });
      if (error) await supabase.from("lead_accesos").upsert({ lead_id: lead.id, usuario_id: usuarioId }, { onConflict: "lead_id,usuario_id" });
    }
    setGuardando(null);
    onCambio?.();
  }

  if (!leads.length) return null;

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: colors.muted, letterSpacing: 0.4, marginBottom: 7 }}>
        LOS PROYECTOS · {leads.length}
      </div>
      {sinColor && (
        <div style={{ fontSize: 11.5, color: colors.warning, marginBottom: 8 }}>
          Para elegir el color hace falta correr la migración 047. Lo demás funciona igual.
        </div>
      )}

      {leads.map(l => {
        const tubo = TUNELES[l.tunel || "lead"] || TUNELES.lead;
        const suyos = accesos[l.id] || {};
        const editando = abierto === l.id;
        return (
          <div key={l.id} style={{ background: colors.bg, borderRadius: colors.radiusMd, padding: "10px 12px", marginBottom: 8,
            borderLeft: `3px solid ${l.color || tubo.color}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input type="color" value={l.color || tubo.color} onChange={e => pintar(l, e.target.value)} disabled={sinColor}
                title="Color del proyecto"
                style={{ width: 26, height: 26, border: `1px solid ${colors.border}`, borderRadius: 6, cursor: sinColor ? "not-allowed" : "pointer", padding: 2, background: "#fff", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {l.nombre}
                  {l.resultado === "ganado" && <span style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 700, color: colors.success }}>APROBADO</span>}
                </div>
                <div style={{ fontSize: 11, color: colors.muted }}>
                  {tubo.label} · {Object.keys(suyos).length ? `${Object.keys(suyos).length} ${Object.keys(suyos).length === 1 ? "persona" : "personas"}` : "sin gente — solo lo ven los admins"}
                </div>
              </div>
              <button onClick={() => setAbierto(editando ? null : l.id)} title="¿Quién participa?"
                style={{ background: "none", border: `1px solid ${colors.border}`, borderRadius: 8, padding: "5px 8px", cursor: "pointer", color: colors.inkSoft, display: "flex" }}>
                <Pencil size={13} />
              </button>
            </div>

            {editando && (
              <div style={{ marginTop: 9, paddingTop: 9, borderTop: `1px solid ${colors.neutralSoft}` }}>
                <div style={{ fontSize: 11, color: colors.inkSoft, fontWeight: 500, marginBottom: 6 }}>¿Quién entra a este proyecto, y con qué nivel?</div>
                <div style={{ display: "grid", gap: 5 }}>
                  {candidatos.map(u => {
                    const nivel = suyos[u.id];
                    return (
                      <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: nivel ? colors.ink : colors.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {u.name}
                        </span>
                        {[["ver", "Ver"], ["editar", "Editar"]].map(([id, label]) => {
                          const activo = nivel === id;
                          const color = id === "editar" ? colors.brand : colors.inkSoft;
                          return (
                            <button key={id} onClick={() => ponerNivel(l, u.id, id)} disabled={guardando === `${l.id}:${u.id}`}
                              title={id === "ver" ? "Entra y lee: el proyecto y su presupuesto, sin tocar nada" : "Entra y trabaja: puede cambiar lo del proyecto y su presupuesto"}
                              style={{ display: "inline-flex", alignItems: "center", gap: 4, border: `1px solid ${activo ? color : colors.border}`,
                                background: activo ? color : "#fff", color: activo ? "#fff" : colors.inkSoft, borderRadius: 14,
                                padding: "3px 11px", fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: colors.font }}>
                              {activo && <Check size={10} />} {label}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                  {!candidatos.length && <span style={{ fontSize: 11.5, color: colors.muted }}>Todavía no hay gente en el equipo.</span>}
                </div>
                <div style={{ fontSize: 10.5, color: colors.muted, marginTop: 8, lineHeight: 1.5 }}>
                  <strong>Ver</strong>: entra al proyecto y lee su presupuesto, sin poder cambiar nada.
                  <strong> Editar</strong>: trabaja el proyecto y su presupuesto.
                  Tocar el mismo botón otra vez lo saca del proyecto. Los admins entran a todo.
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
