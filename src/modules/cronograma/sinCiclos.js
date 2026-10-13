// Quitar los círculos de una lista de dependencias.
//
// UN CÍRCULO NO ATRASA EL CRONOGRAMA: LO APAGA. Si A espera a B y B espera a
// A, ninguna de las dos tiene fecha de arranque, y el cálculo no puede
// empezar por ninguna. Lo que se ve en la pantalla es una fila con los días
// puestos, la fecha de inicio vacía, la de fin vacía y un guión en el colchón.
// Desde afuera parece que la aritmética está rota, y lo que está roto es el
// dato: alguien —o NOVA— encadenó en redondo.
//
// NOVA los arma sin querer con una obra real: la mampostería espera al
// enlucido en una etapa y el enlucido espera a la mampostería en otra, y las
// dos frases son ciertas por separado.
//
// Se corta la dependencia que CIERRA el círculo, no una al azar: las que ya
// estaban forman un orden que se venía sosteniendo, y la última es la que lo
// rompió. Y se dice cuáles se cortaron, porque una dependencia que alguien
// pidió y no quedó tiene que poder reclamarse.

/**
 * @param deps  [{de, a, ...}] — "de" termina antes de que empiece "a"
 * @returns     { dependencias, cortadas }
 */
export function sinCiclos(deps = []) {
  // A dónde se puede llegar desde cada actividad, siguiendo las que ya entraron.
  const salen = new Map();
  const alcanza = (desde, hasta, visto = new Set()) => {
    if (desde === hasta) return true;
    if (visto.has(desde)) return false;
    visto.add(desde);
    return (salen.get(desde) || []).some(x => alcanza(x, hasta, visto));
  };

  const dependencias = [];
  const cortadas = [];
  deps.forEach(d => {
    const de = d?.de, a = d?.a;
    if (de == null || a == null || de === a) { if (d) cortadas.push(d); return; }
    // Ya existe el mismo enlace: repetirlo no agrega nada y ensucia la ficha.
    if ((salen.get(de) || []).includes(a)) { cortadas.push(d); return; }
    // Si desde "a" ya se puede llegar a "de", agregar esta lo cierra.
    if (alcanza(a, de)) { cortadas.push(d); return; }
    if (!salen.has(de)) salen.set(de, []);
    salen.get(de).push(a);
    dependencias.push(d);
  });
  return { dependencias, cortadas };
}
