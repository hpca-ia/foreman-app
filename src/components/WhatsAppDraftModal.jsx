import { useState } from "react";
import { daysUntil } from "../lib/dates";
import { colors } from "../theme/colors";
import Modal from "./ui/Modal";
import Button from "./ui/Button";

export default function WhatsAppDraftModal({ task, users, projects }) {
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const gU = id => users.find(u => u.id === id);
  const gP = id => projects.find(p => p.id === id);
  const m = task.assignee_id ? gU(task.assignee_id) : null;
  const p = gP(task.project_id);
  const d = daysUntil(task.due_date);
  const followup = task.priority === "urgente" ? "cada 3h" : task.priority === "alta" ? "cada 6h" : "diario";

  async function generar() {
    setLoading(true); setOpen(true);
    const vence = task.status === "listo" ? "está completada" : d < 0 ? `tiene ${Math.abs(d)} días de retraso` : d === 0 ? "vence HOY" : `vence en ${d} días`;
    try {
      const res = await fetch("/api/nova", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 300, system: "Recordatorio WhatsApp para director de construcción. Español. Máx 3 oraciones. Directo. Solo el mensaje.", messages: [{ role: "user", content: `Para ${m?.name || "equipo"}: "${task.title}" en ${p?.name}. ${vence}. Prioridad: ${task.priority}.` }] }) });
      const data = await res.json(); setMsg(data.content?.[0]?.text || "");
    } catch { setMsg("Error."); }
    setLoading(false);
  }

  return (
    <>
      <button onClick={generar} style={{ background: colors.success, border: "none", borderRadius: colors.radiusSm, padding: "5px 10px", color: "#fff", fontSize: 11, fontFamily: colors.font, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>WhatsApp</button>
      {open && (
        <Modal onClose={() => setOpen(false)} maxWidth={400}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: colors.ink }}>WhatsApp</div>
              {m && <div style={{ color: colors.muted, fontSize: 12 }}>{m.name} · seguimiento {followup}</div>}
            </div>
            <button onClick={() => setOpen(false)} style={{ marginLeft: "auto", background: "none", border: "none", color: colors.muted, cursor: "pointer", fontSize: 20 }}>×</button>
          </div>
          {loading ? <div style={{ color: colors.muted, fontSize: 12, padding: "16px 0", textAlign: "center" }}>NOVA redactando...</div>
            : <>
                <textarea value={msg} onChange={e => setMsg(e.target.value)} style={{ width: "100%", minHeight: 90, background: colors.bg, border: `1.5px solid ${colors.border}`, borderRadius: colors.radiusMd, color: colors.ink, fontSize: 13, fontFamily: colors.font, padding: 10, resize: "vertical", boxSizing: "border-box", lineHeight: 1.5, outline: "none" }} />
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <Button variant="outline" size="sm" style={{ flex: 1 }} onClick={generar}>↺</Button>
                  {m ? <Button variant="primary" size="sm" style={{ flex: 2, background: colors.success }} onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank")}>Abrir WhatsApp →</Button>
                    : <div style={{ flex: 2, color: colors.muted, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>Sin asignado</div>}
                </div>
              </>}
        </Modal>
      )}
    </>
  );
}
