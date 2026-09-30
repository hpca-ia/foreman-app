import { useState, useEffect, useCallback } from "react";
import { FileText, Download, AlertTriangle } from "lucide-react";
import { colors } from "../../theme/colors";
import { enlacesArchivos } from "../../lib/archivos";
import { fmt } from "./calculos";

// Los respaldos de la planilla, todos juntos.
//
// Los escaneos ya estaban —cada fila del listado tiene su botón— pero para
// revisar una planilla completa hay que abrir veinte filas de a una. Cuando
// llega la fiscalización, o cuando hay que armar la liquidación, lo que se
// necesita es verlos todos y saber de un vistazo cuáles FALTAN: una factura
// sin escaneo en la planilla es una que va a aparecer justo el día que alguien
// la pida.
//
// Las imágenes se ven en miniatura; los PDF, con su nombre. Un clic abre el
// archivo en una pestaña, con un enlace que caduca a la hora, como todo lo que
// vive en el depósito privado.

const esImagen = nombre => /\.(jpe?g|png|webp|gif|heic|avif)$/i.test(String(nombre || ""));
const dia = f => (f ? new Date(`${String(f).slice(0, 10)}T12:00:00`).toLocaleDateString("es-EC", { day: "numeric", month: "short" }) : "");

export default function RespaldosPlanilla({ facturas = [], titulo = "Respaldos" }) {
  const [enlaces, setEnlaces] = useState({});
  const [cargando, setCargando] = useState(true);

  const conArchivo = facturas.filter(f => f.archivo_url);
  const sinArchivo = facturas.filter(f => !f.archivo_url);

  // Se piden los enlaces cuando cambia el conjunto de facturas con archivo, no
  // en cada repintado: veinte enlaces firmados de más no le sirven a nadie.
  const claves = conArchivo.map(f => `${f.id}:${f.archivo_url}`).join(",");
  const cargar = useCallback(async () => {
    const lista = claves ? claves.split(",").map(x => { const [id, ...url] = x.split(":"); return { id, url: url.join(":") }; }) : [];
    if (!lista.length) { setEnlaces({}); setCargando(false); return; }
    setCargando(true);
    const urls = await enlacesArchivos(lista.map(f => f.url));
    const mapa = {};
    lista.forEach((f, i) => { if (urls[i]) mapa[Number(f.id)] = urls[i]; });
    setEnlaces(mapa);
    setCargando(false);
  }, [claves]);
  useEffect(() => { cargar(); }, [cargar]);

  if (!facturas.length) {
    return <div style={{ fontSize: 12.5, color: colors.muted, padding: "24px 0", textAlign: "center" }}>
      Esta planilla todavía no tiene facturas.
    </div>;
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: colors.ink }}>{titulo}</div>
        <div style={{ fontSize: 11.5, color: colors.muted }}>
          {conArchivo.length} de {facturas.length} con escaneo
        </div>
      </div>

      {/* Lo que falta, primero: es lo accionable. */}
      {sinArchivo.length > 0 && (
        <div style={{ background: colors.warningSoft, border: `1px solid ${colors.warningBorder}`, borderRadius: colors.radiusMd, padding: "9px 12px", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 700, color: colors.warning, marginBottom: 4 }}>
            <AlertTriangle size={13} /> SIN ESCANEO · {sinArchivo.length}
          </div>
          {sinArchivo.map(f => (
            <div key={f.id} style={{ fontSize: 12, color: colors.ink, padding: "1px 0", overflowWrap: "anywhere" }}>
              {f.numero_factura || "sin número"} · {f.razon_social || "sin proveedor"} · ${fmt(f.total)}
            </div>
          ))}
        </div>
      )}

      {cargando ? (
        <div style={{ fontSize: 12.5, color: colors.muted, padding: "20px 0", textAlign: "center" }}>Preparando los enlaces…</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))", gap: 8 }}>
          {conArchivo.map(f => {
            const url = enlaces[f.id];
            const imagen = esImagen(f.archivo_nombre || f.archivo_url);
            return (
              <a key={f.id} href={url || undefined} target="_blank" rel="noreferrer"
                title={f.archivo_nombre || "Abrir el respaldo"}
                style={{ display: "block", textDecoration: "none", border: `1px solid ${colors.border}`,
                  borderRadius: colors.radiusMd, overflow: "hidden", background: colors.surface,
                  cursor: url ? "pointer" : "default", opacity: url ? 1 : 0.55 }}>
                <div style={{ height: 116, background: colors.neutralSoft, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {imagen && url
                    ? <img src={url} alt={f.archivo_nombre || "Respaldo"} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    : <FileText size={26} color={colors.muted} />}
                </div>
                <div style={{ padding: "6px 8px" }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {f.numero_factura || f.archivo_nombre || "Sin número"}
                  </div>
                  <div style={{ fontSize: 10, color: colors.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {f.razon_social || "sin proveedor"} · {dia(f.fecha)}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: colors.ink, marginTop: 1 }}>${fmt(f.total)}</div>
                </div>
              </a>
            );
          })}
        </div>
      )}

      {conArchivo.length > 0 && (
        <div style={{ fontSize: 10.5, color: colors.muted, marginTop: 8, lineHeight: 1.5, display: "flex", alignItems: "center", gap: 5 }}>
          <Download size={11} />
          Los enlaces caducan a la hora: el depósito es privado y solo abre para quien tiene sesión.
        </div>
      )}
    </div>
  );
}
