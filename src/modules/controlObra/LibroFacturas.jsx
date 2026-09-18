import { useState, useMemo } from "react";
import { Search, FileSpreadsheet, X } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { exportarExcel } from "../../lib/exportar";
import { fmt, resumenPlanilla, TIPOS_GASTO } from "./calculos";
import ModalFactura from "./ModalFactura";
import FilaFactura from "./FilaFactura";
import { Mini } from "./PanelFacturas";

// El libro de facturas de la obra: todas, o las de una planilla, con filtros.
//
// Es la pregunta que el Excel contestaba con autofiltro: cuánto le llevamos
// comprado a tal ferretería en toda la obra, qué facturas movieron el rubro de
// hormigón, qué quedó sin asignar. Los totales de arriba son siempre los de lo
// que se está viendo, no los de la obra entera.

const pelado = t => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const tipoLabel = id => TIPOS_GASTO.find(t => t.id === id)?.label || id || "—";

export default function LibroFacturas({ obra, rubros, actividades = [], planillas, facturas, asignaciones, currentUser, onCambio }) {
  const [alcance, setAlcance] = useState("todo");        // todo | sin | id de planilla
  const [proveedor, setProveedor] = useState("");
  const [tipo, setTipo] = useState("");
  const [rubro, setRubro] = useState("");
  const [texto, setTexto] = useState("");
  const [soloSueltas, setSoloSueltas] = useState(false);
  const [modal, setModal] = useState(null);

  const nombrePlanilla = id => {
    const p = planillas.find(x => x.id === id);
    return p ? p.nombre || `Planilla N°${p.numero}` : "Sin planilla";
  };

  const asignadoA = useMemo(() => {
    const m = {};
    asignaciones.forEach(a => { m[a.factura_id] = (m[a.factura_id] || 0) + (Number(a.monto) || 0); });
    return m;
  }, [asignaciones]);

  const rubrosDe = useMemo(() => {
    const m = {};
    asignaciones.forEach(a => {
      const r = rubros.find(x => x.id === a.obra_rubro_id);
      if (!r) return;
      (m[a.factura_id] = m[a.factura_id] || []).push(r);
    });
    return m;
  }, [asignaciones, rubros]);

  // Primero el alcance; los proveedores del filtro son los de ese alcance, para
  // no ofrecer uno que no tiene nada ahí.
  const delAlcance = facturas.filter(f =>
    alcance === "todo" ? true : alcance === "sin" ? !f.planilla_id : f.planilla_id === Number(alcance));

  const proveedores = useMemo(() => {
    const m = {};
    delAlcance.forEach(f => {
      const k = (f.razon_social || "Sin proveedor").trim();
      m[k] = m[k] || { nombre: k, cuantas: 0, total: 0 };
      m[k].cuantas += 1; m[k].total += Number(f.total) || 0;
    });
    return Object.values(m).sort((a, b) => b.total - a.total);
  }, [delAlcance]);

  const q = pelado(texto.trim());
  const vistas = delAlcance.filter(f => {
    if (proveedor && (f.razon_social || "Sin proveedor").trim() !== proveedor) return false;
    if (tipo && (f.tipo || "otro") !== tipo) return false;
    if (rubro && !(rubrosDe[f.id] || []).some(r => r.id === Number(rubro))) return false;
    if (soloSueltas && (asignadoA[f.id] || 0) + 0.01 >= (Number(f.total) || 0)) return false;
    if (q && ![f.detalle, f.justificacion, f.razon_social, f.numero_factura, f.ruc, f.numero_cheque].some(c => pelado(c).includes(q))) return false;
    return true;
  });

  const resumen = resumenPlanilla({ facturas: vistas, asignaciones: asignaciones.filter(a => vistas.some(f => f.id === a.factura_id)) });
  const alRubro = rubro
    ? asignaciones.filter(a => a.obra_rubro_id === Number(rubro) && vistas.some(f => f.id === a.factura_id)).reduce((s, a) => s + (Number(a.monto) || 0), 0)
    : 0;
  const hayFiltro = proveedor || tipo || rubro || texto || soloSueltas;

  function limpiar() { setProveedor(""); setTipo(""); setRubro(""); setTexto(""); setSoloSueltas(false); }

  async function eliminar(f) {
    if (!window.confirm(`¿Eliminar la factura ${f.numero_factura || ""} de ${f.razon_social || "proveedor"}?`)) return;
    await supabase.from("obra_asignaciones").delete().eq("factura_id", f.id);
    await supabase.from("obra_facturas").delete().eq("id", f.id);
    onCambio();
  }

  function descargar() {
    const alcanceTxt = alcance === "todo" ? "Todo el proyecto" : alcance === "sin" ? "Sin planilla" : nombrePlanilla(Number(alcance));
    const filtros = [
      proveedor && `Proveedor: ${proveedor}`,
      tipo && `Tipo: ${tipoLabel(tipo)}`,
      rubro && `Rubro: ${(() => { const r = rubros.find(x => x.id === Number(rubro)); return r ? `${r.numero} ${r.descripcion}` : ""; })()}`,
      texto && `Concepto: "${texto}"`,
      soloSueltas && "Solo sin asignar",
    ].filter(Boolean).join(" · ");
    const filas = [
      [`FACTURAS — ${obra.nombre}`],
      [alcanceTxt, filtros],
      [],
      ["N°", "FECHA", "PLANILLA", "RUC", "PROVEEDOR", "N° FACTURA", "N° CHEQUE", "DETALLE", "JUSTIFICACIÓN",
       "BASE 0%", "BASE 5%", "BASE 15%", "IVA", "TOTAL", "TIPO", "RUBRO ASIGNADO", "SIN ASIGNAR"],
    ];
    vistas.forEach((f, i) => {
      const suelto = Math.max(0, Math.round(((Number(f.total) || 0) - (asignadoA[f.id] || 0)) * 100) / 100);
      filas.push([i + 1, f.fecha, nombrePlanilla(f.planilla_id), f.ruc || "", f.razon_social || "", f.numero_factura || "", f.numero_cheque || "",
        f.detalle || "", f.justificacion || "",
        Number(f.subtotal_0) || 0, Number(f.subtotal_5) || 0, Number(f.subtotal_15) || 0, Number(f.iva) || 0, Number(f.total) || 0,
        tipoLabel(f.tipo), (rubrosDe[f.id] || []).map(r => `${r.numero} ${r.descripcion}`).join(" · ") || "SIN ASIGNAR", suelto]);
    });
    filas.push([]);
    filas.push(["", "", "", "", "", "", "", "", "TOTALES", resumen.subtotal_0, resumen.subtotal_5, resumen.subtotal_15, resumen.iva, resumen.total, "", "", resumen.sinAsignar]);
    exportarExcel(`${obra.nombre} - Facturas - ${alcanceTxt}`, [
      { nombre: "Facturas", filas, anchos: [5, 11, 16, 14, 30, 18, 14, 40, 30, 11, 11, 11, 11, 12, 16, 36, 12] },
    ]);
  }

  const campo = { background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: "7px 10px", fontSize: 12, fontFamily: colors.font, color: colors.ink, minWidth: 0, width: "100%", boxSizing: "border-box" };
  const etiqueta = { fontSize: 9, color: colors.muted, fontWeight: 600, letterSpacing: 0.4, marginBottom: 4 };

  return (
    <div>
      {/* Filtros: en el teléfono se apilan de a dos, en la computadora van en una fila. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginBottom: 10 }}>
        <div>
          <div style={etiqueta}>PLANILLA</div>
          <select value={alcance} onChange={e => { setAlcance(e.target.value); setProveedor(""); }} style={campo}>
            <option value="todo">Todo el proyecto</option>
            {planillas.slice().reverse().map(p => <option key={p.id} value={p.id}>{p.nombre || `Planilla N°${p.numero}`}{p.estado === "cerrada" ? " (cerrada)" : ""}</option>)}
            {facturas.some(f => !f.planilla_id) && <option value="sin">Sin planilla</option>}
          </select>
        </div>
        <div>
          <div style={etiqueta}>PROVEEDOR</div>
          <select value={proveedor} onChange={e => setProveedor(e.target.value)} style={campo}>
            <option value="">Todos ({proveedores.length})</option>
            {proveedores.map(p => <option key={p.nombre} value={p.nombre}>{p.nombre} · {p.cuantas}</option>)}
          </select>
        </div>
        <div>
          <div style={etiqueta}>TIPO DE GASTO</div>
          <select value={tipo} onChange={e => setTipo(e.target.value)} style={campo}>
            <option value="">Todos</option>
            {TIPOS_GASTO.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <div style={etiqueta}>RUBRO</div>
          <select value={rubro} onChange={e => setRubro(e.target.value)} style={campo}>
            <option value="">Todos</option>
            {rubros.map(r => <option key={r.id} value={r.id}>{r.numero} {r.descripcion}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ ...campo, display: "flex", alignItems: "center", gap: 6, flex: "1 1 220px", width: "auto" }}>
          <Search size={13} color={colors.muted} />
          <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Concepto, detalle, N° de factura, RUC…"
            style={{ border: "none", outline: "none", background: "transparent", fontSize: 12, fontFamily: colors.font, color: colors.ink, flex: 1, minWidth: 0 }} />
          {texto && <button onClick={() => setTexto("")} style={{ background: "none", border: "none", color: colors.muted, cursor: "pointer", display: "flex", padding: 0 }}><X size={13} /></button>}
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: colors.inkSoft, cursor: "pointer" }}>
          <input type="checkbox" checked={soloSueltas} onChange={e => setSoloSueltas(e.target.checked)} />
          Solo sin asignar
        </label>
        {hayFiltro && <Button variant="secondary" size="sm" onClick={limpiar}>Limpiar filtros</Button>}
        <Button variant="outline" size="sm" onClick={descargar} disabled={!vistas.length} style={{ marginLeft: "auto" }}>
          <FileSpreadsheet size={13} /> Excel de este listado
        </Button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 8, marginBottom: 14 }}>
        <Mini label="Facturas" valor={resumen.cantidad} moneda={false} />
        <Mini label="Base 0%" valor={resumen.subtotal_0} />
        <Mini label="Base 5%" valor={resumen.subtotal_5} />
        <Mini label="Base 15%" valor={resumen.subtotal_15} />
        <Mini label="IVA" valor={resumen.iva} />
        <Mini label="Total" valor={resumen.total} destacado />
        {rubro && <Mini label="Asignado al rubro" valor={alRubro} destacado />}
        {resumen.sinAsignar > 0.009 && <Mini label="Sin asignar" valor={resumen.sinAsignar} />}
      </div>

      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, overflow: "hidden" }}>
        {vistas.length === 0 ? (
          <div style={{ textAlign: "center", color: colors.muted, padding: "40px 20px", fontSize: 13 }}>
            {facturas.length === 0 ? "Esta obra todavía no tiene facturas." : "Ninguna factura cumple esos filtros."}
          </div>
        ) : vistas.map(f => (
          <FilaFactura key={f.id} f={f} asignado={asignadoA[f.id] || 0}
            extra={[alcance === "todo" && nombrePlanilla(f.planilla_id), (rubrosDe[f.id] || []).map(r => `${r.numero} ${r.descripcion}`).join(" · ")].filter(Boolean).join(" · ")}
            onEditar={() => setModal({ factura: f })} onEliminar={() => eliminar(f)} />
        ))}
      </div>

      {modal && (
        // Se edita dentro de su propia planilla: pasarle otra la movería de período.
        <ModalFactura actividades={actividades}
          obra={obra} rubros={rubros} planilla={planillas.find(p => p.id === modal.factura?.planilla_id) || null}
          factura={modal.factura}
          asignacionesFactura={modal.factura ? asignaciones.filter(a => a.factura_id === modal.factura.id) : []}
          currentUser={currentUser}
          onCerrar={() => setModal(null)}
          onGuardado={() => { setModal(null); onCambio(); }}
        />
      )}
    </div>
  );
}
