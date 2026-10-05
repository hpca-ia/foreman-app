import { useEffect, useState, useCallback } from "react";
import { Plus, ChevronLeft, HardHat, Trash2, Check, X } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import { PARAMETROS, RECARGOS, calcularNomina } from "./nomina";

// Mano de obra: quién vino, cuántas horas, y cuánto se le paga.
//
// El circuito es el del Excel, con una sola diferencia que es la que importa:
// LA ASISTENCIA LA ANOTA EL RESIDENTE EL MISMO DÍA, en la obra, que es donde la
// sabe. Un parte reconstruido el viernes es una invención con buena intención,
// y de ahí salen las discusiones de fin de mes que no se pueden resolver
// porque nadie tiene con qué.
//
// Le sirve a cuatro y por eso no cuelga de ninguno: al residente para contar,
// al libro de obra como dato —cuánta gente hubo cada día es la mitad de lo que
// se discute cuando hay un atraso—, a la administración para pagar, y al
// control de obra para que ese gasto, que es entre el 25 y el 40 por ciento de
// una obra, entre donde tiene que entrar.

const hoy = () => new Date().toISOString().split("T")[0];
const dia = f => (f ? new Date(`${String(f).slice(0, 10)}T12:00:00`).toLocaleDateString("es-EC", { weekday: "short", day: "numeric", month: "short" }) : "");
const fmt = v => (Number(v) || 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ModuloManoDeObra({ currentUser, puede, nivelProyecto }) {
  const [proyectos, setProyectos] = useState([]);
  const [lead, setLead] = useState(null);
  const [personal, setPersonal] = useState([]);
  const [asistencia, setAsistencia] = useState({});
  const [fecha, setFecha] = useState(hoy());
  const [solapa, setSolapa] = useState("dia");
  const [cargando, setCargando] = useState(true);
  const [sinTablas, setSinTablas] = useState(false);
  const [nuevo, setNuevo] = useState(null);
  const [error, setError] = useState("");
  const [periodo, setPeriodo] = useState({ desde: "", hasta: hoy() });

  useEffect(() => {
    supabase.from("leads").select("id,nombre,resultado,obra_id").order("nombre")
      .then(({ data }) => {
        setProyectos((data || []).filter(l => l.resultado !== "perdido"));
        setCargando(false);
      });
  }, []);

  const cargar = useCallback(async () => {
    if (!lead?.id) return;
    const { data: gente, error: e } = await supabase.from("obra_personal")
      .select("*").eq("lead_id", lead.id).eq("activo", true).order("nombre");
    if (e) { setSinTablas(/relation|does not exist|schema cache/i.test(e.message)); return; }
    setPersonal(gente || []);
    const { data: dias } = await supabase.from("obra_asistencia")
      .select("*").eq("lead_id", lead.id)
      .gte("fecha", periodo.desde || "1900-01-01").lte("fecha", periodo.hasta || hoy());
    const mapa = {};
    (dias || []).forEach(d => { (mapa[d.personal_id] = mapa[d.personal_id] || []).push(d); });
    setAsistencia(mapa);
  }, [lead?.id, periodo.desde, periodo.hasta]);
  useEffect(() => { cargar(); }, [cargar]);

  // El período arranca el 1 del mes: es como se paga, y evita que el primer
  // rol salga con los días de toda la historia de la obra.
  useEffect(() => {
    if (lead && !periodo.desde) {
      const d = new Date(); d.setDate(1);
      setPeriodo(p => ({ ...p, desde: d.toISOString().split("T")[0] }));
    }
  }, [lead, periodo.desde]);

  const editable = !lead || nivelProyecto?.(lead.id) === "editar";

  if (cargando) return <Centro>Cargando…</Centro>;

  if (!lead) {
    const mios = proyectos.filter(p => !nivelProyecto || !!nivelProyecto(p.id));
    return (
      <div style={{ fontFamily: colors.font }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: colors.ink, marginBottom: 4 }}>Mano de obra</div>
        <div style={{ fontSize: 12.5, color: colors.muted, marginBottom: 14 }}>
          Quién vino, cuántas horas, y cuánto se le paga.
        </div>
        {!mios.length ? <Centro>No tenés proyectos asignados.</Centro> : (
          <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, overflow: "hidden" }}>
            {mios.map(p => (
              <button key={p.id} onClick={() => setLead(p)}
                style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 9,
                  padding: "11px 13px", background: "none", border: "none", borderTop: `1px solid ${colors.neutralSoft}`,
                  cursor: "pointer", fontFamily: colors.font, fontSize: 13.5, color: colors.ink }}>
                <HardHat size={15} color={colors.muted} /> {p.nombre}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (sinTablas) {
    return (<div style={{ fontFamily: colors.font }}><Volver onClick={() => setLead(null)} />
      <Aviso>Falta correr la migración 075 para usar mano de obra.</Aviso></div>);
  }

  const delDia = id => (asistencia[id] || []).find(d => d.fecha === fecha);
  const nomina = calcularNomina({ personal, asistencia, par: PARAMETROS });

  async function marcar(p, campos) {
    const ya = delDia(p.id);
    if (ya) await supabase.from("obra_asistencia").update(campos).eq("id", ya.id);
    else {
      await supabase.from("obra_asistencia").insert({
        lead_id: lead.id, obra_id: lead.obra_id || null, personal_id: p.id, fecha,
        dias: 1, ...campos, anotado_por: currentUser?.id ?? null,
      });
    }
    await cargar();
  }

  async function agregarPersona() {
    if (!nuevo?.nombre?.trim()) return;
    setError("");
    const { error: e } = await supabase.from("obra_personal").insert({
      lead_id: lead.id, obra_id: lead.obra_id || null,
      nombre: nuevo.nombre.trim(), cedula: nuevo.cedula?.trim() || null,
      cargo: nuevo.cargo?.trim() || null,
      salario_mensual: Number(nuevo.salario) || 0,
      acumula_fondos: !!nuevo.fondos,
      fecha_ingreso: nuevo.ingreso || hoy(),
    });
    if (e) { setError(e.message); return; }
    setNuevo(null); await cargar();
  }

  return (
    <div style={{ fontFamily: colors.font }}>
      <Volver onClick={() => setLead(null)} />
      <div style={{ fontSize: 16, fontWeight: 700, color: colors.ink, marginBottom: 2 }}>{lead.nombre}</div>
      <div style={{ fontSize: 11.5, color: colors.muted, marginBottom: 12 }}>
        {personal.length} {personal.length === 1 ? "persona" : "personas"} en la obra
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 12, borderBottom: `1px solid ${colors.border}` }}>
        {[["dia", "Asistencia del día"], ["rol", "Rol del período"], ["gente", "La gente"]].map(([id, label]) => (
          <button key={id} onClick={() => setSolapa(id)}
            style={{ padding: "7px 13px", border: "none", background: "transparent",
              borderBottom: solapa === id ? `2px solid ${colors.brand}` : "2px solid transparent",
              color: solapa === id ? colors.brand : colors.inkSoft,
              fontSize: 12.5, fontWeight: solapa === id ? 600 : 400, cursor: "pointer", fontFamily: colors.font }}>
            {label}
          </button>
        ))}
      </div>

      {error && <div style={{ fontSize: 12, color: colors.danger, marginBottom: 8 }}>{error}</div>}

      {/* ── La asistencia del día. Lo que se hace parado en la obra. ──── */}
      {solapa === "dia" && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
              style={{ ...inputStyle, width: 160, padding: "6px 9px", fontSize: 12.5 }} />
            <span style={{ fontSize: 12, color: colors.muted }}>{dia(fecha)}</span>
            {editable && personal.length > 0 && (
              <Button variant="outline" size="sm" onClick={async () => {
                // Todos presentes de un toque: es lo normal, y marcar doce
                // casillas una por una hace que nadie lo haga a diario.
                for (const p of personal) if (!delDia(p.id)) await marcar(p, { dias: 1 });
              }}>Vinieron todos</Button>
            )}
          </div>

          {!personal.length ? (
            <Centro>Todavía no hay nadie cargado. Andá a “La gente”.</Centro>
          ) : (
            <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, overflow: "hidden" }}>
              {personal.map(p => {
                const d = delDia(p.id);
                const vino = d ? Number(d.dias) : null;
                return (
                  <div key={p.id} style={{ display: "grid", gridTemplateColumns: "minmax(140px,1.4fr) auto", gap: 8,
                    alignItems: "center", padding: "9px 12px", borderTop: `1px solid ${colors.neutralSoft}` }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nombre}</div>
                      <div style={{ fontSize: 10.5, color: colors.muted }}>{p.cargo || "—"} · ${fmt(p.salario_mensual)}</div>
                    </div>
                    <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {[[1, "Vino"], [0.5, "½ día"], [0, "Faltó"]].map(([v, label]) => (
                        <button key={v} disabled={!editable} onClick={() => marcar(p, { dias: v })}
                          style={{ border: `1px solid ${vino === v ? colors.brand : colors.border}`,
                            background: vino === v ? colors.brand : "#fff", color: vino === v ? "#fff" : colors.inkSoft,
                            borderRadius: 7, padding: "5px 10px", fontSize: 11.5, fontWeight: 600,
                            cursor: editable ? "pointer" : "default", fontFamily: colors.font }}>
                          {label}
                        </button>
                      ))}
                      {/* Las horas extras, al lado y no en otra pantalla: se
                          saben el mismo día y después nadie se acuerda. */}
                      {vino > 0 && RECARGOS.map(r => (
                        <input key={r.id} type="number" min="0" step="0.5" title={`Horas al ${r.label} — ${r.pista}`}
                          value={d?.[r.id] || ""} disabled={!editable}
                          onChange={e => marcar(p, { [r.id]: Number(e.target.value) || 0 })}
                          placeholder={r.label}
                          style={{ ...inputStyle, width: 54, padding: "4px 5px", fontSize: 11, textAlign: "center" }} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── El rol: lo que se paga. ───────────────────────────────────── */}
      {solapa === "rol" && (
        <>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
            <input type="date" value={periodo.desde} onChange={e => setPeriodo(p => ({ ...p, desde: e.target.value }))}
              style={{ ...inputStyle, width: 150, padding: "6px 9px", fontSize: 12.5 }} />
            <span style={{ fontSize: 12, color: colors.muted }}>al</span>
            <input type="date" value={periodo.hasta} onChange={e => setPeriodo(p => ({ ...p, hasta: e.target.value }))}
              style={{ ...inputStyle, width: 150, padding: "6px 9px", fontSize: 12.5 }} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10, marginBottom: 12 }}>
            <Tarjeta label="Sueldos y extras" valor={nomina.ingresos} />
            <Tarjeta label="Beneficios de ley" valor={nomina.beneficios} />
            <Tarjeta label="Descuentos" valor={nomina.descuentos} color={colors.muted} />
            <Tarjeta label="A pagar" valor={nomina.aPagar} color={colors.brand} />
          </div>

          <div style={{ overflowX: "auto", background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd }}>
            <div style={{ minWidth: 620 }}>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(150px,1.4fr) 50px 90px 90px 90px 90px", gap: 7,
                padding: "8px 12px", background: colors.bg, fontSize: 9, fontWeight: 700, color: colors.muted, letterSpacing: 0.3 }}>
                <span>PERSONA</span>
                <span style={{ textAlign: "center" }}>DÍAS</span>
                <span style={{ textAlign: "right" }}>SUELDO</span>
                <span style={{ textAlign: "right" }}>EXTRAS</span>
                <span style={{ textAlign: "right" }}>DESCUENTOS</span>
                <span style={{ textAlign: "right" }}>A PAGAR</span>
              </div>
              {nomina.lineas.map(l => (
                <div key={l.persona.id} style={{ display: "grid", gridTemplateColumns: "minmax(150px,1.4fr) 50px 90px 90px 90px 90px",
                  gap: 7, padding: "8px 12px", borderTop: `1px solid ${colors.neutralSoft}`, fontSize: 12, alignItems: "center" }}>
                  <span style={{ color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.persona.nombre}</span>
                  <span style={{ textAlign: "center", color: colors.inkSoft }}>{l.asistencia.dias}</span>
                  <span style={{ textAlign: "right", color: colors.inkSoft }}>${fmt(l.sueldoPeriodo)}</span>
                  <span style={{ textAlign: "right", color: colors.inkSoft }}>${fmt(l.totalExtras)}</span>
                  <span style={{ textAlign: "right", color: colors.muted }}>−${fmt(l.descuentos)}</span>
                  <span style={{ textAlign: "right", fontWeight: 700, color: colors.ink }}>${fmt(l.aPagar)}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ fontSize: 10.5, color: colors.muted, marginTop: 7, lineHeight: 1.55 }}>
            Las cuentas son las de tu planilla: sueldo = salario ÷ 30 × días, hora extra sobre salario ÷ 240,
            décimo tercero ÷ 12, décimo cuarto básico ÷ 360 × días, vacaciones ÷ 24, fondos 8,33% y aporte 9,45%.
            Los anticipos y préstamos se cargan al cerrar el rol.
          </div>
        </>
      )}

      {/* ── La gente. ─────────────────────────────────────────────────── */}
      {solapa === "gente" && (
        <>
          {editable && (nuevo ? (
            <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 12, marginBottom: 12, display: "grid", gap: 8 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 8 }}>
                <input autoFocus value={nuevo.nombre} onChange={e => setNuevo(v => ({ ...v, nombre: e.target.value }))}
                  placeholder="Nombre y apellido" style={inputStyle} />
                <input value={nuevo.cedula || ""} onChange={e => setNuevo(v => ({ ...v, cedula: e.target.value }))}
                  placeholder="Cédula" style={inputStyle} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 150px", gap: 8 }}>
                <input value={nuevo.cargo || ""} onChange={e => setNuevo(v => ({ ...v, cargo: e.target.value }))}
                  placeholder="Cargo. Ej: albañil, peón, chofer" style={inputStyle} />
                <input type="number" step="0.01" value={nuevo.salario || ""} onChange={e => setNuevo(v => ({ ...v, salario: e.target.value }))}
                  placeholder="Salario mensual" style={inputStyle} />
                <input type="date" value={nuevo.ingreso || hoy()} onChange={e => setNuevo(v => ({ ...v, ingreso: e.target.value }))} style={inputStyle} />
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: colors.inkSoft, cursor: "pointer" }}>
                <input type="checkbox" checked={!!nuevo.fondos} onChange={e => setNuevo(v => ({ ...v, fondos: e.target.checked }))} />
                Acumula fondos de reserva
              </label>
              <div style={{ display: "flex", gap: 6 }}>
                <Button variant="primary" size="sm" onClick={agregarPersona}><Check size={13} /> Guardar</Button>
                <Button variant="secondary" size="sm" onClick={() => setNuevo(null)}><X size={13} /> Cancelar</Button>
              </div>
            </div>
          ) : (
            <Button variant="primary" size="sm" onClick={() => setNuevo({ nombre: "", ingreso: hoy() })}>
              <Plus size={13} /> Sumar a alguien
            </Button>
          ))}

          <div style={{ marginTop: 12, background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, overflow: "hidden" }}>
            {!personal.length ? <Centro>Todavía no hay nadie.</Centro> : personal.map(p => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderTop: `1px solid ${colors.neutralSoft}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: colors.ink }}>{p.nombre}</div>
                  <div style={{ fontSize: 10.5, color: colors.muted }}>
                    {p.cargo || "sin cargo"} · ${fmt(p.salario_mensual)} al mes
                    {p.acumula_fondos ? " · acumula fondos" : ""}
                    {p.cedula ? ` · ${p.cedula}` : ""}
                  </div>
                </div>
                {editable && (
                  <button onClick={async () => {
                    // Se da de baja, no se borra: su asistencia y sus roles
                    // pasados tienen que seguir existiendo.
                    if (!window.confirm(`¿Dar de baja a ${p.nombre}? Lo anotado hasta hoy no se borra.`)) return;
                    await supabase.from("obra_personal").update({ activo: false, fecha_salida: hoy() }).eq("id", p.id);
                    await cargar();
                  }} style={{ background: "none", border: "none", color: colors.muted, cursor: "pointer", display: "flex", padding: 3 }}>
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const Volver = ({ onClick }) => (
  <button onClick={onClick} style={{ background: "none", border: "none", color: colors.inkSoft, fontSize: 12.5,
    cursor: "pointer", fontFamily: colors.font, display: "flex", alignItems: "center", gap: 4, padding: 0, marginBottom: 10 }}>
    <ChevronLeft size={14} /> Mano de obra
  </button>
);

const Centro = ({ children }) => (
  <div style={{ textAlign: "center", padding: "36px 20px", color: colors.muted, fontSize: 13, lineHeight: 1.6 }}>{children}</div>
);

const Aviso = ({ children }) => (
  <div style={{ fontSize: 12.5, color: colors.warning, background: colors.warningSoft,
    border: `1px solid ${colors.warningBorder}`, borderRadius: colors.radiusMd, padding: 13 }}>{children}</div>
);

function Tarjeta({ label, valor, color }) {
  return (
    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: "10px 12px" }}>
      <div style={{ fontSize: 9.5, color: colors.muted, fontWeight: 700, letterSpacing: 0.4 }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color: color || colors.ink, marginTop: 2 }}>${fmt(valor)}</div>
    </div>
  );
}
