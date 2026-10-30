import { useState } from "react";
import { FileText, Check } from "lucide-react";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import { fmt } from "./calculos";
import { leerConNova } from "./cotizacionesOrden";
import { compararContraPresupuesto } from "./compararProforma";
import { loQueNoEstaPresupuestado, partidasParaOrden, comoSeDice } from "./extraParaCobrar";
import { crearOrden, agregarLinea } from "./ordenesDeCambio";

// DIFERENCIAS CON EL CLIENTE: el presupuesto contra lo que de verdad hace falta.
//
// No es lo mismo que Beneficios y mezclarlas pierde las dos.
//
//   · BENEFICIOS son utilidades nuestras sobre lo que YA ESTÁ CONTRATADO: el
//     rubro se presupuestó en $1.000 y se compró en $800. Eficiencias que
//     aparecen durante el proyecto, comparando presupuesto contra cotizaciones.
//     No se le cobran a nadie: suben la utilidad de la obra.
//
//   · ACÁ se compara el presupuesto contra UNA PROPUESTA NUEVA O UNA
//     LIQUIDACIÓN, y lo que sale son diferencias DEL CLIENTE: trabajo que el
//     contrato no cubre y hay que cobrarle, o trabajo contratado que no se hizo
//     y hay que devolverle.
//
// Un adicional contado como beneficio infla la utilidad y después nadie lo
// cobra. Una reducción callada es lo que hace que el cliente deje de creerle a
// los adicionales.
//
// El caso que le da sentido: se cotizó X. Se va a la obra, se mide, y hace
// falta X, Y y T. Encontrar esas tres no es difícil de decidir, es difícil de
// VER: la propuesta trae cuarenta renglones y el presupuesto ciento sesenta.

export default function PanelDiferencias({ obra, rubros = [], currentUser, onCambio }) {
  const [items, setItems] = useState([]);
  const [proveedor, setProveedor] = useState("");
  const [archivo, setArchivo] = useState("");
  const [leyendo, setLeyendo] = useState("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [pct, setPct] = useState("20");
  const [orden, setOrden] = useState(null);

  // Los rubros vivos del contrato: contra eso se compara. Lo que entró por una
  // orden de cambio no es contrato original y no se vuelve a comparar.
  const vivos = rubros.filter(r => !r.oculto && !r.anulado_por_oc && r.origen !== "orden_cambio");

  async function leer(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setLeyendo("leyendo"); setError(""); setOrden(null);
    try {
      const r = await leerConNova(file, vivos, p => setLeyendo(p || "leyendo"));
      if (!r.items?.length) throw new Error("NOVA no encontró renglones con precios en el archivo.");
      setItems(r.items);
      setProveedor(r.proveedor || "");
      setArchivo(file.name);
    } catch (err) { setError(err.message); }
    setLeyendo("");
  }

  const comparacion = items.length ? compararContraPresupuesto(items, vivos) : null;
  const h = comparacion ? loQueNoEstaPresupuestado(comparacion) : null;
  const hayAlgo = !!h && (h.cuantos > 0 || h.menos.length > 0);

  async function armarLaOrden() {
    setOcupado(true); setError("");
    // LA ORDEN NACE EN BORRADOR. Un adicional se le cobra a un cliente después
    // de una conversación, no porque un archivo trajo un renglón de más: acá
    // queda armada, con el argumento escrito y las partidas puestas, y la manda
    // una persona.
    const r = await crearOrden(obra.id, {
      titulo: `Diferencias contra el presupuesto${proveedor ? ` · ${proveedor}` : ""}`,
      justificacion: `Al comparar ${archivo || "la propuesta"}${proveedor ? ` de ${proveedor}` : ""} contra el `
        + `presupuesto contratado aparecieron diferencias que el contrato no cubre:\n\n`
        + [...h.todo, ...h.menos].map(x => `· ${x.descripcion} (${x.por})`).join("\n"),
      tipo: "Requerimiento cliente",
    }, currentUser);
    if (r.error) { setOcupado(false); setError(r.error); return; }
    const puestas = [];
    for (const linea of partidasParaOrden(h, pct)) {
      const rl = await agregarLinea(r.orden.id, { ...linea, orden: puestas.length }, puestas);
      if (rl.error) { setOcupado(false); setError(rl.error); return; }
      puestas.push(rl.linea);
    }
    setOcupado(false);
    setOrden({ codigo: r.orden.codigo || `OC-${r.orden.numero}`, cuantas: puestas.length });
    onCambio?.();
  }

  const caja = { background: colors.surface, border: `1px solid ${colors.border}`,
    borderRadius: colors.radiusMd, padding: "11px 13px", marginBottom: 10 };

  return (
    <div style={{ fontFamily: colors.font }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: colors.ink }}>Diferencias con el cliente</div>
      <div style={{ fontSize: 11.5, color: colors.muted, lineHeight: 1.5, marginBottom: 10, maxWidth: 760 }}>
        El presupuesto contratado contra una <strong>propuesta nueva</strong> o una <strong>liquidación</strong>.
        Lo que aparece y el contrato no cubre se le cobra al cliente; lo contratado que no se hizo se le devuelve.
        No es lo mismo que Beneficios —esas son eficiencias nuestras sobre lo ya contratado— y por eso no se suman.
      </div>

      <label style={{ ...caja, display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
        cursor: leyendo ? "wait" : "pointer", borderStyle: "dashed", color: colors.inkSoft, fontSize: 12.5 }}>
        <input type="file" accept="image/*,.pdf,.xlsx,.xlsm,.xls,.csv" style={{ display: "none" }}
          disabled={!!leyendo} onChange={leer} />
        <FileText size={14} />
        {leyendo ? `NOVA está leyendo… ${leyendo === "leyendo" ? "" : leyendo}`
          : items.length ? "Leer otro archivo" : "Subir la propuesta nueva o la liquidación (PDF, foto o Excel)"}
      </label>

      {error && <div style={{ fontSize: 12, color: colors.danger, marginBottom: 10 }}>{error}</div>}

      {comparacion && (
        <>
          <div style={{ ...caja }}>
            <div style={{ fontSize: 11.5, color: colors.muted, marginBottom: 6 }}>
              {archivo}{proveedor ? ` · ${proveedor}` : ""} · {items.length} renglones leídos ·
              se comparan contra {vivos.length} rubros del contrato
            </div>
            {!hayAlgo ? (
              <div style={{ fontSize: 12.5, color: colors.success }}>
                Todo lo que trae está en el presupuesto y con las mismas cantidades: no hay nada que cobrar
                ni que devolver.
              </div>
            ) : (
              <div style={{ fontSize: 12.5, color: colors.ink, fontWeight: 600 }}>{comoSeDice(h)}</div>
            )}
          </div>

          {hayAlgo && (
            <div style={caja}>
              {[["SE LE COBRA AL CLIENTE", [...h.nuevos, ...h.demas], colors.brand],
                ["SE LE DEVUELVE AL CLIENTE", h.menos, colors.success]].map(([rotulo, lista, color]) => (lista.length ? (
                <div key={rotulo} style={{ marginBottom: 9 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color, letterSpacing: 0.4, marginBottom: 4 }}>{rotulo}</div>
                  {lista.map((x, k) => (
                    <div key={k} style={{ display: "flex", gap: 8, padding: "4px 0",
                      borderTop: k ? `1px solid ${colors.neutralSoft}` : "none", fontSize: 12 }}>
                      <span style={{ flex: 1, minWidth: 0, color: colors.ink }}>
                        {x.descripcion}
                        <div style={{ fontSize: 10.5, color: colors.muted }}>
                          {x.por}
                          {x.precioUnitario != null
                            ? ` · al precio del contrato, $${fmt(x.precioUnitario)}`
                            : " · hay que ponerle precio"}
                        </div>
                      </span>
                      <span style={{ whiteSpace: "nowrap", color: colors.muted }}>
                        {fmt(x.cantidad)} {x.unidad} · ${fmt(x.costo)} de costo
                      </span>
                    </div>
                  ))}
                </div>
              ) : null))}

              <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap", marginTop: 4,
                borderTop: `1px solid ${colors.border}`, paddingTop: 9 }}>
                <span style={{ fontSize: 11.5, color: colors.inkSoft }}>Precio = costo +</span>
                <input type="number" step="1" value={pct} onChange={e => setPct(e.target.value)} placeholder="20"
                  style={{ ...inputStyle, padding: "3px 6px", fontSize: 11.5, width: 60, textAlign: "right" }} />
                <span style={{ fontSize: 11.5, color: colors.inkSoft }}>
                  % para lo que no tiene precio en el contrato
                  {h.sinPrecio ? ` (${h.sinPrecio})` : ""}
                </span>
                <Button variant="primary" size="sm" disabled={ocupado} onClick={armarLaOrden}>
                  <Check size={13} /> {ocupado ? "Armando…" : "Armar la orden de cambio"}
                </Button>
              </div>

              {orden && (
                <div style={{ fontSize: 11.5, color: colors.success, marginTop: 8, lineHeight: 1.5 }}>
                  Quedó armada la <strong>{orden.codigo}</strong> con {orden.cuantas}{" "}
                  {orden.cuantas === 1 ? "partida" : "partidas"}, <strong>en borrador</strong>. Está en Órdenes de
                  cambio: revisá el argumento y los precios, pedile el visto al Director y mandala al cliente.
                </div>
              )}
            </div>
          )}

          {/* LO QUE SÍ CALZA NO ES ASUNTO DE ESTA PANTALLA, pero hay que decir
              cuánto es: si de cuarenta renglones treinta y siete calzaron, los
              tres que no se miran con otra cara. */}
          <div style={{ fontSize: 11.5, color: colors.muted, lineHeight: 1.5 }}>
            Los otros {comparacion.lineas.length - (h?.cuantos || 0) - (h?.menos.length || 0)} renglones calzan con
            su rubro y su cantidad: esos no generan diferencia con el cliente. Si alguno se cotizó por menos de lo
            presupuestado, eso es un <strong>beneficio</strong> de la obra y se registra en su pestaña.
          </div>
        </>
      )}
    </div>
  );
}
