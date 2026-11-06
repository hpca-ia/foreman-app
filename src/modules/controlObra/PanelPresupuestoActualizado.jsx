import { useState, useEffect, useMemo, useCallback } from "react";
import { Download, FileSpreadsheet, Save, Trash2 } from "lucide-react";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import { fmt } from "./calculos";
import { cargarOrdenes } from "./ordenesDeCambio";
import { presupuestoActualizado, renglonesDeLaMatriz, conIva } from "./presupuestoActualizado.js";
import { excelDelPresupuesto, pdfDelPresupuesto } from "./exportarPresupuestoActualizado.js";
import { simulacionesDe, guardarSimulacion, borrarSimulacion, ajustesLimpios } from "./simulacionesDePresupuesto.js";

// EL PRESUPUESTO ACTUALIZADO, EN PANTALLA.
//
// El contrato rubro por rubro, y al lado lo que le hicieron las órdenes de
// cambio aprobadas, lo que le harían las que esperan firma, y lo que se quiera
// proyectar a mano. Las tres primeras cosas se arman solas con lo que ya está
// —los rubros y las órdenes— y no se guardan: abrirlo mañana con una orden más
// aprobada da otra matriz, y eso es lo que tiene que pasar.
//
// Lo único que se guarda es el ajuste a mano, como una simulación con nombre.
// El presupuesto original, al lado, no cambia: es el papel que se firmó.

const th = { padding: "5px 6px", fontSize: 9.5, color: colors.muted, letterSpacing: 0.3, fontWeight: 700, whiteSpace: "nowrap" };
const td = { padding: "5px 6px", fontSize: 11.5, verticalAlign: "top" };
const num = { textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
// La raya que separa un grupo de columnas del siguiente.
const borde = { borderLeft: `1px solid ${colors.border}` };
const VIOLETA = "#6D28D9";

const Mov = ({ v, color }) => (!v ? null : (
  <span style={{ color: v < 0 ? colors.danger : (color || colors.ink) }}>{v > 0 ? "+" : "−"}{fmt(Math.abs(v))}</span>
));
const plata = v => `${v < 0 ? "−" : ""}$${fmt(Math.abs(v))}`;

export default function PanelPresupuestoActualizado({ obra, rubros, currentUser }) {
  const [ordenes, setOrdenes] = useState([]);
  const [lineas, setLineas] = useState({});
  const [cargando, setCargando] = useState(true);
  const [conBorradores, setConBorradores] = useState(false);
  const [ocupado, setOcupado] = useState("");
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  // LO QUE SE PROYECTA A MANO. Se guarda tal como se escribe —"-", "-5"— para
  // que el campo no pelee con quien está tipeando; la cuenta lo lee como número.
  const [ajustes, setAjustes] = useState({});
  const [simulaciones, setSimulaciones] = useState([]);
  const [simulacion, setSimulacion] = useState(null);   // la guardada que está abierta
  const [nombre, setNombre] = useState("");
  const [sinTabla, setSinTabla] = useState(false);

  const cargarSimulaciones = useCallback(async () => {
    const r = await simulacionesDe(obra.id);
    setSimulaciones(r.simulaciones || []);
    setSinTabla(!!r.sinTabla);
    if (r.error && !r.sinTabla) setError(r.error);
  }, [obra?.id]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true);
      const r = await cargarOrdenes(obra.id);
      if (!vivo) return;
      setOrdenes(r.ordenes || []); setLineas(r.lineas || {}); setCargando(false);
    })();
    cargarSimulaciones();
    return () => { vivo = false; };
  }, [obra?.id, cargarSimulaciones]);

  const numeros = useMemo(() => ajustesLimpios(ajustes), [ajustes]);
  const matriz = useMemo(
    () => presupuestoActualizado({ rubros, ordenes, lineasDeOrdenes: lineas, obra, conBorradores, ajustes: numeros }),
    [rubros, ordenes, lineas, obra, conBorradores, numeros]);
  const renglones = useMemo(() => renglonesDeLaMatriz(matriz), [matriz]);
  const t = matriz.totales;
  const borradores = ordenes.filter(o => o.estado === "borrador" && !o.anulada && (lineas[o.id] || []).length).length;
  const hayAjustes = Object.keys(numeros).length > 0;
  // ¿Lo que está en pantalla es lo mismo que quedó guardado?
  const sinGuardar = JSON.stringify(numeros) !== JSON.stringify(ajustesLimpios(simulacion?.ajustes || {}))
    || (simulacion && nombre.trim() !== (simulacion.nombre || ""));

  async function bajar(que) {
    setOcupado(que); setError("");
    try {
      const datos = { matriz, obra, simulacion: hayAjustes ? (nombre.trim() || "Simulación") : null };
      if (que === "excel") await excelDelPresupuesto(datos);
      else await pdfDelPresupuesto(datos);
    } catch (e) { setError("No se pudo armar el archivo: " + e.message); }
    setOcupado("");
  }

  function abrir(id) {
    const s = simulaciones.find(x => String(x.id) === String(id)) || null;
    setSimulacion(s); setNombre(s?.nombre || ""); setAjustes(s ? { ...s.ajustes } : {}); setAviso("");
  }

  async function guardar(comoNueva = false) {
    if (!nombre.trim()) { setError("Ponele un nombre a la simulación para poder encontrarla después."); return; }
    setOcupado("guardar"); setError("");
    const r = await guardarSimulacion({ id: comoNueva ? null : simulacion?.id, obraId: obra.id, nombre, ajustes: numeros, quien: currentUser });
    setOcupado("");
    if (r.error) { setError(r.error); return; }
    setSimulacion(r.simulacion); setNombre(r.simulacion.nombre);
    setAviso(`Quedó guardada «${r.simulacion.nombre}».`);
    await cargarSimulaciones();
  }

  async function borrar() {
    if (!simulacion || !window.confirm(`¿Borrar la simulación «${simulacion.nombre}»?`)) return;
    const err = await borrarSimulacion(simulacion.id);
    if (err) { setError(err); return; }
    setSimulacion(null); setNombre(""); setAjustes({}); setAviso("");
    await cargarSimulaciones();
  }

  const poner = (id, valor) => setAjustes(a => {
    const b = { ...a };
    if (valor === "" || valor == null) delete b[id]; else b[id] = valor;
    return b;
  });

  if (cargando) return <div style={{ textAlign: "center", color: colors.muted, padding: "30px 0", fontSize: 13 }}>Armando el presupuesto actualizado…</div>;

  const tarjeta = (label, valor, color, nota) => (
    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: "9px 12px", minWidth: 150 }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, color: colors.muted, letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>{plata(valor)}</div>
      <div style={{ fontSize: 10, color: colors.muted }}>{nota}</div>
    </div>
  );
  const con = v => (matriz.iva > 0 ? `${plata(conIva(v, matriz.iva))} con IVA` : "");
  const caja = { background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 14, marginBottom: 12 };

  return (
    <div style={{ fontFamily: colors.font }}>
      <div style={caja}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 260, fontSize: 12, color: colors.inkSoft, lineHeight: 1.55 }}>
            <div style={{ fontWeight: 700, color: colors.ink, fontSize: 13 }}>Presupuesto actualizado</div>
            El contrato rubro por rubro, con lo que le hicieron las órdenes de cambio. <strong>Vigente</strong> es la base
            más las órdenes aprobadas: el contrato de hoy. <strong>Por aprobar</strong> va aparte y no suma al vigente.
            <strong> Ajuste</strong> es lo que proyectes a mano. <strong>Proyectado</strong> es el vigente más las dos cosas.
            Los honorarios se mueven con todo, en su rubro. Todo sin IVA; el impuesto se suma al pie.
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
        {error && <div style={{ fontSize: 12, color: colors.danger, marginTop: 8, lineHeight: 1.5 }}>{error}</div>}
      </div>

      <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginBottom: 12 }}>
        {tarjeta("PRESUPUESTO BASE", t.base, colors.ink, con(t.base))}
        {tarjeta(`ÓRDENES APROBADAS · ${matriz.ordenesAprobadas.cuantas}`, t.aprobado, t.aprobado < 0 ? colors.danger : colors.ink, con(t.aprobado))}
        {tarjeta("VIGENTE", t.vigente, colors.brand, con(t.vigente))}
        {tarjeta(`POR APROBAR · ${matriz.porAprobar.length}`, t.porAprobar, colors.warning, con(t.porAprobar))}
        {matriz.ajuste.hay && tarjeta("AJUSTE A MANO", t.manual, VIOLETA, con(t.manual))}
        {tarjeta("PROYECTADO", t.proyectado, colors.inkSoft, con(t.proyectado))}
      </div>

      {/* ── CADA ORDEN, ENTERA ────────────────────────────────────────
          En la matriz una orden queda repartida: sus cambios de cantidad en
          el rubro de cada uno, su honorario en el rubro de honorarios, y lo
          nuevo en su bloque. Acá va lo que vale cada una, con los mismos
          números del documento que el cliente firma. */}
      {matriz.ordenes.length > 0 && (
        <div style={{ ...caja, padding: 0, overflowX: "auto" }}>
          <div style={{ padding: "9px 12px 5px", fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.4 }}>
            LAS ÓRDENES DE CAMBIO, CADA UNA CON SU VALOR
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
            <thead>
              <tr style={{ background: colors.bg }}>
                {["ORDEN", "TÍTULO", "ESTADO", "ADICIONES", "REDUCCIONES", "NETO", "HONORARIOS", "SUBTOTAL SIN IVA", "IVA", "TOTAL"].map((h, i) => (
                  <th key={h} style={{ ...th, textAlign: i >= 3 ? "right" : "left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matriz.ordenes.map(o => (
                <tr key={o.id} style={{ borderTop: `1px solid ${colors.neutralSoft}` }}>
                  <td style={{ ...td, fontWeight: 700, whiteSpace: "nowrap" }}>{o.codigo}</td>
                  <td style={td}>{o.titulo}</td>
                  <td style={{ ...td, fontSize: 10, fontWeight: 700, whiteSpace: "nowrap",
                    color: o.estado === "APROBADA" ? colors.success : colors.warning }}>{o.estado}</td>
                  <td style={{ ...td, ...num }}>{fmt(o.adiciones)}</td>
                  <td style={{ ...td, ...num, color: o.reducciones ? colors.danger : colors.muted }}>{o.reducciones ? `−${fmt(Math.abs(o.reducciones))}` : ""}</td>
                  <td style={{ ...td, ...num }}>{plata(o.neto)}</td>
                  <td style={{ ...td, ...num }}>{plata(o.honorarios)}</td>
                  <td style={{ ...td, ...num, fontWeight: 600 }}>{plata(o.subtotal)}</td>
                  <td style={{ ...td, ...num, color: colors.muted }}>{plata(o.iva)}</td>
                  <td style={{ ...td, ...num, fontWeight: 700 }}>{plata(o.total)}</td>
                </tr>
              ))}
              {[["TOTAL DE LAS APROBADAS", matriz.ordenesAprobadas, colors.success], ["TOTAL DE LAS QUE ESPERAN APROBACIÓN", matriz.ordenesPorAprobar, colors.warning]]
                .filter(([, x]) => x.cuantas > 0).map(([texto, x, color]) => (
                  <tr key={texto} style={{ background: colors.bg, borderTop: `1px solid ${colors.border}` }}>
                    <td colSpan={5} style={{ ...td, textAlign: "right", fontWeight: 700, fontSize: 10.5, color }}>{texto}</td>
                    <td style={{ ...td, ...num, fontWeight: 700 }}>{plata(x.neto)}</td>
                    <td style={{ ...td, ...num, fontWeight: 700 }}>{plata(x.honorarios)}</td>
                    <td style={{ ...td, ...num, fontWeight: 700 }}>{plata(x.subtotal)}</td>
                    <td style={{ ...td, ...num, color: colors.muted }}>{plata(x.iva)}</td>
                    <td style={{ ...td, ...num, fontWeight: 700 }}>{plata(x.total)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── PROYECTAR A MANO ──────────────────────────────────────────
          "Si sacamos esto y bajamos aquello, ¿en cuánto queda?". Se escribe
          la cantidad que se suma o se resta en la columna AJUSTE de cada
          rubro, y los honorarios se mueven solos. No toca el contrato ni el
          control: es una simulación, y se guarda con nombre para volver. */}
      <div style={{ ...caja, borderLeft: `3px solid ${VIOLETA}` }}>
        <div style={{ fontSize: 12, color: colors.inkSoft, lineHeight: 1.55 }}>
          <strong style={{ color: colors.ink }}>Proyectar a mano.</strong> En la columna <strong style={{ color: VIOLETA }}>AJUSTE</strong> de
          cada rubro escribí cuánta cantidad sumás o restás: <strong>5</strong> para aumentar, <strong>−5</strong> para reducir, o
          «quitar» para sacar el rubro entero. Va al precio del contrato.
          {matriz.honorariosPct > 0
            ? <> Los honorarios se ajustan solos, con el {matriz.honorariosPct} % del contrato, en su rubro.</>
            : <> Esta obra no tiene honorarios cargados en el contrato, así que el ajuste no mueve ninguno.</>}
          {" "}No toca el contrato ni el control de obra.
        </div>
        {matriz.ajuste.hay && (
          <div style={{ fontSize: 12, color: colors.ink, marginTop: 6 }}>
            El ajuste suma <strong style={{ color: matriz.ajuste.neto < 0 ? colors.danger : VIOLETA }}>{plata(matriz.ajuste.neto)}</strong> en rubros
            {matriz.ajuste.honorarios !== 0 && <> y <strong style={{ color: matriz.ajuste.honorarios < 0 ? colors.danger : VIOLETA }}>{plata(matriz.ajuste.honorarios)}</strong> en honorarios</>}
            : <strong>{plata(matriz.ajuste.total)}</strong> sin IVA, {plata(conIva(matriz.ajuste.total, matriz.iva))} con IVA.
          </div>
        )}
        <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap", marginTop: 9 }}>
          {simulaciones.length > 0 && (
            <select value={simulacion?.id || ""} onChange={e => abrir(e.target.value)}
              style={{ ...inputStyle, padding: "5px 8px", fontSize: 12, width: "auto", maxWidth: 260 }}>
              <option value="">Simulación nueva</option>
              {simulaciones.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}
            </select>
          )}
          <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre de la simulación"
            style={{ ...inputStyle, padding: "5px 8px", fontSize: 12, width: 230 }} />
          <Button variant="outline" size="sm" disabled={!!ocupado || (!hayAjustes && !simulacion)} onClick={() => guardar(false)}>
            <Save size={12} /> {ocupado === "guardar" ? "Guardando…" : simulacion ? "Guardar cambios" : "Guardar"}
          </Button>
          {simulacion && (
            <Button variant="outline" size="sm" disabled={!!ocupado} onClick={() => guardar(true)}>Guardar como otra</Button>
          )}
          {hayAjustes && (
            <button onClick={() => { setAjustes({}); setAviso(""); }}
              style={{ background: "none", border: "none", cursor: "pointer", fontFamily: colors.font, fontSize: 11.5,
                color: colors.muted, textDecoration: "underline" }}>
              limpiar los ajustes
            </button>
          )}
          {simulacion && (
            <button onClick={borrar} title="Borrar esta simulación"
              style={{ background: "none", border: "none", cursor: "pointer", color: colors.danger, display: "flex" }}>
              <Trash2 size={13} />
            </button>
          )}
          {hayAjustes && sinGuardar && <span style={{ fontSize: 11, color: colors.warning }}>sin guardar</span>}
        </div>
        {sinTabla && (
          <div style={{ fontSize: 11.5, color: colors.warning, marginTop: 7, lineHeight: 1.5 }}>
            Para guardar simulaciones falta correr la migración 169. Mientras tanto podés ajustar y bajar el PDF o el
            Excel, pero al salir de esta pantalla los ajustes se pierden.
          </div>
        )}
        {aviso && <div style={{ fontSize: 12, color: colors.success, marginTop: 7 }}>{aviso}</div>}
      </div>

      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1340 }}>
          <thead>
            <tr style={{ background: colors.bg }}>
              <th colSpan={4} style={th} />
              <th colSpan={2} style={{ ...th, ...borde, textAlign: "center", color: colors.ink }}>PRESUPUESTO BASE</th>
              <th colSpan={3} style={{ ...th, ...borde, textAlign: "center", color: colors.ink }}>ÓRDENES APROBADAS</th>
              <th colSpan={2} style={{ ...th, ...borde, textAlign: "center", color: colors.brand }}>VIGENTE</th>
              <th colSpan={3} style={{ ...th, ...borde, textAlign: "center", color: colors.warning }}>ÓRDENES POR APROBAR</th>
              <th colSpan={2} style={{ ...th, ...borde, textAlign: "center", color: VIOLETA }}>AJUSTE A MANO</th>
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
              <th style={{ ...th, ...num, ...borde }}>± CANT</th><th style={{ ...th, ...num }}>± TOTAL</th>
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
                      {/* EL SUBTOTAL DE ESTE BLOQUE NO ES LA ORDEN ENTERA: lo dice acá. */}
                      {r.tipo === "bloque" && r.aclaracion && (
                        <div style={{ fontWeight: 400, fontSize: 10.5, color: colors.inkSoft, marginTop: 2, lineHeight: 1.45, maxWidth: 560 }}>
                          {r.aclaracion}
                        </div>
                      )}
                    </td>
                    <td style={{ ...e, ...borde }} /><td style={e}>{r.sub.base ? fmt(r.sub.base) : ""}</td>
                    <td style={{ ...e, ...borde }} /><td style={e}><Mov v={r.sub.aprobado} /></td><td style={e} />
                    <td style={{ ...e, ...borde }} /><td style={e}>{r.sub.vigente ? fmt(r.sub.vigente) : ""}</td>
                    <td style={{ ...e, ...borde }} /><td style={e}><Mov v={r.sub.porAprobar} /></td><td style={e} />
                    <td style={{ ...e, ...borde }} /><td style={e}><Mov v={r.sub.manual} color={VIOLETA} /></td>
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
                    <td style={{ ...e, ...borde }} /><td style={e}>{plata(v.base)}</td>
                    <td style={{ ...e, ...borde }} /><td style={e}>{plata(v.aprobado)}</td><td style={e} />
                    <td style={{ ...e, ...borde }} /><td style={{ ...e, color: r.fuerte ? colors.brand : e.color }}>{plata(v.vigente)}</td>
                    <td style={{ ...e, ...borde }} /><td style={e}>{plata(v.porAprobar)}</td><td style={e} />
                    <td style={{ ...e, ...borde }} /><td style={{ ...e, color: v.manual ? VIOLETA : e.color }}>{v.manual ? plata(v.manual) : ""}</td>
                    <td style={{ ...e, ...borde }} /><td style={e}>{plata(v.proyectado)}</td>
                  </tr>
                );
              }
              // Un rubro al que algo le pasó se tiene que ver de un vistazo
              // entre ciento veinte que no cambiaron.
              const movido = r.aprobado.total || r.porAprobar.total || r.manual.total
                || r.aprobado.ordenes.length || r.porAprobar.ordenes.length;
              const ajustable = !r.deOrden && !r.honorario;
              // Lo que este rubro tendría sin el ajuste: es lo que "quitar" saca.
              const sinAjuste = Math.round((r.vigente.cantidad + r.porAprobar.cantidad) * 10000) / 10000;
              const escrito = ajustes[r.id];
              return (
                <tr key={r.id} style={{ borderTop: `1px solid ${colors.neutralSoft}`,
                  background: r.manual.total ? "#F5F3FF" : movido && !r.deOrden ? "#FFFBEB" : "transparent" }}>
                  <td style={{ ...td, color: colors.muted, whiteSpace: "nowrap" }}>{r.numero}</td>
                  <td style={{ ...td, color: colors.ink, minWidth: 220 }}>
                    {r.descripcion}
                    {r.honorario && !r.deOrden && (
                      <div style={{ fontSize: 10, color: colors.muted }}>se mueve con las órdenes y con el ajuste a mano</div>
                    )}
                  </td>
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
                  <td style={{ ...td, ...num, ...borde }}>
                    {ajustable ? (
                      <>
                        <input type="number" step="any" value={escrito ?? ""} placeholder="±"
                          onChange={e => poner(r.id, e.target.value)}
                          title="Cantidad que se suma, o se resta si es negativa"
                          style={{ width: 62, padding: "2px 5px", fontSize: 11.5, textAlign: "right", fontFamily: colors.font,
                            border: `1px solid ${escrito ? VIOLETA : colors.border}`, borderRadius: 5, outline: "none",
                            color: Number(escrito) < 0 ? colors.danger : colors.ink, background: "#fff" }} />
                        {sinAjuste > 0 && (
                          <div>
                            <button onClick={() => poner(r.id, r.manual.cantidad === -sinAjuste ? "" : String(-sinAjuste))}
                              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: colors.font,
                                fontSize: 9.5, color: colors.muted, textDecoration: "underline" }}>
                              {r.manual.cantidad === -sinAjuste ? "volver a poner" : "quitar"}
                            </button>
                          </div>
                        )}
                      </>
                    ) : null}
                  </td>
                  <td style={{ ...td, ...num }}><Mov v={r.manual.total} color={VIOLETA} /></td>
                  <td style={{ ...td, ...num, ...borde }}>{r.proyectado.cantidad ? fmt(r.proyectado.cantidad) : ""}</td>
                  <td style={{ ...td, ...num, fontWeight: 600 }}>{r.proyectado.total ? fmt(r.proyectado.total) : (movido ? "0,00" : "")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
