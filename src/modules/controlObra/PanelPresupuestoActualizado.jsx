import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from "react";
import { Download, FileSpreadsheet, Trash2, Plus, X } from "lucide-react";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import { fmt } from "./calculos";
import { cargarOrdenes } from "./ordenesDeCambio";
import { presupuestoActualizado, renglonesDeLaMatriz, ajustesLimpios, nuevosLimpios, nuevosDe, faltaGuardar, nombrePorDefecto } from "./presupuestoActualizado.js";
import { excelDelPresupuesto, pdfDelPresupuesto } from "./exportarPresupuestoActualizado.js";
import { simulacionesDe, guardarSimulacion, borrarSimulacion } from "./simulacionesDePresupuesto.js";
import { liquidacion, subtotalesDeLiquidacion, modalidadDe, MODALIDADES, claveDe, seMide, costosDe, cantidadEscrita } from "./liquidacion.js";
import { cargarEjecutado, anotarEjecutado, guardarModalidad } from "./ejecutado.js";
import DiferenciasDeCantidad from "./DiferenciasDeCantidad";

// EL PRESUPUESTO ACTUALIZADO, EN PANTALLA.
//
// El contrato rubro por rubro, y al lado lo que le hicieron las órdenes de
// cambio aprobadas, lo que le harían las que esperan firma, y lo que se quiera
// proyectar a mano. Las tres primeras cosas se arman solas con lo que ya está
// —los rubros y las órdenes— y no se guardan: abrirlo mañana con una orden más
// aprobada da otra matriz, y eso es lo que tiene que pasar.
//
// Lo único que se guarda es el ajuste a mano —las cantidades que se mueven y
// los rubros que todavía no existen—, como una proyección con nombre.
//
// SE GUARDA SOLA. Antes había que ponerle nombre y apretar "Guardar", y si
// faltaba el nombre el aviso salía arriba de todo, lejos del botón: se
// escribían los ajustes, se salía de la pantalla, y al volver no había nada.
// En la base no quedó ni una. Ahora cada cambio se guarda un segundo después
// de escribirlo, al entrar se abre la última, y al lado dice si quedó guardado.
// El presupuesto original, al lado, no cambia: es el papel que se firmó.
//
// Y ACÁ SE CARGA LO EJECUTADO. «Las cantidades ejecutadas se ponen en
// presupuesto actualizado con órdenes de cambio… ese es a la final la
// liquidación.» Al lado del vigente de cada rubro va lo que de verdad se
// ejecutó, y con eso sale lo que se liquida, según cómo se contrató la obra
// (liquidacion.js). Eso sí es real y se guarda al salir de la casilla: no es
// parte de ninguna proyección.

const th = { padding: "5px 6px", fontSize: 9.5, color: colors.muted, letterSpacing: 0.3, fontWeight: 700, whiteSpace: "nowrap" };
const td = { padding: "5px 6px", fontSize: 11.5, verticalAlign: "top" };
const num = { textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
// La raya que separa un grupo de columnas del siguiente.
const borde = { borderLeft: `1px solid ${colors.border}` };
const VIOLETA = "#6D28D9";
const VERDE = "#0F766E";

const Mov = ({ v, color }) => (!v ? null : (
  <span style={{ color: v < 0 ? colors.danger : (color || colors.ink) }}>{v > 0 ? "+" : "−"}{fmt(Math.abs(v))}</span>
));
const plata = v => `${v < 0 ? "−" : ""}$${fmt(Math.abs(v))}`;

export default function PanelPresupuestoActualizado({ obra, rubros, currentUser, modalidad: modalidadDeAfuera = null, onModalidad, onEjecutado }) {
  const [ordenes, setOrdenes] = useState([]);
  const [lineas, setLineas] = useState({});
  const [cargando, setCargando] = useState(true);
  const [conBorradores, setConBorradores] = useState(false);
  const [ocupado, setOcupado] = useState("");
  const [error, setError] = useState("");
  // Cómo va el guardado de la proyección, para decirlo donde se escribe.
  const [guardado, setGuardado] = useState({ estado: "", error: "", hora: null });
  const [intento, setIntento] = useState(0);
  const enVuelo = useRef(false);      // hay un guardado viajando
  const pendiente = useRef(false);    // hay algo escrito que todavía no salió
  const ultimo = useRef(null);        // lo que se guardaría ahora mismo
  const montado = useRef(true);

  // LO QUE SE PROYECTA A MANO. Se guarda tal como se escribe —"-", "-5"— para
  // que el campo no pelee con quien está tipeando; la cuenta lo lee como número.
  const [ajustes, setAjustes] = useState({});
  // LOS RUBROS QUE TODAVÍA NO SON DE NADIE: algo que viene, sin cotizar y sin
  // orden de cambio, escrito a mano con una estimación. Van al final.
  const [nuevos, setNuevos] = useState([]);
  const [recien, setRecien] = useState(null);
  const [simulaciones, setSimulaciones] = useState([]);
  const [simulacion, setSimulacion] = useState(null);   // la guardada que está abierta
  const [nombre, setNombre] = useState("");
  const [sinTabla, setSinTabla] = useState(false);
  // Lo ejecutado de cada renglón, lo que se está escribiendo en una casilla, y
  // cómo se cobra la obra.
  const [ejecutado, setEjecutado] = useState({});
  const [escritoEj, setEscritoEj] = useState({});
  const [sinEjecutado, setSinEjecutado] = useState(false);
  const [modalidad, setModalidad] = useState(modalidadDeAfuera || modalidadDe(obra));
  const [guardadoEj, setGuardadoEj] = useState({ estado: "", error: "", hora: null });

  const cargarSimulaciones = useCallback(async () => {
    const r = await simulacionesDe(obra.id);
    setSimulaciones(r.simulaciones || []);
    setSinTabla(!!r.sinTabla);
    if (r.error && !r.sinTabla) setError(r.error);
    return r.simulaciones || [];
  }, [obra?.id]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true);
      // LAS DOS COSAS ANTES DE DEJAR ESCRIBIR: las órdenes y la proyección
      // guardada. Si la matriz se abriera antes de que llegue la proyección,
      // lo que se escribiera en ese rato lo pisaría la guardada al llegar —o
      // nacería una segunda proyección al lado de la primera—.
      const [r, lista, ej] = await Promise.all([cargarOrdenes(obra.id), cargarSimulaciones(), cargarEjecutado(obra.id)]);
      if (!vivo) return;
      setOrdenes(r.ordenes || []); setLineas(r.lineas || {});
      setEjecutado(ej.ejecutado || {}); setSinEjecutado(!!ej.sinTabla); setEscritoEj({});
      // AL ENTRAR SE ABRE LA ÚLTIMA PROYECCIÓN. Arrancar en blanco y dejar la
      // guardada escondida en una lista es lo mismo que no haberla guardado.
      const s = lista[0] || null;
      setSimulacion(s); setNombre(s?.nombre || "");
      setAjustes(s ? ajustesLimpios(s.ajustes) : {}); setNuevos(s ? nuevosDe(s.ajustes) : []);
      setGuardado({ estado: "", error: "", hora: null });
      setCargando(false);
    })();
    return () => { vivo = false; };
  }, [obra?.id, cargarSimulaciones]);

  const numeros = useMemo(() => ajustesLimpios(ajustes), [ajustes]);
  const escritos = useMemo(() => nuevosLimpios(nuevos), [nuevos]);
  const matriz = useMemo(
    () => presupuestoActualizado({ rubros, ordenes, lineasDeOrdenes: lineas, obra, conBorradores, ajustes: numeros, nuevos: escritos }),
    [rubros, ordenes, lineas, obra, conBorradores, numeros, escritos]);
  const renglones = useMemo(() => renglonesDeLaMatriz(matriz), [matriz]);
  // LO PROYECTADO A MANO SE ESCRIBE EN LA MISMA MATRIZ, AL FINAL, que es donde
  // se lo busca: después de los bloques de las órdenes y antes del pie. Esos
  // renglones se dibujan aparte —son campos para escribir, no una lectura—,
  // así que acá se sacan los de la matriz y se deja la marca de dónde van.
  const filasDeLaTabla = useMemo(() => {
    const sin = renglones.filter(r => !(r.tipo === "bloque" && r.manual) && !r.proyectada);
    const pie = sin.findIndex(r => r.tipo === "pie");
    return pie < 0 ? [...sin, { tipo: "proyectados" }] : [...sin.slice(0, pie), { tipo: "proyectados" }, ...sin.slice(pie)];
  }, [renglones]);
  const t = matriz.totales;
  // LA LIQUIDACIÓN: lo vigente con lo ejecutado. No mira el ajuste a mano, que
  // es una proyección; mira lo que ya es contrato.
  const liq = useMemo(() => liquidacion({ matriz, ejecutado, modalidad, costos: costosDe(rubros) }), [matriz, ejecutado, modalidad, rubros]);
  const subsLiq = useMemo(() => subtotalesDeLiquidacion(filasDeLaTabla, liq), [filasDeLaTabla, liq]);
  // El pie de la liquidación, en el orden de los renglones del pie: sin IVA, el IVA y el total.
  const piesLiq = matriz.iva > 0 ? [liq.totales.liquidacion, liq.totales.iva, liq.totales.conIva] : [liq.totales.liquidacion];
  const indiceDelPie = i => filasDeLaTabla.slice(0, i).filter(x => x.tipo === "pie").length;

  // Lo ejecutado se guarda al salir de la casilla, y dice al lado si quedó.
  async function anotar(r, valor) {
    const clave = claveDe(r);
    const antes = ejecutado[clave] ?? null;
    const ahora = cantidadEscrita(valor);
    const vacio = valor === "" || valor == null;
    if (ahora === antes && (ahora != null || vacio)) { setEscritoEj(x => { const y = { ...x }; delete y[clave]; return y; }); return; }
    setGuardadoEj({ estado: "guardando", error: "", hora: null });
    const e = await anotarEjecutado({ obra, clave, rubroId: r.deOrden ? null : r.id, valor, quien: currentUser });
    if (e) { setGuardadoEj({ estado: "error", error: e, hora: null }); return; }
    const mapa = { ...ejecutado };
    if (ahora == null) delete mapa[clave]; else mapa[clave] = ahora;
    setEjecutado(mapa);
    setEscritoEj(x => { const y = { ...x }; delete y[clave]; return y; });
    setGuardadoEj({ estado: "guardado", error: "", hora: new Date() });
    onEjecutado?.(mapa);
  }

  async function cambiarModalidad(m) {
    const antes = modalidad;
    setModalidad(m); setGuardadoEj({ estado: "guardando", error: "", hora: null });
    const e = await guardarModalidad(obra, m);
    if (e) { setModalidad(antes); setGuardadoEj({ estado: "error", error: e, hora: null }); return; }
    setGuardadoEj({ estado: "guardado", error: "", hora: new Date() });
    onModalidad?.(m);
  }
  const borradores = ordenes.filter(o => o.estado === "borrador" && !o.anulada && (lineas[o.id] || []).length).length;
  const hayAjustes = Object.keys(numeros).length > 0 || escritos.length > 0;
  // ── SE GUARDA SOLA ──────────────────────────────────────────────────────
  // Lo que se guardaría ahora mismo va en una referencia: el guardado sale un
  // segundo después del último cambio, y tiene que llevarse lo último escrito,
  // no lo que había cuando se armó el reloj.
  const idAbierta = simulacion?.id ?? null;
  const sinGuardar = faltaGuardar({ abierta: simulacion, ajustes: numeros, nuevos: escritos, nombre });
  const hayQueGuardar = !cargando && !sinTabla && sinGuardar;
  const firma = JSON.stringify([numeros, escritos, nombre.trim()]);
  ultimo.current = {
    id: idAbierta, obraId: obra.id, ajustes: numeros, nuevos: escritos, quien: currentUser,
    nombre: nombre.trim() || simulacion?.nombre || nombrePorDefecto(simulaciones),
  };

  const guardarAhora = useCallback(async () => {
    const que = ultimo.current;
    if (!que || enVuelo.current) return;
    enVuelo.current = true; pendiente.current = false;
    setGuardado({ estado: "guardando", error: "", hora: null });
    const r = await guardarSimulacion(que);
    enVuelo.current = false;
    if (!montado.current) return;
    if (r.error) { setGuardado({ estado: "error", error: r.error, hora: null }); return; }
    // Al quedar guardada pasa a ser la abierta: si mientras viajaba se escribió
    // algo más, deja de coincidir con lo guardado y sale otro guardado solo.
    setSimulacion(r.simulacion);
    setSimulaciones(l => [r.simulacion, ...l.filter(x => String(x.id) !== String(r.simulacion.id))]);
    setNombre(n => (n.trim() ? n : r.simulacion.nombre || ""));
    setGuardado({ estado: "guardado", error: "", hora: new Date() });
  }, []);

  useEffect(() => {
    if (!hayQueGuardar) { pendiente.current = false; return undefined; }
    pendiente.current = true;
    // Con uno viajando no sale otro: cuando vuelva, esto corre de nuevo.
    if (enVuelo.current) return undefined;
    const reloj = setTimeout(guardarAhora, 900);
    return () => clearTimeout(reloj);
  }, [hayQueGuardar, firma, idAbierta, intento, guardarAhora]);

  // AL SALIR DE LA PANTALLA, LO QUE QUEDÓ ESCRITO SE VA GUARDADO. Sin esto, lo
  // tipeado en el último segundo antes de cambiar de pestaña se perdía.
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
      const que = ultimo.current;
      if (pendiente.current && que && (que.id || !enVuelo.current)) guardarSimulacion(que);
    };
  }, []);

  async function duplicar() {
    if (!simulacion) return;
    setOcupado("duplicar");
    const r = await guardarSimulacion({ ...ultimo.current, id: null, nombre: `${ultimo.current.nombre} (copia)` });
    setOcupado("");
    if (r.error) { setGuardado({ estado: "error", error: r.error, hora: null }); return; }
    setSimulaciones(l => [r.simulacion, ...l]);
    setSimulacion(r.simulacion); setNombre(r.simulacion.nombre || "");
    setGuardado({ estado: "guardado", error: "", hora: new Date() });
  }

  // Cómo quedó, dicho al lado de donde se escribe.
  const estadoDelGuardado = sinTabla ? null
    : guardado.estado === "error" ? (
      <span style={{ fontSize: 11.5, color: colors.danger, fontWeight: 600 }}>
        No se guardó: {guardado.error}{" "}
        <button onClick={() => setIntento(k => k + 1)}
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: colors.font, fontSize: 11.5,
            color: colors.danger, textDecoration: "underline" }}>reintentar</button>
      </span>
    ) : (hayQueGuardar || guardado.estado === "guardando") ? (
      <span style={{ fontSize: 11.5, color: colors.warning }}>Guardando…</span>
    ) : simulacion ? (
      <span style={{ fontSize: 11.5, color: colors.success, fontWeight: 600 }}>
        Guardado ✓{guardado.hora ? ` ${guardado.hora.toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" })}` : ""}
      </span>
    ) : (
      <span style={{ fontSize: 11.5, color: colors.muted }}>Se guarda sola apenas escribas algo</span>
    );

  async function bajar(que) {
    setOcupado(que); setError("");
    try {
      const datos = { matriz, obra, simulacion: hayAjustes ? (nombre.trim() || simulacion?.nombre || "Proyección") : null };
      if (que === "excel") await excelDelPresupuesto(datos);
      else await pdfDelPresupuesto(datos);
    } catch (e) { setError("No se pudo armar el archivo: " + e.message); }
    setOcupado("");
  }

  function abrir(id) {
    const s = simulaciones.find(x => String(x.id) === String(id)) || null;
    setSimulacion(s); setNombre(s?.nombre || ""); setGuardado({ estado: "", error: "", hora: null });
    setAjustes(s ? ajustesLimpios(s.ajustes) : {});
    setNuevos(s ? nuevosDe(s.ajustes) : []);
  }

  async function borrar() {
    if (!simulacion || !window.confirm(`¿Borrar la proyección «${simulacion.nombre}»? Se pierden sus ajustes y sus rubros proyectados.`)) return;
    const err = await borrarSimulacion(simulacion.id);
    if (err) { setError(err); return; }
    setSimulacion(null); setNombre(""); setAjustes({}); setNuevos([]); setGuardado({ estado: "", error: "", hora: null });
    await cargarSimulaciones();
  }

  // Un rubro nuevo, vacío, para llenar. El id es solo para reconocerlo acá.
  const agregarNuevo = () => {
    const id = `n${Date.now().toString(36)}${Math.round(Math.random() * 1e4)}`;
    setNuevos(l => [...l, { id, descripcion: "", unidad: "", cantidad: "1", precio: "" }]);
    // El cursor queda en la descripción del renglón nuevo, y la pantalla baja
    // hasta él: está al final de la matriz, lejos del botón de arriba.
    setRecien(id);
  };
  const cambiarNuevo = (id, campo, valor) => setNuevos(l => l.map(x => (x.id === id ? { ...x, [campo]: valor } : x)));
  const quitarNuevo = id => setNuevos(l => l.filter(x => x.id !== id));

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
  // Con IVA, el número del pie: el mismo que el del presupuesto y el de cada orden.
  const con = k => (matriz.iva > 0 ? `${plata(matriz.totalesConIva[k])} con IVA` : "");
  const caja = { background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 14, marginBottom: 12 };

  // ── LOS RUBROS PROYECTADOS, AL FINAL DE LA MATRIZ ───────────────────────
  // El bloque está siempre, aunque esté vacío: es la única forma de que se
  // encuentre dónde se agregan. Cada renglón se escribe en las mismas
  // columnas de la matriz —descripción, unidad y precio a la izquierda, la
  // cantidad en AJUSTE A MANO— y su total cae en PROYECTADO.
  const campoDeMatriz = { width: "100%", boxSizing: "border-box", padding: "3px 6px", fontSize: 11.5, fontFamily: colors.font,
    border: `1px solid ${VIOLETA}`, borderRadius: 5, outline: "none", background: "#fff", color: colors.ink };
  const subProyectados = matriz.proyectados.sub;
  const numeroDe = id => {
    const k = escritos.findIndex(x => x.id === id);
    return k < 0 ? "" : `P-${String(k + 1).padStart(2, "0")}`;
  };
  const seccionProyectados = (
    <Fragment key="proyectados">
      <tr style={{ background: "#EDE9FE", borderTop: `2px solid ${VIOLETA}` }}>
        <td colSpan={4} style={{ ...td, fontWeight: 700, fontSize: 11, color: colors.ink, letterSpacing: 0.2 }}>
          RUBROS PROYECTADOS · sin cotizar y sin orden de cambio
          <span style={{ marginLeft: 8, fontSize: 9.5, fontWeight: 700, borderRadius: 9, padding: "1px 6px", color: VIOLETA, background: "#fff" }}>ESTIMADO</span>
          <div style={{ fontWeight: 400, fontSize: 10.5, color: colors.inkSoft, marginTop: 2, lineHeight: 1.45, maxWidth: 560 }}>
            Lo que todavía no está en el contrato ni en ninguna orden de cambio, pero ya se sabe que viene. Escribí acá qué es,
            cuánto y a cuánto lo estimás, sin IVA: suma solo al proyectado
            {matriz.honorariosPct > 0 ? `, con su ${matriz.honorariosPct} % de honorarios en el rubro de honorarios` : ""}.
          </div>
        </td>
        <td colSpan={12} style={{ ...td, ...borde }} />
        <td style={{ ...td, ...borde }} />
        <td style={{ ...td, ...num, fontWeight: 700, fontSize: 11 }}><Mov v={subProyectados.manual} color={VIOLETA} /></td>
        <td style={{ ...td, ...borde }} />
        <td style={{ ...td, ...num, fontWeight: 700, fontSize: 11, color: colors.inkSoft }}>{subProyectados.proyectado ? fmt(subProyectados.proyectado) : ""}</td>
      </tr>
      {nuevos.map(x => {
        const cantidad = Number(x.cantidad) || 0;
        const total = Math.round(cantidad * (Number(x.precio) || 0) * 100) / 100;
        return (
          <tr key={x.id} style={{ borderTop: `1px solid ${colors.neutralSoft}`, background: "#F5F3FF" }}>
            <td style={{ ...td, color: colors.muted, whiteSpace: "nowrap" }}>{numeroDe(x.id)}</td>
            <td style={{ ...td, minWidth: 220 }}>
              <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                <input value={x.descripcion} autoFocus={x.id === recien}
                  onChange={e => cambiarNuevo(x.id, "descripcion", e.target.value)}
                  placeholder="Qué es: letrero de fachada, cortinas, señalética…" style={campoDeMatriz} />
                <button onClick={() => quitarNuevo(x.id)} title="Quitar este rubro"
                  style={{ background: "none", border: "none", cursor: "pointer", color: colors.muted, display: "flex", padding: 0 }}>
                  <X size={14} />
                </button>
              </div>
            </td>
            <td style={td}>
              <input value={x.unidad} onChange={e => cambiarNuevo(x.id, "unidad", e.target.value)} placeholder="und"
                title="Unidad: u, m2, glb…" style={{ ...campoDeMatriz, width: 48, textAlign: "center" }} />
            </td>
            <td style={{ ...td, ...num }}>
              <input type="number" step="any" value={x.precio} onChange={e => cambiarNuevo(x.id, "precio", e.target.value)}
                placeholder="precio" title="Precio unitario estimado, sin IVA" style={{ ...campoDeMatriz, width: 78, textAlign: "right" }} />
            </td>
            <td colSpan={12} style={{ ...td, ...borde }} />
            <td style={{ ...td, ...num, ...borde }}>
              <input type="number" step="any" value={x.cantidad} onChange={e => cambiarNuevo(x.id, "cantidad", e.target.value)}
                placeholder="cant" title="Cantidad" style={{ ...campoDeMatriz, width: 62, textAlign: "right" }} />
            </td>
            <td style={{ ...td, ...num }}>
              {total ? <Mov v={total} color={VIOLETA} /> : <span style={{ fontSize: 10, color: colors.warning }}>falta el precio</span>}
            </td>
            <td style={{ ...td, ...num, ...borde }}>{cantidad ? fmt(cantidad) : ""}</td>
            <td style={{ ...td, ...num, fontWeight: 600 }}>{total ? fmt(total) : ""}</td>
          </tr>
        );
      })}
      <tr style={{ background: "#F5F3FF" }}>
        <td colSpan={20} style={{ ...td, padding: "8px 6px" }}>
          <button onClick={agregarNuevo}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", background: VIOLETA, color: "#fff",
              border: "none", borderRadius: 6, padding: "5px 12px", fontFamily: colors.font, fontSize: 12, fontWeight: 600 }}>
            <Plus size={13} /> Agregar un rubro
          </button>
          <span style={{ marginLeft: 10, fontSize: 11, color: colors.inkSoft }}>
            {nuevos.length
              ? "Se guardan solos y salen en el PDF y el Excel. Cuando uno pase a una orden de cambio o al presupuesto, quitalo de acá con la ✕ para que no se cuente dos veces."
              : "Todavía no agregaste ninguno."}
          </span>
          <span style={{ marginLeft: 10 }}>{estadoDelGuardado}</span>
        </td>
      </tr>
    </Fragment>
  );

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
        {tarjeta("PRESUPUESTO BASE", t.base, colors.ink, con("base"))}
        {tarjeta(`ÓRDENES APROBADAS · ${matriz.ordenesAprobadas.cuantas}`, t.aprobado, t.aprobado < 0 ? colors.danger : colors.ink, con("aprobado"))}
        {tarjeta("VIGENTE", t.vigente, colors.brand, con("vigente"))}
        {tarjeta(`POR APROBAR · ${matriz.porAprobar.length}`, t.porAprobar, colors.warning, con("porAprobar"))}
        {matriz.ajuste.hay && tarjeta("AJUSTE A MANO", t.manual, VIOLETA, con("manual"))}
        {tarjeta("PROYECTADO", t.proyectado, colors.inkSoft, con("proyectado"))}
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
          control: es una proyección, y se guarda sola. */}
      <div style={{ ...caja, borderLeft: `3px solid ${VIOLETA}` }}>
        <div style={{ fontSize: 12, color: colors.inkSoft, lineHeight: 1.55 }}>
          <strong style={{ color: colors.ink }}>Proyectar a mano.</strong> En la columna <strong style={{ color: VIOLETA }}>AJUSTE</strong> de
          cada rubro escribí cuánta cantidad sumás o restás: <strong>5</strong> para aumentar, <strong>−5</strong> para reducir, o
          «quitar» para sacar el rubro entero. Va al precio del contrato. Y lo que todavía no está en ninguna orden ni se
          cotizó se agrega abajo, como rubro nuevo, con una estimación.
          {matriz.honorariosPct > 0
            ? <> Los honorarios se ajustan solos, con el {matriz.honorariosPct} % del contrato, en su rubro.</>
            : <> Esta obra no tiene honorarios cargados en el contrato, así que el ajuste no mueve ninguno.</>}
          {" "}No toca el contrato ni el control de obra.
        </div>
        {matriz.ajuste.hay && (
          <div style={{ fontSize: 12, color: colors.ink, marginTop: 6 }}>
            El ajuste suma <strong style={{ color: matriz.ajuste.neto < 0 ? colors.danger : VIOLETA }}>{plata(matriz.ajuste.neto)}</strong> en rubros
            {matriz.ajuste.cuantosNuevos > 0 && matriz.ajuste.enNuevos !== 0 && (
              <> ({plata(matriz.ajuste.enNuevos)} {matriz.ajuste.cuantosNuevos === 1 ? "del rubro nuevo" : `de los ${matriz.ajuste.cuantosNuevos} rubros nuevos`}
                {matriz.ajuste.enRubros !== 0 && <> y {plata(matriz.ajuste.enRubros)} de cantidades del contrato</>})</>
            )}
            {matriz.ajuste.honorarios !== 0 && <> y <strong style={{ color: matriz.ajuste.honorarios < 0 ? colors.danger : VIOLETA }}>{plata(matriz.ajuste.honorarios)}</strong> en honorarios</>}
            : <strong>{plata(matriz.ajuste.total)}</strong> sin IVA, {plata(matriz.totalesConIva.manual)} con IVA.
          </div>
        )}
        {/* ── LO QUE TODAVÍA NO ES NI UNA ORDEN ──────────────────────────
            Un trabajo que se sabe que viene: no está en el contrato, no se
            cotizó y no tiene orden de cambio, pero ya mueve el número que el
            cliente quiere ver. Se escribe AL FINAL DE LA MATRIZ, en su bloque;
            este botón agrega el renglón y lleva hasta ahí. */}
        <div style={{ marginTop: 10, paddingTop: 9, borderTop: `1px dashed ${colors.border}`, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 260, fontSize: 12, color: colors.inkSoft, lineHeight: 1.55 }}>
            <strong style={{ color: colors.ink }}>Rubros nuevos, todavía sin cotizar.</strong> Lo que no está en el contrato ni en
            ninguna orden de cambio pero ya se sabe que viene se escribe <strong>al final de la matriz</strong>, en el bloque
            violeta «Rubros proyectados»: qué es, cuánto y a cuánto lo estimás.
            {nuevos.length > 0 && <> Hay {nuevos.length === 1 ? "uno escrito" : `${nuevos.length} escritos`}.</>}
          </div>
          <button onClick={agregarNuevo}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", background: VIOLETA, color: "#fff",
              border: "none", borderRadius: 6, padding: "6px 12px", fontFamily: colors.font, fontSize: 12, fontWeight: 600 }}>
            <Plus size={13} /> Agregar un rubro nuevo
          </button>
        </div>

        <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap", marginTop: 9 }}>
          {simulaciones.length > 0 && (
            <select value={simulacion?.id || ""} onChange={e => abrir(e.target.value)} title="Qué proyección está abierta"
              style={{ ...inputStyle, padding: "5px 8px", fontSize: 12, width: "auto", maxWidth: 260 }}>
              {simulaciones.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}
              <option value="">＋ Otra proyección, en blanco</option>
            </select>
          )}
          <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre de la proyección (opcional)"
            style={{ ...inputStyle, padding: "5px 8px", fontSize: 12, width: 230 }} />
          {estadoDelGuardado}
          {simulacion && (
            <Button variant="outline" size="sm" disabled={!!ocupado || hayQueGuardar} onClick={duplicar}>
              {ocupado === "duplicar" ? "Copiando…" : "Hacer una copia"}
            </Button>
          )}
          {hayAjustes && (
            <button onClick={() => { if (window.confirm("¿Sacar todos los ajustes y los rubros proyectados de esta proyección?")) { setAjustes({}); setNuevos([]); } }}
              style={{ background: "none", border: "none", cursor: "pointer", fontFamily: colors.font, fontSize: 11.5,
                color: colors.muted, textDecoration: "underline" }}>
              limpiar los ajustes
            </button>
          )}
          {simulacion && (
            <button onClick={borrar} title="Borrar esta proyección"
              style={{ background: "none", border: "none", cursor: "pointer", color: colors.danger, display: "flex" }}>
              <Trash2 size={13} />
            </button>
          )}
        </div>
        {sinTabla && (
          <div style={{ fontSize: 11.5, color: colors.warning, marginTop: 7, lineHeight: 1.5 }}>
            Para guardar la proyección falta correr la migración 169. Mientras tanto podés ajustar y bajar el PDF o el
            Excel, pero al salir de esta pantalla los ajustes se pierden.
          </div>
        )}
      </div>

      {/* LA LIQUIDACIÓN. Cómo se cobra la obra, cuánto va medido y cuánto se
          liquida hoy. Lo ejecutado se escribe abajo, en la matriz, al lado del
          vigente de cada rubro. */}
      <div className="barra-de-liquidacion" style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd,
        padding: "10px 12px", marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <strong style={{ fontSize: 12.5, color: VERDE }}>Liquidación</strong>
          <label style={{ fontSize: 11.5, color: colors.inkSoft, display: "inline-flex", alignItems: "center", gap: 6 }}>
            El contrato es
            <select aria-label="Cómo se cobra el contrato" value={modalidad} disabled={sinEjecutado}
              onChange={e => cambiarModalidad(e.target.value)} style={{ ...inputStyle, padding: "4px 8px", fontSize: 12, width: "auto" }}>
              {Object.entries(MODALIDADES).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
            </select>
          </label>
          <span style={{ fontSize: 11.5, color: colors.muted }}>{MODALIDADES[modalidad].dice}</span>
          <span role="status" className="guardado-de-ejecutado"
            style={{ fontSize: 11, marginLeft: "auto", color: guardadoEj.estado === "error" ? colors.danger : colors.muted }}>
            {guardadoEj.estado === "guardando" ? "Guardando…"
              : guardadoEj.estado === "guardado" ? `Guardado ${guardadoEj.hora?.toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" }) || ""}`
              : guardadoEj.estado === "error" ? guardadoEj.error : ""}
          </span>
        </div>
        {sinEjecutado ? (
          <div style={{ fontSize: 11.5, color: colors.warning, marginTop: 6, lineHeight: 1.5 }}>
            Para cargar lo ejecutado y armar la liquidación falta correr la migración 179 en Supabase.
          </div>
        ) : (
          <div style={{ fontSize: 12, color: colors.inkSoft, marginTop: 6, lineHeight: 1.55 }}>
            Escribí lo ejecutado de cada rubro en la columna <strong style={{ color: VERDE }}>EJECUTADO</strong>, al lado del vigente.
            El que no tenga cantidad todavía no se midió y se liquida por lo vigente.
            {" "}Van {liq.totales.medidos} de {liq.totales.medidos + liq.totales.sinMedir} medidos.
            {" "}<strong style={{ color: colors.ink }}>A liquidar hoy: {plata(liq.totales.liquidacion)}</strong> sin IVA, {plata(liq.totales.conIva)} con IVA
            {liq.totales.diferencia !== 0 && (
              <> — <strong style={{ color: liq.totales.diferencia < 0 ? colors.danger : VERDE }}>{plata(liq.totales.diferencia)}</strong> contra el vigente
                {liq.totales.honorarios !== 0 && <>, {plata(liq.totales.honorarios)} de eso en honorarios</>}</>
            )}.
          </div>
        )}
      </div>

      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1500 }}>
          <thead>
            <tr style={{ background: colors.bg }}>
              <th colSpan={4} style={th} />
              <th colSpan={2} style={{ ...th, ...borde, textAlign: "center", color: colors.ink }}>PRESUPUESTO BASE</th>
              <th colSpan={3} style={{ ...th, ...borde, textAlign: "center", color: colors.ink }}>ÓRDENES APROBADAS</th>
              <th colSpan={2} style={{ ...th, ...borde, textAlign: "center", color: colors.brand }}>VIGENTE</th>
              <th colSpan={2} style={{ ...th, ...borde, textAlign: "center", color: VERDE }}>EJECUTADO · LIQUIDACIÓN</th>
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
              <th style={{ ...th, ...num, ...borde, color: VERDE }}>CANT</th><th style={{ ...th, ...num, color: VERDE }}>SE LIQUIDA</th>
              <th style={{ ...th, ...num, ...borde }}>± CANT</th><th style={{ ...th, ...num }}>± TOTAL</th><th style={th}>ORDEN</th>
              <th style={{ ...th, ...num, ...borde }}>± CANT</th><th style={{ ...th, ...num }}>± TOTAL</th>
              <th style={{ ...th, ...num, ...borde }}>CANT</th><th style={{ ...th, ...num }}>TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {filasDeLaTabla.map((r, i) => {
              if (r.tipo === "proyectados") return seccionProyectados;
              if (r.tipo === "capitulo" || r.tipo === "bloque") {
                const e = { ...td, ...num, fontWeight: 700, fontSize: 11, color: colors.inkSoft };
                return (
                  <tr key={`c${i}`} style={{ background: colors.neutralSoft }}>
                    <td colSpan={4} style={{ ...td, fontWeight: 700, fontSize: 11, color: colors.ink, letterSpacing: 0.2 }}>
                      {r.nombre}
                      {r.tipo === "bloque" && (
                        <span style={{ marginLeft: 8, fontSize: 9.5, fontWeight: 700, borderRadius: 9, padding: "1px 6px",
                          color: r.manual ? VIOLETA : r.estado === "APROBADA" ? colors.success : colors.warning,
                          background: r.manual ? "#EDE9FE" : r.estado === "APROBADA" ? colors.successSoft : colors.warningSoft }}>{r.estado}</span>
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
                    <td style={{ ...e, ...borde }} /><td style={{ ...e, color: VERDE }}>{subsLiq[i] ? fmt(subsLiq[i]) : ""}</td>
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
                    <td style={{ ...e, ...borde }} /><td className="pie-de-liquidacion" style={{ ...e, color: r.fuerte ? VERDE : e.color }}>{plata(piesLiq[indiceDelPie(i)] ?? 0)}</td>
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
              // Lo ejecutado y lo que se liquida de este renglón.
              const clave = claveDe(r);
              const l = liq.porFila[clave];
              const medible = seMide(r) && !sinEjecutado;
              return (
                <tr key={r.id} style={{ borderTop: `1px solid ${colors.neutralSoft}`,
                  background: r.manual.total || r.proyectada ? "#F5F3FF" : movido && !r.deOrden ? "#FFFBEB" : "transparent" }}>
                  <td style={{ ...td, color: colors.muted, whiteSpace: "nowrap" }}>{r.numero}</td>
                  <td style={{ ...td, color: colors.ink, minWidth: 220 }}>
                    {r.descripcion}
                    {r.proyectada && !r.manual.total && (
                      <div style={{ fontSize: 10, color: colors.warning }}>falta el precio: todavía no suma</div>
                    )}
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
                  <td style={{ ...td, ...num, ...borde }}>
                    {medible && (
                      <input type="number" min="0" step="any" aria-label={`Ejecutado de ${r.descripcion}`}
                        value={escritoEj[clave] ?? (ejecutado[clave] ?? "")} placeholder={fmt(r.vigente.cantidad)}
                        onChange={e => setEscritoEj(x => ({ ...x, [clave]: e.target.value }))}
                        onBlur={e => anotar(r, e.target.value)}
                        title="Cantidad ejecutada. Vacío: todavía no se midió y se liquida por lo vigente."
                        style={{ width: 66, padding: "2px 5px", fontSize: 11.5, textAlign: "right", fontFamily: colors.font,
                          border: `1px solid ${ejecutado[clave] != null ? VERDE : colors.border}`, borderRadius: 5, outline: "none", background: "#fff" }} />
                    )}
                  </td>
                  <td className="se-liquida" style={{ ...td, ...num, fontWeight: l?.medida || l?.deltaCobro ? 700 : 400,
                    color: !l ? colors.muted : l.deltaCobro < 0 ? colors.danger : l.deltaCobro > 0 ? VERDE : l.medida ? colors.ink : colors.muted }}>
                    {l && (l.cobra || l.medida) ? fmt(l.cobra) : ""}
                  </td>
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
                    ) : r.proyectada ? <Mov v={r.manual.cantidad} color={VIOLETA} /> : null}
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

      {/* LAS DIFERENCIAS DE CANTIDAD que salen de lo ejecutado: qué le hace
          cada una a lo que se cobra y al beneficio. Las mismas se ven en
          Diferencias. */}
      <DiferenciasDeCantidad liq={liq} />
    </div>
  );
}
