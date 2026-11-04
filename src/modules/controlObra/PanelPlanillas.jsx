import { useState } from "react";
import { Plus, Lock, Pencil, ChevronRight, Unlock, ArrowLeft } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { mensajeError } from "../../lib/sesion";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { fmt } from "./calculos";
import { creditoDisponible } from "./cuentasProveedor";
import { partirPorFecha, siguienteDe, numeroNuevo, diaSiguiente, loQueQueda, cortePropuesto } from "./cortePlanilla.js";

// Las planillas de una obra: cada una es un corte de período.
//
// Se tocan y se abren acá mismo, con sus facturas adentro. Antes lo único que
// hacía la fila era cerrar la planilla, y abrirla te sacaba a otra pestaña:
// uno perdía de vista en qué planilla estaba parado.

export default function PanelPlanillas({ obra, planillas, facturas, asignaciones, pagos = [], planillaSel, abierta, onAbrir, onVolver, onCambio, puede, children }) {
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState("");
  const [editando, setEditando] = useState(null);     // id de la planilla que se está renombrando
  const [nombre, setNombre] = useState("");
  const [cerrando, setCerrando] = useState(null);     // { hasta } mientras se elige el corte

  const total = {}, cuantas = {}, sinAsignar = {};
  // LO QUE NO CIERRA CON EL CORTE.
  //
  // Un anticipo es plata que salió y todavía no está facturada; una nota de
  // crédito es plata nuestra a favor en la casa del proveedor. Ninguno de los
  // dos termina con la planilla —el anticipo vive hasta que llegue su factura,
  // el vale hasta que se use en una compra, que puede ser de otro período— y
  // cerrar un corte sin decirlo es cerrarlo sabiendo que algo quedó abierto y
  // no dejar constancia de qué.
  const anticipos = {}, credito = {};
  const sueltoDe = f => {
    const asignado = asignaciones.filter(a => a.factura_id === f.id).reduce((s, a) => s + (Number(a.monto) || 0), 0);
    return Math.round(((Number(f.total) || 0) - asignado) * 100) / 100;
  };
  facturas.forEach(f => {
    if (!f.planilla_id) return;
    const monto = Number(f.total) || 0;
    const suelto = sueltoDe(f);
    total[f.planilla_id] = (total[f.planilla_id] || 0) + monto;
    cuantas[f.planilla_id] = (cuantas[f.planilla_id] || 0) + 1;
    if (suelto > 0.009) sinAsignar[f.planilla_id] = (sinAsignar[f.planilla_id] || 0) + 1;
    if (f.clase === "anticipo" && !f.facturada_con_id) anticipos[f.planilla_id] = (anticipos[f.planilla_id] || 0) + monto;
    // LO QUE TODAVÍA VALE EL VALE, no lo que decía al nacer. Un vale usado en
    // dos compras de caja chica seguía figurando entero "a favor" al cerrar:
    // los $105,06 de KYWI, gastados hasta el centavo, se nombraban en cada
    // cierre. Lo usado está en los pagos: cada uno dice de qué vale salió.
    if (f.clase === "nota_credito" || monto < 0) {
      const queda = creditoDisponible(f, pagos);
      if (queda > 0.005) credito[f.planilla_id] = (credito[f.planilla_id] || 0) + queda;
    }
  });

  const abiertaAhora = planillas.find(p => p.estado === "abierta");

  async function nuevaPlanilla() {
    setError("");
    // Dos planillas abiertas a la vez descuadran el control: las facturas del
    // período no sabrían a cuál pertenecen.
    if (abiertaAhora && !window.confirm(`${abiertaAhora.nombre || `La planilla N°${abiertaAhora.numero}`} sigue abierta. ¿Crear otra igual?`)) return;
    setCreando(true);
    const siguiente = planillas.length ? Math.max(...planillas.map(p => p.numero)) + 1 : 1;
    const { data, error: e } = await supabase.from("planillas").insert({
      obra_id: obra.id, numero: siguiente, nombre: `Planilla N°${siguiente}`,
      fecha_desde: new Date().toISOString().split("T")[0],
    }).select().single();
    setCreando(false);
    // Callado se veía como que el botón no hacía nada: si la base la rechaza,
    // hay que decirlo.
    if (e) { setError(mensajeError(e) || e.message); return; }
    onCambio();
    if (data && onAbrir) onAbrir(data);
  }

  // CERRAR POR FECHAS. Al 31 de octubre, a una quincena: la planilla va hasta
  // el día que se elige, y las facturas con fecha posterior pasan a la
  // siguiente, que se crea si no está. Primero se mueven y recién después se
  // cierra: si algo falla a mitad queda una planilla abierta con facturas de
  // más —que se ve— y no una cerrada con facturas que no son de su período.
  async function cerrarPlanilla(p, hasta) {
    setError("");
    if (!hasta) return;
    const { pasan } = partirPorFecha(facturas, p.id, hasta);
    if (pasan.length) {
      let sig = siguienteDe(planillas, p);
      if (!sig) {
        const numero = numeroNuevo(planillas);
        const { data, error: e } = await supabase.from("planillas").insert({
          obra_id: obra.id, numero, nombre: `Planilla N°${numero}`, fecha_desde: diaSiguiente(hasta),
        }).select().single();
        if (e) { setError(mensajeError(e) || e.message); return; }
        sig = data;
      }
      const { error: e } = await supabase.from("obra_facturas").update({ planilla_id: sig.id }).in("id", pasan.map(f => f.id));
      if (e) { setError(mensajeError(e) || e.message); return; }
    }
    const { error: e } = await supabase.from("planillas")
      .update({ estado: "cerrada", fecha_cierre: new Date().toISOString(), fecha_hasta: hasta })
      .eq("id", p.id);
    if (e) { setError(mensajeError(e) || e.message); return; }
    setCerrando(null);
    onCambio();
  }

  // Cerrar por error dejaba la obra sin dónde cargar facturas. Se puede volver
  // atrás; la fecha de cierre se borra para que no quede un cierre que no fue.
  async function reabrir(p) {
    setError("");
    if (!window.confirm(`¿Volver a abrir ${p.nombre || "la planilla N°" + p.numero}? Las facturas nuevas del período entrarán ahí.`)) return;
    const { error: e } = await supabase.from("planillas")
      .update({ estado: "abierta", fecha_cierre: null, fecha_hasta: null }).eq("id", p.id);
    if (e) { setError(mensajeError(e) || e.message); return; }
    onCambio();
  }

  async function guardarNombre(p) {
    const limpio = nombre.trim();
    setEditando(null);
    if (!limpio || limpio === p.nombre) return;
    const { error: e } = await supabase.from("planillas").update({ nombre: limpio }).eq("id", p.id);
    if (e) { setError(mensajeError(e) || e.message); return; }
    onCambio();
  }

  const iconBtn = { background: "none", border: "none", cursor: "pointer", color: colors.muted, display: "flex", padding: 4 };

  const nombreEditable = (p, tam) => editando === p.id ? (
    <input autoFocus value={nombre} onClick={e => e.stopPropagation()}
      onChange={e => setNombre(e.target.value)}
      onBlur={() => guardarNombre(p)}
      onKeyDown={e => { if (e.key === "Enter") guardarNombre(p); if (e.key === "Escape") setEditando(null); }}
      style={{ fontSize: tam, fontWeight: 600, fontFamily: colors.font, color: colors.ink, background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: colors.radiusSm, padding: "3px 6px", minWidth: 0, width: 200 }} />
  ) : (
    <>
      <span style={{ fontSize: tam, fontWeight: 600, color: colors.ink }}>{p.nombre || `Planilla N°${p.numero}`}</span>
      {p.estado === "cerrada" && <Lock size={tam === 15 ? 13 : 11} color={colors.muted} />}
      <button title="Cambiar el nombre" style={iconBtn}
        onClick={e => { e.stopPropagation(); setNombre(p.nombre || `Planilla N°${p.numero}`); setEditando(p.id); }}>
        <Pencil size={11} />
      </button>
    </>
  );

  const avisoError = error && (
    <div style={{ background: colors.dangerSoft, border: "1px solid #F3C6C6", borderRadius: colors.radiusMd, padding: 10, fontSize: 12, color: colors.danger, marginBottom: 12 }}>
      {error}
    </div>
  );

  // --- Una planilla abierta: su cabecera y, debajo, sus facturas -----------
  if (abierta) {
    const p = abierta;
    const cerrada = p.estado === "cerrada";
    return (
      <div>
        <button onClick={onVolver}
          style={{ background: "none", border: "none", color: colors.muted, cursor: "pointer", fontFamily: colors.font, fontSize: 12, display: "flex", alignItems: "center", gap: 4, padding: 0, marginBottom: 10 }}>
          <ArrowLeft size={13} /> Todas las planillas
        </button>

        {avisoError}

        <div style={{ background: colors.surface, border: `1.5px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 14, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            {nombreEditable(p, 15)}
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.4, color: cerrada ? colors.muted : colors.success, background: cerrada ? colors.neutralSoft : colors.successSoft, borderRadius: 4, padding: "2px 6px" }}>
              {cerrada ? "CERRADA" : "ABIERTA"}
            </span>
            <div style={{ marginLeft: "auto" }}>
              {cerrada
                ? <Button variant="outline" size="sm" onClick={() => reabrir(p)}><Unlock size={12} /> Reabrir</Button>
                : puede?.("planillas.cerrar") !== false && !cerrando
                  ? <Button variant="outline" size="sm" onClick={() => setCerrando({ hasta: cortePropuesto(p, new Date().toISOString().slice(0, 10)) })}><Lock size={12} /> Cerrar planilla</Button>
                  : null}
            </div>
          </div>
          {cerrando && !cerrada && (() => {
            const { quedan, pasan } = partirPorFecha(facturas, p.id, cerrando.hasta);
            const q = loQueQueda(quedan, sueltoDe, f => creditoDisponible(f, pagos));
            const sig = siguienteDe(planillas, p);
            const hoy = new Date().toISOString().slice(0, 10);
            const c1 = cortePropuesto(p, hoy);
            const antes = new Date(`${c1}T12:00:00`); antes.setDate(antes.getDate() - 1);
            const desde = String(p.fecha_desde || "").slice(0, 10);
            const cortes = [...new Set([c1, cortePropuesto(p, antes.toISOString().slice(0, 10)), hoy])].filter(c => !desde || c >= desde);
            const chip = on => ({ background: on ? colors.brandSoft : colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14,
              padding: "4px 10px", fontSize: 11, color: on ? colors.brand : colors.inkSoft, cursor: "pointer", fontFamily: colors.font });
            return (
              <div style={{ background: colors.warningSoft, border: `1.5px solid ${colors.warningBorder}`, borderRadius: colors.radiusMd, padding: "11px 14px", marginTop: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: colors.ink, marginBottom: 6 }}>¿Hasta qué día va esta planilla?</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                  <input type="date" value={cerrando.hasta} min={desde || undefined}
                    onChange={e => setCerrando({ hasta: e.target.value })}
                    style={{ fontSize: 12, padding: "6px 9px", border: `1px solid ${colors.border}`, borderRadius: colors.radiusSm, fontFamily: colors.font, color: colors.ink, background: colors.surface }} />
                  {cortes.map(c => (
                    <button key={c} onClick={() => setCerrando({ hasta: c })} style={chip(c === cerrando.hasta)}>
                      {c === hoy ? "hoy" : `${c.slice(8, 10)}/${c.slice(5, 7)}`}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: 11.5, color: colors.inkSoft, lineHeight: 1.55, marginBottom: 9 }}>
                  Hasta el <strong>{cerrando.hasta}</strong> quedan <strong>{q.cuantas} factura{q.cuantas === 1 ? "" : "s"}</strong> por <strong>${fmt(q.total)}</strong>.
                  {pasan.length > 0 && (
                    <> <strong>{pasan.length}</strong> con fecha posterior {pasan.length === 1 ? "pasa" : "pasan"} a la planilla siguiente
                      {sig ? ` (${sig.nombre || `Planilla N°${sig.numero}`})` : ", que se crea al cerrar"}.</>
                  )}
                  {q.sueltas > 0 && (
                    <><br /><span style={{ color: colors.warning }}>OJO: {q.sueltas} de las que quedan todavía no {q.sueltas === 1 ? "está asignada" : "están asignadas"} a ningún rubro y no se {q.sueltas === 1 ? "cuenta" : "cuentan"} en el control.</span></>
                  )}
                  {q.vivo > 0.005 && (
                    <><br />QUEDA VIVO: ${fmt(q.vivo)} en anticipos. La plata salió y todavía no está facturada: sigue abierto después de este corte, hasta que llegue la factura.</>
                  )}
                  {q.favor > 0.005 && (
                    <><br />QUEDA A FAVOR: ${fmt(q.favor)} en notas de crédito. Es plata nuestra en la casa del proveedor y se usa en una compra, que puede caer en otra planilla.</>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <Button variant="primary" size="sm" disabled={!cerrando.hasta} onClick={() => cerrarPlanilla(p, cerrando.hasta)}>
                    <Lock size={12} /> Cerrar hasta el {cerrando.hasta || "…"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setCerrando(null)}>Cancelar</Button>
                </div>
              </div>
            );
          })()}
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 11, color: colors.muted }}>
            <span>{p.fecha_desde || "—"}{p.fecha_hasta ? ` → ${p.fecha_hasta}` : " → en curso"}</span>
            <span>{cuantas[p.id] || 0} factura{(cuantas[p.id] || 0) === 1 ? "" : "s"}</span>
            <span>Facturado <strong style={{ color: colors.ink, fontSize: 13 }}>${fmt(total[p.id] || 0)}</strong></span>
            {(anticipos[p.id] || 0) > 0.005 && (
              <span title="Plata que salió y todavía no está facturada: no cuenta como invertido y sigue viva después del corte"
                style={{ color: colors.warning }}>
                ${fmt(anticipos[p.id])} en anticipos sin factura
              </span>
            )}
            {(credito[p.id] || 0) > 0.005 && (
              <span title="Notas de crédito sin usar: plata nuestra a favor en la casa del proveedor. Se usa en una compra, que puede caer en otra planilla"
                style={{ color: colors.success }}>
                ${fmt(credito[p.id])} a favor en notas de crédito
              </span>
            )}
          </div>
        </div>

        {children}
      </div>
    );
  }

  // --- La lista de períodos ------------------------------------------------
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, color: colors.inkSoft, flex: 1, minWidth: 180 }}>
          Cada planilla es un corte de período. Tócala para abrirla con sus facturas; las nuevas se cargan en la que esté abierta.
        </div>
        <Button variant="primary" size="sm" onClick={nuevaPlanilla} disabled={creando}>
          <Plus size={13} /> Nueva planilla
        </Button>
      </div>

      {avisoError}

      <div style={{ display: "grid", gap: 8 }}>
        {planillas.length === 0 && (
          <div style={{ color: colors.muted, fontSize: 13, textAlign: "center", padding: "30px 20px", lineHeight: 1.6 }}>
            Sin planillas todavía.<br />Crea la primera para empezar a cargar facturas de este período.
          </div>
        )}
        {planillas.slice().reverse().map(p => {
          const cerrada = p.estado === "cerrada";
          const viendo = p.id === planillaSel;
          return (
            <div
              key={p.id}
              onClick={() => onAbrir && onAbrir(p)}
              style={{
                background: colors.surface,
                border: `1.5px solid ${viendo ? colors.brand : colors.border}`,
                borderRadius: colors.radiusMd, padding: "12px 14px",
                display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                cursor: onAbrir ? "pointer" : "default", opacity: cerrada ? 0.85 : 1,
              }}
            >
              <div style={{ flex: 1, minWidth: 150 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {nombreEditable(p, 13)}
                  {viendo && <span style={{ fontSize: 9, fontWeight: 700, color: colors.brand, background: colors.brandSoft, borderRadius: 4, padding: "1px 5px" }}>VIENDO</span>}
                </div>
                <div style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
                  {p.fecha_desde || "—"}{p.fecha_hasta ? ` → ${p.fecha_hasta}` : ""} · {cuantas[p.id] || 0} factura{(cuantas[p.id] || 0) === 1 ? "" : "s"}
                  {sinAsignar[p.id] > 0 && <span style={{ color: colors.warning }}> · {sinAsignar[p.id]} sin asignar</span>}
                </div>
              </div>

              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: colors.ink }}>${fmt(total[p.id] || 0)}</div>
                <div style={{ fontSize: 9, color: colors.muted, fontWeight: 600 }}>{cerrada ? "CERRADA" : "ABIERTA"}</div>
              </div>

              <ChevronRight size={16} color={colors.border} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
