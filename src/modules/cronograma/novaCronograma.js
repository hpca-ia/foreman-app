import { supabase } from "../../lib/supabase";
import { calcular, calendario } from "./cpm";
import { leerMemoria, memoriaEnPalabras, recordar } from "./memoriaNova";
import { jsonTolerante } from "../../lib/jsonTolerante";
import { JUICIO, pedirANova } from "../../lib/modelos";

// NOVA arma el cronograma de la obra desde las agrupaciones del presupuesto.
//
// Las agrupaciones ya son la respuesta a "¿qué hay que hacer?" —obra civil,
// instalaciones, acabados— con su plata adentro. Lo que falta es el orden y la
// duración, y eso es saber de obra: que la estructura va antes que la
// mampostería, que las instalaciones se meten antes del enlucido o hay que
// picar, que los acabados no arrancan hasta que el edificio esté cerrado.
//
// Eso no sale de ningún dato. Sale de haber hecho obras, y es exactamente lo
// que NOVA puede aportar.
//
// LO QUE DEVUELVE ES UN BORRADOR, Y SE TRABAJA ENCIMA. El residente mueve
// duraciones y dependencias desde la obra, y la ruta crítica se recalcula
// sola porque se calcula al dibujar, no se guarda. Un cronograma que hay que
// "regenerar" para que diga la verdad es un cronograma que se mira una vez.
//
// Y ES EL MISMO ESQUELETO QUE EL VALORADO: cada actividad cuelga de la
// agrupación de la que salió, así que el tiempo y la plata hablan de las
// mismas cosas. Sin eso, el Gantt dice "mampostería en marzo" y el valorado
// dice otra cosa, y no hay forma de saber cuál de los dos está viejo.

const n = v => Number(v) || 0;

// El sufijo que distingue las barras de un mismo rubro. Corto a propósito: el
// nombre de la agrupación ya ocupa su lugar y es el que tiene que leerse.
// Si lo que NOVA llamó a una parte es una de las etapas de compra, se
// reconoce aunque venga con tilde o en mayúsculas; si es otra cosa —"montaje",
// "refuerzos", "pintura base"— es un trabajo de obra y va como ejecución, con
// su nombre tal cual.
const SIN_TILDE = t => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
const etapaDe = etiqueta => {
  const t = SIN_TILDE(etiqueta);
  return ["anticipo", "fabricacion", "entrega", "instalacion", "ejecucion"].includes(t) ? t : "ejecucion";
};

const ETAPA_CORTA = {
  anticipo: "anticipo", fabricacion: "fabricación", entrega: "entrega",
  instalacion: "instalación", ejecucion: "",
};

// Las unidades escritas de veinte maneras son la misma unidad. Sin esto, los
// 800 m2 de una obra salen como "600 M2 · 150 m² · 50 mt2" y dejan de sumar.
const UNIDAD = u => {
  const t = String(u || "").trim().toLowerCase()
    .replace(/[.\s]/g, "").replace(/²/g, "2").replace(/³/g, "3");
  if (/^(m2|mt2|metro2|metroscuadrados?)$/.test(t)) return "m2";
  if (/^(m3|mt3|metro3|metroscubicos?)$/.test(t)) return "m3";
  if (/^(ml|m|mt|metro|metros|metrolineal)$/.test(t)) return "ml";
  if (/^(u|un|und|unid|unidad|unidades|c\/u|pto|ptos?|punto|puntos)$/.test(t)) return "u";
  if (/^(kg|kilo|kilos|kgs)$/.test(t)) return "kg";
  if (/^(glb|global|gbl)$/.test(t)) return "glb";
  return t.slice(0, 6) || "u";
};

const miles = v => Math.round(v).toLocaleString("es-EC");

/**
 * Lo que la obra ya tiene agrupado, con su plata Y CON SU TAMAÑO.
 *
 * La plata sola no dice cuánto trabajo hay. Diez metros de pintura y mil
 * pueden costar parecido si en un caso el material es importado y en el otro
 * no, y no son ni de lejos el mismo tiempo de obra. Lo que de verdad manda
 * para una duración es la CANTIDAD: 1.200 m2 de enlucido son 1.200 m2, los
 * haga quien los haga.
 *
 * Por eso cada agrupación viaja con sus cantidades sumadas por unidad y con
 * sus rubros más gruesos. Con eso una duración se puede razonar —cantidad
 * dividido para lo que rinde una cuadrilla por día— en vez de adivinarse.
 */
export async function materiaPrima(obraId) {
  const campos = "id,actividad_id,total_base,capitulo,descripcion,unidad,cantidad,anulado_por_oc";
  const [{ data: acts }, traidos] = await Promise.all([
    supabase.from("obra_actividades").select("id,codigo,nombre,orden,extra").eq("obra_id", obraId).order("orden"),
    // Los ESCONDIDOS no entran. Son los rubros en $0 que alguien sacó del
    // control por inútiles —títulos sueltos, partidas sin precio— y acá hacen
    // doble daño: inflan el conteo de rubros de cada agrupación, y sobre todo
    // ocupan lugar en la consulta a NOVA, que tiene que leer treinta y siete
    // renglones que no son trabajo para encontrar los que sí.
    supabase.from("obra_rubros").select(`${campos},oculto`).eq("obra_id", obraId),
  ]);
  let rubros = traidos.data;
  if (traidos.error) {
    // Sin la 092 no existe la columna y la consulta falla entera: se vuelve a
    // pedir sin ella antes que dejar el cronograma sin materia prima.
    const { data } = await supabase.from("obra_rubros").select(campos).eq("obra_id", obraId);
    rubros = data;
  }
  const plata = new Map();
  const porAgrup = new Map();
  // Los que una orden de cambio sacó del contrato no cuentan: siguen en la
  // lista como historia, pero ya no son trabajo que haya que hacer ni plata
  // que haya que planificar. Es lo mismo que hace el control de obra.
  (rubros || []).filter(r => !r.anulado_por_oc && !r.oculto).forEach(r => {
    if (r.actividad_id == null) return;
    plata.set(r.actividad_id, (plata.get(r.actividad_id) || 0) + n(r.total_base));
    if (!porAgrup.has(r.actividad_id)) porAgrup.set(r.actividad_id, []);
    porAgrup.get(r.actividad_id).push(r);
  });

  return (acts || [])
    // Las extras —salarios, oficina, logística— no son actividades de obra:
    // no se ejecutan, se gastan. Ponerlas en el Gantt lo llena de barras que
    // nadie puede empezar ni terminar.
    .filter(a => !a.extra)
    .map(a => {
      const suyos = porAgrup.get(a.id) || [];
      const porUnidad = new Map();
      suyos.forEach(r => {
        const c = n(r.cantidad);
        if (!c) return;
        const u = UNIDAD(r.unidad);
        // Lo global no es una magnitud: "1 glb" no dice nada del tamaño y
        // sumado con los metros ensucia el único dato que sirve.
        if (u === "glb") return;
        porUnidad.set(u, (porUnidad.get(u) || 0) + c);
      });
      return {
        ...a,
        monto: Math.round((plata.get(a.id) || 0) * 100) / 100,
        rubros: suyos.length,
        // Ordenadas de mayor a menor: la primera unidad es la que define el
        // tamaño de esa agrupación.
        magnitud: [...porUnidad.entries()]
          .map(([unidad, cantidad]) => ({ unidad, cantidad: Math.round(cantidad * 100) / 100 }))
          .sort((x, y) => y.cantidad - x.cantidad),
        // Los rubros gruesos, que son los que se tardan. Los chicos no mueven
        // la duración y solo gastarían espacio en la consulta.
        principales: [...suyos].sort((x, y) => n(y.total_base) - n(x.total_base)).slice(0, 4)
          .filter(r => n(r.cantidad))
          .map(r => ({
            descripcion: String(r.descripcion || "").trim().slice(0, 52),
            cantidad: Math.round(n(r.cantidad) * 100) / 100,
            unidad: UNIDAD(r.unidad),
          })),
      };
    });
}

/** Una agrupación dicha en una línea, para la consulta. */
function enPalabras(a) {
  const mag = a.magnitud?.length
    ? a.magnitud.slice(0, 3).map(m => `${miles(m.cantidad)} ${m.unidad}`).join(" · ")
    : "sin cantidades cargadas";
  const princ = a.principales?.length
    ? `\n     ${a.principales.map(r => `${r.descripcion} (${miles(r.cantidad)} ${r.unidad})`).join(" · ")}`
    : "";
  return `${a.id} · ${a.nombre} · $${miles(a.monto)} · ${a.rubros || 0} rubros\n     TAMAÑO: ${mag}${princ}`;
}

export async function proponerCronograma({ agrupaciones = [], meses = 6, dias: diasPlazo = 0, nombreObra = "", cal = calendario() }) {
  if (!agrupaciones.length) {
    return { error: "Esta obra todavía no tiene agrupaciones. Se arman en Control de Obra → Agrupaciones." };
  }
  if (!meses) return { error: "Falta el plazo del proyecto: cuántos meses dura la obra." };
  const { memoria } = await leerMemoria("cronograma");
  // Los días los cuenta el calendario de la obra, que sabe de domingos y
  // feriados. La regla de tres de "26 días por mes" daba de más y era parte de
  // por qué el cronograma no terminaba de coincidir con el plazo.
  const dias = diasPlazo || Math.max(20, Math.round(meses * 26));
  // Qué días se trabaja en ESTA obra. Estaba escrito "lunes a sábado" fijo en
  // la consulta, y desde que la jornada se puede elegir eso era mentira para
  // cualquier obra que no trabaje sábados: NOVA calculaba contra una semana
  // que no existe y las duraciones salían cortas.
  const L = cal?.laborables || [1, 2, 3, 4, 5, 6];
  const jornada = L.length === 7 ? "se trabaja los siete días"
    : L.includes(6) && !L.includes(0) ? "se trabaja de lunes a sábado"
    : !L.includes(6) && !L.includes(0) ? "se trabaja de lunes a viernes, SIN sábados"
    : `se trabaja ${L.length} días por semana`;

  const sistema = `Eres NOVA y armas el cronograma de obra de una constructora en Ecuador.
${memoriaEnPalabras(memoria)}

La obra "${nombreObra}" dura ${meses} meses, que son ${dias} días de trabajo
contados en el calendario de ESTA obra: ${jornada}.

AGRUPACIONES del presupuesto, con su plata y SU TAMAÑO medido:
${agrupaciones.map(enPalabras).join("\n")}

Devuelves SOLO JSON, sin markdown. USA EL ID DE LA AGRUPACIÓN COMO REFERENCIA
—no inventes otra numeración— y no mandes el nombre: ya lo tengo, es el del
control de obra y es el que vale.

{"actividades":[{"id":12,"dias":18,"porque":"420 m2 / 1 cuadrilla x 24 m2 dia"},
                {"id":13,"dias":40,"porque":"importada, 8 semanas de fabricacion",
                 "partes":[["anticipo",1,50],["fabricación",30,40],["instalación de grada",9,10]]}],
 "dependencias":[[12,13,0],[13,14,-5]]}

"actividades": una por agrupación. "id" es el id de la agrupación, "dias" los
días hábiles que lleva, "porque" la cuenta que te llevó a ese número.

CÓMO SALE LA DURACIÓN: DE LA CANTIDAD, NO DE LA PLATA.

Esto es lo más importante de todo. Diez metros de pintura y mil metros pueden
costar parecido —si en un caso el material es importado y en el otro no— y no
son ni de lejos el mismo tiempo de obra. La plata dice cuánto pesa en el
presupuesto; la cantidad dice cuánto trabajo hay.

Para cada agrupación hacé esta cuenta:

  días = cantidad ÷ (lo que rinde una cuadrilla por día × cuántas cuadrillas)

Los rendimientos los sabés: cuántos m2 de enlucido hace un albañil con su
ayudante en un día, cuántos de mampostería, cuántos de pintura, cuántos m3 de
hormigón pone una cuadrilla. Usá los de obra en Ecuador. Lo que NO podés hacer
es poner "20 días" porque suena razonable: si la agrupación trae 1.240 m2 y
ponés 20 días, estás diciendo 62 m2 por día, y eso tiene que ser verdad.

Esa cuenta va en "porque", en diez palabras: "1240 m2 ÷ 2 cuadrillas × 31
m2/día". Es lo que lee quien revisa para saber si creerte.

Si una agrupación dice "sin cantidades cargadas" es que su presupuesto no las
tiene. Ahí estimá por la plata y el tipo de trabajo, y escribí "estimado sin
cantidades" en "porque": quien revise tiene que saber que ese número es el más
flojo de todos.

CUÁNDO PARTIR EN "partes".

Lo que se importa o se fabrica no pasa en un momento: se anticipa, se fabrica,
llega y se instala. Son momentos separados en el tiempo y cada uno se lleva una
parte del dinero —el tercer número de cada parte, que es su % de la plata de
esa agrupación y entre todas suman 100—.

El anticipo es CORTO (uno o dos días: es un pago) y va meses antes; la
fabricación es larga y no ocupa gente en obra; la instalación va al final.
Ejemplo de una ventanería importada:

  [["anticipo",1,50],["fabricación",60,40],["instalación",12,10]]

Esto es lo que después deja que el cronograma y el valorado digan lo mismo: la
plata cae en los meses en que de verdad sale, no repartida pareja.

LO QUE NUNCA SE PARTE: los gastos generales de obra, la dirección de proyecto,
los honorarios, las pólizas, la fiscalización. No se anticipan ni se fabrican
ni se instalan: se gastan a lo largo de toda la obra. Van como UNA actividad,
con una duración igual al plazo entero.

Y lo que se ejecuta de corrido tampoco se parte: es una actividad y punto. No
inventes etapas para que se vea más detallado.

DEPENDENCIAS: "de" termina antes de que empiece "a". Usá el orden real de una
obra, no el orden de la lista:
· movimiento de tierra y cimentación primero
· estructura después, piso por piso si la obra tiene varios
· mampostería detrás de la estructura, y puede ir solapada con los pisos de arriba
· instalaciones ANTES de enlucidos: si van después hay que picar
· enlucidos, contrapisos y cielos rasos después de instalaciones
· carpintería y acabados al final, con el edificio cerrado
· limpieza y entrega al último

EL RETARDO, que es el tercer número de cada dependencia:

  POSITIVO es una espera real —el fragüe del hormigón antes de desencofrar, el
  secado del empaste antes de pintar—.

  NEGATIVO es un TRASLAPE: la actividad arranca antes de que termine la otra,
  que es lo que pasa todo el tiempo en obra. La mampostería de planta baja
  entra cuando arriba todavía se está fundiendo; el enlucido empieza por donde
  ya se cerró. USALO: un cronograma sin traslapes da una obra mucho más larga
  de lo que es.

El cuarto elemento, opcional, es el tipo: "CC" cuando arrancan juntas, "FF"
cuando terminan juntas. Sin él es fin→comienzo, que es la normal.

Lo que puede ir en paralelo, ponelo en paralelo. Pero no inventes dependencias
para rellenar: si dos cosas no se traban, no las trabes.

EL PLAZO MANDA. La obra tiene que salir en ${dias} días hábiles, que es lo que
dice el contrato. No es una sugerencia: si tus duraciones dan mucho más, no
alargues la obra — acortá, traslapá lo que se traslapa en la realidad, y poné
en paralelo lo que no se traba. La salida es MÁS CUADRILLAS en los frentes que
lo permiten —pintura, enlucido y mampostería se dividen por zonas— y decirlo en
"porque". Lo que no se puede dividir así es el hormigón de una losa o el
fragüe: esos tardan lo que tardan aunque se ponga el doble de gente. Si dan
mucho menos, no las estires: dales el tiempo que llevan y dejá el resto como
holgura.`;

  try {
    // Con respaldo: si la cuenta no tiene el modelo fuerte, reintenta con el
    // conocido en vez de dejar el cronograma sin armar.
    const { res, data } = await pedirANova({
        // Con espacio de sobra: veinte agrupaciones con sus dependencias y el
        // porqué de cada una no entran en 4000, y la respuesta vuelve cortada
        // a la mitad. Pasó.
        // EL MODELO MÁS FUERTE, solo acá.
        //
        // Armar un cronograma es el trabajo de criterio más difícil que hace
        // NOVA: hay que sacar rendimientos de memoria, deducir el orden real
        // de una obra que no vio, y decidir qué se traslapa con qué. No se
        // parece a leer una factura.
        //
        // Se arma una vez por obra y después se corrige a mano, así que el
        // costo de usar el modelo bueno acá es despreciable contra el de
        // revisar un cronograma mal pensado.
        model: JUICIO, max_tokens: 12000,
        system: sistema,
        messages: [{ role: "user", content: `Armá el cronograma de ${meses} meses. Solo JSON.` }],
    });
    if (!res.ok || data?.error) return { error: data?.error?.message || "NOVA no pudo armarlo." };
    // Tolerante al corte: si la respuesta no entró entera, se salva lo que
    // llegó completo en vez de perder todo por el último renglón. Las
    // agrupaciones que falten las agrega `ordenar` igual, con duración a
    // revisar, así que un corte no deja el cronograma incompleto — deja unas
    // cuantas duraciones sin pensar, y eso se ve.
    const texto = data?.content?.[0]?.text;
    const { datos, cortado } = jsonTolerante(texto);
    if (!datos) {
      // QUÉ DEVOLVIÓ, no solo que no se entiende. "Probá de nuevo" manda a
      // repetir a ciegas algo que va a fallar igual; con los primeros
      // renglones se ve en dos segundos si contestó en prosa, si se cortó, o
      // si la API devolvió un error en vez de una respuesta.
      const muestra = String(texto ?? JSON.stringify(data ?? "")).trim().slice(0, 220);
      return { error: `NOVA devolvió algo que no se entiende. Empezaba así:\n\n${muestra || "(vacío)"}` };
    }
    return { ...ordenar(datos, agrupaciones, cal), cortado };
  } catch (e) {
    return { error: "NOVA devolvió algo que no se entiende: " + e.message };
  }
}

/**
 * Limpiar lo que vino y comprobar que se pueda calcular.
 *
 * Nada se guarda sin verificar. Una dependencia que apunta a una actividad que
 * no existe se tira; un círculo —A espera a B que espera a A— se corta en la
 * dependencia que lo cierra, porque un cronograma con un círculo no tiene
 * fechas y la pantalla no podría dibujar nada.
 */
/**
 * De la forma corta que devuelve NOVA a la que usa el resto del módulo.
 *
 * Se le pide lo mínimo —el id de la agrupación y los días— porque todo lo
 * demás ya lo tenemos: el nombre es el del control de obra, y el "porque" de
 * cada una es texto que nadie lee y que ocupa el lugar donde después no entra
 * la última actividad. Pedir menos es la única forma real de que no se corte.
 *
 * Sigue entendiendo la forma larga: una respuesta vieja, o un modelo que se
 * acuerda del formato anterior, no tienen por qué fallar.
 */
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
function expandir(p) {
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

/**
 * Acomodar el cronograma a lo que cambió en el control, sin rehacerlo.
 *
 * Este es el caso de verdad y el que hasta ahora no estaba. Un cronograma
 * recién armado no vale nada; vale después de que alguien le corrigió las
 * duraciones, lo encadenó como se trabaja, le puso los traslapes y partió en
 * etapas lo que se importa. Eso es el trabajo, y rearmarlo de cero lo borra.
 *
 * Pero la obra sigue: entra una orden de cambio, se mueve una agrupación, se
 * suma un rubro. Y entonces el cronograma dice una cosa y el control otra.
 *
 * Acá NOVA recibe EL PLAN QUE YA EXISTE —con sus fechas, sus cadenas y sus
 * traslapes— y SOLO LO QUE CAMBIÓ, y devuelve operaciones puntuales: dónde
 * meter lo nuevo, a qué barra alargarle la duración porque le entró más
 * trabajo, qué sacar. No se le pide un cronograma: se le pide un parche.
 *
 * Es también la forma eficiente de preguntarlo. Mandar el plan entero y pedir
 * otro plan entero cuesta caro, tarda, y cada vuelta es una oportunidad de que
 * cambie algo que nadie quería que cambie.
 */
export async function acomodarCambios({ plan = [], dependencias = [], cambios, nombreObra = "", dias = 0 }) {
  const nuevas = cambios?.nuevas || [];
  const dePlata = cambios?.dePlata || [];
  const perdidas = cambios?.perdidas || [];
  if (!nuevas.length && !dePlata.length && !perdidas.length) {
    return { error: "No hay nada que acomodar: el cronograma ya está de acuerdo con el control." };
  }

  const nombreDe = new Map(plan.map(a => [a.id, a.nombre]));
  const planEnTexto = plan.map(a => {
    const suyas = dependencias.filter(d => d.actividad_id === a.id)
      .map(d => `${d.tipo || "FC"}${d.retardo ? ` ${d.retardo > 0 ? "+" : ""}${d.retardo}d` : ""} de ${nombreDe.get(d.depende_de_id) || "?"}`)
      .join("; ");
    return `${a.id} · ${a.nombre} · ${a.duracion}d · ${a.inicio} a ${a.fin}`
      + `${a.critica ? " · CRÍTICA" : ` · ${a.holgura}d de colchón`}`
      + (suyas ? ` · va después de: ${suyas}` : "");
  }).join("\n");

  const loQueCambio = [
    nuevas.length && `AGRUPACIONES NUEVAS, que no están en el cronograma:\n${
      nuevas.map(g => `  ${g.id} · ${g.nombre}${g.monto ? ` · $${Math.round(g.monto)}` : ""}`).join("\n")}`,
    dePlata.length && `AGRUPACIONES QUE CAMBIARON DE MONTO —órdenes de cambio— y cuya barra sigue midiendo lo mismo:\n${
      dePlata.map(c => `  ${c.id} · ${c.nombre} · de $${Math.round(c.antes)} a $${Math.round(c.ahora)} (${c.pct > 0 ? "+" : ""}${c.pct}%)`
        + ` · hoy sus barras son: ${c.actividades.map(a => `«${a.nombre}» ${a.duracion}d`).join(", ")}`).join("\n")}`,
    perdidas.length && `AGRUPACIONES BORRADAS del control, con barras que quedaron colgando: ${perdidas.join(", ")}`,
  ].filter(Boolean).join("\n\n");

  const sistema = `Eres NOVA y ajustas el cronograma de una obra en Ecuador que YA ESTÁ TRABAJADO.

La obra "${nombreObra}"${dias ? ` tiene un plazo de ${dias} días hábiles` : ""}.

NO REHAGAS EL CRONOGRAMA. Lo que ves abajo es trabajo de alguien que conoce la
obra: duraciones corregidas, cadenas, traslapes, etapas. Tu trabajo es meter lo
que cambió adentro de ese plan tocando lo MENOS posible.

EL PLAN DE HOY (id · nombre · duración · fechas · holgura · de qué depende):
${planEnTexto}

LO QUE CAMBIÓ EN EL CONTROL DE OBRA:
${loQueCambio}

Devuelves SOLO JSON, sin markdown:
{"agregar":[{"agrupacion_id":12,"duracion":14,"despues_de":31,"tipo":"FC","retardo":0,"porque":"..."}],
 "ajustar":[{"actividad_id":27,"duracion":22,"porque":"le entró 44% más trabajo"}],
 "quitar":[{"actividad_id":44,"porque":"su agrupación ya no existe"}]}

AGREGAR: una por cada agrupación nueva. "despues_de" es el id de una actividad
del plan de arriba —elegí la que de verdad la traba, no la última de la lista—.
La duración, de la cantidad de trabajo que tenga; si no sabés, del monto
comparado con barras parecidas que ya están en el plan.

AJUSTAR: a la agrupación que le entró más plata le entró más trabajo, y su
barra tiene que crecer en proporción. Al revés también: si le quitaron trabajo,
la barra sobra y acortarla devuelve holgura que la obra puede usar. Si la
agrupación está partida en etapas, ajustá la que de verdad ejecuta —la
instalación o la ejecución—, no el anticipo, que es un pago de un día.

NO ES PROPORCIONAL CIEGO: un 40% más de plata en ventanería importada puede ser
cero días más de obra si lo que subió fue el precio del vidrio y no la
cantidad. Decilo en "porque" cuando sea así y dejá la duración como está.

QUITAR: solo las que te digo que quedaron colgando.

NO TOQUES nada que no esté en lo que cambió. No reordenes, no cambies
dependencias que ya existen, no repartas etapas de nuevo. Si creés que algo más
hay que mover, decilo en el "porque" de la operación más cercana en vez de
hacerlo.`;

  try {
    // Con respaldo, como el resto del cronograma: si la cuenta no tiene el
    // modelo fuerte, contesta el conocido en vez de no contestar nadie.
    const { res, data } = await pedirANova({
        model: JUICIO, max_tokens: 4000,
        system: sistema,
        messages: [{ role: "user", content: "Acomodá el cronograma a esos cambios. Solo JSON." }],
    });
    if (!res.ok || data?.error) return { error: data?.error?.message || "NOVA no pudo acomodarlo." };
    const { datos } = jsonTolerante(data?.content?.[0]?.text);
    if (!datos) return { error: "NOVA devolvió algo que no se entiende. Probá de nuevo." };
    return limpiarParche(datos, { plan, nuevas, perdidas, dePlata });
  } catch (e) {
    return { error: "NOVA devolvió algo que no se entiende: " + e.message };
  }
}

/**
 * Quedarse solo con lo que NOVA tenía permitido tocar.
 *
 * Lo mismo que con el cronograma entero: el prompt es un pedido y esto es la
 * garantía. Una operación sobre una actividad que no estaba en lo que cambió
 * es NOVA rehaciendo el plan por su cuenta, que es exactamente lo que no se le
 * pidió y lo que borraría el trabajo de alguien.
 */
export function limpiarParche(p, { plan = [], nuevas = [], perdidas = [], dePlata = [] }) {
  const existe = new Set(plan.map(a => a.id));
  const puedeNacer = new Map(nuevas.map(g => [Number(g.id), g]));
  // Solo se pueden ajustar las barras de las agrupaciones cuyo monto cambió.
  const ajustables = new Set(dePlata.flatMap(c => c.actividades.map(a => a.id)));
  const borrables = new Set((perdidas || []).map(Number));

  // Lo que se le rechaza, contado sobre lo que NOVA mandó —no sobre lo que
  // quedó—: las que entran solas por relleno taparían el número.
  let descartadas = 0;
  const agregar = (p.agregar || [])
    .filter(x => { const si = puedeNacer.has(Number(x.agrupacion_id)); if (!si) descartadas += 1; return si; })
    .map(x => ({
      agrupacion_id: Number(x.agrupacion_id),
      nombre: puedeNacer.get(Number(x.agrupacion_id)).nombre,
      duracion: Math.max(1, Math.round(n(x.duracion)) || 10),
      despues_de: existe.has(Number(x.despues_de)) ? Number(x.despues_de) : null,
      tipo: ["FC", "CC", "FF"].includes(x.tipo) ? x.tipo : "FC",
      retardo: Math.max(-365, Math.min(365, Math.round(n(x.retardo)))),
      porque: x.porque || "",
    }));
  // Una agrupación nueva por la que NOVA no dijo nada entra igual, al final:
  // olvidarla sería perder un rubro del plan.
  const puestas = new Set(agregar.map(x => x.agrupacion_id));
  nuevas.filter(g => !puestas.has(Number(g.id))).forEach(g => agregar.push({
    agrupacion_id: Number(g.id), nombre: g.nombre, duracion: 10,
    despues_de: null, tipo: "FC", retardo: 0,
    porque: "NOVA no dijo dónde va; entró al final con duración a revisar.",
  }));

  const ajustar = (p.ajustar || [])
    .filter(x => { const si = ajustables.has(Number(x.actividad_id)); if (!si) descartadas += 1; return si; })
    .map(x => ({
      actividad_id: Number(x.actividad_id),
      duracion: Math.max(1, Math.round(n(x.duracion)) || 1),
      porque: x.porque || "",
    }))
    .filter(x => {
      const a = plan.find(y => y.id === x.actividad_id);
      return a && x.duracion !== a.duracion;
    });

  const quitar = (p.quitar || [])
    .map(x => ({ actividad_id: Number(x.actividad_id), porque: x.porque || "" }))
    .filter(x => {
      const a = plan.find(y => y.id === x.actividad_id);
      const si = a && borrables.has(Number(a.obra_actividad_id));
      if (!si) descartadas += 1;
      return si;
    });
  // Las colgantes que NOVA no mencionó se van igual: su agrupación no existe.
  const yaQuitadas = new Set(quitar.map(x => x.actividad_id));
  plan.filter(a => borrables.has(Number(a.obra_actividad_id)) && !yaQuitadas.has(a.id))
    .forEach(a => quitar.push({ actividad_id: a.id, porque: "Su agrupación ya no está en el control de obra." }));

  // Se muestra: si NOVA se sale del parche seguido, el que hay que arreglar
  // es el prompt, y eso solo se ve si se cuenta.
  return { agregar, ajustar, quitar, descartadas };
}

/** Guardarlo. Reemplaza lo que hubiera: es un borrador que se vuelve a armar. */
export async function guardarPropuesta({ lead, obra, propuesta, quien }) {
  const { data: previas } = await supabase.from("cronograma_actividades").select("id").eq("lead_id", lead.id);
  if (previas?.length) {
    await supabase.from("cronograma_dependencias").delete().in("actividad_id", previas.map(x => x.id));
    await supabase.from("cronograma_actividades").delete().eq("lead_id", lead.id);
  }

  const filas = propuesta.actividades.map(a => ({
    lead_id: lead.id, obra_id: obra?.id || null,
    nombre: a.nombre, duracion: a.duracion,
    obra_actividad_id: a.agrupacion_id, nota: a.porque || null, orden: a.orden,
    etapa: a.etapa || "ejecucion", peso_pct: a.peso ?? null,
    incluye: a.incluye?.length ? a.incluye : null,
  }));
  let { data: creadas, error } = await supabase.from("cronograma_actividades").insert(filas).select();
  // Sin la 083 no existen etapa ni peso: el cronograma entra igual, y lo que
  // se pierde es poder derivar el valorado de él.
  // Sin la 093 no existe `incluye`; sin la 083, ni etapa ni peso. Se va
  // soltando lo que la base no tenga antes que perder el cronograma entero.
  if (error && /incluye/i.test(error.message)) {
    const sinIncluye = filas.map(({ incluye, ...resto }) => resto);
    ({ data: creadas, error } = await supabase.from("cronograma_actividades").insert(sinIncluye).select());
  }
  if (error && /column|schema cache/i.test(error.message)) {
    const limpias = filas.map(({ etapa, peso_pct, incluye, ...resto }) => resto);
    ({ data: creadas, error } = await supabase.from("cronograma_actividades").insert(limpias).select());
  }
  if (error) return { error: /schema cache|does not exist/i.test(error.message) ? "Falta correr la migración 076." : error.message };

  // De la referencia de NOVA al id de la base.
  const porRef = new Map(propuesta.actividades.map((a, i) => [a.ref, creadas[i]?.id]));
  const deps = propuesta.dependencias
    .map(d => ({ actividad_id: porRef.get(d.a), depende_de_id: porRef.get(d.de), tipo: d.tipo || "FC", retardo: d.retardo }))
    .filter(d => d.actividad_id && d.depende_de_id);
  if (deps.length) await supabase.from("cronograma_dependencias").insert(deps);

  void quien;
  return { creadas: creadas.length, dependencias: deps.length };
}

/**
 * Lo que quedó después de que una persona lo corrigió, para la obra siguiente.
 *
 * Se aprende de lo que hay AHORA en la pantalla, no de lo que NOVA propuso: si
 * alguien le cambió la duración a la mampostería de 20 a 35 días, eso es lo
 * que vale. Aprender de la propuesta sería que NOVA se dé la razón sola.
 */
export async function aprenderDelCronograma(actividades = [], quien, agrupaciones = []) {
  // El tamaño de cada agrupación, para poder anotar el rendimiento.
  const tam = new Map();
  const cuantas = new Map();
  agrupaciones.forEach(g => { if (g.magnitud?.[0]) tam.set(g.id, g.magnitud[0]); });
  actividades.forEach(a => {
    if (a.obra_actividad_id) cuantas.set(a.obra_actividad_id, (cuantas.get(a.obra_actividad_id) || 0) + 1);
  });

  for (const a of actividades) {
    if (!a.nombre || !a.duracion) continue;
    const dias = Math.round(a.duracion);

    // EL RENDIMIENTO ES LO QUE SIRVE PARA LA PRÓXIMA OBRA, no los días.
    //
    // "El enlucido lleva 70 días" no se puede usar en otro proyecto: la obra
    // que viene tiene otros metros. "El enlucido rinde 18 m2 por día" sí, y
    // es lo que de verdad quedó demostrado cuando alguien corrigió el número.
    //
    // Solo cuando la agrupación es UNA sola actividad: si está partida en
    // anticipo, fabricación e instalación, los días de una etapa no se
    // dividen por la cantidad entera — daría un rendimiento inventado.
    const m = a.obra_actividad_id && cuantas.get(a.obra_actividad_id) === 1
      ? tam.get(a.obra_actividad_id) : null;
    const rinde = m && dias ? Math.round((m.cantidad / dias) * 10) / 10 : 0;

    await recordar({
      tema: "cronograma",
      descripcion: a.nombre,
      perfil: "duracion",
      pagos: null,
      anticipacion: dias,
      nota: rinde
        ? `${miles(m.cantidad)} ${m.unidad} en ${dias} días hábiles → ${rinde} ${m.unidad}/día`
        : `${dias} días hábiles`,
      quien,
    });
  }
  return actividades.length;
}

/**
 * Qué se hace adentro de cada barra, en una consulta APARTE.
 *
 * Venía pegado al cronograma y fue un error: cuatro a seis renglones por barra
 * multiplican el tamaño de la respuesta, y el formato compacto del cronograma
 * existe justamente para que entre entera. Con veinte agrupaciones la
 * respuesta se cortaba tan adentro que ya no se podía salvar nada, y el
 * cronograma —que es lo importante— no se armaba por culpa de un adorno.
 *
 * Separado, lo peor que pasa si falla es quedarse sin los trabajos de adentro.
 * El cronograma ya está hecho.
 */
export async function proponerQueIncluye(actividades = [], agrupaciones = []) {
  const porId = new Map(agrupaciones.map(a => [Number(a.id), a]));
  // Solo las que son trabajo de obra: honorarios, pólizas y dirección no
  // tienen nada adentro que ejecutar, y preguntarlo invita a inventar.
  const utiles = actividades
    .filter(a => a.obra_actividad_id && porId.has(Number(a.obra_actividad_id)))
    .slice(0, 40);
  if (!utiles.length) return { incluye: {} };

  const lista = utiles.map(a => {
    const g = porId.get(Number(a.obra_actividad_id));
    const mag = g.magnitud?.length
      ? g.magnitud.slice(0, 2).map(m => `${miles(m.cantidad)} ${m.unidad}`).join(" · ") : "";
    return `${a.id} · ${a.nombre}${mag ? ` · ${mag}` : ""}`;
  }).join("\n");

  const sistema = `Sos NOVA y conocés la obra en Ecuador.

Para cada actividad de abajo, decí QUÉ SE HACE ADENTRO Y NO ES UN RUBRO del
presupuesto. El presupuesto cobra "montaje de estructura"; adentro de ese
montaje hay replanteo, nivelación de placas, izaje, torque de pernos y pruebas.
Nada de eso es un rubro y es exactamente lo que se programa y se supervisa.

Tres a cinco renglones por actividad, cortos, en castellano de obra y EN EL
ORDEN EN QUE SE EJECUTAN.

NO pongas: el nombre de la actividad otra vez, ni "ejecución de los trabajos",
ni nada que no se pueda ver haciéndose en la obra.

Si una actividad no tiene trabajo de obra adentro —honorarios, pólizas,
dirección de proyecto, gastos generales— devolvé una lista vacía.

Devolvés SOLO JSON, sin markdown, con el id de la actividad como llave:

{"42":["replanteo y nivelación","mampostería de bloque","mochetas y dinteles","curado"],
 "43":[]}

ACTIVIDADES:
${lista}`;

  try {
    const { res, data } = await pedirANova({
      model: JUICIO, max_tokens: 6000,
      system: sistema,
      messages: [{ role: "user", content: "Qué se hace adentro de cada una. Solo JSON." }],
    });
    if (!res.ok || data?.error) return { error: data?.error?.message || "NOVA no pudo proponerlos." };
    const { datos } = jsonTolerante(data?.content?.[0]?.text);
    if (!datos) return { error: "NOVA devolvió algo que no se entiende." };
    const limpio = {};
    Object.entries(datos).forEach(([id, xs]) => {
      if (!Array.isArray(xs)) return;
      const lim = xs.map(x => String(x || "").trim().slice(0, 80)).filter(Boolean).slice(0, 6);
      if (lim.length) limpio[id] = lim;
    });
    return { incluye: limpio };
  } catch (e) {
    return { error: e.message };
  }
}
