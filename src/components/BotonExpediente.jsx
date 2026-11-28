import { useState } from "react";
import { FileText } from "lucide-react";
import { abrirExpediente } from "../lib/expedienteDeTR";

// EL EXPEDIENTE DE UNA TR, a un toque (Hernán, 28/11/2026: «un PDF con toda su
// historia: orden de compra, factura, aprobación, anexos, comprobante de
// pago»). El mismo botón en el cuadro de las TR, en la factura, en la orden de
// compra y en el gasto de caja chica.

export default function BotonExpediente({ tr, texto = "Expediente PDF", estilo = null }) {
  const [estado, setEstado] = useState("");
  const [error, setError] = useState("");
  if (!(Number(tr) > 0)) return null;

  async function abrir(e) {
    e.stopPropagation();
    if (estado) return;
    setError(""); setEstado("Juntando la historia…");
    try {
      const r = await abrirExpediente(tr, { onProgreso: setEstado });
      if (r.error) setError(r.error);
      else if (r.sinPapel) setError(`Salió sin ${r.sinPapel} ${r.sinPapel === 1 ? "papel que no se pudo" : "papeles que no se pudieron"} traer.`);
    } catch (x) {
      setError("No se pudo armar el expediente: " + (x?.message || "error"));
    }
    setEstado("");
  }

  return (
    <span className="boton-expediente" style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap", ...estilo }}>
      <button onClick={abrir} disabled={!!estado} title={`Toda la historia de la TR${tr} en un PDF, con sus papeles detrás`}
        style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", padding: 0,
          cursor: estado ? "default" : "pointer", fontFamily: "var(--font)", fontSize: 11, color: "var(--brand)", textDecoration: estado ? "none" : "underline" }}>
        <FileText size={11} /> {estado || texto}
      </button>
      {error && <span style={{ fontSize: 10.5, color: "var(--danger)" }}>{error}</span>}
    </span>
  );
}
