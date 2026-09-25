import { useEffect, useState, useCallback } from "react";
import { Plus, ShoppingCart, AlertTriangle } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { ESTADOS, ABIERTAS, cargarSolicitudes } from "./compras";
import ModalSolicitud from "./ModalSolicitud";

// Compras: lo que hace falta en obra, pedido, aprobado y comprado.
//
// Tres personas y un solo hilo: el residente pide, el gerente da el visto,
// compras lo consigue y factura, el residente recibe. Cada paso le deja una
// tarea al que sigue —en su tablero, con su correo— y queda escrito quién lo
// dio y cuándo.
//
// La pantalla arranca por lo que a uno le toca hacer, no por la lista completa:
// esa es la pregunta con la que se entra acá.

export default function ModuloCompras({ currentUser, puede, users = [] }) {
  const [solicitudes, setSolicitudes] = useState([]);
  const [proyectos, setProyectos] = useState([]);
  const [sinTablas, setSinTablas] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [abierta, setAbierta] = useState(null);
  const [nueva, setNueva] = useState(false);
  const [filtro, setFiltro] = useState("mias");

  const gestionaCompras = puede("compras.gestionar");
  const apruebo = puede("tareas.asignar") || currentUser?.role === "owner";

  const cargar = useCallback(async () => {
    const [{ solicitudes: s, sinTablas: falta }, { data: ls }] = await Promise.all([
      cargarSolicitudes(),
      supabase.from("leads").select("id,nombre,obra_id,resultado").order("nombre"),
    ]);
    setSolicitudes(s);
    setSinTablas(falta);
    setProyectos((ls || []).filter(l => l.resultado !== "perdido"));
    setCargando(false);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  if (sinTablas) {
    return (
      <div style={{ fontFamily: colors.font }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: colors.ink, marginBottom: 12 }}>Compras</div>
        <div style={{ fontSize: 12.5, color: colors.warning, background: colors.warningSoft, border: `1px solid ${colors.warningBorder}`, borderRadius: colors.radiusMd, padding: 14 }}>
          Falta correr la migración 048 en Supabase para usar Compras.
        </div>
      </div>
    );
  }

  const nombreProyecto = id => proyectos.find(p => p.id === id)?.nombre || "—";

  // A quién le toca cada estado: es lo que decide qué ve uno en "Me toca a mí".
  const meToca = s => {
    if (s.estado === "pendiente_aprobacion") return apruebo;
    if (s.estado === "aprobada") return gestionaCompras;
    if (s.estado === "borrador" || s.estado === "requiere_info" || s.estado === "comprada") {
      return s.solicitante_id === currentUser.id;
    }
    return false;
  };

  const abiertas = solicitudes.filter(s => ABIERTAS.includes(s.estado) || s.estado === "borrador");
  const listas = filtro === "mias" ? abiertas.filter(meToca)
    : filtro === "abiertas" ? abiertas
    : solicitudes;

  const pendientesMias = abiertas.filter(meToca).length;

  const fila = { display: "grid", gridTemplateColumns: "minmax(160px,2fr) minmax(110px,1fr) 130px 90px", gap: 10, alignItems: "center", padding: "10px 12px", borderTop: `1px solid ${colors.neutralSoft}`, cursor: "pointer" };

  return (
    <div style={{ fontFamily: colors.font }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: colors.ink }}>Compras</div>
        <div style={{ marginLeft: "auto" }}>
          <Button variant="primary" size="md" onClick={() => setNueva(true)}><Plus size={14} /> Pedir algo</Button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {[["mias", "Me toca a mí", pendientesMias], ["abiertas", "Abiertas", abiertas.length], ["todas", "Todas", solicitudes.length]].map(([id, label, n]) => {
          const activo = filtro === id;
          return (
            <button key={id} onClick={() => setFiltro(id)}
              style={{ border: `1px solid ${activo ? colors.ink : colors.border}`, background: activo ? colors.ink : "#fff",
                color: activo ? "#fff" : colors.inkSoft, borderRadius: 20, padding: "6px 14px", fontSize: 12.5, fontWeight: 600,
                cursor: "pointer", fontFamily: colors.font, display: "inline-flex", alignItems: "center", gap: 6 }}>
              {label} <span style={{ opacity: 0.7, fontWeight: 400 }}>{n}</span>
            </button>
          );
        })}
      </div>

      {cargando ? (
        <div style={{ textAlign: "center", color: colors.muted, padding: "40px 0", fontSize: 13 }}>Cargando…</div>
      ) : !listas.length ? (
        <div style={{ textAlign: "center", color: colors.muted, padding: "50px 20px", fontSize: 13, background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <ShoppingCart size={30} />
          {filtro === "mias" ? "Nada esperando por vos." : "Todavía no hay solicitudes. Toca “Pedir algo”."}
        </div>
      ) : (
        <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, overflow: "hidden" }}>
          {listas.map(s => {
            const e = ESTADOS[s.estado] || ESTADOS.borrador;
            return (
              <div key={s.id} style={fila} onClick={() => setAbierta(s)}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.urgente && <span style={{ color: colors.danger, fontSize: 9.5, fontWeight: 700, marginRight: 5 }}>URGENTE</span>}
                    {s.descripcion}
                  </div>
                  <div style={{ fontSize: 11, color: colors.muted }}>
                    {s.solicitante_nombre || "—"}{s.necesita_para ? ` · para el ${s.necesita_para}` : ""}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: colors.inkSoft, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {nombreProyecto(s.lead_id)}
                </div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: e.color }}>
                  {e.label}
                  {e.quien && <span style={{ color: colors.muted, fontWeight: 400 }}> · {e.quien}</span>}
                </div>
                <div style={{ textAlign: "right", fontSize: 12, color: colors.inkSoft, whiteSpace: "nowrap" }}>
                  {s.monto ? `$${Number(s.monto).toLocaleString("es-EC", { minimumFractionDigits: 2 })}` : ""}
                  {meToca(s) && <AlertTriangle size={12} color={colors.warning} style={{ marginLeft: 6, verticalAlign: "middle" }} />}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(abierta || nueva) && (
        <ModalSolicitud solicitud={abierta} proyectos={proyectos} users={users} currentUser={currentUser} puede={puede}
          onCerrar={() => { setAbierta(null); setNueva(false); }}
          onCambio={() => { cargar(); }} />
      )}
    </div>
  );
}
