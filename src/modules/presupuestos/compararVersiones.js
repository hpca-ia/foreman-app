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
  l.push(`TOTAL ANTES: ${plata(dif.totalAntes)}`);
  l.push(`TOTAL AHORA: ${plata(dif.totalAhora)}`);
  l.push(`DIFERENCIA: ${dif.diferencia >= 0 ? "+" : "−"}${plata(Math.abs(dif.diferencia))}${dif.porcentaje != null ? ` (${dif.porcentaje >= 0 ? "+" : "−"}${Math.abs(dif.porcentaje).toFixed(1)}%)` : ""}`);
  if (dif.nuevos.length) {
    l.push("", `RUBROS NUEVOS (${dif.nuevos.length}), suman ${plata(dif.montoNuevos)}:`);
    dif.nuevos.forEach(x => l.push(`+ ${x.descripcion} · ${x.cantidad} ${x.unidad} × ${plata(x.precio_unitario)} = ${plata(x.total)}${x.capitulo ? ` · ${x.capitulo}` : ""}`));
  }
  if (dif.quitados.length) {
    l.push("", `RUBROS QUE YA NO ESTÁN (${dif.quitados.length}), restan ${plata(Math.abs(dif.montoQuitados))}:`);
    dif.quitados.forEach(x => l.push(`− ${x.descripcion} · ${x.cantidad} ${x.unidad} × ${plata(x.precio_unitario)}${x.capitulo ? ` · ${x.capitulo}` : ""}`));
  }
  if (dif.cambiados.length) {
    l.push("", `RUBROS MODIFICADOS (${dif.cambiados.length}):`);
    dif.cambiados.forEach(x => {
      const qué = x.campos.map(c => `${c.campo}: ${c.de} → ${c.a}`).join("; ");
      l.push(`~ ${x.descripcion} · ${qué} · efecto ${x.delta >= 0 ? "+" : "−"}${plata(Math.abs(x.delta))}`);
    });
  }
  return l.join("\n");
}

/**
 * Lo que se le pide a NOVA: la prosa, no la aritmética.
 *
 * Los números van calculados en el texto que recibe. Un modelo que suma ciento
 * ochenta renglones se equivoca en uno y nadie lo nota hasta que lo nota el
 * cliente —y entonces lo que se discute ya no es el presupuesto, es si los
 * números de uno son confiables—.
 */
export const PROMPT_MEMORIA = [
  "Sos el jefe de proyectos de una constructora en Quito y le escribís al cliente.",
  "Con la lista de cambios entre dos versiones del presupuesto, redactá una MEMORIA DE CAMBIOS corta",
  "que vaya adelante del presupuesto nuevo.",
  "",
  "Reglas:",
  "- Entre 3 y 5 párrafos. Sin encabezados, sin viñetas, sin markdown, sin saludo ni firma.",
  "- Primero qué cambió y por qué se entiende que cambió; el monto, después.",
  "- Usá EXACTAMENTE los números que te paso. No sumes, no redondees, no estimes.",
  "- Si algo no se puede saber por la lista —el motivo de un cambio—, no lo inventes:",
  "  decí qué cambió sin atribuirle una causa.",
  "- Agrupá: si subieron seis rubros de un mismo capítulo, decilo una vez.",
  "- Nombrá los rubros como están escritos.",
  "- Tono profesional y directo, sin disculpas y sin adjetivos de venta.",
  "- Español de Ecuador, de usted.",
].join("\n");
