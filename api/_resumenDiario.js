// El resumen diario, armado y mandado. Lo usan el reloj de la mañana y el botón
// de prueba de Ajustes, para que los dos manden exactamente lo mismo.

import { rest } from "./_supabase.js";
import { enviarCorreo, plantilla, esc } from "./_correo.js";
import { json, traer } from "./_pipeline.js";
import { armarResumen, hoyISO } from "./_resumen.js";
import { avisosDelPipeline } from "./_avisosDelPipeline.js";
import { vencidos as compromisosVencidos } from "./_compromisos.js";

const COLOR = { gestion: "#B45309", tarea: "#0F3D3E", reunion: "#6D28D9" };
const NOMBRE = { gestion: "Gestión", tarea: "Tarea", reunion: "Reunión" };
const APP = "https://foreman-app-ebon.vercel.app";

const dia = f => (f ? new Date(`${f}T12:00:00`).toLocaleDateString("es-EC", { day: "numeric", month: "short" }) : "sin fecha");

const linea = t => `<div style="font-size:13px;color:#374151;padding:3px 0">
  <span style="font-size:10px;font-weight:700;color:${COLOR[t.clase]}">${NOMBRE[t.clase].toUpperCase()}</span>
  ${esc(t.title)}
  <span style="color:#9CA3AF">· ${esc(t.proyecto || "sin proyecto")}${t.hora ? ` · ${esc(t.hora)}` : ""}${t.due_date ? ` · ${dia(t.due_date)}` : ""}</span>
</div>`;

const bloque = (titulo, color, filas) => (filas.length
  ? `<div style="font-size:11px;font-weight:700;color:${color};letter-spacing:.4px;margin:14px 0 4px">${titulo}</div>${filas.map(linea).join("")}`
  : "");



/**
 * LAS ÓRDENES DE CAMBIO QUE EL CLIENTE NO FIRMA.
 *
 * Es plata nuestra parada en la casilla de otro. Una orden enviada y sin
 * aprobar es trabajo que no se ejecuta —o peor, trabajo ya ejecutado que nadie
 * se comprometió a pagar— y lo que pasa es que nadie se acuerda de insistir:
 * el residente la mandó hace tres semanas y ahí quedó.
 *
 * Va en el correo de la mañana de quien puede hacer algo al respecto, porque
 * insistir es la mitad del trabajo de cobrar un adicional. La lista completa,
 * con el botón para insistir, está en Órdenes de cambio de cada obra.
 */
async function ordenesSinFirmar() {
  const ordenes = await json(await rest(
    "ordenes_cambio?estado=eq.enviada&anulada=not.is.true&select=id,numero,codigo,titulo,obra_id,enviada_at,fecha,fecha_limite_aprobacion"));
  if (!ordenes?.length) return [];
  const ids = ordenes.map(o => o.id).join(",");
  const [firmas, lineas, obras] = await Promise.all([
    json(await rest(`orden_cambio_aprobaciones?orden_id=in.(${ids})&select=orden_id,nombre,email,aprobado_at,observacion,envio_at,visto_at`)),
    json(await rest(`orden_cambio_lineas?orden_id=in.(${ids})&select=orden_id,tipo,cantidad,precio_unitario`)),
    json(await rest(`obras?id=in.(${[...new Set(ordenes.map(o => o.obra_id).filter(Boolean))].join(",") || 0})&select=id,nombre`)),
  ]);
  const hoy = hoyISO();
  const dias = desde => {
    const d = String(desde || "").slice(0, 10);
    if (!d) return 0;
    return Math.max(0, Math.round((new Date(`${hoy}T12:00:00`) - new Date(`${d}T12:00:00`)) / 86400000));
  };
  return ordenes.map(o => {
    const suyas = (firmas || []).filter(f => f.orden_id === o.id);
    const faltan = suyas.filter(f => !f.aprobado_at && !f.observacion);
    const firmaron = suyas.filter(f => f.aprobado_at);
    const objetaron = suyas.filter(f => !f.aprobado_at && f.observacion);
    const monto = (lineas || []).filter(l => l.orden_id === o.id)
      .reduce((t, l) => t + (l.tipo === "quita" ? -1 : 1) * (Number(l.cantidad) || 0) * (Number(l.precio_unitario) || 0), 0);
    const envio = suyas.map(f => String(f.envio_at || "").slice(0, 10)).filter(Boolean).sort()[0];
    return {
      o, monto, faltan, objetaron, firmaron,
      obra: (obras || []).find(x => x.id === o.obra_id)?.nombre || "",
      dias: dias(envio || o.enviada_at || o.fecha),
      vencida: !!(o.fecha_limite_aprobacion && String(o.fecha_limite_aprobacion).slice(0, 10) < hoy),
    };
  })
    .filter(p => p.faltan.length || p.objetaron.length)
    .sort((a2, b2) => (a2.vencida === b2.vencida ? b2.dias - a2.dias : a2.vencida ? -1 : 1));
}

/**
 * EL PIPELINE: A QUIÉN HAY QUE INSISTIRLE, Y QUÉ LEAD SE QUEDÓ SIN PASO.
 *
 * Un lead que espera al cliente no tiene nada que hacer hasta el día en que se
 * dijo «recordámelo». Ese día sale acá, con hace cuánto espera. Y el que no
 * tiene próximo paso ni espera sale también, porque es el que se pierde sin
 * que nadie lo decida. Es la misma lista del panel de Avisos del tablero.
 */
const bloqueDelPipeline = lista => (lista.length ? `
  <div style="font-size:11px;font-weight:700;color:#0F3D3E;letter-spacing:.4px;margin:20px 0 6px">
    PIPELINE · ${lista.length}
  </div>
  ${lista.slice(0, 10).map(a => `<div style="font-size:13px;color:#374151;padding:3px 0">
    <strong>${esc(a.nombre)}</strong>
    <span style="color:${a.clase === "insistir" ? "#B91C1C" : "#B45309"}">· ${esc(a.texto)}</span>
  </div>`).join("")}
  ${lista.length > 10 ? `<div style="font-size:11.5px;color:#9CA3AF;margin-top:4px">…y ${lista.length - 10} más.</div>` : ""}
  <div style="font-size:11.5px;color:#6B7280;margin-top:5px">
    En el Pipeline, cada lead tiene sus tres salidas de un toque: ya respondió, insistí hoy, o recordarme otro día.
  </div>` : "");

/**
 * LO QUE ESPERÁS DE OTROS: lo que encargaste y ya pasó su fecha.
 *
 * No es trabajo tuyo de hoy, pero es lo que hay que reclamar. Lo que está en
 * fecha se cuenta y no se lista: eso va bien.
 */
const bloqueDeEspero = lista => {
  const vencidas = lista.filter(t => t.vencida);
  if (!vencidas.length) return "";
  const enFecha = lista.length - vencidas.length;
  return `
  <div style="font-size:11px;font-weight:700;color:#B45309;letter-spacing:.4px;margin:20px 0 6px">
    ESPERÁS DE OTROS · ${vencidas.length} ${vencidas.length === 1 ? "vencida" : "vencidas"}
  </div>
  ${vencidas.slice(0, 8).map(t => `<div style="font-size:13px;color:#374151;padding:3px 0">
    ${esc(t.title)}
    <span style="color:#9CA3AF">· ${esc(t.proyecto || "sin proyecto")}</span>
    <span style="color:#B91C1C">· ${esc(t.persona || "sin responsable")} · ${dia(t.due_date)}</span>
  </div>`).join("")}
  ${vencidas.length > 8 ? `<div style="font-size:11.5px;color:#9CA3AF;margin-top:4px">…y ${vencidas.length - 8} más.</div>` : ""}
  ${enFecha ? `<div style="font-size:11.5px;color:#6B7280;margin-top:5px">Además le encargaste ${enFecha} ${enFecha === 1 ? "cosa que va en fecha" : "cosas que van en fecha"}.</div>` : ""}`;
};

/**
 * LAS COMPRAS, EN SU RENGLÓN.
 *
 * Una compra no es una tarea: se sigue en Compras. Acá va cuántas tiene esta
 * persona esperando en cada paso, que es lo que antes llegaba como diez tareas
 * «Aprobar compra…», «Comprar…», «Recibir…» mezcladas con lo atrasado.
 */
const bloqueDeCompras = c => {
  if (!c?.total) return "";
  const partes = [
    c.visto && `${c.visto} ${c.visto === 1 ? "espera tu visto" : "esperan tu visto"}`,
    c.devueltas && `${c.devueltas} ${c.devueltas === 1 ? "devuelta" : "devueltas"}`,
    c.comprar && `${c.comprar} por comprar`,
    c.recibir && `${c.recibir} por recibir`,
  ].filter(Boolean);
  return `
  <div style="font-size:11px;font-weight:700;color:#A16207;letter-spacing:.4px;margin:20px 0 6px">COMPRAS · ${c.total}</div>
  <div style="font-size:13px;color:#374151;padding:3px 0">${esc(partes.join(" · "))}</div>
  <div style="font-size:11.5px;color:#6B7280;margin-top:3px">Se resuelven en Compras, no en Tareas.</div>`;
};

const bloqueDeActas = n => (n ? `
  <div style="font-size:11px;font-weight:700;color:#B45309;letter-spacing:.4px;margin:20px 0 6px">ACTAS</div>
  <div style="font-size:13px;color:#374151;padding:3px 0">${n} ${n === 1 ? "compromiso de un acta está vencido" : "compromisos de actas están vencidos"}.</div>` : "");

const plata = v => `$${Math.abs(Number(v) || 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * LO ALQUILADO QUE SE PASA DE PLAZO.
 *
 * El generador se alquiló por quince días y hoy es el diecisiete: sigue en la
 * obra y el proveedor sigue facturando. Lo que se paga de más no está en
 * ninguna orden de cambio, y no se descubre solo — se descubre con la factura
 * del mes siguiente, o no se descubre y se come el margen entero.
 *
 * Avisa tres días antes, para poder devolverlo o pedir la extensión con tiempo,
 * y todos los días después, porque cada uno es plata que ya salió.
 */
async function plazosDeLasOrdenes() {
  const hoy = hoyISO();
  const ordenes = await json(await rest(
    "ordenes_cambio?cubre_hasta=not.is.null&cubre_cerrado_at=is.null&anulada=not.is.true"
    + "&select=id,numero,codigo,titulo,obra_id,cubre_que,cubre_desde,cubre_hasta"));
  if (!ordenes?.length) return [];
  const obras = await json(await rest(
    `obras?id=in.(${[...new Set(ordenes.map(o => o.obra_id).filter(Boolean))].join(",") || 0})&select=id,nombre`));
  const dias = (a, b) => Math.round((new Date(`${String(b).slice(0, 10)}T12:00:00`)
    - new Date(`${String(a).slice(0, 10)}T12:00:00`)) / 86400000);
  return ordenes
    .map(o => ({ o, faltan: dias(hoy, o.cubre_hasta), obra: (obras || []).find(x => x.id === o.obra_id)?.nombre || "" }))
    .filter(x => x.faltan <= 3)
    .sort((a, b) => a.faltan - b.faltan);
}

const bloqueDePlazos = lista => (lista.length ? `
  <div style="font-size:11px;font-weight:700;color:#B91C1C;letter-spacing:.4px;margin:20px 0 6px">
    ALQUILERES QUE SE PASAN DE PLAZO · ${lista.length}
  </div>
  ${lista.map(({ o, faltan, obra }) => `<div style="font-size:13px;color:#374151;padding:3px 0">
    ${esc(o.codigo || `OC-${String(o.numero).padStart(2, "0")}`)} ${esc(o.cubre_que || o.titulo || "")}
    <span style="color:#9CA3AF">· ${esc(obra)}</span>
    <span style="color:${faltan < 0 ? "#B91C1C" : "#B45309"}">
      · ${faltan < 0 ? `se pasó ${-faltan} ${-faltan === 1 ? "día" : "días"}`
        : faltan === 0 ? "vence hoy" : `vence en ${faltan} ${faltan === 1 ? "día" : "días"}`}
    </span>
  </div>`).join("")}
  <div style="font-size:11.5px;color:#6B7280;margin-top:5px">
    Lo que siga costando después de esa fecha no está en ninguna orden: hay que extenderla o devolver el equipo.
  </div>` : "");

const bloqueDeOrdenes = (lista, correo = "") => (lista.length ? `
  <div style="font-size:11px;font-weight:700;color:#B91C1C;letter-spacing:.4px;margin:20px 0 6px">
    ÓRDENES DE CAMBIO SIN FIRMAR · ${lista.length} · ${plata(lista.reduce((t, p) => t + p.monto, 0))} esperando
  </div>
  ${lista.slice(0, 8).map(p => `<div style="font-size:13px;color:#374151;padding:3px 0">
    ${esc(p.o.codigo || `OC-${String(p.o.numero).padStart(2, "0")}`)} ${esc(p.o.titulo || "")}
    <span style="color:#9CA3AF">· ${esc(p.obra)} · ${plata(p.monto)}</span>
    ${/* LO QUE YO YA FIRMÉ, DICHO. Uno aprueba desde el correo y al otro día
          ve la orden en la lista de las que esperan: lo primero que piensa es
          que su aprobación no se guardó. */ ""}
    ${correo && p.firmaron.some(f => String(f.email || "").toLowerCase() === correo)
      ? '<span style="color:#15803D">· vos ya la aprobaste</span>' : ""}
    <span style="color:${p.vencida ? "#B91C1C" : "#B45309"}">
      · ${p.objetaron.length
        ? `objetada por ${esc(p.objetaron.map(f => f.nombre || f.email).join(", "))}`
        : p.vencida
          ? `plazo vencido, ${p.dias} ${p.dias === 1 ? "día" : "días"} esperando`
          : `${p.dias} ${p.dias === 1 ? "día" : "días"} esperando a ${esc(p.faltan.map(f => f.nombre || f.email).join(", "))}`}
    </span>
  </div>`).join("")}
  ${lista.length > 8 ? `<div style="font-size:11.5px;color:#9CA3AF;margin-top:4px">…y ${lista.length - 8} más.</div>` : ""}
  <div style="font-size:11.5px;color:#6B7280;margin-top:5px">
    Insistir es la mitad del trabajo de cobrar un adicional: en Órdenes de cambio de cada obra hay un botón que
    les vuelve a mandar el correo con su enlace.
  </div>` : "");

function cuerpoDelCorreo(s) {
  return [
    bloque("ATRASADO", "#B91C1C", s.atrasadas),
    bloque("HOY", "#B45309", s.hoy),
    bloque("MAÑANA", "#6B7280", s.manana),
    // Lo que viene, para poder organizar el día sabiendo qué hay detrás.
    bloque("ESTA SEMANA", "#6B7280", (s.estaSemana || []).slice(0, 12)),
    (s.masAdelante || []).length
      ? bloque("MÁS ADELANTE", "#9CA3AF", s.masAdelante.slice(0, 8))
      : "",
    (s.masAdelante || []).length > 8
      ? `<div style="font-size:11.5px;color:#9CA3AF;margin-top:4px">…y ${s.masAdelante.length - 8} más adelante.</div>` : "",
    s.deSusProyectos.length ? bloque("EN TUS PROYECTOS", "#6B7280", s.deSusProyectos) : "",
    // Lo que encargó y ya venció: es lo que hay que reclamar.
    bloqueDeEspero(s.espero || []),
    // Las compras no son tareas: van en su renglón.
    bloqueDeCompras(s.compras),
    s.ayer.length ? bloque("CERRASTE AYER", "#15803D", s.ayer) : "",
    // Lo sin fecha ya no es una nota al pie: si no tiene día, no va a pasar
    // solo, y el correo de la mañana es el momento de ponerle uno.
    (s.sinFecha || []).length ? bloque(`SIN FECHA · ${s.sinFecha.length}`, "#9CA3AF", s.sinFecha.slice(0, 8)) : "",

    // La foto de la oficina, solo para quien la tiene que mirar.
    s.esAdmin && s.equipo.length ? `
      <div style="font-size:11px;font-weight:700;color:#111827;letter-spacing:.4px;margin:20px 0 6px">EL EQUIPO</div>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:13px;color:#374151">
        ${s.equipo.map(e => `<tr>
          <td style="padding:4px 0">${esc(e.persona)}</td>
          <td style="padding:4px 0;color:#9CA3AF">${e.abiertas} abiertas</td>
          <td style="padding:4px 0;color:${e.atrasadas.length ? "#B91C1C" : "#9CA3AF"}">${e.atrasadas.length ? `${e.atrasadas.length} atrasadas` : "al día"}</td>
          <td style="padding:4px 0;color:#15803D">${e.ayer.length ? `${e.ayer.length} ayer` : ""}</td>
        </tr>`).join("")}
      </table>` : "",
    s.esAdmin && s.sinDueno.length ? bloque(`SIN RESPONSABLE · ${s.sinDueno.length}`, "#B91C1C", s.sinDueno.slice(0, 12)) : "",
    // Los leads que hoy piden algo: insistirle al cliente, o ponerles próximo paso.
    bloqueDelPipeline(s.pipeline || []),
    // Las órdenes que el cliente no firma, a quien puede levantar el teléfono.
    s.esAdmin ? bloqueDeOrdenes(s.ordenes || [], String(s.usuario?.email || "").trim().toLowerCase()) : "",
    // Lo alquilado que se pasa de plazo: cada día es plata que ya salió.
    s.esAdmin ? bloqueDePlazos(s.plazos || []) : "",
    s.esAdmin ? bloqueDeActas(s.actasVencidas || 0) : "",

    !s.atrasadas.length && !s.hoy.length && !s.manana.length && !s.ayer.length && !s.equipo.length
      && !(s.estaSemana || []).length && !(s.masAdelante || []).length && !(s.sinFecha || []).length && !(s.pipeline || []).length
      && !s.compras?.total && !(s.espero || []).some(t => t.vencida)
      ? `<p style="font-size:13px;color:#4B5563;margin:0">Hoy no tenés nada con fecha. Lo que esté sin fecha te espera en FOREMAN.</p>` : "",

    `<div style="margin-top:20px"><a href="${APP}" style="display:inline-block;background:#0F3D3E;color:#fff;padding:11px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Abrir FOREMAN →</a></div>`,
  ].filter(Boolean).join("");
}

function asunto(s) {
  if (s.atrasadas.length) return `${s.atrasadas.length} atrasado y ${s.hoy.length} para hoy`;
  if (s.hoy.length) return `${s.hoy.length} para hoy`;
  return "Tu día en FOREMAN";
}

const tituloDelCorreo = s => plantilla({
  titulo: `Buenos días, ${esc(s.usuario.nombre?.split(" ")[0] || "")}`,
  subtitulo: s.atrasadas.length
    ? `${s.atrasadas.length} atrasado · ${s.hoy.length} para hoy`
    : s.hoy.length ? `${s.hoy.length} para hoy` : "Nada vence hoy",
  cuerpo: cuerpoDelCorreo(s),
});

/**
 * @param {number|null} soloPara  id de usuario: manda solo su sobre (para probar)
 * @returns { ok, sobres, enviados, columnas, error }
 */
export async function mandarResumen(soloPara = null) {
  const [{ filas: tareas, columnas }, { filas: usuarios }, { filas: leads }, { filas: accesos }] = await Promise.all([
    traer("tasks", [
      "id,title,due_date,hora,status,type,notes,priority,assignee_id,responsable_externo,lead_id,project_id,updated_at,compra_id,compra_estado,created_by,espera,privada",
      "id,title,due_date,hora,status,type,notes,priority,assignee_id,responsable_externo,lead_id,project_id,updated_at,compra_id",
      "id,title,due_date,hora,status,type,notes,priority,assignee_id,responsable_externo,lead_id,project_id,updated_at",
      "id,title,due_date,hora,status,type,notes,priority,assignee_id,lead_id,project_id,updated_at",
      "id,title,due_date,status,type,notes,priority,assignee_id,lead_id,project_id",
      "id,title,due_date,status,assignee_id,lead_id,project_id",
    ]),
    traer("usuarios", ["id,nombre,email,rol,activo"]),
    // Con su espera del cliente, si la migración 171 ya está; si no, sin ella.
    traer("leads", [
      "id,nombre,created_by,responsable_id,resultado,espera_desde,espera_que,recordar_el",
      "id,nombre,created_by,responsable_id,resultado", "id,nombre,resultado",
    ]),
    traer("lead_accesos", ["lead_id,usuario_id"]),
  ]);

  if (!columnas) return { ok: false, error: "No se pudieron leer las tareas: revisá las columnas de la tabla tasks" };

  const pipeline = avisosDelPipeline({ leads, tareas, hoy: hoyISO() });
  let sobres = armarResumen({ tareas, usuarios, leads, accesos, hoy: hoyISO(), pipeline });
  if (soloPara) {
    sobres = sobres.filter(s => s.usuario.id === Number(soloPara));
    // Probando, un sobre vacío también sirve: dice que el correo llega.
    if (!sobres.length) {
      const u = usuarios.find(x => x.id === Number(soloPara));
      if (!u) return { ok: false, error: `No encontré al usuario ${soloPara} en la tabla de usuarios` };
      if (!u.email) return { ok: false, error: `${u.nombre} no tiene correo cargado: ponéselo en Ajustes → Usuarios` };
      sobres = [{ usuario: u, esAdmin: u.rol === "owner" || u.rol === "assistant",
        atrasadas: [], hoy: [], manana: [], estaSemana: [], masAdelante: [], sinFecha: [], ayer: [], deSusProyectos: [], equipo: [], sinDueno: [], pipeline: [],
        espero: [], compras: { total: 0 } }];
    }
  }

  // Una sola consulta para todos los sobres: la lista es la misma, y pedirla
  // por persona sería la misma pregunta cinco veces.
  let ordenes = [];
  try { ordenes = await ordenesSinFirmar(); } catch { /* el resumen sale igual */ }
  let plazos = [];
  try { plazos = await plazosDeLasOrdenes(); } catch { /* el resumen sale igual */ }
  // Los compromisos de actas que pasaron su fecha y nadie cerró.
  let actasVencidas = 0;
  try {
    // Los VIVOS: un compromiso que se arrastra de reunión en reunión es uno
    // solo, el de la última acta. Contar todas las filas «pendientes» dio 37
    // cuando había 9.
    const [compromisos, actas] = await Promise.all([
      json(await rest("acta_compromisos?select=id,acta_id,viene_de,estado,fecha_limite")),
      json(await rest("obra_actas?select=id,numero")),
    ]);
    actasVencidas = compromisosVencidos(compromisos, actas, hoyISO()).length;
  } catch { /* el resumen sale igual */ }

  const enviados = [];
  for (const s of sobres) {
    s.ordenes = s.esAdmin ? ordenes : [];
    s.plazos = s.esAdmin ? plazos : [];
    s.actasVencidas = s.esAdmin ? actasVencidas : 0;
    const r = await enviarCorreo({ to: s.usuario.email, subject: asunto(s), html: tituloDelCorreo(s) });
    if (r.ok) enviados.push(s.usuario.email);
  }
  return { ok: true, sobres: sobres.length, enviados, columnas, tareas: tareas.length };
}
