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
  const [vozError, setVozError] = useState("");
  const [oyo, setOyo] = useState(false);

  // El dictado del navegador falla de varias maneras y ninguna se anuncia
  // sola: sin permiso, dentro del navegador de WhatsApp, o simplemente sin
  // oír nada. Antes todos esos casos se veían igual —no pasa nada— que es la
  // peor forma de fallar. Cada uno dice ahora qué hacer al respecto.
  const MOTIVOS = {
    "not-allowed": "No diste permiso al micrófono. Búscalo en los ajustes del navegador para este sitio.",
    "service-not-allowed": "Este navegador no deja dictar. Si abriste FOREMAN desde WhatsApp, ábrelo en Safari o Chrome.",
    "no-speech": "No te escuché. Habla más cerca del teléfono.",
    "audio-capture": "No encontré micrófono.",
    "network": "El dictado necesita internet y no hay conexión.",
    "aborted": "",
  };

  function startVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setVozError("Este navegador no sabe dictar. Usa el micrófono del teclado de tu teléfono, que funciona igual.");
      return;
    }
    setVozError(""); setOyo(false);
    let r;
    try { r = new SR(); } catch {
      setVozError("No se pudo abrir el dictado. Usa el micrófono del teclado de tu teléfono.");
      return;
    }
    r.lang = "es-EC"; r.continuous = false; r.interimResults = true;
    r.onresult = e => {
      const t = Array.from(e.results).map(x => x[0].transcript).join("");
      if (t) { setTexto(t); setOyo(true); }
    };
    r.onerror = ev => {
      setGrabando(false);
      const m = MOTIVOS[ev.error];
      setVozError(m === "" ? "" : (m || `El dictado falló (${ev.error}). Usa el micrófono del teclado de tu teléfono.`));
    };
    // Termina sin resultado y sin error: pasa en los navegadores embebidos,
    // que aceptan arrancar y se apagan en silencio.
    r.onend = () => {
      setGrabando(false);
      setOyo(prev => {
        if (!prev) setVozError(v => v || "No llegó nada del micrófono. Si abriste FOREMAN desde WhatsApp, ábrelo en Safari o Chrome — o dicta con el micrófono del teclado.");
        return prev;
      });
    };
    try { r.start(); setGrabando(true); } catch {
      setVozError("El dictado ya estaba andando. Espera un momento y vuelve a intentar.");
    }
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
          model: "claude-sonnet-4-5", max_tokens: 500,
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
          title="Dictar" aria-label="Dictar">🎤</button>
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
      {grabando && <div style={{ fontSize: 12, color: colors.danger, marginTop: 2 }}>Escuchando... habla ahora.</div>}
      {vozError && (
        <div style={{ fontSize: 12, color: colors.warning, background: colors.warningSoft, border: `1px solid ${colors.warningBorder}`, borderRadius: colors.radiusSm, padding: "8px 10px", marginTop: 6 }}>
          {vozError}
        </div>
      )}
      {result?.error && <div style={{ color: colors.danger, fontSize: 12, marginTop: 6 }}>{result.error}</div>}
    </div>
  );
}
