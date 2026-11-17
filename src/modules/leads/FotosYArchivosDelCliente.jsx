import { useState, useRef } from "react";
import { Paperclip, X, FileText } from "lucide-react";
import { colors } from "../../theme/colors";
import { abrirArchivo } from "../../lib/archivos";
import { esFoto, cuantosDice } from "./archivosDelCliente.js";
import { subirParaElCliente, quitarArchivoDelCliente } from "./proyecto";

// LAS FOTOS Y LOS ARCHIVOS QUE VE EL CLIENTE, de un punto o del proyecto.
//
// Hernán, 17/11/2026: «se pueden cargar archivos o fotos a que los vea... son
// relacionadas al proyecto y a las tareas también. Hazlo lo más didáctico y
// fácil posible».
//
// UN SOLO BOTÓN, Y EL LUGAR DICE PARA QUIÉN ES. Lo que se sube acá lo ve el
// cliente: está adentro del recuadro «lo que ve el cliente», bajo el título
// «Fotos y archivos para el cliente» —el mismo día preguntó «¿dónde se sube
// archivos relacionados?», y el botón decía «Adjuntar»—. No hay un tilde
// por archivo que decidir ni que olvidarse: un archivo interno —la cotización
// del proveedor— no se sube acá, y por eso no se le puede escapar.
//
// Se eligen varios a la vez, o se arrastran encima. Las fotos se ven en
// miniatura; lo demás, con su nombre. Cada uno se quita con su X.

/**
 * @param punto     el punto del checklist (como lo ve la lista), o null si es del proyecto
 * @param archivos  las filas que ya ve el cliente acá
 * @param enlaces   { [id]: enlace } de las fotos, para la miniatura
 * @param onCambio  se llama después de subir o quitar, para volver a leer
 */
export default function FotosYArchivosDelCliente({ lead, punto = null, archivos = [], enlaces = {}, editable = true, currentUser, onCambio, sinMigracion = false }) {
  const [subiendo, setSubiendo] = useState("");
  const [errores, setErrores] = useState([]);
  const [encima, setEncima] = useState(false);
  const elegir = useRef(null);

  async function subir(lista) {
    const todos = [...(lista || [])];
    if (!todos.length || subiendo) return;
    setErrores([]);
    setSubiendo(todos.length === 1 ? "Subiendo…" : `Subiendo ${todos.length}…`);
    const r = await subirParaElCliente({ lead, punto, archivos: todos, quien: currentUser });
    setSubiendo("");
    setErrores(r.errores || []);
    if (r.subidos) await onCambio?.();
  }

  async function quitar(a) {
    if (!window.confirm(`¿Quitar «${a.nombre}»? El cliente deja de verlo y se borra.`)) return;
    const e = await quitarArchivoDelCliente(a);
    if (e) { setErrores([e]); return; }
    await onCambio?.();
  }

  if (sinMigracion) {
    return editable ? (
      <div style={{ fontSize: 10.5, color: colors.warning, lineHeight: 1.45 }}>
        Para adjuntarle fotos y archivos al cliente falta correr la migración 184 en Supabase.
      </div>
    ) : null;
  }
  if (!editable && !archivos.length) return null;

  const fotos = archivos.filter(esFoto), otros = archivos.filter(a => !esFoto(a));
  const equis = { position: "absolute", top: -5, right: -5, width: 17, height: 17, borderRadius: 9, border: `1px solid ${colors.border}`,
    background: "#fff", color: colors.inkSoft, cursor: "pointer", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" };

  return (
    <div className="fotos-y-archivos-del-cliente"
      onDragOver={e => { if (editable) { e.preventDefault(); setEncima(true); } }}
      onDragLeave={() => setEncima(false)}
      onDrop={e => { if (!editable) return; e.preventDefault(); setEncima(false); subir(e.dataTransfer?.files); }}
      style={{ borderRadius: 7, outline: encima ? `2px dashed ${colors.brand}` : "none", outlineOffset: 3 }}>
      {archivos.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
          {fotos.map(a => (
            <span key={a.id} className="foto-del-cliente" style={{ position: "relative", display: "inline-block" }}>
              {enlaces[a.id]
                ? <img src={enlaces[a.id]} alt={a.nombre} title={a.nombre} onClick={() => abrirArchivo(a.storage_path)}
                    style={{ width: 58, height: 58, objectFit: "cover", borderRadius: 7, border: `1px solid ${colors.border}`, display: "block", cursor: "zoom-in" }} />
                : <span title={a.nombre} onClick={() => abrirArchivo(a.storage_path)}
                    style={{ width: 58, height: 58, borderRadius: 7, border: `1px solid ${colors.border}`, background: colors.neutralSoft,
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9.5, color: colors.muted, cursor: "pointer" }}>foto</span>}
              {editable && <button className="quitar-archivo" onClick={() => quitar(a)} title={`Quitar ${a.nombre}`} aria-label={`Quitar ${a.nombre}`} style={equis}><X size={10} /></button>}
            </span>
          ))}
          {otros.map(a => (
            <span key={a.id} className="archivo-del-cliente" style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 5,
              maxWidth: 230, padding: "5px 9px", borderRadius: 7, border: `1px solid ${colors.border}`, background: "#fff" }}>
              <FileText size={12} color={colors.muted} style={{ flexShrink: 0 }} />
              <button onClick={() => abrirArchivo(a.storage_path)} title={`Abrir ${a.nombre}`}
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: colors.font, fontSize: 11.5, color: colors.ink,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{a.nombre}</button>
              {editable && <button className="quitar-archivo" onClick={() => quitar(a)} title={`Quitar ${a.nombre}`} aria-label={`Quitar ${a.nombre}`} style={equis}><X size={10} /></button>}
            </span>
          ))}
        </div>
      )}

      {editable && (
        <>
          <button className="adjuntar-para-el-cliente" onClick={() => elegir.current?.click()} disabled={!!subiendo}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", fontFamily: colors.font, fontSize: 11.5, fontWeight: 600,
              border: `1px dashed ${colors.brand}`, background: "#fff", color: colors.brand, borderRadius: 8, padding: "5px 11px" }}>
            <Paperclip size={12} /> {subiendo || (archivos.length ? "Subir más fotos o archivos" : "Subir fotos o archivos")}
          </button>
          <input ref={elegir} type="file" multiple style={{ display: "none" }} aria-label="Fotos o archivos para el cliente"
            onChange={e => { const f = [...(e.target.files || [])]; e.target.value = ""; subir(f); }} />
          <span style={{ fontSize: 10.5, color: colors.muted, marginLeft: 8 }}>
            {archivos.length ? `El cliente ve ${cuantosDice(archivos)}.` : "Varias a la vez, o arrastralas acá. Las ve el cliente."}
          </span>
        </>
      )}
      {!editable && archivos.length > 0 && (
        <div style={{ fontSize: 10.5, color: colors.muted }}>El cliente ve {cuantosDice(archivos)}.</div>
      )}

      {errores.length > 0 && (
        <div role="alert" style={{ fontSize: 10.5, color: colors.danger, marginTop: 5, lineHeight: 1.45 }}>
          {errores.map((e, i) => <div key={i}>{e}</div>)}
        </div>
      )}
    </div>
  );
}
