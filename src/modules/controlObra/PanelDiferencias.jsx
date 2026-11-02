import { useState, useEffect, useCallback, useRef } from "react";
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
  enlacesDeAnalisis, DECISIONES, decisionesPara, comoVa, marcarRevisada, anotar, reEmparejar,
  recalcularContra, ponerPrecio, marcarEnOrden, queSaleDe,
} from "./analisisDeDiferencias";
import { sincronizarEficiencias, eficienciaDeLaDiferencia, cargarCostosDeRubros } from "./beneficios";
import { globalMultiplicado, unidadesDistintas } from "./desconfiarDeNova.js";
import { candidatosPara } from "./emparejarRubros.js";
import { compararCotizaciones, comoSeDice as comoSeDiceLaComparacion } from "./compararCotizaciones.js";
import { baseSinIva } from "./contratoDeLaObra";

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
  eficiencia: colors.success,
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
  // SUBIR Y BAJAR DE PRECIO NO SE RESUELVEN EN EL MISMO LADO, y mezclados en
  // un solo grupo el ahorro se lee como un problema y se descarta junto con el
  // resto. Los sobreprecios los busca todo el mundo; las eficiencias no las
  // registra nadie, y son las que dicen si la obra compra bien.
  ["subio_precio", "EL MISMO RUBRO, MÁS CARO DE LO QUE VALE PARA LA OBRA",
    "Cambió el costo, no la cantidad. El precio que firmó el cliente no se mueve: esto va contra nuestro "
    + "margen, y la conversación es con el proveedor. Si se decide cobrárselo igual, hay que ponerle precio."],
  ["bajo_precio", "EL MISMO RUBRO, MÁS BARATO: ES BENEFICIO",
    "Lo cotizan por debajo de lo que vale para la obra. Al cliente no se le cobra ni se le devuelve nada "
    + "—paga el precio que firmó—: esta plata queda a favor del proyecto y se registra en Beneficios."],
];


// CANTIDAD × UNITARIO = TOTAL, QUE ES COMO SE LEE UN RENGLÓN DE OBRA.
//
// El panel mostraba solo el total de cada diferencia, y con un total no se
// puede discutir nada: $660 puede ser un precio malo con la cantidad bien o un
// precio bien con la cantidad inflada, y son dos reclamos distintos —uno es con
// el proveedor y el otro con quien midió—. Los tres números juntos contestan
// cuál de las dos cosas pasó, y la columna alineada deja comparar las filas de
// un vistazo en vez de dividir de cabeza.
//
// Y CADA FILA DICE EN QUÉ BASE ESTÁ. El unitario del contrato es un PRECIO al
// cliente y el de la propuesta es un COSTO nuestro: puestos en la misma columna
// sin decirlo, la diferencia entre los dos parece un hallazgo cuando es el
// margen. Esa confusión ya costó una vez.
function Cuenta({ que, cantidad, unidad, unitario, total, color, base, fuerte }) {
  const col = { fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", textAlign: "right" };
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "baseline", fontSize: 11,
      color: color || colors.inkSoft, lineHeight: 1.7 }}>
      <span style={{ width: 86, fontSize: 9.5, letterSpacing: 0.3, color: colors.muted,
        textTransform: "uppercase", flexShrink: 0 }}>{que}</span>
      <span style={{ ...col, width: 82 }}>
        {cantidad != null ? `${fmt(cantidad)} ${unidad || ""}`.trim() : "—"}
      </span>
      <span style={{ ...col, width: 88, color: colors.muted }}>
        {unitario != null ? `× $${fmt(unitario)}` : ""}
      </span>
      <span style={{ ...col, width: 96, fontWeight: fuerte ? 700 : 400, color: color || colors.ink }}>
        {total != null ? `$${fmt(total)}` : ""}
      </span>
      {base && <span style={{ fontSize: 9.5, color: colors.muted }}>{base}</span>}
    </div>
  );
}


// EL PRESUPUESTO AL LADO, QUE ES CONTRA LO QUE SE DECIDE.
//
// Cada diferencia ya mostraba el rubro con el que calzó, y eso alcanza para
// mirar un renglón pero no para decidirlo. La pregunta que se hace uno en cada
// línea es la otra: "¿esto no estará cubierto por algún otro rubro del
// contrato?" —y para contestarla hay que leer el capítulo entero, que vive en
// otra pestaña, con cincuenta renglones abiertos y la decisión a medio tomar.
// Nadie cambia de pestaña cincuenta veces: lo que se hace es decidir sin mirar,
// y así es como se le cobra al cliente algo que ya había pagado.
//
// Entonces el presupuesto se abre acá, con buscador, y sirve para dos cosas:
// leerlo mientras se decide, y señalar el rubro correcto cuando NOVA emparejó
// mal o cuando hay que decir EN CUÁL rubro ya estaba incluido.
// El unitario del rubro SIN IVA, que es la base en la que cotiza el proveedor:
// el del control lleva el impuesto adentro y compararlos de frente se lleva
// quince puntos.
const unitario = r => (Number(r.cantidad) ? baseSinIva(r) / Number(r.cantidad) : 0);

function Presupuesto({ rubros, busca, onBusca, eligiendo, onElegir, onCerrar }) {
  const texto = busca.trim().toLowerCase();
  const filtrados = texto
    ? rubros.filter(r => `${r.numero ?? ""} ${r.descripcion || ""} ${r.capitulo || ""}`.toLowerCase().includes(texto))
    : rubros;
  const porCapitulo = [];
  for (const r of filtrados) {
    const cap = r.capitulo || "SIN CAPÍTULO";
    const ya = porCapitulo.find(x => x.capitulo === cap);
    if (ya) ya.rubros.push(r); else porCapitulo.push({ capitulo: cap, rubros: [r] });
  }
  return (
    // VIAJA CON EL QUE LEE, Y NO CON `sticky`.
    //
    // El presupuesto se abre para mirarlo MIENTRAS se decide cada diferencia, y
    // una lista de cincuenta renglones se scrollea entera: un panel que se
    // queda arriba sirve para los tres primeros y después es una columna vacía
    // al costado.
    //
    // Con `position: sticky` no alcanzaba. El contenedor de la aplicación tiene
    // `overflow-y: auto` pero crece con su contenido, así que nunca scrollea él
    // —scrollea la ventana—: para el navegador ese es igual el contenedor de
    // referencia del sticky, y un sticky anclado a algo que no se mueve no se
    // mueve nunca. Dos horas de CSS para descubrir que el culpable estaba tres
    // archivos más arriba.
    //
    // Entonces no se pega a nada: la que scrollea es la columna de las
    // diferencias, acá adentro, y esta se queda quieta al lado porque nunca se
    // fue a ningún lado.
    <div style={{ width: 320, flexShrink: 0, border: `1px solid ${colors.border}`,
      borderRadius: colors.radiusMd, background: colors.surface, alignSelf: "stretch",
      display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
      <div style={{ padding: "9px 11px", borderBottom: `1px solid ${colors.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.3, flex: 1 }}>
            EL PRESUPUESTO · {rubros.length} RUBROS · SIN IVA
          </span>
          <button onClick={onCerrar}
            style={{ background: "none", border: "none", cursor: "pointer", fontFamily: colors.font,
              fontSize: 11, color: colors.brand }}>ocultar</button>
        </div>
        {/* ELEGIR EL RUBRO CORRECTO, que es la mitad del trabajo: NOVA empareja
            por descripción y "pintura de fibrocemento" calza con tres. */}
        {eligiendo && (
          <div style={{ fontSize: 11, color: colors.brand, fontWeight: 600, marginTop: 4, lineHeight: 1.4 }}>
            {eligiendo.paraPrecio
              ? `Elegí el rubro cuyo precio querés cobrar por «${String(eligiendo.descripcion || "").slice(0, 40)}»`
              : `Elegí contra qué rubro se compara «${String(eligiendo.descripcion || "").slice(0, 44)}»`}
          </div>
        )}
        <input value={busca} onChange={e => onBusca(e.target.value)} placeholder="Buscar por número o descripción…"
          style={{ width: "100%", marginTop: 5, padding: "5px 8px", fontSize: 11.5, fontFamily: colors.font,
            border: `1px solid ${colors.border}`, borderRadius: colors.radiusSm, outline: "none" }} />
      </div>
      <div style={{ overflowY: "auto", padding: "4px 0" }}>
        {!filtrados.length && (
          <div style={{ padding: "10px 11px", fontSize: 11, color: colors.muted }}>
            Ningún rubro del contrato dice eso.
          </div>
        )}
        {porCapitulo.map(c => (
          <div key={c.capitulo}>
            <div style={{ padding: "5px 11px 2px", fontSize: 9.5, fontWeight: 700, color: colors.muted,
              letterSpacing: 0.3, background: colors.bg }}>
              {c.capitulo}
            </div>
            {c.rubros.map(r => (
              <div key={r.id}
                onClick={eligiendo ? () => onElegir(r) : undefined}
                style={{ padding: "4px 11px", fontSize: 11, lineHeight: 1.45, color: colors.inkSoft,
                  cursor: eligiendo ? "pointer" : "default",
                  borderBottom: `1px solid ${colors.neutralSoft}` }}>
                <div style={{ display: "flex", gap: 6 }}>
                  <span style={{ color: colors.muted, minWidth: 30 }}>{r.numero ?? ""}</span>
                  <span style={{ flex: 1 }}>{r.descripcion}</span>
                </div>
              {/* CANTIDAD × UNITARIO = TOTAL, que es contra lo que se compara.
                  Con el total solo no se puede decidir nada: la proforma trae
                  un unitario y una cantidad, y la pregunta es si ese unitario
                  es mejor o peor que el del contrato. El total de un rubro de
                  cien metros no se parece a nada de lo que dice el papel. */}
                <div style={{ display: "flex", gap: 6, color: colors.muted, fontSize: 10,
                  fontVariantNumeric: "tabular-nums" }}>
                  <span style={{ minWidth: 30 }} />
                  <span>{fmt(r.cantidad)} {r.unidad || ""}</span>
                  <span>× ${fmt(unitario(r))}</span>
                  <span style={{ flex: 1, textAlign: "right", color: colors.inkSoft }}>
                    ${fmt(baseSinIva(r))}
                  </span>
                </div>
                {Number(r.costo_unitario) > 0 && (
                  <div style={{ display: "flex", gap: 6, color: colors.muted, fontSize: 10,
                    fontVariantNumeric: "tabular-nums" }}>
                    <span style={{ minWidth: 30 }} />
                    <span style={{ flex: 1 }}>costo cargado</span>
                    <span>× ${fmt(r.costo_unitario)}</span>
                    <span style={{ minWidth: 60, textAlign: "right" }}>
                      ${fmt(Number(r.costo_unitario) * Number(r.cantidad))}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

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
  // Qué se está mirando: todas, las que nadie abrió, las sin decidir, las anotadas.
  const [filtro, setFiltro] = useState("todas");
  // EL PRESUPUESTO AL LADO, que es contra lo que se decide cada diferencia.
  // `eligiendo` es la línea que está buscando otro rubro.
  const [verPresupuesto, setVerPresupuesto] = useState(false);
  const [buscaRubro, setBuscaRubro] = useState("");
  const [eligiendo, setEligiendo] = useState(null);
  // Lo que NOVA leyó, esperando que alguien mire los emparejamientos.
  const [revisando, setRevisando] = useState(null);
  // Contra qué se compara: el contrato de la obra, o una segunda cotización.
  const [modo, setModo] = useState("contrato");
  const [segunda, setSegunda] = useState(null);
  // EL ALTO SE MIDE, NO SE ADIVINA.
  //
  // "100vh menos ciento cincuenta" es una cuenta que depende de cuánto hay
  // arriba —el encabezado, las pestañas, el título del análisis, los avisos— y
  // eso cambia con cada obra y con cada aviso que aparece. Cuando sobra, el
  // panel queda cortado abajo; cuando falta, la página entera vuelve a
  // scrollear y el presupuesto se va para arriba.
  //
  // Se mide dónde empieza la columna y se usa lo que queda hasta el borde de
  // la pantalla. Al cambiar el tamaño de la ventana se vuelve a medir.
  const cajaRef = useRef(null);
  const [alto, setAlto] = useState(0);
  useEffect(() => {
    if (!verPresupuesto) { setAlto(0); return undefined; }
    const medir = () => {
      const t = cajaRef.current?.getBoundingClientRect().top ?? 0;
      setAlto(Math.max(320, Math.round(window.innerHeight - t - 14)));
    };
    medir();
    window.addEventListener("resize", medir);
    const t = setTimeout(medir, 120);   // después de que se dibuje lo de arriba
    return () => { window.removeEventListener("resize", medir); clearTimeout(t); };
  }, [verPresupuesto, abierto, lineas.length, aviso, error]);

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
    // El descuento ofrecido y lo ya decidido se sincronizan al abrir: si solo
    // se escribieran al cambiar una decisión, un análisis que se lee y se
    // cierra dejaría su descuento sin llegar nunca a Beneficios.
    pasarLasEficiencias(r.lineas || [], a);
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
      // NADA SE COMPARA ANTES DE QUE ALGUIEN MIRE LOS EMPAREJAMIENTOS.
      //
      // De qué rubro es cada renglón es la decisión de la que cuelga todo lo
      // demás, y es la única que la máquina no puede garantizar: un
      // emparejamiento equivocado produce números con la misma cara que los
      // buenos. Antes se guardaba de una y el error aparecía tres pantallas
      // después, convertido en "este renglón deja veintinueve mil dólares".
      //
      // Se muestran los dos textos —el del papel y el del contrato— y se
      // aceptan uno por uno. Es un minuto de trabajo contra una orden de
      // cambio mal cobrada.
      setLeyendo("");
      if (modo === "cotizaciones") {
        // La primera espera a la segunda: comparar dos papeles no pasa por el
        // emparejamiento con rubros, son renglones contra renglones.
        if (!segunda) { setSegunda({ ...r, file }); setAviso(
          `Leída la cotización de ${r.proveedor || file.name}: ${r.items.length} renglones. `
          + "Subí la segunda y las comparo."); return; }
        await compararDosPapeles(segunda, { ...r, file });
        return;
      }
      setRevisando({ ...r, file, items: r.items.map(x => ({ ...x, visto: false })) });
      return;
    } catch (err) { setError(err.message); }
    setLeyendo("");
  }

  /**
   * DOS COTIZACIONES, UNA CONTRA LA OTRA.
   *
   * No pasa por el emparejamiento con rubros —no hay contrato en el medio—:
   * son renglones contra renglones, y lo que se busca es quién es más barato
   * en qué y, sobre todo, qué cotiza uno que el otro no.
   */
  async function compararDosPapeles(a, b) {
    setLeyendo("comparando"); setError(""); setAviso("");
    try {
      const g = await guardarAnalisis({
        obraId: obra.id, modo: "cotizaciones",
        titulo: `${a.proveedor || a.file?.name} vs ${b.proveedor || b.file?.name}`,
        proveedor: a.proveedor || "", archivo: a.archivo || a.file,
        items: a.items, iva: a.iva, descuento: a.descuento,
        b: { items: b.items, proveedor: b.proveedor || "", descuento: b.descuento, archivo: b.archivo || b.file },
        lineas: [], quien: currentUser,
      });
      if (g.error) throw new Error(g.error);
      setSegunda(null);
      await cargar();
      await abrir(g.analisis);
      const c = compararCotizaciones(
        { proveedor: a.proveedor, items: a.items, descuento: a.descuento },
        { proveedor: b.proveedor, items: b.items, descuento: b.descuento });
      setAviso(comoSeDiceLaComparacion(c) || "Quedó guardada la comparación.");
    } catch (err) { setError(err.message); }
    setLeyendo("");
  }

  /** Ya miré los emparejamientos: ahora sí, comparar y guardar. */
  async function comparar(rev) {
    setLeyendo("comparando"); setError(""); setAviso("");
    try {
      const r = rev;
      const file = rev.file;
      const h = loQueNoEstaPresupuestado(compararContraPresupuesto(r.items, vivos));
      const g = await guardarAnalisis({
        obraId: obra.id, titulo: file.name, proveedor: r.proveedor || "",
        archivo: r.archivo || file, items: r.items, iva: r.iva, descuento: r.descuento,
        lineas: [...h.todo, ...h.menos].map(x => ({
          descripcion: x.descripcion, unidad: x.unidad, cantidad: x.cantidad,
          monto: x.costo, obra_rubro_id: x.rubro_id || null, hallazgo: x.hallazgo,
          textoPapel: x.textoPapel, unidadPapel: x.unidadPapel, cantidadPapel: x.cantidadPapel,
          montoPapel: x.montoPapel,
        })),
        quien: currentUser,
      });
      if (g.error) throw new Error(g.error);
      setRevisando(null);
      await cargar();
      await abrir(g.analisis);
      // EL DESCUENTO DEL PIE, DICHO. Es plata nuestra y es de lo primero que
      // hay que saber de una proforma: va entero a Beneficios, sin repartir,
      // porque lo que hace falta es acordarse de pedirlo cuando llegue la
      // factura a precio de lista.
      const dto = Number(r.descuento) || 0;
      // UNA PROFORMA QUE SOLO TRAE PRECIOS MÁS BAJOS NO ES "sin diferencias".
      // `cuantos` cuenta lo que hay que COBRARLE al cliente, y una baja de
      // precio no se le cobra: decir que no hay nada sería tapar justo las
      // eficiencias, que son las que nadie registra.
      const hayAlgo = h.cuantos || h.menos.length || h.bajaron?.length;
      setAviso((hayAlgo
        ? `${comoSeDice(h)}. Quedó guardado: podés salir y volver.`
        : "Todo lo que trae está en el contrato, con las mismas cantidades y a los mismos precios.")
        + (dto ? ` · La proforma ofrece $${fmt(dto)} de descuento especial: está anotado aparte, `
          + "para acordarse de pedirlo cuando llegue la factura." : "")
        + (r.porQueDudosos ? ` · ${r.porQueDudosos}` : ""));
    } catch (err) { setError(err.message); }
    setLeyendo("");
  }

  /**
   * EL COSTO DEL RUBRO SE CARGA DESDE ACÁ.
   *
   * Un rubro sin costo no se puede juzgar —el precio que tiene es el de VENTA,
   * y contra ese todo proveedor parece barato— y hasta ahora la única forma de
   * cargarlo era abrir el presupuesto y escribirlo a mano, rubro por rubro.
   * Nadie hace eso ciento setenta veces, y por eso Beneficios estaba vacío.
   *
   * El dato está acá: NOVA acaba de leerlo y el renglón ya está emparejado con
   * su rubro. Se carga el unitario de la propuesta, y solo en los que NO tienen
   * costo: el que ya tenía uno no se toca, porque ese es justamente el que
   * sirve para comparar.
   */
  async function cargarLosCostos() {
    const candidatos = lineas.filter(l => {
      if (!l.obra_rubro_id || !Number(l.cantidad)) return false;
      const rub = vivos.find(x => x.id === l.obra_rubro_id);
      return rub && (rub.costo_unitario === null || rub.costo_unitario === undefined || rub.costo_unitario === "");
    });
    if (!candidatos.length) { setAviso("Todos los rubros emparejados ya tienen costo cargado."); return; }
    if (!window.confirm(`¿Cargar el costo de ${candidatos.length} `
      + `${candidatos.length === 1 ? "rubro" : "rubros"} con el unitario de esta propuesta?\n\n`
      + "A los que ya tienen costo no se los toca. Después se puede corregir rubro por rubro.")) return;
    setOcupado(true);
    const r = await cargarCostosDeRubros(candidatos.map(l => ({
      id: l.obra_rubro_id,
      costo_unitario: Math.round((Number(l.monto) || 0) / Number(l.cantidad) * 10000) / 10000,
    })));
    setOcupado(false);
    if (r.error) { setError(r.error); return; }
    setAviso(`Quedó cargado el costo de ${r.cuantos} ${r.cuantos === 1 ? "rubro" : "rubros"}. `
      + "Beneficios ya puede medir si se compró mejor o peor que lo presupuestado.");
    setSinCosto(0);
    onCambio?.();
  }

  /**
   * EL PRECIO DE LO NUEVO. A mano, o el de un rubro parecido del contrato.
   *
   * Si el cliente aceptó $12 el metro de resane, el resane del otro ambiente va
   * a $12 —no a costo más veinte— y la orden se defiende sola: ese precio ya lo
   * había aceptado.
   */
  async function fijarPrecio(linea, precio, deRubro = null) {
    setLineas(xs => xs.map(x => (x.id === linea.id
      ? { ...x, precio_unitario: Number(precio) > 0 ? Number(precio) : null, precio_de_rubro: deRubro }
      : x)));
    setEligiendo(null);
    const err = await ponerPrecio(linea.id, precio, deRubro);
    if (err) setError(err);
  }

  /** Esta diferencia se compara contra otro rubro del contrato. */
  async function usarRubro(linea, rubro) {
    // Y SE REHACE LA CUENTA CONTRA EL RUBRO NUEVO. Mismo rubro a otro precio es
    // una diferencia de precio —y si bajó, un beneficio—; otra cantidad vuelve
    // a ser una diferencia de cantidad, que es lo que va a la orden de cambio.
    const re = recalcularContra(linea, rubro, rubro && Number(rubro.cantidad)
      ? baseSinIva(rubro) / Number(rubro.cantidad) : 0);
    const campos = re
      ? { obra_rubro_id: rubro?.id || null, hallazgo: re.hallazgo, cantidad: re.cantidad, monto: re.monto }
      : { obra_rubro_id: rubro?.id || null };
    const frescas = lineas.map(x => (x.id === linea.id ? { ...x, ...campos } : x));
    setLineas(frescas);
    setEligiendo(null);
    const err = await reEmparejar(linea.id, rubro?.id || null, re);
    if (err) { setError(err); return; }
    if (!re && rubro) {
      setAviso(`Contra el rubro ${rubro.numero ?? ""} ese renglón calza: misma cantidad y mismo precio. `
        + "No es una diferencia.");
    }
    await pasarLasEficiencias(frescas);
  }

  /** Ya la miré, aunque todavía no la decida. */
  async function revisar(l) {
    const revisada = !l.revisado_at;
    setLineas(xs => xs.map(x => (x.id === l.id
      ? { ...x, revisado_at: revisada ? new Date().toISOString() : null,
        revisado_nombre: revisada ? (currentUser?.name || null) : null }
      : x)));
    const err = await marcarRevisada(l.id, revisada, currentUser);
    if (err) setError(err);
  }

  /**
   * LO QUE SE ANOTA SE GUARDA SOLO, al salir del campo.
   *
   * Un botón de guardar por renglón son cincuenta botones, y una nota que se
   * pierde al cambiar de pestaña no la escribe nadie dos veces.
   */
  async function guardarNota(l, texto) {
    if (String(texto || "").trim() === String(l.nota || "").trim()) return;
    setLineas(xs => xs.map(x => (x.id === l.id ? { ...x, nota: texto } : x)));
    const err = await anotar(l.id, texto);
    if (err) setError(err);
  }

  async function marcar(l, decision) {
    // LA NOTA YA NO SE PIDE EN UNA VENTANITA. Se escribe en el renglón, en
    // cualquier momento y con cualquier decisión: un prompt que aparece al
    // marcar se contesta con un enter para sacárselo de encima, y lo que
    // quedaba escrito era "x". El campo está abajo, a la vista, y se guarda
    // solo.
    const nota = undefined;
    setOcupado(true);
    const err = await decidir(l.id, decision, nota, currentUser);
    setOcupado(false);
    if (err) { setError(err); return; }
    const frescas = lineas.map(x => (x.id === l.id
      ? { ...x, decision, decidido_nombre: currentUser?.name || null,
        decidido_at: new Date().toISOString(), revisado_at: x.revisado_at || new Date().toISOString() }
      : x));
    setLineas(frescas);
    await pasarLasEficiencias(frescas);
  }

  /**
   * LO QUE QUEDÓ A FAVOR SE VA A BENEFICIOS, no se queda marcado acá.
   *
   * Marcar un ahorro en este panel y que no llegue a Beneficios es igual que no
   * marcarlo: Beneficios es lo que se mira para decidir dónde se puede gastar
   * más. Se reescriben todas las de este análisis cada vez —no se agregan—, así
   * cambiar o deshacer una decisión no deja un beneficio fantasma sumando.
   */
  async function pasarLasEficiencias(frescas, cual = null) {
    const an = cual || abierto;
    if (!an) return;
    // LO QUE LLEGA A BENEFICIOS SON DOS COSAS, medidas contra varas distintas:
    //
    //   · la eficiencia de precio, contra el COSTO cargado del rubro;
    //   · lo que se paga con la plata de un rubro ya contratado, contra el
    //     PRECIO de ese rubro sin IVA —el cliente ya lo pagó al firmarlo, así
    //     que lo que sobre entre ese precio y lo que costó es del proyecto.
    //
    // Lo segundo necesita saber de qué rubro sale: sin rubro señalado no hay
    // base contra la cual medir, y entonces no se inventa un beneficio.
    // LO QUE CUESTA MENOS DE LO QUE SE COBRA YA ES BENEFICIO, sin que nadie lo
    // marque.
    //
    // Sobre la cantidad que el cliente YA tiene contratada, el beneficio existe
    // desde que se sabe el costo: no depende de ninguna orden ni de ninguna
    // aprobación —esa plata ya está vendida y ya se sabe lo que cuesta—. Pedir
    // un clic para registrarlo es garantizar que la mitad no se registre, y las
    // eficiencias son justamente las que nadie anota.
    //
    // Entra como PREVISTO, porque hasta que llegue la factura sigue siendo una
    // cotización. Y lo de las cantidades de MÁS no entra acá: eso va a la orden
    // de cambio y su margen llega a Beneficios el día que el cliente la aprueba.
    const filas = [
      // EL DESCUENTO OFRECIDO, COMO BENEFICIO Y ENTERO. No se reparte entre los
      // renglones: es un trato con el proveedor y se mira entero, porque lo que
      // hace falta es acordarse de pedirlo cuando llegue la factura a precio de
      // lista. Entra como previsto hasta que esa factura lo traiga.
      ...(Number(an.descuento) > 0 ? [{
        descripcion: `Descuento especial ofrecido${an.proveedor ? ` por ${an.proveedor}` : ""}`,
        cantidad: 1, unidad: "glb",
        presupuestado: Number(an.descuento), real: 0,
        proveedor: an.proveedor || null, obra_rubro_id: null,
        nota: `Lo ofrece la proforma al pie${an.titulo ? ` · ${an.titulo}` : ""}`
          + " · hay que pedirlo cuando llegue la factura",
      }] : []),
      ...frescas.filter(x => x.hallazgo === "bajo_precio" || x.decision === "eficiencia")
        .filter(x => x.decision !== "incluido" && x.decision !== "nuestro")
        .map(x => eficienciaDeLaDiferencia(x, vivos.find(r => r.id === x.obra_rubro_id), an, "costo")),
      ...frescas.filter(x => x.decision === "nuestro" && x.obra_rubro_id)
        .map(x => eficienciaDeLaDiferencia(x, vivos.find(r => r.id === x.obra_rubro_id), an, "precio"))
        .filter(x => x.presupuestado > 0),
    ];
    const r = await sincronizarEficiencias(an.obra_id, an.id, filas);
    if (r.error) { setError(r.error); return; }
    if (filas.length) onCambio?.();
  }

  /** El grupo entero para el mismo lado: casi siempre lo es, y lo que se revisa son las excepciones. */
  async function marcarTodas(cuales, decision) {
    // COBRAR EN BLOQUE LO QUE NO CALZÓ ES COBRAR DOS VECES.
    //
    // En "no está en el contrato" caen los renglones que no encontraron rubro,
    // y algunos no lo encontraron porque nadie los buscó. Marcarlos todos como
    // "se cobra" le factura al cliente trabajo que ya había pagado, y eso no se
    // descubre hasta que lo descubre él.
    const conCandidato = decision === "cobrar"
      ? cuales.filter(l => !l.obra_rubro_id && candidatosPara(
        { descripcion: l.texto_papel || l.descripcion, unidad: l.unidad_papel || l.unidad }, vivos, 1).length)
      : [];
    if (!window.confirm(`¿Marcar ${cuales.length} diferencias como «${DECISIONES[decision]?.label}»?\n\n`
      + (conCandidato.length
        ? `OJO: ${conCandidato.length} de esas no tienen rubro y hay rubros parecidos en el presupuesto. `
          + "Si alguna ya estaba contratada, se la estarías cobrando dos veces. "
          + "Abajo de cada una están los candidatos a un clic.\n\n"
        : "")
      + "Cada una se puede cambiar después, una por una.")) return;
    setOcupado(true);
    for (const l of cuales) {
      const err = await decidir(l.id, decision, null, currentUser);
      if (err) { setOcupado(false); setError(err); return; }
    }
    setOcupado(false);
    const ids = new Set(cuales.map(x => x.id));
    const frescas = lineas.map(x => (ids.has(x.id)
      ? { ...x, decision, decidido_nombre: currentUser?.name || null,
        decidido_at: new Date().toISOString(), revisado_at: x.revisado_at || new Date().toISOString() }
      : x));
    setLineas(frescas);
    await pasarLasEficiencias(frescas);
  }

  async function armarLaOrden() {
    // LO QUE YA SALIÓ NO VUELVE A SALIR, y lo que queda sigue vivo.
    //
    // Una proforma de treinta renglones no se resuelve en una sola orden: se
    // manda lo eléctrico porque el cliente lo necesita el lunes, y la
    // albañilería sale la semana que viene. Antes armar la orden cerraba el
    // análisis entero y los que quedaban se volvían de lectura.
    const van = lineas.filter(l => l.decision === "cobrar" && !l.orden_cambio_id);
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
    const err = await marcarEnOrden(van.map(l => l.id), r.orden.id);
    if (err) { setOcupado(false); setError(err); return; }
    setLineas(xs => xs.map(x => (van.some(v => v.id === x.id) ? { ...x, orden_cambio_id: r.orden.id } : x)));
    setOcupado(false);
    await cargar();
    const quedan = lineas.filter(l => l.decision === "pendiente").length;
    setAviso(`Quedó armada la ${r.orden.codigo || `OC-${r.orden.numero}`} con ${puestas.length} `
      + `${puestas.length === 1 ? "partida" : "partidas"}, en borrador. Revisá los precios antes de mandarla.`
      + (quedan ? ` El análisis sigue abierto: quedan ${quedan} renglones por decidir, y con esos se arma `
        + "la orden siguiente." : ""));
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
    // EL PRECIO, EN ORDEN: el que firmó el cliente si el rubro está contratado;
    // si no, el que se eligió a mano o se tomó de un rubro parecido; y recién
    // si no hay ninguno, costo más el porcentaje de la caja de abajo.
    const dePrecio = l.hallazgo !== "subio_precio" && l.hallazgo !== "bajo_precio";
    const puRubro = !dePrecio ? null
      : rubro && Number(rubro.cantidad)
        ? Math.round((Number(rubro.total_base) / Number(rubro.cantidad)) * 10000) / 10000
        : Number(l.precio_unitario) > 0 ? Number(l.precio_unitario) : null;
    return {
      descripcion: l.descripcion, unidad: l.unidad || "u", cantidad: cant,
      costo: Number(l.monto) || 0, costoUnitario,
      precioUnitario: puRubro, rubro_id: l.obra_rubro_id || null,
      rubro_codigo: rubro ? String(rubro.numero ?? rubro.codigo ?? "") : "",
    };
  }

  const caja = { background: colors.surface, border: `1px solid ${colors.border}`,
    borderRadius: colors.radiusMd, padding: "11px 13px", marginBottom: 10 };

  // ── LOS EMPAREJAMIENTOS, ANTES DE COMPARAR NADA ──────────────────────────
  //
  // Lo que NOVA leyó del papel, renglón por renglón, con el rubro que propone
  // al lado. Se acepta o se cambia, y recién entonces se compara: de esta
  // decisión cuelga todo lo demás, y es la única que la máquina no puede
  // garantizar sola.
  if (revisando) {
    const items = revisando.items || [];
    const conRubro = items.filter(x => x.rubro_id).length;
    const sinVer = items.filter(x => x.rubro_id && !x.visto).length;
    const cambiar = (i, campos) => setRevisando(v => ({
      ...v, items: v.items.map((x, k) => (k === i ? { ...x, ...campos } : x)),
    }));
    return (
      <div ref={cajaRef} style={{ fontFamily: colors.font, display: "flex", gap: 12,
        alignItems: verPresupuesto ? "stretch" : "flex-start",
        ...(verPresupuesto && alto ? { height: alto, overflow: "hidden" } : {}) }}>
        <div style={{ flex: 1, minWidth: 0, ...(verPresupuesto ? { overflowY: "auto", paddingRight: 4 } : {}) }}>
          <button onClick={() => { setRevisando(null); setEligiendo(null); }}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: colors.font,
              fontSize: 12, color: colors.brand, marginBottom: 8 }}>
            ← Descartar esta lectura
          </button>
          <div style={{ fontSize: 13, fontWeight: 700, color: colors.ink }}>
            Qué está emparejando NOVA{revisando.proveedor ? ` · ${revisando.proveedor}` : ""}
          </div>
          <div style={{ fontSize: 11.5, color: colors.muted, marginBottom: 10, lineHeight: 1.5, maxWidth: 760 }}>
            {items.length} renglones leídos del papel ·{" "}
            {items.filter(x => x.porTexto).length > 0 && (
              <><strong>{items.filter(x => x.porTexto).length}</strong> calzaron por texto exacto —esos no
              pueden estar mal—, </>
            )}
            {items.filter(x => x.porParecido).length > 0 && (
              <><strong>{items.filter(x => x.porParecido).length}</strong> se parecen mucho y conviene
              mirarlos, y </>
            )}
            <strong>{items.filter(x => x.rubro_id && !x.porTexto && !x.porParecido).length}</strong>{" "}
            {items.filter(x => x.rubro_id && !x.porTexto && !x.porParecido).length === 1
              ? "lo propuso" : "los propuso"} NOVA entre los cinco rubros más parecidos.
            {" "}<strong>Nada se compara hasta que mires esto.</strong> De qué rubro es cada renglón es la
            decisión de la que cuelga todo lo demás, y un emparejamiento equivocado produce números con la
            misma cara que los buenos. Lo que quede sin rubro se trata como trabajo nuevo, que es lo correcto
            cuando el contrato no lo cubre.
          </div>

          <div style={{ display: "flex", gap: 7, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
            {!verPresupuesto && (
              <Button variant="outline" size="sm" onClick={() => setVerPresupuesto(true)}>
                Ver el presupuesto al lado
              </Button>
            )}
            <Button variant="primary" size="sm" disabled={!!leyendo}
              onClick={() => comparar({ ...revisando, items: items.map(({ visto, ...x }) => x) })}>
              <Check size={13} /> {leyendo ? "Comparando…" : "Aceptar y comparar con el contrato"}
            </Button>
            {sinVer > 0 && (
              <span style={{ fontSize: 11, color: colors.warning }}>
                {sinVer} {sinVer === 1 ? "emparejamiento sin mirar" : "emparejamientos sin mirar"}
              </span>
            )}
          </div>

          {items.map((x, i) => {
            const r = vivos.find(v => Number(v.id) === Number(x.rubro_id));
            const raro = r && (unidadesDistintas(x, r) || globalMultiplicado(x, r));
            return (
              <div key={i} style={{ ...caja, marginBottom: 6, padding: "8px 10px",
                borderLeft: `3px solid ${raro ? colors.danger : x.visto ? colors.success
                  : r ? colors.border : colors.neutralSoft}` }}>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <div style={{ fontSize: 12, color: colors.ink, lineHeight: 1.4 }}>{x.descripcion}</div>
                    <div style={{ fontSize: 10.5, color: colors.muted, fontVariantNumeric: "tabular-nums" }}>
                      {fmt(x.cantidad)} {x.unidad || ""} · ${fmt(x.monto)}
                    </div>
                    {/* EL RUBRO PROPUESTO, CON SUS PROPIOS NÚMEROS: es contra
                        esto que se va a comparar, y la unidad sola ya dice si
                        están hablando de lo mismo. */}
                    {r ? (
                      <div style={{ fontSize: 11, color: raro ? colors.danger : colors.inkSoft, marginTop: 3,
                        lineHeight: 1.45 }}>
                        <span style={{ color: x.porTexto ? colors.success
                          : x.porParecido ? colors.warning : colors.muted }}>
                          {x.porTexto ? "mismo texto que el rubro "
                            : x.porParecido ? "se parece al rubro " : "contra el rubro "}
                        </span>
                        <strong>{r.numero ?? ""} {String(r.descripcion || "").slice(0, 70)}</strong>
                        <span style={{ color: colors.muted }}>
                          {" "}· {fmt(r.cantidad)} {r.unidad || ""} × ${fmt(unitario(r))}
                        </span>
                        {/* LO QUE VA A SALIR DE ACEPTARLO. Emparejar no es solo
                            decir "es ese rubro": es decidir si la orden va a ser
                            de más o de menos, y eso tiene que verse antes de
                            aceptar, no tres pantallas después. */}
                        <div style={{ fontWeight: 600, color: colors.ink, marginTop: 1 }}>
                          {fmt(r.cantidad)} contratadas · {fmt(x.cantidad)} en el papel →{" "}
                          {queSaleDe({ cantidad_papel: x.cantidad, monto_papel: x.monto }, r,
                            Number(r.cantidad) ? baseSinIva(r) / Number(r.cantidad) : 0)}
                        </div>
                        {raro && <div style={{ fontWeight: 700 }}>
                          {unidadesDistintas(x, r)
                            ? `El papel lo cobra por ${x.unidad} y el rubro está contratado por ${r.unidad}.`
                            : `El rubro es un global de ${fmt(r.cantidad)} ${r.unidad || ""} y el renglón trae ${fmt(x.cantidad)}.`}
                        </div>}
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, color: colors.muted, marginTop: 3 }}>
                        sin rubro · va a entrar como trabajo nuevo
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                    {r && (
                      <button onClick={() => cambiar(i, { visto: !x.visto })}
                        style={{ border: `1px solid ${x.visto ? colors.success : colors.border}`,
                          background: x.visto ? colors.success : "#fff", color: x.visto ? "#fff" : colors.muted,
                          borderRadius: 20, padding: "3px 11px", fontSize: 11, cursor: "pointer",
                          fontFamily: colors.font, fontWeight: x.visto ? 700 : 400 }}>
                        {x.visto ? "✓ aceptado" : "aceptar"}
                      </button>
                    )}
                    {r && (
                      <button onClick={() => cambiar(i, { rubro_id: null, visto: false })}
                        style={{ background: "none", border: "none", cursor: "pointer", fontFamily: colors.font,
                          fontSize: 11, color: colors.danger, textDecoration: "underline" }}>
                        quitar
                      </button>
                    )}
                    <button onClick={() => { setVerPresupuesto(true); setEligiendo({ indice: i, descripcion: x.descripcion }); }}
                      style={{ background: "none", border: "none", cursor: "pointer", fontFamily: colors.font,
                        fontSize: 11, color: eligiendo?.indice === i ? colors.brand : colors.muted,
                        fontWeight: eligiendo?.indice === i ? 700 : 400, textDecoration: "underline" }}>
                      {eligiendo?.indice === i ? "elegí el rubro →" : r ? "otro rubro" : "buscarle rubro"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {verPresupuesto && (
          <Presupuesto rubros={vivos} busca={buscaRubro} onBusca={setBuscaRubro}
            eligiendo={eligiendo} onCerrar={() => { setVerPresupuesto(false); setEligiendo(null); }}
            onElegir={rb => { cambiar(eligiendo.indice, { rubro_id: rb.id, visto: true }); setEligiendo(null); }} />
        )}
      </div>
    );
  }

  // ── DOS COTIZACIONES, UNA AL LADO DE LA OTRA ─────────────────────────────
  //
  // Elegir por el total es casi siempre elegir mal: el que da el número más
  // bajo suele ser el que dejó tres renglones afuera, y esos tres aparecen en
  // obra como adicionales. Lo que decide es renglón por renglón.
  if (abierto && abierto.modo === "cotizaciones") {
    const c = compararCotizaciones(
      { proveedor: abierto.proveedor, items: abierto.items || [], descuento: abierto.descuento },
      { proveedor: abierto.proveedor_b, items: abierto.items_b || [], descuento: abierto.descuento_b });
    const col = { fontVariantNumeric: "tabular-nums", textAlign: "right", whiteSpace: "nowrap" };
    return (
      <div style={{ fontFamily: colors.font }}>
        <button onClick={() => { setAbierto(null); cargar(); }}
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: colors.font,
            fontSize: 12, color: colors.brand, marginBottom: 8 }}>
          ← Diferencias
        </button>
        <div style={{ fontSize: 13, fontWeight: 700, color: colors.ink }}>
          {c.proveedorA} contra {c.proveedorB}
        </div>
        <div style={{ fontSize: 11.5, color: colors.inkSoft, marginBottom: 10, lineHeight: 1.5, maxWidth: 820 }}>
          {comoSeDiceLaComparacion(c)}
        </div>

        <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginBottom: 10 }}>
          <div style={{ ...caja, marginBottom: 0 }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: colors.muted, letterSpacing: 0.3 }}>
              {String(c.proveedorA).toUpperCase()}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: colors.ink }}>${fmt(c.totalA)}</div>
            <div style={{ fontSize: 10, color: colors.muted }}>
              {(abierto.items || []).length} renglones · gana en {c.cuantosGanaA}
            </div>
          </div>
          <div style={{ ...caja, marginBottom: 0 }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: colors.muted, letterSpacing: 0.3 }}>
              {String(c.proveedorB).toUpperCase()}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: colors.ink }}>${fmt(c.totalB)}</div>
            <div style={{ fontSize: 10, color: colors.muted }}>
              {(abierto.items_b || []).length} renglones · gana en {c.cuantosGanaB}
            </div>
          </div>
          {/* LO MEJOR DE CADA UNO: rara vez se puede contratar así, pero es la
              vara con la que se negocia. "El otro me lo deja en tanto" es una
              frase que vale plata y necesita el número. */}
          <div style={{ ...caja, marginBottom: 0, borderLeft: `3px solid ${colors.success}` }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: colors.muted, letterSpacing: 0.3 }}>
              LO MEJOR DE CADA UNO
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: colors.success }}>${fmt(c.loMejor)}</div>
            <div style={{ fontSize: 10, color: colors.muted }}>comprándole a cada uno lo suyo</div>
          </div>
        </div>

        {/* LO QUE EL TOTAL ESCONDE, primero: el más barato puede serlo por no
            cotizar algo, y eso aparece en obra como adicional. */}
        {(c.soloA.length > 0 || c.soloB.length > 0) && (
          <div style={{ ...caja, borderLeft: `3px solid ${colors.warning}`, fontSize: 11.5, lineHeight: 1.55 }}>
            <strong>Lo que uno cotiza y el otro no</strong> — es lo que el total esconde, y lo que después
            aparece en obra como adicional.
            {[[c.soloA, c.proveedorA, c.montoSoloA], [c.soloB, c.proveedorB, c.montoSoloB]]
              .filter(([l]) => l.length).map(([lista, quien, monto]) => (
                <div key={quien} style={{ marginTop: 4 }}>
                  <strong>Solo {quien}</strong> · {lista.length} {lista.length === 1 ? "renglón" : "renglones"}
                  {" "}· ${fmt(monto)}
                  {lista.map((f, i) => (
                    <div key={i} style={{ color: colors.muted, fontSize: 11 }}>
                      · {f.descripcion} — {fmt(f.cantidadA ?? f.cantidadB)} {f.unidad}{" "}
                      ${fmt(f.montoA ?? f.montoB)}
                    </div>
                  ))}
                </div>
              ))}
          </div>
        )}

        <div style={{ fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.3, margin: "10px 0 4px" }}>
          RENGLÓN POR RENGLÓN · {c.emparejados} que cotizan los dos
        </div>
        <div style={{ display: "flex", gap: 8, fontSize: 9.5, fontWeight: 700, color: colors.muted,
          padding: "0 10px 3px" }}>
          <span style={{ flex: 1 }}>QUÉ</span>
          <span style={{ ...col, width: 110 }}>{String(c.proveedorA).slice(0, 12)}</span>
          <span style={{ ...col, width: 110 }}>{String(c.proveedorB).slice(0, 12)}</span>
          <span style={{ ...col, width: 90 }}>DIFERENCIA</span>
        </div>
        {c.filas.filter(f => !f.solo).map((f, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 11.5,
            padding: "5px 10px", borderBottom: `1px solid ${colors.neutralSoft}`,
            background: colors.surface }}>
            <span style={{ flex: 1, color: colors.ink }}>
              {f.descripcion}
              {f.distintaCantidad && (
                <span style={{ color: colors.warning, fontSize: 10 }}>
                  {" "}· cotizan cantidades distintas: {fmt(f.cantidadA)} y {fmt(f.cantidadB)} {f.unidad}
                </span>
              )}
            </span>
            <span style={{ ...col, width: 110, color: f.difUnitario < 0 ? colors.success : colors.inkSoft,
              fontWeight: f.difUnitario < 0 ? 700 : 400 }}>
              {fmt(f.cantidadA)} × ${fmt(f.unitarioA)}
            </span>
            <span style={{ ...col, width: 110, color: f.difUnitario > 0 ? colors.success : colors.inkSoft,
              fontWeight: f.difUnitario > 0 ? 700 : 400 }}>
              {fmt(f.cantidadB)} × ${fmt(f.unitarioB)}
            </span>
            <span style={{ ...col, width: 90, fontWeight: 700,
              color: f.aFavorDeB > 0 ? colors.success : f.aFavorDeB < 0 ? colors.danger : colors.muted }}>
              {f.aFavorDeB ? `${f.aFavorDeB > 0 ? "+" : "−"}$${fmt(Math.abs(f.aFavorDeB))}` : "="}
            </span>
          </div>
        ))}
        <div style={{ fontSize: 10.5, color: colors.muted, marginTop: 6, lineHeight: 1.5, maxWidth: 820 }}>
          La diferencia se mide por UNITARIO y sobre la cantidad que los dos cotizan: si uno cotiza 100 metros
          y el otro 120, los totales no se pueden comparar y el barato parece caro. Esto no elige por vos —quién
          cumple, quién tiene el material y quién factura no está en el papel—: dice en qué se diferencian.
        </div>
      </div>
    );
  }

  // ── UN ANÁLISIS ABIERTO ───────────────────────────────────────────────────
  if (abierto) {
    const porDecidir = lineas.filter(l => l.decision === "pendiente").length;
    const aCobrar = lineas.filter(l => l.decision === "cobrar");
    const va = comoVa(lineas);
    // POR DÓNDE VOY. Cincuenta renglones no se miran de una sentada, y lo que
    // hace falta al volver es saber dónde se quedó uno, no cuántos faltan.
    const pasa = l => (filtro === "todas" ? true
      : filtro === "sinMirar" ? !l.revisado_at && l.decision === "pendiente"
      : filtro === "pendientes" ? l.decision === "pendiente"
      : filtro === "anotadas" ? !!String(l.nota || "").trim()
      : true);
    const FILTROS = [
      ["todas", `Todas · ${lineas.length}`],
      ["sinMirar", `Sin mirar · ${va.sinMirar}`],
      ["pendientes", `Sin decidir · ${va.sinDecidir}`],
      ["anotadas", `Con nota · ${va.anotadas}`],
    ];
    return (
      <div ref={cajaRef} style={{ fontFamily: colors.font, display: "flex", gap: 12,
        alignItems: verPresupuesto ? "stretch" : "flex-start",
        ...(verPresupuesto && alto ? { height: alto, overflow: "hidden" } : {}) }}>
      <div style={{ flex: 1, minWidth: 0, ...(verPresupuesto
        ? { overflowY: "auto", paddingRight: 4 } : {}) }}>
        <button onClick={() => { setAbierto(null); cargar(); }}
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: colors.font,
            fontSize: 12, color: colors.brand, marginBottom: 8 }}>
          ← Diferencias
        </button>
        <div style={{ fontSize: 13, fontWeight: 700, color: colors.ink }}>
          {abierto.titulo || "Propuesta"}{abierto.proveedor ? ` · ${abierto.proveedor}` : ""}
        </div>
        <div style={{ fontSize: 11.5, color: colors.muted, marginBottom: 10 }}>
          {lineas.length} {lineas.length === 1 ? "diferencia" : "diferencias"} · {va.revisadas} revisadas
          {va.miradasSinDecidir > 0 && <> · {va.miradasSinDecidir} miradas y dejadas pendientes</>}
          {porDecidir > 0 && <> · {porDecidir} sin decidir</>}
          {Number(abierto.descuento) > 0 && (
            <> · <strong style={{ color: colors.success }}>
              ${fmt(abierto.descuento)} de descuento ofrecido</strong>, hay que pedirlo al facturar</>
          )}
          {enlaces[abierto.id] && <> · <a href={enlaces[abierto.id]} target="_blank" rel="noreferrer"
            style={{ color: colors.brand }}>ver el papel</a></>}
          {abierto.estado === "resuelto" && <> · <strong style={{ color: colors.success }}>ya se armó su orden</strong></>}
        </div>

        {/* EL PAPEL. Cincuenta y un renglones no se deciden en una pantalla:
            se imprimen, se miran en el escritorio con el presupuesto al lado,
            se marcan a mano y se discuten en una reunión — o se le mandan al
            residente para que diga cuáles ya estaban incluidas. */}
        <div style={{ display: "flex", gap: 7, marginBottom: 10, flexWrap: "wrap" }}>
          {/* EL PRESUPUESTO, A MANO MIENTRAS SE DECIDE. La pregunta de cada
              renglón es "¿esto no estará cubierto por otro rubro?", y hasta
              ahora contestarla era cambiar de pestaña con la decisión a medio
              tomar. Nadie lo hace cincuenta veces: se decide sin mirar. */}
          {!verPresupuesto && (
            <Button variant="outline" size="sm" onClick={() => setVerPresupuesto(true)}>
              Ver el presupuesto al lado
            </Button>
          )}
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
        {/* LA BARRA DE LO REVISADO. Es la respuesta a "¿dónde me quedé?", que
            es la pregunta con la que uno vuelve a un análisis de cincuenta
            renglones al día siguiente. */}
        {lineas.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ height: 5, background: colors.neutralSoft, borderRadius: 3, overflow: "hidden" }}>
              <div style={{ width: `${Math.round((va.revisadas / lineas.length) * 100)}%`, height: "100%",
                background: va.revisadas === lineas.length ? colors.success : colors.brand }} />
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 7 }}>
              {FILTROS.map(([k, texto]) => (
                <button key={k} onClick={() => setFiltro(k)}
                  style={{ border: `1px solid ${filtro === k ? colors.brand : colors.border}`,
                    background: filtro === k ? colors.brand : "#fff",
                    color: filtro === k ? "#fff" : colors.muted,
                    borderRadius: 20, padding: "3px 11px", fontSize: 11, cursor: "pointer",
                    fontFamily: colors.font, fontWeight: filtro === k ? 700 : 400 }}>
                  {texto}
                </button>
              ))}
              {va.sinMirar > 0 && filtro !== "sinMirar" && (
                <span style={{ fontSize: 10.5, color: colors.muted, alignSelf: "center" }}>
                  Tildá cada renglón a medida que lo mirás: lo revisado no se pierde al salir.
                </span>
              )}
            </div>
          </div>
        )}

        {GRUPOS.map(([clave, titulo, pista]) => {
          // EL TOTAL DEL GRUPO ES EL DEL GRUPO, no el de lo que se está
          // mirando: un filtro que además cambia los montos deja de ser un
          // filtro y pasa a ser otra cuenta.
          const delGrupo = lineas.filter(l => l.hallazgo === clave);
          if (!delGrupo.length) return null;
          const suyas = delGrupo.filter(pasa);
          const suma = delGrupo.reduce((t, l) => t + (Number(l.monto) || 0), 0);
          const sinDecidir = suyas.filter(l => l.decision === "pendiente");
          return (
            <div key={clave} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", gap: 9, alignItems: "baseline", flexWrap: "wrap", marginBottom: 2 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: colors.ink, letterSpacing: 0.3 }}>
                  {titulo} · {delGrupo.length} · ${fmt(suma)}
                  {suyas.length !== delGrupo.length && (
                    <span style={{ fontWeight: 400, color: colors.muted }}>
                      {" "}· se muestran {suyas.length}
                    </span>
                  )}
                </div>
                {/* CINCUENTA DECISIONES DE A UNA NO LAS TOMA NADIE. Casi
                    siempre el grupo entero va para el mismo lado, y lo que se
                    revisa son las tres excepciones. */}
                {sinDecidir.length > 1 && (
                  <button onClick={() => marcarTodas(sinDecidir, clave === "bajo_precio" ? "eficiencia" : "cobrar")}
                    disabled={ocupado}
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: colors.font,
                      fontSize: 11, color: colors.brand, textDecoration: "underline" }}>
                    {clave === "bajo_precio" ? "son eficiencia" : "se cobran"}{" "}
                    {sinDecidir.length === delGrupo.length ? "todas" : `las ${sinDecidir.length} sin decidir`}
                  </button>
                )}
              </div>
              {/* La pista genérica sobra donde ya hay una frase con la plata y
                  con quién hay que hablar: dos textos que dicen lo mismo se
                  dejan de leer los dos. */}
              {clave !== "subio_precio" && clave !== "bajo_precio" && (
                <div style={{ fontSize: 10.5, color: colors.muted, marginBottom: 6 }}>{pista}</div>
              )}
              {/* CON QUIÉN ES LA CONVERSACIÓN, Y CUÁNTA PLATA HAY EN JUEGO.
                  Un sobreprecio sin el nombre del proveedor y sin el total no
                  se reclama: se mira, se cierra la pantalla y se paga. */}
              {clave === "subio_precio" && (
                <div style={{ fontSize: 11, color: colors.danger, marginBottom: 6, fontWeight: 600 }}>
                  Hay ${fmt(suma)} en juego y la conversación es con
                  {" "}{abierto.proveedor || "el proveedor"}: el precio que firmó el cliente no se mueve,
                  así que esto sale de nuestro margen.
                </div>
              )}
              {clave === "bajo_precio" && (
                <div style={{ fontSize: 11, color: colors.success, marginBottom: 6, fontWeight: 600 }}>
                  ${fmt(suma)} quedan a favor del proyecto y <strong>ya están en Beneficios</strong> como
                  previsto: sobre la cantidad que el cliente ya tiene contratada, el beneficio existe desde
                  que se sabe el costo. Se confirman cuando llegue la factura. No van en la orden de cambio:
                  al cliente no se le cobra un adicional por haber comprado bien.
                </div>
              )}

              {suyas.map(l => {
                const rubro = vivos.find(r => r.id === l.obra_rubro_id);
                const deOrden = rubro?.origen === "orden_cambio";
                // EL CONTRATO SE MUESTRA SIN IVA, porque el costo de la
                // propuesta viene sin IVA. El rubro del control lo tiene
                // adentro —$16,70 son $14,52 más IVA— y puestos los dos
                // unitarios en la misma columna, la distancia entre ellos se
                // lee como margen cuando quince de esos puntos son del fisco.
                const base = rubro ? baseSinIva(rubro) : null;
                const puRubro = rubro && Number(rubro.cantidad) ? base / Number(rubro.cantidad) : null;
                // Lo que dejaría esta diferencia si el cliente la aprueba: se
                // cobra al precio del contrato y cuesta lo que dice la
                // propuesta. Es MARGEN —se vendió así el día que se firmó—, no
                // una eficiencia, y todavía es previsto: sin orden aprobada no
                // se cobra nada.
                const puPropuesta = Number(l.cantidad) ? Number(l.monto) / Number(l.cantidad) : null;
                const dejaria = (l.hallazgo === "mas_cantidad" || l.hallazgo === "nuevo")
                  && puRubro != null && puPropuesta != null && puRubro > puPropuesta
                  ? (puRubro - puPropuesta) * Number(l.cantidad) : null;
                const revisada = !!l.revisado_at;
                // LO QUE QUEDÓ GUARDADO MAL TAMBIÉN SE DENUNCIA. El análisis
                // se leyó una vez y vive en la base: si el emparejamiento no
                // se sostiene, no alcanza con haberlo arreglado para las
                // próximas lecturas —hay que decirlo acá, que es donde alguien
                // está por decidir contra ese número.
                // Se mira el texto DEL PAPEL, no el de la tarjeta: la tarjeta
                // usa el nombre del rubro a propósito en las diferencias de
                // precio y de cantidad, así que compararla con el rubro daría
                // siempre que sí.
                // Se miran los NÚMEROS, no las palabras: en una obra cuyo
                // presupuesto se armó con la cotización vieja de este mismo
                // proveedor, el texto idéntico es la firma de un acierto.
                const dudoso = rubro && !!l.texto_papel
                  && (unidadesDistintas({ unidad: l.unidad_papel }, rubro)
                    || globalMultiplicado({ cantidad: l.cantidad_papel }, rubro));
                return (
                  <div key={l.id} style={{ ...caja, marginBottom: 6, padding: "9px 11px",
                    opacity: revisada && l.decision === "pendiente" ? 0.85 : 1,
                    borderLeft: `3px solid ${COLOR_DECISION[l.decision] || colors.border}` }}>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
                      {/* EL CHECK DE "YA LA MIRÉ", lo primero del renglón.
                          Revisar y decidir no son lo mismo: hay renglones que
                          se miran, se entienden y se dejan pendientes a
                          propósito, y hasta ahora se veían igual que los que
                          nadie abrió. Volver al día siguiente obligaba a
                          empezar desde arriba. */}
                      <button onClick={() => revisar(l)} disabled={ocupado}
                        title={revisada
                          ? `Revisada${l.revisado_nombre ? ` por ${l.revisado_nombre}` : ""} · marcar como sin revisar`
                          : "Marcar como ya revisada"}
                        style={{ width: 20, height: 20, flexShrink: 0, marginTop: 1, cursor: "pointer",
                          borderRadius: 5, fontFamily: colors.font, fontSize: 12, lineHeight: 1,
                          border: `1.5px solid ${revisada ? colors.success : colors.border}`,
                          background: revisada ? colors.success : "#fff", color: "#fff" }}>
                        {revisada ? "✓" : ""}
                      </button>
                      <div style={{ flex: 1, minWidth: 220 }}>
                        <div style={{ fontSize: 12.5, color: colors.ink }}>{l.descripcion}</div>
                        {/* EL RUBRO DEL CONTRATO, CON SUS NÚMEROS. Es contra
                            esto que se está comparando, y es lo que contesta si
                            la diferencia es real. */}
                        {/* LO QUE DICE LA COTIZACIÓN, con sus palabras.
                            La descripción de arriba usa el nombre del rubro del
                            contrato —es lo correcto: lo que cambió es su precio
                            y no su nombre— y entonces el papel desaparecía de
                            la pantalla: uno leía un texto, lo iba a buscar a la
                            cotización y no estaba. Con los dos a la vista, un
                            emparejamiento equivocado se ve solo: "1 Mes de
                            alquiler" contra "1 glb de instalación" no necesita
                            que nadie explique que ahí hay algo que no cierra. */}
                        {l.texto_papel && l.texto_papel !== l.descripcion && (
                          <div style={{ fontSize: 10.5, color: colors.inkSoft, marginTop: 1, lineHeight: 1.45 }}>
                            <span style={{ color: colors.muted }}>en la cotización: </span>
                            “{l.texto_papel}”
                            {l.cantidad_papel != null && (
                              <span style={{ color: colors.muted }}>
                                {" "}· {fmt(l.cantidad_papel)} {l.unidad_papel || ""}
                              </span>
                            )}
                          </div>
                        )}
                        {rubro ? (
                          <div style={{ fontSize: 10.5, color: colors.muted, marginTop: 1, marginBottom: 3 }}>
                            contra <strong style={{ color: colors.inkSoft }}>{rubro.numero || ""}{" "}
                            {String(rubro.descripcion || "").slice(0, 50)}</strong>
                            {deOrden && <span style={{ color: colors.warning }}> · vino de una orden de cambio</span>}
                          </div>
                        ) : (
                          <div style={{ fontSize: 10.5, color: colors.muted, marginTop: 1, marginBottom: 3 }}>
                            no hay rubro del contrato que lo cubra
                          </div>
                        )}

                        {/* LOS TRES NÚMEROS DE CADA LADO, uno debajo del otro y
                            en columna: así se ve de dónde sale la diferencia sin
                            dividir nada de cabeza. */}
                        {/* LOS TRES RENGLONES SE LEEN IGUAL: cantidad por
                            unitario igual total, en los tres.
                            Antes el del medio mostraba la cantidad DE MÁS y el
                            monto de la diferencia, así que las dos filas de
                            arriba hablaban del trabajo entero y la de abajo de
                            un pedazo: puestas una debajo de otra parecían
                            comparables y no lo eran. Ahora el contrato y el
                            papel se comparan enteros, y la diferencia tiene su
                            propia fila al pie, que es lo que se decide. */}
                        {rubro && (
                          <Cuenta que="contratado" cantidad={rubro.cantidad} unidad={rubro.unidad}
                            unitario={puRubro} total={base} base="precio al cliente, sin IVA" />
                        )}
                        {rubro && Number(rubro.costo_unitario) > 0 && (
                          <Cuenta que="costo cargado" cantidad={rubro.cantidad} unidad={rubro.unidad}
                            unitario={rubro.costo_unitario}
                            total={Number(rubro.costo_unitario) * Number(rubro.cantidad)} base="nuestro costo" />
                        )}
                        {/* EL PAPEL, ENTERO: su cantidad y su unitario, no un pedazo. */}
                        <Cuenta que="la propuesta"
                          cantidad={l.cantidad_papel ?? l.cantidad} unidad={l.unidad_papel || l.unidad}
                          unitario={Number(l.cantidad_papel ?? l.cantidad)
                            ? Number(l.monto_papel ?? l.monto) / Number(l.cantidad_papel ?? l.cantidad) : null}
                          total={l.monto_papel ?? l.monto}
                          base={l.monto_papel == null ? "" : "lo que cotiza el proveedor"} />
                        {/* Y LA DIFERENCIA, que es lo único que se decide. */}
                        <Cuenta
                          que={l.hallazgo === "menos_cantidad" ? "se devuelve"
                            : l.hallazgo === "mas_cantidad" ? "se cobra de más"
                              : l.hallazgo === "nuevo" ? "no está contratado" : "la diferencia"}
                          cantidad={l.cantidad} unidad={l.unidad}
                          unitario={Number(l.cantidad) ? Number(l.monto) / Number(l.cantidad) : null}
                          total={l.monto} fuerte
                          color={l.hallazgo === "bajo_precio" ? colors.success
                            : l.hallazgo === "subio_precio" ? colors.danger : colors.ink}
                          base={l.hallazgo === "subio_precio" || l.hallazgo === "bajo_precio"
                            ? "de precio, sobre la cantidad que los dos tienen"
                            : l.hallazgo === "mas_cantidad"
                              ? `a costo · al cliente se le cobra al precio del contrato${puRubro != null
                                ? `: $${fmt(puRubro * Number(l.cantidad))}` : ""}`
                              : l.hallazgo === "menos_cantidad"
                                ? `al precio del contrato${puRubro != null
                                  ? `: $${fmt(puRubro * Number(l.cantidad))}` : ""}`
                                : "a costo: todavía no tiene precio"} />
                        {deOrden && (
                          <div style={{ fontSize: 10.5, color: colors.warning, marginTop: 2 }}>
                            Mirá que no se esté cobrando dos veces lo mismo.
                          </div>
                        )}
                        {dudoso && (
                          <div style={{ fontSize: 10.5, color: colors.danger, marginTop: 2, lineHeight: 1.45 }}>
                            <strong>Este emparejamiento no se sostiene.</strong>{" "}
                            {unidadesDistintas({ unidad: l.unidad_papel }, rubro)
                              ? `El papel lo cobra por ${l.unidad_papel} y el rubro está contratado por ${rubro.unidad}.`
                              : `El rubro es un global de ${fmt(rubro.cantidad)} ${rubro.unidad || ""} y el renglón `
                                + `trae ${fmt(l.cantidad_papel)}.`}
                            {" "}No decidas contra estos números: señalá el rubro correcto, o volvé a leer la
                            proforma —desde hoy NOVA transcribe el papel sin ver la lista de rubros—.
                          </div>
                        )}
                        {/* EL PRECIO DE LO QUE NO ESTÁ EN EL CONTRATO.
                            Lo que ya tiene rubro se cobra al precio que el
                            cliente firmó y no hay nada que elegir. Lo nuevo no
                            tiene precio acordado, y "costo más veinte por
                            ciento" casi nunca es lo que uno cobraría: un
                            andamio y una instalación eléctrica no llevan el
                            mismo margen. */}
                        {l.hallazgo === "nuevo" && !l.orden_cambio_id && (
                          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap",
                            marginTop: 4, fontSize: 10.5, color: colors.muted }}>
                            <span>precio al cliente</span>
                            <input type="number" step="0.01" defaultValue={l.precio_unitario ?? ""}
                              key={`p${l.id}-${l.precio_unitario ?? ""}`}
                              placeholder="costo + %"
                              onClick={e => e.stopPropagation()}
                              onBlur={e => String(e.target.value) !== String(l.precio_unitario ?? "")
                                && fijarPrecio(l, e.target.value, null)}
                              style={{ ...inputStyle, padding: "2px 6px", fontSize: 11, width: 86, textAlign: "right" }} />
                            <span>por {l.unidad || "u"}</span>
                            <button onClick={() => { setVerPresupuesto(true); setEligiendo({ ...l, paraPrecio: true }); }}
                              style={{ background: "none", border: "none", padding: 0, cursor: "pointer",
                                fontFamily: colors.font, fontSize: 10.5, textDecoration: "underline",
                                color: eligiendo?.id === l.id && eligiendo?.paraPrecio ? colors.brand : colors.muted,
                                fontWeight: eligiendo?.id === l.id && eligiendo?.paraPrecio ? 700 : 400 }}>
                              {eligiendo?.id === l.id && eligiendo?.paraPrecio
                                ? "elegí el rubro cuyo precio querés usar →"
                                : "usar el precio de un rubro del contrato"}
                            </button>
                            {l.precio_de_rubro && (
                              <span style={{ color: colors.success }}>
                                · es el precio del rubro{" "}
                                {vivos.find(r => r.id === l.precio_de_rubro)?.numero ?? l.precio_de_rubro}, que el
                                cliente ya aceptó
                              </span>
                            )}
                            {Number(l.precio_unitario) > 0 && Number(l.cantidad) > 0 && (
                              <span style={{ color: colors.inkSoft }}>
                                · se cobra ${fmt(Number(l.precio_unitario) * Number(l.cantidad))}
                              </span>
                            )}
                          </div>
                        )}
                        {/* LOS CANDIDATOS, A UN CLIC.
                            Un renglón sin rubro está en "no está en el
                            contrato" justamente porque no calzó, y marcar el
                            grupo entero como "se cobra" cobraría dos veces lo
                            que sí estaba contratado y nadie emparejó. Buscar
                            cada uno a mano en una lista de ciento setenta es lo
                            que hace que nadie lo haga: acá están los tres que
                            más se le parecen, con su cantidad y su precio, y
                            aceptarlos es apretar uno. */}
                        {!l.obra_rubro_id && !l.orden_cambio_id && (() => {
                          const cands = candidatosPara(
                            { descripcion: l.texto_papel || l.descripcion, unidad: l.unidad_papel || l.unidad },
                            vivos, 3);
                          if (!cands.length) return null;
                          return (
                            <div style={{ fontSize: 10.5, color: colors.muted, marginTop: 4, lineHeight: 1.7 }}>
                              ¿será alguno de estos?{" "}
                              {cands.map(r => (
                                <button key={r.id} onClick={() => usarRubro(l, r)} disabled={ocupado}
                                  title={`${r.descripcion} · ${fmt(r.cantidad)} ${r.unidad || ""} × $${fmt(unitario(r))}`}
                                  style={{ border: `1px solid ${colors.border}`, background: "#fff",
                                    color: colors.inkSoft, borderRadius: 20, padding: "2px 9px", fontSize: 10.5,
                                    cursor: "pointer", fontFamily: colors.font, marginRight: 4 }}>
                                  {r.numero ?? ""} {String(r.descripcion || "").slice(0, 30)}
                                  {" · "}{fmt(r.cantidad)} {r.unidad || ""} contratadas vs{" "}
                                  {fmt(l.cantidad_papel ?? l.cantidad)} del papel
                                </button>
                              ))}
                            </div>
                          );
                        })()}
                        {/* EL EMPAREJAMIENTO SE CORRIGE A MANO. NOVA acierta
                            casi siempre, pero "pintura de fibrocemento" calza
                            con tres rubros parecidos, y cuando elige el que no
                            es sale mal todo lo que sigue: la cantidad
                            contratada, el precio contra el que se compara y la
                            decisión de si ya estaba incluido. */}
                        {!l.orden_cambio_id && (
                          <button onClick={() => { setVerPresupuesto(true); setEligiendo(l); }}
                            style={{ background: "none", border: "none", padding: 0, marginTop: 2,
                              cursor: "pointer", fontFamily: colors.font, fontSize: 10.5,
                              color: eligiendo?.id === l.id ? colors.brand : colors.muted,
                              fontWeight: eligiendo?.id === l.id ? 700 : 400, textDecoration: "underline" }}>
                            {eligiendo?.id === l.id ? "elegí el rubro en el presupuesto →"
                              : rubro ? "comparar contra otro rubro" : "buscarle un rubro en el presupuesto"}
                          </button>
                        )}
                        {/* ANOTAR, EN CUALQUIER MOMENTO Y CON CUALQUIER
                            DECISIÓN. "El proveedor dice que subió por el
                            dólar", "preguntar si incluye el andamio": eso es
                            lo que convierte una lista de números en una
                            conversación que se puede retomar, y es lo que se
                            lee en la reunión. Se guarda al salir del campo. */}
                        <input defaultValue={l.nota || ""} key={`n${l.id}-${l.nota || ""}`}
                          placeholder="Anotar algo sobre este renglón…"
                          onClick={e => e.stopPropagation()}
                          onBlur={e => guardarNota(l, e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
                          style={{ width: "100%", marginTop: 4, padding: "3px 7px", fontSize: 11,
                            fontFamily: colors.font, color: colors.inkSoft,
                            border: `1px solid ${l.nota ? colors.border : "transparent"}`,
                            background: l.nota ? "#fff" : colors.bg,
                            borderRadius: colors.radiusSm, outline: "none" }} />
                        {dejaria != null && !dudoso && (l.decision === "pendiente" || l.decision === "cobrar") && (
                          <div style={{ fontSize: 10.5, color: colors.inkSoft, marginTop: 3 }}>
                            Si el cliente la aprueba deja <strong style={{ color: colors.success }}>${fmt(dejaria)}</strong>:
                            se cobra a ${fmt(puRubro)} y cuesta ${fmt(puPropuesta)}. Es el margen con el que se vendió
                            el rubro, no una eficiencia — entra a Beneficios como previsto el día que se apruebe la orden.
                          </div>
                        )}
                        {/* LO QUE PASA CON LA PLATA, DICHO EN EL RENGLÓN.
                            "Lo pagamos nosotros" sin decir de dónde sale es
                            una decisión a medias: sale de un rubro del
                            contrato, y lo que ese rubro tenga de más entre su
                            precio y lo que costó queda a favor del proyecto. */}
                        {l.decision === "nuestro" && (
                          <div style={{ fontSize: 10.5, marginTop: 3, lineHeight: 1.5,
                            color: rubro ? colors.success : colors.warning }}>
                            {rubro && puRubro != null
                              ? <>Se hace con la plata del rubro {rubro.numero || ""}, que se vendió en
                                ${fmt(puRubro * Number(l.cantidad))} y cuesta ${fmt(l.monto)}: quedan
                                {" "}<strong>${fmt(puRubro * Number(l.cantidad) - Number(l.monto))}</strong> a
                                favor del proyecto, y ya están en Beneficios. El cliente no aprueba nada.</>
                              : "Falta señalar de qué rubro del contrato sale: sin eso no se sabe contra qué "
                                + "medirlo y no entra a Beneficios."}
                          </div>
                        )}
                        {l.orden_cambio_id && (
                          <div style={{ fontSize: 10.5, color: colors.success, marginTop: 2, fontWeight: 600 }}>
                            Ya salió en una orden de cambio: no vuelve a entrar en la próxima.
                          </div>
                        )}
                        {l.decidido_nombre && (
                          <div style={{ fontSize: 10, color: COLOR_DECISION[l.decision], marginTop: 2, fontWeight: 600 }}>
                            {DECISIONES[l.decision]?.label} · {l.decidido_nombre}
                          </div>
                        )}
                      </div>
                    </div>
                    {!l.orden_cambio_id && (
                      <div style={{ display: "flex", gap: 4, marginTop: 7, flexWrap: "wrap" }}>
                        {decisionesPara(l.hallazgo).map(k => DECISIONES[k] && [k, DECISIONES[k]]).filter(Boolean).map(([k, d]) => (
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
            esos se compararon contra <strong>el precio que vio el cliente</strong>, que es la única vara que
            existe. Ahí lo que se ve es la utilidad —que estaba vendida desde el principio—, no si se compró
            mejor que lo presupuestado. Cargándoles el costo, la próxima propuesta dice las dos cosas.
            {/* Y EL COSTO SE CARGA DE ACÁ, que es donde está el dato.
                Pedirle a alguien que después abra el presupuesto y escriba a
                mano ciento setenta costos es pedirle que no lo haga nunca: el
                número lo acabamos de leer y el rubro ya está emparejado. Con
                eso cargado, Beneficios puede medir solo si la obra compra
                mejor o peor que lo presupuestado. */}
            <div style={{ marginTop: 7 }}>
              <button onClick={cargarLosCostos} disabled={ocupado}
                style={{ background: colors.brand, color: "#fff", border: "none", borderRadius: colors.radiusSm,
                  padding: "6px 11px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: colors.font }}>
                Cargar esos costos a los rubros
              </button>
              <span style={{ fontSize: 10.5, color: colors.muted, marginLeft: 8 }}>
                Toma el precio de esta propuesta como costo del rubro. Desde ahí Beneficios mide solo.
              </span>
            </div>
          </div>
        )}

        {!lineas.length && (
          <div style={{ ...caja, fontSize: 12.5, color: colors.success }}>
            Esta propuesta no trae diferencias contra el contrato vigente.
          </div>
        )}

        {aCobrar.filter(l => !l.orden_cambio_id).length > 0 && (
          <div style={{ ...caja, borderLeft: `3px solid ${colors.brand}` }}>
            <div style={{ fontSize: 12.5, color: colors.ink, marginBottom: 7 }}>
              <strong>{aCobrar.filter(l => !l.orden_cambio_id).length}{" "}
                {aCobrar.filter(l => !l.orden_cambio_id).length === 1 ? "diferencia" : "diferencias"} para la
                próxima orden</strong>
              {" "}· ${fmt(va.monto)} de costo
              {va.aDevolver > 0 && (
                <span style={{ color: colors.success }}>
                  {" "}· y {va.aDevolver} {va.aDevolver === 1 ? "se le devuelve" : "se le devuelven"},
                  ${fmt(va.montoDevuelto)}
                </span>
              )}
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
      {verPresupuesto && (
        <Presupuesto rubros={vivos} busca={buscaRubro} onBusca={setBuscaRubro}
          eligiendo={eligiendo}
          onElegir={r => (eligiendo?.paraPrecio
            ? fijarPrecio(eligiendo, Number(r.cantidad) ? baseSinIva(r) / Number(r.cantidad) : 0, r.id)
            : usarRubro(eligiendo, r))}
          onCerrar={() => { setVerPresupuesto(false); setEligiendo(null); }} />
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
        Lo que sale de acá es un <strong>ejercicio</strong>: sirve para ver si la obra va para arriba o para
        abajo y para armar la orden de cambio. La realidad la dice el control de obra, cuando las facturas
        entran.
        Lo que aparece y el contrato no cubre se le cobra al cliente; lo contratado que no se hizo se le devuelve.
        Cada diferencia se decide una por una y <strong>el análisis queda guardado</strong>: se puede salir y
        volver mañana. No es lo mismo que Beneficios —esas son eficiencias nuestras sobre lo ya contratado.
      </div>

      {/* CONTRA QUÉ SE COMPARA. Son dos preguntas distintas con la misma
          maquinaria: contra el contrato, para saber qué se le cobra al cliente;
          entre dos cotizaciones, para decidir a quién contratar. */}
      <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
        {[["contrato", "Contra el contrato de la obra", "qué se le cobra al cliente y qué queda a favor"],
          ["cotizaciones", "Entre dos cotizaciones", "a quién conviene contratar, renglón por renglón"]].map(([k, t, p]) => (
          <button key={k} onClick={() => { setModo(k); setSegunda(null); }} title={p}
            style={{ border: `1px solid ${modo === k ? colors.brand : colors.border}`,
              background: modo === k ? colors.brand : "#fff", color: modo === k ? "#fff" : colors.muted,
              borderRadius: 20, padding: "4px 13px", fontSize: 11.5, cursor: "pointer",
              fontFamily: colors.font, fontWeight: modo === k ? 700 : 400 }}>
            {t}
          </button>
        ))}
        <span style={{ fontSize: 10.5, color: colors.muted }}>
          {modo === "contrato"
            ? "qué se le cobra al cliente y qué queda a favor"
            : "a quién conviene contratar: el total esconde al que no cotizó algo"}
        </span>
      </div>

      {modo === "cotizaciones" && segunda && (
        <div style={{ ...caja, fontSize: 11.5, color: colors.inkSoft, borderLeft: `3px solid ${colors.brand}` }}>
          Primera cotización: <strong>{segunda.proveedor || segunda.file?.name}</strong> ·{" "}
          {segunda.items?.length} renglones. Ahora subí la segunda para compararlas.
          <button onClick={() => setSegunda(null)}
            style={{ background: "none", border: "none", cursor: "pointer", fontFamily: colors.font,
              fontSize: 11, color: colors.brand, textDecoration: "underline", marginLeft: 6 }}>
            empezar de nuevo
          </button>
        </div>
      )}

      <label style={{ ...caja, display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
        cursor: leyendo ? "wait" : "pointer", borderStyle: "dashed", color: colors.inkSoft, fontSize: 12.5 }}>
        <input type="file" accept="image/*,.pdf,.xlsx,.xlsm,.xls,.csv" style={{ display: "none" }}
          disabled={!!leyendo} onChange={leer} />
        <FileText size={14} />
        {leyendo ? `NOVA está leyendo… ${leyendo === "leyendo" ? "" : leyendo}`
          : modo === "cotizaciones"
            ? (segunda ? "Subir la SEGUNDA cotización, para compararla con la primera"
              : "Subir la PRIMERA cotización (PDF, foto o Excel)")
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
                    // POR DÓNDE VA, no solo cuánto falta: con "faltan 48 por
                    // decidir" en los dos análisis no se sabe en cuál se
                    // avanzó ayer ni cuál conviene retomar.
                    ? `${v.revisadas} de ${v.total} revisadas · faltan ${v.sinDecidir} por decidir`
                      + (v.aFavor ? ` · $${fmt(v.aFavor)} a favor` : "")
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
