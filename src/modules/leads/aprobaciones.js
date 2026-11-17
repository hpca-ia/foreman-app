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
// Acá están las reglas, sin base de datos, para poder probarlas.

const texto = v => String(v ?? "").trim();
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

/** Lo que se le escribe al cliente para que entre a aprobar. */
export function mensajeDelPedido({ nombre = "", proyecto = "", punto = "", enlace = "" } = {}) {
  const primero = texto(nombre).split(/\s+/)[0];
  const saludo = primero ? `Hola ${primero.charAt(0).toUpperCase()}${primero.slice(1).toLowerCase()}` : "Hola";
  return `${saludo}, en ${texto(proyecto) || "tu proyecto"} necesitamos tu aprobación de «${texto(punto)}». `
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

/** La fila con que un pedido entra al registro. */
export function filaDelPedido({ item, descripcion = "", quien = null } = {}) {
  return {
    lead_id: item.lead_id, task_id: item.id, titulo: texto(item.texto), descripcion: texto(descripcion) || null,
    pedida_por: quien?.id ?? null, pedida_nombre: quien?.name || null,
  };
}

// ── EL REGISTRO ────────────────────────────────────────────────────────────

const ESTADOS = {
  aprobado: { dice: "Aprobado", tono: "success" },
  observado: { dice: "Con observaciones", tono: "danger" },
  pendiente: { dice: "Esperando respuesta", tono: "warning" },
  retirado: { dice: "Pedido retirado", tono: "muted" },
};
export const estadoDelPedido = estado => ESTADOS[estado] || ESTADOS.pendiente;

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
 * @returns [{ id, numero, task_id, titulo, descripcion, estado, pedida_at,
 *            pedida_nombre, avisos, respuesta_at, nota, archivos, vigente }]
 */
export function registroDeAprobaciones(filas = [], archivosDeAhora = {}) {
  const enOrden = (Array.isArray(filas) ? filas : []).filter(f => f && f.id != null)
    .sort((a, b) => String(a.pedida_at || "").localeCompare(String(b.pedida_at || "")) || Number(a.id) - Number(b.id));
  const ultimoDe = new Map();
  enOrden.forEach(f => { if (f.task_id != null) ultimoDe.set(f.task_id, f.id); });
  return enOrden.map((f, i) => {
    const estado = ["aprobado", "observado"].includes(f.respuesta) ? f.respuesta : f.retirada_at ? "retirado" : "pendiente";
    const copiados = Array.isArray(f.archivos) ? f.archivos : [];
    // Contestado: lo que tenía al contestar. Esperando: lo que tiene hoy.
    const archivos = estado === "pendiente"
      ? (archivosDeAhora[f.task_id] || []).map(a => ({ id: a.id, nombre: texto(a.nombre) || "Archivo", storage_path: a.storage_path, subido_at: a.created_at || null }))
      : copiados.map(a => ({ id: a?.id ?? null, nombre: texto(a?.nombre) || "Archivo", storage_path: a?.storage_path || null, subido_at: a?.subido_at || null }));
    return {
      id: f.id, numero: i + 1, task_id: f.task_id ?? null, titulo: texto(f.titulo), descripcion: texto(f.descripcion),
      estado, pedida_at: f.pedida_at || null, pedida_nombre: texto(f.pedida_nombre),
      avisos: (Array.isArray(f.avisos) ? f.avisos : []).map(a => ({ correos: [].concat(a?.correos || []).map(texto).filter(Boolean), cuando: a?.cuando || null, quien: texto(a?.quien) })),
      respuesta_at: estado === "retirado" ? f.retirada_at : f.respuesta_at || null,
      nota: texto(f.respuesta_nota), archivos,
      vigente: f.task_id == null || ultimoDe.get(f.task_id) === f.id,
    };
  }).reverse();
}

/** Cuántas hay de cada una: es lo primero que se pregunta de una colección. */
export function resumenDelRegistro(registro = []) {
  const cuenta = e => registro.filter(r => r.estado === e).length;
  return { total: registro.length, aprobadas: cuenta("aprobado"), observadas: cuenta("observado"), pendientes: cuenta("pendiente"), retiradas: cuenta("retirado") };
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
        p.archivos.length ? p.archivos.map(a => a.nombre).join("\n") : "Sin archivos",
        [momento(p.pedida_at), p.pedida_nombre ? `por ${p.pedida_nombre}` : "",
          ...p.avisos.map(a => `Avisado a ${a.correos.join(", ")} · ${momento(a.cuando)}`)].filter(Boolean).join("\n"),
        estadoDelPedido(p.estado).dice + (p.respuesta_at ? `\n${momento(p.respuesta_at)}` : ""),
        p.nota,
      ]),
      anchos: { 0: { cellWidth: 26 }, 1: { cellWidth: 190 }, 2: { cellWidth: 150 }, 3: { cellWidth: 130 }, 4: { cellWidth: 100 } },
      nota: "Las respuestas las dio el cliente desde su enlace del proyecto. «Archivos» es lo que tenía para mirar en ese punto al momento de contestar.",
    }],
  };
}
