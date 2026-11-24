// De qué pedido de Compras es un documento, AL CARGARLO.
//
// Hernán, 24/11/2026, con seis pedidos del Aeropuerto en Alertas —$4.798,79
// contados como comprometidos y como gastados—: «no se deben duplicar. ¿Cómo
// evitamos la duplicación y la alerta?». Eran pedidos aprobados en Compras
// cuya factura se cargó después en el control dejando «¿Es de un pedido de
// compra?» en «No». Eligió: que se enganche solo —un solo pedido del mismo
// proveedor y el mismo monto queda elegido; si hay con qué dudar, se pregunta
// antes de guardar—, en la factura del control y en el gasto de caja chica.
//
// Los casos son los seis de esa captura, con los pedidos y las cotizaciones
// como estaban el día que se cargó cada factura.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pedidoDelDocumento, queHacerConElPedido, pedidosYaFacturados } from "../src/modules/controlObra/contadoDosVeces.js";

const leer = ruta => readFileSync(new URL(ruta, import.meta.url), "utf8");
const codigoDe = ruta => leer(ruta).split("\n").filter(l => !l.trim().startsWith("//")).join("\n");

const pedido = (id, mas = {}) => ({ id, estado: "aprobada", factura_id: null, proveedor: null, monto: null,
  monto_estimado: null, proforma_id: null, pagado_at: null, pagado_monto: null, ...mas });
const coti = (id, solicitud_id, monto, proveedor, tipo = "cotizacion") => ({ id, solicitud_id, monto, proveedor, tipo });

const COMPRESOR = pedido(21, { monto_estimado: 590.73, pagado_at: "2026-11-06" });
const RESIDENTE = pedido(19, { monto_estimado: 483, pagado_at: "2026-11-13" });
const PERFILES = pedido(31);
const GYPSUM = pedido(22, { monto_estimado: 4562, pagado_at: "2026-11-05", pagado_monto: 4562 });
const PISO = pedido(25, { monto_estimado: 693.11 });
const VIVIENDA_1 = pedido(8, { proforma_id: 8, pagado_at: "2026-10-08" });
const VIVIENDA_2 = pedido(24, { monto_estimado: 575, pagado_at: "2026-11-12", pagado_monto: 575 });
const PEDIDOS = [COMPRESOR, RESIDENTE, PERFILES, GYPSUM, PISO, VIVIENDA_2];
const ADJUNTOS = [
  coti(37, 21, 590.73, "MEGAMETALES S.A."), coti(42, 21, 590.73, "DEVOLUCION PAGO METAMETALES", "pago"),
  coti(32, 19, 483, "MEDINA ORDOÑEZ EIDER ALBERTO"), coti(61, 19, null, "PAGO EIDER", "pago"),
  coti(56, 31, 175.95, "Grupo Comercial Termikon Cia Ltda"), coti(57, 31, null, "F001-100-000026507"),
  coti(40, 22, 4562, "Kevin Ormaza"), coti(41, 22, null, "report-aOPSh", "pago"),
  coti(49, 25, null, "Proformas9700- Hcarq S.A- Arq Camila Mena-Piso SPC"),
  coti(8, 8, 575, "BURGOS POZO MELBA GRACIELA"), coti(12, 8, 575, "BURGOS POZO MELBA GRACIELA", "pago"),
  coti(48, 24, 575, "BURGOS POZO MELBA GRACIELA"), coti(59, 24, null, "pago estadia", "pago"),
];
const de = (doc, pedidos = PEDIDOS) => pedidoDelDocumento(doc, { solicitudes: pedidos, adjuntos: ADJUNTOS });

test("LO QUE ELIGIÓ: un solo pedido del mismo proveedor y el mismo monto queda elegido", () => {
  // Las tres facturas que terminaron en Alertas sin que hubiera nada que dudar.
  const megametales = de({ total: 590.73, razon_social: "MEGAMETALES S.A.", clase: "factura" });
  assert.equal(megametales.seguro.id, 21);
  assert.deepEqual(megametales.posibles.map(x => [x.pedido.id, x.seguro]), [[21, true]]);
  assert.equal(de({ total: 483, razon_social: "MEDINA ORDOÑEZ EIDER ALBERTO", clase: "factura" }).seguro.id, 19);
  // El proveedor y el monto del pedido casi nunca están en el pedido: están en su cotización.
  const termikon = de({ total: 175.95, razon_social: "GRUPO COMERCIAL TERMIKON CIA. LTDA.", clase: "factura" });
  assert.equal(termikon.seguro.id, 31);
  assert.equal(termikon.posibles[0].monto, 175.95);
  // Sin que nadie toque nada, se engancha solo.
  assert.deepEqual(queHacerConElPedido(megametales, undefined), { pedidoId: 21, solo: true, falta: false });
});

test("un anticipo —el mismo proveedor, otro monto, y el pedido ya pagado— se pregunta, no se engancha solo", () => {
  // El gypsum: pedido de $4.562 y en el control el anticipo de $2.281.
  const r = de({ total: 2281, razon_social: "KEVIN ALEXIS ORMAZA BUENO", clase: "anticipo" });
  assert.equal(r.seguro, null);
  assert.deepEqual(r.posibles.map(x => [x.pedido.id, x.mismoMonto, x.mismoProveedor]), [[22, false, true]]);
  assert.deepEqual(queHacerConElPedido(r, undefined), { pedidoId: null, solo: false, falta: true });
  // Del mismo proveedor por otro monto y con el pedido SIN pagar no se pregunta: puede ser otra compra.
  assert.deepEqual(de({ total: 2281, razon_social: "KEVIN ALEXIS ORMAZA BUENO" }, [{ ...GYPSUM, pagado_at: null, pagado_monto: null }]).posibles, []);
});

test("si solo coincide el monto, se pregunta", () => {
  // El piso laminado: $693,11 los dos, y la cotización guardada con el nombre del archivo.
  const r = de({ total: 693.11, razon_social: "STYLOSDKAS CIA. LTDA.", clase: "factura" });
  assert.equal(r.seguro, null);
  assert.deepEqual(r.posibles.map(x => [x.pedido.id, x.mismoMonto, x.mismoProveedor]), [[25, true, false]]);
  assert.equal(queHacerConElPedido(r, undefined).falta, true);
});

test("dos pedidos iguales —el arriendo de dos meses— se preguntan; con uno solo abierto, es ese", () => {
  const factura = { total: 575, razon_social: "BURGOS POZO MELBA GRACIELA", clase: "factura" };
  const dos = de(factura, [VIVIENDA_1, VIVIENDA_2]);
  assert.equal(dos.seguro, null);
  assert.deepEqual(dos.posibles.map(x => x.pedido.id).sort(), [24, 8]);
  assert.ok(dos.posibles.every(x => x.seguro));
  assert.equal(queHacerConElPedido(dos, undefined).falta, true);
  assert.equal(de(factura, [VIVIENDA_2]).seguro.id, 24);
});

test("lo que no se parece a ningún pedido es un documento suelto: no se elige ni se pregunta nada", () => {
  // El gasto de caja chica de todos los días.
  const tuti = de({ total: 2.96, razon_social: "TIENDAS TUTI TTDE S.A.", clase: "factura" });
  assert.deepEqual(tuti, { seguro: null, posibles: [] });
  assert.deepEqual(queHacerConElPedido(tuti, undefined), { pedidoId: null, solo: false, falta: false });
  // Sin total todavía, una nota de crédito o una proforma: no son la compra de ningún pedido.
  assert.deepEqual(de({ total: 0, razon_social: "MEGAMETALES S.A." }).posibles, []);
  assert.deepEqual(de({ total: 590.73, razon_social: "MEGAMETALES S.A.", clase: "nota_credito" }).posibles, []);
  assert.deepEqual(de({ total: 590.73, razon_social: "MEGAMETALES S.A.", clase: "proforma" }).posibles, []);
  // Y un pedido que ya tiene su documento no se vuelve a ofrecer.
  assert.deepEqual(de({ total: 590.73, razon_social: "MEGAMETALES S.A." }, [{ ...COMPRESOR, factura_id: 171, estado: "comprada" }]).posibles, []);
});

test("lo que contesta quien carga manda siempre", () => {
  const seguro = de({ total: 590.73, razon_social: "MEGAMETALES S.A.", clase: "factura" });
  // «No — es un documento suelto», aunque FOREMAN haya encontrado el pedido.
  assert.deepEqual(queHacerConElPedido(seguro, ""), { pedidoId: null, solo: false, falta: false });
  // Otro pedido, elegido a mano.
  assert.deepEqual(queHacerConElPedido(seguro, "19"), { pedidoId: "19", solo: false, falta: false });
  // Y con qué dudar, contestar destraba el guardado: un pedido, o ninguno.
  const duda = de({ total: 693.11, razon_social: "STYLOSDKAS CIA. LTDA." });
  assert.equal(queHacerConElPedido(duda, "25").falta, false);
  assert.equal(queHacerConElPedido(duda, "").falta, false);
});

test("ES LA REGLA DE LA ALERTA: lo que acá se elige o se pregunta es lo que Alertas avisaría después, y nada más", () => {
  const facturas = [
    { id: 171, total: 590.73, razon_social: "MEGAMETALES S.A.", clase: "factura" },
    { id: 242, total: 483, razon_social: "MEDINA ORDOÑEZ EIDER ALBERTO", clase: "factura" },
    { id: 244, total: 175.95, razon_social: "GRUPO COMERCIAL TERMIKON CIA. LTDA.", clase: "factura" },
    { id: 166, total: 2281, razon_social: "KEVIN ALEXIS ORMAZA BUENO", clase: "anticipo" },
    { id: 210, total: 693.11, razon_social: "STYLOSDKAS CIA. LTDA.", clase: "factura" },
    { id: 243, total: 575, razon_social: "BURGOS POZO MELBA GRACIELA", clase: "factura" },
    { id: 189, total: 2.96, razon_social: "TIENDAS TUTI TTDE S.A.", clase: "factura" },
  ];
  for (const f of facturas) {
    const alCargar = de(f).posibles.map(x => x.pedido.id).sort();
    const despues = pedidosYaFacturados({ solicitudes: PEDIDOS, facturas: [f], adjuntos: ADJUNTOS, pagos: [] }).map(x => x.pedido.id).sort();
    assert.deepEqual(alCargar, despues, `factura ${f.id}`);
  }
  // Los seis pedidos de la captura quedan todos atendidos: tres solos, tres con pregunta.
  const queHizo = facturas.slice(0, 6).map(f => { const r = de(f); return r.seguro ? "solo" : r.posibles.length ? "pregunta" : "nada"; });
  assert.deepEqual(queHizo, ["solo", "solo", "solo", "pregunta", "pregunta", "solo"]);
});

test("la factura del control: el pedido se reconoce al cargarla, no se guarda con la pregunta sin contestar, y se engancha como «Es esta»", () => {
  const c = codigoDe("../src/modules/controlObra/ModalFactura.jsx");
  assert.match(c, /pedidosParaEnganchar\(obra\?\.id, obra\?\.lead_id\)\s+\.then\(r => \{ if \(vivo\) \{ setPedidos\(r\.pedidos\); setAdjuntosDePedidos\(r\.adjuntos\); \} \}\)/);
  assert.match(c, /const delPedido = editando \? \{ pedidoId: null, solo: false, falta: false \}\s+: queHacerConElPedido\(pedidoDelDocumento\(/);
  assert.match(c, /if \(delPedido\.falta\) \{\s+setError\("Hay un pedido de Compras que puede ser el de esta factura\. Elegilo arriba, o marcá que es un documento suelto\."\);\s+return;/);
  // Antes de escribir nada: la pregunta va antes que la revisión de duplicados y que el guardado.
  assert.ok(c.indexOf("if (delPedido.falta)") < c.indexOf("d = await buscarDuplicados({"));
  // El pedido pasa a «comprada» y se le avisa a quien lo pidió, igual que desde Alertas y desde Compras.
  assert.match(c, /const r = await engancharYPonerAlDia\(pedido, \{ id: facturaId, obra_id: obra\.id,/);
  assert.doesNotMatch(c, /engancharFactura\(/);
  assert.match(c, /<PedidoDelDocumento siempre que="esta factura"/);
  // La lista ya no arranca en «No» sin mirar nada.
  assert.doesNotMatch(c, /useState\(""\);\s+const \[form, setForm\]/);
  assert.match(c, /const \[pedidoElegido, setPedidoElegido\] = useState\(undefined\);/);
});

test("caja chica: lo mismo, y el recuadro solo aparece cuando hay un pedido que se le parece", () => {
  const c = codigoDe("../src/modules/ModuloCajaChica.jsx");
  assert.match(c, /pedidosParaEnganchar\(obraDeLaCaja, leadDeLaCaja\)/);
  // Corregir un gasto no vuelve a preguntar, y una devolución no es la compra de ningún pedido.
  assert.match(c, /if \(subVista !== "gasto" \|\| !obraDeLaCaja \|\| corrigiendoId\) \{ setPedidosObra\(\{ pedidos: \[\], adjuntos: \[\] \}\); return; \}/);
  assert.match(c, /total: gastoForm\.tipo === "nota_credito" \|\| Number\(gastoForm\.monto\) < 0 \? 0 : Number\(gastoForm\.monto\) \|\| 0,/);
  assert.match(c, /if \(delPedido\.falta\) \{\s+setNovaError\("Hay un pedido de Compras que puede ser el de este gasto\./);
  assert.match(c, /if \(delPedido\.pedidoId != null && !devuelve\) \{/);
  assert.match(c, /await engancharYPonerAlDia\(pedido, \{ id:facturaObra\.id, obra_id:cajaActiva\.obra_id, total:monto,/);
  // Se engancha después de los rubros: si quien cargó no eligió ninguno, el gasto toma el del pedido.
  assert.ok(c.indexOf('from("obra_asignaciones").insert(filas)') < c.indexOf("await engancharYPonerAlDia(pedido, { id:facturaObra.id"));
  assert.match(c, /<PedidoDelDocumento que="este gasto" pedidos=\{pedidosObra\.pedidos\}/);
  const recuadro = codigoDe("../src/modules/controlObra/PedidoDelDocumento.jsx");
  assert.match(recuadro, /if \(!siempre && !sugerencia\.posibles\.length && hacer\.pedidoId == null\) return null;/);
  assert.match(recuadro, /\{hacer\.falta && <option value="falta" disabled>/);
});

test("los pedidos llegan con sus cotizaciones, que es donde están el monto y el proveedor", () => {
  const c = codigoDe("../src/modules/compras/compras.js");
  assert.match(c, /export async function pedidosParaEnganchar\(obraId, leadId\) \{/);
  assert.match(c, /const pedidos = await comprasSinFacturar\(obraId, lead\);/);
  assert.match(c, /\.select\("id,solicitud_id,monto,proveedor,tipo"\)\.in\("solicitud_id", pedidos\.map\(p => p\.id\)\);/);
  // El pedido entero: si ya figura pagado, qué proforma se eligió, su tarea y quién lo pidió.
  assert.match(c, /const base = \(\) => supabase\.from\("compras_solicitudes"\)\.select\("\*"\)\s+\.is\("factura_id", null\)\.in\("estado", vivas\);/);
});
