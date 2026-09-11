import { useState, useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import { fmt } from "./calculos";

// Borrar una obra se lleva por delante su presupuesto, sus planillas y su
// libro de facturas. No hay deshacer, así que antes de habilitar el botón se
// cuenta lo que se va a perder y se pide escribir el nombre de la obra:
// obliga a leer cuál es, que es donde se cometen estos errores.
export default function BorrarObra({ obra, onCancelar, onBorrada }) {
  const [conteo, setConteo] = useState(null);
  const [texto, setTexto] = useState("");
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const [rubros, planillas, facturas] = await Promise.all([
        supabase.from("obra_rubros").select("id", { count: "exact", head: true }).eq("obra_id", obra.id),
        supabase.from("planillas").select("id", { count: "exact", head: true }).eq("obra_id", obra.id),
        supabase.from("obra_facturas").select("id,total").eq("obra_id", obra.id),
      ]);
      setConteo({
        rubros: rubros.count || 0,
        planillas: planillas.count || 0,
        facturas: (facturas.data || []).length,
        monto: (facturas.data || []).reduce((s, f) => s + (Number(f.total) || 0), 0),
      });
    })();
  }, [obra.id]);

  async function borrar() {
    setBorrando(true); setError("");
    try {
      const { data: facturas } = await supabase.from("obra_facturas").select("id").eq("obra_id", obra.id);
      const ids = (facturas || []).map(f => f.id);
      if (ids.length) {
        await supabase.from("obra_factura_rubros").delete().in("factura_id", ids);
        // Los gastos de caja chica no se borran: son de la caja, no de la obra.
        // Solo pierden el vínculo con una factura que va a dejar de existir.
        await supabase.from("cajas_gastos").update({ obra_factura_id: null }).in("obra_factura_id", ids);
      }
      await supabase.from("obra_facturas").delete().eq("obra_id", obra.id);
      await supabase.from("planillas").delete().eq("obra_id", obra.id);
      await supabase.from("obra_rubros").delete().eq("obra_id", obra.id);
      await supabase.from("cajas_chicas").update({ obra_id: null }).eq("obra_id", obra.id);
      const { error: e } = await supabase.from("obras").delete().eq("id", obra.id);
      if (e) { setError("No se pudo borrar: " + e.message); setBorrando(false); return; }
      onBorrada();
    } catch (e) {
      setError("No se pudo borrar: " + e.message);
      setBorrando(false);
    }
  }

  const confirmado = texto.trim().toLowerCase() === obra.nombre.trim().toLowerCase();

  return (
    <Modal onClose={onCancelar} maxWidth={460}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
        <AlertTriangle size={18} color={colors.danger} />
        <div style={{ fontSize: 15, fontWeight: 700, color: colors.ink }}>Borrar esta obra</div>
      </div>

      <div style={{ background: colors.dangerSoft, border: `1px solid ${colors.dangerBorder}`, borderRadius: colors.radiusMd, padding: 13, marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: colors.ink, marginBottom: 8 }}>{obra.nombre}</div>
        {conteo === null ? (
          <div style={{ fontSize: 12, color: colors.muted }}>Revisando qué contiene...</div>
        ) : (
          <div style={{ fontSize: 12, color: colors.danger, lineHeight: 1.7 }}>
            Se borran para siempre:<br />
            · {conteo.rubros} rubros del presupuesto<br />
            · {conteo.planillas} planilla{conteo.planillas === 1 ? "" : "s"}<br />
            · {conteo.facturas} factura{conteo.facturas === 1 ? "" : "s"} por ${fmt(conteo.monto)}
            {conteo.facturas > 0 && (
              <><br /><br /><strong>Esta obra ya tiene facturas registradas.</strong> Si es una obra real, anula las facturas en vez de borrar la obra: así queda el rastro de qué pasó.</>
            )}
          </div>
        )}
        <div style={{ fontSize: 11, color: colors.inkSoft, marginTop: 8 }}>
          Las cajas chicas y sus gastos no se borran: solo dejan de estar ligados a esta obra.
        </div>
      </div>

      <label style={{ fontSize: 11, color: colors.inkSoft, fontWeight: 500, display: "block", marginBottom: 4 }}>
        Escribe <strong>{obra.nombre}</strong> para confirmar
      </label>
      <input value={texto} onChange={e => setTexto(e.target.value)} placeholder={obra.nombre}
        style={{ ...inputStyle, marginBottom: 12 }} autoFocus />

      {error && <div style={{ color: colors.danger, fontSize: 12, marginBottom: 10 }}>{error}</div>}

      <div style={{ display: "flex", gap: 8 }}>
        <Button variant="outline" style={{ flex: 1 }} onClick={onCancelar} disabled={borrando}>Cancelar</Button>
        <Button variant="danger" style={{ flex: 1 }} onClick={borrar} disabled={!confirmado || borrando || conteo === null}>
          {borrando ? "Borrando..." : "Borrar definitivamente"}
        </Button>
      </div>
    </Modal>
  );
}
