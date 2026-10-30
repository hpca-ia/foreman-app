import test from "node:test";
import assert from "node:assert/strict";
import { comprometidoPorGrupo, montoDeSolicitud, solicitudesDeLaObra, calcularControl, agrupar, gastosDe, resumenPlanilla, gastosSueltos, quizaYaSeCompro }
  from "../src/modules/controlObra/calculos.js";

// Cuánta plata hay hablada contra la obra. Todo lo de acá salió de un número
// que apareció mal en el control de una obra de verdad.

const pedido = (estado, estimado, extra = {}) =>
  ({ id: Math.random(), estado, monto_estimado: estimado, ...extra });

test("comprometido es lo pedido y lo aprobado, nada más", () => {
  const c = comprometidoPorGrupo([
    pedido("pendiente_aprobacion", 100),
    pedido("aprobada", 200),
    pedido("comprada", 300),
    pedido("requiere_info", 400),
    pedido("borrador", 500),
    pedido("anulada", 600),
  ], [], []);
  assert.equal(c.total, 300);
});

test("LO DEVUELTO NO ESTÁ COMPROMETIDO: nadie lo aprobó", () => {
  // Contarlo infló el comprometido con pedidos rechazados, y peor: una
  // devuelta que nadie arregla queda viva para siempre, así que el número no
  // bajaba a cero nunca.
  const c = comprometidoPorGrupo([pedido("requiere_info", 1500)], [], []);
  assert.equal(c.total, 0);
  assert.equal(c.devuelto, 1500, "pero se cuenta aparte: es una tarea sin dueño");
});

test("al comprar sale del comprometido sin que nadie enganche nada", () => {
  const antes = comprometidoPorGrupo([pedido("aprobada", 575)], [], []);
  const despues = comprometidoPorGrupo([pedido("comprada", 575)], [], []);
  assert.equal(antes.total, 575);
  assert.equal(despues.total, 0);
  assert.equal(despues.comprado, 575, "pasa al cajón de comprado sin factura");
});

test("con factura no está en ningún cajón: ya es gasto planillado", () => {
  const c = comprometidoPorGrupo([pedido("comprada", 575, { factura_id: 9 })], [], []);
  assert.equal(c.total + c.comprado + c.devuelto, 0);
});

test("CADA ESTADO CAE EN UN SOLO CAJÓN, nunca en dos", () => {
  // La regla que pidió Hernán: la misma plata no puede estar comprometida y
  // planillada a la vez, porque el control la contaría dos veces.
  for (const e of ["pendiente_aprobacion", "aprobada", "comprada", "recibida", "requiere_info"]) {
    const c = comprometidoPorGrupo([pedido(e, 1000)], [], []);
    const cajones = [c.total > 0, c.comprado > 0, c.devuelto > 0].filter(Boolean).length;
    assert.equal(cajones, 1, `"${e}" cayó en ${cajones} cajones`);
  }
});

test("lo asignado a una agrupación va al bloque de gasto sin presupuesto", () => {
  // Vivienda y oficina no son capítulos del contrato porque no están
  // contratados. Antes caían en "SIN CAPÍTULO", que no tiene fila: sumaban en
  // el total y no aparecían en ningún renglón.
  const c = comprometidoPorGrupo([pedido("aprobada", 575, { obra_actividad_id: 4 })], [], []);
  assert.equal(c.porCapitulo["GASTOS SIN PRESUPUESTO"], 575);
  assert.equal(c.porActividad.a4, 575);
});

test("EL DOCUMENTO LE GANA AL ESTIMADO", () => {
  // `monto` solo se escribe al ELEGIR una proforma, y casi nadie elige: se
  // suben dos o tres y ahí queda. El pedido valía cero con su precio adentro
  // de un papel subido.
  const proformas = [{ id: 11, solicitud_id: 8, monto: 575 }];
  assert.deepEqual(
    montoDeSolicitud({ id: 8, monto: null, monto_estimado: null }, proformas),
    { monto: 575, de: "su única proforma" });
});

test("lo acordado le gana a la proforma, y la elegida a las demás", () => {
  const p = [{ id: 1, solicitud_id: 9, monto: 900 }, { id: 2, solicitud_id: 9, monto: 750 }];
  assert.equal(montoDeSolicitud({ id: 9, monto: 600 }, p).monto, 600);
  assert.equal(montoDeSolicitud({ id: 9, proforma_id: 1 }, p).monto, 900);
});

test("NUNCA suma las proformas: son alternativas, no partes de un total", () => {
  const p = [{ id: 1, solicitud_id: 9, monto: 900 }, { id: 2, solicitud_id: 9, monto: 750 }];
  const r = montoDeSolicitud({ id: 9 }, p);
  assert.notEqual(r.monto, 1650);
  assert.equal(r.monto, 750, "con varias sin elegir, la cota baja honesta");
});

test("sin ningún número dice que no hay monto, no que valga cero", () => {
  // Para un control, "no cuesta nada" y "no se sabe cuánto cuesta" son cosas
  // opuestas.
  assert.equal(montoDeSolicitud({ id: 1 }, []).de, "sin monto");
});

test("un pedido es de la obra si apunta a ella, o si no apunta a ninguna y es de su proyecto", () => {
  // Las dos consultas iban en cadena con un `return` en el medio: con que UN
  // pedido tuviera obra_id, los que colgaban del proyecto no se buscaban
  // nunca. El control veía un pedido de tres.
  const obra = { id: 7, lead_id: 42 };
  const filas = [
    { id: 1, obra_id: 7, lead_id: 42 },
    { id: 2, obra_id: null, lead_id: 42 },
    { id: 3, obra_id: 9, lead_id: 42 },     // de otra obra del mismo proyecto
    { id: 4, obra_id: null, lead_id: 99 },  // de otro proyecto
  ];
  assert.deepEqual(solicitudesDeLaObra(filas, obra).map(s => s.id), [1, 2]);
});

test("los ids se comparan como números, no como texto", () => {
  // PostgREST puede devolver un bigint como texto, y "7" === 7 es falso:
  // alcanzaba eso para que un pedido no se reconociera como de su obra.
  assert.equal(solicitudesDeLaObra([{ id: 1, obra_id: "7", lead_id: 42 }], { id: 7, lead_id: 42 }).length, 1);
});

test("una factura cargada al CAPÍTULO suma al capítulo y no se reparte", () => {
  // La factura de $4.000 del maestro albañil no es "$180 de mampostería, $310
  // de enlucido y $94 de mochetas": es $4.000 de albañilería. Prorratearla
  // inventa una precisión que no existe.
  const rubros = [
    { id: 1, capitulo: "ALBAÑILERÍA", capitulo_orden: 1, orden: 1, numero: 1, total_base: 5000 },
    { id: 2, capitulo: "ALBAÑILERÍA", capitulo_orden: 1, orden: 2, numero: 2, total_base: 3000 },
  ];
  const facturas = [{ id: 9, _planillaNumero: 1 }];
  const asignaciones = [{ factura_id: 9, capitulo: "ALBAÑILERÍA", monto: 4000 }];
  const porRubro = calcularControl({ rubros, facturas, asignaciones, planillaNumero: 1 });

  assert.equal(porRubro[1].acumulado, 0, "ningún rubro se lleva nada");
  assert.equal(porRubro[2].acumulado, 0);

  const grupos = agrupar(rubros, porRubro, "capitulo", []);
  const alba = grupos.find(g => g.capitulo === "ALBAÑILERÍA");
  assert.equal(alba.acumulado, 4000, "pero el capítulo sí lo suma");
  assert.equal(alba.saldo, 4000, "8000 de presupuesto menos 4000 gastados");
});

test("se puede ver de qué gastos está hecho el número de un rubro", () => {
  const rubros = [
    { id: 1, capitulo: "ALBAÑILERÍA", actividad_id: 7, total_base: 1000 },
    { id: 2, capitulo: "ALBAÑILERÍA", actividad_id: 7, total_base: 3000 },
  ];
  const facturas = [
    { id: 9, fecha: "2026-03-02", razon_social: "Kywi", numero_factura: "001-1", _planillaNumero: 1 },
    { id: 10, fecha: "2026-03-05", razon_social: "Disensa", numero_factura: "001-2", _planillaNumero: 1 },
  ];
  const asignaciones = [
    { factura_id: 9, obra_rubro_id: 1, monto: 400 },
    { factura_id: 10, obra_actividad_id: 7, monto: 800 },   // se prorratea 1:3
  ];
  const g = gastosDe({ rubroId: 1 }, { facturas, asignaciones, rubros });
  assert.equal(g.length, 2, "la suya y la parte que le tocó del prorrateo");
  assert.equal(g.find(x => x.exacto).monto, 400);
  assert.equal(g.find(x => !x.exacto).monto, 200, "un cuarto de 800");
});

test("lo prorrateado se marca como tal: no es lo que dice la factura", () => {
  const rubros = [{ id: 1, actividad_id: 7, total_base: 1000 }];
  const g = gastosDe({ rubroId: 1 }, {
    facturas: [{ id: 9, fecha: "2026-03-05" }],
    asignaciones: [{ factura_id: 9, obra_actividad_id: 7, monto: 500 }],
    rubros,
  });
  assert.equal(g[0].exacto, false);
});

test("lo cargado al capítulo entero aparece en el capítulo", () => {
  const g = gastosDe({ capitulo: "ALBAÑILERÍA" }, {
    facturas: [{ id: 9, fecha: "2026-03-05" }],
    asignaciones: [{ factura_id: 9, capitulo: "ALBAÑILERÍA", monto: 4000 }],
    rubros: [],
  });
  assert.equal(g.length, 1);
  assert.equal(g[0].alCapitulo, true);
});

test("una asignación sin su factura no revienta ni inventa una fila", () => {
  const g = gastosDe({ rubroId: 1 }, {
    facturas: [], asignaciones: [{ factura_id: 99, obra_rubro_id: 1, monto: 100 }], rubros: [],
  });
  assert.deepEqual(g, []);
});

// ── Anticipos a proveedor: plata que salió, obra que todavía no está ──

test("UN ANTICIPO ES GASTO: la plata salió de la caja", () => {
  // Esta prueba decía lo contrario —que un anticipo no suma a invertido— con
  // el argumento de que el material todavía no llegó. Eso mira el avance de
  // OBRA; el control de presupuesto mira la PLATA, y la plata salió. El avance
  // de obra tiene su propia columna, que sale de lo que cada rubro dice que
  // tiene ejecutado y no de las facturas.
  const rubros = [{ id: 1, total_base: 20000, actividad_id: null }];
  const facturas = [
    { id: 10, _planillaNumero: 1, clase: "anticipo" },
    { id: 11, _planillaNumero: 1, clase: "factura" },
  ];
  const asignaciones = [
    { factura_id: 10, obra_rubro_id: 1, monto: 6000 },
    { factura_id: 11, obra_rubro_id: 1, monto: 2000 },
  ];
  const r = calcularControl({ rubros, facturas, asignaciones, planillaNumero: 1 });
  assert.equal(r[1].periodo, 8000, "los dos: lo anticipado salió igual");
  assert.equal(r[1].acumulado, 8000);
  assert.equal(r[1].saldo, 12000);
  // Y se sigue diciendo cuánto espera su comprobante: un gasto que no se puede
  // justificar hay que verlo antes de que pasen tres meses.
  assert.equal(r._anticipado, 6000, "lo que falta documentar");
});

test("liquidado contra su factura, el anticipo deja de contar por su cuenta", () => {
  // Si contaran los dos, el gasto estaría dos veces.
  const rubros = [{ id: 1, total_base: 20000, actividad_id: null }];
  const facturas = [
    { id: 10, _planillaNumero: 1, clase: "anticipo", facturada_con_id: 11 },
    { id: 11, _planillaNumero: 1, clase: "factura" },
  ];
  const asignaciones = [
    { factura_id: 10, obra_rubro_id: 1, monto: 6000 },
    { factura_id: 11, obra_rubro_id: 1, monto: 6000 },
  ];
  const r = calcularControl({ rubros, facturas, asignaciones, planillaNumero: 1 });
  assert.equal(r[1].acumulado, 6000, "una sola vez, la de la factura");
  assert.equal(r._anticipado, 0);
});

test("un anticipo LIQUIDADO deja de ser anticipo: lo que vale es la factura", () => {
  const rubros = [{ id: 1, total_base: 20000, actividad_id: null }];
  const facturas = [
    { id: 10, _planillaNumero: 1, clase: "anticipo", facturada_con_id: 11 },
    { id: 11, _planillaNumero: 1, clase: "factura" },
  ];
  // Al liquidar, la asignación del anticipo se borra y queda la de la factura.
  const asignaciones = [{ factura_id: 11, obra_rubro_id: 1, monto: 20000 }];
  const r = calcularControl({ rubros, facturas, asignaciones, planillaNumero: 1 });
  assert.equal(r[1].acumulado, 20000);
  assert.equal(r._anticipado, 0);
});

test("sin anticipos, el control cuenta igual que siempre", () => {
  const rubros = [{ id: 1, total_base: 1000, actividad_id: null }];
  const facturas = [{ id: 10, _planillaNumero: 1, clase: "factura" }];
  const r = calcularControl({
    rubros, facturas,
    asignaciones: [{ factura_id: 10, obra_rubro_id: 1, monto: 400 }],
    planillaNumero: 1,
  });
  assert.equal(r[1].acumulado, 400);
  assert.equal(r._anticipado, 0);
});

// ── Invertido es la plata que se puso, no el papel que se emitió ──

test("UNA FACTURA DE 10.000 CON 2.000 ANTICIPADOS PUSO 2.000 EN LA OBRA", () => {
  const rubros = [{ id: 1, total_base: 30000, actividad_id: null }];
  const facturas = [{ id: 10, _planillaNumero: 1, total: 10000, clase: "factura" }];
  const asignaciones = [{ factura_id: 10, obra_rubro_id: 1, monto: 10000 }];
  const pagos = [{ factura_id: 10, monto: 2000 }];
  const r = calcularControl({ rubros, facturas, asignaciones, pagos, planillaNumero: 1 });
  assert.equal(r[1].periodo, 2000);
  assert.equal(r[1].saldo, 28000, "los 8.000 que faltan siguen siendo presupuesto por gastar");
  assert.equal(r._porPagar, 8000, "y son deuda con el proveedor");
});

test("una factura repartida entre rubros entra en la misma proporción", () => {
  const rubros = [
    { id: 1, total_base: 10000, actividad_id: null },
    { id: 2, total_base: 10000, actividad_id: null },
  ];
  const facturas = [{ id: 10, _planillaNumero: 1, total: 10000, clase: "factura" }];
  const asignaciones = [
    { factura_id: 10, obra_rubro_id: 1, monto: 6000 },
    { factura_id: 10, obra_rubro_id: 2, monto: 4000 },
  ];
  const pagos = [{ factura_id: 10, monto: 5000 }];   // la mitad
  const r = calcularControl({ rubros, facturas, asignaciones, pagos, planillaNumero: 1 });
  assert.equal(r[1].periodo, 3000);
  assert.equal(r[2].periodo, 2000);
});

test("una factura pagada entera entra entera", () => {
  const rubros = [{ id: 1, total_base: 5000, actividad_id: null }];
  const r = calcularControl({
    rubros,
    facturas: [{ id: 10, _planillaNumero: 1, total: 1200, clase: "factura" }],
    asignaciones: [{ factura_id: 10, obra_rubro_id: 1, monto: 1200 }],
    pagos: [{ factura_id: 10, monto: 1200 }],
    planillaNumero: 1,
  });
  assert.equal(r[1].acumulado, 1200);
  assert.equal(r._porPagar, 0);
});

test("pagar de más no hace que entre de más", () => {
  const rubros = [{ id: 1, total_base: 5000, actividad_id: null }];
  const r = calcularControl({
    rubros,
    facturas: [{ id: 10, _planillaNumero: 1, total: 1000, clase: "factura" }],
    asignaciones: [{ factura_id: 10, obra_rubro_id: 1, monto: 1000 }],
    pagos: [{ factura_id: 10, monto: 1500 }],
    planillaNumero: 1,
  });
  assert.equal(r[1].acumulado, 1000);
});

test("SIN NINGÚN PAGO CARGADO el control cuenta por facturas, como antes", () => {
  const rubros = [{ id: 1, total_base: 5000, actividad_id: null }];
  const r = calcularControl({
    rubros,
    facturas: [{ id: 10, _planillaNumero: 1, total: 1200, clase: "factura" }],
    asignaciones: [{ factura_id: 10, obra_rubro_id: 1, monto: 1200 }],
    pagos: [],
    planillaNumero: 1,
  });
  assert.equal(r[1].acumulado, 1200);
  assert.equal(r._seLlevanPagos, false);
});

test("lo cargado a un capítulo entero también entra por lo pagado", () => {
  const rubros = [{ id: 1, total_base: 9000, capitulo: "ALBAÑILERÍA", actividad_id: null }];
  const r = calcularControl({
    rubros,
    facturas: [{ id: 10, _planillaNumero: 1, total: 4000, clase: "factura" }],
    asignaciones: [{ factura_id: 10, capitulo: "ALBAÑILERÍA", monto: 4000 }],
    pagos: [{ factura_id: 10, monto: 1000 }],
    planillaNumero: 1,
  });
  assert.equal(r._porCapitulo["ALBAÑILERÍA"].periodo, 1000);
});

// UNA NOTA DE CRÉDITO NO ESPERA NINGÚN PAGO.
test("el vale baja el gasto del rubro en el momento, sin pago", () => {
  const rubros = [{ id: 1, total_base: 1000, capitulo: "A", orden: 1 }];
  const facturas = [
    { id: 10, _planillaNumero: 1, total: 300, clase: "factura" },
    { id: 11, _planillaNumero: 1, total: -100, clase: "nota_credito" },
  ];
  const asignaciones = [
    { factura_id: 10, obra_rubro_id: 1, monto: 300 },
    { factura_id: 11, obra_rubro_id: 1, monto: -100 },
  ];
  const pagos = [{ factura_id: 10, monto: 300 }];
  const r = calcularControl({ rubros, facturas, asignaciones, pagos, planillaNumero: 1 });
  assert.equal(Math.round(r[1].acumulado * 100) / 100, 200);
  assert.equal(r._porPagar, 0);
});

test("lo facturado y no pagado sí queda como por pagar", () => {
  const rubros = [{ id: 1, total_base: 1000, capitulo: "A", orden: 1 }];
  const facturas = [{ id: 10, _planillaNumero: 1, total: 400, clase: "factura" }];
  const asignaciones = [{ factura_id: 10, obra_rubro_id: 1, monto: 400 }];
  const r = calcularControl({ rubros, facturas, asignaciones, pagos: [{ factura_id: 10, monto: 100 }], planillaNumero: 1 });
  assert.equal(Math.round(r[1].acumulado * 100) / 100, 100);
  assert.equal(r._porPagar, 300);
});

// LA PLANILLA, EN TRES MONTONES.
test("la planilla separa gasto, anticipos y crédito", () => {
  const facturas = [
    { id: 1, total: 1000, clase: "factura" },
    { id: 2, total: 5000, clase: "anticipo" },
    { id: 3, total: -105.06, clase: "nota_credito" },
  ];
  const r = resumenPlanilla({ facturas, asignaciones: [] });
  assert.equal(r.gasto, 1000);
  assert.equal(r.anticipos, 5000);
  assert.equal(r.credito, 105.06);
  assert.equal(r.cuantosAnticipos, 1);
  assert.equal(r.cuantasNotas, 1);
  // El total sigue cuadrando contra el libro: gasto + anticipos − crédito.
  assert.equal(r.total, 5894.94);
});

test("un anticipo ya liquidado es gasto como cualquier factura", () => {
  const r = resumenPlanilla({ facturas: [{ id: 2, total: 5000, clase: "anticipo", facturada_con_id: 9 }], asignaciones: [] });
  assert.equal(r.anticipos, 0);
  assert.equal(r.gasto, 5000);
});

test("de qué está hecho GASTOS SIN PRESUPUESTO", () => {
  const facturas = [
    { id: 1, razon_social: "Autoparking SA", fecha: "2026-10-02", total: 1.4 },
    { id: 2, razon_social: "AVIANCA", fecha: "2026-10-15", total: 213.68 },
    { id: 3, razon_social: "KYWI", fecha: "2026-10-10", total: 72.69 },
  ];
  const asignaciones = [
    { factura_id: 1, obra_actividad_id: 192, monto: 1.4 },
    { factura_id: 2, obra_actividad_id: 191, monto: 213.68 },
    { factura_id: 3, obra_rubro_id: 77, monto: 72.69 },          // tiene rubro: no es suelto
  ];
  const rubros = [{ id: 77, actividad_id: 50 }];
  const actividades = [{ id: 192, nombre: "LOGÍSTICA" }, { id: 191, nombre: "VIÁTICOS" }];
  const g = gastosSueltos({ facturas, asignaciones, rubros, actividades });
  assert.deepEqual(g.map(x => [x.proveedor, x.monto, x.agrupacion]),
    [["AVIANCA", 213.68, "VIÁTICOS"], ["Autoparking SA", 1.4, "LOGÍSTICA"]]);
});

test("lo de una agrupación que sí tiene rubros no es suelto", () => {
  const g = gastosSueltos({
    facturas: [{ id: 1, total: 10 }],
    asignaciones: [{ factura_id: 1, obra_actividad_id: 7, monto: 10 }],
    rubros: [{ id: 3, actividad_id: 7 }],
    actividades: [{ id: 7, nombre: "ALBAÑILERÍA" }],
  });
  assert.deepEqual(g, []);
});

test("avisa qué pedido vivo ya tiene una factura por el mismo monto", () => {
  const detalle = [{ id: 12, monto: 161, descripcion: "Impresora" }, { id: 18, monto: 1725, descripcion: "Residente" }];
  const facturas = [
    { id: 77, total: 161, razon_social: "CASTRO ORTEGA JOSE JAVIER", detalle: "Impresora EPSON L355" },
    { id: 90, total: 900, clase: "proforma" },
  ];
  const r = quizaYaSeCompro(detalle, facturas);
  assert.equal(r[12].id, 77);
  assert.equal(r[18], undefined);
});

test("una proforma no cuenta como factura ya cargada", () => {
  const r = quizaYaSeCompro([{ id: 1, monto: 500 }], [{ id: 9, total: 500, clase: "proforma" }]);
  assert.deepEqual(r, {});
});
