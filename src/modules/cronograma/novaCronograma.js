import { supabase } from "../../lib/supabase";
import { calcular, calendario } from "./cpm";
import { expandir, ordenar, n, etapaDe, SIN_TILDE, ETAPA_CORTA } from "./armarPropuesta";

export { ordenar };
import { leerMemoria, memoriaEnPalabras, recordar } from "./memoriaNova";
import { jsonTolerante } from "../../lib/jsonTolerante";
import { JUICIO, pedirANova, textoDeNova } from "../../lib/modelos";

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
    const texto = textoDeNova(data);
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
    const { datos } = jsonTolerante(textoDeNova(data));
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
    const { datos } = jsonTolerante(textoDeNova(data));
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

/**
 * Que NOVA REVISE el cronograma que ya trabajó una persona.
 *
 * Distinto de `acomodarCambios`, que entra cuando el control cambió. Esto es
 * para cuando no cambió nada y uno quiere una segunda lectura de su propio
 * trabajo: duraciones que quedaron flojas, cadenas que faltan, traslapes que la
 * obra permite y nadie puso, etapas en un orden que no es el real.
 *
 * NO REHACE NADA. Devuelve el mismo tipo de parche que `acomodarCambios` —una
 * lista de operaciones, cada una con su porqué— y la persona decide. Un
 * cronograma con avance cargado y fechas comprometidas no se reescribe porque
 * un modelo tenga una opinión.
 *
 * Y puede REORDENAR ETAPAS, que es lo que no sabía hacer: si el montaje va
 * antes que la entrega en esta obra, lo dice en vez de callárselo.
 */
export async function revisarCronograma({ plan = [], dependencias = [], nombreObra = "", dias = 0, cal = calendario() }) {
  if (!plan.length) return { error: "No hay cronograma que revisar." };
  const { memoria } = await leerMemoria("cronograma");

  const nombreDe = new Map(plan.map(a => [a.id, a.nombre]));
  const planEnTexto = plan.map(a => {
    const suyas = dependencias.filter(d => d.actividad_id === a.id)
      .map(d => `${d.tipo || "FC"}${d.retardo ? ` ${d.retardo > 0 ? "+" : ""}${d.retardo}d` : ""} de ${nombreDe.get(d.depende_de_id) || "?"}`)
      .join("; ");
    return `${a.id} · ${a.nombre} · ${a.duracion}d · ${a.inicio} a ${a.fin}`
      + `${a.critica ? " · CRÍTICA" : ` · ${a.holgura}d de colchón`}`
      + (suyas ? ` · va después de: ${suyas}` : " · SIN DEPENDENCIAS");
  }).join("\n");

  const L = cal?.laborables || [1, 2, 3, 4, 5, 6];
  const jornada = L.length === 7 ? "los siete días"
    : L.includes(6) ? "de lunes a sábado" : "de lunes a viernes, sin sábados";

  const sistema = `Sos NOVA y REVISÁS el cronograma de una obra en Ecuador que YA ESTÁ TRABAJADO.
${memoriaEnPalabras(memoria)}

La obra "${nombreObra}"${dias ? ` tiene un plazo de ${dias} días hábiles` : ""} y se trabaja ${jornada}.

ESTO NO ES REHACERLO. Lo que ves abajo lo armó alguien que conoce la obra:
corrigió duraciones, encadenó, puso traslapes, partió en etapas. Tu trabajo es
leerlo como lo leería un colega con experiencia y decir qué MEJORARÍA, poco y
bien fundado. Si está bien, decilo y no propongas nada: una revisión que
siempre encuentra diez cosas es una revisión en la que nadie confía.

EL PLAN DE HOY (id · nombre · duración · fechas · holgura · de qué depende):
${planEnTexto}

QUÉ MIRAR, en este orden:

1. ACTIVIDADES SIN DEPENDENCIAS. Una barra que no depende de nada arranca el
   día uno. En una obra casi nada arranca el día uno: si ves varias sueltas,
   es lo más valioso que podés corregir.

2. TRASLAPES QUE FALTAN. La mampostería de planta baja entra cuando arriba
   todavía se funde; el enlucido empieza por donde ya se cerró. Un retardo
   NEGATIVO es eso. Un cronograma sin traslapes da una obra mucho más larga de
   lo que es.

3. DURACIONES QUE NO CIERRAN con el tamaño del trabajo o con lo que rinde una
   cuadrilla. Decí la cuenta.

4. EL ORDEN DE LAS ETAPAS de una misma agrupación. El anticipo va primero y la
   instalación al final; si ves una entrega después de su instalación, o un
   montaje antes de su fabricación, está al revés.

5. EL PLAZO. Si el plan sale muy por encima, decí dónde se gana —traslapes,
   paralelo, más cuadrillas— y no estires nada.

Devolvés SOLO JSON, sin markdown. Cada operación con su "porque" en diez
palabras, que es lo que lee quien decide:

{"ajustar":[{"id":12,"duracion":22,"porque":"1240 m2 / 2 cuadrillas x 28 m2 dia"}],
 "encadenar":[{"de":12,"a":13,"tipo":"FC","retardo":-5,"porque":"enlucido entra por lo ya cerrado"}],
 "desencadenar":[{"de":8,"a":9,"porque":"no se traban entre si"}],
 "reordenar":[{"id":15,"antes_de":14,"porque":"el montaje va antes de la entrega"}],
 "nota":"una frase sobre cómo está el cronograma en general"}

Las cuatro listas son opcionales: mandá solo las que tengan algo. Si el
cronograma está bien, mandá {"nota":"..."} y nada más.`;

  try {
    const { res, data } = await pedirANova({
      model: JUICIO, max_tokens: 6000,
      system: sistema,
      messages: [{ role: "user", content: "Revisá este cronograma. Solo JSON." }],
    });
    if (!res.ok || data?.error) return { error: data?.error?.message || "NOVA no pudo revisarlo." };
    const texto = textoDeNova(data);
    const { datos } = jsonTolerante(texto);
    if (!datos) {
      return { error: `NOVA devolvió algo que no se entiende. Empezaba así:\n\n${String(texto || "").slice(0, 220) || "(vacío)"}` };
    }
    const vivos = new Set(plan.map(a => a.id));
    const lim = (xs, ok) => (Array.isArray(xs) ? xs : []).filter(ok).slice(0, 30);
    return {
      ajustar: lim(datos.ajustar, x => vivos.has(Number(x.id)) && n(x.duracion) > 0)
        .map(x => ({ id: Number(x.id), duracion: Math.max(1, Math.round(n(x.duracion))), porque: x.porque || "" })),
      encadenar: lim(datos.encadenar, x => vivos.has(Number(x.de)) && vivos.has(Number(x.a)) && Number(x.de) !== Number(x.a))
        .map(x => ({ de: Number(x.de), a: Number(x.a), tipo: ["FC", "CC", "FF"].includes(x.tipo) ? x.tipo : "FC",
          retardo: Math.max(-365, Math.min(365, Math.round(n(x.retardo)))), porque: x.porque || "" })),
      desencadenar: lim(datos.desencadenar, x => vivos.has(Number(x.de)) && vivos.has(Number(x.a)))
        .map(x => ({ de: Number(x.de), a: Number(x.a), porque: x.porque || "" })),
      reordenar: lim(datos.reordenar, x => vivos.has(Number(x.id)) && vivos.has(Number(x.antes_de)))
        .map(x => ({ id: Number(x.id), antes_de: Number(x.antes_de), porque: x.porque || "" })),
      // Partir una barra para darle lugar a un trabajo que no tiene actividad
      // propia. No rompe el espejo con el control: la agrupación sigue siendo
      // la misma, lo que cambia es que adentro tiene dos momentos en vez de
      // uno. Es la única subdivisión permitida, y acá es donde hacía falta.
      partir: lim(datos.partir, x => vivos.has(Number(x.id)) && String(x.nombre || "").trim())
        .map(x => ({
          id: Number(x.id),
          nombre: String(x.nombre).trim().slice(0, 60),
          dias: Math.max(1, Math.round(n(x.dias)) || 3),
          peso: Math.min(95, Math.max(1, Math.round(n(x.peso)) || 10)),
          primero: x.primero !== false,
          porque: x.porque || "",
        })),
      nota: String(datos.nota || "").slice(0, 1200),
    };
  } catch (e) {
    return { error: e.message };
  }
}

/**
 * Dictarle el cronograma a NOVA con palabras.
 *
 * El tercer modo, y el que falta entre los otros dos. "Armalo" supone que NOVA
 * sabe de esta obra lo que sabe quien la dirige, y no lo sabe. "Revisalo"
 * supone que ya está armado. En el medio está lo que de verdad pasa: alguien
 * tiene el orden en la cabeza —"la mampostería va detrás de la estructura pero
 * puede entrar por planta baja; la ventanería pedila ya que tarda ocho
 * semanas"— y traducir eso a flechas, retardos negativos y duraciones es media
 * hora de clics.
 *
 * SIN TIEMPOS, a propósito. Quien lleva la obra sabe el ORDEN mucho mejor que
 * las duraciones; las duraciones las puede calcular NOVA de las cantidades. Se
 * puede escribir solo el orden y dejar que ella ponga los días.
 *
 * Devuelve el mismo parche que `revisarCronograma` —operaciones sueltas con su
 * porqué— y se aceptan de a una en la misma pantalla: lo que NOVA entendió mal
 * se descarta en un clic en vez de quedar metido adentro del plan.
 */
export async function ordenarConPalabras({ plan = [], dependencias = [], texto = "", nombreObra = "", dias = 0, cal = calendario() }) {
  const dicho = String(texto || "").trim();
  if (!dicho) return { error: "Escribí cómo va la obra." };
  if (!plan.length) return { error: "Primero tiene que haber actividades en el cronograma." };

  const nombreDe = new Map(plan.map(a => [a.id, a.nombre]));
  const planEnTexto = plan.map(a => {
    const suyas = dependencias.filter(d => d.actividad_id === a.id)
      .map(d => `${d.tipo || "FC"}${d.retardo ? ` ${d.retardo > 0 ? "+" : ""}${d.retardo}d` : ""} de ${nombreDe.get(d.depende_de_id) || "?"}`)
      .join("; ");
    return `${a.id} · ${a.nombre} · ${a.duracion}d`
      + (suyas ? ` · hoy va después de: ${suyas}` : " · hoy SIN DEPENDENCIAS");
  }).join("\n");

  const L = cal?.laborables || [1, 2, 3, 4, 5, 6];
  const jornada = L.length === 7 ? "los siete días"
    : L.includes(6) ? "de lunes a sábado" : "de lunes a viernes, sin sábados";

  const sistema = `Sos NOVA. Alguien que dirige la obra "${nombreObra}" te está DICTANDO cómo se
construye, con sus palabras, y tu trabajo es traducirlo a operaciones sobre el
cronograma que ya existe.${dias ? ` El plazo son ${dias} días hábiles` : ""} y se trabaja ${jornada}.

LAS BARRAS QUE HAY HOY (id · nombre · duración · de qué depende):
${planEnTexto}

LO QUE TE ESTÁ DICTANDO:
"""
${dicho.slice(0, 4000)}
"""

CÓMO LEERLO:

· "A va después de B" → encadenar B→A.
· "A y B van juntas" o "a la vez" → encadenar con tipo "CC".
· "A entra cuando B va por la mitad" → encadenar con retardo NEGATIVO: ese
  traslape es lo que hace que una obra entre en su plazo.
· "hay que esperar X días" → retardo POSITIVO (fragüe, secado, curado).
· "A no depende de nada" o "sacale la dependencia" → desencadenar.
· "esto tarda tres semanas" → ajustar la duración a días hábiles.
· "pedila ya", "hay que anticipar", "tarda ocho semanas en llegar" → es un
  trabajo que se compra: si la barra no está partida, decilo en la "nota" para
  que la partan; no inventes partes vos.

SI NO MENCIONA TIEMPOS, NO INVENTES DEPENDENCIAS NI DURACIONES que no te pidió.
Pero sí podés ajustar una duración si lo que dicta la contradice de frente.

NOMBRES APROXIMADOS. Va a decir "la mampostería" y la barra se llama
"MAMPOSTERÍA Y ENLUCIDOS". Emparejalo por sentido. Lo que no puedas emparejar
con confianza, NO lo adivines: escribilo en la "nota" diciendo qué no
encontraste. Una operación sobre la barra equivocada es peor que no hacerla.

Devolvés SOLO JSON, sin markdown. Cada operación con su "porque" en diez
palabras, y el porqué sale de LO QUE ÉL DIJO, no de tu criterio:

{"ajustar":[{"id":12,"duracion":22,"porque":"dijo tres semanas"}],
 "encadenar":[{"de":12,"a":13,"tipo":"FC","retardo":-5,"porque":"entra por planta baja antes de terminar"}],
 "desencadenar":[{"de":8,"a":9,"porque":"dijo que no se traban"}],
 "reordenar":[{"id":15,"antes_de":14,"porque":"el montaje va antes de la entrega"}],
 "partir":[{"id":20,"nombre":"desmontaje eléctrico","dias":5,"peso":15,"primero":true,
            "porque":"lo nombró y no tiene barra propia"}],
 "nota":"lo que no pudiste traducir, o lo que haría falta para poder hacerlo"}

"partir" ES LO QUE USÁS CUANDO NOMBRA UN TRABAJO QUE NO TIENE BARRA.

Pasa seguido y es lo más útil que podés hacer: habla del "desmontaje de las
instalaciones eléctricas" o del "paso de tubería", y eso no es un rubro del
presupuesto ni tiene actividad propia —vive adentro del capítulo eléctrico—.
En vez de dejarlo afuera, PARTÍ esa barra: le agregás una parte con su nombre,
sus días y qué porcentaje de la plata del capítulo se lleva.

  "id" es la actividad que se parte. "nombre" el trabajo, en castellano de obra.
  "dias" cuánto lleva. "peso" qué % de la plata de esa agrupación se lleva
  —se le resta a la barra original, así que entre las dos siguen sumando 100—.
  "primero": true si va ANTES de lo que ya estaba (un desmontaje va antes),
  false si va después.

No inventes trabajos que no nombró. Partir es para darle lugar a algo que él
dijo y el cronograma no tiene.

Las listas son opcionales: mandá solo las que tengan algo.`;

  try {
    const { res, data } = await pedirANova({
      model: JUICIO, max_tokens: 6000,
      system: sistema,
      messages: [{ role: "user", content: "Traducí lo que te dictó. Solo JSON." }],
    });
    if (!res.ok || data?.error) return { error: data?.error?.message || "NOVA no pudo entenderlo." };
    const salida = textoDeNova(data);
    const { datos } = jsonTolerante(salida);
    if (!datos) {
      return { error: `NOVA devolvió algo que no se entiende. Empezaba así:\n\n${String(salida || "").slice(0, 220) || "(vacío)"}` };
    }
    const vivos = new Set(plan.map(a => a.id));
    const lim = (xs, ok) => (Array.isArray(xs) ? xs : []).filter(ok).slice(0, 40);
    return {
      ajustar: lim(datos.ajustar, x => vivos.has(Number(x.id)) && n(x.duracion) > 0)
        .map(x => ({ id: Number(x.id), duracion: Math.max(1, Math.round(n(x.duracion))), porque: x.porque || "" })),
      encadenar: lim(datos.encadenar, x => vivos.has(Number(x.de)) && vivos.has(Number(x.a)) && Number(x.de) !== Number(x.a))
        .map(x => ({ de: Number(x.de), a: Number(x.a), tipo: ["FC", "CC", "FF"].includes(x.tipo) ? x.tipo : "FC",
          retardo: Math.max(-365, Math.min(365, Math.round(n(x.retardo)))), porque: x.porque || "" })),
      desencadenar: lim(datos.desencadenar, x => vivos.has(Number(x.de)) && vivos.has(Number(x.a)))
        .map(x => ({ de: Number(x.de), a: Number(x.a), porque: x.porque || "" })),
      reordenar: lim(datos.reordenar, x => vivos.has(Number(x.id)) && vivos.has(Number(x.antes_de)))
        .map(x => ({ id: Number(x.id), antes_de: Number(x.antes_de), porque: x.porque || "" })),
      // Partir una barra para darle lugar a un trabajo que no tiene actividad
      // propia. No rompe el espejo con el control: la agrupación sigue siendo
      // la misma, lo que cambia es que adentro tiene dos momentos en vez de
      // uno. Es la única subdivisión permitida, y acá es donde hacía falta.
      partir: lim(datos.partir, x => vivos.has(Number(x.id)) && String(x.nombre || "").trim())
        .map(x => ({
          id: Number(x.id),
          nombre: String(x.nombre).trim().slice(0, 60),
          dias: Math.max(1, Math.round(n(x.dias)) || 3),
          peso: Math.min(95, Math.max(1, Math.round(n(x.peso)) || 10)),
          primero: x.primero !== false,
          porque: x.porque || "",
        })),
      // Largo de sobra: la nota es donde NOVA dice lo que NO pudo
      // traducir —"no hay barra para el desmontaje eléctrico"— y cortarla a la
      // mitad de una frase borra justo la parte que avisa de un problema.
      nota: String(datos.nota || "").slice(0, 1200),
    };
  } catch (e) {
    return { error: e.message };
  }
}
