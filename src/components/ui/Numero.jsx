import { useEffect, useRef, useState } from "react";
import { inputStyle } from "./Input";

// Un campo numérico que se puede escribir.
//
// Suena obvio y no lo era: los campos de este tipo se venían armando como
// `value={a.duracion} onChange={e => guardar(Number(e.target.value))}`, o sea
// guardando en la base una vez por tecla. Eso no se puede llenar, por dos
// razones que se suman:
//
//   · Para escribir "25" hay que borrar el "10" que había, y un campo vacío
//     leído con `Number("") || 1` vale 1. Así que al borrar se guarda 1, y lo
//     que se tipea después se pelea contra ese 1.
//   · Cada guardado recarga la pantalla. La respuesta del servidor llega entre
//     dos teclas y le devuelve al campo el valor viejo, borrando lo tipeado.
//
// Acá se escribe en una copia local —se puede dejar vacío, se puede tipear a
// medias— y se guarda cuando el campo pierde el foco o se aprieta Enter. Esc
// deja todo como estaba. Es cómo se comporta una celda de Excel, que es con lo
// que esta gente trabaja todos los días.
//
// Mientras el campo tiene el foco NO se acepta lo que venga de afuera: si no,
// una recarga disparada por otra fila vuelve a pisar lo que uno está
// escribiendo, que es el mismo defecto por otro camino.

/**
 * Qué número sale de lo que la persona escribió.
 *
 * Aparte y exportada para poder probarla: es donde está todo lo que puede
 * salir mal —la coma decimal, el campo vacío, el tope— y lo que decide si se
 * guarda o se descarta. `undefined` significa "esto no es un número, dejá
 * todo como estaba".
 */
export function limpiarNumero(t, { min, max, entero = true, vacio = undefined } = {}) {
  if (String(t).trim() === "") return vacio;
  // La coma como decimal: acá se escribe 0,5 y no 0.5.
  let n = Number(String(t).replace(",", "."));
  if (!isFinite(n)) return undefined;
  if (entero) n = Math.round(n);
  if (min != null) n = Math.max(min, n);
  if (max != null) n = Math.min(max, n);
  return n;
}

export default function Numero({
  value,
  onCommit,            // (número) => void. Solo se llama si de verdad cambió.
  min, max,
  entero = true,
  // Qué guardar si lo dejan vacío. Sin esto, vaciar el campo vuelve al valor
  // anterior — que es lo correcto para una duración o un porcentaje: dejarlos
  // en nada no significa nada, y guardar null ahí rompe el cálculo. Se pone
  // `vacio={null}` solo donde vacío SÍ quiere decir algo, como "esta obra
  // todavía no tiene plazo".
  vacio = undefined,
  style, disabled, title, placeholder,
  ...resto
}) {
  const [txt, setTxt] = useState(value == null ? "" : String(value));
  const enFoco = useRef(false);
  const ultimo = useRef(value);

  // Lo de afuera manda, salvo mientras se está escribiendo.
  //
  // El foco va en un ref y no en un estado, y eso NO es un detalle: con un
  // estado, soltar el campo lo cambia, el efecto vuelve a correr, y como el
  // guardado todavía no volvió del servidor, `value` sigue siendo el número
  // viejo y se lo escribe encima al que acabás de poner. Se veía como que el
  // campo "no funciona": escribías 25, salías, y volvía 10.
  //
  // Con un ref el efecto corre solo cuando de verdad cambia lo de afuera, que
  // es cuando hay algo nuevo que mostrar.
  useEffect(() => {
    if (!enFoco.current) { setTxt(value == null ? "" : String(value)); ultimo.current = value; }
  }, [value]);

  const limpiar = t => limpiarNumero(t, { min, max, entero, vacio });

  const confirmar = () => {
    enFoco.current = false;
    const n = limpiar(txt);
    if (n === undefined) { setTxt(value == null ? "" : String(value)); return; }
    setTxt(n == null ? "" : String(n));
    // Sin cambio no se guarda: entrar y salir de un campo no debería escribir
    // en la base ni recargar la pantalla.
    if (n !== ultimo.current) { ultimo.current = n; onCommit?.(n); }
  };

  return (
    <input
      type="text"
      inputMode={entero ? "numeric" : "decimal"}
      value={txt}
      disabled={disabled}
      title={title}
      placeholder={placeholder}
      onFocus={e => { enFoco.current = true; e.target.select(); }}
      onChange={e => setTxt(e.target.value)}
      onBlur={confirmar}
      onKeyDown={e => {
        if (e.key === "Enter") { e.preventDefault(); e.target.blur(); }
        if (e.key === "Escape") { setTxt(value == null ? "" : String(value)); enFoco.current = false; e.target.blur(); }
      }}
      style={{ ...inputStyle, ...style }}
      {...resto}
    />
  );
}
