// El rol cerrado y su pago, sin base de datos: las cuentas y las filas.
//
// Un rol se cierra para que deje de moverse. Mientras está abierto sale de la
// asistencia y cambia si alguien corrige un día; cerrado, cada línea guarda su
// cálculo, y el recibo que la persona firmó no cambia aunque en junio le suban
// el salario.
//
// Después se paga persona por persona. Cada pago entra al control de obra como
// un gasto de mano de obra POR LO QUE SE PAGÓ —el "a pagar"—, sin asignar, y
// ahí se reparte en rubros como cualquier otro gasto.

const n = v => Number(v) || 0;
const redondo = v => Math.round(v * 100) / 100;

export const ORIGEN_ROL = "rol";

export const SOPORTES = {
  rol: { label: "Rol firmado", documento: "ROL DE PAGOS", clase: "recibo" },
  factura: { label: "Factura", documento: "FACTURA", clase: "factura" },
};

const fechaCorta = f => {
  const x = new Date(`${String(f || "").slice(0, 10)}T12:00:00`);
  return isNaN(x) ? "" : `${x.getDate()}/${x.getMonth() + 1}/${x.getFullYear()}`;
};

export const periodoTexto = ({ desde, hasta } = {}) =>
  `${desde ? `del ${fechaCorta(desde)} ` : ""}al ${fechaCorta(hasta)}`;

/** ¿Se pisan dos períodos? Un mismo día no se puede pagar en dos roles. */
export function seSolapan(a = {}, b = {}) {
  if (!a.desde || !a.hasta || !b.desde || !b.hasta) return false;
  return String(a.desde) <= String(b.hasta) && String(b.desde) <= String(a.hasta);
}

/**
 * Las líneas que se guardan al cerrar, una por persona.
 *
 * El cálculo entero va congelado en `calculo`: es lo que se imprime en el
 * recibo. Las columnas sueltas (días, horas, descuentos) están para poder
 * buscar y sumar sin abrir el JSON.
 */
export function lineasParaGuardar(nomina, rolId) {
  return (nomina?.lineas || []).map(l => {
    const p = l.persona || {};
    const { persona, ...calculo } = l;
    return {
      rol_id: rolId,
      personal_id: p.id ?? null,
      nombre: p.nombre || "",
      cedula: p.cedula || null,
      cargo: p.cargo || null,
      salario_mensual: n(p.salario_mensual),
      dias: n(l.asistencia?.dias),
      he25: n(l.asistencia?.he25), he50: n(l.asistencia?.he50),
      he75: n(l.asistencia?.he75), he100: n(l.asistencia?.he100),
      anticipos: n(l.anticipos), prestamos: n(l.prestamos),
      quirografarios: n(l.quirografarios), multas: n(l.multas),
      calculo: { ...calculo, persona: { salario_mensual: n(p.salario_mensual), acumula_fondos: !!p.acumula_fondos } },
      total: n(l.total),
      a_pagar: n(l.aPagar),
    };
  });
}

/**
 * El recibo en el orden del MODELO ROL.
 *
 * El modelo separa el anticipo de la primera quincena del resto de los
 * descuentos: primero se llega al TOTAL MENSUAL y recién ahí se resta lo que
 * ya se le adelantó. El resultado es el mismo "a pagar" del cálculo; solo
 * cambia dónde se ve cada cosa, que es lo que la persona reconoce al firmar.
 */
export function desgloseRecibo(c = {}) {
  const descuentos = redondo(n(c.aporte) + n(c.prestamos) + n(c.quirografarios) + n(c.multas));
  const totalMensual = redondo(n(c.total) - descuentos);
  const anticipo = redondo(n(c.anticipos));
  return { descuentos, totalMensual, anticipo, aPagar: redondo(totalMensual - anticipo) };
}

/** Lo que hay que pagar: quien no tiene nada a cobrar no cuenta como pendiente. */
export const porPagar = linea => n(linea?.a_pagar) > 0 && !linea?.pagado_at;

/** El rol está pagado cuando nadie queda con algo por cobrar. */
export function estadoDelRol(lineas = []) {
  return lineas.some(porPagar) ? "cerrado" : "pagado";
}

export function resumenDePago(lineas = []) {
  const pagadas = lineas.filter(l => l.pagado_at);
  const pendientes = lineas.filter(porPagar);
  return {
    pagado: redondo(pagadas.reduce((t, l) => t + n(l.a_pagar), 0)),
    pendiente: redondo(pendientes.reduce((t, l) => t + n(l.a_pagar), 0)),
    personasPagadas: pagadas.length,
    personasPendientes: pendientes.length,
  };
}

/**
 * Cómo se agrupan los pagos en gastos del control.
 *
 * Con el rol firmado, un gasto por persona: cada recibo es su propio papel.
 * Con factura, un solo gasto para todas las personas que cubre: es un
 * documento, con un número, y cargarlo partido haría que el mismo número de
 * factura apareciera repetido y saltara como duplicado.
 */
export function agruparPagos(lineas = [], soporte = "rol") {
  const aPagar = lineas.filter(porPagar);
  if (!aPagar.length) return [];
  return soporte === "factura" ? [aPagar] : aPagar.map(l => [l]);
}

/** La fila de obra_facturas que deja un pago de rol en el control de obra. */
export function gastoDelPago({ lineas = [], soporte = "rol", factura = {}, fecha, rol = {}, obraId, planillaId = null, quien = {} }) {
  const s = SOPORTES[soporte] || SOPORTES.rol;
  const total = redondo(lineas.reduce((t, l) => t + n(l.a_pagar), 0));
  const una = lineas.length === 1 ? lineas[0] : null;
  const quienes = una
    ? `${una.nombre}${una.cargo ? ` (${una.cargo})` : ""}`
    : `${lineas.length} personas: ${lineas.map(l => l.nombre).join(", ")}`;
  const conFactura = soporte === "factura";
  return {
    obra_id: obraId,
    planilla_id: planillaId,
    fecha,
    tipo_documento: s.documento,
    clase: s.clase,
    numero_factura: conFactura ? (factura.numero || "").trim() || null : null,
    // Con el rol, el "proveedor" es la persona que cobra, con su cédula: así
    // en Proveedores se ve a quién se le pagó y cuánto.
    ruc: conFactura ? (factura.ruc || "").trim() || null : (una?.cedula || null),
    razon_social: conFactura ? (factura.razon_social || "").trim() || null : (una?.nombre || null),
    detalle: `Rol de pagos ${periodoTexto(rol)} · ${quienes}`,
    // Un sueldo no lleva IVA. Si la factura del contratista lo trae, se corrige
    // en el control como cualquier factura.
    subtotal_0: total, subtotal_5: 0, subtotal_15: 0, iva: 0,
    total,
    tipo: "mano_obra",
    origen: ORIGEN_ROL,
    subido_por: quien?.id ?? null,
    subido_por_nombre: quien?.name || null,
  };
}
