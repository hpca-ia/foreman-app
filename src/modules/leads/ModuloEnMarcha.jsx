import { useState, useEffect, useCallback } from "react";
import { ArrowRight, AlertTriangle, HardHat } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { fmt } from "../controlObra/calculos";
import { TIPOS, tipoDe, estaAprobado, CATALOGO_BASE } from "./pipeline";
import { cargarEnMarcha } from "./fichas";
import ModalLead from "./ModalLead";

// EN MARCHA: LO APROBADO.
//
// Un proyecto aprobado salió del pipeline —ya no se persigue— y vive en
// Control. Acá se ve en qué anda cada uno SIN QUE NADIE HAYA MOVIDO NADA A
// MANO: la ficha se arma sola con lo que ya saben Control de Obra, Compras,
// Tareas y el Libro. Cada renglón lleva al lugar donde eso se resuelve.
//
// No hay etapas ni «estamos acá»: en qué va una obra lo dicen su planilla y
// su plata, no una columna que alguien se acordó de marcar.
//
// Las reglas están en enMarcha.js; la plata sale de la misma cuenta que la
// lista de Control de Obra (resumenDeObras.js), así que no puede decir otro
// número.

const TONO = {
  peligro: colors.danger, atencion: colors.warning, normal: colors.ink, apagado: colors.muted,
};
// Qué permiso hace falta para que un renglón lleve a su módulo.
const PERMISO = { controlObra: "controlObra.ver", compras: "compras.ver", libro: "libro.ver" };

export default function ModuloEnMarcha({ currentUser, users = [], puede = () => true, nivelProyecto = () => null, onIr }) {
  const [fichas, setFichas] = useState([]);
  const [todos, setTodos] = useState([]);
  const [catalogo, setCatalogo] = useState(CATALOGO_BASE);
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState(null);
  const [creando, setCreando] = useState(null);
  const [error, setError] = useState("");
  const conMontos = puede("montos.ver");

  const cargar = useCallback(async () => {
    const [{ data: ls }, { data: cat }] = await Promise.all([
      supabase.from("leads").select("*").order("nombre"),
      supabase.from("pipeline_etapas").select("*").order("orden"),
    ]);
    if (cat?.length) setCatalogo(cat);
    setTodos(ls || []);
    // Solo los aprobados a los que llega esta persona.
    const suyos = (ls || []).filter(l => estaAprobado(l) && nivelProyecto(l.id));
    setFichas(await cargarEnMarcha(suyos, { conMontos }));
    setCargando(false);
    // eslint-disable-next-line
  }, [conMontos]);

  useEffect(() => { cargar(); }, [cargar]);

  // Aprobado y sin obra: es justo donde se pierde el hilo entre vender y
  // construir. La obra se crea acá, enganchada a su proyecto.
  async function crearObra(lead) {
    setCreando(lead.id); setError("");
    const fila = {
      nombre: lead.nombre, cliente_nombre: lead.contacto || lead.nombre,
      notas: `Viene del proyecto ${lead.nombre}`, created_by: currentUser?.id, lead_id: lead.id,
    };
    const { data: obra, error: e } = await supabase.from("obras").insert(fila).select().single();
    if (e || !obra) { setError(`No se pudo crear la obra: ${e?.message || "sin respuesta"}`); setCreando(null); return; }
    await supabase.from("leads").update({ obra_id: obra.id }).eq("id", lead.id);
    await supabase.from("lead_movimientos").insert({
      lead_id: lead.id, tipo: "nota", automatico: true, detalle: `Arrancó como obra: ${obra.nombre}`,
      autor_id: currentUser?.id, autor_nombre: currentUser?.name,
    });
    setCreando(null);
    await cargar();
  }

  const ir = renglon => {
    if (renglon.vista === "proyecto") return null;
    return puede(PERMISO[renglon.vista] || "") && onIr ? () => onIr(renglon.vista) : null;
  };

  return (
    <div style={{ fontFamily: colors.font }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: colors.ink }}>En marcha</div>
        <div style={{ fontSize: 12, color: colors.muted, marginTop: 1 }}>
          Lo aprobado{fichas.length ? ` · ${fichas.length}` : ""} · cada ficha se arma sola con lo que ya saben Control, Compras, Tareas y el Libro
        </div>
      </div>

      {error && <div style={{ fontSize: 12, color: colors.danger, marginBottom: 10 }}>{error}</div>}

      {cargando ? <div style={{ textAlign: "center", color: colors.muted, padding: "40px 0", fontSize: 13 }}>Cargando...</div>
        : !fichas.length ? (
          <div style={{ textAlign: "center", color: colors.muted, padding: "50px 20px", fontSize: 13, background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd }}>
            Todavía no hay proyectos aprobados.<br />Cuando un lead del Pipeline se aprueba, pasa acá.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            {fichas.map(({ lead, obra, ficha }) => {
              const tipo = TIPOS[tipoDe(lead)];
              const p = ficha.plata;
              return (
                <div key={lead.id} className="ficha-en-marcha"
                  style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd,
                    borderLeft: `3px solid ${ficha.pendientes ? colors.warning : colors.success}`, padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <button onClick={() => setAbierto(lead)} title="Abrir el proyecto: sus tareas, su historia y su gente"
                        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: colors.font, textAlign: "left",
                          fontSize: 15, fontWeight: 700, color: colors.ink }}>
                        {lead.nombre}
                      </button>
                      <div style={{ fontSize: 12, color: colors.inkSoft, marginTop: 2 }}>
                        {tipo ? <span style={{ color: tipo.color, fontWeight: 600 }}>{tipo.label}</span> : null}
                        {tipo ? " · " : ""}{ficha.enQueVa}
                      </div>
                    </div>
                    {obra && puede("controlObra.ver") && onIr && (
                      <Button variant="outline" size="sm" onClick={() => onIr("controlObra")}>
                        <HardHat size={13} /> Abrir Control <ArrowRight size={12} />
                      </Button>
                    )}
                    {!obra && tipoDe(lead) !== "diseno" && puede("controlObra.ver") && (
                      <Button variant="primary" size="sm" onClick={() => crearObra(lead)} disabled={creando === lead.id}>
                        {creando === lead.id ? "Creando..." : <>Crear la obra en Control <ArrowRight size={12} /></>}
                      </Button>
                    )}
                  </div>

                  {/* La plata: los mismos cuatro números, con los mismos nombres,
                      que la lista de Control de Obra. Solo para quien ve montos. */}
                  {p && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-end" }}>
                        <Dato label="Presupuesto" valor={`$${fmt(p.presupuesto)}`} />
                        <Dato label="Invertido" valor={`$${fmt(p.invertido)}`} />
                        <Dato label="Saldo" valor={`$${fmt(p.saldo)}`} color={p.saldo < 0 ? colors.danger : colors.success} />
                        <Dato label="Avance económico" valor={`${(p.pct * 100).toFixed(1)} %`} color={colors.brand} />
                        {p.sinAsignar > 0 && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: colors.warningSoft,
                            border: `1px solid ${colors.warningBorder}`, borderRadius: 20, padding: "4px 10px", fontSize: 11, color: colors.warning, fontWeight: 600 }}>
                            <AlertTriangle size={12} /> ${fmt(p.sinAsignar)} sin asignar a rubro
                          </span>
                        )}
                      </div>
                      <div style={{ height: 5, background: colors.neutralSoft, borderRadius: 3, marginTop: 9, overflow: "hidden" }}>
                        <div style={{ height: 5, width: `${Math.min(100, Math.max(0, p.pct * 100))}%`, background: p.saldo < 0 ? colors.danger : colors.brand }} />
                      </div>
                    </div>
                  )}

                  {/* Lo demás, un renglón por módulo. Tocar uno lleva a donde
                      eso se resuelve; el de tareas abre el proyecto. */}
                  <div style={{ marginTop: 12, borderTop: `1px solid ${colors.neutralSoft}` }}>
                    {ficha.renglones.map(r => {
                      const alTocar = r.vista === "proyecto" ? () => setAbierto(lead) : ir(r);
                      return (
                        <div key={r.clave} onClick={alTocar || undefined} className="ficha-renglon"
                          style={{ display: "grid", gridTemplateColumns: "minmax(110px, 150px) 1fr 14px", gap: 10, alignItems: "baseline",
                            padding: "8px 0", borderBottom: `1px solid ${colors.neutralSoft}`, cursor: alTocar ? "pointer" : "default" }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.4 }}>{r.modulo.toUpperCase()}</span>
                          <span style={{ fontSize: 12.5, color: TONO[r.tono] || colors.ink, fontWeight: r.tono === "peligro" || r.tono === "atencion" ? 600 : 400, overflowWrap: "anywhere" }}>
                            {r.texto}
                          </span>
                          {alTocar ? <ArrowRight size={12} color={colors.muted} /> : <span />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

      {abierto && (
        <ModalLead lead={abierto} currentUser={currentUser} users={users} todos={todos} catalogo={catalogo} puede={puede}
          editable={puede("leads.editar") && nivelProyecto(abierto.id) !== "ver"}
          onIrAObra={onIr ? () => onIr("controlObra") : null}
          onCerrar={async () => { setAbierto(null); await cargar(); }}
          onGuardado={async () => { setAbierto(null); await cargar(); }} />
      )}
    </div>
  );
}

function Dato({ label, valor, color }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: colors.muted, fontWeight: 600, letterSpacing: 0.3 }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: color || colors.ink, marginTop: 1 }}>{valor}</div>
    </div>
  );
}
