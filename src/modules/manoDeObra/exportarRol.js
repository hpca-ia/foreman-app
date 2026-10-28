import { exportarExcel, exportarPDF, money, cargarPDF } from "../../lib/exportar";
import { pieDePdf } from "../../lib/piePdf";
import { desgloseRecibo, periodoTexto } from "./rolPagado";

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
    pie: { elemento: `Rol de pagos · ${periodoEnPalabras(periodo)}`, proyecto: obra },
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

/**
 * El recibo de cada persona, con el formato del MODELO ROL de la oficina.
 *
 * Una hoja por trabajador, que es lo que se imprime, se firma al cobrar y se
 * guarda como respaldo del pago. Sale de las líneas del rol CERRADO, no del
 * cálculo en vivo: un recibo firmado no puede cambiar porque después alguien
 * corrigió un día de asistencia.
 *
 * Las tres columnas del modelo —sueldo, horas extras, base IESS— se arman de
 * modo que siempre sumen: la de horas extras es el total menos la del sueldo.
 * Si cada una se redondeara por su lado, un recibo podría mostrar 0,01 de
 * diferencia entre sus columnas, y eso en un papel que se firma es una duda.
 *
 * @param rol      { numero, desde, hasta, parametros }
 * @param lineas   las líneas del rol (con `calculo`)
 * @param obra     { nombre, inicio }
 * @param empresa  { nombre, direccion }
 */
export async function recibosAPDF({ rol, lineas, obra = {}, empresa = {} }) {
  const { jsPDF } = await cargarPDF();
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const par = rol.parametros || {};
  const pctFondos = d(par.fondosReserva) || 8.33, pctAporte = d(par.aportePersonal) || 9.45;
  const r2 = v => Math.round(v * 100) / 100;
  const $ = v => `$ ${money(v)}`;

  const X = { label: 44, c1: 360, c2: 460, c3: 566 };
  const NEGRO = [17, 24, 39], GRIS = [107, 114, 128], LINEA = [210, 210, 210];

  lineas.forEach((l, i) => {
    if (i > 0) doc.addPage();
    const c = l.calculo || {};
    const he = c.horasExtras || {};
    const vh = c.valoresHora || {};
    const b = desgloseRecibo(c);
    let y = 44;

    const texto = (t, x, yy, { negrita = false, tam = 8.5, color = NEGRO, align = "left" } = {}) => {
      doc.setFont("helvetica", negrita ? "bold" : "normal");
      doc.setFontSize(tam); doc.setTextColor(...color);
      doc.text(String(t ?? ""), x, yy, { align });
    };
    const fila = (label, v1, v2, v3, { negrita = false } = {}) => {
      texto(label, X.label, y, { negrita });
      if (v1 != null) texto($(v1), X.c1, y, { align: "right", negrita });
      if (v2 != null) texto($(v2), X.c2, y, { align: "right", negrita });
      if (v3 != null) texto($(v3), X.c3, y, { align: "right", negrita });
      y += 13;
    };
    const titulo = t => { y += 4; texto(t, X.label, y, { negrita: true, tam: 8.5 }); y += 13; };
    const raya = () => { doc.setDrawColor(...LINEA); doc.line(X.label, y - 9, X.c3, y - 9); };

    // ── Encabezado ──
    texto(empresa.nombre || "", X.label, y, { negrita: true, tam: 11 });
    if (rol.numero) texto(`N° ${rol.numero}`, X.c3, y, { align: "right", tam: 9, color: GRIS });
    y += 14;
    [["PROYECTO", obra.nombre], ["DIRECCIÓN", empresa.direccion], ["INICIO OBRA", obra.inicio ? DIA(obra.inicio) : ""]]
      .filter(([, v]) => v)
      .forEach(([k, v]) => { texto(`${k}:`, X.label, y, { color: GRIS, tam: 8 }); texto(v, X.label + 72, y, { tam: 8 }); y += 11; });

    y += 12;
    texto("ROL DE PAGOS", 306, y, { negrita: true, tam: 13, align: "center" }); y += 16;
    texto(`PERIODO DE TRABAJOS: ${periodoTexto(rol).toUpperCase()}`, 306, y, { tam: 9, align: "center" }); y += 20;

    // ── Datos del trabajador ──
    titulo("DATOS TRABAJADOR");
    const dato = (k, v) => { texto(k, X.label, y); texto(v, X.label + 170, y); y += 12; };
    dato("NOMBRES Y APELLIDOS:", l.nombre || "");
    dato("CÉDULA IDENTIDAD:", l.cedula || "");
    dato("CARGO:", l.cargo || "");
    dato("SUELDO MENSUAL:", $(l.salario_mensual));
    dato("VALOR H. EXTRA 100%:", $(vh.he100));
    dato("VALOR H. EXTRA 75%:", $(vh.he75));
    dato("VALOR H. EXTRA 50%:", $(vh.he50));
    dato("VALOR H. EXTRA 25%:", $(vh.he25));
    dato("ACUMULA FONDOS DE RESERVA:", c.persona?.acumula_fondos ? "SÍ" : "NO");

    titulo("CANTIDAD HORAS EXTRAS");
    [["HORAS 100%", "he100"], ["HORAS 75%", "he75"], ["HORAS 50%", "he50"], ["HORAS 25%", "he25"]]
      .forEach(([k, id]) => { texto(k, X.label, y); texto(money(he[id]?.horas), X.label + 220, y, { align: "right" }); y += 12; });
    texto("DÍAS TRABAJADOS", X.label, y, { negrita: true }); texto(String(d(l.dias)), X.label + 220, y, { align: "right", negrita: true }); y += 18;

    // ── Ingresos ──
    texto("SUELDO PERIODO", X.c1, y, { align: "right", tam: 7, color: GRIS, negrita: true });
    texto("HORAS EXTRAS", X.c2, y, { align: "right", tam: 7, color: GRIS, negrita: true });
    texto("BASE CÁLCULO IESS", X.c3, y, { align: "right", tam: 7, color: GRIS, negrita: true });
    y += 12;
    const sueldo = d(c.sueldoPeriodo), ingresos = d(c.ingresos), extras = r2(ingresos - sueldo);
    fila("SUELDO POR PERIODO DE TRABAJO", sueldo, null, sueldo);
    [["HORAS EXTRAS 100%", "he100"], ["HORAS EXTRAS 75%", "he75"], ["HORAS EXTRAS 50%", "he50"], ["HORAS EXTRAS 25%", "he25"]]
      .forEach(([k, id]) => fila(k, null, he[id]?.monto, he[id]?.monto));
    raya(); fila("TOTAL DE INGRESOS", sueldo, extras, ingresos, { negrita: true });

    // ── Beneficios de ley: la parte del sueldo, la de las extras, y el total.
    const partir = (total, f) => { const a = r2(sueldo * f); return [a, r2(d(total) - a), d(total)]; };
    titulo("FRACCIONES BENEFICIOS DE LEY (EMPL. CONSTRUCCIÓN)");
    fila("FRACCIÓN DÉCIMO TERCER SUELDO", ...partir(c.decimoTercero, 1 / 12));
    fila("FRACCIÓN DÉCIMO CUARTO SUELDO", null, null, c.decimoCuarto);
    fila("FRACCIÓN VACACIONES", ...partir(c.vacaciones, 1 / 24));
    fila(`FONDOS DE RESERVA ${String(pctFondos).replace(".", ",")}%`, ...(d(c.fondos) ? partir(c.fondos, pctFondos / 100) : [0, 0, 0]));
    titulo("OTROS");
    fila("ALIMENTACIÓN", null, null, c.alimentacion);
    fila("TRANSPORTE", null, null, c.transporte);
    const t1 = r2(sueldo + r2(sueldo / 12) + r2(sueldo / 24) + (d(c.fondos) ? r2(sueldo * pctFondos / 100) : 0));
    raya(); fila("TOTAL SUELDO + H. EXTRAS + FRACC. BENEF. DE LEY", t1, null, c.total, { negrita: true });

    // ── Descuentos ──
    titulo("DESCUENTOS");
    fila(`APORTES ${String(pctAporte).replace(".", ",")}% (APORTE PERSONAL)`, ...partir(c.aporte, pctAporte / 100));
    fila("PRÉSTAMOS", null, null, c.prestamos);
    fila("PLANILLAS QUIROGRAFARIOS", null, null, c.quirografarios);
    fila("MULTAS", null, null, c.multas);
    raya(); fila("TOTAL DE DESCUENTOS Y EGRESOS", null, null, b.descuentos, { negrita: true });

    y += 6;
    fila("TOTAL MENSUAL", null, null, b.totalMensual, { negrita: true });
    fila("ANTICIPO 1er QUINCENA", null, null, b.anticipo);
    doc.setDrawColor(...NEGRO); doc.line(X.c2, y - 9, X.c3, y - 9);
    texto("A PAGAR", X.c2 - 40, y + 2, { negrita: true, tam: 11 });
    texto($(b.aPagar), X.c3, y + 2, { negrita: true, tam: 11, align: "right" });

    // ── Firmas ──
    const yf = doc.internal.pageSize.getHeight() - 70;
    [["ELABORADO", 120], ["AUTORIZADO", 306], ["RECIBE", 492]].forEach(([k, x]) => {
      doc.setDrawColor(...NEGRO); doc.line(x - 70, yf, x + 70, yf);
      texto(k, x, yf + 11, { negrita: true, tam: 8, align: "center" });
    });
    texto(l.nombre || "", 492, yf + 21, { tam: 7, align: "center", color: GRIS });
    if (l.cedula) texto(`C.I. ${l.cedula}`, 492, yf + 30, { tam: 7, align: "center", color: GRIS });
  });

  pieDePdf(doc, { elemento: `Rol de pagos ${periodoTexto(rol)}`, proyecto: obra.nombre, margen: 14, abajo: 7 });
  const quien = lineas.length === 1 ? lineas[0].nombre : "todos";
  doc.save(`Recibo rol ${periodoTexto(rol).replace(/\//g, "-")} - ${quien}.pdf`.replace(/[^\w\s.áéíóúñÁÉÍÓÚÑ-]/g, ""));
}
