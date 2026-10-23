// Qué cambió entre dos versiones de un presupuesto.
//
// La v2 se manda con una frase —"ajustamos algunos rubros"— y el cliente se
// pasa la tarde cruzando dos PDF de ciento ochenta renglones para encontrar
// los seis que se movieron. Lo que encuentra así no es lo que uno quería
// explicarle: encuentra el precio que subió, no por qué subió, y la
// conversación empieza mal.
//
// La cuenta se hace acá, sobre las dos listas, y es exacta. NOVA redacta
// DESPUÉS, con estos números delante: lo que se le pide es la prosa, no la
// aritmética —un modelo que suma ciento ochenta renglones se equivoca en uno y
// nadie lo nota hasta que el cliente lo nota—.

const n = v => Number(v) || 0;
const r2 = v => Math.round(v * 100) / 100;
const texto = v => String(v ?? "").trim();
const SIN_ACENTO = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Con qué se reconoce al mismo rubro en las dos versiones. */
export function llaveDe(item) {
  if (item?.rubro_id) return `r${item.rubro_id}`;
  return SIN_ACENTO(texto(item?.descripcion).toLowerCase()).replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Los cambios, rubro por rubro.
 *
 * UN RUBRO QUE NO CAMBIÓ NO ES UN CAMBIO. La lista tiene que poder leerse de
 * una sentada: si trae los ciento ochenta renglones iguales, no se lee, y
 * entonces da igual que esté.
 */
export function compararVersiones(antes = [], ahora = []) {
  const deAntes = new Map();
  for (const i of antes) {
    const k = llaveDe(i);
    if (k) deAntes.set(k, i);
  }
  const vistos = new Set();

  const nuevos = [];
  const cambiados = [];
  for (const b of ahora) {
    const k = llaveDe(b);
    const a = k ? deAntes.get(k) : null;
    if (!a) { nuevos.push(ficha(b, null)); continue; }
    vistos.add(k);
    const campos = [];
    if (r2(n(a.cantidad)) !== r2(n(b.cantidad))) campos.push({ campo: "cantidad", de: r2(n(a.cantidad)), a: r2(n(b.cantidad)) });
    if (r2(n(a.precio_unitario)) !== r2(n(b.precio_unitario))) campos.push({ campo: "precio", de: r2(n(a.precio_unitario)), a: r2(n(b.precio_unitario)) });
    if (texto(a.unidad) !== texto(b.unidad)) campos.push({ campo: "unidad", de: texto(a.unidad), a: texto(b.unidad) });
    if (texto(a.capitulo) !== texto(b.capitulo)) campos.push({ campo: "capítulo", de: texto(a.capitulo), a: texto(b.capitulo) });
    // La descripción cambia a cada rato por una coma. Solo se denuncia cuando
    // de verdad dice otra cosa.
    if (llaveDe({ descripcion: a.descripcion }) !== llaveDe({ descripcion: b.descripcion })
      && texto(a.descripcion) !== texto(b.descripcion) && a.rubro_id) {
      campos.push({ campo: "descripción", de: texto(a.descripcion), a: texto(b.descripcion) });
    }
    if (campos.length) cambiados.push({ ...ficha(b, a), campos });
  }

  const quitados = antes.filter(a => {
    const k = llaveDe(a);
    return k && !vistos.has(k);
  }).map(a => ficha(a, null, true));

  const sumar = (xs, campo) => r2(xs.reduce((t, x) => t + n(x[campo]), 0));
  const totalAntes = sumar(antes.map(i => ({ t: totalDe(i) })), "t");
  const totalAhora = sumar(ahora.map(i => ({ t: totalDe(i) })), "t");

  return {
    nuevos, quitados, cambiados,
    // El efecto en plata de cada grupo, que es lo que primero se pregunta.
    montoNuevos: sumar(nuevos, "total"),
    montoQuitados: sumar(quitados, "total"),
    montoCambiados: r2(cambiados.reduce((t, x) => t + n(x.delta), 0)),
    totalAntes, totalAhora,
    diferencia: r2(totalAhora - totalAntes),
    // Un porcentaje sobre cero no existe: no se inventa un 100%.
    porcentaje: totalAntes ? r2(((totalAhora - totalAntes) / totalAntes) * 100) : null,
    sinCambios: !nuevos.length && !quitados.length && !cambiados.length,
  };
}

const totalDe = i => (n(i?.total) || n(i?.cantidad) * n(i?.precio_unitario));

function ficha(item, antes, esQuitado = false) {
  const total = r2(totalDe(item));
  return {
    id: item?.id ?? null,
    capitulo: texto(item?.capitulo),
    descripcion: texto(item?.descripcion),
    unidad: texto(item?.unidad),
    cantidad: r2(n(item?.cantidad)),
    precio_unitario: r2(n(item?.precio_unitario)),
    total: esQuitado ? -total : total,
    // Cuánto mueve este rubro contra la versión anterior.
    delta: antes ? r2(total - r2(totalDe(antes))) : (esQuitado ? -total : total),
  };
}

/**
 * Los cambios en texto plano, para dárselos a NOVA o para usarlos tal cual.
 *
 * Si NOVA no contesta, esto ya es una memoria de cambios: fea pero correcta.
 * Una carta que no sale porque el modelo no respondió es una carta que se
 * termina escribiendo a mano a las once de la noche.
 */
export function renglonesDeCambios(dif, plata = v => `$${(Number(v) || 0).toFixed(2)}`) {
  const l = [];
  const signo = v => (v >= 0 ? "+" : "−");
  if (dif.nuevos.length) {
    l.push("SE AGREGÓ");
    dif.nuevos.forEach(x => l.push(`- ${x.descripcion} — ${x.cantidad} ${x.unidad} a ${plata(x.precio_unitario)} — ${plata(x.total)} más`));
    l.push("");
  }
  if (dif.quitados.length) {
    l.push("SE QUITÓ");
    dif.quitados.forEach(x => l.push(`- ${x.descripcion} — ${x.cantidad} ${x.unidad} a ${plata(x.precio_unitario)} — ${plata(Math.abs(x.total))} menos`));
    l.push("");
  }
  if (dif.cambiados.length) {
    l.push("CAMBIÓ DE PRECIO O CANTIDAD");
    dif.cambiados.forEach(x => {
      const qué = x.campos.map(c => `${c.campo}: de ${c.de} a ${c.a}`).join("; ");
      l.push(`- ${x.descripcion} — ${qué} — ${plata(Math.abs(x.delta))} ${x.delta >= 0 ? "más" : "menos"}`);
    });
    l.push("");
  }
  l.push(`TOTAL: de ${plata(dif.totalAntes)} a ${plata(dif.totalAhora)} — ${signo(dif.diferencia)}${plata(Math.abs(dif.diferencia))}${dif.porcentaje != null ? ` (${signo(dif.porcentaje)}${Math.abs(dif.porcentaje).toFixed(1)}%)` : ""}`);
  return l.join("\n");
}

export const PROMPT_MEMORIA = [
  "Sos el jefe de proyectos de una constructora en Quito y le escribís al cliente.",
  "Con la lista de cambios entre dos versiones del presupuesto, armá una MEMORIA DE CAMBIOS",
  "que vaya adelante del presupuesto nuevo.",
  "",
  "QUIEN LA LEE NO SABE LEER UN PRESUPUESTO. Es una lista, no una carta: tiene que poder",
  "recorrerse con el dedo y entenderse sin cruzar dos PDF.",
  "",
  "Formato exacto, en texto plano y sin markdown:",
  "- Una sola frase de arranque: qué versión es y contra cuál se compara.",
  "- Después, estos títulos EN MAYÚSCULAS, y solo los que tengan contenido:",
  "  SE AGREGÓ / SE QUITÓ / CAMBIÓ DE PRECIO / CAMBIÓ DE CANTIDAD / OTROS CAMBIOS",
  "- Debajo de cada título, una línea por cambio que empiece con guión y espacio:",
  "  - Nombre del rubro — qué cambió, en palabras — monto",
  "  Ejemplos: `- Locker metálico 16 espacios — rubro nuevo, pedido del cliente — $450,00`",
  "            `- Tabique de yeso — el precio pasa de $50,00 a $60,00 el m² — $100,00 más`",
  "- Al final, una línea sola que empiece con TOTAL: y diga la diferencia en plata y en porcentaje.",
  "",
  "Reglas:",
  "- Usá EXACTAMENTE los números que te paso. No sumes, no redondees, no estimes.",
  "- Una línea por cambio. Nada de párrafos, nada de viñetas anidadas, nada de negritas.",
  "- Si seis rubros del mismo capítulo subieron por lo mismo, poné una línea que lo diga",
  "  y el monto sumado que te paso, no seis líneas iguales.",
  "- Explicá en palabras lo que el número significa: 'se saca', 'se agrega', 'sube', 'baja'.",
  "- Si la lista no dice POR QUÉ cambió algo, no lo inventes: decí qué cambió y nada más.",
  "- Nombrá los rubros como están escritos, pero podés acortarlos si son larguísimos.",
  "- Español de Ecuador, de usted, sin adjetivos de venta y sin disculpas.",
].join("\n");
