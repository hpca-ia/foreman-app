import { Download, FileSpreadsheet, CheckCircle2, AlertTriangle } from "lucide-react";
import { colors } from "../../theme/colors";
import { fmt } from "./calculos";
import RevisionPresupuesto from "./RevisionPresupuesto";

const n = v => Number(v) || 0;

// El presupuesto como vino: capítulos en su orden, con los códigos, cantidades
// y precios del archivo, sus subtotales y el total. No cambia al agrupar ni al
// cargar facturas: es la referencia contra la que se mide todo lo demás.
export default function PresupuestoOriginal({ obra, rubros }) {
  const orden = rubros.slice().sort((a, b) => (n(a.capitulo_orden) - n(b.capitulo_orden)) || (n(a.orden) - n(b.orden)));
  const capitulos = [];
  orden.forEach(r => {
    let c = capitulos[capitulos.length - 1];
    if (!c || c.nombre !== r.capitulo) { c = { nombre: r.capitulo, rubros: [] }; capitulos.push(c); }
    c.rubros.push(r);
  });

  const sinIva = r => n(r.total_base) / (1 + n(r.iva_pct) / 100);
  const totalSin = orden.reduce((s, r) => s + sinIva(r), 0);
  const totalCon = orden.reduce((s, r) => s + n(r.total_base), 0);

  // Contra qué total del archivo comparar: si el archivo ya traía IVA, su
  // total es el "con IVA"; si no, el "sin IVA".
  const comparable = obra.iva_incluido ? totalCon : totalSin;
  const dif = obra.total_excel != null ? comparable - n(obra.total_excel) : null;

  const cols = "64px minmax(220px,1fr) 56px 80px 100px 110px 110px";
  const num = { textAlign: "right" };

  return (
    <div>
      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, padding: 14, marginBottom: 12, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <FileSpreadsheet size={18} color={colors.brand} />
        <div style={{ flex: 1, minWidth: 220, fontSize: 12, color: colors.inkSoft, lineHeight: 1.6 }}>
          <div style={{ fontWeight: 600, color: colors.ink }}>Presupuesto original</div>
          {obra.iva_incluido === true && <div>El archivo ya traía los valores con IVA.</div>}
          {obra.iva_incluido === false && <div>El archivo venía sin IVA; al importarlo se le sumó el {n(obra.iva_pct)} %.</div>}
          {obra.iva_incluido == null && <div>Esta obra se importó antes de que se registrara el IVA del archivo.</div>}
          {obra.total_excel != null && (
            <div style={{ display: "flex", alignItems: "center", gap: 5, color: Math.abs(dif) <= 1 ? colors.success : colors.warning }}>
              {Math.abs(dif) <= 1 ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
              Total del archivo ${fmt(obra.total_excel)} · en FOREMAN ${fmt(comparable)}
              {Math.abs(dif) > 0.009 && <> · diferencia ${fmt(dif)}</>}
            </div>
          )}
        </div>
        {obra.archivo_presupuesto_url && (
          <a href={obra.archivo_presupuesto_url} target="_blank" rel="noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, background: colors.brand, color: "#fff", borderRadius: colors.radiusSm, padding: "8px 12px", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>
            <Download size={13} /> {obra.archivo_presupuesto_nombre || "Descargar el archivo original"}
          </a>
        )}
      </div>

      {Array.isArray(obra.advertencias) && (
        <div style={{ marginBottom: 12 }}>
          <RevisionPresupuesto advertencias={obra.advertencias} guardada />
        </div>
      )}

      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 860 }}>
            <div style={{ display: "grid", gridTemplateColumns: cols, gap: 8, padding: "8px 14px", background: colors.bg, borderBottom: `1px solid ${colors.border}`, fontSize: 9, fontWeight: 700, color: colors.muted, letterSpacing: 0.3 }}>
              <span>CÓDIGO</span><span>DESCRIPCIÓN</span><span>UND</span>
              <span style={num}>CANTIDAD</span><span style={num}>P. UNITARIO</span>
              <span style={num}>TOTAL SIN IVA</span><span style={num}>TOTAL CON IVA</span>
            </div>

            {capitulos.map((c, ci) => {
              const sub = c.rubros.reduce((s, r) => s + sinIva(r), 0);
              const subCon = c.rubros.reduce((s, r) => s + n(r.total_base), 0);
              return (
                <div key={ci}>
                  <div style={{ display: "grid", gridTemplateColumns: cols, gap: 8, padding: "8px 14px", background: colors.brandSoft, borderBottom: `1px solid ${colors.border}`, fontSize: 11, fontWeight: 700, color: colors.brand }}>
                    <span>{ci + 1}</span>
                    <span style={{ gridColumn: "2 / 6" }}>{c.nombre}</span>
                    <span style={num}>${fmt(sub)}</span><span style={num}>${fmt(subCon)}</span>
                  </div>
                  {c.rubros.map(r => (
                    <div key={r.id} style={{ display: "grid", gridTemplateColumns: cols, gap: 8, padding: "6px 14px", borderBottom: `1px solid ${colors.neutralSoft}`, fontSize: 12, alignItems: "center" }}>
                      <span style={{ color: colors.muted, fontSize: 11 }}>{r.codigo || r.numero}</span>
                      <span style={{ color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.descripcion}>{r.descripcion}</span>
                      <span style={{ color: colors.muted, fontSize: 11 }}>{r.unidad}</span>
                      <span style={{ ...num, color: colors.inkSoft }}>{fmt(r.cantidad)}</span>
                      <span style={{ ...num, color: colors.inkSoft }}>${fmt(r.precio_unitario)}</span>
                      <span style={{ ...num, color: colors.ink }}>${fmt(sinIva(r))}</span>
                      <span style={{ ...num, color: colors.ink, fontWeight: 600 }}>${fmt(r.total_base)}</span>
                    </div>
                  ))}
                </div>
              );
            })}

            <div style={{ display: "grid", gridTemplateColumns: cols, gap: 8, padding: "9px 14px", borderTop: `1px solid ${colors.border}`, fontSize: 12, color: colors.inkSoft }}>
              <span /><span style={{ gridColumn: "2 / 6" }}>IVA</span><span /><span style={num}>${fmt(totalCon - totalSin)}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: cols, gap: 8, padding: "11px 14px", background: colors.ink, fontSize: 12, fontWeight: 700, color: "#fff" }}>
              <span /><span style={{ gridColumn: "2 / 6" }}>TOTAL</span>
              <span style={num}>${fmt(totalSin)}</span><span style={num}>${fmt(totalCon)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
