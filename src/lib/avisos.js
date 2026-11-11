// LOS AVISOS DEL TABLERO.
//
// Un aviso es algo que SIGUE PASANDO: un lead que hay que insistirle al
// cliente, una compra que espera tu visto, una observación de obra sin
// arreglar. Aparece mientras sea cierto y se va solo cuando se resuelve; no es
// una lista de cosas que ya ocurrieron.
//
// Cada módulo aporta los suyos, con su cuenta, y tocarlo lleva al lugar donde
// se resuelve. Lo pidió Hernán: «todas las notificaciones que haya activas
// aparezcan a un lado en el dashboard». Nace con el pipeline, compras y
// observaciones; los demás módulos se suman en la fase 4 del plan
// (docs/reingenieria-pipeline-tareas.md).
//
// Acá solo se arma la lista —sin pantalla ni base—, para poder probarla.

const nombres = (lista, max = 3) => {
  const unicos = [...new Set(lista.filter(Boolean))];
  return unicos.slice(0, max).join(" · ") + (unicos.length > max ? ` · y ${unicos.length - max} más` : "");
};

const DEL_PIPELINE = {
  insistir: { tono: "peligro", uno: "lead para insistir con el cliente", varios: "leads para insistir con el cliente" },
  vencido: { tono: "peligro", uno: "lead con el próximo paso vencido", varios: "leads con el próximo paso vencido" },
  sin_paso: { tono: "atencion", uno: "lead sin próximo paso con fecha", varios: "leads sin próximo paso con fecha" },
};

/**
 * @param pipeline       lo que devuelve avisosDelPipeline, ya filtrado a lo que ve esta persona
 * @param compras        las compras que esperan por ella
 * @param devueltas      cuántas de esas le volvieron después de aprobadas
 * @param observaciones  las observaciones de obra que tiene encima
 * @returns [{ clave, modulo, vista, tono, cuenta, texto, detalle }]
 *   `vista` es a dónde lleva tocarlo; `tono`, qué tan fuerte se pinta.
 */
export function avisosDelTablero({ pipeline = [], compras = [], devueltas = 0, observaciones = [] }) {
  const lista = [];

  Object.entries(DEL_PIPELINE).forEach(([clase, d]) => {
    const suyos = pipeline.filter(a => a.clase === clase);
    if (!suyos.length) return;
    lista.push({
      clave: `pipeline-${clase}`, modulo: "Pipeline", vista: "leads", tono: d.tono, cuenta: suyos.length,
      texto: suyos.length === 1 ? d.uno : d.varios,
      // Con uno solo se dice qué pasa con él; con varios, cuáles son.
      detalle: suyos.length === 1 ? `${suyos[0].nombre}: ${suyos[0].texto}` : nombres(suyos.map(a => a.nombre)),
    });
  });

  if (compras.length) {
    lista.push({
      clave: "compras", modulo: "Compras", vista: "compras", tono: devueltas ? "atencion" : "normal", cuenta: compras.length,
      texto: compras.length === 1 ? "compra espera por vos" : "compras esperan por vos",
      // Cuántas volvieron después de aprobadas: sin esto, el que aprueba ve
      // «sigue pendiente» y entiende que devolverla no hizo nada.
      detalle: devueltas ? `${devueltas} que compras te devolvió` : nombres(compras.map(c => c.descripcion)),
    });
  }

  if (observaciones.length) {
    const urgentes = observaciones.filter(o => o.prioridad === "urgente").length;
    lista.push({
      clave: "observaciones", modulo: "Observaciones de obra", vista: "observaciones", tono: urgentes ? "peligro" : "atencion",
      cuenta: observaciones.length,
      texto: observaciones.length === 1 ? "observación de obra para arreglar" : "observaciones de obra para arreglar",
      detalle: urgentes ? `${urgentes} urgente${urgentes === 1 ? "" : "s"}` : "",
    });
  }

  return lista;
}
