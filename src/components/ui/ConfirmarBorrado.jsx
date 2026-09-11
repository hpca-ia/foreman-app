import { useState, useEffect, useRef } from "react";
import { AlertTriangle, Lock } from "lucide-react";
import { colors } from "../../theme/colors";
import Modal from "./Modal";
import Button from "./Button";
import { inputStyle } from "./Input";

/**
 * Borrado definitivo con dos seguros: primero se revisa si algo depende del
 * registro —y si depende, no se borra y se dice por qué—; y si está libre, hay
 * que escribir su nombre. Escribirlo obliga a leer cuál es, que es justo donde
 * se cometen estos errores.
 *
 * @param revisar  async () => ({ bloqueo, detalle })  bloqueo = motivo, o null si se puede
 * @param borrar   async () => error | null
 */
// La base devuelve el error de la llave foránea en crudo, con el nombre del
// constraint. Eso no le dice nada a quien lo lee: lo que necesita saber es que
// algo más lo está reteniendo y que no es culpa suya.
function enCristiano(e) {
  const msg = e?.message || String(e);
  if (/foreign key|violates/i.test(msg)) {
    const tabla = msg.match(/on table "([^"]+)"/)?.[1];
    return `No se pudo borrar: otra parte del sistema todavía lo está usando${tabla ? ` (${tabla})` : ""}. Avísame y lo suelto.`;
  }
  return "No se pudo borrar: " + msg;
}

export default function ConfirmarBorrado({ titulo, nombre, revisar, borrar, onCancelar, onBorrado }) {
  const [estado, setEstado] = useState(null);      // { bloqueo, detalle }
  const [texto, setTexto] = useState("");
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState("");

  // `revisar` llega como función inline, así que cambia de identidad en cada
  // render: sin este cerrojo la revisión se relanzaría en bucle. No se cancela
  // en la limpieza a propósito — en StrictMode el efecto se monta dos veces y
  // cancelar la primera dejaba la pantalla en "Revisando" para siempre.
  const revisado = useRef(false);
  useEffect(() => {
    if (revisado.current) return;
    revisado.current = true;
    revisar()
      .then(r => setEstado(r || { bloqueo: null, detalle: [] }))
      .catch(e => setEstado({ bloqueo: "No se pudo revisar: " + e.message, detalle: [] }));
  }, [revisar]);

  async function confirmar() {
    setBorrando(true); setError("");
    const e = await borrar();
    if (e) { setError(enCristiano(e)); setBorrando(false); return; }
    onBorrado();
  }

  const bloqueado = !!estado?.bloqueo;
  const listo = texto.trim().toLowerCase() === (nombre || "").trim().toLowerCase();

  return (
    <Modal onClose={onCancelar} maxWidth={460}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
        {bloqueado ? <Lock size={18} color={colors.inkSoft} /> : <AlertTriangle size={18} color={colors.danger} />}
        <div style={{ fontSize: 15, fontWeight: 700, color: colors.ink }}>{titulo}</div>
      </div>

      <div style={{
        background: bloqueado ? colors.bg : colors.dangerSoft,
        border: `1px solid ${bloqueado ? colors.border : colors.dangerBorder}`,
        borderRadius: colors.radiusMd, padding: 13, marginBottom: 14,
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: colors.ink, marginBottom: 8 }}>{nombre}</div>
        {estado === null ? (
          <div style={{ fontSize: 12, color: colors.muted }}>Revisando si algo depende de esto...</div>
        ) : bloqueado ? (
          <div style={{ fontSize: 12, color: colors.inkSoft, lineHeight: 1.7 }}>{estado.bloqueo}</div>
        ) : (
          <div style={{ fontSize: 12, color: colors.danger, lineHeight: 1.7 }}>
            Se borra para siempre:
            {(estado.detalle || []).map((d, i) => <span key={i}><br />· {d}</span>)}
          </div>
        )}
      </div>

      {!bloqueado && estado !== null && (
        <>
          <label style={{ fontSize: 11, color: colors.inkSoft, fontWeight: 500, display: "block", marginBottom: 4 }}>
            Escribe <strong>{nombre}</strong> para confirmar
          </label>
          <input value={texto} onChange={e => setTexto(e.target.value)} placeholder={nombre}
            style={{ ...inputStyle, marginBottom: 12 }} autoFocus />
        </>
      )}

      {error && <div style={{ color: colors.danger, fontSize: 12, marginBottom: 10 }}>{error}</div>}

      <div style={{ display: "flex", gap: 8 }}>
        <Button variant="outline" style={{ flex: 1 }} onClick={onCancelar} disabled={borrando}>
          {bloqueado ? "Entendido" : "Cancelar"}
        </Button>
        {!bloqueado && (
          <Button variant="danger" style={{ flex: 1 }} onClick={confirmar} disabled={!listo || borrando || estado === null}>
            {borrando ? "Borrando..." : "Borrar definitivamente"}
          </Button>
        )}
      </div>
    </Modal>
  );
}
