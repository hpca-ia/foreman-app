// LO QUE UNA ORDEN APROBADA METE AL CONTROL, FILA POR FILA.
//
// Una orden de cambio se aprueba por dos puertas: la oficina, desde adentro
// (`aprobarOrden`), y el cliente, cuando firma el último por su enlace
// (`siFirmaronTodos`, en api/portal.js). Es el mismo documento y tiene que
// dejar el contrato vigente igual entre por donde entre.
//
// No lo hacía. Cada puerta armaba sus filas adentro de su función, con un
// comentario que decía "si una cambia, la otra también", y tres cambios que
// entraron a la oficina no llegaron nunca al enlace: el rubro de honorarios,
// el capítulo donde vive cada partida y la mención del rubro que ya existía.
// La misma orden valía un 10% menos en el control si el cliente la firmaba
// por el correo que si la aprobaba la oficina, y nada lo decía.
//
// Un comentario no sostiene dos copias. Las filas se arman acá, sin base de
// datos, donde se pueden probar. El servidor tiene la suya en
// api/_rubrosDeLaOrden.js —lo que corre en Vercel no puede importar de src/— y
// pruebas/rubrosDeLaOrden.test.mjs compara las dos fila por fila.

import { honorariosDe, rubroDeHonorarios, pctQueCorresponde } from "./honorariosDeOrden.js";
import { codigoDe } from "./nombreOrden.js";
import { numeroPrincipal } from "./numeracionDeOrdenes.js";

/**
 * QUE LAS FILAS SUMEN LO QUE DICE EL DOCUMENTO, AL CENTAVO.
 *
 * La orden calcula su IVA una vez, sobre el neto más el honorario, y ese total
 * es el que el cliente firma. El control guarda cada partida con su IVA y
 * redondeada: la suma de los redondeos no es el redondeo de la suma, y la
 * misma orden terminaba valiendo un centavo más o menos en el control que en
 * su papel. Es el mismo problema que tenía la obra contra su presupuesto, y se
 * arregla igual: los centavos que sobran o faltan van a la partida más grande,
 * que es donde menos pesan.
 *
 * El rubro de honorarios no se toca mientras haya una partida con monto: es
 * un número que se cita solo —"el 10 % de la OC-03"— y tiene que seguir siendo
 * el honorario con su IVA.
 *
 * Más de un centavo por fila no es redondeo: es otra cosa, y repartirlo sería
 * esconderla. En ese caso no se toca nada y lo dice el cuadre de órdenes.
 *
 * @param filas            las del control, ya armadas; se corrige una, en el lugar
 * @param total            el total con IVA del documento de la orden
 * @param cuantasPartidas  cuántas de las filas son partidas (el honorario va después)
 * @returns el ajuste que se hizo, en dólares; 0 si no hizo falta
 */
export function cuadrarConElDocumento(filas = [], total = 0, cuantasPartidas = filas.length) {
  const monto = f => Number(f?.total_base) || 0;
  const c2 = v => Math.round((Number(v) || 0) * 100) / 100;
  const ajuste = c2(c2(total) - filas.reduce((t, f) => t + monto(f), 0));
  if (!ajuste || Math.abs(ajuste) > (filas.length + 2) * 0.01) return 0;
  let donde = -1;
  filas.forEach((f, i) => {
    if (i >= cuantasPartidas || !monto(f)) return;
    if (donde < 0 || Math.abs(monto(f)) > Math.abs(monto(filas[donde]))) donde = i;
  });
  if (donde < 0) donde = filas.findIndex(f => monto(f));
  if (donde < 0) return 0;
  filas[donde].total_base = c2(monto(filas[donde]) + ajuste);
  return ajuste;
}

/**
 * Las filas de `obra_rubros` que deja una orden al aprobarse: una por partida
 * y, al final, la de su honorario si lo lleva.
 *
 * @param orden   la orden de cambio
 * @param lineas  sus partidas, sin IVA, como se cotizan
 * @param iva     el IVA del control de esa obra (15 = 15%): sus rubros lo
 *                llevan adentro
 * @param obra    para el porcentaje de honorarios del contrato
 * @param capHon  { capitulo, capitulo_orden } del capítulo de honorarios que la
 *                obra ya tiene, o null si no tiene ninguno
 */
export function rubrosDeLaOrden({ orden, lineas = [], iva = 0, obra = null, capHon = null } = {}) {
  const suyas = lineas || [];
  const conIva = v => Math.round(v * (1 + iva / 100) * 100) / 100;
  // Con el número de SU orden: una modificación —OC-04-A— comparte capítulo y
  // numeración con la orden que modifica.
  const suNumero = numeroPrincipal(orden);

  // TODAS LAS LÍNEAS ENTRAN, las que suman y las que restan.
  //
  // Antes la reducción iba a buscar el rubro original del contrato y lo
  // tachaba. Eso editaba el presupuesto firmado, sacaba el rubro entero aunque
  // la orden redujera una parte, y dejaba el capítulo de la orden mostrando
  // solo las adiciones: ADICIONALES · OC-01 por $12.508,62 cuando esa orden
  // movía $3.849,94.
  //
  // El presupuesto original no se toca. La orden suma lo suyo y resta lo suyo,
  // en el mismo capítulo, y ahí se lee lo que de verdad hizo.
  //
  // TODAS LAS PARTIDAS VAN AL CAPÍTULO DE LA ORDEN.
  //
  // Aunque el rubro ya exista en el presupuesto. El capítulo de una orden de
  // cambio tiene que mostrar lo que ESA orden costó, completo y en un solo
  // lugar: es lo que el cliente aprobó y es lo que se le va a cobrar. Si el
  // desalojo se sienta en PRELIMINARES Y VARIOS porque ese rubro ya existía, el
  // capítulo de la orden muestra menos de lo que la orden vale y la plata del
  // cambio queda repartida entre el presupuesto original y el adicional, que
  // son dos conversaciones distintas con dos documentos distintos.
  //
  // Que el rubro ya existiera se MENCIONA —sirve para no cobrarlo dos veces y
  // para saber contra qué precio se comparó— pero no cambia dónde vive.
  //
  // La única excepción son los honorarios, que se pagan aparte y por eso tienen
  // su propio capítulo.
  const filas = suyas.map((l, i) => {
    const signo = l.tipo === "quita" ? -1 : 1;
    // La mención del rubro que ya existía: su número y su capítulo.
    const yaExistia = [l.rubro_codigo && `rubro ${l.rubro_codigo}`, l.capitulo]
      .filter(Boolean).join(" · ");
    return {
      obra_id: orden.obra_id,
      numero: 9000 + suNumero * 100 + i,
      capitulo: `ADICIONALES · ${codigoDe(orden)}`,
      capitulo_orden: 9000 + suNumero,
      orden: 9000000 + suNumero * 1000 + i,
      descripcion: `${l.tipo === "quita" ? "(–) " : ""}${l.descripcion}  ·  ${codigoDe(orden)}`
        + (yaExistia ? `  ·  ya existía: ${yaExistia}` : ""),
      unidad: l.unidad || "",
      cantidad: Number(l.cantidad) || 0,
      precio_unitario: signo * conIva(Number(l.precio_unitario) || 0),
      total_base: signo * conIva((Number(l.cantidad) || 0) * (Number(l.precio_unitario) || 0)),
      iva_pct: iva,
      origen: "orden_cambio",
      orden_cambio_id: orden.id,
    };
  });

  // EL HONORARIO ENTRA APARTE, EN SU PROPIO CAPÍTULO.
  //
  // Sobre el neto de la orden se cobra el porcentaje del contrato —administrar
  // un adicional es trabajo igual que administrar el resto— pero no se reparte
  // dentro de los precios: cada partida tiene que seguir diciendo lo que
  // cuesta, porque ese es el número contra el que después se compara una
  // cotización. Y si la orden es negativa, el honorario también lo es.
  //
  // Va al capítulo de honorarios que la obra ya tiene, con el nombre que le
  // puso su presupuesto y en su lugar de la lista. Solo si la obra no tiene
  // ninguno se abre uno, al fondo, con el número de la orden.
  const cuenta = honorariosDe({ lineas: suyas, pct: pctQueCorresponde(orden, obra), iva });
  const honorario = rubroDeHonorarios(orden, cuenta, {
    conIva, iva,
    capitulo: capHon?.capitulo || "HONORARIOS",
  });
  if (honorario && capHon) honorario.capitulo_orden = capHon.capitulo_orden;
  if (honorario) filas.push(honorario);

  // Y LO QUE ENTRA AL CONTROL ES LO QUE DICE EL DOCUMENTO: su total con IVA.
  cuadrarConElDocumento(filas, cuenta.total, suyas.length);

  return filas;
}
