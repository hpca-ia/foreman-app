import { useCallback, useEffect, useRef, useState } from "react";

// LO QUE PASÓ, DICHO ABAJO, CON «DESHACER».
//
// Arrastrar una tarjeta cambia algo de verdad —la etapa de un proyecto, el
// estado de una actividad— con un solo gesto, y un gesto se puede errar. Se
// dice qué pasó y se ofrece volver atrás, unos segundos, sin preguntar antes.

const DURA = 4500;

/** @returns [elemento, avisar(texto, deshacer?)] */
export function useAvisoAbajo() {
  const [aviso, setAviso] = useState(null);   // { texto, deshacer, n }
  const reloj = useRef(null);
  useEffect(() => () => clearTimeout(reloj.current), []);
  const avisar = useCallback((texto, deshacer = null) => {
    clearTimeout(reloj.current);
    setAviso(a => ({ texto, deshacer, n: (a?.n || 0) + 1 }));
    reloj.current = setTimeout(() => setAviso(null), DURA);
  }, []);
  const elemento = aviso ? (
    <div key={aviso.n} className="aviso-abajo" role="status"
      style={{ position: "fixed", left: "50%", bottom: 18, transform: "translateX(-50%)", zIndex: 9500, maxWidth: "calc(100vw - 24px)",
        display: "flex", alignItems: "center", gap: 12, background: "#111827", color: "#fff", borderRadius: 11, padding: "10px 12px 10px 14px",
        fontFamily: "'Inter', sans-serif", fontSize: 13, boxShadow: "0 10px 30px rgba(15,23,42,.25)" }}>
      <span>{aviso.texto}</span>
      {aviso.deshacer && (
        <button className="deshacer" onClick={() => { const d = aviso.deshacer; setAviso(null); clearTimeout(reloj.current); d(); }}
          style={{ background: "none", border: "none", color: "#9FE0D3", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>
          Deshacer
        </button>
      )}
    </div>
  ) : null;
  return [elemento, avisar];
}
