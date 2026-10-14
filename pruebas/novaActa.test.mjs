import test from "node:test";
import assert from "node:assert/strict";
import { normalizar } from "../src/modules/actas/ordenarActa.js";

const pendientes = [{ id: 7, texto: "Pedir la proforma" }, { id: 8, texto: "Entregar el plano" }];

test("separa temas de compromisos, que es lo que hace útil un acta", () => {
  const r = normalizar({
    temas: [{ titulo: "Ventanería", detalle: "Se atrasa dos semanas", resuelto: "Se acepta la nueva fecha" }],
    compromisos: [{ texto: "Pedir proforma actualizada", responsable: "Lizeth", fecha: "2026-10-17" }],
  }, pendientes);
  assert.equal(r.temas.length, 1);
  assert.equal(r.temas[0].resuelto, "Se acepta la nueva fecha");
  assert.deepEqual(r.compromisos[0], { texto: "Pedir proforma actualizada", responsable: "Lizeth", fecha: "2026-10-17", urgente: false });
});

test("UN COMPROMISO SIN RESPONSABLE ENTRA IGUAL, con el casillero vacío", () => {
  // El casillero vacío se llena en la reunión; un responsable adivinado se
  // descubre cuando ya nadie hizo nada.
  const r = normalizar({ compromisos: [{ texto: "Llamar al proveedor" }] }, []);
  assert.equal(r.compromisos.length, 1);
  assert.equal(r.compromisos[0].responsable, null);
  assert.equal(r.compromisos[0].fecha, null);
});

test("URGENTE VIAJA: es lo que detiene a los demás y tiene que verse", () => {
  const r = normalizar({ compromisos: [{ texto: "Pagar el anticipo", urgente: true }] }, []);
  assert.equal(r.compromisos[0].urgente, true);
});

test("una fecha que no es una fecha no entra", () => {
  const r = normalizar({ compromisos: [{ texto: "X", fecha: "el viernes" }] }, []);
  assert.equal(r.compromisos[0].fecha, null);
});

test("un tema sin título no es un tema", () => {
  const r = normalizar({ temas: [{ detalle: "algo" }, { titulo: "Bueno" }] }, []);
  assert.deepEqual(r.temas.map(t => t.titulo), ["Bueno"]);
});

test("un tema del que no se resolvió nada deja 'resuelto' vacío, y eso es información", () => {
  const r = normalizar({ temas: [{ titulo: "Permiso municipal", detalle: "Se habló" }] }, []);
  assert.equal(r.temas[0].resuelto, null);
});

test("EL REPASO SOLO SOBRE LO QUE DE VERDAD ESTÁ ABIERTO: un id inventado no marca nada", () => {
  const r = normalizar({ repaso: [{ id: 7, hecho: true }, { id: 99, hecho: true }] }, pendientes);
  assert.deepEqual(r.repaso.map(x => x.id), [7]);
});

test("lo que quedó al aire se dice, para preguntarlo antes de cerrar el acta", () => {
  const r = normalizar({ falta: ["Nadie quedó a cargo del permiso", ""] }, []);
  assert.deepEqual(r.falta, ["Nadie quedó a cargo del permiso"]);
});

test("una respuesta vacía no revienta", () => {
  const r = normalizar({}, []);
  assert.deepEqual([r.temas, r.compromisos, r.repaso, r.falta], [[], [], [], []]);
  assert.equal(r.avance, null);
});
