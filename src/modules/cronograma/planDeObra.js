// De lo que devuelve NOVA al plan que se guarda. Sin base de datos, para poder
// probarlo: es el punto donde una respuesta de un modelo se convierte en algo
// que la obra va a creer.

const n = v => Number(v) || 0;
const limpio = (t, largo = 90) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, largo);

/**
 * EL PLAN: etapas, y adentro de cada una sus actividades.
 *
 * Es otra forma de pedir el cronograma y vale la pena decir por qué cambió.
 * Antes se pedía UNA actividad POR AGRUPACIÓN del presupuesto: el cronograma
 * era el presupuesto puesto de costado. Eso no es como se construye. Una obra
 * se piensa por etapas —preliminares, obra gris, instalaciones, acabados,
 * entrega— y adentro de cada etapa hay trabajos que no son rubros de ningún
 * presupuesto: el desmontaje de lo que había, el replanteo, las pruebas, la
 * limpieza final. Pedirle el presupuesto ordenado daba un cronograma que no
 * se parecía a la obra, y había que corregirlo entero a mano.
 *
 * Ahora NOVA arma la estructura y el presupuesto entra adentro: cada actividad
 * puede colgar de una agrupación —y entonces el control y el valorado hablan
 * de lo mismo— o no colgar de ninguna, y ser propia del cronograma.
 *
 * LO QUE ESTA FUNCIÓN GARANTIZA, porque de eso depende que la plata cierre:
 * · ninguna agrupación se pierde. La que NOVA no nombró se devuelve aparte
 *   para agregarla, no se descarta en silencio;
 * · ninguna agrupación aparece dos veces. Dos barras colgando de la misma
 *   agrupación la contarían dos veces en el valorado;
 * · ninguna actividad sin nombre ni sin días.
 */
export function normalizarPlan(datos, agrupaciones = []) {
  const validas = new Map(agrupaciones.map(a => [Number(a.id), a]));
  const usadas = new Set();
  const etapas = [];

  (datos?.etapas || []).forEach(e => {
    const nombre = limpio(e?.nombre, 80);
    if (!nombre) return;
    const actividades = [];
    (e?.actividades || []).forEach(a => {
      const suNombre = limpio(a?.nombre);
      if (!suNombre) return;
      const dias = Math.max(1, Math.round(n(a?.dias)));
      // La agrupación solo si existe y si nadie la tomó antes.
      const id = a?.agrupacion == null ? null : Number(a.agrupacion);
      const agrupacion = id != null && validas.has(id) && !usadas.has(id) ? id : null;
      if (agrupacion != null) usadas.add(agrupacion);
      actividades.push({
        nombre: suNombre, dias, agrupacion,
        porque: limpio(a?.porque, 160) || null,
        // Lo que se hace adentro y no es rubro: replanteo, pruebas, curado.
        incluye: Array.isArray(a?.incluye) ? a.incluye.map(x => limpio(x, 60)).filter(Boolean).slice(0, 8) : null,
      });
    });
    if (actividades.length) etapas.push({ nombre, actividades });
  });

  // LAS QUE NOVA NO NOMBRÓ NO SE PIERDEN. Son plata del presupuesto: si no
  // están en el cronograma, el valorado no las puede repartir en el tiempo y
  // la obra queda con un agujero que nadie ve hasta que falta.
  const faltantes = agrupaciones.filter(a => !usadas.has(Number(a.id)));
  return { etapas, faltantes, barras: etapas.reduce((s, e) => s + e.actividades.length, 0) };
}

/**
 * Las que NOVA no puso, metidas al final en su propia etapa.
 *
 * No se las intercala adivinando dónde irían: se las junta en un lugar visible
 * y con un nombre que dice lo que son. Una duración repartida a prorrata es un
 * número para corregir, y tiene que verse como tal.
 */
export function conLasFaltantes(plan, diasPlazo = 0) {
  if (!plan.faltantes.length) return plan;
  const plata = plan.faltantes.reduce((s, a) => s + n(a.monto), 0);
  const actividades = plan.faltantes.map(a => ({
    nombre: limpio(a.nombre),
    // A prorrata de lo que pesa, y nunca menos de un día ni más que el plazo.
    dias: Math.max(1, Math.min(diasPlazo || 30,
      Math.round(((plata ? n(a.monto) / plata : 1 / plan.faltantes.length)) * (diasPlazo || 30)))),
    agrupacion: Number(a.id),
    porque: "no la ubicó NOVA: duración repartida por lo que pesa, hay que revisarla",
    incluye: null,
  }));
  return {
    ...plan,
    etapas: [...plan.etapas, { nombre: "Sin ubicar — revisar", actividades }],
    barras: plan.barras + actividades.length,
  };
}
