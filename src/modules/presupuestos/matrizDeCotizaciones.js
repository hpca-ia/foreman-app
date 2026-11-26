// LA MATRIZ PARA COMPARAR COTIZACIONES, CAPÍTULO POR CAPÍTULO.
//
// Hernán, 26/11/2026, a la mañana: «Al armar presupuestos se cotiza de
// distintas empresas y vienen distintos presupuestos... ¿cómo se puede
// comparar y posterior a eso escoger la mejor opción para que ingrese al
// presupuesto? Una especie de matriz».
//
// Y a la tarde, con la primera cotización de verdad cargada: «Son varias
// cotizaciones... no solo una de ellas alimenta todo el presupuesto, pueden
// ser dos o tres de cocinas o puertas o vidrios... una de ellas iría al
// presupuesto. Sí, la comparativa se la categoriza por capítulos del
// presupuesto. Una vez escogida una, los rubros de la proforma alimentarían
// el capítulo del presupuesto». «Ahorita desde ya está tratando de
// emparejar...». «Parecería que ahora las cotizaciones se van a ver listado y
// no matriz para comparar».
//
// LO QUE ESTABA MAL. La primera versión ponía en las filas LOS RUBROS DEL
// PRESUPUESTO y le pedía a NOVA que emparejara cada renglón de la cotización
// con uno. Dekorando cotizó 28 ventanas, por su código de plano (V1, V2...);
// el capítulo «Herrería, aluminio, vidrio» tiene 31 rubros escritos de otra
// manera. Calzó un renglón de 28: la matriz comparaba $1.191 de $39.956.
//
// CÓMO ES AHORA:
//
//   · CADA COTIZACIÓN VA A UN CAPÍTULO del presupuesto (renglón por renglón,
//     por si un mismo papel trae dos; casi siempre es uno solo).
//
//   · LAS FILAS DE LA MATRIZ SON LO QUE SE COTIZÓ, no los rubros del
//     presupuesto. La primera cotización de un capítulo pone las filas; los
//     renglones de las siguientes se ubican en la fila de lo mismo —la V1 de
//     una empresa con la V1 de la otra— o abren una fila nueva. Una columna
//     por empresa: sigue siendo una matriz.
//
//   · LA QUE TOTALIZÓ SE COMPARA POR SU TOTAL, Y NADA MÁS. La empresa que
//     cotizó «toda la ventanería» en un solo número no dijo cuánto vale cada
//     ventana. La versión anterior repartía su suma entre las filas de la que
//     sí itemizó, en proporción a los precios de esa otra, y mostraba el
//     resultado al lado. Hernán, 26/11/2026, mirando esos números: «Está mal
//     la comparación... ¿de dónde sacas los valores de cada renglón de Easy
//     Home? No los puedes poner junto a los de Dekorando porque no están
//     itemizados». «Window World totalizó, Easy Home totalizó y Dekorando sí
//     lo itemizó... eventualmente se itemizan todas con sus versiones nuevas
//     y se compara, pero ahorita la info que das está mal».
//
//     Un renglón que totaliza vive en su propia fila, con su total. No se
//     reparte, no se pone contra las filas de nadie, y a su empresa no le
//     «falta» ninguna fila: no se sabe, fila por fila, qué incluye. Cuando
//     mande su versión itemizada, esos renglones se ubican en las filas de
//     las otras y ahí sí se compara fila por fila.
//
//   · SE ELIGE por capítulo —todo lo que esa empresa cotizó ahí— o fila por
//     fila. Un total es por todo el capítulo: elegirlo suelta lo de las otras
//     en ese capítulo, y elegir filas de otra lo suelta a él.
//
//   · LO ELEGIDO ALIMENTA EL CAPÍTULO: los renglones de la proforma elegida
//     entran como rubros de ese capítulo, con sus palabras, su cantidad y su
//     precio como costo. Cada rubro queda marcado con de qué fila salió
//     (`comparativa_fila`, migración 197): así, al volver a escoger o al
//     llegar otra versión, se actualiza ese mismo rubro en vez de duplicarse,
//     y lo que deja de estar elegido se quita. Los rubros que el capítulo ya
//     tenía no se tocan; qué reemplaza la cotización lo decide quien arma el
//     presupuesto, al pasar.
//
// NADIE GANA POR HABER COTIZADO MENOS COSAS. El menor de un capítulo se marca
// solo entre las empresas que itemizaron todas sus filas; y las que
// totalizaron entran a esa cuenta solo si las que itemizaron detallan lo
// mismo entre sí: recién ahí hay un solo alcance contra el cual leer un total.
//
// Y PARA COMPARAR EN LAS MISMAS CONDICIONES, LO QUE UNA COTIZÓ DE MÁS SE SACA.
// Hernán, 26/11/2026, con tres ofertas de ventanas y una que además traía
// cabinas de baño y claraboyas: «en ese caso me gustaría tener la opción de
// borrar rubros para comparar mismas condiciones». Un renglón se saca de la
// comparación (`fuera`): no pone fila, no suma al total de su empresa, no
// cuenta para el menor y no se puede elegir. No se borra de lo leído: queda a
// la vista, aparte, y se vuelve a poner.
//
// Sin base ni pantalla: se puede probar (pruebas/matrizDeCotizaciones.test.mjs).

import { estructura } from "./estructura.js";

const n = v => Number(v) || 0;
const r2 = v => Math.round(n(v) * 100) / 100;
const r6 = v => Math.round(n(v) * 1e6) / 1e6;
const igual = (a, b) => Math.abs(n(a) - n(b)) < 0.00005;
const texto = v => String(v ?? "").trim();

/** El grupo de lo que todavía no se dijo a qué capítulo va. */
export const SIN_CAPITULO = "";

/** Lo que vale un renglón de la cotización, como está escrito en su papel. */
export function totalDelRenglon(r) {
  const escrito = n(r?.total);
  return r2(escrito > 0 ? escrito : (n(r?.cantidad) || 1) * n(r?.precio_unitario));
}

/** El unitario de un renglón: el escrito, o su total sobre su cantidad. */
const unitarioDe = r => (n(r?.precio_unitario) > 0 ? n(r.precio_unitario)
  : n(r?.cantidad) > 0 ? n(r.total) / n(r.cantidad) : n(r?.total));

/**
 * EL DESCUENTO GENERAL DEL PIE DEL PAPEL, en porcentaje.
 *
 * Muchas proformas cotizan a precio de lista y ofrecen un descuento al final.
 * Compararla sin ese descuento es compararla más cara de lo que es, y elegir a
 * otra por una diferencia que no existe. Se resta de cada renglón, salvo que
 * alguien diga que no (`totales.sin_descuento`): hay descuentos que el
 * proveedor ofrece y después no sostiene.
 */
export function descuentoDe(cot) {
  const t = cot?.totales || {};
  if (t.sin_descuento) return 0;
  const pct = n(t.descuento_pct);
  if (pct > 0 && pct < 100) return pct;
  const monto = n(t.descuento_monto);
  const suma = (cot?.renglones || []).reduce((s, r) => s + totalDelRenglon(r), 0);
  return monto > 0 && suma > monto ? Math.round(monto / suma * 1e6) / 1e4 : 0;
}

/** La fila propia de un renglón que no dice ninguna: nadie más cotizó eso todavía. */
export const filaPropia = (cot, k) => `c${cot?.id}-${k}`;

/** Con qué se marca en el presupuesto el rubro que salió de un renglón: sus filas. */
export const marcaDe = filas => (filas || []).map(String).join(",");

/**
 * ¿ESTE RENGLÓN TOTALIZA? Es un solo valor por todo un trabajo, no un ítem.
 *
 *   · Lo que se dijo manda: `suma` true o false. Lo lee NOVA del papel, y se
 *     corrige en la pantalla.
 *   · Si no se dijo: totaliza el renglón que se ubicó como la suma de varias
 *     filas de otra empresa, y el único renglón de un papel de un solo
 *     renglón al que nadie puso en la fila de otro.
 */
export function totaliza(cot, r) {
  if (r?.suma === true) return true;
  if (r?.suma === false) return false;
  const dichas = (Array.isArray(r?.filas) ? r.filas : []).map(texto).filter(Boolean);
  return dichas.length >= 2 || (dichas.length === 0 && (cot?.renglones || []).length === 1);
}

/**
 * Los renglones de una cotización, listos para la matriz: cada uno con SU
 * fila, su capítulo, si totaliza (`esSuma`) y el descuento general ya restado.
 *
 * Un renglón, una fila. El ítem va a la fila de lo mismo que cotizó otra
 * empresa, o abre la suya. El que totaliza tiene siempre la suya: conserva la
 * que traía de su versión anterior, y nunca la de otra empresa. Una fila no se
 * repite dentro de la misma cotización: el segundo renglón que la nombre abre
 * la suya.
 *
 * El capítulo es el que dice el renglón. Si no dice —o es una cotización
 * cargada antes de este cambio, que traía rubros del presupuesto—, se usa el
 * del rubro al que apuntaba; y al que le sigue faltando le toca el de la
 * mayoría de su papel, que casi siempre es uno solo.
 *
 * @param capituloDeItem  id de rubro → nombre de su capítulo (para lo cargado antes)
 */
export function renglonesDe(cot, capituloDeItem = null) {
  const queda = 1 - descuentoDe(cot) / 100;
  const usadas = new Set();
  const dichos = (cot?.renglones || []).map((r, k) => {
    const dichas = (Array.isArray(r?.filas) ? r.filas : []).map(texto).filter(Boolean);
    const esSuma = totaliza(cot, r);
    // La que totaliza: su fila de antes si traía UNA (la de su versión anterior), o la propia. Nunca varias.
    const pedida = esSuma ? (dichas.length === 1 ? dichas[0] : filaPropia(cot, k)) : (dichas[0] || filaPropia(cot, k));
    // El renglón que se sacó de la comparación no ocupa ninguna fila.
    let filas = r?.fuera ? [] : [pedida].filter(f => !usadas.has(f) && usadas.add(f));
    if (!filas.length && !r?.fuera) { filas = [filaPropia(cot, k)]; usadas.add(filas[0]); }
    const deAntes = capituloDeItem ? (Array.isArray(r?.items) ? r.items : []).map(id => capituloDeItem(id)).find(Boolean) : null;
    const capitulo = texto(r?.capitulo) || texto(deAntes);
    return queda === 1 ? { ...r, k, filas, capitulo, fuera: !!r?.fuera, esSuma }
      : { ...r, k, filas, capitulo, fuera: !!r?.fuera, esSuma, precio_unitario: r6(unitarioDe(r) * queda), total: r2(totalDelRenglon(r) * queda) };
  });
  // El capítulo de la mayoría del papel, para los renglones que no dicen cuál.
  const cuenta = new Map();
  dichos.forEach(r => { if (r.capitulo) cuenta.set(r.capitulo, (cuenta.get(r.capitulo) || 0) + 1); });
  const delPapel = texto(cot?.capitulo) || [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || SIN_CAPITULO;
  return dichos.map(r => (r.capitulo ? r : { ...r, capitulo: delPapel }));
}

/**
 * @param capitulos     los del presupuesto, con su orden
 * @param items         los rubros del presupuesto (presupuesto_items)
 * @param cotizaciones  [{ id, proveedor, version, reemplaza_a, reemplazada_at,
 *                      renglones: [{ descripcion, unidad, cantidad,
 *                      precio_unitario, total, capitulo, filas: [clave…] }] }]
 * @returns {
 *   empresas: [{ id, proveedor, version, reemplaza_a, cotizado, comparado, cubre, capitulos, sinCapitulo, renglones }],
 *   grupos:   [{ numero, capitulo, filas: [{ clave, descripcion, unidad, cantidad, celdas, referencia, menor, suma }],
 *                sub: { [cotId]: { total, cubre, faltan, totaliza } }, menor, fuera, referencia: { total, rubros } }],
 *   celdaDe:  (clave, cotId) => celda | null,
 * }
 * Una celda es { tipo, renglon, descripcion, unidad, cantidad, unitario, total, otraCantidad }, con
 * `tipo` "rubro" —un ítem, que se compara con lo de las otras en esa fila— o "suma" —un total: está
 * solo en su fila—. La fila con `suma` es la de un total: no es una fila del itemizado.
 */
export function matrizDeCotizaciones({ capitulos = [], items = [], cotizaciones = [] } = {}) {
  const itemPorId = new Map((items || []).map(i => [String(i.id), i]));
  const capituloDeItem = id => texto(itemPorId.get(String(id))?.capitulo);
  // LA VERSIÓN VIGENTE DE CADA EMPRESA, cada una en su columna: la versión
  // nueva va en el lugar de la primera que mandó, no al final.
  const todas = cotizaciones || [];
  const cotPorId = new Map(todas.map(c => [String(c.id), c]));
  const lugarDe = c => {
    const vistas = new Set();
    let primera = c;
    while (primera.reemplaza_a != null && cotPorId.has(String(primera.reemplaza_a)) && !vistas.has(primera)) {
      vistas.add(primera); primera = cotPorId.get(String(primera.reemplaza_a));
    }
    return todas.indexOf(primera);
  };
  const enSuLugar = todas.filter(c => !c.reemplazada_at).map(c => [c, lugarDe(c)]).sort((a, b) => a[1] - b[1]).map(([c]) => c);
  const empresas = enSuLugar.map(c => ({
    ...c, renglones: renglonesDe(c, capituloDeItem),
    descuento: descuentoDe(c),
    descuentoOfrecido: descuentoDe({ ...c, totales: { ...(c.totales || {}), sin_descuento: false } }),
  }));

  // LAS FILAS: lo que se cotizó. Las pone el primer renglón que nombra cada una.
  const filas = new Map();
  const celdas = new Map();
  const de = (clave, cotId) => `${clave}|${cotId}`;
  const abrir = (clave, r) => {
    if (!filas.has(clave)) filas.set(clave, { clave, capitulo: r.capitulo, descripcion: texto(r.descripcion), unidad: texto(r.unidad), cantidad: n(r.cantidad) || 1, celdas: {} });
    return filas.get(clave);
  };
  const poner = (c, r, clave) => {
    const fila = abrir(clave, r);
    const cantidad = n(r.cantidad) || 1;
    const celda = {
      tipo: r.esSuma ? "suma" : "rubro", renglon: r.k, descripcion: texto(r.descripcion), unidad: texto(r.unidad), cantidad,
      unitario: unitarioDe(r), total: totalDelRenglon(r), otraCantidad: !igual(cantidad, fila.cantidad),
    };
    celdas.set(de(clave, c.id), celda); fila.celdas[c.id] = celda;
    return [clave];
  };
  // Un renglón, una fila. El que se sacó de la comparación no tiene ninguna.
  for (const c of empresas) for (const r of c.renglones) r.vivas = r.filas.length ? poner(c, r, r.filas[0]) : [];
  const celdaDe = (clave, cotId) => celdas.get(de(clave, cotId)) || null;
  // El capítulo de un renglón es el de su fila: una fila vive en un solo capítulo.
  for (const c of empresas) for (const r of c.renglones) if (r.vivas.length) r.capitulo = filas.get(r.vivas[0])?.capitulo ?? r.capitulo;
  // LA FILA DE UN TOTAL: ninguna empresa puso ahí un ítem. No es una fila del itemizado.
  const esDeTotal = f => !Object.values(f.celdas).some(x => x.tipo === "rubro");
  // LO QUE SE SACÓ DE LA COMPARACIÓN, por capítulo: a la vista, para volver a ponerlo.
  const sacados = empresas.flatMap(c => c.renglones.filter(r => r.fuera).map(r => ({
    cotId: c.id, proveedor: c.proveedor || "", renglon: r.k, capitulo: r.capitulo, descripcion: texto(r.descripcion), unidad: texto(r.unidad),
    cantidad: n(r.cantidad) || 1, total: totalDelRenglon(r),
  })));

  // LO QUE EL PRESUPUESTO TIENE HOY DE CADA FILA: el rubro que salió de ella, si ya pasó.
  const delPresupuesto = new Map();
  for (const i of items || []) {
    const m = marcaDelRubro(i);
    if (!m) continue;
    const suyas = m.marca.split(",");
    suyas.forEach(f => delPresupuesto.set(f, { item: i, paquete: suyas.length > 1 }));
  }
  const referenciaDe = clave => {
    const x = delPresupuesto.get(clave);
    if (!x) return null;
    const unitario = n(x.item.precio_base) > 0 ? n(x.item.precio_base) : n(x.item.precio_unitario);
    return { unitario: x.paquete ? null : unitario, total: x.paquete ? null : r2(n(x.item.cantidad) * unitario), deQuien: texto(x.item.cotizacion_proveedor) || null, paquete: x.paquete };
  };

  // LOS CAPÍTULOS, en el orden y con el número del presupuesto.
  const delPre = estructura({ capitulos, items });
  const numeroDe = new Map(delPre.map(c => [c.nombre, c]));
  const orden = [...[...capitulos].sort((a, b) => n(a.orden) - n(b.orden)).map(c => c.nombre), ...delPre.map(c => c.nombre)];
  const lugar = nombre => { const k = orden.indexOf(nombre); return nombre === SIN_CAPITULO ? Infinity : k < 0 ? orden.length : k; };
  const nombres = [...new Set([...[...filas.values()].map(f => f.capitulo), ...sacados.map(x => x.capitulo)])].sort((a, b) => lugar(a) - lugar(b) || String(a).localeCompare(String(b)));
  const grupos = nombres.map(nombre => {
    const suyas = [...filas.values()].filter(f => f.capitulo === nombre).map(f => {
      const conPrecio = Object.entries(f.celdas).filter(([, x]) => x.tipo === "rubro" && x.total > 0);
      const minimo = conPrecio.length > 1 ? Math.min(...conPrecio.map(([, x]) => x.total)) : null;
      const menores = minimo == null ? [] : conPrecio.filter(([, x]) => igual(x.total, minimo)).map(([id]) => id);
      return { ...f, suma: esDeTotal(f), referencia: referenciaDe(f.clave), menor: menores.length === 1 ? menores[0] : null };
    });
    const itemizadas = suyas.filter(f => !f.suma);
    const sub = {};
    for (const c of empresas) {
      const propias = suyas.filter(f => f.celdas[c.id]);
      if (!propias.length) continue;
      const totalizo = propias.some(f => f.celdas[c.id].tipo === "suma");
      sub[c.id] = {
        total: r2(propias.reduce((t, f) => t + f.celdas[c.id].total, 0)), cubre: propias.length, totaliza: totalizo,
        // A la que totalizó no le «falta» ninguna fila: no se sabe, fila por fila, qué incluye su total.
        // A la que itemizó le faltan las que otra detalló y ella no.
        faltan: totalizo ? 0 : itemizadas.filter(f => !f.celdas[c.id]).length,
      };
    }
    // EL MENOR. Entre las que itemizaron todo. Las que totalizaron entran solo si las que itemizaron
    // detallan lo mismo entre sí: si a una le falta algo que otra sí cotizó, no hay un alcance contra
    // el cual leer un total, y marcarlo como el menor sería afirmar lo que no se sabe.
    const mismoAlcance = Object.values(sub).every(s => s.totaliza || s.faltan === 0);
    const completas = Object.entries(sub).filter(([, s]) => s.total > 0 && s.faltan === 0 && (!s.totaliza || mismoAlcance));
    const minimo = completas.length > 1 ? Math.min(...completas.map(([, s]) => s.total)) : null;
    const menores = minimo == null ? [] : completas.filter(([, s]) => igual(s.total, minimo)).map(([id]) => id);
    const enElPre = numeroDe.get(nombre);
    return {
      numero: enElPre?.numero || "", capitulo: nombre, filas: suyas, sub, menor: menores.length === 1 ? menores[0] : null,
      fuera: sacados.filter(x => x.capitulo === nombre),
      // Lo que ese capítulo suma hoy en el presupuesto, y con cuántos rubros.
      referencia: { total: enElPre ? r2(enElPre.subtotal) : 0, rubros: enElPre ? enElPre.rubros.length : 0 },
    };
  });

  const resumen = empresas.map(c => ({
    id: c.id, proveedor: c.proveedor || "", archivo_id: c.archivo_id ?? null, totales: c.totales || null,
    version: n(c.version) || 1, reemplaza_a: c.reemplaza_a ?? null,
    renglones: c.renglones,
    capitulos: [...new Set(c.renglones.map(r => r.capitulo))].sort((a, b) => lugar(a) - lugar(b)),
    sinCapitulo: c.renglones.filter(r => r.capitulo === SIN_CAPITULO && !r.fuera).length,
    // Lo que se le sacó de la comparación: cuántos renglones, y cuánto suman.
    fuera: { cuantos: c.renglones.filter(r => r.fuera).length, total: r2(c.renglones.filter(r => r.fuera).reduce((t, r) => t + totalDelRenglon(r), 0)) },
    descuento: c.descuento, descuentoOfrecido: c.descuentoOfrecido,
    cotizado: r2(c.renglones.reduce((t, r) => t + totalDelRenglon(r), 0)),
    comparado: r2(grupos.reduce((t, g) => t + n(g.sub[c.id]?.total), 0)),
    cubre: grupos.reduce((t, g) => t + n(g.sub[c.id]?.cubre), 0),
  }));
  return { empresas: resumen, grupos, celdaDe };
}

// ── ELEGIR ─────────────────────────────────────────────────────────────────
//
// Lo elegido es un mapa { fila → cotización }.

/**
 * Elegir —o soltar, si ya estaba— una fila para una empresa, o todo lo que
 * cotizó en un capítulo. @param que  { fila } o { capitulo }
 *
 * UN TOTAL ES POR TODO EL CAPÍTULO. Elegir el total de una empresa suelta lo
 * que hubiera elegido de las otras en ese capítulo; y elegir filas de una
 * empresa suelta el total de otra. Si no, al presupuesto entrarían las 28
 * ventanas de una y, encima, la ventanería completa de la otra.
 */
export function elegir(matriz, elegidos = {}, cotId, que = {}) {
  const grupo = que.capitulo != null ? matriz.grupos.find(g => g.capitulo === que.capitulo)
    : matriz.grupos.find(g => g.filas.some(f => f.clave === String(que.fila)));
  const claves = que.capitulo != null ? (grupo?.filas || []).filter(f => f.celdas[cotId]).map(f => f.clave)
    : (matriz.celdaDe(que.fila, cotId) ? [String(que.fila)] : []);
  if (!claves.length) return elegidos;
  const yaEstaban = claves.every(f => String(elegidos[f]) === String(cotId));
  const out = { ...elegidos };
  claves.forEach(f => { if (yaEstaban) delete out[f]; else out[f] = cotId; });
  if (yaEstaban) return out;
  const eligeUnTotal = claves.some(f => matriz.celdaDe(f, cotId)?.tipo === "suma");
  for (const f of grupo?.filas || []) {
    const deQuien = out[f.clave];
    if (deQuien == null || String(deQuien) === String(cotId)) continue;
    if (eligeUnTotal || matriz.celdaDe(f.clave, deQuien)?.tipo === "suma") delete out[f.clave];
  }
  return out;
}

/**
 * La marca de un rubro del presupuesto que tiene que ver con la comparativa.
 *
 *   «c1-3»    el rubro SALIÓ de esa fila: lo creó la comparativa, con las
 *             palabras de la proforma. Si deja de estar elegido, se quita.
 *   «=c1-3»   el rubro YA ESTABA y se emparejó con esa fila: conserva sus
 *             palabras y su cantidad, y toma el costo de la proforma. Si deja
 *             de estar elegido, se desengancha y queda como rubro del presupuesto.
 *
 * @returns { marca, emparejado } o null
 */
export function marcaDelRubro(item) {
  const escrita = texto(item?.comparativa_fila);
  if (!escrita) return null;
  return escrita.startsWith("=") ? { marca: escrita.slice(1), emparejado: true } : { marca: escrita, emparejado: false };
}

/**
 * LO QUE CAMBIA EN EL PRESUPUESTO AL PASAR LO ELEGIDO.
 *
 * Hernán, 26/11/2026: «Una vez escogida una, los rubros de la proforma
 * alimentarían el capítulo del presupuesto». Y: «eventualmente se mueve la
 * oferta itemizada al presupuesto... o se empareja con los rubros». «Lo que sí
 * es importante que se categorice por capítulos del presupuesto... de alguna
 * manera estarán linkeados».
 *
 * Cada RENGLÓN elegido de la proforma termina en un rubro de su capítulo, por
 * una de dos puertas:
 *
 *   · ENTRA COMO RUBRO NUEVO, con las palabras, la unidad y la cantidad de la
 *     empresa. Es lo que pasa si no se dice otra cosa.
 *   · SE EMPAREJA CON UN RUBRO QUE YA ESTÁ (`enlaces`): ese rubro conserva
 *     sus palabras y su cantidad —si no tenía, toma la de la proforma— y
 *     recibe el costo.
 *
 * En los dos casos el precio de la empresa es el COSTO (`precio_base`), la
 * utilidad del rubro se conserva y el precio al cliente se recalcula. El rubro
 * queda marcado con su fila (`comparativa_fila`), y con esa marca, la próxima
 * vez: el que ya estaba se ACTUALIZA —otra versión, otra empresa en esa
 * fila—; el que la comparativa creó y ya no está elegido SE QUITA; y el
 * emparejado que ya no está elegido SE DESENGANCHA y queda como estaba.
 * Los rubros que no tienen que ver con la comparativa no aparecen acá.
 *
 * @param enlaces  { marca del renglón → id del rubro del presupuesto con el que se empareja }
 * @returns { rubros, entran, cambian, quitan, sueltan, yaEstan, costo, porPasar }
 */
export function planDeAplicar({ matriz, elegidos = {}, items = [], enlaces = {} } = {}) {
  const conMarca = new Map();
  for (const i of items || []) { const m = marcaDelRubro(i); if (m) conMarca.set(m.marca, { item: i, emparejado: m.emparejado }); }
  const porId = new Map((items || []).map(i => [String(i.id), i]));
  const rubros = [];
  for (const e of matriz.empresas) {
    for (const r of e.renglones) {
      if (!r.vivas?.length || !r.vivas.every(f => String(elegidos[f]) === String(e.id))) continue;
      const marca = marcaDe(r.vivas);
      const yaTiene = conMarca.get(marca) || null;
      // Emparejarlo ahora con un rubro que ya está, si todavía no tiene el suyo y ese rubro está libre.
      const pedido = !yaTiene && enlaces[marca] != null ? porId.get(String(enlaces[marca])) : null;
      const enlazado = pedido && !marcaDelRubro(pedido) && texto(pedido.capitulo) === texto(r.capitulo) ? pedido : null;
      const item = yaTiene?.item || enlazado || null;
      const emparejado = yaTiene ? yaTiene.emparejado : !!enlazado;
      // El rubro emparejado conserva sus palabras y su cantidad; el que crea la comparativa lleva las de la proforma.
      const cantidad = emparejado && n(item.cantidad) > 0 ? n(item.cantidad) : n(r.cantidad) || 1;
      const descripcion = emparejado ? texto(item.descripcion) : texto(r.descripcion);
      const unidad = emparejado && texto(item.unidad) ? texto(item.unidad) : texto(r.unidad);
      const precio_base = r6(unitarioDe(r));
      const pct = n(item?.utilidad_pct);
      const precio_unitario = r2(precio_base * (1 + pct / 100));
      // ¿YA ESTÁ ASÍ EN EL PRESUPUESTO? Pasó antes y nada cambió.
      const yaEsta = !!yaTiene && texto(item.cotizacion_proveedor) === texto(e.proveedor) && igual(item.cantidad, cantidad)
        && Math.abs(n(item.precio_base) - precio_base) < 0.0000005 && texto(item.descripcion) === descripcion && texto(item.unidad) === unidad;
      rubros.push({
        marca, capitulo: r.capitulo, id: item ? item.id : null, emparejado, descripcion, unidad, cantidad,
        precio_base, precio_unitario, total: r2(cantidad * precio_unitario), costo: r2(cantidad * precio_base),
        costoAntes: item ? r2(n(item.cantidad) * (n(item.precio_base) > 0 ? n(item.precio_base) : n(item.precio_unitario))) : null,
        proveedorAntes: item ? texto(item.cotizacion_proveedor) || null : null,
        proveedor: e.proveedor, cotizacion_id: e.id, suma: !!r.esSuma, yaEsta,
        // De qué papel salió, como lo pide la migración 138, y de qué fila (197).
        comparativa_fila: emparejado ? `=${marca}` : marca, cotizacion_archivo_id: e.archivo_id ?? null, cotizacion_proveedor: e.proveedor || null,
        cotizacion_renglon: texto(r.descripcion).slice(0, 400), cotizacion_cantidad: n(r.cantidad) || 1,
      });
    }
  }
  const elegidas = new Set(rubros.map(x => x.marca));
  const fuera = [...conMarca.entries()].filter(([marca]) => !elegidas.has(marca)).map(([marca, { item: i, emparejado }]) => ({
    id: i.id, marca, emparejado, capitulo: texto(i.capitulo), descripcion: texto(i.descripcion), proveedor: texto(i.cotizacion_proveedor) || null,
    total: r2(n(i.cantidad) * (n(i.precio_base) > 0 ? n(i.precio_base) : n(i.precio_unitario))),
  }));
  const entran = rubros.filter(x => x.id == null), cambian = rubros.filter(x => x.id != null && !x.yaEsta);
  const quitan = fuera.filter(x => !x.emparejado), sueltan = fuera.filter(x => x.emparejado);
  return {
    rubros, entran, cambian, quitan, sueltan, yaEstan: rubros.filter(x => x.yaEsta).length,
    costo: r2(rubros.reduce((t, x) => t + x.costo, 0)),
    porPasar: entran.length + cambian.length + quitan.length + sueltan.length,
  };
}

/** Lo elegido, como se guarda: en cada cotización, las filas que se le adjudicaron. */
export function elegidosPorCotizacion(elegidos = {}) {
  const out = {};
  for (const [clave, cotId] of Object.entries(elegidos)) (out[cotId] = out[cotId] || []).push(String(clave));
  return out;
}

/** Y al revés, al leerlas: { fila → cotización }. Solo de las versiones vigentes. */
export function elegidosDe(cotizaciones = []) {
  const out = {};
  for (const c of (cotizaciones || []).filter(x => !x.reemplazada_at)) {
    for (const clave of (Array.isArray(c.elegidos) ? c.elegidos : [])) if (typeof clave === "string" && clave) out[clave] = c.id;
  }
  return out;
}

// ── COMPARAR EN LAS MISMAS CONDICIONES ─────────────────────────────────────

/**
 * Los renglones que hay que marcar `fuera` para sacar una fila de la
 * comparación: el de cada empresa que cotizó eso. La fila de un total es de
 * una sola empresa: sale su total entero.
 *
 * @returns { renglones: [{ cotId, renglon }] } o { porQue }
 */
export function paraSacarLaFila(matriz, clave) {
  const fila = (matriz?.grupos || []).flatMap(g => g.filas).find(f => f.clave === String(clave));
  if (!fila) return { porQue: "Esa fila ya no está." };
  return { renglones: Object.entries(fila.celdas).map(([cotId, x]) => ({ cotId: matriz.empresas.find(e => String(e.id) === String(cotId))?.id ?? cotId, renglon: x.renglon })) };
}

// ── PONER UNA COTIZACIÓN EN SU LUGAR ───────────────────────────────────────

/** Toda la cotización a un capítulo: es lo de casi siempre. @returns sus renglones */
export const alCapitulo = (renglones = [], capitulo = "") => (renglones || []).map(r => ({ ...r, capitulo: texto(capitulo) }));

/**
 * Las filas que ya ITEMIZÓ alguna empresa, para decirle a NOVA dónde ubicar
 * los renglones de una cotización nueva. La fila de un total no va: contra un
 * total no hay nada que ubicar.
 * @returns [{ n, clave, capitulo, descripcion, unidad, cantidad }]
 */
export function filasParaUbicar(matriz) {
  return (matriz?.grupos || []).flatMap(g => g.filas.filter(f => !f.suma).map(f => ({ clave: f.clave, capitulo: g.capitulo, descripcion: f.descripcion, unidad: f.unidad, cantidad: f.cantidad })))
    .map((f, i) => ({ n: i + 1, ...f }));
}

// ── VERSIONES ──────────────────────────────────────────────────────────────
//
// Hernán, 26/11/2026: «estos presupuestos van a tener actualizaciones...
// quiero poder actualizar y volver a escoger por si cambiamos de
// especificación, cantidad o negociación. Entonces puede ir al presupuesto
// pero se puede regresar a ver nuevas versiones».
//
// Una empresa manda su cotización de nuevo. La nueva REEMPLAZA a la anterior
// en la matriz y la anterior queda guardada: se puede volver a mirar, y sirve
// para decir qué cambió. Lo que ya se había ubicado y elegido no se pierde.

/** La versión anterior de cada cotización vigente, lista para armarle su propia matriz. */
export function anterioresDe(cotizaciones = []) {
  const porId = new Map((cotizaciones || []).map(c => [String(c.id), c]));
  return (cotizaciones || []).filter(c => !c.reemplazada_at && c.reemplaza_a != null)
    .map(c => porId.get(String(c.reemplaza_a))).filter(Boolean)
    .map(c => ({ ...c, reemplazada_at: null }));
}

/** Todas las versiones de una empresa, de la más nueva a la más vieja. */
export function versionesDe(cot, cotizaciones = []) {
  const porId = new Map((cotizaciones || []).map(c => [String(c.id), c]));
  const cadena = [];
  for (let c = cot; c && !cadena.includes(c); c = c.reemplaza_a != null ? porId.get(String(c.reemplaza_a)) : null) cadena.push(c);
  return cadena;
}

const mismoTexto = t => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/**
 * LO QUE YA SE UBICÓ NO SE VUELVE A UBICAR. En la versión nueva, el renglón
 * que se llama igual que uno de la anterior va al mismo capítulo y a las
 * mismas filas que aquel: así la empresa sigue en sus filas, y lo elegido y
 * lo que ya pasó al presupuesto siguen siendo «lo mismo». Al resto le queda
 * lo que propuso NOVA.
 *
 * @param nuevos      los renglones leídos de la versión nueva
 * @param anteriores  los de la versión anterior, COMO LOS VE LA MATRIZ
 *                    (renglonesDe): con sus filas y su capítulo ya resueltos
 */
export function heredarFilas(nuevos = [], anteriores = []) {
  const deAntes = new Map();
  (anteriores || []).forEach(r => {
    const k = mismoTexto(r.descripcion);
    if (k && !deAntes.has(k)) deAntes.set(k, r);
  });
  const usadas = new Set();
  const tomar = filas => (filas || []).map(String).filter(f => !usadas.has(f) && usadas.add(f));
  const heredados = (nuevos || []).map(r => {
    const previo = deAntes.get(mismoTexto(r.descripcion));
    // Lo que se había sacado de la comparación sigue afuera: es la misma decisión sobre el mismo renglón.
    // Y el que totalizaba y se llama igual sigue siendo su total —en la misma fila—; el que era un ítem, un ítem.
    return previo ? { ...r, capitulo: texto(previo.capitulo), filas: tomar(previo.vivas?.length ? previo.vivas : previo.filas),
      ...(previo.esSuma != null ? { suma: !!previo.esSuma } : {}), ...(previo.fuera ? { fuera: true } : {}) } : null;
  });
  return (nuevos || []).map((r, i) => heredados[i] || { ...r, filas: tomar(r.filas) });
}

/**
 * Lo que la versión anterior tenía adjudicado y la nueva sigue cotizando: eso
 * sigue elegido, para no tener que elegir de nuevo. Lo que mientras tanto se
 * le dio a otra empresa es de la otra: pasa al volver a una versión anterior.
 *
 * @param otras  las demás cotizaciones del presupuesto
 * @param nueva  la versión que queda vigente: { id, renglones, totales }
 * @returns [clave de fila, …]
 */
export function elegidosAlActualizar({ capitulos = [], items = [], otras = [], nueva = {}, elegidosAntes = [] } = {}) {
  const ID = nueva.id ?? "la-version-nueva";
  const vigentes = (otras || []).filter(c => !c.reemplazada_at && String(c.id) !== String(ID));
  const matriz = matrizDeCotizaciones({ capitulos, items, cotizaciones: [...vigentes, { ...nueva, id: ID, reemplaza_a: null, reemplazada_at: null }] });
  const deOtra = new Set(vigentes.flatMap(c => (Array.isArray(c.elegidos) ? c.elegidos : []).map(String)));
  const siguen = {};
  (elegidosAntes || []).map(String).forEach(f => { if (!deOtra.has(f) && matriz.celdaDe(f, ID)) siguen[f] = ID; });
  // UN TOTAL ES POR TODO EL CAPÍTULO: no vuelve encima de lo que mientras tanto se eligió de otra
  // empresa ahí, ni vuelven filas sueltas encima del total elegido de otra.
  const deLasOtras = elegidosDe(vigentes);
  return Object.keys(siguen).filter(clave => {
    const grupo = matriz.grupos.find(g => g.filas.some(x => x.clave === clave));
    const ajenas = (grupo?.filas || []).map(x => matriz.celdaDe(x.clave, deLasOtras[x.clave])).filter(Boolean);
    return !ajenas.length || (matriz.celdaDe(clave, ID).tipo !== "suma" && !ajenas.some(x => x.tipo === "suma"));
  });
}

/**
 * QUÉ CAMBIÓ de una versión a la siguiente, fila por fila: lo que subió, lo
 * que bajó, lo que ahora cotiza y antes no, lo que dejó de cotizar, y la
 * cantidad si es otra aunque el precio sea el mismo.
 *
 * @param matriz    la de hoy
 * @param anterior  la matriz armada con anterioresDe()
 * La que había totalizado y ahora manda el detalle: su total «ahora viene
 * itemizado» (`itemizo`), y cada fila nueva es algo que «ahora cotiza». No se
 * compara el precio de una ventana contra un pedazo inventado del total viejo.
 *
 * @returns { filas: [{ clave, capitulo, descripcion, antes, ahora, que, cantidadAntes?, cantidadAhora? }], antes, ahora, diferencia }
 */
export function cambiosDeVersion({ matriz, anterior, cotId, anteriorId } = {}) {
  const filas = [];
  const vistas = new Set();
  const valor = x => (x ? x.unitario : null);
  const itemizaEn = capitulo => (matriz?.grupos || []).find(g => g.capitulo === capitulo)?.filas.some(f => f.celdas[cotId]?.tipo === "rubro");
  const cotizada = x => (x?.tipo === "rubro" ? n(x.cantidad) : null);
  const mirar = (f, capitulo) => {
    if (vistas.has(f.clave)) return;
    vistas.add(f.clave);
    const ahora = matriz?.celdaDe(f.clave, cotId) || null, antes = anterior?.celdaDe(f.clave, anteriorId) || null;
    if (!ahora && !antes) return;
    const va = valor(ahora), vb = valor(antes), ca = cotizada(ahora), cb = cotizada(antes);
    const otraCantidad = ca != null && cb != null && !igual(ca, cb);
    const precio = !antes ? "nuevo" : !ahora ? "ya_no" : igual(va, vb) ? "igual" : va > vb ? "subio" : "bajo";
    const que = precio === "igual" && otraCantidad ? "cantidad" : precio === "ya_no" && antes.tipo === "suma" && itemizaEn(capitulo) ? "itemizo" : precio;
    if (que !== "igual") {
      filas.push({ clave: f.clave, capitulo, descripcion: (ahora || antes).descripcion || f.descripcion, antes: vb, ahora: va, que,
        ...(otraCantidad ? { cantidadAntes: cb, cantidadAhora: ca } : {}) });
    }
  };
  for (const g of matriz?.grupos || []) g.filas.forEach(f => mirar(f, g.capitulo));
  // Lo que la anterior cotizaba en filas que hoy ya no existen.
  for (const g of anterior?.grupos || []) g.filas.forEach(f => mirar(f, g.capitulo));
  const total = (m, id) => n(m?.empresas.find(e => String(e.id) === String(id))?.comparado);
  const antes = total(anterior, anteriorId), ahora = total(matriz, cotId);
  return { filas, antes, ahora, diferencia: r2(ahora - antes) };
}
