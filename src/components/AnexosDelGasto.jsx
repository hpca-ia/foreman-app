import { useCallback, useEffect, useRef, useState } from "react";
import { Paperclip, X } from "lucide-react";
import { abrirArchivo } from "../lib/archivos";
import { esAdmin } from "../lib/roles";
import { anexosDe, agregarAnexo, quitarAnexo, SIN_MIGRACION_ANEXOS } from "../lib/anexos";

// EL ANEXO QUE EXPLICA UN GASTO: para quién, para qué (Hernán, 28/11/2026).
// La misma pieza en el gasto de caja chica, en la factura del control y en la
// compra. Lo que se sube en una se ve en las otras.

const cuando = x => new Date(x).toLocaleDateString("es-EC", { day: "numeric", month: "short" });
const link = { background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "var(--font)", color: "var(--brand)" };

export default function AnexosDelGasto({ gastoId = null, facturaId = null, solicitudId = null, carpeta, currentUser, cuantos = null, onCambio }) {
  // En una lista (la caja) se sabe cuántos hay y se abre al tocar; sola (la
  // factura, la compra) se abre si tiene alguno.
  const [abierto, setAbierto] = useState(cuantos == null ? null : false);
  const [anexos, setAnexos] = useState(null);
  const [nota, setNota] = useState("");
  const [archivo, setArchivo] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [escribiendo, setEscribiendo] = useState(false);
  const fileRef = useRef(null);

  const cargar = useCallback(async () => {
    const r = await anexosDe({ gastoId, facturaId, solicitudId });
    setAnexos(r.anexos);
    if (r.sinTabla) setError(SIN_MIGRACION_ANEXOS);
    setAbierto(a => (a == null ? r.anexos.length > 0 : a));
  }, [gastoId, facturaId, solicitudId]);
  // Con la cuenta ya sabida (la lista de la caja), se lee recién al abrir.
  useEffect(() => { if (cuantos == null || abierto) cargar().catch(() => {}); }, [cargar, cuantos, abierto]);

  async function agregar() {
    setOcupado(true); setError("");
    const r = await agregarAnexo({ gastoId, facturaId, solicitudId, carpeta, archivo, nota, quien: currentUser });
    setOcupado(false);
    if (r.error) { setError(r.error); return; }
    setNota(""); setArchivo(null); setEscribiendo(false);
    await cargar();
    onCambio?.();
  }

  async function quitar(a) {
    if (!window.confirm("¿Quitar este anexo?")) return;
    const r = await quitarAnexo(a);
    if (r.error) { setError(r.error); return; }
    await cargar();
    onCambio?.();
  }

  const n = anexos ? anexos.length : cuantos || 0;
  if (!abierto) {
    return (
      <button className="anexos-cerrado" onClick={() => { setAbierto(true); if (!n) setEscribiendo(true); }} style={{ ...link, fontSize: 11, display: "inline-flex", alignItems: "center", gap: 3, marginTop: 3 }}>
        <Paperclip size={11} /> {n ? `${n} ${n === 1 ? "anexo" : "anexos"}` : "Agregar anexo: para quién o para qué"}
      </button>
    );
  }

  const puedeQuitar = a => Number(a.subido_por) === Number(currentUser?.id) || esAdmin(currentUser?.role);
  return (
    <div className="anexos-del-gasto" style={{ marginTop: 6, borderLeft: "2px solid var(--border)", paddingLeft: 8, fontSize: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, color: "var(--muted)", marginBottom: 3 }}>ANEXOS · PARA QUIÉN O PARA QUÉ</div>
      {anexos == null && <div style={{ color: "var(--muted)", fontSize: 11.5 }}>Leyendo…</div>}
      {anexos?.map(a => (
        <div key={a.id} style={{ display: "flex", gap: 6, alignItems: "flex-start", padding: "3px 0" }}>
          <Paperclip size={11} style={{ marginTop: 3, flexShrink: 0, color: "var(--muted)" }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            {a.nota && <div style={{ color: "var(--ink)", whiteSpace: "pre-wrap" }}>{a.nota}</div>}
            {a.storage_path && (
              <button onClick={() => abrirArchivo(a.storage_path, { nombre: a.nombre })} style={{ ...link, fontSize: 11.5, textDecoration: "underline", textAlign: "left" }}>
                {a.nombre || "archivo"}
              </button>
            )}
            <div style={{ color: "var(--muted)", fontSize: 10.5 }}>{a.subido_por_nombre || "—"} · {cuando(a.created_at)}</div>
          </div>
          {puedeQuitar(a) && (
            <button onClick={() => quitar(a)} title="Quitar" style={{ ...link, color: "var(--muted)", display: "flex" }}><X size={12} /></button>
          )}
        </div>
      ))}
      {!escribiendo ? (
        <button onClick={() => setEscribiendo(true)} style={{ ...link, fontSize: 11.5, marginTop: 3 }}>+ Agregar anexo</button>
      ) : (
        <div style={{ display: "grid", gap: 5, marginTop: 5 }}>
          <textarea value={nota} onChange={e => setNota(e.target.value)} rows={2}
            placeholder="Para quién o para qué: «pases para Juan Pérez y 4 de Enetsa, montaje del 19/11»"
            style={{ width: "100%", boxSizing: "border-box", border: "1px solid var(--border)", borderRadius: 7, padding: "6px 8px", fontSize: 12, fontFamily: "var(--font)", resize: "vertical" }} />
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input ref={fileRef} type="file" accept="image/*,application/pdf,.xlsx,.xls,.docx,.doc" style={{ display: "none" }}
              onChange={e => { setArchivo(e.target.files?.[0] || null); e.target.value = ""; }} />
            <button onClick={() => fileRef.current?.click()}
              style={{ border: "1px solid var(--border)", background: "#fff", borderRadius: 7, padding: "4px 10px", fontSize: 11.5, cursor: "pointer", fontFamily: "var(--font)", color: "var(--ink-soft)" }}>
              <Paperclip size={11} style={{ verticalAlign: "-1px" }} /> {archivo ? archivo.name : "Adjuntar archivo (opcional)"}
            </button>
            <button onClick={agregar} disabled={ocupado || (!nota.trim() && !archivo)}
              style={{ border: "none", background: "var(--brand)", color: "#fff", borderRadius: 7, padding: "5px 12px", fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font)", opacity: ocupado || (!nota.trim() && !archivo) ? 0.5 : 1 }}>
              {ocupado ? "Guardando…" : "Guardar anexo"}
            </button>
            <button onClick={() => { setEscribiendo(false); setNota(""); setArchivo(null); }} style={{ ...link, color: "var(--muted)", fontSize: 11.5 }}>Cancelar</button>
          </div>
        </div>
      )}
      {error && <div style={{ color: "var(--danger)", fontSize: 11.5, marginTop: 4 }}>{error}</div>}
    </div>
  );
}
