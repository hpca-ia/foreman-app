// Las notas que acompañan un presupuesto de construcción: lo que evita
// discusiones después. No son letra chica: son lo que se acuerda de antemano
// sobre cómo se mide, cómo se paga, qué entra y qué no.
//
// Cada una se marca o no según la obra, y su texto se puede cambiar. Las
// marcadas de fábrica son las que casi todo contrato lleva.

export const GRUPOS_NOTAS = [
  {
    titulo: "Alcance y medidas",
    notas: [
      { id: "proyecto_completo", marcada: true, texto: "El presente presupuesto corresponde al proyecto completo y está abierto a revisión del cliente para su modificación antes de la firma del contrato." },
      { id: "medidas", marcada: true, texto: "Las cantidades son referenciales y se ajustarán a las medidas reales en obra. Se pagará lo efectivamente ejecutado, según mediciones aprobadas por ambas partes." },
      { id: "incluye", marcada: true, texto: "Los precios unitarios incluyen materiales, mano de obra, herramienta menor, equipo y transporte, salvo que el rubro indique lo contrario." },
      { id: "adicionales", marcada: true, texto: "Todo trabajo no descrito en este presupuesto se considera adicional: se presupuestará por separado y se ejecutará solo con aprobación escrita del cliente." },
      { id: "especificaciones", marcada: false, texto: "Las marcas y especificaciones son referenciales. Un cambio de material solicitado por el cliente se valorará como diferencia de precio." },
      { id: "planos", marcada: false, texto: "El presupuesto se basa en los planos y especificaciones entregados a la fecha. Cambios de diseño posteriores se presupuestarán aparte." },
    ],
  },
  {
    titulo: "Precios y forma de pago",
    notas: [
      { id: "pago", marcada: true, texto: "Forma de pago: 50 % de anticipo a la firma del contrato y el saldo contra planillas de avance de obra." },
      { id: "planillas", marcada: false, texto: "Las planillas de avance se presentarán cada quince días y se pagarán dentro de los ocho días siguientes a su aprobación." },
      { id: "reajuste", marcada: false, texto: "Si el costo de los materiales principales sube más de un 5 % durante la ejecución, los precios afectados podrán reajustarse con la debida justificación." },
      { id: "garantia_pago", marcada: false, texto: "De cada planilla se retendrá un 5 % como garantía de buena ejecución, que se devolverá a la entrega de la obra." },
    ],
  },
  {
    titulo: "Plazo y condiciones de obra",
    notas: [
      { id: "plazo", marcada: false, texto: "El plazo de ejecución se contará desde la entrega del anticipo y del sitio de trabajo, según el cronograma acordado." },
      { id: "sitio", marcada: true, texto: "El cliente entregará el sitio libre y con acceso, con puntos de agua y energía eléctrica disponibles para la obra." },
      { id: "permisos", marcada: true, texto: "No incluye permisos municipales, tasas, estudios técnicos ni acometidas de servicios, salvo que consten como rubro." },
      { id: "mobiliario", marcada: false, texto: "No incluye mobiliario, equipamiento, decoración ni obras exteriores que no estén descritas." },
      { id: "escombros", marcada: false, texto: "El desalojo de escombros se realiza hasta botaderos autorizados." },
      { id: "horario", marcada: false, texto: "Los trabajos se realizarán en horario laboral de lunes a viernes. Trabajos fuera de ese horario, a pedido del cliente, tendrán un recargo." },
    ],
  },
  {
    titulo: "Garantía",
    notas: [
      { id: "garantia", marcada: true, texto: "Garantía de doce meses sobre la mano de obra, contados desde la entrega de la obra." },
      { id: "fabricante", marcada: false, texto: "Los materiales y equipos tienen la garantía de su fabricante." },
    ],
  },
];

export const TODAS_LAS_NOTAS = GRUPOS_NOTAS.flatMap(g => g.notas);
