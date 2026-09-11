import { useState, useRef, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { colors } from "../theme/colors";

export default function InlineFiles({ taskId }) {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => { fetchFiles(); }, [taskId]);

  async function fetchFiles() {
    const { data } = await supabase.storage.from("task-files").list(`task-${taskId}/`, { sortBy: { column: "created_at", order: "desc" } });
    setFiles(data || []);
  }

  async function uploadFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `task-${taskId}/${Date.now()}-${safeName}`;
    const { error } = await supabase.storage.from("task-files").upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type || "application/octet-stream" });
    if (!error) fetchFiles();
    setUploading(false);
    e.target.value = "";
  }

  async function uploadFromClipboard(e) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) return;
        setUploading(true);
        const path = `task-${taskId}/${Date.now()}-captura.png`;
        const { error } = await supabase.storage.from("task-files").upload(path, file, { cacheControl: "3600", upsert: false, contentType: "image/png" });
        if (!error) fetchFiles();
        setUploading(false);
        break;
      }
    }
  }

  function getUrl(name) {
    const { data } = supabase.storage.from("task-files").getPublicUrl(`task-${taskId}/${name}`);
    return data.publicUrl;
  }

  function isImage(name) {
    return ["jpg", "jpeg", "png", "gif", "webp", "heic"].includes(name.split(".").pop().toLowerCase());
  }

  async function deleteFile(name) {
    await supabase.storage.from("task-files").remove([`task-${taskId}/${name}`]);
    fetchFiles();
  }

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: colors.muted }}>Archivos ({files.length})</span>
        <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ background: colors.neutralSoft, border: `1px solid ${colors.border}`, borderRadius: colors.radiusSm, padding: "3px 8px", color: colors.inkSoft, fontSize: 11, cursor: "pointer" }}>
          {uploading ? "Subiendo..." : "+ Subir archivo"}
        </button>
        <input ref={fileRef} type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={uploadFile} style={{ display: "none" }} />
      </div>
      {files.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
          {files.map(f => (
            <div key={f.name} style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: colors.radiusSm, overflow: "hidden", width: isImage(f.name) ? 70 : 140 }}>
              {isImage(f.name) ? (
                <a href={getUrl(f.name)} target="_blank" rel="noreferrer">
                  <img src={getUrl(f.name)} alt={f.name} style={{ width: "100%", height: 52, objectFit: "cover", display: "block" }} />
                </a>
              ) : (
                <a href={getUrl(f.name)} target="_blank" rel="noreferrer" download style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 8px", textDecoration: "none" }}>
                  <span style={{ fontSize: 10, color: colors.inkSoft, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name.replace(/^\d+-/, "")}</span>
                </a>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 5px", borderTop: "1px solid #F3F4F6" }}>
                <a href={getUrl(f.name)} download target="_blank" rel="noreferrer" style={{ fontSize: 9, color: colors.brand, textDecoration: "none" }}>Descargar</a>
                <button onClick={() => deleteFile(f.name)} style={{ background: "none", border: "none", color: colors.danger, fontSize: 9, cursor: "pointer", padding: 0 }}>Eliminar</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div
        onPaste={uploadFromClipboard} tabIndex={0} contentEditable suppressContentEditableWarning
        onKeyDown={e => { if (e.key !== "v" || (!e.metaKey && !e.ctrlKey)) e.preventDefault(); }}
        style={{ background: colors.bg, border: `1px dashed ${colors.border}`, borderRadius: colors.radiusSm, padding: "4px 10px", fontSize: 10, color: colors.muted, cursor: "pointer", outline: "none", userSelect: "none" }}
        onClick={e => e.currentTarget.focus()}
      >
        {uploading ? "Subiendo..." : "Pegar captura (Cmd+V)"}
      </div>
    </div>
  );
}
