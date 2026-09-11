import { useState, useEffect, useCallback } from "react";
import { ArrowLeft } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { fmt, calcularControl, agruparPorCapitulo, totalesObra } from "./calculos";
import TablaControl from "./TablaControl";
import PanelFacturas from "./PanelFacturas";
import PanelPlanillas from "./PanelPlanillas";
import PanelDuplicados from "./PanelDuplicados";

export default function VistaObra({ obra, currentUser, onVolver }) {
  const [tab, setTab] = useState("control");
  const [rubros, setRubros] = useState([]);
  const [planillas, setPlanillas] = useState([]);
  const [facturas, setFacturas] = useState([]);
  const [asignaciones, setAsignaciones] = useState([]);
  const [planillaSel, setPlanillaSel] = useState(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    const [{ data: r }, { data: p }, { data: f }] = await Promise.all([
      supabase.from("obra_rubros").select("*").eq("obra_id", obra.id).order("capitulo_orden").order("orden"),
      supabase.from("planillas").select("*").eq("obra_id", obra.id).order("numero"),
      supabase.from("obra_facturas").select("*").eq("obra_id", obra.id).order("fecha", { ascending: false }),
    ]);
    const numeroDePlanilla = {};
    (p || []).forEach(pl => { numeroDePlanilla[pl.id] = pl.numero; });
    const facturasConNumero = (f || []).map(x => ({ ...x, _planillaNumero: x.planilla_id ? numeroDePlanilla[x.planilla_id] ?? null : null }));

    let asig = [];
    if (facturasConNumero.length) {
      const { data } = await supabase.from("obra_factura_rubros").select("*").in("factura_id", facturasConNumero.map(x => x.id));
      asig = data || [];
    }

    setRubros(r || []);
    setPlanillas(p || []);
    setFacturas(facturasConNumero);
    setAsignaciones(asig);
    setPlanillaSel(prev => {
      if (prev && (p || []).some(x => x.id === prev)) return prev;
      const abierta = (p || []).find(x => x.estado === "abierta");
      return abierta?.id || (p || [])[(p || []).length - 1]?.id || null;
    });
    setCargando(false);
  }, [obra.id]);

  useEffect(() => { cargar(); }, [cargar]);

  const planillaActual = planillas.find(p => p.id === planillaSel) || null;
  const porRubro = calcularControl({ rubros, facturas, asignaciones, planillaNumero: planillaActual?.numero ?? null });
  const grupos = agruparPorCapitulo(rubros, porRubro);
  const totales = totalesObra(grupos);

  const tabS = a => ({ padding: "7px 14px", border: "none", borderBottom: a ? `2px solid ${colors.brand}` : "2px solid transparent", background: "transparent", color: a ? colors.brand : colors.inkSoft, fontSize: 12, fontWeight: a ? 600 : 400, cursor: "pointer", fontFamily: colors.font });

  return (
    <div style={{ fontFamily: colors.font }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <Button variant="secondary" size="sm" onClick={onVolver}><ArrowLeft size={13} /> Obras</Button>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: colors.ink }}>{obra.nombre}</div>
          <div style={{ fontSize: 11, color: colors.muted }}>{obra.cliente_nombre || "Sin cliente"} · {rubros.length} rubros</div>
        </div>
        {planillas.length > 0 && (
          <select value={planillaSel || ""} onChange={e => setPlanillaSel(Number(e.target.value))}
            style={{ marginLeft: "auto", background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: "7px 12px", fontSize: 12, fontFamily: colors.font, color: colors.ink, cursor: "pointer" }}>
            {planillas.map(p => <option key={p.id} value={p.id}>{p.nombre || `Planilla N°${p.numero}`}{p.estado === "cerrada" ? " (cerrada)" : ""}</option>)}
          </select>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10, marginBottom: 14 }}>
        <Tarjeta label="Presupuesto" valor={totales.base} />
        <Tarjeta label="Acum. anterior" valor={totales.anterior} />
        <Tarjeta label="Este período" valor={totales.periodo} color={colors.brand} />
        <Tarjeta label="Invertido" valor={totales.acumulado} color={colors.ink} />
        <Tarjeta label="Saldo" valor={totales.saldo} color={totales.saldo < 0 ? colors.danger : colors.success} />
        <Tarjeta label="Avance" valor={totales.pct * 100} sufijo="%" moneda={false} color={colors.brand} />
      </div>

      <div style={{ display: "flex", borderBottom: `1px solid ${colors.border}`, marginBottom: 14 }}>
        <button onClick={() => setTab("control")} style={tabS(tab === "control")}>Control</button>
        <button onClick={() => setTab("facturas")} style={tabS(tab === "facturas")}>Facturas</button>
        <button onClick={() => setTab("planillas")} style={tabS(tab === "planillas")}>Planillas</button>
        <button onClick={() => setTab("duplicados")} style={tabS(tab === "duplicados")}>Duplicados</button>
      </div>

      {cargando ? <div style={{ textAlign: "center", color: colors.muted, padding: "40px 0", fontSize: 13 }}>Cargando...</div> : (
        <>
          {tab === "control" && <TablaControl grupos={grupos} porRubro={porRubro} totales={totales} />}
          {tab === "facturas" && (
            <PanelFacturas
              obra={obra} rubros={rubros} planillas={planillas} planillaActual={planillaActual}
              facturas={facturas} asignaciones={asignaciones}
              currentUser={currentUser} onCambio={cargar}
            />
          )}
          {tab === "planillas" && (
            <PanelPlanillas obra={obra} planillas={planillas} facturas={facturas} asignaciones={asignaciones} onCambio={cargar} />
          )}
          {tab === "duplicados" && <PanelDuplicados obra={obra} planillas={planillas} onCambio={cargar} />}
        </>
      )}
    </div>
  );
}

function Tarjeta({ label, valor, color, sufijo = "", moneda = true }) {
  return (
    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: "10px 12px" }}>
      <div style={{ fontSize: 9, color: colors.muted, fontWeight: 600, letterSpacing: 0.4 }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: color || colors.inkSoft, marginTop: 3 }}>
        {moneda ? `$${fmt(valor)}` : `${Number(valor || 0).toFixed(1)}${sufijo}`}
      </div>
    </div>
  );
}
