import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { colors } from "../../theme/colors";
import { agrupar } from "./datosExportacion";

// Las notas y condiciones de un presupuesto. El catálogo es de la oficina y
// lo llena la oficina; cada presupuesto elige cuáles lleva.
//
// Cambiar el texto de una nota pregunta para quién: una corrección de
// redacción es para todos, pero "anticipo del 30 %" para un cliente puntual
// no tiene por qué cambiarle el contrato a los demás.

export default function NotasExportacion({ catalogo, sinBase, marcadas, onAlternar, textos, onTextoDoc, onGuardarEnCatalogo, onRetirar, onAgregar, particulares, onParticulares }) {
  const [editando, setEditando] = useState(null);      // { id, texto, marcada }
  const [agregando, setAgregando] = useState(null);    // { grupo, grupoNuevo, texto, marcada }
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState("");

  const grupos = agrupar(catalogo);
  const textoDe = nota => textos[nota.id] ?? nota.texto;

  const campo = { width: "100%", boxSizing: "border-box", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: "7px 9px", fontSize: 12, fontFamily: colors.font, color: colors.ink, outline: "none", lineHeight: 1.45 };
  const enlace = (fuerte) => ({ background: "none", border: "none", color: fuerte ? colors.ink : colors.muted, fontWeight: fuerte ? 600 : 400, fontSize: 11, cursor: "pointer", padding: 0, fontFamily: colors.font });

  // Pase lo que pase, el panel no queda trabado en "trabajando".
  async function hacer(fn) {
    setTrabajando(true); setError("");
    let r;
    try { r = await fn(); } catch (e) { r = "Algo falló: " + (e?.message || e); }
    finally { setTrabajando(false); }
    if (r) setError(r);
    return !r;
  }

  async function guardarParaTodos() {
    const nota = catalogo.find(x => x.id === editando.id);
    const ok = await hacer(() => onGuardarEnCatalogo({ ...nota, texto: editando.texto.trim(), marcada: editando.marcada }));
    if (ok) { onTextoDoc(editando.id, null); setEditando(null); }
  }
  function soloAqui() {
    const nota = catalogo.find(x => x.id === editando.id);
    onTextoDoc(editando.id, editando.texto.trim() === nota.texto ? null : editando.texto.trim());
    setEditando(null);
  }
  async function retirar() {
    if (!window.confirm("¿Retirar esta nota del catálogo? Deja de ofrecerse en los presupuestos nuevos; los ya exportados no cambian.")) return;
    const ok = await hacer(() => onRetirar(editando.id));
    if (ok) setEditando(null);
  }
  async function agregar() {
    const grupo = (agregando.grupo === "__nuevo" ? agregando.grupoNuevo : agregando.grupo).trim();
    if (!grupo || !agregando.texto.trim()) return;
    const ok = await hacer(() => onAgregar({ grupo, texto: agregando.texto.trim(), marcada: agregando.marcada }));
    if (ok) setAgregando(null);
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {sinBase && (
        <div style={{ fontSize: 11, color: colors.warning, background: colors.warningSoft, border: `1px solid ${colors.warningBorder}`, borderRadius: colors.radiusSm, padding: "6px 8px" }}>
          Falta correr la migración 026: por ahora son las notas de fábrica y los cambios valen solo para este presupuesto.
        </div>
      )}
      {error && <div style={{ fontSize: 11, color: colors.danger }}>{error}</div>}

      {grupos.map(g => (
        <div key={g.titulo}>
          <div style={{ fontSize: 11, fontWeight: 600, color: colors.inkSoft, marginBottom: 4 }}>{g.titulo}</div>
          <div style={{ display: "grid", gap: 4 }}>
            {g.notas.map(nota => {
              const activa = marcadas.includes(nota.id);
              const propia = textos[nota.id] != null;
              if (editando?.id === nota.id) {
                return (
                  <div key={nota.id} style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 8 }}>
                    <textarea autoFocus value={editando.texto} onChange={e => setEditando(x => ({ ...x, texto: e.target.value }))} rows={3} style={{ ...campo, background: colors.surface, resize: "vertical" }} />
                    {!sinBase && (
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: colors.inkSoft, margin: "6px 0", cursor: "pointer" }}>
                        <input type="checkbox" checked={editando.marcada} onChange={e => setEditando(x => ({ ...x, marcada: e.target.checked }))} />
                        Viene marcada en los presupuestos nuevos
                      </label>
                    )}
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginTop: 4 }}>
                      {!sinBase && <button onClick={guardarParaTodos} disabled={trabajando || !editando.texto.trim()} style={enlace(true)}>Guardar para toda la oficina</button>}
                      <button onClick={soloAqui} disabled={!editando.texto.trim()} style={enlace(sinBase)}>Solo en este presupuesto</button>
                      <button onClick={() => setEditando(null)} style={enlace(false)}>Cancelar</button>
                      {!sinBase && <button onClick={retirar} disabled={trabajando} style={{ ...enlace(false), color: colors.danger, marginLeft: "auto" }}>Retirar del catálogo</button>}
                    </div>
                  </div>
                );
              }
              return (
                <div key={nota.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, color: activa ? colors.ink : colors.muted, lineHeight: 1.4 }}>
                  <input type="checkbox" checked={activa} onChange={() => onAlternar(nota.id)} style={{ marginTop: 3, flexShrink: 0 }} />
                  <span style={{ flex: 1, cursor: "pointer" }} onClick={() => onAlternar(nota.id)}>
                    {textoDe(nota)}
                    {propia && <span style={{ color: colors.muted, fontStyle: "italic" }}> (cambiada en este presupuesto)</span>}
                  </span>
                  <button onClick={() => setEditando({ id: nota.id, texto: textoDe(nota), marcada: !!nota.marcada })} title="Cambiar el texto"
                    style={{ background: "none", border: "none", color: colors.muted, cursor: "pointer", padding: 2, display: "flex", flexShrink: 0 }}><Pencil size={12} /></button>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {!sinBase && (agregando ? (
        <div style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 8, display: "grid", gap: 6 }}>
          <div style={{ display: "grid", gridTemplateColumns: agregando.grupo === "__nuevo" ? "1fr 1fr" : "1fr", gap: 6 }}>
            <select value={agregando.grupo} onChange={e => setAgregando(x => ({ ...x, grupo: e.target.value }))} style={{ ...campo, background: colors.surface }}>
              {grupos.map(g => <option key={g.titulo} value={g.titulo}>{g.titulo}</option>)}
              <option value="__nuevo">Grupo nuevo…</option>
            </select>
            {agregando.grupo === "__nuevo" && <input autoFocus value={agregando.grupoNuevo} onChange={e => setAgregando(x => ({ ...x, grupoNuevo: e.target.value }))} placeholder="Nombre del grupo" style={{ ...campo, background: colors.surface }} />}
          </div>
          <textarea autoFocus={agregando.grupo !== "__nuevo"} value={agregando.texto} onChange={e => setAgregando(x => ({ ...x, texto: e.target.value }))} rows={3}
            placeholder="Texto de la nota, como va a salir en el documento" style={{ ...campo, background: colors.surface, resize: "vertical" }} />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: colors.inkSoft, cursor: "pointer" }}>
            <input type="checkbox" checked={agregando.marcada} onChange={e => setAgregando(x => ({ ...x, marcada: e.target.checked }))} />
            Viene marcada en los presupuestos nuevos
          </label>
          <div style={{ display: "flex", gap: 12 }}>
            <button onClick={agregar} disabled={trabajando || !agregando.texto.trim() || (agregando.grupo === "__nuevo" && !agregando.grupoNuevo.trim())} style={enlace(true)}>Agregar al catálogo</button>
            <button onClick={() => setAgregando(null)} style={enlace(false)}>Cancelar</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAgregando({ grupo: grupos[0]?.titulo || "__nuevo", grupoNuevo: "", texto: "", marcada: false })}
          style={{ ...enlace(true), display: "flex", alignItems: "center", gap: 4 }}>
          <Plus size={12} /> Agregar una nota al catálogo
        </button>
      ))}

      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: colors.inkSoft, marginBottom: 4 }}>Solo de este presupuesto</div>
        <textarea value={particulares} onChange={e => onParticulares(e.target.value)} rows={3}
          placeholder="Plazo de esta obra, qué no incluye, acuerdos con el cliente… Una nota por línea."
          style={{ ...campo, resize: "vertical" }} />
      </div>
    </div>
  );
}
