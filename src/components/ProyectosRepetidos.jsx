import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { colors } from "../theme/colors";
import { duplicadosProbables } from "../lib/fusionarLead";

// El mismo trabajo cargado dos veces, a la vista y en un solo lugar.
//
// La unión existía escondida dentro de la ficha de cada proyecto, y para
// usarla había que sospechar primero cuál era el repetido. Acá salen los pares
// solos, con lo que cuelga de cada uno —presupuestos, obra, gente— para poder
// decidir cuál se queda sin abrir nada, y cualquier par se puede armar a mano
// cuando los nombres no se parecen en nada.

export default function ProyectosRepetidos({ leads = [], presupuestos = [], obras = [], accesos = {}, onUnir, uniendo }) {
  const [de, setDe] = useState("");
  const [a, setA] = useState("");
  const [invertidos, setInvertidos] = useState({});

  const pares = duplicadosProbables(leads, presupuestos, obras);
  const leadDe = id => leads.find(l => l.id === id);

  const queTiene = l => {
    const ps = presupuestos.filter(p => p.lead_id === l.id && !p.archivado_at).length;
    const tieneObra = !!l.obra_id || obras.some(o => o.lead_id === l.id);
    const gente = Object.keys(accesos[l.id] || {}).length;
    return [
      ps ? `${ps} ${ps === 1 ? "presupuesto" : "presupuestos"}` : "sin presupuesto",
      tieneObra ? "con obra" : "sin obra",
      gente ? `${gente} ${gente === 1 ? "persona" : "personas"}` : "sin gente",
      l.resultado === "ganado" ? "aprobado" : null,
    ].filter(Boolean).join(" · ");
  };

  const tarjeta = (l, papel) => (
    <div style={{ background: "#fff", border: `1px solid ${papel === "queda" ? colors.success : colors.border}`,
      borderRadius: 8, padding: "7px 9px", flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.4, color: papel === "queda" ? colors.success : colors.muted }}>
        {papel === "queda" ? "SE QUEDA" : "SE BORRA"}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: colors.ink, overflowWrap: "anywhere" }}>{l.nombre}</div>
      <div style={{ fontSize: 10, color: colors.muted }}>{queTiene(l)}</div>
    </div>
  );

  const unPar = (borrar, queda, clave, porque) => (
    <div key={clave} style={{ background: colors.bg, border: `1px solid ${colors.warningBorder}`, borderRadius: colors.radiusMd, padding: 9, marginBottom: 7 }}>
      {porque && <div style={{ fontSize: 10, color: colors.warning, marginBottom: 5 }}>Parece el mismo: {porque}.</div>}
      <div style={{ display: "flex", gap: 7, alignItems: "stretch" }}>
        {tarjeta(borrar, "borrar")}
        <div style={{ display: "flex", alignItems: "center", color: colors.muted }}><ArrowRight size={14} /></div>
        {tarjeta(queda, "queda")}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
        <button onClick={() => setInvertidos(v => ({ ...v, [clave]: !v[clave] }))}
          style={{ border: `1px solid ${colors.border}`, background: "#fff", color: colors.inkSoft, borderRadius: 8,
            padding: "5px 10px", fontSize: 11, cursor: "pointer", fontFamily: colors.font }}>
          Al revés
        </button>
        <button onClick={() => onUnir(borrar, queda)} disabled={uniendo === borrar.id}
          style={{ flex: 1, border: "none", background: colors.brand, color: "#fff", borderRadius: 8,
            padding: "5px 10px", fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: colors.font }}>
          {uniendo === borrar.id ? "Uniendo…" : `Unir: todo pasa a “${queda.nombre}”`}
        </button>
      </div>
    </div>
  );

  const manualDe = leadDe(Number(de));
  const manualA = leadDe(Number(a));
  const selector = (valor, poner, label) => (
    <select value={valor} onChange={e => poner(e.target.value)}
      style={{ flex: 1, minWidth: 0, border: `1px solid ${colors.border}`, borderRadius: 8, padding: "5px 7px",
        fontSize: 11.5, fontFamily: colors.font, color: colors.inkSoft, background: "#fff" }}>
      <option value="">{label}</option>
      {leads.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
    </select>
  );

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: colors.muted, letterSpacing: 0.4 }}>
        PROYECTOS REPETIDOS{pares.length ? ` · ${pares.length}` : ""}
      </div>
      <div style={{ fontSize: 10, color: colors.muted, marginBottom: 6 }}>
        El mismo trabajo cargado dos veces parte en dos su presupuesto, su obra y sus permisos. Unirlos mueve todo
        a uno solo y borra el otro.
      </div>

      {pares.map(par => {
        const clave = `${par.nuevo}-${par.original}`;
        const uno = leadDe(par.nuevo), otro = leadDe(par.original);
        if (!uno || !otro) return null;
        const vuelta = invertidos[clave];
        return unPar(vuelta ? otro : uno, vuelta ? uno : otro, clave, par.porque);
      })}

      {!pares.length && (
        <div style={{ fontSize: 11, color: colors.muted, marginBottom: 6 }}>
          Ninguno que se parezca. Si igual sabés de dos que son el mismo, armá el par acá abajo.
        </div>
      )}

      {/* A mano: dos proyectos pueden ser el mismo y llamarse completamente
          distinto, y ahí ninguna sospecha automática los va a juntar. */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
        {selector(de, setDe, "Este se borra…")}
        <ArrowRight size={13} color={colors.muted} />
        {selector(a, setA, "…y todo pasa a este")}
      </div>
      {manualDe && manualA && manualDe.id !== manualA.id && (
        <button onClick={() => { onUnir(manualDe, manualA); setDe(""); setA(""); }} disabled={uniendo === manualDe.id}
          style={{ width: "100%", marginTop: 5, border: "none", background: colors.brand, color: "#fff", borderRadius: 8,
            padding: "6px 10px", fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: colors.font }}>
          {uniendo === manualDe.id ? "Uniendo…" : `Unir “${manualDe.nombre}” con “${manualA.nombre}”`}
        </button>
      )}
    </div>
  );
}
