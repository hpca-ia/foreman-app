import test from "node:test";
import assert from "node:assert/strict";
import { insumosDeOrden, pedidoDeRedaccion, textoDeRedaccion, cifrasNoRespaldadas, redactarOrden, borradorDeRespaldo }
  from "../src/modules/controlObra/redactarOrden.js";

const RUBROS = [
  { id: 7, numero: "3.04", descripcion: "Cable THHN 12 AWG", cantidad: 80, unidad: "ML", total_base: 320 },
  { id: 9, numero: "3.10", descripcion: "Tablero trifásico 20 espacios", cantidad: 1, unidad: "U", total_base: 180 },
];
const LINEAS = [
  { id: 1, decision: "cobrar", hallazgo: "mas_cantidad", obra_rubro_id: 7, descripcion: "Cable THHN 12 AWG", unidad: "ML", cantidad: 40, monto: 150, texto_papel: "CABLE THHN #12 · 120 ML", cantidad_papel: 120, monto_papel: 450, nota: "el tendido va por el otro lado del patio" },
  { id: 2, decision: "cobrar", hallazgo: "nuevo", obra_rubro_id: null, descripcion: "Acometida eléctrica desde poste", unidad: "GLB", cantidad: 1, monto: 1080 },
  { id: 3, decision: "cobrar", hallazgo: "menos_cantidad", obra_rubro_id: 9, descripcion: "Tablero trifásico 20 espacios", unidad: "U", cantidad: 1, monto: 180 },
  { id: 4, decision: "nuestro", hallazgo: "nuevo", descripcion: "Esto no va", cantidad: 1, monto: 50 },
  { id: 5, decision: "cobrar", hallazgo: "nuevo", descripcion: "Ya está en otra orden", cantidad: 1, monto: 50, orden_cambio_id: 99 },
];
const ANALISIS = { proveedor: "SOLEK", archivo_nombre: "proforma-solek.pdf", fecha_cotizacion: "2026-10-12" };
const OBRA = { nombre: "Casa Cumbayá", cliente_nombre: "Familia Andrade" };

test("los hechos: solo lo que se cobra y no está ya en una orden, en el orden de la orden", () => {
  const ins = insumosDeOrden({ analisis: ANALISIS, lineas: LINEAS, rubros: RUBROS, obra: OBRA, pct: 10 });
  assert.equal(ins.partidas.length, 3);
  // Primero lo que suma, al final lo que se descuenta: el orden de partidasParaOrden.
  assert.deepEqual(ins.partidas.map(p => p.hallazgo), ["mas_cantidad", "nuevo", "menos_cantidad"]);
  const cable = ins.partidas[0];
  assert.equal(cable.n, 1);
  assert.equal(cable.rubro.codigo, "3.04");
  assert.equal(cable.rubro.precioUnitario, 4);      // 320 / 80: el precio del contrato
  assert.equal(cable.costoUnitario, 3.75);          // 150 / 40: lo que cobra el proveedor
  assert.match(cable.quePaso, /supera la contratada/);
  assert.equal(ins.partidas[1].rubro, null);
});

test("el pedido lleva las cifras y la regla de no inventar", () => {
  const ins = insumosDeOrden({ analisis: ANALISIS, lineas: LINEAS, rubros: RUBROS, obra: OBRA, pct: 10 });
  const p = pedidoDeRedaccion(ins);
  assert.match(p, /PROVEEDOR QUE COTIZA: SOLEK/);
  assert.match(p, /FECHA DE LA COTIZACIÓN: 2026-10-12/);
  assert.match(p, /PARTIDA 1: Cable THHN 12 AWG · 40 ML/);
  assert.match(p, /contratado 80 ML a \$4,00 la unidad/);
  assert.match(p, /costo del proveedor: \$3,75 la unidad/);
  assert.match(p, /nota de quien decidió: el tendido va por el otro lado/);
  assert.match(p, /ninguno más/);
});

const RESPUESTA = `JUSTIFICACION:
Se comparó la cotización de SOLEK del 12 de octubre contra el presupuesto contractual.

Aparecieron un trabajo nuevo y más cantidad de cable; el tablero se descuenta.

SOPORTES:
Proforma SOLEK del 2026-10-12. Rubros 3.04 y 3.10 del contrato.

PARTIDA 1: El contrato prevé 80 ML de cable y el tendido requiere 40 ML adicionales, a $3,75 la unidad.
PARTIDA 2: La acometida eléctrica desde el poste no forma parte del presupuesto contractual.
PARTIDA 3: El tablero contratado no se instala: se descuenta la unidad prevista.`;

test("la respuesta se parte en justificación, soportes y una especificación por partida", () => {
  const r = textoDeRedaccion(RESPUESTA);
  assert.match(r.justificacion, /^Se comparó la cotización/);
  assert.match(r.justificacion, /el tablero se descuenta\.$/);
  assert.equal(r.soportes, "Proforma SOLEK del 2026-10-12. Rubros 3.04 y 3.10 del contrato.");
  assert.equal(r.partidas.length, 3);
  assert.equal(r.partidas[2].n, 3);
  assert.match(r.partidas[0].especificacion, /40 ML adicionales/);
});

test("la compuerta: una cifra que no está en los hechos se detecta", () => {
  const ins = insumosDeOrden({ analisis: ANALISIS, lineas: LINEAS, rubros: RUBROS, obra: OBRA, pct: 10 });
  assert.deepEqual(cifrasNoRespaldadas(RESPUESTA, ins), []);
  // 4.500 no sale de ningún lado: ni cantidad, ni precio, ni rubro, ni fecha.
  const inventada = RESPUESTA.replace("a $3,75 la unidad", "a $3,75 la unidad, un total de $4.500");
  assert.deepEqual(cifrasNoRespaldadas(inventada, ins), ["4.500"]);
  // Los conteos y los años no son plata: no se persiguen.
  assert.deepEqual(cifrasNoRespaldadas("Son 3 partidas en 2026, 2 nuevas.", ins), []);
  // Lo que ya estaba escrito en la proforma o en la nota se puede citar.
  assert.deepEqual(cifrasNoRespaldadas("La proforma dice 120 ML y cobra $450.", ins), []);
});

test("si inventa una cifra, se le dice cuál y redacta de nuevo; la segunda limpia pasa", async () => {
  const ins = insumosDeOrden({ analisis: ANALISIS, lineas: LINEAS, rubros: RUBROS, obra: OBRA, pct: 10 });
  const pedidos = [];
  const pedir = async (sistema, usuario) => {
    pedidos.push(usuario);
    return pedidos.length === 1 ? RESPUESTA.replace("a $3,75 la unidad", "por $9.999") : RESPUESTA;
  };
  const { borrador, avisos } = await redactarOrden({ insumos: ins, pedir });
  assert.equal(pedidos.length, 2);
  assert.match(pedidos[1], /cifras que NO están en los hechos: 9\.999/);
  assert.deepEqual(avisos, []);
  assert.equal(borrador.deRespaldo, false);
  assert.equal(borrador.partidas.length, 3);
  assert.match(borrador.partidas[1].especificacion, /acometida/i);
});

test("si insiste con la cifra, el borrador sale igual pero con el aviso a la vista", async () => {
  const ins = insumosDeOrden({ analisis: ANALISIS, lineas: LINEAS, rubros: RUBROS, obra: OBRA, pct: 10 });
  const terca = RESPUESTA.replace("a $3,75 la unidad", "por $9.999");
  const { borrador, avisos } = await redactarOrden({ insumos: ins, pedir: async () => terca });
  assert.equal(borrador.deRespaldo, false);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /9\.999/);
  assert.match(avisos[0], /Revisá la justificación antes de enviar/);
});

test("si el modelo no contesta, la orden sale con el borrador de siempre: nunca se bloquea", async () => {
  const ins = insumosDeOrden({ analisis: ANALISIS, lineas: LINEAS, rubros: RUBROS, obra: OBRA, pct: 10 });
  const { borrador, avisos } = await redactarOrden({ insumos: ins, pedir: async () => { throw new Error("504"); } });
  assert.equal(borrador.deRespaldo, true);
  assert.match(borrador.justificacion, /proforma-solek\.pdf \(SOLEK\) contra el presupuesto contractual/);
  assert.match(borrador.justificacion, /· Cable THHN 12 AWG — el tendido va por el otro lado/);
  // La lista de "soportes" ya no se arma: era el nombre del archivo y una
  // fila por rubro citado, que no le decía nada al que aprueba.
  assert.equal("soportes" in borrador, false);
  assert.equal(avisos.length, 1);
});

test("una partida que el modelo no escribió queda vacía, no inventada", async () => {
  const ins = insumosDeOrden({ analisis: ANALISIS, lineas: LINEAS, rubros: RUBROS, obra: OBRA, pct: 10 });
  const sinLaTres = RESPUESTA.split("\nPARTIDA 3:")[0];
  const { borrador, avisos } = await redactarOrden({ insumos: ins, pedir: async () => sinLaTres });
  assert.equal(borrador.partidas[2].especificacion, "");
  assert.match(avisos[0], /1 partida quedó sin especificación/);
});

test("sin partidas no se llama al modelo", async () => {
  let llamadas = 0;
  const r = await redactarOrden({ insumos: insumosDeOrden({ lineas: [] }), pedir: async () => { llamadas++; return ""; } });
  assert.equal(llamadas, 0);
  assert.equal(r.borrador.deRespaldo, true);
  assert.equal(borradorDeRespaldo({ partidas: [] }).partidas.length, 0);
});
