// EL PIPELINE ES LO QUE SE PERSIGUE.
//
// Tres reglas, y esta hoja no sabe más que eso (ver
// docs/reingenieria-pipeline-tareas.md):
//
//   1. Un lead tiene un TIPO —Diseño, Construcción, o Diseño y construcción—
//      y está en UNA etapa, una de las de su tipo. No hay etapas «en curso» en
//      paralelo ni «estamos acá»: es un dato del lead, no una fila por etapa.
//   2. Mientras se persigue está en el pipeline. Cuando se aprueba sale —vive
//      en Control—, y si se pierde se cierra con su motivo.
//   3. Siempre tiene una fecha en la que alguien lo vuelve a mirar: o nos toca
//      a nosotros (su próximo paso, que es una tarea suya con fecha) o le toca
//      al cliente (está esperando su respuesta, con el día en que FOREMAN lo
//      recuerda). El que no tiene ninguna de las dos es el que se pierde sin
//      que nadie lo decida, y se marca.
//
// Acá no se lee ni se escribe la base: se decide. Lo que se guarda lo guarda
// quien llama, con los campos que esto devuelve.
//
// Hay una copia de lo que arma los avisos en api/_avisosDelPipeline.js, para el
// correo de la mañana; pruebas/pipeline.test.mjs cuida que digan lo mismo.

/** Los tres tipos de lead. Los definió Hernán; son el título del pipeline. */
export const TIPOS = {
  diseno: { label: "Diseño", prefijo: "dis", color: "#4A7C8C" },
  construccion: { label: "Construcción", prefijo: "con", color: "#1F7A4D" },
  diseno_construccion: { label: "Diseño y construcción", prefijo: "dyc", color: "#2E5A6B" },
};
export const ORDEN_DE_TIPOS = Object.keys(TIPOS);

/**
 * El tipo de un lead, o null si todavía no se dijo.
 *
 * En la base es `leads.tunel`. Los valores de antes —«lead», «arquitectura»—
 * no son un tipo: el primero quería decir «todavía se persigue», que ahora lo
 * dice `resultado`; el segundo era Diseño con otro nombre.
 */
export const tipoDe = lead => (TIPOS[lead?.tunel] ? lead.tunel : lead?.tunel === "arquitectura" ? "diseno" : null);

export const estaAprobado = lead => lead?.resultado === "ganado";
export const estaPerdido = lead => lead?.resultado === "perdido";
export const sePersigue = lead => !!lead && !lead.resultado;

/**
 * ¿Tiene obra que llevar? Lo preguntan el libro, las actas y las observaciones.
 *
 * Aprobado, o con obra abierta, o marcado a mano como proyecto (`es_lead` en
 * falso): RES BG se persigue todavía y ya lleva libro, y eso no cambia.
 */
export const esProyecto = lead => estaAprobado(lead) || !!lead?.obra_id || lead?.es_lead === false;

// El catálogo de etapas vive en la base (`pipeline_etapas`), porque cambia con
// el tiempo y se edita en Ajustes → Etapas. Esto es lo mismo que siembra la
// migración 171: sirve mientras carga, y si el catálogo no se pudo leer.
//
// Son las etapas de PERSEGUIR un trabajo, por tipo de lead. Las de ejecutarlo
// —obra gris, acabados, entrega— no van acá: eso es Control.
const deFabrica = (tunel, prefijo, orden, clave, nombre) => ({ id: `${prefijo}_${clave}`, nombre, orden, tunel, color: "#4A7C8C", activa: true });
export const CATALOGO_BASE = [
  deFabrica("diseno", "dis", 10, "contacto", "Contacto"),
  deFabrica("diseno", "dis", 20, "levantamiento", "Levantamiento"),
  deFabrica("diseno", "dis", 30, "plan_masa", "Plan masa"),
  deFabrica("diseno", "dis", 40, "anteproyecto", "Anteproyecto"),
  deFabrica("diseno", "dis", 50, "propuesta", "Propuesta de honorarios"),
  deFabrica("diseno", "dis", 60, "negociacion", "Negociación"),
  deFabrica("construccion", "con", 10, "contacto", "Contacto"),
  deFabrica("construccion", "con", 20, "levantamiento", "Levantamiento"),
  deFabrica("construccion", "con", 30, "ingenierias", "Ingenierías"),
  deFabrica("construccion", "con", 40, "presupuesto", "Presupuesto"),
  deFabrica("construccion", "con", 50, "propuesta", "Propuesta enviada"),
  deFabrica("construccion", "con", 60, "negociacion", "Negociación"),
  deFabrica("diseno_construccion", "dyc", 10, "contacto", "Contacto"),
  deFabrica("diseno_construccion", "dyc", 20, "levantamiento", "Levantamiento"),
  deFabrica("diseno_construccion", "dyc", 30, "plan_masa", "Plan masa"),
  deFabrica("diseno_construccion", "dyc", 40, "anteproyecto", "Anteproyecto"),
  deFabrica("diseno_construccion", "dyc", 50, "ingenierias", "Ingenierías"),
  deFabrica("diseno_construccion", "dyc", 60, "presupuesto", "Presupuesto"),
  deFabrica("diseno_construccion", "dyc", 70, "propuesta", "Propuesta enviada"),
  deFabrica("diseno_construccion", "dyc", 80, "negociacion", "Negociación"),
];

const llano = t => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Las etapas de un tipo, en su orden. Son las que ofrece el desplegable. */
export const etapasDelTipo = (catalogo = [], tipo) =>
  catalogo.filter(e => e.tunel === tipo && e.activa !== false).sort((a, b) => (a.orden || 0) - (b.orden || 0));

/** La etapa en la que está un lead: una de las de su tipo, o null. */
export function etapaDelLead(lead, catalogo = []) {
  return etapasDelTipo(catalogo, tipoDe(lead)).find(e => e.id === lead?.etapa) || null;
}

/** Cómo se llama una etapa, siga activa o no: las tareas viejas la llevan de etiqueta. */
export const nombreDeEtapa = (id, catalogo = []) => catalogo.find(e => e.id === id)?.nombre || null;

/**
 * A qué etapa va un lead cuando se le cambia el tipo: la que se llama igual en
 * el tipo nuevo —de «Presupuesto» de Construcción a «Presupuesto» de Diseño y
 * construcción— y, si no hay, la primera.
 */
export function etapaAlCambiarDeTipo(lead, tipoNuevo, catalogo = []) {
  const nuevas = etapasDelTipo(catalogo, tipoNuevo);
  const actual = catalogo.find(e => e.id === lead?.etapa);
  const igual = actual && nuevas.find(e => llano(e.nombre) === llano(actual.nombre));
  return (igual || nuevas[0])?.id || null;
}

// ─── Fechas ────────────────────────────────────────────────────────────────
// Todo en días, como texto AAAA-MM-DD, y leído al mediodía: una fecha sin hora
// la lee el navegador como medianoche en Londres, que en Ecuador es el día
// anterior.

const soloDia = f => String(f || "").slice(0, 10);
const alMediodia = f => new Date(`${soloDia(f)}T12:00:00`);

/** Cuántos días van de una fecha a otra. Negativo si la segunda es anterior. */
export const diasEntre = (desde, hasta) => Math.round((alMediodia(hasta) - alMediodia(desde)) / 86400000);

/** Esa fecha más tantos días. */
export function sumarDias(iso, n) {
  const d = alMediodia(iso);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Hoy, en la fecha de quien mira y no en la de Londres. */
export function hoyISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** «14 nov»: se lee; «2026-11-14» hay que traducirlo. */
export const diaCorto = f => (f ? `${Number(soloDia(f).slice(8, 10))} ${MESES[Number(soloDia(f).slice(5, 7)) - 1]}` : "");

const dias = n => `${n} ${n === 1 ? "día" : "días"}`;

// ─── El próximo paso ───────────────────────────────────────────────────────

// Una compra no es un paso del lead: se sigue en Compras.
const esDeCompras = t => !!t?.compra_id || t?.type === "Compra";
const abierta = t => t?.status !== "listo";

/**
 * El próximo paso de un lead: su tarea abierta más próxima.
 *
 * Manda la fecha. Si ninguna tiene, la primera que se escribió: sirve para
 * decir cuál es, pero no cuenta como «alguien lo vuelve a mirar» porque no
 * dice cuándo.
 */
export function proximoPaso(tareas = []) {
  const abiertas = tareas.filter(t => abierta(t) && !esDeCompras(t));
  const conFecha = abiertas.filter(t => t.due_date)
    .sort((a, b) => soloDia(a.due_date).localeCompare(soloDia(b.due_date)) || Number(a.id) - Number(b.id));
  if (conFecha.length) return conFecha[0];
  return abiertas.slice().sort((a, b) => Number(a.id) - Number(b.id))[0] || null;
}

/**
 * En qué está un lead que se persigue. Una sola de cinco:
 *
 *   insistir  · espera al cliente y llegó el día de recordarlo
 *   esperando · espera al cliente y todavía no toca
 *   vencido   · su próximo paso ya pasó
 *   al_dia    · tiene próximo paso con fecha
 *   sin_paso  · ni una cosa ni la otra: nadie lo va a volver a mirar
 *
 * Esperar al cliente manda sobre lo demás: mientras la pelota está del otro
 * lado, un paso nuestro atrasado no es lo que hay que resolver.
 */
export function estadoDelLead(lead, tareas = [], hoy = hoyISO()) {
  const paso = proximoPaso(tareas);
  if (lead?.espera_desde) {
    // Sin día de recordatorio se recuerda ya: lo que no puede pasar es que
    // quede esperando para siempre.
    const toca = !lead.recordar_el || soloDia(lead.recordar_el) <= hoy;
    return {
      clase: toca ? "insistir" : "esperando", paso,
      dias: Math.max(0, diasEntre(lead.espera_desde, hoy)),
      que: lead.espera_que || null, recordar_el: lead.recordar_el ? soloDia(lead.recordar_el) : null,
    };
  }
  if (paso?.due_date) {
    const faltan = diasEntre(hoy, paso.due_date);
    return { clase: faltan < 0 ? "vencido" : "al_dia", paso, faltan };
  }
  return { clase: "sin_paso", paso };
}

/** Lo que dice la tarjeta del lead, en una línea. */
export function loQueDice(estado) {
  const paso = estado.paso?.title ? `«${estado.paso.title}»` : "";
  if (estado.clase === "insistir") return `Insistir con el cliente: sin respuesta hace ${dias(estado.dias)}${estado.que ? ` · ${estado.que}` : ""}`;
  if (estado.clase === "esperando") {
    return `Esperando al cliente hace ${dias(estado.dias)}${estado.que ? ` · ${estado.que}` : ""}`
      + (estado.recordar_el ? ` · se recuerda el ${diaCorto(estado.recordar_el)}` : "");
  }
  if (estado.clase === "vencido") return `${paso} · atrasado ${dias(-estado.faltan)}`;
  if (estado.clase === "al_dia") {
    return `${paso} · ${estado.faltan === 0 ? "hoy" : estado.faltan === 1 ? "mañana" : `en ${dias(estado.faltan)}`}`;
  }
  return paso ? `${paso} · sin fecha` : "Sin próximo paso";
}

// ─── Los avisos ────────────────────────────────────────────────────────────

const ORDEN_DE_AVISOS = { insistir: 0, vencido: 1, sin_paso: 2 };
// Dentro de cada clase, primero el que lleva más días así.
const cuantoAprieta = e => (e.clase === "insistir" ? e.dias : e.clase === "vencido" ? -e.faltan : 0);

/**
 * Los avisos del pipeline: los leads que hoy piden que alguien haga algo.
 *
 * Tres y nada más —llegó el día de insistir, el próximo paso está vencido, no
 * tiene próximo paso ni espera—, y solo de los que se persiguen. Es la misma
 * lista para la pantalla del pipeline, el panel del dashboard y el correo de
 * la mañana: no pueden decir cosas distintas.
 *
 * @param tareas  todas las tareas con `lead_id`; acá se reparten por lead
 * @returns [{ clase, lead_id, nombre, texto, responsable_id, created_by }]
 */
export function avisosDelPipeline({ leads = [], tareas = [], hoy = hoyISO() }) {
  const porLead = new Map();
  tareas.forEach(t => {
    if (t.lead_id == null) return;
    const k = String(t.lead_id);
    if (!porLead.has(k)) porLead.set(k, []);
    porLead.get(k).push(t);
  });
  return leads.filter(sePersigue)
    .map(l => ({ l, estado: estadoDelLead(l, porLead.get(String(l.id)) || [], hoy) }))
    .filter(x => x.estado.clase in ORDEN_DE_AVISOS)
    .sort((a, b) => ORDEN_DE_AVISOS[a.estado.clase] - ORDEN_DE_AVISOS[b.estado.clase]
      || cuantoAprieta(b.estado) - cuantoAprieta(a.estado)
      || String(a.l.nombre).localeCompare(String(b.l.nombre)))
    .map(({ l, estado }) => ({
      clase: estado.clase, lead_id: l.id, nombre: l.nombre, texto: loQueDice(estado),
      responsable_id: l.responsable_id ?? null, created_by: l.created_by ?? null,
    }));
}

/** ¿Este aviso es de esta persona? El Director ve los de toda la oficina. */
export const esMiAviso = (aviso, usuarioId, veTodo = false) =>
  veTodo || String(aviso.responsable_id) === String(usuarioId) || String(aviso.created_by) === String(usuarioId);

// ─── Lo que se guarda al tocar ─────────────────────────────────────────────
// Cada una devuelve los campos del lead y lo que queda escrito en su historia.

/** En cuánto se recuerda, de un toque. La tercera opción es elegir la fecha. */
export const RECORDAR_EN = [{ dias: 3, label: "En 3 días" }, { dias: 7, label: "En una semana" }];

const SIN_ESPERA = { espera_desde: null, espera_que: null, recordar_el: null };

/** Queda esperando la respuesta del cliente, con el día en que se recuerda. */
export function alEsperar({ que, recordarEl, hoy = hoyISO() }) {
  const dia = soloDia(recordarEl);
  if (!dia) return { error: "Decí cuándo te lo recuerdo." };
  if (dia < hoy) return { error: "El recordatorio no puede ser de un día que ya pasó." };
  const texto = String(que || "").trim();
  return {
    campos: { espera_desde: hoy, espera_que: texto || null, recordar_el: dia },
    detalle: `Queda esperando respuesta del cliente${texto ? `: ${texto}` : ""}. Se recuerda el ${diaCorto(dia)}.`,
  };
}

/** El cliente respondió: deja de esperar, y ahora nos toca a nosotros. */
export function alResponder(lead, hoy = hoyISO()) {
  const n = lead?.espera_desde ? Math.max(0, diasEntre(lead.espera_desde, hoy)) : 0;
  return { campos: { ...SIN_ESPERA }, detalle: `El cliente respondió${n ? `, después de ${dias(n)}` : ""}.` };
}

/** Se insistió hoy: queda escrito, y se vuelve a recordar. Sigue esperando desde el mismo día. */
export function alInsistir(lead, { recordarEl, hoy = hoyISO() }) {
  const dia = soloDia(recordarEl);
  if (!dia || dia <= hoy) return { error: "Decí cuándo te lo vuelvo a recordar: tiene que ser más adelante." };
  const n = lead?.espera_desde ? Math.max(0, diasEntre(lead.espera_desde, hoy)) : 0;
  return {
    campos: { recordar_el: dia },
    detalle: `Insistió con el cliente${n ? `: sin respuesta hace ${dias(n)}` : ""}. Se vuelve a recordar el ${diaCorto(dia)}.`,
  };
}

/** Correr el recordatorio sin haber insistido. */
export function alPosponer({ recordarEl, hoy = hoyISO() }) {
  const dia = soloDia(recordarEl);
  if (!dia || dia < hoy) return { error: "Elegí un día de hoy en adelante." };
  return { campos: { recordar_el: dia }, detalle: `El recordatorio del cliente pasa al ${diaCorto(dia)}.` };
}

/** Pasar a otra etapa: cualquiera de las de su tipo, sin orden obligado. */
export function alCambiarEtapa(lead, etapaId, catalogo = []) {
  if (!etapaId || etapaId === lead?.etapa) return null;
  const de = nombreDeEtapa(lead?.etapa, catalogo) || "Sin etapa";
  const a = nombreDeEtapa(etapaId, catalogo) || etapaId;
  return { campos: { etapa: etapaId }, tipo: "etapa", detalle: `${de} → ${a}`, etapa_de: lead?.etapa || null, etapa_a: etapaId };
}

/** Cambiar el tipo: el lead cae en la etapa que se llama igual, o en la primera. */
export function alCambiarTipo(lead, tipoNuevo, catalogo = []) {
  if (!TIPOS[tipoNuevo] || tipoNuevo === tipoDe(lead)) return null;
  const etapa = etapaAlCambiarDeTipo(lead, tipoNuevo, catalogo);
  const antes = TIPOS[tipoDe(lead)]?.label;
  return {
    campos: { tunel: tipoNuevo, ...(etapa ? { etapa } : {}) },
    detalle: `${antes ? `Pasa de ${antes} a` : "Queda como"} ${TIPOS[tipoNuevo].label}`
      + (etapa ? `, en ${nombreDeEtapa(etapa, catalogo) || etapa}.` : "."),
  };
}

/** Se aprobó: sale del pipeline. */
export function alAprobar() {
  return {
    campos: { resultado: "ganado", es_lead: false, ...SIN_ESPERA },
    detalle: "Aprobado: sale del pipeline y pasa a los proyectos en marcha.",
  };
}

/** Se perdió: se cierra, y el motivo se pide porque es lo único que enseña algo. */
export function alPerder(motivo) {
  const texto = String(motivo || "").trim();
  if (!texto) return { error: "Escribí por qué se perdió: precio, plazo, se fue con otro…" };
  return { campos: { resultado: "perdido", motivo_perdida: texto, ...SIN_ESPERA }, detalle: `Perdido: ${texto}` };
}

/** Vuelve al pipeline: se había cerrado antes de tiempo. */
export function alReabrir() {
  return { campos: { resultado: null, motivo_perdida: null }, detalle: "Vuelve al pipeline." };
}

// ─── La pantalla ───────────────────────────────────────────────────────────

/**
 * El pipeline, agrupado como se lee: por tipo, y dentro de cada tipo cuántos
 * hay en cada etapa. Los que todavía no tienen tipo van al final, en su grupo,
 * para que se les ponga.
 *
 * @returns [{ tipo, label, color, leads, etapas: [{ id, nombre, cuantos }] }]
 */
export function porTipo(leads = [], catalogo = []) {
  const grupos = [...ORDEN_DE_TIPOS, null].map(tipo => {
    const suyos = leads.filter(l => tipoDe(l) === tipo);
    const etapas = etapasDelTipo(catalogo, tipo);
    const orden = id => { const i = etapas.findIndex(e => e.id === id); return i < 0 ? 999 : i; };
    return {
      tipo, label: tipo ? TIPOS[tipo].label : "Sin tipo", color: tipo ? TIPOS[tipo].color : "#8B92A5",
      leads: suyos.slice().sort((a, b) => orden(a.etapa) - orden(b.etapa) || String(a.nombre).localeCompare(String(b.nombre))),
      etapas: etapas.map(e => ({ id: e.id, nombre: e.nombre, cuantos: suyos.filter(l => l.etapa === e.id).length })),
    };
  });
  return grupos.filter(g => g.leads.length);
}
