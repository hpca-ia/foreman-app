import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { empezarArrastre, terminarArrastre } from "./arrastre";

// TRAER RUBROS O CAPÍTULOS DE OTRO PRESUPUESTO.
//
// Un panel al costado con otro presupuesto abierto. Sus capítulos y rubros se
// arrastran a un capítulo del que se está trabajando —o se traen con el
// botón, que en un teléfono es lo único que anda—. Se copian; el otro no se
// toca. Se pueden marcar varios rubros y traerlos juntos.

const fmt = v => (Number(v) || 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const normal = t => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export default function TraerDeOtro({ actualId, presupuestos = [], capitulosDestino = [], onTraerRubros, onTraerCapitulo, onCerrar }) {
  const [busca, setBusca] = useState("");
  const [elegido, setElegido] = useState(null);
  const [items, setItems] = useState([]);
  const [orden, setOrden] = useState([]);       // nombres de capítulo en su orden
  const [abiertos, setAbiertos] = useState(() => new Set());
  const [marcados, setMarcados] = useState(() => new Set());
  const [destino, setDestino] = useState("");
  const [cargando, setCargando] = useState(false);
  const [aviso, setAviso] = useState("");

  // Y SE CIERRA CON ESCAPE. Una pantalla que se abre encima de otra se cierra
  // con Escape en todos lados; acá, además, es el seguro de que siempre haya
  // una salida aunque algo tape el botón.
  useEffect(() => {
    const alTecla = e => { if (e.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", alTecla);
    return () => window.removeEventListener("keydown", alTecla);
  }, [onCerrar]);

  const lista = useMemo(() => presupuestos
    .filter(p => p.id !== actualId && !p.archivado_at)
    .filter(p => !busca.trim() || normal(`${p.nombre} ${p.cliente_nombre || ""}`).includes(normal(busca)))
    .slice(0, 60), [presupuestos, actualId, busca]);

  useEffect(() => {
    if (!elegido) return;
    let vivo = true;
    setCargando(true); setItems([]); setOrden([]); setMarcados(new Set()); setAbiertos(new Set());
    (async () => {
      const [{ data: its }, { data: pre }] = await Promise.all([
        supabase.from("presupuesto_items").select("*").eq("presupuesto_id", elegido.id).order("orden"),
        supabase.from("presupuestos").select("capitulos").eq("id", elegido.id).maybeSingle(),
      ]);
      if (!vivo) return;
      const delOtro = its || [];
      // El orden de sus capítulos: el guardado, y lo que falte, como aparece.
      const guardado = Array.isArray(pre?.capitulos) ? [...pre.capitulos].sort((a, b) => (a.orden || 0) - (b.orden || 0)).map(c => c.nombre) : [];
      const deRubros = [...new Set(delOtro.map(i => i.capitulo))];
      setOrden([...guardado.filter(c => deRubros.includes(c)), ...deRubros.filter(c => !guardado.includes(c))]);
      setItems(delOtro);
      setCargando(false);
    })();
    return () => { vivo = false; };
  }, [elegido]);

  // El destino de los botones: el capítulo con el mismo nombre si existe, si
  // no el que se eligió arriba.
  const destinoPara = cap => capitulosDestino.find(c => c.nombre === cap)?.nombre || destino || capitulosDestino[0]?.nombre || "";

  const rubrosDe = cap => items.filter(i => i.capitulo === cap);
  const marcadosLista = items.filter(i => marcados.has(i.id));
  const alternar = id => setMarcados(m => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const avisar = t => { setAviso(t); setTimeout(() => setAviso(""), 3500); };

  async function traerRubros(rubros, cap) {
    const a = cap || destinoPara(rubros[0]?.capitulo);
    if (!a) { avisar("Primero creá un capítulo en este presupuesto, o traé uno entero."); return; }
    await onTraerRubros(a, rubros);
    setMarcados(new Set());
    avisar(`${rubros.length === 1 ? "1 rubro" : `${rubros.length} rubros`} copiado${rubros.length === 1 ? "" : "s"} a ${a}.`);
  }
  async function traerCapitulo(cap) {
    await onTraerCapitulo(cap, rubrosDe(cap));
    avisar(`${cap} copiado, con ${rubrosDe(cap).length} rubros.`);
  }

  // Arrastrar uno marcado arrastra todos los marcados: es como se mueven
  // varios archivos en cualquier computadora.
  const arrastrarRubro = (e, r) => empezarArrastre(e, {
    tipo: "rubros", desde: elegido?.nombre,
    rubros: marcados.has(r.id) && marcados.size > 1 ? marcadosLista : [r],
  });

  const boton = { background: "#fff", border: "1px solid var(--border)", borderRadius: 6, padding: "3px 8px",
    fontSize: 11, color: "var(--brand)", fontWeight: 600, cursor: "pointer", fontFamily: "var(--font)", whiteSpace: "nowrap" };

  return (
    <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(400px, 94vw)", zIndex: 250,
      background: "#fff", borderLeft: "1px solid var(--border)", boxShadow: "-12px 0 32px rgba(0,0,0,0.12)",
      display: "flex", flexDirection: "column", fontFamily: "var(--font)" }}>
      <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", display: "grid", gap: 8 }}>
        {/* EL TÍTULO NO PUEDE EMPUJAR A LA SALIDA FUERA DE LA PANTALLA.
            Sin `minWidth: 0`, un nombre largo —y los presupuestos tienen
            nombres largos— no se encoge: estira la fila, y el "← otro" y la ×
            se van por el borde derecho del panel, donde no se los ve ni se
            los puede apretar. El panel quedaba abierto sin forma de cerrarlo.
            Ahora el nombre se corta con puntos suspensivos y la salida no se
            mueve de su lugar. */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div title={elegido?.nombre || ""}
            style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", flex: 1, minWidth: 0,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {elegido ? <>De <span style={{ color: "var(--brand)" }}>{elegido.nombre}</span></> : "Traer de otro presupuesto"}
          </div>
          {elegido && <button onClick={() => setElegido(null)} style={{ ...boton, color: "var(--ink-soft)", flexShrink: 0 }}>← otro</button>}
          <button onClick={onCerrar} title="Cerrar (Esc)"
            style={{ background: "var(--neutral-soft)", border: "none", borderRadius: 6, width: 28, height: 28,
              cursor: "pointer", fontSize: 15, color: "var(--ink-soft)", flexShrink: 0 }}>×</button>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.45 }}>
          {elegido
            ? "Arrastrá un rubro o un capítulo al capítulo donde va, o usá los botones. Se copia: el otro presupuesto no cambia."
            : "Elegí de qué presupuesto traer rubros o capítulos."}
        </div>
        {!elegido ? (
          <input value={busca} onChange={e => setBusca(e.target.value)} autoFocus placeholder="Buscar por nombre o cliente"
            style={{ width: "100%", boxSizing: "border-box", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "var(--font)", outline: "none" }} />
        ) : (
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--ink-soft)" }}>
            Los botones copian a
            <select value={destino} onChange={e => setDestino(e.target.value)}
              style={{ flex: 1, minWidth: 0, border: "1px solid var(--border)", borderRadius: 6, padding: "4px 6px", fontSize: 11.5, fontFamily: "var(--font)" }}>
              <option value="">el capítulo del mismo nombre (o el primero)</option>
              {capitulosDestino.map(c => <option key={c.nombre} value={c.nombre}>{c.orden}. {c.nombre}</option>)}
            </select>
          </label>
        )}
        {elegido && marcados.size > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--brand-soft)", borderRadius: 8, padding: "6px 9px", fontSize: 12 }}>
            <span style={{ flex: 1 }}><strong>{marcados.size}</strong> marcados — arrastrá uno y van todos</span>
            <button onClick={() => traerRubros(marcadosLista, destino || null)} style={boton}>Traer</button>
            <button onClick={() => setMarcados(new Set())} style={{ ...boton, color: "var(--muted)" }}>Desmarcar</button>
          </div>
        )}
        {aviso && <div style={{ fontSize: 12, color: "var(--success, #15803d)" }}>✓ {aviso}</div>}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "6px 0", minHeight: 0 }}>
        {!elegido && lista.map(p => (
          <button key={p.id} onClick={() => setElegido(p)}
            style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", borderBottom: "1px solid var(--neutral-soft)", padding: "9px 14px", cursor: "pointer", fontFamily: "var(--font)" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{p.nombre}</div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>{p.cliente_nombre || "Sin cliente"}{Number(p.total) ? ` · $${fmt(p.total)}` : ""}</div>
          </button>
        ))}
        {!elegido && !lista.length && <div style={{ padding: 14, fontSize: 12, color: "var(--muted)" }}>No hay otros presupuestos{busca ? " con ese nombre" : ""}.</div>}

        {elegido && cargando && <div style={{ padding: 14, fontSize: 12, color: "var(--muted)" }}>Cargando…</div>}
        {elegido && !cargando && !orden.length && <div style={{ padding: 14, fontSize: 12, color: "var(--muted)" }}>Ese presupuesto no tiene rubros.</div>}
        {elegido && !cargando && orden.map((cap, k) => {
          const suyos = rubrosDe(cap);
          const abierto = abiertos.has(cap);
          const total = suyos.reduce((s, r) => s + (Number(r.total) || 0), 0);
          return (
            <div key={cap} style={{ borderBottom: "1px solid var(--neutral-soft)" }}>
              <div draggable onDragStart={e => empezarArrastre(e, { tipo: "capitulo", nombre: cap, rubros: suyos, desde: elegido.nombre })}
                onDragEnd={terminarArrastre} title="Arrastralo a la lista de capítulos o a un capítulo"
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", background: "var(--brand-soft)", cursor: "grab" }}>
                <button onClick={() => setAbiertos(a => { const n = new Set(a); if (n.has(cap)) n.delete(cap); else n.add(cap); return n; })}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--brand)", fontSize: 11, padding: 0, width: 14 }}>{abierto ? "▾" : "▸"}</button>
                <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, color: "var(--brand)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={cap}>
                  ⠿ {k + 1}. {cap} <span style={{ fontWeight: 400, opacity: 0.7 }}>({suyos.length})</span>
                </span>
                <span style={{ fontSize: 11, color: "var(--ink-soft)" }}>${fmt(total)}</span>
                <button onClick={() => traerCapitulo(cap)} title="Copiar el capítulo entero a este presupuesto" style={boton}>+ Capítulo</button>
              </div>
              {abierto && suyos.map(r => (
                <div key={r.id} draggable onDragStart={e => arrastrarRubro(e, r)} onDragEnd={terminarArrastre}
                  title={`${r.descripcion}\nArrastralo al capítulo donde va`}
                  style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 12px 6px 18px", cursor: "grab",
                    background: marcados.has(r.id) ? "var(--brand-soft)" : "transparent", borderTop: "1px solid var(--neutral-soft)" }}>
                  <input type="checkbox" checked={marcados.has(r.id)} onChange={() => alternar(r.id)} onClick={e => e.stopPropagation()} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 12, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.descripcion}</span>
                    <span style={{ fontSize: 10.5, color: "var(--muted)" }}>{Number(r.cantidad) || 0} {r.unidad} × ${fmt(r.precio_unitario)}{r.extra ? " · extra" : ""}</span>
                  </span>
                  <button onClick={() => traerRubros([r], destino || null)} title={`Copiar a ${destinoPara(r.capitulo) || "un capítulo"}`} style={{ ...boton, padding: "2px 7px" }}>+</button>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* LA SALIDA, TAMBIÉN ABAJO. Después de bajar por treinta rubros, la ×
          del encabezado quedó arriba de todo: cerrar no debería costar un
          scroll de vuelta. */}
      <div style={{ borderTop: "1px solid var(--border)", padding: "9px 14px" }}>
        <button onClick={onCerrar}
          style={{ width: "100%", background: "var(--neutral-soft)", border: "none", borderRadius: 8,
            padding: "8px 0", fontSize: 12.5, fontWeight: 600, color: "var(--ink-soft)",
            cursor: "pointer", fontFamily: "var(--font)" }}>
          Cerrar
        </button>
      </div>
    </div>
  );
}
