// ¿DE QUÉ PEDIDO DE COMPRA ES ESTE DOCUMENTO?
//
// Hernán, 24/11/2026, con seis pedidos del Aeropuerto en Alertas: «no se deben
// duplicar. ¿Cómo evitamos la duplicación y la alerta?». Eligió que se
// enganche solo.
//
// Es el mismo recuadro en las dos puertas por donde un documento entra a una
// obra —la factura del control y el gasto de caja chica—, con la misma regla
// de la alerta (`pedidoDelDocumento`, en contadoDosVeces.js):
//
//   · un solo pedido con el mismo proveedor y el mismo monto: queda elegido y
//     se dice. Quien carga puede contestar que no;
//   · con qué dudar —varios, o solo el monto, o un anticipo—: se pregunta, y
//     no se guarda hasta que conteste;
//   · nada: en el control queda la lista de siempre para elegirlo a mano; en
//     caja chica no aparece.
//
// Acá no se guarda nada: se dibuja y se avisa qué se eligió.
import { colors } from "../../theme/colors";
import { inputStyle } from "../../components/ui/Input";
import { pedidoDelDocumento, queHacerConElPedido } from "./contadoDosVeces.js";
import { montoDeSolicitud } from "./calculos.js";

const plata = v => (Number(v) || 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Por qué se parece: lo que se le dice al lado de cada pedido de la lista. */
const porQue = x => (x.seguro ? "mismo proveedor y mismo monto"
  : x.mismoMonto ? "mismo monto"
    : "mismo proveedor, y ya figura pagado");

/**
 * @param pedidos   los pedidos de la obra sin documento
 * @param adjuntos  sus cotizaciones
 * @param doc       lo que se está cargando: { total, razon_social, clase }
 * @param elegido   undefined si nadie tocó; "" si es un documento suelto; o el id del pedido
 * @param onElegir  (valor, pedido) => void
 * @param siempre   mostrar la lista aunque ningún pedido se parezca (el control)
 * @param que       cómo se llama lo que se carga: «esta factura», «este gasto»
 */
export default function PedidoDelDocumento({ pedidos = [], adjuntos = [], doc = {}, elegido, onElegir, siempre = false, que = "esta factura" }) {
  if (!pedidos.length) return null;
  const sugerencia = pedidoDelDocumento(doc, { solicitudes: pedidos, adjuntos });
  const hacer = queHacerConElPedido(sugerencia, elegido);
  if (!siempre && !sugerencia.posibles.length && hacer.pedidoId == null) return null;

  const parecido = new Map(sugerencia.posibles.map(x => [String(x.pedido.id), x]));
  // Los que se parecen, primero: son los que hay que mirar.
  const lista = [...pedidos].sort((a, b) => Number(parecido.has(String(b.id))) - Number(parecido.has(String(a.id))));
  const valor = hacer.pedidoId != null ? String(hacer.pedidoId) : hacer.falta ? "falta" : "";
  const borde = hacer.falta ? colors.warning : hacer.solo ? colors.success : colors.border;

  return (
    <div className="pedido-del-documento" style={{ background: colors.surface, border: `1px solid ${borde}`,
      borderRadius: colors.radiusMd, padding: 12, marginBottom: 14 }}>
      <label style={{ fontSize: 10, color: colors.muted, fontWeight: 600, display: "block", marginBottom: 4 }}>
        ¿ES DE UN PEDIDO DE COMPRA?
      </label>
      <select value={valor} onChange={e => onElegir?.(e.target.value, pedidos.find(p => String(p.id) === String(e.target.value)) || null)}
        style={{ ...inputStyle, padding: "7px 9px", fontSize: 12 }}>
        {hacer.falta && <option value="falta" disabled>Elegí de cuál es, o que no es de ninguno…</option>}
        <option value="">No — es un documento suelto</option>
        {lista.map(p => {
          const x = parecido.get(String(p.id));
          return (
            <option key={p.id} value={p.id}>
              {x ? "★ " : ""}{p.descripcion}{p.proveedor ? ` · ${p.proveedor}` : ""}
              {` · $${plata(x ? x.monto : montoDeSolicitud(p, adjuntos).monto)}`}
              {x ? ` · ${porQue(x)}` : ""}
              {p.obra_rubro_id || p.obra_actividad_id ? "" : " · SIN ASIGNAR"}
            </option>
          );
        })}
      </select>
      {hacer.solo ? (
        <div className="pedido-encontrado" style={{ fontSize: 10.5, color: colors.success, marginTop: 5, lineHeight: 1.5 }}>
          <strong>FOREMAN encontró el pedido de {que}:</strong> mismo proveedor y mismo monto. Se engancha al
          guardar: el pedido deja de contar como comprometido, pasa a «comprada» y se le avisa a quien lo pidió.
          Si no es de ese pedido, elegí «No — es un documento suelto».
        </div>
      ) : hacer.falta ? (
        <div className="pedido-por-contestar" role="alert" style={{ fontSize: 10.5, color: colors.warning, marginTop: 5, lineHeight: 1.5 }}>
          <strong>{sugerencia.posibles.length === 1
            ? `Hay un pedido de Compras que puede ser el de ${que}`
            : `Hay ${sugerencia.posibles.length} pedidos de Compras que pueden ser el de ${que}`}</strong>
          {" "}({[...new Set(sugerencia.posibles.map(porQue))].join("; ")}). Elegí cuál, o que es un documento
          suelto, para poder guardar: sin eso la misma compra queda contada dos veces, como comprometida y como gastada.
        </div>
      ) : hacer.pedidoId != null ? (
        <div style={{ fontSize: 10.5, color: colors.muted, marginTop: 4, lineHeight: 1.45 }}>
          Se engancha al guardar: el pedido deja de contar como comprometido, pasa a «comprada» y se le avisa a quien lo pidió.
        </div>
      ) : (
        <div style={{ fontSize: 10.5, color: colors.muted, marginTop: 4, lineHeight: 1.45 }}>
          Hay {pedidos.length} {pedidos.length === 1 ? "pedido" : "pedidos"} sin factura pesando como
          comprometido. Engancharlo acá es lo que hace que ese número baje.
        </div>
      )}
    </div>
  );
}
