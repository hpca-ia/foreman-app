// Cómo viaja el libro de obra cuando se manda por correo: en el pedido si es
// chico, por el depósito si no entra, y como enlace si no entra en ninguna casilla.
import test from "node:test";
import assert from "node:assert/strict";
import { comoViaja, enBase64, rutaDelEnvio, esRutaDeEnvio, enMegas, TOPE_DEL_PEDIDO, TOPE_DEL_ADJUNTO } from "../src/modules/libro/envioDelLibro.js";
import * as servidor from "../api/_envioDelLibro.js";

const MB = 1024 * 1024;

test("un libro chico va en el pedido, como siempre", () => {
  assert.equal(comoViaja(500 * 1024), "pedido");
  assert.equal(comoViaja(3 * MB), "pedido");
});

test("el del aviso —4,3 MB ya en base64, unos 3,2 de PDF— ya no se rebota: se sube y va adjunto", () => {
  // Lo que pesaba el pedido que se rechazó: 4,3 MB de base64.
  const pdf = Math.round(4.3 * MB * 3 / 4);
  assert.ok(enBase64(pdf) > TOPE_DEL_PEDIDO);
  assert.equal(comoViaja(pdf), "deposito");
  assert.equal(comoViaja(12 * MB), "deposito");
  assert.equal(comoViaja(TOPE_DEL_ADJUNTO), "deposito");
});

test("uno que no entra adjunto en ninguna casilla va como enlace de descarga", () => {
  assert.equal(comoViaja(TOPE_DEL_ADJUNTO + 1), "enlace");
  assert.equal(comoViaja(40 * MB), "enlace");
});

test("el corte entre el pedido y el depósito es justo donde Vercel dejaría de aceptarlo", () => {
  const justo = Math.floor(TOPE_DEL_PEDIDO / 4) * 3;
  assert.equal(comoViaja(justo), "pedido");
  assert.equal(comoViaja(justo + 3), "deposito");
  assert.ok(TOPE_DEL_PEDIDO < 4.5 * MB, "con margen para el resto del pedido");
});

test("el libro se sube a la carpeta de envíos de su obra, con sus fechas", () => {
  assert.equal(rutaDelEnvio(15, "2026-10-19", "2026-10-25T05:00:00Z", 1794500000000), "libro/15/envios/libro-2026-10-19-a-2026-10-25-1794500000000.pdf");
});

test("el servidor solo toma del depósito un libro subido para mandar, y de esa obra", () => {
  const buena = rutaDelEnvio(15, "2026-10-19", "2026-10-25", 1794500000000);
  assert.equal(esRutaDeEnvio(buena, 15), true);
  assert.equal(esRutaDeEnvio(buena, "15"), true);
  // De otra obra, o cualquier otro archivo del depósito: no.
  assert.equal(esRutaDeEnvio(buena, 16), false);
  for (const mala of [
    "caja-11/1792679783058-factura.pdf",
    "libro/15/dia-2026-10-08-1760568224449-v3.pdf",
    "libro/15/envios/../../caja-11/factura.pdf",
    "libro/15/envios/libro-2026-10-19-a-2026-10-25-1.pdf?x=1",
    "libro/15/envios/libro-2026-10-19-a-2026-10-25-1.exe",
    "/libro/15/envios/libro-2026-10-19-a-2026-10-25-1.pdf",
    "", null,
  ]) assert.equal(esRutaDeEnvio(mala, 15), false, String(mala));
  assert.equal(esRutaDeEnvio(buena, 0), false);
  assert.equal(esRutaDeEnvio(buena, "15 or 1=1"), false);
});

test("el servidor reconoce las mismas rutas y corta en el mismo peso que la aplicación", () => {
  assert.equal(servidor.TOPE_DEL_ADJUNTO, TOPE_DEL_ADJUNTO);
  const buena = rutaDelEnvio(15, "2026-10-19", "2026-10-25", 1794500000000);
  for (const [ruta, obra] of [[buena, 15], [buena, 16], ["caja-11/x.pdf", 11], ["libro/15/envios/../x.pdf", 15]]) {
    assert.equal(servidor.esRutaDeEnvio(ruta, obra), esRutaDeEnvio(ruta, obra), `${ruta} · ${obra}`);
  }
});

test("el peso se dice en megas, con una décima", () => {
  assert.equal(enMegas(4.3 * MB), "4,3 MB");
  assert.equal(servidor.enMegas(18.24 * MB), "18,2 MB");
});

// ── El servidor, de punta a punta, sin red ─────────────────────────────────
// Se le cambia `fetch` por uno que contesta como la base, el depósito y el
// servicio de correo, y se mira qué le manda a cada uno.

process.env.SUPABASE_SECRET_KEY = "llave-de-prueba";
process.env.RESEND_API_KEY = "re_prueba";
const { default: manejar } = await import("../api/_aviso-libro.js");

const RUTA = rutaDelEnvio(15, "2026-10-19", "2026-10-25", 1794500000000);
function mundo({ pdf = Buffer.from("%PDF-1.4 libro de prueba"), anunciado = null } = {}) {
  const visto = { correos: [], deposito: [], bajadas: [], envios: [] };
  globalThis.fetch = async (url, op = {}) => {
    const u = String(url);
    const ok = (datos, extra = {}) => ({ ok: true, status: 200, json: async () => datos, ...extra });
    if (u.includes("/rest/v1/leads?")) return ok([{ nombre: "Diners Aereo GYE" }]);
    if (u.includes("/rest/v1/libro_envios") && op.method === "POST") { const f = JSON.parse(op.body); visto.envios.push(f); return ok([{ id: visto.envios.length, token: f.token }]); }
    if (u.includes("/rest/v1/libro_envios")) return ok([]);
    // Pedir la firma es un POST a la carpeta; bajar el archivo, un GET a su dirección ya firmada.
    if (u.endsWith("/storage/v1/object/sign/task-files")) {
      const { paths, expiresIn } = JSON.parse(op.body);
      visto.deposito.push({ paths, expiresIn, llave: op.headers?.apikey });
      return ok(paths.map(path => ({ path, signedURL: `/object/sign/task-files/${path}?token=firma` })));
    }
    if (u.includes("/storage/v1/object/sign/task-files/")) {
      visto.bajadas.push(u);
      return { ok: true, headers: { get: k => (k === "content-length" ? String(anunciado ?? pdf.length) : null) },
        arrayBuffer: async () => pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.length) };
    }
    if (u.startsWith("https://api.resend.com/emails")) { visto.correos.push(JSON.parse(op.body)); return ok({ id: `correo-${visto.correos.length}` }); }
    throw new Error(`pedido que no esperaba: ${u}`);
  };
  return visto;
}
async function pedir(cuerpo) {
  let salida = null;
  const res = { status(c) { return { json(o) { salida = { codigo: c, ...o }; return salida; } }; } };
  await manejar({ method: "POST", body: cuerpo, headers: {} }, res);
  return salida;
}
const base = { lead_id: 15, desde: "2026-10-19", hasta: "2026-10-25", dias: 5, para: ["angie@ejemplo.test", "kevin@ejemplo.test"], de: { id: 1, nombre: "Hernan Cueva", email: "hc@ejemplo.test" } };

test("servidor: el libro chico llega en el pedido y sale adjunto, igual que antes", async () => {
  const visto = mundo();
  const r = await pedir({ ...base, adjunto: { nombre: "Libro de obra Diners Aereo GYE.pdf", contenido: "JVBERi0=" } });
  assert.equal(r.codigo, 200); assert.equal(r.mandados, 2); assert.equal(r.comoFue, "adjunto");
  assert.equal(visto.deposito.length, 0, "no toca el depósito");
  assert.deepEqual(visto.correos.map(c => c.attachments), [[{ filename: "Libro de obra Diners Aereo GYE.pdf", content: "JVBERi0=" }], [{ filename: "Libro de obra Diners Aereo GYE.pdf", content: "JVBERi0=" }]]);
  assert.match(visto.correos[0].html, /Va adjunto el <strong>libro de obra de Diners Aereo GYE<\/strong>/);
});

test("servidor: el libro que no entraba en el pedido se toma del depósito y sale adjunto, entero", async () => {
  const pdf = Buffer.concat([Buffer.from("%PDF-1.4 "), Buffer.alloc(6 * MB, 7)]);
  const visto = mundo({ pdf });
  const r = await pedir({ ...base, adjunto: { nombre: "Libro de obra Diners Aereo GYE.pdf", ruta: RUTA, bytes: pdf.length } });
  assert.equal(r.codigo, 200); assert.equal(r.mandados, 2); assert.equal(r.comoFue, "adjunto");
  assert.deepEqual(visto.deposito[0].paths, [RUTA]);
  assert.equal(visto.deposito[0].llave, "llave-de-prueba");
  assert.equal(visto.bajadas.length, 1, "se baja una vez, no una por persona");
  // A cada uno le llega el PDF completo, byte por byte.
  for (const c of visto.correos) {
    assert.equal(c.attachments.length, 1);
    assert.equal(Buffer.from(c.attachments[0].content, "base64").equals(pdf), true);
    assert.match(c.html, /Va adjunto/);
    assert.deepEqual(c.reply_to, ["hc@ejemplo.test"]);
  }
  assert.deepEqual(visto.correos.map(c => c.to), [["angie@ejemplo.test"], ["kevin@ejemplo.test"]]);
});

test("servidor: uno demasiado pesado para adjuntarlo sale con el botón de descarga, y no se baja", async () => {
  const visto = mundo({ anunciado: 22 * MB });
  const r = await pedir({ ...base, adjunto: { nombre: "Libro.pdf", ruta: RUTA, bytes: 22 * MB } });
  assert.equal(r.codigo, 200); assert.equal(r.comoFue, "enlace"); assert.equal(r.peso, "22,0 MB");
  for (const c of visto.correos) {
    assert.equal(c.attachments, undefined, "sin adjunto");
    assert.match(c.html, /pesa 22,0 MB y no entra como adjunto/);
    assert.match(c.html, /Descargar el libro \(PDF\)/);
    assert.ok(c.html.includes(`/storage/v1/object/sign/task-files/${RUTA}?token=firma`));
    assert.match(c.html, /El enlace vale 30 d/);
  }
  assert.equal(visto.deposito[0].expiresIn, 60 * 60 * 24 * 30);
});

test("servidor: no manda por correo un archivo del depósito que no sea un libro de esa obra", async () => {
  for (const ruta of ["caja-11/1792679783058-factura.pdf", "libro/16/envios/libro-2026-10-19-a-2026-10-25-1.pdf", "libro/15/envios/../../caja-9/x.pdf"]) {
    const visto = mundo();
    const r = await pedir({ ...base, adjunto: { nombre: "x.pdf", ruta } });
    assert.equal(r.codigo, 400, ruta);
    assert.match(r.error, /no es un libro de esta obra/);
    assert.equal(visto.correos.length + visto.deposito.length + visto.bajadas.length, 0, "ni lo busca ni manda nada");
  }
});

test("servidor: sin el PDF, de ninguna de las dos maneras, no manda nada", async () => {
  const visto = mundo();
  const r = await pedir({ ...base, adjunto: { nombre: "x.pdf" } });
  assert.equal(r.codigo, 400);
  assert.match(r.error, /no llegó al servidor/);
  assert.equal(visto.correos.length, 0);
});
