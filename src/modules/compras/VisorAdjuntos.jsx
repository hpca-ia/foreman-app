import { useEffect, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight, FileText, Download, Maximize2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";

// Todos los papeles de la solicitud, acá adentro.
//
// Quien aprueba abre el pedido con tres cotizaciones y un plano. Tenía que
// abrir cada uno en otra pestaña, mirarlo, cerrarlo y volver — y para comparar
// precios, hacerlo dos veces. Comparar es justamente lo que se viene a hacer
// a esta pantalla, así que los documentos tienen que estar en ella.
//
// Se ven en FOREMAN los que el navegador sabe mostrar: imágenes y PDF, que es
// el 95% de lo que llega. Un Excel o un Word no los dibuja ningún navegador
// sin convertirlos en el servidor, así que esos se bajan, y el visor lo dice
// en vez de mostrar un cuadro en blanco.

const esImagen = n => /\.(png|jpe?g|gif|webp|heic|avif)$/i.test(n || "");
const esPDF = n => /\.pdf$/i.test(n || "");

export default function VisorAdjuntos({ solicitudId, proformas = [] }) {
  const [papeles, setPapeles] = useState([]);
  const [i, setI] = useState(0);
  const [abierto, setAbierto] = useState(false);

  const cargar = useCallback(async () => {
    if (!solicitudId) return;
    // Las proformas cuelgan de la solicitud; los anexos, de la carpeta que usa
    // InlineFiles. Dos lugares por historia, un solo visor por sentido común.
    const deProformas = proformas.map(p => ({
      clave: `p${p.id}`, ruta: p.storage_path, nombre: p.nombre || p.proveedor || "Cotización",
      etiqueta: p.proveedor ? `Cotización · ${p.proveedor}` : "Cotización",
      monto: p.monto,
    }));
    const { data: sueltos } = await supabase.storage.from("task-files")
      .list(`task-compra-${solicitudId}/`, { sortBy: { column: "created_at", order: "asc" } });
    const deAnexos = (sueltos || [])
      .filter(f => f.name && f.name !== ".emptyFolderPlaceholder")
      .map(f => ({ clave: `a${f.name}`, ruta: `task-compra-${solicitudId}/${f.name}`, nombre: f.name, etiqueta: "Anexo" }));

    const todos = [...deProformas, ...deAnexos];
    if (!todos.length) { setPapeles([]); return; }
    // Una hora alcanza para mirarlos; el enlace se vuelve a pedir al reabrir.
    const { data: firmados } = await supabase.storage.from("task-files")
      .createSignedUrls(todos.map(x => x.ruta), 3600);
    setPapeles(todos.map((x, k) => ({ ...x, url: firmados?.[k]?.signedUrl || null })));
  }, [solicitudId, proformas]);
  useEffect(() => { cargar(); }, [cargar]);

  if (!papeles.length) return null;

  const actual = papeles[Math.min(i, papeles.length - 1)];
  const mover = d => setI(k => (k + d + papeles.length) % papeles.length);

  return (
    <div style={{ border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, overflow: "hidden", background: colors.surface }}>
      {/* La tira: de un vistazo cuántos papeles hay y cuál se está mirando. */}
      <div style={{ display: "flex", gap: 5, padding: 7, overflowX: "auto", borderBottom: `1px solid ${colors.neutralSoft}` }}>
        {papeles.map((p, k) => {
          const puesto = k === i;
          return (
            <button key={p.clave} onClick={() => { setI(k); setAbierto(true); }} title={p.nombre}
              style={{ flexShrink: 0, width: 92, border: `1px solid ${puesto ? colors.brand : colors.border}`,
                background: puesto ? colors.brandSoft : "#fff", borderRadius: 7, padding: 4, cursor: "pointer",
                fontFamily: colors.font, textAlign: "left" }}>
              <div style={{ height: 46, borderRadius: 4, overflow: "hidden", background: colors.bg,
                display: "flex", alignItems: "center", justifyContent: "center" }}>
                {esImagen(p.nombre) && p.url
                  ? <img src={p.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <FileText size={18} color={colors.muted} />}
              </div>
              <div style={{ fontSize: 9, color: puesto ? colors.brand : colors.inkSoft, fontWeight: 600,
                marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p.etiqueta}
              </div>
              {p.monto ? <div style={{ fontSize: 9.5, color: colors.ink, fontWeight: 700 }}>${Number(p.monto).toFixed(2)}</div> : null}
            </button>
          );
        })}
      </div>

      {!abierto ? (
        <button onClick={() => setAbierto(true)}
          style={{ width: "100%", background: "none", border: "none", padding: "8px", color: colors.inkSoft,
            fontSize: 11.5, cursor: "pointer", fontFamily: colors.font, display: "flex",
            alignItems: "center", justifyContent: "center", gap: 6 }}>
          <Maximize2 size={12} /> Ver los {papeles.length} papeles sin salir de acá
        </button>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 9px", background: colors.bg }}>
            <button onClick={() => mover(-1)} disabled={papeles.length < 2}
              style={{ background: "none", border: "none", color: colors.inkSoft, cursor: "pointer", display: "flex", padding: 0 }}>
              <ChevronLeft size={16} />
            </button>
            <div style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <strong>{actual.etiqueta}</strong> · {actual.nombre}
              <span style={{ color: colors.muted }}> · {i + 1} de {papeles.length}</span>
            </div>
            <button onClick={() => mover(1)} disabled={papeles.length < 2}
              style={{ background: "none", border: "none", color: colors.inkSoft, cursor: "pointer", display: "flex", padding: 0 }}>
              <ChevronRight size={16} />
            </button>
            {actual.url && (
              <a href={actual.url} target="_blank" rel="noreferrer" title="Abrirlo aparte o bajarlo"
                style={{ color: colors.inkSoft, display: "flex" }}><Download size={13} /></a>
            )}
          </div>
          <div style={{ background: "#fff", minHeight: 240, maxHeight: 420, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {!actual.url ? (
              <span style={{ fontSize: 12, color: colors.muted }}>No se pudo abrir este archivo.</span>
            ) : esImagen(actual.nombre) ? (
              <img src={actual.url} alt={actual.nombre} style={{ maxWidth: "100%", maxHeight: 420, objectFit: "contain" }} />
            ) : esPDF(actual.nombre) ? (
              <iframe title={actual.nombre} src={actual.url} style={{ width: "100%", height: 420, border: "none" }} />
            ) : (
              // Ni el visor ni el navegador saben dibujar un .xlsx: decirlo es
              // mejor que mostrar un recuadro vacío y que uno crea que falló.
              <div style={{ textAlign: "center", padding: 28, fontSize: 12, color: colors.muted }}>
                <FileText size={22} style={{ marginBottom: 6 }} />
                <div>Este tipo de archivo no se puede ver acá dentro.</div>
                <a href={actual.url} target="_blank" rel="noreferrer" style={{ color: colors.brand, fontWeight: 600 }}>Bajarlo →</a>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
