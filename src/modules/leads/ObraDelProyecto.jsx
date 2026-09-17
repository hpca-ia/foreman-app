import { useState, useEffect } from "react";
import { HardHat, ArrowRight, AlertTriangle } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import { fmt, calcularControl, agrupar, totalesObra } from "../controlObra/calculos";

// Cómo va la obra, dentro del proyecto. No duplica nada: la obra se sigue
// manejando en Control de Obra. Acá se trae lo que uno pregunta de memoria
// —en qué planilla va, cuánto se lleva gastado, cuánto queda— para que el
// proyecto cuente su historia completa sin tener que salir a buscarla.

const dias = iso => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

export default function ObraDelProyecto({ obraId, onIrAObra }) {
  const [datos, setDatos] = useState(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const [{ data: obra }, { data: rubros }, { data: planillas }, { data: facturas }, { data: actividades }] = await Promise.all([
        supabase.from("obras").select("*").eq("id", obraId).maybeSingle(),
        supabase.from("obra_rubros").select("*").eq("obra_id", obraId),
        supabase.from("planillas").select("*").eq("obra_id", obraId).order("numero"),
        supabase.from("obra_facturas").select("*").eq("obra_id", obraId),
        supabase.from("obra_actividades").select("*").eq("obra_id", obraId).order("orden"),
      ]);
      if (!vivo || !obra) { if (vivo) setDatos({ falta: true }); return; }

      const numeroDe = {};
      (planillas || []).forEach(p => { numeroDe[p.id] = p.numero; });
      const conNumero = (facturas || []).map(f => ({ ...f, _planillaNumero: f.planilla_id ? numeroDe[f.planilla_id] ?? null : null }));
      let asignaciones = [];
      if (conNumero.length) {
        const { data } = await supabase.from("obra_asignaciones").select("*").in("factura_id", conNumero.map(f => f.id));
        asignaciones = data || [];
      }
      const actual = (planillas || []).find(p => p.estado === "abierta") || (planillas || [])[(planillas || []).length - 1] || null;
      const porRubro = calcularControl({ rubros: rubros || [], facturas: conNumero, asignaciones, planillaNumero: actual?.numero ?? null });
      const totales = totalesObra(agrupar(rubros || [], porRubro, "capitulo", actividades || []));

      // Una factura cargada que nadie asignó a un rubro no está en el control:
      // la plata salió y el presupuesto no se enteró.
      const asignado = {};
      asignaciones.forEach(a => { asignado[a.factura_id] = (asignado[a.factura_id] || 0) + (Number(a.monto) || 0); });
      const sinAsignar = conNumero.filter(f => (asignado[f.id] || 0) + 0.01 < (Number(f.total) || 0)).length;
      const ultimaCerrada = (planillas || []).filter(p => p.estado === "cerrada").sort((a, b) => (b.fecha_cierre || "").localeCompare(a.fecha_cierre || ""))[0];

      if (vivo) setDatos({ obra, totales, actual, sinAsignar, ultimaCerrada, planillas: planillas || [] });
    })();
    return () => { vivo = false; };
  }, [obraId]);

  if (!datos) return <div style={{ fontSize: 11, color: colors.muted, marginBottom: 12 }}>Cargando la obra…</div>;
  if (datos.falta) return null;

  const { totales, actual, sinAsignar, ultimaCerrada } = datos;
  const sinMover = ultimaCerrada?.fecha_cierre ? dias(ultimaCerrada.fecha_cierre) : null;
  const avisos = [
    sinAsignar > 0 && `${sinAsignar} ${sinAsignar === 1 ? "factura sin asignar" : "facturas sin asignar"} a un rubro`,
    sinMover != null && sinMover > 20 && `última planilla cerrada hace ${sinMover} días`,
  ].filter(Boolean);

  const dato = (label, valor, color) => (
    <span style={{ fontSize: 11, color: colors.inkSoft }}>
      {label} <strong style={{ color: color || colors.ink, fontSize: 13 }}>${fmt(valor)}</strong>
    </span>
  );

  return (
    <div style={{ border: `1px solid ${colors.successBorder}`, background: colors.successSoft, borderRadius: colors.radiusMd, padding: 12, marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <HardHat size={14} color={colors.brand} />
        <span style={{ fontSize: 12, fontWeight: 700, color: colors.brand, flex: 1, minWidth: 140 }}>
          {actual ? `La obra va en ${actual.nombre || `Planilla N°${actual.numero}`}` : "La obra todavía no tiene planillas"}
        </span>
        {onIrAObra && (
          <button onClick={onIrAObra}
            style={{ background: "none", border: "none", color: colors.brand, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: colors.font, display: "flex", alignItems: "center", gap: 3 }}>
            Abrir Control de Obra <ArrowRight size={12} />
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {dato("Presupuesto", totales.base)}
        {dato("Invertido", totales.acumulado)}
        {dato("Saldo", totales.saldo, totales.saldo < 0 ? colors.danger : colors.success)}
        <span style={{ fontSize: 11, color: colors.inkSoft }}>
          Avance <strong style={{ color: colors.brand, fontSize: 13 }}>{(totales.pct * 100).toFixed(1)} %</strong>
        </span>
      </div>

      <div style={{ height: 5, background: colors.neutralSoft, borderRadius: 3, marginTop: 9, overflow: "hidden" }}>
        <div style={{ height: 5, width: `${Math.min(100, totales.pct * 100)}%`, background: totales.saldo < 0 ? colors.danger : colors.brand }} />
      </div>

      {avisos.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: colors.warning, marginTop: 8 }}>
          <AlertTriangle size={12} /> {avisos.join(" · ")}
        </div>
      )}
    </div>
  );
}
