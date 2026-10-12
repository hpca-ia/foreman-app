import { exportarExcel, exportarPDF, money } from "../../lib/exportar";

// El rol de pagos, en papel y en planilla.
//
// Un rol que solo vive en una pantalla no sirve para pagar: hay que imprimirlo
// para firmarlo, mandarlo al contador, y guardarlo. Hasta ahora había que
// copiarlo a mano a un Excel, y copiar a mano una tabla de plata es de donde
// salen las diferencias que después nadie encuentra.
//
// LAS DOS SALIDAS DICEN LO MISMO, y salen del mismo cálculo que la pantalla:
// si el PDF y el Excel pudieran discrepar, no se podría usar ninguno.

const d = v => Number(v) || 0;

const DIA = f => {
  const x = new Date(`${String(f).slice(0, 10)}T12:00:00`);
  return isNaN(x) ? "" : `${x.getDate()}/${x.getMonth() + 1}/${x.getFullYear()}`;
};

/**
 * Las columnas del rol, dichas una sola vez.
 *
 * El orden es el del recibo que firma la gente: primero lo que ganó, después
 * los beneficios de ley, después lo que se le descuenta, y al final lo que
 * recibe. Cualquier otro orden obliga a quien firma a buscar su número.
 */
const COLUMNAS = [
  ["Cédula", p => p.persona?.cedula || "", 14],
  ["Nombre", p => p.persona?.nombre || "", 30],
  ["Cargo", p => p.persona?.cargo || "", 18],
  ["Días", p => d(p.asistencia?.dias), 7],
  ["Sueldo", p => d(p.sueldoPeriodo), 12],
  ["H. extras", p => d(p.horasExtras), 10],
  ["Extras $", p => d(p.totalExtras), 12],
  ["Ingresos", p => d(p.ingresos), 12],
  ["13º", p => d(p.decimoTercero), 10],
  ["14º", p => d(p.decimoCuarto), 10],
  ["Vacaciones", p => d(p.vacaciones), 12],
  ["F. reserva", p => d(p.fondos), 12],
  ["Transporte", p => d(p.transporte), 12],
  ["Alimentación", p => d(p.alimentacion), 13],
  ["TOTAL", p => d(p.total), 13],
  ["Aporte IESS", p => d(p.aporte), 12],
  ["Anticipos", p => d(p.anticipos), 11],
  ["Préstamos", p => d(p.prestamos), 11],
  ["Quirograf.", p => d(p.quirografarios), 12],
  ["Multas", p => d(p.multas), 10],
  ["Descuentos", p => d(p.descuentos), 12],
  ["A PAGAR", p => d(p.aPagar), 13],
];

const periodoEnPalabras = ({ desde, hasta }) =>
  `${desde ? `del ${DIA(desde)} ` : ""}al ${DIA(hasta)}`;

/** El rol en Excel, para el contador y para archivarlo. */
export async function rolAExcel({ nomina, obra = "", periodo = {} }) {
  const encabezado = COLUMNAS.map(c => c[0]);
  const filas = nomina.lineas.map(l => COLUMNAS.map(c => c[1](l)));

  // La fila de totales va en la planilla, no solo en la pantalla: quien la
  // abre tiene que poder cuadrarla sin volver a sumar.
  const totales = COLUMNAS.map((c, i) => {
    if (i === 0) return "TOTALES";
    if (i < 3) return "";
    const v = filas.reduce((t, f) => t + (typeof f[i] === "number" ? f[i] : 0), 0);
    return Math.round(v * 100) / 100;
  });

  await exportarExcel(`Rol de pagos - ${obra} ${periodoEnPalabras(periodo)}`, [{
    nombre: "Rol de pagos",
    anchos: COLUMNAS.map(c => c[2]),
    filas: [
      [`ROL DE PAGOS · ${obra}`],
      [periodoEnPalabras(periodo), "", `${nomina.personas} ${nomina.personas === 1 ? "persona" : "personas"}`],
      [],
      encabezado,
      ...filas,
      totales,
    ],
  }]);
}

/**
 * El rol en PDF, que es el que se imprime y se firma.
 *
 * Menos columnas que el Excel A PROPÓSITO: veintidós columnas en una hoja no se
 * leen, y el papel se usa para otra cosa —revisar, firmar, entregar—. El
 * desglose completo está en el Excel para quien lo necesite.
 */
export async function rolAPDF({ nomina, obra = "", periodo = {} }) {
  const columnas = ["Cédula", "Nombre", "Días", "Ingresos", "Beneficios", "Descuentos", "A PAGAR", "Firma"];
  const filas = nomina.lineas.map(l => [
    l.persona?.cedula || "",
    l.persona?.nombre || "",
    String(d(l.asistencia?.dias)),
    money(l.ingresos),
    money(d(l.decimoTercero) + d(l.decimoCuarto) + d(l.vacaciones) + d(l.fondos)),
    money(l.descuentos),
    money(l.aPagar),
    // La columna de firma va VACÍA: es un rol que se imprime para que cada uno
    // firme al recibir, y sin ese espacio el papel no sirve para lo que se
    // imprime.
    "",
  ]);

  await exportarPDF({
    nombreArchivo: `Rol de pagos - ${obra} ${periodoEnPalabras(periodo)}`,
    titulo: "Rol de pagos",
    subtitulo: `${obra} · ${periodoEnPalabras(periodo)}`,
    resumen: [
      { label: "Personas", valor: nomina.personas },
      { label: "Ingresos", valor: nomina.ingresos },
      { label: "Beneficios de ley", valor: nomina.beneficios },
      { label: "Descuentos", valor: nomina.descuentos },
      { label: "A pagar", valor: nomina.aPagar },
    ],
    bloques: [{
      titulo: "Detalle por persona",
      columnas,
      filas,
      anchos: [60, 120, 28, 52, 58, 56, 58, 90],
    }],
  });
}
