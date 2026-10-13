// Qué días tiene que mostrar el libro de obra.
//
// Mostraba los que EXISTEN en la base, y un día existe recién cuando alguien
// lo abre. Entonces un día que nadie abrió —el residente no entró, era feriado
// y nadie lo dijo, se cortó el internet— no aparece en ninguna parte: no se
// puede ver, no se puede completar y no se puede explicar. El libro queda con
// un agujero que ni siquiera se ve como agujero.
//
// Y es justo al revés de lo que hace falta. Un libro de obra vale por ser
// CONTINUO: la fecha que falta es la que un abogado busca. Un día vacío y
// dicho —"nadie escribió"— es un registro; un día ausente es una duda.

const DIA = 86400000;
export const claveFecha = f => {
  const d = f instanceof Date ? f : new Date(`${f}T12:00:00`);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * La lista de días, de hoy para atrás, con su libro si lo tiene.
 *
 * @param dias        los que existen en la base
 * @param hoy         la fecha de hoy en la obra
 * @param cuantos     cuántos días hacia atrás
 * @param desde       no se va más atrás del arranque de la obra, si se sabe
 * @param laborables  qué días se trabaja: los domingos no son agujeros
 */
export function listaDeDias({ dias = [], hoy, cuantos = 30, desde = null, laborables = null } = {}) {
  if (!hoy) return [];
  const porFecha = new Map(dias.map(d => [d.fecha, d]));
  const base = new Date(`${hoy}T12:00:00`);
  const salida = [];
  for (let i = 0; i < cuantos; i++) {
    const f = new Date(base.getTime() - i * DIA);
    const fecha = claveFecha(f);
    if (desde && fecha < desde) break;
    const dia = porFecha.get(fecha) || null;
    // Un día en que no se trabaja y que nadie escribió no es una falta. Si
    // alguien escribió —se trabajó un domingo— entra igual, porque pasó.
    if (!dia && laborables && !laborables.includes(f.getDay())) continue;
    salida.push({ fecha, dia, hoy: fecha === hoy });
  }
  // Los que existen fuera del rango —un libro viejo— no se pierden.
  const vistas = new Set(salida.map(d => d.fecha));
  dias.filter(d => !vistas.has(d.fecha)).forEach(d => salida.push({ fecha: d.fecha, dia: d, hoy: false }));
  return salida.sort((a, b) => b.fecha.localeCompare(a.fecha));
}

/** Cuántos días quedaron sin una sola línea: es la salud del libro. */
export function sinEscribir(lista = []) {
  return lista.filter(d => !d.hoy && !d.dia).length;
}
