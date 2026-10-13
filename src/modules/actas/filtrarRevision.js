// Lo que vuelve de la revisión, pasado por el filtro.
//
// Sin base de datos para poder probarlo. Una corrección que apunta a un id que
// no existe, o a un campo que no es, escribiría en un documento que después se
// firma — y lo haría en silencio, que es lo peor de todo.

const limpio = (t, n = 2000) => String(t ?? "").trim().slice(0, n);
const CAMPOS = {
  tema: ["titulo", "detalle", "resuelto"],
  compromiso: ["texto"],
  acta: ["avance_nota", "resumen"],
};

export function filtrar(datos, { temas = [], compromisos = [], acta = null } = {}) {
  const porTipo = {
    tema: new Map(temas.map(t => [Number(t.id), t])),
    compromiso: new Map(compromisos.map(c => [Number(c.id), c])),
    acta: new Map(acta ? [[Number(acta.id), acta]] : []),
  };

  const correcciones = (datos?.correcciones || []).map(c => {
    const tipo = String(c?.tipo || "").toLowerCase();
    const campo = String(c?.campo || "");
    const id = Number(c?.id);
    const fila = porTipo[tipo]?.get(id);
    if (!fila) return null;
    if (!CAMPOS[tipo]?.includes(campo)) return null;
    const texto = limpio(c?.texto);
    // Si no cambia nada, no es una corrección. Una lista llena de "cambios"
    // idénticos hace que uno deje de mirar los que sí cambian.
    if (!texto || texto === limpio(fila[campo])) return null;
    return { tipo, id, campo, antes: fila[campo] || "", texto, porque: limpio(c?.porque, 120) || null };
  }).filter(Boolean);

  const avisos = (datos?.avisos || []).map(a => ({
    donde: limpio(a?.donde, 160),
    que: limpio(a?.que, 300),
    hacer: limpio(a?.hacer, 300) || null,
  })).filter(a => a.que).slice(0, 15);

  return { correcciones, avisos };
}
