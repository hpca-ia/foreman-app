import { useEffect, useState, useCallback } from "react";
import { Plus, ShoppingCart, AlertTriangle, FileText } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { ESTADOS, ABIERTAS, cargarSolicitudes, veLaCompra } from "./compras";
import ModalSolicitud from "./ModalSolicitud";
import Proformas from "./Proformas";

// Compras: lo que hace falta en obra, pedido, aprobado y comprado.
//
// Tres personas y un solo hilo: el residente pide, el gerente da el visto,
// compras lo consigue y factura, el residente recibe. Cada paso le deja una
// tarea al que sigue —en su tablero, con su correo— y queda escrito quién lo
// dio y cuándo.
//
// La pantalla arranca por lo que a uno le toca hacer, no por la lista completa:
// esa es la pregunta con la que se entra acá.

export default function ModuloCompras({ currentUser, puede, users = [], asignados = new Set() }) {
  const [solicitudes, setSolicitudes] = useState([]);
  const [proyectos, setProyectos] = useState([]);
  const [sinTablas, setSinTablas] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [abierta, setAbierta] = useState(null);
  const [nueva, setNueva] = useState(false);
  const [filtro, setFiltro] = useState("mias");
  // La colección de proformas es de un proyecto: preguntar "¿a cómo nos han
  // cotizado el hormigón?" sin decir de qué obra no lleva a ninguna parte.
  const [verProformas, setVerProformas] = useState(false);
  const [proyectoProformas, setProyectoProformas] = useState("");

  const gestionaCompras = puede("compras.gestionar");
  const esDirector = currentUser?.role === "owner";
  // Aprobar tiene su propio permiso. Antes colgaba de "Asignar tareas a
  // otros", así que cualquiera que pudiera repartir trabajo se aprobaba
  // también sus propios pedidos — justo lo que el módulo existe para impedir.
  const apruebo = puede("compras.aprobar");
  // Quien compra, quien aprueba y el Director miran todas: es su trabajo. El
  // resto ve lo suyo y lo de sus obras — la regla vive en compras.js.
  //
  // Lo que NO entra acá es "entra a todos los proyectos": ese permiso abre el
  // pipeline para mirarlo, y con él prendido un residente volvía a ver —y a
  // poder pedir contra— las diez obras de la oficina.
  const todasLasObras = gestionaCompras || apruebo;

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
  // Un pedido sin obra es un gasto de oficina, no un pedido roto: la lista lo
  // dice con el destino que le pusieron.
  const dondeVa = s => (s.lead_id ? nombreProyecto(s.lead_id) : (s.destino || "Oficina"));
  // Pedir algo es pedirlo para una obra en la que uno está: la lista del
  // selector es la misma que la de lo que ve, no el pipeline entero.
  // Pedir es otra cosa que mirar: el Director y compras arman un pedido para
  // cualquier obra, y todos los demás —gerentes incluidos— solo para aquellas
  // en las que alguien los puso.
  const misProyectos = (esDirector || gestionaCompras)
    ? proyectos
    : proyectos.filter(p => asignados.has(p.id));

  // A quién le toca cada estado: es lo que decide qué ve uno en "Me toca a mí".
  const meToca = s => {
    if (s.estado === "pendiente_aprobacion") return apruebo;
    if (s.estado === "aprobada") return gestionaCompras;
    if (s.estado === "borrador" || s.estado === "requiere_info" || s.estado === "comprada") {
      return s.solicitante_id === currentUser.id;
    }
    return false;
  };

  // Lo primero que se descarta es lo que esta persona no tiene por qué ver:
  // los filtros de abajo son de lectura, no de permisos.
  const visibles = solicitudes.filter(s => veLaCompra({
    compra: s, usuarioId: currentUser.id, nivel: asignados.has(s.lead_id) ? "editar" : null, todasLasObras,
  }));

  const abiertas = visibles.filter(s => ABIERTAS.includes(s.estado) || s.estado === "borrador");
  const listas = filtro === "mias" ? abiertas.filter(meToca)
    : filtro === "abiertas" ? abiertas
    : visibles;

  const pendientesMias = abiertas.filter(meToca).length;

  const fila = { display: "grid", gridTemplateColumns: "minmax(160px,2fr) minmax(110px,1fr) 130px 90px", gap: 10, alignItems: "center", padding: "10px 12px", borderTop: `1px solid ${colors.neutralSoft}`, cursor: "pointer" };

  return (
    <div style={{ fontFamily: colors.font }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: colors.ink }}>Compras</div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Button variant={verProformas ? "primary" : "outline"} size="md" onClick={() => setVerProformas(v => !v)}>
            <FileText size={14} /> Proformas
          </Button>
          {/* Siempre se puede pedir: el que no tiene obra asignada igual pide
              para la oficina. */}
          <Button variant="primary" size="md" onClick={() => setNueva(true)}><Plus size={14} /> Pedir algo</Button>
        </div>
      </div>

      {/* Las proformas de un proyecto, por capítulo: el historial de precios
          que la oficina ya tiene y hoy vive en WhatsApp. */}
      {verProformas && (
        <div style={{ marginBottom: 16 }}>
          <select value={proyectoProformas} onChange={e => setProyectoProformas(e.target.value)}
            style={{ width: "100%", maxWidth: 380, border: `1px solid ${colors.border}`, borderRadius: 8, padding: "7px 9px",
              fontSize: 12.5, fontFamily: colors.font, color: colors.ink, background: "#fff", marginBottom: 10 }}>
            <option value="">Elegí el proyecto…</option>
            {misProyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <Proformas leadId={proyectoProformas ? Number(proyectoProformas) : null}
            nombreProyecto={nombreProyecto(Number(proyectoProformas))}
            currentUser={currentUser} puedeAlimentar={puede?.("presupuestos.crear") !== false} />
        </div>
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {[["mias", "Me toca a mí", pendientesMias], ["abiertas", "Abiertas", abiertas.length], ["todas", "Todas", visibles.length]].map(([id, label, n]) => {
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
                  {!s.lead_id && <span style={{ color: colors.muted, fontSize: 10.5 }}>SIN OBRA · </span>}
                  {dondeVa(s)}
                </div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: e.color }}>
                  {e.label}
                  {/* Pagado no es un paso del flujo sino una marca al costado:
                      se paga antes, durante o después de recibir. */}
                  {s.pagado_at && <span style={{ color: colors.success, marginLeft: 5 }}>· PAGADO</span>}
                  {e.quien && !s.pagado_at && <span style={{ color: colors.muted, fontWeight: 400 }}> · {e.quien}</span>}
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
        <ModalSolicitud solicitud={abierta} proyectos={misProyectos} users={users} currentUser={currentUser} puede={puede}
          onCerrar={() => { setAbierta(null); setNueva(false); }}
          onCambio={() => { cargar(); }} />
      )}
    </div>
  );
}
