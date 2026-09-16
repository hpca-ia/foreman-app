import { useState, useEffect, useCallback } from "react";
import { MessageSquare, Send } from "lucide-react";
import { supabase } from "../lib/supabase";
import { colors } from "../theme/colors";
import { inputStyle } from "./ui/Input";

// El hilo de una tarea. Sirve para lo que hoy se pierde en un WhatsApp suelto:
// "no puedo avanzar porque no me han dado el plano". No es un cambio de estado
// ni una tarea nueva; es lo que el resto tiene que saber, y queda pegado a la
// tarea para que quien llegue después entienda por qué estuvo parada.
//
// Al comentar les llega un correo a los involucrados —quien la tiene a cargo,
// quien la creó y quienes ya comentaron—, nunca a toda la oficina.

const cuando = iso => {
  const d = new Date(iso), ahora = Date.now();
  const min = Math.round((ahora - d.getTime()) / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  if (min < 60 * 24) return `hace ${Math.round(min / 60)} h`;
  return d.toLocaleDateString("es-EC", { day: "numeric", month: "short" });
};

export default function ComentariosTarea({ taskId, currentUser }) {
  const [lista, setLista] = useState([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [sinTabla, setSinTabla] = useState(false);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.from("tarea_comentarios")
      .select("*").eq("task_id", taskId).order("created_at");
    if (e && /relation|schema cache|does not exist/i.test(e.message)) { setSinTabla(true); return; }
    setLista(data || []);
  }, [taskId]);
  useEffect(() => { cargar(); }, [cargar]);

  async function comentar() {
    const t = texto.trim();
    if (!t) return;
    setEnviando(true); setError("");
    const { error: e } = await supabase.from("tarea_comentarios").insert({
      task_id: taskId, texto: t, autor_id: currentUser?.id, autor_nombre: currentUser?.name,
    });
    if (e) { setError("No se pudo guardar: " + e.message); setEnviando(false); return; }
    setTexto("");
    await cargar();
    // El aviso va aparte: si el correo falla, el comentario ya quedó guardado.
    fetch("/api/aviso-comentario", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId, texto: t, autorId: currentUser?.id }),
    }).catch(() => {});
    setEnviando(false);
  }

  if (sinTabla) {
    return <div style={{ fontSize: 11, color: colors.warning }}>Para comentar falta correr la migración 023 en Supabase.</div>;
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: colors.ink, marginBottom: 8 }}>
        <MessageSquare size={13} color={colors.muted} />
        Comentarios {lista.length > 0 && <span style={{ color: colors.muted, fontWeight: 400 }}>· {lista.length}</span>}
      </div>

      {lista.length > 0 && (
        <div style={{ maxHeight: 200, overflowY: "auto", marginBottom: 8 }}>
          {lista.map(c => {
            const mio = c.autor_id === currentUser?.id;
            return (
              <div key={c.id} style={{ background: mio ? colors.brandSoft : colors.bg, borderRadius: colors.radiusSm, padding: "7px 9px", marginBottom: 5 }}>
                <div style={{ fontSize: 10, color: colors.muted, marginBottom: 2 }}>
                  {mio ? "Tú" : c.autor_nombre || "Alguien"} · {cuando(c.created_at)}
                </div>
                <div style={{ fontSize: 12, color: colors.ink, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{c.texto}</div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
        <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={2}
          onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) comentar(); }}
          placeholder="Ej: no puedo avanzar, falta el plano del cliente"
          style={{ ...inputStyle, flex: 1, resize: "vertical", fontSize: 12, padding: "7px 9px" }} />
        <button onClick={comentar} disabled={!texto.trim() || enviando} title="Comentar (Cmd+Enter)"
          style={{ background: texto.trim() ? colors.brand : colors.neutralSoft, border: "none", borderRadius: colors.radiusSm,
            width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center",
            color: texto.trim() ? "#fff" : colors.muted, cursor: texto.trim() ? "pointer" : "default", flexShrink: 0 }}>
          <Send size={14} />
        </button>
      </div>
      <div style={{ fontSize: 10, color: colors.muted, marginTop: 4 }}>
        Les llega por correo a quien la tiene a cargo, a quien la creó y a quienes ya comentaron.
      </div>
      {error && <div style={{ fontSize: 11, color: colors.danger, marginTop: 6 }}>{error}</div>}
    </div>
  );
}
