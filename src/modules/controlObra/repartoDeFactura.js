// LO REPARTIDO DE UN DOCUMENTO NO PUEDE SUMAR MÁS QUE EL DOCUMENTO.
//
// El caso (se vio el 13/11/2026): la factura de MEGAMETALES por $590,73 quedó
// con seis asignaciones que sumaban $1.181,46. Una a la agrupación OC-03
// entera, por los $590,73; y cinco a rubros de esa misma agrupación, que entre
// las cinco volvían a sumar $590,73. Las escribió un solo guardado.
//
// Cómo se llegó: se cargó la factura a la agrupación entera, después se
// marcaron cinco de sus rubros y se apretó «a prorrata de lo que pesa cada
// uno». Ese botón repartía el TOTAL de la factura entre los rubros marcados
// sin mirar que la línea de la agrupación ya se lo había llevado todo. La
// pantalla decía «Faltan $-590,73» —que no dice nada— y guardaba igual.
//
// No se veía en ningún número: el control cuenta cada asignación en la
// proporción en que su factura está pagada, y esa factura no tenía pagos. El
// día que se le registrara el pago iba a contar $1.181,46 de invertido por un
// papel de $590,73.
//
// Acá viven las dos cosas que lo impiden:
//
//   · repartir sin pasarse: lo que va a prorrata entre rubros es lo que QUEDA
//     después de lo cargado a una agrupación o a un capítulo entero, y sale
//     exacto al centavo;
//   · no guardar pasado: `sobraDelReparto` dice por cuánto se pasa, y los
//     guardados —Control de Obra, Compras y Caja chica— se frenan si no da
//     cero.

import { repartirProporcional, fmt } from "./calculos.js";

const n = v => Number(v) || 0;
const c2 = v => Math.round(n(v) * 100) / 100;

/** Lo que suman las líneas de un reparto, al centavo. */
export function asignadoDe(repartos = []) {
  return c2((repartos || []).reduce((s, r) => s + n(r?.monto), 0));
}

/**
 * Por cuánto se pasa lo repartido del total del documento. Cero si no se pasa.
 *
 * Se mide sin signo: una nota de crédito tiene el total en negativo y lo que
 * importa es que no se descargue de los rubros más de lo que el papel dice.
 * Repartir de menos sí se puede —el resto queda «por asignar»—; de más, no.
 */
export function sobraDelReparto(repartos, total) {
  return Math.max(0, c2(Math.abs(asignadoDe(repartos)) - Math.abs(c2(total))));
}

/**
 * Por cuánto se pasa lo ya asignado a un documento, para avisarlo en la lista.
 * Es la misma cuenta que frena el guardado, sobre lo que ya está en la base.
 */
export function asignadoDeMas(asignado, total) {
  return sobraDelReparto([{ monto: asignado }], total);
}

/**
 * A DÓNDE FUE CADA DOCUMENTO, dicho en la lista y en su Excel.
 *
 * La lista nombraba solo los rubros. Lo cargado a una agrupación entera o a un
 * capítulo entero no aparecía en ningún lado: la factura se veía sin destino
 * y sin el aviso de «sin asignar», como si no fuera a ninguna parte. En la
 * obra 13 eran 108 facturas así. Y la 171 mostraba sus cinco rubros pero no la
 * agrupación OC-03 que también tenía, que era justo el doble que había que ver.
 *
 * Lo cargado entero va primero: es lo que más pesa en la factura y, si la línea
 * se corta por largo, es lo que no se puede perder.
 *
 * @returns { [factura_id]: string[] }
 */
export function destinosPorFactura(asignaciones = [], rubros = [], actividades = []) {
  const rubro = new Map((rubros || []).map(r => [Number(r.id), r]));
  const agrupacion = new Map((actividades || []).map(a => [Number(a.id), a]));
  const enteros = {}, porRubro = {};
  const poner = (m, id, texto) => { (m[id] = m[id] || []).push(texto); };
  (asignaciones || []).forEach(a => {
    if (a.obra_rubro_id != null) {
      const r = rubro.get(Number(a.obra_rubro_id));
      if (r) poner(porRubro, a.factura_id, `${r.numero} ${r.descripcion}`);
      return;
    }
    if (a.obra_actividad_id != null) {
      const x = agrupacion.get(Number(a.obra_actividad_id));
      poner(enteros, a.factura_id, x
        ? `agrupación ${[x.codigo, x.nombre].filter(Boolean).join(" ")}`
        : "una agrupación que ya no está");
      return;
    }
    if (a.capitulo) poner(enteros, a.factura_id, `capítulo ${a.capitulo}`);
  });
  const todos = {};
  new Set([...Object.keys(enteros), ...Object.keys(porRubro)]).forEach(id => {
    todos[id] = [...(enteros[id] || []), ...(porRubro[id] || [])];
  });
  return todos;
}

/**
 * La frase que frena el guardado, o "" si el reparto entra en el documento.
 * @param que  cómo se llama el papel en esa pantalla: "la factura", "el gasto"
 */
export function avisoDeSobra(repartos, total, que = "la factura") {
  const sobra = sobraDelReparto(repartos, total);
  if (!sobra) return "";
  return `Lo asignado suma $${fmt(Math.abs(asignadoDe(repartos)))} y ${que} es por $${fmt(Math.abs(c2(total)))}: `
    + `sobran $${fmt(sobra)}. Quitá una de las asignaciones o corregí los montos; así no se guarda, `
    + `porque el control contaría más plata de la que dice el papel.`;
}

/**
 * Cuánto del documento queda para repartir entre los rubros marcados: el total
 * menos lo que ya se cargó entero a una agrupación o a un capítulo. Nunca
 * cambia de signo: si lo cargado entero ya cubre el documento, queda cero.
 */
export function quedaParaLosRubros(repartos = [], total) {
  const entero = c2((repartos || []).filter(r => r?.tipo !== "rubro").reduce((s, r) => s + n(r?.monto), 0));
  const queda = c2(n(total) - entero);
  return n(total) >= 0 ? Math.max(0, queda) : Math.min(0, queda);
}

/**
 * «A prorrata de lo que pesa cada uno»: reparte entre los rubros marcados, por
 * el tamaño de su presupuesto, lo que queda del documento.
 *
 * Las líneas a una agrupación o a un capítulo entero no se tocan, y lo que ya
 * tienen NO se vuelve a repartir: ahí estaba el doble.
 *
 * Un rubro con presupuesto en cero o negativo —el «(–)» de una orden de
 * cambio— no pesa: es un descuento del contrato, no un lugar donde se gasta.
 * Si ninguno de los marcados pesa, no hay con qué prorratear y el reparto
 * vuelve como estaba.
 *
 * @param repartos  [{ tipo: "rubro" | "actividad" | "capitulo", id, monto }]
 * @param rubros    los rubros de la obra, con `id` y `total_base`
 * @param total     el total del documento
 */
export function prorratearEntreRubros(repartos = [], rubros = [], total) {
  const peso = new Map((rubros || []).map(r => [Number(r.id), Math.max(0, n(r.total_base))]));
  const pesos = (repartos || []).filter(r => r?.tipo === "rubro")
    .map(r => ({ total_base: peso.get(Number(r.id)) || 0 }));
  if (!pesos.some(p => p.total_base > 0)) return repartos;
  const partes = repartirProporcional(quedaParaLosRubros(repartos, total), pesos);
  let k = 0;
  return repartos.map(r => (r?.tipo === "rubro" ? { ...r, monto: partes[k++] } : r));
}

/**
 * Los renglones que NOVA leyó, sumados por destino y llevados al total del
 * documento: el papel trae los renglones sin IVA y el total lo lleva, así que
 * el impuesto se reparte en la misma proporción que la base.
 *
 * Exacto al centavo. Redondeando cada destino por su cuenta, tres destinos
 * podían sumar un centavo más que la factura.
 *
 * @param items  [{ destino: "rubro:12" | "act:7" | "cap:ALBAÑILERÍA" | null, monto }]
 * @returns [{ tipo: "rubro" | "actividad" | "capitulo", id, monto }]
 */
export function repartoDeRenglones(items = [], total) {
  const porDestino = new Map();
  (items || []).forEach(x => {
    if (!x?.destino) return;
    porDestino.set(x.destino, (porDestino.get(x.destino) || 0) + n(x.monto));
  });
  const claves = [...porDestino.keys()];
  const suma = claves.reduce((t, k) => t + porDestino.get(k), 0);
  // CON RENGLONES SIN DESTINO, A LOS ASIGNADOS LES TOCA SU PARTE, NO EL TOTAL.
  // «Asignar 1 de 11» le daba los $143,32 de la factura entera al único
  // renglón con destino —un alambre de $2,60—. Les toca lo suyo con su IVA:
  // la parte del total que pesan entre todos los renglones leídos. Lo demás
  // queda por asignar, y la pantalla dice cuánto falta.
  const todos = (items || []).reduce((t, x) => t + n(x.monto), 0);
  const parte = todos > 0 && suma > 0 && suma < todos - 0.005 ? c2(n(total) * suma / todos) : n(total);
  // Sin base que escalar —todo en cero, o descuentos que se comen la suma— va
  // lo leído tal cual: no hay proporción de la que colgar el total.
  const montos = suma > 0
    ? repartirProporcional(parte, claves.map(k => ({ total_base: porDestino.get(k) })))
    : claves.map(k => c2(porDestino.get(k)));
  return claves.map((clave, i) => {
    const corte = clave.indexOf(":");
    const tipo = clave.slice(0, corte), id = clave.slice(corte + 1);
    return {
      tipo: tipo === "cap" ? "capitulo" : tipo === "act" ? "actividad" : "rubro",
      id: tipo === "cap" ? id : Number(id),
      monto: montos[i],
    };
  });
}
