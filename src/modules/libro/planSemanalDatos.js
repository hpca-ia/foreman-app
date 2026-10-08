import { supabase } from "../../lib/supabase";
import { anotar, abrirDia } from "./libro";

// La semana que viene, escrita antes. (Los datos; la pantalla es PlanSemanal.jsx.)
//
// El nombre lleva "Datos" a propósito: este archivo y la pantalla no pueden
// llamarse igual cambiando solo una mayúscula. En macOS el resolvedor de
// módulos ignora las mayúsculas y puede traer uno por el otro —pasó: importar
// "./PlanSemanal" traía este y el build decía que no tenía default export—, y
// en el Linux de producción resolvería distinto. Dos archivos que solo se
// distinguen por una mayúscula son un error que aparece en un entorno y no en
// el otro.
//
// El Libro de Obra registra lo que pasó; esto, lo que va a pasar. Es el mismo
// día visto desde el otro lado, y por eso vive acá y no en un módulo aparte:
// un módulo aparte competiría con el libro por la atención del residente, y el
// día terminaría escrito dos veces en dos lugares que nadie compara.
//
// LO QUE SE PLANIFICÓ Y NO SE HIZO ES EL DATO. Un plan que nadie contrasta con
// la realidad es una lista de buenas intenciones. Lo que quedó sin marcar, con
// su motivo, es lo que un mes después explica un atraso — y hoy no existe en
// ningún lado: se discute de memoria.

const falta = e => /relation|column|does not exist|schema cache/i.test(e?.message || "");

/** Los días de un período, incluidos los dos extremos. */
export function diasEntre(desde, hasta, cal = null) {
  const a = new Date(`${String(desde).slice(0, 10)}T12:00:00`);
  const b = new Date(`${String(hasta).slice(0, 10)}T12:00:00`);
  if (isNaN(a) || isNaN(b) || b < a) return [];
  const out = [];
  let f = a, vueltas = 0;
  while (f <= b && vueltas++ < 400) {
    // El domingo no se planifica salvo que la obra trabaje domingos: una
    // semana con dos días vacíos obligatorios se llena de ruido.
    if (!cal || cal.trabaja(f)) out.push(f.toISOString().slice(0, 10));
    f = new Date(f.getTime() + 86400000);
  }
  return out;
}

const masDias = (f, n) => {
  const d = new Date(`${String(f).slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const cuantosDias = (a, b) =>
  Math.round((new Date(`${String(b).slice(0, 10)}T12:00:00`) - new Date(`${String(a).slice(0, 10)}T12:00:00`)) / 86400000) + 1;

/**
 * Qué período proponer al abrir la pantalla.
 *
 * ¿Y SI LA OBRA EMPIEZA UN MIÉRCOLES? Entonces la semana de esa obra es de
 * miércoles a martes, y lo va a ser hasta que termine. El corte no es una
 * propiedad del calendario, es de la obra: se hereda del arranque y después
 * del último plan que se escribió, y la pantalla abre donde corresponde sin
 * que nadie toque las dos fechas.
 *
 * Tres fuentes, en orden:
 *  1. El último plan guardado — su día de arranque y su largo son EL corte de
 *     esta obra, decidido por quien la lleva. Manda sobre cualquier regla.
 *  2. El arranque de la obra (`crono_inicio`) — si empieza el miércoles 8, el
 *     primer plan va del 8 al martes 14.
 *  3. Sin ninguno de los dos, lunes a sábado, que es lo más común.
 *
 * Y después CORRE HASTA HOY manteniendo el corte, de a un paso: el que abre un
 * lunes de marzo no quiere que le ofrezcan la semana de enero porque fue la
 * última que escribió, quiere la de ahora cortada igual que las de enero.
 */
export function proponerPeriodo({ hoy, inicioObra = null, ultimoDesde = null, ultimoHasta = null } = {}) {
  const dia = String(hoy || new Date().toISOString()).slice(0, 10);
  let ancla, largo;
  if (ultimoDesde && ultimoHasta && cuantosDias(ultimoDesde, ultimoHasta) > 0) {
    ancla = String(ultimoDesde).slice(0, 10);
    largo = cuantosDias(ultimoDesde, ultimoHasta);
  } else if (inicioObra) {
    ancla = String(inicioObra).slice(0, 10);
    largo = 7;                         // miércoles a martes
  } else {
    ancla = lunesDeLaSemana(dia);
    largo = 6;                         // lunes a sábado
  }
  // El paso es la semana salvo que el período sea más largo. "De lunes a
  // lunes" son 8 días y se pisan en un día a propósito: el paso sigue siendo
  // 7 y el lunes de cierre es el de apertura del siguiente.
  const paso = largo <= 8 ? 7 : largo;
  // La obra no empezó todavía: el primer plan es el del arranque.
  if (dia <= ancla) return { desde: ancla, hasta: masDias(ancla, largo - 1) };
  const saltos = Math.floor(cuantosDias(ancla, dia) / paso - 1 / paso);
  const desde = masDias(ancla, Math.max(0, saltos) * paso);
  return { desde, hasta: masDias(desde, largo - 1) };
}

/** El período anterior y el siguiente, conservando el corte y el largo. */
export function correrPeriodo(desde, hasta, haciaDonde) {
  const largo = Math.max(1, cuantosDias(desde, hasta));
  const paso = largo <= 8 ? 7 : largo;
  const d = masDias(desde, paso * (haciaDonde < 0 ? -1 : 1));
  return { desde: d, hasta: masDias(d, largo - 1) };
}

export async function cargarPlan(leadId, desde, hasta) {
  if (!leadId) return { dias: [], items: [], periodo: null, sinTablas: false };
  const { data: dias, error } = await supabase.from("obra_plan_dias")
    .select("*").eq("lead_id", leadId).gte("fecha", desde).lte("fecha", hasta).order("fecha");
  if (error) return { dias: [], items: [], periodo: null, sinTablas: falta(error) };
  // El período se lee aunque no haya días: puede existir con observaciones y
  // un plano cargado antes de escribir la primera actividad.
  const periodo = await periodoSiExiste(leadId, desde, hasta);
  if (!dias?.length) return { dias: [], items: [], periodo, sinTablas: false };
  const { data: items } = await supabase.from("obra_plan_items")
    .select("*").in("plan_dia_id", dias.map(d => d.id)).order("orden");
  return { dias, items: items || [], periodo, sinTablas: false };
}

/**
 * El período: desde, hasta, y lo que es del plan entero.
 *
 * Existe porque la semana de obra no es de lunes a sábado. Se planifica de
 * miércoles a martes, de lunes a domingo, de lunes a lunes — y un rango que
 * cruza dos lunes no se puede reconstruir agrupando por lunes: se guardaba
 * partido en dos y al volver traía la mitad. Guardado, el plan vuelve entero.
 *
 * Se busca por `desde`, que es su llave: si alguien corre el `hasta` —porque
 * la semana se estiró al domingo— sigue siendo el mismo plan, y se actualiza.
 */
async function periodoSiExiste(leadId, desde, hasta) {
  const { data, error } = await supabase.from("obra_plan_periodos")
    .select("*").eq("lead_id", leadId).eq("desde", String(desde).slice(0, 10)).maybeSingle();
  if (error || !data) return null;
  if (hasta && data.hasta !== String(hasta).slice(0, 10)) {
    await supabase.from("obra_plan_periodos").update({ hasta: String(hasta).slice(0, 10) }).eq("id", data.id);
    return { ...data, hasta: String(hasta).slice(0, 10) };
  }
  return data;
}

export async function periodoDelPlan(leadId, desde, hasta, quien) {
  if (!leadId || !desde) return { error: "Falta el proyecto o el período." };
  const ya = await periodoSiExiste(leadId, desde, hasta);
  if (ya) return { periodo: ya };
  const { data, error } = await supabase.from("obra_plan_periodos").insert({
    lead_id: leadId, desde: String(desde).slice(0, 10), hasta: String(hasta).slice(0, 10),
    created_by: quien?.id ?? null, created_nombre: quien?.name || null,
  }).select().single();
  if (error) {
    if (falta(error)) return { error: "Falta correr la migración 090." };
    // Dos pestañas abiertas pueden crearlo a la vez; el único que quedó sirve.
    const otro = await periodoSiExiste(leadId, desde, hasta);
    return otro ? { periodo: otro } : { error: error.message };
  }
  return { periodo: data };
}

/**
 * Cerrar el plan: esto es lo que se va a hacer, y queda dicho.
 *
 * Sin el cierre no hay versión. El plan se arma durante la semana —se agregan
 * actividades, se corrige un horario, se adjunta un plano— y el que recibió el
 * correo del lunes no tiene cómo saber si lo que leyó es lo que quedó. Cerrarlo
 * es el acto que convierte una lista en un documento, y por eso mandarlo o
 * imprimirlo viene DESPUÉS.
 *
 * Lo que se congela es el PLAN, no la obra: las tareas se siguen marcando
 * hechas después de cerrado, que es justamente lo que pasa en la semana. Si se
 * congelaran las marcas, el plan cerrado nunca podría compararse con la
 * realidad, que es para lo único que sirve guardarlo.
 */
export async function cerrarPlan(periodoId, quien) {
  const { data, error } = await supabase.from("obra_plan_periodos").update({
    cerrado_at: new Date().toISOString(),
    cerrado_por: quien?.id ?? null,
    cerrado_nombre: quien?.name || null,
  }).eq("id", periodoId).select();
  if (error) return { error: falta(error) ? "Falta correr la migración 090." : error.message };
  if (!data?.length) return { error: "No se pudo cerrar: la base no dejó tocar ese plan." };
  return { periodo: data[0] };
}

/**
 * Reabrirlo. Se puede, y queda sin la marca de cerrado a propósito: un plan
 * que se reabre y se vuelve a cerrar es una versión nueva, y lo honesto es que
 * la fecha de cierre sea la de la última vez. Lo que ya se mandó por correo,
 * mandado está —eso no se puede deshacer y por eso el aviso al reabrir.
 */
export async function reabrirPlan(periodoId) {
  const { error } = await supabase.from("obra_plan_periodos")
    .update({ cerrado_at: null, cerrado_por: null, cerrado_nombre: null }).eq("id", periodoId);
  return error ? error.message : null;
}

/** Lo que no entra en ninguna casilla. Va al pie del informe, del PDF y del correo. */
export async function guardarObservaciones(periodoId, texto) {
  const { error } = await supabase.from("obra_plan_periodos")
    .update({ observaciones: String(texto || "").trim() || null }).eq("id", periodoId);
  return error ? error.message : null;
}

/**
 * Planos, fotos, PDFs del plan.
 *
 * Cuelgan del período y no del día porque no son del martes: son del plan. Un
 * plano que se manda por aparte del plan es el plano que después nadie
 * encuentra, y la consulta que se resolvió con una foto por WhatsApp es la que
 * un mes más tarde no existe.
 */
export async function archivosDelPlan(periodoId) {
  if (!periodoId) return [];
  const { data } = await supabase.from("obra_plan_archivos")
    .select("*").eq("periodo_id", periodoId).order("created_at");
  return data || [];
}

export async function subirArchivoDelPlan(periodo, archivo, descripcion, quien) {
  if (!periodo?.id) return { error: "Guardá primero el período." };
  if (archivo.size > 25 * 1024 * 1024) return { error: "El archivo pasa de 25 MB." };
  const limpio = archivo.name.replace(/[^\w.\-]/g, "_").slice(-60);
  const ruta = `plan-${periodo.id}/${Date.now()}-${limpio}`;
  const { error } = await supabase.storage.from("task-files").upload(ruta, archivo, { upsert: false });
  if (error) return { error: error.message };
  const { data, error: e2 } = await supabase.from("obra_plan_archivos").insert({
    periodo_id: periodo.id, storage_path: ruta, nombre: archivo.name.slice(0, 180),
    tipo: archivo.type || null, tamano: archivo.size,
    descripcion: String(descripcion || "").trim() || null,
    subido_por: quien?.id ?? null, subido_nombre: quien?.name || null,
  }).select().single();
  // Si la fila no entró, el archivo subido queda huérfano: se borra.
  if (e2) {
    await supabase.storage.from("task-files").remove([ruta]);
    return { error: falta(e2) ? "Falta correr la migración 090." : e2.message };
  }
  return { archivo: data };
}

export async function borrarArchivoDelPlan(a) {
  await supabase.storage.from("task-files").remove([a.storage_path]);
  const { error } = await supabase.from("obra_plan_archivos").delete().eq("id", a.id);
  return error ? error.message : null;
}

/** Enlaces temporales para mirarlos, que el depósito es privado. */
export async function enlacesDeArchivos(archivos = []) {
  if (!archivos.length) return {};
  const { data } = await supabase.storage.from("task-files")
    .createSignedUrls(archivos.map(a => a.storage_path), 3600);
  const mapa = {};
  (data || []).forEach((x, i) => { if (x?.signedUrl) mapa[archivos[i].id] = x.signedUrl; });
  return mapa;
}

/** El día, creándolo si hace falta: se escribe en él apenas se toca algo. */
export async function diaDelPlan(leadId, fecha, quien, periodoId = null) {
  const { data } = await supabase.from("obra_plan_dias")
    .select("*").eq("lead_id", leadId).eq("fecha", fecha).maybeSingle();
  if (data) {
    // Un día escrito antes de que el período existiera se engancha ahora.
    if (periodoId && !data.periodo_id) {
      await supabase.from("obra_plan_dias").update({ periodo_id: periodoId }).eq("id", data.id);
      return { dia: { ...data, periodo_id: periodoId } };
    }
    return { dia: data };
  }
  const fila = {
    lead_id: leadId, fecha,
    created_by: quien?.id ?? null, created_nombre: quien?.name || null,
  };
  if (periodoId) fila.periodo_id = periodoId;
  const { data: creado, error } = await supabase.from("obra_plan_dias").insert(fila).select().single();
  if (error) return { error: falta(error) ? "Falta correr la migración 089." : error.message };
  return { dia: creado };
}

export async function guardarDia(diaId, campos) {
  const { error } = await supabase.from("obra_plan_dias").update(campos).eq("id", diaId);
  return error ? error.message : null;
}

export async function agregarItem(dia, { tipo = "tarea", texto, cronograma_actividad_id = null, obra_actividad_id = null, orden = 0 }) {
  if (!String(texto || "").trim()) return { error: "Escribí qué hay que hacer." };
  const { data, error } = await supabase.from("obra_plan_items").insert({
    plan_dia_id: dia.id, tipo, texto: String(texto).trim().slice(0, 300),
    cronograma_actividad_id, obra_actividad_id, orden,
  }).select().single();
  return error ? { error: error.message } : { item: data };
}

export async function borrarItem(id) {
  const { error } = await supabase.from("obra_plan_items").delete().eq("id", id);
  return error ? error.message : null;
}

/**
 * Marcar una tarea del plan como hecha, y que el libro se entere.
 *
 * Esto es la mitad del valor del módulo. El residente ya marca lo que hizo;
 * pedirle además que lo redacte en el libro es pedirle que escriba dos veces lo
 * mismo, y lo que pasa cuando se pide eso es que el libro queda vacío.
 *
 * Al desmarcar NO se borra la entrada del libro: lo que se escribió el día que
 * pasó es el registro, y un registro que se puede deshacer con un clic deja de
 * servir para lo único que sirve un libro de obra. Se anota la corrección.
 */
export async function marcarHecha(item, hecha, quien, { leadId, fecha } = {}) {
  const campos = {
    hecha,
    hecha_at: hecha ? new Date().toISOString() : null,
    hecha_por: hecha ? (quien?.id ?? null) : null,
    hecha_nombre: hecha ? (quien?.name || null) : null,
  };
  // Al marcarla hecha ya no hace falta el motivo de por qué no se hizo.
  if (hecha) campos.motivo = null;

  const { data, error } = await supabase.from("obra_plan_items")
    .update(campos).eq("id", item.id).select();
  if (error) return { error: error.message };
  if (!data?.length) return { error: "No se pudo guardar: la base no dejó tocar esa tarea." };

  // Y el libro de ese día se entera. Si el día ya pasó y no tiene libro,
  // `abrirDia` devuelve null a propósito —un día pasado sin libro no se
  // inventa— y acá eso no es un error: la tarea queda marcada igual.
  if (!leadId || !fecha) return { item: data[0] };
  const { dia } = await abrirDia(leadId, fecha, quien);
  if (!dia) return { item: data[0], sinLibro: true };

  if (hecha && !item.libro_entrada_id) {
    const { entrada } = await anotar(dia, "actividades", item.texto, quien);
    if (entrada?.id) {
      await supabase.from("obra_plan_items").update({ libro_entrada_id: entrada.id }).eq("id", item.id);
    }
  } else if (!hecha && item.libro_entrada_id) {
    await anotar(dia, "observaciones", `Se había dado por hecha y se corrigió: ${item.texto}`, quien);
  }
  return { item: data[0] };
}

/** Por qué no se hizo. Sin motivo, una tarea sin marcar no dice nada. */
export async function guardarMotivo(id, motivo) {
  const { error } = await supabase.from("obra_plan_items").update({ motivo: motivo || null }).eq("id", id);
  return error ? error.message : null;
}

/**
 * Lo que el cronograma dice que toca esa semana.
 *
 * El plan no arranca en blanco: las barras ya saben qué actividades caen entre
 * esas dos fechas, y en qué día de su propia duración van. Escribir a mano lo
 * que la app ya sabe es el trabajo que hace que un módulo de planificación se
 * abandone a la tercera semana.
 */
export function loQueTocaEstaSemana(actividades = [], desde, hasta) {
  const d = String(desde).slice(0, 10);
  const h = String(hasta).slice(0, 10);
  return actividades
    .filter(a => a.inicio && a.fin && String(a.inicio).slice(0, 10) <= h && String(a.fin).slice(0, 10) >= d)
    .map(a => ({
      ...a,
      // Si arranca o termina en la semana, eso es lo que hay que decir: son
      // los dos días en que alguien tiene que estar mirando.
      arranca: String(a.inicio).slice(0, 10) >= d && String(a.inicio).slice(0, 10) <= h,
      termina: String(a.fin).slice(0, 10) >= d && String(a.fin).slice(0, 10) <= h,
    }));
}

/**
 * El lunes de la semana de una fecha.
 *
 * Es la clave con la que se agrupa el histórico. Se calcula con la fecha al
 * mediodía para que ningún cambio de horario corra un día, y a mano en vez de
 * con el número de semana ISO: la semana 1 de enero puede tener días de
 * diciembre, y entonces un plan de fin de año aparecería partido en dos
 * semanas que en la obra fueron una sola.
 */
export function lunesDeLaSemana(fecha) {
  const d = new Date(`${String(fecha).slice(0, 10)}T12:00:00`);
  if (isNaN(d)) return String(fecha).slice(0, 10);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/**
 * Las semanas ya planificadas de esta obra, de la más nueva a la más vieja.
 *
 * El plan se guarda solo, día por día, pero sin un lugar donde verlas juntas
 * cada semana era un papel que se escribía y se perdía. Acá está la historia:
 * qué se planificó cada semana y cómo salió.
 *
 * Y CÓMO SALIÓ ES EL DATO. Una lista de semanas con "12 de 15" al lado es lo
 * que permite ver que la obra viene cumpliendo el 80% y que hace tres semanas
 * que lo que falla es lo mismo. Eso no se ve mirando una semana sola, y es la
 * única razón por la que vale la pena guardar las viejas.
 */
export async function historialDePlanes(leadId) {
  if (!leadId) return { semanas: [], sinTablas: false };
  // Con `periodo_id`, y sin él si la 090 todavía no se corrió: PostgREST falla
  // la consulta ENTERA cuando se le pide una columna que no existe, así que
  // pedirla sin más dejaría el histórico vacío hasta que alguien corra la
  // migración. Se pide, y si no está se vuelve a pedir lo que sí hay.
  let { data: dias, error } = await supabase.from("obra_plan_dias")
    .select("id,fecha,periodo_id").eq("lead_id", leadId).order("fecha", { ascending: false });
  if (error && falta(error)) {
    ({ data: dias, error } = await supabase.from("obra_plan_dias")
      .select("id,fecha").eq("lead_id", leadId).order("fecha", { ascending: false }));
  }
  if (error) return { semanas: [], sinTablas: falta(error) };

  // Los períodos guardados. Son los que mandan: un plan de miércoles a martes
  // cruza dos lunes, y agrupado por lunes se partía en dos entradas que al
  // abrirlas traían la mitad del plan. De ahí venía que no se pudiera volver a
  // uno y editarlo. Lo que no tiene período —lo escrito antes de la 090— se
  // sigue agrupando por lunes para que no desaparezca de la lista.
  const { data: periodos } = await supabase.from("obra_plan_periodos")
    .select("id,desde,hasta,observaciones,cerrado_at").eq("lead_id", leadId).order("desde", { ascending: false });
  const vacios = (periodos || []).filter(p => !(dias || []).some(d => d.periodo_id === p.id));
  if (!dias?.length && !vacios.length) return { semanas: [], sinTablas: false };

  const { data: items } = await supabase.from("obra_plan_items")
    .select("plan_dia_id,tipo,hecha,motivo").in("plan_dia_id", dias.map(d => d.id));
  const porDia = new Map();
  (items || []).forEach(i => {
    if (!porDia.has(i.plan_dia_id)) porDia.set(i.plan_dia_id, []);
    porDia.get(i.plan_dia_id).push(i);
  });

  const porId = new Map((periodos || []).map(p => [p.id, p]));
  const semanas = new Map();
  (dias || []).forEach(d => {
    const p = d.periodo_id ? porId.get(d.periodo_id) : null;
    // La llave es el período si existe, y el lunes si no. Nunca se mezclan: un
    // día con período no puede caer en el grupo por lunes de otro plan.
    const k = p ? `p${p.id}` : `l${lunesDeLaSemana(d.fecha)}`;
    if (!semanas.has(k)) {
      semanas.set(k, p
        ? { clave: k, periodo_id: p.id, desde: p.desde, hasta: p.hasta,
            observaciones: p.observaciones || null, cerrado_at: p.cerrado_at || null,
            fijo: true, dias: 0, items: [] }
        : { clave: k, periodo_id: null, desde: d.fecha, hasta: d.fecha, fijo: false, dias: 0, items: [] });
    }
    const s = semanas.get(k);
    s.dias += 1;
    // Las fechas del período guardado no se corren con los días que tenga: el
    // plan va del miércoles al martes aunque solo se haya escrito el jueves.
    if (!s.fijo) {
      if (d.fecha < s.desde) s.desde = d.fecha;
      if (d.fecha > s.hasta) s.hasta = d.fecha;
    }
    s.items.push(...(porDia.get(d.id) || []));
  });
  // Un período con observaciones o un plano cargado, y ningún día escrito
  // todavía, también es un plan que existe y al que hay que poder volver.
  vacios.forEach(p => semanas.set(`p${p.id}`, {
    clave: `p${p.id}`, periodo_id: p.id, desde: p.desde, hasta: p.hasta,
    observaciones: p.observaciones || null, cerrado_at: p.cerrado_at || null,
    fijo: true, dias: 0, items: [],
  }));

  return {
    semanas: [...semanas.values()]
      .map(s => ({ ...s, lunes: s.desde, ...comoSalio(s.items) }))
      .sort((a, b) => b.desde.localeCompare(a.desde)),
    sinTablas: false,
  };
}

/**
 * Cómo salió la semana: lo planificado contra lo hecho.
 *
 * El número que importa no es cuántas tareas se hicieron, es CUÁLES NO y por
 * qué. Una semana al 80% con las dos de la ruta crítica sin hacer es peor que
 * una al 60% donde lo que faltó era pintura.
 */
export function comoSalio(items = []) {
  const tareas = items.filter(i => i.tipo !== "material");
  const hechas = tareas.filter(i => i.hecha);
  const sinHacer = tareas.filter(i => !i.hecha);
  return {
    total: tareas.length,
    hechas: hechas.length,
    sinHacer,
    sinMotivo: sinHacer.filter(i => !String(i.motivo || "").trim()),
    pct: tareas.length ? Math.round((hechas.length / tareas.length) * 100) : null,
  };
}
