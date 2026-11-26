// EL PRESUPUESTO Y LA COMPARATIVA QUE EL CLIENTE VE EN SU ENLACE (migración 196).
//
// Hernán, 26/11/2026: «En este caso el dueño del proyecto es dueño del
// presupuesto. Me gustaría poder compartir con él el presupuesto y estas
// comparativas también, a manera informativa, no de edición. Aunque aquí él
// podría también elegir y aprobar presupuesto para que quede constancia del
// armado del presupuesto». Lo que definió: el cliente ve y aprueba; elegir,
// elige la oficina.
//
// La oficina guarda UNA FOTO de lo que decidió mostrarle (a costo o con
// utilidad) y le pide aprobarla: un pedido más del registro de aprobaciones
// (migración 187). Acá están las reglas de lo que viaja al enlace y de lo que
// el cliente puede contestar, sin base, para poder probarlas.
//
// DE LA FOTO VIAJA SOLO LO QUE ESTÁ EN ESTA LISTA. La foto ya se armó sin lo
// que no tenía que ver —con utilidad, el costo no se guarda—, pero lo que sale
// por el enlace no depende de eso: se copia campo por campo, y un campo que
// no esté acá no sale aunque alguien lo haya guardado. Tampoco viaja con qué
// criterio se le compartió (`modo`): es un dato de adentro.

const limpio = t => String(t ?? "").trim();
const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
const numONada = v => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// El día en Ecuador (UTC−5): lo contestado a las nueve de la noche es de ese día.
const diaDeAca = f => {
  const t = new Date(String(f || "")).getTime();
  return Number.isFinite(t) ? new Date(t - 5 * 3600 * 1000).toISOString().slice(0, 10) : null;
};
const lista = v => (Array.isArray(v) ? v : []);
const RESPUESTAS = ["aprobado", "observado"];

/** La foto, como sale por el enlace: copiada campo por campo. Null si no es una foto. */
export function fotoParaMandar(f) {
  if (!f || !Array.isArray(f.capitulos)) return null;
  const t = f.totales || {};
  return {
    conComparativa: !!f.conComparativa,
    presupuesto: { nombre: limpio(f.presupuesto?.nombre) },
    empresas: lista(f.empresas).map(e => ({ id: e?.id ?? null, proveedor: limpio(e?.proveedor), version: num(e?.version) || 1, total: num(e?.total), cubre: num(e?.cubre) })),
    capitulos: f.capitulos.map(c => ({
      numero: limpio(c?.numero), nombre: limpio(c?.nombre), total: num(c?.total),
      empresas: lista(c?.empresas).map(e => ({ id: e?.id ?? null, total: num(e?.total), cubre: num(e?.cubre), faltan: num(e?.faltan), estimado: !!e?.estimado, elegidos: num(e?.elegidos) })),
      rubros: lista(c?.rubros).map(r => ({
        numero: limpio(r?.numero), descripcion: limpio(r?.descripcion), unidad: limpio(r?.unidad),
        cantidad: num(r?.cantidad), unitario: num(r?.unitario), total: num(r?.total), noCotiza: !!r?.noCotiza,
        elegida: r?.elegida ?? null, deQuien: limpio(r?.deQuien) || null, repartido: !!r?.repartido,
        ofertas: lista(r?.ofertas).map(o => ({
          id: o?.id ?? null, unitario: numONada(o?.unitario), cantidad: numONada(o?.cantidad), total: num(o?.total),
          paquete: limpio(o?.paquete) || null, estimado: !!o?.estimado,
        })),
      })),
    })),
    totales: {
      subtotal: num(t.subtotal), honorarios: lista(t.honorarios).map(h => ({ nombre: limpio(h?.nombre), monto: num(h?.monto) })),
      honorarios_monto: num(t.honorarios_monto), iva_pct: num(t.iva_pct), iva: num(t.iva), total: num(t.total),
    },
    elegidos: num(f.elegidos), cotizados: num(f.cotizados),
  };
}

/**
 * Los presupuestos que el cliente tiene para ver, lo último primero.
 *
 * De cada presupuesto se ve UNA foto: la última que se compartió y no se
 * retiró. Si su pedido se retiró, tampoco se ve.
 *
 * @param compartidos  las filas de `presupuesto_compartidos` del proyecto de la llave
 * @param pedidos      las de `aprobaciones_cliente` que piden aprobar esas fotos
 * @returns [{ id, titulo, compartido_el, estado, respondido_el, nota, foto }]
 *          `id` es el del pedido: con él contesta. `estado`: "pendiente" | "aprobado" | "observado"
 */
export function presupuestosDelCliente(compartidos = [], pedidos = []) {
  const vistos = new Set();
  return lista(compartidos).filter(c => c && !c.retirado_at)
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")) || Number(b.id) - Number(a.id))
    .map(c => {
      // Una sola por presupuesto: la más nueva.
      const cual = c.presupuesto_id != null ? `p${c.presupuesto_id}` : `c${c.id}`;
      if (vistos.has(cual)) return null;
      const pedido = lista(pedidos).find(p => p && String(p.presupuesto_compartido_id) === String(c.id) && !p.retirada_at);
      const foto = fotoParaMandar(c.foto);
      if (!pedido || !foto) return null;
      vistos.add(cual);
      return {
        id: pedido.id, titulo: limpio(pedido.titulo) || `Presupuesto: ${foto.presupuesto.nombre}`,
        compartido_el: diaDeAca(c.created_at),
        estado: RESPUESTAS.includes(pedido.respuesta) ? pedido.respuesta : "pendiente",
        respondido_el: pedido.respuesta_at ? diaDeAca(pedido.respuesta_at) : null,
        nota: limpio(pedido.respuesta_nota), foto,
      };
    }).filter(Boolean);
}

/**
 * Lo que el cliente contesta sobre un presupuesto compartido.
 *
 * CONTESTA UNA VEZ, igual que un punto del checklist: con la respuesta puesta
 * ya no hay botones. Si cambió algo, la oficina vuelve a compartir.
 *
 * @param pedido      la fila de `aprobaciones_cliente`, ya filtrada por el proyecto de su llave
 * @param compartido  la de `presupuesto_compartidos` de ese pedido
 * @returns { error, codigo } o { campos, bitacora, aprobado, nota }
 */
export function respuestaDelPresupuesto({ pedido, compartido, conforme, nota = "", ahora = new Date() } = {}) {
  if (!pedido || pedido.presupuesto_compartido_id == null || !compartido) return { error: "No se encontró ese presupuesto.", codigo: 404 };
  if (pedido.retirada_at || compartido.retirado_at) return { error: "Ese presupuesto ya no está esperando tu respuesta: hay una versión más nueva.", codigo: 409 };
  if (RESPUESTAS.includes(pedido.respuesta)) return { error: "Este presupuesto ya tiene tu respuesta.", codigo: 409 };
  const texto = limpio(nota).slice(0, 2000);
  if (!conforme && !texto) return { error: "Contanos qué hay que cambiar.", codigo: 400 };
  const titulo = limpio(pedido.titulo) || "el presupuesto";
  return {
    aprobado: !!conforme, nota: texto,
    campos: { respuesta: conforme ? "aprobado" : "observado", respuesta_at: ahora.toISOString(), respuesta_nota: texto || null },
    bitacora: conforme
      ? `El cliente aprobó "${titulo}" desde su enlace.${texto ? ` Dijo: «${texto}»` : ""}`
      : `El cliente dejó observaciones en "${titulo}" desde su enlace: «${texto}»`,
  };
}

/** El correo que le avisa a la oficina que el cliente contestó. El cuerpo es HTML, con lo escrito escapado. */
export function correoDeLaRespuestaDelPresupuesto({ proyecto = "", titulo = "", aprobado = false, nota = "", app = null } = {}) {
  const color = aprobado ? "#15803D" : "#B45309";
  const cuerpo = `
    <p style="font-size:15px;color:#111827;margin:0 0 4px"><strong>${esc(titulo)}</strong></p>
    <p style="font-size:14px;color:${color};font-weight:600;margin:0 0 10px">${aprobado ? "El cliente lo aprobó desde su enlace." : "El cliente dejó observaciones desde su enlace."}</p>
    ${limpio(nota) ? `<div style="background:#F9FAFB;border-left:3px solid ${color};border-radius:4px;padding:10px 12px;font-size:14px;color:#374151;white-space:pre-line">${esc(limpio(nota))}</div>` : ""}
    <p style="font-size:12.5px;color:#6B7280;margin:14px 0 0">${aprobado
      ? "Quedó en el registro de aprobaciones del proyecto, con el presupuesto y la comparativa tal como los tenía a la vista."
      : "Quedó en el registro de aprobaciones del proyecto. Cuando esté corregido, se le comparte de nuevo desde la matriz de cotizaciones."}</p>
    ${app ? `<p style="margin:16px 0 0"><a href="${esc(app)}" style="display:inline-block;background:#0F3D3E;color:#fff;text-decoration:none;font-size:13px;font-weight:600;padding:9px 16px;border-radius:7px">Abrir FOREMAN</a></p>` : ""}`;
  return { asunto: `${proyecto ? `${proyecto} · ` : ""}el cliente ${aprobado ? "aprobó" : "dejó observaciones en"} «${titulo}»`, cuerpo };
}
