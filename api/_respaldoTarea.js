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
import { respaldoDeLaBase, listarDepositos, listarArchivos, bajarArchivo, borrarArchivo } from "./_respaldo.js";
import { configuradoDropbox, subir, listar, borrar, copiarVarios } from "./_dropbox.js";
import { queEsLaCarpeta, quePedir, armarIndice, carpetaDeLaRuta, destinoLegible, indiceEnCsv } from "./_carpetasDeArchivos.js";
import { enviarCorreo, plantilla, esc } from "./_correo.js";

const CARPETA = "/FOREMAN/respaldos";
const TOPE_ARCHIVOS = 25;                 // por corrida
const ARCHIVO_MUY_GRANDE = 60 * 1024 * 1024;
const DIAS_QUE_SE_GUARDAN = 40;
const DIAS_PARA_SOLTAR = 120;             // un archivo de un presupuesto histórico
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

const POR_PROYECTO = `${CARPETA}/por-proyecto`;
const ESPEJO = `${CARPETA}/archivos/task-files`;
const TOPE_COPIAS = 1000;                 // lo que Dropbox acepta de una vez

async function leerFilas(tabla, columnas, ids) {
  const filas = [];
  for (let i = 0; i < ids.length; i += 150) {
    const r = await rest(`${tabla}?select=${columnas}&id=in.(${ids.slice(i, i + 150).join(",")})`);
    if (!r.ok) throw new Error(`${tabla}: ${r.status}`);
    filas.push(...await r.json());
  }
  return filas;
}

/**
 * Pone en por-proyecto lo que esté en la copia exacta y todavía no esté ahí.
 * Deja además el índice (carpeta → proyecto) en un CSV, para Excel.
 * @returns cuántos archivos se mandaron a copiar
 */
export async function ordenarPorProyecto() {
  const espejo = await listar(ESPEJO, { nombres: true });   // minúsculas → como se escribió
  const rutas = [...espejo.values()].map(p => p.slice(ESPEJO.length + 1));
  const carpetas = [...new Set(rutas.map(carpetaDeLaRuta))].map(queEsLaCarpeta);

  const filas = {};
  for (const [tabla, p] of Object.entries(quePedir(carpetas))) filas[tabla] = await leerFilas(tabla, p.columnas, p.ids);
  const faltan = (tabla, campo) => {
    const ya = new Set((filas[tabla] || []).map(f => Number(f.id)));
    return [...new Set(Object.values(filas).flat().map(f => Number(f[campo])).filter(id => id && !ya.has(id)))];
  };
  const obras = faltan("obras", "obra_id");
  if (obras.length) filas.obras = [...(filas.obras || []), ...await leerFilas("obras", "id,nombre,lead_id", obras)];
  const leads = faltan("leads", "lead_id");
  if (leads.length) filas.leads = [...(filas.leads || []), ...await leerFilas("leads", "id,nombre", leads)];

  const indice = armarIndice(carpetas, filas);
  const deLaCarpeta = new Map(indice.map(i => [i.carpeta, i]));
  await subir(`${POR_PROYECTO}/indice-de-carpetas.csv`, Buffer.from(indiceEnCsv(indice), "utf8"));

  // Si dos archivos caerían en el mismo nombre, el segundo lleva el nombre
  // con que se guardó, que no se repite. Se decide sobre todos, en orden, para
  // que cada noche salga lo mismo.
  const usados = new Set();
  const destinos = rutas.sort().map(ruta => {
    let hacia = `${POR_PROYECTO}/${destinoLegible(deLaCarpeta.get(carpetaDeLaRuta(ruta)), ruta)}`;
    if (usados.has(hacia.toLowerCase())) hacia = `${hacia.slice(0, hacia.lastIndexOf("/"))}/${ruta.split("/").pop()}`;
    usados.add(hacia.toLowerCase());
    return [ruta, hacia];
  });

  const yaEstan = await listar(POR_PROYECTO);
  const pares = [];
  for (const [ruta, hacia] of destinos) {
    if (yaEstan.has(hacia.toLowerCase())) continue;
    pares.push({ desde: `${ESPEJO}/${ruta}`, hacia });
    if (pares.length >= TOPE_COPIAS) break;
  }
  await copiarVarios(pares);
  return pares.length;
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

  // ── Los mismos archivos, por proyecto ──
  //
  // La copia de arriba es idéntica al depósito, con carpetas por número
  // (`obra-12/`): es la que sirve para levantar FOREMAN de nuevo. Esta otra es
  // para buscar a mano: `Diners Plaza Lagos/Facturas/2026-11-26 … factura.pdf`.
  // Se copia dentro de Dropbox desde la de arriba, sin bajar nada de Supabase,
  // así que alcanza también a los archivos que ya se soltaron del depósito.
  let ordenados = 0;
  if (hayDropbox && archivos) {
    try {
      ordenados = await ordenarPorProyecto();
      paso.push(ordenados ? `Por proyecto: ${ordenados} archivos puestos en ${CARPETA}/por-proyecto` : "Por proyecto: al día");
    } catch (e) {
      problemas.push(`Al ordenar por proyecto: ${e.message}`);
    }
  }

  // ── Soltar del depósito lo viejo que ya está respaldado ──
  //
  // Un presupuesto pasado a histórico hace meses no necesita su Excel a mano
  // en Supabase, que se llena; con la copia guardada en Dropbox alcanza. Se
  // suelta el archivo y queda anotado dónde está, para no perder el rastro.
  let soltados = 0;
  if (hayDropbox && archivos) {
    try {
      const enDropbox = await listar(`${CARPETA}/archivos`);
      const r = await rest("presupuesto_archivos?soltado_at=is.null&select=id,ruta,created_at,presupuestos(archivado_at)&limit=500");
      const filas = r.ok ? await r.json() : [];
      const limite = new Date(Date.now() - DIAS_PARA_SOLTAR * 86400000).toISOString();
      for (const a of filas) {
        const historico = a.presupuestos?.archivado_at && a.presupuestos.archivado_at < limite;
        if (!historico || !a.ruta) continue;
        // Solo si la copia está de verdad en Dropbox: soltar algo sin respaldo
        // sería perderlo.
        if (!enDropbox.has(`${CARPETA}/archivos/task-files/${a.ruta}`.toLowerCase())) continue;
        if (await borrarArchivo("task-files", a.ruta)) {
          await rest(`presupuesto_archivos?id=eq.${a.id}`, { method: "PATCH", body: JSON.stringify({ soltado_at: new Date().toISOString() }) });
          soltados++;
        }
      }
      if (soltados) paso.push(`Se soltaron ${soltados} archivos de presupuestos históricos, ya guardados en Dropbox`);
    } catch (e) {
      // Sin la migración 032 esa tabla no existe todavía: no es un problema.
      if (!/relation|does not exist|schema cache/i.test(e.message)) problemas.push(`Al soltar archivos viejos: ${e.message}`);
    }
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
    dropbox: hayDropbox ? { carpeta: CARPETA, archivosCopiados: subidos, archivosPendientes: faltan, porProyecto: ordenados, copiasViejasBorradas: borrados, archivosSoltados: soltados } : "sin configurar",
    correo: aviso,
    paso,
    problemas,
    avisos,
  };
}
