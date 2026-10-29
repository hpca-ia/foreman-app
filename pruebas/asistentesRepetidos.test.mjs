import test from "node:test";
import assert from "node:assert/strict";
import { repetidos, comoQuedan, correosCompartidos, cuantosDeVerdad }
  from "../src/modules/actas/repetidos.js";

// El acta 3 de Diners Aéreo, como estaba de verdad: Lizeth tres veces, dos de
// ellas marcadas como que no vino.
const lista = [
  { id: 1, nombre: "Lizeth", empresa: "HCARQ", email: "ld@hcastudio.com", asistio: false, recibe: true },
  { id: 2, nombre: "Lizeth De la Cruz", empresa: "HCARQ", email: "ld@hcastudio.com", asistio: true, recibe: true },
  { id: 3, nombre: "Lizeth De la Cruz", empresa: "HCARQ", email: "ld@hcastudio.com", asistio: false, recibe: true },
  { id: 4, nombre: "Camila Mena", empresa: "HCARQ", email: "cm@hcastudio.com", asistio: true, recibe: true },
  // Dos personas distintas en la misma casilla: pasa con los contratistas.
  { id: 5, nombre: "Kevin Sánchez", empresa: "SOLEK", email: "l.calvopina04@gmail.com", asistio: false, recibe: false },
  { id: 6, nombre: "Alex Calvopiña", empresa: "SOLEK", email: "l.calvopina04@gmail.com", asistio: true, recibe: true },
  { id: 7, nombre: "", empresa: "", email: "", asistio: true, recibe: true },
];

test("la misma persona repetida se encuentra, aunque el nombre esté a medias", () => {
  const g = repetidos(lista);
  assert.equal(g.length, 1);
  assert.deepEqual(g[0].map(a => a.id), [1, 2, 3]);
});

test("dos personas con el mismo correo NO son la misma persona", () => {
  const g = repetidos(lista);
  assert.ok(!g.some(x => x.some(a => a.id === 5)));
  const c = correosCompartidos(lista);
  assert.equal(c.length, 1);
  assert.equal(c[0].email, "l.calvopina04@gmail.com");
  assert.equal(c[0].gente.length, 2);
});

test("al juntarlas gana lo que afirma: si vino en alguna, vino", () => {
  const { queda, sobran } = comoQuedan(repetidos(lista)[0]);
  assert.equal(queda.asistio, true);
  assert.equal(queda.nombre, "Lizeth De la Cruz");
  assert.equal(queda.recibe, true);
  assert.deepEqual(sobran.map(a => a.id), [2, 3]);
});

test("el conteo cuenta personas, no renglones", () => {
  const c = cuantosDeVerdad(lista);
  assert.equal(c.filas, 6);      // la fila en blanco no es nadie
  assert.equal(c.personas, 4);   // Lizeth, Camila, y los dos de la casilla compartida
  assert.equal(c.vinieron, 3);
  assert.equal(c.reciben, 3);    // una dirección es una copia: Kevin y Alex comparten la suya
});

test("marcado para recibir y sin correo se cuenta aparte: no le va a llegar", () => {
  const c = cuantosDeVerdad([{ id: 1, nombre: "Fiscalización", asistio: true, recibe: true }]);
  assert.equal(c.reciben, 0);
  assert.equal(c.sinCorreo, 1);
});

test("una lista sin repetidos no inventa ninguno", () => {
  assert.equal(repetidos([lista[3], lista[5]]).length, 0);
});
