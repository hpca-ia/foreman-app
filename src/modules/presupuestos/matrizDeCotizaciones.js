// LA MATRIZ PARA COMPARAR COTIZACIONES, ANTES DE QUE ENTREN AL PRESUPUESTO.
//
// Hernán, 26/11/2026: «Al armar presupuestos se cotiza de distintas empresas y
// vienen distintos presupuestos... ¿cómo se puede comparar los distintos
// presupuestos recibidos y posterior a eso escoger la mejor opción para que
// ingrese al presupuesto? Una especie de matriz». Y enseguida: «no solo por
// rubros, porque cada empresa puede cotizar de manera distinta o nombrar
// distinto. Se puede poner en tipo matriz los rubros y los totales».
//
// Hasta acá se subía la cotización de UNA empresa y sus precios pisaban a los
// de la anterior. Ahora cada cotización se guarda sin entrar, y esto arma el
// cuadro: los rubros del presupuesto en filas, una columna por empresa.
//
// CADA EMPRESA COTIZA A SU MANERA, y la matriz compara igual:
//
//   · RENGLÓN POR RENGLÓN: el renglón de la empresa es un rubro del
//     presupuesto. Se compara el unitario, y el total sale sobre la cantidad
//     del presupuesto —la misma para todas—. Si el presupuesto todavía no
//     tiene cantidad, se usa la que cotizó cada una, y se dice.
//
//   · EL PAQUETE ENTERO: un solo renglón que cubre varios rubros —«drywall:
//     tumbado y paredes»—. No tiene unitario por rubro: se compara su total
//     contra lo que suman esos rubros. Es la regla que él definió el
//     18/11/2026 para Beneficios: el total contra la suma.
//
// Para poder sumar por capítulo y por empresa, el total de un paquete se
// reparte entre sus rubros. EL REPARTO ES UNA ESTIMACIÓN NUESTRA —la empresa
// no dijo cuánto es de cada rubro— y por eso se marca, y el total del paquete
// queda exacto al centavo. La proporción sale, en este orden, de: lo que esos
// rubros ya valen en el presupuesto; si no, de lo que cotizaron renglón por
// renglón las otras empresas; y si no hay referencia, a partes iguales. (El
// orden es decisión mía; él eligió «repartido en proporción».)
//
// NADIE GANA POR HABER COTIZADO MENOS COSAS. El menor de un capítulo se marca
// solo entre las empresas que cubren todo lo que alguna cotizó ahí.
//
// Sin base ni pantalla: se puede probar (pruebas/matrizDeCotizaciones.test.mjs).

import { estructura } from "./estructura.js";

const n = v => Number(v) || 0;
const r2 = v => Math.round(n(v) * 100) / 100;
const r6 = v => Math.round(n(v) * 1e6) / 1e6;
const igual = (a, b) => Math.abs(n(a) - n(b)) < 0.00005;

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

/**
 * Los renglones de una cotización con los rubros del presupuesto que cubre
 * cada uno, y con su descuento general ya restado. Un rubro que ya tomó un
 * renglón anterior de la misma empresa no se repite en el siguiente, y uno que
 * ya no está en el presupuesto se saca.
 */
export function renglonesDe(cot, idsVivos = null) {
  const usados = new Set();
  const queda = 1 - descuentoDe(cot) / 100;
  return (cot?.renglones || []).map((r, k) => {
    const suyos = (Array.isArray(r?.items) ? r.items : []).map(Number)
      .filter(id => id > 0 && (!idsVivos || idsVivos.has(id)) && !usados.has(id) && usados.add(id));
    return queda === 1 ? { ...r, k, items: suyos }
      : { ...r, k, items: suyos, precio_unitario: r6(n(r.precio_unitario) * queda), total: r2(totalDelRenglon(r) * queda) };
  });
}

/** Reparte `total` según `pesos`, en centavos y sin que sobre ni falte ninguno. */
export function repartir(total, pesos = []) {
  const centavos = Math.round(n(total) * 100);
  const suma = pesos.reduce((t, p) => t + Math.max(0, n(p)), 0);
  const partes = pesos.map(p => (suma > 0 ? centavos * Math.max(0, n(p)) / suma : centavos / (pesos.length || 1)));
  const enteros = partes.map(Math.floor);
  let resto = centavos - enteros.reduce((t, x) => t + x, 0);
  // Los centavos que quedan, a los que más les faltaba para el siguiente.
  const orden = partes.map((p, i) => [p - enteros[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let j = 0; resto > 0 && orden.length; j = (j + 1) % orden.length, resto--) enteros[orden[j][1]] += 1;
  return enteros.map(c => c / 100);
}

/**
 * @param capitulos     los del presupuesto, con su orden
 * @param items         los rubros del presupuesto (presupuesto_items)
 * @param cotizaciones  [{ id, proveedor, renglones: [{ descripcion, unidad,
 *                      cantidad, precio_unitario, total, items: [id…] }] }]
 * @returns {
 *   empresas: [{ id, proveedor, cotizado, comparado, cubre, sueltos, renglones }],
 *   grupos:   [{ numero, capitulo, filas: [{ id, numero, item, celdas, menor }],
 *                sub: { [cotId]: { total, cubre, faltan, estimado } }, cotizados, menor }],
 *   celdaDe:  (itemId, cotId) => celda | null,
 * }
 * Una celda es { tipo: "rubro", unitario, cantidad, total, … } o
 * { tipo: "paquete", renglon, descripcion, totalDelPaquete, items, parte, pesoDe }.
 */
export function matrizDeCotizaciones({ capitulos = [], items = [], cotizaciones = [] } = {}) {
  const porId = new Map((items || []).map(i => [Number(i.id), i]));
  const vivos = new Set(porId.keys());
  const celdas = new Map();   // `${itemId}|${cotId}` → celda
  const clave = (itemId, cotId) => `${Number(itemId)}|${cotId}`;
  const empresas = (cotizaciones || []).map(c => ({
    ...c, renglones: renglonesDe(c, vivos),
    // El descuento general que ya está restado en todo lo de esta empresa, y el que ofrece su papel.
    descuento: descuentoDe(c),
    descuentoOfrecido: descuentoDe({ ...c, totales: { ...(c.totales || {}), sin_descuento: false } }),
  }));

  // 1. Renglón por renglón: un renglón, un rubro.
  for (const c of empresas) {
    for (const r of c.renglones) {
      if (r.items.length !== 1) continue;
      const item = porId.get(r.items[0]);
      const unitario = unitarioDe(r);
      const tuya = n(item.cantidad);
      const cantidad = tuya > 0 ? tuya : n(r.cantidad) || 1;
      celdas.set(clave(item.id, c.id), {
        tipo: "rubro", renglon: r.k, descripcion: r.descripcion || "", unidad: r.unidad || "",
        unitario, cantidad, total: r2(cantidad * unitario),
        cantidadCotizada: n(r.cantidad), sinCantidadTuya: !(tuya > 0),
        otraCantidad: tuya > 0 && n(r.cantidad) > 0 && !igual(tuya, r.cantidad),
      });
    }
  }

  // 2. Los paquetes: un renglón, varios rubros. Su total se reparte.
  const valeEnElPresupuesto = i => n(i.cantidad) * (n(i.precio_base) > 0 ? n(i.precio_base) : n(i.precio_unitario));
  for (const c of empresas) {
    for (const r of c.renglones) {
      if (r.items.length < 2) continue;
      const suyos = r.items.map(id => porId.get(id));
      const delPresupuesto = suyos.map(valeEnElPresupuesto);
      const deOtras = suyos.map(i => {
        const vistas = empresas.filter(o => o.id !== c.id).map(o => celdas.get(clave(i.id, o.id)))
          .filter(x => x && x.tipo === "rubro" && x.total > 0);
        return vistas.length ? vistas.reduce((t, x) => t + x.total, 0) / vistas.length : 0;
      });
      const [pesos, pesoDe] = delPresupuesto.every(v => v > 0) ? [delPresupuesto, "presupuesto"]
        : deOtras.every(v => v > 0) ? [deOtras, "otras"] : [suyos.map(() => 1), "iguales"];
      const totalDelPaquete = totalDelRenglon(r);
      const partes = repartir(totalDelPaquete, pesos);
      suyos.forEach((item, j) => celdas.set(clave(item.id, c.id), {
        tipo: "paquete", renglon: r.k, descripcion: r.descripcion || "", totalDelPaquete,
        items: r.items, parte: partes[j], total: partes[j], pesoDe,
      }));
    }
  }
  const celdaDe = (itemId, cotId) => celdas.get(clave(itemId, cotId)) || null;

  // 3. Los capítulos, como se ven en el presupuesto, con lo de cada empresa.
  const grupos = estructura({ capitulos, items }).map(cap => {
    const filas = cap.rubros.map(r => ({ r, item: porId.get(Number(r.id)) })).filter(x => x.item).map(({ r, item }) => {
      const suyas = Object.fromEntries(empresas.map(c => [c.id, celdaDe(item.id, c.id)]).filter(([, x]) => x));
      // El menor de un rubro, entre las que lo cotizaron con su propio precio.
      const conPrecio = Object.entries(suyas).filter(([, x]) => x.tipo === "rubro" && x.unitario > 0);
      const minimo = conPrecio.length > 1 ? Math.min(...conPrecio.map(([, x]) => x.unitario)) : null;
      const menores = minimo == null ? [] : conPrecio.filter(([, x]) => igual(x.unitario, minimo)).map(([id]) => id);
      return { id: Number(item.id), numero: r.numero || "", item, celdas: suyas, menor: menores.length === 1 ? menores[0] : null };
    });
    // Lo que alguna empresa cotizó en este capítulo: contra eso se mide a cada una.
    const cotizados = filas.filter(f => Object.keys(f.celdas).length).map(f => f.id);
    const sub = {};
    for (const c of empresas) {
      const propias = filas.filter(f => f.celdas[c.id]);
      if (!propias.length) continue;
      sub[c.id] = {
        total: r2(propias.reduce((t, f) => t + f.celdas[c.id].total, 0)),
        cubre: propias.length,
        faltan: cotizados.length - propias.length,
        // Estimado: parte de un paquete que también cubre rubros de otro capítulo.
        estimado: propias.some(f => f.celdas[c.id].tipo === "paquete"
          && f.celdas[c.id].items.some(id => !filas.some(x => x.id === id))),
      };
    }
    const completas = Object.entries(sub).filter(([, s]) => s.faltan === 0 && s.total > 0);
    const minimo = completas.length > 1 ? Math.min(...completas.map(([, s]) => s.total)) : null;
    const menores = minimo == null ? [] : completas.filter(([, s]) => igual(s.total, minimo)).map(([id]) => id);
    return { numero: cap.numero, capitulo: cap.nombre, filas, sub, cotizados, menor: menores.length === 1 ? menores[0] : null };
  });

  // 4. Cada empresa: lo que dice su papel, lo que suma sobre este presupuesto y lo que no calzó.
  const resumen = empresas.map(c => {
    const sueltos = c.renglones.filter(r => !r.items.length);
    return {
      id: c.id, proveedor: c.proveedor || "", archivo_id: c.archivo_id ?? null, totales: c.totales || null,
      renglones: c.renglones, sueltos,
      descuento: c.descuento, descuentoOfrecido: c.descuentoOfrecido,
      cotizado: r2(c.renglones.reduce((t, r) => t + totalDelRenglon(r), 0)),
      comparado: r2(grupos.reduce((t, g) => t + n(g.sub[c.id]?.total), 0)),
      cubre: grupos.reduce((t, g) => t + n(g.sub[c.id]?.cubre), 0),
      sinRubro: r2(sueltos.reduce((t, r) => t + totalDelRenglon(r), 0)),
    };
  });
  return { empresas: resumen, grupos, celdaDe };
}

// ── ELEGIR ─────────────────────────────────────────────────────────────────
//
// Lo elegido es un mapa { rubro del presupuesto → cotización }. Un paquete se
// elige o se suelta entero: la empresa cotizó todo junto, y quedarse con una
// parte es adjudicarle un precio que no dio.

/** Los rubros que arrastra elegir esta celda: ella sola, o su paquete entero. */
const conSuPaquete = (matriz, itemId, cotId) => {
  const celda = matriz.celdaDe(itemId, cotId);
  return !celda ? [] : celda.tipo === "paquete" ? celda.items.map(Number) : [Number(itemId)];
};

/** Saca de lo elegido los paquetes que quedaron partidos al cambiar de dueño algunos de sus rubros. */
function sinPaquetesRotos(matriz, elegidos) {
  const out = { ...elegidos };
  for (const [itemId, cotId] of Object.entries(elegidos)) {
    const celda = matriz.celdaDe(itemId, cotId);
    if (celda?.tipo === "paquete" && celda.items.some(id => String(out[id]) !== String(cotId))) {
      celda.items.forEach(id => { if (String(out[id]) === String(cotId)) delete out[id]; });
    }
  }
  return out;
}

/**
 * Elegir —o soltar, si ya estaba— un rubro para una empresa, o un capítulo
 * entero. @param que  { itemId } o { capitulo }
 */
export function elegir(matriz, elegidos = {}, cotId, que = {}) {
  const ids = que.capitulo != null
    ? (matriz.grupos.find(g => g.capitulo === que.capitulo)?.filas || []).filter(f => f.celdas[cotId])
      .flatMap(f => conSuPaquete(matriz, f.id, cotId))
    : conSuPaquete(matriz, que.itemId, cotId);
  const unicos = [...new Set(ids)];
  if (!unicos.length) return elegidos;
  const yaEstaban = unicos.every(id => String(elegidos[id]) === String(cotId));
  const out = { ...elegidos };
  unicos.forEach(id => { if (yaEstaban) delete out[id]; else out[id] = cotId; });
  return sinPaquetesRotos(matriz, out);
}

/**
 * Lo que se escribe en el presupuesto al aplicar lo elegido.
 *
 * Entra el COSTO —`precio_base`—; la utilidad de cada rubro se conserva y el
 * precio al cliente se recalcula con ella. La descripción y la cantidad del
 * rubro no se tocan: son las del cliente. Solo donde el presupuesto no tiene
 * cantidad se usa la que cotizó la empresa.
 *
 * @returns { cambios, costo, repartidos, sinCantidad }
 */
export function planDeAplicar({ matriz, elegidos = {}, items = [] } = {}) {
  const porId = new Map((items || []).map(i => [Number(i.id), i]));
  const empresa = new Map(matriz.empresas.map(e => [String(e.id), e]));
  const cambios = [];
  for (const [itemId, cotId] of Object.entries(elegidos)) {
    const item = porId.get(Number(itemId));
    const celda = matriz.celdaDe(itemId, cotId);
    const e = empresa.get(String(cotId));
    if (!item || !celda || !e) continue;
    const tuya = n(item.cantidad);
    const repartido = celda.tipo === "paquete";
    const cantidad = tuya > 0 ? tuya : repartido ? 1 : celda.cantidad;
    const costo = repartido ? celda.parte : r2(cantidad * celda.unitario);
    // El unitario de un reparto sale de su parte: con seis decimales, para
    // que cantidad por unitario vuelva a dar la parte al centavo.
    const precio_base = repartido ? r6(costo / cantidad) : celda.unitario;
    const pct = n(item.utilidad_pct);
    const precio_unitario = r2(precio_base * (1 + pct / 100));
    cambios.push({
      id: Number(item.id), descripcion: item.descripcion || "", proveedor: e.proveedor, cotizacion_id: e.id,
      precio_base, precio_unitario, cantidad, total: r2(cantidad * precio_unitario), costo,
      ponerCantidad: !(tuya > 0), repartido,
      pesoDe: repartido ? celda.pesoDe : null,
      costoAntes: r2(tuya * (n(item.precio_base) > 0 ? n(item.precio_base) : n(item.precio_unitario))),
      // De qué papel salió el precio, como lo pide la migración 138.
      cotizacion_archivo_id: e.archivo_id ?? null, cotizacion_proveedor: e.proveedor || null,
      cotizacion_renglon: repartido
        ? `${celda.descripcion} · repartido entre ${celda.items.length} rubros`.slice(0, 400)
        : String(celda.descripcion || "").slice(0, 400),
      cotizacion_cantidad: repartido ? null : (celda.cantidadCotizada || null),
    });
  }
  return {
    cambios,
    costo: r2(cambios.reduce((t, c) => t + c.costo, 0)),
    repartidos: cambios.filter(c => c.repartido).length,
    sinCantidad: cambios.filter(c => c.ponerCantidad).length,
  };
}

/** Lo elegido, como se guarda: en cada cotización, los rubros que se le adjudicaron. */
export function elegidosPorCotizacion(elegidos = {}) {
  const out = {};
  for (const [itemId, cotId] of Object.entries(elegidos)) (out[cotId] = out[cotId] || []).push(Number(itemId));
  return out;
}

/** Y al revés, al leerlas: { rubro → cotización }. */
export function elegidosDe(cotizaciones = []) {
  const out = {};
  for (const c of cotizaciones || []) for (const id of (Array.isArray(c.elegidos) ? c.elegidos : [])) out[Number(id)] = c.id;
  return out;
}
