// LAS ÓRDENES QUE ESPERAN UNA FIRMA, Y CUÁNTO LLEVAN ESPERANDO.
//
// Una orden de cambio enviada y sin aprobar es trabajo que no se ejecuta, o
// peor: trabajo que ya se ejecutó y que nadie se comprometió a pagar. El
// problema no es que falte la firma, es que no se sabe que falta: el residente
// la mandó hace tres semanas, el fiscalizador nunca la abrió, y nadie se
// enteró hasta que hubo que cobrarla.
//
// Esto es la lista para insistir. Dice quién falta, cuántos días lleva, si ya
// la abrió —"no contestó" y "ni la miró" son dos conversaciones distintas— y
// cuánta plata hay parada esperando esa firma. Ordenada por lo que más duele,
// porque es por ahí por donde se empieza a llamar.
//
// Sin base de datos: se le pasan las órdenes y sus firmantes.

const n = v => Number(v) || 0;
const r2 = v => Math.round(n(v) * 100) / 100;
const soloDia = f => String(f || "").slice(0, 10);

/** Días enteros entre dos fechas. Sin horas: lo que se cuenta son días de espera. */
export function diasEntre(desde, hasta) {
  const a = soloDia(desde), b = soloDia(hasta);
  if (!a || !b) return 0;
  const ms = new Date(`${b}T12:00:00`) - new Date(`${a}T12:00:00`);
  return Math.max(0, Math.round(ms / 86400000));
}

/** ¿Esta orden está esperando firmas? Las aprobadas y las anuladas no. */
export const esperaFirma = o => !o?.anulada && !["aprobada", "rechazada"].includes(o?.estado);

/**
 * Una orden con lo que le falta.
 *
 * `desde` es la fecha desde la que se cuenta la espera: la del envío del
 * correo si lo hubo, y si no la de la orden. Lo primero es lo honesto —no se
 * puede reclamar una demora a quien nunca recibió nada— y lo segundo delata
 * otra cosa: una orden vieja que nunca se mandó.
 */
export function pendienteDe(orden, firmas = [], hoy = new Date().toISOString().slice(0, 10)) {
  const todos = (firmas || []).filter(f => String(f?.email || "").trim());
  const firmaron = todos.filter(f => f.aprobado_at);
  const objetaron = todos.filter(f => !f.aprobado_at && f.observacion);
  const faltan = todos.filter(f => !f.aprobado_at && !f.observacion);

  const envios = todos.map(f => soloDia(f.envio_at)).filter(Boolean).sort();
  const desde = envios[0] || soloDia(orden?.enviada_at) || soloDia(orden?.fecha) || soloDia(orden?.created_at);
  const limite = soloDia(orden?.fecha_limite_aprobacion) || null;

  return {
    orden,
    // "Nunca se mandó" no es lo mismo que "no contestan", y se arregla distinto.
    seMando: !!(envios.length || orden?.enviada_at),
    dias: diasEntre(desde, hoy),
    desde: desde || null,
    limite,
    vencida: !!(limite && limite < soloDia(hoy)),
    monto: r2(orden?.monto ?? orden?.total ?? 0),
    dias_impacto: n(orden?.dias_impacto),
    firmaron, objetaron, faltan,
    cuantos: todos.length,
    // Lo que más duele y en este orden: una objeción escrita frena la obra
    // igual que una firma que no llega, pero ya tiene con quién hablarse.
    trabada: !!objetaron.length,
    sinFirmantes: !todos.length,
  };
}

/**
 * Las órdenes que esperan una firma, de la que más duele a la que menos.
 *
 * @param ordenes  las de la obra
 * @param porOrden { [orden_id]: [aprobaciones] }
 */
export function pendientes(ordenes = [], porOrden = {}, hoy = new Date().toISOString().slice(0, 10)) {
  return (ordenes || [])
    .filter(esperaFirma)
    .map(o => pendienteDe(o, porOrden[o.id] || [], hoy))
    // Una orden sin nadie que la firme todavía no se le pidió a nadie: no es
    // una demora del cliente, es una tarea nuestra. Entra igual, dicha así.
    .filter(p => !p.firmaron.length || p.faltan.length || p.objetaron.length)
    .sort((a, b) => {
      if (a.vencida !== b.vencida) return a.vencida ? -1 : 1;
      if (a.dias !== b.dias) return b.dias - a.dias;
      return b.monto - a.monto;
    });
}

/** El titular: cuántas, cuánta plata y cuántos días lleva la más vieja. */
export function resumenPendientes(lista = []) {
  return {
    cuantas: lista.length,
    monto: r2(lista.reduce((t, p) => t + p.monto, 0)),
    dias: lista.reduce((t, p) => Math.max(t, p.dias), 0),
    vencidas: lista.filter(p => p.vencida).length,
    trabadas: lista.filter(p => p.trabada).length,
    // Las que nunca salieron: eso no se le reclama al cliente.
    sinMandar: lista.filter(p => !p.seMando).length,
    dias_impacto: lista.reduce((t, p) => t + p.dias_impacto, 0),
  };
}

/** Cómo se dice una espera, para no tener que pensarlo en cada pantalla. */
export function comoSeDice(p) {
  if (!p.seMando) return "Nunca se mandó";
  if (p.trabada) return `Objetada por ${p.objetaron.map(f => f.nombre || f.email).join(", ")}`;
  if (p.vencida) return `El plazo venció hace ${diasEntre(p.limite, new Date().toISOString().slice(0, 10))} días`;
  if (!p.faltan.length) return "Firmada por todos";
  const quienes = p.faltan.map(f => f.nombre || f.email).join(", ");
  return `${p.dias === 0 ? "Mandada hoy" : `${p.dias} ${p.dias === 1 ? "día" : "días"} esperando`} a ${quienes}`;
}
