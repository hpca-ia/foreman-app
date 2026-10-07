import { useEffect, useState, useCallback, lazy, Suspense } from "react";
import { Plus, Trash2, ChevronLeft, ChevronDown, GanttChartSquare, AlertTriangle } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import Numero from "../../components/ui/Numero";
import { calendario, calcular, aFecha, claveFecha, ETAPAS, ajustarAlPlazo } from "./cpm";
import { materiaPrima, proponerCronograma, guardarPropuesta, aprenderDelCronograma, acomodarCambios } from "./novaCronograma";
import { bajarProject } from "./exportarProject";
import TablaGantt from "./TablaGantt";
// El valorado baja aparte: es una matriz con su gráfico y pesa.
const PanelValorado = lazy(() => import("./PanelValorado"));
import PartirEnEtapas from "./PartirEnEtapas";
import { guardarPlazo, desfase, diasDelPlazo } from "./plazo";
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
  // Cuánta plata tiene cada agrupación, para decir cuánto sale cada mes.
  const [plata, setPlata] = useState({});
  // Los rubros de la obra, para poder señalar cuál es el que está trabando a
  // su grupo.
  const [rubros, setRubros] = useState([]);
  const [sinSenalar, setSinSenalar] = useState(false);
  // La actividad que se está partiendo en etapas, si hay alguna.
  const [partiendo, setPartiendo] = useState(null);
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
    const base = "id,nombre,tunel,resultado,obra_id,crono_inicio,es_lead";
    (async () => {
      let { data, error } = await supabase.from("leads").select(`${base},crono_meses`).order("nombre");
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
        .select("id,descripcion,numero,codigo,actividad_id,total_base,capitulo,anulado_por_oc,crono_senalado,crono_nota,crono_actividad_id")
        .eq("obra_id", lead.obra_id).order("orden");
      // Sin la 085 no existen esas dos columnas: se lee sin ellas y todo sigue
      // andando, solo que no se puede señalar qué rubro está trabando.
      if (eRub) {
        ({ data: rub } = await supabase.from("obra_rubros")
          .select("id,descripcion,numero,codigo,actividad_id,total_base,capitulo,anulado_por_oc")
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

  const diasDeContrato = diasDelPlazo(lead.crono_inicio || hoy(), lead.crono_meses, cal);
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

  async function agregar() {
    if (!nueva?.nombre?.trim()) return;
    setError("");
    const { error: e } = await supabase.from("cronograma_actividades").insert({
      lead_id: lead.id, obra_id: lead.obra_id || null,
      nombre: nueva.nombre.trim(), duracion: Math.max(1, Number(nueva.duracion) || 1),
      orden: actividades.length,
    });
    if (e) { setError(e.message); return; }
    setNueva({ nombre: "", duracion: nueva.duracion });
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

    // Las que apuntan a una agrupación borrada, o a ninguna.
    const colgadas = actividades.filter(a => !vivas.has(Number(a.obra_actividad_id)));
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
    const faltan = [...vivas.values()].filter(g => !puestas.has(Number(g.id)));
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
    await ordenarComoElControl();
    await refrescarMontoRef();
    window.alert([
      "Cronograma al día con el control de obra.",
      fuera && `· ${fuera} ${fuera === 1 ? "actividad apuntaba" : "actividades apuntaban"} a agrupaciones que ya no existen: se fueron.`,
      renombradas && `· ${renombradas} ${renombradas === 1 ? "tomó" : "tomaron"} el nombre de su agrupación.`,
      sumadas && `· ${sumadas} ${sumadas === 1 ? "agrupación entró" : "agrupaciones entraron"} con duración a revisar.`,
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
          <div>
            <label style={{ fontSize: 9.5, fontWeight: 700, color: colors.muted, letterSpacing: 0.3, display: "block", marginBottom: 3 }}>
              DURA (MESES)
            </label>
            <Numero value={lead.crono_meses ?? null} min={1} max={120} vacio={null} placeholder="—"
              style={{ width: 82, padding: "6px 9px", fontSize: 12 }}
              onCommit={async m => {
                const err = await guardarPlazo(lead.id, { meses: m });
                if (err) { setError(err); return; }
                setError("");
                setLead(l => ({ ...l, crono_meses: m }));
              }} />
          </div>
          <div style={{ fontSize: 11, color: colors.muted, lineHeight: 1.5, flex: 1, minWidth: 220 }}>
            <strong style={{ color: colors.inkSoft }}>El plazo del proyecto.</strong> Se escribe una sola vez acá y lo
            usan este cronograma y el cronograma valorado del control de obra. Escribilo y apretá Enter.
            {diasDeContrato > 0 && <> Son <strong style={{ color: colors.inkSoft }}>{diasDeContrato} días de trabajo</strong>.</>}
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

      {/* Que lo arme NOVA: las agrupaciones ya dicen QUÉ hay que hacer, con
          su plata adentro. Lo que falta es el orden y la duración, y eso es
          saber de obra —la estructura antes que la mampostería, las
          instalaciones antes del enlucido o hay que picar—. No sale de ningún
          dato: sale de haber hecho obras. */}
      {editable && obra?.id && (
        armando ? (
          <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 12, marginBottom: 12, display: "grid", gap: 9 }}>
            {/* No se vuelve a preguntar cuánto dura. Ya está arriba, en el
                plazo del proyecto: preguntarlo otra vez es pedir el mismo dato
                dos veces y quedarse con dos respuestas que pueden no coincidir
                — que es exactamente lo que se acaba de arreglar. */}
            <div style={{ fontSize: 11.5, color: colors.muted, lineHeight: 1.5 }}>
              {lead.crono_meses ? (
                <>
                  NOVA parte las agrupaciones del presupuesto en actividades, les pone duración y las encadena en el
                  orden real de una obra, para que entre en el plazo del proyecto:{" "}
                  <strong style={{ color: colors.ink }}>{lead.crono_meses} meses</strong>
                  {diasDeContrato > 0 && <> · {diasDeContrato} días de trabajo</>}.
                </>
              ) : (
                <span style={{ color: colors.warning }}>
                  Primero poné cuántos meses dura la obra, arriba en el plazo del proyecto: es contra ese número que
                  NOVA arma el cronograma.
                </span>
              )}
            </div>

            {armando.propuesta && (
              <div style={{ background: colors.bg, borderRadius: 8, padding: 11 }}>
                <div style={{ fontSize: 12.5, color: colors.ink, lineHeight: 1.55, marginBottom: 6 }}>
                  <strong>{armando.propuesta.actividades.length}</strong> actividades,{" "}
                  <strong>{armando.propuesta.dependencias.length}</strong> dependencias.
                  La obra sale en <strong>{armando.propuesta.dias} días de trabajo</strong>,
                  con {armando.propuesta.criticas} en la ruta crítica.
                  {diasDeContrato > 0 && (
                    Math.abs(armando.propuesta.dias - diasDeContrato) <= Math.max(3, diasDeContrato * 0.05)
                      ? <span style={{ color: colors.brand }}> Entra en el plazo de {diasDeContrato} días.</span>
                      : <span style={{ color: colors.warning }}>
                          {" "}El plazo son {diasDeContrato}: le{armando.propuesta.dias > diasDeContrato ? "" : " falta"}n{" "}
                          {Math.abs(armando.propuesta.dias - diasDeContrato)} días. Guardalo y ajustalo arriba, o pedile que lo piense de nuevo.
                        </span>
                  )}
                  {armando.propuesta.cortado && (
                    <span style={{ color: colors.warning }}>
                      {" "}La respuesta vino cortada: guardé lo que llegó entero y completé el resto con las
                      agrupaciones del control, con duración a revisar.
                    </span>
                  )}
                  {armando.propuesta.quitadas > 0 && (
                    <span style={{ color: colors.warning }}> Le quité {armando.propuesta.quitadas} dependencias que se mordían la cola.</span>
                  )}
                </div>
                <div style={{ maxHeight: 150, overflowY: "auto", fontSize: 11.5, color: colors.inkSoft, lineHeight: 1.6 }}>
                  {armando.propuesta.actividades.slice(0, 14).map(a => (
                    <div key={a.ref}>· {a.nombre} <span style={{ color: colors.muted }}>— {a.duracion} días</span></div>
                  ))}
                  {armando.propuesta.actividades.length > 14 && <div style={{ color: colors.muted }}>…y {armando.propuesta.actividades.length - 14} más</div>}
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {!armando.propuesta ? (
                <Button variant="primary" size="sm" disabled={pensando || !lead.crono_meses} onClick={async () => {
                  setError(""); setPensando(true);
                  const agrupaciones = await materiaPrima(obra.id);
                  const r = await proponerCronograma({
                    agrupaciones, meses: lead.crono_meses, dias: diasDeContrato,
                    nombreObra: lead.nombre, cal,
                  });
                  setPensando(false);
                  if (r.error) { setError(r.error); return; }
                  setArmando(v => ({ ...v, propuesta: r }));
                }}>{pensando ? "NOVA está leyendo el presupuesto…" : "Que lo arme NOVA"}</Button>
              ) : (
                <>
                  <Button variant="primary" size="sm" disabled={pensando} onClick={async () => {
                    setPensando(true);
                    const r = await guardarPropuesta({ lead, obra, propuesta: armando.propuesta, quien: currentUser });
                    setPensando(false);
                    if (r.error) { setError(r.error); return; }
                    setArmando(null); await cargar();
                  }}>
                    {todas.length ? "Reemplazar el cronograma" : "Guardarlo"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setArmando(v => ({ ...v, propuesta: null }))}>Que lo piense de nuevo</Button>
                </>
              )}
              <Button variant="secondary" size="sm" onClick={() => setArmando(null)}>Cancelar</Button>
            </div>
            {todas.length > 0 && !armando.propuesta && (
              <div style={{ fontSize: 10.5, color: colors.warning }}>
                Ya hay un cronograma: si guardás uno nuevo, reemplaza al de ahora con todo lo que le hayas corregido.
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
                <Button variant="primary" size="sm" disabled={pensando || !obra?.id} onClick={async () => {
                  if (!window.confirm(
                    "¿Armar el cronograma con las agrupaciones del control de obra?\n\n" +
                    "Una barra por agrupación, en el orden del control, encadenadas una detrás de otra. " +
                    "Las duraciones salen de repartir el plazo según lo que pesa cada una: son un punto de " +
                    "partida para corregir, no una estimación.")) return;
                  await armarDelControl();
                }}>Armarlo del control de obra</Button>
                <Button variant="outline" size="sm" disabled={pensando}
                  onClick={() => { setArmando({ propuesta: null }); setError(""); }}>
                  Que NOVA le ponga las duraciones
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" disabled={pensando}
                  onClick={() => { setArmando({ propuesta: null }); setError(""); }}>
                  Rearmarlo con NOVA
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
                          ["Que NOVA lo aprenda", "Los rendimientos de esta obra, para la próxima", async () => {
                            setPensando(true);
                            // Lo que vale para la obra siguiente no son los días
                            // —esa obra tiene otros metros— sino cuánto rinde por día.
                            const mp = obra?.id ? await materiaPrima(obra.id) : [];
                            const n = await aprenderDelCronograma(todas, currentUser, mp);
                            setPensando(false); setError("");
                            window.alert(`NOVA anotó ${n} actividades para la próxima obra: los días, y dónde hay cantidades, el rendimiento por día.`);
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

      {/* Lo que cambió en las agrupaciones desde que se armó esto. No hay que
          corregirlo a mano: si FOREMAN se puede dar cuenta, avisa. Lo que no
          hace es rehacerlo solo —un cronograma con avance cargado y fechas
          comprometidas no se reescribe porque alguien tocó una agrupación. */}
      {todas.length > 0 && agrupaciones.length > 0 && (() => {
        const d = desfase(actividades, agrupaciones, plata);
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
            {(d.nuevas.length > 0 || d.dePlata.length > 0 || d.perdidas.length > 0) && editable && (
              <Button variant="primary" size="sm" disabled={pensando} style={{ marginRight: 6 }} onClick={async () => {
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
                style={{ marginRight: 6 }} onClick={sincronizarConElControl}>
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

      {partiendo && (
        <PartirEnEtapas actividad={partiendo} onCancelar={() => setPartiendo(null)}
          onPartir={etapas => partir(partiendo, etapas)} />
      )}

      {!todas.length ? (
        <Centro>
          Todavía no hay actividades. Empezá por las grandes —movimiento de tierra, estructura, mampostería— y
          después las partís.
        </Centro>
      ) : (
        <TablaGantt
          todas={todas} dependencias={dependencias} agrupaciones={agrupaciones} plata={plata}
          porId={porId} cal={cal} plan={plan} escala={escala} zoom={zoom} marcas={marcas}
          editable={editable} conEtapas={conEtapas}
          uniendo={uniendo} setUniendo={setUniendo} hoyISO={hoyISO} dia={dia}
          onCambiar={cambiar} onCambiarDep={cambiarDep} onDesunir={desunir}
          onUnir={unir} onQuitar={quitar} onPartir={a => setPartiendo(a)} onMoverRubro={moverRubro}
          rubros={rubros} sinSenalar={sinSenalar} onSenalar={senalarRubro}
          platas={platas} />
      )}

      {editable && (
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          <input value={nueva?.nombre || ""} onChange={e => setNueva(v => ({ ...(v || { duracion: 5 }), nombre: e.target.value }))}
            onKeyDown={e => { if (e.key === "Enter") agregar(); }}
            placeholder="Nueva actividad. Ej: estructura de la planta baja"
            style={{ ...inputStyle, flex: 1, minWidth: 220 }} />
          <Numero value={nueva?.duracion ?? 5} min={1} max={2000} title="Cuántos días hábiles dura"
            onCommit={v => setNueva(x => ({ ...(x || { nombre: "" }), duracion: v }))}
            style={{ width: 80 }} />
          <Button variant="primary" size="sm" onClick={agregar}><Plus size={13} /> Agregar</Button>
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
