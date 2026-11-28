// Qué gastos se ven y en qué orden.
//
// Dos cosas chicas que hacen que una caja se pueda leer.

/**
 * Por fecha, el más nuevo arriba, y a igual fecha el último cargado primero.
 *
 * La base ya los pide ordenados, pero la lista de la pantalla se toca: un
 * gasto recién cargado se mete arriba y uno corregido se queda donde estaba,
 * así que al rato el orden es el de la carga y no el de los papeles. Y a igual
 * fecha —media caja chica tiene la misma— el orden era el que viniera.
 */
export function porFecha(filas = []) {
  const dia = f => String(f?.fecha || "").slice(0, 10);
  return [...filas].sort((a, b) => {
    const d = dia(b).localeCompare(dia(a));
    return d !== 0 ? d : Number(b.id || 0) - Number(a.id || 0);
  });
}

/**
 * Lo que está por rendir, o lo que entró en una vuelta ya cerrada.
 *
 * Una caja chica va por vueltas: se entrega un fondo, se gasta, se rinde y se
 * repone. Después de rendir, lo rendido ya se revisó y se firmó; dejarlo en la
 * lista hace que al mes cuatro haya que bajar sesenta renglones para llegar a
 * lo de esta semana, y que nadie distinga lo que falta revisar de lo que ya
 * pasó. Se guarda, no se borra: cada vuelta se puede volver a abrir y mirar.
 */
export function deLaVuelta(filas = [], cierreId = null) {
  return cierreId
    ? filas.filter(f => String(f.cierre_id || "") === String(cierreId))
    : filas.filter(f => !f.cierre_id);
}

/**
 * Un gasto DEVUELTO AL RESIDENTE está mal cargado —administración lo
 * rechazó— y hasta que se corrija no es un gasto de la caja: no se rinde y
 * no suma en el reporte. Sumarlo era cobrarle a la obra un papel rechazado.
 */
export const devueltoAlResidente = g => g?.estado === "devuelto";

/** Los que cuentan y los que están devueltos, aparte: se listan para que no se pierdan. */
export function paraElReporte(gastos = []) {
  return {
    gastos: gastos.filter(g => !devueltoAlResidente(g)),
    devueltos: gastos.filter(devueltoAlResidente),
  };
}

/**
 * LAS PARTES DE LA VUELTA ABIERTA, para poder tocarlas y verlas (Hernán,
 * 28/11/2026: «quiero hacer clic y ver cuáles son todos ellos. Los gastos por
 * rendir que dicen 12 no coinciden con los gastos de la caja abierta»).
 *
 * No coincidían porque el aviso cuenta los que se rinden y la lista mostraba
 * también los devueltos: en la caja de Lizeth, 12 por rendir y 15 en la lista
 * —los 3 botellones de agua devueltos—. Ahora cada número es una de estas
 * partes, y la lista muestra la que se toca.
 *
 * @param prop  lo de `proponerCierre` (qué entra hasta el corte y qué queda)
 */
export function partesDeLaVuelta(gastos = [], prop = null) {
  const abiertos = gastos.filter(g => !g.cierre_id);
  const porRendir = abiertos.filter(g => !devueltoAlResidente(g));
  return {
    abiertos,
    porRendir,
    sinAprobar: porRendir.filter(g => g.estado !== "aprobado"),
    devueltos: abiertos.filter(devueltoAlResidente),
    entran: prop?.gastos || [],
    quedan: prop?.quedan || [],
  };
}

export const NOMBRE_DE_PARTE = {
  porRendir: "Por rendir",
  sinAprobar: "Sin aprobar",
  devueltos: "Devueltos al residente",
  entran: "Entran en el cierre",
  quedan: "Quedan para la siguiente",
};
