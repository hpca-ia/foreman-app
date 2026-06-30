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

function repairJSON(t) {
  t = t.replace(/```json|```/g, "").trim();
  if (t.endsWith("}")) return t;
  // Remove last incomplete object (cut mid-way)
  const lastGood = t.lastIndexOf("},");
  const lastClose = t.lastIndexOf("}");
  const cutAt = Math.max(lastGood, lastClose);
  if (cutAt > 0) t = t.slice(0, cutAt + 1);
  // Close open structures
  if (!t.includes('"tg"') && !t.includes('"total_general"')) {
    if (t.includes('"s":[') || t.includes('"secciones":[')) t += '],"tg":0,"th":0,"ti":0}';
    else t += '}';
  } else {
    t += '}';
  }
  return t;
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

  // PASO 1a — primera mitad del presupuesto (paginas 1-8)
  // PASO 1b — segunda mitad (paginas 9-fin)
  // Luego combinar y agrupar

  // Intentar extraer todos los subtotales en una sola llamada con tokens altos
  const sys1 = "Eres NOVA. Analiza este presupuesto y extrae TODOS los subtotales. Usa formato MINIMO. Responde SOLO JSON: {\"s\":[{\"n\":\"SECCION\",\"v\":123.45}],\"tg\":0,\"th\":0,\"ti\":0} donde n=nombre seccion (maximo 4 palabras), v=monto subtotal numerico. Incluye ABSOLUTAMENTE TODOS los subtotales del documento completo sin omitir ninguno. Los totales finales van en tg=subtotal general obra, th=con honorarios, ti=con IVA.";

  const d1 = await claude({
    model: "claude-sonnet-4-6",
    max_tokens: 6000,
    system: sys1,
    messages: [{
      role: "user",
      content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
        { type: "text", text: "Lista TODOS los subtotales. Formato minimo. Solo JSON. No omitas ninguno." }
      ]
    }]
  });

  if (d1.error) return res.status(200).json({ error: "API paso1: " + JSON.stringify(d1.error) });

  let t1 = repairJSON(d1.content?.[0]?.text || "{}");
  let p1;
  try {
    p1 = JSON.parse(t1);
  } catch (e) {
    // Si sigue fallando, intentar extraer lo que se pueda con regex
    const raw = d1.content?.[0]?.text || "";
    const matches = [...raw.matchAll(/"n"\s*:\s*"([^"]+)"\s*,\s*"v"\s*:\s*([\d.]+)/g)];
    if (matches.length > 0) {
      p1 = { s: matches.map(m => ({ n: m[1], v: parseFloat(m[2]) })), tg: 0, th: 0, ti: 0 };
      // Intentar extraer totales
      const tgMatch = raw.match(/"tg"\s*:\s*([\d.]+)/);
      const thMatch = raw.match(/"th"\s*:\s*([\d.]+)/);
      const tiMatch = raw.match(/"ti"\s*:\s*([\d.]+)/);
      if (tgMatch) p1.tg = parseFloat(tgMatch[1]);
      if (thMatch) p1.th = parseFloat(thMatch[1]);
      if (tiMatch) p1.ti = parseFloat(tiMatch[1]);
    } else {
      return res.status(200).json({ error: "No se pudieron extraer subtotales: " + e.message });
    }
  }

  const secciones = p1.s || [];
  if (!secciones.length) return res.status(200).json({ error: "No se encontraron subtotales en el PDF." });

  // Calcular suma de lo que tenemos
  const sumaDetectada = secciones.reduce((s, x) => s + (x.v || 0), 0);

  // PASO 2 — agrupar en rubros
  const lista = secciones.map(s => s.n + " = $" + s.v).join("\n");

  const sys2 = "Eres NOVA experto en presupuestos de construccion Ecuador. Agrupa secciones de igual naturaleza en rubros principales SUMANDO montos exactamente. Reglas: no juntes electricas+sanitarias, mobiliario+acabados, seguridad+climatizacion. Nombres profesionales. Responde SOLO JSON: {\"rubros\":[{\"nombre\":\"...\",\"categoria\":\"...\",\"presupuesto\":0,\"incluye\":\"...\"}],\"total\":0}";

  const d2 = await claude({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    system: sys2,
    messages: [{
      role: "user",
      content: "Agrupa estas " + secciones.length + " secciones en rubros (suma exacta = $" + sumaDetectada.toFixed(2) + "):\n\n" + lista +
        "\n\nTotales presupuesto: subtotal obra=$" + (p1.tg || sumaDetectada).toFixed(2) +
        " | con honorarios=$" + (p1.th || 0) +
        " | con IVA=$" + (p1.ti || 0) +
        "\nEl campo total del JSON debe ser $" + (p1.tg || sumaDetectada).toFixed(2)
    }]
  });

  if (d2.error) return res.status(200).json({ error: "Paso2: " + JSON.stringify(d2.error) });

  let t2 = repairJSON(d2.content?.[0]?.text || "{}");
  let p2;
  try { p2 = JSON.parse(t2); }
  catch (e) { return res.status(200).json({ error: "Parse paso2: " + e.message }); }

  if (!p2.rubros?.length) return res.status(200).json({ error: "NOVA no pudo agrupar los rubros." });

  const totalObra = p1.tg || sumaDetectada;

  return res.status(200).json({
    rubros: p2.rubros,
    total: totalObra,
    total_con_iva: p1.ti || 0,
    total_honorarios: p1.th || 0,
    secciones_detectadas: secciones.length,
    suma_detectada: sumaDetectada,
    observaciones: secciones.length + " secciones → " + p2.rubros.length + " rubros | Subtotal obra: $" + totalObra.toFixed(2)
  });
}
