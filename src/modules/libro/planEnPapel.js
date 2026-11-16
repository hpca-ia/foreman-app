// EL PLAN DE LA SEMANA, ORDENADO PARA EL PAPEL.
//
// Qué va en la hoja y en qué orden, sin dibujar nada: eso lo hace
// pdfPlanSemanal.js. Separado para poder probarlo sin navegador ni librería
// (pruebas/planEnPapel.test.mjs).
//
// El 16/11/2026 Hernán bajó el plan del Aeropuerto: «no se ve para nada bien».
// Lo que se veía:
//   · «De la semana pasada quedaron 18 sin hacer» repetía dieciocho veces el
//     nombre del grupo —«Tabiquerías y Tumbados - sin decir por que»— porque
//     de cada actividad se escribía el título y no su nota, que es la que dice
//     qué había que hacer.
//   · El material de cada día salía en un párrafo gris pegado a la última
//     actividad, con los renglones de una lista pegada de corrido —«- Tinas
//     plásticas… - Tubos metálicos…»— y cortado a media palabra.
//   · Los compromisos de afuera salían mezclados con las tareas.

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const CORTOS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const fecha = f => new Date(`${String(f).slice(0, 10)}T12:00:00`);

/** "lunes 16/11" */
export const comoSeLee = f => {
  const d = fecha(f);
  return `${DIAS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
};
/** "Lunes 16/11", para el título del día. */
export const tituloDelDia = f => comoSeLee(f).replace(/^./, c => c.toUpperCase());
/** "lun 9/11", para la lista de lo que quedó. */
export const diaCorto = f => {
  if (!f) return "";
  const d = fecha(f);
  return `${CORTOS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
};

// EL TOPE VIEJO. Hasta el 16/11/2026 cada renglón del plan se guardaba cortado
// a 300 letras, sin avisar. Uno que mide justo eso está cortado: en la hoja se
// le ponen puntos suspensivos para que no parezca que termina ahí.
export const TOPE_VIEJO = 300;
const conSuCorte = t => (t.length === TOPE_VIEJO ? `${t.replace(/[\s,;:(-]+$/, "")}...` : t);

// La barra «|» con la que se separan dos turnos —«Diurna (08:00 a 17:00) |
// Nocturna (21:00 a 05:00)»— en la letra del PDF es igual a una ele. En la
// hoja va un punto medio.
export const sinBarras = t => String(t || "").replace(/\s+\|\s+/g, "  ·  ");

/**
 * Un renglón de material, en los renglones que trae adentro.
 *
 * El casillero del material es de una línea: quien pega ahí una lista de
 * varios renglones la deja de corrido, «- Tinas plásticas - Tubos metálicos -
 * Perfiles». Se reconoce por cómo empieza —con la raya— y se vuelve a abrir en
 * cada raya seguida de mayúscula. Lo que no empieza con raya se deja entero:
 * «Tubo de 1/2 - 3/4» es un solo material.
 */
export function enLista(texto) {
  const t = conSuCorte(String(texto || "").trim());
  if (!/^[-•*]\s+/.test(t)) return t ? [sinBarras(t)] : [];
  return t.replace(/^[-•*]\s+/, "").split(/\s+[-•*]\s+(?=[A-ZÁÉÍÓÚÑ])/)
    .map(x => sinBarras(x.trim())).filter(Boolean);
}

/**
 * Lo de un día, separado como en la pantalla: las tareas de la cuadrilla, el
 * material que tiene que estar, lo que se espera de afuera, y la ficha.
 */
export function seccionesDelDia(dia, items = []) {
  const suyos = items.filter(i => i.plan_dia_id === dia.id);
  const de = tipo => suyos.filter(i => (i.tipo || "tarea") === tipo);
  const materiales = [];
  de("material").forEach(m => enLista(m.texto).forEach(texto => materiales.push({ texto, hecha: !!m.hecha })));
  const externos = [];
  de("externo").forEach(m => enLista(m.texto).forEach(texto => externos.push({ texto, hecha: !!m.hecha })));
  const tareas = suyos.filter(i => !["material", "externo"].includes(i.tipo || "tarea"))
    .map(t => ({ texto: sinBarras(conSuCorte(String(t.texto || "").trim())), nota: sinBarras(String(t.nota || "").trim()), hecha: !!t.hecha }));
  const ficha = [
    ["HORARIO", dia.horario], ["PERSONAL", dia.personal], ["PERMISOS", dia.permisos],
    ["A TENER EN CUENTA", dia.consideraciones],
  ].map(([rotulo, v]) => [rotulo, sinBarras(String(v || "").trim())]).filter(([, v]) => v);
  return { tareas, materiales, externos, ficha, vacio: !tareas.length && !materiales.length && !externos.length && !ficha.length };
}

/**
 * Lo que quedó de la semana pasada, como se lee en la hoja: de qué día era,
 * qué había que hacer —el título y su nota— y por qué no se hizo.
 */
export function pendientesParaElPapel(quedaron = []) {
  const filas = quedaron.map(q => ({
    dia: diaCorto(q.fecha),
    titulo: String(q.texto || "").trim().replace(/:+$/, ""),
    nota: String(q.nota || "").trim(),
    motivo: String(q.motivo || "").trim(),
  }));
  const sinMotivo = filas.filter(f => !f.motivo).length;
  const n = filas.length;
  return {
    filas, sinMotivo,
    titulo: n === 1 ? "De la semana pasada quedó 1 actividad sin hacer" : `De la semana pasada quedaron ${n} actividades sin hacer`,
    // Que no digan por qué también es un dato, pero se dice una vez y no en cada renglón.
    aviso: !sinMotivo ? "" : sinMotivo === n
      ? (n === 1 ? "No dice por qué." : "Ninguna dice por qué.")
      : `${sinMotivo} de ${n} no ${sinMotivo === 1 ? "dice" : "dicen"} por qué.`,
  };
}

/** "9 actividades", al costado del título del día. */
export const cuantasActividades = n => (n === 1 ? "1 actividad" : `${n} actividades`);
