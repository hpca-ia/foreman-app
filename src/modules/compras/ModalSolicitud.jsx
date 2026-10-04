import { useEffect, useState, useRef, useCallback } from "react";
import { Check, X, Send, ShoppingCart, PackageCheck, Clock, Upload, FileText, Paperclip, Banknote } from "lucide-react";
import { colors } from "../../theme/colors";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import InlineFiles from "../../components/InlineFiles";
import { ESTADOS, crearSolicitud, guardarSolicitud, moverA, historialDe, rubrosDelProyecto,
  adjuntosDe, subirAdjunto, borrarAdjunto, actualizarAdjunto, enlacesDeAdjuntos, elegirProforma, registrarPago,
  moverDeProyecto, facturarCompra, SIN_PROYECTO, leadDe } from "./compras";
import { registrarPago as registrarPagoDeFactura, CLASES_DOC, FORMAS_PAGO } from "../controlObra/pagos";
import PanelBodega from "./PanelBodega";
import VisorAdjuntos from "./VisorAdjuntos";
import { CLASES_PEDIDO, vaABodega } from "./bodega";

// Una solicitud, de punta a punta, en una sola pantalla.
//
// Arriba en qué va —la línea de pasos con sus fechas, que es lo que uno viene
// a mirar cuando vuelve a abrirla—, después lo que se pidió, y abajo el único
// botón que corresponde a quien está mirando: pedir el visto, aprobar o
// devolver, comprar, recibir.
//
// Los papeles se pueden adjuntar desde el primer momento, antes de que la
// solicitud exista: al soltar el primer archivo se guarda sola como borrador.
// Pedir sin proforma y tener que volver después es cómo se pierden las
// cotizaciones.
//
// Devolver pide motivo —es la parte que hace que el flujo sirva—, y cada paso
// queda escrito en el historial de abajo, con nombre y hora.

const fechaCorta = x => x
  ? new Date(x).toLocaleDateString("es-EC", { day: "numeric", month: "short" })
  : null;

/**
 * En qué va la compra, de un vistazo.
 *
 * Pagado va en la fila como los demás pero no es un paso del flujo: se paga
 * antes, durante o después de recibir, y por eso puede estar prendido con los
 * de su derecha apagados sin que nada esté mal.
 */
function LineaDePasos({ s }) {
  const pasos = [
    { id: "pedido",   label: "Pedido",    cuando: s.created_at },
    { id: "enviado",  label: "Enviado",   cuando: s.enviado_at },
    { id: "aprobado", label: "Aprobado",  cuando: s.aprobado_at },
    { id: "comprado", label: "Comprado",  cuando: s.comprado_at },
    { id: "pagado",   label: "Pagado",    cuando: s.pagado_at },
    { id: "recibido", label: "Recibido",  cuando: s.recibido_at },
    // El ingreso a bodega todavía no tiene módulo: aparece el día que haya
    // algo que mostrar, en vez de prometer un paso que nadie puede dar.
    // Bodega solo para material: un servicio no entra a ninguna bodega, y
    // mostrarle el paso a quien pidió una grúa es pedirle que lo complete.
    ...((s.clase || "material") === "material" ? [{ id: "bodega", label: "En bodega", cuando: s.bodega_at }] : []),
  ];
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
      {pasos.map(p => {
        const hecho = !!p.cuando;
        return (
          <div key={p.id} style={{ flex: "1 1 62px", minWidth: 62, textAlign: "center",
            background: hecho ? colors.brandSoft : colors.bg, borderRadius: 7, padding: "5px 4px",
            border: `1px solid ${hecho ? colors.brand : "transparent"}` }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3, color: hecho ? colors.brand : colors.border }}>
              {p.label.toUpperCase()}
            </div>
            <div style={{ fontSize: 10, color: hecho ? colors.inkSoft : colors.border }}>
              {fechaCorta(p.cuando) || "—"}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function ModalSolicitud({ solicitud, proyectos = [], users = [], currentUser, puede, onCerrar, onCambio }) {
  // `viva` es la solicitud que existe en la base. Arranca en null para una
  // nueva y se llena sola en cuanto hay algo que guardar —un archivo, un
  // Guardar—, así los papeles se pueden adjuntar desde el primer momento.
  const [viva, setViva] = useState(solicitud || null);
  const editando = !!viva;
  // Un pedido ya guardado sin proyecto es un gasto de oficina, no un pedido a
  // medio llenar: el selector tiene que decirlo.
  // Y al crear uno nuevo solo se preselecciona si hay un único proyecto: con
  // diez, dejar el primero puesto es exactamente cómo un pedido termina
  // cargado a la obra equivocada.
  const [form, setForm] = useState(solicitud
    ? { ...solicitud, lead_id: solicitud.lead_id ?? SIN_PROYECTO }
    : {
      lead_id: proyectos.length === 1 ? proyectos[0].id : "",
      descripcion: "", justificacion: "", necesita_para: "", urgente: false,
      clase: "material",
      capitulo: "", obra_actividad_id: "", obra_rubro_id: "", monto_estimado: "", destino: "",
    });
  const [historial, setHistorial] = useState([]);
  const [comentario, setComentario] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  // Lo que Johanna completa al concretar: el documento que llegó y cuánto se
  // paga ahora. El documento es lo que descuenta el control; el pago es otra
  // cosa y va a Proveedores.
  const [compra, setCompra] = useState({
    proveedor: solicitud?.proveedor || "", monto: solicitud?.monto || "",
    clase: "factura", numero: "", ruc: "", fecha: new Date().toISOString().slice(0, 10),
    pagaAhora: "", forma: "transferencia",
  });
  const [pago, setPago] = useState({ monto: "" });

  const gestionaCompras = puede("compras.gestionar");
  // Su propio permiso, no prestado de "asignar tareas": el módulo se apoya en
  // que quien pide no compra y quien compra no aprueba.
  const apruebo = puede("compras.aprobar");
  const esMia = !editando || viva.solicitante_id === currentUser.id;
  const estado = viva?.estado || "borrador";
  const e = ESTADOS[estado] || ESTADOS.borrador;

  // Volver a abrir un pedido y corregirlo tiene que poder hacerse: la cantidad
  // cambia, el rubro estaba mal, la fecha se corrió. Quien lo pidió lo edita
  // mientras no se haya comprado —después ya hay plata comprometida contra eso
  // y corregirlo a mano descuadra el control—, y gerencia y compras siempre,
  // que son quienes arreglan lo que llega mal escrito.
  // Quien lo pidió corrige lo suyo —la cantidad, el monto estimado, para
  // cuándo— hasta que llega: equivocarse en "200 sacos" y no poder arreglarlo
  // termina en un pedido anulado y otro escrito de nuevo. Después de recibido
  // ya es historia y se congela. Gerencia y compras corrigen siempre, que son
  // quienes arreglan lo que llega mal escrito.
  const congelada = estado === "recibida" || estado === "anulada";

  // Dos permisos, no uno, porque son dos cosas distintas.
  //
  // QUÉ SE PIDIÓ —la descripción, para qué, para cuándo, si es urgente— es del
  // que lo pidió y de nadie más. Si el gerente puede reescribirlo, aprueba algo
  // que ya no es lo que le mandaron y el residente se entera cuando llega otra
  // cosa. Si está mal escrito se devuelve con el motivo, que para eso está.
  //
  // CONTRA QUÉ VA —la agrupación, el rubro, cuánto se estima— es plata del
  // control, y ahí el que aprueba manda: el residente apunta como puede y
  // quien mira el presupuesto entero corrige sin devolver el pedido.
  const puedeEditarPedido = esMia && !congelada;
  // La pantalla del que da el visto es otra pantalla.
  //
  // Lo que hace ahí es leer, mirar los papeles, corregir contra qué va, y
  // decidir: aprobar o devolver. Nada más. Mostrarle además el formulario
  // entero —la descripción editable, subir cotizaciones, la fecha, bodega— le
  // hace buscar sus tres botones entre quince campos que no va a tocar, y la
  // decisión que vino a tomar queda escondida en el medio.
  // Si el pedido no es tuyo, no ves su formulario: ves lo que se pidió.
  //
  // Vale en cualquier paso, no solo mientras espera el visto. Un pedido
  // devuelto, uno ya aprobado, uno comprado: en todos, lo que se pidió es de
  // quien lo pidió. Al que mira le sirve leerlo de un vistazo, y quince campos
  // grises son más difíciles de leer que cuatro líneas.
  const soloMiro = editando && !esMia;
  // La pantalla de decisión: además, los dos botones y nada más.
  const modoVisto = soloMiro && estado === "pendiente_aprobacion" && apruebo;
  // Los papeles los sube quien pide y quien compra. El que da el visto mira.
  const puedeSubirPapeles = esMia || gestionaCompras;
  const puedeEditarImputacion = (esMia && !congelada) || apruebo || gestionaCompras;
  const puedeEditar = puedeEditarPedido || puedeEditarImputacion;
  // Mover el pedido de proyecto es otra cosa, y solo gerencia o compras: si lo
  // pudiera mover quien lo pidió, el pedido se iría de su vista y de la de su
  // gerente sin que ninguno de los dos se entere.
  const puedeMover = !editando || apruebo || gestionaCompras;

  useEffect(() => { if (viva?.id) historialDe(viva.id).then(setHistorial); }, [viva?.id]);

  const inp = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Los papeles de la solicitud: proformas para comparar, anexos para explicar.
  const [proformas, setProformas] = useState([]);
  const [enlaces, setEnlaces] = useState({});
  const [subiendo, setSubiendo] = useState(false);
  const [avisoPapel, setAvisoPapel] = useState("");
  const [verAnexos, setVerAnexos] = useState(!!solicitud);
  const proformaRef = useRef(null);

  const cargarPapeles = useCallback(async () => {
    if (!viva?.id) return;
    const todos = await adjuntosDe(viva.id);
    const cotizaciones = todos.filter(a => a.tipo === "cotizacion");
    setProformas(cotizaciones);
    setEnlaces(await enlacesDeAdjuntos(cotizaciones));
  }, [viva?.id]);
  useEffect(() => { cargarPapeles(); }, [cargarPapeles]);

  // Los rubros de la obra de este proyecto: contra qué se está pidiendo.
  const [obra, setObra] = useState(null);
  const [rubros, setRubros] = useState([]);
  const [actividades, setActividades] = useState([]);
  useEffect(() => {
    let vivo = true;
    const lead = leadDe(form.lead_id);
    if (!lead) { setObra(null); setRubros([]); setActividades([]); return; }
    rubrosDelProyecto(lead).then(r => {
      if (!vivo) return;
      setObra(r.obra); setRubros(r.rubros); setActividades(r.actividades || []);
    });
    return () => { vivo = false; };
  }, [form.lead_id]);
  // Contra qué se pide: la agrupación, que es cómo se ejecuta la obra. El
  // capítulo —cómo se contrató— sale solo del rubro, cuando se elige uno.
  const deLaAgrupacion = rubros.filter(r => String(r.actividad_id || "") === String(form.obra_actividad_id || ""));
  // Contra qué va este pedido, en palabras. El capítulo aparece solo en los
  // pedidos viejos, de cuando se apuntaba así; se muestra igual para no dejar
  // en blanco algo que sí estaba decidido.
  const imputado = (() => {
    const act = actividades.find(a => String(a.id) === String(form.obra_actividad_id || ""));
    const rub = rubros.find(r => String(r.id) === String(form.obra_rubro_id || ""));
    const partes = [];
    if (act) partes.push(act.codigo ? `${act.codigo} · ${act.nombre}` : act.nombre);
    if (rub) partes.push(`rubro ${rub.numero}, ${rub.descripcion}`);
    if (!partes.length && form.capitulo) partes.push(`el capítulo ${form.capitulo}`);
    return partes.join(" — ");
  })();

  /**
   * La solicitud existe en la base, cueste lo que cueste.
   *
   * Adjuntar un archivo necesita un id del que colgarlo. En vez de pedirle a
   * quien pide que guarde primero y vuelva —que es cuando la proforma se queda
   * en el teléfono—, el primer archivo guarda el borrador solo.
   */
  async function asegurarSolicitud() {
    if (viva) return viva;
    if (!form.lead_id) { setAvisoPapel("Elegí el proyecto —o gasto de oficina— antes de adjuntar."); return null; }
    if (!form.descripcion?.trim()) { setAvisoPapel("Escribí qué hace falta antes de adjuntar."); return null; }
    const r = await crearSolicitud(form, currentUser);
    if (r.error) { setAvisoPapel(r.error); return null; }
    setViva(r.solicitud);
    setAvisoPapel("");
    onCambio?.();
    return r.solicitud;
  }

  // Mover de proyecto se guarda en el acto —no espera un Guardar— porque lo
  // que se corrige acá es un error que ya está molestando en el control de la
  // obra equivocada.
  async function cambiarProyecto(valor) {
    if (!valor || valor === String(form.lead_id)) return;
    const lead = leadDe(valor);
    setOcupado(true); setError("");
    const err = await moverDeProyecto(viva, valor, currentUser,
      lead ? proyectos.find(p => p.id === lead)?.nombre : "gasto de oficina");
    setOcupado(false);
    if (err) { setError(err); return; }
    setForm(f => ({ ...f, lead_id: valor, capitulo: "", obra_rubro_id: "" }));
    setViva(v => ({ ...v, lead_id: lead, capitulo: null, obra_rubro_id: null }));
    historialDe(viva.id).then(setHistorial);
    onCambio?.();
  }

  async function hacer(fn) {
    setOcupado(true); setError("");
    try {
      const r = await fn();
      if (r?.error) { setError(r.error); return; }
      onCambio?.();
      if (r?.cerrar !== false) onCerrar();
    } catch (ex) { setError(ex.message); } finally { setOcupado(false); }
  }

  // Quién es el gerente del proyecto: a quien le toca dar el visto. Sin uno
  // marcado, va al Director, que es quien siempre puede.
  const gerenteDelProyecto = () => {
    const owner = users.find(u => u.role === "owner");
    return users.find(u => u.role === "gerente")?.id || owner?.id || null;
  };
  const personaDeCompras = () => users.find(u => u.role === "assistant")?.id || gerenteDelProyecto();

  const guardarYMandar = () => hacer(async () => {
    if (!form.lead_id) return { error: "Elegí el proyecto, o marcá que es un gasto de oficina." };
    if (!form.descripcion?.trim()) return { error: "Escribe qué hace falta." };
    let s = viva;
    if (!s) {
      const r = await crearSolicitud(form, currentUser);
      if (r.error) return r;
      s = r.solicitud;
    } else {
      const err = await guardarSolicitud(s.id, form);
      if (err) return { error: err };
      s = { ...s, ...form };
    }
    const quien = gerenteDelProyecto();
    if (!quien) return { error: "No hay a quién pedirle el visto: falta un gerente o el Director en el equipo." };
    return moverA(s, "pendiente_aprobacion", {
      quien: currentUser, comentario: comentario || null, paraQuien: quien,
      titulo: `Aprobar compra: ${s.descripcion}`,
    });
  });

  const soloGuardar = () => hacer(async () => {
    if (!form.lead_id) return { error: "Elegí el proyecto, o marcá que es un gasto de oficina." };
    if (!form.descripcion?.trim()) return { error: "Escribe qué hace falta." };
    if (!viva) {
      const r = await crearSolicitud(form, currentUser);
      return r.error ? r : {};
    }
    const err = await guardarSolicitud(viva.id, form);
    return err ? { error: err } : {};
  });

  // Aprobar guarda primero lo que haya corregido de la asignación: no hay un
  // "Guardar" en esta pantalla, y perder ese cambio al aprobar sería peor que
  // no haberlo dejado tocar.
  const aprobar = () => hacer(async () => {
    const err = await guardarSolicitud(viva.id, form);
    if (err) return { error: err };
    return moverA(viva, "aprobada", {
      quien: currentUser, comentario: comentario || null, paraQuien: personaDeCompras(),
      titulo: `Comprar: ${viva.descripcion}`,
    });
  });

  const devolver = () => hacer(async () => {
    if (!comentario.trim()) return { error: "Para devolverla hay que decir qué falta." };
    return moverA(viva, "requiere_info", {
      quien: currentUser, comentario: comentario.trim(), paraQuien: viva.solicitante_id,
      titulo: `Completar la solicitud: ${viva.descripcion}`,
    });
  });

  /**
   * Compras devuelve el pedido, con la pregunta escrita.
   *
   * Johanna recibe la compra aprobada y a veces no se puede ejecutar: la
   * proforma venció, el proveedor subió el precio, falta la medida exacta. Sin
   * esto lo resolvía por WhatsApp y el pedido quedaba quieto en "aprobada"
   * sin que nadie supiera por qué.
   *
   * Dos destinos porque son dos preguntas distintas. Si falta información de
   * lo que se pidió, vuelve a quien lo pidió. Si cambió la plata —aprobaron
   * 500 y ahora son 800—, vuelve a quien dio el visto: ese número ya no es el
   * que aprobó, y hacerlo pasar por el residente no arregla eso.
   */
  const devolverCompras = destino => hacer(async () => {
    if (!comentario.trim()) return { error: "Escribí qué hace falta saber." };
    const aQuienPidio = destino === "pide";
    return moverA(viva, aQuienPidio ? "requiere_info" : "pendiente_aprobacion", {
      quien: currentUser, comentario: comentario.trim(),
      paraQuien: aQuienPidio ? viva.solicitante_id : (viva.aprobador_id || gerenteDelProyecto()),
      titulo: aQuienPidio
        ? `Compras pregunta: ${viva.descripcion}`
        : `Revisar el visto: ${viva.descripcion}`,
    });
  });

  const marcarComprada = () => hacer(async () => {
    if (!compra.proveedor.trim()) return { error: "¿A quién se le compró?" };
    const total = Number(compra.monto) || 0;
    if (!(total > 0)) return { error: "¿Por cuánto es el documento?" };

    const r = await moverA(viva, "comprada", {
      quien: currentUser, comentario: comentario || null, paraQuien: viva.solicitante_id,
      titulo: `Recibir: ${viva.descripcion}`,
      extra: { proveedor: compra.proveedor.trim(), monto: total },
    });
    if (r?.error) return r;

    // Acá la plata deja de estar hablada: el documento entra al control y
    // descuenta el rubro. Antes había que acordarse de ir a cargarlo a mano.
    const con = { ...viva, proveedor: compra.proveedor.trim() };
    const f = await facturarCompra(con, { ...compra, total }, currentUser);
    if (f.error) return { error: "La compra quedó marcada, pero el documento no entró al control: " + f.error };

    const paga = Number(compra.pagaAhora) || 0;
    if (paga > 0) {
      await registrarPagoDeFactura(f.factura, { monto: paga, fecha: compra.fecha, forma: compra.forma }, currentUser);
    }
    return {};
  });

  const marcarRecibida = () => hacer(() => moverA(viva, "recibida", {
    quien: currentUser, comentario: comentario || null, paraQuien: null, titulo: null,
  }));

  const marcarPagada = () => hacer(async () => {
    const err = await registrarPago(viva, { monto: pago.monto, quien: currentUser, comentario });
    if (err) return { error: err };
    setViva(v => ({ ...v, pagado_at: new Date().toISOString(), pagado_nombre: currentUser.name,
      pagado_monto: Number(pago.monto) || v.monto || null }));
    historialDe(viva.id).then(setHistorial);
    return { cerrar: false };
  });

  const lbl = { fontSize: 10.5, color: colors.muted, fontWeight: 600, display: "block", marginBottom: 3 };
  const mini = { ...inputStyle, padding: "8px 10px", fontSize: 12.5 };

  return (
    <Modal onClose={onCerrar} maxWidth={560}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: colors.ink, flex: 1, minWidth: 140 }}>
          {editando ? "Solicitud de compra" : "Pedir algo para la obra"}
        </div>
        {editando && (
          <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, color: "#fff", background: e.color }}>
            {e.label}
          </span>
        )}
      </div>

      {editando && <LineaDePasos s={viva} />}

      <div style={{ display: "grid", gap: 10 }}>
        {soloMiro && (
          <div style={{ background: colors.bg, borderRadius: colors.radiusMd, padding: "11px 12px", display: "grid", gap: 7 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: colors.ink, lineHeight: 1.35 }}>
              {viva.urgente && <span style={{ color: colors.danger, fontSize: 10, fontWeight: 700, marginRight: 6 }}>URGENTE</span>}
              {viva.descripcion}
            </div>
            {viva.justificacion && (
              <div style={{ fontSize: 12.5, color: colors.inkSoft, lineHeight: 1.5 }}>{viva.justificacion}</div>
            )}
            <div style={{ fontSize: 11, color: colors.muted, lineHeight: 1.6 }}>
              {viva.solicitante_nombre || "—"} · {proyectos.find(p => p.id === viva.lead_id)?.nombre || "sin proyecto"}
              {viva.necesita_para ? ` · para el ${viva.necesita_para}` : ""}
              {` · ${(viva.clase || "material") === "servicio" ? "servicio" : "material"}`}
              {viva.monto_estimado ? ` · estiman $${Number(viva.monto_estimado).toFixed(2)}` : ""}
            </div>
          </div>
        )}

        {!soloMiro && (
        <div>
          <label style={lbl}>PROYECTO</label>
          <select value={form.lead_id ?? ""} disabled={!puedeMover} style={mini}
            onChange={ev => (editando ? cambiarProyecto(ev.target.value) : inp("lead_id", ev.target.value))}>
            <option value="">Elegí el proyecto…</option>
            {proyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            {/* Lo que no es de ninguna obra: papel, el mantenimiento de la
                camioneta, una herramienta del taller. Sigue el mismo camino
                —lo aprueba quien aprueba— y no le ensucia un rubro a nadie. */}
            <option value={SIN_PROYECTO}>— Sin proyecto · gasto de oficina</option>
          </select>
          {editando && puedeMover && (
            <div style={{ fontSize: 10, color: colors.muted, marginTop: 3 }}>
              Cambiarlo mueve el pedido de obra y borra el capítulo: hay que elegirlo de nuevo.
            </div>
          )}
        </div>
        )}

        {!soloMiro && (<div>
          <label style={lbl}>QUÉ HACE FALTA</label>
          <input value={form.descripcion || ""} onChange={ev => inp("descripcion", ev.target.value)}
            placeholder="Ej: 200 sacos de cemento, o contratar el vidriado" style={mini}
            disabled={!puedeEditarPedido} />
        </div>)}

        {!soloMiro && (<div>
          <label style={lbl}>PARA QUÉ</label>
          <textarea value={form.justificacion || ""} onChange={ev => inp("justificacion", ev.target.value)} rows={2}
            placeholder="En qué se va a usar y por qué ahora" style={{ ...mini, resize: "vertical" }}
            disabled={!puedeEditarPedido} />
        </div>)}

        {/* Sin obra no hay rubro contra el cual apuntarlo, así que se dice en
            palabras en qué se carga. Texto libre: las categorías de la oficina
            las va a descubrir el uso. */}
        {form.lead_id === SIN_PROYECTO && (
          <div>
            <label style={lbl}>A QUÉ SE CARGA</label>
            <input value={form.destino || ""} onChange={ev => inp("destino", ev.target.value)}
              placeholder="Ej: oficina · papelería, o camioneta · mantenimiento" style={mini}
              disabled={!puedeEditarImputacion} />
          </div>
        )}

        {/* Contra qué parte del presupuesto. Una solicitud sin capítulo es un
            pedido suelto: no se puede saber cuánto más quieren gastar de algo
            que ya va por la mitad. Apuntar acá no gasta nada todavía —queda
            como comprometido— y al comprarse, la factura hace el gasto. */}
        {obra && (
          <div style={{ display: "grid", gap: 8, background: colors.bg, borderRadius: 8, padding: "9px 10px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.4 }}>
              CONTRA QUÉ DEL PRESUPUESTO
            </div>
            {/* Dicho en una línea, antes de los selectores. Quien aprueba
                necesita leer contra qué va sin deducirlo de dos desplegables, y
                un pedido sin asignar tiene que gritarlo: esa plata no descuenta
                de ningún lado y el control queda corto sin que nadie lo note. */}
            <div style={{ fontSize: 11.5, lineHeight: 1.5, color: imputado ? colors.ink : colors.warning,
              background: imputado ? "transparent" : colors.warningSoft, borderRadius: 6,
              padding: imputado ? 0 : "6px 8px" }}>
              {imputado
                ? <>Va contra <strong>{imputado}</strong>.</>
                : <>Sin asignar todavía: así, esta compra no va a descontar de ningún capítulo. Elegile la agrupación.</>}
            </div>
            <div>
              <label style={lbl}>AGRUPACIÓN</label>
              {/* Se pide contra la agrupación y no contra el capítulo: el que
                  pide piensa "esto es de instalaciones", no en cuál de los
                  capítulos del contrato cae eso. Esa traducción la hacía a ojo
                  y de ahí salían los pedidos cargados al capítulo equivocado.
                  El capítulo lo pone el rubro, si se elige uno. */}
              {!actividades.length && (
                <div style={{ fontSize: 11, color: colors.warning, marginBottom: 4 }}>
                  Esta obra todavía no tiene agrupaciones. Se arman en Control de Obra → Agrupaciones;
                  mientras tanto el pedido sigue su camino sin apuntar a ninguna.
                </div>
              )}
              <select value={form.obra_actividad_id || ""} disabled={!puedeEditarImputacion || !actividades.length}
                onChange={ev => setForm(p => ({ ...p, obra_actividad_id: ev.target.value, obra_rubro_id: "", capitulo: "" }))} style={mini}>
                <option value="">Elegí la agrupación…</option>
                {actividades.map(a => <option key={a.id} value={a.id}>{a.codigo ? `${a.codigo} · ` : ""}{a.nombre}</option>)}
              </select>
            </div>
            {form.obra_actividad_id && deLaAgrupacion.length > 0 && (
              <div>
                <label style={lbl}>RUBRO (SI SE SABE CUÁL)</label>
                <select value={form.obra_rubro_id || ""} disabled={!puedeEditarImputacion}
                  onChange={ev => setForm(p => ({ ...p, obra_rubro_id: ev.target.value,
                    capitulo: deLaAgrupacion.find(r => String(r.id) === ev.target.value)?.capitulo || "" }))} style={mini}>
                  <option value="">Toda la agrupación</option>
                  {deLaAgrupacion.map(r => <option key={r.id} value={r.id}>{r.numero}. {r.descripcion}</option>)}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Fuera del bloque de la obra a propósito: un gasto de oficina, o un
            pedido de un proyecto que todavía no tiene obra activa, también se
            estima y también se aprueba. Adentro, quien aprobaba se quedaba sin
            saber de cuánta plata estaban hablando. */}
        <div>
          <label style={lbl}>CUÁNTO SE ESTIMA (US$)</label>
          <input type="number" step="0.01" min="0" value={form.monto_estimado ?? ""} disabled={!puedeEditarImputacion}
            onChange={ev => inp("monto_estimado", ev.target.value)} placeholder="Lo que se cree que va a costar" style={mini} />
          {obra && (
            <div style={{ fontSize: 10, color: colors.muted, marginTop: 3, lineHeight: 1.5 }}>
              Es una estimación, no un gasto: queda como <strong>comprometido</strong> contra esa agrupación hasta que
              se compre. La plata se descuenta de verdad cuando entra la factura.
            </div>
          )}
        </div>

        {!soloMiro && (<div>
          <label style={lbl}>QUÉ CLASE DE PEDIDO ES</label>
          {/* Decide si el pedido pasa por bodega. Un servicio no entra a
              ninguna bodega, y pedirle a alguien que "reciba" el alquiler de
              una grúa es enseñarle a apretar un botón sin mirar. */}
          <div style={{ display: "flex", gap: 6 }}>
            {CLASES_PEDIDO.map(c => {
              const puesta = (form.clase || "material") === c.id;
              return (
                <button key={c.id} onClick={() => puedeEditarPedido && inp("clase", c.id)} title={c.nota}
                  style={{ flex: 1, border: `1px solid ${puesta ? colors.brand : colors.border}`, borderRadius: 8,
                    background: puesta ? colors.brandSoft : "#fff", color: puesta ? colors.brand : colors.inkSoft,
                    padding: "7px 10px", fontSize: 12, fontWeight: puesta ? 700 : 400, fontFamily: colors.font,
                    cursor: puedeEditarPedido ? "pointer" : "default", textAlign: "left" }}>
                  {c.label}
                  <div style={{ fontSize: 9.5, fontWeight: 400, opacity: 0.8 }}>{c.nota}</div>
                </button>
              );
            })}
          </div>
        </div>)}

        {!soloMiro && (<div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "end" }}>
          <div>
            <label style={lbl}>SE NECESITA PARA</label>
            <input type="date" value={form.necesita_para || ""} onChange={ev => inp("necesita_para", ev.target.value)}
              style={mini} disabled={!puedeEditarPedido} />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: colors.inkSoft, cursor: "pointer", paddingBottom: 9 }}>
            <input type="checkbox" checked={!!form.urgente} onChange={ev => inp("urgente", ev.target.checked)}
              disabled={!puedeEditarPedido} /> Urgente
          </label>
        </div>)}

        {/* Las proformas: lo que hace que aprobar deje de ser adivinar.
            Cuando de verdad se cotiza, se cotiza con tres proveedores, y quien
            aprueba tiene que poder verlas al lado y elegir una. Esa elección
            queda escrita: seis meses después contesta por qué se le compró a
            ese y no al más barato.

            Se adjunta desde el primer momento, antes de mandarla a aprobar:
            el que pide suele tener la cotización en la mano justo entonces. */}
        <div>
          {/* Los papeles primero y a la vista: quien abre este pedido viene a
              comparar cotizaciones, no a buscarlas. */}
          {editando && (
            <div style={{ marginBottom: 12 }}>
              <VisorAdjuntos solicitudId={viva.id} proformas={proformas} />
            </div>
          )}

          <label style={lbl}>
            {soloMiro ? "COTIZACIONES" : "PROFORMAS"}
            {proformas.length ? ` · ${proformas.length}` : ""}
          </label>
          {proformas.map(a => {
            const elegida = viva?.proforma_id === a.id;
            return (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 9px", marginBottom: 4,
                background: elegida ? colors.brandSoft : colors.bg, borderRadius: 8,
                border: `1px solid ${elegida ? colors.brand : "transparent"}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Se etiqueta acá, con la cotización ya subida y a la vista:
                      es cuando uno sabe de quién es y cuánto cobra. */}
                  {puedeEditar ? (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 92px", gap: 5 }}>
                      <input defaultValue={a.proveedor || ""} placeholder="¿De qué proveedor?"
                        onBlur={async ev => { await actualizarAdjunto(a.id, { proveedor: ev.target.value, monto: a.monto }); cargarPapeles(); }}
                        style={{ ...mini, padding: "5px 7px", fontSize: 12 }} />
                      <input defaultValue={a.monto ?? ""} type="number" step="0.01" placeholder="Monto"
                        onBlur={async ev => { await actualizarAdjunto(a.id, { proveedor: a.proveedor, monto: ev.target.value }); cargarPapeles(); }}
                        style={{ ...mini, padding: "5px 7px", fontSize: 12 }} />
                    </div>
                  ) : (
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: colors.ink, overflowWrap: "anywhere" }}>
                      {a.proveedor || a.nombre}{a.monto ? ` · $${Number(a.monto).toFixed(2)}` : ""}
                    </div>
                  )}
                  <div style={{ fontSize: 10.5, color: colors.muted, marginTop: 2, overflowWrap: "anywhere" }}>
                    {elegida && <span style={{ fontWeight: 700, color: colors.brand }}>ELEGIDA · </span>}
                    {a.nombre}
                  </div>
                </div>
                {enlaces[a.id] && (
                  <a href={enlaces[a.id]} target="_blank" rel="noreferrer" title="Abrir la proforma"
                    style={{ color: colors.inkSoft, display: "flex" }}><FileText size={14} /></a>
                )}
                {apruebo && !elegida && (
                  <button onClick={async () => { await elegirProforma(viva, a, currentUser, comentario); await cargarPapeles(); onCambio?.(); }}
                    style={{ border: `1px solid ${colors.brand}`, background: "#fff", color: colors.brand, borderRadius: 12,
                      padding: "3px 10px", fontSize: 10.5, fontWeight: 600, cursor: "pointer", fontFamily: colors.font, whiteSpace: "nowrap" }}>
                    Comprar con esta
                  </button>
                )}
                {esMia && (
                  <button onClick={async () => { if (window.confirm("¿Quitar esta proforma?")) { await borrarAdjunto(a); await cargarPapeles(); } }}
                    style={{ background: "none", border: "none", color: colors.border, cursor: "pointer", display: "flex", padding: 0 }}>
                    <X size={13} />
                  </button>
                )}
              </div>
            );
          })}

          {/* Primero el archivo, el nombre después. Antes había que escribir el
              proveedor ANTES de poder subir, y como al terminar los campos se
              vaciaban el botón volvía a quedar gris: se leía como que no dejaba
              subir una segunda cotización. Ahora se suben las tres seguidas y se
              les pone nombre y precio en su fila. */}
          {puedeSubirPapeles && (<button onClick={() => proformaRef.current?.click()} disabled={subiendo}
            style={{ width: "100%", marginTop: proformas.length ? 6 : 0, background: colors.bg,
              border: `1px dashed ${colors.border}`, borderRadius: 8, padding: "9px", color: colors.inkSoft,
              fontSize: 12, cursor: "pointer", fontFamily: colors.font,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Upload size={13} /> {subiendo ? "Subiendo…" : proformas.length ? "Subir otra cotización" : "Subir una cotización"}
          </button>)}
          <input ref={proformaRef} type="file" style={{ display: "none" }}
            onChange={async ev => {
              const archivo = ev.target.files?.[0]; ev.target.value = "";
              if (!archivo) return;
              setSubiendo(true);
              const s = await asegurarSolicitud();
              if (!s) { setSubiendo(false); return; }
              // Sin proveedor escrito queda el nombre del archivo, que casi
              // siempre lo dice, y se corrige en la fila.
              const r = await subirAdjunto(s, archivo, { tipo: "cotizacion", quien: currentUser,
                proveedor: archivo.name.replace(/\.[^.]+$/, "").slice(0, 60) });
              setSubiendo(false);
              if (r.error) { setAvisoPapel(r.error); return; }
              await cargarPapeles();
            }} />
          {avisoPapel && <div style={{ fontSize: 11, color: colors.danger, marginTop: 4 }}>{avisoPapel}</div>}

          {puedeSubirPapeles && <label style={{ ...lbl, marginTop: 12, display: "block" }}>ANEXOS · el plano, la foto, la especificación</label>}
          {!puedeSubirPapeles ? null : verAnexos && viva ? (
            <InlineFiles taskId={`compra-${viva.id}`} />
          ) : (
            <button onClick={async () => { const s = await asegurarSolicitud(); if (s) setVerAnexos(true); }}
              style={{ width: "100%", background: colors.bg, border: `1px dashed ${colors.border}`, borderRadius: 8,
                padding: "9px", color: colors.inkSoft, fontSize: 12, cursor: "pointer", fontFamily: colors.font,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <Paperclip size={13} /> Adjuntar respaldos
            </button>
          )}
        </div>

        {/* Lo que compras necesita completar cuando concreta. */}
        {editando && estado === "aprobada" && gestionaCompras && (
          <div style={{ background: colors.bg, borderRadius: colors.radiusMd, padding: 10, display: "grid", gap: 8 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: colors.ink }}>La compra</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 8 }}>
              <input value={compra.proveedor} onChange={ev => setCompra(c => ({ ...c, proveedor: ev.target.value }))}
                placeholder="¿A quién se le compró?" style={mini} />
              <input value={compra.ruc} onChange={ev => setCompra(c => ({ ...c, ruc: ev.target.value }))}
                placeholder="RUC" style={mini} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "110px 1fr 130px 120px", gap: 8 }}>
              <select value={compra.clase} onChange={ev => setCompra(c => ({ ...c, clase: ev.target.value }))} style={mini}>
                {Object.entries(CLASES_DOC).map(([id, x]) => <option key={id} value={id}>{x.label}</option>)}
              </select>
              <input value={compra.numero} onChange={ev => setCompra(c => ({ ...c, numero: ev.target.value }))}
                placeholder="N° del documento" style={mini} />
              <input type="date" value={compra.fecha} onChange={ev => setCompra(c => ({ ...c, fecha: ev.target.value }))} style={mini} />
              <input type="number" step="0.01" value={compra.monto} onChange={ev => setCompra(c => ({ ...c, monto: ev.target.value }))}
                placeholder="Total" style={mini} />
            </div>

            {/* El total descuenta el rubro; lo que se paga ahora es otra cosa.
                Una factura con 40% de anticipo ya se debe entera —el material
                está en obra y el rubro se consumió—; lo que falta pagar es un
                problema de caja y vive en Proveedores. */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: 8, alignItems: "end" }}>
              <div>
                <label style={lbl}>CUÁNTO SE PAGA AHORA</label>
                <input type="number" step="0.01" value={compra.pagaAhora}
                  onChange={ev => setCompra(c => ({ ...c, pagaAhora: ev.target.value }))}
                  placeholder={compra.monto ? `Anticipo, o ${Number(compra.monto).toFixed(2)} si va completo` : "Anticipo o total"} style={mini} />
              </div>
              <select value={compra.forma} onChange={ev => setCompra(c => ({ ...c, forma: ev.target.value }))} style={mini}>
                {FORMAS_PAGO.map(x => <option key={x} value={x}>{x}</option>)}
              </select>
            </div>
            <div style={{ fontSize: 10.5, color: colors.muted, lineHeight: 1.5 }}>
              Al guardar, el <strong>total</strong> entra al control de obra contra
              {viva.obra_rubro_id ? " su rubro" : viva.obra_actividad_id ? " su agrupación" : " la obra (falta elegirle la agrupación)"} y
              deja de contar como comprometido. Lo que quede sin pagar aparece en Proveedores.
            </div>
          </div>
        )}

        {/* El pago. No mueve el estado: se paga por adelantado, contra entrega
            o a treinta días, y en los tres casos la compra sigue su camino. */}
        {editando && (gestionaCompras || apruebo) && estado !== "borrador" && estado !== "pendiente_aprobacion" && (
          viva.pagado_at ? (
            <div style={{ fontSize: 11.5, color: colors.success, background: colors.bg, borderRadius: 8, padding: "8px 10px" }}>
              Pagado el {new Date(viva.pagado_at).toLocaleDateString("es-EC", { day: "numeric", month: "long" })}
              {viva.pagado_monto ? ` · $${Number(viva.pagado_monto).toFixed(2)}` : ""}
              {viva.pagado_nombre ? ` · ${viva.pagado_nombre}` : ""}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}>
              <input type="number" step="0.01" value={pago.monto} onChange={ev => setPago({ monto: ev.target.value })}
                placeholder={viva.monto ? `Cuánto se pagó (por defecto $${Number(viva.monto).toFixed(2)})` : "Cuánto se pagó"} style={mini} />
              <Button variant="outline" onClick={marcarPagada} disabled={ocupado}><Banknote size={13} /> Se pagó</Button>
            </div>
          )
        )}

        {/* Bodega: desde que se compró hasta que se recibe. Es el único
            momento en que alguien tiene el material delante. */}
        {editando && vaABodega(viva) && (estado === "comprada" || estado === "recibida") && (
          <div>
            <label style={lbl}>INGRESO A BODEGA</label>
            <PanelBodega solicitud={viva} rubros={rubros} currentUser={currentUser}
              onCambio={async () => { setViva(v => ({ ...v, bodega_at: new Date().toISOString() })); onCambio?.(); }} />
          </div>
        )}

        {/* Un comentario acompaña cada paso; al devolver, es obligatorio. */}
        {editando && estado !== "recibida" && (
          <div>
            <label style={lbl}>COMENTARIO</label>
            <textarea value={comentario} onChange={ev => setComentario(ev.target.value)} rows={2}
              placeholder={estado === "pendiente_aprobacion" ? "Si la devolvés, decí qué falta"
                : estado === "aprobada" && gestionaCompras ? "Para devolverla, escribí acá la consulta"
                : "Opcional"}
              style={{ ...mini, resize: "vertical" }} />
          </div>
        )}
      </div>

      {error && <div style={{ color: colors.danger, fontSize: 12, marginTop: 10 }}>{error}</div>}

      {/* Solo el botón que le toca a quien está mirando. */}
      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        {(!editando || estado === "borrador" || estado === "requiere_info") && esMia && (
          <Button variant="primary" onClick={guardarYMandar} disabled={ocupado}>
            <Send size={13} /> {estado === "requiere_info" ? "Reenviar" : "Pedir el visto"}
          </Button>
        )}

        {/* Guardar sin mandar, en cualquier paso donde se pueda corregir: así
            volver a abrir un pedido para arreglar la cantidad o el rubro no
            obliga a hacerlo pasar otra vez por la aprobación. */}
        {puedeEditar && !modoVisto && <Button variant="outline" onClick={soloGuardar} disabled={ocupado}>Guardar</Button>}

        {/* Nadie da el visto a su propio pedido, ni con el permiso puesto: eso
            lo sube un escalón, al Director. Pedir y aprobar en el mismo clic
            vacía de sentido al paso de la aprobación. */}
        {editando && estado === "pendiente_aprobacion" && apruebo && (!esMia || currentUser?.role === "owner") && (
          <>
            <Button variant="primary" onClick={aprobar} disabled={ocupado}><Check size={13} /> Aprobar</Button>
            <Button variant="outline" onClick={devolver} disabled={ocupado}><X size={13} /> Devolver</Button>
          </>
        )}
        {editando && estado === "pendiente_aprobacion" && apruebo && esMia && currentUser?.role !== "owner" && (
          <span style={{ fontSize: 11.5, color: colors.muted, alignSelf: "center" }}>
            Lo pediste vos: el visto lo da el Director.
          </span>
        )}

        {editando && estado === "aprobada" && gestionaCompras && (
          <>
            <Button variant="primary" onClick={marcarComprada} disabled={ocupado}><ShoppingCart size={13} /> Ya la compré</Button>
            {/* Compras también puede frenar: una proforma vencida o un precio
                que cambió no se arreglan comprando igual. */}
            <Button variant="outline" onClick={() => devolverCompras("pide")} disabled={ocupado}>
              <X size={13} /> Preguntar a quien pidió
            </Button>
            <Button variant="outline" onClick={() => devolverCompras("visto")} disabled={ocupado}>
              <X size={13} /> Cambió el precio: nuevo visto
            </Button>
          </>
        )}

        {editando && estado === "comprada" && esMia && (
          <Button variant="primary" onClick={marcarRecibida} disabled={ocupado}><PackageCheck size={13} /> La recibí</Button>
        )}

        <Button variant="outline" onClick={onCerrar}>Cerrar</Button>
      </div>

      {/* Qué pasó con esto, en orden: quién pidió, quién aprobó, quién compró. */}
      {historial.length > 0 && (
        <div style={{ marginTop: 16, borderTop: `1px solid ${colors.neutralSoft}`, paddingTop: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.5, marginBottom: 6 }}>HISTORIAL</div>
          {historial.map(h => (
            <div key={h.id} style={{ display: "flex", gap: 8, padding: "4px 0", fontSize: 12, color: colors.inkSoft }}>
              <Clock size={11} style={{ marginTop: 3, flexShrink: 0, color: colors.muted }} />
              <div>
                <strong style={{ color: ESTADOS[h.estado_nuevo]?.color || colors.ink }}>{ESTADOS[h.estado_nuevo]?.label || h.estado_nuevo}</strong>
                {" · "}{h.usuario_nombre || "—"}
                <span style={{ color: colors.muted }}> · {new Date(h.created_at).toLocaleString("es-EC", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                {h.comentario && <div style={{ color: colors.ink }}>{h.comentario}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
