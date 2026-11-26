// LAS APROBACIONES DEL CLIENTE: a quién se le avisa, cómo, y el registro.
//
// Hernán, 17/11/2026: «en este proyecto quiero implementar aprobaciones de los
// clientes... residente o nosotros subimos información, planos, presupuestos,
// y estos los aprueba el cliente. Esta colección de aprobaciones es un
// sustento y justificación. ¿Cómo lo manejamos? ¿Desde dónde?... Cada vez que
// se solicite una aprobación FOREMAN manda un mensaje al cliente, por WhatsApp
// y correo».
//
// SE PIDE DESDE EL PUNTO —el plano o el presupuesto se sube ahí, y ahí se le
// pide que lo apruebe—, y TODO LO PEDIDO SE JUNTA EN EL REGISTRO: una fila por
// cada pedido, con quién lo pidió, a quién se le avisó, qué contestó y qué
// archivos tenía para mirar (migración 187). Cuando aprueba, queda ahí: eso
// fue lo que definió para «la parte administrativa».
//
// EL AVISO. El correo lo manda el servidor. Por WhatsApp el número de FOREMAN
// todavía no está configurado —«aún no tenemos configurado FOREMAN y WP»—, así
// que se arma el mensaje con su enlace y se abre el WhatsApp de quien lo pide,
// para que toque enviar. Eligió eso por ahora, y automático después.
//
// LA FECHA LÍMITE. Hernán, 18/11/2026: «¿hay cómo poner una fecha límite en
// que el cliente debe aprobar?». Se elige al pedir o al enviar; el cliente la
// ve en su enlace, en el correo y en el WhatsApp. Lo que definió para cuando
// llega y no contestó: «marcar vencida y avisarme» —en el punto, en el
// registro, en el panel de avisos y en el correo de la mañana—. No se da por
// aprobado solo, y el cliente puede seguir contestando (migración 188).
//
// Acá están las reglas, sin base de datos, para poder probarlas.

import { hoyISO, diasEntre, diaCorto } from "./pipeline.js";

const texto = v => String(v ?? "").trim();
const soloDia = f => String(f || "").slice(0, 10);
const MESES_LARGOS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
/** «21 de noviembre», para decírselo al cliente. */
const diaLargo = f => (soloDia(f) ? `${Number(soloDia(f).slice(8, 10))} de ${MESES_LARGOS[Number(soloDia(f).slice(5, 7)) - 1]}` : "");

/** Los plazos de un toque. El cuarto es elegir el día. */
export const PLAZOS = [{ dias: 3, label: "3 días" }, { dias: 7, label: "Una semana" }, { dias: 14, label: "Dos semanas" }];

/**
 * En qué está el plazo de un pedido que espera respuesta.
 * @returns null si no tiene plazo, o { hasta, faltan, vencida, dice, frase }:
 *          `dice` es corto, para la fila —«vence mañana»—; `frase` es la
 *          oración entera —«El plazo vence mañana»—
 */
export function plazoDe(hasta, hoy = hoyISO()) {
  const d = soloDia(hasta);
  if (!d) return null;
  const faltan = diasEntre(hoy, d);
  const n = Math.abs(faltan);
  return {
    hasta: d, faltan, vencida: faltan < 0,
    dice: faltan < 0 ? `venció el ${diaCorto(d)}, hace ${n} ${n === 1 ? "día" : "días"}`
      : faltan === 0 ? "vence hoy" : faltan === 1 ? "vence mañana" : `hasta el ${diaCorto(d)}, faltan ${n} días`,
    frase: faltan < 0 ? `El plazo venció el ${diaCorto(d)}, hace ${n} ${n === 1 ? "día" : "días"}`
      : faltan === 0 ? "El plazo vence hoy" : faltan === 1 ? "El plazo vence mañana" : `Tiene hasta el ${diaCorto(d)}, faltan ${n} días`,
  };
}
const ES_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const correoLimpio = c => texto(c).toLowerCase();

/**
 * El número como lo quiere WhatsApp: solo dígitos, con el código del país.
 *
 * En Ecuador un celular se escribe 0991234567, 099 123 4567 o +593 99 123
 * 4567: todos son el 593991234567. Un número de otro país viene ya con su
 * código y se deja como está. Lo que no parece un celular no se inventa.
 */
export function paraWhatsApp(telefono) {
  let d = texto(telefono).replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 10 && d.startsWith("09")) return `593${d.slice(1)}`;
  if (d.length === 9 && d.startsWith("9")) return `593${d}`;
  return d.length >= 10 ? d : "";
}

/** Lo que se le escribe al cliente para que entre a aprobar. Con el plazo, si lo tiene. */
export function mensajeDelPedido({ nombre = "", proyecto = "", punto = "", enlace = "", hasta = null } = {}) {
  const primero = texto(nombre).split(/\s+/)[0];
  const saludo = primero ? `Hola ${primero.charAt(0).toUpperCase()}${primero.slice(1).toLowerCase()}` : "Hola";
  return `${saludo}, en ${texto(proyecto) || "tu proyecto"} necesitamos tu aprobación de «${texto(punto)}»${soloDia(hasta) ? `, hasta el ${diaLargo(hasta)}` : ""}. `
    + `Lo revisás y lo aprobás acá, sin usuario ni contraseña:\n${texto(enlace)}`;
}

/** El enlace que abre WhatsApp con el mensaje ya escrito, o null si no hay número. */
export function enlaceDeWhatsApp(telefono, mensaje) {
  const n = paraWhatsApp(telefono);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(texto(mensaje))}` : null;
}

/**
 * A quién se le puede avisar: la gente de afuera del proyecto que tiene un
 * correo o un WhatsApp. El cliente primero, que es a quien se le pide.
 *
 * @param personas  los involucrados del proyecto (armarInvolucrados)
 * @param usuarios  el equipo de FOREMAN, con su correo: esos no son de afuera
 * @returns [{ clave, nombre, rol, email, whatsapp, esCliente }]
 */
export function aQuienAvisar(personas = [], usuarios = []) {
  const delEquipo = new Set((usuarios || []).map(u => correoLimpio(u?.email)).filter(Boolean));
  return (personas || [])
    .map(p => {
      const email = ES_CORREO.test(correoLimpio(p?.email)) ? correoLimpio(p.email) : "";
      const rol = [p?.empresa, p?.cargo].map(texto).filter(Boolean).join(" · ");
      return { clave: p?.clave, nombre: texto(p?.nombre) || email, rol, email, whatsapp: paraWhatsApp(p?.telefono), esCliente: /cliente|propietari|dueñ/i.test(rol) };
    })
    .filter(p => p.clave && (p.email || p.whatsapp) && !(p.email && delEquipo.has(p.email)))
    .sort((a, b) => Number(b.esCliente) - Number(a.esCliente) || a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));
}

/** Los id de archivos de un pedido, limpios: números, sin repetir. [] si no dice cuáles. */
export const idsDeArchivos = lista => [...new Set((Array.isArray(lista) ? lista : []).map(Number).filter(n => Number.isFinite(n) && n > 0))];

/**
 * La fila con que un pedido entra al registro. Con su fecha límite, si se le
 * puso, y con QUÉ ARCHIVOS se le piden aprobar (migración 191), si no son
 * todos los del punto.
 * @param archivos  los id de los archivos que se piden; nada es «todo el punto»
 */
export function filaDelPedido({ item, descripcion = "", quien = null, hasta = null, archivos = null } = {}) {
  const pide = idsDeArchivos(archivos);
  return {
    lead_id: item.lead_id, task_id: item.id, titulo: texto(item.texto), descripcion: texto(descripcion) || null,
    pedida_por: quien?.id ?? null, pedida_nombre: quien?.name || null,
    ...(soloDia(hasta) ? { vence_el: soloDia(hasta) } : {}),
    ...(pide.length ? { pide_archivos: pide } : {}),
  };
}

/**
 * De los archivos de un punto, los de un pedido. Si el pedido no dice cuáles
 * —o los que decía ya no están: se borraron o se le ocultaron—, son todos.
 * @returns { archivos, soloAlgunos }
 */
export function archivosDelPedido(archivos = [], pide = null) {
  const todos = Array.isArray(archivos) ? archivos : [];
  const ids = new Set(idsDeArchivos(pide));
  const suyos = ids.size ? todos.filter(a => ids.has(Number(a?.id))) : [];
  return suyos.length && suyos.length < todos.length ? { archivos: suyos, soloAlgunos: true } : { archivos: todos, soloAlgunos: false };
}

/**
 * QUÉ SE LE PIDE APROBAR, al abrir la ventana de un punto que ya tiene
 * historia. Hernán, 19/11/2026: «el anterior ya se aprobó... se sube la
 * cotización, se debe poder pedir que se apruebe específicamente esa».
 *
 * Mira el registro del punto: qué archivos ya aprobó —y cuándo— y cuáles son
 * nuevos. Salen tildados los nuevos; si no hay historia, o no hay nada nuevo,
 * todos. `abierto` son los del pedido que sigue esperando, para avisarle de
 * nuevo diciendo lo mismo.
 *
 * @param archivos  los que el cliente ve en el punto
 * @param filas     las de `aprobaciones_cliente` de ese punto
 * @returns { aprobados: { [id]: fecha }, tildados: [id], abierto: [id] | null }
 */
export function queSePide(archivos = [], filas = []) {
  const suyos = (Array.isArray(archivos) ? archivos : []).filter(a => a && a.id != null);
  const aprobados = {};
  let abierto = null;
  for (const f of Array.isArray(filas) ? filas : []) {
    if (f?.respuesta === "aprobado") {
      for (const a of Array.isArray(f.archivos) ? f.archivos : []) {
        if (a?.id != null && String(aprobados[a.id] || "") < String(f.respuesta_at || "")) aprobados[a.id] = f.respuesta_at || "";
      }
    }
    if (f && !f.respuesta && !f.retirada_at) abierto = idsDeArchivos(f.pide_archivos).length ? idsDeArchivos(f.pide_archivos) : null;
  }
  const nuevos = suyos.filter(a => !(a.id in aprobados)).map(a => Number(a.id));
  return { aprobados, tildados: nuevos.length ? nuevos : suyos.map(a => Number(a.id)), abierto };
}

/**
 * LAS APROBACIONES QUE EL CLIENTE DEJÓ PASAR: se le pidió, tenía fecha límite,
 * el día ya pasó y no contestó. Es lo que avisa el panel del tablero y el
 * correo de la mañana; la misma regla está copiada en api/_avisosDelPipeline.js
 * y pruebas/fechaLimiteDeAprobacion.test.mjs exige que digan lo mismo.
 *
 * No cuenta lo que el cliente ya no ve, lo que se cerró, ni lo de un proyecto
 * perdido: ahí no hay nada que reclamarle.
 *
 * @param tareas  las tareas, con su `lead_id`
 * @returns [{ lead_id, nombre, task_id, titulo, hasta, dias, texto, responsable_id, created_by, assignee_id }]
 *          primero la que lleva más días vencida
 */
export function aprobacionesVencidas({ leads = [], tareas = [], hoy = hoyISO() } = {}) {
  const porId = new Map((leads || []).map(l => [String(l.id), l]));
  return (tareas || [])
    .filter(t => t && t.cliente_aprueba === true && !t.cliente_respuesta && soloDia(t.cliente_aprueba_hasta) && soloDia(t.cliente_aprueba_hasta) < hoy
      && t.visible_cliente !== false && t.status !== "listo" && !t.descartada && t.lead_id != null)
    .map(t => {
      const l = porId.get(String(t.lead_id));
      if (!l || l.resultado === "perdido") return null;
      const hasta = soloDia(t.cliente_aprueba_hasta), dias = diasEntre(hasta, hoy);
      return {
        lead_id: l.id, nombre: l.nombre, task_id: t.id, titulo: texto(t.title), hasta, dias,
        texto: `«${texto(t.title)}» venció el ${diaCorto(hasta)}, hace ${dias} ${dias === 1 ? "día" : "días"}`,
        responsable_id: l.responsable_id ?? null, created_by: l.created_by ?? null, assignee_id: t.assignee_id ?? null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.dias - a.dias || String(a.nombre).localeCompare(String(b.nombre)) || Number(a.task_id) - Number(b.task_id));
}

/** ¿Esta aprobación vencida es de esta persona? El Director ve las de toda la oficina. */
export const esMiAprobacion = (a, usuarioId, veTodo = false) =>
  veTodo || [a.responsable_id, a.created_by, a.assignee_id].some(id => id != null && String(id) === String(usuarioId));

// ── EL REGISTRO ────────────────────────────────────────────────────────────

const ESTADOS = {
  aprobado: { dice: "Aprobado", tono: "success" },
  observado: { dice: "Con observaciones", tono: "danger" },
  pendiente: { dice: "Esperando respuesta", tono: "warning" },
  vencido: { dice: "Vencida · sin respuesta", tono: "danger" },
  retirado: { dice: "Pedido retirado", tono: "muted" },
};
/** Cómo se dice el estado de un pedido. El que espera con el plazo pasado, vencido. */
export const estadoDelPedido = (estado, vencida = false) => (estado === "pendiente" && vencida ? ESTADOS.vencido : ESTADOS[estado] || ESTADOS.pendiente);

/**
 * La colección de aprobaciones de un proyecto, lista para leer.
 *
 * Cada pedido lleva su número —el orden en que se pidió, que no cambia— y se
 * lee con lo más nuevo arriba. `vigente` dice si es el último pedido de su
 * punto: cuando a un punto se le pidió dos veces, el anterior queda como
 * historia y el que vale es el último.
 *
 * @param filas    las de `aprobaciones_cliente` del proyecto
 * @param archivosDeAhora  { [task_id]: [filas de proyecto_archivos] } lo que
 *                 hoy tiene para mirar un pedido que todavía no contestó
 * @param hoy      contra qué día se mira si un plazo ya venció
 * @param estados  qué pasó con cada WhatsApp que salió por este proyecto
 *                 ([{ wa_id, estado, estado_at, error }], del servidor): en el
 *                 registro queda a quién se le escribió, y esto dice si llegó
 * @returns [{ id, numero, task_id, titulo, descripcion, estado, pedida_at,
 *            pedida_nombre, avisos, respuesta_at, nota, archivos, vigente,
 *            vence_el, vencida }]
 */
export function registroDeAprobaciones(filas = [], archivosDeAhora = {}, hoy = hoyISO(), estados = []) {
  const queLePaso = new Map((Array.isArray(estados) ? estados : []).filter(e => e?.wa_id).map(e => [e.wa_id, e]));
  // Un aviso, como se guardó: a qué correos y, si salió por WhatsApp, a quién y si llegó.
  const unAviso = a => {
    const whatsapps = [].concat(a?.whatsapps || []).filter(w => w && (w.telefono || w.nombre)).map(w => {
      const e = queLePaso.get(w.wa_id) || {};
      return { nombre: texto(w.nombre), telefono: texto(w.telefono), estado: e.estado || "enviado", estado_at: e.estado_at || null, error: texto(e.error) };
    });
    return { correos: [].concat(a?.correos || []).map(texto).filter(Boolean), cuando: a?.cuando || null, quien: texto(a?.quien), ...(whatsapps.length ? { whatsapps } : {}) };
  };
  const enOrden = (Array.isArray(filas) ? filas : []).filter(f => f && f.id != null)
    .sort((a, b) => String(a.pedida_at || "").localeCompare(String(b.pedida_at || "")) || Number(a.id) - Number(b.id));
  const ultimoDe = new Map();
  enOrden.forEach(f => { if (f.task_id != null) ultimoDe.set(f.task_id, f.id); });
  return enOrden.map((f, i) => {
    const estado = ["aprobado", "observado"].includes(f.respuesta) ? f.respuesta : f.retirada_at ? "retirado" : "pendiente";
    const copiados = Array.isArray(f.archivos) ? f.archivos : [];
    // Contestado: lo que tenía al contestar. Esperando: lo que tiene hoy.
    // Y si el pedido es de algunos archivos (migración 191), esos.
    const archivos = estado === "pendiente"
      ? archivosDelPedido(archivosDeAhora[f.task_id] || [], f.pide_archivos).archivos.map(a => ({ id: a.id, nombre: texto(a.nombre) || "Archivo", storage_path: a.storage_path, subido_at: a.created_at || null }))
      : copiados.map(a => ({ id: a?.id ?? null, nombre: texto(a?.nombre) || "Archivo", storage_path: a?.storage_path || null, subido_at: a?.subido_at || null }));
    return {
      id: f.id, numero: i + 1, task_id: f.task_id ?? null, titulo: texto(f.titulo), descripcion: texto(f.descripcion),
      estado, pedida_at: f.pedida_at || null, pedida_nombre: texto(f.pedida_nombre),
      avisos: (Array.isArray(f.avisos) ? f.avisos : []).map(unAviso),
      respuesta_at: estado === "retirado" ? f.retirada_at : f.respuesta_at || null,
      nota: texto(f.respuesta_nota), archivos,
      // Se le pidió aprobar esos archivos y no todo el punto.
      soloAlgunos: estado === "pendiente" ? archivosDelPedido(archivosDeAhora[f.task_id] || [], f.pide_archivos).soloAlgunos : idsDeArchivos(f.pide_archivos).length > 0,
      vigente: f.task_id == null || ultimoDe.get(f.task_id) === f.id,
      // Si lo que se le pidió aprobar es un presupuesto compartido (migración 196): cuál. Lo que tenía a la vista es su foto.
      ...(f.presupuesto_compartido_id != null ? { presupuesto_compartido_id: f.presupuesto_compartido_id } : {}),
      // El plazo que se le dio en ESE pedido, y si se le pasó sin contestar.
      vence_el: soloDia(f.vence_el) || null,
      vencida: estado === "pendiente" && !!soloDia(f.vence_el) && soloDia(f.vence_el) < hoy,
    };
  }).reverse();
}

// Qué pasó con un WhatsApp, como lo avisa Meta.
export const ESTADOS_DE_WHATSAPP = {
  enviado: { dice: "enviado", tono: "muted" },
  entregado: { dice: "entregado", tono: "success" },
  leido: { dice: "leído", tono: "success" },
  fallo: { dice: "no llegó", tono: "danger" },
};
/** «Xavier (leído)», o «Xavier (no llegó: ese número no tiene WhatsApp)». */
export function whatsappDice(w) {
  const e = ESTADOS_DE_WHATSAPP[w?.estado] || ESTADOS_DE_WHATSAPP.enviado;
  return `${texto(w?.nombre) || texto(w?.telefono)} (${e.dice}${w?.estado === "fallo" && w?.error ? `: ${w.error}` : ""})`;
}
/** Un aviso en una línea: «Avisado a x@y y por WhatsApp a Xavier (leído)». */
export function avisoDice(a) {
  const correos = a?.correos?.length ? `a ${a.correos.join(", ")}` : "";
  const wa = a?.whatsapps?.length ? `por WhatsApp a ${a.whatsapps.map(whatsappDice).join(", ")}` : "";
  return ["Avisado", correos, correos && wa ? "y" : "", wa].filter(Boolean).join(" ");
}

/** Cuántas hay de cada una: es lo primero que se pregunta de una colección. */
export function resumenDelRegistro(registro = []) {
  const cuenta = e => registro.filter(r => r.estado === e).length;
  return {
    total: registro.length, aprobadas: cuenta("aprobado"), observadas: cuenta("observado"), pendientes: cuenta("pendiente"), retiradas: cuenta("retirado"),
    vencidas: registro.filter(r => r.vencida).length,
  };
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** "17 nov 2026, 21:23", en la hora de quien lo lee. */
export function momento(f) {
  if (!f) return "";
  const d = new Date(f);
  if (Number.isNaN(d.getTime())) return "";
  const dos = n => String(n).padStart(2, "0");
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}, ${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

/**
 * El registro, como documento: lo que recibe el armador de PDF de FOREMAN.
 * En orden de pedido —del primero al último—, que es como se lee un sustento.
 */
export function registroParaPdf(registro = [], { proyecto = "" } = {}) {
  const r = resumenDelRegistro(registro);
  const enOrden = [...registro].sort((a, b) => a.numero - b.numero);
  return {
    titulo: "Registro de aprobaciones del cliente",
    subtitulo: proyecto,
    nombreArchivo: `Aprobaciones del cliente - ${proyecto}`,
    pie: { elemento: "Registro de aprobaciones del cliente", proyecto },
    resumen: [
      { label: "Pedidas", valor: r.total },
      { label: "Aprobadas", valor: r.aprobadas },
      { label: "Con observaciones", valor: r.observadas },
      { label: "Esperando respuesta", valor: r.pendientes },
    ],
    bloques: [{
      columnas: ["N°", "Qué se le pidió aprobar", "Archivos", "Pedida", "Respuesta", "Lo que escribió"],
      filas: enOrden.map(p => [
        String(p.numero),
        p.titulo + (p.descripcion ? `\n${p.descripcion}` : ""),
        p.presupuesto_compartido_id != null ? "El presupuesto y su comparativa, como se le compartieron"
          : p.archivos.length ? p.archivos.map(a => a.nombre).join("\n") : "Sin archivos",
        [momento(p.pedida_at), p.pedida_nombre ? `por ${p.pedida_nombre}` : "",
          p.vence_el ? `Plazo: hasta el ${diaCorto(p.vence_el)} ${p.vence_el.slice(0, 4)}` : "",
          ...p.avisos.map(a => `${avisoDice(a)} · ${momento(a.cuando)}`)].filter(Boolean).join("\n"),
        estadoDelPedido(p.estado, p.vencida).dice + (p.respuesta_at ? `\n${momento(p.respuesta_at)}` : ""),
        p.nota,
      ]),
      anchos: { 0: { cellWidth: 26 }, 1: { cellWidth: 190 }, 2: { cellWidth: 150 }, 3: { cellWidth: 130 }, 4: { cellWidth: 100 } },
      nota: "Las respuestas las dio el cliente desde su enlace del proyecto. «Archivos» es lo que tenía para mirar en ese punto al momento de contestar.",
    }],
  };
}
