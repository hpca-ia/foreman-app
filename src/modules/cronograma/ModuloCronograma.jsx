import { useEffect, useState, useCallback, lazy, Suspense } from "react";
import { Plus, Trash2, ChevronLeft, ChevronDown, GanttChartSquare, AlertTriangle, Sparkles, CalendarClock } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import Numero from "../../components/ui/Numero";
import { calendario, calcular, aFecha, claveFecha, ETAPAS, ajustarAlPlazo } from "./cpm";
import { materiaPrima, aprenderDelCronograma, acomodarCambios,
  revisarCronograma, ordenarConPalabras, aprenderDeUnaDuracion, proponerEtapas } from "./novaCronograma";
import { proponerPlan, guardarPlan, guardarOrden, leerCronogramaEscrito,
  ponerTiemposYOrden, aplicarTiemposYOrden, recalcularPorOrdenes } from "./armarCronograma";
import { leerMemoria, olvidar } from "./memoriaNova";
import { apunteDe, apunteEnUnaLinea } from "./apuntes";
import { magnitudDe } from "./magnitudes";
import { fasesDe, crearFase, renombrarFase, borrarFase, moverFase, asignarFase, SIN_101 } from "./fases";
import { ordenesPendientes, lineasDe, marcarAplicada } from "./ordenesEnCronograma";
import { guardarVersion, versionesDe, fotoDeVersion, borrarVersion } from "./versiones";
import { comparar } from "./compararVersion";
import { bajarProject } from "./exportarProject";
import TablaGantt from "./TablaGantt";
// El valorado baja aparte: es una matriz con su gráfico y pesa.
const PanelValorado = lazy(() => import("./PanelValorado"));
import PartirEnEtapas from "./PartirEnEtapas";
import { guardarPlazo, desfase, diasDelPlazo, mesesEntre, finDeMeses, diasHastaFin } from "./plazo";
import { plataDelPlan } from "./plataDelPlan";
import { fmt } from "../controlObra/calculos";

// El cronograma de la obra. Módulo propio, y a propósito.
//
// Control de Obra habla de plata —rubro, planilla, factura— y lo abren la
// administración y la dirección. Esto habla de tiempo —actividad, duración,
// holgura— y lo abren el residente y el cliente. Son dos idiomas, y juntarlos
// en una pantalla obliga a traducir entre ellos para hacer cualquiera de las
// dos cosas. Lo que pasa cuando se mezclan es que la gente deja de usar la
// mitad que no entiende.
//
// Están atados por un puente explícito y en un solo sentido: una actividad
// puede colgar de una agrupación del presupuesto, y de ahí sale su plata.
//
// LA RUTA CRÍTICA SE MARCA, NO SE EXPLICA. Las barras rojas son las que no
// tienen colchón: un día de atraso ahí es un día de atraso en la entrega. Lo
// demás puede correrse sin que pase nada, y saber cuál es cuál es la mitad de
// para qué sirve un cronograma.

const hoy = () => new Date().toISOString().split("T")[0];
const dia = f => (f ? aFecha(f).toLocaleDateString("es-EC", { day: "numeric", month: "short" }) : "—");

/**
 * Qué días se trabaja. Tres opciones y no siete casillas: nadie contrata una
 * obra que trabaje martes y jueves, y siete casillas invitan a armar
 * calendarios que después ningún subcontratista cumple.
 */
const JORNADAS = [
  { id: "lv", label: "Lun a vie", dias: [1, 2, 3, 4, 5], pista: "Sin sábados: obra en edificio ocupado, oficina, interiores" },
  { id: "ls", label: "Lun a sáb", dias: [1, 2, 3, 4, 5, 6], pista: "Lo normal en obra acá" },
  { id: "todos", label: "Todos", dias: [0, 1, 2, 3, 4, 5, 6], pista: "Obra a tres turnos o con plazo contra reloj" },
];

export default function ModuloCronograma({ currentUser, puede, nivelProyecto }) {
  const [proyectos, setProyectos] = useState([]);
  const [lead, setLead] = useState(null);
  const [actividades, setActividades] = useState([]);
  const [dependencias, setDependencias] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [sinTablas, setSinTablas] = useState(false);
  const [nueva, setNueva] = useState(null);
  const [error, setError] = useState("");
  const [uniendo, setUniendo] = useState(null);
  const [armando, setArmando] = useState(null);
  const [pensando, setPensando] = useState(false);
  // La escala de arriba: en fechas o en días de obra. Las dos sirven para
  // cosas distintas —"el 14 de marzo" se coordina con el cliente, "el día 62"
  // se discute con el contrato— y cuál hace falta cambia según con quién se
  // esté hablando.
  const [escala, setEscala] = useState("fecha");
  // Las dos vistas del mismo plan. Viven juntas porque son lo mismo contado
  // de dos maneras —en tiempo y en plata— y las dos salen de las agrupaciones
  // del control de obra. Tenerlas en módulos distintos era pedir que se
  // separen, y una de las dos quedara vieja sin que nadie se entere.
  const [vista, setVista] = useState("barras");
  // Cuántos píxeles mide un día. Un cronograma no se mira entero: se mira el
  // mes que viene, de cerca. Apretarlo para que entre en la pantalla es lo que
  // lo volvía ilegible —ocho meses en 300 píxeles son barras de dos milímetros
  // pegadas unas a otras— y es por lo que un Gantt de verdad corre para el
  // costado. Acá se elige el acercamiento y la pantalla se desplaza.
  const [zoom, setZoom] = useState(14);
  // Las agrupaciones de hoy, para saber si el cronograma quedó viejo.
  const [agrupaciones, setAgrupaciones] = useState([]);
  // LO QUE LA OFICINA YA MIDIÓ. Se trae para dos cosas: marcar en la tabla
  // cuáles duraciones ya están respaldadas por una obra real —y entonces no
  // hay que volver a pensarlas— y poder mirar y borrar los apuntes, que es lo
  // único que vuelve confiable a una memoria.
  const [memoria, setMemoria] = useState([]);
  const [verMemoria, setVerMemoria] = useState(false);
  // LAS ETAPAS DE LA OBRA: demoliciones, obra gris, instalaciones, acabados.
  // No mandan sobre las fechas —eso lo dicen las dependencias— sino sobre cómo
  // se lee el cronograma, que con cuarenta barras es la mitad del problema.
  const [fases, setFases] = useState([]);
  // Las órdenes de cambio aprobadas que el cronograma todavía no tomó.
  const [ordenes, setOrdenes] = useState([]);
  const [etapaNueva, setEtapaNueva] = useState("");
  const [motivoVersion, setMotivoVersion] = useState("");
  // En qué etapa se está agregando una actividad, y cómo se llama.
  const [enEtapa, setEnEtapa] = useState(null);   // { id, hito }
  const [actNueva, setActNueva] = useState("");
  // Lo último que pasó, dicho en una línea verde. No es un error: es la
  // diferencia entre "guardó" y "no sé si guardó".
  const [aviso, setAviso] = useState("");
  // Cuánta plata tiene cada agrupación, para decir cuánto sale cada mes.
  const [plata, setPlata] = useState({});
  // Los rubros de la obra, para poder señalar cuál es el que está trabando a
  // su grupo.
  const [rubros, setRubros] = useState([]);
  const [sinSenalar, setSinSenalar] = useState(false);
  // La actividad que se está partiendo en etapas, si hay alguna.
  const [partiendo, setPartiendo] = useState(null);
  // Lo que NOVA propone mejorar sobre el cronograma que ya hay. Se acepta de a
  // una: un parche entero aceptado a ciegas es volver a rehacerlo.
  const [revision, setRevision] = useState(null);
  // Lo que se le dicta a NOVA sobre cómo va esta obra.
  const [dictado, setDictado] = useState("");
  // Las fotos guardadas del cronograma, por fecha. Comparar contra una es la
  // única forma de contestar "cuánto nos corrimos" con un número en vez de con
  // una impresión.
  const [versiones, setVersiones] = useState([]);
  const [comparando, setComparando] = useState(null);

  useEffect(() => {
    let vivo = true;
    if (lead?.id) versionesDe(lead.id).then(v => { if (vivo) setVersiones(v); }).catch(() => {});
    return () => { vivo = false; };
  }, [lead?.id]);
  // El menú de lo que se hace de vez en cuando: bajarlo para Project,
  // reordenarlo, borrarlo. Afuera queda lo que uno viene a hacer.
  const [menu, setMenu] = useState(false);
  // La 082 todavía no corrió en esta base.
  const [sinPlazo, setSinPlazo] = useState(false);

  useEffect(() => {
    // El plazo en meses lo agrega la 082. Pedirlo junto con todo lo demás hace
    // que la consulta ENTERA falle si no corrió, y entonces la pantalla queda
    // vacía como si el usuario no tuviera proyectos. Eso es una mentira, y
    // manda a buscar el problema al lugar equivocado: lo que falta es una
    // migración, no los proyectos. Se pide, y si no está se sigue sin él.
    // Mismo cuidado con la 091 —fecha de terminación y días de trabajo—: se
    // piden, y si no están se sigue con lo que haya en vez de dejar la
    // pantalla vacía. Tres escalones, del más completo al mínimo.
    const base = "id,nombre,tunel,resultado,obra_id,crono_inicio,es_lead";
    (async () => {
      let { data, error } = await supabase.from("leads")
        .select(`${base},crono_meses,crono_fin,crono_laborables`).order("nombre");
      if (error && /crono_fin|crono_laborables/.test(error.message)) {
        ({ data, error } = await supabase.from("leads").select(`${base},crono_meses`).order("nombre"));
      }
      if (error) {
        setSinPlazo(/crono_meses/.test(error.message));
        ({ data } = await supabase.from("leads").select(base).order("nombre"));
      }
      // Todo lo que no se perdió, en curso o no.
      //
      // Un cronograma no es solo de una obra en marcha: el presupuesto se
      // entrega CON un cronograma, y ese se arma antes de que el proyecto sea
      // proyecto. Filtrar por "ganado" dejaba vacía la pantalla justamente
      // cuando más se la necesita — cuando hay que mostrarle al cliente en
      // cuánto tiempo se le hace la obra.
      setProyectos((data || []).filter(l => l.resultado !== "perdido"));
      setCargando(false);
    })();
  }, []);

  const cargar = useCallback(async () => {
    if (!lead?.id) return;
    const { data: act, error: e } = await supabase.from("cronograma_actividades")
      .select("*").eq("lead_id", lead.id).order("orden");
    if (e) { setSinTablas(/relation|does not exist|schema cache/i.test(e.message)); return; }
    setActividades(act || []);
    if (lead.obra_id) {
      const { data: ags } = await supabase.from("obra_actividades")
        .select("id,nombre,codigo,orden,extra").eq("obra_id", lead.obra_id).order("orden");
      // La plata y el capítulo de cada agrupación. La plata es lo que
      // convierte este cronograma en uno valorado —sin ella las barras dicen
      // cuándo y no cuánto—. El capítulo es de dónde sale ese rubro en el
      // presupuesto, y hace falta para leerlo: "VENTANERÍA" dice poco si no se
      // ve que es de CARPINTERÍA METÁLICA.
      let { data: rub, error: eRub } = await supabase.from("obra_rubros")
        .select("id,descripcion,numero,codigo,actividad_id,total_base,capitulo,cantidad,unidad,anulado_por_oc,crono_senalado,crono_nota,crono_actividad_id")
        .eq("obra_id", lead.obra_id).order("orden");
      // Sin la 085 no existen esas dos columnas: se lee sin ellas y todo sigue
      // andando, solo que no se puede señalar qué rubro está trabando.
      if (eRub) {
        ({ data: rub } = await supabase.from("obra_rubros")
          .select("id,descripcion,numero,codigo,actividad_id,total_base,capitulo,cantidad,unidad,anulado_por_oc")
          .eq("obra_id", lead.obra_id).order("orden"));
      }
      setSinSenalar(!!eRub);
      setRubros(rub || []);

      const m = {};
      const caps = new Map();
      (rub || []).forEach(r => {
        if (r.actividad_id == null) return;
        if (!caps.has(r.actividad_id)) caps.set(r.actividad_id, new Set());
        if (r.capitulo) caps.get(r.actividad_id).add(r.capitulo);
        // Señalar un rubro NO lo saca del grupo: la barra sigue siendo la del
        // grupo, con toda su plata. Lo único que cambia es que se puede decir
        // qué falta en vez de dar el rubro entero por pendiente.
        //
        // Lo que SÍ sale es el rubro anulado por una orden de cambio: sigue en
        // la lista como historia del presupuesto, pero su plata ya no es
        // trabajo que haya que hacer. Es lo que suma el control de obra, y
        // sumar distinto acá daba dos totales de la misma agrupación.
        if (r.anulado_por_oc) return;
        m[r.actividad_id] = (m[r.actividad_id] || 0) + (Number(r.total_base) || 0);
      });
      setPlata(m);
      // Una agrupación puede cruzar capítulos a propósito —"muebles" toca
      // carpintería, herrajes e instalación— y en ese caso decir uno solo
      // sería mentir. Se dice cuántos cruza.
      setAgrupaciones((ags || []).map(a => {
        const c = [...(caps.get(a.id) || [])];
        return { ...a, capitulo: c.length === 1 ? c[0] : null, capitulos: c.length };
      }));
    }
    if (act?.length) {
      const { data: dep } = await supabase.from("cronograma_dependencias")
        .select("*").in("actividad_id", act.map(a => a.id));
      setDependencias(dep || []);
    } else setDependencias([]);
  }, [lead?.id]);
  useEffect(() => { cargar(); }, [cargar]);

  const cargarOrdenes = useCallback(async () => {
    if (!lead?.obra_id) { setOrdenes([]); return; }
    const { ordenes: o } = await ordenesPendientes(lead.obra_id);
    setOrdenes(o);
  }, [lead?.obra_id]);
  useEffect(() => { cargarOrdenes(); }, [cargarOrdenes]);

  const cargarFases = useCallback(async () => {
    if (!lead?.id) { setFases([]); return; }
    const { fases: f } = await fasesDe(lead.id);
    setFases(f);
  }, [lead?.id]);
  useEffect(() => { cargarFases(); }, [cargarFases]);

  const cargarMemoria = useCallback(async () => {
    const { memoria: m } = await leerMemoria("cronograma");
    setMemoria(m || []);
  }, []);
  useEffect(() => { cargarMemoria(); }, [cargarMemoria]);

  // LA ÚNICA RELACIÓN CON EL CONTROL SON LAS ÓRDENES DE CAMBIO.
  //
  // Esto estaba al revés y era una pelea diaria. El cronograma se trataba como
  // si se hubiera comprometido a tener una barra por cada agrupación del
  // presupuesto, salvo que alguien dijera lo contrario. Entonces un cronograma
  // armado leyendo la obra —que es el que se usa— vivía con un aviso prendido
  // que le reclamaba agrupaciones que nunca van a estar, nombres que son
  // distintos a propósito, y un orden que es el de la obra y no el del
  // presupuesto. Y al lado, un botón que arregla todo eso rompiéndolo.
  //
  // Ahora hay que PEDIR esa vigilancia, y se pide una sola vez: sirve cuando
  // el cronograma va a sostener el valorado, porque ahí una agrupación sin
  // tiempo es plata que no se puede repartir en los meses. En todos los demás
  // casos el control avisa de lo único que de verdad cambia la obra: las
  // órdenes de cambio.
  const cubrePresupuesto = lead?.crono_cubre === true;
  const editable = !lead || nivelProyecto?.(lead.id) === "editar";
  // El cronograma vive en el proyecto; la obra es de dónde salen el
  // presupuesto y sus agrupaciones. Un proyecto para cotizar todavía no tiene
  // obra, y ahí el cronograma se arma a mano — que es justamente el caso.
  const obra = lead?.obra_id ? { id: lead.obra_id, nombre: lead.nombre } : null;

  if (cargando) return <Centro>Cargando…</Centro>;

  if (!lead) {
    const mios = proyectos.filter(p => !nivelProyecto || !!nivelProyecto(p.id));
    return (
      <div style={{ fontFamily: colors.font }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: colors.ink, marginBottom: 4 }}>Cronograma</div>
        <div style={{ fontSize: 12.5, color: colors.muted, marginBottom: 14 }}>
          Qué se hace, cuándo, y qué no puede esperar.
        </div>
        {/* Decir qué falta, en vez de mostrar una lista corta sin explicación:
            una pantalla que calla cuando algo le falta manda a buscar el
            problema donde no está. */}
        {sinPlazo && (
          <Aviso>
            Falta correr la migración 082: el plazo de la obra —fecha de arranque y cuántos meses dura— no se
            puede guardar todavía, así que el Gantt y el cronograma valorado no comparten plazo. Lo demás funciona.
          </Aviso>
        )}
        {!mios.length ? <Centro>No tenés proyectos asignados.</Centro> : (
          <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, overflow: "hidden" }}>
            {mios.map(p => {
              const enCurso = p.resultado === "ganado" || !!p.obra_id;
              return (
                <button key={p.id} onClick={() => setLead(p)}
                  style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 9,
                    padding: "11px 13px", background: "none", border: "none", borderTop: `1px solid ${colors.neutralSoft}`,
                    cursor: "pointer", fontFamily: colors.font, fontSize: 13.5, color: colors.ink }}>
                  <GanttChartSquare size={15} color={enCurso ? colors.brand : colors.muted} />
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.nombre}
                  </span>
                  {/* Un cronograma para cotizar no es lo mismo que uno de una
                      obra en marcha, y conviene no confundirlos de un vistazo. */}
                  {!enCurso && (
                    <span style={{ fontSize: 9.5, fontWeight: 700, color: colors.muted, background: colors.neutralSoft,
                      borderRadius: 10, padding: "1px 7px", flexShrink: 0 }}>PARA COTIZAR</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  if (sinTablas) {
    return (
      <div style={{ fontFamily: colors.font }}>
        <Volver onClick={() => setLead(null)} />
        <Aviso>Falta correr la migración 076 para usar el cronograma.</Aviso>
      </div>
    );
  }

  const cal = calendario({
    laborables: lead.crono_laborables || [1, 2, 3, 4, 5, 6],
    feriados: lead.crono_feriados || [],
  });
  const plan = calcular({
    actividades: actividades.map(a => ({ ...a, duracion: a.duracion })),
    dependencias,
    inicio: lead.crono_inicio || hoy(),
    cal,
  });

  const porId = new Map(plan.actividades.map(a => [a.id, a]));
  // Si la columna existe, PostgREST la devuelve aunque esté en null.
  const conEtapas = actividades.length > 0 && "etapa" in actividades[0];
  // Lo que suman las etapas de cada agrupación. Si no da 100, esa agrupación
  // aporta de menos o de más al valorado, y el valorado deja de cuadrar con
  // el contrato — que es el único defecto que lo vuelve inservible.
  const pesoDeAgrup = new Map();
  actividades.forEach(a => {
    if (!a.obra_actividad_id) return;
    pesoDeAgrup.set(a.obra_actividad_id,
      (pesoDeAgrup.get(a.obra_actividad_id) || 0) + Number(a.peso_pct ?? 100));
  });
  const etapasDeAgrup = new Map();
  actividades.forEach(a => {
    if (!a.obra_actividad_id) return;
    etapasDeAgrup.set(a.obra_actividad_id, (etapasDeAgrup.get(a.obra_actividad_id) || 0) + 1);
  });
  const todas = plan.actividades;
  // La escala: del arranque al fin, en días hábiles, para dibujar las barras.
  const diasTotales = Math.max(1, cal.entre(plan.inicio, plan.fin));

  // El plazo contra el plan. Son dos cosas distintas y conviene no mezclarlas:
  // el plazo es lo que dice el contrato, y el plan es lo que sale de sumar las
  // actividades. Que no coincidan es normal al principio; que nadie lo diga es
  // lo que hace que el cronograma deje de servir.
  // El cronograma habla de tiempo. La plata que pide mes a mes —y el techo de
  // lo que el cliente puede poner— se mira en el valorado, que es la misma
  // información dicha en dinero: mezclarlas acá obliga a traducir entre las
  // dos para hacer cualquiera de las dos cosas.
  // Barras repetidas: la misma agrupación y el mismo momento, dos veces.
  const repetidas = (() => {
    const vistas = new Set(); let n = 0;
    actividades.forEach(a => {
      const k = `${a.obra_actividad_id || 0}·${a.etapa || "ejecucion"}·${(a.nombre || "").trim()}`;
      if (vistas.has(k)) n += 1; else vistas.add(k);
    });
    return n;
  })();

  // La plata de cada barra. Sale de los rubros que se le asignaron cuando los
  // tiene, y del porcentaje del capítulo cuando no. Una sola cuenta, para que
  // el Gantt, el valorado y la foto de referencia digan lo mismo.
  const platas = plataDelPlan(actividades, rubros);

  // LA FECHA MANDA cuando está; si no, se deriva de los meses, para que el
  // campo nunca se vea vacío habiendo plazo.
  const finPuesto = lead.crono_fin || finDeMeses(lead.crono_inicio || hoy(), lead.crono_meses);
  const laborablesHoy = lead.crono_laborables || [1, 2, 3, 4, 5, 6];
  // Los días del plazo, contados en el calendario de la obra: con la fecha de
  // terminación si está —que es exacta— y con los meses si no.
  const diasDeContrato = finPuesto
    ? diasHastaFin(lead.crono_inicio || hoy(), finPuesto, cal)
    : diasDelPlazo(lead.crono_inicio || hoy(), lead.crono_meses, cal);
  const desvio = diasDeContrato && todas.length ? plan.duracion - diasDeContrato : 0;

  // En qué día de obra cae una fecha. Negativo antes del arranque: el anticipo
  // de una importación es el día −18, y decirlo así es más claro que una fecha
  // suelta de diciembre en un cronograma que empieza en enero.
  const diaDeObra = f => {
    if (!f) return null;
    const d = cal.entre(plan.arranque, f);
    return aFecha(f) >= aFecha(plan.arranque) ? d : -(cal.entre(f, plan.arranque) - 1);
  };
  const hoyISO = hoy();
  const dentro = aFecha(hoyISO) >= aFecha(plan.inicio) && aFecha(hoyISO) <= aFecha(plan.fin);
  const diaHoy = diaDeObra(hoyISO);

  // Las marcas de la regla: cada cuánto se pone una depende de lo que dure la
  // obra. Con marcas cada día, una obra de ocho meses es una mancha.
  const marcas = (() => {
    // Una marca cada tantos píxeles, no cada tantos días: con el lienzo ancho
    // caben muchas, y con el acercamiento chico se encimarían. Lo que decide
    // es el espacio que ocupa la etiqueta, que son unos 46 píxeles.
    const paso = Math.max(1, Math.ceil(46 / zoom));
    const out = [];
    for (let d = 0; d <= diasTotales; d += paso) {
      let f = aFecha(plan.inicio), saltos = 0, vueltas = 0;
      while (saltos < d && vueltas++ < 4000) {
        f = new Date(f.getTime() + 86400000);
        if (cal.trabaja(f)) saltos += 1;
      }
      out.push({ x: d / diasTotales, fecha: claveFecha(f), dia: diaDeObra(claveFecha(f)) });
    }
    return out;
  })();

  async function agregar(nombre, faseId = null, dias = null, hito = false) {
    const texto = (nombre ?? nueva?.nombre ?? "").trim();
    if (!texto) return;
    setError("");
    const fila = {
      lead_id: lead.id, obra_id: lead.obra_id || null,
      // Un hito pasa un día: no se le pregunta cuánto dura.
      nombre: texto, duracion: hito ? 1 : Math.max(1, Number(dias ?? nueva?.duracion) || 1),
      orden: actividades.length,
    };
    if (faseId) fila.fase_id = faseId;
    if (hito) fila.es_hito = true;
    let { data, error: e } = await supabase.from("cronograma_actividades").insert(fila).select("id");
    // Sin la 101 no existe `fase_id`: entra igual, sin etapa, antes que no
    // dejar agregar la actividad.
    if (e && /fase_id|es_hito|column|schema cache/i.test(e.message)) {
      const { fase_id: _f, es_hito: _h, ...pelada } = fila;
      ({ data, error: e } = await supabase.from("cronograma_actividades").insert(pelada).select("id"));
    }
    if (e) { setError(e.message); return; }
    if (!data?.length) { setError("La base no dejó agregar la actividad y no dijo por qué."); return; }
    if (nombre == null) setNueva({ nombre: "", duracion: nueva.duracion });
    await cargar();
  }

  async function cambiar(a, campos) {
    // El error se muestra. Antes se descartaba, y entonces un campo que no se
    // podía guardar —porque falta una migración, porque el permiso no da— se
    // veía igual que uno guardado: se escribía el número, la pantalla
    // recargaba, y volvía el valor viejo sin que nada dijera por qué.
    // Con `select()`: sin él, un UPDATE que no tocó ninguna fila —porque el
    // permiso no deja— vuelve SIN error, y el campo simplemente mostraba otra
    // vez el valor viejo. Un guardado que no guarda y no avisa es peor que uno
    // que falla: manda a pensar que el campo está roto.
    const { data, error: e } = await supabase.from("cronograma_actividades")
      .update(campos).eq("id", a.id).select();
    if (e) {
      setError(/column|schema cache/i.test(e.message)
        ? "Falta correr la migración 083 para guardar la etapa y su peso."
        : e.message);
      return;
    }
    if (!data?.length) { setError("No se pudo guardar el cambio: la base no dejó tocar esa actividad."); return; }
    setError("");
    // CORREGIR UN NÚMERO ES ENSEÑARLE.
    //
    // Es el único momento en que se sabe que el número lo puso una persona y
    // no NOVA, y es exactamente el momento que antes se perdía: aprender
    // estaba atado a un botón del menú que hay que ir a buscar después de
    // corregir veinte duraciones, y nadie lo aprieta.
    //
    // No se apuntan los días —la obra que viene tiene otros metros— sino el
    // rendimiento que este número demuestra: 450 m2 en 25 días son 18 m2 por
    // día. Eso es lo que hace que la próxima obra arranque con duraciones que
    // ya se parecen a la verdad, que es lo que de verdad ahorra las horas.
    //
    // Sin aviso y sin preguntar: si cada corrección abriera un cartel, se
    // volvería más molesto que útil. Y si falla no se dice nada tampoco —que
    // el apunte no se guarde no es razón para ensuciar una corrección que sí
    // se guardó—.
    if (campos.duracion && Number(campos.duracion) !== Number(a.duracion)) {
      const hermanas = actividades.filter(x => a.obra_actividad_id && x.obra_actividad_id === a.obra_actividad_id).length;
      aprenderDeUnaDuracion({
        nombre: a.nombre, dias: campos.duracion,
        magnitud: magnitudDe(rubros, a.obra_actividad_id),
        // Partida en anticipo / fabricación / instalación: los días de una
        // etapa no se dividen por la cantidad entera.
        partida: hermanas > 1,
        quien: currentUser,
      }).then(() => cargarMemoria()).catch(() => {});
    }
    await cargar();
  }

  /**
   * Partir una actividad en los momentos en que de verdad ocurre.
   *
   * Lo que se importa o se fabrica no pasa de una vez: se anticipa, se fabrica
   * dos meses, llega y se instala. Son barras distintas con su parte de la
   * plata, y es de eso que depende que el cronograma y el valorado digan lo
   * mismo sobre la misma ventanería.
   *
   * La primera etapa se queda con la actividad que ya existía —no se borra y
   * se rehace: perdería sus dependencias con el resto de la obra, que es lo
   * que más cuesta armar—. Las demás se crean encadenadas detrás.
   */
  async function partir(a, etapas = []) {
    if (etapas.length < 2) return;
    setError("");
    const base = a.nombre.split(" · ")[0];
    const [primera, ...resto] = etapas;

    const { data, error: e } = await supabase.from("cronograma_actividades").update({
      nombre: `${base} · ${primera.nombre}`.slice(0, 120),
      duracion: primera.duracion, etapa: primera.etapa || "ejecucion",
      peso_pct: a.obra_actividad_id ? primera.peso : null,
    }).eq("id", a.id).select();
    if (e) {
      setError(/column|schema cache/i.test(e.message) ? "Falta correr la migración 083 para partir en etapas." : e.message);
      return;
    }
    if (!data?.length) { setError("No se pudo guardar: la base no dejó tocar esa actividad."); return; }

    let anterior = a.id;
    for (const [i, et] of resto.entries()) {
      const { data: creada, error: e2 } = await supabase.from("cronograma_actividades").insert({
        lead_id: lead.id, obra_id: lead.obra_id || null,
        obra_actividad_id: a.obra_actividad_id,
        nombre: `${base} · ${et.nombre}`.slice(0, 120),
        duracion: et.duracion, etapa: et.etapa || "ejecucion",
        peso_pct: a.obra_actividad_id ? et.peso : null,
        orden: (a.orden ?? 0) + i + 1,
      }).select().single();
      if (e2) { setError(e2.message); break; }
      await supabase.from("cronograma_dependencias")
        .insert({ actividad_id: creada.id, depende_de_id: anterior, tipo: "FC", retardo: 0 });
      anterior = creada.id;
    }
    setPartiendo(null);
    await cargar();
  }

  /**
   * Mover un rubro entero arriba o abajo en el cronograma.
   *
   * El cronograma nace en el orden del control de obra, que es el que la
   * oficina ya decidió. Pero el orden del presupuesto no es el orden de
   * trabajo: el presupuesto se escribe por capítulos y la obra se hace por
   * frentes. Así que acá se reordena, y ese orden es del cronograma — no toca
   * el control de obra, que se lee de otra manera y por otra gente.
   */
  async function moverRubro(ids, direccion) {
    // El orden actual de los rubros, tal como se ven.
    const grupos = [];
    const vistos = new Set();
    [...actividades].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)).forEach(a => {
      const k = a.obra_actividad_id || 0;
      if (vistos.has(k)) return;
      vistos.add(k); grupos.push(k);
    });
    const i = grupos.indexOf(ids);
    const j = i + direccion;
    if (i < 0 || j < 0 || j >= grupos.length) return;
    [grupos[i], grupos[j]] = [grupos[j], grupos[i]];

    // Reescribir el orden de todas: dentro de cada rubro se respeta el que
    // tenían, que es el de sus etapas.
    let pos = 0;
    for (const k of grupos) {
      const suyas = actividades.filter(a => (a.obra_actividad_id || 0) === k)
        .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
      for (const a of suyas) {
        await supabase.from("cronograma_actividades").update({ orden: pos++ }).eq("id", a.id);
      }
    }
    await cargar();
  }

  /**
   * Armar el cronograma del control de obra. Sin NOVA.
   *
   * Esto es lo que debería haber existido desde el principio. Un cronograma
   * que SOLO se puede armar preguntándole a un modelo es un cronograma que
   * falla cuando el modelo se equivoca —y se equivoca: inventó actividades,
   * renombró rubros, partió los gastos generales en seis etapas con tres
   * "instalación"—. Y cuando falla, no hay de dónde agarrarse.
   *
   * Acá no hay nada que adivinar. La lista ya existe: son las agrupaciones del
   * control de obra, en su orden, con su nombre y su capítulo. Una actividad
   * por agrupación, encadenadas una detrás de otra, con una duración que sale
   * de lo que pesa cada una en el presupuesto repartido en el plazo. Eso es un
   * cronograma crudo pero CORRECTO, y sobre un cronograma correcto se puede
   * trabajar: mover, traslapar, partir en etapas, o pedirle a NOVA que ponga
   * las duraciones de verdad.
   *
   * NOVA queda para lo que NOVA sabe —cuánto dura cada cosa y qué traba a
   * qué— y deja de ser el único camino para tener algo.
   */
  async function armarDelControl() {
    const reales = agrupaciones.filter(g => !g.extra);
    if (!reales.length) { setError("Esta obra todavía no tiene agrupaciones. Se arman en Control de Obra → Agrupaciones."); return; }
    setPensando(true); setError("");

    const limpio = await vaciarCronograma();
    if (limpio.error) { setPensando(false); setError(limpio.error); return; }

    // La duración: el plazo repartido entre las agrupaciones a prorrata de su
    // plata. Es una aproximación grosera y se nota —esa es la idea: un número
    // que pide ser corregido es mejor que uno que parece pensado y no lo
    // está—. Lo único que garantiza es que la suma dé el plazo.
    const total = reales.reduce((t, g) => t + (plata[g.id] || 0), 0);
    const dias = diasDeContrato || 120;
    const filas = reales.map((g, i) => {
      const parte = total > 0 ? (plata[g.id] || 0) / total : 1 / reales.length;
      return {
        lead_id: lead.id, obra_id: lead.obra_id || null,
        obra_actividad_id: g.id, nombre: String(g.nombre).slice(0, 120),
        duracion: Math.max(1, Math.round(dias * parte)),
        etapa: "ejecucion", peso_pct: 100, orden: i,
      };
    });

    let { data: creadas, error: e } = await supabase.from("cronograma_actividades").insert(filas).select();
    if (e && /column|schema cache/i.test(e.message)) {
      const limpias = filas.map(({ etapa, peso_pct, ...resto }) => resto);
      ({ data: creadas, error: e } = await supabase.from("cronograma_actividades").insert(limpias).select());
    }
    setPensando(false);
    if (e) { setError(e.message); return; }

    // Encadenadas una detrás de otra, en el orden del control.
    //
    // Es el orden del presupuesto y NO es el orden de obra: la pintura no va
    // después de la señalética porque sí. Pero una cadena se lee, se entiende
    // y se corrige arrastrando; dejarlas todas arrancando el día uno daría un
    // cronograma que dice que la obra dura lo que dura su rubro más largo, que
    // es falso y peor.
    const deps = (creadas || []).slice(1).map((a, i) => ({
      actividad_id: a.id, depende_de_id: creadas[i].id, tipo: "FC", retardo: 0,
    }));
    if (deps.length) await supabase.from("cronograma_dependencias").insert(deps);
    // La foto de la plata, para poder avisar después si una orden de cambio la
    // mueve y la barra se queda igual.
    await refrescarMontoRef(creadas || []);
    await cargar();
  }

  /**
   * Vaciar el cronograma en la base, y comprobar que se vació.
   *
   * ACÁ NACIÓ EL CRONOGRAMA DUPLICADO. Esto estaba escrito dos veces y las dos
   * adentro de un `if (actividades.length)`: o sea, se le preguntaba al ESTADO
   * DE LA PANTALLA si en la base había algo. Si la pantalla todavía no había
   * recargado —o si alguien apretó el botón dos veces— el estado decía que no
   * había nada, el borrado se saltaba, y el armado agregaba un SEGUNDO juego
   * completo encima del primero. Dos barras por agrupación, cada una con peso
   * 100: de ahí el "reparten 200%" y el aviso falso de "-50% de monto".
   *
   * Lo que hay en la base no se deduce de lo que la pantalla recuerda: se le
   * pregunta a la base. Y se comprueba que el borrado haya borrado, porque un
   * DELETE que no tocó ninguna fila vuelve sin error.
   */
  async function vaciarCronograma() {
    const { data: previas, error } = await supabase.from("cronograma_actividades")
      .select("id").eq("lead_id", lead.id);
    if (error) return { error: error.message };
    if (!previas?.length) return { borradas: 0 };

    await supabase.from("cronograma_dependencias").delete().in("actividad_id", previas.map(a => a.id));
    const { data: borradas, error: e2 } = await supabase.from("cronograma_actividades")
      .delete().eq("lead_id", lead.id).select("id");
    if (e2) return { error: e2.message };
    if ((borradas?.length || 0) < previas.length) {
      return { error: "No se pudo borrar el cronograma anterior: la base dejó filas sin tocar." };
    }
    return { borradas: borradas.length };
  }

  /**
   * Quitar las barras repetidas: dos de la misma agrupación y el mismo momento.
   *
   * Una agrupación puede tener varias barras —anticipo, fabricación,
   * instalación— y eso es correcto. Lo que no existe es la misma agrupación
   * con dos "ejecución": son la misma cosa dibujada dos veces, y su efecto no
   * es solo visual. Cada una lleva peso 100, así que el rubro reparte 200% y
   * el valorado le pone el doble de la plata que tiene.
   *
   * Se queda la primera —la que probablemente tenga las dependencias que
   * alguien armó— y las demás le ceden lo suyo antes de irse: sus
   * dependencias se reapuntan a la que queda, para no romper la cadena.
   */
  async function quitarRepetidas() {
    const porClave = new Map();
    [...actividades].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || a.id - b.id).forEach(a => {
      // El nombre entra en la cuenta: un rubro puede tener tres barras de
      // "ejecución" —las eléctricas entran tres veces a la obra— y esas no son
      // repetidas, son tramos distintos. Repetida es la misma cosa, igual.
      const k = `${a.obra_actividad_id || 0}·${a.etapa || "ejecucion"}·${(a.nombre || "").trim()}`;
      if (!porClave.has(k)) porClave.set(k, []);
      porClave.get(k).push(a);
    });
    const sobran = [...porClave.values()].filter(g => g.length > 1);
    if (!sobran.length) { setError("No hay barras repetidas."); return; }

    const cuantas = sobran.reduce((t, g) => t + g.length - 1, 0);
    if (!window.confirm(
      `Hay ${cuantas} ${cuantas === 1 ? "barra repetida" : "barras repetidas"}: la misma agrupación dibujada dos ` +
      "veces en el mismo momento.\n\n¿Las quito? De cada par se queda una, y lo que dependía de la que se va queda " +
      "colgando de la que queda.")) return;

    setPensando(true);
    for (const grupo of sobran) {
      const [queda, ...fuera] = grupo;
      for (const a of fuera) {
        // Lo que colgaba de la repetida pasa a colgar de la que queda, y lo
        // que ella esperaba también. Borrarlas sin esto corta la cadena en
        // silencio y el cronograma se acorta solo.
        await supabase.from("cronograma_dependencias")
          .update({ depende_de_id: queda.id }).eq("depende_de_id", a.id);
        await supabase.from("cronograma_dependencias")
          .update({ actividad_id: queda.id }).eq("actividad_id", a.id);
        await supabase.from("cronograma_actividades").delete().eq("id", a.id);
      }
      // El peso vuelve a ser el de una sola.
      if (queda.peso_pct != null) {
        await supabase.from("cronograma_actividades").update({ peso_pct: 100 }).eq("id", queda.id);
      }
    }
    // Y se limpian las que se quedaron apuntándose a sí mismas, que es lo que
    // pasa cuando las dos de un par estaban encadenadas entre ellas.
    const { data: deps } = await supabase.from("cronograma_dependencias")
      .select("id,actividad_id,depende_de_id");
    const suicidas = (deps || []).filter(d => d.actividad_id === d.depende_de_id);
    if (suicidas.length) {
      await supabase.from("cronograma_dependencias").delete().in("id", suicidas.map(d => d.id));
    }
    setPensando(false); setError("");
    await cargar();
    await refrescarMontoRef();
  }

  /** Borrarlo entero y empezar de nuevo. */
  async function borrarTodo() {
    if (!window.confirm(
      `¿Borrar el cronograma entero de ${lead.nombre}?\n\n` +
      `Se van las ${actividades.length} actividades con sus dependencias, sus traslapes y sus etapas. ` +
      "No se puede deshacer.\n\nEl control de obra y el presupuesto no se tocan.")) return;
    setPensando(true);
    const limpio = await vaciarCronograma();
    if (limpio.error) { setPensando(false); setError(limpio.error); return; }
    setPensando(false); setError("");
    await cargar();
  }

  /**
   * Encadenar todas, una detrás de otra, en el orden en que están.
   *
   * El cronograma salía con unas barras encadenadas y otras no —NOVA encadena
   * lo que entiende y deja suelto lo demás— y una barra sin dependencia
   * arranca el día uno. Así quedaban quince actividades amontonadas al
   * principio y el resto en fila, que no se puede leer ni corregir.
   *
   * Una cadena simple no es el orden real de la obra, pero es un punto de
   * partida que se entiende de un vistazo: se ve qué va después de qué, y de
   * ahí se traslapa lo que de verdad va en paralelo. Arrancar de algo legible
   * y corregirlo es trabajo; arrancar de algo confuso es volver a empezar.
   */
  async function encadenarTodo() {
    const orden = [...actividades].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
    if (orden.length < 2) return;
    if (!window.confirm(
      "¿Encadenar todas las actividades una detrás de otra, en el orden en que están?\n\n" +
      "Se reemplazan las dependencias que haya. Las duraciones no se tocan.\n\n" +
      "Es un punto de partida ordenado: desde ahí traslapás lo que va en paralelo poniendo los días en negativo.")) return;
    setPensando(true);
    await supabase.from("cronograma_dependencias").delete().in("actividad_id", orden.map(a => a.id));
    const deps = orden.slice(1).map((a, i) => ({
      actividad_id: a.id, depende_de_id: orden[i].id, tipo: "FC", retardo: 0,
    }));
    const { error: e } = await supabase.from("cronograma_dependencias").insert(deps);
    setPensando(false);
    if (e) { setError(e.message); return; }
    setError("");
    await cargar();
  }

  /**
   * Guardar cuánta plata tenía cada agrupación cuando se miró su barra.
   *
   * Es la foto contra la que después se detecta que una orden de cambio movió
   * el monto y la barra se quedó igual. Se saca después de acomodar: lo que
   * ya se acomodó deja de estar desacomodado, y volver a avisar de lo mismo
   * es ruido —y el ruido es lo que hace que los avisos dejen de leerse—.
   *
   * Se reparte entre las etapas con sus mismos pesos, para que la suma de un
   * rubro dé lo que vale el rubro.
   */
  async function refrescarMontoRef(lista) {
    const actuales = lista || actividades;
    const { porActividad } = plataDelPlan(actuales, rubros);
    for (const a of actuales) {
      if (!a.obra_actividad_id) continue;
      const ref = Math.round((porActividad.get(a.id) || 0) * 100) / 100;
      const { error: e } = await supabase.from("cronograma_actividades")
        .update({ monto_ref: ref }).eq("id", a.id);
      // Sin la 086 no existe la columna: se sigue sin ella, y lo único que se
      // pierde es poder avisar de un cambio de monto.
      if (e && /column|schema cache/i.test(e.message)) return;
    }
  }

  /**
   * Devolver el cronograma al orden del control de obra.
   *
   * El cronograma nace en ese orden, pero después se mueve —a mano, o porque
   * se rearmó con NOVA— y termina diciendo otra cosa que el control. Cuando
   * eso pasa no hay forma de leer los dos documentos uno al lado del otro, que
   * es para lo que existen.
   *
   * No se hace solo: el orden de trabajo NO es el del presupuesto —el
   * presupuesto se escribe por capítulos y la obra se hace por frentes— y
   * reordenar sin que nadie lo pida borraría un trabajo que alguien hizo a
   * propósito.
   */
  async function ordenarComoElControl() {
    const pos = new Map(agrupaciones.map((g, i) => [g.id, g.orden ?? i]));
    const ordenadas = [...actividades].sort((a, b) => {
      // Las que no cuelgan de ninguna agrupación, al final: no tienen lugar
      // en el orden del control porque no están en el control.
      const pa = pos.has(a.obra_actividad_id) ? pos.get(a.obra_actividad_id) : 1e6;
      const pb = pos.has(b.obra_actividad_id) ? pos.get(b.obra_actividad_id) : 1e6;
      if (pa !== pb) return pa - pb;
      // Dentro de un rubro, por el momento en que ocurre: anticipo, luego
      // fabricación, luego entrega, luego instalación.
      const e = ["anticipo", "fabricacion", "entrega", "instalacion", "ejecucion"];
      const ea = e.indexOf(a.etapa || "ejecucion"), eb = e.indexOf(b.etapa || "ejecucion");
      return ea !== eb ? ea - eb : (a.orden ?? 0) - (b.orden ?? 0);
    });
    setPensando(true);
    for (const [i, a] of ordenadas.entries()) {
      if ((a.orden ?? -1) !== i) await supabase.from("cronograma_actividades").update({ orden: i }).eq("id", a.id);
    }
    setPensando(false);
    await cargar();
  }

  /**
   * Poner el cronograma de acuerdo con el control de obra, sin rehacerlo.
   *
   * Rearmarlo de cero arregla todo y tira todo: las duraciones corregidas, las
   * dependencias, los traslapes, las etapas. Eso es semanas de trabajo de
   * alguien y no se borra para corregir nombres.
   *
   * Esto hace lo mínimo que hace falta para que los dos documentos vuelvan a
   * poder leerse juntos:
   *
   *   · la actividad que apunta a una agrupación que ya no existe, se va;
   *   · la que se llama distinto, toma el nombre de su agrupación;
   *   · la agrupación que no está en el cronograma, entra al final;
   *   · y todo queda en el orden del control.
   *
   * Las duraciones, las dependencias y las etapas no se tocan.
   */
  async function sincronizarConElControl() {
    const vivas = new Map(agrupaciones.filter(g => !g.extra).map(g => [Number(g.id), g]));
    setPensando(true); setError("");
    let fuera = 0, renombradas = 0, sumadas = 0;

    // Las que apuntan a una agrupación BORRADA. Lo que no apunta a ninguna no
    // está colgado: es PROPIO DEL CRONOGRAMA.
    //
    // Un cronograma necesita cosas que no son rubros del presupuesto —el
    // permiso municipal, la aprobación de planos del cliente, la inspección
    // de bomberos, el traslado de la grúa— y a veces se planifica antes de
    // que el control exista. Tratar eso como huérfano y borrarlo hacía que
    // agregar una actividad propia fuera imposible: se agregaba, y el primer
    // "ponerlo al día" se la llevaba sin avisar.
    const colgadas = actividades.filter(a =>
      a.obra_actividad_id != null && !vivas.has(Number(a.obra_actividad_id)));
    if (colgadas.length) {
      await supabase.from("cronograma_dependencias").delete().in("actividad_id", colgadas.map(a => a.id));
      await supabase.from("cronograma_dependencias").delete().in("depende_de_id", colgadas.map(a => a.id));
      await supabase.from("cronograma_actividades").delete().in("id", colgadas.map(a => a.id));
      fuera = colgadas.length;
    }

    // Los nombres. El sufijo de la etapa se conserva: "· anticipo" no es un
    // desfase, es cómo se escriben las etapas de un rubro.
    for (const a of actividades) {
      const g = vivas.get(Number(a.obra_actividad_id));
      if (!g) continue;
      const partes = String(a.nombre || "").split(" · ");
      const sufijo = partes.length > 1 ? ` · ${partes.slice(1).join(" · ")}` : "";
      const deberia = `${g.nombre}${sufijo}`.slice(0, 120);
      if (a.nombre !== deberia) {
        await supabase.from("cronograma_actividades").update({ nombre: deberia }).eq("id", a.id);
        renombradas += 1;
      }
    }

    // Las que faltan. Con una duración a revisar, y es correcto que se note:
    // mejor una barra fea y presente que un rubro desaparecido del plan.
    const puestas = new Set(actividades.filter(a => vivas.has(Number(a.obra_actividad_id)))
      .map(a => Number(a.obra_actividad_id)));
    // AGREGAR LAS QUE FALTAN, SOLO SI ESTE CRONOGRAMA SE COMPROMETIÓ A ESO.
    //
    // En un cronograma armado leyendo la obra, que falte una agrupación no es
    // un olvido: es la decisión que se tomó. Un trabajo puede juntar tres
    // agrupaciones, o no corresponder a ninguna. Agregarle acá una barra por
    // cada agrupación que no esté sería meterle veinte filas que nadie pidió y
    // desarmar lo que alguien acaba de pensar — y encima el aviso que lleva a
    // este botón estaría prendido para siempre, porque siempre van a faltar.
    const faltan = cubrePresupuesto
      ? [...vivas.values()].filter(g => !puestas.has(Number(g.id)))
      : [];
    if (faltan.length) {
      const filas = faltan.map((g, i) => ({
        lead_id: lead.id, obra_id: lead.obra_id || null,
        obra_actividad_id: g.id, nombre: String(g.nombre).slice(0, 120),
        duracion: 10, etapa: "ejecucion", peso_pct: 100,
        orden: actividades.length + i,
      }));
      const { error: e } = await supabase.from("cronograma_actividades").insert(filas);
      if (e) { setPensando(false); setError(e.message); return; }
      sumadas = faltan.length;
    }

    setPensando(false);
    await cargar();
    // El orden del control manda solo cuando el cronograma es el presupuesto.
    // En uno libre el orden lo puso quien lo escribió, y es información.
    if (cubrePresupuesto) await ordenarComoElControl();
    await refrescarMontoRef();
    window.alert([
      "Cronograma al día con el control de obra.",
      fuera && `· ${fuera} ${fuera === 1 ? "actividad apuntaba" : "actividades apuntaban"} a agrupaciones que ya no existen: se fueron.`,
      renombradas && `· ${renombradas} ${renombradas === 1 ? "tomó" : "tomaron"} el nombre de su agrupación.`,
      sumadas && `· ${sumadas} ${sumadas === 1 ? "agrupación entró" : "agrupaciones entraron"} con duración a revisar.`,
      !cubrePresupuesto && "· No se agregó ninguna agrupación: este cronograma se armó leyendo la obra, no el presupuesto.",
      !fuera && !renombradas && !sumadas && "No hacía falta cambiar nada: ya coincidían.",
      "",
      "Las duraciones, las dependencias y las etapas no se tocaron.",
    ].filter(Boolean).join("\n"));
  }

  /**
   * Señalar, dentro de un grupo, el rubro que de verdad está pendiente.
   *
   * El grupo se atrasa por UNA cosa: están todas las lámparas instaladas menos
   * una, y el cronograma dice "LÁMPARAS: pendiente". Quien lo lee —y sobre
   * todo el cliente— entiende que falta el rubro entero, que es falso y es
   * caro: genera una llamada, una reunión y una desconfianza que no
   * correspondían.
   *
   * NO le da barra propia ni lo saca del grupo. El cronograma trae
   * exclusivamente las agrupaciones del control de obra, y eso no se toca:
   * agregar barras de rubro rompería justamente lo que hace que el cronograma
   * y el control se puedan comparar. Lo único que cambia es que el grupo deja
   * de decir "pendiente" a secas y pasa a decir QUÉ falta.
   */
  async function senalarRubro(rubro, campos) {
    setError("");
    const { data, error: e } = await supabase.from("obra_rubros")
      .update(campos).eq("id", rubro.id).select();
    if (e) {
      setError(/column|schema cache/i.test(e.message)
        ? "Falta correr la migración 085 para señalar un rubro."
        : e.message);
      return;
    }
    if (!data?.length) { setError("No se pudo guardar: la base no dejó tocar ese rubro."); return; }
    await cargar();
  }

  /**
   * Mover una etapa dentro de su agrupación.
   *
   * NOVA propone un orden —anticipo, fabricación, instalación— y a veces en
   * esta obra el montaje va antes que otra cosa, o la entrega se adelanta.
   * Sin esto había que borrar la partición y volver a hacerla entera.
   *
   * Se intercambian los dos `orden` y nada más: reescribir todas las barras
   * por mover una es pedirle a la base veinte escrituras por un clic.
   */
  async function moverEtapa(a, direccion) {
    const hermanas = actividades
      .filter(x => (x.obra_actividad_id || 0) === (a.obra_actividad_id || 0))
      .sort((x, y) => (x.orden ?? 0) - (y.orden ?? 0));
    const i = hermanas.findIndex(x => x.id === a.id);
    const j = i + direccion;
    if (i < 0 || j < 0 || j >= hermanas.length) return;
    const otra = hermanas[j];
    // Si quedaron con el mismo orden —o sin ninguno— intercambiar no movería
    // nada: se les da el lugar que ocupan en la lista antes de cambiarlas.
    const mio = a.orden ?? i;
    const suyo = otra.orden ?? j;
    const [o1, o2] = mio === suyo ? [j, i] : [suyo, mio];
    setError("");
    const [e1, e2] = await Promise.all([
      supabase.from("cronograma_actividades").update({ orden: o1 }).eq("id", a.id),
      supabase.from("cronograma_actividades").update({ orden: o2 }).eq("id", otra.id),
    ]);
    if (e1.error || e2.error) { setError("No se pudo mover: " + (e1.error || e2.error).message); return; }
    await cargar();
  }

  // ── Las etapas de la obra ────────────────────────────────────────────────

  /**
   * SIN `window.prompt`, y esta es la razón.
   *
   * El nombre de la etapa se pedía con el cuadrito del navegador. Muchos
   * navegadores lo bloquean —y no avisan: lo ignoran—. El botón se apretaba,
   * la función salía por el `if` de arriba creyendo que la persona había
   * cancelado, y no pasaba absolutamente nada. Ni una etapa ni un error: la
   * pantalla igual que antes. Desde afuera es idéntico a un botón roto, y es
   * exactamente lo que se veía.
   *
   * Un campo de texto en la pantalla no depende de que el navegador quiera.
   */
  async function agregarEtapa(nombre) {
    if (!nombre?.trim()) return;
    // Al final de la lista: una etapa nueva es la que sigue. Si va antes se
    // sube con las flechas, que es un movimiento y no una decisión.
    const r = await crearFase({
      leadId: lead.id, nombre,
      orden: fases.length ? Math.max(...fases.map(f => f.orden ?? 0)) + 1 : 0,
      quien: currentUser,
    });
    if (r.error) { setError(r.error); return; }
    setError("");
    // LO QUE PASÓ, DICHO. Sin esto, crear una etapa y no crearla se ven igual
    // si uno no está mirando la lista: aparece una fila más, y nada la señala.
    setAviso(`Etapa «${r.fase.nombre}» creada.`);
    await cargarFases();
  }

  /**
   * Que NOVA las arme y las ordene.
   *
   * Los nombres de las actividades ya dicen a qué etapa pertenecen y el orden
   * de las etapas es el orden de una obra: es trabajo que hace bien y en
   * segundos. Lo que se ve antes de aceptar es la lista entera —cada etapa con
   * cuántas barras lleva— porque reemplaza las etapas que haya, y eso no se
   * hace a ciegas.
   */
  async function etapasConNova() {
    if (!actividades.length) { setError("Todavía no hay actividades que agrupar en etapas."); return; }
    setPensando(true);
    const r = await proponerEtapas(todas);
    setPensando(false);
    if (r.error) { setError(r.error); return; }
    const resumen = r.etapas.map((e, i) => `  ${i + 1}. ${e.nombre} — ${e.ids.length} ${e.ids.length === 1 ? "barra" : "barras"}`).join("\n");
    if (!window.confirm(
      `NOVA propone ${r.etapas.length} etapas:\n\n${resumen}\n\n` +
      (r.sueltas ? `${r.sueltas} ${r.sueltas === 1 ? "actividad queda" : "actividades quedan"} sin etapa.\n\n` : "") +
      (fases.length ? `Reemplaza las ${fases.length} etapas de ahora. ` : "") +
      "No cambia ninguna fecha ni ninguna duración: solo cómo se lee el cronograma.")) return;

    setPensando(true);
    setError("");
    // Las de antes se van primero: `on delete set null` deja las actividades
    // donde están, así que no se pierde nada en el camino.
    for (const f of fases) await borrarFase(f.id);
    for (let i = 0; i < r.etapas.length; i++) {
      const hecha = await crearFase({ leadId: lead.id, nombre: r.etapas[i].nombre, orden: i, quien: currentUser });
      if (hecha.error) { setPensando(false); setError(hecha.error); return; }
      const e = await asignarFase(r.etapas[i].ids, hecha.fase.id);
      if (e) { setPensando(false); setError(e === SIN_101 ? SIN_101 : e); return; }
    }
    setPensando(false);
    await Promise.all([cargarFases(), cargar()]);
  }

  async function moverEtapaDeObra(fase, direccion) {
    const e = await moverFase(fases, fase.id, direccion);
    if (e) { setError(e); return; }
    setError(""); setAviso(`«${fase.nombre}» se movió ${direccion < 0 ? "arriba" : "abajo"}.`);
    await cargarFases();
  }

  async function renombrarEtapaDeObra(fase, nombre) {
    const e = await renombrarFase(fase.id, nombre);
    if (e) { setError(e); return; }
    setError(""); await cargarFases();
  }

  /**
   * Borrar una etapa no borra la obra que tiene adentro.
   *
   * Es la equivocación más fácil de cometer —uno borra "Etapa 2" creyendo que
   * borra un título— así que el aviso dice qué pasa con las actividades antes
   * de que uno apriete, y no después.
   */
  async function borrarEtapaDeObra(fase) {
    const adentro = actividades.filter(a => Number(a.fase_id) === Number(fase.id)).length;
    if (!window.confirm(
      `¿Borrar la etapa "${fase.nombre}"?\n\n` +
      (adentro
        ? `Sus ${adentro} ${adentro === 1 ? "actividad queda" : "actividades quedan"} sin etapa, al final de la tabla. No se borra ninguna.`
        : "No tiene nada adentro."))) return;
    const e = await borrarFase(fase.id);
    if (e) { setError(e); return; }
    setError(""); setAviso(`Etapa «${fase.nombre}» borrada. Sus actividades quedaron sin etapa.`);
    await Promise.all([cargarFases(), cargar()]);
  }

  /**
   * Meter una barra en una etapa.
   *
   * Un rubro partido en anticipo, fabricación e instalación se mueve ENTERO:
   * en la tabla es una sola cosa y tiene que salir en un solo lugar. Mover una
   * parte sola dejaría al rubro apareciendo en dos etapas, y nadie podría
   * decir en cuál de las dos está.
   */
  async function ponerEnEtapa(a, faseId) {
    const ids = a.obra_actividad_id
      ? actividades.filter(x => x.obra_actividad_id === a.obra_actividad_id).map(x => x.id)
      : [a.id];
    const e = await asignarFase(ids, faseId);
    if (e) { setError(e); return; }
    setError(""); await cargar();
  }

  async function quitar(a) {
    if (!window.confirm(`¿Borrar "${a.nombre}"?`)) return;
    await supabase.from("cronograma_actividades").delete().eq("id", a.id);
    await cargar();
  }

  async function unir(desde, hasta) {
    if (desde === hasta) return;
    const { error: e } = await supabase.from("cronograma_dependencias")
      .insert({ actividad_id: hasta, depende_de_id: desde, tipo: "FC" });
    if (e && !/duplicate/i.test(e.message)) setError(e.message);
    setUniendo(null);
    await cargar();
  }

  /**
   * Cambiarle el tipo o el retardo a una dependencia.
   *
   * Es lo que hacía falta para TRASLAPAR. "La mampostería arranca cinco días
   * antes de que termine la estructura" no se podía decir: todas las uniones
   * nacían fin→comienzo con cero de espera y no había dónde tocarlas, así que
   * el cronograma salía todo en fila y más largo de lo que la obra es.
   */
  async function cambiarDep(d, campos) {
    const { data, error: e } = await supabase.from("cronograma_dependencias")
      .update(campos).eq("id", d.id).select();
    if (e) { setError(e.message); return; }
    if (!data?.length) { setError("No se pudo guardar: la base no dejó tocar esa dependencia."); return; }
    setError("");
    await cargar();
  }

  async function desunir(d) {
    await supabase.from("cronograma_dependencias").delete().eq("id", d.id);
    await cargar();
  }

  return (
    <div style={{ fontFamily: colors.font }}>
      <Volver onClick={() => setLead(null)} />
      {/* LAS DOS VISTAS DEL MISMO PLAN.
          El cronograma dice cuándo pasa cada cosa y el valorado cuánto cuesta
          ese cuándo. Salen de las mismas agrupaciones del control de obra y en
          su mismo orden. El valorado vivía en Control de Obra y el Gantt acá:
          esa separación es la que hacía que uno se quedara viejo sin que nadie
          se entere. */}
      <div style={{ display: "inline-flex", gap: 3, background: colors.neutralSoft, borderRadius: 8, padding: 3, marginBottom: 12 }}>
        {[["barras", "Cronograma"], ["valorado", "Valorado"]].map(([v, l]) => (
          <button key={v} onClick={() => setVista(v)}
            style={{ padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer", fontFamily: colors.font,
              fontSize: 12.5, fontWeight: 600, background: vista === v ? "#fff" : "transparent",
              color: vista === v ? colors.brand : colors.inkSoft }}>{l}</button>
        ))}
      </div>

      {vista === "valorado" ? (
        !obra ? (
          <Aviso>Este proyecto todavía no tiene obra activa: el valorado sale de sus rubros.</Aviso>
        ) : (
          <Suspense fallback={<Centro>Cargando…</Centro>}>
            <PanelValorado lead={lead} obra={{ id: lead.obra_id, nombre: lead.nombre, lead_id: lead.id }}
              currentUser={currentUser} puedeEditar={editable} />
          </Suspense>
        )
      ) : (
      <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: colors.ink }}>{lead.nombre}</div>
          <div style={{ fontSize: 11.5, color: colors.muted }}>
            {todas.length ? (
              <>
                Del {dia(plan.arranque)} al <strong style={{ color: colors.ink }}>{dia(plan.fin)}</strong> · {plan.duracion} días de trabajo
                {plan.previos > 0 && <> · {plan.previos} días de trabajos previos</>}
                {dentro && diaHoy > 0 && (
                  <> · hoy es el <strong style={{ color: colors.danger }}>día {diaHoy}</strong> de {plan.duracion}</>
                )}
                {dentro && diaHoy <= 0 && <> · la obra arranca en {Math.abs(diaHoy) + 1} días</>}
              </>
            ) : "Sin actividades todavía"}
          </div>
        </div>
        {todas.length > 0 && (
          <div style={{ display: "flex", gap: 7, alignItems: "center", marginLeft: "auto" }}>
            {/* El acercamiento. Un cronograma de ocho meses entero no se
                puede leer: lo que se mira es el mes que viene, de cerca. */}
            <div style={{ display: "inline-flex", gap: 3, background: colors.neutralSoft, borderRadius: 7, padding: 3 }}>
              {[["−", -1, "Ver más plazo de una vez"], ["+", 1, "Acercar: barras más anchas"]].map(([l, dir, t]) => {
                const pasos = [5, 8, 14, 24, 40];
                const i = pasos.indexOf(zoom) < 0 ? 2 : pasos.indexOf(zoom);
                const tope = dir < 0 ? i === 0 : i === pasos.length - 1;
                return (
                  <button key={l} title={t} disabled={tope}
                    onClick={() => setZoom(pasos[Math.max(0, Math.min(pasos.length - 1, i + dir))])}
                    style={{ width: 26, padding: "4px 0", borderRadius: 5, border: "none",
                      cursor: tope ? "default" : "pointer", fontFamily: colors.font, fontSize: 13, fontWeight: 700,
                      background: tope ? "transparent" : "#fff", color: tope ? colors.border : colors.inkSoft }}>{l}</button>
                );
              })}
            </div>
            <div style={{ display: "inline-flex", gap: 3, background: colors.neutralSoft, borderRadius: 7, padding: 3 }}>
              {[["fecha", "Fechas"], ["dia", "Días"]].map(([v, l]) => (
                <button key={v} onClick={() => setEscala(v)}
                  style={{ padding: "4px 10px", borderRadius: 5, border: "none", cursor: "pointer", fontFamily: colors.font,
                    fontSize: 11.5, fontWeight: 600, background: escala === v ? "#fff" : "transparent",
                    color: escala === v ? colors.brand : colors.inkSoft }}>{l}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* EL PLAZO DEL PROYECTO, con nombre y en un recuadro.
          Estaban como dos campos sueltos al costado del título, sin etiqueta,
          y no se encontraban — con razón: un dato que manda sobre dos
          cronogramas no puede verse como un control de esta pantalla. Acá
          dice qué es, y dice dónde aplica, porque eso es justo lo que uno
          necesita saber antes de tocarlo. */}
      {editable && (
        <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd,
          padding: "10px 12px", marginBottom: 12, display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label style={{ fontSize: 9.5, fontWeight: 700, color: colors.muted, letterSpacing: 0.3, display: "block", marginBottom: 3 }}>
              ARRANCA
            </label>
            <input type="date" value={lead.crono_inicio || hoy()}
              style={{ ...inputStyle, width: 152, padding: "6px 9px", fontSize: 12 }}
              onChange={async e => {
                const err = await guardarPlazo(lead.id, { inicio: e.target.value });
                if (err) { setError(err); return; }
                setError("");
                setLead(l => ({ ...l, crono_inicio: e.target.value }));
              }} />
          </div>
          {/* TERMINA, por fecha. Un contrato de obra casi nunca dice "ocho
              meses": dice "hasta el 15 de noviembre". Traducir esa fecha a
              meses a ojo mete días de diferencia justo en el número contra el
              que se mide todo el cronograma.

              Los dos campos escriben lo mismo y se siguen: poner la fecha
              calcula los meses y poner los meses calcula la fecha. Manda la
              fecha cuando está, porque es la que alguien escribió a mano. */}
          <div>
            <label style={{ fontSize: 9.5, fontWeight: 700, color: colors.muted, letterSpacing: 0.3, display: "block", marginBottom: 3 }}>
              TERMINA
            </label>
            <input type="date" value={finPuesto || ""}
              style={{ ...inputStyle, width: 152, padding: "6px 9px", fontSize: 12 }}
              onChange={async e => {
                const f = e.target.value || null;
                const arranque = lead.crono_inicio || hoy();
                if (f && f < arranque) { setError("La fecha de terminación no puede ser antes del arranque."); return; }
                const m = f ? Math.max(1, Math.round(mesesEntre(arranque, f))) : null;
                const err = await guardarPlazo(lead.id, { fin: f, meses: m });
                if (err) { setError(err); return; }
                setError("");
                setLead(l => ({ ...l, crono_fin: f, crono_meses: m }));
              }} />
          </div>
          <div>
            <label style={{ fontSize: 9.5, fontWeight: 700, color: colors.muted, letterSpacing: 0.3, display: "block", marginBottom: 3 }}>
              O DURA (MESES)
            </label>
            <Numero value={lead.crono_meses ?? null} min={1} max={120} vacio={null} placeholder="—"
              style={{ width: 82, padding: "6px 9px", fontSize: 12 }}
              onCommit={async m => {
                const f = m ? finDeMeses(lead.crono_inicio || hoy(), m) : null;
                const err = await guardarPlazo(lead.id, { meses: m, fin: f });
                if (err) { setError(err); return; }
                setError("");
                setLead(l => ({ ...l, crono_meses: m, crono_fin: f }));
              }} />
          </div>

          {/* QUÉ DÍAS SE TRABAJA. El motor lo sabía desde siempre y no había
              cómo decírselo: toda obra quedaba en lunes a sábado. No es un
              detalle —entre seis días y cinco hay un 17% de calendario, y en
              una obra de ocho meses eso son más de treinta días—. */}
          <div>
            <label style={{ fontSize: 9.5, fontWeight: 700, color: colors.muted, letterSpacing: 0.3, display: "block", marginBottom: 3 }}>
              SE TRABAJA
            </label>
            <div style={{ display: "flex", gap: 3 }}>
              {JORNADAS.map(j => {
                const puesta = JSON.stringify(laborablesHoy) === JSON.stringify(j.dias);
                return (
                  <button key={j.id} title={j.pista}
                    onClick={async () => {
                      const err = await guardarPlazo(lead.id, { laborables: j.dias });
                      if (err) { setError(err); return; }
                      setError("");
                      setLead(l => ({ ...l, crono_laborables: j.dias }));
                    }}
                    style={{ border: `1px solid ${puesta ? colors.brand : colors.border}`,
                      background: puesta ? colors.brandSoft : "#fff",
                      color: puesta ? colors.brand : colors.inkSoft, borderRadius: colors.radiusSm,
                      padding: "6px 9px", fontSize: 11.5, fontWeight: puesta ? 700 : 400,
                      cursor: "pointer", fontFamily: colors.font, whiteSpace: "nowrap" }}>
                    {j.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ fontSize: 11, color: colors.muted, lineHeight: 1.5, flex: 1, minWidth: 220 }}>
            <strong style={{ color: colors.inkSoft }}>El plazo del proyecto.</strong> Se escribe una sola vez acá y lo
            usan este cronograma y el cronograma valorado del control de obra. Escribilo y apretá Enter.
            {diasDeContrato > 0 && <> Son <strong style={{ color: colors.inkSoft }}>{diasDeContrato} días de trabajo</strong>
              {" "}con la jornada puesta.</>}
          </div>

          {/* EL PLAN CONTRA EL CONTRATO.
              El plazo no sale de sumar actividades: lo dice el contrato. Que
              el plan dé otra cosa es normal al armarlo; lo que no puede pasar
              es que nadie lo diga, porque entonces el cronograma promete una
              fecha y el contrato otra, y la que manda es la del contrato. */}
          {desvio !== 0 && (
            <div style={{ flexBasis: "100%", borderTop: `1px solid ${colors.neutralSoft}`, paddingTop: 9,
              display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ fontSize: 11.5, color: colors.ink, lineHeight: 1.5, flex: 1, minWidth: 240 }}>
                El cronograma sale en <strong>{plan.duracion} días</strong> y el plazo son{" "}
                <strong>{diasDeContrato}</strong>:{" "}
                <strong style={{ color: desvio > 0 ? colors.danger : colors.brand }}>
                  {desvio > 0 ? `${desvio} días de más` : `${-desvio} días de menos`}
                </strong>
                {desvio > 0 ? " que el contrato." : " que el contrato, así que sobra tiempo."}
              </div>
              <Button variant={desvio > 0 ? "primary" : "outline"} size="sm" disabled={pensando}
                onClick={async () => {
                  if (!window.confirm(
                    `¿Ajustar las duraciones para que la obra entre en ${diasDeContrato} días?\n\n` +
                    "Se estiran o encogen todas en proporción. No se tocan las dependencias ni los traslapes: " +
                    "qué va antes que qué es una decisión de obra y no se cambia para cuadrar un número.")) return;
                  setPensando(true);
                  const { cambios, dias } = ajustarAlPlazo({
                    actividades, dependencias, objetivo: diasDeContrato,
                    inicio: lead.crono_inicio || hoy(), cal,
                  });
                  for (const c of cambios) {
                    await supabase.from("cronograma_actividades").update({ duracion: c.duracion }).eq("id", c.id);
                  }
                  setPensando(false);
                  if (!cambios.length) setError("No hay cómo ajustarlo más: las actividades ya están en su mínimo.");
                  else setError("");
                  await cargar();
                  void dias;
                }}>Ajustar al plazo</Button>
            </div>
          )}
        </div>
      )}

      {/* LO QUE NOVA PROPONE, de a una.
          Un parche entero aceptado a ciegas es volver a rehacer el cronograma
          con otro nombre. Cada operación dice QUÉ cambia y POR QUÉ, y se
          aplica sola: lo que no convence se descarta y no pasa nada. */}
      {revision && (
        <div style={{ background: colors.surface, border: `1px solid ${colors.brand}`,
          borderRadius: colors.radiusMd, padding: "11px 13px", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <Sparkles size={13} color={colors.brand} />
            <strong style={{ fontSize: 12.5, color: colors.ink }}>
              NOVA propone {revision.ops.length} {revision.ops.length === 1 ? "cambio" : "cambios"}
            </strong>
            <span style={{ flex: 1 }} />
            <Button variant="secondary" size="sm" onClick={() => setRevision(null)}>Cerrar</Button>
          </div>
          {/* La nota, en su propio renglón y entera. Es donde NOVA dice lo que
              NO pudo traducir —"no hay una barra para el desmontaje eléctrico"—
              y eso suele valer más que las operaciones que sí propuso: avisa de
              algo que falta en el cronograma. Apretada contra el título se
              leía cortada. */}
          {revision.nota && (
            <div style={{ fontSize: 11.5, color: colors.inkSoft, lineHeight: 1.55, marginBottom: 8,
              background: colors.bg, borderRadius: 7, padding: "7px 9px" }}>
              {revision.nota}
            </div>
          )}
          <div style={{ display: "grid", gap: 5 }}>
            {revision.ops.map((x, k) => {
              const nombre = id => todas.find(a => a.id === id)?.nombre || `#${id}`;
              const dice = x.tipo === "ajustar"
                  ? `«${nombre(x.id)}» pasa a ${x.duracion} días`
                : x.tipo === "encadenar"
                  ? `«${nombre(x.a)}» va después de «${nombre(x.de)}»${x.retardo ? ` con ${x.retardo > 0 ? "+" : ""}${x.retardo} días` : ""}${x.enlace && x.enlace !== "FC" ? ` (${x.enlace})` : ""}`
                : x.tipo === "desencadenar"
                  ? `Soltar: «${nombre(x.a)}» deja de esperar a «${nombre(x.de)}»`
                : x.tipo === "reordenar"
                  ? `«${nombre(x.id)}» va antes de «${nombre(x.antes_de)}»`
                  : `Partir «${nombre(x.id)}»: agregarle «${x.nombre}», ${x.dias} días, ${x.peso}% de su plata`;
              return (
                <div key={k} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
                  padding: "6px 9px", border: `1px solid ${colors.border}`, borderRadius: colors.radiusSm }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: 12, color: colors.ink }}>{dice}</div>
                    {x.porque && <div style={{ fontSize: 11, color: colors.muted }}>{x.porque}</div>}
                  </div>
                  <Button variant="primary" size="sm" disabled={pensando} onClick={async () => {
                    setPensando(true); setError("");
                    let err = null;
                    if (x.tipo === "ajustar") {
                      const r = await supabase.from("cronograma_actividades")
                        .update({ duracion: x.duracion }).eq("id", x.id);
                      err = r.error?.message || null;
                    } else if (x.tipo === "encadenar") {
                      // REEMPLAZA SI YA EXISTE, no inserta a ciegas.
                      //
                      // Dos actividades solo pueden estar unidas una vez —la
                      // base lo exige— y casi siempre el enlace que propone
                      // NOVA es un CAMBIO del que ya está: "este CC reemplaza
                      // el FC -8d". Insertando sin más, la base rechazaba la
                      // operación con un error de llave duplicada y lo que la
                      // pantalla mostraba era eso, en inglés, sin decir qué
                      // hacer.
                      const campos = { tipo: x.enlace || "FC", retardo: x.retardo };
                      const upd = await supabase.from("cronograma_dependencias")
                        .update(campos).eq("actividad_id", x.a).eq("depende_de_id", x.de).select();
                      if (upd.error) err = upd.error.message;
                      else if (!upd.data?.length) {
                        const ins = await supabase.from("cronograma_dependencias")
                          .insert({ actividad_id: x.a, depende_de_id: x.de, ...campos });
                        err = ins.error?.message || null;
                      }
                    } else if (x.tipo === "desencadenar") {
                      const r = await supabase.from("cronograma_dependencias")
                        .delete().eq("actividad_id", x.a).eq("depende_de_id", x.de);
                      err = r.error?.message || null;
                    } else if (x.tipo === "partir") {
                      // PARTIR UNA BARRA para darle lugar a un trabajo que no
                      // tiene actividad propia: el desmontaje eléctrico, el
                      // paso de tubería, los picados. No son rubros del
                      // presupuesto —viven adentro de su capítulo— y sin esto
                      // quedaban afuera del cronograma aunque alguien los
                      // nombrara.
                      //
                      // No rompe el espejo con el control: la agrupación sigue
                      // siendo la misma, lo que cambia es que adentro tiene dos
                      // momentos en vez de uno.
                      const madre = todas.find(a => a.id === x.id);
                      if (!madre) { err = "Esa actividad ya no existe."; }
                      else {
                        const base = String(madre.nombre || "").split(" · ")[0];
                        const quedaba = Number(madre.peso_pct ?? 100);
                        const { data: creada, error: e1 } = await supabase.from("cronograma_actividades")
                          .insert({
                            lead_id: lead.id, obra_id: lead.obra_id || null,
                            obra_actividad_id: madre.obra_actividad_id,
                            nombre: `${base} · ${x.nombre}`.slice(0, 120),
                            duracion: x.dias, etapa: "ejecucion",
                            // La plata sale de la barra que se parte, no se
                            // inventa: entre las dos siguen sumando lo que la
                            // agrupación tenía, o el valorado deja de dar el
                            // presupuesto.
                            peso_pct: madre.obra_actividad_id ? x.peso : null,
                            orden: (madre.orden ?? 0) + (x.primero ? -1 : 1),
                          }).select().single();
                        if (e1) err = e1.message;
                        else {
                          if (madre.obra_actividad_id) {
                            // Lo que le queda a la barra original. Se recalcula
                            // sobre lo que tiene AHORA, no sobre lo que tenía
                            // al abrir el panel: partir en tres etapas son tres
                            // operaciones seguidas sobre la misma barra, y
                            // tomando siempre el valor viejo la segunda y la
                            // tercera le restarían a un número ya gastado.
                            const { data: hoy } = await supabase.from("cronograma_actividades")
                              .select("peso_pct").eq("id", madre.id).maybeSingle();
                            const tiene = Number(hoy?.peso_pct ?? quedaba);
                            await supabase.from("cronograma_actividades")
                              .update({ peso_pct: Math.max(0, Math.round((tiene - x.peso) * 100) / 100) })
                              .eq("id", madre.id);
                          }
                          // En fila: un desmontaje va ANTES de lo que estaba;
                          // lo que se agrega al final va después.
                          const de = x.primero ? creada.id : madre.id;
                          const a = x.primero ? madre.id : creada.id;
                          await supabase.from("cronograma_dependencias")
                            .insert({ actividad_id: a, depende_de_id: de, tipo: "FC", retardo: 0 });
                        }
                      }
                    } else {
                      // Reordenar: se le da el lugar de la otra y a la otra el suyo.
                      const yo = todas.find(a => a.id === x.id);
                      const otra = todas.find(a => a.id === x.antes_de);
                      if (yo && otra) {
                        const [e1, e2] = await Promise.all([
                          supabase.from("cronograma_actividades").update({ orden: otra.orden ?? 0 }).eq("id", yo.id),
                          supabase.from("cronograma_actividades").update({ orden: yo.orden ?? 0 }).eq("id", otra.id),
                        ]);
                        err = (e1.error || e2.error)?.message || null;
                      }
                    }
                    setPensando(false);
                    if (err) { setError(err); return; }
                    setRevision(r => ({ ...r, ops: r.ops.filter((_, i) => i !== k) }));
                    await cargar();
                  }}>Aplicar</Button>
                  <Button variant="secondary" size="sm"
                    onClick={() => setRevision(r => ({ ...r, ops: r.ops.filter((_, i) => i !== k) }))}>
                    No
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* LAS VERSIONES.
          Un cronograma vive: se corrige, se traslapa, se acomoda cuando entra
          una orden de cambio. Eso está bien —uno que no cambia es uno que nadie
          usa— pero deja sin respuesta la pregunta que importa: ¿cuánto nos
          corrimos? Hoy "vamos quince días atrasados" es una impresión, y para
          justificar un atraso o pedir una ampliación de plazo una impresión no
          sirve.

          Se guarda una foto y se COMPARA. No se restaura: volver atrás borraría
          el avance ya cargado, y lo que hace falta no es deshacer sino medir. */}
      {todas.length > 0 && editable && (
        <div style={{ background: colors.surface, border: `1px solid ${colors.border}`,
          borderRadius: colors.radiusMd, padding: "10px 12px", marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap" }}>
            <Button variant="outline" size="sm" disabled={pensando} onClick={async () => {
              // El motivo se escribe en el campo de al lado y no en un cuadrito
              // del navegador: muchos navegadores los bloquean sin avisar, y
              // entonces el botón se aprieta y no pasa nada.
              const motivo = motivoVersion.trim();
              if (!motivo && !window.confirm(
                "¿Guardar esta versión sin motivo?\n\n"
                + "El motivo importa más que la fecha: \"antes de la orden de cambio 3\" o \"lo que se "
                + "firmó con el cliente\" convierte una lista de fechas en una historia. Sin él, dentro de "
                + "tres meses son seis versiones indistinguibles.")) return;
              const base = !versiones.some(v => v.es_linea_base)
                && window.confirm("¿Es la LÍNEA BASE?\n\nEs la que se firmó, contra la que se mide todo lo demás. Hay una sola por obra.");
              setPensando(true); setError("");
              const r = await guardarVersion({
                lead, obra: { id: lead.obra_id }, actividades: todas, dependencias,
                plan, motivo, lineaBase: base, quien: currentUser,
              });
              setPensando(false);
              if (r.error) { setError(r.error); return; }
              setMotivoVersion("");
              setVersiones(await versionesDe(lead.id));
            }}><CalendarClock size={13} /> Guardar esta versión</Button>
            <input value={motivoVersion} onChange={e => setMotivoVersion(e.target.value)}
              placeholder="¿Por qué? Ej: antes de la orden de cambio 3"
              title="El motivo es lo que después deja distinguir seis versiones entre sí"
              style={{ ...inputStyle, flex: 1, minWidth: 190, fontSize: 12, padding: "5px 8px", height: 30 }} />

            {versiones.length === 0 ? (
              <span style={{ fontSize: 11, color: colors.muted, flex: 1, minWidth: 220, lineHeight: 1.45 }}>
                Todavía no hay ninguna guardada. La primera conviene guardarla ahora, antes de que la obra
                empiece a moverla: es contra lo que después se mide el atraso.
              </span>
            ) : (
              <span style={{ fontSize: 11, color: colors.muted }}>
                {versiones.length} {versiones.length === 1 ? "versión guardada" : "versiones guardadas"}
              </span>
            )}
          </div>

          {versiones.length > 0 && (
            <div style={{ marginTop: 8, display: "grid", gap: 4 }}>
              {versiones.map(v => (
                <div key={v.id} style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap",
                  padding: "6px 9px", borderRadius: colors.radiusSm,
                  background: comparando?.id === v.id ? colors.brandSoft : colors.bg }}>
                  <span style={{ fontSize: 11.5, color: colors.ink, minWidth: 92 }}>
                    {new Date(v.created_at).toLocaleDateString("es-EC", { day: "numeric", month: "short", year: "2-digit" })}
                  </span>
                  {v.es_linea_base && (
                    <span style={{ fontSize: 9.5, fontWeight: 700, color: colors.brand,
                      background: colors.brandSoft, borderRadius: 10, padding: "1px 7px" }}>LÍNEA BASE</span>
                  )}
                  <span style={{ flex: 1, minWidth: 140, fontSize: 11.5, color: colors.inkSoft,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {v.motivo || "sin motivo"}
                  </span>
                  {v.dias != null && <span style={{ fontSize: 10.5, color: colors.muted }}>{v.dias} días</span>}
                  <Button variant="outline" size="sm" disabled={pensando} onClick={async () => {
                    if (comparando?.id === v.id) { setComparando(null); return; }
                    setPensando(true);
                    const foto = await fotoDeVersion(v.id);
                    setPensando(false);
                    if (!foto) { setError("No se pudo leer esa versión."); return; }
                    setComparando({ id: v.id, version: v, r: comparar(foto, todas, dependencias) });
                  }}>{comparando?.id === v.id ? "Cerrar" : "Comparar"}</Button>
                  {!v.es_linea_base && (
                    <button onClick={async () => {
                      if (!window.confirm("¿Borrar esta versión guardada?")) return;
                      const err = await borrarVersion(v.id);
                      if (err) { setError(err); return; }
                      if (comparando?.id === v.id) setComparando(null);
                      setVersiones(await versionesDe(lead.id));
                    }} style={{ background: "none", border: "none", color: colors.border,
                      cursor: "pointer", display: "flex" }}><Trash2 size={12} /></button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* QUÉ CAMBIÓ desde esa foto.
          El número de arriba es el que se dice en una reunión; abajo, las que
          explican ese número. Y se separan las CRÍTICAS de las demás: una barra
          con colchón que se corrió tres días no atrasó la obra, y meterla en la
          misma lista que las que sí la atrasaron hace que la lista no se lea. */}
      {comparando && (
        <div style={{ background: colors.surface, border: `1px solid ${colors.brand}`,
          borderRadius: colors.radiusMd, padding: "11px 13px", marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", marginBottom: 9 }}>
            <strong style={{ fontSize: 13, color: colors.ink }}>
              Contra {comparando.version.es_linea_base ? "la línea base" : "esa versión"}
            </strong>
            <span style={{ fontSize: 11.5, color: colors.muted }}>{comparando.version.motivo || ""}</span>
            <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700,
              color: !comparando.r.corrimientoObra ? colors.success
                : comparando.r.corrimientoObra > 0 ? colors.danger : colors.success }}>
              {comparando.r.corrimientoObra == null ? "—"
                : comparando.r.corrimientoObra === 0 ? "La obra termina el mismo día"
                : comparando.r.corrimientoObra > 0
                  ? `La obra se corrió ${comparando.r.corrimientoObra} días`
                  : `La obra se adelantó ${Math.abs(comparando.r.corrimientoObra)} días`}
            </span>
          </div>

          <div style={{ fontSize: 11.5, color: colors.muted, marginBottom: 8, lineHeight: 1.5 }}>
            {comparando.r.finAntes && comparando.r.finAhora
              && <>Terminaba el {comparando.r.finAntes} y ahora el {comparando.r.finAhora}. </>}
            {comparando.r.movidas.length} {comparando.r.movidas.length === 1 ? "barra se movió" : "barras se movieron"}
            {comparando.r.nuevas.length > 0 && `, ${comparando.r.nuevas.length} nuevas`}
            {comparando.r.borradas.length > 0 && `, ${comparando.r.borradas.length} ya no están`}.
          </div>

          {comparando.r.criticasMovidas.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 9.5, fontWeight: 700, color: colors.danger, letterSpacing: 0.3, marginBottom: 3 }}>
                EN LA RUTA CRÍTICA — ESTAS SON LAS QUE ATRASAN LA OBRA
              </div>
              {comparando.r.criticasMovidas.map(l => (
                <div key={l.id} style={{ display: "flex", gap: 9, fontSize: 11.5, padding: "2px 0" }}>
                  <span style={{ flex: 1, minWidth: 0, color: colors.ink, overflow: "hidden",
                    textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.nombre}</span>
                  <span style={{ color: colors.muted }}>{l.fin.antes} → {l.fin.ahora}</span>
                  <span style={{ color: colors.danger, fontWeight: 700, minWidth: 48, textAlign: "right" }}>
                    +{l.corrimientoFin}d
                  </span>
                </div>
              ))}
            </div>
          )}

          {comparando.r.peores.filter(l => !comparando.r.criticasMovidas.includes(l)).length > 0 && (
            <div>
              <div style={{ fontSize: 9.5, fontWeight: 700, color: colors.muted, letterSpacing: 0.3, marginBottom: 3 }}>
                LAS QUE MÁS SE MOVIERON, dentro de su colchón
              </div>
              {comparando.r.peores.filter(l => !comparando.r.criticasMovidas.includes(l)).map(l => (
                <div key={l.id} style={{ display: "flex", gap: 9, fontSize: 11.5, padding: "2px 0" }}>
                  <span style={{ flex: 1, minWidth: 0, color: colors.inkSoft, overflow: "hidden",
                    textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.nombre}</span>
                  <span style={{ color: colors.muted }}>{l.fin.antes} → {l.fin.ahora}</span>
                  <span style={{ minWidth: 48, textAlign: "right", fontWeight: 600,
                    color: l.corrimientoFin > 0 ? colors.warning : colors.success }}>
                    {l.corrimientoFin > 0 ? "+" : ""}{l.corrimientoFin}d
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* LOS PASOS, EN ORDEN.
          Había tres acciones de NOVA compitiendo —"armalo", "ordenalo",
          "revisalo"— una al lado de la otra y sin decir cuál va primero. Quien
          abre el módulo no tiene por qué deducir la secuencia: la pantalla
          tiene que decirla.

          Y el orden invierte quién arma el cronograma, que es lo que de verdad
          cambia. "Que lo arme NOVA" como primera opción promete algo que no se
          puede cumplir: ella no vio el terreno, no conoce las cuadrillas, no
          sabe que la grúa entra en marzo. Lo que sí sabe son los rendimientos y
          el orden de los oficios.

          Entonces: la lista sale del control, el orden lo pone quien dirige, y
          NOVA hace la aritmética. */}
      {editable && obra?.id && (
        <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap", marginBottom: 10, fontSize: 11 }}>
          {[
            // LOS PASOS QUE SON, no los que eran. Describían un camino de
            // cinco escalones que ya no existe —armar del control, después
            // pedirle las duraciones, después revisar la propuesta— y quien
            // lo leía buscaba botones que no están. Un mapa viejo es peor que
            // ninguno: manda a caminar para el lado equivocado.
            ["1", "Que NOVA lo arme", todas.length > 0],
            ["2", "Acomodar etapas y duraciones", todas.some(a => a.nota)],
            ["3", "Encadenar lo que falte", dependencias.length > 0],
            ["4", "Guardar la versión", versiones.length > 0],
          ].map(([n, t, hecho], i) => (
            <span key={n} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              {i > 0 && <span style={{ color: colors.border, marginRight: 2 }}>›</span>}
              <span style={{ width: 16, height: 16, borderRadius: 8, fontSize: 9.5, fontWeight: 700,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                background: hecho ? colors.brand : colors.neutralSoft,
                color: hecho ? "#fff" : colors.muted }}>{hecho ? "✓" : n}</span>
              <span style={{ color: hecho ? colors.inkSoft : colors.muted }}>{t}</span>
            </span>
          ))}
        </div>
      )}

      {/* Que lo arme NOVA: las agrupaciones ya dicen QUÉ hay que hacer, con
          su plata adentro. Lo que falta es el orden y la duración, y eso es
          saber de obra —la estructura antes que la mampostería, las
          instalaciones antes del enlucido o hay que picar—. No sale de ningún
          dato: sale de haber hecho obras. */}
      {editable && obra?.id && (
        armando ? (
          /* ARMARLO ES UNA SOLA COSA Y SE HACE DE CORRIDO.
             Antes eran dos botones y un paso intermedio: NOVA proponía, uno
             miraba una lista de catorce nombres que no decía nada, y recién
             ahí se guardaba. Esa revisión no servía —no se puede juzgar un
             cronograma sin ver las barras— y a cambio dejaba la propuesta
             colgando de la pantalla: si se cerraba, se perdía.

             Ahora se arma y se guarda, y se revisa en la tabla, que es donde
             de verdad se revisa. Si algo sale mal a mitad de camino, lo
             anterior ya está guardado y se ve qué paso falló. */
          <div style={{ background: colors.surface, border: `1px solid ${colors.brand}`, borderRadius: colors.radiusMd, padding: 12, marginBottom: 12, display: "grid", gap: 9 }}>
            <div style={{ fontSize: 12.5, color: colors.ink, fontWeight: 600 }}>
              Que NOVA arme el cronograma
            </div>
            {!lead.crono_meses ? (
              <div style={{ fontSize: 11.5, color: colors.warning, lineHeight: 1.5 }}>
                Primero poné cuántos meses dura la obra, arriba en el plazo del proyecto: es contra ese número
                que se arma.
              </div>
            ) : (
              <div style={{ fontSize: 11.5, color: colors.muted, lineHeight: 1.5 }}>
                NOVA parte la obra en <strong style={{ color: colors.ink }}>etapas</strong> —preliminares, obra
                gris, instalaciones, acabados— y adentro de cada una pone los trabajos, con su duración sacada
                de las cantidades del presupuesto. También los que no son rubros de nadie: el desmontaje, el
                replanteo, las pruebas, la limpieza. Entra en el plazo de{" "}
                <strong style={{ color: colors.ink }}>{lead.crono_meses} meses</strong>
                {diasDeContrato > 0 && <> · {diasDeContrato} días de trabajo</>}.
              </div>
            )}

            {/* DE DÓNDE SALE EL CRONOGRAMA.
                Venía forzado: cada agrupación del presupuesto tenía que
                aparecer una vez, así que el cronograma terminaba siendo el
                presupuesto puesto de costado por más etapas que le pusiera
                encima. Es una regla buena cuando lo que se quiere es que el
                control y el valorado cierren, y es una jaula cuando lo que se
                quiere es un cronograma que se parezca a la obra. No es una
                decisión que pueda tomar yo: cambia según para qué es. */}
            {obra?.id && (
              <div>
                <label style={{ fontSize: 9.5, fontWeight: 700, color: colors.muted, letterSpacing: 0.3, display: "block", marginBottom: 4 }}>
                  DE DÓNDE SALE
                </label>
                <div style={{ display: "grid", gap: 4 }}>
                  {[
                    [false, "Como se construye la obra",
                      "NOVA escribe los trabajos que de verdad hay que hacer, con nombres de obra. Mira el presupuesto para saber el tamaño y el alcance, pero no lo copia: puede juntar tres agrupaciones en un trabajo, partir una en cuatro, o poner trabajos que no están en ninguna."],
                    [true, "Cubriendo el presupuesto",
                      "Cada agrupación del control aparece una vez y ninguna se pierde. Es lo que hace falta para que el valorado reparta toda la plata en el tiempo, y el cronograma se parece más al presupuesto que a la obra."],
                  ].map(([valor, titulo, pista]) => (
                    <label key={titulo} style={{ display: "flex", gap: 7, alignItems: "flex-start", cursor: "pointer",
                      background: !!armando.cubrir === valor ? colors.brandSoft : colors.bg,
                      border: `1px solid ${!!armando.cubrir === valor ? colors.brand : "transparent"}`,
                      borderRadius: 7, padding: "7px 9px" }}>
                      <input type="radio" checked={!!armando.cubrir === valor} style={{ marginTop: 2 }}
                        onChange={() => setArmando(v => ({ ...v, cubrir: valor }))} />
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: colors.ink }}>{titulo}</span>
                        <span style={{ display: "block", fontSize: 11, color: colors.muted, lineHeight: 1.45 }}>{pista}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* LO QUE SOLO SABE QUIEN DIRIGE LA OBRA.
                "Hay que desmontar todo lo que hay", "el aire acondicionado
                llega en diciembre", "la planta alta se entrega primero". Nada
                de eso está en el presupuesto ni en ningún dato, y es lo que
                separa un cronograma genérico de este cronograma. */}
            <div>
              <label style={{ fontSize: 9.5, fontWeight: 700, color: colors.muted, letterSpacing: 0.3, display: "block", marginBottom: 3 }}>
                CONTALE CÓMO VA ESTA OBRA — OPCIONAL, PERO ES LO QUE MÁS CAMBIA EL RESULTADO
              </label>
              <textarea value={armando.comoVa || ""} rows={3}
                onChange={e => setArmando(v => ({ ...v, comoVa: e.target.value }))}
                placeholder="Ej: primero hay que desmontar todo lo que hay adentro. El aire acondicionado llega recién en diciembre. La planta alta se entrega antes que la baja."
                style={{ ...inputStyle, width: "100%", fontSize: 12, lineHeight: 1.5, resize: "vertical", padding: "7px 9px" }} />
            </div>

            {armando.pasos?.length > 0 && (
              <div style={{ background: colors.bg, borderRadius: 8, padding: 10, display: "grid", gap: 4 }}>
                {armando.pasos.map((p, i) => (
                  <div key={i} style={{ fontSize: 12, color: p.mal ? colors.danger : colors.ink }}>
                    {p.mal ? "·" : "✓"} {p.texto}
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Button variant="primary" size="sm" disabled={pensando || !lead.crono_meses}
                onClick={async () => {
                  const paso = (texto, mal) => setArmando(v => ({ ...v, pasos: [...(v.pasos || []), { texto, mal }] }));
                  setError(""); setPensando(true);
                  setArmando(v => ({ ...v, pasos: [] }));
                  const mp = await materiaPrima(obra.id);
                  const r = await proponerPlan({
                    agrupaciones: mp, meses: lead.crono_meses, dias: diasDeContrato,
                    nombreObra: lead.nombre, comoVa: armando.comoVa || "", cal,
                    cubrirPresupuesto: !!armando.cubrir,
                  });
                  if (r.error) { setPensando(false); setError(r.error); return; }
                  paso(`El plan: ${r.plan.etapas.length} etapas y ${r.plan.barras} actividades.`);
                  if (r.plan.faltantes.length) {
                    paso(`${r.plan.faltantes.length} agrupaciones quedaron en "Sin ubicar": hay que mirarlas.`, true);
                  }
                  if (r.cortado) paso("La respuesta vino cortada: guardé lo que llegó entero.", true);

                  const g = await guardarPlan({
                    lead, obra, plan: r.plan, quien: currentUser,
                    cubrePresupuesto: !!armando.cubrir,
                  });
                  if (g.error) { setPensando(false); setError(g.error); return; }
                  paso(`Guardado: ${g.creadas.length} barras${g.sinEtapas ? " (sin etapas: falta la migración 101)" : ` en ${g.etapas} etapas`}.`);

                  const o = await guardarOrden({
                    actividades: g.creadas, dias: diasDeContrato, nombreObra: lead.nombre, cal,
                  });
                  if (o.error) paso(`El orden no se pudo: ${o.error} — las barras ya están, encadenalas vos o volvé a pedirlo.`, true);
                  else paso(`El orden: ${o.creadas} dependencias.`);

                  setPensando(false);
                  await Promise.all([cargar(), cargarFases()]);
                  setAviso("Cronograma armado. Revisalo abajo: lo que esté mal se corrige escribiendo encima.");
                }}>
                {pensando ? "NOVA está armando la obra…" : todas.length ? "Armarlo de nuevo" : "Armarlo"}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setArmando(null)}>Cerrar</Button>
            </div>

            {/* SI YA LO TENÉS ESCRITO, PEGALO.
                Hay una manera de armar un cronograma que funciona y que no es
                esta app: pensarlo en palabras. Queda una lista de etapas con
                sus trabajos y sus días, que ya es el trabajo difícil hecho, y
                hasta ahora no había forma de meterla acá sin volver a
                escribirla barra por barra. NOVA no opina sobre esto: lee. Los
                días que estén escritos quedan tal cual. */}
            <div style={{ borderTop: `1px solid ${colors.neutralSoft}`, paddingTop: 9 }}>
              {!armando.pegando ? (
                <button onClick={() => setArmando(v => ({ ...v, pegando: true }))}
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer",
                    fontFamily: colors.font, fontSize: 11.5, color: colors.brand, textDecoration: "underline" }}>
                  ¿Ya tenés el cronograma escrito en otro lado? Pegalo acá
                </button>
              ) : (
                <div style={{ display: "grid", gap: 7 }}>
                  <div style={{ fontSize: 11.5, color: colors.muted, lineHeight: 1.5 }}>
                    Pegá las etapas con sus trabajos y sus días, como los tengas escritos. NOVA no lo cambia:
                    lo lee y lo convierte en barras. <strong style={{ color: colors.ink }}>Los días que estén
                    escritos quedan tal cual</strong>, y si alguno no tiene, le pone uno y te lo dice.
                  </div>
                  <textarea value={armando.texto || ""} rows={7}
                    onChange={e => setArmando(v => ({ ...v, texto: e.target.value }))}
                    placeholder={"ETAPA 1 — PRELIMINARES\n  Desmontaje de instalaciones existentes — 5 días\n  Replanteo y trazado — 2 días\n\nETAPA 2 — OBRA GRIS\n  Mampostería — 15 días\n  ..."}
                    style={{ ...inputStyle, width: "100%", fontSize: 12, lineHeight: 1.5, resize: "vertical",
                      padding: "7px 9px", fontFamily: "ui-monospace, monospace" }} />
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <Button variant="primary" size="sm" disabled={pensando || (armando.texto || "").trim().length < 20}
                      onClick={async () => {
                        const paso = (texto, mal) => setArmando(v => ({ ...v, pasos: [...(v.pasos || []), { texto, mal }] }));
                        setError(""); setPensando(true);
                        setArmando(v => ({ ...v, pasos: [] }));
                        const mp = obra?.id ? await materiaPrima(obra.id) : [];
                        const r = await leerCronogramaEscrito({
                          texto: armando.texto, agrupaciones: mp, dias: diasDeContrato, cal,
                        });
                        if (r.error) { setPensando(false); setError(r.error); return; }
                        paso(`Leído: ${r.plan.etapas.length} etapas y ${r.plan.barras} actividades.`);
                        if (r.cortado) paso("Vino cortado: entró lo que llegó entero.", true);
                        const g = await guardarPlan({
                          lead, obra, plan: r.plan, quien: currentUser, cubrePresupuesto: false,
                        });
                        if (g.error) { setPensando(false); setError(g.error); return; }
                        paso(`Guardado: ${g.creadas.length} barras${g.sinEtapas ? " (sin etapas: falta la 101)" : ` en ${g.etapas} etapas`}.`);
                        const o = await guardarOrden({ actividades: g.creadas, dias: diasDeContrato, nombreObra: lead.nombre, cal });
                        if (o.error) paso(`El orden no se pudo: ${o.error}`, true);
                        else paso(`El orden: ${o.creadas} dependencias.`);
                        setPensando(false);
                        await Promise.all([cargar(), cargarFases()]);
                        setAviso("Cronograma cargado desde el texto. Revisalo abajo.");
                      }}>
                      {pensando ? "NOVA está leyéndolo…" : "Leerlo y armarlo"}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setArmando(v => ({ ...v, pegando: false }))}>Cancelar</Button>
                  </div>
                </div>
              )}
            </div>
            {todas.length > 0 && (
              <div style={{ fontSize: 10.5, color: colors.warning }}>
                Ya hay un cronograma: armarlo de nuevo reemplaza las barras que salen del control —con lo que
                les hayas corregido— y las etapas. Lo que agregaste a mano no se toca.
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
            {/* EL CAMINO QUE NO DEPENDE DE NADIE.
                Un cronograma que solo se puede armar preguntándole a un modelo
                es un cronograma que falla cuando el modelo se equivoca, y
                entonces no hay de dónde agarrarse. Acá no hay nada que
                adivinar: la lista son las agrupaciones del control, en su
                orden. Crudo pero correcto, y sobre eso se trabaja. */}
            {/* DOS ACCIONES A LA VISTA Y EL RESTO EN UN MENÚ.
                Había siete botones en fila, varios con nombres parecidos
                —"Ponerlo al día con el control" y "Ordenar como el control"—
                y todos visibles siempre. Una barra así no se lee: se escanea,
                se duda, y se termina apretando el que suena parecido.
                Los que arreglan algo salieron de acá: aparecen DENTRO del
                aviso del problema que arreglan, y solo cuando ese problema
                existe. Lo que queda es lo que uno hace a propósito. */}
            {!todas.length ? (
              <>
                {/* EL BOTÓN QUE ARMA LA OBRA, PRIMERO Y CON SU NOMBRE.
                    Se llamaba "Que NOVA le ponga las duraciones", que es lo
                    que hacía hace tres versiones. Quien tenía el cronograma
                    vacío leía eso y no lo apretaba —con razón: no quería
                    duraciones, quería un cronograma— y entonces la única
                    puerta a todo lo nuevo quedaba sin abrir. */}
                <Button variant="primary" size="sm" disabled={pensando}
                  onClick={() => { setArmando({ cubrir: false }); setError(""); }}>
                  <Sparkles size={13} /> Que NOVA lo arme
                </Button>
                <Button variant="secondary" size="sm" disabled={pensando || !obra?.id} onClick={async () => {
                  if (!window.confirm(
                    "¿Armar el cronograma con las agrupaciones del control de obra?\n\n" +
                    "Una barra por agrupación, en el orden del control, encadenadas una detrás de otra. " +
                    "Las duraciones salen de repartir el plazo según lo que pesa cada una: son un punto de " +
                    "partida para corregir, no una estimación.")) return;
                  await armarDelControl();
                }}>Armarlo del control de obra</Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" disabled={pensando}
                  onClick={() => { setArmando({ cubrir: false }); setError(""); }}>
                  <Sparkles size={13} /> Que NOVA lo arme de nuevo
                </Button>
                <div style={{ position: "relative" }}>
                  <Button variant="outline" size="sm" disabled={pensando} onClick={() => setMenu(m => !m)}>
                    Más <ChevronDown size={12} />
                  </Button>
                  {menu && (
                    <>
                      {/* Un paño invisible: tocar en cualquier lado lo cierra,
                          que es lo que uno intenta hacer. */}
                      <div onClick={() => setMenu(false)}
                        style={{ position: "fixed", inset: 0, zIndex: 20 }} />
                      <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 21,
                        background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 9,
                        boxShadow: "0 8px 24px rgba(0,0,0,.12)", minWidth: 250, overflow: "hidden" }}>
                        {[
                          ["Encadenar todo en orden", "Una detrás de otra, en el orden que están", encadenarTodo],
                          ["Ordenar como el control", "El orden de las agrupaciones del control de obra", async () => {
                            if (!window.confirm(
                              "¿Poner las actividades en el mismo orden que las agrupaciones del control de obra?\n\n" +
                              "Dentro de cada rubro quedan por el momento en que ocurren: anticipo, fabricación, " +
                              "entrega, instalación. No se tocan ni las fechas ni las dependencias.")) return;
                            await ordenarComoElControl();
                          }],
                          ["Bajar para Project", "Para una fiscalización que lo pide en su formato", () => bajarProject({
                            nombre: `Cronograma ${lead.nombre}`, actividades: todas, dependencias,
                            inicio: plan.inicio, fin: plan.fin, cal,
                          })],
                          // APRENDER DE TODA LA OBRA DE UNA VEZ.
                          //
                          // Ya no hace falta para el día a día: cada duración
                          // que alguien corrige se apunta sola, en el momento.
                          // Esto queda para una obra vieja que ya está bien
                          // acomodada y nunca enseñó nada —toda la primera
                          // tanda de obras—, y por eso avisa lo que antes no
                          // avisaba: apunta TODO lo que hay en la pantalla,
                          // incluido lo que propuso NOVA y nadie revisó.
                          ["Aprender de toda esta obra", "Para una obra ya terminada y acomodada", async () => {
                            if (!window.confirm(
                              "¿Apuntar los rendimientos de TODAS las actividades de esta obra?\n\n" +
                              "Cada duración que alguien corrige a mano ya se apunta sola, así que esto " +
                              "sirve para una obra vieja que quedó bien y nunca enseñó nada.\n\n" +
                              "Ojo: apunta todo lo que está en la pantalla, también lo que propuso NOVA y " +
                              "nadie revisó. En una obra que todavía se está armando, eso le enseña sus " +
                              "propios números.")) return;
                            setPensando(true);
                            const mp = obra?.id ? await materiaPrima(obra.id) : [];
                            const n = await aprenderDelCronograma(todas, currentUser, mp);
                            await cargarMemoria();
                            setPensando(false); setError("");
                            window.alert(`NOVA anotó ${n} actividades para la próxima obra: los días, y dónde hay cantidades, el rendimiento por día.`);
                          }],
                          ["Ver lo que NOVA aprendió", `${memoria.length} ${memoria.length === 1 ? "apunte" : "apuntes"} de obras anteriores`,
                            () => setVerMemoria(true)],
                          // PEDIR QUE VIGILE EL PRESUPUESTO. Hace falta en la
                          // obra cuyo cronograma va a sostener el valorado:
                          // ahí una agrupación sin tiempo es plata que no se
                          // puede repartir en los meses. En las demás, lo
                          // único que importa del control son las órdenes.
                          [cubrePresupuesto ? "Dejar de vigilar el presupuesto" : "Vigilar que estén todas las agrupaciones",
                            cubrePresupuesto
                              ? "Vuelve a avisar solo de las órdenes de cambio"
                              : "Avisa si falta alguna agrupación del control. Para cuando el cronograma sostiene el valorado",
                            async () => {
                              const quiero = !cubrePresupuesto;
                              const { error: e } = await supabase.from("leads")
                                .update({ crono_cubre: quiero }).eq("id", lead.id);
                              if (e) { setError(/column|schema cache/i.test(e.message) ? "Falta correr la migración 103." : e.message); return; }
                              setLead(l => ({ ...l, crono_cubre: quiero }));
                              setError("");
                              setAviso(quiero
                                ? "Ahora avisa si falta alguna agrupación del presupuesto en el cronograma."
                                : "Del control solo se avisan las órdenes de cambio.");
                            }],
                        ].map(([label, pista, accion]) => (
                          <button key={label} onClick={async () => { setMenu(false); await accion(); }}
                            style={{ display: "block", width: "100%", textAlign: "left", background: "none",
                              border: "none", borderBottom: `1px solid ${colors.neutralSoft}`, padding: "9px 12px",
                              cursor: "pointer", fontFamily: colors.font }}>
                            <div style={{ fontSize: 12.5, color: colors.ink }}>{label}</div>
                            <div style={{ fontSize: 10.5, color: colors.muted, marginTop: 1 }}>{pista}</div>
                          </button>
                        ))}
                        <button onClick={async () => { setMenu(false); await borrarTodo(); }}
                          style={{ display: "block", width: "100%", textAlign: "left", background: "none",
                            border: "none", padding: "9px 12px", cursor: "pointer", fontFamily: colors.font }}>
                          <div style={{ fontSize: 12.5, color: colors.danger, display: "flex", alignItems: "center", gap: 5 }}>
                            <Trash2 size={12} /> Borrar y empezar de cero
                          </div>
                          <div style={{ fontSize: 10.5, color: colors.muted, marginTop: 1 }}>
                            Se van las barras; el control de obra no se toca
                          </div>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        )
      )}

      {/* DECIRLE CÓMO VA LA OBRA, con palabras.
          El modo que faltaba, y el único donde el conocimiento entra de verdad.
          "Armalo" supone que NOVA sabe de esta obra lo que sabe quien la
          dirige, y no lo sabe: no vio el terreno, no conoce a las cuadrillas,
          no sabe que la grúa entra recién en marzo. "Revisalo" solo mira lo que
          ya está escrito.

          Acá se dicta el orden como se piensa —"la mampostería va detrás de la
          estructura pero puede entrar por planta baja; la ventanería pedila ya
          que tarda ocho semanas"— y NOVA lo traduce a cadenas, traslapes y
          duraciones. SIN TIEMPOS si uno quiere: el orden lo sabe quien dirige
          mucho mejor que las duraciones, y las duraciones salen de las
          cantidades.

          Devuelve operaciones sueltas que se aceptan de a una, igual que la
          revisión: lo que entendió mal se descarta en un clic en vez de quedar
          metido adentro del plan. */}
      {todas.length > 0 && editable && (
        <div style={{ background: colors.surface, border: `1px solid ${colors.border}`,
          borderRadius: colors.radiusMd, padding: "11px 13px", marginBottom: 12 }}>
          <label style={{ fontSize: 9.5, fontWeight: 700, color: colors.muted, letterSpacing: 0.3,
            display: "block", marginBottom: 4 }}>
            DECILE A NOVA CÓMO VA ESTA OBRA
          </label>
          <textarea value={dictado} onChange={e => setDictado(e.target.value)} rows={3}
            placeholder={"La mampostería va detrás de la estructura, pero puede entrar por planta baja cuando arriba todavía se funde.\n"
              + "La ventanería hay que pedirla ya: tarda ocho semanas en llegar.\n"
              + "Los acabados recién con el edificio cerrado."}
            style={{ ...inputStyle, fontSize: 12.5, padding: "8px 10px", resize: "vertical",
              lineHeight: 1.55, fontFamily: colors.font }} />
          <div style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap", marginTop: 7 }}>
            <Button variant="primary" size="sm" disabled={pensando || !dictado.trim()}
              onClick={async () => {
                setPensando(true); setError("");
                const r = await ordenarConPalabras({
                  plan: todas, dependencias, texto: dictado,
                  nombreObra: lead.nombre, dias: diasDeContrato, cal,
                });
                setPensando(false);
                if (r.error) { setError(r.error); return; }
                const ops = [
                  ...r.ajustar.map(x => ({ ...x, tipo: "ajustar" })),
                  ...r.encadenar.map(({ tipo, ...x }) => ({ ...x, enlace: tipo, tipo: "encadenar" })),
                  ...r.desencadenar.map(x => ({ ...x, tipo: "desencadenar" })),
                  ...r.reordenar.map(x => ({ ...x, tipo: "reordenar" })),
                  ...(r.partir || []).map(x => ({ ...x, tipo: "partir" })),
                ];
                if (!ops.length) {
                  window.alert(r.nota || "NOVA no encontró nada que traducir. Probá nombrando las actividades como están en el cronograma.");
                  return;
                }
                setRevision({ ops, nota: r.nota });
              }}>
              <Sparkles size={13} /> {pensando ? "NOVA está leyendo…" : "Que NOVA lo ordene"}
            </Button>
            {dictado.trim() && (
              <Button variant="secondary" size="sm" onClick={() => setDictado("")}>Borrar</Button>
            )}
            <span style={{ fontSize: 11, color: colors.muted, flex: 1, minWidth: 220, lineHeight: 1.45 }}>
              Escribilo como lo pensás, sin formato. Podés no decir ningún tiempo: el orden lo sabés vos,
              las duraciones salen de las cantidades. Lo que proponga se acepta de a una.
            </span>
          </div>
        </div>
      )}

      {/* QUE NOVA REVISE LO QUE YA HAY.
          Distinto de armarlo: esto no borra nada. Hasta acá, si uno trabajaba
          el cronograma y quería una segunda opinión, el único botón era
          "armarlo", que lo tira entero y empieza de cero — o sea que el trabajo
          de corregir duraciones, encadenar y partir en etapas castigaba a quien
          lo hacía. Acá NOVA lee lo que hay, propone operaciones sueltas con su
          porqué, y cada una se acepta o no. */}
      {todas.length > 0 && editable && (
        <div style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <Button variant="outline" size="sm" disabled={pensando} onClick={async () => {
            setPensando(true); setError("");
            const r = await revisarCronograma({
              plan: todas, dependencias, nombreObra: lead.nombre, dias: diasDeContrato, cal,
            });
            setPensando(false);
            if (r.error) { setError(r.error); return; }
            const ops = [
              ...r.ajustar.map(x => ({ ...x, tipo: "ajustar" })),
              // `enlace` y no `tipo`: la etiqueta de la operación pisaría el
              // tipo del enlace que mandó NOVA, y un CC o un FF se guardaría
              // como fin→comienzo sin que nadie lo note.
              ...r.encadenar.map(({ tipo, ...x }) => ({ ...x, enlace: tipo, tipo: "encadenar" })),
              ...r.desencadenar.map(x => ({ ...x, tipo: "desencadenar" })),
              ...r.reordenar.map(x => ({ ...x, tipo: "reordenar" })),
                  ...(r.partir || []).map(x => ({ ...x, tipo: "partir" })),
            ];
            if (!ops.length) {
              window.alert(r.nota || "NOVA no le encontró nada para mejorar.");
              return;
            }
            setRevision({ ops, nota: r.nota });
          }}><Sparkles size={13} /> {pensando ? "NOVA está leyendo…" : "Que NOVA lo revise"}</Button>
          <span style={{ fontSize: 11, color: colors.muted, flex: 1, minWidth: 220, lineHeight: 1.45 }}>
            Lee el cronograma como está —con tus duraciones, cadenas y etapas— y propone mejoras sueltas.
            No borra nada: vos aceptás una por una.
          </span>
        </div>
      )}

      {/* LAS ÓRDENES DE CAMBIO, AVISADAS EN EL CRONOGRAMA.
          Una orden aprobada es trabajo nuevo con fecha, monto y muchas veces
          un impacto de plazo que alguien ya escribió al emitirla. Todo eso
          vive en Control de Obra y el cronograma no lo miraba: la obra seguía
          prometiendo la fecha del contrato mientras acumulaba trabajo que
          nadie puso en el tiempo, y el atraso aparecía cuando ya no se podía
          justificar. Una ampliación de plazo se pide con la orden en la mano
          y en el momento. */}
      {ordenes.length > 0 && todas.length > 0 && (
        <div style={{ fontSize: 12, color: colors.ink, background: colors.warningSoft,
          border: `1px solid ${colors.warningBorder}`, borderRadius: colors.radiusMd,
          padding: "10px 12px", marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <AlertTriangle size={15} color={colors.warning} style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ flex: 1, lineHeight: 1.5 }}>
              <strong>{ordenes.length}</strong> {ordenes.length === 1 ? "orden de cambio aprobada que el cronograma todavía no tomó" : "órdenes de cambio aprobadas que el cronograma todavía no tomó"}:
              <div style={{ marginTop: 4 }}>
                {ordenes.slice(0, 6).map(o => (
                  <div key={o.id} style={{ fontSize: 11.5, color: colors.inkSoft }}>
                    · <strong style={{ color: colors.ink }}>{o.codigo || `OC-${o.numero}`}</strong> {o.titulo}
                    {o.dias_impacto ? <span style={{ color: colors.warning, fontWeight: 600 }}> · la obra declaró {o.dias_impacto} días</span> : null}
                  </div>
                ))}
                {ordenes.length > 6 && <div style={{ fontSize: 11.5, color: colors.muted }}>…y {ordenes.length - 6} más</div>}
              </div>
            </div>
          </div>
          {editable && (
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
              <Button variant="primary" size="sm" disabled={pensando} onClick={async () => {
                setPensando(true); setError("");
                const d = desfase(actividades, agrupaciones, plata, cubrePresupuesto);
                const lineas = await lineasDe(ordenes.map(o => o.id));
                const r = await recalcularPorOrdenes({
                  cambios: d.dePlata, ordenes, lineas, actividades, fases,
                  dias: diasDeContrato, nombreObra: lead.nombre, cal,
                });
                if (r.error) { setPensando(false); setError(r.error); return; }
                const detalle = r.duraciones.map(x => {
                  const a = actividades.find(y => y.id === x.id);
                  return `  · ${a?.nombre}: de ${a?.duracion} a ${x.dias} días${x.porque ? ` — ${x.porque}` : ""}`;
                }).join("\n");
                if (!window.confirm(
                  `${r.dictamen || "NOVA leyó las órdenes."}\n\n`
                  + (detalle ? `${detalle}\n\n` : "Ninguna barra cambia de duración.\n\n")
                  + "Se aplica y las órdenes quedan marcadas como tomadas por el cronograma.")) {
                  setPensando(false); return;
                }
                for (const x of r.duraciones) {
                  await supabase.from("cronograma_actividades")
                    .update({ duracion: x.dias, nota: x.porque }).eq("id", x.id);
                }
                const e = await marcarAplicada(ordenes.map(o => o.id));
                await refrescarMontoRef();
                setPensando(false);
                if (e) { setError(e); return; }
                await Promise.all([cargar(), cargarOrdenes()]);
                setAviso(`${r.dictamen || ""} · ${r.duraciones.length} ${r.duraciones.length === 1 ? "barra cambió" : "barras cambiaron"}.`);
              }}>
                <Sparkles size={13} /> {pensando ? "NOVA está leyéndolas…" : "¿Cuántos días piden estas órdenes?"}
              </Button>
              <Button variant="secondary" size="sm" disabled={pensando} onClick={async () => {
                if (!window.confirm(
                  `¿Marcar ${ordenes.length === 1 ? "esta orden" : `estas ${ordenes.length} órdenes`} como ya contempladas?\n\n`
                  + "Usalo cuando el cronograma ya las tiene adentro, o cuando no mueven el plazo. "
                  + "Deja de avisarte por ellas; no cambia ninguna fecha.")) return;
                const e = await marcarAplicada(ordenes.map(o => o.id));
                if (e) { setError(e); return; }
                setError(""); await cargarOrdenes();
              }}>Ya están contempladas</Button>
            </div>
          )}
        </div>
      )}

      {/* Lo que cambió en las agrupaciones desde que se armó esto. No hay que
          corregirlo a mano: si FOREMAN se puede dar cuenta, avisa. Lo que no
          hace es rehacerlo solo —un cronograma con avance cargado y fechas
          comprometidas no se reescribe porque alguien tocó una agrupación. */}
      {todas.length > 0 && agrupaciones.length > 0 && (() => {
        const d = desfase(actividades, agrupaciones, plata, cubrePresupuesto);
        if (!d.perdidas.length && !d.nuevas.length && !d.renombradas.length
            && !d.dePlata.length && !d.reordenadas) return null;
        return (
          <div style={{ fontSize: 12, color: colors.ink, background: colors.warningSoft,
            border: `1px solid ${colors.warningBorder}`, borderRadius: colors.radiusMd, padding: "10px 12px", marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 7, alignItems: "flex-start", marginBottom: d.nuevas.length && editable ? 7 : 0 }}>
              <AlertTriangle size={13} color={colors.warning} style={{ marginTop: 1, flexShrink: 0 }} />
              <div style={{ lineHeight: 1.55 }}>
                {d.nuevas.length > 0 && (
                  <div>
                    Hay <strong>{d.nuevas.length}</strong> {d.nuevas.length === 1 ? "agrupación nueva" : "agrupaciones nuevas"} en
                    el presupuesto que no están en el cronograma: {d.nuevas.map(a => a.nombre).join(", ")}.
                  </div>
                )}
                {d.renombradas.length > 0 && (
                  <div style={{ marginTop: d.nuevas.length ? 3 : 0 }}>
                    {d.renombradas.length === 1 ? "Una actividad se llama" : `${d.renombradas.length} actividades se llaman`}{" "}
                    distinto que su agrupación en el control de obra: la renombraron, la fusionaron, o la tocó una
                    orden de cambio. Son las mismas cosas con dos nombres, y así los dos documentos dejan de poder
                    compararse.
                  </div>
                )}
                {/* LA PLATA CAMBIÓ Y LA BARRA NO.
                    El caso más común y el único que no se veía: una orden de
                    cambio casi nunca agrega rubros, modifica los que están. */}
                {d.dePlata.length > 0 && (
                  <div style={{ marginTop: d.nuevas.length || d.renombradas.length ? 3 : 0 }}>
                    {d.dePlata.length === 1 ? "Una agrupación cambió" : `${d.dePlata.length} agrupaciones cambiaron`} de
                    monto —órdenes de cambio— y su barra sigue midiendo lo mismo:{" "}
                    {d.dePlata.slice(0, 4).map(c => `${c.nombre} ${c.pct > 0 ? "+" : ""}${c.pct}%`).join(", ")}
                    {d.dePlata.length > 4 ? "…" : ""}. Más plata es más trabajo, y el cronograma está prometiendo una
                    fecha que ya no es cierta.
                  </div>
                )}
                {d.reordenadas && (
                  <div style={{ marginTop: 3 }}>
                    El orden de los rubros no es el del control de obra. Puede ser a propósito —el orden de trabajo no
                    es el del presupuesto— pero conviene saberlo.
                  </div>
                )}
                {d.perdidas.length > 0 && (
                  <div style={{ marginTop: d.nuevas.length ? 3 : 0 }}>
                    Y {d.perdidas.length} {d.perdidas.length === 1 ? "actividad apunta" : "actividades apuntan"} a
                    una agrupación que ya no existe. Siguen calculándose bien; solo perdieron de dónde salía su plata.
                  </div>
                )}
              </div>
            </div>
            {/* QUE NOVA LO ACOMODE, sin rehacerlo.
                Un cronograma recién armado no vale nada; vale después de que
                alguien le corrigió las duraciones, lo encadenó como se trabaja
                y le puso los traslapes. Eso es el trabajo, y rearmarlo de cero
                lo borra. Acá NOVA recibe el plan que ya existe y SOLO lo que
                cambió, y devuelve un parche. */}
            {/* CUÁNTO TIEMPO MÁS PIDE LA ORDEN DE CAMBIO.
                Es la pregunta que de verdad aparece cuando entra una: no "qué
                cambió" —eso ya lo dice el aviso— sino cuántos días más lleva y
                cómo se justifica, que es lo que un cliente aprueba y lo que un
                contrato pide. Solo toca las barras de lo que cambió de monto:
                el resto del cronograma lo acomodó alguien. */}
            {d.dePlata.length > 0 && editable && (
              <Button variant="primary" size="sm" disabled={pensando} style={{ marginRight: 6 }} onClick={async () => {
                setPensando(true); setError("");
                const r = await recalcularPorOrdenes({
                  cambios: d.dePlata, actividades, fases,
                  dias: diasDeContrato, nombreObra: lead.nombre, cal,
                });
                if (r.error) { setPensando(false); setError(r.error); return; }
                if (!r.duraciones.length) {
                  setPensando(false);
                  window.alert(`NOVA no le cambia el tiempo a ninguna barra.\n\n${r.dictamen || "Lo que cambió de monto no cambia cuánto se tarda."}`);
                  await refrescarMontoRef();
                  return;
                }
                const antes = plan.duracion;
                const detalle = r.duraciones.map(x => {
                  const a = actividades.find(y => y.id === x.id);
                  return `  · ${a?.nombre}: de ${a?.duracion} a ${x.dias} días${x.porque ? ` — ${x.porque}` : ""}`;
                }).join("\n");
                if (!window.confirm(
                  `${r.dictamen}\n\n${detalle}\n\n` +
                  "Solo se tocan esas barras. El resto del cronograma no se mueve.")) {
                  setPensando(false); return;
                }
                for (const x of r.duraciones) {
                  await supabase.from("cronograma_actividades")
                    .update({ duracion: x.dias, nota: x.porque }).eq("id", x.id);
                }
                // La plata de referencia se actualiza: el aviso ya cumplió su
                // trabajo y dejarlo prendido lo vuelve ruido.
                await refrescarMontoRef();
                setPensando(false);
                await cargar();
                setAviso(`${r.dictamen} · ${r.duraciones.length} ${r.duraciones.length === 1 ? "barra creció" : "barras cambiaron"}. Antes la obra salía en ${antes} días; mirá arriba en cuántos sale ahora.`);
              }}>
                <Sparkles size={13} /> {pensando ? "NOVA está recalculando…" : "¿Cuánto tiempo más piden estas órdenes?"}
              </Button>
            )}
            {(d.nuevas.length > 0 || d.dePlata.length > 0 || d.perdidas.length > 0) && editable && (
              <Button variant="outline" size="sm" disabled={pensando} style={{ marginRight: 6 }} onClick={async () => {
                setPensando(true); setError("");
                const r = await acomodarCambios({
                  plan: todas, dependencias, cambios: d, nombreObra: lead.nombre, dias: diasDeContrato,
                });
                setPensando(false);
                if (r.error) { setError(r.error); return; }
                const resumen = [
                  r.agregar.length && `Agregar ${r.agregar.length}:\n` + r.agregar.map(x => `  · ${x.nombre}, ${x.duracion} días${x.porque ? ` — ${x.porque}` : ""}`).join("\n"),
                  r.ajustar.length && `Alargar o acortar ${r.ajustar.length}:\n` + r.ajustar.map(x => {
                    const a = todas.find(y => y.id === x.actividad_id);
                    return `  · ${a?.nombre}: de ${a?.duracion} a ${x.duracion} días${x.porque ? ` — ${x.porque}` : ""}`;
                  }).join("\n"),
                  r.quitar.length && `Quitar ${r.quitar.length}:\n` + r.quitar.map(x => {
                    const a = todas.find(y => y.id === x.actividad_id);
                    return `  · ${a?.nombre}${x.porque ? ` — ${x.porque}` : ""}`;
                  }).join("\n"),
                ].filter(Boolean).join("\n\n");
                if (!resumen) { setError("NOVA no propuso ningún cambio."); return; }
                if (!window.confirm(
                  "NOVA propone esto, sobre el cronograma que ya tenés:\n\n" + resumen +
                  "\n\nNo se tocan las dependencias que ya existen, ni el orden, ni las etapas." +
                  (r.descartadas ? `\n\n(Le descarté ${r.descartadas} operaciones que salían de lo que cambió.)` : "") +
                  "\n\n¿Lo aplico?")) return;

                setPensando(true);
                for (const x of r.quitar) {
                  await supabase.from("cronograma_dependencias").delete().eq("actividad_id", x.actividad_id);
                  await supabase.from("cronograma_dependencias").delete().eq("depende_de_id", x.actividad_id);
                  await supabase.from("cronograma_actividades").delete().eq("id", x.actividad_id);
                }
                for (const x of r.ajustar) {
                  await supabase.from("cronograma_actividades").update({ duracion: x.duracion }).eq("id", x.actividad_id);
                }
                for (const x of r.agregar) {
                  const { data: creada, error: e } = await supabase.from("cronograma_actividades").insert({
                    lead_id: lead.id, obra_id: lead.obra_id || null,
                    obra_actividad_id: x.agrupacion_id, nombre: x.nombre,
                    duracion: x.duracion, etapa: "ejecucion", peso_pct: 100,
                    orden: actividades.length + 1,
                  }).select().single();
                  if (e) { setError(e.message); break; }
                  if (x.despues_de) {
                    await supabase.from("cronograma_dependencias").insert({
                      actividad_id: creada.id, depende_de_id: x.despues_de, tipo: x.tipo, retardo: x.retardo,
                    });
                  }
                }
                // La foto de la plata se actualiza: lo acomodado deja de estar
                // desacomodado, y avisar otra vez de lo mismo es ruido.
                await refrescarMontoRef();
                setPensando(false);
                await cargar();
              }}>{pensando ? "NOVA está mirando el plan…" : "Que NOVA lo acomode"}</Button>
            )}
            {/* UN SOLO BOTÓN PARA TODA ESTA FAMILIA.
                Había tres —"Traer los nombres del control", "Sumarlas al
                cronograma" y este— para tres caras del mismo problema: el
                cronograma y el control se separaron. Nadie quiere elegir cuál
                de las tres caras le tocó; quiere que vuelvan a coincidir.
                "Ponerlo al día" hace las tres y dice qué hizo. */}
            {(d.renombradas.length > 0 || d.nuevas.length > 0 || d.perdidas.length > 0) && editable && (
              <Button variant={d.dePlata.length ? "outline" : "primary"} size="sm" disabled={pensando}
                style={{ marginRight: 6 }}
                title={cubrePresupuesto
                  ? "Trae los nombres nuevos, suma las agrupaciones que falten y saca las barras de agrupaciones borradas. No toca duraciones, cadenas ni etapas."
                  : "Trae los nombres nuevos y saca las barras de agrupaciones borradas. NO agrega agrupaciones: este cronograma se armó leyendo la obra."}
                onClick={async () => {
                  if (!window.confirm(
                    "¿Poner el cronograma al día con el control?\n\n"
                    + "· Las barras que salen del control toman su nombre nuevo.\n"
                    + "· Las que apuntan a una agrupación borrada se van.\n"
                    + (cubrePresupuesto
                      ? "· Las agrupaciones que falten entran como barras nuevas, con duración a revisar.\n"
                      : "· NO se agrega ninguna agrupación: este cronograma se armó leyendo la obra, no el presupuesto.\n")
                    + "\nNo se tocan las duraciones, las cadenas ni las etapas.")) return;
                  await sincronizarConElControl();
                }}>
                Ponerlo al día con el control
              </Button>
            )}
          </div>
        );
      })()}

      {/* Barras repetidas: su propio aviso, con su arreglo al lado.
          Estaba como un botón más en la barra de acciones, al lado de cosas
          que uno hace a propósito. Esto no se hace a propósito: es un
          desperfecto, y un desperfecto se anuncia. */}
      {repetidas > 0 && editable && (
        <div style={{ fontSize: 12, color: colors.ink, background: colors.warningSoft,
          border: `1px solid ${colors.warningBorder}`, borderRadius: colors.radiusMd,
          padding: "10px 12px", marginBottom: 12, display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap" }}>
          <AlertTriangle size={13} color={colors.warning} style={{ flexShrink: 0 }} />
          <div style={{ lineHeight: 1.55, flex: 1, minWidth: 240 }}>
            Hay <strong>{repetidas}</strong> {repetidas === 1 ? "barra repetida" : "barras repetidas"}: la misma
            agrupación dibujada dos veces en el mismo momento. Cada una se lleva su parte de la plata, así que el
            rubro reparte de más y el valorado le pone el doble de lo que tiene.
          </div>
          <Button variant="primary" size="sm" disabled={pensando} onClick={quitarRepetidas}>
            Quitarlas
          </Button>
        </div>
      )}

      {plan.ciclos.length > 0 && (
        <Aviso>
          Hay {plan.ciclos.length} actividades esperándose entre sí —A espera a B que espera a A—, así que no
          se les puede calcular fecha. Quitá una de esas dependencias.
        </Aviso>
      )}

      {error && <div style={{ fontSize: 12, color: colors.danger, marginBottom: 8 }}>{error}</div>}

      {/* LA MEMORIA, A LA VISTA Y BORRABLE.
          Una memoria que no se puede mirar es una herramienta que falla sin
          que nadie sepa por qué: NOVA propone 25 días, nadie entiende de dónde
          salieron, y la próxima vez se desconfía del cronograma entero. Acá
          están los apuntes, de dónde salió cada uno y quién lo dejó, y se
          pueden borrar: un rendimiento medido en una obra rara —una casa en el
          campo con una cuadrilla prestada— arrastra a las que vienen. */}
      {verMemoria && (
        <div style={{ background: colors.surface, border: `1px solid ${colors.border}`,
          borderRadius: colors.radiusMd, padding: 12, marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: colors.ink, flex: 1 }}>
              Lo que NOVA aprendió de las obras de esta oficina
            </div>
            <Button variant="secondary" size="sm" onClick={() => setVerMemoria(false)}>Cerrar</Button>
          </div>
          <div style={{ fontSize: 11.5, color: colors.muted, lineHeight: 1.5, marginBottom: 9 }}>
            Cada vez que alguien corrige una duración a mano, acá queda cuánto rindió por día. Es lo que NOVA
            lee antes de proponer el cronograma de la obra siguiente —los días no sirven, porque la otra obra
            tiene otros metros; el rendimiento sí—.
          </div>
          {!memoria.length ? (
            <div style={{ fontSize: 12, color: colors.inkSoft }}>
              Todavía no hay apuntes. Se llena solo: corregí una duración en la tabla y queda anotada.
            </div>
          ) : (
            <div style={{ maxHeight: 260, overflowY: "auto", display: "grid", gap: 1 }}>
              {memoria.map(m => (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0",
                  borderBottom: `1px solid ${colors.neutralSoft}` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {m.ejemplo || m.patron}
                    </div>
                    <div style={{ fontSize: 10.5, color: colors.muted }}>
                      {m.rendimiento?.rinde
                        ? `${m.rendimiento.rinde} ${m.rendimiento.unidad} por día · ${fmt(m.rendimiento.cantidad)} ${m.rendimiento.unidad} en ${m.rendimiento.dias} días`
                        : `${m.rendimiento?.dias || m.anticipacion || "?"} días hábiles, sin cantidades`}
                      {m.veces > 1 && ` · corregido ${m.veces} veces`}
                      {m.creado_nombre && ` · ${m.creado_nombre}`}
                    </div>
                  </div>
                  <button title="Que NOVA se olvide de este apunte"
                    onClick={async () => {
                      if (!window.confirm(`¿Que NOVA se olvide de "${m.patron}"?\n\nDeja de usarlo para proponer duraciones. No cambia ningún cronograma ya hecho.`)) return;
                      const e = await olvidar(m.id);
                      if (e) { setError(e); return; }
                      await cargarMemoria();
                    }}
                    style={{ background: "none", border: "none", cursor: "pointer", color: colors.muted,
                      display: "flex", flexShrink: 0, padding: 3 }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {partiendo && (
        <PartirEnEtapas actividad={partiendo} onCancelar={() => setPartiendo(null)}
          onPartir={etapas => partir(partiendo, etapas)} />
      )}

      <>
        {/* LAS ETAPAS SE MANEJAN ACÁ, FUERA DE LA TABLA.
            Estaban adentro del Gantt, en una banda: para mover una había que
            encontrar dos flechitas metidas en una tabla que se desplaza para
            el costado, apretadas contra el nombre y contra el resto de la
            fila. No se podía, y desde afuera no se distingue de un botón roto.
            Acá arriba hay lugar: la lista entera de un vistazo, con botones
            que se pueden apretar, y lo que se crea aparece al instante en un
            lugar fijo que no se va de la pantalla. La banda de adentro del
            Gantt sigue, pero ya no es donde se trabaja: es donde se mira. */}
        {editable && (
          <div style={{ background: colors.surface, border: `1px solid ${colors.brand}`,
            borderRadius: colors.radiusMd, padding: 11, marginBottom: 10 }}>
            {aviso && (
              <div style={{ fontSize: 11.5, color: colors.brand, fontWeight: 600, marginBottom: 7 }}>{aviso}</div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: colors.ink, flex: 1, minWidth: 150 }}>
                Etapas de la obra
                <span style={{ fontWeight: 400, color: colors.muted }}>
                  {" "}· {fases.length ? `${fases.length} ${fases.length === 1 ? "etapa" : "etapas"}` : "todavía ninguna"}
                </span>
              </div>
              {actividades.length > 0 && (
                <Button variant="outline" size="sm" disabled={pensando} onClick={etapasConNova}>
                  <Sparkles size={13} /> {pensando ? "NOVA está mirando…" : "Que NOVA las arme"}
                </Button>
              )}
            </div>

            {/* EL CAMPO, EN SU PROPIO RENGLÓN Y ANCHO.
                Estaba apretado entre el título y dos botones, en una fila que
                se parte cuando no entra: en una pantalla angosta terminaba
                abajo de todo o sin lugar, y lo que se ve es un botón que pide
                un nombre que no hay dónde escribir. */}
            <div style={{ display: "flex", gap: 7, marginBottom: fases.length ? 9 : 0 }}>
              <input value={etapaNueva}
                onChange={e => setEtapaNueva(e.target.value)}
                onKeyDown={async e => {
                  if (e.key !== "Enter") return;
                  const n = etapaNueva;
                  setEtapaNueva("");
                  await agregarEtapa(n);
                }}
                placeholder="Escribí una etapa y dale Enter. Ej: Demoliciones"
                style={{ ...inputStyle, flex: 1, minWidth: 120, fontSize: 12.5, padding: "6px 9px", height: 32 }} />
              <Button variant="primary" size="sm" disabled={!etapaNueva.trim()}
                onClick={async () => { const n = etapaNueva; setEtapaNueva(""); await agregarEtapa(n); }}>
                <Plus size={13} /> Agregar etapa
              </Button>
            </div>

            {!fases.length ? (
              <div style={{ fontSize: 11.5, color: colors.muted, lineHeight: 1.5, marginTop: 7 }}>
                Una etapa es un TÍTULO que agrupa barras —Demoliciones, Obra gris, Instalaciones, Acabados—.
                No tiene duración ni fechas propias: las toma de lo que tiene adentro, y no cambia ninguna
                fecha del cronograma. Para meter una barra en una etapa, tocá su nombre en la tabla y elegila
                arriba de la ficha.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 3 }}>
                {[...fases].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)).map((f, i, lista) => {
                  const adentro = actividades.filter(a => Number(a.fase_id) === Number(f.id));
                  const barras = adentro.length;
                  const suyas = todas.filter(a => Number(a.fase_id) === Number(f.id));
                  const inicios = suyas.map(a => a.inicio).filter(Boolean).sort();
                  const fines = suyas.map(a => a.fin).filter(Boolean).sort();
                  return (
                    <div key={f.id} style={{ borderRadius: 7, background: colors.bg }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 6px" }}>
                      <span style={{ fontSize: 11, color: colors.muted, width: 16, textAlign: "right", flexShrink: 0 }}>{i + 1}</span>
                      <input defaultValue={f.nombre} key={`n${f.id}-${f.nombre}`}
                        onBlur={e => { if ((e.target.value || "").trim() && e.target.value !== f.nombre) renombrarEtapaDeObra(f, e.target.value); }}
                        onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
                        title="Escribí para renombrar la etapa"
                        style={{ ...inputStyle, flex: 1, minWidth: 110, fontSize: 12.5, fontWeight: 600,
                          color: colors.ink, padding: "4px 7px", height: 28 }} />
                      <span style={{ fontSize: 10.5, color: colors.muted, flexShrink: 0, minWidth: 108, textAlign: "right" }}>
                        {barras ? `${barras} ${barras === 1 ? "barra" : "barras"}` : "vacía"}
                        {inicios.length ? ` · ${dia(inicios[0])} a ${dia(fines[fines.length - 1])}` : ""}
                      </span>
                      {/* BOTONES QUE SE PUEDEN APRETAR. Los de adentro de la
                          tabla eran de nueve píxeles. */}
                      <Button variant="secondary" size="sm" disabled={i === 0}
                        onClick={() => moverEtapaDeObra(f, -1)}
                        title={i === 0 ? "Ya es la primera" : `Subir «${f.nombre}»`}>▲</Button>
                      <Button variant="secondary" size="sm" disabled={i === lista.length - 1}
                        onClick={() => moverEtapaDeObra(f, 1)}
                        title={i === lista.length - 1 ? "Ya es la última" : `Bajar «${f.nombre}»`}>▼</Button>
                      <Button variant="secondary" size="sm" onClick={() => borrarEtapaDeObra(f)}
                        title={`Borrar «${f.nombre}». Lo que tiene adentro no se borra.`}><Trash2 size={13} /></Button>
                      {/* AGREGAR UNA ACTIVIDAD ADENTRO DE ESTA ETAPA.
                          Es lo que uno quiere hacer apenas creó la etapa, y no
                          había cómo: había que agregarla abajo, en la lista
                          general, y después abrir su ficha para decirle a qué
                          etapa pertenece. Tres pasos para lo que es uno. */}
                      {/* CON SU NOMBRE. Un "+" solo no dice qué agrega, y
                          acá se pueden agregar dos cosas distintas: un trabajo
                          que dura, o un momento que no. */}
                      <Button variant="outline" size="sm"
                        onClick={() => { setEnEtapa(enEtapa === f.id ? { id: f.id, hito: false } : null); setActNueva(""); }}
                        title={`Agregar un trabajo adentro de «${f.nombre}»`}><Plus size={13} /> actividad</Button>
                      <Button variant="outline" size="sm"
                        onClick={() => { setEnEtapa(enEtapa?.id === f.id && enEtapa?.hito ? null : { id: f.id, hito: true }); setActNueva(""); }}
                        title={`Agregar un hito adentro de «${f.nombre}»: un anticipo, una medición, una entrega`}>◆ hito</Button>
                    </div>
                    {enEtapa?.id === f.id && (
                      <div style={{ display: "flex", gap: 7, padding: "0 6px 6px 28px" }}>
                        <input autoFocus value={actNueva} onChange={e => setActNueva(e.target.value)}
                          onKeyDown={async e => {
                            if (e.key === "Escape") { setEnEtapa(null); return; }
                            if (e.key !== "Enter") return;
                            const n = actNueva; setActNueva("");
                            await agregar(n, f.id, null, enEtapa.hito);
                          }}
                          placeholder={enEtapa.hito
                            ? `Hito adentro de «${f.nombre}». Ej: anticipo del 50% · medición de noviembre · entrega de planta baja`
                            : `Trabajo adentro de «${f.nombre}». Enter para agregar`}
                          style={{ ...inputStyle, flex: 1, minWidth: 120, fontSize: 12, padding: "5px 8px", height: 30 }} />
                        <Button variant="primary" size="sm" disabled={!actNueva.trim()}
                          onClick={async () => { const n = actNueva; setActNueva(""); await agregar(n, f.id, null, enEtapa.hito); }}>
                          {enEtapa.hito ? "◆ Agregar hito" : <><Plus size={13} /> Agregar</>}
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => setEnEtapa(null)}>Listo</Button>
                      </div>
                    )}
                    </div>
                  );
                })}
                {actividades.some(a => a.fase_id == null) && (
                  <div style={{ fontSize: 10.5, color: colors.muted, padding: "3px 6px" }}>
                    {actividades.filter(a => a.fase_id == null).length} barras todavía sin etapa, al final de la tabla.
                  </div>
                )}
              </div>
            )}

            {/* ESCRIBÍS VOS, LOS NÚMEROS LOS PONE NOVA.
                Es el camino que de verdad se usa: quien dirige la obra sabe
                qué hay que hacer y en qué orden —lo escribe en dos minutos— y
                lo que no quiere es sentarse a calcular cuántos días lleva cada
                cosa y qué traba a qué. Eso sí es trabajo de NOVA: rendimientos
                y orden de obra. No agrega trabajos ni reordena: lo escrito lo
                escribió alguien que vio la obra. */}
            {actividades.length > 0 && (
              <div style={{ borderTop: `1px solid ${colors.neutralSoft}`, marginTop: 9, paddingTop: 9,
                display: "grid", gap: 7 }}>
                {/* LA CAJA PARA HABLARLE, FIJA Y ACÁ.
                    Vivía adentro del panel de armar, así que solo existía en
                    el momento de armar de cero. Pero lo que uno sabe de la
                    obra no aparece todo junto al principio: aparece mientras
                    la escribe —"el aire llega en diciembre", "la planta alta
                    se entrega antes"— y es justo lo que hay que tener a mano
                    cuando se le pide la línea de tiempo. */}
                {dictado.trim() && (
                  <div style={{ fontSize: 10.5, color: colors.muted, lineHeight: 1.4 }}>
                    Va a leer también lo que escribiste arriba en «Decile a NOVA cómo va esta obra».
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <Button variant="primary" size="sm" disabled={pensando} onClick={async () => {
                  setError("");
                  setPensando(true);
                  const mp = obra?.id ? await materiaPrima(obra.id) : [];
                  const r = await ponerTiemposYOrden({
                    actividades, fases, agrupaciones: mp, dias: diasDeContrato,
                    nombreObra: lead.nombre, comoVa: dictado, cal,
                  });
                  if (r.error) { setPensando(false); setError(r.error); return; }
                  if (!r.duraciones.length && !r.dependencias.length) {
                    setPensando(false);
                    setAviso("NOVA no le cambió nada: los días y el orden que hay le parecen bien.");
                    return;
                  }
                  const ok = window.confirm(
                    `NOVA leyó las ${actividades.length} actividades y propone:\n\n` +
                    `· ${r.duraciones.length} duraciones distintas de las de ahora\n` +
                    `· ${r.dependencias.length} dependencias — reemplazan las que haya\n\n` +
                    "No agrega ni saca actividades ni cambia el orden en que las escribiste. " +
                    "Lo que no te guste se corrige después escribiendo encima.");
                  if (!ok) { setPensando(false); return; }
                  const hecho = await aplicarTiemposYOrden({ ...r, actividades });
                  setPensando(false);
                  await cargar();
                  setAviso(`NOVA puso ${hecho.dias} duraciones y ${hecho.dependencias} dependencias. Revisalas abajo.`);
                }}>
                  <Sparkles size={13} /> {pensando ? "NOVA está leyendo…" : "Que NOVA le ponga tiempos y orden"}
                </Button>
                <span style={{ fontSize: 11, color: colors.muted, flex: 1, minWidth: 220, lineHeight: 1.45 }}>
                  Lee las etapas, las actividades y los hitos como están —en tu orden— y arma la línea de
                  tiempo: cuántos días lleva cada cosa, qué traba a qué, y qué se traslapa. No agrega
                  trabajos ni los reordena. Lo que corrijas después lo aprende para la próxima obra.
                </span>
                </div>
              </div>
            )}
          </div>
        )}

        <TablaGantt
          todas={todas} dependencias={dependencias} agrupaciones={agrupaciones} plata={plata}
          porId={porId} cal={cal} plan={plan} escala={escala} zoom={zoom} marcas={marcas}
          editable={editable} conEtapas={conEtapas}
          uniendo={uniendo} setUniendo={setUniendo} hoyISO={hoyISO} dia={dia}
          onCambiar={cambiar} onCambiarDep={cambiarDep} onDesunir={desunir}
          onUnir={unir} onQuitar={quitar} onPartir={a => setPartiendo(a)} onMoverRubro={moverRubro}
          onMoverEtapa={moverEtapa}
          rubros={rubros} sinSenalar={sinSenalar} onSenalar={senalarRubro}
          platas={platas} memoria={memoria}
          fases={fases} onFase={ponerEnEtapa} />
      </>

      {editable && (
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          <input value={nueva?.nombre || ""} onChange={e => setNueva(v => ({ ...(v || { duracion: 5 }), nombre: e.target.value }))}
            onKeyDown={e => { if (e.key === "Enter") agregar(); }}
            placeholder="Nueva actividad. Ej: estructura de la planta baja"
            style={{ ...inputStyle, flex: 1, minWidth: 220 }} />
          <Numero value={nueva?.duracion ?? 5} min={1} max={2000} title="Cuántos días hábiles dura"
            onCommit={v => setNueva(x => ({ ...(x || { nombre: "" }), duracion: v }))}
            style={{ width: 80 }} />
          <Button variant="primary" size="sm" onClick={() => agregar()}><Plus size={13} /> Agregar</Button>
        </div>
      )}

      {/* CÓMO SE USA, en una línea. Lo de encadenar y traslapar no se adivina
          mirando la pantalla, y sin saberlo el cronograma queda como una lista
          de barras sueltas que arrancan todas el día uno. */}
      {todas.length > 0 && editable && !uniendo && (
        <div style={{ fontSize: 11, color: colors.muted, marginTop: 8, lineHeight: 1.55 }}>
          Los <strong style={{ color: colors.inkSoft }}>días</strong>, la fecha en que{" "}
          <strong style={{ color: colors.inkSoft }}>empieza</strong> y la fecha en que{" "}
          <strong style={{ color: colors.inkSoft }}>termina</strong> se escriben las tres: cambiás la que sepas y las
          otras se acomodan. Tocá el <strong style={{ color: colors.inkSoft }}>nombre</strong> de una actividad y se
          abre su ficha: de qué depende, en qué momento va y qué parte de la plata lleva. Para{" "}
          <strong style={{ color: colors.inkSoft }}>encadenar</strong>, tocá el eslabón de una y después el de la que va
          detrás. Para <strong style={{ color: colors.inkSoft }}>traslaparlas</strong> —que la segunda arranque antes de
          que la primera termine— poné los días <strong style={{ color: colors.inkSoft }}>en negativo</strong> en la
          ficha; en positivo son días de espera.
        </div>
      )}

      {uniendo && (
        <div style={{ fontSize: 11.5, color: colors.brand, marginTop: 8 }}>
          Marcaste <strong>{porId.get(uniendo)?.nombre}</strong>. Tocá el eslabón de la actividad que va después.
          <button onClick={() => setUniendo(null)} style={{ background: "none", border: "none", color: colors.muted, cursor: "pointer", marginLeft: 6, fontFamily: colors.font }}>cancelar</button>
        </div>
      )}

      {todas.length > 0 && (
        <div style={{ fontSize: 10.5, color: colors.muted, marginTop: 10, lineHeight: 1.55 }}>
          Las barras <span style={{ color: colors.danger, fontWeight: 700 }}>rojas</span> son la ruta crítica: no tienen
          colchón, y un día de atraso ahí es un día de atraso en la entrega. Las azules se pueden correr lo que diga
          su holgura sin mover la fecha de fin.
        </div>
      )}
      </>
      )}
    </div>
  );
}

const Volver = ({ onClick }) => (
  <button onClick={onClick} style={{ background: "none", border: "none", color: colors.inkSoft, fontSize: 12.5,
    cursor: "pointer", fontFamily: colors.font, display: "flex", alignItems: "center", gap: 4, padding: 0, marginBottom: 10 }}>
    <ChevronLeft size={14} /> Cronograma
  </button>
);

const Centro = ({ children }) => (
  <div style={{ textAlign: "center", padding: "40px 20px", color: colors.muted, fontSize: 13, lineHeight: 1.6,
    background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd }}>{children}</div>
);

const Aviso = ({ children }) => (
  <div style={{ fontSize: 12.5, color: colors.warning, background: colors.warningSoft, display: "flex", gap: 7,
    border: `1px solid ${colors.warningBorder}`, borderRadius: colors.radiusMd, padding: 13, marginBottom: 12 }}>
    <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
    <span>{children}</span>
  </div>
);
