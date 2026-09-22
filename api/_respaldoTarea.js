// El respaldo de cada noche: armarlo, guardarlo fuera de Supabase y avisar.
//
// La regla es simple: un respaldo dentro del mismo lugar que se quiere
// respaldar no sirve de nada. Por eso sale de Supabase y se va a Dropbox, y
// una vez por semana además por correo: dos lugares distintos, tres copias
// contando la base viva.
//
// De la base se guarda una copia por día. Al mes se van dejando solo las del
// primero de cada mes: así el archivo no crece para siempre y se conserva la
// historia lejana.
//
// Los archivos —facturas, logos, adjuntos— se copian de a poco: los que
// todavía no están en Dropbox, hasta un tope por corrida, para que la tarea
// termine a tiempo. En unas cuantas noches quedan todos, y de ahí en adelante
// solo se suben los nuevos.

import { rest } from "./_supabase.js";
import { respaldoDeLaBase, listarDepositos, listarArchivos, bajarArchivo } from "./_respaldo.js";
import { configuradoDropbox, subir, listar, borrar } from "./_dropbox.js";
import { enviarCorreo, plantilla, esc } from "./_correo.js";

const CARPETA = "/FOREMAN/respaldos";
const TOPE_ARCHIVOS = 25;                 // por corrida
const ARCHIVO_MUY_GRANDE = 60 * 1024 * 1024;
const DIAS_QUE_SE_GUARDAN = 40;
const CORREO_MAXIMO = 18 * 1024 * 1024;   // lo que aguanta un adjunto

const kb = b => (b / 1024).toLocaleString("es-EC", { maximumFractionDigits: 0 }) + " KB";
const mb = b => (b / 1024 / 1024).toLocaleString("es-EC", { maximumFractionDigits: 1 }) + " MB";

/** A quién se le avisa: quien esté puesto en Vercel, o el dueño de FOREMAN. */
async function destinatario() {
  if (process.env.RESPALDO_EMAIL) return process.env.RESPALDO_EMAIL.split(",").map(x => x.trim());
  const r = await rest("usuarios?rol=eq.owner&activo=eq.true&select=email");
  const filas = r.ok ? await r.json() : [];
  return filas.map(u => u.email).filter(Boolean);
}

/** Copias viejas que ya no hace falta guardar (se conservan las del día 1). */
function sobran(rutas) {
  const limite = new Date(Date.now() - DIAS_QUE_SE_GUARDAN * 86400000).toISOString().slice(0, 10);
  return [...rutas.keys()].filter(ruta => {
    const f = ruta.match(/foreman-base-(\d{4}-\d{2})-(\d{2})\.json\.gz$/);
    return f && f[2] !== "01" && `${f[1]}-${f[2]}` < limite;
  });
}

/**
 * @param opciones.archivos  copiar también los archivos (facturas, logos)
 * @param opciones.correo    "auto" manda el correo los lunes; true siempre; false nunca
 */
export async function correrRespaldo({ archivos = true, correo = "auto" } = {}) {
  const inicio = Date.now();
  const paso = [];
  const problemas = [];   // lo que hay que arreglar
  const avisos = [];      // lo que se saltó a propósito

  // ── La base ──
  const base = await respaldoDeLaBase();
  paso.push(`Base: ${base.resumen.tablas} tablas, ${base.resumen.filas.toLocaleString("es-EC")} filas, ${kb(base.resumen.bytes)}`);
  base.resumen.fallas.forEach(f => problemas.push(`No se pudo leer ${f}`));

  const hayDropbox = configuradoDropbox();
  let subidos = 0, faltan = 0, borrados = 0;

  if (hayDropbox) {
    await subir(`${CARPETA}/base/${base.nombre}`, base.contenido);
    paso.push(`Guardado en Dropbox: ${CARPETA}/base/${base.nombre}`);

    const guardadas = await listar(`${CARPETA}/base`);
    for (const vieja of sobran(guardadas)) if (await borrar(vieja)) borrados++;
    if (borrados) paso.push(`Se soltaron ${borrados} copias viejas (se guardan las del día 1 de cada mes)`);

    // ── Los archivos ──
    if (archivos) {
      const yaEstan = await listar(`${CARPETA}/archivos`);
      for (const deposito of await listarDepositos()) {
        for (const a of await listarArchivos(deposito)) {
          const destino = `${CARPETA}/archivos/${deposito}/${a.ruta}`;
          if (yaEstan.has(destino.toLowerCase())) continue;
          if (a.bytes > ARCHIVO_MUY_GRANDE) { avisos.push(`${deposito}/${a.ruta} pesa ${mb(a.bytes)} y no se copió`); continue; }
          if (subidos >= TOPE_ARCHIVOS) { faltan++; continue; }
          try {
            await subir(destino, await bajarArchivo(deposito, a.ruta));
            subidos++;
          } catch (e) { problemas.push(`${deposito}/${a.ruta}: ${e.message}`); }
        }
      }
      paso.push(subidos || faltan
        ? `Archivos: ${subidos} copiados${faltan ? `, faltan ${faltan} para las próximas noches` : ", al día"}`
        : "Archivos: todo al día");
    }
  } else {
    problemas.push("Dropbox no está configurado: el respaldo va solo por correo.");
  }

  // ── El correo, con la copia de la base adjunta ──
  const lunes = new Date().getUTCDay() === 1;
  const mandar = correo === true || (correo === "auto" && (lunes || !hayDropbox));
  let aviso = "no";
  if (mandar) {
    const para = await destinatario();
    if (!para.length) problemas.push("No hay a quién mandarle el respaldo por correo.");
    else if (base.contenido.length > CORREO_MAXIMO) problemas.push(`El respaldo pesa ${mb(base.contenido.length)} y ya no entra en un correo.`);
    else {
      const r = await enviarCorreo({
        to: para,
        subject: `Respaldo de FOREMAN · ${new Date().toISOString().slice(0, 10)}`,
        html: plantilla({
          titulo: "Respaldo de FOREMAN",
          subtitulo: new Date().toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" }),
          cuerpo: `${paso.map(p => `<div style="font-size:13px;color:#374151;padding:3px 0">• ${esc(p)}</div>`).join("")}
            ${[...problemas, ...avisos].length ? `<div style="margin-top:10px;font-size:13px;color:#B45309">${[...problemas, ...avisos].map(p => `<div>• ${esc(p)}</div>`).join("")}</div>` : ""}
            <div style="margin-top:12px;font-size:12px;color:#6B7280">Adjunto va la base entera comprimida. Guárdalo donde quieras: con ese archivo se puede levantar FOREMAN de cero.</div>`,
        }),
        adjuntos: [{ filename: base.nombre, content: base.contenido.toString("base64") }],
      });
      aviso = r.ok ? `enviado a ${para.join(", ")}` : `falló: ${r.error}`;
      if (!r.ok) problemas.push(`El correo no salió: ${r.error}`);
    }
  }

  return {
    ok: problemas.length === 0,
    segundos: Math.round((Date.now() - inicio) / 1000),
    base: { archivo: base.nombre, ...base.resumen },
    dropbox: hayDropbox ? { carpeta: CARPETA, archivosCopiados: subidos, archivosPendientes: faltan, copiasViejasBorradas: borrados } : "sin configurar",
    correo: aviso,
    paso,
    problemas,
    avisos,
  };
}
