// LA CUENTA DE CADA PROVEEDOR: lo que se le documentó, lo que se le pagó, lo
// que le debemos y lo que nos debe a nosotros.
//
// Vive aparte de `pagos.js` porque eso habla con la base y esto es aritmética:
// es la cuenta con la que se decide a quién se le paga esta semana, y una
// cuenta con la que se decide tiene que poder probarse.

const n = v => Number(v) || 0;
const r2 = v => Math.round(v * 100) / 100;

/** Los documentos que RESTAN en vez de sumar. */
export const esNotaDeCredito = clase => clase === "nota_credito";

/** Lo pagado de cada documento, por su id. */
export function pagadoPorFactura(pagos = []) {
  const mapa = {};
  pagos.forEach(p => { mapa[p.factura_id] = (mapa[p.factura_id] || 0) + n(p.monto); });
  return mapa;
}

/** Un documento con su plata al día: total, pagado, saldo y en qué anda. */
export function estadoDe(factura, pagado = 0) {
  const total = n(factura.total);
  const saldo = Math.round((total - pagado) * 100) / 100;
  return {
    total, pagado, saldo,
    // Medio centavo de tolerancia: los redondeos de IVA no pueden dejar una
    // factura "casi pagada" para siempre.
    estado: pagado <= 0.005 ? "sin_pagar" : saldo <= 0.005 ? "pagado" : "parcial",
    pct: total > 0 ? pagado / total : 0,
  };
}

export const ETIQUETA_PAGO = {
  sin_pagar: { label: "Sin pagar", color: "danger" },
  parcial:   { label: "Pago parcial", color: "warning" },
  pagado:    { label: "Pagado", color: "success" },
};

/**
 * La cuenta de cada proveedor: cuánto se le documentó, cuánto se le pagó y
 * cuánto le debemos.
 *
 * Se agrupa por RUC cuando lo hay, y por razón social cuando no: el RUC es lo
 * único que de verdad identifica a un proveedor —"FERRETERÍA EL SOL" y
 * "Ferreteria El Sol S.A." son el mismo— pero no todas las facturas viejas lo
 * tienen cargado.
 *
 * Las proformas se cuentan aparte de las facturas: una proforma no es una
 * deuda exigible, es plata comprometida que además hay que hacer facturar.
 */
export function cuentasPorProveedor(facturas = [], pagos = []) {
  const pagado = pagadoPorFactura(pagos);
  const cuentas = new Map();

  facturas.forEach(f => {
    const clave = (f.ruc || "").trim() || (f.razon_social || "").trim().toUpperCase() || "SIN PROVEEDOR";
    if (!cuentas.has(clave)) {
      cuentas.set(clave, {
        clave, ruc: f.ruc || "", nombre: f.razon_social || "Sin proveedor",
        facturado: 0, pagado: 0, saldo: 0, proformas: 0, porFacturar: 0,
        credito: 0, creditoUsado: 0,
        documentos: [],
      });
    }
    const c = cuentas.get(clave);
    if (f.razon_social && !c.nombre) c.nombre = f.razon_social;
    const e = estadoDe(f, pagado[f.id] || 0);

    if (f.clase === "proforma") {
      // Una proforma ya facturada dejó de serlo: su plata la cuenta la factura.
      if (!f.facturada_con_id) { c.proformas += e.total; c.porFacturar += 1; }
    } else if (esNotaDeCredito(f.clase) || e.total < 0) {
      // UNA NOTA DE CRÉDITO NO ES UNA DEUDA AL REVÉS: ES PLATA NUESTRA QUE
      // ESTÁ EN LA CASA DEL PROVEEDOR.
      //
      // Devolvimos material y nos dieron un vale. Eso no baja lo que le
      // debemos —se lo debemos igual, y el día que se lo paguemos va a salir
      // la misma plata—: es un crédito a favor, y vale como efectivo hasta que
      // se use en una compra. Restándolo de la deuda, el total decía que le
      // debemos menos y el vale desaparecía de la vista, que es la forma más
      // segura de que nadie se acuerde de usarlo.
      //
      // Usada —apuntando a la factura donde se aplicó— deja de estar a favor:
      // ya se gastó.
      if (f.facturada_con_id) c.creditoUsado += Math.abs(e.total);
      else c.credito += Math.abs(e.total);
    } else {
      c.facturado += e.total;
      c.pagado += e.pagado;
      c.saldo += e.saldo;
    }
    c.documentos.push({ ...f, ...e });
  });

  return [...cuentas.values()]
    .map(c => ({ ...c, facturado: r2(c.facturado), pagado: r2(c.pagado), saldo: r2(c.saldo),
      credito: r2(c.credito), creditoUsado: r2(c.creditoUsado), documentos: c.documentos.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))) }))
    // Primero a quien más se le debe: es la lista con la que se arma el pago
    // de la semana.
    .sort((a, b) => b.saldo - a.saldo || a.nombre.localeCompare(b.nombre));
}

/** Los totales de la obra, para el encabezado. */
export function totalesPorPagar(cuentas = []) {
  return cuentas.reduce((t, c) => ({
    facturado: t.facturado + c.facturado,
    pagado: t.pagado + c.pagado,
    saldo: t.saldo + c.saldo,
    proformas: t.proformas + c.proformas,
    porFacturar: t.porFacturar + c.porFacturar,
    credito: t.credito + c.credito,
  }), { facturado: 0, pagado: 0, saldo: 0, proformas: 0, porFacturar: 0, credito: 0 });
}
