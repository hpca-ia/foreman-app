import { supabase } from "../../lib/supabase";

// Con qué plata se está haciendo la obra.
//
// El control de obra contesta cuánto se gastó y contra qué. No contesta la
// pregunta del lunes a la mañana: cuánto anticipó el cliente, cuánto queda en
// la caja del proyecto, y si lo que falta por gastar entra en lo que queda.
//
// LA REGLA QUE SOSTIENE TODO ESTO: los egresos no se escriben acá.
//
//   Ya están contados —son las facturas que entraron a control de obra— y el
//   saldo se calcula restándolas. Una segunda lista de gastos sería una
//   segunda verdad: alguien carga la factura en el control, otro la anota en
//   el libro, y a fin de mes no cuadra ni el banco ni la obra. Es exactamente
//   el descuadre que este módulo viene a evitar, así que no se lo puede
//   permitir a sí mismo.
//
//   `proyecto_fondos` guarda solo lo que no tiene otra casa: lo que ENTRA
//   —anticipos, aportes, planillas cobradas— y lo que SALE sin pasar por una
//   factura de obra, como una devolución al cliente o un traspaso.

export const CLASES_FONDO = [
  { id: "anticipo",         label: "Anticipo del cliente", entra: true },
  { id: "planilla_cobrada", label: "Planilla cobrada",     entra: true },
  { id: "aporte",           label: "Aporte o préstamo",    entra: true },
  { id: "devolucion",       label: "Devolución al cliente", entra: false },
  { id: "traspaso",         label: "Traspaso a otra cuenta", entra: false },
];

export const FORMAS = ["transferencia", "cheque", "efectivo", "tarjeta"];

const n = v => Number(v) || 0;
const falta = e => /relation|column|does not exist|schema cache/i.test(e?.message || "");

/** @returns { fondos, sinTabla } */
export async function cargarFondos(leadId) {
  if (!leadId) return { fondos: [], sinTabla: false };
  const { data, error } = await supabase.from("proyecto_fondos")
    .select("*").eq("lead_id", leadId).order("fecha", { ascending: false }).order("id", { ascending: false });
  if (error) return { fondos: [], sinTabla: falta(error) };
  return { fondos: data || [], sinTabla: false };
}

export async function guardarFondo(fila, quien) {
  const clase = CLASES_FONDO.find(c => c.id === fila.clase) || CLASES_FONDO[0];
  // El signo lo decide la clase, no quien escribe: pedirle a alguien que
  // tipee un menos es pedirle que se olvide una vez de cada diez.
  const monto = Math.abs(Number(fila.monto) || 0) * (clase.entra ? 1 : -1);
  const campos = {
    lead_id: fila.lead_id, obra_id: fila.obra_id || null,
    fecha: fila.fecha || new Date().toISOString().slice(0, 10),
    clase: clase.id, concepto: fila.concepto?.trim() || clase.label, monto,
    forma_pago: fila.forma_pago || null, documento: fila.documento?.trim() || null,
  };
  if (fila.id) {
    const { error } = await supabase.from("proyecto_fondos").update(campos).eq("id", fila.id);
    return error ? error.message : null;
  }
  const { error } = await supabase.from("proyecto_fondos").insert({
    ...campos, creado_por: quien?.id ?? null, creado_nombre: quien?.name || null,
  });
  return error ? (falta(error) ? "Falta correr la migración 068." : error.message) : null;
}

export async function borrarFondo(id) {
  const { error } = await supabase.from("proyecto_fondos").delete().eq("id", id);
  return error ? error.message : null;
}

/**
 * El estado de la caja del proyecto.
 *
 * `gastado` es la suma de las facturas que entraron al control: son "los
 * gastos realizados que entran en control de obra y planilla", ni uno más ni
 * uno menos. Una factura sin planilla ya salió de la caja aunque todavía no
 * esté en ningún corte, así que cuenta igual —la plata no espera al corte.
 */
export function estadoDeCaja({ fondos = [], facturas = [] }) {
  const entrado = fondos.filter(f => n(f.monto) > 0).reduce((t, f) => t + n(f.monto), 0);
  const salido = fondos.filter(f => n(f.monto) < 0).reduce((t, f) => t - n(f.monto), 0);
  const gastado = facturas.reduce((t, f) => t + n(f.total), 0);
  return { entrado, salido, gastado, saldo: entrado - salido - gastado };
}

/**
 * La caja, corte por corte: cuánto había, cuánto se gastó, con cuánto se sigue.
 *
 * Es la lectura que se hace de arriba hacia abajo cuando alguien pregunta "¿y
 * en qué momento nos quedamos cortos?". Las facturas que todavía no tienen
 * planilla van en su propia línea al final: existen y pesan, y esconderlas
 * hasta que alguien las asigne es cómo el saldo de la pantalla deja de ser el
 * saldo del banco.
 */
export function porPlanilla({ planillas = [], facturas = [], fondos = [] }) {
  const orden = [...planillas].sort((a, b) => a.numero - b.numero);
  const gastoDe = new Map();
  let huerfanas = 0;
  facturas.forEach(f => {
    if (!f.planilla_id) { huerfanas += n(f.total); return; }
    gastoDe.set(f.planilla_id, (gastoDe.get(f.planilla_id) || 0) + n(f.total));
  });

  // Lo que entró hasta el cierre de cada corte. Una planilla sin fecha de
  // cierre se lleva todo lo que entró hasta hoy.
  const entradas = fondos.map(f => ({ fecha: f.fecha, monto: n(f.monto) }));
  const entradoHasta = fecha => entradas
    .filter(e => !fecha || !e.fecha || e.fecha <= fecha)
    .reduce((t, e) => t + e.monto, 0);

  let acumulado = 0;
  const filas = orden.map(p => {
    const gasto = gastoDe.get(p.id) || 0;
    acumulado += gasto;
    const recibido = entradoHasta(p.fecha_hasta || p.fecha_cierre || null);
    return { id: p.id, nombre: p.nombre || `Planilla N°${p.numero}`, numero: p.numero,
      gasto, acumulado, recibido, saldo: recibido - acumulado };
  });
  if (huerfanas) {
    acumulado += huerfanas;
    const recibido = entradoHasta(null);
    filas.push({ id: "sin", nombre: "Sin planilla todavía", numero: null,
      gasto: huerfanas, acumulado, recibido, saldo: recibido - acumulado });
  }
  return filas;
}
