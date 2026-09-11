import { AlertTriangle, AlertOctagon } from "lucide-react";
import { colors } from "../../theme/colors";
import { fmt } from "./calculos";
import { inputStyle } from "../../components/ui/Input";

const ORIGEN = { manual: "cargada a mano", nova: "leída por NOVA", caja_chica: "desde caja chica" };
const MOTIVO = {
  identidad: "mismo RUC y mismo N° de factura",
  archivo: "es exactamente el mismo archivo",
  "proveedor-monto-fecha": "mismo proveedor, mismo monto y fecha cercana",
};

export default function AlertaDuplicado({ exactos = [], posibles = [], justificacion, setJustificacion }) {
  if (!exactos.length && !posibles.length) return null;
  const grave = exactos.length > 0;

  return (
    <div style={{
      background: grave ? colors.dangerSoft : colors.warningSoft,
      border: `1.5px solid ${grave ? colors.dangerBorder : colors.warningBorder}`,
      borderRadius: colors.radiusMd, padding: 12, marginBottom: 14,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        {grave ? <AlertOctagon size={16} color={colors.danger} /> : <AlertTriangle size={16} color={colors.warning} />}
        <span style={{ fontSize: 13, fontWeight: 700, color: grave ? colors.danger : colors.warning }}>
          {grave ? "Esta factura ya está cargada" : "Posible duplicado"}
        </span>
      </div>

      <div style={{ fontSize: 11, color: grave ? colors.danger : colors.warning, marginBottom: 8 }}>
        {grave
          ? "Cargarla otra vez duplicaría el gasto en el control de la obra."
          : "Se parece a una factura ya cargada. Revisa antes de guardar."}
      </div>

      {[...exactos, ...posibles].map(f => (
        <div key={f.id} style={{ background: "#fff", borderRadius: colors.radiusSm, padding: "8px 10px", marginBottom: 6, fontSize: 12 }}>
          <div style={{ fontWeight: 600, color: colors.ink }}>
            {f.razon_social || "Sin proveedor"}
            {f.numero_factura && <span style={{ color: colors.muted, fontWeight: 400 }}> · #{f.numero_factura}</span>}
            <span style={{ float: "right", fontWeight: 700 }}>${fmt(f.total)}</span>
          </div>
          <div style={{ fontSize: 11, color: colors.inkSoft, marginTop: 2 }}>
            {f.fecha} · {ORIGEN[f.origen] || f.origen}
            {f.subido_por_nombre ? ` por ${f.subido_por_nombre}` : ""}
          </div>
          <div style={{ fontSize: 10, color: colors.muted, marginTop: 2 }}>Coincide en: {MOTIVO[f.motivo] || f.motivo}</div>
        </div>
      ))}

      {grave && (
        <div style={{ marginTop: 8 }}>
          <label style={{ fontSize: 11, color: colors.danger, fontWeight: 600, display: "block", marginBottom: 4 }}>
            Para guardarla igual, explica por qué no es un duplicado *
          </label>
          <input
            value={justificacion}
            onChange={e => setJustificacion(e.target.value)}
            placeholder="Ej: factura reemitida por corrección del proveedor"
            style={{ ...inputStyle, borderColor: colors.dangerBorder }}
          />
          <div style={{ fontSize: 10, color: colors.muted, marginTop: 4 }}>
            Queda registrado quién la cargó y con qué justificación.
          </div>
        </div>
      )}
    </div>
  );
}
