import { useEffect, useState, useCallback } from "react";
import PlanSemanal from "./PlanSemanal";
import { BookOpen, ChevronLeft } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import DiaDeObra from "./DiaDeObra";
import { diasDe, hoyEnObra } from "./libro";

// Libro de Obra: el registro diario de cada obra.
//
// Se entra por el proyecto y se cae en el día de hoy, que es lo que el
// residente necesita el 95% de las veces: abrir, escribir lo que pasó, sacar
// una foto y seguir trabajando. El historial está ahí al lado para cuando hace
// falta mirar atrás.

const diaLargo = f => new Date(`${f}T12:00:00`).toLocaleDateString("es-EC", { weekday: "long", day: "numeric", month: "long" });

export default function ModuloLibro({ currentUser, puede, nivelProyecto = () => null }) {
  // El permiso "ver libro de obra" abre la pantalla; qué obras salen acá lo
  // decide el proyecto de cada una.
  const [todos, setTodos] = useState([]);
  const [lead, setLead] = useState(null);
  const [dias, setDias] = useState([]);
  const [fecha, setFecha] = useState(null);
  const [sinTablas, setSinTablas] = useState(false);
  const [cargando, setCargando] = useState(true);
  // Las dos mitades del mismo día: lo que va a pasar y lo que pasó. Juntas y
  // no en módulos distintos, porque el valor está en compararlas — y porque
  // dos pantallas que piden lo mismo al residente terminan con una vacía.
  const [vista, setVista] = useState("libro");
  // Los accesos llegan después que la lista: por eso se filtra al pintar y no
  // al cargar, que si no la primera vuelta deja la pantalla vacía.
  const proyectos = todos.filter(l => !!nivelProyecto(l.id));

  useEffect(() => {
    supabase.from("leads").select("id,nombre,tunel,resultado,obra_id").order("nombre").then(({ data }) => {
      // El libro es de las obras: los leads que todavía se persiguen no tienen
      // días que registrar.
      setTodos((data || []).filter(l => l.resultado !== "perdido" && (l.tunel || "lead") !== "lead"));
      setCargando(false);
    });
  }, []);

  const cargarDias = useCallback(async id => {
    const { dias: ds, sinTablas: falta } = await diasDe(id);
    setSinTablas(falta);
    setDias(ds);
  }, []);

  useEffect(() => { if (lead?.id) cargarDias(lead.id); }, [lead?.id, cargarDias]);

  if (sinTablas) {
    return (
      <div style={{ fontFamily: colors.font }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: colors.ink, marginBottom: 12 }}>Libro de Obra</div>
        <div style={{ fontSize: 12.5, color: colors.warning, background: colors.warningSoft, border: `1px solid ${colors.warningBorder}`, borderRadius: colors.radiusMd, padding: 14 }}>
          Falta correr la migración 054 en Supabase para usar el Libro de Obra.
        </div>
      </div>
    );
  }

  // Un día abierto: el de hoy, o el que se eligió del historial.
  if (lead && fecha) {
    return (
      <div style={{ fontFamily: colors.font }}>
        <button onClick={() => setFecha(null)}
          style={{ background: "none", border: "none", color: colors.inkSoft, fontSize: 12.5, cursor: "pointer", fontFamily: colors.font, display: "flex", alignItems: "center", gap: 4, padding: 0, marginBottom: 10 }}>
          <ChevronLeft size={14} /> {lead.nombre}
        </button>
        <DiaDeObra lead={lead} fecha={fecha} currentUser={currentUser}
          puedeEscribir={nivelProyecto(lead.id) === "editar"}
          onCambio={() => cargarDias(lead.id)} />
      </div>
    );
  }

  // Un proyecto: sus días.
  if (lead) {
    const hoy = hoyEnObra();
    const hayHoy = dias.some(d => d.fecha === hoy);
    return (
      <div style={{ fontFamily: colors.font }}>
        <button onClick={() => { setLead(null); setDias([]); }}
          style={{ background: "none", border: "none", color: colors.inkSoft, fontSize: 12.5, cursor: "pointer", fontFamily: colors.font, display: "flex", alignItems: "center", gap: 4, padding: 0, marginBottom: 10 }}>
          <ChevronLeft size={14} /> Libro de Obra
        </button>
        <div style={{ fontSize: 17, fontWeight: 700, color: colors.ink, marginBottom: 12 }}>{lead.nombre}</div>

        <div style={{ display: "inline-flex", gap: 3, background: colors.neutralSoft, borderRadius: 8, padding: 3, marginBottom: 14 }}>
          {[["libro", "Lo que pasó"], ["plan", "Lo que viene"]].map(([v, l]) => (
            <button key={v} onClick={() => setVista(v)}
              style={{ padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer", fontFamily: colors.font,
                fontSize: 12.5, fontWeight: 600, background: vista === v ? "#fff" : "transparent",
                color: vista === v ? colors.brand : colors.inkSoft }}>{l}</button>
          ))}
        </div>

        {vista === "plan" ? (
          <PlanSemanal lead={lead} currentUser={currentUser}
            puedeEscribir={nivelProyecto(lead.id) === "editar"} />
        ) : (
        <>
        <button onClick={() => setFecha(hoy)}
          style={{ width: "100%", background: colors.brand, border: "none", borderRadius: colors.radiusMd, padding: "14px 16px",
            color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: colors.font, textAlign: "left", marginBottom: 14 }}>
          {hayHoy ? "Seguir el libro de hoy" : "Abrir el libro de hoy"}
          <div style={{ fontSize: 11.5, fontWeight: 400, opacity: 0.8, marginTop: 2, textTransform: "capitalize" }}>{diaLargo(hoy)}</div>
        </button>

        <div style={{ fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.5, marginBottom: 6 }}>DÍAS ANTERIORES</div>
        {dias.filter(d => d.fecha !== hoy).length === 0 ? (
          <div style={{ fontSize: 12.5, color: colors.muted, padding: "10px 0" }}>Todavía no hay días registrados.</div>
        ) : (
          <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, overflow: "hidden" }}>
            {dias.filter(d => d.fecha !== hoy).map(d => (
              <div key={d.id} onClick={() => setFecha(d.fecha)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderTop: `1px solid ${colors.neutralSoft}`, cursor: "pointer" }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: colors.ink, textTransform: "capitalize" }}>{diaLargo(d.fecha)}</span>
                {d.sin_novedades && <span style={{ fontSize: 11, color: colors.muted }}>sin novedades</span>}
                <span style={{ fontSize: 11, fontWeight: 700, color: d.estado === "aprobado" ? colors.success : d.estado === "cerrado" ? colors.inkSoft : colors.warning }}>
                  {d.estado === "aprobado" ? "Aprobado" : d.estado === "cerrado" ? "Cerrado" : "Abierto"}
                </span>
              </div>
            ))}
          </div>
        )}
        </>
        )}
      </div>
    );
  }

  // La entrada: elegir la obra.
  return (
    <div style={{ fontFamily: colors.font }}>
      <div style={{ fontSize: 17, fontWeight: 700, color: colors.ink, marginBottom: 4 }}>Libro de Obra</div>
      <div style={{ fontSize: 12, color: colors.muted, marginBottom: 14 }}>
        Lo que pasó cada día en cada obra: quién estuvo, qué se hizo, qué llegó y qué se decidió.
      </div>

      {cargando ? <div style={{ textAlign: "center", color: colors.muted, padding: "40px 0", fontSize: 13 }}>Cargando…</div>
        : !proyectos.length ? (
          <div style={{ textAlign: "center", color: colors.muted, padding: "50px 20px", fontSize: 13, background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <BookOpen size={30} />
            El libro es de las obras. Cuando un proyecto entre a Construcción o Arquitectura, aparece acá.
          </div>
        ) : (
          <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, overflow: "hidden" }}>
            {proyectos.map(l => (
              <div key={l.id} onClick={() => setLead(l)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px", borderTop: `1px solid ${colors.neutralSoft}`, cursor: "pointer" }}>
                <BookOpen size={15} color={colors.muted} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: colors.ink }}>{l.nombre}</span>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
