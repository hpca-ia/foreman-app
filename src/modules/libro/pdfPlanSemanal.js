import { cargarPDF } from "../../lib/exportar";
import { pieDePdf } from "../../lib/piePdf";
// `logoParaPDF` carga y rasteriza cualquier imagen por URL, no solo logos:
// sirve igual para meter un plano o la foto de una consulta en una hoja.
import { logoParaPDF, fotoParaPDF } from "../../lib/logos";
import { logoEmpresa } from "../../lib/marca";
// `seguro` es el de todos los PDF: además de comillas y rayas saca los
// tabuladores, que jsPDF mide como un signo y escribe como ocho espacios.
import { seguro, partirTexto, anchoEscrito } from "../../lib/textoDelPdf.js";
import { comoSeLee, tituloDelDia, seccionesDelDia, pendientesParaElPapel, cuantasActividades } from "./planEnPapel.js";

// El plan de la semana en PDF: el que se imprime y se pega en la obra.
//
// El correo sirve para que lo lean en la oficina. En la obra no se lee un
// correo: se mira una hoja clavada en la pared del contenedor, y por eso tiene
// que leerse de lejos: cada día con su franja, cada actividad con su casilla
// para tachar y su nota debajo.
//
// VA CON EL LOGO porque sale de la oficina. Un papel con las actividades de la
// semana que circula entre el contratista, el fiscalizador y el cliente sin
// decir quién lo emitió es un papel que después nadie reconoce como propio —y
// el plan semanal es justamente un documento que se discute.
//
// Y LO QUE QUEDÓ SIN HACER VA PRIMERO, igual que en el correo: un plan que
// solo dice lo que viene es optimista por construcción.
//
// SE DIBUJA A MANO, SIN TABLA. La tabla partía una actividad entre dos hojas
// —el título al pie de una y la nota arriba de la otra— y no dejaba poner el
// título en negrita y la nota en letra común. Acá cada bloque se mide antes de
// escribirlo: si no entra en lo que queda de la hoja, pasa entero a la otra, y
// la hoja nueva repite de qué día es. Qué va y en qué orden lo decide
// planEnPapel.js.

const TINTA = [15, 61, 62];
const GRIS = [107, 114, 128];
const TEXTO = [17, 24, 39];
const SUAVE = [55, 65, 81];
const AMBAR = [146, 64, 14];
const FONDO_AMBAR = [254, 243, 199];
const FONDO_DIA = [233, 240, 240];
const LINEA = [222, 224, 226];

/**
 * @param dias   [{ id, fecha, horario, personal, permisos, consideraciones }]
 * @param items  [{ plan_dia_id, tipo, texto, nota, hecha }]
 * @param quedaron lo de la semana anterior que no se hizo: [{ fecha, texto, nota, motivo }]
 * @param observaciones lo del plan entero: consultas, acuerdos, pendientes
 * @param archivos [{ nombre, tipo, url }] planos y fotos; las imágenes se dibujan
 */
export async function pdfPlanSemanal({ proyecto, desde, hasta, dias = [], items = [], quedaron = [],
  observaciones = "", archivos = [], borrador = false, cerradoPor = "", cerradoAt = null, logoUrl }) {
  const { jsPDF } = await cargarPDF();
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const ancho = doc.internal.pageSize.getWidth();
  const M = 40, W = ancho - M * 2;
  const TECHO = 50, PISO = doc.internal.pageSize.getHeight() - 44;
  // `y` es siempre el borde de arriba de lo que sigue.
  let y = 30;

  const letra = (estilo, tam, color) => { doc.setFont("helvetica", estilo); doc.setFontSize(tam); doc.setTextColor(...color); };
  const hojaNueva = alSaltar => { doc.addPage(); y = TECHO; alSaltar?.(); };
  // Un bloque que entra en una hoja vacía no se parte: pasa entero a la otra.
  const queEntre = (alto, alSaltar) => { if (y + alto > PISO && alto <= PISO - TECHO) hojaNueva(alSaltar); };
  // Renglones uno debajo del otro. `poner` deja la letra: se vuelve a llamar
  // después de un salto, porque el título que se repite arriba la cambia.
  const escribir = (lineas, x, paso, poner, alSaltar) => {
    poner();
    for (const l of lineas) {
      if (y + paso > PISO) { hojaNueva(alSaltar); poner(); }
      doc.text(l, x, y + paso * 0.76);
      y += paso;
    }
  };
  // La casilla para tachar en papel: la hoja se imprime el lunes y se va
  // marcando en la obra, donde nadie abre la app. Dibujada, no escrita «[ ]».
  const casilla = (x, arriba, lado, hecha) => {
    doc.setDrawColor(...(hecha ? TINTA : GRIS)); doc.setLineWidth(0.8);
    doc.rect(x, arriba, lado, lado);
    if (hecha) {
      doc.setLineWidth(1.3);
      doc.line(x + lado * 0.2, arriba + lado * 0.52, x + lado * 0.42, arriba + lado * 0.76);
      doc.line(x + lado * 0.42, arriba + lado * 0.76, x + lado * 0.82, arriba + lado * 0.24);
    }
  };

  // ── Encabezado ──
  // El logo. Si no carga —sin red, o el depósito caído— el documento sale
  // igual: un plan sin membrete sirve, un botón que no hace nada no.
  const logo = await logoParaPDF(logoUrl || logoEmpresa());
  let anchoLogo = 0;
  if (logo) {
    const alto = 26;
    anchoLogo = (logo.width / logo.height) * alto;
    doc.addImage(logo.dataUrl, "PNG", M, y, anchoLogo, alto);
  }
  letra("bold", 15, TINTA);
  doc.text("Plan semanal de obra", ancho - M, y + 12, { align: "right" });
  // El nombre de la obra, al ancho que deja el logo: uno largo no lo pisa.
  const nombre = partirTexto(doc, proyecto || "", W - anchoLogo - 20, "normal", 10).slice(0, 2);
  doc.setTextColor(...GRIS);
  nombre.forEach((l, i) => doc.text(l, ancho - M, y + 26 + i * 12, { align: "right" }));
  const yFechas = y + 26 + nombre.length * 12;
  doc.text(seguro(`Del ${comoSeLee(desde)} al ${comoSeLee(hasta)}`), ancho - M, yFechas, { align: "right" });
  y = Math.max(y + 26, yFechas) + 9;
  doc.setDrawColor(...TINTA); doc.setLineWidth(1.2);
  doc.line(M, y, ancho - M, y);
  y += 9;

  // BORRADOR, dicho en la hoja y en su propia franja. Un plan sin cerrar
  // impreso y clavado en la pared del contenedor se lee como definitivo, y la
  // cuadrilla trabaja contra él mientras en la oficina alguien le sigue
  // moviendo actividades. Si está cerrado, dice quién lo cerró: eso es lo que
  // lo hace un documento. Antes iba escrito encima del logo.
  if (borrador) {
    doc.setFillColor(...FONDO_AMBAR); doc.rect(M, y, W, 19, "F");
    letra("bold", 9, AMBAR); doc.text("BORRADOR", M + 9, y + 12.8);
    const w = anchoEscrito(doc, "BORRADOR");
    letra("normal", 9, AMBAR); doc.text("  ·  el plan no está cerrado todavía", M + 9 + w, y + 12.8);
    y += 31;
  } else if (cerradoPor || cerradoAt) {
    letra("normal", 8.5, GRIS);
    doc.text(seguro(`Cerrado${cerradoPor ? ` por ${cerradoPor}` : ""}`
      + `${cerradoAt ? ` el ${comoSeLee(cerradoAt)}` : ""}`), M, y + 7);
    y += 21;
  } else {
    y += 7;
  }

  // ── Lo que quedó de la semana pasada ──
  // Cada renglón: de qué día era, el título en negrita y a continuación su
  // nota, que es la que dice qué había que hacer. El motivo, si lo tiene.
  if (quedaron.length) {
    const p = pendientesParaElPapel(quedaron);
    queEntre(60);
    letra("bold", 10.5, AMBAR);
    doc.text(seguro(p.titulo), M, y + 9);
    if (p.aviso) {
      const w = anchoEscrito(doc, seguro(p.titulo));
      letra("normal", 8.5, GRIS); doc.text(seguro(p.aviso), M + w + 8, y + 9);
    }
    y += 17;
    const xTexto = M + 46, wTexto = W - 46, paso = 10.6;
    p.filas.forEach(f => {
      // El título en negrita; la nota sigue en el mismo renglón hasta donde
      // entre, y lo que falta va debajo.
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.8);
      const titulo = doc.splitTextToSize(seguro(f.titulo), wTexto);
      const sigue = f.nota ? ": " : "";
      // Medido como se escribe (anchoEscrito): con la otra medida el título
      // y lo que sigue salían pegados.
      const hasta = anchoEscrito(doc, titulo[titulo.length - 1] + sigue);
      doc.setFont("helvetica", "normal");
      const palabras = f.nota ? seguro(f.nota).split(/\s+/).filter(Boolean) : [];
      let primera = "", k = 0;
      while (k < palabras.length && hasta + anchoEscrito(doc, primera + (primera ? " " : "") + palabras[k]) <= wTexto) {
        primera += (primera ? " " : "") + palabras[k]; k += 1;
      }
      const resto = k < palabras.length ? doc.splitTextToSize(palabras.slice(k).join(" "), wTexto) : [];
      const motivo = f.motivo ? partirTexto(doc, `Por qué no se hizo: ${f.motivo}`, wTexto, "italic", 8.5) : [];
      queEntre((titulo.length + resto.length + motivo.length) * paso + 3.5);
      letra("normal", 8, GRIS); doc.text(seguro(f.dia), M, y + paso * 0.76);
      const yTitulo = y + (titulo.length - 1) * paso;
      escribir(titulo.map((l, i) => (i === titulo.length - 1 ? l + sigue : l)), xTexto, paso, () => letra("bold", 8.8, SUAVE));
      if (primera) { letra("normal", 8.8, SUAVE); doc.text(primera, xTexto + hasta, yTitulo + paso * 0.76); }
      escribir(resto, xTexto, paso, () => letra("normal", 8.8, SUAVE));
      escribir(motivo, xTexto, paso, () => letra("italic", 8.5, AMBAR));
      y += 3.5;
    });
    y += 9;
  }

  // ── Los días ──
  dias.forEach(d => {
    const s = seccionesDelDia(d, items);
    if (s.vacio) return;

    // La franja del día. Se repite arriba de cada hoja a la que el día sigue.
    const franja = sigue => {
      doc.setFillColor(...FONDO_DIA); doc.rect(M, y, W, 21, "F");
      doc.setFillColor(...TINTA); doc.rect(M, y, 3, 21, "F");
      letra("bold", 11.5, TINTA);
      doc.text(seguro(tituloDelDia(d.fecha)), M + 11, y + 14.6);
      if (sigue) {
        const w = anchoEscrito(doc, seguro(tituloDelDia(d.fecha)));
        letra("normal", 8.5, GRIS); doc.text("sigue", M + 11 + w + 7, y + 14.4);
      } else if (s.tareas.length) {
        letra("normal", 8.5, GRIS);
        doc.text(cuantasActividades(s.tareas.length), ancho - M - 9, y + 14.2, { align: "right" });
      }
      y += 28;
    };
    const sigue = () => franja(true);

    // LAS ACTIVIDADES. El título en negrita y LA NOTA CON SU TAREA, debajo: el
    // que lee la hoja en la obra no estuvo en la reunión del lunes, y «fundir
    // losa del eje 4» no dice que el hormigón llega a las siete.
    const bloques = s.tareas.map(t => {
      const titulo = partirTexto(doc, t.texto, W - 30, "bold", 10);
      const nota = t.nota ? partirTexto(doc, t.nota, W - 30, "normal", 9.5) : [];
      return { t, titulo, nota, alto: titulo.length * 12.6 + nota.length * 11.6 + 7 };
    });
    // El título del día no queda solo al pie de una hoja.
    queEntre(28 + (bloques[0]?.alto || 30));
    franja(false);
    bloques.forEach(b => {
      queEntre(b.alto, sigue);
      casilla(M + 9, y + 1.6, 9, b.t.hecha);
      escribir(b.titulo, M + 27, 12.6, () => letra("bold", 10, b.t.hecha ? GRIS : TEXTO), sigue);
      escribir(b.nota, M + 27, 11.6, () => letra("normal", 9.5, b.t.hecha ? GRIS : SUAVE), sigue);
      y += 7;
    });

    // LO DEMÁS DEL DÍA, en dos columnas: a la izquierda qué es y a la derecha
    // lo que dice. Antes iba en un párrafo gris pegado a la última actividad.
    const xRotulo = M + 9, xValor = M + 92, wValor = W - 92 - 4, paso = 11;
    const rotulo = (texto, arriba) => { letra("bold", 7.2, GRIS); doc.text(texto, xRotulo, arriba + paso * 0.76); };
    const hayMas = s.materiales.length || s.externos.length || s.ficha.length;
    if (hayMas && s.tareas.length) {
      queEntre(30, sigue);
      doc.setDrawColor(...LINEA); doc.setLineWidth(0.5);
      doc.line(M + 9, y, ancho - M, y);
      y += 6;
    }
    // El material y lo de afuera, cada renglón con su casilla: lo que tiene
    // que estar ese día se tacha cuando llega.
    const conCasillas = (nombre, lista) => {
      if (!lista.length) return;
      lista.forEach((m, i) => {
        const lineas = partirTexto(doc, m.texto, wValor - 13, "normal", 9);
        queEntre(lineas.length * paso + 2, sigue);
        if (i === 0) rotulo(nombre, y);
        casilla(xValor, y + 2, 7, m.hecha);
        escribir(lineas, xValor + 13, paso, () => letra("normal", 9, m.hecha ? GRIS : SUAVE), sigue);
        y += 2;
      });
      y += 3;
    };
    conCasillas("MATERIAL", s.materiales);
    conCasillas("DE AFUERA", s.externos);
    s.ficha.forEach(([nombre, valor]) => {
      const lineas = partirTexto(doc, valor, wValor, "normal", 9);
      queEntre(lineas.length * paso + 3, sigue);
      rotulo(nombre, y);
      escribir(lineas, xValor, paso, () => letra("normal", 9, SUAVE), sigue);
      y += 3;
    });
    y += 11;
  });

  // LAS OBSERVACIONES, al pie. Son del plan entero y no de un día: la consulta
  // abierta, lo que se acordó en obra, lo que hay que resolver antes del
  // cierre. En la hoja clavada en la pared es lo que se lee al final.
  const titulo = texto => {
    doc.setDrawColor(...TINTA); doc.setLineWidth(0.8);
    doc.line(M, y, ancho - M, y);
    letra("bold", 10.5, TINTA); doc.text(seguro(texto), M, y + 15);
    y += 23;
  };
  const obs = String(observaciones || "").trim();
  if (obs) {
    queEntre(70);
    titulo("Observaciones");
    obs.split(/\n/).forEach(parrafo => {
      escribir(partirTexto(doc, parrafo || " ", W, "normal", 9.5), M, 12, () => letra("normal", 9.5, TEXTO));
      y += 2;
    });
    y += 12;
  }

  // LOS ADJUNTOS. Primero la lista —para que la hoja impresa diga qué venía
  // con el plan, aunque se imprima suelta— y después cada imagen en su página.
  // Un plano que se manda por aparte del plan es el que nadie encuentra.
  const conArchivos = archivos.filter(a => a?.nombre);
  if (conArchivos.length) {
    queEntre(40 + conArchivos.length * 12);
    titulo(`Adjuntos (${conArchivos.length})`);
    conArchivos.forEach(a => {
      const lineas = partirTexto(doc, `${a.nombre}${a.descripcion ? `  ·  ${a.descripcion}` : ""}`, W - 12, "normal", 9);
      queEntre(lineas.length * 11.5);
      doc.setFillColor(...GRIS); doc.circle(M + 3, y + 5.6, 1.3, "F");
      escribir(lineas, M + 12, 11.5, () => letra("normal", 9, SUAVE));
    });
  }

  // Y las imágenes, una por página y lo más grande que entre: un plano en
  // miniatura no sirve para nada, y el que lo recibe no va a abrir la app.
  for (const a of conArchivos) {
    if (!/^image\//.test(a.tipo || "") || !a.url) continue;
    // JPEG y no PNG, por lo mismo que en el acta: un plano de 1600px pesa
    // cuatro megas en PNG y trescientos kilos en JPEG, se ve igual, y el plan
    // de la semana viaja por correo.
    const img = await fotoParaPDF(a.url, { lado: 1600, calidad: 0.8 });
    if (!img) continue;
    doc.addPage();
    letra("bold", 10, TINTA);
    doc.text(partirTexto(doc, a.nombre, W, "bold", 10)[0] || "", M, 50);
    if (a.descripcion) {
      letra("normal", 9, GRIS);
      doc.text(partirTexto(doc, a.descripcion, W, "normal", 9)[0] || "", M, 63);
    }
    const arriba = a.descripcion ? 76 : 62;
    const cabe = { w: W, h: PISO + 8 - arriba };
    const escala = Math.min(cabe.w / img.width, cabe.h / img.height);
    doc.addImage(img.dataUrl, "JPEG", M, arriba, img.width * escala, img.height * escala);
  }

  // Pie con la página, para una hoja que se reparte y se vuelve a juntar.
  pieDePdf(doc, { elemento: `Plan semanal del ${comoSeLee(desde)} al ${comoSeLee(hasta)}`, proyecto, margen: 14, abajo: 7.8 });
  return doc;
}
