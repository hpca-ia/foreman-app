import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { hayVersionNueva, laQueCorre, hayUnaNuevaConocida, anotarQueHayNueva, vigilarLoQueSeEscribe,
  cuandoSeEscribio, nadaAMedias, loQueHayAbierto, recargar } from "../lib/versionNueva.js";

// «HAY UNA VERSIÓN NUEVA DE FOREMAN».
//
// Una pestaña abierta sigue con el código con que se cargó. Si mientras tanto
// se publicó un arreglo, quien la tiene abierta sigue viendo —y tocando— lo de
// antes, sin manera de saberlo (lib/versionNueva.js cuenta la tarde en que
// pasó).
//
// Mira cada tres minutos mientras la pestaña está a la vista, y al volver a
// ella. AL VOLVER A FOREMAN desde otra app, si hay una nueva, se recarga sola
// y vuelve al mismo módulo: así lo pidió Hernán desde el iPad, donde no hay
// flecha para recargar. Solo si no queda nada a medias; si queda, o si la
// nueva aparece mientras se la está usando, lo dice abajo con el botón.

const CADA = 3 * 60 * 1000;
// Lo escrito en el último minuto antes de irse puede estar en un formulario
// que se guarda con su botón: eso no se recarga solo.
const ESCRITO_AL_IRSE = 60 * 1000;
// Al volver, lo que quedó en camino cuando la app se fue al fondo termina de
// guardarse antes de recargar.
const PAUSA = 1500;

export default function AvisoDeVersionNueva({ vista = "" }) {
  const [hay, setHay] = useState(false);
  const vistaRef = useRef(vista); vistaRef.current = vista;

  useEffect(() => {
    // En desarrollo el código no lleva número: no hay con qué comparar.
    if (!laQueCorre()) return undefined;
    const dejarDeVigilar = vigilarLoQueSeEscribe();
    // Cada camino lleva su cuenta: si el «focus» de la vuelta llega antes que
    // el cambio de visibilidad, no le tapa la recarga a este.
    let vivo = true, ultima = 0, ultimaVuelta = 0, oculta = 0;
    const mirar = async ({ volvio = false } = {}) => {
      if (document.visibilityState !== "visible") return;
      if (volvio ? Date.now() - ultimaVuelta < 5000 : Date.now() - ultima < 60000) return;
      if (volvio) ultimaVuelta = Date.now(); else ultima = Date.now();
      const nueva = hayUnaNuevaConocida() || (await hayVersionNueva());
      if (!nueva || !vivo) return;
      anotarQueHayNueva();
      if (volvio && oculta - cuandoSeEscribio() >= ESCRITO_AL_IRSE) {
        await new Promise(r => setTimeout(r, PAUSA));
        if (vivo && document.visibilityState === "visible" && nadaAMedias(loQueHayAbierto())) {
          recargar({ vista: vistaRef.current });
          return;
        }
      }
      setHay(true);
    };
    const alCambiar = () => {
      if (document.visibilityState === "hidden") { oculta = Date.now(); return; }
      mirar({ volvio: oculta > 0 });
    };
    const alEnfocar = () => mirar();
    const reloj = setInterval(alEnfocar, CADA);
    document.addEventListener("visibilitychange", alCambiar);
    window.addEventListener("focus", alEnfocar);
    return () => {
      vivo = false; clearInterval(reloj); dejarDeVigilar();
      document.removeEventListener("visibilitychange", alCambiar);
      window.removeEventListener("focus", alEnfocar);
    };
  }, []);

  if (!hay) return null;
  // DEBAJO DE LAS VENTANAS. Hernán, 27/11/2026, desde el iPad: asignaba una
  // factura a un rubro y «Guardar cambios» no hacía nada. La franja estaba
  // encima de todo, y en el ancho del iPad baja a dos renglones y cubre justo
  // el botón de abajo de la ventana: el toque le caía a ella. Con 290 queda
  // por debajo de cualquier ventana (300 para arriba) y aparece al cerrarla.
  return (
    <div className="hay-version-nueva" role="status"
      style={{ position: "fixed", left: "50%", bottom: 14, transform: "translateX(-50%)", zIndex: 290, maxWidth: "calc(100vw - 24px)",
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: "#0F3D3E", color: "#fff", borderRadius: 10,
        padding: "9px 12px", fontFamily: "'Inter', sans-serif", fontSize: 12.5, lineHeight: 1.4, boxShadow: "0 8px 30px rgba(15,23,42,0.3)" }}>
      <span>
        <strong>Hay una versión nueva de FOREMAN.</strong> Lo que ves puede ser lo de antes.
        <span style={{ opacity: 0.75 }}> Si estás escribiendo algo, guardalo primero.</span>
      </span>
      <button className="actualizar-foreman" onClick={() => recargar({ vista: vistaRef.current })}
        style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#fff", color: "#0F3D3E", border: "none", borderRadius: 7,
          padding: "6px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
        <RefreshCw size={13} /> Actualizar
      </button>
    </div>
  );
}
