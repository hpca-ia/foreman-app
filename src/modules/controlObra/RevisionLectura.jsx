import { useMemo, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { fmt } from "./calculos";
import { CLASES_DOC } from "./pagos";
import { facturasPorLeer, estadoBodega, PROBLEMAS_BODEGA } from "./itemsComprados";
import { leerLasQueFaltan, leerRenglones } from "./renglones";

// CUÁNTOS DOCUMENTOS ESTÁN LEÍDOS, y cuáles no se pudieron leer.
//
// Va en Qué se compró y en Facturas, igual en los dos: en Qué se compró dice
// sobre cuántos documentos está hecha la suma, y en Facturas es donde se
// arreglan —se abre el documento y se le sube el papel—. Que cada pantalla
// tuviera su propia cuenta sería la manera segura de que un día no coincidan.

const dia = f => (f ? new Date(`${String(f).slice(0, 10)}T12:00:00`).toLocaleDateString("es-EC", { day: "numeric", month: "short", year: "2-digit" }) : "");
const caja = { background: "#fff", border: `1px solid ${colors.border}`, borderRadius: 10, padding: "12px 14px", marginBottom: 12 };

const Enlace = ({ onClick, children }) => (
  <button onClick={onClick}
    style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", fontFamily: colors.font,
      fontSize: 12.5, color: colors.brand, textDecoration: "underline" }}>{children}</button>
);

/**
 * @param onLeido  se llama después de leer, para que quien la usa recargue.
 * @param onAbrir  si está, cada documento de las listas se puede abrir (en
 *                 Facturas, para subirle el papel).
 */
export default function RevisionLectura({ facturas = [], onLeido, onAbrir }) {
  const [leyendo, setLeyendo] = useState(null);       // { hechas, de }
  const [fallas, setFallas] = useState([]);
  const [verLista, setVerLista] = useState(null);     // sin_papel | ilegible | no_cuadra
  const [releyendo, setReleyendo] = useState(null);   // id del documento
  const parar = useRef(false);

  const porLeer = facturasPorLeer(facturas);
  const conPapel = facturas.filter(f => f.archivo_url && f.clase !== "anticipo").length;
  const conProblema = useMemo(() => {
    const m = { sin_papel: [], ilegible: [], no_cuadra: [] };
    facturas.forEach(f => { const e = estadoBodega(f); if (m[e]) m[e].push(f); });
    return m;
  }, [facturas]);
  const ilegibles = conProblema.ilegible.length;
  const noCuadran = conProblema.no_cuadra.length;
  const sinPapel = conProblema.sin_papel.length;

  function abrirLista(cual) { setVerLista(v => (v === cual ? null : cual)); }

  // Uno solo, a pedido: el que se leyó mal antes de un arreglo, o el que
  // tiene ahora una foto mejor. Los ilegibles no se reintentan solos.
  async function releer(f) {
    setReleyendo(f.id);
    const r = await leerRenglones(f);
    setReleyendo(null);
    if (r.error) setFallas([{ factura: f, error: r.error }]);
    await onLeido?.();
  }

  async function leerTodas() {
    parar.current = false; setFallas([]);
    setLeyendo({ hechas: 0, de: porLeer.length });
    const r = await leerLasQueFaltan(facturas, {
      alAvanzar: estado => setLeyendo({ ...estado }),
      seguir: () => !parar.current,
    });
    setFallas(r.fallas); setLeyendo(null);
    await onLeido?.();
  }

  return (
    <>
      <div style={{ ...caja, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 240, fontSize: 12.5, color: colors.inkSoft, lineHeight: 1.5 }}>
          <strong style={{ color: colors.ink }}>{conPapel - porLeer.length - ilegibles - noCuadran} de {conPapel}</strong> documentos con papel ya tienen sus renglones.
          {porLeer.length > 0 && <> Faltan <strong>{porLeer.length}</strong>.</>}
          {ilegibles > 0 && <> <Enlace onClick={() => abrirLista("ilegible")}>{ilegibles} no se {ilegibles === 1 ? "pudo" : "pudieron"} leer</Enlace> (recibos a mano, fotos borrosas).</>}
          {noCuadran > 0 && <> <Enlace onClick={() => abrirLista("no_cuadra")}>{noCuadran} no {noCuadran === 1 ? "cuadra" : "cuadran"} con su total</Enlace> y {noCuadran === 1 ? "quedó" : "quedaron"} fuera de la suma.</>}
          {sinPapel > 0 && <> <Enlace onClick={() => abrirLista("sin_papel")}>{sinPapel} no {sinPapel === 1 ? "tiene" : "tienen"} archivo</Enlace> y no se pueden leer.</>}
        </div>
        {leyendo ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
            <span>Leyendo {leyendo.hechas} de {leyendo.de}…</span>
            <Button variant="outline" size="sm" onClick={() => { parar.current = true; }}>Parar</Button>
          </div>
        ) : porLeer.length > 0 && (
          <Button size="sm" onClick={leerTodas}>
            <Sparkles size={12} /> Leer los {porLeer.length} que faltan
          </Button>
        )}
      </div>

      {/* Decir "6 no tienen archivo" y no decir cuáles es mandar a alguien a
          revisar ochenta documentos. */}
      {verLista && conProblema[verLista]?.length > 0 && (
        <div style={{ ...caja, fontSize: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>{PROBLEMAS_BODEGA[verLista].titulo}</div>
          <div style={{ fontSize: 11, color: colors.muted, marginBottom: 6 }}>{PROBLEMAS_BODEGA[verLista].hacer}</div>
          {conProblema[verLista].map(f => (
            <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0", borderTop: `1px solid ${colors.border}`, flexWrap: "wrap" }}>
              <span style={{ width: 70, color: colors.muted }}>{dia(f.fecha)}</span>
              <span style={{ flex: 1, minWidth: 160 }}>
                {f.razon_social || "Sin proveedor"}
                {f.numero_factura ? <span style={{ color: colors.muted }}> · {f.numero_factura}</span> : ""}
                <span style={{ color: colors.muted }}> · {CLASES_DOC[f.clase || "factura"]?.label || f.clase}</span>
              </span>
              <span style={{ width: 80, color: colors.muted }}>{f.origen === "caja_chica" ? "caja chica" : "planilla"}</span>
              <span style={{ width: 80, textAlign: "right" }}>${fmt(Number(f.total))}</span>
              {onAbrir && <Button variant="outline" size="sm" onClick={() => onAbrir(f)}>Abrir</Button>}
              {verLista !== "sin_papel" && (
                <Button variant="outline" size="sm" disabled={!!releyendo || !!leyendo} onClick={() => releer(f)}>
                  {releyendo === f.id ? "Leyendo…" : "Volver a leer"}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {leyendo && (
        <div style={{ height: 4, background: colors.border, borderRadius: 2, margin: "-6px 0 12px", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${(leyendo.hechas / Math.max(1, leyendo.de)) * 100}%`, background: colors.brand, transition: "width .3s" }} />
        </div>
      )}
      {fallas.length > 0 && (
        <div style={{ ...caja, background: colors.warningSoft, borderColor: colors.warningBorder, fontSize: 12 }}>
          <strong>{fallas.length} no se pudieron leer esta vez</strong> y quedan para la próxima:
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {fallas.slice(0, 8).map(({ factura, error }) => (
              <li key={factura.id}>{factura.razon_social || "Sin proveedor"} {factura.numero_factura || ""} — {error}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
