import { useState, useEffect, useCallback } from "react";
import { Plus, ChevronUp, ChevronDown, Trash2, UserPlus } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import { inputStyle } from "../../components/ui/Input";
import Button from "../../components/ui/Button";
import { etapaInfo, ESTADOS_ETAPA, SIGUIENTE_ESTADO_ETAPA } from "./constantes";

// Las etapas que este proyecto sí recorre, en su orden. No todos los proyectos
// hacen lo mismo: uno arranca por presupuesto, otro por plan masa. La reunión
// con cliente se agrega tantas veces como haga falta.
//
// Cada etapa tiene un responsable del siguiente paso, que puede ser alguien de
// FOREMAN o alguien de fuera —el cliente, un proveedor—, porque muchas veces
// la pelota está del otro lado.

const vacio = { nombre: "", rol: "cliente", email: "", telefono: "" };

export default function EtapasLead({ lead, catalogo, users = [], currentUser, onEtapaCambiada }) {
  const [etapas, setEtapas] = useState([]);
  const [invitados, setInvitados] = useState([]);
  const [sinTabla, setSinTabla] = useState(false);
  const [agregando, setAgregando] = useState(false);
  const [invitado, setInvitado] = useState(null);   // null = formulario cerrado
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    const [{ data: es, error }, { data: inv }] = await Promise.all([
      supabase.from("lead_etapas").select("*").eq("lead_id", lead.id).order("orden"),
      supabase.from("pipeline_invitados").select("*").eq("lead_id", lead.id).order("nombre"),
    ]);
    if (error && /relation|schema cache|does not exist/i.test(error.message)) { setSinTabla(true); return; }
    setEtapas(es || []); setInvitados(inv || []);
  }, [lead.id]);
  useEffect(() => { cargar(); }, [cargar]);

  async function anotar(detalle, extra = {}) {
    await supabase.from("lead_movimientos").insert({
      lead_id: lead.id, tipo: "etapa", detalle,
      autor_id: currentUser?.id, autor_nombre: currentUser?.name, ...extra,
    });
  }

  async function agregar(etapaId) {
    setOcupado(true);
    const orden = Math.max(0, ...etapas.map(e => e.orden || 0)) + 1;
    await supabase.from("lead_etapas").insert({ lead_id: lead.id, etapa_id: etapaId, orden });
    setAgregando(false); setOcupado(false);
    await cargar();
  }

  async function mover(fila, dir) {
    const i = etapas.findIndex(e => e.id === fila.id);
    const otro = etapas[i + dir];
    if (!otro) return;
    await Promise.all([
      supabase.from("lead_etapas").update({ orden: otro.orden }).eq("id", fila.id),
      supabase.from("lead_etapas").update({ orden: fila.orden }).eq("id", otro.id),
    ]);
    await cargar();
  }

  // La etapa en curso es la del proyecto: al marcarla, el tablero se mueve y
  // queda el registro de quién la movió y cuándo.
  async function cambiarEstado(fila) {
    const nuevo = SIGUIENTE_ESTADO_ETAPA[fila.estado] || "en_curso";
    setOcupado(true);
    await supabase.from("lead_etapas").update({
      estado: nuevo, hecha_at: nuevo === "hecha" ? new Date().toISOString() : null,
    }).eq("id", fila.id);

    if (nuevo === "en_curso") {
      const otras = etapas.filter(e => e.id !== fila.id && e.estado === "en_curso");
      for (const o of otras) await supabase.from("lead_etapas").update({ estado: "hecha", hecha_at: new Date().toISOString() }).eq("id", o.id);
      if (lead.etapa !== fila.etapa_id) {
        await supabase.from("leads").update({ etapa: fila.etapa_id, actualizado_at: new Date().toISOString() }).eq("id", lead.id);
        await anotar(`${etapaInfo(lead.etapa, catalogo).nombre} → ${etapaInfo(fila.etapa_id, catalogo).nombre}`,
          { etapa_de: lead.etapa, etapa_a: fila.etapa_id });
        onEtapaCambiada?.(fila.etapa_id);
      }
    } else if (nuevo === "hecha") {
      await anotar(`Etapa hecha: ${etapaInfo(fila.etapa_id, catalogo).nombre}`);
    }
    setOcupado(false);
    await cargar();
  }

  async function actualizar(fila, campos) {
    await supabase.from("lead_etapas").update(campos).eq("id", fila.id);
    setEtapas(es => es.map(e => e.id === fila.id ? { ...e, ...campos } : e));
  }

  async function borrar(fila) {
    await supabase.from("lead_etapas").delete().eq("id", fila.id);
    await cargar();
  }

  function elegirResponsable(fila, valor) {
    if (!valor) return actualizar(fila, { responsable_id: null, invitado_id: null, responsable_nombre: null });
    const [tipo, id] = valor.split(":");
    if (tipo === "u") {
      const u = users.find(x => String(x.id) === id);
      return actualizar(fila, { responsable_id: Number(id), invitado_id: null, responsable_nombre: u?.name || null });
    }
    const inv = invitados.find(x => String(x.id) === id);
    return actualizar(fila, { invitado_id: Number(id), responsable_id: null, responsable_nombre: inv?.nombre || null });
  }

  async function guardarInvitado() {
    if (!invitado?.nombre.trim()) return;
    setOcupado(true);
    await supabase.from("pipeline_invitados").insert({
      lead_id: lead.id, nombre: invitado.nombre.trim(), rol: invitado.rol,
      email: invitado.email || null, telefono: invitado.telefono || null,
    });
    setInvitado(null); setOcupado(false);
    await cargar();
  }

  if (sinTabla) {
    return (
      <div style={{ fontSize: 11, color: colors.warning, background: colors.warningSoft, borderRadius: colors.radiusSm, padding: "8px 10px", marginBottom: 12 }}>
        Para usar las etapas del proyecto falta correr la migración 021 en Supabase.
      </div>
    );
  }

  const usadas = new Set(etapas.map(e => e.etapa_id));
  const disponibles = catalogo.filter(e => e.repetible || !usadas.has(e.id));
  const mini = { ...inputStyle, padding: "5px 7px", fontSize: 11 };

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: colors.ink, flex: 1 }}>Etapas de este proyecto</div>
        <button onClick={() => setAgregando(a => !a)} style={{ background: "none", border: "none", color: colors.brand, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: colors.font, display: "flex", alignItems: "center", gap: 3 }}>
          <Plus size={12} /> Agregar etapa
        </button>
      </div>

      {agregando && (
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
          {disponibles.map(e => (
            <button key={e.id} onClick={() => agregar(e.id)} disabled={ocupado}
              style={{ padding: "5px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: colors.font,
                border: `1px solid ${e.color || colors.border}`, background: "transparent", color: e.color || colors.inkSoft }}>
              {e.nombre}{e.repetible ? " +" : ""}
            </button>
          ))}
          {!disponibles.length && <span style={{ fontSize: 11, color: colors.muted }}>Ya están todas.</span>}
        </div>
      )}

      <div style={{ background: colors.bg, borderRadius: colors.radiusMd, padding: 10, marginBottom: 12 }}>
        {etapas.length === 0 && (
          <div style={{ fontSize: 11, color: colors.inkSoft }}>
            Sin etapas todavía. Agrega las que este proyecto sí va a recorrer: no todos siguen el mismo camino.
          </div>
        )}
        {etapas.map((e, i) => {
          const info = etapaInfo(e.etapa_id, catalogo);
          const est = ESTADOS_ETAPA[e.estado] || ESTADOS_ETAPA.pendiente;
          return (
            <div key={e.id} style={{ display: "grid", gridTemplateColumns: "16px 1fr 96px 130px 120px 22px", gap: 6, alignItems: "center", padding: "4px 0" }}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <button onClick={() => mover(e, -1)} disabled={i === 0} style={flechita}><ChevronUp size={10} /></button>
                <button onClick={() => mover(e, 1)} disabled={i === etapas.length - 1} style={flechita}><ChevronDown size={10} /></button>
              </div>
              <span style={{ fontSize: 12, color: colors.ink, display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: info.color || colors.border, flexShrink: 0 }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{info.nombre}</span>
              </span>
              <button onClick={() => cambiarEstado(e)} disabled={ocupado} title="Pendiente → en curso → hecha → no se hizo"
                style={{ padding: "4px 6px", borderRadius: colors.radiusSm, fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: colors.font,
                  border: `1px solid ${est.color}`, background: e.estado === "en_curso" ? est.color : "transparent",
                  color: e.estado === "en_curso" ? "#fff" : est.color }}>
                {est.label}
              </button>
              <select value={e.invitado_id ? `i:${e.invitado_id}` : e.responsable_id ? `u:${e.responsable_id}` : ""}
                onChange={ev => elegirResponsable(e, ev.target.value)} style={mini} title="Responsable del siguiente paso">
                <option value="">Sin responsable</option>
                <optgroup label="Equipo">
                  {users.map(u => <option key={u.id} value={`u:${u.id}`}>{u.name}</option>)}
                </optgroup>
                {invitados.length > 0 && (
                  <optgroup label="Fuera de FOREMAN">
                    {invitados.map(x => <option key={x.id} value={`i:${x.id}`}>{x.nombre}{x.rol ? ` (${x.rol})` : ""}</option>)}
                  </optgroup>
                )}
              </select>
              <input type="date" value={e.fecha_objetivo || ""} onChange={ev => actualizar(e, { fecha_objetivo: ev.target.value || null })} style={mini} title="Para cuándo" />
              <button onClick={() => borrar(e)} style={{ background: "none", border: "none", color: colors.muted, cursor: "pointer", display: "flex", padding: 2 }}><Trash2 size={11} /></button>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: colors.ink, flex: 1 }}>
          Personas de este proyecto <span style={{ fontWeight: 400, color: colors.muted }}>fuera de FOREMAN</span>
        </div>
        <button onClick={() => setInvitado(invitado ? null : { ...vacio })} style={{ background: "none", border: "none", color: colors.brand, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: colors.font, display: "flex", alignItems: "center", gap: 3 }}>
          <UserPlus size={12} /> Agregar persona
        </button>
      </div>

      {invitado && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 1fr 1fr auto", gap: 6, alignItems: "center", marginBottom: 8 }}>
          <input value={invitado.nombre} onChange={e => setInvitado(p => ({ ...p, nombre: e.target.value }))} placeholder="Nombre" style={mini} autoFocus />
          <select value={invitado.rol} onChange={e => setInvitado(p => ({ ...p, rol: e.target.value }))} style={mini}>
            <option value="cliente">Cliente</option><option value="proveedor">Proveedor</option><option value="otro">Otro</option>
          </select>
          <input value={invitado.email} onChange={e => setInvitado(p => ({ ...p, email: e.target.value }))} placeholder="Correo" style={mini} />
          <input value={invitado.telefono} onChange={e => setInvitado(p => ({ ...p, telefono: e.target.value }))} placeholder="WhatsApp" style={mini} />
          <Button variant="primary" size="sm" onClick={guardarInvitado} disabled={!invitado.nombre.trim() || ocupado}>Guardar</Button>
        </div>
      )}

      {invitados.length > 0 && (
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 12 }}>
          {invitados.map(x => (
            <span key={x.id} style={{ fontSize: 11, color: colors.inkSoft, background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 20, padding: "3px 9px" }}>
              {x.nombre} <span style={{ color: colors.muted }}>{x.rol}</span>
            </span>
          ))}
        </div>
      )}
    </>
  );
}

const flechita = { background: "none", border: "none", color: colors.border, cursor: "pointer", padding: 0, display: "flex", lineHeight: 0 };
