import { supabase } from "../../lib/supabase";
import { repartirEntre, repartirParejo, mesesDe, pesosDeTramo } from "./valorado";
import { ETAPAS } from "./cpm";
import { plataDelPlan } from "./plataDelPlan";

// Leer y guardar el cronograma valorado.
//
// Las líneas se arman del presupuesto de la obra y no se escriben a mano: los
// rubros ya están cargados con su monto, y volver a tipearlos es volver a
// equivocarse. Lo único que pone una persona es en qué meses cae cada uno.

const falta = e => /relation|column|does not exist|schema cache/i.test(e?.message || "");

export async function cargarValorado(leadId) {
  if (!leadId) return { cronograma: null, lineas: [], sinTablas: false };
  const { data, error } = await supabase.from("cronograma_valorado")
    .select("*").eq("lead_id", leadId).order("id", { ascending: false }).limit(1);
  if (error) return { cronograma: null, lineas: [], sinTablas: falta(error) };
  const cronograma = data?.[0] || null;
  if (!cronograma) return { cronograma: null, lineas: [], sinTablas: false };
  const { data: lineas } = await supabase.from("cronograma_valorado_lineas")
    .select("*").eq("cronograma_id", cronograma.id).order("orden");
  return { cronograma, lineas: lineas || [], sinTablas: false };
}

/**
 * Armarlo del presupuesto de la obra.
 *
 * Arranca con todo repartido parejo, que es un valorado malo pero completo:
 * desde ahí se corrige lo que se sabe distinto —la estructura adelante, los
 * acabados al final— y lo que no se tocó igual suma el presupuesto entero. Al
 * revés, arrancando vacío, el primer valorado queda a medio llenar y no sirve
 * para nada.
 *
 * @param nivel "rubro" (como el Excel) o "agrupacion" (uno grueso, de una tarde)
 */
/**
 * Armar el valorado de las AGRUPACIONES de la obra. Nunca de los rubros.
 *
 * Antes se podía elegir "por rubro" o "por agrupación", y por rubro era lo que
 * venía marcado. Eso estaba mal y no era un detalle de preferencia: el control
 * de obra se planilla por agrupación, el cronograma de barras se arma por
 * agrupación, y un valorado por rubro no se puede comparar con ninguno de los
 * dos. Tres documentos de la misma obra hablando de tres cosas distintas.
 *
 * Una línea por agrupación, en el orden del control de obra, con su código y
 * su nombre. Las que no están agrupadas se juntan en una sola línea al final,
 * que es lo que son: plata del presupuesto que todavía nadie ordenó.
 *
 * Arranca con todo repartido parejo —un valorado malo pero completo— y desde
 * ahí se corrige lo que se sabe distinto. Al revés, arrancando vacío, el
 * primer valorado queda a medio llenar y no sirve para nada.
 */
export async function armarDesdeObra({ lead, obra, mesInicio, meses, quien }) {
  const [{ data: rubros }, { data: acts }] = await Promise.all([
    supabase.from("obra_rubros").select("id,total_base,actividad_id,anulado_por_oc").eq("obra_id", obra.id),
    supabase.from("obra_actividades").select("id,codigo,nombre,orden,extra").eq("obra_id", obra.id).order("orden"),
  ]);
  if (!rubros?.length) return { error: "Esta obra todavía no tiene rubros cargados." };
  if (!acts?.length) {
    return { error: "Esta obra todavía no tiene agrupaciones. Se arman en Control de Obra → Agrupaciones, y de ahí salen los dos cronogramas." };
  }

  const { data: cronograma, error } = await supabase.from("cronograma_valorado").insert({
    lead_id: lead.id, obra_id: obra.id,
    mes_inicio: mesInicio, meses,
    created_by: quien?.id ?? null, created_nombre: quien?.name || null,
  }).select().single();
  if (error) return { error: falta(error) ? "Falta correr la migración 074." : error.message };

  // EL MISMO TOTAL QUE EL CONTROL DE OBRA, rubro por rubro.
  //
  // El rubro que una orden de cambio sacó del contrato sigue en la lista
  // —tachado, con el número de la orden, porque es historia del presupuesto—
  // pero su plata ya no es parte de lo que hay que hacer. El control lo
  // excluye al sumar y el valorado lo estaba sumando: por eso los totales de
  // una agrupación no coincidían entre las dos pantallas.
  const plata = new Map();
  rubros.filter(r => !r.anulado_por_oc).forEach(r => {
    const k = r.actividad_id ?? 0;
    plata.set(k, (plata.get(k) || 0) + (Number(r.total_base) || 0));
  });

  const parejo = repartirParejo(meses);
  const filas = acts.map((a, i) => ({
    cronograma_id: cronograma.id, obra_actividad_id: a.id,
    codigo: a.codigo || "", descripcion: a.nombre,
    monto: Math.round((plata.get(a.id) || 0) * 100) / 100,
    pesos: parejo, orden: i,
  })).filter(f => f.monto > 0);

  // Lo que quedó sin agrupar, en una línea y dicho como lo que es. Esconderlo
  // haría que el valorado sume menos que el presupuesto, y un valorado que no
  // cuadra con el contrato no se usa.
  const suelto = Math.round((plata.get(0) || 0) * 100) / 100;
  if (suelto > 0) {
    filas.push({
      cronograma_id: cronograma.id, obra_actividad_id: null,
      codigo: "", descripcion: "Rubros todavía sin agrupar",
      monto: suelto, pesos: parejo, orden: filas.length, revisar: true,
    });
  }

  for (let i = 0; i < filas.length; i += 100) {
    const { error: e } = await supabase.from("cronograma_valorado_lineas").insert(filas.slice(i, i + 100));
    if (e) return { error: "El cronograma se creó pero fallaron las líneas: " + e.message };
  }
  return { cronograma, lineas: filas.length, sinAgrupar: suelto };
}

/**
 * Lo que cambió en el control desde que se armó el valorado.
 *
 * SE COMPARA POR AGRUPACIÓN, que es la unidad del valorado. Antes se comparaba
 * por rubro —de cuando el valorado se armaba rubro por rubro— y desde que pasó
 * a armarse por agrupación eso daba una alarma falsa enorme: ninguna línea
 * tenía rubro, así que TODOS los rubros del presupuesto figuraban como recién
 * entrados por órdenes de cambio. Una alarma que grita un número inventado es
 * peor que no tener alarma: la segunda vez ya nadie la lee.
 *
 * Dos cosas pasan y son distintas:
 *
 *   AGRUPACIONES NUEVAS. Una orden de cambio trajo trabajo que no estaba, o
 *   alguien agregó un capítulo en el control. Falta su plata en la curva.
 *
 *   AGRUPACIONES QUE CAMBIARON DE MONTO. Es lo más común: la orden no agrega
 *   un capítulo, modifica rubros de uno que ya estaba. La línea del valorado
 *   sigue diciendo lo que valía en marzo, así que la curva deja de sumar el
 *   presupuesto vigente y el cuadro de "previsto contra gastado" acusa un
 *   sobregasto que no existe.
 *
 * Nada de esto se arregla solo, y sin aviso la obra se entera cuando el
 * cliente pregunta por qué los números no coinciden.
 */
export async function pendientesDeSumar(cronograma) {
  const vacio = { nuevas: [], cambiadas: [], monto: 0, dias: 0, ordenes: [] };
  if (!cronograma?.obra_id) return vacio;

  const [{ data: rubros }, { data: acts }, { data: lineas }] = await Promise.all([
    supabase.from("obra_rubros").select("id,total_base,actividad_id,anulado_por_oc").eq("obra_id", cronograma.obra_id),
    supabase.from("obra_actividades").select("id,codigo,nombre,orden,extra").eq("obra_id", cronograma.obra_id).order("orden"),
    supabase.from("cronograma_valorado_lineas").select("obra_actividad_id,monto").eq("cronograma_id", cronograma.id),
  ]);

  // Lo que vale hoy cada agrupación, con la misma regla que el control: sin
  // los rubros que una orden de cambio sacó del contrato.
  const hoy = new Map();
  (rubros || []).filter(r => !r.anulado_por_oc).forEach(r => {
    const k = Number(r.actividad_id) || 0;
    hoy.set(k, Math.round(((hoy.get(k) || 0) + (Number(r.total_base) || 0)) * 100) / 100);
  });

  // Lo que el valorado tiene escrito para cada una.
  const enCurva = new Map();
  (lineas || []).forEach(l => {
    const k = Number(l.obra_actividad_id) || 0;
    enCurva.set(k, Math.round(((enCurva.get(k) || 0) + (Number(l.monto) || 0)) * 100) / 100);
  });

  const nombreDe = new Map((acts || []).map(a => [Number(a.id), a]));
  const nuevas = [];
  const cambiadas = [];
  hoy.forEach((monto, id) => {
    if (!id || monto <= 0) return;
    const ag = nombreDe.get(id);
    if (!ag || ag.extra) return;
    if (!enCurva.has(id)) { nuevas.push({ ...ag, monto }); return; }
    const antes = enCurva.get(id);
    const dif = Math.round((monto - antes) * 100) / 100;
    // Un dólar de diferencia es un redondeo, no una orden de cambio.
    if (Math.abs(dif) < 1) return;
    cambiadas.push({ ...ag, antes, ahora: monto, dif });
  });

  // EL CAPÍTULO QUE SE QUEDÓ SIN PLATA.
  //
  // Una orden de cambio puede anular TODOS los rubros de un capítulo. Entonces
  // ese capítulo deja de existir en el presupuesto de hoy, así que recorrer
  // solo lo que hay hoy nunca lo encuentra — y su plata se queda en la curva
  // para siempre, sumando un trabajo que ya nadie va a hacer. Hay que mirar
  // también del otro lado: lo que la curva tiene y el control ya no.
  enCurva.forEach((antes, id) => {
    if (!id || antes <= 0 || (hoy.get(id) || 0) > 0) return;
    const ag = nombreDe.get(id);
    cambiadas.push({
      ...(ag || { id, nombre: "Capítulo que ya no está" }),
      antes, ahora: 0, dif: Math.round(-antes * 100) / 100,
    });
  });

  // Y el tiempo: las órdenes aprobadas dicen cuántos días suman. Nadie lo
  // estaba leyendo, así que una obra con tres órdenes aprobadas seguía
  // mostrando la fecha de fin del contrato original.
  const { data: ordenes } = await supabase.from("ordenes_cambio")
    .select("id,numero,codigo,titulo,dias_impacto,estado")
    .eq("obra_id", cronograma.obra_id).eq("estado", "aprobada");
  const dias = (ordenes || []).reduce((t, o) => t + (Number(o.dias_impacto) || 0), 0);

  return {
    nuevas, cambiadas,
    monto: Math.round((nuevas.reduce((t, a) => t + a.monto, 0)
      + cambiadas.reduce((t, a) => t + a.dif, 0)) * 100) / 100,
    dias,
    ordenes: ordenes || [],
  };
}

/**
 * Sumarlos a la curva, repartidos en lo que queda de obra.
 *
 * Se reparten desde el mes que viene hasta el final: una orden de cambio se
 * ejecuta de ahora en adelante, no hacia atrás. Quedan marcadas para revisar
 * —casi siempre van en dos o tres meses concretos y no estirados hasta el
 * final—, pero la plata entra YA a la curva: dejarla afuera hasta que alguien
 * la acomode es exactamente el error que esto viene a arreglar.
 */
export async function sumarAlValorado(cronograma, pendiente, desdeIndice = 0) {
  const nuevas = pendiente?.nuevas || [];
  const cambiadas = pendiente?.cambiadas || [];
  if (!nuevas.length && !cambiadas.length) return null;
  const meses = cronograma.meses;
  const pesos = repartirEntre(meses, Math.min(desdeIndice, meses - 1), meses - 1);

  // Las que cambiaron de monto se corrigen en su línea: su plata ya está en la
  // curva repartida en los meses que alguien decidió, y rehacer ese reparto
  // porque cambió el total sería tirar ese trabajo. Se ajusta el monto y el
  // reparto se respeta.
  for (const a of cambiadas) {
    const { data: suyas } = await supabase.from("cronograma_valorado_lineas")
      .select("id,monto").eq("cronograma_id", cronograma.id).eq("obra_actividad_id", a.id);
    if (!suyas?.length) continue;
    // Repartido entre sus líneas en la misma proporción que tenían: una
    // agrupación partida en etapas no se vuelve una sola línea por esto.
    const total = suyas.reduce((t, l) => t + (Number(l.monto) || 0), 0);
    for (const [i, l] of suyas.entries()) {
      const parte = total > 0 ? (Number(l.monto) || 0) / total : 1 / suyas.length;
      const monto = i === suyas.length - 1
        ? Math.round((a.ahora - suyas.slice(0, -1).reduce((t, x, k) => {
            const p = total > 0 ? (Number(x.monto) || 0) / total : 1 / suyas.length;
            void k; return t + Math.round(a.ahora * p * 100) / 100;
          }, 0)) * 100) / 100
        : Math.round(a.ahora * parte * 100) / 100;
      await supabase.from("cronograma_valorado_lineas").update({ monto, revisar: true }).eq("id", l.id);
    }
  }

  // Las nuevas entran repartidas en lo que queda de obra: una orden de cambio
  // se ejecuta de ahora en adelante, no hacia atrás. Quedan marcadas para
  // revisar —casi siempre van en dos o tres meses concretos y no estiradas
  // hasta el final— pero la plata entra YA a la curva: dejarla afuera hasta
  // que alguien la acomode es tener un valorado que no suma el contrato.
  if (nuevas.length) {
    const filas = nuevas.map((a, i) => ({
      cronograma_id: cronograma.id, obra_actividad_id: a.id,
      codigo: a.codigo || "", descripcion: a.nombre,
      monto: Math.round(a.monto * 100) / 100, pesos,
      revisar: true, orden: 10000 + i,
    }));
    for (let i = 0; i < filas.length; i += 100) {
      let { error } = await supabase.from("cronograma_valorado_lineas").insert(filas.slice(i, i + 100));
      if (error && /column|schema cache/i.test(error.message)) {
        const limpias = filas.slice(i, i + 100).map(({ revisar, ...resto }) => resto);
        ({ error } = await supabase.from("cronograma_valorado_lineas").insert(limpias));
      }
      if (error) return error.message;
    }
  }
  return null;
}

/**
 * Armarlo con lo que propuso NOVA.
 *
 * Igual que armarDesdeObra, pero cada rubro entra con el reparto que NOVA le
 * dio en vez de parejo. Los que marcó especiales —lo importado, lo que se
 * fabrica, los contratos con anticipo— quedan señalados para revisar: son
 * pocos y son los que de verdad hay que mirar, porque son los que mueven plata
 * meses antes de que se vea algo en la obra.
 */
export async function armarConNova({ lead, obra, mesInicio, meses, propuesta, quien }) {
  const { data: cronograma, error } = await supabase.from("cronograma_valorado").insert({
    lead_id: lead.id, obra_id: obra.id, mes_inicio: mesInicio, meses,
    created_by: quien?.id ?? null, created_nombre: quien?.name || null,
  }).select().single();
  if (error) return { error: falta(error) ? "Falta correr la migración 074." : error.message };

  const filas = propuesta.lineas.map((l, i) => ({
    cronograma_id: cronograma.id, obra_rubro_id: l.rubro.id,
    codigo: l.rubro.codigo || String(l.rubro.numero || i + 1),
    descripcion: l.rubro.descripcion, capitulo: l.rubro.capitulo,
    monto: Number(l.rubro.total_base) || 0, pesos: l.pesos,
    revisar: !!l.especial, orden: i,
  }));
  for (let i = 0; i < filas.length; i += 100) {
    let { error: e } = await supabase.from("cronograma_valorado_lineas").insert(filas.slice(i, i + 100));
    if (e && /column|schema cache/i.test(e.message)) {
      const limpias = filas.slice(i, i + 100).map(({ revisar, ...resto }) => resto);
      ({ error: e } = await supabase.from("cronograma_valorado_lineas").insert(limpias));
    }
    if (e) return { error: "El cronograma se creó pero fallaron las líneas: " + e.message };
  }
  return { cronograma };
}

/**
 * El valorado, sacado del cronograma de barras.
 *
 * Son dos vistas de lo mismo y hasta ahora se armaban por separado, cada una
 * con su propia consulta a NOVA. Eso garantiza que en algún momento digan
 * cosas distintas sobre la misma ventanería, y entonces hay dos documentos
 * para mantener de acuerdo a mano — que es como uno de los dos queda viejo sin
 * que nadie se entere.
 *
 * Acá el cronograma manda. Cada actividad tiene su agrupación, su parte de la
 * plata de esa agrupación y sus fechas; de ahí sale en qué mes cae cada peso.
 * Y las ETAPAS caen solas: la ventanería que se anticipa en marzo, se fabrica
 * hasta junio y se instala en agosto son tres actividades, y su plata va en
 * esos tres momentos sin que nadie la reparta a mano.
 *
 * DOS CUIDADOS, porque de ellos depende que el valorado sirva:
 *
 *   · Los pesos de las actividades de una misma agrupación se normalizan a
 *     100 entre ellas. Si se movió el cronograma a mano y quedaron en 70, la
 *     agrupación aportaría el 70% de su plata y el valorado sumaría menos que
 *     el contrato.
 *   · La agrupación con plata y sin actividad en el cronograma entra igual,
 *     marcada para revisar y repartida en todo el plazo. Dejarla afuera
 *     escondería plata del presupuesto, que es peor que mostrarla mal puesta.
 */
export async function valoradoDelCronograma({ lead, obra, actividadesPlan = [], mesInicio, meses, quien, cal }) {
  const { data: ags } = await supabase.from("obra_actividades")
    .select("id,nombre,codigo,orden").eq("obra_id", obra.id).order("orden");
  const { data: rubros } = await supabase.from("obra_rubros")
    .select("actividad_id,total_base,anulado_por_oc,crono_actividad_id").eq("obra_id", obra.id);

  // La misma cuenta que el cronograma: de los rubros asignados cuando los hay,
  // del porcentaje cuando no, y sin los anulados por una orden de cambio. Un
  // solo lugar donde se decide cuánta plata lleva una barra, para que las dos
  // pantallas no digan dos totales de lo mismo.
  const { porActividad, porAgrupacion } = plataDelPlan(actividadesPlan, rubros || []);
  const agDe = new Map((ags || []).map(a => [Number(a.id), a]));

  const conPlan = actividadesPlan.filter(a => a.obra_actividad_id && a.inicio && a.fin);
  if (!conPlan.length) {
    return { error: "El cronograma todavía no tiene actividades con agrupación y fechas. Armalo primero." };
  }

  // Lo que suma cada agrupación en el cronograma, para normalizar sus pesos.
  const pesoTotal = new Map();
  conPlan.forEach(a => {
    const k = Number(a.obra_actividad_id);
    pesoTotal.set(k, (pesoTotal.get(k) || 0) + (Number(a.peso_pct) || 0));
  });

  const columnas = mesesDe(mesInicio, meses);
  const trabaja = cal ? f => cal.trabaja(f) : null;

  const { data: cronograma, error } = await supabase.from("cronograma_valorado").insert({
    lead_id: lead.id, obra_id: obra.id, mes_inicio: mesInicio, meses,
    nombre: "Valorado del cronograma",
    created_by: quien?.id ?? null, created_nombre: quien?.name || null,
  }).select().single();
  if (error) return { error: falta(error) ? "Falta correr la migración 074." : error.message };

  const filas = conPlan.map((a, i) => {
    const k = Number(a.obra_actividad_id);
    const ag = agDe.get(k);
    return {
      cronograma_id: cronograma.id,
      obra_actividad_id: k,
      codigo: ag?.codigo || "",
      descripcion: a.etapa && a.etapa !== "ejecucion"
        ? `${ag?.nombre || a.nombre} · ${ETAPAS[a.etapa] || a.etapa}`
        : (ag?.nombre || a.nombre),
      monto: Math.round((porActividad.get(a.id) || 0) * 100) / 100,
      pesos: pesosDeTramo(a.inicio, a.fin, columnas, trabaja),
      orden: i,
    };
  });

  // Las agrupaciones con plata que el cronograma no nombra.
  const enPlan = new Set(conPlan.map(a => Number(a.obra_actividad_id)));
  const parejo = repartirParejo(meses);
  [...porAgrupacion.entries()].filter(([id, monto]) => id && monto > 0 && !enPlan.has(id)).forEach(([id, monto], j) => {
    const ag = agDe.get(id);
    filas.push({
      cronograma_id: cronograma.id,
      obra_actividad_id: id,
      codigo: ag?.codigo || "",
      descripcion: ag?.nombre || "Agrupación sin actividad",
      monto: Math.round(monto * 100) / 100,
      pesos: parejo,
      orden: filas.length + j,
      revisar: true,
    });
  });

  for (let i = 0; i < filas.length; i += 100) {
    const { error: e } = await supabase.from("cronograma_valorado_lineas").insert(filas.slice(i, i + 100));
    if (e) return { error: "El valorado se creó pero fallaron las líneas: " + e.message };
  }

  const presupuesto = [...porAgrupacion.values()].reduce((t, m) => t + m, 0);
  const puesto = filas.reduce((t, f) => t + f.monto, 0);
  return {
    cronograma,
    lineas: filas.length,
    sinActividad: filas.filter(f => f.revisar).length,
    // Si estos dos no coinciden, el valorado no sirve para pedir plata: mejor
    // que lo diga la pantalla que descubrirlo cuando el cliente compara.
    descuadre: Math.abs(presupuesto - puesto) > 1 ? Math.round((puesto - presupuesto) * 100) / 100 : 0,
  };
}

/** Mover el tramo de una línea: en qué mes empieza y en cuál termina. */
export async function moverTramo(linea, desde, hasta, meses) {
  const pesos = repartirEntre(meses, desde, hasta);
  const { error } = await supabase.from("cronograma_valorado_lineas")
    .update({ pesos }).eq("id", linea.id);
  return error ? error.message : null;
}

/** Los porcentajes a mano, para el que quiere afinar una fila. */
export async function guardarPesos(lineaId, pesos) {
  const { error } = await supabase.from("cronograma_valorado_lineas")
    .update({ pesos }).eq("id", lineaId);
  return error ? error.message : null;
}

export async function guardarCronograma(id, campos) {
  const { error } = await supabase.from("cronograma_valorado").update(campos).eq("id", id);
  return error ? error.message : null;
}

/**
 * Borrar el valorado y empezar de cero.
 *
 * Se van TODOS los del proyecto, no el último. La pantalla muestra siempre el
 * más nuevo, así que borrando uno solo aparecía el anterior —que casi siempre
 * es una prueba vieja de hace meses— y parecía que el borrado no había
 * funcionado. Peor: parecía que el valorado se había "arreglado" solo, con
 * números de otra época.
 *
 * Con `select()` para saber si de verdad se borró: un DELETE que no tocó
 * ninguna fila vuelve sin error, y una pantalla que sigue mostrando lo mismo
 * después de borrar es indistinguible de una rota.
 */
export async function borrarValorado(leadId) {
  const { data, error } = await supabase.from("cronograma_valorado")
    .delete().eq("lead_id", leadId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "No se borró nada: la base no dejó tocar esos cronogramas." };
  // Las líneas se van solas: cuelgan del cronograma con borrado en cascada.
  return { borrados: data.length };
}

/**
 * Cambiar la cantidad de meses sin perder lo repartido.
 *
 * Si se alarga, las filas siguen sumando 100 y los meses nuevos quedan en
 * cero; si se acorta, lo que caía en los meses que se van se empuja al último
 * que queda. Rehacer todo parejo sería tirar el trabajo de una tarde por
 * agregar un mes.
 */
export function ajustarPesos(pesos = [], meses) {
  const total = Math.max(1, meses || 1);
  const salida = Array(total).fill(0);
  (pesos || []).forEach((p, i) => {
    if (i < total) salida[i] += Number(p) || 0;
    else salida[total - 1] += Number(p) || 0;
  });
  return salida.map(v => Math.round(v * 100) / 100);
}
