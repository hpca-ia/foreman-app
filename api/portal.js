import { rest, SUPABASE_URL, configurado } from "./_supabase.js";
import { enviarCorreo, plantilla } from "./_correo.js";

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

export default async function handler(req, res) {
  if (!configurado()) return res.status(500).json({ error: "El portal no está configurado." });

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
