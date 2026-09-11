import { useState, useEffect, useCallback } from "react";
import { Plus, AlertTriangle, Clock } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import { daysUntil } from "../../lib/dates";
import Button from "../../components/ui/Button";
import { ETAPAS, ETAPAS_ABIERTAS, etapaInfo, DIAS_SIN_MOVER } from "./constantes";
import ModalLead from "./ModalLead";

const fmt = v => (Number(v) || 0).toLocaleString("es-EC", { maximumFractionDigits: 0 });
const dias = iso => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

export default function ModuloLeads({ currentUser, users = [] }) {
  const [leads, setLeads] = useState([]);
  const [rutas, setRutas] = useState({});      // lead_id -> { pasos, hechos, siguiente }
  const [abierto, setAbierto] = useState(null);
  const [nuevo, setNuevo] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [verCerrados, setVerCerrados] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    const [{ data: ls }, { data: ts }] = await Promise.all([
      supabase.from("leads").select("*").order("actualizado_at", { ascending: false }),
      supabase.from("tasks").select("id,lead_id,title,due_date,status,ruta_orden").not("lead_id", "is", null),
    ]);
    // La ruta entera, no solo el siguiente: cuántos pasos tiene, cuántos van y
    // cuál toca ahora. Un lead sin pasos pendientes se quedó sin ruta.
    const porLead = {};
    (ts || []).forEach(t => {
      const r = porLead[t.lead_id] || (porLead[t.lead_id] = { total: 0, hechos: 0, siguiente: null });
      r.total++;
      if (t.status === "listo") r.hechos++;
      else if (!r.siguiente || (t.ruta_orden ?? 999) < (r.siguiente.ruta_orden ?? 999)) r.siguiente = t;
    });
    setLeads(ls || []);
    setRutas(porLead);
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const abiertos = leads.filter(l => !etapaInfo(l.etapa).cerrada);
  const cerrados = leads.filter(l => etapaInfo(l.etapa).cerrada);

  // Las dos formas de perder un negocio sin darse cuenta: no saber cuál es el
  // siguiente paso, o saberlo y no haberlo dado.
  const sinPaso = abiertos.filter(l => !rutas[l.id]?.siguiente);
  const estancados = abiertos.filter(l => {
    const limite = DIAS_SIN_MOVER[l.etapa];
    return limite && dias(l.actualizado_at) > limite;
  });
  const vencidos = abiertos.filter(l => { const x = rutas[l.id]?.siguiente; return x?.due_date && daysUntil(x.due_date) < 0; });

  const enJuego = abiertos.reduce((s, l) => s + (Number(l.valor_estimado) || 0), 0);
  const ponderado = abiertos.reduce((s, l) => s + (Number(l.valor_estimado) || 0) * ((l.probabilidad ?? etapaInfo(l.etapa).pct) / 100), 0);

  return (
    <div style={{ fontFamily: colors.font }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: colors.ink }}>Leads</div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <Button variant="primary" size="md" onClick={() => setNuevo(true)}><Plus size={14} /> Nuevo lead</Button>
        </div>
      </div>

      {/* Lo que exige atención va primero, igual que en tareas */}
      {(vencidos.length > 0 || sinPaso.length > 0 || estancados.length > 0) && (
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          {vencidos.length > 0 && (
            <Aviso n={vencidos.length} txt={vencidos.length === 1 ? "paso vencido" : "pasos vencidos"}
              Icono={AlertTriangle} color={colors.danger} bg={colors.dangerSoft} borde={colors.dangerBorder} />
          )}
          {sinPaso.length > 0 && (
            <Aviso n={sinPaso.length} txt={sinPaso.length === 1 ? "sin próximo paso" : "sin próximo paso"}
              Icono={AlertTriangle} color={colors.warning} bg={colors.warningSoft} borde={colors.warningBorder} />
          )}
          {estancados.length > 0 && (
            <Aviso n={estancados.length} txt={estancados.length === 1 ? "sin moverse" : "sin moverse"}
              Icono={Clock} color={colors.inkSoft} bg={colors.bg} borde={colors.border} />
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 22, marginBottom: 14, flexWrap: "wrap", fontSize: 12, color: colors.inkSoft }}>
        <span><strong style={{ color: colors.ink, fontSize: 15 }}>{abiertos.length}</strong> en el túnel</span>
        <span>En juego <strong style={{ color: colors.ink, fontSize: 15 }}>${fmt(enJuego)}</strong></span>
        <span>Ponderado <strong style={{ color: colors.brand, fontSize: 15 }}>${fmt(ponderado)}</strong></span>
      </div>

      {cargando ? <div style={{ textAlign: "center", color: colors.muted, padding: "40px 0", fontSize: 13 }}>Cargando...</div>
        : leads.length === 0 ? (
          <div style={{ textAlign: "center", color: colors.muted, padding: "50px 20px", fontSize: 13, background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd }}>
            Todavía no hay leads.<br />Cada oportunidad que entre por aquí lleva su próximo paso con fecha, para que ninguna se quede dormida.
          </div>
        ) : (
          <>
            <div className="leads-tunel">
              {ETAPAS_ABIERTAS.map(et => {
                const suyos = abiertos.filter(l => l.etapa === et.id);
                const monto = suyos.reduce((s, l) => s + (Number(l.valor_estimado) || 0), 0);
                return (
                  <div key={et.id} className="leads-columna">
                    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 10px", borderBottom: `2px solid ${et.color}`, marginBottom: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: et.color, flex: 1 }}>{et.label}</span>
                      <span style={{ fontSize: 11, color: colors.muted }}>{suyos.length}</span>
                    </div>
                    {monto > 0 && <div style={{ fontSize: 10, color: colors.muted, padding: "0 10px 6px" }}>${fmt(monto)}</div>}
                    {suyos.map(l => (
                      <TarjetaLead key={l.id} lead={l} ruta={rutas[l.id]} onAbrir={() => setAbierto(l)} />
                    ))}
                  </div>
                );
              })}
            </div>

            {cerrados.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <button onClick={() => setVerCerrados(v => !v)}
                  style={{ background: "none", border: "none", color: colors.muted, fontSize: 12, cursor: "pointer", fontFamily: colors.font, padding: 0 }}>
                  {verCerrados ? "Ocultar" : "Ver"} los {cerrados.length} cerrados
                </button>
                {verCerrados && (
                  <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, marginTop: 8, overflow: "hidden" }}>
                    {cerrados.map(l => (
                      <div key={l.id} onClick={() => setAbierto(l)}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderBottom: `1px solid ${colors.neutralSoft}`, cursor: "pointer", fontSize: 12 }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: etapaInfo(l.etapa).color, flexShrink: 0 }} />
                        <span style={{ flex: 1, minWidth: 0, color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.nombre}</span>
                        <span style={{ color: colors.muted, fontSize: 11 }}>{etapaInfo(l.etapa).label}</span>
                        <span style={{ color: colors.inkSoft }}>${fmt(l.valor_estimado)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

      {(abierto || nuevo) && (
        <ModalLead lead={abierto} currentUser={currentUser} users={users} 
          onCerrar={() => { setAbierto(null); setNuevo(false); }}
          onGuardado={async () => { setAbierto(null); setNuevo(false); await cargar(); }} />
      )}
    </div>
  );
}

function Aviso({ n, txt, Icono, color, bg, borde }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, background: bg, border: `1.5px solid ${borde}`, borderRadius: colors.radiusMd, padding: "9px 13px" }}>
      <Icono size={15} color={color} />
      <span style={{ fontSize: 18, fontWeight: 700, color, lineHeight: 1 }}>{n}</span>
      <span style={{ fontSize: 12, color, fontWeight: 600 }}>{txt}</span>
    </div>
  );
}

function TarjetaLead({ lead, ruta, onAbrir }) {
  const paso = ruta?.siguiente;
  const d = paso?.due_date ? daysUntil(paso.due_date) : null;
  const vencido = d != null && d < 0;
  return (
    <div onClick={onAbrir}
      style={{ background: colors.surface, border: `1px solid ${vencido ? colors.dangerBorder : colors.border}`, borderRadius: colors.radiusSm, padding: "9px 10px", marginBottom: 6, cursor: "pointer" }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: colors.ink, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {lead.nombre}
      </div>
      {lead.valor_estimado > 0 && (
        <div style={{ fontSize: 11, color: colors.inkSoft, marginBottom: 4 }}>${fmt(lead.valor_estimado)}</div>
      )}
      {ruta?.total > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
          <div style={{ flex: 1, height: 3, background: colors.neutralSoft, borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: 3, width: `${(ruta.hechos / ruta.total) * 100}%`, background: colors.brand }} />
          </div>
          <span style={{ fontSize: 9, color: colors.muted, flexShrink: 0 }}>{ruta.hechos}/{ruta.total}</span>
        </div>
      )}
      {paso ? (
        <div style={{ fontSize: 10, color: vencido ? colors.danger : colors.muted, display: "flex", alignItems: "center", gap: 4 }}>
          <Clock size={9} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {vencido ? `Vencido ${Math.abs(d)}d · ` : d === 0 ? "Hoy · " : d != null ? `en ${d}d · ` : ""}{paso.title}
          </span>
        </div>
      ) : (
        <div style={{ fontSize: 10, color: colors.warning, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
          <AlertTriangle size={9} /> {ruta?.total ? "Ruta terminada, sin paso nuevo" : "Sin ruta"}
        </div>
      )}
    </div>
  );
}
