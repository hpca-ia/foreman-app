import { useState, useEffect } from "react";
import { UNIDADES, normalizarUnidad, etiquetaUnidad } from "../../lib/unidades";

// Los campos con que se edita un rubro, ahí mismo en la tabla. Los usan Armar
// y Revisar, para que un rubro se edite igual en los dos lados.

const centavos = v => Math.round((Number(v) || 0) * 100) / 100;

// Un precio con dos decimales a la vista. Mientras se escribe se deja
// escribir tal cual —formatear tecla por tecla no deja poner "18"—; al salir
// se redondea a centavos y se guarda así.
export function CampoPrecio({ valor, onCambio, onFoco, onSalir, style }) {
  const [escribiendo, setEscribiendo] = useState(null);
  return (
    <input type="number" className="num-limpio" step="0.01"
      value={escribiendo ?? (Number(valor) || 0).toFixed(2)}
      onFocus={() => { setEscribiendo(String(Number(valor) || 0)); onFoco?.(); }}
      onChange={e => { setEscribiendo(e.target.value); onCambio?.(e.target.value); }}
      onBlur={e => { const v = centavos(e.target.value); setEscribiendo(null); onSalir?.(v); }}
      style={style} />
  );
}

// Un texto de la tabla que se edita ahí mismo: se ve como texto, al tocarlo se
// escribe, y se guarda al salir (Enter también, salvo en la descripción, que
// puede llevar varias líneas; ahí Escape cancela).
export function CampoTexto({ valor, onGuardar, multilinea, titulo, style }) {
  const [texto, setTexto] = useState(valor || "");
  useEffect(() => { setTexto(valor || ""); }, [valor]);
  const guardar = () => { const v = texto.trim(); if (v !== String(valor || "").trim()) onGuardar(v); };
  const base = { width: "100%", boxSizing: "border-box", border: "1px solid transparent", borderRadius: 5, background: "transparent",
    padding: "3px 4px", fontFamily: "var(--font)", outline: "none", resize: "none", ...style };
  const foco = e => { e.target.style.borderColor = "var(--border)"; e.target.style.background = "var(--bg)"; };
  const fuera = e => { e.target.style.borderColor = "transparent"; e.target.style.background = "transparent"; guardar(); };
  if (multilinea) {
    return (
      <textarea value={texto} title={titulo} rows={Math.max(1, Math.ceil(texto.length / 60))}
        onChange={e => setTexto(e.target.value)} onFocus={foco} onBlur={fuera}
        onKeyDown={e => { if (e.key === "Escape") { setTexto(valor || ""); e.currentTarget.blur(); } }}
        style={base} />
    );
  }
  return (
    <input value={texto} title={titulo} onChange={e => setTexto(e.target.value)} onFocus={foco} onBlur={fuera}
      onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setTexto(valor || ""); } }}
      style={base} />
  );
}

// La unidad se elige de la lista de FOREMAN: escrita a mano salían "m2",
// "m²", "M2" y "mt2" para lo mismo, y la base de rubros no los podía comparar.
// Una unidad vieja que no calza con ninguna se muestra para revisarla, sin
// perderla.
export function SelectorUnidad({ valor, onCambiar, grande }) {
  const { canon } = normalizarUnidad(valor);
  const crudo = String(valor || "").trim();
  return (
    <select value={canon || crudo} onChange={e => onCambiar(e.target.value)}
      title={canon ? UNIDADES.find(u => u.id === canon)?.nombre : crudo ? "Unidad sin reconocer: elige una de la lista" : "Elige la unidad"}
      style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${!canon && crudo ? "var(--warning-border)" : grande ? "var(--border)" : "transparent"}`,
        background: !canon && crudo ? "var(--warning-soft)" : grande ? "var(--bg)" : "transparent", borderRadius: grande ? 8 : 5,
        padding: grande ? "9px 10px" : "3px 2px", fontSize: grande ? 13 : 12, color: "var(--ink-soft)", fontFamily: "var(--font)", cursor: "pointer" }}>
      {!canon && <option value={crudo}>{crudo ? `${crudo} (revisar)` : "—"}</option>}
      {UNIDADES.map(u => <option key={u.id} value={u.id}>{etiquetaUnidad(u.id)} · {u.nombre}</option>)}
    </select>
  );
}


// Un número que se escribe con libertad y se guarda al salir (Enter también).
// Mientras se escribe no pasa nada: ni se guarda ni se reordena la tabla.
export function CampoNumero({ valor, onGuardar, decimales = 2, style }) {
  const [escribiendo, setEscribiendo] = useState(null);
  const redondo = v => { const f = 10 ** decimales; return Math.round((Number(v) || 0) * f) / f; };
  return (
    <input type="number" className="num-limpio"
      value={escribiendo ?? redondo(valor)}
      onFocus={() => setEscribiendo(String(redondo(valor)))}
      onChange={e => setEscribiendo(e.target.value)}
      onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setEscribiendo(String(redondo(valor))); } }}
      onBlur={e => { const v = redondo(e.target.value); setEscribiendo(null); if (v !== redondo(valor)) onGuardar(v); }}
      style={style} />
  );
}

// Lo que cambia al poner un precio final: la base no se mueve —es la
// referencia—, la utilidad dice cuánto se apartó. Un rubro que nunca tuvo base
// toma como base el precio que ya tenía, o el primero que se le pone.
export function camposDePrecio(item, v) {
  const antes = centavos(item.precio_unitario);
  v = centavos(v);
  if (v === antes) return null;
  const base = Number(item.precio_base) > 0 ? Number(item.precio_base) : antes > 0 ? antes : v;
  return { precio_unitario: v, precio_base: base, utilidad_pct: base > 0 ? Math.round((v / base - 1) * 10000) / 100 : 0 };
}

// Y al poner la utilidad: el precio final sale de la base.
export function camposDeUtilidad(item, pct) {
  const base = Number(item.precio_base) > 0 ? Number(item.precio_base) : Number(item.precio_unitario) || 0;
  return { utilidad_pct: pct, precio_base: base, precio_unitario: centavos(base * (1 + pct / 100)) };
}
