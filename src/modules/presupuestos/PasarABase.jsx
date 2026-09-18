import { useState } from "react";
import { X, Database, Loader2 } from "lucide-react";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import { colors } from "../../theme/colors";
import { supabase } from "../../lib/supabase";
import { alimentarBase, resumenAlimentacion } from "../../lib/baseRubros";
import { versionDe } from "./documentoPresupuesto";

// Un presupuesto trabajado pasa a la base de rubros cuando se da por bueno,
// no solo: mientras se ajusta, sus precios cambian cada rato y no son
// referencia de nada.
//
// Cada rubro entra con su precio final y su utilidad, así la base sabe cuánto
// fue costo y cuánto margen. Si se vuelve a pasar, se reemplazan los precios
// que había dejado este presupuesto en vez de sumarse otra vez.

const fmt = n => (Number(n) || 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PasarABase({ presupuesto, items, onCerrar, onHecho }) {
  const [trabajando, setTrabajando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const conPrecio = items.filter(i => Number(i.precio_unitario) > 0 && String(i.descripcion || "").trim());
  const sinPrecio = items.length - conPrecio.length;
  const conUtilidad = conPrecio.filter(i => Number(i.utilidad_pct) > 0).length;
  const { base } = versionDe(presupuesto.nombre);
  const antes = presupuesto.en_base_at ? new Date(presupuesto.en_base_at).toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" }) : null;

  async function pasar() {
    setTrabajando(true);
    // Lo que este presupuesto había dejado antes sale, para no contarlo dos
    // veces. Sin la migración 027 no se puede saber cuál era: se suma.
    let reemplazo = true;
    if (antes) {
      const { error } = await supabase.from("precios_historial").delete().eq("presupuesto_id", presupuesto.id);
      if (error) reemplazo = false;
    }
    const r = await alimentarBase(
      conPrecio.map(i => ({ descripcion: i.descripcion, unidad: i.unidad, precio_unitario: Number(i.precio_unitario), capitulo: i.capitulo, cantidad: i.cantidad, utilidad_pct: Number(i.utilidad_pct) || 0 })),
      {
        tipo: "cliente", cliente: presupuesto.cliente_nombre, proyecto: base, fuente: "presupuesto",
        presupuestoId: presupuesto.id,
        ivaIncluido: Number(presupuesto.iva_pct) > 0 ? false : null,
        utilidad: { estado: "con_utilidad", porRubro: true },
      },
    );
    if (!r.error) {
      const ahora = new Date().toISOString();
      const { error } = await supabase.from("presupuestos").update({ en_base_at: ahora }).eq("id", presupuesto.id);
      if (!error) onHecho?.(ahora);
    }
    setResultado({ ...r, reemplazo });
    setTrabajando(false);
  }

  return (
    <Modal onClose={onCerrar} maxWidth={520}>
      <div style={{ display: "flex", alignItems: "flex-start", marginBottom: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: colors.ink, display: "flex", alignItems: "center", gap: 7 }}><Database size={16} /> Pasar a la base de rubros</div>
        <button onClick={onCerrar} style={{ marginLeft: "auto", background: "none", border: "none", color: colors.muted, cursor: "pointer", display: "flex" }}><X size={18} /></button>
      </div>

      {resultado ? (
        <>
          <div style={{ fontSize: 13, color: resultado.error ? colors.danger : colors.success, marginBottom: 8, fontWeight: 600 }}>
            {resultado.error ? "No se pudo pasar a la base." : "Listo: el presupuesto ya es parte de la base."}
          </div>
          <div style={{ fontSize: 12, color: colors.inkSoft, lineHeight: 1.5 }}>{resumenAlimentacion(resultado) || "No había precios nuevos que guardar."}</div>
          {!resultado.reemplazo && <div style={{ fontSize: 12, color: colors.warning, marginTop: 6 }}>Los precios de la vez anterior no se pudieron quitar (falta la migración 027): quedaron los dos.</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}><Button variant="primary" onClick={onCerrar} style={{ background: colors.ink }}>Cerrar</Button></div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 13, color: colors.inkSoft, lineHeight: 1.55 }}>
            <div><strong style={{ color: colors.ink }}>{conPrecio.length} rubros</strong> entran a la base como precios de <strong style={{ color: colors.ink }}>{presupuesto.cliente_nombre || "este cliente"}</strong>, proyecto {base}.</div>
            <div style={{ marginTop: 6 }}>Cada uno con su precio final y su utilidad{conUtilidad ? ` (${conUtilidad} tienen utilidad sumada)` : ""}: la base sabe cuánto fue costo y cuánto margen.</div>
            {sinPrecio > 0 && <div style={{ marginTop: 6, color: colors.muted }}>{sinPrecio} {sinPrecio === 1 ? "rubro sin precio no entra" : "rubros sin precio no entran"}.</div>}
            <div style={{ marginTop: 6, color: colors.muted }}>Total que representa: ${fmt(conPrecio.reduce((s, i) => s + (Number(i.total) || 0), 0))} sin IVA.</div>
          </div>
          {antes && (
            <div style={{ fontSize: 12, color: colors.warning, background: colors.warningSoft, border: `1px solid ${colors.warningBorder}`, borderRadius: colors.radiusSm, padding: "8px 10px", marginTop: 12 }}>
              Este presupuesto ya se pasó a la base el {antes}. Si lo vuelves a pasar, sus precios de esa vez se reemplazan por los de ahora.
            </div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
            <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
            <Button variant="primary" onClick={pasar} disabled={trabajando || !conPrecio.length} style={{ background: colors.ink }}>
              {trabajando ? <><Loader2 size={14} /> Pasando…</> : antes ? "Volver a pasar" : `Pasar ${conPrecio.length} rubros a la base`}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
