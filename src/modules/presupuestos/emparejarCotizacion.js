// LO QUE NOVA LEE DE UNA COTIZACIÓN, PARA LA MATRIZ DE COMPARACIÓN.
//
// Es la lectura de siempre —los rubros de la cotización, con sus palabras, y
// el pie de su papel— más tres cosas que la matriz necesita:
//
//   · A QUÉ CAPÍTULO DEL PRESUPUESTO VA. Hernán, 26/11/2026: «la comparativa
//     se la categoriza por capítulos del presupuesto». Casi siempre todo el
//     papel es de uno solo —las ventanas, la cocina, las puertas—.
//
//   · EN QUÉ FILA DE LA COMPARACIÓN CAE CADA RENGLÓN, contra lo que ya
//     ITEMIZARON OTRAS EMPRESAS —no contra los rubros del presupuesto, que era
//     lo que no calzaba: de 28 ventanas de Dekorando emparejó una—. La V1 de
//     una con la V1 de la otra.
//
//   · SI EL RENGLÓN TOTALIZA (`suma`): la empresa que manda «solo una
//     sumatoria» por todo el trabajo. Ese renglón no se ubica en ninguna fila:
//     se compara por su total. Hernán, 26/11/2026: «Window World totalizó,
//     Easy Home totalizó y Dekorando sí lo itemizó... eventualmente se
//     itemizan todas con sus versiones nuevas y se compara».
//
//   · LAS CONDICIONES: validez, forma de pago, plazo, lo que no incluye. «Se
//     deben poder ver por si hay condiciones o cualquier otra info adicional».
//     El papel original queda guardado y se abre desde la matriz; esto es para
//     tenerlas a la vista sin abrirlo.
//
// NOVA propone; quien arma el presupuesto lo corrige en la pantalla. «Con las
// actualizaciones se irán emparejando los rubros»: una cotización que llega
// como una suma se compara por su total, y cuando llega itemizada se ubica.
//
// Sin base ni pantalla: se puede probar.

const n = v => Number(v) || 0;
const r2 = v => Math.round(n(v) * 100) / 100;
const texto = v => String(v ?? "").trim();

export const PEDIDO_DE_LECTURA = 'Extrae todos los rubros. Responde UNICAMENTE con JSON valido, sin texto adicional, sin markdown: '
  + '{"proveedor":"nombre o vacio","rubros":[{"descripcion":"texto","unidad":"m2 o u o glb etc","cantidad":1,"precio_unitario":0.00,"total":0.00,"capitulo":null,"filas":[],"suma":false}],'
  + '"subtotal":null,"iva":null,"total":null,"descuento_pct":null,"descuento_monto":null,"condiciones":""}. '
  + 'En cada rubro, "total" es el total de ese renglon TAL COMO ESTA ESCRITO en el documento, o null si no aparece. '
  + 'Si un rubro trae dos precios unitarios (precio de lista y precio con descuento), usa el precio con descuento. '
  + 'Si al final hay un descuento general, pon su porcentaje en descuento_pct y su monto en descuento_monto, y NO lo restes de los rubros. '
  + 'En subtotal, iva y total pon los valores TAL COMO ESTAN ESCRITOS (subtotal sin IVA, el IVA, y el total a pagar), o null si no aparecen. No los calcules. '
  + 'En cada rubro, "suma" es true si ese renglon es UN SOLO VALOR GLOBAL por todo un trabajo, sin detallar sus piezas (por ejemplo "ventaneria completa", "puertas y ventanas instaladas", "cocina completa"); y false si es un item con su medida, su codigo o su cantidad. '
  + 'En "condiciones" copia, en pocas lineas, lo que el documento diga de: validez de la oferta, forma de pago y anticipo, plazo de entrega, garantia, y lo que NO incluye. Si no dice nada de eso, "".';

/**
 * Lo que se agrega al pedido para que NOVA diga a qué capítulo va cada renglón
 * y en qué fila de la comparación cae.
 *
 * @param capitulos  los del presupuesto, en su orden: [{ n, nombre }]
 * @param filas      lo que ya cotizaron otras empresas (filasParaUbicar): [{ n, capitulo, descripcion, unidad, cantidad }]
 */
export function pedidoDeUbicar({ capitulos = [], filas = [] } = {}) {
  const deCapitulos = !capitulos.length ? ' En "capitulo" pon siempre null.'
    : ' ADEMAS: esta cotizacion es para un presupuesto que tiene los CAPITULOS de abajo (numero | nombre). '
      + 'En cada rubro, "capitulo" es el numero del capitulo al que pertenece ese trabajo. '
      + 'Casi siempre toda la cotizacion es del mismo capitulo. Si no sabes cual es, null.\n\nCAPITULOS:\n'
      + capitulos.map(c => `${c.n} | ${c.nombre}`).join("\n") + "\n\n";
  const deFilas = !filas.length ? ' En "filas" pon siempre [].'
    : ' Y OTRAS EMPRESAS YA COTIZARON las FILAS de abajo (numero | capitulo | descripcion | unidad | cantidad). '
      + 'En cada rubro de ESTA cotizacion, "filas" es la lista de numeros de las FILAS que son el mismo trabajo. '
      + 'Casi siempre es una sola, aunque este redactada distinto o abreviada: [3]. '
      + 'Si el rubro es una SUMA GLOBAL (por ejemplo "ventaneria completa" cuando las FILAS detallan ventana por ventana), NO lo ubiques: "suma": true y "filas": []. '
      + 'Si es algo que ninguna FILA tiene, []. Si dudas, []: no fuerces. No repitas un numero de FILA en dos rubros. '
      + 'La "descripcion" sigue siendo la que esta escrita en esta cotizacion.\n\nFILAS:\n'
      + filas.map(f => `${f.n} | ${f.capitulo} | ${f.descripcion} | ${f.unidad} | ${f.cantidad}`).join("\n");
  return deCapitulos + deFilas;
}

/** Los capítulos del presupuesto, numerados como se le mandan a NOVA. */
export const capitulosParaUbicar = (capitulos = []) =>
  [...(capitulos || [])].sort((a, b) => n(a.orden) - n(b.orden)).map(c => texto(c.nombre)).filter(Boolean).map((nombre, i) => ({ n: i + 1, nombre }));

/** El JSON de la respuesta, aunque venga envuelto en texto o en un bloque de código. */
export function jsonDeLaRespuesta(textoLeido) {
  const limpio = String(textoLeido || "").replace(/```json|```/g, "").trim();
  try { return JSON.parse(limpio); } catch { /* se busca adentro */ }
  const desde = limpio.indexOf("{"), hasta = limpio.lastIndexOf("}");
  if (desde >= 0 && hasta > desde) { try { return JSON.parse(limpio.slice(desde, hasta + 1)); } catch { /* no era */ } }
  return null;
}

/**
 * Lo leído, como se guarda: cada renglón con su capítulo (el nombre) y la
 * fila de la comparación en la que cae (su clave). Un número que no existe se
 * descarta; una fila que ya tomó un renglón anterior no se repite. El renglón
 * sin fila abre la suya en la matriz.
 *
 * El renglón que TOTALIZA —NOVA lo dijo, o lo ubicó como la suma de varias
 * filas— se guarda con `suma` y sin filas: no va contra las de nadie.
 *
 * @param capitulos  capitulosParaUbicar(): [{ n, nombre }]
 * @param filas      filasParaUbicar(): [{ n, clave, … }]
 * @returns { proveedor, renglones, totales }
 */
export function cotizacionDeLaLectura(leido, { capitulos = [], filas = [] } = {}) {
  const capDe = new Map(capitulos.map(c => [Number(c.n), c.nombre]));
  const filaDe = new Map(filas.map(f => [Number(f.n), String(f.clave)]));
  const usadas = new Set();
  const renglones = (leido?.rubros || [])
    .filter(r => texto(r?.descripcion))
    .map(r => {
      const dichas = Array.isArray(r.filas) ? r.filas : (r.filas == null || r.filas === "" ? [] : [r.filas]);
      const pedidas = [...new Set(dichas.map(x => filaDe.get(Number(x))).filter(f => f != null))];
      const esSuma = r.suma === true || pedidas.length >= 2;
      const suyas = esSuma ? [] : pedidas.slice(0, 1).filter(f => !usadas.has(f) && usadas.add(f));
      const cantidad = n(r.cantidad) || 1;
      const escrito = n(r.total);
      // Un renglón con su total y sin unitario: el unitario sale del total.
      const precio_unitario = n(r.precio_unitario) > 0 ? n(r.precio_unitario) : escrito > 0 ? escrito / cantidad : 0;
      return {
        descripcion: texto(r.descripcion), unidad: texto(r.unidad),
        cantidad, precio_unitario, total: escrito > 0 ? r2(escrito) : r2(cantidad * precio_unitario),
        capitulo: capDe.get(Number(r.capitulo)) || "", filas: suyas,
        ...(esSuma ? { suma: true } : {}),
      };
    });
  const num = v => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
  return {
    proveedor: texto(leido?.proveedor),
    renglones,
    totales: {
      subtotal: num(leido?.subtotal), iva: num(leido?.iva), total: num(leido?.total),
      descuento_pct: num(leido?.descuento_pct), descuento_monto: num(leido?.descuento_monto),
      condiciones: texto(leido?.condiciones).slice(0, 2000) || null,
    },
  };
}

/**
 * ¿Se leyó todo? La suma de los renglones contra el subtotal escrito en el
 * papel —menos su descuento general, si lo trae—. Sin subtotal en el papel no
 * hay contra qué comprobar, y se dice.
 *
 * @returns { suma, escrito, diferencia, cuadra } con `cuadra` true | false | null
 */
export function cuadreDeLaLectura(cot) {
  const suma = r2((cot?.renglones || []).reduce((t, r) => t + n(r.total), 0));
  const t = cot?.totales || {};
  const escrito = t.subtotal != null ? n(t.subtotal) : null;
  if (escrito == null) return { suma, escrito: null, diferencia: null, cuadra: null };
  // Algunos papeles escriben el subtotal antes del descuento y otros después.
  const descuento = n(t.descuento_monto);
  const diferencia = r2(suma - escrito);
  const cuadra = Math.abs(diferencia) <= 0.05 || (descuento > 0 && Math.abs(r2(suma - descuento - escrito)) <= 0.05);
  return { suma, escrito, diferencia, cuadra };
}
