import { useState } from "react";
import { Send, Check, X, Lock, Users, Loader2 } from "lucide-react";
import { colors } from "../../theme/colors";
import { ESTADOS, estadoDe, congelado, fecha, cambiarEstado } from "./cicloPresupuesto";

// La barra que dice en qué punto está el presupuesto y qué se puede hacer con
// él: armarlo, mandarlo, anotar qué contestaron.
//
// Al mandarlo queda congelado. No es capricho: si el que está en manos del
// cliente se sigue tocando, en dos semanas nadie sabe qué se mandó. Lo que
// cambie va en la versión siguiente, que se crea de acá mismo.

const COLOR = { muted: colors.muted, ink: colors.ink, success: colors.success, danger: colors.danger };

export default function EstadoPresupuesto({ presupuesto, currentUser, otros = [], onCambiado, onNuevaVersion, onTomar, soloLectura }) {
  const estado = estadoDe(presupuesto);
  const info = ESTADOS[estado];
  const [abierto, setAbierto] = useState(null);      // "enviar" | "decidir"
  const [enviadoA, setEnviadoA] = useState(presupuesto.cliente_nombre || "");
  const [nota, setNota] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState("");

  async function poner(nuevo, datos) {
    setTrabajando(true); setError("");
    const r = await cambiarEstado(presupuesto.id, nuevo, datos);
    setTrabajando(false);
    if (r && r !== "sin_fechas") { setError(r); return; }
    if (r === "sin_fechas") setError("Se guardó el estado, pero falta correr la migración 034 para guardar las fechas.");
    setAbierto(null);
    onCambiado({ estado: nuevo, ...(nuevo === "enviado" ? { enviado_at: new Date().toISOString(), enviado_a: datos?.enviado_a || null } : {}),
      ...(nuevo === "aprobado" || nuevo === "no_aprobado" ? { decidido_at: new Date().toISOString(), decision_nota: datos?.nota || null } : {}),
      ...(nuevo === "borrador" ? { enviado_at: null, decidido_at: null } : {}) });
  }

  const chip = { border: `1px solid ${colors.border}`, background: colors.surface, color: colors.inkSoft, borderRadius: 16, padding: "5px 12px",
    fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: colors.font, display: "inline-flex", alignItems: "center", gap: 5 };
  const fuerte = { ...chip, background: colors.ink, color: "#fff", borderColor: colors.ink };
  const campo = { background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 8, padding: "7px 9px", fontSize: 12.5,
    fontFamily: colors.font, color: colors.ink, outline: "none", flex: "1 1 180px", minWidth: 0 };

  return (
    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10, padding: "10px 14px", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ background: COLOR[info.color] === colors.muted ? colors.neutralSoft : COLOR[info.color], color: COLOR[info.color] === colors.muted ? colors.inkSoft : "#fff",
          borderRadius: 16, padding: "3px 11px", fontSize: 11.5, fontWeight: 700 }}>{info.label}</span>

        <span style={{ fontSize: 12, color: colors.inkSoft, flex: 1, minWidth: 180 }}>
          {estado === "enviado" && presupuesto.enviado_at ? `Enviado el ${fecha(presupuesto.enviado_at)}${presupuesto.enviado_a ? ` a ${presupuesto.enviado_a}` : ""}.` : info.ayuda}
          {(estado === "aprobado" || estado === "no_aprobado") && presupuesto.decidido_at && ` Respondido el ${fecha(presupuesto.decidido_at)}.`}
          {presupuesto.decision_nota && <span style={{ color: colors.muted }}> {presupuesto.decision_nota}</span>}
        </span>

        {!soloLectura && estado === "borrador" && (
          <button onClick={() => setAbierto(abierto === "enviar" ? null : "enviar")} style={fuerte}><Send size={12} /> Marcar como enviado</button>
        )}
        {!soloLectura && estado === "enviado" && (
          <>
            <button onClick={() => { setAbierto("aprobado"); setNota(""); }} style={fuerte}><Check size={12} /> Lo aprobaron</button>
            <button onClick={() => { setAbierto("no_aprobado"); setNota(""); }} style={chip}><X size={12} /> No lo aprobaron</button>
          </>
        )}
        {!soloLectura && congelado(presupuesto) && !presupuesto.archivado_at && (
          <button onClick={onNuevaVersion} style={chip} title="La versión siguiente parte de este y se puede trabajar">Nueva versión</button>
        )}
      </div>

      {/* A quién se mandó. La fecha es la de hoy: mandar es algo que pasa hoy. */}
      {abierto === "enviar" && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10, background: colors.bg, borderRadius: 8, padding: 10 }}>
          <span style={{ fontSize: 12, color: colors.inkSoft }}>¿A quién se lo mandaste?</span>
          <input value={enviadoA} onChange={e => setEnviadoA(e.target.value)} placeholder="Nombre o correo" style={campo} />
          <button disabled={trabajando} onClick={() => poner("enviado", { enviado_a: enviadoA.trim(), enviado_por: currentUser?.name || currentUser?.nombre })} style={fuerte}>
            {trabajando ? <Loader2 size={12} /> : <Send size={12} />} Marcar como enviado
          </button>
          <button onClick={() => setAbierto(null)} style={chip}>Cancelar</button>
          <div style={{ fontSize: 11, color: colors.muted, flexBasis: "100%" }}>Desde ahora queda como salió. Para cambiar algo, se abre la versión siguiente.</div>
        </div>
      )}

      {(abierto === "aprobado" || abierto === "no_aprobado") && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10, background: colors.bg, borderRadius: 8, padding: 10 }}>
          <span style={{ fontSize: 12, color: colors.inkSoft }}>{abierto === "aprobado" ? "¿Algo que anotar de la aprobación?" : "¿Por qué no lo tomaron?"}</span>
          <input value={nota} onChange={e => setNota(e.target.value)} placeholder="Opcional" style={campo} />
          <button disabled={trabajando} onClick={() => poner(abierto, { nota: nota.trim() })} style={fuerte}>
            {trabajando ? <Loader2 size={12} /> : <Check size={12} />} Guardar
          </button>
          <button onClick={() => setAbierto(null)} style={chip}>Cancelar</button>
        </div>
      )}

      {/* Congelado: por qué, y cómo seguir trabajando. */}
      {congelado(presupuesto) && !presupuesto.archivado_at && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 12, color: colors.inkSoft, background: colors.neutralSoft, borderRadius: 8, padding: "7px 10px" }}>
          <Lock size={13} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 160 }}>
            Este presupuesto ya salió, así que no se toca: es el que está en manos del cliente. Lo que haya que cambiar va en la versión siguiente.
          </span>
          {!soloLectura && estado === "enviado" && (
            <button onClick={() => window.confirm("¿Volver a borrador? Se borra la marca de enviado: solo tiene sentido si te equivocaste al marcarlo.") && poner("borrador")}
              style={{ ...chip, padding: "3px 10px", fontSize: 11 }}>Me equivoqué, volver a borrador</button>
          )}
        </div>
      )}

      {/* Quién más lo está mirando ahora mismo. */}
      {otros.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 12, color: colors.warning, background: colors.warningSoft, border: `1px solid ${colors.warningBorder}`, borderRadius: 8, padding: "7px 10px" }}>
          <Users size={13} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 160 }}>
            <strong>{otros.map(o => o.nombre).join(", ")}</strong> {otros.length === 1 ? "lo está trabajando" : "lo están trabajando"} ahora mismo. Para no pisarse, está de solo lectura.
          </span>
          {onTomar && <button onClick={onTomar} style={{ ...chip, padding: "3px 10px", fontSize: 11 }}>Trabajarlo igual</button>}
        </div>
      )}

      {error && <div style={{ fontSize: 11.5, color: colors.danger, marginTop: 8 }}>{error}</div>}
    </div>
  );
}
