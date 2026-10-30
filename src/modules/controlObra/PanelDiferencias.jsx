import { useState, useEffect, useCallback } from "react";
import { FileText, Check, Trash2, Download } from "lucide-react";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import { fmt } from "./calculos";
import { leerConNova } from "./cotizacionesOrden";
import { compararContraPresupuesto } from "./compararProforma";
import { loQueNoEstaPresupuestado, partidasParaOrden, comoSeDice } from "./extraParaCobrar";
import { crearOrden, agregarLinea } from "./ordenesDeCambio";
import { pdfDiferencias } from "./pdfDiferencias";
import {
  analisisDe, lineasDe, guardarAnalisis, decidir, cerrarAnalisis, borrarAnalisis,
  enlacesDeAnalisis, DECISIONES, comoVa,
} from "./analisisDeDiferencias";

// DIFERENCIAS CON EL CLIENTE: el presupuesto contra lo que de verdad hace falta.
//
// No es lo mismo que Beneficios y mezclarlas pierde las dos. Beneficios son
// utilidades nuestras sobre lo YA CONTRATADO —se presupuestó en 1.000 y se
// compró en 800—. Acá se compara el presupuesto contra una PROPUESTA NUEVA o
// una LIQUIDACIÓN, y lo que sale es del cliente: trabajo que el contrato no
// cubre y hay que cobrarle, o trabajo contratado que no se hizo y hay que
// devolverle.
//
// ── Y ES UNA CONVERSACIÓN, NO UN CÁLCULO ───────────────────────────────────
//
// Cada diferencia hay que mirarla y discutirla, y algunas se van a caer: "eso
// ya estaba incluido", "esa cantidad la medimos mal nosotros". Eso lleva días.
// Antes todo vivía en la pantalla y salir del módulo borraba la lectura entera
// —la proforma, el emparejamiento, las decisiones—. Nadie va a discutir un
// adicional de quince mil dólares contra algo que se pierde al cambiar de
// pestaña. Ahora se guarda y se vuelve mañana.
//
// Y SE COMPARA CONTRA TODO EL CONTRATO VIGENTE, incluidos los rubros que
// entraron por una orden de cambio aprobada: si la propuesta nueva mueve una
// cantidad que ya se modificó en la OC-01, eso no es un adicional nuevo, es la
// misma conversación por segunda vez.

const COLOR_DECISION = {
  pendiente: colors.muted, cobrar: colors.brand, incluido: colors.inkSoft, nuestro: colors.danger,
};

// LAS TRES COSAS QUE PUEDE ENCONTRAR, Y QUE SE RESUELVEN DISTINTO. Juntas en
// una lista plana no se pueden decidir: cincuenta y una tarjetas iguales.
const GRUPOS = [
  ["nuevo", "NO ESTÁ EN EL CONTRATO",
    "Trabajo que el presupuesto no cubre. Si se cobra, hay que ponerle precio: costo más el margen."],
  ["mas_cantidad", "MÁS CANTIDAD QUE LA CONTRATADA",
    "El rubro ya existe y su precio está acordado: se cobra solo la diferencia, al precio que el cliente firmó."],
  ["menos_cantidad", "MENOS CANTIDAD QUE LA CONTRATADA",
    "Trabajo contratado que no se hizo. No es un ahorro nuestro: se le devuelve al cliente, como reducción."],
  ["otro_precio", "EL MISMO RUBRO, A OTRO PRECIO",
    "Cambió el costo, no la cantidad. El precio que firmó el cliente no se mueve: esto va contra nuestro "
    + "margen, y la conversación es con el proveedor. Si se decide cobrárselo igual, hay que ponerle precio."],
];

export default function PanelDiferencias({ obra, rubros = [], currentUser, onCambio }) {
  const [lista, setLista] = useState([]);
  const [enlaces, setEnlaces] = useState({});
  const [avance, setAvance] = useState({});
  const [abierto, setAbierto] = useState(null);     // el análisis abierto
  const [lineas, setLineas] = useState([]);
  const [leyendo, setLeyendo] = useState("");
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [pct, setPct] = useState("20");

  // TODO EL CONTRATO VIGENTE, no solo el original: una propuesta nueva puede
  // mover un rubro que ya cambió una orden anterior.
  const vivos = rubros.filter(r => !r.oculto && !r.anulado_por_oc);

  const cargar = useCallback(async () => {
    const r = await analisisDe(obra.id);
    if (r.error) { setError(r.error); return; }
    setLista(r.analisis);
    setEnlaces(await enlacesDeAnalisis(r.analisis));
    // Cómo va cada uno: con varios abiertos a la vez, lo que importa de la
    // lista es cuál está esperando una decisión y cuál ya se puede cerrar.
    const m = {};
    for (const a of r.analisis) {
      const l = await lineasDe(a.id);
      m[a.id] = comoVa(l.lineas || []);
    }
    setAvance(m);
  }, [obra?.id]);
  useEffect(() => { cargar(); }, [cargar]);

  const [sinCosto, setSinCosto] = useState(0);

  const abrir = useCallback(async a => {
    setAbierto(a); setAviso(""); setError("");
    const r = await lineasDe(a.id);
    if (r.error) { setError(r.error); return; }
    setLineas(r.lineas);
    // Cuántos de los que calzaron no tienen costo contra el cual juzgar su
    // precio: se vuelve a calcular contra los rubros de hoy, que pueden haber
    // cambiado desde que se leyó la propuesta.
    const rs = (r.lineas || []).map(l => l.obra_rubro_id).filter(Boolean);
    setSinCosto(rs.filter(id => {
      const rub = vivos.find(x => x.id === id);
      return rub && (rub.costo_unitario === null || rub.costo_unitario === undefined || rub.costo_unitario === "");
    }).length);
  }, [vivos]);

  async function leer(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setLeyendo("leyendo"); setError(""); setAviso("");
    try {
      const r = await leerConNova(file, vivos, p => setLeyendo(p || "leyendo"));
      if (!r.items?.length) throw new Error("NOVA no encontró renglones con precios en el archivo.");
      // Se compara en el momento y se guarda ya emparejado: así al volver
      // mañana no hay que leer nada de nuevo.
      const h = loQueNoEstaPresupuestado(compararContraPresupuesto(r.items, vivos));
      const g = await guardarAnalisis({
        obraId: obra.id, titulo: file.name, proveedor: r.proveedor || "",
        archivo: r.archivo || file, items: r.items, iva: r.iva,
        lineas: [...h.todo, ...h.menos].map(x => ({
          descripcion: x.descripcion, unidad: x.unidad, cantidad: x.cantidad,
          monto: x.costo, obra_rubro_id: x.rubro_id || null, hallazgo: x.hallazgo,
        })),
        quien: currentUser,
      });
      if (g.error) throw new Error(g.error);
      await cargar();
      await abrir(g.analisis);
      setAviso(h.cuantos || h.menos.length
        ? `${comoSeDice(h)}. Quedó guardado: podés salir y volver.`
        : "Todo lo que trae está en el contrato y con las mismas cantidades: no hay diferencias.");
    } catch (err) { setError(err.message); }
    setLeyendo("");
  }

  async function marcar(l, decision) {
    const nota = decision === "incluido" || decision === "nuestro"
      ? window.prompt(decision === "incluido"
        ? "¿Dónde estaba incluido? Queda escrito para cuando el proveedor vuelva a pedirlo."
        : "¿Qué pasó? Esto lo paga la obra, así que conviene saber por qué.", "")
      : null;
    if (nota === null && (decision === "incluido" || decision === "nuestro")) return;
    setOcupado(true);
    const err = await decidir(l.id, decision, nota, currentUser);
    setOcupado(false);
    if (err) { setError(err); return; }
    setLineas(xs => xs.map(x => (x.id === l.id
      ? { ...x, decision, nota, decidido_nombre: currentUser?.name || null, decidido_at: new Date().toISOString() }
      : x)));
  }

  /** El grupo entero para el mismo lado: casi siempre lo es, y lo que se revisa son las excepciones. */
  async function marcarTodas(cuales, decision) {
    if (!window.confirm(`¿Marcar ${cuales.length} diferencias como «${DECISIONES[decision]?.label}»?\n\n`
      + "Cada una se puede cambiar después, una por una.")) return;
    setOcupado(true);
    for (const l of cuales) {
      const err = await decidir(l.id, decision, null, currentUser);
      if (err) { setOcupado(false); setError(err); return; }
    }
    setOcupado(false);
    const ids = new Set(cuales.map(x => x.id));
    setLineas(xs => xs.map(x => (ids.has(x.id)
      ? { ...x, decision, decidido_nombre: currentUser?.name || null, decidido_at: new Date().toISOString() }
      : x)));
  }

  async function armarLaOrden() {
    const van = lineas.filter(l => l.decision === "cobrar");
    if (!van.length) { setError("Marcá primero qué diferencias se le cobran al cliente."); return; }
    setOcupado(true); setError("");
    const r = await crearOrden(obra.id, {
      titulo: `Diferencias contra el presupuesto${abierto.proveedor ? ` · ${abierto.proveedor}` : ""}`,
      justificacion: `Al comparar ${abierto.archivo_nombre || "la propuesta"} contra el contrato vigente `
        + `aparecieron diferencias que no cubre:\n\n`
        + van.map(l => `· ${l.descripcion}${l.nota ? ` — ${l.nota}` : ""}`).join("\n"),
      tipo: "Requerimiento cliente",
    }, currentUser);
    if (r.error) { setOcupado(false); setError(r.error); return; }

    const puestas = [];
    for (const linea of partidasParaOrden({
      todo: van.filter(l => l.hallazgo !== "menos_cantidad").map(comoPartida),
      menos: van.filter(l => l.hallazgo === "menos_cantidad").map(l => ({ ...comoPartida(l), quita: true })),
    }, pct)) {
      const rl = await agregarLinea(r.orden.id, { ...linea, orden: puestas.length }, puestas);
      if (rl.error) { setOcupado(false); setError(rl.error); return; }
      puestas.push(rl.linea);
    }
    await cerrarAnalisis(abierto.id, r.orden.id);
    setOcupado(false);
    await cargar();
    setAbierto(a => ({ ...a, estado: "resuelto", orden_cambio_id: r.orden.id }));
    setAviso(`Quedó armada la ${r.orden.codigo || `OC-${r.orden.numero}`} con ${puestas.length} `
      + `${puestas.length === 1 ? "partida" : "partidas"}, en borrador. Revisá los precios antes de mandarla.`);
    onCambio?.();
  }

  /** Una línea guardada, como la espera el armador de partidas. */
  function comoPartida(l) {
    const rubro = vivos.find(r => r.id === l.obra_rubro_id);
    const cant = Number(l.cantidad) || 1;
    const costoUnitario = Math.round((Number(l.monto) || 0) / cant * 10000) / 10000;
    // EL PRECIO DEL CONTRATO SE RESPETA. Volver a ponerle precio a un rubro que
    // el cliente ya firmó es abrir una negociación que no hacía falta.
    // EL PRECIO DEL CONTRATO SOLO VALE PARA LA CANTIDAD. Una diferencia de
    // precio no se cobra al precio del contrato —ese es justamente el que no
    // alcanzó—: si se decide cobrarla, lleva el margen como lo nuevo.
    const puRubro = l.hallazgo !== "otro_precio" && rubro && Number(rubro.cantidad)
      ? Math.round((Number(rubro.total_base) / Number(rubro.cantidad)) * 10000) / 10000 : null;
    return {
      descripcion: l.descripcion, unidad: l.unidad || "u", cantidad: cant,
      costo: Number(l.monto) || 0, costoUnitario,
      precioUnitario: puRubro, rubro_id: l.obra_rubro_id || null,
      rubro_codigo: rubro ? String(rubro.numero ?? rubro.codigo ?? "") : "",
    };
  }

  const caja = { background: colors.surface, border: `1px solid ${colors.border}`,
    borderRadius: colors.radiusMd, padding: "11px 13px", marginBottom: 10 };

  // ── UN ANÁLISIS ABIERTO ───────────────────────────────────────────────────
  if (abierto) {
    const porDecidir = lineas.filter(l => l.decision === "pendiente").length;
    const aCobrar = lineas.filter(l => l.decision === "cobrar");
    const total = aCobrar.reduce((t, l) => t + (Number(l.monto) || 0), 0);
    return (
      <div style={{ fontFamily: colors.font }}>
        <button onClick={() => { setAbierto(null); cargar(); }}
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: colors.font,
            fontSize: 12, color: colors.brand, marginBottom: 8 }}>
          ← Diferencias
        </button>
        <div style={{ fontSize: 13, fontWeight: 700, color: colors.ink }}>
          {abierto.titulo || "Propuesta"}{abierto.proveedor ? ` · ${abierto.proveedor}` : ""}
        </div>
        <div style={{ fontSize: 11.5, color: colors.muted, marginBottom: 10 }}>
          {lineas.length} {lineas.length === 1 ? "diferencia" : "diferencias"} · {porDecidir} sin decidir
          {enlaces[abierto.id] && <> · <a href={enlaces[abierto.id]} target="_blank" rel="noreferrer"
            style={{ color: colors.brand }}>ver el papel</a></>}
          {abierto.estado === "resuelto" && <> · <strong style={{ color: colors.success }}>ya se armó su orden</strong></>}
        </div>

        {/* EL PAPEL. Cincuenta y un renglones no se deciden en una pantalla:
            se imprimen, se miran en el escritorio con el presupuesto al lado,
            se marcan a mano y se discuten en una reunión — o se le mandan al
            residente para que diga cuáles ya estaban incluidas. */}
        <div style={{ display: "flex", gap: 7, marginBottom: 10, flexWrap: "wrap" }}>
          <Button variant="outline" size="sm" disabled={ocupado || !lineas.length}
            onClick={async () => {
              setOcupado(true); setError("");
              try {
                await pdfDiferencias({ analisis: abierto, lineas, rubros: vivos, obra, proyecto: obra?.nombre }, "bajar");
              } catch (e) { setError("No se pudo armar el PDF: " + e.message); }
              setOcupado(false);
            }}>
            <Download size={13} /> Bajar el análisis en PDF
          </Button>
        </div>

        {error && <div style={{ fontSize: 12, color: colors.danger, marginBottom: 8 }}>{error}</div>}
        {aviso && <div style={{ fontSize: 12, color: colors.success, marginBottom: 8, lineHeight: 1.5 }}>{aviso}</div>}

        {/* ── AGRUPADAS POR LO QUE SON ─────────────────────────────────
            Cincuenta y un tarjetas iguales en una lista no se pueden decidir:
            son tres hallazgos distintos y cada uno se resuelve distinto. Lo que
            no está en el contrato hay que ponerle precio; lo que trae más
            cantidad ya tiene precio acordado y se cobra la diferencia; lo que
            trae menos es trabajo que no se hizo y se devuelve.

            Y CONTRA QUÉ SE COMPARÓ, a la vista: sin ver la cantidad contratada
            y su precio no se puede decidir nada, y mirarlo en otra pestaña con
            cincuenta renglones abiertos no lo hace nadie. */}
        {GRUPOS.map(([clave, titulo, pista]) => {
          const suyas = lineas.filter(l => l.hallazgo === clave);
          if (!suyas.length) return null;
          const suma = suyas.reduce((t, l) => t + (Number(l.monto) || 0), 0);
          const sinDecidir = suyas.filter(l => l.decision === "pendiente");
          return (
            <div key={clave} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", gap: 9, alignItems: "baseline", flexWrap: "wrap", marginBottom: 2 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: colors.ink, letterSpacing: 0.3 }}>
                  {titulo} · {suyas.length} · ${fmt(suma)}
                </div>
                {/* CINCUENTA DECISIONES DE A UNA NO LAS TOMA NADIE. Casi
                    siempre el grupo entero va para el mismo lado, y lo que se
                    revisa son las tres excepciones. */}
                {sinDecidir.length > 1 && abierto.estado !== "resuelto" && (
                  <button onClick={() => marcarTodas(sinDecidir, "cobrar")} disabled={ocupado}
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: colors.font,
                      fontSize: 11, color: colors.brand, textDecoration: "underline" }}>
                    se cobran {sinDecidir.length === suyas.length ? "todas" : `las ${sinDecidir.length} sin decidir`}
                  </button>
                )}
              </div>
              <div style={{ fontSize: 10.5, color: colors.muted, marginBottom: 6 }}>{pista}</div>

              {suyas.map(l => {
                const rubro = vivos.find(r => r.id === l.obra_rubro_id);
                const deOrden = rubro?.origen === "orden_cambio";
                const puRubro = rubro && Number(rubro.cantidad)
                  ? Number(rubro.total_base) / Number(rubro.cantidad) : null;
                return (
                  <div key={l.id} style={{ ...caja, marginBottom: 6, padding: "9px 11px",
                    borderLeft: `3px solid ${COLOR_DECISION[l.decision] || colors.border}` }}>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
                      <div style={{ flex: 1, minWidth: 220 }}>
                        <div style={{ fontSize: 12.5, color: colors.ink }}>{l.descripcion}</div>
                        {/* EL RUBRO DEL CONTRATO, CON SUS NÚMEROS. Es contra
                            esto que se está comparando, y es lo que contesta si
                            la diferencia es real. */}
                        {rubro ? (
                          <div style={{ fontSize: 10.5, color: colors.inkSoft, marginTop: 2 }}>
                            contra <strong>{rubro.numero || ""} {String(rubro.descripcion || "").slice(0, 50)}</strong>
                            {" · "}contratado {fmt(rubro.cantidad)} {rubro.unidad || ""}
                            {puRubro != null && <> a ${fmt(puRubro)}</>}
                            {deOrden && <span style={{ color: colors.warning }}> · vino de una orden de cambio</span>}
                          </div>
                        ) : (
                          <div style={{ fontSize: 10.5, color: colors.muted, marginTop: 2 }}>
                            no hay rubro del contrato que lo cubra
                          </div>
                        )}
                        {deOrden && (
                          <div style={{ fontSize: 10.5, color: colors.warning, marginTop: 2 }}>
                            Mirá que no se esté cobrando dos veces lo mismo.
                          </div>
                        )}
                        {l.nota && <div style={{ fontSize: 11, color: colors.inkSoft, marginTop: 3 }}>“{l.nota}”</div>}
                        {l.decidido_nombre && (
                          <div style={{ fontSize: 10, color: COLOR_DECISION[l.decision], marginTop: 2, fontWeight: 600 }}>
                            {DECISIONES[l.decision]?.label} · {l.decidido_nombre}
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.ink, whiteSpace: "nowrap" }}>
                        {fmt(l.cantidad)} {l.unidad} · ${fmt(l.monto)}
                      </div>
                    </div>
                    {abierto.estado !== "resuelto" && (
                      <div style={{ display: "flex", gap: 4, marginTop: 7, flexWrap: "wrap" }}>
                        {Object.entries(DECISIONES).filter(([k]) => k !== "pendiente").map(([k, d]) => (
                          <button key={k} onClick={() => marcar(l, k)} disabled={ocupado} title={d.pista}
                            style={{ border: `1px solid ${l.decision === k ? COLOR_DECISION[k] : colors.border}`,
                              background: l.decision === k ? COLOR_DECISION[k] : "#fff",
                              color: l.decision === k ? "#fff" : colors.muted,
                              borderRadius: 20, padding: "3px 10px", fontSize: 11, cursor: "pointer",
                              fontFamily: colors.font, fontWeight: l.decision === k ? 700 : 400 }}>
                            {d.label}
                          </button>
                        ))}
                        {l.decision !== "pendiente" && (
                          <button onClick={() => marcar(l, "pendiente")} disabled={ocupado}
                            style={{ background: "none", border: "none", cursor: "pointer", fontFamily: colors.font,
                              fontSize: 11, color: colors.muted, textDecoration: "underline" }}>
                            deshacer
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* LO QUE NO SE PUEDE JUZGAR, DICHO. Un rubro sin costo cargado no
            tiene contra qué comparar el precio: el del rubro es el de VENTA, y
            contra ese todo proveedor parece barato —esa diferencia es el
            margen, no un hallazgo—. Esta propuesta es su primera referencia. */}
        {sinCosto > 0 && (
          <div style={{ ...caja, borderLeft: `3px solid ${colors.warning}`, fontSize: 11.5,
            color: colors.inkSoft, lineHeight: 1.55 }}>
            De los renglones que calzaron con un rubro, <strong>{sinCosto}</strong> no tienen costo cargado:
            de esos no se puede decir si el precio está bien, porque no hay contra qué compararlo. Esta
            propuesta es su primera referencia — cargándole el costo a esos rubros, la próxima sí se puede
            comparar.
          </div>
        )}

        {!lineas.length && (
          <div style={{ ...caja, fontSize: 12.5, color: colors.success }}>
            Esta propuesta no trae diferencias contra el contrato vigente.
          </div>
        )}

        {aCobrar.length > 0 && abierto.estado !== "resuelto" && (
          <div style={{ ...caja, borderLeft: `3px solid ${colors.brand}` }}>
            <div style={{ fontSize: 12.5, color: colors.ink, marginBottom: 7 }}>
              <strong>{aCobrar.length} {aCobrar.length === 1 ? "diferencia" : "diferencias"} se le cobran al cliente</strong>
              {" "}· ${fmt(total)} de costo
              {porDecidir > 0 && <span style={{ color: colors.warning }}> · faltan {porDecidir} por decidir</span>}
            </div>
            <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 11.5, color: colors.inkSoft }}>Precio = costo +</span>
              <input type="number" step="1" value={pct} onChange={e => setPct(e.target.value)}
                style={{ ...inputStyle, padding: "3px 6px", fontSize: 11.5, width: 60, textAlign: "right" }} />
              <span style={{ fontSize: 11.5, color: colors.inkSoft }}>% para lo que no tiene precio en el contrato</span>
              <Button variant="primary" size="sm" disabled={ocupado} onClick={armarLaOrden}>
                <Check size={13} /> {ocupado ? "Armando…" : "Armar la orden de cambio"}
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── LA LISTA ──────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: colors.font }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: colors.ink }}>Diferencias con el cliente</div>
      <div style={{ fontSize: 11.5, color: colors.muted, lineHeight: 1.5, marginBottom: 10, maxWidth: 760 }}>
        El contrato vigente contra una <strong>propuesta nueva</strong> o una <strong>liquidación</strong>.
        Lo que aparece y el contrato no cubre se le cobra al cliente; lo contratado que no se hizo se le devuelve.
        Cada diferencia se decide una por una y <strong>el análisis queda guardado</strong>: se puede salir y
        volver mañana. No es lo mismo que Beneficios —esas son eficiencias nuestras sobre lo ya contratado.
      </div>

      <label style={{ ...caja, display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
        cursor: leyendo ? "wait" : "pointer", borderStyle: "dashed", color: colors.inkSoft, fontSize: 12.5 }}>
        <input type="file" accept="image/*,.pdf,.xlsx,.xlsm,.xls,.csv" style={{ display: "none" }}
          disabled={!!leyendo} onChange={leer} />
        <FileText size={14} />
        {leyendo ? `NOVA está leyendo… ${leyendo === "leyendo" ? "" : leyendo}`
          : "Subir una propuesta nueva o una liquidación (PDF, foto o Excel)"}
      </label>

      {error && <div style={{ fontSize: 12, color: colors.danger, marginBottom: 10 }}>{error}</div>}
      {aviso && <div style={{ fontSize: 12, color: colors.success, marginBottom: 10, lineHeight: 1.5 }}>{aviso}</div>}

      {/* VARIOS ABIERTOS A LA VEZ, cada uno con su papel y con cómo va.
          Un análisis de cincuenta renglones no se termina de una sentada, y
          mientras tanto llega la propuesta del siguiente proveedor. Cada uno
          queda acá con lo que le falta decidir, para poder ir y venir. */}
      {lista.map(a => {
        const v = avance[a.id];
        return (
        <div key={a.id} style={{ ...caja, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
          borderLeft: `3px solid ${a.estado === "resuelto" ? colors.success : v?.sinDecidir ? colors.warning : colors.border}` }}>
          <button onClick={() => abrir(a)}
            style={{ flex: 1, minWidth: 200, textAlign: "left", background: "none", border: "none", padding: 0,
              cursor: "pointer", fontFamily: colors.font }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.brand }}>
              {a.titulo || "Propuesta"}{a.proveedor ? ` · ${a.proveedor}` : ""}
            </div>
            <div style={{ fontSize: 10.5, color: colors.muted }}>
              {String(a.created_at || "").slice(0, 10)} · {a.creado_nombre || ""}
              {v ? ` · ${v.total} ${v.total === 1 ? "diferencia" : "diferencias"}` : ""}
            </div>
            {v && (
              <div style={{ fontSize: 10.5, marginTop: 2,
                color: a.estado === "resuelto" ? colors.success : v.sinDecidir ? colors.warning : colors.inkSoft }}>
                {a.estado === "resuelto"
                  ? "Ya se armó su orden de cambio"
                  : v.sinDecidir
                    ? `Faltan ${v.sinDecidir} por decidir`
                    : `Listo para armar la orden · ${v.aCobrar} a cobrar, $${fmt(v.monto)}`}
              </div>
            )}
          </button>
          {enlaces[a.id] && (
            <a href={enlaces[a.id]} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
              title="El papel que mandó el proveedor, tal como llegó"
              style={{ fontSize: 11, color: colors.brand, whiteSpace: "nowrap" }}>ver el papel</a>
          )}
          <button onClick={async () => {
            if (!window.confirm(`¿Borrar el análisis de ${a.titulo || "esta propuesta"}?\n\nSe va con sus decisiones.`)) return;
            await borrarAnalisis(a); cargar();
          }}
            style={{ background: "none", border: "none", color: colors.border, cursor: "pointer", display: "flex" }}>
            <Trash2 size={13} />
          </button>
        </div>
        );
      })}

      {!lista.length && !leyendo && (
        <div style={{ fontSize: 11.5, color: colors.muted, lineHeight: 1.5 }}>
          Todavía no se comparó ninguna propuesta contra este contrato.
        </div>
      )}
    </div>
  );
}
