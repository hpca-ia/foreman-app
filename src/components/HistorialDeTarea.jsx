import { useState, useEffect, useCallback } from "react";
import { History, Plus, Eye, EyeOff } from "lucide-react";
import { colors } from "../theme/colors";
import { inputStyle } from "./ui/Input";
import { historialDe } from "../modules/leads/historialDeTarea";
import { cargarHistorialDeTarea, anotarEnLaTarea, mostrarNotaAlCliente } from "../modules/leads/proyecto";

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
//
// LO ANOTADO ES LO QUE LEE EL CLIENTE. Hernán, 17/11/2026, después de anotar
// en dos puntos de RES BG y no verlo en el enlace: «cliente debe ver las
// actualizaciones de cada uno». Había un tilde debajo, apagado, y un cuadro
// aparte de «actualización para el cliente» que nadie llenó nunca. Ahora, en
// un punto que el cliente ve, la anotación nace PARA ÉL y lo dice el botón
// —«Anotar y mostrárselo»—; al lado se elige «Solo nosotros» para lo interno.
// Y cada anotación ya escrita dice si la lee, y se cambia de un toque.

const cuando = f => (f ? new Date(String(f).length === 10 ? `${f}T12:00:00` : f).toLocaleDateString("es-EC", { day: "numeric", month: "short" }) : "");

/**
 * @param tarea     la fila de `tasks`
 * @param anotado   lo anotado en ella, si quien la dibuja ya lo trajo. Sin
 *                  esto, el historial se busca solo.
 * @param pasado    lo que la bitácora del proyecto dice de ella (ídem)
 * @param onAnotar  texto → null o el error. Sin esto, anota por su cuenta.
 * @param children  lo que va debajo del cuadro de anotar (un tilde, una opción)
 * @param onCambio  avisa después de anotar
 * @param titulo    cómo se llama el cuadro donde va: en el checklist es la
 *                  pregunta «¿qué pasó?», al lado de «¿para cuándo?» y «¿ya está?»
 * @param paraElCliente  si el cliente ve este punto y sus anotaciones se le
 *                  pueden mostrar. Sin decirlo, lo dice la tarea (`visible_cliente`).
 * @param onMostrarNota  ({ id, texto }, ver) → null o el error. Sin esto, lo
 *                  guarda por su cuenta.
 */
export default function HistorialDeTarea({ tarea, users = [], currentUser, editable = true, ocupado = false, anotado, pasado, onAnotar, onCambio, children, titulo = "HISTORIAL", paraElCliente, onMostrarNota }) {
  const solo = anotado === undefined;
  const [traido, setTraido] = useState({ comentarios: [], movimientos: [], sinNotasAlCliente: false });
  const [paso, setPaso] = useState("");
  const [dijo, setDijo] = useState("");
  const [anotando, setAnotando] = useState(false);
  // Si el cliente ve el punto, lo que se anota es para él salvo que se diga
  // «solo nosotros». Se queda como se eligió mientras el punto está abierto.
  const loLee = (paraElCliente !== undefined ? !!paraElCliente : tarea?.visible_cliente === true) && !traido.sinNotasAlCliente;
  const [soloNosotros, setSoloNosotros] = useState(false);
  const alCliente = loLee && !soloNosotros;

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
    const e = onAnotar ? await onAnotar(paso, { alCliente }) : await anotarEnLaTarea(tarea, paso, currentUser, { alCliente });
    setAnotando(false);
    // Anotado pero sin llegarle al cliente: se dice, y el casillero se vacía.
    if (e && !/^Quedó anotado/.test(e)) { setDijo(e); return; }
    setDijo(e || "");
    setPaso("");
    await cargar();
    onCambio?.();
  }

  // Mostrarle una anotación que ya estaba, o dejar de mostrársela.
  async function mostrar(h, ver) {
    setDijo(""); setAnotando(true);
    const nota = { id: h.nota, texto: h.texto };
    const e = onMostrarNota ? await onMostrarNota(nota, ver) : await mostrarNotaAlCliente(nota, ver, { punto: tarea, quien: currentUser });
    setAnotando(false);
    if (e) { setDijo(e); return; }
    await cargar();
    onCambio?.();
  }

  return (
    <div className="historial-del-punto" style={{ background: "#fff", border: `1px solid ${colors.border}`, borderRadius: colors.radiusSm, padding: "8px 10px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.4, marginBottom: 4 }}>
        <History size={11} /> {titulo}
      </div>
      {historia.map(h => (
        <div key={h.id} className={h.automatico ? "paso-solo" : "paso-anotado"}
          style={{ display: "flex", gap: 8, fontSize: 11.5, lineHeight: 1.45, padding: "2px 0" }}>
          <span style={{ width: 44, flexShrink: 0, color: colors.muted, whiteSpace: "nowrap" }}>{cuando(h.cuando)}</span>
          <span style={{ flex: 1, minWidth: 0, color: h.automatico ? colors.muted : colors.ink, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {h.texto}
            {h.quien ? <span style={{ color: colors.muted }}> · {h.quien}</span> : null}
          </span>
          {/* Cada anotación dice si la lee el cliente, y se cambia de un toque. */}
          {loLee && h.nota != null && (
            editable ? (
              <button className="nota-al-cliente" data-la-lee={h.alCliente ? "si" : "no"} aria-pressed={h.alCliente} disabled={ocupado || anotando}
                onClick={() => mostrar(h, !h.alCliente)}
                title={h.alCliente ? "El cliente lee esta anotación en su enlace. Tocá para que deje de leerla." : "Esta anotación es interna. Tocá para que el cliente la lea en su enlace."}
                style={{ display: "inline-flex", alignItems: "center", gap: 3, flexShrink: 0, alignSelf: "flex-start", cursor: "pointer", fontFamily: colors.font,
                  fontSize: 10, fontWeight: 600, lineHeight: 1.3, padding: "1px 7px", borderRadius: 10, whiteSpace: "nowrap",
                  border: `1px solid ${h.alCliente ? colors.brand : colors.border}`, background: h.alCliente ? colors.brandSoft : "#fff",
                  color: h.alCliente ? colors.brand : colors.muted }}>
                {h.alCliente ? <Eye size={10} /> : <EyeOff size={10} />} {h.alCliente ? "la lee el cliente" : "solo nosotros"}
              </button>
            ) : h.alCliente ? (
              <span className="nota-al-cliente" data-la-lee="si" style={{ flexShrink: 0, fontSize: 10, fontWeight: 600, color: colors.brand, whiteSpace: "nowrap" }}>
                <Eye size={10} style={{ verticalAlign: "-1px" }} /> la lee el cliente
              </span>
            ) : null
          )}
        </div>
      ))}
      {!historia.length && <div style={{ fontSize: 11.5, color: colors.muted }}>Todavía sin historia.</div>}
      {editable && (
        <>
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <input value={paso} aria-label="Qué pasó con este punto"
              onChange={e => { setPaso(e.target.value); setDijo(""); }}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); anotar(); } }}
              placeholder={alCliente ? "¿Qué hay de nuevo? Ej: llegó la cotización, la estamos revisando" : "¿Qué pasó? Ej: llamé, quedan en confirmar la reunión"}
              style={{ ...inputStyle, padding: "5px 8px", fontSize: 12, flex: 1, minWidth: 0, borderColor: alCliente ? colors.brand : undefined }} />
            <button className="anotar-paso" onClick={anotar} disabled={ocupado || anotando}
              style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 600, cursor: "pointer", fontFamily: colors.font,
                border: `1px solid ${alCliente ? colors.brand : colors.ink}`, background: alCliente ? colors.brand : colors.ink, color: "#fff",
                borderRadius: 14, padding: "4px 11px", whiteSpace: "nowrap" }}>
              {alCliente ? <Eye size={11} /> : <Plus size={11} />} {alCliente ? "Anotar y mostrárselo" : "Anotar"}
            </button>
          </div>
          {/* PARA QUIÉN ES LO QUE SE ANOTA. Solo si el cliente ve el punto. */}
          {loLee && (
            <div className="para-quien-es" role="group" aria-label="Quién lee lo que se anota"
              style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center", marginTop: 5 }}>
              {[[false, "La lee el cliente", Eye], [true, "Solo nosotros", EyeOff]].map(([interno, dice, Icono]) => {
                const activo = soloNosotros === interno;
                const tono = interno ? colors.inkSoft : colors.brand;
                return (
                  <button key={dice} aria-pressed={activo} onClick={() => setSoloNosotros(interno)}
                    style={{ display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer", fontFamily: colors.font, fontSize: 10.5, fontWeight: 600,
                      padding: "2px 9px", borderRadius: 12, border: `1px solid ${activo ? tono : colors.border}`,
                      background: activo ? (interno ? colors.neutralSoft : colors.brandSoft) : "#fff", color: activo ? tono : colors.muted }}>
                    <Icono size={11} /> {dice}
                  </button>
                );
              })}
              <span style={{ fontSize: 10, color: colors.muted, lineHeight: 1.4, flex: "1 1 180px", minWidth: 0 }}>
                {alCliente
                  ? "Lo que anotes sale en su enlace, debajo de este punto, con la fecha. No ve tu nombre."
                  : "Lo que anotes queda entre nosotros: el cliente no lo lee."}
              </span>
            </div>
          )}
          {children}
          <div role={dijo ? "alert" : undefined} style={{ fontSize: 10, color: dijo ? colors.danger : colors.muted, marginTop: 3 }}>
            {dijo || "Queda con la fecha y tu nombre. Le llega por correo a quien lo tiene a cargo."}
          </div>
        </>
      )}
    </div>
  );
}
