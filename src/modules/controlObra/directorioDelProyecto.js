// LA GENTE DEL PROYECTO, armada de todos los lugares donde ya está escrita.
//
// La misma persona está cargada como convocada del acta, como invitada del
// pipeline, como asistente de las actas que ya se hicieron, como firmante de
// las órdenes anteriores y como alguien a quien se le mandó el libro de obra.
// Son cinco tablas por historia, no por decisión. Acá se juntan en una sola
// lista, por correo, sin base de datos: la consulta vive en ordenesDeCambio.js.
//
// EL LIBRO ENTRÓ EL 16/11/2026. Hernán: «agrego un nuevo recipient de correo
// al enviar el libro de obra... esa nueva persona debería poder ser nueva en
// el listado de correos». La dirección que se escribía a mano al mandar el
// libro quedaba solo en la entrega: la vez siguiente había que escribirla de
// nuevo, y para las órdenes y el plan esa persona no existía.

const ES_CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

export const correoLimpio = email => String(email || "").trim().toLowerCase();
export const esCorreo = email => ES_CORREO.test(correoLimpio(email));

/**
 * @param convocados  filas de obra_convocados: «los de siempre», entran solos en cada acta
 * @param invitados   filas de pipeline_invitados
 * @param asistentes  filas de acta_asistentes de las actas del proyecto
 * @param firmantes   filas de orden_cambio_aprobaciones de sus órdenes
 * @param delLibro    filas de libro_envios: a quién se le mandó el libro
 * @returns [{ nombre, empresa, rol, email, id?, deSiempre?, recibe_ordenes?, deActas?, deOrdenes?, deLibro? }]
 */
export function armarDirectorio({ convocados = [], invitados = [], asistentes = [], firmantes = [], delLibro = [] } = {}) {
  const por = new Map();
  const poner = (nombre, empresa, rol, email, extra = {}) => {
    const limpio = correoLimpio(email);
    if (!ES_CORREO.test(limpio)) return;
    const ya = por.get(limpio);
    if (!ya) { por.set(limpio, { nombre: nombre || "", empresa: empresa || "", rol: rol || "", email: limpio, ...extra }); return; }
    // Gana el dato que existe sobre el vacío, y el nombre más completo: el
    // firmante de una orden suele estar cargado como "Diners" y el convocado
    // del acta con nombre, empresa y cargo.
    if (String(nombre || "").length > String(ya.nombre || "").length) ya.nombre = nombre;
    if (!ya.empresa && empresa) ya.empresa = empresa;
    if (!ya.rol && rol) ya.rol = rol;
    Object.assign(ya, { ...extra, ...(ya.deSiempre ? { deSiempre: true } : {}) });
  };

  // `deSiempre` marca a los convocados, que es otra cosa: esos entran solos en
  // cada acta nueva. Un proveedor que vino una vez a una reunión queda en el
  // directorio —para no volver a tipearlo— pero no se cuela en todas las actas
  // del año. Lo mismo el abogado al que se le mandó un tramo del libro.
  for (const c of convocados || []) poner(c.nombre, c.empresa, c.cargo, c.email, { id: `c${c.id}`, deSiempre: true });
  for (const i of invitados || []) poner(i.nombre, "", i.rol, i.email, { id: `i${i.id}`, recibe_ordenes: i.recibe_ordenes });
  for (const a of asistentes || []) poner(a.nombre, a.empresa, a.cargo, a.email, { deActas: true });
  for (const f of firmantes || []) poner(f.nombre, f.empresa, f.rol, f.email, { deOrdenes: true });
  for (const l of delLibro || []) poner(l.nombre, "", "", l.email, { deLibro: true });
  return [...por.values()];
}

/** De dónde salió esta persona, dicho para quien elige. */
export const deDondeSale = g => (g?.deSiempre ? "los de siempre"
  : g?.deOrdenes ? "órdenes anteriores"
  : g?.deActas ? "actas de este proyecto"
  : g?.deLibro ? "el libro de obra"
  : "el proyecto");

/**
 * Lo que se pide para sumar a alguien a mano: nombre y un correo que sirva.
 * @returns { fila } lista para guardar en «los de siempre», o { error }
 */
export function personaParaSumar({ nombre, empresa, email } = {}, leadId, cuantosHay = 0) {
  const quien = String(nombre || "").trim();
  const correo = correoLimpio(email);
  if (!quien) return { error: "Falta el nombre." };
  if (!ES_CORREO.test(correo)) return { error: "Ese correo no está bien escrito." };
  return { fila: { lead_id: leadId, nombre: quien, empresa: String(empresa || "").trim() || null, email: correo, activo: true, orden: cuantosHay } };
}
