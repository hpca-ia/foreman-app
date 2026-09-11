import { useState, useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import { fmt } from "./calculos";

export default function ActivarObra({ currentUser, onCancelar, onCreada }) {
  const [presupuestos, setPresupuestos] = useState([]);
  const [sel, setSel] = useState(null);
  const [items, setItems] = useState([]);
  const [nombre, setNombre] = useState("");
  const [yaIncluyeIva, setYaIncluyeIva] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { fetchPresupuestos(); }, []);

  async function fetchPresupuestos() {
    const { data } = await supabase.from("presupuestos").select("*").order("created_at", { ascending: false });
    setPresupuestos(data || []);
  }

  async function elegir(p) {
    setSel(p);
    setNombre(p.nombre || p.cliente_nombre || "");
    const { data } = await supabase.from("presupuesto_items").select("*").eq("presupuesto_id", p.id).order("orden");
    setItems(data || []);
  }

  async function activar() {
    if (!sel || !nombre.trim()) return;
    if (!items.length) { setError("Ese presupuesto no tiene rubros cargados."); return; }
    setGuardando(true); setError("");
    // Si los totales del presupuesto ya traen IVA (caso de presupuestos
    // importados desde Excel), no se vuelve a aplicar.
    const ivaPct = yaIncluyeIva ? 0 : (Number(sel.iva_pct) || 0);

    const { data: obra, error: e1 } = await supabase.from("obras").insert({
      nombre: nombre.trim(),
      cliente_id: sel.cliente_id || null,
      cliente_nombre: sel.cliente_nombre || null,
      presupuesto_id: sel.id,
      created_by: currentUser.id,
    }).select().single();

    if (e1 || !obra) { setError("No se pudo crear la obra: " + (e1?.message || "")); setGuardando(false); return; }

    // Copia congelada del presupuesto, un registro por rubro.
    // El orden de capítulos viene codificado en `orden` como capOrden*1000 + indice.
    //
    // total_base va CON IVA, igual que en el Excel (P.U. con IVA × cantidad),
    // porque las facturas que se cargan también vienen con IVA. Comparar un
    // presupuesto sin IVA contra facturas con IVA inflaría el avance ~15%.
    const filas = items.map((it, idx) => ({
      obra_id: obra.id,
      numero: idx + 1,
      capitulo: it.capitulo || "SIN CAPÍTULO",
      capitulo_orden: Math.floor((Number(it.orden) || 0) / 1000) || 0,
      orden: Number(it.orden) || idx,
      descripcion: it.descripcion,
      unidad: it.unidad || "",
      cantidad: Number(it.cantidad) || 0,
      precio_unitario: Number(it.precio_unitario) || 0,
      iva_pct: ivaPct,
      total_base: Math.round((Number(it.total) || 0) * (1 + ivaPct / 100) * 100) / 100,
      presupuesto_item_id: it.id,
    }));

    const { error: e2 } = await supabase.from("obra_rubros").insert(filas);
    if (e2) { setError("La obra se creó pero fallaron los rubros: " + e2.message); setGuardando(false); return; }

    // Primera planilla, lista para recibir facturas
    await supabase.from("planillas").insert({
      obra_id: obra.id, numero: 1, nombre: "Planilla N°1", fecha_desde: new Date().toISOString().split("T")[0],
    });

    setGuardando(false);
    onCreada(obra);
  }

  const subtotalItems = items.reduce((s, i) => s + (Number(i.total) || 0), 0);
  const ivaPctSel = yaIncluyeIva ? 0 : (Number(sel?.iva_pct) || 0);
  const totalPresupuesto = subtotalItems * (1 + ivaPctSel / 100);
  const capitulos = [...new Set(items.map(i => i.capitulo || "SIN CAPÍTULO"))];

  return (
    <div style={{ fontFamily: colors.font }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <Button variant="secondary" size="sm" onClick={onCancelar}><ArrowLeft size={13} /> Volver</Button>
        <div style={{ fontSize: 16, fontWeight: 700, color: colors.ink }}>Activar presupuesto como obra</div>
      </div>

      <div style={{ fontSize: 12, color: colors.inkSoft, marginBottom: 12 }}>
        Se copian los rubros del presupuesto como línea base de la obra. Esa copia queda congelada: si después editas el presupuesto, la obra no cambia.
      </div>

      <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
        {presupuestos.length === 0 && <div style={{ color: colors.muted, fontSize: 13, padding: "20px 0", textAlign: "center" }}>No hay presupuestos. Créalos primero en el módulo Presupuestos.</div>}
        {presupuestos.map(p => (
          <div key={p.id} onClick={() => elegir(p)}
            style={{ background: colors.surface, border: `1.5px solid ${sel?.id === p.id ? colors.brand : colors.border}`, borderRadius: colors.radiusMd, padding: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: colors.ink }}>{p.nombre}</div>
              <div style={{ fontSize: 11, color: colors.muted }}>{p.cliente_nombre || "Sin cliente"} · {p.estado}</div>
            </div>
            <div style={{ marginLeft: "auto", fontSize: 13, fontWeight: 600, color: colors.brand }}>${fmt(p.total)}</div>
          </div>
        ))}
      </div>

      {sel && (
        <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: colors.ink, marginBottom: 12 }}>Confirmar activación</div>
          <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
            <div>
              <label style={{ fontSize: 11, color: colors.muted, display: "block", marginBottom: 4 }}>Nombre de la obra</label>
              <input value={nombre} onChange={e => setNombre(e.target.value)} style={inputStyle} placeholder="Ej: Residencia Villa Fontana" />
            </div>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, cursor: "pointer" }}>
            <input type="checkbox" checked={yaIncluyeIva} onChange={e => setYaIncluyeIva(e.target.checked)} style={{ cursor: "pointer" }} />
            <span style={{ fontSize: 12, color: colors.inkSoft }}>
              Los totales de este presupuesto <strong>ya incluyen IVA</strong> (típico en presupuestos importados de Excel con tasas mixtas)
            </span>
          </label>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 14, fontSize: 12, color: colors.inkSoft }}>
            <span><strong>{items.length}</strong> rubros</span>
            <span><strong>{capitulos.length}</strong> capítulos</span>
            <span>Línea base (con IVA {ivaPctSel}%): <strong>${fmt(totalPresupuesto)}</strong></span>
          </div>
          {error && <div style={{ color: colors.danger, fontSize: 12, marginBottom: 10 }}>{error}</div>}
          <Button variant="primary" size="lg" style={{ width: "100%" }} onClick={activar} disabled={guardando || !nombre.trim()}>
            {guardando ? "Activando..." : "Activar obra"}
          </Button>
        </div>
      )}
    </div>
  );
}
