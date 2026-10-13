// Lo que vuelve de NOVA, pasado por el filtro.
//
// Sin base de datos para poder probarlo: acá se decide qué de lo que dijo un
// modelo entra en un documento que después se firma y se manda a ocho
// personas, y eso tiene que estar bien.

const limpio = (t, n = 300) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const esFecha = f => /^\d{4}-\d{2}-\d{2}$/.test(String(f || ""));

/** Lo que vuelve, pasado por el filtro: nada entra sin nombre, nada se duplica. */
export function normalizar(datos, pendientes = []) {
  const vivos = new Set(pendientes.map(p => Number(p.id)));
  return {
    temas: (datos.temas || [])
      .map(t => ({ titulo: limpio(t?.titulo, 120), detalle: limpio(t?.detalle, 1200) || null, resuelto: limpio(t?.resuelto, 1200) || null }))
      .filter(t => t.titulo),
    compromisos: (datos.compromisos || [])
      .map(c => ({
        texto: limpio(c?.texto, 300),
        responsable: limpio(c?.responsable, 80) || null,
        fecha: esFecha(c?.fecha) ? c.fecha : null,
      }))
      .filter(c => c.texto),
    // El repaso solo sobre compromisos que de verdad están abiertos en esta
    // acta: un id inventado marcaría cumplido algo que nadie miró.
    repaso: (datos.repaso || [])
      .map(r => ({ id: Number(r?.id), hecho: !!r?.hecho, nota: limpio(r?.nota, 300) || null }))
      .filter(r => vivos.has(r.id)),
    avance: limpio(datos.avance, 1200) || null,
    falta: (datos.falta || []).map(f => limpio(f, 200)).filter(Boolean).slice(0, 8),
  };
}
