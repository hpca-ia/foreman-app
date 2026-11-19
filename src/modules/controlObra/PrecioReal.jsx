import { useState, useEffect } from "react";
import { colors } from "../../theme/colors";
import { inputStyle } from "../../components/ui/Input";
import { guardarBeneficio } from "./beneficios";
import { cambioDePrecio } from "./beneficioAMano.js";
import { esPrevisto } from "./cuentaBeneficios.js";

// EL PRECIO REAL DE UN BENEFICIO, ESCRITO AHÍ MISMO.
//
// Hernán, 18/11/2026: «poder ingresar precios o gastos manualmente para tener
// una idea hasta que vaya todo a control de obra y tener ya el total de
// beneficio real... o pérdida». Definió «un solo precio real» por comparación.
//
// Para corregir lo que costó algo había que abrir el formulario entero con el
// lápiz. Acá el precio es un casillero en el renglón del beneficio: se escribe
// lo que de verdad costó, se guarda solo al salir —con el estado al lado—, y
// el beneficio o la pérdida de la obra se rehace con ese número. Lo que decía
// la cotización queda guardado aparte (`cotizado`).
//
// Cuando el rubro ya tiene todo en Control de obra, manda Control y este
// casillero no aparece: ahí el número no es de quien escribe.

export default function PrecioReal({ beneficio, onGuardado, onError }) {
  const [valor, setValor] = useState(beneficio.real == null ? "" : String(beneficio.real));
  // "" | "guardando" | "guardado"
  const [estado, setEstado] = useState("");
  useEffect(() => { setValor(beneficio.real == null ? "" : String(beneficio.real)); }, [beneficio.real]);

  async function guardar() {
    const cambio = cambioDePrecio(beneficio, valor);
    // Nada que guardar: vuelve a lo que estaba, por si quedó algo a medio escribir.
    if (!cambio) { setValor(beneficio.real == null ? "" : String(beneficio.real)); return; }
    setEstado("guardando");
    const r = await guardarBeneficio({ id: beneficio.id, ...cambio });
    if (r.error) { setEstado(""); onError?.(r.error); return; }
    setEstado("guardado");
    await onGuardado?.(esPrevisto(beneficio)
      ? "Precio real guardado. Cuando esté comprado, tocá «Confirmar» para que sume a la obra."
      : "Precio real guardado: el resultado de la obra ya lo cuenta.");
  }

  return (
    <span className="precio-real" style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
      $
      <input type="number" step="0.01" min="0" value={valor} aria-label={`Precio real de ${beneficio.descripcion || "este beneficio"}`}
        title="El precio real: lo que de verdad costó. Se guarda solo al salir del casillero."
        onChange={e => { setValor(e.target.value); setEstado(""); }}
        onBlur={guardar}
        onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
        style={{ ...inputStyle, width: 86, padding: "3px 6px", fontSize: 11.5, textAlign: "right", color: colors.ink }} />
      {estado && (
        <span className="estado-del-precio" role="status" style={{ fontSize: 10, color: estado === "guardado" ? colors.success : colors.muted }}>
          {estado === "guardado" ? "guardado" : "guardando…"}
        </span>
      )}
    </span>
  );
}
