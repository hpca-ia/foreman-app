// EL CHECKLIST QUE VE EL CLIENTE EN SU ENLACE.
//
// De cada tarea que el equipo decidió mostrarle sale lo mínimo: qué dice y en
// qué está. Lo demás es interno y no viaja: la nota de quien la trabajó, los
// comentarios, quién la tiene, para cuándo estaba.
//
// Sin base: recibe las filas y devuelve lo que se manda. Así se puede probar
// qué sale y, sobre todo, qué no (pruebas/listaDelCliente.test.mjs).

const dia = f => String(f || "").slice(0, 10) || null;

/**
 * @param tareas  las filas de `tasks` del proyecto
 * @returns [{ id, titulo, estado: "listo" | "espera" | "pendiente", listo_el }]
 *          en el orden en que se escribieron, que es el orden de un checklist
 */
export function listaDelCliente(tareas = []) {
  return (Array.isArray(tareas) ? tareas : [])
    // Solo lo marcado. Las compras tienen su circuito y lo que se cerró con
    // «ya no va» no se hizo ni falta: mostrárselo al cliente sería ruido.
    .filter(t => t && t.visible_cliente === true && !t.descartada && !t.compra_id && t.type !== "Compra")
    .sort((a, b) => (Number(a.ruta_orden) || 0) - (Number(b.ruta_orden) || 0) || Number(a.id) - Number(b.id))
    .map(t => {
      const listo = t.status === "listo";
      return {
        id: t.id,
        titulo: String(t.title || "").trim(),
        estado: listo ? "listo" : t.espera ? "espera" : "pendiente",
        listo_el: listo ? dia(t.hecha_at) : null,
      };
    })
    .filter(t => t.titulo);
}

/** Cuánto va, para el encabezado: listas de cuántas. */
export const avanceDeLaLista = (lista = []) => ({ listas: lista.filter(t => t.estado === "listo").length, total: lista.length });
