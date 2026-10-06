import { useEffect, useState, useCallback } from "react";
import { Plus, ChevronLeft, GanttChartSquare, AlertTriangle } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import Numero from "../../components/ui/Numero";
import { calendario, calcular, aFecha, claveFecha, ETAPAS, ajustarAlPlazo, nivelarPorPlata, curvaValorada } from "./cpm";
import { materiaPrima, proponerCronograma, guardarPropuesta, aprenderDelCronograma } from "./novaCronograma";
import { bajarProject } from "./exportarProject";
import TablaGantt from "./TablaGantt";
import PartirEnEtapas from "./PartirEnEtapas";
import { guardarPlazo, desfase, diasDelPlazo } from "./plazo";
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
  // La actividad que se está partiendo en etapas, si hay alguna.
  const [partiendo, setPartiendo] = useState(null);
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
      setAgrupaciones(ags || []);
      // La plata de cada agrupación: es lo que convierte este cronograma en
      // uno valorado. Sin ella las barras dicen cuándo, y no cuánto.
      const { data: rub } = await supabase.from("obra_rubros")
        .select("actividad_id,total_base").eq("obra_id", lead.obra_id);
      const m = {};
      (rub || []).forEach(r => {
        if (r.actividad_id == null) return;
        m[r.actividad_id] = (m[r.actividad_id] || 0) + (Number(r.total_base) || 0);
      });
      setPlata(m);
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
  // LO QUE ATA ESTE CRONOGRAMA CON EL VALORADO.
  //
  // El Gantt se hace primero y el valorado sale de él: la plata sigue a la
  // ejecución, no al revés, porque solo se puede planillar lo que se
  // construyó. Y de un valorado no se podría sacar un Gantt — un porcentaje
  // mensual no dice qué traba a qué ni qué no puede atrasarse.
  //
  // Lo que sí viaja de vuelta es el techo de plata del cliente, y por eso
  // acá se muestra cuánto sale cada mes: es donde se ve si el plan se puede
  // pagar, que es la mitad de si se puede hacer.
  const montoDe = a => (plata[a.obra_actividad_id] || 0) * ((Number(a.peso_pct) ?? 100) / 100);
  const curvaPlata = todas.length ? curvaValorada(todas.map(a => ({ ...a, monto: montoDe(a) })), cal, "mes") : [];
  const topeMes = Number(lead.crono_tope_mes) || 0;
  const picoMes = curvaPlata.length ? Math.max(...curvaPlata.map(c => c.monto)) : 0;

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
      nombre: `${base} · ${ETAPAS[primera.id]}`,
      duracion: primera.duracion, etapa: primera.id,
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
        nombre: `${base} · ${ETAPAS[et.id]}`,
        duracion: et.duracion, etapa: et.id,
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

          {/* LA PLATA QUE PIDE EL PLAN, MES A MES.
              Acá se ve que los dos cronogramas son el mismo: estas barras son
              el cronograma valorado, dicho desde el lado del tiempo. Y es
              donde se contesta la otra mitad de "¿se puede hacer?": si el
              cliente no puede poner lo que el mes pide, ese mes no se ejecuta
              como está escrito, y la obra se para — que es la peor manera de
              enterarse de que el plan era optimista. */}
          {curvaPlata.length > 0 && (
            <div style={{ flexBasis: "100%", borderTop: `1px solid ${colors.neutralSoft}`, paddingTop: 9 }}>
              <div style={{ display: "flex", gap: 9, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 7 }}>
                <div>
                  <label style={{ fontSize: 9.5, fontWeight: 700, color: colors.muted, letterSpacing: 0.3, display: "block", marginBottom: 3 }}>
                    EL CLIENTE PONE POR MES
                  </label>
                  <Numero value={topeMes || null} min={0} max={99999999} entero={false} vacio={null} placeholder="sin tope"
                    style={{ width: 118, padding: "6px 9px", fontSize: 12 }}
                    onCommit={async v => {
                      const err = await guardarPlazo(lead.id, { topeMes: v });
                      if (err) { setError(err); return; }
                      setError(""); setLead(l => ({ ...l, crono_tope_mes: v }));
                    }} />
                </div>
                <div style={{ fontSize: 11, color: colors.muted, lineHeight: 1.5, flex: 1, minWidth: 220 }}>
                  Lo que pide el plan: <strong style={{ color: colors.inkSoft }}>{fmt(picoMes)}</strong> en el mes más
                  cargado. Esto es el cronograma valorado visto desde el tiempo — el mismo plan, dicho en plata.
                </div>
                {topeMes > 0 && picoMes > topeMes && (
                  <Button variant="primary" size="sm" disabled={pensando} onClick={async () => {
                    if (!window.confirm(
                      `¿Acomodar el cronograma para que ningún mes pase de ${fmt(topeMes)}?\n\n` +
                      "Se corren hacia adelante solo las actividades QUE TIENEN COLCHÓN, y dentro de su colchón. " +
                      "La ruta crítica no se toca y la fecha de entrega no se mueve: si no alcanza con eso, te lo digo.")) return;
                    setPensando(true);
                    const r = nivelarPorPlata({
                      actividades, dependencias, inicio: lead.crono_inicio || hoy(), cal, montoDe, tope: topeMes,
                    });
                    for (const m of r.movidas) {
                      await supabase.from("cronograma_actividades").update({ inicio_fijo: m.inicio_fijo }).eq("id", m.id);
                    }
                    setPensando(false);
                    await cargar();
                    window.alert(
                      (r.movidas.length
                        ? `Corrí ${r.movidas.length} ${r.movidas.length === 1 ? "actividad" : "actividades"} dentro de su colchón:\n` +
                          r.movidas.slice(0, 8).map(m => `· ${m.nombre}, ${m.dias} días`).join("\n")
                        : "No encontré nada con colchón para correr.") +
                      (r.apretados.length
                        ? `\n\nSiguen apretados ${r.apretados.length} ${r.apretados.length === 1 ? "mes" : "meses"}: ` +
                          r.apretados.slice(0, 4).map(x => `${x.corte} (${fmt(x.exceso)} de más)`).join(", ") +
                          ".\n\nPara alivianarlos habría que mover la ruta crítica, y eso atrasa la entrega. Esa decisión es tuya: " +
                          "o se consigue más plata esos meses, o se corre la fecha."
                        : "\n\nNingún mes pasa del tope.")
                    );
                  }}>Aplanar la curva</Button>
                )}
              </div>

              {/* Las barras. Rojas las que se pasan de lo que el cliente pone. */}
              <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 42 }}>
                {curvaPlata.map(c => {
                  const alto = picoMes ? Math.max(3, (c.monto / picoMes) * 38) : 3;
                  const pasa = topeMes > 0 && c.monto > topeMes;
                  return (
                    <div key={c.corte} title={`${c.corte}: ${fmt(c.monto)}${pasa ? ` · ${fmt(c.monto - topeMes)} más de lo que entra` : ""}`}
                      style={{ flex: 1, minWidth: 6, height: alto, borderRadius: 2,
                        background: pasa ? colors.danger : colors.brand, opacity: pasa ? 0.9 : 0.55 }} />
                  );
                })}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: colors.muted, marginTop: 2 }}>
                <span>{curvaPlata[0]?.corte}</span>
                <span>{curvaPlata[curvaPlata.length - 1]?.corte}</span>
              </div>
            </div>
          )}

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
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            <Button variant={todas.length ? "outline" : "primary"} size="sm"
              onClick={() => { setArmando({ propuesta: null }); setError(""); }}>
              {todas.length ? "Rearmarlo con NOVA" : "Que lo arme NOVA del presupuesto"}
            </Button>
            {todas.length > 0 && (
              <>
                {/* A veces hay que entregarlo: una fiscalización lo pide en
                    Project, un contrato público lo exige. Negarse obliga a
                    llevar dos cronogramas, y el segundo queda viejo siempre. */}
                <Button variant="outline" size="sm" onClick={() => bajarProject({
                  nombre: `Cronograma ${lead.nombre}`, actividades: todas, dependencias,
                  inicio: plan.inicio, fin: plan.fin, cal,
                })}>
                  Bajar para Project
                </Button>
                <Button variant="outline" size="sm" disabled={pensando} onClick={async () => {
                  setPensando(true);
                  // Con las cantidades del presupuesto: lo que vale para la
                  // obra siguiente no son los días —esa obra tiene otros
                  // metros— sino cuánto rinde por día.
                  const mp = obra?.id ? await materiaPrima(obra.id) : [];
                  const n = await aprenderDelCronograma(todas, currentUser, mp);
                  setPensando(false); setError("");
                  window.alert(`NOVA anotó ${n} actividades para la próxima obra: los días, y dónde hay cantidades, el rendimiento por día.`);
                }}>
                  Que NOVA lo aprenda
                </Button>
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
        const d = desfase(actividades.map(a => a.obra_actividad_id), agrupaciones);
        if (!d.perdidas.length && !d.nuevas.length) return null;
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
                {d.perdidas.length > 0 && (
                  <div style={{ marginTop: d.nuevas.length ? 3 : 0 }}>
                    Y {d.perdidas.length} {d.perdidas.length === 1 ? "actividad apunta" : "actividades apuntan"} a
                    una agrupación que ya no existe. Siguen calculándose bien; solo perdieron de dónde salía su plata.
                  </div>
                )}
              </div>
            </div>
            {d.nuevas.length > 0 && editable && (
              <Button variant="primary" size="sm" disabled={pensando} onClick={async () => {
                // Al final y sin encadenar: dónde van en el orden lo sabe quien
                // hace la obra, y adivinarlo sería meter dependencias falsas
                // que después hay que descubrir y borrar.
                const filas = d.nuevas.map((a, i) => ({
                  lead_id: lead.id, obra_id: lead.obra_id || null,
                  nombre: a.nombre, duracion: 10, obra_actividad_id: a.id,
                  orden: actividades.length + i,
                  // Toda su plata en una sola barra, que es el caso normal.
                  // Se escribe explícito —y no se deja en null— porque el
                  // valorado reparte con estos pesos: una agrupación que entra
                  // sin peso aportaría de menos.
                  ...(conEtapas ? { etapa: "ejecucion", peso_pct: 100 } : {}),
                }));
                const { error: e } = await supabase.from("cronograma_actividades").insert(filas);
                if (e) setError(e.message);
                await cargar();
              }}>Sumarlas al cronograma</Button>
            )}
          </div>
        );
      })()}

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
          onUnir={unir} onQuitar={quitar} onPartir={a => setPartiendo(a)} />
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
          Tocá el <strong style={{ color: colors.inkSoft }}>nombre</strong> de una actividad y se abre su ficha: de qué
          depende, en qué momento va, qué parte de la plata lleva y desde cuándo. Para{" "}
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
