// EL CRONOGRAMA DE UNA OBRA QUE TODAVÍA NO ES OBRA.
//
// El presupuesto se entrega con un cronograma, y ese cronograma se arma antes
// de que exista la obra en el control: no hay agrupaciones ni rubros
// congelados, solo el presupuesto que se está trabajando. Sin esto NOVA
// armaba "por lo que sabés del tipo de obra", que es adivinar, teniendo al
// lado un presupuesto con todos los metros.
//
// Lo que se le da a NOVA es lo mismo que le da una obra activa —nombre, plata,
// tamaño y rubros gruesos— con el CAPÍTULO haciendo de agrupación: es la única
// forma de juntar rubros que tiene un presupuesto, y es la que usa quien lo
// armó para pensarlo.
//
// Sin base de datos a propósito: se prueba sin navegador.

import { magnitudes, UNIDAD } from "./magnitudes.js";
import { esNoCotiza } from "../presupuestos/estructura.js";

const n = v => Number(v) || 0;
const r2 = v => Math.round(v * 100) / 100;

/**
 * Los capítulos de un presupuesto con la forma de las agrupaciones de una obra.
 *
 * Los ids son el puesto del capítulo (1, 2, 3…): NOVA los usa para decir de
 * dónde sale cada trabajo, y `capituloDe` los vuelve a convertir en nombre.
 * No son ids de la base y no se guardan como tales.
 *
 * QUÉ NO ENTRA: lo que el presupuesto dice que no se cotiza. Lo hace otro, y
 * planificarlo sería prometer un trabajo que no es nuestro.
 *
 * La plata va con IVA, igual que cuando la obra se activa: así el número que
 * ve NOVA es el mismo que va a ver el control.
 */
export function capitulosComoAgrupaciones(items = [], ivaPct = 0) {
  const porCap = new Map();
  (items || []).forEach(i => {
    if (esNoCotiza(i)) return;
    const cap = String(i?.capitulo || "").trim() || "SIN CAPÍTULO";
    if (!porCap.has(cap)) porCap.set(cap, { nombre: cap, primero: n(i?.orden), rubros: [] });
    const c = porCap.get(cap);
    c.primero = Math.min(c.primero, n(i?.orden));
    c.rubros.push(i);
  });
  const iva = 1 + n(ivaPct) / 100;
  return [...porCap.values()]
    .sort((a, b) => a.primero - b.primero)
    .map((c, k) => ({
      id: k + 1,
      nombre: c.nombre,
      orden: k,
      monto: r2(c.rubros.reduce((s, r) => s + n(r.total), 0) * iva),
      rubros: c.rubros.length,
      magnitud: magnitudes(c.rubros),
      principales: [...c.rubros].sort((x, y) => n(y.total) - n(x.total)).slice(0, 4)
        .filter(r => n(r.cantidad))
        .map(r => ({
          descripcion: String(r.descripcion || "").trim().slice(0, 52),
          cantidad: r2(n(r.cantidad)),
          unidad: UNIDAD(r.unidad),
        })),
    }))
    // Un capítulo sin plata ni cantidades es un título: no hay trabajo que medir.
    .filter(c => c.monto > 0 || c.magnitud.length);
}

/**
 * El plan que devolvió NOVA, con el capítulo escrito en vez del id.
 *
 * La barra no puede colgar de una agrupación que no existe: en la base
 * `obra_actividad_id` apunta al control, y un número inventado ahí lo leería
 * como una agrupación borrada. Se guarda el NOMBRE del capítulo y la plata,
 * que es lo que sirve para reconocerla cuando la obra se active.
 */
export function planDelPresupuesto(plan, agrupaciones = []) {
  const porId = new Map(agrupaciones.map(a => [Number(a.id), a]));
  return {
    ...plan,
    etapas: (plan?.etapas || []).map(e => ({
      ...e,
      actividades: e.actividades.map(a => {
        const g = a.agrupacion == null ? null : porId.get(Number(a.agrupacion));
        return { ...a, agrupacion: null, capitulo: g?.nombre || null, monto: g ? g.monto : null };
      }),
    })),
  };
}

/**
 * De qué presupuesto sale el cronograma, si el proyecto tiene varios.
 *
 * El aprobado manda: es el que se va a construir. Si no hay, el más nuevo,
 * que es el que se está trabajando. Los archivados no: son historia.
 */
export function presupuestoDeReferencia(presupuestos = []) {
  const vivos = (presupuestos || []).filter(p => !p?.archivado_at);
  if (!vivos.length) return null;
  const fecha = p => String(p?.created_at || "");
  const recientes = [...vivos].sort((a, b) => fecha(b).localeCompare(fecha(a)));
  return recientes.find(p => p.estado === "aprobado") || recientes[0];
}
