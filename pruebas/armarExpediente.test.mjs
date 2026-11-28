import { test } from "node:test";
import assert from "node:assert/strict";
import { armarExpediente, dia } from "../src/lib/armarExpediente.js";

// EL EXPEDIENTE DE UNA TR (Hernán, 28/11/2026: «un PDF con toda su historia:
// orden de compra, factura, aprobación, anexos, comprobante de pago»).

const orden = { id: 12, tr: 66, lead_id: 15, descripcion: "Soldador para estructura", justificacion: "Montaje", estado: "recibida",
  solicitante_nombre: "Lizeth", aprobador_nombre: "Hernan", aprobado_at: "2026-10-17T15:00:00Z", monto: 161, created_at: "2026-10-16T14:00:00Z",
  pagado_at: "2026-10-20T16:00:00Z", pagado_nombre: "Johanna", pagado_monto: 161, factura_id: 77 };
const factura = { id: 77, tr: 66, obra_id: 13, planilla_id: 1, clase: "factura", numero_factura: "001-001-000000123", ruc: "0912345678001",
  razon_social: "CASTRO ORTEGA JOSE JAVIER", detalle: "Soldadura", fecha: "2026-10-19", total: 161, subtotal_15: 140, iva: 21, subtotal_0: 0,
  archivo_url: "caja-9/factura.jpg", origen: "caja_chica", caja_gasto_id: 73, subido_por_nombre: "Lizeth", created_at: "2026-10-19T18:00:00Z",
  sri_estado: "ok", sri_revisado_at: "2026-10-19T18:05:00Z" };
const gasto = { id: 73, tr: 66, caja_id: 9, descripcion: "Soldadura", proveedor: "CASTRO ORTEGA", monto: 161, fecha: "2026-10-19", estado: "aprobado",
  archivo_url: "caja-9/factura.jpg", subido_por_nombre: "Lizeth", aprobado_por_nombre: "Johanna", cierre_id: 28, obra_factura_id: 77, created_at: "2026-10-19T17:59:00Z" };
const completa = {
  tr: 66, proyecto: { id: 15, nombre: "Diners Aeropuerto" }, ordenes: [orden], facturas: [factura], gastos: [gasto],
  historial: [
    { solicitud_id: 12, estado_anterior: "borrador", estado_nuevo: "pendiente_aprobacion", usuario_nombre: "Lizeth", comentario: "", created_at: "2026-10-16T14:05:00Z" },
    { solicitud_id: 12, estado_anterior: "pendiente_aprobacion", estado_nuevo: "aprobada", usuario_nombre: "Hernan", comentario: "ok", created_at: "2026-10-17T15:00:00Z" },
    { solicitud_id: 12, estado_anterior: "aprobada", estado_nuevo: "aprobada", usuario_nombre: "Johanna", comentario: "¿quién compra?", created_at: "2026-10-17T16:00:00Z" },
  ],
  adjuntos: [
    { solicitud_id: 12, tipo: "cotizacion", storage_path: "compras/12/cot.pdf", nombre: "cot.pdf", proveedor: "CASTRO", monto: 161, created_at: "2026-10-16T14:02:00Z" },
    { solicitud_id: 12, tipo: "pago", storage_path: "compras/12/pago.jpg", nombre: "pago.jpg", monto: 161, created_at: "2026-10-20T16:01:00Z" },
  ],
  pendientes: [],
  asignaciones: [{ factura_id: 77, obra_rubro_id: 5, monto: 100 }, { factura_id: 77, obra_actividad_id: 2, monto: 50 }],
  rubros: [{ id: 5, numero: "3.2", descripcion: "Estructura metálica" }], actividades: [{ id: 2, nombre: "Cubierta" }],
  pagos: [{ factura_id: 77, fecha: "2026-10-20", monto: 161, forma: "transferencia", referencia: "4521", registrado_nombre: "Johanna" }],
  planillas: [{ id: 1, numero: 1, nombre: "Planilla N°1", estado: "cerrada" }],
  cajas: [{ id: 9, responsable_nombre: "Lizeth DLC" }], cierres: [{ id: 28, numero: 3, created_at: "2026-10-25T20:00:00Z", cerrado_nombre: "Johanna" }],
  anexos: [{ nota: "Para la viga del ingreso", nombre: "foto.jpg", storage_path: "caja-9/anexo-foto.jpg", subido_por_nombre: "Lizeth", created_at: "2026-10-19T18:10:00Z" }],
};
const bloque = (e, titulo) => e.bloques.find(b => b.titulo.startsWith(titulo));

test("una TR sin ningún papel no arma nada", () => {
  assert.deepEqual(armarExpediente({ tr: 999 }), { vacio: true });
});

test("la carátula dice el código, por dónde entró, la planilla y lo pagado", () => {
  const e = armarExpediente(completa);
  assert.equal(e.titulo, "Expediente PR15-TR66");
  assert.equal(e.nombreArchivo, "Expediente PR15-TR66");
  assert.equal(e.subtitulo, "Diners Aeropuerto · CASTRO ORTEGA JOSE JAVIER · Soldadura");
  const tarjeta = l => e.resumen.find(r => r.label === l).valor;
  assert.equal(tarjeta("Monto"), "$161,00");
  assert.equal(tarjeta("Entró"), "ODC12 · CC9 Lizeth DLC");
  assert.equal(tarjeta("Planilla"), "PL1");
  assert.equal(tarjeta("Pagado"), "$161,00");
  assert.equal(tarjeta("Papeles detrás"), "4");
});

test("la historia va en orden de fecha, con quién hizo cada cosa", () => {
  const filas = bloque(armarExpediente(completa), "La historia").filas;
  assert.deepEqual(filas.map(f => f[1]), [
    "Se subió: cotización",
    "Se envió a aprobar · ODC12",
    "Se aprobó · ODC12",
    "Comentario · ODC12",
    "Gasto de caja chica · CC9",
    "Entró al control: factura",
    "Se revisó en el SRI",
    "Anexo: para quién o para qué",
    // El pago solo guarda el día: cuenta como su mediodía.
    "Se marcó pagada · ODC12",
    "Se subió: comprobante de pago",
    "Pago",
    "Se rindió en la vuelta N° 3",
  ]);
  const aprobo = filas.find(f => f[1] === "Se aprobó · ODC12");
  assert.deepEqual(aprobo, ["17/10/2026", "Se aprobó · ODC12", "Hernan", "ok"]);
  const pago = filas.find(f => f[1] === "Pago");
  assert.deepEqual(pago, ["20/10/2026", "Pago", "Johanna", "$161,00 · transferencia · ref. 4521"]);
});

test("cada parte tiene su cuadro: orden, caja chica, control, asignación y pagos", () => {
  const e = armarExpediente(completa);
  assert.deepEqual(bloque(e, "Orden de compra").filas[0], ["ODC12", "Soldador para estructura", "Montaje", "Lizeth", "Hernan · 17/10/2026", "Recibida", "$161,00"]);
  assert.deepEqual(bloque(e, "Caja chica").filas[0], ["CC9 Lizeth DLC", "19/10/2026", "CASTRO ORTEGA", "Soldadura", "Aprobado", "Johanna", "N° 3", "$161,00"]);
  assert.equal(bloque(e, "En el control de obra").filas[0][5], "PL1 (cerrada)");
  // Lo que falta asignar se dice: $161 del documento, $150 asignados.
  assert.deepEqual(bloque(e, "Asignada a").filas, [["3.2 Estructura metálica", "$100,00"], ["Agrupación: Cubierta", "$50,00"], ["SIN ASIGNAR", "$11,00"]]);
  assert.deepEqual(bloque(e, "Pagos").filas.at(-1), ["", "", "", "TOTAL PAGADO", "$161,00"]);
  assert.equal(bloque(e, "Anexos").filas[0][2], "Para la viga del ingreso");
});

test("los papeles van detrás sin repetir: el gasto y su factura son el mismo archivo", () => {
  const e = armarExpediente(completa);
  assert.deepEqual(e.papeles.map(p => p.ruta), ["compras/12/cot.pdf", "caja-9/factura.jpg", "compras/12/pago.jpg", "caja-9/anexo-foto.jpg"]);
  assert.match(e.papeles[1].titulo, /^Factura 001-001-000000123 — CASTRO ORTEGA JOSE JAVIER — \$161,00$/);
  assert.match(e.papeles[2].titulo, /^Comprobante de pago/);
});

test("lo que no está guardado no se inventa: sin pagos, sin papel, sin asignar", () => {
  const e = armarExpediente({ tr: 22, proyecto: { id: 15, nombre: "Diners Aeropuerto" },
    ordenes: [{ id: 6, tr: 22, lead_id: 15, descripcion: "CAMISAS", estado: "recibida", created_at: "2026-10-06T10:00:00Z", solicitante_nombre: "Lizeth" }],
    facturas: [{ id: 52, tr: 22, planilla_id: 1, clase: "factura", razon_social: "Tello Freire Grecia Irene", total: 184.92, fecha: "2026-10-08", created_at: "2026-10-08T10:00:00Z" }],
    planillas: [{ id: 1, numero: 1, estado: "cerrada" }],
    pendientes: [{ tipo: "factura", texto: "no llega la factura", para_nombre: "Johanna", creado_nombre: "Hernan", created_at: "2026-11-28T10:00:00Z" }] });
  assert.equal(e.papeles.length, 0);
  assert.deepEqual(bloque(e, "Pagos").filas, [["—", "Sin pagos registrados", "", "", "$0,00"]]);
  assert.deepEqual(bloque(e, "Asignada a").filas, [["SIN ASIGNAR", "$184,92"]]);
  assert.equal(bloque(e, "En el control de obra").filas[0][1], "sin número");
  assert.equal(bloque(e, "Pendientes").filas[0][4], "ABIERTO");
  assert.equal(e.resumen.find(r => r.label === "Pagado").valor, "$0,00 · falta $184,92");
  // Sin historial guardado, la orden igual abre la historia.
  assert.equal(bloque(e, "La historia").filas[0][1], "Se pidió · ODC6");
});

test("un gasto de una caja sin proyecto: el código va sin PR", () => {
  const e = armarExpediente({ tr: 1, gastos: [{ id: 1, tr: 1, caja_id: 5, descripcion: "Papel", monto: 12, fecha: "2026-09-01", estado: "aprobado" }],
    cajas: [{ id: 5, responsable_nombre: "PABLO GUERRERO" }] });
  assert.equal(e.titulo, "Expediente TR1");
  assert.equal(e.resumen.find(r => r.label === "Entró").valor, "CC5 PABLO GUERRERO");
  assert.equal(e.resumen.find(r => r.label === "Planilla").valor, "Todavía no");
  assert.equal(e.resumen.find(r => r.label === "Pagado").valor, "—");
});

test("las fechas se leen como se escriben acá", () => {
  assert.equal(dia("2026-11-12"), "12/11/2026");
  assert.equal(dia("2026-11-13T02:30:00Z"), "12/11/2026");   // todavía es 12 en Guayaquil
  assert.equal(dia(null), "");
});

test("el primer renglón del historial es el pedido, no una vuelta a borrador", () => {
  const e = armarExpediente({ tr: 24, proyecto: { id: 15, nombre: "Diners Aeropuerto" },
    ordenes: [{ id: 8, tr: 24, lead_id: 15, descripcion: "VIVIENDA", estado: "recibida", factura_id: 27, monto: 575 }],
    historial: [{ solicitud_id: 8, estado_anterior: null, estado_nuevo: "borrador", usuario_nombre: "Lizeth", created_at: "2026-10-07T10:00:00Z" }] });
  assert.deepEqual(e.bloques[0].filas[0], ["07/10/2026", "Se pidió · ODC8", "Lizeth", "VIVIENDA"]);
  // Y la orden cuya factura se borró del control lo dice, no «todavía no».
  assert.equal(e.resumen.find(r => r.label === "Planilla").valor, "Su factura se borró del control");
  assert.equal(e.bloques.find(b => b.titulo === "Falta en el control").filas[0][0], "ODC8");
});
