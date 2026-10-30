import { useState, useEffect, useCallback } from "react";
import { Upload, Sparkles, TrendingUp, TrendingDown, Plus, Trash2, Check, X, Paperclip } from "lucide-react";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import { fmt } from "./calculos";
import { compararContraPresupuesto } from "./compararProforma";
import { LECTURA, textoDeNova } from "../../lib/modelos";
import { beneficiosDe, guardarVarios, guardarBeneficio, borrarBeneficio, totalesPorOrigen, esDeOrden, hojaComoTexto, esPrevisto, guardarProforma, enlacesDeProformas } from "./beneficios";
import { ordenesMudas } from "./cuentaBeneficios.js";
import { sincronizarBeneficios } from "./cotizacionesOrden";
import { cargarOrdenes } from "./ordenesDeCambio";
import { FORMATO, interpretarRespuesta, partirHoja, renglonesDeHoja, PROMPT_RUBROS, asignacionDeTexto } from "./leerProforma.js";
import { reconocerExcel } from "../../lib/leerExcelPresupuesto";
import { comprimirImagen, noEntraElArchivo } from "../../lib/imagenes";

// Lo que cotizan hoy contra lo que se presupuestó.
//
// Entre que se arma el presupuesto y que se compra pasan meses, y el precio no
// es el mismo. A veces se consigue mejor —descuento por volumen, bajó el acero,
// se cambió de marca— y a veces peor. Esa diferencia es el BENEFICIO de la
// obra, y es de donde sale la utilidad real: no de vender más caro, sino de
// comprar mejor que lo presupuestado.
//
// Hoy se mira a ojo, con el presupuesto en una pantalla y la proforma en la
// mano. Y cuando se mira a ojo lo que se ve son los ahorros: lo que se pasó de
// precio no salta, porque nadie busca malas noticias.

const n = v => Number(v) || 0;

export default function PanelBeneficios({ obra, rubros = [], currentUser }) {
  const [items, setItems] = useState([]);
  const [proveedor, setProveedor] = useState("");
  const [ordenes, setOrdenes] = useState([]);
  const [lineasDeOrdenes, setLineasDeOrdenes] = useState({});
  const [leyendo, setLeyendo] = useState(false);
  const [paso, setPaso] = useState("");
  // Cuando NOVA se quedó sin espacio antes de terminar la proforma.
  const [faltan, setFaltan] = useState("");
  // EL PAPEL CON EL QUE SE HIZO LA CUENTA. Se guarda recién al guardar los
  // beneficios: una proforma que se miró y se descartó no deja basura en el
  // depósito, y la que sostiene un número queda guardada tal como vino.
  const [archivo, setArchivo] = useState(null);
  const [error, setError] = useState("");
  // LO QUE YA SE GANÓ, GUARDADO. Antes la comparación se perdía al cerrar la
  // pantalla: servía para mirar una proforma y no para saber cómo va la obra.
  const [guardados, setGuardados] = useState([]);
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [aMano, setAMano] = useState(null);

  // Los enlaces a las proformas guardadas, firmados al cargar la pantalla.
  const [enlaces, setEnlaces] = useState({});
  const [avisoOrdenes, setAvisoOrdenes] = useState("");

  const cargar = useCallback(async () => {
    if (!obra?.id) return;
    // Lo que dejan las órdenes de cambio se pone al día antes de leer: una
    // orden aprobada desde el portal no pasa por la oficina, y sin esto su
    // beneficio aparecería recién cuando alguien abra las órdenes.
    const sync = await sincronizarBeneficios(obra.id);
    setAvisoOrdenes(sync.error || "");
    const r = await beneficiosDe(obra.id);
    if (r.error) { setError(r.error); return; }
    setGuardados(r.beneficios);
    setEnlaces(await enlacesDeProformas(r.beneficios));
    // Y las órdenes, para poder decir cuáles NO están sumando y por qué: una
    // orden aprobada que no llega acá se va en silencio y la utilidad de la
    // obra queda más baja de lo que es.
    const oc = await cargarOrdenes(obra.id);
    setOrdenes(oc.ordenes || []);
    setLineasDeOrdenes(oc.lineas || {});
  }, [obra?.id]);
  useEffect(() => { cargar(); }, [cargar]);

  const porOrigen = totalesPorOrigen(guardados);
  const t = porOrigen.obra;
  const tc = porOrigen.compras;
  const to = porOrigen.ordenes;
  const hayOrdenes = guardados.some(esDeOrden);
  // Las órdenes aprobadas que no llegan a Beneficios, con el motivo: sin eso
  // desaparecen en silencio y la utilidad de la obra queda más baja de lo que
  // es, sin que nada lo diga.
  const mudas = ordenesMudas(ordenes, lineasDeOrdenes);

  const r = compararContraPresupuesto(items, rubros);
  // Renglones sin precio: títulos de sección, opcionales, notas al pie que
  // el lector tomó por material. No son un beneficio de nada.
  const enCero = items.filter(x => !n(x.monto)).length;
  const vivos = rubros.filter(x => !x.oculto && !x.anulado_por_oc);

  // UN PEDIDO A NOVA, CON LOS ERRORES DICHOS EN CASTELLANO.
  //
  // Cuando la función se corta, lo que vuelve no es JSON sino la página de
  // error del servidor. Leerla como datos da «Unexpected token 'A'...», que no
  // le dice nada a nadie y parece que se rompió el programa entero.
  async function pedirTexto(body) {
    const res = await fetch("/api/nova", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (!data) {
      if (res.status === 413) throw new Error("El archivo pesa demasiado para mandarlo. Sacale páginas al PDF, o mandá una foto en vez del PDF entero.");
      if (res.status === 504) throw new Error("NOVA se demoró más de un minuto leyendo y el servidor la cortó. Si es un PDF de varias hojas, mandá solo las que tienen los precios.");
      throw new Error(`El servidor se cortó leyendo el archivo (${res.status}). Si es muy grande, probá con una parte.`);
    }
    if (!res.ok || data?.error) throw new Error(data?.error?.message || data?.error || "NOVA no pudo leerla.");
    return { texto: textoDeNova(data) || "", cortado: data?.stop_reason === "max_tokens" };
  }

  /**
   * A qué rubro va cada renglón, que es lo único que la planilla no dice.
   *
   * Se pregunta en corto —"3:44"— en vez de hacerle reescribir la proforma
   * entera para agregarle una columna.
   */
  async function conRubros(renglones, lista) {
    const salida = renglones.map(x => ({ ...x }));
    const TANDA = 120;
    for (let i = 0; i < salida.length; i += TANDA) {
      if (salida.length > TANDA) setPaso(`emparejando ${i + 1}-${Math.min(i + TANDA, salida.length)} de ${salida.length}`);
      const tanda = salida.slice(i, i + TANDA);
      const { texto } = await pedirTexto({
        model: LECTURA, max_tokens: 2000,
        system: `${PROMPT_RUBROS}\n\nRubros de la obra: ${lista}`,
        messages: [{ role: "user", content: tanda.map((x, k) => `${i + k}: ${x.descripcion}`).join("\n") }],
      });
      for (const [indice, id] of asignacionDeTexto(texto)) {
        if (salida[indice]) salida[indice].rubro_id = id;
      }
    }
    return salida;
  }

  async function leer(e) {
    let file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setLeyendo(true); setError(""); setPaso(""); setFaltan(""); setArchivo(null);
    try {
      // LA FOTO SE ACHICA ANTES DE MANDARLA.
      //
      // Una foto de teléfono pesa seis u ocho megas, y el pedido no puede pasar
      // de cuatro y medio: lo rechaza el servidor antes de que el código llegue
      // a correr, y lo que vuelve no es un error sino una página de error.
      if (/^image\//.test(file.type || "")) file = await comprimirImagen(file);
      const esHoja = /\.(xlsx|xlsm|xls)$/i.test(file.name || "");
      const b64 = esHoja ? null : await new Promise(res => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result.split(",")[1]);
        fr.readAsDataURL(file);
      });
      const esPdf = file.type === "application/pdf";
      // Antes de hacer esperar a nadie por un viaje que ya sabemos que falla.
      const pesa = noEntraElArchivo(b64, file);
      if (pesa) throw new Error(pesa);
      const lista = vivos.slice(0, 220).map(x => `${x.id}:${x.descripcion.slice(0, 60)}`).join(" | ");

      // UNA PLANILLA NO SE TRANSCRIBE: SE LEE.
      //
      // Es lo que hace el importador de presupuestos desde siempre, y por eso
      // nunca se corta. A NOVA se le pide que diga cuál columna es cuál —cuatro
      // números— y las filas las lee el código, que no se queda sin espacio ni
      // se equivoca copiando un monto. Lo único que la planilla no dice es a qué
      // rubro de la obra va cada renglón, y eso se pregunta aparte y en corto.
      let renglones = null, quien = "";
      if (esHoja) {
        setPaso("reconociendo las columnas");
        try {
          const { filas, mapa, datos } = await reconocerExcel(file);
          const leidos = renglonesDeHoja(filas, mapa);
          if (leidos.length) { renglones = leidos; quien = String(datos?.emisor || "").trim(); }
        } catch (err) { void err; } // si no se reconocen las columnas, se lee como texto
      }

      let juntos = [];
      let cortado = false;

      if (renglones) {
        juntos = await conRubros(renglones, lista);
      } else {
        const sistema = `Eres NOVA. Lees proformas de proveedores de construcción en Ecuador.

${FORMATO}

"monto" es lo que suma ESE renglón SIN IVA: su subtotal, antes de impuestos.

EL IVA VA SIEMPRE AFUERA. No es del proveedor ni nuestro: es del fisco. El
presupuesto de la obra está cargado sin IVA —el IVA se calcula aparte al
final—, así que comparar contra un monto con IVA adentro inventa un sobreprecio
del 15% que no existe. Si la proforma muestra los renglones con IVA y el
subtotal abajo, devolvé los del subtotal.

"rubro_id" es el rubro de la lista al que corresponde ese renglón, o un guion si
no estás seguro. El guion es una respuesta válida y es mejor que adivinar: acá
se está midiendo si se compró mejor o peor que lo presupuestado, y un renglón
comparado contra el rubro equivocado da un ahorro o un sobreprecio que no existe.

Rubros de la obra: ${lista}`;

        // UNA PLANILLA DE EXCEL NO SE LE PASA AL MODELO COMO ARCHIVO: adentro
        // es un zip. Se vuelca como texto, y si es larga va por partes: el
        // modelo tiene un techo de escritura y la función uno de tiempo.
        const texto = esHoja ? await hojaComoTexto(file) : null;
        const bloques = esHoja ? partirHoja(texto, 60) : [null];
        if (!bloques.length) throw new Error("La planilla no tiene filas con datos.");

        for (let i = 0; i < bloques.length; i++) {
          setPaso(bloques.length > 1 ? `parte ${i + 1} de ${bloques.length}` : "");
          const { texto: salida, cortado: seCorto } = await pedirTexto({
            model: LECTURA, max_tokens: 3000, system: sistema,
            messages: [{
              role: "user",
              content: esHoja
                ? [{ type: "text", text: `Esta es una planilla de Excel volcada tal cual, una fila por renglón y las celdas separadas por |. Encontrá la columna de descripción, la de cantidad, la de unidad y la del total de cada renglón. Ignorá encabezados, subtotales y totales generales.\n\n${bloques[i]}\n\nExtrae los renglones.` }]
                : [
                  esPdf
                    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
                    : { type: "image", source: { type: "base64", media_type: file.type || "image/jpeg", data: b64 } },
                  { type: "text", text: "Extrae los renglones de esta proforma." },
                ],
            }],
          });
          const leido = interpretarRespuesta(salida);
          // SE QUEDÓ SIN ESPACIO ANTES DE TERMINAR. La última línea quedó a
          // medio escribir, y un monto cortado —"48" de "48,90"— entra como un
          // renglón que parece bueno. Se tira: un renglón de menos se ve, un
          // monto mal no.
          if (seCorto) { leido.items.pop(); cortado = true; }
          if (leido.proveedor && !quien) quien = leido.proveedor;
          juntos.push(...leido.items);
        }
      }

      if (cortado) setFaltan(`Se leyeron ${juntos.length} renglones y la proforma seguía: NOVA se quedó sin espacio. Revisá el final contra el papel, o mandá las hojas que faltan aparte.`);
      if (!juntos.length) throw new Error("NOVA no encontró renglones con precios en el archivo. Si es una foto, que se lean los números; si es un PDF escaneado, probá con una foto de la hoja de precios.");
      setProveedor(quien);
      setArchivo(file);
      setItems(juntos
        .filter(x => x.descripcion || x.monto)
        .map((x, k) => ({ ...x, k, rubro_id: vivos.some(v => v.id === x.rubro_id) ? x.rubro_id : null })));
    } catch (e2) {
      setError(e2.message);
    }
    setPaso("");
    setLeyendo(false);
  }

  /**
   * GUARDAR LO COMPARADO.
   *
   * Hasta acá la comparación servía para mirar una proforma y se perdía al
   * cerrar la pantalla. Un beneficio que no queda escrito no se puede ir
   * acumulando, y entonces la pregunta que importa —"¿cuánto llevamos ganado
   * contra el presupuesto?"— no se puede contestar hasta el cierre, que es
   * cuando ya no sirve para decidir nada.
   *
   * Solo los renglones emparejados: uno sin rubro no se compara contra nada.
   */
  async function guardarComparacion() {
    const van = r.lineas.filter(l => l.presupuestado != null);
    if (!van.length) { setError("Ningún renglón tiene rubro: no hay nada que comparar todavía."); return; }
    setOcupado(true); setError(""); setAviso("");

    // Primero el papel. Si el depósito falla no se pierde el trabajo: se
    // guardan igual los números y se dice que el archivo no quedó, que es algo
    // que se puede volver a subir. Al revés —perder la carga por un archivo—
    // sería cambiar un problema chico por uno grande.
    let papel = {};
    if (archivo) {
      setAviso("Guardando la proforma…");
      papel = await guardarProforma(obra.id, archivo);
    }

    const res = await guardarVarios(van.map(l => ({
      obra_id: obra.id, obra_rubro_id: l.rubro_id ?? null,
      descripcion: l.descripcion, cantidad: n(l.cantidad) || null, unidad: l.unidad || null,
      presupuestado: n(l.presupuestado), real: n(l.cotizado),
      proveedor: proveedor || null, origen: "proforma",
      archivo_path: papel.path || null, archivo_nombre: papel.nombre || null,
      // LO QUE SALE DE UNA PROFORMA NACE PREVISTO. Una proforma dice lo que va
      // a costar, no lo que costó: entre que el proveedor cotiza y la factura
      // llega se cae la mitad. Se confirma de a uno cuando la compra se cierra.
      estado: "previsto",
      creado_por: currentUser?.id ?? null, creado_nombre: currentUser?.name || null,
    })));
    setOcupado(false);
    if (res.error) { setError(res.error); return; }
    setItems([]); setProveedor(""); setArchivo(null);
    await cargar();
    setAviso(`${res.guardados} ${res.guardados === 1 ? "beneficio guardado" : "beneficios guardados"}.`
      + (papel.path ? " La proforma queda guardada como respaldo." : ""));
    if (papel.error) setFaltan(`Los beneficios se guardaron, pero la proforma no se pudo guardar como respaldo: ${papel.error}`);
  }

  async function guardarAMano() {
    const f = aMano || {};
    if (!String(f.descripcion || "").trim()) { setError("Escribí qué se compró."); return; }
    setOcupado(true); setError("");
    const rubro = vivos.find(x => String(x.id) === String(f.obra_rubro_id));
    const res = await guardarBeneficio({
      id: f.id,
      obra_id: obra.id, obra_rubro_id: f.obra_rubro_id ? Number(f.obra_rubro_id) : null,
      descripcion: f.descripcion.trim(),
      // Si se eligió un rubro y no se escribió lo presupuestado, se toma el del
      // rubro: es el número contra el que hay que comparar y ya está cargado.
      presupuestado: n(f.presupuestado) || (rubro ? n(rubro.total_base) : 0),
      real: n(f.real), proveedor: f.proveedor || null, nota: f.nota || null,
      origen: "manual", fecha: f.fecha || undefined,
      // A mano lo decide quien escribe: muchos beneficios reales no tienen
      // papel —se negoció por teléfono— y esos ya están cobrados.
      estado: f.previsto ? "previsto" : "confirmado",
      creado_por: currentUser?.id ?? null, creado_nombre: currentUser?.name || null,
    });
    setOcupado(false);
    if (res.error) { setError(res.error); return; }
    setAMano(null);
    await cargar();
    setAviso("Guardado.");
  }

  const Tarjeta = ({ label, valor, color, icono }) => (
    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`,
      borderRadius: colors.radiusMd, padding: "10px 12px", minWidth: 120 }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, color: colors.muted, letterSpacing: 0.3,
        display: "flex", alignItems: "center", gap: 4 }}>{icono}{label}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color: color || colors.ink, marginTop: 2 }}>${fmt(valor)}</div>
    </div>
  );

  return (
    <div>
      <div style={{ fontSize: 12.5, color: colors.inkSoft, lineHeight: 1.55, marginBottom: 12 }}>
        Subí una proforma y NOVA la compara contra los rubros del presupuesto, renglón por renglón.
        La diferencia es el <strong>beneficio de la obra</strong>: no sale de vender más caro, sale de
        comprar mejor que lo presupuestado.
      </div>

      <div style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: leyendo ? "wait" : "pointer",
          background: colors.brand, borderRadius: colors.radiusSm, padding: "8px 13px",
          fontSize: 12.5, fontWeight: 600, color: "#fff", fontFamily: colors.font }}>
          <Upload size={13} /> {leyendo ? (paso ? `NOVA está leyendo… ${paso}` : "NOVA está leyendo…") : "Subir una proforma (PDF, foto o Excel)"}
          <input type="file" accept="image/*,.pdf,.xlsx,.xlsm,.xls" onChange={leer} disabled={leyendo} style={{ display: "none" }} />
        </label>
        {proveedor && (
          <input value={proveedor} onChange={e => setProveedor(e.target.value)}
            style={{ ...inputStyle, width: 240, padding: "7px 10px", fontSize: 12.5 }} />
        )}
        {items.length > 0 && (
          <button onClick={() => { setItems([]); setProveedor(""); setArchivo(null); }}
            style={{ background: "none", border: "none", color: colors.muted, fontSize: 11.5,
              cursor: "pointer", fontFamily: colors.font }}>empezar de nuevo</button>
        )}
      </div>

      {error && <div style={{ fontSize: 12, color: colors.danger, marginBottom: 10 }}>{error}</div>}
      {faltan && <div style={{ fontSize: 12, color: colors.warning, marginBottom: 10 }}>{faltan}</div>}
      {aviso && <div style={{ fontSize: 12, color: colors.success, marginBottom: 10 }}>{aviso}</div>}

      {items.length > 0 && (
        <>
          {/* AHORRO Y SOBREPRECIO POR SEPARADO, nunca solo el neto.
              Un neto de "+$300" puede esconder $4.000 de ahorro y $3.700 de
              sobreprecio, y esas son dos obras muy distintas: la primera
              compra bien y tiene un problema puntual; la segunda no sabe lo
              que le está pasando. */}
          <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginBottom: 12 }}>
            <Tarjeta label="PRESUPUESTADO" valor={r.presupuestado} />
            <Tarjeta label="COTIZADO" valor={r.cotizado} />
            <Tarjeta label="SE AHORRA" valor={r.ahorro} color={colors.success}
              icono={<TrendingDown size={11} color={colors.success} />} />
            <Tarjeta label="SE PASA" valor={r.sobreprecio} color={colors.danger}
              icono={<TrendingUp size={11} color={colors.danger} />} />
            <Tarjeta label="NETO" valor={r.neto} color={r.neto >= 0 ? colors.success : colors.danger} />
            <div style={{ display: "flex", alignItems: "center" }}>
              <Button variant="primary" size="sm" disabled={ocupado} onClick={guardarComparacion}>
                <Check size={13} /> {ocupado ? "Guardando…" : "Guardar como previstos"}
              </Button>
            </div>
          </div>

          {r.sinRubro > 0 && (
            <div style={{ fontSize: 11.5, color: colors.warning, background: colors.warningSoft,
              border: `1px solid ${colors.warningBorder}`, borderRadius: colors.radiusMd,
              padding: "8px 11px", marginBottom: 10, lineHeight: 1.5 }}>
              Hay <strong>{r.sinRubro}</strong> {r.sinRubro === 1 ? "renglón" : "renglones"} sin emparejar con un
              rubro. No entran en ningún total: un beneficio calculado sobre la mitad de la proforma no es un
              beneficio. Elegiles el rubro abajo, sacalos de la comparación — o, si es trabajo que el presupuesto
              no tenía, cobráselos al cliente con el botón de acá abajo.
            </div>
          )}

          {/* LO QUE NO ESTÁ EN EL CONTRATO NO SE RESUELVE ACÁ.
              Un BENEFICIO es una diferencia a favor del proyecto sobre algo
              que YA ESTÁ CONTRATADO: el rubro se presupuestó en $1.000 y se
              compró en $800. Esos $200 son nuestros y suben la utilidad.

              Un renglón que el contrato no cubre es otra cosa entera: no es
              utilidad nuestra, es plata que sale de la obra y que hay que
              COBRARLE AL CLIENTE. Eso se analiza y se resuelve en Diferencias
              con el cliente, que compara el presupuesto contra una propuesta
              nueva o una liquidación. Acá solo se dice que están, y no entran
              en ningún total. */}
          {r.sinRubro > 0 && (
            <div style={{ fontSize: 11.5, color: colors.inkSoft, marginBottom: 10, lineHeight: 1.5 }}>
              Si esos {r.sinRubro === 1 ? "renglón es trabajo" : "renglones son trabajo"} que el contrato no cubre,
              no {r.sinRubro === 1 ? "es un beneficio" : "son beneficios"}: hay que cobrárselo al cliente.
              Eso se arma en <strong>Diferencias con el cliente</strong>.
            </div>
          )}

          {/* SOLO SE COMPARA LO MISMO CONTRA LO MISMO. Con la misma cantidad,
              el total contra el total. Con cantidades distintas lo único
              comparable es el precio unitario: el rubro son 120 varillas y la
              proforma cotiza 80, y los dos totales uno al lado del otro dirían
              que se ahorró un tercio cuando lo que pasó es que se compró menos
              material. */}
          {r.porUnitario > 0 && (
            <div style={{ fontSize: 11.5, color: colors.inkSoft, marginBottom: 10, lineHeight: 1.5 }}>
              En <strong>{r.porUnitario}</strong> {r.porUnitario === 1 ? "renglón" : "renglones"} la cantidad de la
              proforma no es la del presupuesto, así que ahí se compara el <strong>precio unitario</strong> y la
              diferencia se mide sobre lo que de verdad se está comprando. Comparar los totales diría que se ahorró
              cuando lo que cambió es cuánto material se compra.
            </div>
          )}

          {/* QUITAR DE A MUCHOS. Una proforma trae renglones en cero —títulos,
              opcionales, cosas sin precio— y cosas que esta obra no tiene
              presupuestadas. Sacarlos de a uno con la X es la mitad de la
              tarde cuando son treinta. */}
          {(enCero > 0 || r.sinRubro > 0) && (
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 9 }}>
              {enCero > 0 && (
                <button onClick={() => setItems(xs => xs.filter(x => n(x.monto)))}
                  style={{ background: "none", border: "none", padding: 0, color: colors.muted,
                    fontSize: 11.5, cursor: "pointer", fontFamily: colors.font, textDecoration: "underline" }}>
                  quitar los {enCero} que están en $0
                </button>
              )}
              {r.sinRubro > 0 && (
                <button onClick={() => setItems(xs => xs.filter(x => vivos.some(v => v.id === Number(x.rubro_id))))}
                  style={{ background: "none", border: "none", padding: 0, color: colors.muted,
                    fontSize: 11.5, cursor: "pointer", fontFamily: colors.font, textDecoration: "underline" }}>
                  quitar los {r.sinRubro} que no están en el presupuesto
                </button>
              )}
            </div>
          )}

          <div style={{ background: colors.surface, border: `1px solid ${colors.border}`,
            borderRadius: colors.radiusMd, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1.3fr 90px 90px 100px 24px", gap: 8,
              padding: "8px 12px", background: colors.bg, fontSize: 9.5, fontWeight: 700,
              color: colors.muted, letterSpacing: 0.3 }}>
              <span>RENGLÓN DE LA PROFORMA</span><span>RUBRO DEL PRESUPUESTO</span>
              <span style={{ textAlign: "right" }}>PRESUPUESTO</span>
              <span style={{ textAlign: "right" }}>COTIZADO</span>
              <span style={{ textAlign: "right" }}>DIFERENCIA</span>
              <span />
            </div>
            {r.lineas.map((l, i) => (
              <div key={l.k} style={{ display: "grid", gridTemplateColumns: "1.3fr 1.3fr 90px 90px 100px 24px", gap: 8,
                padding: "7px 12px", borderTop: `1px solid ${colors.neutralSoft}`, alignItems: "center", fontSize: 11.5 }}>
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  color: colors.ink }} title={l.descripcion}>
                  {l.descripcion}
                  {l.cantidad ? <span style={{ color: colors.muted }}> · {l.cantidad} {l.unidad}</span> : null}
                  {/* LAS CANTIDADES NO SON LAS MISMAS. Hay que decirlo donde se
                      mira el renglón: el número de la derecha salió de comparar
                      precios unitarios, no totales, y son dos cuentas
                      distintas aunque se vean iguales. */}
                  {l.porUnitario && (
                    <span style={{ display: "block", fontSize: 9.5, color: colors.warning }}>
                      el rubro son {l.cantidadRubro} {l.unidadRubro} · se compara el precio unitario
                    </span>
                  )}
                </span>
                <select value={l.rubro_id ?? ""}
                  onChange={e => setItems(xs => xs.map((x, j) => j === i
                    ? { ...x, rubro_id: e.target.value ? Number(e.target.value) : null } : x))}
                  style={{ ...inputStyle, padding: "4px 6px", fontSize: 11,
                    color: l.rubro_id ? colors.ink : colors.warning }}>
                  <option value="">¿contra qué rubro?</option>
                  {vivos.map(x => (
                    <option key={x.id} value={x.id}>{x.numero} · {x.descripcion.slice(0, 44)}</option>
                  ))}
                </select>
                <span style={{ textAlign: "right", color: colors.muted }}>
                  {l.presupuestado == null ? "—" : `$${fmt(l.presupuestado)}`}
                  {l.porUnitario && (
                    <span style={{ display: "block", fontSize: 9.5 }}>
                      ${fmt(l.puRubro)} × {l.cantidad}
                    </span>
                  )}
                </span>
                <div>
                  <input type="number" step="0.01" value={l.monto}
                    onChange={e => setItems(xs => xs.map((x, j) => j === i ? { ...x, monto: e.target.value } : x))}
                    style={{ ...inputStyle, padding: "4px 6px", fontSize: 11.5, textAlign: "right", width: "100%" }} />
                  {l.porUnitario && (
                    <span style={{ display: "block", fontSize: 9.5, color: colors.muted, textAlign: "right" }}>
                      ${fmt(l.puProforma)} × {l.cantidad}
                    </span>
                  )}
                </div>
                <span style={{ textAlign: "right", fontWeight: 700,
                  color: l.diferencia == null ? colors.muted : l.diferencia >= 0 ? colors.success : colors.danger }}>
                  {l.diferencia == null ? "—"
                    : `${l.diferencia >= 0 ? "+" : "−"}$${fmt(Math.abs(l.diferencia))}`}
                  {l.pct != null && (
                    <span style={{ fontWeight: 400, fontSize: 10, display: "block", color: colors.muted }}>
                      {l.pct > 0 ? "+" : ""}{l.pct}%
                    </span>
                  )}
                </span>
                {/* QUITAR EL RENGLÓN. Una proforma trae cosas que no son de
                    esta obra, renglones en cero y notas al pie que el lector
                    tomó por material. Si no se pueden sacar, estorban en la
                    pantalla y ensucian el total guardado. */}
                <button onClick={() => setItems(xs => xs.filter((_, j) => j !== i))}
                  title="Sacar este renglón de la comparación"
                  style={{ background: "none", border: "none", cursor: "pointer", color: colors.muted,
                    display: "flex", padding: 0 }}>
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {items.length === 0 && !leyendo && !guardados.length && !aMano && (
        <div style={{ textAlign: "center", color: colors.muted, padding: "34px 20px", fontSize: 13,
          background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd,
          display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <Sparkles size={26} />
          Subí la proforma de un proveedor y se compara sola contra el presupuesto.
          <span style={{ fontSize: 11.5 }}>O cargá un beneficio a mano: muchos no están en ningún papel.</span>
        </div>
      )}

      {/* ── LO QUE YA SE GANÓ (O SE PERDIÓ) EN ESTA OBRA ──────────────────
          La comparación de arriba es de una proforma; esto es la obra entera,
          y se va llenando a lo largo de los meses. Es la única manera de que
          la pregunta "¿cómo venimos contra el presupuesto?" tenga respuesta
          antes del cierre, que es cuando ya no sirve para decidir nada.

          A MANO TAMBIÉN, y no como excepción: la mitad de los beneficios de
          una obra no están en ningún papel —se negoció por teléfono, el
          contratista bajó el precio, se cambió una marca—. Si solo se pudieran
          cargar leyendo un archivo, esos no entrarían nunca y el total mentiría
          siempre para el mismo lado. */}
      <div style={{ marginTop: items.length ? 18 : 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", marginBottom: 9 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.ink, flex: 1 }}>
            Beneficios de la obra{t.cuantos ? ` · ${t.cuantos}` : ""}
          </div>
          {!aMano && (
            <Button variant="outline" size="sm" onClick={() => setAMano({ fecha: new Date().toISOString().slice(0, 10) })}>
              <Plus size={12} /> Cargar uno a mano
            </Button>
          )}
        </div>

        {avisoOrdenes && (
          <div style={{ fontSize: 11.5, color: colors.warning, marginBottom: 8 }}>
            {avisoOrdenes} Hasta entonces, lo que dejan las órdenes de cambio no aparece acá.
          </div>
        )}

        {/* COMPRAR MEJOR Y COBRAR UN ADICIONAL, APARTE.
            El beneficio de una compra es comprar abajo de lo presupuestado; el
            de una orden de cambio es lo que se cobra arriba de lo que cuesta.
            En un solo número, una obra que compra mal parece sana porque
            cobró bien los adicionales. Se muestran los dos, y la suma. */}
        {(tc.cuantos > 0 || tc.cuantosPrevistos > 0) && (
          <div style={{ marginBottom: 10 }}>
            {hayOrdenes && <div style={{ fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.4, marginBottom: 5 }}>COMPRANDO MEJOR</div>}
            <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
              {tc.cuantos > 0 && <>
                <Tarjeta label="PRESUPUESTADO" valor={tc.presupuestado} />
                <Tarjeta label="COSTÓ" valor={tc.real} />
                <Tarjeta label="SE AHORRÓ" valor={tc.ahorro} color={colors.success}
                  icono={<TrendingDown size={11} color={colors.success} />} />
                <Tarjeta label="SE PASÓ" valor={tc.sobreprecio} color={colors.danger}
                  icono={<TrendingUp size={11} color={colors.danger} />} />
                <Tarjeta label={hayOrdenes ? "NETO DE LAS COMPRAS" : "NETO DE LA OBRA"} valor={tc.neto} color={tc.neto >= 0 ? colors.success : colors.danger} />
              </>}
              {/* LO PREVISTO, APARTE. Es plata que todavía no existe: sumarla al
                  neto es lo que hace que una obra parezca rentable hasta el
                  último mes. Pero tampoco se calla: adelantar el beneficio de un
                  rubro es lo que deja decidir con tiempo dónde se puede gastar
                  más. */}
              {tc.cuantosPrevistos > 0 && (
                <Tarjeta label={`PREVISTO · ${tc.cuantosPrevistos} sin comprar`} valor={tc.previsto} color={colors.warning} />
              )}
            </div>
          </div>
        )}

        {/* ── POR QUÉ UNA ORDEN APROBADA NO ESTÁ SUMANDO ───────────────────
            El margen de una orden de cambio es beneficio de la obra igual que
            comprar mejor. Pero para contarlo hacen falta dos cosas, y cuando
            falta una la orden desaparece de acá sin decir nada: queda cobrándose
            en el contrato y sin aparecer en la utilidad.

            · QUE SE HAYA EJECUTADO. Una orden aprobada y marcada 'no ejecutada'
              no deja margen, y es correcto — pero si sus rubros ya están en el
              presupuesto de la obra, las dos cosas no pueden ser ciertas a la
              vez, y hay que resolverlo.
            · QUE SE SEPA LO QUE CUESTA. Sin costo en las partidas no hay margen
              que calcular: no es cero, es que no se sabe. */}
        {mudas.length > 0 && (
          <div style={{ background: colors.warningSoft, border: `1px solid ${colors.warningBorder}`,
            borderRadius: colors.radiusMd, padding: "9px 11px", marginBottom: 10 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: colors.ink, marginBottom: 3 }}>
              {mudas.length === 1 ? "Una orden aprobada no está sumando acá" : `${mudas.length} órdenes aprobadas no están sumando acá`}
            </div>
            {mudas.map(m => (
              <div key={m.orden.id} style={{ fontSize: 11.5, color: colors.inkSoft, lineHeight: 1.5, padding: "2px 0" }}>
                <strong>{m.orden.codigo || `OC-${m.orden.numero}`}</strong> · {m.por}
              </div>
            ))}
            <div style={{ fontSize: 11, color: colors.muted, marginTop: 5, lineHeight: 1.45 }}>
              Se resuelve en <strong>Órdenes de cambio</strong>: marcá la ejecución y cargá el costo de las partidas
              —la cotización del proveedor lo pone sola—. El margen aparece acá en cuanto las dos cosas estén.
            </div>
          </div>
        )}

        {hayOrdenes && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.4, marginBottom: 5 }}>
              ÓRDENES DE CAMBIO · LO COBRADO CONTRA LO QUE CUESTA
            </div>
            <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
              {to.cuantos > 0 && <>
                <Tarjeta label="COBRADO" valor={to.presupuestado} />
                <Tarjeta label="COSTÓ" valor={to.real} />
                <Tarjeta label="MARGEN COBRADO" valor={to.neto} color={to.neto >= 0 ? colors.success : colors.danger} />
              </>}
              {/* Una orden aprobada deja su margen PREVISTO: la cotización no
                  es una compra. Se confirma partida por partida al comprarla. */}
              {to.cuantosPrevistos > 0 && (
                <Tarjeta label={`PREVISTO · ${to.cuantosPrevistos} sin comprar`} valor={to.previsto} color={colors.warning} />
              )}
            </div>
          </div>
        )}

        {hayOrdenes && t.cuantos > 0 && tc.cuantos > 0 && to.cuantos > 0 && (
          <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginBottom: 10 }}>
            <Tarjeta label="NETO DE LA OBRA" valor={t.neto} color={t.neto >= 0 ? colors.success : colors.danger} />
            {t.cuantosPrevistos > 0 && <Tarjeta label="PREVISTO DE LA OBRA" valor={t.previsto} color={colors.warning} />}
          </div>
        )}

        {aMano && (
          <div style={{ background: colors.surface, border: `1px solid ${colors.brand}`, borderRadius: colors.radiusMd,
            padding: 12, marginBottom: 10, display: "grid", gap: 8,
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <input autoFocus value={aMano.descripcion || ""} placeholder="Qué se compró o se negoció"
                onChange={e => setAMano(a => ({ ...a, descripcion: e.target.value }))}
                style={{ ...inputStyle, width: "100%", fontSize: 12.5, padding: "7px 10px" }} />
            </div>
            <select value={aMano.obra_rubro_id || ""} onChange={e => setAMano(a => ({ ...a, obra_rubro_id: e.target.value }))}
              style={{ ...inputStyle, fontSize: 11.5, padding: "7px 8px" }}>
              <option value="">¿contra qué rubro? (opcional)</option>
              {vivos.map(x => <option key={x.id} value={x.id}>{x.numero} · {x.descripcion.slice(0, 44)}</option>)}
            </select>
            <input type="number" step="0.01" value={aMano.presupuestado ?? ""}
              placeholder="Presupuestado" onChange={e => setAMano(a => ({ ...a, presupuestado: e.target.value }))}
              style={{ ...inputStyle, fontSize: 12, padding: "7px 10px" }} />
            <input type="number" step="0.01" value={aMano.real ?? ""}
              placeholder="Costó de verdad" onChange={e => setAMano(a => ({ ...a, real: e.target.value }))}
              style={{ ...inputStyle, fontSize: 12, padding: "7px 10px" }} />
            <input value={aMano.proveedor || ""} placeholder="Proveedor"
              onChange={e => setAMano(a => ({ ...a, proveedor: e.target.value }))}
              style={{ ...inputStyle, fontSize: 12, padding: "7px 10px" }} />
            <input type="date" value={aMano.fecha || ""} onChange={e => setAMano(a => ({ ...a, fecha: e.target.value }))}
              style={{ ...inputStyle, fontSize: 12, padding: "6px 10px" }} />
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: colors.inkSoft, cursor: "pointer" }}
              title="Todavía no se compró: es una previsión. No suma a los números de la obra hasta que se confirme.">
              <input type="checkbox" checked={!!aMano.previsto}
                onChange={e => setAMano(a => ({ ...a, previsto: e.target.checked }))} />
              Todavía no se compró
            </label>
            <div style={{ gridColumn: "1 / -1", display: "flex", gap: 7, alignItems: "center" }}>
              <input value={aMano.nota || ""} placeholder="Por qué (se cambió de marca, se negoció el flete…)"
                onChange={e => setAMano(a => ({ ...a, nota: e.target.value }))}
                style={{ ...inputStyle, flex: 1, fontSize: 12, padding: "7px 10px" }} />
              <Button variant="primary" size="sm" disabled={ocupado} onClick={guardarAMano}>
                {ocupado ? "Guardando…" : "Guardar"}
              </Button>
              <button onClick={() => setAMano(null)}
                style={{ background: "none", border: "none", color: colors.muted, fontSize: 11.5,
                  cursor: "pointer", fontFamily: colors.font }}>cancelar</button>
            </div>
            {aMano.obra_rubro_id && !aMano.presupuestado && (
              <div style={{ gridColumn: "1 / -1", fontSize: 11, color: colors.muted }}>
                Si dejás vacío lo presupuestado se usa el del rubro elegido, que es contra el que hay que comparar.
              </div>
            )}
          </div>
        )}

        {guardados.length > 0 && (
          <div style={{ background: colors.surface, border: `1px solid ${colors.border}`,
            borderRadius: colors.radiusMd, overflow: "hidden" }}>
            {guardados.map(b => {
              const dif = Math.round((n(b.presupuestado) - n(b.real)) * 100) / 100;
              const rub = vivos.find(x => String(x.id) === String(b.obra_rubro_id));
              return (
                <div key={b.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 12px",
                  borderTop: `1px solid ${colors.neutralSoft}` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, color: colors.ink }}>{b.descripcion}</div>
                    <div style={{ fontSize: 10.5, color: colors.muted }}>
                      {b.fecha}{rub ? ` · ${rub.numero} ${rub.descripcion.slice(0, 40)}` : " · sin rubro"}
                      {b.proveedor ? ` · ${b.proveedor}` : ""}
                      {b.origen === "manual" ? " · a mano" : ""}
                      {esDeOrden(b) ? " · orden de cambio: lo cobrado contra su cotización" : ""}
                      {esPrevisto(b) ? " · todavía no se compró" : ""}
                      {b.nota ? ` · ${b.nota}` : ""}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0, fontSize: 11, color: colors.muted }}>
                    {esDeOrden(b) ? "cobrado " : ""}${fmt(b.presupuestado)} → {esDeOrden(b) ? "costó " : ""}${fmt(b.real)}
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0, minWidth: 86, fontSize: 12.5, fontWeight: 700,
                    opacity: esPrevisto(b) ? 0.55 : 1,
                    color: dif >= 0 ? colors.success : colors.danger }}>
                    {dif >= 0 ? "+" : "−"}${fmt(Math.abs(dif))}
                  </div>
                  {/* EL PAPEL CON EL QUE SE HIZO LA CUENTA, a un clic del
                      número que sostiene. Tres meses después, cuando el
                      proveedor factura otra cosa, es lo único que queda. */}
                  {b.archivo_path && enlaces[b.id] && (
                    <a href={enlaces[b.id]} target="_blank" rel="noopener noreferrer"
                      title={`Bajar la proforma: ${b.archivo_nombre || "archivo"}`}
                      style={{ color: colors.brand, display: "flex", flexShrink: 0 }}>
                      <Paperclip size={13} />
                    </a>
                  )}
                  {esPrevisto(b) && (
                    <button onClick={async () => {
                      const r2 = await guardarBeneficio({ id: b.id, estado: "confirmado", confirmado_at: new Date().toISOString() });
                      if (r2.error) { setError(r2.error); return; }
                      await cargar();
                      setAviso("Confirmado: ya suma a los números de la obra.");
                    }} title="Ya se compró a ese precio: pasa a contar en la obra"
                      style={{ background: colors.successSoft, border: "none", borderRadius: 7, padding: "3px 8px",
                        color: colors.success, fontSize: 10.5, fontWeight: 700, cursor: "pointer",
                        fontFamily: colors.font, flexShrink: 0 }}>
                      Confirmar
                    </button>
                  )}
                  <button onClick={async () => {
                    // Lo previsto de una orden sale de su costo: borrado acá,
                    // vuelve a aparecer la próxima vez. Se corrige en la orden.
                    if (esDeOrden(b) && esPrevisto(b)) {
                      window.alert("Este beneficio sale del costo de una partida de la orden de cambio. Para quitarlo, borrá o corregí el costo de esa partida en Órdenes de cambio.");
                      return;
                    }
                    if (!window.confirm(`¿Borrar "${b.descripcion}" de los beneficios?`)) return;
                    const err = await borrarBeneficio(b.id);
                    if (err) { setError(err); return; }
                    await cargar();
                  }} title="Borrarlo"
                    style={{ background: "none", border: "none", cursor: "pointer", color: colors.muted, display: "flex", flexShrink: 0 }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
