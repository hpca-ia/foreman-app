import { useState } from "react";
import { Upload, Sparkles, TrendingUp, TrendingDown } from "lucide-react";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import { fmt } from "./calculos";
import { compararContraPresupuesto } from "./compararProforma";
import { LECTURA, textoDeNova } from "../../lib/modelos";

// Lo que cotizan hoy contra lo que se presupuestó.
//
// Entre que se arma el presupuesto y que se compra pasan meses, y el precio no
// es el mismo. A veces se consigue mejor —descuento por volumen, bajó el acero,
// se cambió de marca— y a veces peor. Esa diferencia es el BENEFICIO de la
// obra, y es de donde sale la utilidad real: no de vender más caro, sino de
// comprar mejor que lo presupuestado.
//
// Hoy se mira a ojo, con el presupuesto en una pantalla y la proforma en la
// mano. Y cuando se mira a ojo lo que se ve son los ahorros: lo que se pasó de
// precio no salta, porque nadie busca malas noticias.

const n = v => Number(v) || 0;

export default function PanelBeneficios({ rubros = [] }) {
  const [items, setItems] = useState([]);
  const [proveedor, setProveedor] = useState("");
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState("");

  const r = compararContraPresupuesto(items, rubros);
  const vivos = rubros.filter(x => !x.oculto && !x.anulado_por_oc);

  async function leer(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setLeyendo(true); setError("");
    try {
      const b64 = await new Promise(res => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result.split(",")[1]);
        fr.readAsDataURL(file);
      });
      const esPdf = file.type === "application/pdf";
      const lista = vivos.slice(0, 220).map(x => `${x.id}:${x.descripcion.slice(0, 60)}`).join(" | ");

      const res = await fetch("/api/nova", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: LECTURA, max_tokens: 4000,
          system: `Eres NOVA. Lees proformas de proveedores de construcción en Ecuador y devuelves SOLO JSON, sin markdown:

{"proveedor":"","items":[{"descripcion":"","cantidad":0,"unidad":"","monto":0,"rubro_id":null}]}

Una línea por cada renglón de la proforma. "monto" es lo que suma ESE renglón
CON IVA incluido, porque se va a comparar contra el presupuesto de la obra, que
está cargado con IVA: comparar un precio sin IVA contra uno con IVA inventaría
un ahorro del 15% que no existe.

"rubro_id" es el rubro de la lista al que corresponde ese renglón, o null si no
estás seguro. Null es una respuesta válida y es mejor que adivinar: acá se está
midiendo si se compró mejor o peor que lo presupuestado, y un renglón comparado
contra el rubro equivocado da un ahorro o un sobreprecio que no existe.

Rubros de la obra: ${lista}`,
          messages: [{
            role: "user",
            content: [
              esPdf
                ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
                : { type: "image", source: { type: "base64", media_type: file.type || "image/jpeg", data: b64 } },
              { type: "text", text: "Extrae los renglones de esta proforma. Solo JSON." },
            ],
          }],
        }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) throw new Error(data?.error?.message || "NOVA no pudo leerla.");
      const txt = (textoDeNova(data) || "{}").replace(/```json|```/g, "").trim();
      const p = JSON.parse(txt.match(/\{[\s\S]*\}/)?.[0] || txt);
      setProveedor((p.proveedor || "").trim());
      setItems((Array.isArray(p.items) ? p.items : [])
        .filter(x => x && (x.descripcion || n(x.monto)))
        .map((x, k) => ({
          k,
          descripcion: String(x.descripcion || "").trim().slice(0, 90),
          cantidad: n(x.cantidad), unidad: String(x.unidad || "").slice(0, 10),
          monto: Math.round(n(x.monto) * 100) / 100,
          rubro_id: vivos.some(v => v.id === Number(x.rubro_id)) ? Number(x.rubro_id) : null,
        })));
    } catch (e2) {
      setError(e2.message);
    }
    setLeyendo(false);
  }

  const Tarjeta = ({ label, valor, color, icono }) => (
    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`,
      borderRadius: colors.radiusMd, padding: "10px 12px", minWidth: 120 }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, color: colors.muted, letterSpacing: 0.3,
        display: "flex", alignItems: "center", gap: 4 }}>{icono}{label}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color: color || colors.ink, marginTop: 2 }}>${fmt(valor)}</div>
    </div>
  );

  return (
    <div>
      <div style={{ fontSize: 12.5, color: colors.inkSoft, lineHeight: 1.55, marginBottom: 12 }}>
        Subí una proforma y NOVA la compara contra los rubros del presupuesto, renglón por renglón.
        La diferencia es el <strong>beneficio de la obra</strong>: no sale de vender más caro, sale de
        comprar mejor que lo presupuestado.
      </div>

      <div style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: leyendo ? "wait" : "pointer",
          background: colors.brand, borderRadius: colors.radiusSm, padding: "8px 13px",
          fontSize: 12.5, fontWeight: 600, color: "#fff", fontFamily: colors.font }}>
          <Upload size={13} /> {leyendo ? "NOVA está leyendo…" : "Subir una proforma"}
          <input type="file" accept="image/*,.pdf" onChange={leer} disabled={leyendo} style={{ display: "none" }} />
        </label>
        {proveedor && (
          <input value={proveedor} onChange={e => setProveedor(e.target.value)}
            style={{ ...inputStyle, width: 240, padding: "7px 10px", fontSize: 12.5 }} />
        )}
        {items.length > 0 && (
          <button onClick={() => { setItems([]); setProveedor(""); }}
            style={{ background: "none", border: "none", color: colors.muted, fontSize: 11.5,
              cursor: "pointer", fontFamily: colors.font }}>empezar de nuevo</button>
        )}
      </div>

      {error && <div style={{ fontSize: 12, color: colors.danger, marginBottom: 10 }}>{error}</div>}

      {items.length > 0 && (
        <>
          {/* AHORRO Y SOBREPRECIO POR SEPARADO, nunca solo el neto.
              Un neto de "+$300" puede esconder $4.000 de ahorro y $3.700 de
              sobreprecio, y esas son dos obras muy distintas: la primera
              compra bien y tiene un problema puntual; la segunda no sabe lo
              que le está pasando. */}
          <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginBottom: 12 }}>
            <Tarjeta label="PRESUPUESTADO" valor={r.presupuestado} />
            <Tarjeta label="COTIZADO" valor={r.cotizado} />
            <Tarjeta label="SE AHORRA" valor={r.ahorro} color={colors.success}
              icono={<TrendingDown size={11} color={colors.success} />} />
            <Tarjeta label="SE PASA" valor={r.sobreprecio} color={colors.danger}
              icono={<TrendingUp size={11} color={colors.danger} />} />
            <Tarjeta label="NETO" valor={r.neto} color={r.neto >= 0 ? colors.success : colors.danger} />
          </div>

          {r.sinRubro > 0 && (
            <div style={{ fontSize: 11.5, color: colors.warning, background: colors.warningSoft,
              border: `1px solid ${colors.warningBorder}`, borderRadius: colors.radiusMd,
              padding: "8px 11px", marginBottom: 10, lineHeight: 1.5 }}>
              Hay <strong>{r.sinRubro}</strong> {r.sinRubro === 1 ? "renglón" : "renglones"} sin emparejar con un
              rubro. No entran en ningún total: un beneficio calculado sobre la mitad de la proforma no es un
              beneficio. Elegiles el rubro abajo.
            </div>
          )}

          <div style={{ background: colors.surface, border: `1px solid ${colors.border}`,
            borderRadius: colors.radiusMd, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1.3fr 90px 90px 100px", gap: 8,
              padding: "8px 12px", background: colors.bg, fontSize: 9.5, fontWeight: 700,
              color: colors.muted, letterSpacing: 0.3 }}>
              <span>RENGLÓN DE LA PROFORMA</span><span>RUBRO DEL PRESUPUESTO</span>
              <span style={{ textAlign: "right" }}>PRESUPUESTO</span>
              <span style={{ textAlign: "right" }}>COTIZADO</span>
              <span style={{ textAlign: "right" }}>DIFERENCIA</span>
            </div>
            {r.lineas.map((l, i) => (
              <div key={l.k} style={{ display: "grid", gridTemplateColumns: "1.3fr 1.3fr 90px 90px 100px", gap: 8,
                padding: "7px 12px", borderTop: `1px solid ${colors.neutralSoft}`, alignItems: "center", fontSize: 11.5 }}>
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  color: colors.ink }} title={l.descripcion}>
                  {l.descripcion}
                  {l.cantidad ? <span style={{ color: colors.muted }}> · {l.cantidad} {l.unidad}</span> : null}
                </span>
                <select value={l.rubro_id ?? ""}
                  onChange={e => setItems(xs => xs.map((x, j) => j === i
                    ? { ...x, rubro_id: e.target.value ? Number(e.target.value) : null } : x))}
                  style={{ ...inputStyle, padding: "4px 6px", fontSize: 11,
                    color: l.rubro_id ? colors.ink : colors.warning }}>
                  <option value="">¿contra qué rubro?</option>
                  {vivos.map(x => (
                    <option key={x.id} value={x.id}>{x.numero} · {x.descripcion.slice(0, 44)}</option>
                  ))}
                </select>
                <span style={{ textAlign: "right", color: colors.muted }}>
                  {l.presupuestado == null ? "—" : `$${fmt(l.presupuestado)}`}
                </span>
                <input type="number" step="0.01" value={l.monto}
                  onChange={e => setItems(xs => xs.map((x, j) => j === i ? { ...x, monto: e.target.value } : x))}
                  style={{ ...inputStyle, padding: "4px 6px", fontSize: 11.5, textAlign: "right" }} />
                <span style={{ textAlign: "right", fontWeight: 700,
                  color: l.diferencia == null ? colors.muted : l.diferencia >= 0 ? colors.success : colors.danger }}>
                  {l.diferencia == null ? "—"
                    : `${l.diferencia >= 0 ? "+" : "−"}$${fmt(Math.abs(l.diferencia))}`}
                  {l.pct != null && (
                    <span style={{ fontWeight: 400, fontSize: 10, display: "block", color: colors.muted }}>
                      {l.pct > 0 ? "+" : ""}{l.pct}%
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {items.length === 0 && !leyendo && (
        <div style={{ textAlign: "center", color: colors.muted, padding: "40px 20px", fontSize: 13,
          background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd,
          display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <Sparkles size={26} />
          Subí la proforma de un proveedor y se compara sola contra el presupuesto.
        </div>
      )}
    </div>
  );
}
