// ¿EL CONTROL DICE LO MISMO QUE EL PRESUPUESTO QUE SE FIRMÓ?
//
// El presupuesto de Diners Aéreo son $189.340,00 y el control decía
// $191.921,91. Nadie lo había tocado en la pantalla: el rubro de honorarios
// del contrato entró bien, con su IVA, y días después una corrección a mano lo
// leyó como si no lo tuviera y se lo sumó otra vez. $2.581,91 de más en el
// contrato, en el presupuesto actualizado y en el "Contrato original" de cada
// orden de cambio que salió desde ese día. Y nada avisó.
//
// La línea base es una COPIA del presupuesto. Mientras sea una copia, puede
// dejar de decir lo mismo que el original, y eso no puede depender de que
// alguien sume ciento sesenta rubros a mano para darse cuenta.
//
// Esto compara las dos cosas, siempre:
//
//   · EL TOTAL. Lo que suman los rubros del contrato en el control contra lo
//     que dice el presupuesto. Es el número que el cliente tiene en su papel.
//   · RUBRO POR RUBRO. Cada rubro del control sabe de qué renglón del
//     presupuesto vino (`presupuesto_item_id`): si su total no es el de ese
//     renglón con el IVA del control, se nombra, con lo que tiene y lo que
//     debería tener. Sin esto el aviso diría "hay una diferencia" y habría que
//     salir a buscarla.
//
// LOS CENTAVOS NO SON UN ERROR. El presupuesto calcula el IVA una vez sobre el
// subtotal y el control lo guarda rubro por rubro: al activar la obra los
// centavos que sobran se reparten en el rubro más grande. Por eso un rubro
// puede separarse unos centavos de su renglón, y eso se tolera. El total no:
// el total tiene que cuadrar.
//
// Sin base de datos: se le pasan los rubros, el presupuesto y sus renglones.

const n = v => Number(v) || 0;
const c2 = v => Math.round(n(v) * 100) / 100;

/** Lo que se le perdona a un rubro: los centavos que se reparten al activar. */
export const TOLERANCIA_POR_RUBRO = 0.05;
/** Lo que se le perdona al total: nada que se pueda ver en un papel. */
export const TOLERANCIA_DEL_TOTAL = 0.01;

/** Los rubros que vinieron del presupuesto: ni los de una orden ni los agregados en el control. */
export const esDelPresupuesto = r => !!r && r.origen !== "orden_cambio" && r.origen !== "control";

/**
 * @param rubros       los de la obra
 * @param presupuesto  { total, subtotal, iva_pct, honorarios_monto }
 * @param items        los renglones del presupuesto: { id, total, descripcion, capitulo }
 */
export function cuadreConElPresupuesto({ rubros = [], presupuesto = null, items = [] } = {}) {
  const delContrato = (rubros || []).filter(esDelPresupuesto);
  if (!presupuesto || !delContrato.length) return { hay: false, cuadra: true, distintos: [], sinRenglon: [], sinRubro: [] };

  // EL PAPEL. Si el control lleva el IVA adentro, se compara contra el total
  // del presupuesto; si entró sin sumarle IVA —un presupuesto que ya lo traía
  // en sus precios—, contra lo que suman sus renglones.
  const conIvaAdentro = delContrato.some(r => n(r.iva_pct) > 0);
  const papel = c2(conIvaAdentro
    ? (n(presupuesto.total) || n(presupuesto.subtotal))
    : (n(presupuesto.subtotal) || n(presupuesto.total)));
  const control = c2(delContrato.reduce((t, r) => t + n(r.total_base), 0));
  const diferencia = c2(control - papel);

  const fila = (r, extra) => ({
    id: r.id, numero: String(r.numero ?? r.codigo ?? ""), descripcion: r.descripcion || "",
    capitulo: r.capitulo_original ?? r.capitulo ?? "", ...extra,
  });

  // RUBRO POR RUBRO, contra el renglón del que vino.
  const porId = new Map((items || []).map(i => [String(i.id), i]));
  const usados = new Set();
  const distintos = [];
  const sinRenglon = [];
  for (const r of delContrato) {
    if (r.presupuesto_item_id == null) continue;        // una obra importada suelta: no hay contra qué
    const it = porId.get(String(r.presupuesto_item_id));
    if (!it) {
      // Solo se puede afirmar que el renglón ya no está si se trajeron renglones.
      if (porId.size && Math.abs(n(r.total_base)) > TOLERANCIA_POR_RUBRO) sinRenglon.push(fila(r, { tiene: c2(r.total_base) }));
      continue;
    }
    usados.add(String(it.id));
    const esperado = c2(n(it.total) * (1 + n(r.iva_pct) / 100));
    const tiene = c2(r.total_base);
    const dif = c2(tiene - esperado);
    if (Math.abs(dif) > TOLERANCIA_POR_RUBRO) distintos.push(fila(r, { tiene, esperado, diferencia: dif }));
  }
  distintos.sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia));

  // Lo que está en el presupuesto y nunca bajó al control.
  const sinRubro = (items || [])
    .filter(i => !usados.has(String(i.id)) && Math.abs(n(i.total)) > TOLERANCIA_POR_RUBRO)
    .map(i => ({ id: i.id, descripcion: i.descripcion || "", capitulo: i.capitulo || "", total: c2(i.total) }));
  // Sin `presupuesto_item_id` en ningún rubro no se sabe qué bajó y qué no.
  const sabeDeDondeVino = delContrato.some(r => r.presupuesto_item_id != null);

  const cuadra = Math.abs(diferencia) <= TOLERANCIA_DEL_TOTAL;
  return {
    hay: true, cuadra, papel, control, diferencia,
    distintos,
    sinRenglon,
    sinRubro: sabeDeDondeVino ? sinRubro : [],
    // Cuánto de la diferencia explican los rubros nombrados: si no la explican
    // toda, hay algo más y se dice.
    explicado: c2(distintos.reduce((t, x) => t + x.diferencia, 0) + sinRenglon.reduce((t, x) => t + x.tiene, 0)),
    // Honorarios que el presupuesto todavía suma al pie: al control bajan los
    // rubros, y un honorario al pie no es un rubro.
    honorariosAlPie: c2(presupuesto.honorarios_monto),
  };
}

const plata = v => (Number(v) || 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pesos = v => `${v < 0 ? "−" : ""}$${plata(Math.abs(v))}`;

/**
 * Lo que hay que decir, en castellano. Nada si cuadra.
 *
 * @returns { titulo, lineas: [texto] } | null
 */
export function comoSeDice(c) {
  if (!c?.hay || c.cuadra) return null;
  const titulo = `El control no dice lo mismo que el presupuesto: el presupuesto son ${pesos(c.papel)} `
    + `y los rubros del contrato en el control suman ${pesos(c.control)}. `
    + `Hay ${pesos(Math.abs(c.diferencia))} de ${c.diferencia > 0 ? "más" : "menos"} en el control.`;
  const lineas = [];
  for (const x of c.distintos.slice(0, 8)) {
    lineas.push(`Rubro ${x.numero} · ${x.descripcion}: en el control está en ${pesos(x.tiene)} y según su renglón del presupuesto `
      + `debería estar en ${pesos(x.esperado)} (${x.diferencia > 0 ? "+" : "−"}${plata(Math.abs(x.diferencia))}).`);
  }
  if (c.distintos.length > 8) lineas.push(`Y ${c.distintos.length - 8} rubros más que tampoco coinciden con su renglón.`);
  for (const x of c.sinRenglon.slice(0, 5)) {
    lineas.push(`Rubro ${x.numero} · ${x.descripcion}: está en el control por ${pesos(x.tiene)} y su renglón ya no está en el presupuesto.`);
  }
  for (const x of c.sinRubro.slice(0, 5)) {
    lineas.push(`${x.descripcion}${x.capitulo ? ` (${x.capitulo})` : ""}: está en el presupuesto por ${pesos(x.total)} sin IVA y no bajó al control.`);
  }
  if (c.honorariosAlPie > 0) {
    lineas.push(`El presupuesto tiene ${pesos(c.honorariosAlPie)} de honorarios al pie: al control bajan los rubros, así que hay que pasarlos a un capítulo.`);
  }
  if (!lineas.length) lineas.push("Ningún rubro se separa de su renglón: la diferencia está en el total del presupuesto, o en rubros que no saben de qué renglón vinieron.");
  return { titulo, lineas };
}
