import { pelado, palabrasClave } from "./buscarRubros";

// Rubros repetidos dentro de un mismo presupuesto.
//
// Repetido no es solo el rubro escrito igual dos veces: al armar un
// presupuesto entre varios archivos aparece "Pintura de caucho en paredes" en
// un capítulo y "Pintura caucho interior en pared" en otro. Son el mismo
// trabajo con dos cantidades sueltas, y así se cotiza dos veces.
//
// El criterio: dos rubros se agrupan si comparten sus palabras, pero no todas
// las palabras valen lo mismo. "Suministro", "instalación" o "incluye" están
// en medio presupuesto y no dicen nada; "gypsum" o "tomacorriente" sí. Cada
// palabra pesa según qué tan poco común sea en este presupuesto, y dos rubros
// que solo comparten una palabra genérica no se agrupan.
//
// Para no comparar todos contra todos —un presupuesto grande son cientos de
// rubros— solo se comparan los que comparten alguna palabra.

const n = v => Number(v) || 0;

/**
 * @param items   rubros del presupuesto [{ id, descripcion, unidad, cantidad, precio_unitario, total, capitulo }]
 * @param minimo  cuánto se tienen que parecer para caer en el mismo grupo (0 a 100; 100 = escritos igual)
 * @returns [{ items, iguales, parecido, comunes, unidades, capitulos, cantidad, monto, precioMin, precioMax }] de mayor monto a menor
 */
export function gruposRepetidos(items = [], { minimo = 70 } = {}) {
  const datos = items.map(i => ({ item: i, clave: pelado(i.descripcion), palabras: palabrasClave(i.descripcion) }));

  // Qué tan poco común es cada palabra en este presupuesto.
  const enCuantos = new Map();
  datos.forEach(d => d.palabras.forEach(p => enCuantos.set(p, (enCuantos.get(p) || 0) + 1)));
  const total = datos.length || 1;
  const peso = p => Math.log(1 + total / (enCuantos.get(p) || 1));
  datos.forEach(d => { d.peso = [...d.palabras].reduce((s, p) => s + peso(p), 0); });

  function parecidoEntre(a, b) {
    if (a.clave === b.clave) return { pct: 100, comunes: [...a.palabras] };
    const comunes = [...a.palabras].filter(p => b.palabras.has(p));
    if (!comunes.length) return { pct: 0, comunes };
    // Una sola palabra en común, con rubros que dicen varias cosas, no alcanza:
    // "Punto de iluminación" y "Punto de tomacorriente" no son el mismo rubro.
    if (comunes.length < 2 && Math.min(a.palabras.size, b.palabras.size) >= 2) return { pct: 0, comunes };
    const compartido = comunes.reduce((s, p) => s + peso(p), 0);
    return { pct: Math.round((2 * compartido) / (a.peso + b.peso) * 100), comunes };
  }

  // Índice palabra → rubros, para comparar solo contra los que algo comparten.
  const porPalabra = new Map();
  datos.forEach((d, idx) => d.palabras.forEach(p => {
    if (!porPalabra.has(p)) porPalabra.set(p, []);
    porPalabra.get(p).push(idx);
  }));

  const grupoDe = new Array(datos.length).fill(-1);
  const grupos = [];
  datos.forEach((d, idx) => {
    if (grupoDe[idx] !== -1) return;
    const grupo = [idx];
    const comunes = new Set(d.palabras);
    let flojo = 100;
    grupoDe[idx] = grupos.length;
    const candidatos = new Set();
    d.palabras.forEach(p => (porPalabra.get(p) || []).forEach(k => { if (k > idx && grupoDe[k] === -1) candidatos.add(k); }));
    [...candidatos].sort((a, b) => a - b).forEach(k => {
      const o = datos[k];
      const r = parecidoEntre(d, o);
      // Con el mínimo en 100 se piden los escritos exactamente igual.
      const calza = minimo >= 100 ? o.clave === d.clave : r.pct >= minimo;
      if (!calza) return;
      grupoDe[k] = grupos.length;
      grupo.push(k);
      flojo = Math.min(flojo, r.pct);
      [...comunes].forEach(p => { if (!o.palabras.has(p)) comunes.delete(p); });
    });
    grupos.push({ indices: grupo, parecido: flojo, comunes: [...comunes] });
  });

  return grupos
    .filter(g => g.indices.length > 1)
    .map(g => {
      const suyos = g.indices.map(k => datos[k].item);
      const precios = suyos.map(i => n(i.precio_unitario)).filter(v => v > 0);
      return {
        items: suyos,
        iguales: new Set(g.indices.map(k => datos[k].clave)).size === 1,
        parecido: g.parecido,
        comunes: g.comunes,
        unidades: [...new Set(suyos.map(i => String(i.unidad || "").trim()).filter(Boolean))],
        capitulos: [...new Set(suyos.map(i => i.capitulo))],
        cantidad: suyos.reduce((s, i) => s + n(i.cantidad), 0),
        monto: suyos.reduce((s, i) => s + n(i.total), 0),
        precioMin: precios.length ? Math.min(...precios) : 0,
        precioMax: precios.length ? Math.max(...precios) : 0,
      };
    })
    .sort((a, b) => b.monto - a.monto);
}

/** El rubro del grupo que conviene conservar: el de mayor monto. */
export function principalDe(grupo) {
  return [...grupo.items].sort((a, b) => n(b.total) - n(a.total))[0];
}

// ── Los que ya se decidió dejar separados ────────────────────────────────
// La decisión se queda: "estos dos son distintos" no se vuelve a preguntar en
// cada revisión. Vive en el presupuesto, en la base, para que valga desde
// cualquier equipo; el navegador guarda una copia por si la base todavía no
// tiene la columna (migración 031) o falla la conexión.

const LLAVE = id => `foreman_separados_${id}`;

export function leerLocales(presupuestoId) {
  try { return JSON.parse(localStorage.getItem(LLAVE(presupuestoId)) || "[]"); }
  catch { return []; }
}

export function guardarLocales(presupuestoId, claves) {
  try { localStorage.setItem(LLAVE(presupuestoId), JSON.stringify([...claves])); } catch { /* sin memoria del navegador, queda solo en la base */ }
}
