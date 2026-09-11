import { useState } from "react";
import { Sparkles, ArrowRight } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import { inputStyle } from "../../components/ui/Input";
import { ETAPAS } from "./constantes";

const hoy = () => new Date().toISOString().split("T")[0];

// Una sola caja para todo lo comercial. "Hay la oportunidad de construir casa
// Fowler" abre el lead; "hay que enviar el presupuesto el viernes" le agrega
// el paso al lead que corresponda. NOVA decide cuál de las dos cosas es, así
// que quien dicta no tiene que pensar en formularios.
export default function NovaLeads({ leads, currentUser, onCambio }) {
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const [dijo, setDijo] = useState("");
  const [error, setError] = useState("");

  async function enviar() {
    const t = texto.trim();
    if (!t) return;
    setPensando(true); setError(""); setDijo("");
    try {
      const catalogo = leads.map(l => `${l.id}: ${l.nombre}${l.contacto ? ` (${l.contacto})` : ""} — ${l.etapa}`).join("\n") || "(todavía no hay leads)";
      const res = await fetch("/api/nova", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-5", max_tokens: 900,
          system: `Eres NOVA y llevas el seguimiento comercial de una constructora en Ecuador.
Hoy es ${hoy()}. Estos son los leads abiertos:
${catalogo}

Interpretas lo que dicta el director y devuelves SOLO JSON, sin markdown.

Si habla de una oportunidad nueva —"hay la oportunidad de construir la casa Fowler"—:
{"accion":"crear","nombre":"Casa Fowler","contacto":null,"valor_estimado":null,"pasos":[]}

Si habla de algo que hay que hacer sobre un lead que ya existe —"hay que enviar
el presupuesto de Fowler el viernes", "solicitar los planos"—:
{"accion":"pasos","lead_id":3,"pasos":[{"titulo":"Enviar el presupuesto","fecha":"2026-09-18"}]}

Si además del lead nuevo dicta cosas por hacer, ponlas en "pasos" de la acción "crear".
Si cambia la etapa —"ya firmamos", "lo perdimos"—:
{"accion":"etapa","lead_id":3,"etapa":"ganado"}
Etapas: ${ETAPAS.map(e => e.id).join(", ")}.

Títulos cortos que empiecen con el verbo. Fechas en AAAA-MM-DD, interpretando
"el viernes", "mañana", "en dos semanas" contra hoy. Sin fecha dicha, usa hoy.
Si no entiendes a qué lead se refiere: {"accion":"nada","motivo":"..."}`,
          messages: [{ role: "user", content: t }],
        }),
      });
      const data = await res.json();
      const raw = (data.content?.[0]?.text || "").replace(/```json|```/g, "").trim();
      const p = JSON.parse(raw.match(/\{[\s\S]*\}/)[0]);

      const nuevoPaso = (leadId, x, i, base) => ({
        title: String(x.titulo || "").trim(), lead_id: leadId, ruta_orden: base + i + 1,
        due_date: /^\d{4}-\d{2}-\d{2}$/.test(x.fecha) ? x.fecha : hoy(),
        priority: "media", status: "pendiente", type: "lead",
        assignee_id: currentUser?.id, created_by: currentUser?.id,
      });

      if (p.accion === "crear") {
        const { data: lead, error: e } = await supabase.from("leads").insert({
          nombre: p.nombre, contacto: p.contacto || null,
          valor_estimado: Number(p.valor_estimado) || null, etapa: "nuevo",
          responsable_id: currentUser?.id, responsable_nombre: currentUser?.name,
          created_by: currentUser?.id,
        }).select().single();
        if (e) throw new Error(e.message);
        const pasos = (p.pasos || []).filter(x => x.titulo?.trim());
        if (pasos.length) await supabase.from("tasks").insert(pasos.map((x, i) => nuevoPaso(lead.id, x, i, 0)));
        await supabase.from("lead_movimientos").insert({
          lead_id: lead.id, tipo: "nota", detalle: `Creado por NOVA: "${t}"`,
          autor_id: currentUser?.id, autor_nombre: currentUser?.name,
        });
        setDijo(`Abrí el lead "${lead.nombre}"${pasos.length ? ` con ${pasos.length} paso${pasos.length === 1 ? "" : "s"}` : ", todavía sin pasos"}.`);

      } else if (p.accion === "pasos") {
        const lead = leads.find(l => l.id === Number(p.lead_id));
        if (!lead) throw new Error("No supe a qué lead te referías.");
        const { data: ya } = await supabase.from("tasks").select("ruta_orden").eq("lead_id", lead.id);
        const base = Math.max(0, ...(ya || []).map(x => x.ruta_orden || 0));
        const pasos = (p.pasos || []).filter(x => x.titulo?.trim());
        if (!pasos.length) throw new Error("No entendí qué había que hacer.");
        await supabase.from("tasks").insert(pasos.map((x, i) => nuevoPaso(lead.id, x, i, base)));
        await supabase.from("leads").update({ actualizado_at: new Date().toISOString() }).eq("id", lead.id);
        setDijo(`Anoté en ${lead.nombre}: ${pasos.map(x => x.titulo).join(", ")}.`);

      } else if (p.accion === "etapa") {
        const lead = leads.find(l => l.id === Number(p.lead_id));
        if (!lead) throw new Error("No supe a qué lead te referías.");
        await supabase.from("leads").update({ etapa: p.etapa, actualizado_at: new Date().toISOString() }).eq("id", lead.id);
        await supabase.from("lead_movimientos").insert({
          lead_id: lead.id, tipo: "etapa", detalle: `${lead.etapa} → ${p.etapa}`, etapa_de: lead.etapa, etapa_a: p.etapa,
          autor_id: currentUser?.id, autor_nombre: currentUser?.name,
        });
        setDijo(`${lead.nombre} pasó a ${p.etapa}.`);

      } else {
        setError(p.motivo || "No entendí. Prueba diciendo el nombre del lead.");
        setPensando(false); return;
      }

      setTexto("");
      await onCambio();
    } catch (e) {
      setError("NOVA no pudo con eso: " + e.message);
    }
    setPensando(false);
  }

  return (
    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 12, marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div style={{ width: 22, height: 22, borderRadius: "50%", background: colors.ink, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Sparkles size={12} color="#fff" />
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, color: colors.ink }}>NOVA — Comercial</span>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <input value={texto} onChange={e => setTexto(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !pensando && enviar()}
          disabled={pensando}
          placeholder={pensando ? "NOVA está anotando..." : '"Hay la oportunidad de construir la casa Fowler" · "Enviar el presupuesto de Fowler el viernes"'}
          style={{ ...inputStyle, flex: 1, fontSize: 12 }} />
        <button onClick={enviar} disabled={!texto.trim() || pensando}
          style={{ background: texto.trim() && !pensando ? colors.brand : colors.neutralSoft, border: "none", borderRadius: colors.radiusSm, padding: "0 14px", color: texto.trim() && !pensando ? "#fff" : colors.muted, cursor: texto.trim() && !pensando ? "pointer" : "default", fontFamily: colors.font, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
          {pensando ? "..." : <>Anotar <ArrowRight size={12} /></>}
        </button>
      </div>
      {dijo && <div style={{ fontSize: 12, color: colors.success, marginTop: 7 }}>{dijo}</div>}
      {error && <div style={{ fontSize: 12, color: colors.danger, marginTop: 7 }}>{error}</div>}
    </div>
  );
}
