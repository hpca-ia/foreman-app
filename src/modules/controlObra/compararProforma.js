import { baseSinIva } from "./contratoDeLaObra.js";
// Lo que cotizan hoy contra lo que se presupuestó.
//
// Entre que se arma el presupuesto y que se compra pasan meses, y el precio no
// es el mismo. A veces se consigue mejor —el proveedor da descuento por volumen,
// bajó el acero, se cambió de marca— y a veces peor. Esa diferencia es el
// BENEFICIO de la obra, y es de donde sale la utilidad real: no de vender más
// caro, sino de comprar mejor que lo presupuestado.
//
// Hoy eso se mira a ojo, renglón por renglón, con el presupuesto en una pantalla
// y la proforma en la mano. Y cuando se mira a ojo, lo que se ve son los
// ahorros: lo que se pasó de precio no salta, porque nadie busca malas noticias.
//
// Acá se compara contra el rubro del presupuesto, se suma, y se dice de las dos
// maneras: cuánto se ganó y cuánto se perdió, por separado. Un neto de "+$300"
// puede esconder $4.000 de ahorro y $3.700 de sobreprecio, y esas son dos obras
// muy distintas.

const n = v => Number(v) || 0;
const centavos = v => Math.round(n(v) * 100) / 100;

/**
 * Comparar los renglones de una proforma contra los rubros del presupuesto.
 *
 * @param items   [{descripcion, cantidad, unidad, monto, rubro_id}]
 * @param rubros  los de la obra
 * @returns por renglón y los totales
 */
export function compararContraPresupuesto(items = [], rubros = []) {
  const porId = new Map(rubros.map(r => [Number(r.id), r]));
  // ¿Esta obra sabe lo que le cuestan sus rubros? Casi nunca al principio: un
  // presupuesto armado desde un Excel trae el precio al cliente y nada más.
  const algunoConCosto = rubros.some(r => n(r.costo_unitario) > 0);

  const lineas = items.map(it => {
    const r = it.rubro_id != null ? porId.get(Number(it.rubro_id)) : null;
    const cotizado = centavos(it.monto);
    // CONTRA EL RUBRO SIN IVA, porque la proforma ya se lee sin IVA.
    //
    // Los rubros base del control están cargados CON el IVA adentro —en Diners
    // Aéreo suman $172.127,24, que es el subtotal del presupuesto por 1,15— y
    // los que mete una orden de cambio entran sin IVA. Comparar un costo sin
    // IVA contra un rubro con IVA inventa un ahorro del 15% que no existe, y al
    // revés inventa un sobreprecio. Se lleva todo a la base en la que trabaja
    // la empresa: sin IVA, que es como se cotiza y como se mide el margen.
    const delRubro = r ? baseSinIva(r) : null;

    // SOLO SE COMPARA LO MISMO CONTRA LO MISMO.
    //
    // El rubro son 120 varillas y la proforma cotiza 80. Los dos totales
    // puestos uno al lado del otro dicen "se ahorró un tercio", y no se ahorró
    // nada: se compró menos material. El mismo error al revés —la proforma trae
    // de más— inventa un sobreprecio y hace que una compra buena parezca mala.
    //
    // Con la misma cantidad, el total contra el total: esa diferencia es
    // beneficio de verdad. Con cantidades distintas, lo único comparable es el
    // precio unitario, y la diferencia se mide sobre lo que de verdad se está
    // comprando.
    const cantRubro = n(r?.cantidad);
    const cantProforma = n(it.cantidad);
    const puRubro = cantRubro && delRubro != null ? delRubro / cantRubro : null;
    const puProforma = cantProforma ? cotizado / cantProforma : null;
    const porUnitario = !!(puRubro != null && cantProforma
      && Math.abs(cantProforma - cantRubro) / cantRubro > 0.01);

    const presupuestado = delRubro == null ? null
      : porUnitario ? centavos(puRubro * cantProforma) : delRubro;
    const diferencia = presupuestado == null ? null : centavos(presupuestado - cotizado);

    // ── LA TERCERA COLUMNA: LO QUE YA SABÍAMOS QUE COSTABA ───────────────────
    //
    // El presupuesto tiene dos números por rubro: el PRECIO, que es el que ve
    // el cliente, y el COSTO, que es lo que nos cuesta. Comparar una proforma
    // contra el precio dice cuánto deja; compararla contra el costo cargado
    // dice si el proveedor subió, y son dos preguntas distintas.
    //
    // Y en una obra que vino de un Excel el costo no existe todavía: esta misma
    // proforma es la primera vez que ese rubro va a tener uno. Por eso cuando
    // no hay costo esto no es un error ni un cero — es `null`, y la pantalla
    // ofrece cargarlo.
    const puCosto = r && n(r.costo_unitario) > 0 ? n(r.costo_unitario) : null;
    const costoCargado = puCosto == null ? null
      : centavos(puCosto * (cantProforma || cantRubro || 0));
    const vsCosto = costoCargado == null ? null : centavos(costoCargado - cotizado);

    return {
      ...it,
      rubro: r || null,
      cotizado,
      presupuestado,
      // Lo que ya teníamos cargado como costo de ese rubro, medido sobre la
      // cantidad que trae la proforma. null es "nunca se cargó", no cero.
      costoCargado,
      puCosto,
      // Positivo: el proveedor cotiza por debajo de lo que teníamos cargado.
      vsCosto,
      pctCosto: costoCargado ? Math.round((vsCosto / costoCargado) * 1000) / 10 : null,
      // Lo que el rubro tiene presupuestado entero, aunque se compare una parte.
      delRubro,
      cantidadRubro: cantRubro || null,
      unidadRubro: r?.unidad || "",
      puRubro: puRubro == null ? null : Math.round(puRubro * 10000) / 10000,
      puProforma: puProforma == null ? null : Math.round(puProforma * 10000) / 10000,
      // Las cantidades no coinciden: se comparó el precio unitario.
      porUnitario,
      // Positivo es a favor: se compra por menos de lo presupuestado.
      diferencia,
      pct: presupuestado ? Math.round((diferencia / presupuestado) * 1000) / 10 : null,
    };
  });

  const conRubro = lineas.filter(l => l.presupuestado != null);
  const ahorro = centavos(conRubro.filter(l => l.diferencia > 0).reduce((t, l) => t + l.diferencia, 0));
  const sobreprecio = centavos(conRubro.filter(l => l.diferencia < 0).reduce((t, l) => t - l.diferencia, 0));

  return {
    lineas,
    // SIN EMPAREJAR: los renglones que todavía no apuntan a un rubro. No se
    // cuentan en ningún total, y hay que decir cuántos son: un beneficio
    // calculado sobre la mitad de la proforma no es un beneficio.
    sinRubro: lineas.filter(l => l.presupuestado == null).length,
    // Cuántos se compararon por precio unitario porque las cantidades no son
    // las mismas. Hay que decirlo: es otra cuenta, aunque dé un número igual.
    porUnitario: lineas.filter(l => l.porUnitario).length,
    // ── LO QUE FALTA SABER ────────────────────────────────────────────────
    //
    // Cuántos de los renglones emparejados tienen un costo cargado contra el
    // cual comparar, y cuántos no. En una obra armada desde un Excel no lo
    // tiene ninguno, y entonces esta proforma no es una comparación: es la
    // primera vez que esos rubros van a saber lo que cuestan.
    conCosto: conRubro.filter(l => l.costoCargado != null).length,
    sinCosto: conRubro.filter(l => l.costoCargado == null).length,
    laObraSabeSusCostos: algunoConCosto,
    // Contra el costo cargado: si el proveedor subió o bajó respecto de lo que
    // ya teníamos anotado. Es otra pregunta que cuánto deja el rubro.
    subioElProveedor: centavos(conRubro.filter(l => l.vsCosto != null && l.vsCosto < 0).reduce((t, l) => t - l.vsCosto, 0)),
    bajoElProveedor: centavos(conRubro.filter(l => l.vsCosto != null && l.vsCosto > 0).reduce((t, l) => t + l.vsCosto, 0)),
    cotizado: centavos(conRubro.reduce((t, l) => t + l.cotizado, 0)),
    presupuestado: centavos(conRubro.reduce((t, l) => t + l.presupuestado, 0)),
    ahorro,
    sobreprecio,
    // El neto, que es lo que termina en la utilidad. Se muestra junto a los
    // otros dos y nunca solo.
    neto: centavos(ahorro - sobreprecio),
  };
}
