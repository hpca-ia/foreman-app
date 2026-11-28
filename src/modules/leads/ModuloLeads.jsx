import { useState, useEffect, useCallback } from "react";
import { Plus, ArrowRight, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { CATALOGO_BASE } from "./constantes";
import { TIPOS, tipoDe, sePersigue, estaAprobado, estaPerdido, hoyISO } from "./pipeline";
import { ESTADOS_DE_TARJETA, cuentasDelTablero } from "./tablero";
import TableroDelPipeline from "./TableroDelPipeline";
import ModalLead from "./ModalLead";
import NovaLeads from "./NovaLeads";
import { asegurarProyecto, obrasSueltas } from "../../lib/proyectoDeObra";

// EL PIPELINE ES LO QUE SE PERSIGUE.
//
// Se lee por TIPO de lead —Diseño, Construcción, Diseño y construcción—, que
// es lo que decide por qué etapas pasa cada uno. Desde el 27/11/2026 es un
// TABLERO: cada proyecto es una tarjeta en la columna de su etapa, que se
// arrastra a otra (TableroDelPipeline, tablero.js). Arriba, cuántos hay en
// curso, en espera, para revisar y atrasados; tocar uno apaga los demás.
//
// Lo aprobado ya no está acá: vive en Control y se lista en «En marcha».
//
// Antes cada proyecto llevaba una fila por etapa con su estado y un «estamos
// acá» que se podía marcar en tres a la vez; la lista mostraba una y adentro
// decía otra. Las reglas de ahora están en pipeline.js.

// La etapa de cada tarea: la tarjeta dice dónde más tiene algo abierto.
const COLUMNAS_TAREA = "id,lead_id,title,due_date,hora,status,type,compra_id,ruta_orden,assignee_id,espera,descartada,etapa_id";

export default function ModuloLeads({ currentUser, users = [], puede = () => true, nivelProyecto = () => null, onIrAObra, onIrEnMarcha }) {
  const [leads, setLeads] = useState([]);
  // El catálogo vive en la base porque cambia con el tiempo. Se trae entero
  // —también las etapas apagadas—: las tareas viejas las llevan de etiqueta.
  const [catalogo, setCatalogo] = useState(CATALOGO_BASE);
  const [tareas, setTareas] = useState([]);
  const [abierto, setAbierto] = useState(null);
  const [nuevo, setNuevo] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [verPerdidos, setVerPerdidos] = useState(false);
  // Tocar uno de los contadores de arriba apaga las demás tarjetas.
  const [filtro, setFiltro] = useState(null);
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

  // Cuántos en curso, en espera, para revisar y atrasados. «Toca revisar» y
  // «atrasado» son los dos avisos del pipeline: la misma cuenta que el panel
  // del dashboard y el correo de la mañana.
  const cuentas = cuentasDelTablero(perseguidos, tareasDe, hoy);

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

      {/* CUÁNTOS EN CADA ESTADO. Tocar uno deja a la vista solo esos. */}
      {perseguidos.length > 0 && (
        <div className="contadores-del-pipeline" style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
          {[["curso", "en curso"], ["espera", "en espera"], ["revisar", "toca revisar"], ["atrasado", cuentas.atrasado === 1 ? "atrasado" : "atrasados"]].map(([k, txt]) => {
            const E = ESTADOS_DE_TARJETA[k];
            return (
              <button key={k} className="contador-del-pipeline" data-estado={k} onClick={() => setFiltro(f => (f === k ? null : k))}
                style={{ display: "flex", alignItems: "center", gap: 7, background: "#fff", border: `1.5px solid ${filtro === k ? colors.ink : colors.border}`,
                  borderRadius: 12, padding: "7px 12px 7px 9px", cursor: "pointer", fontFamily: colors.font, boxShadow: filtro === k ? "0 0 0 3px rgba(17,24,39,.06)" : "none" }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: E.color }} />
                <span style={{ fontSize: 17, fontWeight: 800, color: colors.ink, lineHeight: 1 }}>{cuentas[k]}</span>
                <span style={{ fontSize: 12.5, color: colors.inkSoft, fontWeight: 600 }}>{txt}</span>
              </button>
            );
          })}
          {filtro && (
            <button onClick={() => setFiltro(null)} style={{ background: "none", border: "none", color: colors.muted, cursor: "pointer", fontFamily: colors.font, fontSize: 12, textDecoration: "underline" }}>
              ver todos
            </button>
          )}
          {puedeEditar && <span style={{ fontSize: 11.5, color: colors.muted, marginLeft: 4 }}>Mantené apretada una tarjeta y arrastrala a otra etapa · tocala para abrirla.</span>}
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
            <TableroDelPipeline leads={perseguidos} tareasDe={tareasDe} catalogo={catalogo} currentUser={currentUser} filtro={filtro}
              editableDe={l => puedeEditar && nivelProyecto(l.id) !== "ver"} onAbrir={setAbierto} onCambio={alCambiar} />

            {/* Lo aprobado salió del pipeline: tiene su lista, con la ficha de
                cada proyecto armada sola. Acá queda solo la puerta. */}
            {aprobados.length > 0 && (
              <button onClick={onIrEnMarcha} disabled={!onIrEnMarcha}
                style={{ marginTop: 14, display: "inline-flex", alignItems: "center", gap: 6, background: colors.successSoft,
                  border: `1px solid ${colors.successBorder}`, borderRadius: colors.radiusMd, padding: "8px 12px",
                  cursor: onIrEnMarcha ? "pointer" : "default", fontFamily: colors.font, fontSize: 12, color: colors.inkSoft }}>
                <strong style={{ color: colors.success }}>{aprobados.length} {aprobados.length === 1 ? "aprobado" : "aprobados"}</strong>
                {" "}{aprobados.length === 1 ? "está" : "están"} en «En marcha» <ArrowRight size={12} />
              </button>
            )}
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
