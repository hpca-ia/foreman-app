import { supabase } from "../../lib/supabase";
import { repartirEntre, repartirParejo } from "./valorado";

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
export async function armarDesdeObra({ lead, obra, mesInicio, meses, nivel = "rubro", quien }) {
  const { data: rubros } = await supabase.from("obra_rubros")
    .select("id,numero,codigo,descripcion,capitulo,capitulo_orden,orden,total_base,actividad_id")
    .eq("obra_id", obra.id).order("capitulo_orden").order("orden");
  if (!rubros?.length) return { error: "Esta obra todavía no tiene rubros cargados." };

  const { data: cronograma, error } = await supabase.from("cronograma_valorado").insert({
    lead_id: lead.id, obra_id: obra.id,
    mes_inicio: mesInicio, meses,
    created_by: quien?.id ?? null, created_nombre: quien?.name || null,
  }).select().single();
  if (error) return { error: falta(error) ? "Falta correr la migración 074." : error.message };

  const parejo = repartirParejo(meses);
  let filas;
  if (nivel === "agrupacion") {
    const { data: acts } = await supabase.from("obra_actividades")
      .select("id,codigo,nombre,orden").eq("obra_id", obra.id).order("orden");
    const porAct = new Map();
    rubros.forEach(r => {
      const k = r.actividad_id ?? 0;
      porAct.set(k, (porAct.get(k) || 0) + (Number(r.total_base) || 0));
    });
    filas = [...porAct.entries()].map(([id, monto], i) => {
      const a = (acts || []).find(x => x.id === id);
      return {
        cronograma_id: cronograma.id, obra_actividad_id: id || null,
        codigo: a?.codigo || "", descripcion: a?.nombre || "Sin agrupar",
        monto: Math.round(monto * 100) / 100, pesos: parejo, orden: a?.orden ?? 9000 + i,
      };
    });
  } else {
    filas = rubros.map((r, i) => ({
      cronograma_id: cronograma.id, obra_rubro_id: r.id,
      codigo: r.codigo || String(r.numero || i + 1),
      descripcion: r.descripcion, capitulo: r.capitulo,
      monto: Number(r.total_base) || 0, pesos: parejo, orden: i,
    }));
  }

  // De a tandas: 170 rubros en un solo insert llega al límite y falla entero.
  for (let i = 0; i < filas.length; i += 100) {
    const { error: e } = await supabase.from("cronograma_valorado_lineas").insert(filas.slice(i, i + 100));
    if (e) return { error: "El cronograma se creó pero fallaron las líneas: " + e.message };
  }
  return { cronograma };
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
