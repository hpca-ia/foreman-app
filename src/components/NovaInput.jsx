import { useState } from "react";
import { supabase } from "../lib/supabase";
import { colors } from "../theme/colors";
import Button from "./ui/Button";
import NovaMark from "./NovaMark";

export default function NovaInput({ currentUser, projects, users, onTaskCreated }) {
  const [texto, setTexto] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [grabando, setGrabando] = useState(false);

  function startVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Usa Chrome para dictado."); return; }
    const r = new SR();
    r.lang = "es-ES"; r.continuous = false; r.interimResults = false;
    r.onresult = e => { setTexto(e.results[0][0].transcript); setGrabando(false); };
    r.onerror = () => setGrabando(false);
    r.onend = () => setGrabando(false);
    r.start(); setGrabando(true);
  }

  async function procesar() {
    if (!texto.trim()) return;
    setLoading(true); setResult(null);
    const proyList = projects.map(p => `${p.id}=${p.name}`).join(",");
    const userList = users.map(u => `${u.id}=${u.name}`).join(",");
    try {
      const res = await fetch("/api/nova", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 500,
          system: `Eres NOVA. Extrae datos y responde SOLO JSON sin markdown:
{"title":"...","project_id":N,"assignee_id":N_OR_NULL,"type":"...","due_date":"YYYY-MM-DD","priority":"urgente|alta|media|baja","notes":"..."}
Proyectos: ${proyList}. Usuarios: ${userList}.
Tipos: Llamada,Reunión,Contrato,Compra,Inspección,Aprobación,Visita a obra,Otro.
Hoy: ${new Date().toISOString().split("T")[0]}.`,
          messages: [{ role: "user", content: texto }],
        }),
      });
      const data = await res.json();
      const t = data.content?.[0]?.text || "{}";
      setResult(JSON.parse(t.replace(/```json|```/g, "").trim()));
    } catch { setResult({ error: "No pude entender. Intenta de nuevo." }); }
    setLoading(false);
  }

  async function confirmar() {
    if (!result || result.error) return;
    await supabase.from("tasks").insert({ ...result, created_by: currentUser.id });
    setTexto(""); setResult(null); onTaskCreated();
  }

  const gP = id => projects.find(p => p.id === id);
  const gU = id => users.find(u => u.id === id);

  return (
    <div style={{ background: colors.surface, border: `1.5px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 14, marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <NovaMark />
        <span style={{ fontSize: 13, fontWeight: 600, color: colors.brand }}>NOVA — Crear tarea</span>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <input
          value={texto} onChange={e => setTexto(e.target.value)} onKeyDown={e => e.key === "Enter" && procesar()}
          placeholder='"Tarea para Hector, inspección BdP Condado, urgente mañana"'
          style={{ flex: 1, background: colors.bg, border: `1.5px solid ${colors.border}`, borderRadius: colors.radiusMd, color: colors.ink, fontSize: 13, fontFamily: colors.font, padding: "8px 12px", outline: "none" }}
        />
        <button
          onClick={startVoice}
          style={{ width: 36, background: grabando ? colors.dangerSoft : colors.bg, border: `1.5px solid ${grabando ? colors.danger : colors.border}`, borderRadius: colors.radiusMd, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, animation: grabando ? "pulse 1s infinite" : "none" }}
        >🎤</button>
        <Button onClick={procesar} disabled={!texto.trim() || loading} size="md">
          {loading ? "..." : "Crear →"}
        </Button>
      </div>
      {result && !result.error && (
        <div style={{ background: colors.successSoft, border: "1.5px solid #BFE3CC", borderRadius: colors.radiusMd, padding: 10 }}>
          <div style={{ fontSize: 11, color: colors.success, fontWeight: 600, marginBottom: 4 }}>✓ NOVA entendió:</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: colors.ink, marginBottom: 2 }}>{result.title}</div>
          <div style={{ fontSize: 11, color: colors.inkSoft }}>{gP(result.project_id)?.name} · {result.assignee_id ? gU(result.assignee_id)?.name : "Sin asignar"} · {result.due_date} · {result.priority}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <Button variant="outline" size="sm" style={{ flex: 1 }} onClick={() => setResult(null)}>Cancelar</Button>
            <Button variant="primary" size="sm" style={{ flex: 2, background: colors.success }} onClick={confirmar}>✓ Confirmar</Button>
          </div>
        </div>
      )}
      {result?.error && <div style={{ color: colors.danger, fontSize: 12, marginTop: 6 }}>{result.error}</div>}
    </div>
  );
}
