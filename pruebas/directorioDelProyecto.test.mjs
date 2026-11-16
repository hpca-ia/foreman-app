// La gente del proyecto, armada de los cinco lugares donde ya está escrita.
// Hernán, 16/11/2026, después de mandar el libro del Aeropuerto a una
// dirección nueva de Diners: «agrego un nuevo recipient de correo al enviar el
// libro de obra... esa nueva persona debería poder ser nueva en el listado de
// correos».
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { armarDirectorio, deDondeSale, personaParaSumar, esCorreo, correoLimpio, armarInvolucrados, cambiosAlEditar,
  filaDeSiempre, personaDeLaFicha, dondeFigura, figuraEnDocumentos, filasDe } from "../src/modules/controlObra/directorioDelProyecto.js";

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

test("las cinco listas son una sola persona: por correo, y gana el dato que existe", () => {
  const gente = armarDirectorio({
    convocados: [{ id: 7, nombre: "Ana Pérez", empresa: "", cargo: "", email: " Ana@Cliente.com " }],
    invitados: [{ id: 3, nombre: "Ana", rol: "Gerente", email: "ana@cliente.com", recibe_ordenes: true }],
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
  assert.match(c, /return armarDirectorio\(await fuentesDeLaGente\(leadId\)\);/);
});

// ── LO CARGADO A MANO MANDA ────────────────────────────────────────────────

test("el nombre cargado en los de siempre o en la ficha manda sobre el de un acta o una orden vieja, aunque sea más corto", () => {
  const viejo = { nombre: "Sebastián Palomeque Mantilla", empresa: "DINERS CLUB DEL ECUADOR", cargo: "Coord.", email: "seba@cliente.test" };
  // Corregido en los de siempre a un nombre más corto: es el que se ve.
  const [a] = armarDirectorio({ convocados: [{ id: 1, nombre: "Sebastián Palomeque", empresa: "DINERS", cargo: "Coordinación", email: "seba@cliente.test" }],
    asistentes: [viejo], firmantes: [{ ...viejo, rol: "x" }], delLibro: [viejo] });
  assert.equal(a.nombre, "Sebastián Palomeque");
  assert.equal(a.empresa, "DINERS");
  // Cargado solo en la ficha: también manda.
  const [b] = armarDirectorio({ invitados: [{ id: 2, nombre: "Seba", rol: "cliente", email: "seba@cliente.test" }], asistentes: [viejo] });
  assert.equal(b.nombre, "Seba");
  // Los de siempre antes que la ficha.
  const [c] = armarDirectorio({ convocados: [{ id: 1, nombre: "De siempre", email: "seba@cliente.test" }], invitados: [{ id: 2, nombre: "De la ficha, más largo", email: "seba@cliente.test" }] });
  assert.equal(c.nombre, "De siempre");
  // Un cargado sin nombre no pisa nada: sigue ganando el más completo de los documentos.
  const [d] = armarDirectorio({ convocados: [{ id: 1, nombre: " ", email: "seba@cliente.test" }], asistentes: [viejo], delLibro: [{ nombre: "Seba", email: "seba@cliente.test" }] });
  assert.equal(d.nombre, "Sebastián Palomeque Mantilla");
  // Entre documentos, como antes: el más completo.
  const [e] = armarDirectorio({ firmantes: [{ nombre: "Diners", email: "seba@cliente.test" }], asistentes: [viejo] });
  assert.equal(e.nombre, "Sebastián Palomeque Mantilla");
});

// ── LA FICHA DEL PROYECTO: TODOS LOS INVOLUCRADOS ──────────────────────────
//
// Hernán, mirando la pestaña «Gente», que mostraba solo al equipo: «ahí
// deberían aparecer todos los involucrados... cada vez que se agregue alguien
// se actualiza ese cuadro».

const FUENTES = {
  convocados: [
    { id: 1, nombre: "Sebastián Palomeque", empresa: "DINERS", cargo: "Coordinación", email: "seba@cliente.test", orden: 0 },
    { id: 2, nombre: "Maestro de obra", empresa: "Contratista", cargo: null, email: null, orden: 1 },
  ],
  invitados: [
    { id: 5, nombre: "Zoila Cliente", rol: "cliente", email: "zoila@cliente.test", telefono: "0999" },
    { id: 6, nombre: "Proveedor sin correo", rol: "proveedor", email: "", telefono: "0888" },
  ],
  asistentes: [
    { nombre: "Sebastián P.", empresa: "DINERS CLUB", cargo: "x", email: "SEBA@cliente.test" },
    { nombre: "Ana Fiscal", empresa: "Fiscalización", cargo: "Ing.", email: "ana@fisca.test" },
    { nombre: "Sin correo del acta", empresa: "", cargo: "", email: null },
  ],
  firmantes: [{ nombre: "Ana", empresa: "", rol: "Fiscalización", email: "ana@fisca.test" }],
  delLibro: [{ nombre: null, email: "nueva@cliente.test" }, { nombre: "Sebastián Palomeque", email: "seba@cliente.test" }],
};

test("LO QUE PIDIÓ: en la ficha salen todos —los de siempre, los cargados, los de actas, órdenes y libro—, una vez cada uno", () => {
  const todos = armarInvolucrados(FUENTES);
  assert.deepEqual(todos.map(p => [p.clave, p.nombre, p.deSiempre]), [
    // Los de siempre primero, en su orden; el que no tiene correo también.
    ["seba@cliente.test", "Sebastián Palomeque", true],
    ["c2", "Maestro de obra", true],
    // Después el resto, por nombre; la que no tiene nombre va por su correo.
    ["ana@fisca.test", "Ana Fiscal", false],
    ["nueva@cliente.test", "", false],
    ["i6", "Proveedor sin correo", false],
    ["zoila@cliente.test", "Zoila Cliente", false],
  ]);
  const [seba, maestro, ana, nueva, proveedor, zoila] = todos;
  // De dónde salió cada uno y en qué fila está cargado, para poder corregirlo.
  assert.deepEqual(seba, { clave: "seba@cliente.test", nombre: "Sebastián Palomeque", empresa: "DINERS", cargo: "Coordinación",
    email: "seba@cliente.test", telefono: "", convocadoId: 1, convocadoIds: [1], invitadoId: null, invitadoIds: [],
    deSiempre: true, deFicha: false, deActas: true, deOrdenes: false, deLibro: true });
  assert.deepEqual([maestro.email, maestro.convocadoId, maestro.empresa], ["", 2, "Contratista"]);
  assert.deepEqual([ana.empresa, ana.cargo, ana.convocadoId, ana.invitadoId], ["Fiscalización", "Ing.", null, null]);
  assert.deepEqual(dondeFigura(ana), ["actas", "órdenes"]);
  assert.deepEqual(dondeFigura(nueva), ["libro"]);
  assert.equal(figuraEnDocumentos(nueva), true);
  assert.deepEqual([zoila.invitadoId, zoila.deFicha, zoila.telefono, zoila.cargo], [5, true, "0999", "cliente"]);
  assert.equal(figuraEnDocumentos(zoila), false);
  assert.deepEqual([proveedor.invitadoId, proveedor.telefono, proveedor.email], [6, "0888", ""]);
  assert.deepEqual(armarInvolucrados(), []);
});

test("corregir a alguien escribe en la fila donde está cargado; el que solo figura en documentos queda cargado en la ficha", () => {
  const [seba, maestro, ana, nueva, , zoila] = armarInvolucrados(FUENTES);
  // De siempre: nombre, empresa, cargo y correo, en su fila.
  assert.deepEqual(cambiosAlEditar(seba, { nombre: " Sebastián Palomeque M. ", empresa: "Diners Club", cargo: "", email: " Seba2@Cliente.test " }, 15),
    { ops: [{ tabla: "obra_convocados", id: 1, campos: { nombre: "Sebastián Palomeque M.", empresa: "Diners Club", cargo: null, email: "seba2@cliente.test" } }] });
  // El de siempre sin correo: se le pone.
  assert.deepEqual(cambiosAlEditar(maestro, { nombre: "Maestro de obra", empresa: "Contratista", email: "maestro@obra.test" }, 15).ops[0].campos.email, "maestro@obra.test");
  assert.equal(cambiosAlEditar(maestro, { nombre: "Maestro de obra", email: "" }, 15).ops[0].campos.email, null);
  // Cargada en la ficha: nombre, correo y teléfono, en la suya; el rol no se toca.
  assert.deepEqual(cambiosAlEditar(zoila, { nombre: "Zoila C.", email: "zoila@cliente.test", telefono: " 0777 " }, 15),
    { ops: [{ tabla: "pipeline_invitados", id: 5, campos: { nombre: "Zoila C.", email: "zoila@cliente.test", telefono: "0777" } }] });
  // Solo figura en el libro: al ponerle nombre queda cargada en la ficha, con su correo.
  assert.deepEqual(cambiosAlEditar(nueva, { nombre: "Persona Nueva", email: "nueva@cliente.test", telefono: "" }, 15),
    { ops: [{ tabla: "pipeline_invitados", id: null, campos: { lead_id: 15, nombre: "Persona Nueva", rol: "otro", email: "nueva@cliente.test", telefono: null } }] });
  // Ese correo es el del documento: no se cambia acá.
  assert.deepEqual(cambiosAlEditar(ana, { nombre: "Ana Fiscal", email: "otra@fisca.test" }, 15), { error: "Ese correo viene de un documento ya enviado: no se cambia acá." });
  // Lo que no se guarda.
  assert.deepEqual(cambiosAlEditar(seba, { nombre: " ", email: "seba@cliente.test" }, 15), { error: "Falta el nombre." });
  assert.deepEqual(cambiosAlEditar(seba, { nombre: "Seba", email: "seba@cliente" }, 15), { error: "Ese correo no está bien escrito." });
  assert.deepEqual(cambiosAlEditar(seba, { nombre: "Seba", email: "" }, 15), { error: "Falta el correo." });
  // La que está en los de siempre y en la ficha se corrige en las dos.
  const [doble] = armarInvolucrados({ convocados: [{ id: 1, nombre: "A", email: "a@a.test" }], invitados: [{ id: 9, nombre: "A", email: "a@a.test" }] });
  assert.deepEqual(cambiosAlEditar(doble, { nombre: "B", email: "a@a.test" }, 15).ops.map(o => [o.tabla, o.id]),
    [["obra_convocados", 1], ["pipeline_invitados", 9]]);
});

// LO QUE HABÍA EN EL AEROPUERTO: tres de los de siempre cargados dos y tres
// veces, con el mismo correo —una vez «Lizeth», dos con nombre y apellido—.
test("la que está cargada tres veces en los de siempre sale una sola, con el nombre más completo, y se corrige entera", () => {
  const fuentes = { convocados: [
    { id: 1, nombre: "Lizeth", empresa: "HCARQ", cargo: "", email: "liz@oficina.test", orden: 0 },
    { id: 12, nombre: "Lizeth De la Cruz", empresa: "HCARQ", cargo: "Residente de obra", email: "liz@oficina.test", orden: 10 },
    { id: 17, nombre: "Lizeth De la Cruz", empresa: "HCARQ", cargo: "Residente de obra", email: " Liz@Oficina.test", orden: 15 },
  ], asistentes: [{ nombre: "Lizeth De la Cruz Residente HCARQ", empresa: "", cargo: "", email: "liz@oficina.test" }] };
  const todos = armarInvolucrados(fuentes);
  assert.equal(todos.length, 1);
  const [liz] = todos;
  // Entre sus tres filas gana la más completa; la del acta, más larga, no.
  assert.equal(liz.nombre, "Lizeth De la Cruz");
  assert.equal(liz.cargo, "Residente de obra");
  assert.deepEqual(liz.convocadoIds, [1, 12, 17]);
  assert.equal(armarDirectorio(fuentes)[0].nombre, "Lizeth De la Cruz");
  // Se corrige en las tres: tocando una sola, las otras seguirían diciendo lo de antes.
  assert.deepEqual(cambiosAlEditar(liz, { nombre: "Lizeth De la Cruz", empresa: "HCARQ", cargo: "Residente", email: "liz@oficina.test" }, 15)
    .ops.map(o => [o.tabla, o.id, o.campos.cargo]),
  [["obra_convocados", 1, "Residente"], ["obra_convocados", 12, "Residente"], ["obra_convocados", 17, "Residente"]]);
  assert.deepEqual(filasDe(liz, "convocado"), [1, 12, 17]);
  assert.deepEqual(filasDe({ convocadoId: 4 }, "convocado"), [4]);
  assert.deepEqual(filasDe({}, "invitado"), []);
  // Sacarla de los de siempre saca las tres.
  const datos = codigoDe("../src/modules/leads/involucrados.js");
  assert.match(datos, /for \(const id of filasDe\(p, "convocado"\)\) \{\s+const e = await borrarConvocado\(id\);/);
});

test("pasar a alguien a los de siempre lleva lo que se sabe de él; agregar desde la ficha pide nombre y un correo que sirva", () => {
  const [, , ana, nueva] = armarInvolucrados(FUENTES);
  assert.deepEqual(filaDeSiempre(ana, 15, 2), { lead_id: 15, nombre: "Ana Fiscal", empresa: "Fiscalización", cargo: "Ing.", email: "ana@fisca.test", activo: true, orden: 2 });
  // Sin nombre todavía: entra con su correo, que después se corrige.
  assert.deepEqual(filaDeSiempre(nueva, 15, 3), { lead_id: 15, nombre: "nueva@cliente.test", empresa: null, cargo: null, email: "nueva@cliente.test", activo: true, orden: 3 });
  assert.deepEqual(personaDeLaFicha({ nombre: " Persona ", rol: "proveedor", email: " P@P.test ", telefono: " 099 " }, 15),
    { fila: { lead_id: 15, nombre: "Persona", rol: "proveedor", email: "p@p.test", telefono: "099" } });
  assert.deepEqual(personaDeLaFicha({ nombre: "Persona", email: "", telefono: "" }, 15), { fila: { lead_id: 15, nombre: "Persona", rol: "otro", email: null, telefono: null } });
  assert.deepEqual(personaDeLaFicha({ nombre: "", email: "p@p.test" }, 15), { error: "Falta el nombre." });
  assert.deepEqual(personaDeLaFicha({ nombre: "Persona", email: "p@p" }, 15), { error: "Ese correo no está bien escrito." });
});

test("la pestaña «Gente» de la ficha muestra a todos los involucrados, no solo lo cargado ahí", () => {
  const gente = codigoDe("../src/modules/leads/GenteDelProyecto.jsx");
  assert.match(gente, /<InvolucradosDelProyecto lead=\{lead\} editable=\{editable\} \/>/);
  assert.doesNotMatch(gente, /pipeline_invitados/);
  const datos = codigoDe("../src/modules/leads/involucrados.js");
  assert.match(datos, /return armarInvolucrados\(await fuentesDeLaGente\(leadId\)\);/);
  const pantalla = codigoDe("../src/modules/leads/InvolucradosDelProyecto.jsx");
  // Se guarda solo al salir del casillero, con el estado al lado.
  assert.match(pantalla, /onBlur=\{guardar\}/);
  assert.match(pantalla, /className="estado-del-cambio"/);
  assert.match(codigoDe("../src/modules/leads/ModalLead.jsx"), /<GenteDelProyecto lead=\{lead\} users=\{users\} currentUser=\{currentUser\} editable=\{editable\}/);
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
