import { supabase } from "../../lib/supabase";
import { enlacesFirmados } from "../../lib/enlacesFirmados";
import { subirArchivo } from "../../lib/archivos";

// Las actas de reunión de obra.
//
// Un acta vale como prueba: junto con el libro de obra es lo que se pone sobre
// la mesa cuando hay que justificar un atraso, una orden de cambio o un
// trabajo que nadie quiere pagar. Y lo que la hace servir es una sola cosa:
// que cada compromiso tenga dueño y fecha, y que la siguiente reunión los
// traiga de vuelta y diga qué pasó con cada uno.
//
// Por eso acá el compromiso no es una línea de texto adentro de un documento:
// es una fila con responsable, fecha y estado, que se arrastra de un acta a la
// siguiente. Un acta que solo narra lo que se dijo no se puede usar para nada.

const falta = e => /relation|column|does not exist|schema cache/i.test(e?.message || "");
export const SIN_106 = "Falta correr la migración 106 para usar las actas de reunión.";

export const ESTADOS = {
  borrador: { label: "Borrador", pista: "Se está escribiendo. Nadie la vio todavía." },
  // PEDIR EL VISTO. Quien escribe el acta no la aprueba, pero tiene que poder
  // decir que terminó: sin eso el acta queda en borrador para siempre y el
  // director se entera porque alguien se acuerda de avisarle por teléfono.
  lista: { label: "Lista para revisar", pista: "El que la escribió terminó y pidió el visto." },
  revisada: { label: "Revisada", pista: "El director le dio el visto. Lista para enviar." },
  enviada:  { label: "Enviada",  pista: "Salió a los correos. No se toca más." },
};

export const ESTADO_COMPROMISO = {
  pendiente:    { label: "Pendiente" },
  cumplido:     { label: "Cumplido" },
  reprogramado: { label: "Reprogramado" },
  anulado:      { label: "Ya no aplica" },
};

export async function actasDe(leadId) {
  if (!leadId) return { actas: [], sinTablas: false };
  const { data, error } = await supabase.from("obra_actas")
    .select("*").eq("lead_id", leadId).order("numero", { ascending: false });
  if (error) return { actas: [], sinTablas: falta(error) };
  return { actas: data || [], sinTablas: false };
}

export async function contenidoDe(actaId) {
  const [a, t, c, f, adj] = await Promise.all([
    supabase.from("acta_asistentes").select("*").eq("acta_id", actaId).order("orden"),
    supabase.from("acta_temas").select("*").eq("acta_id", actaId).order("orden"),
    supabase.from("acta_compromisos").select("*").eq("acta_id", actaId).order("orden"),
    supabase.from("acta_fotos").select("*").eq("acta_id", actaId).order("orden"),
    supabase.from("acta_adjuntos").select("*").eq("acta_id", actaId).order("orden"),
  ]);
  return {
    asistentes: a.data || [], temas: t.data || [],
    compromisos: c.data || [], fotos: f.data || [], adjuntos: adj.data || [],
  };
}

export async function convocadosDe(leadId) {
  const { data } = await supabase.from("obra_convocados")
    .select("*").eq("lead_id", leadId).eq("activo", true).order("orden");
  return data || [];
}

export async function guardarConvocado(fila) {
  // Lo mismo que arriba: `lead_id` es obligatorio y un upsert sin él no llega
  // a actualizar nada.
  const { id, ...campos } = fila;
  const q = id
    ? supabase.from("obra_convocados").update(campos).eq("id", id)
    : supabase.from("obra_convocados").insert(campos);
  const { data, error } = await q.select().single();
  if (error) return { error: falta(error) ? SIN_106 : error.message };
  return { convocado: data };
}

export async function borrarConvocado(id) {
  const { error } = await supabase.from("obra_convocados").update({ activo: false }).eq("id", id);
  return error ? error.message : null;
}

/**
 * ABRIR UNA REUNIÓN NUEVA, CON LO QUE QUEDÓ PENDIENTE ADENTRO.
 *
 * Es lo que convierte las actas en una cadena. La reunión no empieza con una
 * hoja en blanco: empieza con los compromisos que la anterior dejó abiertos,
 * cada uno apuntando al que lo originó. Lo primero que se hace en una reunión
 * de obra es repasarlos, y eso es lo que la pantalla pone primero.
 *
 * Y con los convocados de siempre ya cargados: escribir ocho nombres y ocho
 * correos en cada reunión es lo que hace que a la tercera acta alguien deje de
 * llevarlas.
 */
export async function abrirActa({ leadId, obraId, fecha, quien }) {
  const { data: ultimas } = await supabase.from("obra_actas")
    .select("id,numero").eq("lead_id", leadId).order("numero", { ascending: false }).limit(1);
  const numero = (ultimas?.[0]?.numero || 0) + 1;
  const anterior = ultimas?.[0]?.id || null;

  const { data: acta, error } = await supabase.from("obra_actas").insert({
    lead_id: leadId, obra_id: obraId || null, numero,
    fecha: fecha || new Date().toISOString().slice(0, 10),
    creado_por: quien?.id ?? null, creado_nombre: quien?.name || null,
  }).select().single();
  if (error) return { error: falta(error) ? SIN_106 : error.message };

  // Los convocados de siempre, marcados como que vinieron: en la reunión se
  // destilda a los que faltaron, que son menos.
  const convocados = await convocadosDe(leadId);
  if (convocados.length) {
    await supabase.from("acta_asistentes").insert(convocados.map((c, i) => ({
      acta_id: acta.id, nombre: c.nombre, empresa: c.empresa, cargo: c.cargo,
      email: c.email, asistio: true, recibe: !!c.email, orden: i,
    })));
  }

  // Lo que quedó abierto en la reunión anterior.
  let arrastrados = 0;
  if (anterior) {
    const { data: abiertos } = await supabase.from("acta_compromisos")
      .select("*").eq("acta_id", anterior).in("estado", ["pendiente", "reprogramado"]).order("orden");
    if (abiertos?.length) {
      await supabase.from("acta_compromisos").insert(abiertos.map((c, i) => ({
        acta_id: acta.id, texto: c.texto,
        responsable_nombre: c.responsable_nombre, responsable_email: c.responsable_email,
        fecha_limite: c.fecha_limite, estado: "pendiente",
        // Lo urgente sigue siendo urgente en la reunión siguiente: si no se
        // hizo y paraba la obra, ahora para más.
        urgente: !!c.urgente,
        viene_de: c.viene_de || c.id, orden: i,
      })));
      arrastrados = abiertos.length;
    }
  }
  return { acta, arrastrados, convocados: convocados.length };
}

export async function guardarActa(id, campos) {
  const { data, error } = await supabase.from("obra_actas").update(campos).eq("id", id).select("id");
  if (error) return falta(error) ? SIN_106 : error.message;
  if (!data?.length) return "La base no dejó guardar el acta.";
  return null;
}

export async function borrarActa(id) {
  const { error } = await supabase.from("obra_actas").delete().eq("id", id);
  return error ? error.message : null;
}

/**
 * Una fila de cualquiera de las listas del acta.
 *
 * CON ID SE ACTUALIZA; SIN ID SE INSERTA. Antes era `upsert` para los dos
 * casos, y ahí estaba el error que hacía que los correos no se guardaran.
 *
 * Un upsert es un INSERT que, si choca con la clave, actualiza. Pero la fila
 * que se intenta insertar se arma ENTERA antes de descubrir el choque, y se le
 * revisan las reglas de la tabla en ese momento: `acta_id` es obligatorio, y
 * al mandar solo el id y el correo, la fila provisoria no lo tiene. La base la
 * rechaza antes de llegar a actualizar nada. El resultado desde afuera es que
 * se escribe un correo, se guarda, y no queda.
 *
 * Un UPDATE no arma ninguna fila nueva: toca las columnas que se le dan y deja
 * el resto como está, que es exactamente lo que hace falta acá.
 */
export async function guardarFila(tabla, fila) {
  const { id, ...campos } = fila;
  if (id) {
    const { data, error } = await supabase.from(tabla).update(campos).eq("id", id).select().single();
    if (error) return { error: falta(error) ? SIN_106 : error.message };
    if (!data) return { error: "La base no dejó guardar ese renglón." };
    return { fila: data };
  }
  const { data, error } = await supabase.from(tabla).insert(campos).select().single();
  if (error) return { error: falta(error) ? SIN_106 : error.message };
  return { fila: data };
}

export async function borrarFila(tabla, id) {
  const { error } = await supabase.from(tabla).delete().eq("id", id);
  return error ? error.message : null;
}

export async function subirFoto({ actaId, file, descripcion, quien, orden = 0 }) {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const ruta = `acta-${actaId}/${Date.now()}-${safe}`;
  const { error } = await subirArchivo(ruta, file);
  if (error) return { error: error.message };
  const { data, error: e2 } = await supabase.from("acta_fotos").insert({
    acta_id: actaId, storage_path: ruta, descripcion: descripcion || null,
    orden, autor_id: quien?.id ?? null, autor_nombre: quien?.name || null,
  }).select().single();
  if (e2) return { error: e2.message };
  return { foto: data };
}

/**
 * Un anexo: el plano sobre el que se decidió, la proforma que se discutió.
 *
 * Aparte de las fotos porque se usan distinto: una foto se mira, un anexo se
 * abre y se guarda. Un acta que dice "se aprueba según el plano presentado" y
 * no lleva el plano no sirve tres meses después — nadie va a poder decir CUÁL
 * plano.
 */
export async function subirAdjunto({ actaId, file, quien, orden = 0 }) {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const ruta = `acta-${actaId}/anexos/${Date.now()}-${safe}`;
  const { error } = await subirArchivo(ruta, file);
  if (error) return { error: error.message };
  const { data, error: e2 } = await supabase.from("acta_adjuntos").insert({
    acta_id: actaId, storage_path: ruta, nombre: file.name.slice(0, 160),
    tipo: file.type || null, bytes: file.size || null, orden,
    autor_id: quien?.id ?? null, autor_nombre: quien?.name || null,
  }).select().single();
  if (e2) return { error: falta(e2) ? "Falta correr la migración 109 para adjuntar archivos." : e2.message };
  return { adjunto: data };
}

export async function enlacesDeFotos(fotos = []) {
  return enlacesFirmados(fotos);
}

export { correosDe } from "./correos";

// ── LA CONFORMIDAD DE CADA ASISTENTE ───────────────────────────────────────
//
// El acta sale por correo con un enlace propio para cada uno: lo abre, la lee
// y da conformidad —o escribe qué no refleja lo acordado—. Eso es lo que
// convierte un envío en una firma. Antes, el que estaba de acuerdo no hacía
// nada y el silencio no se distinguía de "no la leyó".
//
// La llave la crea el servidor al mandar el acta. Acá se crea también a pedido,
// para el caso que igual pasa: alguien no tiene correo, o lo tiene y no lo
// mira, y hay que mandarle el enlace por WhatsApp.

/** La llave de este asistente. Si no tiene, se le crea una y no cambia más. */
export async function llaveDeAsistente(asistente) {
  if (asistente?.token) return { token: asistente.token };
  if (!asistente?.id) return { error: "Guardá el asistente antes de generar su enlace." };
  const token = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
  const { error } = await supabase.from("acta_asistentes").update({ token }).eq("id", asistente.id);
  if (error) {
    return { error: /token/i.test(error.message)
      ? "Falta correr la migración 111 (la conformidad de los asistentes)."
      : error.message };
  }
  return { token };
}

export const enlaceDeFirma = token => `${window.location.origin}/?acta=${token}`;

/**
 * En qué quedó cada uno. Tres estados que no son lo mismo y en una discusión
 * se confunden: no la abrió, la abrió y no dijo nada, y dijo algo.
 */
export function conformidadDe(a) {
  if (a?.conforme_at) return { estado: "conforme", cuando: a.conforme_at };
  if (a?.observacion) return { estado: "observacion", cuando: a.observacion_at, texto: a.observacion };
  if (a?.visto_at) return { estado: "visto", cuando: a.visto_at };
  return { estado: "nada" };
}
