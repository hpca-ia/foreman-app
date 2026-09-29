import { useState, useEffect } from "react";
import { Plus, Upload, AlertTriangle, Trash2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { fmt } from "./calculos";
import ActivarObra from "./ActivarObra";
import ImportarObra from "./ImportarObra";
import VistaObra from "./VistaObra";
import BorrarObra from "./BorrarObra";

export default function ModuloControlObra({ currentUser, puede, nivelObra = () => null, entraATodo = false }) {
  // Lo que se puede hacer en una obra sale del proyecto al que pertenece: quien
  // la tiene en "solo ver" la lee y no la toca; quien no la tiene, no la ve.
  //
  // El permiso "ver control de obra" abre la pantalla; cuáles obras salen acá
  // lo decide el proyecto de cada una. Una obra suelta —sin proyecto— la ven
  // quienes entran a todos los proyectos.
  const nivelDe = obra => (obra?.lead_id ? nivelObra(obra.lead_id) : entraATodo ? "editar" : null);
  const alcanza = obra => entraATodo || !!nivelDe(obra);
  const puedeEnObra = (obra, permiso) => nivelDe(obra) === "ver" ? false : puede?.(permiso) !== false;
  const [vista, setVista] = useState("lista"); // lista | activar | obra
  const [obras, setObras] = useState([]);
  const [obraActiva, setObraActiva] = useState(null);
  const [resumen, setResumen] = useState({});
  const [cargando, setCargando] = useState(true);
  const [borrar, setBorrar] = useState(null);
  const [cuantasHay, setCuantasHay] = useState(0);
  const [proyectos, setProyectos] = useState({});
  const [presupuestos, setPresupuestos] = useState({});

  useEffect(() => { fetchObras(); }, []);

  async function fetchObras() {
    setCargando(true);
    const { data: obrasData } = await supabase.from("obras").select("*").order("created_at", { ascending: false });
    // Una obra a la que esta persona no entra no se lista: verla y que no abra
    // es peor que no verla.
    const lista = (obrasData || []).filter(alcanza);
    setCuantasHay((obrasData || []).length);
    setObras(lista);
    // El nombre de la obra no es suyo: es el del proyecto, y el presupuesto
    // que la originó va de detalle. Así renombrar cualquiera de los dos se ve
    // acá al instante, en vez de quedar congelado desde el día que se activó.
    const ids = [...new Set((obrasData || []).map(o => o.lead_id).filter(Boolean))];
    const pres = [...new Set((obrasData || []).map(o => o.presupuesto_id).filter(Boolean))];
    const [{ data: ls }, { data: ps }] = await Promise.all([
      ids.length ? supabase.from("leads").select("id,nombre").in("id", ids) : Promise.resolve({ data: [] }),
      pres.length ? supabase.from("presupuestos").select("id,nombre").in("id", pres) : Promise.resolve({ data: [] }),
    ]);
    setProyectos(Object.fromEntries((ls || []).map(l => [l.id, l.nombre])));
    setPresupuestos(Object.fromEntries((ps || []).map(x => [x.id, x.nombre])));

    if (lista.length) {
      const ids = lista.map(o => o.id);
      const [{ data: rubros }, { data: facturas }] = await Promise.all([
        supabase.from("obra_rubros").select("id,obra_id,total_base").in("obra_id", ids),
        supabase.from("obra_facturas").select("id,obra_id,total").in("obra_id", ids),
      ]);
      const facturaIds = (facturas || []).map(f => f.id);
      let asignaciones = [];
      if (facturaIds.length) {
        const { data } = await supabase.from("obra_asignaciones").select("factura_id,monto").in("factura_id", facturaIds);
        asignaciones = data || [];
      }
      const obraDeFactura = {};
      (facturas || []).forEach(f => { obraDeFactura[f.id] = f.obra_id; });

      const r = {};
      lista.forEach(o => { r[o.id] = { base: 0, invertido: 0, rubros: 0, sinAsignar: 0 }; });
      (rubros || []).forEach(x => {
        if (!r[x.obra_id]) return;
        r[x.obra_id].base += Number(x.total_base) || 0;
        r[x.obra_id].rubros += 1;
      });
      const asignadoPorFactura = {};
      asignaciones.forEach(a => {
        const oid = obraDeFactura[a.factura_id];
        if (r[oid]) r[oid].invertido += Number(a.monto) || 0;
        asignadoPorFactura[a.factura_id] = (asignadoPorFactura[a.factura_id] || 0) + (Number(a.monto) || 0);
      });

      // Plata que entró pero no está en ningún rubro: no aparece en el control,
      // así que el avance se vería más bajo de lo real sin este aviso.
      (facturas || []).forEach(f => {
        if (!r[f.obra_id]) return;
        const pendiente = (Number(f.total) || 0) - (asignadoPorFactura[f.id] || 0);
        if (pendiente > 0.009) r[f.obra_id].sinAsignar += pendiente;
      });
      setResumen(r);
    }
    setCargando(false);
  }

  function abrirObra(o) { setObraActiva(o); setVista("obra"); }

  if (vista === "activar") {
    return <ActivarObra currentUser={currentUser} onCancelar={() => setVista("lista")} onCreada={async o => { await fetchObras(); setObraActiva(o); setVista("obra"); }} />;
  }

  if (vista === "importar") {
    return <ImportarObra currentUser={currentUser} onVolver={() => setVista("lista")} onCreada={async o => { await fetchObras(); setObraActiva(o); setVista("obra"); }} />;
  }

  if (vista === "obra" && obraActiva) {
    return <VistaObra obra={obraActiva} currentUser={currentUser}
      puede={permiso => puedeEnObra(obraActiva, permiso)}
      onVolver={() => { setVista("lista"); fetchObras(); }} />;
  }

  return (
    <div style={{ fontFamily: colors.font }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: colors.ink, flexShrink: 0 }}>Control de Obra</div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {/* Activar una obra o subirla desde un Excel es crear la línea base
              del control: lo hace quien tiene ese permiso, no cualquiera que
              entre a mirar cómo va su obra. */}
          {puede?.("obras.crear") !== false && <>
          <Button variant="outline" size="md" onClick={() => setVista("activar")}>
            <Plus size={14} /> Desde un presupuesto
          </Button>
          <Button variant="primary" size="md" onClick={() => setVista("importar")}>
            <Upload size={14} /> Subir presupuesto
          </Button>
          </>}
        </div>
      </div>

      {cargando ? <div style={{ textAlign: "center", color: colors.muted, padding: "40px 0", fontSize: 13 }}>Cargando...</div>
        : obras.length === 0 ? (
          <div style={{ textAlign: "center", color: colors.muted, padding: "50px 20px", fontSize: 13, background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, lineHeight: 1.6 }}>
            {cuantasHay > 0 ? (<>
              Hay {cuantasHay} {cuantasHay === 1 ? "obra" : "obras"}, pero {cuantasHay === 1 ? "no es" : "ninguna es"} de tus proyectos.<br />
              <span style={{ fontSize: 12 }}>En Ajustes → Proyectos, “¿Qué ve esta persona?” dice exactamente por qué.</span>
            </>) : (<>
              Todavía no hay obras en curso.<br />
              Un presupuesto aprobado no es una obra: hay que activarlo acá con
              <strong> “Desde un presupuesto”</strong> para empezar a controlar su ejecución.
            </>)}
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
                      <div style={{ fontSize: 14, fontWeight: 700, color: colors.ink }}>
                        {proyectos[o.lead_id] || o.nombre}
                      </div>
                      <div style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
                        {!o.lead_id && <span style={{ color: colors.warning }}>sin proyecto · </span>}
                        {presupuestos[o.presupuesto_id] && presupuestos[o.presupuesto_id] !== (proyectos[o.lead_id] || o.nombre)
                          && <>{presupuestos[o.presupuesto_id]} · </>}
                        {o.cliente_nombre || "Sin cliente"} · {r.rubros} rubros
                      </div>
                    </div>
                    <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: pct > 100 ? colors.danger : colors.brand }}>{pct.toFixed(1)}%</div>
                        <div style={{ fontSize: 9, color: colors.muted, fontWeight: 600, letterSpacing: 0.4 }}>AVANCE</div>
                      </div>
                      {puede?.("borrar.definitivo") && (
                        <button onClick={e => { e.stopPropagation(); setBorrar(o); }} title="Borrar esta obra"
                          style={{ background: "transparent", border: `1px solid ${colors.border}`, borderRadius: colors.radiusSm, padding: "6px 7px", color: colors.muted, cursor: "pointer", display: "flex" }}>
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div style={{ background: colors.neutralSoft, borderRadius: 4, height: 6, marginBottom: 10, overflow: "hidden" }}>
                    <div style={{ background: pct > 100 ? colors.danger : colors.brand, height: 6, width: `${Math.min(pct, 100)}%`, transition: "width .4s" }} />
                  </div>
                  <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-end" }}>
                    <Dato label="Presupuesto" valor={r.base} />
                    <Dato label="Invertido" valor={r.invertido} color={colors.ink} />
                    <Dato label="Saldo" valor={saldo} color={saldo < 0 ? colors.danger : colors.success} />
                    {r.sinAsignar > 0.009 && (
                      <div style={{ display: "flex", alignItems: "center", gap: 5, background: colors.warningSoft, border: `1px solid ${colors.warningBorder}`, borderRadius: 20, padding: "4px 10px" }}>
                        <AlertTriangle size={12} color={colors.warning} />
                        <span style={{ fontSize: 11, color: colors.warning, fontWeight: 600 }}>
                          ${fmt(r.sinAsignar)} sin asignar a rubro
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      {borrar && <BorrarObra obra={borrar} onCancelar={() => setBorrar(null)} onBorrada={() => { setBorrar(null); fetchObras(); }} />}
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
