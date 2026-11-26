// COMPARAR LAS COTIZACIONES DE VARIAS EMPRESAS Y ELEGIR CUÁL ENTRA.
//
// Hernán, 26/11/2026: «Al armar presupuestos se cotiza de distintas empresas y
// vienen distintos presupuestos... ¿cómo se puede comparar los distintos
// presupuestos recibidos y posterior a eso escoger la mejor opción para que
// ingrese al presupuesto? Una especie de matriz». «Y no solo por rubros,
// porque cada empresa puede cotizar de manera distinta o nombrar distinto. Se
// puede poner en tipo matriz los rubros y los totales».
//
// Acá se suben las cotizaciones SIN que entren al presupuesto. NOVA las lee y
// propone qué rubros cubre cada renglón; eso se corrige en «revisar
// renglones». La matriz pone los rubros en filas y una columna por empresa;
// se elige por capítulo o por rubro, y recién al confirmar el costo elegido
// pasa al presupuesto. La cuenta vive en matrizDeCotizaciones.js.
//
// SE GUARDA SOLO: lo que se elige y lo que se corrige queda guardado al
// tocarlo, con el estado al lado. Lo único que pide confirmación es pasar los
// precios al presupuesto, y se confirma acá mismo, viendo qué cambia.
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { ArrowLeft, Upload, Check, ListChecks, X } from "lucide-react";
import { colors } from "../../theme/colors";
import { guardarOriginal } from "../../lib/archivosPresupuesto";
import { rubrosDeLaBase } from "./llenarBase";
import { matrizDeCotizaciones, elegir, planDeAplicar, elegidosPorCotizacion, elegidosDe, totalDelRenglon } from "./matrizDeCotizaciones.js";
import { cuadreDeLaLectura } from "./emparejarCotizacion.js";
import { cotizacionesDe, guardarCotizacion, actualizarCotizacion, borrarCotizacion, leerCotizacionDeArchivo } from "./cotizacionesDelPresupuesto";

const n = v => Number(v) || 0;
const plata = v => n(v).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const DE_DONDE = {
  presupuesto: "en proporción a lo que esos rubros valen hoy en el presupuesto",
  otras: "en proporción a lo que cotizaron las otras empresas renglón por renglón",
  iguales: "a partes iguales, porque no hay con qué medir la proporción: revisalo",
};

const th = { padding: "8px 9px", textAlign: "right", verticalAlign: "top", borderBottom: `1.5px solid ${colors.border}`, fontSize: 11.5, minWidth: 150 };
const td = { padding: "6px 9px", textAlign: "right", verticalAlign: "top", borderBottom: `1px solid ${colors.neutralSoft}`, fontSize: 12 };
const chico = { fontSize: 10.5, color: colors.muted, lineHeight: 1.4 };
const pastilla = (color, fondo) => ({ fontSize: 9.5, fontWeight: 700, color, background: fondo, borderRadius: 9, padding: "1px 6px", marginLeft: 5, whiteSpace: "nowrap" });
const enlace = { background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: colors.font, fontSize: 10.5, color: colors.brand, textDecoration: "underline" };

export default function MatrizCotizaciones({ presupuesto, capitulos = [], items = [], currentUser, puedeEditar = true, onCerrar, onAplicar, onArchivo }) {
  const [cots, setCots] = useState([]);
  const [elegidos, setElegidos] = useState({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [leyendo, setLeyendo] = useState("");
  const [estado, setEstado] = useState("");          // "guardando" | "guardado"
  const [revisando, setRevisando] = useState(null);  // la cotización cuyos renglones se corrigen
  const [verTodo, setVerTodo] = useState(false);
  const [previa, setPrevia] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [quitando, setQuitando] = useState(null);
  const archivoRef = useRef(null);

  const cargar = useCallback(async () => {
    if (!presupuesto?.id) return;
    const r = await cotizacionesDe(presupuesto.id);
    setCargando(false);
    if (r.error) { setError(r.error); return; }
    setCots(r.cotizaciones);
    setElegidos(elegidosDe(r.cotizaciones));
  }, [presupuesto?.id]);
  useEffect(() => { cargar(); }, [cargar]);

  const matriz = useMemo(() => matrizDeCotizaciones({ capitulos, items, cotizaciones: cots }), [capitulos, items, cots]);
  // Lo elegido que sigue teniendo de dónde salir: si se corrigió un renglón, puede haber dejado de tenerlo.
  const vigentes = useMemo(() => Object.fromEntries(Object.entries(elegidos).filter(([id, c]) => matriz.celdaDe(id, c))), [elegidos, matriz]);
  const plan = useMemo(() => planDeAplicar({ matriz, elegidos: vigentes, items }), [matriz, vigentes, items]);
  const numeroDe = useMemo(() => new Map(matriz.grupos.flatMap(g => g.filas.map(f => [f.id, f.numero]))), [matriz]);

  // SE GUARDA SOLO, con el estado al lado.
  const guardar = async (id, campos) => {
    setEstado("guardando");
    const err = await actualizarCotizacion(id, campos);
    if (err) { setError(err); setEstado(""); return false; }
    setEstado("guardado");
    return true;
  };

  async function cambiarElegidos(nuevo) {
    const antes = elegidosPorCotizacion(vigentes), ahora = elegidosPorCotizacion(nuevo);
    setElegidos(nuevo); setPrevia(false); setAviso("");
    for (const c of cots) {
      const a = (antes[c.id] || []).slice().sort().join(","), b = (ahora[c.id] || []).slice().sort().join(",");
      if (a !== b) await guardar(c.id, { elegidos: ahora[c.id] || [] });
    }
  }
  const tocar = (cotId, que) => { if (puedeEditar) cambiarElegidos(elegir(matriz, vigentes, cotId, que)); };

  async function subir(e) {
    const archivos = [...(e.target.files || [])];
    e.target.value = "";
    if (!archivos.length || !presupuesto?.id) return;
    setError(""); setAviso("");
    const base = rubrosDeLaBase({ capitulos, items });
    for (const file of archivos) {
      setLeyendo(file.name);
      // El papel se guarda tal como llegó, se lea bien o no.
      const g = await guardarOriginal(presupuesto.id, file, "cotizacion", currentUser);
      if (g.archivo) onArchivo?.();
      const leida = await leerCotizacionDeArchivo(file, base);
      if (leida.error) { setError(`${file.name}: ${leida.error}`); continue; }
      const r = await guardarCotizacion({
        presupuestoId: presupuesto.id, proveedor: leida.proveedor || file.name.replace(/\.[a-z0-9]+$/i, ""),
        archivoId: g.archivo?.id ?? null, renglones: leida.renglones, totales: leida.totales, quien: currentUser,
      });
      if (r.error) { setError(r.error); break; }
      setCots(cs => [...cs, r.cotizacion]);
      const sinRubro = leida.renglones.filter(x => !x.items.length).length;
      const cuadre = cuadreDeLaLectura(leida);
      setAviso(`${r.cotizacion.proveedor}: ${leida.renglones.length} renglones leídos`
        + (sinRubro ? `, ${sinRubro} sin rubro del presupuesto` : "")
        + (cuadre.cuadra === false ? `. OJO: suman $${plata(cuadre.suma)} y su papel dice $${plata(cuadre.escrito)}: puede faltar un renglón` : "")
        + ". Revisá a qué rubro va cada uno antes de comparar.");
    }
    setLeyendo("");
  }

  const cambiar = async (cot, campos) => {
    setCots(cs => cs.map(c => (c.id === cot.id ? { ...c, ...campos } : c)));
    await guardar(cot.id, campos);
  };
  // A qué rubros va un renglón: lo que NOVA propuso se corrige acá.
  const asignar = (cot, k, ids) => cambiar(cot, { renglones: (cot.renglones || []).map((r, i) => (i === k ? { ...r, items: ids } : r)) });

  async function quitar(cot) {
    const err = await borrarCotizacion(cot.id);
    if (err) { setError(err); return; }
    setCots(cs => cs.filter(c => c.id !== cot.id));
    setElegidos(e => Object.fromEntries(Object.entries(e).filter(([, c]) => String(c) !== String(cot.id))));
    setQuitando(null); if (revisando === cot.id) setRevisando(null);
  }

  async function aplicar() {
    if (!plan.cambios.length || !onAplicar) return;
    setAplicando(true); setError("");
    const err = await onAplicar(plan.cambios);
    if (err) { setAplicando(false); setError(err); return; }
    const ahora = new Date().toISOString();
    for (const id of new Set(plan.cambios.map(c => c.cotizacion_id))) await actualizarCotizacion(id, { aplicada_at: ahora });
    setCots(cs => cs.map(c => (plan.cambios.some(x => x.cotizacion_id === c.id) ? { ...c, aplicada_at: ahora } : c)));
    setAplicando(false); setPrevia(false);
    setAviso(`Listo: ${plan.cambios.length} ${plan.cambios.length === 1 ? "rubro quedó" : "rubros quedaron"} con el costo elegido, $${plata(plan.costo)} en total. `
      + "La utilidad de cada rubro se conservó. Las cotizaciones no elegidas siguen guardadas acá.");
  }

  const caja = { background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: "11px 13px", marginBottom: 10 };
  const empresas = matriz.empresas;
  const gruposConAlgo = matriz.grupos.filter(g => g.cotizados.length);
  const gruposVistos = verTodo ? matriz.grupos : gruposConAlgo;
  const enRevision = revisando != null ? cots.find(c => c.id === revisando) : null;
  const elegidaEn = (itemId, cotId) => String(vigentes[itemId]) === String(cotId);

  return (
    <div className="matriz-cotizaciones" style={{ fontFamily: colors.font }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
        <button onClick={onCerrar} style={{ ...enlace, fontSize: 12, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
          <ArrowLeft size={13} /> Volver al presupuesto
        </button>
        <div style={{ fontSize: 14, fontWeight: 700, color: colors.ink }}>Comparar cotizaciones · {presupuesto?.nombre}</div>
        <span className="estado-de-guardado" style={{ marginLeft: "auto", fontSize: 11, color: estado === "guardado" ? colors.success : colors.muted }}>
          {estado === "guardando" ? "Guardando…" : estado === "guardado" ? "✓ Guardado" : ""}
        </span>
      </div>
      <div style={{ fontSize: 11.5, color: colors.inkSoft, lineHeight: 1.55, marginBottom: 10, maxWidth: 900 }}>
        Subí la cotización de cada empresa: quedan guardadas acá y <strong>no entran al presupuesto</strong> hasta que elijas.
        Los totales van sobre las cantidades de tu presupuesto, para que todas se comparen sobre lo mismo. Tocá el subtotal
        de un capítulo para dárselo entero a una empresa, o un rubro para elegirlo solo.
      </div>

      {puedeEditar && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
          <button onClick={() => archivoRef.current?.click()} disabled={!!leyendo}
            style={{ background: colors.brand, border: "none", borderRadius: 8, padding: "7px 12px", color: "#fff", fontSize: 12, fontWeight: 600,
              cursor: leyendo ? "default" : "pointer", fontFamily: colors.font, display: "inline-flex", alignItems: "center", gap: 6, opacity: leyendo ? 0.6 : 1 }}>
            <Upload size={13} /> Subir cotización
          </button>
          <input ref={archivoRef} className="subir-cotizacion" type="file" multiple accept="image/*,.pdf,.xlsx,.xls,.csv" onChange={subir} style={{ display: "none" }} />
          {leyendo && <span style={{ fontSize: 12, color: colors.brand }}>NOVA está leyendo {leyendo}…</span>}
        </div>
      )}
      {error && <div className="error-de-la-matriz" role="alert" style={{ ...caja, borderLeft: `3px solid ${colors.danger}`, color: colors.danger, fontSize: 12 }}>{error}</div>}
      {aviso && <div className="aviso-de-la-matriz" style={{ ...caja, borderLeft: `3px solid ${colors.success}`, color: colors.inkSoft, fontSize: 12, lineHeight: 1.5 }}>{aviso}</div>}

      {!cargando && !empresas.length && !error && (
        <div style={{ ...caja, textAlign: "center", padding: "26px 16px", color: colors.inkSoft, fontSize: 12.5 }}>
          Todavía no hay cotizaciones para comparar en este presupuesto. Subí la primera: PDF, foto o Excel.
        </div>
      )}

      {empresas.length > 0 && (
        <div style={{ ...caja, padding: 0, overflowX: "auto" }}>
          <table className="la-matriz" style={{ borderCollapse: "collapse", width: "100%", color: colors.ink }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: "left", minWidth: 250, color: colors.muted, fontWeight: 600 }}>Rubros del presupuesto</th>
                {empresas.map(e => {
                  const cot = cots.find(c => c.id === e.id);
                  const cuadre = cuadreDeLaLectura(cot);
                  return (
                    <th key={e.id} className="columna-de-empresa" style={th}>
                      {puedeEditar ? (
                        <input defaultValue={e.proveedor} key={`n${e.id}-${e.proveedor}`} title="Escribí para cambiarle el nombre"
                          onBlur={ev => ev.target.value.trim() !== e.proveedor && cambiar(cot, { proveedor: ev.target.value.trim() })}
                          onKeyDown={ev => { if (ev.key === "Enter") ev.target.blur(); }}
                          style={{ width: "100%", textAlign: "right", border: "none", background: "transparent", fontFamily: colors.font, fontSize: 12.5, fontWeight: 700, color: colors.ink, outline: "none", padding: 0 }} />
                      ) : <div style={{ fontSize: 12.5, fontWeight: 700 }}>{e.proveedor}</div>}
                      <div style={{ ...chico, fontWeight: 400 }}>
                        su papel suma ${plata(e.cotizado)}
                        {cuadre.cuadra === false && <span style={{ color: colors.warning }}> · dice ${plata(cuadre.escrito)}: revisá si falta un renglón</span>}
                      </div>
                      <div style={{ ...chico, fontWeight: 400 }}>
                        {e.renglones.length} {e.renglones.length === 1 ? "renglón" : "renglones"}
                        {e.sueltos.length > 0 && <span style={{ color: colors.warning }}> · {e.sueltos.length} sin rubro (${plata(e.sinRubro)})</span>}
                      </div>
                      {e.descuentoOfrecido > 0 && (
                        <div style={{ ...chico, fontWeight: 400 }}>
                          {e.descuento > 0 ? `con su ${plata(e.descuento)} % de descuento ya restado` : `ofrece ${plata(e.descuentoOfrecido)} % de descuento, sin restar`}
                          {puedeEditar && <> · <button style={enlace} onClick={() => cambiar(cot, { totales: { ...(cot.totales || {}), sin_descuento: e.descuento > 0 } })}>
                            {e.descuento > 0 ? "no restarlo" : "restarlo"}</button></>}
                        </div>
                      )}
                      {cot?.aplicada_at && <div style={{ ...chico, fontWeight: 400, color: colors.success }}>ya pasó precios al presupuesto</div>}
                      <div style={{ marginTop: 3, display: "flex", gap: 9, justifyContent: "flex-end" }}>
                        <button className="revisar-renglones" style={enlace} onClick={() => setRevisando(revisando === e.id ? null : e.id)}>
                          {revisando === e.id ? "cerrar renglones" : "revisar renglones"}
                        </button>
                        {puedeEditar && (quitando === e.id
                          ? <><button className="confirmar-quitar" style={{ ...enlace, color: colors.danger }} onClick={() => quitar(cot)}>sí, quitarla</button>
                            <button style={{ ...enlace, color: colors.muted }} onClick={() => setQuitando(null)}>no</button></>
                          : <button className="quitar-cotizacion" style={{ ...enlace, color: colors.muted }} title="Quitar esta cotización de la comparación" onClick={() => setQuitando(e.id)}>quitar</button>)}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {gruposVistos.map(g => {
                const filas = verTodo ? g.filas : g.filas.filter(f => Object.keys(f.celdas).length);
                const sinCotizar = g.filas.length - g.cotizados.length;
                return [
                  <tr key={`c${g.numero}`} className="fila-de-capitulo" style={{ background: colors.bg }}>
                    <td style={{ ...td, textAlign: "left", fontWeight: 700 }}>
                      {g.numero} · {g.capitulo}
                      <div style={{ ...chico, fontWeight: 400 }}>
                        {g.cotizados.length} de {g.filas.length} rubros con cotización
                        {!verTodo && sinCotizar > 0 ? ` · ${sinCotizar} que nadie cotizó no se muestran` : ""}
                      </div>
                    </td>
                    {empresas.map(e => {
                      const s = g.sub[e.id];
                      if (!s) return <td key={e.id} style={{ ...td, color: colors.muted }}>{g.cotizados.length ? "no cotizó" : "—"}</td>;
                      const todos = g.filas.filter(f => f.celdas[e.id]).every(f => elegidaEn(f.id, e.id));
                      return (
                        <td key={e.id} style={{ ...td, padding: 3 }}>
                          <button className="subtotal-de-capitulo" onClick={() => tocar(e.id, { capitulo: g.capitulo })} disabled={!puedeEditar}
                            title={todos ? "Soltar este capítulo" : `Darle a ${e.proveedor} todo lo que cotizó en ${g.capitulo}`}
                            style={{ width: "100%", textAlign: "right", fontFamily: colors.font, cursor: puedeEditar ? "pointer" : "default", borderRadius: 7, padding: "4px 6px",
                              border: `1.5px solid ${todos ? colors.brand : "transparent"}`, background: todos ? colors.brandSoft || colors.neutralSoft : "transparent", color: colors.ink }}>
                            <span style={{ fontSize: 12.5, fontWeight: 700 }}>{s.estimado ? "≈ " : ""}${plata(s.total)}</span>
                            {g.menor === String(e.id) && <span className="menor" style={pastilla(colors.success, colors.successSoft)}>MENOR</span>}
                            {todos && <Check size={11} color={colors.brand} style={{ marginLeft: 4, verticalAlign: -1 }} />}
                            {s.faltan > 0 && <div style={{ ...chico, color: colors.warning }}>le {s.faltan === 1 ? "falta 1 rubro" : `faltan ${s.faltan} rubros`} que otra sí cotizó</div>}
                            {s.estimado && <div style={chico}>estimado: comparte un paquete con otro capítulo</div>}
                          </button>
                        </td>
                      );
                    })}
                  </tr>,
                  ...filas.map(f => (
                    <tr key={f.id} className="fila-de-rubro">
                      <td style={{ ...td, textAlign: "left" }}>
                        <span style={{ color: colors.muted }}>{f.numero}</span> {f.item.descripcion}
                        <div style={chico}>{n(f.item.cantidad) > 0 ? `${plata(f.item.cantidad)} ${f.item.unidad || ""}` : "sin cantidad en el presupuesto"}</div>
                      </td>
                      {empresas.map(e => {
                        const x = f.celdas[e.id];
                        if (!x) return <td key={e.id} style={{ ...td, color: Object.keys(f.celdas).length ? colors.warning : colors.muted, fontSize: 11 }}>{Object.keys(f.celdas).length ? "no cotizó" : "—"}</td>;
                        const elegida = elegidaEn(f.id, e.id);
                        return (
                          <td key={e.id} style={{ ...td, padding: 3 }}>
                            <button className="celda-de-rubro" onClick={() => tocar(e.id, { itemId: f.id })} disabled={!puedeEditar}
                              title={x.tipo === "paquete" ? `Es parte del paquete «${x.descripcion}»: se elige o se suelta entero` : elegida ? "Soltar este rubro" : `Elegir a ${e.proveedor} para este rubro`}
                              style={{ width: "100%", textAlign: "right", fontFamily: colors.font, cursor: puedeEditar ? "pointer" : "default", borderRadius: 7, padding: "4px 6px",
                                border: `1.5px solid ${elegida ? colors.brand : "transparent"}`, background: elegida ? colors.brandSoft || colors.neutralSoft : "transparent", color: colors.ink }}>
                              {x.tipo === "rubro" ? (
                                <>
                                  <span style={{ fontSize: 12, fontWeight: 600 }}>${plata(x.unitario)}</span>
                                  {f.menor === String(e.id) && <span className="menor" style={pastilla(colors.success, colors.successSoft)}>MENOR</span>}
                                  {elegida && <Check size={11} color={colors.brand} style={{ marginLeft: 4, verticalAlign: -1 }} />}
                                  <div style={chico}>${plata(x.total)}{x.otraCantidad ? ` · cotizó ${plata(x.cantidadCotizada)}` : x.sinCantidadTuya ? ` · sobre sus ${plata(x.cantidad)}` : ""}</div>
                                </>
                              ) : (
                                <>
                                  <span style={{ fontSize: 12, fontWeight: 600, color: colors.inkSoft }}>≈ ${plata(x.parte)}</span>
                                  {elegida && <Check size={11} color={colors.brand} style={{ marginLeft: 4, verticalAlign: -1 }} />}
                                  <div className="del-paquete" style={chico}>del paquete «{String(x.descripcion).slice(0, 34)}», ${plata(x.totalDelPaquete)}</div>
                                </>
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  )),
                ];
              })}
              <tr className="fila-de-total" style={{ background: colors.bg }}>
                <td style={{ ...td, textAlign: "left", fontWeight: 700, borderBottom: "none" }}>
                  Total sobre este presupuesto
                  <div style={{ ...chico, fontWeight: 400 }}>lo de cada empresa que calza con algún rubro</div>
                </td>
                {empresas.map(e => (
                  <td key={e.id} style={{ ...td, borderBottom: "none" }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>${plata(e.comparado)}</span>
                    <div style={chico}>cubre {e.cubre} {e.cubre === 1 ? "rubro" : "rubros"}</div>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {empresas.length > 0 && matriz.grupos.length > gruposConAlgo.length && (
        <button style={{ ...enlace, fontSize: 11, marginBottom: 10 }} onClick={() => setVerTodo(v => !v)}>
          {verTodo ? "ver solo lo que tiene alguna cotización" : `ver también los ${matriz.grupos.length - gruposConAlgo.length} capítulos y los rubros que nadie cotizó`}
        </button>
      )}

      {/* LOS RENGLONES DE UNA EMPRESA, con sus palabras, y a qué rubros va
          cada uno. De esto cuelga toda la comparación: lo propone NOVA y se
          corrige acá. Un renglón puede ir a varios rubros: es un paquete. */}
      {enRevision && (
        <div className="renglones-de-la-empresa" style={caja}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <ListChecks size={14} color={colors.brand} />
            <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.ink }}>Lo que cotizó {enRevision.proveedor}, renglón por renglón</div>
            <button onClick={() => setRevisando(null)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: colors.muted, display: "flex" }}><X size={14} /></button>
          </div>
          <div style={{ ...chico, marginBottom: 8, fontSize: 11 }}>
            A la derecha, los rubros de tu presupuesto que cubre cada renglón. Si un renglón es un paquete, sumale todos los rubros que cubre:
            su total se compara contra lo que suman.
          </div>
          {(enRevision.renglones || []).map((r, k) => {
            const tomados = new Set((enRevision.renglones || []).flatMap((x, i) => (i === k ? [] : (x.items || []).map(Number))));
            const suyos = (r.items || []).map(Number).filter(id => numeroDe.has(id));
            return (
              <div key={k} className="renglon-de-la-cotizacion" style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap", padding: "6px 0", borderTop: `1px solid ${colors.neutralSoft}` }}>
                <div style={{ flex: 1, minWidth: 230, fontSize: 12, color: colors.ink }}>
                  {r.descripcion}
                  <div style={chico}>{plata(r.cantidad)} {r.unidad || ""} × ${plata(r.precio_unitario)} = ${plata(totalDelRenglon(r))}</div>
                </div>
                <div style={{ flex: 1, minWidth: 260, fontSize: 11.5 }}>
                  {!suyos.length && <div style={{ color: colors.warning, fontSize: 11 }}>sin rubro del presupuesto: no entra en la comparación</div>}
                  {suyos.length > 1 && <div style={{ color: colors.inkSoft, fontSize: 10.5 }}>paquete: cubre {suyos.length} rubros</div>}
                  {suyos.map(id => {
                    const it = items.find(i => Number(i.id) === id);
                    return (
                      <div key={id} className="rubro-del-renglon" style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                        <span style={{ color: colors.muted }}>{numeroDe.get(id)}</span>
                        <span style={{ flex: 1 }}>{String(it?.descripcion || "").slice(0, 70)}</span>
                        {puedeEditar && <button style={{ ...enlace, color: colors.muted }} onClick={() => asignar(enRevision, k, suyos.filter(x => x !== id))}>quitar</button>}
                      </div>
                    );
                  })}
                  {puedeEditar && (
                    <select className="sumar-rubro" value="" onChange={ev => ev.target.value && asignar(enRevision, k, [...suyos, Number(ev.target.value)])}
                      style={{ marginTop: 3, maxWidth: "100%", fontFamily: colors.font, fontSize: 11, color: colors.brand, border: `1px solid ${colors.border}`, borderRadius: 6, padding: "2px 4px", background: "#fff" }}>
                      <option value="">{suyos.length ? "+ sumar otro rubro (es un paquete)…" : "elegir su rubro…"}</option>
                      {matriz.grupos.map(g => (
                        <optgroup key={g.numero} label={`${g.numero} · ${g.capitulo}`}>
                          {g.filas.filter(f => !tomados.has(f.id) && !suyos.includes(f.id)).map(f => (
                            <option key={f.id} value={f.id}>{f.numero} {String(f.item.descripcion || "").slice(0, 80)}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* LO ELEGIDO, Y PASARLO AL PRESUPUESTO. Es lo único que se confirma:
          cambia precios, y se ve acá mismo qué cambia antes de aceptar. */}
      {empresas.length > 0 && (
        <div className="lo-elegido" style={{ ...caja, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 240, fontSize: 12.5, color: colors.ink }}>
            {plan.cambios.length
              ? <>Elegido: <strong>{plan.cambios.length} {plan.cambios.length === 1 ? "rubro" : "rubros"}</strong> · entra al presupuesto <strong>${plata(plan.costo)}</strong> de costo
                {plan.repartidos > 0 && <span style={{ color: colors.inkSoft }}> · {plan.repartidos} repartidos de un paquete</span>}</>
              : <span style={{ color: colors.muted }}>Todavía no elegiste nada: tocá un subtotal o un rubro en la matriz.</span>}
          </div>
          {puedeEditar && plan.cambios.length > 0 && !previa && (
            <button className="ver-lo-que-entra" onClick={() => setPrevia(true)}
              style={{ background: colors.brand, border: "none", borderRadius: 8, padding: "7px 12px", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: colors.font }}>
              Pasar lo elegido al presupuesto…
            </button>
          )}
        </div>
      )}

      {previa && plan.cambios.length > 0 && (
        <div className="lo-que-entra" style={{ ...caja, borderLeft: `3px solid ${colors.brand}` }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.ink, marginBottom: 4 }}>Esto es lo que cambia en el presupuesto</div>
          <div style={{ fontSize: 11.5, color: colors.inkSoft, lineHeight: 1.5, marginBottom: 8 }}>
            Entra el <strong>costo</strong> de cada rubro; su utilidad se conserva y el precio al cliente se recalcula con ella. La descripción y la
            cantidad de tus rubros no se tocan{plan.sinCantidad > 0 ? `, salvo en ${plan.sinCantidad} que no tenían cantidad: abajo dice con cuál queda cada uno` : ""}.
            {plan.repartidos > 0 && <> Los <strong>repartidos</strong> no son un unitario que cotizó la empresa: son su parte del paquete, y quedan marcados así.</>}
          </div>
          {plan.cambios.map(c => (
            <div key={c.id} className="cambio-del-presupuesto" style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", padding: "5px 0", borderTop: `1px solid ${colors.neutralSoft}`, fontSize: 12 }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <span style={{ color: colors.muted }}>{numeroDe.get(c.id)}</span> {c.descripcion}
                <div style={chico}>
                  {c.proveedor}{c.repartido ? ` · repartido ${DE_DONDE[c.pesoDe]}` : ""}
                  {c.ponerCantidad ? (c.repartido ? " · no tenía cantidad: queda en 1, con su parte como precio" : " · toma la cantidad de la cotización") : ""}
                </div>
              </div>
              <div style={{ textAlign: "right", color: colors.inkSoft }}>{plata(c.cantidad)} × ${plata(c.precio_base)}</div>
              <div style={{ textAlign: "right", minWidth: 96, fontWeight: 700 }}>${plata(c.costo)}
                <div style={{ ...chico, fontWeight: 400 }}>{c.costoAntes > 0 ? `antes $${plata(c.costoAntes)}` : "sin costo antes"}</div>
              </div>
            </div>
          ))}
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
            <button className="confirmar-pasar" onClick={aplicar} disabled={aplicando}
              style={{ background: colors.brand, border: "none", borderRadius: 8, padding: "7px 12px", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: colors.font, opacity: aplicando ? 0.6 : 1 }}>
              {aplicando ? "Pasando…" : `Confirmar: pasar ${plan.cambios.length} ${plan.cambios.length === 1 ? "rubro" : "rubros"}, $${plata(plan.costo)}`}
            </button>
            <button onClick={() => setPrevia(false)} disabled={aplicando} style={{ ...enlace, fontSize: 12, color: colors.muted }}>todavía no</button>
          </div>
        </div>
      )}
    </div>
  );
}
