import { useState, useRef, useEffect } from "react";
import { Upload, Trash2, Plus, Sparkles, Check, Banknote } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { subirArchivo, enlaceArchivo } from "../../lib/archivos";
import { colors } from "../../theme/colors";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import { fmt, TIPOS_GASTO } from "./calculos";
import { CLASES_DOC, esNotaDeCredito } from "./pagos";
import { buscarDuplicados, hashArchivo } from "./duplicados";
import { comprimirImagen, noEntraElArchivo } from "../../lib/imagenes";
import AlertaDuplicado from "./AlertaDuplicado";
import CampoProveedor from "../../components/CampoProveedor";
import { comprasSinFacturar, engancharFactura } from "../compras/compras";
import { LECTURA, textoDeNova } from "../../lib/modelos";
import { FORMAS_PAGO, registrarPago, valesDisponibles } from "./pagos";
import { guardarRenglones, leerRenglones } from "./renglones";
import { desdeLecturaDeFactura } from "./itemsComprados";

const hoy = () => new Date().toISOString().split("T")[0];
const n = v => Number(v) || 0;

export default function ModalFactura({ obra, rubros, actividades = [], planilla, factura, asignacionesFactura = [], control = {}, currentUser, onCerrar, onGuardado }) {
  const editando = !!factura;
  // Los pedidos de compra que todavía no tienen factura. Son los que están
  // pesando como "comprometido" en el control: engancharle uno a esta factura
  // es lo que hace que ese número baje. Sin esto la misma plata pesaba dos
  // veces —invertido por la factura, comprometido por el pedido— y el
  // comprometido no llegaba a cero nunca.
  const [pedidos, setPedidos] = useState([]);
  const [pedidoId, setPedidoId] = useState("");
  const [form, setForm] = useState(factura ? { ...factura } : {
    fecha: hoy(), tipo_documento: "FACTURA", clase: "factura", numero_factura: "", ruc: "", razon_social: "",
    detalle: "", justificacion: "", numero_cheque: "", tipo: "material",
    subtotal_0: 0, subtotal_5: 0, subtotal_15: 0, iva: 0, total: 0,
  });
  // Una factura se reparte entre varias actividades, que pueden estar en
  // capítulos distintos. El rubro directo queda como salida para cuando sí se
  // sabe el rubro exacto y se quiere el monto sin prorratear.
  // El capítulo elegido, para después elegir su rubro. Dos pasos, como se
  // piensa una factura: "esto es de albañilería… del bloque de 15".
  const [capElegido, setCapElegido] = useState("");
  // La revisión en el SRI: qué contestó y si está corriendo.
  const [sri, setSri] = useState(factura?.sri_hallazgos
    ? { estado: factura.sri_estado, hallazgos: factura.sri_hallazgos, revisado_at: factura.sri_revisado_at }
    : null);
  const [revisandoSri, setRevisandoSri] = useState(false);
  // Lo que ya se pagó de esta factura, en el momento de cargarla: es cuando se
  // sabe, porque quien la carga tiene el comprobante en la mano.
  const [pagado, setPagado] = useState({ monto: "", forma: "transferencia" });
  // LOS VALES DE ESTE PROVEEDOR, ACÁ MISMO.
  //
  // Una factura de $1.000 se paga $900 por transferencia y $100 con una nota
  // de crédito que el proveedor nos debía. Eso pasa al cargar la factura, con
  // el papel delante: mandarlo a otra pantalla es que no se registre, y el
  // vale se queda "a favor" para siempre mientras la factura figura impaga.
  const [vales, setVales] = useState([]);
  const [conVale, setConVale] = useState({ monto: "", nota_credito_id: "" });
  // Los renglones de la factura, leídos por NOVA. Cada uno puede ir a un rubro
  // distinto: una factura de ferretería sirve a tres capítulos.
  const [items, setItems] = useState([]);
  const [repartos, setRepartos] = useState(
    asignacionesFactura.map(a => a.obra_actividad_id != null
      ? { tipo: "actividad", id: a.obra_actividad_id, monto: a.monto }
      : { tipo: "rubro", id: a.obra_rubro_id, monto: a.monto })
  );
  const [nuevaActividad, setNuevaActividad] = useState("");
  const [porRubro, setPorRubro] = useState(false);
  const [archivo, setArchivo] = useState(null);
  const [leyendo, setLeyendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [dups, setDups] = useState({ exactos: [], posibles: [] });
  const [justificacion, setJustificacion] = useState("");
  const [revisandoDups, setRevisandoDups] = useState(false);
  const [archivoHash, setArchivoHash] = useState(null);
  const fileRef = useRef(null);

  // La detección corre sobre los datos ya cargados, no sobre el criterio de NOVA.
  useEffect(() => {
    let vivo = true;
    comprasSinFacturar(obra?.id, obra?.lead_id)
      .then(ps => { if (vivo) setPedidos(ps); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [obra?.id, obra?.lead_id]);

  async function revisarDuplicados(extra = {}) {
    const datos = { ...form, ...extra };
    if (!datos.numero_factura && !datos.razon_social && !archivoHash) { setDups({ exactos: [], posibles: [] }); return; }
    setRevisandoDups(true);
    const r = await buscarDuplicados({
      obraId: obra.id, ruc: datos.ruc, numeroFactura: datos.numero_factura,
      razonSocial: datos.razon_social, monto: datos.total, fecha: datos.fecha,
      archivoHash, excluirId: factura?.id || null,
    });
    setDups(r);
    setRevisandoDups(false);
  }

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Recalcula total desde los subtotales + IVA
  function recalcTotal(next) {
    const f = { ...form, ...next };
    const total = n(f.subtotal_0) + n(f.subtotal_5) + n(f.subtotal_15) + n(f.iva);
    setForm({ ...f, total: Math.round(total * 100) / 100 });
  }

  async function leerConNova(e) {
    const file = e.target.files[0];
    if (!file) return;
    await leerArchivo(file, true);
    // Vaciar el input: sin esto, volver a elegir el MISMO archivo no dispara
    // el evento y parece que el botón dejó de andar.
    e.target.value = "";
  }

  /**
   * LA FACTURA QUE YA ESTÁ CARGADA SE PUEDE LEER SIN VOLVER A SUBIRLA.
   *
   * Alguien la subió hace una semana: el papel está en el depósito y nadie
   * tiene por qué tenerlo otra vez en su computadora. Obligar a volver a
   * subirlo para que NOVA le saque los renglones es pedirle a la persona
   * equivocada un archivo que el sistema ya tiene — y en la mayoría de los
   * casos, el que asigna no es el que cargó.
   */
  async function leerLaQueYaEstá() {
    if (!form.archivo_url) return;
    setLeyendo(true); setError("");
    try {
      const url = await enlaceArchivo(form.archivo_url, 600);
      if (!url) { setError("No se pudo abrir el archivo guardado de esta factura."); setLeyendo(false); return; }
      const r = await fetch(url);
      if (!r.ok) { setError("No se pudo bajar el archivo guardado de esta factura."); setLeyendo(false); return; }
      const blob = await r.blob();
      const nombre = form.archivo_nombre || "factura";
      await leerArchivo(new File([blob], nombre, { type: blob.type }), false);
    } catch (err) {
      setError("No se pudo leer el archivo guardado: " + err.message);
      setLeyendo(false);
    }
  }

  /**
   * @param esNuevo  si el archivo viene de la máquina —y entonces reemplaza al
   *   adjunto y se le calcula el hash para detectar duplicados— o si es el que
   *   ya estaba guardado, que no hay que volver a subir ni volver a revisar.
   */
  async function leerArchivo(entrada, esNuevo) {
    let file = entrada;
    setLeyendo(true); setError("");
    if (esNuevo) {
      const h = await hashArchivo(file); setArchivoHash(h);
      file = await comprimirImagen(file);
      setArchivo(file);
    }
    try {
      const b64 = await new Promise(res => {
        const r = new FileReader();
        r.onload = () => res(r.result.split(",")[1]);
        r.readAsDataURL(file);
      });
      const esPdf = file.type === "application/pdf";
      // El catch de abajo dice "NOVA no pudo leerla", que acá sería mentira:
      // el archivo no llegó a salir. Cuando sabemos qué pasó, se dice.
      const pesa = noEntraElArchivo(b64, file);
      if (pesa) { setError(pesa); setLeyendo(false); return; }
      const listaRubros = rubros.slice(0, 220).map(r => `${r.id}:${r.descripcion.slice(0, 60)}`).join(" | ");

      const res = await fetch("/api/nova", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: LECTURA, max_tokens: 4000,
          system: `Eres NOVA. Lees facturas de construcción de Ecuador y devuelves SOLO JSON, sin markdown:
{"fecha":"YYYY-MM-DD","ruc":"","razon_social":"","numero_factura":"","clave_acceso":"","numero_cheque":"","detalle":"","subtotal_0":0,"subtotal_5":0,"subtotal_15":0,"iva":0,"total":0,"tipo":"material|mano_obra|maquinaria|contrato|honorarios|otro","rubro_id":null,
 "items":[{"descripcion":"","cantidad":0,"unidad":"","monto":0,"iva":15,"rubro_id":null}]}

subtotal_0/5/15 son las bases imponibles por tasa de IVA. Si no distingues la tasa, pon todo en subtotal_15.

"clave_acceso" son los 49 dígitos seguidos que aparecen como NÚMERO DE
AUTORIZACIÓN o CLAVE DE ACCESO, normalmente debajo del código de barras.
Cópialos tal cual, sin espacios ni guiones. Con eso se le pregunta al SRI si la
factura está autorizada de verdad, así que un dígito mal copiado hace fallar la
consulta: si no se leen con certeza, devuelve "". Un recibo de venta o una nota
de venta no tienen clave: ahí va "".

"items" ES LO MÁS IMPORTANTE: UNA LÍNEA POR CADA RENGLÓN DE LA FACTURA.

Una factura de ferretería trae cemento, varilla y alambre, y cada cosa va a un
capítulo distinto de la obra. Repartir el total a ojo entre capítulos es
inventar; la factura ya dice qué trae y cuánto cuesta cada cosa. Copiá eso.

  "descripcion" el renglón como está impreso, corto.
  "cantidad" y "unidad" si están; si no, 0 y "".
  "monto" lo que suma ESE renglón, sin IVA —la base, igual que los subtotales—.
  "iva" la tarifa de ESE renglón: 0, 5 o 15. Una factura puede mezclar
  tarifas; si no se distingue cuál lleva el renglón, null.
  "rubro_id" el rubro de la lista al que corresponde ESE renglón, o null si no
  estás seguro. Null es una respuesta válida y es mejor que adivinar: quien
  carga la factura lo elige en dos segundos, y un rubro equivocado se
  descubre tres meses después.

La suma de los "monto" tiene que dar los subtotales. Si la factura trae
descuentos o un renglón de transporte, ponelos como un ítem más, con su signo.

Si no podés leer los renglones —una foto borrosa, un recibo escrito a mano—
mandá "items" vacío. Un ítem inventado es peor que ninguno.

"rubro_id" de arriba, el de la factura entera, es el más probable de todos: se
usa cuando no hay renglones.

Rubros: ${listaRubros}`,
          messages: [{
            role: "user",
            content: [
              esPdf
                ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
                : { type: "image", source: { type: "base64", media_type: file.type || "image/jpeg", data: b64 } },
              { type: "text", text: "Extrae los datos de esta factura. Solo JSON." },
            ],
          }],
        }),
      });
      // Si el servidor se cortó, lo que vuelve es una página de error en HTML:
      // leerla como JSON da «Unexpected token 'A'...», que no le dice nada a
      // nadie y parece que se rompió el programa entero.
      const data = await res.json().catch(() => null);
      if (!data) {
        setError(`El servidor se cortó leyendo la factura (${res.status}). Si el archivo es muy grande, mandá una foto en vez del PDF entero.`);
        setLeyendo(false); return;
      }
      const txt = (textoDeNova(data) || "{}").replace(/```json|```/g, "").trim();
      const p = JSON.parse(txt);
      // Al editar, lo que ya está escrito manda: alguien pudo haberlo
      // corregido a mano y volver a pisarlo con la lectura sería deshacer su
      // corrección. Lo que se vino a buscar son los renglones.
      const conservar = (viejo, nuevo) => (editando && String(viejo || "").trim() ? viejo : (nuevo || viejo));
      setForm(f => ({
        ...f,
        fecha: conservar(f.fecha, p.fecha),
        ruc: conservar(f.ruc, p.ruc),
        razon_social: conservar(f.razon_social, p.razon_social),
        numero_factura: conservar(f.numero_factura, p.numero_factura),
        clave_acceso: conservar(f.clave_acceso, String(p.clave_acceso || "").replace(/\D/g, "")),
        numero_cheque: conservar(f.numero_cheque, p.numero_cheque),
        detalle: conservar(f.detalle, p.detalle),
        // Los montos solo si la factura todavía no tiene total: cambiarle el
        // total a una factura ya guardada descuadraría sus asignaciones.
        subtotal_0: editando && n(f.total) ? f.subtotal_0 : n(p.subtotal_0),
        subtotal_5: editando && n(f.total) ? f.subtotal_5 : n(p.subtotal_5),
        subtotal_15: editando && n(f.total) ? f.subtotal_15 : n(p.subtotal_15),
        iva: editando && n(f.total) ? f.iva : n(p.iva),
        total: editando && n(f.total) ? f.total : n(p.total),
        tipo: conservar(f.tipo, p.tipo),
      }));
      // LOS RENGLONES DE LA FACTURA.
      //
      // Una factura de ferretería trae cemento, varilla y alambre, y cada cosa
      // va a un capítulo distinto. Repartir el total a ojo entre capítulos es
      // inventar; la factura ya dice qué trae y cuánto cuesta cada cosa.
      //
      // Se guardan aparte y NO se asignan solos: NOVA propone el rubro de cada
      // renglón y quien carga la factura confirma. Un rubro equivocado puesto
      // automáticamente se descubre tres meses después.
      if (Array.isArray(p.items) && p.items.length) {
        setItems(p.items
          .filter(x => x && (x.descripcion || n(x.monto)))
          .map((x, k) => ({
            k,
            descripcion: String(x.descripcion || "").trim().slice(0, 90),
            cantidad: n(x.cantidad),
            unidad: String(x.unidad || "").trim().slice(0, 10),
            monto: Math.round(n(x.monto) * 100) / 100,
            iva: x.iva ?? null,
            // Solo si el rubro existe de verdad: un id inventado asignaría
            // plata a un renglón que nadie puede encontrar.
            destino: rubros.some(r => r.id === Number(x.rubro_id)) ? `rubro:${Number(x.rubro_id)}` : null,
          })));
      }

      // SI NOVA ENCONTRÓ EL RUBRO EXACTO, SE USA EL RUBRO.
      //
      // Antes se lo cambiaba por su agrupación, y eso tiraba a la basura el
      // único dato preciso que había: el monto se repartía a prorrata entre
      // todos los rubros del capítulo, así que una factura de cemento sumaba
      // un poco a cada renglón y nada al que correspondía. Lo que se ve
      // después es un capítulo entero avanzando parejo, que no es lo que pasó.
      if (p.rubro_id && rubros.some(r => r.id === p.rubro_id) && repartos.length === 0) {
        setRepartos([{ tipo: "rubro", id: p.rubro_id, monto: n(p.total) }]);
      }
      await revisarDuplicados({ ruc: p.ruc, numero_factura: p.numero_factura, razon_social: p.razon_social, total: n(p.total), fecha: p.fecha });
      // Y SE LE PREGUNTA AL SRI, EN LA MISMA PASADA.
      //
      // Es el momento: quien la está cargando tiene la factura delante y
      // todavía puede devolvérsela al proveedor. Un día después, ya pagada, lo
      // único que queda es el problema.
      const clave = String(p.clave_acceso || "").replace(/\D/g, "");
      if (clave.length === 49) await revisarEnSri(clave, p.ruc);
    } catch {
      setError("NOVA no pudo leer el archivo. Llena los datos a mano.");
    }
    setLeyendo(false);
  }

  /**
   * ¿Esta factura la va a aceptar el SRI?
   *
   * No es una pregunta de forma. Una factura no autorizada, emitida a nombre
   * de otro, o de un proveedor marcado como fantasma, no sustenta el gasto:
   * se paga igual pero el SRI desconoce el IVA y el costo, y eso se descubre
   * en una revisión, un año después, cuando ya no hay a quién reclamarle.
   */
  async function revisarEnSri(claveDada, rucDado) {
    const clave = String(claveDada ?? form.clave_acceso ?? "").replace(/\D/g, "");
    const ruc = String(rucDado ?? form.ruc ?? "").replace(/\D/g, "");
    // CON EL RUC SOLO TAMBIÉN SE PREGUNTA. No se revisa el comprobante —para
    // eso hace falta la clave— pero sí quién es el proveedor, que es lo que
    // decide si su cuenta queda junta o partida en tres.
    if (clave.length !== 49 && ruc.length !== 13) {
      setSri({ estado: "sin_clave", hallazgos: [{ nivel: "aviso", regla: "clave",
        dice: "No se leyó la clave de acceso de 49 dígitos ni hay un RUC cargado, así que no se pudo consultar al SRI.",
        hacer: "La clave está impresa debajo del código de barras, como NÚMERO DE AUTORIZACIÓN. Con el RUC solo, el SRI igual dice quién es el proveedor." }] });
      return;
    }
    setRevisandoSri(true);
    try {
      const r = await fetch("/api/nova", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sri: { clave, ruc } }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d || d.error) {
        setSri({ estado: "sin_respuesta", hallazgos: [{ nivel: "aviso", regla: "sri",
          dice: d?.error || "El SRI no contestó la consulta.",
          hacer: "Probá de nuevo en un rato. Las páginas del SRI se caen seguido." }] });
      } else {
        setSri({ ...d, revisado_at: new Date().toISOString() });
        // Lo que el SRI tiene guardado manda sobre lo que se leyó del papel:
        // el XML autorizado es el documento, el papel es una copia impresa.
        if (d.comprobante?.ruc) {
          setForm(f => ({ ...f, ruc: d.comprobante.ruc,
            numero_factura: d.comprobante.numero || f.numero_factura, clave_acceso: clave }));
        }
        // EL NOMBRE DEL SRI MANDA.
        //
        // El del papel viene escrito de cuatro formas —"AVIANCA ECUADOR
        // S.A.", "Avianca Ecuador S.A.", "AVIANCA ECUADOR, S.A."— y cada
        // forma arma su propia cuenta de proveedor: la misma aerolínea
        // aparecía dos veces, con la deuda partida en dos. El catastro tiene
        // un solo nombre y es el legal. Antes solo se usaba cuando el campo
        // estaba vacío, que es justo cuando no hacía falta.
        if (d.proveedor?.razonSocial) {
          setForm(f => ({ ...f, ruc: d.proveedor.numeroRuc || f.ruc, razon_social: d.proveedor.razonSocial }));
        }
      }
    } catch (e) {
      setSri({ estado: "sin_respuesta", hallazgos: [{ nivel: "aviso", regla: "sri",
        dice: "No se pudo consultar al SRI: " + e.message, hacer: "Probá de nuevo en un rato." }] });
    }
    setRevisandoSri(false);
  }

  // Los vales que le quedan a este proveedor en esta obra. Se buscan por RUC
  // —que es lo que de verdad lo identifica— y si no hay, por nombre.
  const rucProveedor = String(form.ruc || "").replace(/\D/g, "");
  const nombreProveedor = String(form.razon_social || "").trim();
  useEffect(() => {
    let vivo = true;
    (async () => {
      if (editando || !obra?.id || (!rucProveedor && !nombreProveedor)) { setVales([]); return; }
      let q = supabase.from("obra_facturas")
        .select("id,total,clase,fecha,numero_factura,detalle,facturada_con_id,ruc,razon_social")
        .eq("obra_id", obra.id).lt("total", 0);
      q = rucProveedor ? q.eq("ruc", rucProveedor) : q.eq("razon_social", nombreProveedor);
      const { data: notas } = await q;
      if (!vivo || !notas?.length) { if (vivo) setVales([]); return; }
      const { data: pg } = await supabase.from("obra_pagos")
        .select("monto,nota_credito_id").in("nota_credito_id", notas.map(x => x.id));
      if (!vivo) return;
      setVales(valesDisponibles(notas, pg || []));
    })();
    return () => { vivo = false; };
  }, [editando, obra?.id, rucProveedor, nombreProveedor]);

  function agregar(tipo, id) {
    if (id == null || repartos.some(r => r.tipo === tipo && r.id === id)) return;
    const restante = Math.max(n(form.total) - repartos.reduce((s, r) => s + n(r.monto), 0), 0);
    setRepartos([...repartos, { tipo, id, monto: restante }]);
    setBusqueda("");
  }

  // Crear la actividad sin salir de la factura: si el gasto no encaja en
  // ninguna, obligar a ir al otro panel es la forma de que no se cargue.
  async function crearYAsignar() {
    const nombre = nuevaActividad.trim();
    if (!nombre) return;
    const { data, error: e } = await supabase.from("obra_actividades")
      .insert({ obra_id: obra.id, nombre, codigo: String(actividades.length + 1).padStart(2, "0"), orden: actividades.length + 1 })
      .select().single();
    if (e) { setError("No se pudo crear la agrupación: " + e.message); return; }
    actividades.push(data);
    setNuevaActividad("");
    agregar("actividad", data.id);
  }

  const asignado = repartos.reduce((s, r) => s + n(r.monto), 0);
  const diferencia = Math.round((n(form.total) - asignado) * 100) / 100;

  async function guardar() {
    if (!form.total) { setError("Falta el total de la factura."); return; }
    if (dups.exactos.length && !justificacion.trim()) {
      setError("Esta factura ya está cargada. Explica por qué no es un duplicado para poder guardarla.");
      return;
    }
    setGuardando(true); setError("");

    let archivo_url = form.archivo_url || null, archivo_nombre = form.archivo_nombre || null;
    if (archivo) {
      const safe = archivo.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `obra-${obra.id}/${Date.now()}-${safe}`;
      const { ruta, error: upErr } = await subirArchivo(path, archivo);
      if (!upErr) {
        archivo_url = ruta;
        archivo_nombre = archivo.name;
      }
    }

    // UNA NOTA DE CRÉDITO ENTRA EN NEGATIVO, Y NO SE LO PEDIMOS A NADIE.
    //
    // Es plata que vuelve: devolución de material, un cobro de más. Si entrara
    // en positivo sumaría a lo gastado justo cuando hay que restarlo. Quien la
    // carga escribe los montos como están impresos en el papel —positivos— y
    // el signo lo pone el sistema: pedirle que escriba un menos es garantizar
    // que algún día alguien lo olvide, y ese error no se ve en ningún total
    // hasta que no cuadra nada.
    const signo = esNotaDeCredito(form.clase) ? -1 : 1;
    const m = v => signo * Math.abs(n(v));

    const payload = {
      obra_id: obra.id,
      planilla_id: planilla?.id || null,
      fecha: form.fecha || hoy(),
      tipo_documento: esNotaDeCredito(form.clase) ? "NOTA DE CREDITO" : (form.tipo_documento || "FACTURA"),
      clase: form.clase || "factura",
      numero_factura: form.numero_factura || null,
      ruc: form.ruc || null,
      razon_social: form.razon_social || null,
      detalle: form.detalle || null,
      justificacion: form.justificacion || null,
      numero_cheque: form.numero_cheque || null,
      subtotal_0: m(form.subtotal_0), subtotal_5: m(form.subtotal_5), subtotal_15: m(form.subtotal_15),
      iva: m(form.iva), total: m(form.total),
      tipo: form.tipo || "material",
      archivo_url, archivo_nombre,
      origen: archivo ? "nova" : (form.origen || "manual"),
      archivo_hash: archivoHash || form.archivo_hash || null,
      duplicado_de: dups.exactos[0]?.id || null,
      duplicado_justificacion: dups.exactos.length ? justificacion.trim() : null,
      subido_por: currentUser.id, subido_por_nombre: currentUser.name,
      // La revisión viaja con la factura: la pregunta "¿esta se puede pagar?"
      // aparece después, cuando alguien la va a pagar, y para entonces nadie
      // se acuerda de lo que dijo la pantalla al cargarla.
      clave_acceso: String(form.clave_acceso || "").replace(/\D/g, "") || null,
      sri_estado: sri?.estado || null,
      sri_hallazgos: sri?.hallazgos?.length ? sri.hallazgos : null,
      sri_revisado_at: sri?.revisado_at || (sri ? new Date().toISOString() : null),
    };

    // Sin la migración 060 no existe `clase`: el documento entra igual, como
    // factura, que es lo único que se podía cargar antes.
    const sinClase = ({ clase, clave_acceso, sri_estado, sri_hallazgos, sri_revisado_at, ...resto }) => resto;
    let facturaId = factura?.id;
    if (editando) {
      // CON `select()`: un UPDATE que no tocó ninguna fila —porque el permiso
      // no deja, porque la factura ya no está— vuelve SIN error y con cero
      // filas. Sin mirarlo, la pantalla cerraba como si hubiera guardado y lo
      // escrito volvía al valor viejo en la siguiente carga.
      let { data: tocadas, error: e1 } = await supabase.from("obra_facturas")
        .update(payload).eq("id", factura.id).select("id");
      if (e1 && /column|schema cache/i.test(e1.message)) {
        ({ data: tocadas, error: e1 } = await supabase.from("obra_facturas")
          .update(sinClase(payload)).eq("id", factura.id).select("id"));
      }
      if (e1) { setError(e1.message); setGuardando(false); return; }
      if (!tocadas?.length) {
        setError("La base no dejó guardar esta factura y no dijo por qué. Puede ser el permiso, o que la factura ya no exista.");
        setGuardando(false); return;
      }
      const { error: eDel } = await supabase.from("obra_asignaciones").delete().eq("factura_id", factura.id);
      if (eDel) { setError("No se pudieron reemplazar las asignaciones: " + eDel.message); setGuardando(false); return; }
    } else {
      let { data, error: e1 } = await supabase.from("obra_facturas").insert(payload).select().single();
      if (e1 && /column|schema cache/i.test(e1.message)) {
        ({ data, error: e1 } = await supabase.from("obra_facturas").insert(sinClase(payload)).select().single());
      }
      if (e1 || !data) { setError(e1?.message || "No se pudo guardar"); setGuardando(false); return; }
      facturaId = data.id;
    }

    const filas = repartos.filter(r => n(r.monto) !== 0).map(r => ({
      factura_id: facturaId,
      obra_actividad_id: r.tipo === "actividad" ? r.id : null,
      obra_rubro_id: r.tipo === "rubro" ? r.id : null,
      // Al capítulo entero: ni rubro ni agrupación. La plata suma al capítulo y
      // los rubros quedan en cero, que es la verdad cuando no se sabe cuánto
      // fue de cada uno.
      capitulo: r.tipo === "capitulo" ? r.id : null,
      monto: n(r.monto),
    }));
    if (filas.length) {
      const { data: puestas, error: e2 } = await supabase.from("obra_asignaciones").insert(filas).select("id");
      if (e2) { setError("La factura se guardó pero la asignación falló: " + e2.message); setGuardando(false); return; }
      // Lo mismo que arriba: un insert que la base no deja pasar vuelve sin
      // error y sin filas, y la factura queda "sin asignar" sin que nada lo
      // diga. Es el caso que se veía como "asigno y no se graba".
      if (!puestas?.length) {
        setError("La factura se guardó, pero la base no dejó grabar la asignación a los rubros.");
        setGuardando(false); return;
      }
    } else if (repartos.some(r => r.id)) {
      // ELEGISTE RUBROS PERO NINGUNO LLEVA PLATA. Pasa al prorratear sobre una
      // base en cero, o al elegir un rubro y dejar el monto vacío: no hay nada
      // que guardar y la factura quedaba sin asignar, callada. Desde afuera es
      // idéntico a que no haya guardado.
      setError("Elegiste rubros pero ninguno quedó con monto. Revisá los importes: una asignación en cero no se guarda.");
      setGuardando(false); return;
    }

    // Y EL PAGO, si se pagó algo al cargarla. Va después de la factura
    // porque necesita su id, y si falla no se pierde la factura: se avisa y el
    // pago se registra desde Proveedores.
    if (!editando && n(pagado.monto) > 0) {
      const r = await registrarPago(
        { id: facturaId, obra_id: obra.id },
        { monto: n(pagado.monto), fecha: payload.fecha, forma: pagado.forma },
        currentUser);
      if (r?.error) {
        setGuardando(false);
        setError("La factura se guardó, pero el pago no: " + r.error);
        return;
      }
    }

    // LO QUE SE PAGÓ CON EL VALE. Es un pago más —la factura queda saldada—
    // pero no movió plata: descuenta del crédito a favor de este proveedor.
    if (!editando && n(conVale.monto) > 0 && (conVale.nota_credito_id || vales[0])) {
      const cual = conVale.nota_credito_id || vales[0].id;
      const r = await registrarPago(
        { id: facturaId, obra_id: obra.id },
        { monto: n(conVale.monto), fecha: payload.fecha, forma: "nota de crédito",
          nota_credito_id: cual, nota: "Pagada con nota de crédito" },
        currentUser);
      if (r?.error) {
        setGuardando(false);
        setError("La factura se guardó, pero el pago con la nota de crédito no: " + r.error);
        return;
      }
    }

    // ENGANCHAR EL PEDIDO. Es lo que hace que el comprometido baje: sin esto
    // el pedido sigue pesando como plata por gastar aunque la factura ya esté
    // cargada, y la misma plata cuenta dos veces sobre el mismo rubro.
    if (pedidoId) {
      const pedido = pedidos.find(p => String(p.id) === String(pedidoId));
      if (pedido) {
        const err = await engancharFactura(pedido, { id: facturaId, obra_id: obra.id,
          numero_factura: payload.numero_factura, total: payload.total }, currentUser);
        // Si falla, la factura ya está guardada: se avisa y no se pierde nada.
        if (err) {
          setGuardando(false);
          setError("La factura se guardó, pero no se pudo enganchar al pedido: " + err);
          return;
        }
      }
    }

    // LO QUE TRAE LA FACTURA, RENGLÓN POR RENGLÓN: es lo que cuenta la bodega.
    //
    // Si NOVA ya la leyó en esta pantalla, se guarda eso: volver a mandarle el
    // PDF sería pagar dos veces la misma lectura. Si se subió un papel y no
    // trajo renglones, se le piden aparte, sin hacer esperar a nadie. Si falla,
    // la factura ya está guardada y queda para "leer las que faltan".
    if (facturaId) {
      const laFactura = { id: facturaId, obra_id: obra.id, total: payload.total };
      if (items.length) guardarRenglones(laFactura, desdeLecturaDeFactura(items)).catch(() => {});
      else if (archivo && payload.clase !== "anticipo") leerRenglones(laFactura, archivo).catch(() => {});
    }

    // EL AVISO DE UNA FACTURA QUE EL SRI NO ACEPTA.
    //
    // La pantalla ya lo mostró, pero quien carga la factura no siempre es
    // quien paga, y una pantalla que se cerró no para un pago. Un correo sí.
    //
    // Solo las graves —no autorizada, a nombre de otro, proveedor fantasma—.
    // Si avisara por cada leyenda que falta, a la tercera semana nadie abriría
    // el correo. Y si el aviso falla, la factura ya está guardada: lo que no
    // se puede perder es el gasto, no el correo.
    if (sri?.estado === "grave" && facturaId) {
      fetch("/api/aviso?de=sri", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ factura_id: facturaId }),
      }).catch(() => {});
    }

    setGuardando(false);
    onGuardado();
  }

  // Los capítulos que de verdad tienen rubros vivos: los escondidos y los que
  // una orden de cambio anuló no son destinos posibles.
  // TODOS los capítulos de la obra, en su orden.
  //
  // Sin filtrar por rubros visibles: un capítulo cuyos rubros están todos
  // escondidos —los que se sacaron del control por estar en $0— desaparecía de
  // la lista y no se le podía asignar nada, ni siquiera al capítulo entero. Lo
  // que se esconde son RENGLONES que estorban, no el capítulo.
  //
  // En el orden del control, que es el del contrato: una lista de diecinueve
  // capítulos en orden alfabético obliga a buscar el que uno ya sabe dónde
  // está.
  const capitulosDeRubros = [...new Map(
    rubros.slice()
      .sort((a, b) => (n(a.capitulo_orden) - n(b.capitulo_orden)) || (n(a.orden) - n(b.orden)))
      .filter(r => r.capitulo)
      .map(r => [r.capitulo, r.capitulo])
  ).keys()];

  // EL DESTINO ELEGIDO ARRIBA puede ser un capítulo del contrato o una
  // agrupación de las que no vienen del presupuesto. Las dos cosas pueden
  // tener rubros adentro —a una agrupación extra se le pueden mover rubros
  // desde la pestaña Agrupaciones— y en los dos casos hay que poder elegir a
  // cuál de ellos va la factura. Tratarlas distinto era lo que hacía que los
  // rubros de "Logística y transporte" no aparecieran para asignar.
  const esAgrupacion = capElegido.startsWith("act:");
  const actElegida = esAgrupacion ? actividades.find(a => a.id === Number(capElegido.slice(4))) : null;
  const nombreDestino = esAgrupacion ? (actElegida?.nombre || "la agrupación") : capElegido;
  const rubrosDelDestino = !capElegido ? []
    : rubros.filter(r => !r.oculto && !r.anulado_por_oc
        && (esAgrupacion ? Number(r.actividad_id) === Number(capElegido.slice(4))
                         : r.capitulo === capElegido));

  const coincidencias = busqueda.trim()
    ? rubros.filter(r => r.descripcion.toLowerCase().includes(busqueda.toLowerCase()) || String(r.numero) === busqueda.trim()).slice(0, 8)
    : [];

  const lbl = { fontSize: 10, color: colors.muted, fontWeight: 600, display: "block", marginBottom: 3 };
  const mini = { ...inputStyle, padding: "7px 9px", fontSize: 12 };

  return (
    <Modal onClose={onCerrar} maxWidth={640}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: colors.ink }}>{editando ? "Editar factura" : "Nueva factura"}</div>
        <button onClick={onCerrar} style={{ marginLeft: "auto", background: colors.neutralSoft, border: "none", borderRadius: 6, width: 28, height: 28, color: colors.inkSoft, cursor: "pointer", fontSize: 15 }}>×</button>
      </div>

      {/* ¿DE QUÉ PEDIDO ES ESTA FACTURA?
          Mientras no se enganche, el pedido sigue contando como comprometido
          aunque la factura ya esté acá: la misma plata pesa dos veces sobre el
          mismo rubro y el comprometido no baja nunca. Enganchar también trae
          contra qué iba —lo eligió quien pidió, hace semanas— y evita que
          quien carga la factura tenga que adivinar de qué era la compra. */}
      {!editando && pedidos.length > 0 && (
        <div style={{ background: colors.surface, border: `1px solid ${colors.border}`,
          borderRadius: colors.radiusMd, padding: 12, marginBottom: 14 }}>
          <label style={{ fontSize: 10, color: colors.muted, fontWeight: 600, display: "block", marginBottom: 4 }}>
            ¿ES DE UN PEDIDO DE COMPRA?
          </label>
          <select value={pedidoId} onChange={e => {
            setPedidoId(e.target.value);
            // Se trae lo que el pedido ya sabía, para no tipearlo de nuevo.
            const p = pedidos.find(x => String(x.id) === String(e.target.value));
            if (p) setForm(f => ({
              ...f,
              razon_social: f.razon_social || p.proveedor || "",
              detalle: f.detalle || p.descripcion || "",
            }));
          }} style={{ ...inputStyle, padding: "7px 9px", fontSize: 12 }}>
            <option value="">No — es una factura suelta</option>
            {pedidos.map(p => (
              <option key={p.id} value={p.id}>
                {p.descripcion}{p.proveedor ? ` · ${p.proveedor}` : ""}
                {` · $${(Number(p.monto ?? p.monto_estimado) || 0).toFixed(2)}`}
                {p.obra_rubro_id || p.obra_actividad_id ? "" : " · SIN ASIGNAR"}
              </option>
            ))}
          </select>
          <div style={{ fontSize: 10.5, color: colors.muted, marginTop: 4, lineHeight: 1.45 }}>
            Hay {pedidos.length} {pedidos.length === 1 ? "pedido" : "pedidos"} sin factura pesando como
            comprometido. Engancharlo acá es lo que hace que ese número baje.
          </div>
        </div>
      )}

      {/* LEER CON NOVA TAMBIÉN AL EDITAR.
          Estaba solo al crear una factura, y eso deja afuera el caso normal:
          Johanna las carga a medida que llegan y quien conoce la obra las abre
          después para asignarlas. Al abrir una ya cargada no había forma de
          pedirle los renglones, que es justamente lo que hace falta para
          repartirla entre varios capítulos.

          Al editar NO pisa lo que ya está escrito salvo que esté vacío: lo que
          se busca en ese momento son los renglones, no volver a llenar el
          número de factura que alguien ya corrigió a mano. */}
      <div style={{ background: colors.brandSoft, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 12, marginBottom: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Sparkles size={16} color={colors.brand} />
          <div style={{ fontSize: 12, color: colors.brand, flex: 1, minWidth: 180 }}>
            {leyendo ? "NOVA está leyendo la factura..."
              : editando
                ? (form.archivo_url
                    ? "Esta factura ya tiene su papel cargado: NOVA puede leerlo y sacar los renglones para repartirla entre varios rubros."
                    : "Subí la foto o el PDF y NOVA saca los renglones, para repartirla entre varios rubros.")
                : "Sube una foto o PDF y NOVA llena los datos."}
          </div>
          {/* LEER LA QUE YA ESTÁ. El papel está en el depósito desde que
              alguien la cargó; quien viene a asignarla casi nunca lo tiene en
              su computadora. Pedirle que lo suba otra vez es pedirle a la
              persona equivocada un archivo que el sistema ya tiene. */}
          {form.archivo_url && (
            <Button variant="primary" size="sm" onClick={leerLaQueYaEstá} disabled={leyendo}>
              <Sparkles size={12} /> {leyendo ? "Leyendo…" : "Que NOVA lea la que ya está"}
            </Button>
          )}
          <Button variant={form.archivo_url ? "outline" : "primary"} size="sm"
            onClick={() => fileRef.current?.click()} disabled={leyendo}>
            <Upload size={12} /> {leyendo ? "Leyendo..." : form.archivo_url ? "Subir otra" : "Leer con NOVA"}
          </Button>
          <input ref={fileRef} type="file" accept="image/*,.pdf" onChange={leerConNova} style={{ display: "none" }} />
      </div>

      <AlertaDuplicado exactos={dups.exactos} posibles={dups.posibles} justificacion={justificacion} setJustificacion={setJustificacion} />
      {revisandoDups && <div style={{ fontSize: 11, color: colors.muted, marginBottom: 8 }}>Revisando si ya está cargada...</div>}

      {/* ── LO QUE DICE EL SRI ──────────────────────────────────────────────
          Acá y no en un informe aparte: quien carga la factura la tiene
          delante y todavía puede devolvérsela al proveedor. Un día después,
          ya pagada, lo único que queda es el problema.

          Y no bloquea nada. La factura existe, el gasto existe y la obra
          tiene que poder registrarlo: lo que cambia es que ahora se sabe, y
          queda escrito al lado de la factura para cuando alguien la vaya a
          pagar. */}
      {revisandoSri && (
        <div style={{ fontSize: 11.5, color: colors.muted, marginBottom: 8 }}>Preguntándole al SRI por esta factura…</div>
      )}
      {sri && !revisandoSri && (() => {
        const grave = sri.estado === "grave";
        const limpio = sri.estado === "ok";
        const tono = grave ? colors.danger : limpio ? colors.success : colors.warning;
        const fondo = grave ? colors.dangerSoft : limpio ? colors.successSoft : colors.warningSoft;
        return (
          <div style={{ background: fondo, border: `1px solid ${tono}33`, borderLeft: `3px solid ${tono}`,
            borderRadius: colors.radiusMd, padding: "9px 12px", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: tono, flex: 1 }}>
                {grave ? "⚠ Esta factura no sustenta el gasto"
                  : limpio ? "✓ Revisada en el SRI: todo en orden"
                    : sri.estado === "solo_ruc" ? `Proveedor confirmado en el SRI · el comprobante no se revisó`
                    : sri.estado === "sin_clave" ? "No se pudo revisar en el SRI"
                      : sri.estado === "sin_respuesta" ? "El SRI no contestó"
                        : `Revisada en el SRI · ${sri.hallazgos.length} ${sri.hallazgos.length === 1 ? "cosa para mirar" : "cosas para mirar"}`}
              </div>
              <button type="button" onClick={() => revisarEnSri()}
                style={{ background: "none", border: "none", cursor: "pointer", color: colors.muted,
                  fontSize: 11, fontFamily: colors.font, textDecoration: "underline" }}>
                volver a revisar
              </button>
            </div>
            {sri.proveedor && (
              <div style={{ fontSize: 11, color: colors.inkSoft, marginTop: 3, lineHeight: 1.45 }}>
                {sri.proveedor.razonSocial} · {sri.proveedor.regimen}
                {sri.proveedor.obligadoLlevarContabilidad === "SI" ? " · obligado a llevar contabilidad" : ""}
                {sri.autorizacion?.estado ? ` · ${sri.autorizacion.estado.toLowerCase()}` : ""}
              </div>
            )}
            {(sri.hallazgos || []).map((x, i) => (
              <div key={i} style={{ marginTop: 6, fontSize: 11.5, lineHeight: 1.45,
                color: x.nivel === "grave" ? colors.danger : colors.ink }}>
                <strong>{x.dice}</strong>
                {x.hacer && <div style={{ color: colors.inkSoft }}>{x.hacer}</div>}
              </div>
            ))}
          </div>
        );
      })()}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div><label style={lbl}>FECHA</label><input type="date" value={form.fecha || ""} onChange={e => set("fecha", e.target.value)} style={mini} /></div>
        <div><label style={lbl}>N° FACTURA</label><input value={form.numero_factura || ""} onChange={e => set("numero_factura", e.target.value)} onBlur={() => revisarDuplicados()} style={mini} /></div>
        <div><label style={lbl}>N° CHEQUE</label><input value={form.numero_cheque || ""} onChange={e => set("numero_cheque", e.target.value)} style={mini} /></div>
        {/* LA CLAVE DE ACCESO, A MANO SI HACE FALTA. NOVA la lee del papel,
            pero una foto borrosa o un dígito mal copiado dejan la factura sin
            revisar — y entonces se puede escribir y revisar igual. */}
        <div style={{ gridColumn: "span 2" }}>
          <label style={lbl}>CLAVE DE ACCESO (49 dígitos)</label>
          <input value={form.clave_acceso || ""} onChange={e => set("clave_acceso", e.target.value.replace(/\D/g, "").slice(0, 49))}
            placeholder="la de abajo del código de barras" style={mini} />
        </div>
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <Button variant="outline" size="sm" type="button" disabled={revisandoSri}
            onClick={() => revisarEnSri()}>
            {revisandoSri ? "Revisando…" : "Revisar en el SRI"}
          </Button>
        </div>
        <div><label style={lbl}>RUC</label><input value={form.ruc || ""} onChange={e => set("ruc", e.target.value)} style={mini} /></div>
        <div style={{ gridColumn: "span 2" }}><label style={lbl}>PROVEEDOR</label>
          <CampoProveedor valor={form.razon_social || ""} onChange={v => set("razon_social", v)}
            ruc={form.ruc} onRuc={v => set("ruc", v)} estilo={mini} /></div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={lbl}>DETALLE</label>
        <input value={form.detalle || ""} onChange={e => set("detalle", e.target.value)} style={mini} placeholder="Qué se compró / contrató" />
      </div>
      <div style={{ marginBottom: 10 }}>
        <label style={lbl}>JUSTIFICACIÓN</label>
        <input value={form.justificacion || ""} onChange={e => set("justificacion", e.target.value)} style={mini} placeholder="Para qué se usó en la obra" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8, marginBottom: 10 }}>
        <div><label style={lbl}>BASE 0%</label><input type="number" value={form.subtotal_0 ?? 0} onChange={e => recalcTotal({ subtotal_0: e.target.value })} style={mini} /></div>
        <div><label style={lbl}>BASE 5%</label><input type="number" value={form.subtotal_5 ?? 0} onChange={e => recalcTotal({ subtotal_5: e.target.value })} style={mini} /></div>
        <div><label style={lbl}>BASE 15%</label><input type="number" value={form.subtotal_15 ?? 0} onChange={e => recalcTotal({ subtotal_15: e.target.value })} style={mini} /></div>
        <div><label style={lbl}>IVA</label><input type="number" value={form.iva ?? 0} onChange={e => recalcTotal({ iva: e.target.value })} style={mini} /></div>
        <div><label style={lbl}>TOTAL</label><input type="number" value={form.total ?? 0} onChange={e => set("total", e.target.value)} style={{ ...mini, fontWeight: 700 }} /></div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
        <div>
          <label style={lbl}>TIPO DE GASTO</label>
          <select value={form.tipo || "material"} onChange={e => set("tipo", e.target.value)} style={mini}>
            {TIPOS_GASTO.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        {/* Qué es este papel. Una proforma no da crédito tributario y, sobre
            todo, alguien la tiene que convertir en factura: sin distinguirlas
            no se puede ni preguntar cuáles siguen pendientes. */}
        <div>
          <label style={lbl}>QUÉ ES ESTE DOCUMENTO</label>
          <select value={form.clase || "factura"} onChange={e => set("clase", e.target.value)} style={mini}>
            {Object.entries(CLASES_DOC).map(([id, c]) => <option key={id} value={id}>{c.label}</option>)}
          </select>
          <div style={{ fontSize: 10, color: colors.muted, marginTop: 3 }}>
            {(CLASES_DOC[form.clase || "factura"]).pista}
            {esNotaDeCredito(form.clase) && (
              <div style={{ color: colors.success, fontWeight: 600, marginTop: 3 }}>
                Escribí los montos como están en el papel, en positivo: entran restando solos.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CUÁNTO SE PAGÓ YA, al cargar la factura.
          Una factura cargada sin esto entra al control como gasto y queda
          debiéndose entera, aunque se haya pagado en el acto. Así la pantalla
          de Proveedores muestra una deuda que no existe, y alguien paga dos
          veces o discute con un proveedor que ya cobró.

          Va acá y no en otra pantalla porque es el momento en que se sabe: el
          que carga la factura tiene el comprobante en la mano. Dejarlo para
          después es dejarlo para nunca.

          En blanco significa que no se pagó nada todavía, que es lo correcto
          para una factura a crédito. */}
      {!editando && (
        <div style={{ background: colors.bg, borderRadius: colors.radiusMd, padding: 12, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7, flexWrap: "wrap" }}>
            <Banknote size={14} color={colors.muted} />
            <div style={{ fontSize: 12, fontWeight: 600, color: colors.ink }}>¿Cuánto de esta factura ya se pagó?</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "140px 150px 1fr", gap: 8, alignItems: "center" }}>
            <input type="number" step="0.01" value={pagado.monto}
              onChange={e => setPagado(p => ({ ...p, monto: e.target.value }))}
              placeholder="0,00" style={{ ...mini, textAlign: "right" }} />
            <select value={pagado.forma} onChange={e => setPagado(p => ({ ...p, forma: e.target.value }))} style={mini}>
              {FORMAS_PAGO.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              {n(form.total) > 0 && (
                <button onClick={() => setPagado(p => ({ ...p, monto: n(form.total) }))}
                  style={{ background: "none", border: `1px solid ${colors.border}`, borderRadius: 6,
                    padding: "4px 9px", fontSize: 11, color: colors.inkSoft, cursor: "pointer",
                    fontFamily: colors.font }}>
                  se pagó todo
                </button>
              )}
              <span style={{ fontSize: 11, color: n(pagado.monto) > n(form.total) ? colors.danger : colors.muted }}>
                {n(pagado.monto) > n(form.total)
                  ? "Es más que el total de la factura."
                  : n(form.total) > 0
                    ? `Queda debiendo $${fmt(Math.max(0, n(form.total) - n(pagado.monto)))}`
                    : "En blanco: a crédito, se paga después."}
              </span>
            </div>
          </div>
          {/* Y SI UNA PARTE SE PAGÓ CON UN VALE. No salió del banco: salió del
              crédito que este proveedor nos debía, y ese crédito deja de estar
              disponible por ese monto. Los dos pagos saldan la factura. */}
          {vales.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 8, alignItems: "center", marginTop: 7 }}>
              <input type="number" step="0.01" value={conVale.monto}
                onChange={e => setConVale(v => ({ ...v, monto: e.target.value, nota_credito_id: v.nota_credito_id || vales[0].id }))}
                placeholder="0,00" style={{ ...mini, textAlign: "right" }} />
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 11.5, color: colors.inkSoft }}>con la nota de crédito</span>
                <select value={conVale.nota_credito_id || vales[0].id}
                  onChange={e => setConVale(v => ({ ...v, nota_credito_id: e.target.value }))}
                  style={{ ...mini, width: "auto", maxWidth: 260 }}>
                  {vales.map(v => (
                    <option key={v.id} value={v.id}>
                      {v.numero_factura || v.detalle || "sin número"} · quedan ${fmt(v.disponible)}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => {
                  const elegido = vales.find(v => String(v.id) === String(conVale.nota_credito_id)) || vales[0];
                  const falta = Math.max(0, n(form.total) - n(pagado.monto));
                  setConVale({ nota_credito_id: elegido.id, monto: Math.min(elegido.disponible, falta || elegido.disponible) });
                }}
                  style={{ background: "none", border: `1px solid ${colors.border}`, borderRadius: 6,
                    padding: "4px 9px", fontSize: 11, color: colors.inkSoft, cursor: "pointer", fontFamily: colors.font }}>
                  usar el vale
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* LOS RENGLONES DE LA FACTURA, cada uno a su rubro.
          UNA FACTURA SIRVE A VARIOS CAPÍTULOS: la de ferretería trae cemento,
          varilla y alambre, y eso es albañilería, estructura e instalaciones.
          Repartir el total a ojo entre capítulos es inventar un dato; la
          factura ya dice qué trae y cuánto cuesta cada cosa.

          NOVA propone el rubro de cada renglón y acá se confirma. Lo que deja
          en blanco se elige a mano, que son dos segundos; lo que pone mal se
          corrige antes de guardar, que es cuando todavía se puede. */}
      {items.length > 0 && (
        <div style={{ background: colors.bg, borderRadius: colors.radiusMd, padding: 12, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <Sparkles size={14} color={colors.brand} />
            <div style={{ fontSize: 12, fontWeight: 600, color: colors.ink }}>
              NOVA leyó {items.length} {items.length === 1 ? "renglón" : "renglones"} en la factura
            </div>
            <button onClick={() => setItems([])}
              style={{ marginLeft: "auto", background: "none", border: "none", color: colors.muted,
                fontSize: 11, cursor: "pointer", fontFamily: colors.font }}>descartar</button>
          </div>

          {items.map((it, i) => (
            <div key={it.k} style={{ display: "grid", gridTemplateColumns: "1fr 80px 1.1fr", gap: 7,
              alignItems: "center", marginBottom: 5 }}>
              <div style={{ minWidth: 0, fontSize: 11.5, color: colors.ink, overflow: "hidden",
                textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={it.descripcion}>
                {it.descripcion}
                {it.cantidad ? <span style={{ color: colors.muted }}> · {it.cantidad} {it.unidad}</span> : null}
              </div>
              <input type="number" step="0.01" value={it.monto}
                onChange={e => setItems(xs => xs.map((x, j) => j === i ? { ...x, monto: e.target.value } : x))}
                style={{ ...mini, padding: "5px 7px", fontSize: 11.5, textAlign: "right" }} />
              {/* TODOS LOS DESTINOS, no solo los rubros del presupuesto.
                  Media factura no va a un rubro: va a una agrupación del
                  control, a una de las de afuera —logística, vivienda, gastos
                  de oficina— o a un capítulo entero cuando no se sabe cuánto
                  fue de cada rubro. Ofrecer solo los rubros obliga a elegir
                  mal o a no asignar, y las dos cosas terminan en el mismo
                  lugar: plata que no está donde pasó.

                  Y CADA RUBRO DICE CUÁNTO LE QUEDA. Asignar sin ver eso es
                  cómo un rubro se pasa de su presupuesto sin que nadie lo note
                  hasta el cierre del mes. */}
              <select value={it.destino ?? ""}
                onChange={e => setItems(xs => xs.map((x, j) => j === i
                  ? { ...x, destino: e.target.value || null } : x))}
                style={{ ...mini, padding: "5px 7px", fontSize: 11,
                  color: it.destino ? colors.ink : colors.warning }}>
                <option value="">¿a dónde va?</option>
                {capitulosDeRubros.map(c => (
                  <optgroup key={c} label={c}>
                    <option value={`cap:${c}`}>Todo el capítulo {c}</option>
                    {rubros.filter(r => r.capitulo === c && !r.oculto && !r.anulado_por_oc).map(r => {
                      const acc = control[r.id];
                      const queda = acc ? acc.saldo : n(r.total_base);
                      return (
                        <option key={r.id} value={`rubro:${r.id}`}>
                          {r.numero} {String(r.descripcion).slice(0, 38)} · queda ${fmt(queda)}
                        </option>
                      );
                    })}
                  </optgroup>
                ))}
                {actividades.filter(a => !a.extra).length > 0 && (
                  <optgroup label="Agrupaciones del control">
                    {actividades.filter(a => !a.extra).map(a => (
                      <option key={a.id} value={`act:${a.id}`}>{a.codigo ? `${a.codigo} · ` : ""}{a.nombre}</option>
                    ))}
                  </optgroup>
                )}
                {actividades.filter(a => a.extra).length > 0 && (
                  <optgroup label="Fuera del presupuesto">
                    {actividades.filter(a => a.extra).map(a => (
                      <option key={a.id} value={`act:${a.id}`}>{a.codigo ? `${a.codigo} · ` : ""}{a.nombre}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          ))}

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
            <Button variant="primary" size="sm"
              disabled={!items.some(x => x.destino)}
              onClick={() => {
                // EL IVA SE REPARTE, NO QUEDA COLGANDO.
                //
                // NOVA lee los renglones como están en el papel: sin IVA. El
                // total de la factura lo lleva. Así que alguien asignaba los
                // doce renglones, veía que no cerraba, y se quedaba con un
                // saldo sin asignar que no entendía — porque no era un renglón
                // que faltara: era el impuesto.
                //
                // Y el IVA es costo de la obra: el rubro costó lo que costó
                // con impuesto. Se reparte entre los destinos en la misma
                // proporción en que se repartió la base.
                const suma = items.filter(x => x.destino).reduce((t, x) => t + n(x.monto), 0);
                const escala = suma > 0 ? n(form.total) / suma : 1;
                const porDestino = new Map();
                items.forEach(x => {
                  if (!x.destino) return;
                  porDestino.set(x.destino, (porDestino.get(x.destino) || 0) + n(x.monto) * escala);
                });
                setRepartos([...porDestino.entries()].map(([clave, monto]) => {
                  const [tipo, id] = [clave.slice(0, clave.indexOf(":")), clave.slice(clave.indexOf(":") + 1)];
                  return {
                    tipo: tipo === "cap" ? "capitulo" : tipo === "act" ? "actividad" : "rubro",
                    id: tipo === "cap" ? id : Number(id),
                    monto: Math.round(monto * 100) / 100,
                  };
                }));
              }}>
              Asignar {items.filter(x => x.destino).length} de {items.length}
            </Button>
            {/* QUE LA SUMA CUADRE. Si los renglones no dan el total de la
                factura, falta uno o sobra: el descuento, el transporte, o una
                línea que la foto cortó. Decirlo acá evita descubrirlo cuando ya
                no se puede comparar con el papel. */}
            {(() => {
              const suma = items.reduce((t, x) => t + n(x.monto), 0);
              const base = n(form.subtotal_0) + n(form.subtotal_5) + n(form.subtotal_15);
              const dif = Math.round((suma - base) * 100) / 100;
              return (
                <span style={{ fontSize: 11, color: Math.abs(dif) < 0.02 ? colors.success : colors.warning }}>
                  {Math.abs(dif) < 0.02
                    ? `Los renglones suman los $${fmt(suma)} de la base. Al asignar se les reparte el IVA hasta los $${fmt(n(form.total))} de la factura.`
                    : `Los renglones suman $${fmt(suma)} y la base es $${fmt(base)} — ${dif > 0 ? "sobran" : "faltan"} $${fmt(Math.abs(dif))}.`}
                </span>
              );
            })()}
          </div>
        </div>
      )}

      {/* Reparto. Por actividad es el camino normal; el rubro es la excepción. */}
      <div style={{ background: colors.bg, borderRadius: colors.radiusMd, padding: 12, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: colors.ink }}>¿A qué agrupación va?</div>
          <div style={{ marginLeft: "auto", fontSize: 11, color: diferencia === 0 ? colors.success : colors.warning, fontWeight: 600 }}>
            {diferencia === 0 ? "Cuadrado" : `Faltan $${fmt(diferencia)}`}
          </div>
        </div>

        {repartos.map((r, i) => {
          const act = r.tipo === "actividad" ? actividades.find(a => a.id === r.id) : null;
          const rubro = r.tipo === "rubro" ? rubros.find(x => x.id === r.id) : null;
          return (
            <div key={`${r.tipo}-${r.id}`} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {act ? (
                  <><span style={{ color: colors.muted, marginRight: 5 }}>{act.codigo}</span>{act.nombre}</>
                ) : r.tipo === "capitulo" ? (
                  <><span style={{ color: colors.muted, marginRight: 5 }}>capítulo</span>{r.id}
                    <span style={{ color: colors.muted, fontSize: 10.5 }}> · sin repartir</span></>
                ) : (
                  <><span style={{ color: colors.muted, marginRight: 5 }}>rubro {rubro?.numero}</span>{rubro?.descripcion || "Rubro"}</>
                )}
              </div>
              {/* EL PORCENTAJE, al lado del monto. Una factura de mano de obra
                  casi nunca se reparte en cifras redondas: se reparte "mitad y
                  mitad" o "60 y 40". Escribir el % y que calcule el monto es
                  como se piensa, y evita la cuenta a mano que después no cuadra
                  con el total por un centavo. */}
              <input type="number" step="0.01"
                value={n(form.total) > 0 ? Math.round((n(r.monto) / n(form.total)) * 10000) / 100 : ""}
                onChange={e => {
                  const pct = Number(e.target.value) || 0;
                  const monto = Math.round(n(form.total) * pct) / 100;
                  setRepartos(rs => rs.map((x, j) => j === i ? { ...x, monto } : x));
                }}
                title="Qué porcentaje de la factura va acá"
                style={{ ...mini, width: 64, textAlign: "right" }} />
              <span style={{ fontSize: 11, color: colors.muted }}>%</span>
              <input type="number" value={r.monto} onChange={e => setRepartos(rs => rs.map((x, j) => j === i ? { ...x, monto: e.target.value } : x))}
                style={{ ...mini, width: 100, textAlign: "right" }} />
              <button onClick={() => setRepartos(rs => rs.filter((_, j) => j !== i))}
                style={{ background: colors.dangerSoft, border: "none", borderRadius: 6, padding: "6px 8px", color: colors.danger, cursor: "pointer", display: "flex" }}>
                <Trash2 size={12} />
              </button>
            </div>
          );
        })}

        {/* CAPÍTULO Y DESPUÉS RUBRO, que es como se piensa una factura.
            Elegir el rubro exacto estaba escondido detrás de un enlace
            subrayado y era una búsqueda por texto: había que acordarse del
            nombre. Lo fácil era asignar a la agrupación, y eso PRORRATEA el
            monto entre todos sus rubros —la factura de cemento suma un poco a
            cada renglón y nada al que corresponde—. Lo exacto tiene que ser lo
            cómodo. */}
        {/* LA LISTA DEL CAPÍTULO, PARA MARCAR VARIOS.
            Una factura de mano de obra cubre cuatro o cinco rubros del mismo
            capítulo, y elegirlos de a uno en un desplegable es abrirlo cinco
            veces. Acá se marcan los que entran y después se decide cuánto va a
            cada uno: en partes iguales, por porcentaje, o escribiendo el monto.

            Marcar NO reparte solo: el monto de cada uno arranca en cero y lo
            pone quien sabe. Repartir automáticamente al marcar sería volver al
            prorrateo por otra puerta. */}
        {/* MARCAR TODO EL CAPÍTULO de un saque: con quince rubros, tocarlos
            de a uno para después prorratear es trabajo que la pantalla puede
            hacer sola. */}
        {capElegido && rubrosDelDestino.length > 1 && (
          <button onClick={() => setRepartos(rs => [
            ...rs,
            ...rubrosDelDestino
              .filter(r => !rs.some(x => x.tipo === "rubro" && x.id === r.id))
              .map(r => ({ tipo: "rubro", id: r.id, monto: 0 })),
          ])}
            style={{ background: "none", border: "none", color: colors.brand, fontSize: 11.5,
              cursor: "pointer", fontFamily: colors.font, padding: "6px 0 2px" }}>
            Marcar los {rubrosDelDestino.length} rubros de {nombreDestino}
          </button>
        )}

        {capElegido && (
          <div style={{ marginTop: 6, border: `1px solid ${colors.border}`, borderRadius: colors.radiusSm,
            maxHeight: 190, overflowY: "auto", background: "#fff" }}>
            {rubrosDelDestino.map(r => {
              const puesto = repartos.some(x => x.tipo === "rubro" && x.id === r.id);
              return (
                <div key={r.id}
                  onClick={() => puesto
                    ? setRepartos(rs => rs.filter(x => !(x.tipo === "rubro" && x.id === r.id)))
                    : setRepartos(rs => [...rs, { tipo: "rubro", id: r.id, monto: 0 }])}
                  style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 10px",
                    borderBottom: `1px solid ${colors.neutralSoft}`, cursor: "pointer",
                    background: puesto ? colors.brandSoft : "transparent" }}>
                  <div style={{ width: 14, height: 14, borderRadius: 4, flexShrink: 0,
                    border: `1.5px solid ${puesto ? colors.brand : colors.border}`,
                    background: puesto ? colors.brand : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {puesto && <Check size={9} color="#fff" />}
                  </div>
                  <span style={{ color: colors.muted, fontSize: 10.5, width: 26, flexShrink: 0 }}>{r.numero}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: colors.ink,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.descripcion}</span>
                  <span style={{ fontSize: 10.5, color: colors.muted, flexShrink: 0 }}>
                    ${fmt(r.total_base)}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* EN PARTES IGUALES. Una factura de mano de obra que cubre cuatro
            rubros se reparte en cuatro, y hacer esa división a mano termina en
            un total que no cuadra por un centavo. El último se queda con el
            resto, para que la suma dé exacta. */}
        {/* QUE SE VEA QUE ES UN BOTÓN Y QUE DIGA QUÉ VA A HACER.
            Era un rectángulo con borde gris y sin color, que es exactamente
            como se dibuja un botón apagado: se lee "no se puede", no "tocá
            acá". Y decía "repartir en partes iguales" sin decir entre cuántos
            ni cuánta plata, así que apretarlo era una apuesta. */}
        {repartos.length > 0 && n(form.total) > 0 && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 2, marginBottom: 6, flexWrap: "wrap" }}>
            <button onClick={() => {
                const cuantos = repartos.length;
                const parte = Math.floor((n(form.total) / cuantos) * 100) / 100;
                setRepartos(rs => rs.map((x, j) => ({
                  ...x,
                  monto: j === cuantos - 1
                    ? Math.round((n(form.total) - parte * (cuantos - 1)) * 100) / 100
                    : parte,
                })));
              }}
              style={{ background: colors.brand, border: "none", borderRadius: 6,
                padding: "6px 12px", fontSize: 12, fontWeight: 600, color: "#fff", cursor: "pointer",
                fontFamily: colors.font }}>
              Repartir ${fmt(n(form.total))} entre {repartos.length}
            </button>
            {/* A PRORRATA DE LO QUE PESA CADA UNO, que es distinto de en
                partes iguales. Si el capítulo tiene un rubro de $10.000 y otro
                de $500, repartir una factura mitad y mitad entre los dos hace
                que el chico aparezca al 300% y el grande al 5%. A prorrata cada
                uno se lleva lo que le toca por tamaño: es la única repartición
                que no exige inventar un dato que nadie tiene. */}
            <button onClick={() => {
                const base = repartos.reduce((t, x) => {
                  const r = rubros.find(y => y.id === x.id);
                  return t + (x.tipo === "rubro" ? n(r?.total_base) : 0);
                }, 0);
                if (!base) return;
                let dado = 0;
                setRepartos(rs => rs.map((x, j) => {
                  if (x.tipo !== "rubro") return x;
                  const r = rubros.find(y => y.id === x.id);
                  const ultimo = j === rs.length - 1;
                  // El resto que no divide exacto va al último: si se tira, el
                  // total de la factura deja de coincidir con lo asignado y ese
                  // centavo aparece después como un descuadre inexplicable.
                  const monto = ultimo
                    ? Math.round((n(form.total) - dado) * 100) / 100
                    : Math.round((n(form.total) * (n(r?.total_base) / base)) * 100) / 100;
                  dado = Math.round((dado + monto) * 100) / 100;
                  return { ...x, monto };
                }));
              }}
              style={{ background: "none", border: `1px solid ${colors.border}`, borderRadius: 6,
                padding: "6px 11px", fontSize: 11.5, color: colors.inkSoft, cursor: "pointer",
                fontFamily: colors.font }}>
              …o a prorrata de lo que pesa cada uno
            </button>
            <span style={{ fontSize: 10.5, color: colors.muted, flexBasis: "100%" }}>
              …o escribí el % de cada uno y el monto se calcula solo
            </span>
          </div>
        )}

        {/* AL CAPÍTULO ENTERO, sin repartir.
            La factura de $4.000 del maestro albañil no es "$180 de mampostería,
            $310 de enlucido y $94 de mochetas": es $4.000 de albañilería.
            Prorratearla inventa una precisión que no existe, y después alguien
            compara el avance de un rubro con su presupuesto y ese número no
            significa nada. Acá la plata suma al capítulo y los rubros quedan en
            cero, que es la verdad: no se sabe cuánto fue de cada uno. */}
        {capElegido && !repartos.some(r =>
            (esAgrupacion ? r.tipo === "actividad" && r.id === Number(capElegido.slice(4))
                          : r.tipo === "capitulo" && r.id === capElegido)) && (
          <button onClick={() => esAgrupacion
              ? agregar("actividad", Number(capElegido.slice(4)))
              : agregar("capitulo", capElegido)}
            style={{ background: "none", border: `1px solid ${colors.border}`, borderRadius: 6,
              padding: "5px 10px", fontSize: 11.5, color: colors.inkSoft, cursor: "pointer",
              fontFamily: colors.font, marginTop: 6, marginBottom: 2, display: "block" }}>
            …o cargarlo a <strong>{nombreDestino}</strong> entero
            {rubrosDelDestino.length
              ? (esAgrupacion ? ", repartido a prorrata entre sus rubros" : ", sin repartir entre sus rubros")
              : ""}
          </button>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 6, marginTop: 6 }}>
          {/* LOS CAPÍTULOS DEL CONTRATO Y LAS AGRUPACIONES QUE NO LO SON,
              en la misma lista.
              Vivienda, logística y gastos de oficina no son capítulos del
              presupuesto —no están contratados, no tienen rubros— y por eso no
              salían acá: vivían solo en el desplegable de agrupaciones de más
              abajo. Pero quien carga una factura de flete no está pensando "esto
              es una agrupación extra", está buscando dónde va. Van juntas y
              separadas por su título, que es lo que las distingue sin
              esconderlas.

              Al elegir una de ésas la plata va entera: no tienen rubros entre
              los cuales repartir, así que no hay nada que prorratear. */}
          <select value={capElegido}
            onChange={e => { setCapElegido(e.target.value); setBusqueda(""); }}
            style={mini}>
            <option value="">Capítulo…</option>
            {capitulosDeRubros.length > 0 && (
              <optgroup label="Del presupuesto">
                {capitulosDeRubros.map(c => <option key={c} value={c}>{c}</option>)}
              </optgroup>
            )}
            {/* TODAS LAS AGRUPACIONES, no solo las que no vienen del
                presupuesto. La obra está organizada por agrupaciones —son las
                que mandan en el control, en el cronograma y en el valorado— así
                que es lo primero que uno busca al asignar una factura. Tener
                veintiuna en un desplegable distinto, más abajo, es esconderlas.
                Las extras van aparte porque se gastan contra el margen y no
                contra el contrato, y esa diferencia importa al elegir. */}
            {actividades.filter(a => !a.extra).length > 0 && (
              <optgroup label="Agrupaciones del control">
                {actividades.filter(a => !a.extra).map(a => (
                  <option key={a.id} value={`act:${a.id}`}>
                    {a.codigo ? `${a.codigo} · ` : ""}{a.nombre}
                  </option>
                ))}
              </optgroup>
            )}
            {actividades.filter(a => a.extra).length > 0 && (
              <optgroup label="Fuera del presupuesto">
                {actividades.filter(a => a.extra).map(a => (
                  <option key={a.id} value={`act:${a.id}`}>
                    {a.codigo ? `${a.codigo} · ` : ""}{a.nombre}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <select value="" disabled={!capElegido}
            onChange={e => { if (e.target.value) agregar("rubro", Number(e.target.value)); }}
            style={mini}>
            <option value="">{capElegido ? "Rubro…" : "elegí el capítulo primero"}</option>
            {rubrosDelDestino.filter(r => !repartos.some(x => x.tipo === "rubro" && x.id === r.id))
              .map(r => (
                <option key={r.id} value={r.id}>
                  {r.numero} · {r.descripcion}
                </option>
              ))}
          </select>
        </div>

        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <select value="" onChange={e => agregar("actividad", Number(e.target.value))} style={{ ...mini, flex: 1 }}>
            <option value="">…o a una agrupación entera, de un saque</option>
            {actividades.filter(a => !repartos.some(r => r.tipo === "actividad" && r.id === a.id))
              .map(a => <option key={a.id} value={a.id}>{a.codigo} · {a.nombre}</option>)}
          </select>
        </div>

        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <input value={nuevaActividad} onChange={e => setNuevaActividad(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && nuevaActividad.trim()) crearYAsignar(); }}
            placeholder="…o crear una agrupación nueva" style={{ ...mini, flex: 1 }} />
          <Button variant="outline" size="sm" onClick={crearYAsignar} disabled={!nuevaActividad.trim()}>
            <Plus size={12} /> Crear
          </Button>
        </div>

        {actividades.length === 0 && (
          <div style={{ fontSize: 11, color: colors.warning, marginTop: 6 }}>
            Esta obra todavía no tiene agrupaciones. Créala acá arriba, o agrúpalas de una con NOVA en la pestaña Agrupaciones.
          </div>
        )}

        <button onClick={() => setPorRubro(v => !v)}
          style={{ background: "none", border: "none", padding: "8px 0 0", color: colors.muted, fontSize: 11, cursor: "pointer", fontFamily: colors.font, textDecoration: "underline" }}>
          {porRubro ? "Ocultar" : "Asignar a un rubro exacto"}
        </button>

        {porRubro && (
          <>
            <div style={{ fontSize: 10, color: colors.muted, margin: "4px 0 5px" }}>
              Lo asignado a una agrupación se reparte entre sus rubros a prorrata. Si sabes el rubro exacto, asígnalo acá y el monto no se prorratea.
            </div>
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar rubro..." style={mini} />
            {coincidencias.length > 0 && (
              <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusSm, marginTop: 4, maxHeight: 160, overflowY: "auto" }}>
                {coincidencias.map(r => (
                  <div key={r.id} onClick={() => agregar("rubro", r.id)}
                    style={{ padding: "7px 10px", fontSize: 12, cursor: "pointer", borderBottom: `1px solid ${colors.neutralSoft}`, display: "flex", gap: 8 }}>
                    <span style={{ color: colors.muted }}>{r.numero}</span>
                    <span style={{ flex: 1, minWidth: 0, color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.descripcion}</span>
                    <span style={{ color: colors.muted, fontSize: 11 }}>{r.capitulo}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {repartos.length === 0 && (
          <div style={{ fontSize: 11, color: colors.muted, marginTop: 6 }}>
            Si no asignas nada ahora, la factura queda en "por asignar" y no se cuenta en el control hasta que la asignes.
          </div>
        )}
      </div>

      {error && <div style={{ color: colors.danger, fontSize: 12, marginBottom: 10 }}>{error}</div>}

      <Button variant="primary" size="lg" style={{ width: "100%" }} onClick={guardar} disabled={guardando}>
        {guardando ? "Guardando..." : editando ? "Guardar cambios" : "Agregar factura"}
      </Button>
    </Modal>
  );
}
