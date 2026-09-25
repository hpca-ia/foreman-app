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
  const [accesos, setAccesos] = useState({});    // lead_id -> [usuario_id]
  const [abierto, setAbierto] = useState(null);
  const [sinColor, setSinColor] = useState(false);
  const [guardando, setGuardando] = useState(null);

  const cargar = useCallback(async () => {
    const [{ data: ls }, { data: as }] = await Promise.all([
      supabase.from("leads").select("*").order("nombre"),
      supabase.from("lead_accesos").select("lead_id,usuario_id"),
    ]);
    const filas = (ls || []).filter(l => l.resultado !== "perdido");
    setSinColor(filas.length > 0 && !("color" in filas[0]));
    setLeads(filas);
    const mapa = {};
    (as || []).forEach(a => { (mapa[a.lead_id] = mapa[a.lead_id] || []).push(a.usuario_id); });
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

  async function alternarGente(lead, usuarioId) {
    const tiene = (accesos[lead.id] || []).includes(usuarioId);
    setGuardando(`${lead.id}:${usuarioId}`);
    setAccesos(a => ({
      ...a,
      [lead.id]: tiene ? (a[lead.id] || []).filter(x => x !== usuarioId) : [...(a[lead.id] || []), usuarioId],
    }));
    if (tiene) await supabase.from("lead_accesos").delete().eq("lead_id", lead.id).eq("usuario_id", usuarioId);
    else await supabase.from("lead_accesos").insert({ lead_id: lead.id, usuario_id: usuarioId });
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
        const suyos = accesos[l.id] || [];
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
                  {tubo.label} · {suyos.length ? `${suyos.length} ${suyos.length === 1 ? "persona" : "personas"}` : "sin gente — solo lo ven los admins"}
                </div>
              </div>
              <button onClick={() => setAbierto(editando ? null : l.id)} title="¿Quién participa?"
                style={{ background: "none", border: `1px solid ${colors.border}`, borderRadius: 8, padding: "5px 8px", cursor: "pointer", color: colors.inkSoft, display: "flex" }}>
                <Pencil size={13} />
              </button>
            </div>

            {editando && (
              <div style={{ marginTop: 9, paddingTop: 9, borderTop: `1px solid ${colors.neutralSoft}` }}>
                <div style={{ fontSize: 11, color: colors.inkSoft, fontWeight: 500, marginBottom: 6 }}>¿Quién participa?</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {candidatos.map(u => {
                    const esta = suyos.includes(u.id);
                    return (
                      <button key={u.id} onClick={() => alternarGente(l, u.id)} disabled={guardando === `${l.id}:${u.id}`}
                        style={{ display: "inline-flex", alignItems: "center", gap: 4, border: `1px solid ${esta ? colors.brand : colors.border}`,
                          background: esta ? colors.brand : "#fff", color: esta ? "#fff" : colors.inkSoft, borderRadius: 14,
                          padding: "4px 10px", fontSize: 12, cursor: "pointer", fontFamily: colors.font }}>
                        {esta && <Check size={11} />} {u.name}
                      </button>
                    );
                  })}
                  {!candidatos.length && <span style={{ fontSize: 11.5, color: colors.muted }}>Todavía no hay gente en el equipo.</span>}
                </div>
                <div style={{ fontSize: 10.5, color: colors.muted, marginTop: 6 }}>
                  Quien esté acá ve el proyecto en el pipeline y sus tareas en el tablero. Los admins ven todo.
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
