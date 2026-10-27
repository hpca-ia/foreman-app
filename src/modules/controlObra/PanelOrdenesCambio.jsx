import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import { Plus, Trash2, Mail, Check, X, FileText, RotateCcw, Camera, Download, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import { fmt } from "./calculos";
import {
  ESTADOS_ORDEN, EJECUCION, codigoDe, subtotales, cargarOrdenes, crearOrden, guardarOrden,
  borrarOrden, agregarLinea, borrarLinea, guardarLinea, aprobarOrden, desaprobarOrden, enviarOrden,
  pedirVisto, darVisto,
  subirSoporte, borrarSoporte, enlacesDeSoportes,
  guardarAprobador, borrarAprobador, aprobacionesDeOrdenes, nombreDelArchivo, moverLinea, gentePara,
} from "./ordenesDeCambio";
import { pdfDeOrden, pdfConsolidado, pdfLiquidacionInterna } from "./pdfOrdenCambio";
import {
  leerConNova, guardarCotizacion, cotizacionesDe, borrarCotizacion, guardarProveedor,
  enlacesDeCotizaciones, sincronizarBeneficios,
} from "./cotizacionesOrden";
import { margenDeOrden, partidasDeCotizacion, liquidacionInterna, tieneCosto, costoDeLinea, precioDeLinea } from "./cuentaOrdenCambio.js";
import ModalOrdenCambio from "./ModalOrdenCambio";

// Las órdenes de cambio de una obra.
//
// El documento se arma acá y se manda desde acá: quien lo hace no tiene que
// pasar por Word ni acordarse de adjuntar nada. Mientras está en borrador se
// le agregan y quitan líneas; al mandarlo queda "enviada" y ya se puede citar
// por su número; al aprobarse, y recién ahí, sus líneas entran al control.

const LINEA_VACIA = { descripcion: "", especificacion: "", rubro_codigo: "", unidad: "", cantidad: 1, precio_unitario: "", costo_unitario: "", tipo: "aumenta", capitulo: "", obra_rubro_id: "" };
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
  // Quién firma cada orden, por orden_id. Es la lista del CAPÍTULO IV y es la
  // misma de la que sale el envío: no se escribe dos veces.
  const [aprobadores, setAprobadores] = useState({});
  // Las cotizaciones de cada orden, por orden_id, y sus enlaces para abrirlas.
  const [cotizaciones, setCotizaciones] = useState({});
  const [enlacesCot, setEnlacesCot] = useState({});
  // Los beneficios que dejaron las órdenes: la liquidación interna los usa
  // para saber qué partidas ya se compraron y a cuánto.
  const [beneficiosOC, setBeneficiosOC] = useState([]);
  // Lo que falta para que el costo se guarde: la migración 125, casi siempre.
  const [avisoCosto, setAvisoCosto] = useState("");
  const [leyendoCot, setLeyendoCot] = useState(null);   // { ordenId, paso }
  const [verRenglones, setVerRenglones] = useState(null);
  const [verLiquidacion, setVerLiquidacion] = useState(false);
  const cotRef = useRef(null);
  const cotPara = useRef(null);

  const puedeEditar = puede?.("obras.crear") !== false;
  // UNA CELDA QUE SE PUEDE ESCRIBIR TIENE QUE PARECERLO.
  //
  // Las hice sin borde para que la tabla siguiera leyéndose como una tabla, y
  // el resultado fue peor que no poder editar: se podía, y no había manera de
  // saberlo. Un campo invisible que guarda al salir es un campo que nadie usa.
  // Borde tenue y fondo blanco: se lee igual y se ve que se toca.
  const celda = { border: `1px solid ${colors.border}`, borderRadius: 5, padding: "3px 6px",
    fontSize: 12, fontFamily: colors.font, color: colors.ink, background: "#fff", outline: "none" };
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
    setAprobadores(await aprobacionesDeOrdenes((r.ordenes || []).map(o => o.id)));

    // LA COTIZACIÓN Y LO QUE DEJA. Se recalcula acá, al abrir, porque una
    // orden también se aprueba sola desde el portal cuando firman todos, y
    // ahí no pasa por la oficina: si el beneficio naciera solo al aprobar
    // desde acá, las que aprueba el cliente no llegarían nunca a la obra.
    const c = await cotizacionesDe((r.ordenes || []).map(o => o.id));
    setCotizaciones(c.porOrden);
    setEnlacesCot(await enlacesDeCotizaciones(Object.values(c.porOrden).flat()));
    const sync = await sincronizarBeneficios(obra.id);
    setAvisoCosto(c.error || sync.error || "");
    const { data: bs } = await supabase.from("obra_beneficios").select("*")
      .eq("obra_id", obra.id).not("orden_cambio_id", "is", null);
    setBeneficiosOC(bs || []);
  }, [obra.id]);
  useEffect(() => { cargar(); }, [cargar]);

  // A quién se le manda: la gente del proyecto que ya está cargada, de las
  // dos listas donde vive —los convocados del acta y los invitados del
  // pipeline—. El que arma la orden no tiene por qué saber en cuál quedó cada
  // uno: lo que no aparece acá se termina tipeando de nuevo.
  useEffect(() => {
    if (!obra.lead_id) return;
    gentePara(obra.lead_id).then(setInvitados);
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

  // LOS DE SIEMPRE.
  //
  // La fiscalización y el cliente son los mismos todo el año. Volver a
  // escribir sus correos en cada orden es donde se cuela la letra cambiada que
  // después rebota —y un correo de aprobación que rebota no se nota: se
  // parece a un cliente que no contestó—. Trae la gente del proyecto que
  // recibe órdenes y no está ya en la lista.
  async function traerLosDeSiempre(o) {
    const ya = new Set((aprobadores[o.id] || []).map(a => String(a.email || "").toLowerCase()));
    const faltan = invitados.filter(i => !ya.has(String(i.email).toLowerCase()));
    if (!faltan.length) { setAviso("Ya están todos los del proyecto en la lista."); return; }
    await hacer(async () => {
      for (const i of faltan) {
        const r = await guardarAprobador({
          orden_id: o.id, nombre: i.nombre || "", empresa: i.empresa || null,
          rol: i.rol || "", email: i.email,
          // Vienen SIN marcar. De un proyecto salen veinte involucrados y
          // una orden la firman dos o tres; si vinieran marcados, la orden
          // quedaría esperando veinte firmas que nadie pidió y no entraría
          // nunca al presupuesto. Se tilda a los que aprueban.
          aprueba: false,
        });
        if (r.error) return r.error;
      }
      return null;
    });
  }

  /**
   * PEGAR, ARRASTRAR O ELEGIR: las tres cosas terminan en el mismo soporte.
   *
   * La foto de lo que se encontró llega por WhatsApp y se mira en la pantalla.
   * Lo natural es recortarla y pegarla, no guardarla en Descargas con un
   * nombre que nadie va a volver a encontrar para después buscarla en un
   * diálogo de archivos. Y las fotos de un hallazgo nunca son una: son cuatro.
   */
  const soportar = useCallback(async (orden, archivos, descripcion = "") => {
    const lista = [...(archivos || [])].filter(f => /^image\//.test(f.type || ""));
    if (!lista.length) { setAviso("Eso no es una imagen: el soporte se ve en el PDF y en el correo."); return; }
    setSubiendo(true); setAviso("");
    let cuantas = (fotos[orden.id] || []).length;
    for (const f of lista) {
      const r = await subirSoporte(orden, f, descripcion, currentUser, cuantas++);
      if (r.error) { setAviso(r.error); break; }
    }
    setSubiendo(false);
    await cargar();
  }, [fotos, currentUser, cargar]);

  // Se pega en toda la ventana mientras hay una orden abierta: no hay dónde
  // "hacer foco" para pegar, y pedirle a alguien que haga clic en el lugar
  // correcto antes de pegar es pedirle que adivine. Con el modal de una orden
  // nueva abierto manda el modal, que tiene su propio pegado.
  useEffect(() => {
    if (!abierta || nueva || mandando) return;
    const alPegar = ev => {
      const items = [...(ev.clipboardData?.items || [])];
      const item = items.find(i => i.kind === "file" && /^image\//.test(i.type));
      if (!item) return;
      const archivo = item.getAsFile();
      const orden = ordenes.find(x => x.id === abierta);
      if (!archivo || !orden || !puedeEditar || orden.estado === "aprobada") return;
      ev.preventDefault();
      soportar(orden, [archivo]);
    };
    window.addEventListener("paste", alPegar);
    return () => window.removeEventListener("paste", alPegar);
  }, [abierta, nueva, mandando, ordenes, puedeEditar, soportar]);

  async function hacer(fn) {
    setOcupado(true); setAviso("");
    const err = await fn();
    setOcupado(false);
    if (typeof err === "string" && err) { setAviso(err); return false; }
    await cargar(); onCambio?.();
    return true;
  }

  /**
   * Subir la cotización de una orden que ya existe.
   *
   * La orden se escribe el día del problema y la cotización llega una semana
   * después; o es una orden vieja, aprobada antes de que esto existiera, y
   * hay que cargarle el costo para poder liquidarla. En un borrador sin
   * partidas, los renglones entran como partidas; en el resto se guarda el
   * papel y el costo se pone partida por partida.
   */
  async function subirCotizacion(o, original) {
    if (!original) return;
    setLeyendoCot({ ordenId: o.id, paso: "" }); setAviso("");
    try {
      const leida = await leerConNova(original, rubros, paso => setLeyendoCot({ ordenId: o.id, paso: paso || "" }));
      const rc = await guardarCotizacion(o.id, leida.archivo, leida, currentUser);
      if (rc.error) throw new Error(rc.error);
      const suyas = lineas[o.id] || [];
      const vacia = !suyas.some(l => l.tipo !== "quita");
      if (puedeEditar && o.estado !== "aprobada" && vacia) {
        const err = await agregarPartidas(o, rc.cotizacion, suyas);
        if (err) throw new Error(err);
      }
      if (leida.cortado) setAviso("La cotización era larga y NOVA se quedó sin espacio: revisá el final contra el papel.");
    } catch (e) {
      setAviso(e.message);
    }
    setLeyendoCot(null);
    await cargar(); onCambio?.();
  }

  /** Los renglones de una cotización, como partidas de la orden con su costo. */
  async function agregarPartidas(o, c, yaPuestas) {
    const puestas = [...yaPuestas];
    for (const p of partidasDeCotizacion(c.items || [])) {
      const r = await agregarLinea(o.id, { ...p, orden: puestas.length, cotizacion_id: c.id }, puestas);
      if (r.error) return r.error;
      puestas.push(r.linea);
    }
    return null;
  }

  /**
   * Tomar los costos de la cotización, renglón por renglón, en orden.
   *
   * Solo cuando hay tantas adiciones como renglones: emparejar por posición
   * listas de distinto largo le pondría el costo de una cosa a otra, y ese
   * error no se ve hasta la liquidación.
   */
  async function tomarCostos(o, c) {
    const adiciones = (lineas[o.id] || []).filter(l => l.tipo !== "quita");
    await hacer(async () => {
      for (const [i, l] of adiciones.entries()) {
        const it = c.items[i];
        const cant = Number(l.cantidad) || Number(it.cantidad) || 1;
        const r = await guardarLinea(l.id, { costo_unitario: Math.round((Number(it.monto) / cant) * 10000) / 10000 });
        if (r.error) return r.error;
      }
      return null;
    });
  }

  if (sinTablas) {
    return (
      <div style={{ fontSize: 12.5, color: colors.warning, background: colors.warningSoft, border: `1px solid ${colors.warningBorder}`, borderRadius: colors.radiusMd, padding: 14 }}>
        Falta correr la migración 056 en Supabase para usar las órdenes de cambio.
      </div>
    );
  }

  // El cuadro de revisión de la orden que se está por mandar, sin los que ya
  // recibieron la suya: a esos no se les vuelve a mandar por error.
  const correoValido = e => /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(String(e || "").trim());
  const enElCuadro = mandando
    ? (aprobadores[mandando.orden.id] || []).filter(a => !a.envio_at && correoValido(a.email))
    : [];

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
          {/* La liquidación interna, aparte del consolidado y nunca dentro de
              él: el consolidado lo firma el cliente, y lo que cuesta cada
              orden es de la oficina. */}
          <Button variant={verLiquidacion ? "primary" : "outline"} size="sm" onClick={() => setVerLiquidacion(v => !v)}>
            Liquidación interna
          </Button>
        </div>
      )}

      {avisoCosto && (
        <div style={{ fontSize: 12, color: colors.warning, background: colors.warningSoft, border: `1px solid ${colors.warningBorder}`,
          borderRadius: colors.radiusMd, padding: "8px 12px", margin: "8px 0" }}>
          {avisoCosto} Mientras tanto las órdenes funcionan igual, pero su cotización y su costo no se guardan y no llegan a Beneficios.
        </div>
      )}

      {verLiquidacion && (() => {
        const liq = liquidacionInterna({ ordenes, lineasPorOrden: lineas, beneficios: beneficiosOC, cotizaciones, subtotalesDe: subtotales, codigoDe });
        const plata = v => `${Number(v) < 0 ? "−" : ""}$${fmt(Math.abs(Number(v) || 0))}`;
        const th = { textAlign: "right", padding: "5px 6px", fontSize: 9.5, color: colors.muted, letterSpacing: 0.3, fontWeight: 700 };
        const td = { textAlign: "right", padding: "5px 6px", whiteSpace: "nowrap" };
        return (
          <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: "11px 13px", margin: "8px 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: colors.ink }}>Liquidación interna de las órdenes de cambio</div>
                <div style={{ fontSize: 11, color: colors.muted, lineHeight: 1.5 }}>
                  Lo cobrado en cada orden aprobada contra lo que cuesta. El costo es el real si la partida ya se
                  compró y el de la cotización si no. <strong>No sale al cliente.</strong>
                </div>
              </div>
              <Button variant="outline" size="sm" disabled={!liq.filas.length}
                onClick={async () => {
                  try {
                    const doc = await pdfLiquidacionInterna({ liquidacion: liq, obra, proyecto });
                    doc.save(`Liquidación interna ODC - ${proyecto || obra.nombre}.pdf`);
                  } catch (e) { setAviso("No se pudo armar la liquidación: " + e.message); }
                }}>
                <Download size={13} /> PDF interno
              </Button>
            </div>
            {!liq.filas.length ? (
              <div style={{ fontSize: 12, color: colors.muted }}>Todavía no hay órdenes aprobadas.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 640 }}>
                  <thead>
                    <tr style={{ background: colors.bg }}>
                      <th style={{ ...th, textAlign: "left" }}>ORDEN</th>
                      <th style={th}>TOTAL ODC</th>
                      <th style={th}>COBRADO CON COSTO</th>
                      <th style={th}>COSTO COTIZADO</th>
                      <th style={th}>COSTO REAL</th>
                      <th style={th}>MARGEN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liq.filas.map(f => (
                      <tr key={f.id} style={{ borderTop: `1px solid ${colors.neutralSoft}` }}>
                        <td style={{ padding: "5px 6px" }}>
                          <span style={{ fontWeight: 700, color: colors.muted, fontSize: 11 }}>{f.codigo}</span> {f.titulo}
                          <div style={{ fontSize: 10.5, color: colors.muted }}>
                            {[f.proveedores.join(", "),
                              f.sinCosto ? `${f.sinCosto} partida${f.sinCosto === 1 ? "" : "s"} sin costo` : "",
                              f.comprados ? `${f.comprados} ya comprada${f.comprados === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ")}
                          </div>
                        </td>
                        <td style={td}>{plata(f.total)}</td>
                        <td style={td}>{f.conCosto ? plata(f.cobradoConCosto) : "—"}</td>
                        <td style={td}>{f.conCosto ? plata(f.costoCotizado) : "—"}</td>
                        <td style={td}>{f.costoReal != null ? plata(f.costoReal) : "—"}</td>
                        <td style={{ ...td, fontWeight: 700, color: !f.conCosto ? colors.muted : f.margen < 0 ? colors.danger : colors.success }}>
                          {f.conCosto ? `${plata(f.margen)}${f.pct != null ? ` · ${f.pct}%` : ""}` : "sin costo"}
                        </td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: `2px solid ${colors.border}`, fontWeight: 700 }}>
                      <td style={{ padding: "6px" }}>Total</td>
                      <td style={td}>{plata(liq.total.total)}</td>
                      <td style={td}>{plata(liq.total.cobradoConCosto)}</td>
                      <td style={td}>{plata(liq.total.costoCotizado)}</td>
                      <td style={td} />
                      <td style={{ ...td, color: liq.total.margen < 0 ? colors.danger : colors.success }}>
                        {plata(liq.total.margen)}{liq.total.pct != null ? ` · ${liq.total.pct}%` : ""}
                      </td>
                    </tr>
                  </tbody>
                </table>
                {liq.total.ordenesSinCosto > 0 && (
                  <div style={{ fontSize: 11, color: colors.warning, marginTop: 6 }}>
                    {liq.total.ordenesSinCosto} orden{liq.total.ordenesSinCosto === 1 ? "" : "es"} con partidas sin costo: su margen
                    no se sabe y no entra en el total. Subí la cotización o escribí el costo en cada partida.
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {aviso && <div style={{ fontSize: 12, color: colors.danger, margin: "8px 0" }}>{aviso}</div>}
      <input ref={cotRef} type="file" accept="image/*,.pdf,.xlsx,.xlsm,.xls" style={{ display: "none" }}
        onChange={e => { const f2 = e.target.files?.[0]; e.target.value = ""; if (f2 && cotPara.current) subirCotizacion(cotPara.current, f2); }} />

      {/* Una orden nueva: lo mínimo para poder empezar a listar qué cambia. */}
      {nueva === true && (
        <ModalOrdenCambio obra={obra} proyecto={proyecto} rubros={rubros} currentUser={currentUser}
          puedeAprobar={puedeEditar}
          onCerrar={() => setNueva(null)}
          onCreada={async (orden, avisoCot) => { setNueva(null); await cargar(); setAbierta(orden.id); if (avisoCot) setAviso(avisoCot); }} />
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
              {/* VENCIDA SIN FIRMA. Es el dato que no puede estar escondido
                  adentro de la fila: la obra está parada esperando esto. */}
              {o.fecha_limite_aprobacion && !o.aprobada_at && o.estado !== "aprobada"
                && (o.fecha_limite_aprobacion || "").slice(0, 10) < new Date().toISOString().slice(0, 10) && (
                <span title={`Había que aprobarla antes del ${o.fecha_limite_aprobacion}`}
                  style={{ fontSize: 9.5, fontWeight: 700, color: "#fff", background: colors.danger,
                    borderRadius: 9, padding: "1px 7px", whiteSpace: "nowrap" }}>
                  VENCIÓ EL PLAZO
                </span>
              )}
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
                {/* LA CABECERA TAMBIÉN SE CORRIGE. Un borrador se abre para
                    seguirlo: el título cambia cuando se entiende mejor el
                    problema, y la fecha es la del día en que se emite, no la
                    del día en que se empezó a escribir. */}
                {editable ? (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 150px 120px 130px", gap: 6, marginBottom: 8 }}>
                    <input defaultValue={o.titulo || ""} key={`t${o.id}-${o.titulo}`} placeholder="Título"
                      onBlur={e => e.target.value.trim() && e.target.value !== (o.titulo || "")
                        && hacer(() => guardarOrden(o.id, { titulo: e.target.value.trim() }))}
                      style={{ ...inputStyle, padding: "5px 8px", fontSize: 12 }} />
                    <input defaultValue={o.tipo || ""} key={`ti${o.id}-${o.tipo}`} placeholder="Tipo"
                      onBlur={e => e.target.value !== (o.tipo || "")
                        && hacer(() => guardarOrden(o.id, { tipo: e.target.value.trim() || null }))}
                      style={{ ...inputStyle, padding: "5px 8px", fontSize: 12 }} />
                    <input defaultValue={o.lugar || ""} key={`lu${o.id}-${o.lugar}`} placeholder="Lugar"
                      onBlur={e => e.target.value !== (o.lugar || "")
                        && hacer(() => guardarOrden(o.id, { lugar: e.target.value.trim() || null }))}
                      style={{ ...inputStyle, padding: "5px 8px", fontSize: 12 }} />
                    <input type="date" defaultValue={(o.fecha || "").slice(0, 10)} key={`fe${o.id}-${o.fecha}`}
                      onBlur={e => e.target.value !== (o.fecha || "").slice(0, 10)
                        && hacer(() => guardarOrden(o.id, { fecha: e.target.value || null }))}
                      style={{ ...inputStyle, padding: "5px 8px", fontSize: 12 }} />
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: colors.muted, marginBottom: 6 }}>
                    {[o.tipo, o.lugar, o.fecha && new Date(`${o.fecha}T12:00:00`).toLocaleDateString("es-EC"),
                      o.emitido_por && `Emitida por ${o.emitido_por}`].filter(Boolean).join(" · ")}
                  </div>
                )}

                {/* HASTA CUÁNDO HAY PARA APROBARLA. */}
                {editable ? (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, color: colors.muted, fontWeight: 700, letterSpacing: 0.3 }}>APROBAR ANTES DEL</span>
                    <input type="date" defaultValue={(o.fecha_limite_aprobacion || "").slice(0, 10)}
                      key={`fl${o.id}-${o.fecha_limite_aprobacion}`}
                      onBlur={e => e.target.value !== (o.fecha_limite_aprobacion || "").slice(0, 10)
                        && hacer(() => guardarOrden(o.id, { fecha_limite_aprobacion: e.target.value || null }))}
                      style={{ ...inputStyle, padding: "5px 8px", fontSize: 12, width: 150 }} />
                    <span style={{ fontSize: 10.5, color: colors.muted }}>
                      Mientras no se apruebe, el trabajo no se ejecuta y el plazo corre igual.
                    </span>
                  </div>
                ) : o.fecha_limite_aprobacion && (
                  <div style={{ fontSize: 11.5, color: colors.inkSoft, marginBottom: 6 }}>
                    Había que aprobarla antes del {new Date(`${o.fecha_limite_aprobacion}T12:00:00`).toLocaleDateString("es-EC", { day: "numeric", month: "long" })}
                  </div>
                )}
                {o.visto_at && (
                  <div style={{ fontSize: 11.5, color: colors.success, marginBottom: 6 }}>
                    Aprobada por {o.visto_nombre || "la dirección"} · {new Date(o.visto_at).toLocaleDateString("es-EC", { day: "numeric", month: "long" })}
                    {o.visto_comentario && <span style={{ color: colors.inkSoft }}> — {o.visto_comentario}</span>}
                  </div>
                )}
                {!o.visto_at && o.visto_pedido_at && (
                  <div style={{ fontSize: 11.5, color: colors.warning, marginBottom: 6 }}>
                    Esperando la aprobación del Director desde el {new Date(o.visto_pedido_at).toLocaleDateString("es-EC", { day: "numeric", month: "long" })}
                  </div>
                )}

                {/* QUE SE PUEDA EDITAR SE DICE. Una pantalla donde todo se
                    guarda solo al salir del campo no se distingue de una de
                    solo lectura hasta que uno se anima a tocar algo. */}
                {editable && (
                  <div style={{ fontSize: 11, color: colors.brand, background: colors.brandSoft,
                    border: `1px solid ${colors.border}`, borderRadius: colors.radiusSm,
                    padding: "5px 9px", marginBottom: 8, lineHeight: 1.45 }}>
                    Esta orden está en borrador: <strong>todos los campos se pueden corregir</strong> —el título,
                    los argumentos, y la descripción, cantidad y precio de cada partida—. Se guarda solo al salir
                    de cada campo.
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
                        onDragOver={ev => { ev.preventDefault(); ev.dataTransfer.dropEffect = "copy"; }}
                        onDrop={ev => { ev.preventDefault(); soportar(o, ev.dataTransfer?.files || []); }}
                        style={{ width: "100%", background: colors.bg, border: `1px dashed ${colors.border}`, borderRadius: 8, padding: "9px",
                          color: colors.inkSoft, fontSize: 12, cursor: "pointer", fontFamily: colors.font, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                        <Camera size={13} /> {subiendo ? "Subiendo…" : "Agregar foto o plano"}
                      </button>
                      <div style={{ fontSize: 10.5, color: colors.muted, textAlign: "center", marginTop: 3 }}>
                        o pegá una captura con {navigator.platform?.includes("Mac") ? "⌘V" : "Ctrl+V"}, o arrastrala acá
                      </div>
                      <input ref={camRef} type="file" accept="image/*" multiple style={{ display: "none" }}
                        onChange={async ev => {
                          const elegidos = [...(ev.target.files || [])];
                          ev.target.value = "";
                          if (!elegidos.length) return;
                          // La descripción se pregunta cuando es UNA. Con
                          // cuatro, un prompt por imagen es un interrogatorio
                          // y se termina cancelando la carga por el medio.
                          const descripcion = elegidos.length === 1
                            ? (window.prompt("¿Qué se ve en esta imagen? (opcional)", "") || "")
                            : "";
                          await soportar(o, elegidos, descripcion);
                        }} />
                    </>
                  )}
                </div>

                {/* LA COTIZACIÓN DEL PROVEEDOR, GUARDADA CON LA ORDEN.
                    Es el papel que dice cuánto cuesta lo que se cobra: con él
                    se liquida la obra y se discute con el proveedor. Se puede
                    subir también a una orden aprobada, para cargarle el costo
                    a las que se aprobaron antes de que esto existiera. No sale
                    en el documento ni en el correo: es de la oficina. */}
                {(() => {
                  const cots = cotizaciones[o.id] || [];
                  const adiciones = suyas.filter(l => l.tipo !== "quita");
                  const leyendoEsta = leyendoCot?.ordenId === o.id;
                  if (!cots.length && !puedeEditar) return null;
                  return (
                    <div style={{ marginBottom: 9 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.4, marginBottom: 4 }}>
                        COTIZACIÓN DEL PROVEEDOR{cots.length ? ` · ${cots.length}` : ""} <span style={{ fontWeight: 600 }}>· INTERNA, NO SALE AL CLIENTE</span>
                      </div>
                      {cots.map(c => (
                        <div key={c.id} style={{ background: colors.bg, borderRadius: 7, padding: "6px 9px", marginBottom: 5, fontSize: 11.5 }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            {enlacesCot[c.id]
                              ? <a href={enlacesCot[c.id]} target="_blank" rel="noreferrer" style={{ color: colors.brand, fontWeight: 600 }}>
                                  <FileText size={11} style={{ verticalAlign: -1 }} /> {c.archivo_nombre || "Abrir la cotización"}
                                </a>
                              : <span style={{ color: colors.muted }}>{c.archivo_nombre || "Sin archivo"}</span>}
                            {puedeEditar ? (
                              <input defaultValue={c.proveedor || ""} key={`pv${c.id}-${c.proveedor}`} placeholder="Proveedor"
                                onBlur={e => e.target.value.trim() !== (c.proveedor || "") && hacer(() => guardarProveedor(c.id, e.target.value))}
                                style={{ ...celda, width: 170 }} />
                            ) : <span style={{ color: colors.ink }}>{c.proveedor || "Proveedor sin nombre"}</span>}
                            <span style={{ color: colors.muted }}>{(c.items || []).length} renglones · ${fmt(c.total)}</span>
                            <button onClick={() => setVerRenglones(v => v === c.id ? null : c.id)}
                              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: colors.font, fontSize: 11, color: colors.brand, textDecoration: "underline" }}>
                              {verRenglones === c.id ? "ocultar lo leído" : "ver lo leído"}
                            </button>
                            {puedeEditar && o.estado !== "aprobada" && (c.items || []).length > 0 && (
                              <button onClick={() => hacer(() => agregarPartidas(o, c, suyas))} disabled={ocupado}
                                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: colors.font, fontSize: 11, color: colors.brand, textDecoration: "underline" }}>
                                agregar sus renglones como partidas
                              </button>
                            )}
                            {puedeEditar && adiciones.length > 0 && adiciones.length === (c.items || []).length && (
                              <button onClick={() => tomarCostos(o, c)} disabled={ocupado}
                                title="Le pone a cada adición el costo del renglón que está en su misma posición"
                                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: colors.font, fontSize: 11, color: colors.brand, textDecoration: "underline" }}>
                                tomar los costos en orden
                              </button>
                            )}
                            {puedeEditar && (
                              <button onClick={() => { if (window.confirm("¿Quitar esta cotización? Se borra el archivo. Los costos que ya se pusieron en las partidas se quedan.")) hacer(() => borrarCotizacion(c)); }}
                                title="Quitar la cotización"
                                style={{ background: "none", border: "none", color: colors.border, cursor: "pointer", display: "flex", padding: 0, marginLeft: "auto" }}>
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                          {verRenglones === c.id && (
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, marginTop: 5 }}>
                              <tbody>
                                {(c.items || []).map((x, k) => (
                                  <tr key={k} style={{ borderTop: `1px solid ${colors.neutralSoft}` }}>
                                    <td style={{ padding: "3px 4px", color: colors.ink }}>{x.descripcion}</td>
                                    <td style={{ padding: "3px 4px", textAlign: "right", color: colors.muted, whiteSpace: "nowrap" }}>{fmt(x.cantidad)} {x.unidad}</td>
                                    <td style={{ padding: "3px 4px", textAlign: "right", fontWeight: 600, whiteSpace: "nowrap" }}>${fmt(x.monto)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      ))}
                      {puedeEditar && (
                        <button onClick={() => { cotPara.current = o; cotRef.current?.click(); }} disabled={!!leyendoCot}
                          onDragOver={ev => { ev.preventDefault(); ev.dataTransfer.dropEffect = "copy"; }}
                          onDrop={ev => { ev.preventDefault(); const f2 = [...(ev.dataTransfer?.files || [])][0]; if (f2) subirCotizacion(o, f2); }}
                          style={{ width: "100%", background: colors.bg, border: `1px dashed ${colors.border}`, borderRadius: 8, padding: "8px",
                            color: colors.inkSoft, fontSize: 12, cursor: leyendoCot ? "wait" : "pointer", fontFamily: colors.font,
                            display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                          <FileText size={13} />
                          {leyendoEsta ? `NOVA está leyendo… ${leyendoCot.paso || ""}`
                            : cots.length ? "Subir otra cotización" : "Subir la cotización del proveedor (PDF, foto o Excel)"}
                        </button>
                      )}
                    </div>
                  );
                })()}

                <div style={{ fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.4, marginBottom: 3 }}>
                  CAPÍTULO II · ADICIONES Y REDUCCIONES
                </div>

                {/* Lo que cambia, línea por línea. */}
                {suyas.length > 0 && (
                  <div style={{ overflowX: "auto", marginBottom: 8 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 520 }}>
                      <thead>
                        <tr style={{ background: colors.bg }}>
                          {["", "Item", "Rubro", "Descripción", "Unid", "Cant", "P. unit", "Total", "Costo u.", ""].map((h, i) => (
                            <th key={h + i} title={i === 8 ? "Lo que cuesta según la cotización del proveedor. Interno: no sale en el documento." : undefined}
                              style={{ textAlign: i >= 5 && i <= 8 ? "right" : i === 4 ? "center" : "left",
                              padding: "5px 6px", fontSize: 9.5, color: colors.muted, letterSpacing: 0.3, fontWeight: 700 }}>{h.toUpperCase()}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[["aumenta", "ADICIONES", sub.adiciones], ["quita", "REDUCCIONES", sub.reducciones]].map(([tipo, titulo, monto]) => (
                          <Fragment key={tipo}>
                            <tr><td colSpan={10} style={{ background: colors.neutralSoft, padding: "3px 6px", fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, color: colors.inkSoft }}>{titulo}</td></tr>
                            {suyas.filter(l => (tipo === "quita" ? l.tipo === "quita" : l.tipo !== "quita")).map((l, i, grupo) => (
                              <tr key={l.id} style={{ borderTop: `1px solid ${colors.neutralSoft}` }}>
                                {/* SUBIRLA Y BAJARLA. El que aprueba la orden
                                    la lee en el orden del trabajo: primero lo
                                    que se demuele, después lo que se
                                    construye. Las partidas entran en el orden
                                    en que venían en la proforma, que es el del
                                    proveedor. */}
                                <td style={{ padding: "3px 2px", width: 14 }}>
                                  {editable && grupo.length > 1 && (
                                    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                                      <button onClick={() => hacer(() => moverLinea(suyas, l.id, -1))}
                                        disabled={i === 0 || ocupado} title="Subirla"
                                        style={{ background: "none", border: "none", padding: 0, lineHeight: 1, fontSize: 8,
                                          cursor: i === 0 ? "default" : "pointer", color: i === 0 ? colors.border : colors.muted }}>▲</button>
                                      <button onClick={() => hacer(() => moverLinea(suyas, l.id, 1))}
                                        disabled={i === grupo.length - 1 || ocupado} title="Bajarla"
                                        style={{ background: "none", border: "none", padding: 0, lineHeight: 1, fontSize: 8,
                                          cursor: i === grupo.length - 1 ? "default" : "pointer",
                                          color: i === grupo.length - 1 ? colors.border : colors.muted }}>▼</button>
                                    </div>
                                  )}
                                </td>
                                <td style={{ padding: "5px 6px", color: colors.muted, fontSize: 11, whiteSpace: "nowrap" }}>{l.item || ""}</td>
                                <td style={{ padding: "5px 6px", color: colors.muted, fontSize: 11, whiteSpace: "nowrap" }}>{l.rubro_codigo || ""}</td>
                                {/* LAS PARTIDAS SE CORRIGEN DONDE SE LEEN.
                                    Una orden se arma de a poco y el precio
                                    cambia una vez más antes de mandarla. Sin
                                    esto, corregir una cantidad obligaba a
                                    borrar la línea y escribirla de nuevo
                                    entera, que es como se pierde la
                                    descripción que alguien ya había redactado
                                    bien. Se guarda al salir del campo. */}
                                <td style={{ padding: "5px 6px", color: colors.ink }}>
                                  {editable ? (
                                    <input defaultValue={l.descripcion || ""} key={`d${l.id}-${l.descripcion}`}
                                      onBlur={e => e.target.value.trim() !== (l.descripcion || "")
                                        && hacer(() => guardarLinea(l.id, { descripcion: e.target.value }))}
                                      style={{ ...celda, width: "100%" }} />
                                  ) : l.descripcion}
                                  {l.especificacion && <div style={{ fontSize: 10, color: colors.muted }}>{l.especificacion}</div>}
                                  {l.capitulo && <div style={{ fontSize: 10, color: colors.muted }}>{l.capitulo}</div>}
                                </td>
                                <td style={{ padding: "5px 6px", textAlign: "center", color: colors.muted }}>
                                  {editable ? (
                                    <input defaultValue={l.unidad || ""} key={`u${l.id}-${l.unidad}`}
                                      onBlur={e => e.target.value.trim() !== (l.unidad || "")
                                        && hacer(() => guardarLinea(l.id, { unidad: e.target.value }))}
                                      style={{ ...celda, width: 46, textAlign: "center" }} />
                                  ) : (l.unidad || "")}
                                </td>
                                <td style={{ padding: "5px 6px", textAlign: "right" }}>
                                  {editable ? (
                                    <input type="number" step="0.01" defaultValue={l.cantidad ?? ""} key={`c${l.id}-${l.cantidad}`}
                                      onBlur={e => Number(e.target.value) !== Number(l.cantidad)
                                        && hacer(() => guardarLinea(l.id, { cantidad: e.target.value }))}
                                      style={{ ...celda, width: 66, textAlign: "right" }} />
                                  ) : fmt(l.cantidad)}
                                </td>
                                <td style={{ padding: "5px 6px", textAlign: "right" }}>
                                  {editable ? (
                                    <input type="number" step="0.01" defaultValue={l.precio_unitario ?? ""} key={`p${l.id}-${l.precio_unitario}`}
                                      onBlur={e => Number(e.target.value) !== Number(l.precio_unitario)
                                        && hacer(() => guardarLinea(l.id, { precio_unitario: e.target.value }))}
                                      style={{ ...celda, width: 82, textAlign: "right" }} />
                                  ) : fmt(l.precio_unitario)}
                                </td>
                                <td style={{ padding: "5px 6px", textAlign: "right", fontWeight: 600 }}>${fmt((Number(l.cantidad) || 0) * (Number(l.precio_unitario) || 0))}</td>
                                {/* EL COSTO SE PUEDE CORREGIR AUNQUE ESTÉ APROBADA:
                                    no cambia nada de lo que se firmó —es lo
                                    que cuesta, no lo que se cobra— y es justo
                                    lo que hay que cargarle a una orden vieja
                                    para poder liquidarla. */}
                                <td style={{ padding: "5px 6px", textAlign: "right", whiteSpace: "nowrap" }}>
                                  {l.tipo === "quita" ? null : puedeEditar ? (
                                    <input type="number" step="0.01" defaultValue={l.costo_unitario ?? ""} key={`k${l.id}-${l.costo_unitario}`}
                                      placeholder="—"
                                      onBlur={e => {
                                        const v = e.target.value;
                                        const antes = l.costo_unitario ?? "";
                                        if (v === "" ? antes === "" : Number(v) === Number(antes) && antes !== "") return;
                                        hacer(async () => (await guardarLinea(l.id, { costo_unitario: v })).error || null);
                                      }}
                                      style={{ ...celda, width: 76, textAlign: "right" }} />
                                  ) : (tieneCosto(l) ? fmt(l.costo_unitario) : "—")}
                                  {tieneCosto(l) && (() => {
                                    const m = precioDeLinea(l) - costoDeLinea(l);
                                    return (
                                      <div style={{ fontSize: 9.5, color: m < 0 ? colors.danger : m > 0 ? colors.success : colors.muted }}>
                                        {m < 0 ? "−" : "+"}${fmt(Math.abs(m))}
                                      </div>
                                    );
                                  })()}
                                </td>
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
                              <td colSpan={7} style={{ padding: "4px 6px", textAlign: "right", fontSize: 11, fontWeight: 700, color: colors.inkSoft }}>SUBTOTAL {titulo}</td>
                              <td style={{ padding: "4px 6px", textAlign: "right", fontWeight: 700 }}>${fmt(monto)}</td>
                              <td />
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
                          {/* ADICIONAR ALGO QUE YA ESTÁ CONTRATADO.
                              Más metros del mismo piso, dos puertas más de las
                              mismas. No toca el rubro original —el contrato no
                              se modifica, la adición vive en la orden— pero se
                              lleva su descripción, su unidad y su PRECIO
                              CONTRACTUAL, que es el que ya se negoció.
                              Tipearlo de nuevo es como aparece un adicional
                              del mismo trabajo a otro precio, y esa diferencia
                              la encuentra justo el que lo paga. */}
                          <select value=""
                            onChange={e => {
                              const r = rubrosBase.find(x => String(x.id) === e.target.value);
                              if (!r) return;
                              setLinea(l => ({
                                ...l,
                                descripcion: r.descripcion || "",
                                capitulo: r.capitulo || "",
                                unidad: r.unidad || "",
                                precio_unitario: r.precio_unitario ?? "",
                                rubro_codigo: String(r.numero ?? r.codigo ?? ""),
                                // La cantidad la pone quien arma la orden: lo que
                                // se adiciona casi nunca es todo el rubro de nuevo.
                                cantidad: l.cantidad || 1,
                              }));
                            }}
                            style={{ ...inputStyle, padding: "7px 9px", fontSize: 12 }}>
                            <option value="">Tomar un rubro del contrato (opcional): se copia su precio</option>
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
                          <input value={linea.descripcion} onChange={e => setLinea(l => ({ ...l, descripcion: e.target.value }))}
                            placeholder="Qué se adiciona al contrato" style={{ ...inputStyle, padding: "7px 9px", fontSize: 12.5 }} />
                          {linea.rubro_codigo && (
                            <div style={{ fontSize: 10.5, color: colors.muted, marginTop: -2 }}>
                              Precio tomado del rubro {linea.rubro_codigo} del contrato. El rubro original no se toca.
                            </div>
                          )}
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
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <input type="number" step="0.01" value={linea.costo_unitario} onChange={e => setLinea(l => ({ ...l, costo_unitario: e.target.value }))}
                              placeholder="Costo u." style={{ ...inputStyle, padding: "7px 9px", fontSize: 12, width: 120 }} />
                            <span style={{ fontSize: 10.5, color: colors.muted }}>
                              Lo que cuesta cada unidad según el proveedor. Interno: no sale en el documento. Vacío si no se sabe.
                            </span>
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
                {(() => {
                  const m = margenDeOrden(suyas);
                  if (!m.conCosto && !m.sinCosto) return null;
                  return (
                    <div style={{ fontSize: 11.5, color: colors.inkSoft, marginTop: -4, marginBottom: 8 }}>
                      {m.conCosto ? (
                        <>Margen interno: <strong style={{ color: m.margen < 0 ? colors.danger : colors.success }}>
                          {m.margen < 0 ? "−" : ""}${fmt(Math.abs(m.margen))}{m.pct != null ? ` · ${m.pct}%` : ""}
                        </strong> sobre ${fmt(m.cobrado)} cobrados, contra ${fmt(m.costo)} de costo.</>
                      ) : "Margen interno: no se sabe."}
                      {m.sinCosto > 0 && <span style={{ color: colors.warning }}> {m.sinCosto} adición{m.sinCosto === 1 ? "" : "es"} sin costo.</span>}
                    </div>
                  );
                })()}

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
                {/* QUIÉN FIRMA, CON SU CORREO: ES LA MISMA LISTA QUE SE MANDA.
                    Antes eran tres nombres sueltos que alguien tecleaba después
                    de que el otro dijera que sí por teléfono. Eso no es una
                    aprobación, es una anotación —y además obligaba a volver a
                    escribir los mismos datos en el diálogo de envío—.
                    Acá se llena una vez: nombre, empresa y correo. De esta lista
                    sale el envío, y en esta lista aparece quién aprobó. */}
                <div style={{ display: "grid", gap: 4, marginBottom: 9 }}>
                  {(aprobadores[o.id] || []).map(a2 => {
                    const estado = a2.aprueba === false ? (a2.envio_at ? "copia enviada" : "solo copia")
                      : a2.aprobado_at ? "aprobó" : a2.observacion ? "objetó"
                      : ["bounced", "failed", "complained"].includes(String(a2.envio_estado || "").toLowerCase()) ? "no le llegó"
                        : a2.envio_at ? (a2.visto_at ? "lo abrió" : "enviado") : "sin enviar";
                    const color = a2.aprobado_at ? colors.success : a2.observacion ? colors.warning
                      : estado === "no le llegó" ? colors.danger : colors.muted;
                    const cerrado = !!a2.envio_at;
                    return (
                      <div key={a2.id} style={{ display: "grid", gridTemplateColumns: "66px 96px 1fr 1fr 1.2fr 86px 20px", gap: 5, alignItems: "center" }}>
                        {/* QUIÉN APRUEBA Y QUIÉN SOLO SE ENTERA. No es lo
                            mismo: el que aprueba recibe su enlace y la orden
                            no entra al presupuesto hasta que él firma; el
                            otro recibe una copia. Mandarle el botón de
                            aprobar a quien no tiene que aprobar es pedirle
                            que decida algo que no le toca, y alguien lo va a
                            apretar. */}
                        <label title={a2.aprueba ? "Su firma es necesaria" : "Solo recibe copia"}
                          style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, cursor: editable && !cerrado ? "pointer" : "default",
                            color: a2.aprueba ? colors.brand : colors.muted, fontWeight: a2.aprueba ? 700 : 400 }}>
                          <input type="checkbox" checked={a2.aprueba !== false} disabled={!editable || cerrado}
                            onChange={e => hacer(() => guardarAprobador({ id: a2.id, aprueba: e.target.checked }).then(r => r.error || null))} />
                          aprueba
                        </label>
                        <input defaultValue={a2.rol || ""} readOnly={!editable || cerrado} placeholder="Papel"
                          onBlur={e => e.target.value !== (a2.rol || "") && hacer(() => guardarAprobador({ id: a2.id, rol: e.target.value || null }).then(r => r.error || null))}
                          style={{ ...inputStyle, fontSize: 11, padding: "5px 7px" }} />
                        <input defaultValue={a2.nombre || ""} readOnly={!editable || cerrado} placeholder="Nombre"
                          onBlur={e => e.target.value !== (a2.nombre || "") && hacer(() => guardarAprobador({ id: a2.id, nombre: e.target.value || null }).then(r => r.error || null))}
                          style={{ ...inputStyle, fontSize: 11.5, padding: "5px 7px" }} />
                        <input defaultValue={a2.empresa || ""} readOnly={!editable || cerrado} placeholder="Empresa"
                          onBlur={e => e.target.value !== (a2.empresa || "") && hacer(() => guardarAprobador({ id: a2.id, empresa: e.target.value || null }).then(r => r.error || null))}
                          style={{ ...inputStyle, fontSize: 11.5, padding: "5px 7px" }} />
                        <input defaultValue={a2.email || ""} readOnly={!editable || cerrado} placeholder="correo@empresa.com"
                          onBlur={e => e.target.value !== (a2.email || "") && hacer(() => guardarAprobador({ id: a2.id, email: e.target.value }).then(r => r.error || null))}
                          style={{ ...inputStyle, fontSize: 11.5, padding: "5px 7px" }} />
                        <span style={{ fontSize: 10.5, color, fontWeight: 700, textAlign: "right" }}>{estado}</span>
                        {editable && !cerrado ? (
                          <button onClick={() => hacer(() => borrarAprobador(a2.id))} title="Quitarlo de la lista"
                            style={{ background: "none", border: "none", color: colors.border, cursor: "pointer", padding: 0 }}>
                            <Trash2 size={12} />
                          </button>
                        ) : <span />}
                      </div>
                    );
                  })}
                  {(aprobadores[o.id] || []).filter(x => x.observacion).map((x, k) => (
                    <div key={`obs${k}`} style={{ fontSize: 11.5, color: colors.ink, background: colors.warningSoft,
                      border: `1px solid ${colors.warningBorder}`, borderRadius: 6, padding: "5px 8px", lineHeight: 1.45 }}>
                      <strong>{x.nombre || x.email}:</strong> {x.observacion}
                    </div>
                  ))}
                  {editable && (
                    <div style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap", marginTop: 2 }}>
                      <button onClick={() => hacer(() => guardarAprobador({ orden_id: o.id, rol: "", nombre: "", email: "" }).then(r => r.error || null))}
                        style={{ background: "none", border: `1px dashed ${colors.border}`, borderRadius: 7, padding: "4px 9px",
                          color: colors.inkSoft, fontSize: 11.5, cursor: "pointer", fontFamily: colors.font }}>
                        + Agregar quien firma
                      </button>
                      {/* LOS DE SIEMPRE, igual que en el acta. La fiscalización
                          y el cliente son los mismos todo el año: volver a
                          escribir sus correos en cada orden es donde se cuela
                          la letra cambiada que después rebota. */}
                      <button onClick={() => traerLosDeSiempre(o)}
                        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: colors.font,
                          fontSize: 11.5, color: colors.brand, textDecoration: "underline" }}>
                        traer los de siempre
                      </button>
                      <span style={{ fontSize: 10.5, color: colors.muted }}>
                        De esta lista sale el envío. Tildá <strong>aprueba</strong> a los que tienen que firmar:
                        la orden entra al presupuesto cuando firman todos ellos. Los demás reciben copia.
                      </span>
                    </div>
                  )}
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
                            codigo: codigoDe(o), subtotales: sub,
                            // A cuánto asciende el contrato va solo si alguien
                            // lo decidió para ESTA orden.
                            resumenContrato: o.mostrar_contrato ? resumen : null,
                            aprobadores: aprobadores[o.id] || [],
                          });
                          // EL ARCHIVO SE LLAMA COMO LA ORDEN. Quien lo
                          // recibe lo guarda en la carpeta del proyecto, y
                          // "OC-03 - Edificio" no dice de qué era: el título
                          // es lo único que lo distingue de las otras ocho.
                          doc.save(`${nombreDelArchivo(o)}.pdf`);
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
                      {o.visto_pedido_at ? "Aprobación pedida" : "Pedir aprobación al Director"}
                    </Button>
                  )}
                  {puedeEditar && suyas.length > 0 && (
                    <Button variant={o.visto_at || esDirector ? "outline" : "secondary"} size="sm"
                      title={o.visto_at || esDirector ? "" : "Todavía no la aprobó el Director"}
                      onClick={() => {
                        if (!o.visto_at && !esDirector &&
                          !window.confirm("Esta orden todavía no la aprobó el Director.\n\nUna vez que el cliente ve el precio, bajarlo es una negociación y subirlo es imposible. ¿Mandarla igual?")) return;
                        // Se abre con los que tienen que firmar ya marcados.
                        // El resto del cuadro de revisión es la gente del
                        // proyecto: no todos tienen que recibir TODAS las
                        // órdenes, y mandarle quince correos a quien no le
                        // toca es como se consigue que dejen de abrirlos.
                        setMandando({
                          orden: o, cuerpo: "",
                          correos: invitados.filter(i => i.recibe_ordenes).map(i => i.email),
                          aQuien: (aprobadores[o.id] || []).filter(a => a.aprueba !== false && !a.envio_at).map(a => String(a.id)),
                        });
                      }}>
                      <Mail size={12} /> Enviar al cliente
                    </Button>
                  )}
                  {puedeEditar && o.estado !== "aprobada" && suyas.length > 0 && (
                    <Button variant="primary" size="sm" disabled={ocupado}
                      onClick={() => {
                        if (!window.confirm(`¿Aprobar la ${codigoDe(o)}?\n\nSus adiciones entran al control de obra y lo que reduce queda tachado del presupuesto.`)) return;
                        hacer(() => aprobarOrden(o, suyas, currentUser, { aprobada_por: currentUser?.name || "" }));
                      }}>
                      <Check size={12} /> Aprobar
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

                {/* Una orden que baja el contrato es una buena noticia, y el
                    cliente la lee como tal cuando ve la diferencia sola.
                    Puesto el acumulado al lado, la conversación deja de ser
                    sobre este cambio y pasa a ser sobre cuánto lleva gastado
                    —otra discusión, y casi nunca la que uno quería tener. */}
                {puedeEditar && (
                  <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5,
                    color: colors.inkSoft, cursor: "pointer", margin: "8px 0" }}>
                    <input type="checkbox" checked={!!o.mostrar_contrato}
                      onChange={e => hacer(() => guardarOrden(o.id, { mostrar_contrato: e.target.checked }))} />
                    Mostrarle al cliente a cuánto asciende el contrato con esta orden
                  </label>
                )}

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
          escriba. El documento lo arma el servidor con lo que dice la base.
          El fondo no cierra: acá se eligen destinatarios y se escribe el
          cuerpo del correo, y se sale por Cancelar. */}
      {mandando && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(17,24,39,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 16 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: colors.radiusMd, padding: 18, width: "min(460px, 100%)", maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: colors.ink, marginBottom: 3 }}>
              Enviar la {codigoDe(mandando.orden)}
            </div>
            <div style={{ fontSize: 11.5, color: colors.muted, marginBottom: 10, lineHeight: 1.5 }}>
              Va el documento completo: las líneas, la diferencia y el nuevo valor del contrato.
              Marcá <strong>aprueba</strong> a los que tienen que firmarla: cada uno recibe su propio enlace y,
              cuando firman todos, la orden entra sola al presupuesto como adicional.
            </div>

            {/* A QUIÉN DE LA LISTA SE LE MANDA ESTA ORDEN.
                El cuadro de revisión tiene a toda la gente del proyecto —son
                quince— y una orden de cambio no le interesa a los quince.
                Mandársela a todos es como se consigue que dejen de abrirla, y
                la que sí tenían que leer se pierde entre las otras ocho. Se
                elige, y los que firman vienen marcados. */}
            {enElCuadro.length > 0 && (
              <div style={{ marginBottom: 10, background: colors.neutralSoft,
                border: `1px solid ${colors.border}`, borderRadius: 7, padding: "8px 10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.4 }}>
                    A QUIÉN SE LE MANDA ({(mandando.aQuien || []).length} de {enElCuadro.length})
                  </span>
                  <button onClick={() => setMandando(m => ({ ...m,
                    aQuien: (m.aQuien || []).length === enElCuadro.length ? [] : enElCuadro.map(a => String(a.id)) }))}
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: colors.font,
                      fontSize: 11, color: colors.brand, textDecoration: "underline" }}>
                    {(mandando.aQuien || []).length === enElCuadro.length ? "ninguno" : "todos"}
                  </button>
                </div>
                {enElCuadro.map(a => {
                  const va = (mandando.aQuien || []).includes(String(a.id));
                  return (
                    <label key={a.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0",
                      fontSize: 12, color: va ? colors.ink : colors.muted, cursor: "pointer" }}>
                      <input type="checkbox" checked={va}
                        onChange={() => setMandando(m => ({ ...m,
                          aQuien: va ? (m.aQuien || []).filter(x => x !== String(a.id)) : [...(m.aQuien || []), String(a.id)] }))} />
                      <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3,
                        color: a.aprueba === false ? colors.muted : colors.brand }}>
                        {a.aprueba === false ? "COPIA" : "FIRMA"}
                      </span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {a.nombre || a.email}{a.empresa ? ` · ${a.empresa}` : ""}
                        <span style={{ color: colors.muted, fontSize: 11 }}> {a.email}</span>
                      </span>
                    </label>
                  );
                })}
                <div style={{ fontSize: 10.5, color: colors.muted, marginTop: 3 }}>
                  Los marcados FIRMA reciben su propio enlace para aprobar; los demás, una copia.
                </div>
              </div>
            )}

            {invitados.length > 0 && !enElCuadro.length && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.4, marginBottom: 4 }}>GENTE DEL PROYECTO</div>
                {invitados.map(i => {
                  const puesto = mandando.correos.includes(i.email);
                  return (
                    <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "3px 0", fontSize: 12.5, color: colors.ink }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 7, flex: 1, minWidth: 0, cursor: "pointer" }}>
                        <input type="checkbox" checked={puesto}
                          onChange={() => setMandando(m => ({ ...m, correos: puesto ? m.correos.filter(c => c !== i.email) : [...m.correos, i.email] }))} />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {i.nombre}{i.rol ? ` · ${i.rol}` : ""} <span style={{ color: colors.muted, fontSize: 11 }}>{i.email}</span>
                        </span>
                      </label>
                      {/* QUIÉN FIRMA Y QUIÉN SOLO SE ENTERA. No es lo mismo:
                          el que firma recibe su enlace y la orden no se aplica
                          hasta que él aprueba; el otro recibe una copia. */}
                      {puesto && (
                        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11,
                          color: (mandando.firman || []).includes(i.email) ? colors.brand : colors.muted,
                          fontWeight: (mandando.firman || []).includes(i.email) ? 700 : 400, cursor: "pointer", whiteSpace: "nowrap" }}>
                          <input type="checkbox" checked={(mandando.firman || []).includes(i.email)}
                            onChange={e => setMandando(m => ({ ...m,
                              firman: e.target.checked
                                ? [...(m.firman || []), i.email]
                                : (m.firman || []).filter(c => c !== i.email) }))} />
                          aprueba
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* QUIEN FIRMA Y NO ESTÁ EN LA LISTA DEL PROYECTO.
                El cliente, el fiscalizador externo, el gerente del mandante:
                son los que más tienen que firmar y los que nunca están
                cargados. Con nombre y empresa, porque eso es lo que después
                se lee en el documento al lado de su aprobación — "aprobado
                por fulano" sin decir de qué empresa no prueba nada. */}
            <label style={{ fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.4 }}>QUIEN FIRMA Y NO ESTÁ EN LA LISTA</label>
            {(mandando.externos || []).map((x, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.2fr 22px", gap: 5, marginTop: 4 }}>
                <input value={x.nombre} placeholder="Nombre"
                  onChange={e => setMandando(m => ({ ...m, externos: m.externos.map((y, k) => k === i ? { ...y, nombre: e.target.value } : y) }))}
                  style={{ ...inputStyle, padding: "6px 8px", fontSize: 12 }} />
                <input value={x.empresa} placeholder="Empresa o cargo"
                  onChange={e => setMandando(m => ({ ...m, externos: m.externos.map((y, k) => k === i ? { ...y, empresa: e.target.value } : y) }))}
                  style={{ ...inputStyle, padding: "6px 8px", fontSize: 12 }} />
                <input value={x.email} placeholder="correo@empresa.com" type="email"
                  onChange={e => setMandando(m => ({ ...m, externos: m.externos.map((y, k) => k === i ? { ...y, email: e.target.value } : y) }))}
                  style={{ ...inputStyle, padding: "6px 8px", fontSize: 12 }} />
                <button onClick={() => setMandando(m => ({ ...m, externos: m.externos.filter((_, k) => k !== i) }))}
                  style={{ background: "none", border: "none", color: colors.border, cursor: "pointer", padding: 0 }}>
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            <button onClick={() => setMandando(m => ({ ...m, externos: [...(m.externos || []), { nombre: "", empresa: "", email: "" }] }))}
              style={{ background: "none", border: `1px dashed ${colors.border}`, borderRadius: 7, padding: "5px 10px",
                color: colors.inkSoft, fontSize: 11.5, cursor: "pointer", fontFamily: colors.font, marginTop: 5, marginBottom: 8 }}>
              + Agregar a quien firma
            </button>

            <label style={{ fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.4 }}>OTROS CORREOS (solo copia, sin firmar)</label>
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
                  const hayExternos = (mandando.externos || []).some(x => String(x.email || "").includes("@"));
                  // Solo los que se marcaron en esta tanda.
                  const elegidos = new Set((mandando.aQuien || []).map(String));
                  const enCapitulo = enElCuadro.filter(a => elegidos.has(String(a.id)));
                  if (!todos.length && !hayExternos && !enCapitulo.length) { setAviso("Elegí a quién mandársela."); return; }
                  // Los que firman reciben SU enlace; los demás, una copia.
                  const firman = (mandando.firman || []);
                  const deAfuera = (mandando.externos || [])
                    .map(x => ({ nombre: String(x.nombre || "").trim(), email: String(x.email || "").trim().toLowerCase(),
                      rol: String(x.empresa || "").trim() }))
                    .filter(x => /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(x.email));
                  // LOS DEL CAPÍTULO IV FIRMAN SIN QUE HAYA QUE VOLVER A
                  // MARCARLOS. Ahí se llenaron su nombre, su empresa y su
                  // correo justamente para esto; pedir que además se los
                  // tilde acá es la clase de paso que se olvida, y la orden
                  // sale como informativa sin que nadie pueda aprobarla.
                  // Va el `id` para que el servidor use esa fila y no cree
                  // otra: dos filas de la misma persona son dos enlaces y una
                  // orden que nunca termina de estar firmada por todos.
                  const delCapitulo = enCapitulo.filter(a => a.aprueba !== false)
                    .map(a => ({ id: a.id, nombre: a.nombre || "", empresa: a.empresa || "",
                      rol: a.rol || "", email: String(a.email).trim().toLowerCase() }));
                  // Los del cuadro que no aprueban reciben la copia, sin botón.
                  const copiasCapitulo = enCapitulo.filter(a => a.aprueba === false)
                    .map(a => String(a.email).trim().toLowerCase());
                  const porCorreo = new Map();
                  for (const a of [...delCapitulo,
                    ...invitados.filter(i => firman.includes(i.email))
                      .map(i => ({ nombre: i.nombre, email: i.email, rol: i.rol || "" })),
                    ...deAfuera]) {
                    if (!porCorreo.has(a.email)) porCorreo.set(a.email, a);
                  }
                  const quienesFirman = [...porCorreo.values()];
                  const correosQueFirman = new Set(quienesFirman.map(a => a.email));
                  const soloCopia = [...new Set([...todos, ...copiasCapitulo])]
                    .filter(c => !correosQueFirman.has(c));
                  setOcupado(true);
                  const r = await enviarOrden(mandando.orden, soloCopia, mandando.cuerpo, currentUser, quienesFirman);
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
