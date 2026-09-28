import { supabase } from "../../lib/supabase";

// La vida de un presupuesto: se arma, se manda, contestan.
//
// Mientras es borrador se toca con libertad. Al mandarlo queda congelado: lo
// que está en manos del cliente tiene que poder mirarse igual dentro de un
// año, y si hay que cambiar algo nace la versión siguiente. Aprobado o no, la
// respuesta también queda con su fecha, que es lo que después contesta "¿qué
// le mandamos y qué nos dijeron?".

export const ESTADOS = {
  borrador:    { label: "Borrador",     color: "muted",   ayuda: "Se está armando. Se puede tocar todo." },
  enviado:     { label: "Enviado",      color: "ink",     ayuda: "Está en manos del cliente: queda como salió." },
  aprobado:    { label: "Aprobado",     color: "success", ayuda: "El cliente lo aprobó. De este sale la obra." },
  no_aprobado: { label: "No aprobado",  color: "danger",  ayuda: "El cliente no lo tomó. Queda de referencia." },
};

export const estadoDe = p => (ESTADOS[p?.estado] ? p.estado : "borrador");

/** Un presupuesto que ya salió no se toca: los cambios van en otra versión. */
export const congelado = p => estadoDe(p) !== "borrador" || !!p?.archivado_at;

export const fecha = f => (f ? new Date(f).toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" }) : "");

/**
 * Cambia el estado y deja la fecha de lo que pasó.
 * @returns null si se guardó, o el mensaje del error
 */
export async function cambiarEstado(presupuestoId, estado, datos = {}) {
  const ahora = new Date().toISOString();
  const campos = { estado };
  if (estado === "enviado") {
    campos.enviado_at = datos.enviado_at || ahora;
    campos.enviado_a = datos.enviado_a || null;
    campos.enviado_por = datos.enviado_por || null;
    campos.decidido_at = null;
    campos.decision_nota = null;
  } else if (estado === "aprobado" || estado === "no_aprobado") {
    campos.decidido_at = ahora;
    campos.decision_nota = datos.nota || null;
  } else if (estado === "borrador") {
    campos.enviado_at = null; campos.enviado_a = null; campos.decidido_at = null; campos.decision_nota = null;
  }
  const { error } = await supabase.from("presupuestos").update(campos).eq("id", presupuestoId);
  if (error) {
    // Sin la migración 034 no están las fechas: al menos se guarda el estado.
    if (/column|schema cache|does not exist/i.test(error.message)) {
      const { error: e2 } = await supabase.from("presupuestos").update({ estado }).eq("id", presupuestoId);
      return e2 ? e2.message : "sin_fechas";
    }
    return error.message;
  }
  return null;
}

// ── Quién lo está trabajando ───────────────────────────────────────────────
// Aviso, no candado: la marca se vence sola a los diez minutos, porque alguien
// deja la pantalla abierta y se va, y nadie más puede quedarse esperando.

const VIGENCIA = 10 * 60 * 1000;

export async function anotarPresencia(presupuestoId, usuario) {
  if (!presupuestoId || !usuario?.id) return;
  await supabase.from("presupuesto_presencia")
    .upsert({ presupuesto_id: presupuestoId, usuario_id: usuario.id, nombre: usuario.name || usuario.nombre || "Alguien", visto_at: new Date().toISOString() },
      { onConflict: "presupuesto_id,usuario_id" });
}

export async function soltarPresencia(presupuestoId, usuario) {
  if (!presupuestoId || !usuario?.id) return;
  await supabase.from("presupuesto_presencia").delete().eq("presupuesto_id", presupuestoId).eq("usuario_id", usuario.id);
}

/**
 * Quién lo está trabajando y quién solo lo mira.
 *
 * Manda quien llegó primero y sigue ahí. Antes esto era un candado que se
 * cerraba para los dos: cada uno veía al otro como "el otro" y nadie podía
 * tocar nada. El control se suelta al salir del presupuesto —o cuando el
 * Director lo toma—, no se negocia por chat.
 *
 * @returns { manda, otros } · `manda` es la fila de quien tiene el control.
 */
export async function quienTrabaja(presupuestoId, usuario) {
  const { data, error } = await supabase.from("presupuesto_presencia")
    .select("*").eq("presupuesto_id", presupuestoId);
  if (error) return { manda: null, otros: [] };
  const desde = Date.now() - VIGENCIA;
  const vivos = (data || []).filter(p => new Date(p.visto_at).getTime() > desde);
  // Por orden de llegada. Sin la migración 050 no hay `desde_at`: entonces
  // manda el de menor id, que es arbitrario pero estable —lo que no puede
  // pasar es que el control salte de uno a otro cada minuto—.
  const enOrden = [...vivos].sort((a, b) => (a.desde_at && b.desde_at
    ? new Date(a.desde_at) - new Date(b.desde_at)
    : a.usuario_id - b.usuario_id));
  return { manda: enOrden[0] || null, otros: enOrden.filter(p => p.usuario_id !== usuario?.id) };
}

/**
 * El Director toma el control: los demás pasan a mirar.
 *
 * Se borra la presencia de los otros, así que en su próximo latido vuelven a
 * entrar —detrás de quien acaba de tomarlo— y su pantalla pasa a solo lectura
 * sola, sin que nadie tenga que avisarles por WhatsApp.
 */
export async function tomarControl(presupuestoId, usuario) {
  if (!presupuestoId || !usuario?.id) return "Falta el presupuesto";
  await anotarPresencia(presupuestoId, usuario);
  const { error } = await supabase.from("presupuesto_presencia")
    .delete().eq("presupuesto_id", presupuestoId).neq("usuario_id", usuario.id);
  return error ? error.message : null;
}

/** Los otros que lo están mirando ahora. */
export async function otrosEnElPresupuesto(presupuestoId, usuario) {
  const { data, error } = await supabase.from("presupuesto_presencia")
    .select("usuario_id,nombre,visto_at").eq("presupuesto_id", presupuestoId);
  if (error) return [];
  const desde = Date.now() - VIGENCIA;
  return (data || []).filter(p => p.usuario_id !== usuario?.id && new Date(p.visto_at).getTime() > desde);
}
