import { cargarPDF } from "../../lib/exportar";
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

/**
 * @param filas  [{ tipo: "etapa"|"barra", ... }] en el orden en que se ven
 * @param ancho  "a4" o "a3": el A3 entra el doble de tiempo por hoja
 */
export async function pdfCronograma({ nombre, plan, filas = [], cal, hoyISO, diasDeContrato = 0 }, ancho = "a4") {
  const { jsPDF } = await cargarPDF();
  const doc = new jsPDF({ unit: "mm", format: ancho === "a3" ? "a3" : "a4", orientation: "landscape" });
  const ANCHO = doc.internal.pageSize.getWidth();
  const ALTO = doc.internal.pageSize.getHeight();
  const M = 10;
  const IZQ = 86;                      // nombre + días + las dos fechas
  const ARRIBA = 30;                   // encabezado y escala
  const ABAJO = 12;
  const FILA = 5.6;
  // Cada día mide lo mismo en todas las hojas: una barra de dos días se tiene
  // que ver como de dos días, acá y tres páginas más allá.
  const MM_DIA = 3.1;

  const inicio = fechaDe(plan.inicio);
  const fin = fechaDe(plan.fin);
  const totalDias = Math.max(1, Math.round((fin - inicio) / DIA_MS) + 1);
  const anchoLienzo = ANCHO - M * 2 - IZQ;
  const diasPorHoja = Math.max(7, Math.floor(anchoLienzo / MM_DIA));
  const hojasAncho = Math.ceil(totalDias / diasPorHoja);
  const filasPorHoja = Math.max(6, Math.floor((ALTO - ARRIBA - ABAJO) / FILA));
  const hojasAlto = Math.max(1, Math.ceil(filas.length / filasPorHoja));

  let logo = null;
  try { logo = await logoParaPDF(logoEmpresa()); } catch { /* sin logo se sigue */ }

  const dibujarEncabezado = (desdeDia, hojaAncho) => {
    let y = M;
    if (logo) doc.addImage(logo.dataUrl, "PNG", M, y, 22, (22 * logo.height) / logo.width);
    doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(...TINTA);
    doc.text(nombre || "Cronograma", M + 26, y + 5);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...GRIS);
    const resumen = [
      `${larga(plan.inicio)} a ${larga(plan.fin)}`,
      `${plan.duracion} días de trabajo`,
      diasDeContrato ? `plazo de contrato: ${diasDeContrato}` : "",
      hojasAncho > 1 ? `tiempo ${hojaAncho + 1} de ${hojasAncho}` : "",
    ].filter(Boolean).join("  ·  ");
    doc.text(resumen, M + 26, y + 9.5);

    // ── La escala: meses arriba, días abajo ──
    const yMes = ARRIBA - 13, yDia = ARRIBA - 7;
    let mesActual = null, mesDesde = null;
    for (let i = 0; i < diasPorHoja; i++) {
      const n = desdeDia + i;
      if (n >= totalDias) break;
      const d = new Date(inicio.getTime() + n * DIA_MS);
      const x = M + IZQ + i * MM_DIA;
      const clave = `${d.getFullYear()}-${d.getMonth()}`;
      if (clave !== mesActual) {
        if (mesActual !== null) {
          doc.setFontSize(7.5); doc.setTextColor(...TINTA); doc.setFont("helvetica", "bold");
          doc.text(mesActual.etiqueta, mesDesde + 1, yMes + 3.2);
        }
        mesActual = clave;
        mesActual = { clave, etiqueta: `${MESES[d.getMonth()].toUpperCase()} ${d.getFullYear()}` };
        mesDesde = x;
        doc.setDrawColor(...LINEA); doc.setLineWidth(0.2);
        doc.line(x, yMes, x, ARRIBA - 2);
      }
      mesActual.clave = clave;
      // El día: número chico, y el domingo marcado para poder contar semanas.
      const trabaja = cal?.trabaja ? cal.trabaja(d) : d.getDay() !== 0;
      if (!trabaja) {
        doc.setFillColor(248, 247, 245);
        doc.rect(x, ARRIBA - 4, MM_DIA, ALTO - ARRIBA - ABAJO + 4, "F");
      }
      doc.setFont("helvetica", d.getDay() === 1 ? "bold" : "normal");
      doc.setFontSize(5.4); doc.setTextColor(...(trabaja ? NEGRO : GRIS));
      doc.text(String(d.getDate()), x + MM_DIA / 2, yDia, { align: "center" });
    }
    if (mesActual) {
      doc.setFontSize(7.5); doc.setTextColor(...TINTA); doc.setFont("helvetica", "bold");
      doc.text(mesActual.etiqueta, mesDesde + 1, yMes + 3.2);
    }

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
    if (n < desdeDia || n >= desdeDia + diasPorHoja) return;
    const x = M + IZQ + (n - desdeDia) * MM_DIA + MM_DIA / 2;
    doc.setDrawColor(...ROJO); doc.setLineWidth(0.4);
    doc.line(x, ARRIBA - 3, x, ALTO - ABAJO);
    doc.setFontSize(5.5); doc.setTextColor(...ROJO); doc.setFont("helvetica", "bold");
    doc.text("HOY", x, ALTO - ABAJO + 3, { align: "center" });
  };

  let primera = true;
  for (let hojaAncho = 0; hojaAncho < hojasAncho; hojaAncho++) {
    const desdeDia = hojaAncho * diasPorHoja;
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
          doc.text(String(f.nombre).slice(0, 58), M + 1.5, y + FILA - 1.7);
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
        doc.text(`${f.numero ? `${f.numero}  ` : ""}${String(f.nombre).slice(0, 44)}`, M + 1.5 + sangria, y + FILA - 1.7);
        doc.setTextColor(...GRIS); doc.setFontSize(6.3);
        doc.text(f.hito ? "—" : String(f.duracion), M + 48, y + FILA - 1.7, { align: "right" });
        if (f.inicio) doc.text(corta(f.inicio), M + 51, y + FILA - 1.7);
        if (f.fin) doc.text(corta(f.fin), M + 69, y + FILA - 1.7);

        // La barra, recortada a lo que entra en esta hoja.
        if (f.inicio && f.fin) {
          const d1 = Math.round((fechaDe(f.inicio) - inicio) / DIA_MS);
          const d2 = Math.round((fechaDe(f.fin) - inicio) / DIA_MS);
          const desde = Math.max(d1, desdeDia);
          const hasta = Math.min(d2, desdeDia + diasPorHoja - 1);
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
  const url = doc.output("bloburl");
  window.open(url, "_blank", "noopener");
  void archivo;
}
