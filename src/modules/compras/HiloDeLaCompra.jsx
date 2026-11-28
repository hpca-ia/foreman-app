import { useEffect, useState, useCallback } from "react";
import { AlertTriangle, MessageSquare, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import { ESTADOS, historialDe, comentarSolicitud } from "./compras";
import { numeroDeCompra } from "./devueltas.js";
import { pendientesDe } from "./datosDePendientes";
import { TIPOS_PENDIENTE, abiertos } from "./pendientes.js";

// LA HISTORIA DE LA COMPRA, EN SU FACTURA DEL CONTROL (Hernán, 28/11/2026:
// «que lo vean en el thread de la factura»). Quien abre la factura en el
// control ve de qué compra salió, si le falta algo y lo que se dijo; y puede
// comentar ahí mismo: queda en el historial de la compra y les llega a los de
// la compra. El pendiente se resuelve en la compra.

const cuando = x => new Date(x).toLocaleString("es-EC", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function HiloDeLaCompra({ facturaId, currentUser }) {
  const [compras, setCompras] = useState([]);
  const [pendientes, setPendientes] = useState({});
  const [historial, setHistorial] = useState({});
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    if (!facturaId) return;
    const { data } = await supabase.from("compras_solicitudes")
      .select("id,descripcion,estado,lead_id,solicitante_id,solicitante_nombre,aprobador_id,comprado_por")
      .eq("factura_id", facturaId);
    const cs = data || [];
    setCompras(cs);
    const ps = {}, hs = {};
    await Promise.all(cs.map(async c => { [ps[c.id], hs[c.id]] = await Promise.all([pendientesDe(c.id), historialDe(c.id)]); }));
    setPendientes(ps); setHistorial(hs);
  }, [facturaId]);
  useEffect(() => { cargar().catch(() => {}); }, [cargar]);

  if (!compras.length) return null;

  async function comentar(c) {
    setOcupado(true); setError("");
    const r = await comentarSolicitud(c, { quien: currentUser, texto });
    setOcupado(false);
    if (r.error) { setError(r.error); return; }
    setTexto("");
    cargar();
  }

  return (
    <div className="hilo-de-la-compra" style={{ border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 12, marginBottom: 14 }}>
      {compras.map(c => {
        const abiertas = abiertos(pendientes[c.id]);
        const hs = historial[c.id] || [];
        return (
          <div key={c.id}>
            <div style={{ fontSize: 12.5, color: colors.ink }}>
              Viene de la compra <strong>{numeroDeCompra(c)}</strong> · {c.descripcion}
              <span style={{ color: ESTADOS[c.estado]?.color || colors.muted, fontWeight: 700 }}> · {ESTADOS[c.estado]?.label || c.estado}</span>
            </div>
            {abiertas.map(p => (
              <div key={p.id} className="pendiente-en-la-factura" style={{ display: "flex", gap: 6, alignItems: "flex-start", marginTop: 6, background: colors.warningSoft,
                border: `1px solid ${colors.warningBorder}`, borderRadius: 7, padding: "6px 9px", fontSize: 12, color: colors.ink }}>
                <AlertTriangle size={13} color={colors.warning} style={{ marginTop: 1, flexShrink: 0 }} />
                <div>
                  <strong>Pendiente · {TIPOS_PENDIENTE[p.tipo]?.label}</strong>{p.para_nombre ? ` · lo resuelve ${p.para_nombre}` : ""}
                  <div>{p.texto}</div>
                  <div style={{ fontSize: 10.5, color: colors.muted }}>
                    Se cierra en la compra, con «Resuelto»{p.tipo === "factura" ? ", una vez que la factura esté leída por NOVA: subiéndola allá, o aquí con «Leer con NOVA» y guardando" : ""}.
                  </div>
                </div>
              </div>
            ))}
            <button onClick={() => setAbierto(!abierto)}
              style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", padding: "6px 0 0", cursor: "pointer",
                fontSize: 11.5, fontWeight: 600, color: colors.brand, fontFamily: colors.font }}>
              {abierto ? <ChevronDown size={12} /> : <ChevronRight size={12} />} Historia de la compra ({hs.length})
            </button>
            {abierto && (
              <div style={{ marginTop: 4 }}>
                {hs.map(h => (
                  <div key={h.id} style={{ fontSize: 11.5, color: colors.inkSoft, padding: "3px 0" }}>
                    <strong style={{ color: ESTADOS[h.estado_nuevo]?.color || colors.ink }}>{ESTADOS[h.estado_nuevo]?.label || h.estado_nuevo}</strong>
                    {" · "}{h.usuario_nombre || "—"}<span style={{ color: colors.muted }}> · {cuando(h.created_at)}</span>
                    {h.comentario && <div style={{ color: colors.ink }}>{h.comentario}</div>}
                  </div>
                ))}
                <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={2} placeholder="Comentar sobre esta compra"
                  style={{ ...inputStyle, fontSize: 12, padding: "6px 8px", resize: "vertical", marginTop: 6 }} />
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
                  <Button size="sm" variant="outline" disabled={ocupado || !texto.trim()} onClick={() => comentar(c)}>
                    <MessageSquare size={12} /> Comentar y avisar
                  </Button>
                  <span style={{ fontSize: 10.5, color: colors.muted }}>Queda en la historia de la compra y les llega a los de esa compra.</span>
                </div>
                {error && <div style={{ fontSize: 11.5, color: colors.danger, marginTop: 4 }}>{error}</div>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
