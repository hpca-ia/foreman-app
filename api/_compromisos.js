// LOS COMPROMISOS DE LAS ACTAS, del lado del servidor.
//
// Es la misma regla que src/modules/actas/compromisos.js, copiada acá porque
// el correo de la mañana y el visto que se da por enlace corren en el servidor.
// pruebas/compromisos.test.mjs les da las mismas entradas y exige la misma
// salida: si se toca una, se toca la otra.
//
// Lo que no hay que olvidar: un compromiso que se arrastra de reunión en
// reunión es UNO, y el que vale es el de la última acta de su cadena.

const dia = f => String(f || "").slice(0, 10);

export const abierto = c => c?.estado === "pendiente" || c?.estado === "reprogramado";
const raiz = c => c.viene_de || c.id;

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

export const vencidos = (compromisos = [], actas = [], hoy) =>
  vivos(compromisos, actas).filter(abierto).filter(c => dia(c.fecha_limite) && dia(c.fecha_limite) < hoy);

const quienLoSigue = c => (c?.asignado_a ? "equipo" : c?.tercero ? "tercero" : null);

export const paraTarea = (compromisos = []) => compromisos.filter(c => quienLoSigue(c) && !c.tarea_id && abierto(c));

export function tareaDelCompromiso({ c, acta, lead = null, quien = null }) {
  const sigue = quienLoSigue(c);
  if (!sigue) return null;
  const base = {
    title: String(c.texto || "").slice(0, 200),
    lead_id: lead?.id ?? acta?.lead_id ?? null,
    type: "Gestión", due_date: c.fecha_limite || null,
    priority: "media", status: "en-progreso",
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
