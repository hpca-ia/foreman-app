// LO QUE NOVA LEE DE UNA COTIZACIÓN, PARA LA MATRIZ DE COMPARACIÓN.
//
// Es la misma lectura de siempre —los rubros de la cotización, con sus
// palabras, y el pie de su papel—, con una diferencia en el emparejamiento:
// acá un renglón de la cotización puede cubrir VARIOS rubros del presupuesto.
// Hernán, 26/11/2026: «cada empresa puede cotizar de manera distinta o nombrar
// distinto». Una cotiza el tumbado y las paredes por separado; otra manda un
// solo renglón, «drywall: tumbado y paredes». Los dos se tienen que poder
// poner contra los mismos rubros.
//
// NOVA propone; quien arma el presupuesto lo corrige en la pantalla antes de
// comparar. Sin base ni pantalla: se puede probar.

const n = v => Number(v) || 0;
const r2 = v => Math.round(n(v) * 100) / 100;

export const PEDIDO_DE_LECTURA = 'Extrae todos los rubros. Responde UNICAMENTE con JSON valido, sin texto adicional, sin markdown: '
  + '{"proveedor":"nombre o vacio","rubros":[{"descripcion":"texto","unidad":"m2 o u o glb etc","cantidad":1,"precio_unitario":0.00,"total":0.00,"base":[]}],'
  + '"subtotal":null,"iva":null,"total":null,"descuento_pct":null,"descuento_monto":null}. '
  + 'En cada rubro, "total" es el total de ese renglon TAL COMO ESTA ESCRITO en el documento, o null si no aparece. '
  + 'Si un rubro trae dos precios unitarios (precio de lista y precio con descuento), usa el precio con descuento. '
  + 'Si al final hay un descuento general, pon su porcentaje en descuento_pct y su monto en descuento_monto, y NO lo restes de los rubros. '
  + 'En subtotal, iva y total pon los valores TAL COMO ESTAN ESCRITOS (subtotal sin IVA, el IVA, y el total a pagar), o null si no aparecen. No los calcules.';

/** Lo que se agrega al pedido para que NOVA diga qué rubros del presupuesto cubre cada renglón. */
export function pedidoDeEmparejarPaquetes(base = []) {
  if (!base.length) return ' En "base" pon siempre [].';
  const renglones = base.map(b => `${b.n} | ${b.capitulo} | ${b.descripcion} | ${b.unidad} | ${b.cantidad}`).join("\n");
  return ' ADEMAS: este presupuesto ya tiene los rubros de la BASE que va abajo (numero | capitulo | descripcion | unidad | cantidad). '
    + 'En cada rubro de la cotizacion, "base" es la lista de numeros de los rubros de la BASE que ese renglon cubre. '
    + 'Casi siempre es uno solo, el mismo trabajo aunque este abreviado o redactado distinto: [12]. '
    + 'Si el renglon de la cotizacion es un paquete o un global que cubre VARIOS rubros de la BASE '
    + '(por ejemplo "drywall: tumbado y paredes" cuando la BASE tiene el tumbado y las paredes por separado), pon todos: [12,13,14]. '
    + 'Si no corresponde a ninguno, []. Si dudas, []: no fuerces. No repitas un numero de la BASE en dos renglones. '
    + 'La "descripcion" sigue siendo la que esta escrita en la cotizacion.\n\nBASE:\n' + renglones;
}

/** El JSON de la respuesta, aunque venga envuelto en texto o en un bloque de código. */
export function jsonDeLaRespuesta(texto) {
  const limpio = String(texto || "").replace(/```json|```/g, "").trim();
  try { return JSON.parse(limpio); } catch { /* se busca adentro */ }
  const desde = limpio.indexOf("{"), hasta = limpio.lastIndexOf("}");
  if (desde >= 0 && hasta > desde) { try { return JSON.parse(limpio.slice(desde, hasta + 1)); } catch { /* no era */ } }
  return null;
}

/**
 * Lo leído, como se guarda: cada renglón con los ids de los rubros del
 * presupuesto que cubre. Un número que no existe se descarta, y uno que ya
 * tomó un renglón anterior no se repite: ese se corrige a mano.
 *
 * @param base  la de rubrosDeLaBase(): [{ n, id, … }]
 * @returns { proveedor, renglones, totales }
 */
export function cotizacionDeLaLectura(leido, base = []) {
  const porN = new Map(base.map(b => [Number(b.n), Number(b.id)]));
  const usados = new Set();
  const renglones = (leido?.rubros || [])
    .filter(r => String(r?.descripcion || "").trim())
    .map(r => {
      const dichos = Array.isArray(r.base) ? r.base : (r.base == null || r.base === "" ? [] : [r.base]);
      const items = dichos.map(x => porN.get(Number(x))).filter(id => id != null && !usados.has(id) && usados.add(id));
      const cantidad = n(r.cantidad) || 1;
      const escrito = n(r.total);
      // Un renglón con su total y sin unitario: el unitario sale del total.
      const precio_unitario = n(r.precio_unitario) > 0 ? n(r.precio_unitario) : escrito > 0 ? escrito / cantidad : 0;
      return {
        descripcion: String(r.descripcion).trim(), unidad: String(r.unidad || "").trim(),
        cantidad, precio_unitario, total: escrito > 0 ? r2(escrito) : r2(cantidad * precio_unitario), items,
      };
    });
  const num = v => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
  return {
    proveedor: String(leido?.proveedor || "").trim(),
    renglones,
    totales: {
      subtotal: num(leido?.subtotal), iva: num(leido?.iva), total: num(leido?.total),
      descuento_pct: num(leido?.descuento_pct), descuento_monto: num(leido?.descuento_monto),
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
