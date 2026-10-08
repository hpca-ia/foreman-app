import { useState } from "react";
import { Link2, Trash2, CalendarClock, ChevronRight, ChevronDown, ChevronUp, Scissors, X, List, ArrowDown, ArrowRight } from "lucide-react";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import Numero from "../../components/ui/Numero";
import { ETAPAS } from "./cpm";
import { fmt } from "../controlObra/calculos";

// La tabla del cronograma: cómo se lee.
//
// Antes era una fila por actividad con tres controles apilados debajo del
// nombre —la etapa, su porcentaje, y una línea por dependencia con su tipo y
// su retardo—. Todo visible todo el tiempo. Eso no se lee: lo que uno viene a
// mirar a un cronograma es qué va cuándo, y estaba enterrado entre selectores.
//
// Dos cambios de fondo:
//
// AGRUPADO POR RUBRO. Una agrupación partida en etapas —se anticipa, se
// fabrica, se instala— son tres barras de la MISMA cosa, y sueltas en una
// lista plana no se entiende que lo sean. Ahora van juntas debajo de su rubro,
// con una barra fina arriba que muestra de punta a punta cuánto abarca. Así se
// lee de un vistazo lo que antes había que reconstruir leyendo nombres.
//
// LO QUE SE EDITA, APARTE. Se toca una actividad y abajo se abre su ficha: de
// qué depende, con qué traslape, en qué etapa va, qué parte de la plata lleva.
// La fila queda con lo que se mira —nombre, días, fechas, colchón, barra— y lo
// que se cambia de vez en cuando deja de ocupar lugar todo el tiempo.
//
// Y LAS DEPENDENCIAS SE DICEN EN CASTELLANO. "Fin → Comienzo" y "Comienzo →
// Comienzo" es el idioma de MS Project; en obra se dice "va después de la
// estructura" y "arranca cinco días antes de que termine". Es lo mismo y se
// entiende sin que nadie lo explique.

/** Cómo se dice una dependencia, en las palabras en que se piensa. */
export function fraseDep(d, nombre) {
  const r = Number(d?.retardo) || 0;
  const q = `«${nombre || "?"}»`;
  const dias = n => `${n} ${n === 1 ? "día" : "días"}`;
  if (d?.tipo === "CC") {
    if (r === 0) return `arranca junto con ${q}`;
    return r > 0 ? `arranca ${dias(r)} después que ${q}` : `arranca ${dias(-r)} antes que ${q}`;
  }
  if (d?.tipo === "FF") {
    if (r === 0) return `termina junto con ${q}`;
    return r > 0 ? `termina ${dias(r)} después que ${q}` : `termina ${dias(-r)} antes que ${q}`;
  }
  if (r === 0) return `va después de ${q}`;
  return r > 0
    ? `empieza ${dias(r)} después de que termine ${q}`
    : `empieza ${dias(-r)} antes de que termine ${q} — traslapadas`;
}

// Las tres maneras de encadenar, dichas como las dice un residente.
const MODOS = [
  { id: "FC", label: "va después de", pista: "Arranca cuando la otra termina. Es la normal." },
  { id: "CC", label: "arranca con", pista: "Las dos empiezan a la vez." },
  { id: "FF", label: "termina con", pista: "Las dos terminan a la vez." },
];

// Lo que queda del nombre después del rubro: "Eléctricas · cableado" → "cableado".
const sufijo = nombre => {
  const p = String(nombre || "").split(" · ");
  return p.length > 1 ? p.slice(1).join(" · ") : nombre;
};

const titulito = { fontSize: 9.5, fontWeight: 700, color: colors.muted, letterSpacing: 0.3, display: "block", marginBottom: 3 };

export default function TablaGantt({
  todas = [], dependencias = [], agrupaciones = [], plata = {},
  porId, cal, plan, escala, zoom, marcas = [], editable, conEtapas,
  uniendo, setUniendo, hoyISO, dia,
  onCambiar, onCambiarDep, onDesunir, onUnir, onQuitar, onPartir, onMoverRubro,
  rubros = [], sinSenalar, onSenalar, platas = null,
}) {
  const [abierta, setAbierta] = useState(null);
  const [plegados, setPlegados] = useState(() => new Set());
  // El grupo cuyo detalle de rubros está abierto. Uno por vez: son listas
  // largas y dos abiertas a la vez tapan el cronograma.
  const [verRubros, setVerRubros] = useState(null);

  // La columna del nombre es la que se lee, así que es la que manda. Con 190
  // no entraba el nombre del rubro al lado del aviso de qué falta, y el nombre
  // se cortaba en "ILU…" — que es justo lo que uno necesita leer.
  // EMPIEZA y TERMINA se escriben, así que necesitan ancho de campo de fecha.
  // Los botones de la fila van ADENTRO del bloque fijo. Estaban al final de
  // todo, después del lienzo: en un cronograma de ocho meses eso son dos mil
  // píxeles a la derecha, así que para partir una actividad había que
  // desplazar hasta el final, apretar, y volver.
  const COLS = "minmax(230px,1fr) 54px 112px 112px 52px 68px";
  const IZQ = 230 + 54 + 112 + 112 + 52 + 68 + 5 * 7 + 12;
  const diasTotales = Math.max(1, cal.entre(plan.inicio, plan.fin));
  const anchoLienzo = Math.max(320, Math.round(diasTotales * zoom));
  const posicion = f => (f ? (cal.entre(plan.inicio, f) - 1) / diasTotales : 0);
  const largo = a => (a.inicio && a.fin ? Math.max(cal.entre(a.inicio, a.fin), 1) / diasTotales : 0);
  const dentro = hoyISO >= plan.inicio && hoyISO <= plan.fin;

  // ── Armar los grupos ─────────────────────────────────────────────────────
  //
  // El orden de los grupos es el de la obra: el que arranca antes va antes.
  // Ordenarlos por el orden del presupuesto los dejaría bailando contra las
  // barras, que es justamente lo que uno viene a mirar.
  const datosAg = new Map(agrupaciones.map(g => [g.id, g]));
  const grupos = [];
  const porAg = new Map();
  todas.forEach(a => {
    const k = a.obra_actividad_id || 0;
    if (!porAg.has(k)) porAg.set(k, []);
    porAg.get(k).push(a);
  });
  porAg.forEach((hijas, k) => {
    const ordenadas = [...hijas].sort((x, y) => String(x.inicio || "").localeCompare(String(y.inicio || "")));
    const inicios = ordenadas.map(a => a.inicio).filter(Boolean);
    const fines = ordenadas.map(a => a.fin).filter(Boolean);
    const g = k ? datosAg.get(k) : null;
    grupos.push({
      id: k,
      nombre: k ? (g?.nombre || "Agrupación borrada") : "Sin agrupación",
      codigo: g?.codigo || "",
      // De qué capítulo del presupuesto sale. Cuando cruza varios se dice así
      // y no se elige uno: una agrupación que cruza capítulos lo hace a
      // propósito, y nombrar uno solo sería decir algo falso.
      capitulo: g?.capitulo || (g?.capitulos > 1 ? `${g.capitulos} capítulos` : ""),
      // Lo más bajo que tenga alguna de sus barras: es el orden del
      // cronograma, no el del presupuesto.
      posicion: Math.min(...hijas.map(a => a.orden ?? 0)),
      hijas: ordenadas,
      monto: k ? (plata[k] || 0) : 0,
      inicio: inicios.length ? inicios.sort()[0] : null,
      fin: fines.length ? fines.sort()[fines.length - 1] : null,
      critica: ordenadas.some(a => a.critica),
      // Un rubro con una sola barra no es un grupo: mostrarle un encabezado y
      // una sola hija debajo es duplicar la misma línea.
      simple: ordenadas.length === 1,
    });
  });
  // EN EL ORDEN DEL CRONOGRAMA, no por fecha de arranque.
  //
  // Ordenarlos por cuándo empiezan parece lo natural en un Gantt y es un
  // error: el orden lo puso la oficina —primero el del control de obra, y
  // después el que alguien acomodó según cómo se trabaja— y reordenarlo solo
  // cada vez que cambia una duración hace que las filas salten de lugar
  // mientras uno las está editando.
  grupos.sort((a, b) => {
    // Las sueltas al final: no son de ningún rubro y arriba estorban.
    if (!a.id !== !b.id) return a.id ? -1 : 1;
    return a.posicion - b.posicion;
  });

  // Los rubros de cada grupo, para poder abrirlos y señalar el que traba.
  const rubrosDe = new Map();
  rubros.forEach(r => {
    const k = r.actividad_id || 0;
    if (!rubrosDe.has(k)) rubrosDe.set(k, []);
    rubrosDe.get(k).push(r);
  });

  const plegar = id => setPlegados(s => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  // Las piezas de la tabla viven FUERA del componente, abajo.
  //
  // Definidas acá adentro serían un tipo de componente nuevo en cada render, y
  // React desmonta y vuelve a montar lo que cambia de tipo: el campo de la
  // nota perdería el foco a la primera tecla, y los inputs se vaciarían solos.
  // Es el mismo defecto que hacía que no se pudieran escribir los números, por
  // otro camino.
  const ui = { COLS, IZQ, anchoLienzo, posicion, largo, dentro, hoyISO, dia, verRubros, setVerRubros };

  return (
    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, overflowX: "auto" }}>
      {/* Encabezado */}
      <div style={{ display: "grid", gridTemplateColumns: `${IZQ}px ${anchoLienzo}px`, gap: 7,
        padding: "8px 12px 8px 0", background: colors.bg, fontSize: 9, fontWeight: 700, color: colors.muted,
        letterSpacing: 0.3, width: "max-content", minWidth: "100%" }}>
        <span style={{ display: "grid", gridTemplateColumns: COLS, gap: 7, position: "sticky", left: 0, zIndex: 3,
          background: colors.bg, paddingLeft: 12, boxSizing: "border-box", borderRight: `1px solid ${colors.border}` }}>
          <span>ACTIVIDAD</span>
          <span style={{ textAlign: "center" }}>DÍAS</span>
          <span>EMPIEZA</span>
          <span>TERMINA</span>
          <span style={{ textAlign: "center" }}>COLCHÓN</span>
          <span />
        </span>
        <span style={{ position: "relative", height: 12 }}>
          {marcas.map((m, k) => (
            <span key={k} style={{ position: "absolute", left: `${m.x * 100}%`,
              transform: k === 0 ? "translateX(0)" : m.x > 0.97 ? "translateX(-100%)" : "translateX(-50%)",
              fontSize: 8.5, color: m.dia === 1 ? colors.brand : colors.muted, whiteSpace: "nowrap",
              fontWeight: m.dia === 1 ? 700 : 400 }}>
              {escala === "fecha" ? dia(m.fecha) : (m.dia > 0 ? `d${m.dia}` : m.dia === 0 ? "" : `${m.dia}`)}
            </span>
          ))}
        </span>
        <span />
      </div>

      {grupos.map(g => {
        const plegado = plegados.has(g.id);
        const misRubros = rubrosDe.get(g.id) || [];
        const senalados = misRubros.filter(r => r.crono_senalado);
        // El aviso de reparto es solo para las barras que van por porcentaje.
        // Las que tienen sus rubros asignados no reparten nada: su plata es la
        // suma de lo que llevan adentro, y por construcción las partes suman
        // el capítulo. Avisar ahí sería avisar de un problema que no existe.

        return (
          <div key={g.id}>
            {/* El rubro. Solo cuando de verdad agrupa algo. */}
            {!g.simple && (
              <Fila ui={ui} fondo={colors.bg}>
                <Fijo ui={ui} fondo={colors.bg}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                    <button onClick={() => plegar(g.id)} title={plegado ? "Mostrar sus etapas" : "Plegar"}
                      style={{ background: "none", border: "none", cursor: "pointer", color: colors.muted, display: "flex", padding: 0 }}>
                      {plegado ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                    </button>
                    {/* El nombre manda. Con `flex: 1` y los avisos al lado sin
                        poder encogerse, se quedaba en cero píxeles y el rubro
                        salía sin nombre — el dato por el que uno mira la fila.
                        Un piso de 84px: antes se recorta el aviso. */}
                    <span style={{ minWidth: 84, flex: "1 1 auto", overflow: "hidden" }}>
                      <span style={{ display: "block", fontWeight: 700, color: colors.ink, overflow: "hidden",
                        textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.25 }}>
                        {g.codigo && <span style={{ color: colors.muted, fontWeight: 600 }}>{g.codigo} </span>}
                        {g.nombre}
                      </span>
                      {/* De qué capítulo sale, debajo. El nombre de una
                          agrupación dice qué es; el capítulo, de dónde viene
                          en el presupuesto, que es como se la busca. */}
                      <span title={[g.capitulo, g.hijas.length > 1 ? `${g.hijas.length} partes` : "",
                        g.monto > 0 ? fmt(g.monto) : ""].filter(Boolean).join(" · ")}
                        style={{ display: "block", fontSize: 10.5, color: colors.inkSoft, overflow: "hidden",
                        textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 400, letterSpacing: 0.2 }}>
                        {g.capitulo || <span style={{ color: colors.muted }}>sin capítulo</span>}
                        {g.hijas.length > 1 ? ` · ${g.hijas.length} partes` : ""}
                        {g.monto > 0 ? ` · ${fmt(g.monto)}` : ""}
                        {/* Lo que falta, en la segunda línea: arriba competía
                            por el ancho con el nombre del rubro y lo dejaba en
                            "Instalacione…", que es peor que no decirlo. */}
                        {senalados.length > 0 && (
                          <span title={senalados.map(r => `${r.descripcion}${r.crono_nota ? ` — ${r.crono_nota}` : ""}`).join("\n")}
                            style={{ color: colors.warning, fontWeight: 700 }}>
                            {" "}· falta {senalados.length === 1 ? senalados[0].descripcion : `${senalados.length} rubros`}
                          </span>
                        )}
                      </span>
                    </span>
                    <Senal ui={ui} g={g} senalados={senalados} misRubros={misRubros} />
                    {editable && onMoverRubro && (
                      <span style={{ display: "flex", flexDirection: "column", flexShrink: 0 }}>
                        <button onClick={() => onMoverRubro(g.id, -1)} title="Subirlo"
                          style={{ background: "none", border: "none", cursor: "pointer", color: colors.muted, display: "flex", padding: 0, height: 11 }}>
                          <ChevronUp size={11} />
                        </button>
                        <button onClick={() => onMoverRubro(g.id, 1)} title="Bajarlo"
                          style={{ background: "none", border: "none", cursor: "pointer", color: colors.muted, display: "flex", padding: 0, height: 11 }}>
                          <ChevronDown size={11} />
                        </button>
                      </span>
                    )}

                    {/* Acá vivía el aviso de "reparten 90% · cuadrar", y se
                        fue porque el problema que anunciaba ya no existe: el
                        reparto se normaliza, así que unos pesos que suman 90
                        reparten igual TODO el dinero del rubro, en esa
                        proporción. No hay plata que se pierda y no hay nada
                        que cuadrar a mano. Un aviso de un problema resuelto es
                        ruido, y el ruido es lo que hace que los demás avisos
                        dejen de leerse. */}

                  </div>
                  <span title="De la primera etapa a la última, incluido lo que pasa en el medio sin trabajo en obra"
                    style={{ textAlign: "center", fontSize: 10.5, color: colors.muted }}>
                    {g.inicio && g.fin ? cal.entre(g.inicio, g.fin) : "—"}
                  </span>
                  {/* Las del rubro no se escriben: salen de sus etapas. */}
                  <span style={{ fontSize: 11, color: colors.inkSoft }}>{dia(g.inicio)}</span>
                  <span style={{ fontSize: 11, color: colors.inkSoft }}>{dia(g.fin)}</span>
                  {/* El colchón de un rubro no es un número: cada etapa tiene
                      el suyo y sumarlos no querría decir nada. */}
                  <span />
                  <span />
                </Fijo>
                {/* La barra del rubro de punta a punta: lo que se importa en
                    marzo y se instala en agosto es UNA cosa que abarca medio
                    año, y eso no se ve mirando tres barras sueltas. */}
                <Lienzo ui={ui}>
                  {g.inicio && (
                    <div title={`${g.nombre}: del ${dia(g.inicio)} al ${dia(g.fin)}`}
                      style={{ position: "absolute", top: 6, bottom: 6,
                        left: `${posicion(g.inicio) * 100}%`,
                        width: `${Math.max((cal.entre(g.inicio, g.fin) / diasTotales) * 100, 0.6)}%`,
                        background: colors.neutralSoft, borderRadius: 3,
                        borderLeft: `2px solid ${colors.border}`, borderRight: `2px solid ${colors.border}` }} />
                  )}
                  {g.hijas.map(a => <Barra key={a.id} ui={ui} a={a} tenue />)}
                </Lienzo>
              </Fila>
            )}

            {/* Las actividades */}
            {(!plegado || g.simple) && g.hijas.map(a => {
              const deps = dependencias.filter(d => d.actividad_id === a.id);
              const esta = abierta === a.id;
              const etapa = a.etapa && a.etapa !== "ejecucion" ? ETAPAS[a.etapa] : null;
              return (
                <div key={a.id}>
                  <Fila ui={ui} fondo={esta ? colors.brandSoft : undefined}>
                    <Fijo ui={ui} fondo={esta ? colors.brandSoft : undefined}>
                      <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 5, paddingLeft: g.simple ? 0 : 18 }}>
                        {a.critica && <span title="Ruta crítica: no tiene colchón" style={{ color: colors.danger, flexShrink: 0 }}>●</span>}
                        {/* EL CAPÍTULO VA EN TODA FILA, no solo en el
                            encabezado de los rubros partidos en etapas.
                            La mayoría de las agrupaciones son una sola barra y
                            no tienen encabezado, así que salían peladas: el
                            nombre y nada más. Por eso "no traía los capítulos"
                            — los traía, y no los mostraba donde se miran. */}
                        <button onClick={() => setAbierta(esta ? null : a.id)}
                          title="Ver y cambiar de qué depende, su etapa y su fecha"
                          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: colors.font,
                            textAlign: "left", flex: "1 1 auto", minWidth: 40, overflow: "hidden" }}>
                          <span style={{ display: "block", fontSize: 12, color: colors.ink, fontWeight: g.simple ? 600 : 400,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.25 }}>
                            {g.simple && g.codigo && <span style={{ color: colors.muted, fontWeight: 600 }}>{g.codigo} </span>}
                            {/* Adentro de un rubro alcanza con el nombre de la
                                parte: el encabezado de arriba ya dijo de qué
                                rubro es, y repetirlo en cada fila lo empuja
                                fuera de la columna —"Instalaciones elé…" en
                                las tres, sin poder distinguirlas—. */}
                            {g.simple ? a.nombre : (etapa || sufijo(a.nombre))}
                          </span>
                          {/* El capítulo, legible. Estaba en 9px y en gris
                              claro: técnicamente visible, que no es lo mismo
                              que leerse. Es el dato con el que uno busca un
                              rubro, así que tiene que poder leerse de un
                              vistazo. */}
                          {g.simple && (
                            <span style={{ display: "block", fontSize: 10.5, color: colors.inkSoft, overflow: "hidden",
                              textOverflow: "ellipsis", whiteSpace: "nowrap", letterSpacing: 0.2 }}>
                              {g.capitulo || <span style={{ color: colors.muted }}>sin capítulo</span>}
                              {!deps.length && (
                                <span title="No depende de nada, así que arranca el día uno. Si tiene que ir después de algo, encadenala."
                                  style={{ color: colors.warning, fontWeight: 600 }}> · arranca el día 1</span>
                              )}
                            </span>
                          )}
                        </button>
                        {/* EL PORCENTAJE NO SE MUESTRA ACÁ.
                            Un cronograma habla de tiempo. "40%" es plata, y
                            puesto en una fila de barras obliga a cambiar de
                            idioma para leer una línea. La plata se mira en el
                            valorado, que es la misma información dicha en
                            dinero.
                            Lo que sí dice algo del alcance de la barra es
                            cuántos rubros lleva adentro: eso no es plata, es
                            de qué está hecha. */}
                        {!g.simple && platas?.asignados?.get(a.id) > 0 && (
                          <span title="Los rubros del capítulo que van en esta parte"
                            style={{ fontSize: 9.5, color: colors.muted, flexShrink: 0 }}>
                            {platas.asignados.get(a.id)} {platas.asignados.get(a.id) === 1 ? "rubro" : "rubros"}
                          </span>
                        )}
                        {deps.length > 0 && (
                          <span title={deps.map(d => fraseDep(d, porId.get(d.depende_de_id)?.nombre)).join(" · ")}
                            style={{ fontSize: 9.5, color: colors.muted, flexShrink: 0 }}>
                            ↳{deps.length > 1 ? ` ${deps.length}` : ""}
                          </span>
                        )}
                        {a.inicio_fijo && (
                          <span title={`Empieza fijo el ${dia(a.inicio_fijo)}`} style={{ color: colors.brand, display: "flex", flexShrink: 0 }}>
                            <CalendarClock size={10} />
                          </span>
                        )}
                        {g.simple && <Senal ui={ui} g={g} senalados={senalados} misRubros={misRubros} />}
                      </div>
                      <Numero value={a.duracion} min={1} max={2000} disabled={!editable}
                        onCommit={v => onCambiar(a, { duracion: v })}
                        title="Días hábiles. Enter para guardar."
                        style={{ padding: "4px 6px", fontSize: 11.5, textAlign: "center" }} />
                      {/* LAS TRES SE ESCRIBEN, y las tres dicen lo mismo.
                          Una duración en días es lo que uno sabe cuando
                          estima; una fecha de fin es lo que uno sabe cuando la
                          comprometió —"esto tiene que estar el 15 de
                          diciembre"—. Obligar a convertir una en otra a mano es
                          pedir una cuenta de días hábiles, con feriados, que
                          nadie quiere hacer y que es justo lo que esta pantalla
                          ya sabe hacer. */}
                      {editable ? (
                        <input type="date" value={a.inicio_fijo || a.inicio || ""}
                          title={a.inicio_fijo
                            ? "Arranca fijo este día. Vaciá el campo para que lo calcule el cronograma."
                            : "Lo calcula el cronograma por sus dependencias. Si escribís una fecha, no arranca antes de ese día."}
                          onChange={e => onCambiar(a, { inicio_fijo: e.target.value || null })}
                          style={{ ...inputStyle, padding: "3px 5px", fontSize: 11, height: 25,
                            color: a.inicio_fijo ? colors.brand : colors.inkSoft,
                            fontWeight: a.inicio_fijo ? 600 : 400 }} />
                      ) : <span style={{ color: colors.inkSoft, fontSize: 11.5 }}>{dia(a.inicio)}</span>}
                      {editable ? (
                        <input type="date" value={a.fin || ""}
                          title="Escribí hasta cuándo va y la duración se calcula sola, contando solo días de trabajo."
                          onChange={e => {
                            const hasta = e.target.value;
                            if (!hasta || !a.inicio) return;
                            // Los días hábiles entre su arranque y esa fecha.
                            // Si la ponen antes del arranque queda en uno: una
                            // actividad de cero días no existe.
                            const d = hasta < a.inicio ? 1 : Math.max(1, cal.entre(a.inicio, hasta));
                            if (d !== a.duracion) onCambiar(a, { duracion: d });
                          }}
                          style={{ ...inputStyle, padding: "3px 5px", fontSize: 11, height: 25, color: colors.inkSoft }} />
                      ) : <span style={{ color: colors.inkSoft, fontSize: 11.5 }}>{dia(a.fin)}</span>}
                      <span style={{ textAlign: "center", fontSize: 11.5, fontWeight: a.critica ? 700 : 400,
                        color: a.critica ? colors.danger : colors.muted }}>
                        {a.enCiclo ? "—" : a.critica ? "0" : `${a.holgura}d`}
                      </span>
                    {editable ? (
                      <div style={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
                      {/* PARTIR, A LA VISTA.
                          NOVA parte sola lo que se importa —anticipo,
                          fabricación, instalación— y hacerlo a mano estaba
                          escondido adentro de la ficha: había que tocar el
                          nombre, leer, y recién ahí encontrarlo. Lo que el
                          programa hace solo, uno tiene que poder hacerlo
                          igual de fácil. */}
                      {/* "A LA VEZ" EN UN CLIC.
                          Poner dos cosas en paralelo era lo más difícil de
                          armar a mano: había que abrir la ficha, encontrar el
                          campo del retardo y escribir un número NEGATIVO —que
                          hay que explicar antes de que signifique algo—.
                          En obra no se piensa en retardos negativos: se piensa
                          "esto va al mismo tiempo que aquello". Este botón
                          cambia entre las dos y no hay nada más que entender.
                          Solo cuando depende de UNA cosa: con dos o más, cuál
                          va en paralelo es una decisión y se toma en la ficha. */}
                      {deps.length === 1 && (
                        <button onClick={() => onCambiarDep(deps[0], {
                          tipo: deps[0].tipo === "CC" ? "FC" : "CC", retardo: 0,
                        })}
                          title={deps[0].tipo === "CC"
                            ? `Va al mismo tiempo que «${porId.get(deps[0].depende_de_id)?.nombre}». Tocá para que vaya después.`
                            : `Va después de «${porId.get(deps[0].depende_de_id)?.nombre}». Tocá para que vayan a la vez.`}
                          style={{ background: deps[0].tipo === "CC" ? colors.brandSoft : "none", border: "none",
                            color: deps[0].tipo === "CC" ? colors.brand : colors.muted, borderRadius: 4,
                            cursor: "pointer", display: "flex", padding: 2 }}>
                          {deps[0].tipo === "CC" ? <ArrowRight size={12} /> : <ArrowDown size={12} />}
                        </button>
                      )}
                      {conEtapas && (
                        <button onClick={() => onPartir(a)}
                          title="Partirla: entra varias veces a la obra, o se compra y se instala"
                          style={{ background: "none", border: "none", color: colors.muted, borderRadius: 4,
                            cursor: "pointer", display: "flex", padding: 2 }}>
                          <Scissors size={12} />
                        </button>
                      )}
                      <button onClick={() => (uniendo ? onUnir(uniendo, a.id) : setUniendo(a.id))}
                        title={uniendo === a.id ? "Elegí ahora la que va después" : uniendo ? "Esta va después de la marcada" : "Encadenar: marcá ésta y después la que va detrás"}
                        style={{ background: uniendo === a.id ? colors.brand : "none", border: "none",
                          color: uniendo === a.id ? "#fff" : colors.muted, borderRadius: 4, cursor: "pointer", display: "flex", padding: 2 }}>
                        <Link2 size={12} />
                      </button>
                      </div>
                    ) : <span />}
                    </Fijo>
                    <Lienzo ui={ui}><Barra ui={ui} a={a} /></Lienzo>
                  </Fila>

                  {/* LA FICHA. Todo lo que se cambia de vez en cuando vive acá
                      y no en la fila, que es lo que la volvía ilegible. */}
                  {esta && (
                    // La banda ocupa todo el ancho de la tabla y el contenido
                    // se queda pegado a la izquierda: si no, al correr el
                    // cronograma la ficha se iba de la pantalla, y queda un
                    // corte a mitad de la fila que parece un error de dibujo.
                    <div style={{ width: "max-content", minWidth: "100%", background: colors.brandSoft,
                      borderTop: `1px solid ${colors.border}` }}>
                    <div style={{ position: "sticky", left: 0, width: "min(820px, calc(100vw - 150px))",
                      padding: "11px 13px", display: "grid", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <strong style={{ fontSize: 13, color: colors.ink, flex: 1 }}>{a.nombre}</strong>
                        <button onClick={() => setAbierta(null)} style={{ background: "none", border: "none", cursor: "pointer", color: colors.muted, display: "flex" }}>
                          <X size={14} />
                        </button>
                      </div>

                      {/* De qué depende */}
                      <div>
                        <label style={titulito}>DE QUÉ DEPENDE</label>
                        {!deps.length && (
                          <div style={{ fontSize: 11.5, color: colors.muted }}>
                            De nada: arranca el día uno. Para encadenarla, tocá el eslabón de la que va antes y después el de ésta.
                          </div>
                        )}
                        {deps.map(d => {
                          const r = Number(d.retardo) || 0;
                          return (
                            <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", marginBottom: 5 }}>
                              {editable ? (
                                <>
                                  <select value={d.tipo || "FC"} onChange={e => onCambiarDep(d, { tipo: e.target.value })}
                                    title={MODOS.find(m => m.id === (d.tipo || "FC"))?.pista}
                                    style={{ ...inputStyle, width: "auto", padding: "3px 5px", fontSize: 11, height: 24 }}>
                                    {MODOS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                                  </select>
                                  <span style={{ fontSize: 11.5, color: colors.ink, maxWidth: 190, overflow: "hidden",
                                    textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {porId.get(d.depende_de_id)?.nombre || "?"}
                                  </span>
                                  <Numero value={r} min={-365} max={365}
                                    onCommit={v => onCambiarDep(d, { retardo: v })}
                                    title="En negativo se traslapan: ésta arranca antes de que la otra termine."
                                    style={{ width: 52, padding: "3px 5px", fontSize: 11, height: 24, textAlign: "center" }} />
                                  <span style={{ fontSize: 11, color: r < 0 ? colors.brand : colors.muted, fontWeight: r < 0 ? 700 : 400 }}>
                                    {r < 0 ? "días de traslape" : r > 0 ? "días de espera" : "días"}
                                  </span>
                                  <button onClick={() => onDesunir(d)} title="Quitar"
                                    style={{ background: "none", border: "none", color: colors.border, cursor: "pointer", padding: "0 3px" }}>×</button>
                                </>
                              ) : (
                                <span style={{ fontSize: 11.5, color: colors.inkSoft }}>
                                  {fraseDep(d, porId.get(d.depende_de_id)?.nombre)}
                                </span>
                              )}
                            </div>
                          );
                        })}
                        {deps.length > 0 && (
                          <div style={{ fontSize: 10.5, color: colors.muted, lineHeight: 1.5, marginTop: 2 }}>
                            {/* Dicho en palabras abajo del control: es la
                                comprobación de que uno puso lo que quería. */}
                            {deps.map(d => fraseDep(d, porId.get(d.depende_de_id)?.nombre)).join(" · ")}
                          </div>
                        )}
                      </div>

                      {editable && (
                        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
                          {/* Etapa y plata */}
                          {conEtapas && (
                            <div>
                              <label style={titulito}>QUÉ MOMENTO ES</label>
                              <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                                <select value={a.etapa || "ejecucion"} onChange={e => onCambiar(a, { etapa: e.target.value })}
                                  style={{ ...inputStyle, width: "auto", padding: "4px 6px", fontSize: 11.5, height: 27 }}>
                                  {Object.entries(ETAPAS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                                </select>
                                {a.obra_actividad_id && (
                                  <>
                                    <Numero value={a.peso_pct ?? 100} min={0} max={100} entero={false}
                                      onCommit={v => onCambiar(a, { peso_pct: v })}
                                      title="Qué parte de la plata del rubro se paga en este momento"
                                      style={{ width: 54, padding: "4px 6px", fontSize: 11.5, height: 27, textAlign: "center" }} />
                                    <span style={{ fontSize: 11, color: colors.muted }}>% de la plata del rubro</span>
                                  </>
                                )}
                              </div>
                            </div>
                          )}

                          <div>
                            <label style={titulito}>EMPIEZA FIJO EL</label>
                            <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                              <input type="date" value={a.inicio_fijo || ""}
                                onChange={e => onCambiar(a, { inicio_fijo: e.target.value || null })}
                                title="Para lo que pasa antes del día uno: permisos, anticipos, importaciones."
                                style={{ ...inputStyle, width: 148, padding: "4px 6px", fontSize: 11.5 }} />
                              {a.inicio_fijo && (
                                <button onClick={() => onCambiar(a, { inicio_fijo: null })} title="Que la calcule el cronograma"
                                  style={{ background: "none", border: "none", color: colors.muted, cursor: "pointer", fontSize: 11 }}>soltar</button>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* QUÉ SE HACE ADENTRO DE ESTA BARRA, y no es un rubro.
                          El presupuesto cobra "montaje de estructura"; adentro
                          hay replanteo, izaje, torque de pernos y pruebas. Nada
                          de eso es un rubro y es exactamente lo que se programa
                          y se supervisa — hoy vive en la cabeza del residente, y
                          por eso el plan semanal arranca en blanco todas las
                          semanas. De acá sale. */}
                      <div style={{ marginTop: 10, paddingTop: 9, borderTop: `1px solid ${colors.neutralSoft}` }}>
                        <label style={titulito}>QUÉ SE HACE ADENTRO</label>
                        {(a.incluye || []).length === 0 && !editable && (
                          <div style={{ fontSize: 11, color: colors.muted }}>—</div>
                        )}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 3 }}>
                          {(a.incluye || []).map((t, k) => (
                            <span key={`${t}-${k}`}
                              style={{ display: "inline-flex", alignItems: "center", gap: 5,
                                border: `1px solid ${colors.border}`, borderRadius: 20, padding: "2px 5px 2px 10px",
                                fontSize: 11, color: colors.inkSoft, background: "#fff" }}>
                              {t}
                              {editable && (
                                <button title="Quitar"
                                  onClick={() => onCambiar(a, { incluye: (a.incluye || []).filter((_, i2) => i2 !== k) })}
                                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0,
                                    color: colors.border, display: "flex" }}>
                                  <X size={11} />
                                </button>
                              )}
                            </span>
                          ))}
                          {editable && (
                            <input placeholder="+ agregar un trabajo y Enter"
                              onKeyDown={e => {
                                if (e.key !== "Enter") return;
                                const t = e.target.value.trim();
                                if (!t) return;
                                onCambiar(a, { incluye: [...(a.incluye || []), t.slice(0, 80)] });
                                e.target.value = "";
                              }}
                              style={{ ...inputStyle, width: 220, padding: "3px 9px", fontSize: 11 }} />
                          )}
                        </div>
                        {editable && (
                          <div style={{ fontSize: 10, color: colors.muted, marginTop: 4, lineHeight: 1.45 }}>
                            Lo que se ejecuta adentro y no es rubro del presupuesto: replanteo, pruebas, curado.
                            De acá arranca el plan semanal en vez de la hoja en blanco.
                          </div>
                        )}
                      </div>

                      {editable && (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                          {conEtapas && (
                            <Button variant="outline" size="sm" onClick={() => onPartir(a)}>
                              <Scissors size={12} /> Partir en etapas
                            </Button>
                          )}
                          <Button variant="secondary" size="sm" onClick={() => { setAbierta(null); onQuitar(a); }}>
                            <Trash2 size={12} /> Borrar
                          </Button>
                          <span style={{ fontSize: 10.5, color: colors.muted, flex: 1, minWidth: 180 }}>
                            Lo que se importa o se fabrica se parte: el anticipo ahora, la fabricación después, la
                            instalación al final. Cada etapa con su parte de la plata.
                          </span>
                        </div>
                      )}
                    </div>
                    </div>
                  )}
                </div>
              );
            })}
            {/* LOS RUBROS DEL GRUPO.
                El grupo existe para no leer cuarenta modelos de lámpara uno
                por uno, y eso está bien el 95% del tiempo. Pero cuando el
                grupo se atrasa hay que poder abrirlo, ver qué contiene y
                señalar el que está trabando — sin sacarlo del grupo: el
                cronograma trae exclusivamente las agrupaciones del control de
                obra, y una barra de rubro rompería esa correspondencia. */}
            {verRubros === g.id && (
              <div style={{ width: "max-content", minWidth: "100%", background: colors.bg,
                borderTop: `1px solid ${colors.neutralSoft}` }}>
                <div style={{ position: "sticky", left: 0, width: "min(820px, calc(100vw - 150px))", padding: "10px 13px" }}>
                  <div style={{ fontSize: 11, color: colors.muted, lineHeight: 1.5, marginBottom: 7 }}>
                    Los <strong style={{ color: colors.inkSoft }}>{misRubros.length} rubros</strong> de {g.nombre}.
                    {g.hijas.length > 1 && <> Decí <strong style={{ color: colors.inkSoft }}>en qué parte va cada uno</strong>:
                      la plata de cada barra pasa a ser la suma de sus rubros, en vez de un porcentaje. Las fechas y las
                      dependencias siguen siendo de la barra — un rubro no se encadena, se encadena la barra donde va.</>}
                    {" "}Y señalá el que esté trabando al grupo: el cronograma deja de decir que falta todo el rubro y
                    pasa a decir qué falta. {sinSenalar && <span style={{ color: colors.warning }}>Falta correr la migración 085.</span>}
                  </div>
                  <div style={{ maxHeight: 240, overflowY: "auto", display: "grid", gap: 3 }}>
                    {misRubros.map(r => (
                      <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 8px",
                        borderRadius: 7, background: r.crono_senalado ? colors.warningSoft : colors.surface,
                        border: `1px solid ${r.crono_senalado ? colors.warningBorder : colors.neutralSoft}` }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: editable && !sinSenalar ? "pointer" : "default", minWidth: 0, flex: 1 }}>
                          <input type="checkbox" checked={!!r.crono_senalado} disabled={!editable || sinSenalar}
                            onChange={e => onSenalar(r, { crono_senalado: e.target.checked })} />
                          <span style={{ fontSize: 11.5, color: r.crono_senalado ? colors.ink : colors.inkSoft,
                            fontWeight: r.crono_senalado ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {r.codigo || r.numero ? <span style={{ color: colors.muted }}>{r.codigo || r.numero} </span> : null}
                            {r.descripcion}
                          </span>
                        </label>
                        {/* Por qué falta. Un pendiente sin motivo obliga a
                            preguntar, que es justo lo que esto viene a evitar. */}
                        {/* A QUÉ PARTE VA ESTE RUBRO.
                            Solo cuando el capítulo está partido: con una sola
                            barra no hay nada que elegir. Y el rubro no lleva
                            fechas ni dependencias propias —eso es de la barra—:
                            acá solo se dice en cuál de las barras va su plata. */}
                        {g.hijas.length > 1 && editable && (
                          <select value={r.crono_actividad_id || ""}
                            onChange={e => onSenalar(r, { crono_actividad_id: e.target.value ? Number(e.target.value) : null })}
                            title="En qué parte del capítulo va este rubro. Su plata se suma a esa barra."
                            style={{ ...inputStyle, width: "auto", maxWidth: 190, padding: "2px 5px", fontSize: 10.5, height: 22 }}>
                            <option value="">— repartido por porcentaje —</option>
                            {g.hijas.map(h => (
                              <option key={h.id} value={h.id}>
                                {(h.etapa && h.etapa !== "ejecucion" ? ETAPAS[h.etapa] : h.nombre.split(" · ").slice(1).join(" · ") || h.nombre).slice(0, 34)}
                              </option>
                            ))}
                          </select>
                        )}
                        {r.crono_senalado && editable && (
                          <input defaultValue={r.crono_nota || ""} placeholder="¿por qué falta? ej: llega en el embarque de noviembre"
                            onBlur={e => { if ((e.target.value || "") !== (r.crono_nota || "")) onSenalar(r, { crono_nota: e.target.value || null }); }}
                            style={{ ...inputStyle, flex: 1, minWidth: 180, maxWidth: 320, padding: "3px 7px", fontSize: 11 }} />
                        )}
                        {!r.crono_senalado && (
                          <span style={{ fontSize: 10.5, color: colors.muted, flexShrink: 0 }}>{fmt(r.total_base)}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Las piezas de la tabla ──────────────────────────────────────────────────

const Fila = ({ ui, children, fondo }) => (
  <div style={{ display: "grid", gridTemplateColumns: `${ui.IZQ}px ${ui.anchoLienzo}px`, gap: 7,
    padding: "7px 12px 7px 0", borderTop: `1px solid ${colors.neutralSoft}`, alignItems: "center",
    fontSize: 12, width: "max-content", minWidth: "100%", background: fondo || "transparent" }}>
    {children}
  </div>
);

// La columna que se queda quieta mientras el cronograma corre al costado.
// Por encima de todo lo que vive en el lienzo —barras, regla, la línea de
// hoy—: lo que asome por su borde se lee como un error de dibujo.
const Fijo = ({ ui, children, fondo }) => (
  <div style={{ display: "grid", gridTemplateColumns: ui.COLS, gap: 7, alignItems: "center",
    position: "sticky", left: 0, zIndex: 4, background: fondo || colors.surface,
    paddingLeft: 12, boxSizing: "border-box", borderRight: `1px solid ${colors.border}` }}>
    {children}
  </div>
);

const Lienzo = ({ ui, children }) => (
  <div style={{ position: "relative", height: 16 }}>
    {ui.dentro && (
      // Dentro de su fila y no desbordando arriba y abajo: lo que sobresale se
      // escapa por el filo de la columna fija y aparece como dos puntos rojos
      // sueltos sobre las fechas.
      <div style={{ position: "absolute", top: 0, bottom: 0, left: `${ui.posicion(ui.hoyISO) * 100}%`,
        width: 2, background: colors.danger, opacity: 0.75, zIndex: 1 }} />
    )}
    {children}
  </div>
);

const Barra = ({ ui, a, tenue }) => a.inicio && (
  <div title={`${ui.dia(a.inicio)} → ${ui.dia(a.fin)}${a.critica ? " · ruta crítica" : ` · ${a.holgura} días de colchón`}`}
    style={{ position: "absolute", top: tenue ? 5 : 0, bottom: tenue ? 5 : 0,
      left: `${ui.posicion(a.inicio) * 100}%`, width: `${Math.max(ui.largo(a) * 100, 0.6)}%`,
      background: a.critica ? colors.danger : colors.brand, borderRadius: 4,
      opacity: tenue ? 0.3 : 1, display: "flex", alignItems: "center", overflow: "hidden" }}>
    {!tenue && a.avance_pct > 0 && (
      <div style={{ width: `${Math.min(100, a.avance_pct)}%`, height: "100%", background: "rgba(255,255,255,.45)" }} />
    )}
  </div>
);

/**
 * Qué falta de un grupo, y cómo abrirlo.
 *
 * Va tanto en el encabezado de un rubro con etapas como en la fila de uno que
 * tiene una sola barra: el caso de las lámparas —cuarenta rubros y una sola
 * actividad— es justamente el segundo, y dejarlo afuera era dejar afuera el
 * caso que lo motivó.
 */
const Senal = ({ ui, g, senalados, misRubros }) => (
  <>
    {misRubros.length > 0 && (
      <button onClick={() => ui.setVerRubros(ui.verRubros === g.id ? null : g.id)}
        title={`Ver los ${misRubros.length} rubros de este grupo y señalar el que esté trabando`}
        style={{ background: ui.verRubros === g.id ? colors.brand : "none", border: "none", borderRadius: 4,
          color: ui.verRubros === g.id ? "#fff" : colors.muted, cursor: "pointer", display: "flex",
          padding: 2, flexShrink: 0 }}>
        <List size={12} />
      </button>
    )}
  </>
);
