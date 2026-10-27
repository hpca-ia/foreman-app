import { colors } from "../../theme/colors";
import { fmt } from "./calculos";
import { SIGLA_CAJA } from "./origenGasto";

// CCH: ESTE GASTO VINO DE CAJA CHICA.
//
// No es una alarma —un gasto de caja chica es un gasto normal—, así que no va
// en ámbar ni en rojo: va en el verde de la casa, como una etiqueta de
// procedencia. Lo que dice es "a este nadie le puso rubro al comprarlo", que
// es exactamente lo que hay que ir a revisar.
//
// Con `monto`, en la fila de un rubro: cuánto de ese número llegó por esa
// puerta.
export default function MarcaCaja({ monto = null, de = "" }) {
  const texto = monto == null ? SIGLA_CAJA : `${SIGLA_CAJA} $${fmt(Math.abs(monto))}`;
  const titulo = monto == null
    ? "Vino de caja chica: lo compró y lo pagó alguien en la obra, y el rubro se le asignó después. Vale la pena revisar que sea el correcto."
    : `De este rubro, $${fmt(Math.abs(monto))} vinieron de caja chica${de ? ` sobre $${fmt(de)} invertidos` : ""}. El rubro se lo puso quien revisó el gasto, no quien lo compró.`;
  return (
    <span title={titulo}
      style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 700, color: colors.brand,
        background: colors.brandSoft, border: `1px solid ${colors.border}`,
        borderRadius: 9, padding: "1px 6px", whiteSpace: "nowrap", flexShrink: 0 }}>
      {texto}
    </span>
  );
}
