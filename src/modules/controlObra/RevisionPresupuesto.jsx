import { useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronRight } from "lucide-react";
import { colors } from "../../theme/colors";

// Lo que la revisión encontró en el Excel. Se usa al importar —antes de crear
// la obra— y después en la pestaña Presupuesto, para volver a verlo. Cada
// advertencia se abre para ver las filas, con el número de fila de Excel.
export default function RevisionPresupuesto({ advertencias = [], guardada = false }) {
  const [abiertas, setAbiertas] = useState(() => new Set());
  const [todas, setTodas] = useState(() => new Set());
  const errores = advertencias.filter(a => a.nivel === "error").length;
  const avisos = advertencias.length - errores;

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
          {[errores && `${errores} ${errores === 1 ? "error de suma" : "errores de suma"}`, avisos && `${avisos} ${avisos === 1 ? "aviso" : "avisos"}`].filter(Boolean).join(" · ")}
        </span>
        <span style={{ fontSize: 11, color: colors.muted, width: "100%" }}>
          {guardada ? "El presupuesto se importó tal cual estaba en el Excel." : "El presupuesto se importa tal cual dice el Excel. Esto es para que lo revises antes de crear la obra."}
        </span>
      </div>

      {advertencias.map((a, i) => {
        const abierta = abiertas.has(i);
        const verTodas = todas.has(i);
        const filas = verTodas ? a.filas : a.filas.slice(0, 8);
        const color = a.nivel === "error" ? colors.danger : colors.warning;
        return (
          <div key={i} style={{ borderTop: `1px solid ${colors.neutralSoft}`, background: colors.surface }}>
            <div onClick={() => a.filas.length && alternar(setAbiertas, i)}
              style={{ display: "flex", gap: 8, padding: "9px 12px", cursor: a.filas.length ? "pointer" : "default", alignItems: "flex-start" }}>
              <span style={{ color, marginTop: 1, flexShrink: 0 }}>
                {a.filas.length ? (abierta ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : (a.nivel === "error" ? <XCircle size={13} /> : <AlertTriangle size={13} />)}
              </span>
              <span style={{ fontSize: 12, color: colors.ink, lineHeight: 1.45, flex: 1 }}>{a.titulo}</span>
              {a.filas.length > 0 && <span style={{ fontSize: 10, color: colors.muted, flexShrink: 0 }}>{a.filas.length} fila{a.filas.length === 1 ? "" : "s"}</span>}
            </div>
            {abierta && (
              <div style={{ padding: "0 12px 10px 33px" }}>
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
          </div>
        );
      })}
    </div>
  );
}
