import { useState, useEffect, useCallback } from "react";
import { Plus, AlertTriangle, Hourglass, ArrowRight, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { CATALOGO_BASE } from "./constantes";
import {
  TIPOS, tipoDe, sePersigue, estaAprobado, estaPerdido, porTipo, avisosDelPipeline, hoyISO,
} from "./pipeline";
import EstadoDelLead from "./EstadoDelLead";
import ModalLead from "./ModalLead";
import NovaLeads from "./NovaLeads";
import { asegurarProyecto, obrasSueltas } from "../../lib/proyectoDeObra";

// EL PIPELINE ES LO QUE SE PERSIGUE.
//
// Se lee por TIPO de lead —Diseño, Construcción, Diseño y construcción—, que
// es lo que decide por qué etapas pasa cada uno. Cada lead está en una sola
// etapa, que se elige de un desplegable en su misma tarjeta, y dice qué sigue:
// su próximo paso con fecha, o desde cuándo espera al cliente.
//
// Lo aprobado ya no está acá: vive en Control. Queda abajo, plegado, hasta que
// tenga su propia lista.
//
// Antes cada proyecto llevaba una fila por etapa con su estado y un «estamos
// acá» que se podía marcar en tres a la vez; la lista mostraba una y adentro
// decía otra. Las reglas de ahora están en pipeline.js.

const COLUMNAS_TAREA = "id,lead_id,title,due_date,hora,status,type,compra_id,ruta_orden,assignee_id,espera";

export default function ModuloLeads({ currentUser, users = [], puede = () => true, nivelProyecto = () => null, onIrAObra }) {
  const [leads, setLeads] = useState([]);
  // El catálogo vive en la base porque cambia con el tiempo. Se trae entero
  // —también las etapas apagadas—: las tareas viejas las llevan de etiqueta.
  const [catalogo, setCatalogo] = useState(CATALOGO_BASE);
  const [tareas, setTareas] = useState([]);
  const [abierto, setAbierto] = useState(null);
  const [nuevo, setNuevo] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [verAprobados, setVerAprobados] = useState(false);
  const [verPerdidos, setVerPerdidos] = useState(false);
  // Tocar un aviso o una etapa deja ver solo eso.
  const [soloAviso, setSoloAviso] = useState(null);
  const [soloEtapa, setSoloEtapa] = useState(null);
  const [convirtiendo, setConvirtiendo] = useState(null);
  // Obras que entraron directo por Control de Obra y todavía no tienen proyecto.
  const [sueltas, setSueltas] = useState([]);
  const [trayendo, setTrayendo] = useState(false);

  const cargarTareas = useCallback(async () => {
    const { data } = await supabase.from("tasks").select(COLUMNAS_TAREA).not("lead_id", "is", null);
    setTareas(data || []);
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    const [{ data: ls }, { data: cat }] = await Promise.all([
      supabase.from("leads").select("*").order("nombre"),
      supabase.from("pipeline_etapas").select("*").order("orden"),
      cargarTareas(),
    ]);
    if (cat?.length) setCatalogo(cat);
    setLeads(ls || []);
    setSueltas(await obrasSueltas());
    setCargando(false);
  }, [cargarTareas]);

  useEffect(() => { cargar(); }, [cargar]);

  async function traerObras() {
    setTrayendo(true);
    for (const o of sueltas) await asegurarProyecto(o, currentUser);
    setTrayendo(false);
    await cargar();
  }

  // Aprobarlo no termina el trabajo: recién ahí empieza la obra. Esto cierra
  // el hilo entre lo comercial y lo que se construye.
  async function convertirEnObra(lead) {
    setConvirtiendo(lead.id);
    const fila = {
      nombre: lead.nombre, cliente_nombre: lead.contacto || lead.nombre,
      notas: `Viene del lead ${lead.nombre}`, created_by: currentUser?.id, lead_id: lead.id,
    };
    let { data: obra, error } = await supabase.from("obras").insert(fila).select().single();
    // Sin la migración 046 la obra se crea igual, sin el vínculo de vuelta.
    if (error && /column|schema cache/i.test(error.message)) {
      const { lead_id, ...resto } = fila;
      ({ data: obra, error } = await supabase.from("obras").insert(resto).select().single());
    }
    if (!error && obra) {
      await supabase.from("leads").update({ obra_id: obra.id }).eq("id", lead.id);
      await supabase.from("lead_movimientos").insert({
        lead_id: lead.id, tipo: "nota", detalle: `Arrancó como obra: ${obra.nombre}`,
        autor_id: currentUser?.id, autor_nombre: currentUser?.name,
      });
      await cargar();
    }
    setConvirtiendo(null);
  }

  // A qué proyectos llega esta persona. Todo lo que se cuenta o se lista en
  // esta pantalla pasa por acá: las cuentas de arriba no pueden hablar de
  // negocios que la lista de abajo no le muestra.
  const alcanzo = l => !!nivelProyecto(l.id);
  const puedeEditar = puede("leads.editar");
  const hoy = hoyISO();

  const mios = leads.filter(alcanzo);
  const perseguidos = mios.filter(sePersigue);
  const aprobados = mios.filter(estaAprobado);
  const perdidos = mios.filter(estaPerdido);
  const tareasDe = id => tareas.filter(t => String(t.lead_id) === String(id));

  // Los tres avisos, y nada más: llegó el día de insistir, el próximo paso
  // está vencido, o no tiene próximo paso ni espera. Es la misma lista que
  // arma el panel del dashboard y el correo de la mañana.
  const avisos = avisosDelPipeline({ leads: perseguidos, tareas, hoy });
  const claseDeAviso = Object.fromEntries(avisos.map(a => [String(a.lead_id), a.clase]));
  const cuantos = clase => avisos.filter(a => a.clase === clase).length;

  const visibles = perseguidos.filter(l =>
    (!soloAviso || claseDeAviso[String(l.id)] === soloAviso) && (!soloEtapa || l.etapa === soloEtapa));
  const grupos = porTipo(visibles, catalogo);
  // Las cuentas por etapa salen de todos, no de lo filtrado: si no, al tocar
  // una etapa las demás quedarían en cero y no se podría cambiar de una a otra.
  const cuentas = Object.fromEntries(porTipo(perseguidos, catalogo).map(g => [g.tipo, g.etapas]));

  // El final del camino: aprobado y sin obra es justo donde se pierde el hilo
  // entre vender y construir.
  const porArrancar = aprobados.filter(l => !l.obra_id && tipoDe(l) !== "diseno");

  const alCambiar = l => setLeads(ls => ls.map(x => (x.id === l.id ? { ...x, ...l } : x)));

  return (
    <div style={{ fontFamily: colors.font }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: colors.ink }}>Pipeline</div>
          <div style={{ fontSize: 12, color: colors.muted, marginTop: 1 }}>
            Lo que se persigue{perseguidos.length ? ` · ${perseguidos.length}` : ""}
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {puedeEditar && <Button variant="primary" size="md" onClick={() => setNuevo(true)}><Plus size={14} /> Nuevo lead</Button>}
        </div>
      </div>

      {puede("leads.ver") && <NovaLeads leads={perseguidos} currentUser={currentUser} catalogo={catalogo} onCambio={cargar} />}

      {/* Lo que pide que alguien haga algo va primero. Tocar un aviso deja ver
          solo esos leads. */}
      {avisos.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          {[
            ["insistir", "para insistir con el cliente", Hourglass, colors.danger, colors.dangerSoft, colors.dangerBorder],
            ["vencido", "con el próximo paso vencido", AlertTriangle, colors.danger, colors.dangerSoft, colors.dangerBorder],
            ["sin_paso", "sin próximo paso con fecha", AlertTriangle, colors.warning, colors.warningSoft, colors.warningBorder],
          ].filter(([clase]) => cuantos(clase) > 0).map(([clase, txt, Icono, color, bg, borde]) => (
            <button key={clase} onClick={() => setSoloAviso(a => (a === clase ? null : clase))}
              style={{ display: "flex", alignItems: "center", gap: 8, background: bg, border: `1.5px solid ${soloAviso === clase ? color : borde}`,
                borderRadius: colors.radiusMd, padding: "9px 13px", cursor: "pointer", fontFamily: colors.font }}>
              <Icono size={15} color={color} />
              <span style={{ fontSize: 18, fontWeight: 700, color, lineHeight: 1 }}>{cuantos(clase)}</span>
              <span style={{ fontSize: 12, color, fontWeight: 600 }}>{txt}</span>
            </button>
          ))}
          {(soloAviso || soloEtapa) && (
            <button onClick={() => { setSoloAviso(null); setSoloEtapa(null); }}
              style={{ border: `1px solid ${colors.border}`, background: "#fff", borderRadius: colors.radiusMd, padding: "9px 13px", cursor: "pointer",
                fontFamily: colors.font, fontSize: 12, color: colors.inkSoft }}>
              Ver todos
            </button>
          )}
        </div>
      )}

      {puede("leads.ver") && sueltas.length > 0 && (
        <div style={{ background: colors.brandSoft, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: "11px 13px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200, fontSize: 12, color: colors.inkSoft }}>
            <strong style={{ color: colors.brand }}>{sueltas.length} {sueltas.length === 1 ? "obra de Control no tiene" : "obras de Control no tienen"} su proyecto</strong>
            <div style={{ color: colors.muted, marginTop: 2 }}>{sueltas.slice(0, 3).map(o => o.nombre).join(" · ")}{sueltas.length > 3 ? " · …" : ""}</div>
          </div>
          <Button variant="primary" size="sm" onClick={traerObras} disabled={trayendo}>
            {trayendo ? "Creando…" : "Crear su proyecto"}
          </Button>
        </div>
      )}

      {porArrancar.length > 0 && (
        <div style={{ background: colors.successSoft, border: `1px solid ${colors.success}33`, borderRadius: colors.radiusMd, padding: "11px 13px", marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: colors.success, marginBottom: 7 }}>
            {porArrancar.length === 1 ? "Un proyecto aprobado sin obra en Control" : `${porArrancar.length} proyectos aprobados sin obra en Control`}
          </div>
          {porArrancar.map(l => (
            <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0", flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: colors.ink, flex: 1, minWidth: 120 }}>{l.nombre}</span>
              <Button variant="primary" size="sm" onClick={() => convertirEnObra(l)} disabled={convirtiendo === l.id}>
                {convirtiendo === l.id ? "Creando..." : <>Crear la obra <ArrowRight size={12} /></>}
              </Button>
            </div>
          ))}
        </div>
      )}

      {cargando ? <div style={{ textAlign: "center", color: colors.muted, padding: "40px 0", fontSize: 13 }}>Cargando...</div>
        : mios.length === 0 ? (
          <div style={{ textAlign: "center", color: colors.muted, padding: "50px 20px", fontSize: 13, background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd }}>
            {puede("leads.ver")
              ? <>Todavía no hay leads.<br />Dictale a NOVA la oportunidad y ella lo abre, o tocá «Nuevo lead».</>
              : <>Todavía no te compartieron ningún proyecto.<br />Vas a verlos acá cuando te den acceso.</>}
          </div>
        ) : (
          <>
            {!perseguidos.length && (
              <div style={{ textAlign: "center", color: colors.muted, padding: "30px 20px", fontSize: 13, background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, marginBottom: 14 }}>
                Hoy no se está persiguiendo nada.
              </div>
            )}
            {perseguidos.length > 0 && !visibles.length && (
              <div style={{ color: colors.muted, fontSize: 13, padding: "10px 0 16px" }}>
                Ningún lead con ese filtro.{" "}
                <button onClick={() => { setSoloAviso(null); setSoloEtapa(null); }}
                  style={{ background: "none", border: "none", padding: 0, color: colors.brand, cursor: "pointer", fontFamily: colors.font, fontSize: 13, textDecoration: "underline" }}>
                  Ver todos
                </button>
              </div>
            )}

            {/* El título principal es el tipo de lead. Debajo, cuántos hay en
                cada etapa de ese tipo; tocar una deja ver solo esa. */}
            {grupos.map(g => (
              <div key={g.tipo || "sin"} style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: g.color }}>{g.label}</span>
                  <span style={{ fontSize: 12, color: colors.muted }}>{g.leads.length}</span>
                  {!g.tipo && <span style={{ fontSize: 11.5, color: colors.warning }}>Elegí de qué tipo es cada uno: eso decide sus etapas.</span>}
                </div>
                {(cuentas[g.tipo] || []).some(e => e.cuantos > 0) && (
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
                    {(cuentas[g.tipo] || []).map(e => {
                      const activa = soloEtapa === e.id;
                      return (
                        <button key={e.id} disabled={!e.cuantos} onClick={() => setSoloEtapa(activa ? null : e.id)}
                          style={{ border: `1px solid ${activa ? g.color : colors.border}`, background: activa ? g.color : e.cuantos ? "#fff" : "transparent",
                            color: activa ? "#fff" : e.cuantos ? colors.inkSoft : colors.muted, borderRadius: 14, padding: "3px 10px", fontSize: 11.5,
                            cursor: e.cuantos ? "pointer" : "default", fontFamily: colors.font, opacity: e.cuantos ? 1 : 0.7 }}>
                          {e.nombre}{e.cuantos ? <strong style={{ marginLeft: 5 }}>{e.cuantos}</strong> : null}
                        </button>
                      );
                    })}
                  </div>
                )}
                <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, overflow: "hidden" }}>
                  {g.leads.map(l => {
                    const clase = claseDeAviso[String(l.id)];
                    return (
                      <div key={l.id} className="lead-tarjeta" onClick={() => setAbierto(l)}
                        style={{ borderLeft: `3px solid ${clase === "sin_paso" ? colors.warning : clase ? colors.danger : g.color}` }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: colors.ink, overflowWrap: "anywhere" }}>{l.nombre}</div>
                          <div style={{ fontSize: 11.5, color: colors.muted, marginTop: 1 }}>
                            {[l.contacto, l.responsable_nombre].filter(Boolean).join(" · ") || "sin responsable"}
                          </div>
                        </div>
                        <EstadoDelLead lead={l} tareas={tareasDe(l.id)} catalogo={catalogo} currentUser={currentUser}
                          editable={puedeEditar && nivelProyecto(l.id) !== "ver"} onCambio={alCambiar} onTareas={cargarTareas} />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Lo aprobado salió del pipeline: vive en Control. Queda acá
                abajo, plegado, para poder abrir su proyecto —sus tareas, su
                historia, su gente—. */}
            <Cerrados titulo="Aprobados" lista={aprobados} abierto={verAprobados} onAbrir={() => setVerAprobados(v => !v)}
              onElegir={setAbierto} detalle={l => (l.obra_id ? "en Control" : "sin obra")} color={colors.success}
              ayuda="Salieron del pipeline: se llevan en Control." />
            <Cerrados titulo="Perdidos" lista={perdidos} abierto={verPerdidos} onAbrir={() => setVerPerdidos(v => !v)}
              onElegir={setAbierto} detalle={l => l.motivo_perdida || "sin motivo"} color={colors.muted} />
          </>
        )}

      {(abierto || nuevo) && (
        <ModalLead lead={abierto} currentUser={currentUser} users={users} todos={leads} catalogo={catalogo} puede={puede} editable={puedeEditar}
          onIrAObra={onIrAObra ? () => onIrAObra(abierto.obra_id) : null}
          onCerrar={async () => { setAbierto(null); setNuevo(false); await cargar(); }}
          onGuardado={async () => { setAbierto(null); setNuevo(false); await cargar(); }} />
      )}
    </div>
  );
}

// Los que ya no se persiguen: una línea plegada, y adentro una fila por cada uno.
function Cerrados({ titulo, lista, abierto, onAbrir, onElegir, detalle, color, ayuda }) {
  if (!lista.length) return null;
  return (
    <div style={{ marginTop: 14 }}>
      <button onClick={onAbrir}
        style={{ background: "none", border: "none", color: colors.inkSoft, fontSize: 12, cursor: "pointer", fontFamily: colors.font, padding: 0,
          display: "inline-flex", alignItems: "center", gap: 4 }}>
        {abierto ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <strong style={{ color }}>{titulo}</strong> · {lista.length}
        {ayuda && <span style={{ color: colors.muted, marginLeft: 6 }}>{ayuda}</span>}
      </button>
      {abierto && (
        <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, marginTop: 8, overflow: "hidden" }}>
          {lista.map(l => (
            <div key={l.id} onClick={() => onElegir(l)}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderBottom: `1px solid ${colors.neutralSoft}`, cursor: "pointer", fontSize: 12.5 }}>
              <span style={{ flex: 1, minWidth: 0, color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.nombre}</span>
              {tipoDe(l) && <span style={{ color: colors.muted, fontSize: 11 }}>{TIPOS[tipoDe(l)].label}</span>}
              <span style={{ color: colors.inkSoft, fontSize: 11.5, maxWidth: "45%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{detalle(l)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
