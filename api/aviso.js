// api/aviso.js — Una sola puerta para todos los avisos por correo.
//
// Vercel cuenta un archivo de /api como una función, y el plan tiene un tope:
// al agregar el aviso de tareas quedamos en trece con doce permitidas y los
// despliegues empezaron a fallar en silencio —el sitio seguía sirviendo la
// versión vieja—. Los cuatro avisos entran por acá y se reparten adentro; cada
// uno sigue viviendo en su archivo, con su nombre y sus reglas.
//
// POST /api/aviso?de=tarea | reunion | comentario | cuenta | resumen | orden | plan | acta | sri | libro | compra | revision
//
// Va en la dirección y no en el cuerpo porque el aviso de cuenta ya usa "tipo"
// para lo suyo (pin o permisos) y dos cosas no pueden llamarse igual.

import tarea from "./_aviso-tarea.js";
import reunion from "./_aviso-reunion.js";
import comentario from "./_aviso-comentario.js";
import cuenta from "./_aviso-cuenta.js";
import resumen from "./_aviso-resumen.js";
import orden from "./_aviso-orden.js";
import plan from "./_aviso-plan.js";
import acta from "./_aviso-acta.js";
import sri from "./_aviso-sri.js";
import libro from "./_aviso-libro.js";
import compra from "./_aviso-compra.js";
import revision from "./_aviso-revision.js";

const AVISOS = { tarea, reunion, comentario, cuenta, resumen, orden, plan, acta, sri, libro, compra, revision };

// El acta viaja con su PDF adjunto en base64, y un acta con fotos pesa más
// que el megabyte que viene por defecto. Sin esto el envío falla con un error
// de tamaño que no dice nada de lo que pasó.
export const config = {
  api: { bodyParser: { sizeLimit: "15mb" } },
  // SESENTA SEGUNDOS, NO DIEZ.
  //
  // El acta sale de a un correo por persona —cada uno lleva su enlace de
  // conformidad— y cada envío sube el PDF y los anexos. Catorce asistentes no
  // entran en los diez segundos que Vercel da por defecto: la función se corta
  // a la mitad y un corte del servidor no devuelve JSON, devuelve una página
  // de error que no tiene adentro ningún mensaje que mostrar. Del otro lado se
  // ve "No se pudo enviar el acta" y nada más.
  //
  // VA ADENTRO DE `config`, no como `export const maxDuration`. Esa otra forma
  // es la de Next; acá son funciones sueltas de Vercel y la ignora en silencio,
  // que es exactamente lo que pasó: quedó en diez segundos igual.
  maxDuration: 60,
};

export default async function handler(req, res) {
  const de = String(req.query?.de || "");
  const aviso = AVISOS[de];
  if (!aviso) return res.status(400).json({ error: `No sé mandar el aviso "${de}"` });
  return aviso(req, res);
}
