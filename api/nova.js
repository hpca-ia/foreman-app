// api/nova.js — Vercel Serverless Function
// Proxy para Anthropic API con soporte para PDF completo

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "20mb",
    },
  },
};

async function llamarClaude(body) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  return response.json();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body;

    // Modo especial: analisis completo de presupuesto PDF
    if (body._modo === "presupuesto_pdf") {
      return await procesarPresupuestoPDF(req, res, body);
    }

    // Modo normal: proxy directo a Anthropic
    const data = await llamarClaude(body);
    return res.status(200).json(data);

  } catch (error) {
    console.error("Nova API error:", error);
    return res.status(500).json({ error: "Error: " + error.message });
  }
}

async function procesarPresupuestoPDF(req, res, body) {
  const { pdfBase64 } = body;

  // PASO 1: Extraer TODOS los subtotales del PDF completo
  // Usamos claude-opus que tiene mayor contexto
  const paso1 = await llamarClaude({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    system: "Eres NOVA experto en presupuestos de construccion. Analiza el presupuesto COMPLETO adjunto. Extrae TODAS las lineas de SUBTOTAL de CADA seccion en TODAS las plantas/areas del documento. Incluye absolutamente todos los subtotales, no omitas ninguno. Responde SOLO JSON: {"secciones":[{"area":"nombre del area o planta","nombre":"NOMBRE SECCION","subtotal":1234.56}],"total_general":9999.99,"total_con_honorarios":9999.99,"total_con_iva":9999.99}",
    messages: [{
      role: "user",
      content: [
        {
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: pdfBase64
          }
        },
        {
          type: "text",
          text: "Extrae TODOS los SUBTOTALES de TODAS las secciones y areas del presupuesto. Incluye el total general, honorarios e IVA si los hay. Solo JSON."
        }
      ]
    }]
  });

  if (paso1.error) {
    return res.status(200).json({ error: "Paso 1 fallido: " + JSON.stringify(paso1.error) });
  }

  let t1 = (paso1.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim();

  // Reparar JSON cortado si es necesario
  if (!t1.endsWith("}")) {
    const li = t1.lastIndexOf("}");
    if (li > 0) {
      t1 = t1.slice(0, li + 1);
      if (!t1.includes('"total_general"')) {
        t1 = t1.replace(/\]\s*$/, '],"total_general":0}');
      }
    }
  }

  let paso1Data;
  try {
    paso1Data = JSON.parse(t1);
  } catch {
    return res.status(200).json({ error: "Error parseando subtotales. Intenta de nuevo." });
  }

  if (!paso1Data.secciones?.length) {
    return res.status(200).json({ error: "No se encontraron subtotales en el PDF." });
  }

  // PASO 2: Agrupar secciones en rubros principales
  const seccText = paso1Data.secciones
    .map(s => (s.area ? "[" + s.area + "] " : "") + s.nombre + " = $" + s.subtotal)
    .join("\n");

  const paso2 = await llamarClaude({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    system: "Eres NOVA experto en presupuestos de construccion en Ecuador. Agrupa las secciones de la misma naturaleza en rubros principales SUMANDO sus montos de TODAS las areas/plantas. Reglas: nunca juntes electricas con sanitarias, ni mobiliario con acabados, ni seguridad con climatizacion. Da nombres claros y profesionales. Responde SOLO JSON: {"rubros":[{"nombre":"...","categoria":"...","presupuesto":123.45,"incluye":"secciones que agrupa"}],"total":0}",
    messages: [{
      role: "user",
      content: "Agrupa estas secciones en rubros principales sumando montos de todas las areas:\n\n" + seccText +
        "\n\nTotales del presupuesto:" +
        "\n- Subtotal general: $" + (paso1Data.total_general || 0) +
        "\n- Con honorarios: $" + (paso1Data.total_con_honorarios || 0) +
        "\n- Total con IVA: $" + (paso1Data.total_con_iva || 0)
    }]
  });

  if (paso2.error) {
    return res.status(200).json({ error: "Paso 2 fallido: " + JSON.stringify(paso2.error) });
  }

  let t2 = (paso2.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim();
  if (!t2.endsWith("}")) {
    t2 = t2.slice(0, t2.lastIndexOf("}") + 1) + "}";
  }

  let paso2Data;
  try {
    paso2Data = JSON.parse(t2);
  } catch {
    return res.status(200).json({ error: "Error parseando rubros. Intenta de nuevo." });
  }

  return res.status(200).json({
    rubros: paso2Data.rubros || [],
    total: paso2Data.total || paso1Data.total_general || 0,
    total_con_iva: paso1Data.total_con_iva || 0,
    total_honorarios: paso1Data.total_con_honorarios || 0,
    secciones_detectadas: paso1Data.secciones.length,
    observaciones: paso1Data.secciones.length + " secciones en todas las areas agrupadas en " + (paso2Data.rubros?.length || 0) + " rubros"
  });
}
