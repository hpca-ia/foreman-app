// api/nova.js — Vercel Serverless Function

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "20mb",
    },
  },
};

async function claude(body) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  return r.json();
}

function parseJSONSafe(text) {
  text = text.replace(/```json|```/g, "").trim();
  try { return JSON.parse(text); } catch {}
  // Intento 1: cortar en ultimo } completo
  const cut = text.lastIndexOf("}");
  if (cut > 0) {
    try { return JSON.parse(text.slice(0, cut + 1)); } catch {}
  }
  // Intento 2: extraer con regex clave:valor numericos
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const body = req.body;
    if (body._modo === "presupuesto_pdf") return await pdfHandler(req, res, body);
    const data = await claude(body);
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

async function pdfHandler(req, res, body) {
  const { pdfBase64 } = body;

  // PASO 1 — extraer subtotales en formato minimo
  const sys1 = "Analiza este presupuesto. Extrae TODOS los subtotales. Responde SOLO JSON minimo: {\"s\":[{\"n\":\"NOMBRE\",\"v\":123.45}],\"tg\":0,\"th\":0,\"ti\":0}. n=nombre seccion maximo 3 palabras, v=monto. tg=subtotal general, th=con honorarios, ti=total con IVA. Sin texto adicional.";

  const d1 = await claude({
    model: "claude-sonnet-4-6",
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

  const raw1 = d1.content?.[0]?.text || "";
  let p1 = parseJSONSafe(raw1);

  // Fallback regex si el JSON esta cortado
  if (!p1 || !p1.s) {
    const matches = [...raw1.matchAll(/"n"\s*:\s*"([^"]{1,50})"\s*,\s*"v"\s*:\s*([\d.]+)/g)];
    if (!matches.length) return res.status(200).json({ error: "No se pudieron extraer subtotales del PDF." });
    p1 = { s: matches.map(m => ({ n: m[1], v: parseFloat(m[2]) })), tg: 0, th: 0, ti: 0 };
    const tgM = raw1.match(/"tg"\s*:\s*([\d.]+)/);
    const thM = raw1.match(/"th"\s*:\s*([\d.]+)/);
    const tiM = raw1.match(/"ti"\s*:\s*([\d.]+)/);
    if (tgM) p1.tg = parseFloat(tgM[1]);
    if (thM) p1.th = parseFloat(thM[1]);
    if (tiM) p1.ti = parseFloat(tiM[1]);
  }

  const secciones = p1.s || [];
  if (!secciones.length) return res.status(200).json({ error: "Sin subtotales en el PDF." });

  const sumaDetectada = Math.round(secciones.reduce((s, x) => s + (x.v || 0), 0) * 100) / 100;
  const totalObra = p1.tg || sumaDetectada;

  // PASO 2 — agrupar. Mandamos lista compacta y pedimos respuesta compacta
  const lista = secciones.map(s => s.n + "=" + s.v).join("|");

  const sys2 = "Eres experto en presupuestos de construccion Ecuador. Recibiras secciones separadas por | con formato NOMBRE=MONTO. Agrupa las de igual naturaleza en rubros sumando montos. No mezcles: electricas, sanitarias, mobiliario, acabados, seguridad y climatizacion van separados. Responde SOLO JSON compacto: {\"r\":[{\"nm\":\"Nombre Rubro\",\"ct\":\"Categoria\",\"pp\":123.45}],\"tt\":0}";

  const d2 = await claude({
    model: "claude-sonnet-4-6",
    max_tokens: 3000,
    system: sys2,
    messages: [{
      role: "user",
      content: lista + "\n\nTotal obra=$" + totalObra
    }]
  });

  if (d2.error) return res.status(200).json({ error: "Paso2: " + JSON.stringify(d2.error) });

  const raw2 = d2.content?.[0]?.text || "";
  let p2 = parseJSONSafe(raw2);

  // Fallback regex paso 2
  if (!p2 || !p2.r) {
    const matches2 = [...raw2.matchAll(/"nm"\s*:\s*"([^"]+)"\s*,\s*"ct"\s*:\s*"([^"]+)"\s*,\s*"pp"\s*:\s*([\d.]+)/g)];
    if (!matches2.length) return res.status(200).json({ error: "NOVA no pudo agrupar. Intenta de nuevo." });
    p2 = { r: matches2.map(m => ({ nm: m[1], ct: m[2], pp: parseFloat(m[3]) })), tt: totalObra };
  }

  // Convertir formato compacto a formato completo
  const rubros = (p2.r || []).map(r => ({
    nombre: r.nm || r.nombre || "Rubro",
    categoria: r.ct || r.categoria || "General",
    presupuesto: r.pp || r.presupuesto || 0,
    incluye: r.inc || r.incluye || ""
  }));

  if (!rubros.length) return res.status(200).json({ error: "Sin rubros detectados." });

  return res.status(200).json({
    rubros,
    total: totalObra,
    total_con_iva: p1.ti || 0,
    total_honorarios: p1.th || 0,
    secciones_detectadas: secciones.length,
    suma_detectada: sumaDetectada,
    observaciones: secciones.length + " secciones → " + rubros.length + " rubros | Subtotal: $" + totalObra
  });
}
