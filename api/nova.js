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
  const cut = text.lastIndexOf("}");
  if (cut > 0) {
    try { return JSON.parse(text.slice(0, cut + 1)); } catch {}
  }
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
  const sys1 = "Analiza este presupuesto. Extrae TODOS los subtotales. Responde SOLO JSON: {\"s\":[{\"n\":\"NOMBRE\",\"v\":123.45}],\"tg\":0,\"th\":0,\"ti\":0}. n=nombre seccion max 4 palabras, v=monto subtotal. tg=subtotal general obra, th=con honorarios, ti=total con IVA. Sin texto extra.";

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

  // Fallback regex
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

  // PASO 2 — agrupar devolviendo los subgrupos de cada rubro
  const lista = secciones.map((s, i) => i + ":" + s.n + "=" + s.v).join("|");

  const sys2 = "Eres experto en presupuestos de construccion Ecuador. Recibiras secciones con formato INDICE:NOMBRE=MONTO separadas por |. Agrupa las de igual naturaleza en rubros sumando montos. No mezcles: electricas, sanitarias, mobiliario, acabados, seguridad, climatizacion van separados. IMPORTANTE: en el campo ids incluye los indices de las secciones que pertenecen a ese rubro. Responde SOLO JSON: {\"r\":[{\"nm\":\"Nombre\",\"ct\":\"Categoria\",\"ids\":[0,1,2]}],\"tt\":0}";

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

  if (!p2 || !p2.r || !p2.r.length) {
    return res.status(200).json({ error: "NOVA no pudo agrupar. Intenta de nuevo." });
  }

  // Construir rubros con subgrupos y montos calculados exactamente
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

  // Verificar secciones huerfanas (no asignadas a ningun rubro)
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
