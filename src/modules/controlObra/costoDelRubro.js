import { familiaDe, unidadesDistintas } from "./desconfiarDeNova.js";
import { baseSinIva } from "./contratoDeLaObra.js";

// EL COSTO DE UN RUBRO, TOMADO DE LO QUE COTIZA EL PAPEL.
//
// Diferencias ofrece cargar el costo de los rubros con el precio de la
// propuesta: es la primera vez que esos rubros van a tener uno, y de ahí en
// más Beneficios mide contra él si la obra gasta más o menos de lo previsto.
// Un costo mal cargado no se nota donde se carga: se nota semanas después,
// cuando un rubro aparece "pasado" por haber gastado lo normal.
//
// Eso pasó. El costo se sacaba del MONTO DE LA DIFERENCIA dividido por su
// cantidad, y eso solo es el precio del papel cuando la diferencia es de
// cantidad. En una diferencia de precio, el monto es lo que el precio CAMBIÓ:
// un tablero cotizado a $224,81 contra $247,29 quedó con $22,48 de costo, y al
// llegarle la primera factura salió como pérdida. Y en un rubro global cotizado
// por metros —la acometida: 25 a $43,54— quedó el precio de UN metro como costo
// del global entero: un unitario comparado contra un total.
//
// El costo es siempre lo que dice el papel, en la unidad del rubro:
//
//   · su total dividido por su cantidad, cuando miden lo mismo;
//   · su total entero, cuando el rubro es un global: un global se compara
//     total contra total, venga el papel desglosado como venga.
//
// Y no se carga cuando no se puede sostener: unidades que miden otra cosa, o
// un precio que no se parece al del rubro. Un rubro sin costo se mide contra lo
// que se cobra, que es verdad; con un costo equivocado se mide contra nada.

const n = v => Number(v) || 0;
const c4 = v => Math.round(n(v) * 10000) / 10000;
const c2 = v => Math.round(n(v) * 100) / 100;
const esDePrecio = h => h === "subio_precio" || h === "bajo_precio";

/** Un rubro contratado como global, de una sola unidad. */
export const esGlobal = rubro => familiaDe(rubro?.unidad) === "glb" && n(rubro?.cantidad) > 0 && n(rubro?.cantidad) <= 1;

/**
 * @param linea  una diferencia guardada, con lo que decía el papel
 * @param rubro  el rubro del contrato contra el que se comparó
 * @returns { costo, porQue }: el costo unitario del rubro, o null y por qué no
 */
export function costoSegunElPapel(linea, rubro) {
  if (!rubro) return { costo: null, porQue: "no tiene rubro" };
  const cantRubro = n(rubro.cantidad);
  if (!cantRubro) return { costo: null, porQue: "el rubro no tiene cantidad" };

  // LO QUE DICE EL PAPEL: su cantidad y su total, no los de la diferencia.
  let cant, monto;
  if (linea?.cantidad_papel != null && linea?.monto_papel != null) {
    cant = n(linea.cantidad_papel); monto = n(linea.monto_papel);
  } else if (esDePrecio(linea?.hallazgo)) {
    // Los análisis viejos no guardaron el papel, y de una diferencia de precio
    // lo único que queda es cuánto cambió: de ahí no sale un costo.
    return { costo: null, porQue: "solo quedó guardada la diferencia de precio, no lo que cotizaba el papel" };
  } else {
    // En lo nuevo y en la cantidad, monto sobre cantidad sí es el unitario del papel.
    cant = n(linea?.cantidad); monto = n(linea?.monto);
  }
  if (!cant || !monto) return { costo: null, porQue: "el papel no trae cantidad o monto" };

  const global = esGlobal(rubro);
  const unidadPapel = linea?.unidad_papel ?? linea?.unidad;
  if (!global && unidadesDistintas({ unidad: unidadPapel }, rubro)) {
    return { costo: null, porQue: `el papel lo cobra por ${unidadPapel} y el rubro está contratado por ${rubro.unidad}` };
  }

  // UN GLOBAL, TOTAL CONTRA TOTAL. Lo que el papel desglosa en veinticinco
  // metros es, para el contrato, una sola cosa que se cobra entera.
  const costo = global ? monto / cantRubro : monto / cant;

  // Y TIENE QUE PARECERSE AL PRECIO DEL RUBRO. Un costo que es la décima parte
  // de lo que se cobra, o el triple, no es un buen negocio ni uno malo: es otro
  // trabajo, o el mismo medido de otra manera.
  const precio = baseSinIva(rubro) / cantRubro;
  if (precio > 0 && (costo > precio * 2 || costo < precio / 2)) {
    return { costo: null, porQue: `el papel da $${c2(costo)} por ${rubro.unidad || "unidad"} y el rubro se cobra a $${c2(precio)}: no se parecen` };
  }
  return { costo: c4(costo), porQue: null };
}

/**
 * Los costos a cargar de un análisis entero, y los que no se pueden cargar.
 *
 * Un rubro, un costo: si dos renglones del papel apuntan al mismo rubro con
 * precios distintos, no se elige uno —se deja sin cargar y se dice—.
 *
 * @returns { cargar: [{ id, costo_unitario }], saltados: [{ rubro, porQue }] }
 */
export function costosDelAnalisis(lineas = [], rubros = []) {
  const porRubro = new Map();
  for (const l of lineas) {
    if (!l?.obra_rubro_id) continue;
    const r = rubros.find(x => Number(x.id) === Number(l.obra_rubro_id));
    if (!r) continue;
    const c = costoSegunElPapel(l, r);
    const ya = porRubro.get(r.id);
    if (!ya) { porRubro.set(r.id, { rubro: r, ...c }); continue; }
    if (ya.costo != null && c.costo != null && Math.abs(ya.costo - c.costo) > Math.max(0.01, ya.costo * 0.01)) {
      porRubro.set(r.id, { rubro: r, costo: null,
        porQue: `dos renglones del papel apuntan a este rubro con precios distintos: $${c2(ya.costo)} y $${c2(c.costo)}` });
    } else if (ya.costo == null && c.costo != null && !/dos renglones/.test(ya.porQue || "")) {
      porRubro.set(r.id, { rubro: r, ...c });
    }
  }
  const todos = [...porRubro.values()];
  return {
    cargar: todos.filter(x => x.costo != null).map(x => ({ id: x.rubro.id, costo_unitario: x.costo })),
    saltados: todos.filter(x => x.costo == null).map(x => ({ rubro: x.rubro, porQue: x.porQue })),
  };
}
