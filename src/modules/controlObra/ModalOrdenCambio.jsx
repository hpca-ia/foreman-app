import { useState, useRef, useEffect, useMemo } from "react";
import { Camera, X, Plus, Trash2, Sparkles } from "lucide-react";
import { colors } from "../../theme/colors";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import { fmt } from "./calculos";
import { crearOrden, agregarLinea, subirSoporte, siguienteItem, subtotales, pedirElVistoAlDirector } from "./ordenesDeCambio";
import { pedirANova, JUICIO, textoDeNova } from "../../lib/modelos";
import { leerConNova, guardarCotizacion } from "./cotizacionesOrden";
import { partidasDeCotizacion, totalDeCotizacion, margenDeOrden, conMargen } from "./cuentaOrdenCambio.js";
import { AFECTA, honorariosDe } from "./honorariosDeOrden.js";

// Una orden de cambio entera, de una sola vez.
//
// Antes se creaba con cuatro datos y el resto se llenaba después, campo por
// campo, dentro de la fila desplegada. Eso está bien para corregir y es pésimo
// para escribir: una orden de cambio se redacta de un tirón —el día que pasó
// lo que la motiva— y hay que tener delante todo lo que va a decir, porque la
// justificación se escribe mirando las partidas y las partidas se arman
// mirando la justificación.
//
// Partida en pedazos, lo que pasa es que queda a medio llenar: con título y
// sin argumentos, o con argumentos y sin precios. Y una orden de cambio a
// medio llenar no se puede mandar, así que no sirve de nada.
//
// Las fotos esperan en memoria hasta que la orden existe: subirlas antes
// dejaría archivos sueltos cada vez que alguien empieza una y la cancela.

const VACIA = {
  titulo: "", tipo: "", lugar: "Quito", fecha: new Date().toISOString().split("T")[0],
  emitido_por: "", justificacion: "", soportes: "", impacto_cronograma: "", dias_impacto: "",
  fecha_limite_aprobacion: "",
  // Qué mueve la orden —pueden ser varias— y el porcentaje de honorarios del
  // contrato, que se cobra sobre el neto y va al pie, no adentro de los rubros.
  afecta: [], honorarios_pct: "",
  // null es "todavía no se contestó", que no es lo mismo que "no corre".
  impacta_crono: null,
};
// "aumenta" y no "agrega": es el valor que guarda la base y el que suma
// `subtotales`. Con el otro, la vista previa de totales mostraba cero.
// Las columnas de una partida: flechas, tipo, descripción, unidad, cantidad,
// precio unitario, total y borrar. Las comparten los títulos y los renglones.
const COLUMNAS = "14px 88px 1fr 52px 64px 84px 80px 22px";
// El costo vacío es "no se sabe": una partida escrita a mano no tiene
// cotización, y suponerle costo cero la haría parecer pura ganancia.
const LINEA = () => ({ tipo: "aumenta", descripcion: "", unidad: "u", cantidad: 1, precio_unitario: "", costo_unitario: "", obra_rubro_id: "", rubro_codigo: "" });

const TIPOS = ["Requerimiento del cliente", "Vicio oculto", "Cambio de especificación", "Error de proyecto", "Condición del terreno"];

export default function ModalOrdenCambio({ obra, proyecto, rubros = [], currentUser, puedeAprobar = false, onCerrar, onCreada }) {
  const [f, setF] = useState(VACIA);
  const [lineas, setLineas] = useState([LINEA()]);
  const [fotos, setFotos] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  // Lo que había escrito antes de que NOVA lo ordenara: se puede volver.
  // Un texto que no se puede deshacer no se deja tocar por nadie.
  const [previo, setPrevio] = useState(null);
  const [ocupadoNova, setOcupadoNova] = useState(false);
  const [errorNova, setErrorNova] = useState("");
  const [leyendo, setLeyendo] = useState("");
  // La cotización leída: el archivo y lo que NOVA sacó de él. Espera en
  // memoria hasta que la orden existe, igual que las fotos, y se guarda con
  // ella: es el papel que dice cuánto cuesta lo que se está cobrando.
  const [cotizacion, setCotizacion] = useState(null);
  const [encima, setEncima] = useState(false);
  const [verPresupuesto, setVerPresupuesto] = useState(false);
  // Qué partida está eligiendo un rubro del presupuesto para copiarle el precio.
  const [tomando, setTomando] = useState(null);
  // El margen que se le pone a toda la orden de una vez. Lo que NOVA leyó es
  // lo que cuesta; el precio lo pone la oficina, y casi siempre es el mismo
  // porcentaje para todas las partidas.
  const [pctMargen, setPctMargen] = useState("");
  const [busca, setBusca] = useState("");

  // Los rubros vivos, agrupados por capítulo y en el orden del presupuesto.
  const porCapitulo = useMemo(() => {
    const mapa = new Map();
    (rubros || []).filter(r => !r.anulado_por_oc && !r.oculto).forEach(r => {
      const cap = String(r.capitulo || "SIN CAPÍTULO");
      if (!mapa.has(cap)) mapa.set(cap, []);
      mapa.get(cap).push(r);
    });
    return [...mapa.entries()];
  }, [rubros]);
  const cotizacionRef = useRef(null);

  // CANCELAR TAMBIÉN PIERDE TRABAJO, SOLO QUE A PROPÓSITO.
  //
  // Nada de esto existe en la base hasta que se guarda: el título, la
  // justificación, las partidas y las fotos viven en memoria. Si ya hay algo
  // escrito, Cancelar pregunta una vez; con la pantalla vacía no pregunta
  // nada, porque no hay nada que perder.
  const hayAlgoEscrito = () =>
    Object.entries(VACIA).some(([k, v]) => String(f[k] ?? "") !== String(v)) ||
    fotos.length > 0 ||
    lineas.some(l => String(l.descripcion || "").trim() || String(l.precio_unitario || "").trim());

  const cancelar = () => {
    if (hayAlgoEscrito() && !window.confirm("¿Descartar esta orden de cambio?\n\nLo escrito —el argumento, las partidas y las fotos— no se guardó todavía y no se puede recuperar.")) return;
    onCerrar();
  };

  /**
   * PEGAR, ARRASTRAR O ELEGIR: las tres cosas terminan en la misma lectura.
   *
   * Una cotización llega por WhatsApp y se mira en la pantalla: lo natural es
   * recortarla y pegarla, no guardarla en Descargas con un nombre que nadie va
   * a volver a encontrar para después buscarla en un diálogo de archivos. Y un
   * PDF que ya está abierto se arrastra.
   *
   * El pegado escucha en toda la ventana mientras este modal está abierto: no
   * hay dónde "hacer foco" para pegar, y pedirle a alguien que haga clic en el
   * lugar correcto antes de pegar es pedirle que adivine.
   */
  useEffect(() => {
    const alPegar = ev => {
      // Si están pegando texto en un campo, es texto: no se toca.
      const items = [...(ev.clipboardData?.items || [])];
      const archivo = items.find(i => i.kind === "file" && /^(image\/|application\/pdf)/.test(i.type));
      if (!archivo) return;
      const f2 = archivo.getAsFile();
      if (!f2) return;
      ev.preventDefault();
      leerArchivoDeCotizacion(f2);
    };
    window.addEventListener("paste", alPegar);
    return () => window.removeEventListener("paste", alPegar);
    // eslint-disable-next-line
  }, [rubros]);

  /**
   * Subir la cotización del proveedor y que NOVA la pase a líneas.
   *
   * Una orden de cambio se arma con la proforma del que va a hacer el trabajo
   * delante: la misma descripción, la misma unidad, el mismo precio. Copiar
   * catorce renglones a mano en el teléfono es donde se pierde media hora y
   * donde se cuela el error que después nadie encuentra — un 1.250 que entró
   * como 125.
   *
   * Es el MISMO lector que compara proformas en Beneficios. Si fueran dos, el
   * mismo papel daría dos resultados según por dónde entre.
   */
  async function leerCotizacion_(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    await leerArchivoDeCotizacion(file);
  }

  async function leerArchivoDeCotizacion(original) {
    if (!original) return;
    setLeyendo("leyendo"); setErrorNova("");
    try {
      const { proveedor, items, cortado, archivo, iva } = await leerConNova(original, rubros, p2 => setLeyendo(p2 || "leyendo"));
      // EL COSTO VA SIN IVA: la orden cobra sin IVA, y medir un precio sin IVA
      // contra un costo con IVA se come el margen entero sin que nada lo diga.
      const partidas = partidasDeCotizacion(items, iva);
      if (!partidas.length) throw new Error("NOVA no encontró renglones con precios en la cotización.");
      setLineas(partidas);
      setCotizacion({ archivo, proveedor: proveedor || "", items, iva });
      if (cortado) setErrorNova("La cotización era larga y NOVA se quedó sin espacio: revisá el final contra el papel.");
    } catch (err) {
      setErrorNova(err.message);
    }
    setLeyendo("");
  }

  /**
   * Ordenar el argumento, no escribirlo.
   *
   * Una orden de cambio se escribe en la obra, con el problema delante y
   * apurado, y la lee un fiscalizador que no estuvo ahí. El argumento suele
   * estar completo y mal puesto. Lo que NOVA NO puede hacer es agregar razones
   * o hechos que nadie dijo: este documento se firma y se cobra con él, y un
   * motivo inventado convierte un reclamo legítimo en uno falso.
   */
  async function corregirTexto() {
    const original = String(f.justificacion || "").trim();
    if (!original) return;
    setOcupadoNova(true); setErrorNova("");
    const { res, data } = await pedirANova({
      model: JUICIO, max_tokens: 1500,
      system: `Sos NOVA. Te paso los argumentos de una ORDEN DE CAMBIO de obra, escritos a las apuradas
en el sitio. Devolvés el MISMO texto ordenado y corregido, y nada más: sin encabezado, sin comillas,
sin explicar qué cambiaste.

QUÉ HACÉS:
· Corregís ortografía, tildes y puntuación.
· Separás las ideas en oraciones y en párrafos cuando hagan falta.
· Lo ponés en el castellano con el que se firma un papel: tercera persona, sin modismos,
  sin "o sea", sin abreviaturas de chat.
· Ordenás el razonamiento: primero qué pasó, después por qué obliga a cambiar algo,
  al final qué pasa si no se hace.

QUÉ NO HACÉS NUNCA:
· No agregás razones, hechos, cantidades, fechas ni normas que no estén en el texto.
· No sacás nada de lo que dice: si una frase es confusa, la aclarás con las mismas palabras.
· No exagerás ni suavizás. Este documento se firma y se cobra con él: un motivo inventado
  convierte un reclamo legítimo en uno falso, y lo descubre el que lo tiene que pagar.

Si el texto ya está bien escrito, devolvelo igual.`,
      messages: [{ role: "user", content: original }],
    });
    setOcupadoNova(false);
    if (!res.ok || data?.error) {
      setErrorNova(data?.error?.message || data?.error || "NOVA no pudo ordenarlo. Probá de nuevo.");
      return;
    }
    const limpio = String(textoDeNova(data) || "").trim();
    if (!limpio) { setErrorNova("NOVA devolvió un texto vacío: lo que escribiste sigue como estaba."); return; }
    setPrevio(original);
    setF(v => ({ ...v, justificacion: limpio }));
  }
  const camRef = useRef(null);

  const conMonto = lineas.filter(l => l.descripcion?.trim());
  const hon = honorariosDe({ lineas: conMonto, pct: f.honorarios_pct });
  const sub = subtotales(conMonto.map(l => ({
    ...l, cantidad: Number(l.cantidad) || 0, precio_unitario: Number(l.precio_unitario) || 0,
  })));
  const margen = margenDeOrden(conMonto.map(l => ({ ...l, costo_unitario: l.costo_unitario === "" ? null : l.costo_unitario })));

  // Guardar y, de una, hacer lo que corresponda. El que puede aprobar suele
  // ser el mismo que la escribe —una orden la redacta quien la decidió— y
  // obligarlo a guardar, cerrar, buscarla en la lista, abrirla y recién ahí
  // aprobarla son cuatro pasos para confirmar algo que ya decidió al escribir.
  async function guardar(despues) {
    if (!f.titulo.trim()) { setError("Ponele un título: es lo que se cita después en las actas."); return; }
    // SIN PARTIDAS SE PUEDE GUARDAR, PERO NO APROBAR.
    //
    // Una orden de cambio no nace entera: aparece el problema, se escribe el
    // argumento ese día, y el precio llega una semana después con la cotización
    // del proveedor. Obligar a tener las partidas para poder guardar hace que
    // ese argumento —escrito con el problema delante y con las palabras justas—
    // viva mientras tanto en un WhatsApp, y lo que se escribe tres semanas
    // después ya es un resumen de memoria.
    //
    // Aprobar sí las necesita: aprobar es mandar plata al presupuesto.
    // Pedir el visto y mandarla sí las necesitan: lo que se revisa y lo que
    // viaja es un precio, y una orden sin partidas no tiene ninguno.
    if (despues && !conMonto.length) {
      setError(despues === "mandar"
        ? "Para mandarla tiene que tener partidas: lo que el cliente aprueba es el precio."
        : "Para pedir el visto tiene que tener partidas: lo que se revisa es el precio antes de que salga.");
      return;
    }
    setGuardando(true); setError("");

    const r = await crearOrden(obra.id, { ...f, dias_impacto: Number(f.dias_impacto) || null }, currentUser);
    if (r.error) { setError(r.error); setGuardando(false); return; }
    const orden = r.orden;

    // El impacto en el cronograma no entra en crearOrden —es de la 056 y vive
    // aparte—, así que se guarda enseguida.
    if (f.fecha_limite_aprobacion) {
      await import("./ordenesDeCambio").then(m => m.guardarOrden(orden.id, {
        fecha_limite_aprobacion: f.fecha_limite_aprobacion,
      }));
    }
    if (f.impacto_cronograma?.trim() || f.dias_impacto || f.impacta_crono != null) {
      await import("./ordenesDeCambio").then(m => m.guardarOrden(orden.id, {
        impacta_crono: f.impacta_crono,
        impacto_cronograma: f.impacto_cronograma?.trim() || null,
        dias_impacto: f.impacta_crono === false ? null : (Number(f.dias_impacto) || null),
        soportes: f.soportes?.trim() || null,
      }));
    }

    // LA COTIZACIÓN, ANTES QUE LAS PARTIDAS: cada partida que salió de ella
    // apunta a ella. Si no se puede guardar, la orden sigue —es el documento
    // que se firma— y se avisa qué faltó.
    let avisoCotizacion = "";
    let cotizacionId = null;
    if (cotizacion) {
      const rc = await guardarCotizacion(orden.id, cotizacion.archivo, cotizacion, currentUser);
      if (rc.error) avisoCotizacion = `La orden se guardó, pero la cotización no: ${rc.error}`;
      else cotizacionId = rc.cotizacion.id;
    }

    const puestas = [];
    // EL ORDEN SE GUARDA. Se leía con `order=orden` y nadie lo escribía, así
    // que todas las partidas quedaban en cero y el orden salía por casualidad
    // —el del id—. Acomodar las partidas y que al volver a abrirlas estén
    // como estaban es la diferencia entre ordenarlas y hacer como que sí.
    for (const [indice, l] of conMonto.entries()) {
      const linea = {
        orden: indice,
        tipo: l.tipo,
        obra_rubro_id: l.obra_rubro_id ? Number(l.obra_rubro_id) : null,
        item: siguienteItem(puestas, l.tipo),
        // De qué rubro del contrato salió el precio. Es lo que después deja
        // comparar un adicional contra lo que ya estaba contratado.
        rubro_codigo: l.rubro_codigo || null,
        descripcion: l.descripcion.trim(),
        unidad: l.unidad || "u",
        cantidad: Number(l.cantidad) || 0,
        precio_unitario: Number(l.precio_unitario) || 0,
        costo_unitario: l.tipo === "quita" ? null : (l.costo_unitario === "" ? null : l.costo_unitario),
        cotizacion_id: l.tipo !== "quita" && l.costo_unitario !== "" && l.costo_unitario != null ? cotizacionId : null,
      };
      const res = await agregarLinea(orden.id, linea, puestas);
      if (res?.error) { setError(res.error); setGuardando(false); return; }
      if (res?.sinCosto && !avisoCotizacion) avisoCotizacion = "La orden se guardó sin el costo de las partidas: falta correr la migración 125 en Supabase.";
      puestas.push({ ...linea, id: res.linea?.id });
    }

    for (const [i, archivo] of fotos.entries()) {
      await subirSoporte(orden, archivo, "", currentUser, i);
    }

    let aviso = avisoCotizacion;
    if (despues === "pedir-visto") {
      // EL PDF VIAJA CON EL PEDIDO. Lo que se revisa es el cuadro de partidas
      // con su precio, y pedirle al Director que entre a buscarlo es lo que
      // hacía que el visto tardara tres días. Sin fotos: todavía están
      // subiéndose y el documento se vuelve a armar completo cuando se manda.
      let pdf = null;
      try {
        const { pdfDeOrden } = await import("./pdfOrdenCambio");
        const doc = await pdfDeOrden({
          orden: { ...orden }, lineas: puestas, fotos: [], enlaces: {}, obra, proyecto,
          codigo: orden.codigo || `OC-${String(orden.numero).padStart(2, "0")}`,
          subtotales: subtotales(puestas), resumenContrato: null, aprobadores: [],
        });
        pdf = { nombre: `${orden.codigo || `OC-${orden.numero}`}.pdf`, contenido: doc.output("datauristring").split(",")[1] };
      } catch { /* sin PDF el pedido sale igual: el detalle va en el cuerpo */ }

      const r = await pedirElVistoAlDirector({ ...orden, lead_id: obra?.lead_id ?? null }, currentUser, pdf);
      aviso = r?.error
        ? `La orden se guardó, pero el visto no se pudo pedir: ${r.error}`
        : r?.aviso || `Le pediste el visto a ${r?.pedidoA || "el Director"}: le llegó la orden en PDF y la puede aprobar desde el correo.`;
    }

    setGuardando(false);
    onCreada?.(orden, aviso, { mandar: despues === "mandar" });
  }

  const lbl = { fontSize: 10, color: colors.muted, fontWeight: 600, display: "block", marginBottom: 3 };
  const mini = { ...inputStyle, padding: "7px 9px", fontSize: 12.5 };

  return (
    <Modal maxWidth={720}>
      <div style={{ fontSize: 15, fontWeight: 700, color: colors.ink, marginBottom: 2 }}>Nueva orden de cambio</div>
      <div style={{ fontSize: 11.5, color: colors.muted, marginBottom: 12 }}>
        {proyecto || obra?.nombre} · se numera sola al guardar
      </div>

      <div style={{ display: "grid", gap: 9 }}>
        <div>
          <label style={lbl}>TÍTULO</label>
          <input autoFocus value={f.titulo} onChange={e => setF(v => ({ ...v, titulo: e.target.value }))}
            placeholder="Ej: Refuerzo de cimentación en eje 4 por suelo no apto" style={mini} />
        </div>

        {/* QUÉ MUEVE LA ORDEN, que es otra pregunta que por qué se origina.
            Todas las órdenes se leían igual y el cliente tenía que abrir el PDF
            para saber si eso le costaba plata o le cambiaba la fecha. Son
            casillas y no una lista: el cambio de especificación que además
            cuesta y además corre el plazo son tres, no una de tres. */}
        <div style={{ marginBottom: 10 }}>
          <label style={lbl}>QUÉ AFECTA ESTA ORDEN</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 3 }}>
            {AFECTA.map(([clave, nombre, pista]) => {
              const puesta = (f.afecta || []).includes(clave);
              return (
                <button key={clave} type="button" title={pista}
                  onClick={() => setF(v => ({ ...v, afecta: puesta
                    ? (v.afecta || []).filter(x => x !== clave)
                    : [...(v.afecta || []), clave] }))}
                  style={{ border: `1px solid ${puesta ? colors.brand : colors.border}`,
                    background: puesta ? colors.brand : "#fff", color: puesta ? "#fff" : colors.muted,
                    borderRadius: 20, padding: "4px 12px", fontSize: 11.5, cursor: "pointer",
                    fontFamily: colors.font, fontWeight: puesta ? 700 : 400 }}>
                  {nombre}
                </button>
              );
            })}
            <span style={{ fontSize: 10.5, color: colors.muted, alignSelf: "center" }}>
              {(f.afecta || []).length === AFECTA.length ? "las tres" : "las que correspondan"}
            </span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 130px", gap: 8 }}>
          <div>
            <label style={lbl}>POR QUÉ SE ORIGINA</label>
            <select value={f.tipo} onChange={e => setF(v => ({ ...v, tipo: e.target.value }))} style={mini}>
              <option value="">Elegí…</option>
              {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>LUGAR</label>
            <input value={f.lugar} onChange={e => setF(v => ({ ...v, lugar: e.target.value }))} style={mini} />
          </div>
          <div>
            <label style={lbl}>FECHA</label>
            <input type="date" value={f.fecha} onChange={e => setF(v => ({ ...v, fecha: e.target.value }))} style={mini} />
          </div>
          {/* HASTA CUÁNDO HAY PARA APROBARLA.
              Mientras no se aprueba, el trabajo no se ejecuta y el plazo de la
              obra corre igual. Esa espera no tiene dueño: el que la manda cree
              que es urgente y el que la recibe no sabe que hay algo parado
              esperándolo. Con fecha, el silencio se puede reclamar. */}
          <div>
            <label style={lbl}>APROBAR ANTES DEL</label>
            <input type="date" value={f.fecha_limite_aprobacion || ""}
              onChange={e => setF(v => ({ ...v, fecha_limite_aprobacion: e.target.value }))} style={mini} />
          </div>
        </div>

        {/* LA COTIZACIÓN DEL QUE VA A HACER EL TRABAJO, LEÍDA. */}
        <div
          onDragOver={e => { e.preventDefault(); setEncima(true); }}
          onDragLeave={() => setEncima(false)}
          onDrop={e => {
            e.preventDefault(); setEncima(false);
            const f2 = [...(e.dataTransfer?.files || [])][0];
            if (f2) leerArchivoDeCotizacion(f2);
          }}
          style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap",
            border: `1px dashed ${encima ? colors.brand : "transparent"}`,
            background: encima ? colors.brandSoft : "transparent",
            borderRadius: colors.radiusSm, padding: encima ? 6 : 0, transition: "background .12s" }}>
          <button onClick={() => cotizacionRef.current?.click()} disabled={!!leyendo}
            style={{ display: "flex", alignItems: "center", gap: 6, background: colors.brandSoft,
              border: `1px solid ${colors.brand}`, borderRadius: colors.radiusSm, padding: "6px 11px",
              fontSize: 12, fontWeight: 700, color: colors.brand, fontFamily: colors.font,
              cursor: leyendo ? "wait" : "pointer" }}>
            <Sparkles size={13} />
            {leyendo ? `NOVA está leyendo… ${leyendo === "leyendo" ? "" : leyendo}` : "Subir la cotización y que NOVA la lea"}
          </button>
          <input ref={cotizacionRef} type="file" accept="image/*,.pdf,.xlsx,.xlsm,.xls"
            onChange={leerCotizacion_} style={{ display: "none" }} />
          <span style={{ fontSize: 10.5, color: colors.muted }}>
            PDF, foto o Excel. También podés <strong>pegar una captura</strong> (Cmd/Ctrl+V) o arrastrar el archivo acá.
            Llena las líneas de abajo; después las revisás.
          </span>
        </div>
        {cotizacion && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", background: colors.bg,
            borderRadius: colors.radiusSm, padding: "6px 10px", fontSize: 11.5 }}>
            <span style={{ fontWeight: 700, color: colors.inkSoft }}>Cotización:</span>
            <span style={{ color: colors.ink }}>{cotizacion.archivo?.name || "archivo"}</span>
            <input value={cotizacion.proveedor} onChange={e => setCotizacion(c => ({ ...c, proveedor: e.target.value }))}
              placeholder="Proveedor" style={{ ...mini, padding: "3px 7px", fontSize: 11.5, width: 180 }} />
            <span style={{ color: colors.muted }}>{cotizacion.items.length} renglones · ${fmt(totalDeCotizacion(cotizacion.items))}</span>
            <span style={{ color: colors.muted, flexBasis: "100%", fontSize: 10.5 }}>
              Se guarda con la orden: es el respaldo de lo que cuesta. Cada partida nace con el precio igual al
              costo; subile el precio para ponerle el margen.
            </span>
          </div>
        )}

        <div>
          <label style={lbl}>CAPÍTULO I · ARGUMENTOS</label>
          <textarea value={f.justificacion} onChange={e => setF(v => ({ ...v, justificacion: e.target.value }))} rows={3}
            placeholder="Por qué se pide, qué pasa si no se hace, y en qué se apoya. Es lo que lee quien aprueba."
            style={{ ...mini, resize: "vertical" }} />
          {/* ESCRIBIR MAL UN ARGUMENTO BUENO CUESTA PLATA.
              Una orden de cambio se escribe en la obra, con el problema
              delante y apurado, y después la lee un fiscalizador que no estuvo
              ahí. El argumento suele estar completo y mal puesto: tres ideas
              en una oración, faltas, la conclusión al principio. NOVA no
              inventa razones ni agrega hechos —eso sería falsificar el
              documento—: ordena lo que ya está escrito y lo pone en el
              castellano con el que se firma un papel. */}
          <div style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap", marginTop: 5 }}>
            <button onClick={corregirTexto} disabled={!f.justificacion.trim() || ocupadoNova}
              style={{ display: "flex", alignItems: "center", gap: 5, background: "none",
                border: `1px solid ${colors.border}`, borderRadius: colors.radiusSm, padding: "4px 9px",
                fontSize: 11.5, fontWeight: 600, fontFamily: colors.font,
                color: f.justificacion.trim() ? colors.brand : colors.muted,
                cursor: f.justificacion.trim() ? "pointer" : "default" }}>
              <Sparkles size={12} /> {ocupadoNova ? "NOVA está ordenándolo…" : "Que NOVA lo ordene"}
            </button>
            {previo != null && (
              <button onClick={() => { setF(v => ({ ...v, justificacion: previo })); setPrevio(null); }}
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: colors.font,
                  fontSize: 11.5, color: colors.muted, textDecoration: "underline" }}>
                dejarlo como lo escribí
              </button>
            )}
            <span style={{ fontSize: 10.5, color: colors.muted }}>
              Ordena y corrige lo que escribiste. No agrega razones ni hechos.
            </span>
          </div>
          {errorNova && <div style={{ fontSize: 11.5, color: colors.danger, marginTop: 4 }}>{errorNova}</div>}
        </div>

        {/* Los soportes acá y no después: quien aprueba deja de tener que
            creerle a la palabra escrita, y la foto se saca el mismo día. */}
        <div>
          <label style={lbl}>SOPORTES GRÁFICOS{fotos.length ? ` · ${fotos.length}` : ""}</label>
          {fotos.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
              {fotos.map((x, i) => (
                <div key={i} style={{ position: "relative", width: 72, height: 72, borderRadius: 7, overflow: "hidden", background: colors.bg }}>
                  <img src={URL.createObjectURL(x)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <button onClick={() => setFotos(v => v.filter((_, k) => k !== i))}
                    style={{ position: "absolute", top: 2, right: 2, width: 17, height: 17, borderRadius: "50%", border: "none",
                      background: "rgba(0,0,0,.6)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button onClick={() => camRef.current?.click()}
            style={{ width: "100%", background: colors.bg, border: `1px dashed ${colors.border}`, borderRadius: 8, padding: "9px",
              color: colors.inkSoft, fontSize: 12, cursor: "pointer", fontFamily: colors.font,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Camera size={13} /> Foto de lo que se encontró, o el plano de la solución
          </button>
          <input ref={camRef} type="file" accept="image/*" multiple style={{ display: "none" }}
            onChange={e => { const f2 = [...e.target.files]; e.target.value = ""; setFotos(v => [...v, ...f2]); }} />
        </div>

        {/* EL PRESUPUESTO, A LA MANO MIENTRAS SE ARMA LA ORDEN.
            Una orden de cambio se escribe contra el contrato: para saber si
            algo ya estaba previsto, con qué unidad y a qué precio, hay que
            mirar el presupuesto. Tenerlo en otra pantalla obliga a cerrar lo
            que uno está escribiendo. Por capítulo y con buscador, porque
            trescientos rubros en una lista corrida no se recorren. */}
        {rubros.length > 0 && (
          <div>
            <button onClick={() => setVerPresupuesto(v => !v)}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: colors.font,
                fontSize: 11.5, fontWeight: 700, color: colors.brand, letterSpacing: 0.3 }}>
              {verPresupuesto ? "▾" : "▸"} VER EL PRESUPUESTO ({rubros.filter(r => !r.anulado_por_oc).length} rubros)
            </button>
            {verPresupuesto && (
              <div style={{ marginTop: 6, border: `1px solid ${colors.border}`, borderRadius: colors.radiusSm, overflow: "hidden" }}>
                <input value={busca} onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar un rubro o un capítulo…"
                  style={{ ...mini, border: "none", borderBottom: `1px solid ${colors.border}`, borderRadius: 0, padding: "7px 10px" }} />
                <div style={{ maxHeight: 220, overflowY: "auto" }}>
                  {porCapitulo.map(([capitulo, suyos]) => {
                    const filtrados = suyos.filter(r => !busca.trim()
                      || `${capitulo} ${r.numero} ${r.descripcion}`.toLowerCase().includes(busca.trim().toLowerCase()));
                    if (!filtrados.length) return null;
                    return (
                      <div key={capitulo}>
                        <div style={{ background: colors.bg, padding: "4px 10px", fontSize: 10,
                          fontWeight: 700, color: colors.muted, letterSpacing: 0.3, position: "sticky", top: 0 }}>
                          {capitulo}
                        </div>
                        {filtrados.map(r => (
                          <div key={r.id} style={{ display: "flex", gap: 8, padding: "4px 10px",
                            borderTop: `1px solid ${colors.neutralSoft}`, fontSize: 11.5, alignItems: "baseline" }}>
                            <span style={{ color: colors.muted, flexShrink: 0, minWidth: 34 }}>{r.numero}</span>
                            <span style={{ flex: 1, minWidth: 0, color: colors.ink, overflow: "hidden",
                              textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.descripcion}>
                              {r.descripcion}
                            </span>
                            <span style={{ color: colors.muted, flexShrink: 0 }}>
                              {Number(r.cantidad) || 0} {r.unidad}
                            </span>
                            <span style={{ color: colors.inkSoft, flexShrink: 0, fontWeight: 600, minWidth: 78, textAlign: "right" }}>
                              ${fmt(r.total_base)}
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Las partidas. Es la parte que se arma mirando los argumentos, y por
            eso tiene que estar en la misma pantalla. */}
        <div>
          <label style={lbl}>CAPÍTULO II · PARTIDAS</label>
          {/* Los títulos de las columnas. Sin ellos, el precio unitario era
              un casillero con "P.U." en gris que desaparecía apenas se
              escribía, y lo único que se leía como plata era el total de
              abajo: parecía que la orden no pedía el unitario. */}
          <div style={{ display: "grid", gridTemplateColumns: COLUMNAS, gap: 5, marginBottom: 3 }}>
            {["", "", "Descripción", "Unid", "Cant", "P. unit", "Total", ""].map((h, k) => (
              <span key={k} style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3, color: colors.muted,
                textAlign: k >= 4 && k <= 6 ? "right" : "left" }}>{h.toUpperCase()}</span>
            ))}
          </div>
          {lineas.map((l, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: COLUMNAS, gap: 5, marginBottom: 5, alignItems: "center" }}>
              {/* EL ORDEN DE LAS PARTIDAS ES EL ORDEN EN QUE SE LEE LA OBRA.
                  NOVA las carga en el orden en que vienen en la proforma del
                  proveedor, que es el de él: primero lo que factura más fácil.
                  El que aprueba las lee en el orden del trabajo —primero lo
                  que se demuele, después lo que se construye— y una lista
                  desordenada obliga a saltar de arriba abajo para entender un
                  cambio que es uno solo. */}
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <button onClick={() => setLineas(v => {
                  if (i === 0) return v;
                  const n = [...v]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n;
                })} disabled={i === 0} title="Subirla"
                  style={{ background: "none", border: "none", padding: 0, lineHeight: 1, fontSize: 8,
                    cursor: i === 0 ? "default" : "pointer", color: i === 0 ? colors.border : colors.muted }}>▲</button>
                <button onClick={() => setLineas(v => {
                  if (i === v.length - 1) return v;
                  const n = [...v]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; return n;
                })} disabled={i === lineas.length - 1} title="Bajarla"
                  style={{ background: "none", border: "none", padding: 0, lineHeight: 1, fontSize: 8,
                    cursor: i === lineas.length - 1 ? "default" : "pointer",
                    color: i === lineas.length - 1 ? colors.border : colors.muted }}>▼</button>
              </div>
              <select value={l.tipo} onChange={e => setLineas(v => v.map((x, k) => k === i ? { ...x, tipo: e.target.value } : x))}
                style={{ ...mini, padding: "6px 5px", fontSize: 11.5 }}>
                <option value="aumenta">Adición</option>
                <option value="quita">Reducción</option>
              </select>
              {/* Lo que se quita se ELIGE del presupuesto, no se escribe: es
                  un rubro que ya está contratado, con su cantidad y su precio.
                  Tipeado a mano se pone otro número y la resta no cuadra con
                  lo que de verdad sale del contrato. */}
              {l.tipo === "quita" ? (
                <select value={l.obra_rubro_id || ""} style={{ ...mini, padding: "6px 8px" }}
                  onChange={e => {
                    const r = rubros.find(x => String(x.id) === e.target.value);
                    setLineas(v => v.map((x, k) => k === i ? {
                      ...x, obra_rubro_id: e.target.value,
                      descripcion: r?.descripcion || "", unidad: r?.unidad || "u",
                      cantidad: r?.cantidad ?? 1, precio_unitario: r?.precio_unitario ?? "",
                    } : x));
                  }}>
                  <option value="">¿Qué rubro se reduce?</option>
                  {/* POR CAPÍTULO. Una obra tiene trescientos rubros y en una
                      lista corrida hay que leerlos todos para encontrar uno:
                      el capítulo es como se busca —"la pintura está en
                      acabados"— y es lo único que convierte la lista en algo
                      que se puede recorrer. */}
                  {porCapitulo.map(([capitulo, suyos]) => (
                    <optgroup key={capitulo} label={capitulo}>
                      {/* CON TODA SU INFORMACIÓN.
                          Para decidir cuánto se reduce hay que saber qué hay:
                          la cantidad contratada, la unidad, el precio y el
                          total. Con solo la descripción, quien arma la orden
                          tiene que ir a buscar esos cuatro números a otra
                          pantalla —y el que no los busca pone un número a ojo. */}
                      {suyos.map(r => (
                        <option key={r.id} value={r.id}>
                          {r.numero}. {String(r.descripcion || "").slice(0, 52)}
                          {"  ·  "}{Number(r.cantidad) || 0} {r.unidad || ""} × ${fmt(r.precio_unitario)}
                          {"  =  $"}{fmt(r.total_base)}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              ) : tomando === i ? (
                /* TOMAR UN RUBRO DEL CONTRATO PARA ADICIONARLO.
                   Más metros del mismo piso, dos puertas más de las mismas.
                   No toca el rubro original —el contrato no se modifica— pero
                   se lleva su descripción, su unidad y su PRECIO CONTRACTUAL,
                   que es el que ya se negoció. Tipearlo de nuevo es como
                   aparece un adicional al mismo trabajo con otro precio, y esa
                   diferencia la encuentra el que paga. */
                <select autoFocus value="" style={{ ...mini, padding: "6px 8px" }}
                  onChange={e => {
                    const r = rubros.find(x => String(x.id) === e.target.value);
                    setTomando(null);
                    if (!r) return;
                    setLineas(v => v.map((x, k) => k === i ? {
                      ...x,
                      descripcion: r.descripcion || "",
                      unidad: r.unidad || "u",
                      precio_unitario: r.precio_unitario ?? "",
                      rubro_codigo: r.numero || "",
                    } : x));
                  }}>
                  <option value="">Elegí el rubro del que sale el precio…</option>
                  {porCapitulo.map(([capitulo, suyos]) => (
                    <optgroup key={capitulo} label={capitulo}>
                      {suyos.map(r => (
                        <option key={r.id} value={r.id}>
                          {r.numero}. {String(r.descripcion || "").slice(0, 52)}
                          {"  ·  "}{Number(r.cantidad) || 0} {r.unidad || ""} × ${fmt(r.precio_unitario)}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              ) : (
                <div>
                  <input value={l.descripcion} onChange={e => setLineas(v => v.map((x, k) => k === i ? { ...x, descripcion: e.target.value } : x))}
                    placeholder="Qué se adiciona" style={{ ...mini, padding: "6px 8px", width: "100%" }} />
                  <div style={{ display: "flex", gap: 7, alignItems: "baseline", marginTop: 2 }}>
                    <button onClick={() => setTomando(i)}
                      style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: colors.font,
                        fontSize: 10.5, color: colors.brand, textDecoration: "underline" }}>
                      tomar del presupuesto
                    </button>
                    {l.rubro_codigo && (
                      <span style={{ fontSize: 10, color: colors.muted }}>
                        precio del rubro {l.rubro_codigo}
                      </span>
                    )}
                  </div>
                </div>
              )}
              <input value={l.unidad} onChange={e => setLineas(v => v.map((x, k) => k === i ? { ...x, unidad: e.target.value } : x))}
                placeholder="und" style={{ ...mini, padding: "6px 5px", fontSize: 11.5 }} />
              <input type="number" step="0.01" value={l.cantidad} onChange={e => setLineas(v => v.map((x, k) => k === i ? { ...x, cantidad: e.target.value } : x))}
                placeholder="cant" style={{ ...mini, padding: "6px 5px", fontSize: 11.5, textAlign: "right" }} />
              <input type="number" step="0.01" value={l.precio_unitario} onChange={e => setLineas(v => v.map((x, k) => k === i ? { ...x, precio_unitario: e.target.value } : x))}
                placeholder="0.00" style={{ ...mini, padding: "6px 5px", fontSize: 11.5, textAlign: "right" }} />
              <span style={{ fontSize: 11.5, fontWeight: 600, textAlign: "right", whiteSpace: "nowrap",
                color: l.tipo === "quita" ? colors.danger : colors.ink }}>
                {l.tipo === "quita" ? "−" : ""}${fmt((Number(l.cantidad) || 0) * (Number(l.precio_unitario) || 0))}
              </span>
              <button onClick={() => setLineas(v => v.length === 1 ? [LINEA()] : v.filter((_, k) => k !== i))}
                style={{ background: "none", border: "none", color: colors.border, cursor: "pointer", display: "flex", padding: 2 }}>
                <Trash2 size={12} />
              </button>
              {/* EL COSTO, DEBAJO DEL PRECIO Y APARTE DE ÉL.
                  El precio es lo que se cobra, y se corrige para ponerle el
                  margen. El costo es lo que dijo el proveedor. En la misma
                  casilla, ponerle margen al precio borraba lo que cuesta, y
                  al liquidar la obra nadie sabía cuánto dejó la orden. No va
                  en el documento: es de la oficina. */}
              {l.tipo !== "quita" && (
                <div style={{ gridColumn: "3 / -1", display: "flex", gap: 7, alignItems: "center", marginTop: -2, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10, color: colors.muted, fontWeight: 700, letterSpacing: 0.3 }}>COSTO U.</span>
                  <input type="number" step="0.01" value={l.costo_unitario ?? ""}
                    onChange={e => setLineas(v => v.map((x, k) => k === i ? { ...x, costo_unitario: e.target.value } : x))}
                    placeholder="no se sabe" style={{ ...mini, padding: "3px 6px", fontSize: 11, width: 90, textAlign: "right" }} />
                  {l.costo_unitario !== "" && l.costo_unitario != null && (() => {
                    const cobro = (Number(l.cantidad) || 0) * (Number(l.precio_unitario) || 0);
                    const margen = cobro - (Number(l.cantidad) || 0) * (Number(l.costo_unitario) || 0);
                    return (
                      <span style={{ fontSize: 10.5, color: margen < 0 ? colors.danger : margen > 0 ? colors.success : colors.muted }}>
                        margen {margen < 0 ? "−" : ""}${fmt(Math.abs(margen))}{cobro ? ` · ${Math.round((margen / cobro) * 1000) / 10}%` : ""}
                        {margen === 0 && " · se está cobrando al costo"}
                      </span>
                    );
                  })()}
                </div>
              )}
            </div>
          ))}
          <button onClick={() => setLineas(v => [...v, LINEA()])}
            style={{ background: "none", border: `1px dashed ${colors.border}`, borderRadius: 7, padding: "6px 10px",
              color: colors.inkSoft, fontSize: 11.5, cursor: "pointer", fontFamily: colors.font }}>
            <Plus size={11} style={{ verticalAlign: -1 }} /> Otra partida
          </button>
        </div>

        {/* PONERLE EL MARGEN A TODA LA ORDEN DE UNA VEZ.
            Renglón por renglón, con la calculadora al lado, es donde se cuela
            la partida cobrada al costo entre veinte. */}
        {margen.conCosto > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", fontSize: 11.5, color: colors.inkSoft }}>
            <span>Precio = costo +</span>
            <input type="number" step="1" value={pctMargen} onChange={e => setPctMargen(e.target.value)}
              placeholder="15" style={{ ...mini, padding: "3px 6px", fontSize: 11.5, width: 64, textAlign: "right" }} />
            <span>%</span>
            <Button variant="outline" size="sm" disabled={pctMargen === ""}
              onClick={() => setLineas(v => conMargen(v, pctMargen))}>
              Aplicar a las {margen.conCosto} partidas con costo
            </Button>
          </div>
        )}

        {conMonto.length > 0 && (
          <div style={{ display: "flex", gap: 16, background: colors.bg, borderRadius: 8, padding: "9px 12px", flexWrap: "wrap" }}>
            {margen.conCosto > 0 && (
              <div title="Lo que se cobra contra lo que cuesta, en las partidas con costo. No sale en el documento.">
                <div style={{ fontSize: 9.5, fontWeight: 700, color: colors.muted, letterSpacing: 0.3 }}>
                  MARGEN{margen.sinCosto ? ` · ${margen.sinCosto} SIN COSTO` : ""}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: margen.margen < 0 ? colors.danger : colors.success }}>
                  {margen.margen < 0 ? "−" : ""}${fmt(Math.abs(margen.margen))}{margen.pct != null ? ` · ${margen.pct}%` : ""}
                </div>
              </div>
            )}
            {/* `subtotales` devuelve adiciones/reducciones, no agrega/quita.
                Leyendo los nombres equivocados daban undefined → 0, y el
                cuadro mostraba "AGREGA $0 · QUITA $0 · NETO $465,40": tres
                números de los cuales uno solo era cierto, que es peor que no
                mostrar ninguno. */}
            {[["Adiciones", sub.adiciones, colors.brand], ["Reducciones", sub.reducciones, colors.danger], ["Neto", sub.total, sub.total < 0 ? colors.success : colors.danger]].map(([k, v, c]) => (
              <div key={k}>
                <div style={{ fontSize: 9.5, fontWeight: 700, color: colors.muted, letterSpacing: 0.3 }}>{k.toUpperCase()}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: c }}>
                  {k === "Neto" ? (Number(v) < 0 ? "−" : "+") : ""}
                  ${(Math.abs(Number(v) || 0)).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            ))}
            {/* LOS HONORARIOS NO ENCARECEN EL RUBRO. Van al pie, como el IVA, y
                al aprobarse entran al control en el capítulo de HONORARIOS.
                Repartirlos dentro de los precios dejaría a cada partida
                mintiendo sobre lo que cuesta, que es el número contra el que
                después se compara una cotización. */}
            {hon.hay && (
              <div>
                <div style={{ fontSize: 9.5, fontWeight: 700, color: colors.muted, letterSpacing: 0.3 }}>
                  HONORARIOS {hon.pct}%
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: hon.devuelve ? colors.success : colors.brand }}>
                  {hon.devuelve ? "−" : "+"}${fmt(Math.abs(hon.honorarios))}
                </div>
              </div>
            )}
            {hon.hay && (
              <div>
                <div style={{ fontSize: 9.5, fontWeight: 700, color: colors.muted, letterSpacing: 0.3 }}>TOTAL</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: colors.ink }}>
                  {hon.subtotal < 0 ? "−" : "+"}${fmt(Math.abs(hon.subtotal))}
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 110px", gap: 8 }}>
          <div>
            <label style={lbl}>HONORARIOS SOBRE EL NETO DE ESTA ORDEN</label>
            <div style={{ fontSize: 10.5, color: colors.muted, marginBottom: 3 }}>
              El porcentaje del contrato. Se cobra sobre el neto —si la orden reduce alcance, el honorario
              baja igual— y va como línea al pie: no se reparte en los precios de las partidas.
            </div>
          </div>
          <div>
            <label style={lbl}>%</label>
            <input type="number" step="0.01" value={f.honorarios_pct}
              onChange={e => setF(v => ({ ...v, honorarios_pct: e.target.value }))}
              placeholder="10" style={mini} />
          </div>
        </div>

        {/* ¿CORRE EL PLAZO? SÍ O NO, Y NO EL SILENCIO.
            El campo vacío se imprimía como "Sin impacto en el cronograma", que
            es una afirmación que nadie hizo. Decir que no corre es hacerse
            cargo; no contestar es otra cosa, y tiene que verse. */}
        <div style={{ marginBottom: 8 }}>
          <label style={lbl}>CAPÍTULO III · ¿CORRE EL PLAZO DE ENTREGA?</label>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 3 }}>
            {[[true, "Sí, lo corre"], [false, "No lo corre"]].map(([valor, texto]) => {
              const puesto = f.impacta_crono === valor;
              return (
                <button key={String(valor)} type="button"
                  onClick={() => setF(v => ({ ...v, impacta_crono: puesto ? null : valor,
                    dias_impacto: valor === false ? "" : v.dias_impacto }))}
                  style={{ border: `1px solid ${puesto ? (valor ? colors.warning : colors.success) : colors.border}`,
                    background: puesto ? (valor ? colors.warning : colors.success) : "#fff",
                    color: puesto ? "#fff" : colors.muted,
                    borderRadius: 20, padding: "4px 14px", fontSize: 11.5, cursor: "pointer",
                    fontFamily: colors.font, fontWeight: puesto ? 700 : 400 }}>
                  {texto}
                </button>
              );
            })}
            {f.impacta_crono === true && (
              <>
                <input type="number" value={f.dias_impacto}
                  onChange={e => setF(v => ({ ...v, dias_impacto: e.target.value }))}
                  placeholder="0" style={{ ...mini, width: 80 }} />
                <span style={{ fontSize: 11, color: colors.muted }}>días</span>
              </>
            )}
            {f.impacta_crono == null && (
              <span style={{ fontSize: 10.5, color: colors.warning }}>
                Sin contestar, el papel no va a decir que no corre: va a decir que no se definió.
              </span>
            )}
          </div>
          <input value={f.impacto_cronograma} onChange={e => setF(v => ({ ...v, impacto_cronograma: e.target.value }))}
            placeholder={f.impacta_crono === false
              ? "Por qué no lo corre, si hace falta decirlo"
              : "Qué se atrasa y por qué"}
            style={{ ...mini, marginTop: 6 }} />
        </div>
        <div style={{ fontSize: 10, color: colors.muted, marginTop: -4 }}>
          Esos días los lee el cronograma valorado cuando la orden se aprueba, para ofrecer extender el plazo.
        </div>
      </div>

      {error && <div style={{ fontSize: 12, color: colors.danger, marginTop: 10 }}>{error}</div>}

      {/* TRES CAMINOS Y NADA MÁS, porque son los tres que existen.
          Acá había un "Guardar y aprobar" que no es ninguno de los tres:
          aprobar una orden es registrar que el CLIENTE la aceptó, y aprobarse
          uno mismo lo que uno acaba de escribir deja en el papel que el
          contratante que la aprobó sos vos. Eso sigue existiendo —hace falta
          cuando el cliente la firmó por fuera— pero vive en la orden ya
          guardada, que es donde se registra algo que pasó, y no acá. */}
      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        <Button variant={conMonto.length ? "secondary" : "primary"} onClick={() => guardar()} disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar"}
        </Button>
        {/* El visto es interno y es sobre el precio: una vez que el cliente lo
            vio, bajarlo es una negociación y subirlo es imposible. */}
        {!puedeAprobar && (
          <Button variant="primary" onClick={() => guardar("pedir-visto")} disabled={guardando || !conMonto.length}>
            Guardar y pedir el visto
          </Button>
        )}
        {puedeAprobar && (
          <Button variant="primary" onClick={() => guardar("mandar")} disabled={guardando || !conMonto.length}>
            Guardar y enviar al cliente
          </Button>
        )}
        <Button variant="secondary" onClick={cancelar}>Cancelar</Button>
      </div>
      <div style={{ fontSize: 10.5, color: colors.muted, marginTop: 7, lineHeight: 1.5 }}>
        {!conMonto.length
          ? "Guardar NO la envía a nadie: queda en construcción, en la lista de la obra, y la seguís armando cuando llegue la cotización. El argumento no se pierde."
          : puedeAprobar
            ? "Guardar la deja en construcción. Enviar al cliente le manda a cada uno que firma su propio enlace para aprobarla o devolverla con comentarios; la orden entra al presupuesto cuando firman todos."
            : "Guardar la deja en construcción. Pedir el visto le manda la orden en PDF al Director, que la aprueba desde el correo; recién después se envía al cliente."}
      </div>
    </Modal>
  );
}
