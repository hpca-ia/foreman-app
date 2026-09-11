import { useState } from "react";
import { daysUntil } from "../lib/dates";
import { colors } from "../theme/colors";
import NovaMark from "./NovaMark";

export default function AIBriefing({ tasks, currentUser, users, projects }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const gP = id => projects.find(p => p.id === id);
  const gU = id => users.find(u => u.id === id);

  async function obtener() {
    setLoading(true); setVisible(true);
    const todas = tasks.map(t => {
      const d = daysUntil(t.due_date);
      return {
        titulo: t.title,
        proyecto: gP(t.project_id)?.name || "?",
        responsable: t.assignee_id ? gU(t.assignee_id)?.name : "Sin asignar",
        estado: t.status,
        fecha: t.status === "listo" ? "completada" : d < 0 ? `vencida ${Math.abs(d)}d` : d === 0 ? "HOY" : `en ${d}d`,
        prioridad: t.priority,
        vencida: t.status !== "listo" && d < 0,
        urgente: t.status !== "listo" && (t.priority === "urgente" || d <= 1),
      };
    });

    const resumen = JSON.stringify(todas);
    try {
      const res = await fetch("/api/nova", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-5", max_tokens: 600,
          system: `Eres NOVA. Analiza las tareas y responde SOLO con JSON válido sin markdown:
{"recomendaciones":["rec1","rec2","rec3"]}
Máximo 3 recomendaciones específicas y accionables para ${currentUser.name} hoy.`,
          messages: [{ role: "user", content: `Tareas: ${resumen}` }],
        }),
      });
      const resp = await res.json();
      const text = resp.content?.[0]?.text || "{}";
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      setData({ tareas: todas, recomendaciones: parsed.recomendaciones || [] });
    } catch {
      setData({ tareas: todas, recomendaciones: ["Error al conectar con NOVA"] });
    }
    setLoading(false);
  }

  const vencidas = data?.tareas.filter(t => t.vencida).length || 0;
  const urgentes = data?.tareas.filter(t => t.urgente).length || 0;
  const listas = data?.tareas.filter(t => t.estado === "listo").length || 0;
  const total = data?.tareas.length || 0;

  function fechaColor(t) {
    if (t.vencida) return colors.danger;
    if (t.fecha === "HOY") return colors.warning;
    return colors.inkSoft;
  }

  if (!visible) return (
    <button onClick={obtener} style={{ background: colors.surface, border: `1.5px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: "10px 16px", color: colors.brand, fontFamily: colors.font, fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, width: "100%", marginBottom: 14 }}>
      <NovaMark size={22} />
      <div style={{ textAlign: "left" }}>
        <div>NOVA — Briefing del día</div>
        <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 400 }}>Resumen completo con tabla de tareas</div>
      </div>
      <span style={{ marginLeft: "auto" }}>→</span>
    </button>
  );

  return (
    <div style={{ background: colors.surface, border: `1.5px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 16, marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <NovaMark />
        <span style={{ fontSize: 13, fontWeight: 600, color: colors.brand, fontFamily: colors.font }}>NOVA — Briefing</span>
        <button onClick={() => setVisible(false)} style={{ marginLeft: "auto", background: "none", border: "none", color: colors.muted, cursor: "pointer", fontSize: 18 }}>×</button>
      </div>

      {loading ? <div style={{ color: colors.muted, fontFamily: colors.font, fontSize: 13, padding: "10px 0" }}>Analizando {tasks.length} tareas...</div> : data && (
        <>
          <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            {[
              { l: "VENCIDAS", v: vencidas, c: colors.danger, bg: colors.dangerSoft },
              { l: "URGENTES", v: urgentes, c: colors.warning, bg: colors.warningSoft },
              { l: "LISTAS", v: listas, c: colors.success, bg: colors.successSoft },
              { l: "TOTAL", v: total, c: colors.inkSoft, bg: colors.neutralSoft },
            ].map(s => (
              <div key={s.l} style={{ background: s.bg, borderRadius: colors.radiusSm, padding: "8px 14px", textAlign: "center", minWidth: 70 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: s.c, fontFamily: colors.font }}>{s.v}</div>
                <div style={{ fontSize: 10, color: s.c, fontWeight: 600, fontFamily: colors.font }}>{s.l}</div>
              </div>
            ))}
          </div>

          <div style={{ overflowX: "auto", marginBottom: 14 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: colors.font }}>
              <thead>
                <tr style={{ background: colors.brandSoft }}>
                  {["Tarea", "Proyecto", "Responsable", "Estado", "Fecha"].map(h => (
                    <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontSize: 11, color: colors.brand, fontWeight: 600, borderBottom: `2px solid ${colors.border}`, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.tareas.map((t, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #F3F4F6", background: i % 2 === 0 ? colors.surface : "#FAFAFA" }}>
                    <td style={{ padding: "5px 10px", fontWeight: 500, color: colors.ink, maxWidth: 200 }}>{t.titulo}</td>
                    <td style={{ padding: "5px 10px", color: colors.inkSoft, whiteSpace: "nowrap" }}>{t.proyecto}</td>
                    <td style={{ padding: "5px 10px", color: colors.inkSoft, whiteSpace: "nowrap" }}>{t.responsable}</td>
                    <td style={{ padding: "5px 10px", whiteSpace: "nowrap" }}>{t.estado}</td>
                    <td style={{ padding: "5px 10px", fontWeight: 600, color: fechaColor(t), whiteSpace: "nowrap" }}>{t.fecha}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.recomendaciones.length > 0 && (
            <div style={{ background: colors.successSoft, borderRadius: colors.radiusSm, padding: "10px 14px", borderLeft: `3px solid ${colors.success}` }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: colors.success, marginBottom: 6, fontFamily: colors.font }}>RECOMENDACIONES DE NOVA</div>
              <ol style={{ margin: 0, paddingLeft: 16 }}>
                {data.recomendaciones.map((r, i) => <li key={i} style={{ fontSize: 12, color: colors.inkSoft, marginBottom: 3, fontFamily: colors.font }}>{r}</li>)}
              </ol>
            </div>
          )}
        </>
      )}
      {!loading && <button onClick={obtener} style={{ marginTop: 10, background: colors.brandSoft, border: `1.5px solid ${colors.border}`, borderRadius: colors.radiusSm, padding: "5px 12px", color: colors.brand, fontFamily: colors.font, fontSize: 11, cursor: "pointer", fontWeight: 600 }}>↺ Actualizar</button>}
    </div>
  );
}
