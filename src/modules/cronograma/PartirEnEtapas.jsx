import { useState } from "react";
import { Plus, X } from "lucide-react";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import Numero from "../../components/ui/Numero";
import { inputStyle } from "../../components/ui/Input";
import { ETAPAS } from "./cpm";

// Partir un rubro en las veces que de verdad pasa.
//
// Un rubro del control de obra es una bolsa de trabajo, y esa bolsa casi nunca
// ocurre de una sola vez. Hay dos formas de que se parta y las dos son
// comunes:
//
//   POR CÓMO SE COMPRA. Una ventanería importada se anticipa en marzo, se
//   fabrica dos meses, llega y se instala en agosto. Cuatro momentos separados
//   y cuatro momentos de plata.
//
//   POR CÓMO SE TRABAJA. "Instalaciones eléctricas" entra tres veces a la
//   obra: las mangueras con la obra gris, el cableado cuando está enlucido, y
//   los aparatos al final. Es un solo rubro del presupuesto y tres tramos del
//   cronograma, con meses de por medio.
//
// Antes solo se podía lo primero, y para lo segundo había que elegir entre
// cuatro nombres —"anticipo", "entrega"— que no querían decir nada para una
// instalación eléctrica. Ahora cada parte se llama como se llame en la obra.
//
// EL REPARTO TIENE QUE CERRAR EN 100. No es una formalidad: con esos
// porcentajes el valorado reparte la plata del rubro, así que un rubro que
// reparte 90 aporta el 90% de su monto y el valorado deja de dar el
// presupuesto. Por eso no deja guardar hasta que cierre, y lo dice.

const COMPRA = [
  { nombre: "anticipo", etapa: "anticipo", peso: 50, duracion: 1, pista: "Es un pago, no un trabajo: dura un día y va meses antes" },
  { nombre: "fabricación", etapa: "fabricacion", peso: 40, duracion: 45, pista: "Larga, y no ocupa gente en obra" },
  { nombre: "instalación", etapa: "instalacion", peso: 10, duracion: 12, pista: "Al final, con el edificio cerrado" },
];

const TRAMOS = [
  { nombre: "primera entrada", etapa: "ejecucion", peso: 40, duracion: 10, pista: "" },
  { nombre: "segunda entrada", etapa: "ejecucion", peso: 40, duracion: 10, pista: "" },
  { nombre: "remates", etapa: "ejecucion", peso: 20, duracion: 5, pista: "" },
];

let proximo = 1;
const conId = lista => lista.map(x => ({ ...x, id: proximo++ }));

export default function PartirEnEtapas({ actividad, onCancelar, onPartir }) {
  const [modo, setModo] = useState("tramos");
  const [partes, setPartes] = useState(() => conId(TRAMOS));
  const [guardando, setGuardando] = useState(false);

  const conPlata = !!actividad?.obra_actividad_id;
  const suma = Math.round(partes.reduce((t, e) => t + (Number(e.peso) || 0), 0) * 100) / 100;
  const cierra = Math.abs(suma - 100) < 0.01;

  const tocar = (id, campos) => setPartes(ps => ps.map(p => (p.id === id ? { ...p, ...campos } : p)));
  const quitar = id => setPartes(ps => ps.filter(p => p.id !== id));
  const agregar = () => setPartes(ps => [...ps, { id: proximo++, nombre: "", etapa: "ejecucion", peso: 0, duracion: 10, pista: "" }]);

  const cambiarModo = m => {
    setModo(m);
    setPartes(conId(m === "compra" ? COMPRA : TRAMOS));
  };

  // Repartir lo que falta en la parte más grande, que es la que lo absorbe sin
  // que se note. Un botón para no tener que hacer la cuenta a mano.
  const cuadrar = () => {
    if (!partes.length) return;
    const mayor = partes.reduce((a, b) => (Number(a.peso) >= Number(b.peso) ? a : b));
    tocar(mayor.id, { peso: Math.round((Number(mayor.peso) + (100 - suma)) * 100) / 100 });
  };

  const listas = partes.filter(p => String(p.nombre || "").trim());

  return (
    <div style={{ background: colors.surface, border: `1px solid ${colors.brand}40`, borderRadius: colors.radiusMd,
      padding: 13, marginBottom: 12, display: "grid", gap: 10 }}>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: colors.ink }}>
          Partir «{actividad?.nombre}» en varias
        </div>
        <div style={{ fontSize: 11.5, color: colors.muted, lineHeight: 1.5, marginTop: 2 }}>
          Cada parte es una barra del cronograma con sus propias fechas, y una línea del valorado con su plata.
          Quedan encadenadas una detrás de otra; después movés cada una a donde va, que casi nunca es apenas
          termina la anterior.
        </div>
      </div>

      {/* Las dos formas en que un rubro se parte de verdad. */}
      <div style={{ display: "flex", gap: 6 }}>
        {[["tramos", "Entra varias veces a la obra", "Eléctricas: mangueras, cableado, aparatos"],
          ["compra", "Se compra y se instala", "Importado: anticipo, fabricación, instalación"]].map(([id, label, pista]) => {
          const puesto = modo === id;
          return (
            <button key={id} onClick={() => cambiarModo(id)}
              style={{ flex: 1, textAlign: "left", border: `1px solid ${puesto ? colors.brand : colors.border}`,
                background: puesto ? colors.brandSoft : "#fff", color: puesto ? colors.brand : colors.inkSoft,
                borderRadius: 8, padding: "8px 10px", cursor: "pointer", fontFamily: colors.font,
                fontSize: 12.5, fontWeight: puesto ? 700 : 500 }}>
              {label}
              <div style={{ fontSize: 10, fontWeight: 400, opacity: 0.85, marginTop: 1 }}>{pista}</div>
            </button>
          );
        })}
      </div>

      <div style={{ display: "grid", gap: 5 }}>
        {partes.map(p => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
            background: colors.bg, borderRadius: 7, padding: "6px 8px" }}>
            <input value={p.nombre} placeholder="¿cómo se llama esta parte?"
              onChange={e => tocar(p.id, { nombre: e.target.value })}
              style={{ ...inputStyle, flex: 1, minWidth: 150, padding: "4px 8px", fontSize: 12 }} />
            {conPlata && (
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <Numero value={p.peso} min={0} max={100} entero={false}
                  onCommit={v => tocar(p.id, { peso: v })}
                  style={{ width: 54, padding: "3px 6px", fontSize: 11.5, textAlign: "center" }} />
                <span style={{ fontSize: 10.5, color: colors.muted }}>% de la plata</span>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <Numero value={p.duracion} min={1} max={2000}
                onCommit={v => tocar(p.id, { duracion: v })}
                style={{ width: 54, padding: "3px 6px", fontSize: 11.5, textAlign: "center" }} />
              <span style={{ fontSize: 10.5, color: colors.muted }}>días</span>
            </div>
            {p.pista && <span style={{ fontSize: 10.5, color: colors.muted, flexBasis: "100%" }}>{p.pista}</span>}
            <button onClick={() => quitar(p.id)} title="Sacar esta parte"
              style={{ background: "none", border: "none", color: colors.muted, cursor: "pointer", display: "flex", padding: 2 }}>
              <X size={13} />
            </button>
          </div>
        ))}
        <button onClick={agregar}
          style={{ background: "none", border: `1px dashed ${colors.border}`, borderRadius: 7, padding: "6px 8px",
            cursor: "pointer", color: colors.inkSoft, fontFamily: colors.font, fontSize: 11.5,
            display: "flex", alignItems: "center", gap: 5, justifyContent: "center" }}>
          <Plus size={12} /> Agregar otra parte
        </button>
      </div>

      {conPlata && (
        <div style={{ fontSize: 11.5, color: cierra ? colors.brand : colors.warning, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {cierra
            ? "El reparto cierra en 100%."
            : <>Las partes reparten <strong>{suma}%</strong> y tienen que repartir 100: con esto el valorado
                {suma < 100 ? " dejaría afuera" : " contaría de más"} plata del rubro.</>}
          {!cierra && partes.length > 0 && (
            <button onClick={cuadrar} style={{ background: "none", border: `1px solid ${colors.border}`, borderRadius: 6,
              color: colors.brand, cursor: "pointer", fontSize: 11, fontFamily: colors.font, padding: "2px 8px" }}>
              Cuadrar en la más grande
            </button>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <Button variant="primary" size="sm" disabled={guardando || listas.length < 2 || (conPlata && !cierra)}
          onClick={async () => { setGuardando(true); await onPartir(listas); setGuardando(false); }}>
          {guardando ? "Partiendo…" : `Partir en ${listas.length} partes`}
        </Button>
        <Button variant="secondary" size="sm" onClick={onCancelar}>Cancelar</Button>
        {listas.length < 2 && (
          <span style={{ fontSize: 11, color: colors.muted }}>Ponele nombre a por lo menos dos.</span>
        )}
      </div>

      <div style={{ fontSize: 10.5, color: colors.muted, lineHeight: 1.5 }}>
        Los nombres de compra —{Object.values(ETAPAS).filter(Boolean).join(", ")}— sirven para que el valorado sepa
        que un anticipo es un pago y no un trabajo. Para los tramos de obra el nombre es libre: se usa tal cual.
      </div>
    </div>
  );
}
