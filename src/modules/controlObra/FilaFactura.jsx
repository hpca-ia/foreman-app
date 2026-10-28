import { Paperclip, Pencil, Trash2 } from "lucide-react";
import { abrirArchivo } from "../../lib/archivos";
import { colors } from "../../theme/colors";
import { fmt, TIPOS_GASTO } from "./calculos";
import { esDeCajaChica } from "./origenGasto";
import { esNotaDeCredito } from "./pagos";
import MarcaCaja from "./MarcaCaja";
import { estadoBodega, PROBLEMAS_BODEGA } from "./itemsComprados";

// QUÉ ES ESTE PAPEL, DICHO EN LA FILA.
//
// Una nota de crédito y un anticipo se leían igual que una compra: la única
// pista era el signo del monto, y un anticipo ni eso. Son las dos cosas que
// hacen que un total no cuadre con lo invertido, así que son justo las dos que
// tienen que decir qué son donde se las mira.
const chip = (texto, color, fondo, titulo) => (
  <span title={titulo}
    style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 700, color, background: fondo,
      borderRadius: 9, padding: "1px 6px", whiteSpace: "nowrap" }}>{texto}</span>
);

// Una factura como se lee en la lista: proveedor y número arriba, fecha, tipo
// y detalle abajo, y lo que falta asignar en ámbar. La usan la planilla, el
// control y el libro de facturas del proyecto, para que la misma factura se
// vea igual en los tres lados.

const tipoLabel = id => TIPOS_GASTO.find(t => t.id === id)?.label || id;

export default function FilaFactura({ f, asignado = 0, extra, onEditar, onEliminar }) {
  const pendiente = Math.round(((Number(f.total) || 0) - asignado) * 100) / 100;
  const vale = esNotaDeCredito(f.clase) || (Number(f.total) || 0) < 0;
  const anticipo = f.clase === "anticipo" && !f.facturada_con_id;
  // POR QUÉ ALGUNAS DICEN SRI Y OTRAS NO.
  //
  // Preguntarle al SRI por un comprobante necesita su clave de acceso de 49
  // dígitos: la lee NOVA del papel, y una foto de celular de un recibo de
  // caja chica no la trae. Sin clave, nunca se consultó — y hasta ahora eso se
  // veía exactamente igual que "revisada y todo en orden": sin ninguna marca.
  // Dos cosas muy distintas con el mismo aspecto.
  const revisable = ["factura", "nota_venta", "nota_credito"].includes(f.clase || "factura");
  const sinRevisar = revisable && !f.sri_estado;
  // Y SI LA BODEGA PUDO CONTAR LO QUE TRAE. Una factura sin papel, ilegible o
  // que no cuadra no suma a "Qué se compró": tiene que decirlo donde se la
  // abre para arreglarla.
  const bodega = PROBLEMAS_BODEGA[estadoBodega(f)];
  return (
    <div style={{ padding: "10px 14px", borderBottom: `1px solid ${colors.neutralSoft}`, display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {f.razon_social || "Sin proveedor"}
          {f.numero_factura && <span style={{ color: colors.muted, fontWeight: 400, marginLeft: 6 }}>#{f.numero_factura}</span>}
          {/* Por qué puerta entró: una factura de compra pasó por un pedido y
              una aprobación; un gasto de caja chica lo compró alguien en obra
              y el rubro se lo pusieron después. */}
          {esDeCajaChica(f) && <MarcaCaja />}
          {vale && chip("NOTA DE CRÉDITO · a favor", colors.success, colors.successSoft,
            "Plata a favor de la obra: material devuelto o cobrado de más. Baja el gasto y se usa en una compra posterior.")}
          {anticipo && chip("ANTICIPO · sin factura", colors.warning, colors.warningSoft,
            "La plata salió y el comprobante todavía no se emite. No cuenta como obra ejecutada hasta que llegue su factura.")}
          {bodega && chip(bodega.corto, colors.inkSoft, colors.neutralSoft, bodega.hacer)}
          {f.clase === "proforma" && chip("PROFORMA", colors.warning, colors.warningSoft,
            "Todavía hay que pedir el documento definitivo.")}
          {/* LO QUE DIJO EL SRI, DONDE SE PAGA.
              La revisión se hace al cargar la factura, pero la pregunta "¿esta
              se puede pagar?" aparece después, en esta lista, y para entonces
              nadie se acuerda de lo que dijo la pantalla aquel día. Una marca
              roja acá es "no la pagues todavía". */}
          {f.sri_estado === "grave" && (
            <span title={(f.sri_hallazgos || []).map(h => h.dice).join("\n")}
              style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 700, color: "#fff", background: colors.danger,
                borderRadius: 9, padding: "1px 6px", whiteSpace: "nowrap" }}>SRI</span>
          )}
          {f.sri_estado === "aviso" && (
            <span title={(f.sri_hallazgos || []).map(h => h.dice).join("\n")}
              style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 700, color: colors.warning,
                background: colors.warningSoft, borderRadius: 9, padding: "1px 6px", whiteSpace: "nowrap" }}>SRI</span>
          )}
        </div>
        <div style={{ fontSize: 11, color: colors.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {f.fecha} · {tipoLabel(f.tipo)}{f.detalle ? ` · ${f.detalle}` : ""}
          {sinRevisar && (
            <span title={f.clave_acceso
              ? "Tiene clave de acceso pero todavía no se consultó al SRI. Se hace desde la factura, con «Revisar en el SRI»."
              : "No se consultó al SRI: hace falta la clave de acceso de 49 dígitos, y este documento no la tiene cargada. Está impresa debajo del código de barras."}
              style={{ color: colors.muted }}> · sin revisar en el SRI</span>
          )}
          {f.sri_estado === "ok" && <span title="Consultada al SRI: autorizada y sin observaciones" style={{ color: colors.success }}> · SRI ✓</span>}
        </div>
        {extra && (
          <div style={{ fontSize: 11, color: colors.inkSoft, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{extra}</div>
        )}
        {pendiente > 0.009 && (
          <div style={{ fontSize: 10, color: colors.warning, marginTop: 3, fontWeight: 600 }}>
            ${fmt(pendiente)} sin asignar a rubro
          </div>
        )}
      </div>
      {f.archivo_url && (
        <button onClick={() => abrirArchivo(f.archivo_url)} title={f.archivo_nombre || "Ver la factura escaneada"}
          style={{ color: colors.muted, display: "flex", background: "none", border: "none", padding: 0, cursor: "pointer" }}>
          <Paperclip size={14} />
        </button>
      )}
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        {/* Una nota de crédito se escribe en positivo y en verde: es plata a
            favor, no un gasto con el signo cambiado. */}
        <div style={{ fontSize: 13, fontWeight: 600, color: vale ? colors.success : colors.ink }}>
          ${fmt(Math.abs(Number(f.total) || 0))}
        </div>
      </div>
      {onEditar && (
        <button onClick={onEditar} title="Editar"
          style={{ background: colors.neutralSoft, border: "none", borderRadius: colors.radiusSm, padding: "5px 7px", color: colors.inkSoft, cursor: "pointer", display: "flex" }}>
          <Pencil size={12} />
        </button>
      )}
      {onEliminar && (
        <button onClick={onEliminar} title="Eliminar"
          style={{ background: colors.dangerSoft, border: "none", borderRadius: colors.radiusSm, padding: "5px 7px", color: colors.danger, cursor: "pointer", display: "flex" }}>
          <Trash2 size={12} />
        </button>
      )}
    </div>
  );
}
