import { useEffect, useState } from "react";
import { Check, X, Send, ShoppingCart, PackageCheck, Clock } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import InlineFiles from "../../components/InlineFiles";
import { ESTADOS, crearSolicitud, guardarSolicitud, moverA, historialDe } from "./compras";

// Una solicitud, de punta a punta, en una sola pantalla.
//
// Arriba lo que se pidió; abajo, el único botón que corresponde a quien está
// mirando: pedir el visto, aprobar o devolver, comprar, recibir. Nadie tiene
// que saber en qué paso va: la pantalla le ofrece lo suyo y nada más.
//
// Devolver pide motivo —es la parte que hace que el flujo sirva—, y cada paso
// queda escrito en el historial de abajo, con nombre y hora.

const CAT = { respaldo: "Respaldo", cotizacion: "Cotización", dibujo: "Dibujo o plano", factura: "Factura" };

export default function ModalSolicitud({ solicitud, proyectos = [], users = [], currentUser, puede, onCerrar, onCambio }) {
  const editando = !!solicitud;
  const [form, setForm] = useState(solicitud ? { ...solicitud } : {
    lead_id: proyectos[0]?.id || "", descripcion: "", justificacion: "", necesita_para: "", urgente: false,
  });
  const [historial, setHistorial] = useState([]);
  const [comentario, setComentario] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [compra, setCompra] = useState({ proveedor: solicitud?.proveedor || "", monto: solicitud?.monto || "" });

  const gestionaCompras = puede("compras.gestionar");
  const apruebo = puede("tareas.asignar") || currentUser?.role === "owner";
  const esMia = !editando || solicitud.solicitante_id === currentUser.id;
  const estado = solicitud?.estado || "borrador";
  const e = ESTADOS[estado] || ESTADOS.borrador;

  useEffect(() => { if (solicitud?.id) historialDe(solicitud.id).then(setHistorial); }, [solicitud?.id]);

  const inp = (k, v) => setForm(p => ({ ...p, [k]: v }));

  async function hacer(fn) {
    setOcupado(true); setError("");
    try {
      const r = await fn();
      if (r?.error) { setError(r.error); return; }
      onCambio?.();
      if (r?.cerrar !== false) onCerrar();
    } catch (ex) { setError(ex.message); } finally { setOcupado(false); }
  }

  // Quién es el gerente del proyecto: a quien le toca dar el visto. Sin uno
  // marcado, va al Director, que es quien siempre puede.
  const gerenteDelProyecto = () => {
    const owner = users.find(u => u.role === "owner");
    return users.find(u => u.role === "gerente")?.id || owner?.id || null;
  };
  const personaDeCompras = () => users.find(u => u.role === "assistant")?.id || gerenteDelProyecto();

  const guardarYMandar = () => hacer(async () => {
    if (!form.descripcion?.trim()) return { error: "Escribe qué hace falta." };
    let s = solicitud;
    if (!editando) {
      const r = await crearSolicitud(form, currentUser);
      if (r.error) return r;
      s = r.solicitud;
    } else {
      const err = await guardarSolicitud(s.id, form);
      if (err) return { error: err };
      s = { ...s, ...form };
    }
    const quien = gerenteDelProyecto();
    if (!quien) return { error: "No hay a quién pedirle el visto: falta un gerente o el Director en el equipo." };
    return moverA(s, "pendiente_aprobacion", {
      quien: currentUser, comentario: comentario || null, paraQuien: quien,
      titulo: `Aprobar compra: ${s.descripcion}`,
    });
  });

  const soloGuardar = () => hacer(async () => {
    if (!form.descripcion?.trim()) return { error: "Escribe qué hace falta." };
    if (!editando) {
      const r = await crearSolicitud(form, currentUser);
      return r.error ? r : {};
    }
    const err = await guardarSolicitud(solicitud.id, form);
    return err ? { error: err } : {};
  });

  const aprobar = () => hacer(() => moverA(solicitud, "aprobada", {
    quien: currentUser, comentario: comentario || null, paraQuien: personaDeCompras(),
    titulo: `Comprar: ${solicitud.descripcion}`,
  }));

  const devolver = () => hacer(async () => {
    if (!comentario.trim()) return { error: "Para devolverla hay que decir qué falta." };
    return moverA(solicitud, "requiere_info", {
      quien: currentUser, comentario: comentario.trim(), paraQuien: solicitud.solicitante_id,
      titulo: `Completar la solicitud: ${solicitud.descripcion}`,
    });
  });

  const marcarComprada = () => hacer(async () => {
    if (!compra.proveedor.trim()) return { error: "¿A quién se le compró?" };
    return moverA(solicitud, "comprada", {
      quien: currentUser, comentario: comentario || null, paraQuien: solicitud.solicitante_id,
      titulo: `Recibir: ${solicitud.descripcion}`,
      extra: { proveedor: compra.proveedor.trim(), monto: Number(compra.monto) || null },
    });
  });

  const marcarRecibida = () => hacer(() => moverA(solicitud, "recibida", {
    quien: currentUser, comentario: comentario || null, paraQuien: null, titulo: null,
  }));

  const lbl = { fontSize: 10.5, color: colors.muted, fontWeight: 600, display: "block", marginBottom: 3 };
  const mini = { ...inputStyle, padding: "8px 10px", fontSize: 12.5 };

  return (
    <Modal onClose={onCerrar} maxWidth={560}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: colors.ink, flex: 1, minWidth: 140 }}>
          {editando ? "Solicitud de compra" : "Pedir algo para la obra"}
        </div>
        {editando && (
          <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, color: "#fff", background: e.color }}>
            {e.label}
          </span>
        )}
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        <div>
          <label style={lbl}>PROYECTO</label>
          <select value={form.lead_id || ""} onChange={ev => inp("lead_id", Number(ev.target.value))} disabled={editando} style={mini}>
            <option value="">Elegí el proyecto…</option>
            {proyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>

        <div>
          <label style={lbl}>QUÉ HACE FALTA</label>
          <input value={form.descripcion || ""} onChange={ev => inp("descripcion", ev.target.value)}
            placeholder="Ej: 200 sacos de cemento, o contratar el vidriado" style={mini}
            disabled={editando && !esMia} />
        </div>

        <div>
          <label style={lbl}>PARA QUÉ</label>
          <textarea value={form.justificacion || ""} onChange={ev => inp("justificacion", ev.target.value)} rows={2}
            placeholder="En qué se va a usar y por qué ahora" style={{ ...mini, resize: "vertical" }}
            disabled={editando && !esMia} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "end" }}>
          <div>
            <label style={lbl}>SE NECESITA PARA</label>
            <input type="date" value={form.necesita_para || ""} onChange={ev => inp("necesita_para", ev.target.value)}
              style={mini} disabled={editando && !esMia} />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: colors.inkSoft, cursor: "pointer", paddingBottom: 9 }}>
            <input type="checkbox" checked={!!form.urgente} onChange={ev => inp("urgente", ev.target.checked)}
              disabled={editando && !esMia} /> Urgente
          </label>
        </div>

        {/* Los respaldos: la cotización, el plano, la foto de lo que se rompió.
            Sin esto, aprobar es adivinar. */}
        {editando && (
          <div>
            <label style={lbl}>RESPALDOS</label>
            <InlineFiles taskId={`compra-${solicitud.id}`} />
          </div>
        )}

        {/* Lo que compras necesita completar cuando concreta. */}
        {editando && estado === "aprobada" && gestionaCompras && (
          <div style={{ background: colors.bg, borderRadius: colors.radiusMd, padding: 10, display: "grid", gap: 8 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: colors.ink }}>La compra</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 8 }}>
              <input value={compra.proveedor} onChange={ev => setCompra(c => ({ ...c, proveedor: ev.target.value }))}
                placeholder="¿A quién se le compró?" style={mini} />
              <input type="number" value={compra.monto} onChange={ev => setCompra(c => ({ ...c, monto: ev.target.value }))}
                placeholder="Monto" style={mini} />
            </div>
            <div style={{ fontSize: 10.5, color: colors.muted }}>
              La factura se carga en Control de Obra y se asigna a su rubro: ahí es donde el gasto cuenta.
            </div>
          </div>
        )}

        {/* Un comentario acompaña cada paso; al devolver, es obligatorio. */}
        {editando && estado !== "recibida" && (
          <div>
            <label style={lbl}>COMENTARIO</label>
            <textarea value={comentario} onChange={ev => setComentario(ev.target.value)} rows={2}
              placeholder={estado === "pendiente_aprobacion" ? "Si la devolvés, decí qué falta" : "Opcional"}
              style={{ ...mini, resize: "vertical" }} />
          </div>
        )}
      </div>

      {error && <div style={{ color: colors.danger, fontSize: 12, marginTop: 10 }}>{error}</div>}

      {/* Solo el botón que le toca a quien está mirando. */}
      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        {(!editando || estado === "borrador" || estado === "requiere_info") && esMia && (
          <>
            <Button variant="primary" onClick={guardarYMandar} disabled={ocupado}>
              <Send size={13} /> {estado === "requiere_info" ? "Reenviar" : "Pedir el visto"}
            </Button>
            <Button variant="outline" onClick={soloGuardar} disabled={ocupado}>Guardar</Button>
          </>
        )}

        {editando && estado === "pendiente_aprobacion" && apruebo && (
          <>
            <Button variant="primary" onClick={aprobar} disabled={ocupado}><Check size={13} /> Aprobar</Button>
            <Button variant="outline" onClick={devolver} disabled={ocupado}><X size={13} /> Devolver</Button>
          </>
        )}

        {editando && estado === "aprobada" && gestionaCompras && (
          <Button variant="primary" onClick={marcarComprada} disabled={ocupado}><ShoppingCart size={13} /> Ya la compré</Button>
        )}

        {editando && estado === "comprada" && esMia && (
          <Button variant="primary" onClick={marcarRecibida} disabled={ocupado}><PackageCheck size={13} /> La recibí</Button>
        )}

        <Button variant="outline" onClick={onCerrar}>Cerrar</Button>
      </div>

      {/* Qué pasó con esto, en orden: quién pidió, quién aprobó, quién compró. */}
      {historial.length > 0 && (
        <div style={{ marginTop: 16, borderTop: `1px solid ${colors.neutralSoft}`, paddingTop: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.5, marginBottom: 6 }}>HISTORIAL</div>
          {historial.map(h => (
            <div key={h.id} style={{ display: "flex", gap: 8, padding: "4px 0", fontSize: 12, color: colors.inkSoft }}>
              <Clock size={11} style={{ marginTop: 3, flexShrink: 0, color: colors.muted }} />
              <div>
                <strong style={{ color: ESTADOS[h.estado_nuevo]?.color || colors.ink }}>{ESTADOS[h.estado_nuevo]?.label || h.estado_nuevo}</strong>
                {" · "}{h.usuario_nombre || "—"}
                <span style={{ color: colors.muted }}> · {new Date(h.created_at).toLocaleString("es-EC", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                {h.comentario && <div style={{ color: colors.ink }}>{h.comentario}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
