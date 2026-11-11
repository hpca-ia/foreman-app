import { supabase } from "./supabase";
import { cuadreConElPresupuesto } from "../modules/controlObra/cuadreConElPresupuesto.js";
import { cuadreDeOrdenes } from "../modules/controlObra/cuadreDeOrdenes.js";
import { leReboto } from "../modules/controlObra/entregaDeOrdenes.js";
import { ordenesEsperando } from "../modules/leads/enMarcha.js";
import { hoyISO, diasEntre } from "../modules/leads/pipeline.js";
import { vencidos, sinRepartir } from "../modules/actas/compromisos.js";

// LO QUE LOS MÓDULOS TIENEN PARA AVISAR.
//
// El panel de Avisos del tablero junta lo activo de todo FOREMAN. Acá se trae
// lo que no está ya en la pantalla —órdenes de cambio, actas, y las dos
// revisiones de Control— y se le pregunta a cada módulo con SU PROPIA regla:
// las mismas funciones que pintan la alarma adentro de Control de Obra. El
// panel no decide qué está mal; solo lo trae a la vista.
//
// Va después de dibujar el tablero y nunca lo traba: si una consulta falla,
// ese aviso no aparece y lo demás sigue.

const filas = async consulta => { try { const { data, error } = await consulta; return error ? [] : data || []; } catch { return []; } };
const de = (lista, campo, id) => lista.filter(x => String(x[campo]) === String(id));

/**
 * @param obras    las obras a las que entra esta persona: [{ id, nombre, lead_id, presupuesto_id }]
 * @param conActas si ve las actas
 * @returns { ordenes: { cuantas, dias, vencidas, objetadas }, rebotadas, alquileres,
 *            noCuadran: [nombre de obra], ordenesMal: { cuantas, obras },
 *            actas, actasSinRepartir }
 */
export async function cargarAvisosDeModulos({ obras = [], conActas = false } = {}) {
  const hoy = hoyISO();
  const vacio = { ordenes: { cuantas: 0, dias: 0, vencidas: 0, objetadas: 0 }, rebotadas: 0, alquileres: 0, noCuadran: [], ordenesMal: { cuantas: 0, obras: [] }, actas: 0, actasSinRepartir: 0 };
  const r = { ...vacio };

  if (conActas) {
    // Los compromisos que pasaron su fecha y nadie cerró. SE CUENTAN LOS VIVOS:
    // cada reunión copia los pendientes de la anterior, y contar todas las
    // filas «pendientes» cuenta el mismo compromiso una vez por reunión. Así
    // salió un aviso de 37 vencidos cuando había 9.
    const [compromisos, actas] = await Promise.all([
      filas(supabase.from("acta_compromisos").select("id,acta_id,viene_de,estado,fecha_limite,asignado_a,tercero,tarea_id")),
      filas(supabase.from("obra_actas").select("id,numero")),
    ]);
    r.actas = vencidos(compromisos, actas, hoy).length;
    r.actasSinRepartir = sinRepartir(compromisos, actas).length;
  }
  if (!obras.length) return r;

  const ids = obras.map(o => o.id);
  const ordenes = await filas(supabase.from("ordenes_cambio").select("*").in("obra_id", ids));
  const vivas = ordenes.filter(o => !o.anulada);
  const idsDeOrdenes = vivas.map(o => o.id);
  const [aprobaciones, lineas, rubros] = await Promise.all([
    idsDeOrdenes.length ? filas(supabase.from("orden_cambio_aprobaciones").select("*").in("orden_id", idsDeOrdenes)) : [],
    idsDeOrdenes.length ? filas(supabase.from("orden_cambio_lineas").select("*").in("orden_id", idsDeOrdenes)) : [],
    filas(supabase.from("obra_rubros").select("*").in("obra_id", ids)),
  ]);

  // Las que el cliente todavía no firma, y los correos que rebotaron.
  r.ordenes = ordenesEsperando(vivas, aprobaciones, hoy);
  const esperando = new Set(vivas.filter(o => o.estado === "enviada" && !o.reemplazada_at).map(o => String(o.id)));
  r.rebotadas = aprobaciones.filter(a => esperando.has(String(a.orden_id)) && leReboto(a)).length;
  // Lo alquilado que se pasa de plazo: avisa tres días antes y todos los días después.
  r.alquileres = vivas.filter(o => o.cubre_hasta && !o.cubre_cerrado_at && diasEntre(hoy, o.cubre_hasta) <= 3).length;

  // Las dos revisiones de Control, con las reglas de Control.
  const presupuestoIds = obras.map(o => o.presupuesto_id).filter(Boolean);
  const [presupuestos, items] = presupuestoIds.length ? await Promise.all([
    filas(supabase.from("presupuestos").select("*").in("id", presupuestoIds)),
    filas(supabase.from("presupuesto_items").select("id,presupuesto_id,total,descripcion,capitulo").in("presupuesto_id", presupuestoIds)),
  ]) : [[], []];

  for (const obra of obras) {
    const suyos = de(rubros, "obra_id", obra.id);
    const presupuesto = presupuestos.find(p => String(p.id) === String(obra.presupuesto_id)) || null;
    if (presupuesto) {
      // ¿El control sigue diciendo lo mismo que el presupuesto que se firmó?
      const c = cuadreConElPresupuesto({ rubros: suyos, presupuesto, items: de(items, "presupuesto_id", presupuesto.id) });
      if (c?.hay && !c.cuadra) r.noCuadran = [...r.noCuadran, obra.nombre];
    }
    // ¿Cada orden aprobada entró al control por lo que dice su documento?
    const susOrdenes = de(vivas, "obra_id", obra.id);
    const lineasPorOrden = {};
    lineas.forEach(l => { if (susOrdenes.some(o => String(o.id) === String(l.orden_id))) (lineasPorOrden[l.orden_id] = lineasPorOrden[l.orden_id] || []).push(l); });
    const cuadre = cuadreDeOrdenes({
      ordenes: susOrdenes, lineasPorOrden, rubrosDeOrdenes: suyos.filter(x => x.orden_cambio_id), obra,
      iva: Number(suyos.find(x => x.iva_pct != null)?.iva_pct) || 0,
    });
    if (cuadre?.mal?.length) r.ordenesMal = { cuantas: r.ordenesMal.cuantas + cuadre.mal.length, obras: [...r.ordenesMal.obras, obra.nombre] };
  }
  return r;
}
