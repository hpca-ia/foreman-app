import { useState, useEffect, useCallback } from "react";
import { Plus, AlertTriangle, Clock, ArrowRight, CornerDownLeft } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import { daysUntil } from "../../lib/dates";
import Button from "../../components/ui/Button";
import { CATALOGO_BASE, etapaInfo, tempInfo, DIAS_SIN_MOVER } from "./constantes";
import { TUNELES } from "./tubo";
import ModalLead from "./ModalLead";
import NovaLeads from "./NovaLeads";
import { asegurarProyecto, obrasSueltas } from "../../lib/proyectoDeObra";

// El pipeline no es un embudo de casillas fijas: cada proyecto lleva su propio
// camino —reunión, plan masa, otra reunión— y encajarlo en una columna por
// etapa confundía más de lo que ordenaba. Se lee como una carrera: el catálogo
// de etapas es la ruta estándar con sus puntos de revisión, cada proyecto
// muestra hasta dónde llegó, y la lista se ordena por urgencia: arriba lo
// atrasado.
//
// Volver atrás es información, no una columna: un proyecto que regresó a plan
// masa no está avanzando, y la pantalla lo dice con todas sus letras.

const fmt = v => (Number(v) || 0).toLocaleString("es-EC", { maximumFractionDigits: 0 });
const dias = iso => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

export default function ModuloLeads({ currentUser, users = [], puede = () => true, onIrAObra }) {
  const [leads, setLeads] = useState([]);
  // El catálogo vive en la base porque cambia con el tiempo; si la migración
  // todavía no se corrió, se usa el de siempre.
  const [catalogo, setCatalogo] = useState(CATALOGO_BASE);
  const [rutas, setRutas] = useState({});       // lead_id -> { total, hechos, siguiente }
  const [planes, setPlanes] = useState({});     // lead_id -> { total, hechas, actual, indice }
  const [historia, setHistoria] = useState({}); // lead_id -> hasta dónde llegó en la ruta
  const [abierto, setAbierto] = useState(null);
  const [nuevo, setNuevo] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [verCerrados, setVerCerrados] = useState(false);
  const [tubo, setTubo] = useState("todos");
  const [convirtiendo, setConvirtiendo] = useState(null);
  // Obras que entraron directo por Control de Obra y todavía no son proyecto.
  const [sueltas, setSueltas] = useState([]);
  const [trayendo, setTrayendo] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    const [{ data: ls }, { data: ts }, { data: cat }, { data: es }, { data: ms }] = await Promise.all([
      supabase.from("leads").select("*").order("actualizado_at", { ascending: false }),
      supabase.from("tasks").select("id,lead_id,title,due_date,status,ruta_orden").not("lead_id", "is", null),
      supabase.from("pipeline_etapas").select("*").eq("activa", true).order("orden"),
      supabase.from("lead_etapas").select("*").order("orden"),
      supabase.from("lead_movimientos").select("lead_id,etapa_a").eq("tipo", "etapa"),
    ]);
    const ct = cat?.length ? cat : CATALOGO_BASE;
    if (cat?.length) setCatalogo(cat);

    // La ruta entera, no solo el siguiente: cuántos pasos tiene, cuántos van y
    // cuál toca ahora. Un proyecto sin pasos pendientes se quedó sin ruta.
    const porLead = {};
    (ts || []).forEach(t => {
      const r = porLead[t.lead_id] || (porLead[t.lead_id] = { total: 0, hechos: 0, siguiente: null });
      r.total++;
      if (t.status === "listo") r.hechos++;
      else if (!r.siguiente || (t.ruta_orden ?? 999) < (r.siguiente.ruta_orden ?? 999)) r.siguiente = t;
    });

    // El plan de etapas de cada proyecto, en SU orden.
    const porPlan = {};
    (es || []).forEach(e => {
      const p = porPlan[e.lead_id] || (porPlan[e.lead_id] = { total: 0, hechas: 0, actual: null, indice: 0, lista: [] });
      p.lista.push(e);
      p.total++;
      if (e.estado === "hecha" || e.estado === "omitida") p.hechas++;
      if (e.estado === "en_curso" && !p.actual) { p.actual = e; p.indice = p.lista.length; }
    });

    // Hasta dónde llegó cada uno en la ruta estándar: si hoy está más atrás, retrocedió.
    const lejos = {};
    (ms || []).forEach(m => {
      const o = etapaInfo(m.etapa_a, ct).orden || 0;
      if (o > (lejos[m.lead_id] || 0)) lejos[m.lead_id] = o;
    });

    setLeads(ls || []); setRutas(porLead); setPlanes(porPlan); setHistoria(lejos);
    setSueltas(await obrasSueltas());
    setCargando(false);
  }, []);

  async function traerObras() {
    setTrayendo(true);
    for (const o of sueltas) await asegurarProyecto(o, currentUser);
    setTrayendo(false);
    await cargar();
  }

  useEffect(() => { cargar(); }, [cargar]);

  // Ganar el proyecto no termina el trabajo: recién ahí empieza la obra. Esto
  // cierra el hilo entre lo comercial y lo que se construye.
  async function convertirEnObra(lead) {
    setConvirtiendo(lead.id);
    const { data: obra, error } = await supabase.from("obras").insert({
      nombre: lead.nombre, cliente_nombre: lead.contacto || lead.nombre,
      notas: `Viene del lead ${lead.nombre}`, created_by: currentUser?.id,
    }).select().single();
    if (!error && obra) {
      await supabase.from("leads").update({ obra_id: obra.id, etapa: "ejecucion" }).eq("id", lead.id);
      await supabase.from("lead_movimientos").insert({
        lead_id: lead.id, tipo: "nota", detalle: `Arrancó como obra: ${obra.nombre}`,
        autor_id: currentUser?.id, autor_nombre: currentUser?.name,
      });
      await cargar();
    }
    setConvirtiendo(null);
  }

  // Los tres tubos, cada uno con lo suyo: lo que se persigue por un lado, y
  // los proyectos que ya se están haciendo por el otro. Todo es el mismo
  // proyecto en distintos momentos, pero mezclarlos en una sola lista era
  // justamente lo que no dejaba ver en qué anda la oficina.
  const delTunel = l => (l.tunel || "lead");
  const cuantos = t => leads.filter(l => delTunel(l) === t && !l.resultado && !etapaInfo(l.etapa, catalogo).cierra).length;
  const enTubo = l => tubo === "todos" || delTunel(l) === tubo;

  // Un proyecto sigue abierto mientras no se haya ganado ni perdido: ganarlo
  // no lo saca de la lista, lo manda a ejecución.
  const abiertos = leads.filter(l => enTubo(l) && !l.resultado && !etapaInfo(l.etapa, catalogo).cierra);
  const cerrados = leads.filter(l => enTubo(l) && (l.resultado || etapaInfo(l.etapa, catalogo).cierra));

  // Lo que manda en la lista: la fecha más cercana entre el próximo paso y la
  // etapa en curso. Sin fecha, el proyecto se va al final: no está corriendo.
  const cuando = l => {
    const f = [rutas[l.id]?.siguiente?.due_date, planes[l.id]?.actual?.fecha_objetivo].filter(Boolean).sort();
    return f[0] || null;
  };
  const orden = (a, b) => {
    const fa = cuando(a), fb = cuando(b);
    if (fa && fb) return fa.localeCompare(fb);
    if (fa) return -1;
    if (fb) return 1;
    return new Date(a.actualizado_at) - new Date(b.actualizado_at);
  };
  // Cada proyecto lleva su propio orden: uno presupuesta antes del plan masa y
  // otro al revés. Retroceder es volver a una etapa anterior DE SU PLAN, no de
  // la ruta estándar; si no tiene plan, se compara contra la ruta estándar.
  // Cuánto vale el negocio lo ve el Director y quien lo abrió. Al resto le
  // toca su etapa, no la plata.
  const verMonto = l => currentUser?.role === "owner" || l.created_by === currentUser?.id;

  const retrocedio = l => {
    const plan = planes[l.id];
    if (plan?.lista?.length && plan.actual) {
      const i = plan.lista.findIndex(e => e.id === plan.actual.id);
      return plan.lista.some((e, j) => j > i && (e.estado === "hecha" || e.estado === "omitida"));
    }
    return (historia[l.id] || 0) > (etapaInfo(l.etapa, catalogo).orden || 0);
  };

  // Las formas de perder un negocio sin darse cuenta: no saber cuál es el
  // siguiente paso, saberlo y no haberlo dado, o ir para atrás sin notarlo.
  const sinPaso = abiertos.filter(l => !rutas[l.id]?.siguiente && !planes[l.id]?.actual);
  const estancados = abiertos.filter(l => {
    const limite = DIAS_SIN_MOVER[l.etapa];
    return limite && dias(l.actualizado_at) > limite;
  });
  const vencidos = abiertos.filter(l => { const f = cuando(l); return f && daysUntil(f) < 0; });
  const devueltos = abiertos.filter(retrocedio);

  // El final del túnel: un proyecto ganado que no arrancó como obra está a
  // medio camino, y es justo donde se pierde el hilo entre vender y construir.
  const porArrancar = leads.filter(l => l.resultado === "ganado" && !l.obra_id);

  const entre = (l, desde, hasta) => {
    const f = cuando(l);
    const d = f ? daysUntil(f) : null;
    return d != null && d >= desde && d <= hasta;
  };
  const grupos = [
    { titulo: "Atrasados", color: colors.danger, leads: abiertos.filter(l => { const f = cuando(l); return f && daysUntil(f) < 0; }) },
    { titulo: "Esta semana", color: colors.warning, leads: abiertos.filter(l => entre(l, 0, 7)) },
    { titulo: "Más adelante", color: colors.inkSoft, leads: abiertos.filter(l => entre(l, 8, 99999)) },
    { titulo: "Sin fecha", color: colors.muted, leads: abiertos.filter(l => !cuando(l)) },
  ].map(g => ({ ...g, leads: g.leads.slice().sort(orden) }));

  const enJuego = abiertos.reduce((s, l) => s + (Number(l.valor_estimado) || 0), 0);
  const ponderado = abiertos.reduce((s, l) => s + (Number(l.valor_estimado) || 0) * ((l.probabilidad ?? 50) / 100), 0);

  return (
    <div style={{ fontFamily: colors.font }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: colors.ink }}>Pipeline</div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {puede("leads.ver") && <Button variant="primary" size="md" onClick={() => setNuevo(true)}><Plus size={14} /> Nuevo proyecto</Button>}
        </div>
      </div>

      {/* Un botón por tubo: Leads es lo que se persigue, los otros dos son los
          proyectos andando. Cada uno con su cuenta, para saber dónde mirar. */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {[["todos", "Todos"], ...Object.entries(TUNELES).map(([id, t]) => [id, t.label])].map(([id, label]) => {
          const n = id === "todos" ? leads.filter(l => !l.resultado && !etapaInfo(l.etapa, catalogo).cierra).length : cuantos(id);
          const activo = tubo === id;
          return (
            <button key={id} onClick={() => setTubo(id)}
              style={{ border: `1px solid ${activo ? colors.ink : colors.border}`, background: activo ? colors.ink : "#fff",
                color: activo ? "#fff" : colors.inkSoft, borderRadius: 20, padding: "6px 14px", fontSize: 12.5, fontWeight: 600,
                cursor: "pointer", fontFamily: colors.font, display: "inline-flex", alignItems: "center", gap: 6 }}>
              {label} <span style={{ opacity: 0.7, fontWeight: 400 }}>{n}</span>
            </button>
          );
        })}
      </div>

      {puede("leads.ver") && <NovaLeads leads={leads} currentUser={currentUser} catalogo={catalogo} onCambio={cargar} />}

      {/* Lo que exige atención va primero, igual que en tareas */}
      {(vencidos.length > 0 || devueltos.length > 0 || sinPaso.length > 0 || estancados.length > 0) && (
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          {vencidos.length > 0 && (
            <Aviso n={vencidos.length} txt={vencidos.length === 1 ? "atrasado" : "atrasados"}
              Icono={AlertTriangle} color={colors.danger} bg={colors.dangerSoft} borde={colors.dangerBorder} />
          )}
          {devueltos.length > 0 && (
            <Aviso n={devueltos.length} txt={devueltos.length === 1 ? "volvió atrás" : "volvieron atrás"}
              Icono={CornerDownLeft} color={colors.warning} bg={colors.warningSoft} borde={colors.warningBorder} />
          )}
          {sinPaso.length > 0 && (
            <Aviso n={sinPaso.length} txt="sin próximo paso"
              Icono={AlertTriangle} color={colors.warning} bg={colors.warningSoft} borde={colors.warningBorder} />
          )}
          {estancados.length > 0 && (
            <Aviso n={estancados.length} txt="sin moverse" Icono={Clock} color={colors.inkSoft} bg={colors.bg} borde={colors.border} />
          )}
        </div>
      )}

      {puede("leads.ver") && sueltas.length > 0 && (
        <div style={{ background: colors.brandSoft, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: "11px 13px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200, fontSize: 12, color: colors.inkSoft }}>
            <strong style={{ color: colors.brand }}>{sueltas.length} {sueltas.length === 1 ? "obra no está" : "obras no están"} en el pipeline</strong>
            <div style={{ color: colors.muted, marginTop: 2 }}>{sueltas.slice(0, 3).map(o => o.nombre).join(" · ")}{sueltas.length > 3 ? " · …" : ""}</div>
          </div>
          <Button variant="primary" size="sm" onClick={traerObras} disabled={trayendo}>
            {trayendo ? "Trayendo…" : "Traerlas al pipeline"}
          </Button>
        </div>
      )}

      {porArrancar.length > 0 && (
        <div style={{ background: colors.successSoft, border: `1px solid ${colors.success}33`, borderRadius: colors.radiusMd, padding: "11px 13px", marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: colors.success, marginBottom: 7 }}>
            {porArrancar.length === 1 ? "Un proyecto ganado sin arrancar" : `${porArrancar.length} proyectos ganados sin arrancar`}
          </div>
          {porArrancar.map(l => (
            <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0", flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: colors.ink, flex: 1, minWidth: 120 }}>{l.nombre}</span>
              <Button variant="primary" size="sm" onClick={() => convertirEnObra(l)} disabled={convirtiendo === l.id}>
                {convirtiendo === l.id ? "Creando..." : <>Pasar a obra <ArrowRight size={12} /></>}
              </Button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 22, marginBottom: 14, flexWrap: "wrap", fontSize: 12, color: colors.inkSoft }}>
        <span><strong style={{ color: colors.ink, fontSize: 15 }}>{abiertos.length}</strong> en curso</span>
        {currentUser?.role === "owner" && <>
          <span>En juego <strong style={{ color: colors.ink, fontSize: 15 }}>${fmt(enJuego)}</strong></span>
          <span>Ponderado <strong style={{ color: colors.brand, fontSize: 15 }}>${fmt(ponderado)}</strong></span>
        </>}
      </div>

      {cargando ? <div style={{ textAlign: "center", color: colors.muted, padding: "40px 0", fontSize: 13 }}>Cargando...</div>
        : leads.length === 0 ? (
          <div style={{ textAlign: "center", color: colors.muted, padding: "50px 20px", fontSize: 13, background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd }}>
            {puede("leads.ver")
              ? <>Todavía no hay proyectos.<br />Dictale a NOVA la oportunidad y ella abre el lead. La ruta se va escribiendo sola, un paso a la vez.</>
              : <>Todavía no te compartieron ningún proyecto.<br />Vas a verlos acá cuando te pongan a cargo de una etapa.</>}
          </div>
        ) : (
          <>
            {grupos.filter(g => g.leads.length).map(g => (
              <div key={g.titulo} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: g.color, letterSpacing: 0.5, marginBottom: 6 }}>
                  {g.titulo.toUpperCase()} · {g.leads.length}
                </div>
                <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, overflow: "hidden" }}>
                  {g.leads.map(l => (
                    <FilaLead key={l.id} lead={l} ruta={rutas[l.id]} plan={planes[l.id]} catalogo={catalogo}
                      verMonto={verMonto(l)} fecha={cuando(l)} volvioAtras={retrocedio(l)} onAbrir={() => setAbierto(l)} />
                  ))}
                </div>
              </div>
            ))}

            {cerrados.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <button onClick={() => setVerCerrados(v => !v)}
                  style={{ background: "none", border: "none", color: colors.muted, fontSize: 12, cursor: "pointer", fontFamily: colors.font, padding: 0 }}>
                  {verCerrados ? "Ocultar" : "Ver"} los {cerrados.length} cerrados
                </button>
                {verCerrados && (
                  <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, marginTop: 8, overflow: "hidden" }}>
                    {cerrados.map(l => (
                      <div key={l.id} onClick={() => setAbierto(l)}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderBottom: `1px solid ${colors.neutralSoft}`, cursor: "pointer", fontSize: 12 }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: etapaInfo(l.etapa, catalogo).color, flexShrink: 0 }} />
                        <span style={{ flex: 1, minWidth: 0, color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.nombre}</span>
                        <span style={{ color: l.resultado === "ganado" ? colors.success : colors.muted, fontSize: 11, fontWeight: 600 }}>
                          {l.resultado === "ganado" ? "Ganado" : l.resultado === "perdido" ? "Perdido" : etapaInfo(l.etapa, catalogo).nombre}
                        </span>
                        <span style={{ color: colors.inkSoft }}>${fmt(l.valor_estimado)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

      {(abierto || nuevo) && (
        <ModalLead lead={abierto} currentUser={currentUser} users={users} catalogo={catalogo}
          onIrAObra={onIrAObra ? () => onIrAObra(abierto.obra_id) : null}
          onCerrar={() => { setAbierto(null); setNuevo(false); }}
          onGuardado={async () => { setAbierto(null); setNuevo(false); await cargar(); }} />
      )}
    </div>
  );
}

function Aviso({ n, txt, Icono, color, bg, borde }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, background: bg, border: `1.5px solid ${borde}`, borderRadius: colors.radiusMd, padding: "9px 13px" }}>
      <Icono size={15} color={color} />
      <span style={{ fontSize: 18, fontWeight: 700, color, lineHeight: 1 }}>{n}</span>
      <span style={{ fontSize: 12, color, fontWeight: 600 }}>{txt}</span>
    </div>
  );
}

// Una fila por proyecto: hasta dónde llegó en la ruta estándar, qué toca ahora
// y cuándo. La barra son los puntos de revisión; si volvió a una etapa
// anterior lo dice, porque un proyecto que regresa no está caminando.
function FilaLead({ lead, ruta, plan, catalogo, fecha, volvioAtras, verMonto = true, onAbrir }) {
  // Una línea por proyecto, y solo lo que hace falta para decidir si hay que
  // meterse ahí: cómo se llama, en qué etapa va, quién la tiene y para cuándo.
  //
  // Antes esta fila llevaba además el contacto, la temperatura, una barra de
  // puntos, "etapa 2 de 5", el próximo paso, el monto y "0/1 pasos". Ocho
  // datos por proyecto: con cinco proyectos ya no se leía nada. Lo demás sigue
  // adentro del proyecto, que es donde se necesita.
  const etapa = etapaInfo(plan?.actual?.etapa_id || lead.etapa, catalogo);
  const d = fecha ? daysUntil(fecha) : null;
  const vencido = d != null && d < 0;
  const responsable = plan?.actual?.responsable_nombre || lead.responsable_nombre;
  const cuandoTxt = d == null ? "sin fecha" : vencido ? `atrasado ${Math.abs(d)} d` : d === 0 ? "hoy" : d === 1 ? "mañana" : `en ${d} d`;

  return (
    <div onClick={onAbrir} className="pipeline-fila"
      style={{ borderLeft: `3px solid ${vencido ? colors.danger : etapa.color || "transparent"}` }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {lead.nombre}
          {/* La (L) dice que todavía se está persiguiendo. */}
          {(lead.tunel || "lead") === "lead" && (
            <span title="Lead: todavía se está persiguiendo"
              style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: colors.muted, border: `1px solid ${colors.border}`, borderRadius: 4, padding: "0 4px" }}>L</span>
          )}
        </div>
      </div>

      <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: etapa.color || colors.inkSoft, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{etapa.nombre}</span>
        {volvioAtras && <CornerDownLeft size={11} color={colors.warning} title="Volvió atrás" />}
      </div>

      <div style={{ minWidth: 0, fontSize: 12, color: colors.inkSoft, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {responsable || "sin responsable"}
      </div>

      <div style={{ textAlign: "right", fontSize: 12, color: vencido ? colors.danger : colors.muted, fontWeight: vencido ? 700 : 400, whiteSpace: "nowrap" }}>
        {cuandoTxt}
        {verMonto && Number(lead.valor_estimado) > 0 && (
          <div style={{ fontSize: 11, color: colors.muted, fontWeight: 400 }}>${fmt(lead.valor_estimado)}</div>
        )}
      </div>
    </div>
  );
}
