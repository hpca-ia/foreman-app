// api/aviso.js — Una sola puerta para todos los avisos por correo.
//
// Vercel cuenta un archivo de /api como una función, y el plan tiene un tope:
// al agregar el aviso de tareas quedamos en trece con doce permitidas y los
// despliegues empezaron a fallar en silencio —el sitio seguía sirviendo la
// versión vieja—. Los cuatro avisos entran por acá y se reparten adentro; cada
// uno sigue viviendo en su archivo, con su nombre y sus reglas.
//
// POST /api/aviso?de=tarea | reunion | comentario | cuenta
//
// Va en la dirección y no en el cuerpo porque el aviso de cuenta ya usa "tipo"
// para lo suyo (pin o permisos) y dos cosas no pueden llamarse igual.

import tarea from "./_aviso-tarea.js";
import reunion from "./_aviso-reunion.js";
import comentario from "./_aviso-comentario.js";
import cuenta from "./_aviso-cuenta.js";

const AVISOS = { tarea, reunion, comentario, cuenta };

export default async function handler(req, res) {
  const de = String(req.query?.de || "");
  const aviso = AVISOS[de];
  if (!aviso) return res.status(400).json({ error: `No sé mandar el aviso "${de}"` });
  return aviso(req, res);
}
