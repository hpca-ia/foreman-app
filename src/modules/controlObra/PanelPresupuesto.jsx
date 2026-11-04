import { colors } from "../../theme/colors";
import { fmt } from "./calculos";
import { baseSinIva } from "./contratoDeLaObra";

/**
 * EL PRESUPUESTO COMPLETO, AL COSTADO DE LO QUE SE ESTÁ DECIDIENDO.
 *
 * Nació en Diferencias: ahí se compara una proforma renglón por renglón y hay
 * que tener el contrato a la vista —número, descripción, cantidad × unitario
 * = total, y el costo cargado si lo hay— mientras se elige contra qué rubro
 * va cada cosa. Un desplegable de doscientos rubros no sirve para eso: no se
 * ve la cantidad, no se ve el precio, y hay que saber el nombre exacto.
 *
 * Beneficios pedía lo mismo para cargar uno a mano, y la respuesta es el
 * mismo panel, no otro parecido: lo que se arregle acá se arregla en los dos.
 *
 * @param rubros     los del contrato vigente, sin ocultos ni anulados.
 * @param eligiendo  si hay algo que elegir, el objeto que lo describe (con
 *                   `descripcion` y, opcional, `paraPrecio`); con eso cada
 *                   rubro se vuelve clicable y onElegir recibe el rubro.
 */
const unitario = r => (Number(r.cantidad) ? baseSinIva(r) / Number(r.cantidad) : 0);

export default function Presupuesto({ rubros, busca, onBusca, eligiendo, onElegir, onCerrar }) {
  const texto = busca.trim().toLowerCase();
  const filtrados = texto
    ? rubros.filter(r => `${r.numero ?? ""} ${r.descripcion || ""} ${r.capitulo || ""}`.toLowerCase().includes(texto))
    : rubros;
  const porCapitulo = [];
  for (const r of filtrados) {
    const cap = r.capitulo || "SIN CAPÍTULO";
    const ya = porCapitulo.find(x => x.capitulo === cap);
    if (ya) ya.rubros.push(r); else porCapitulo.push({ capitulo: cap, rubros: [r] });
  }
  return (
    // VIAJA CON EL QUE LEE, Y NO CON `sticky`.
    //
    // El presupuesto se abre para mirarlo MIENTRAS se decide cada diferencia, y
    // una lista de cincuenta renglones se scrollea entera: un panel que se
    // queda arriba sirve para los tres primeros y después es una columna vacía
    // al costado.
    //
    // Con `position: sticky` no alcanzaba. El contenedor de la aplicación tiene
    // `overflow-y: auto` pero crece con su contenido, así que nunca scrollea él
    // —scrollea la ventana—: para el navegador ese es igual el contenedor de
    // referencia del sticky, y un sticky anclado a algo que no se mueve no se
    // mueve nunca. Dos horas de CSS para descubrir que el culpable estaba tres
    // archivos más arriba.
    //
    // Entonces no se pega a nada: la que scrollea es la columna de las
    // diferencias, acá adentro, y esta se queda quieta al lado porque nunca se
    // fue a ningún lado.
    <div style={{ width: 320, flexShrink: 0, border: `1px solid ${colors.border}`,
      borderRadius: colors.radiusMd, background: colors.surface, alignSelf: "stretch",
      display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
      <div style={{ padding: "9px 11px", borderBottom: `1px solid ${colors.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: colors.muted, letterSpacing: 0.3, flex: 1 }}>
            EL PRESUPUESTO · {rubros.length} RUBROS · SIN IVA
          </span>
          <button onClick={onCerrar}
            style={{ background: "none", border: "none", cursor: "pointer", fontFamily: colors.font,
              fontSize: 11, color: colors.brand }}>ocultar</button>
        </div>
        {/* ELEGIR EL RUBRO CORRECTO, que es la mitad del trabajo: NOVA empareja
            por descripción y "pintura de fibrocemento" calza con tres. */}
        {eligiendo && (
          <div style={{ fontSize: 11, color: colors.brand, fontWeight: 600, marginTop: 4, lineHeight: 1.4 }}>
            {eligiendo.paraPrecio
              ? `Elegí el rubro cuyo precio querés cobrar por «${String(eligiendo.descripcion || "").slice(0, 40)}»`
              : `Elegí contra qué rubro se compara «${String(eligiendo.descripcion || "").slice(0, 44)}»`}
          </div>
        )}
        <input value={busca} onChange={e => onBusca(e.target.value)} placeholder="Buscar por número o descripción…"
          style={{ width: "100%", marginTop: 5, padding: "5px 8px", fontSize: 11.5, fontFamily: colors.font,
            border: `1px solid ${colors.border}`, borderRadius: colors.radiusSm, outline: "none" }} />
      </div>
      <div style={{ overflowY: "auto", padding: "4px 0" }}>
        {!filtrados.length && (
          <div style={{ padding: "10px 11px", fontSize: 11, color: colors.muted }}>
            Ningún rubro del contrato dice eso.
          </div>
        )}
        {porCapitulo.map(c => (
          <div key={c.capitulo}>
            <div style={{ padding: "5px 11px 2px", fontSize: 9.5, fontWeight: 700, color: colors.muted,
              letterSpacing: 0.3, background: colors.bg }}>
              {c.capitulo}
            </div>
            {c.rubros.map(r => (
              <div key={r.id}
                onClick={eligiendo ? () => onElegir(r) : undefined}
                style={{ padding: "4px 11px", fontSize: 11, lineHeight: 1.45, color: colors.inkSoft,
                  cursor: eligiendo ? "pointer" : "default",
                  borderBottom: `1px solid ${colors.neutralSoft}` }}>
                <div style={{ display: "flex", gap: 6 }}>
                  <span style={{ color: colors.muted, minWidth: 30 }}>{r.numero ?? ""}</span>
                  <span style={{ flex: 1 }}>{r.descripcion}</span>
                </div>
              {/* CANTIDAD × UNITARIO = TOTAL, que es contra lo que se compara.
                  Con el total solo no se puede decidir nada: la proforma trae
                  un unitario y una cantidad, y la pregunta es si ese unitario
                  es mejor o peor que el del contrato. El total de un rubro de
                  cien metros no se parece a nada de lo que dice el papel. */}
                <div style={{ display: "flex", gap: 6, color: colors.muted, fontSize: 10,
                  fontVariantNumeric: "tabular-nums" }}>
                  <span style={{ minWidth: 30 }} />
                  <span>{fmt(r.cantidad)} {r.unidad || ""}</span>
                  <span>× ${fmt(unitario(r))}</span>
                  <span style={{ flex: 1, textAlign: "right", color: colors.inkSoft }}>
                    ${fmt(baseSinIva(r))}
                  </span>
                </div>
                {Number(r.costo_unitario) > 0 && (
                  <div style={{ display: "flex", gap: 6, color: colors.muted, fontSize: 10,
                    fontVariantNumeric: "tabular-nums" }}>
                    <span style={{ minWidth: 30 }} />
                    <span style={{ flex: 1 }}>costo cargado</span>
                    <span>× ${fmt(r.costo_unitario)}</span>
                    <span style={{ minWidth: 60, textAlign: "right" }}>
                      ${fmt(Number(r.costo_unitario) * Number(r.cantidad))}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
