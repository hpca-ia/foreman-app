import { useState } from "react";
import { Layers } from "lucide-react";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { inputStyle } from "../../components/ui/Input";
import { subtotalesPorEtapa, etapasUsadas, SIN_ETAPA } from "./etapas";

// El presupuesto por etapas.
//
// Una obra grande casi nunca se contrata entera: se cierra la etapa uno —obra
// gris— y la dos queda para cuando el cliente consiga la plata o decida
// seguir. Eso se venía resolviendo con DOS presupuestos, y ahí empiezan los
// problemas: los rubros se duplican, los precios se desfasan entre los dos
// archivos, y nadie puede ver el total de la obra completa sin sumar a mano.
//
// Con una etiqueta por rubro el presupuesto es UNO y se lee de las dos
// maneras: el total de la obra, y cuánto cuesta cada etapa.
//
// SE ASIGNA POR CAPÍTULO Y POR RUBRO, y las dos cosas hacen falta. Casi
// siempre un capítulo entero va a una etapa —toda la obra gris es la uno— y
// pedir que se marque rubro por rubro sería hacer cien clicks para decir algo
// que se dice en uno. Pero la excepción existe y es cara: dentro de
// "Instalaciones" hay puntos que van en la uno y aparatos que van en la dos.

const fmt = v => (Number(v) || 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PanelEtapas({ items = [], capitulos = [], soloLectura = false, onEtapaEnLote }) {
  const [abierto, setAbierto] = useState(null);
  const [modo, setModo] = useState("capitulo");
  const [nueva, setNueva] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const etapas = etapasUsadas(items);
  const subtotales = subtotalesPorEtapa(items);
  const total = items.reduce((s, i) => s + (Number(i.total) || 0), 0);
  const sinEtapa = items.filter(i => !String(i.etapa || "").trim()).length;

  const caps = [...capitulos].sort((a, b) => a.orden - b.orden).map(c => {
    const suyos = items.filter(i => i.capitulo === c.nombre);
    const susEtapas = [...new Set(suyos.map(i => String(i.etapa || "").trim() || SIN_ETAPA))];
    return {
      ...c, rubros: suyos.length,
      monto: suyos.reduce((s, i) => s + (Number(i.total) || 0), 0),
      // Un capítulo repartido entre etapas se dice así y no se elige una: el
      // desplegable mostraría una etapa que no es la de todos sus rubros.
      etapa: susEtapas.length === 1 ? susEtapas[0] : null,
      repartido: susEtapas.length > 1,
      items: suyos,
    };
  }).filter(c => c.rubros > 0);

  async function ponerEtapa(lista, etapa) {
    if (soloLectura || !lista.length) return;
    setOcupado(true);
    // En UNA escritura: de a uno, un presupuesto de ciento sesenta renglones
    // son ciento sesenta viajes a la base.
    await onEtapaEnLote(lista.map(i => i.id), etapa);
    setOcupado(false);
  }

  const Selector = ({ valor, onElegir, ancho = 150, titulo }) => (
    <select value={valor || ""} disabled={soloLectura || ocupado} title={titulo}
      onChange={e => onElegir(e.target.value)}
      style={{ ...inputStyle, width: ancho, flexShrink: 0, fontSize: 11.5, padding: "4px 7px", height: 28,
        color: valor ? colors.brand : colors.muted, fontWeight: valor ? 600 : 400 }}>
      <option value="">Sin etapa</option>
      {etapas.map(e => <option key={e} value={e}>{e}</option>)}
      {nueva.trim() && !etapas.includes(nueva.trim()) && <option value={nueva.trim()}>{nueva.trim()}</option>}
    </select>
  );

  return (
    <div style={{ marginBottom: 14 }}>
      {/* LO QUE VALE CADA ETAPA, ARRIBA. Es la pregunta que se viene a hacer:
          "¿cuánto es la etapa uno?" — y es lo que se cotiza. */}
      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`,
        borderRadius: colors.radiusMd, padding: 13, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9, flexWrap: "wrap" }}>
          <Layers size={15} color={colors.brand} />
          <div style={{ fontSize: 13, fontWeight: 700, color: colors.ink, flex: 1 }}>
            El presupuesto por etapas
          </div>
          {!soloLectura && (
            <>
              <input value={nueva} onChange={e => setNueva(e.target.value)}
                placeholder={etapas.length ? "Otra etapa. Ej: Etapa 2" : "Nombre de la primera. Ej: Etapa 1"}
                style={{ ...inputStyle, width: 170, fontSize: 12, padding: "5px 8px", height: 30 }} />
              <span style={{ fontSize: 10.5, color: colors.muted }}>
                escribila y después elegila en el capítulo
              </span>
            </>
          )}
        </div>

        {/* TODO A UNA, Y DESPUÉS LAS EXCEPCIONES.
            Es como se arma de verdad: casi toda la obra es la etapa uno y lo
            que se posterga son unos pocos capítulos. Empezar con todo vacío y
            marcar ciento sesenta renglones para decir "casi todo es la uno" es
            al revés del trabajo. */}
        {!soloLectura && (
          <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
            <Button variant="primary" size="sm" disabled={ocupado || !(nueva.trim() || etapas[0])}
              onClick={async () => {
                const e = nueva.trim() || etapas[0];
                if (!window.confirm(
                  `¿Poner los ${items.length} rubros del presupuesto en "${e}"?\n\n`
                  + "Es la forma normal de arrancar: casi toda la obra es la primera etapa, y después se "
                  + "cambian las excepciones una por una.\n\n"
                  + (etapas.length ? "Pisa las etapas que ya estén puestas." : "Nada queda sin etapa."))) return;
                await ponerEtapa(items, e);
                setNueva("");
              }}>
              {ocupado ? "Poniendo…" : `Poner los ${items.length} rubros en "${nueva.trim() || etapas[0] || "Etapa 1"}"`}
            </Button>
            <span style={{ fontSize: 10.5, color: colors.muted, flex: 1, minWidth: 180, lineHeight: 1.4 }}>
              Y después cambiás las excepciones: el capítulo o el rubro que va en otra.
            </span>
          </div>
        )}

        {!etapas.length ? (
          <div style={{ fontSize: 12.5, color: colors.muted, lineHeight: 1.55 }}>
            Todavía no hay etapas. Escribí una arriba —"Etapa 1"— y después asignala a los capítulos de
            abajo. El presupuesto sigue siendo uno solo: lo que cambia es que además del total de la obra
            vas a ver cuánto cuesta cada etapa, que es lo que se cotiza cuando el cliente contrata por
            partes.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 4 }}>
            {subtotales.map(s => (
              <div key={s.etapa} style={{ display: "flex", alignItems: "center", gap: 9,
                padding: "7px 9px", borderRadius: 7,
                background: s.sinEtapa ? colors.warningSoft : colors.bg }}>
                <span style={{ flex: 1, fontSize: 13, fontWeight: s.sinEtapa ? 400 : 700,
                  color: s.sinEtapa ? colors.warning : colors.ink }}>{s.etapa}</span>
                <span style={{ fontSize: 11, color: colors.muted }}>{s.rubros} {s.rubros === 1 ? "rubro" : "rubros"}</span>
                <span style={{ fontSize: 11, color: colors.muted, width: 48, textAlign: "right" }}>
                  {total > 0 ? `${Math.round((s.total / total) * 100)}%` : ""}
                </span>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: s.sinEtapa ? colors.warning : colors.ink,
                  width: 120, textAlign: "right" }}>${fmt(s.total)}</span>
              </div>
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 9px",
              borderTop: `2px solid ${colors.ink}`, marginTop: 3 }}>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: colors.ink }}>Toda la obra</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: colors.ink, width: 120, textAlign: "right" }}>
                ${fmt(total)}
              </span>
            </div>
            {sinEtapa > 0 && (
              <div style={{ fontSize: 11, color: colors.warning, marginTop: 4, lineHeight: 1.45 }}>
                {sinEtapa} {sinEtapa === 1 ? "rubro todavía no tiene etapa" : "rubros todavía no tienen etapa"}: su
                plata no está en ninguna, pero sí en el total de la obra. Mientras queden, los subtotales de
                las etapas no suman el total.
              </div>
            )}
          </div>
        )}
      </div>

      {/* CÓMO SE ASIGNA, A LA VISTA Y NO DETRÁS DE UN TRIANGULITO.
          Marcar rubro por rubro estaba, pero había que descubrir que tocando
          el nombre del capítulo se abría. Un modo que hay que descubrir es un
          modo que no existe: lo que se vio fue "me muestra los capítulos" y
          punto. Las dos maneras hacen falta y las dos tienen que verse. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9, flexWrap: "wrap" }}>
        <div style={{ display: "inline-flex", gap: 3, background: colors.neutralSoft, borderRadius: 8, padding: 3 }}>
          {[["capitulo", "Por capítulo"], ["rubro", "Rubro por rubro"]].map(([id, label]) => (
            <button key={id} onClick={() => setModo(id)}
              style={{ padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer",
                fontFamily: colors.font, fontSize: 12, fontWeight: 600,
                background: modo === id ? "#fff" : "transparent",
                color: modo === id ? colors.ink : colors.inkSoft }}>{label}</button>
          ))}
        </div>
        <span style={{ fontSize: 11, color: colors.muted, flex: 1, minWidth: 200, lineHeight: 1.45 }}>
          {modo === "capitulo"
            ? "Todo el capítulo a una etapa, de un saque. Es el caso normal."
            : "Cada rubro a la suya. Para cuando un capítulo se reparte: puntos en la uno, aparatos en la dos."}
        </span>
      </div>

      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`,
        borderRadius: colors.radiusMd, overflow: "hidden" }}>
        {caps.map(c => (
          <div key={c.nombre} style={{ borderTop: `1px solid ${colors.neutralSoft}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 12px", flexWrap: "wrap", minWidth: 0 }}>
              <button onClick={() => modo === "capitulo" && setAbierto(abierto === c.nombre ? null : c.nombre)}
                title={modo === "capitulo" ? "Abrirlo para marcar sus rubros uno por uno" : undefined}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0,
                  fontFamily: colors.font, fontSize: 12.5, fontWeight: 600, color: colors.ink,
                  flex: "1 1 180px", minWidth: 120, textAlign: "left" }}>
                {modo === "capitulo" ? (abierto === c.nombre ? "▾ " : "▸ ") : ""}{c.nombre}
              </button>
              <span style={{ fontSize: 11, color: colors.muted }}>{c.rubros} rubros</span>
              <span style={{ fontSize: 12.5, color: colors.inkSoft, width: 110, textAlign: "right" }}>${fmt(c.monto)}</span>
              {modo === "rubro" ? (
                <span style={{ fontSize: 10.5, color: colors.muted, width: 150, textAlign: "right" }}>
                  {c.repartido ? "repartido entre etapas" : c.etapa === SIN_ETAPA ? "sin etapa" : c.etapa}
                </span>
              ) : c.repartido ? (
                <span title="Sus rubros están en etapas distintas. Abrilo para verlos."
                  style={{ fontSize: 10.5, color: colors.warning, fontWeight: 600, width: 150, textAlign: "right" }}>
                  repartido entre etapas
                </span>
              ) : (
                <Selector valor={c.etapa === SIN_ETAPA ? "" : c.etapa}
                  titulo="Todo el capítulo a esta etapa"
                  onElegir={v => ponerEtapa(c.items, v)} />
              )}
            </div>

            {(modo === "rubro" || abierto === c.nombre) && (
              {/* `minmax(0,1fr)` y no el ancho automático.
                  Una columna de grilla crece con su contenido salvo que se le
                  diga que no, así que una descripción como "CERRAMIENTO
                  DEFINITIVO FRONTAL CON GARITA DE SEGURIDAD (L=14.16 ml...)"
                  estiraba la fila más allá de la pantalla y empujaba el precio
                  y el selector fuera de la vista. Se veían los capítulos con
                  sus rubros y sin con qué marcarlos — y el que mira concluye,
                  con razón, que a esos rubros les falta el selector. */}
              <div style={{ padding: "0 12px 10px 26px", display: "grid",
                gridTemplateColumns: "minmax(0,1fr)", gap: 3 }}>
                {c.items.map(i => (
                  <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: colors.inkSoft,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {i.numero ? `${i.numero} ` : ""}{i.descripcion}
                    </span>
                    <span style={{ fontSize: 11.5, color: colors.muted, width: 100, textAlign: "right", flexShrink: 0 }}>${fmt(i.total)}</span>
                    <Selector valor={i.etapa || ""} ancho={140}
                      titulo="La etapa de este rubro"
                      onElegir={v => ponerEtapa([i], v)} />
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
