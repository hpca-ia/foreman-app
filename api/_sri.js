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
        detalles: todos(xml, "descripcion").slice(0, 40),
      },
    };
  } catch (e) {
    return { error: `No se pudo validar la autorización: ${e.message}` };
  }
}
