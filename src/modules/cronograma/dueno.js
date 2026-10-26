// DE QUIÉN ES UN CRONOGRAMA: de un proyecto o de un presupuesto.
//
// El de la obra en curso es del proyecto. El que va con una cotización es del
// presupuesto que se está trabajando: la v1 y la v2 tienen otros metros y
// cada una necesita el suyo, y un presupuesto se trabaja mucho antes de tener
// proyecto.
//
// Todo el módulo habla con "el dueño" en vez de con "el proyecto": de dónde
// leer y dónde guardar las barras, las etapas, las versiones y el plazo. Un
// número suelto es un proyecto, que es lo que se pasaba antes de que esto
// existiera.

export const PRESUPUESTO = "presupuesto";

export const esDePresupuesto = x => x?.duenoTipo === PRESUPUESTO;

/** Tabla del dueño y columna que lo apunta en las tablas del cronograma. */
export function dueno(x) {
  if (x == null) return null;
  if (typeof x !== "object") return { tabla: "leads", campo: "lead_id", id: x };
  return esDePresupuesto(x)
    ? { tabla: "presupuestos", campo: "presupuesto_id", id: x.id }
    : { tabla: "leads", campo: "lead_id", id: x.id };
}

/** Lo que va en una fila nueva para que quede del dueño: { lead_id } o { presupuesto_id }. */
export const filaDe = x => {
  const d = dueno(x);
  return d ? { [d.campo]: d.id } : {};
};

/** Una clave que no se confunde: el proyecto 5 y el presupuesto 5 son otros. */
export const claveDe = x => {
  const d = dueno(x);
  return d ? `${d.campo}:${d.id}` : null;
};

/**
 * Un presupuesto con la forma de un proyecto para la pantalla del cronograma.
 *
 * Sin obra —todavía no se ganó— y con su plazo propio. `lead_id` es el
 * proyecto del que cuelga, si cuelga de alguno: sirve para saber quién puede
 * editarlo, no para guardar nada ahí.
 */
export function presupuestoComoDueno(p) {
  return {
    ...p,
    duenoTipo: PRESUPUESTO,
    obra_id: null,
    resultado: null,
  };
}
