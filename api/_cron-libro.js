// El libro de obra de ayer, cada mañana, al Director.
//
// El libro se escribe el día que pasa y después nadie lo abre. Eso lo vuelve
// un archivo: sirve si algún día hay un juicio, y no sirve para dirigir. Lo
// que lo vuelve útil es llegar sin que lo pidan, al día siguiente, cuando
// todavía se puede hacer algo con lo que dice.
//
// Y LO QUE IMPORTA NO ES QUE SE ESCRIBIÓ, ES QUÉ DICE. Un correo que avisara
// "hay libro nuevo" se ignora a la segunda semana. Este trae el día entero
// —personal, actividades, novedades, seguridad— para que se lea sin entrar.
//
// Las obras SIN libro también van, en una línea al pie. Un día de obra sin
// libro es el dato más importante del correo: significa que el residente no
// escribió, y eso solo se ve si alguien lo mira todos los días. Una lista de
// las obras que sí tienen nunca mostraría a las que faltan.

import { rest } from "./_supabase.js";
import { enviarCorreo, plantilla, esc } from "./_correo.js";

const CATEGORIAS = [
  ["personal", "Personal en obra"],
  ["actividades", "Actividades"],
  ["materiales", "Materiales"],
  ["equipo", "Equipo y maquinaria"],
  ["novedades", "Novedades"],
  ["decisiones", "Decisiones"],
  ["seguridad", "Seguridad"],
  ["observaciones", "Observaciones"],
];

const json = async r => { try { return await r.json(); } catch { return null; } };

/** Ayer en Quito, que es donde está la obra y no donde está el servidor. */
function ayerEnObra() {
  const hoy = new Intl.DateTimeFormat("en-CA",
    { timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const d = new Date(`${hoy}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const comoSeLee = f => {
  const d = new Date(`${String(f).slice(0, 10)}T12:00:00`);
  return `${DIAS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
};

export default async function handler(req, res) {
  const fecha = String(req.query?.fecha || "").slice(0, 10) || ayerEnObra();

  // A quién. El Director siempre; los gerentes también, porque el libro de la
  // obra que llevan es suyo antes que de nadie.
  const usuarios = await json(await rest(
    "usuarios?select=id,nombre,email,rol,activo&activo=eq.true")) || [];
  const correos = usuarios
    .filter(u => u.email && ["owner", "gerente"].includes(u.rol))
    .map(u => u.email);
  if (!correos.length) return res.status(200).json({ ok: true, enviado: 0, porque: "nadie a quién mandarlo" });

  // Las obras en curso. Sin esto no se sabe cuáles DEBERÍAN tener libro, que
  // es la mitad del valor del correo.
  const obras = await json(await rest("obras?select=id,nombre,lead_id,estado&estado=eq.activa")) || [];
  if (!obras.length) return res.status(200).json({ ok: true, enviado: 0, porque: "no hay obras activas" });

  const leads = obras.map(o => o.lead_id).filter(Boolean);
  const dias = leads.length
    ? (await json(await rest(
        `libro_obra_dias?lead_id=in.(${leads.join(",")})&fecha=eq.${fecha}&select=*`))) || []
    : [];
  const entradas = dias.length
    ? (await json(await rest(
        `libro_obra_entradas?dia_id=in.(${dias.map(d => d.id).join(",")})&select=*&order=created_at`))) || []
    : [];
  const fotos = dias.length
    ? (await json(await rest(
        `libro_obra_fotos?dia_id=in.(${dias.map(d => d.id).join(",")})&select=id,dia_id,descripcion`))) || []
    : [];

  const diaDe = new Map(dias.map(d => [d.lead_id, d]));
  const conLibro = obras.filter(o => diaDe.has(o.lead_id));
  const sinLibro = obras.filter(o => !diaDe.has(o.lead_id));
  if (!conLibro.length && !sinLibro.length) {
    return res.status(200).json({ ok: true, enviado: 0, porque: "nada que contar" });
  }

  const bloques = conLibro.map(o => {
    const dia = diaDe.get(o.lead_id);
    const mias = entradas.filter(e => e.dia_id === dia.id);
    const misFotos = fotos.filter(f => f.dia_id === dia.id);
    const porCat = CATEGORIAS
      .map(([id, label]) => [label, mias.filter(e => e.categoria === id)])
      .filter(([, xs]) => xs.length);

    const cuerpo = dia.sin_novedades && !mias.length
      ? `<div style="font-size:13px;color:#6B7280;padding:4px 0">Sin novedades.</div>`
      : porCat.map(([label, xs]) => `
          <div style="margin-top:7px">
            <div style="font-size:11px;font-weight:700;color:#6B7280;letter-spacing:.3px;text-transform:uppercase">${esc(label)}</div>
            <ul style="margin:3px 0 0;padding-left:18px;font-size:13px;color:#1f2937;line-height:1.6">
              ${xs.map(e => `<li>${esc(e.contenido)}</li>`).join("")}
            </ul>
          </div>`).join("");

    // SIN CERRAR, dicho. Un día que nadie cerró puede estar a medio escribir, y
    // el que lo lee tiene que saber que lo que ve puede no ser todo.
    const estado = dia.estado === "aprobado" ? "aprobado"
      : dia.estado === "cerrado" ? "cerrado" : "quedó sin cerrar";

    return `
      <tr><td style="padding:14px 0 6px;border-top:1px solid #e3e6ea">
        <div style="font-size:14px;font-weight:700;color:#0F3D3E">${esc(o.nombre)}</div>
        <div style="font-size:11.5px;color:#6B7280;margin-top:1px">
          ${dia.clima ? `${esc(dia.clima)} · ` : ""}${esc(estado)}
          ${misFotos.length ? ` · ${misFotos.length} ${misFotos.length === 1 ? "foto" : "fotos"}` : ""}
        </div>
        ${cuerpo}
      </td></tr>`;
  }).join("");

  const faltantes = sinLibro.length ? `
    <tr><td style="padding:14px 0 0;border-top:1px solid #e3e6ea">
      <div style="font-size:12.5px;font-weight:700;color:#92400E;margin-bottom:4px">
        ${sinLibro.length === 1 ? "Una obra sin libro ese día" : `${sinLibro.length} obras sin libro ese día`}
      </div>
      <div style="font-size:12.5px;color:#78350F;line-height:1.6">
        ${sinLibro.map(o => esc(o.nombre)).join(" · ")}
      </div>
      <div style="font-size:11.5px;color:#A16207;margin-top:4px">
        El libro se escribe el mismo día: estos ya no se pueden completar.
      </div>
    </td></tr>` : "";

  const html = plantilla({
    titulo: "Libro de obra",
    subtitulo: `${comoSeLee(fecha)} · ${conLibro.length} de ${obras.length} ${obras.length === 1 ? "obra" : "obras"}`,
    cuerpo: `<table width="100%" cellpadding="0" cellspacing="0">${bloques}${faltantes}</table>`,
  });

  const r = await enviarCorreo({
    to: correos,
    subject: `Libro de obra · ${comoSeLee(fecha)}`,
    html,
  });
  if (r?.error) return res.status(502).json({ ok: false, error: r.error });
  return res.status(200).json({
    ok: true, fecha, enviado: correos.length,
    conLibro: conLibro.length, sinLibro: sinLibro.length,
  });
}
