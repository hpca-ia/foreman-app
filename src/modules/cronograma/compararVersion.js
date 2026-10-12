// Comparar el cronograma de hoy contra una foto anterior.
//
// Un cronograma vive: se corrige, se traslapa, se parte en etapas, se acomoda
// cuando entra una orden de cambio. Eso está bien. Lo que falta es poder
// contestar CUÁNTO NOS CORRIMOS, porque hoy "vamos quince días atrasados" es
// una impresión y no un dato — y cuando hay que justificar un atraso ante un
// cliente, o pedir una ampliación de plazo, una impresión no sirve.

const n = v => Number(v) || 0;
const dia = f => String(f || "").slice(0, 10);

const DIA_MS = 86400000;
const dias = (a, b) => {
  const x = new Date(`${dia(a)}T12:00:00`), y = new Date(`${dia(b)}T12:00:00`);
  if (isNaN(x) || isNaN(y)) return null;
  return Math.round((y - x) / DIA_MS);
};

/** La foto que se guarda: lo mínimo para poder comparar después. */
export function fotoDe(actividades = [], dependencias = []) {
  return {
    actividades: actividades.map(a => ({
      id: a.id, nombre: a.nombre, duracion: n(a.duracion),
      inicio: dia(a.inicio), fin: dia(a.fin),
      obra_actividad_id: a.obra_actividad_id ?? null,
      etapa: a.etapa || null, peso_pct: a.peso_pct ?? null,
      critica: !!a.critica,
    })),
    dependencias: dependencias.map(d => ({
      actividad_id: d.actividad_id, depende_de_id: d.depende_de_id,
      tipo: d.tipo || "FC", retardo: n(d.retardo),
    })),
  };
}

/**
 * Qué cambió entre una foto y el cronograma de hoy.
 *
 * SE EMPAREJA POR ID y, si no, por nombre. El id es lo exacto; el nombre es la
 * red para cuando alguien borró una barra y la volvió a crear —que pasa, y sin
 * la red esa barra aparecería como una que desapareció y otra nueva, escondiendo
 * justamente el corrimiento que se quería medir.
 */
export function comparar(foto = {}, actividades = [], dependencias = []) {
  const antes = foto.actividades || [];
  const porId = new Map(antes.map(a => [Number(a.id), a]));
  const porNombre = new Map(antes.map(a => [String(a.nombre || "").trim(), a]));
  const usadas = new Set();

  const lineas = actividades.map(a => {
    const viejo = porId.get(Number(a.id)) || porNombre.get(String(a.nombre || "").trim()) || null;
    if (viejo) usadas.add(viejo.id);
    const corrimientoInicio = viejo ? dias(viejo.inicio, dia(a.inicio)) : null;
    const corrimientoFin = viejo ? dias(viejo.fin, dia(a.fin)) : null;
    return {
      id: a.id, nombre: a.nombre, critica: !!a.critica,
      nueva: !viejo,
      antes: viejo,
      duracion: { antes: viejo ? n(viejo.duracion) : null, ahora: n(a.duracion) },
      inicio: { antes: viejo ? viejo.inicio : null, ahora: dia(a.inicio) },
      fin: { antes: viejo ? viejo.fin : null, ahora: dia(a.fin) },
      // Positivo es que se corrió hacia ADELANTE: empieza o termina más tarde.
      corrimientoInicio, corrimientoFin,
      cambioDuracion: viejo ? n(a.duracion) - n(viejo.duracion) : null,
    };
  });

  const borradas = antes.filter(a => !usadas.has(a.id));

  // Cuánto se corrió la obra entera: la última fecha de antes contra la de
  // ahora. Es el número que se dice en una reunión.
  const finAntes = antes.reduce((m, a) => (a.fin > m ? a.fin : m), "");
  const finAhora = actividades.reduce((m, a) => (dia(a.fin) > m ? dia(a.fin) : m), "");

  const movidas = lineas.filter(l => l.corrimientoFin != null && l.corrimientoFin !== 0);

  return {
    lineas,
    borradas,
    nuevas: lineas.filter(l => l.nueva),
    movidas,
    // Las que se corrieron Y están en la ruta crítica: son las que explican el
    // atraso de la obra. Las demás se movieron dentro de su colchón.
    criticasMovidas: movidas.filter(l => l.critica && l.corrimientoFin > 0),
    finAntes, finAhora,
    corrimientoObra: finAntes && finAhora ? dias(finAntes, finAhora) : null,
    // Lo que más se atrasó, primero: es por donde se empieza a mirar.
    peores: [...movidas].sort((a, b) => (b.corrimientoFin || 0) - (a.corrimientoFin || 0)).slice(0, 8),
  };
}

