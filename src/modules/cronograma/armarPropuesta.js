import { calcular, calendario } from "./cpm.js";   // con extensión: webpack la resuelve igual y Node la necesita

// Armar la propuesta de cronograma: de lo que devuelve NOVA a algo que el
// motor pueda fechar.
//
// Vive aparte de `novaCronograma.js` porque acá NO se habla con nadie: no hay
// base de datos ni llamadas a un modelo, solo la traducción y las reglas que
// la hacen confiable. Eso lo vuelve probable —y todo lo de acá es lo que más
// se rompió: las etapas que salían el mismo día, las actividades inventadas,
// los pesos que no cerraban en 100.

export const n = v => Number(v) || 0;

// El sufijo que distingue las barras de un mismo rubro. Corto a propósito: el
// nombre de la agrupación ya ocupa su lugar y es el que tiene que leerse.
// Si lo que NOVA llamó a una parte es una de las etapas de compra, se
// reconoce aunque venga con tilde o en mayúsculas; si es otra cosa —"montaje",
// "refuerzos", "pintura base"— es un trabajo de obra y va como ejecución, con
// su nombre tal cual.
export const SIN_TILDE = t => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
export const etapaDe = etiqueta => {
  const t = SIN_TILDE(etiqueta);
  return ["anticipo", "fabricacion", "entrega", "instalacion", "ejecucion"].includes(t) ? t : "ejecucion";
};

export const ETAPA_CORTA = {
  anticipo: "anticipo", fabricacion: "fabricación", entrega: "entrega",
  instalacion: "instalación", ejecucion: "",
};

/**
 * De la forma corta de NOVA a la forma que usa el resto.
 *
 * CADA PARTE LLEVA SU PROPIA REFERENCIA, y acá estaba el error más caro de
 * todos. Antes todas las partes de una agrupación heredaban el mismo `ref` —el
 * id de la agrupación—, con dos consecuencias:
 *
 *   · el CPM recibía tres actividades con el MISMO id, así que no podía
 *     distinguirlas ni fecharlas por separado;
 *   · y no había forma de encadenarlas entre sí, porque una dependencia de
 *     "ref 13 a ref 13" no dice nada.
 *
 * O sea: una ventanería partida en anticipo, fabricación e instalación salía
 * con las tres barras arrancando el mismo día. Justo lo contrario de para qué
 * se parte —el anticipo va meses antes de la instalación—, y encima el prompt
 * prometía que iban encadenadas, cosa que ningún código hacía.
 *
 * Ahora cada parte tiene ref propia, SE ENCADENAN en el orden en que vinieron,
 * y las dependencias que NOVA escribió contra la agrupación se traducen:
 * "después de la ventanería" apunta a su ÚLTIMA parte —la agrupación termina
 * cuando termina lo último— y "antes de" apunta a la PRIMERA.
 */
export function expandir(p) {
  let proxima = 1;
  // Lo que ya tiene ref propia no se toca: la forma larga llega así.
  (p.actividades || []).forEach(a => {
    if (a.ref != null) proxima = Math.max(proxima, Number(a.ref) + 1);
  });

  // De cada agrupación: por dónde se entra y por dónde se sale.
  const puerta = new Map();
  const encadenadas = [];

  const acts = (p.actividades || []).map(a => {
    // La forma larga, tal cual.
    if (a.agrupacion_id != null || a.nombre != null) {
      const id = Number(a.agrupacion_id);
      const ref = a.ref != null ? Number(a.ref) : proxima++;
      if (!puerta.has(id)) puerta.set(id, { primera: ref, ultima: ref });
      else puerta.get(id).ultima = ref;
      return { ...a, ref };
    }
    const id = Number(a.id);
    const incluye = Array.isArray(a.incluye)
      ? a.incluye.map(x => String(x || "").trim().slice(0, 80)).filter(Boolean).slice(0, 8)
      : [];
    const base = { agrupacion_id: id, nombre: "", porque: a.porque || "", incluye };
    const partes = Array.isArray(a.partes) ? a.partes : a.etapas;

    if (!Array.isArray(partes) || partes.length < 2) {
      const ref = proxima++;
      puerta.set(id, { primera: ref, ultima: ref });
      return { ...base, ref, duracion: n(a.dias) || 10, etapa: "ejecucion", peso: 100 };
    }

    let anterior = null;
    const salida = partes.map(e => {
      const [etiqueta, dias, peso] = Array.isArray(e) ? e : [e.etapa, e.dias, e.peso];
      const ref = proxima++;
      if (anterior != null) {
        // En fila india, que es lo que el pedido promete: no se fabrica antes
        // de anticipar ni se instala antes de que llegue.
        encadenadas.push({ de: anterior, a: ref, retardo: 0, tipo: "FC" });
      }
      anterior = ref;
      if (!puerta.has(id)) puerta.set(id, { primera: ref, ultima: ref });
      else puerta.get(id).ultima = ref;
      // El nombre de la parte se CONSERVA. Antes se lo trataba solo como
      // etapa, y como "montaje de estructura" no está entre las cinco etapas
      // de compra, caía en "ejecucion" y el nombre se perdía: las tres partes
      // terminaban llamándose igual que el capítulo y el detector de
      // repetidas las fundía en una. O sea que NOVA podía partir un capítulo
      // en trabajos y el resultado era un capítulo sin partir.
      return {
        ...base, ref, duracion: n(dias) || 5, peso: n(peso),
        etapa: etapaDe(etiqueta), parte: String(etiqueta || "").trim(),
      };
    });
    return salida;
  }).flat();

  // Las dependencias de NOVA hablan de AGRUPACIONES —sus ids— porque es lo
  // único que se le pasó. Se traducen a las puertas de cada una.
  const deps = (p.dependencias || []).map(d => {
    if (!Array.isArray(d)) return d;
    const [de, a, retardo, tipo] = d;
    const salida = puerta.get(Number(de));
    const entrada = puerta.get(Number(a));
    return {
      de: salida ? salida.ultima : Number(de),
      a: entrada ? entrada.primera : Number(a),
      retardo: n(retardo), tipo: tipo || "FC",
    };
  });

  // Las de las partes van primero: son estructura de la agrupación, no una
  // opinión sobre el orden de la obra, y no se pueden perder al desarmar
  // ciclos.
  return { ...p, actividades: acts, dependencias: [...encadenadas, ...deps] };
}

export function ordenar(entrada, agrupaciones, cal) {
  const p = expandir(entrada);
  const porAgrup = new Map(agrupaciones.map(a => [Number(a.id), a]));

  // EL CRONOGRAMA ES EL ESPEJO DE LAS AGRUPACIONES, y eso no se le pide a
  // NOVA: se hace cumplir acá.
  //
  // Un prompt es una instrucción, no una garantía. Si NOVA inventa una
  // actividad, renombra una agrupación o se olvida de otra, el cronograma deja
  // de poder compararse con el control de obra —que es contra lo que se
  // planilla y se factura— y los dos documentos se vuelven inútiles a la vez.
  //
  // Así que lo que vuelve se usa para lo que NOVA sí sabe —el orden, la
  // duración, qué traba a qué, qué conviene partir en etapas— y la LISTA la
  // pone el control de obra:
  //
  //   · lo que no apunta a una agrupación de verdad, se tira;
  //   · el nombre lo pone la agrupación, no NOVA;
  //   · la agrupación que NOVA se olvidó, entra igual.
  const inventadas = (p.actividades || []).filter(a => !porAgrup.has(Number(a.agrupacion_id))).length;

  let actividades = (p.actividades || [])
    .filter(a => porAgrup.has(Number(a.agrupacion_id)))
    .map((a, i) => {
      const g = porAgrup.get(Number(a.agrupacion_id));
      const etapa = ["anticipo", "fabricacion", "entrega", "instalacion", "ejecucion"].includes(a.etapa) ? a.etapa : "ejecucion";
      const sufijo = (a.parte && SIN_TILDE(a.parte) !== SIN_TILDE(g.nombre))
        ? a.parte
        : (etapa === "ejecucion" ? "" : ETAPA_CORTA[etapa]);
      return {
        ref: Number(a.ref) || i + 1,
        // El nombre es el de la agrupación. La etapa se agrega como sufijo
        // para distinguir las barras de un mismo rubro, y nada más.
        // El nombre del capítulo, y detrás cómo se llama esta parte: la
        // etiqueta que puso NOVA si la hay —"montaje de estructura"— o el
        // nombre de la etapa de compra. Sin parte, el capítulo a secas.
        nombre: (sufijo ? `${g.nombre} · ${sufijo}` : g.nombre).slice(0, 120),
        duracion: Math.max(1, Math.round(n(a.duracion)) || 5),
        etapa,
        peso: n(a.peso),
        agrupacion_id: Number(a.agrupacion_id),
        porque: a.porque || "",
        // Lo que se hace adentro y no es rubro. Se conserva tal cual: es lo
        // que después arranca el plan semanal sin que nadie lo escriba.
        incluye: Array.isArray(a.incluye) ? a.incluye : [],
        orden: i,
      };
    });

  // UNA ETAPA DE CADA CLASE POR RUBRO.
  //
  // Visto en una obra de verdad: "Gastos generales" partido en seis —anticipo,
  // fabricación, entrega y TRES "instalación"—, repartiendo 35% entre todas.
  // Tres barras con el mismo nombre no quieren decir nada, y los gastos
  // generales no se anticipan ni se fabrican ni se instalan.
  //
  // La repetida se funde con la primera: se suman sus pesos y se queda la
  // duración más larga. Fundir y no tirar, porque tirar perdería plata del
  // rubro y el valorado dejaría de dar el presupuesto.
  const unica = new Map();
  const fundidas = [];
  actividades.forEach(a => {
    // Con el nombre: un rubro puede tener varias barras de "ejecución" —las
    // eléctricas entran tres veces a la obra— y esas no son repetidas. Lo que
    // no existe es la misma cosa dicha dos veces igual.
    const k = `${a.agrupacion_id}·${a.etapa}·${(a.nombre || "").trim()}`;
    const ya = unica.get(k);
    if (!ya) { unica.set(k, a); return; }
    ya.peso = Math.round((n(ya.peso) + n(a.peso)) * 100) / 100;
    ya.duracion = Math.max(ya.duracion, a.duracion);
    fundidas.push(a.ref);
  });
  if (fundidas.length) {
    const vivas = new Set([...unica.values()].map(a => a.ref));
    actividades = actividades.filter(a => vivas.has(a.ref));
    // Las dependencias de las que se fueron se reapuntan a la que quedó, que
    // es la misma cosa con otro nombre.
    const destino = new Map();
    fundidas.forEach(ref => { destino.set(ref, null); });
    p.dependencias = (p.dependencias || []).filter(d => !destino.has(Number(d.de)) && !destino.has(Number(d.a)));
  }

  // Las que faltan, en el orden del control de obra. Con una duración que
  // alguien va a tener que corregir, y es correcto que se note: mejor una
  // barra fea y presente que un rubro que desapareció del plan.
  let proximaRef = Math.max(0, ...actividades.map(a => a.ref)) + 1;
  const puestas = new Set(actividades.map(a => a.agrupacion_id));
  const olvidadas = agrupaciones.filter(g => !puestas.has(Number(g.id)));
  olvidadas.forEach(g => {
    actividades.push({
      ref: proximaRef++, nombre: String(g.nombre).slice(0, 120),
      duracion: 10, etapa: "ejecucion", peso: 100,
      agrupacion_id: Number(g.id),
      porque: "NOVA no la puso en su propuesta; entró del control de obra con una duración a revisar.",
      orden: actividades.length,
    });
  });

  // En el orden del control de obra, que es el que la oficina ya decidió. Lo
  // que viene después —moverlas al orden real de trabajo— se hace en el
  // cronograma, a mano, que es donde se sabe.
  const ordenDe = new Map(agrupaciones.map((g, i) => [Number(g.id), g.orden ?? i]));
  actividades.sort((a, b) => {
    const d = (ordenDe.get(a.agrupacion_id) ?? 0) - (ordenDe.get(b.agrupacion_id) ?? 0);
    return d !== 0 ? d : a.orden - b.orden;
  });
  actividades.forEach((a, i) => { a.orden = i; });

  const refs = new Set(actividades.map(a => a.ref));

  // Los pesos de cada agrupación tienen que cerrar en 100: si no, la plata de
  // esa agrupación entra de menos o de más al valorado y el total deja de dar
  // el presupuesto. Lo que falte o sobre se ajusta en la etapa más grande, que
  // es la que menos se nota y la que de verdad absorbe el resto en obra.
  const etapasDe = new Map();
  actividades.forEach(a => {
    if (!a.agrupacion_id) return;
    if (!etapasDe.has(a.agrupacion_id)) etapasDe.set(a.agrupacion_id, []);
    etapasDe.get(a.agrupacion_id).push(a);
  });
  etapasDe.forEach(grupo => {
    const suma = grupo.reduce((t, x) => t + n(x.peso), 0);
    if (!suma) { grupo.forEach(x => { x.peso = Math.round((100 / grupo.length) * 100) / 100; }); return; }
    if (Math.abs(suma - 100) < 0.01) return;
    const mayor = grupo.reduce((a, b) => (n(a.peso) >= n(b.peso) ? a : b));
    mayor.peso = Math.round((n(mayor.peso) + (100 - suma)) * 100) / 100;
  });
  actividades.filter(a => !a.agrupacion_id).forEach(a => { a.peso = n(a.peso) || 0; });

  let dependencias = (p.dependencias || [])
    .filter(d => refs.has(Number(d.de)) && refs.has(Number(d.a)) && Number(d.de) !== Number(d.a))
    .map(d => ({
      de: Number(d.de), a: Number(d.a),
      tipo: ["FC", "CC", "FF"].includes(d.tipo) ? d.tipo : "FC",
      // El retardo negativo es el traslape y antes se aplastaba a cero, que
      // era tirar justo lo que hace que una obra entre en su plazo. El tope de
      // 365 es contra un número absurdo, no contra el signo.
      retardo: Math.max(-365, Math.min(365, Math.round(n(d.retardo)))),
      porque: d.porque || "",
    }));

  // Se prueban contra el cálculo de verdad: si quedan círculos, se van las
  // dependencias que los cierran, una por una, hasta que todo tenga fecha.
  let intento = 0;
  while (intento++ < 30) {
    const plan = calcular({
      actividades: actividades.map(a => ({ id: a.ref, duracion: a.duracion })),
      // Con el tipo puesto: sin él, la duración que se le muestra a la
      // persona se calculaba tratando todo como fin→comienzo, y entonces el
      // número de días de la propuesta no era el que iba a salir al guardarla.
      dependencias: dependencias.map(d => ({ actividad_id: d.a, depende_de_id: d.de, tipo: d.tipo, retardo: d.retardo })),
      inicio: new Date(), cal,
    });
    if (!plan.ciclos.length) {
      return {
        actividades, dependencias,
        dias: plan.duracion,
        criticas: plan.ruta.length,
        quitadas: intento - 1,
        // Lo que hubo que corregirle. Se muestra: si NOVA se desvía seguido,
        // es el prompt el que hay que arreglar, y eso solo se ve si se cuenta.
        inventadas, olvidadas: olvidadas.length,
      };
    }
    const enCiclo = new Set(plan.ciclos);
    const i = dependencias.findIndex(d => enCiclo.has(d.a) && enCiclo.has(d.de));
    if (i < 0) break;
    dependencias.splice(i, 1);
  }
  return { actividades, dependencias, dias: 0, criticas: 0, quitadas: intento - 1 };
}