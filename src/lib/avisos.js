// LOS AVISOS DEL TABLERO.
//
// Un aviso es algo que SIGUE PASANDO: un lead que hay que insistirle al
// cliente, una compra que espera tu visto, una observación de obra sin
// arreglar. Aparece mientras sea cierto y se va solo cuando se resuelve; no es
// una lista de cosas que ya ocurrieron.
//
// Cada módulo aporta los suyos, con su cuenta, y tocarlo lleva al lugar donde
// se resuelve. Lo pidió Hernán: «todas las notificaciones que haya activas
// aparezcan a un lado en el dashboard». Están el pipeline, compras,
// observaciones, las órdenes de cambio, las dos revisiones de Control, los
// alquileres y las actas (docs/reingenieria-pipeline-tareas.md).
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
 * @param modulos        lo que trae cargarAvisosDeModulos: órdenes de cambio,
 *                       las revisiones de Control, alquileres y actas
 * @returns [{ clave, modulo, vista, tono, cuenta, texto, detalle }]
 *   `vista` es a dónde lleva tocarlo; `tono`, qué tan fuerte se pinta.
 */
export function avisosDelTablero({ pipeline = [], compras = [], devueltas = 0, observaciones = [], modulos = null }) {
  const lista = [];

  // PRIMERO LA PLATA QUE NO CUADRA. Si el control dejó de decir lo mismo que
  // el papel, todo lo demás que se lea en Control está apoyado en eso.
  if (modulos?.noCuadran?.length) {
    lista.push({
      clave: "control-presupuesto", modulo: "Control de obra", vista: "controlObra", tono: "peligro", cuenta: modulos.noCuadran.length,
      texto: modulos.noCuadran.length === 1 ? "obra cuyo control no dice lo mismo que su presupuesto firmado" : "obras cuyo control no dice lo mismo que su presupuesto firmado",
      detalle: nombres(modulos.noCuadran),
    });
  }
  if (modulos?.ordenesMal?.cuantas) {
    lista.push({
      clave: "control-ordenes", modulo: "Control de obra", vista: "controlObra", tono: "peligro", cuenta: modulos.ordenesMal.cuantas,
      texto: modulos.ordenesMal.cuantas === 1 ? "orden aprobada no cuadra con su documento" : "órdenes aprobadas no cuadran con su documento",
      detalle: nombres(modulos.ordenesMal.obras),
    });
  }

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

  // Plata nuestra parada en la casilla de otro: lo que el cliente no firma.
  const oc = modulos?.ordenes;
  if (oc?.cuantas) {
    lista.push({
      clave: "ordenes-firma", modulo: "Órdenes de cambio", vista: "controlObra", tono: oc.vencidas || oc.objetadas ? "peligro" : "atencion", cuenta: oc.cuantas,
      texto: oc.cuantas === 1 ? "orden espera la firma del cliente" : "órdenes esperan la firma del cliente",
      detalle: [
        oc.dias ? `la más vieja, hace ${oc.dias} ${oc.dias === 1 ? "día" : "días"}` : "enviada hoy",
        oc.vencidas ? `${oc.vencidas} con el plazo vencido` : "", oc.objetadas ? `${oc.objetadas} ${oc.objetadas === 1 ? "objetada" : "objetadas"}` : "",
      ].filter(Boolean).join(" · "),
    });
  }
  if (modulos?.rebotadas) {
    lista.push({
      clave: "ordenes-rebote", modulo: "Órdenes de cambio", vista: "controlObra", tono: "peligro", cuenta: modulos.rebotadas,
      texto: modulos.rebotadas === 1 ? "correo de una orden rebotó" : "correos de órdenes rebotaron",
      detalle: "A esa persona la orden no le llegó: hay que corregir su correo y reenviarla.",
    });
  }
  if (modulos?.alquileres) {
    lista.push({
      clave: "alquileres", modulo: "Alquileres", vista: "controlObra", tono: "peligro", cuenta: modulos.alquileres,
      texto: modulos.alquileres === 1 ? "alquiler se pasa de plazo" : "alquileres se pasan de plazo",
      detalle: "Lo que siga costando después de esa fecha no está en ninguna orden.",
    });
  }

  if (modulos?.actas) {
    lista.push({
      clave: "actas", modulo: "Actas", vista: "actas", tono: "atencion", cuenta: modulos.actas,
      texto: modulos.actas === 1 ? "compromiso de un acta está vencido" : "compromisos de actas están vencidos",
      detalle: modulos.actasSinRepartir
        ? `${modulos.actasSinRepartir} sin decidir quién ${modulos.actasSinRepartir === 1 ? "lo" : "los"} sigue: no están en la bandeja de nadie`
        : "",
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
