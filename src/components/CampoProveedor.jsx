import { useEffect, useState, useRef } from "react";
import { Check, AlertTriangle } from "lucide-react";
import { colors } from "../theme/colors";
import { inputStyle } from "./ui/Input";
import { listarProveedores, parecidos, buscarOCrear, nucleo } from "../lib/proveedores";

// El campo del proveedor, el mismo en todas las pantallas.
//
// Se escribe igual que antes —nadie tiene que aprender nada— pero mientras se
// escribe aparecen los que ya existen. Tecleando "kiwy" sale "FERRETERÍA KIWY"
// y se elige de la lista: ahí mueren la mayoría de los duplicados, que nacen de
// volver a tipear algo que ya estaba.
//
// Si lo que quedó escrito se parece a uno guardado pero no es él, lo avisa en
// vez de corregirlo solo. "Comercial Kiwy" y "Ferretería Kiwy" pueden ser dos
// negocios de dos hermanos, y juntar la plata de dos proveedores distintos es
// un error que después nadie encuentra.

export default function CampoProveedor({
  valor, onChange, ruc, onRuc, placeholder = "¿De qué proveedor?",
  estilo, deshabilitado = false, registrar = true,
}) {
  const [lista, setLista] = useState([]);
  const [abierto, setAbierto] = useState(false);
  const [elegido, setElegido] = useState(false);
  const caja = useRef(null);

  useEffect(() => { listarProveedores().then(setLista); }, []);

  // Cerrar al tocar afuera: una lista que tapa el formulario y no se va es
  // peor que no tener lista.
  useEffect(() => {
    const fuera = e => { if (caja.current && !caja.current.contains(e.target)) setAbierto(false); };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, []);

  const sugeridos = abierto ? parecidos(valor, lista) : [];
  const exacto = lista.find(p => nucleo(p.nombre) === nucleo(valor || ""));
  // Se parece a uno guardado, pero no es exactamente ese.
  const casi = !exacto && !elegido && (valor || "").trim().length > 2
    ? parecidos(valor, lista, 1)[0] : null;

  const mini = estilo || { ...inputStyle, padding: "8px 10px", fontSize: 12.5 };

  function tomar(p) {
    onChange(p.nombre);
    if (p.ruc && onRuc) onRuc(p.ruc);
    setElegido(true);
    setAbierto(false);
  }

  // Al salir del campo se guarda en la lista de proveedores, si es nuevo. Sin
  // esto la lista nunca crece y las sugerencias no sirven para la próxima.
  async function alSalir() {
    if (!registrar || !(valor || "").trim()) return;
    const p = await buscarOCrear({ nombre: valor, ruc }, lista);
    if (p && !lista.some(x => x.id === p.id)) setLista(l => [...l, p]);
  }

  return (
    <div ref={caja} style={{ position: "relative" }}>
      <input value={valor || ""} disabled={deshabilitado} placeholder={placeholder} style={mini}
        onChange={e => { onChange(e.target.value); setElegido(false); setAbierto(true); }}
        onFocus={() => setAbierto(true)}
        onBlur={alSalir} />

      {exacto && (
        <Check size={13} color={colors.success}
          style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)" }} />
      )}

      {sugeridos.length > 0 && (
        <div style={{ position: "absolute", zIndex: 40, top: "100%", left: 0, right: 0, marginTop: 2,
          background: "#fff", border: `1px solid ${colors.border}`, borderRadius: 8,
          boxShadow: "0 6px 18px rgba(0,0,0,.12)", maxHeight: 180, overflowY: "auto" }}>
          {sugeridos.map(p => (
            <button key={p.id} type="button" onMouseDown={e => { e.preventDefault(); tomar(p); }}
              style={{ width: "100%", textAlign: "left", background: "none", border: "none",
                borderBottom: `1px solid ${colors.neutralSoft}`, padding: "7px 10px", cursor: "pointer",
                fontFamily: colors.font, fontSize: 12.5, color: colors.ink }}>
              {p.nombre}
              {p.ruc && <span style={{ color: colors.muted, fontSize: 10.5 }}> · {p.ruc}</span>}
            </button>
          ))}
        </div>
      )}

      {/* Se avisa; no se corrige solo. */}
      {casi && !abierto && (
        <div style={{ marginTop: 4, fontSize: 10.5, color: colors.warning, display: "flex", alignItems: "center", gap: 4 }}>
          <AlertTriangle size={10} />
          ¿Es <button type="button" onClick={() => tomar(casi)}
            style={{ background: "none", border: "none", padding: 0, color: colors.warning, fontWeight: 700,
              textDecoration: "underline", cursor: "pointer", fontFamily: colors.font, fontSize: 10.5 }}>
            {casi.nombre}
          </button>? Si no, dejalo como está.
        </div>
      )}
    </div>
  );
}
