// EL PIPELINE COMO TABLERO, Y CADA PROYECTO CON SUS ACTIVIDADES EN COLUMNAS.
//
// Hernán, 27/11/2026: «Para mi criterio el pipeline sigue igual... debe ser
// más interactivo, más visual». Era una lista de renglones con un desplegable
// de etapa en cada uno. Entre cuatro maquetas eligió «la 1»: cada proyecto es
// una tarjeta en la columna de su etapa —una franja por tipo— y se arrastra a
// otra; adentro, las etapas se ven como un camino y las actividades en tres
// columnas que también se arrastran: En curso, En espera, Hechas.
//
// Y dos cosas que él mismo marcó sobre esa maqueta: «Banderas tiene
// actividades en presupuesto, otras en ingenierías... el tablero lo ubica solo
// en presupuesto sin eso ser real» (la tarjeta dice dónde más tiene algo
// abierto, y en el camino toda etapa con algo abierto está en curso), y que
// las cosas «pueden ir y regresar» (una actividad se suelta sobre cualquier
// etapa, para adelante o para atrás).
//
// Acá no se lee ni se escribe la base: se decide qué pasa. La pantalla guarda
// con las funciones de siempre (pipeline.js, proyecto.js).

import { estadoDelLead, enEspera, etapasDelTipo, tipoDe, alCambiarEtapa } from "./pipeline.js";

const esDeCompras = t => !!t?.compra_id || t?.type === "Compra";
const abierta = t => t?.status !== "listo" && !t?.descartada;

// ─── LA TARJETA DEL PROYECTO ────────────────────────────────────────────────

/** Los cuatro estados que se ven en la tarjeta, cada uno con su color. */
export const ESTADOS_DE_TARJETA = {
  curso:    { label: "En curso",     icono: "●", color: "#0F3D3E", fondo: "#E7F1EF" },
  espera:   { label: "En espera",    icono: "⏸", color: "#6B7280", fondo: "#F1F1EE" },
  revisar:  { label: "Toca revisar", icono: "⏰", color: "#B45309", fondo: "#FDF3E7" },
  atrasado: { label: "Atrasado",     icono: "▲", color: "#B91C1C", fondo: "#FBEAEA" },
};

/** En cuál de los cuatro está, según su estado del pipeline. */
export function estadoDeTarjeta(estado) {
  if (estado?.clase === "insistir") return "revisar";
  if (enEspera(estado)) return "espera";
  if (estado?.clase === "vencido") return "atrasado";
  return "curso";
}

/** Cuántos hay en cada uno: arriba del tablero, y sirven de filtro. */
export function cuentasDelTablero(leads = [], tareasDe = () => [], hoy) {
  const n = { curso: 0, espera: 0, revisar: 0, atrasado: 0 };
  for (const l of leads) {
    const k = estadoDeTarjeta(estadoDelLead(l, tareasDe(l.id), hoy));
    n[k] += 1;
    // Toca revisar también está en espera: el filtro «en espera» lo incluye.
    if (k === "revisar") n.espera += 1;
  }
  return n;
}

/** ¿La tarjeta entra en el filtro elegido? «En espera» incluye las que toca revisar. */
export const pasaElFiltro = (k, filtro) => !filtro || k === filtro || (filtro === "espera" && k === "revisar");

/**
 * DÓNDE MÁS TIENE ALGO ABIERTO. La tarjeta está en la columna de la etapa del
 * proyecto; esto dice las otras etapas con actividades abiertas, con cuántas.
 * @returns [{ id, nombre, abiertas }] en el orden de las etapas del tipo
 */
export function tambienEnCurso(lead, tareas = [], catalogo = []) {
  const cuenta = new Map();
  for (const t of tareas) {
    if (!abierta(t) || esDeCompras(t) || !t.etapa_id || t.etapa_id === lead?.etapa) continue;
    cuenta.set(t.etapa_id, (cuenta.get(t.etapa_id) || 0) + 1);
  }
  const etapas = etapasDelTipo(catalogo, tipoDe(lead));
  const orden = id => { const i = etapas.findIndex(e => e.id === id); return i < 0 ? 999 : i; };
  return [...cuenta.entries()]
    .map(([id, n]) => ({ id, nombre: catalogo.find(e => e.id === id)?.nombre || "otra etapa", abiertas: n }))
    .sort((a, b) => orden(a.id) - orden(b.id));
}

/**
 * Las columnas de un tipo: sus etapas, en orden. Si alguno de sus proyectos
 * está en una etapa que no es de su tipo (o en ninguna), una columna «Sin
 * etapa» adelante: así no se pierde de vista.
 */
export function columnasDelTipo(tipo, leads = [], catalogo = []) {
  const etapas = etapasDelTipo(catalogo, tipo).map(e => ({ id: e.id, nombre: e.nombre }));
  const sueltos = leads.some(l => !etapas.some(e => e.id === l.etapa));
  return sueltos ? [{ id: null, nombre: "Sin etapa" }, ...etapas] : etapas;
}

/** En qué columna va un proyecto. */
export const columnaDelLead = (lead, columnas) => (columnas.some(c => c.id && c.id === lead.etapa) ? lead.etapa : null);

/**
 * SOLTAR UNA TARJETA. El destino es «etapa:<tipo>:<id>» o «cierre:ganado» /
 * «cierre:perdido».
 * @returns null (no cambia nada) · { cambio } (otra etapa) · { cerrar }
 *          (aprobado o perdido: eso se confirma antes) · { error }
 */
export function alSoltarLead(lead, destino, catalogo = []) {
  if (!lead || !destino) return null;
  if (destino === "cierre:ganado") return { cerrar: "ganado" };
  if (destino === "cierre:perdido") return { cerrar: "perdido" };
  const [que, tipo, id] = String(destino).split(":");
  if (que !== "etapa" || !id) return null;
  if (tipo !== String(tipoDe(lead))) return { error: "Esa columna es de otro tipo de proyecto: el tipo se cambia en su ficha." };
  if (id === lead.etapa) return null;
  const cambio = alCambiarEtapa(lead, id, catalogo);
  return cambio ? { cambio } : null;
}

// ─── LAS ACTIVIDADES DE UN PROYECTO, EN TRES COLUMNAS ──────────────────────

export const COLUMNAS_DE_ACTIVIDAD = [
  { id: "curso", nombre: "En curso", ayuda: "lo que se está moviendo" },
  { id: "espera", nombre: "En espera", ayuda: "se hizo lo que tocaba" },
  { id: "hechas", nombre: "Hechas", ayuda: "ya no hay más que hacer" },
];

/** En qué columna va una actividad (como la dibuja la lista: comoActividad). */
export const columnaDeActividad = item => (item?.hecho ? "hechas" : item?.espera ? "espera" : "curso");

/**
 * SOLTAR UNA ACTIVIDAD. El destino es «col:curso» · «col:espera» · «col:hechas»
 * o «etapa:<id>» (sobre una etapa del camino: pasa a esa etapa, para adelante
 * o para atrás).
 * @returns la lista de cosas que hay que hacer, en orden:
 *          { marcar: true|false } · { espera: true|false } · { etapa: id }
 */
export function alSoltarActividad(item, destino) {
  if (!item || !destino) return [];
  const [que, id] = String(destino).split(":");
  if (que === "etapa") return id && id !== (item.etapa_id || "") ? [{ etapa: id }] : [];
  if (que !== "col") return [];
  const desde = columnaDeActividad(item);
  if (id === desde) return [];
  // Terminar o volver a abrir ya le saca la espera (alMarcar).
  if (id === "hechas") return [{ marcar: true }];
  if (id === "curso") return desde === "hechas" ? [{ marcar: false }] : [{ espera: false }];
  if (id === "espera") return desde === "hechas" ? [{ marcar: false }, { espera: true }] : [{ espera: true }];
  return [];
}

/** Lo que se dice después de soltar una actividad. */
export function loQuePaso(item, destino, nombreDeEtapa = () => "") {
  const [que, id] = String(destino).split(":");
  const t = `«${item?.texto || ""}»`;
  if (que === "etapa") return `${t} pasó a ${nombreDeEtapa(id) || "otra etapa"}.`;
  if (id === "hechas") return `${t} terminada.`;
  if (id === "espera") return `${t} queda en espera.`;
  return `${t} vuelve a estar en curso.`;
}

/** Cómo queda la actividad después de soltarla: para poder deshacerlo. */
export function despuesDeSoltar(item, pasos = []) {
  const x = { ...item };
  for (const p of pasos) {
    if (p.etapa !== undefined) x.etapa_id = p.etapa;
    if (p.marcar !== undefined) { x.hecho = p.marcar; x.espera = false; }
    if (p.espera !== undefined) x.espera = p.espera;
  }
  return x;
}

/** Adónde soltarla para que vuelva a como estaba. */
export const lugarDeAntes = (item, lugar) =>
  (String(lugar).startsWith("etapa:") ? (item?.etapa_id ? `etapa:${item.etapa_id}` : null) : `col:${columnaDeActividad(item)}`);
