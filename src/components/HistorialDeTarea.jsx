import { useState, useEffect, useCallback } from "react";
import { History, Plus } from "lucide-react";
import { colors } from "../theme/colors";
import { inputStyle } from "./ui/Input";
import { historialDe } from "../modules/leads/historialDeTarea";
import { cargarHistorialDeTarea, anotarEnLaTarea } from "../modules/leads/proyecto";

// EL HISTORIAL DE UNA TAREA, IGUAL EN TODOS LADOS.
//
// Una tarea no es una casilla: es una gestión con pasos. «Gestionar reunión»:
// se logró fijarla, se dio, se entregó lo que salió de ella. Cada paso se
// anota EN LA MISMA TAREA —no se la marca hecha para abrir otra—, y la casilla
// queda para el final. Así hay seguimiento: qué pasó, quién y cuándo.
//
// Es la misma pieza adentro del checklist de un proyecto, en la ventana de la
// tarea y donde haga falta: antes había un «Comentarios» en un lado, una nota
// suelta en otro y la bitácora del proyecto en un tercero.
//
// Lo que alguien anotó sale en negro; lo que pasó solo —se agregó, se le puso
// fecha, se delegó, se hizo—, en gris.

const cuando = f => (f ? new Date(String(f).length === 10 ? `${f}T12:00:00` : f).toLocaleDateString("es-EC", { day: "numeric", month: "short" }) : "");

/**
 * @param tarea     la fila de `tasks`
 * @param anotado   lo anotado en ella, si quien la dibuja ya lo trajo. Sin
 *                  esto, el historial se busca solo.
 * @param pasado    lo que la bitácora del proyecto dice de ella (ídem)
 * @param onAnotar  texto → null o el error. Sin esto, anota por su cuenta.
 * @param children  lo que va debajo del cuadro de anotar (un tilde, una opción)
 * @param onCambio  avisa después de anotar
 */
export default function HistorialDeTarea({ tarea, users = [], currentUser, editable = true, ocupado = false, anotado, pasado, onAnotar, onCambio, children }) {
  const solo = anotado === undefined;
  const [traido, setTraido] = useState({ comentarios: [], movimientos: [] });
  const [paso, setPaso] = useState("");
  const [dijo, setDijo] = useState("");
  const [anotando, setAnotando] = useState(false);

  const cargar = useCallback(async () => {
    if (!solo || !tarea?.id) return;
    setTraido(await cargarHistorialDeTarea(tarea.id));
  }, [solo, tarea?.id]);
  useEffect(() => { cargar(); }, [cargar]);

  const historia = historialDe({
    tarea,
    comentarios: solo ? traido.comentarios : anotado,
    movimientos: solo ? traido.movimientos : pasado,
    nombreDe: id => users.find(u => String(u.id) === String(id))?.name || null,
  });

  async function anotar() {
    if (!paso.trim()) { setDijo("Escribí qué pasó."); return; }
    setDijo(""); setAnotando(true);
    const e = onAnotar ? await onAnotar(paso) : await anotarEnLaTarea(tarea, paso, currentUser);
    setAnotando(false);
    if (e) { setDijo(e); return; }
    setPaso("");
    await cargar();
    onCambio?.();
  }

  return (
    <div className="historial-del-punto" style={{ background: "#fff", border: `1px solid ${colors.border}`, borderRadius: colors.radiusSm, padding: "8px 10px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.4, marginBottom: 4 }}>
        <History size={11} /> HISTORIAL
      </div>
      {historia.map(h => (
        <div key={h.id} className={h.automatico ? "paso-solo" : "paso-anotado"}
          style={{ display: "flex", gap: 8, fontSize: 11.5, lineHeight: 1.45, padding: "2px 0" }}>
          <span style={{ width: 44, flexShrink: 0, color: colors.muted, whiteSpace: "nowrap" }}>{cuando(h.cuando)}</span>
          <span style={{ flex: 1, minWidth: 0, color: h.automatico ? colors.muted : colors.ink, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {h.texto}
            {h.quien ? <span style={{ color: colors.muted }}> · {h.quien}</span> : null}
          </span>
        </div>
      ))}
      {!historia.length && <div style={{ fontSize: 11.5, color: colors.muted }}>Todavía sin historia.</div>}
      {editable && (
        <>
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <input value={paso} aria-label="Qué pasó con este punto"
              onChange={e => { setPaso(e.target.value); setDijo(""); }}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); anotar(); } }}
              placeholder="¿Qué pasó? Ej: llamé, quedan en confirmar la reunión"
              style={{ ...inputStyle, padding: "5px 8px", fontSize: 12, flex: 1, minWidth: 0 }} />
            <button onClick={anotar} disabled={ocupado || anotando}
              style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 600, cursor: "pointer", fontFamily: colors.font,
                border: `1px solid ${colors.ink}`, background: colors.ink, color: "#fff", borderRadius: 14, padding: "4px 11px", whiteSpace: "nowrap" }}>
              <Plus size={11} /> Anotar
            </button>
          </div>
          {children}
          <div style={{ fontSize: 10, color: dijo ? colors.danger : colors.muted, marginTop: 3 }}>
            {dijo || "Queda con la fecha y tu nombre. Le llega por correo a quien lo tiene a cargo."}
          </div>
        </>
      )}
    </div>
  );
}
