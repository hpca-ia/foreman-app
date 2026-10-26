// POR DÓNDE VA CADA FLECHA DEL CRONOGRAMA.
//
// Las flechas bajaban todas pegadas a la derecha de la barra de la que salen.
// Con treinta dependencias, diez de ellas bajaban por la misma columna y se
// volvían una sola raya gruesa: no se sabía cuál iba a dónde. Y las largas
// atravesaban las barras del medio, que es justo lo que uno está leyendo.
//
// Ahora cada flecha busca su columna para bajar: entre las dos barras, la que
// no cruza barras y no pisa la bajada de otra. Las cortas eligen primero —son
// las que menos lugar tienen— y las largas se acomodan después.
//
// Sin dibujo y sin jsPDF a propósito: devuelve puntos, en milímetros o en
// píxeles, y se prueba sin navegador.

const CERCA = 0.4;   // una bajada que pasa a menos de esto de una barra, la toca

/**
 * ¿Cuántas barras cruza una bajada en x, entre ya y yb? Sin contar las filas
 * de las puntas: la flecha sale de una y entra en la otra.
 */
function cruces(x, ya, yb, cajas) {
  const y1 = Math.min(ya, yb), y2 = Math.max(ya, yb);
  return cajas.filter(c => c.y > y1 + 0.01 && c.y < y2 - 0.01 && x >= c.x1 - CERCA && x <= c.x2 + CERCA).length;
}

/**
 * ¿Cuántas bajadas ya trazadas pisa una en x, entre ya y yb? Las que salen de
 * la misma barra no cuentan: compartir el tronco es más claro que bajar en
 * paralelo, a un milímetro, dos rayas que dicen lo mismo.
 */
function choques(x, ya, yb, verticales, separacion, fuente) {
  const y1 = Math.min(ya, yb), y2 = Math.max(ya, yb);
  return verticales.filter(v => (fuente == null || v.fuente !== fuente)
    && Math.abs(v.x - x) < separacion && Math.max(v.y1, y1) < Math.min(v.y2, y2)).length;
}

/**
 * La mejor columna para bajar entre `desde` y `hasta` (en ese orden de
 * preferencia): primero sin cruzar barras, después sin pisar otra flecha, y
 * entre las iguales la más cercana a `desde`.
 */
function columna(desde, hasta, ya, yb, cajas, verticales, paso, separacion, fuente) {
  const n = Math.max(0, Math.floor(Math.abs(hasta - desde) / paso));
  const signo = hasta >= desde ? 1 : -1;
  let mejor = desde, nota = Infinity, cruza = 0;
  for (let k = 0; k <= n; k++) {
    const x = desde + signo * k * paso;
    const c = cruces(x, ya, yb, cajas);
    const s = c * 1000 + choques(x, ya, yb, verticales, separacion, fuente) * 10 + k * 0.01;
    if (s < nota) { nota = s; mejor = x; cruza = c; }
    if (s < 1) break;   // libre y lo más cerca posible: no hay nada mejor
  }
  return { x: mejor, cruza };
}

/**
 * Los puntos de una flecha, de la barra que manda a la que espera.
 *
 * @param de, a  { x1, x2, y }: las dos barras (y es el centro de su fila)
 * @param tipo   "FC" fin→comienzo (la de siempre), "CC" a la vez, "FF" terminan juntas
 * @param cajas  todas las barras de la hoja, para no cruzarlas
 * @param verticales las bajadas ya trazadas; esta suma la suya
 * @param alto   alto de una fila: las vueltas van por la línea entre filas
 * @returns { puntos: [[x, y], …], punta: x donde entra, haciaDerecha }
 */
export function rutaDeCadena({ de, a, tipo = "FC", cajas = [], verticales = [], S = 1.6, F = 1.1, paso = 0.5, separacion = 1.0, alto = 5.6, holgura = 25 }) {
  const xSale = tipo === "CC" ? de.x1 : de.x2;
  const xEntra = tipo === "FF" ? a.x2 : a.x1;
  const haciaDerecha = tipo !== "FF";
  const punta = haciaDerecha ? xEntra - F : xEntra + F;
  const fuente = `${xSale}|${de.y}`;
  const anotar = (x, ya, yb) => verticales.push({ x, y1: Math.min(ya, yb), y2: Math.max(ya, yb), fuente });
  const col = (desde, hasta, ya, yb) => columna(desde, hasta, ya, yb, cajas, verticales, paso, separacion, fuente);

  if (tipo === "CC" || tipo === "FF") {
    // A la vez: baja por la izquierda de las dos. Terminan juntas: por la derecha.
    const borde = tipo === "CC" ? Math.min(xSale, xEntra) - S : Math.max(xSale, xEntra) + S;
    const { x } = col(borde, tipo === "CC" ? borde - holgura : borde + holgura, de.y, a.y);
    anotar(x, de.y, a.y);
    return { puntos: [[xSale, de.y], [x, de.y], [x, a.y], [punta, a.y]], punta: xEntra, haciaDerecha };
  }

  const lo = xSale + S, hi = xEntra - S - F;
  // POR LA LÍNEA ENTRE FILAS: baja por la mejor columna a la derecha de la
  // que manda hasta la línea que separa la fila de la que espera, corre por
  // esa línea —ahí no hay barras— y entra. Es el camino cuando la que espera
  // arranca antes (traslape), y la alternativa cuando entre las dos no queda
  // ninguna columna libre.
  const ySep = a.y >= de.y ? a.y - alto / 2 : a.y + alto / 2;
  const porLaLinea = () => {
    const c1 = col(lo, lo + holgura, de.y, ySep);
    return { c1, x2: xEntra - S - F };
  };
  const conLinea = ({ c1, x2 }) => {
    anotar(c1.x, de.y, ySep);
    anotar(x2, ySep, a.y);
    return { puntos: [[xSale, de.y], [c1.x, de.y], [c1.x, ySep], [x2, ySep], [x2, a.y], [punta, a.y]], punta: xEntra, haciaDerecha };
  };

  if (hi >= lo) {
    // Hay lugar entre las dos: baja por la mejor columna de ese espacio...
    const directa = col(lo, hi, de.y, a.y);
    // ...salvo que todas crucen alguna barra y por la línea entre filas no.
    if (directa.cruza > 0 && Math.abs(a.y - de.y) > alto) {
      const otra = porLaLinea();
      if (otra.c1.cruza < directa.cruza) return conLinea(otra);
    }
    anotar(directa.x, de.y, a.y);
    return { puntos: [[xSale, de.y], [directa.x, de.y], [directa.x, a.y], [punta, a.y]], punta: xEntra, haciaDerecha };
  }

  // TRASLAPE: la que espera arranca antes de que termine la que manda.
  return conLinea(porLaLinea());
}

/**
 * El orden en que se trazan: las de menos recorrido vertical primero. Son las
 * que tienen menos lugar, y si eligen después se quedan con lo que dejaron las
 * largas, que suele ser pasar por encima de algo.
 */
export function ordenDeTrazado(dependencias, donde) {
  return dependencias
    .map(d => ({ d, de: donde.get(d.depende_de_id), a: donde.get(d.actividad_id) }))
    .filter(x => x.de && x.a)
    .sort((x, y) => Math.abs(x.de.y - x.a.y) - Math.abs(y.de.y - y.a.y));
}
