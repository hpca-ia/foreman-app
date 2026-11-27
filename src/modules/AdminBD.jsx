import { useState, useEffect } from "react";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { inputStyle } from "../components/ui/Input";
import Button from "../components/ui/Button";
import DuplicadosRubros from "./presupuestos/DuplicadosRubros";

export default function AdminBD({ onVolver, currentUser }) {
  const [tab, setTab] = useState("rubros"); // rubros | capitulos | duplicados
  const [capitulos, setCapitulos] = useState([]);
  const [rubros, setRubros] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [filtroCapitulo, setFiltroCapitulo] = useState("");
  const [editRubro, setEditRubro] = useState(null);
  const [editCapitulo, setEditCapitulo] = useState(null);
  const [nuevoCapNombre, setNuevoCapNombre] = useState("");
  const [page, setPage] = useState(0);
  const PER_PAGE = 40;

  useEffect(() => { fetchCapitulos(); }, []);
  useEffect(() => { fetchRubros(); setPage(0); }, [busqueda, filtroCapitulo]);

  async function fetchCapitulos() {
    const { data } = await supabase.from("capitulos").select("*, rubros(count)").order("nombre");
    setCapitulos(data || []);
  }
  async function fetchRubros() {
    let q = supabase.from("rubros").select("*, capitulos(nombre,id)").eq("activo", true);
    if (busqueda) q = q.ilike("descripcion", `%${busqueda}%`);
    if (filtroCapitulo) q = q.eq("capitulo_id", filtroCapitulo);
    const { data } = await q.order("descripcion").range(page * PER_PAGE, (page + 1) * PER_PAGE - 1);
    setRubros(data || []);
  }
  async function saveCapitulo(cap) {
    await supabase.from("capitulos").update({ nombre: cap.nombre, orden: cap.orden }).eq("id", cap.id);
    setEditCapitulo(null); fetchCapitulos();
  }
  async function deleteCapitulo(id) {
    if (!window.confirm("¿Eliminar este capítulo? Los rubros asociados quedarán sin capítulo.")) return;
    await supabase.from("capitulos").delete().eq("id", id);
    fetchCapitulos();
  }
  async function addCapitulo() {
    if (!nuevoCapNombre.trim()) return;
    await supabase.from("capitulos").insert({ nombre: nuevoCapNombre.trim(), orden: capitulos.length + 1 });
    setNuevoCapNombre(""); fetchCapitulos();
  }

  async function saveRubro(r) {
    await supabase.from("rubros").update({
      descripcion: r.descripcion, unidad: r.unidad,
      precio_referencia: Number(r.precio_referencia),
      capitulo_id: r.capitulo_id || null,
    }).eq("id", r.id);
    setEditRubro(null); fetchRubros();
  }
  async function deleteRubro(id) {
    if (!window.confirm("¿Eliminar este rubro de la base de datos?")) return;
    await supabase.from("rubros").update({ activo: false }).eq("id", id);
    fetchRubros();
  }
  const fmt = n => (Number(n) || 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const tabS = a => ({ padding: "7px 16px", border: "none", borderBottom: a ? "2px solid var(--brand)" : "2px solid transparent", background: "transparent", color: a ? "var(--brand)" : "var(--ink-soft)", fontSize: 12, fontWeight: a ? 600 : 400, cursor: "pointer", fontFamily: "var(--font)" });
  const iconBtn = { background: "var(--neutral-soft)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "4px 8px", color: "var(--ink-soft)", cursor: "pointer", display: "inline-flex" };
  const deleteBtn = { background: "var(--danger-soft)", border: "1px solid var(--danger-border)", borderRadius: "var(--radius-sm)", padding: "4px 8px", color: "var(--danger)", cursor: "pointer", display: "inline-flex" };

  return (
    <div style={{ fontFamily: "var(--font)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <Button variant="secondary" size="sm" onClick={onVolver}><ArrowLeft size={13} /> Volver</Button>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>Administrar base de datos</div>
      </div>

      <div style={{ display: "flex", borderBottom: "1px solid var(--border)", marginBottom: 16 }}>
        <button onClick={() => setTab("rubros")} style={tabS(tab === "rubros")}>Rubros</button>
        <button onClick={() => setTab("capitulos")} style={tabS(tab === "capitulos")}>Capítulos</button>
        <button onClick={() => setTab("duplicados")} style={tabS(tab === "duplicados")}>Duplicados</button>
        <button onClick={() => setTab("respaldo")} style={tabS(tab === "respaldo")}>Respaldo</button>
      </div>

      {tab === "respaldo" && <Respaldo />}

      {tab === "rubros" && (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar rubro..." style={{ ...inputStyle, flex: 1 }} />
            <select value={filtroCapitulo} onChange={e => setFiltroCapitulo(e.target.value)} style={{ ...inputStyle, width: "auto", flexShrink: 0 }}>
              <option value="">Todos los capítulos</option>
              {capitulos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8 }}>Mostrando {rubros.length} rubros · <button onClick={() => { setPage(p => Math.max(0, p - 1)); fetchRubros(); }} style={{ background: "none", border: "none", color: "var(--brand)", cursor: "pointer", fontSize: 11 }}>◀ Ant</button> pág {page + 1} <button onClick={() => { setPage(p => p + 1); fetchRubros(); }} style={{ background: "none", border: "none", color: "var(--brand)", cursor: "pointer", fontSize: 11 }}>Sig ▶</button></div>

          {rubros.map(r => (
            <div key={r.id} style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "10px 12px", marginBottom: 6 }}>
              {editRubro?.id === r.id ? (
                <div style={{ display: "grid", gap: 8 }}>
                  <input value={editRubro.descripcion} onChange={e => setEditRubro(p => ({ ...p, descripcion: e.target.value }))} style={inputStyle} placeholder="Descripción" />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                    <input value={editRubro.unidad || ""} onChange={e => setEditRubro(p => ({ ...p, unidad: e.target.value }))} style={inputStyle} placeholder="Unidad" />
                    <input type="number" value={editRubro.precio_referencia || ""} onChange={e => setEditRubro(p => ({ ...p, precio_referencia: e.target.value }))} style={inputStyle} placeholder="Precio ref." />
                    <select value={editRubro.capitulo_id || ""} onChange={e => setEditRubro(p => ({ ...p, capitulo_id: e.target.value }))} style={inputStyle}>
                      <option value="">Sin capítulo</option>
                      {capitulos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Button variant="primary" size="sm" style={{ flex: 2 }} onClick={() => saveRubro(editRubro)}>Guardar</Button>
                    <Button variant="secondary" size="sm" style={{ flex: 1 }} onClick={() => setEditRubro(null)}>Cancelar</Button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>{r.descripcion}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{r.capitulos?.nombre || "Sin capítulo"} · {r.unidad}</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0, marginRight: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--brand)" }}>${fmt(r.precio_referencia)}</div>
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => setEditRubro({ ...r, capitulo_id: r.capitulos?.id || "" })} style={iconBtn}><Pencil size={13} /></button>
                    <button onClick={() => deleteRubro(r.id)} style={deleteBtn}><Trash2 size={13} /></button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "capitulos" && (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input value={nuevoCapNombre} onChange={e => setNuevoCapNombre(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addCapitulo()}
              placeholder="Nuevo capítulo..." style={{ ...inputStyle, flex: 1 }} />
            <Button variant="primary" onClick={addCapitulo} disabled={!nuevoCapNombre.trim()}>+ Agregar</Button>
          </div>

          {capitulos.map(c => (
            <div key={c.id} style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "10px 12px", marginBottom: 6 }}>
              {editCapitulo?.id === c.id ? (
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                    <input value={editCapitulo.nombre} onChange={e => setEditCapitulo(p => ({ ...p, nombre: e.target.value }))} style={inputStyle} />
                    <input type="number" value={editCapitulo.orden} onChange={e => setEditCapitulo(p => ({ ...p, orden: e.target.value }))} style={{ ...inputStyle, width: 60 }} placeholder="Orden" />
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Button variant="primary" size="sm" style={{ flex: 2 }} onClick={() => saveCapitulo(editCapitulo)}>Guardar</Button>
                    <Button variant="secondary" size="sm" style={{ flex: 1 }} onClick={() => setEditCapitulo(null)}>Cancelar</Button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>{c.orden}. {c.nombre}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{c.rubros?.[0]?.count || 0} rubros</div>
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => setEditCapitulo({ ...c })} style={iconBtn}><Pencil size={13} /></button>
                    <button onClick={() => deleteCapitulo(c.id)} style={deleteBtn}><Trash2 size={13} /></button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "duplicados" && <DuplicadosRubros currentUser={currentUser} />}
    </div>
  );
}

// Sacar una copia de todo, ahora mismo.
//
// Cada noche se hace sola (ver api/cron-respaldo.js). Este botón sirve para
// comprobar que está bien configurada sin esperar a la madrugada, y para
// tener una copia fresca antes de tocar algo delicado.
function Respaldo() {
  const [trabajando, setTrabajando] = useState(false);
  const [r, setR] = useState(null);
  const [error, setError] = useState("");

  async function respaldar(conCorreo) {
    setTrabajando(true); setError(""); setR(null);
    try {
      const res = await fetch("/api/respaldo", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ correo: conCorreo }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setError(d.error || `El servidor respondió ${res.status}`);
      else setR(d);
    } catch (e) {
      setError("No se pudo hablar con el servidor: " + e.message);
    } finally { setTrabajando(false); }
  }

  const caja = { background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "14px 16px", marginBottom: 10 };
  return (
    <div>
      <div style={caja}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>Copia de seguridad</div>
        <div style={{ fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.5 }}>
          Cada madrugada FOREMAN saca una copia de la base entera y la guarda en Dropbox, fuera de Supabase. Los archivos
          —facturas, logos, adjuntos— se van copiando de a poco. Los lunes, además, la copia llega por correo.
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <Button size="sm" onClick={() => respaldar(false)} disabled={trabajando}>{trabajando ? "Respaldando…" : "Respaldar ahora"}</Button>
          <Button size="sm" variant="secondary" onClick={() => respaldar(true)} disabled={trabajando}>Respaldar y mandármelo por correo</Button>
        </div>
      </div>

      {error && <div style={{ ...caja, borderColor: "var(--danger)", color: "var(--danger)", fontSize: 13 }}>{error}</div>}

      {r && (
        <div style={caja}>
          <div style={{ fontSize: 13, fontWeight: 700, color: r.ok ? "var(--success)" : "var(--warning)", marginBottom: 6 }}>
            {r.ok ? "✓ Respaldo hecho" : "Respaldo hecho, con avisos"} · {r.segundos}s
          </div>
          {r.paso?.map((p, i) => <div key={i} style={{ fontSize: 12, color: "var(--ink-soft)", padding: "2px 0" }}>• {p}</div>)}
          {r.correo && r.correo !== "no" && <div style={{ fontSize: 12, color: "var(--ink-soft)", padding: "2px 0" }}>• Correo {r.correo}</div>}
          {[...(r.problemas || []), ...(r.avisos || [])].map((p, i) => (
            <div key={i} style={{ fontSize: 12, color: "var(--warning)", padding: "2px 0" }}>• {p}</div>
          ))}
        </div>
      )}
    </div>
  );
}
