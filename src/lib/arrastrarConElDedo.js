import { useCallback, useEffect, useRef, useState } from "react";

// ARRASTRAR CON EL DEDO, Y CON EL MOUSE.
//
// Hernán trabaja FOREMAN en el iPad. El arrastre del navegador (draggable) no
// anda con el dedo: en el iPad, deslizar mueve la pantalla. Acá, con el dedo,
// se MANTIENE APRETADO un instante y recién ahí se agarra; si el dedo se
// mueve antes, era deslizar y la pantalla se mueve como siempre. Con el mouse
// se agarra apenas se mueve un poco.
//
// Lo que se agarra viaja debajo del dedo; donde se suelta lo dice el atributo
// `data-soltar` del lugar (por ejemplo «col:hechas» o «etapa:con_presupuesto»).
// Cerca del borde de algo que se desplaza, se desplaza solo. Un toque sin
// arrastrar es un toque: abre lo que se tocó.

export const ESPERA_DEL_DEDO = 260;      // ms apretado antes de agarrar
export const TOLERANCIA_DEL_DEDO = 8;    // px que se puede mover antes: más es deslizar la pantalla
export const UMBRAL_DEL_MOUSE = 5;       // px que hay que mover el mouse para agarrar
const BORDE = 44;                         // px cerca del borde en que se desplaza solo

/** Antes de agarrar, un movimiento: ¿se sigue esperando, se agarra, o era deslizar? */
export function antesDeAgarrar({ tactil, dx, dy }) {
  const d = Math.hypot(dx || 0, dy || 0);
  if (tactil) return d > TOLERANCIA_DEL_DEDO ? "deslizar" : "esperar";
  return d > UMBRAL_DEL_MOUSE ? "agarrar" : "esperar";
}

/** El lugar donde se soltaría, bajo el punto (x, y). */
export function lugarBajo(x, y, doc = typeof document !== "undefined" ? document : null) {
  const el = doc?.elementFromPoint?.(x, y);
  return el?.closest?.("[data-soltar]")?.getAttribute("data-soltar") || null;
}

// No se agarra desde lo que se toca para otra cosa.
const NO_AGARRA = "button, input, select, textarea, a, label, [data-no-agarra]";

function desplazarCerca(x, y) {
  let el = document.elementFromPoint?.(x, y);
  for (; el && el !== document.body; el = el.parentElement) {
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    if (/(auto|scroll)/.test(s.overflowX) && el.scrollWidth > el.clientWidth) {
      if (x > r.right - BORDE) el.scrollLeft += 14; else if (x < r.left + BORDE) el.scrollLeft -= 14;
    }
    if (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight) {
      if (y > r.bottom - BORDE) el.scrollTop += 14; else if (y < r.top + BORDE) el.scrollTop -= 14;
    }
  }
  if (y > window.innerHeight - BORDE) window.scrollBy?.(0, 14); else if (y < BORDE) window.scrollBy?.(0, -14);
}

/**
 * @param alSoltar (datos, lugar) => void: se soltó sobre un `data-soltar`
 * @returns { agarrar(datos, { alTocar }), arrastrando, sobre }
 *          `agarrar` devuelve las props para lo que se puede arrastrar.
 */
export function useArrastre({ alSoltar } = {}) {
  const [estado, setEstado] = useState({ arrastrando: null, sobre: null });
  const actual = useRef(null);
  const alSoltarRef = useRef(alSoltar); alSoltarRef.current = alSoltar;

  // Mientras se arrastra, el dedo no mueve la pantalla.
  useEffect(() => {
    const bloquear = e => { if (actual.current?.activo) e.preventDefault(); };
    document.addEventListener("touchmove", bloquear, { passive: false });
    return () => document.removeEventListener("touchmove", bloquear);
  }, []);

  const agarrar = useCallback((datos, { alTocar } = {}) => ({
    onPointerDown: ev => {
      if (ev.button > 0 || ev.target.closest?.(NO_AGARRA)) return;
      const el = ev.currentTarget;
      const a = { datos, el, x0: ev.clientX, y0: ev.clientY, tactil: ev.pointerType && ev.pointerType !== "mouse", activo: false, reloj: null, sobre: null };
      actual.current = a;
      const empezar = () => {
        if (actual.current !== a) return;
        a.activo = true;
        const r = el.getBoundingClientRect();
        a.dx = a.x0 - r.left; a.dy = a.y0 - r.top;
        a.fantasma = el.cloneNode(true);
        Object.assign(a.fantasma.style, {
          position: "fixed", left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, zIndex: 10000, pointerEvents: "none",
          transform: "rotate(1.5deg) scale(1.03)", boxShadow: "0 18px 40px rgba(15,23,42,.22)", opacity: "0.97", margin: 0,
        });
        document.body.appendChild(a.fantasma);
        el.style.opacity = "0.3";
        setEstado({ arrastrando: datos, sobre: null });
        try { navigator.vibrate?.(12); } catch { /* sin vibración */ }
      };
      const mover = (x, y) => {
        a.fantasma.style.left = `${x - a.dx}px`; a.fantasma.style.top = `${y - a.dy}px`;
        const lugar = lugarBajo(x, y);
        if (lugar !== a.sobre) { a.sobre = lugar; setEstado(e => ({ ...e, sobre: lugar })); }
        desplazarCerca(x, y);
      };
      const alMover = e => {
        if (!a.activo) {
          const que = antesDeAgarrar({ tactil: a.tactil, dx: e.clientX - a.x0, dy: e.clientY - a.y0 });
          if (que === "deslizar") { terminar(false); return; }
          if (que === "agarrar") empezar(); else return;
        }
        mover(e.clientX, e.clientY);
      };
      const terminar = (soltar, fueToque = false) => {
        clearTimeout(a.reloj);
        window.removeEventListener("pointermove", alMover);
        window.removeEventListener("pointerup", alSubir);
        window.removeEventListener("pointercancel", alCancelar);
        if (a.activo) {
          a.fantasma?.remove();
          el.style.opacity = "";
          if (soltar && a.sobre) alSoltarRef.current?.(datos, a.sobre);
          // El clic que sigue al soltar no tiene que abrir lo que se soltó.
          const comer = e => { e.stopPropagation(); e.preventDefault(); };
          window.addEventListener("click", comer, { capture: true, once: true });
          setTimeout(() => window.removeEventListener("click", comer, { capture: true }), 50);
        }
        if (actual.current === a) actual.current = null;
        setEstado({ arrastrando: null, sobre: null });
        if (fueToque) alTocar?.();
      };
      const alSubir = () => terminar(true, !a.activo);
      const alCancelar = () => terminar(false);
      if (a.tactil) a.reloj = setTimeout(empezar, ESPERA_DEL_DEDO);
      window.addEventListener("pointermove", alMover);
      window.addEventListener("pointerup", alSubir);
      window.addEventListener("pointercancel", alCancelar);
    },
    // El menú del dedo apretado (copiar, compartir) no tiene que salir.
    onContextMenu: e => { if (!e.target.closest?.(NO_AGARRA)) e.preventDefault(); },
    onKeyDown: e => { if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) { e.preventDefault(); alTocar?.(); } },
    tabIndex: 0,
    role: "button",
    style: { touchAction: "pan-x pan-y", WebkitUserSelect: "none", userSelect: "none", WebkitTouchCallout: "none", cursor: "grab" },
  }), []);

  return { agarrar, arrastrando: estado.arrastrando, sobre: estado.sobre };
}
