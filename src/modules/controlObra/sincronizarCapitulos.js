import { supabase } from "../../lib/supabase";

/**
 * Los capítulos de la obra siguen a los del presupuesto.
 *
 * `obra_rubros` es una copia congelada del presupuesto: así tiene que ser para
 * los números —cantidad, precio, total— porque la línea base es contra qué se
 * mide el avance, y una línea base que se mueve no mide nada.
 *
 * El capítulo no es un número: es cómo se agrupan los rubros para leerlos. Si
 * en el presupuesto se renombró "ALBAÑILERÍA" a "OBRA CIVIL", o un rubro se
 * movió de capítulo, la obra tiene que decir lo mismo. Mientras no lo hizo,
 * el pedido de compras ofrecía capítulos que ya no existían en ningún lado y
 * no había forma de arreglarlo desde la pantalla.
 *
 * Se mueven dos columnas y ninguna más: `capitulo` y `capitulo_orden`. Ningún
 * monto, ninguna cantidad, ningún rubro nuevo ni borrado. Un rubro que se
 * agregó al presupuesto después de activar la obra NO entra acá: eso es una
 * orden de cambio, que es otra cosa y tiene su módulo.
 *
 * Solo alcanza a los rubros que saben de qué ítem del presupuesto vinieron
 * (`presupuesto_item_id`). Los de una obra importada suelta no tienen de dónde
 * copiar, y se quedan como están.
 *
 * @returns {number} cuántos rubros cambiaron de capítulo (0 = ya estaban bien)
 */
export async function sincronizarCapitulos(obra) {
  if (!obra?.id || !obra.presupuesto_id) return 0;

  const { data: rubros, error } = await supabase.from("obra_rubros")
    .select("id,capitulo,capitulo_orden,presupuesto_item_id").eq("obra_id", obra.id);
  if (error) return 0;

  const conOrigen = (rubros || []).filter(r => r.presupuesto_item_id);
  if (!conOrigen.length) return 0;

  const { data: items } = await supabase.from("presupuesto_items")
    .select("id,capitulo,orden").eq("presupuesto_id", obra.presupuesto_id);
  if (!items?.length) return 0;

  // El orden del capítulo viene codificado en el del rubro, la misma
  // convención de siempre: capítulo × 1000 + posición dentro del capítulo.
  const porId = new Map(items.map(i => [i.id, i]));
  const porDestino = new Map();
  conOrigen.forEach(r => {
    const it = porId.get(r.presupuesto_item_id);
    if (!it) return;
    const capitulo = it.capitulo || "SIN CAPÍTULO";
    const capituloOrden = Math.floor((Number(it.orden) || 0) / 1000) || 0;
    if (capitulo === (r.capitulo || "SIN CAPÍTULO") && capituloOrden === (r.capitulo_orden ?? 0)) return;
    const clave = `${capituloOrden}\u0000${capitulo}`;
    if (!porDestino.has(clave)) porDestino.set(clave, { capitulo, capitulo_orden: capituloOrden, ids: [] });
    porDestino.get(clave).ids.push(r.id);
  });
  if (!porDestino.size) return 0;

  // Un update por capítulo de destino y no uno por rubro: son 170 rubros y
  // típicamente media docena de capítulos tocados.
  let movidos = 0;
  for (const { capitulo, capitulo_orden, ids } of porDestino.values()) {
    const { error: e } = await supabase.from("obra_rubros")
      .update({ capitulo, capitulo_orden }).in("id", ids);
    if (!e) movidos += ids.length;
  }
  return movidos;
}
