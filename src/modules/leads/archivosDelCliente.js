// LAS FOTOS Y LOS ARCHIVOS QUE EL CLIENTE VE EN SU ENLACE: las reglas.
//
// Hernán, 17/11/2026: «se pueden cargar archivos o fotos a que los vea... son
// relacionadas al proyecto y a las tareas también».
//
// Son archivos del proyecto (`proyecto_archivos`) con dos datos más (migración
// 184): si el cliente lo ve, y de qué punto del checklist es —o de ninguno, y
// entonces es del proyecto—. Acá no se lee ni se escribe la base.

const MB = 1024 * 1024;
/** El tope de un archivo. Avisar antes es más honesto que fallar a los tres minutos. */
export const TOPE = 50 * MB;

const CLASES = [
  [/\.(dwg|dxf|rvt|skp|3dm|ifc|step|stp)$/i, "cad"],
  [/\.(pdf)$/i, "pdf"],
  [/\.(jpe?g|png|webp|gif|heic|avif|tiff?)$/i, "imagen"],
  [/\.(xlsx?|csv|docx?|pptx?)$/i, "hoja"],
];
/** Qué clase de archivo es, por su nombre: cad · pdf · imagen · hoja · otro. */
export const claseDeArchivo = nombre => CLASES.find(([re]) => re.test(String(nombre || "")))?.[1] || "otro";

/** ¿Se puede ver en miniatura? Lo que el navegador sabe dibujar; un .heic no. */
export const esFoto = a => /\.(jpe?g|png|webp|gif|avif)$/i.test(String(a?.nombre || ""));

/** El peso, como se le dice a una persona. */
export function pesoLegible(bytes) {
  const n = Number(bytes) || 0;
  if (!n) return "";
  return n >= MB ? `${(n / MB).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** Por qué un archivo no se sube, o null si entra. */
export function porQueNoEntra(archivo) {
  if (!archivo || !archivo.name) return "Ese archivo no se pudo leer.";
  if (Number(archivo.size) > TOPE) return `«${archivo.name}» pesa ${pesoLegible(archivo.size)} y el tope es 50 MB.`;
  if (!Number(archivo.size)) return `«${archivo.name}» está vacío.`;
  return null;
}

/** Dónde se guarda en el depósito: en la carpeta del proyecto, aparte de lo interno. */
export function rutaParaSubir(leadId, nombre, ahora = Date.now(), n = 0) {
  const limpio = String(nombre || "archivo").replace(/[^\w.\-]/g, "_").slice(-80);
  return `proyecto-${Number(leadId)}/cliente/${ahora}${n ? `-${n}` : ""}-${limpio}`;
}

/**
 * La fila que se guarda al subir algo para el cliente.
 * @param taskId  el punto del checklist, o null si es del proyecto
 */
export function filaAlSubir({ leadId, taskId = null, archivo, ruta, quien = null }) {
  return {
    lead_id: leadId, task_id: taskId || null, visible_cliente: true,
    storage_path: ruta, nombre: archivo.name, tipo: claseDeArchivo(archivo.name), tamano: Number(archivo.size) || null,
    carpeta: "Para el cliente",
    subido_por: quien?.id ?? null, subido_nombre: quien?.name || null,
  };
}

/**
 * Lo que ve el cliente, repartido: lo del proyecto y lo de cada punto.
 * @returns { delProyecto: [filas], porTarea: { [taskId]: [filas] } } en el orden en que se subió
 */
export function repartir(filas = []) {
  const delProyecto = [], porTarea = {};
  const enOrden = (filas || []).filter(a => a && a.visible_cliente === true)
    .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")) || Number(a.id) - Number(b.id));
  for (const a of enOrden) {
    if (a.task_id == null) delProyecto.push(a);
    else (porTarea[a.task_id] = porTarea[a.task_id] || []).push(a);
  }
  return { delProyecto, porTarea };
}

/** «2 fotos y 1 archivo», para decir qué hay sin abrirlo. */
export function cuantosDice(filas = []) {
  const fotos = (filas || []).filter(esFoto).length, otros = (filas || []).length - fotos;
  const partes = [
    fotos ? `${fotos} ${fotos === 1 ? "foto" : "fotos"}` : "",
    otros ? `${otros} ${otros === 1 ? "archivo" : "archivos"}` : "",
  ].filter(Boolean);
  return partes.join(" y ");
}
