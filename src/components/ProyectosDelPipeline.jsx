import { useEffect, useState, useCallback } from "react";
import { Pencil, Check } from "lucide-react";
import { supabase } from "../lib/supabase";
import { colors } from "../theme/colors";
import { esAdmin } from "../lib/roles";
import { TUNELES } from "../modules/leads/tubo";
import { AREAS_PROYECTO, NIVELES, filaDeAcceso, sinNingunAcceso } from "../lib/acceso";

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

// Las áreas y los niveles salen de lib/acceso.js, que es donde vive la regla:
// esta pantalla la muestra, no la define.

export default function ProyectosDelPipeline({ users = [], onCambio }) {
  const [leads, setLeads] = useState([]);
  const [accesos, setAccesos] = useState({});    // lead_id -> { usuario_id: nivel }
  const [abierto, setAbierto] = useState(null);
  const [sinColor, setSinColor] = useState(false);
  const [sinAreas, setSinAreas] = useState(false);
  const [guardando, setGuardando] = useState(null);

  const cargar = useCallback(async () => {
    const [{ data: ls }, { data: as }] = await Promise.all([
      supabase.from("leads").select("*").order("nombre"),
      supabase.from("lead_accesos").select("*"),
    ]);
    const filas = (ls || []).filter(l => l.resultado !== "perdido");
    setSinColor(filas.length > 0 && !("color" in filas[0]));
    // Si falta la migración 055 no hay columnas por área: mejor avisarlo al
    // entrar que dejar que los botones no hagan nada.
    if (as?.length) setSinAreas(!("nivel_obra" in as[0]));
    setLeads(filas);
    const mapa = {};
    (as || []).forEach(a => {
      const nivel = a.nivel || "editar";
      (mapa[a.lead_id] = mapa[a.lead_id] || {})[a.usuario_id] = {
        nivel,
        // Una fila vieja solo tiene el nivel del proyecto: vale para todo hasta
        // que alguien toque un botón de área.
        presupuesto: a.nivel_presupuesto || nivel,
        obra: a.nivel_obra || nivel,
        libro: a.nivel_libro || nivel,
      };
    });
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
   * El nivel de una persona en un área de un proyecto.
   *
   * Todo es explícito: nada se hereda ni se deduce. Si todavía no estaba en el
   * proyecto entra con esto y el resto en "No entra" —darle el presupuesto a
   * alguien no puede significar darle la obra de yapa—, y si las cuatro quedan
   * en "No entra" sale del proyecto, porque una fila que no permite nada es una
   * fila que confunde.
   */
  async function ponerNivelArea(lead, usuarioId, area, valor) {
    const despues = filaDeAcceso((accesos[lead.id] || {})[usuarioId], area, valor);
    const vacio = sinNingunAcceso(despues);

    setGuardando(`${lead.id}:${usuarioId}`);
    setAccesos(a => {
      const suyos = { ...(a[lead.id] || {}) };
      if (vacio) delete suyos[usuarioId]; else suyos[usuarioId] = despues;
      return { ...a, [lead.id]: suyos };
    });

    if (vacio) {
      await supabase.from("lead_accesos").delete().eq("lead_id", lead.id).eq("usuario_id", usuarioId);
    } else {
      const fila = { lead_id: lead.id, usuario_id: usuarioId };
      AREAS_PROYECTO.forEach(a => { fila[a.columna] = despues[a.campo] || "no"; });
      const { error } = await supabase.from("lead_accesos").upsert(fila, { onConflict: "lead_id,usuario_id" });
      // Sin la migración 055 no existen las columnas de área: entra igual con
      // el nivel del proyecto y la pantalla lo avisa.
      if (error && /column|schema cache/i.test(error.message)) {
        setSinAreas(true);
        await supabase.from("lead_accesos")
          .upsert({ lead_id: lead.id, usuario_id: usuarioId, nivel: fila.nivel }, { onConflict: "lead_id,usuario_id" });
      }
    }
    setGuardando(null);
    onCambio?.();
  }

  if (!leads.length) return null;

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: colors.muted, letterSpacing: 0.4, marginBottom: 4 }}>
        LOS PROYECTOS · {leads.length}
      </div>
      {/* La regla, dicha acá para que no haya que deducirla de dos pantallas. */}
      <div style={{ fontSize: 10.5, color: colors.muted, marginBottom: 8, lineHeight: 1.5 }}>
        Acá se decide <strong>a qué proyectos entra cada uno y para qué</strong>. En Permisos se decide si ve el
        botón del módulo; prender “ver presupuestos” allá no le abre todos los presupuestos, le abre la pantalla:
        adentro salen los de los proyectos que le des acá. El Director, los admins y quien tenga
        <strong> “Entra a todos los proyectos”</strong> entran a todos sin que haya que asignarles nada.
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
                <div style={{ fontSize: 11, color: colors.inkSoft, fontWeight: 500, marginBottom: 2 }}>¿Quién entra a este proyecto, y a qué?</div>
                {sinAreas && (
                  <div style={{ fontSize: 10.5, color: colors.warning, marginBottom: 4 }}>
                    Falta correr la migración 055 para separar presupuesto, obra y libro. Por ahora manda “Proyecto y tareas”.
                  </div>
                )}
                <div style={{ display: "grid", gap: 5 }}>
                  {candidatos.map(u => {
                    const acceso = suyos[u.id];
                    const dentro = !!acceso;
                    return (
                      <div key={u.id} style={{ borderTop: `1px solid ${colors.neutralSoft}`, paddingTop: 7, marginTop: 3 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: dentro ? colors.ink : colors.muted, marginBottom: 3 }}>
                          {u.name}
                          {!dentro && <span style={{ fontWeight: 400 }}> · no entra a este proyecto</span>}
                        </div>
                        {AREAS_PROYECTO.map(({ campo, label: etiqueta }) => {
                          const valor = (acceso?.[campo]) || "no";
                          const apagada = sinAreas && campo !== "nivel";
                          return (
                            <div key={campo} style={{ display: "flex", alignItems: "center", gap: 5, padding: "1.5px 0", opacity: apagada ? 0.45 : 1 }}>
                              <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: colors.muted }}>{etiqueta}</span>
                              {NIVELES.map(({ id: v, label, pista }) => {
                                const activo = valor === v;
                                const color = v === "no" ? colors.muted : v === "ver" ? colors.inkSoft : colors.brand;
                                return (
                                  <button key={v} title={pista} onClick={() => ponerNivelArea(l, u.id, campo, v)}
                                    disabled={apagada || guardando === `${l.id}:${u.id}`}
                                    style={{ display: "inline-flex", alignItems: "center", gap: 3,
                                      border: `1px solid ${activo ? color : colors.border}`, background: activo ? color : "#fff",
                                      color: activo ? "#fff" : colors.inkSoft, borderRadius: 12, padding: "2px 9px", fontSize: 10.5,
                                      fontWeight: 600, cursor: apagada ? "not-allowed" : "pointer", fontFamily: colors.font, whiteSpace: "nowrap" }}>
                                    {activo && <Check size={9} />} {label}
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                  {!candidatos.length && <span style={{ fontSize: 11.5, color: colors.muted }}>Todavía no hay gente en el equipo.</span>}
                </div>
                <div style={{ fontSize: 10.5, color: colors.muted, marginTop: 8, lineHeight: 1.5 }}>
                  <strong>No entra</strong>: no la ve ni aparece en su lista. <strong>Ver</strong>: la lee y no la toca.
                  <strong> Editar</strong>: la trabaja. Las cuatro en “No entra” lo sacan del proyecto.
                  Un residente típico: proyecto <em>Editar</em>, presupuesto <em>Ver</em>, obra y libro <em>Editar</em>.
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
