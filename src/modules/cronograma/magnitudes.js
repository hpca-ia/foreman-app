// EL TAMAÑO DE UNA AGRUPACIÓN: cuántos metros hay que hacer.
//
// Esto está acá —en un archivo sin base de datos— porque lo usan dos lados que
// tienen que decir exactamente lo mismo: la consulta a NOVA, cuando le cuenta
// de qué tamaño es cada agrupación, y el apunte que se guarda cuando alguien
// corrige una duración a mano. Si cada uno lo calculara a su manera, NOVA
// aprendería un rendimiento medido sobre una cantidad distinta de la que usó
// para proponer, y el número que vuelve la próxima obra sería falso sin que
// nadie pueda notarlo.

const n = v => Number(v) || 0;

// Las unidades escritas de veinte maneras son la misma unidad. Sin esto, los
// 800 m2 de una obra salen como "600 M2 · 150 m² · 50 mt2" y dejan de sumar.
export const UNIDAD = u => {
  const t = String(u || "").trim().toLowerCase()
    .replace(/[.\s]/g, "").replace(/²/g, "2").replace(/³/g, "3");
  if (/^(m2|mt2|metro2|metroscuadrados?)$/.test(t)) return "m2";
  if (/^(m3|mt3|metro3|metroscubicos?)$/.test(t)) return "m3";
  if (/^(ml|m|mt|metro|metros|metrolineal)$/.test(t)) return "ml";
  if (/^(u|un|und|unid|unidad|unidades|c\/u|pto|ptos?|punto|puntos)$/.test(t)) return "u";
  if (/^(kg|kilo|kilos|kgs)$/.test(t)) return "kg";
  if (/^(glb|global|gbl)$/.test(t)) return "glb";
  return t.slice(0, 6) || "u";
};

/**
 * Las cantidades de un puñado de rubros, sumadas por unidad y de mayor a menor.
 *
 * La primera es la que define el tamaño: una agrupación de mampostería con
 * 450 m2 y 12 u de dinteles es una agrupación de 450 m2.
 *
 * QUÉ NO ENTRA, y por qué:
 * · lo anulado por una orden de cambio: sigue en la lista como historia del
 *   presupuesto, pero ya no es trabajo que haya que hacer;
 * · lo escondido: los renglones en $0 que alguien sacó del control —títulos
 *   sueltos, partidas sin precio— y que no son trabajo tampoco;
 * · lo global: "1 glb" no dice nada del tamaño, y sumado con los metros
 *   ensucia el único dato que sirve para pensar una duración.
 */
export function magnitudes(rubros = []) {
  const porUnidad = new Map();
  (rubros || []).forEach(r => {
    if (r?.anulado_por_oc || r?.oculto) return;
    const c = n(r?.cantidad);
    if (!c) return;
    const u = UNIDAD(r?.unidad);
    if (u === "glb") return;
    porUnidad.set(u, (porUnidad.get(u) || 0) + c);
  });
  return [...porUnidad.entries()]
    .map(([unidad, cantidad]) => ({ unidad, cantidad: Math.round(cantidad * 100) / 100 }))
    .sort((x, y) => y.cantidad - x.cantidad);
}

/** El tamaño de UNA agrupación, a partir de todos los rubros de la obra. */
export function magnitudDe(rubros = [], actividadId) {
  if (actividadId == null) return null;
  const suyos = (rubros || []).filter(r => Number(r?.actividad_id) === Number(actividadId));
  return magnitudes(suyos)[0] || null;
}

/**
 * El rendimiento que quedó demostrado: cuánto se hace por día.
 *
 * Es lo único que viaja de una obra a la siguiente. "El enlucido lleva 70
 * días" no se puede usar en otro proyecto —esa obra tiene otros metros—;
 * "el enlucido rinde 18 m2 por día" sí.
 */
export function rendimiento(magnitud, dias) {
  const d = Math.round(n(dias));
  if (!magnitud?.cantidad || !d) return null;
  return {
    cantidad: magnitud.cantidad,
    unidad: magnitud.unidad,
    dias: d,
    rinde: Math.round((magnitud.cantidad / d) * 10) / 10,
  };
}
