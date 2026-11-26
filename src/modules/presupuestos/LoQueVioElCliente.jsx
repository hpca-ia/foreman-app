// LO QUE EL CLIENTE TENÍA A LA VISTA, en el registro de aprobaciones.
//
// Cuando lo que se le pidió aprobar es un presupuesto compartido (migración
// 196), no hay archivos que listar: lo que tuvo para mirar es LA FOTO que se
// guardó al compartir. Acá se abre, tal cual la vio, con la misma pieza de su
// enlace. Es el sustento: «para que quede constancia del armado del
// presupuesto» (Hernán, 26/11/2026).
import { useState } from "react";
import { FileText } from "lucide-react";
import { colors } from "../../theme/colors";
import { supabase } from "../../lib/supabase";
import { MODOS } from "./presupuestoParaElCliente.js";
import PresupuestoCompartido from "../../portal/PresupuestoCompartido";

export default function LoQueVioElCliente({ compartidoId }) {
  const [fila, setFila] = useState(null);
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState("");

  async function abrir() {
    if (abierto) { setAbierto(false); return; }
    if (!fila) {
      const { data, error: e } = await supabase.from("presupuesto_compartidos")
        .select("id,modo,con_comparativa,foto,created_at,presupuesto_nombre").eq("id", compartidoId).maybeSingle();
      if (e || !data) { setError(e?.message || "Ya no está la copia de ese presupuesto."); return; }
      setFila(data);
    }
    setAbierto(true);
  }

  return (
    <div className="lo-que-vio-el-cliente">
      <button className="ver-el-presupuesto-compartido" onClick={abrir}
        style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", fontFamily: colors.font, fontSize: 11.5, color: colors.ink,
          background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 7, padding: "4px 9px" }}>
        <FileText size={11} color={colors.muted} />
        {abierto ? "Cerrar el presupuesto" : "El presupuesto y su comparativa, como se le compartieron"}
      </button>
      {error && <div role="alert" style={{ fontSize: 11.5, color: colors.danger, marginTop: 4 }}>{error}</div>}
      {abierto && fila && (
        <div style={{ marginTop: 8, maxWidth: 680, background: colors.bg, borderRadius: 11, padding: 12 }}>
          <div style={{ fontSize: 11, color: colors.inkSoft, marginBottom: 6 }}>
            Se le compartió {MODOS[fila.modo]?.dice.toLowerCase() || ""}{fila.con_comparativa === false ? ", sin la comparativa de empresas" : ""}. Esto es lo que vio.
          </div>
          <PresupuestoCompartido p={{ id: fila.id, titulo: `Presupuesto: ${fila.presupuesto_nombre || ""}`, compartido_el: fila.created_at, estado: "pendiente", foto: fila.foto }} soloVer />
        </div>
      )}
    </div>
  );
}
