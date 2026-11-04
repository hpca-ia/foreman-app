import { ultimoCorte } from "../cajaChica/vuelta.js";
// Cerrar una planilla POR FECHAS.
//
// Una planilla es un corte de período: al 31 de octubre, a una quincena. Se
// cerraba con la fecha de hoy, y las facturas que ya habían entrado con fecha
// posterior quedaban adentro: la planilla de octubre llevaba dos facturas del
// 3 de noviembre. Acá se elige hasta qué día va, y lo que tiene fecha
// posterior pasa a la planilla siguiente, que se crea si no está.

const n = v => Number(v) || 0;
const dia = f => String(f || "").slice(0, 10);
const r2 = v => Math.round(n(v) * 100) / 100;

/** Las facturas de esa planilla, partidas por el corte. */
export function partirPorFecha(facturas = [], planillaId, hasta) {
  const suyas = facturas.filter(f => String(f.planilla_id) === String(planillaId));
  return {
    quedan: suyas.filter(f => dia(f.fecha) <= dia(hasta)),
    pasan: suyas.filter(f => dia(f.fecha) > dia(hasta)),
  };
}

/** La planilla abierta que sigue a esta, si ya existe. */
export function siguienteDe(planillas = [], p) {
  return planillas
    .filter(x => x.estado !== "cerrada" && n(x.numero) > n(p?.numero))
    .sort((a, b) => n(a.numero) - n(b.numero))[0] || null;
}

export function numeroNuevo(planillas = []) {
  return planillas.length ? Math.max(...planillas.map(p => n(p.numero))) + 1 : 1;
}

export function diaSiguiente(f) {
  const d = new Date(`${dia(f)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Lo que queda adentro con ese corte, y lo que hay que decir antes de cerrar:
 * cuántas no están asignadas a un rubro, cuánto sigue vivo en anticipos sin
 * factura y cuánto queda a favor en notas de crédito.
 */
export function loQueQueda(quedan = [], sueltoDe = () => 0) {
  return {
    cuantas: quedan.length,
    total: r2(quedan.reduce((s, f) => s + n(f.total), 0)),
    sueltas: quedan.filter(f => sueltoDe(f) > 0.009).length,
    vivo: r2(quedan.filter(f => f.clase === "anticipo" && !f.facturada_con_id).reduce((s, f) => s + n(f.total), 0)),
    favor: r2(quedan.filter(f => (f.clase === "nota_credito" || n(f.total) < 0) && !f.facturada_con_id)
      .reduce((s, f) => s + Math.abs(n(f.total)), 0)),
  };
}

/** El corte que se propone: el último de quincena o de mes, si cae dentro de la planilla; si no, hoy. */
export function cortePropuesto(p, hoy) {
  const c = ultimoCorte(hoy);
  const desde = dia(p?.fecha_desde);
  return !desde || c >= desde ? c : dia(hoy);
}
