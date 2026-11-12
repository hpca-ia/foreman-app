import { useState, useEffect } from "react";
import { colors } from "../../theme/colors";
import { fmt } from "./calculos";
import { cargarOrdenes } from "./ordenesDeCambio";
import { cargarEjecutado } from "./ejecutado";
import { liquidacionDeLaObra, MODALIDADES, comoSeDice } from "./liquidacion";

// LAS DIFERENCIAS DE CANTIDAD: lo ejecutado contra lo contratado.
//
// Salen de lo que se carga en la columna «Ejecutado» del presupuesto
// actualizado. Cada una dice qué le hace a lo que se cobra y qué le hace al
// beneficio, que no es lo mismo en una obra por rubros que en una llave en
// mano (liquidacion.js).
//
// Se usa en dos lugares con la misma cuenta: debajo de la matriz del
// presupuesto actualizado —que le pasa la liquidación ya hecha— y arriba de
// Diferencias, donde la arma sola.

const plata = v => `${v < 0 ? "−" : ""}$${fmt(Math.abs(v))}`;

/**
 * @param liq        la liquidación ya calculada; sin ella, se calcula acá con
 *                   los rubros y las órdenes de la obra
 * @param modalidad  cómo se cobra la obra, si se cambió en esta sesión
 */
export default function DiferenciasDeCantidad({ obra, rubros = [], liq = null, modalidad = null, titulo = "Diferencias de cantidad" }) {
  const [propia, setPropia] = useState(null);

  useEffect(() => {
    if (liq || !obra?.id) return;
    let vivo = true;
    (async () => {
      const [oc, ej] = await Promise.all([cargarOrdenes(obra.id), cargarEjecutado(obra.id)]);
      if (!vivo) return;
      setPropia(liquidacionDeLaObra({
        obra: modalidad ? { ...obra, modalidad } : obra, rubros,
        ordenes: oc.ordenes || [], lineasDeOrdenes: oc.lineas || {}, ejecutado: ej.ejecutado || {},
      }));
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line
  }, [liq, obra?.id, modalidad, rubros]);

  const l = liq || propia;
  // Sin diferencias no hay nada que decir: no ocupa lugar.
  if (!l || !l.diferencias.length) return null;
  const t = l.totales;
  const porRubros = l.modalidad === "rubros";

  return (
    <div className="diferencias-de-cantidad" style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, marginTop: 12, marginBottom: 12 }}>
      <div style={{ padding: "10px 12px", borderBottom: `1px solid ${colors.neutralSoft}` }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: colors.ink }}>
          {titulo} · {l.diferencias.length} {l.diferencias.length === 1 ? "rubro" : "rubros"}
        </div>
        <div style={{ fontSize: 11.5, color: colors.inkSoft, marginTop: 3, lineHeight: 1.55 }}>
          Lo ejecutado contra lo contratado, de lo que ya se midió. Contrato <strong>{MODALIDADES[l.modalidad].label.toLowerCase()}</strong>:{" "}
          {porRubros
            ? <>se cobra lo ejecutado, así que la diferencia mueve el cobro en <strong>{plata(t.diferencia)}</strong>{t.honorarios !== 0 && <> ({plata(t.honorarios)} de honorarios)</>}.</>
            : <>se cobra lo contratado, así que la diferencia no mueve el cobro: mueve el costo.</>}
          {" "}En el beneficio{" "}
          <strong style={{ color: t.efecto < 0 ? colors.danger : t.efecto > 0 ? colors.success : colors.ink }}>
            {t.efecto === 0 ? "no cambia nada" : `${t.efecto > 0 ? "suma" : "resta"} ${plata(Math.abs(t.efecto))}`}
          </strong>
          {t.sinCosto > 0 && <>; {t.sinCosto === 1 ? "un rubro no tiene" : `${t.sinCosto} rubros no tienen`} costo cargado y no se sabe qué {t.sinCosto === 1 ? "le hace" : "le hacen"}</>}.
        </div>
      </div>
      {l.diferencias.map(d => (
        <div key={d.clave} className="diferencia-de-cantidad" style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 12px", borderTop: `1px solid ${colors.neutralSoft}` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, color: colors.ink }}>
              {d.numero ? <span style={{ color: colors.muted }}>{d.numero} · </span> : null}{d.descripcion}
            </div>
            <div style={{ fontSize: 11, color: colors.muted, marginTop: 1, lineHeight: 1.5 }}>
              Contratado {fmt(d.contratada)} {d.unidad} · ejecutado {fmt(d.ejecutada)} · a ${fmt(d.precio)}
              {d.costo != null ? ` · cuesta $${fmt(d.costo)}` : ""}
              <br />{comoSeDice(d, l.modalidad, fmt)}
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0, fontSize: 11.5, whiteSpace: "nowrap" }}>
            <div style={{ color: d.deltaCantidad < 0 ? colors.danger : colors.success, fontWeight: 700 }}>
              {d.deltaCantidad > 0 ? "+" : "−"}{fmt(Math.abs(d.deltaCantidad))} {d.unidad}
            </div>
            {porRubros && <div style={{ color: colors.inkSoft }}>{plata(d.deltaCobro)}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
