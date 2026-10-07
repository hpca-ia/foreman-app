import { supabase } from "../../lib/supabase";

// Cerrar una vuelta de caja chica.
//
// Una caja chica va por vueltas: se entrega un fondo, se gasta, se rinde, y
// recién entonces se repone. El abono nuevo ES el acuse de que la vuelta
// anterior se rindió —nadie repone una caja que todavía no le rindieron— y
// por eso es lo que habilita el cierre.
//
// Sin esto la caja es una lista que crece sin fin: al mes cuatro nadie sabe
// qué gastos ya se revisaron, el responsable no tiene con qué probar que
// rindió, y una diferencia de hace tres meses se discute con el listado
// entero abierto en la pantalla.

const n = v => Number(v) || 0;
const redondo = v => Math.round(v * 100) / 100;
const falta = e => /relation|column|does not exist|schema cache/i.test(e?.message || "");

/**
 * ¿Se puede cerrar, y hasta qué día conviene?
 *
 * Se habilita cuando hay un abono posterior al último cierre: ese abono es la
 * reposición, y reponer es el acto de dar por rendida la vuelta anterior.
 *
 * La fecha propuesta es el día ANTERIOR al abono, no el de hoy. Lo que se
 * rinde es lo que se gastó con el fondo viejo; un gasto hecho con la plata
 * nueva es de la vuelta que recién empieza, y meterlo en la rendición anterior
 * hace que los números no cierren contra el recibo que firmó el responsable.
 *
 * @returns {{ puede, desde, hasta, abono, gastos, totalGastado, totalAbonado, saldo }}
 */
export function proponerCierre({ anticipos = [], gastos = [], cierres = [] }) {
  const abiertos = x => !x.cierre_id;
  const ultimo = cierres.length
    ? cierres.reduce((a, b) => (a.numero >= b.numero ? a : b))
    : null;

  // El abono que habilita: el más nuevo de los que todavía no se cerraron.
  const sueltos = anticipos.filter(abiertos)
    .slice().sort((a, b) => String(a.fecha || "").localeCompare(String(b.fecha || "")));
  const abono = sueltos.length ? sueltos[sueltos.length - 1] : null;

  // Hasta el día anterior al abono. Si no hay fecha —un abono viejo sin
  // cargarla— hasta hoy, que es lo único cierto que queda.
  const hoy = new Date().toISOString().slice(0, 10);
  let hasta = hoy;
  if (abono?.fecha) {
    const f = new Date(`${String(abono.fecha).slice(0, 10)}T12:00:00`);
    f.setDate(f.getDate() - 1);
    hasta = f.toISOString().slice(0, 10);
  }

  const entran = gastos.filter(g => abiertos(g) && String(g.fecha || "").slice(0, 10) <= hasta);
  const abonosQueEntran = sueltos.filter(a => String(a.fecha || "").slice(0, 10) <= hasta);
  const totalGastado = redondo(entran.reduce((t, g) => t + n(g.monto), 0));
  const totalAbonado = redondo(abonosQueEntran.reduce((t, a) => t + n(a.monto), 0));

  return {
    // Hay algo que rendir solo si hay un abono nuevo: el que repone es quien
    // da por buena la vuelta anterior.
    puede: !!abono && !!entran.length,
    desde: ultimo?.hasta || null,
    hasta,
    abono,
    gastos: entran,
    totalGastado,
    totalAbonado,
    saldo: redondo(totalAbonado - totalGastado),
  };
}

/**
 * Cerrarla. Marca lo que ya pasó y guarda la foto.
 *
 * Los totales se GUARDAN, no se recalculan: si mañana alguien corrige un
 * gasto viejo, la rendición que ya se firmó no puede cambiar sola. Esa es la
 * diferencia entre un cierre y un filtro por fechas.
 */
export async function cerrarCaja({ caja, hasta, nota, quien, anticipos = [], gastos = [], cierres = [] }) {
  const prop = proponerCierre({ anticipos, gastos, cierres });
  const corte = hasta || prop.hasta;
  const abiertos = x => !x.cierre_id;
  const entranG = gastos.filter(g => abiertos(g) && String(g.fecha || "").slice(0, 10) <= corte);
  const entranA = anticipos.filter(a => abiertos(a) && String(a.fecha || "").slice(0, 10) <= corte);
  if (!entranG.length && !entranA.length) return { error: "No hay movimientos sin rendir hasta esa fecha." };

  const totalGastado = redondo(entranG.reduce((t, g) => t + n(g.monto), 0));
  const totalAbonado = redondo(entranA.reduce((t, a) => t + n(a.monto), 0));
  const numero = (cierres.reduce((m, c) => Math.max(m, c.numero || 0), 0) || 0) + 1;

  const { data: cierre, error } = await supabase.from("cajas_cierres").insert({
    caja_id: caja.id, numero, hasta: corte,
    gastos: entranG.length, total_gastado: totalGastado, total_abonado: totalAbonado,
    saldo: redondo(totalAbonado - totalGastado), nota: nota || null,
    cerrado_por: quien?.id ?? null, cerrado_nombre: quien?.name || null,
  }).select().single();
  if (error) return { error: falta(error) ? "Falta correr la migración 088." : error.message };

  // Marcar los movimientos. Si esto fallara, el cierre quedaría sin su
  // contenido: se borra y se avisa, en vez de dejar una rendición vacía que
  // parece correcta.
  if (entranG.length) {
    const { error: e } = await supabase.from("cajas_gastos")
      .update({ cierre_id: cierre.id }).in("id", entranG.map(g => g.id));
    if (e) {
      await supabase.from("cajas_cierres").delete().eq("id", cierre.id);
      return { error: "No se pudieron marcar los gastos, así que no cerré nada: " + e.message };
    }
  }
  if (entranA.length) {
    await supabase.from("cajas_anticipos").update({ cierre_id: cierre.id }).in("id", entranA.map(a => a.id));
  }
  return { cierre };
}

export async function cargarCierres(cajaId) {
  if (!cajaId) return { cierres: [], sinTabla: false };
  const { data, error } = await supabase.from("cajas_cierres")
    .select("*").eq("caja_id", cajaId).order("numero", { ascending: false });
  if (error) return { cierres: [], sinTabla: falta(error) };
  return { cierres: data || [], sinTabla: false };
}

/** Deshacer el último cierre, por si se cerró de más. */
export async function reabrirCierre(cierre) {
  if (!cierre?.id) return "No hay cierre que reabrir.";
  await supabase.from("cajas_gastos").update({ cierre_id: null }).eq("cierre_id", cierre.id);
  await supabase.from("cajas_anticipos").update({ cierre_id: null }).eq("cierre_id", cierre.id);
  const { error } = await supabase.from("cajas_cierres").delete().eq("id", cierre.id);
  return error ? error.message : null;
}
