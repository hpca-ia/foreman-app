import { useState, useEffect } from "react";
import { HONORARIOS_COMUNES, totalesPresupuesto } from "./honorarios";

// Los honorarios de un presupuesto, en el recuadro de totales: ninguno, de
// administración, de diseño arquitectónico, los dos u otro. Cada uno como
// porcentaje del costo directo o como monto fijo.
//
// Se escribe con libertad y se guarda al salir de la casilla: guardar tecla
// por tecla recalculaba el presupuesto entero con cada número.

const fmt = n => (Number(n) || 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function EditorHonorarios({ lista, subtotal, onCambiar }) {
  // "%" cobra un porcentaje del costo directo; "$" cobra un monto fijo, se
  // acuerde como se acuerde con el cliente.
  const [filas, setFilas] = useState(lista);
  useEffect(() => { setFilas(lista); }, [lista]);

  const montos = totalesPresupuesto(subtotal, { honorarios: filas, iva_pct: 0 }).honorarios;
  const guardar = nuevas => { setFilas(nuevas); onCambiar(nuevas); };
  const cambiar = (i, campo, valor) => setFilas(f => f.map((h, k) => (k === i ? { ...h, [campo]: valor } : h)));
  const agregar = nombre => guardar([...filas, { nombre, tipo: "pct", valor: 0 }]);
  const faltan = HONORARIOS_COMUNES.filter(c => !filas.some(h => h.nombre === c));

  const campo = { background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "3px 6px", fontSize: 12, fontFamily: "var(--font)", color: "var(--ink)", outline: "none" };
  const chip = { background: "none", border: "1px dashed var(--border)", borderRadius: 14, padding: "2px 10px", fontSize: 11, color: "var(--ink-soft)", cursor: "pointer", fontFamily: "var(--font)" };

  return (
    <div style={{ padding: "6px 0", borderBottom: "1px solid var(--neutral-soft)", fontSize: 13, color: "var(--ink-soft)" }}>
      {filas.length === 0 && <div style={{ fontSize: 12, color: "var(--muted)", padding: "2px 0 6px" }}>Sin honorarios</div>}
      {filas.map((h, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", flexWrap: "wrap" }}>
          <input value={h.nombre} onChange={e => cambiar(i, "nombre", e.target.value)} onBlur={() => guardar(filas)}
            placeholder="Nombre del honorario" style={{ ...campo, flex: "1 1 200px", minWidth: 0 }} />
          <div style={{ display: "inline-flex", background: "var(--neutral-soft)", borderRadius: 6, padding: 2 }}>
            {[["pct", "%"], ["monto", "$"]].map(([t, l]) => (
              <button key={t} onClick={() => guardar(filas.map((x, k) => (k === i ? { ...x, tipo: t } : x)))}
                title={t === "pct" ? "Porcentaje del costo directo" : "Monto fijo"}
                style={{ border: "none", borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 700, cursor: "pointer",
                  background: (h.tipo || "pct") === t ? "#fff" : "transparent", color: (h.tipo || "pct") === t ? "var(--ink)" : "var(--muted)" }}>{l}</button>
            ))}
          </div>
          <input type="number" className="num-limpio" value={h.valor} onChange={e => cambiar(i, "valor", e.target.value)} onBlur={() => guardar(filas)}
            style={{ ...campo, width: h.tipo === "monto" ? 96 : 60, textAlign: "right" }} />
          {/* En % se ve cuánto es en plata; en monto fijo, qué porcentaje
              representa: las dos formas de mirar el mismo honorario. */}
          <span style={{ marginLeft: "auto", minWidth: 130, textAlign: "right" }}>
            ${fmt(montos[i]?.monto)}
            {h.tipo === "monto" && Number(subtotal) > 0 && (
              <span style={{ color: "var(--muted)", fontSize: 11 }}> · {(Number(h.valor) / Number(subtotal) * 100).toFixed(1)} %</span>
            )}
          </span>
          <button onClick={() => guardar(filas.filter((_, k) => k !== i))} title="Quitar este honorario"
            style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: 13, padding: "0 2px" }}>✕</button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
        {faltan.map(c => <button key={c} onClick={() => agregar(c)} style={chip}>+ {c.replace("Honorarios de ", "")}</button>)}
        <button onClick={() => agregar("")} style={chip}>+ Otro honorario</button>
      </div>
    </div>
  );
}
