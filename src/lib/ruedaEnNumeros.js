// La rueda del mouse sobre una casilla de número cambiaba su valor.
//
// Pasaba al trabajar un presupuesto: se tocaba un precio, se movía el mouse
// para seguir leyendo y el precio subía o bajaba de a centavo solo, sin que
// nadie escribiera nada. Es el comportamiento que traen los navegadores en
// <input type="number"> cuando la casilla tiene el foco y el cursor encima.
//
// Al rodar la rueda se le quita el foco a la casilla: el valor queda como
// estaba y la página sigue desplazándose normalmente.

export function evitarRuedaEnNumeros() {
  document.addEventListener("wheel", () => {
    const el = document.activeElement;
    if (el && el.tagName === "INPUT" && el.type === "number") el.blur();
  }, { passive: true, capture: true });
}
