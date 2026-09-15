import { useState, useRef } from "react";
import { supabase } from "../lib/supabase";
import { colors } from "../theme/colors";
import Button from "./ui/Button";
import NovaMark from "./NovaMark";

export default function NovaInput({ currentUser, projects, users, puedeAsignarATodos = true, tareas = [], onCambiarEstado, onTaskCreated }) {
  const [texto, setTexto] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [grabando, setGrabando] = useState(false);
  const [vozError, setVozError] = useState("");
  const [oyo, setOyo] = useState(false);
  const recRef = useRef(null);

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
    // Tocar el micrófono mientras escucha = "ya terminé": corta y procesa.
    if (recRef.current) { try { recRef.current.stop(); } catch {} return; }
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
    let oido = "";
    // Algunos navegadores no cortan solos al terminar de hablar y el micrófono
    // quedaba abierto hasta tocarlo. Ahora se corta tras 2 segundos sin
    // palabras nuevas, a los 7 si no se oyó nada, y nunca pasa de 25.
    let silencio = null;
    const cortar = () => { try { r.stop(); } catch {} };
    const limpiar = () => { clearTimeout(silencio); clearTimeout(tope); };
    const tope = setTimeout(cortar, 25000);
    silencio = setTimeout(cortar, 7000);
    r.onresult = e => {
      const t = Array.from(e.results).map(x => x[0].transcript).join("");
      if (t) { oido = t; setTexto(t); setOyo(true); }
      clearTimeout(silencio);
      silencio = setTimeout(cortar, 2000);
    };
    r.onerror = ev => {
      limpiar(); recRef.current = null;
      setGrabando(false);
      const m = MOTIVOS[ev.error];
      setVozError(m === "" ? "" : (m || `El dictado falló (${ev.error}). Usa el micrófono del teclado de tu teléfono.`));
    };
    // Termina sin resultado y sin error: pasa en los navegadores embebidos,
    // que aceptan arrancar y se apagan en silencio.
    // Al terminar de hablar NOVA procesa sola: si uno ya dictó, apretar "Crear"
    // es un paso que no aporta nada. Lo que sí queda es confirmar, porque el
    // dictado se equivoca y una tarea mal asignada cuesta más que un toque.
    r.onend = () => {
      limpiar(); recRef.current = null;
      setGrabando(false);
      if (oido.trim()) procesar(oido);
      else setVozError(v => v || "No llegó nada del micrófono. Si abriste FOREMAN desde WhatsApp, ábrelo en Safari o Chrome — o dicta con el micrófono del teclado.");
    };
    try { r.start(); recRef.current = r; setGrabando(true); } catch {
      limpiar();
      setVozError("El dictado ya estaba andando. Espera un momento y vuelve a intentar.");
    }
  }

  // Recibe el texto dictado directo: el estado todavía no se actualizó cuando
  // termina el dictado. Desde el botón llega un evento, no un texto.
  async function procesar(entrada) {
    const texto_ = typeof entrada === "string" ? entrada : texto;
    if (!texto_.trim()) return;
    setLoading(true); setResult(null);
    const hoy = new Date().toISOString().split("T")[0];
    const proyList = projects.map(p => `${p.id}=${p.name}`).join(",");
    const userList = users.map(u => `${u.id}=${u.name}`).join(",");
    // Las tareas que esta persona puede cerrar, las más próximas primero: una
    // lista acotada para que NOVA elija entre pocas y no se confunda.
    const abiertas = tareas.slice().sort((a, b) => (a.due_date || "9999").localeCompare(b.due_date || "9999")).slice(0, 80);
    const listaTareas = abiertas.map(t => `${t.id}|${t.title}|${projects.find(p => p.id === t.project_id)?.name || ""}|${users.find(u => u.id === t.assignee_id)?.name || ""}|${t.due_date || ""}`).join("\n") || "(ninguna)";
    try {
      const res = await fetch("/api/nova", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-5", max_tokens: 600,
          system: `Eres NOVA, la asistente de tareas de una constructora en Ecuador. Hoy: ${hoy}.
Decide si la persona quiere CREAR una tarea nueva o dar por TERMINADA una que ya existe.
Responde SOLO JSON, sin markdown.

Para crear:
{"accion":"crear","title":"...","project_id":N_O_NULL,"assignee_id":N_O_NULL,"type":"...","due_date":"YYYY-MM-DD","priority":"urgente|alta|media|baja","notes":"..."}
Proyectos: ${proyList}. Usuarios: ${userList}.
Tipos: Llamada,Reunión,Contrato,Compra,Inspección,Aprobación,Visita a obra,Otro.
Prioridad: "urgente", "ya mismo", "hoy sin falta" → urgente; "importante", "prioridad alta",
"alta" → alta; "cuando puedas", "sin apuro", "baja" → baja; si no dice nada → media.
Fecha: interpreta "mañana", "el viernes", "en dos semanas" contra hoy; sin fecha dicha, usa hoy.
Si no menciona proyecto, project_id es null. Si no menciona a nadie, la tarea es para quien
habla: assignee_id ${currentUser.id}.

Para terminar ("terminé", "ya hice", "listo lo de", "completé", "ya compré"...), busca en estas
tareas abiertas (id|título|proyecto|responsable|vence):
${listaTareas}
Si una coincide claramente: {"accion":"completar","task_id":N}
Si varias podrían ser, no adivines: {"accion":"completar","candidatas":[N,N]}
Si ninguna coincide: {"accion":"nada","motivo":"No encontré una tarea abierta que se parezca a eso."}`,
          messages: [{ role: "user", content: texto_ }],
        }),
      });
      const data = await res.json();
      const raw = (data.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim();
      const p = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || raw);
      const ids = new Set(abiertas.map(t => t.id));
      if (p.accion === "completar") {
        // Solo ids que de verdad están en la lista: NOVA no puede cerrar una
        // tarea que esta persona no tiene permiso de cambiar.
        const cands = (p.candidatas || (p.task_id != null ? [p.task_id] : [])).map(Number).filter(id => ids.has(id));
        if (!cands.length) setResult({ error: "No encontré una tarea abierta tuya que se parezca a eso." });
        else setResult({ accion: "completar", candidatas: cands });
      } else if (p.accion === "nada") {
        setResult({ error: p.motivo || "No entendí. Intenta de nuevo." });
      } else {
        setResult({ ...p, accion: "crear" });
      }
    } catch { setResult({ error: "No pude entender. Intenta de nuevo." }); }
    setLoading(false);
  }

  async function confirmar() {
    if (!result || result.error) return;
    const { accion, errorGuardar, candidatas, ...fila } = result;
    // Quien no puede asignar a otros no termina asignándole a otro por un
    // nombre que NOVA creyó oír; y un proyecto que no es suyo queda vacío.
    if (fila.assignee_id != null && !users.some(u => u.id === fila.assignee_id)) fila.assignee_id = currentUser.id;
    if (fila.project_id != null && !projects.some(p => p.id === fila.project_id)) fila.project_id = null;
    if (fila.assignee_id != null && !asignablesDe(fila.project_id).some(u => u.id === fila.assignee_id)) fila.assignee_id = currentUser.id;
    const { error } = await supabase.from("tasks").insert({ ...fila, created_by: currentUser.id });
    if (error) {
      const msg = /out of range/i.test(error.message)
        ? "Falta correr la migración 012 en Supabase: los proyectos y usuarios nuevos todavía no se pueden usar en tareas."
        : /null value|not-null/i.test(error.message)
        ? "Falta correr la migración 011 en Supabase: por ahora toda tarea necesita proyecto. Elige uno arriba y vuelve a confirmar."
        : "No se pudo crear la tarea: " + error.message;
      setResult({ ...result, errorGuardar: msg }); return;
    }
    setTexto(""); setResult(null); setOyo(false); onTaskCreated();
  }

  // Cerrar también se confirma: el dictado se equivoca, y dar por terminada
  // una tarea que no lo está es peor que un toque de más.
  async function completar(id) {
    const t = tareas.find(x => x.id === id);
    await onCambiarEstado?.(id, "listo");
    setTexto(""); setOyo(false);
    setResult({ hecho: `Listo: «${t?.title || "la tarea"}» quedó como completada.` });
  }

  const cambiar = (k, v) => setResult(r => ({ ...r, [k]: v }));
  // Sin permiso de asignar a todos, las personas dependen del proyecto elegido.
  const asignablesDe = projectId => {
    if (puedeAsignarATodos) return users;
    const p = projects.find(x => x.id === projectId);
    return p ? users.filter(u => (p.miembros || []).includes(u.id)) : users;
  };
  const cambiarProyecto = valor => {
    const id = valor ? Number(valor) : null;
    const lista = asignablesDe(id);
    setResult(r => ({
      ...r, project_id: id,
      assignee_id: r.assignee_id == null || lista.some(u => u.id === r.assignee_id) ? r.assignee_id : currentUser.id,
    }));
  };
  const campo = { background: "#fff", border: `1px solid ${colors.border}`, borderRadius: colors.radiusSm, color: colors.ink, fontSize: 12, fontFamily: colors.font, padding: "6px 8px", minWidth: 0, boxSizing: "border-box" };

  return (
    <div style={{ background: colors.surface, border: `1.5px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 14, marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <NovaMark />
        <span style={{ fontSize: 13, fontWeight: 600, color: colors.brand }}>NOVA — Tareas</span>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <input
          value={texto} onChange={e => setTexto(e.target.value)} onKeyDown={e => e.key === "Enter" && procesar()}
          placeholder='"Tarea para Hector, inspección BdP Condado, mañana" · "Terminé la inspección de BdP"'
          style={{ flex: 1, background: colors.bg, border: `1.5px solid ${colors.border}`, borderRadius: colors.radiusMd, color: colors.ink, fontSize: 13, fontFamily: colors.font, padding: "8px 12px", outline: "none" }}
        />
        <button
          onClick={startVoice}
          style={{ width: 36, background: grabando ? colors.dangerSoft : colors.bg, border: `1.5px solid ${grabando ? colors.danger : colors.border}`, borderRadius: colors.radiusMd, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, animation: grabando ? "pulse 1s infinite" : "none" }}
          title="Dictar" aria-label="Dictar">🎤</button>
        <Button onClick={() => procesar()} disabled={!texto.trim() || loading} size="md">
          {loading ? "..." : "Crear →"}
        </Button>
      </div>
      {result?.hecho && <div style={{ color: colors.success, fontSize: 12, marginTop: 6, fontWeight: 600 }}>✓ {result.hecho}</div>}
      {result?.accion === "completar" && (
        <div style={{ background: colors.brandSoft, border: `1.5px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 10 }}>
          <div style={{ fontSize: 11, color: colors.brand, fontWeight: 600, marginBottom: 4 }}>
            {result.candidatas.length === 1 ? "¿Marco esta tarea como completada?" : "¿Cuál de estas terminaste?"}
          </div>
          {result.candidatas.map(id => {
            const t = tareas.find(x => x.id === id);
            if (!t) return null;
            return (
              <div key={id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderTop: `1px solid ${colors.border}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                  <div style={{ fontSize: 11, color: colors.inkSoft }}>{[projects.find(p => p.id === t.project_id)?.name, users.find(u => u.id === t.assignee_id)?.name, t.due_date].filter(Boolean).join(" · ")}</div>
                </div>
                <Button variant="primary" size="sm" style={{ background: colors.success, flexShrink: 0 }} onClick={() => completar(id)}>✓ Terminada</Button>
              </div>
            );
          })}
          <Button variant="outline" size="sm" style={{ width: "100%", marginTop: 6 }} onClick={() => setResult(null)}>Cancelar</Button>
        </div>
      )}
      {result && !result.error && result.accion !== "completar" && !result.hecho && (
        <div style={{ background: colors.successSoft, border: "1.5px solid #BFE3CC", borderRadius: colors.radiusMd, padding: 10 }}>
          <div style={{ fontSize: 11, color: colors.success, fontWeight: 600, marginBottom: 4 }}>✓ NOVA entendió — corrige lo que haga falta:</div>
          {/* Todo editable: NOVA propone y uno corrige ahí mismo. El dictado se
              equivoca, y rehacer la tarea desde cero por un nombre mal oído
              hace que se deje de dictar. */}
          <input value={result.title || ""} onChange={e => cambiar("title", e.target.value)}
            style={{ ...campo, fontSize: 13, fontWeight: 600, marginBottom: 6, width: "100%" }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <select value={result.project_id ?? ""} onChange={e => cambiarProyecto(e.target.value)} style={campo}>
              <option value="">Sin proyecto</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select value={result.assignee_id ?? ""} onChange={e => cambiar("assignee_id", e.target.value ? Number(e.target.value) : null)} style={campo}>
              <option value="">Sin asignar</option>
              {asignablesDe(result.project_id).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <input type="date" value={result.due_date || ""} onChange={e => cambiar("due_date", e.target.value)} style={campo} />
            <select value={result.priority || "media"} onChange={e => cambiar("priority", e.target.value)} style={campo}>
              {[["urgente", "Urgente"], ["alta", "Alta"], ["media", "Media"], ["baja", "Baja"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <Button variant="outline" size="sm" style={{ flex: 1 }} onClick={() => setResult(null)}>Cancelar</Button>
            <Button variant="primary" size="sm" style={{ flex: 2, background: colors.success }} onClick={confirmar}>✓ Confirmar</Button>
          </div>
          {result.errorGuardar && <div style={{ color: colors.danger, fontSize: 12, marginTop: 6 }}>{result.errorGuardar}</div>}
        </div>
      )}
      {grabando && <div style={{ fontSize: 12, color: colors.danger, marginTop: 2 }}>Escuchando… habla ahora. Se corta solo al callarte, o toca 🎤 para terminar.</div>}
      {loading && !grabando && <div style={{ fontSize: 12, color: colors.brand, marginTop: 2 }}>NOVA está entendiendo...</div>}
      {vozError && (
        <div style={{ fontSize: 12, color: colors.warning, background: colors.warningSoft, border: `1px solid ${colors.warningBorder}`, borderRadius: colors.radiusSm, padding: "8px 10px", marginTop: 6 }}>
          {vozError}
        </div>
      )}
      {result?.error && <div style={{ color: colors.danger, fontSize: 12, marginTop: 6 }}>{result.error}</div>}
    </div>
  );
}
