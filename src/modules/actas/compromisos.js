// LOS COMPROMISOS DE LAS ACTAS, Y QUIÉN LOS SIGUE.
//
// Un compromiso es lo único del acta que sirve para reclamar algo. Pero vivía
// solo adentro del acta: «HCARQ queda en mandar el correo para el viernes» no
// le aparecía a nadie en su bandeja, y dependía de que alguien se acordara en
// la reunión siguiente, que es cuando ya es tarde.
//
// Dos cosas que hay que saber para no contar mal:
//
//   1. UN COMPROMISO QUE SE ARRASTRA ES UNO SOLO. Cada reunión copia los
//      pendientes de la anterior (`viene_de` apunta al original) y la copia
//      vieja se queda como estaba, porque es lo que decía esa acta. Contar
//      todas las filas «pendientes» cuenta el mismo compromiso una vez por
//      cada reunión que pasó: el 11/11/2026 eso daba 49 abiertos cuando había
//      9. El que vale es el de la ÚLTIMA acta de la cadena.
//   2. QUIÉN LO SIGUE SE ELIGE, y no es lo mismo que quién figura. En el acta
//      se escribe «HCARQ», «DINERS», «Área mecánica» —empresas y frentes, como
//      se habla en la reunión— y está bien. Aparte se dice quién lo sigue:
//      alguien del equipo, que recibe su tarea, o un tercero, que queda en
//      «Espero de otros» de quien lleva el proyecto.
//
// Sin base ni pantalla. La copia del servidor está en api/_compromisos.js y
// pruebas/compromisos.test.mjs cuida que digan lo mismo.

const dia = f => String(f || "").slice(0, 10);

/** Todavía hay que hacerlo. */
export const abierto = c => c?.estado === "pendiente" || c?.estado === "reprogramado";

/** La cadena a la que pertenece: el compromiso original. */
export const raiz = c => c.viene_de || c.id;

/**
 * Los compromisos VIVOS: de cada cadena, el de la última acta. Las copias que
 * quedaron en actas anteriores son historia, no pendientes.
 *
 * @param actas  [{ id, numero }]: la última es la de número más alto; si no
 *               se sabe el número, la de id más alto
 */
export function vivos(compromisos = [], actas = []) {
  const numero = new Map(actas.map(a => [String(a.id), Number(a.numero) || 0]));
  const orden = c => [numero.get(String(c.acta_id)) || 0, Number(c.acta_id) || 0, Number(c.id) || 0];
  const masNuevo = (a, b) => { const x = orden(a), y = orden(b); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; };
  const ultimo = new Map();
  for (const c of compromisos) {
    const clave = String(raiz(c));
    const hasta = ultimo.get(clave);
    if (!hasta || masNuevo(c, hasta) > 0) ultimo.set(clave, c);
  }
  return [...ultimo.values()];
}

/** Los que de verdad siguen abiertos. */
export const abiertosDeVerdad = (compromisos = [], actas = []) => vivos(compromisos, actas).filter(abierto);

/** De esos, los que ya pasaron su fecha. */
export const vencidos = (compromisos = [], actas = [], hoy) =>
  abiertosDeVerdad(compromisos, actas).filter(c => dia(c.fecha_limite) && dia(c.fecha_limite) < hoy);

/** Quién lo sigue: «equipo», «tercero», o null si todavía no se dijo. */
export const quienLoSigue = c => (c?.asignado_a ? "equipo" : c?.tercero ? "tercero" : null);

/** Los abiertos a los que todavía no se les dijo quién los sigue. */
export const sinRepartir = (compromisos = [], actas = []) =>
  abiertosDeVerdad(compromisos, actas).filter(c => !quienLoSigue(c) && !c.tarea_id);

/** Lo que se guarda al elegir en el desplegable: "" · "tercero" · el id de alguien del equipo. */
export function decisionDe(valor) {
  if (valor === "tercero") return { asignado_a: null, tercero: true };
  const id = Number(valor);
  return id ? { asignado_a: id, tercero: false } : { asignado_a: null, tercero: false };
}
/** Lo que muestra el desplegable para un compromiso. */
export const valorDe = c => (c?.asignado_a ? String(c.asignado_a) : c?.tercero ? "tercero" : "");

const llano = t => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
/**
 * A quién del equipo nombra el acta, si nombra a alguien con nombre y
 * apellido. No adivina: «HCARQ» es la oficina, no una persona, y decidir quién
 * de la oficina lo sigue es justamente lo que hay que elegir.
 */
export function quienDelEquipo(c, equipo = []) {
  const escrito = llano(c?.responsable_nombre);
  if (!escrito) return null;
  const iguales = equipo.filter(u => llano(u.name || u.nombre) === escrito);
  return iguales.length === 1 ? iguales[0].id : null;
}

/** Los que van a tener tarea: se dijo quién los sigue, siguen abiertos y todavía no la tienen. */
export const paraTarea = (compromisos = []) => compromisos.filter(c => quienLoSigue(c) && !c.tarea_id && abierto(c));

/**
 * La tarea que le corresponde a un compromiso.
 *
 * Del equipo: es de esa persona, y la encargó quien dio el visto. De un
 * tercero: no es de nadie del equipo —dice quién de afuera la tiene— y la
 * «encargó» quien lleva el proyecto, que es en cuya bandeja aparece, en
 * «Espero de otros».
 *
 * @returns la fila para `tasks`, o null si todavía no se dijo quién lo sigue
 */
export function tareaDelCompromiso({ c, acta, lead = null, quien = null }) {
  const sigue = quienLoSigue(c);
  if (!sigue) return null;
  const base = {
    title: String(c.texto || "").slice(0, 200),
    lead_id: lead?.id ?? acta?.lead_id ?? null,
    type: "Gestión", due_date: c.fecha_limite || null,
    // Manda la fecha: lo urgente del acta sigue marcado en el acta.
    priority: "media", status: "en-progreso",
    // De dónde salió. Sin esto, dentro de un mes nadie sabe por qué está esa
    // tarea ahí ni con quién discutirla.
    notes: `Compromiso del acta de reunión N° ${acta?.numero ?? "?"}${acta?.fecha ? ` del ${acta.fecha}` : ""}`
      + (c.responsable_nombre ? `\nResponsable según el acta: ${String(c.responsable_nombre).trim()}` : ""),
  };
  if (sigue === "equipo") return { ...base, assignee_id: c.asignado_a, created_by: quien?.id ?? lead?.responsable_id ?? null };
  return {
    ...base, assignee_id: null,
    responsable_externo: String(c.responsable_nombre || "").trim() || "Un tercero",
    created_by: lead?.responsable_id ?? quien?.id ?? null,
  };
}

/**
 * Lo que pasa con su tarea cuando el compromiso se cierra —o se reabre— desde
 * el acta. Es la misma cosa vista desde dos lados: no puede quedar hecho en el
 * acta y pendiente en la bandeja.
 */
export function alCerrarLaTarea(estado, quienNombre = null, ahora = new Date()) {
  if (estado === "cumplido") return { status: "listo", descartada: false, hecha_at: ahora.toISOString(), hecha_por: quienNombre };
  if (estado === "anulado") return { status: "listo", descartada: true, hecha_at: ahora.toISOString(), hecha_por: quienNombre };
  return { status: "en-progreso", descartada: false, hecha_at: null, hecha_por: null };
}

/**
 * La copia que se lleva a la reunión siguiente. Va con quién lo sigue y con su
 * tarea: es el mismo compromiso, y si la copia naciera sin eso, al dar el
 * visto del acta nueva se le crearía una segunda tarea.
 */
export function alArrastrar(c, actaId, orden) {
  return {
    acta_id: actaId, texto: c.texto,
    responsable_nombre: c.responsable_nombre, responsable_email: c.responsable_email,
    fecha_limite: c.fecha_limite, estado: "pendiente",
    // Lo urgente sigue siendo urgente en la reunión siguiente: si no se hizo y
    // paraba la obra, ahora para más.
    urgente: !!c.urgente,
    viene_de: raiz(c), orden,
    asignado_a: c.asignado_a ?? null, tercero: !!c.tercero, tarea_id: c.tarea_id ?? null,
  };
}
