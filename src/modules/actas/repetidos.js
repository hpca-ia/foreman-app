// LA MISMA PERSONA, TRES VECES, DICIENDO COSAS DISTINTAS.
//
// La lista de asistentes se arma de tres lados: los convocados que entran
// solos al abrir el acta, los que alguien agrega a mano durante la reunión, y
// el que llega tarde y se suma. Ninguno de los tres mira si esa persona ya
// estaba, así que termina repetida — y repetida con valores que se contradicen:
// en el acta 3 de Diners, Lizeth figura tres veces, dos marcadas como que NO
// vino y una como que sí.
//
// Eso no es un detalle de prolijidad. Un acta es la prueba de quién estuvo: si
// dice las dos cosas, no prueba ninguna. Y el conteo —"16 de 20 vinieron"—
// cuenta filas, así que miente con la misma cara de siempre.
//
// Dos problemas distintos y se avisan distinto:
//
//   · MISMA PERSONA REPETIDA (mismo nombre): se junta en una fila. Vino si
//     vino en alguna, recibe si recibe en alguna, y se queda el nombre más
//     completo.
//   · DOS PERSONAS CON EL MISMO CORREO: eso NO se junta —son dos personas— pero
//     hay que decirlo, porque el acta sale de a un correo por dirección y a esa
//     casilla le va a llegar una sola copia, con el enlace de conformidad de
//     una sola de las dos.
//
// Sin base de datos: se le pasa la lista de asistentes.

/** Sin tildes, sin mayúsculas y sin espacios de más: así se compara un nombre. */
export const comoSeLlama = n => String(n || "")
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/\s+/g, " ").trim();

const correoDe = a => String(a?.email || "").trim().toLowerCase();

/**
 * Los grupos de filas que son la misma persona.
 *
 * Se compara por NOMBRE, no por correo: dos personas pueden compartir una
 * casilla —pasa con los contratistas chicos, donde el correo es del dueño— y
 * juntarlas borraría a una de las dos del acta.
 *
 * "Lizeth" y "Lizeth De la Cruz" son la misma: se toma por repetida cuando un
 * nombre es el comienzo del otro y los dos tienen el mismo correo. Sin el
 * correo igual no se arriesga — dos "Christian" de empresas distintas existen.
 */
export function agrupar(asistentes = []) {
  const vivos = asistentes.filter(a => comoSeLlama(a.nombre));
  const grupos = [];
  for (const a of vivos) {
    const nom = comoSeLlama(a.nombre), mail = correoDe(a);
    const suyo = grupos.find(g => g.some(b => {
      const n2 = comoSeLlama(b.nombre), m2 = correoDe(b);
      if (n2 === nom) return !mail || !m2 || mail === m2;
      // Un nombre que es el comienzo del otro solo cuenta con el mismo correo.
      return !!mail && mail === m2 && (n2.startsWith(`${nom} `) || nom.startsWith(`${n2} `));
    }));
    if (suyo) suyo.push(a); else grupos.push([a]);
  }
  return grupos;
}

/** Los grupos que tienen más de una fila: eso es una persona repetida. */
export const repetidos = (asistentes = []) => agrupar(asistentes).filter(g => g.length > 1);

/**
 * Cómo queda la fila que se conserva, y cuáles se van.
 *
 * SE QUEDA LO QUE AFIRMA. Si en alguna fila vino, vino: una fila que dice que
 * no vino es casi siempre la del convocado que entró solo y nadie tildó.
 * Lo mismo con el correo, la empresa y el cargo: gana el dato que existe sobre
 * el vacío, porque el vacío no es una afirmación.
 */
export function comoQuedan(grupo = []) {
  const masLargo = (a, b) => (String(b || "").trim().length > String(a || "").trim().length ? b : a);
  const queda = grupo.reduce((mejor, a) => ({
    ...mejor,
    nombre: masLargo(mejor.nombre, a.nombre),
    empresa: masLargo(mejor.empresa, a.empresa),
    cargo: masLargo(mejor.cargo, a.cargo),
    email: masLargo(mejor.email, a.email),
    asistio: !!mejor.asistio || !!a.asistio,
    recibe: !!mejor.recibe || !!a.recibe,
  }), { ...grupo[0] });
  return { queda, sobran: grupo.filter(a => a.id !== queda.id) };
}

/** Dos personas distintas en la misma casilla: no se juntan, se avisan. */
export function correosCompartidos(asistentes = []) {
  // Se mira POR PERSONA, no por fila: la misma persona repetida tres veces usa
  // su correo tres veces y eso no es una casilla compartida, es lo otro —y lo
  // dice `repetidos`, que es donde se arregla.
  const por = new Map();
  agrupar(asistentes).forEach(grupo => {
    const mail = grupo.map(correoDe).find(Boolean);
    if (!mail) return;
    if (!por.has(mail)) por.set(mail, []);
    por.get(mail).push(grupo[0]);
  });
  return [...por.entries()]
    .filter(([, gente]) => gente.length > 1)
    .map(([email, gente]) => ({ email, gente }));
}

/**
 * El conteo honesto: personas, no filas.
 *
 * El de la pantalla contaba renglones, así que una persona repetida tres veces
 * sumaba tres a los asistentes y tres a los que reciben. El acta sale de a un
 * correo por dirección —eso ya estaba bien—, así que "19 reciben" eran 13.
 */
export function cuantosDeVerdad(asistentes = []) {
  const grupos = agrupar(asistentes);
  const persona = g => ({
    asistio: g.some(a => a.asistio),
    recibe: g.some(a => a.recibe),
    email: g.map(correoDe).find(Boolean) || "",
  });
  const gente = grupos.map(persona);
  // LAS COPIAS SE CUENTAN POR DIRECCIÓN, LAS PERSONAS POR PERSONA. El acta sale
  // de a un correo por dirección, así que dos personas que comparten casilla
  // son dos personas y una sola copia — y la copia lleva el enlace de
  // conformidad de una sola de las dos, que es lo que hay que saber antes de
  // mandarla.
  const copias = new Set(gente.filter(x => x.recibe && x.email).map(x => x.email));
  return {
    personas: gente.length,
    vinieron: gente.filter(x => x.asistio).length,
    reciben: copias.size,
    // Marcado para recibir y sin correo no es que le llega: es que no le llega.
    sinCorreo: gente.filter(x => x.recibe && !x.email).length,
    filas: grupos.reduce((t, g) => t + g.length, 0),
  };
}
