import { useEffect, useState, useCallback } from "react";
import { Pencil, Check } from "lucide-react";
import { supabase } from "../lib/supabase";
import { colors } from "../theme/colors";
import { POR_DEFECTO } from "../lib/permisos";
import { fusionarLead, duplicadosProbables } from "../lib/fusionarLead";
import QueVeEstaPersona from "./QueVeEstaPersona";
import ProyectosRepetidos from "./ProyectosRepetidos";
import { repararCadena, engancharAlProyecto } from "../lib/cadena";
import { TUNELES, esProyecto } from "../modules/leads/tubo";
import { AREAS_PROYECTO, NIVELES, filaDeAcceso, sinNingunAcceso } from "../lib/acceso";

// Los proyectos, de verdad: los del pipeline.
//
// Esta lista reemplaza a la de Ajustes. El proyecto ya no se inventa acá: nace
// en el pipeline con su tubo y sus etapas, y acá se le pone lo que hace falta
// para trabajar en equipo —su color y quién participa—, que era lo único que
// Ajustes aportaba.
//
// Quién participa se guarda en `lead_accesos`, la misma tabla que decide quién
// ve el proyecto en el pipeline: así "estar en el proyecto" significa una sola
// cosa y no dos parecidas.

// Las áreas y los niveles salen de lib/acceso.js, que es donde vive la regla:
// esta pantalla la muestra, no la define.

// Qué permiso de módulo hace falta para que un nivel de área se note. Sin
// esto, dar "Presupuesto: Ver" y que la persona no vea nada parece un error de
// la app, y es que su rol no le abre esa pantalla.
const PUERTA = {
  nivel: null,
  presupuesto: ["presupuestos.ver", "Presupuestos"],
  obra: ["controlObra.ver", "Control de Obra"],
  libro: ["libro.ver", "Libro de Obra"],
};

export default function ProyectosDelPipeline({ users = [], permisos = {}, permisosUsuario = {}, onCambio }) {
  const [leads, setLeads] = useState([]);
  const [accesos, setAccesos] = useState({});    // lead_id -> { usuario_id: nivel }
  const [abierto, setAbierto] = useState(null);
  const [sinColor, setSinColor] = useState(false);
  const [sinAreas, setSinAreas] = useState(false);
  const [guardando, setGuardando] = useState(null);
  const [presupuestos, setPresupuestos] = useState([]);
  const [obras, setObras] = useState([]);
  const [cajas, setCajas] = useState([]);
  const [uniendo, setUniendo] = useState(null);
  const [renombrando, setRenombrando] = useState(null);
  const [sinCadena, setSinCadena] = useState([]);

  const cargar = useCallback(async () => {
    const [{ data: ls }, { data: as }, { data: ps }, { data: os }, { data: cs }] = await Promise.all([
      supabase.from("leads").select("*").order("nombre"),
      supabase.from("lead_accesos").select("*"),
      // Los presupuestos, para poder decir cuál cuelga de cada proyecto. Dar
      // "Presupuesto: Ver" no sirve de nada si el presupuesto no está enlazado
      // al proyecto, y eso hay que verlo acá, no descubrirlo por un reclamo.
      supabase.from("presupuestos").select("id,nombre,lead_id,archivado_at").order("created_at", { ascending: false }),
      supabase.from("obras").select("id,nombre,lead_id,presupuesto_id"),
      supabase.from("cajas_chicas").select("id,proyecto_nombre,lead_id,responsable_id"),
    ]);
    setPresupuestos(ps || []);
    setObras(os || []);
    setCajas(cs || []);
    // Reengancha lo que se puede deducir —la obra toma el proyecto de su
    // presupuesto y al revés— y devuelve lo que nadie puede adivinar.
    const { sueltos: quedan, arreglados } = await repararCadena();
    setSinCadena(quedan);
    if (arreglados) onCambio?.();
    const filas = (ls || []).filter(l => l.resultado !== "perdido");
    setSinColor(filas.length > 0 && !("color" in filas[0]));
    // Si falta la migración 055 no hay columnas por área: mejor avisarlo al
    // entrar que dejar que los botones no hagan nada.
    if (as?.length) setSinAreas(!("nivel_obra" in as[0]));
    setLeads(filas);
    const mapa = {};
    (as || []).forEach(a => {
      const nivel = a.nivel || "editar";
      (mapa[a.lead_id] = mapa[a.lead_id] || {})[a.usuario_id] = {
        nivel,
        // Una fila vieja solo tiene el nivel del proyecto: vale para todo hasta
        // que alguien toque un botón de área.
        presupuesto: a.nivel_presupuesto || nivel,
        obra: a.nivel_obra || nivel,
        libro: a.nivel_libro || nivel,
      };
    });
    setAccesos(mapa);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  // Todos menos el Director. Los Admin estaban excluidos porque "entran a
  // todo", pero entonces no había dónde decirles que en este proyecto el
  // presupuesto solo lo miran. El Director queda afuera a propósito: siempre
  // puede, y una fila suya mal puesta lo dejaría fuera de su propia app.
  const candidatos = users.filter(u => u.role !== "owner");

  /** ¿Su rol —o su excepción— le abre esa pantalla? */
  const tienePuerta = (u, campo) => {
    const puerta = PUERTA[campo];
    if (!puerta) return true;
    const propio = permisosUsuario[u.id]?.[puerta[0]];
    if (propio !== undefined && propio !== null) return !!propio;
    return !!(permisos?.[u.role]?.[puerta[0]] ?? POR_DEFECTO[u.role]?.[puerta[0]]);
  };
  const sueltos = presupuestos.filter(p => !p.lead_id && !p.archivado_at);
  // El mismo trabajo cargado dos veces: pasaba cuando se activaba una obra y
  // el pipeline creaba un proyecto nuevo en vez de usar el lead del que venía.
  const duplicados = duplicadosProbables(leads, presupuestos, obras);

  async function unir(de, a) {
    if (!window.confirm(
      `¿Unir estos dos?\n\n` +
      `SE QUEDA: “${a.nombre}”\n` +
      `SE BORRA: “${de.nombre}”\n\n` +
      `Todo lo de “${de.nombre}” —obra, presupuestos, caja chica, tareas, compras, libro, gente y bitácora— ` +
      `pasa a “${a.nombre}”. Sus etapas y su checklist no viajan: se queda el tubo de “${a.nombre}”.\n\n` +
      `El nombre que queda es “${a.nombre}”; en el paso siguiente podés cambiarlo.`
    )) return;
    setUniendo(de.id);
    const r = await fusionarLead(de, a);
    setUniendo(null);
    if (r.error) { window.alert(r.error); return; }
    if (r.avisos?.length) window.alert(`Se unieron, pero mirá esto:\n${r.avisos.join("\n")}`);
    // El nombre es lo primero que se nota, y casi siempre el bueno es el del
    // trabajo —el de la obra—, no el del lead con el que se lo persiguió.
    if (de.nombre !== a.nombre && window.confirm(`¿Cómo se llama de ahora en adelante?\n\nAceptar: “${de.nombre}”\nCancelar: dejarlo como “${a.nombre}”`)) {
      await supabase.from("leads").update({ nombre: de.nombre }).eq("id", a.id);
    }
    await cargar();
    onCambio?.();
  }

  /** Enlazar un presupuesto suelto a este proyecto. */
  async function enlazar(lead, presupuestoId) {
    const id = Number(presupuestoId);
    if (!id) return;
    setGuardando(`p${lead.id}`);
    const { error } = await supabase.from("presupuestos").update({ lead_id: lead.id }).eq("id", id);
    setGuardando(null);
    if (error) return;
    setPresupuestos(ps => ps.map(p => (p.id === id ? { ...p, lead_id: lead.id } : p)));
    onCambio?.();
  }

  async function renombrar(lead, nombre) {
    const limpio = String(nombre || "").trim();
    if (!limpio || limpio === lead.nombre) { setRenombrando(null); return; }
    setLeads(x => x.map(l => (l.id === lead.id ? { ...l, nombre: limpio } : l)));
    setRenombrando(null);
    await supabase.from("leads").update({ nombre: limpio }).eq("id", lead.id);
    onCambio?.();
  }

  async function pintar(lead, color) {
    setLeads(x => x.map(l => (l.id === lead.id ? { ...l, color } : l)));
    const { error } = await supabase.from("leads").update({ color }).eq("id", lead.id);
    if (error && /column|schema cache/i.test(error.message)) setSinColor(true);
    onCambio?.();
  }

  /**
   * El nivel de una persona en un área de un proyecto.
   *
   * Todo es explícito: nada se hereda ni se deduce. Si todavía no estaba en el
   * proyecto entra con esto y el resto en "No entra" —darle el presupuesto a
   * alguien no puede significar darle la obra de yapa—, y si las cuatro quedan
   * en "No entra" sale del proyecto, porque una fila que no permite nada es una
   * fila que confunde.
   */
  async function ponerNivelArea(lead, usuarioId, area, valor) {
    const despues = filaDeAcceso((accesos[lead.id] || {})[usuarioId], area, valor);
    const vacio = sinNingunAcceso(despues);

    setGuardando(`${lead.id}:${usuarioId}`);
    setAccesos(a => {
      const suyos = { ...(a[lead.id] || {}) };
      if (vacio) delete suyos[usuarioId]; else suyos[usuarioId] = despues;
      return { ...a, [lead.id]: suyos };
    });

    if (vacio) {
      await supabase.from("lead_accesos").delete().eq("lead_id", lead.id).eq("usuario_id", usuarioId);
    } else {
      const fila = { lead_id: lead.id, usuario_id: usuarioId };
      AREAS_PROYECTO.forEach(a => { fila[a.columna] = despues[a.campo] || "no"; });
      const { error } = await supabase.from("lead_accesos").upsert(fila, { onConflict: "lead_id,usuario_id" });
      // Sin la migración 055 no existen las columnas de área: entra igual con
      // el nivel del proyecto y la pantalla lo avisa.
      if (error && /column|schema cache/i.test(error.message)) {
        setSinAreas(true);
        await supabase.from("lead_accesos")
          .upsert({ lead_id: lead.id, usuario_id: usuarioId, nivel: fila.nivel }, { onConflict: "lead_id,usuario_id" });
      }
    }
    setGuardando(null);
    onCambio?.();
  }

  if (!leads.length) return null;

  const proyectos = leads.filter(esProyecto);
  const oportunidades = leads.filter(l => !esProyecto(l));

  return (
    <div style={{ marginBottom: 14 }}>
      {/* La regla, dicha acá para que no haya que deducirla de dos pantallas. */}
      <div style={{ fontSize: 10.5, color: colors.muted, marginBottom: 10, lineHeight: 1.5 }}>
        Acá se decide <strong>a qué entra cada uno y para qué</strong>. En Permisos se decide si ve el botón del
        módulo; prender “ver presupuestos” allá no le abre todos los presupuestos, le abre la pantalla: adentro
        salen los de lo que le des acá. El Director, los admins y quien tenga
        <strong> “Entra a todos los proyectos”</strong> entran a todo sin que haya que asignarles nada.
      </div>
      {sinColor && (
        <div style={{ fontSize: 11.5, color: colors.warning, marginBottom: 8 }}>
          Para elegir el color hace falta correr la migración 047. Lo demás funciona igual.
        </div>
      )}

      {sinCadena.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: colors.warning, letterSpacing: 0.4 }}>SIN PROYECTO · {sinCadena.length}</div>
          <div style={{ fontSize: 10, color: colors.muted, marginBottom: 6, lineHeight: 1.5 }}>
            Esto no cuelga de ningún proyecto, así que no le aparece a nadie salvo a los admins, y en Control de Obra
            sale como si fuera otra cosa. Elegile su proyecto y la cadena queda entera: presupuesto, obra y pipeline.
          </div>
          {sinCadena.map(x => (
            <div key={`${x.tipo}${x.id}`} style={{ display: "flex", gap: 6, alignItems: "center", background: colors.bg,
              border: `1px solid ${colors.warningBorder}`, borderRadius: 8, padding: "6px 8px", marginBottom: 5, flexWrap: "wrap" }}>
              <span style={{ fontSize: 9.5, fontWeight: 700, color: colors.muted, letterSpacing: 0.4 }}>{x.tipo.toUpperCase()}</span>
              <span style={{ flex: 1, minWidth: 120, fontSize: 12, color: colors.ink, overflowWrap: "anywhere" }}>{x.nombre}</span>
              <select value="" onChange={async e => { if (!e.target.value) return; await engancharAlProyecto(x, e.target.value); await cargar(); onCambio?.(); }}
                style={{ border: `1px solid ${colors.border}`, borderRadius: 8, padding: "4px 7px", fontSize: 11.5,
                  fontFamily: colors.font, color: colors.inkSoft, background: "#fff", maxWidth: 220 }}>
                <option value="">Es de…</option>
                {leads.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}

      <ProyectosRepetidos leads={leads} presupuestos={presupuestos} obras={obras} accesos={accesos}
        onUnir={unir} uniendo={uniendo} />

      <QueVeEstaPersona users={users} leads={leads} accesos={accesos} presupuestos={presupuestos}
        obras={obras} cajas={cajas} permisos={permisos} permisosUsuario={permisosUsuario} />

      {[
        [proyectos, "PROYECTOS", "Contratados o en obra. Acá hay presupuesto que respetar, obra que controlar y libro que escribir."],
        [oportunidades, "LEADS", "Todavía se persiguen. No tienen obra ni libro: solo el proyecto y, si ya se cotizó, su presupuesto."],
      ].map(([grupo, titulo, explicacion]) => (
        <div key={titulo} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: colors.muted, letterSpacing: 0.4 }}>
            {titulo} · {grupo.length}
          </div>
          <div style={{ fontSize: 10, color: colors.muted, marginBottom: 6 }}>{explicacion}</div>
          {!grupo.length && <div style={{ fontSize: 11, color: colors.muted, paddingBottom: 4 }}>Ninguno por ahora.</div>}
          {grupo.map(l => {
        const tubo = TUNELES[l.tunel || "lead"] || TUNELES.lead;
        const suyos = accesos[l.id] || {};
        const propios = presupuestos.filter(p => p.lead_id === l.id);
        const editando = abierto === l.id;
        const par = duplicados.find(d => d.nuevo === l.id);
        const otro = par && leads.find(x => x.id === par.original);
        const duplicado = otro ? { ...otro, porque: par.porque } : null;
        // Un lead no tiene obra ni libro todavía: preguntar por ellos es
        // pedirle al Director que decida sobre algo que no existe.
        const areas = esProyecto(l) ? AREAS_PROYECTO : AREAS_PROYECTO.filter(a => ["nivel", "presupuesto"].includes(a.campo));
        return (
          <div key={l.id} style={{ background: colors.bg, borderRadius: colors.radiusMd, padding: "10px 12px", marginBottom: 8,
            borderLeft: `3px solid ${l.color || tubo.color}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input type="color" value={l.color || tubo.color} onChange={e => pintar(l, e.target.value)} disabled={sinColor}
                title="Color del proyecto"
                style={{ width: 26, height: 26, border: `1px solid ${colors.border}`, borderRadius: 6, cursor: sinColor ? "not-allowed" : "pointer", padding: 2, background: "#fff", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                {renombrando === l.id ? (
                  <input autoFocus defaultValue={l.nombre}
                    onBlur={e => renombrar(l, e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") renombrar(l, e.target.value); if (e.key === "Escape") setRenombrando(null); }}
                    style={{ width: "100%", border: `1px solid ${colors.brand}`, borderRadius: 6, padding: "3px 6px",
                      fontSize: 14, fontWeight: 600, color: colors.ink, fontFamily: colors.font }} />
                ) : (
                  <div onClick={() => setRenombrando(l.id)} title="Tocá para cambiarle el nombre"
                    style={{ fontSize: 14, fontWeight: 600, color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "text" }}>
                    {l.nombre}
                    {l.resultado === "ganado" && <span style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 700, color: colors.success }}>APROBADO</span>}
                  </div>
                )}
                <div style={{ fontSize: 11, color: colors.muted }}>
                  {tubo.label} · {Object.keys(suyos).length ? `${Object.keys(suyos).length} ${Object.keys(suyos).length === 1 ? "persona" : "personas"}` : "sin gente — solo lo ven los admins"}
                  {propios.length ? ` · ${propios.length} ${propios.length === 1 ? "presupuesto" : "presupuestos"}` : ""}
                </div>
              </div>
              {duplicado && (
                <button onClick={() => unir(l, duplicado)} disabled={uniendo === l.id}
                  title={`Parece el mismo trabajo que “${duplicado.nombre}”: ${duplicado.porque}`}
                  style={{ background: colors.warningSoft, border: `1px solid ${colors.warningBorder}`, borderRadius: 8,
                    padding: "4px 8px", cursor: "pointer", color: colors.warning, fontSize: 10, fontWeight: 700,
                    fontFamily: colors.font, whiteSpace: "nowrap" }}>
                  {uniendo === l.id ? "Uniendo…" : "ES EL MISMO — UNIR"}
                </button>
              )}
              <button onClick={() => setAbierto(editando ? null : l.id)} title="¿Quién participa?"
                style={{ background: "none", border: `1px solid ${colors.border}`, borderRadius: 8, padding: "5px 8px", cursor: "pointer", color: colors.inkSoft, display: "flex" }}>
                <Pencil size={13} />
              </button>
            </div>

            {editando && (
              <div style={{ marginTop: 9, paddingTop: 9, borderTop: `1px solid ${colors.neutralSoft}` }}>
                <div style={{ fontSize: 11, color: colors.inkSoft, fontWeight: 500, marginBottom: 2 }}>
                  ¿Quién entra a este {esProyecto(l) ? "proyecto" : "lead"}, y a qué?
                </div>
                {sinAreas && (
                  <div style={{ fontSize: 10.5, color: colors.warning, marginBottom: 4 }}>
                    Falta correr la migración 055 para separar presupuesto, obra y libro. Por ahora manda “Proyecto y tareas”.
                  </div>
                )}
                <div style={{ display: "grid", gap: 5 }}>
                  {candidatos.map(u => {
                    const acceso = suyos[u.id];
                    const dentro = !!acceso;
                    return (
                      <div key={u.id} style={{ borderTop: `1px solid ${colors.neutralSoft}`, paddingTop: 7, marginTop: 3 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: dentro ? colors.ink : colors.muted, marginBottom: 3 }}>
                          {u.name}
                          {!dentro && <span style={{ fontWeight: 400 }}> · no entra a {esProyecto(l) ? "este proyecto" : "este lead"}</span>}
                        </div>
                        {areas.map(({ campo, label: etiqueta }) => {
                          const valor = (acceso?.[campo]) || "no";
                          const apagada = sinAreas && campo !== "nivel";
                          const sinPuerta = valor !== "no" && !tienePuerta(u, campo);
                          return (
                            <div key={campo} style={{ display: "flex", alignItems: "center", gap: 5, padding: "1.5px 0", opacity: apagada ? 0.45 : 1 }}>
                              <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: colors.muted }}>{etiqueta}</span>
                              {sinPuerta && (
                                <span title={`Su rol no le abre ${PUERTA[campo][1]}`}
                                  style={{ fontSize: 9.5, fontWeight: 700, color: colors.warning }}>NO VE LA PANTALLA</span>
                              )}
                              {NIVELES.map(({ id: v, label, pista }) => {
                                const activo = valor === v;
                                const color = v === "no" ? colors.muted : v === "ver" ? colors.inkSoft : colors.brand;
                                return (
                                  <button key={v} title={pista} onClick={() => ponerNivelArea(l, u.id, campo, v)}
                                    disabled={apagada || guardando === `${l.id}:${u.id}`}
                                    style={{ display: "inline-flex", alignItems: "center", gap: 3,
                                      border: `1px solid ${activo ? color : colors.border}`, background: activo ? color : "#fff",
                                      color: activo ? "#fff" : colors.inkSoft, borderRadius: 12, padding: "2px 9px", fontSize: 10.5,
                                      fontWeight: 600, cursor: apagada ? "not-allowed" : "pointer", fontFamily: colors.font, whiteSpace: "nowrap" }}>
                                    {activo && <Check size={9} />} {label}
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                  {!candidatos.length && <span style={{ fontSize: 11.5, color: colors.muted }}>Todavía no hay gente en el equipo.</span>}
                </div>
                {/* De nada sirve dar "Presupuesto: Ver" si el presupuesto no
                    cuelga de este proyecto: la persona abre la pantalla y no ve
                    nada, y nadie entiende por qué. Se dice, y se arregla acá. */}
                <div style={{ marginTop: 9, paddingTop: 8, borderTop: `1px solid ${colors.neutralSoft}` }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.4, marginBottom: 4 }}>
                    PRESUPUESTOS ENLAZADOS
                  </div>
                  {propios.length ? propios.map(p => (
                    <div key={p.id} style={{ fontSize: 11.5, color: colors.ink, padding: "1px 0" }}>· {p.nombre}</div>
                  )) : (
                    <div style={{ fontSize: 11, color: colors.warning, lineHeight: 1.5 }}>
                      Ninguno. Mientras esté así, darle “Presupuesto: Ver” a alguien no le muestra nada:
                      no hay qué mostrarle.
                    </div>
                  )}
                  {sueltos.length > 0 && (
                    <select value="" disabled={guardando === `p${l.id}`}
                      onChange={e => enlazar(l, e.target.value)}
                      style={{ marginTop: 5, width: "100%", border: `1px solid ${colors.border}`, borderRadius: 8,
                        padding: "5px 7px", fontSize: 11.5, fontFamily: colors.font, color: colors.inkSoft, background: "#fff" }}>
                      <option value="">Enlazar un presupuesto que no tiene proyecto…</option>
                      {sueltos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>
                  )}
                </div>

                {/* Unir a mano, sin esperar a que la app sospeche sola: el
                    duplicado puede llamarse distinto y no parecerse a nada. */}
                <div style={{ marginTop: 8 }}>
                  <select value="" disabled={uniendo === l.id}
                    onChange={e => { const otro = leads.find(x => String(x.id) === e.target.value); if (otro) unir(l, otro); }}
                    style={{ width: "100%", border: `1px solid ${colors.border}`, borderRadius: 8, padding: "5px 7px",
                      fontSize: 11.5, fontFamily: colors.font, color: colors.inkSoft, background: "#fff" }}>
                    <option value="">Esto es lo mismo que… (unir y borrar este)</option>
                    {leads.filter(x => x.id !== l.id).map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                  </select>
                </div>

                <div style={{ fontSize: 10.5, color: colors.muted, marginTop: 8, lineHeight: 1.5 }}>
                  <strong>No entra</strong>: no la ve ni aparece en su lista. <strong>Ver</strong>: la lee y no la toca.
                  <strong> Editar</strong>: la trabaja. Todas en “No entra” lo sacan de acá.
                  {esProyecto(l)
                    ? " Un residente típico: proyecto Editar, presupuesto Ver, obra y libro Editar."
                    : " Un lead todavía no tiene obra ni libro; esos aparecen cuando pase a Arquitectura o Construcción."}
                </div>
              </div>
            )}
            </div>
          );
          })}
        </div>
      ))}
    </div>
  );
}
