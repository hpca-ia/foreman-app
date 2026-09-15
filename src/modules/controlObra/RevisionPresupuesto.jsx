import { useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronRight, Check, X } from "lucide-react";
import { colors } from "../../theme/colors";
import { efectos } from "./leerPresupuesto";

// Lo que la revisión encontró en el Excel. Se usa al importar —antes de crear
// la obra, con Aceptar / No aceptar en cada punto— y después en la pestaña
// Presupuesto, para ver qué se decidió. Cada advertencia se abre para ver las
// filas, con el número de fila de Excel.
export default function RevisionPresupuesto({ advertencias = [], guardada = false, decisiones = {}, onDecidir }) {
  const [abiertas, setAbiertas] = useState(() => new Set());
  const [todas, setTodas] = useState(() => new Set());
  const errores = advertencias.filter(a => a.nivel === "error").length;
  const avisos = advertencias.length - errores;
  const decisionDe = (a, i) => guardada ? a.decision : decisiones[i];
  const pendientes = advertencias.filter((a, i) => a.nivel === "error" && !decisionDe(a, i)).length;

  if (!advertencias.length) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, background: colors.successSoft, borderRadius: colors.radiusMd, padding: "10px 12px", fontSize: 12, color: colors.success, fontWeight: 600 }}>
        <CheckCircle2 size={15} /> NOVA revisó el presupuesto: las sumas cuadran y la numeración es consistente.
      </div>
    );
  }

  const alternar = (setter, i) => setter(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });

  return (
    <div style={{ border: `1.5px solid ${errores ? colors.dangerBorder : colors.warningBorder}`, borderRadius: colors.radiusMd, overflow: "hidden" }}>
      <div style={{ background: errores ? colors.dangerSoft : colors.warningSoft, padding: "10px 12px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {errores ? <XCircle size={15} color={colors.danger} /> : <AlertTriangle size={15} color={colors.warning} />}
        <span style={{ fontSize: 13, fontWeight: 700, color: errores ? colors.danger : colors.warning }}>
          {guardada ? "Revisión al importar" : "NOVA revisó el presupuesto"}
        </span>
        <span style={{ fontSize: 12, color: colors.inkSoft }}>
          {[errores && `${errores} ${errores === 1 ? "error" : "errores"}`, avisos && `${avisos} ${avisos === 1 ? "aviso" : "avisos"}`].filter(Boolean).join(" · ")}
        </span>
        <span style={{ fontSize: 11, color: colors.muted, width: "100%" }}>
          {guardada
            ? "Así se decidió cada punto al importar."
            : pendientes
              ? `Acepta o no acepta cada error para poder crear la obra (faltan ${pendientes}). Los avisos son opcionales.`
              : "Revisa los avisos si quieres; ya se puede crear la obra."}
        </span>
      </div>

      {advertencias.map((a, i) => {
        const abierta = abiertas.has(i);
        const verTodas = todas.has(i);
        const filas = verTodas ? a.filas : a.filas.slice(0, 8);
        const color = a.nivel === "error" ? colors.danger : colors.warning;
        const ef = efectos(a);
        const decision = decisionDe(a, i);
        const falta = a.nivel === "error" && !decision;
        return (
          <div key={i} style={{ borderTop: `1px solid ${colors.neutralSoft}`, background: colors.surface }}>
            <div onClick={() => a.filas.length && alternar(setAbiertas, i)}
              style={{ display: "flex", gap: 8, padding: "9px 12px 4px", cursor: a.filas.length ? "pointer" : "default", alignItems: "flex-start" }}>
              <span style={{ color, marginTop: 1, flexShrink: 0 }}>
                {a.filas.length ? (abierta ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : (a.nivel === "error" ? <XCircle size={13} /> : <AlertTriangle size={13} />)}
              </span>
              <span style={{ fontSize: 12, color: colors.ink, lineHeight: 1.45, flex: 1 }}>{a.titulo}</span>
              {a.filas.length > 0 && <span style={{ fontSize: 10, color: colors.muted, flexShrink: 0 }}>{a.filas.length} fila{a.filas.length === 1 ? "" : "s"}</span>}
            </div>

            {abierta && (
              <div style={{ padding: "2px 12px 6px 33px" }}>
                {filas.map((f, j) => (
                  <div key={j} style={{ fontSize: 11, color: colors.inkSoft, padding: "2px 0", display: "flex", gap: 8 }}>
                    <span style={{ color: colors.muted, flexShrink: 0, minWidth: 52 }}>Fila {f.fila}</span>
                    <span style={{ minWidth: 0 }}>{f.texto}</span>
                  </div>
                ))}
                {a.filas.length > 8 && (
                  <button onClick={() => alternar(setTodas, i)}
                    style={{ background: "none", border: "none", padding: "4px 0 0", color: colors.brand, fontSize: 11, cursor: "pointer", fontFamily: colors.font }}>
                    {verTodas ? "Ver menos" : `Ver las ${a.filas.length}`}
                  </button>
                )}
              </div>
            )}

            {/* Las obras importadas antes de poder decidir no tienen nada que mostrar aquí. */}
            {(guardada ? decision : onDecidir) && <div style={{ padding: "4px 12px 10px 33px" }}>
              {guardada ? (
                <Decidido a={a} ef={ef} />
              ) : (
                <>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <Opcion activa={decision === "aceptar"} onClick={() => onDecidir(i, decision === "aceptar" ? null : "aceptar")} icono={<Check size={12} />} texto="Aceptar" />
                    <Opcion activa={decision === "corregir"} onClick={() => onDecidir(i, decision === "corregir" ? null : "corregir")} icono={<X size={12} />} texto="No aceptar" peligro />
                    {falta && <span style={{ alignSelf: "center", fontSize: 10, fontWeight: 700, color: colors.danger }}>DECIDIR</span>}
                  </div>
                  <div style={{ fontSize: 11, color: decision ? colors.inkSoft : colors.muted, marginTop: 5, lineHeight: 1.45 }}>
                    {decision === "aceptar" ? ef.aceptar
                      : decision === "corregir" ? ef.noAceptar
                      : <>Aceptar: {ef.aceptar} · No aceptar: {ef.noAceptar}</>}
                  </div>
                </>
              )}
            </div>}
          </div>
        );
      })}
    </div>
  );
}

function Opcion({ activa, onClick, icono, texto, peligro }) {
  const tono = peligro ? colors.danger : colors.success;
  return (
    <button onClick={onClick}
      style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: colors.radiusSm, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: colors.font,
        border: `1.5px solid ${activa ? tono : colors.border}`, background: activa ? tono : "#fff", color: activa ? "#fff" : colors.inkSoft }}>
      {icono} {texto}
    </button>
  );
}

function Decidido({ a, ef }) {
  const acepto = a.decision === "aceptar";
  const cuando = a.decidido_at ? new Date(a.decidido_at).toLocaleDateString("es-EC", { day: "numeric", month: "short", year: "numeric" }) : "";
  return (
    <div style={{ fontSize: 11, lineHeight: 1.45 }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 700, color: acepto ? colors.success : colors.danger }}>
        {acepto ? <Check size={12} /> : <X size={12} />} {acepto ? "Aceptado" : ef.corrige ? "No aceptado · corregido" : "No aceptado · anotado"}
      </span>
      <span style={{ color: colors.inkSoft }}> — {acepto ? ef.aceptar : ef.noAceptar}</span>
      {(a.decidido_por || cuando) && <span style={{ color: colors.muted }}> ({[a.decidido_por, cuando].filter(Boolean).join(", ")})</span>}
    </div>
  );
}
