import { useState, useEffect } from "react";
import { ArrowLeft, Pencil, Trash2, CheckCircle2, Search } from "lucide-react";
import { supabase } from "../lib/supabase";
import { inputStyle } from "../components/ui/Input";
import Button from "../components/ui/Button";

export default function AdminBD({ onVolver }) {
  const [tab, setTab] = useState("rubros"); // rubros | capitulos | duplicados
  const [capitulos, setCapitulos] = useState([]);
  const [rubros, setRubros] = useState([]);
  const [duplicados, setDuplicados] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [filtroCapitulo, setFiltroCapitulo] = useState("");
  const [editRubro, setEditRubro] = useState(null);
  const [editCapitulo, setEditCapitulo] = useState(null);
  const [nuevoCapNombre, setNuevoCapNombre] = useState("");
  const [loadingDups, setLoadingDups] = useState(false);
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
  async function buscarDuplicados() {
    setLoadingDups(true);
    const { data: todos } = await supabase.from("rubros").select("id,descripcion,unidad,precio_referencia,capitulos(nombre)").eq("activo", true).order("descripcion");
    if (!todos) { setLoadingDups(false); return; }
    const groups = {};
    todos.forEach(r => {
      const key = r.descripcion.toLowerCase().trim().slice(0, 25);
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });
    const dups = Object.values(groups).filter(g => g.length > 1);
    setDuplicados(dups);
    setLoadingDups(false);
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
  async function mergeDuplicados(keep, deleteIds) {
    for (const id of deleteIds) {
      await supabase.from("precios_historial").update({ rubro_id: keep }).eq("rubro_id", id);
      await supabase.from("rubros").update({ activo: false }).eq("id", id);
    }
    fetchRubros(); buscarDuplicados();
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
        <button onClick={() => { setTab("duplicados"); buscarDuplicados(); }} style={tabS(tab === "duplicados")}>Duplicados</button>
      </div>

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

      {tab === "duplicados" && (
        <div>
          {loadingDups ? <div style={{ textAlign: "center", padding: "40px 0", color: "var(--muted)", fontSize: 13, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}><Search size={24} /> Analizando duplicados...</div>
            : duplicados.length === 0 ? <div style={{ textAlign: "center", padding: "40px 0", color: "var(--muted)", fontSize: 13, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}><CheckCircle2 size={28} color="var(--success)" />Sin duplicados detectados.</div>
              : <div>
                <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 12 }}>Se encontraron <strong>{duplicados.length}</strong> grupos con rubros similares. Selecciona cuál conservar y cuál eliminar.</div>
                {duplicados.map((grupo, gi) => (
                  <div key={gi} style={{ background: "#fff", border: "1.5px solid var(--border)", borderRadius: "var(--radius-md)", padding: 14, marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--brand)", marginBottom: 10 }}>Grupo {gi + 1} — {grupo.length} rubros similares</div>
                    {grupo.map((r, ri) => (
                      <div key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", background: ri === 0 ? "var(--success-soft)" : "var(--brand-soft)", borderRadius: "var(--radius-sm)", marginBottom: 6, border: `1px solid ${ri === 0 ? "var(--success-border)" : "var(--border)"}` }}>
                        <div style={{ flex: 1 }}>
                          {ri === 0 && <div style={{ fontSize: 9, fontWeight: 700, color: "var(--success)", letterSpacing: 1, marginBottom: 2 }}>CONSERVAR</div>}
                          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--ink)" }}>{r.descripcion}</div>
                          <div style={{ fontSize: 10, color: "var(--muted)" }}>{r.capitulos?.nombre} · {r.unidad} · ${fmt(r.precio_referencia)}</div>
                        </div>
                        <div style={{ display: "flex", gap: 4, marginLeft: 8 }}>
                          {ri !== 0 && <button onClick={() => mergeDuplicados(grupo[0].id, [r.id])} style={{ ...deleteBtn, whiteSpace: "nowrap" }}>Eliminar</button>}
                          {ri === 0 && grupo.length > 1 && <button onClick={() => mergeDuplicados(grupo[0].id, grupo.slice(1).map(x => x.id))} style={{ background: "var(--success)", border: "none", borderRadius: "var(--radius-sm)", padding: "4px 10px", color: "#fff", fontSize: 11, cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}>Fusionar todos</button>}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>}
        </div>
      )}
    </div>
  );
}
