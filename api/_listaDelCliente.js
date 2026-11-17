// EL CHECKLIST QUE VE EL CLIENTE EN SU ENLACE, Y EL QUE LE LLEGA POR CORREO.
//
// De cada tarea que el equipo decidió mostrarle sale lo que se escribió PARA
// ÉL: qué dice, su descripción, en qué está y sus actualizaciones. Lo demás es
// interno y no viaja: quién la tiene, para cuándo estaba, lo que pasó solo.
//
// LAS ACTUALIZACIONES SON LAS ANOTACIONES DEL PUNTO QUE SE MARCARON PARA ÉL.
// Hernán, 17/11/2026, después de anotar en RES BG «Se recibe presupuesto y
// diseño BASE» y «Se recibe diseño preliminar, se envía para correcciones» y
// no verlas en el enlace: «cliente debe ver las actualizaciones de cada uno».
// Había dos lugares donde escribir —el historial, interno, y una
// «actualización para el cliente» aparte, que en toda la base nadie llenó
// nunca—. Ahora es uno: se anota en el punto y la anotación dice si la lee el
// cliente (migración 185). La que no está marcada no viaja.
//
// Sin base: recibe las filas y devuelve lo que se manda. Así se puede probar
// qué sale y, sobre todo, qué no (pruebas/checklistDelLead.test.mjs).

const dia = f => String(f || "").slice(0, 10) || null;
// El día EN ECUADOR (UTC−5, sin horario de verano). Lo que se anota a las
// nueve de la noche es de ese día; leído con la hora de Londres, el cliente lo
// veía fechado al día siguiente.
const diaDeAca = f => {
  const s = String(f || "");
  if (s.length <= 10) return s || null;
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? new Date(t - 5 * 3600 * 1000).toISOString().slice(0, 10) : s.slice(0, 10);
};
const limpio = t => String(t || "").trim();
const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/**
 * Lo que el cliente lee de un punto, lo más nuevo arriba: las anotaciones
 * marcadas para él y, si la hay, la actualización escrita aparte de antes.
 * De la anotación viaja el texto y el día: ni quién la escribió.
 */
function actualizacionesDe(t, notas) {
  const suyas = notas
    .filter(n => n && n.visible_cliente === true && String(n.task_id) === String(t.id) && limpio(n.texto))
    .map(n => ({ id: `n${n.id}`, texto: limpio(n.texto), fecha: diaDeAca(n.created_at), cuando: String(n.created_at || "") }));
  const escrita = limpio(t.cliente_actualizacion);
  if (escrita) suyas.push({ id: "escrita", texto: escrita, fecha: diaDeAca(t.cliente_actualizado_at), cuando: String(t.cliente_actualizado_at || "") });
  return suyas.sort((a, b) => b.cuando.localeCompare(a.cuando));
}
const sinHora = ({ cuando, ...n }) => n;

// ── LA APROBACIÓN DEL CLIENTE, PUNTO POR PUNTO (migración 186) ──────────────
//
// Hernán, 17/11/2026: «¿dónde se sube archivos relacionados? Estos debe poder
// ver cliente para que apruebe». Los archivos ya se le mostraban; el «apruebo»
// quedaba en un WhatsApp. Ahora a un punto se le puede pedir la aprobación: el
// cliente contesta en su enlace —lo aprueba o deja observaciones—, y eso queda
// en el punto con su fecha.
//
// CONTESTA UNA VEZ. Con la respuesta puesta ya no hay botones: si se corrigió
// algo o cambió el archivo, es el equipo el que vuelve a pedirle. Así un
// «aprobado» no se cambia solo por un toque de más, ni se aprueba sin saberlo
// una versión nueva.

const RESPUESTAS = ["aprobado", "observado"];

/**
 * Qué se le pidió aprobar de un punto y qué contestó.
 * @returns null si no se le pidió, o { estado, respondido_el, nota } con
 *          `estado` "pendiente" | "aprobado" | "observado"
 */
export function aprobacionDe(t) {
  if (!t || t.cliente_aprueba !== true) return null;
  const r = RESPUESTAS.includes(t.cliente_respuesta) ? t.cliente_respuesta : null;
  return { estado: r || "pendiente", respondido_el: r ? diaDeAca(t.cliente_respuesta_at) : null, nota: r ? limpio(t.cliente_respuesta_nota) : "" };
}

/**
 * Lo que se guarda cuando el cliente contesta, o por qué no se puede.
 *
 * @param tarea     la fila de `tasks` que nombró, ya filtrada por el proyecto de su llave
 * @param conforme  true si lo aprueba; false si deja observaciones
 * @returns { error, codigo } o { campos, anotacion, bitacora, aprobado, nota }:
 *          `campos` va a la tarea, `anotacion` a su historial y `bitacora` a
 *          la historia del proyecto
 */
export function respuestaDelCliente({ tarea, conforme, nota = "", ahora = new Date() } = {}) {
  if (!tarea || tarea.visible_cliente !== true || tarea.descartada) return { error: "No se encontró ese punto.", codigo: 404 };
  if (tarea.cliente_aprueba !== true) return { error: "Este punto no está esperando tu aprobación.", codigo: 409 };
  if (RESPUESTAS.includes(tarea.cliente_respuesta)) return { error: "Este punto ya tiene tu respuesta.", codigo: 409 };
  const texto = limpio(nota).slice(0, 2000);
  // Aprobar sin decir nada está bien; observar sin decir qué deja al equipo
  // frenado sin saber por qué.
  if (!conforme && !texto) return { error: "Contanos qué hay que cambiar.", codigo: 400 };
  const titulo = limpio(tarea.title);
  return {
    aprobado: !!conforme, nota: texto,
    campos: { cliente_respuesta: conforme ? "aprobado" : "observado", cliente_respuesta_at: ahora.toISOString(), cliente_respuesta_nota: texto || null },
    anotacion: conforme
      ? `El cliente lo aprobó desde su enlace.${texto ? ` Dijo: «${texto}»` : ""}`
      : `El cliente dejó observaciones desde su enlace: «${texto}»`,
    bitacora: conforme
      ? `El cliente aprobó "${titulo}" desde su enlace.${texto ? ` Dijo: «${texto}»` : ""}`
      : `El cliente dejó observaciones en "${titulo}" desde su enlace: «${texto}»`,
  };
}

/**
 * El correo que le avisa al equipo que el cliente contestó.
 * @returns { asunto, cuerpo }  el cuerpo es HTML, con lo que escribió escapado
 */
export function correoDeLaRespuesta({ proyecto = "", punto = "", aprobado = false, nota = "", app = null } = {}) {
  const color = aprobado ? "#15803D" : "#B45309";
  const cuerpo = `
    <p style="font-size:15px;color:#111827;margin:0 0 4px"><strong>${esc(punto)}</strong></p>
    <p style="font-size:14px;color:${color};font-weight:600;margin:0 0 10px">${aprobado ? "El cliente lo aprobó desde su enlace." : "El cliente dejó observaciones desde su enlace."}</p>
    ${limpio(nota) ? `<div style="background:#F9FAFB;border-left:3px solid ${color};border-radius:4px;padding:10px 12px;font-size:14px;color:#374151;white-space:pre-line">${esc(limpio(nota))}</div>` : ""}
    <p style="font-size:12.5px;color:#6B7280;margin:14px 0 0">${aprobado
      ? "Quedó anotado en el historial del punto, con la fecha."
      : "Quedó anotado en el historial del punto. Cuando esté corregido, en el punto se le vuelve a pedir la aprobación."}</p>
    ${app ? `<p style="margin:16px 0 0"><a href="${esc(app)}" style="display:inline-block;background:#0F3D3E;color:#fff;text-decoration:none;font-size:13px;font-weight:600;padding:9px 16px;border-radius:7px">Abrir FOREMAN</a></p>` : ""}`;
  return {
    asunto: `${proyecto ? `${proyecto} · ` : ""}el cliente ${aprobado ? "aprobó" : "dejó observaciones en"} «${punto}»`,
    cuerpo,
  };
}

// ── EL REGISTRO DE APROBACIONES Y EL AVISO AL CLIENTE (migración 187) ───────
//
// Hernán, 17/11/2026: «esta colección de aprobaciones es un sustento y
// justificación... Cada vez que se solicite una aprobación FOREMAN manda un
// mensaje al cliente». Cada pedido es una fila del registro
// (`aprobaciones_cliente`); cuando el cliente contesta, ahí queda qué dijo y
// QUÉ ARCHIVOS TENÍA PARA MIRAR, copiados en ese momento.

/**
 * Los archivos que el cliente tenía en el punto al contestar, como se guardan
 * en el registro. Solo lo que hace falta para decir cuál era y poder abrirlo.
 * @param filas  las de `proyecto_archivos` de ese punto que él veía
 */
export function archivosAprobados(filas = []) {
  return (Array.isArray(filas) ? filas : []).filter(a => a && a.storage_path)
    .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")) || Number(a.id) - Number(b.id))
    .map(a => ({ id: a.id, nombre: limpio(a.nombre) || "Archivo", tamano: Number(a.tamano) || null, storage_path: a.storage_path, subido_at: a.created_at || null }));
}

/**
 * Lo que el cliente ya decidió, para leerlo en su enlace: cada pedido que
 * contestó, lo más nuevo arriba, con lo que dijo y los archivos que aprobó.
 * Los pedidos sin contestar no son decisiones: esos están en «Para aprobar».
 *
 * @param filas    las de `aprobaciones_cliente` del proyecto
 * @param enlaces  { storage_path: enlace temporal }
 * @returns [{ id, titulo, estado, respondido_el, nota, archivos: [{ nombre, url }] }]
 */
export function decisionesDelCliente(filas = [], enlaces = {}) {
  return (Array.isArray(filas) ? filas : [])
    .filter(f => f && RESPUESTAS.includes(f.respuesta) && f.respuesta_at)
    .sort((a, b) => String(b.respuesta_at).localeCompare(String(a.respuesta_at)) || Number(b.id) - Number(a.id))
    .map(f => ({
      id: f.id, titulo: limpio(f.titulo), estado: f.respuesta, respondido_el: diaDeAca(f.respuesta_at), nota: limpio(f.respuesta_nota),
      archivos: (Array.isArray(f.archivos) ? f.archivos : []).map(a => ({ nombre: limpio(a?.nombre) || "Archivo", url: enlaces[a?.storage_path] || null })),
    }));
}

/**
 * El correo que le avisa al cliente que tiene algo para aprobar.
 *
 * @param archivos  los nombres de lo que tiene para mirar en ese punto
 * @param mensaje   unas líneas de quien se lo pide (opcional)
 * @param enlace    su enlace: sin él no hay dónde aprobar, y no se manda
 * @returns { asunto, cuerpo }  el cuerpo es HTML, con todo lo escrito escapado
 */
export function correoDelPedido({ proyecto = "", punto = "", descripcion = "", archivos = [], mensaje = "", enlace = "" } = {}) {
  const nombres = (Array.isArray(archivos) ? archivos : []).map(limpio).filter(Boolean);
  const cuerpo = `
    ${limpio(mensaje) ? `<p style="font-size:14px;color:#374151;margin:0 0 14px;white-space:pre-line">${esc(limpio(mensaje))}</p>` : ""}
    <p style="font-size:14px;color:#B45309;font-weight:700;margin:0 0 6px">Necesitamos tu aprobación</p>
    <p style="font-size:16px;color:#111827;margin:0 0 4px"><strong>${esc(punto)}</strong></p>
    ${limpio(descripcion) ? `<p style="font-size:13.5px;color:#4B5563;line-height:1.5;margin:0 0 8px">${esc(limpio(descripcion))}</p>` : ""}
    ${nombres.length ? `<p style="font-size:13px;color:#374151;margin:10px 0 4px">Para revisar:</p>
    <ul style="margin:0 0 4px;padding-left:18px;font-size:13.5px;color:#111827;line-height:1.6">${nombres.map(n => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
    <p style="margin:18px 0 0"><a href="${esc(enlace)}" style="display:inline-block;background:#0F3D3E;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:7px">Ver y aprobar</a></p>
    <p style="font-size:12.5px;color:#6B7280;line-height:1.5;margin:10px 0 0">Se abre tu página del proyecto, sin usuario ni contraseña. Ahí ${nombres.length ? "abrís los archivos y " : ""}tocás «Lo apruebo», o «Tengo una observación» si hay algo que cambiar. Tu respuesta queda registrada con la fecha.</p>`;
  return { asunto: `${proyecto ? `${proyecto} · ` : ""}necesitamos tu aprobación: ${punto}`, cuerpo };
}

/**
 * @param tareas  las filas de `tasks` del proyecto
 * @param notas   las anotaciones de esas tareas (`tarea_comentarios`): solo
 *                cuentan las que tienen `visible_cliente`
 * @returns [{ id, titulo, descripcion, estado, listo_el, actualizacion, actualizado_el, actualizaciones, aprobar }]
 *          `estado` es "listo" | "espera" | "pendiente". En el orden en que se
 *          escribieron, que es el orden de un checklist. `actualizaciones` es
 *          [{ id, texto, fecha }], lo más nuevo arriba; `actualizacion` y
 *          `actualizado_el` son la última, que es la que va en el correo.
 *          `aprobar` es null, o qué se le pidió aprobar y qué contestó.
 */
export function listaDelCliente(tareas = [], notas = []) {
  const anotado = Array.isArray(notas) ? notas : [];
  return (Array.isArray(tareas) ? tareas : [])
    // Solo lo marcado. Las compras tienen su circuito y lo que se cerró con
    // «ya no va» no se hizo ni falta: mostrárselo al cliente sería ruido.
    .filter(t => t && t.visible_cliente === true && !t.descartada && !t.compra_id && t.type !== "Compra")
    .sort((a, b) => (Number(a.ruta_orden) || 0) - (Number(b.ruta_orden) || 0) || Number(a.id) - Number(b.id))
    .map(t => {
      const listo = t.status === "listo";
      const actualizaciones = actualizacionesDe(t, anotado).map(sinHora);
      return {
        id: t.id,
        titulo: limpio(t.title),
        descripcion: limpio(t.cliente_descripcion),
        estado: listo ? "listo" : t.espera ? "espera" : "pendiente",
        listo_el: listo ? diaDeAca(t.hecha_at) : null,
        actualizacion: actualizaciones[0]?.texto || "",
        actualizado_el: actualizaciones[0]?.fecha || null,
        actualizaciones,
        aprobar: aprobacionDe(t),
      };
    })
    .filter(t => t.titulo);
}

// ── LO QUE VE EL CLIENTE EN SU ENLACE: POR ETAPA, CON LO ÚLTIMO Y CON SUS FOTOS ──
//
// Hernán, 17/11/2026: «el cliente ve las actualizaciones de su proyecto. Se
// pueden cargar archivos o fotos a que los vea... relacionadas al proyecto y a
// las tareas también. Hazlo lo más didáctico y fácil posible».
//
// El checklist era una lista plana de puntos «Pendiente». Ahora dice en qué
// etapa está cada cosa y cuánto va cada etapa, arriba pone lo último que pasó
// —para no tener que buscarlo punto por punto—, y cada punto lleva las fotos y
// los archivos que se le quisieron mostrar. Lo del proyecto en general va
// aparte.

// Una foto es lo que el navegador sabe dibujar. Un .heic del teléfono o un
// .tiff se ofrecen para bajar: como imagen saldrían rotos.
const ES_FOTO = /\.(jpe?g|png|webp|gif|avif)$/i;
const paraVer = (a, enlaces) => ({
  id: a.id, nombre: limpio(a.nombre) || "Archivo", descripcion: limpio(a.descripcion),
  esFoto: ES_FOTO.test(limpio(a.nombre)), url: enlaces[a.storage_path] || null, fecha: diaDeAca(a.created_at),
});

/**
 * @param tareas    las filas de `tasks` del proyecto (con `etapa_id`)
 * @param catalogo  las etapas del pipeline: id, nombre, orden, tunel
 * @param lead      el proyecto: tunel, etapa, resultado
 * @param archivos  las filas de `proyecto_archivos` marcadas para el cliente
 * @param enlaces   { storage_path: enlace temporal }
 * @param notas     las anotaciones de los puntos marcadas para el cliente
 * @returns { lista, etapas, novedades, archivos }
 *   lista     · los puntos, cada uno con `etapa`, sus `actualizaciones` y sus `archivos`
 *   etapas    · [{ id, nombre, listas, total, actual }] en el orden del
 *               pipeline; vacío si los puntos no tienen etapa
 *   novedades · lo último que pasó, lo más nuevo arriba: cada anotación
 *               que se le mostró y los puntos que quedaron listos
 *   archivos  · los del proyecto en general, lo más nuevo arriba
 */
export function loDelCliente({ tareas = [], catalogo = [], lead = null, archivos = [], enlaces = {}, notas = [] } = {}) {
  const filas = Array.isArray(tareas) ? tareas : [];
  const anotado = Array.isArray(notas) ? notas : [];
  const filaDe = new Map(filas.map(t => [t?.id, t]));
  const etapaDe = new Map(filas.map(t => [t?.id, t?.etapa_id || null]));
  const cat = Array.isArray(catalogo) ? catalogo : [];
  const nombreDe = id => limpio(cat.find(e => e.id === id)?.nombre) || null;
  const todos = (Array.isArray(archivos) ? archivos : []).filter(a => a && a.visible_cliente !== false);

  const lista = listaDelCliente(filas, anotado).map(t => {
    const etapaId = etapaDe.get(t.id) || null;
    return {
      ...t, etapa_id: etapaId && nombreDe(etapaId) ? etapaId : null, etapa: etapaId ? nombreDe(etapaId) : null,
      archivos: todos.filter(a => a.task_id === t.id).map(a => paraVer(a, enlaces)),
    };
  });

  // Las etapas que tienen algo para mostrar, en el orden del pipeline: primero
  // las del tipo del proyecto, después alguna de antes, y al final lo suelto.
  const lugar = id => {
    if (!id) return 3e6;
    const e = cat.find(x => x.id === id);
    return (e && lead?.tunel && e.tunel === lead.tunel ? 0 : 1e6) + (Number(e?.orden) || 0);
  };
  const ids = [...new Set(lista.map(t => t.etapa_id))].sort((a, b) => lugar(a) - lugar(b));
  const etapas = ids.length === 1 && ids[0] === null ? [] : ids.map(id => {
    const suyos = lista.filter(t => t.etapa_id === id);
    return {
      id, nombre: id ? nombreDe(id) : "Otros puntos", total: suyos.length, listas: suyos.filter(t => t.estado === "listo").length,
      actual: !!id && !lead?.resultado && lead?.etapa === id,
    };
  });

  // Cada anotación es una novedad: si en un punto se anotó dos veces, son dos.
  // Del mismo día, primero lo que quedó listo y después lo más reciente.
  const novedades = [
    ...lista.flatMap(t => actualizacionesDe(filaDe.get(t.id) || {}, anotado).filter(a => a.fecha)
      .map(a => ({ id: t.id, tipo: "actualizacion", titulo: t.titulo, texto: a.texto, fecha: a.fecha, cuando: a.cuando }))),
    ...lista.filter(t => t.estado === "listo" && t.listo_el)
      .map(t => ({ id: t.id, tipo: "listo", titulo: t.titulo, texto: "Quedó listo.", fecha: t.listo_el, cuando: "" })),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha) || (a.tipo === b.tipo ? 0 : a.tipo === "listo" ? -1 : 1)
    || b.cuando.localeCompare(a.cuando) || Number(b.id) - Number(a.id))
    .slice(0, 6).map(sinHora);

  return {
    lista, etapas, novedades,
    archivos: todos.filter(a => a.task_id == null)
      .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")) || Number(b.id) - Number(a.id))
      .map(a => paraVer(a, enlaces)),
  };
}

/** Cuánto va, para el encabezado: listas de cuántas. */
export const avanceDeLaLista = (lista = []) => ({ listas: lista.filter(t => t.estado === "listo").length, total: lista.length });

/** Cómo se le dice cada estado al cliente. La pantalla del enlace usa las mismas palabras. */
export const ESTADOS = {
  listo: { dice: "Listo", color: "#15803D" },
  espera: { dice: "Hecho de nuestro lado · esperando respuesta", color: "#B45309" },
  pendiente: { dice: "Pendiente", color: "#6B7280" },
};

const enCriollo = f => (f ? new Date(`${dia(f)}T12:00:00`).toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" }) : "");

/**
 * El cuerpo del correo con el checklist: lo mismo que ve en su enlace.
 *
 * @param mensaje  unas líneas de quien lo manda, arriba de la lista (opcional)
 * @param enlace   la dirección de su enlace, si está prendido: va de botón
 * @returns { asunto, cuerpo }  el cuerpo es HTML, con todo lo escrito escapado
 */
export function correoDeLaLista({ proyecto = "", lista = [], mensaje = "", enlace = null } = {}) {
  const { listas, total } = avanceDeLaLista(lista);
  const pct = total ? Math.round((listas / total) * 100) : 0;
  const renglones = lista.map(t => {
    const e = ESTADOS[t.estado] || ESTADOS.pendiente;
    const listo = t.estado === "listo";
    return `
      <tr>
        <td style="vertical-align:top;padding:11px 10px 11px 0;border-top:1px solid #F3F4F6;width:20px">
          <div style="width:16px;height:16px;border-radius:4px;border:1.5px solid ${listo ? "#15803D" : "#D1D5DB"};background:${listo ? "#15803D" : "#fff"};color:#fff;font-size:11px;line-height:16px;text-align:center;font-weight:700">${listo ? "&#10003;" : "&nbsp;"}</div>
        </td>
        <td style="vertical-align:top;padding:11px 0;border-top:1px solid #F3F4F6">
          <div style="font-size:14px;color:#111827;font-weight:600;line-height:1.35">${esc(t.titulo)}</div>
          ${t.descripcion ? `<div style="font-size:13px;color:#4B5563;line-height:1.5;margin-top:2px">${esc(t.descripcion)}</div>` : ""}
          <div style="font-size:12px;color:${e.color};margin-top:3px">${esc(e.dice)}${listo && t.listo_el ? ` · ${esc(enCriollo(t.listo_el))}` : ""}</div>
          ${t.actualizacion ? `<div style="font-size:13px;color:#374151;line-height:1.5;margin-top:6px;padding:7px 10px;background:#F9FAFB;border-radius:6px">${esc(t.actualizacion)}${t.actualizado_el ? `<div style="font-size:11px;color:#9CA3AF;margin-top:3px">Actualizado el ${esc(enCriollo(t.actualizado_el))}</div>` : ""}</div>` : ""}
          ${t.aprobar?.estado === "pendiente" ? `<div style="font-size:12.5px;color:#B45309;font-weight:600;margin-top:6px">Necesitamos tu aprobación${enlace ? ": entrá al enlace de abajo para aprobarlo o dejar tus observaciones" : ""}.</div>`
    : t.aprobar?.estado === "aprobado" ? `<div style="font-size:12.5px;color:#15803D;font-weight:600;margin-top:6px">Lo aprobaste${t.aprobar.respondido_el ? ` el ${esc(enCriollo(t.aprobar.respondido_el))}` : ""}.</div>`
    : t.aprobar?.estado === "observado" ? `<div style="font-size:12.5px;color:#B45309;font-weight:600;margin-top:6px">Lo dejaste con observaciones${t.aprobar.respondido_el ? ` el ${esc(enCriollo(t.aprobar.respondido_el))}` : ""}.</div>` : ""}
        </td>
      </tr>`;
  }).join("");

  const cuerpo = `
    ${limpio(mensaje) ? `<p style="font-size:14px;color:#374151;margin:0 0 14px;white-space:pre-line">${esc(limpio(mensaje))}</p>` : ""}
    <p style="font-size:15px;color:#111827;margin:0 0 6px"><strong>${listas === total && total ? "Todo listo" : `${listas} de ${total} ${total === 1 ? "punto listo" : "puntos listos"}`}</strong></p>
    <div style="height:6px;background:#F3F4F6;border-radius:3px;overflow:hidden;margin:0 0 12px"><div style="width:${pct}%;height:6px;background:#15803D"></div></div>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">${renglones}</table>
    ${enlace ? `<p style="margin:18px 0 0"><a href="${esc(enlace)}" style="display:inline-block;background:#0F3D3E;color:#fff;text-decoration:none;font-size:13px;font-weight:600;padding:9px 16px;border-radius:7px">Ver el checklist al día</a></p>
    <p style="font-size:12px;color:#6B7280;margin:8px 0 0">El enlace muestra siempre la última versión.</p>` : ""}`;

  return { asunto: `${proyecto ? `${proyecto} · ` : ""}cómo vamos: ${listas} de ${total} ${total === 1 ? "punto listo" : "puntos listos"}`, cuerpo };
}
