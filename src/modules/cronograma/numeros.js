// EL NÚMERO DE CADA BARRA: DÓNDE ESTÁ EN EL PLAN.
//
// "2.1", "2.3", "1.4". Hace falta para poder nombrarlas —entre personas y con
// NOVA— que es como se habla de un cronograma cuando hay cuarenta barras y
// varios nombres parecidos.
//
// SE CALCULA, NO SE GUARDA, y por eso se reacomoda solo cuando se agrega, se
// borra o se mueve algo: el número dice EL LUGAR, y un lugar que no cambia
// cuando la cosa se mueve deja de ser un lugar.
//
// Estaba calculado adentro de la tabla y en ningún lado más. Eso dejaba los
// números en la pantalla y fuera del alcance de todo lo demás: cuando alguien
// le dictaba a NOVA "la 2.1 va del 12 al 15", NOVA recibía una lista de barras
// identificadas por su id de base de datos —534, 537— y contestaba, con razón,
// que no sabía a cuál correspondía cada número. El número estaba a la vista de
// la persona y no existía para el programa.

import { porFases } from "./agruparPorFase.js";

/**
 * Numerar las bandas ya armadas. Es la regla, y vive acá sola para que la
 * tabla y lo que se le manda a NOVA no puedan decir números distintos.
 */
export function numerarBandas(bandas = [], cuantasFases = 0) {
  const numeroDe = new Map();
  let etapaN = 0;
  bandas.forEach(({ fase, grupos: suyos }) => {
    if (fase) etapaN++;
    let barra = 0;
    (suyos || []).forEach(g => (g.hijas || []).forEach(a => {
      barra++;
      numeroDe.set(a.id, cuantasFases ? `${fase ? etapaN : "—"}.${barra}` : String(barra));
    }));
  });
  return numeroDe;
}

/**
 * Los números a partir de las actividades, agrupando como agrupa la tabla:
 * un rubro partido en anticipo, fabricación e instalación es UNA cosa.
 */
export function numerosDeBarras(actividades = [], fases = []) {
  const porAg = new Map();
  actividades.forEach(a => {
    const k = a.obra_actividad_id || `sola-${a.id}`;
    if (!porAg.has(k)) porAg.set(k, []);
    porAg.get(k).push(a);
  });
  const grupos = [];
  porAg.forEach((hijas, id) => {
    grupos.push({
      id,
      posicion: Math.min(...hijas.map(a => a.orden ?? 0)),
      hijas: [...hijas].sort((x, y) => String(x.inicio || "").localeCompare(String(y.inicio || ""))),
    });
  });
  grupos.sort((a, b) => a.posicion - b.posicion);
  return numerarBandas(porFases(grupos, fases), fases.length);
}

/**
 * De "2.1" a la barra.
 *
 * Tolerante con cómo se escribe a mano: "2.1", "2,1", " 2.1 ". Lo que no se
 * reconoce no se adivina — una operación sobre la barra equivocada es peor que
 * no hacerla.
 */
export function barraPorNumero(numeros = new Map()) {
  const mapa = new Map();
  numeros.forEach((num, id) => mapa.set(String(num).trim(), id));
  return texto => {
    const limpio = String(texto || "").trim().replace(",", ".");
    return mapa.has(limpio) ? mapa.get(limpio) : null;
  };
}
