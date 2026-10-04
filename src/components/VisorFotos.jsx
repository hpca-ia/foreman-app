import { useEffect } from "react";
import { ChevronLeft, ChevronRight, X, Download } from "lucide-react";
import { colors } from "../theme/colors";

// Mirar una foto sin irse de FOREMAN.
//
// Abrir cada imagen en otra pestaña obliga a volver, y en el teléfono es peor:
// la pestaña nueva tapa la app y se vuelve con el botón de atrás, que a veces
// sale del formulario. Una observación tiene el antes y el después, y la
// gracia es verlos uno después del otro — eso con dos pestañas no se hace.
//
// Se pasa con las flechas y se cierra con Esc o tocando el fondo, que es lo
// que la mano ya intenta hacer.

export default function VisorFotos({ fotos = [], indice = 0, onIndice, onCerrar }) {
  const total = fotos.length;

  useEffect(() => {
    if (!total) return;
    const tecla = e => {
      if (e.key === "Escape") onCerrar();
      if (e.key === "ArrowRight") onIndice((indice + 1) % total);
      if (e.key === "ArrowLeft") onIndice((indice - 1 + total) % total);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [indice, total, onIndice, onCerrar]);

  if (!total) return null;
  const f = fotos[Math.min(indice, total - 1)];

  const boton = {
    background: "rgba(255,255,255,.1)", border: "none", color: "#fff", borderRadius: 8,
    width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center",
    cursor: "pointer", flexShrink: 0,
  };

  return (
    <div onClick={onCerrar}
      style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(10,12,14,.93)", display: "flex", flexDirection: "column" }}>
      <div onClick={e => e.stopPropagation()}
        style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", color: "#fff", flexShrink: 0 }}>
        {total > 1 && <button onClick={() => onIndice((indice - 1 + total) % total)} style={boton}><ChevronLeft size={20} /></button>}
        <div style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          <strong>{f.titulo || ""}</strong>
          {f.descripcion && <span style={{ opacity: .75 }}> · {f.descripcion}</span>}
          {total > 1 && <span style={{ opacity: .6 }}> · {indice + 1} de {total}</span>}
        </div>
        {total > 1 && <button onClick={() => onIndice((indice + 1) % total)} style={boton}><ChevronRight size={20} /></button>}
        {f.url && <a href={f.url} target="_blank" rel="noreferrer" style={{ ...boton, textDecoration: "none" }}><Download size={17} /></a>}
        <button onClick={onCerrar} style={boton}><X size={20} /></button>
      </div>

      <div onClick={e => e.stopPropagation()}
        style={{ flex: 1, minHeight: 0, padding: "0 14px 14px", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <img src={f.url} alt={f.descripcion || f.titulo || ""}
          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
      </div>

      {total > 1 && (
        <div style={{ textAlign: "center", color: "rgba(255,255,255,.45)", fontSize: 11, paddingBottom: 10 }}>
          ← → para pasar · Esc para cerrar
        </div>
      )}
    </div>
  );
}
