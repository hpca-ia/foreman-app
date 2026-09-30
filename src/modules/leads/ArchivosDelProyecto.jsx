import { useState, useEffect, useCallback, useRef } from "react";
import { Upload, Trash2, Download, FileText, Image, Box, Sheet, Folder } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import { inputStyle } from "../../components/ui/Input";
import { enlacesArchivos, abrirArchivo } from "../../lib/archivos";

// El cajón del proyecto: planos, CAD, PDF del cliente, fotos del terreno.
//
// FOREMAN ya guardaba archivos, pero todos colgando de otra cosa —de una
// factura, de un día de obra, de una solicitud de compra—. Faltaba lo que no
// es de ningún trámite y sin embargo todo el mundo busca: la última versión de
// la planta, la escritura, el informe de suelos.
//
// Las carpetas son texto libre y se escriben al subir. Obligar a crearlas
// antes termina con todo en la raíz, que es exactamente el problema que esto
// viene a resolver.

const MB = 1024 * 1024;
// Supabase corta los archivos grandes del lado del servidor. Avisar antes de
// subir 90 MB por una red de obra es más honesto que fallar a los tres minutos.
const TOPE = 50 * MB;

const CLASE = [
  [/\.(dwg|dxf|rvt|skp|3dm|ifc|step|stp)$/i, "cad", Box, "CAD y modelos"],
  [/\.(pdf)$/i, "pdf", FileText, "PDF"],
  [/\.(jpe?g|png|webp|gif|heic|avif|tiff?)$/i, "imagen", Image, "Imágenes"],
  [/\.(xlsx?|csv|docx?|pptx?)$/i, "hoja", Sheet, "Documentos"],
];
const claseDe = nombre => (CLASE.find(([re]) => re.test(String(nombre || "")))?.[1]) || "otro";
const iconoDe = tipo => (CLASE.find(([, t]) => t === tipo)?.[2]) || FileText;

const peso = b => {
  const n = Number(b) || 0;
  if (!n) return "";
  return n >= MB ? `${(n / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
};
const dia = f => (f ? new Date(f).toLocaleDateString("es-EC", { day: "numeric", month: "short", year: "numeric" }) : "");

export default function ArchivosDelProyecto({ lead, currentUser, editable = true }) {
  const [archivos, setArchivos] = useState([]);
  const [enlaces, setEnlaces] = useState({});
  const [sinTabla, setSinTabla] = useState(false);
  const [carpeta, setCarpeta] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [aviso, setAviso] = useState("");
  const [filtro, setFiltro] = useState("");
  const fileRef = useRef(null);

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from("proyecto_archivos")
      .select("*").eq("lead_id", lead.id).order("created_at", { ascending: false });
    if (error) { setSinTabla(/relation|does not exist|schema cache/i.test(error.message)); return; }
    setSinTabla(false);
    setArchivos(data || []);
    // Solo se piden los enlaces de las imágenes: son las únicas que se ven en
    // miniatura. Para el resto basta pedirlo al tocar.
    const fotos = (data || []).filter(a => a.tipo === "imagen");
    if (fotos.length) {
      const urls = await enlacesArchivos(fotos.map(a => a.storage_path));
      const mapa = {};
      fotos.forEach((a, i) => { if (urls[i]) mapa[a.id] = urls[i]; });
      setEnlaces(mapa);
    }
  }, [lead.id]);
  useEffect(() => { cargar(); }, [cargar]);

  async function subir(lista) {
    setAviso("");
    for (const archivo of lista) {
      if (archivo.size > TOPE) {
        setAviso(`"${archivo.name}" pesa ${peso(archivo.size)} y el tope es 50 MB. Subilo a Dropbox y dejá acá el enlace en la descripción.`);
        continue;
      }
      setSubiendo(true);
      const limpio = archivo.name.replace(/[^\w.\-]/g, "_").slice(-80);
      const ruta = `proyecto-${lead.id}/${Date.now()}-${limpio}`;
      const { error } = await supabase.storage.from("task-files").upload(ruta, archivo, { upsert: false });
      if (error) { setAviso(error.message); setSubiendo(false); continue; }
      const { error: e2 } = await supabase.from("proyecto_archivos").insert({
        lead_id: lead.id, storage_path: ruta, nombre: archivo.name,
        carpeta: carpeta.trim() || null, tipo: claseDe(archivo.name), tamano: archivo.size,
        subido_por: currentUser?.id ?? null, subido_nombre: currentUser?.name || null,
      });
      if (e2) setAviso(/relation|schema cache/i.test(e2.message) ? "Falta correr la migración 061." : e2.message);
      setSubiendo(false);
    }
    await cargar();
  }

  async function borrar(a) {
    if (!window.confirm(`¿Borrar "${a.nombre}"? No se puede deshacer.`)) return;
    await supabase.storage.from("task-files").remove([a.storage_path]);
    await supabase.from("proyecto_archivos").delete().eq("id", a.id);
    await cargar();
  }

  if (sinTabla) {
    return <div style={{ fontSize: 12.5, color: colors.warning, background: colors.warningSoft, border: `1px solid ${colors.warningBorder}`, borderRadius: colors.radiusMd, padding: 13 }}>
      Falta correr la migración 061 para guardar archivos del proyecto.
    </div>;
  }

  const q = filtro.trim().toLowerCase();
  const visibles = q ? archivos.filter(a => `${a.nombre} ${a.carpeta || ""} ${a.descripcion || ""}`.toLowerCase().includes(q)) : archivos;

  // Por carpeta, y lo que no tiene carpeta al final: es lo que todavía nadie
  // ordenó, y verlo al fondo invita a ordenarlo.
  const carpetas = [];
  visibles.forEach(a => { const c = a.carpeta || ""; if (!carpetas.includes(c)) carpetas.push(c); });
  carpetas.sort((a, b) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)));
  const yaUsadas = [...new Set(archivos.map(a => a.carpeta).filter(Boolean))];

  return (
    <div style={{ fontFamily: colors.font }}>
      {editable && (
        <div style={{ background: colors.bg, borderRadius: colors.radiusMd, padding: 10, marginBottom: 10 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <input list="carpetas-proyecto" value={carpeta} onChange={e => setCarpeta(e.target.value)}
              placeholder="Carpeta (opcional): Planos aprobados, Municipio…"
              style={{ ...inputStyle, flex: 1, minWidth: 0, padding: "7px 9px", fontSize: 12.5 }} />
            <datalist id="carpetas-proyecto">{yaUsadas.map(c => <option key={c} value={c} />)}</datalist>
          </div>
          <button onClick={() => fileRef.current?.click()} disabled={subiendo}
            style={{ width: "100%", background: "#fff", border: `1px dashed ${colors.border}`, borderRadius: 8, padding: "11px",
              color: colors.inkSoft, fontSize: 13, cursor: "pointer", fontFamily: colors.font,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
            <Upload size={15} /> {subiendo ? "Subiendo…" : "Subir archivos"}
          </button>
          <input ref={fileRef} type="file" multiple style={{ display: "none" }}
            onChange={e => { const f = [...(e.target.files || [])]; e.target.value = ""; if (f.length) subir(f); }} />
          <div style={{ fontSize: 10.5, color: colors.muted, marginTop: 5, lineHeight: 1.5 }}>
            Planos, CAD, PDF, fotos. Hasta 50 MB por archivo; lo más pesado va a Dropbox y acá su enlace.
          </div>
        </div>
      )}

      {aviso && <div style={{ fontSize: 11.5, color: colors.warning, marginBottom: 8, lineHeight: 1.5 }}>{aviso}</div>}

      {archivos.length > 4 && (
        <input value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Buscar por nombre o carpeta"
          style={{ ...inputStyle, width: "100%", boxSizing: "border-box", padding: "7px 9px", fontSize: 12.5, marginBottom: 8 }} />
      )}

      {!archivos.length && (
        <div style={{ textAlign: "center", color: colors.muted, padding: "34px 16px", fontSize: 12.5, lineHeight: 1.6,
          background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd }}>
          <Folder size={24} style={{ marginBottom: 6 }} />
          <div>Todavía no hay archivos de este proyecto.</div>
          <div style={{ fontSize: 11.5 }}>Acá van los planos, los CAD y los PDF que hoy están en el correo.</div>
        </div>
      )}

      {carpetas.map(c => (
        <div key={c || "sueltos"} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.5, marginBottom: 5, display: "flex", alignItems: "center", gap: 5 }}>
            <Folder size={11} /> {(c || "SIN CARPETA").toUpperCase()} · {visibles.filter(a => (a.carpeta || "") === c).length}
          </div>
          <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, overflow: "hidden" }}>
            {visibles.filter(a => (a.carpeta || "") === c).map(a => {
              const Icono = iconoDe(a.tipo);
              return (
                <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 11px", borderTop: `1px solid ${colors.neutralSoft}` }}>
                  {a.tipo === "imagen" && enlaces[a.id]
                    ? <img src={enlaces[a.id]} alt={a.nombre} style={{ width: 34, height: 34, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
                    : <div style={{ width: 34, height: 34, borderRadius: 6, background: colors.neutralSoft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Icono size={15} color={colors.muted} />
                      </div>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {a.nombre}
                    </div>
                    <div style={{ fontSize: 10.5, color: colors.muted }}>
                      {peso(a.tamano)}{a.tamano ? " · " : ""}{a.subido_nombre || "—"} · {dia(a.created_at)}
                    </div>
                  </div>
                  <button onClick={() => abrirArchivo(a.storage_path)} title="Abrir o descargar"
                    style={{ background: "none", border: `1px solid ${colors.border}`, borderRadius: 7, padding: "5px 7px",
                      color: colors.inkSoft, cursor: "pointer", display: "flex" }}>
                    <Download size={13} />
                  </button>
                  {editable && (
                    <button onClick={() => borrar(a)} title="Borrar"
                      style={{ background: "none", border: "none", color: colors.border, cursor: "pointer", display: "flex", padding: 0 }}>
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
