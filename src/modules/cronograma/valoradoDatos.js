import { supabase } from "../../lib/supabase";
import { repartirEntre, repartirParejo, mesesDe, pesosDeTramo } from "./valorado";
import { ETAPAS } from "./cpm";

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
    supabase.from("obra_rubros").select("id,total_base,actividad_id").eq("obra_id", obra.id),
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

  const plata = new Map();
  rubros.forEach(r => {
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
 * Lo que entró después de armar el valorado.
 *
 * Una orden de cambio aprobada NO toca los rubros que ya estaban: agrega
 * rubros nuevos, con monto negativo los que quitan. Así que el valorado no se
 * desactualiza —sus líneas siguen siendo ciertas— pero se queda CORTO: la
 * curva deja de sumar el presupuesto vigente y el cuadro de "previsto contra
 * gastado" acusa un sobregasto que no existe, porque compara el gasto de hoy
 * contra el presupuesto de marzo.
 *
 * Eso no se arregla solo y tampoco se avisa: la obra descubre que el valorado
 * está viejo cuando el cliente pregunta por qué los números no coinciden.
 */
export async function pendientesDeSumar(cronograma) {
  if (!cronograma?.obra_id) return { rubros: [], monto: 0, dias: 0, ordenes: [] };
  const { data: rubros } = await supabase.from("obra_rubros")
    .select("id,numero,codigo,descripcion,capitulo,total_base,orden_cambio_id")
    .eq("obra_id", cronograma.obra_id);
  const { data: lineas } = await supabase.from("cronograma_valorado_lineas")
    .select("obra_rubro_id").eq("cronograma_id", cronograma.id);
  const ya = new Set((lineas || []).map(l => l.obra_rubro_id).filter(Boolean));
  const faltan = (rubros || []).filter(r => !ya.has(r.id));

  // Y el tiempo: las órdenes aprobadas dicen cuántos días suman. Nadie lo
  // estaba leyendo, así que una obra con tres órdenes aprobadas seguía
  // mostrando la fecha de fin del contrato original.
  const { data: ordenes } = await supabase.from("ordenes_cambio")
    .select("id,numero,codigo,titulo,dias_impacto,estado")
    .eq("obra_id", cronograma.obra_id).eq("estado", "aprobada");
  const dias = (ordenes || []).reduce((t, o) => t + (Number(o.dias_impacto) || 0), 0);

  return {
    rubros: faltan,
    monto: Math.round(faltan.reduce((t, r) => t + (Number(r.total_base) || 0), 0) * 100) / 100,
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
export async function sumarAlValorado(cronograma, rubros = [], desdeIndice = 0) {
  if (!rubros.length) return null;
  const meses = cronograma.meses;
  const pesos = repartirEntre(meses, Math.min(desdeIndice, meses - 1), meses - 1);
  const filas = rubros.map((r, i) => ({
    cronograma_id: cronograma.id, obra_rubro_id: r.id,
    codigo: r.codigo || String(r.numero || ""), descripcion: r.descripcion, capitulo: r.capitulo,
    monto: Number(r.total_base) || 0, pesos,
    orden_cambio_id: r.orden_cambio_id || null,
    revisar: true,
    orden: 10000 + i,
  }));
  for (let i = 0; i < filas.length; i += 100) {
    let { error } = await supabase.from("cronograma_valorado_lineas").insert(filas.slice(i, i + 100));
    if (error && /column|schema cache/i.test(error.message)) {
      const limpias = filas.slice(i, i + 100).map(({ orden_cambio_id, revisar, ...resto }) => resto);
      ({ error } = await supabase.from("cronograma_valorado_lineas").insert(limpias));
    }
    if (error) return error.message;
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
    .select("actividad_id,total_base").eq("obra_id", obra.id);

  const plata = new Map();
  (rubros || []).forEach(r => {
    if (r.actividad_id == null) return;
    plata.set(Number(r.actividad_id), (plata.get(Number(r.actividad_id)) || 0) + (Number(r.total_base) || 0));
  });
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
    const total = plata.get(k) || 0;
    const suyo = Number(a.peso_pct) || 0;
    const deLaAgrup = pesoTotal.get(k) || 0;
    // Sin pesos declarados —cronograma viejo o editado a mano— la agrupación
    // se parte en partes iguales entre sus actividades.
    const parte = deLaAgrup > 0
      ? suyo / deLaAgrup
      : 1 / conPlan.filter(x => Number(x.obra_actividad_id) === k).length;

    const ag = agDe.get(k);
    return {
      cronograma_id: cronograma.id,
      obra_actividad_id: k,
      codigo: ag?.codigo || "",
      descripcion: a.etapa && a.etapa !== "ejecucion"
        ? `${ag?.nombre || a.nombre} · ${ETAPAS[a.etapa] || a.etapa}`
        : (ag?.nombre || a.nombre),
      monto: Math.round(total * parte * 100) / 100,
      pesos: pesosDeTramo(a.inicio, a.fin, columnas, trabaja),
      orden: i,
    };
  });

  // Las agrupaciones con plata que el cronograma no nombra.
  const enPlan = new Set(conPlan.map(a => Number(a.obra_actividad_id)));
  const parejo = repartirParejo(meses);
  [...plata.entries()].filter(([id, monto]) => monto > 0 && !enPlan.has(id)).forEach(([id, monto], j) => {
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

  const presupuesto = [...plata.values()].reduce((t, m) => t + m, 0);
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

export async function borrarValorado(id) {
  const { error } = await supabase.from("cronograma_valorado").delete().eq("id", id);
  return error ? error.message : null;
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
