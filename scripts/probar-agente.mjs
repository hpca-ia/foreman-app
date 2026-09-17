// Pruebas de NOVA en WhatsApp, sin llamar a Claude ni tocar la base.
//
//   node scripts/probar-agente.mjs
//
// Lo que se prueba acá es lo que se rompe en silencio: el orden de la
// conversación, reconocer a quién se refiere uno cuando escribe "hector", que
// el mismo celular escrito de cuatro formas sea el mismo, y que sin la firma
// de Meta no entre nada. Lo que habla con la base se prueba vivo, desde el
// teléfono.
//
// Las funciones de /api usan import/export, y el package.json de la app no
// declara módulos (es una app de create-react-app). Así que se copian a una
// carpeta temporal con su propio package.json y se importan desde ahí.

import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { fileURLToPath, pathToFileURL } from "url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "foreman-"));
fs.writeFileSync(path.join(temp, "package.json"), '{"type":"module"}');
fs.readdirSync(path.join(raiz, "api")).filter(f => f.endsWith(".js"))
  .forEach(f => fs.copyFileSync(path.join(raiz, "api", f), path.join(temp, f)));
const cargar = f => import(pathToFileURL(path.join(temp, f)).href);

const { ordenar, instrucciones, responder } = await cargar("_agente.js");
const { parecido, herramientas } = await cargar("_herramientas.js");
const { clave, firmaValida } = await cargar("_whatsapp.js");

let n = 0;
const ok = t => { n++; console.log("  ✓", t); };

// La conversación como la quiere Claude: empieza quien escribe y se van turnando.
let m = ordenar([{ role: "assistant", content: "¿Algo más?" }], "sí, dame mis tareas");
assert.equal(m[0].role, "user");
assert.equal(m.length, 1);
ok("una charla que quedó en NOVA arranca limpia");

m = ordenar([{ role: "user", content: "hola" }, { role: "assistant", content: "dime" }], "mis tareas");
assert.deepEqual(m.map(x => x.role), ["user", "assistant", "user"]);
ok("se van turnando");

m = ordenar([{ role: "user", content: "hola" }, { role: "user", content: "¿estás?" }], "mis tareas");
assert.deepEqual(m.map(x => x.role), ["user"]);
assert.equal(m[0].content, "hola\n¿estás?\nmis tareas");
ok("tres mensajes seguidos de la persona se juntan en uno");

// Reconocer de quién y de qué habla.
const equipo = [{ nombre: "Héctor Pazmiño" }, { nombre: "María Torres" }, { nombre: "Hernán Cueva" }];
assert.equal(parecido("hector", equipo).nombre, "Héctor Pazmiño");
assert.equal(parecido("Hector Pazmino", equipo).nombre, "Héctor Pazmiño");
assert.equal(parecido("Diego", equipo), null);
ok("encuentra a la persona sin acentos y a medias");

const proyectos = [{ nombre: "Residencia Villa Fontana" }, { nombre: "Diners Aeropuerto" }];
assert.equal(parecido("villa fontana", proyectos).nombre, "Residencia Villa Fontana");
assert.equal(parecido("la de diners", proyectos).nombre, "Diners Aeropuerto");
ok("encuentra el proyecto por como se lo nombra en la oficina");

// El teléfono es la credencial: tiene que dar igual cómo esté escrito.
assert.equal(clave("0991234567"), "991234567");
assert.equal(clave("+593 99 123 4567"), "991234567");
assert.equal(clave("593991234567"), "991234567");
assert.equal(clave("123"), "");
ok("el mismo celular escrito de cuatro formas es el mismo");

// Sin la firma de Meta no se contesta nada.
delete process.env.WHATSAPP_APP_SECRET;
assert.equal(firmaValida("{}", "sha256=loquesea"), false);
process.env.WHATSAPP_APP_SECRET = "secreto-de-prueba";
const cuerpo = JSON.stringify({ hola: "mundo" });
const buena = "sha256=" + crypto.createHmac("sha256", "secreto-de-prueba").update(cuerpo).digest("hex");
assert.equal(firmaValida(cuerpo, buena), true);
assert.equal(firmaValida(cuerpo, buena.slice(0, -2) + "00"), false);
assert.equal(firmaValida(cuerpo + " ", buena), false);
ok("la firma de Meta se comprueba de verdad");

// La vuelta completa, con Claude y las herramientas de mentira.
const ctx = {
  usuario: { id: 1, nombre: "Hernán Cueva", rol: "owner" },
  puede: () => true,
  equipo: [{ id: 2, nombre: "Héctor Pazmiño", rol: "residente" }],
  proyectos: [{ id: 9, nombre: "Diners Aeropuerto" }],
};
const guion = [
  { content: [{ type: "tool_use", id: "t1", name: "crear_tarea", input: { titulo: "Inspección BdP Condado", para: "Hector", fecha: "2026-09-18" } }] },
  { content: [{ type: "text", text: "Listo: inspección BdP Condado, para Héctor, el 18." }] },
];
const vistas = [];
const r = await responder({ texto: "tarea para hector, inspección BdP Condado, mañana", ctx }, {
  llamar: async c => { vistas.push(c.messages); return guion.shift(); },
  correr: async (nombre, entrada) => ({ hecho: true, id: 77, tarea: entrada.titulo, para: "Héctor Pazmiño" }),
});
assert.match(r.texto, /Listo/);
assert.equal(r.hizo[0].herramienta, "crear_tarea");
assert.equal(vistas[1].length, 3);
assert.equal(vistas[1][2].content[0].type, "tool_result");
ok("usa la herramienta, le pasa el resultado a Claude y contesta");

const infinito = await responder({ texto: "ve todo", ctx }, {
  llamar: async () => ({ content: [{ type: "tool_use", id: "x", name: "ver_tareas", input: {} }] }),
  correr: async () => ({ cuantas: 0, tareas: [] }),
});
assert.match(infinito.texto, /enredé/);
assert.equal(infinito.hizo.length, 5);
ok("no se queda dando vueltas para siempre");

const sis = instrucciones(ctx);
assert.match(sis, /Hernán Cueva/);
assert.match(sis, /Diners Aeropuerto/);
assert.equal(herramientas.length, 7);
herramientas.forEach(h => assert.ok(h.name && h.description && h.input_schema?.type === "object"));
ok("NOVA sabe con quién habla y sus herramientas están bien formadas");

fs.rmSync(temp, { recursive: true, force: true });
console.log(`\n${n} pruebas, todas pasan.`);
