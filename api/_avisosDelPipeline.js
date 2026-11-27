// LOS AVISOS DEL PIPELINE, del lado del servidor.
//
// Es la misma regla que src/modules/leads/pipeline.js, copiada acá porque el
// correo de la mañana corre en el servidor y no puede importar de la app.
// pruebas/pipeline.test.mjs le da las mismas entradas a las dos y exige la
// misma salida: si se toca una, se toca la otra.
//
// Qué es un aviso: un proyecto que se persigue y hoy pide que alguien haga
// algo. Dos y nada más: llegó el día que se pidió para revisar uno que está
// en espera, o venció algo que tenía fecha. «Sin próximo paso» ya no avisa, y
// el que está en espera sin recordatorio está estacionado, no en falta.

const soloDia = f => String(f || "").slice(0, 10);
const alMediodia = f => new Date(`${soloDia(f)}T12:00:00`);
const diasEntre = (desde, hasta) => Math.round((alMediodia(hasta) - alMediodia(desde)) / 86400000);

export function hoyISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const diaCorto = f => (f ? `${Number(soloDia(f).slice(8, 10))} ${MESES[Number(soloDia(f).slice(5, 7)) - 1]}` : "");
const dias = n => `${n} ${n === 1 ? "día" : "días"}`;

const sePersigue = lead => !!lead && !lead.resultado;
const esDeCompras = t => !!t?.compra_id || t?.type === "Compra";
const abierta = t => t?.status !== "listo";

function proximoPaso(tareas = []) {
  // Lo que está en espera no es el próximo paso, y su fecha no vence mientras
  // espera: FOGA en stand-by con un día ya pasado ponía al proyecto «Vencido».
  const abiertas = tareas.filter(t => abierta(t) && !esDeCompras(t) && !t.espera);
  const conFecha = abiertas.filter(t => t.due_date)
    .sort((a, b) => soloDia(a.due_date).localeCompare(soloDia(b.due_date)) || Number(a.id) - Number(b.id));
  if (conFecha.length) return conFecha[0];
  return abiertas.slice().sort((a, b) => Number(a.id) - Number(b.id))[0] || null;
}

function estadoDelLead(lead, tareas = [], hoy = hoyISO()) {
  const paso = proximoPaso(tareas);
  const abiertas = tareas.filter(t => abierta(t) && !esDeCompras(t)).length;
  if (lead?.espera_desde) {
    const toca = !!lead.recordar_el && soloDia(lead.recordar_el) <= hoy;
    return {
      clase: toca ? "insistir" : "esperando", paso, abiertas,
      dias: Math.max(0, diasEntre(lead.espera_desde, hoy)),
      que: lead.espera_que || null, recordar_el: lead.recordar_el ? soloDia(lead.recordar_el) : null,
      ...(toca ? { tocaba: Math.max(0, diasEntre(lead.recordar_el, hoy)) } : {}),
    };
  }
  if (paso?.due_date) {
    const faltan = diasEntre(hoy, paso.due_date);
    return { clase: faltan < 0 ? "vencido" : "al_dia", paso, abiertas, faltan };
  }
  return { clase: "sin_paso", paso, abiertas };
}

const enEspera = estado => estado?.clase === "insistir" || estado?.clase === "esperando";

function loQueDice(estado) {
  const paso = estado.paso?.title ? `«${estado.paso.title}»` : "";
  if (enEspera(estado)) {
    const desde = `En espera hace ${dias(estado.dias)}${estado.que ? ` · ${estado.que}` : ""}`;
    if (estado.clase === "insistir") return `${desde} · tocaba revisarlo ${estado.tocaba ? `hace ${dias(estado.tocaba)}` : "hoy"}`;
    return desde + (estado.recordar_el ? ` · se recuerda el ${diaCorto(estado.recordar_el)}` : "");
  }
  if (estado.clase === "vencido") return `${paso} · atrasado ${dias(-estado.faltan)}`;
  if (estado.clase === "al_dia") {
    return `${paso} · ${estado.faltan === 0 ? "hoy" : estado.faltan === 1 ? "mañana" : `en ${dias(estado.faltan)}`}`;
  }
  const n = estado.abiertas ?? (estado.paso ? 1 : 0);
  return n ? `${n} ${n === 1 ? "actividad abierta" : "actividades abiertas"}, sin fecha` : "Sin actividades abiertas";
}

const ORDEN_DE_AVISOS = { insistir: 0, vencido: 1 };
const cuantoAprieta = e => (e.clase === "insistir" ? e.tocaba || 0 : e.clase === "vencido" ? -e.faltan : 0);

/** @returns [{ clase, lead_id, nombre, texto, responsable_id, created_by }] */
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
/**
 * LAS APROBACIONES QUE EL CLIENTE DEJÓ PASAR: se le pidió, tenía fecha límite,
 * el día ya pasó y no contestó (migración 188). Es la misma regla que
 * `aprobacionesVencidas` de src/modules/leads/aprobaciones.js, copiada acá
 * porque el correo de la mañana corre en el servidor;
 * pruebas/fechaLimiteDeAprobacion.test.mjs exige que las dos digan lo mismo.
 *
 * @returns [{ lead_id, nombre, task_id, titulo, hasta, dias, texto, responsable_id, created_by, assignee_id }]
 */
export function aprobacionesVencidas({ leads = [], tareas = [], hoy = hoyISO() } = {}) {
  const porId = new Map((leads || []).map(l => [String(l.id), l]));
  const texto = v => String(v ?? "").trim();
  return (tareas || [])
    .filter(t => t && t.cliente_aprueba === true && !t.cliente_respuesta && soloDia(t.cliente_aprueba_hasta) && soloDia(t.cliente_aprueba_hasta) < hoy
      && t.visible_cliente !== false && t.status !== "listo" && !t.descartada && t.lead_id != null)
    .map(t => {
      const l = porId.get(String(t.lead_id));
      if (!l || l.resultado === "perdido") return null;
      const hasta = soloDia(t.cliente_aprueba_hasta), n = diasEntre(hasta, hoy);
      return {
        lead_id: l.id, nombre: l.nombre, task_id: t.id, titulo: texto(t.title), hasta, dias: n,
        texto: `«${texto(t.title)}» venció el ${diaCorto(hasta)}, hace ${n} ${n === 1 ? "día" : "días"}`,
        responsable_id: l.responsable_id ?? null, created_by: l.created_by ?? null, assignee_id: t.assignee_id ?? null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.dias - a.dias || String(a.nombre).localeCompare(String(b.nombre)) || Number(a.task_id) - Number(b.task_id));
}

export const esMiAviso = (aviso, usuarioId, veTodo = false) =>
  veTodo || String(aviso.responsable_id) === String(usuarioId) || String(aviso.created_by) === String(usuarioId);
