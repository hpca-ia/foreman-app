import { useEffect, useState, useRef, useCallback } from "react";
import { Check, X, Send, ShoppingCart, PackageCheck, Clock, Upload, FileText, Paperclip, Banknote } from "lucide-react";
import { colors } from "../../theme/colors";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import InlineFiles from "../../components/InlineFiles";
import { ESTADOS, crearSolicitud, guardarSolicitud, moverA, historialDe, rubrosDelProyecto,
  adjuntosDe, subirAdjunto, borrarAdjunto, enlacesDeAdjuntos, elegirProforma, registrarPago } from "./compras";

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
    ...(s.bodega_at ? [{ id: "bodega", label: "En bodega", cuando: s.bodega_at }] : []),
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
  const [form, setForm] = useState(solicitud ? { ...solicitud } : {
    lead_id: proyectos[0]?.id || "", descripcion: "", justificacion: "", necesita_para: "", urgente: false,
    capitulo: "", obra_rubro_id: "", monto_estimado: "",
  });
  const [historial, setHistorial] = useState([]);
  const [comentario, setComentario] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [compra, setCompra] = useState({ proveedor: solicitud?.proveedor || "", monto: solicitud?.monto || "" });
  const [pago, setPago] = useState({ monto: "" });

  const gestionaCompras = puede("compras.gestionar");
  const apruebo = puede("tareas.asignar") || currentUser?.role === "owner";
  const esMia = !editando || viva.solicitante_id === currentUser.id;
  const estado = viva?.estado || "borrador";
  const e = ESTADOS[estado] || ESTADOS.borrador;

  // Volver a abrir un pedido y corregirlo tiene que poder hacerse: la cantidad
  // cambia, el rubro estaba mal, la fecha se corrió. Quien lo pidió lo edita
  // mientras no se haya comprado —después ya hay plata comprometida contra eso
  // y corregirlo a mano descuadra el control—, y gerencia y compras siempre,
  // que son quienes arreglan lo que llega mal escrito.
  const cerrada = estado === "comprada" || estado === "recibida" || estado === "anulada";
  const puedeEditar = (esMia && !cerrada) || apruebo || gestionaCompras;

  useEffect(() => { if (viva?.id) historialDe(viva.id).then(setHistorial); }, [viva?.id]);

  const inp = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Los papeles de la solicitud: proformas para comparar, anexos para explicar.
  const [proformas, setProformas] = useState([]);
  const [enlaces, setEnlaces] = useState({});
  const [nuevaProforma, setNuevaProforma] = useState({ proveedor: "", monto: "" });
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
  useEffect(() => {
    let vivo = true;
    if (!form.lead_id) { setObra(null); setRubros([]); return; }
    rubrosDelProyecto(form.lead_id).then(r => { if (vivo) { setObra(r.obra); setRubros(r.rubros); } });
    return () => { vivo = false; };
  }, [form.lead_id]);
  const capitulos = [...new Set(rubros.map(r => r.capitulo || "SIN CAPÍTULO"))];
  const delCapitulo = rubros.filter(r => (r.capitulo || "SIN CAPÍTULO") === form.capitulo);

  /**
   * La solicitud existe en la base, cueste lo que cueste.
   *
   * Adjuntar un archivo necesita un id del que colgarlo. En vez de pedirle a
   * quien pide que guarde primero y vuelva —que es cuando la proforma se queda
   * en el teléfono—, el primer archivo guarda el borrador solo.
   */
  async function asegurarSolicitud() {
    if (viva) return viva;
    if (!form.lead_id) { setAvisoPapel("Elegí el proyecto antes de adjuntar."); return null; }
    if (!form.descripcion?.trim()) { setAvisoPapel("Escribí qué hace falta antes de adjuntar."); return null; }
    const r = await crearSolicitud(form, currentUser);
    if (r.error) { setAvisoPapel(r.error); return null; }
    setViva(r.solicitud);
    setAvisoPapel("");
    onCambio?.();
    return r.solicitud;
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
    if (!form.descripcion?.trim()) return { error: "Escribe qué hace falta." };
    if (!viva) {
      const r = await crearSolicitud(form, currentUser);
      return r.error ? r : {};
    }
    const err = await guardarSolicitud(viva.id, form);
    return err ? { error: err } : {};
  });

  const aprobar = () => hacer(() => moverA(viva, "aprobada", {
    quien: currentUser, comentario: comentario || null, paraQuien: personaDeCompras(),
    titulo: `Comprar: ${viva.descripcion}`,
  }));

  const devolver = () => hacer(async () => {
    if (!comentario.trim()) return { error: "Para devolverla hay que decir qué falta." };
    return moverA(viva, "requiere_info", {
      quien: currentUser, comentario: comentario.trim(), paraQuien: viva.solicitante_id,
      titulo: `Completar la solicitud: ${viva.descripcion}`,
    });
  });

  const marcarComprada = () => hacer(async () => {
    if (!compra.proveedor.trim()) return { error: "¿A quién se le compró?" };
    return moverA(viva, "comprada", {
      quien: currentUser, comentario: comentario || null, paraQuien: viva.solicitante_id,
      titulo: `Recibir: ${viva.descripcion}`,
      extra: { proveedor: compra.proveedor.trim(), monto: Number(compra.monto) || null },
    });
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
        <div>
          <label style={lbl}>PROYECTO</label>
          <select value={form.lead_id || ""} onChange={ev => inp("lead_id", Number(ev.target.value))} disabled={editando} style={mini}>
            <option value="">Elegí el proyecto…</option>
            {proyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>

        <div>
          <label style={lbl}>QUÉ HACE FALTA</label>
          <input value={form.descripcion || ""} onChange={ev => inp("descripcion", ev.target.value)}
            placeholder="Ej: 200 sacos de cemento, o contratar el vidriado" style={mini}
            disabled={!puedeEditar} />
        </div>

        <div>
          <label style={lbl}>PARA QUÉ</label>
          <textarea value={form.justificacion || ""} onChange={ev => inp("justificacion", ev.target.value)} rows={2}
            placeholder="En qué se va a usar y por qué ahora" style={{ ...mini, resize: "vertical" }}
            disabled={!puedeEditar} />
        </div>

        {/* Contra qué parte del presupuesto. Una solicitud sin capítulo es un
            pedido suelto: no se puede saber cuánto más quieren gastar de algo
            que ya va por la mitad. Apuntar acá no gasta nada todavía —queda
            como comprometido— y al comprarse, la factura hace el gasto. */}
        {obra && capitulos.length > 0 && (
          <div style={{ display: "grid", gap: 8, background: colors.bg, borderRadius: 8, padding: "9px 10px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.4 }}>
              CONTRA QUÉ DEL PRESUPUESTO
            </div>
            <div>
              <label style={lbl}>CAPÍTULO</label>
              <select value={form.capitulo || ""} disabled={!puedeEditar}
                onChange={ev => setForm(p => ({ ...p, capitulo: ev.target.value, obra_rubro_id: "" }))} style={mini}>
                <option value="">Elegí el capítulo…</option>
                {capitulos.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {form.capitulo && delCapitulo.length > 0 && (
              <div>
                <label style={lbl}>RUBRO (SI SE SABE CUÁL)</label>
                <select value={form.obra_rubro_id || ""} disabled={!puedeEditar}
                  onChange={ev => inp("obra_rubro_id", ev.target.value)} style={mini}>
                  <option value="">Todo el capítulo</option>
                  {delCapitulo.map(r => <option key={r.id} value={r.id}>{r.numero}. {r.descripcion}</option>)}
                </select>
              </div>
            )}
            <div>
              <label style={lbl}>CUÁNTO SE ESTIMA (US$)</label>
              <input type="number" step="0.01" min="0" value={form.monto_estimado ?? ""} disabled={!puedeEditar}
                onChange={ev => inp("monto_estimado", ev.target.value)} placeholder="Lo que se cree que va a costar" style={mini} />
              <div style={{ fontSize: 10, color: colors.muted, marginTop: 3, lineHeight: 1.5 }}>
                Es una estimación, no un gasto: queda como <strong>comprometido</strong> contra ese capítulo hasta que
                se compre. La plata se descuenta de verdad cuando entra la factura.
              </div>
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "end" }}>
          <div>
            <label style={lbl}>SE NECESITA PARA</label>
            <input type="date" value={form.necesita_para || ""} onChange={ev => inp("necesita_para", ev.target.value)}
              style={mini} disabled={!puedeEditar} />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: colors.inkSoft, cursor: "pointer", paddingBottom: 9 }}>
            <input type="checkbox" checked={!!form.urgente} onChange={ev => inp("urgente", ev.target.checked)}
              disabled={!puedeEditar} /> Urgente
          </label>
        </div>

        {/* Las proformas: lo que hace que aprobar deje de ser adivinar.
            Cuando de verdad se cotiza, se cotiza con tres proveedores, y quien
            aprueba tiene que poder verlas al lado y elegir una. Esa elección
            queda escrita: seis meses después contesta por qué se le compró a
            ese y no al más barato.

            Se adjunta desde el primer momento, antes de mandarla a aprobar:
            el que pide suele tener la cotización en la mano justo entonces. */}
        <div>
          <label style={lbl}>PROFORMAS{proformas.length ? ` · ${proformas.length}` : ""}</label>
          {proformas.map(a => {
            const elegida = viva?.proforma_id === a.id;
            return (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 9px", marginBottom: 4,
                background: elegida ? colors.brandSoft : colors.bg, borderRadius: 8,
                border: `1px solid ${elegida ? colors.brand : "transparent"}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: colors.ink, overflowWrap: "anywhere" }}>
                    {a.proveedor || a.nombre}
                    {elegida && <span style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 700, color: colors.brand }}>ELEGIDA</span>}
                  </div>
                  <div style={{ fontSize: 10.5, color: colors.muted }}>
                    {a.monto ? `$${Number(a.monto).toFixed(2)} · ` : ""}{a.nota || a.nombre}
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

          <div style={{ display: "grid", gridTemplateColumns: "1fr 100px", gap: 6, marginTop: proformas.length ? 6 : 0 }}>
            <input value={nuevaProforma.proveedor} onChange={ev => setNuevaProforma(p => ({ ...p, proveedor: ev.target.value }))}
              placeholder="¿De qué proveedor?" style={mini} />
            <input type="number" step="0.01" value={nuevaProforma.monto} onChange={ev => setNuevaProforma(p => ({ ...p, monto: ev.target.value }))}
              placeholder="Monto" style={mini} />
          </div>
          <button onClick={() => proformaRef.current?.click()} disabled={subiendo || !nuevaProforma.proveedor.trim()}
            style={{ width: "100%", marginTop: 5, background: colors.bg, border: `1px dashed ${colors.border}`, borderRadius: 8,
              padding: "9px", color: colors.inkSoft, fontSize: 12, cursor: nuevaProforma.proveedor.trim() ? "pointer" : "not-allowed",
              fontFamily: colors.font, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              opacity: nuevaProforma.proveedor.trim() ? 1 : 0.55 }}>
            <Upload size={13} /> {subiendo ? "Subiendo…" : "Subir proforma de ese proveedor"}
          </button>
          <input ref={proformaRef} type="file" style={{ display: "none" }}
            onChange={async ev => {
              const archivo = ev.target.files?.[0]; ev.target.value = "";
              if (!archivo) return;
              setSubiendo(true);
              const s = await asegurarSolicitud();
              if (!s) { setSubiendo(false); return; }
              const r = await subirAdjunto(s, archivo, { tipo: "cotizacion", ...nuevaProforma, quien: currentUser });
              setSubiendo(false);
              if (r.error) { setAvisoPapel(r.error); return; }
              setNuevaProforma({ proveedor: "", monto: "" });
              await cargarPapeles();
            }} />
          {avisoPapel && <div style={{ fontSize: 11, color: colors.danger, marginTop: 4 }}>{avisoPapel}</div>}

          <label style={{ ...lbl, marginTop: 12, display: "block" }}>ANEXOS · el plano, la foto, la especificación</label>
          {verAnexos && viva ? (
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
              <input type="number" value={compra.monto} onChange={ev => setCompra(c => ({ ...c, monto: ev.target.value }))}
                placeholder="Monto" style={mini} />
            </div>
            <div style={{ fontSize: 10.5, color: colors.muted }}>
              La factura se carga en Control de Obra y se asigna a su rubro: ahí es donde el gasto cuenta.
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

        {/* Un comentario acompaña cada paso; al devolver, es obligatorio. */}
        {editando && estado !== "recibida" && (
          <div>
            <label style={lbl}>COMENTARIO</label>
            <textarea value={comentario} onChange={ev => setComentario(ev.target.value)} rows={2}
              placeholder={estado === "pendiente_aprobacion" ? "Si la devolvés, decí qué falta" : "Opcional"}
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
        {puedeEditar && <Button variant="outline" onClick={soloGuardar} disabled={ocupado}>Guardar</Button>}

        {editando && estado === "pendiente_aprobacion" && apruebo && (
          <>
            <Button variant="primary" onClick={aprobar} disabled={ocupado}><Check size={13} /> Aprobar</Button>
            <Button variant="outline" onClick={devolver} disabled={ocupado}><X size={13} /> Devolver</Button>
          </>
        )}

        {editando && estado === "aprobada" && gestionaCompras && (
          <Button variant="primary" onClick={marcarComprada} disabled={ocupado}><ShoppingCart size={13} /> Ya la compré</Button>
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
