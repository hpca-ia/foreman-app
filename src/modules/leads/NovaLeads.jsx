import { useState } from "react";
import { Sparkles, ArrowRight, Mic } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import { inputStyle } from "../../components/ui/Input";
import { CATALOGO_BASE } from "./constantes";
import {
  TIPOS, ORDEN_DE_TIPOS, tipoDe, etapasDelTipo, nombreDeEtapa, hoyISO, sumarDias, diaCorto,
  alCambiarEtapa, alAprobar, alPerder, alEsperar, alResponder,
} from "./pipeline";
import { aplicar } from "./proyecto";
import { filaNueva } from "./tareasDelProyecto";
import { useDictado } from "../../lib/dictado";
import { LECTURA, textoDeNova } from "../../lib/modelos";

const hoy = () => new Date().toISOString().split("T")[0];

// Una sola caja para todo lo comercial. "Hay la oportunidad de construir casa
// Fowler" abre el lead; "hay que enviar el presupuesto el viernes" le agrega
// el paso al lead que corresponda; "ya firmamos" lo aprueba; "le mandé el
// presupuesto, recordámelo el lunes" lo deja esperando al cliente. NOVA
// decide cuál es, así que quien dicta no tiene que pensar en formularios.
//
// NOVA lee; lo que se guarda lo deciden las mismas reglas que usa la pantalla
// (pipeline.js): no puede mandar un lead a una etapa que no es de su tipo.
export default function NovaLeads({ leads, currentUser, catalogo, onCambio }) {
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const [dijo, setDijo] = useState("");
  const [error, setError] = useState("");
  // Dictar es lo natural acá: uno se entera de una oportunidad manejando o
  // saliendo de una reunión, no sentado frente al teclado.
  const { grabando, error: errorVoz, dictar } = useDictado({
    onParcial: setTexto,
    onListo: t => { setTexto(t); enviar(t); },
  });

  async function enviar(dictado) {
    const t = (typeof dictado === "string" ? dictado : texto).trim();
    if (!t) return;
    setPensando(true); setError(""); setDijo("");
    try {
      const etapas = Array.isArray(catalogo) && catalogo.length ? catalogo : CATALOGO_BASE;
      const listaDeLeads = leads.map(l => {
        const tipo = tipoDe(l);
        return `${l.id}: ${l.nombre}${l.contacto ? ` (${l.contacto})` : ""} — ${tipo ? TIPOS[tipo].label : "sin tipo"}`
          + ` — etapa ${nombreDeEtapa(l.etapa, etapas) || "sin etapa"}${l.espera_desde ? " — esperando al cliente" : ""}`;
      }).join("\n") || "(todavía no hay leads)";
      const etapasPorTipo = ORDEN_DE_TIPOS.map(tipo =>
        `${tipo} (${TIPOS[tipo].label}): ${etapasDelTipo(etapas, tipo).map(e => `${e.id} = ${e.nombre}`).join(", ")}`).join("\n");
      const res = await fetch("/api/nova", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: LECTURA, max_tokens: 900,
          system: `Eres NOVA y llevas el seguimiento comercial de un estudio de arquitectura y construcción en Ecuador.
Hoy es ${hoy()}. Estos son los leads que se persiguen:
${listaDeLeads}

Un lead es de uno de tres tipos, y cada tipo tiene sus etapas:
${etapasPorTipo}

Interpretas lo que dicta el director y devuelves SOLO JSON, sin markdown.

Si habla de una oportunidad nueva —"hay la oportunidad de construir la casa Fowler"—:
{"accion":"crear","nombre":"Casa Fowler","contacto":null,"tipo":"construccion","pasos":[]}
"tipo" es diseno si solo se diseña, construccion si solo se construye, diseno_construccion si las dos
cosas; si no se entiende cuál, null.

Si habla de algo que hay que hacer sobre un lead que ya existe —"hay que enviar
el presupuesto de Fowler el viernes", "solicitar los planos"—:
{"accion":"pasos","lead_id":3,"pasos":[{"titulo":"Enviar el presupuesto","fecha":"2026-09-18"}]}
Si además del lead nuevo dicta cosas por hacer, ponlas en "pasos" de la acción "crear".

Si el lead pasa a otra etapa —"Fowler ya está en presupuesto"—, con una etapa DE SU TIPO:
{"accion":"etapa","lead_id":3,"etapa":"con_presupuesto"}
Si se aprobó —"ya firmamos", "nos lo dieron"—: {"accion":"aprobar","lead_id":3}
Si se perdió —"lo perdimos por precio"—: {"accion":"perder","lead_id":3,"motivo":"precio"}
Si queda esperando la respuesta del cliente —"le mandé el presupuesto a Fowler, recordámelo el lunes"—:
{"accion":"esperar","lead_id":3,"que":"que apruebe el presupuesto","recordar":"2026-09-21"}
Sin fecha dicha, "recordar" es en tres días.
Si el cliente respondió —"Fowler ya contestó"—: {"accion":"respondio","lead_id":3}

Títulos cortos que empiecen con el verbo. Fechas en AAAA-MM-DD, interpretando
"el viernes", "mañana", "en dos semanas" contra hoy. Sin fecha dicha, usa hoy.
Si no entiendes a qué lead se refiere: {"accion":"nada","motivo":"..."}`,
          messages: [{ role: "user", content: t }],
        }),
      });
      const data = await res.json();
      const raw = (textoDeNova(data) || "").replace(/```json|```/g, "").trim();
      const p = JSON.parse(raw.match(/\{[\s\S]*\}/)[0]);

      // Un paso es una tarea del lead, la misma que se ve en Tareas: de quien
      // la dicta, con fecha, y con la etapa en la que está el lead de etiqueta.
      const nuevoPaso = (lead, x, i, base) => filaNueva({
        lead, etapaId: lead.etapa, titulo: x.titulo, orden: base + i + 1, tipo: "Otro",
        due_date: /^\d{4}-\d{2}-\d{2}$/.test(x.fecha) ? x.fecha : hoy(),
        assignee_id: currentUser?.id, creadoPor: currentUser?.id,
      });
      const elLead = () => {
        const lead = leads.find(l => l.id === Number(p.lead_id));
        if (!lead) throw new Error("No supe a qué lead te referías.");
        return lead;
      };
      const guardar = async (lead, cambio) => {
        const r = await aplicar(lead, cambio, currentUser);
        if (r.error) throw new Error(r.error);
      };

      if (p.accion === "crear") {
        const tipo = TIPOS[p.tipo] ? p.tipo : null;
        const { data: lead, error: e } = await supabase.from("leads").insert({
          nombre: p.nombre, contacto: p.contacto || null,
          // Sin tipo queda en «Sin tipo», arriba de todo, hasta que se le ponga.
          ...(tipo ? { tunel: tipo, etapa: etapasDelTipo(etapas, tipo)[0]?.id || "nuevo" } : { etapa: "nuevo" }),
          es_lead: true,
          responsable_id: currentUser?.id, responsable_nombre: currentUser?.name,
          created_by: currentUser?.id,
        }).select().single();
        if (e) throw new Error(e.message);
        const pasos = (p.pasos || []).filter(x => x.titulo?.trim());
        if (pasos.length) {
          const { error: eP } = await supabase.from("tasks").insert(pasos.map((x, i) => nuevoPaso(lead, x, i, 0)));
          if (eP) throw new Error(`el lead se creó, pero sus pasos no: ${eP.message}`);
        }
        await supabase.from("lead_movimientos").insert({
          lead_id: lead.id, tipo: "nota", detalle: `Creado por NOVA: "${t}"`,
          autor_id: currentUser?.id, autor_nombre: currentUser?.name,
        });
        setDijo(`Abrí el lead "${lead.nombre}"${tipo ? `, de ${TIPOS[tipo].label}` : " — falta decirle el tipo"}`
          + `${pasos.length ? `, con ${pasos.length} paso${pasos.length === 1 ? "" : "s"}` : ", todavía sin próximo paso"}.`);

      } else if (p.accion === "pasos") {
        const lead = elLead();
        const { data: ya } = await supabase.from("tasks").select("ruta_orden").eq("lead_id", lead.id);
        const base = Math.max(0, ...(ya || []).map(x => x.ruta_orden || 0));
        const pasos = (p.pasos || []).filter(x => x.titulo?.trim());
        if (!pasos.length) throw new Error("No entendí qué había que hacer.");
        const { error: eP } = await supabase.from("tasks").insert(pasos.map((x, i) => nuevoPaso(lead, x, i, base)));
        if (eP) throw new Error(eP.message);
        await supabase.from("leads").update({ actualizado_at: new Date().toISOString() }).eq("id", lead.id);
        setDijo(`Anoté en ${lead.nombre}: ${pasos.map(x => x.titulo).join(", ")}.`);

      } else if (p.accion === "etapa") {
        const lead = elLead();
        // Solo una etapa de su tipo: una inventada dejaría al lead sin etapa.
        const destino = etapasDelTipo(etapas, tipoDe(lead)).find(e => e.id === p.etapa);
        if (!destino) throw new Error(`"${p.etapa}" no es una etapa de ${lead.nombre}. Cambiala desde su tarjeta.`);
        await guardar(lead, alCambiarEtapa(lead, destino.id, etapas));
        setDijo(`${lead.nombre} pasó a ${destino.nombre}.`);

      } else if (p.accion === "aprobar") {
        const lead = elLead();
        await guardar(lead, alAprobar());
        setDijo(`${lead.nombre} quedó aprobado y salió del pipeline.`);

      } else if (p.accion === "perder") {
        const lead = elLead();
        await guardar(lead, alPerder(p.motivo));
        setDijo(`${lead.nombre} quedó como perdido: ${p.motivo}.`);

      } else if (p.accion === "esperar") {
        const lead = elLead();
        const dia = /^\d{4}-\d{2}-\d{2}$/.test(p.recordar) && p.recordar >= hoyISO() ? p.recordar : sumarDias(hoyISO(), 3);
        await guardar(lead, alEsperar({ que: p.que, recordarEl: dia }));
        setDijo(`${lead.nombre} queda esperando al cliente. Te lo recuerdo el ${diaCorto(dia)}.`);

      } else if (p.accion === "respondio") {
        const lead = elLead();
        await guardar(lead, alResponder(lead));
        setDijo(`Anotado: el cliente de ${lead.nombre} respondió. Decime cuál es el próximo paso.`);

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
        <button onClick={dictar} disabled={pensando} title={grabando ? "Tocar para terminar" : "Dictar"}
          style={{ background: grabando ? colors.danger : colors.neutralSoft, border: "none", borderRadius: colors.radiusSm, width: 38, flexShrink: 0,
            color: grabando ? "#fff" : colors.inkSoft, cursor: pensando ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Mic size={14} />
        </button>
        <button onClick={() => enviar()} disabled={!texto.trim() || pensando}
          style={{ background: texto.trim() && !pensando ? colors.brand : colors.neutralSoft, border: "none", borderRadius: colors.radiusSm, padding: "0 14px", color: texto.trim() && !pensando ? "#fff" : colors.muted, cursor: texto.trim() && !pensando ? "pointer" : "default", fontFamily: colors.font, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
          {pensando ? "..." : <>Anotar <ArrowRight size={12} /></>}
        </button>
      </div>
      {grabando && <div style={{ fontSize: 12, color: colors.danger, marginTop: 7 }}>Escuchando… toca el micrófono cuando termines.</div>}
      {errorVoz && <div style={{ fontSize: 12, color: colors.warning, marginTop: 7 }}>{errorVoz}</div>}
      {dijo && <div style={{ fontSize: 12, color: colors.success, marginTop: 7 }}>{dijo}</div>}
      {error && <div style={{ fontSize: 12, color: colors.danger, marginTop: 7 }}>{error}</div>}
    </div>
  );
}
