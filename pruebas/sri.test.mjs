import test from "node:test";
import assert from "node:assert/strict";
import { hallazgosDe, veredicto } from "../api/_sri.js";

// La factura de verdad que destapó todo esto: un estibador vendiendo calzado
// de seguridad, autorizada y a nombre de la empresa.
const ruc = {
  numeroRuc: "0915741565001", razonSocial: "BRIONES ALVAREZ WALTER RICARDO",
  estadoContribuyenteRuc: "ACTIVO", regimen: "GENERAL", obligadoLlevarContabilidad: "NO",
  agenteRetencion: "NO", contribuyenteEspecial: "NO", contribuyenteFantasma: "NO",
  transaccionesInexistente: "NO",
  actividadEconomicaPrincipal: "CARGA Y DESCARGA DE MERCANCÍAS Y EQUIPAJE, INDEPENDIENTEMENTE DEL MODO DE TRANSPORTE UTILIZADO.",
};
const comprobante = {
  ruc: "0915741565001", fechaEmision: "13/10/2026", obligadoContabilidad: "NO",
  identificacionComprador: "1793024602001", razonSocialComprador: "HCARQ S.A.",
  detalles: ["CALZADO DE SEGURIDAD INDUSTRIAL"],
};
const autorizacion = { autorizado: true, estado: "AUTORIZADO", ambiente: "PRODUCCIÓN", fechaAutorizacion: "2026-10-13T14:31:45-05:00" };
const base = { ruc, comprobante, autorizacion, rucPropio: "1793024602001" };
const reglas = h => h.map(x => x.regla);

test("sin autorización no se revisa nada más: eso solo ya la invalida", () => {
  const h = hallazgosDe({ ...base, autorizacion: { autorizado: false, estado: "NO AUTORIZADO" } });
  assert.deepEqual(reglas(h), ["autorizacion"]);
  assert.equal(veredicto(h), "grave");
});

test("una factura a nombre de otro no sustenta el gasto", () => {
  const h = hallazgosDe({ ...base, comprobante: { ...comprobante, identificacionComprador: "1710000000001", razonSocialComprador: "JUAN PEREZ" } });
  assert.ok(h.find(x => x.regla === "comprador" && x.nivel === "grave"));
});

test("el ambiente de pruebas no vale", () => {
  const h = hallazgosDe({ ...base, autorizacion: { ...autorizacion, ambiente: "PRUEBAS" } });
  assert.ok(h.find(x => x.regla === "ambiente" && x.nivel === "grave"));
});

test("contribuyente fantasma y transacciones inexistentes paran el pago", () => {
  const h = hallazgosDe({ ...base, ruc: { ...ruc, contribuyenteFantasma: "SI", transaccionesInexistente: "SI" } });
  assert.ok(h.find(x => x.regla === "fantasma" && x.nivel === "grave"));
  assert.ok(h.find(x => x.regla === "inexistentes" && x.nivel === "grave"));
});

test("si es RIMPE, la leyenda es obligatoria", () => {
  const h = hallazgosDe({ ...base, ruc: { ...ruc, regimen: "RIMPE EMPRENDEDOR" } });
  assert.ok(h.find(x => x.regla === "rimpe"));
  const con = hallazgosDe({ ...base, ruc: { ...ruc, regimen: "RIMPE EMPRENDEDOR" },
    comprobante: { ...comprobante, contribuyenteRimpe: "CONTRIBUYENTE RÉGIMEN RIMPE EMPRENDEDOR" } });
  assert.equal(reglas(con).includes("rimpe"), false);
});

test("agente de retención y contribuyente especial, igual", () => {
  const h = hallazgosDe({ ...base, ruc: { ...ruc, agenteRetencion: "SI", contribuyenteEspecial: "12345" } });
  assert.ok(h.find(x => x.regla === "agente"));
  assert.ok(h.find(x => x.regla === "especial"));
});

test("la leyenda de contabilidad es obligatoria diga SI o diga NO", () => {
  const h = hallazgosDe({ ...base, comprobante: { ...comprobante, obligadoContabilidad: "" } });
  assert.ok(h.find(x => x.regla === "contabilidad"));
});

test("y si no coincide con el RUC, se avisa", () => {
  const h = hallazgosDe({ ...base, comprobante: { ...comprobante, obligadoContabilidad: "SI" } });
  assert.ok(h.find(x => x.regla === "contabilidad"));
});

test("emisión y autorización tienen que ser el mismo día", () => {
  const h = hallazgosDe({ ...base, autorizacion: { ...autorizacion, fechaAutorizacion: "2026-10-20T09:00:00-05:00" } });
  assert.ok(h.find(x => x.regla === "fechas"));
});

test("un estibador vendiendo calzado se marca para mirarlo", () => {
  const h = hallazgosDe(base);
  assert.ok(h.find(x => x.regla === "actividad"));
  assert.equal(veredicto(h), "aviso");
});

test("cuando la actividad sí tiene que ver, no molesta", () => {
  const h = hallazgosDe({ ...base,
    ruc: { ...ruc, actividadEconomicaPrincipal: "VENTA AL POR MENOR DE CALZADO Y ARTÍCULOS DE SEGURIDAD INDUSTRIAL." } });
  assert.equal(reglas(h).includes("actividad"), false);
  assert.equal(veredicto(h), "ok");
});

// ─── RIMPE NEGOCIO POPULAR: tarifa 0% ──────────────────────────────────────
import { esNegocioPopular, reglaNegocioPopular, ivaDelXml } from "../api/_sri.js";

const popular = { ...ruc, regimen: "RIMPE", categoria: "NEGOCIO POPULAR" };

test("un negocio popular que cobra IVA: grave", () => {
  const h = hallazgosDe({ ...base, ruc: popular,
    comprobante: { ...comprobante, contribuyenteRimpe: "CONTRIBUYENTE NEGOCIO POPULAR - RÉGIMEN RIMPE", ivaCobrado: 4.5 } });
  const r = h.find(x => x.regla === "negocio_popular");
  assert.equal(r?.nivel, "grave");
  assert.match(r.dice, /4\.50/);
  assert.equal(veredicto(h), "grave");
});

test("un negocio popular en tarifa 0%: nada que decir", () => {
  const h = hallazgosDe({ ...base, ruc: popular,
    comprobante: { ...comprobante, contribuyenteRimpe: "CONTRIBUYENTE NEGOCIO POPULAR - RÉGIMEN RIMPE", ivaCobrado: 0 } });
  assert.ok(!h.some(x => x.regla === "negocio_popular"));
});

test("el XML manda sobre lo cargado a mano", () => {
  assert.deepEqual(reglaNegocioPopular({ ruc: popular, comprobante: { ivaCobrado: 0 }, montos: { iva: 3 } }), []);
});

test("sin clave de acceso, el IVA cargado alcanza", () => {
  const h = reglaNegocioPopular({ ruc: popular, comprobante: null, montos: { iva: 3 } });
  assert.equal(h[0]?.regla, "negocio_popular");
});

test("un RIMPE emprendedor sí puede cobrar IVA", () => {
  const emprendedor = { ...ruc, regimen: "RIMPE", categoria: "EMPRENDEDOR" };
  assert.equal(esNegocioPopular(emprendedor, null), false);
  assert.deepEqual(reglaNegocioPopular({ ruc: emprendedor, comprobante: null, montos: { iva: 3 } }), []);
});

test("la leyenda del comprobante alcanza aunque el catastro no conteste", () => {
  assert.equal(esNegocioPopular(null, { contribuyenteRimpe: "CONTRIBUYENTE NEGOCIO POPULAR - RÉGIMEN RIMPE" }), true);
});

test("el IVA del XML: solo el que tiene tarifa", () => {
  const xml = `<totalConImpuestos>
    <totalImpuesto><codigo>2</codigo><codigoPorcentaje>0</codigoPorcentaje><baseImponible>10.00</baseImponible><valor>0.00</valor></totalImpuesto>
    <totalImpuesto><codigo>2</codigo><codigoPorcentaje>4</codigoPorcentaje><baseImponible>20.00</baseImponible><valor>3.00</valor></totalImpuesto>
    <totalImpuesto><codigo>3</codigo><codigoPorcentaje>3011</codigoPorcentaje><baseImponible>5.00</baseImponible><valor>1.00</valor></totalImpuesto>
  </totalConImpuestos>`;
  assert.equal(ivaDelXml(xml), 3);
  assert.equal(ivaDelXml("<factura></factura>"), null, "sin el bloque no se sabe");
});
