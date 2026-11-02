/**
 * LA ARITMÉTICA DEL PAPEL, QUE ES LA QUE JUZGA.
 *
 * Un presupuesto, una proforma y una cotización son el mismo papel con otro
 * encabezado: renglones con cantidad, precio unitario y total, y un pie que
 * dice cuánto suman. Eso alcanza para comprobar cualquier lectura sin saber
 * nada del rubro, del proveedor ni del formato:
 *
 *   · cantidad × unitario = total del renglón
 *   · suma de los renglones = subtotal que dice el papel
 *
 * Esta es la parte que no opina. El modelo lee —encuentra los renglones en un
 * PDF escaneado, entiende un encabezado raro, sabe que "Punto de iluminación
 * con tubería EMT" y "Punto de iluminación EMT 1/2" son lo mismo— y de eso no
 * hay que sacarlo, porque ningún código lo hace. Pero quien decide si esa
 * lectura entra a FOREMAN es esto, que el modelo no controla.
 */

/**
 * ¿LO QUE SE LEYÓ DA LO QUE DICE EL PAPEL?
 *
 * La única manera de saber si NOVA leyó bien sin volver a sumar la proforma a
 * mano. La suma de los renglones tiene que dar el SUBTOTAL —no el total, que
 * lleva el IVA—. Si no da, algo se leyó mal: un renglón de más, uno que quedó
 * afuera, o un monto con el impuesto adentro. Y eso hay que decirlo antes de
 * que el número se convierta en un margen.
 *
 * Se tolera un centavo por renglón: los redondeos del proveedor son suyos.
 *
 * @returns null si el papel no trae totales; si no, { cuadra, suma, subtotal,
 *   diferencia, parece }
 */
export function cuadrar(items = [], totales = null, descuento = 0) {
  if (!totales || totales.subtotal == null) return null;
  // Los renglones vienen a precio de lista y el subtotal del papel ya trae el
  // descuento restado: sin contarlo, toda proforma con descuento se denunciaba
  // como mal leída.
  const suma = Math.round((items.reduce((t, x) => t + (Number(x.monto) || 0), 0)
    - (Number(descuento) || 0)) * 100) / 100;
  const subtotal = Math.round((Number(totales.subtotal) || 0) * 100) / 100;
  const diferencia = Math.round((suma - subtotal) * 100) / 100;
  const tolerancia = Math.max(0.05, items.length * 0.01);
  const cuadra = Math.abs(diferencia) <= tolerancia;
  // Si lo leído da justo el TOTAL en vez del subtotal, lo que pasó se sabe: se
  // leyeron los montos con el IVA adentro.
  const total = totales.total == null ? null : Math.round(Number(totales.total) * 100) / 100;
  const parece = cuadra ? null
    : total != null && Math.abs(suma - total) <= tolerancia
      ? "los renglones se leyeron CON el IVA adentro: dan el total del papel y no el subtotal"
      : diferencia > 0 ? "se leyó de más: puede haber entrado un subtotal o un renglón repetido"
        : "quedó algo afuera: puede ser una hoja que no se leyó o un renglón sin precio";
  return { cuadra, suma, subtotal, total, diferencia, parece };
}


/**
 * ¿SE LEYÓ BIEN? LA ARITMÉTICA DEL PAPEL LO DICE.
 *
 * Toda proforma, venga como venga —PDF, foto, Excel, de cualquier proveedor—
 * tiene los mismos cuatro datos por renglón: qué, cuántos, a cuánto y cuánto
 * suma. Y esos cuatro datos se comprueban solos:
 *
 *   · CANTIDAD × UNITARIO = TOTAL, renglón por renglón. Si no da, ese renglón
 *     se leyó mal —un dígito de más en el unitario, una coma corrida— y es el
 *     error que no se ve, porque el número sigue pareciendo un número.
 *   · LA SUMA DE LOS RENGLONES = EL SUBTOTAL DEL PIE. Si no da, falta un
 *     renglón o sobra uno. Es la comprobación que descubrió que una planilla
 *     de 42 renglones se había leído con 28.
 *
 * Nada de esto necesita saber de construcción ni de este proveedor: es
 * aritmética, se corre siempre y no se equivoca. Lo que no se puede comprobar
 * se dice, en vez de dar por buena una lectura que nadie miró.
 */
export function revisarLectura(items = [], totales = null, descuento = 0) {
  const c2 = v => Math.round((Number(v) || 0) * 100) / 100;
  const suman = c2(items.reduce((t, x) => t + (Number(x.monto) || 0), 0));

  // Los renglones donde el papel da los tres números y no multiplican.
  const malos = items.filter(x => {
    const cant = Number(x.cantidad) || 0;
    const uni = Number(x.unitario) || 0;
    const tot = Number(x.monto) || 0;
    if (!cant || !uni || !tot) return false;
    return Math.abs(cant * uni - tot) > Math.max(0.02, tot * 0.005);
  }).map(x => ({
    descripcion: x.descripcion,
    dice: c2(Number(x.cantidad) * Number(x.unitario)),
    pero: c2(x.monto),
  }));

  const sub = totales?.subtotal == null ? null : c2(totales.subtotal);
  const esperado = sub == null ? null : c2(sub + (Number(descuento) || 0));
  const falta = esperado == null ? null : c2(esperado - suman);
  const tolerancia = Math.max(0.05, items.length * 0.01);
  const cuadra = falta == null ? null : Math.abs(falta) <= tolerancia;

  const partes = [`${items.length} renglones · $${suman.toFixed(2)}`];
  if (cuadra === true) partes.push("suman exactamente lo que dice el papel");
  else if (cuadra === false) {
    partes.push(falta > 0
      ? `FALTAN $${falta.toFixed(2)}: el papel suma $${esperado.toFixed(2)} y lo leído da menos, así que `
        + "algún renglón no entró"
      : `SOBRAN $${Math.abs(falta).toFixed(2)}: puede haber entrado un subtotal o un renglón repetido`);
  } else partes.push("el papel no trae subtotal, así que no se puede comprobar contra nada");
  if (malos.length) {
    partes.push(`${malos.length} ${malos.length === 1 ? "renglón no multiplica" : "renglones no multiplican"}: `
      + "cantidad por unitario no da su total");
  }

  return { renglones: items.length, suman, subtotal: sub, esperado, falta, cuadra, malos,
    confiable: cuadra !== false && !malos.length, conclusion: partes.join(" · ") };
}

/**
 * CUADRA, NO CUADRA, O NO SE PUDO COMPROBAR. SON TRES COSAS.
 *
 * `confiable` dice que no se encontró contradicción, y eso es verdad también
 * cuando no hubo contra qué comparar: un papel sin subtotal al pie da
 * `confiable: true` sin que nadie haya comprobado nada. La pantalla lo pintaba
 * en verde y decía "La lectura cuadra", que es justo lo que no se sabe.
 *
 * Una lectura sin comprobar no es una lectura mala. Es una lectura que hay que
 * mirar, y decirlo es lo que permite mirarla.
 */
export function comoQuedo(revision) {
  if (!revision) return "sin-comprobar";
  if (revision.malos?.length) return "no-cuadra";
  if (revision.cuadra === true) return "cuadra";
  if (revision.cuadra === false) return "no-cuadra";
  return "sin-comprobar";
}

export const DICHO = {
  "cuadra": "La lectura cuadra con el papel.",
  "no-cuadra": "Ojo con esta lectura.",
  "sin-comprobar": "No se pudo comprobar: el papel no trae subtotal.",
};

/**
 * El total a pagar, a partir de lo que dice el pie del papel.
 *
 * Manda el total impreso: es lo que el proveedor va a cobrar. Si no está, se
 * arma con el subtotal más el IVA escrito; y si tampoco está el IVA, queda el
 * subtotal, que es un número del papel y no uno inventado. Lo que no se hace
 * nunca es ponerle el 15% a un subtotal porque sí: hay proformas exentas, con
 * IVA 0 y con retención, y esa suposición no se ve una vez guardada.
 */
export function montoDe({ subtotal, iva, total } = {}) {
  const n = v => (v == null || v === "" || isNaN(Number(v)) ? null : Number(v));
  const t = n(total), s = n(subtotal), i = n(iva);
  if (t != null) return t;
  if (s != null && i != null) return Math.round((s + i) * 100) / 100;
  return s;
}
