import { useState } from "react";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import Numero from "../../components/ui/Numero";
import { ETAPAS } from "./cpm";

// Partir un rubro en los momentos en que de verdad ocurre.
//
// Una ventanería importada no es una cosa que pasa en un momento: se anticipa
// en marzo, se fabrica dos meses, llega, y se instala en agosto cuando la obra
// está cerrada. Son cuatro momentos separados en el tiempo y cuatro momentos
// de plata, y de eso depende que el cronograma y el valorado digan lo mismo.
//
// Antes esto era un botón "+ etapa" que agregaba una por vez, partía el peso
// al medio y dejaba la nueva al final de la lista. Para armar las tres había
// que apretarlo dos veces y corregir cuatro números, y el resultado quedaba
// desparramado. Acá se dicen las tres de una, con su reparto y su duración, y
// se crean encadenadas.
//
// EL REPARTO TIENE QUE CERRAR EN 100. No es una formalidad: con esos
// porcentajes el valorado reparte la plata del rubro, así que un rubro que
// reparte 90 aporta el 90% de su monto y el valorado deja de dar el
// presupuesto. Por eso no deja guardar hasta que cierre, y lo dice.

const TIPICO = [
  { id: "anticipo", puesta: true, peso: 50, duracion: 1, pista: "Es un pago, no un trabajo: dura un día y va meses antes" },
  { id: "fabricacion", puesta: true, peso: 40, duracion: 45, pista: "Larga, y no ocupa gente en obra" },
  { id: "entrega", puesta: false, peso: 0, duracion: 2, pista: "Llega a la obra" },
  { id: "instalacion", puesta: true, peso: 10, duracion: 12, pista: "Al final, con el edificio cerrado" },
];

export default function PartirEnEtapas({ actividad, onCancelar, onPartir }) {
  const [etapas, setEtapas] = useState(TIPICO);
  const [guardando, setGuardando] = useState(false);

  const puestas = etapas.filter(e => e.puesta);
  const suma = Math.round(puestas.reduce((t, e) => t + (Number(e.peso) || 0), 0) * 100) / 100;
  const cierra = Math.abs(suma - 100) < 0.01;
  const conPlata = !!actividad?.obra_actividad_id;

  const tocar = (id, campos) => setEtapas(es => es.map(e => (e.id === id ? { ...e, ...campos } : e)));

  // Repartir lo que falta en la etapa más grande, que es la que lo absorbe sin
  // que se note. Un botón para no tener que hacer la cuenta a mano.
  const cuadrar = () => {
    if (!puestas.length) return;
    const mayor = puestas.reduce((a, b) => (Number(a.peso) >= Number(b.peso) ? a : b));
    tocar(mayor.id, { peso: Math.round((Number(mayor.peso) + (100 - suma)) * 100) / 100 });
  };

  return (
    <div style={{ background: colors.surface, border: `1px solid ${colors.brand}40`, borderRadius: colors.radiusMd,
      padding: 13, marginBottom: 12, display: "grid", gap: 10 }}>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: colors.ink }}>
          Partir «{actividad?.nombre}» en etapas
        </div>
        <div style={{ fontSize: 11.5, color: colors.muted, lineHeight: 1.5, marginTop: 2 }}>
          Cada etapa es una barra del cronograma y una línea del valorado. Quedan encadenadas una detrás de otra;
          después movés la instalación a donde va, que casi nunca es apenas termina la fabricación.
        </div>
      </div>

      <div style={{ display: "grid", gap: 5 }}>
        {etapas.map(e => (
          <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
            background: e.puesta ? colors.bg : "transparent", borderRadius: 7, padding: "6px 8px",
            opacity: e.puesta ? 1 : 0.55 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", minWidth: 130 }}>
              <input type="checkbox" checked={e.puesta} onChange={ev => tocar(e.id, { puesta: ev.target.checked })} />
              <span style={{ fontSize: 12.5, fontWeight: e.puesta ? 600 : 400, color: colors.ink }}>{ETAPAS[e.id]}</span>
            </label>
            {conPlata && (
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <Numero value={e.peso} min={0} max={100} entero={false} disabled={!e.puesta}
                  onCommit={v => tocar(e.id, { peso: v })}
                  style={{ width: 54, padding: "3px 6px", fontSize: 11.5, textAlign: "center" }} />
                <span style={{ fontSize: 10.5, color: colors.muted }}>% de la plata</span>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <Numero value={e.duracion} min={1} max={2000} disabled={!e.puesta}
                onCommit={v => tocar(e.id, { duracion: v })}
                style={{ width: 54, padding: "3px 6px", fontSize: 11.5, textAlign: "center" }} />
              <span style={{ fontSize: 10.5, color: colors.muted }}>días</span>
            </div>
            <span style={{ fontSize: 10.5, color: colors.muted, flex: 1, minWidth: 150 }}>{e.pista}</span>
          </div>
        ))}
      </div>

      {conPlata && (
        <div style={{ fontSize: 11.5, color: cierra ? colors.brand : colors.warning, display: "flex", alignItems: "center", gap: 8 }}>
          {cierra
            ? "El reparto cierra en 100%."
            : <>Las etapas reparten <strong>{suma}%</strong> y tienen que repartir 100: con esto el valorado
                {suma < 100 ? " dejaría afuera" : " contaría de más"} plata del rubro.</>}
          {!cierra && puestas.length > 0 && (
            <button onClick={cuadrar} style={{ background: "none", border: `1px solid ${colors.border}`, borderRadius: 6,
              color: colors.brand, cursor: "pointer", fontSize: 11, fontFamily: colors.font, padding: "2px 8px" }}>
              Cuadrar en la más grande
            </button>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <Button variant="primary" size="sm" disabled={guardando || puestas.length < 2 || (conPlata && !cierra)}
          onClick={async () => { setGuardando(true); await onPartir(puestas); setGuardando(false); }}>
          {guardando ? "Partiendo…" : `Partir en ${puestas.length} etapas`}
        </Button>
        <Button variant="secondary" size="sm" onClick={onCancelar}>Cancelar</Button>
        {puestas.length < 2 && (
          <span style={{ fontSize: 11, color: colors.muted, alignSelf: "center" }}>Marcá al menos dos.</span>
        )}
      </div>
    </div>
  );
}
