import { cargarPDF } from "../../lib/exportar";
import { mostrarPdf } from "../../lib/abrirPdf";
import { logoParaPDF } from "../../lib/logos";
import { logoEmpresa } from "../../lib/marca";

// El cronograma en PDF: el que se imprime y se clava en la pared.
//
// En la pantalla el Gantt se desplaza y uno mira un pedazo por vez. En papel no
// hay desplazamiento: o entra todo, o no se entiende. Y un cronograma de seis
// meses no entra en una hoja a menos que cada día mida medio milímetro, que es
// lo mismo que no imprimirlo.
//
// POR ESO SE PARTE A LO ANCHO. Cada día conserva su ancho —lo suficiente para
// leer la fecha y para que una barra de dos días se vea como de dos días— y el
// tiempo sigue en la hoja siguiente, con la lista de actividades repetida a la
// izquierda. Es como se imprime un cronograma de verdad y es lo que deja
// pegarlas una al lado de la otra en la pared del contenedor.
//
// Y va con el logo: un cronograma circula entre el cliente, la fiscalización y
// el contratista, y un papel con fechas comprometidas que no dice quién lo
// emitió es un papel que después nadie reconoce como propio.

const TINTA = [15, 61, 62];
const NEGRO = [17, 24, 39];
const GRIS = [107, 114, 128];
const ROJO = [185, 28, 28];
const SUAVE = [231, 241, 239];
const LINEA = [225, 222, 216];

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIA_MS = 86400000;
const fechaDe = f => new Date(`${String(f).slice(0, 10)}T12:00:00`);
const corta = f => { const d = fechaDe(f); return `${d.getDate()} ${MESES[d.getMonth()]}`; };
const larga = f => { const d = fechaDe(f); return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`; };

// Cuánto mide cada hoja apaisada, en milímetros. De A4 a A1 el ancho se
// duplica cada dos tamaños, y con él los días que entran: la misma letra, la
// misma barra, más calendario por hoja.
export const HOJAS = {
  a4: { label: "A4", ancho: 297, nota: "la hoja de siempre" },
  a3: { label: "A3", ancho: 420, nota: "el doble de tiempo por hoja" },
  a2: { label: "A2", ancho: 594, nota: "plano chico" },
  a1: { label: "A1", ancho: 841, nota: "para la pared" },
};

// Margen, columnas de la izquierda y ancho de cada día. Viven acá porque la
// pantalla los necesita para poder decir, ANTES de bajar el PDF, cuántos días
// entran en cada tamaño y cuántas hojas van a salir.
export const MARGEN = 10;
export const IZQUIERDA = 86;
export const MM_POR_DIA = 3.1;

export const diasPorHoja = hoja =>
  Math.max(7, Math.floor(((HOJAS[hoja] || HOJAS.a4).ancho - MARGEN * 2 - IZQUIERDA) / MM_POR_DIA));

/**
 * @param filas  [{ tipo: "etapa"|"barra", ... }] en el orden en que se ven
 * @param hoja   a4 | a3 | a2 | a1. Cambia cuánto tiempo entra por hoja, no el
 *   tamaño de la letra ni el de las barras: una obra larga se lee igual, en
 *   menos hojas.
 */
export async function pdfCronograma({ nombre, plan, filas = [], cal, hoyISO, diasDeContrato = 0 }, hoja = "a4") {
  const { jsPDF } = await cargarPDF();
  const doc = new jsPDF({ unit: "mm", format: HOJAS[hoja] ? hoja : "a4", orientation: "landscape" });
  const ANCHO = doc.internal.pageSize.getWidth();
  const ALTO = doc.internal.pageSize.getHeight();
  const M = MARGEN;
  const IZQ = IZQUIERDA;               // nombre + días + las dos fechas
  const ARRIBA = 34;                   // encabezado, resumen y escala
  const ABAJO = 12;
  const FILA = 5.6;
  // Cada día mide lo mismo en todas las hojas: una barra de dos días se tiene
  // que ver como de dos días, acá y tres páginas más allá.
  const MM_DIA = MM_POR_DIA;

  const inicio = fechaDe(plan.inicio);
  const fin = fechaDe(plan.fin);
  const totalDias = Math.max(1, Math.round((fin - inicio) / DIA_MS) + 1);
  const anchoLienzo = ANCHO - M * 2 - IZQ;
  const diasHoja = Math.max(7, Math.floor(anchoLienzo / MM_DIA));
  const hojasAncho = Math.ceil(totalDias / diasHoja);
  const filasPorHoja = Math.max(6, Math.floor((ALTO - ARRIBA - ABAJO) / FILA));
  const hojasAlto = Math.max(1, Math.ceil(filas.length / filasPorHoja));

  let logo = null;
  try { logo = await logoParaPDF(logoEmpresa()); } catch { /* sin logo se sigue */ }

  const dibujarEncabezado = (desdeDia, hojaAncho) => {
    const y = M;
    if (logo) doc.addImage(logo.dataUrl, "PNG", M, y, 22, (22 * logo.height) / logo.width);
    doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(...TINTA);
    doc.text(nombre || "Cronograma", M + 26, y + 5);
    // EL RESUMEN EN DOS RENGLONES Y PEGADO A LA IZQUIERDA.
    // En uno solo se metía debajo de la escala de días y las dos cosas se
    // leían encima: el dato y el calendario peleando por el mismo espacio.
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...GRIS);
    doc.text(`${larga(plan.inicio)} a ${larga(plan.fin)}  ·  ${plan.duracion} días de trabajo`, M + 26, y + 9.2);
    const segunda = [
      diasDeContrato ? `plazo de contrato: ${diasDeContrato} días` : "",
      hojasAncho > 1 ? `tiempo ${hojaAncho + 1} de ${hojasAncho}` : "",
    ].filter(Boolean).join("  ·  ");
    if (segunda) doc.text(segunda, M + 26, y + 12.6);

    // ── La escala: una banda de mes arriba, los días abajo ──
    const yMes = ARRIBA - 12, yDia = ARRIBA - 5.5;
    // UN RÓTULO POR MES, no uno por día.
    //
    // La comparación se hacía contra una variable que dejaba de ser la clave
    // del mes en la primera vuelta, así que cada día entraba como "mes nuevo"
    // y escribía OCTUBRE encima de OCTUBRE treinta y un veces. El resultado
    // era una mancha negra donde tenía que ir el calendario.
    const tramos = [];
    for (let i = 0; i < diasHoja; i++) {
      const n = desdeDia + i;
      if (n >= totalDias) break;
      const d = new Date(inicio.getTime() + n * DIA_MS);
      const clave = `${d.getFullYear()}-${d.getMonth()}`;
      const ultimo = tramos[tramos.length - 1];
      if (!ultimo || ultimo.clave !== clave) {
        tramos.push({ clave, etiqueta: `${MESES[d.getMonth()].toUpperCase()} ${d.getFullYear()}`, desde: i, hasta: i });
      } else ultimo.hasta = i;

      const x = M + IZQ + i * MM_DIA;
      const trabaja = cal?.trabaja ? cal.trabaja(d) : d.getDay() !== 0;
      if (!trabaja) {
        doc.setFillColor(248, 247, 245);
        doc.rect(x, ARRIBA - 3, MM_DIA, ALTO - ARRIBA - ABAJO + 3, "F");
      }
      doc.setFont("helvetica", d.getDay() === 1 ? "bold" : "normal");
      doc.setFontSize(5.2); doc.setTextColor(...(trabaja ? NEGRO : GRIS));
      doc.text(String(d.getDate()), x + MM_DIA / 2, yDia, { align: "center" });
    }
    tramos.forEach(t => {
      const x = M + IZQ + t.desde * MM_DIA;
      const ancho = (t.hasta - t.desde + 1) * MM_DIA;
      doc.setFillColor(...SUAVE);
      doc.rect(x, yMes, ancho, 4.4, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(6.4); doc.setTextColor(...TINTA);
      // Si el tramo es angosto —el mes entra cortado al final de la hoja— se
      // escribe solo el mes, y si ni eso entra, nada: un rótulo que se sale de
      // su banda y pisa al de al lado es peor que ninguno.
      const etiqueta = ancho > 26 ? t.etiqueta : ancho > 13 ? t.etiqueta.split(" ")[0] : "";
      if (etiqueta) doc.text(etiqueta, x + 1.2, yMes + 3.2);
      doc.setDrawColor(...LINEA); doc.setLineWidth(0.25);
      doc.line(x, yMes, x, ALTO - ABAJO);
    });

    // Encabezado de las columnas de la izquierda.
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(...GRIS);
    doc.text("ACTIVIDAD", M + 1, yDia);
    doc.text("DÍAS", M + 48, yDia, { align: "right" });
    doc.text("EMPIEZA", M + 51, yDia);
    doc.text("TERMINA", M + 69, yDia);
    doc.setDrawColor(...TINTA); doc.setLineWidth(0.4);
    doc.line(M, ARRIBA - 3, ANCHO - M, ARRIBA - 3);
  };

  const dibujarHoy = desdeDia => {
    if (!hoyISO) return;
    const n = Math.round((fechaDe(hoyISO) - inicio) / DIA_MS);
    if (n < desdeDia || n >= desdeDia + diasHoja) return;
    const x = M + IZQ + (n - desdeDia) * MM_DIA + MM_DIA / 2;
    doc.setDrawColor(...ROJO); doc.setLineWidth(0.4);
    doc.line(x, ARRIBA - 3, x, ALTO - ABAJO);
    doc.setFontSize(5.5); doc.setTextColor(...ROJO); doc.setFont("helvetica", "bold");
    doc.text("HOY", x, ALTO - ABAJO + 3, { align: "center" });
  };

  let primera = true;
  for (let hojaAncho = 0; hojaAncho < hojasAncho; hojaAncho++) {
    const desdeDia = hojaAncho * diasHoja;
    for (let hojaAlto = 0; hojaAlto < hojasAlto; hojaAlto++) {
      if (!primera) doc.addPage();
      primera = false;
      dibujarEncabezado(desdeDia, hojaAncho);
      dibujarHoy(desdeDia);

      let y = ARRIBA;
      const suyas = filas.slice(hojaAlto * filasPorHoja, (hojaAlto + 1) * filasPorHoja);
      suyas.forEach(f => {
        if (f.tipo === "etapa") {
          doc.setFillColor(...SUAVE);
          doc.rect(M, y, ANCHO - M * 2, FILA, "F");
          doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(...TINTA);
          let et = String(f.nombre);
          while (doc.getTextWidth(et) > 46 && et.length > 4) et = et.slice(0, -2);
          doc.text(et === String(f.nombre) ? et : `${et.trim()}…`, M + 1.5, y + FILA - 1.7);
          if (f.inicio && f.fin) {
            doc.setFont("helvetica", "normal"); doc.setFontSize(6); doc.setTextColor(...GRIS);
            doc.text(`${corta(f.inicio)} a ${corta(f.fin)}`, M + 51, y + FILA - 1.7);
          }
          y += FILA;
          return;
        }

        doc.setDrawColor(...LINEA); doc.setLineWidth(0.1);
        doc.line(M, y + FILA, ANCHO - M, y + FILA);

        doc.setFont("helvetica", "normal"); doc.setFontSize(6.8);
        doc.setTextColor(...(f.critica ? ROJO : NEGRO));
        const sangria = f.sangria ? 4 : 0;
        // CORTADO POR LO QUE ENTRA, no por una cantidad de letras: "10.1
        // Porcelanato en bodegas y paredes de baño" tiene menos caracteres que
        // el límite y aun así se metía arriba de la columna de los días.
        const etiqueta = `${f.numero ? `${f.numero}  ` : ""}${f.nombre}`;
        const cabe = 44 - sangria;
        let texto = etiqueta;
        while (doc.getTextWidth(texto) > cabe && texto.length > 4) texto = texto.slice(0, -2);
        if (texto !== etiqueta) texto = `${texto.trim()}…`;
        doc.text(texto, M + 1.5 + sangria, y + FILA - 1.7);
        doc.setTextColor(...GRIS); doc.setFontSize(6.3);
        doc.text(f.hito ? "—" : String(f.duracion), M + 48, y + FILA - 1.7, { align: "right" });
        if (f.inicio) doc.text(corta(f.inicio), M + 51, y + FILA - 1.7);
        if (f.fin) doc.text(corta(f.fin), M + 69, y + FILA - 1.7);

        // La barra, recortada a lo que entra en esta hoja.
        if (f.inicio && f.fin) {
          const d1 = Math.round((fechaDe(f.inicio) - inicio) / DIA_MS);
          const d2 = Math.round((fechaDe(f.fin) - inicio) / DIA_MS);
          const desde = Math.max(d1, desdeDia);
          const hasta = Math.min(d2, desdeDia + diasHoja - 1);
          if (hasta >= desde) {
            const x = M + IZQ + (desde - desdeDia) * MM_DIA;
            const ancho = Math.max((hasta - desde + 1) * MM_DIA, 1.2);
            if (f.hito) {
              // Un hito es un rombo: una barra de un día se ve igual que un
              // trabajo cortito, y lo que uno busca al abrir un cronograma
              // —cuándo cobro, cuándo entrego— se pierde entre el resto.
              const cx = x + MM_DIA / 2, cy = y + FILA / 2;
              doc.setFillColor(...TINTA);
              doc.triangle(cx, cy - 1.6, cx + 1.6, cy, cx, cy + 1.6, "F");
              doc.triangle(cx, cy - 1.6, cx - 1.6, cy, cx, cy + 1.6, "F");
            } else {
              // Gris lo que ejecuta un externo: cuando una de ésas se atrasa
              // la responsabilidad es de otro, y mezclada con las propias el
              // cronograma se lee como si todo fuera de la obra.
              doc.setFillColor(...(f.externo ? [148, 145, 140] : f.critica ? ROJO : TINTA));
              doc.roundedRect(x, y + 1.3, ancho, FILA - 2.6, 0.6, 0.6, "F");
              // Lo ejecutado, en una franja más oscura adentro.
              if (f.avance > 0) {
                doc.setFillColor(255, 255, 255);
                doc.rect(x + ancho * (f.avance / 100), y + 2.4, ancho * (1 - f.avance / 100), FILA - 4.8, "F");
              }
            }
          }
        }
        y += FILA;
      });

      // Pie: de qué obra es, qué hoja es y cuándo se emitió. Un cronograma
      // suelto sin fecha de emisión es peligroso: no se sabe si es el vigente.
      doc.setFont("helvetica", "normal"); doc.setFontSize(6); doc.setTextColor(...GRIS);
      doc.text(`${nombre || ""} · emitido el ${larga(new Date().toISOString())}`, M, ALTO - 5);
      doc.text("Rojo: ruta crítica  ·  Gris: la ejecuta un externo  ·  Rombo: hito  ·  Barra clara: lo que falta ejecutar",
        ANCHO / 2, ALTO - 5, { align: "center" });
      doc.text(`${doc.internal.getNumberOfPages()}`, ANCHO - M, ALTO - 5, { align: "right" });
    }
  }

  const archivo = `Cronograma - ${String(nombre || "obra").replace(/[^\w\sáéíóúñÁÉÍÓÚÑ-]/g, "").trim().slice(0, 40)}.pdf`;
  return mostrarPdf(doc, archivo);
}
