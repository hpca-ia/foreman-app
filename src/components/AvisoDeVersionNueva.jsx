import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { hayVersionNueva, laQueCorre } from "../lib/versionNueva.js";

// «HAY UNA VERSIÓN NUEVA DE FOREMAN».
//
// Una pestaña abierta sigue con el código con que se cargó. Si mientras tanto
// se publicó un arreglo, quien la tiene abierta sigue viendo —y tocando— lo de
// antes, sin manera de saberlo (lib/versionNueva.js cuenta la tarde en que
// pasó). Esto lo dice, abajo, encima de lo que haya abierto, con el botón para
// recargar. No recarga solo: se puede estar a mitad de escribir algo.
//
// Mira cada tres minutos mientras la pestaña está a la vista, y al volver a
// ella. Una vez que avisó, no pregunta más.

const CADA = 3 * 60 * 1000;

export default function AvisoDeVersionNueva() {
  const [hay, setHay] = useState(false);

  useEffect(() => {
    // En desarrollo el código no lleva número: no hay con qué comparar.
    if (hay || !laQueCorre()) return undefined;
    let vivo = true, ultima = 0;
    const mirar = async () => {
      if (document.visibilityState !== "visible" || Date.now() - ultima < 60000) return;
      ultima = Date.now();
      if ((await hayVersionNueva()) && vivo) setHay(true);
    };
    const reloj = setInterval(mirar, CADA);
    document.addEventListener("visibilitychange", mirar);
    window.addEventListener("focus", mirar);
    return () => {
      vivo = false; clearInterval(reloj);
      document.removeEventListener("visibilitychange", mirar);
      window.removeEventListener("focus", mirar);
    };
  }, [hay]);

  if (!hay) return null;
  return (
    <div className="hay-version-nueva" role="status"
      style={{ position: "fixed", left: "50%", bottom: 14, transform: "translateX(-50%)", zIndex: 9000, maxWidth: "calc(100vw - 24px)",
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: "#0F3D3E", color: "#fff", borderRadius: 10,
        padding: "9px 12px", fontFamily: "'Inter', sans-serif", fontSize: 12.5, lineHeight: 1.4, boxShadow: "0 8px 30px rgba(15,23,42,0.3)" }}>
      <span>
        <strong>Hay una versión nueva de FOREMAN.</strong> Lo que ves puede ser lo de antes.
        <span style={{ opacity: 0.75 }}> Si estás escribiendo algo, guardalo primero.</span>
      </span>
      <button className="actualizar-foreman" onClick={() => window.location.reload()}
        style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#fff", color: "#0F3D3E", border: "none", borderRadius: 7,
          padding: "6px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
        <RefreshCw size={13} /> Actualizar
      </button>
    </div>
  );
}
