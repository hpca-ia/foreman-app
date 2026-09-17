import { useState, useEffect, useCallback } from "react";
import { Plus, ChevronUp, ChevronDown, Trash2, UserPlus, Eye, X } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import { inputStyle } from "../../components/ui/Input";
import Button from "../../components/ui/Button";
import { etapaInfo, ESTADOS_ETAPA, SIGUIENTE_ESTADO_ETAPA } from "./constantes";

// Las etapas que este proyecto sí recorre, en su orden. No todos los proyectos
// hacen lo mismo: uno arranca por presupuesto, otro por plan masa. La reunión
// con cliente se agrega tantas veces como haga falta.
//
// Poner a alguien a cargo de una etapa hace dos cosas más, que es como se
// trabaja de verdad: esa persona pasa a ver el proyecto, y la etapa le aparece
// como tarea con su fecha, junto al resto de su trabajo. "Plan masa, 15 días,
// Camila" no debería vivir solo en la cabeza de quien lo decidió.

const vacio = { nombre: "", rol: "cliente", email: "", telefono: "" };

export default function EtapasLead({ lead, catalogo, users = [], currentUser, puedeCompartir, onEtapaCambiada }) {
  const [etapas, setEtapas] = useState([]);
  const [invitados, setInvitados] = useState([]);
  const [accesos, setAccesos] = useState([]);
  const [sinTabla, setSinTabla] = useState(false);
  const [agregando, setAgregando] = useState(false);
  const [invitado, setInvitado] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    const [{ data: es, error }, { data: inv }, { data: acc }] = await Promise.all([
      supabase.from("lead_etapas").select("*").eq("lead_id", lead.id).order("orden"),
      supabase.from("pipeline_invitados").select("*").eq("lead_id", lead.id).order("nombre"),
      supabase.from("lead_accesos").select("*").eq("lead_id", lead.id),
    ]);
    if (error && /relation|schema cache|does not exist/i.test(error.message)) { setSinTabla(true); return; }
    setEtapas(es || []); setInvitados(inv || []); setAccesos(acc || []);
  }, [lead.id]);
  useEffect(() => { cargar(); }, [cargar]);

  async function anotar(detalle, extra = {}) {
    await supabase.from("lead_movimientos").insert({
      lead_id: lead.id, tipo: "etapa", detalle,
      autor_id: currentUser?.id, autor_nombre: currentUser?.name, ...extra,
    });
  }

  // Quien tiene una etapa a su cargo ve el proyecto: la etapa es suya.
  async function darAcceso(usuarioId, origen = "responsable") {
    if (!usuarioId || usuarioId === lead.created_by) return;
    await supabase.from("lead_accesos").upsert(
      { lead_id: lead.id, usuario_id: usuarioId, origen, creado_por: currentUser?.id },
      { onConflict: "lead_id,usuario_id", ignoreDuplicates: true });
    await cargar();
  }

  // Le avisa a quien queda a cargo. Las tareas normales ya avisaban; las que
  // nacían de una etapa, no: la persona se enteraba solo si abría FOREMAN.
  function avisarPorCorreo(fila) {
    const u = users.find(x => x.id === fila.responsable_id);
    if (!u?.email) return;
    const info = etapaInfo(fila.etapa_id, catalogo);
    fetch("/api/email", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: u.email,
        subject: `Nueva tarea: ${info.nombre} \u00b7 ${lead.nombre}`,
        html: `<div style="font-family:Inter,Helvetica,Arial,sans-serif;max-width:500px;margin:0 auto;color:#374151">
          <p style="font-size:15px">${currentUser?.name || "Alguien"} te dej\u00f3 a cargo de <strong>${info.nombre}</strong> en <strong>${lead.nombre}</strong>.</p>
          ${fila.fecha_objetivo ? `<p style="font-size:14px">Para el <strong>${fila.fecha_objetivo}</strong>.</p>` : ""}
          <p style="font-size:13px;color:#6B7280">Lo tienes en FOREMAN, en tus tareas y en el proyecto.</p>
        </div>`,
      }),
    }).catch(() => {});
  }

  // La etapa con responsable y fecha también es una tarea suya: aparece donde
  // ya mira todos los días, no en una lista aparte que hay que acordarse de abrir.
  async function sincronizarTarea(fila) {
    const info = etapaInfo(fila.etapa_id, catalogo);
    const estado = fila.estado === "hecha" ? "listo" : fila.estado === "omitida" ? "bloqueado" : "pendiente";
    const datos = {
      title: `${info.nombre} · ${lead.nombre}`,
      due_date: fila.fecha_objetivo || null,
      assignee_id: fila.responsable_id || null,
      status: estado, priority: "media", type: "lead", lead_id: lead.id,
    };
    if (fila.tarea_id) {
      await supabase.from("tasks").update(datos).eq("id", fila.tarea_id);
      return fila.tarea_id;
    }
    if (!fila.responsable_id) return null;   // sin responsable no hay tarea
    const { data } = await supabase.from("tasks")
      .insert({ ...datos, created_by: currentUser?.id, ruta_orden: fila.orden })
      .select("id").single();
    if (data?.id) await supabase.from("lead_etapas").update({ tarea_id: data.id }).eq("id", fila.id);
    return data?.id || null;
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
    const estado = SIGUIENTE_ESTADO_ETAPA[fila.estado] || "en_curso";
    setOcupado(true);
    await supabase.from("lead_etapas").update({
      estado, hecha_at: estado === "hecha" ? new Date().toISOString() : null,
    }).eq("id", fila.id);
    await sincronizarTarea({ ...fila, estado });

    if (estado === "en_curso") {
      for (const o of etapas.filter(e => e.id !== fila.id && e.estado === "en_curso")) {
        await supabase.from("lead_etapas").update({ estado: "hecha", hecha_at: new Date().toISOString() }).eq("id", o.id);
        await sincronizarTarea({ ...o, estado: "hecha" });
      }
      if (lead.etapa !== fila.etapa_id) {
        await supabase.from("leads").update({ etapa: fila.etapa_id, actualizado_at: new Date().toISOString() }).eq("id", lead.id);
        await anotar(`${etapaInfo(lead.etapa, catalogo).nombre} → ${etapaInfo(fila.etapa_id, catalogo).nombre}`,
          { etapa_de: lead.etapa, etapa_a: fila.etapa_id });
        onEtapaCambiada?.(fila.etapa_id);
        // Quien recibe la posta se entera por correo, sin depender de que
        // alguien se acuerde de avisarle.
        fetch("/api/pipeline-informe", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadId: lead.id, a: "responsable", motivo: `cambio de etapa a ${etapaInfo(fila.etapa_id, catalogo).nombre}` }),
        }).catch(() => {});
      }
    } else if (estado === "hecha") {
      await anotar(`Etapa hecha: ${etapaInfo(fila.etapa_id, catalogo).nombre}`);
    }
    setOcupado(false);
    await cargar();
  }

  async function actualizar(fila, campos) {
    await supabase.from("lead_etapas").update(campos).eq("id", fila.id);
    const nueva = { ...fila, ...campos };
    setEtapas(es => es.map(e => e.id === fila.id ? nueva : e));
    await sincronizarTarea(nueva);
  }

  async function borrar(fila) {
    if (fila.tarea_id) await supabase.from("tasks").delete().eq("id", fila.tarea_id);
    await supabase.from("lead_etapas").delete().eq("id", fila.id);
    await cargar();
  }

  async function elegirResponsable(fila, valor) {
    if (!valor) return actualizar(fila, { responsable_id: null, invitado_id: null, responsable_nombre: null });
    const [tipo, id] = valor.split(":");
    if (tipo === "u") {
      const u = users.find(x => String(x.id) === id);
      await actualizar(fila, { responsable_id: Number(id), invitado_id: null, responsable_nombre: u?.name || null });
      await darAcceso(Number(id));
      avisarPorCorreo({ ...fila, responsable_id: Number(id) });
      return;
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

  async function quitarAcceso(usuarioId) {
    await supabase.from("lead_accesos").delete().eq("lead_id", lead.id).eq("usuario_id", usuarioId);
    await cargar();
  }

  if (sinTabla) {
    return (
      <div style={{ fontSize: 11, color: colors.warning, background: colors.warningSoft, borderRadius: colors.radiusSm, padding: "8px 10px", marginBottom: 12 }}>
        Para usar las etapas del proyecto falta correr las migraciones 021 y 022 en Supabase.
      </div>
    );
  }

  // Una etapa repetible lleva su número: "Reunión con cliente (2)".
  const repeticion = (fila, i) => {
    const iguales = etapas.filter(e => e.etapa_id === fila.etapa_id);
    if (iguales.length < 2) return "";
    return ` (${iguales.findIndex(e => e.id === fila.id) + 1})`;
  };
  const usadas = new Set(etapas.map(e => e.etapa_id));
  const disponibles = catalogo.filter(e => e.repetible || !usadas.has(e.id));
  const conAcceso = accesos.map(a => ({ ...a, nombre: users.find(u => u.id === a.usuario_id)?.name || `Usuario ${a.usuario_id}` }));
  const mini = { ...inputStyle, padding: "5px 7px", fontSize: 11 };

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: colors.ink, flex: 1 }}>Etapas de este proyecto</div>
        <button onClick={() => setAgregando(a => !a)} style={enlace}><Plus size={12} /> Agregar etapa</button>
      </div>
      <div style={{ fontSize: 11, color: colors.inkSoft, marginBottom: 8, lineHeight: 1.5 }}>
        Los hitos grandes del proyecto: plan masa, propuesta, contrato. Cada uno con quién responde y para cuándo.
        La que marques <strong>En curso</strong> es la etapa en la que el proyecto aparece en el tablero,
        y la que tenga responsable se le convierte en tarea con su fecha. El orden lo pones tú con las flechitas: hay proyectos que presupuestan antes del plan masa, y la reunión con cliente se puede repetir. Los pasos sueltos del día a día van más abajo.
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
            <div key={e.id} className="etapa-fila">
              <div style={{ display: "flex", flexDirection: "column" }}>
                <button onClick={() => mover(e, -1)} disabled={i === 0} style={flechita}><ChevronUp size={10} /></button>
                <button onClick={() => mover(e, 1)} disabled={i === etapas.length - 1} style={flechita}><ChevronDown size={10} /></button>
              </div>
              <span style={{ fontSize: 12, color: colors.ink, display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                <span style={{ fontSize: 10, color: colors.muted, flexShrink: 0 }}>{i + 1}.</span>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: info.color || colors.border, flexShrink: 0 }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{info.nombre}{repeticion(e, i)}</span>
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
        {etapas.some(e => e.responsable_id) && (
          <div style={{ fontSize: 10, color: colors.muted, marginTop: 6 }}>
            Las etapas con responsable del equipo aparecen como tarea suya, con su fecha.
          </div>
        )}
      </div>

      {/* Quién ve este proyecto */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: colors.ink, flex: 1 }}>
          Quién ve este proyecto <span style={{ fontWeight: 400, color: colors.muted }}>además de ti</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        {conAcceso.length === 0 && <span style={{ fontSize: 11, color: colors.muted }}>Nadie: por ahora es privado.</span>}
        {conAcceso.map(a => (
          <span key={a.usuario_id} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: colors.inkSoft, background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 20, padding: "3px 4px 3px 9px" }}>
            <Eye size={11} color={colors.muted} /> {a.nombre}
            {a.origen === "responsable" && <span style={{ color: colors.muted }}>· tiene una etapa</span>}
            {puedeCompartir && (
              <button onClick={() => quitarAcceso(a.usuario_id)} title="Quitarle el acceso"
                style={{ background: "none", border: "none", color: colors.muted, cursor: "pointer", display: "flex", padding: 2 }}><X size={11} /></button>
            )}
          </span>
        ))}
        {puedeCompartir && (
          <select value="" onChange={e => e.target.value && darAcceso(Number(e.target.value), "manual")} style={{ ...mini, width: 150 }}>
            <option value="">+ Compartir con…</option>
            {users.filter(u => u.id !== lead.created_by && !accesos.some(a => a.usuario_id === u.id))
              .map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: colors.ink, flex: 1 }}>
          Personas de este proyecto <span style={{ fontWeight: 400, color: colors.muted }}>fuera de FOREMAN</span>
        </div>
        <button onClick={() => setInvitado(invitado ? null : { ...vacio })} style={enlace}><UserPlus size={12} /> Agregar persona</button>
      </div>

      {invitado && (
        <div className="invitado-form">
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
const enlace = { background: "none", border: "none", color: colors.brand, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: colors.font, display: "flex", alignItems: "center", gap: 3 };
