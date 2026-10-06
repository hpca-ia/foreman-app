import { useState } from "react";
import { Link2, Trash2, CalendarClock, ChevronRight, ChevronDown, Scissors, X } from "lucide-react";
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

const titulito = { fontSize: 9.5, fontWeight: 700, color: colors.muted, letterSpacing: 0.3, display: "block", marginBottom: 3 };

export default function TablaGantt({
  todas = [], dependencias = [], agrupaciones = [], plata = {},
  porId, cal, plan, escala, zoom, marcas = [], editable, conEtapas,
  uniendo, setUniendo, hoyISO, dia,
  onCambiar, onCambiarDep, onDesunir, onUnir, onQuitar, onPartir,
}) {
  const [abierta, setAbierta] = useState(null);
  const [plegados, setPlegados] = useState(() => new Set());

  const COLS = "minmax(190px,1fr) 54px 76px 76px 56px";
  const IZQ = 490 + 12;
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
  const nombreAg = new Map(agrupaciones.map(g => [g.id, g.nombre]));
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
    grupos.push({
      id: k,
      nombre: k ? (nombreAg.get(k) || "Agrupación borrada") : "Sin agrupación",
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
  grupos.sort((a, b) => {
    // Las sueltas al final: no son de ningún rubro y arriba estorban.
    if (!a.id !== !b.id) return a.id ? -1 : 1;
    return String(a.inicio || "9").localeCompare(String(b.inicio || "9"));
  });

  const plegar = id => setPlegados(s => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  // ── Piezas ───────────────────────────────────────────────────────────────
  const Fila = ({ children, fondo }) => (
    <div style={{ display: "grid", gridTemplateColumns: `${IZQ}px ${anchoLienzo}px 30px`, gap: 7,
      padding: "7px 12px 7px 0", borderTop: `1px solid ${colors.neutralSoft}`, alignItems: "center",
      fontSize: 12, width: "max-content", minWidth: "100%", background: fondo || "transparent" }}>
      {children}
    </div>
  );

  const Fijo = ({ children, fondo }) => (
    <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 7, alignItems: "center",
      // Por encima de todo lo que vive en el lienzo —barras, regla, la línea
      // de hoy—: todo eso le pasa por detrás al correr, y lo que asome por el
      // borde se lee como un error de dibujo.
      position: "sticky", left: 0, zIndex: 4, background: fondo || colors.surface,
      paddingLeft: 12, boxSizing: "border-box", borderRight: `1px solid ${colors.border}` }}>
      {children}
    </div>
  );

  const Lienzo = ({ children }) => (
    <div style={{ position: "relative", height: 16 }}>
      {dentro && (
        // Dentro de su fila y no desbordando arriba y abajo: lo que sobresale
        // se escapa por el filo de la columna fija —que mide lo que mide su
        // contenido— y aparece como dos puntos rojos sueltos sobre las fechas.
        <div style={{ position: "absolute", top: 0, bottom: 0, left: `${posicion(hoyISO) * 100}%`,
          width: 2, background: colors.danger, opacity: 0.75, zIndex: 1 }} />
      )}
      {children}
    </div>
  );

  const Barra = ({ a, tenue }) => a.inicio && (
    <div title={`${dia(a.inicio)} → ${dia(a.fin)}${a.critica ? " · ruta crítica" : ` · ${a.holgura} días de colchón`}`}
      style={{ position: "absolute", top: tenue ? 5 : 0, bottom: tenue ? 5 : 0,
        left: `${posicion(a.inicio) * 100}%`, width: `${Math.max(largo(a) * 100, 0.6)}%`,
        background: a.critica ? colors.danger : colors.brand, borderRadius: 4,
        opacity: tenue ? 0.3 : 1, display: "flex", alignItems: "center", overflow: "hidden" }}>
      {!tenue && a.avance_pct > 0 && (
        <div style={{ width: `${Math.min(100, a.avance_pct)}%`, height: "100%", background: "rgba(255,255,255,.45)" }} />
      )}
    </div>
  );

  return (
    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, overflowX: "auto" }}>
      {/* Encabezado */}
      <div style={{ display: "grid", gridTemplateColumns: `${IZQ}px ${anchoLienzo}px 30px`, gap: 7,
        padding: "8px 12px 8px 0", background: colors.bg, fontSize: 9, fontWeight: 700, color: colors.muted,
        letterSpacing: 0.3, width: "max-content", minWidth: "100%" }}>
        <span style={{ display: "grid", gridTemplateColumns: COLS, gap: 7, position: "sticky", left: 0, zIndex: 3,
          background: colors.bg, paddingLeft: 12, boxSizing: "border-box", borderRight: `1px solid ${colors.border}` }}>
          <span>ACTIVIDAD</span>
          <span style={{ textAlign: "center" }}>DÍAS</span>
          <span>EMPIEZA</span>
          <span>TERMINA</span>
          <span style={{ textAlign: "center" }}>COLCHÓN</span>
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
        const pesos = g.hijas.reduce((t, a) => t + Number(a.peso_pct ?? 100), 0);
        const malReparto = g.id && g.hijas.length > 1 && Math.abs(pesos - 100) > 0.01;

        return (
          <div key={g.id}>
            {/* El rubro. Solo cuando de verdad agrupa algo. */}
            {!g.simple && (
              <Fila fondo={colors.bg}>
                <Fijo fondo={colors.bg}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                    <button onClick={() => plegar(g.id)} title={plegado ? "Mostrar sus etapas" : "Plegar"}
                      style={{ background: "none", border: "none", cursor: "pointer", color: colors.muted, display: "flex", padding: 0 }}>
                      {plegado ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                    </button>
                    <span style={{ fontWeight: 700, color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {g.nombre}
                    </span>
                    <span style={{ fontSize: 9.5, color: colors.muted, flexShrink: 0 }}>
                      {g.hijas.length} etapas
                    </span>
                    {g.monto > 0 && (
                      <span title={`Lo que vale este rubro en el presupuesto: ${fmt(g.monto)}. Se reparte entre sus etapas.`}
                        style={{ fontSize: 9.5, color: colors.muted, flexShrink: 0 }}>
                        · ${Math.round(g.monto).toLocaleString("es-EC")}
                      </span>
                    )}
                    {malReparto && (
                      <span title="Las etapas de un rubro tienen que repartirse el 100% de su plata. Así como está, el valorado no va a cuadrar con el presupuesto."
                        style={{ fontSize: 9, fontWeight: 700, color: colors.warning, flexShrink: 0 }}>
                        reparten {Math.round(pesos)}%
                      </span>
                    )}
                  </div>
                  <span title="De la primera etapa a la última, incluido lo que pasa en el medio sin trabajo en obra"
                    style={{ textAlign: "center", fontSize: 10.5, color: colors.muted }}>
                    {g.inicio && g.fin ? cal.entre(g.inicio, g.fin) : "—"}
                  </span>
                  <span style={{ fontSize: 11, color: colors.inkSoft }}>{dia(g.inicio)}</span>
                  <span style={{ fontSize: 11, color: colors.inkSoft }}>{dia(g.fin)}</span>
                  {/* El colchón de un rubro no es un número: cada etapa tiene
                      el suyo y sumarlos no querría decir nada. */}
                  <span />
                </Fijo>
                {/* La barra del rubro de punta a punta: lo que se importa en
                    marzo y se instala en agosto es UNA cosa que abarca medio
                    año, y eso no se ve mirando tres barras sueltas. */}
                <Lienzo>
                  {g.inicio && (
                    <div title={`${g.nombre}: del ${dia(g.inicio)} al ${dia(g.fin)}`}
                      style={{ position: "absolute", top: 6, bottom: 6,
                        left: `${posicion(g.inicio) * 100}%`,
                        width: `${Math.max((cal.entre(g.inicio, g.fin) / diasTotales) * 100, 0.6)}%`,
                        background: colors.neutralSoft, borderRadius: 3,
                        borderLeft: `2px solid ${colors.border}`, borderRight: `2px solid ${colors.border}` }} />
                  )}
                  {g.hijas.map(a => <Barra key={a.id} a={a} tenue />)}
                </Lienzo>
                <span />
              </Fila>
            )}

            {/* Las actividades */}
            {(!plegado || g.simple) && g.hijas.map(a => {
              const deps = dependencias.filter(d => d.actividad_id === a.id);
              const esta = abierta === a.id;
              const etapa = a.etapa && a.etapa !== "ejecucion" ? ETAPAS[a.etapa] : null;
              return (
                <div key={a.id}>
                  <Fila fondo={esta ? colors.brandSoft : undefined}>
                    <Fijo fondo={esta ? colors.brandSoft : undefined}>
                      <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 5, paddingLeft: g.simple ? 0 : 18 }}>
                        {a.critica && <span title="Ruta crítica: no tiene colchón" style={{ color: colors.danger, flexShrink: 0 }}>●</span>}
                        <button onClick={() => setAbierta(esta ? null : a.id)}
                          title="Ver y cambiar de qué depende, su etapa y su fecha"
                          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: colors.font,
                            fontSize: 12, color: colors.ink, textAlign: "left", minWidth: 0, overflow: "hidden",
                            textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {g.simple ? a.nombre : (etapa || a.nombre)}
                        </button>
                        {etapa && !g.simple && (
                          <span style={{ fontSize: 9.5, color: colors.muted, flexShrink: 0 }}>
                            {a.peso_pct != null ? `${a.peso_pct}%` : ""}
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
                      </div>
                      <Numero value={a.duracion} min={1} max={2000} disabled={!editable}
                        onCommit={v => onCambiar(a, { duracion: v })}
                        title="Días hábiles. Enter para guardar."
                        style={{ padding: "4px 6px", fontSize: 11.5, textAlign: "center" }} />
                      <span style={{ color: colors.inkSoft, fontSize: 11.5 }}>{dia(a.inicio)}</span>
                      <span style={{ color: colors.inkSoft, fontSize: 11.5 }}>{dia(a.fin)}</span>
                      <span style={{ textAlign: "center", fontSize: 11.5, fontWeight: a.critica ? 700 : 400,
                        color: a.critica ? colors.danger : colors.muted }}>
                        {a.enCiclo ? "—" : a.critica ? "0" : `${a.holgura}d`}
                      </span>
                    </Fijo>
                    <Lienzo><Barra a={a} /></Lienzo>
                    {editable ? (
                      <button onClick={() => (uniendo ? onUnir(uniendo, a.id) : setUniendo(a.id))}
                        title={uniendo === a.id ? "Elegí ahora la que va después" : uniendo ? "Esta va después de la marcada" : "Encadenar: marcá ésta y después la que va detrás"}
                        style={{ background: uniendo === a.id ? colors.brand : "none", border: "none",
                          color: uniendo === a.id ? "#fff" : colors.muted, borderRadius: 4, cursor: "pointer", display: "flex", padding: 2 }}>
                        <Link2 size={12} />
                      </button>
                    ) : <span />}
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
          </div>
        );
      })}
    </div>
  );
}
