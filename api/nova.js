// api/nova.js — Vercel Serverless Function
import { sesionValida, rest } from "./_supabase.js";
import { consultarRuc, autorizacionDe, hallazgosDe, veredicto } from "./_sri.js";

const json = async r => { try { return await r.json(); } catch { return null; } };
import { JUICIO, LECTURA } from "./_modelos.js";

// El texto de una respuesta de NOVA. No es content[0]: un modelo con
// razonamiento extendido devuelve primero un bloque "thinking" y leer el
// primero da undefined, con la respuesta buena ahí al lado.
const textoDeNova = d => (Array.isArray(d?.content)
  ? d.content.filter(b => b?.type === "text").map(b => b.text).join("") || d.content[0]?.text || ""
  : "");

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "20mb",
    },
  },
  // CUÁNTO LA DEJAMOS PENSAR.
  //
  // Sin esto la puerta de NOVA se corta a los diez segundos, que es el default.
  // Diez segundos alcanzan para leer una factura y no alcanzan ni de lejos
  // para armar un cronograma: el modelo razona, escribe veinte actividades con
  // sus dependencias y su porqué, y eso lleva un minuto largo. Lo que se veía
  // del otro lado era "NOVA no pudo armarlo" sin ninguna explicación, porque
  // un corte del servidor no devuelve JSON: devuelve una página de error que
  // no tiene adentro ningún mensaje que mostrar.
  //
  // Sesenta es el techo del plan, y es lo que ya usan el respaldo y los crons.
  maxDuration: 60,
};

/**
 * ¿Esta factura la va a aceptar el SRI?
 *
 * Se le pregunta al SRI dos cosas: quién es el proveedor en el catastro del
 * RUC, y qué autorizó de este comprobante. Lo segundo devuelve el XML
 * autorizado, que es el documento legal: el papel que trae el proveedor es una
 * representación impresa y puede decir cualquier cosa.
 *
 * La clave de acceso la lee NOVA del papel. Sin ella no hay revisión posible y
 * se dice así, en vez de devolver un "todo bien" que no se revisó.
 */
async function revisarEnSri(req, res) {
  const { clave, ruc } = req.body.sri || {};
  const [auth, catastro, ajuste] = await Promise.all([
    autorizacionDe(clave),
    consultarRuc(ruc || String(clave || "").slice(10, 23)),
    json(await rest("ajustes_oficina?clave=eq.empresa&select=valor")),
  ]);
  if (auth?.error && catastro?.error) return res.status(502).json({ error: auth.error });

  const hallazgos = hallazgosDe({
    ruc: catastro?.ruc || null,
    comprobante: auth?.comprobante || null,
    autorizacion: auth || null,
    rucPropio: ajuste?.[0]?.valor?.ruc || null,
  });
  return res.status(200).json({
    estado: veredicto(hallazgos), hallazgos,
    proveedor: catastro?.ruc || null,
    comprobante: auth?.comprobante || null,
    autorizacion: auth ? { estado: auth.estado, ambiente: auth.ambiente, fechaAutorizacion: auth.fechaAutorizacion } : null,
    ...(auth?.error ? { avisoServidor: auth.error } : {}),
    ...(catastro?.error ? { avisoCatastro: catastro.error } : {}),
  });
}

async function claude(body) {
  // Check if any message contains a PDF document
  const hasPDF = body.messages?.some(m =>
    Array.isArray(m.content) && m.content.some(c => c.type === "document")
  );
  const headers = {
    "Content-Type": "application/json",
    "x-api-key": process.env.ANTHROPIC_API_KEY,
    "anthropic-version": "2023-06-01",
  };
  if (hasPDF) headers["anthropic-beta"] = "pdfs-2024-09-25";
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  // El estado de verdad viaja con la respuesta. Antes se devolvía siempre 200
  // con el error adentro del cuerpo, y entonces un modelo que la cuenta no
  // acepta —o la API caída— llegaban al navegador como "todo bien, acá está tu
  // nada". Por eso NOVA podía dejar de funcionar sin que nadie viera un error.
  return { estado: r.status, cuerpo: await r.json() };
}

function parseJSONSafe(text) {
  text = text.replace(/```json|```/g, "").trim();
  try { return JSON.parse(text); } catch {}
  const cut = text.lastIndexOf("}");
  if (cut > 0) {
    try { return JSON.parse(text.slice(0, cut + 1)); } catch {}
  }
  return null;
}

export default async function handler(req, res) {
  // Solo quien entró a FOREMAN: si no, cualquiera podría gastar el crédito de NOVA.
  if (!(await sesionValida(req))) return res.status(401).json({ error: "Tu sesión venció. Vuelve a entrar a FOREMAN." });
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // LA REVISIÓN EN EL SRI ENTRA POR ACÁ.
  //
  // No usa el modelo: son dos consultas públicas al SRI y una comparación. Pero
  // entra por esta puerta porque es parte de leer una factura —lo que la
  // pantalla llama "que NOVA la lea"— y porque una función más en /api cuesta
  // un despliegue entero del plan, que son doce.
  if (req.body?.sri) return await revisarEnSri(req, res);

  try {
    const body = req.body;
    if (body._modo === "presupuesto_pdf") return await pdfHandler(req, res, body);
    const { estado, cuerpo } = await claude(body);
    return res.status(estado).json(cuerpo);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

async function pdfHandler(req, res, body) {
  const { pdfBase64 } = body;

  const sys1 = "Analiza este presupuesto. Extrae TODOS los subtotales. Responde SOLO JSON: {\"s\":[{\"n\":\"NOMBRE\",\"v\":123.45}],\"tg\":0,\"th\":0,\"ti\":0}. n=nombre seccion max 4 palabras, v=monto subtotal. tg=subtotal general obra, th=con honorarios, ti=total con IVA. Sin texto extra.";

  const { cuerpo: d1 } = await claude({
    model: LECTURA,
    max_tokens: 6000,
    system: sys1,
    messages: [{
      role: "user",
      content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
        { type: "text", text: "TODOS los subtotales. Solo JSON compacto." }
      ]
    }]
  });

  if (d1.error) return res.status(200).json({ error: "API: " + JSON.stringify(d1.error) });

  const raw1 = textoDeNova(d1) || "";
  let p1 = parseJSONSafe(raw1);

  if (!p1 || !p1.s) {
    const matches = [...raw1.matchAll(/"n"\s*:\s*"([^"]{1,60})"\s*,\s*"v"\s*:\s*([\d.]+)/g)];
    if (!matches.length) return res.status(200).json({ error: "No se pudieron extraer subtotales." });
    p1 = { s: matches.map(m => ({ n: m[1], v: parseFloat(m[2]) })), tg: 0, th: 0, ti: 0 };
    const tgM = raw1.match(/"tg"\s*:\s*([\d.]+)/); if (tgM) p1.tg = parseFloat(tgM[1]);
    const thM = raw1.match(/"th"\s*:\s*([\d.]+)/); if (thM) p1.th = parseFloat(thM[1]);
    const tiM = raw1.match(/"ti"\s*:\s*([\d.]+)/); if (tiM) p1.ti = parseFloat(tiM[1]);
  }

  const secciones = p1.s || [];
  if (!secciones.length) return res.status(200).json({ error: "Sin subtotales en el PDF." });

  const sumaDetectada = Math.round(secciones.reduce((s, x) => s + (x.v || 0), 0) * 100) / 100;
  const totalObra = p1.tg || sumaDetectada;

  const lista = secciones.map((s, i) => i + ":" + s.n + "=" + s.v).join("|");

  const sys2 = "Eres experto en presupuestos de construccion Ecuador. Recibiras secciones con formato INDICE:NOMBRE=MONTO separadas por |. Agrupa las de igual naturaleza en rubros sumando montos. No mezcles: electricas, sanitarias, mobiliario, acabados, seguridad, climatizacion van separados. IMPORTANTE: en el campo ids incluye los indices de las secciones que pertenecen a ese rubro. Responde SOLO JSON: {\"r\":[{\"nm\":\"Nombre\",\"ct\":\"Categoria\",\"ids\":[0,1,2]}],\"tt\":0}";

  const { cuerpo: d2 } = await claude({
    model: JUICIO,
    max_tokens: 3000,
    system: sys2,
    messages: [{
      role: "user",
      content: lista + "\n\nTotal obra=$" + totalObra
    }]
  });

  if (d2.error) return res.status(200).json({ error: "Paso2: " + JSON.stringify(d2.error) });

  const raw2 = textoDeNova(d2) || "";
  let p2 = parseJSONSafe(raw2);

  if (!p2 || !p2.r || !p2.r.length) {
    return res.status(200).json({ error: "NOVA no pudo agrupar. Intenta de nuevo." });
  }

  const rubros = p2.r.map(r => {
    const ids = r.ids || [];
    const subgrupos = ids
      .filter(i => i >= 0 && i < secciones.length)
      .map(i => ({ nombre: secciones[i].n, monto: secciones[i].v, idx: i }));
    const presupuesto = Math.round(subgrupos.reduce((s, sg) => s + sg.monto, 0) * 100) / 100;
    return {
      nombre: r.nm || "Rubro",
      categoria: r.ct || "General",
      presupuesto,
      subgrupos,
      incluye: subgrupos.map(sg => sg.nombre).join(", ")
    };
  });

  const asignados = new Set(rubros.flatMap(r => r.subgrupos.map(sg => sg.idx)));
  const huerfanos = secciones
    .map((s, i) => ({ ...s, idx: i }))
    .filter(s => !asignados.has(s.idx));

  if (huerfanos.length > 0) {
    rubros.push({
      nombre: "Sin clasificar",
      categoria: "Varios",
      presupuesto: Math.round(huerfanos.reduce((s, h) => s + h.v, 0) * 100) / 100,
      subgrupos: huerfanos.map(h => ({ nombre: h.n, monto: h.v, idx: h.idx })),
      incluye: huerfanos.map(h => h.n).join(", ")
    });
  }

  const totalCalculado = Math.round(rubros.reduce((s, r) => s + r.presupuesto, 0) * 100) / 100;

  return res.status(200).json({
    rubros,
    secciones,
    total: totalObra,
    total_calculado: totalCalculado,
    total_con_iva: p1.ti || 0,
    total_honorarios: p1.th || 0,
    secciones_detectadas: secciones.length,
    observaciones: secciones.length + " secciones → " + rubros.length + " rubros | $" + totalCalculado
  });
}
