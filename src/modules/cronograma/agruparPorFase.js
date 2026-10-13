// Repartir los grupos del cronograma en sus etapas, para dibujarlos.
//
// MIENTRAS NO HAYA ETAPAS, NO SE VE NINGUNA BANDA. Una obra chica no las
// necesita y llenarla de títulos que dicen "Sin etapa" sería empeorarla para
// resolver un problema que no tiene. Las bandas aparecen cuando alguien crea
// la primera.

/**
 * @param grupos  los grupos del Gantt, ya ordenados como se muestran
 * @param fases   las etapas del proyecto, con su orden
 * @returns       [{ fase, grupos }] — fase nula es "todavía sin etapa"
 */
export function porFases(grupos = [], fases = []) {
  if (!fases.length) return [{ fase: null, grupos }];

  const ordenadas = [...fases].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  const cajas = new Map(ordenadas.map(f => [Number(f.id), { fase: f, grupos: [] }]));
  const sueltos = [];

  grupos.forEach(g => {
    // La etapa del grupo es la de su primera parte: un rubro partido en
    // anticipo, fabricación e instalación es UNA cosa en la tabla y tiene que
    // salir en un solo lugar. Si alguien puso las partes en etapas distintas,
    // manda la de la parte que arranca antes — que es donde uno la busca.
    const f = g.hijas?.find(a => a.fase_id != null)?.fase_id;
    const caja = f != null ? cajas.get(Number(f)) : null;
    (caja ? caja.grupos : sueltos).push(g);
  });

  const salida = [...cajas.values()];
  // Lo que todavía no tiene etapa va al final y A LA VISTA: es trabajo sin
  // clasificar, no un resto. Si está vacío no se dibuja la banda.
  if (sueltos.length) salida.push({ fase: null, grupos: sueltos });
  return salida;
}

/**
 * Las fechas de una etapa: de cuándo arranca lo primero a cuándo termina lo
 * último. No se guardan —se calculan de lo que tiene adentro— porque una etapa
 * que tuviera sus propias fechas podría mentir sobre sus actividades.
 */
export function tramoDe(grupos = []) {
  const inicios = grupos.map(g => g.inicio).filter(Boolean).sort();
  const fines = grupos.map(g => g.fin).filter(Boolean).sort();
  return {
    inicio: inicios[0] || null,
    fin: fines[fines.length - 1] || null,
    barras: grupos.reduce((s, g) => s + (g.hijas?.length || 0), 0),
    critica: grupos.some(g => g.critica),
  };
}
