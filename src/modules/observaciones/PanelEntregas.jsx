import { useEffect, useState, useCallback, useRef } from "react";
import { Upload, FileText, Check, MessageSquare, Trash2, Clock } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import VisorFotos from "../../components/VisorFotos";

// Lo que se le manda al cliente para que lo apruebe.
//
// Un plano de detalle, un cambio de material, el acabado elegido: cosas que
// hoy se mandan por correo y se aprueban por WhatsApp con un "dale". Después,
// cuando el piso llegó en el tono que no era, "yo aprobé el otro" contra "me
// dijiste que sí" no se resuelve, porque ese sí vive en un chat que nadie
// guardó.
//
// Acá cada cosa es una fila con su fecha y su respuesta. Eso es lo que
// convierte una conversación en un respaldo.

export const TIPOS_ENTREGA = {
  plano:      { label: "Plano",     pista: "Un detalle, una planta, un corte para que lo revise" },
  cambio:     { label: "Cambio",    pista: "Algo que se va a hacer distinto de lo acordado" },
  documento:  { label: "Documento", pista: "Una especificación, una muestra, un presupuesto adicional" },
};

const ESTADOS_ENTREGA = {
  enviado:   { label: "Esperando respuesta", color: "warning" },
  aprobado:  { label: "Aprobado",            color: "success" },
  observado: { label: "Con observaciones",   color: "danger" },
};

const VACIA = { tipo: "plano", titulo: "", descripcion: "" };
const esImagen = n => /\.(png|jpe?g|gif|webp|heic|avif)$/i.test(n || "");

export default function PanelEntregas({ lead, currentUser, puedeEnviar = true }) {
  const [entregas, setEntregas] = useState([]);
  const [enlaces, setEnlaces] = useState({});
  const [sinTabla, setSinTabla] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [form, setForm] = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");
  const [mirando, setMirando] = useState(null);
  const archivoRef = useRef(null);
  const pendiente = useRef(null);

  const cargar = useCallback(async () => {
    if (!lead?.id) return;
    setCargando(true);
    const { data, error: e } = await supabase.from("proyecto_entregas")
      .select("*").eq("lead_id", lead.id).order("enviado_at", { ascending: false });
    if (e) { setSinTabla(/relation|does not exist|schema cache/i.test(e.message)); setCargando(false); return; }
    setEntregas(data || []);
    const conArchivo = (data || []).filter(x => x.storage_path);
    if (conArchivo.length) {
      const { data: firmados } = await supabase.storage.from("task-files")
        .createSignedUrls(conArchivo.map(x => x.storage_path), 3600);
      const mapa = {};
      (firmados || []).forEach((x, i) => { if (x?.signedUrl) mapa[conArchivo[i].id] = x.signedUrl; });
      setEnlaces(mapa);
    }
    setCargando(false);
  }, [lead?.id]);
  useEffect(() => { cargar(); }, [cargar]);

  async function guardar(archivo) {
    if (!form?.titulo?.trim()) { setError("Ponele un nombre a lo que se manda."); return; }
    setSubiendo(true); setError("");
    let ruta = null, nombre = null;
    if (archivo) {
      const limpio = archivo.name.replace(/[^\w.\-]/g, "_").slice(-60);
      ruta = `entrega-${lead.id}/${Date.now()}-${limpio}`;
      const { error: e1 } = await supabase.storage.from("task-files").upload(ruta, archivo, { upsert: false });
      if (e1) { setError(e1.message); setSubiendo(false); return; }
      nombre = archivo.name;
    }
    const { error: e2 } = await supabase.from("proyecto_entregas").insert({
      lead_id: lead.id, obra_id: lead.obra_id || null,
      tipo: form.tipo, titulo: form.titulo.trim(),
      descripcion: form.descripcion?.trim() || null,
      storage_path: ruta, archivo_nombre: nombre,
      enviado_por: currentUser?.id ?? null, enviado_nombre: currentUser?.name || null,
    });
    setSubiendo(false);
    if (e2) { setError(/schema cache|does not exist/i.test(e2.message) ? "Falta correr la migración 073." : e2.message); return; }
    setForm(null); await cargar();
  }

  async function quitar(x) {
    if (!window.confirm(`¿Borrar "${x.titulo}"?`)) return;
    if (x.storage_path) await supabase.storage.from("task-files").remove([x.storage_path]);
    await supabase.from("proyecto_entregas").delete().eq("id", x.id);
    cargar();
  }

  if (sinTabla) {
    return (
      <div style={{ fontSize: 12.5, color: colors.warning, background: colors.warningSoft, border: `1px solid ${colors.warningBorder}`, borderRadius: colors.radiusMd, padding: 14 }}>
        Falta correr la migración 073 para mandarle cosas al cliente.
      </div>
    );
  }

  const imagenes = entregas.filter(x => enlaces[x.id] && esImagen(x.archivo_nombre))
    .map(x => ({ ...x, url: enlaces[x.id] }));

  return (
    <div>
      {puedeEnviar && (form ? (
        <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 12, marginBottom: 14, display: "grid", gap: 8 }}>
          <div style={{ display: "flex", gap: 6 }}>
            {Object.entries(TIPOS_ENTREGA).map(([id, t]) => {
              const puesto = form.tipo === id;
              return (
                <button key={id} onClick={() => setForm(f => ({ ...f, tipo: id }))} title={t.pista}
                  style={{ flex: 1, border: `1px solid ${puesto ? colors.brand : colors.border}`,
                    background: puesto ? colors.brandSoft : "#fff", color: puesto ? colors.brand : colors.inkSoft,
                    borderRadius: 8, padding: "7px 8px", fontSize: 12, fontWeight: puesto ? 700 : 500,
                    cursor: "pointer", fontFamily: colors.font }}>
                  {t.label}
                </button>
              );
            })}
          </div>
          <input autoFocus value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
            placeholder="¿Qué se manda? Ej: detalle de mesón de cocina, rev. B" style={inputStyle} />
          <textarea value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} rows={2}
            placeholder="Qué tiene que mirar, y qué pasa si no contesta" style={{ ...inputStyle, resize: "vertical" }} />
          {error && <div style={{ fontSize: 11.5, color: colors.danger }}>{error}</div>}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Button variant="primary" size="sm" disabled={subiendo}
              onClick={() => { pendiente.current = true; archivoRef.current?.click(); }}>
              <Upload size={13} /> {subiendo ? "Subiendo…" : "Elegir el archivo y mandar"}
            </Button>
            {/* Sin archivo también sirve: "¿confirmás el color gris claro?" no
                necesita un PDF, y obligar a adjuntar algo para preguntar es
                cómo la pregunta se termina haciendo por WhatsApp. */}
            <Button variant="outline" size="sm" disabled={subiendo} onClick={() => guardar(null)}>
              Mandar sin archivo
            </Button>
            <Button variant="secondary" size="sm" onClick={() => { setForm(null); setError(""); }}>Cancelar</Button>
          </div>
        </div>
      ) : (
        <Button variant="primary" size="sm" onClick={() => { setForm({ ...VACIA }); setError(""); }}>
          <Upload size={13} /> Mandarle algo al cliente
        </Button>
      ))}

      <input ref={archivoRef} type="file" style={{ display: "none" }}
        onChange={e => { const a = e.target.files?.[0]; e.target.value = ""; if (a) guardar(a); }} />

      <div style={{ marginTop: 14 }}>
        {cargando ? (
          <div style={{ textAlign: "center", color: colors.muted, padding: "30px 0", fontSize: 13 }}>Cargando…</div>
        ) : !entregas.length ? (
          <div style={{ textAlign: "center", color: colors.muted, padding: "34px 16px", fontSize: 13,
            background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd }}>
            Todavía no se le mandó nada al cliente para aprobar.
          </div>
        ) : entregas.map(x => {
          const e = ESTADOS_ENTREGA[x.estado] || ESTADOS_ENTREGA.enviado;
          const t = TIPOS_ENTREGA[x.tipo] || TIPOS_ENTREGA.documento;
          const color = colors[e.color] || colors.muted;
          return (
            <div key={x.id} style={{ background: colors.surface, border: `1px solid ${colors.border}`,
              borderLeft: `3px solid ${color}`, borderRadius: colors.radiusMd, padding: "10px 12px", marginBottom: 7 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: colors.ink }}>
                    <span style={{ fontSize: 9.5, fontWeight: 700, color: colors.muted, letterSpacing: 0.3, marginRight: 6 }}>
                      {t.label.toUpperCase()}
                    </span>
                    {x.titulo}
                  </div>
                  {x.descripcion && <div style={{ fontSize: 12, color: colors.inkSoft, marginTop: 2, lineHeight: 1.5 }}>{x.descripcion}</div>}
                  <div style={{ fontSize: 10.5, color: colors.muted, marginTop: 3 }}>
                    {dia(x.enviado_at)}{x.enviado_nombre ? ` · ${x.enviado_nombre}` : ""}
                  </div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color, whiteSpace: "nowrap" }}>
                  {x.estado === "enviado" && <Clock size={10} style={{ verticalAlign: -1, marginRight: 3 }} />}
                  {x.estado === "aprobado" && <Check size={11} style={{ verticalAlign: -1, marginRight: 3 }} />}
                  {e.label}
                </span>
              </div>

              {/* Lo que contestó, con su fecha. Es el respaldo. */}
              {x.cliente_respuesta_at && (
                <div style={{ marginTop: 7, paddingTop: 7, borderTop: `1px solid ${colors.neutralSoft}`,
                  fontSize: 12, color: colors.inkSoft, display: "flex", gap: 6 }}>
                  <MessageSquare size={11} style={{ marginTop: 3, flexShrink: 0, color: colors.muted }} />
                  <div>
                    <strong style={{ color }}>{e.label}</strong>
                    <span style={{ color: colors.muted }}> · {dia(x.cliente_respuesta_at)}</span>
                    {x.cliente_nota && <div style={{ color: colors.ink, marginTop: 2 }}>{x.cliente_nota}</div>}
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: 10, marginTop: 7, alignItems: "center" }}>
                {enlaces[x.id] && (
                  esImagen(x.archivo_nombre)
                    ? <button onClick={() => setMirando(Math.max(0, imagenes.findIndex(i => i.id === x.id)))}
                        style={enlaceBoton}><FileText size={12} /> Ver</button>
                    : <a href={enlaces[x.id]} target="_blank" rel="noreferrer" style={{ ...enlaceBoton, textDecoration: "none" }}>
                        <FileText size={12} /> {x.archivo_nombre || "Abrir"}
                      </a>
                )}
                {puedeEnviar && (
                  <button onClick={() => quitar(x)} style={{ ...enlaceBoton, color: colors.muted, marginLeft: "auto" }}>
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {mirando !== null && (
        <VisorFotos fotos={imagenes} indice={mirando} onIndice={setMirando} onCerrar={() => setMirando(null)} />
      )}
    </div>
  );
}

const enlaceBoton = {
  background: "none", border: "none", padding: 0, color: colors.brand, fontSize: 11.5,
  fontWeight: 600, cursor: "pointer", fontFamily: colors.font, display: "inline-flex",
  alignItems: "center", gap: 4,
};

const dia = f => (f ? new Date(f).toLocaleDateString("es-EC", { day: "numeric", month: "short", year: "numeric" }) : "");
