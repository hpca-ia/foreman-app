import { useState, useEffect } from "react";
import { Plus, ArrowLeft } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { fmt } from "./calculos";
import ActivarObra from "./ActivarObra";
import VistaObra from "./VistaObra";

export default function ModuloControlObra({ currentUser }) {
  const [vista, setVista] = useState("lista"); // lista | activar | obra
  const [obras, setObras] = useState([]);
  const [obraActiva, setObraActiva] = useState(null);
  const [resumen, setResumen] = useState({});
  const [cargando, setCargando] = useState(true);

  useEffect(() => { fetchObras(); }, []);

  async function fetchObras() {
    setCargando(true);
    const { data: obrasData } = await supabase.from("obras").select("*").order("created_at", { ascending: false });
    const lista = obrasData || [];
    setObras(lista);

    if (lista.length) {
      const ids = lista.map(o => o.id);
      const [{ data: rubros }, { data: facturas }] = await Promise.all([
        supabase.from("obra_rubros").select("id,obra_id,total_base").in("obra_id", ids),
        supabase.from("obra_facturas").select("id,obra_id").in("obra_id", ids),
      ]);
      const facturaIds = (facturas || []).map(f => f.id);
      let asignaciones = [];
      if (facturaIds.length) {
        const { data } = await supabase.from("obra_factura_rubros").select("factura_id,monto").in("factura_id", facturaIds);
        asignaciones = data || [];
      }
      const obraDeFactura = {};
      (facturas || []).forEach(f => { obraDeFactura[f.id] = f.obra_id; });

      const r = {};
      lista.forEach(o => { r[o.id] = { base: 0, invertido: 0, rubros: 0 }; });
      (rubros || []).forEach(x => {
        if (!r[x.obra_id]) return;
        r[x.obra_id].base += Number(x.total_base) || 0;
        r[x.obra_id].rubros += 1;
      });
      asignaciones.forEach(a => {
        const oid = obraDeFactura[a.factura_id];
        if (r[oid]) r[oid].invertido += Number(a.monto) || 0;
      });
      setResumen(r);
    }
    setCargando(false);
  }

  function abrirObra(o) { setObraActiva(o); setVista("obra"); }

  if (vista === "activar") {
    return <ActivarObra currentUser={currentUser} onCancelar={() => setVista("lista")} onCreada={async o => { await fetchObras(); setObraActiva(o); setVista("obra"); }} />;
  }

  if (vista === "obra" && obraActiva) {
    return <VistaObra obra={obraActiva} currentUser={currentUser} onVolver={() => { setVista("lista"); fetchObras(); }} />;
  }

  return (
    <div style={{ fontFamily: colors.font }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: colors.ink }}>Control de Obra</div>
        <Button variant="primary" size="md" style={{ marginLeft: "auto" }} onClick={() => setVista("activar")}>
          <Plus size={14} /> Activar presupuesto
        </Button>
      </div>

      {cargando ? <div style={{ textAlign: "center", color: colors.muted, padding: "40px 0", fontSize: 13 }}>Cargando...</div>
        : obras.length === 0 ? (
          <div style={{ textAlign: "center", color: colors.muted, padding: "50px 20px", fontSize: 13, background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd }}>
            Todavía no hay obras en curso.<br />
            Activa un presupuesto para empezar a controlar su ejecución.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {obras.map(o => {
              const r = resumen[o.id] || { base: 0, invertido: 0, rubros: 0 };
              const saldo = r.base - r.invertido;
              const pct = r.base > 0 ? (r.invertido / r.base) * 100 : 0;
              return (
                <div key={o.id} onClick={() => abrirObra(o)}
                  style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 16, cursor: "pointer" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = colors.brand; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = colors.border; }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: colors.ink }}>{o.nombre}</div>
                      <div style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>{o.cliente_nombre || "Sin cliente"} · {r.rubros} rubros</div>
                    </div>
                    <div style={{ marginLeft: "auto", textAlign: "right" }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: pct > 100 ? colors.danger : colors.brand }}>{pct.toFixed(1)}%</div>
                      <div style={{ fontSize: 9, color: colors.muted, fontWeight: 600, letterSpacing: 0.4 }}>AVANCE</div>
                    </div>
                  </div>
                  <div style={{ background: colors.neutralSoft, borderRadius: 4, height: 6, marginBottom: 10, overflow: "hidden" }}>
                    <div style={{ background: pct > 100 ? colors.danger : colors.brand, height: 6, width: `${Math.min(pct, 100)}%`, transition: "width .4s" }} />
                  </div>
                  <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                    <Dato label="Presupuesto" valor={r.base} />
                    <Dato label="Invertido" valor={r.invertido} color={colors.ink} />
                    <Dato label="Saldo" valor={saldo} color={saldo < 0 ? colors.danger : colors.success} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}

function Dato({ label, valor, color }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: colors.muted, fontWeight: 600, letterSpacing: 0.3 }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: color || colors.inkSoft, marginTop: 2 }}>${fmt(valor)}</div>
    </div>
  );
}
