import { rest, SUPABASE_URL, configurado } from "./_supabase.js";
import { enviarCorreo, plantilla } from "./_correo.js";
import { enviarActa } from "./_aviso-acta.js";
import { quienesDanElVisto } from "./_aviso-visto.js";

// El portal del cliente. Única puerta, y no tiene login.
//
// El cliente no es del equipo: entra tres veces al mes y pedirle que recuerde
// una contraseña es garantizar que no entre. Entra por un enlace con una llave
// larga, y toda la seguridad se apoya en dos cosas que se cumplen acá adentro:
//
//   1. LA LLAVE ABRE UN PROYECTO Y NADA MÁS. Lo primero que hace cada pedido
//      es cambiar la llave por un lead_id, y de ahí en adelante todas las
//      consultas van filtradas por ese id. No existe un camino en el que el
//      cliente nombre qué quiere ver: lo nombra la llave.
//
//   2. LO INTERNO NO SALE. Solo se devuelven las observaciones de recorridas
//      marcadas "con el cliente" Y marcadas visibles, y las fotos de avance
//      con el ojo prendido. Una recorrida interna —donde se escribe "esto lo
//      hizo mal el albañil nuevo"— no se filtra acá: no se consulta.
//
// La llave pública de FOREMAN no sirve para esto: la RLS la bloquea. Por eso
// todo pasa por el servidor con la llave secreta, que nunca llega al navegador.
//
// Lo que el cliente puede escribir son tres campos de respuesta sobre filas
// que ya son suyas. No puede crear nada, no puede borrar nada, y cada
// escritura se vuelve a filtrar por el lead de la llave: mandar el id de una
// observación de otra obra no alcanza, porque el update no la encuentra.

const json = async r => { try { return await r.json(); } catch { return null; } };

/** La llave convertida en proyecto. Null si no existe o si está apagado. */
async function proyectoDe(token) {
  if (!token || String(token).length < 20) return null;
  const limpio = String(token).replace(/[^A-Za-z0-9_-]/g, "");
  if (limpio.length < 20) return null;
  const filas = await json(await rest(
    `leads?portal_token=eq.${encodeURIComponent(limpio)}&select=id,nombre,obra_id,portal_activo,cliente_nombre`));
  const lead = filas?.[0];
  if (!lead || !lead.portal_activo) return null;
  return lead;
}

/** Enlaces temporales a las fotos. Cuatro horas: lo que dura una visita. */
async function firmar(rutas = []) {
  if (!rutas.length) return {};
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/task-files`, {
    method: "POST",
    headers: {
      apikey: process.env.SUPABASE_SECRET_KEY || "",
      ...((process.env.SUPABASE_SECRET_KEY || "").startsWith("eyJ")
        ? { Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}` } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expiresIn: 14400, paths: rutas }),
  });
  const data = await json(r);
  const mapa = {};
  (Array.isArray(data) ? data : []).forEach(x => {
    if (x?.signedURL) mapa[x.path] = `${SUPABASE_URL}/storage/v1${x.signedURL}`;
  });
  return mapa;
}

/**
 * EL ACTA DE REUNIÓN, PARA QUIEN LA TIENE QUE FIRMAR.
 *
 * Misma puerta y misma regla que el portal del cliente: la llave es lo único
 * que nombra qué se puede ver. Acá identifica a UN asistente de UN acta, así
 * que no existe un camino en el que alguien pida otra.
 *
 * Y es lo que convierte un envío en una firma. Hoy, si alguien está de acuerdo
 * no hace nada, y el silencio no se puede distinguir de "no lo leyó": tres
 * meses después "se lo mandamos" no prueba nada. Con esto queda quién, cuándo
 * y desde dónde.
 */
async function asistenteDe(token) {
  if (!token || String(token).length < 20) return null;
  const limpio = String(token).replace(/[^A-Za-z0-9_-]/g, "");
  if (limpio.length < 20) return null;
  const filas = await json(await rest(
    `acta_asistentes?token=eq.${encodeURIComponent(limpio)}&select=id,acta_id,nombre,empresa,cargo,email,conforme_at,observacion,visto_at`));
  return filas?.[0] || null;
}

async function actaParaFirmar(req, res, asistente) {
  const [actas, lead0, temas, compromisos, adjuntos] = await Promise.all([
    json(await rest(`obra_actas?id=eq.${asistente.acta_id}&select=*`)),
    null,
    json(await rest(`acta_temas?acta_id=eq.${asistente.acta_id}&select=titulo,detalle,resuelto&order=orden`)),
    json(await rest(`acta_compromisos?acta_id=eq.${asistente.acta_id}&select=texto,responsable_nombre,fecha_limite,estado,urgente,viene_de&order=orden`)),
    json(await rest(`acta_adjuntos?acta_id=eq.${asistente.acta_id}&select=nombre,descripcion&order=orden`)),
  ]);
  void lead0;
  const acta = actas?.[0];
  if (!acta) return res.status(404).json({ error: "Este enlace no está disponible." });
  const leads = await json(await rest(`leads?id=eq.${acta.lead_id}&select=nombre`));
  const otros = await json(await rest(`acta_asistentes?acta_id=eq.${asistente.acta_id}&select=nombre,empresa,cargo,asistio,conforme_at&order=orden`));

  // La primera vez que lo abre queda anotado. Distingue "no contestó" de "ni
  // la miró", que en una discusión no es lo mismo.
  if (!asistente.visto_at) {
    await rest(`acta_asistentes?id=eq.${asistente.id}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ visto_at: new Date().toISOString() }),
    });
  }
  return res.status(200).json({
    obra: leads?.[0]?.nombre || "",
    acta: {
      numero: acta.numero, fecha: acta.fecha, lugar: acta.lugar,
      hora_inicio: acta.hora_inicio, hora_fin: acta.hora_fin,
      avance_nota: acta.avance_nota, resumen: acta.resumen,
      proxima_fecha: acta.proxima_fecha, proxima_hora: acta.proxima_hora,
    },
    yo: { nombre: asistente.nombre, empresa: asistente.empresa, cargo: asistente.cargo,
      conforme_at: asistente.conforme_at, observacion: asistente.observacion },
    asistentes: otros || [], temas: temas || [], compromisos: compromisos || [], adjuntos: adjuntos || [],
  });
}

/**
 * CUANDO ALGUIEN OBJETA, QUE SE ENTEREN HOY.
 *
 * Una observación es lo único de todo el circuito que obliga a hacer algo, y
 * hasta acá quedaba guardada esperando que alguien abriera el acta y apretara
 * "ver si contestaron". Una objeción que nadie mira en una semana es una
 * objeción perdida: para cuando se lee, la obra ya siguió de largo y lo que se
 * discutía ya se hizo —o ya se hizo mal—.
 *
 * Les llega a los dos que son dueños del acta —quien la escribió y quien le
 * dio el visto— y al equipo de la casa que estuvo en esa reunión, que son los
 * que van a tener que hacer algo con esto. Se reconocen porque su correo es el
 * de un usuario de FOREMAN: los de afuera no tienen cuenta.
 *
 * Si el aviso falla, la firma ya quedó guardada igual. Es al revés de lo que
 * parece: lo que no se puede perder es la objeción, no el correo.
 */
async function avisarObservacion(asistente, texto) {
  try {
    const acta = (await json(await rest(
      `obra_actas?id=eq.${asistente.acta_id}&select=numero,fecha,lead_id,creado_por,revisada_por`)))?.[0];
    if (!acta) return;
    const [leads, usuarios, asistentes] = await Promise.all([
      json(await rest(`leads?id=eq.${acta.lead_id}&select=nombre`)),
      json(await rest("usuarios?activo=eq.true&select=id,email")),
      json(await rest(`acta_asistentes?acta_id=eq.${asistente.acta_id}&select=email`)),
    ]);
    const dueños = [acta.creado_por, acta.revisada_por].filter(Boolean).map(String);
    const enLaReunion = new Set((asistentes || []).map(a => String(a.email || "").trim().toLowerCase()).filter(Boolean));
    const para = [];
    for (const u of usuarios || []) {
      const e = String(u.email || "").trim().toLowerCase();
      if (!e) continue;
      if (dueños.includes(String(u.id)) || enLaReunion.has(e)) { if (!para.includes(e)) para.push(e); }
    }
    if (!para.length) return;

    const obra = leads?.[0]?.nombre || "la obra";
    const quien = `${asistente.nombre}${asistente.empresa ? ` · ${asistente.empresa}` : ""}`;
    await enviarCorreo({
      to: para,
      subject: `Observación al acta N° ${acta.numero} · ${obra} · ${asistente.nombre}`,
      html: plantilla({
        titulo: `Observación al acta N° ${acta.numero}`,
        subtitulo: obra,
        cuerpo: `
          <p style="margin:0 0 12px;font-size:14px;color:#1A1A1A">
            <strong>${escaparHtml(quien)}</strong> abrió el acta por su enlace y escribió que algo no refleja
            lo acordado:
          </p>
          <div style="font-size:14px;color:#1A1A1A;line-height:1.6;padding:12px 14px;background:#FEF6E7;
            border:1px solid #F0D9A8;border-radius:8px;white-space:pre-line">${escaparHtml(texto)}</div>
          <p style="margin:14px 0 0;font-size:13px;color:#555;line-height:1.55">
            Queda registrada en el acta con su nombre y la fecha, y entra sola como primer tema de la próxima
            reunión. No hace falta copiarla a ningún lado.
          </p>`,
        pie: "Correo automático de FOREMAN · HCA Studio. La observación ya está guardada en el acta.",
      }),
    });
  } catch { /* el aviso no puede tumbar la firma: lo que importa ya se guardó */ }
}

const escaparHtml = t => String(t ?? "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

async function firmarActa(req, res, asistente) {
  const { conforme, observacion } = req.body || {};
  const texto = String(observacion || "").trim().slice(0, 2000);
  if (!conforme && !texto) return res.status(400).json({ error: "Decí si estás de acuerdo o escribí qué no refleja lo acordado." });
  // La IP es la mitad del rastro: sin ella, "alguien con el enlace apretó un
  // botón" no es una firma.
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || null;
  const ahora = new Date().toISOString();
  const campos = {};
  if (conforme) { campos.conforme_at = ahora; campos.conforme_ip = ip; }
  if (texto) { campos.observacion = texto; campos.observacion_at = ahora; }
  const r = await rest(`acta_asistentes?id=eq.${asistente.id}`, {
    method: "PATCH", headers: { Prefer: "return=representation" },
    body: JSON.stringify(campos),
  });
  if (!r.ok) return res.status(500).json({ error: "No se pudo guardar." });
  if (texto) await avisarObservacion(asistente, texto);
  return res.status(200).json({ ok: true, conforme_at: campos.conforme_at || asistente.conforme_at, observacion: texto || asistente.observacion });
}

/** La entrega del libro que abre esta llave. */
async function entregaDe(token) {
  if (!token || String(token).length < 20) return null;
  const limpio = String(token).replace(/[^A-Za-z0-9_-]/g, "");
  if (limpio.length < 20) return null;
  const filas = await json(await rest(
    `libro_envios?token=eq.${encodeURIComponent(limpio)}&select=id,lead_id,desde,hasta,dias,nombre,email,visto_at,conforme_at,observacion`));
  return filas?.[0] || null;
}

/**
 * El libro del tramo, para leerlo antes de darlo por revisado.
 *
 * El PDF ya le llegó por correo, pero el correo se archiva y el enlace se abre
 * tres semanas después desde el teléfono. Si al entrar no se ve QUÉ se está
 * aprobando, lo que queda es un botón a ciegas — y una conformidad a ciegas no
 * es una conformidad.
 */
async function libroParaFirmar(req, res, entrega) {
  const [leads, dias] = await Promise.all([
    json(await rest(`leads?id=eq.${entrega.lead_id}&select=nombre`)),
    json(await rest(`libro_obra_dias?lead_id=eq.${entrega.lead_id}`
      + `${entrega.desde ? `&fecha=gte.${entrega.desde}` : ""}${entrega.hasta ? `&fecha=lte.${entrega.hasta}` : ""}`
      + "&estado=in.(cerrado,aprobado)&select=id,fecha,estado&order=fecha")),
  ]);
  const ids = (dias || []).map(d => d.id);
  const entradas = ids.length
    ? await json(await rest(`libro_obra_entradas?dia_id=in.(${ids.join(",")})&select=dia_id,categoria,contenido&order=id`))
    : [];
  const porDia = new Map();
  for (const e of entradas || []) {
    if (!porDia.has(e.dia_id)) porDia.set(e.dia_id, []);
    porDia.get(e.dia_id).push({ categoria: e.categoria, contenido: e.contenido });
  }

  // La primera vez que lo abre queda anotado. Distingue "no contestó" de "ni
  // lo miró", que en una discusión no es lo mismo.
  if (!entrega.visto_at) {
    await rest(`libro_envios?id=eq.${entrega.id}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ visto_at: new Date().toISOString() }),
    });
  }

  return res.status(200).json({
    obra: leads?.[0]?.nombre || "",
    tramo: { desde: entrega.desde, hasta: entrega.hasta, dias: entrega.dias },
    yo: { nombre: entrega.nombre, email: entrega.email,
      conforme_at: entrega.conforme_at, observacion: entrega.observacion },
    dias: (dias || []).map(d => ({ fecha: d.fecha, estado: d.estado, entradas: porDia.get(d.id) || [] })),
  });
}

async function firmarLibro(req, res, entrega) {
  const { conforme, observacion } = req.body || {};
  const texto = String(observacion || "").trim().slice(0, 2000);
  if (!conforme && !texto) return res.status(400).json({ error: "Decí si lo das por revisado o escribí qué no coincide." });
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || null;
  const ahora = new Date().toISOString();
  const campos = {};
  if (conforme) { campos.conforme_at = ahora; campos.conforme_ip = ip; }
  if (texto) { campos.observacion = texto; campos.observacion_at = ahora; }
  const r = await rest(`libro_envios?id=eq.${entrega.id}`, {
    method: "PATCH", headers: { Prefer: "return=representation" },
    body: JSON.stringify(campos),
  });
  if (!r.ok) return res.status(500).json({ error: "No se pudo guardar." });
  if (texto) await avisarObservacionDelLibro(entrega, texto);
  return res.status(200).json({ ok: true, conforme_at: campos.conforme_at || entrega.conforme_at, observacion: texto || entrega.observacion });
}

/**
 * Si alguien dice que el libro no coincide con lo que vio en obra, eso no
 * puede quedar esperando a que alguien abra una pantalla.
 *
 * Va al equipo de la casa —los usuarios de FOREMAN— porque son los que pueden
 * hacer algo: reabrir el día, corregirlo, o ir a mirar.
 */
async function avisarObservacionDelLibro(entrega, texto) {
  try {
    const [leads, usuarios] = await Promise.all([
      json(await rest(`leads?id=eq.${entrega.lead_id}&select=nombre`)),
      json(await rest("usuarios?activo=eq.true&select=email")),
    ]);
    const para = (usuarios || []).map(u => String(u.email || "").trim().toLowerCase()).filter(Boolean);
    if (!para.length) return;
    const obra = leads?.[0]?.nombre || "la obra";
    const quien = entrega.nombre || entrega.email;
    await enviarCorreo({
      to: para,
      subject: `Observación al libro de obra · ${obra} · ${quien}`,
      html: plantilla({
        titulo: "Observación al libro de obra",
        subtitulo: obra,
        cuerpo: `
          <p style="margin:0 0 12px;font-size:14px;color:#1A1A1A">
            <strong>${escaparHtml(quien)}</strong> abrió el libro por su enlace y escribió que algo no coincide
            con lo que vio en obra:
          </p>
          <div style="font-size:14px;color:#1A1A1A;line-height:1.6;padding:12px 14px;background:#FEF6E7;
            border:1px solid #F0D9A8;border-radius:8px;white-space:pre-line">${escaparHtml(texto)}</div>
          <p style="margin:14px 0 0;font-size:13px;color:#555;line-height:1.55">
            Queda anotada en la entrega del libro, con su nombre y la fecha.
          </p>`,
        pie: "Correo automático de FOREMAN · HCA Studio.",
      }),
    });
  } catch { /* el aviso no puede tumbar la firma: lo que importa ya se guardó */ }
}

/** La aprobación de orden de cambio que abre esta llave. */
async function aprobacionDe(token) {
  if (!token || String(token).length < 20) return null;
  const limpio = String(token).replace(/[^A-Za-z0-9_-]/g, "");
  if (limpio.length < 20) return null;
  const filas = await json(await rest(
    `orden_cambio_aprobaciones?token=eq.${encodeURIComponent(limpio)}&select=id,orden_id,nombre,email,rol,visto_at,aprobado_at,observacion`));
  return filas?.[0] || null;
}

/**
 * La orden de cambio, para el que la tiene que aprobar.
 *
 * Entera: los argumentos, lo que se agrega y lo que se quita con su precio, y
 * cuántos días suma al plazo. Aprobar un documento que no se ve no es aprobar.
 */
async function ordenParaFirmar(req, res, firma) {
  const ordenes = await json(await rest(`ordenes_cambio?id=eq.${firma.orden_id}&select=*`));
  const orden = ordenes?.[0];
  if (!orden) return res.status(404).json({ error: "Este enlace no está disponible." });
  const [lineas, obras, otros] = await Promise.all([
    json(await rest(`orden_cambio_lineas?orden_id=eq.${orden.id}&select=*&order=orden`)),
    json(await rest(`obras?id=eq.${orden.obra_id}&select=nombre,cliente_nombre`)),
    json(await rest(`orden_cambio_aprobaciones?orden_id=eq.${orden.id}&select=nombre,rol,aprobado_at&order=id`)),
  ]);

  // La primera vez que lo abre queda anotado: "no contestó" y "ni lo miró" no
  // son lo mismo cuando la obra está parada esperando esa firma.
  if (!firma.visto_at) {
    await rest(`orden_cambio_aprobaciones?id=eq.${firma.id}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ visto_at: new Date().toISOString() }),
    });
  }

  return res.status(200).json({
    obra: obras?.[0]?.nombre || "",
    cliente: obras?.[0]?.cliente_nombre || "",
    orden: {
      codigo: orden.codigo, numero: orden.numero, titulo: orden.titulo, tipo: orden.tipo,
      fecha: orden.fecha, lugar: orden.lugar, justificacion: orden.justificacion,
      fecha_limite_aprobacion: orden.fecha_limite_aprobacion,
      impacto_cronograma: orden.impacto_cronograma, dias_impacto: orden.dias_impacto,
      anulada: orden.anulada,
    },
    // EL MONTO SE CALCULA ACÁ. Se mandaban `l.total` y `l.accion`, dos
    // columnas que la tabla no tiene: la línea guarda cantidad y precio, y lo
    // que se quita se marca en `tipo`. El que abría el enlace veía cada
    // partida en $0,00, la diferencia en $0,00 y la reducción listada entre
    // las adiciones. Un documento así no se aprueba: se llama por teléfono
    // para preguntar qué pasó, que es justo lo que este enlace venía a
    // evitar.
    lineas: (lineas || []).map(l => {
      const signo = l.tipo === "quita" ? -1 : 1;
      return {
        item: l.item, descripcion: l.descripcion, especificacion: l.especificacion,
        unidad: l.unidad, cantidad: l.cantidad, precio_unitario: l.precio_unitario,
        tipo: l.tipo,
        total: signo * (Number(l.cantidad) || 0) * (Number(l.precio_unitario) || 0),
      };
    }),
    yo: { nombre: firma.nombre, rol: firma.rol, aprobado_at: firma.aprobado_at, observacion: firma.observacion },
    firmantes: otros || [],
  });
}

async function firmarOrden(req, res, firma) {
  const { aprueba, observacion } = req.body || {};
  const texto = String(observacion || "").trim().slice(0, 2000);
  if (!aprueba && !texto) return res.status(400).json({ error: "Decí si la aprobás o escribí qué objetás." });
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || null;
  const ahora = new Date().toISOString();
  const campos = {};
  if (aprueba) { campos.aprobado_at = ahora; campos.aprobado_ip = ip; }
  if (texto) { campos.observacion = texto; campos.observacion_at = ahora; }
  const r = await rest(`orden_cambio_aprobaciones?id=eq.${firma.id}`, {
    method: "PATCH", headers: { Prefer: "return=representation" },
    body: JSON.stringify(campos),
  });
  if (!r.ok) return res.status(500).json({ error: "No se pudo guardar." });
  // Con la última firma, la orden entra al presupuesto.
  const aplicada = aprueba ? await siFirmaronTodos(firma.orden_id) : null;
  await avisarDeLaOrden(firma, aprueba, texto, aplicada);
  return res.status(200).json({
    ok: true, aprobado_at: campos.aprobado_at || firma.aprobado_at,
    observacion: texto || firma.observacion, aplicada: !!aplicada,
  });
}

/**
 * ¿Ya firmaron todos? Entonces la orden se aplica al presupuesto.
 *
 * Es el momento en que una orden de cambio deja de ser un pedido y pasa a ser
 * plata del contrato: sus rubros entran al control como ADICIONALES —en más o
 * en menos— y los que la orden quita quedan tachados. Hacerlo a mano después,
 * cuando alguien se acuerde, es como se llega a fin de obra con cuatro órdenes
 * aprobadas que el control nunca contó.
 *
 * NO SE APLICA SI ALGUIEN OBJETÓ, aunque después haya aprobado: una objeción
 * sin resolver es trabajo que no se ejecuta.
 *
 * La misma cuenta vive en src/modules/controlObra/ordenesDeCambio.js, que es
 * la que usa la oficina cuando aprueba desde adentro. Si una cambia, la otra
 * también: son el mismo documento entrando por dos puertas.
 */
async function siFirmaronTodos(ordenId) {
  // SOLO CUENTAN LOS QUE RECIBIERON SU ENLACE.
  //
  // La lista del CAPÍTULO IV se arma mientras la orden se escribe, y puede
  // tener a alguien que al final no se incluyó en el envío. Contándolo, la
  // orden le quedaba esperando una firma a alguien que nunca recibió nada:
  // firmaban los tres que sí tenían el correo y la orden no entraba al
  // presupuesto, sin que nada lo dijera.
  // Y solo los que tienen que firmar: en el cuadro de revisión también están
  // los que reciben copia, y una copia no es una firma que falta.
  const firmas = await json(await rest(`orden_cambio_aprobaciones?orden_id=eq.${ordenId}&envio_at=not.is.null&aprueba=is.true&select=aprobado_at,observacion`));
  if (!firmas?.length) return null;
  if (firmas.some(f => !f.aprobado_at || (f.observacion && String(f.observacion).trim()))) return null;

  const ordenes = await json(await rest(`ordenes_cambio?id=eq.${ordenId}&select=*`));
  const orden = ordenes?.[0];
  // Idempotente: si ya se aplicó, no se aplica dos veces. Un adicional
  // duplicado es plata inventada en el control.
  if (!orden || orden.aprobada_at) return null;

  const lineas = await json(await rest(`orden_cambio_lineas?orden_id=eq.${ordenId}&select=*&order=orden`)) || [];
  const codigo = orden.codigo || `OC-${String(orden.numero).padStart(2, "0")}`;

  const anulan = lineas.filter(l => l.tipo === "quita" && l.obra_rubro_id);
  if (anulan.length) {
    await rest(`obra_rubros?id=in.(${anulan.map(l => Number(l.obra_rubro_id)).join(",")})`, {
      method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ anulado_por_oc: orden.id }),
    });
  }

  const filas = lineas.filter(l => !(l.tipo === "quita" && l.obra_rubro_id)).map((l, i) => {
    const signo = l.tipo === "quita" ? -1 : 1;
    return {
      obra_id: orden.obra_id,
      numero: 9000 + orden.numero * 100 + i,
      capitulo: l.capitulo || `ADICIONALES · ${codigo}`,
      capitulo_orden: 9000 + orden.numero,
      orden: 9000000 + orden.numero * 1000 + i,
      descripcion: `${l.tipo === "quita" ? "(–) " : ""}${l.descripcion}  ·  ${codigo}`,
      unidad: l.unidad || "",
      cantidad: Number(l.cantidad) || 0,
      precio_unitario: signo * (Number(l.precio_unitario) || 0),
      total_base: signo * (Number(l.cantidad) || 0) * (Number(l.precio_unitario) || 0),
      origen: "orden_cambio",
      orden_cambio_id: orden.id,
    };
  });
  if (filas.length) {
    await rest("obra_rubros", {
      method: "POST", headers: { Prefer: "return=minimal" },
      body: JSON.stringify(filas),
    });
  }

  const ahora = new Date().toISOString();
  await rest(`ordenes_cambio?id=eq.${orden.id}`, {
    method: "PATCH", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      estado: "aprobada", aprobada_at: ahora, visto_at: orden.visto_at || ahora,
      ejecucion: orden.ejecucion === "por_definir" ? "ejecutado" : orden.ejecucion,
    }),
  });

  const monto = filas.reduce((t, f) => t + (Number(f.total_base) || 0), 0);
  return { codigo, rubros: filas.length, monto: Math.round(monto * 100) / 100 };
}

/**
 * Que la oficina se entere hoy, sobre todo si objetaron.
 *
 * Mientras no estén las firmas el trabajo no se ejecuta y el plazo corre. Una
 * objeción que nadie mira en una semana es una semana de obra parada por un
 * correo que nadie abrió.
 */
async function avisarDeLaOrden(firma, aprueba, texto, aplicada) {
  try {
    const ordenes = await json(await rest(`ordenes_cambio?id=eq.${firma.orden_id}&select=codigo,numero,titulo,obra_id,created_by`));
    const orden = ordenes?.[0];
    if (!orden) return;
    const [obras, usuarios] = await Promise.all([
      json(await rest(`obras?id=eq.${orden.obra_id}&select=nombre`)),
      json(await rest("usuarios?activo=eq.true&select=email")),
    ]);
    const para = (usuarios || []).map(u => String(u.email || "").trim().toLowerCase()).filter(Boolean);
    if (!para.length) return;
    const quien = `${firma.nombre || firma.email}${firma.rol ? ` · ${firma.rol}` : ""}`;
    const codigo = orden.codigo || `N° ${orden.numero}`;
    await enviarCorreo({
      to: para,
      subject: `${aprueba ? "Aprobada" : "Observada"}: Orden de Cambio ${codigo} · ${quien}`,
      html: plantilla({
        titulo: aprueba ? `Orden de Cambio ${codigo} aprobada` : `Observación a la Orden de Cambio ${codigo}`,
        subtitulo: [obras?.[0]?.nombre, orden.titulo].filter(Boolean).join(" · "),
        cuerpo: `
          <p style="margin:0 0 12px;font-size:14px;color:#1A1A1A">
            <strong>${escaparHtml(quien)}</strong> ${aprueba ? "aprobó la orden de cambio desde su enlace." : "entró por su enlace y objetó:"}
          </p>
          ${texto ? `<div style="font-size:14px;color:#1A1A1A;line-height:1.6;padding:12px 14px;background:#FEF6E7;
            border:1px solid #F0D9A8;border-radius:8px;white-space:pre-line">${escaparHtml(texto)}</div>` : ""}
          <p style="margin:14px 0 0;font-size:13px;color:#555;line-height:1.55">
            Queda registrado con su nombre, la fecha y desde dónde. Las firmas que faltan se ven en la obra,
            en Órdenes de cambio.
          </p>
          ${aplicada ? `
          <div style="margin:16px 0 0;padding:12px 14px;background:#EAF6EE;border:1px solid #BFE3CC;border-radius:8px">
            <div style="font-size:13.5px;font-weight:700;color:#15803D;margin-bottom:4px">Firmaron todos: ya entró al presupuesto</div>
            <div style="font-size:12.5px;color:#374151;line-height:1.6">
              Sus ${aplicada.rubros} ${aplicada.rubros === 1 ? "rubro entró" : "rubros entraron"} al control de obra
              como <strong>ADICIONALES · ${escaparHtml(aplicada.codigo)}</strong>, por
              <strong>$${Number(aplicada.monto).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>.
              Lo que la orden quita quedó tachado del presupuesto original.
            </div>
          </div>` : ""}`,
        pie: "Correo automático de FOREMAN · HCA Studio.",
      }),
    });
  } catch { /* el aviso no puede tumbar la firma: lo que importa ya se guardó */ }
}

// ── LA APROBACIÓN QUE SE CONTESTA DESDE EL CORREO ────────────────────────────
//
// Misma puerta y misma regla que la orden de cambio: la llave nombra UNA tarea
// de aprobación y nada más, así que no existe un camino en el que alguien
// conteste la de otro.
//
// Acá sí hay cuenta del otro lado —el que aprueba una compra es del equipo—
// pero pedirle que entre a FOREMAN con el teléfono en la mano, caminando por
// una obra, es lo que hacía que una compra esperara dos días por un sí.
//
// Y EL SERVIDOR NO DECIDE A QUIÉN LE TOCA DESPUÉS. Esa regla vive en la
// pantalla de la solicitud, que conoce al equipo; viene resuelta en la tarea
// (`aprob_ok_para`, `aprob_no_para`) desde que se mandó el correo. Dos lugares
// decidiendo lo mismo se separan el día que cambia el organigrama.

/** La tarea de aprobación que abre esta llave. */
async function aprobacionDeTarea(token) {
  if (!token || String(token).length < 20) return null;
  const limpio = String(token).replace(/[^A-Za-z0-9_-]/g, "");
  if (limpio.length < 20) return null;
  const filas = await json(await rest(
    `tasks?aprobacion_token=eq.${encodeURIComponent(limpio)}&select=*`));
  return filas?.[0] || null;
}

/** Lo que hace falta para decidir, entero. */
async function tareaParaAprobar(req, res, tarea) {
  const compra = tarea.compra_id
    ? (await json(await rest(`compras_solicitudes?id=eq.${tarea.compra_id}&select=*`)))[0] || null : null;
  const [quien, lead, historial, adjuntos] = await Promise.all([
    tarea.assignee_id ? json(await rest(`usuarios?id=eq.${tarea.assignee_id}&select=nombre,rol`)) : [],
    compra?.lead_id ? json(await rest(`leads?id=eq.${compra.lead_id}&select=nombre`)) : [],
    compra ? json(await rest(`compras_historial?solicitud_id=eq.${compra.id}&select=estado_nuevo,usuario_nombre,comentario,created_at&order=created_at`)) : [],
    compra ? json(await rest(`compras_adjuntos?solicitud_id=eq.${compra.id}&select=id,nombre,tipo,storage_path&order=created_at`)) : [],
  ]);

  // Los respaldos, con enlace temporal: la proforma se mira antes de aprobar,
  // y en el teléfono se mira en la pantalla, no en el adjunto del correo.
  const urls = await firmar((adjuntos || []).map(a => a.storage_path).filter(Boolean));

  return res.status(200).json({
    tarea: {
      id: tarea.id, title: tarea.title, notes: tarea.notes, due_date: tarea.due_date,
      priority: tarea.priority, aprobacion_estado: tarea.aprobacion_estado,
      aprobacion_at: tarea.aprobacion_at, aprobacion_nota: tarea.aprobacion_nota,
      aprobacion_nombre: tarea.aprobacion_nombre,
    },
    compra, obra: lead?.[0]?.nombre || null,
    yo: { nombre: quien?.[0]?.nombre || null, rol: quien?.[0]?.rol || null },
    historial: (historial || []).filter(h => h.comentario),
    adjuntos: (adjuntos || []).map(a => ({ ...a, url: urls[a.storage_path] || null })),
  });
}

/**
 * La decisión, escrita.
 *
 * Aprobar deja la compra lista para que la ejecute compras; devolver la manda
 * de vuelta a quien la pidió con el motivo adentro —sin motivo no se puede
 * devolver, y eso lo sostiene la base, no esta pantalla—. En los dos casos se
 * cierra la tarea de quien decidió y se le crea la del que sigue: así nadie se
 * queda esperando un correo que no va a llegar.
 */
async function decidirAprobacion(req, res, tarea) {
  const { aprueba, nota } = req.body || {};
  const limpio = String(nota || "").trim() || null;
  if (!aprueba && !limpio) return res.status(400).json({ error: "Para devolverla hay que decir qué falta." });
  if (["aprobada", "devuelta"].includes(tarea.aprobacion_estado)) {
    return res.status(200).json({ ok: true, ya: tarea.aprobacion_estado });
  }

  const quien = tarea.assignee_id
    ? (await json(await rest(`usuarios?id=eq.${tarea.assignee_id}&select=id,nombre,email`)))[0] || null : null;
  const ahora = new Date().toISOString();

  await rest(`tasks?id=eq.${tarea.id}`, {
    method: "PATCH", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      status: "listo",
      aprobacion_estado: aprueba ? "aprobada" : "devuelta",
      aprobacion_por: quien?.id ?? null, aprobacion_nombre: quien?.nombre || null,
      aprobacion_at: ahora, aprobacion_nota: limpio,
    }),
  });

  // La decisión también es un comentario de la tarea: es la conversación, y
  // así la lee quien la creó y quien la estaba esperando.
  if (limpio) await rest("tarea_comentarios", {
    method: "POST", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      task_id: tarea.id, autor_id: quien?.id ?? null, autor_nombre: quien?.nombre || null,
      texto: `${aprueba ? "Aprobada" : "Devuelta"} desde el correo: ${limpio}`,
    }),
  }).catch(() => {});

  // ── EL VISTO INTERNO DE UNA ORDEN DE CAMBIO ───────────────────────────────
  //
  // Lo que se aprueba acá NO es que el cliente aceptó: es que el precio puede
  // salir de la oficina. Son dos cosas distintas y confundirlas es lo que hacía
  // que alguien se registrara a sí mismo como el contratante que aprobó.
  if (tarea.orden_cambio_id) {
    const ordenes = await json(await rest(`ordenes_cambio?id=eq.${tarea.orden_cambio_id}&select=*`));
    const orden = ordenes?.[0];
    if (orden) {
      await rest(`ordenes_cambio?id=eq.${orden.id}`, {
        method: "PATCH", headers: { Prefer: "return=minimal" },
        body: JSON.stringify(aprueba
          ? { visto_at: ahora, visto_por: quien?.id ?? null, visto_nombre: quien?.nombre || null, visto_comentario: limpio }
          // Devuelta: el visto no queda, y lo que hay que corregir sí.
          : { visto_at: null, visto_por: null, visto_nombre: null, visto_comentario: limpio }),
      });
      await avisarDelVistoDeLaOrden(orden, tarea, { aprueba, nota: limpio, quien });
    }
    return res.status(200).json({ ok: true, orden: true, aprueba: !!aprueba });
  }

  if (!tarea.compra_id) return res.status(200).json({ ok: true });

  // ── LA COMPRA AVANZA ──────────────────────────────────────────────────────
  const compras = await json(await rest(`compras_solicitudes?id=eq.${tarea.compra_id}&select=*`));
  const compra = compras?.[0];
  if (!compra) return res.status(200).json({ ok: true });

  const estado = aprueba ? "aprobada" : "requiere_info";
  const paraQuien = aprueba ? tarea.aprob_ok_para : (tarea.aprob_no_para || compra.solicitante_id);
  const titulo = aprueba ? `Comprar: ${compra.descripcion}` : `Completar la solicitud: ${compra.descripcion}`;

  let nueva = null;
  if (paraQuien) {
    const r = await rest("tasks", {
      method: "POST", headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        title: titulo, lead_id: compra.lead_id, assignee_id: Number(paraQuien),
        due_date: compra.necesita_para || null, priority: compra.urgente ? "urgente" : "media",
        status: "en-progreso", type: "Compra", compra_id: compra.id, compra_estado: estado,
        notes: `Gestión de compras · ${compra.descripcion}`, created_by: quien?.id ?? null,
      }),
    });
    nueva = (await json(r))[0] || null;
  }

  await rest(`compras_solicitudes?id=eq.${compra.id}`, {
    method: "PATCH", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      estado, tarea_id: nueva?.id ?? null,
      ...(aprueba ? { aprobador_id: quien?.id ?? null, aprobador_nombre: quien?.nombre || null, aprobado_at: ahora } : {}),
    }),
  });

  await rest("compras_historial", {
    method: "POST", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      solicitud_id: compra.id, estado_anterior: compra.estado, estado_nuevo: estado,
      usuario_id: quien?.id ?? null, usuario_nombre: quien?.nombre || null,
      comentario: limpio ? `${limpio} (desde el correo)` : "Aprobada desde el correo",
    }),
  }).catch(() => {});

  if (compra.lead_id) await rest("lead_movimientos", {
    method: "POST", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      lead_id: compra.lead_id, tipo: "compra", automatico: true,
      detalle: `${aprueba ? "Aprobada" : "Devuelta"} desde el correo: ${compra.descripcion}${limpio ? ` — ${limpio}` : ""}`,
      autor_id: quien?.id ?? null, autor_nombre: quien?.nombre || null,
    }),
  }).catch(() => {});

  // Y AL QUE SIGUE SE LE AVISA. Sin esto la compra queda aprobada y nadie la
  // compra: la tarea aparece en un tablero que esa persona abre mañana.
  await avisarAlQueSigue(nueva, compra, { aprueba, nota: limpio, quien });

  return res.status(200).json({ ok: true, estado });
}

/**
 * El visto de la orden, de vuelta a quien la armó.
 *
 * Con el visto dado, lo que falta es mandarla al cliente — y eso lo hace la
 * oficina, no el Director desde el teléfono: la lista de a quién se le manda
 * se arma en la pantalla de la orden. Sin este correo, el visto quedaba dado y
 * la orden esperando a que alguien entrara a mirar si ya estaba.
 */
async function avisarDelVistoDeLaOrden(orden, tarea, { aprueba, nota, quien }) {
  try {
    const paraId = tarea.aprob_no_para || tarea.created_by;
    if (!paraId) return;
    const u = (await json(await rest(`usuarios?id=eq.${paraId}&select=nombre,email,activo`)))[0];
    if (!u?.email || u.activo === false) return;
    const codigo = orden.codigo || `OC-${String(orden.numero).padStart(2, "0")}`;
    await enviarCorreo({
      to: [u.email],
      subject: `${aprueba ? "Visto dado" : "Devuelta"}: ${codigo} · ${orden.titulo || ""}`,
      html: plantilla({
        titulo: `${codigo} · ${orden.titulo || ""}`,
        subtitulo: aprueba ? "Lista para mandar al cliente" : "Hay que corregirla antes de mandarla",
        cuerpo: `
          <p style="margin:0 0 12px;font-size:14px;color:#111827">
            <strong>${quien?.nombre || "El Director"}</strong>
            ${aprueba ? "le dio el visto a esta orden de cambio." : "la devolvió antes de que salga al cliente."}
          </p>
          ${nota ? `<div style="font-size:13.5px;color:#111827;line-height:1.6;padding:12px 14px;background:${aprueba ? "#F4F7F6" : "#FFFBEB"};
            border:1px solid ${aprueba ? "#CFE0DC" : "#FCD34D"};border-radius:8px;margin:0 0 12px">${String(nota).replace(/[&<>]/g, c2 => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c2]))}</div>` : ""}
          <p style="margin:0 0 14px;font-size:13px;color:#6B7280">
            ${aprueba
              ? "El precio ya puede salir de la oficina. En Órdenes de cambio, 'Enviar al cliente' les manda a cada uno su enlace para aprobarla."
              : "Mientras no se corrija, no sale: una vez que el cliente ve un precio, bajarlo es una negociación y subirlo es imposible."}
          </p>
          <a href="${process.env.APP_URL || "https://foreman-app-ebon.vercel.app"}" style="display:inline-block;background:#0F3D3E;
            color:#fff;text-decoration:none;padding:10px 18px;border-radius:7px;font-size:14px;font-weight:700">Abrir FOREMAN</a>`,
        pie: "Correo automático de FOREMAN · HCA Studio.",
      }),
    });
  } catch { /* el aviso no puede tumbar el visto: lo que importa ya se guardó */ }
}

/** El correo del que sigue: corto, con lo que tiene que hacer. */
async function avisarAlQueSigue(tarea, compra, { aprueba, nota, quien }) {
  if (!tarea?.assignee_id) return;
  try {
    const u = (await json(await rest(`usuarios?id=eq.${tarea.assignee_id}&select=nombre,email,activo`)))[0];
    if (!u?.email || u.activo === false) return;
    const lead = compra.lead_id ? (await json(await rest(`leads?id=eq.${compra.lead_id}&select=nombre`)))[0] : null;
    await enviarCorreo({
      to: [u.email],
      subject: `${aprueba ? "Aprobada" : "Devuelta"}: ${compra.descripcion}${lead?.nombre ? ` · ${lead.nombre}` : ""}`,
      html: plantilla({
        titulo: tarea.title,
        subtitulo: lead?.nombre || undefined,
        cuerpo: `
          <p style="margin:0 0 12px;font-size:14px;color:#111827">
            <strong>${quien?.nombre || "Quien aprueba"}</strong>
            ${aprueba ? "aprobó esta compra desde el correo." : "devolvió esta solicitud desde el correo."}
          </p>
          ${nota ? `<div style="font-size:13.5px;color:#111827;line-height:1.6;padding:12px 14px;background:#F4F7F6;
            border:1px solid #CFE0DC;border-radius:8px;margin:0 0 12px">${nota.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]))}</div>` : ""}
          <p style="margin:0 0 14px;font-size:13px;color:#6B7280">
            ${aprueba ? "Te toca ejecutarla: está en tu tablero de FOREMAN con el detalle y los respaldos."
              : "Te toca completarla y volver a pedir el visto."}
          </p>
          <a href="${process.env.APP_URL || "https://foreman-app-ebon.vercel.app"}" style="display:inline-block;background:#0F3D3E;
            color:#fff;text-decoration:none;padding:10px 18px;border-radius:7px;font-size:14px;font-weight:700">Abrir FOREMAN</a>`,
        pie: "Correo automático de FOREMAN · HCA Studio.",
      }),
    });
  } catch { /* el aviso no puede tumbar la decisión: lo que importa ya se guardó */ }
}

// ── EL VISTO DEL ACTA, DESDE EL CORREO ───────────────────────────────────────
//
// Quien aprueba un acta es del equipo, pero el acta se aprueba a las nueve de
// la noche, leyéndola en el teléfono. Pedirle que entre a FOREMAN para apretar
// un botón es lo que hacía que un acta esperara tres días — y lo que se decidió
// en la reunión no tiene constancia mientras tanto.
//
// Y el paso que viene después se hace acá mismo: mandarla a los involucrados.
// Dar el visto y después tener que volver a la computadora para enviarla es
// partir en dos una sola decisión.

/** El acta que abre esta llave. */
async function actaDelVisto(token) {
  if (!token || String(token).length < 20) return null;
  const limpio = String(token).replace(/[^A-Za-z0-9_-]/g, "");
  if (limpio.length < 20) return null;
  const filas = await json(await rest(`obra_actas?visto_token=eq.${encodeURIComponent(limpio)}&select=*`));
  return filas?.[0] || null;
}

/** El acta entera, que es lo que hace falta para decidir. */
async function actaParaElVisto(req, res, acta) {
  const [lead, asistentes, temas, compromisos] = await Promise.all([
    acta.lead_id ? json(await rest(`leads?id=eq.${acta.lead_id}&select=nombre`)) : [],
    json(await rest(`acta_asistentes?acta_id=eq.${acta.id}&select=id,nombre,empresa,cargo,email,asistio,recibe&order=orden`)),
    json(await rest(`acta_temas?acta_id=eq.${acta.id}&select=*&order=orden`)),
    json(await rest(`acta_compromisos?acta_id=eq.${acta.id}&select=*&order=orden`)),
  ]);

  // Quién puede dar el visto: si es uno solo —lo normal— la página no
  // pregunta nada. Si son varios, hay que saber a nombre de quién queda, y eso
  // no se puede adivinar desde un enlace que les llegó a todos.
  const quienes = await quienesDanElVisto();

  return res.status(200).json({
    acta: {
      id: acta.id, numero: acta.numero, fecha: acta.fecha, lugar: acta.lugar,
      hora_inicio: acta.hora_inicio, hora_fin: acta.hora_fin, estado: acta.estado,
      resumen: acta.resumen, avance_nota: acta.avance_nota,
      proxima_fecha: acta.proxima_fecha, proxima_hora: acta.proxima_hora,
      creado_nombre: acta.creado_nombre, revisada_nombre: acta.revisada_nombre,
      revisada_at: acta.revisada_at, visto_nota: acta.visto_nota,
      enviada_at: acta.enviada_at, tiene_pdf: !!acta.pdf_path,
    },
    obra: lead?.[0]?.nombre || null,
    asistentes, temas, compromisos: (compromisos || []).filter(c => c.estado !== "anulado"),
    aprueban: quienes.map(u => ({ id: u.id, nombre: u.nombre })),
    // A cuántos les llegaría si lo manda desde acá.
    recibirian: (asistentes || []).filter(a => a.recibe !== false && String(a.email || "").trim()).length,
  });
}

/**
 * El visto, o la devolución.
 *
 * Dar el visto hace tres cosas, que son las mismas que hace el botón de
 * FOREMAN: deja el acta `revisada` con el nombre de quien la aprobó, convierte
 * en tareas los compromisos asignados, y la deja lista para enviar. Devolverla
 * la manda a `borrador` con lo que hay que corregir escrito, y eso le llega a
 * quien la escribió: sin el motivo, "devuelta" no se puede arreglar.
 *
 * Y con `enviar` sale a los asistentes, con el PDF que quedó guardado al
 * pedirse el visto. Es el paso siguiente y se hace desde la misma pantalla.
 */
async function decidirElVisto(req, res, acta) {
  const { aprueba, nota, quienId, enviar } = req.body || {};

  if (enviar) return await mandarElActaDesdeElVisto(req, res, acta);

  const limpio = String(nota || "").trim() || null;
  if (!aprueba && !limpio) return res.status(400).json({ error: "Para devolverla hay que escribir qué corregir." });
  if (acta.estado === "enviada") return res.status(400).json({ error: "El acta ya se envió: no se toca más." });

  // Quien aprueba tiene que ser alguien que puede aprobar. El enlace alcanza
  // para entrar, pero el nombre que queda escrito no puede ser cualquiera: es
  // lo único que vale cuando el acta se opone meses después.
  const quienes = await quienesDanElVisto();
  const quien = quienes.find(u => Number(u.id) === Number(quienId)) || (quienes.length === 1 ? quienes[0] : null);
  if (!quien) return res.status(400).json({ error: "Decinos quién está dando el visto." });

  const ahora = new Date().toISOString();

  if (!aprueba) {
    await rest(`obra_actas?id=eq.${acta.id}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ estado: "borrador", visto_nota: limpio }),
    });
    await avisarDeLaDevolucion(acta, quien, limpio);
    return res.status(200).json({ ok: true, estado: "borrador" });
  }

  await rest(`obra_actas?id=eq.${acta.id}`, {
    method: "PATCH", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      estado: "revisada", revisada_at: ahora,
      revisada_por: quien.id, revisada_nombre: quien.nombre, visto_nota: null,
    }),
  });

  const { creadas } = await tareasDeLosCompromisos(acta, quien);
  return res.status(200).json({ ok: true, estado: "revisada", creadas });
}

/**
 * Los compromisos asignados, en el tablero de cada uno.
 *
 * SE CREAN AL DAR EL VISTO, no antes: mientras el acta es borrador lo escrito
 * todavía se puede cambiar, y una tarea que aparece y desaparece del tablero de
 * alguien es peor que ninguna. Es la misma regla que aplica la pantalla del
 * acta (src/modules/actas/aTareas.js) cuando el visto se da desde FOREMAN:
 * solo las asignadas a alguien del equipo y sin tarea creada, porque una tarea
 * en el tablero de nadie es ruido.
 */
async function tareasDeLosCompromisos(acta, quien) {
  const todos = await json(await rest(`acta_compromisos?acta_id=eq.${acta.id}&select=*&order=orden`));
  const van = (todos || []).filter(c => c.asignado_a && !c.tarea_id && c.estado !== "cumplido" && c.estado !== "anulado");
  let creadas = 0;
  for (const c of van) {
    const r = await rest("tasks", {
      method: "POST", headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        title: String(c.texto || "").slice(0, 200), lead_id: acta.lead_id ?? null,
        assignee_id: c.asignado_a, type: "Gestión", due_date: c.fecha_limite || null,
        priority: c.urgente ? "urgente" : "media", status: "en-progreso",
        notes: `Compromiso del acta de reunión N° ${acta.numero}${acta.fecha ? ` del ${acta.fecha}` : ""}`
          + (c.responsable_nombre ? `\nResponsable según el acta: ${c.responsable_nombre}` : ""),
        created_by: quien?.id ?? null,
      }),
    });
    const tarea = (await json(r))[0];
    if (!tarea?.id) continue;
    await rest(`acta_compromisos?id=eq.${c.id}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ tarea_id: tarea.id }),
    }).catch(() => {});
    creadas++;
  }
  return { creadas };
}

/** Lo que hay que corregir, a quien la escribió. Una devolución sin motivo no se arregla. */
async function avisarDeLaDevolucion(acta, quien, nota) {
  try {
    if (!acta.creado_por) return;
    const u = (await json(await rest(`usuarios?id=eq.${acta.creado_por}&select=nombre,email,activo`)))[0];
    if (!u?.email || u.activo === false) return;
    const lead = acta.lead_id ? (await json(await rest(`leads?id=eq.${acta.lead_id}&select=nombre`)))[0] : null;
    await enviarCorreo({
      to: [u.email],
      subject: `Devuelta: Acta N° ${acta.numero}${lead?.nombre ? ` · ${lead.nombre}` : ""}`,
      html: plantilla({
        titulo: `Acta N° ${acta.numero} · hay que corregirla`,
        subtitulo: lead?.nombre || undefined,
        cuerpo: `
          <p style="margin:0 0 12px;font-size:14px;color:#111827">
            <strong>${quien?.nombre || "Quien da el visto"}</strong> devolvió el acta antes de que salga:
          </p>
          <div style="font-size:13.5px;color:#111827;line-height:1.6;padding:12px 14px;background:#FFFBEB;
            border:1px solid #FCD34D;border-radius:8px;margin:0 0 12px">${String(nota).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]))}</div>
          <p style="margin:0 0 14px;font-size:13px;color:#6B7280">
            Volvió a borrador: se puede seguir escribiendo. Cuando esté, volvé a pedir el visto.
          </p>
          <a href="${process.env.APP_URL || "https://foreman-app-ebon.vercel.app"}" style="display:inline-block;background:#0F3D3E;
            color:#fff;text-decoration:none;padding:10px 18px;border-radius:7px;font-size:14px;font-weight:700">Abrir el acta</a>`,
        pie: "Correo automático de FOREMAN · HCA Studio.",
      }),
    });
  } catch { /* el aviso no puede tumbar la devolución: lo que importa ya se guardó */ }
}

/**
 * El acta a los involucrados, desde la misma página del visto.
 *
 * El PDF sale del depósito: lo subió el navegador al pedir el visto, porque es
 * donde está la librería y las fotos firmadas. Acá no hay ninguna de las dos.
 */
async function mandarElActaDesdeElVisto(req, res, acta) {
  if (acta.estado === "enviada") return res.status(400).json({ error: "El acta ya se envió." });
  if (acta.estado !== "revisada") return res.status(400).json({ error: "Primero hay que darle el visto." });

  const asistentes = await json(await rest(`acta_asistentes?acta_id=eq.${acta.id}&select=email,recibe`));
  const para = [...new Set((asistentes || [])
    .filter(a => a.recibe !== false)
    .map(a => String(a.email || "").trim().toLowerCase())
    .filter(Boolean))];
  if (!para.length) return res.status(400).json({ error: "Ninguno de los asistentes tiene correo cargado." });

  let adjunto = null;
  if (acta.pdf_path) {
    try {
      const llave = process.env.SUPABASE_SECRET_KEY || "";
      const resp = await fetch(`${SUPABASE_URL}/storage/v1/object/task-files/${acta.pdf_path}`,
        { headers: { apikey: llave, ...(llave.startsWith("eyJ") ? { Authorization: `Bearer ${llave}` } : {}) } });
      if (resp.ok) {
        const buf = Buffer.from(await resp.arrayBuffer());
        adjunto = { nombre: `Acta ${acta.numero}.pdf`, contenido: buf.toString("base64") };
      }
    } catch { /* sin PDF el acta sale igual: va entera en el cuerpo del correo */ }
  }

  const r = await enviarActa({ actaId: acta.id, para, adjunto, conAnexos: true });
  if (r.codigo !== 200) return res.status(r.codigo).json(r.cuerpo);

  await rest(`obra_actas?id=eq.${acta.id}`, {
    method: "PATCH", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ estado: "enviada", enviada_at: new Date().toISOString(), enviada_a: para }),
  });
  return res.status(200).json({ ok: true, ...r.cuerpo, sinPdf: !adjunto });
}

export default async function handler(req, res) {
  if (!configurado()) return res.status(500).json({ error: "El portal no está configurado." });

  // El visto del acta: lo da quien responde por ella, y lo da desde el correo.
  if (req.query?.visto || (req.body || {}).visto) {
    const t = req.method === "GET" ? req.query?.t : (req.body || {}).token;
    const acta = await actaDelVisto(t);
    if (!acta) return res.status(404).json({ error: "Este enlace no está disponible." });
    if (req.method === "GET") return actaParaElVisto(req, res, acta);
    if (req.method === "POST") return decidirElVisto(req, res, acta);
    return res.status(405).json({ error: "Método no permitido" });
  }

  // La aprobación de una compra —o de cualquier tarea que pide un visto—
  // entra por acá: el que decide es del equipo, pero decide desde el correo.
  if (req.query?.aprobar || (req.body || {}).aprobar) {
    const t = req.method === "GET" ? req.query?.t : (req.body || {}).token;
    const tarea = await aprobacionDeTarea(t);
    if (!tarea) return res.status(404).json({ error: "Este enlace no está disponible." });
    if (req.method === "GET") return tareaParaAprobar(req, res, tarea);
    if (req.method === "POST") return decidirAprobacion(req, res, tarea);
    return res.status(405).json({ error: "Método no permitido" });
  }

  // La orden de cambio entra por la misma puerta con su propia llave.
  if (req.query?.odc || (req.body || {}).odc) {
    const t = req.method === "GET" ? req.query?.t : (req.body || {}).token;
    const firma = await aprobacionDe(t);
    if (!firma) return res.status(404).json({ error: "Este enlace no está disponible." });
    if (req.method === "GET") return ordenParaFirmar(req, res, firma);
    if (req.method === "POST") return firmarOrden(req, res, firma);
    return res.status(405).json({ error: "Método no permitido" });
  }

  // El libro entra por la misma puerta con su propia llave, igual que el acta.
  if (req.query?.libro || (req.body || {}).libro) {
    const t = req.method === "GET" ? req.query?.t : (req.body || {}).token;
    const entrega = await entregaDe(t);
    if (!entrega) return res.status(404).json({ error: "Este enlace no está disponible." });
    if (req.method === "GET") return libroParaFirmar(req, res, entrega);
    if (req.method === "POST") return firmarLibro(req, res, entrega);
    return res.status(405).json({ error: "Método no permitido" });
  }

  // El acta entra por la misma puerta con su propia llave: una función más en
  // /api costaría un despliegue entero del plan, y son doce.
  if (req.query?.acta || (req.body || {}).acta) {
    const t = req.method === "GET" ? req.query?.t : (req.body || {}).token;
    const asistente = await asistenteDe(t);
    if (!asistente) return res.status(404).json({ error: "Este enlace no está disponible." });
    if (req.method === "GET") return actaParaFirmar(req, res, asistente);
    if (req.method === "POST") return firmarActa(req, res, asistente);
    return res.status(405).json({ error: "Método no permitido" });
  }

  const token = req.method === "GET" ? req.query?.t : (req.body || {}).token;
  const lead = await proyectoDe(token);
  // El mismo mensaje para una llave inventada y para un portal apagado: decir
  // cuál de las dos es le confirma a quien prueba llaves que acertó una.
  if (!lead) return res.status(404).json({ error: "Este enlace no está disponible." });

  try {
    if (req.method === "GET") return res.status(200).json(await armarInforme(lead));
    if (req.method === "POST") return await contestar(req, res, lead);
    return res.status(405).json({ error: "Método no permitido" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

async function armarInforme(lead) {
  // Las vueltas CON EL CLIENTE. Las internas no se piden.
  const recorridas = await json(await rest(
    `obra_recorridas?lead_id=eq.${lead.id}&tipo=eq.cliente&select=id,fecha,nota,participantes&order=fecha.desc`)) || [];

  let observaciones = [];
  if (recorridas.length) {
    const ids = recorridas.map(r => r.id).join(",");
    observaciones = await json(await rest(
      `obra_observaciones?recorrida_id=in.(${ids})&visible_cliente=eq.true`
      + `&select=id,recorrida_id,titulo,detalle,ubicacion,estado,prioridad,fecha_visto,`
      + `resuelta_at,cliente_visto_at,cliente_conforme,cliente_nota&order=fecha_visto.desc`)) || [];
  }

  const fotosObs = observaciones.length
    ? await json(await rest(`observacion_fotos?observacion_id=in.(${observaciones.map(o => o.id).join(",")})`
      + `&select=id,observacion_id,momento,storage_path,descripcion&order=id`)) || []
    : [];

  const avance = await json(await rest(
    `obra_avance_fotos?lead_id=eq.${lead.id}&visible_cliente=eq.true`
    + `&select=id,fecha,titulo,descripcion,storage_path&order=fecha.desc&order=id.desc`)) || [];

  // Las órdenes de cambio ya mandadas. Es lo que más importa de todo el
  // portal: plata que se suma al contrato, y hasta hoy el "sí" vivía en un
  // WhatsApp. Solo las enviadas —una en borrador es conversación interna— y
  // con sus partidas y sus fotos, porque aprobar un número sin ver qué lo
  // compone no es aprobar.
  let ordenes = [];
  if (lead.obra_id) {
    ordenes = await json(await rest(
      `ordenes_cambio?obra_id=eq.${lead.obra_id}&estado=in.(enviada,aprobada)`
      + `&select=id,numero,codigo,titulo,tipo,fecha,justificacion,impacto_cronograma,dias_impacto,`
      + `estado,anulada,cliente_acepto,cliente_respondio_at,contratante_comentario&order=numero`)) || [];
    ordenes = ordenes.filter(o => !o.anulada);
  }
  let lineasOC = [], fotosOC = [];
  if (ordenes.length) {
    const ids = ordenes.map(o => o.id).join(",");
    lineasOC = await json(await rest(`orden_cambio_lineas?orden_id=in.(${ids})&select=*&order=id`)) || [];
    fotosOC = await json(await rest(`orden_cambio_fotos?orden_id=in.(${ids})&select=id,orden_id,storage_path,descripcion&order=id`)) || [];
  }

  const entregas = await json(await rest(
    `proyecto_entregas?lead_id=eq.${lead.id}`
    + `&select=id,tipo,titulo,descripcion,archivo_nombre,storage_path,estado,enviado_at,`
    + `cliente_respuesta_at,cliente_nota&order=enviado_at.desc`)) || [];

  const enlaces = await firmar([
    ...fotosObs.map(f => f.storage_path),
    ...avance.map(f => f.storage_path),
    ...entregas.filter(e => e.storage_path).map(e => e.storage_path),
    ...fotosOC.map(f => f.storage_path),
  ].filter(Boolean));

  const conUrl = x => ({ ...x, url: enlaces[x.storage_path] || null, storage_path: undefined });

  return {
    proyecto: { nombre: lead.nombre, cliente: lead.cliente_nombre || null },
    recorridas,
    observaciones: observaciones.map(o => ({
      ...o,
      fotos: fotosObs.filter(f => f.observacion_id === o.id).map(conUrl),
    })),
    avance: avance.map(conUrl),
    entregas: entregas.map(conUrl),
    ordenes: ordenes.map(o => {
      const suyas = lineasOC.filter(l => l.orden_id === o.id);
      const num = v => Number(v) || 0;
      const monto = l => num(l.cantidad) * num(l.precio_unitario) * (l.tipo === "quita" ? -1 : 1);
      return {
        ...o,
        lineas: suyas.map(l => ({
          tipo: l.tipo, item: l.item, descripcion: l.descripcion, unidad: l.unidad,
          cantidad: num(l.cantidad), precio_unitario: num(l.precio_unitario),
          monto: Math.round(monto(l) * 100) / 100,
        })),
        total: Math.round(suyas.reduce((t, l) => t + monto(l), 0) * 100) / 100,
        fotos: fotosOC.filter(f => f.orden_id === o.id).map(conUrl),
      };
    }),
  };
}

async function contestar(req, res, lead) {
  const { que, id, conforme, nota, estado } = req.body || {};
  const cuando = new Date().toISOString();
  const limpia = String(nota || "").trim().slice(0, 2000) || null;

  // El filtro por lead_id va SIEMPRE, además del id: así, mandar el id de una
  // observación de otra obra no escribe nada, en vez de depender de que la
  // pantalla no lo ofrezca.
  if (que === "observacion") {
    const r = await rest(`obra_observaciones?id=eq.${Number(id)}&lead_id=eq.${lead.id}&visible_cliente=eq.true`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ cliente_visto_at: cuando, cliente_conforme: !!conforme, cliente_nota: limpia }),
    });
    const filas = await json(r);
    if (!filas?.length) return res.status(404).json({ error: "No se encontró esa observación." });
    return res.status(200).json({ ok: true });
  }

  if (que === "entrega") {
    const nuevo = estado === "aprobado" ? "aprobado" : "observado";
    // Aprobar sin decir nada está bien; observar sin decir qué, no: una
    // entrega "con observaciones" y sin texto deja a la obra frenada sin
    // saber por qué.
    if (nuevo === "observado" && !limpia) {
      return res.status(400).json({ error: "Contanos qué hay que cambiar." });
    }
    const r = await rest(`proyecto_entregas?id=eq.${Number(id)}&lead_id=eq.${lead.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ estado: nuevo, cliente_respuesta_at: cuando, cliente_visto_at: cuando, cliente_nota: limpia }),
    });
    const filas = await json(r);
    if (!filas?.length) return res.status(404).json({ error: "No se encontró eso." });
    return res.status(200).json({ ok: true });
  }

  if (que === "orden") {
    const acepto = !!conforme;
    if (!acepto && !limpia) return res.status(400).json({ error: "Contanos qué hay que cambiar." });
    // El filtro por la obra del proyecto de la llave, además del id: una orden
    // de otra obra no se encuentra y no se escribe nada.
    const r = await rest(`ordenes_cambio?id=eq.${Number(id)}&obra_id=eq.${lead.obra_id}&estado=eq.enviada`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        cliente_acepto: acepto, cliente_respondio_at: cuando,
        contratante_fecha: cuando.slice(0, 10),
        contratante_comentario: limpia,
      }),
    });
    const filas = await json(r);
    if (!filas?.length) return res.status(404).json({ error: "No se encontró esa orden de cambio." });
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: "No sé qué hacer con eso." });
}
