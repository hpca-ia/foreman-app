// El SRI, preguntado directo.
//
// Johanna y las residentes reciben facturas todo el día y la revisión que
// importa no es la de los números: es la de si ese comprobante existe, si está
// autorizado, y si el proveedor estaba obligado a imprimir una leyenda que no
// imprimió. Eso hoy se hace entrando a dos páginas del SRI, copiando el RUC,
// copiando la clave de acceso, y comparando a ojo —por factura—. Nadie lo hace
// con cuarenta facturas al mes, y las que no se revisan son justamente las que
// después el SRI no acepta como gasto.
//
// Son dos servicios públicos del SRI, los mismos que usan sus propias páginas:
//
//   1. El catastro del RUC: régimen, si está obligado a llevar contabilidad,
//      si es agente de retención, si es contribuyente especial, su actividad
//      económica — y dos banderas que valen oro: contribuyente fantasma y
//      transacciones inexistentes.
//
//   2. La autorización del comprobante electrónico: con la clave de acceso de
//      49 dígitos devuelve el estado y EL XML AUTORIZADO, que es el documento
//      legal. El papel que trae el proveedor es una representación impresa; lo
//      que el SRI tiene guardado es esto.
//
// Sin llave y sin cuenta: son públicos. Lo único que piden es que el pedido
// parezca de un navegador —sin User-Agent la conexión se corta y no contesta—.

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const CATASTRO = "https://srienlinea.sri.gob.ec/sri-catastro-sujeto-servicio-internet/rest/ConsolidadoContribuyente/obtenerPorNumerosRuc";
const AUTORIZACION = "https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline";

const conTiempo = (ms, promesa) => Promise.race([
  promesa,
  new Promise((_, mal) => setTimeout(() => mal(new Error("el SRI no contestó a tiempo")), ms)),
]);

/** Los datos del contribuyente en el catastro del RUC, o null si no existe. */
export async function consultarRuc(ruc) {
  const limpio = String(ruc || "").replace(/\D/g, "");
  if (limpio.length !== 13) return { error: "El RUC tiene que tener 13 dígitos." };
  try {
    const r = await conTiempo(15000, fetch(`${CATASTRO}?=&ruc=${limpio}`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
    }));
    if (!r.ok) return { error: `El SRI contestó ${r.status} al consultar el RUC.` };
    const datos = await r.json().catch(() => null);
    const uno = Array.isArray(datos) ? datos[0] : datos;
    if (!uno?.numeroRuc) return { error: "El SRI no tiene ningún contribuyente con ese RUC." };
    return { ruc: uno };
  } catch (e) {
    return { error: `No se pudo consultar el RUC: ${e.message}` };
  }
}

const desescapar = t => String(t || "")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&#39;/g, "'").replace(/&amp;/g, "&");

const dentro = (xml, etiqueta) => {
  const m = String(xml).match(new RegExp(`<${etiqueta}>([\\s\\S]*?)</${etiqueta}>`));
  return m ? m[1].trim() : null;
};
const todos = (xml, etiqueta) => {
  const re = new RegExp(`<${etiqueta}>([\\s\\S]*?)</${etiqueta}>`, "g");
  return [...String(xml).matchAll(re)].map(m => m[1].trim());
};

/** Cuánto IVA cobra el XML, sumando los totales por impuesto con tarifa. */
export function ivaDelXml(xml) {
  // Sin el bloque, no se sabe: null, para que valga lo cargado a mano.
  const bloque = dentro(xml, "totalConImpuestos");
  if (!bloque) return null;
  return todos(bloque, "totalImpuesto").reduce((t, imp) => {
    if (dentro(imp, "codigo") !== "2") return t;
    if (["0", "6", "7"].includes(dentro(imp, "codigoPorcentaje"))) return t;
    return t + (Number(dentro(imp, "valor")) || 0);
  }, 0);
}

/**
 * El comprobante como lo tiene el SRI.
 *
 * Devuelve el estado de la autorización y los campos del XML autorizado, que
 * es lo que vale: el papel impreso puede decir cualquier cosa —o estar hecho a
 * mano— y esto es lo que quedó registrado.
 */
export async function autorizacionDe(clave) {
  const limpia = String(clave || "").replace(/\D/g, "");
  if (limpia.length !== 49) return { error: "La clave de acceso tiene que tener 49 dígitos." };
  const sobre = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ec="http://ec.gob.sri.ws.autorizacion">`
    + `<soapenv:Header/><soapenv:Body><ec:autorizacionComprobante>`
    + `<claveAccesoComprobante>${limpia}</claveAccesoComprobante>`
    + `</ec:autorizacionComprobante></soapenv:Body></soapenv:Envelope>`;
  try {
    const r = await conTiempo(20000, fetch(AUTORIZACION, {
      method: "POST",
      headers: { "Content-Type": "text/xml;charset=UTF-8", "User-Agent": UA, SOAPAction: "" },
      body: sobre,
    }));
    if (!r.ok) return { error: `El SRI contestó ${r.status} al validar la autorización.` };
    const texto = await r.text();
    const cuantos = Number(dentro(texto, "numeroComprobantes") || 0);
    if (!cuantos) return { autorizado: false, estado: "NO ENCONTRADO" };

    const estado = dentro(texto, "estado");
    const fechaAutorizacion = dentro(texto, "fechaAutorizacion");
    const ambiente = dentro(texto, "ambiente");
    const xml = desescapar(dentro(texto, "comprobante") || "");

    return {
      autorizado: String(estado || "").toUpperCase() === "AUTORIZADO",
      estado, fechaAutorizacion, ambiente,
      comprobante: {
        tipo: /<notaCredito/.test(xml) ? "nota de crédito" : /<factura/.test(xml) ? "factura" : "comprobante",
        ruc: dentro(xml, "ruc"),
        razonSocial: dentro(xml, "razonSocial"),
        nombreComercial: dentro(xml, "nombreComercial"),
        numero: [dentro(xml, "estab"), dentro(xml, "ptoEmi"), dentro(xml, "secuencial")].filter(Boolean).join("-"),
        fechaEmision: dentro(xml, "fechaEmision"),
        // Las leyendas que el reglamento obliga a imprimir. Son las que la
        // contadora busca con el dedo en el papel.
        obligadoContabilidad: dentro(xml, "obligadoContabilidad"),
        contribuyenteEspecial: dentro(xml, "contribuyenteEspecial"),
        agenteRetencion: dentro(xml, "agenteRetencion"),
        contribuyenteRimpe: dentro(xml, "contribuyenteRimpe"),
        identificacionComprador: dentro(xml, "identificacionComprador"),
        razonSocialComprador: dentro(xml, "razonSocialComprador"),
        importeTotal: Number(dentro(xml, "importeTotal")) || 0,
        // EL IVA QUE DE VERDAD SE COBRÓ, de los totales por impuesto del XML.
        // Código 2 es IVA; el porcentaje 0, 6 (no objeto) y 7 (exento) no
        // cobran nada. Es lo que mira la regla de los negocios populares.
        ivaCobrado: ivaDelXml(xml),
        detalles: todos(xml, "descripcion").slice(0, 40),
      },
    };
  } catch (e) {
    return { error: `No se pudo validar la autorización: ${e.message}` };
  }
}

// ── LAS REGLAS ─────────────────────────────────────────────────────────────
//
// Lo que la contadora revisa factura por factura, y que nadie alcanza a hacer
// con cuarenta al mes. No es una opinión: cada una sale de comparar lo que el
// SRI tiene registrado del proveedor contra lo que el SRI autorizó del
// comprobante.
//
// Dos niveles, porque no todo es lo mismo:
//
//   GRAVE   esa factura no sirve. Pagarla es perder la plata del IVA y del
//           gasto: el SRI no la va a aceptar y no hay cómo arreglarla después.
//           Se avisa por correo.
//   AVISO   la factura vale, pero tiene algo que hay que reclamarle al
//           proveedor —una leyenda que falta, una fecha que no cuadra—. Se ve
//           en la factura y no molesta a nadie por correo.

const si = v => String(v || "").trim().toUpperCase() === "SI";
const limpiarTexto = t => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

/** Las palabras con las que vale la pena comparar dos textos. */
function palabras(t) {
  const VACIAS = new Set(["PARA", "CON", "LOS", "LAS", "DEL", "QUE", "POR", "COMO", "INCLUYE", "OTROS", "DEMAS",
    "TIPO", "CLASE", "GENERAL", "VENTA", "VENTAS", "COMPRA", "SERVICIO", "SERVICIOS", "ACTIVIDADES", "PRODUCTOS"]);
  return new Set(limpiarTexto(t).split(/[^A-ZÑ0-9]+/).filter(p => p.length > 3 && !VACIAS.has(p)));
}

const mismoDia = (emision, autorizacion) => {
  // La emisión viene dd/mm/aaaa y la autorización en ISO con zona horaria.
  const m = String(emision || "").match(/(\d{2})\/(\d{2})\/(\d{4})/);
  const a = String(autorizacion || "").slice(0, 10);
  if (!m || !/^\d{4}-\d{2}-\d{2}$/.test(a)) return null;
  return `${m[3]}-${m[2]}-${m[1]}` === a;
};

/**
 * @param ruc          lo que el catastro del SRI dice del proveedor
 * @param comprobante  los campos del XML autorizado
 * @param autorizacion { estado, ambiente, fechaAutorizacion }
 * @param rucPropio    el RUC de la empresa, para ver si la factura es nuestra
 * @param montos       { iva } como se cargó: vale cuando el XML no lo dice
 */
export function hallazgosDe({ ruc, comprobante, autorizacion, rucPropio, montos }) {
  const h = [];
  const grave = (regla, dice, hacer) => h.push({ nivel: "grave", regla, dice, hacer });
  const aviso = (regla, dice, hacer) => h.push({ nivel: "aviso", regla, dice, hacer });

  // 1. ¿Existe y está autorizado? Todo lo demás se apoya en esto.
  if (!autorizacion?.autorizado) {
    grave("autorizacion", `El SRI no tiene autorizado este comprobante (${autorizacion?.estado || "no contestó"}).`,
      "Pedile al proveedor el comprobante electrónico autorizado. Sin autorización no es una factura.");
    return h;
  }
  if (limpiarTexto(autorizacion.ambiente).startsWith("PRUEBA")) {
    grave("ambiente", "Está emitida en el ambiente de PRUEBAS del SRI, no en producción.",
      "No tiene ningún valor tributario. Que la emitan de nuevo en producción.");
  }

  // 2. ¿Es nuestra? Una factura a nombre de otro no da crédito tributario ni
  //    sustenta el gasto, y es el error que más veces llega: alguien compra
  //    con su cédula y después la pasa a la obra.
  const comprador = String(comprobante?.identificacionComprador || "").replace(/\D/g, "");
  const propio = String(rucPropio || "").replace(/\D/g, "");
  if (propio && comprador && comprador !== propio) {
    grave("comprador", `Está a nombre de ${comprobante.razonSocialComprador || comprador}, no de la empresa.`,
      "No sustenta el gasto ni da crédito tributario. Que la emitan a nombre de la empresa.");
  }

  // 3. El proveedor, en el catastro del SRI.
  if (ruc) {
    const estado = limpiarTexto(ruc.estadoContribuyenteRuc);
    if (estado && estado !== "ACTIVO") {
      grave("ruc", `El RUC del proveedor está ${ruc.estadoContribuyenteRuc}.`,
        "Un comprobante de un RUC que no está activo no sustenta el gasto.");
    }
    if (si(ruc.contribuyenteFantasma)) {
      grave("fantasma", "El SRI tiene a este proveedor marcado como CONTRIBUYENTE FANTASMA.",
        "No pagues sin consultarlo con contabilidad: el SRI desconoce estos gastos y además deja a la empresa en la mira.");
    }
    if (si(ruc.transaccionesInexistente)) {
      grave("inexistentes", "El SRI tiene a este proveedor marcado por TRANSACCIONES INEXISTENTES.",
        "Mismo caso: consultalo con contabilidad antes de pagar.");
    }

    // 4. Las leyendas que el reglamento obliga a imprimir. Faltan seguido y es
    //    lo que el SRI observa en una revisión, factura por factura.
    const regimen = limpiarTexto(ruc.regimen);
    if (regimen.includes("RIMPE") && !comprobante?.contribuyenteRimpe) {
      aviso("rimpe", `El proveedor es de régimen ${ruc.regimen} y la factura no trae la leyenda.`,
        "Es obligatoria. Pedile que la corrija: la próxima tiene que salir con la leyenda impresa.");
    }
    if (si(ruc.agenteRetencion) && !comprobante?.agenteRetencion) {
      aviso("agente", "El proveedor es AGENTE DE RETENCIÓN y la factura no trae la leyenda.",
        "Es obligatoria cuando el SRI lo tiene registrado como agente de retención.");
    }
    const especial = String(ruc.contribuyenteEspecial || "").trim();
    if (especial && !/^NO$/i.test(especial) && !comprobante?.contribuyenteEspecial) {
      aviso("especial", `El proveedor es CONTRIBUYENTE ESPECIAL (${especial}) y la factura no trae la leyenda ni el número de resolución.`,
        "Es obligatoria, con el número de resolución.");
    }
    const contab = String(comprobante?.obligadoContabilidad || "").trim();
    if (!contab) {
      aviso("contabilidad", "La factura no dice si el proveedor está obligado a llevar contabilidad.",
        "Esa leyenda es obligatoria, diga SI o diga NO.");
    } else if (limpiarTexto(contab) !== limpiarTexto(ruc.obligadoLlevarContabilidad)) {
      aviso("contabilidad", `La factura dice "obligado a llevar contabilidad: ${contab}" y en el RUC está como ${ruc.obligadoLlevarContabilidad}.`,
        "Uno de los dos está desactualizado. Avisale al proveedor.");
    }

    // 5. ¿Vende lo que dice que vende? No es un error de forma: una actividad
    //    que no tiene nada que ver con lo facturado es lo primero que mira el
    //    SRI cuando revisa gastos, y lo primero que aparece en una factura de
    //    favor.
    const suyas = palabras(ruc.actividadEconomicaPrincipal);
    const lo = palabras((comprobante?.detalles || []).join(" "));
    if (suyas.size && lo.size && ![...lo].some(p => suyas.has(p))) {
      aviso("actividad", `La actividad registrada del proveedor no se parece a lo facturado.`
        + ` Él: ${String(ruc.actividadEconomicaPrincipal).toLowerCase().slice(0, 90)}. La factura: ${(comprobante.detalles || []).join(", ").slice(0, 90)}.`,
        "Miralo antes de pagar. Si el proveedor de verdad vende esto, no pasa nada; si no, el SRI puede desconocer el gasto.");
    }
  }

  // 5b. UN NEGOCIO POPULAR NO COBRA IVA. El RIMPE de negocios populares
  //     factura con tarifa 0% (o emite notas de venta): si el documento trae
  //     IVA, ese IVA no se debía cobrar y no da crédito tributario. Pagarlo es
  //     pagarle al proveedor un impuesto que no le corresponde. Va fuera del
  //     catastro: la leyenda del comprobante alcanza para saberlo.
  reglaNegocioPopular({ ruc, comprobante, montos }).forEach(x => h.push(x));

  // 6. Emisión y autorización, el mismo día.
  const igual = mismoDia(comprobante?.fechaEmision, autorizacion?.fechaAutorizacion);
  if (igual === false) {
    aviso("fechas", `La factura se emitió el ${comprobante.fechaEmision} y el SRI la autorizó el ${String(autorizacion.fechaAutorizacion).slice(0, 10).split("-").reverse().join("/")}.`,
      "Las dos fechas tienen que ser la misma. Una factura autorizada otro día suele ser una factura cargada tarde.");
  }

  return h;
}

/**
 * ¿Es RIMPE Negocio Popular? Lo dice el catastro (régimen y categoría) o la
 * leyenda impresa en el comprobante, que es "CONTRIBUYENTE NEGOCIO POPULAR -
 * RÉGIMEN RIMPE". Basta con uno de los dos.
 */
export function esNegocioPopular(ruc, comprobante) {
  const catastro = limpiarTexto(`${ruc?.regimen || ""} ${ruc?.categoria || ""} ${ruc?.tipoContribuyente || ""}`);
  const leyenda = limpiarTexto(comprobante?.contribuyenteRimpe);
  return /NEGOCIO\S*\s+POPULAR/.test(catastro) || /NEGOCIO\S*\s+POPULAR/.test(leyenda);
}

/**
 * La regla del negocio popular, sola: también se usa cuando no hay clave de
 * acceso y del comprobante solo se sabe lo que se cargó a mano.
 *
 * El IVA sale del XML autorizado si está; si no, de lo cargado.
 */
export function reglaNegocioPopular({ ruc, comprobante, montos }) {
  if (!esNegocioPopular(ruc, comprobante)) return [];
  const delXml = comprobante && comprobante.ivaCobrado != null ? Number(comprobante.ivaCobrado) : null;
  const iva = delXml != null ? delXml : Math.abs(Number(montos?.iva) || 0);
  if (!(iva > 0.009)) return [];
  return [{
    nivel: "grave", regla: "negocio_popular",
    dice: `El proveedor es RIMPE NEGOCIO POPULAR y el documento cobra $${iva.toFixed(2)} de IVA. Un negocio popular factura con tarifa 0%.`,
    hacer: "No pagues ese IVA: no se debía cobrar y no da crédito tributario. Pedile que anule el documento y lo emita en tarifa 0% (o como nota de venta).",
  }];
}

/** El resumen de los hallazgos, que es lo que se guarda y lo que se mira. */
export function veredicto(hallazgos = []) {
  if (hallazgos.some(x => x.nivel === "grave")) return "grave";
  if (hallazgos.length) return "aviso";
  return "ok";
}
