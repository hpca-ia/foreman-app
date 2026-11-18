// El WhatsApp que FOREMAN le manda a un cliente. Hernán, 18/11/2026: «es
// importante ya integrar WhatsApp. ¿Qué pasos damos?» —y, antes, del pedido de
// aprobación: «cada vez que se solicite una aprobación FOREMAN manda un
// mensaje al cliente, por WhatsApp y correo»—.
//
// Lo de él se hace en Meta y en Vercel. Lo de FOREMAN es esto: mandar la
// plantilla, anotar a quién, saber si llegó, y no dejar a un cliente que
// contesta hablando solo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PLANTILLA_DEL_PEDIDO, plantillaDelPedido, queFalta, paraHueco, nombreDePila, huecosDelPedido, textoDeLaPlantilla,
  cuerpoDePlantilla, errorDeMeta, errorDeEntrega, numeroCompleto } from "../api/_whatsapp.js";
import { cambioPorEntrega, respuestaAlCliente, ESTADO_DE_META, VIENE_DE } from "../api/_whatsappDeClientes.js";
import { losWhatsApp } from "../api/_aviso-pedido.js";
import { registroDeAprobaciones, registroParaPdf, avisoDice, whatsappDice, paraWhatsApp } from "../src/modules/leads/aprobaciones.js";
import { dichoAdentro } from "../src/modules/leads/historialDeTarea.js";

const leer = ruta => readFileSync(new URL(ruta, import.meta.url), "utf8");
const codigoDe = ruta => leer(ruta).split("\n").filter(l => !l.trim().startsWith("//")).join("\n");

test("la plantilla que se carga en Meta: cuatro huecos, el botón al enlace, y lo que se manda calza con ella", () => {
  const p = PLANTILLA_DEL_PEDIDO;
  assert.equal(p.nombre, "pedido_de_aprobacion");
  assert.equal(p.idioma, "es");
  // Los huecos, numerados y sin saltarse ninguno.
  assert.deepEqual(p.cuerpo.match(/\{\{\d\}\}/g), ["{{1}}", "{{2}}", "{{3}}", "{{4}}"]);
  // Meta no acepta que el cuerpo empiece ni termine con un hueco.
  assert.equal(/^\{\{/.test(p.cuerpo) || /\}\}$/.test(p.cuerpo), false);
  // El botón lleva al enlace del cliente: la dirección fija, y la llave al final.
  assert.equal(p.boton.url, "https://foreman-app-ebon.vercel.app/?cliente={{1}}");
  assert.ok(p.boton.texto.length <= 25, "el texto de un botón tiene tope de 25 letras");
  // Una muestra por cada hueco, que Meta pide para revisarla.
  assert.equal(p.ejemplos.cuerpo.length, 4);

  const huecos = huecosDelPedido({ nombre: "XAVIER BURBANO", proyecto: "RES BG", punto: "Plano de cocina", plazo: "hasta el sábado, 21 de noviembre", llave: "abc123" });
  assert.deepEqual(huecos, { cuerpo: ["Xavier", "RES BG", "Plano de cocina", "hasta el sábado, 21 de noviembre"], boton: "abc123" });
  assert.equal(textoDeLaPlantilla(huecos),
    "Hola Xavier, en el proyecto RES BG necesitamos tu aprobación de: Plano de cocina.\n\nPlazo: hasta el sábado, 21 de noviembre.\n\n"
    + "Se revisa y se aprueba desde el botón de abajo, sin usuario ni contraseña. La respuesta queda registrada con la fecha.");
  assert.deepEqual(cuerpoDePlantilla({ a: "+593 99 111 2222", nombre: p.nombre, idioma: p.idioma, huecos }), {
    messaging_product: "whatsapp", to: "593991112222", type: "template",
    template: { name: "pedido_de_aprobacion", language: { code: "es" }, components: [
      { type: "body", parameters: ["Xavier", "RES BG", "Plano de cocina", "hasta el sábado, 21 de noviembre"].map(text => ({ type: "text", text })) },
      { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "abc123" }] },
    ] },
  });
  // Si en Meta quedó con otro nombre o idioma, se cambia en Vercel sin tocar el código.
  assert.deepEqual(plantillaDelPedido(), { nombre: "pedido_de_aprobacion", idioma: "es" });
});

test("un hueco nunca va vacío, ni con un salto de línea: Meta rechaza el mensaje entero", () => {
  assert.equal(paraHueco("Plano\nde\tcocina    rev. 2"), "Plano de cocina rev. 2");
  assert.equal(paraHueco(""), "-");
  assert.equal(paraHueco(null), "-");
  assert.equal(paraHueco("x".repeat(300), 20).length, 20);
  assert.ok(paraHueco("x".repeat(300), 20).endsWith("…"));
  // Sin plazo y sin nombre, la frase se sigue leyendo.
  assert.deepEqual(huecosDelPedido({ proyecto: "RES BG", punto: "FOGA" }).cuerpo, ["qué tal", "RES BG", "FOGA", "sin fecha límite"]);
  assert.equal(nombreDePila("  maría josé pérez "), "María");
  assert.equal(nombreDePila(""), "");
});

test("el número sale con el código de país, que es como lo quiere Meta", () => {
  assert.equal(numeroCompleto("0991112222"), "593991112222");
  assert.equal(numeroCompleto("099 111 2222"), "593991112222");
  assert.equal(numeroCompleto("991112222"), "593991112222");
  assert.equal(numeroCompleto("+593 99 111 2222"), "593991112222");
  assert.equal(numeroCompleto("00593991112222"), "593991112222");
  assert.equal(numeroCompleto("2345678"), "");
  assert.equal(numeroCompleto(""), "");
  // Lo mismo que arma la pantalla para el botón de WhatsApp.
  for (const t of ["0991112222", "991112222", "+593 99 111 2222", "022345678", ""]) assert.equal(numeroCompleto(t), paraWhatsApp(t), t);
  // A quién se le escribe: sin repetir, y solo lo que es un celular.
  assert.deepEqual(losWhatsApp([{ nombre: " Xavier ", telefono: "593991112222" }, { nombre: "Otra vez", telefono: "+593 99 111 2222" }, { nombre: "Corto", telefono: "123" }, null]),
    [{ nombre: "Xavier", telefono: "593991112222" }]);
});

test("lo que falta se dice por su nombre, nunca con su valor", () => {
  assert.deepEqual(queFalta({}), ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_ID", "WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN"]);
  assert.deepEqual(queFalta({ WHATSAPP_TOKEN: "x", WHATSAPP_PHONE_ID: "1" }), ["WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN"]);
  assert.deepEqual(queFalta({ WHATSAPP_TOKEN: "x", WHATSAPP_PHONE_ID: "1", WHATSAPP_APP_SECRET: "s", WHATSAPP_VERIFY_TOKEN: "v" }), []);
  // El estado que lee la pantalla no devuelve ni el token ni el secreto.
  const estado = codigoDe("../api/_aviso-whatsapp.js");
  assert.equal(/process\.env\.WHATSAPP_(TOKEN|APP_SECRET|VERIFY_TOKEN)/.test(estado), false);
  const puerta = estado.slice(estado.indexOf("export default async function handler"));
  assert.ok(puerta.indexOf("sesionValida(req)") > 0 && puerta.indexOf("sesionValida(req)") < puerta.indexOf("comoEsta(req, res)"), "primero la sesión");
});

test("cuando Meta no lo manda, se dice qué hacer y además lo que contestó", () => {
  const sinPlantilla = errorDeMeta(404, JSON.stringify({ error: { message: "(#132001) Template name does not exist in the translation", code: 132001, error_data: { details: "template name (pedido_de_aprobacion) does not exist in es" } } }));
  assert.equal(sinPlantilla.codigo, 132001);
  assert.equal(sinPlantilla.error, "Meta no encuentra la plantilla: todavía no está cargada o aprobada con ese nombre y en ese idioma. (Meta: template name (pedido_de_aprobacion) does not exist in es)");
  assert.match(errorDeMeta(401, { error: { message: "Error validating access token", code: 190 } }).error, /^El token de WhatsApp venció o no sirve/);
  assert.match(errorDeMeta(400, { error: { message: "Recipient phone number not in allowed list", code: 131030 } }).error, /^El número de FOREMAN todavía es de prueba/);
  // Uno que no se conoce: lo que dijo Meta, sin inventar.
  assert.equal(errorDeMeta(500, { error: { message: "Algo raro", code: 99999 } }).error, "Meta respondió 500: Algo raro");
  assert.equal(errorDeMeta(502, "<html>").error, "Meta respondió 502: <html>");
  // El que viene en el aviso de entrega.
  assert.equal(errorDeEntrega([{ code: 131026, title: "Message undeliverable" }]), "Ese número no puede recibir el mensaje: no tiene WhatsApp, o lo tiene muy desactualizado.");
  assert.equal(errorDeEntrega([{ code: 77, title: "Otra cosa" }]), "Otra cosa");
  assert.equal(errorDeEntrega(null), "Meta no dijo por qué.");
});

test("el aviso de entrega de Meta: qué se guarda, y qué no pisa a qué", () => {
  assert.deepEqual(ESTADO_DE_META, { sent: "enviado", delivered: "entregado", read: "leido", failed: "fallo" });
  const c = cambioPorEntrega({ id: "wamid.1", status: "delivered", timestamp: "1795040000" });
  assert.deepEqual(c, { wa_id: "wamid.1", desde: ["enviado", "fallo"], estado: "entregado", estado_at: "2026-11-18T22:13:20.000Z", error: null });
  // Un «entregado» atrasado no pisa un «leído»; un «fallo» no borra que se entregó.
  assert.equal(VIENE_DE.entregado.includes("leido"), false);
  assert.deepEqual(VIENE_DE.fallo, ["enviado"]);
  assert.equal(cambioPorEntrega({ id: "wamid.1", status: "failed", errors: [{ code: 131026 }] }).error, "Ese número no puede recibir el mensaje: no tiene WhatsApp, o lo tiene muy desactualizado.");
  // «Enviado» ya se sabía al mandarlo, y lo que no se entiende no cambia nada.
  assert.equal(cambioPorEntrega({ id: "wamid.1", status: "sent" }), null);
  assert.equal(cambioPorEntrega({ id: "wamid.1", status: "deleted" }), null);
  assert.equal(cambioPorEntrega({ status: "read" }), null);
  // El webhook los atiende antes que nada, y firmados.
  const webhook = codigoDe("../api/whatsapp.js");
  assert.ok(webhook.indexOf("firmaValida(crudo") < webhook.indexOf("anotarEntrega(st)"), "primero la firma de Meta");
  assert.ok(webhook.indexOf("anotarEntrega(st)") < webhook.indexOf("const mensaje = valor.messages?.[0];"));
});

test("al cliente que contesta no se le dice «no reconozco tu número»: se le responde y se le recuerda dónde se aprueba", () => {
  assert.equal(respuestaAlCliente({ nombre: "XAVIER BURBANO", quien: "Hernan Cueva", enlace: "https://x.test/?cliente=abc" }),
    "Hola Xavier, recibimos tu mensaje y se lo pasamos a Hernan Cueva. Este número de HCA Studio manda avisos automáticos."
    + "\n\nPara aprobar o dejar una observación, entrá a tu enlace (contestar por acá no cuenta como aprobación):\nhttps://x.test/?cliente=abc");
  // Sin nombre, sin quién y con el enlace apagado, se sigue leyendo.
  assert.equal(respuestaAlCliente({}), "Hola, recibimos tu mensaje y se lo pasamos al equipo. Este número de HCA Studio manda avisos automáticos.");
  // En el webhook: antes de tratarlo como desconocido, se mira si es un cliente.
  const webhook = codigoDe("../api/whatsapp.js");
  assert.match(webhook, /if \(!usuario\) \{\s+const aviso = await avisoAlCliente\(de\);\s+if \(aviso\) \{\s+await atenderAlCliente\(/);
  // Su respuesta no aprueba nada: lo que escribió va al equipo y al historial.
  const clientes = codigoDe("../api/_whatsappDeClientes.js");
  assert.equal(/cliente_respuesta/.test(clientes), false);
  assert.ok(clientes.includes("Esto no es una aprobación"));
});

test("en el registro queda por dónde se le avisó, y si el WhatsApp llegó", () => {
  const filas = [{
    id: 1, lead_id: 13, task_id: 196, titulo: "FOGA", pedida_at: "2026-11-18T15:00:00Z", pedida_nombre: "Hernan Cueva", archivos: [],
    avisos: [
      { correos: ["xb@cliente.test"], cuando: "2026-11-18T15:00:10Z", quien: "Hernan Cueva" },
      { correos: [], cuando: "2026-11-19T15:00:10Z", quien: "Hernan Cueva", whatsapps: [{ nombre: "XAVIER BURBANO", telefono: "593991112222", wa_id: "wamid.1" }, { nombre: "ANA", telefono: "593987776666", wa_id: "wamid.2" }] },
    ],
  }];
  // Sin lo que avisó Meta: se sabe que se le escribió, nada más.
  let [p] = registroDeAprobaciones(filas, {}, "2026-11-20");
  assert.deepEqual(p.avisos[0], { correos: ["xb@cliente.test"], cuando: "2026-11-18T15:00:10Z", quien: "Hernan Cueva" });
  assert.deepEqual(p.avisos[1].whatsapps.map(w => [w.nombre, w.estado]), [["XAVIER BURBANO", "enviado"], ["ANA", "enviado"]]);
  // Con lo que avisó: a uno le llegó y lo leyó; a la otra no le llegó.
  [p] = registroDeAprobaciones(filas, {}, "2026-11-20", [
    { wa_id: "wamid.1", estado: "leido", estado_at: "2026-11-19T15:05:00Z", error: null },
    { wa_id: "wamid.2", estado: "fallo", estado_at: "2026-11-19T15:00:20Z", error: "Ese número no puede recibir el mensaje." },
  ]);
  assert.deepEqual(p.avisos[1].whatsapps, [
    { nombre: "XAVIER BURBANO", telefono: "593991112222", estado: "leido", estado_at: "2026-11-19T15:05:00Z", error: "" },
    { nombre: "ANA", telefono: "593987776666", estado: "fallo", estado_at: "2026-11-19T15:00:20Z", error: "Ese número no puede recibir el mensaje." },
  ]);
  assert.equal(whatsappDice(p.avisos[1].whatsapps[0]), "XAVIER BURBANO (leído)");
  assert.equal(whatsappDice(p.avisos[1].whatsapps[1]), "ANA (no llegó: Ese número no puede recibir el mensaje.)");
  assert.equal(avisoDice(p.avisos[0]), "Avisado a xb@cliente.test");
  assert.equal(avisoDice(p.avisos[1]), "Avisado por WhatsApp a XAVIER BURBANO (leído), ANA (no llegó: Ese número no puede recibir el mensaje.)");
  assert.equal(avisoDice({ correos: ["a@b.test"], whatsapps: [{ nombre: "Xavier", estado: "entregado" }] }), "Avisado a a@b.test y por WhatsApp a Xavier (entregado)");
  // Y sale en el PDF, que es el sustento.
  const doc = registroParaPdf([p], { proyecto: "RES BG" });
  assert.ok(doc.bloques[0].filas[0][3].includes("Avisado a xb@cliente.test · "));
  assert.ok(doc.bloques[0].filas[0][3].includes("Avisado por WhatsApp a XAVIER BURBANO (leído), ANA (no llegó"));
  // En el historial del punto.
  assert.equal(dichoAdentro('Le avisó por correo a xb@cliente.test que apruebe "FOGA"'), "Se le avisó por correo a xb@cliente.test");
  assert.equal(dichoAdentro('Le avisó por correo a xb@cliente.test y por WhatsApp a XAVIER BURBANO (593991112222) que apruebe "FOGA"'), "Se le avisó por correo a xb@cliente.test y por WhatsApp a XAVIER BURBANO (593991112222)");
  assert.equal(dichoAdentro('Le avisó por WhatsApp a XAVIER BURBANO (593991112222) que apruebe "FOGA"'), "Se le avisó por WhatsApp a XAVIER BURBANO (593991112222)");
  assert.equal(dichoAdentro('El WhatsApp a XAVIER BURBANO por "FOGA" no llegó: Ese número no puede recibir el mensaje.'), "El WhatsApp a XAVIER BURBANO no llegó: Ese número no puede recibir el mensaje.");
  assert.equal(dichoAdentro('XAVIER BURBANO contestó por WhatsApp sobre "FOGA": Listo, avancen'), "XAVIER BURBANO contestó por WhatsApp: Listo, avancen");
});

test("mientras no esté configurado, la ventana queda como estaba; configurado, le escribe sola", () => {
  const ventana = codigoDe("../src/modules/leads/PedirAprobacion.jsx");
  // Se pregunta al abrir, junto con la gente y el enlace.
  assert.match(ventana, /enlaceDelClienteDe\(lead\.id\), whatsappDeForeman\(\)\]\);/);
  assert.match(ventana, /setWa\(numero\.configurado\);/);
  // Por WhatsApp solo si el número de FOREMAN ya manda.
  assert.match(ventana, /const whatsapps = wa \? todos\.filter\(p => claves\.has\(p\.clave\) && p\.whatsapp\)\.map\(p => \(\{ nombre: p\.nombre, telefono: p\.whatsapp \}\)\) : \[\];/);
  // A quien ya le escribió FOREMAN no se le ofrece el botón de mandarlo a mano.
  assert.match(ventana, /const aMano = conWhatsApp\.filter\(p => !yaLesLlego\.has\(p\.whatsapp\)\);/);
  // Si no se puede preguntar, se toma como que no está.
  const proyecto = codigoDe("../src/modules/leads/proyecto.js");
  assert.match(proyecto, /\} catch \{\s+return \{ configurado: false, falta: \[\]/);
  // El servidor tampoco lo intenta sin configurar.
  const aviso = codigoDe("../api/_aviso-pedido.js");
  assert.match(aviso, /const porWa = hayWhatsApp\(\) \? losWhatsApp\(whatsapps\) : \[\];/);
  // En Ajustes, solo para quien configura la cuenta.
  assert.match(codigoDe("../src/components/PanelAjustes.jsx"), /\{usuario\?\.role === "owner" && <WhatsAppDeForeman usuario=\{usuario\} \/>\}/);
});

test("la migración 189 solo agrega columnas a los mensajes, y la tabla sigue cerrada", () => {
  const sql = leer("../supabase/migrations/189_whatsapp_a_los_clientes.sql");
  const sinComentarios = sql.split("\n").filter(l => !l.trim().startsWith("--")).join("\n");
  for (const c of ["lead_id", "task_id", "aprobacion_id", "para_nombre", "plantilla", "estado", "estado_at", "error"]) {
    assert.match(sinComentarios, new RegExp(`add column if not exists ${c}\\s`), c);
  }
  // No borra, no cambia datos, no abre la tabla a la app.
  assert.equal(/\b(drop|delete|update|truncate|insert|create policy|grant)\b/i.test(sinComentarios), false);
  assert.match(sinComentarios, /create index if not exists whatsapp_mensajes_lead_idx/);
  // Lo que el servidor escribe y lee son esas columnas.
  const aviso = codigoDe("../api/_aviso-pedido.js");
  assert.match(aviso, /lead_id: lead\.id, task_id: tarea\.id, aprobacion_id: abierto\?\.id \?\? null,/);
  assert.match(aviso, /para_nombre: w\.nombre \|\| null, plantilla: laPlantilla, estado: "enviado", estado_at: cuando,/);
});
