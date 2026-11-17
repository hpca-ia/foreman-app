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
 * @param ocultos     filas de proyecto_gente_oculta: a quién se quitó de las listas
 * @returns [{ nombre, empresa, rol, email, id?, deSiempre?, recibe_ordenes?, deActas?, deOrdenes?, deLibro? }]
 */
export function armarDirectorio({ convocados = [], invitados = [], asistentes = [], firmantes = [], delLibro = [], ocultos = [] } = {}) {
  const por = new Map();
  // LO CARGADO A MANO MANDA SOBRE LO QUE QUEDÓ EN UN DOCUMENTO. El nombre de
  // los de siempre y de la ficha es el que alguien escribió —y puede corregir
  // desde la ficha del proyecto—; el de un acta o una orden vieja es el de ese
  // día. Antes ganaba siempre el más largo: corregir «Sebastián Palomeque M.»
  // a «Sebastián Palomeque» no se veía nunca.
  //
  // De dónde salió el nombre que se muestra: 2 los de siempre, 1 la ficha,
  // 0 un documento. Uno de más arriba pisa al de abajo; entre dos del mismo
  // lugar gana el más completo —en el Aeropuerto la misma residente estaba en
  // los de siempre tres veces, una como «Lizeth» y dos con nombre y apellido—.
  const nivel = new Map();
  const poner = (nombre, empresa, rol, email, extra = {}, peso = 0) => {
    const limpio = correoLimpio(email);
    if (!ES_CORREO.test(limpio)) return;
    const dicho = !!String(nombre || "").trim();
    const ya = por.get(limpio);
    if (!ya) {
      por.set(limpio, { nombre: nombre || "", empresa: empresa || "", rol: rol || "", email: limpio, ...extra });
      nivel.set(limpio, dicho ? peso : -1);
      return;
    }
    const suyo = nivel.get(limpio);
    if (dicho && (peso > suyo || (peso === suyo && String(nombre).length > String(ya.nombre || "").length))) {
      ya.nombre = nombre; nivel.set(limpio, peso);
    }
    // Del resto gana el dato que existe sobre el vacío: el firmante de una
    // orden suele estar cargado como "Diners" y el asistente del acta con
    // nombre, empresa y cargo.
    if (!ya.empresa && empresa) ya.empresa = empresa;
    if (!ya.rol && rol) ya.rol = rol;
    Object.assign(ya, { ...extra, ...(ya.deSiempre ? { deSiempre: true } : {}) });
  };

  // `deSiempre` marca a los convocados, que es otra cosa: esos entran solos en
  // cada acta nueva. Un proveedor que vino una vez a una reunión queda en el
  // directorio —para no volver a tipearlo— pero no se cuela en todas las actas
  // del año. Lo mismo el abogado al que se le mandó un tramo del libro.
  for (const c of convocados || []) poner(c.nombre, c.empresa, c.cargo, c.email, { id: `c${c.id}`, deSiempre: true }, 2);
  for (const i of invitados || []) poner(i.nombre, "", i.rol, i.email, { id: `i${i.id}`, recibe_ordenes: i.recibe_ordenes }, 1);
  for (const a of asistentes || []) poner(a.nombre, a.empresa, a.cargo, a.email, { deActas: true });
  for (const f of firmantes || []) poner(f.nombre, f.empresa, f.rol, f.email, { deOrdenes: true });
  for (const l of delLibro || []) poner(l.nombre, "", "", l.email, { deLibro: true });
  // Los que se quitaron de las listas no se ofrecen más, aunque sigan
  // figurando en un documento.
  const quitados = correosQuitados({ convocados, invitados, ocultos });
  return [...por.values()].filter(g => !quitados.has(g.email));
}

// ── QUITAR A ALGUIEN DE LAS LISTAS ─────────────────────────────────────────
//
// De un acta, una orden o un libro ya enviados no se borra a nadie: son
// documentos. Pero la dirección mal escrita a la que se le mandó un libro, o
// quien ya no está en la obra, no tiene por qué seguir ofreciéndose en cada
// envío. Los quitados se anotan aparte (migración 183) y acá se los saca de
// las listas. Hernán, 16/11/2026: «haz la migración».

/**
 * Los correos quitados de las listas. MANDA LO CARGADO A MANO: si a alguien
 * que se había quitado se lo vuelve a cargar en los de siempre o en la ficha,
 * aparece de nuevo aunque siga anotado como quitado.
 */
export function correosQuitados({ convocados = [], invitados = [], ocultos = [] } = {}) {
  const cargados = new Set([...(convocados || []), ...(invitados || [])].map(x => correoLimpio(x.email)).filter(Boolean));
  return new Set((ocultos || []).map(o => correoLimpio(o.email)).filter(e => e && !cargados.has(e)));
}

/**
 * Los que están quitados, con el nombre que se les conozca, para poder
 * volver a ponerlos.
 * @returns [{ email, nombre, figura: ["actas", ...] }] por nombre
 */
export function quitadosDe(fuentes = {}) {
  const quitados = correosQuitados(fuentes);
  const conocidos = new Map(armarDirectorio({ ...fuentes, ocultos: [] }).map(g => [g.email, g]));
  const vistos = new Set();
  const lista = [];
  for (const o of fuentes.ocultos || []) {
    const email = correoLimpio(o.email);
    if (!quitados.has(email) || vistos.has(email)) continue;
    vistos.add(email);
    const g = conocidos.get(email);
    lista.push({ email, nombre: String(g?.nombre || o.nombre || "").trim(), figura: dondeFigura(g) });
  }
  return lista.sort((a, b) => (a.nombre || a.email).localeCompare(b.nombre || b.email, "es", { sensitivity: "base" }));
}

/**
 * Qué hace falta para quitar a esta persona de las listas: sacarla de lo
 * cargado a mano, anotarla como quitada, o las dos cosas.
 *
 * Solo se anota a quien figura en un documento: al que está cargado a mano y
 * en ningún otro lado le alcanza con sacarlo, porque no queda de dónde volver.
 */
export function alQuitar(p) {
  return {
    deLoCargado: filasDe(p, "convocado").length + filasDe(p, "invitado").length > 0,
    esconder: !!p?.email && figuraEnDocumentos(p),
  };
}

/** Lo que se le pregunta antes de quitarla, dicho con lo que va a pasar. */
export function preguntaAlQuitar(p) {
  const quien = p?.nombre || p?.email || "esta persona";
  const figura = dondeFigura(p);
  return `¿Quitar a ${quien} de este proyecto?\n\nDeja de aparecer en las listas para mandar actas, órdenes, el plan y el libro.`
    + (figura.length ? `\n\nEn ${figura.join(", ")} ya enviados sigue figurando: esos documentos no se tocan. Se la puede volver a poner desde acá.` : "");
}

// ── TODOS LOS INVOLUCRADOS, PARA LA FICHA DEL PROYECTO ─────────────────────
//
// Hernán, 16/11/2026, mirando la pestaña «Gente» de la ficha, que mostraba
// solo al equipo: «ahí deberían aparecer todos los involucrados... no solo
// los que ven el proyecto en el equipo. Cada vez que se agregue alguien se
// actualiza ese cuadro».
//
// Es el mismo directorio, con lo que hace falta para administrarlo: en qué
// fila está cargada cada persona —para corregirla—, de dónde salió, y los que
// no tienen correo, que en el directorio de envíos no entran.

const texto = v => String(v || "").trim();

/**
 * @returns [{ clave, nombre, empresa, cargo, email, telefono, convocadoId,
 *            invitadoId, deSiempre, deFicha, deActas, deOrdenes, deLibro }]
 *          los de siempre primero, en su orden; después el resto por nombre
 */
export function armarInvolucrados(fuentes = {}) {
  // UNA PERSONA PUEDE ESTAR CARGADA VARIAS VECES: en el Aeropuerto tres de
  // los de siempre estaban dos y tres veces, con el mismo correo. Acá sale
  // una sola vez y se guardan todas sus filas, para corregirlas juntas: si se
  // tocara una sola, las otras seguirían diciendo lo de antes.
  const conv = new Map(), inv = new Map(), sueltos = [];
  const sumar = (mapa, e, fila) => { if (!mapa.has(e)) mapa.set(e, []); mapa.get(e).push(fila); };
  const primero = (filas, campo) => texto((filas || []).map(f => f[campo]).find(v => texto(v)));
  for (const c of fuentes.convocados || []) {
    const e = correoLimpio(c.email);
    if (ES_CORREO.test(e)) { sumar(conv, e, c); continue; }
    sueltos.push({ clave: `c${c.id}`, nombre: texto(c.nombre), empresa: texto(c.empresa), cargo: texto(c.cargo), email: "", telefono: "",
      convocadoId: c.id, convocadoIds: [c.id], invitadoId: null, invitadoIds: [],
      deSiempre: true, deFicha: false, deActas: false, deOrdenes: false, deLibro: false });
  }
  for (const i of fuentes.invitados || []) {
    const e = correoLimpio(i.email);
    if (ES_CORREO.test(e)) { sumar(inv, e, i); continue; }
    sueltos.push({ clave: `i${i.id}`, nombre: texto(i.nombre), empresa: "", cargo: texto(i.rol), email: "", telefono: texto(i.telefono),
      convocadoId: null, convocadoIds: [], invitadoId: i.id, invitadoIds: [i.id],
      deSiempre: false, deFicha: true, deActas: false, deOrdenes: false, deLibro: false });
  }
  const conCorreo = armarDirectorio(fuentes).map(g => {
    const cs = conv.get(g.email) || [], is = inv.get(g.email) || [];
    return {
      clave: g.email, nombre: texto(g.nombre),
      // Del que está en los de siempre se muestra lo guardado en sus filas,
      // que es lo que se corrige; del resto, lo mejor que se sepa.
      empresa: cs.length ? primero(cs, "empresa") : texto(g.empresa), cargo: cs.length ? primero(cs, "cargo") : texto(g.rol),
      email: g.email, telefono: primero(is, "telefono"),
      convocadoId: cs[0]?.id ?? null, convocadoIds: cs.map(c => c.id), invitadoId: is[0]?.id ?? null, invitadoIds: is.map(i => i.id),
      deSiempre: cs.length > 0, deFicha: is.length > 0, deActas: !!g.deActas, deOrdenes: !!g.deOrdenes, deLibro: !!g.deLibro,
    };
  });
  const porNombre = (a, b) => (a.nombre || a.email).localeCompare(b.nombre || b.email, "es", { sensitivity: "base" });
  const todos = [...conCorreo, ...sueltos];
  return [...todos.filter(p => p.deSiempre), ...todos.filter(p => !p.deSiempre).sort(porNombre)];
}

/** En qué documentos figura, dicho corto, para la etiqueta de cada persona. */
export function dondeFigura(p) {
  return [p?.deActas && "actas", p?.deOrdenes && "órdenes", p?.deLibro && "libro"].filter(Boolean);
}

/** ¿Figura en algún documento ya hecho? Entonces de la lista no se va. */
export const figuraEnDocumentos = p => dondeFigura(p).length > 0;

/**
 * Qué se escribe al corregir a una persona desde la ficha.
 *
 * La que está en los de siempre se corrige en su fila; la que se cargó en la
 * ficha, en la suya; si está en las dos, en las dos. La que solo figura en un
 * acta, una orden o el libro no tiene fila propia: al ponerle nombre queda
 * cargada en la ficha, con el correo que ya tenía —ese es el del documento, y
 * cambiarlo sería inventar otra persona—.
 *
 * @returns { ops: [{ tabla, id, campos }] } o { error }
 */
export function cambiosAlEditar(p, borrador = {}, leadId) {
  const nombre = texto(borrador.nombre);
  const email = correoLimpio(borrador.email);
  const cargada = !!(p?.convocadoId || p?.invitadoId);
  if (!nombre) return { error: "Falta el nombre." };
  if (email && !ES_CORREO.test(email)) return { error: "Ese correo no está bien escrito." };
  if (!email && p?.email) return { error: "Falta el correo." };
  if (!cargada && email !== p?.email) return { error: "Ese correo viene de un documento ya enviado: no se cambia acá." };
  const o = v => texto(v) || null;
  const ops = [];
  // Todas sus filas, no una: la que está cargada tres veces se corrige tres veces.
  for (const id of filasDe(p, "convocado")) ops.push({ tabla: "obra_convocados", id, campos: { nombre, empresa: o(borrador.empresa), cargo: o(borrador.cargo), email: email || null } });
  for (const id of filasDe(p, "invitado")) ops.push({ tabla: "pipeline_invitados", id, campos: { nombre, email: email || null, telefono: o(borrador.telefono) } });
  if (!cargada) ops.push({ tabla: "pipeline_invitados", id: null, campos: { lead_id: leadId, nombre, rol: "otro", email: p.email, telefono: o(borrador.telefono) } });
  return { ops };
}

/** Las filas donde está cargada una persona: `tipo` es "convocado" o "invitado". */
export function filasDe(p, tipo) {
  const varias = p?.[`${tipo}Ids`];
  if (Array.isArray(varias) && varias.length) return varias;
  return p?.[`${tipo}Id`] != null ? [p[`${tipo}Id`]] : [];
}

/** La fila con que una persona de la lista pasa a los de siempre. */
export function filaDeSiempre(p, leadId, cuantosHay = 0) {
  return { lead_id: leadId, nombre: texto(p?.nombre) || p?.email || "", empresa: texto(p?.empresa) || null,
    cargo: texto(p?.cargo) || null, email: p?.email || null, activo: true, orden: cuantosHay };
}

/** Lo que se pide para agregar a alguien desde la ficha. */
export function personaDeLaFicha({ nombre, rol, email, telefono } = {}, leadId) {
  const quien = texto(nombre), correo = correoLimpio(email);
  if (!quien) return { error: "Falta el nombre." };
  if (correo && !ES_CORREO.test(correo)) return { error: "Ese correo no está bien escrito." };
  return { fila: { lead_id: leadId, nombre: quien, rol: rol || "otro", email: correo || null, telefono: texto(telefono) || null } };
}

/**
 * La gente DE AFUERA del proyecto, para elegir en su checklist: a quién se le
 * manda, a quién se le avisa una reunión, de quién es un punto.
 *
 * Sale del mismo directorio. Se quita a los del equipo —Lizeth, Johanna—, que
 * también están en los de siempre del acta pero entran a FOREMAN: en el
 * checklist ya salen como «Del equipo», y dos veces la misma persona hace
 * dudar de cuál elegir.
 *
 * @param gente     el directorio (armarDirectorio)
 * @param usuarios  el equipo de FOREMAN, con su correo
 * @returns [{ id, nombre, rol, email }] por nombre; el `id` es su correo
 */
export function deAfuera(gente = [], usuarios = []) {
  const delEquipo = new Set((usuarios || []).map(u => correoLimpio(u?.email)).filter(Boolean));
  return (gente || []).filter(g => g?.email && !delEquipo.has(g.email))
    .map(g => ({
      id: g.email, email: g.email, nombre: String(g.nombre || "").trim() || g.email,
      rol: [g.empresa, g.rol].map(v => String(v || "").trim()).filter(Boolean).join(" · "),
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));
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
