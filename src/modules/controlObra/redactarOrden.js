/**
 * NOVA REDACTA LA ORDEN DE CAMBIO. LOS NÚMEROS NO LOS ESCRIBE ELLA.
 *
 * Al armar una orden desde Diferencias, las decisiones ya están tomadas —qué
 * se le cobra al cliente, renglón por renglón— y los números ya están
 * calculados por el código: cantidades, precios del contrato, costo del
 * proveedor, honorarios. Lo que faltaba era el DOCUMENTO: la justificación
 * que lee el fiscalizador, la especificación de cada partida, los soportes.
 * Eso salía como una lista de viñetas con las notas de la pantalla, y lo
 * terminaba de escribir una persona, a mano, cada vez.
 *
 * Redactar es trabajo de modelo: convertir "más cantidad de la presupuestada,
 * 120 ML contra 80" en una oración que un cliente entienda y firme. Lo que NO
 * es trabajo de modelo es decidir ni calcular, y acá no lo hace: recibe los
 * hechos con sus cifras y escribe con ellos. Si escribe una cifra que no
 * está en los hechos, no pasa: se le dice cuál y vuelve a redactar, y si
 * insiste, el borrador sale con el aviso a la vista para que alguien lo mire
 * antes de enviar. Este papel se firma y se cobra con él.
 *
 * El módulo es puro: los hechos entran armados, el modelo entra como una
 * función, y todo se prueba sin hablar con nadie.
 */

const c2 = v => Math.round((Number(v) || 0) * 100) / 100;
const plata = v => `$${c2(v).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const cant = v => { const n = Number(v) || 0; return Number.isInteger(n) ? String(n) : String(c2(n)); };

const QUE_PASO = {
  nuevo: "no está en el presupuesto contractual: es un trabajo nuevo",
  mas_cantidad: "la cantidad necesaria supera la contratada",
  menos_cantidad: "la cantidad necesaria es menor que la contratada: se descuenta",
  subio_precio: "el precio del proveedor supera el precio unitario contratado",
  bajo_precio: "el precio del proveedor es menor que el contratado",
};

/**
 * Los hechos de cada partida, en el mismo orden en que entran a la orden:
 * primero lo que suma, después lo que se descuenta. Es el orden que usa
 * partidasParaOrden, y tiene que ser el mismo para que la especificación N
 * caiga en la partida N.
 */
export function insumosDeOrden({ analisis = {}, lineas = [], rubros = [], obra = {}, pct = 0 } = {}) {
  const van = lineas.filter(l => l.decision === "cobrar" && !l.orden_cambio_id);
  const ordenadas = [...van.filter(l => l.hallazgo !== "menos_cantidad"), ...van.filter(l => l.hallazgo === "menos_cantidad")];
  const partidas = ordenadas.map((l, i) => {
    const r = rubros.find(x => x.id === l.obra_rubro_id) || null;
    const cantidad = Number(l.cantidad) || 0;
    const costo = Number(l.monto) || 0;
    const puContrato = r && Number(r.cantidad) ? c2(Number(r.total_base) / Number(r.cantidad)) : null;
    return {
      n: i + 1,
      descripcion: String(l.descripcion || "").trim(),
      unidad: l.unidad || r?.unidad || "u",
      hallazgo: l.hallazgo || "nuevo",
      quePaso: QUE_PASO[l.hallazgo] || QUE_PASO.nuevo,
      cantidad,
      costoUnitario: cantidad ? c2(costo / cantidad) : null,
      costo: c2(costo),
      rubro: r ? { codigo: String(r.numero ?? r.codigo ?? ""), descripcion: r.descripcion || "", cantidad: Number(r.cantidad) || null, unidad: r.unidad || "", precioUnitario: puContrato } : null,
      papel: { texto: l.texto_papel || null, cantidad: l.cantidad_papel ?? null, monto: l.monto_papel ?? null },
      nota: String(l.nota || "").trim() || null,
    };
  });
  return {
    obra: { nombre: obra.nombre || "", cliente: obra.cliente_nombre || "" },
    proveedor: analisis.proveedor || "",
    archivo: analisis.archivo_nombre || "",
    fechaCotizacion: analisis.fecha_cotizacion || null,
    pct: Number(pct) || 0,
    partidas,
  };
}

/** Qué se le pide al modelo. Hechos primero, reglas después, formato al final. */
export function pedidoDeRedaccion(ins) {
  const hechos = ins.partidas.map(p => {
    const l = [`PARTIDA ${p.n}: ${p.descripcion} · ${cant(p.cantidad)} ${p.unidad}`];
    l.push(`  qué pasó: ${p.quePaso}`);
    if (p.rubro) {
      l.push(`  rubro contractual ${p.rubro.codigo ? p.rubro.codigo + " " : ""}"${p.rubro.descripcion}"`
        + (p.rubro.cantidad != null ? ` · contratado ${cant(p.rubro.cantidad)} ${p.rubro.unidad}` : "")
        + (p.rubro.precioUnitario != null ? ` a ${plata(p.rubro.precioUnitario)} la unidad` : ""));
    }
    if (p.costoUnitario != null) l.push(`  costo del proveedor: ${plata(p.costoUnitario)} la unidad · ${plata(p.costo)} en total`);
    if (p.papel.texto) l.push(`  en la proforma dice: "${p.papel.texto}"`);
    if (p.nota) l.push(`  nota de quien decidió: ${p.nota}`);
    return l.join("\n");
  }).join("\n\n");

  const cabeza = [
    `OBRA: ${ins.obra.nombre}${ins.obra.cliente ? ` · CLIENTE: ${ins.obra.cliente}` : ""}`,
    `PROVEEDOR QUE COTIZA: ${ins.proveedor || "(sin nombre)"}`,
    ins.archivo ? `DOCUMENTO: ${ins.archivo}` : null,
    ins.fechaCotizacion ? `FECHA DE LA COTIZACIÓN: ${ins.fechaCotizacion}` : null,
    ins.pct ? `HONORARIOS SOBRE LO NUEVO: ${ins.pct}%` : null,
  ].filter(Boolean).join("\n");

  return `${cabeza}\n\n${hechos}\n\nRedactá la orden de cambio con estos hechos y ninguno más.`;
}

export const SISTEMA_REDACCION = `Sos NOVA. Redactás ORDENES DE CAMBIO de obra para que las firme un cliente y las revise un fiscalizador que no estuvo en la obra.

Te paso los HECHOS: qué partidas entran, por qué no las cubre el contrato, y sus cifras. Escribís el documento con esos hechos y nada más.

QUÉ ESCRIBÍS, en este orden y con estos títulos exactos:

JUSTIFICACION:
Dos o tres párrafos. Primero qué se comparó y contra qué (la cotización del proveedor contra el presupuesto contractual). Después qué apareció: agrupá las partidas por lo que pasó —trabajos nuevos, más cantidad, precio— sin repetir la lista una por una. Al final qué se pide: la aprobación de la orden y, si las hay, los descuentos que corresponden.

SOPORTES:
Una o dos líneas: el documento del proveedor con su fecha, y los rubros del contrato que se citan.

PARTIDA 1: una o dos oraciones que expliquen esa partida sola: qué es, por qué no la cubre el contrato, y las cifras que lo muestran (lo contratado contra lo necesario, o el precio contratado contra el del proveedor).
PARTIDA 2: ...
(una línea PARTIDA N por cada partida que te pasé, en el mismo orden y con el mismo número)

CÓMO ESCRIBÍS:
· El castellano con el que se firma un papel: tercera persona, sin modismos, sin abreviaturas.
· Preciso y corto. Un fiscalizador lee veinte de estas.
· Las cifras, tal como te las pasé: mismas cantidades, mismos precios. Podés omitir una cifra; no podés cambiarla ni agregar otra.

QUÉ NO HACÉS NUNCA:
· No inventás razones, hechos, normas, fechas ni cantidades que no estén en los hechos.
· No calculás: no sumes totales, no apliques porcentajes, no conviertas unidades. Los totales los pone el sistema.
· No opinás sobre el precio del proveedor ni sobre el cliente.
Este documento se firma y se cobra con él: una cifra o un motivo inventado convierte un reclamo legítimo en uno falso, y lo descubre el que lo tiene que pagar.`;

/** De la respuesta del modelo a las tres partes. Sin JSON: títulos en líneas. */
export function textoDeRedaccion(txt = "") {
  const t = String(txt || "").replace(/\r/g, "").trim();
  const corte = (desde, hasta) => {
    const a = t.search(desde);
    if (a < 0) return "";
    const resto = t.slice(a).replace(desde, "");
    const b = hasta ? resto.search(hasta) : -1;
    return (b < 0 ? resto : resto.slice(0, b)).trim();
  };
  const justificacion = corte(/^\s*JUSTIFICACI[OÓ]N:\s*/im, /^\s*SOPORTES:|^\s*PARTIDA\s+\d+\s*:/im);
  const soportes = corte(/^\s*SOPORTES:\s*/im, /^\s*PARTIDA\s+\d+\s*:/im);
  const partidas = [];
  const re = /^\s*PARTIDA\s+(\d+)\s*:\s*([\s\S]*?)(?=^\s*PARTIDA\s+\d+\s*:|$(?![\s\S]))/gim;
  let m;
  while ((m = re.exec(t))) partidas.push({ n: Number(m[1]), especificacion: m[2].replace(/\s+/g, " ").trim() });
  return { justificacion, soportes, partidas };
}

/**
 * LA COMPUERTA: toda cifra del texto tiene que estar en los hechos.
 *
 * Se sacan los números del texto y se comparan contra los que entraron:
 * cantidades, precios, montos, el porcentaje, los códigos de rubro, los
 * números de partida, y los de la fecha. Los enteros chicos —"dos partidas",
 * "3 rubros", el día del mes— no se persiguen: no son plata.
 */
export function cifrasNoRespaldadas(texto = "", ins = { partidas: [] }) {
  const ok = new Set();
  const meter = v => { if (v == null || v === "") return; const n = Number(v); if (!isNaN(n)) ok.add(c2(n)); };
  for (const p of ins.partidas || []) {
    [p.cantidad, p.costoUnitario, p.costo, p.rubro?.cantidad, p.rubro?.precioUnitario, p.papel?.cantidad, p.papel?.monto, p.n]
      .forEach(meter);
    String(p.rubro?.codigo || "").split(/[^\d.]+/).forEach(x => { if (x) { meter(x); x.split(".").forEach(meter); } });
    // Cifras que ya venían escritas en la proforma o en la nota: las puede citar.
    [p.papel?.texto, p.nota].forEach(s => (String(s || "").match(/\d[\d.,]*/g) || []).forEach(x => meter(num(x))));
  }
  meter(ins.pct);
  String(ins.fechaCotizacion || "").split(/\D+/).forEach(meter);

  const vistas = new Set();
  const malas = [];
  for (const pegado of (String(texto).match(/\d[\d.,]*/g) || [])) {
    const crudo = pegado.replace(/[.,]+$/, "");   // el punto final de la oración no es parte de la cifra
    const n = num(crudo);
    if (n == null) continue;
    if (Number.isInteger(n) && n >= 0 && n <= 31) continue;    // conteos, días
    if (Number.isInteger(n) && n >= 1990 && n <= 2100) continue; // años
    if (ok.has(c2(n)) || vistas.has(crudo)) continue;
    vistas.add(crudo);
    malas.push(crudo);
  }
  return malas;
}

// "1.234,56" / "1,234.56" / "1200": el último separador es el decimal.
function num(s) {
  const limpio = String(s).replace(/[^0-9,.]/g, "").replace(/[.,]$/, "");
  if (!limpio) return null;
  const coma = limpio.lastIndexOf(","), punto = limpio.lastIndexOf(".");
  if (coma >= 0 && punto >= 0) {
    const dec = Math.max(coma, punto);
    return Number(limpio.slice(0, dec).replace(/[.,]/g, "") + "." + limpio.slice(dec + 1));
  }
  const sep = coma >= 0 ? "," : punto >= 0 ? "." : null;
  if (!sep) return Number(limpio);
  const partes = limpio.split(sep);
  if (partes.length > 2) return Number(partes.join(""));
  // Tres dígitos detrás de un separador solo: en una orden escrita en
  // castellano son miles ("1.200"), no milésimas.
  return partes[1].length === 3 ? Number(partes.join("")) : Number(partes.join("."));
}

/** El borrador de siempre, para cuando el modelo no contesta: nunca se bloquea la orden. */
export function borradorDeRespaldo(ins) {
  return {
    justificacion: `Al comparar ${ins.archivo || "la propuesta del proveedor"}${ins.proveedor ? ` (${ins.proveedor})` : ""} contra el presupuesto contractual aparecieron diferencias que el contrato no cubre:\n\n`
      + ins.partidas.map(p => `· ${p.descripcion}${p.nota ? ` — ${p.nota}` : ""}`).join("\n"),
    soportes: [ins.archivo ? `${ins.archivo}${ins.fechaCotizacion ? ` del ${ins.fechaCotizacion}` : ""}` : null,
      ...ins.partidas.filter(p => p.rubro?.codigo).map(p => `Rubro ${p.rubro.codigo} del presupuesto contractual`)]
      .filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join("\n"),
    partidas: ins.partidas.map(p => ({ n: p.n, especificacion: "" })),
    deRespaldo: true,
  };
}

/**
 * El lazo: pedir, comprobar las cifras, y si hay una que no está en los
 * hechos, pedir de nuevo diciendo cuál. Dos vueltas. Si a la segunda sigue,
 * el borrador sale igual con el aviso: lo mira una persona antes de enviar.
 *
 * @param pedir  (sistema, usuario) => texto. Habla con el modelo.
 */
export async function redactarOrden({ insumos, pedir, onPaso } = {}) {
  if (!insumos?.partidas?.length) return { borrador: borradorDeRespaldo(insumos || { partidas: [] }), avisos: [] };
  const usuario = pedidoDeRedaccion(insumos);
  let texto = "";
  let malas = [];
  for (let vuelta = 1; vuelta <= 2; vuelta++) {
    onPaso?.(vuelta === 1 ? "NOVA está redactando la orden…" : "NOVA escribió cifras que no están en los hechos · redactando de nuevo");
    const reclamo = vuelta === 1 ? "" : `\n\nEn la redacción anterior aparecieron cifras que NO están en los hechos: ${malas.join(", ")}. `
      + "No las uses. Redactá de nuevo usando solo las cifras que te pasé, tal como te las pasé.";
    try {
      texto = String(await pedir(SISTEMA_REDACCION, usuario + reclamo) || "").trim();
    } catch {
      texto = "";
    }
    if (!texto) break;
    malas = cifrasNoRespaldadas(texto, insumos);
    if (!malas.length) break;
  }
  if (!texto) return { borrador: borradorDeRespaldo(insumos), avisos: ["NOVA no contestó: la orden sale con el borrador de siempre. Completá la justificación a mano."] };

  const partes = textoDeRedaccion(texto);
  if (!partes.justificacion) return { borrador: borradorDeRespaldo(insumos), avisos: ["NOVA devolvió un texto sin la justificación: la orden sale con el borrador de siempre."] };

  // Cada partida con su especificación, en el orden de los hechos. La que el
  // modelo no escribió queda vacía, no inventada.
  const porN = new Map(partes.partidas.map(p => [p.n, p.especificacion]));
  const borrador = {
    justificacion: partes.justificacion,
    soportes: partes.soportes,
    partidas: insumos.partidas.map(p => ({ n: p.n, especificacion: porN.get(p.n) || "" })),
    deRespaldo: false,
  };
  const avisos = [];
  if (malas.length) avisos.push(`NOVA escribió cifras que no están en el análisis: ${malas.join(", ")}. Revisá la justificación antes de enviar la orden.`);
  const sinTexto = borrador.partidas.filter(p => !p.especificacion).length;
  if (sinTexto) avisos.push(`${sinTexto} ${sinTexto === 1 ? "partida quedó" : "partidas quedaron"} sin especificación: completala en la orden.`);
  return { borrador, avisos };
}
