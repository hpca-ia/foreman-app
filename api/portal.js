import { rest, SUPABASE_URL, configurado } from "./_supabase.js";

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

export default async function handler(req, res) {
  if (!configurado()) return res.status(500).json({ error: "El portal no está configurado." });

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

  const entregas = await json(await rest(
    `proyecto_entregas?lead_id=eq.${lead.id}`
    + `&select=id,tipo,titulo,descripcion,archivo_nombre,storage_path,estado,enviado_at,`
    + `cliente_respuesta_at,cliente_nota&order=enviado_at.desc`)) || [];

  const enlaces = await firmar([
    ...fotosObs.map(f => f.storage_path),
    ...avance.map(f => f.storage_path),
    ...entregas.filter(e => e.storage_path).map(e => e.storage_path),
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

  return res.status(400).json({ error: "No sé qué hacer con eso." });
}
