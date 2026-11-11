import { useEffect } from "react";
import { supabase } from "../lib/supabase";
import { cargarAvisosDeModulos } from "../lib/cargarAvisos";

// Trae, cada vez que se abre el tablero, lo que los demás módulos tienen para
// avisar. No dibuja nada: es un componente para poder vivir adentro del
// tablero —donde ya se sabe a qué obras entra esta persona— y no arriba de
// todo en la aplicación, antes del ingreso.
//
// Va después de pintar y no traba nada: si falla, el panel sale sin esos avisos.

/**
 * @param entra       leadId → si esta persona entra a esa obra
 * @param conControl  si ve Control de Obra
 * @param conActas    si ve las actas
 * @param onCargado   recibe lo que devuelve cargarAvisosDeModulos
 */
export default function CargadorDeAvisos({ entra = () => false, conControl = false, conActas = false, onCargado }) {
  useEffect(() => {
    let vivo = true;
    (async () => {
      let obras = [];
      if (conControl) {
        const { data } = await supabase.from("obras").select("id,nombre,lead_id,presupuesto_id");
        obras = (data || []).filter(o => entra(o.lead_id));
      }
      const r = await cargarAvisosDeModulos({ obras, conActas });
      if (vivo) onCargado?.(r);
    })().catch(() => {});
    return () => { vivo = false; };
    // Una vez por apertura del tablero: los permisos no cambian mientras está abierto.
    // eslint-disable-next-line
  }, [conControl, conActas]);
  return null;
}
