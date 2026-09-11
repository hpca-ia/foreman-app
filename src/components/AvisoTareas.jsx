import { AlertTriangle, Clock, CheckCircle2 } from "lucide-react";
import { colors } from "../theme/colors";
import { daysUntil } from "../lib/dates";

// Lo primero de la pantalla, para todos los roles. Las tareas son lo que hace
// que la obra avance, así que lo que está vencido tiene que saltar encima
// antes que cualquier herramienta: si hay que buscarlo, no cumple su función.
//
// Cada aviso filtra al tocarlo — un número que no lleva a ninguna parte es
// decoración, no una alerta.
export default function AvisoTareas({ tasks, onFiltrar, filtro }) {
  const pendientes = tasks.filter(t => t.status !== "listo");
  const vencidas = pendientes.filter(t => t.due_date && daysUntil(t.due_date) < 0);
  const hoy = pendientes.filter(t => t.due_date && daysUntil(t.due_date) === 0);
  const urgentes = pendientes.filter(t => t.priority === "urgente" && daysUntil(t.due_date) > 0);

  if (!pendientes.length) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", marginBottom: 12, background: colors.successSoft || colors.brandSoft, borderRadius: colors.radiusMd, fontSize: 13, color: colors.success, fontWeight: 600 }}>
        <CheckCircle2 size={15} /> Todo al día. Sin tareas pendientes.
      </div>
    );
  }

  const avisos = [
    vencidas.length && { k: "vencidas", n: vencidas.length, txt: vencidas.length === 1 ? "vencida" : "vencidas", Icono: AlertTriangle, color: colors.danger, bg: colors.dangerSoft, borde: colors.dangerBorder },
    hoy.length && { k: "hoy", n: hoy.length, txt: hoy.length === 1 ? "vence hoy" : "vencen hoy", Icono: Clock, color: colors.warning, bg: colors.warningSoft, borde: colors.warningBorder },
    urgentes.length && { k: "urgentes", n: urgentes.length, txt: urgentes.length === 1 ? "urgente" : "urgentes", Icono: AlertTriangle, color: colors.brand, bg: colors.brandSoft, borde: colors.border },
  ].filter(Boolean);

  if (!avisos.length) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", marginBottom: 12, background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, fontSize: 13, color: colors.inkSoft }}>
        <CheckCircle2 size={15} color={colors.success} />
        <strong style={{ color: colors.ink }}>{pendientes.length}</strong> pendientes, ninguna vencida.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
      {avisos.map(({ k, n, txt, Icono, color, bg, borde }) => {
        const activo = filtro === "urgente" && (k === "vencidas" || k === "urgentes");
        return (
          <button key={k} onClick={() => onFiltrar("urgente")}
            style={{
              flex: "1 1 140px", display: "flex", alignItems: "center", gap: 9,
              background: bg, border: `1.5px solid ${activo ? color : borde}`,
              borderRadius: colors.radiusMd, padding: "11px 14px", cursor: "pointer",
              fontFamily: colors.font, textAlign: "left",
            }}>
            <Icono size={17} color={color} style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 21, fontWeight: 700, color, lineHeight: 1 }}>{n}</span>
            <span style={{ fontSize: 12, color, fontWeight: 600, lineHeight: 1.2 }}>{txt}</span>
          </button>
        );
      })}
    </div>
  );
}
