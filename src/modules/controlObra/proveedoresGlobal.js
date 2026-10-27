// CUÁNTO LE COMPRAMOS A ESTE PROVEEDOR, EN TODO.
//
// La pestaña Proveedores de una obra contesta "¿cuánto le debo acá?". Esta
// contesta la otra mitad, que es la que se usa para negociar: cuánto le
// compramos en total, en cuántos proyectos, y qué compró cada uno. Un
// proveedor al que le pasamos cuarenta mil repartidos en tres obras no lo
// sabe nadie si cada obra solo ve su parte —y el proveedor sí lo sabe—.
//
// Sin base de datos, para poder probarlo.

import { esNotaDeCredito } from "./cuentasProveedor.js";

const n = v => Number(v) || 0;
const r2 = v => Math.round(v * 100) / 100;

/** El mismo criterio que la cuenta de una obra: manda el RUC, y si no hay, el nombre. */
export const claveProveedor = f =>
  (f?.ruc || "").trim() || (f?.razon_social || "").trim().toUpperCase() || "SIN PROVEEDOR";

/**
 * Las cuentas de todos los proveedores, de todas las obras.
 *
 * @param facturas  obra_facturas de todas las obras
 * @param pagos     obra_pagos de todas las obras
 * @param nombreObra  (obra_id) => cómo se llama esa obra
 * @returns [{ clave, ruc, nombre, comprado, pagado, saldo, credito, documentos,
 *            obras: [{ obraId, nombre, comprado, pagado, saldo, documentos: [factura] }] }]
 *          ordenadas por lo comprado, de mayor a menor.
 */
export function proveedoresDeTodo(facturas = [], pagos = [], nombreObra = () => "") {
  const pagado = {};
  pagos.forEach(p => { pagado[p.factura_id] = (pagado[p.factura_id] || 0) + n(p.monto); });

  const mapa = new Map();
  facturas.forEach(f => {
    // Una proforma no es una compra: todavía no compró nadie.
    if (f.clase === "proforma") return;
    const clave = claveProveedor(f);
    if (!mapa.has(clave)) {
      mapa.set(clave, { clave, ruc: f.ruc || "", nombre: f.razon_social || "Sin proveedor",
        comprado: 0, pagado: 0, saldo: 0, credito: 0, documentos: 0, obras: new Map() });
    }
    const c = mapa.get(clave);
    // Entre dos nombres para el mismo RUC gana el más largo: suele ser el
    // completo ("AVIANCA - ECUADOR S.A." contra "Avianca").
    if ((f.razon_social || "").length > c.nombre.length) c.nombre = f.razon_social;
    if (!c.ruc && f.ruc) c.ruc = f.ruc;

    const total = n(f.total);
    const suPago = pagado[f.id] || 0;
    const vale = esNotaDeCredito(f.clase) || total < 0;

    if (!c.obras.has(f.obra_id)) {
      c.obras.set(f.obra_id, { obraId: f.obra_id, nombre: nombreObra(f.obra_id) || "Obra",
        comprado: 0, pagado: 0, saldo: 0, credito: 0, documentos: [] });
    }
    const o = c.obras.get(f.obra_id);
    o.documentos.push({ ...f, pagado: suPago, saldo: r2(total - suPago), esCredito: vale });
    c.documentos += 1;

    if (vale) {
      // El vale sin usar es plata nuestra en su casa. No es una compra ni una
      // deuda menos: es crédito a favor hasta que se use.
      const libre = f.facturada_con_id ? 0 : Math.abs(total);
      c.credito += libre; o.credito += libre;
      return;
    }
    c.comprado += total; c.pagado += suPago; c.saldo += total - suPago;
    o.comprado += total; o.pagado += suPago; o.saldo += total - suPago;
  });

  return [...mapa.values()]
    .map(c => ({
      ...c, comprado: r2(c.comprado), pagado: r2(c.pagado), saldo: r2(c.saldo), credito: r2(c.credito),
      obras: [...c.obras.values()]
        .map(o => ({ ...o, comprado: r2(o.comprado), pagado: r2(o.pagado), saldo: r2(o.saldo), credito: r2(o.credito),
          documentos: o.documentos.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))) }))
        .sort((a, b) => b.comprado - a.comprado),
    }))
    .sort((a, b) => b.comprado - a.comprado || a.nombre.localeCompare(b.nombre));
}

/** Los totales de arriba: a cuántos se les compró y cuánto. */
export function totalesDeTodo(cuentas = []) {
  return cuentas.reduce((t, c) => ({
    proveedores: t.proveedores + 1,
    comprado: r2(t.comprado + c.comprado),
    pagado: r2(t.pagado + c.pagado),
    saldo: r2(t.saldo + c.saldo),
    credito: r2(t.credito + c.credito),
  }), { proveedores: 0, comprado: 0, pagado: 0, saldo: 0, credito: 0 });
}

/** Buscar por nombre o RUC, sin tildes y sin importar mayúsculas. */
export const pelar = t => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export const buscar = (cuentas, texto) => {
  const q = pelar(texto).trim();
  if (!q) return cuentas;
  return cuentas.filter(c => pelar(c.nombre).includes(q) || pelar(c.ruc).includes(q));
};
