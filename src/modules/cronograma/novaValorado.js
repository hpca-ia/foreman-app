import { repartirEntre } from "./valorado";
import { leerMemoria, memoriaEnPalabras, recordar, patronDe } from "./memoriaNova";

// NOVA arma el cronograma valorado del presupuesto.
//
// LO QUE HACE QUE ESTO VALGA LA PENA no es ahorrar el tipeo: es que un rubro
// NO ES UN SOLO MOMENTO EN EL TIEMPO.
//
// Una ventanería importada se paga en tres: un anticipo que sale meses antes
// de que se vea nada, el saldo contra embarque, y la instalación al final. Un
// reparto parejo la pone en los meses en que se instala, y el valorado promete
// que la plata sale en octubre cuando en realidad salió en junio. El cliente
// se entera del anticipo cuando se lo piden, y ahí el cronograma deja de
// servir para lo único que servía: saber cuándo poner.
//
// Lo mismo con los contratos a destajo —30% de anticipo es la norma acá— y con
// todo lo que se fabrica a pedido: muebles, ascensores, equipos.
//
// Esa distinción no sale del presupuesto: hay que saber de obra para verla
// leyendo "Ventanería de aluminio y vidrio templado, provisión e instalación".
// Es exactamente lo que NOVA puede aportar y una fórmula no.
//
// SE PROPONE, NO SE APLICA. Lo que devuelve entra como borrador, con el motivo
// escrito en cada rubro especial, y se revisa antes de guardarlo. Un valorado
// es lo que el cliente usa para mover plata; nada que NOVA decida sola debería
// terminar en ese número sin que alguien lo mire.

const n = v => Number(v) || 0;

/** El presupuesto dicho corto, para que entre en una consulta. */
function resumir(rubros = []) {
  const capitulos = new Map();
  rubros.forEach(r => {
    const c = r.capitulo || "SIN CAPÍTULO";
    if (!capitulos.has(c)) capitulos.set(c, { nombre: c, monto: 0, cuantos: 0 });
    const g = capitulos.get(c);
    g.monto += n(r.total_base ?? r.monto);
    g.cuantos += 1;
  });
  return [...capitulos.values()];
}

/**
 * Pedirle a NOVA el reparto.
 *
 * Se le mandan los capítulos con su plata y los rubros con su nombre, y se le
 * piden dos cosas separadas: en qué meses cae cada capítulo —que es el 90% del
 * trabajo y sale de saber el orden de una obra— y cuáles rubros NO siguen a su
 * capítulo porque se pagan antes. Esa segunda lista es corta, y es la que
 * ningún cálculo puede sacar.
 */
export async function proponerValorado({ rubros = [], meses = 6, mesInicio, nombreObra = "" }) {
  if (!rubros.length) return { error: "No hay rubros en el presupuesto." };
  const capitulos = resumir(rubros);
  const total = capitulos.reduce((t, c) => t + c.monto, 0);

  // Los nombres alcanzan para reconocer lo importado; los montos, para que no
  // proponga un anticipo de doscientos dólares como si fuera un hito.
  const lista = rubros.slice(0, 400)
    .map(r => `${r.id}|${(r.capitulo || "").slice(0, 24)}|${String(r.descripcion || "").slice(0, 70)}|${Math.round(n(r.total_base ?? r.monto))}`)
    .join("\n");

  // Lo que la oficina ya corrigió en obras anteriores entra antes que nada:
  // es lo que hace que la segunda obra arranque sabiendo lo de la primera.
  const { memoria } = await leerMemoria("valorado");

  const sistema = `Eres NOVA y armas el cronograma valorado de una obra en Ecuador.
${memoriaEnPalabras(memoria)}

La obra "${nombreObra}" dura ${meses} meses, del mes 1 al mes ${meses}. El presupuesto total es ${Math.round(total)} dólares.

CAPÍTULOS (nombre · monto · cuántos rubros):
${capitulos.map(c => `${c.nombre} · ${Math.round(c.monto)} · ${c.cuantos}`).join("\n")}

RUBROS (id|capítulo|descripción|monto):
${lista}

Devuelves SOLO JSON, sin markdown:
{"capitulos":[{"nombre":"ESTRUCTURA","desde":1,"hasta":3,"porque":"..."}],
 "especiales":[{"id":123,"perfil":"importacion","porque":"...","pagos":[{"mes":2,"pct":50},{"mes":5,"pct":30},{"mes":7,"pct":20}]}]}

CAPÍTULOS: en qué meses cae cada uno, en el orden real de una obra —preliminares y
movimiento de tierra primero; estructura después; mampostería e instalaciones se
superponen; acabados al final; limpieza y entrega en el último mes—. Se pueden
superponer y casi siempre lo hacen. "desde" y "hasta" entre 1 y ${meses}.

ESPECIALES: los rubros cuya PLATA no sale cuando se ejecuta el trabajo. Son pocos
—entre tres y quince en una obra— y son los que de verdad importan:

· "importacion" · ventanería, ascensores, equipos, griferías o acabados de
  importación. Se paga un anticipo meses ANTES de que se vea nada, el saldo
  contra embarque o entrega, y lo último al instalar. Típico: 50/30/20.
· "fabricacion" · muebles a medida, carpintería, mesones, piezas metálicas.
  Anticipo para que arranquen, saldo al entregar. Típico: 50/50 con uno o dos
  meses entre medio.
· "contrato" · subcontratos grandes que piden anticipo. Típico: 30% al firmar y
  el resto contra avance.

Para cada especial, "pagos" son los meses y el porcentaje, y TIENEN que sumar 100.
El primer pago va suficientemente antes del mes de instalación como para que la
pieza llegue a tiempo: si la ventanería se instala en el mes 7, el anticipo va en
el 3 o el 4, no en el 6.

"porque" es una línea en español, para que quien revisa entienda la decisión.
No marques como especial lo que se ejecuta y se paga al mismo tiempo —hormigón,
mampostería, mano de obra, enlucidos—: eso sigue a su capítulo.`;

  try {
    const res = await fetch("/api/nova", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-5", max_tokens: 4000,
        system: sistema,
        messages: [{ role: "user", content: `Armá el cronograma valorado de ${meses} meses. Solo JSON.` }],
      }),
    });
    const data = await res.json();
    if (!res.ok || data.error) return { error: data.error?.message || "NOVA no pudo armarlo." };
    const txt = (data.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim();
    const p = JSON.parse(txt.match(/\{[\s\S]*\}/)[0]);
    return armar(p, rubros, meses, mesInicio);
  } catch (e) {
    return { error: "NOVA devolvió algo que no se entiende: " + e.message };
  }
}

/**
 * Convertir lo que dijo NOVA en pesos por mes, corrigiendo lo que venga mal.
 *
 * Nada de lo que devuelve se usa sin verificar. Un mes fuera de rango se
 * recorta, una fila que no cierra en 100 se ajusta en su último pago, y un
 * rubro que NOVA no mencionó cae en su capítulo. Confiar en que el JSON vino
 * perfecto es cómo un valorado termina sumando 97% del presupuesto y nadie
 * entiende por qué.
 */
/**
 * Guardar lo que quedó, para la obra que viene.
 *
 * Se recuerda lo que el humano DEJÓ, no lo que NOVA propuso: si lo corrigió,
 * vale la corrección; si lo aceptó tal cual, también es una confirmación y
 * también vale. Lo que no se puede es aprender de una propuesta que nadie
 * miró, porque entonces NOVA se estaría dando la razón sola.
 */
export async function aprenderDe(lineas = [], quien) {
  const especiales = lineas.filter(l => l.especial && l.pesos?.some(p => p > 0));
  for (const l of especiales) {
    const pagos = l.pesos.map((pct, i) => ({ i, pct })).filter(x => x.pct > 0);
    if (pagos.length < 2) continue;      // un pago solo no es una forma de pago
    const primero = pagos[0].i, ultimo = pagos[pagos.length - 1].i;
    await recordar({
      descripcion: l.rubro?.descripcion,
      perfil: l.perfil || "especial",
      // Relativos al primer pago: la forma vale en cualquier obra.
      pagos: pagos.map(x => ({ mes_relativo: x.i - primero, pct: x.pct })),
      anticipacion: ultimo - primero,
      nota: l.porque || null,
      quien,
    });
  }
  return especiales.length;
}

export { patronDe };

export function armar(p, rubros, meses, mesInicio) {
  const porCapitulo = new Map();
  (p.capitulos || []).forEach(c => {
    const desde = Math.max(1, Math.min(meses, Math.round(n(c.desde) || 1)));
    const hasta = Math.max(desde, Math.min(meses, Math.round(n(c.hasta) || desde)));
    porCapitulo.set(String(c.nombre || "").trim().toUpperCase(), { desde, hasta, porque: c.porque || "" });
  });

  const especiales = new Map();
  (p.especiales || []).forEach(e => {
    const pagos = (e.pagos || [])
      .map(x => ({ mes: Math.max(1, Math.min(meses, Math.round(n(x.mes) || 1))), pct: n(x.pct) }))
      .filter(x => x.pct > 0);
    if (!pagos.length) return;
    const suma = pagos.reduce((t, x) => t + x.pct, 0);
    // Lo que falte o sobre va al último pago: el saldo contra entrega es el que
    // se ajusta en la vida real, no el anticipo.
    pagos[pagos.length - 1].pct = Math.round((pagos[pagos.length - 1].pct + (100 - suma)) * 100) / 100;
    especiales.set(Number(e.id), { pagos, perfil: e.perfil || "especial", porque: e.porque || "" });
  });

  let sinCapitulo = 0;
  const lineas = rubros.map(r => {
    const esp = especiales.get(Number(r.id));
    if (esp) {
      const pesos = Array(meses).fill(0);
      esp.pagos.forEach(x => { pesos[x.mes - 1] += x.pct; });
      return { rubro: r, pesos, perfil: esp.perfil, porque: esp.porque, especial: true };
    }
    const cap = porCapitulo.get(String(r.capitulo || "").trim().toUpperCase());
    if (!cap) sinCapitulo += 1;
    const desde = cap ? cap.desde - 1 : 0;
    const hasta = cap ? cap.hasta - 1 : meses - 1;
    return { rubro: r, pesos: repartirEntre(meses, desde, hasta), porque: cap?.porque || "", especial: false };
  });

  return {
    lineas,
    capitulos: [...porCapitulo.entries()].map(([nombre, v]) => ({ nombre, ...v })),
    especiales: lineas.filter(l => l.especial).length,
    sinCapitulo,
    mesInicio, meses,
  };
}
