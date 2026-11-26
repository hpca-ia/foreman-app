// COMPARAR LAS COTIZACIONES DE VARIAS EMPRESAS, CAPÍTULO POR CAPÍTULO, Y
// ELEGIR CUÁL ALIMENTA EL PRESUPUESTO.
//
// Hernán, 26/11/2026: «Al armar presupuestos se cotiza de distintas empresas y
// vienen distintos presupuestos... ¿cómo se puede comparar y posterior a eso
// escoger la mejor opción para que ingrese al presupuesto? Una especie de
// matriz». Y con las primeras cotizaciones de verdad cargadas: «Son varias
// cotizaciones... pueden ser dos o tres de cocinas o puertas o vidrios... una
// de ellas iría al presupuesto. La comparativa se la categoriza por capítulos
// del presupuesto. Una vez escogida una, los rubros de la proforma
// alimentarían el capítulo». «Arriba se puede ver total de la oferta y si se
// despliega se ve el itemizado de las ofertas». «¿En dónde se guardan las
// ofertas leídas? Se deben poder ver por si hay condiciones o cualquier otra
// info adicional».
//
// CÓMO SE LEE LA PANTALLA:
//
//   · CADA CAPÍTULO TIENE SU MATRIZ, con una columna por cada empresa que
//     cotizó ESE capítulo («FOGA es otro capítulo, igual está arriba junto a
//     las otras... esto puede confundir»). ARRIBA EL TOTAL de lo que cotizó
//     cada una ahí; al desplegarla, EL ITEMIZADO: una fila por cada cosa
//     cotizada, con lo de cada empresa al lado. Las filas no son los rubros
//     del presupuesto: son lo que las empresas cotizaron.
//
//   · La empresa que mandó una sola suma se compara por su total; su parte en
//     cada fila es una estimación y se marca. «Con las actualizaciones se
//     irán emparejando los rubros»: cuando mande el detalle, sube como
//     versión nueva y cae en las mismas filas.
//
//   · De cada empresa se abre EL PAPEL ORIGINAL, y se leen sus condiciones.
//
//   · Se elige por capítulo —tocando su total— o fila por fila. Recién al
//     confirmar, los rubros de la proforma elegida entran al capítulo del
//     presupuesto. Ahí mismo se ve qué entra, qué cambia y qué se quita, y se
//     tilda cuáles de los rubros que el capítulo ya tenía reemplaza.
//
// NO ES EL PRESUPUESTO FINAL: es de donde se alimenta. Y SE VUELVE: cada
// empresa puede mandar una versión nueva, que reemplaza a la anterior —que
// queda guardada—, y se vuelve a escoger. La cuenta vive en
// matrizDeCotizaciones.js.
//
// SE GUARDA SOLO: lo que se elige y lo que se corrige queda guardado al
// tocarlo, con el estado al lado. Lo único que pide confirmación es pasar al
// presupuesto, y se confirma acá mismo, sin ventanas del navegador.
import { Fragment, useState, useEffect, useMemo, useCallback, useRef } from "react";
import { ArrowLeft, Upload, Check, ListChecks, X, FileText } from "lucide-react";
import { colors } from "../../theme/colors";
import { guardarOriginal, listarOriginales, abrirOriginal } from "../../lib/archivosPresupuesto";
import {
  matrizDeCotizaciones, elegir, planDeAplicar, elegidosPorCotizacion, elegidosDe, totalDelRenglon, filasParaUbicar, alCapitulo, paraSacarLaFila, SIN_CAPITULO,
  anterioresDe, versionesDe, heredarFilas, elegidosAlActualizar, cambiosDeVersion,
} from "./matrizDeCotizaciones.js";
import { cuadreDeLaLectura, capitulosParaUbicar } from "./emparejarCotizacion.js";
import {
  cotizacionesDe, guardarCotizacion, guardarNuevaVersion, actualizarCotizacion, borrarCotizacion, leerCotizacionDeArchivo, SIN_195,
} from "./cotizacionesDelPresupuesto";
import CompartirConElCliente from "./CompartirConElCliente";

const n = v => Number(v) || 0;
const plata = v => n(v).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cant = v => n(v).toLocaleString("es-EC", { maximumFractionDigits: 2 });
const pct = v => `${v > 0 ? "+" : "−"}${Math.abs(v).toLocaleString("es-EC", { maximumFractionDigits: 1 })} %`;
const dia = f => (f ? new Date(f).toLocaleDateString("es-EC", { day: "numeric", month: "short" }) : "");
const QUE_PASO = { subio: "subió", bajo: "bajó", nuevo: "ahora lo cotiza", ya_no: "ya no lo cotiza", cantidad: "mismo precio, otra cantidad" };
const DE_DONDE = {
  otras: "repartida en proporción a lo que detallaron las otras empresas",
  iguales: "repartida a partes iguales, porque no hay con qué medir la proporción",
};

const th = { padding: "8px 9px", textAlign: "right", verticalAlign: "top", borderBottom: `1.5px solid ${colors.border}`, fontSize: 11.5, minWidth: 158 };
const td = { padding: "6px 9px", textAlign: "right", verticalAlign: "top", borderBottom: `1px solid ${colors.neutralSoft}`, fontSize: 12 };
const chico = { fontSize: 10.5, color: colors.muted, lineHeight: 1.4 };
const pastilla = (color, fondo) => ({ fontSize: 9.5, fontWeight: 700, color, background: fondo, borderRadius: 9, padding: "1px 6px", marginLeft: 5, whiteSpace: "nowrap" });
const enlace = { background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: colors.font, fontSize: 10.5, color: colors.brand, textDecoration: "underline" };
// Cada capítulo tiene su tabla, y las columnas van del mismo ancho en todas: se leen de una matriz a la otra.
const ANCHO_DE_EMPRESA = 200, ANCHO_DEL_PRESUPUESTO = 130;
// La matriz de la empresa que no quedó en ningún capítulo: sin filas y sin totales.
const NADA = { capitulo: SIN_CAPITULO, filas: [], fuera: [], sub: {} };
const selector = { maxWidth: "100%", fontFamily: colors.font, fontSize: 11, color: colors.ink, border: `1px solid ${colors.border}`, borderRadius: 6, padding: "2px 4px", background: "#fff" };

export default function MatrizCotizaciones({ presupuesto, capitulos = [], items = [], currentUser, puedeEditar = true, onCerrar, onAplicar, onArchivo }) {
  const [cots, setCots] = useState([]);              // todas: las vigentes y las versiones anteriores
  const [elegidos, setElegidos] = useState({});      // { fila → cotización }
  const [originales, setOriginales] = useState([]);  // los papeles guardados del presupuesto
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [leyendo, setLeyendo] = useState("");
  const [estado, setEstado] = useState("");          // "guardando" | "guardado"
  const [abiertos, setAbiertos] = useState(new Set());      // los capítulos con el itemizado a la vista
  const [revisando, setRevisando] = useState(null);  // la cotización cuyos renglones se miran
  const [versionVista, setVersionVista] = useState(null);   // y cuál de sus versiones
  const [verCambios, setVerCambios] = useState(null);
  const [panelEn, setPanelEn] = useState(null);      // el capítulo bajo cuya matriz se abrió lo de una empresa
  const [previa, setPrevia] = useState(false);
  const [reemplaza, setReemplaza] = useState(new Set());    // los rubros que el capítulo ya tenía y la cotización reemplaza
  const [enlaces, setEnlaces] = useState({});               // { renglón → rubro que ya está, con el que se empareja }
  const [aplicando, setAplicando] = useState(false);
  const [quitando, setQuitando] = useState(null);
  const [noSePuedeSacar, setNoSePuedeSacar] = useState(null);   // { clave, porQue }: la fila que no se pudo sacar, y por qué
  const archivoRef = useRef(null);
  const versionRef = useRef(null);
  const deQuienEsLaVersion = useRef(null);

  const cargarPapeles = useCallback(async () => {
    if (!presupuesto?.id) return;
    const r = await listarOriginales(presupuesto.id).catch(() => null);
    setOriginales(r?.archivos || []);
  }, [presupuesto?.id]);
  const cargar = useCallback(async () => {
    if (!presupuesto?.id) return;
    const r = await cotizacionesDe(presupuesto.id);
    setCargando(false);
    if (r.error) { setError(r.error); return; }
    setCots(r.cotizaciones);
    setElegidos(elegidosDe(r.cotizaciones));
    cargarPapeles();
  }, [presupuesto?.id, cargarPapeles]);
  useEffect(() => { cargar(); }, [cargar]);

  const matriz = useMemo(() => matrizDeCotizaciones({ capitulos, items, cotizaciones: cots }), [capitulos, items, cots]);
  // La versión anterior de cada empresa, con su propia matriz: de ahí sale qué cambió.
  const matrizDeAntes = useMemo(() => matrizDeCotizaciones({ capitulos, items, cotizaciones: anterioresDe(cots) }), [capitulos, items, cots]);
  // Lo elegido que sigue teniendo de dónde salir, y que ya tiene capítulo: sin capítulo no hay a dónde pasarlo.
  const vigentes = useMemo(() => {
    const sinLugar = new Set((matriz.grupos.find(g => g.capitulo === SIN_CAPITULO)?.filas || []).map(f => f.clave));
    return Object.fromEntries(Object.entries(elegidos).filter(([clave, c]) => matriz.celdaDe(clave, c) && !sinLugar.has(clave)));
  }, [elegidos, matriz]);
  const plan = useMemo(() => planDeAplicar({ matriz, elegidos: vigentes, items, enlaces }), [matriz, vigentes, items, enlaces]);
  const nombresDeCapitulos = useMemo(() => capitulosParaUbicar(capitulos).map(c => c.nombre), [capitulos]);

  // SE GUARDA SOLO, con el estado al lado.
  const guardar = async (id, campos) => {
    setEstado("guardando");
    const err = await actualizarCotizacion(id, campos);
    if (err) { setError(err); setEstado(""); return false; }
    setEstado("guardado");
    return true;
  };

  async function cambiarElegidos(nuevo) {
    const antes = elegidosPorCotizacion(vigentes), ahora = elegidosPorCotizacion(nuevo);
    setElegidos(nuevo); setPrevia(false); setAviso("");
    for (const c of cots.filter(x => !x.reemplazada_at)) {
      const a = (antes[c.id] || []).slice().sort().join(","), b = (ahora[c.id] || []).slice().sort().join(",");
      if (a !== b) {
        setCots(cs => cs.map(x => (x.id === c.id ? { ...x, elegidos: ahora[c.id] || [] } : x)));
        await guardar(c.id, { elegidos: ahora[c.id] || [] });
      }
    }
  }
  const tocar = (cotId, que) => { if (puedeEditar) cambiarElegidos(elegir(matriz, vigentes, cotId, que)); };

  /** El papel se guarda tal como llegó y NOVA lo lee. @returns { leida, archivoId } o null si no se pudo. */
  async function leerPapel(file) {
    setLeyendo(file.name);
    const g = await guardarOriginal(presupuesto.id, file, "cotizacion", currentUser);
    if (g.archivo) { onArchivo?.(); cargarPapeles(); }
    // A qué capítulo va, y en qué fila de lo que ya cotizaron las otras cae cada renglón.
    const leida = await leerCotizacionDeArchivo(file, { capitulos: capitulosParaUbicar(capitulos), filas: filasParaUbicar(matriz) });
    if (leida.error) { setError(`${file.name}: ${leida.error}`); return null; }
    return { leida, archivoId: g.archivo?.id ?? null };
  }
  const queSeLeyo = (nombre, renglones, totales) => {
    const cuadre = cuadreDeLaLectura({ renglones, totales });
    const caps = [...new Set(renglones.map(r => r.capitulo).filter(Boolean))];
    return `${nombre}: ${renglones.length} ${renglones.length === 1 ? "renglón leído" : "renglones leídos"}, $${plata(renglones.reduce((t, r) => t + totalDelRenglon(r), 0))}`
      + (caps.length ? ` · va a ${caps.map(c => `«${c}»`).join(" y ")}` : " · NOVA no supo a qué capítulo va: decíselo en «renglones»")
      + (cuadre.cuadra === false ? `. OJO: su papel dice $${plata(cuadre.escrito)}: puede faltar un renglón` : "");
  };

  async function subir(e) {
    const archivos = [...(e.target.files || [])];
    e.target.value = "";
    if (!archivos.length || !presupuesto?.id) return;
    setError(""); setAviso("");
    for (const file of archivos) {
      const p = await leerPapel(file);
      if (!p) continue;
      const r = await guardarCotizacion({
        presupuestoId: presupuesto.id, proveedor: p.leida.proveedor || file.name.replace(/\.[a-z0-9]+$/i, ""),
        archivoId: p.archivoId, renglones: p.leida.renglones, totales: p.leida.totales, quien: currentUser,
      });
      if (r.error) { setError(r.error); break; }
      setCots(cs => [...cs, r.cotizacion]);
      setAviso(queSeLeyo(r.cotizacion.proveedor, p.leida.renglones, p.leida.totales) + ".");
    }
    setLeyendo("");
  }

  // UNA VERSIÓN NUEVA DE LA MISMA EMPRESA. Reemplaza a la anterior, que queda
  // guardada. Los renglones que se llaman igual quedan en su capítulo y en sus
  // filas, y lo que estaba elegido y sigue cotizado sigue elegido —con el
  // precio nuevo, que hay que volver a pasar—.
  async function subirVersion(e) {
    const file = (e.target.files || [])[0];
    e.target.value = "";
    const anterior = cots.find(c => c.id === deQuienEsLaVersion.current);
    if (!file || !anterior) return;
    setError(""); setAviso("");
    const p = await leerPapel(file);
    if (!p) { setLeyendo(""); return; }
    const comoEstaba = matriz.empresas.find(x => x.id === anterior.id)?.renglones || [];
    let renglones = heredarFilas(p.leida.renglones, comoEstaba);
    // Lo que NOVA no supo ubicar va al capítulo donde ya estaba la empresa.
    const suCapitulo = comoEstaba.map(r => r.capitulo).find(Boolean) || "";
    renglones = renglones.map(r => (r.capitulo ? r : { ...r, capitulo: suCapitulo }));
    const totales = { ...(p.leida.totales || {}), ...(anterior.totales?.sin_descuento ? { sin_descuento: true } : {}) };
    const siguen = elegidosAlActualizar({
      capitulos, items, otras: cots.filter(c => !c.reemplazada_at && c.id !== anterior.id),
      nueva: { renglones, totales }, elegidosAntes: anterior.elegidos || [],
    });
    const r = await guardarNuevaVersion({ anterior, archivoId: p.archivoId, renglones, totales, elegidos: siguen, quien: currentUser });
    setLeyendo("");
    if (r.error) { setError(r.error); return; }
    const todas = [...cots.map(c => (c.id === anterior.id ? r.anterior : c)), r.cotizacion];
    setCots(todas); setElegidos(elegidosDe(todas)); setPrevia(false);
    if (revisando === anterior.id) { setRevisando(r.cotizacion.id); setVersionVista(null); }
    setVerCambios(r.cotizacion.id);
    const soltados = (anterior.elegidos || []).length - siguen.length;
    setAviso(queSeLeyo(`${anterior.proveedor}, versión ${r.cotizacion.version}`, renglones, totales)
      + ". La versión anterior quedó guardada."
      + (siguen.length ? ` Lo que tenía elegido y sigue cotizando sigue elegido (${siguen.length} ${siguen.length === 1 ? "fila" : "filas"}): abajo dice qué hay que volver a pasar.` : "")
      + (soltados > 0 ? ` ${soltados} ${soltados === 1 ? "fila elegida ya no está" : "filas elegidas ya no están"} en esta versión y ${soltados === 1 ? "quedó" : "quedaron"} sin elegir.` : ""));
  }

  const cambiar = async (cot, campos) => {
    setCots(cs => cs.map(c => (c.id === cot.id ? { ...c, ...campos } : c)));
    await guardar(cot.id, campos);
  };
  // DÓNDE VA: toda la cotización a un capítulo, o un renglón a otro; y en qué fila cae un renglón.
  const todoAlCapitulo = (cot, capitulo) => cambiar(cot, { renglones: alCapitulo(cot.renglones, capitulo) });
  const enRenglon = (cot, k, campos) => cambiar(cot, { renglones: (cot.renglones || []).map((r, i) => (i === k ? { ...r, ...campos } : r)) });

  // COMPARAR EN LAS MISMAS CONDICIONES (Hernán, 26/11/2026: «me gustaría tener la
  // opción de borrar rubros para comparar mismas condiciones»). Lo que una
  // empresa cotizó de más se saca de la comparación: deja de contar en su total
  // y en el menor, queda a la vista aparte, y se vuelve a poner. No se borra.
  async function sacarFila(clave) {
    const r = paraSacarLaFila(matriz, clave);
    if (r.porQue) { setNoSePuedeSacar({ clave, porQue: r.porQue }); return; }
    setNoSePuedeSacar(null);
    // Si estaba elegida, deja de estarlo: lo que no se compara no se elige.
    if (vigentes[clave] != null) { const sin = { ...vigentes }; delete sin[clave]; await cambiarElegidos(sin); }
    for (const x of r.renglones) {
      const cot = cots.find(c => String(c.id) === String(x.cotId));
      if (cot) await enRenglon(cot, x.renglon, { fuera: true });
    }
    setPrevia(false);
  }
  const ponerDeNuevo = (cotId, renglon) => { const cot = cots.find(c => String(c.id) === String(cotId)); if (cot) enRenglon(cot, renglon, { fuera: false }); };

  // Antes de abrir el archivo: sin la migración 195 no hay dónde guardar la versión, y NOVA leería para nada.
  function pedirVersion(cot) {
    if (!cot || !("reemplazada_at" in cot)) { setError(SIN_195); return; }
    setError(""); deQuienEsLaVersion.current = cot.id; versionRef.current?.click();
  }

  // QUITAR. Si es una versión nueva, vuelve la anterior: lo que se saca es
  // esta versión, no la empresa. La anterior vuelve con lo que tenía elegido,
  // menos lo que mientras tanto se le dio a otra empresa.
  async function quitar(cot) {
    const anterior = cot.reemplaza_a != null ? cots.find(c => c.id === cot.reemplaza_a) : null;
    let vuelve = null;
    if (anterior) {
      vuelve = { reemplazada_at: null, elegidos: elegidosAlActualizar({
        capitulos, items, otras: cots.filter(c => c.id !== cot.id && c.id !== anterior.id),
        nueva: anterior, elegidosAntes: anterior.elegidos || [],
      }) };
      const err = await actualizarCotizacion(anterior.id, vuelve);
      if (err) { setError(err); return; }
    }
    const err = await borrarCotizacion(cot.id);
    if (err) { setError(err); return; }
    const todas = cots.filter(c => c.id !== cot.id).map(c => (anterior && c.id === anterior.id ? { ...c, ...vuelve } : c));
    setCots(todas); setElegidos(elegidosDe(todas));
    setQuitando(null); if (revisando === cot.id) setRevisando(null);
    if (anterior) setAviso(`Se quitó la versión ${cot.version} de ${cot.proveedor}: volvió a quedar vigente la versión ${anterior.version || 1}.`);
  }

  // LOS RUBROS QUE EL CAPÍTULO YA TENÍA —los que no vinieron de la comparativa—
  // en los capítulos que reciben algo. Quedan todos, salvo los que se tilden.
  const capitulosQueReciben = useMemo(() => [...new Set(plan.rubros.map(x => x.capitulo))], [plan]);
  const loQueYaTenia = useMemo(() => capitulosQueReciben.map(nombre => ({
    capitulo: nombre,
    rubros: (items || []).filter(i => (i.capitulo || "") === nombre && !String(i.comparativa_fila || "").trim()).sort((a, b) => n(a.orden) - n(b.orden)),
  })).filter(c => c.rubros.length), [capitulosQueReciben, items]);
  // El rubro que se empareja con un renglón no se puede tildar para quitar, y al revés.
  const emparejados = new Set(plan.rubros.filter(x => x.emparejado && x.id != null).map(x => String(x.id)));
  const quitarTambien = [...reemplaza].filter(id => !emparejados.has(String(id)) && loQueYaTenia.some(c => c.rubros.some(i => i.id === id)));
  const emparejar = (marca, itemId) => setEnlaces(v => { const a = { ...v }; if (itemId) a[marca] = itemId; else delete a[marca]; return a; });
  const cuantoCambia = plan.porPasar + quitarTambien.length;

  async function aplicar() {
    if (!cuantoCambia || !onAplicar) return;
    setAplicando(true); setError("");
    const err = await onAplicar({ entran: plan.entran, cambian: plan.cambian, quitan: [...plan.quitan.map(q => q.id), ...quitarTambien], sueltan: plan.sueltan.map(q => q.id) });
    if (err) { setAplicando(false); setError(err); return; }
    const ahora = new Date().toISOString();
    const deQuien = new Set([...plan.entran, ...plan.cambian].map(x => x.cotizacion_id));
    for (const id of deQuien) await actualizarCotizacion(id, { aplicada_at: ahora });
    setCots(cs => cs.map(c => (deQuien.has(c.id) ? { ...c, aplicada_at: ahora } : c)));
    setAplicando(false); setPrevia(false); setReemplaza(new Set()); setEnlaces({});
    setAviso(`Listo: el presupuesto quedó con ${plan.rubros.length} ${plan.rubros.length === 1 ? "rubro" : "rubros"} de las cotizaciones elegidas, $${plata(plan.costo)} de costo`
      + (plan.quitan.length + quitarTambien.length ? `, y se quitaron ${plan.quitan.length + quitarTambien.length}` : "")
      + ". Las cotizaciones no elegidas siguen guardadas acá, y podés volver a elegir cuando cambie algo.");
  }

  const caja = { background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: "11px 13px", marginBottom: 10 };
  const empresas = matriz.empresas;
  const elegidaEn = (clave, cotId) => String(vigentes[clave]) === String(cotId);
  // El papel de una cotización, si sigue guardado: uno que ya se soltó del depósito no tiene qué abrir.
  const papelDe = cot => originales.find(a => cot?.archivo_id != null && String(a.id) === String(cot.archivo_id) && !a.soltado_at) || null;
  const enRevision = revisando != null ? cots.find(c => c.id === revisando) : null;
  const susVersiones = enRevision ? versionesDe(enRevision, cots) : [];
  const laVista = susVersiones.find(c => c.id === versionVista) || enRevision;
  const soloLectura = !puedeEditar || (laVista && enRevision && laVista.id !== enRevision.id);
  // Los renglones de la que se mira, como los ve la matriz (con su capítulo y sus filas resueltos).
  const renglonesVistos = laVista && enRevision && laVista.id === enRevision.id
    ? (empresas.find(x => x.id === enRevision.id)?.renglones || [])
    : (laVista ? matrizDeCotizaciones({ capitulos, items, cotizaciones: [{ ...laVista, reemplazada_at: null, reemplaza_a: null }] }).empresas[0]?.renglones || [] : []);
  const abrir = nombre => setAbiertos(v => { const a = new Set(v); if (a.has(nombre)) a.delete(nombre); else a.add(nombre); return a; });
  const tildar = id => setReemplaza(v => { const a = new Set(v); if (a.has(id)) a.delete(id); else a.add(id); return a; });

  // CADA CAPÍTULO TIENE SU MATRIZ, y en ella van solo las empresas que
  // cotizaron ese capítulo —o a las que se les sacó de la comparación lo que
  // habían cotizado ahí, para que se pueda volver a poner—.
  const empresasDe = g => empresas.filter(e => g.sub[e.id] || g.fuera.some(x => String(x.cotId) === String(e.id)));
  const sueltas = empresas.filter(e => !matriz.grupos.some(g => empresasDe(g).some(x => x.id === e.id)));
  // Debajo de qué matriz se abre lo de una empresa: la del capítulo donde se tocó, o la primera donde cotizó.
  const dondeSeAbre = id => {
    if (id == null) return null;
    const esta = g => empresasDe(g).some(e => e.id === id);
    const g = matriz.grupos.find(x => x.capitulo === panelEn && esta(x)) || matriz.grupos.find(esta);
    return g ? g.capitulo : null;
  };

  // LA CABEZA DE UNA EMPRESA EN LA MATRIZ DE UN CAPÍTULO: su nombre, EL TOTAL DE
  // SU OFERTA AHÍ —tocándolo se la elige— y lo que hay para mirar de ella.
  const cabezaDeEmpresa = (e, g) => {
    const cot = cots.find(c => c.id === e.id);
    const cuadre = cuadreDeLaLectura(cot);
    const cambio = e.reemplaza_a != null ? cambiosDeVersion({ matriz, anterior: matrizDeAntes, cotId: e.id, anteriorId: e.reemplaza_a }) : null;
    const papel = papelDe(cot);
    const sinLugar = g.capitulo === SIN_CAPITULO;
    const s = g.sub[e.id];
    const enFilas = g.filas.filter(f => f.celdas[e.id]);
    const todas = enFilas.length > 0 && enFilas.every(f => elegidaEn(f.clave, e.id));
    const afuera = g.fuera.filter(x => String(x.cotId) === String(e.id));
    // Si su papel también trae cosas de otro capítulo, esas se comparan en la matriz de ese capítulo.
    const otros = e.capitulos.filter(c => c !== g.capitulo && c !== SIN_CAPITULO);
    const aca = e.renglones.filter(r => r.capitulo === g.capitulo).length;
    return (
      <th key={e.id} className="columna-de-empresa" data-empresa={e.id} style={{ ...th, width: ANCHO_DE_EMPRESA, borderBottom: g !== NADA && abiertos.has(g.capitulo) ? th.borderBottom : "none" }}>
        {puedeEditar ? (
          <input defaultValue={e.proveedor} key={`n${e.id}-${e.proveedor}`} title="Escribí para cambiarle el nombre"
            onBlur={ev => ev.target.value.trim() !== e.proveedor && cambiar(cot, { proveedor: ev.target.value.trim() })}
            onKeyDown={ev => { if (ev.key === "Enter") ev.target.blur(); }}
            style={{ width: "100%", textAlign: "right", border: "none", background: "transparent", fontFamily: colors.font, fontSize: 12.5, fontWeight: 700, color: colors.ink, outline: "none", padding: 0 }} />
        ) : <div style={{ fontSize: 12.5, fontWeight: 700 }}>{e.proveedor}</div>}
        {/* EL TOTAL DE SU OFERTA EN ESTE CAPÍTULO, arriba: tocándolo se la elige. */}
        {s ? (
          <button className="subtotal-de-capitulo" onClick={() => tocar(e.id, { capitulo: g.capitulo })} disabled={!puedeEditar || sinLugar}
            title={sinLugar ? "Primero decí a qué capítulo va" : todas ? "Soltar a esta empresa en este capítulo" : `Elegir a ${e.proveedor} para ${g.capitulo}`}
            style={{ width: "100%", textAlign: "right", fontFamily: colors.font, cursor: puedeEditar && !sinLugar ? "pointer" : "default", borderRadius: 7, padding: "4px 6px", marginTop: 1,
              border: `1.5px solid ${todas ? colors.brand : "transparent"}`, background: todas ? colors.brandSoft : "transparent", color: colors.ink }}>
            <span className="total-de-la-oferta" style={{ fontSize: 14, fontWeight: 700 }}>{s.estimado ? "≈ " : ""}${plata(s.total)}</span>
            {g.menor === String(e.id) && <span className="menor" style={pastilla(colors.success, colors.successSoft)}>MENOR</span>}
            {todas && <Check size={11} color={colors.brand} style={{ marginLeft: 4, verticalAlign: -1 }} />}
            {todas && <div style={{ ...chico, color: colors.brand, fontWeight: 600 }}>elegida para el capítulo</div>}
            {s.faltan > 0 && <div style={{ ...chico, color: colors.warning }}>no cotizó {s.faltan === 1 ? "1 fila" : `${s.faltan} filas`} que otra sí</div>}
            {s.estimado && <div style={chico}>estimado: su suma también cubre otro capítulo</div>}
            {!todas && puedeEditar && !sinLugar && <div className="elegir-esta" style={{ ...chico, color: colors.brand, fontWeight: 600, textDecoration: "underline" }}>elegir</div>}
          </button>
        ) : (
          <div className="sin-nada-aca" style={{ fontSize: 14, fontWeight: 700, color: colors.muted, marginTop: 1 }}>
            —
            <div style={{ ...chico, fontWeight: 400 }}>{afuera.length ? "todo lo suyo de este capítulo está fuera de la comparación" : "NOVA no le leyó renglones: abrí el papel, o subilo como versión nueva"}</div>
          </div>
        )}
        {/* Cuando lo que se compara acá no es todo su papel, se dice cuánto es todo y por qué difiere. */}
        {(afuera.length > 0 || otros.length > 0) && (
          <div className="fuera-de-la-oferta" style={{ ...chico, fontWeight: 600, color: colors.inkSoft }}>
            toda su cotización ${plata(e.cotizado)}
            {afuera.length > 0 && ` · ${afuera.length} ${afuera.length === 1 ? "renglón afuera" : "renglones afuera"} ($${plata(afuera.reduce((t, x) => t + n(x.total), 0))})`}
            {otros.length > 0 && ` · también cotizó en ${otros.map(c => `«${c}»`).join(" y ")}`}
          </div>
        )}
        <div style={{ ...chico, fontWeight: 400 }}>
          {e.version > 1 && <span className="version" style={{ color: colors.inkSoft, fontWeight: 600 }}>versión {e.version} · </span>}
          {otros.length > 0 ? `${aca} de sus ${e.renglones.length} renglones` : `${e.renglones.length} ${e.renglones.length === 1 ? "renglón: mandó una sola suma" : "renglones"}`}
          {cuadre.cuadra === false && <span style={{ color: colors.warning }}> · su papel dice ${plata(cuadre.escrito)}: revisá si falta un renglón</span>}
        </div>
        {e.sinCapitulo > 0 && <div className="sin-capitulo" style={{ ...chico, fontWeight: 600, color: colors.warning }}>falta decir a qué capítulo va: en «renglones»</div>}
        {cambio && (
          <div className="contra-la-anterior" style={{ ...chico, fontWeight: 400, color: cambio.diferencia > 0 ? colors.danger : cambio.diferencia < 0 ? colors.success : colors.muted }}>
            antes ${plata(cambio.antes)} → ahora ${plata(cambio.ahora)}
            {cambio.diferencia !== 0 && cambio.antes > 0 ? ` (${pct(cambio.diferencia / cambio.antes * 100)})` : ""}
            {cambio.filas.length > 0 && <> · <button className="ver-que-cambio" style={enlace} onClick={() => { setVerCambios(verCambios === e.id ? null : e.id); setPanelEn(g.capitulo); }}>
              {verCambios === e.id ? "cerrar" : `qué cambió (${cambio.filas.length})`}</button></>}
          </div>
        )}
        {e.descuentoOfrecido > 0 && (
          <div style={{ ...chico, fontWeight: 400 }}>
            {e.descuento > 0 ? `con su ${plata(e.descuento)} % de descuento ya restado` : `ofrece ${plata(e.descuentoOfrecido)} % de descuento, sin restar`}
            {puedeEditar && <> · <button style={enlace} onClick={() => cambiar(cot, { totales: { ...(cot.totales || {}), sin_descuento: e.descuento > 0 } })}>
              {e.descuento > 0 ? "no restarlo" : "restarlo"}</button></>}
          </div>
        )}
        {cot?.aplicada_at && <div style={{ ...chico, fontWeight: 400, color: colors.success }}>pasó al presupuesto el {dia(cot.aplicada_at)}</div>}
        <div style={{ marginTop: 3, display: "flex", gap: 9, justifyContent: "flex-end", flexWrap: "wrap" }}>
          {/* EL PAPEL, TAL COMO LLEGÓ: por las condiciones y lo que NOVA no copia. */}
          {papel && <button className="ver-el-papel" style={enlace} title="Abrir la cotización tal como llegó" onClick={() => abrirOriginal(papel)}>ver el papel</button>}
          <button className="revisar-renglones" style={enlace} onClick={() => { setRevisando(revisando === e.id ? null : e.id); setVersionVista(null); setPanelEn(g.capitulo); }}>
            {revisando === e.id ? "cerrar renglones" : "renglones y condiciones"}
          </button>
          {puedeEditar && (
            <button className="nueva-version" style={enlace} disabled={!!leyendo} title="Esta empresa mandó otra cotización: reemplaza a esta, que queda guardada"
              onClick={() => pedirVersion(cot)}>versión nueva</button>
          )}
          {puedeEditar && (quitando === e.id
            ? <><button className="confirmar-quitar" style={{ ...enlace, color: colors.danger }} onClick={() => quitar(cot)}>
              {e.reemplaza_a != null ? "sí, volver a la anterior" : "sí, quitarla"}</button>
              <button style={{ ...enlace, color: colors.muted }} onClick={() => setQuitando(null)}>no</button></>
            : <button className="quitar-cotizacion" style={{ ...enlace, color: colors.muted }}
              title={e.reemplaza_a != null ? "Quitar esta versión: vuelve a quedar la anterior" : "Quitar esta cotización de la comparación"}
              onClick={() => setQuitando(e.id)}>{e.reemplaza_a != null ? "quitar versión" : "quitar"}</button>)}
        </div>
      </th>
    );
  };

  // QUÉ CAMBIÓ CON LA VERSIÓN NUEVA, fila por fila.
  const panelDeCambios = verCambios != null && (() => {
    const e = empresas.find(x => x.id === verCambios);
    if (!e || e.reemplaza_a == null) return null;
    const cambio = cambiosDeVersion({ matriz, anterior: matrizDeAntes, cotId: e.id, anteriorId: e.reemplaza_a });
    return (
      <div className="que-cambio" style={caja}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.ink }}>Qué cambió en la versión {e.version} de {e.proveedor}</div>
          <button onClick={() => setVerCambios(null)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: colors.muted, display: "flex" }}><X size={14} /></button>
        </div>
        {!cambio.filas.length && <div style={{ fontSize: 12, color: colors.inkSoft }}>Los mismos precios que la versión anterior.</div>}
        {cambio.filas.map(c => (
          <div key={c.clave} className="cambio-de-version" style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", padding: "4px 0", borderTop: `1px solid ${colors.neutralSoft}`, fontSize: 12 }}>
            <div style={{ flex: 1, minWidth: 240 }}>{c.descripcion}</div>
            <div style={{ color: c.que === "subio" || c.que === "ya_no" ? colors.danger : c.que === "cantidad" ? colors.warning : colors.success, fontWeight: 600 }}>{QUE_PASO[c.que]}</div>
            <div style={{ minWidth: 190, textAlign: "right", color: colors.inkSoft }}>
              {c.antes != null ? `$${plata(c.antes)}` : "—"} → {c.ahora != null ? `$${plata(c.ahora)}` : "—"}
              {c.antes > 0 && c.ahora != null && c.que !== "cantidad" ? ` (${pct((c.ahora / c.antes - 1) * 100)})` : ""}
              {c.cantidadAhora != null && <div className="otra-cantidad" style={{ ...chico, color: colors.warning }}>ahora cotiza {cant(c.cantidadAhora)}, antes {cant(c.cantidadAntes)}</div>}
            </div>
          </div>
        ))}
      </div>
    );
  })();

  // LO QUE MANDÓ UNA EMPRESA: su papel, sus condiciones y sus renglones,
  // con sus palabras; y dónde va cada uno. Lo propone NOVA y se corrige
  // acá. Las versiones anteriores se pueden mirar, y no se tocan.
  const panelDeRenglones = enRevision && laVista && (
    <div className="renglones-de-la-empresa" style={caja}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
        <ListChecks size={14} color={colors.brand} />
        <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.ink }}>Lo que mandó {enRevision.proveedor}</div>
        {susVersiones.length > 1 && (
          <select className="que-version" value={laVista.id} onChange={ev => setVersionVista(Number(ev.target.value))} style={selector}>
            {susVersiones.map((v, i) => (
              <option key={v.id} value={v.id}>versión {v.version || 1}{i === 0 ? " · la vigente" : ""} · {dia(v.created_at)}</option>
            ))}
          </select>
        )}
        {papelDe(laVista) && (
          <button className="ver-el-papel" onClick={() => abrirOriginal(papelDe(laVista))}
            style={{ ...enlace, fontSize: 11.5, display: "inline-flex", alignItems: "center", gap: 4 }}><FileText size={12} /> abrir el papel original</button>
        )}
        <button onClick={() => setRevisando(null)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: colors.muted, display: "flex" }}><X size={14} /></button>
      </div>
      {/* LAS CONDICIONES, como las copió NOVA. Lo que valga de verdad es el papel. */}
      <div className="condiciones-de-la-oferta" style={{ fontSize: 11.5, color: colors.inkSoft, lineHeight: 1.5, marginBottom: 8, background: colors.bg, borderRadius: 7, padding: "7px 10px", whiteSpace: "pre-line" }}>
        <strong style={{ color: colors.ink }}>Condiciones: </strong>
        {laVista.totales?.condiciones || "NOVA no encontró condiciones escritas. Abrí el papel original para ver validez, forma de pago, plazo y lo que no incluye."}
      </div>
      {laVista.id !== enRevision.id ? (
        <div style={{ ...chico, marginBottom: 8, fontSize: 11 }}>Esta es una versión anterior: queda guardada para consulta y no se compara ni se edita.</div>
      ) : !soloLectura && (
        <div className="todo-al-capitulo" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8, fontSize: 12, color: colors.ink }}>
          Toda la cotización va al capítulo
          <select className="capitulo-de-la-cotizacion" style={selector}
            value={renglonesVistos.length && renglonesVistos.every(r => r.capitulo === renglonesVistos[0].capitulo) ? renglonesVistos[0].capitulo : "__varios"}
            onChange={ev => ev.target.value !== "__varios" && todoAlCapitulo(enRevision, ev.target.value)}>
            <option value="">elegí el capítulo…</option>
            {nombresDeCapitulos.map(c => <option key={c} value={c}>{c}</option>)}
            <option value="__varios" disabled>en varios capítulos</option>
          </select>
          <span style={chico}>si un renglón es de otro capítulo, se cambia en ese renglón</span>
        </div>
      )}
      {renglonesVistos.map(r => {
        const grupo = matriz.grupos.find(g => g.capitulo === r.capitulo);
        const propia = r.vivas?.length === 1 && Object.keys(grupo?.filas.find(f => f.clave === r.vivas[0])?.celdas || {}).length <= 1;
        // Las filas de su capítulo que pusieron otras empresas, y que esta todavía no ocupa.
        const libres = (grupo?.filas || []).filter(f => !f.celdas[enRevision.id] && Object.keys(f.celdas).length > 0);
        const suyas = (r.vivas || []).map(clave => grupo?.filas.find(f => f.clave === clave)).filter(Boolean);
        return (
          <div key={r.k} className="renglon-de-la-cotizacion" style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap", padding: "6px 0", borderTop: `1px solid ${colors.neutralSoft}` }}>
            <div style={{ flex: 1, minWidth: 230, fontSize: 12, color: colors.ink }}>
              {r.descripcion}
              <div style={chico}>{cant(r.cantidad)} {r.unidad || ""} × ${plata(r.precio_unitario)} = ${plata(totalDelRenglon(r))}</div>
            </div>
            <div style={{ flex: 1, minWidth: 260, fontSize: 11.5, display: "grid", gap: 3 }}>
              {soloLectura ? <div style={{ color: colors.inkSoft }}>{r.capitulo || "sin capítulo"}</div> : (
                <select className="capitulo-del-renglon" style={selector} value={r.capitulo} onChange={ev => enRenglon(enRevision, r.k, { capitulo: ev.target.value, filas: [] })}>
                  <option value="">sin capítulo…</option>
                  {nombresDeCapitulos.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
              {/* EN QUÉ FILA CAE: la suya, la misma que otra empresa, o varias si es una suma. */}
              {suyas.length > 1 && <div className="es-una-suma" style={{ color: colors.inkSoft, fontSize: 10.5 }}>es una suma: cubre {suyas.length} filas de lo que detallaron las otras</div>}
              {!propia && suyas.length === 1 && <div style={{ color: colors.inkSoft, fontSize: 10.5 }}>en la misma fila que: {String(suyas[0].descripcion).slice(0, 70)}</div>}
              {propia && <div style={{ color: colors.muted, fontSize: 10.5 }}>en su propia fila: nadie más lo cotizó así</div>}
              {r.fuera && <div className="renglon-fuera" style={{ color: colors.warning, fontSize: 10.5, fontWeight: 600 }}>fuera de la comparación: no cuenta en su total</div>}
              {!soloLectura && (
                <button className={r.fuera ? "poner-renglon" : "sacar-renglon"} style={{ ...enlace, color: r.fuera ? colors.brand : colors.muted, textAlign: "left" }}
                  onClick={() => enRenglon(enRevision, r.k, { fuera: !r.fuera })}>
                  {r.fuera ? "volver a ponerlo en la comparación" : "sacarlo de la comparación"}
                </button>
              )}
              {!soloLectura && !r.fuera && r.capitulo && libres.length > 0 && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <select className="misma-fila-que" style={{ ...selector, color: colors.brand }} value=""
                    onChange={ev => ev.target.value && enRenglon(enRevision, r.k, { filas: propia ? [ev.target.value] : [...(r.vivas || []), ev.target.value] })}>
                    <option value="">{propia ? "es lo mismo que…" : "+ también cubre…"}</option>
                    {libres.map(f => <option key={f.clave} value={f.clave}>{String(f.descripcion).slice(0, 80)}</option>)}
                  </select>
                  <button className="cubre-todo" style={enlace} title="Es una sola suma de todo lo que las otras detallaron en este capítulo"
                    onClick={() => enRenglon(enRevision, r.k, { filas: [...(propia ? [] : (r.vivas || [])), ...libres.map(f => f.clave)] })}>
                    es la suma de todo lo que detallaron las otras ({libres.length})
                  </button>
                </div>
              )}
              {!soloLectura && !propia && !r.fuera && <button className="a-su-propia-fila" style={{ ...enlace, color: colors.muted, textAlign: "left" }} onClick={() => enRenglon(enRevision, r.k, { filas: [] })}>ponerlo en su propia fila</button>}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="matriz-cotizaciones" style={{ fontFamily: colors.font }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
        <button onClick={onCerrar} style={{ ...enlace, fontSize: 12, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
          <ArrowLeft size={13} /> Volver al presupuesto
        </button>
        <div style={{ fontSize: 14, fontWeight: 700, color: colors.ink }}>Comparar cotizaciones · {presupuesto?.nombre}</div>
        <span className="estado-de-guardado" style={{ marginLeft: "auto", fontSize: 11, color: estado === "guardado" ? colors.success : colors.muted }}>
          {estado === "guardando" ? "Guardando…" : estado === "guardado" ? "✓ Guardado" : ""}
        </span>
      </div>
      <div style={{ fontSize: 11.5, color: colors.inkSoft, lineHeight: 1.55, marginBottom: 10, maxWidth: 900 }}>
        Subí las cotizaciones de cada empresa: quedan guardadas acá y <strong>no entran al presupuesto</strong> hasta que elijas.{" "}
        <strong>Cada capítulo tiene su matriz</strong>, con las empresas que lo cotizaron: arriba, el total de cada oferta; desplegala para ver el itemizado,
        fila por fila. Para mandar una al presupuesto: tocá <strong>«elegir»</strong> bajo su total en el capítulo y después <strong>«Pasar lo elegido al presupuesto»</strong>,
        debajo de las matrices: sus rubros entran al capítulo.
      </div>

      {puedeEditar && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
          <button onClick={() => archivoRef.current?.click()} disabled={!!leyendo}
            style={{ background: colors.brand, border: "none", borderRadius: 8, padding: "7px 12px", color: "#fff", fontSize: 12, fontWeight: 600,
              cursor: leyendo ? "default" : "pointer", fontFamily: colors.font, display: "inline-flex", alignItems: "center", gap: 6, opacity: leyendo ? 0.6 : 1 }}>
            <Upload size={13} /> Subir cotización de otra empresa
          </button>
          <input ref={archivoRef} className="subir-cotizacion" type="file" multiple accept="image/*,.pdf,.xlsx,.xls,.csv" onChange={subir} style={{ display: "none" }} />
          <input ref={versionRef} className="subir-version" type="file" accept="image/*,.pdf,.xlsx,.xls,.csv" onChange={subirVersion} style={{ display: "none" }} />
          {leyendo && <span style={{ fontSize: 12, color: colors.brand }}>NOVA está leyendo {leyendo}…</span>}
        </div>
      )}
      {error && <div className="error-de-la-matriz" role="alert" style={{ ...caja, borderLeft: `3px solid ${colors.danger}`, color: colors.danger, fontSize: 12 }}>{error}</div>}
      {aviso && <div className="aviso-de-la-matriz" style={{ ...caja, borderLeft: `3px solid ${colors.success}`, color: colors.inkSoft, fontSize: 12, lineHeight: 1.5 }}>{aviso}</div>}

      {!cargando && !empresas.length && !error && (
        <div style={{ ...caja, textAlign: "center", padding: "26px 16px", color: colors.inkSoft, fontSize: 12.5 }}>
          Todavía no hay cotizaciones para comparar en este presupuesto. Subí la primera: PDF, foto o Excel.
        </div>
      )}

      {/* UNA MATRIZ POR CAPÍTULO, con las empresas que cotizaron ESE capítulo y
          ninguna más. Hernán, 26/11/2026, con las tres de ventanas y la de la
          parrilla en una sola tabla: «la matriz está confusa... FOGA es otro
          capítulo, igual está arriba junto a las otras... esto puede
          confundir... es decir cada capítulo tiene su matriz». Arriba, el total
          de cada oferta en ese capítulo —tocándolo se la elige—; al
          desplegarla, el itemizado. */}
      {matriz.grupos.map(g => {
        const sinLugar = g.capitulo === SIN_CAPITULO;
        const abierto = abiertos.has(g.capitulo);
        const suyas = empresasDe(g);
        const raya = abierto ? th.borderBottom : "none";
        return (
          <Fragment key={`m${g.capitulo}`}>
            <div className="matriz-del-capitulo" data-capitulo={g.capitulo} style={{ ...caja, padding: 0, overflowX: "auto" }}>
              <table className="la-matriz" style={{ borderCollapse: "collapse", width: "100%", color: colors.ink }}>
                <thead>
                  <tr className="fila-de-capitulo" data-capitulo={g.capitulo} style={{ background: colors.bg }}>
                    <th style={{ ...th, textAlign: "left", minWidth: 240, borderBottom: raya }}>
                      <button className="desplegar-capitulo" aria-expanded={abierto} onClick={() => abrir(g.capitulo)}
                        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: colors.font, fontSize: 13, fontWeight: 700, color: sinLugar ? colors.warning : colors.ink, textAlign: "left" }}>
                        <span style={{ color: colors.muted, marginRight: 5 }}>{abierto ? "▾" : "▸"}</span>
                        {sinLugar ? "Sin capítulo todavía" : `${g.numero ? `${g.numero} · ` : ""}${g.capitulo}`}
                      </button>
                      <div style={{ ...chico, fontWeight: 400 }}>
                        {sinLugar ? "decí a qué capítulo va, en «renglones y condiciones» de la empresa"
                          : `${suyas.length} ${suyas.length === 1 ? "empresa" : "empresas"} · ${g.filas.length} ${g.filas.length === 1 ? "fila cotizada" : "filas cotizadas"}${g.fuera.length ? ` · ${g.fuera.length} fuera de la comparación` : ""} · ${abierto ? "tocá para cerrar el itemizado" : "tocá para ver el itemizado"}`}
                      </div>
                    </th>
                    <th className="presupuesto-del-capitulo" style={{ ...th, minWidth: 118, width: ANCHO_DEL_PRESUPUESTO, color: colors.inkSoft, borderBottom: raya }}>
                      <div style={{ ...chico, fontWeight: 400 }}>Tu presupuesto hoy</div>
                      {sinLugar ? "—" : `$${plata(g.referencia.total)}`}
                      {!sinLugar && <div style={{ ...chico, fontWeight: 400 }}>{g.referencia.rubros} {g.referencia.rubros === 1 ? "rubro" : "rubros"} en el capítulo</div>}
                    </th>
                    {suyas.map(e => cabezaDeEmpresa(e, g))}
                  </tr>
                </thead>
                {abierto && (
                  <tbody>
                    {g.filas.map(f => (
                      <tr key={f.clave} className="fila-cotizada" data-fila={f.clave}>
                        <td style={{ ...td, textAlign: "left", paddingLeft: 24 }}>
                          {f.descripcion}
                          <div style={chico}>
                            {cant(f.cantidad)} {f.unidad}
                            {puedeEditar && !sinLugar && <> · <button className="sacar-fila" style={{ ...enlace, color: colors.muted }}
                              title="No todas la cotizaron, o no va en este pedido: deja de contar en los totales, y se puede volver a poner"
                              onClick={() => sacarFila(f.clave)}>sacar de la comparación</button></>}
                          </div>
                          {noSePuedeSacar?.clave === f.clave && <div className="no-se-puede-sacar" style={{ ...chico, color: colors.warning }}>No se puede sacar: {noSePuedeSacar.porQue}</div>}
                        </td>
                        <td className="presupuesto-de-la-fila" style={{ ...td, color: colors.inkSoft }}>
                          {!f.referencia ? <span style={{ color: colors.muted }}>—</span>
                            : f.referencia.paquete ? <span style={chico}>en la suma de {f.referencia.deQuien}</span>
                              : <>${plata(f.referencia.total)}<div style={chico}>de {f.referencia.deQuien}</div></>}
                        </td>
                        {suyas.map(e => {
                          const x = f.celdas[e.id];
                          if (!x) return <td key={e.id} style={{ ...td, color: g.sub[e.id] ? colors.warning : colors.muted, fontSize: 11 }}>{g.sub[e.id] ? "no cotizó" : "—"}</td>;
                          const elegida = elegidaEn(f.clave, e.id);
                          const antes = e.reemplaza_a != null ? matrizDeAntes.celdaDe(f.clave, e.reemplaza_a) : null;
                          const eraOtro = antes && x.tipo === "rubro" && antes.tipo === "rubro" && Math.abs(antes.unitario - x.unitario) > 0.00005;
                          return (
                            <td key={e.id} style={{ ...td, padding: 3 }}>
                              <button className="celda-cotizada" onClick={() => tocar(e.id, { fila: f.clave })} disabled={!puedeEditar || sinLugar}
                                title={x.tipo === "paquete" ? `Es parte de su suma «${x.descripcion}»: se elige o se suelta entera` : elegida ? "Soltar esta fila" : `Elegir a ${e.proveedor} para esta fila`}
                                style={{ width: "100%", textAlign: "right", fontFamily: colors.font, cursor: puedeEditar && !sinLugar ? "pointer" : "default", borderRadius: 7, padding: "4px 6px",
                                  border: `1.5px solid ${elegida ? colors.brand : "transparent"}`, background: elegida ? colors.brandSoft : "transparent", color: colors.ink }}>
                                {x.tipo === "rubro" ? (
                                  <>
                                    <span style={{ fontSize: 12, fontWeight: 600 }}>${plata(x.total)}</span>
                                    {f.menor === String(e.id) && <span className="menor" style={pastilla(colors.success, colors.successSoft)}>MENOR</span>}
                                    {elegida && <Check size={11} color={colors.brand} style={{ marginLeft: 4, verticalAlign: -1 }} />}
                                    <div style={chico}>{cant(x.cantidad)} {x.unidad} × ${plata(x.unitario)}{x.otraCantidad ? " · otra cantidad" : ""}</div>
                                    {eraOtro && <div className="antes" style={{ ...chico, color: x.unitario > antes.unitario ? colors.danger : colors.success }}>antes ${plata(antes.unitario)}</div>}
                                  </>
                                ) : (
                                  <>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: colors.inkSoft }}>≈ ${plata(x.parte)}</span>
                                    {elegida && <Check size={11} color={colors.brand} style={{ marginLeft: 4, verticalAlign: -1 }} />}
                                    <div className="de-su-suma" style={chico}>de su suma, ${plata(x.totalDelPaquete)}</div>
                                  </>
                                )}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {/* LO QUE SE SACÓ DE LA COMPARACIÓN: no cuenta, pero se ve, y se vuelve a poner. */}
                    {g.fuera.map(x => (
                      <tr key={`fuera-${x.cotId}-${x.renglon}`} className="fila-fuera" style={{ background: colors.bg }}>
                        <td style={{ ...td, textAlign: "left", paddingLeft: 24, color: colors.muted }}>
                          <span style={{ textDecoration: "line-through" }}>{x.descripcion}</span>
                          <div style={chico}>
                            fuera de la comparación
                            {puedeEditar && <> · <button className="volver-a-poner" style={enlace} onClick={() => ponerDeNuevo(x.cotId, x.renglon)}>volver a ponerla</button></>}
                          </div>
                        </td>
                        <td style={td} />
                        {suyas.map(e => (
                          <td key={e.id} style={{ ...td, color: colors.muted }}>
                            {String(e.id) === String(x.cotId) ? <span style={{ textDecoration: "line-through" }}>${plata(x.total)}</span> : ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                )}
              </table>
            </div>
            {/* Lo de una empresa se abre debajo de la matriz donde se tocó, no al fondo de la pantalla. */}
            {dondeSeAbre(verCambios) === g.capitulo && panelDeCambios}
            {enRevision && dondeSeAbre(enRevision.id) === g.capitulo && panelDeRenglones}
          </Fragment>
        );
      })}
      {/* La empresa de la que no quedó nada en ninguna matriz —NOVA no le leyó
          renglones—: que igual se la pueda abrir, corregir o quitar. */}
      {sueltas.length > 0 && (
        <div className="matriz-del-capitulo sin-renglones" style={{ ...caja, padding: 0, overflowX: "auto" }}>
          <table className="la-matriz" style={{ borderCollapse: "collapse", width: "100%", color: colors.ink }}>
            <thead>
              <tr style={{ background: colors.bg }}>
                <th style={{ ...th, textAlign: "left", minWidth: 240, borderBottom: "none", color: colors.warning, fontSize: 13 }}>Sin nada que comparar</th>
                <th style={{ ...th, minWidth: 118, width: ANCHO_DEL_PRESUPUESTO, borderBottom: "none" }} />
                {sueltas.map(e => cabezaDeEmpresa(e, NADA))}
              </tr>
            </thead>
          </table>
        </div>
      )}
      {verCambios != null && dondeSeAbre(verCambios) == null && panelDeCambios}
      {enRevision && dondeSeAbre(enRevision.id) == null && panelDeRenglones}

      {/* LO ELEGIDO, Y PASARLO AL PRESUPUESTO. Es lo único que se confirma.
          Va PEGADO DEBAJO DE LA TABLA: Hernán, 26/11/2026, con cuatro
          cotizaciones subidas y ninguna elegida: «¿de dónde envío una de las
          cotizaciones al presupuesto???». Estaba al fondo, después de los
          renglones de la empresa, y elegir era tocar un total que no parecía
          un botón. */}
      {empresas.length > 0 && (
        <div className="lo-elegido" style={{ ...caja, borderLeft: `3px solid ${colors.brand}`, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 240, fontSize: 12.5, color: colors.ink }}>
            {plan.rubros.length
              ? <>Elegido: <strong>{plan.rubros.length} {plan.rubros.length === 1 ? "rubro" : "rubros"}</strong> de {[...new Set(plan.rubros.map(x => x.proveedor))].join(" y ")} · ${plata(plan.costo)} de costo
                <div className="que-falta-pasar" style={{ fontSize: 11.5, color: plan.porPasar ? colors.warning : colors.success, marginTop: 2 }}>
                  {plan.porPasar === 0 ? "Todo lo elegido ya está así en el presupuesto."
                    : [plan.entran.length ? `${plan.entran.length} ${plan.entran.length === 1 ? "entra" : "entran"} al presupuesto` : "",
                      plan.cambian.length ? `${plan.cambian.length} ${plan.cambian.length === 1 ? "cambia" : "cambian"}` : "",
                      plan.quitan.length ? `${plan.quitan.length} ${plan.quitan.length === 1 ? "se quita" : "se quitan"}` : "",
                      plan.sueltan.length ? `${plan.sueltan.length} ${plan.sueltan.length === 1 ? "queda sin cotización" : "quedan sin cotización"}` : "",
                      plan.yaEstan ? `${plan.yaEstan} ya ${plan.yaEstan === 1 ? "está" : "están"}` : ""].filter(Boolean).join(" · ") + "."}
                </div></>
              : plan.quitan.length
                ? <span className="que-falta-pasar" style={{ color: colors.warning }}>No hay nada elegido, y el presupuesto todavía tiene {plan.quitan.length} {plan.quitan.length === 1 ? "rubro que salió" : "rubros que salieron"} de esta comparativa.</span>
                : <span className="como-se-pasa" style={{ color: colors.inkSoft }}><strong>Para mandar una cotización al presupuesto:</strong> tocá «elegir» bajo el total de la empresa en su capítulo. Después se pasa desde acá.</span>}
          </div>
          {puedeEditar && plan.porPasar > 0 && !previa && (
            <button className="ver-lo-que-entra" onClick={() => setPrevia(true)}
              style={{ background: colors.brand, border: "none", borderRadius: 8, padding: "7px 12px", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: colors.font }}>
              Pasar lo elegido al presupuesto…
            </button>
          )}
        </div>
      )}

      {previa && plan.porPasar > 0 && (
        <div className="lo-que-entra" style={{ ...caja, borderLeft: `3px solid ${colors.brand}` }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.ink, marginBottom: 4 }}>Esto es lo que cambia en el presupuesto</div>
          <div style={{ fontSize: 11.5, color: colors.inkSoft, lineHeight: 1.5, marginBottom: 8 }}>
            Los rubros de la proforma elegida entran a su capítulo, con las palabras, la cantidad y el precio de la empresa como <strong>costo</strong>.
            La utilidad se la ponés después en el presupuesto, como a cualquier rubro.
          </div>
          {capitulosQueReciben.map(nombre => {
            const suyos = plan.rubros.filter(x => x.capitulo === nombre && !x.yaEsta);
            if (!suyos.length) return null;
            return (
              <div key={nombre} className="entra-al-capitulo" data-capitulo={nombre} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: colors.ink }}>{nombre} · ${plata(suyos.reduce((t, x) => t + x.costo, 0))}</div>
                {suyos.map(x => (
                  <div key={x.marca} className="rubro-que-entra" data-que={x.id == null ? "entra" : "cambia"} style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", padding: "4px 0", borderTop: `1px solid ${colors.neutralSoft}`, fontSize: 12 }}>
                    <div style={{ flex: 1, minWidth: 240 }}>
                      {x.descripcion}
                      <div style={chico}>
                        {x.proveedor}{x.repartido ? " · es su suma de varias filas: entra como un solo rubro" : ""}
                        {x.id == null ? " · rubro nuevo" : x.emparejado && !x.proveedorAntes ? " · se empareja con ese rubro, que conserva sus palabras"
                          : ` · ya estaba${x.proveedorAntes && x.proveedorAntes !== x.proveedor ? `, de ${x.proveedorAntes}` : ""}: se actualiza`}
                      </div>
                      {/* O SE EMPAREJA CON UN RUBRO QUE YA ESTÁ, en vez de entrar como nuevo. */}
                      {(x.id == null || enlaces[x.marca] != null) && (loQueYaTenia.find(c => c.capitulo === nombre)?.rubros.length > 0) && (
                        <select className="emparejar-con-rubro" style={{ ...selector, marginTop: 2, color: colors.brand }} value={enlaces[x.marca] != null ? String(enlaces[x.marca]) : ""}
                          onChange={ev => emparejar(x.marca, ev.target.value ? (loQueYaTenia.find(c => c.capitulo === nombre).rubros.find(i => String(i.id) === ev.target.value)?.id ?? null) : null)}>
                          <option value="">entra como rubro nuevo</option>
                          {loQueYaTenia.find(c => c.capitulo === nombre).rubros
                            .filter(i => String(enlaces[x.marca]) === String(i.id) || (!emparejados.has(String(i.id)) && !reemplaza.has(i.id)))
                            .map(i => <option key={i.id} value={i.id}>es este rubro: {String(i.descripcion).slice(0, 70)}</option>)}
                        </select>
                      )}
                    </div>
                    <div style={{ textAlign: "right", color: colors.inkSoft }}>{cant(x.cantidad)} {x.unidad} × ${plata(x.precio_base)}</div>
                    <div style={{ textAlign: "right", minWidth: 96, fontWeight: 700 }}>${plata(x.costo)}
                      {x.costoAntes != null && <div style={{ ...chico, fontWeight: 400 }}>antes ${plata(x.costoAntes)}</div>}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
          {plan.quitan.length > 0 && (
            <div className="se-quitan" style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: colors.danger }}>Se quitan del presupuesto: salieron de esta comparativa y ya no están elegidos</div>
              {plan.quitan.map(q => (
                <div key={q.id} className="rubro-que-se-quita" style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "3px 0", borderTop: `1px solid ${colors.neutralSoft}`, fontSize: 12 }}>
                  <div style={{ flex: 1 }}>{q.descripcion}<div style={chico}>{q.capitulo}{q.proveedor ? ` · de ${q.proveedor}` : ""}</div></div>
                  <div style={{ color: colors.inkSoft }}>${plata(q.total)}</div>
                </div>
              ))}
            </div>
          )}
          {plan.sueltan.length > 0 && (
            <div className="se-desenganchan" style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: colors.warning }}>Quedan en el presupuesto, ya sin cotización elegida</div>
              {plan.sueltan.map(q => (
                <div key={q.id} style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "3px 0", borderTop: `1px solid ${colors.neutralSoft}`, fontSize: 12 }}>
                  <div style={{ flex: 1 }}>{q.descripcion}<div style={chico}>{q.capitulo}{q.proveedor ? ` · tenía el costo de ${q.proveedor}: revisalo` : ""}</div></div>
                  <div style={{ color: colors.inkSoft }}>${plata(q.total)}</div>
                </div>
              ))}
            </div>
          )}
          {/* LO QUE EL CAPÍTULO YA TENÍA. Queda todo, salvo lo que se tilde:
              qué reemplaza la cotización lo sabe quien arma el presupuesto. */}
          {loQueYaTenia.map(c => (
            <div key={c.capitulo} className="lo-que-ya-tenia" data-capitulo={c.capitulo} style={{ marginBottom: 8, background: colors.bg, borderRadius: 8, padding: "8px 10px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: colors.ink }}>
                «{c.capitulo}» ya tenía {c.rubros.length} {c.rubros.length === 1 ? "rubro" : "rubros"}: ¿cuáles reemplaza esta cotización?
              </div>
              <div style={{ ...chico, fontSize: 11, marginBottom: 4 }}>
                Los que tildes se quitan del presupuesto. Los demás quedan como están.{" "}
                <button className="tildar-todos" style={enlace} onClick={() => setReemplaza(v => new Set([...v, ...c.rubros.map(i => i.id)]))}>tildar todos</button>
                {" · "}
                <button style={enlace} onClick={() => setReemplaza(v => new Set([...v].filter(id => !c.rubros.some(i => i.id === id))))}>ninguno</button>
              </div>
              <div style={{ maxHeight: 220, overflowY: "auto" }}>
                {c.rubros.map(i => (
                  <label key={i.id} className="rubro-que-ya-estaba" style={{ display: "flex", gap: 7, alignItems: "baseline", fontSize: 11.5, color: colors.ink, padding: "2px 0", cursor: "pointer" }}>
                    <input type="checkbox" disabled={emparejados.has(String(i.id))} checked={reemplaza.has(i.id) && !emparejados.has(String(i.id))} onChange={() => tildar(i.id)} />
                    <span style={{ flex: 1 }}>{i.descripcion}{emparejados.has(String(i.id)) ? <span style={{ color: colors.brand }}> · emparejado: queda, con el costo de la cotización</span> : null}</span>
                    <span style={{ color: colors.inkSoft, whiteSpace: "nowrap" }}>${plata(i.total)}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
            <button className="confirmar-pasar" onClick={aplicar} disabled={aplicando}
              style={{ background: colors.brand, border: "none", borderRadius: 8, padding: "7px 12px", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: colors.font, opacity: aplicando ? 0.6 : 1 }}>
              {aplicando ? "Pasando…" : `Confirmar: ${[plan.entran.length ? `entran ${plan.entran.length}` : "", plan.cambian.length ? `cambian ${plan.cambian.length}` : "",
                plan.quitan.length + quitarTambien.length ? `se quitan ${plan.quitan.length + quitarTambien.length}` : "",
                plan.sueltan.length ? `se desenganchan ${plan.sueltan.length}` : ""].filter(Boolean).join(", ")}`}
            </button>
            <button onClick={() => setPrevia(false)} disabled={aplicando} style={{ ...enlace, fontSize: 12, color: colors.muted }}>todavía no</button>
          </div>
        </div>
      )}

      {/* COMPARTIRLO CON EL DUEÑO DEL PROYECTO: ve el presupuesto con lo elegido
          y la comparativa, y lo aprueba. Va acá porque es donde se elige. */}
      {empresas.length > 0 && (
        <CompartirConElCliente presupuesto={presupuesto} capitulos={capitulos} items={items} cotizaciones={cots} elegidos={vigentes}
          currentUser={currentUser} puedeEditar={puedeEditar} />
      )}
    </div>
  );
}
