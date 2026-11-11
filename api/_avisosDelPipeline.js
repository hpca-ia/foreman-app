// LOS AVISOS DEL PIPELINE, del lado del servidor.
//
// Es la misma regla que src/modules/leads/pipeline.js, copiada acá porque el
// correo de la mañana corre en el servidor y no puede importar de la app.
// pruebas/pipeline.test.mjs le da las mismas entradas a las dos y exige la
// misma salida: si se toca una, se toca la otra.
//
// Qué es un aviso: un lead que se persigue y hoy pide que alguien haga algo
// —llegó el día de insistirle al cliente, su próximo paso está vencido, o no
// tiene próximo paso ni está esperando al cliente—.

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
  const abiertas = tareas.filter(t => abierta(t) && !esDeCompras(t));
  const conFecha = abiertas.filter(t => t.due_date)
    .sort((a, b) => soloDia(a.due_date).localeCompare(soloDia(b.due_date)) || Number(a.id) - Number(b.id));
  if (conFecha.length) return conFecha[0];
  return abiertas.slice().sort((a, b) => Number(a.id) - Number(b.id))[0] || null;
}

function estadoDelLead(lead, tareas = [], hoy = hoyISO()) {
  const paso = proximoPaso(tareas);
  if (lead?.espera_desde) {
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

function loQueDice(estado) {
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

const ORDEN_DE_AVISOS = { insistir: 0, vencido: 1, sin_paso: 2 };
const cuantoAprieta = e => (e.clase === "insistir" ? e.dias : e.clase === "vencido" ? -e.faltan : 0);

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
export const esMiAviso = (aviso, usuarioId, veTodo = false) =>
  veTodo || String(aviso.responsable_id) === String(usuarioId) || String(aviso.created_by) === String(usuarioId);
