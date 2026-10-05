// Avisarle a alguien, por correo, que le cambiaron algo de su cuenta.
//
// El correo lo manda el servidor, que es donde vive la llave de envío. El PIN
// va de acá para allá una sola vez y no se guarda: en la base solo queda su
// huella, así que este correo es el único lugar donde queda escrito.

async function pedir(cuerpo) {
  try {
    const r = await fetch("/api/aviso?de=cuenta", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo),
    });
    const d = await r.json().catch(() => ({}));
    return r.ok ? d : { ok: false, error: d.error || `El servidor respondió ${r.status}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** Le manda su clave nueva. Solo sirve en el momento del cambio. */
export const avisarPinNuevo = (usuarioId, pin) => pedir({ usuarioId, tipo: "pin", pin });

/**
 * Mandarle un correo de prueba, para saber si llega.
 *
 * El envío falla en silencio de maneras que no se distinguen desde adentro: el
 * usuario no tiene correo cargado, la dirección está mal escrita, el servicio
 * de envío rechaza el dominio, o llega y cae en spam. Las cuatro se ven igual
 * —"no me llegó"— y sin una prueba hay que adivinar cuál es.
 *
 * Esto manda uno vacío y devuelve textualmente lo que contestó el servidor.
 */
export const probarCorreo = usuarioId => pedir({ usuarioId, tipo: "prueba" });

/** Le cuenta qué cambió de lo que puede hacer. */
export const avisarPermisos = (usuarioId, rol, cambios) => pedir({ usuarioId, tipo: "permisos", rol, cambios });
