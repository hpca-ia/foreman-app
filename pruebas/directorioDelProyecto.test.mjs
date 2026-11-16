// La gente del proyecto, armada de los cinco lugares donde ya está escrita.
// Hernán, 16/11/2026, después de mandar el libro del Aeropuerto a una
// dirección nueva de Diners: «agrego un nuevo recipient de correo al enviar el
// libro de obra... esa nueva persona debería poder ser nueva en el listado de
// correos».
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { armarDirectorio, deDondeSale, personaParaSumar, esCorreo, correoLimpio } from "../src/modules/controlObra/directorioDelProyecto.js";

const leer = ruta => readFileSync(new URL(ruta, import.meta.url), "utf8");
const codigoDe = ruta => leer(ruta).split("\n").filter(l => !l.trim().startsWith("//")).join("\n");

// Como estaba el Aeropuerto ese día: dos de siempre, y el libro mandado a los
// dos y a una dirección escrita a mano, sin nombre.
const CONVOCADOS = [
  { id: 1, nombre: "Sebastián Palomeque", empresa: "DINERS", cargo: "Coordinación", email: "coordinacionmantquito@dinersclub.com.ec" },
  { id: 2, nombre: "Angie Jaramillo", empresa: "DINERS", cargo: null, email: "ajaramilloq@dinersclub.com.ec" },
];
const DEL_LIBRO = [
  { nombre: "Sebastián Palomeque", email: "coordinacionmantquito@dinersclub.com.ec" },
  { nombre: "Angie Jaramillo", email: "ajaramilloq@dinersclub.com.ec" },
  { nombre: null, email: "damora@dinersclub.com.ec" },
  { nombre: null, email: "damora@dinersclub.com.ec" },
];

test("LO QUE PIDIÓ: la dirección escrita a mano al mandar el libro queda en la lista para la próxima vez", () => {
  const gente = armarDirectorio({ convocados: CONVOCADOS, delLibro: DEL_LIBRO });
  assert.deepEqual(gente.map(g => g.email), [
    "coordinacionmantquito@dinersclub.com.ec", "ajaramilloq@dinersclub.com.ec", "damora@dinersclub.com.ec",
  ]);
  const nueva = gente[2];
  // Una sola vez aunque se le haya mandado dos libros, y sin nombre todavía.
  assert.deepEqual(nueva, { nombre: "", empresa: "", rol: "", email: "damora@dinersclub.com.ec", deLibro: true });
  assert.equal(deDondeSale(nueva), "el libro de obra");
  // No es de siempre: no se cuela sola en cada acta nueva.
  assert.equal(nueva.deSiempre, undefined);
});

test("el que ya era de siempre lo sigue siendo, con su nombre y su empresa, aunque también reciba el libro", () => {
  const [seba] = armarDirectorio({ convocados: CONVOCADOS, delLibro: DEL_LIBRO });
  assert.equal(seba.deSiempre, true);
  assert.equal(seba.deLibro, true);
  assert.equal(seba.nombre, "Sebastián Palomeque");
  assert.equal(seba.empresa, "DINERS");
  assert.equal(seba.rol, "Coordinación");
  assert.equal(deDondeSale(seba), "los de siempre");
});

test("las cinco listas son una sola persona: por correo, gana el dato que existe y el nombre más completo", () => {
  const gente = armarDirectorio({
    convocados: [{ id: 7, nombre: "Ana", empresa: "", cargo: "", email: " Ana@Cliente.com " }],
    invitados: [{ id: 3, nombre: "Ana Pérez", rol: "Gerente", email: "ana@cliente.com", recibe_ordenes: true }],
    asistentes: [{ nombre: "Ana", empresa: "CLIENTE S.A.", cargo: "x", email: "ana@cliente.com" }, { nombre: "Proveedor", empresa: "P", cargo: "", email: "p@p.com" }],
    firmantes: [{ nombre: "Fiscal", empresa: "F", rol: "Fiscalización", email: "f@f.com" }],
    delLibro: [{ nombre: "Abogado", email: "abogado@estudio.com" }, { nombre: "", email: "no es un correo" }, { nombre: "Sin correo", email: null }],
  });
  assert.equal(gente.length, 4);
  const ana = gente[0];
  assert.equal(ana.email, "ana@cliente.com");
  assert.equal(ana.nombre, "Ana Pérez");
  assert.equal(ana.empresa, "CLIENTE S.A.");
  assert.equal(ana.rol, "Gerente");
  assert.equal(ana.deSiempre, true);
  assert.equal(ana.recibe_ordenes, true);
  assert.deepEqual(gente.slice(1).map(g => [g.email, deDondeSale(g)]), [
    ["p@p.com", "actas de este proyecto"],
    ["f@f.com", "órdenes anteriores"],
    ["abogado@estudio.com", "el libro de obra"],
  ]);
  assert.deepEqual(armarDirectorio(), []);
  assert.deepEqual(armarDirectorio({ delLibro: null, convocados: null }), []);
});

test("sumar a alguien a mano: pide nombre y un correo que sirva, y lo deja listo para los de siempre", () => {
  assert.deepEqual(personaParaSumar({ nombre: " Persona Nueva ", empresa: " Cliente ", email: " Nueva@Cliente.test " }, 15, 2),
    { fila: { lead_id: 15, nombre: "Persona Nueva", empresa: "Cliente", email: "nueva@cliente.test", activo: true, orden: 2 } });
  assert.equal(personaParaSumar({ nombre: "Nueva", empresa: "", email: "d@d.com" }, 15).fila.empresa, null);
  assert.deepEqual(personaParaSumar({ nombre: " ", email: "d@d.com" }, 15), { error: "Falta el nombre." });
  assert.deepEqual(personaParaSumar({ nombre: "Nueva", email: "nueva@cliente" }, 15), { error: "Ese correo no está bien escrito." });
  assert.deepEqual(personaParaSumar(undefined, 15), { error: "Falta el nombre." });
  assert.equal(esCorreo(" A@b.co "), true);
  assert.equal(esCorreo("a@b"), false);
  assert.equal(correoLimpio(" A@B.co "), "a@b.co");
});

test("la consulta del directorio trae también a quién se le mandó el libro, y lo arma este módulo", () => {
  const c = codigoDe("../src/modules/controlObra/ordenesDeCambio.js");
  assert.match(c, /supabase\.from\("libro_envios"\)\.select\("nombre,email"\)\.eq\("lead_id", leadId\)/);
  assert.match(c, /return armarDirectorio\(\{ convocados, invitados, asistentes, firmantes, delLibro \}\);/);
});

test("el libro de obra elige de la gente del proyecto y suma a alguien ahí mismo, no solo de los convocados del acta", () => {
  const c = codigoDe("../src/modules/libro/LibroImpreso.jsx");
  assert.doesNotMatch(c, /convocadosDe/);
  assert.match(c, /setGente\(await gentePara\(lead\.id\)\)/);
  assert.match(c, /personaParaSumar\(nuevaPersona, lead\.id, gente\.length\)/);
  assert.match(c, /await guardarConvocado\(r\.fila\)/);
  // El que ya es de siempre no se carga dos veces.
  assert.match(c, /if \(ya\?\.deSiempre\) \{/);
  assert.match(c, /\+ sumar a alguien/);
  // Las órdenes dicen de dónde salió cada uno con la misma regla.
  assert.match(codigoDe("../src/modules/controlObra/PanelOrdenesCambio.jsx"), /const deDonde = deDondeSale;/);
});
