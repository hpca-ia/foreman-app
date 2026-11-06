import test from "node:test";
import assert from "node:assert/strict";
import { rubrosDeLaOrden, cuadrarConElDocumento } from "../src/modules/controlObra/rubrosDeLaOrden.js";
import * as oficina from "../src/modules/controlObra/honorariosDeOrden.js";
import { codigoDe } from "../src/modules/controlObra/nombreOrden.js";

// ── UNA ORDEN, DOS PUERTAS, EL MISMO CONTRATO ──────────────────────────────
//
// Una orden de cambio se aprueba desde la oficina o la firma el cliente por su
// enlace. Por el enlace entraba al control sin su rubro de honorarios: el 10%
// que el cliente había aceptado en el papel no llegaba al contrato vigente, y
// la misma orden valía distinto según por dónde se hubiera aprobado.
//
// Acá se prueban las tres cosas que lo evitan: qué filas mete una orden, que
// la copia del servidor mete exactamente las mismas, y que la puerta del
// enlace de verdad las usa.

const orden = { id: 7, obra_id: 13, numero: 3, codigo: "OC-03", honorarios_pct: null };
const obra = { honorarios_pct: 10 };
const capHon = { capitulo: "HONORARIOS Y CARGOS", capitulo_orden: 14 };
const lineas = [
  { tipo: "aumenta", descripcion: "Vinil en rollo", unidad: "m2", cantidad: 8, precio_unitario: 200 },
  { tipo: "aumenta", descripcion: "Desalojo", unidad: "glb", cantidad: 1, precio_unitario: 400,
    rubro_codigo: "1.07", capitulo: "PRELIMINARES Y VARIOS" },
  { tipo: "quita", descripcion: "Alfombra modular", unidad: "m2", cantidad: 2, precio_unitario: 100 },
];

test("la orden deja una fila por partida en su capítulo, con IVA adentro, y el honorario aparte", () => {
  // Neto 1.600 + 400 − 200 = 1.800; el 10% son 180; todo entra con el 15%.
  const comun = { obra_id: 13, capitulo_orden: 9003, iva_pct: 15, origen: "orden_cambio", orden_cambio_id: 7 };
  assert.deepEqual(rubrosDeLaOrden({ orden, lineas, iva: 15, obra, capHon }), [
    { ...comun, numero: 9300, orden: 9003000, capitulo: "ADICIONALES · OC-03",
      descripcion: "Vinil en rollo  ·  OC-03", unidad: "m2", cantidad: 8, precio_unitario: 230, total_base: 1840 },
    // El desalojo ya existía en PRELIMINARES: se menciona, pero vive en el
    // capítulo de la orden, que tiene que mostrar entero lo que la orden costó.
    { ...comun, numero: 9301, orden: 9003001, capitulo: "ADICIONALES · OC-03",
      descripcion: "Desalojo  ·  OC-03  ·  ya existía: rubro 1.07 · PRELIMINARES Y VARIOS",
      unidad: "glb", cantidad: 1, precio_unitario: 460, total_base: 460 },
    // Lo que se quita entra en negativo: el presupuesto firmado no se toca.
    { ...comun, numero: 9302, orden: 9003002, capitulo: "ADICIONALES · OC-03",
      descripcion: "(–) Alfombra modular  ·  OC-03", unidad: "m2", cantidad: 2, precio_unitario: -115, total_base: -230 },
    // Y el honorario al capítulo que la obra ya tiene, en su lugar de la lista.
    { ...comun, numero: 9399, orden: 9003999, capitulo: "HONORARIOS Y CARGOS", capitulo_orden: 14,
      descripcion: "Honorarios 10% sobre OC-03", unidad: "glb", cantidad: 1, precio_unitario: 207, total_base: 207 },
  ]);
});

test("si la obra no tiene capítulo de honorarios se abre uno al fondo, con el número de la orden", () => {
  const filas = rubrosDeLaOrden({ orden, lineas, iva: 15, obra, capHon: null });
  const honorario = filas.at(-1);
  assert.equal(honorario.capitulo, "HONORARIOS");
  assert.equal(honorario.capitulo_orden, 9003);
});

test("el porcentaje es el de la orden si lo tiene, y si no el del contrato de la obra", () => {
  const con = pct => rubrosDeLaOrden({ orden: { ...orden, honorarios_pct: pct }, lineas, iva: 0, obra, capHon });
  assert.equal(con(null).at(-1).total_base, 180);
  assert.equal(con(6).at(-1).total_base, 108);
  assert.equal(con(6).at(-1).descripcion, "Honorarios 6% sobre OC-03");
  // Un 0 puesto a propósito es una decisión: esta orden no lleva honorario.
  assert.equal(con(0).length, lineas.length);
  // Y sin porcentaje en ningún lado no se inventa ninguno.
  assert.equal(rubrosDeLaOrden({ orden, lineas, iva: 15, obra: {}, capHon }).length, lineas.length);
});

test("una orden que reduce devuelve honorario: se administra menos", () => {
  const filas = rubrosDeLaOrden({
    orden, iva: 15, obra, capHon,
    lineas: [{ tipo: "quita", descripcion: "Cielo raso", unidad: "m2", cantidad: 10, precio_unitario: 300 }],
  });
  assert.equal(filas[0].total_base, -3450);
  assert.equal(filas[1].total_base, -345);
  assert.equal(filas[1].descripcion, "Honorarios 10% sobre la reducción de OC-03");
});

// ── LA COPIA DEL SERVIDOR ──────────────────────────────────────────────────

const ORDENES = [
  orden,
  { id: 8, obra_id: 10, numero: 2, codigo: "OC-02", honorarios_pct: 6 },
  { id: 9, obra_id: 10, numero: 12, codigo: "OC-08A", honorarios_pct: 0 },
  { id: 10, obra_id: 10, numero: 4, codigo: null, honorarios_pct: null },
  { id: 11, obra_id: 10, numero: 5, codigo: "OC-01.2", honorarios_pct: 12.5, revision_de: 3 },
  // Una modificación: OC-04-A es de la 4 aunque su número de fila sea otro.
  { id: 12, obra_id: 13, numero: 7, codigo: "OC-04-A", honorarios_pct: null, revision_de: 4 },
];
const PARTIDAS = [
  lineas,
  [],
  [{ tipo: "quita", descripcion: "Cielo raso", unidad: "m2", cantidad: 10, precio_unitario: 300 }],
  // La OC-03 del Aéreo, con sus centavos.
  [
    { tipo: "aumenta", descripcion: "Punto de luz", unidad: "pto", cantidad: 39, precio_unitario: 12, rubro_codigo: "103" },
    { tipo: "aumenta", descripcion: "Tablero", unidad: "u", cantidad: 1, precio_unitario: 165 },
    { tipo: "aumenta", descripcion: "Canaleta", unidad: "m", cantidad: 8, precio_unitario: 8.6, capitulo: "ELÉCTRICO" },
    { tipo: "aumenta", descripcion: "Cable", unidad: "m", cantidad: 39, precio_unitario: 8.6 },
    { tipo: "aumenta", descripcion: "Mano de obra", unidad: "glb", cantidad: 1, precio_unitario: 125 },
    { tipo: "quita", descripcion: "Punto de luz", unidad: "pto", cantidad: 39, precio_unitario: 22.41, rubro_codigo: "103", capitulo: "ELÉCTRICO" },
  ],
  // Lo que suma y lo que resta se anulan: neto cero, sin honorario.
  [
    { tipo: "aumenta", descripcion: "Piso A", unidad: "m2", cantidad: 5, precio_unitario: 40 },
    { tipo: "quita", descripcion: "Piso B", unidad: "m2", cantidad: 5, precio_unitario: 40 },
  ],
  // Tres partidas iguales que pierden medio centavo cada una al redondear: sin
  // repartir, el control quedaría un centavo abajo del documento.
  [
    { tipo: "aumenta", descripcion: "Tapa A", unidad: "u", cantidad: 1, precio_unitario: 1.03 },
    { tipo: "aumenta", descripcion: "Tapa B", unidad: "u", cantidad: 1, precio_unitario: 1.03 },
    { tipo: "aumenta", descripcion: "Tapa C", unidad: "u", cantidad: 1, precio_unitario: 1.03 },
  ],
  // La OC-01 del Aéreo, con sus cantidades de verdad.
  [
    { tipo: "quita", descripcion: "Piso de microcemento", unidad: "m2", cantidad: 95.61, precio_unitario: 78.75 },
    { tipo: "aumenta", descripcion: "Fundición de losa", unidad: "m2", cantidad: 95.61, precio_unitario: 98.5 },
    { tipo: "aumenta", descripcion: "Picado de masillado", unidad: "m2", cantidad: 95.61, precio_unitario: 4.65 },
    { tipo: "aumenta", descripcion: "Malla electrosoldada", unidad: "m2", cantidad: 95.61, precio_unitario: 8 },
    { tipo: "aumenta", descripcion: "Desalojo", unidad: "u", cantidad: 2, precio_unitario: 125 },
  ],
  // Como llegan de un formulario o de una base que devuelve texto.
  [
    { tipo: "aumenta", descripcion: "Pintura", unidad: null, cantidad: "95.61", precio_unitario: "98.5" },
    { tipo: "aumenta", descripcion: "Sin precio", unidad: "u", cantidad: 3, precio_unitario: null },
    { tipo: "quita", descripcion: "Sin cantidad", unidad: "u", cantidad: null, precio_unitario: 78.75 },
  ],
];
const OBRAS = [obra, { honorarios_pct: 0 }, { honorarios_pct: "8" }, {}, null];
const CAPITULOS = [capHon, { capitulo: "HONORARIOS", capitulo_orden: 13 }, null];
const IVAS = [15, 12, 0];

test("el servidor arma las mismas filas que la oficina, caso por caso", async () => {
  // Lo que corre en Vercel no puede importar de src/ y tiene su propia copia.
  // Si una cambia y la otra no, la misma orden deja el contrato vigente
  // distinto según la aprobó la oficina o la firmó el cliente por su enlace.
  const api = await import("../api/_rubrosDeLaOrden.js");
  let casos = 0;
  for (const o of ORDENES) for (const ls of PARTIDAS) for (const ob of OBRAS)
    for (const cap of CAPITULOS) for (const iva of IVAS) {
      const caso = { orden: o, lineas: ls, iva, obra: ob, capHon: cap };
      assert.deepEqual(api.rubrosDeLaOrden(caso), rubrosDeLaOrden(caso), JSON.stringify(caso));
      casos++;
    }
  assert.equal(casos, ORDENES.length * PARTIDAS.length * OBRAS.length * CAPITULOS.length * IVAS.length);
});

test("la cuenta de honorarios del servidor es la de la oficina, paso por paso", async () => {
  const api = await import("../api/_rubrosDeLaOrden.js");
  const conIva = v => Math.round(v * 1.15 * 100) / 100;
  for (const o of [...ORDENES, {}, null, { honorarios_pct: "6" }, { honorarios_pct: -3 }]) {
    assert.equal(api.codigoDe(o), codigoDe(o), JSON.stringify(o));
    for (const ob of OBRAS) {
      assert.equal(api.pctQueCorresponde(o, ob), oficina.pctQueCorresponde(o, ob), JSON.stringify([o, ob]));
    }
  }
  for (const ls of PARTIDAS) {
    assert.deepEqual(api.netoDeLaOrden(ls), oficina.netoDeLaOrden(ls));
    for (const pct of [0, 6, 10, 12.5, "10", null]) for (const iva of [0, 15, undefined]) {
      const suya = api.honorariosDe({ lineas: ls, pct, iva });
      assert.deepEqual(suya, oficina.honorariosDe({ lineas: ls, pct, iva }), JSON.stringify({ ls, pct, iva }));
      for (const o of ORDENES) {
        assert.deepEqual(api.rubroDeHonorarios(o, suya, { conIva, iva: 15, capitulo: "HONORARIOS Y CARGOS" }),
          oficina.rubroDeHonorarios(o, suya, { conIva, iva: 15, capitulo: "HONORARIOS Y CARGOS" }));
        assert.deepEqual(api.rubroDeHonorarios(o, suya), oficina.rubroDeHonorarios(o, suya));
      }
    }
  }
});

test("todas las filas llevan las mismas columnas: el servidor las inserta en un solo lote", async () => {
  // Por REST un lote con filas de distinta forma se rechaza entero, y con él
  // se caería la orden completa, no solo el honorario.
  const api = await import("../api/_rubrosDeLaOrden.js");
  const filas = api.rubrosDeLaOrden({ orden, lineas, iva: 15, obra, capHon });
  const columnas = f => Object.keys(f).sort().join(",");
  assert.equal(filas.length, lineas.length + 1);
  for (const f of filas) assert.equal(columnas(f), columnas(filas[0]));
});

// ── LA PUERTA DEL ENLACE, ENTERA ───────────────────────────────────────────
//
// Que la cuenta sea la misma no alcanza si la puerta no la usa: el error era
// justamente ese. Se levanta el portal de verdad contra una base de mentira
// —nada sale a la red— y se firma como firma el cliente.

process.env.SUPABASE_URL = "http://base.prueba.invalid";
process.env.SUPABASE_SECRET_KEY = "llave-de-prueba";
process.env.RESEND_API_KEY = "llave-de-prueba";

const LLAVE = "llave-de-la-firma-del-cliente-0001";

/** Lo mínimo de la base que toca una firma, en memoria. */
function baseDeMentira({ orden: suOrden, lineas: susLineas, firmas, obra: suObra, control, anteriores = [], rechazaRubros = false }) {
  const b = {
    ordenes: [{ ...suOrden }, ...anteriores.map(o => ({ ...o }))],
    firmas: firmas.map(f => ({ ...f })),
    control: control.map(r => ({ ...r })),
    insertados: [], correos: [],
  };
  // Lo que no devuelve nada —un 204— no lleva cuerpo, como en la base de verdad.
  const responder = (datos, status = 200) => new Response(datos === null ? null : JSON.stringify(datos), { status });
  const id = (q, campo) => Number(String(q.get(campo) || "").replace("eq.", ""));

  b.fetch = async (url, op = {}) => {
    const u = new URL(url);
    const metodo = op.method || "GET";
    const q = u.searchParams;
    const cuerpo = op.body ? JSON.parse(op.body) : null;
    if (u.hostname === "api.resend.com") { b.correos.push(cuerpo); return responder({ id: "correo-1" }); }
    assert.equal(u.hostname, "base.prueba.invalid", `la prueba no puede salir a ${u.hostname}`);
    const tabla = u.pathname.replace("/rest/v1/", "");

    if (tabla === "orden_cambio_aprobaciones") {
      if (metodo === "PATCH") {
        const f = b.firmas.find(x => x.id === id(q, "id"));
        Object.assign(f, cuerpo);
        return responder([f]);
      }
      if (q.get("token")) return responder(b.firmas.filter(f => `eq.${f.token}` === q.get("token")));
      return responder(b.firmas.filter(f => f.envio_at && f.aprueba === true));
    }
    if (tabla === "ordenes_cambio") {
      const o = b.ordenes.find(x => x.id === id(q, "id"));
      if (metodo === "PATCH") { Object.assign(o, cuerpo); return responder(null, 204); }
      return responder(o ? [o] : []);
    }
    if (tabla === "orden_cambio_lineas") return responder(susLineas);
    if (tabla === "obras") return responder([{ nombre: "Obra de prueba", ...suObra }]);
    if (tabla === "usuarios") return responder([{ email: "oficina@prueba.invalid" }]);
    if (tabla === "obra_rubros") {
      if (metodo === "POST") {
        if (rechazaRubros) return responder({ message: "no entra" }, 400);
        b.insertados.push(...cuerpo);
        b.control.push(...cuerpo);
        return responder(null, 201);
      }
      if (metodo === "DELETE") {
        b.control = b.control.filter(r => r.orden_cambio_id !== id(q, "orden_cambio_id"));
        return responder(null, 204);
      }
      if (metodo === "PATCH") return responder(null, 204);
      if (q.get("capitulo")) {
        // El mismo filtro que la oficina: el capítulo de honorarios que la
        // obra ya tiene, el primero de la lista.
        assert.equal(q.get("capitulo"), "ilike.*honorario*");
        return responder(b.control.filter(r => /honorario/i.test(r.capitulo || ""))
          .sort((x, y) => x.capitulo_orden - y.capitulo_orden).slice(0, 1));
      }
      return responder(b.control.filter(r => r.iva_pct != null).slice(0, 1));
    }
    throw new Error(`la prueba no esperaba ${metodo} ${tabla}`);
  };
  return b;
}

/** Firmar por el enlace, como lo hace la pantalla del cliente. */
async function firmarPorElEnlace(base, cuerpo = { aprueba: true }) {
  const { default: portal } = await import("../api/portal.js");
  const antes = globalThis.fetch;
  globalThis.fetch = base.fetch;
  const res = { codigo: 200, cuerpo: null, status(c) { res.codigo = c; return res; }, json(d) { res.cuerpo = d; return res; } };
  try {
    await portal({ method: "POST", query: {}, headers: {}, body: { odc: 1, token: LLAVE, ...cuerpo } }, res);
  } finally { globalThis.fetch = antes; }
  return res;
}

const controlDeLaObra = [
  { id: 1, capitulo: "PRELIMINARES Y VARIOS", capitulo_orden: 1, iva_pct: 15, total_base: 1150 },
  { id: 2, capitulo: "HONORARIOS Y CARGOS", capitulo_orden: 14, iva_pct: 15, total_base: 17250 },
];
const dosFirmas = [
  { id: 1, orden_id: 7, token: "otra-llave-de-otro-firmante-0002", nombre: "Fiscalización", envio_at: "2026-11-01", aprueba: true, aprobado_at: "2026-11-02", observacion: null },
  { id: 2, orden_id: 7, token: LLAVE, nombre: "Cliente", envio_at: "2026-11-01", aprueba: true, aprobado_at: null, observacion: null },
];
const enviada = { ...orden, estado: "enviada", aprobada_at: null, ejecucion: "por_definir" };

test("cuando firma el último por el enlace, entra al control lo mismo que si aprobara la oficina", async () => {
  const base = baseDeMentira({ orden: enviada, lineas, firmas: dosFirmas, obra, control: controlDeLaObra });
  const res = await firmarPorElEnlace(base);
  assert.equal(res.codigo, 200);
  assert.equal(res.cuerpo.aplicada, true);

  // Fila por fila, lo que mete `aprobarOrden` con los mismos datos de la base.
  assert.deepEqual(base.insertados, rubrosDeLaOrden({ orden: enviada, lineas, iva: 15, obra, capHon }));

  // El honorario, que era lo que faltaba: 10% del neto, con IVA, en el
  // capítulo de honorarios que la obra ya tenía.
  const honorario = base.insertados.at(-1);
  assert.equal(honorario.descripcion, "Honorarios 10% sobre OC-03");
  assert.equal(honorario.capitulo, "HONORARIOS Y CARGOS");
  assert.equal(honorario.capitulo_orden, 14);
  assert.equal(honorario.total_base, 207);

  // El contrato vigente sube por el neto y por su honorario, los dos con IVA.
  const subio = base.insertados.reduce((t, f) => t + f.total_base, 0);
  assert.equal(subio, 2070 + 207);

  assert.equal(base.ordenes[0].estado, "aprobada");
  assert.ok(base.ordenes[0].aprobada_at);
  assert.equal(base.ordenes[0].ejecucion, "ejecutado");
});

test("el aviso a la oficina dice lo que entró: las partidas por un lado y el honorario por el otro", async () => {
  const base = baseDeMentira({ orden: enviada, lineas, firmas: dosFirmas, obra, control: controlDeLaObra });
  await firmarPorElEnlace(base);
  assert.equal(base.correos.length, 1);
  const html = base.correos[0].html.replace(/\s+/g, " ");
  assert.match(html, /Sus 3 rubros entraron al control de obra como <strong>ADICIONALES · OC-03<\/strong>, por <strong>\$2\.070,00<\/strong>/);
  assert.match(html, /Honorarios 10% sobre OC-03— entró aparte, al capítulo <strong>HONORARIOS Y CARGOS<\/strong>, por <strong>\$207,00<\/strong>/);
  // Ya no dice que lo que se quita quedó tachado: hace rato que no se tacha.
  assert.doesNotMatch(html, /tachado/);
  assert.match(html, /entró en negativo en ese mismo capítulo/);
});

test("mientras falte una firma no entra nada al control", async () => {
  const faltaUno = dosFirmas.map(f => (f.id === 1 ? { ...f, aprobado_at: null } : f));
  const base = baseDeMentira({ orden: enviada, lineas, firmas: faltaUno, obra, control: controlDeLaObra });
  const res = await firmarPorElEnlace(base);
  assert.equal(res.cuerpo.aplicada, false);
  assert.deepEqual(base.insertados, []);
  assert.equal(base.ordenes[0].estado, "enviada");
});

test("una orden con el honorario en cero entra sin rubro de honorarios, también por el enlace", async () => {
  const sinHonorario = { ...enviada, honorarios_pct: 0 };
  const base = baseDeMentira({ orden: sinHonorario, lineas, firmas: dosFirmas, obra, control: controlDeLaObra });
  await firmarPorElEnlace(base);
  assert.equal(base.insertados.length, lineas.length);
  assert.ok(base.insertados.every(f => f.capitulo === "ADICIONALES · OC-03"));
});

test("al firmarse una revisión por el enlace, la versión anterior sale del control", async () => {
  // Quedando las dos, el contrato vigente suma el mismo trabajo dos veces.
  const original = { id: 3, obra_id: 13, numero: 1, codigo: "OC-01", estado: "aprobada", aprobada_at: "2026-10-01" };
  const revision = { ...enviada, codigo: "OC-01.1", revision_de: 3 };
  const control = [...controlDeLaObra,
    { id: 50, capitulo: "ADICIONALES · OC-01", capitulo_orden: 9001, iva_pct: 15, total_base: 920, orden_cambio_id: 3 },
    { id: 51, capitulo: "HONORARIOS Y CARGOS", capitulo_orden: 14, iva_pct: 15, total_base: 92, orden_cambio_id: 3 }];
  const base = baseDeMentira({ orden: revision, lineas, firmas: dosFirmas, obra, control, anteriores: [original] });
  await firmarPorElEnlace(base);

  assert.deepEqual(base.control.filter(r => r.orden_cambio_id === 3), []);
  assert.equal(base.control.filter(r => r.orden_cambio_id === 7).length, lineas.length + 1);
  const vieja = base.ordenes.find(o => o.id === 3);
  assert.ok(vieja.reemplazada_at, "la original queda marcada como reemplazada");
  assert.equal(vieja.estado, "aprobada", "y no se borra ni cambia de estado: se firmó ese día");
});

test("si el control rechaza los rubros, la orden no queda aprobada ni se toca la versión anterior", async () => {
  const original = { id: 3, obra_id: 13, numero: 1, codigo: "OC-01", estado: "aprobada", aprobada_at: "2026-10-01" };
  const revision = { ...enviada, codigo: "OC-01.1", revision_de: 3 };
  const control = [...controlDeLaObra,
    { id: 50, capitulo: "ADICIONALES · OC-01", capitulo_orden: 9001, iva_pct: 15, total_base: 920, orden_cambio_id: 3 }];
  const base = baseDeMentira({ orden: revision, lineas, firmas: dosFirmas, obra, control, anteriores: [original], rechazaRubros: true });
  const res = await firmarPorElEnlace(base);

  // La firma del cliente sí quedó: lo que no pasó es la entrada al presupuesto.
  assert.equal(res.codigo, 200);
  assert.equal(res.cuerpo.aplicada, false);
  assert.equal(base.ordenes[0].estado, "enviada");
  assert.equal(base.control.filter(r => r.orden_cambio_id === 3).length, 1);
  assert.equal(base.ordenes.find(o => o.id === 3).reemplazada_at, undefined);
  assert.doesNotMatch(base.correos[0].html, /ya entró al presupuesto/);
});

// ── LO QUE ENTRA AL CONTROL ES LO QUE DICE EL DOCUMENTO ────────────────────
//
// La orden calcula su IVA una vez, sobre el neto más el honorario, y eso firma
// el cliente. El control guarda cada partida con su IVA y redondeada. La suma
// de los redondeos no es el redondeo de la suma: la OC-01 del Aéreo decía
// $4.234,92 en su papel y $4.234,94 en el control.

const suma = filas => Math.round(filas.reduce((t, f) => t + f.total_base, 0) * 100) / 100;

test("los rubros de la orden suman el total con IVA de su documento, al centavo", () => {
  // En cada caso de la tabla: todas las órdenes, todas las partidas, todos los IVA.
  let casos = 0;
  for (const o of ORDENES) for (const ls of PARTIDAS) for (const ob of OBRAS) for (const iva of IVAS) {
    const filas = rubrosDeLaOrden({ orden: o, lineas: ls, iva, obra: ob, capHon });
    const documento = oficina.honorariosDe({ lineas: ls, pct: oficina.pctQueCorresponde(o, ob), iva });
    assert.equal(suma(filas), documento.total, JSON.stringify({ o, ls, ob, iva }));
    casos++;
  }
  assert.equal(casos, ORDENES.length * PARTIDAS.length * OBRAS.length * IVAS.length);
});

test("el centavo que falta va a la partida más grande, y el honorario queda como es", () => {
  // Tres partidas de 1,03: con IVA son 1,1845 cada una → 1,18, y pierden medio
  // centavo por cabeza. Neto 3,09; honorario 0,31 → 0,36 con IVA. Sin repartir
  // suman 3,90. El documento: 3,40 + 0,51 de IVA = 3,91.
  const filas = rubrosDeLaOrden({ orden, lineas: PARTIDAS[5], iva: 15, obra, capHon });
  assert.deepEqual(filas.map(f => f.total_base), [1.19, 1.18, 1.18, 0.36]);
  assert.equal(suma(filas), 3.91);
  // El precio unitario no se toca: sigue siendo el de la partida con su IVA.
  assert.equal(filas[0].precio_unitario, 1.18);
});

test("la OC-01 del Aéreo entra por $4.234,92, que es lo que dice su documento", () => {
  const filas = rubrosDeLaOrden({ orden: { id: 5, obra_id: 13, numero: 1, codigo: "OC-01" }, lineas: PARTIDAS[6], iva: 15, obra, capHon });
  assert.deepEqual(filas.map(f => f.total_base), [-8658.68, 10830.22, 511.27, 879.61, 287.5, 385]);
  assert.equal(suma(filas), 4234.92);
});

test("una modificación comparte capítulo y numeración con la orden que modifica", () => {
  const filas = rubrosDeLaOrden({ orden: ORDENES[5], lineas, iva: 15, obra, capHon: null });
  assert.equal(filas[0].numero, 9400);
  assert.equal(filas[0].capitulo_orden, 9004);
  assert.equal(filas[0].orden, 9004000);
  assert.equal(filas[0].capitulo, "ADICIONALES · OC-04-A");
  assert.equal(filas.at(-1).numero, 9499);
  assert.equal(filas.at(-1).capitulo_orden, 9004);
});

test("más de un centavo por fila no es redondeo: no se reparte, para que se vea", () => {
  const filas = [{ total_base: 100 }, { total_base: 50 }];
  assert.equal(cuadrarConElDocumento(filas, 155, 2), 0);
  assert.deepEqual(filas, [{ total_base: 100 }, { total_base: 50 }]);
  // Un centavo sí, y va a la más grande en valor absoluto, sea suma o resta.
  const otras = [{ total_base: 40 }, { total_base: -90 }, { total_base: 5 }];
  assert.equal(cuadrarConElDocumento(otras, -44.99, 2), 0.01);
  assert.deepEqual(otras.map(f => f.total_base), [40, -89.99, 5]);
  // Sin ninguna partida con monto, lo lleva el honorario.
  const solas = [{ total_base: 0 }, { total_base: 11.5 }];
  assert.equal(cuadrarConElDocumento(solas, 11.51, 1), 0.01);
  assert.equal(solas[1].total_base, 11.51);
  // Y sin nada que repartir, no toca nada.
  assert.equal(cuadrarConElDocumento([], 0), 0);
  assert.equal(cuadrarConElDocumento([{ total_base: 10 }], 10), 0);
});

test("el servidor reparte los centavos igual que la oficina", async () => {
  const api = await import("../api/_rubrosDeLaOrden.js");
  for (const [filas, total, n] of [[[{ total_base: 40 }, { total_base: -90 }, { total_base: 5 }], -44.99, 2],
    [[{ total_base: 100 }, { total_base: 50 }], 155, 2], [[{ total_base: 0 }, { total_base: 11.5 }], 11.51, 1]]) {
    const a = filas.map(f => ({ ...f })), b = filas.map(f => ({ ...f }));
    assert.equal(api.cuadrarConElDocumento(a, total, n), cuadrarConElDocumento(b, total, n));
    assert.deepEqual(a, b);
  }
  assert.equal(api.numeroPrincipal(ORDENES[5]), 4);
  assert.equal(api.numeroPrincipal({ numero: 9 }), 9);
});
