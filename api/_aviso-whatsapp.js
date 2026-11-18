// api/_aviso-whatsapp.js — Cómo está el WhatsApp de FOREMAN, y probarlo.
//
// Hernán, 18/11/2026: «es importante ya integrar WhatsApp. ¿Qué pasos damos?».
// Su parte se hace en Meta y en Vercel, fuera de FOREMAN, y son varios pasos
// que fallan en silencio: un token que venció, una plantilla que todavía no
// está aprobada, el webhook sin conectar. Esto es para que FOREMAN diga en qué
// está cada uno, sin tener que adivinarlo mandándole algo a un cliente.
//
// GET  /api/aviso?de=whatsapp
//      → { configurado, falta: [nombres de lo que falta en Vercel], plantilla,
//          webhook, ultimaPrueba }
// GET  /api/aviso?de=whatsapp&lead=15
//      → lo mismo, más `estados`: qué pasó con cada WhatsApp de ese proyecto
//        (enviado · entregado · leído · no llegó), para su registro de
//        aprobaciones.
// POST /api/aviso?de=whatsapp { usuarioId }
//      → manda la plantilla, con datos de prueba, al teléfono de ese usuario.
//        Devuelve textual lo que contestó Meta.
//
// Nunca devuelve el token ni el secreto: de lo que falta, solo el nombre.

import { rest, sesionValida } from "./_supabase.js";
import { configurado, queFalta, PLANTILLA_DEL_PEDIDO, plantillaDelPedido, huecosDelPedido, textoDeLaPlantilla,
  enviarPlantilla, anotarPlantilla, numeroCompleto } from "./_whatsapp.js";

const APP = process.env.APP_URL || "https://foreman-app-ebon.vercel.app";
const crudo = async r => { try { return await r.json(); } catch { return null; } };

async function comoEsta(req, res) {
  const sale = {
    configurado: configurado(), falta: queFalta(),
    plantilla: { ...PLANTILLA_DEL_PEDIDO, ...plantillaDelPedido() },
    webhook: `${APP}/api/whatsapp`,
  };
  // La última prueba: si Meta ya avisó que se entregó, el webhook está conectado.
  const pruebas = await crudo(await rest("whatsapp_mensajes?direccion=eq.sale&plantilla=not.is.null&lead_id=is.null"
    + "&select=usuario_nombre,estado,estado_at,error,created_at&order=created_at.desc&limit=1"));
  // Sin la migración 189 esas columnas no existen: se dice, y lo demás sigue.
  sale.sinMigracion = !Array.isArray(pruebas);
  sale.ultimaPrueba = Array.isArray(pruebas) && pruebas[0] ? pruebas[0] : null;

  const lead = Number(req.query?.lead);
  if (lead) {
    const filas = await crudo(await rest(`whatsapp_mensajes?lead_id=eq.${lead}&direccion=eq.sale&aprobacion_id=not.is.null`
      + "&select=wa_id,aprobacion_id,para_nombre,telefono,estado,estado_at,error,created_at&order=created_at"));
    sale.estados = Array.isArray(filas) ? filas : [];
  }
  return res.status(200).json(sale);
}

async function probar(req, res) {
  if (!configurado()) return res.status(200).json({ ok: false, error: `WhatsApp todavía no está configurado. Falta cargar en Vercel: ${queFalta().join(", ")}.` });
  const { usuarioId } = req.body || {};
  const usuarios = await crudo(await rest(`usuarios?id=eq.${Number(usuarioId)}&activo=eq.true&select=id,nombre,telefono`));
  const usuario = Array.isArray(usuarios) ? usuarios[0] : null;
  if (!usuario) return res.status(404).json({ error: "No se encontró tu usuario." });
  const numero = numeroCompleto(usuario.telefono);
  if (!numero) return res.status(200).json({ ok: false, error: "Tu usuario no tiene un celular cargado: ponelo en Ajustes → Usuarios y probá de nuevo." });

  const { nombre, idioma } = plantillaDelPedido();
  const huecos = huecosDelPedido({ nombre: usuario.nombre, proyecto: "PRUEBA de FOREMAN", punto: "mensaje de prueba (el botón no abre nada)", plazo: "", llave: "prueba" });
  const r = await enviarPlantilla(numero, { nombre, idioma, huecos });
  if (r.error) return res.status(200).json({ ok: false, error: r.error });
  const anotado = await anotarPlantilla({
    wa_id: r.id, telefono: numero, usuario_id: usuario.id, usuario_nombre: usuario.nombre,
    texto: textoDeLaPlantilla(huecos), plantilla: nombre, estado: "enviado", estado_at: new Date().toISOString(),
  });
  return res.status(200).json({ ok: true, enviadoA: usuario.nombre, termina: numero.slice(-4), sinMigracion: !anotado.conEstado });
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  if (!(await sesionValida(req))) return res.status(401).json({ error: "Tu sesión venció. Vuelve a entrar a FOREMAN." });
  try {
    return req.method === "GET" ? await comoEsta(req, res) : await probar(req, res);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
