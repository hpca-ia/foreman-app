// EL CRONOGRAMA DEL PRESUPUESTO, PASADO A LA OBRA.
//
// El cronograma que se entrega con la cotización es del presupuesto. Cuando
// se gana y la obra se activa, la obra es del proyecto y arrancaba sin
// cronograma: había que rearmar lo que ya se había pensado y firmado. Ahora se
// copia —no se mueve: el presupuesto conserva el suyo, el que se cotizó, para
// compararlo después— y queda del proyecto.
//
// Lo que se decide acá no habla con la base, a propósito: se prueba sin
// navegador. El ir y venir con Supabase está en `cronogramaAObra.js`.

const n = v => Number(v) || 0;
const clave = t => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/^[\d.)\-\s]+/, "").replace(/\s+/g, " ").trim();

// Lo que NO se copia de una barra: quién es, de quién es, y lo que apunta a
// otras filas —eso se reapunta aparte, con los ids nuevos—.
const NO_SE_COPIA = new Set(["id", "created_at", "lead_id", "presupuesto_id", "obra_id", "padre_id", "fase_id", "obra_actividad_id"]);

/** Una barra del presupuesto como fila nueva del proyecto. */
export function barraCopiada(a, { leadId, obraId = null, faseId = null }) {
  const fila = {};
  Object.keys(a || {}).forEach(k => { if (!NO_SE_COPIA.has(k)) fila[k] = a[k]; });
  return { ...fila, lead_id: leadId, obra_id: obraId, fase_id: faseId, padre_id: null, obra_actividad_id: null };
}

/** Una etapa del presupuesto como etapa nueva del proyecto. */
export function etapaCopiada(f, { leadId }) {
  const { id: _i, created_at: _c, presupuesto_id: _p, lead_id: _l, ...resto } = f || {};
  return { ...resto, lead_id: leadId };
}

// El plazo y el calendario: lo que el presupuesto tenga dicho pasa al
// proyecto. Lo que no dijo no se pisa con vacío.
const CAMPOS_PLAZO = ["crono_inicio", "crono_meses", "crono_fin", "crono_laborables", "crono_feriados", "crono_cubre"];
export function plazoCopiado(presupuesto) {
  const fila = {};
  CAMPOS_PLAZO.forEach(k => { if (presupuesto?.[k] != null) fila[k] = presupuesto[k]; });
  return fila;
}

/**
 * De qué agrupación de la obra es cada barra que salió de un capítulo.
 *
 * Al activar la obra las agrupaciones todavía no existen: se arman después,
 * juntando rubros en el control. Por eso no se busca por nombre —"OBRA GRIS"
 * puede terminar repartida en "Estructura" y "Mampostería"— sino por lo que
 * tiene adentro: la barra va con la agrupación que se quedó con más plata de
 * su capítulo. Solo las que todavía no cuelgan de ninguna; lo que alguien
 * enganchó a mano no se toca.
 *
 * @returns [{ id, obra_actividad_id }] lo que hay que guardar
 */
export function enganches(barras = [], rubros = []) {
  const porCapitulo = new Map();
  rubros.forEach(r => {
    if (r.actividad_id == null || r.anulado_por_oc) return;
    const c = clave(r.capitulo);
    if (!c) return;
    const plata = porCapitulo.get(c) || new Map();
    plata.set(r.actividad_id, (plata.get(r.actividad_id) || 0) + n(r.total_base));
    porCapitulo.set(c, plata);
  });
  const salida = [];
  barras.forEach(b => {
    if (b.obra_actividad_id != null || !b.presupuesto_capitulo) return;
    const plata = porCapitulo.get(clave(b.presupuesto_capitulo));
    if (!plata || !plata.size) return;
    const [mejor] = [...plata.entries()].sort((x, y) => y[1] - x[1]);
    salida.push({ id: b.id, obra_actividad_id: mejor[0] });
  });
  return salida;
}
