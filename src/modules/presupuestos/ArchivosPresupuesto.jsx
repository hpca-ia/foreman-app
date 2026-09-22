import { useState, useEffect, useCallback } from "react";
import { Paperclip, Download, Trash2, Upload, Loader2 } from "lucide-react";
import { colors } from "../../theme/colors";
import { listarOriginales, guardarOriginal, borrarOriginal, abrirOriginal } from "../../lib/archivosPresupuesto";

// Los archivos originales del presupuesto: el Excel con que se armó, las
// proformas de los proveedores, lo que mandó el cliente.
//
// Se guardan solos al importar y al subir una cotización; acá se ven, se
// descargan y se pueden sumar más a mano. Es lo que queda cuando alguien
// pregunta de dónde salió un precio.

const TIPOS = { presupuesto: "Presupuesto original", cotizacion: "Cotización", otro: "Archivo" };
const peso = b => (!b ? "" : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
const cuando = f => (f ? new Date(f).toLocaleDateString("es-EC", { day: "numeric", month: "short", year: "numeric" }) : "");

export default function ArchivosPresupuesto({ presupuestoId, currentUser, soloLectura, version }) {
  const [archivos, setArchivos] = useState([]);
  const [faltaMigracion, setFaltaMigracion] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    const r = await listarOriginales(presupuestoId);
    setArchivos(r.archivos);
    setFaltaMigracion(!!r.faltaMigracion);
  }, [presupuestoId]);
  useEffect(() => { cargar(); }, [cargar, version]);

  async function subir(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSubiendo(true); setError("");
    const r = await guardarOriginal(presupuestoId, file, "otro", currentUser);
    setSubiendo(false);
    if (r.error) setError(r.faltaMigracion ? "Falta correr la migración 032 para anotar los archivos." : r.error);
    else cargar();
  }

  async function borrar(a) {
    if (!window.confirm(`¿Borrar "${a.nombre}"? Esto lo saca de FOREMAN; si ya entró al respaldo de anoche, ahí sigue.`)) return;
    const e = await borrarOriginal(a);
    if (e) setError(e); else cargar();
  }

  if (faltaMigracion && !archivos.length) return null;

  return (
    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: archivos.length ? 8 : 0, flexWrap: "wrap" }}>
        <Paperclip size={14} color={colors.ink} />
        <span style={{ fontSize: 13, fontWeight: 700, color: colors.ink }}>Archivos del presupuesto</span>
        <span style={{ fontSize: 11, color: colors.muted, flex: 1, minWidth: 140 }}>
          {archivos.length ? "Tal como llegaron: de acá sale de dónde vino cada precio." : "Todavía no hay archivos guardados."}
        </span>
        {!soloLectura && (
          <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, color: colors.inkSoft, cursor: "pointer", border: `1px solid ${colors.border}`, borderRadius: 16, padding: "4px 11px" }}>
            {subiendo ? <Loader2 size={12} /> : <Upload size={12} />} Subir archivo
            <input type="file" onChange={subir} style={{ display: "none" }} />
          </label>
        )}
      </div>

      {error && <div style={{ fontSize: 11.5, color: colors.danger, marginBottom: 6 }}>{error}</div>}

      {archivos.map(a => (
        <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderTop: `1px solid ${colors.neutralSoft}`, fontSize: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: colors.ink, overflowWrap: "anywhere" }}>{a.nombre}</div>
            <div style={{ fontSize: 10.5, color: colors.muted }}>
              {TIPOS[a.tipo] || TIPOS.otro}{a.bytes ? ` · ${peso(a.bytes)}` : ""}{a.created_at ? ` · ${cuando(a.created_at)}` : ""}
              {a.subido_por_nombre ? ` · ${a.subido_por_nombre}` : ""}
              {a.soltado_at && <span style={{ color: colors.warning }}> · soltado del depósito, está en el respaldo</span>}
            </div>
          </div>
          {!a.soltado_at && (
            <button onClick={() => abrirOriginal(a)} title="Abrir o descargar"
              style={{ background: "none", border: `1px solid ${colors.border}`, borderRadius: 6, padding: "4px 8px", cursor: "pointer", color: colors.ink, display: "flex" }}>
              <Download size={12} />
            </button>
          )}
          {!soloLectura && (
            <button onClick={() => borrar(a)} title="Borrar"
              style={{ background: "none", border: "none", cursor: "pointer", color: colors.danger, display: "flex" }}>
              <Trash2 size={12} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
