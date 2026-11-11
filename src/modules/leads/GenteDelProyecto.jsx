import { useState, useEffect, useCallback } from "react";
import { UserPlus, Eye, X } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import { inputStyle } from "../../components/ui/Input";
import Button from "../../components/ui/Button";

// LA GENTE DE UN PROYECTO.
//
// Dos listas distintas: quién del equipo lo ve —además de quien lo abrió—, y
// las personas de afuera que tienen que ver con él: el cliente, el ingeniero,
// el proveedor. Los de afuera no entran a FOREMAN, pero una tarea puede ser
// suya y a una reunión se los puede avisar.
//
// Antes esto vivía pegado a las etapas por proyecto, que ya no existen: en el
// pipeline un lead está en una etapa, y lo dice él.

const vacio = { nombre: "", rol: "cliente", email: "", telefono: "" };

export default function GenteDelProyecto({ lead, users = [], currentUser, puedeCompartir }) {
  const [invitados, setInvitados] = useState([]);
  const [accesos, setAccesos] = useState([]);
  const [invitado, setInvitado] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    const [{ data: inv }, { data: acc }] = await Promise.all([
      supabase.from("pipeline_invitados").select("*").eq("lead_id", lead.id).order("nombre"),
      supabase.from("lead_accesos").select("*").eq("lead_id", lead.id),
    ]);
    setInvitados(inv || []); setAccesos(acc || []);
  }, [lead.id]);
  useEffect(() => { cargar(); }, [cargar]);

  async function darAcceso(usuarioId) {
    if (!usuarioId || usuarioId === lead.created_by) return;
    await supabase.from("lead_accesos").upsert(
      { lead_id: lead.id, usuario_id: usuarioId, origen: "manual", creado_por: currentUser?.id },
      { onConflict: "lead_id,usuario_id", ignoreDuplicates: true });
    await cargar();
  }

  async function quitarAcceso(usuarioId) {
    await supabase.from("lead_accesos").delete().eq("lead_id", lead.id).eq("usuario_id", usuarioId);
    await cargar();
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

  const conAcceso = accesos.map(a => ({ ...a, nombre: users.find(u => u.id === a.usuario_id)?.name || `Usuario ${a.usuario_id}` }));
  const mini = { ...inputStyle, padding: "5px 7px", fontSize: 11 };
  const pastilla = { display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: colors.inkSoft, background: colors.bg,
    border: `1px solid ${colors.border}`, borderRadius: 20, padding: "3px 9px" };

  return (
    <>
      <div style={{ fontSize: 12, fontWeight: 600, color: colors.ink, marginBottom: 6 }}>
        Quién ve este proyecto <span style={{ fontWeight: 400, color: colors.muted }}>además de ti</span>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        {conAcceso.length === 0 && <span style={{ fontSize: 11, color: colors.muted }}>Nadie: por ahora es privado.</span>}
        {conAcceso.map(a => (
          <span key={a.usuario_id} style={pastilla}>
            <Eye size={11} color={colors.muted} /> {a.nombre}
            {puedeCompartir && (
              <button onClick={() => quitarAcceso(a.usuario_id)} title="Quitarle el acceso"
                style={{ background: "none", border: "none", color: colors.muted, cursor: "pointer", display: "flex", padding: 2 }}><X size={11} /></button>
            )}
          </span>
        ))}
        {puedeCompartir && (
          <select value="" onChange={e => e.target.value && darAcceso(Number(e.target.value))} style={{ ...mini, width: 150 }}>
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
        <button onClick={() => setInvitado(invitado ? null : { ...vacio })}
          style={{ background: "none", border: "none", color: colors.brand, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: colors.font, display: "flex", alignItems: "center", gap: 3 }}>
          <UserPlus size={12} /> Agregar persona
        </button>
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
            <span key={x.id} style={{ ...pastilla, gap: 4 }}>{x.nombre} <span style={{ color: colors.muted }}>{x.rol}</span></span>
          ))}
        </div>
      )}
    </>
  );
}
