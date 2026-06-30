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
  // Remove last incomplete object
  const lastComma = t.lastIndexOf(",{");
  if (lastComma > 0) t = t.slice(0, lastComma);
  // Close array and object
  if (!t.includes('"total_general"')) t += '],"total_general":0}';
  else if (!t.endsWith("}")) t += "}";
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

  // PASO 1 — extraer subtotales en formato ultra-compacto
  const sys1 = "Eres NOVA. Del presupuesto adjunto extrae TODOS los subtotales de TODAS las secciones y areas. Formato COMPACTO, nombres cortos. Responde UNICAMENTE este JSON sin ningun texto antes ni despues: {\"s\":[{\"a\":\"area\",\"n\":\"seccion\",\"v\":1234.56}],\"tg\":0,\"th\":0,\"ti\":0} donde a=area/planta, n=nombre seccion, v=valor, tg=total general, th=total con honorarios, ti=total con IVA.";

  const d1 = await claude({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    system: sys1,
    messages: [{
      role: "user",
      content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
        { type: "text", text: "TODOS los subtotales en formato compacto. Solo JSON." }
      ]
    }]
  });

  if (d1.error) return res.status(200).json({ error: "API: " + JSON.stringify(d1.error) });

  let t1 = repairJSON(d1.content?.[0]?.text || "{}");
  let p1;
  try { p1 = JSON.parse(t1); }
  catch (e) { return res.status(200).json({ error: "Parse paso1: " + e.message + " | Respuesta: " + t1.slice(0,200) }); }

  const secciones = p1.s || [];
  if (!secciones.length) return res.status(200).json({ error: "No se encontraron subtotales en el PDF." });

  // PASO 2 — agrupar (solo texto, sin PDF)
  const lista = secciones.map(s => (s.a ? "["+s.a+"] " : "") + s.n + " = $" + s.v).join("\n");

  const sys2 = "Eres NOVA experto en presupuestos de construccion Ecuador. Agrupa las secciones de igual naturaleza en rubros principales SUMANDO montos. Reglas: nunca juntes electricas+sanitarias, mobiliario+acabados, seguridad+climatizacion. Responde SOLO JSON: {\"rubros\":[{\"nombre\":\"...\",\"categoria\":\"...\",\"presupuesto\":0,\"incluye\":\"...\"}],\"total\":0}";

  const d2 = await claude({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    system: sys2,
    messages: [{
      role: "user",
      content: "Agrupa estas " + secciones.length + " secciones en rubros principales:\n\n" + lista +
        "\n\nTotales: subtotal=$" + (p1.tg||0) + " | honorarios=$" + (p1.th||0) + " | IVA=$" + (p1.ti||0)
    }]
  });

  if (d2.error) return res.status(200).json({ error: "Paso2: " + JSON.stringify(d2.error) });

  let t2 = repairJSON(d2.content?.[0]?.text || "{}");
  let p2;
  try { p2 = JSON.parse(t2); }
  catch (e) { return res.status(200).json({ error: "Parse paso2: " + e.message }); }

  if (!p2.rubros?.length) return res.status(200).json({ error: "NOVA no pudo agrupar los rubros." });

  return res.status(200).json({
    rubros: p2.rubros,
    total: p2.total || p1.tg || 0,
    total_con_iva: p1.ti || 0,
    total_honorarios: p1.th || 0,
    secciones_detectadas: secciones.length,
    observaciones: secciones.length + " secciones → " + p2.rubros.length + " rubros"
  });
}
