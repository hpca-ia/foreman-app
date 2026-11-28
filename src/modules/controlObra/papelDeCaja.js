// LA FACTURA DEL CONTROL CONTRA SU GASTO DE CAJA CHICA.
//
// Hernán, 28/11/2026: «En facturas aparece como gasto sin papel. En caja chica
// SÍ está el papel». Lo que había en la base: la factura 32 (ATIMASA, diesel,
// $10) sin archivo en el control, con el papel en su gasto de caja chica, y
// con el RUC del cliente como proveedor y como RUC. El gasto decía lo correcto.
//
// El gasto de caja chica es de donde salió la factura: cuando no coinciden, se
// ofrece traer lo del gasto. No se pisa nada solo: quien la abre lo ve y lo
// guarda.

const t = v => String(v ?? "").trim();
const soloDigitos = v => t(v).replace(/\D/g, "");

/**
 * Lo que el gasto tiene y la factura no, o dice distinto.
 *
 * @returns [] o [{ campo, etiqueta, factura, gasto }]: los campos de la factura
 *   (archivo_url, razon_social, ruc, numero_factura) con el valor del gasto
 */
export function diferenciasConElGasto(factura, gasto) {
  if (!factura || !gasto) return [];
  // SOLO CUANDO LA COPIA QUEDÓ ROTA: sin papel, o con un número de RUC en el
  // nombre del proveedor. Si no, lo que dice la factura puede ser una
  // corrección hecha en el control (la de Avianca tiene otro RUC que su gasto
  // y nadie sabe cuál es el bueno): eso no se ofrece cambiar.
  const rota = (t(gasto.archivo_url) && !t(factura.archivo_url)) || /^\d{10,13}$/.test(t(factura.razon_social));
  if (!rota) return [];
  const d = [];
  if (t(gasto.archivo_url) && !t(factura.archivo_url)) {
    d.push({ campo: "archivo_url", etiqueta: "el papel", factura: "", gasto: gasto.archivo_nombre || gasto.archivo_url });
  }
  if (t(gasto.proveedor) && t(gasto.proveedor).toLowerCase() !== t(factura.razon_social).toLowerCase()
      // Un nombre que es solo números es un RUC mal puesto: el del gasto gana.
      && (!t(factura.razon_social) || /^\d{10,13}$/.test(t(factura.razon_social)))) {
    d.push({ campo: "razon_social", etiqueta: "el proveedor", factura: t(factura.razon_social), gasto: t(gasto.proveedor) });
  }
  if (soloDigitos(gasto.ruc) && soloDigitos(gasto.ruc) !== soloDigitos(factura.ruc)) {
    d.push({ campo: "ruc", etiqueta: "el RUC", factura: t(factura.ruc), gasto: t(gasto.ruc) });
  }
  if (t(gasto.numero_factura) && soloDigitos(gasto.numero_factura) !== soloDigitos(factura.numero_factura)) {
    d.push({ campo: "numero_factura", etiqueta: "el número", factura: t(factura.numero_factura), gasto: t(gasto.numero_factura) });
  }
  return d;
}

/** Los cambios para el formulario de la factura, con el nombre del papel. */
export function loDelGasto(gasto, diferencias) {
  const c = {};
  for (const x of diferencias) {
    if (x.campo === "archivo_url") { c.archivo_url = gasto.archivo_url; c.archivo_nombre = gasto.archivo_nombre || null; }
    else c[x.campo] = t(gasto[x.campo === "razon_social" ? "proveedor" : x.campo]);
  }
  return c;
}
