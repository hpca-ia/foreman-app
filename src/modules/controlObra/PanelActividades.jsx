import { useState, useMemo } from "react";
import { Plus, Sparkles, Check, X, ChevronRight, ChevronDown, Trash2, Pencil, CornerDownRight, AlertTriangle, Merge, Briefcase } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import { EXTRAS_SUGERIDAS, sembrarExtras, crearExtra, reordenar, guardarOrden } from "./agrupacionesExtra";

const SIN = "__sin__";

// Una agrupación junta los rubros que se le compran al mismo proveedor. El
// presupuesto los separa para cotizarlos —por ambiente, por medida, por
// variante— pero la factura llega junta: siete rubros de "revestimiento" son
// una sola compra de porcelanato. Repartir esa factura entre los siete es lo
// que nadie hace, y por eso se agrupa antes de planillar.
//
// En la base siguen llamándose obra_actividades; el usuario las llama
// agrupaciones y eso es lo que dice la pantalla.
export default function PanelActividades({ obra, rubros, actividades = [], onCambio }) {
  const [abiertas, setAbiertas] = useState(() => new Set([SIN]));
  const [seleccion, setSeleccion] = useState(new Set());
  const [busqueda, setBusqueda] = useState("");
  const [nueva, setNueva] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [sugiriendo, setSugiriendo] = useState(false);
  const [sugerencias, setSugerencias] = useState(null);
  const [error, setError] = useState("");
  const [actsSel, setActsSel] = useState(new Set());   // marcadas para fusionar
  const [fuera, setFuera] = useState(0);               // rubros que NOVA dejó sin agrupar
  // Las agrupaciones marcadas para cambiar de lugar. Mismo gesto que en
  // Presupuestos: se marcan con ⇕ y se sueltan con "acá".
  const [moviendo, setMoviendo] = useState([]);
  const [extraNueva, setExtraNueva] = useState("");
  // Cuáles de las de siempre le faltan a ESTA obra. Se compara por nombre: una
  // obra puede haberlas creado a mano con otro código, y duplicar "GASTOS DE
  // OFICINA" partiría el gasto en dos renglones que nadie vuelve a juntar.
  const faltanExtras = useMemo(() => {
    const ya = new Set(actividades.map(a => String(a.nombre || "").trim().toLocaleUpperCase("es")));
    return EXTRAS_SUGERIDAS.filter(x => !ya.has(x.nombre.toLocaleUpperCase("es")));
  }, [actividades]);

  const grupos = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const coincide = r => !q || r.descripcion.toLowerCase().includes(q) ||
      (r.capitulo || "").toLowerCase().includes(q) || String(r.numero) === q;

    const dic = new Map(actividades.map(a => [a.id, a]));
    const mapa = new Map();
    actividades.forEach(a => mapa.set(a.id, { act: a, rubros: [], capitulos: new Set() }));
    mapa.set(SIN, { act: null, rubros: [], capitulos: new Set() });

    rubros.filter(coincide)
      .slice()
      .sort((a, b) => (a.capitulo_orden - b.capitulo_orden) || (a.orden - b.orden))
      .forEach(r => {
        const clave = r.actividad_id != null && dic.has(r.actividad_id) ? r.actividad_id : SIN;
        const g = mapa.get(clave);
        g.rubros.push(r);
        g.capitulos.add(r.capitulo || "SIN CAPÍTULO");
      });

    return [...mapa.entries()]
      .filter(([k, g]) => k !== SIN || g.rubros.length)
      .map(([clave, g]) => ({ clave, ...g, capitulos: [...g.capitulos] }))
      .sort((a, b) => (a.clave === SIN ? 1 : 0) - (b.clave === SIN ? 1 : 0) || (a.act?.orden ?? 0) - (b.act?.orden ?? 0));
  }, [rubros, actividades, busqueda]);

  const sinActividad = rubros.filter(r => r.actividad_id == null).length;
  const conRubros = new Set(rubros.filter(r => r.actividad_id != null).map(r => r.actividad_id));
  const vacias = actividades.filter(a => !conRubros.has(a.id));

  function alternarGrupo(k) {
    setAbiertas(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });
  }
  function alternarRubro(id) {
    setSeleccion(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function seleccionarGrupo(lista) {
    const ids = lista.map(r => r.id);
    const todos = ids.every(id => seleccion.has(id));
    setSeleccion(prev => { const n = new Set(prev); ids.forEach(id => todos ? n.delete(id) : n.add(id)); return n; });
  }

  async function mover(ids, actividadId) {
    if (!ids.length) return;
    setGuardando(true); setError("");
    const { error: e } = await supabase.from("obra_rubros").update({ actividad_id: actividadId }).in("id", ids);
    if (e) setError("No se pudo mover: " + e.message);
    else { setSeleccion(new Set()); setNueva(""); await onCambio(); }
    setGuardando(false);
  }

  /**
   * Subir o bajar una agrupación.
   *
   * El orden de las agrupaciones es el orden en que se lee el control de obra,
   * y las que vienen de NOVA salen en el orden en que aparecieron en el Excel
   * —que no es el orden en que se construye—. Sin poder moverlas, la única
   * salida era disolverlas y volver a armarlas en el orden correcto.
   *
   * Se renumeran las dos que se intercambian y nada más: reescribir las veinte
   * cada vez que alguien toca una flecha es pedirle a la base veinte escrituras
   * por un movimiento.
   */
  async function moverAgrupacion(act, direccion) {
    const enOrden = [...actividades].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
    const i = enOrden.findIndex(a => a.id === act.id);
    const j = i + direccion;
    if (i < 0 || j < 0 || j >= enOrden.length) return;

    const otra = enOrden[j];
    setGuardando(true); setError("");
    // Si quedaron con el mismo orden —o sin ninguno—, intercambiar no movería
    // nada: se les da el lugar que ocupan en la lista antes de cambiarlas.
    const miOrden = act.orden ?? i + 1;
    const suOrden = otra.orden ?? j + 1;
    const a1 = miOrden === suOrden ? j + 1 : suOrden;
    const a2 = miOrden === suOrden ? i + 1 : miOrden;
    const [e1, e2] = await Promise.all([
      supabase.from("obra_actividades").update({ orden: a1 }).eq("id", act.id),
      supabase.from("obra_actividades").update({ orden: a2 }).eq("id", otra.id),
    ]);
    setGuardando(false);
    if (e1.error || e2.error) { setError("No se pudo mover: " + (e1.error || e2.error).message); return; }
    onCambio();
  }

  /**
   * Soltar las marcadas donde se tocó "acá".
   *
   * Subir de a una con la flecha es insoportable cuando la agrupación nació
   * última y va tercera: dieciséis clics y la lista saltando bajo el cursor.
   */
  async function soltarEn(destino) {
    const cambios = reordenar(actividades, moviendo, destino.id);
    setMoviendo([]);
    if (!cambios.length) return;
    setGuardando(true); setError("");
    const err = await guardarOrden(cambios);
    setGuardando(false);
    if (err) { setError("No se pudo mover: " + err); return; }
    onCambio();
  }

  /** Las de siempre que esta obra todavía no tiene. */
  async function ponerExtras(cuales) {
    setGuardando(true); setError("");
    const r = await sembrarExtras(obra.id, cuales);
    setGuardando(false);
    if (r.error) { setError("No se pudieron crear: " + r.error); return; }
    onCambio();
  }

  async function ponerExtraPropia() {
    const nombre = extraNueva.trim();
    if (!nombre) return;
    setGuardando(true); setError("");
    const r = await crearExtra(obra.id, nombre);
    setGuardando(false);
    if (r.error) { setError(r.error); return; }
    setExtraNueva(""); onCambio();
  }

  async function moverANueva() {
    const nombre = nueva.trim();
    if (!nombre) return;
    setGuardando(true); setError("");
    const { data: act, error: e1 } = await supabase.from("obra_actividades")
      .insert({ obra_id: obra.id, nombre, codigo: String(actividades.length + 1).padStart(2, "0"), orden: actividades.length + 1 })
      .select().single();
    if (e1) { setError("No se pudo crear la agrupación: " + e1.message); setGuardando(false); return; }
    const { error: e2 } = await supabase.from("obra_rubros").update({ actividad_id: act.id }).in("id", [...seleccion]);
    if (e2) setError("La agrupación se creó pero no se pudo asignar los rubros: " + e2.message);
    else { setSeleccion(new Set()); setNueva(""); }
    await onCambio();
    setGuardando(false);
  }

  // Fusionar se lleva también las asignaciones de plata, no solo los rubros:
  // si quedaran apuntando a una actividad borrada, el dinero se pierde del
  // control sin que nadie lo note.
  async function fusionar() {
    const ids = [...actsSel];
    if (ids.length < 2) return;
    const destino = actividades.find(a => ids.includes(a.id));
    const otras = ids.filter(id => id !== destino.id);
    const nombre = window.prompt(
      `Fusionar ${ids.length} agrupaciones en una sola.\n\nNombre de la agrupación resultante:`, destino.nombre);
    if (!nombre?.trim()) return;

    setGuardando(true); setError("");
    const { error: e1 } = await supabase.from("obra_rubros").update({ actividad_id: destino.id }).in("actividad_id", otras);
    const { error: e2 } = await supabase.from("obra_asignaciones").update({ obra_actividad_id: destino.id }).in("obra_actividad_id", otras);
    if (e1 || e2) { setError("No se pudo fusionar: " + (e1 || e2).message); setGuardando(false); return; }
    await supabase.from("obra_actividades").update({ nombre: nombre.trim() }).eq("id", destino.id);
    await supabase.from("obra_actividades").delete().in("id", otras);
    setActsSel(new Set());
    await onCambio();
    setGuardando(false);
  }

  async function limpiarVacias(vacias) {
    if (!window.confirm(`¿Borrar ${vacias.length} agrupaciones sin ningún rubro?\n\nNo tienen nada adentro, así que no se pierde información.`)) return;
    setGuardando(true);
    await supabase.from("obra_actividades").delete().in("id", vacias.map(a => a.id));
    await onCambio();
    setGuardando(false);
  }

  async function editar(act) {
    const nombre = window.prompt("Nombre de la agrupación", act.nombre);
    if (nombre === null) return;
    const codigo = window.prompt("Código de la agrupación", act.codigo || "");
    if (codigo === null) return;
    setGuardando(true);
    await supabase.from("obra_actividades")
      .update({ nombre: nombre.trim() || act.nombre, codigo: codigo.trim() }).eq("id", act.id);
    await onCambio();
    setGuardando(false);
  }

  async function disolver(act, cuantos) {
    if (!window.confirm(`¿Quitar la agrupación "${act.nombre}"?\n\nSus ${cuantos} rubros no se borran: vuelven a quedar sin agrupar.`)) return;
    setGuardando(true);
    await supabase.from("obra_rubros").update({ actividad_id: null }).eq("actividad_id", act.id);
    await supabase.from("obra_actividades").delete().eq("id", act.id);
    await onCambio();
    setGuardando(false);
  }

  // Clasificar cientos de rubros a mano es inviable: NOVA propone y tú corriges.
  async function sugerirConNova() {
    setSugiriendo(true); setError(""); setSugerencias(null);
    try {
      const lista = rubros.map(r => `${r.id}|${r.capitulo}|${r.descripcion.slice(0, 60)}`).join("\n");
      // NOVA no recuerda nada entre llamadas. Se le pasan los nombres que la
      // oficina ya usó en otras obras para que converja a ese vocabulario en
      // vez de inventar uno nuevo cada vez.
      const { data: previas } = await supabase.from("obra_actividades")
        .select("nombre").neq("obra_id", obra.id).limit(400);
      const frec = {};
      (previas || []).forEach(a => { frec[a.nombre] = (frec[a.nombre] || 0) + 1; });
      const vocabulario = Object.entries(frec).sort((a, b) => b[1] - a[1]).slice(0, 60).map(([x]) => x);
      const res = await fetch("/api/nova", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-5", max_tokens: 8000,
          system: `Agrupas los rubros de un presupuesto de obra en AGRUPACIONES DE COMPRA.

La pregunta para cada grupo es una sola: **¿a quién le voy a comprar esto?**
Una agrupación = un proveedor o un contratista = una factura.

El presupuesto separa rubros para poder cotizarlos —por ambiente, por medida, por
variante— pero el proveedor factura todo junto. Repartir esa factura entre los rubros
uno por uno es inviable en la práctica; por eso se agrupa antes.

REGLA DURA: si varios rubros comparten la misma palabra de familia, van juntos.
· "Revestimiento de piso" + "Revestimiento paredes" + "Revestimiento baño" +
  "Revestimiento papel tapiz" + "Barredera porcelanato" + "Barredera madera" + "Perfil u"
  → UNA sola: "Revestimientos y barrederas". Es el mismo proveedor de acabados.
· "Tomacorrientes normales" + "regulados" + "220V" → UNA: "Tomacorrientes"
· "Gypsum tumbado" + "Gypsum paredes" + "Gypsum cortinero" → UNA: "Gypsum"
· "Luminaria empotrada" + "Riel" + "Perfil LED" + "Cinta LED" → UNA: "Iluminación"
· "Hormigón en cimentación" + "en muros" + "en columnas y losas" + "ciclópeo" → UNA: "Hormigón"

NUNCA separes por ambiente (cocina/baño/dormitorio), por medida, por variante ni por
fase de obra. Eso deja la factura repartida en pedazos, que es el problema que se
quiere evitar.

Los gastos generales de obra —residente, servicios de luz y agua, limpieza, materiales
de oficina y bodega, equipos de seguridad, seguros, permisos— van TODOS en una sola
agrupación: no se le compran a un proveedor, son costos corrientes de la obra.

Una agrupación puede cruzar capítulos si el proveedor es el mismo.
Un rubro solo queda solo si de verdad se le compra a alguien distinto que a todos los demás.

TECHO: apunta a entre 10 y 20 agrupaciones. Si te pasas de 25 en un presupuesto de cien
y pico rubros, estás separando de más: vuelve a juntar antes de responder. Que la mayoría
de agrupaciones tenga varios rubros; si casi todas tienen uno solo, el trabajo está mal hecho.
Cada rubro va en UNA agrupación, y TODOS los rubros deben quedar en alguna.
Nombres de compra, cortos: "Hormigón", "Revestimientos", "Gypsum", "Puertas", "Iluminación".

Devuelve SOLO JSON, sin markdown:
{"actividades":[{"nombre":"...","rubros":[1,2,3]}]}
Los números son los id antes del primer "|". No inventes ids.${vocabulario.length
  ? `\n\nEsta oficina ya usó estos nombres en otras obras. Reutiliza el que corresponda
en vez de inventar uno parecido; solo crea un nombre nuevo si de verdad no encaja ninguno:\n${vocabulario.join(", ")}`
  : ""}`,
          messages: [{ role: "user", content: `Rubros (id|capítulo|descripción):\n${lista}` }],
        }),
      });
      const data = await res.json();
      const txt = (data.content?.[0]?.text || "").replace(/```json|```/g, "").trim();
      let parsed = null;
      try { parsed = JSON.parse(txt); } catch { const m = txt.match(/\{[\s\S]*\}/); if (m) try { parsed = JSON.parse(m[0]); } catch {} }
      if (!parsed?.actividades?.length) { setError("NOVA no pudo agrupar los rubros. Intenta de nuevo o hazlo a mano."); setSugiriendo(false); return; }
      const validos = new Map(rubros.map(r => [r.id, r]));
      setSugerencias(parsed.actividades
        .map(a => {
          const ids = (a.rubros || []).filter(id => validos.has(id));
          const caps = new Set(ids.map(id => validos.get(id).capitulo || "SIN CAPÍTULO"));
          return { nombre: String(a.nombre || "").trim(), rubros: ids, capitulos: caps.size };
        })
        .filter(a => a.nombre && a.rubros.length));
      const cubiertos = new Set(parsed.actividades.flatMap(a => a.rubros || []));
      setFuera(rubros.filter(r => !cubiertos.has(r.id)).length);
    } catch (e) { setError("Error consultando a NOVA: " + e.message); }
    setSugiriendo(false);
  }

  async function aplicarSugerencias(reemplazar) {
    setGuardando(true); setError("");
    try {
      // Aplicar dos veces sin esto deja la tanda anterior huérfana: sus rubros
      // se van a las nuevas y quedan decenas de actividades vacías.
      let base = actividades;
      if (reemplazar && actividades.length) {
        await supabase.from("obra_rubros").update({ actividad_id: null }).eq("obra_id", obra.id);
        await supabase.from("obra_asignaciones").update({ obra_actividad_id: null })
          .in("obra_actividad_id", actividades.map(a => a.id));
        await supabase.from("obra_actividades").delete().eq("obra_id", obra.id);
        base = [];
      }
      const desde = base.length;
      const filas = sugerencias.map((a, i) => ({
        obra_id: obra.id, nombre: a.nombre, codigo: String(desde + i + 1).padStart(2, "0"), orden: desde + i + 1, origen: "nova",
      }));
      const { data: creadas, error: e1 } = await supabase.from("obra_actividades").insert(filas).select();
      if (e1) { setError("Falló al crear las actividades: " + e1.message); setGuardando(false); return; }
      for (let i = 0; i < sugerencias.length; i++) {
        const { error: e2 } = await supabase.from("obra_rubros")
          .update({ actividad_id: creadas[i].id }).in("id", sugerencias[i].rubros);
        if (e2) { setError("Falló al asignar rubros: " + e2.message); setGuardando(false); return; }
      }
      setSugerencias(null);
      await onCambio();
    } finally { setGuardando(false); }
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: colors.inkSoft, marginBottom: 12 }}>
        Una agrupación junta los rubros que le compras al mismo proveedor, para no tener que repartir cada factura entre muchos rubros. Es a ellas que se asignan las facturas al planillar.
        {" "}<strong style={{ color: colors.ink }}>Y son las que arman los dos cronogramas</strong> —el de barras y el
        valorado, en el módulo Cronograma—, en este mismo orden: lo que cambies acá se ve allá.
        {sinActividad > 0 && <> Quedan <strong>{sinActividad}</strong> rubros sin agrupar.</>}
      </div>

      {!sugerencias && (
        <div style={{ background: colors.brandSoft, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 12, marginBottom: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Sparkles size={16} color={colors.brand} />
          <div style={{ fontSize: 12, color: colors.brand, flex: 1, minWidth: 180 }}>
            {sugiriendo ? "NOVA está agrupando los rubros..." : `Clasificar ${rubros.length} rubros a mano es lento. NOVA puede proponer las agrupaciones y tú corriges.`}
          </div>
          <Button variant="primary" size="sm" onClick={sugerirConNova} disabled={sugiriendo || guardando}>
            {sugiriendo ? "Agrupando..." : "Agrupar con NOVA"}
          </Button>
        </div>
      )}

      {sugerencias && (
        <div style={{ background: colors.surface, border: `1.5px solid ${colors.brand}`, borderRadius: colors.radiusMd, padding: 14, marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: colors.ink, marginBottom: 8 }}>NOVA propone {sugerencias.length} agrupaciones</div>
          <div style={{ maxHeight: 220, overflowY: "auto", marginBottom: 10 }}>
            {sugerencias.map((a, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: `1px solid ${colors.neutralSoft}` }}>
                <span style={{ fontSize: 11, color: colors.muted, width: 18, flexShrink: 0 }}>{String(i + 1).padStart(2, "0")}</span>
                <input value={a.nombre} onChange={e => setSugerencias(s => s.map((x, j) => j === i ? { ...x, nombre: e.target.value } : x))}
                  style={{ ...inputStyle, flex: 1, padding: "6px 9px", fontSize: 12 }} />
                <span style={{ fontSize: 11, color: colors.muted, flexShrink: 0 }}>{a.rubros.length} rubros</span>
                {a.capitulos > 1 && (
                  <span title={`Cruza ${a.capitulos} capítulos`}
                    style={{ fontSize: 9, color: colors.warning, background: colors.warningSoft, borderRadius: 8, padding: "1px 6px", flexShrink: 0, fontWeight: 600 }}>
                    {a.capitulos} cap.
                  </span>
                )}
                <button onClick={() => setSugerencias(s => s.filter((_, j) => j !== i))}
                  style={{ background: "none", border: "none", color: colors.muted, cursor: "pointer", display: "flex" }}><X size={13} /></button>
              </div>
            ))}
          </div>
          {fuera > 0 && (
            <div style={{ fontSize: 11, color: colors.inkSoft, marginBottom: 8 }}>
              NOVA dejó {fuera} rubro{fuera === 1 ? "" : "s"} sin agrupar. Quedan en "Sin agrupar" y los asignas tú.
            </div>
          )}
          {actividades.length > 0 && (
            <div style={{ fontSize: 11, color: colors.warning, background: colors.warningSoft, borderRadius: colors.radiusSm, padding: "7px 10px", marginBottom: 8 }}>
              Esta obra ya tiene {actividades.length} agrupaciones. Si agregas estas encima, las de antes quedan sin rubros.
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="outline" style={{ flex: 1 }} onClick={() => setSugerencias(null)} disabled={guardando}>Descartar</Button>
            {actividades.length > 0 && (
              <Button variant="outline" style={{ flex: 1 }} onClick={() => aplicarSugerencias(false)} disabled={guardando}>
                Agregar
              </Button>
            )}
            <Button variant="primary" style={{ flex: 2 }} onClick={() => aplicarSugerencias(actividades.length > 0)} disabled={guardando}>
              {guardando ? "Aplicando..." : actividades.length > 0 ? "Reemplazar las actuales" : "Aplicar estas agrupaciones"}
            </Button>
          </div>
        </div>
      )}

      {error && <div style={{ color: colors.danger, fontSize: 12, marginBottom: 10 }}>{error}</div>}

      <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar rubro o capítulo..." style={{ ...inputStyle, marginBottom: 10 }} />

      {/* Qué está pasando, mientras pasa: un modo invisible —en el que los
          botones de las filas hacen otra cosa— se descubre apretando el
          equivocado. */}
      {moviendo.length > 0 && (
        <div style={{ fontSize: 11.5, color: colors.brand, background: colors.brandSoft, borderRadius: 7,
          padding: "6px 10px", marginBottom: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span>
            Moviendo <strong>{moviendo.length === 1 ? "una agrupación" : `${moviendo.length} agrupaciones`}</strong>.
            {" "}Tocá <strong>acá</strong> en la que va justo debajo.
          </span>
          <button onClick={() => setMoviendo([])}
            style={{ background: "none", border: "none", color: colors.muted, cursor: "pointer",
              fontFamily: colors.font, fontSize: 11 }}>cancelar</button>
        </div>
      )}

      {/* LAS QUE NO ESTÁN EN EL PRESUPUESTO.
          Una obra gasta en cosas que nadie contrató: la vivienda del residente,
          el flete, la papelería, el imprevisto. No es un capítulo del contrato
          y no puede colgar de uno —una planilla que le cobra al cliente
          "gastos de oficina" dentro de ALBAÑILERÍA es un problema bastante
          peor que uno de software—, pero es plata de la obra y va al control.

          Se ofrecen y se agregan a mano: las sugeridas con un toque, y
          cualquier otra escribiéndola. Arrancan en cero, así que el saldo se
          va a negativo con el primer gasto. Eso no es un descuadre: es el dato. */}
      {(
        <div style={{ background: colors.surface, border: `1px dashed ${colors.border}`,
          borderRadius: colors.radiusMd, padding: "9px 12px", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7, flexWrap: "wrap" }}>
            <Briefcase size={13} color={colors.muted} />
            <span style={{ fontSize: 11.5, color: colors.inkSoft, flex: 1, minWidth: 180 }}>
              Agrupaciones de control — gasto de obra que no está en el presupuesto.
            </span>
            {faltanExtras.length > 1 && (
              <Button variant="outline" size="sm" disabled={guardando}
                onClick={() => ponerExtras(faltanExtras)}>
                <Plus size={12} /> Poner las {faltanExtras.length}
              </Button>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {faltanExtras.map(x => (
              <button key={x.nombre} onClick={() => ponerExtras([x])} disabled={guardando}
                style={{ background: "transparent", border: `1px solid ${colors.border}`, borderRadius: 20,
                  padding: "4px 11px", fontSize: 11.5, color: colors.inkSoft, cursor: "pointer",
                  fontFamily: colors.font }}>
                <Plus size={10} style={{ verticalAlign: "-1px", marginRight: 3 }} />{x.nombre}
              </button>
            ))}
            <input value={extraNueva} onChange={e => setExtraNueva(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") ponerExtraPropia(); }}
              placeholder="…u otra: escribila y Enter"
              style={{ ...inputStyle, flex: 1, minWidth: 170, padding: "4px 9px", fontSize: 11.5 }} />
            {extraNueva.trim() && (
              <Button variant="primary" size="sm" disabled={guardando} onClick={ponerExtraPropia}>
                <Plus size={12} /> Crear
              </Button>
            )}
          </div>
        </div>
      )}

      {seleccion.size > 0 && (
        <div style={{ background: colors.brandSoft, borderRadius: colors.radiusMd, padding: 12, marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: colors.brand, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <CornerDownRight size={13} /> Mover {seleccion.size} rubro{seleccion.size === 1 ? "" : "s"} a:
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            {actividades.map(a => (
              <button key={a.id} onClick={() => mover([...seleccion], a.id)} disabled={guardando}
                style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 20, padding: "5px 12px", fontSize: 12, color: colors.ink, cursor: "pointer", fontFamily: colors.font }}>
                <span style={{ color: colors.muted, marginRight: 4 }}>{a.codigo}</span>{a.nombre}
              </button>
            ))}
            <button onClick={() => mover([...seleccion], null)} disabled={guardando}
              style={{ background: "transparent", border: `1px dashed ${colors.border}`, borderRadius: 20, padding: "5px 12px", fontSize: 12, color: colors.muted, cursor: "pointer", fontFamily: colors.font }}>
              Sin agrupar
            </button>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <input value={nueva} onChange={e => setNueva(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && nueva.trim()) moverANueva(); }}
              placeholder="…o una agrupación nueva" style={{ ...inputStyle, flex: 1 }} />
            <Button variant="primary" onClick={moverANueva} disabled={!nueva.trim() || guardando}>
              <Plus size={13} /> Crear
            </Button>
          </div>
        </div>
      )}

      {vacias.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: colors.warningSoft, border: `1px solid ${colors.warningBorder}`, borderRadius: colors.radiusMd, padding: "9px 12px", marginBottom: 10, flexWrap: "wrap" }}>
          <AlertTriangle size={14} color={colors.warning} />
          <span style={{ fontSize: 12, color: colors.warning, flex: 1, minWidth: 160 }}>
            {vacias.length} agrupaciones quedaron sin ningún rubro.
          </span>
          <Button variant="outline" size="sm" onClick={() => limpiarVacias(vacias)} disabled={guardando}>
            <Trash2 size={12} /> Borrar las vacías
          </Button>
        </div>
      )}

      {actsSel.size > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: colors.brandSoft, borderRadius: colors.radiusMd, padding: "9px 12px", marginBottom: 10, flexWrap: "wrap" }}>
          <Merge size={14} color={colors.brand} />
          <span style={{ fontSize: 12, color: colors.brand, flex: 1, minWidth: 160 }}>
            {actsSel.size} agrupa{actsSel.size === 1 ? "ción" : "ciones"} marcada{actsSel.size === 1 ? "" : "s"}
            {actsSel.size < 2 && " — marca al menos dos para fusionarlas"}
          </span>
          <Button variant="outline" size="sm" onClick={() => setActsSel(new Set())}>Quitar marcas</Button>
          <Button variant="primary" size="sm" onClick={fusionar} disabled={actsSel.size < 2 || guardando}>
            Fusionar en una
          </Button>
        </div>
      )}

      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, overflow: "hidden" }}>
        {grupos.map(g => {
          const abierta = abiertas.has(g.clave);
          const esSin = g.clave === SIN;
          const todos = g.rubros.length > 0 && g.rubros.every(r => seleccion.has(r.id));
          // Las puntas no se mueven: una flecha que no hace nada es una flecha
          // que se toca dos veces para descubrir que no hace nada.
          const conActividad = grupos.filter(x => x.clave !== SIN);
          const pos = conActividad.findIndex(x => x.clave === g.clave);
          const primera = pos === 0;
          const ultima = pos === conActividad.length - 1;
          return (
            <div key={g.clave}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderBottom: `1px solid ${colors.neutralSoft}`, background: esSin ? "transparent" : colors.brandSoft }}>
                <button onClick={() => alternarGrupo(g.clave)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: esSin ? colors.muted : colors.brand, display: "flex", padding: 0 }}>
                  {abierta ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                <span onClick={() => alternarGrupo(g.clave)} style={{ flex: 1, fontSize: 12, fontWeight: 600, color: esSin ? colors.muted : colors.brand, cursor: "pointer", minWidth: 0 }}>
                  {!esSin && <span style={{ opacity: 0.65, marginRight: 5 }}>{g.act.codigo}</span>}
                  {esSin ? "Sin agrupar" : g.act.nombre}
                  <span style={{ fontWeight: 400, opacity: 0.75, marginLeft: 5 }}>({g.rubros.length})</span>
                  {!esSin && g.capitulos.length > 1 && (
                    <span title={`Toca ${g.capitulos.length} capítulos: ${g.capitulos.join(", ")}. Lo que se le asigne se reparte entre ellos a prorrata; si necesitas el capítulo exacto, pártela en dos.`}
                      style={{ display: "inline-flex", alignItems: "center", gap: 3, background: colors.warningSoft, color: colors.warning, borderRadius: 10, padding: "1px 7px", fontSize: 9, fontWeight: 600, marginLeft: 6 }}>
                      <AlertTriangle size={9} /> {g.capitulos.length} capítulos
                    </span>
                  )}
                </span>
                <button onClick={() => seleccionarGrupo(g.rubros)} title="Seleccionar todos"
                  style={{ background: todos ? colors.brand : "transparent", border: `1px solid ${todos ? colors.brand : colors.border}`, borderRadius: 4, width: 18, height: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, flexShrink: 0 }}>
                  {todos && <Check size={11} color="#fff" />}
                </button>
                {!esSin && (
                  <>
                    {/* MARCAR Y SOLTAR, igual que en Presupuestos. Las flechas
                        siguen para el ajuste de a uno; el ⇕ marca —se pueden
                        marcar varias— y "acá" las suelta donde van. Subir una
                        agrupación que nació última hasta el tercer lugar eran
                        dieciséis clics con la lista saltando bajo el cursor. */}
                    <button onClick={() => setMoviendo(prev => prev.includes(g.act.id)
                        ? prev.filter(x => x !== g.act.id) : [...prev, g.act.id])}
                      title={moviendo.includes(g.act.id)
                        ? "Sacarla de la selección"
                        : "Marcarla para moverla. Podés marcar varias."}
                      style={{ background: moviendo.includes(g.act.id) ? colors.brand : "none",
                        color: moviendo.includes(g.act.id) ? "#fff" : colors.muted, border: "none",
                        borderRadius: 5, padding: "1px 4px", fontSize: 10, cursor: "pointer",
                        fontFamily: colors.font, lineHeight: 1.2, flexShrink: 0 }}>⇕</button>
                    {moviendo.length > 0 && !moviendo.includes(g.act.id) && (
                      <button onClick={() => soltarEn(g.act)} disabled={guardando}
                        title={moviendo.length === 1 ? "Poner la marcada acá" : `Poner las ${moviendo.length} marcadas acá`}
                        style={{ background: colors.brand, color: "#fff", border: "none", borderRadius: 5,
                          padding: "1px 5px", fontSize: 9.5, fontWeight: 700, cursor: "pointer",
                          fontFamily: colors.font, flexShrink: 0 }}>acá</button>
                    )}
                    {/* El orden de las agrupaciones es el orden en que se lee
                        el control: las de NOVA salen como venían en el Excel. */}
                    <div style={{ display: "flex", flexDirection: "column", flexShrink: 0 }}>
                      <button onClick={() => moverAgrupacion(g.act, -1)} disabled={guardando || primera} title="Subir"
                        style={{ background: "none", border: "none", padding: "0 2px", lineHeight: 1, fontSize: 9,
                          cursor: primera ? "default" : "pointer", color: primera ? colors.border : colors.muted }}>▲</button>
                      <button onClick={() => moverAgrupacion(g.act, 1)} disabled={guardando || ultima} title="Bajar"
                        style={{ background: "none", border: "none", padding: "0 2px", lineHeight: 1, fontSize: 9,
                          cursor: ultima ? "default" : "pointer", color: ultima ? colors.border : colors.muted }}>▼</button>
                    </div>
                    <button onClick={() => setActsSel(prev => { const n = new Set(prev); n.has(g.act.id) ? n.delete(g.act.id) : n.add(g.act.id); return n; })}
                      title="Marcar para fusionar"
                      style={{ background: actsSel.has(g.act.id) ? colors.brand : "transparent", border: "none", borderRadius: 4, padding: 2, color: actsSel.has(g.act.id) ? "#fff" : colors.muted, cursor: "pointer", display: "flex" }}>
                      <Merge size={12} />
                    </button>
                    <button onClick={() => editar(g.act)} title="Nombre y código"
                      style={{ background: "none", border: "none", color: colors.muted, cursor: "pointer", display: "flex", padding: 2 }}><Pencil size={12} /></button>
                    <button onClick={() => disolver(g.act, g.rubros.length)} title="Quitar la agrupación"
                      style={{ background: "none", border: "none", color: colors.muted, cursor: "pointer", display: "flex", padding: 2 }}><Trash2 size={12} /></button>
                  </>
                )}
              </div>

              {abierta && g.rubros.map(r => {
                const marcado = seleccion.has(r.id);
                return (
                  <div key={r.id} onClick={() => alternarRubro(r.id)}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 12px 7px 34px", borderBottom: `1px solid ${colors.neutralSoft}`, cursor: "pointer", background: marcado ? colors.brandSoft : "transparent" }}>
                    <div style={{ width: 15, height: 15, borderRadius: 4, flexShrink: 0, border: `1.5px solid ${marcado ? colors.brand : colors.border}`, background: marcado ? colors.brand : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {marcado && <Check size={10} color="#fff" />}
                    </div>
                    <span style={{ fontSize: 12, color: colors.ink, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <span style={{ color: colors.muted, marginRight: 6 }}>{r.numero}</span>{r.descripcion}
                    </span>
                    <span style={{ fontSize: 10, color: colors.muted, flexShrink: 0, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.capitulo}</span>
                  </div>
                );
              })}
            </div>
          );
        })}
        {grupos.length === 0 && <div style={{ padding: "30px 0", textAlign: "center", color: colors.muted, fontSize: 13 }}>Sin rubros que mostrar.</div>}
      </div>
    </div>
  );
}
