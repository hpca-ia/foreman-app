/**
 * A quién se le manda el acta: los asistentes con correo marcados para
 * recibirla.
 *
 * Los que faltaron también la reciben, y es lo correcto: el acta se manda a los
 * CONVOCADOS, no a los presentes. Justamente el que no vino es el que más
 * necesita enterarse de lo que se decidió sin él.
 *
 * Sin base de datos para poder probarlo: mandar un acta al correo equivocado
 * —o no mandársela a quien tenía que recibirla— no se descubre hasta que
 * alguien reclama que nunca se enteró.
 */
export function correosDe(asistentes = []) {
  return [...new Set((asistentes || [])
    .filter(a => a?.recibe && a?.email)
    .map(a => String(a.email).trim().toLowerCase())
    .filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)))];
}
