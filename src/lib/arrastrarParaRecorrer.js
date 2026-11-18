import { useEffect, useRef, useState } from "react";
import { NO_SE_AGARRA, UMBRAL, aDondeVa } from "./arrastre.js";

// RECORRER UN CUADRO ANCHO AGARRÁNDOLO CON EL MOUSE.
//
// Hernán, 18/11/2026: «en el presupuesto actualizado quiero poder panear para
// navegar todo el archivo, así como los cronogramas». El cronograma ya se
// recorre así —se agarra el fondo y se arrastra—; el presupuesto actualizado,
// que tiene quince columnas y no entra en ninguna pantalla, había que moverlo
// con la barra de abajo, que queda al final de una tabla de cien renglones.
//
// Es el mismo gesto del cronograma (TablaGantt), para ponérselo a cualquier
// cuadro que se desplace a los costados: a los costados corre el cuadro,
// arriba y abajo corre la página. No se agarra de lo que se toca o se escribe
// —un casillero, un botón, un enlace—, que tiene lo suyo. Y si hubo arrastre,
// el clic que llega al soltar no abre nada.

// Las reglas —de qué no se agarra, cuándo un clic pasa a ser un arrastre y a
// dónde va el cuadro— están en arrastre.js, sin React, para poder probarlas.
export { NO_SE_AGARRA, UMBRAL, aDondeVa };

/**
 * @param adentro  si arriba y abajo también corre el cuadro —un visor a
 *                 pantalla completa— en vez de la página
 * @returns { cajaRef, agarrar, arrastrando, estilo }: `cajaRef` y `agarrar`
 *          (en `onMouseDown`) van en el cuadro que se desplaza; `estilo`, la
 *          mano abierta o cerrada
 */
export function useArrastrarParaRecorrer({ adentro = false } = {}) {
  const cajaRef = useRef(null);
  const arrastre = useRef(null);
  const [arrastrando, setArrastrando] = useState(false);

  useEffect(() => {
    const mover = e => {
      const r = arrastre.current, caja = cajaRef.current;
      if (!r || !caja) return;
      const va = aDondeVa(r, e.clientX, e.clientY);
      if (!va) return;
      if (!r.movido) { r.movido = true; setArrastrando(true); }
      caja.scrollLeft = va.left;
      if (r.adentro) caja.scrollTop = va.top;
      else window.scrollTo(window.scrollX, va.top);
      e.preventDefault();
    };
    const soltar = () => {
      const r = arrastre.current;
      arrastre.current = null;
      if (!r?.movido) return;
      setArrastrando(false);
      // El clic de soltar llega después: se lo traga una vez.
      const comer = ev => { ev.stopPropagation(); ev.preventDefault(); };
      window.addEventListener("click", comer, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", comer, { capture: true }), 0);
    };
    window.addEventListener("mousemove", mover);
    window.addEventListener("mouseup", soltar);
    return () => { window.removeEventListener("mousemove", mover); window.removeEventListener("mouseup", soltar); };
  }, []);

  const agarrar = e => {
    if (e.button !== 0 || !cajaRef.current) return;
    if (e.target.closest?.(NO_SE_AGARRA)) return;
    arrastre.current = {
      x: e.clientX, y: e.clientY, left: cajaRef.current.scrollLeft,
      top: adentro ? cajaRef.current.scrollTop : window.scrollY, adentro, movido: false,
    };
  };

  return { cajaRef, agarrar, arrastrando, estilo: { cursor: arrastrando ? "grabbing" : "grab", userSelect: arrastrando ? "none" : undefined } };
}
