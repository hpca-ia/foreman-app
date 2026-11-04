// api/nova.js — Vercel Serverless Function
import { sesionValida, rest } from "./_supabase.js";
import { consultarRuc, autorizacionDe, hallazgosDe, veredicto, reglaNegocioPopular } from "./_sri.js";

const json = async r => { try { return await r.json(); } catch { return null; } };
import { CONOCIDO } from "./_modelos.js";

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
  const { clave, ruc, montos } = req.body.sri || {};

  // SIN CLAVE DE ACCESO TODAVÍA SE PUEDE PREGUNTAR QUIÉN ES.
  //
  // La revisión del comprobante necesita la clave de 49 dígitos; el catastro
  // del RUC no. Y preguntar quién es el del RUC vale por sí solo: el nombre
  // que trae el papel está escrito de cuatro formas distintas —"AVIANCA
  // ECUADOR S.A.", "Avianca Ecuador S.A.", "AVIANCA ECUADOR, S.A."— y el
  // nombre es lo que junta o parte la cuenta de un proveedor.
  //
  // Se contesta aparte y se dice que es aparte: inventar un veredicto del
  // comprobante sin haberlo consultado sería mentir en el renglón donde más
  // caro sale.
  const claveLimpia = String(clave || "").replace(/\D/g, "");
  if (claveLimpia.length !== 49) {
    const soloRuc = await consultarRuc(ruc);
    if (soloRuc?.error) return res.status(200).json({ estado: "sin_respuesta", hallazgos: [],
      error: soloRuc.error });
    // Sin clave igual se sabe si es negocio popular, y si lo cargado trae IVA.
    // Es justo el caso de las notas de venta de papel, que no tienen clave.
    const popular = reglaNegocioPopular({ ruc: soloRuc.ruc, comprobante: null, montos });
    return res.status(200).json({
      estado: popular.length ? "grave" : "solo_ruc", proveedor: soloRuc.ruc, hallazgos: [...popular, {
        nivel: "aviso", regla: "clave",
        dice: "No se revisó el comprobante: falta la clave de acceso de 49 dígitos.",
        hacer: "Está impresa debajo del código de barras, como NÚMERO DE AUTORIZACIÓN. Copiala y volvé a revisar.",
      }],
    });
  }

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
    montos,
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
  const llamar = async model => {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers, body: JSON.stringify({ ...body, model }),
    });
    let cuerpo = null;
    try { cuerpo = await r.json(); } catch { /* respuesta no-JSON: un 504 de Vercel */ }
    return { estado: r.status, cuerpo };
  };

  // El estado de verdad viaja con la respuesta. Antes se devolvía siempre 200
  // con el error adentro del cuerpo, y entonces un modelo que la cuenta no
  // acepta —o la API caída— llegaban al navegador como "todo bien, acá está tu
  // nada". Por eso NOVA podía dejar de funcionar sin que nadie viera un error.
  const primero = await llamar(body.model || CONOCIDO);

  // SI LA CUENTA RECHAZA EL MODELO, SE REINTENTA CON EL CONOCIDO. Es el mismo
  // criterio que pedirANova del lado del navegador, y acá hace más falta: por
  // esta puerta pasan NOVA por WhatsApp y el resumen diario, que no tienen
  // pantalla donde mostrar un error. Solo reintenta cuando el error habla del
  // modelo; la sesión vencida o la API caída se devuelven tal cual.
  const texto = JSON.stringify(primero.cuerpo?.error || primero.cuerpo || "");
  const esDelModelo = primero.estado >= 400
    && /model|not_found|not found|permission|unsupported|invalid_request/i.test(texto);
  if (!esDelModelo || (body.model || CONOCIDO) === CONOCIDO) return primero;
  const segundo = await llamar(CONOCIDO);
  return { ...segundo, cuerpo: segundo.cuerpo && { ...segundo.cuerpo, cayoAlRespaldo: true } };
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
    const { estado, cuerpo } = await claude(body);
    return res.status(estado).json(cuerpo);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

