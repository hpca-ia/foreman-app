import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import { Plus, Trash2, Mail, Check, X, FileText, RotateCcw, Camera, Download, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import { fmt } from "./calculos";
import {
  ESTADOS_ORDEN, EJECUCION, codigoDe, subtotales, cargarOrdenes, crearOrden, guardarOrden,
  borrarOrden, agregarLinea, borrarLinea, aprobarOrden, desaprobarOrden, enviarOrden,
  pedirVisto, darVisto,
  subirSoporte, borrarSoporte, enlacesDeSoportes,
} from "./ordenesDeCambio";
import { pdfDeOrden, pdfConsolidado } from "./pdfOrdenCambio";
import ModalOrdenCambio from "./ModalOrdenCambio";

// Las órdenes de cambio de una obra.
//
// El documento se arma acá y se manda desde acá: quien lo hace no tiene que
// pasar por Word ni acordarse de adjuntar nada. Mientras está en borrador se
// le agregan y quitan líneas; al mandarlo queda "enviada" y ya se puede citar
// por su número; al aprobarse, y recién ahí, sus líneas entran al control.

const LINEA_VACIA = { descripcion: "", especificacion: "", rubro_codigo: "", unidad: "", cantidad: 1, precio_unitario: "", tipo: "aumenta", capitulo: "", obra_rubro_id: "" };
// Los tipos que la oficina ya usa en sus órdenes. Se puede escribir otro.
const TIPOS = [
  "Requerimiento cliente",
  "Requerimiento contratista (vicio oculto)",
  "Cambio de especificación",
  "Mejora de diseño — aprobada por cliente",
  "Req. cliente — Rediseño",
  "Req. contratista — necesario para continuar los trabajos",
];

export default function PanelOrdenesCambio({ obra, proyecto, rubros = [], currentUser, puede, onCambio }) {
  const [ordenes, setOrdenes] = useState([]);
  const [lineas, setLineas] = useState({});
  const [fotos, setFotos] = useState({});
  const [enlaces, setEnlaces] = useState({});
  const [subiendo, setSubiendo] = useState(false);
  const [bajando, setBajando] = useState(null);
  const [consolidando, setConsolidando] = useState(false);
  const camRef = useRef(null);
  const [sinTablas, setSinTablas] = useState(false);
  const [abierta, setAbierta] = useState(null);
  const [nueva, setNueva] = useState(null);       // { titulo, justificacion, solicitado_por }
  const [linea, setLinea] = useState(LINEA_VACIA);
  // Los dos campos que casi nunca se usan, plegados hasta que alguien los pida.
  const [verDetalle, setVerDetalle] = useState(false);
  // En qué orden está abierto el formulario de agregar línea. Cerrado, la
  // tabla de arriba es lo único que se ve.
  const [agregandoEn, setAgregandoEn] = useState(null);
  const [mandando, setMandando] = useState(null); // { orden, correos, cuerpo }
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState("");
  const [invitados, setInvitados] = useState([]);

  const puedeEditar = puede?.("obras.crear") !== false;
  // El visto es del Director y de nadie más: es el que responde por el precio
  // que sale de la oficina.
  const esDirector = currentUser?.role === "owner";

  const cargar = useCallback(async () => {
    const r = await cargarOrdenes(obra.id);
    setSinTablas(r.sinTablas);
    setOrdenes(r.ordenes);
    setLineas(r.lineas);
    setFotos(r.fotos || {});
    const todas = Object.values(r.fotos || {}).flat();
    if (todas.length) setEnlaces(await enlacesDeSoportes(todas));
  }, [obra.id]);
  useEffect(() => { cargar(); }, [cargar]);

  // A quién se le manda: la gente del proyecto que ya está cargada.
  useEffect(() => {
    if (!obra.lead_id) return;
    supabase.from("pipeline_invitados").select("*").eq("lead_id", obra.lead_id)
      .then(({ data }) => setInvitados((data || []).filter(i => i.email)));
  }, [obra.lead_id]);

  // La base de la que se saca y sobre la que se agrega es el PRESUPUESTO
  // CONTRATADO. Lo que entró por órdenes anteriores no se ofrece: una orden no
  // se arma sobre otra orden, se arma sobre el contrato.
  const rubrosBase = rubros.filter(r => r.origen !== "orden_cambio");
  const capitulos = [...new Set(rubrosBase.map(r => r.capitulo || "SIN CAPÍTULO"))];
  // Contra qué se lee el número nuevo: la línea base y lo ya pactado después.
  const resumen = {
    base: rubros.filter(r => r.origen !== "orden_cambio").reduce((s, r) => s + (Number(r.total_base) || 0), 0),
    adicionales: rubros.filter(r => r.origen === "orden_cambio").reduce((s, r) => s + (Number(r.total_base) || 0), 0),
  };
  // Lo que de verdad cuenta contra el contrato: aprobado y no anulado. Una
  // orden enviada todavía se está discutiendo, y una anulada no pasó nunca.
  const totalVigente = ordenes
    .filter(o => !o.anulada && o.estado === "aprobada")
    .reduce((t, o) => t + subtotales(lineas[o.id] || []).total, 0);

  async function hacer(fn) {
    setOcupado(true); setAviso("");
    const err = await fn();
    setOcupado(false);
    if (typeof err === "string" && err) { setAviso(err); return false; }
    await cargar(); onCambio?.();
    return true;
  }

  if (sinTablas) {
    return (
      <div style={{ fontSize: 12.5, color: colors.warning, background: colors.warningSoft, border: `1px solid ${colors.warningBorder}`, borderRadius: colors.radiusMd, padding: 14 }}>
        Falta correr la migración 056 en Supabase para usar las órdenes de cambio.
      </div>
    );
  }

  const chip = estado => {
    const e = ESTADOS_ORDEN[estado] || ESTADOS_ORDEN.borrador;
    const c = { muted: colors.muted, warning: colors.warning, success: colors.success, danger: colors.danger }[e.color];
    return <span title={e.pista} style={{ fontSize: 9.5, fontWeight: 700, color: "#fff", background: c, borderRadius: 10, padding: "2px 7px", letterSpacing: 0.3 }}>{e.label.toUpperCase()}</span>;
  };

  return (
    <div style={{ fontFamily: colors.font }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: colors.ink }}>Órdenes de cambio</div>
          <div style={{ fontSize: 11, color: colors.muted, lineHeight: 1.5 }}>
            Adicionales y disminuciones acordados después del contrato. No tocan el presupuesto aprobado: se
            aprueban aparte y entran al control como adicionales.
          </div>
        </div>
        {puedeEditar && (
          <Button variant="primary" size="sm" onClick={() => setNueva(true)}>
            <Plus size={13} /> Nueva orden de cambio
          </Button>
        )}
      </div>

      {/* El consolidado, siempre a mano: es el documento que se entrega, y sus
          números son los que se citan en cualquier conversación de obra. */}
      {ordenes.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, background: colors.bg, borderRadius: colors.radiusMd,
          padding: "9px 12px", margin: "8px 0", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", flex: 1, minWidth: 200 }}>
            {[["Órdenes", ordenes.length],
              ["Aprobadas", ordenes.filter(o => o.estado === "aprobada" && !o.anulada).length],
              ["Ejecutadas", ordenes.filter(o => o.ejecucion === "ejecutado" && !o.anulada).length],
              ["Anuladas", ordenes.filter(o => o.anulada).length]].map(([k, v]) => (
              <div key={k}>
                <div style={{ fontSize: 9.5, fontWeight: 700, color: colors.muted, letterSpacing: 0.3 }}>{k.toUpperCase()}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: colors.ink }}>{v}</div>
              </div>
            ))}
            <div>
              <div style={{ fontSize: 9.5, fontWeight: 700, color: colors.muted, letterSpacing: 0.3 }}>VIGENTE</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: totalVigente < 0 ? colors.danger : colors.brand }}>
                {totalVigente < 0 ? "−" : "+"}${fmt(Math.abs(totalVigente))}
              </div>
            </div>
          </div>
          <Button variant="primary" size="sm" disabled={consolidando}
            onClick={async () => {
              setConsolidando(true); setAviso("");
              try {
                const doc = await pdfConsolidado({
                  ordenes, lineasPorOrden: lineas, fotosPorOrden: fotos, enlaces,
                  obra, proyecto, resumenContrato: resumen, subtotalesDe: subtotales, codigoDe,
                });
                doc.save(`Órdenes de cambio - ${proyecto || obra.nombre}.pdf`);
              } catch (e) { setAviso("No se pudo armar el consolidado: " + e.message); }
              setConsolidando(false);
            }}>
            <FileText size={13} /> {consolidando ? "Armando…" : "Consolidado en PDF"}
          </Button>
        </div>
      )}

      {aviso && <div style={{ fontSize: 12, color: colors.danger, margin: "8px 0" }}>{aviso}</div>}

      {/* Una orden nueva: lo mínimo para poder empezar a listar qué cambia. */}
      {nueva === true && (
        <ModalOrdenCambio obra={obra} proyecto={proyecto} rubros={rubros} currentUser={currentUser}
          puedeAprobar={puedeEditar}
          onCerrar={() => setNueva(null)}
          onCreada={async orden => { setNueva(null); await cargar(); setAbierta(orden.id); }} />
      )}

      {nueva && nueva !== true && (
        <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 14, margin: "10px 0" }}>
          <div style={{ display: "grid", gap: 8 }}>
            <input value={nueva.titulo} onChange={e => setNueva(n => ({ ...n, titulo: e.target.value }))}
              placeholder="Qué cambia. Ej: Cambio de porcelanato en planta baja" style={inputStyle} autoFocus />
            <textarea value={nueva.justificacion} onChange={e => setNueva(n => ({ ...n, justificacion: e.target.value }))}
              rows={2} placeholder="Por qué se pide y qué pasa si no se hace" style={{ ...inputStyle, resize: "vertical" }} />
            <input list="tipos-oc" value={nueva.tipo} onChange={e => setNueva(n => ({ ...n, tipo: e.target.value }))}
              placeholder="Tipo: requerimiento cliente, vicio oculto, cambio de especificación…" style={inputStyle} />
            <datalist id="tipos-oc">{TIPOS.map(t => <option key={t} value={t} />)}</datalist>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <input type="date" value={nueva.fecha} onChange={e => setNueva(n => ({ ...n, fecha: e.target.value }))} style={inputStyle} />
              <input value={nueva.lugar} onChange={e => setNueva(n => ({ ...n, lugar: e.target.value }))} placeholder="Lugar" style={inputStyle} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            <Button variant="primary" size="sm" disabled={ocupado || !nueva.titulo.trim()}
              onClick={async () => {
                const r = await crearOrden(obra.id, nueva, currentUser);
                if (r.error) { setAviso(r.error); return; }
                setNueva(null); setAbierta(r.orden.id); await cargar(); onCambio?.();
              }}>Crear</Button>
            <Button variant="secondary" size="sm" onClick={() => setNueva(null)}>Cancelar</Button>
          </div>
        </div>
      )}

      {!ordenes.length && !nueva && (
        <div style={{ textAlign: "center", color: colors.muted, padding: "40px 20px", fontSize: 13, background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, lineHeight: 1.6 }}>
          <FileText size={26} style={{ marginBottom: 8 }} />
          <div>Todavía no hay órdenes de cambio en esta obra.</div>
          <div style={{ fontSize: 12 }}>Cuando el cliente pida un adicional o se saque algo, se documenta acá.</div>
        </div>
      )}

      {ordenes.map(o => {
        const suyas = lineas[o.id] || [];
        const sub = subtotales(suyas);
        const total = sub.total;
        const suyasFotos = fotos[o.id] || [];
        const esta = abierta === o.id;
        const editable = puedeEditar && o.estado !== "aprobada";
        return (
          <div key={o.id} style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: "11px 13px", marginBottom: 8 }}>
            {/* Una fila que se abre y no lo dice es una fila que nadie abre:
                todo lo de la orden —los soportes, el PDF, borrarla— vivía acá
                adentro y no había nada que invitara a tocarla. */}
            <div onClick={() => setAbierta(esta ? null : o.id)} style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer", flexWrap: "wrap" }}>
              {esta ? <ChevronDown size={14} color={colors.muted} /> : <ChevronRight size={14} color={colors.muted} />}
              <span style={{ fontSize: 11, fontWeight: 700, color: colors.muted }}>{codigoDe(o)}</span>
              <span style={{ flex: 1, minWidth: 140, fontSize: 13.5, fontWeight: 600, color: colors.ink }}>{o.titulo}</span>
              {chip(o.estado)}
              <span style={{ fontSize: 14, fontWeight: 700, color: total < 0 ? colors.danger : colors.brand }}>
                {total < 0 ? "−" : "+"}${fmt(Math.abs(total))}
              </span>
            </div>

            {esta && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${colors.neutralSoft}` }}>
                {o.anulada && (
                  <div style={{ background: "#FEF2F2", color: colors.danger, fontSize: 11.5, fontWeight: 700,
                    textAlign: "center", padding: "6px 8px", borderRadius: 6, marginBottom: 8 }}>
                    ORDEN DE CAMBIO ANULADA — NO EJECUTADA
                  </div>
                )}
                <div style={{ fontSize: 11, color: colors.muted, marginBottom: 6 }}>
                  {[o.tipo, o.lugar, o.fecha && new Date(`${o.fecha}T12:00:00`).toLocaleDateString("es-EC"),
                    o.emitido_por && `Emitida por ${o.emitido_por}`].filter(Boolean).join(" · ")}
                </div>
                {o.visto_at && (
                  <div style={{ fontSize: 11.5, color: colors.success, marginBottom: 6 }}>
                    Visto bueno de {o.visto_nombre || "la dirección"} · {new Date(o.visto_at).toLocaleDateString("es-EC", { day: "numeric", month: "long" })}
                    {o.visto_comentario && <span style={{ color: colors.inkSoft }}> — {o.visto_comentario}</span>}
                  </div>
                )}
                {!o.visto_at && o.visto_pedido_at && (
                  <div style={{ fontSize: 11.5, color: colors.warning, marginBottom: 6 }}>
                    Esperando el visto del Director desde el {new Date(o.visto_pedido_at).toLocaleDateString("es-EC", { day: "numeric", month: "long" })}
                  </div>
                )}

                <div style={{ fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.4, marginBottom: 3 }}>
                  CAPÍTULO I · ARGUMENTOS
                </div>
                <textarea defaultValue={o.justificacion || ""} readOnly={!editable} rows={2}
                  onBlur={e => editable && e.target.value !== (o.justificacion || "") && hacer(() => guardarOrden(o.id, { justificacion: e.target.value }))}
                  placeholder="Por qué se pide y qué pasa si no se hace"
                  style={{ ...inputStyle, fontSize: 12.5, padding: "7px 9px", resize: "vertical", marginBottom: 8, width: "100%", boxSizing: "border-box" }} />

                {/* Los soportes: la foto de lo que se encontró y el plano con
                    la solución. Quien aprueba deja de tener que creerle a la
                    palabra escrita. Viajan adjuntos en el correo y en el PDF. */}
                <div style={{ marginBottom: 9 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.4, marginBottom: 4 }}>
                    SOPORTES GRÁFICOS{suyasFotos.length ? ` · ${suyasFotos.length}` : ""}
                  </div>
                  {suyasFotos.length > 0 && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 6, marginBottom: 6 }}>
                      {suyasFotos.map(f => (
                        <div key={f.id} style={{ position: "relative" }}>
                          {enlaces[f.id]
                            ? <a href={enlaces[f.id]} target="_blank" rel="noreferrer">
                                <img src={enlaces[f.id]} alt={f.descripcion || "Soporte"}
                                  style={{ width: "100%", height: 76, objectFit: "cover", borderRadius: 6, border: `1px solid ${colors.border}`, display: "block" }} />
                              </a>
                            : <div style={{ width: "100%", height: 76, borderRadius: 6, background: colors.neutralSoft }} />}
                          {editable && (
                            <button onClick={() => { if (window.confirm("¿Quitar este soporte?")) hacer(() => borrarSoporte(f)); }}
                              style={{ position: "absolute", top: 3, right: 3, background: "rgba(17,24,39,0.7)", border: "none", borderRadius: 5, color: "#fff", cursor: "pointer", display: "flex", padding: 2 }}>
                              <X size={10} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {editable && (
                    <>
                      <button onClick={() => { setAbierta(o.id); camRef.current?.click(); }} disabled={subiendo}
                        style={{ width: "100%", background: colors.bg, border: `1px dashed ${colors.border}`, borderRadius: 8, padding: "9px",
                          color: colors.inkSoft, fontSize: 12, cursor: "pointer", fontFamily: colors.font, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                        <Camera size={13} /> {subiendo ? "Subiendo…" : "Agregar foto o plano"}
                      </button>
                      <input ref={camRef} type="file" accept="image/*" style={{ display: "none" }}
                        onChange={async ev => {
                          const archivo = ev.target.files?.[0];
                          ev.target.value = "";
                          if (!archivo) return;
                          setSubiendo(true);
                          const descripcion = window.prompt("¿Qué se ve en esta imagen? (opcional)", "") || "";
                          const r = await subirSoporte(o, archivo, descripcion, currentUser, suyasFotos.length);
                          setSubiendo(false);
                          if (r.error) { setAviso(r.error); return; }
                          await cargar();
                        }} />
                    </>
                  )}
                </div>

                <div style={{ fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.4, marginBottom: 3 }}>
                  CAPÍTULO II · ADICIONES Y REDUCCIONES
                </div>

                {/* Lo que cambia, línea por línea. */}
                {suyas.length > 0 && (
                  <div style={{ overflowX: "auto", marginBottom: 8 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 520 }}>
                      <thead>
                        <tr style={{ background: colors.bg }}>
                          {["Item", "Rubro", "Descripción", "Unid", "Cant", "P. unit", "Total", ""].map((h, i) => (
                            <th key={h + i} style={{ textAlign: i >= 4 && i <= 6 ? "right" : i === 3 ? "center" : "left",
                              padding: "5px 6px", fontSize: 9.5, color: colors.muted, letterSpacing: 0.3, fontWeight: 700 }}>{h.toUpperCase()}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[["aumenta", "ADICIONES", sub.adiciones], ["quita", "REDUCCIONES", sub.reducciones]].map(([tipo, titulo, monto]) => (
                          <Fragment key={tipo}>
                            <tr><td colSpan={8} style={{ background: colors.neutralSoft, padding: "3px 6px", fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, color: colors.inkSoft }}>{titulo}</td></tr>
                            {suyas.filter(l => (tipo === "quita" ? l.tipo === "quita" : l.tipo !== "quita")).map(l => (
                              <tr key={l.id} style={{ borderTop: `1px solid ${colors.neutralSoft}` }}>
                                <td style={{ padding: "5px 6px", color: colors.muted, fontSize: 11, whiteSpace: "nowrap" }}>{l.item || ""}</td>
                                <td style={{ padding: "5px 6px", color: colors.muted, fontSize: 11, whiteSpace: "nowrap" }}>{l.rubro_codigo || ""}</td>
                                <td style={{ padding: "5px 6px", color: colors.ink }}>
                                  {l.descripcion}
                                  {l.especificacion && <div style={{ fontSize: 10, color: colors.muted }}>{l.especificacion}</div>}
                                  {l.capitulo && <div style={{ fontSize: 10, color: colors.muted }}>{l.capitulo}</div>}
                                </td>
                                <td style={{ padding: "5px 6px", textAlign: "center", color: colors.muted }}>{l.unidad || ""}</td>
                                <td style={{ padding: "5px 6px", textAlign: "right" }}>{fmt(l.cantidad)}</td>
                                <td style={{ padding: "5px 6px", textAlign: "right" }}>{fmt(l.precio_unitario)}</td>
                                <td style={{ padding: "5px 6px", textAlign: "right", fontWeight: 600 }}>${fmt((Number(l.cantidad) || 0) * (Number(l.precio_unitario) || 0))}</td>
                                <td style={{ padding: "5px 6px", textAlign: "right" }}>
                                  {editable && (
                                    <button onClick={() => hacer(() => borrarLinea(l.id))} disabled={ocupado} title="Quitar esta línea"
                                      style={{ background: "none", border: "none", color: colors.border, cursor: "pointer", display: "flex", padding: 0 }}>
                                      <Trash2 size={12} />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                            <tr>
                              <td colSpan={6} style={{ padding: "4px 6px", textAlign: "right", fontSize: 11, fontWeight: 700, color: colors.inkSoft }}>SUBTOTAL {titulo}</td>
                              <td style={{ padding: "4px 6px", textAlign: "right", fontWeight: 700 }}>${fmt(monto)}</td>
                              <td />
                            </tr>
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Agregar una línea: lo que se saca va con "Quita", y el signo
                    lo pone el sistema. Escribir montos en negativo a mano es de
                    donde salen las órdenes que no cuadran. */}
                {/* El formulario estaba siempre abierto, debajo de la tabla de
                    adiciones y reducciones. Un formulario con los mismos
                    encabezados que la tabla de arriba se lee como una copia de
                    lo que ya está, no como la forma de agregar algo. Una acción
                    no debería parecerse al contenido. */}
                {editable && (agregandoEn !== o.id ? (
                    <button onClick={() => { setAgregandoEn(o.id); setLinea(LINEA_VACIA); }}
                      style={{ background: "none", border: `1px dashed ${colors.border}`, borderRadius: 8,
                        padding: "8px 12px", color: colors.inkSoft, fontSize: 12, cursor: "pointer",
                        fontFamily: colors.font, marginBottom: 8, display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <Plus size={12} /> Agregar una adición o una reducción
                    </button>
                  ) : (
                  <div style={{ background: colors.bg, borderRadius: 8, padding: 9, marginBottom: 8 }}>
                    <div style={{ display: "flex", gap: 5, marginBottom: 6 }}>
                      {/* Las mismas palabras que la tabla de arriba y que el
                          PDF que firma el cliente. Decía "Agrega al contrato"
                          debajo de una tabla que dice ADICIONES: son lo mismo,
                          y dos nombres para una cosa en la misma pantalla
                          hacen dudar de si son dos cosas. */}
                      {[["aumenta", "Adición"], ["quita", "Reducción"]].map(([v, label]) => {
                        const activo = linea.tipo === v;
                        const c = v === "quita" ? colors.danger : colors.brand;
                        return (
                          <button key={v} onClick={() => setLinea(l => ({ ...l, tipo: v }))}
                            style={{ border: `1px solid ${activo ? c : colors.border}`, background: activo ? c : "#fff", color: activo ? "#fff" : colors.inkSoft,
                              borderRadius: 12, padding: "3px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: colors.font }}>
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    {/* Cada modo pide lo suyo y nada más. Antes se mostraban
                        los ocho campos siempre: con "Agrega" aparecía un
                        desplegable para elegir un rubro del presupuesto, y con
                        "Saca" aparecían capítulo, especificación y precio para
                        escribir a mano. La mitad de la pantalla no aplicaba
                        nunca, y eso obliga a decidir campo por campo cuál
                        ignorar. */}
                    <div style={{ display: "grid", gap: 6 }}>
                      {linea.tipo === "quita" ? (
                        <>
                          {/* Sacar es sacar algo que está: se elige, no se
                              escribe. Con la descripción tipeada a mano el
                              monto no coincide con lo contratado y la resta no
                              cuadra contra el presupuesto. */}
                          <select value={linea.obra_rubro_id || ""}
                            onChange={e => {
                              const r = rubrosBase.find(x => String(x.id) === e.target.value);
                              setLinea(l => (r ? {
                                ...l, obra_rubro_id: r.id, rubro_codigo: String(r.numero ?? r.codigo ?? ""),
                                capitulo: r.capitulo || "", descripcion: r.descripcion || "",
                                unidad: r.unidad || "", precio_unitario: r.precio_unitario ?? "",
                                cantidad: r.cantidad ?? 1,
                              } : { ...l, obra_rubro_id: "", rubro_codigo: "" }));
                            }}
                            style={{ ...inputStyle, padding: "7px 9px", fontSize: 12 }}>
                            <option value="">¿Qué rubro del presupuesto se reduce?</option>
                            {capitulos.map(cap => (
                              <optgroup key={cap} label={cap}>
                                {rubrosBase.filter(r => (r.capitulo || "SIN CAPÍTULO") === cap).map(r => (
                                  <option key={r.id} value={r.id}>
                                    {r.numero}. {r.descripcion}{r.unidad ? ` · ${r.unidad}` : ""} · ${fmt(r.precio_unitario)}
                                  </option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                          {linea.obra_rubro_id && (
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 120px", gap: 6, alignItems: "center" }}>
                              <span style={{ fontSize: 11, color: colors.muted }}>
                                Se reduce {linea.unidad ? `en ${linea.unidad}` : ""} a ${fmt(linea.precio_unitario)} cada uno
                              </span>
                              <input type="number" step="0.01" value={linea.cantidad}
                                onChange={e => setLinea(l => ({ ...l, cantidad: e.target.value }))}
                                placeholder="Cuánto" style={{ ...inputStyle, padding: "7px 9px", fontSize: 12 }} />
                              <span style={{ fontSize: 13, fontWeight: 700, color: colors.danger, textAlign: "right" }}>
                                −${fmt((Number(linea.cantidad) || 0) * (Number(linea.precio_unitario) || 0))}
                              </span>
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <input value={linea.descripcion} onChange={e => setLinea(l => ({ ...l, descripcion: e.target.value }))}
                            placeholder="Qué se adiciona al contrato" style={{ ...inputStyle, padding: "7px 9px", fontSize: 12.5 }} />
                          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.7fr 0.8fr 1fr", gap: 6 }}>
                            <select value={linea.capitulo} onChange={e => setLinea(l => ({ ...l, capitulo: e.target.value }))}
                              style={{ ...inputStyle, padding: "7px 9px", fontSize: 12 }}>
                              <option value="">¿A qué capítulo va?</option>
                              {capitulos.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <input value={linea.unidad} onChange={e => setLinea(l => ({ ...l, unidad: e.target.value }))}
                              placeholder="u, m2" style={{ ...inputStyle, padding: "7px 9px", fontSize: 12 }} />
                            <input type="number" step="0.01" value={linea.cantidad} onChange={e => setLinea(l => ({ ...l, cantidad: e.target.value }))}
                              placeholder="Cant" style={{ ...inputStyle, padding: "7px 9px", fontSize: 12 }} />
                            <input type="number" step="0.01" value={linea.precio_unitario} onChange={e => setLinea(l => ({ ...l, precio_unitario: e.target.value }))}
                              placeholder="P.U." style={{ ...inputStyle, padding: "7px 9px", fontSize: 12 }} />
                          </div>
                          {/* Lo que casi nunca hace falta, fuera del camino.
                              La especificación la usa una obra de cada diez y
                              el número de rubro lo pone el control: tenerlos
                              siempre a la vista hacía que el formulario
                              pareciera pedir ocho cosas para agregar una. */}
                          {verDetalle ? (
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                              <input value={linea.especificacion} onChange={e => setLinea(l => ({ ...l, especificacion: e.target.value }))}
                                placeholder="Especificación técnica" style={{ ...inputStyle, padding: "7px 9px", fontSize: 12 }} />
                              <input value={linea.rubro_codigo} onChange={e => setLinea(l => ({ ...l, rubro_codigo: e.target.value }))}
                                placeholder="N° de rubro" style={{ ...inputStyle, padding: "7px 9px", fontSize: 12 }} />
                            </div>
                          ) : (
                            <button onClick={() => setVerDetalle(true)}
                              style={{ background: "none", border: "none", padding: 0, color: colors.muted, fontSize: 11,
                                cursor: "pointer", fontFamily: colors.font, textAlign: "left" }}>
                              + especificación y número de rubro
                            </button>
                          )}
                        </>
                      )}
                    </div>
                    {linea.obra_rubro_id && (() => {
                      const r = rubrosBase.find(x => String(x.id) === String(linea.obra_rubro_id));
                      if (!r) return null;
                      const monto = (Number(linea.cantidad) || 0) * (Number(linea.precio_unitario) || 0);
                      const sePasa = linea.tipo === "quita" && monto > (Number(r.total_base) || 0) + 0.005;
                      return (
                        <div style={{ fontSize: 10.5, color: sePasa ? colors.warning : colors.muted, marginTop: 5, lineHeight: 1.5 }}>
                          Ese rubro tiene ${fmt(r.total_base)} en el presupuesto ({fmt(r.cantidad)} {r.unidad || ""}).
                          {sePasa && " Estás sacando más de lo que había: revisá la cantidad."}
                        </div>
                      );
                    })()}

                    <Button variant="outline" size="sm" style={{ marginTop: 7 }}
                      disabled={ocupado || !linea.descripcion.trim() || !Number(linea.precio_unitario)
                        || (linea.tipo === "quita" && !linea.obra_rubro_id)}
                      onClick={async () => {
                        const r = await agregarLinea(o.id, { ...linea, orden: suyas.length }, suyas);
                        if (r.error) { setAviso(r.error); return; }
                        setLinea(LINEA_VACIA); setVerDetalle(false); await cargar(); onCambio?.();
                      }}>
                      <Plus size={12} /> Agregar línea
                    </Button>
                    <button onClick={() => { setAgregandoEn(null); setVerDetalle(false); }}
                      style={{ background: "none", border: "none", marginLeft: 10, color: colors.muted,
                        fontSize: 11.5, cursor: "pointer", fontFamily: colors.font }}>
                      Cancelar
                    </button>
                  </div>
                ))}

                {/* El resultado, que es lo que se conversa con el cliente. */}
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "7px 0", borderTop: `1px solid ${colors.neutralSoft}`, marginBottom: 8 }}>
                  <span style={{ flex: 1, fontSize: 12, color: colors.inkSoft, fontWeight: 600 }}>Total</span>
                  {/* Rojo cuando sube y verde cuando baja: el color habla de la
                      plata del que paga, no del signo del número. Una orden que
                      agrega 226 dólares no es una buena noticia para nadie, y
                      pintarla de verde —como estaba— la hacía parecer una. */}
                  <span style={{ fontSize: 16, fontWeight: 700, color: total < 0 ? colors.success : colors.danger }}>
                    {total < 0 ? "−" : "+"}${fmt(Math.abs(total))}
                  </span>
                </div>

                <div style={{ fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.4, marginBottom: 3 }}>
                  CAPÍTULO III · IMPACTO EN CRONOGRAMA
                </div>
                <textarea defaultValue={o.impacto_cronograma || ""} readOnly={!editable} rows={2}
                  onBlur={e => editable && e.target.value !== (o.impacto_cronograma || "") && hacer(() => guardarOrden(o.id, { impacto_cronograma: e.target.value }))}
                  placeholder="Ej: impacto estimado de 4 días por detención de trabajos"
                  style={{ ...inputStyle, fontSize: 12.5, padding: "7px 9px", resize: "vertical", marginBottom: 8, width: "100%", boxSizing: "border-box" }} />

                {/* CAPÍTULO IV · quién revisa. El contratista somos nosotros; la
                    fiscalización y el contratante responden al correo, y lo que
                    digan se escribe acá para que el papel quede completo. */}
                <div style={{ fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.4, marginBottom: 3 }}>
                  CAPÍTULO IV · REVISIÓN Y APROBACIÓN
                </div>
                <div style={{ display: "grid", gap: 4, marginBottom: 9 }}>
                  {[["contratista", "Contratista"], ["fiscalizacion", "Fiscalización"], ["contratante", "Contratante"]].map(([k, label]) => (
                    <div key={k} style={{ display: "grid", gridTemplateColumns: "92px 1fr 1fr", gap: 5, alignItems: "center" }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.3 }}>{label.toUpperCase()}</span>
                      <input defaultValue={o[`${k}_nombre`] || ""} readOnly={!editable} placeholder="Nombre"
                        onBlur={e => editable && e.target.value !== (o[`${k}_nombre`] || "") && hacer(() => guardarOrden(o.id, { [`${k}_nombre`]: e.target.value || null }))}
                        style={{ ...inputStyle, fontSize: 11.5, padding: "5px 7px" }} />
                      <input defaultValue={o[`${k}_comentario`] || ""} readOnly={!editable} placeholder="Comentarios"
                        onBlur={e => editable && e.target.value !== (o[`${k}_comentario`] || "") && hacer(() => guardarOrden(o.id, { [`${k}_comentario`]: e.target.value || null }))}
                        style={{ ...inputStyle, fontSize: 11.5, padding: "5px 7px" }} />
                    </div>
                  ))}
                </div>

                {/* Qué pasó con ella en obra, que no es lo mismo que en qué paso
                    va el papel: una orden aprobada puede no ejecutarse nunca. */}
                {puedeEditar && (
                  <div style={{ display: "flex", gap: 5, alignItems: "center", marginBottom: 9, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.3 }}>EN OBRA</span>
                    {Object.entries(EJECUCION).map(([v, e]) => {
                      const activo = (o.ejecucion || "por_definir") === v;
                      const c = { success: colors.success, muted: colors.muted, warning: colors.warning }[e.color];
                      return (
                        <button key={v} onClick={() => hacer(() => guardarOrden(o.id, { ejecucion: v }))} disabled={ocupado}
                          style={{ border: `1px solid ${activo ? c : colors.border}`, background: activo ? c : "#fff",
                            color: activo ? "#fff" : colors.inkSoft, borderRadius: 12, padding: "2px 9px", fontSize: 10.5,
                            fontWeight: 600, cursor: "pointer", fontFamily: colors.font }}>{e.label}</button>
                      );
                    })}
                    <button onClick={() => hacer(() => guardarOrden(o.id, { anulada: !o.anulada }))} disabled={ocupado}
                      style={{ border: `1px solid ${o.anulada ? colors.danger : colors.border}`, background: o.anulada ? colors.danger : "#fff",
                        color: o.anulada ? "#fff" : colors.inkSoft, borderRadius: 12, padding: "2px 9px", fontSize: 10.5,
                        fontWeight: 600, cursor: "pointer", fontFamily: colors.font }}>Anulada</button>
                  </div>
                )}

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {/* El PDF, con líneas o sin ellas: es el formato de la orden,
                      y uno quiere verlo antes de terminar de llenarla —no
                      después. Escondiéndolo hasta que hubiera líneas, el
                      formato parecía no existir. */}
                  {(
                    <Button variant="outline" size="sm" disabled={bajando === o.id}
                      onClick={async () => {
                        setBajando(o.id); setAviso("");
                        try {
                          const doc = await pdfDeOrden({
                            orden: o, lineas: suyas, fotos: suyasFotos, enlaces, obra, proyecto,
                            codigo: codigoDe(o), subtotales: sub, resumenContrato: resumen,
                          });
                          doc.save(`${codigoDe(o)} - ${proyecto || obra.nombre}.pdf`);
                        } catch (e) { setAviso("No se pudo armar el PDF: " + e.message); }
                        setBajando(null);
                      }}>
                      <Download size={12} /> {bajando === o.id ? "Armando…" : "PDF"}
                    </Button>
                  )}
                  {/* Tres caminos distintos y por eso tres botones. Algunos
                      clientes quieren el papel por su canal; otras órdenes
                      necesitan el visto antes de que el precio salga de la
                      oficina —una vez que el cliente lo vio, bajarlo es una
                      negociación y subirlo es imposible. */}
                  {puedeEditar && suyas.length > 0 && !o.visto_at && !esDirector && (
                    <Button variant="outline" size="sm" disabled={ocupado}
                      onClick={() => hacer(() => pedirVisto(o.id))}>
                      {o.visto_pedido_at ? "Visto pedido" : "Pedir el visto del Director"}
                    </Button>
                  )}
                  {esDirector && suyas.length > 0 && !o.visto_at && (
                    <Button variant="primary" size="sm" disabled={ocupado}
                      onClick={() => {
                        const c = window.prompt("¿Algo que aclarar antes de que salga? (opcional)", "");
                        if (c === null) return;
                        hacer(() => darVisto(o, currentUser, c));
                      }}>
                      <Check size={12} /> Dar el visto
                    </Button>
                  )}
                  {puedeEditar && suyas.length > 0 && (
                    <Button variant={o.visto_at || esDirector ? "outline" : "secondary"} size="sm"
                      title={o.visto_at || esDirector ? "" : "Todavía no tiene el visto del Director"}
                      onClick={() => {
                        if (!o.visto_at && !esDirector &&
                          !window.confirm("Esta orden no tiene el visto del Director.\n\nUna vez que el cliente ve el precio, bajarlo es una negociación y subirlo es imposible. ¿Mandarla igual?")) return;
                        setMandando({ orden: o, correos: invitados.filter(i => i.recibe_ordenes).map(i => i.email), cuerpo: "" });
                      }}>
                      <Mail size={12} /> Enviar al cliente
                    </Button>
                  )}
                  {puedeEditar && o.estado !== "aprobada" && suyas.length > 0 && (
                    <Button variant="primary" size="sm" disabled={ocupado}
                      onClick={() => {
                        const quien = window.prompt("¿Quién la aprobó? (nombre del contratante o fiscalizador)", o.contratante_nombre || "");
                        if (quien === null) return;
                        hacer(() => aprobarOrden(o, suyas, currentUser, { aprobada_por: quien }));
                      }}>
                      <Check size={12} /> Aprobada: llevar al control
                    </Button>
                  )}
                  {puedeEditar && o.estado === "aprobada" && (
                    <Button variant="secondary" size="sm" disabled={ocupado}
                      onClick={() => { if (window.confirm("¿Deshacer la aprobación? Sus líneas salen del control de obra y la orden vuelve a revisión.")) hacer(() => desaprobarOrden(o)); }}>
                      <RotateCcw size={12} /> Deshacer aprobación
                    </Button>
                  )}
                  {puedeEditar && o.estado !== "aprobada" && o.estado !== "rechazada" && (
                    <Button variant="secondary" size="sm" disabled={ocupado}
                      onClick={() => hacer(() => guardarOrden(o.id, { estado: "rechazada" }))}>
                      <X size={12} /> No se hace
                    </Button>
                  )}
                  {/* Borrar, aunque esté aprobada: una orden cargada con un
                      error hay que poder sacarla, y antes había que acordarse
                      de deshacer la aprobación primero. Se lleva sus rubros
                      del control, que es lo que corresponde: sin el papel que
                      los justifica, esa plata no puede quedar en el total. */}
                  {puedeEditar && (
                    <button onClick={() => {
                      const aviso = o.estado === "aprobada"
                        ? `¿Borrar la ${codigoDe(o)}?\n\nEstá aprobada: sus rubros salen del control de obra y el presupuesto vuelve a lo de antes. Se van también sus líneas y sus soportes.`
                        : `¿Borrar la ${codigoDe(o)}? Se van también sus líneas y sus soportes.`;
                      if (window.confirm(aviso)) hacer(() => borrarOrden(o.id));
                    }}
                      disabled={ocupado} style={{ marginLeft: "auto", background: "none", border: "none", color: colors.danger, fontSize: 11.5, cursor: "pointer", fontFamily: colors.font }}>
                      Borrar
                    </button>
                  )}
                </div>

                {o.estado === "aprobada" && (
                  <div style={{ fontSize: 11, color: colors.success, marginTop: 7 }}>
                    Aprobada{o.contratante_nombre ? ` por ${o.contratante_nombre}` : ""}{o.aprobada_at ? ` el ${new Date(o.aprobada_at).toLocaleDateString("es-EC")}` : ""}.
                    Sus líneas ya están en el control como adicionales.
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Mandarla: a la gente del proyecto que ya está cargada, o a quien se
          escriba. El documento lo arma el servidor con lo que dice la base. */}
      {mandando && (
        <div onClick={() => setMandando(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(17,24,39,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 16 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: colors.radiusMd, padding: 18, width: "min(460px, 100%)", maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: colors.ink, marginBottom: 3 }}>
              Enviar la {codigoDe(mandando.orden)}
            </div>
            <div style={{ fontSize: 11.5, color: colors.muted, marginBottom: 10, lineHeight: 1.5 }}>
              Va el documento completo: las líneas, la diferencia y el nuevo valor del contrato.
            </div>

            {invitados.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.4, marginBottom: 4 }}>GENTE DEL PROYECTO</div>
                {invitados.map(i => {
                  const puesto = mandando.correos.includes(i.email);
                  return (
                    <label key={i.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "3px 0", fontSize: 12.5, color: colors.ink, cursor: "pointer" }}>
                      <input type="checkbox" checked={puesto}
                        onChange={() => setMandando(m => ({ ...m, correos: puesto ? m.correos.filter(c => c !== i.email) : [...m.correos, i.email] }))} />
                      {i.nombre}{i.rol ? ` · ${i.rol}` : ""} <span style={{ color: colors.muted, fontSize: 11 }}>{i.email}</span>
                    </label>
                  );
                })}
              </div>
            )}

            <label style={{ fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.4 }}>OTROS CORREOS</label>
            <input placeholder="cliente@empresa.com, gerente@…"
              onChange={e => setMandando(m => ({ ...m, sueltos: e.target.value }))}
              style={{ ...inputStyle, marginTop: 4, marginBottom: 8 }} />

            <label style={{ fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.4 }}>NOTA (OPCIONAL)</label>
            <textarea rows={2} value={mandando.cuerpo} onChange={e => setMandando(m => ({ ...m, cuerpo: e.target.value }))}
              placeholder="Lo que quieras decirles antes del cuadro" style={{ ...inputStyle, marginTop: 4, resize: "vertical" }} />

            <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
              <Button variant="primary" size="sm" disabled={ocupado}
                onClick={async () => {
                  const sueltos = String(mandando.sueltos || "").split(/[,;\s]+/).filter(x => x.includes("@"));
                  const todos = [...new Set([...mandando.correos, ...sueltos])];
                  if (!todos.length) { setAviso("Elegí a quién mandársela."); return; }
                  setOcupado(true);
                  const r = await enviarOrden(mandando.orden, todos, mandando.cuerpo, currentUser);
                  setOcupado(false);
                  if (r.error) { setAviso(r.error); return; }
                  setMandando(null); setAviso(""); await cargar(); onCambio?.();
                }}>
                <Mail size={12} /> Enviar
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setMandando(null)}>Cancelar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
