import { useState, useEffect, useCallback } from "react";
import { Upload, Sparkles, TrendingUp, TrendingDown, Plus, Trash2, Check } from "lucide-react";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import { fmt } from "./calculos";
import { compararContraPresupuesto } from "./compararProforma";
import { LECTURA, textoDeNova } from "../../lib/modelos";
import { beneficiosDe, guardarVarios, guardarBeneficio, borrarBeneficio, totales, hojaComoTexto } from "./beneficios";

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

export default function PanelBeneficios({ obra, rubros = [], currentUser }) {
  const [items, setItems] = useState([]);
  const [proveedor, setProveedor] = useState("");
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState("");
  // LO QUE YA SE GANÓ, GUARDADO. Antes la comparación se perdía al cerrar la
  // pantalla: servía para mirar una proforma y no para saber cómo va la obra.
  const [guardados, setGuardados] = useState([]);
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [aMano, setAMano] = useState(null);

  const cargar = useCallback(async () => {
    if (!obra?.id) return;
    const r = await beneficiosDe(obra.id);
    if (r.error) { setError(r.error); return; }
    setGuardados(r.beneficios);
  }, [obra?.id]);
  useEffect(() => { cargar(); }, [cargar]);

  const t = totales(guardados);

  const r = compararContraPresupuesto(items, rubros);
  const vivos = rubros.filter(x => !x.oculto && !x.anulado_por_oc);

  async function leer(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setLeyendo(true); setError("");
    try {
      const b64 = /\.(xlsx|xlsm|xls)$/i.test(file.name || "") ? null : await new Promise(res => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result.split(",")[1]);
        fr.readAsDataURL(file);
      });
      const esPdf = file.type === "application/pdf";
      // UNA PLANILLA DE EXCEL NO SE LE PASA AL MODELO COMO ARCHIVO: adentro es
      // un zip. Se abre acá, se vuelca como texto y el modelo encuentra las
      // columnas —que es lo que sabe hacer, y lo que nadie puede adivinar de
      // antemano porque cada proveedor arma la suya—.
      const esHoja = /\.(xlsx|xlsm|xls)$/i.test(file.name || "");
      const texto = esHoja ? await hojaComoTexto(file) : null;
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
            content: esHoja
              ? [{ type: "text", text: `Esta es una planilla de Excel volcada tal cual, una fila por renglón y las celdas separadas por |. Encontrá la columna de descripción, la de cantidad, la de unidad y la del total de cada renglón. Ignorá encabezados, subtotales y totales generales.\n\n${texto}\n\nExtrae los renglones. Solo JSON.` }]
              : [
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

  /**
   * GUARDAR LO COMPARADO.
   *
   * Hasta acá la comparación servía para mirar una proforma y se perdía al
   * cerrar la pantalla. Un beneficio que no queda escrito no se puede ir
   * acumulando, y entonces la pregunta que importa —"¿cuánto llevamos ganado
   * contra el presupuesto?"— no se puede contestar hasta el cierre, que es
   * cuando ya no sirve para decidir nada.
   *
   * Solo los renglones emparejados: uno sin rubro no se compara contra nada.
   */
  async function guardarComparacion() {
    const van = r.lineas.filter(l => l.presupuestado != null);
    if (!van.length) { setError("Ningún renglón tiene rubro: no hay nada que comparar todavía."); return; }
    setOcupado(true); setError(""); setAviso("");
    const res = await guardarVarios(van.map(l => ({
      obra_id: obra.id, obra_rubro_id: l.rubro_id ?? null,
      descripcion: l.descripcion, cantidad: n(l.cantidad) || null, unidad: l.unidad || null,
      presupuestado: n(l.presupuestado), real: n(l.cotizado),
      proveedor: proveedor || null, origen: "proforma",
      creado_por: currentUser?.id ?? null, creado_nombre: currentUser?.name || null,
    })));
    setOcupado(false);
    if (res.error) { setError(res.error); return; }
    setItems([]); setProveedor("");
    await cargar();
    setAviso(`${res.guardados} ${res.guardados === 1 ? "beneficio guardado" : "beneficios guardados"}. Ya suman al total de la obra.`);
  }

  async function guardarAMano() {
    const f = aMano || {};
    if (!String(f.descripcion || "").trim()) { setError("Escribí qué se compró."); return; }
    setOcupado(true); setError("");
    const rubro = vivos.find(x => String(x.id) === String(f.obra_rubro_id));
    const res = await guardarBeneficio({
      id: f.id,
      obra_id: obra.id, obra_rubro_id: f.obra_rubro_id ? Number(f.obra_rubro_id) : null,
      descripcion: f.descripcion.trim(),
      // Si se eligió un rubro y no se escribió lo presupuestado, se toma el del
      // rubro: es el número contra el que hay que comparar y ya está cargado.
      presupuestado: n(f.presupuestado) || (rubro ? n(rubro.total_base) : 0),
      real: n(f.real), proveedor: f.proveedor || null, nota: f.nota || null,
      origen: "manual", fecha: f.fecha || undefined,
      creado_por: currentUser?.id ?? null, creado_nombre: currentUser?.name || null,
    });
    setOcupado(false);
    if (res.error) { setError(res.error); return; }
    setAMano(null);
    await cargar();
    setAviso("Guardado.");
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
          <Upload size={13} /> {leyendo ? "NOVA está leyendo…" : "Subir una proforma (PDF, foto o Excel)"}
          <input type="file" accept="image/*,.pdf,.xlsx,.xlsm,.xls" onChange={leer} disabled={leyendo} style={{ display: "none" }} />
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
      {aviso && <div style={{ fontSize: 12, color: colors.success, marginBottom: 10 }}>{aviso}</div>}

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
            <div style={{ display: "flex", alignItems: "center" }}>
              <Button variant="primary" size="sm" disabled={ocupado} onClick={guardarComparacion}>
                <Check size={13} /> {ocupado ? "Guardando…" : "Guardar estos beneficios"}
              </Button>
            </div>
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

      {items.length === 0 && !leyendo && !guardados.length && !aMano && (
        <div style={{ textAlign: "center", color: colors.muted, padding: "34px 20px", fontSize: 13,
          background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd,
          display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <Sparkles size={26} />
          Subí la proforma de un proveedor y se compara sola contra el presupuesto.
          <span style={{ fontSize: 11.5 }}>O cargá un beneficio a mano: muchos no están en ningún papel.</span>
        </div>
      )}

      {/* ── LO QUE YA SE GANÓ (O SE PERDIÓ) EN ESTA OBRA ──────────────────
          La comparación de arriba es de una proforma; esto es la obra entera,
          y se va llenando a lo largo de los meses. Es la única manera de que
          la pregunta "¿cómo venimos contra el presupuesto?" tenga respuesta
          antes del cierre, que es cuando ya no sirve para decidir nada.

          A MANO TAMBIÉN, y no como excepción: la mitad de los beneficios de
          una obra no están en ningún papel —se negoció por teléfono, el
          contratista bajó el precio, se cambió una marca—. Si solo se pudieran
          cargar leyendo un archivo, esos no entrarían nunca y el total mentiría
          siempre para el mismo lado. */}
      <div style={{ marginTop: items.length ? 18 : 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", marginBottom: 9 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.ink, flex: 1 }}>
            Beneficios de la obra{t.cuantos ? ` · ${t.cuantos}` : ""}
          </div>
          {!aMano && (
            <Button variant="outline" size="sm" onClick={() => setAMano({ fecha: new Date().toISOString().slice(0, 10) })}>
              <Plus size={12} /> Cargar uno a mano
            </Button>
          )}
        </div>

        {t.cuantos > 0 && (
          <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginBottom: 10 }}>
            <Tarjeta label="PRESUPUESTADO" valor={t.presupuestado} />
            <Tarjeta label="COSTÓ" valor={t.real} />
            <Tarjeta label="SE AHORRÓ" valor={t.ahorro} color={colors.success}
              icono={<TrendingDown size={11} color={colors.success} />} />
            <Tarjeta label="SE PASÓ" valor={t.sobreprecio} color={colors.danger}
              icono={<TrendingUp size={11} color={colors.danger} />} />
            <Tarjeta label="NETO DE LA OBRA" valor={t.neto} color={t.neto >= 0 ? colors.success : colors.danger} />
          </div>
        )}

        {aMano && (
          <div style={{ background: colors.surface, border: `1px solid ${colors.brand}`, borderRadius: colors.radiusMd,
            padding: 12, marginBottom: 10, display: "grid", gap: 8,
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <input autoFocus value={aMano.descripcion || ""} placeholder="Qué se compró o se negoció"
                onChange={e => setAMano(a => ({ ...a, descripcion: e.target.value }))}
                style={{ ...inputStyle, width: "100%", fontSize: 12.5, padding: "7px 10px" }} />
            </div>
            <select value={aMano.obra_rubro_id || ""} onChange={e => setAMano(a => ({ ...a, obra_rubro_id: e.target.value }))}
              style={{ ...inputStyle, fontSize: 11.5, padding: "7px 8px" }}>
              <option value="">¿contra qué rubro? (opcional)</option>
              {vivos.map(x => <option key={x.id} value={x.id}>{x.numero} · {x.descripcion.slice(0, 44)}</option>)}
            </select>
            <input type="number" step="0.01" value={aMano.presupuestado ?? ""}
              placeholder="Presupuestado" onChange={e => setAMano(a => ({ ...a, presupuestado: e.target.value }))}
              style={{ ...inputStyle, fontSize: 12, padding: "7px 10px" }} />
            <input type="number" step="0.01" value={aMano.real ?? ""}
              placeholder="Costó de verdad" onChange={e => setAMano(a => ({ ...a, real: e.target.value }))}
              style={{ ...inputStyle, fontSize: 12, padding: "7px 10px" }} />
            <input value={aMano.proveedor || ""} placeholder="Proveedor"
              onChange={e => setAMano(a => ({ ...a, proveedor: e.target.value }))}
              style={{ ...inputStyle, fontSize: 12, padding: "7px 10px" }} />
            <input type="date" value={aMano.fecha || ""} onChange={e => setAMano(a => ({ ...a, fecha: e.target.value }))}
              style={{ ...inputStyle, fontSize: 12, padding: "6px 10px" }} />
            <div style={{ gridColumn: "1 / -1", display: "flex", gap: 7, alignItems: "center" }}>
              <input value={aMano.nota || ""} placeholder="Por qué (se cambió de marca, se negoció el flete…)"
                onChange={e => setAMano(a => ({ ...a, nota: e.target.value }))}
                style={{ ...inputStyle, flex: 1, fontSize: 12, padding: "7px 10px" }} />
              <Button variant="primary" size="sm" disabled={ocupado} onClick={guardarAMano}>
                {ocupado ? "Guardando…" : "Guardar"}
              </Button>
              <button onClick={() => setAMano(null)}
                style={{ background: "none", border: "none", color: colors.muted, fontSize: 11.5,
                  cursor: "pointer", fontFamily: colors.font }}>cancelar</button>
            </div>
            {aMano.obra_rubro_id && !aMano.presupuestado && (
              <div style={{ gridColumn: "1 / -1", fontSize: 11, color: colors.muted }}>
                Si dejás vacío lo presupuestado se usa el del rubro elegido, que es contra el que hay que comparar.
              </div>
            )}
          </div>
        )}

        {guardados.length > 0 && (
          <div style={{ background: colors.surface, border: `1px solid ${colors.border}`,
            borderRadius: colors.radiusMd, overflow: "hidden" }}>
            {guardados.map(b => {
              const dif = Math.round((n(b.presupuestado) - n(b.real)) * 100) / 100;
              const rub = vivos.find(x => String(x.id) === String(b.obra_rubro_id));
              return (
                <div key={b.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 12px",
                  borderTop: `1px solid ${colors.neutralSoft}` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, color: colors.ink }}>{b.descripcion}</div>
                    <div style={{ fontSize: 10.5, color: colors.muted }}>
                      {b.fecha}{rub ? ` · ${rub.numero} ${rub.descripcion.slice(0, 40)}` : " · sin rubro"}
                      {b.proveedor ? ` · ${b.proveedor}` : ""}
                      {b.origen === "manual" ? " · a mano" : ""}
                      {b.nota ? ` · ${b.nota}` : ""}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0, fontSize: 11, color: colors.muted }}>
                    ${fmt(b.presupuestado)} → ${fmt(b.real)}
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0, minWidth: 86, fontSize: 12.5, fontWeight: 700,
                    color: dif >= 0 ? colors.success : colors.danger }}>
                    {dif >= 0 ? "+" : "−"}${fmt(Math.abs(dif))}
                  </div>
                  <button onClick={async () => {
                    if (!window.confirm(`¿Borrar "${b.descripcion}" de los beneficios?`)) return;
                    const err = await borrarBeneficio(b.id);
                    if (err) { setError(err); return; }
                    await cargar();
                  }} title="Borrarlo"
                    style={{ background: "none", border: "none", cursor: "pointer", color: colors.muted, display: "flex", flexShrink: 0 }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
