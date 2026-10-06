// Cuánta plata lleva cada barra del cronograma.
//
// UN RUBRO NO TIENE DEPENDENCIAS NI FECHAS. Un rubro es plata y cantidad: 40
// metros de manguera, 1.200 dólares. No sabe de qué depende ni cuándo se hace;
// eso es de la BARRA. La barra tiene duración, fechas, dependencias, traslape
// y holgura, y es la que el cálculo mueve cuando algo se atrasa.
//
// Por eso ponerle fechas a cada rubro no funcionaría: quedarían fechas fijas,
// sin nada que las trabe ni las empuje. Si la estructura se atrasa quince
// días, las barras que dependen de ella se corren solas; cuarenta rubros con
// fecha escrita a mano se quedan donde estaban, y el cronograma pasa a mentir
// en cuarenta lugares a la vez. Se pierde la ruta crítica, que es la mitad de
// para qué sirve un cronograma.
//
// Lo que SÍ hace falta es decir qué plata va en cada barra, y para eso el dato
// exacto ya existe: los rubros del capítulo. Se marcan los que van juntos y se
// mandan a su parte. La barra sigue siendo una actividad normal —se encadena,
// se traslapa, se mueve— y su monto deja de ser un porcentaje inventado para
// pasar a ser la suma de lo que de verdad lleva adentro.
//
// Dos maneras de decir la plata de una barra, y conviven:
//
//   POR RUBROS. Exacta. La suma de los que se le asignaron. No hay que cuadrar
//   nada en 100 —las partes suman el capítulo por construcción— y una orden de
//   cambio que encarece un rubro mueve sola la parte donde ese rubro está.
//
//   POR PORCENTAJE. Para lo que no se puede separar en rubros: el anticipo de
//   una importación es el 50% del mismo rubro, no otros rubros.

const n = v => Number(v) || 0;
const redondo = v => Math.round(v * 100) / 100;

/**
 * La plata de cada actividad del cronograma.
 *
 * @param actividades [{ id, obra_actividad_id, peso_pct }]
 * @param rubros      [{ total_base, actividad_id, crono_actividad_id, anulado_por_oc }]
 * @returns { porActividad: Map<id, monto>, porAgrupacion: Map<id, monto>, asignados: Map<actividadId, nº de rubros> }
 */
export function plataDelPlan(actividades = [], rubros = []) {
  // Lo que una orden de cambio sacó del contrato no cuenta: sigue en la lista
  // como historia del presupuesto, pero ya no es trabajo que haya que hacer.
  // Es lo mismo que suma el control de obra.
  const vivos = rubros.filter(r => !r.anulado_por_oc);

  const porAgrupacion = new Map();
  vivos.forEach(r => {
    const k = Number(r.actividad_id) || 0;
    porAgrupacion.set(k, redondo((porAgrupacion.get(k) || 0) + n(r.total_base)));
  });

  // Lo que se mandó a una barra en concreto.
  const deRubros = new Map();
  const asignados = new Map();
  const ids = new Set(actividades.map(a => a.id));
  vivos.forEach(r => {
    const a = Number(r.crono_actividad_id);
    if (!a || !ids.has(a)) return;
    deRubros.set(a, redondo((deRubros.get(a) || 0) + n(r.total_base)));
    asignados.set(a, (asignados.get(a) || 0) + 1);
  });

  const porActividad = new Map();
  const porGrupo = new Map();
  actividades.forEach(a => {
    const g = Number(a.obra_actividad_id) || 0;
    if (!porGrupo.has(g)) porGrupo.set(g, []);
    porGrupo.get(g).push(a);
  });

  porGrupo.forEach((hijas, g) => {
    const total = porAgrupacion.get(g) || 0;
    // Lo que ya tiene dueño por rubro sale del reparto: repartirlo otra vez por
    // porcentaje sería contar esa plata dos veces.
    const conRubros = hijas.filter(a => deRubros.has(a.id));
    const porPeso = hijas.filter(a => !deRubros.has(a.id));
    const tomado = conRubros.reduce((t, a) => t + deRubros.get(a.id), 0);
    const resto = redondo(total - tomado);

    conRubros.forEach(a => porActividad.set(a.id, deRubros.get(a.id)));
    if (!porPeso.length) return;

    // El resto entre las que quedan, a prorrata de sus pesos. Normalizado: si
    // los pesos no cierran en 100 —porque dos de las tres partes ya tienen sus
    // rubros— igual se reparte TODO el resto, que es lo que hace que la suma
    // del capítulo dé el capítulo.
    const suma = porPeso.reduce((t, a) => t + n(a.peso_pct ?? 100), 0);
    porPeso.forEach((a, i) => {
      const parte = suma > 0 ? n(a.peso_pct ?? 100) / suma : 1 / porPeso.length;
      // Al último le toca lo que falte, para que no se pierda un centavo en
      // los redondeos: la suma de las partes tiene que dar el capítulo.
      const monto = i === porPeso.length - 1
        ? redondo(resto - porPeso.slice(0, -1).reduce((t, x) => t + (porActividad.get(x.id) || 0), 0))
        : redondo(resto * parte);
      porActividad.set(a.id, monto);
    });
  });

  return { porActividad, porAgrupacion, asignados };
}
