import { useState, useEffect, useMemo } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { fmt } from "./calculos";
import { cargarOrdenes } from "./ordenesDeCambio";
import { presupuestoActualizado, renglonesDeLaMatriz, conIva } from "./presupuestoActualizado.js";
import { excelDelPresupuesto, pdfDelPresupuesto } from "./exportarPresupuestoActualizado.js";

// EL PRESUPUESTO ACTUALIZADO, EN PANTALLA.
//
// El contrato rubro por rubro, y al lado lo que le hicieron las órdenes de
// cambio aprobadas y lo que le harían las que esperan firma. Se arma solo con
// lo que ya está —los rubros y las órdenes— y no guarda nada: abrirlo mañana
// con una orden más aprobada da otra matriz, y eso es lo que tiene que pasar.
//
// El presupuesto original, al lado, no cambia: es el papel que se firmó.

const th = { padding: "5px 6px", fontSize: 9.5, color: colors.muted, letterSpacing: 0.3, fontWeight: 700, whiteSpace: "nowrap" };
const td = { padding: "5px 6px", fontSize: 11.5, verticalAlign: "top" };
const num = { textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
// La raya que separa un grupo de columnas del siguiente.
const borde = { borderLeft: `1px solid ${colors.border}` };

const Mov = ({ v }) => (!v ? null : (
  <span style={{ color: v < 0 ? colors.danger : colors.ink }}>{v > 0 ? "+" : "−"}{fmt(Math.abs(v))}</span>
));

export default function PanelPresupuestoActualizado({ obra, rubros }) {
  const [ordenes, setOrdenes] = useState([]);
  const [lineas, setLineas] = useState({});
  const [cargando, setCargando] = useState(true);
  const [conBorradores, setConBorradores] = useState(false);
  const [ocupado, setOcupado] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true);
      const r = await cargarOrdenes(obra.id);
      if (!vivo) return;
      setOrdenes(r.ordenes || []); setLineas(r.lineas || {}); setCargando(false);
    })();
    return () => { vivo = false; };
  }, [obra?.id]);

  const matriz = useMemo(
    () => presupuestoActualizado({ rubros, ordenes, lineasDeOrdenes: lineas, obra, conBorradores }),
    [rubros, ordenes, lineas, obra, conBorradores]);
  const renglones = useMemo(() => renglonesDeLaMatriz(matriz), [matriz]);
  const t = matriz.totales;
  const borradores = ordenes.filter(o => o.estado === "borrador" && !o.anulada && (lineas[o.id] || []).length).length;

  async function bajar(que) {
    setOcupado(que); setError("");
    try {
      if (que === "excel") await excelDelPresupuesto({ matriz, obra });
      else await pdfDelPresupuesto({ matriz, obra });
    } catch (e) { setError("No se pudo armar el archivo: " + e.message); }
    setOcupado("");
  }

  if (cargando) return <div style={{ textAlign: "center", color: colors.muted, padding: "30px 0", fontSize: 13 }}>Armando el presupuesto actualizado…</div>;

  const tarjeta = (label, valor, color, nota) => (
    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: "9px 12px", minWidth: 150 }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, color: colors.muted, letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>
        {valor < 0 ? "−" : ""}${fmt(Math.abs(valor))}
      </div>
      <div style={{ fontSize: 10, color: colors.muted }}>{nota}</div>
    </div>
  );
  const con = v => (matriz.iva > 0 ? `$${fmt(conIva(v, matriz.iva))} con IVA` : "");

  return (
    <div style={{ fontFamily: colors.font }}>
      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 14, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 260, fontSize: 12, color: colors.inkSoft, lineHeight: 1.55 }}>
            <div style={{ fontWeight: 700, color: colors.ink, fontSize: 13 }}>Presupuesto actualizado</div>
            El contrato rubro por rubro, con lo que le hicieron las órdenes de cambio. <strong>Vigente</strong> es la base
            más las órdenes aprobadas: el contrato de hoy. <strong>Por aprobar</strong> va aparte y no suma al vigente.
            <strong> Proyectado</strong> es cómo quedaría si se aprueban. Todo sin IVA; el impuesto se suma al pie.
            <div style={{ marginTop: 4, color: colors.muted }}>
              {matriz.aprobadas.length ? `Aprobadas: ${matriz.aprobadas.join(", ")}` : "Sin órdenes de cambio aprobadas"}
              {" · "}
              {matriz.porAprobar.length ? `Por aprobar: ${matriz.porAprobar.join(", ")}` : "ninguna espera aprobación"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            <Button variant="outline" size="sm" disabled={!!ocupado} onClick={() => bajar("excel")}>
              <FileSpreadsheet size={13} /> {ocupado === "excel" ? "Armando…" : "Bajar en Excel"}
            </Button>
            <Button variant="primary" size="sm" disabled={!!ocupado} onClick={() => bajar("pdf")}>
              <Download size={13} /> {ocupado === "pdf" ? "Armando…" : "Bajar en PDF"}
            </Button>
          </div>
        </div>
        {/* LO QUE TODAVÍA NO SALIÓ DE LA OFICINA NO VA EN UN PAPEL PARA EL
            CLIENTE, salvo que alguien lo decida: un borrador es un precio que
            todavía puede cambiar. */}
        {borradores > 0 && (
          <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, color: colors.inkSoft, marginTop: 9, cursor: "pointer" }}>
            <input type="checkbox" checked={conBorradores} onChange={e => setConBorradores(e.target.checked)} />
            Incluir en «por aprobar» {borradores === 1 ? "la orden que está" : `las ${borradores} órdenes que están`} en borrador,
            que todavía no se {borradores === 1 ? "mandó" : "mandaron"} al cliente
          </label>
        )}
        {error && <div style={{ fontSize: 12, color: colors.danger, marginTop: 8 }}>{error}</div>}
      </div>

      <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginBottom: 12 }}>
        {tarjeta("PRESUPUESTO BASE", t.base, colors.ink, con(t.base))}
        {tarjeta(`ÓRDENES APROBADAS · ${matriz.aprobadas.length}`, t.aprobado, t.aprobado < 0 ? colors.danger : colors.ink, con(t.aprobado))}
        {tarjeta("VIGENTE", t.vigente, colors.brand, con(t.vigente))}
        {tarjeta(`POR APROBAR · ${matriz.porAprobar.length}`, t.porAprobar, colors.warning, con(t.porAprobar))}
        {tarjeta("PROYECTADO", t.proyectado, colors.inkSoft, con(t.proyectado))}
      </div>

      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1180 }}>
          <thead>
            <tr style={{ background: colors.bg }}>
              <th colSpan={4} style={th} />
              <th colSpan={2} style={{ ...th, ...borde, textAlign: "center", color: colors.ink }}>PRESUPUESTO BASE</th>
              <th colSpan={3} style={{ ...th, ...borde, textAlign: "center", color: colors.ink }}>ÓRDENES APROBADAS</th>
              <th colSpan={2} style={{ ...th, ...borde, textAlign: "center", color: colors.brand }}>VIGENTE</th>
              <th colSpan={3} style={{ ...th, ...borde, textAlign: "center", color: colors.warning }}>ÓRDENES POR APROBAR</th>
              <th colSpan={2} style={{ ...th, ...borde, textAlign: "center", color: colors.ink }}>PROYECTADO</th>
            </tr>
            <tr style={{ background: colors.bg, borderBottom: `1px solid ${colors.border}` }}>
              <th style={{ ...th, textAlign: "left" }}>N°</th>
              <th style={{ ...th, textAlign: "left" }}>DESCRIPCIÓN</th>
              <th style={th}>UND</th>
              <th style={{ ...th, ...num }}>P. UNIT</th>
              <th style={{ ...th, ...num, ...borde }}>CANT</th><th style={{ ...th, ...num }}>TOTAL</th>
              <th style={{ ...th, ...num, ...borde }}>± CANT</th><th style={{ ...th, ...num }}>± TOTAL</th><th style={th}>ORDEN</th>
              <th style={{ ...th, ...num, ...borde }}>CANT</th><th style={{ ...th, ...num }}>TOTAL</th>
              <th style={{ ...th, ...num, ...borde }}>± CANT</th><th style={{ ...th, ...num }}>± TOTAL</th><th style={th}>ORDEN</th>
              <th style={{ ...th, ...num, ...borde }}>CANT</th><th style={{ ...th, ...num }}>TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {renglones.map((r, i) => {
              if (r.tipo === "capitulo" || r.tipo === "bloque") {
                const e = { ...td, ...num, fontWeight: 700, fontSize: 11, color: colors.inkSoft };
                return (
                  <tr key={`c${i}`} style={{ background: colors.neutralSoft }}>
                    <td colSpan={4} style={{ ...td, fontWeight: 700, fontSize: 11, color: colors.ink, letterSpacing: 0.2 }}>
                      {r.nombre}
                      {r.tipo === "bloque" && (
                        <span style={{ marginLeft: 8, fontSize: 9.5, fontWeight: 700, borderRadius: 9, padding: "1px 6px",
                          color: r.estado === "APROBADA" ? colors.success : colors.warning,
                          background: r.estado === "APROBADA" ? colors.successSoft : colors.warningSoft }}>{r.estado}</span>
                      )}
                    </td>
                    <td style={{ ...e, ...borde }} /><td style={e}>{r.sub.base ? fmt(r.sub.base) : ""}</td>
                    <td style={{ ...e, ...borde }} /><td style={e}><Mov v={r.sub.aprobado} /></td><td style={e} />
                    <td style={{ ...e, ...borde }} /><td style={e}>{r.sub.vigente ? fmt(r.sub.vigente) : ""}</td>
                    <td style={{ ...e, ...borde }} /><td style={e}><Mov v={r.sub.porAprobar} /></td><td style={e} />
                    <td style={{ ...e, ...borde }} /><td style={e}>{r.sub.proyectado ? fmt(r.sub.proyectado) : ""}</td>
                  </tr>
                );
              }
              if (r.tipo === "pie") {
                const e = { ...td, ...num, fontWeight: r.fuerte ? 700 : 400, fontSize: r.fuerte ? 12.5 : 11.5,
                  color: r.fuerte ? colors.ink : colors.muted };
                const v = r.valores;
                return (
                  <tr key={`p${i}`} style={{ background: colors.bg, borderTop: `1px solid ${colors.border}` }}>
                    <td colSpan={4} style={{ ...e, textAlign: "right" }}>{r.etiqueta}</td>
                    <td style={{ ...e, ...borde }} /><td style={e}>${fmt(v.base)}</td>
                    <td style={{ ...e, ...borde }} /><td style={e}>${fmt(v.aprobado)}</td><td style={e} />
                    <td style={{ ...e, ...borde }} /><td style={{ ...e, color: r.fuerte ? colors.brand : e.color }}>${fmt(v.vigente)}</td>
                    <td style={{ ...e, ...borde }} /><td style={e}>${fmt(v.porAprobar)}</td><td style={e} />
                    <td style={{ ...e, ...borde }} /><td style={e}>${fmt(v.proyectado)}</td>
                  </tr>
                );
              }
              // Un rubro al que una orden le hizo algo se tiene que ver de un
              // vistazo entre ciento veinte que no cambiaron.
              const movido = r.aprobado.ordenes.length > 0 || r.porAprobar.ordenes.length > 0;
              return (
                <tr key={r.id} style={{ borderTop: `1px solid ${colors.neutralSoft}`, background: movido && !r.deOrden ? "#FFFBEB" : "transparent" }}>
                  <td style={{ ...td, color: colors.muted, whiteSpace: "nowrap" }}>{r.numero}</td>
                  <td style={{ ...td, color: colors.ink, minWidth: 220 }}>{r.descripcion}</td>
                  <td style={{ ...td, textAlign: "center", color: colors.muted }}>{r.unidad}</td>
                  <td style={{ ...td, ...num, color: colors.muted }}>{r.precio ? fmt(r.precio) : ""}</td>
                  <td style={{ ...td, ...num, ...borde }}>{r.base.cantidad ? fmt(r.base.cantidad) : ""}</td>
                  <td style={{ ...td, ...num }}>{r.base.total ? fmt(r.base.total) : ""}</td>
                  <td style={{ ...td, ...num, ...borde }}><Mov v={r.aprobado.cantidad} /></td>
                  <td style={{ ...td, ...num }}><Mov v={r.aprobado.total} /></td>
                  <td style={{ ...td, textAlign: "center", fontSize: 10, color: colors.success, whiteSpace: "nowrap" }}>{r.aprobado.ordenes.join(", ")}</td>
                  <td style={{ ...td, ...num, ...borde }}>{r.vigente.cantidad ? fmt(r.vigente.cantidad) : ""}</td>
                  <td style={{ ...td, ...num, fontWeight: 600 }}>{r.vigente.total ? fmt(r.vigente.total) : ""}</td>
                  <td style={{ ...td, ...num, ...borde }}><Mov v={r.porAprobar.cantidad} /></td>
                  <td style={{ ...td, ...num }}><Mov v={r.porAprobar.total} /></td>
                  <td style={{ ...td, textAlign: "center", fontSize: 10, color: colors.warning, whiteSpace: "nowrap" }}>{r.porAprobar.ordenes.join(", ")}</td>
                  <td style={{ ...td, ...num, ...borde }}>{r.proyectado.cantidad ? fmt(r.proyectado.cantidad) : ""}</td>
                  <td style={{ ...td, ...num, fontWeight: 600 }}>{r.proyectado.total ? fmt(r.proyectado.total) : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
