import { useEffect, useState, useCallback } from "react";
import { FileText, Database, Check } from "lucide-react";
import { colors } from "../../theme/colors";
import { proformasPorRubro, enlacesDeAdjuntos } from "./compras";
import { alimentarBase } from "../../lib/baseRubros";

// Las proformas que la oficina ya tiene y no puede consultar.
//
// Cada compra se cotiza con dos o tres proveedores. Esos papeles existen —hoy
// viven en el WhatsApp de quien los pidió— y son el historial de precios más
// honesto que hay: lo que de verdad nos cobraron, no lo que dice una lista.
//
// Acá salen ordenadas por capítulo del presupuesto, que es como se pregunta:
// "¿a cómo nos han cotizado el hormigón este año?". Y desde acá se pueden
// pasar a la base de rubros, para que el próximo presupuesto arranque con el
// precio que nos dieron y no con el del año pasado.

const plata = v => (Number(v) || 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dia = f => (f ? new Date(f).toLocaleDateString("es-EC", { day: "numeric", month: "short", year: "numeric" }) : "");

export default function Proformas({ leadId, nombreProyecto, currentUser, puedeAlimentar }) {
  const [grupos, setGrupos] = useState([]);
  const [enlaces, setEnlaces] = useState({});
  const [cargando, setCargando] = useState(true);
  const [pasando, setPasando] = useState(null);
  const [aviso, setAviso] = useState("");

  const cargar = useCallback(async () => {
    if (!leadId) { setGrupos([]); setCargando(false); return; }
    setCargando(true);
    const { grupos: gs } = await proformasPorRubro(leadId);
    setGrupos(gs);
    setEnlaces(await enlacesDeAdjuntos(gs.flatMap(g => g.proformas)));
    setCargando(false);
  }, [leadId]);
  useEffect(() => { cargar(); }, [cargar]);

  /** Pasar una proforma a la base de precios, con su proveedor y su fecha. */
  async function aLaBase(p) {
    if (!p.monto) { setAviso("Esa proforma no tiene monto: sin precio no hay nada que guardar."); return; }
    setPasando(p.id); setAviso("");
    try {
      await alimentarBase([{
        descripcion: p.solicitud?.descripcion || p.nombre,
        unidad: "u", cantidad: 1,
        precio_unitario: Number(p.monto),
        capitulo: p.capitulo || "SIN CAPÍTULO",
      }], {
        tipo: "proveedor", proveedor: p.proveedor || null,
        proyecto: nombreProyecto || null, fecha: p.created_at?.split("T")[0] || null,
        fuente: "proforma", quien: currentUser,
      });
      setAviso(`Precio de ${p.proveedor || "esa proforma"} guardado en la base.`);
    } catch (e) {
      setAviso(e?.message || "No se pudo guardar en la base.");
    }
    setPasando(null);
  }

  if (!leadId) {
    return <div style={{ fontSize: 12.5, color: colors.muted, padding: "30px 0", textAlign: "center" }}>
      Elegí un proyecto para ver sus proformas.
    </div>;
  }
  if (cargando) return <div style={{ fontSize: 13, color: colors.muted, padding: "30px 0", textAlign: "center" }}>Cargando…</div>;

  if (!grupos.length) {
    return (
      <div style={{ textAlign: "center", color: colors.muted, padding: "40px 20px", fontSize: 13, lineHeight: 1.6,
        background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd }}>
        <FileText size={26} style={{ marginBottom: 8 }} />
        <div>Todavía no hay proformas cargadas en este proyecto.</div>
        <div style={{ fontSize: 12 }}>Se suben en cada solicitud de compra, con su proveedor y su monto.</div>
      </div>
    );
  }

  return (
    <div>
      {aviso && <div style={{ fontSize: 12, color: colors.inkSoft, background: colors.bg, borderRadius: 8, padding: "7px 10px", marginBottom: 10 }}>{aviso}</div>}

      {grupos.map(g => (
        <div key={g.capitulo} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.5, marginBottom: 5 }}>
            {g.capitulo.toUpperCase()} · {g.proformas.length}
          </div>
          <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, overflow: "hidden" }}>
            {g.proformas.map(p => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 12px",
                borderTop: `1px solid ${colors.neutralSoft}`, background: p.elegida ? colors.brandSoft : "transparent" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: colors.ink, overflowWrap: "anywhere" }}>
                    {p.proveedor || p.nombre}
                    {p.elegida && <span style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 700, color: colors.brand }}>SE COMPRÓ CON ESTA</span>}
                  </div>
                  <div style={{ fontSize: 11, color: colors.muted, overflowWrap: "anywhere" }}>
                    {p.solicitud?.descripcion || "—"} · {dia(p.created_at)}
                  </div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: colors.ink, whiteSpace: "nowrap" }}>
                  {p.monto ? `$${plata(p.monto)}` : "—"}
                </div>
                {enlaces[p.id] && (
                  <a href={enlaces[p.id]} target="_blank" rel="noreferrer" title="Abrir la proforma"
                    style={{ color: colors.inkSoft, display: "flex" }}><FileText size={15} /></a>
                )}
                {puedeAlimentar && p.monto && (
                  <button onClick={() => aLaBase(p)} disabled={pasando === p.id} title="Guardar este precio en la base de rubros"
                    style={{ border: `1px solid ${colors.border}`, background: "#fff", color: colors.inkSoft, borderRadius: 12,
                      padding: "3px 9px", fontSize: 10.5, fontWeight: 600, cursor: "pointer", fontFamily: colors.font,
                      display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
                    {pasando === p.id ? <Check size={11} /> : <Database size={11} />} A la base
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
