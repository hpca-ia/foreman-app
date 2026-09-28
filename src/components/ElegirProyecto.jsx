import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { colors } from "../theme/colors";

// El proyecto se elige, no se vuelve a escribir.
//
// Los duplicados nacían de escribir el mismo nombre dos veces: una al crear el
// lead y otra al crear el presupuesto o al activar la obra. Terminaban siendo
// dos proyectos, con la mitad del trabajo colgando de cada uno, y ni los
// permisos ni los totales cerraban.
//
// Acá se escribe para buscar: si el proyecto ya existe, sale en la lista y se
// elige. Y si de verdad es nuevo, se crea desde el mismo campo, una sola vez y
// en un solo lugar.

export default function ElegirProyecto({
  value = "",                 // lead_id elegido
  onElegir,                   // ({ id, nombre, nuevo }) => void
  creador = null,             // quién lo crea, si hace falta crearlo
  placeholder = "Buscá el proyecto por su nombre…",
  permitirNinguno = true,
}) {
  const [proyectos, setProyectos] = useState([]);
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [creando, setCreando] = useState(false);
  const caja = useRef(null);

  useEffect(() => {
    supabase.from("leads").select("id,nombre,tunel,resultado").order("nombre")
      .then(({ data }) => setProyectos((data || []).filter(l => l.resultado !== "perdido")));
  }, []);

  // El nombre del elegido manda sobre lo que se esté tecleando.
  const elegido = proyectos.find(p => String(p.id) === String(value));
  const idElegido = elegido?.id;
  const nombreElegido = elegido?.nombre;
  useEffect(() => { if (idElegido) setTexto(nombreElegido); }, [idElegido, nombreElegido]);

  useEffect(() => {
    const fuera = e => { if (caja.current && !caja.current.contains(e.target)) setAbierto(false); };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, []);

  const limpio = t => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const q = limpio(texto).trim();
  const coinciden = q ? proyectos.filter(p => limpio(p.nombre).includes(q)) : proyectos;
  const igualito = proyectos.find(p => limpio(p.nombre).trim() === q);

  async function crear() {
    const nombre = texto.trim();
    if (!nombre || creando) return;
    setCreando(true);
    const { data, error } = await supabase.from("leads").insert({
      nombre, created_by: creador?.id ?? null, actualizado_at: new Date().toISOString(),
    }).select().single();
    setCreando(false);
    if (error || !data) return;
    setProyectos(ps => [...ps, data].sort((a, b) => a.nombre.localeCompare(b.nombre)));
    setAbierto(false);
    onElegir?.({ id: data.id, nombre: data.nombre, nuevo: true });
  }

  const fila = { padding: "7px 9px", fontSize: 12.5, cursor: "pointer", borderTop: `1px solid ${colors.neutralSoft}` };

  return (
    <div ref={caja} style={{ position: "relative" }}>
      <input value={texto} placeholder={placeholder}
        onChange={e => { setTexto(e.target.value); setAbierto(true); }}
        onFocus={() => setAbierto(true)}
        style={{ width: "100%", border: `1px solid ${colors.border}`, borderRadius: 8, padding: "9px 10px",
          fontSize: 13, fontFamily: colors.font, color: colors.ink, background: "#fff", boxSizing: "border-box" }} />

      {abierto && (
        <div style={{ position: "absolute", zIndex: 30, top: "100%", left: 0, right: 0, marginTop: 3,
          background: "#fff", border: `1px solid ${colors.border}`, borderRadius: 8, maxHeight: 230,
          overflowY: "auto", boxShadow: "0 8px 24px rgba(17,24,39,0.12)" }}>

          {permitirNinguno && (
            <div onClick={() => { setTexto(""); setAbierto(false); onElegir?.({ id: null, nombre: "", nuevo: false }); }}
              style={{ ...fila, borderTop: "none", color: colors.muted }}>
              Sin proyecto todavía
            </div>
          )}

          {coinciden.map(p => (
            <div key={p.id} onClick={() => { setTexto(p.nombre); setAbierto(false); onElegir?.({ id: p.id, nombre: p.nombre, nuevo: false }); }}
              style={{ ...fila, color: colors.ink, background: String(p.id) === String(value) ? colors.bg : "#fff" }}>
              {p.nombre}
              <span style={{ fontSize: 10.5, color: colors.muted }}>
                {" · "}{p.resultado === "ganado" ? "proyecto aprobado" : (p.tunel || "lead") === "lead" ? "lead" : "en curso"}
              </span>
            </div>
          ))}

          {!coinciden.length && !texto.trim() && (
            <div style={{ ...fila, color: colors.muted, cursor: "default" }}>Todavía no hay proyectos.</div>
          )}

          {/* Crear, pero solo cuando de verdad no existe: si ya hay uno que se
              llama igual, el camino es elegirlo. */}
          {texto.trim() && !igualito && (
            <div onClick={crear} style={{ ...fila, color: colors.brand, fontWeight: 600 }}>
              {creando ? "Creando…" : `Crear “${texto.trim()}” como proyecto nuevo`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
